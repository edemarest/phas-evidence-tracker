import express from "express";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { ghosts, evidenceTypes } from "./ghostData.js";


// --- Load environment variables ---
dotenv.config({ path: "../.env" });

// --- Initialize Express app ---
const app = express();
const port = process.env.PORT || 3001;

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

// --- Session State and Actions (Polling) ---
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
    userInfos: [],
    log: [],
    boneFound: false,
    cursedObjectFound: false,
  };
  return newId;
}

// --- REST endpoints for polling and actions ---
apiRouter.get("/session/:sessionId/state", (req, res) => {
  const { sessionId } = req.params;
  if (!sessions[sessionId]) {
    return res.status(404).json({ error: "Session not found" });
  }
  const stateToSend = { ...sessions[sessionId] };
  stateToSend.users = undefined;
  stateToSend.userInfos = undefined;
  res.json(stateToSend);
});

apiRouter.post("/session/:sessionId/action", (req, res) => {
  const { sessionId } = req.params;
  const msg = req.body;
  if (!sessions[sessionId]) {
    return res.status(404).json({ error: "Session not found" });
  }
  // Debug log every action
  console.debug(`[ACTION] Session: ${sessionId}, Type: ${msg.type}, User: ${msg.user?.username}`);
  switch (msg.type) {
    case 'evidence_update':
      handleEvidenceUpdate(sessionId, msg);
      break;
    case 'log_action':
      handleLogAction(sessionId, msg);
      break;
    case 'bone_update':
      handleBoneUpdate(sessionId, msg);
      break;
    case 'cursed_object_update':
      handleCursedObjectUpdate(sessionId, msg);
      break;
    case 'ghost_state_update':
      handleGhostStateUpdate(sessionId, msg);
      break;
    case 'reset_investigation':
      handleResetInvestigation(sessionId, msg);
      break;
    default:
      return res.status(400).json({ error: "Unknown action type" });
  }
  res.json({ ok: true });
});

// --- Session join endpoint (returns sessionId and initial state) ---
apiRouter.post("/session/join", (req, res) => {
  const { user, sessionId } = req.body;
  let requestedSessionId = sessionId;
  if (requestedSessionId === "default-session" || !requestedSessionId) {
    requestedSessionId = assignSessionForJoin();
  }
  if (!sessions[requestedSessionId]) {
    sessions[requestedSessionId] = {
      evidenceState: getDefaultEvidenceState(),
      ghostStates: getDefaultGhostStates(),
      users: [],
      userInfos: [],
      log: [],
      boneFound: false,
      cursedObjectFound: false,
    };
  }
  // Add user if not already present
  if (!sessions[requestedSessionId].userInfos.some(u => u.id === user.id)) {
    sessions[requestedSessionId].userInfos.push(user);
    sessions[requestedSessionId].users.push(user);
  }
  const stateToSend = { ...sessions[requestedSessionId] };
  stateToSend.users = undefined;
  stateToSend.userInfos = undefined;
  res.json({ sessionId: requestedSessionId, state: stateToSend });
});

// --- Action Handlers ---
function handleEvidenceUpdate(sessionId, msg) {
  const s = sessions[sessionId];
  if (!s) return;
  s.evidenceState[msg.evidence] = msg.state;
  s.log.push({
    user: msg.user,
    actionType: "evidence_update",
    evidence: msg.evidence,
    state: msg.state,
  });
}
function handleLogAction(sessionId, msg) {
  const s = sessions[sessionId];
  if (!s) return;
  s.log.push({
    user: msg.user,
    action: msg.action,
  });
}
function handleBoneUpdate(sessionId, msg) {
  const s = sessions[sessionId];
  if (!s) return;
  s.boneFound = msg.found;
  s.log.push({
    user: msg.user,
    actionType: "bone_update",
    found: msg.found,
  });
}
function handleCursedObjectUpdate(sessionId, msg) {
  const s = sessions[sessionId];
  if (!s) return;
  s.cursedObjectFound = msg.found;
  s.log.push({
    user: msg.user,
    actionType: "cursed_object_update",
    found: msg.found,
  });
}
function handleGhostStateUpdate(sessionId, msg) {
  const s = sessions[sessionId];
  if (!s) return;
  s.ghostStates[msg.ghostName] = msg.state;
  s.log.push({
    user: msg.user,
    actionType: "ghost_state_update",
    ghostName: msg.ghostName,
    state: msg.state,
  });
}
function handleResetInvestigation(sessionId, msg) {
  const s = sessions[sessionId];
  if (!s) return;
  s.evidenceState = getDefaultEvidenceState();
  s.ghostStates = getDefaultGhostStates();
  s.boneFound = false;
  s.cursedObjectFound = false;
  s.log.push({
    user: msg.user,
    action: `${msg.user.username} started a new investigation.`,
  });
}

// Attach router to BOTH /api and /.proxy/api
app.use("/api", apiRouter);
app.use("/.proxy/api", apiRouter);

// 404 Catch-all
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Start HTTP Server
app.listen(port, "0.0.0.0", () => {
  console.log(`[Server] HTTP server listening at http://0.0.0.0:${port}`);
});
let journalCounter = 1;

const SESSION_GRACE_PERIOD_MS = 15000; // 15 seconds grace period

// Track grace period timers for empty sessions
let sessionGraceTimers = {};
