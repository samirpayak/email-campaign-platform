require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const Queue = require('bull');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const https = require('https');
const xml2js = require('xml2js');

// ─── Environment Variable Validation ───────────────────────────────────────
const requiredEnvVars = [
    'MONGODB_URI',
    'JWT_SECRET',
    'GMAIL_USER',
    'GMAIL_APP_PASSWORD',
    'ADMIN_EMAIL',
    'ADMIN_PASSWORD',
    'ADMIN_NAME'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
    console.warn('⚠️ WARNING: Missing environment variables:', missingVars.join(', '));
    console.warn('⚠️ Some API endpoints may not work correctly.');
    console.warn('⚠️ Please configure these variables in your environment.');
}

// Validate Redis connection details
if (!process.env.REDIS_HOST) {
    console.warn('⚠️ WARNING: REDIS_HOST not set, using default: 127.0.0.1');
}
if (!process.env.REDIS_PORT) {
    console.warn('⚠️ WARNING: REDIS_PORT not set, using default: 6379');
}

const app = express();

// ─── Security & Middleware Setup ───────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// ─── Rate Limiting ─────────────────────────────────────────────────────────
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});
app.use('/api/', limiter);

// ─── Email Job Queue Setup ────────────────────────────────────────────────
// Support both Redis URL (Upstash) and host:port configuration
let redisConfig;
if (process.env.REDIS_URL) {
    // Upstash Redis URL format: redis://[user]:[password]@[host]:[port]
    redisConfig = process.env.REDIS_URL;
    console.log('✓ Using Redis URL from REDIS_URL environment variable');
} else {
    // Local Redis or default host:port
    redisConfig = {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT || '6379')
    };
    console.log(`✓ Using Redis host: ${redisConfig.host}:${redisConfig.port}`);
}

const emailQueue = new Queue('email-sending', redisConfig);

// Handle queue connection errors
emailQueue.on('error', (err) => {
    console.error('❌ Queue connection error:', err.message);
});

emailQueue.on('ready', () => {
    console.log('✓ Email queue ready');
});

// Email job processor
emailQueue.process(async (job) => {
    const { recipient, subject, body, from, attachments, recipientName } = job.data;
    
    try {
        const transporter = createTransporter();
        
        // Personalize body
        const personalBody = body
            .replace(/\{name\}/gi, recipientName || recipient)
            .replace(/\{email\}/gi, recipient);
        
        const result = await transporter.sendMail({
            from: from,            https://mail.trugydex.in/api/health
            to: recipient,
            subject: subject,
            html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                ${personalBody.replace(/\n/g, '<br>')}
                <br><br>
                <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
                <p style="font-size:12px;color:#999;text-align:center;">
                    Sent by Trugydex Email Platform | trugydex.in
                </p>
            </div>`,
            text: personalBody,
            attachments: attachments && attachments.length > 0
                ? attachments.map(att => ({
                    filename: att.filename,
                    content: Buffer.from(att.content, 'base64'),
                    contentType: att.contentType
                }))
                : []
        });
        
        console.log(`✓ Email sent to ${recipient} (Message ID: ${result.messageId})`);
        return { success: true, recipient, messageId: result.messageId };
    } catch (error) {
        console.error(`✗ Failed to send email to ${recipient}:`, error.message);
        throw error; // Re-throw so Bull can retry with backoff
    }
});

// Job completion and failure handlers
emailQueue.on('completed', (job) => {
    console.log(`✓ Email job ${job.id} completed`);
});

emailQueue.on('failed', (job, err) => {
    console.error(`✗ Email job ${job.id} failed:`, err.message);
});

let isConnected = false;

async function connectDB() {
    if (isConnected) return;
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI environment variable is not set');
        }
        await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 5000
        });
        isConnected = true;
        console.log('✓ Connected to MongoDB');
    } catch (error) {
        console.error('✗ MongoDB connection error:', error.message);
        isConnected = false;
        throw error;
    }
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
    try {
        const token = header.split(' ')[1];
        if (!token) return res.status(401).json({ success: false, message: 'Invalid token format.' });
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Token expired. Please login again.' });
    }
}

function adminOnly(req, res, next) {
    authMiddleware(req, res, () => {
        // Check if user exists (would be set by authMiddleware)
        if (!req.user || req.user.role !== 'Administrator') {
            return res.status(403).json({ success: false, message: 'Admins only.' });
        }
        next();
    });
}

// ── Gmail Transporter ─────────────────────────────────────────────────────────
function createTransporter() {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
        throw new Error('Gmail credentials (GMAIL_USER, GMAIL_APP_PASSWORD) are not configured');
    }
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD
        }
    });
}

// ── Direct Email Sending (Fallback when Queue/Redis unavailable) ──────────────
async function sendEmailDirect(recipient, subject, body, from, attachments = [], recipientName = null) {
    try {
        const transporter = createTransporter();
        
        // Personalize body
        const personalBody = body
            .replace(/\{name\}/gi, recipientName || recipient)
            .replace(/\{email\}/gi, recipient);
        
        const result = await transporter.sendMail({
            from: from,
            to: recipient,
            subject: subject,
            html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
                ${personalBody.replace(/\n/g, '<br>')}
                <br><br>
                <footer style="font-size:12px;color:#666;margin-top:30px;border-top:1px solid #eee;padding-top:15px;">
                    <p>This email was sent by Trugydex Email Campaign Platform</p>
                </footer>
            </div>`,
            text: personalBody,
            attachments: attachments && attachments.length > 0
                ? attachments.map(att => ({
                    filename: att.filename,
                    content: Buffer.from(att.content, 'base64'),
                    contentType: att.contentType
                }))
                : []
        });
        
        console.log(`✓ Direct email sent to ${recipient} (Message ID: ${result.messageId})`);
        return { success: true, recipient, messageId: result.messageId, method: 'direct' };
    } catch (error) {
        console.error(`✗ Failed to send direct email to ${recipient}:`, error.message);
        throw error;
    }
}

// ── Send Email Route (Non-blocking for Vercel Serverless) ───────────────────────
app.post('/api/email/send', authMiddleware, async (req, res) => {
    try {
        await connectDB();
        const { groupId, subject, body, campaignName, attachments } = req.body;

        if (!groupId || !subject || !body) {
            return res.status(400).json({ success: false, message: 'Group, subject and body are required.' });
        }

        // Get group with all emails
        const group = await Group.findById(groupId);
        if (!group) return res.status(404).json({ success: false, message: 'Group not found.' });
        if (!group.emails || group.emails.length === 0) {
            return res.status(400).json({ success: false, message: 'No emails in this group.' });
        }

        // Verify Gmail credentials
        try {
            const transporter = createTransporter();
            await transporter.verify();
        } catch (err) {
            console.error('Gmail verification failed:', err.message);
            return res.status(500).json({
                success: false,
                message: 'Gmail not configured: ' + err.message
            });
        }

        const fromEmail = `"${process.env.GMAIL_SENDER_NAME || 'Trugydex'}" <${process.env.GMAIL_USER}>`;
        
        // Create campaign record FIRST
        let campaign;
        try {
            campaign = await Campaign.create({
                name: campaignName || 'Untitled Campaign',
                groupId,
                groupName: group.name,
                subject,
                body,
                recipientCount: group.emails.length,
                status: 'processing',
                sentBy: req.user.userId,
                method: process.env.REDIS_URL ? 'queue' : 'direct'
            });
        } catch (dbErr) {
            console.error('Campaign creation error:', dbErr.message);
            return res.status(500).json({
                success: false,
                message: 'Failed to create campaign: ' + dbErr.message
            });
        }

        // Return response IMMEDIATELY - don't wait for email processing!
        res.json({
            success: true,
            campaignId: campaign._id,
            totalEmails: group.emails.length,
            method: process.env.REDIS_URL ? 'queue' : 'direct',
            message: process.env.REDIS_URL 
                ? `✅ Campaign queued! ${group.emails.length} emails scheduled (sending in background)`
                : `✅ Campaign processing! Emails will be sent (sending in background)`
        });

        // Process emails in background (don't await, don't block)
        // This runs AFTER response is sent
        (async () => {
            try {
                console.log(`📧 Processing ${group.emails.length} emails for campaign ${campaign._id}...`);
                
                // Try queue first
                if (process.env.REDIS_URL) {
                    try {
                        console.log('📧 Queuing emails via Redis...');
                        for (let i = 0; i < group.emails.length; i++) {
                            const recipientEmail = group.emails[i];
                            const recipientName = group.names && group.names[i] ? group.names[i] : recipientEmail;
                            
                            await emailQueue.add({
                                recipient: recipientEmail,
                                subject: subject,
                                body: body,
                                from: fromEmail,
                                attachments: attachments || [],
                                recipientName: recipientName,
                                campaignId: campaign._id
                            }, {
                                attempts: parseInt(process.env.EMAIL_MAX_RETRIES) || 3,
                                backoff: {
                                    type: 'exponential',
                                    delay: 2000
                                },
                                removeOnComplete: true,
                                removeOnFail: false
                            });
                        }
                        console.log(`✓ Queued ${group.emails.length} emails successfully`);
                        await Campaign.findByIdAndUpdate(campaign._id, { status: 'queued', sentCount: group.emails.length });
                    } catch (queueErr) {
                        console.error('Queue error, falling back to direct send:', queueErr.message);
                        // Fallback to direct send
                        let sentCount = 0;
                        for (let i = 0; i < group.emails.length; i++) {
                            const recipientEmail = group.emails[i];
                            const recipientName = group.names && group.names[i] ? group.names[i] : recipientEmail;
                            try {
                                await sendEmailDirect(recipientEmail, subject, body, fromEmail, attachments || [], recipientName);
                                sentCount++;
                            } catch (e) {
                                console.error(`Failed to send to ${recipientEmail}:`, e.message);
                            }
                        }
                        await Campaign.findByIdAndUpdate(campaign._id, { status: 'sent', sentCount: sentCount });
                    }
                } else {
                    // Direct send
                    let sentCount = 0;
                    for (let i = 0; i < group.emails.length; i++) {
                        const recipientEmail = group.emails[i];
                        const recipientName = group.names && group.names[i] ? group.names[i] : recipientEmail;
                        try {
                            await sendEmailDirect(recipientEmail, subject, body, fromEmail, attachments || [], recipientName);
                            sentCount++;
                        } catch (e) {
                            console.error(`Failed to send to ${recipientEmail}:`, e.message);
                        }
                    }
                    await Campaign.findByIdAndUpdate(campaign._id, { status: 'sent', sentCount: sentCount });
                }
            } catch (bgErr) {
                console.error('Background email processing error:', bgErr.message);
                await Campaign.findByIdAndUpdate(campaign._id, { status: 'error' }).catch(() => {});
            }
        })().catch(err => console.error('Unhandled background error:', err.message));

    } catch (e) {
        console.error('Email send endpoint error:', e.message);
        res.status(500).json({ success: false, message: 'Server error: ' + e.message });
    }
});

// ── Get Campaign Queue Status ──────────────────────────────────────────────────
app.get('/api/campaigns/:campaignId/status', authMiddleware, async (req, res) => {
    try {
        await connectDB();
        const campaign = await Campaign.findById(req.params.campaignId);
        if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found.' });
        
        const queueCounts = await emailQueue.getJobCounts();
        
        res.json({
            success: true,
            campaign: {
                id: campaign._id,
                name: campaign.name,
                status: campaign.status,
                totalRecipients: campaign.recipientCount,
                sentAt: campaign.sentAt
            },
            queue: queueCounts
        });
    } catch (e) {
        res.status(500).json({ success: false, message: e.message });
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
app.get('/api/health', (req, res) => {
    const health = {
        success: true,
        message: 'Trugydex API running',
        time: new Date(),
        environment: process.env.NODE_ENV || 'development',
        mongodb: isConnected ? 'connected' : 'disconnected',
        config: {
            mongodb: !!process.env.MONGODB_URI,
            jwt: !!process.env.JWT_SECRET,
            gmail: !!process.env.GMAIL_USER && !!process.env.GMAIL_APP_PASSWORD,
            redis: !!process.env.REDIS_URL || !!process.env.REDIS_HOST
        }
    };
    res.json(health);
});

// ── Simple Ping Endpoint (No Auth Required) ────────────────────────────────────
app.get('/api/ping', (req, res) => {
    res.json({ success: true, message: 'API is reachable' });
});

// ── Diagnostic Endpoint (No Auth - For Troubleshooting) ────────────────────────
app.get('/api/diagnose', async (req, res) => {
    const diagnostics = {
        success: true,
        message: 'Diagnostic report',
        environment: {
            NODE_ENV: process.env.NODE_ENV,
            MONGODB_URI_SET: !!process.env.MONGODB_URI,
            REDIS_URL_SET: !!process.env.REDIS_URL,
            REDIS_HOST_SET: !!process.env.REDIS_HOST,
            GMAIL_USER_SET: !!process.env.GMAIL_USER,
            JWT_SECRET_SET: !!process.env.JWT_SECRET
        },
        database: {
            connected: isConnected,
            lastError: null
        },
        queue: {
            status: 'unknown'
        }
    };

    // Test MongoDB connection
    if (!process.env.MONGODB_URI) {
        diagnostics.database.lastError = 'MONGODB_URI is not set';
    } else {
        try {
            await mongoose.connect(process.env.MONGODB_URI, {
                serverSelectionTimeoutMS: 3000,
                connectTimeoutMS: 3000
            });
            diagnostics.database.connected = true;
            diagnostics.database.lastError = null;
            // Disconnect immediately to avoid pooling issues
            await mongoose.connection.close();
        } catch (err) {
            diagnostics.database.lastError = err.message;
        }
    }

    // Test queue
    try {
        if (process.env.REDIS_URL) {
            diagnostics.queue.config = 'REDIS_URL';
        } else if (process.env.REDIS_HOST) {
            diagnostics.queue.config = `REDIS_HOST:REDIS_PORT (${process.env.REDIS_HOST}:${process.env.REDIS_PORT || '6379'})`;
        } else {
            diagnostics.queue.config = 'Using defaults (127.0.0.1:6379)';
        }
        diagnostics.queue.status = 'configured';
    } catch (err) {
        diagnostics.queue.lastError = err.message;
    }

    res.json(diagnostics);
});

app.get('/api/auth/seed', async (req, res) => {
    try {
        if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD || !process.env.ADMIN_NAME) {
            return res.status(400).json({
                success: false,
                message: 'Admin environment variables not configured'
            });
        }
        
        await connectDB();
        const existing = await User.findOne({ email: process.env.ADMIN_EMAIL });
        if (existing) {
            return res.json({
                success: true,
                message: 'Admin already exists: ' + existing.email
            });
        }
        
        const hashed = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
        await User.create({
            name: process.env.ADMIN_NAME || 'Trugydex Admin',
            email: process.env.ADMIN_EMAIL,
            password: hashed,
            role: 'Administrator',
            status: 'approved',
            emailVerified: true
        });
        
        res.json({
            success: true,
            message: 'Admin created! Email: ' + process.env.ADMIN_EMAIL
        });
    } catch (e) {
        console.error('Seed error:', e.message);
        res.status(500).json({ success: false, message: 'Seed failed: ' + e.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        if (!process.env.JWT_SECRET) {
            return res.status(500).json({ success: false, message: 'Server not properly configured. Please contact admin.' });
        }
        
        await connectDB();
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password required.' });
        
        const user = await User.findOne({ email: email.trim() });
        if (!user) return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ success: false, message: 'Invalid email or password.' });
        
        if (user.status === 'pending') return res.status(403).json({ success: false, message: 'Your account is pending admin approval.' });
        if (user.status === 'rejected') return res.status(403).json({ success: false, message: 'Your account has been rejected by admin.' });
        
        user.lastLogin = new Date();
        await user.save();
        
        const token = jwt.sign(
            { userId: user._id, email: user.email, name: user.name, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );
        
        res.json({ 
            success: true,
            token,
            user: { id: user._id, name: user.name, email: user.email, role: user.role }
        });
    } catch (e) {
        console.error('Login error:', e.message);
        res.status(500).json({ success: false, message: 'Login failed: ' + e.message });
    }
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
        await User.create({
            name,
            email: email.trim(),
            password: hashed,
            role: 'Employee',
            status: 'pending'
        });
        
        res.status(201).json({ success: true, message: 'Account created! Awaiting admin approval.' });
    } catch (e) {
        console.error('Signup error:', e.message);
        res.status(500).json({ success: false, message: 'Signup failed: ' + e.message });
    }
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

// ── Get Group Details with All Emails ──────────────────────────────────────
app.get('/api/groups/:id', authMiddleware, async (req, res) => {
    try {
        await connectDB();
        const group = await Group.findById(req.params.id);
        if (!group) return res.status(404).json({ success: false, message: 'Group not found.' });
        res.json({ success: true, group });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── Update Group (Name, Description, Emails) ───────────────────────────────
app.put('/api/groups/:id', authMiddleware, async (req, res) => {
    try {
        await connectDB();
        const { name, description, emails } = req.body;
        
        if (!name) return res.status(400).json({ success: false, message: 'Group name required.' });
        if (!emails || emails.length === 0) return res.status(400).json({ success: false, message: 'At least one valid email required.' });
        
        // Validate emails
        const valid = emails.filter(e => e && typeof e === 'string' && e.includes('@') && e.includes('.'));
        if (valid.length === 0) return res.status(400).json({ success: false, message: 'No valid emails provided.' });
        
        const group = await Group.findByIdAndUpdate(
            req.params.id,
            {
                name,
                description: description || '',
                emails: valid,
                recipientCount: valid.length
            },
            { new: true }
        );
        
        if (!group) return res.status(404).json({ success: false, message: 'Group not found.' });
        
        res.json({ success: true, message: 'Group "' + name + '" updated with ' + valid.length + ' recipients.', group });
    } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ── Delete Group ────────────────────────────────────────────────────────────
app.delete('/api/groups/:id', authMiddleware, async (req, res) => {
    try {
        await connectDB();
        const group = await Group.findByIdAndDelete(req.params.id);
        if (!group) return res.status(404).json({ success: false, message: 'Group not found.' });
        res.json({ success: true, message: 'Group "' + group.name + '" deleted successfully.' });
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
        console.error('NSE Fetch Error:', error);
        res.status(500).json({ success: false, message: error.message || 'Failed to fetch NSE circulars' });
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

// ─── Server Startup ────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

// Only start server in local development, not on Vercel
if (process.env.NODE_ENV !== 'production') {
    const server = app.listen(PORT, () => {
        console.log(`✓ Trugydex API Server running on port ${PORT}`);
        console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`✓ Email queue initialized (Bull/Redis)`);
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
        console.log('SIGTERM received, shutting down gracefully...');
        server.close(async () => {
            await emailQueue.close();
            await mongoose.connection.close();
            console.log('Server closed');
            process.exit(0);
        });
    });
}

module.exports = app;
