import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const port = process.env.PORT || 3000;

// Serve static files from the 'dist' directory (adjust if needed)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "dist")));

// Proxy API requests in local dev to backend (optional, for local dev only)
import { createProxyMiddleware } from "http-proxy-middleware";
if (process.env.NODE_ENV !== "production") {
  console.debug("[Client] Enabling API proxy to backend at http://localhost:3001");
  app.use(
    "/api",
    createProxyMiddleware({
      target: "http://localhost:3001",
      changeOrigin: true,
      ws: true,
    })
  );
}

// Fallback to index.html for SPA routing
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Client server running at http://0.0.0.0:${port}`);
});
