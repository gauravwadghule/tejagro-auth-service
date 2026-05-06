# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm install

# Run in production
npm start          # node src/server.js

# Run in development (auto-reload)
npm run dev        # nodemon src/server.js

# Initialize database tables (run once against a fresh MySQL instance)
node setup-db.js
```

No test runner or linter is configured.

## Environment Setup

Copy `.env.example` to `.env`. Required variables:

- `DB_*` / `DB_BDM_*` — Two separate MySQL databases: `tejagro_sales_login` (primary) and `tejagro_bdm_login` (BDM activity)
- `SMS_*` — InfyReachConnect SMS gateway credentials
- `JWT_SECRET` — HS512 signing key
- `OTP_EXPIRY_MINUTES` — Default 1 minute
- `TEST_MOBILE` / `TEST_OTP` — When the request mobile matches `TEST_MOBILE`, OTP sending is skipped and `TEST_OTP` is accepted, enabling local development without a real SMS gateway

## Architecture

The service is a two-endpoint Express API implementing OTP-based authentication with JWT issuance.

**Entry:** `src/server.js` — sets up CORS, JSON parsing, rate limiting (3 req/min/IP on the OTP route), and mounts the two route files.

**Routes:**
- `src/routes/otp.js` — `POST /api/v1/otp`: generates a 4-digit OTP, sends it via SMS, upserts the client record in `client_master`, and triggers referral tracking and wallet crediting for new users.
- `src/routes/login.js` — `POST /api/v1/login`: verifies OTP and expiry, validates an optional referral code, and returns a signed JWT containing client identity claims.

**Database (`src/db.js`):** Two MySQL connection pools (10 connections each, IST timezone):
- `conPool` → `tejagro_sales_login` (client accounts, OTP, referrals, wallet config)
- `connectPool` → `tejagro_bdm_login` (activity tracking, customer wallet)

**Services:**
- `src/services/smsService.js` — HTTP call to InfyReachConnect API with OTP message
- `src/services/walletService.js` — Credits the opening wallet balance for first-time installs

**Logging (`src/logger.js`):** Winston JSON logs written to `/tmp/log/auth-service/` — separate files for `action.log`, `error.log`, and `success.log`.

## Key Domain Details

- OTPs are 4 digits (1000–9999), expire after `OTP_EXPIRY_MINUTES`, and are stored directly on `client_master`.
- Referral codes are 4-character alphanumeric strings generated on first registration and stored on `client_master`.
- The wallet credit on first app install reads the opening balance from `wallet_master` and inserts a transaction into `customer_wallet` (on the BDM pool).
- JWT tokens use HS512 and carry `clientId`, `mobile`, `name`, and `email` claims.
