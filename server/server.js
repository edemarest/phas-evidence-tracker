import express from "express";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { WebSocketServer } from "ws";
import { ghosts, evidenceTypes } from "./ghostData.js"; // Adjust path as needed

// --- Load environment variables ---
dotenv.config({ path: "../.env" });

// --- Initialize Express app ---
const app = express();
const port = 3001;

// --- Middleware ---
app.use(express.json());
// --- Debug logging middleware for API routes ---
app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/api/')) {
    console.debug(`[DEBUG] Incoming API request:`);
    console.debug(`  Method: ${req.method}`);
    console.debug(`  Full route: ${req.originalUrl}`);
    console.debug(`  Breakdown:`);
    console.debug(`    baseUrl: ${req.baseUrl}`);
    console.debug(`    path: ${req.path}`);
    console.debug(`    query:`, req.query);
    console.debug(`    body:`, req.body);
  }
  next();
});


// --- API Routes ---
app.post("/api/token", async (req, res) => {
  console.log("[/api/token] Incoming request", {
    body: req.body,
    time: new Date().toISOString(),
  });

  if (!req.body || !req.body.code) {
    console.warn("[/api/token] Missing code in request body");
    return res.status(400).json({ error: "Missing code in request body" });
  }

  try {
    const response = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.VITE_DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code: req.body.code,
        redirect_uri: process.env.VITE_PUBLIC_URL + "/",
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("[/api/token] Discord token exchange failed:", text);
      return res.status(500).json({ error: "Discord token exchange failed", details: text });
    }

    const data = await response.json();
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

// --- Catch-all 404 for any other API routes ---
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// --- Start HTTP server ---
const server = app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});

// --- WebSocket Server ---
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

function assignSessionForJoin() {
  const sessionIds = Object.keys(sessions)
    .filter(id => id.startsWith("journal-"))
    .sort((a, b) => parseInt(a.split("-")[1], 10) - parseInt(b.split("-")[1], 10));
  
  for (let id of sessionIds) {
    if (sessions[id].users.length < 4) return id;
  }

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

wss.on('connection', (ws, req) => {
  ws.sessionId = null;
  ws.user = null;
  console.log(`[WS] New connection from ${req.socket.remoteAddress}`);

  ws.on('message', (message) => {
    let msg;
    try {
      msg = JSON.parse(message);
    } catch {
      console.warn("[WS] Invalid JSON:", message);
      return;
    }

    switch (msg.type) {
      case 'join':
        handleJoin(ws, msg);
        break;
      case 'evidence_update':
        handleEvidenceUpdate(ws, msg);
        break;
      case 'log_action':
        handleLogAction(ws, msg);
        break;
      case 'bone_update':
        handleBoneUpdate(ws, msg);
        break;
      case 'cursed_object_update':
        handleCursedObjectUpdate(ws, msg);
        break;
      case 'ghost_state_update':
        handleGhostStateUpdate(ws, msg);
        break;
      default:
        console.warn("[WS] Unknown message type:", msg.type);
    }
  });

  ws.on('close', () => {
    handleDisconnect(ws);
  });
});

function handleJoin(ws, msg) {
  let requestedSessionId = msg.sessionId;
  ws.user = msg.user;

  if (requestedSessionId === "default-session") {
    requestedSessionId = assignSessionForJoin();
  }
  ws.sessionId = requestedSessionId;

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

  if (sessions[ws.sessionId].users.length >= 4) {
    ws.sessionId = assignSessionForJoin();
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
}

function handleEvidenceUpdate(ws, msg) {
  if (!validateSession(ws)) return;
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
}

function handleLogAction(ws, msg) {
  if (!validateSession(ws)) return;
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
}

function handleBoneUpdate(ws, msg) {
  if (!validateSession(ws)) return;
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
}

function handleCursedObjectUpdate(ws, msg) {
  if (!validateSession(ws)) return;
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
}

function handleGhostStateUpdate(ws, msg) {
  if (!validateSession(ws)) return;
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
}

function handleDisconnect(ws) {
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
}

function validateSession(ws) {
  return ws.sessionId && sessions[ws.sessionId];
}

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

console.log('WebSocket server running on ws://localhost:3001/ws');
