const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const { conPool, connectPool } = require('../db');
const { writeLog } = require('../logger');
const { sendOtpSms } = require('../services/smsService');
const { creditOpeningWallet } = require('../services/walletService');

const REFERRAL_ALPHABET = '0123456789';
const REFERRAL_CODE_LENGTH = 6;
const REFERRAL_MAX_ATTEMPTS = 5;

function generateReferralCode() {
    let code = '';
    for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
        code += REFERRAL_ALPHABET[crypto.randomInt(REFERRAL_ALPHABET.length)];
    }
    return code;
}

function isReferralCodeDuplicate(err) {
    return err && err.code === 'ER_DUP_ENTRY' &&
        /referral_code/i.test(err.sqlMessage || '');
}

async function persistWithUniqueReferralCode(operation) {
    for (let attempt = 1; attempt <= REFERRAL_MAX_ATTEMPTS; attempt++) {
        const code = generateReferralCode();
        try {
            const result = await operation(code);
            return { code, result };
        } catch (err) {
            if (isReferralCodeDuplicate(err) && attempt < REFERRAL_MAX_ATTEMPTS) {
                writeLog('ACTION', 'Referral code collision, retrying', { code, attempt });
                continue;
            }
            throw err;
        }
    }
    throw new Error('Failed to generate a unique referral code after retries');
}

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
                const persisted = await persistWithUniqueReferralCode(async (code) => {
                    return connectPool.execute(
                        'UPDATE client_master SET otp=?, app_installation=1, referral_code=? WHERE client_id=?',
                        [otp, code, client_id]
                    );
                });
                referral_code = persisted.code;
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

            console.log(`[OTP] mobile=${mobile_no} otp=${otp} referral_code=${referral_code} client_id=${client_id} (existing)`);

            return res.status(200).json({
                message: 'OTP sent successfully',
                status: true,
                referral_code,
                referral_status,
            });
        }

        const reference_no = Math.floor(Date.now() / 1000);

        const { code: referral_code, result: [insertResult] } = await persistWithUniqueReferralCode(async (code) => {
            return connectPool.execute(
                'INSERT INTO client_master (client_mob, reference_no, otp, app_installation, referral_code) VALUES (?, ?, ?, 1, ?)',
                [mobile_no, reference_no, otp, code]
            );
        });

        const client_id = insertResult.insertId;

        writeLog('ACTION', 'New client created', { client_id });

        await conPool.execute(
            "INSERT INTO android_activity_tracking (client_id, search_type, track_date_time) VALUES (?, 'App_Login', NOW())",
            [client_id]
        );

        await creditOpeningWallet(conPool, client_id);

        writeLog('SUCCESS', 'New user login success', { client_id });

        console.log(`[OTP] mobile=${mobile_no} otp=${otp} referral_code=${referral_code} client_id=${client_id} (new)`);

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