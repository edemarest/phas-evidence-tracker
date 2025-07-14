// Usage: const client = createPollingClient(user, onMessage);
// client.sendMessage({ type: 'evidence_update', ... });

function isDiscordActivity() {
  return window.location.search.includes("frame_id") ||
         window.location.hostname.endsWith("discordsays.com");
}

function getApiBase() {
  return isDiscordActivity() ? "/.proxy/api" : "/api";
}

// Polling client for single book state
export function createPollingClient(user, onMessage) {
  let stopped = false;
  let lastState = null;
  const apiBase = getApiBase();

  async function poll() {
    if (stopped) return;
    try {
      const res = await fetch(`${apiBase}/book/state`);
      if (res.ok) {
        const state = await res.json();
        if (JSON.stringify(state) !== JSON.stringify(lastState)) {
          onMessage && onMessage({ type: "sync_state", state });
          lastState = state;
        }
      } else {
        console.warn("[Polling] Failed to fetch book state:", res.status);
      }
    } catch (err) {
      console.error("[Polling] Error fetching book state:", err);
    }
    setTimeout(poll, 2000);
  }
  poll();

  return {
    sendMessage: async (msg) => {
      await fetch(`${apiBase}/book/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...msg, user }),
      });
    },
    resetBook: async (msg) => {
      await fetch(`${apiBase}/book/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: msg.user }),
      });
    },
    close: () => { stopped = true; }
  };
}
