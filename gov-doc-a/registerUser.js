'use strict';

const { Wallets } = require('fabric-network');
const FabricCAServices = require('fabric-ca-client');
const path = require('path');
const fs = require('fs');

async function main() {
    try {
        // Load connection profile
        const ccpPath = path.resolve(__dirname, 'connection-org1.json');
        const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

        // Get CA info
        const caInfo = ccp.certificateAuthorities['ca.org1.example.com'];

        let caTLSCACerts;
        if (caInfo.tlsCACerts && caInfo.tlsCACerts.path) {
            // Case 1: certificate is given as file path
            const certPath = path.resolve(__dirname, caInfo.tlsCACerts.path);
            caTLSCACerts = fs.readFileSync(certPath).toString();
        } else if (caInfo.tlsCACerts && caInfo.tlsCACerts.pem) {
            // Case 2: certificate is directly embedded
            caTLSCACerts = caInfo.tlsCACerts.pem;
        } else {
            throw new Error('❌ No valid tlsCACerts found in connection profile');
        }

        const ca = new FabricCAServices(
            caInfo.url,
            { trustedRoots: caTLSCACerts, verify: false },
            caInfo.caName
        );

        // Wallet setup
        const walletPath = path.join(process.cwd(), 'wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        // 👉 Change user ID here if needed
        const enrollmentID = 'appUser2';

        // Check if user already exists
        const userIdentity = await wallet.get(enrollmentID);
        if (userIdentity) {
            console.log(`⚠️ Identity for user "${enrollmentID}" already exists in the wallet`);
            return;
        }

        // Get admin identity
        const adminIdentity = await wallet.get('admin');
        if (!adminIdentity) {
            console.log('❌ Admin identity not found. Run enrollAdmin.js first.');
            return;
        }

        const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
        const adminUser = await provider.getUserContext(adminIdentity, 'admin');

        // Register + enroll new user
        const secret = await ca.register({
            affiliation: 'org1.department1',
            enrollmentID,
            role: 'client'
        }, adminUser);

        const enrollment = await ca.enroll({ enrollmentID, enrollmentSecret: secret });

        const x509Identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: 'Org1MSP',
            type: 'X.509',
        };

        await wallet.put(enrollmentID, x509Identity);
        console.log(`✅ Successfully registered and enrolled user "${enrollmentID}" and imported it into the wallet`);

    } catch (error) {
        console.error(`❌ Failed to register/enroll user: ${error}`);
        process.exit(1);
    }
}

main();