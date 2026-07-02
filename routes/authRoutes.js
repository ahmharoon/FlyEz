const express = require('express');
const router = express.Router();
const {
    registerUser,
    loginUser,
    forgotPassword,
    verifyResetCode,
    resetPassword,
} = require('../controllers/authController');

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/forgotpassword', forgotPassword);
router.post('/verifyresetcode', verifyResetCode);
router.put('/resetpassword', resetPassword);

module.exports = router;
