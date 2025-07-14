// Usage: const client = createPollingClient(sessionId, user, onMessage);
// client.sendMessage({ type: 'evidence_update', ... });

function isDiscordActivity() {
  return window.location.search.includes("frame_id") ||
         window.location.hostname.endsWith("discordsays.com");
}

function getApiBase() {
  return isDiscordActivity() ? "/.proxy/api" : "/api";
}

export function createPollingClient(sessionId, user, onMessage) {
  let stopped = false;
  let lastState = null;
  const apiBase = getApiBase();

  async function poll() {
    if (stopped) return;
    try {
      console.debug("[Polling] GET " + apiBase + "/session/" + sessionId + "/state");
      const res = await fetch(`${apiBase}/session/${sessionId}/state?user=${encodeURIComponent(user.id)}`);
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
      console.debug("[Polling] POST " + apiBase + "/session/" + sessionId + "/action", msg);
      await fetch(`${apiBase}/session/${sessionId}/action`, {
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
  const apiBase = getApiBase();
  console.debug("[Polling] POST " + apiBase + "/session/join", { user, sessionId });
  const res = await fetch(`${apiBase}/session/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user, sessionId }),
  });
  if (!res.ok) throw new Error("Failed to join session");
  return await res.json();
}
