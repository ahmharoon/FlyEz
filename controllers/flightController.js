const crypto = require('crypto');
const asyncHandler = require('express-async-handler');
const Flight = require('../models/Flight');
const CacheTracker = require('../models/CacheTracker');

// Maps one SerpAPI Google Flights "flight option" into our Flight shape.
// Shared by the single-route path and the multi-city chaining loop below —
// `fallbackOrigin`/`fallbackDestination` are only used when SerpAPI omits an
// airport id, which shouldn't normally happen but keeps this defensive.
const mapFlightOption = (flightOption, { fallbackOrigin, fallbackDestination, isRoundTrip, isMultiCity, existingPrices, legIndex }) => {
    const firstLeg = flightOption.flights[0];
    const lastLeg = flightOption.flights[flightOption.flights.length - 1];
    const fNumber = firstLeg.flight_number || `FL-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    let depTime = "00:00";
    let depDate = new Date();
    if (firstLeg.departure_airport?.time) {
        depDate = new Date(firstLeg.departure_airport.time);
        depTime = `${depDate.getHours().toString().padStart(2, '0')}:${depDate.getMinutes().toString().padStart(2, '0')}`;
    }

    let arrTime = "00:00";
    if (lastLeg.arrival_airport?.time) {
        const arrDate = new Date(lastLeg.arrival_airport.time);
        arrTime = `${arrDate.getHours().toString().padStart(2, '0')}:${arrDate.getMinutes().toString().padStart(2, '0')}`;
    }

    return {
        // Round-trip and multi-city results are built in-memory from SerpAPI
        // and never saved to MongoDB, so there's no real document _id — but
        // FlightModel.fromJson on the frontend requires one (it crashes with
        // an uncaught TypeError, not a catchable Exception, if it's missing).
        // A synthetic id keeps that contract satisfied.
        _id: crypto.randomUUID(),
        flightNumber: fNumber,
        airline: firstLeg.airline || "Unknown Airline",
        airlineLogo: firstLeg.airline_logo || null,
        origin: firstLeg.departure_airport?.id || fallbackOrigin || '',
        destination: lastLeg.arrival_airport?.id || fallbackDestination || '',
        departureDate: depDate,
        departureTime: depTime,
        arrivalTime: arrTime,
        totalDuration: flightOption.total_duration || null,
        isDirect: !flightOption.layovers || flightOption.layovers.length === 0,
        numberOfStops: flightOption.layovers ? flightOption.layovers.length : 0,
        layovers: flightOption.layovers || [],
        legs: flightOption.flights.map(leg => ({
            flightNumber: leg.flight_number,
            airline: leg.airline,
            airlineLogo: leg.airline_logo || null,
            from: leg.departure_airport?.id,
            fromName: leg.departure_airport?.name,
            to: leg.arrival_airport?.id,
            toName: leg.arrival_airport?.name,
            departure: leg.departure_airport?.time,
            arrival: leg.arrival_airport?.time,
            duration: leg.duration,
            airplane: leg.airplane || null,
            travelClass: leg.travel_class || null,
        })),
        availableSeats: Math.floor(Math.random() * 50) + 1,
        basePrice: flightOption.price || existingPrices[fNumber] || Math.floor(Math.random() * (800 - 150 + 1)) + 150,
        tripType: isRoundTrip ? 'round_trip' : isMultiCity ? 'multi_city' : 'one_way',
        departureToken: flightOption.departure_token || null,
        // Only meaningful for multi-city — which leg of the itinerary this
        // option belongs to, so callers can group/display them separately.
        legIndex: isMultiCity ? legIndex : null,
        status: "scheduled",
    };
};

// Core flight-search logic, shared by the public GET /api/flights route and
// the NLP assistant (nlpController) — both need the exact same SerpAPI/cache
// behaviour, so this is a plain function returning the flights array rather
// than an Express handler. Callers that aren't `getFlights` itself MUST
// call this directly (in-process) rather than looping back over HTTP to
// this same server: an HTTP self-call to "localhost" is unreliable in a
// serverless deployment (there's no guarantee a request to the function's
// own host actually reaches a live listener), and silently falling through
// to a broad, unscoped fallback query on failure is what used to make the
// NLP assistant return random unrelated flights.
const searchFlights = async (filters) => {
    const {
        origin, destination, date, flight_status,
        type, return_date, travel_class,
        adults, children, infants_in_seat, infants_on_lap,
        stops, bags, max_price, sort_by,
        multi_city_json, include_airlines, exclude_airlines,
        layover_duration, max_duration,
        outbound_times, return_times,
        emissions, currency,
    } = filters;

    const tripType = String(type || '2');
    const isMultiCity = tripType === '3';
    const isRoundTrip = tripType === '1';

    try {
        // For one-way with no specific route, serve from cache/DB
        if (!isMultiCity && (!origin || !destination)) {
            const cacheConfig = await CacheTracker.findOne({ cacheName: 'aviationstack_flights' });
            const EIGHT_HOURS_IN_MS = 8 * 60 * 60 * 1000;
            const now = new Date();
            const isCacheFresh = cacheConfig && (now - cacheConfig.lastUpdated) < EIGHT_HOURS_IN_MS;

            if (isCacheFresh) {
                let query = {};
                if (flight_status) query.status = flight_status;
                const cachedFlights = await Flight.find(query);
                if (cachedFlights.length > 0) return cachedFlights;
            }

            const fallback = await Flight.find({}).limit(50);
            return fallback;
        }

        // For one-way with a specific route and fresh cache, try serving from DB first
        if (!isMultiCity && !isRoundTrip) {
            const cacheConfig = await CacheTracker.findOne({ cacheName: 'aviationstack_flights' });
            const EIGHT_HOURS_IN_MS = 8 * 60 * 60 * 1000;
            const now = new Date();
            const isCacheFresh = cacheConfig && (now - cacheConfig.lastUpdated) < EIGHT_HOURS_IN_MS;

            if (isCacheFresh) {
                let query = {};
                if (origin) query.origin = { $regex: origin, $options: 'i' };
                if (destination) query.destination = { $regex: destination, $options: 'i' };
                if (flight_status) query.status = flight_status;
                const cachedFlights = await Flight.find(query);
                if (cachedFlights.length > 0) {
                    console.log("Serving flights from MongoDB Cache");
                    return cachedFlights;
                }
            }
        }

        // Fetch existing prices so we can persist them
        const existingFlights = await Flight.find({});
        const existingPrices = {};
        existingFlights.forEach(f => { existingPrices[f.flightNumber] = f.basePrice; });

        console.log(`Using SerpAPI Google Flights — type=${tripType}`);
        // Calling SerpAPI directly via axios rather than the
        // google-search-results-nodejs wrapper: that library does a
        // synchronous `throw` inside its HTTP response callback whenever
        // SerpAPI returns a non-200 status, which happens *outside* any
        // promise/try-catch we control and crashes the whole Node process
        // instead of rejecting a promise. axios rejects normally, so it's
        // actually catchable.
        const axios = require('axios');
        const getSerpApiData = async (params) => {
            const response = await axios.get('https://serpapi.com/search.json', {
                params: { ...params, api_key: process.env.SERPAPI_API_KEY },
            });
            if (response.data.error) throw new Error(response.data.error);
            return response.data;
        };

        // Filters shared by every SerpAPI call below, single-route or chained.
        const baseParams = { engine: "google_flights", currency: currency || "USD", hl: "en" };
        if (travel_class) baseParams.travel_class = travel_class;
        if (adults) baseParams.adults = adults;
        if (children) baseParams.children = children;
        if (infants_in_seat) baseParams.infants_in_seat = infants_in_seat;
        if (infants_on_lap) baseParams.infants_on_lap = infants_on_lap;
        if (stops) baseParams.stops = stops;
        if (bags) baseParams.bags = bags;
        if (max_price) baseParams.max_price = max_price;
        if (sort_by) baseParams.sort_by = sort_by;
        if (include_airlines) baseParams.include_airlines = include_airlines;
        if (exclude_airlines) baseParams.exclude_airlines = exclude_airlines;
        if (layover_duration) baseParams.layover_duration = layover_duration;
        if (max_duration) baseParams.max_duration = max_duration;
        if (emissions) baseParams.emissions = emissions;

        if (isMultiCity && multi_city_json) {
            // Google Flights' multi-city API only returns options for the
            // FIRST leg in one call — getting the next leg requires a fresh
            // call passing that leg's chosen `departure_token` (and dropping
            // `type`/`multi_city_json`, per SerpAPI's docs). We chain through
            // by continuing with the cheapest option at each hop, so a single
            // request to us returns priced options for every leg.
            const legs = JSON.parse(multi_city_json);
            const MAX_PER_LEG = 5;
            const legsWithFlights = [];
            let departureToken = null;

            for (let i = 0; i < legs.length; i++) {
                // Every call in the chain — including continuations — needs
                // `type: 3` and the SAME original `multi_city_json`; only
                // `departure_token` gets added for legs after the first. This
                // was verified directly against SerpAPI: dropping either
                // `type` or `multi_city_json` on a continuation call fails
                // with "Missing multi_city_json parameter" / defaults `type`
                // to round-trip (which then demands a return_date).
                const params = { ...baseParams, type: "3", multi_city_json };
                if (i === 0) {
                    if (outbound_times) params.outbound_times = outbound_times;
                } else {
                    params.departure_token = departureToken;
                }

                console.log(`Multi-city leg ${i + 1}/${legs.length} SerpAPI params:`, params);

                let data;
                try {
                    data = await getSerpApiData(params);
                } catch (err) {
                    // Can't continue the chain without this leg — return
                    // whatever earlier legs we already have instead of
                    // failing the whole request.
                    console.error(`Multi-city leg ${i + 1} failed, stopping chain:`, err.response?.data?.error || err.message);
                    break;
                }
                const rawFlights = [...(data.best_flights || []), ...(data.other_flights || [])];

                legsWithFlights.push({
                    legIndex: i,
                    from: legs[i].departure_id,
                    to: legs[i].arrival_id,
                    date: legs[i].date,
                    flights: rawFlights.slice(0, MAX_PER_LEG).map(f => mapFlightOption(f, {
                        fallbackOrigin: legs[i].departure_id,
                        fallbackDestination: legs[i].arrival_id,
                        isRoundTrip: false,
                        isMultiCity: true,
                        existingPrices,
                        legIndex: i,
                    })),
                });

                if (rawFlights.length === 0) break; // nothing to chain forward with

                const cheapest = rawFlights.reduce(
                    (min, f) => ((f.price ?? Infinity) < (min.price ?? Infinity) ? f : min),
                    rawFlights[0]
                );
                departureToken = cheapest.departure_token || null;
                if (!departureToken) break; // final leg has no further token
            }

            const mappedFlights = legsWithFlights.flatMap(l => l.flights);
            return mappedFlights;
        }

        // Single-route (one-way / round-trip)
        let outboundDate = date;
        if (!outboundDate) {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            outboundDate = tomorrow.toISOString().split('T')[0];
        }

        const serpParams = {
            ...baseParams,
            type: tripType,
            departure_id: origin,
            arrival_id: destination,
            outbound_date: outboundDate,
        };
        if (isRoundTrip && return_date) serpParams.return_date = return_date;
        if (outbound_times) serpParams.outbound_times = outbound_times;
        if (return_times) serpParams.return_times = return_times;

        console.log("SerpAPI params:", serpParams);

        const data = await getSerpApiData(serpParams);
        const rawFlights = [...(data.best_flights || []), ...(data.other_flights || [])];

        if (rawFlights.length === 0) {
            return [];
        }

        const mappedFlights = rawFlights.map(f => mapFlightOption(f, {
            fallbackOrigin: origin,
            fallbackDestination: destination,
            isRoundTrip,
            isMultiCity: false,
            existingPrices,
        }));

        // Only cache one-way searches in MongoDB
        if (!isRoundTrip && mappedFlights.length > 0) {
            const bulkOps = mappedFlights.map(({ _id, ...flightWithoutId }) => ({
                updateOne: {
                    // `_id` on `flight` is a synthetic crypto.randomUUID() (see
                    // mapFlightOption) needed only so the frontend's model has
                    // something non-null — it's never a real Mongo ObjectId.
                    // $set-ing it here made every upsert of a not-yet-cached
                    // flight throw a CastError (silently caught below), which
                    // meant a fresh SerpAPI result would fail to save and this
                    // whole search would fall through to whatever was already
                    // cached for the route — stale or entirely unrelated data.
                    filter: { flightNumber: flightWithoutId.flightNumber },
                    update: { $set: flightWithoutId },
                    upsert: true
                }
            }));
            await Flight.bulkWrite(bulkOps);

            const now = new Date();
            await CacheTracker.findOneAndUpdate(
                { cacheName: 'aviationstack_flights' },
                { lastUpdated: now },
                { upsert: true, new: true }
            );

            const savedFlightNumbers = mappedFlights.map(f => f.flightNumber);
            const finalSaved = await Flight.find({ flightNumber: { $in: savedFlightNumbers } });
            return finalSaved;
        }

        // Round-trip: return mapped results directly (not cached)
        return mappedFlights;

    } catch (error) {
        console.error('Flight fetch error:', error.response?.data || error.message);

        // Only serve cached flights that actually match the requested route —
        // never the whole collection, which would silently pass off unrelated
        // flights (e.g. a different route entirely) as this search's result.
        if (!isMultiCity && origin && destination) {
            try {
                const fallbackFlights = await Flight.find({
                    origin: { $regex: origin, $options: 'i' },
                    destination: { $regex: destination, $options: 'i' },
                });
                if (fallbackFlights.length > 0) {
                    console.log("Fallback: Returning cached flights matching this route due to API failure.");
                    return fallbackFlights;
                }
            } catch (e) {
                console.error("Fallback query failed too.");
            }
        }

        // No matching flights, cached or otherwise — this is a legitimate
        // "no flights found" outcome, not a server error.
        return [];
    }
};

// @desc    Get flights — one-way, round-trip, or multi-city via SerpAPI Google Flights
// @route   GET /api/flights
// @access  Public
const getFlights = asyncHandler(async (req, res) => {
    const flights = await searchFlights(req.query);
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
    searchFlights,
};
