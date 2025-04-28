// src/services/firebase/config.js
import { initializeApp } from 'firebase/app';
import { getFirestore, initializeFirestore, CACHE_SIZE_UNLIMITED } from 'firebase/firestore';
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

// Inicjalizacja Firestore z włączoną obsługą cache
const db = initializeFirestore(app, {
  cacheSizeBytes: CACHE_SIZE_UNLIMITED,
});

const auth = getAuth(app);
const storage = getStorage(app);
const rtdb = getDatabase(app);

// Funkcja do wymazywania danych IndexedDB (przydatna przy problemach z wersjami)
const clearFirestoreCache = async () => {
  try {
    const databases = await window.indexedDB.databases();
    const firestoreDbs = databases.filter(db => 
      db.name.includes('firestore') || 
      db.name.includes(firebaseConfig.projectId)
    );
    
    for (const dbInfo of firestoreDbs) {
      await new Promise((resolve, reject) => {
        const request = window.indexedDB.deleteDatabase(dbInfo.name);
        request.onsuccess = () => {
          console.log(`Pomyślnie wyczyszczono bazę ${dbInfo.name}`);
          resolve();
        };
        request.onerror = () => {
          console.error(`Błąd podczas czyszczenia bazy ${dbInfo.name}`);
          reject();
        };
      });
    }
    console.log('Pamięć podręczna Firestore została wyczyszczona. Odśwież stronę, aby zastosować zmiany.');
  } catch (error) {
    console.error('Błąd podczas czyszczenia pamięci podręcznej Firestore:', error);
  }
};

// Eksportujemy funkcję clearFirestoreCache dla przypadku, gdyby była potrzebna
export { db, auth, storage, rtdb, clearFirestoreCache };