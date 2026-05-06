const { writeLog } = require('../logger');

async function creditOpeningWallet(connectPool, clientId) {
    const [walletRows] = await connectPool.execute(
        "SELECT wallet_opening FROM wallet_master WHERE status='1' LIMIT 1"
    );
    if (!walletRows.length) return;

    const wallet = walletRows[0].wallet_opening;

    const [existing] = await connectPool.execute(
        "SELECT id FROM customer_wallet WHERE client_id=? AND regarding='Opening'",
        [clientId]
    );

    if (existing.length === 0) {
        await connectPool.execute(
            "INSERT INTO customer_wallet (client_id, credit, regarding, added_on) VALUES (?, ?, 'Opening', NOW())",
            [clientId, wallet]
        );
        writeLog('ACTION', 'Wallet credited', { client_id: clientId, amount: wallet });
    }
}

module.exports = { creditOpeningWallet };
