// ================================================
// ENVIRONMENT DETECTION & API ROUTING
// ================================================

/**
 * Detects if the app is running as a Discord Activity
 * @returns {boolean} True if running in Discord Activity context
 */
function isDiscordActivity() {
  return window.location.search.includes("frame_id") ||
         window.location.hostname.endsWith("discordsays.com");
}

/**
 * Determines the correct API base URL based on environment
 * @returns {string} The API base URL to use for requests
 */
function getApiBase() {
  if (isDiscordActivity()) {
    console.log("[getApiBase] Discord Activity detected, using /.proxy/api");
    return "/.proxy/api";
  }
  if (import.meta.env.MODE === "production") {
    console.log("[getApiBase] Production web, using full backend URL");
    return "https://phas-evidence-backend.onrender.com/api";
  }
  console.log("[getApiBase] Dev web, using /api");
  return "/api";
}

// ================================================
// HTTP POLLING CLIENT
// ================================================

/**
 * Creates a polling-based client for real-time communication
 * Uses HTTP polling instead of WebSockets for better compatibility
 * 
 * @param {Object} user - User object with username and id
 * @param {Function} onMessage - Callback for received messages
 * @returns {Object} Client with sendMessage, resetBook, and close methods
 */
export function createPollingClient(user, onMessage) {
  let stopped = false;
  let lastState = null;
  const apiBase = getApiBase();

  /**
   * Polls the server for state changes every 2 seconds
   * Only triggers onMessage when state actually changes
   */
  async function poll() {
    if (stopped) return;
    
    try {
      const sessionId = user.sessionId || "default-session";
      const userId = user.id || user.username || "anonymous";
      const res = await fetch(`${apiBase}/book/state?sessionId=${encodeURIComponent(sessionId)}&userId=${encodeURIComponent(userId)}`);
      if (res.ok) {
        const state = await res.json();
        // Only notify if state has changed
        if (JSON.stringify(state) !== JSON.stringify(lastState)) {
          onMessage && onMessage({ type: "sync_state", state });
          lastState = state;
        }
      } else {
        console.warn("[Polling] Failed to fetch book state:", res.status, apiBase);
      }
    } catch (err) {
      console.error("[Polling] Error fetching book state:", err, apiBase);
    }
    
    // Schedule next poll
    setTimeout(poll, 2000);
  }
  
  // Start polling immediately
  poll();

  // ================================================
  // CLIENT API METHODS
  // ================================================

  return {
    /**
     * Sends an action message to the server
     * @param {Object} msg - Action message to send
     */
    sendMessage: async (msg) => {
      try {
        const sessionId = user.sessionId || "default-session";
        await fetch(`${apiBase}/book/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...msg, user, sessionId }),
        });
      } catch (err) {
        console.error("[Client] Failed to send message:", err);
      }
    },

    /**
     * Resets the entire book state (admin function)
     * @param {Object} msg - Reset message with user info
     */
    resetBook: async (msg) => {
      try {
        const sessionId = user.sessionId || "default-session";
        await fetch(`${apiBase}/book/reset`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user: msg.user, sessionId }),
        });
      } catch (err) {
        console.error("[Client] Failed to reset book:", err);
      }
    },

    /**
     * Stops the polling client and notifies server of disconnect
     */
    close: async () => { 
      stopped = true; 
      console.log("[Client] Polling client stopping, notifying server...");
      
      // Notify server that user is disconnecting
      try {
        const sessionId = user.sessionId || "default-session";
        const userId = user.id || user.username || "anonymous";
        await fetch(`${apiBase}/session/disconnect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, userId }),
        });
        console.log("[Client] Successfully notified server of disconnect");
      } catch (err) {
        console.warn("[Client] Failed to notify server of disconnect:", err);
      }
    },

    /**
     * Explicitly disconnect from session (for manual logout)
     */
    disconnect: async () => {
      const sessionId = user.sessionId || "default-session";
      const userId = user.id || user.username || "anonymous";
      
      try {
        await fetch(`${apiBase}/session/disconnect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, userId }),
        });
        console.log("[Client] Successfully disconnected from session");
      } catch (err) {
        console.error("[Client] Failed to disconnect from session:", err);
      }
    }
  };
}
