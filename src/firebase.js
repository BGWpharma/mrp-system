// Import the functions you need from the SDKs you need
import { initializeApp, getApps } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCmJ6UvggnH3KRZ7OD6mbGNQDMZcUtqh18",
  authDomain: "bgw-mrp-system.firebaseapp.com",
  databaseURL: "https://bgw-mrp-system-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "bgw-mrp-system",
  storageBucket: "bgw-mrp-system.firebasestorage.app",
  messagingSenderId: "562543983508",
  appId: "1:562543983508:web:58046114be3a8259446d81",
  measurementId: "G-8XDQDZC3WT"
};

// Initialize Firebase (tylko jeśli jeszcze nie istnieje)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize Analytics (opcjonalnie, z obsługą błędów)
let analytics = null;
try {
  if (typeof window !== 'undefined') {
    analytics = getAnalytics(app);
  }
} catch (error) {
  console.warn('Analytics not available:', error.message);
}

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);

// Initialize Firebase Storage
export const storage = getStorage(app);

// Export analytics (może być null jeśli nie dostępny)
export { analytics };

// Export app for Cloud Functions
export { app };

export default app; 