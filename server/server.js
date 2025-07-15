import express from "express";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { ghosts, evidenceTypes } from "./ghostData.js";

// ================================================
// CONFIGURATION & SETUP
// ================================================

// Load environment variables from parent directory
dotenv.config({ path: "../.env" });

// Initialize Express app
const app = express();
const port = process.env.PORT || 3001;

// ================================================
// MIDDLEWARE
// ================================================

// Parse JSON request bodies
app.use(express.json());

// Debug logging for API routes only
app.use((req, res, next) => {
  if (req.originalUrl.includes("/api/")) {
    console.debug(`[API] ${req.method} ${req.originalUrl}`);
  }
  next();
});

// ================================================
// SHARED BOOK STATE MANAGEMENT
// ================================================

// Initialize default state helpers
function getDefaultEvidenceState() {
  const state = {};
  evidenceTypes.forEach(evidence => { 
    state[evidence] = 'blank'; 
  });
  return state;
}

function getDefaultGhostStates() {
  const state = {};
  ghosts.forEach(ghost => { 
    state[ghost.name] = 'none'; 
  });
  return state;
}

// Single shared book state for all users
let bookState = {
  evidenceState: getDefaultEvidenceState(),
  ghostStates: getDefaultGhostStates(),
  log: [],
  boneFound: false,
  cursedObjectFound: false,
};

// ================================================
// API ROUTER SETUP
// ================================================

// Create router for both /api/* and /.proxy/api/* endpoints
const apiRouter = express.Router();

// ================================================
// DISCORD AUTHENTICATION ENDPOINTS
// ================================================

// Exchange Discord OAuth code for access token
apiRouter.post("/token", async (req, res) => {
  console.log("[Discord Auth] Token exchange request");

  if (!req.body?.code) {
    console.warn("[Discord Auth] Missing authorization code");
    return res.status(400).json({ error: "Missing code in request body" });
  }

  try {
    // Exchange code for access token with Discord
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
      const errorText = await response.text();
      console.error("[Discord Auth] Token exchange failed:", errorText);
      return res.status(500).json({ 
        error: "Discord token exchange failed", 
        details: errorText 
      });
    }

    const tokenData = await response.json();
    if (!tokenData.access_token) {
      console.warn("[Discord Auth] No access token in response");
      return res.status(500).json({ 
        error: "No access_token in Discord response" 
      });
    }

    res.json({ access_token: tokenData.access_token });
  } catch (error) {
    console.error("[Discord Auth] Token exchange error:", error);
    res.status(500).json({ 
      error: "Internal server error", 
      details: error.message 
    });
  }
});

// Handle GET requests to token endpoint (should be POST only)
apiRouter.get("/token", (req, res) => {
  res.status(400).json({
    error: "Invalid request method. Use POST with authorization code."
  });
});

// ================================================
// GHOST DATA ENDPOINTS
// ================================================

// Get all ghost data for reference
apiRouter.get("/ghosts", (req, res) => {
  res.json(ghosts);
});

// ================================================
// BOOK STATE ENDPOINTS
// ================================================

// Get current shared book state
apiRouter.get("/book/state", (req, res) => {
  res.json(bookState);
});

// Apply user action to shared book state
apiRouter.post("/book/action", (req, res) => {
  const action = req.body;
  
  switch (action.type) {
    case 'evidence_update':
      // Update evidence state and log action
      bookState.evidenceState[action.evidence] = action.state;
      bookState.log.push({
        user: action.user,
        actionType: "evidence_update",
        evidence: action.evidence,
        state: action.state,
      });
      break;

    case 'ghost_state_update':
      // Update ghost state and log action
      bookState.ghostStates[action.ghostName] = action.state;
      bookState.log.push({
        user: action.user,
        actionType: "ghost_state_update",
        ghostName: action.ghostName,
        state: action.state,
      });
      break;

    case 'bone_update':
      // Update bone found status and log action
      bookState.boneFound = action.found;
      bookState.log.push({
        user: action.user,
        actionType: "bone_update",
        found: action.found,
      });
      break;

    case 'cursed_object_update':
      // Update cursed object found status and log action
      bookState.cursedObjectFound = action.found;
      bookState.log.push({
        user: action.user,
        actionType: "cursed_object_update",
        found: action.found,
      });
      break;

    case 'reset_investigation':
      // Reset all investigation data
      bookState.evidenceState = getDefaultEvidenceState();
      bookState.ghostStates = getDefaultGhostStates();
      bookState.boneFound = false;
      bookState.cursedObjectFound = false;
      bookState.log.push({
        user: action.user,
        action: `${action.user.username} started a new investigation.`,
      });
      break;

    case 'log_action':
      // Add custom log entry
      bookState.log.push({
        user: action.user,
        action: action.action,
      });
      break;

    default:
      return res.status(400).json({ error: "Unknown action type" });
  }

  res.json({ ok: true });
});

// Reset entire book state (admin function)
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

// ================================================
// ROUTE REGISTRATION
// ================================================

// Register API router for both standard and Discord proxy paths
app.use("/api", apiRouter);
app.use("/.proxy/api", apiRouter);

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ================================================
// SERVER STARTUP
// ================================================

app.listen(port, "0.0.0.0", () => {
  console.log(`[Server] Phasmophobia Evidence Tracker API running on http://0.0.0.0:${port}`);
  console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
});
