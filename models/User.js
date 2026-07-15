const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    fullName: {
        type: String,
        required: [true, 'Please add a name'],
    },
    email: {
        type: String,
        required: [true, 'Please add an email'],
        unique: true,
        match: [
            /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
            'Please add a valid email',
        ],
    },
    password: {
        type: String,
        required: [true, 'Please add a password'],
        minlength: 6,
    },
    phoneNumber: {
        type: String,
        required: [true, 'Please add a phone number'],
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user',
    },
    resetPasswordCode: String,
    resetPasswordExpire: Date,
    status: {
        type: String,
        enum: ['verified', 'unverified', 'processing', 'suspended'],
        default: 'processing',
    },
    emailVerificationCode: String,
    emailVerificationExpire: Date,
    nlpCredits: {
        type: Number,
        default: 1,
        min: 0,
    },
    // Masked card metadata only — never store the full card number or CVV,
    // even for this mock payment flow.
    paymentMethod: {
        cardholderName: String,
        brand: String,
        last4: String,
        expiryMonth: String,
        expiryYear: String,
        savedAt: Date,
    },
}, {
    timestamps: true,
});

// Encrypt password using bcrypt
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        return next();
    }

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

// Match user entered password to hashed password in database
userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
