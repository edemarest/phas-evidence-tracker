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
  // Use env variable if present
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  // Always use full backend URL in production
  if (
    import.meta.env.MODE === "production" ||
    window.location.hostname.endsWith("onrender.com")
  ) {
    return "https://phas-evidence-backend.onrender.com/api";
  }
  // Discord Activity special case
  if (isDiscordActivity()) {
    return "/.proxy/api";
  }
  return "/api";
}

// ================================================
// HTTP POLLING CLIENT
// ================================================

/**
 * Creates a polling-based client for real-time communication
 * Uses HTTP polling instead of WebSockets for better compatibility
 * Enhanced with reconnection handling for free tier servers
 * 
 * @param {Object} user - User object with username and id
 * @param {Function} onMessage - Callback for received messages
 * @returns {Object} Client with sendMessage, resetBook, and close methods
 */
export function createPollingClient(user, onMessage) {
  let stopped = false;
  let lastState = null;
  let consecutiveErrors = 0;
  let isConnected = true;
  let pollInterval = 2000; // Start with 2 second polling
  const maxInterval = 10000; // Max 10 second interval during errors
  const apiBase = getApiBase();

  /**
   * Polls the server for state changes with exponential backoff on errors
   * Handles server sleep/wake cycles gracefully
   */
  async function poll() {
    if (stopped) return;
    try {
      const sessionId = user.sessionId || "default-session";
      const userId = user.id || user.username || "anonymous";
      const res = await fetch(`${apiBase}/book/state?sessionId=${encodeURIComponent(sessionId)}&userId=${encodeURIComponent(userId)}`, {
        timeout: 8000 // 8 second timeout
      });
      
      if (res.ok) {
        const state = await res.json();
        
        // Connection restored
        if (!isConnected) {
          onMessage && onMessage({ type: "connection_restored" });
          isConnected = true;
          consecutiveErrors = 0;
          pollInterval = 2000; // Reset to normal polling
        }
        
        // Only notify if state has changed
        if (JSON.stringify(state) !== JSON.stringify(lastState)) {
          onMessage && onMessage({ type: "sync_state", state });
          lastState = state;
        }
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      consecutiveErrors++;
      
      // Connection lost notification (only on first error)
      if (isConnected) {
        onMessage && onMessage({ type: "connection_lost" });
        isConnected = false;
      }
      
      // Exponential backoff for errors (server might be sleeping)
      pollInterval = Math.min(1000 * Math.pow(2, consecutiveErrors), maxInterval);
    }
    
    // Schedule next poll with current interval
    setTimeout(poll, pollInterval);
  }
  
  // Start polling immediately
  poll();

  // ================================================
  // CLIENT API METHODS
  // ================================================

  return {
    /**
     * Sends an action message to the server with retry logic
     * @param {Object} msg - Action message to send
     */
    sendMessage: async (msg) => {
      let retries = 3;
      while (retries > 0) {
        try {
          const sessionId = user.sessionId || "default-session";
          const response = await fetch(`${apiBase}/book/action`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...msg, user, sessionId }),
            timeout: 8000
          });
          
          if (response.ok) {
            return; // Success
          } else if (response.status >= 500) {
            // Server error, retry
            throw new Error(`Server error: ${response.status}`);
          } else {
            // Client error, don't retry
            return;
          }
        } catch (err) {
          retries--;
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s before retry
          } else {
            onMessage && onMessage({ type: "send_failed", error: err.message });
          }
        }
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
      }
    },

    /**
     * Stops the polling client and notifies server of disconnect
     */
    close: async () => { 
      stopped = true; 
      
      // Notify server that user is disconnecting
      try {
        const sessionId = user.sessionId || "default-session";
        const userId = user.id || user.username || "anonymous";
        await fetch(`${apiBase}/session/disconnect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, userId }),
        });
      } catch (err) {
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
      } catch (err) {
      }
    }
  };
}

// Export as createWSClient for backwards compatibility
export const createWSClient = createPollingClient;
