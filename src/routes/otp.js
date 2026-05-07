const express = require('express');
const router = express.Router();

const { conPool, connectPool } = require('../db');
const { writeLog } = require('../logger');
const { sendOtpSms } = require('../services/smsService');
const { creditOpeningWallet } = require('../services/walletService');

router.post('/', async (req, res) => {
    writeLog('ACTION', 'API HIT START');

    const { mobile_no } = req.body;

    if (!mobile_no) {
        writeLog('ERROR', 'Mobile number missing');
        return res.status(400).json({ message: 'Mobile number required', status: false });
    }

    writeLog('ACTION', 'Login attempt', { mobile_no });

    let otp;
    let smsStatus;

    if (mobile_no === process.env.TEST_MOBILE) {
        otp = parseInt(process.env.TEST_OTP) || 1234;
        smsStatus = 'success';
    } else {
        otp = Math.floor(Math.random() * 9000) + 1000;
        writeLog('ACTION', 'OTP Generated', { otp });
        smsStatus = await sendOtpSms(mobile_no, otp);
    }

    if (smsStatus !== 'success') {
        writeLog('ERROR', 'OTP sending failed', { mobile: mobile_no });
        return res.status(400).json({ message: 'OTP sending failed', status: false });
    }

    try {
        const [rows] = await connectPool.execute(
            `SELECT client_id, app_installation, referral_code
             FROM client_master
             WHERE client_mob=? OR client_person1_mob=? OR client_person2_mob2=?`,
            [mobile_no, mobile_no, mobile_no]
        );

        if (rows.length > 0) {
            const { client_id, app_installation, referral_code: existingReferral } = rows[0];
            const trimmedReferral = (existingReferral || '').trim();

            writeLog('ACTION', 'Existing client', { client_id });

            const [refRows] = await connectPool.execute(
                'SELECT reference_id FROM reference_details WHERE referral_to=? LIMIT 1',
                [client_id]
            );

            const referral_status = refRows.length > 0 ? 1 : 0;

            let referral_code;

            if (!trimmedReferral) {
                referral_code = String(Math.floor(Math.random() * 10000)).padStart(4, '0');

                await connectPool.execute(
                    'UPDATE client_master SET otp=?, app_installation=1, referral_code=? WHERE client_id=?',
                    [otp, referral_code, client_id]
                );
            } else {
                referral_code = trimmedReferral;

                await connectPool.execute(
                    'UPDATE client_master SET otp=?, app_installation=1 WHERE client_id=?',
                    [otp, client_id]
                );
            }

            writeLog('ACTION', 'client_master updated', { client_id });

            await conPool.execute(
                "INSERT INTO android_activity_tracking (client_id, search_type, track_date_time) VALUES (?, 'App_Login', NOW())",
                [client_id]
            );

            if (app_installation != 1) {
                await creditOpeningWallet(conPool, client_id);
            }

            writeLog('SUCCESS', 'Login success', { client_id });

            return res.status(200).json({
                message: 'OTP sent successfully',
                status: true,
                referral_code,
                referral_status,
            });
        }

        const reference_no = Math.floor(Date.now() / 1000);
        const referral_code = String(Math.floor(Math.random() * 10000)).padStart(4, '0');

        const [insertResult] = await connectPool.execute(
            'INSERT INTO client_master (client_mob, reference_no, otp, app_installation, referral_code) VALUES (?, ?, ?, 1, ?)',
            [mobile_no, reference_no, otp, referral_code]
        );

        const client_id = insertResult.insertId;

        writeLog('ACTION', 'New client created', { client_id });

        await conPool.execute(
            "INSERT INTO android_activity_tracking (client_id, search_type, track_date_time) VALUES (?, 'App_Login', NOW())",
            [client_id]
        );

        await creditOpeningWallet(conPool, client_id);

        writeLog('SUCCESS', 'New user login success', { client_id });

        return res.status(200).json({
            message: 'OTP sent successfully',
            status: true,
            referral_code,
            referral_status: 0,
        });

    } catch (err) {
        console.error('FULL ERROR =>', err);

        writeLog('ERROR', 'DB Error', { error: err.message });

        return res.status(500).json({
            message: err.message,
            status: false
        });
    }
});

module.exports = router;