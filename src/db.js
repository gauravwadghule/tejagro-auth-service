const mysql = require('mysql2/promise');

// Mirrors $con from Configuration.php
const conPool = mysql.createPool({
    host:     process.env.DB_HOST,
    port:     parseInt(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    timezone: '+05:30',
});

// Mirrors $connect from Configuration-BDM.php
// If both DBs are the same host/schema, point these env vars to the same values.
const connectPool = mysql.createPool({
    host:     process.env.DB_BDM_HOST,
    port:     parseInt(process.env.DB_BDM_PORT) || 3306,
    user:     process.env.DB_BDM_USER,
    password: process.env.DB_BDM_PASS,
    database: process.env.DB_BDM_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    timezone: '+05:30',
});

module.exports = { conPool, connectPool };
