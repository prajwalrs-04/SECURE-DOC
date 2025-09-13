'use strict';

require('dotenv').config();
const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const fs = require('fs');

async function main() {
    const docIDToRevoke = 'DOC001'; // CHANGE THIS to the docID you want to test

    console.log(`\n--- Attempting to revoke document: ${docIDToRevoke} ---`);

    try {
        // Path to connection profile
        const ccpPath = path.resolve(__dirname, 'connection-org1.json');
        const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

        // Load the user's wallet
        const walletPath = path.join(process.cwd(), 'wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);
        const identityName = 'appUser2';

        const identity = await wallet.get(identityName);
        if (!identity) {
            console.error(`❌ Identity "${identityName}" not found in wallet. Please enroll/register it first.`);
            return;
        }

        const gateway = new Gateway();
        await gateway.connect(ccp, {
            wallet,
            identity: identityName,
            discovery: { enabled: true, asLocalhost: true }
        });

        const network = await gateway.getNetwork('mychannel');
        const contract = network.getContract('document');

        console.log(`✅ Fabric Gateway connected. Submitting transaction...`);
        
        // Submit the transaction
        const resultBuffer = await contract.submitTransaction('RevokeDocument', docIDToRevoke);

        const result = resultBuffer.toString();
        console.log(`\n--- Revoke Transaction Successful ---`);
        console.log('Result:', result);

    } catch (error) {
        console.error(`\n--- Revoke Transaction Failed ---`);
        console.error(`❌ Error Message: ${error.message}`);
        console.error('❌ Full Error Object:', error);
        
    } finally {
        if (gateway) {
            gateway.disconnect();
        }
    }
}

main();