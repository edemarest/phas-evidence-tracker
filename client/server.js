import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createProxyMiddleware } from "http-proxy-middleware";

const app = express();
const port = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("[Server] Serving static from:", path.join(__dirname, "dist"));
app.use(express.static(path.join(__dirname, "dist")));

// Dev proxy for local testing
if (process.env.NODE_ENV !== "production") {
  console.debug("[Dev] Enabling local /api proxy → http://localhost:3001");

  app.use(
    "/api",
    createProxyMiddleware({
      target: "http://localhost:3001",
      changeOrigin: true,
      ws: true,
      logLevel: "debug",
    })
  );
}

// Catch-all for SPA routing
app.get("*", (req, res) => {
  console.log("[Server] SPA fallback for:", req.url);
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(port, "0.0.0.0", () => {
  console.log(`[Server] Frontend server running at http://0.0.0.0:${port}`);
});
