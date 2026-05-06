const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Auth Service',
            version: '1.0.0',
            description: 'OTP-based authentication API',
        },
        servers: [{ url: 'http://localhost:3000' }],
        components: {
            schemas: {
                OtpRequest: {
                    type: 'object',
                    required: ['mobile_no'],
                    properties: {
                        mobile_no: {
                            type: 'string',
                            example: '9168681342',
                            description: 'Mobile number of the client',
                        },
                    },
                },
                OtpResponse: {
                    type: 'object',
                    properties: {
                        status:          { type: 'boolean', example: true },
                        message:         { type: 'string', example: 'OTP sent successfully' },
                        referral_code:   { type: 'string', example: '7694', description: '4-char alphanumeric code assigned to this client' },
                        referral_status: { type: 'integer', enum: [0, 1], example: 0, description: '1 if this client was referred by someone, 0 otherwise' },
                    },
                },
                LoginRequest: {
                    type: 'object',
                    required: ['mobile_no', 'otp'],
                    properties: {
                        mobile_no: {
                            type: 'string',
                            example: '9168681342',
                        },
                        otp: {
                            type: 'string',
                            example: '1234',
                            description: '4-digit OTP received via SMS',
                        },
                        referral_code: {
                            type: 'string',
                            example: '7694',
                            description: 'Optional referral code of the referring client',
                        },
                    },
                },
                LoginResponse: {
                    type: 'object',
                    properties: {
                        status:                { type: 'boolean', example: true },
                        message:               { type: 'string', example: 'Login successful.' },
                        jwt:                   { type: 'string', example: 'eyJhbGci...', description: 'HS512-signed JWT containing client identity' },
                        reference_entry_added: { type: 'boolean', example: false, description: 'Whether a new referral entry was recorded' },
                    },
                },
                ErrorResponse: {
                    type: 'object',
                    properties: {
                        status:  { type: 'boolean', example: false },
                        message: { type: 'string', example: 'Mobile number required' },
                    },
                },
            },
        },
        paths: {
            '/api/v1/otp': {
                post: {
                    summary: 'Request OTP',
                    description: 'Generates a 4-digit OTP and sends it via SMS. Creates the client record on first call; updates OTP on subsequent calls. Rate-limited to 3 requests per minute per IP.',
                    tags: ['Authentication'],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': { schema: { $ref: '#/components/schemas/OtpRequest' } },
                        },
                    },
                    responses: {
                        200: {
                            description: 'OTP sent successfully',
                            content: {
                                'application/json': { schema: { $ref: '#/components/schemas/OtpResponse' } },
                            },
                        },
                        400: {
                            description: 'Missing mobile number or SMS delivery failure',
                            content: {
                                'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
                            },
                        },
                        429: {
                            description: 'Rate limit exceeded (3 requests/min)',
                            content: {
                                'application/json': {
                                    schema: {
                                        type: 'object',
                                        properties: {
                                            status:  { type: 'boolean', example: false },
                                            message: { type: 'string', example: 'Too many OTP requests, please try again later.' },
                                        },
                                    },
                                },
                            },
                        },
                        500: {
                            description: 'Database error',
                            content: {
                                'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
                            },
                        },
                    },
                },
            },
            '/api/v1/login': {
                post: {
                    summary: 'Verify OTP and login',
                    description: 'Validates the OTP (must not be expired), optionally validates a referral code, and returns a signed JWT on success.',
                    tags: ['Authentication'],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } },
                        },
                    },
                    responses: {
                        200: {
                            description: 'Login successful — JWT returned',
                            content: {
                                'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } },
                            },
                        },
                        200.1: {
                            description: 'Login failed (invalid OTP, expired OTP, referral mismatch, client not found) — HTTP 200 with status:false',
                            content: {
                                'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
                            },
                        },
                        500: {
                            description: 'Database error',
                            content: {
                                'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
                            },
                        },
                    },
                },
            },
        },
    },
    apis: [],
};

module.exports = swaggerJsdoc(options);
