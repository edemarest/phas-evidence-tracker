// Example: Express route for session creation
app.post('/api/session', async (req, res) => {
    console.log('[DEBUG] Incoming session creation request');
    console.log('[DEBUG] Headers:', req.headers);
    console.log('[DEBUG] Cookies:', req.cookies);

    try {
        // ...existing session creation logic...
        // Example: Check authentication
        if (!req.cookies.sessionId) {
            console.error('[AUTH ERROR] No sessionId cookie found');
            return res.status(401).json({ error: 'No sessionId cookie' });
        }
        // ...existing code...
        // On success
        console.log('[DEBUG] Session created successfully:', { sessionId: /* sessionId */ });
        res.json({ sessionId: /* sessionId */ });
    } catch (err) {
        console.error('[ERROR] Session creation failed:', err);
        // Log response status and body
        res.status(500).json({ error: 'Session creation failed', details: err.message });
    }
});

// Example: Authentication middleware
function authMiddleware(req, res, next) {
    console.log('[DEBUG] Authenticating request');
    console.log('[DEBUG] Headers:', req.headers);
    console.log('[DEBUG] Cookies:', req.cookies);

    // ...existing authentication logic...
    if (!req.cookies.sessionId) {
        console.error('[AUTH ERROR] No sessionId cookie found');
        return res.status(401).json({ error: 'No sessionId cookie' });
    }
    // ...existing code...
    next();
}