import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  getDoc, 
  getDocs, 
  deleteDoc, 
  query, 
  where,
  orderBy,
  limit,
  serverTimestamp,
  getCountFromServer
} from 'firebase/firestore';
import { 
  ref, 
  set, 
  push, 
  update, 
  onValue, 
  onChildAdded, 
  get, 
  query as rtdbQuery, 
  limitToLast, 
  remove,
  serverTimestamp as rtdbServerTimestamp 
} from 'firebase/database';
import { db, rtdb } from './firebase/config';
import { getUserById } from './userService';

// Stałe dla kolekcji w Firebase
const NOTIFICATIONS_COLLECTION = 'notifications';
const REALTIME_NOTIFICATIONS_PATH = 'notifications';  // Ścieżka do węzła powiadomień w Realtime Database

/**
 * Cache dla wyników zapytań, aby zminimalizować liczbę odwołań do bazy danych
 */
const notificationsCache = {
  unreadCount: {},
  notifications: {},
  lastFetched: {},
  // Czas ważności cache w milisekundach (10 minut - zwiększono dla optymalizacji)
  cacheExpiration: 10 * 60 * 1000,
  // Cache dla Realtime Database
  rtdbUnreadCount: {},
  rtdbNotifications: {},
  rtdbLastFetched: {}
};

/**
 * Singleton dla subskrypcji - zapobiega duplikatom subskrypcji
 */
const subscriptionManager = {
  // Aktywne subskrypcje per userId
  unreadCountSubscriptions: new Map(),
  userNotificationsSubscriptions: new Map(),
  // Ostatnia znana wartość (dla debouncing)
  lastUnreadCount: new Map(),
  // Timery debounce
  debounceTimers: new Map(),
  // Flaga czy strona jest widoczna
  isPageVisible: true
};

// Nasłuchuj na zmiany widoczności strony (Page Visibility API)
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    subscriptionManager.isPageVisible = !document.hidden;
    console.log(`[RTDB] Widoczność strony: ${subscriptionManager.isPageVisible ? 'widoczna' : 'ukryta'}`);
  });
}

/**
 * Limit powiadomień do pobrania z RTDB (optymalizacja)
 */
const RTDB_NOTIFICATIONS_LIMIT = 150;

/**
 * Tworzy nowe powiadomienie dla użytkownika
 * 
 * @param {Object} notification - Dane powiadomienia
 * @param {string} notification.userId - ID użytkownika, dla którego jest powiadomienie
 * @param {string} notification.title - Tytuł powiadomienia
 * @param {string} notification.message - Treść powiadomienia
 * @param {string} notification.type - Typ powiadomienia (np. 'info', 'warning', 'success', 'error')
 * @param {string} notification.entityType - Typ encji związanej z powiadomieniem (np. 'purchaseOrder', 'order', 'productionTask')
 * @param {string} notification.entityId - ID encji związanej z powiadomieniem
 * @returns {Promise<string>} - ID utworzonego powiadomienia
 */
export const createNotification = async (notification) => {
  try {
    const notificationData = {
      userId: notification.userId,
      title: notification.title,
      message: notification.message,
      type: notification.type || 'info',
      entityType: notification.entityType || null,
      entityId: notification.entityId || null,
      read: false,
      createdAt: serverTimestamp()
    };
    
    const docRef = await addDoc(collection(db, NOTIFICATIONS_COLLECTION), notificationData);
    
    // Aktualizuj cache - zwiększ licznik nieprzeczytanych
    const userId = notification.userId;
    const cacheKey = `unreadCount-${userId}`;
    if (notificationsCache.unreadCount[userId] !== undefined) {
      notificationsCache.unreadCount[userId] += 1;
      notificationsCache.lastFetched[cacheKey] = Date.now();
    }
    
    // Aktualizuj cache dla list powiadomień - dodaj nowe powiadomienie na początek listy
    Object.keys(notificationsCache.notifications).forEach(key => {
      if (key.startsWith(`notifications-${userId}`)) {
        // Sprawdź czy ta lista zawiera tylko nieprzeczytane
        const onlyUnread = key.includes('-true-');
        
        // Do aktualnego czasu dodajemy 1ms, aby nowe powiadomienie było na górze listy
        const now = new Date();
        
        const newNotification = {
          id: docRef.id,
          ...notificationData,
          createdAt: now.toISOString(),
          read: false
        };
        
        // Dodaj nowe powiadomienie tylko na pierwsze miejsce listy i usuń ostatni element jeśli przekroczony limit
        const notifications = notificationsCache.notifications[key];
        if (notifications) {
          const limitPart = key.split('-').pop();
          const limit = parseInt(limitPart, 10) || 20;
          
          const updatedNotifications = [newNotification, ...notifications];
          if (updatedNotifications.length > limit) {
            updatedNotifications.pop(); // Usuń ostatni element, aby zachować limit
          }
          
          notificationsCache.notifications[key] = updatedNotifications;
          notificationsCache.lastFetched[key] = Date.now();
        }
      }
    });
    
    return docRef.id;
  } catch (error) {
    console.error('Błąd podczas tworzenia powiadomienia:', error);
    throw error;
  }
};

/**
 * Pobiera powiadomienia dla konkretnego użytkownika z wykorzystaniem cache
 * 
 * @param {string} userId - ID użytkownika
 * @param {boolean} onlyUnread - Czy pobierać tylko nieprzeczytane powiadomienia
 * @param {number} limitCount - Limit liczby powiadomień do pobrania
 * @returns {Promise<Array>} - Lista powiadomień
 */
export const getUserNotifications = async (userId, onlyUnread = false, limitCount = 20) => {
  try {
    // Sprawdź czy dane są w cache i czy cache jest ważny
    const now = Date.now();
    const cacheKey = `notifications-${userId}-${onlyUnread}-${limitCount}`;
    const lastFetched = notificationsCache.lastFetched[cacheKey] || 0;
    
    // Jeśli cache jest ważny, zwróć wartość z cache
    if (
      now - lastFetched < notificationsCache.cacheExpiration && 
      notificationsCache.notifications[cacheKey]
    ) {
      console.log('Użyto cache dla listy powiadomień');
      return notificationsCache.notifications[cacheKey];
    }
    
    let q;
    
    if (onlyUnread) {
      q = query(
        collection(db, NOTIFICATIONS_COLLECTION),
        where('userId', '==', userId),
        where('read', '==', false),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );
    } else {
      q = query(
        collection(db, NOTIFICATIONS_COLLECTION),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );
    }
    
    const querySnapshot = await getDocs(q);
    const notifications = [];
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      notifications.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null
      });
    });
    
    // Zapisz dane w cache
    notificationsCache.notifications[cacheKey] = notifications;
    notificationsCache.lastFetched[cacheKey] = now;
    
    return notifications;
  } catch (error) {
    console.error('Błąd podczas pobierania powiadomień:', error);
    // W przypadku błędu, zwróć pusty array lub wartość z cache jeśli istnieje
    return notificationsCache.notifications[`notifications-${userId}-${onlyUnread}-${limitCount}`] || [];
  }
};

/**
 * Oznacza powiadomienie jako przeczytane
 * Aktualizuje również cache
 * 
 * @param {string} notificationId - ID powiadomienia
 * @returns {Promise<boolean>} - Czy operacja się powiodła
 */
export const markNotificationAsRead = async (notificationId) => {
  try {
    const notificationRef = doc(db, NOTIFICATIONS_COLLECTION, notificationId);
    const notificationSnapshot = await getDoc(notificationRef);
    
    if (!notificationSnapshot.exists()) {
      throw new Error('Powiadomienie nie istnieje');
    }
    
    const notificationData = notificationSnapshot.data();
    const userId = notificationData.userId;
    
    await updateDoc(notificationRef, {
      read: true,
      readAt: serverTimestamp()
    });
    
    // Aktualizuj cache - zmniejsz licznik nieprzeczytanych
    const cacheKey = `unreadCount-${userId}`;
    if (notificationsCache.unreadCount[userId] !== undefined) {
      notificationsCache.unreadCount[userId] = Math.max(0, notificationsCache.unreadCount[userId] - 1);
      notificationsCache.lastFetched[cacheKey] = Date.now();
    }
    
    // Aktualizuj cache - zaktualizuj powiadomienie w listach
    Object.keys(notificationsCache.notifications).forEach(key => {
      if (key.startsWith(`notifications-${userId}`)) {
        const notifications = notificationsCache.notifications[key];
        if (notifications) {
          notificationsCache.notifications[key] = notifications.map(n => 
            n.id === notificationId ? { ...n, read: true } : n
          );
          notificationsCache.lastFetched[key] = Date.now();
        }
      }
    });
    
    return true;
  } catch (error) {
    console.error('Błąd podczas oznaczania powiadomienia jako przeczytane:', error);
    throw error;
  }
};

/**
 * Oznacza wszystkie powiadomienia użytkownika jako przeczytane
 * Aktualizuje również cache
 * 
 * @param {string} userId - ID użytkownika
 * @returns {Promise<number>} - Liczba zaktualizowanych powiadomień
 */
export const markAllNotificationsAsRead = async (userId) => {
  try {
    const q = query(
      collection(db, NOTIFICATIONS_COLLECTION),
      where('userId', '==', userId),
      where('read', '==', false)
    );
    
    const querySnapshot = await getDocs(q);
    const updatePromises = [];
    
    querySnapshot.forEach((docSnapshot) => {
      const notificationRef = doc(db, NOTIFICATIONS_COLLECTION, docSnapshot.id);
      updatePromises.push(
        updateDoc(notificationRef, {
          read: true,
          readAt: serverTimestamp()
        })
      );
    });
    
    await Promise.all(updatePromises);
    
    // Aktualizuj cache - ustaw licznik nieprzeczytanych na 0
    const cacheKey = `unreadCount-${userId}`;
    notificationsCache.unreadCount[userId] = 0;
    notificationsCache.lastFetched[cacheKey] = Date.now();
    
    // Aktualizuj cache - oznacz wszystkie powiadomienia jako przeczytane
    Object.keys(notificationsCache.notifications).forEach(key => {
      if (key.startsWith(`notifications-${userId}`)) {
        const notifications = notificationsCache.notifications[key];
        if (notifications) {
          notificationsCache.notifications[key] = notifications.map(n => ({ ...n, read: true }));
          notificationsCache.lastFetched[key] = Date.now();
        }
      }
    });
    
    return updatePromises.length;
  } catch (error) {
    console.error('Błąd podczas oznaczania wszystkich powiadomień jako przeczytane:', error);
    throw error;
  }
};

/**
 * Usuwa powiadomienie
 * 
 * @param {string} notificationId - ID powiadomienia
 * @returns {Promise<boolean>} - Czy operacja się powiodła
 */
export const deleteNotification = async (notificationId) => {
  try {
    await deleteDoc(doc(db, NOTIFICATIONS_COLLECTION, notificationId));
    return true;
  } catch (error) {
    console.error('Błąd podczas usuwania powiadomienia:', error);
    throw error;
  }
};

/**
 * Tworzy powiadomienie o zmianie statusu encji
 * 
 * @param {string} userId - ID użytkownika
 * @param {string} entityType - Typ encji (np. 'purchaseOrder', 'order', 'productionTask')
 * @param {string} entityId - ID encji
 * @param {string} entityNumber - Numer encji (np. numer zamówienia)
 * @param {string} oldStatus - Stary status
 * @param {string} newStatus - Nowy status
 * @returns {Promise<string>} - ID utworzonego powiadomienia
 */
export const createStatusChangeNotification = async (userId, entityType, entityId, entityNumber, oldStatus, newStatus) => {
  const entityNames = {
    purchaseOrder: 'Zamówienie zakupowe',
    order: 'Zamówienie klienta',
    productionTask: 'Zadanie produkcyjne',
    invoice: 'Faktura',
    waybill: 'List przewozowy',
    cmr: 'Dokument CMR'
  };
  
  const entityName = entityNames[entityType] || 'Element';
  
  return await createNotification({
    userId,
    title: `Zmiana statusu - ${entityName}`,
    message: `${entityName} ${entityNumber} zmieniło status z "${oldStatus}" na "${newStatus}"`,
    type: 'info',
    entityType,
    entityId
  });
};

/**
 * Pobiera liczbę nieprzeczytanych powiadomień dla użytkownika
 * Wykorzystuje cache i ogranicza częstotliwość zapytań do bazy danych
 * 
 * @param {string} userId - ID użytkownika
 * @returns {Promise<number>} - Liczba nieprzeczytanych powiadomień
 */
export const getUnreadNotificationsCount = async (userId) => {
  try {
    // Sprawdź czy dane są w cache i czy cache jest ważny
    const now = Date.now();
    const cacheKey = `unreadCount-${userId}`;
    const lastFetched = notificationsCache.lastFetched[cacheKey] || 0;
    
    // Jeśli cache jest ważny, zwróć wartość z cache
    if (
      now - lastFetched < notificationsCache.cacheExpiration && 
      notificationsCache.unreadCount[userId] !== undefined
    ) {
      console.log('Użyto cache dla liczby nieprzeczytanych powiadomień');
      return notificationsCache.unreadCount[userId];
    }
    
    // W przeciwnym razie pobierz dane z bazy
    const q = query(
      collection(db, NOTIFICATIONS_COLLECTION),
      where('userId', '==', userId),
      where('read', '==', false)
    );
    
    // ✅ OPTYMALIZACJA: Użyj getCountFromServer zamiast getDocs dla lepszej wydajności
    const countSnapshot = await getCountFromServer(q);
    const count = countSnapshot.data().count;
    
    // Zapisz dane w cache
    notificationsCache.unreadCount[userId] = count;
    notificationsCache.lastFetched[cacheKey] = now;
    
    return count;
  } catch (error) {
    console.error('Błąd podczas pobierania liczby nieprzeczytanych powiadomień:', error);
    // W przypadku błędu, zwróć 0 lub wartość z cache jeśli istnieje
    return notificationsCache.unreadCount[userId] || 0;
  }
};

/**
 * Tworzy nowe powiadomienie w Realtime Database
 * To powiadomienie będzie automatycznie widoczne dla wszystkich zainteresowanych użytkowników
 * 
 * @param {Object} notification - Dane powiadomienia
 * @param {string[]} notification.userIds - Tablica ID użytkowników, dla których jest powiadomienie
 * @param {string} notification.title - Tytuł powiadomienia
 * @param {string} notification.message - Treść powiadomienia
 * @param {string} notification.type - Typ powiadomienia (np. 'info', 'warning', 'success', 'error')
 * @param {string} notification.entityType - Typ encji związanej z powiadomieniem (np. 'purchaseOrder', 'order', 'productionTask')
 * @param {string} notification.entityId - ID encji związanej z powiadomieniem
 * @returns {Promise<string>} - ID utworzonego powiadomienia
 */
export const createRealtimeNotification = async (notification) => {
  try {
    const notificationRef = ref(rtdb, REALTIME_NOTIFICATIONS_PATH);
    const newNotificationRef = push(notificationRef);
    
    const now = new Date().toISOString();
    const notificationData = {
      userIds: notification.userIds,
      title: notification.title,
      message: notification.message,
      type: notification.type || 'info',
      entityType: notification.entityType || null,
      entityId: notification.entityId || null,
      read: {},  // Obiekt zawierający stan odczytu dla każdego użytkownika: {userId: boolean}
      createdAt: now,
      createdBy: notification.createdBy || null,
      createdByName: notification.createdByName || null
    };
    
    // Inicjalizuj stan odczytu dla każdego użytkownika jako false (nieprzeczytane)
    notification.userIds.forEach(userId => {
      notificationData.read[userId] = false;
    });
    
    await set(newNotificationRef, notificationData);
    return newNotificationRef.key;
  } catch (error) {
    console.error('Błąd podczas tworzenia powiadomienia w czasie rzeczywistym:', error);
    throw error;
  }
};

/**
 * Tworzy powiadomienie o zmianie statusu encji w Realtime Database
 * 
 * @param {string[]} userIds - Tablica ID użytkowników
 * @param {string} entityType - Typ encji (np. 'purchaseOrder', 'order', 'productionTask')
 * @param {string} entityId - ID encji
 * @param {string} entityNumber - Numer encji (np. numer zamówienia)
 * @param {string} oldStatus - Stary status
 * @param {string} newStatus - Nowy status
 * @param {string} createdBy - ID użytkownika, który zmienił status
 * @returns {Promise<string>} - ID utworzonego powiadomienia
 */
export const createRealtimeStatusChangeNotification = async (userIds, entityType, entityId, entityNumber, oldStatus, newStatus, createdBy = null) => {
  const entityNames = {
    purchaseOrder: 'Zamówienie zakupowe',
    order: 'Zamówienie klienta',
    productionTask: 'Zadanie produkcyjne',
    invoice: 'Faktura',
    waybill: 'List przewozowy',
    cmr: 'Dokument CMR'
  };
  
  const entityName = entityNames[entityType] || 'Element';
  
  // Pobierz dane użytkownika, który utworzył powiadomienie
  let createdByName = null;
  if (createdBy) {
    try {
      const userData = await getUserById(createdBy);
      if (userData) {
        createdByName = userData.displayName || userData.email || createdBy;
      }
    } catch (error) {
      console.warn('Nie udało się pobrać nazwy użytkownika:', error);
    }
  }
  
  return await createRealtimeNotification({
    userIds,
    title: `Zmiana statusu - ${entityName}`,
    message: `${entityName} ${entityNumber} zmieniło status z "${oldStatus}" na "${newStatus}"`,
    type: 'info',
    entityType,
    entityId,
    createdBy,
    createdByName
  });
};

/**
 * Tworzy powiadomienie o przyjęciu towaru na magazyn w Realtime Database
 * 
 * @param {string[]} userIds - Tablica ID użytkowników do powiadomienia
 * @param {string} itemId - ID pozycji magazynowej
 * @param {string} itemName - Nazwa produktu
 * @param {number} quantity - Ilość przyjęta na magazyn
 * @param {string} warehouseId - ID magazynu, na który przyjęto towar
 * @param {string} warehouseName - Nazwa magazynu
 * @param {string} lotNumber - Numer partii
 * @param {string} source - Źródło przyjęcia (np. 'purchase', 'production')
 * @param {string} sourceId - ID dokumentu źródłowego
 * @param {string} createdBy - ID użytkownika, który przyjął towar
 * @returns {Promise<string>} - ID utworzonego powiadomienia
 */
export const createRealtimeInventoryReceiveNotification = async (
  userIds, 
  itemId, 
  itemName, 
  quantity, 
  warehouseId, 
  warehouseName, 
  lotNumber, 
  source, 
  sourceId, 
  createdBy = null
) => {
  // Słownik źródeł przyjęcia
  const sourcesNames = {
    purchase: 'zamówienia zakupowego',
    production: 'produkcji',
    return: 'zwrotu',
    other: 'innego źródła'
  };
  
  const sourceName = sourcesNames[source] || 'innego źródła';
  
  // Pobierz dane użytkownika, który utworzył powiadomienie
  let createdByName = null;
  if (createdBy) {
    try {
      const userData = await getUserById(createdBy);
      if (userData) {
        createdByName = userData.displayName || userData.email || createdBy;
      }
    } catch (error) {
      console.warn('Nie udało się pobrać nazwy użytkownika:', error);
    }
  }
  
  return await createRealtimeNotification({
    userIds,
    title: `Przyjęcie na magazyn - ${itemName}`,
    message: `Przyjęto ${quantity} szt. produktu "${itemName}" na magazyn "${warehouseName}" (partia: ${lotNumber}) z ${sourceName}`,
    type: 'info',
    entityType: 'inventory',
    entityId: itemId,
    createdBy,
    createdByName
  });
};

/**
 * Tworzy powiadomienie o zmianie lokalizacji partii w Realtime Database
 * 
 * @param {string[]} userIds - Tablica ID użytkowników do powiadomienia
 * @param {string} batchId - ID partii
 * @param {string} lotNumber - Numer partii
 * @param {string} itemId - ID pozycji magazynowej
 * @param {string} itemName - Nazwa produktu
 * @param {string} sourceWarehouseId - ID magazynu źródłowego
 * @param {string} sourceWarehouseName - Nazwa magazynu źródłowego
 * @param {string} targetWarehouseId - ID magazynu docelowego
 * @param {string} targetWarehouseName - Nazwa magazynu docelowego
 * @param {number} quantity - Ilość przeniesiona
 * @param {string} createdBy - ID użytkownika, który zmienił lokalizację
 * @returns {Promise<string>} - ID utworzonego powiadomienia
 */
export const createRealtimeBatchLocationChangeNotification = async (
  userIds,
  batchId,
  lotNumber,
  itemId,
  itemName,
  sourceWarehouseId,
  sourceWarehouseName,
  targetWarehouseId,
  targetWarehouseName,
  quantity,
  createdBy = null
) => {
  // Pobierz dane użytkownika, który utworzył powiadomienie
  let createdByName = null;
  if (createdBy) {
    try {
      const userData = await getUserById(createdBy);
      if (userData) {
        createdByName = userData.displayName || userData.email || createdBy;
      }
    } catch (error) {
      console.warn('Nie udało się pobrać nazwy użytkownika:', error);
    }
  }
  
  return await createRealtimeNotification({
    userIds,
    title: `Zmiana lokalizacji partii - ${itemName}`,
    message: `Przeniesiono ${quantity} szt. produktu "${itemName}" (partia: ${lotNumber}) z magazynu "${sourceWarehouseName}" do magazynu "${targetWarehouseName}"`,
    type: 'info',
    entityType: 'inventory',
    entityId: itemId,
    createdBy,
    createdByName
  });
};

/**
 * Oznacza powiadomienie w Realtime Database jako przeczytane dla konkretnego użytkownika
 * 
 * @param {string} notificationId - ID powiadomienia
 * @param {string} userId - ID użytkownika
 * @returns {Promise<boolean>} - Czy operacja się powiodła
 */
export const markRealtimeNotificationAsRead = async (notificationId, userId) => {
  try {
    const notificationRef = ref(rtdb, `${REALTIME_NOTIFICATIONS_PATH}/${notificationId}/read/${userId}`);
    await set(notificationRef, true);
    
    // Invaliduj cache - usuń dane z cache aby wymusić ponowne pobranie
    delete notificationsCache.rtdbUnreadCount[userId];
    delete notificationsCache.rtdbLastFetched[`rtdb-unreadCount-${userId}`];
    
    // Invaliduj cache dla wszystkich wariantów listy powiadomień tego użytkownika
    Object.keys(notificationsCache.rtdbNotifications).forEach(key => {
      if (key.startsWith(`rtdb-notifications-${userId}`)) {
        delete notificationsCache.rtdbNotifications[key];
        delete notificationsCache.rtdbLastFetched[key];
      }
    });
    
    return true;
  } catch (error) {
    console.error('Błąd podczas oznaczania powiadomienia jako przeczytane:', error);
    throw error;
  }
};

/**
 * Oznacza wszystkie powiadomienia użytkownika w Realtime Database jako przeczytane
 * 
 * @param {string} userId - ID użytkownika
 * @returns {Promise<boolean>} - Czy operacja się powiodła
 */
export const markAllRealtimeNotificationsAsRead = async (userId) => {
  try {
    // console.log(`[RTDB] Oznaczanie wszystkich powiadomień jako przeczytane dla użytkownika ${userId}`);
    // Pobierz wszystkie powiadomienia dla użytkownika
    const userNotificationsRef = ref(rtdb, REALTIME_NOTIFICATIONS_PATH);
    const snapshot = await get(userNotificationsRef);
    
    if (!snapshot.exists()) {
      // console.log(`[RTDB] Brak powiadomień do oznaczenia jako przeczytane`);
      return true;
    }
    
    const updates = {};
    let foundUnreadCount = 0;
    
    // Stwórz obiekt z aktualizacjami dla wszystkich nieprzeczytanych powiadomień użytkownika
    snapshot.forEach((childSnapshot) => {
      const notification = childSnapshot.val();
      
      // Sprawdź czy powiadomienie jest dla tego użytkownika 
      if (notification.userIds?.includes(userId)) {
        // Zawsze oznacz jako przeczytane, nawet jeśli już było przeczytane lub brak informacji o stanie
        updates[`${REALTIME_NOTIFICATIONS_PATH}/${childSnapshot.key}/read/${userId}`] = true;
        
        // Liczymy znalezione powiadomienia do oznaczenia (dla logów)
        if (!notification.read || notification.read[userId] === false) {
          foundUnreadCount++;
        }
      }
    });
    
    // console.log(`[RTDB] Znaleziono ${foundUnreadCount} nieprzeczytanych powiadomień do aktualizacji`);
    
    // Zastosuj wszystkie zmiany w jednej operacji
    if (Object.keys(updates).length > 0) {
      // console.log(`[RTDB] Aktualizacja ${Object.keys(updates).length} powiadomień`);
      await update(ref(rtdb), updates);
      // console.log(`[RTDB] Powiadomienia zaktualizowane pomyślnie`);
    } else {
      // console.log(`[RTDB] Brak powiadomień do aktualizacji`);
    }
    
    // Sprawdź aktualną liczbę nieprzeczytanych powiadomień po aktualizacji
    const checkSnapshot = await get(userNotificationsRef);
    let remainingUnread = 0;
    
    if (checkSnapshot.exists()) {
      checkSnapshot.forEach((childSnapshot) => {
        const notification = childSnapshot.val();
        if (notification.userIds?.includes(userId) && 
            (!notification.read || notification.read[userId] === false)) {
          remainingUnread++;
        }
      });
    }
    
    // console.log(`[RTDB] Po aktualizacji pozostało ${remainingUnread} nieprzeczytanych powiadomień`);
    
    // Invaliduj cache - usuń dane z cache aby wymusić ponowne pobranie
    delete notificationsCache.rtdbUnreadCount[userId];
    delete notificationsCache.rtdbLastFetched[`rtdb-unreadCount-${userId}`];
    
    // Invaliduj cache dla wszystkich wariantów listy powiadomień tego użytkownika
    Object.keys(notificationsCache.rtdbNotifications).forEach(key => {
      if (key.startsWith(`rtdb-notifications-${userId}`)) {
        delete notificationsCache.rtdbNotifications[key];
        delete notificationsCache.rtdbLastFetched[key];
      }
    });
    
    return true;
  } catch (error) {
    console.error('Błąd podczas oznaczania wszystkich powiadomień jako przeczytane:', error);
    throw error;
  }
};

/**
 * Ustanawia nasłuchiwanie nowych powiadomień dla użytkownika w Realtime Database
 * 
 * OPTYMALIZACJE:
 * - limitToLast() - pobiera tylko ostatnie N powiadomień zamiast wszystkich
 * - Tracking przetworzonych ID - unika duplikatów callbacków
 * 
 * @param {string} userId - ID użytkownika
 * @param {Function} callback - Funkcja wywołana przy nowym powiadomieniu
 * @returns {Function} - Funkcja do anulowania nasłuchiwania
 */
export const subscribeToUserNotifications = (userId, callback) => {
  console.log(`[RTDB] Tworzenie subskrypcji userNotifications dla użytkownika ${userId}`);
  
  const notificationsRef = ref(rtdb, REALTIME_NOTIFICATIONS_PATH);
  // OPTYMALIZACJA: Pobierz tylko ostatnie N powiadomień (bez orderByChild - nie wymaga indeksu)
  const limitedQuery = rtdbQuery(notificationsRef, limitToLast(RTDB_NOTIFICATIONS_LIMIT));
  
  // Set do śledzenia już przetworzonych powiadomień (unika duplikatów)
  const processedIds = new Set();
  
  const unsubscribe = onChildAdded(limitedQuery, (snapshot) => {
    try {
      const notificationId = snapshot.key;
      
      // OPTYMALIZACJA: Pomijaj już przetworzone powiadomienia
      if (processedIds.has(notificationId)) {
        return;
      }
      processedIds.add(notificationId);
      
      // OPTYMALIZACJA: Ogranicz rozmiar setu (pamięć)
      if (processedIds.size > RTDB_NOTIFICATIONS_LIMIT * 2) {
        const idsArray = Array.from(processedIds);
        processedIds.clear();
        idsArray.slice(-RTDB_NOTIFICATIONS_LIMIT).forEach(id => processedIds.add(id));
      }
      
      const notification = snapshot.val();
      
      // Sprawdź czy powiadomienie jest dla tego użytkownika
      if (notification && notification.userIds && notification.userIds.includes(userId)) {
        const notificationWithId = {
          id: notificationId,
          ...notification,
          read: notification.read?.[userId] || false,
          createdByName: notification.createdByName || 'System'
        };
        
        callback(notificationWithId);
      }
    } catch (error) {
      console.error(`[RTDB] Błąd podczas przetwarzania nowego powiadomienia:`, error);
    }
  }, (error) => {
    console.error(`[RTDB] Błąd w nasłuchiwaniu nowych powiadomień:`, error);
  });
  
  return () => {
    console.log(`[RTDB] Usuwanie subskrypcji userNotifications dla ${userId}`);
    unsubscribe();
  };
};

/**
 * Pobiera powiadomienia dla użytkownika z Realtime Database z wykorzystaniem cache
 * 
 * OPTYMALIZACJE:
 * - limitToLast() - pobiera tylko ostatnie N powiadomień z bazy (zamiast wszystkich)
 * - Zwiększony czas cache (10 minut)
 * 
 * @param {string} userId - ID użytkownika
 * @param {boolean} onlyUnread - Czy pobierać tylko nieprzeczytane powiadomienia
 * @param {number} limitCount - Limit liczby powiadomień do pobrania
 * @returns {Promise<Array>} - Lista powiadomień
 */
export const getRealtimeUserNotifications = async (userId, onlyUnread = false, limitCount = 20) => {
  try {
    // Sprawdź czy dane są w cache i czy cache jest ważny
    const now = Date.now();
    const cacheKey = `rtdb-notifications-${userId}-${onlyUnread}-${limitCount}`;
    const lastFetched = notificationsCache.rtdbLastFetched[cacheKey] || 0;
    
    // Jeśli cache jest ważny, zwróć wartość z cache
    if (
      now - lastFetched < notificationsCache.cacheExpiration && 
      notificationsCache.rtdbNotifications[cacheKey]
    ) {
      console.log('[RTDB Cache] Użyto cache dla listy powiadomień');
      return notificationsCache.rtdbNotifications[cacheKey];
    }
    
    const notificationsRef = ref(rtdb, REALTIME_NOTIFICATIONS_PATH);
    
    // OPTYMALIZACJA: Pobierz tylko ostatnie N powiadomień (bez orderByChild - nie wymaga indeksu)
    // Pobieramy więcej niż potrzeba, bo musimy filtrować po userId po stronie klienta
    const queryLimit = Math.min(RTDB_NOTIFICATIONS_LIMIT, Math.max(limitCount * 5, 100));
    const limitedQuery = rtdbQuery(notificationsRef, limitToLast(queryLimit));
    
    try {
      const snapshot = await get(limitedQuery);
      
      if (!snapshot.exists()) {
        notificationsCache.rtdbNotifications[cacheKey] = [];
        notificationsCache.rtdbLastFetched[cacheKey] = now;
        return [];
      }
      
      const notifications = [];
      
      snapshot.forEach((childSnapshot) => {
        try {
          const notification = childSnapshot.val();
          
          // Sprawdź czy powiadomienie jest dla tego użytkownika
          if (notification && notification.userIds && notification.userIds.includes(userId)) {
            const isRead = notification.read?.[userId] || false;
            
            // Jeśli chcemy tylko nieprzeczytane i to jest przeczytane, pomijamy
            if (onlyUnread && isRead) {
              return;
            }
            
            // Dodaj powiadomienie do listy
            notifications.push({
              id: childSnapshot.key,
              ...notification,
              read: isRead
            });
          }
        } catch (itemError) {
          console.warn(`[RTDB] Błąd podczas przetwarzania powiadomienia ${childSnapshot.key}:`, itemError);
        }
      });
      
      // Sortuj po dacie utworzenia (od najnowszych)
      notifications.sort((a, b) => {
        try {
          return new Date(b.createdAt) - new Date(a.createdAt);
        } catch (sortError) {
          return 0;
        }
      });
      
      // Zastosuj limit
      const limitedNotifications = notifications.slice(0, limitCount);
      console.log(`[RTDB] Pobrano ${limitedNotifications.length} powiadomień (query limit: ${queryLimit})`);
      
      // Zapisz dane w cache
      notificationsCache.rtdbNotifications[cacheKey] = limitedNotifications;
      notificationsCache.rtdbLastFetched[cacheKey] = now;
      
      return limitedNotifications;
    } catch (networkError) {
      console.warn('[RTDB] Błąd sieci podczas pobierania powiadomień:', networkError);
      return notificationsCache.rtdbNotifications[cacheKey] || [];
    }
  } catch (error) {
    console.error('[RTDB] Błąd podczas pobierania powiadomień z Realtime Database:', error);
    const cacheKey = `rtdb-notifications-${userId}-${onlyUnread}-${limitCount}`;
    return notificationsCache.rtdbNotifications[cacheKey] || [];
  }
};

/**
 * Pobiera liczbę nieprzeczytanych powiadomień dla użytkownika z Realtime Database z wykorzystaniem cache
 * 
 * OPTYMALIZACJE:
 * - limitToLast() - pobiera tylko ostatnie N powiadomień zamiast wszystkich
 * - Zwiększony czas cache (10 minut)
 * 
 * @param {string} userId - ID użytkownika
 * @returns {Promise<number>} - Liczba nieprzeczytanych powiadomień
 */
export const getUnreadRealtimeNotificationsCount = async (userId) => {
  try {
    // Sprawdź czy dane są w cache i czy cache jest ważny
    const now = Date.now();
    const cacheKey = `rtdb-unreadCount-${userId}`;
    const lastFetched = notificationsCache.rtdbLastFetched[cacheKey] || 0;
    
    // Jeśli cache jest ważny, zwróć wartość z cache
    if (
      now - lastFetched < notificationsCache.cacheExpiration && 
      notificationsCache.rtdbUnreadCount[userId] !== undefined
    ) {
      console.log('[RTDB Cache] Użyto cache dla liczby nieprzeczytanych powiadomień');
      return notificationsCache.rtdbUnreadCount[userId];
    }
    
    const notificationsRef = ref(rtdb, REALTIME_NOTIFICATIONS_PATH);
    
    // OPTYMALIZACJA: Pobierz tylko ostatnie N powiadomień (bez orderByChild - nie wymaga indeksu)
    const limitedQuery = rtdbQuery(notificationsRef, limitToLast(RTDB_NOTIFICATIONS_LIMIT));
    
    try {
      const snapshot = await get(limitedQuery);
      
      if (!snapshot.exists()) {
        notificationsCache.rtdbUnreadCount[userId] = 0;
        notificationsCache.rtdbLastFetched[cacheKey] = now;
        return 0;
      }
      
      let count = 0;
      
      snapshot.forEach((childSnapshot) => {
        const notification = childSnapshot.val();
        
        // Sprawdź czy powiadomienie jest dla tego użytkownika
        if (notification.userIds?.includes(userId)) {
          const isRead = notification.read && notification.read[userId] === true;
          
          if (!isRead) {
            count++;
          }
        }
      });
      
      console.log(`[RTDB] Liczba nieprzeczytanych dla ${userId}: ${count} (limit: ${RTDB_NOTIFICATIONS_LIMIT})`);
      
      // Zapisz w cache
      notificationsCache.rtdbUnreadCount[userId] = count;
      notificationsCache.rtdbLastFetched[cacheKey] = now;
      
      return count;
    } catch (networkError) {
      console.warn('[RTDB] Błąd sieci podczas pobierania nieprzeczytanych powiadomień:', networkError.message);
      return notificationsCache.rtdbUnreadCount[userId] || 0;
    }
  } catch (error) {
    console.error('[RTDB] Błąd podczas pobierania liczby nieprzeczytanych powiadomień z Realtime Database:', error);
    return notificationsCache.rtdbUnreadCount[userId] || 0;
  }
};

/**
 * Ustanawia nasłuchiwanie liczby nieprzeczytanych powiadomień dla użytkownika
 * 
 * OPTYMALIZACJE:
 * - limitToLast() - pobiera tylko ostatnie N powiadomień
 * - Debouncing (2s) - ogranicza częstotliwość aktualizacji
 * - Page Visibility API - nie aktualizuje gdy strona jest ukryta
 * - Singleton pattern - zapobiega duplikatom subskrypcji
 * 
 * @param {string} userId - ID użytkownika
 * @param {Function} callback - Funkcja wywołana przy zmianie liczby nieprzeczytanych
 * @returns {Function} - Funkcja do anulowania nasłuchiwania
 */
export const subscribeToUnreadCount = (userId, callback) => {
  // Singleton - jeśli subskrypcja już istnieje dla tego użytkownika, użyj istniejącej
  if (subscriptionManager.unreadCountSubscriptions.has(userId)) {
    console.log(`[RTDB] Subskrypcja unreadCount już istnieje dla użytkownika ${userId}, używam istniejącej`);
    // Zwróć ostatnią znaną wartość z cache
    const lastCount = subscriptionManager.lastUnreadCount.get(userId) || 0;
    callback(lastCount);
    // Zwróć pustą funkcję unsubscribe - prawdziwa subskrypcja pozostaje aktywna
    return () => {
      console.log(`[RTDB] Ignoruję unsubscribe - singleton aktywny dla ${userId}`);
    };
  }

  console.log(`[RTDB] Tworzenie nowej subskrypcji unreadCount dla użytkownika ${userId}`);
  
  const notificationsRef = ref(rtdb, REALTIME_NOTIFICATIONS_PATH);
  // OPTYMALIZACJA: Pobierz tylko ostatnie N powiadomień (bez orderByChild - nie wymaga indeksu)
  const limitedQuery = rtdbQuery(notificationsRef, limitToLast(RTDB_NOTIFICATIONS_LIMIT));
  
  // Debounce time w milisekundach
  const DEBOUNCE_TIME = 2000;
  
  const unsubscribe = onValue(limitedQuery, (snapshot) => {
    try {
      // OPTYMALIZACJA: Nie aktualizuj gdy strona jest ukryta
      if (!subscriptionManager.isPageVisible) {
        console.log(`[RTDB] Strona ukryta - pomijam aktualizację unreadCount`);
        return;
      }
      
      if (!snapshot.exists()) {
        subscriptionManager.lastUnreadCount.set(userId, 0);
        callback(0);
        return;
      }
      
      let count = 0;
      
      snapshot.forEach((childSnapshot) => {
        try {
          const notification = childSnapshot.val();
          
          // Sprawdź czy powiadomienie jest dla tego użytkownika
          if (notification && notification.userIds && notification.userIds.includes(userId)) {
            // Warunek nieprzeczytania
            const isRead = notification.read && notification.read[userId] === true;
            
            if (!isRead) {
              count++;
            }
          }
        } catch (itemError) {
          // Kontynuuj przetwarzanie pozostałych powiadomień
        }
      });
      
      // OPTYMALIZACJA: Debouncing - nie aktualizuj jeśli wartość się nie zmieniła
      const lastCount = subscriptionManager.lastUnreadCount.get(userId);
      if (lastCount === count) {
        return; // Bez zmian, pomiń callback
      }
      
      // OPTYMALIZACJA: Debounce - opóźnij callback o 2 sekundy
      // Anuluj poprzedni timer jeśli istnieje
      const existingTimer = subscriptionManager.debounceTimers.get(`unread-${userId}`);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }
      
      const timer = setTimeout(() => {
        subscriptionManager.lastUnreadCount.set(userId, count);
        console.log(`[RTDB] Aktualizacja unreadCount dla ${userId}: ${count} (limit: ${RTDB_NOTIFICATIONS_LIMIT})`);
        callback(count);
        subscriptionManager.debounceTimers.delete(`unread-${userId}`);
      }, DEBOUNCE_TIME);
      
      subscriptionManager.debounceTimers.set(`unread-${userId}`, timer);
      
    } catch (error) {
      console.error(`[RTDB] [Subskrypcja] Błąd podczas przetwarzania aktualizacji powiadomień:`, error);
    }
  }, (error) => {
    console.error(`[RTDB] [Subskrypcja] Błąd w nasłuchiwaniu powiadomień:`, error);
  });
  
  // Zapisz subskrypcję w managerze
  subscriptionManager.unreadCountSubscriptions.set(userId, unsubscribe);
  
  // Zwróć funkcję cleanup
  return () => {
    console.log(`[RTDB] Usuwanie subskrypcji unreadCount dla ${userId}`);
    // Anuluj timer debounce
    const timer = subscriptionManager.debounceTimers.get(`unread-${userId}`);
    if (timer) {
      clearTimeout(timer);
      subscriptionManager.debounceTimers.delete(`unread-${userId}`);
    }
    // Usuń subskrypcję z managera
    subscriptionManager.unreadCountSubscriptions.delete(userId);
    subscriptionManager.lastUnreadCount.delete(userId);
    // Anuluj subskrypcję Firebase
    unsubscribe();
  };
};

/**
 * Tworzy powiadomienie o zaznaczeniu checkboxa w planie mieszań kiosku
 * 
 * @param {string[]} userIds - Tablica ID użytkowników
 * @param {string} checkboxText - Treść checkboxa
 * @param {string} mixingNumber - Numer mieszania
 * @param {string} moNumber - Numer MO (zadania produkcyjnego)
 * @param {string} taskId - ID zadania produkcyjnego (dla przekierowania)
 * @param {string} createdBy - ID użytkownika, który zaznaczył checkbox
 * @returns {Promise<string>} - ID utworzonego powiadomienia
 */
export const createRealtimeCheckboxNotification = async (userIds, checkboxText, mixingNumber, moNumber, taskId, createdBy = null) => {
  try {
    let createdByName = 'System';
    
    // Pobierz nazwę użytkownika, który zaznaczył checkbox
    if (createdBy) {
      try {
        const user = await getUserById(createdBy);
        createdByName = user?.displayName || user?.email || user?.uid || 'Nieznany użytkownik';
      } catch (error) {
        console.warn('Nie udało się pobrać danych użytkownika:', error);
      }
    }
    
    const notification = {
      userIds: userIds,
      title: 'Plan mieszań - Krok ukończony',
      message: `Zaznaczono ${checkboxText}, mieszanie ${mixingNumber} w zadaniu produkcyjnym ${moNumber}`,
      type: 'success',
      entityType: 'productionTask',
      entityId: taskId,
      createdBy: createdBy,
      createdByName: createdByName
    };
    
    return await createRealtimeNotification(notification);
  } catch (error) {
    console.error('Błąd podczas tworzenia powiadomienia o zaznaczeniu checkboxa:', error);
    throw error;
  }
};

/**
 * Czyści cache powiadomień dla konkretnego użytkownika (zarówno Firestore jak i Realtime Database)
 * Przydatne gdy chcemy wymusić świeże pobranie danych
 * 
 * @param {string} userId - ID użytkownika, dla którego wyczyścić cache
 */
export const clearNotificationsCache = (userId) => {
  // Wyczyść cache Firestore
  delete notificationsCache.unreadCount[userId];
  
  Object.keys(notificationsCache.notifications).forEach(key => {
    if (key.startsWith(`notifications-${userId}`)) {
      delete notificationsCache.notifications[key];
    }
  });
  
  Object.keys(notificationsCache.lastFetched).forEach(key => {
    if (key.startsWith(`notifications-${userId}`) || key === `unreadCount-${userId}`) {
      delete notificationsCache.lastFetched[key];
    }
  });
  
  // Wyczyść cache Realtime Database
  delete notificationsCache.rtdbUnreadCount[userId];
  
  Object.keys(notificationsCache.rtdbNotifications).forEach(key => {
    if (key.startsWith(`rtdb-notifications-${userId}`)) {
      delete notificationsCache.rtdbNotifications[key];
    }
  });
  
  Object.keys(notificationsCache.rtdbLastFetched).forEach(key => {
    if (key.startsWith(`rtdb-notifications-${userId}`) || key === `rtdb-unreadCount-${userId}`) {
      delete notificationsCache.rtdbLastFetched[key];
    }
  });
  
  console.log(`[Cache] Wyczyszczono cache powiadomień dla użytkownika ${userId}`);
};

/**
 * Czyści cały cache powiadomień dla wszystkich użytkowników
 */
export const clearAllNotificationsCache = () => {
  notificationsCache.unreadCount = {};
  notificationsCache.notifications = {};
  notificationsCache.lastFetched = {};
  notificationsCache.rtdbUnreadCount = {};
  notificationsCache.rtdbNotifications = {};
  notificationsCache.rtdbLastFetched = {};
  
  console.log('[Cache] Wyczyszczono cały cache powiadomień');
}; 