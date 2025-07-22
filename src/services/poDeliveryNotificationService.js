/**
 * Serwis powiadomień o dostawach zamówień zakupowych (PO)
 * 
 * Funkcjonalności:
 * - Powiadomienia o dostawach PO z aktywnymi rezerwacjami
 * - Aktualizacja statusu rezerwacji po dostawie
 * - Integracja z systemem powiadomień
 */

import { 
  collection, 
  query, 
  where, 
  getDocs,
  doc,
  getDoc
} from 'firebase/firestore';
import { db } from './firebase/config';
import { 
  updatePOReservationsOnDelivery,
  getPOReservationsForItem
} from './poReservationService';

const PO_RESERVATIONS_COLLECTION = 'poReservations';
const PURCHASE_ORDERS_COLLECTION = 'purchaseOrders';

/**
 * Sprawdza czy PO ma aktywne rezerwacje i wysyła powiadomienia
 * @param {string} poId - ID zamówienia zakupowego
 * @param {string} userId - ID użytkownika
 * @returns {Promise<Object>} - Wynik operacji
 */
export const handlePODeliveryNotification = async (poId, userId) => {
  try {
    console.log(`Sprawdzanie rezerwacji dla dostarczonego PO: ${poId}`);
    
    // Pobierz dane PO
    const { getPurchaseOrderById } = await import('./purchaseOrderService');
    const po = await getPurchaseOrderById(poId);
    
    if (!po) {
      throw new Error('Zamówienie zakupowe nie istnieje');
    }
    
    // Sprawdź czy PO ma aktywne rezerwacje
    const activeReservations = await getActiveReservationsForPO(poId);
    
    if (activeReservations.length === 0) {
      console.log(`Brak aktywnych rezerwacji dla PO: ${po.number}`);
      return {
        success: true,
        message: 'Brak aktywnych rezerwacji do zaktualizowania',
        notificationsSent: 0
      };
    }
    
    console.log(`Znaleziono ${activeReservations.length} aktywnych rezerwacji dla PO: ${po.number}`);
    
    // Przygotuj dane o dostarczonych pozycjach
    const deliveredItems = po.items.map(item => ({
      poItemId: item.id,
      deliveredQuantity: parseFloat(item.received || 0),
      name: item.name
    })).filter(item => item.deliveredQuantity > 0);
    
    // Aktualizuj rezerwacje z informacjami o dostawie
    const updatedReservations = await updatePOReservationsOnDelivery(
      poId, 
      deliveredItems, 
      userId
    );
    
    // Zbierz użytkowników do powiadomienia (unikalne task owners)
    const uniqueUsers = [...new Set(activeReservations.map(r => r.reservedBy))];
    
    // Wysyłaj powiadomienia do odpowiedzialnych za zadania
    let notificationsSent = 0;
    
    for (const targetUserId of uniqueUsers) {
      try {
        await sendDeliveryNotification(targetUserId, po, activeReservations, updatedReservations);
        notificationsSent++;
      } catch (error) {
        console.error(`Błąd podczas wysyłania powiadomienia do użytkownika ${targetUserId}:`, error);
      }
    }
    
    console.log(`Wysłano ${notificationsSent} powiadomień o dostawie PO: ${po.number}`);
    
    return {
      success: true,
      message: `Zaktualizowano ${updatedReservations.length} rezerwacji i wysłano ${notificationsSent} powiadomień`,
      updatedReservations: updatedReservations.length,
      notificationsSent
    };
    
  } catch (error) {
    console.error('Błąd podczas obsługi powiadomień o dostawie PO:', error);
    throw error;
  }
};

/**
 * Pobiera aktywne rezerwacje dla PO
 * @param {string} poId - ID zamówienia zakupowego
 * @returns {Promise<Array>} - Lista aktywnych rezerwacji
 */
const getActiveReservationsForPO = async (poId) => {
  try {
    const q = query(
      collection(db, PO_RESERVATIONS_COLLECTION),
      where('poId', '==', poId),
      where('status', 'in', ['pending', 'delivered'])
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Błąd podczas pobierania aktywnych rezerwacji:', error);
    return [];
  }
};

/**
 * Wysyła powiadomienie o dostawie PO
 * @param {string} userId - ID użytkownika do powiadomienia
 * @param {Object} po - Dane zamówienia zakupowego
 * @param {Array} reservations - Lista rezerwacji
 * @param {Array} updatedReservations - Lista zaktualizowanych rezerwacji
 * @returns {Promise<void>}
 */
const sendDeliveryNotification = async (userId, po, reservations, updatedReservations) => {
  try {
    const { createRealtimeNotification } = await import('./notificationService');
    
    // Znajdź zadania użytkownika z rezerwacjami z tego PO
    const userReservations = reservations.filter(r => r.reservedBy === userId);
    const taskNumbers = [...new Set(userReservations.map(r => r.taskNumber))];
    
    // Przygotuj informacje o materiałach
    const materialsList = [...new Set(userReservations.map(r => r.materialName))];
    const materialsText = materialsList.length > 3 
      ? `${materialsList.slice(0, 3).join(', ')} i ${materialsList.length - 3} inne`
      : materialsList.join(', ');
    
    const title = `Dostawa PO z Twoimi rezerwacjami`;
    const message = `Dostarczono zamówienie ${po.number} zawierające materiały zarezerwowane dla zadań: ${taskNumbers.join(', ')}. Materiały: ${materialsText}. Możesz teraz przekształcić rezerwacje na standardowe.`;
    
    await createRealtimeNotification({
      userIds: [userId],
      title,
      message,
      type: 'info',
      entityType: 'poDelivery',
      entityId: po.id,
      metadata: {
        poNumber: po.number,
        taskNumbers,
        reservationIds: userReservations.map(r => r.id),
        deliveredMaterials: materialsList
      },
      createdBy: 'system'
    });
    
    console.log(`Wysłano powiadomienie o dostawie PO ${po.number} do użytkownika ${userId}`);
    
  } catch (error) {
    console.error('Błąd podczas wysyłania powiadomienia o dostawie:', error);
    throw error;
  }
};

/**
 * Sprawdza czy zmiana statusu PO wymaga wysłania powiadomień
 * @param {string} oldStatus - Stary status PO
 * @param {string} newStatus - Nowy status PO
 * @returns {boolean} - Czy należy wysłać powiadomienia
 */
export const shouldSendDeliveryNotification = (oldStatus, newStatus) => {
  // Powiadomienia wysyłamy gdy PO zmienia status na 'delivered' lub 'completed'
  const deliveryStatuses = ['delivered', 'completed'];
  const nonDeliveryStatuses = ['draft', 'pending', 'approved', 'ordered', 'partial', 'shipped'];
  
  return nonDeliveryStatuses.includes(oldStatus) && deliveryStatuses.includes(newStatus);
};

/**
 * Pobiera podsumowanie rezerwacji PO dla dashboardu
 * @param {string} userId - ID użytkownika (opcjonalne, dla filtrowania)
 * @returns {Promise<Object>} - Podsumowanie rezerwacji
 */
export const getPOReservationsSummary = async (userId = null) => {
  try {
    let q = query(
      collection(db, PO_RESERVATIONS_COLLECTION),
      where('status', 'in', ['pending', 'delivered'])
    );
    
    // Filtruj według użytkownika jeśli podano
    if (userId) {
      q = query(
        collection(db, PO_RESERVATIONS_COLLECTION),
        where('status', 'in', ['pending', 'delivered']),
        where('reservedBy', '==', userId)
      );
    }
    
    const snapshot = await getDocs(q);
    const reservations = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Grupuj według statusu
    const summary = {
      pending: reservations.filter(r => r.status === 'pending'),
      delivered: reservations.filter(r => r.status === 'delivered'),
      totalValue: reservations.reduce((sum, r) => 
        sum + (r.reservedQuantity * r.unitPrice), 0
      ),
      uniquePOs: [...new Set(reservations.map(r => r.poId))].length,
      uniqueTasks: [...new Set(reservations.map(r => r.taskId))].length
    };
    
    return summary;
    
  } catch (error) {
    console.error('Błąd podczas pobierania podsumowania rezerwacji PO:', error);
    return {
      pending: [],
      delivered: [],
      totalValue: 0,
      uniquePOs: 0,
      uniqueTasks: 0
    };
  }
};

/**
 * Sprawdza czy zadanie ma oczekujące rezerwacje z PO
 * @param {string} taskId - ID zadania produkcyjnego
 * @returns {Promise<boolean>} - Czy zadanie ma oczekujące rezerwacje
 */
export const taskHasPendingPOReservations = async (taskId) => {
  try {
    const q = query(
      collection(db, PO_RESERVATIONS_COLLECTION),
      where('taskId', '==', taskId),
      where('status', '==', 'pending')
    );
    
    const snapshot = await getDocs(q);
    return !snapshot.empty;
    
  } catch (error) {
    console.error('Błąd podczas sprawdzania oczekujących rezerwacji PO:', error);
    return false;
  }
};

/**
 * Pobiera alerty o zagrożonych dostawach
 * @param {number} daysThreshold - Próg dni do ostrzeżenia (domyślnie 7)
 * @returns {Promise<Array>} - Lista alertów
 */
export const getDeliveryAlerts = async (daysThreshold = 7) => {
  try {
    const q = query(
      collection(db, PO_RESERVATIONS_COLLECTION),
      where('status', '==', 'pending')
    );
    
    const snapshot = await getDocs(q);
    const reservations = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    const now = new Date();
    const alerts = [];
    
    for (const reservation of reservations) {
      if (reservation.expectedDeliveryDate) {
        const deliveryDate = new Date(reservation.expectedDeliveryDate);
        const daysUntilDelivery = Math.ceil((deliveryDate - now) / (1000 * 60 * 60 * 24));
        
        // Alert dla opóźnionych dostaw
        if (daysUntilDelivery < 0) {
          alerts.push({
            type: 'overdue',
            severity: 'error',
            reservation,
            daysOverdue: Math.abs(daysUntilDelivery),
            message: `Dostawa PO ${reservation.poNumber} jest opóźniona o ${Math.abs(daysUntilDelivery)} dni`
          });
        }
        // Alert dla nadchodzących dostaw
        else if (daysUntilDelivery <= daysThreshold) {
          alerts.push({
            type: 'upcoming',
            severity: daysUntilDelivery <= 2 ? 'warning' : 'info',
            reservation,
            daysUntilDelivery,
            message: `Dostawa PO ${reservation.poNumber} planowana za ${daysUntilDelivery} dni`
          });
        }
      }
    }
    
    return alerts.sort((a, b) => {
      // Sortuj według priorytetów: overdue > warning > info
      const priorityOrder = { error: 3, warning: 2, info: 1 };
      return priorityOrder[b.severity] - priorityOrder[a.severity];
    });
    
  } catch (error) {
    console.error('Błąd podczas pobierania alertów o dostawach:', error);
    return [];
  }
};

export default {
  handlePODeliveryNotification,
  shouldSendDeliveryNotification,
  getPOReservationsSummary,
  taskHasPendingPOReservations,
  getDeliveryAlerts
}; 