/**
 * Local schema setup for auth-service
 * Run once before starting the server: node setup-db.js
 *
 * tejagro_bdm_login    → client_master, reference_details
 * tejagro_sales_login  → android_activity_tracking, wallet_master, customer_wallet
 */

require('dotenv').config({ path: '.env.example' });
const mysql = require('mysql2/promise');

async function createConnection(host, port, user, password) {
    return mysql.createConnection({ host, port: parseInt(port) || 3306, user, password });
}

async function setupSalesDb(con) {
    const db = process.env.DB_NAME;
    await con.query(`CREATE DATABASE IF NOT EXISTS \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await con.query(`USE \`${db}\``);
    console.log(`\n[${db}]`);

    await con.query(`
        CREATE TABLE IF NOT EXISTS android_activity_tracking (
            id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
            client_id       INT UNSIGNED NOT NULL,
            search_type     VARCHAR(50)           DEFAULT NULL,
            track_date_time DATETIME              DEFAULT NULL,
            PRIMARY KEY (id),
            KEY idx_client_id (client_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('  ✓ android_activity_tracking');

    await con.query(`
        CREATE TABLE IF NOT EXISTS wallet_master (
            id             INT UNSIGNED  NOT NULL AUTO_INCREMENT,
            wallet_opening DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            status         TINYINT(1)    NOT NULL DEFAULT 0,
            PRIMARY KEY (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('  ✓ wallet_master');

    await con.query(`
        CREATE TABLE IF NOT EXISTS customer_wallet (
            id        INT UNSIGNED  NOT NULL AUTO_INCREMENT,
            client_id INT UNSIGNED  NOT NULL,
            credit    DECIMAL(10,2) NOT NULL DEFAULT 0.00,
            regarding VARCHAR(100)           DEFAULT NULL,
            added_on  DATETIME               DEFAULT NULL,
            PRIMARY KEY (id),
            KEY idx_client_id (client_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('  ✓ customer_wallet');

    // Seed: only if no active row exists
    const [existing] = await con.query("SELECT id FROM wallet_master WHERE status=1 LIMIT 1");
    if (existing.length === 0) {
        await con.query("INSERT INTO wallet_master (wallet_opening, status) VALUES (50.00, 1)");
        console.log('  ✓ wallet_master seeded (opening balance = 50.00)');
    } else {
        console.log('  - wallet_master seed skipped — active row already exists');
    }
}

async function setupBdmDb(con) {
    const db = process.env.DB_BDM_NAME;
    await con.query(`CREATE DATABASE IF NOT EXISTS \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await con.query(`USE \`${db}\``);
    console.log(`\n[${db}]`);

    await con.query(`
        CREATE TABLE IF NOT EXISTS client_master (
            client_id           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
            client_mob          VARCHAR(15)   NOT NULL DEFAULT '',
            client_person1_mob  VARCHAR(15)            DEFAULT NULL,
            client_person2_mob2 VARCHAR(15)            DEFAULT NULL,
            client_name         VARCHAR(100)           DEFAULT NULL,
            reference_no        BIGINT UNSIGNED        DEFAULT NULL,
            otp                 VARCHAR(10)            DEFAULT NULL,
            otp_expires_at      DATETIME               DEFAULT NULL,
            app_installation    TINYINT(1)    NOT NULL DEFAULT 0,
            referral_code       VARCHAR(20)            DEFAULT NULL,
            PRIMARY KEY (client_id),
            UNIQUE KEY uk_referral_code (referral_code),
            KEY idx_client_mob  (client_mob),
            KEY idx_person1_mob (client_person1_mob),
            KEY idx_person2_mob (client_person2_mob2)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('  ✓ client_master');

    await con.query(`
        CREATE TABLE IF NOT EXISTS reference_details (
            reference_id     INT UNSIGNED NOT NULL AUTO_INCREMENT,
            mobile_no        VARCHAR(15)           DEFAULT NULL,
            name             VARCHAR(100)          DEFAULT NULL,
            client_id        INT UNSIGNED          DEFAULT NULL,
            added_on         DATETIME              DEFAULT NULL,
            bdm_user_id      INT                   DEFAULT 0,
            bdm_user_name    VARCHAR(100)          DEFAULT NULL,
            sales_user_id    INT                   DEFAULT NULL,
            sales_user_name  VARCHAR(100)          DEFAULT NULL,
            android_referral TINYINT(1)            DEFAULT 0,
            referral_from    INT UNSIGNED          DEFAULT NULL,
            referral_to      INT UNSIGNED          DEFAULT NULL,
            PRIMARY KEY (reference_id),
            KEY idx_referral_to (referral_to)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('  ✓ reference_details');
}

async function run() {
    const salesCon = await createConnection(
        process.env.DB_HOST,
        process.env.DB_PORT,
        process.env.DB_USER,
        process.env.DB_PASS,
    );

    // Use a separate connection only when the BDM host/user differs from primary
    const sameCreds =
        process.env.DB_BDM_HOST === process.env.DB_HOST &&
        process.env.DB_BDM_PORT === process.env.DB_PORT &&
        process.env.DB_BDM_USER === process.env.DB_USER;

    const bdmCon = sameCreds
        ? salesCon
        : await createConnection(
              process.env.DB_BDM_HOST,
              process.env.DB_BDM_PORT,
              process.env.DB_BDM_USER,
              process.env.DB_BDM_PASS,
          );

    console.log(`Connected to MySQL at ${process.env.DB_HOST}`);

    await setupSalesDb(salesCon);
    await setupBdmDb(bdmCon);

    await salesCon.end();
    if (!sameCreds) await bdmCon.end();

    console.log('\nSchema setup complete. You can now run: npm start');
}

run().catch(err => {
    console.error('Setup failed:', err.message);
    process.exit(1);
});
