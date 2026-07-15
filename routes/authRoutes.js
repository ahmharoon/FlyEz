const express = require('express');
const router = express.Router();
const {
    registerUser,
    verifyEmail,
    resendVerification,
    loginUser,
    forgotPassword,
    verifyResetCode,
    resetPassword,
    updateProfile,
    changePassword,
    deleteAccount,
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');

router.post('/register', registerUser);
router.post('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerification);
router.post('/login', loginUser);
router.post('/forgotpassword', forgotPassword);
router.post('/verifyresetcode', verifyResetCode);
router.put('/resetpassword', resetPassword);
router.put('/profile', protect, updateProfile);
router.put('/change-password', protect, changePassword);
router.delete('/account', protect, deleteAccount);

module.exports = router;
