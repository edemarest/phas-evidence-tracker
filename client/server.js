import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createProxyMiddleware } from "http-proxy-middleware";

const app = express();
const port = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve built React app
app.use(express.static(path.join(__dirname, "dist")));

// Proxy API in local dev
if (process.env.NODE_ENV !== "production") {
  console.log("[Frontend] Enabling local API proxy to http://localhost:3001");
  app.use(
    "/api",
    createProxyMiddleware({
      target: "http://localhost:3001",
      changeOrigin: true,
      ws: true
    })
  );
}

// Fallback SPA routing
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(port, "0.0.0.0", () => {
  console.log(`[Frontend] Client server running on http://0.0.0.0:${port}`);
});
