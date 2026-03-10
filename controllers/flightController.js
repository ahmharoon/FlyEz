const asyncHandler = require('express-async-handler');
const Flight = require('../models/Flight');

const axios = require('axios');

const CacheTracker = require('../models/CacheTracker');

// @desc    Get all flights from MongoDB (Cached) or AviationStack (Live)
// @route   GET /api/flights
// @access  Public
const getFlights = asyncHandler(async (req, res) => {
    const { origin, destination, date, flight_status } = req.query;

    try {
        // 1. Check if cache is still fresh (within 8 hours)
        const cacheConfig = await CacheTracker.findOne({ cacheName: 'aviationstack_flights' });
        const EIGHT_HOURS_IN_MS = 8 * 60 * 60 * 1000;
        const now = new Date();

        let isCacheFresh = false;
        if (cacheConfig && (now - cacheConfig.lastUpdated) < EIGHT_HOURS_IN_MS) {
            isCacheFresh = true;
        }

        // 2. Condition A: Cache is Fresh -> Return from MongoDB
        if (isCacheFresh) {
            console.log("Serving flights from MongoDB Cache (No API call made)");
            let query = {};
            if (origin) query.origin = { $regex: origin, $options: 'i' };
            if (destination) query.destination = { $regex: destination, $options: 'i' };
            if (flight_status) query.status = flight_status;

            const cachedFlights = await Flight.find(query);
            return res.status(200).json(cachedFlights);
        }

        // 3. Condition B: Cache is Stale -> Call Aviationstack API
        console.log("Cache is stale or empty. Calling Aviationstack API...");
        const params = {
            access_key: process.env.AVIATIONSTACK_API_KEY,
            limit: 50,
            flight_status: flight_status || 'scheduled'
        };

        if (origin) params.dep_iata = origin;
        if (destination) params.arr_iata = destination;

        const response = await axios.get('http://api.aviationstack.com/v1/flights', { params });
        
        if (!response.data || !response.data.data) {
            return res.status(200).json([]);
        }

        // Map the AviationStack response
        const mappedFlights = response.data.data.map(flight => {
            const randomBasePrice = Math.floor(Math.random() * (800 - 150 + 1)) + 150; 
            let depDate = new Date();
            let depTime = "00:00";
            
            if (flight.departure && flight.departure.scheduled) {
                const dateObj = new Date(flight.departure.scheduled);
                depDate = dateObj;
                depTime = `${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`;
            }

            return {
                flightNumber: flight.flight.iata || flight.flight.number || `UNKNOWN-${Math.random()}`,
                airline: flight.airline.name || "Unknown Airline",
                origin: flight.departure.iata || flight.departure.airport || "Unknown Origin",
                destination: flight.arrival.iata || flight.arrival.airport || "Unknown Destination",
                departureDate: depDate,
                departureTime: depTime,
                isDirect: true,
                numberOfStops: 0,
                availableSeats: Math.floor(Math.random() * 50) + 1,
                basePrice: randomBasePrice,
                status: flight.flight_status
            };
        });

        // 4. Update the MongoDB Cache 
        // Note: Using deleteMany and insertMany to cleanly replace the catalog
        await Flight.deleteMany({});
        const insertedFlights = await Flight.insertMany(mappedFlights);

        // Update the Cache Tracker timestamp
        await CacheTracker.findOneAndUpdate(
            { cacheName: 'aviationstack_flights' }, 
            { lastUpdated: now }, 
            { upsert: true, new: true }
        );

        // 5. Return the newly fetched (and now cached) flights
        res.status(200).json(insertedFlights);

    } catch (error) {
        // Fallback: If AviationStack fails, try to return whatever is in the DB anyway
        console.error('AviationStack API Error or Cache Error:', error.response?.data || error.message);
        try {
            const fallbackFlights = await Flight.find({});
            if (fallbackFlights.length > 0) {
                console.log("Fallback: Returning expired cache due to API failure.");
                return res.status(200).json(fallbackFlights);
            }
        } catch (e) {
            console.error("Fallback failed too.");
        }
        
        res.status(500);
        throw new Error('Failed to fetch live flights and no cache exists');
    }
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
