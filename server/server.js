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

/* =========================
   Discord Token Endpoints
   ========================= */
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

/* =========================
   Ghosts Data Endpoint
   ========================= */
apiRouter.get("/ghosts", (req, res) => {
  res.json(ghosts);
});

/* =========================
   Book State Helpers
   ========================= */
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

/* =========================
   Single Shared Book State
   ========================= */
let bookState = {
  evidenceState: getDefaultEvidenceState(),
  ghostStates: getDefaultGhostStates(),
  log: [],
  boneFound: false,
  cursedObjectFound: false,
};

/* =========================
   Book State Endpoints
   ========================= */

// Get current book state
apiRouter.get("/book/state", (req, res) => {
  res.json(bookState);
});

// Apply an action to the book state
apiRouter.post("/book/action", (req, res) => {
  const msg = req.body;
  switch (msg.type) {
    case 'evidence_update':
      bookState.evidenceState[msg.evidence] = msg.state;
      bookState.log.push({
        user: msg.user,
        actionType: "evidence_update",
        evidence: msg.evidence,
        state: msg.state,
      });
      break;
    case 'log_action':
      bookState.log.push({
        user: msg.user,
        action: msg.action,
      });
      break;
    case 'bone_update':
      bookState.boneFound = msg.found;
      bookState.log.push({
        user: msg.user,
        actionType: "bone_update",
        found: msg.found,
      });
      break;
    case 'cursed_object_update':
      bookState.cursedObjectFound = msg.found;
      bookState.log.push({
        user: msg.user,
        actionType: "cursed_object_update",
        found: msg.found,
      });
      break;
    case 'ghost_state_update':
      bookState.ghostStates[msg.ghostName] = msg.state;
      bookState.log.push({
        user: msg.user,
        actionType: "ghost_state_update",
        ghostName: msg.ghostName,
        state: msg.state,
      });
      break;
    case 'reset_investigation':
      bookState.evidenceState = getDefaultEvidenceState();
      bookState.ghostStates = getDefaultGhostStates();
      bookState.boneFound = false;
      bookState.cursedObjectFound = false;
      bookState.log.push({
        user: msg.user,
        action: `${msg.user.username} started a new investigation.`,
      });
      break;
    default:
      return res.status(400).json({ error: "Unknown action type" });
  }
  res.json({ ok: true });
});

// Reset the book state
apiRouter.post("/book/reset", (req, res) => {
  bookState = {
    evidenceState: getDefaultEvidenceState(),
    ghostStates: getDefaultGhostStates(),
    log: [],
    boneFound: false,
    cursedObjectFound: false,
  };
  res.json({ ok: true });
});

/* =========================
   Attach Routers and 404
   ========================= */
app.use("/api", apiRouter);
app.use("/.proxy/api", apiRouter);

// 404 Catch-all (must be last!)
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

/* =========================
   Start HTTP Server
   ========================= */
app.listen(port, "0.0.0.0", () => {
  console.log(`[Server] HTTP server listening at http://0.0.0.0:${port}`);
});
