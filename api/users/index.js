const express = require('express');
const bcrypt = require('bcryptjs');
const connectDB = require('../../lib/db');
const { User } = require('../../lib/models');
const { adminMiddleware } = require('../../lib/auth');

const router = express.Router();

// GET /api/users — Admin: get all users
router.get('/', adminMiddleware, async (req, res) => {
    try {
        await connectDB();
        const users = await User.find({}, '-password').sort({ registeredAt: -1 });
        
        const stats = {
            total: users.length,
            pending: users.filter(u => u.status === 'pending').length,
            approved: users.filter(u => u.status === 'approved').length,
            rejected: users.filter(u => u.status === 'rejected').length
        };

        res.json({ success: true, users, stats });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to fetch users.' });
    }
});

// PUT /api/users/:id/approve — Admin: approve a user
router.put('/:id/approve', adminMiddleware, async (req, res) => {
    try {
        await connectDB();
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { status: 'approved' },
            { new: true, select: '-password' }
        );
        if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
        res.json({ success: true, message: `${user.name} has been approved.`, user });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to approve user.' });
    }
});

// PUT /api/users/:id/reject — Admin: reject a user
router.put('/:id/reject', adminMiddleware, async (req, res) => {
    try {
        await connectDB();
        const user = await User.findByIdAndUpdate(
            req.params.id,
            { status: 'rejected' },
            { new: true, select: '-password' }
        );
        if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
        res.json({ success: true, message: `${user.name} has been rejected.`, user });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to reject user.' });
    }
});

// DELETE /api/users/:id — Admin: delete a user
router.delete('/:id', adminMiddleware, async (req, res) => {
    try {
        await connectDB();
        // Prevent deleting self
        if (req.user.userId === req.params.id) {
            return res.status(400).json({ success: false, message: 'You cannot delete your own account.' });
        }
        await User.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'User deleted successfully.' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to delete user.' });
    }
});

module.exports = router;
