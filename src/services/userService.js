// src/services/userService.js
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase/config';

/**
 * Pobiera dane użytkownika na podstawie jego ID
 * @param {string} userId - ID użytkownika
 * @returns {Promise<Object|null>} - Dane użytkownika lub null jeśli nie znaleziono
 */
export const getUserById = async (userId) => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      return userDoc.data();
    }
    
    return null;
  } catch (error) {
    console.error('Błąd podczas pobierania danych użytkownika:', error);
    throw error;
  }
};

/**
 * Aktualizuje dane użytkownika po zalogowaniu - zapisuje displayName, email, photoURL
 * @param {string} userId - ID użytkownika
 * @param {Object} userData - Dane użytkownika do zapisania
 * @returns {Promise<void>}
 */
export const updateUserData = async (userId, userData) => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      // Aktualizuj istniejący dokument
      await updateDoc(userRef, {
        displayName: userData.displayName || '',
        email: userData.email || '',
        photoURL: userData.photoURL || '',
        updatedAt: new Date()
      });
    } else {
      // Utwórz nowy dokument
      await setDoc(userRef, {
        displayName: userData.displayName || '',
        email: userData.email || '',
        photoURL: userData.photoURL || '',
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
  } catch (error) {
    console.error('Błąd podczas aktualizacji danych użytkownika:', error);
    throw error;
  }
};

/**
 * Pobiera nazwy użytkowników na podstawie listy ID
 * @param {Array<string>} userIds - Lista ID użytkowników
 * @returns {Promise<Object>} - Obiekt mapujący ID użytkowników na ich nazwy
 */
export const getUsersDisplayNames = async (userIds) => {
  try {
    const userNames = {};
    
    for (const userId of userIds) {
      if (!userId) continue;
      
      const userData = await getUserById(userId);
      
      if (userData) {
        // Wybierz najlepszą dostępną informację o użytkowniku
        userNames[userId] = userData.displayName || userData.email || userId;
      } else {
        userNames[userId] = userId; // Fallback na ID
      }
    }
    
    return userNames;
  } catch (error) {
    console.error('Błąd podczas pobierania nazw użytkowników:', error);
    throw error;
  }
};

export default {
  getUserById,
  updateUserData,
  getUsersDisplayNames
}; 