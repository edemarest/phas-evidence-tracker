import { WebSocketServer } from 'ws';
import { ghosts, evidenceTypes } from './ghostData.js'; // <-- create this file next

const wss = new WebSocketServer({ port: 8080, path: '/ws' });

// Session state: { [sessionId]: { evidenceState, users, log, boneFound, cursedObjectFound } }
let sessions = {};

function getDefaultEvidenceState() {
  // { evidenceType: 'blank' | 'circled' | 'crossed' }
  const state = {};
  evidenceTypes.forEach(e => { state[e] = 'blank'; });
  return state;
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

    // --- Message Handling ---

    switch (msg.type) {
      case 'join':
        // Joining a session
        // msg: { type: 'join', sessionId, user }
        ws.sessionId = msg.sessionId;
        ws.user = msg.user;
        if (!sessions[ws.sessionId]) {
          sessions[ws.sessionId] = {
            evidenceState: getDefaultEvidenceState(),
            users: [],
            log: [],
            boneFound: false,
            cursedObjectFound: false,
          };
        }
        sessions[ws.sessionId].users.push(ws);
        // Send current state to new user
        ws.send(JSON.stringify({
          type: 'sync_state',
          state: sessions[ws.sessionId],
        }));
        // Broadcast user join
        broadcast(ws.sessionId, {
          type: 'user_joined',
          user: ws.user,
        });
        break;

      case 'evidence_update':
        // Updating evidence state
        // msg: { type: 'evidence_update', evidence, state, user }
        if (!ws.sessionId || !sessions[ws.sessionId]) return;
        sessions[ws.sessionId].evidenceState[msg.evidence] = msg.state;
        // Log action
        sessions[ws.sessionId].log.push({
          user: msg.user,
          action: `${msg.user.username} set ${msg.evidence} to ${msg.state}`,
          timestamp: Date.now(),
        });
        // Broadcast update
        broadcast(ws.sessionId, {
          type: 'evidence_update',
          evidence: msg.evidence,
          state: msg.state,
          user: msg.user,
        });
        break;

      case 'log_action':
        // Logging user actions
        // msg: { type: 'log_action', action, user }
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
        // msg: { type: 'bone_update', found, user }
        if (!ws.sessionId || !sessions[ws.sessionId]) return;
        sessions[ws.sessionId].boneFound = msg.found;
        sessions[ws.sessionId].log.push({
          user: msg.user,
          action: `${msg.user.username} marked bone as ${msg.found ? 'found' : 'not found'}`,
          timestamp: Date.now(),
        });
        broadcast(ws.sessionId, {
          type: 'bone_update',
          found: msg.found,
          user: msg.user,
        });
        break;

      case 'cursed_object_update':
        // msg: { type: 'cursed_object_update', found, user }
        if (!ws.sessionId || !sessions[ws.sessionId]) return;
        sessions[ws.sessionId].cursedObjectFound = msg.found;
        sessions[ws.sessionId].log.push({
          user: msg.user,
          action: `${msg.user.username} marked cursed object as ${msg.found ? 'found' : 'not found'}`,
          timestamp: Date.now(),
        });
        broadcast(ws.sessionId, {
          type: 'cursed_object_update',
          found: msg.found,
          user: msg.user,
        });
        break;

      // Add more message types as needed
    }
  });

  ws.on('close', function() {
    // Remove user from session
    if (ws.sessionId && sessions[ws.sessionId]) {
      sessions[ws.sessionId].users = sessions[ws.sessionId].users.filter(u => u !== ws);
      broadcast(ws.sessionId, {
        type: 'user_left',
        user: ws.user,
      });
      // Optionally clean up empty sessions
      if (sessions[ws.sessionId].users.length === 0) {
        delete sessions[ws.sessionId];
      }
    }
  });
});

// Syncing state to all clients is handled by the 'broadcast' function and 'sync_state' message on join

function broadcast(sessionId, msg) {
  if (!sessions[sessionId]) return;
  sessions[sessionId].users.forEach(ws => {
    try {
      ws.send(JSON.stringify(msg));
    } catch {}
  });
}

console.log('WebSocket server running on ws://localhost:8080/ws');