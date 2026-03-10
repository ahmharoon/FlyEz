const asyncHandler = require('express-async-handler');
const Flight = require('../models/Flight');

const axios = require('axios');

// @desc    Get all flights from AviationStack (Live)
// @route   GET /api/flights
// @access  Public
const getFlights = asyncHandler(async (req, res) => {
    const { origin, destination, date, flight_status } = req.query;

    try {
        // Build query params for Aviationstack
        // Documentation: http://api.aviationstack.com/v1/flights
        const params = {
            access_key: process.env.AVIATIONSTACK_API_KEY,
            limit: 50, // Limit to 50 flights for performance
        };

        // Aviationstack has specific query parameters, map our frontend queries to them:
        if (flight_status) {
            params.flight_status = flight_status;
        } else {
            params.flight_status = 'scheduled'; // Default to future flights
        }

        // Aviationstack uses IATA codes for airports (e.g. 'JFK', 'LHR')
        // We will pass these directly if the frontend sends them 
        if (origin) params.dep_iata = origin;
        if (destination) params.arr_iata = destination;

        // Perform the API request to AviationStack
        const response = await axios.get('http://api.aviationstack.com/v1/flights', { params });
        
        if (!response.data || !response.data.data) {
            return res.status(200).json([]);
        }

        // Map the AviationStack response exactly to our existing Mongoose 'Flight' model schema 
        // to prevent the Flutter frontend from breaking.
        const mappedFlights = response.data.data.map(flight => {
            
            // Generate a random base price since AviationStack free tier does not provide pricing
            const randomBasePrice = Math.floor(Math.random() * (800 - 150 + 1)) + 150; 
            
            // Extract the date and time from the departure scheduled ISO string
            let depDate = new Date();
            let depTime = "00:00";
            
            if (flight.departure && flight.departure.scheduled) {
                const dateObj = new Date(flight.departure.scheduled);
                depDate = dateObj;
                depTime = `${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}`;
            }

            return {
                _id: flight.flight.iata || flight.flight.number || Math.random().toString(), // Mock Mongo ID
                flightNumber: flight.flight.iata || flight.flight.number || "UNKNOWN",
                airline: flight.airline.name || "Unknown Airline",
                origin: flight.departure.iata || flight.departure.airport || "Unknown Origin",
                destination: flight.arrival.iata || flight.arrival.airport || "Unknown Destination",
                departureDate: depDate,
                departureTime: depTime,
                isDirect: true, // Assuming direct for simplicity
                numberOfStops: 0,
                availableSeats: Math.floor(Math.random() * 50) + 1, // Mock seats
                basePrice: randomBasePrice,
                status: flight.flight_status // Bonus mapping
            };
        });

        res.status(200).json(mappedFlights);

    } catch (error) {
        const errorDetails = error.response?.data || error.message;
        console.error('AviationStack API Error:', errorDetails);
        res.status(500);
        throw new Error(`Failed to fetch live flights: ${JSON.stringify(errorDetails)}`);
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
