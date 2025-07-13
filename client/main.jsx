import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import App from "./src/App";
import "./style.css";
import { DiscordSDK } from "@discord/embedded-app-sdk";

const root = createRoot(document.getElementById("app"));

let hasRendered = false;
async function renderAppWithUser(user) {
  if (hasRendered) return;
  hasRendered = true;
  root.render(
    <React.StrictMode>
      <App user={user} />
    </React.StrictMode>
  );
}

if (window.location.search.includes("frame_id")) {
  (async () => {
    let auth = null;
    let discordSdk = null;
    let user = null;
    let sessionId = "default-session";
    try {
      discordSdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID);
      await discordSdk.ready();

      // Authorize with Discord Client
      const { code } = await discordSdk.commands.authorize({
        client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
        response_type: "code",
        state: "",
        prompt: "none",
        scope: ["identify", "guilds", "applications.commands"],
      });

      // Retrieve an access_token from your activity's server
      let tokenUrl = "/.proxy/api/token";
      const response = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!response.ok) {
        throw new Error(`Token fetch failed: ${response.status} ${response.statusText}`);
      }
      const { access_token } = await response.json();
      auth = await discordSdk.commands.authenticate({ access_token });
      if (!auth || !auth.user) throw new Error("Discord authentication failed");
      user = auth.user;

      // Get Discord context for session scoping
      let context = {};
      try {
        context = await discordSdk.commands.getContext();
      } catch (e) {
        console.warn("Could not get Discord context, using default session.");
      }
      sessionId = context.channelId || context.activityInstanceId || "default-session";

      renderAppWithUser({ ...user, sessionId });
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
  let user = null;
  const params = new URLSearchParams(window.location.search);
  const username = params.get("user");
  if (username) {
    user = { username, id: username };
  } else {
    // Only prompt ONCE, and only if not already set
    if (!window.__phasmo_user_prompted) {
      window.__phasmo_user_prompted = true;
      const input = window.prompt("Enter a test username for this session:", "");
      if (input) {
        user = { username: input, id: input };
      }
    }
  }
  // Pass sessionId as part of user object for consistency
  if (user) {
    renderAppWithUser({ ...user, sessionId: "default-session" });
  } else {
    root.render(
      <div style={{ padding: 32, color: "red" }}>
        No username provided. Please reload and enter a username.
      </div>
    );
  }
}