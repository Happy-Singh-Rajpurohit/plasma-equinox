const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); // Make sure filename matches

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
module.exports = { admin, db };