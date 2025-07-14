# Discord Activity Routing Breakdown (Render + Discord Proxy)

## 1. **Hosting Setup**

| Component   | Render Service URL                              | Discord Mapping (Developer Portal)           |
|-------------|------------------------------------------------|----------------------------------------------|
| Frontend    | `phas-evidence-tracker.onrender.com`            | Root Mapping: `/` → `phas-evidence-tracker.onrender.com` |
| Backend API | `phas-evidence-backend.onrender.com`            | Proxy Path Mapping: `/.proxy/api` → `phas-evidence-backend.onrender.com` |

---

## 2. **How Discord Activity Connects**

### **A. When running as a Discord Activity (in Discord client):**

1. **User opens Activity in Discord.**
2. **Discord loads the iframe:**  
   `https://phas-evidence-tracker.onrender.com/`
3. **Frontend makes API call:**  
   `fetch("/.proxy/api/token", ...)`
4. **Discord proxy intercepts `/.proxy/api/token` and forwards to backend:**  
   - Strips `/.proxy` prefix
   - Forwards as:  
     `POST https://phas-evidence-backend.onrender.com/api/token`
5. **Backend handles `/api/token` route and responds.**
6. **Response is proxied back through Discord to the frontend.**

---

### **B. When running locally (dev mode):**

1. **Frontend runs on `localhost:5173` (or similar).**
2. **API calls go to `/api/token`.**
3. **Vite dev server proxies `/api` to `localhost:3001` (backend).**
4. **Backend handles `/api/token` and responds directly.**

---

## 3. **WebSocket Routing**

- **Frontend (in Discord Activity):**  
  Connects to `wss://phas-evidence-tracker.onrender.com/.proxy/ws`
- **Discord proxy forwards to:**  
  `wss://phas-evidence-backend.onrender.com/ws`
- **Backend handles `/ws` WebSocket connections.**

---

## 4. **Summary Chart**

```mermaid
flowchart TD
    subgraph Discord Activity (iframe)
        FE[Frontend: phas-evidence-tracker.onrender.com]
    end
    subgraph Discord Proxy
        DP[Discord Proxy]
    end
    subgraph Backend
        BE[Backend: phas-evidence-backend.onrender.com]
    end

    FE -- API: /.proxy/api/token --> DP
    DP -- Forwards to /api/token --> BE
    BE -- Response --> DP
    DP -- Response --> FE

    FE -- WS: wss://.../.proxy/ws --> DP
    DP -- Forwards to /ws --> BE
```

---

## 5. **Key Points**

- **Frontend only ever calls `/.proxy/api/...` in Discord Activity.**
- **Backend only defines `/api/...` routes.**
- **Discord Proxy strips `/.proxy` and forwards to backend.**
- **No need to define `/.proxy/api/...` routes in backend.**
- **WebSocket connections are proxied the same way.**

---

**This setup ensures your Discord Activity works seamlessly with Render-hosted frontend and backend.**
