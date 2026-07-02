const express = require('express');
const router = express.Router();
const { getCredits, purchaseCredits } = require('../controllers/paymentController');
const { protect } = require('../middleware/auth');

router.get('/credits', protect, getCredits);
router.post('/purchase', protect, purchaseCredits);

module.exports = router;
