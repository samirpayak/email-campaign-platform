require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
    origin: [
        process.env.FRONTEND_URL,
        'https://mail.trugydex.in',
        'https://trugydex-email-platform-2026.vercel.app',
        'http://localhost:3000',
        'http://127.0.0.1:5500'
    ],
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',      require('./api/auth'));
app.use('/api/users',     require('./api/users'));
app.use('/api/groups',    require('./api/groups'));
app.use('/api/campaigns', require('./api/campaigns'));

// ── Seed Admin (run once to create admin in DB) ──────────────────────────────
app.get('/api/auth/seed', async (req, res) => {
    try {
        const connectDB = require('../lib/db');
        const bcrypt = require('bcryptjs');
        const { User } = require('../lib/models');
        await connectDB();
        const existing = await User.findOne({ email: process.env.ADMIN_EMAIL });
        if (existing) return res.json({ success: true, message: 'Admin already exists: ' + existing.email });
        const hashed = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
        await User.create({ name: process.env.ADMIN_NAME, email: process.env.ADMIN_EMAIL, password: hashed, role: 'Administrator', status: 'approved', emailVerified: true });
        res.json({ success: true, message: 'Admin created successfully! Email: ' + process.env.ADMIN_EMAIL });
    } catch(e) {
        res.status(500).json({ success: false, message: e.message });
    }
});

// ── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({ success: true, message: 'Trugydex API is running ✅', time: new Date() });
});

// ── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'API route not found.' });
});

// ── Error Handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ success: false, message: 'Internal server error.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Trugydex API running on port ${PORT}`);
});

module.exports = app;
