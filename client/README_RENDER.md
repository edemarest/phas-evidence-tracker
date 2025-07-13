# Render.com Static Site 404/ENOENT Fix

If you see:
> Error: ENOENT: no such file or directory, stat '/opt/render/project/src/client/dist/index.html'

**This means your frontend build did not produce a `dist/index.html` file.**

## How to fix

1. **Ensure you have a build script in your `/client/package.json`:**
   ```json
   "scripts": {
     "build": "vite build"
   }
   ```

2. **Your Render Static Site settings should be:**
   - **Root Directory:** `client`
   - **Build Command:** `npm install && npm run build`
   - **Publish Directory:** `dist`

3. **If you are deploying a Node.js Web Service (not a static site):**
   - Make sure your Express server serves static files from the correct path:
     ```js
     // ...existing code...
     const clientDist = path.join(__dirname, "../client/dist");
     app.use(express.static(clientDist));
     // ...existing code...
     ```

4. **If you see this error on Render:**
   - Go to your Render dashboard → your static site → "Manual Deploy" → "Clear build cache & deploy".
   - Make sure your repo contains `/client/index.html` and `/client/vite.config.js`.

5. **If you renamed or moved files:**
   - Make sure `/client/index.html` exists and is not in a subfolder.

6. **If you use a monorepo:**
   - Double-check the "Root Directory" is set to `client` in Render's settings.

---

**Summary:**  
This error is always caused by the frontend build not producing a `dist/index.html` file.  
Check your build command, publish directory, and that your repo structure matches what Render expects.