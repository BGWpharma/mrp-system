// src/services/firebase/config.js
import { initializeApp } from 'firebase/app';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getDatabase } from 'firebase/database';

// Zastąp poniższe dane danymi z Twojego projektu Firebase
const firebaseConfig = {
    apiKey: "AIzaSyCmJ6UvggnH3KRZ7OD6mbGNQDMZcUtqh18",
    authDomain: "bgw-mrp-system.firebaseapp.com",
    projectId: "bgw-mrp-system",
    storageBucket: "bgw-mrp-system.appspot.com",
    messagingSenderId: "562543983508",
    appId: "1:562543983508:web:4c7f8e92b7989a2e446d81",
    measurementId: "G-R30WP0YCY5",
    databaseURL: "https://bgw-mrp-system-default-rtdb.europe-west1.firebasedatabase.app"
};

// Inicjalizacja Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);
const rtdb = getDatabase(app);

// Włącz obsługę trybu offline
enableIndexedDbPersistence(db)
  .then(() => {
    console.log('Włączono obsługę trybu offline dla Firestore');
  })
  .catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('Nie można włączyć trybu offline, ponieważ aplikacja jest otwarta w wielu kartach');
    } else if (err.code === 'unimplemented') {
      console.warn('Twoja przeglądarka nie obsługuje wszystkich funkcji wymaganych do obsługi trybu offline');
    } else {
      console.error('Błąd podczas włączania trybu offline:', err);
    }
  });

export { db, auth, storage, rtdb };