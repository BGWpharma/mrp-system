// src/contexts/AuthContext.js
import React, { createContext, useEffect, useState } from 'react';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../services/firebase/config';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Rejestracja nowego użytkownika
  const signup = async (email, password, userData) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    
    // Dodajemy dodatkowe dane użytkownika do Firestore
    await setDoc(doc(db, 'users', userCredential.user.uid), {
      ...userData,
      email,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    
    return userCredential.user;
  };

  // Logowanie
  const login = (email, password) => {
    return signInWithEmailAndPassword(auth, email, password);
  };

  // Logowanie przez Google
  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    // Możesz dodać ograniczenie domeny tutaj
    // provider.setCustomParameters({ hd: 'bgwpharma.com' });
    
    const userCredential = await signInWithPopup(auth, provider);
    
    // Sprawdź, czy użytkownik już istnieje w Firestore
    const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid));
    
    // Jeśli nie istnieje, dodaj go
    if (!userDoc.exists()) {
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        email: userCredential.user.email,
        displayName: userCredential.user.displayName,
        photoURL: userCredential.user.photoURL,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
    
    return userCredential.user;
  };

  // Wylogowanie
  const logout = () => {
    return signOut(auth);
  };

  useEffect(() => {
    // Nasłuchuj zmian stanu autentykacji
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Pobierz dodatkowe dane użytkownika z Firestore
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          setCurrentUser({ ...user, ...userDoc.data() });
        } else {
          setCurrentUser(user);
        }
      } else {
        setCurrentUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    signup,
    login,
    loginWithGoogle,
    logout,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};