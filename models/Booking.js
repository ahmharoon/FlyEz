const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User',
    },
    flight: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'Flight',
    },
    numberOfSeats: {
        type: Number,
        required: [true, 'Please add number of seats'],
        min: 1,
    },
    seatClass: {
        type: String,
        enum: ['Economy', 'Business', 'First'],
        default: 'Economy',
    },
    extraLuggage: {
        type: Number,
        default: 0,
    },
    totalPaid: {
        type: Number,
        required: true,
    },
    status: {
        type: String,
        enum: ['Confirmed', 'Cancelled'],
        default: 'Confirmed',
    },
    // Set when this booking is one leg of a multi-city bundle booked
    // together (e.g. from the AI assistant's "Best Value Bundle") — every
    // leg of the same bundle shares this id so My Bookings can group them
    // back into a single card. Null for a standalone single-flight booking.
    bundleId: {
        type: String,
        default: null,
    },
    // This leg's position within its bundle (0-based). Null when bundleId
    // is null.
    legIndex: {
        type: Number,
        default: null,
    },
}, {
    timestamps: true,
});

module.exports = mongoose.model('Booking', bookingSchema);
