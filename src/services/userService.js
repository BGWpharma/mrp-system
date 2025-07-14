// src/services/userService.js
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase/config';

// Cache dla danych użytkowników
const userCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minut

/**
 * Pobiera dane użytkownika na podstawie jego ID
 * @param {string} userId - ID użytkownika
 * @returns {Promise<Object|null>} - Dane użytkownika lub null jeśli nie znaleziono
 */
export const getUserById = async (userId) => {
  try {
    // Sprawdź cache
    const cached = userCache.get(userId);
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
      return cached.data;
    }

    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      const userData = userDoc.data();
      // Zapisz w cache
      userCache.set(userId, {
        data: userData,
        timestamp: Date.now()
      });
      return userData;
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
 * Pobiera nazwy użytkowników na podstawie listy ID - zoptymalizowana wersja
 * @param {Array<string>} userIds - Lista ID użytkowników
 * @returns {Promise<Object>} - Obiekt mapujący ID użytkowników na ich nazwy
 */
export const getUsersDisplayNames = async (userIds) => {
  try {
    if (!userIds || userIds.length === 0) {
      return {};
    }

    // Usuń duplikaty i puste wartości
    const uniqueUserIds = [...new Set(userIds.filter(id => id))];
    const userNames = {};
    const uncachedUserIds = [];

    // Sprawdź cache dla każdego użytkownika
    for (const userId of uniqueUserIds) {
      const cached = userCache.get(userId);
      if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
        const userData = cached.data;
        userNames[userId] = userData.displayName || userData.email || userId;
      } else {
        uncachedUserIds.push(userId);
      }
    }

    // Jeśli wszystkie dane są w cache, zwróć je
    if (uncachedUserIds.length === 0) {
      return userNames;
    }

    // Pobierz brakujących użytkowników jednym zapytaniem
    if (uncachedUserIds.length <= 10) {
      // Dla małej liczby użytkowników użyj zapytania 'in'
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('__name__', 'in', uncachedUserIds));
      const querySnapshot = await getDocs(q);
      
      querySnapshot.docs.forEach(doc => {
        const userData = doc.data();
        const userId = doc.id;
        
        // Zapisz w cache
        userCache.set(userId, {
          data: userData,
          timestamp: Date.now()
        });
        
        // Dodaj do wyników
        userNames[userId] = userData.displayName || userData.email || userId;
      });
    } else {
      // Dla większej liczby użytkowników pobierz wszystkich i przefiltruj
      const usersRef = collection(db, 'users');
      const querySnapshot = await getDocs(usersRef);
      
      querySnapshot.docs.forEach(doc => {
        const userId = doc.id;
        if (uncachedUserIds.includes(userId)) {
          const userData = doc.data();
          
          // Zapisz w cache
          userCache.set(userId, {
            data: userData,
            timestamp: Date.now()
          });
          
          // Dodaj do wyników
          userNames[userId] = userData.displayName || userData.email || userId;
        }
      });
    }

    // Dodaj fallback dla użytkowników, których nie znaleziono
    for (const userId of uncachedUserIds) {
      if (!userNames[userId]) {
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
 * Pobiera listę wszystkich aktywnych użytkowników (niewyłączonych z systemu)
 * @returns {Promise<Array>} - Lista aktywnych użytkowników
 */
export const getAllActiveUsers = async () => {
  try {
    const users = await getAllUsers();
    // Filtruj tylko aktywnych użytkowników (gdzie disabled !== true)
    return users.filter(user => !user.disabled);
  } catch (error) {
    console.error('Błąd podczas pobierania aktywnych użytkowników:', error);
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

/**
 * Aktualizuje listę ukrytych zakładek sidebara dla użytkownika
 * @param {string} userId - ID użytkownika
 * @param {Array<string>} hiddenTabs - Lista identyfikatorów ukrytych zakładek
 * @param {string} adminId - ID administratora dokonującego zmiany
 * @returns {Promise<boolean>} - Czy operacja zakończyła się sukcesem
 */
export const updateUserHiddenSidebarTabs = async (userId, hiddenTabs, adminId) => {
  try {
    // Sprawdź czy użytkownik dokonujący zmiany jest administratorem
    const adminData = await getUserById(adminId);
    if (!adminData || adminData.role !== 'administrator') {
      throw new Error('Brak uprawnień do zarządzania zakładkami użytkowników');
    }
    
    // Aktualizuj listę ukrytych zakładek
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      hiddenSidebarTabs: hiddenTabs || [],
      updatedAt: new Date()
    });
    
    // Wyczyść cache dla tego użytkownika
    userCache.delete(userId);
    
    return true;
  } catch (error) {
    console.error('Błąd podczas aktualizacji ukrytych zakładek użytkownika:', error);
    throw error;
  }
};

/**
 * Pobiera listę ukrytych zakładek sidebara dla użytkownika
 * @param {string} userId - ID użytkownika
 * @returns {Promise<Array<string>>} - Lista identyfikatorów ukrytych zakładek
 */
export const getUserHiddenSidebarTabs = async (userId) => {
  try {
    const userData = await getUserById(userId);
    return userData?.hiddenSidebarTabs || [];
  } catch (error) {
    console.error('Błąd podczas pobierania ukrytych zakładek użytkownika:', error);
    return [];
  }
};

/**
 * Edytuje dane profilu użytkownika - dostępne tylko dla administratorów
 * @param {string} userId - ID użytkownika do edycji
 * @param {Object} userProfile - Nowe dane profilu użytkownika
 * @param {string} adminId - ID administratora dokonującego zmiany
 * @returns {Promise<boolean>} - Czy operacja zakończyła się sukcesem
 */
export const updateUserProfile = async (userId, userProfile, adminId) => {
  try {
    // Sprawdź czy użytkownik dokonujący zmiany jest administratorem
    const adminData = await getUserById(adminId);
    if (!adminData || adminData.role !== 'administrator') {
      throw new Error('Brak uprawnień do edycji danych użytkowników');
    }
    
    // Walidacja danych
    const allowedFields = ['displayName', 'email', 'photoURL', 'phone', 'position', 'department'];
    const updateData = {};
    
    // Filtruj tylko dozwolone pola
    for (const field of allowedFields) {
      if (userProfile.hasOwnProperty(field)) {
        updateData[field] = userProfile[field] || '';
      }
    }
    
    // Dodaj timestamp aktualizacji
    updateData.updatedAt = new Date();
    
    // Sprawdź czy email jest unikalny (jeśli zmieniono)
    if (updateData.email && updateData.email !== '') {
      const existingUsers = await getAllUsers();
      const emailExists = existingUsers.some(user => 
        user.email === updateData.email && user.id !== userId
      );
      
      if (emailExists) {
        throw new Error('Podany adres email jest już używany przez innego użytkownika');
      }
    }
    
    // Aktualizuj dane użytkownika
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, updateData);
    
    // Wyczyść cache dla tego użytkownika
    userCache.delete(userId);
    
    return true;
  } catch (error) {
    console.error('Błąd podczas aktualizacji profilu użytkownika:', error);
    throw error;
  }
};

/**
 * Pobiera wszystkie dostępne zakładki sidebara z ich identyfikatorami
 * @returns {Array<Object>} - Lista dostępnych zakładek z ich identyfikatorami i nazwami
 */
export const getAvailableSidebarTabs = () => {
  return [
    { id: 'ai-assistant', name: 'Asystent AI', path: '/ai-assistant' },
    { id: 'dashboard', name: 'Dashboard', path: '/' },
    { id: 'hall-data', name: 'Parametry hali', path: '/hall-data' },
    { id: 'sales', name: 'Sprzedaż', path: '/customers' },
    { id: 'production', name: 'Produkcja', path: '/production' },
    { id: 'inventory', name: 'Stany', path: '/inventory' }
  ];
};

export default {
  getUserById,
  updateUserData,
  getUsersDisplayNames,
  changeUserRole,
  getAllUsers,
  getAllActiveUsers,
  checkAndUpdateAIMessageQuota,
  updateUserHiddenSidebarTabs,
  getUserHiddenSidebarTabs,
  updateUserProfile,
  getAvailableSidebarTabs
}; 