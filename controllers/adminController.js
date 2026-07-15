const asyncHandler = require('express-async-handler');
const Booking = require('../models/Booking');
const Flight = require('../models/Flight');
const User = require('../models/User');
const CreditPurchase = require('../models/CreditPurchase');

// @desc    Get platform-wide stats for the admin dashboard
// @route   GET /api/admin/stats
// @access  Private/Admin
const getStats = asyncHandler(async (req, res) => {
    const [totalBookings, cancelledBookings, totalUsers, revenueAgg, creditsAgg] =
        await Promise.all([
            Booking.countDocuments(),
            Booking.countDocuments({ status: 'Cancelled' }),
            User.countDocuments(),
            Booking.aggregate([
                { $match: { status: 'Confirmed' } },
                { $group: { _id: null, total: { $sum: '$totalPaid' } } },
            ]),
            CreditPurchase.aggregate([
                { $group: { _id: null, total: { $sum: '$credits' } } },
            ]),
        ]);

    res.status(200).json({
        totalBookings,
        confirmedBookings: totalBookings - cancelledBookings,
        cancelledBookings,
        totalRevenue: revenueAgg[0]?.total || 0,
        totalCreditsBought: creditsAgg[0]?.total || 0,
        totalUsers,
    });
});

// @desc    List every booking on the platform
// @route   GET /api/admin/bookings
// @access  Private/Admin
const getAllBookings = asyncHandler(async (req, res) => {
    const bookings = await Booking.find()
        .populate('flight')
        .populate('user', 'fullName email')
        .sort('-createdAt');

    res.status(200).json(bookings.filter((b) => b.flight != null));
});

// @desc    Cancel any booking (no ownership restriction)
// @route   PATCH /api/admin/bookings/:id/cancel
// @access  Private/Admin
const adminCancelBooking = asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
        res.status(404);
        throw new Error('Booking not found');
    }

    if (booking.status === 'Cancelled') {
        res.status(400);
        throw new Error('Booking already cancelled');
    }

    booking.status = 'Cancelled';
    await booking.save();

    const flight = await Flight.findById(booking.flight);
    if (flight) {
        flight.availableSeats += booking.numberOfSeats;
        await flight.save();
    }

    res.status(200).json(booking);
});

// @desc    List every user on the platform
// @route   GET /api/admin/users
// @access  Private/Admin
const getAllUsers = asyncHandler(async (req, res) => {
    const users = await User.find()
        .select('fullName email phoneNumber role status nlpCredits createdAt')
        .sort('-createdAt');

    res.status(200).json(users);
});

// @desc    Change a user's status
// @route   PATCH /api/admin/users/:id/status
// @access  Private/Admin
const updateUserStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;
    const allowedStatuses = ['verified', 'unverified', 'processing', 'suspended'];

    if (!allowedStatuses.includes(status)) {
        res.status(400);
        throw new Error(`Status must be one of: ${allowedStatuses.join(', ')}`);
    }

    const user = await User.findByIdAndUpdate(
        req.params.id,
        { status },
        { new: true }
    ).select('fullName email phoneNumber role status nlpCredits createdAt');

    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    res.status(200).json(user);
});

module.exports = {
    getStats,
    getAllBookings,
    adminCancelBooking,
    getAllUsers,
    updateUserStatus,
};
