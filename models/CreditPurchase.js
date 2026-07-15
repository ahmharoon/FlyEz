const mongoose = require('mongoose');

// One record per successful credit purchase — kept separate from the
// running nlpCredits balance on User so "credits bought" can be reported
// as a true historical total even after credits are spent.
const creditPurchaseSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'User',
    },
    plan: {
        type: String,
        required: true,
    },
    credits: {
        type: Number,
        required: true,
    },
    amount: {
        type: Number,
        required: true,
    },
}, {
    timestamps: true,
});

module.exports = mongoose.model('CreditPurchase', creditPurchaseSchema);
