'use strict';

const FabricCAServices = require('fabric-ca-client');
const { Wallets } = require('fabric-network');
const fs = require('fs');
const path = require('path');

async function main() {
    try {
        console.log("▶️ EnrollAdmin script started...");

        // Load connection profile
        const ccpPath = path.resolve(__dirname, 'connection-org1.json');
        console.log(`📂 Using connection profile: ${ccpPath}`);
        const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

        // Create a new CA client
        const caInfo = ccp.certificateAuthorities['ca.org1.example.com'];
        console.log(`🌐 Connecting to CA at: ${caInfo.url}`);
        const ca = new FabricCAServices(caInfo.url);

        // Create wallet
        const walletPath = path.join(process.cwd(), 'wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);
        console.log(`✅ Wallet path: ${walletPath}`);

        // Check if admin exists
        const identity = await wallet.get('admin');
        if (identity) {
            console.log('⚠️ Admin identity already exists in wallet');
            return;
        }

        // Enroll admin
        console.log("🔑 Enrolling admin...");
        const enrollment = await ca.enroll({
            enrollmentID: 'admin',
            enrollmentSecret: 'adminpw'
        });

        console.log("📜 Certificate received from CA");

        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: 'Org1MSP',
            type: 'X.509',
        };

        await wallet.put('admin', x509Identity);
        console.log('🎉 Successfully enrolled admin and imported into wallet');
    } catch (error) {
        console.error(`❌ Failed to enroll admin: ${error}`);
        process.exit(1);
    }
}

main();
