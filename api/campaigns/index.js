const express = require('express');
const connectDB = require('../../lib/db');
const { Campaign, Group } = require('../../lib/models');
const { authMiddleware } = require('../../lib/auth');

const router = express.Router();

// GET /api/campaigns — get all campaigns
router.get('/', authMiddleware, async (req, res) => {
    try {
        await connectDB();
        const campaigns = await Campaign.find().sort({ sentAt: -1 });
        res.json({ success: true, campaigns });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch campaigns.' });
    }
});

// POST /api/campaigns — create/save a campaign
router.post('/', authMiddleware, async (req, res) => {
    try {
        await connectDB();
        const { name, groupId, subject, body, attachments } = req.body;

        if (!name || !groupId || !subject || !body) {
            return res.status(400).json({ success: false, message: 'All campaign fields are required.' });
        }

        // Get group details
        const group = await Group.findById(groupId).select('name recipientCount');
        if (!group) {
            return res.status(404).json({ success: false, message: 'Selected group not found.' });
        }

        const campaign = new Campaign({
            name: name.trim(),
            groupId,
            groupName: group.name,
            subject: subject.trim(),
            body: body.trim(),
            recipientCount: group.recipientCount,
            attachments: attachments || [],
            status: 'sent',
            sentBy: req.user.userId
        });

        await campaign.save();

        res.status(201).json({
            success: true,
            message: `Campaign "${name}" saved successfully.`,
            campaign
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to save campaign.' });
    }
});

// GET /api/campaigns/stats — dashboard stats
router.get('/stats', authMiddleware, async (req, res) => {
    try {
        await connectDB();
        const { Group, Campaign } = require('../../lib/models');
        const totalGroups    = await Group.countDocuments();
        const totalRecipients = await Group.aggregate([{ $group: { _id: null, total: { $sum: '$recipientCount' } } }]);
        const totalCampaigns = await Campaign.countDocuments();

        res.json({
            success: true,
            stats: {
                totalGroups,
                totalRecipients: totalRecipients[0]?.total || 0,
                totalCampaigns
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch stats.' });
    }
});

module.exports = router;
