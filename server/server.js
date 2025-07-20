import express from "express";
import dotenv from "dotenv";
import fetch from "node-fetch";
import cors from "cors"; // <-- Add this import
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

// Add CORS middleware before all routes
app.use(cors({
  origin: "https://phas-evidence-tracker.onrender.com", // Allow your frontend domain
  credentials: true, // If you use cookies/auth
}));

// Debug logging for API routes only
app.use((req, res, next) => {
  // Only log important API requests (session create/join, errors)
  if (req.originalUrl.includes("/api/session/create") || req.originalUrl.includes("/api/session/join")) {
    console.info(`[API] ${req.method} ${req.originalUrl}`);
    console.info(`[API] Headers:`, req.headers);
    if (req.method === "POST") {
      console.info(`[API] Body:`, req.body);
    }
  }
  next();
});

// ================================================
// SESSION-SCOPED BOOK STATE MANAGEMENT
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

// Session-scoped book states (sessionId -> bookState)
const sessionStates = {};

// Track active users per session (sessionId -> Set of userId)
const sessionUsers = {};

// Discord session cleanup timers
const discordSessionCleanupTimers = new Map();

// Helper to get or create session state
function getSessionState(sessionId) {
  if (!sessionStates[sessionId]) {
    sessionStates[sessionId] = {
      evidenceState: getDefaultEvidenceState(),
      ghostStates: getDefaultGhostStates(),
      log: [],
      boneFound: false,
      cursedPossession: "",
      lastAccessed: Date.now(),
      createdAt: Date.now(),
    };
    sessionUsers[sessionId] = new Set();
  } else {
    // Update last accessed time
    sessionStates[sessionId].lastAccessed = Date.now();
  }
  return sessionStates[sessionId];
}

// Helper to add user to session
function addUserToSession(sessionId, userId) {
  if (!sessionUsers[sessionId]) {
    sessionUsers[sessionId] = new Set();
  }
  sessionUsers[sessionId].add(userId);
}

// Helper to remove user from session
function removeUserFromSession(sessionId, userId) {
  if (sessionUsers[sessionId]) {
    sessionUsers[sessionId].delete(userId);
    
    // If no users left, mark session for cleanup
    if (sessionUsers[sessionId].size === 0) {
      console.log(`[Session] No users left in session ${sessionId}, marking for cleanup`);
    }
  }
}

// ================================================
// DISCORD SESSION MANAGEMENT
// ================================================

// Helper to find existing Discord session by instance ID
function findSessionByDiscordInstance(instanceId) {
  for (const [sessionId, sessionState] of Object.entries(sessionStates)) {
    if (sessionState.discordInstanceId === instanceId) {
      return sessionId;
    }
  }
  return null;
}

// Helper to create or get Discord session
function getOrCreateDiscordSession(instanceId, participants) {
  console.log(`[Discord] Getting/creating session for instance: ${instanceId} with ${participants.length} participants`);
  
  // Check if session already exists for this Discord activity
  let sessionId = findSessionByDiscordInstance(instanceId);
  
  if (!sessionId) {
    // Create new session using Discord instance ID as base
    sessionId = `discord-${instanceId}`;
    console.log(`[Discord] Creating new Discord session: ${sessionId}`);
    
    sessionStates[sessionId] = {
      evidenceState: getDefaultEvidenceState(),
      ghostStates: getDefaultGhostStates(),
      log: [],
      boneFound: false,
      cursedPossession: "",
      sessionType: 'discord',
      discordInstanceId: instanceId,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
    };
    sessionUsers[sessionId] = new Set();
  } else {
    console.log(`[Discord] Using existing Discord session: ${sessionId}`);
    // Update last accessed time
    sessionStates[sessionId].lastAccessed = Date.now();
  }
  
  // Sync all current participants
  syncDiscordParticipants(sessionId, participants);
  
  return sessionId;
}

// Helper to sync Discord participants with session
function syncDiscordParticipants(sessionId, participants) {
  console.log(`[Discord] Syncing ${participants.length} participants for session ${sessionId}`);
  
  if (!sessionUsers[sessionId]) {
    sessionUsers[sessionId] = new Set();
  }
  
  // Clear existing participants and add current ones
  sessionUsers[sessionId].clear();
  participants.forEach(participant => {
    const userId = JSON.stringify({
      username: participant.username,
      discordId: participant.id,
      isDiscordUser: true
    });
    sessionUsers[sessionId].add(userId);
  });
  
  // Update session activity
  if (sessionStates[sessionId]) {
    sessionStates[sessionId].lastAccessed = Date.now();
  }
  
  // Handle session cleanup if no participants
  if (participants.length === 0) {
    scheduleDiscordSessionCleanup(sessionId);
  } else {
    // Cancel any pending cleanup if users rejoined
    if (discordSessionCleanupTimers.has(sessionId)) {
      clearTimeout(discordSessionCleanupTimers.get(sessionId));
      discordSessionCleanupTimers.delete(sessionId);
      console.log(`[Discord] Cancelled cleanup for session ${sessionId} - users rejoined`);
    }
  }
}

// Helper to schedule Discord session cleanup with grace period
function scheduleDiscordSessionCleanup(sessionId) {
  // Cancel any existing cleanup timer
  if (discordSessionCleanupTimers.has(sessionId)) {
    clearTimeout(discordSessionCleanupTimers.get(sessionId));
  }
  
  console.log(`[Discord] Scheduling cleanup for empty session ${sessionId} in 30 seconds`);
  
  // Give 30 seconds grace period for users to rejoin
  const timer = setTimeout(() => {
    if (sessionUsers[sessionId]?.size === 0) {
      console.log(`[Discord] Cleaning up empty Discord session: ${sessionId}`);
      delete sessionStates[sessionId];
      delete sessionUsers[sessionId];
      discordSessionCleanupTimers.delete(sessionId);
    }
  }, 30000);
  
  discordSessionCleanupTimers.set(sessionId, timer);
}

// Helper to get active user count for session
function getSessionUserCount(sessionId) {
  return sessionUsers[sessionId] ? sessionUsers[sessionId].size : 0;
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
    // Must have all circled evidence
    if (!circled.every((e) => ghost.evidences.includes(e))) return false;
    // Must not have any crossed evidence
    if (crossed.some((e) => ghost.evidences.includes(e))) return false;
    return true;
  });
}

// Helper to determine final ghost based on evidence and ghost states
function getFinalGhost(evidenceState, ghostStates, ghosts) {
  // Priority: circled ghost, else only one possible ghost, else null
  const circledGhost = Object.entries(ghostStates).find(([_, v]) => v === "circled");
  if (circledGhost) {
    return circledGhost[0];
  }
  
  const possibleGhosts = filterPossibleGhosts(evidenceState, ghosts);
  if (possibleGhosts.length === 1) {
    return possibleGhosts[0].name;
  }
  
  return null;
}

// Optional: Clean up old sessions (older than 24 hours)
function cleanupOldSessions() {
  const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
  let cleanedCount = 0;
  
  for (const [sessionId, state] of Object.entries(sessionStates)) {
    if (state.lastAccessed < cutoffTime) {
      delete sessionStates[sessionId];
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.info(`[Cleanup] Removed ${cleanedCount} old sessions`);
  }
}

// Run cleanup every hour
setInterval(cleanupOldSessions, 60 * 60 * 1000);

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
// DISCORD SESSION MANAGEMENT ENDPOINTS
// ================================================

// Discord auto-join session endpoint
apiRouter.post("/sessions/discord-auto-join", (req, res) => {
  const { instanceId, currentUser, allParticipants } = req.body;
  
  if (!instanceId || !currentUser || !Array.isArray(allParticipants)) {
    console.warn("[Discord] Invalid auto-join request - missing required fields");
    return res.status(400).json({ 
      error: "Missing required fields: instanceId, currentUser, allParticipants" 
    });
  }
  
  console.log(`[Discord] Auto-join request for instance ${instanceId} with ${allParticipants.length} participants`);
  
  try {
    // Get or create Discord session
    const sessionId = getOrCreateDiscordSession(instanceId, allParticipants);
    const sessionState = getSessionState(sessionId);
    
    // Determine if this was a new session
    const isNewSession = Date.now() - sessionState.createdAt < 5000; // Created within last 5 seconds
    
    // Format participants for response
    const participants = allParticipants.map(p => ({
      username: p.username,
      discordId: p.id,
      isDiscordUser: true,
      isCurrentUser: p.id === currentUser.discordId
    }));
    
    console.log(`[Discord] Auto-join successful - session: ${sessionId}, isNew: ${isNewSession}`);
    
    res.json({
      sessionId,
      sessionState: {
        evidenceState: sessionState.evidenceState,
        ghostStates: sessionState.ghostStates,
        log: sessionState.log,
        boneFound: sessionState.boneFound,
        cursedPossession: sessionState.cursedPossession
      },
      participants,
      isNewSession
    });
  } catch (error) {
    console.error("[Discord] Auto-join error:", error);
    res.status(500).json({ 
      error: "Failed to create/join Discord session", 
      details: error.message 
    });
  }
});

// Discord participant sync endpoint
apiRouter.post("/sessions/discord-sync-participants", (req, res) => {
  const { instanceId, participants, joined, left } = req.body;
  
  if (!instanceId || !Array.isArray(participants)) {
    console.warn("[Discord] Invalid sync request - missing required fields");
    return res.status(400).json({ 
      error: "Missing required fields: instanceId, participants" 
    });
  }
  
  console.log(`[Discord] Sync request for instance ${instanceId}: ${participants.length} total, ${joined?.length || 0} joined, ${left?.length || 0} left`);
  
  try {
    // Find existing session by Discord instance
    const sessionId = findSessionByDiscordInstance(instanceId);
    
    if (!sessionId) {
      console.warn(`[Discord] No session found for instance ${instanceId} during sync`);
      return res.status(404).json({ 
        error: "No session found for Discord instance",
        sessionActive: false,
        participantCount: 0
      });
    }
    
    // Sync participants
    syncDiscordParticipants(sessionId, participants);
    
    const sessionActive = participants.length > 0;
    
    if (!sessionActive) {
      console.log(`[Discord] Session ${sessionId} marked inactive - no participants remaining`);
    }
    
    res.json({
      sessionActive,
      participantCount: participants.length
    });
  } catch (error) {
    console.error("[Discord] Participant sync error:", error);
    res.status(500).json({ 
      error: "Failed to sync Discord participants", 
      details: error.message 
    });
  }
});

// ================================================
// SESSION MANAGEMENT ENDPOINTS
// ================================================

// Generate a new session code
apiRouter.post("/session/create", (req, res) => {
  console.info(`[Session] [CREATE] Received POST /session/create`);
  try {
    // Generate a unique 6-character session code
    const sessionCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const sessionId = `session-${sessionCode}`;
    
    console.info(`[Session] [CREATE] Creating new session with code: ${sessionCode}`);
    
    // Initialize the session state
    getSessionState(sessionId);
    
    console.info(`[Session] [CREATE] Responding with:`, { sessionCode, sessionId });
    res.json({ 
      sessionCode,
      sessionId 
    });
  } catch (error) {
    console.error("[Session] Create error:", error);
    res.status(500).json({ 
      error: "Failed to create session", 
      details: error.message 
    });
  }
});

// Validate and join an existing session
apiRouter.post("/session/join", (req, res) => {
  console.info(`[Session] [JOIN] Received POST /session/join`);
  try {
    const { sessionCode } = req.body;
    
    if (!sessionCode) {
      return res.status(400).json({ 
        error: "Session code is required" 
      });
    }
    
    const sessionId = `session-${sessionCode.toUpperCase()}`;
    
    // Check if session exists
    if (!sessionStates[sessionId]) {
      console.log(`[Session] Attempt to join non-existent session: ${sessionCode}`);
      return res.status(404).json({ 
        error: "Session not found",
        message: "The session code you entered does not exist or has expired."
      });
    }
    
    // Update last accessed time
    sessionStates[sessionId].lastAccessed = Date.now();
    
    console.log(`[Session] [JOIN] User joining existing session: ${sessionCode}`);
    
    console.info(`[Session] [JOIN] Responding with:`, { sessionCode, sessionId });
    res.json({ 
      sessionCode,
      sessionId,
      message: "Successfully joined session"
    });
  } catch (error) {
    console.error("[Session] Join error:", error);
    res.status(500).json({ 
      error: "Failed to join session", 
      details: error.message 
    });
  }
});

// Get session info (optional endpoint for debugging)
apiRouter.get("/session/:sessionId/info", (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessionState = sessionStates[sessionId];
    
    if (!sessionState) {
      return res.status(404).json({ 
        error: "Session not found" 
      });
    }
    
    res.json({
      sessionId,
      lastAccessed: sessionState.lastAccessed,
      logEntries: sessionState.log.length,
      evidenceCount: Object.values(sessionState.evidenceState).filter(v => v !== 'blank').length,
      ghostStatesCount: Object.values(sessionState.ghostStates).filter(v => v !== 'none').length
    });
  } catch (error) {
    console.error("[Session] Info error:", error);
    res.status(500).json({ 
      error: "Failed to get session info", 
      details: error.message 
    });
  }
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

// Get current session book state
apiRouter.get("/book/state", (req, res) => {
  const sessionId = req.query.sessionId || "default-session";
  const userId = req.query.userId || req.query.user || "anonymous";
  const sessionState = getSessionState(sessionId);
  
  // Track this user as active in the session
  addUserToSession(sessionId, userId);
  
  // Compute possible ghosts and final ghost based on current evidence
  const possibleGhosts = filterPossibleGhosts(sessionState.evidenceState, ghosts);
  const finalGhost = getFinalGhost(sessionState.evidenceState, sessionState.ghostStates, ghosts);
  
  // Get active users in this session
  const activeUsers = sessionUsers[sessionId] ? Array.from(sessionUsers[sessionId]) : [];
  
  // Format users for Discord vs manual sessions
  let participants = [];
  if (sessionState.sessionType === 'discord') {
    participants = activeUsers.map(userStr => {
      try {
        const user = JSON.parse(userStr);
        return {
          username: user.username,
          discordId: user.discordId,
          isDiscordUser: true,
          isCurrentUser: user.discordId === userId // For Discord, userId might be discordId
        };
      } catch (e) {
        return {
          username: userStr,
          isDiscordUser: false,
          isCurrentUser: userStr === userId
        };
      }
    });
  } else {
    participants = activeUsers.map(userStr => {
      try {
        const user = JSON.parse(userStr);
        return {
          username: user.username,
          isDiscordUser: false,
          isCurrentUser: user.username === userId
        };
      } catch (e) {
        return {
          username: userStr,
          isDiscordUser: false,
          isCurrentUser: userStr === userId
        };
      }
    });
  }
  
  res.json({
    ...sessionState,
    // Remove deprecated cursedObjectFound if present
    cursedPossession: sessionState.cursedPossession,
    possibleGhosts,
    finalGhost,
    activeUsers,
    participants,
    sessionType: sessionState.sessionType || 'manual',
    discordInstanceId: sessionState.discordInstanceId
  });
  console.log('[DEBUG] Responding with sessionState.cursedPossession:', sessionState.cursedPossession);
});

// Apply user action to session book state
apiRouter.post("/book/action", (req, res) => {
  const action = req.body;
  const sessionId = action.sessionId || "default-session";
  const userId = action.user?.id || action.user?.username || "anonymous";
  const sessionState = getSessionState(sessionId);
  
  // Track this user as active in the session
  addUserToSession(sessionId, userId);
  
  switch (action.type) {
    case 'evidence_update':
      // Update evidence state and log action
      sessionState.evidenceState[action.evidence] = action.state;
      sessionState.log.push({
        user: action.user,
        actionType: "evidence_update",
        evidence: action.evidence,
        state: action.state,
      });
      break;

    case 'ghost_state_update':
      // Update ghost state and log action
      sessionState.ghostStates[action.ghostName] = action.state;
      sessionState.log.push({
        user: action.user,
        actionType: "ghost_state_update",
        ghostName: action.ghostName,
        state: action.state,
      });
      break;

    case 'bone_update':
      // Update bone found status and log action
      sessionState.boneFound = action.found;
      sessionState.log.push({
        user: action.user,
        actionType: "bone_update",
        found: action.found,
      });
      break;

    case 'cursed_object_update':
      // Update cursed possession selection and log action
      // Accepts value (string) or empty string for none
      console.log('[DEBUG] Received cursed_object_update:', action.possession);
      const prevPossession = sessionState.cursedPossession || "None";
      const newPossession = typeof action.possession === "string" && action.possession.length > 0
        ? action.possession
        : "None";
      sessionState.cursedPossession = newPossession;
      console.log('[DEBUG] Updated sessionState.cursedPossession:', sessionState.cursedPossession);
      // Always push a new log entry, even if value is unchanged
      sessionState.log.push({
        user: action.user,
        actionType: "cursed_object_update",
        possession: newPossession,
        prevPossession,
        timestamp: Date.now(),
      });
      break;

    case 'reset_investigation':
      // Reset all investigation data for this session
      sessionState.evidenceState = getDefaultEvidenceState();
      sessionState.ghostStates = getDefaultGhostStates();
      sessionState.boneFound = false;
      sessionState.cursedPossession = "";
      sessionState.log.push({
        user: action.user,
        action: `${action.user.username} started a new investigation.`,
      });
      break;

    case 'log_action':
      // Add custom log entry
      sessionState.log.push({
        user: action.user,
        action: action.action,
      });
      break;

    default:
      return res.status(400).json({ error: "Unknown action type" });
  }

  res.json({ ok: true });
});

// Reset entire session book state (admin function)
apiRouter.post("/book/reset", (req, res) => {
  const sessionId = req.body.sessionId || "default-session";
  sessionStates[sessionId] = {
    evidenceState: getDefaultEvidenceState(),
    ghostStates: getDefaultGhostStates(),
    log: [],
    boneFound: false,
    cursedPossession: "",
  };
  res.json({ ok: true });
});

// ================================================
// ROUTE REGISTRATION
// ================================================

// Register API router for both standard and Discord proxy paths
app.use("/api", apiRouter);
app.use("/.proxy/api", apiRouter);

// 404 handler for unknown API routes
app.use((req, res, next) => {
  if (req.originalUrl.startsWith("/api") || req.originalUrl.startsWith("/.proxy/api")) {
    console.warn(`[API] 404 Not Found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ error: "Not found" });
  } else {
    next();
  }
});

// Catch-all for non-API requests (should not happen for API calls)
app.use((req, res) => {
  console.warn(`[NON-API] Request received: ${req.method} ${req.originalUrl}`);
  console.warn(`[NON-API] Headers:`, req.headers);
  res.status(404).send("Not found (non-API route)");
});

// ================================================
// USER DISCONNECT ENDPOINT
// ================================================

// Explicit user disconnect from session
apiRouter.post("/session/disconnect", (req, res) => {
  try {
    const { sessionId, userId } = req.body;
    
    if (!sessionId || !userId) {
      return res.status(400).json({ 
        error: "Session ID and User ID are required" 
      });
    }
    
    removeUserFromSession(sessionId, userId);
    
    res.json({ 
      message: "Successfully disconnected from session",
      sessionId,
      userId
    });
  } catch (error) {
    console.error("[Session] Disconnect error:", error);
    res.status(500).json({ 
      error: "Failed to disconnect from session", 
      details: error.message 
    });
  }
});

// ================================================
// SESSION CLEANUP
// ================================================

// Clean up inactive sessions and sessions with no users
function cleanupInactiveSessions() {
  const now = Date.now();
  const maxAge = 2 * 60 * 60 * 1000; // 2 hours in milliseconds (reduced from 24 hours)
  const maxEmptyAge = 10 * 60 * 1000; // 10 minutes for empty sessions
  
  const sessionIds = Object.keys(sessionStates);
  let cleanedCount = 0;
  let emptySessionsCount = 0;
  
  sessionIds.forEach(sessionId => {
    const session = sessionStates[sessionId];
    const userCount = getSessionUserCount(sessionId);
    const timeSinceLastAccess = now - session.lastAccessed;
    
    let shouldCleanup = false;
    let reason = "";
    
    // Cleanup old sessions
    if (timeSinceLastAccess > maxAge) {
      shouldCleanup = true;
      reason = "inactive for > 2 hours";
    }
    // Cleanup empty sessions after 10 minutes
    else if (userCount === 0 && timeSinceLastAccess > maxEmptyAge) {
      shouldCleanup = true;
      reason = "no users for > 10 minutes";
      emptySessionsCount++;
    }
    
    if (shouldCleanup) {
      console.log(`[Cleanup] Removing session ${sessionId} (${reason})`);
      delete sessionStates[sessionId];
      delete sessionUsers[sessionId];
      cleanedCount++;
    }
  });
  
  if (cleanedCount > 0) {
    console.info(`[Cleanup] Removed ${cleanedCount} sessions (${emptySessionsCount} empty, ${cleanedCount - emptySessionsCount} inactive)`);
    console.info(`[Cleanup] Active sessions remaining: ${Object.keys(sessionStates).length}`);
  }
}

// Run cleanup every 5 minutes for more responsive cleanup
setInterval(cleanupInactiveSessions, 5 * 60 * 1000);

// Clean up user tracking for stale connections every 30 minutes
function cleanupStaleUsers() {
  const now = Date.now();
  const maxUserAge = 30 * 60 * 1000; // 30 minutes without activity
  
  let staleUsersCount = 0;
  
  Object.keys(sessionUsers).forEach(sessionId => {
    const session = sessionStates[sessionId];
    if (!session) {
      // Session no longer exists, clean up user tracking
      delete sessionUsers[sessionId];
  return {
    evidenceState: getDefaultEvidenceState(),
    ghostStates: getDefaultGhostStates(),
    boneFound: false,
    cursedPossession: "",
    log: [],
  };
      if (userCount > 0) {
        console.log(`[Cleanup] Clearing ${userCount} stale users from session ${sessionId}`);
        sessionUsers[sessionId].clear();
        staleUsersCount += userCount;
      }
    }
  });
  
  if (staleUsersCount > 0) {
    console.info(`[Cleanup] Removed ${staleUsersCount} stale user connections`);
  }
}

setInterval(cleanupStaleUsers, 30 * 60 * 1000);

// ================================================
// SERVER STARTUP
// ================================================

app.listen(port, "0.0.0.0", () => {
  console.info(`[Server] Phasmophobia Evidence Tracker API running on http://0.0.0.0:${port}`);
  console.info(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
  console.info(`[Server] Session management enabled`);
  console.info(`[Server] Session cleanup interval: 1 hour`);
  console.info(`[Server] Session max age: 24 hours`);
});
