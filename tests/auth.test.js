require('dotenv').config({ path: '.env' });
const request = require('supertest');
const app     = require('../src/app');
const { conPool, connectPool } = require('../src/db');

const TEST_MOBILE = process.env.TEST_MOBILE;  // 9168681342
const TEST_OTP    = process.env.TEST_OTP;     // 1234

afterAll(async () => {
    await connectPool.execute('DELETE FROM client_master WHERE client_mob = ?', [TEST_MOBILE]);
    await conPool.end();
    await connectPool.end();
});

// ─── OTP endpoint ────────────────────────────────────────────────────────────

describe('POST /api/v1/otp', () => {
    beforeAll(async () => {
        // Clean slate so tests always start without an existing record
        await connectPool.execute('DELETE FROM client_master WHERE client_mob = ?', [TEST_MOBILE]);
    });

    test('missing mobile_no returns 400', async () => {
        const res = await request(app).post('/api/v1/otp').send({});
        expect(res.status).toBe(400);
        expect(res.body.status).toBe(false);
        expect(res.body.message).toMatch(/mobile number required/i);
    });

    test('empty mobile_no returns 400', async () => {
        const res = await request(app).post('/api/v1/otp').send({ mobile_no: '' });
        expect(res.status).toBe(400);
        expect(res.body.status).toBe(false);
    });

    test('valid test mobile creates new client and returns referral_code', async () => {
        const res = await request(app).post('/api/v1/otp').send({ mobile_no: TEST_MOBILE });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe(true);
        expect(res.body.message).toMatch(/otp sent successfully/i);
        expect(res.body).toHaveProperty('referral_code');
        expect(res.body.referral_status).toBe(0); // new user, no referral
    });

    test('second OTP request for same mobile hits existing client path', async () => {
        const res = await request(app).post('/api/v1/otp').send({ mobile_no: TEST_MOBILE });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe(true);
        expect(res.body).toHaveProperty('referral_code');
    });
});

// ─── Login endpoint ───────────────────────────────────────────────────────────

describe('POST /api/v1/login', () => {
    beforeAll(async () => {
        // Directly upsert the test client with a known OTP and future expiry
        await connectPool.execute('DELETE FROM client_master WHERE client_mob = ?', [TEST_MOBILE]);
        await connectPool.execute(
            `INSERT INTO client_master (client_mob, otp, otp_expires_at, app_installation, referral_code)
             VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE), 1, '0000')`,
            [TEST_MOBILE, TEST_OTP]
        );
    });

    test('missing mobile_no and otp returns error', async () => {
        const res = await request(app).post('/api/v1/login').send({});
        expect(res.body.status).toBe(false);
        expect(res.body.message).toMatch(/mobile number and otp are required/i);
    });

    test('missing otp returns error', async () => {
        const res = await request(app).post('/api/v1/login').send({ mobile_no: TEST_MOBILE });
        expect(res.body.status).toBe(false);
        expect(res.body.message).toMatch(/mobile number and otp are required/i);
    });

    test('missing mobile_no returns error', async () => {
        const res = await request(app).post('/api/v1/login').send({ otp: TEST_OTP });
        expect(res.body.status).toBe(false);
        expect(res.body.message).toMatch(/mobile number and otp are required/i);
    });

    test('unregistered mobile returns no record found', async () => {
        const res = await request(app)
            .post('/api/v1/login')
            .send({ mobile_no: '9999999999', otp: TEST_OTP });
        expect(res.body.status).toBe(false);
        expect(res.body.message).toMatch(/no record found/i);
    });

    test('incorrect OTP returns invalid OTP error', async () => {
        const res = await request(app)
            .post('/api/v1/login')
            .send({ mobile_no: TEST_MOBILE, otp: '0000' });
        expect(res.body.status).toBe(false);
        expect(res.body.message).toMatch(/invalid otp/i);
    });

    test('correct OTP returns JWT token', async () => {
        const res = await request(app)
            .post('/api/v1/login')
            .send({ mobile_no: TEST_MOBILE, otp: TEST_OTP });
        expect(res.body.status).toBe(true);
        expect(res.body.message).toMatch(/login successful/i);
        expect(res.body).toHaveProperty('jwt');
        expect(typeof res.body.jwt).toBe('string');
        expect(res.body.jwt.split('.').length).toBe(3);
    });

    test('invalid referral code blocks login with referral_mismatch flag', async () => {
        const res = await request(app)
            .post('/api/v1/login')
            .send({ mobile_no: TEST_MOBILE, otp: TEST_OTP, referral_code: 'XXXX' });
        expect(res.body.status).toBe(false);
        expect(res.body.referral_mismatch).toBe(true);
        expect(res.body.message).toMatch(/referral code mismatch/i);
    });

    test('valid existing referral code does not trigger mismatch', async () => {
        const [rows] = await connectPool.execute(
            'SELECT referral_code FROM client_master WHERE client_mob = ?',
            [TEST_MOBILE]
        );
        const ownCode = rows[0]?.referral_code;
        expect(ownCode).toBeDefined();

        const res = await request(app)
            .post('/api/v1/login')
            .send({ mobile_no: TEST_MOBILE, otp: TEST_OTP, referral_code: ownCode });
        // Valid code → no mismatch, login succeeds (self-referral just skips the reference insert)
        expect(res.body.status).toBe(true);
        expect(res.body).toHaveProperty('jwt');
    });
});
