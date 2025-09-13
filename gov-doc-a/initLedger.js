'use strict';

require('dotenv').config();
const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const fs = require('fs');

async function main() {
    let gateway;
    
    console.log(`\n--- Initializing ledger with sample documents ---`);

    try {
        const ccpPath = path.resolve(__dirname, 'connection-org1.json');
        const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

        const walletPath = path.join(process.cwd(), 'wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);
        const identityName = 'appUser2';

        const identity = await wallet.get(identityName);
        if (!identity) {
            console.error(`❌ Identity "${identityName}" not found in wallet. Please enroll/register it first.`);
            return;
        }

        gateway = new Gateway();
        await gateway.connect(ccp, {
            wallet,
            identity: identityName,
            discovery: { enabled: true, asLocalhost: true }
        });

        const network = await gateway.getNetwork('mychannel');
        const contract = network.getContract('document');

        console.log(`✅ Fabric Gateway connected. Submitting InitLedger transaction...`);
        
        await contract.submitTransaction('InitLedger');

        console.log(`\n--- InitLedger Transaction Successful ---`);
        console.log('✅ The ledger has been populated with DOC001 and DOC002.');

    } catch (error) {
        console.error(`\n--- InitLedger Transaction Failed ---`);
        console.error(`❌ Error Message: ${error.message}`);
        
    } finally {
        if (gateway) {
            gateway.disconnect();
        }
    }
}

main();