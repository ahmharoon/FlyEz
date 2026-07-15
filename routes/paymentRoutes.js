const express = require('express');
const router = express.Router();
const { getCredits, purchaseCredits, getSavedCard, saveCard, deleteSavedCard } = require('../controllers/paymentController');
const { protect } = require('../middleware/auth');

router.get('/credits', protect, getCredits);
router.get('/saved-card', protect, getSavedCard);
router.post('/purchase', protect, purchaseCredits);
router.post('/save-card', protect, saveCard);
router.delete('/saved-card', protect, deleteSavedCard);

module.exports = router;
