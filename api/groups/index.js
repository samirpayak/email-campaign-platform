const express = require('express');
const connectDB = require('../../lib/db');
const { Group } = require('../../lib/models');
const { authMiddleware } = require('../../lib/auth');

const router = express.Router();

// GET /api/groups — get all groups for logged in user
router.get('/', authMiddleware, async (req, res) => {
    try {
        await connectDB();
        const groups = await Group.find().sort({ createdAt: -1 }).select('-emails -names');
        res.json({ success: true, groups });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch groups.' });
    }
});

// GET /api/groups/:id — get single group with emails
router.get('/:id', authMiddleware, async (req, res) => {
    try {
        await connectDB();
        const group = await Group.findById(req.params.id);
        if (!group) return res.status(404).json({ success: false, message: 'Group not found.' });
        res.json({ success: true, group });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch group.' });
    }
});

// POST /api/groups — create a new group
router.post('/', authMiddleware, async (req, res) => {
    try {
        await connectDB();
        const { name, description, emails, names } = req.body;

        if (!name || !emails || emails.length === 0) {
            return res.status(400).json({ success: false, message: 'Group name and emails are required.' });
        }

        // Validate and filter emails
        const validEmails = emails.filter(e => e && e.includes('@') && e.includes('.'));
        if (validEmails.length === 0) {
            return res.status(400).json({ success: false, message: 'No valid emails found.' });
        }

        const group = new Group({
            name: name.trim(),
            description: description || '',
            emails: validEmails,
            names: names || [],
            recipientCount: validEmails.length,
            createdBy: req.user.userId
        });

        await group.save();

        res.status(201).json({
            success: true,
            message: `Group "${name}" created with ${validEmails.length} recipients.`,
            group: { ...group.toObject(), emails: undefined, names: undefined }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to create group.' });
    }
});

// DELETE /api/groups/:id — delete a group
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        await connectDB();
        await Group.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Group deleted.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to delete group.' });
    }
});

module.exports = router;
