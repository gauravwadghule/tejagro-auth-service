const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

const { conPool, connectPool } = require('../db');
const { writeLog } = require('../logger');

router.post('/', async (req, res) => {
    writeLog('ACTION', 'Login API HIT');

    const mobile_no     = (req.body.mobile_no     || '').trim();
    const otp           = (req.body.otp           || '').trim();
    const referral_code = (req.body.referral_code || '').trim();

    if (!mobile_no || !otp) {
        writeLog('ERROR', 'Missing required fields');
        return res.json({ message: 'Mobile number and OTP are required.', status: false });
    }

    try {
        /* ── Client lookup ───────────────────────────────── */
        const [rows] = await connectPool.execute(
            `SELECT * FROM client_master
             WHERE client_mob=? OR client_person1_mob=? OR client_person2_mob2=?`,
            [mobile_no, mobile_no, mobile_no]
        );

        if (rows.length === 0) {
            writeLog('ERROR', 'Client not found', { mobile_no });
            return res.json({ message: 'No Record Found.', status: false });
        }

        const client = rows[0];

        /* ── OTP validation ──────────────────────────────── */
        if (String(client.otp) !== String(otp)) {
            writeLog('ERROR', 'Invalid OTP', { mobile_no });
            return res.json({ message: 'Invalid OTP.', status: false });
        }

        /* ── Referral validation ─────────────────────────── */
        let referral_from_id = null;
        if (referral_code) {
            const [refRows] = await connectPool.execute(
                'SELECT client_id, referral_code FROM client_master WHERE referral_code=?',
                [referral_code]
            );

            if (!refRows.length || refRows[0].referral_code !== referral_code) {
                writeLog('ERROR', 'Referral mismatch', { referral_code });
                return res.json({
                    message: 'Referral code mismatch. Do you want to proceed without referral code?',
                    status: false,
                    referral_mismatch: true,
                });
            }
            referral_from_id = refRows[0].client_id;
        }

        /* ── JWT ─────────────────────────────────────────── */
        // Full client row in payload — matches the old PHP login.php exactly,
        // so existing PHP endpoints can decode this token without code changes.
        // Only change required on the PHP side: update the shared JWT secret.
        const payload = {
            iss:  process.env.JWT_ISSUER   || 'localhost',
            iat:  Math.floor(Date.now() / 1000),
            aud:  process.env.JWT_AUDIENCE || 'myusers',
            data: client,
        };

        const token = jwt.sign(payload, process.env.JWT_SECRET, { algorithm: 'HS512' });

        /* ── Referral entry ──────────────────────────────── */
        let reference_entry_added = false;
        let self_referral = false;
        let referral_already_recorded = false;

        if (referral_code && referral_from_id) {
            const referral_to_id = client.client_id;

            if (referral_from_id === referral_to_id) {
                self_referral = true;
                writeLog('ACTION', 'Self-referral attempt ignored', {
                    client_id: referral_to_id,
                    referral_code,
                });
            } else {
                const [checkRef] = await connectPool.execute(
                    'SELECT reference_id, referral_from FROM reference_details WHERE referral_to=? LIMIT 1',
                    [referral_to_id]
                );

                if (checkRef.length === 0) {
                    const [insertRef] = await connectPool.execute(
                        `INSERT INTO reference_details
                            (mobile_no, name, client_id, added_on, bdm_user_id, bdm_user_name,
                             sales_user_id, sales_user_name, android_referral, referral_from, referral_to)
                         VALUES (?, ?, ?, NOW(), 0, 'Android Referral', NULL, NULL, '1', ?, ?)`,
                        [client.client_mob, client.client_name, referral_from_id, referral_from_id, referral_to_id]
                    );
                    reference_entry_added = insertRef.affectedRows > 0;
                } else {
                    referral_already_recorded = true;
                    writeLog('ACTION', 'Referral attempt skipped — client already referred', {
                        client_id: referral_to_id,
                        attempted_referral_from: referral_from_id,
                        existing_referral_from: checkRef[0].referral_from,
                        attempted_code: referral_code,
                    });
                }
            }
        }

        writeLog('SUCCESS', 'Login successful', { client_id: client.client_id });

        return res.json({
            jwt:                   token,
            status:                true,
            message:               'Login successful.',
            reference_entry_added,
            referral_already_recorded,
            self_referral,
        });

    } catch (err) {
        writeLog('ERROR', 'DB Error', { error: err.message });
        return res.status(500).json({ message: 'Database error', status: false });
    }
});

module.exports = router;
