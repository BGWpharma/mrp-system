// src/services/userService.js
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
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
        updatedAt: new Date(),
        // Aktualizuj rolę tylko jeśli jest w userData
        ...(userData.role ? { role: userData.role } : {})
      });
    } else {
      // Utwórz nowy dokument
      await setDoc(userRef, {
        displayName: userData.displayName || '',
        email: userData.email || '',
        photoURL: userData.photoURL || '',
        role: userData.role || 'pracownik', // Domyślna rola
        aiMessagesLimit: 50, // Domyślny limit dla pracownika
        aiMessagesUsed: 0, // Licznik wykorzystanych wiadomości
        aiMessagesResetDate: new Date(), // Data ostatniego resetu limitu
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

/**
 * Zmienia rolę użytkownika - dostępne tylko dla administratorów
 * @param {string} userId - ID użytkownika, którego rola ma być zmieniona
 * @param {string} newRole - Nowa rola ('administrator' lub 'pracownik')
 * @param {string} adminId - ID administratora dokonującego zmiany
 * @returns {Promise<boolean>} - Czy operacja zakończyła się sukcesem
 */
export const changeUserRole = async (userId, newRole, adminId) => {
  try {
    // Sprawdź czy użytkownik dokonujący zmiany jest administratorem
    const adminData = await getUserById(adminId);
    if (!adminData || adminData.role !== 'administrator') {
      throw new Error('Brak uprawnień do zmiany roli użytkownika');
    }
    
    // Sprawdź czy nowa rola jest prawidłowa
    if (newRole !== 'administrator' && newRole !== 'pracownik') {
      throw new Error('Nieprawidłowa rola. Dostępne role: administrator, pracownik');
    }
    
    // Ustaw odpowiedni limit wiadomości w zależności od roli
    const aiMessagesLimit = newRole === 'administrator' ? 250 : 50;
    
    // Aktualizuj rolę użytkownika
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      role: newRole,
      aiMessagesLimit: aiMessagesLimit,
      updatedAt: new Date()
    });
    
    return true;
  } catch (error) {
    console.error('Błąd podczas zmiany roli użytkownika:', error);
    throw error;
  }
};

/**
 * Pobiera listę wszystkich użytkowników
 * @returns {Promise<Array>} - Lista użytkowników
 */
export const getAllUsers = async () => {
  try {
    const usersCollection = collection(db, 'users');
    const usersSnapshot = await getDocs(usersCollection);
    
    return usersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Błąd podczas pobierania listy użytkowników:', error);
    throw error;
  }
};

/**
 * Sprawdza czy użytkownik może wysłać kolejną wiadomość do asystenta AI
 * i zwiększa licznik wykorzystanych wiadomości
 * @param {string} userId - ID użytkownika
 * @returns {Promise<{canSendMessage: boolean, remaining: number, limit: number}>} - Obiekt z informacją o możliwości wysłania wiadomości
 */
export const checkAndUpdateAIMessageQuota = async (userId) => {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      throw new Error('Użytkownik nie istnieje');
    }
    
    const userData = userDoc.data();
    
    // Sprawdź czy istnieją dane dotyczące limitu wiadomości
    // Jeśli nie, ustaw domyślne wartości w zależności od roli
    const isAdmin = userData.role === 'administrator';
    const defaultLimit = isAdmin ? 250 : 50;
    
    const aiMessagesLimit = userData.aiMessagesLimit || defaultLimit;
    const aiMessagesUsed = userData.aiMessagesUsed || 0;
    let aiMessagesResetDate = userData.aiMessagesResetDate ? 
      userData.aiMessagesResetDate.toDate() : new Date();
    
    // Sprawdź czy należy zresetować licznik (nowy miesiąc)
    const currentDate = new Date();
    const resetDate = new Date(aiMessagesResetDate);
    
    const shouldReset = currentDate.getMonth() !== resetDate.getMonth() ||
                       currentDate.getFullYear() !== resetDate.getFullYear();
    
    // Jeśli nowy miesiąc, resetuj licznik
    if (shouldReset) {
      await updateDoc(userRef, {
        aiMessagesUsed: 0,
        aiMessagesResetDate: serverTimestamp()
      });
      
      return {
        canSendMessage: true,
        remaining: aiMessagesLimit,
        limit: aiMessagesLimit
      };
    }
    
    // Sprawdź czy użytkownik nie przekroczył limitu
    if (aiMessagesUsed >= aiMessagesLimit) {
      return {
        canSendMessage: false,
        remaining: 0,
        limit: aiMessagesLimit
      };
    }
    
    // Zwiększ licznik wykorzystanych wiadomości
    await updateDoc(userRef, {
      aiMessagesUsed: aiMessagesUsed + 1
    });
    
    return {
      canSendMessage: true,
      remaining: aiMessagesLimit - (aiMessagesUsed + 1),
      limit: aiMessagesLimit
    };
  } catch (error) {
    console.error('Błąd podczas sprawdzania limitu wiadomości AI:', error);
    throw error;
  }
};

export default {
  getUserById,
  updateUserData,
  getUsersDisplayNames,
  changeUserRole,
  getAllUsers,
  checkAndUpdateAIMessageQuota
}; 