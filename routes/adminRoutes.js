const express = require('express');
const router = express.Router();
const {
    getStats,
    getAllBookings,
    adminCancelBooking,
    getAllUsers,
    updateUserStatus,
} = require('../controllers/adminController');
const { protect, admin } = require('../middleware/auth');

router.use(protect, admin);

router.get('/stats', getStats);
router.get('/bookings', getAllBookings);
router.patch('/bookings/:id/cancel', adminCancelBooking);
router.get('/users', getAllUsers);
router.patch('/users/:id/status', updateUserStatus);

module.exports = router;
