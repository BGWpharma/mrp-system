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
      // Firestore 'in' wspiera do 30 elementów — dziel na chunki zamiast pobierania całej kolekcji
      const usersRef = collection(db, 'users');
      const chunks = [];
      for (let i = 0; i < uncachedUserIds.length; i += 30) {
        chunks.push(uncachedUserIds.slice(i, i + 30));
      }
      
      const results = await Promise.all(
        chunks.map(chunk => {
          const q = query(usersRef, where('__name__', 'in', chunk));
          return getDocs(q);
        })
      );
      
      results.forEach(querySnapshot => {
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
 * Aktualizuje listę ukrytych podzakładek sidebara dla użytkownika
 * @param {string} userId - ID użytkownika
 * @param {Array<string>} hiddenSubtabs - Lista identyfikatorów ukrytych podzakładek
 * @param {string} adminId - ID administratora dokonującego zmiany
 * @returns {Promise<boolean>} - Czy operacja zakończyła się sukcesem
 */
export const updateUserHiddenSidebarSubtabs = async (userId, hiddenSubtabs, adminId) => {
  try {
    // Sprawdź czy użytkownik dokonujący zmiany jest administratorem
    const adminData = await getUserById(adminId);
    if (!adminData || adminData.role !== 'administrator') {
      throw new Error('Brak uprawnień do zarządzania podzakładkami użytkowników');
    }
    
    // Aktualizuj listę ukrytych podzakładek
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      hiddenSidebarSubtabs: hiddenSubtabs || [],
      updatedAt: new Date()
    });
    
    // Wyczyść cache dla tego użytkownika
    userCache.delete(userId);
    
    return true;
  } catch (error) {
    console.error('Błąd podczas aktualizacji ukrytych podzakładek użytkownika:', error);
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
 * Pobiera listę ukrytych podzakładek sidebara dla użytkownika
 * @param {string} userId - ID użytkownika
 * @returns {Promise<Array<string>>} - Lista identyfikatorów ukrytych podzakładek
 */
export const getUserHiddenSidebarSubtabs = async (userId) => {
  try {
    const userData = await getUserById(userId);
    return userData?.hiddenSidebarSubtabs || [];
  } catch (error) {
    console.error('Błąd podczas pobierania ukrytych podzakładek użytkownika:', error);
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
    const allowedFields = ['displayName', 'email', 'photoURL', 'phone', 'position', 'department', 'employeeId'];
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
 * Lista wszystkich dostępnych uprawnień w systemie
 */
export const AVAILABLE_PERMISSIONS = {
  canCompleteStocktaking: {
    id: 'canCompleteStocktaking',
    name: 'Kończenie inwentaryzacji',
    description: 'Uprawnienie do kończenia inwentaryzacji i aktualizacji stanów magazynowych'
  },
  // Dodaj tutaj kolejne uprawnienia w przyszłości
};

/**
 * Pobiera uprawnienia użytkownika
 * @param {string} userId - ID użytkownika
 * @returns {Promise<Object>} - Obiekt z uprawnieniami użytkownika
 */
export const getUserPermissions = async (userId) => {
  try {
    const userData = await getUserById(userId);
    
    // Administratorzy mają wszystkie uprawnienia
    if (userData?.role === 'administrator') {
      return Object.keys(AVAILABLE_PERMISSIONS).reduce((acc, key) => {
        acc[key] = true;
        return acc;
      }, {});
    }
    
    // Zwróć uprawnienia użytkownika lub puste obiekty dla pracownika
    return userData?.permissions || {};
  } catch (error) {
    console.error('Błąd podczas pobierania uprawnień użytkownika:', error);
    return {};
  }
};

/**
 * Sprawdza czy użytkownik ma określone uprawnienie
 * @param {string} userId - ID użytkownika
 * @param {string} permission - Nazwa uprawnienia do sprawdzenia
 * @returns {Promise<boolean>} - Czy użytkownik ma dane uprawnienie
 */
export const hasPermission = async (userId, permission) => {
  try {
    const userData = await getUserById(userId);
    
    // Administratorzy mają wszystkie uprawnienia
    if (userData?.role === 'administrator') {
      return true;
    }
    
    // Sprawdź czy użytkownik ma określone uprawnienie
    return userData?.permissions?.[permission] === true;
  } catch (error) {
    console.error('Błąd podczas sprawdzania uprawnień użytkownika:', error);
    return false;
  }
};

/**
 * Aktualizuje uprawnienia użytkownika - dostępne tylko dla administratorów
 * @param {string} userId - ID użytkownika
 * @param {Object} permissions - Obiekt z uprawnieniami do ustawienia
 * @param {string} adminId - ID administratora dokonującego zmiany
 * @returns {Promise<boolean>} - Czy operacja zakończyła się sukcesem
 */
export const updateUserPermissions = async (userId, permissions, adminId) => {
  try {
    // Sprawdź czy użytkownik dokonujący zmiany jest administratorem
    const adminData = await getUserById(adminId);
    if (!adminData || adminData.role !== 'administrator') {
      throw new Error('Brak uprawnień do zarządzania uprawnieniami użytkowników');
    }
    
    // Walidacja uprawnień - tylko dozwolone klucze
    const validatedPermissions = {};
    const availablePermissionKeys = Object.keys(AVAILABLE_PERMISSIONS);
    
    for (const key of availablePermissionKeys) {
      if (permissions.hasOwnProperty(key)) {
        validatedPermissions[key] = Boolean(permissions[key]);
      }
    }
    
    // Aktualizuj uprawnienia użytkownika
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      permissions: validatedPermissions,
      updatedAt: new Date()
    });
    
    // Wyczyść cache dla tego użytkownika
    userCache.delete(userId);
    
    return true;
  } catch (error) {
    console.error('Błąd podczas aktualizacji uprawnień użytkownika:', error);
    throw error;
  }
};

/**
 * Pobiera wszystkie dostępne zakładki sidebara z ich identyfikatorami i podzakładkami
 * @returns {Array<Object>} - Lista dostępnych zakładek z ich identyfikatorami, nazwami i podzakładkami
 */
export const getAvailableSidebarTabs = () => {
  return [
    { 
      id: 'ai-assistant', 
      name: 'Asystent AI', 
      path: '/ai-assistant',
      hasSubmenu: false,
      children: []
    },
    { 
      id: 'dashboard', 
      name: 'Dashboard', 
      path: '/',
      hasSubmenu: true,
      children: [
        { id: 'dashboard-main', name: 'Dashboard główny', path: '/' },
        { id: 'dashboard-analytics', name: 'Analityka', path: '/analytics' },
        { id: 'dashboard-worktime', name: 'Czas pracy', path: '/work-time' },
        { id: 'dashboard-schedule', name: 'Grafik', path: '/schedule' }
      ]
    },
    { 
      id: 'hall-data', 
      name: 'Parametry hali', 
      path: '/hall-data',
      hasSubmenu: true,
      children: [
        { id: 'hall-data-conditions', name: 'Warunki środowiskowe', path: '/hall-data/conditions' },
        { id: 'hall-data-machines', name: 'Maszyny', path: '/hall-data/machines' },
        { id: 'hall-data-forms', name: 'Formularze', path: '/hall-data/forms' }
      ]
    },
    { 
      id: 'sales', 
      name: 'Sprzedaż', 
      path: '/customers',
      hasSubmenu: true,
      children: [
        { id: 'sales-invoices', name: 'Faktury', path: '/invoices' },
        { id: 'sales-customers', name: 'Klienci', path: '/customers' },
        { id: 'sales-pricelists', name: 'Cenniki', path: '/orders/price-lists' },
        { id: 'sales-production-task', name: 'Nowe zadanie produkcyjne', path: '/production/create-from-order' },
        { id: 'sales-co-reports', name: 'Raporty CO', path: '/sales/co-reports' },
        { id: 'sales-customer-orders', name: 'Zamówienia klientów', path: '/orders' }
      ]
    },
    { 
      id: 'production', 
      name: 'Produkcja', 
      path: '/production',
      hasSubmenu: true,
      children: [
        { id: 'production-forms', name: 'Formularze', path: '/production/forms' },
        { id: 'production-calculator', name: 'Kalkulator', path: '/production/calculator' },
        { id: 'production-forecast', name: 'Prognoza zapotrzebowania', path: '/production/forecast' },
        { id: 'production-tasks', name: 'Zadania produkcyjne', path: '/production' },
        { id: 'production-recipes', name: 'Receptury', path: '/recipes' },
        { id: 'production-timeline', name: 'Harmonogram', path: '/production/timeline' }
      ]
    },
    { 
      id: 'inventory', 
      name: 'Stany', 
      path: '/inventory',
      hasSubmenu: true,
      children: [
        { id: 'inventory-cmr', name: 'CMR', path: '/inventory/cmr' },
        { id: 'inventory-suppliers', name: 'Dostawcy', path: '/suppliers' },
        { id: 'inventory-forms', name: 'Formularze', path: '/inventory/forms' },
        { id: 'inventory-stocktaking', name: 'Inwentaryzacja', path: '/inventory/stocktaking' },
        { id: 'inventory-status', name: 'Status stanów', path: '/inventory' },
        { id: 'inventory-expiry-dates', name: 'Terminy ważności', path: '/inventory/expiry-dates' },
        { id: 'inventory-component-orders', name: 'Zamówienia komponentów', path: '/purchase-orders' }
      ]
    }
  ];
};

/**
 * Tworzy użytkownika kioskowego (bez konta Google/email).
 * Taki użytkownik korzysta z systemu wyłącznie przez ID pracownika (Czas pracy, Grafik).
 * @param {Object} data - Dane pracownika kioskowego
 * @param {string} data.displayName - Imię i nazwisko
 * @param {string} data.employeeId - Unikalny ID pracownika (np. BGW-001)
 * @param {string} [data.position] - Stanowisko
 * @param {string} [data.department] - Dział
 * @param {string} [data.phone] - Telefon
 * @param {string} adminId - ID administratora tworzącego użytkownika
 * @returns {Promise<string>} - ID nowo utworzonego dokumentu
 */
export const createKioskUser = async (data, adminId) => {
  try {
    // Sprawdź uprawnienia admina
    const adminData = await getUserById(adminId);
    if (!adminData || adminData.role !== 'administrator') {
      throw new Error('Brak uprawnień do tworzenia użytkowników');
    }

    // Walidacja wymaganych pól
    if (!data.displayName || !data.displayName.trim()) {
      throw new Error('Imię i nazwisko jest wymagane');
    }
    if (!data.employeeId || !data.employeeId.trim()) {
      throw new Error('ID pracownika jest wymagane');
    }

    const employeeId = data.employeeId.toUpperCase().trim();

    // Sprawdź unikalność employeeId
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('employeeId', '==', employeeId));
    const existingSnapshot = await getDocs(q);
    if (!existingSnapshot.empty) {
      throw new Error(`Pracownik o ID "${employeeId}" już istnieje w systemie`);
    }

    // Utwórz dokument z auto-generowanym ID (prefix kiosk-)
    const { addDoc } = await import('firebase/firestore');
    const newUserRef = await addDoc(collection(db, 'users'), {
      displayName: data.displayName.trim(),
      employeeId: employeeId,
      email: '',
      photoURL: '',
      phone: data.phone || '',
      position: data.position || '',
      department: data.department || '',
      role: 'pracownik',
      accountType: 'kiosk', // Oznaczenie konta kioskowego
      disabled: false,
      aiMessagesLimit: 0,
      aiMessagesUsed: 0,
      permissions: {},
      createdBy: adminId,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    return newUserRef.id;
  } catch (error) {
    console.error('Błąd podczas tworzenia użytkownika kioskowego:', error);
    throw error;
  }
};

/**
 * Usuwa użytkownika kioskowego (tylko konta typu kiosk)
 * @param {string} userId - ID dokumentu użytkownika
 * @param {string} adminId - ID administratora
 * @returns {Promise<boolean>}
 */
export const deleteKioskUser = async (userId, adminId) => {
  try {
    // Sprawdź uprawnienia admina
    const adminData = await getUserById(adminId);
    if (!adminData || adminData.role !== 'administrator') {
      throw new Error('Brak uprawnień do usuwania użytkowników');
    }

    // Sprawdź czy to konto kioskowe
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    if (!userDoc.exists()) {
      throw new Error('Użytkownik nie istnieje');
    }
    
    const userData = userDoc.data();
    if (userData.accountType !== 'kiosk') {
      throw new Error('Można usuwać tylko konta kioskowe. Konta z logowaniem Google nie mogą być usunięte z tego poziomu.');
    }

    const { deleteDoc } = await import('firebase/firestore');
    await deleteDoc(userRef);
    
    // Wyczyść cache
    userCache.delete(userId);

    return true;
  } catch (error) {
    console.error('Błąd podczas usuwania użytkownika kioskowego:', error);
    throw error;
  }
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
  updateUserHiddenSidebarSubtabs,
  getUserHiddenSidebarSubtabs,
  updateUserProfile,
  getAvailableSidebarTabs,
  getUserPermissions,
  hasPermission,
  updateUserPermissions,
  createKioskUser,
  deleteKioskUser,
  AVAILABLE_PERMISSIONS
}; 