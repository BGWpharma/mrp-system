// src/services/firebase/config.js
import { initializeApp } from 'firebase/app';
import { getFirestore, initializeFirestore, CACHE_SIZE_UNLIMITED } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getDatabase, connectDatabaseEmulator, goOnline, goOffline, ref, onValue } from 'firebase/database';

// Zastąp poniższe dane danymi z Twojego projektu Firebase
const firebaseConfig = {
    apiKey: "AIzaSyCmJ6UvggnH3KRZ7OD6mbGNQDMZcUtqh18",
    authDomain: "bgw-mrp-system.firebaseapp.com",
    projectId: "bgw-mrp-system",
    storageBucket: "bgw-mrp-system.firebasestorage.app",
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

// Funkcja pomocnicza do przesyłania plików do Firebase Storage z obejściem CORS
// Wykorzystuje tokeny i niestandardowe nagłówki, aby umożliwić dostęp z localhost
const uploadFileToStorage = async (file, path) => {
  try {
    // Pobieramy token uwierzytelniający
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error("Użytkownik nie jest zalogowany");
    }

    const token = await currentUser.getIdToken();
    
    // Tworzymy unikalny identyfikator pliku
    const timestamp = new Date().getTime();
    const fileName = encodeURIComponent(`${timestamp}_${file.name}`);
    const fullPath = `${path}/${fileName}`;
    
    // Przygotowujemy FormData z plikiem
    const formData = new FormData();
    formData.append('file', file);
    
    // URL do API Firebase Storage
    const storageUrl = `https://firebasestorage.googleapis.com/v0/b/${firebaseConfig.storageBucket}/o/${encodeURIComponent(fullPath)}`;
    
    // Wysyłamy plik z tokenem uwierzytelniającym
    const response = await fetch(storageUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': window.location.origin
      },
      body: formData
    });
    
    if (!response.ok) {
      console.error('Błąd odpowiedzi:', response);
      throw new Error(`Błąd przesyłania pliku: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Konstruujemy URL do pobrania pliku
    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${firebaseConfig.storageBucket}/o/${encodeURIComponent(data.name)}?alt=media`;
    
    return {
      name: data.name,
      downloadUrl,
      fullPath: data.fullPath || fullPath,
      contentType: data.contentType
    };
  } catch (error) {
    console.error('Błąd podczas przesyłania pliku do Firebase Storage:', error);
    throw error;
  }
};

// Funkcja do usuwania plików z Firebase Storage
const deleteFileFromStorage = async (path) => {
  try {
    // Pobieramy token uwierzytelniający
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error("Użytkownik nie jest zalogowany");
    }

    const token = await currentUser.getIdToken();
    
    // URL do API Firebase Storage
    const storageUrl = `https://firebasestorage.googleapis.com/v0/b/${firebaseConfig.storageBucket}/o/${encodeURIComponent(path)}`;
    
    // Wysyłamy żądanie usunięcia z tokenem uwierzytelniającym
    const response = await fetch(storageUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Origin': window.location.origin
      }
    });
    
    if (!response.ok && response.status !== 404) {
      console.error('Błąd odpowiedzi:', response);
      throw new Error(`Błąd usuwania pliku: ${response.status} ${response.statusText}`);
    }
    
    return true;
  } catch (error) {
    console.error('Błąd podczas usuwania pliku z Firebase Storage:', error);
    throw error;
  }
};

// Konfiguracja trwałości danych Realtime Database (offline persistence)
// Ta konfiguracja pomaga obsłużyć problemy z trybem offline
try {
  // Opcje konfiguracyjne dla bazy danych
  const rtdbConfig = {
    // Włączenie trwałości - działa automatycznie, ale możemy sterować opcjami
  };
  
  // Inicjalizacja obsługi błędów dla Realtime Database
  const handleRTDBConnectionStatus = () => {
    const connectedRef = ref(rtdb, '.info/connected');
    onValue(connectedRef, (snap) => {
      if (snap.val() === true) {
        console.log('Połączono z Realtime Database');
      } else {
        console.log('Brak połączenia z Realtime Database - działanie w trybie offline');
      }
    });
  };
  
  // Nie trzeba wywoływać tej funkcji natychmiast, można ją wywołać z komponentu,
  // lub ustawić jako część inicjalizacji aplikacji
} catch (error) {
  console.error('Błąd podczas konfiguracji trwałości Realtime Database:', error);
}

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

// Funkcja do przełączania stanu połączenia dla Realtime Database
const toggleRTDBConnection = async (enable = true) => {
  try {
    if (enable) {
      goOnline(rtdb);
      console.log('Połączenie z Realtime Database zostało włączone');
    } else {
      goOffline(rtdb);
      console.log('Połączenie z Realtime Database zostało wyłączone (tryb offline)');
    }
  } catch (error) {
    console.error(`Błąd podczas ${enable ? 'włączania' : 'wyłączania'} połączenia z Realtime Database:`, error);
  }
};

// Eksportujemy funkcje potrzebne do zarządzania bazą danych
export { 
  db, 
  auth, 
  storage, 
  rtdb, 
  clearFirestoreCache,
  toggleRTDBConnection,
  uploadFileToStorage,
  deleteFileFromStorage
};