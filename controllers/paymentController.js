const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const CreditPurchase = require('../models/CreditPurchase');

const PLANS = {
    starter: { credits: 5, price: 1.99, name: '5 AI Searches' },
    pro: { credits: 20, price: 4.99, name: '20 AI Searches' },
    premium: { credits: 100, price: 9.99, name: '100 AI Searches' },
};

const detectCardBrand = (cardNumber) => {
    if (/^4/.test(cardNumber)) return 'Visa';
    if (/^5[1-5]/.test(cardNumber)) return 'Mastercard';
    if (/^3[47]/.test(cardNumber)) return 'Amex';
    return 'Card';
};

// Builds the masked-only paymentMethod subdocument from a raw (mock) card
// payload — shared by the credits purchase flow and the standalone
// save-card endpoint so there's one place that ever touches card data.
const buildMaskedCard = (card) => {
    const digits = String(card.number || '').replace(/\s+/g, '');
    const [expiryMonth, expiryYear] = String(card.expiry || '').split('/');
    return {
        cardholderName: card.cardholderName || '',
        brand: detectCardBrand(digits),
        last4: digits.slice(-4),
        expiryMonth: (expiryMonth || '').trim(),
        expiryYear: (expiryYear || '').trim(),
        savedAt: new Date(),
    };
};

// @desc    Get current user's NLP credit balance
// @route   GET /api/payments/credits
// @access  Private
const getCredits = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select('nlpCredits');
    res.status(200).json({ credits: user.nlpCredits });
});

// @desc    Get the current user's saved (masked) card, if any
// @route   GET /api/payments/saved-card
// @access  Private
const getSavedCard = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select('paymentMethod');
    res.status(200).json({ card: user.paymentMethod?.last4 ? user.paymentMethod : null });
});

// @desc    Purchase NLP credits (mock payment)
// @route   POST /api/payments/purchase
// @access  Private
const purchaseCredits = asyncHandler(async (req, res) => {
    const { planId, card, saveCard } = req.body;

    const plan = PLANS[planId];
    if (!plan) {
        res.status(400);
        throw new Error('Invalid plan selected. Choose starter, pro, or premium.');
    }

    // Mock payment validation — in production, validate a Stripe payment token here.
    // We never persist the full card number or CVV, even for this mock flow —
    // only masked metadata is stored, and only when the user opts to save it.
    const update = { $inc: { nlpCredits: plan.credits } };
    if (card && saveCard) {
        update.paymentMethod = buildMaskedCard(card);
    }

    const user = await User.findByIdAndUpdate(req.user._id, update, { new: true }).select(
        'nlpCredits paymentMethod'
    );

    await CreditPurchase.create({
        user: req.user._id,
        plan: planId,
        credits: plan.credits,
        amount: plan.price,
    });

    res.status(200).json({
        success: true,
        message: `Successfully purchased ${plan.name}`,
        remainingCredits: user.nlpCredits,
        creditsAdded: plan.credits,
        savedCard: user.paymentMethod?.last4 ? user.paymentMethod : null,
    });
});

// @desc    Save a (masked) card without an accompanying purchase — used by
//          checkout flows (e.g. booking a flight) that aren't buying credits
// @route   POST /api/payments/save-card
// @access  Private
const saveCard = asyncHandler(async (req, res) => {
    const { card } = req.body;
    if (!card?.number) {
        res.status(400);
        throw new Error('Card details are required');
    }

    const user = await User.findByIdAndUpdate(
        req.user._id,
        { paymentMethod: buildMaskedCard(card) },
        { new: true }
    ).select('paymentMethod');

    res.status(200).json({ card: user.paymentMethod });
});

// @desc    Remove the current user's saved card
// @route   DELETE /api/payments/saved-card
// @access  Private
const deleteSavedCard = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(req.user._id, { $unset: { paymentMethod: 1 } });
    res.status(200).json({ success: true });
});

module.exports = { getCredits, purchaseCredits, getSavedCard, saveCard, deleteSavedCard };
