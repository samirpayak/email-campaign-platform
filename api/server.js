require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

let isConnected = false;
async function connectDB() {
    if (isConnected) return;
    await mongoose.connect(process.env.MONGODB_URI);
    isConnected = true;
}

const userSchema = new mongoose.Schema({ name: String, email: { type: String, unique: true }, password: String, role: { type: String, default: 'Employee' }, status: { type: String, default: 'pending' }, emailVerified: { type: Boolean, default: false }, registeredAt: { type: Date, default: Date.now }, lastLogin: Date });
const groupSchema = new mongoose.Schema({ name: String, description: String, emails: [String], names: [String], recipientCount: { type: Number, default: 0 }, createdBy: mongoose.Schema.Types.ObjectId, createdAt: { type: Date, default: Date.now } });
const campaignSchema = new mongoose.Schema({ name: String, groupId: mongoose.Schema.Types.ObjectId, groupName: String, subject: String, body: String, recipientCount: { type: Number, default: 0 }, attachments: [String], status: { type: String, default: 'sent' }, sentBy: mongoose.Schema.Types.ObjectId, sentAt: { type: Date, default: Date.now } });

const User = mongoose.models.User || mongoose.model('User', userSchema);
const Group = mongoose.models.Group || mongoose.model('Group', groupSchema);
const Campaign = mongoose.models.Campaign || mongoose.model('Campaign', campaignSchema);

function authMiddleware(req, res, next) {
    const header = req.headers.authorization;
    if (!header) return res.status(401).json({ success: false, message: 'No token provided.' });
    try { req.user = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET); next(); }
    catch { res.status(401).json({ success: false, message: 'Token expired. Please login again.' }); }
}
function adminOnly(req, res, next) {
    authMiddleware(req, res, () => {
        if (req.user.role !== 'Administrator') return res.status(403).json({ success: false, message: 'Admins only.' });
        next();
    });
}

// ── Gmail Transporter ─────────────────────────────────────────────────────────
function createTransporter() {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD
        }
    });
}

// ── Send Email Route ──────────────────────────────────────────────────────────
app.post('/api/email/send', authMiddleware, async (req, res) => {
    try {
        await connectDB();
        const { groupId, subject, body, campaignName } = req.body;

        if (!groupId || !subject || !body) {
            return res.status(400).json({ success: false, message: 'Group, subject and body are required.' });
        }

        // Get group with all emails
        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ success: false, message: 'Group not found.' });
        if (!group.emails || group.emails.length === 0) {
            return res.status(400).json({ success: false, message: 'No emails in this group.' });
        }

        const transporter = createTransporter();

        // Verify Gmail connection first
        await transporter.verify();

        let sent = 0;
        let failed = 0;
        const errors = [];

        // Send to each recipient with delay
        for (let i = 0; i < group.emails.length; i++) {
            const recipientEmail = group.emails[i];
            const recipientName = group.names && group.names[i] ? group.names[i] : recipientEmail;

            // Personalise body with name
            const personalBody = body
                .replace(/\{name\}/gi, recipientName)
                .replace(/\{email\}/gi, recipientEmail);

            try {
                await transporter.sendMail({
                    from: `"${process.env.GMAIL_SENDER_NAME || 'Trugydex'}" <${process.env.GMAIL_USER}>`,
                    to: recipientEmail,
                    subject: subject,
                    html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                        ${personalBody.replace(/\n/g, '<br>')}
                        <br><br>
                        <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
                        <p style="font-size:12px;color:#999;text-align:center;">
                            Sent by Trugydex Email Platform | trugydex.in
                        </p>
                    </div>`,
                    text: personalBody
                });
                sent++;
            } catch (err) {
                failed++;
                errors.push({ email: recipientEmail, error: err.message });
            }

            // Delay 2 seconds between emails to avoid spam filters
            if (i < group.emails.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        // Save campaign to DB
        await Campaign.create({
            name: campaignName || 'Untitled Campaign',
            groupId,
            groupName: group.name,
            subject,
            body,
            recipientCount: sent,
            status: failed === 0 ? 'sent' : 'partial',
            sentBy: req.user.userId
        });

        res.json({
            success: true,
            message: `Campaign completed! Sent: ${sent}, Failed: ${failed}`,
            sent,
            failed,
            errors: errors.slice(0, 5)
        });

    } catch (e) {
        console.error('Email send error:', e);
        res.status(500).json({ success: false, message: 'Email sending failed: ' + e.message });
    }
});

// ── Test Email Route ──────────────────────────────────────────────────────────
app.post('/api/email/test', authMiddleware, async (req, res) => {
    try {
        const transporter = createTransporter();
        await transporter.verify();
        await transporter.sendMail({
            from: `"Trugydex" <${process.env.GMAIL_USER}>`,
            to: process.env.GMAIL_USER,
            subject: 'Trugydex — Test Email',
            html: '<h2>Test email working!</h2><p>Your Gmail is connected to Trugydex platform successfully.</p>'
        });
        res.json({ success: true, message: 'Test email sent to ' + process.env.GMAIL_USER });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Test failed: ' + e.message });
    }
});

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ success: true, message: 'Trugydex API running', time: new Date() }));

app.get('/api/auth/seed', async (req, res) => {
    try {
        await connectDB();
        const existing = await User.findOne({ email: process.env.ADMIN_EMAIL });
        if (existing) return res.json({ success: true, message: 'Admin already exists: ' + existing.email });
        const hashed = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
        await User.create({ name: process.env.ADMIN_NAME || 'Trugydex Admin', email: process.env.ADMIN_EMAIL, password: hashed, role: 'Administrator', status: 'approved', emailVerified: true });
        res.json({ success: true, message: 'Admin created! Email: ' + process.env.ADMIN_EMAIL });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        await connectDB();
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password required.' });
        const user = await User.findOne({ email: email.trim() });
        if (!user) return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        if (user.status === 'pending') return res.status(403).json({ success: false, message: 'Your account is pending admin approval.' });
        if (user.status === 'rejected') return res.status(403).json({ success: false, message: 'Your account has been rejected by admin.' });
        user.lastLogin = new Date(); await user.save();
        const token = jwt.sign({ userId: user._id, email: user.email, name: user.name, role: user.role }, process.env.JWT_SECRET, { expiresIn: '8h' });
        res.json({ success: true, token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.post('/api/auth/signup', async (req, res) => {
    try {
        await connectDB();
        const { name, email, password } = req.body;
        if (!name || !email || !password) return res.status(400).json({ success: false, message: 'All fields required.' });
        if (email.trim().length < 3) return res.status(400).json({ success: false, message: 'User ID must be at least 3 characters.' });
        if (password.length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
        const existing = await User.findOne({ email: email.trim() });
        if (existing) return res.status(409).json({ success: false, message: 'User ID already registered.' });
        const hashed = await bcrypt.hash(password, 12);
        await User.create({ name, email: email.trim(), password: hashed, role: 'Employee', status: 'pending' });
        res.status(201).json({ success: true, message: 'Account created! Awaiting admin approval.' });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.post('/api/auth/verify', authMiddleware, (req, res) => res.json({ success: true, user: req.user }));

app.get('/api/users', adminOnly, async (req, res) => {
    try {
        await connectDB();
        const users = await User.find({}, '-password').sort({ registeredAt: -1 });
        const stats = { total: users.length, pending: users.filter(u => u.status === 'pending').length, approved: users.filter(u => u.status === 'approved').length, rejected: users.filter(u => u.status === 'rejected').length };
        res.json({ success: true, users, stats });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.put('/api/users/:id/approve', adminOnly, async (req, res) => {
    try { await connectDB(); const user = await User.findByIdAndUpdate(req.params.id, { status: 'approved' }, { new: true, select: '-password' }); res.json({ success: true, message: user.name + ' approved.', user }); }
    catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.put('/api/users/:id/reject', adminOnly, async (req, res) => {
    try { await connectDB(); const user = await User.findByIdAndUpdate(req.params.id, { status: 'rejected' }, { new: true, select: '-password' }); res.json({ success: true, message: user.name + ' rejected.', user }); }
    catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.get('/api/groups', authMiddleware, async (req, res) => {
    try { await connectDB(); const groups = await Group.find().sort({ createdAt: -1 }).select('-emails -names'); res.json({ success: true, groups }); }
    catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.post('/api/groups', authMiddleware, async (req, res) => {
    try {
        await connectDB();
        const { name, description, emails, names } = req.body;
        if (!name || !emails || emails.length === 0) return res.status(400).json({ success: false, message: 'Group name and emails required.' });
        const valid = emails.filter(e => e && e.includes('@') && e.includes('.'));
        if (valid.length === 0) return res.status(400).json({ success: false, message: 'No valid emails found.' });
        const group = await Group.create({ name, description, emails: valid, names: names || [], recipientCount: valid.length, createdBy: req.user.userId });
        res.status(201).json({ success: true, message: 'Group "' + name + '" created with ' + valid.length + ' recipients.', group });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.get('/api/campaigns/stats', authMiddleware, async (req, res) => {
    try {
        await connectDB();
        const totalGroups = await Group.countDocuments();
        const totalCampaigns = await Campaign.countDocuments();
        const agg = await Group.aggregate([{ $group: { _id: null, total: { $sum: '$recipientCount' } } }]);
        res.json({ success: true, stats: { totalGroups, totalRecipients: agg[0]?.total || 0, totalCampaigns } });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.get('/api/campaigns', authMiddleware, async (req, res) => {
    try { await connectDB(); const campaigns = await Campaign.find().sort({ sentAt: -1 }); res.json({ success: true, campaigns }); }
    catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

app.post('/api/campaigns', authMiddleware, async (req, res) => {
    try {
        await connectDB();
        const { name, groupId, subject, body, attachments } = req.body;
        if (!name || !groupId || !subject || !body) return res.status(400).json({ success: false, message: 'All fields required.' });
        const group = await Group.findById(groupId).select('name recipientCount');
        if (!group) return res.status(404).json({ success: false, message: 'Group not found.' });
        const campaign = await Campaign.create({ name, groupId, groupName: group.name, subject, body, recipientCount: group.recipientCount, attachments: attachments || [], sentBy: req.user.userId });
        res.status(201).json({ success: true, message: 'Campaign saved.', campaign });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════════
// NSE CIRCULAR ROUTES (NEW MODULE - COMPLETELY SEPARATE)
// ════════════════════════════════════════════════════════════════════════════════

const xml2js = require('xml2js');
const https = require('https');

// ── NSE Circular Schema ───────────────────────────────────────────────────────
const nseCircularSchema = new mongoose.Schema({
    title: String,
    description: String,
    link: String,
    pubDate: Date,
    category: String,
    guid: { type: String, unique: true },
    fetchedAt: { type: Date, default: Date.now },
    read: { type: Boolean, default: false }
});

const NSECircular = mongoose.models.NSECircular || mongoose.model('NSECircular', nseCircularSchema);

// ── Fetch NSE RSS Feed ────────────────────────────────────────────────────────
async function fetchNSECirculars() {
    return new Promise((resolve, reject) => {
        https.get('https://nsearchives.nseindia.com/content/RSS/Circulars.xml', async (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', async () => {
                try {
                    const parser = new xml2js.Parser();
                    const result = await parser.parseStringPromise(data);
                    
                    // Extract items from RSS feed
                    const items = result.rss.channel[0].item || [];
                    
                    let added = 0;
                    let skipped = 0;
                    
                    for (const item of items) {
                        try {
                            const circular = {
                                title: item.title ? item.title[0] : 'No Title',
                                description: item.description ? item.description[0] : '',
                                link: item.link ? item.link[0] : '',
                                pubDate: item.pubDate ? new Date(item.pubDate[0]) : new Date(),
                                category: item.category ? item.category[0] : 'General',
                                guid: item.guid ? item.guid[0] : `${item.title}-${Date.now()}`
                            };
                            
                            // Check if already exists
                            const exists = await NSECircular.findOne({ guid: circular.guid });
                            
                            if (!exists) {
                                await NSECircular.create(circular);
                                added++;
                            } else {
                                skipped++;
                            }
                        } catch (err) {
                            console.error('Error processing circular:', err.message);
                        }
                    }
                    
                    resolve({
                        success: true,
                        message: `Fetched ${added} new circulars, ${skipped} already in database`,
                        added,
                        skipped,
                        total: items.length
                    });
                    
                } catch (err) {
                    reject({ success: false, message: 'XML Parse Error: ' + err.message });
                }
            });
        }).on('error', (err) => {
            reject({ success: false, message: 'Network Error: ' + err.message });
        });
    });
}

// ── API Route: Fetch Fresh Circulars ──────────────────────────────────────────
app.post('/api/nse/fetch', authMiddleware, async (req, res) => {
    try {
        await connectDB();
        const result = await fetchNSECirculars();
        res.json(result);
    } catch (error) {
        res.status(500).json(error);
    }
});

// ── API Route: Get All Circulars (with pagination) ───────────────────────────
app.get('/api/nse/circulars', authMiddleware, async (req, res) => {
    try {
        await connectDB();
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        
        const circulars = await NSECircular.find()
            .sort({ pubDate: -1 })
            .skip(skip)
            .limit(limit);
        
        const total = await NSECircular.countDocuments();
        
        res.json({
            success: true,
            circulars,
            pagination: { page, limit, total, pages: Math.ceil(total / limit) }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ── API Route: Get Circular by ID ─────────────────────────────────────────────
app.get('/api/nse/circulars/:id', authMiddleware, async (req, res) => {
    try {
        await connectDB();
        const circular = await NSECircular.findById(req.params.id);
        if (!circular) return res.status(404).json({ success: false, message: 'Circular not found.' });
        
        // Mark as read
        circular.read = true;
        await circular.save();
        
        res.json({ success: true, circular });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ── API Route: Get Stats ──────────────────────────────────────────────────────
app.get('/api/nse/stats', authMiddleware, async (req, res) => {
    try {
        await connectDB();
        const total = await NSECircular.countDocuments();
        const unread = await NSECircular.countDocuments({ read: false });
        const byCategory = await NSECircular.aggregate([
            { $group: { _id: '$category', count: { $sum: 1 } } }
        ]);
        
        res.json({
            success: true,
            stats: {
                total,
                unread,
                byCategory
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ── API Route: Search Circulars ───────────────────────────────────────────────
app.get('/api/nse/search', authMiddleware, async (req, res) => {
    try {
        await connectDB();
        const keyword = req.query.q || '';
        const circulars = await NSECircular.find({
            $or: [
                { title: { $regex: keyword, $options: 'i' } },
                { description: { $regex: keyword, $options: 'i' } },
                { category: { $regex: keyword, $options: 'i' } }
            ]
        }).sort({ pubDate: -1 }).limit(50);
        
        res.json({ success: true, circulars });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ════════════════════════════════════════════════════════════════════════════════

app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found.' }));

module.exports = app;
