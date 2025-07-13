import React from "react";
import { createRoot } from "react-dom/client";
import App from "./src/App";
import "./style.css";
import { DiscordSDK } from "@discord/embedded-app-sdk";

// Only initialize DiscordSDK if running inside Discord (frame_id present)
if (window.location.search.includes("frame_id")) {
  let auth;
  const discordSdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID);

  setupDiscordSdk().then(() => {
    const root = createRoot(document.getElementById("app"));
    root.render(
      <React.StrictMode>
        <App discordSdk={discordSdk} auth={auth} />
      </React.StrictMode>
    );
  });

  async function setupDiscordSdk() {
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
    const response = await fetch("/.proxy/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code,
      }),
    });
    const { access_token } = await response.json();

    // Authenticate with Discord client (using the access_token)
    auth = await discordSdk.commands.authenticate({
      access_token,
    });

    if (auth == null) {
      throw new Error("Authenticate command failed");
    }
  }
} else {
  // For local development, just render the app without DiscordSDK
  const root = createRoot(document.getElementById("app"));
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
