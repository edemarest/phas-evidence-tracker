import { WebSocketServer } from 'ws';
import { ghosts, evidenceTypes } from './ghostData.js';

// Use process.env.PORT for Render, fallback to 8080 for local dev
const PORT = process.env.PORT || process.env.VITE_BACKEND_PORT || 8080;

// If you want to run ws.js standalone (not recommended for Render), use this:
const wss = new WebSocketServer({ port: PORT, host: '0.0.0.0', path: '/ws' });

let sessions = {};

function getDefaultEvidenceState() {
  const state = {};
  evidenceTypes.forEach(e => { state[e] = 'blank'; });
  return state;
}

function getDefaultGhostStates() {
  const state = {};
  ghosts.forEach(g => { state[g.name] = 'none'; });
  return state;
}

// Helper to filter possible ghosts based on evidence state
function filterPossibleGhosts(evidenceState, ghosts) {
  const circled = Object.entries(evidenceState)
    .filter(([_, v]) => v === "circled")
    .map(([k]) => k);
  const crossed = Object.entries(evidenceState)
    .filter(([_, v]) => v === "crossed")
    .map(([k]) => k);

  return ghosts.filter((ghost) => {
    if (!circled.every((e) => ghost.evidences.includes(e))) return false;
    if (crossed.some((e) => ghost.evidences.includes(e))) return false;
    return true;
  });
}

function updateFinalGhost(session) {
  // Priority: circled ghost, else only one possible ghost, else null
  const circledGhost = Object.entries(session.ghostStates).find(([_, v]) => v === "circled");
  if (circledGhost) {
    session.finalGhost = circledGhost[0];
    return;
  }
  const possibleGhosts = filterPossibleGhosts(session.evidenceState, ghosts);
  if (possibleGhosts.length === 1) {
    session.finalGhost = possibleGhosts[0].name;
  } else {
    session.finalGhost = null;
  }
}

wss.on('connection', function connection(ws) {
  ws.sessionId = null;
  ws.user = null;

  ws.on('message', function incoming(message) {
    let msg;
    try {
      msg = JSON.parse(message);
    } catch (e) {
      return;
    }

    switch (msg.type) {
      case 'join':
        ws.sessionId = msg.sessionId;
        ws.user = msg.user;
        if (!sessions[ws.sessionId]) {
          sessions[ws.sessionId] = {
            evidenceState: getDefaultEvidenceState(),
            ghostStates: getDefaultGhostStates(),
            users: [],
            log: [],
            boneFound: false,
            cursedObjectFound: false,
            finalGhost: null,
          };
        }
        sessions[ws.sessionId].users.push(ws);
        updateFinalGhost(sessions[ws.sessionId]);
        ws.send(JSON.stringify({
          type: 'sync_state',
          state: sessions[ws.sessionId],
        }));
        broadcast(ws.sessionId, {
          type: 'user_joined',
          user: ws.user,
        });
        break;

      case 'evidence_update':
        if (!ws.sessionId || !sessions[ws.sessionId]) return;
        sessions[ws.sessionId].evidenceState[msg.evidence] = msg.state;
        sessions[ws.sessionId].log.push({
          user: msg.user,
          actionType: "evidence_update",
          evidence: msg.evidence,
          state: msg.state,
        });
        updateFinalGhost(sessions[ws.sessionId]);
        broadcast(ws.sessionId, {
          type: 'evidence_update',
          evidence: msg.evidence,
          state: msg.state,
          user: msg.user,
          finalGhost: sessions[ws.sessionId].finalGhost,
        });
        break;

      case 'log_action':
        if (!ws.sessionId || !sessions[ws.sessionId]) return;
        sessions[ws.sessionId].log.push({
          user: msg.user,
          action: msg.action,
          timestamp: Date.now(),
        });
        broadcast(ws.sessionId, {
          type: 'log_action',
          action: msg.action,
          user: msg.user,
        });
        break;

      case 'bone_update':
        if (!ws.sessionId || !sessions[ws.sessionId]) return;
        sessions[ws.sessionId].boneFound = msg.found;
        sessions[ws.sessionId].log.push({
          user: msg.user,
          actionType: "bone_update",
          found: msg.found,
        });
        broadcast(ws.sessionId, {
          type: 'bone_update',
          found: msg.found,
          user: msg.user,
        });
        break;

      case 'cursed_object_update':
        if (!ws.sessionId || !sessions[ws.sessionId]) return;
        sessions[ws.sessionId].cursedObjectFound = msg.found;
        sessions[ws.sessionId].log.push({
          user: msg.user,
          actionType: "cursed_object_update",
          found: msg.found,
        });
        broadcast(ws.sessionId, {
          type: 'cursed_object_update',
          found: msg.found,
          user: msg.user,
        });
        break;

      case 'ghost_state_update':
        if (!ws.sessionId || !sessions[ws.sessionId]) return;
        if (!sessions[ws.sessionId].ghostStates) {
          sessions[ws.sessionId].ghostStates = getDefaultGhostStates();
        }
        sessions[ws.sessionId].ghostStates[msg.ghostName] = msg.state;
        sessions[ws.sessionId].log.push({
          user: msg.user,
          actionType: "ghost_state_update",
          ghostName: msg.ghostName,
          state: msg.state,
        });

        // Only allow one circled ghost at a time
        if (msg.state === "circled") {
          Object.keys(sessions[ws.sessionId].ghostStates).forEach(name => {
            if (name !== msg.ghostName && sessions[ws.sessionId].ghostStates[name] === "circled") {
              sessions[ws.sessionId].ghostStates[name] = "none";
            }
          });
        }
        updateFinalGhost(sessions[ws.sessionId]);
        broadcast(ws.sessionId, {
          type: 'ghost_state_update',
          ghostName: msg.ghostName,
          state: msg.state,
          user: msg.user,
          ghostStates: sessions[ws.sessionId].ghostStates,
          finalGhost: sessions[ws.sessionId].finalGhost,
        });
        break;
      // Add more message types as needed
    }
  });

  ws.on('close', function() {
    if (ws.sessionId && sessions[ws.sessionId]) {
      sessions[ws.sessionId].users = sessions[ws.sessionId].users.filter(u => u !== ws);
      broadcast(ws.sessionId, {
        type: 'user_left',
        user: ws.user,
      });
      if (sessions[ws.sessionId].users.length === 0) {
        delete sessions[ws.sessionId];
      }
    }
  });
});

function broadcast(sessionId, msg) {
  if (!sessions[sessionId]) return;
  sessions[sessionId].users.forEach(ws => {
    try {
      ws.send(JSON.stringify(msg));
    } catch {}
  });
}

console.log(`WebSocket server running on ws://0.0.0.0:${PORT}/ws`);