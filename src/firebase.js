// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);

export default app; 