import React from "react";
import { createRoot } from "react-dom/client";
import { DiscordSDK } from "@discord/embedded-app-sdk";
import App from "./src/App";
import "./style.css";

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
    console.log("[API] Discord Activity detected, using /.proxy/api/token");
    return "/.proxy/api/token";
  }
  if (import.meta.env.MODE === "production") {
    console.log("[API] Production mode, using full backend URL");
    return "https://phas-evidence-backend.onrender.com/api/token";
  }
  console.log("[API] Development mode, using /api/token");
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
    
    // Extract URL string from Request object if needed
    if (url && typeof url === "object" && url.url) {
      url = url.url;
    }
    
    // Rewrite token endpoint URLs to use correct API path
    if (typeof url === "string" && url.match(/^\/token($|\?)/)) {
      url = getTokenUrl();
      console.debug("[Fetch] Rewriting token URL to:", url);
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
 * Renders the main App component with user context
 * Prevents duplicate rendering attempts
 * @param {Object} user - User object with username and id
 */
function renderAppWithUser(user) {
  if (hasRendered) return;
  hasRendered = true;
  
  console.log("[Render] Starting app with user:", user.username);
  root.render(
    <React.StrictMode>
      <App user={user} />
    </React.StrictMode>
  );
}

/**
 * Renders error state when authentication or setup fails
 * @param {string} message - Error message to display
 */
function renderError(message) {
  console.error("[Render]", message);
  root.render(
    <div style={{ padding: 32, color: "red", textAlign: "center" }}>
      <h3>Authentication Error</h3>
      <p>{message}</p>
      <p>Please try refreshing the page.</p>
    </div>
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
    
    console.log("[Discord] Initializing SDK...");
    await discordSdk.ready();
    
    // Request authorization code
    console.log("[Discord] Requesting authorization...");
    const { code } = await discordSdk.commands.authorize({
      client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
      response_type: "code",
      state: "",
      prompt: "none",
      scope: ["identify", "guilds", "applications.commands"],
    });
    
    // Exchange code for access token
    console.log("[Discord] Exchanging code for token...");
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
    console.log("[Discord] Authenticating with access token...");
    const auth = await discordSdk.commands.authenticate({ access_token });
    
    if (!auth?.user) {
      throw new Error("Discord authentication returned no user data");
    }
    
    console.log("[Discord] Authentication successful:", auth.user.username);
    return auth.user;
    
  } catch (error) {
    console.error("[Discord] Authentication failed:", error);
    throw error;
  }
}

// ================================================
// LOCAL DEVELOPMENT USER SETUP
// ================================================

/**
 * Gets or prompts for user credentials in development mode
 * @returns {Object|null} User object or null if cancelled
 */
function getLocalUser() {
  const params = new URLSearchParams(window.location.search);
  const username = params.get("user");
  
  // Use URL parameter if provided
  if (username) {
    console.log("[Local] Using username from URL:", username);
    return { username, id: username };
  }
  
  // Prompt user for username (only once per session)
  if (!window.__phasmo_user_prompted) {
    window.__phasmo_user_prompted = true;
    const input = window.prompt(
      "Enter a username for this session:",
      `User${Math.floor(Math.random() * 1000)}`
    );
    
    if (input?.trim()) {
      const username = input.trim();
      console.log("[Local] Using prompted username:", username);
      return { username, id: username };
    }
  }
  
  return null;
}

// ================================================
// APPLICATION INITIALIZATION
// ================================================

/**
 * Main initialization function that handles both Discord and local modes
 */
async function initializeApp() {
  // Set up fetch patching for consistent API routing
  setupFetchPatching();
  
  try {
    let user = null;
    
    if (isDiscordActivity()) {
      // Discord embedded app mode
      console.log("[Init] Running in Discord Activity mode");
      user = await authenticateWithDiscord();
    } else {
      // Local development mode
      console.log("[Init] Running in local development mode");
      user = getLocalUser();
      
      if (!user) {
        renderError("No username provided. Please reload and enter a username.");
        return;
      }
    }
    
    // Render app with authenticated user
    renderAppWithUser(user);
    
  } catch (error) {
    const errorMessage = isDiscordActivity() 
      ? `Discord authentication failed: ${error.message}`
      : `Local setup failed: ${error.message}`;
    
    renderError(errorMessage);
  }
}

// ================================================
// START APPLICATION
// ================================================

// Initialize the application
initializeApp();
