import express from "express";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { WebSocketServer } from "ws";
import { ghosts, evidenceTypes } from "./ghostData.js";
import { WebSocket } from "ws";
import http from "http";


// --- Load environment variables ---
dotenv.config({ path: "../.env" });

// --- Initialize Express app ---
const app = express();
const port = process.env.PORT || 3001; // <-- change from 3001 to 4001

// --- Middleware ---
app.use(express.json());

// --- Debug logging middleware for API routes ---
app.use((req, res, next) => {
  if (req.originalUrl.includes("/api/")) {
    console.debug(`[DEBUG] Incoming API request:`);
    console.debug(`  Method: ${req.method}`);
    console.debug(`  Full route: ${req.originalUrl}`);
    console.debug(`    baseUrl: ${req.baseUrl}`);
    console.debug(`    path: ${req.path}`);
    console.debug(`    query:`, req.query);
    console.debug(`    body:`, req.body);
  }
  next();
});

/**
 * ------------------------------------------
 * ROUTER for both /api/* and /.proxy/api/*
 * ------------------------------------------
 */

const apiRouter = express.Router();

// --- Token Exchange Route ---
apiRouter.post("/token", async (req, res) => {
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

apiRouter.get("/token", (req, res) => {
  res.status(400).json({
    error: "Invalid request. Use POST with authorization code."
  });
});

// --- Ghosts Data Route ---
apiRouter.get("/ghosts", (req, res) => {
  res.json(ghosts);
});

/**
 * Attach router to BOTH /api and /.proxy/api
 */
app.use("/api", apiRouter);
app.use("/.proxy/api", apiRouter);

app.post("/token", async (req, res) => {
  console.log("[/token] Incoming request", {
    body: req.body,
    time: new Date().toISOString(),
  });

  if (!req.body || !req.body.code) {
    console.warn("[/token] Missing code in request body");
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
      console.error("[/token] Discord token exchange failed:", text);
      return res.status(500).json({ error: "Discord token exchange failed", details: text });
    }

    const data = await response.json();
    if (!data.access_token) {
      console.warn("[/token] No access_token in Discord response", data);
      return res.status(500).json({ error: "No access_token in Discord response", details: data });
    }

    res.json({ access_token: data.access_token });
  } catch (err) {
    console.error("[/token] Error:", err);
    res.status(500).json({ error: "Internal server error", details: err.message });
  }
});

/**
 * ------------------------------------------
 * WebSocket Bridge for Discord Activity Proxy
 * ------------------------------------------
 * Must be mounted on /.proxy/api/ws
 */
app.post(["/api/ws", "/.proxy/api/ws"], async (req, res) => {
  console.debug("[/api/ws] Incoming Discord proxy POST");

  const wsUrl = `ws://localhost:${port}/ws`;
  console.debug("[/api/ws] Connecting to local WebSocket server:", wsUrl);

  const ws = new WebSocket(wsUrl);

  req.on("data", (chunk) => {
    console.debug("[/api/ws] Received chunk from Discord, forwarding to WS:", chunk.length, "bytes");
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(chunk);
    } else {
      ws.once("open", () => ws.send(chunk));
    }
  });

  

  req.on("end", () => {
    console.debug("[/api/ws] Discord request ended");
    if (ws.readyState === WebSocket.OPEN) ws.close();
  });

  ws.on("message", (data) => {
    console.debug("[/api/ws] Received message from WS, sending to Discord:", data.length, "bytes");
    res.write(data);
  });

  ws.on("close", () => {
    console.debug("[/api/ws] Local WS closed, ending HTTP response");
    res.end();
  });

  ws.on("error", (err) => {
    console.error("[/api/ws] Local WS error:", err);
    res.status(500).end();
  });

  req.on("close", () => {
    console.debug("[/api/ws] HTTP request closed by Discord");
    if (ws.readyState === WebSocket.OPEN) ws.close();
  });

  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Connection", "keep-alive");
});

/**
 * ------------------------------------------
 * 404 Catch-all
 * ------------------------------------------
 */
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

/**
 * ------------------------------------------
 * Start HTTP Server (single server for HTTP + WS)
 * ------------------------------------------
 */
const server = http.createServer(app);

server.listen(port, "0.0.0.0", () => {
  console.log(`[Server] HTTP server listening at http://0.0.0.0:${port}`);
});

/**
 * ------------------------------------------
 * WebSocket Server (attach to HTTP server)
 * ------------------------------------------
 */
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("listening", () => {
  console.log(`[Server] WebSocket server listening on ws://0.0.0.0:${port}/ws`);
});

let sessions = {};
let journalCounter = 1;

// Store user info separately for each session
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
    userInfos: [], // Store user info separately
    log: [],
    boneFound: false,
    cursedObjectFound: false,
  };
  return newId;
}

const SESSION_GRACE_PERIOD_MS = 15000; // 15 seconds grace period

// Track grace period timers for empty sessions
let sessionGraceTimers = {};

wss.on('connection', (ws, req) => {
  ws.sessionId = null;
  ws.user = null;
  console.log(`[WS] New connection from ${req.socket.remoteAddress}`);

  ws.on('message', (message) => {
    console.log("[WS] Received message:", message); // <-- Add this lineprint the join message

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
      case 'reset_investigation':
        handleResetInvestigation(ws, msg);
        break;
      default:
        console.warn("[WS] Unknown message type:", msg.type);
    }
  });

  ws.on('close', () => {
    handleDisconnect(ws);
  });
});

// --- Store { ws, user } objects in users array ---
function handleJoin(ws, msg) {
  console.log("[WS] handleJoin called with:", msg);

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
      userInfos: [], // Store user info separately
      log: [],
      boneFound: false,
      cursedObjectFound: false,
    };
  }

  if (sessions[ws.sessionId].users.length >= 4) {
    ws.sessionId = assignSessionForJoin();
  }
  sessions[ws.sessionId].users.push({ ws, user: ws.user });
  sessions[ws.sessionId].userInfos.push(ws.user);

  // Cancel grace timer if present
  if (sessionGraceTimers[ws.sessionId]) {
    clearTimeout(sessionGraceTimers[ws.sessionId]);
    delete sessionGraceTimers[ws.sessionId];
  }

  console.log("[WS] Sending sync_state to client...");
  ws.send(JSON.stringify({
    type: 'sync_state',
    state: sessions[ws.sessionId],
    sessionId: ws.sessionId,
  }));
  console.log("[WS] sync_state sent.");
  broadcast(ws.sessionId, {
    type: 'user_joined',
    user: ws.user,
  });
  console.log(`[WS] User joined: ${ws.user?.username} (session: ${ws.sessionId})`);
}

// --- Remove user info on disconnect ---
function handleDisconnect(ws) {
  if (ws.sessionId && sessions[ws.sessionId]) {
    // Remove from users array
    sessions[ws.sessionId].users = sessions[ws.sessionId].users.filter(u => u.ws !== ws);
    // Remove from userInfos array
    sessions[ws.sessionId].userInfos = sessions[ws.sessionId].userInfos.filter(u => u.id !== ws.user?.id);

    broadcast(ws.sessionId, {
      type: 'user_left',
      user: ws.user,
    });

    if (sessions[ws.sessionId].users.length === 0) {
      // Start grace period timer before deleting session
      if (!sessionGraceTimers[ws.sessionId]) {
        sessionGraceTimers[ws.sessionId] = setTimeout(() => {
          delete sessions[ws.sessionId];
          delete sessionGraceTimers[ws.sessionId];
          console.log(`[WS] Session ${ws.sessionId} deleted (empty after grace period)`);
        }, SESSION_GRACE_PERIOD_MS);
        console.log(`[WS] Session ${ws.sessionId} is empty, will delete in ${SESSION_GRACE_PERIOD_MS / 1000}s if no one rejoins.`);
      }
    }
  }
  console.log(`[WS] Connection closed for user: ${ws.user?.username}`);
}

// --- Broadcast: remove closed sockets from users array ---
function broadcast(sessionId, msg) {
  if (!sessions[sessionId]) return;
  const usersArr = sessions[sessionId].users;
  // Only keep users whose ws.send does not throw
  sessions[sessionId].users = usersArr.filter(({ ws }) => {
    try {
      ws.send(JSON.stringify(msg));
      return true;
    } catch (e) {
      console.warn("[WS] Failed to send message, removing socket:", e);
      return false;
    }
  });
  // Also clean up userInfos for closed sockets
  const activeUserIds = new Set(sessions[sessionId].users.map(u => u.user?.id));
  sessions[sessionId].userInfos = sessions[sessionId].userInfos.filter(u => activeUserIds.has(u.id));
}

// --- Prevent Express from handling /ws route (WebSocket only) ---
app._router.stack.forEach((layer) => {
  if (layer.route && layer.route.path === "/ws") {
    console.error("[FATAL] Express route for /ws detected! Remove any app.get('/ws'), app.post('/ws'), or app.use('/ws'). WebSocket upgrades will not work.");
    throw new Error("Express route for /ws detected. Remove it to allow WebSocket upgrades.");
  }
});

app.post("/api/ws", (req, res) => {
  console.log("[/api/ws] Incoming Discord proxy POST");

  const wsUrl = `ws://localhost:${port}/ws`;
  console.log("[/api/ws] Connecting to local WebSocket server:", wsUrl);

  const ws = new WebSocket(wsUrl);

  // Stream POST body → local WS
  req.on("data", (chunk) => {
    console.debug("[/api/ws] Received chunk from Discord:", chunk.length, "bytes");
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(chunk);
    } else {
      ws.once("open", () => ws.send(chunk));
    }
  });

  req.on("end", () => {
    console.debug("[/api/ws] Discord request ended");
    if (ws.readyState === WebSocket.OPEN) ws.close();
  });

  // Pipe local WS → HTTP response
  ws.on("message", (data) => {
    console.debug("[/api/ws] WS → Discord:", data.length, "bytes");
    res.write(data);
  });

  ws.on("close", () => {
    console.debug("[/api/ws] Local WS closed, ending response");
    res.end();
  });

  ws.on("error", (err) => {
    console.error("[/api/ws] Local WS error:", err);
    res.status(500).end();
  });

  req.on("close", () => {
    console.debug("[/api/ws] HTTP request closed by Discord");
    if (ws.readyState === WebSocket.OPEN) ws.close();
  });

  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Connection", "keep-alive");
});

console.log('WebSocket server running on ws://localhost:3001/ws');

server.on('upgrade', (req, socket, head) => {
  console.log("[Server] HTTP upgrade event for WebSocket");
});

// --- Prevent Express from handling /ws route (WebSocket only) ---
app._router.stack.forEach((layer) => {
  if (layer.route && layer.route.path === "/ws") {
    console.error("[FATAL] Express route for /ws detected! Remove any app.get('/ws'), app.post('/ws'), or app.use('/ws'). WebSocket upgrades will not work.");
    throw new Error("Express route for /ws detected. Remove it to allow WebSocket upgrades.");
  }
});

app.post("/api/ws", (req, res) => {
  console.log("[/api/ws] Incoming Discord proxy POST");

  const wsUrl = `ws://localhost:${port}/ws`;
  console.log("[/api/ws] Connecting to local WebSocket server:", wsUrl);

  const ws = new WebSocket(wsUrl);

  // Stream POST body → local WS
  req.on("data", (chunk) => {
    console.debug("[/api/ws] Received chunk from Discord:", chunk.length, "bytes");
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(chunk);
    } else {
      ws.once("open", () => ws.send(chunk));
    }
  });

  req.on("end", () => {
    console.debug("[/api/ws] Discord request ended");
    if (ws.readyState === WebSocket.OPEN) ws.close();
  });

  // Pipe local WS → HTTP response
  ws.on("message", (data) => {
    console.debug("[/api/ws] WS → Discord:", data.length, "bytes");
    res.write(data);
  });

  ws.on("close", () => {
    console.debug("[/api/ws] Local WS closed, ending response");
    res.end();
  });

  ws.on("error", (err) => {
    console.error("[/api/ws] Local WS error:", err);
    res.status(500).end();
  });

  req.on("close", () => {
    console.debug("[/api/ws] HTTP request closed by Discord");
    if (ws.readyState === WebSocket.OPEN) ws.close();
  });

  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Connection", "keep-alive");
});

console.log('WebSocket server running on ws://localhost:3001/ws');

server.on('upgrade', (req, socket, head) => {
  console.log("[Server] HTTP upgrade event for WebSocket");
});
