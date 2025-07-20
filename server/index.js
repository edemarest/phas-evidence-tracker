const express = require('express');
const app = express();

// ...existing middleware and route handlers...

// Global error handler
app.use((err, req, res, next) => {
    console.error('[GLOBAL ERROR HANDLER]', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});