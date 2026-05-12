require('dotenv').config();
const express = require('express');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');

const otpRoute   = require('./routes/otp');
const loginRoute = require('./routes/login');

const app = express();

app.set('trust proxy', 1);

app.use(express.json());

app.use((req, res, next) => {
    const start = Date.now();
    const device = req.get('User-Agent') || 'unknown';
    res.on('finish', () => {
        console.log(
            `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - start}ms) | device: ${device}`
        );
    });
    next();
});

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGINS || '*');
    if (req.path.startsWith('/api/')) {
        res.setHeader('Content-Type', 'application/json');
    }
    next();
});

const otpLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: process.env.NODE_ENV === 'test' ? 1000 : 3,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many OTP requests, please try again later.', status: false },
});

app.use('/api/v1/otp',   otpLimiter, otpRoute);
app.use('/api/v1/login', loginRoute);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use((req, res) => {
    res.status(404).json({ message: 'Not found.', status: false });
});

app.use((err, req, res, _next) => {
    console.error(`[${req.method}] ${req.originalUrl} → exception:`, err.stack || err.message || err);
    if (!res.headersSent) {
        res.status(500).json({ message: 'Internal server error', status: false });
    }
});

module.exports = app;
