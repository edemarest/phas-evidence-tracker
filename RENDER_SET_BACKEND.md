# How to Set the Backend for a Render Static Site

1. **Go to your Static Site service** in the Render dashboard.

2. **Click "Settings"** in the left sidebar.

3. **Scroll down to the "Backend" section.**

4. **Select your backend service** (e.g. `phas-evidence-backend`) from the dropdown.

5. **Save changes.**

6. **Redeploy your Static Site** (if not triggered automatically).

**Result:**  
All requests to `/api/*` from your static site will be proxied to your backend service.

---
**Note:**  
- This is required for API calls like `/api/token` to reach your backend.
- The backend must be a Render Web Service in the same account.
