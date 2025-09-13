'use strict';

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const fs = require('fs');
const { create } = require('ipfs-http-client');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// multer - store file in memory (we'll upload buffer directly to IPFS)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB limit

// Path to connection profile
const ccpPath = path.resolve(__dirname, 'connection-org1.json');
const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

// ---------- IPFS client helper ----------
function makeIpfsClient() {
    const mode = (process.env.IPFS_MODE || 'local').toLowerCase();

    if (mode === 'infura') {
        const projectId = process.env.INFURA_PROJECT_ID;
        const projectSecret = process.env.INFURA_PROJECT_SECRET;
        if (!projectId || !projectSecret) {
            throw new Error('INFURA_PROJECT_ID and INFURA_PROJECT_SECRET must be set in .env when IPFS_MODE=infura');
        }
        const auth = 'Basic ' + Buffer.from(`${projectId}:${projectSecret}`).toString('base64');
        // Infura API endpoint
        return create({
            url: 'https://ipfs.infura.io:5001/api/v0',
            headers: { authorization: auth }
        });
    } else {
        // default: local IPFS daemon: /ip4/127.0.0.1/tcp/5001
        return create({ url: 'http://127.0.0.1:5001/api/v0' });
    }
}

// ---------- Fabric helper ----------
async function getContract(identityName = 'appUser2') {
    const walletPath = path.join(process.cwd(), 'wallet');
    const wallet = await Wallets.newFileSystemWallet(walletPath);

    const identity = await wallet.get(identityName);
    if (!identity) {
        throw new Error(`❌ Identity "${identityName}" not found in wallet. Please enroll/register it first.`);
    }

    const gateway = new Gateway();
    await gateway.connect(ccp, {
        wallet,
        identity: identityName,
        discovery: { enabled: true, asLocalhost: true }
    });

    const network = await gateway.getNetwork('mychannel');
    const contract = network.getContract('document'); // chaincode name

    return { contract, gateway };
}

// Helper: safe JSON parse from buffer
function safeJSON(buffer) {
    if (!buffer) return null;
    const str = buffer.toString();
    try {
        return JSON.parse(str);
    } catch {
        return str;
    }
}

// ---------- Existing endpoints (unchanged, but gateway disconnect added) ----------

app.post('/documents', async (req, res) => {
    try {
        const { docID, owner, issuer, docType, hash, issueDate } = req.body;
        const { contract, gateway } = await getContract();
        const result = await contract.submitTransaction('IssueDocument', docID, owner, issuer, docType, hash, issueDate);
        await gateway.disconnect();
        res.json({ success: true, data: safeJSON(result) });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/documents/:id', async (req, res) => {
    try {
        const { contract, gateway } = await getContract();
        const result = await contract.evaluateTransaction('ReadDocument', req.params.id);
        await gateway.disconnect();
        res.json(safeJSON(result));
    } catch (error) {
        res.status(404).json({ error: error.message });
    }
});

app.get('/documents', async (req, res) => {
    try {
        const { contract, gateway } = await getContract();
        const result = await contract.evaluateTransaction('GetAllDocuments');
        await gateway.disconnect();
        res.json(safeJSON(result));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/documents/:id/revoke', async (req, res) => {
    try {
        const { contract, gateway } = await getContract();
        const result = await contract.submitTransaction('RevokeDocument', req.params.id);
        await gateway.disconnect();
        res.json({ success: true, data: safeJSON(result) });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ---------- NEW: Upload PDF, store to IPFS, send CID to blockchain ----------
/*
Expected: form-data with:
- file: the PDF file (field name 'file')
- docID, owner, issuer, docType, issueDate as text fields
Optionally: identityName field to use a specific wallet identity (default 'appUser2')
*/
app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        // Validate input
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded. Field name should be "file".' });
        }

        const { docID, owner, issuer, docType, issueDate, identityName } = req.body;
        if (!docID || !owner || !issuer || !docType || !issueDate) {
            return res.status(400).json({ error: 'Missing required fields. Provide docID, owner, issuer, docType, issueDate.' });
        }

        // Create IPFS client
        const ipfs = makeIpfsClient();

        // Upload to IPFS - using the buffer from multer
        const fileBuffer = req.file.buffer;
        const fileInfo = {
            path: req.file.originalname || 'document.pdf',
            content: fileBuffer
        };

        // add can accept an AsyncIterable - but the ipfs-http-client supports passing an object
        const addResult = await ipfs.add(fileInfo);
        // addResult is like { cid, path, size }
        const cid = (addResult.cid || addResult.path || addResult.toString()).toString();
        const ipfsHash = cid; // CID (v0 or v1 depending)

        // Optionally: pinning is handled by node/provider; Infura pins by default for a limited time - consider pinning services for permanence

        // Now submit to blockchain
        const identityToUse = identityName || 'appUser2';
        const { contract, gateway } = await getContract(identityToUse);

        // We will pass the IPFS CID as the 'hash' field to chaincode
        const result = await contract.submitTransaction('IssueDocument', docID, owner, issuer, docType, ipfsHash, issueDate);
        await gateway.disconnect();

        res.json({
            success: true,
            ipfs: {
                cid: ipfsHash,
                filename: req.file.originalname,
                size: req.file.size
            },
            blockchain: safeJSON(result)
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`✅ Gov Docs API running at http://localhost:${PORT}`);
});
