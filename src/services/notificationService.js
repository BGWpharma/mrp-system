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
  serverTimestamp 
} from 'firebase/firestore';
import { db } from './firebase/config';

// Stałe dla kolekcji w Firebase
const NOTIFICATIONS_COLLECTION = 'notifications';

/**
 * Cache dla wyników zapytań, aby zminimalizować liczbę odwołań do bazy danych
 */
const notificationsCache = {
  unreadCount: {},
  notifications: {},
  lastFetched: {},
  // Czas ważności cache w milisekundach (5 minut)
  cacheExpiration: 5 * 60 * 1000
};

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
    
    const querySnapshot = await getDocs(q);
    const count = querySnapshot.size;
    
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