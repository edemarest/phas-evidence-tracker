import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./src/App";
import "./style.css";
import { DiscordSDK } from "@discord/embedded-app-sdk";

const root = createRoot(document.getElementById("app"));

// --- Robust token URL handling ---
function isDiscordActivity() {
  return window.location.search.includes("frame_id") ||
         window.location.hostname.endsWith("discordsays.com");
}

// Always resolve to correct API path for token
function getTokenUrl() {
  // Accept /token, /api/token, or /.proxy/api/token
  if (isDiscordActivity()) {
    return "/.proxy/api/token";
  }
  // In dev or prod web, always use /api/token
  return "/api/token";
}

// --- Patch global fetch to rewrite /token to correct API path ---
const origFetch = window.fetch;
window.fetch = async (...args) => {
  let [url, options] = args;
  // If url is a Request object, extract the URL string
  if (url && typeof url === "object" && url.url) url = url.url;

  // Rewrite /token to correct API path
  if (typeof url === "string" && url.match(/^\/token($|\?)/)) {
    url = getTokenUrl();
  }
  // Also rewrite if someone uses /api/token or /.proxy/api/token incorrectly
  if (typeof url === "string" && url.match(/^\/(api|\.proxy\/api)\/token($|\?)/)) {
    // leave as is, but could add logging here if needed
  }
  // Call original fetch
  return origFetch(url, options);
};

let hasRendered = false;
async function renderAppWithUser(user) {
  if (hasRendered) return;
  hasRendered = true;
  console.log("[main.jsx] Rendering App with user:", user);
  root.render(
    <React.StrictMode>
      <App user={user} />
    </React.StrictMode>
  );
}

if (isDiscordActivity()) {
  // Discord embedded mode
  (async () => {
    let discordSdk = null;
    let auth = null;
    let user = null;
    try {
      discordSdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID);
      window.discordSdk = discordSdk;
      await discordSdk.ready();

      console.debug("[DiscordSDK] SDK ready, starting authorize()...");

      const { code } = await discordSdk.commands.authorize({
        client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
        response_type: "code",
        state: "",
        prompt: "none",
        scope: ["identify", "guilds", "applications.commands"],
      });

      console.debug("[DiscordSDK] Received code:", code);

      // Use robust token URL
      const tokenUrl = getTokenUrl();
      console.debug("[DiscordSDK] Fetching token from:", tokenUrl);

      const response = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      console.debug("[DiscordSDK] Token fetch response:", response.status);

      if (!response.ok) {
        const text = await response.text();
        console.error("[DiscordSDK] Token fetch failed:", response.status, text);
        throw new Error(`Token fetch failed: ${response.status} ${response.statusText}`);
      }

      const json = await response.json();
      console.debug("[DiscordSDK] Token fetch response JSON:", json);

      const { access_token } = json;
      auth = await discordSdk.commands.authenticate({ access_token });

      if (!auth || !auth.user) throw new Error("Discord authentication failed");

      console.debug("[DiscordSDK] Authentication success, user:", auth.user);
      user = auth.user;
      renderAppWithUser(user);
    } catch (err) {
      console.error("[DiscordSDK] Discord authentication failed:", err);
      root.render(
        <div style={{ padding: 32, color: "red" }}>
          Failed to authenticate with Discord.<br />
          {err.message}
        </div>
      );
    }
  })();
} else {
  // Local dev mode
  console.debug("[Main] Starting in local dev mode");
  let user = null;
  const params = new URLSearchParams(window.location.search);
  const username = params.get("user");

  if (username) {
    user = { username, id: username };
  } else {
    if (!window.__phasmo_user_prompted) {
      window.__phasmo_user_prompted = true;
      const input = window.prompt("Enter a test username for this session:", "");
      if (input) {
        user = { username: input, id: input };
      }
    }
  }

  if (user) {
    renderAppWithUser(user);
  } else {
    root.render(
      <div style={{ padding: 32, color: "red" }}>
        No username provided. Please reload and enter a username.
      </div>
    );
  }
}
