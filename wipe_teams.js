const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function wipe() {
    console.log("Starting wiping of 'teams' collection...");
    const snapshot = await db.collection('teams').get();

    if (snapshot.empty) {
        console.log('No matching documents.');
        return;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
    });

    await batch.commit();
    console.log(`Successfully deleted ${snapshot.size} teams.`);
}

wipe().then(() => process.exit(0)).catch(console.error);
