// Usage:
// const ws = createWSClient(sessionId, user, onMessage);
// ws.sendMessage({ type: 'evidence_update', ... });

function isDiscordActivity() {
  return window.location.hostname.endsWith("discordsays.com");
}

export function createWSClient(sessionId, user, onMessage) {
  let testUser = user;

  if (!isDiscordActivity()) {
    const params = new URLSearchParams(window.location.search);
    const username = params.get("user");
    if (username) {
      testUser = { username, id: username };
    }
  }

  let ws;
  if (isDiscordActivity()) {
    // Use Discord Embedded App SDK's WebSocket proxy
    if (!window.DiscordNative || !window.DiscordNative.webSocket) {
      throw new Error("DiscordNative.webSocket not available in Discord Activity");
    }
    ws = window.DiscordNative.webSocket.create(`wss://${window.location.hostname}/.proxy/api/ws`);
    console.log("[Phasmo WS] Creating DiscordNative WebSocket:", ws.url);
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

  return ws;
}

// No changes needed; VITE_WS_URL will be loaded from .env.local in dev and from .env in prod
    }
  };

  return ws;
}

// No changes needed; VITE_WS_URL will be loaded from .env.local in dev and from .env in prod
