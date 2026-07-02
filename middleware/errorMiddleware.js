const errorHandler = (err, req, res, next) => {
    // Use the status code set by the controller, default to 500
    const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;

    res.status(statusCode).json({
        message: err.message || 'Server Error',
    });
};

module.exports = { errorHandler };
