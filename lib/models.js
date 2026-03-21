const mongoose = require('mongoose');

// ── User Model ──────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
    name:         { type: String, required: true, trim: true },
    email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
    password:     { type: String, required: true },
    role:         { type: String, enum: ['Administrator', 'Manager', 'Employee'], default: 'Employee' },
    status:       { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    emailVerified:{ type: Boolean, default: false },
    registeredAt: { type: Date, default: Date.now },
    lastLogin:    { type: Date }
});

// ── Group Model ─────────────────────────────────────────────────────────────
const groupSchema = new mongoose.Schema({
    name:           { type: String, required: true, trim: true },
    description:    { type: String, trim: true },
    emails:         [{ type: String }],
    names:          [{ type: String }],
    recipientCount: { type: Number, default: 0 },
    createdBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt:      { type: Date, default: Date.now }
});

// ── Campaign Model ──────────────────────────────────────────────────────────
const campaignSchema = new mongoose.Schema({
    name:           { type: String, required: true, trim: true },
    groupId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
    groupName:      { type: String },
    subject:        { type: String, required: true },
    body:           { type: String, required: true },
    recipientCount: { type: Number, default: 0 },
    attachments:    [{ type: String }],
    status:         { type: String, enum: ['sent', 'draft', 'failed'], default: 'sent' },
    sentBy:         { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    sentAt:         { type: Date, default: Date.now }
});

const User     = mongoose.models.User     || mongoose.model('User',     userSchema);
const Group    = mongoose.models.Group    || mongoose.model('Group',    groupSchema);
const Campaign = mongoose.models.Campaign || mongoose.model('Campaign', campaignSchema);

module.exports = { User, Group, Campaign };
