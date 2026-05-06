const axios = require('axios');
const { writeLog } = require('../logger');

async function sendOtpSms(mobileNo, otp) {
    const params = new URLSearchParams({
        username:    process.env.SMS_API_USERNAME,
        apikey:      process.env.SMS_API_KEY,
        apirequest:  'Text',
        route:       'OTP',
        TemplateID:  process.env.SMS_TEMPLATE_ID,
        senderid:    process.env.SMS_SENDER_ID,
        mobile:      mobileNo,
        text:        `${otp} use the OTP to login to TejAgro. It is valid for 1 minute. Do not share your OTP with anyone. TEJ AGROTECH INDIA PVT LTD 8OI9CriExX5`,
    });

    const url = `${process.env.SMS_API_URL}?${params.toString()}`;
    writeLog('ACTION', 'SMS API URL', { url });

    try {
        const response = await axios.get(url, { timeout: 10000 });
        const raw = response.data;
        writeLog('ACTION', 'SMS RAW RESPONSE', { response: raw });

        // Provider may return JSON with a status field, or a plain-text response
        if (raw && typeof raw === 'object' && raw.status !== undefined) {
            return String(raw.status).toLowerCase() === 'success' ? 'success' : 'failed';
        }

        const rawStr = typeof raw === 'string' ? raw : JSON.stringify(raw);
        return rawStr.toLowerCase().includes('success') ? 'success' : 'failed';

    } catch (err) {
        writeLog('ERROR', 'SMS API not reachable', { error: err.message });
        return 'failed';
    }
}

module.exports = { sendOtpSms };
