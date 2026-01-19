/**
 * Serwis sprawdzający niezamówione materiały dla produkcji
 * Pobiera rezerwacje PO ze statusem 'pending' gdzie PO jest w statusie 'draft'
 */

import { 
  collection, 
  getDocs, 
  doc, 
  getDoc,
  query, 
  where 
} from 'firebase/firestore';
import { db } from './firebase/config';

const PO_RESERVATIONS_COLLECTION = 'poReservations';
const PURCHASE_ORDERS_COLLECTION = 'purchaseOrders';
const PRODUCTION_TASKS_COLLECTION = 'productionTasks';

// Konfiguracja progów ostrzeżeń (w dniach)
const WARNING_THRESHOLDS = {
  CRITICAL: 7,   // Produkcja za 7 dni lub mniej
  URGENT: 14,    // Produkcja za 14 dni lub mniej
  NORMAL: 31,    // Produkcja za 31 dni lub mniej
};

/**
 * Określa priorytet ostrzeżenia na podstawie dni do produkcji
 */
const getWarningLevel = (daysToProduction) => {
  if (daysToProduction <= WARNING_THRESHOLDS.CRITICAL) {
    return { level: 'critical', emoji: '🔴', label: 'KRYTYCZNE', color: 'error' };
  }
  if (daysToProduction <= WARNING_THRESHOLDS.URGENT) {
    return { level: 'urgent', emoji: '🟠', label: 'PILNE', color: 'warning' };
  }
  if (daysToProduction <= WARNING_THRESHOLDS.NORMAL) {
    return { level: 'normal', emoji: '🟡', label: 'UWAGA', color: 'info' };
  }
  return null;
};

/**
 * Pobiera wszystkie ostrzeżenia o niezamówionych materiałach
 * @returns {Promise<Object>} Obiekt z alertami i statystykami
 */
export const getUnorderedMaterialAlerts = async () => {
  const now = new Date();
  const alerts = [];
  const stats = {
    totalReservations: 0,
    draftPOs: 0,
    criticalCount: 0,
    urgentCount: 0,
    normalCount: 0,
  };

  try {
    // 1. Pobierz wszystkie rezerwacje PO ze statusem 'pending'
    const reservationsQuery = query(
      collection(db, PO_RESERVATIONS_COLLECTION),
      where('status', '==', 'pending')
    );
    
    const reservationsSnapshot = await getDocs(reservationsQuery);
    stats.totalReservations = reservationsSnapshot.size;

    if (reservationsSnapshot.empty) {
      return { alerts: [], stats };
    }

    // 2. Grupuj rezerwacje po PO ID
    const reservationsByPO = new Map();
    
    reservationsSnapshot.docs.forEach(docSnapshot => {
      const reservation = { id: docSnapshot.id, ...docSnapshot.data() };
      const key = reservation.poId;
      
      if (!reservationsByPO.has(key)) {
        reservationsByPO.set(key, []);
      }
      reservationsByPO.get(key).push(reservation);
    });

    // 3. Przetwórz każde PO
    const processedPOs = new Set();

    for (const [poId, reservations] of reservationsByPO) {
      try {
        // Pobierz PO
        const poDoc = await getDoc(doc(db, PURCHASE_ORDERS_COLLECTION, poId));
        
        if (!poDoc.exists()) {
          console.warn(`PO ${poId} nie istnieje`);
          continue;
        }

        const po = poDoc.data();

        // Sprawdź czy PO jest w statusie 'draft'
        if (po.status !== 'draft') {
          continue;
        }

        processedPOs.add(poId);

        // Dla każdej rezerwacji sprawdź termin produkcji
        for (const reservation of reservations) {
          try {
            // Pobierz zadanie produkcyjne
            const taskDoc = await getDoc(doc(db, PRODUCTION_TASKS_COLLECTION, reservation.taskId));
            
            if (!taskDoc.exists()) {
              continue;
            }

            const task = taskDoc.data();

            // Pobierz scheduledDate
            let scheduledDate = null;
            if (task.scheduledDate) {
              scheduledDate = task.scheduledDate.toDate ? 
                task.scheduledDate.toDate() : 
                new Date(task.scheduledDate);
            }

            if (!scheduledDate || isNaN(scheduledDate.getTime())) {
              continue;
            }

            // Oblicz dni do produkcji
            const daysToProduction = Math.ceil(
              (scheduledDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
            );

            // Sprawdź czy należy dodać ostrzeżenie
            const warningLevel = getWarningLevel(daysToProduction);

            if (warningLevel && daysToProduction >= -7) { // Pokaż też spóźnione do 7 dni wstecz
              alerts.push({
                id: reservation.id,
                poId,
                poNumber: po.number,
                taskId: reservation.taskId,
                taskNumber: reservation.taskNumber || task.moNumber || task.number,
                taskName: reservation.taskName || task.name,
                materialId: reservation.materialId,
                materialName: reservation.materialName,
                reservedQuantity: reservation.reservedQuantity,
                unit: reservation.unit,
                reservedBy: reservation.reservedBy,
                scheduledDate,
                daysToProduction,
                warningLevel,
                supplierName: po.supplier?.name || reservation.supplier?.name || 'Nieznany',
                expectedDeliveryDate: po.expectedDeliveryDate,
                isOverdue: daysToProduction < 0,
              });

              // Aktualizuj statystyki
              if (warningLevel.level === 'critical') stats.criticalCount++;
              else if (warningLevel.level === 'urgent') stats.urgentCount++;
              else stats.normalCount++;
            }
          } catch (taskError) {
            console.error(`Błąd przetwarzania zadania ${reservation.taskId}:`, taskError);
          }
        }
      } catch (poError) {
        console.error(`Błąd przetwarzania PO ${poId}:`, poError);
      }
    }

    stats.draftPOs = processedPOs.size;

    // Sortuj alerty po priorytecie (najważniejsze najpierw)
    alerts.sort((a, b) => a.daysToProduction - b.daysToProduction);

    return { alerts, stats };
  } catch (error) {
    console.error('Błąd podczas pobierania alertów:', error);
    throw error;
  }
};

/**
 * Pobiera ostrzeżenia o niezamówionych materiałach z cache (aggregates/poOrderReminders)
 * Cache jest aktualizowany przez Cloud Function codziennie o 8:00
 * @returns {Promise<Object>} Obiekt z alertami, statystykami i datą ostatniej aktualizacji
 */
export const getUnorderedMaterialAlertsFromCache = async () => {
  try {
    const docRef = doc(db, 'aggregates', 'poOrderReminders');
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      console.log('Cache poOrderReminders nie istnieje - zwracam puste dane');
      return { 
        alerts: [], 
        stats: { 
          totalReservations: 0,
          draftPOs: 0,
          criticalCount: 0, 
          urgentCount: 0, 
          normalCount: 0 
        },
        lastRun: null
      };
    }
    
    const data = docSnap.data();
    
    // Konwertuj daty z ISO string na Date i dodaj kolor do warningLevel
    const alerts = (data.alerts || []).map(alert => ({
      ...alert,
      scheduledDate: new Date(alert.scheduledDate),
      warningLevel: {
        ...alert.warningLevel,
        color: alert.warningLevel.level === 'critical' ? 'error' : 
               alert.warningLevel.level === 'urgent' ? 'warning' : 'info'
      }
    }));
    
    return { 
      alerts, 
      stats: data.stats || {
        totalReservations: 0,
        draftPOs: 0,
        criticalCount: 0,
        urgentCount: 0,
        normalCount: 0
      },
      lastRun: data.lastRun?.toDate() || null
    };
  } catch (error) {
    console.error('Błąd podczas pobierania alertów z cache:', error);
    throw error;
  }
};

/**
 * Pobiera liczbę aktywnych alertów (do wyświetlenia w badge)
 * Używa cache dla lepszej wydajności
 * @returns {Promise<number>} Liczba alertów
 */
export const getUnorderedMaterialAlertsCount = async () => {
  try {
    // Najpierw spróbuj z cache (szybsze)
    const { stats } = await getUnorderedMaterialAlertsFromCache();
    return stats.criticalCount + stats.urgentCount + stats.normalCount;
  } catch (error) {
    console.error('Błąd podczas pobierania liczby alertów z cache:', error);
    return 0;
  }
};
