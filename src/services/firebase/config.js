// src/services/firebase/config.js
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Zastąp poniższe dane danymi z Twojego projektu Firebase
const firebaseConfig = {
    apiKey: "AIzaSyCmJ6UvggnH3KRZ7OD6mbGNQDMZcUtqh18",
    authDomain: "bgw-mrp-system.firebaseapp.com",
    projectId: "bgw-mrp-system",
    storageBucket: "bgw-mrp-system.firebasestorage.app",
    messagingSenderId: "562543983508",
    appId: "1:562543983508:web:4c7f8e92b7989a2e446d81",
    measurementId: "G-R30WP0YCY5"
  };

// Inicjalizacja Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };