import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { DiscordSDK } from "@discord/embedded-app-sdk";
import App from "./src/App";
import SessionModal from "./src/components/SessionModal/SessionModal";
import DiscordSessionManager from "./utils/DiscordSessionManager";
import "./style.css";

// ================================================
// USERNAME PROMPT COMPONENT
// ================================================

/**
 * Username prompt for client-side testing
 */
function UsernamePrompt({ onUsernameSubmit }) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmedUsername = username.trim();
    
    if (!trimmedUsername) {
      setError('Please enter a username');
      return;
    }
    
    if (trimmedUsername.length < 2) {
      setError('Username must be at least 2 characters');
      return;
    }
    
    if (trimmedUsername.length > 20) {
      setError('Username must be 20 characters or less');
      return;
    }
    
    onUsernameSubmit(trimmedUsername);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000
    }}>
      <div style={{
        background: 'linear-gradient(145deg, #2a2a2a, #1e1e1e)',
        border: '2px solid #444',
        borderRadius: '16px',
        padding: '32px',
        maxWidth: '400px',
        width: '90%',
        color: '#ffffff',
        textAlign: 'center'
      }}>
        <h2 style={{ marginBottom: '16px', color: '#ffffff' }}>Enter Your Username</h2>
        <p style={{ marginBottom: '24px', color: '#aaaaaa' }}>
          Choose a username to identify yourself in the session
        </p>
        
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setError('');
            }}
            placeholder="Your username"
            autoFocus
            style={{
              width: '100%',
              padding: '12px 16px',
              marginBottom: '16px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: error ? '2px solid #dc3545' : '2px solid #444',
              borderRadius: '8px',
              color: '#ffffff',
              fontSize: '16px',
              boxSizing: 'border-box'
            }}
          />
          
          {error && (
            <div style={{
              color: '#ff6b6b',
              fontSize: '14px',
              marginBottom: '16px'
            }}>
              {error}
            </div>
          )}
          
          <button
            type="submit"
            style={{
              width: '100%',
              padding: '12px 24px',
              background: 'linear-gradient(145deg, #007bff, #0056b3)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'all 0.3s ease'
            }}
          >
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}

// ================================================
// ENVIRONMENT DETECTION & ROUTING
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
 * Determines the correct API token endpoint based on environment
 * @returns {string} The token endpoint URL to use
 */
function getTokenUrl() {
  if (isDiscordActivity()) {
    return "/.proxy/api/token";
  }
  if (import.meta.env.MODE === "production") {
    return "https://phas-evidence-backend.onrender.com/api/token";
  }
  return "/api/token";
}

// ================================================
// FETCH PATCHING FOR CONSISTENT API ROUTING
// ================================================

/**
 * Patches global fetch to ensure token requests use correct API paths
 * This handles cases where different parts of the app might use different URL formats
 */
function setupFetchPatching() {
  const originalFetch = window.fetch;
  
  window.fetch = async (...args) => {
    let [url, options] = args;
    if (url && typeof url === "object" && url.url) {
      url = url.url;
    }
    if (typeof url === "string" && url.match(/^\/token($|\?)/)) {
      url = getTokenUrl();
    }
    return originalFetch(url, options);
  };
}

// ================================================
// REACT APP RENDERING
// ================================================

const root = createRoot(document.getElementById("app"));
let hasRendered = false;

/**
 * SessionWrapper component handles session initialization
 */
function SessionWrapper() {
  const [sessionStarted, setSessionStarted] = useState(false);
  const [user, setUser] = useState(null);
  const [error, setError] = useState(null);
  const [showUsernamePrompt, setShowUsernamePrompt] = useState(false);
  const [pendingSessionData, setPendingSessionData] = useState(null);
  const [isDiscordAutoSession, setIsDiscordAutoSession] = useState(false);
  const [discordSessionLoading, setDiscordSessionLoading] = useState(false);

  // Check for Discord environment on mount
  React.useEffect(() => {
    const isDiscord = DiscordSessionManager.isDiscordEnvironment();
    if (isDiscord) {
      setIsDiscordAutoSession(true);
      setDiscordSessionLoading(true);
      initializeDiscordAutoSession();
    }
  }, []);

  const initializeDiscordAutoSession = async () => {
    try {
      const manager = new DiscordSessionManager();
      const DISCORD_CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID || 'your-discord-client-id';
      const sessionData = await manager.initialize(DISCORD_CLIENT_ID);
      const currentParticipant = sessionData.participants.find(p => p.isCurrentUser);
      const username = currentParticipant?.username || 'Discord User';
      
      // Create user object for Discord session
      const discordUser = {
        username,
        id: currentParticipant?.discordId || username,
        sessionId: sessionData.sessionId,
        isDiscordSession: true
      };
      
      setUser(discordUser);
      setSessionStarted(true);
      setDiscordSessionLoading(false);
      
    } catch (error) {
      setError(`Discord auto-session failed: ${error.message}`);
      setIsDiscordAutoSession(false);
      setDiscordSessionLoading(false);
      // Fall back to manual session creation
    }
  };

  const handleSessionStart = async (sessionData) => {
    try {
      let authenticatedUser = null;
      
      if (isDiscordActivity()) {
        // Discord mode - authenticate and use session from modal
        authenticatedUser = await authenticateWithDiscord();
        // Override sessionId with the one from the modal
        authenticatedUser.sessionId = sessionData.sessionId;
        setUser(authenticatedUser);
        setSessionStarted(true);
      } else {
        // Local mode - check if we need a username
        let username = localStorage.getItem('phas-username');
        if (!username) {
          // Show username prompt first
          setPendingSessionData(sessionData);
          setShowUsernamePrompt(true);
          return;
        }
        
        // Create user with stored username
        authenticatedUser = {
          username: username,
          id: username,
          sessionId: sessionData.sessionId
        };
        setUser(authenticatedUser);
        setSessionStarted(true);
      }
      
    } catch (error) {
      setError(error.message);
    }
  };

  const handleUsernameSubmit = (username) => {
    localStorage.setItem('phas-username', username);
    setShowUsernamePrompt(false);
    
    // Now create the user with the provided username
    const authenticatedUser = {
      username: username,
      id: username,
      sessionId: pendingSessionData.sessionId
    };
    setUser(authenticatedUser);
    setSessionStarted(true);
    setPendingSessionData(null);
  };

  if (error) {
    return (
      <div style={{ padding: 32, color: "red", textAlign: "center" }}>
        <h3>Session Error</h3>
        <p>{error}</p>
        <button 
          onClick={() => { setError(null); setSessionStarted(false); setIsDiscordAutoSession(false); }}
          style={{
            padding: "8px 16px",
            backgroundColor: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer"
          }}
        >
          Try Again
        </button>
      </div>
    );
  }

  // Show Discord loading state
  if (isDiscordAutoSession && discordSessionLoading) {
    return (
      <div style={{ 
        padding: 32, 
        textAlign: "center",
        background: "var(--color-bg-paper)",
        color: "var(--color-text-primary)",
        fontFamily: "var(--font-body)",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center"
      }}>
        <h3 style={{ fontFamily: "var(--font-heading)", marginBottom: "16px" }}>
          🎮 Connecting to Discord Activity...
        </h3>
        <p>Setting up your investigation session...</p>
        <div style={{ 
          marginTop: "16px",
          width: "32px",
          height: "32px",
          border: "3px solid var(--color-gridline)",
          borderTop: "3px solid var(--color-accent-red)",
          borderRadius: "50%",
          animation: "spin 1s linear infinite"
        }}></div>
      </div>
    );
  }

  if (showUsernamePrompt) {
    return <UsernamePrompt onUsernameSubmit={handleUsernameSubmit} />;
  }

  // Skip session modal for Discord auto-sessions
  if (!sessionStarted && !isDiscordAutoSession) {
    return <SessionModal onSessionStart={handleSessionStart} />;
  }

  // Show loading if Discord session is starting but not yet ready
  if (isDiscordAutoSession && !sessionStarted) {
    return (
      <div style={{ 
        padding: 32, 
        textAlign: "center",
        color: "var(--color-text-primary)"
      }}>
        Preparing Discord session...
      </div>
    );
  }

  return <App user={user} />;
}


/**
 * Renders the session wrapper (new main entry point)
 */
function renderSessionWrapper() {
  if (hasRendered) return;
  hasRendered = true;
  
  root.render(
    <React.StrictMode>
      <SessionWrapper />
    </React.StrictMode>
  );
}


// ================================================
// DISCORD AUTHENTICATION FLOW
// ================================================

/**
 * Handles Discord OAuth authentication for embedded app
 * @returns {Promise<Object>} Authenticated user object
 */
async function authenticateWithDiscord() {
  try {
    // Initialize Discord SDK
    const discordSdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID);
    window.discordSdk = discordSdk; // Expose for debugging
    
    await discordSdk.ready();
    
    // Request authorization code
    const { code } = await discordSdk.commands.authorize({
      client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
      response_type: "code",
      state: "",
      prompt: "none",
      scope: ["identify", "guilds", "applications.commands"],
    });
    
    // Exchange code for access token
    const tokenUrl = getTokenUrl();
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token exchange failed: ${response.status} - ${errorText}`);
    }
    
    const { access_token } = await response.json();
    
    // Authenticate with Discord
    const auth = await discordSdk.commands.authenticate({ access_token });
    
    if (!auth?.user) {
      throw new Error("Discord authentication returned no user data");
    }
    
    // Get Discord context for session scoping
    let sessionId = `discord-user-${auth.user.id}-${Date.now()}`;
    try {
      const context = await discordSdk.commands.getContext();
      // Use channel ID for shared sessions, or activity instance for private sessions
      sessionId = context.channelId || context.activityInstanceId || sessionId;
    } catch (e) {
      // Ignore context errors, fallback to user-specific session
    }
    
    return { ...auth.user, sessionId };
    
  } catch (error) {
    throw error;
  }
}

// ================================================
// LOCAL DEVELOPMENT USER SETUP
// ================================================

/**
 * Gets user credentials from URL parameters in development mode
 * Note: SessionModal now handles session creation/joining
 * @returns {Object|null} User object from URL params or null
 */

// ================================================
// APPLICATION INITIALIZATION
// ================================================

/**
 * Main initialization function that sets up the session wrapper
 */
async function initializeApp() {
  // Set up fetch patching for consistent API routing
  setupFetchPatching();
  
  // Always start with the session wrapper now
  renderSessionWrapper();
}

// ================================================
// START APPLICATION
// ================================================

// Initialize the application
initializeApp();

// ================================================
// APPLICATION INITIALIZATION
// ================================================

/**
 * Main initialization function that sets up the session wrapper
 */
async function initializeApp() {
  // Set up fetch patching for consistent API routing
  setupFetchPatching();
  
  console.log("[Init] Starting session-based initialization");
  
  // Always start with the session wrapper now
  renderSessionWrapper();
}

// ================================================
// START APPLICATION
// ================================================

// Initialize the application
initializeApp();
