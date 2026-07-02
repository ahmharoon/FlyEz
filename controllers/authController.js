const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const sendEmail = require('../utils/sendEmail');

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

    // Hash password handled in User model pre-save hook
    const user = await User.create({
        fullName,
        email,
        password,
        phoneNumber,
        role: role || 'user', // Default to user if not provided
    });

    if (user) {
        res.status(201).json({
            _id: user.id,
            fullName: user.fullName,
            email: user.email,
            phoneNumber: user.phoneNumber,
            role: user.role,
            token: generateToken(user._id),
        });
    } else {
        res.status(400);
        throw new Error('Invalid user data');
    }
});

// @desc    Authenticate a user
// @route   POST /api/auth/login
// @access  Public
const loginUser = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    // Check for user email
    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
        res.json({
            _id: user.id,
            fullName: user.fullName,
            email: user.email,
            phoneNumber: user.phoneNumber,
            role: user.role,
            token: generateToken(user._id),
        });
    } else {
        res.status(400);
        throw new Error('Invalid credentials');
    }
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
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();

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

module.exports = {
    registerUser,
    loginUser,
    forgotPassword,
    verifyResetCode,
    resetPassword,
};
