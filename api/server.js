require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

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

const userSchema = new mongoose.Schema({ name: String, email: { type: String, unique: true, lowercase: true }, password: String, role: { type: String, default: 'Employee' }, status: { type: String, default: 'pending' }, emailVerified: { type: Boolean, default: false }, registeredAt: { type: Date, default: Date.now }, lastLogin: Date });
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
        const user = await User.findOne({ email: email.toLowerCase().trim() });
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
        if (password.length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
        const existing = await User.findOne({ email: email.toLowerCase().trim() });
        if (existing) return res.status(409).json({ success: false, message: 'Email already registered.' });
        const hashed = await bcrypt.hash(password, 12);
        await User.create({ name, email: email.toLowerCase().trim(), password: hashed, role: 'Employee', status: 'pending' });
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

app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found.' }));

module.exports = app;
