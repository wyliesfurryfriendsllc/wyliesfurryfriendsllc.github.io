import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
    getFirestore, collection, addDoc, getDocs, doc,
    updateDoc, deleteDoc, query, orderBy, onSnapshot, where,
    serverTimestamp, getDoc, setDoc
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import {
    getAuth, createUserWithEmailAndPassword,
    signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile,
    GoogleAuthProvider, signInWithPopup, signInAnonymously, sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const firebaseConfig = {
    apiKey: "AIzaSyAZmA71wW1vkg1HTXVEzpccOQOw5vP7KDg",
    authDomain: "wylie-furry-friends-llc.firebaseapp.com",
    projectId: "wylie-furry-friends-llc",
    storageBucket: "wylie-furry-friends-llc.firebasestorage.app",
    messagingSenderId: "850696742361",
    appId: "1:850696742361:web:4ae4890244b091e431e5c8"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export {
    collection, addDoc, getDocs, doc, updateDoc, deleteDoc,
    query, orderBy, onSnapshot, where, serverTimestamp,
    getDoc, setDoc, createUserWithEmailAndPassword,
    signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile,
    GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail
};

// Also expose via window for non-module scripts (booking.js, admin.js)
window.WFF = {
    db, auth, signInAnonymously, onAuthStateChanged,
    signInWithEmailAndPassword, signOut,
    collection, addDoc, getDocs, doc, updateDoc,
    query, orderBy, onSnapshot, where, serverTimestamp,
    getDoc, setDoc
};
