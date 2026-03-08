const mongoose = require('mongoose');

const flightSchema = new mongoose.Schema({
    flightNumber: {
        type: String,
        required: [true, 'Please add a flight number'],
        unique: true,
    },
    airline: {
        type: String,
        required: [true, 'Please add an airline'],
    },
    origin: {
        type: String,
        required: [true, 'Please add an origin'],
    },
    destination: {
        type: String,
        required: [true, 'Please add a destination'],
    },
    departureDate: {
        type: Date,
        required: [true, 'Please add a departure date'],
    },
    departureTime: {
        type: String,
        required: [true, 'Please add a departure time'],
    },
    isDirect: {
        type: Boolean,
        default: true,
    },
    numberOfStops: {
        type: Number,
        default: 0,
    },
    availableSeats: {
        type: Number,
        required: [true, 'Please add available seats count'],
    },
    basePrice: {
        type: Number,
        required: [true, 'Please add a base price'],
    },
}, {
    timestamps: true,
});

module.exports = mongoose.model('Flight', flightSchema);
