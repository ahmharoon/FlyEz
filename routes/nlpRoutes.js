const express = require('express');
const router = express.Router();
const { nlpSearchFlights } = require('../controllers/nlpController');
const { protect } = require('../middleware/auth');

router.post('/search', protect, nlpSearchFlights);

module.exports = router;
