// Usage: const client = createPollingClient(sessionId, user, onMessage);
// client.sendMessage({ type: 'evidence_update', ... });

export function createPollingClient(sessionId, user, onMessage) {
  let stopped = false;
  let lastState = null;

  async function poll() {
    if (stopped) return;
    try {
      console.debug("[Polling] GET /api/session/" + sessionId + "/state");
      const res = await fetch(`/api/session/${sessionId}/state?user=${encodeURIComponent(user.id)}`);
      if (res.ok) {
        const state = await res.json();
        if (JSON.stringify(state) !== JSON.stringify(lastState)) {
          onMessage && onMessage({ type: "sync_state", state });
          lastState = state;
        }
      } else {
        console.warn("[Polling] Failed to fetch state:", res.status);
      }
    } catch (err) {
      console.error("[Polling] Error fetching state:", err);
    }
    setTimeout(poll, 2000);
  }
  poll();

  return {
    sendMessage: async (msg) => {
      console.debug("[Polling] POST /api/session/" + sessionId + "/action", msg);
      await fetch(`/api/session/${sessionId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...msg, user }),
      });
    },
    close: () => { stopped = true; }
  };
}

// Join session and get initial state/sessionId
export async function joinSession(user, sessionId = "default-session") {
  console.debug("[Polling] POST /api/session/join", { user, sessionId });
  const res = await fetch("/api/session/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user, sessionId }),
  });
  if (!res.ok) throw new Error("Failed to join session");
  return await res.json();
}

  let ws;
  if (isDiscordActivity()) {
    // Defensive: check for Discord SDK and createWebSocket
    if (!window.discordSdk) {
      throw new Error(
        "DiscordSDK not available. Are you running inside Discord Activity? " +
        "If testing in browser, use local dev mode."
      );
    }
    if (typeof window.discordSdk.createWebSocket !== "function") {
      console.warn("[Phasmo WS] DiscordSDK.createWebSocket not available, using HTTP polling fallback.");
      return createPollingClient(sessionId, user, onMessage);
    }
    ws = window.discordSdk.createWebSocket(`wss://${window.location.hostname}/.proxy/api/ws`);
    console.log("[Phasmo WS] Creating DiscordSDK WebSocket:", ws.url);
  } else {
    // Local dev: use browser WebSocket
    const wsUrl = import.meta.env.VITE_WS_URL || "ws://localhost:3001/ws";
    ws = new WebSocket(wsUrl);
    console.log("[Phasmo WS] Creating WebSocket:", wsUrl);
  }

  let isOpen = false;
  let isClosed = false;

  ws.onopen = () => {
    if (isClosed) return;
    isOpen = true;
    console.log("[Phasmo WS] WebSocket opened:", ws.url);

    // Ensure we have a user and sessionId before sending join
    if (!testUser || !testUser.username || !testUser.id || !sessionId) {
      console.error("[Phasmo WS] Cannot send join message: missing user or sessionId", { testUser, sessionId });
      if (!isDiscordActivity()) {
        alert("Cannot join session: missing user or sessionId. Please reload and provide a username.");
      }
      ws.close();
      return;
    }

    // Defensive: ensure user object has username and id
    const joinUser = {
      username: testUser.username,
      id: testUser.id,
      ...testUser
    };

    console.log("[Phasmo WS] Sending join message:", { sessionId, user: joinUser });
    ws.send(JSON.stringify({
      type: "join",
      sessionId,
      user: joinUser,
    }));
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      console.log("[Phasmo WS] Received:", msg);
      onMessage && onMessage(msg);
    } catch (err) {
      console.error("[Phasmo WS] Failed to parse message:", event.data, err);
    }
  };

  ws.onerror = (event) => {
    if (isClosed) return;
    console.error(`[Phasmo WS] WebSocket error for ${ws.url}:`, event?.message || event);
    if (!isDiscordActivity()) {
      alert(`WebSocket connection error.\n\nURL: ${ws.url}\n\nCheck that your backend server is running and accessible.`);
    }
  };

  ws.onclose = (event) => {
    isClosed = true;
    if (!event.wasClean) {
      console.error(`[Phasmo WS] WebSocket closed unexpectedly:`, event.code, event.reason);
      if (!isDiscordActivity()) {
        alert(`WebSocket connection closed unexpectedly.\n\nCode: ${event.code}\nReason: ${event.reason}\n\nCheck your backend server.`);
      }
    } else {
      console.log("[Phasmo WS] WebSocket closed cleanly.");
    }
  };

  ws.sendMessage = (msg) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    } else if (ws.readyState === WebSocket.CONNECTING) {
      ws.addEventListener("open", () => ws.send(JSON.stringify(msg)), { once: true });
    } else {
      console.warn("[Phasmo WS] Tried to send message but socket is not open.", msg);
    }
  };

  const origClose = ws.close;
  ws.close = function (...args) {
    if (!isClosed) {
      isClosed = true;
      origClose.apply(ws, args);
    }
  };
