# How to Get the Right Discord OAuth2 Code for Your App

## 1. **Go to Discord Developer Portal**

- Visit: https://discord.com/developers/applications
- Select your application (the one with your Activity).

## 2. **Navigate to OAuth2 Settings**

- In the left sidebar, click **"OAuth2"** → **"URL Generator"**.

## 3. **Configure the OAuth2 URL**

- **Scopes:**  
  - Check `identify`
  - (Optionally: `guilds`, `applications.commands` if your app uses them)
- **OAuth2 Redirects:**  
  - Make sure your **redirect URI** matches what your backend expects, e.g.:  
    ```
    https://phas-evidence-frontend.onrender.com/.proxy/oauth2/authorize
    ```
    (Add this in the "OAuth2" → "Redirects" section if not present.)

- **OAuth2 URL Generator:**  
  - Select the scopes as above.
  - Under "OAuth2 URL Generator", copy the generated URL.

## 4. **Get the Code**

- Paste the generated URL into your browser and authorize your app.
- After authorizing, you will be redirected to your redirect URI with a `?code=...` in the URL.
- **Copy the value of `code` from the URL.**

## 5. **Where to Use the Code**

- For manual testing, use this code in your `curl` command to POST to `/api/token`:
  ```sh
  curl -X POST https://phas-evidence-backend.onrender.com/api/token \
    -H "Content-Type: application/json" \
    -d '{"code":"PASTE_CODE_HERE"}'
  ```
- In your app, the Discord SDK handles this automatically when running inside Discord.

---

**Summary:**  
- Go to Discord Developer Portal → Your App → OAuth2 → URL Generator.
- Select scopes, copy the generated URL, authorize, and copy the `code` from the redirect.
- Use this code for backend testing or debugging.
