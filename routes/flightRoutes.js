const express = require('express');
const router = express.Router();
const { getFlights, getFlightById, createFlight } = require('../controllers/flightController');
const { protect, admin } = require('../middleware/auth');

router.get('/', getFlights);
router.get('/:id', getFlightById);
router.post('/', protect, admin, createFlight);

module.exports = router;
