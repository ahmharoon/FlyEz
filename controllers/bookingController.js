const mongoose = require('mongoose');
const asyncHandler = require('express-async-handler');
const Booking = require('../models/Booking');
const Flight = require('../models/Flight');

// @desc    Create new booking
// @route   POST /api/bookings
// @access  Private
const createBooking = asyncHandler(async (req, res) => {
    const { flightId, flight: inlineFlight, numberOfSeats, seatClass, extraLuggage, bundleId, legIndex } = req.body;

    // 1. Resolve a real Flight document.
    // Flights booked from a plain one-way search are already persisted, so
    // `flightId` alone resolves them. Round-trip/multi-city results from the
    // AI assistant are built in-memory from SerpAPI and never saved — they
    // arrive with a synthetic (non-ObjectId) id, so the client also sends
    // the flight's own details inline and we upsert a real document for it
    // here, keyed by flightNumber (the same key flightController.js already
    // uses when caching one-way results).
    let flight = null;
    if (flightId && mongoose.Types.ObjectId.isValid(flightId)) {
        flight = await Flight.findById(flightId);
    }
    if (!flight && inlineFlight?.flightNumber) {
        flight = await Flight.findOneAndUpdate(
            { flightNumber: inlineFlight.flightNumber },
            {
                $setOnInsert: {
                    flightNumber: inlineFlight.flightNumber,
                    airline: inlineFlight.airline,
                    origin: inlineFlight.origin,
                    destination: inlineFlight.destination,
                    departureDate: inlineFlight.departureDate,
                    departureTime: inlineFlight.departureTime,
                    isDirect: inlineFlight.isDirect ?? true,
                    numberOfStops: inlineFlight.numberOfStops ?? 0,
                    availableSeats: inlineFlight.availableSeats,
                    basePrice: inlineFlight.basePrice,
                },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
    }

    if (!flight) {
        res.status(404);
        throw new Error('Flight not found');
    }

    // 2. Verify seat availability
    if (flight.availableSeats < numberOfSeats) {
        res.status(400);
        throw new Error('Not enough seats available');
    }

    // 3. Calculate Total Price
    // Multipliers: Economy (1x), Business (1.5x), First (2.5x)
    let multiplier = 1;
    if (seatClass === 'Business') multiplier = 1.5;
    if (seatClass === 'First') multiplier = 2.5;

    // Extra Luggage cost: $50 per unit (assumption, or could be passed)
    const luggageCost = (extraLuggage || 0) * 50;

    // Price the user actually saw and agreed to at booking time — for a
    // reused flightNumber this may differ slightly from the stored Flight
    // document's basePrice (which is only set once, on first insert).
    const unitPrice = inlineFlight?.basePrice ?? flight.basePrice;
    const totalPaid = (unitPrice * multiplier * numberOfSeats) + luggageCost;

    // 4. Create Booking
    const booking = await Booking.create({
        user: req.user.id,
        flight: flight._id,
        numberOfSeats,
        seatClass,
        extraLuggage,
        totalPaid,
        status: 'Confirmed',
        bundleId: bundleId || null,
        legIndex: bundleId ? legIndex : null,
    });

    // 5. Decrement Flight availableSeats
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
        
    // Filter out bookings where flight is null (e.g., deleted flights)
    const validBookings = bookings.filter(b => b.flight != null);
    
    res.status(200).json(validBookings);
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
