import express from "express";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { WebSocketServer } from "ws";
import { ghosts, evidenceTypes } from "./ghostData.js"; // adjust path as needed

dotenv.config({ path: "../.env" });

const app = express();
const port = 3001;

// Allow express to parse JSON bodies
app.use(express.json());

// --- API ROUTES ---
app.post("/api/token", async (req, res) => {
  console.log("[/api/token] Incoming request", {
    method: req.method,
    url: req.originalUrl,
    headers: req.headers,
    body: req.body,
    time: new Date().toISOString(),
  });
  try {
    if (!req.body || !req.body.code) {
      console.warn("[/api/token] Missing code in request body");
      return res.status(400).json({ error: "Missing code in request body" });
    }

    const response = await fetch(`https://discord.com/api/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.VITE_DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code: req.body.code,
        redirect_uri: process.env.VITE_PUBLIC_URL + "/.proxy/oauth2/authorize",
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("[/api/token] Discord token exchange failed:", text);
      // Always return valid JSON
      return res.status(500).json({ error: "Discord token exchange failed", details: text });
    }

    let data;
    try {
      data = await response.json();
    } catch (err) {
      const text = await response.text();
      console.error("[/api/token] Failed to parse Discord response as JSON:", err, text);
      return res.status(500).json({ error: "Discord response not JSON", details: text });
    }

    if (!data.access_token) {
      console.warn("[/api/token] No access_token in Discord response", data);
      return res.status(500).json({ error: "No access_token in Discord response", details: data });
    }

    res.json({ access_token: data.access_token });
  } catch (err) {
    console.error("[/api/token] Error in /api/token:", err);
    res.status(500).json({ error: "Internal server error", details: err.message });
  }
});

// Add this route to support Discord's forced proxy mapping:
app.post("/.proxy/api/token", async (req, res) => {
  req.url = "/api/token";
  app._router.handle(req, res);
});

// --- Start HTTP server ---
const server = app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});

// --- Attach WebSocket server to the same HTTP server ---
const wss = new WebSocketServer({ server, path: "/ws" });

let sessions = {};
let journalCounter = 1;

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

// Helper to find or create a session for joining
function assignSessionForJoin() {
  // Find the latest session with <4 users
  let sessionIds = Object.keys(sessions)
    .filter(id => id.startsWith("journal-"))
    .sort((a, b) => {
      // Sort numerically by journal number
      const na = parseInt(a.split("-")[1], 10);
      const nb = parseInt(b.split("-")[1], 10);
      return na - nb;
    });
  for (let id of sessionIds) {
    if (sessions[id].users.length < 4) {
      return id;
    }
  }
  // None found, create a new one
  const newId = `journal-${journalCounter++}`;
  sessions[newId] = {
    evidenceState: getDefaultEvidenceState(),
    ghostStates: getDefaultGhostStates(),
    users: [],
    log: [],
    boneFound: false,
    cursedObjectFound: false,
  };
  return newId;
}

wss.on('connection', function connection(ws, req) {
  ws.sessionId = null;
  ws.user = null;
  console.log(`[WS] New connection from ${req.socket.remoteAddress}`);

  ws.on('message', function incoming(message) {
    let msg;
    try { msg = JSON.parse(message); } catch (e) { console.warn("[WS] Invalid JSON:", message); return; }
    console.log(`[WS] Received:`, msg);

    switch (msg.type) {
      case 'join': {
        let requestedSessionId = msg.sessionId;
        ws.user = msg.user;

        // If client requests "default-session", assign to a real session
        if (requestedSessionId === "default-session") {
          requestedSessionId = assignSessionForJoin();
        }

        ws.sessionId = requestedSessionId;

        // Create session if it doesn't exist (for custom session IDs)
        if (!sessions[ws.sessionId]) {
          sessions[ws.sessionId] = {
            evidenceState: getDefaultEvidenceState(),
            ghostStates: getDefaultGhostStates(),
            users: [],
            log: [],
            boneFound: false,
            cursedObjectFound: false,
          };
        }

        // If session is full, assign to a new session
        if (sessions[ws.sessionId].users.length >= 4) {
          ws.sessionId = assignSessionForJoin();
          if (!sessions[ws.sessionId]) {
            sessions[ws.sessionId] = {
              evidenceState: getDefaultEvidenceState(),
              ghostStates: getDefaultGhostStates(),
              users: [],
              log: [],
              boneFound: false,
              cursedObjectFound: false,
            };
          }
        }

        sessions[ws.sessionId].users.push(ws);
        ws.send(JSON.stringify({
          type: 'sync_state',
          state: sessions[ws.sessionId],
          sessionId: ws.sessionId,
        }));
        broadcast(ws.sessionId, {
          type: 'user_joined',
          user: ws.user,
        });
        console.log(`[WS] User joined: ${ws.user?.username} (session: ${ws.sessionId})`);
        break;
      }
      case 'evidence_update':
        if (!ws.sessionId || !sessions[ws.sessionId]) return;
        sessions[ws.sessionId].evidenceState[msg.evidence] = msg.state;
        sessions[ws.sessionId].log.push({
          user: msg.user,
          actionType: "evidence_update",
          evidence: msg.evidence,
          state: msg.state,
        });
        broadcast(ws.sessionId, {
          type: 'evidence_update',
          evidence: msg.evidence,
          state: msg.state,
          user: msg.user,
        });
        console.log(`[WS] Evidence update: ${msg.user?.username} set ${msg.evidence} to ${msg.state}`);
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
        console.log(`[WS] Log action: ${msg.action}`);
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
        console.log(`[WS] Bone update: ${msg.user?.username} marked bone as ${msg.found ? "found" : "not found"}`);
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
        console.log(`[WS] Cursed object update: ${msg.user?.username} marked cursed object as ${msg.found ? "found" : "not found"}`);
        break;
      case 'ghost_state_update':
        if (!ws.sessionId || !sessions[ws.sessionId]) return;
        sessions[ws.sessionId].ghostStates[msg.ghostName] = msg.state;
        sessions[ws.sessionId].log.push({
          user: msg.user,
          actionType: "ghost_state_update",
          ghostName: msg.ghostName,
          state: msg.state,
        });
        broadcast(ws.sessionId, {
          type: 'ghost_state_update',
          ghostName: msg.ghostName,
          state: msg.state,
          user: msg.user,
        });
        console.log(`[WS] Ghost state update: ${msg.user?.username} set ${msg.ghostName} to ${msg.state}`);
        break;
      default:
        console.warn("[WS] Unknown message type:", msg.type);
        break;
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
        console.log(`[WS] Session ${ws.sessionId} deleted (empty)`);
      }
    }
    console.log(`[WS] Connection closed for user: ${ws.user?.username}`);
  });
});

console.log('WebSocket server running on ws://localhost:3001/ws');
function broadcast(sessionId, msg) {
  if (!sessions[sessionId]) return;
  sessions[sessionId].users.forEach(ws => {
    try {
      ws.send(JSON.stringify(msg));
    } catch (e) {
      console.warn("[WS] Failed to send message:", e);
    }
  });
}

// Add at the very end, after all other routes:
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});
