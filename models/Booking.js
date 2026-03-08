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
}, {
    timestamps: true,
});

module.exports = mongoose.model('Booking', bookingSchema);
