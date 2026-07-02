const asyncHandler = require('express-async-handler');
const Flight = require('../models/Flight');
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
            
            // If we actually found cached flights matching the query, return them.
            if (cachedFlights.length > 0) {
                return res.status(200).json(cachedFlights);
            }
            
            // If this was a general "All Flights" query (no origin/dest) and we have some flights in the DB, return them
            if (Object.keys(query).length === 0) {
                const totalFlights = await Flight.countDocuments();
                if (totalFlights > 0) {
                    return res.status(200).json(cachedFlights);
                }
            }
            
            // Otherwise, we either have a completely empty DB, or the specific search (e.g. LHE -> KHI) 
            // wasn't found in our small 50-flight cache. Fall through to fetch it directly from Aviationstack!
            console.log("No matches found in cache for query, or cache is completely empty. Falling through to live API.");
        }

        // Fetch existing flights so we can persist their prices permanently!
        const existingFlights = await Flight.find({});
        const existingPrices = {};
        existingFlights.forEach(f => { existingPrices[f.flightNumber] = f.basePrice; });

        let mappedFlights = [];

        // 3. Condition B: Cache is Stale — only search if route provided (SerpAPI)
        if (!origin || !destination) {
            // No route specified and cache is stale/empty — return whatever is in DB
            const fallback = await Flight.find({}).limit(50);
            return res.status(200).json(fallback);
        }

        console.log("Using SerpAPI Google Flights for specific route...");
        const SerpApi = require('google-search-results-nodejs');
        const search = new SerpApi.GoogleSearch(process.env.SERPAPI_API_KEY);

        let outboundDate = date;
        if (!outboundDate) {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            outboundDate = tomorrow.toISOString().split('T')[0];
        }

        const serpParams = {
            engine: "google_flights",
            departure_id: origin,
            arrival_id: destination,
            outbound_date: outboundDate,
            currency: "USD",
            hl: "en",
            type: "2",
        };

        const getSerpApiData = () => new Promise((resolve, reject) => {
            search.json(serpParams, (data) => {
                if (data.error) reject(new Error(data.error));
                else resolve(data);
            });
        });

        const data = await getSerpApiData();
        const rawFlights = [...(data.best_flights || []), ...(data.other_flights || [])];

        if (rawFlights.length === 0) {
            return res.status(200).json([]);
        }

        mappedFlights = rawFlights.map(flightOption => {
            const firstLeg = flightOption.flights[0];
            const lastLeg = flightOption.flights[flightOption.flights.length - 1];
            const fNumber = firstLeg.flight_number || `UNKNOWN-${Math.random()}`;

            let depTime = "00:00";
            let depDate = new Date();
            if (firstLeg.departure_airport && firstLeg.departure_airport.time) {
                depDate = new Date(firstLeg.departure_airport.time);
                depTime = `${depDate.getHours().toString().padStart(2, '0')}:${depDate.getMinutes().toString().padStart(2, '0')}`;
            }

            return {
                flightNumber: fNumber,
                airline: firstLeg.airline || "Unknown Airline",
                origin: firstLeg.departure_airport.id || origin,
                destination: lastLeg.arrival_airport.id || destination,
                departureDate: depDate,
                departureTime: depTime,
                isDirect: !flightOption.layovers,
                numberOfStops: flightOption.layovers ? flightOption.layovers.length : 0,
                availableSeats: Math.floor(Math.random() * 50) + 1,
                basePrice: flightOption.price || existingPrices[fNumber] || Math.floor(Math.random() * (800 - 150 + 1)) + 150,
                status: "scheduled",
            };
        });

        // 4. Update the MongoDB Cache Gracefully
        // Instead of wiping the DB, we bulk upsert. This lets the mock cache grow
        // dynamically, allowing you to search multiple routes without un-learning the previous ones!
        if (mappedFlights.length > 0) {
            const bulkOps = mappedFlights.map(flight => ({
                updateOne: {
                    filter: { flightNumber: flight.flightNumber },
                    update: { $set: flight },
                    upsert: true
                }
            }));
            await Flight.bulkWrite(bulkOps);
        }

        // Update the Cache Tracker timestamp
        await CacheTracker.findOneAndUpdate(
            { cacheName: 'aviationstack_flights' }, 
            { lastUpdated: now }, 
            { upsert: true, new: true }
        );

        // Fetch the fully saved flights back out of MongoDB so they have their true ObjectId "_id" for booking!
        const savedFlightNumbers = mappedFlights.map(f => f.flightNumber);
        const finalSavedFlights = await Flight.find({ flightNumber: { $in: savedFlightNumbers } });
        res.status(200).json(finalSavedFlights);

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
