const asyncHandler = require('express-async-handler');
const Flight = require('../models/Flight');

// @desc    Get all flights with search filters
// @route   GET /api/flights
// @access  Public
const getFlights = asyncHandler(async (req, res) => {
    const { origin, destination, date, time, stops, seatClass, maxPrice } = req.query;
    let query = {};

    if (origin) {
        query.origin = { $regex: origin, $options: 'i' };
    }
    if (destination) {
        query.destination = { $regex: destination, $options: 'i' };
    }
    if (date) {
        const startDate = new Date(date);
        const endDate = new Date(date);
        endDate.setDate(endDate.getDate() + 1);
        query.departureDate = { $gte: startDate, $lt: endDate };
    }
    if (time) {
        // Partial match for time (e.g. "10", "10:30")
        query.departureTime = { $regex: time, $options: 'i' };
    }
    if (stops) {
        query.numberOfStops = Number(stops);
    }

    let flights = await Flight.find(query);

    // Filter by Price if maxPrice is provided
    if (maxPrice) {
        const max = Number(maxPrice);
        const cls = seatClass || 'Economy';
        let multiplier = 1;

        if (cls === 'Business') multiplier = 1.5;
        if (cls === 'First') multiplier = 2.5;

        flights = flights.filter(flight => {
            const price = flight.basePrice * multiplier;
            return price <= max;
        });
    }

    res.status(200).json(flights);
});

// @desc    Get flight details
// @route   GET /api/flights/:id
// @access  Public
const getFlightById = asyncHandler(async (req, res) => {
    const flight = await Flight.findById(req.params.id);

    if (!flight) {
        res.status(404);
        throw new Error('Flight not found');
    }

    res.status(200).json(flight);
});

// @desc    Create a flight
// @route   POST /api/flights
// @access  Private (Admin)
const createFlight = asyncHandler(async (req, res) => {
    const {
        flightNumber,
        airline,
        origin,
        destination,
        departureDate,
        departureTime,
        isDirect,
        numberOfStops,
        availableSeats,
        basePrice,
    } = req.body;

    if (!flightNumber || !airline || !origin || !destination || !departureDate || !departureTime || !availableSeats || !basePrice) {
        res.status(400);
        throw new Error('Please add all required fields');
    }

    const flightExists = await Flight.findOne({ flightNumber });
    if (flightExists) {
        res.status(400);
        throw new Error('Flight already exists');
    }

    const flight = await Flight.create({
        flightNumber,
        airline,
        origin,
        destination,
        departureDate,
        departureTime,
        isDirect,
        numberOfStops,
        availableSeats,
        basePrice,
    });

    res.status(201).json(flight);
});

module.exports = {
    getFlights,
    getFlightById,
    createFlight,
};
