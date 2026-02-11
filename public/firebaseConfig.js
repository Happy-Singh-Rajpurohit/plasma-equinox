
// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-analytics.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, arrayUnion, collection } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// TODO: Replace with your app's Firebase project configuration

const firebaseConfig = {
    apiKey: "AIzaSyDaKetBkR-dOmpcUWymyfDWKPdnXoLeiSA",
    authDomain: "game-testing-623dc.firebaseapp.com",
    projectId: "game-testing-623dc",
    storageBucket: "game-testing-623dc.firebasestorage.app",
    messagingSenderId: "658705967475",
    appId: "1:658705967475:web:670b356494099bdd817d06",
    measurementId: "G-NGMP3ZFNPH"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);
import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

export { auth, db, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, onAuthStateChanged, signOut, doc, setDoc, getDoc, updateDoc, arrayUnion, collection, sendPasswordResetEmail };
