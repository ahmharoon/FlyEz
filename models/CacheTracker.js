const mongoose = require('mongoose');

const cacheTrackerSchema = new mongoose.Schema({
    cacheName: {
        type: String,
        required: true,
        unique: true
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('CacheTracker', cacheTrackerSchema);
