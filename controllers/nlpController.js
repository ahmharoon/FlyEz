const asyncHandler = require('express-async-handler');
const { GoogleGenAI } = require('@google/genai');
const Flight = require('../models/Flight');
const User = require('../models/User');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// @desc    Parse NLP prompt and return flight search results
// @route   POST /api/nlp/search
// @access  Private
const nlpSearchFlights = asyncHandler(async (req, res) => {
    const { prompt, chatHistory = [] } = req.body;

    if (!prompt) {
        res.status(400);
        throw new Error('Please provide a prompt');
    }

    // Check and gate on credits (handle legacy users without the nlpCredits field)
    const freshUser = await User.findById(req.user._id);
    const currentCredits = typeof freshUser.nlpCredits === 'number' ? freshUser.nlpCredits : 1;
    if (currentCredits <= 0) {
        res.status(402);
        throw new Error('No AI search credits remaining. Please upgrade to continue.');
    }

    try {
        const currentDate = new Date().toISOString().split('T')[0];

        // Build conversation context from recent history
        let conversationContext = '';
        if (chatHistory.length > 0) {
            const recentHistory = chatHistory.slice(-8);
            conversationContext = '\n\nConversation history (use for context on follow-up questions):\n';
            recentHistory.forEach(msg => {
                conversationContext += `${msg.isUser ? 'User' : 'Assistant'}: ${msg.text}\n`;
            });
            conversationContext += '\n';
        }

        const geminiPrompt = `
You are a flight search assistant. Extract flight search parameters from the user prompt.
The current date is ${currentDate}. Calculate relative dates ("tomorrow", "next Monday") from this date.
${conversationContext}
Return ONLY a valid JSON object. Use IATA airport codes when possible, otherwise use city names.
Format:
{
    "origin": "string (IATA code or city)",
    "destination": "string (IATA code or city)",
    "date": "YYYY-MM-DD" (optional, omit if not mentioned)
}

If this is a follow-up question referencing a previous search (e.g. "what about tomorrow?", "any cheaper ones?"),
use the conversation history above to infer the missing origin/destination.

Current user prompt: "${prompt}"
`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: geminiPrompt,
            config: {
                responseMimeType: "application/json"
            }
        });

        const jsonText = response.text;

        let searchParams = {};
        try {
            searchParams = JSON.parse(jsonText);
        } catch (e) {
            console.error('Failed to parse Gemini response', jsonText);
            return res.status(500).json({ message: 'Error parsing AI response', raw: jsonText });
        }

        console.log("NLP parsed search params:", searchParams);

        // Fetch matching flights
        const axios = require('axios');
        let flights = [];
        try {
            const port = process.env.PORT || 5000;
            const flightResponse = await axios.get(`http://localhost:${port}/api/flights`, {
                params: {
                    origin: searchParams.origin,
                    destination: searchParams.destination,
                    flight_status: ''
                },
                headers: { Authorization: req.headers.authorization }
            });
            flights = flightResponse.data;

            // Apply requested date to results (FYP mock: AviationStack free tier gives today's data)
            if (searchParams.date && flights.length > 0) {
                flights = flights.map(flight => ({
                    ...flight,
                    departureDate: new Date(searchParams.date).toISOString()
                }));
            }

            if (flights && flights.length > 10) {
                flights = flights.slice(0, 10);
            }
        } catch (err) {
            console.error("Failed to fetch from local API", err.message);
            let query = {};
            if (searchParams.origin) query.origin = { $regex: searchParams.origin, $options: 'i' };
            if (searchParams.destination) query.destination = { $regex: searchParams.destination, $options: 'i' };
            flights = await Flight.find(query).limit(10);
        }

        // Decrement credits using $ifNull to handle legacy users without the field
        await User.findByIdAndUpdate(req.user._id, [
            { $set: { nlpCredits: { $subtract: [{ $ifNull: ['$nlpCredits', 1] }, 1] } } }
        ]);
        const updatedUser = await User.findById(req.user._id).select('nlpCredits');

        res.status(200).json({
            detectedParams: searchParams,
            flights,
            remainingCredits: updatedUser.nlpCredits
        });

    } catch (error) {
        if (res.statusCode === 402) throw error;
        console.error('Gemini API Error:', error);
        res.status(500);
        throw new Error('Failed to process NLP request');
    }
});

module.exports = {
    nlpSearchFlights
};
