const nodemailer = require('nodemailer');

const sendEmail = async (options) => {
    // If SMTP credentials are not provided, just log the email to console for testing
    if (!process.env.SMTP_HOST || !process.env.SMTP_EMAIL || !process.env.SMTP_PASSWORD) {
        console.log('----------------------------------------------------');
        console.log(`[TEST EMAIL] To: ${options.email}`);
        console.log(`[TEST EMAIL] Subject: ${options.subject}`);
        console.log(`[TEST EMAIL] Message:\n${options.message}`);
        console.log('----------------------------------------------------');
        console.log('NOTE: Configure SMTP_HOST, SMTP_PORT, SMTP_EMAIL, SMTP_PASSWORD in .env to send real emails.');
        return;
    }

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        auth: {
            user: process.env.SMTP_EMAIL,
            pass: process.env.SMTP_PASSWORD,
        },
    });

    const message = {
        from: `${process.env.FROM_NAME || 'FlyEz Team'} <${process.env.FROM_EMAIL || process.env.SMTP_EMAIL}>`,
        to: options.email,
        subject: options.subject,
        text: options.message,
    };

    const info = await transporter.sendMail(message);

    console.log('Message sent: %s', info.messageId);
};

module.exports = sendEmail;
