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

  // ✅ FIX: Use the correct path for Discord Activity proxy tunnel
  const wsUrl = isDiscordActivity()
    ? `wss://${window.location.hostname}/.proxy/api/ws`
    : (import.meta.env.VITE_WS_URL || "ws://localhost:3001/ws");

  console.debug("[Phasmo WS] Using WebSocket URL:", wsUrl);

  let ws;
  try {
    ws = new WebSocket(wsUrl);
    console.log("[Phasmo WS] Creating WebSocket:", wsUrl);
  } catch (err) {
    console.error(`[Phasmo WS] Failed to create WebSocket connection to ${wsUrl}:`, err);
    if (!isDiscordActivity()) {
      alert(`Could not connect to WebSocket server at ${wsUrl}.\n\nError: ${err.message}`);
    }
    return null;
  }

  let isOpen = false;
  let isClosed = false;

  ws.onopen = () => {
    if (isClosed) return;
    isOpen = true;
    console.log("[Phasmo WS] WebSocket opened:", wsUrl);
    ws.send(JSON.stringify({
      type: "join",
      sessionId,
      user: testUser,
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
    console.error(`[Phasmo WS] WebSocket error for ${wsUrl}:`, event?.message || event);
    if (!isDiscordActivity()) {
      alert(`WebSocket connection error.\n\nURL: ${wsUrl}\n\nCheck that your backend server is running and accessible.`);
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
