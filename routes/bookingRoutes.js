const express = require('express');
const router = express.Router();
const { createBooking, getMyBookings, cancelBooking } = require('../controllers/bookingController');
const { protect } = require('../middleware/auth');

router.post('/', protect, createBooking);
router.get('/my-bookings', protect, getMyBookings);
router.patch('/cancel/:id', protect, cancelBooking);

module.exports = router;
