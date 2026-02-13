const admin = require('firebase-admin');

let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (e) {
        console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT environment variable', e);
    }
} else {
    try {
        serviceAccount = require('./serviceAccountKey.json');
    } catch (e) {
        console.warn('serviceAccountKey.json not found and FIREBASE_SERVICE_ACCOUNT not set.');
    }
}

if (serviceAccount) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("Firebase Admin initialized successfully.");
    } catch (e) {
        console.error("Error initializing Firebase Admin:", e);
    }
} else {
    // If no credentials, we might be in a build step or limited environment
    // But for this app to work, we need them. 
    console.error("Firebase Admin could not be initialized due to missing credentials.");
}

let db;
try {
    if (admin.apps.length > 0) {
        db = admin.firestore();
    } else {
        console.error("Firebase app not initialized, skipping Firestore initialization.");
    }
} catch (e) {
    console.error("Error initializing Firestore:", e);
}

module.exports = { admin, db };