# Render Monorepo Backend Setup (Single Service: Backend serves Frontend)

## 1. Project Structure

Your repo should look like:
```
/client
  /src
  index.html
  package.json
  vite.config.js
/server
  server.js
  package.json
  ...
.env
```

## 2. Render Web Service Settings

- **Service Type:** Web Service
- **Root Directory:** (leave blank or `/` for repo root)
- **Build Command:**  
  ```
  cd client && npm install && npm run build && cd .. && cd server && npm install
  ```
  *(This builds the frontend, then installs backend dependencies)*
- **Start Command:**  
  ```
  node server/server.js
  ```
- **Publish Directory:** (leave blank)

## 3. Environment Variables

- In the Render dashboard, under your Web Service → Environment:
  - Copy all variables from your `.env` file.
  - Example:
    ```
    VITE_DISCORD_CLIENT_ID=1393993800988491776
    DISCORD_CLIENT_SECRET=Nxb1zI1rhhOTEn8GX4C4RicDbEZPGL7C
    VITE_PUBLIC_URL=https://phas-evidence-backend.onrender.com
    VITE_WS_URL=wss://phas-evidence-backend.onrender.com/ws
    VITE_LOCAL_WS_URL=ws://localhost:8080/ws
    VITE_BACKEND_PORT=3001
    ```
  - **Do NOT include secrets in frontend .env if you ever split again.**

## 4. Backend Static Serve

- In `server.js`, ensure you serve the frontend from `/client/dist`:
  ```javascript
  // ...existing code...
  import path from "path";
  import { fileURLToPath } from "url";
  // ...existing code...
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const clientDist = path.join(__dirname, "../client/dist");
  app.use(express.static(clientDist));
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
  // ...existing code...
  ```

## 5. Vite Build Output

- In `/client/vite.config.js`:
  ```javascript
  // ...existing code...
  export default defineConfig({
    // ...existing code...
    build: {
      outDir: 'dist', // outputs to /client/dist
      emptyOutDir: true,
    },
    // ...existing code...
  });
  ```

## 6. Deploy

- Push to GitHub.
- Render will:
  1. Build the frontend (`client/dist`)
  2. Install backend (`server`)
  3. Start backend (`node server/server.js`)
  4. Serve frontend from `/client/dist` via Express.

## 7. Access

- Your app will be available at your backend Render URL (e.g. `https://phas-evidence-backend.onrender.com`).
- All frontend and WebSocket traffic goes through this URL.

---

**Summary Table**

| Setting             | Value/Example                                   |
|---------------------|-------------------------------------------------|
| Root Directory      | (blank or `/`)                                  |
| Build Command       | `cd client && npm install && npm run build && cd .. && cd server && npm install` |
| Start Command       | `node server/server.js`                         |
| Publish Directory   | (blank)                                         |
| Environment Vars    | All from `.env`                                 |

---

**This setup ensures your backend always serves the latest frontend build and works as a single Render service.**