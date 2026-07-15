const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');

// Generate a random 6 digit code (used for both email verification and password reset)
const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = asyncHandler(async (req, res) => {
    const { fullName, email, password, phoneNumber, role } = req.body;

    if (!fullName || !email || !password || !phoneNumber) {
        res.status(400);
        throw new Error('Please add all fields');
    }

    // Check if user exists
    const userExists = await User.findOne({ email });

    if (userExists) {
        res.status(400);
        throw new Error('User already exists');
    }

    const verificationCode = generateOtp();

    // Hash password handled in User model pre-save hook
    const user = await User.create({
        fullName,
        email,
        password,
        phoneNumber,
        role: role || 'user', // Default to user if not provided
        status: 'processing',
        emailVerificationCode: verificationCode,
        emailVerificationExpire: Date.now() + 10 * 60 * 1000,
    });

    if (user) {
        const message = `Welcome to FlyEz! \n\n Your email verification code is: \n\n ${verificationCode} \n\n This code expires in 10 minutes.`;

        try {
            await sendEmail({
                email: user.email,
                subject: 'Verify your FlyEz account',
                message,
            });
        } catch (err) {
            // Account stays in the database so the user can request a fresh
            // code, but leave status as 'processing' since it was never sent.
        }

        res.status(201).json({
            success: true,
            email: user.email,
            status: user.status,
            message: 'Verification code sent to your email',
        });
    } else {
        res.status(400);
        throw new Error('Invalid user data');
    }
});

// @desc    Verify a user's email with the code sent at signup
// @route   POST /api/auth/verify-email
// @access  Public
const verifyEmail = asyncHandler(async (req, res) => {
    const { email, code } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
        res.status(404);
        throw new Error('There is no user with that email');
    }

    if (user.status === 'verified') {
        res.status(400);
        throw new Error('This account is already verified');
    }

    if (!user.emailVerificationCode || user.emailVerificationCode !== code) {
        res.status(400);
        throw new Error('Invalid verification code');
    }

    if (!user.emailVerificationExpire || user.emailVerificationExpire < Date.now()) {
        user.status = 'unverified';
        await user.save({ validateBeforeSave: false });
        res.status(400);
        throw new Error('Verification code has expired. Please request a new one');
    }

    user.status = 'verified';
    user.emailVerificationCode = undefined;
    user.emailVerificationExpire = undefined;
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
        _id: user.id,
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        status: user.status,
        token: generateToken(user._id),
    });
});

// @desc    Resend the email verification code (for 'processing' or 'unverified' accounts)
// @route   POST /api/auth/resend-verification
// @access  Public
const resendVerification = asyncHandler(async (req, res) => {
    const user = await User.findOne({ email: req.body.email });

    if (!user) {
        res.status(404);
        throw new Error('There is no user with that email');
    }

    if (user.status === 'verified') {
        res.status(400);
        throw new Error('This account is already verified');
    }

    if (user.status === 'suspended') {
        res.status(403);
        throw new Error('Your account has been suspended. Please contact support');
    }

    const verificationCode = generateOtp();
    user.emailVerificationCode = verificationCode;
    user.emailVerificationExpire = Date.now() + 10 * 60 * 1000;
    user.status = 'processing';
    await user.save({ validateBeforeSave: false });

    const message = `Your new FlyEz verification code is: \n\n ${verificationCode} \n\n This code expires in 10 minutes.`;

    try {
        await sendEmail({
            email: user.email,
            subject: 'Your new FlyEz verification code',
            message,
        });

        res.status(200).json({ success: true, data: 'Email sent' });
    } catch (err) {
        res.status(500);
        throw new Error('Email could not be sent');
    }
});

// @desc    Authenticate a user
// @route   POST /api/auth/login
// @access  Public
const loginUser = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    // Check for user email
    const user = await User.findOne({ email });

    if (!user || !(await user.matchPassword(password))) {
        res.status(400);
        throw new Error('Invalid credentials');
    }

    if (user.status === 'suspended') {
        res.status(403).json({
            message: 'Your account has been suspended. Please contact support',
            status: user.status,
        });
        return;
    }

    if (user.status !== 'verified') {
        res.status(403).json({
            message: 'Please verify your email to continue',
            status: user.status,
            needsVerification: true,
            email: user.email,
        });
        return;
    }

    res.json({
        _id: user.id,
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        status: user.status,
        token: generateToken(user._id),
    });
});

// Generate JWT
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
        expiresIn: '30d',
    });
};

// @desc    Forgot Password - Generate code and send email
// @route   POST /api/auth/forgotpassword
// @access  Public
const forgotPassword = asyncHandler(async (req, res) => {
    const user = await User.findOne({ email: req.body.email });

    if (!user) {
        res.status(404);
        throw new Error('There is no user with that email');
    }

    // Generate random 6 digit code
    const resetCode = generateOtp();

    // Set code and expiration (10 minutes)
    user.resetPasswordCode = resetCode;
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

    await user.save({ validateBeforeSave: false });

    // Send email
    const message = `You are receiving this email because you (or someone else) has requested the reset of a password. \n\n Your reset code is: \n\n ${resetCode} \n\n If you did not request this, please ignore this email.`;

    try {
        await sendEmail({
            email: user.email,
            subject: 'Password Reset Code',
            message,
        });

        res.status(200).json({ success: true, data: 'Email sent' });
    } catch (err) {
        user.resetPasswordCode = undefined;
        user.resetPasswordExpire = undefined;

        await user.save({ validateBeforeSave: false });

        res.status(500);
        throw new Error('Email could not be sent');
    }
});

// @desc    Verify Reset Code
// @route   POST /api/auth/verifyresetcode
// @access  Public
const verifyResetCode = asyncHandler(async (req, res) => {
    const { email, resetCode } = req.body;

    const user = await User.findOne({
        email,
        resetPasswordCode: resetCode,
        resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
        res.status(400);
        throw new Error('Invalid or expired reset code');
    }

    res.status(200).json({ success: true, message: 'Code verified' });
});

// @desc    Reset Password
// @route   PUT /api/auth/resetpassword
// @access  Public
const resetPassword = asyncHandler(async (req, res) => {
    const { email, resetCode, password } = req.body;

    const user = await User.findOne({
        email,
        resetPasswordCode: resetCode,
        resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
        res.status(400);
        throw new Error('Invalid or expired reset code');
    }

    // Set new password
    user.password = password;
    user.resetPasswordCode = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.status(200).json({
        success: true,
        token: generateToken(user._id),
    });
});

// @desc    Update the logged-in user's profile (name, email, phone)
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user) {
        res.status(404);
        throw new Error('User not found');
    }

    const { fullName, email, phoneNumber } = req.body;

    if (email && email !== user.email) {
        const emailTaken = await User.findOne({ email });
        if (emailTaken) {
            res.status(400);
            throw new Error('Email already in use');
        }
        user.email = email;
    }
    if (fullName) user.fullName = fullName;
    if (phoneNumber) user.phoneNumber = phoneNumber;

    await user.save();

    res.status(200).json({
        _id: user.id,
        fullName: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
    });
});

// @desc    Change password for the logged-in user (requires current password)
// @route   PUT /api/auth/change-password
// @access  Private
const changePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        res.status(400);
        throw new Error('Please provide your current and new password');
    }

    const user = await User.findById(req.user.id);
    if (!user || !(await user.matchPassword(currentPassword))) {
        res.status(400);
        throw new Error('Current password is incorrect');
    }

    user.password = newPassword;
    await user.save();

    res.status(200).json({ success: true, message: 'Password updated' });
});

// @desc    Delete the logged-in user's account and their bookings
// @route   DELETE /api/auth/account
// @access  Private
const deleteAccount = asyncHandler(async (req, res) => {
    const Booking = require('../models/Booking');
    await Booking.deleteMany({ user: req.user.id });
    await User.findByIdAndDelete(req.user.id);

    res.status(200).json({ success: true, message: 'Account deleted' });
});

module.exports = {
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
};
