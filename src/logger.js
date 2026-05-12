const winston = require('winston');
const path = require('path');
const fs = require('fs');

const LOG_DIR = '/tmp/log/auth-service';

if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true, mode: 0o775 });
}

// Matches the PHP writeLog() JSON format exactly:
// { time, type, message, data }
const jsonLine = winston.format.printf(({ timestamp, level, message, data }) => {
    return JSON.stringify({ time: timestamp, type: level.toUpperCase(), message, data: data || {} });
});

const loggerCache = {};

function getLogger(type) {
    const key = type.toLowerCase();
    if (!loggerCache[key]) {
        loggerCache[key] = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                jsonLine
            ),
            transports: [
                new winston.transports.File({ filename: path.join(LOG_DIR, `${key}.log`) }),
            ],
        });
    }
    return loggerCache[key];
}

function writeLog(type, message, data = {}) {
    getLogger(type).log(type.toLowerCase() === 'error' ? 'error' : 'info', message, { data });
    if (type.toUpperCase() === 'ERROR') {
        console.error(`[ERROR] ${message}`, data);
    }
}

module.exports = { writeLog };
