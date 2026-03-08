const asyncHandler = require('express-async-handler');
const Booking = require('../models/Booking');
const Flight = require('../models/Flight');

// @desc    Create new booking
// @route   POST /api/bookings
// @access  Private
const createBooking = asyncHandler(async (req, res) => {
    const { flightId, numberOfSeats, seatClass, extraLuggage } = req.body;

    // 1. Verify seat availability
    const flight = await Flight.findById(flightId);
    if (!flight) {
        res.status(404);
        throw new Error('Flight not found');
    }

    if (flight.availableSeats < numberOfSeats) {
        res.status(400);
        throw new Error('Not enough seats available');
    }

    // 2. Calculate Total Price
    // Multipliers: Economy (1x), Business (1.5x), First (2.5x)
    let multiplier = 1;
    if (seatClass === 'Business') multiplier = 1.5;
    if (seatClass === 'First') multiplier = 2.5;

    // Extra Luggage cost: $50 per unit (assumption, or could be passed)
    // Prompt just said "Calculate totalPaid...". I'll assume extraLuggage is just a number.
    // Let's assume $50 per extra luggage unit.
    const luggageCost = (extraLuggage || 0) * 50;

    const totalPaid = (flight.basePrice * multiplier * numberOfSeats) + luggageCost;

    // 3. Create Booking
    const booking = await Booking.create({
        user: req.user.id,
        flight: flightId,
        numberOfSeats,
        seatClass,
        extraLuggage,
        totalPaid,
        status: 'Confirmed'
    });

    // 4. Decrement Flight availableSeats
    flight.availableSeats -= numberOfSeats;
    await flight.save();

    res.status(201).json(booking);
});

// @desc    Get logged user bookings
// @route   GET /api/bookings/my-bookings
// @access  Private
const getMyBookings = asyncHandler(async (req, res) => {
    const bookings = await Booking.find({ user: req.user.id })
        .populate('flight')
        .sort('-createdAt'); // Latest first
    res.status(200).json(bookings);
});

// @desc    Cancel booking
// @route   PATCH /api/bookings/cancel/:id
// @access  Private
const cancelBooking = asyncHandler(async (req, res) => {
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
        res.status(404);
        throw new Error('Booking not found');
    }

    // Check if user owns the booking
    if (booking.user.toString() !== req.user.id) {
        res.status(401);
        throw new Error('User not authorized');
    }

    if (booking.status === 'Cancelled') {
        res.status(400);
        throw new Error('Booking already cancelled');
    }

    // 1. Set status to Cancelled
    booking.status = 'Cancelled';
    await booking.save();

    // 2. Increment Flight availableSeats
    const flight = await Flight.findById(booking.flight);
    if (flight) {
        flight.availableSeats += booking.numberOfSeats;
        await flight.save();
    }

    res.status(200).json(booking);
});

module.exports = {
    createBooking,
    getMyBookings,
    cancelBooking,
};
