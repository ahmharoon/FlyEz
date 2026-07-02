const asyncHandler = require('express-async-handler');
const User = require('../models/User');

const PLANS = {
    starter: { credits: 5, price: 1.99, name: '5 AI Searches' },
    pro: { credits: 20, price: 4.99, name: '20 AI Searches' },
    premium: { credits: 100, price: 9.99, name: '100 AI Searches' },
};

// @desc    Get current user's NLP credit balance
// @route   GET /api/payments/credits
// @access  Private
const getCredits = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select('nlpCredits');
    res.status(200).json({ credits: user.nlpCredits });
});

// @desc    Purchase NLP credits (mock payment)
// @route   POST /api/payments/purchase
// @access  Private
const purchaseCredits = asyncHandler(async (req, res) => {
    const { planId } = req.body;

    const plan = PLANS[planId];
    if (!plan) {
        res.status(400);
        throw new Error('Invalid plan selected. Choose starter, pro, or premium.');
    }

    // Mock payment validation — in production, validate a Stripe payment token here
    const user = await User.findByIdAndUpdate(
        req.user._id,
        { $inc: { nlpCredits: plan.credits } },
        { new: true }
    ).select('nlpCredits');

    res.status(200).json({
        success: true,
        message: `Successfully purchased ${plan.name}`,
        remainingCredits: user.nlpCredits,
        creditsAdded: plan.credits,
    });
});

module.exports = { getCredits, purchaseCredits };
