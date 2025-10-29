/**
 * Serwis zarządzania rezerwacjami z zamówień zakupowych (PO)
 * 
 * Funkcjonalności:
 * - Tworzenie "pending reservations" z pozycji PO
 * - Śledzenie powiązanych partii magazynowych po dostawie
 * - Powiadomienia o dostawach zarezerwowanych PO
 * - Ręczna konwersja na standardowe rezerwacje (bez automatyzacji)
 */

import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { db } from './firebase/config';

const PRODUCTION_TASKS_COLLECTION = 'productionTasks';
const PURCHASE_ORDERS_COLLECTION = 'purchaseOrders';
const INVENTORY_BATCHES_COLLECTION = 'inventoryBatches';
const PO_RESERVATIONS_COLLECTION = 'poReservations';

// Funkcja pomocnicza do usuwania undefined wartości z obiektu
const cleanUndefinedValues = (obj) => {
  if (obj === null || obj === undefined) {
    return null;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => cleanUndefinedValues(item)).filter(item => item !== undefined);
  }
  
  if (typeof obj === 'object') {
    const cleaned = {};
    Object.keys(obj).forEach(key => {
      const value = obj[key];
      if (value !== undefined) {
        cleaned[key] = cleanUndefinedValues(value);
      }
    });
    return cleaned;
  }
  
  return obj;
};

/**
 * Tworzy rezerwację z pozycji PO dla zadania produkcyjnego
 * @param {string} taskId - ID zadania produkcyjnego
 * @param {string} poId - ID zamówienia zakupowego
 * @param {string} poItemId - ID pozycji w PO
 * @param {number} reservedQuantity - Ilość do zarezerwowania
 * @param {string} userId - ID użytkownika
 * @returns {Promise<Object>} - Utworzona rezerwacja
 */
export const createPOReservation = async (taskId, poId, poItemId, reservedQuantity, userId) => {
  try {
    // Pobierz dane zadania
    const taskRef = doc(db, PRODUCTION_TASKS_COLLECTION, taskId);
    const taskDoc = await getDoc(taskRef);
    
    if (!taskDoc.exists()) {
      throw new Error('Zadanie produkcyjne nie istnieje');
    }
    
    const task = taskDoc.data();
    
    // Pobierz dane PO
    const { getPurchaseOrderById } = await import('./purchaseOrderService');
    const po = await getPurchaseOrderById(poId);
    
    if (!po) {
      throw new Error('Zamówienie zakupowe nie istnieje');
    }
    
    // Znajdź pozycję w PO
    const poItem = po.items.find(item => item.id === poItemId);
    if (!poItem) {
      throw new Error('Pozycja w zamówieniu zakupowym nie istnieje');
    }
    
    // Sprawdź czy pozycja nie została już w pełni przyjęta na magazyn
    const received = parseFloat(poItem.received || 0);
    const ordered = parseFloat(poItem.quantity || 0);
    const notYetReceived = ordered - received;
    
    if (notYetReceived <= 0) {
      throw new Error(`Pozycja "${poItem.name}" została już w pełni przyjęta na magazyn (${received}/${ordered} ${poItem.unit}). Nie można tworzyć rezerwacji PO dla pozycji już przyjętych.`);
    }
    
    if (received > 0) {
      console.warn(`UWAGA: Pozycja "${poItem.name}" jest częściowo przyjęta (${received}/${ordered} ${poItem.unit}). Rezerwacja dotyczy tylko części jeszcze nieprzyjętej.`);
    }
    
    // Sprawdź czy pozycja nie jest już w pełni zarezerwowana (z uwzględnieniem już przyjętych ilości)
    const existingReservations = await getPOReservationsForItem(poId, poItemId);
    const totalReserved = existingReservations.reduce((sum, res) => sum + res.reservedQuantity, 0);
    const availableQuantity = notYetReceived - totalReserved;
    
    if (reservedQuantity > availableQuantity) {
      throw new Error(`Nie można zarezerwować ${reservedQuantity} ${poItem.unit}. Z pozycji zamówionej (${ordered} ${poItem.unit}) już przyjęto ${received} ${poItem.unit}, zarezerwowano ${totalReserved} ${poItem.unit}. Dostępne do rezerwacji: ${availableQuantity} ${poItem.unit}`);
    }
    
    // Utwórz rezerwację
    const reservation = {
      taskId,
      taskNumber: task.moNumber || task.number,
      taskName: task.name,
      poId,
      poNumber: po.number,
      poItemId,
      materialId: poItem.inventoryItemId,
      materialName: poItem.name,
      reservedQuantity: parseFloat(reservedQuantity),
      unit: poItem.unit,
      unitPrice: parseFloat(poItem.unitPrice || 0),
      currency: po.currency || 'EUR',
      expectedDeliveryDate: po.expectedDeliveryDate,
      supplier: po.supplier ? {
        id: po.supplier.id,
        name: po.supplier.name
      } : null,
      status: 'pending', // pending, delivered, converted (cancelled są usuwane)
      deliveredQuantity: 0,
      convertedQuantity: 0,
      linkedBatches: [], // Partie magazynowe powiązane po dostawie
      reservedAt: serverTimestamp(),
      reservedBy: userId,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    };
    
    // Dodaj rezerwację do kolekcji
    const reservationRef = await addDoc(collection(db, PO_RESERVATIONS_COLLECTION), reservation);
    
    // Aktualizuj zadanie - dodaj ID rezerwacji do listy
    const currentPOReservations = task.poReservationIds || [];
    await updateDoc(taskRef, {
      poReservationIds: [...currentPOReservations, reservationRef.id],
      updatedAt: serverTimestamp(),
      updatedBy: userId
    });
    
    console.log(`Utworzono rezerwację z PO: ${po.number}, pozycja: ${poItem.name}, ilość: ${reservedQuantity}`);
    
    // Automatyczna synchronizacja z partiami magazynowymi po utworzeniu rezerwacji
    try {
      console.log(`Rozpoczynam automatyczną synchronizację dla nowej rezerwacji ${reservationRef.id}`);
      await syncPOReservationsWithBatches(taskId, userId);
      console.log(`Zakończono automatyczną synchronizację dla rezerwacji ${reservationRef.id}`);
    } catch (syncError) {
      console.warn(`Błąd podczas automatycznej synchronizacji rezerwacji ${reservationRef.id}:`, syncError);
      // Nie przerywamy procesu tworzenia rezerwacji jeśli synchronizacja się nie powiedzie
    }
    
    return {
      id: reservationRef.id,
      ...reservation,
      reservedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
  } catch (error) {
    console.error('Błąd podczas tworzenia rezerwacji z PO:', error);
    throw error;
  }
};

/**
 * Pobiera wszystkie rezerwacje z PO dla zadania
 * @param {string} taskId - ID zadania produkcyjnego
 * @returns {Promise<Array>} - Lista rezerwacji
 */
export const getPOReservationsForTask = async (taskId) => {
  try {
    const q = query(
      collection(db, PO_RESERVATIONS_COLLECTION),
      where('taskId', '==', taskId),
      orderBy('reservedAt', 'desc')
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      reservedAt: doc.data().reservedAt?.toDate?.()?.toISOString() || doc.data().reservedAt,
      updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() || doc.data().updatedAt
    }));
  } catch (error) {
    console.error('Błąd podczas pobierania rezerwacji z PO:', error);
    return [];
  }
};

/**
 * Pobiera rezerwacje dla konkretnej pozycji PO
 * @param {string} poId - ID zamówienia zakupowego
 * @param {string} poItemId - ID pozycji w PO
 * @returns {Promise<Array>} - Lista rezerwacji dla pozycji
 */
export const getPOReservationsForItem = async (poId, poItemId) => {
  try {
    const q = query(
      collection(db, PO_RESERVATIONS_COLLECTION),
      where('poId', '==', poId),
      where('poItemId', '==', poItemId)
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Błąd podczas pobierania rezerwacji dla pozycji PO:', error);
    return [];
  }
};

/**
 * Anuluje (usuwa) rezerwację z PO
 * @param {string} reservationId - ID rezerwacji
 * @param {string} userId - ID użytkownika
 * @returns {Promise<void>}
 */
export const cancelPOReservation = async (reservationId, userId) => {
  try {
    const reservationRef = doc(db, PO_RESERVATIONS_COLLECTION, reservationId);
    const reservationDoc = await getDoc(reservationRef);
    
    if (!reservationDoc.exists()) {
      throw new Error('Rezerwacja nie istnieje');
    }
    
    const reservation = reservationDoc.data();
    
    if (reservation.status === 'converted') {
      throw new Error('Nie można anulować rezerwacji która została już przekształcona');
    }
    
    // Usuń dokument rezerwacji z bazy danych
    await deleteDoc(reservationRef);
    
    // Usuń ID rezerwacji z zadania
    const taskRef = doc(db, PRODUCTION_TASKS_COLLECTION, reservation.taskId);
    const taskDoc = await getDoc(taskRef);
    
    if (taskDoc.exists()) {
      const task = taskDoc.data();
      const updatedReservationIds = (task.poReservationIds || []).filter(id => id !== reservationId);
      
      await updateDoc(taskRef, {
        poReservationIds: updatedReservationIds,
        updatedAt: serverTimestamp(),
        updatedBy: userId
      });
    }
    
    console.log(`Usunięto rezerwację z PO: ${reservationId}`);
    
  } catch (error) {
    console.error('Błąd podczas usuwania rezerwacji z PO:', error);
    throw error;
  }
};

/**
 * Aktualizuje rezerwację z informacjami o dostarczonych partiach
 * @param {string} poId - ID zamówienia zakupowego
 * @param {Array} deliveredItems - Lista dostarczonych pozycji z partiami
 * @param {string} userId - ID użytkownika
 * @returns {Promise<Array>} - Zaktualizowane rezerwacje
 */
export const updatePOReservationsOnDelivery = async (poId, deliveredItems, userId) => {
  try {
    console.log(`Aktualizacja rezerwacji po dostawie PO: ${poId}`);
    
    const updatedReservations = [];
    
    for (const item of deliveredItems) {
      // Pobierz rezerwacje dla tej pozycji
      const reservations = await getPOReservationsForItem(poId, item.poItemId);
      
      if (reservations.length === 0) continue;
      
      // Znajdź partie magazynowe utworzone dla tej pozycji
      console.log(`Szukam partii dla poId: ${poId}, itemPoId: ${item.poItemId}`);
      
      const batchesQuery = query(
        collection(db, INVENTORY_BATCHES_COLLECTION),
        where('purchaseOrderDetails.id', '==', poId),
        where('purchaseOrderDetails.itemPoId', '==', item.poItemId)
      );
      
      const batchesSnapshot = await getDocs(batchesQuery);
      let batches = batchesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      console.log(`Znaleziono ${batches.length} partii dla itemPoId: ${item.poItemId}`);
      
      // Jeśli nie znaleziono partii w nowym formacie, spróbuj starszego formatu
      if (batches.length === 0) {
        console.log(`Próba wyszukiwania w starszym formacie sourceDetails`);
        const oldFormatQuery = query(
          collection(db, INVENTORY_BATCHES_COLLECTION),
          where('sourceDetails.orderId', '==', poId),
          where('sourceDetails.itemPoId', '==', item.poItemId)
        );
        
        const oldFormatSnapshot = await getDocs(oldFormatQuery);
        batches = oldFormatSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        console.log(`Znaleziono ${batches.length} partii w starszym formacie`);
      }
      
      // Jeszcze jedna próba - znajdź wszystkie partie dla tego PO i przeszukaj je
      if (batches.length === 0) {
        console.log(`Próba wyszukiwania wszystkich partii dla PO: ${poId}`);
        const allPoBatchesQuery = query(
          collection(db, INVENTORY_BATCHES_COLLECTION),
          where('purchaseOrderDetails.id', '==', poId)
        );
        
        const allBatchesSnapshot = await getDocs(allPoBatchesQuery);
        const allBatches = allBatchesSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        console.log(`Znaleziono ${allBatches.length} wszystkich partii dla PO ${poId}:`);
        allBatches.forEach(batch => {
          console.log(`- Partia ${batch.id}: itemPoId=${batch.purchaseOrderDetails?.itemPoId}, itemName=${batch.itemName}`);
        });
        
        // Spróbuj dopasować partie na podstawie nazwy materiału - ale TYLKO dla konkretnej pozycji
        for (const reservation of reservations) {
          // KRYTYCZNE: Sprawdź czy partia ma itemPoId zgodny z rezerwacją
          const matchingBatches = allBatches.filter(batch => {
            const batchItemPoId = batch.purchaseOrderDetails?.itemPoId || batch.sourceDetails?.itemPoId;
            
            // Jeśli partia ma itemPoId, musi się zgadzać z rezerwacją
            if (batchItemPoId && reservation.poItemId) {
              return batchItemPoId === reservation.poItemId && 
                     (batch.itemId === reservation.materialId || 
                      batch.itemName?.toLowerCase() === reservation.materialName?.toLowerCase());
            }
            
            // Fallback tylko gdy partia nie ma itemPoId (stare dane)
            return batch.itemId === reservation.materialId || 
                   batch.itemName?.toLowerCase() === reservation.materialName?.toLowerCase();
          });
          
          if (matchingBatches.length > 0) {
            console.log(`Znaleziono ${matchingBatches.length} partii dla materiału ${reservation.materialName} (itemPoId: ${reservation.poItemId}) na podstawie dopasowania nazwy/ID`);
            batches = matchingBatches;
            break;
          }
        }
      }
      
      // Aktualizuj każdą rezerwację
      for (const reservation of reservations) {
        const reservationRef = doc(db, PO_RESERVATIONS_COLLECTION, reservation.id);
        
        await updateDoc(reservationRef, {
          status: 'delivered',
          deliveredQuantity: item.deliveredQuantity || 0,
          linkedBatches: batches.map(batch => ({
            batchId: batch.id,
            batchNumber: batch.batchNumber,
            quantity: batch.quantity,
            expiryDate: batch.expiryDate,
            unitPrice: batch.unitPrice
          })),
          deliveredAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          updatedBy: userId
        });
        
        updatedReservations.push({
          ...reservation,
          status: 'delivered',
          deliveredQuantity: item.deliveredQuantity || 0,
          linkedBatches: batches
        });
      }
    }
    
    console.log(`Zaktualizowano ${updatedReservations.length} rezerwacji po dostawie`);
    return updatedReservations;
    
  } catch (error) {
    console.error('Błąd podczas aktualizacji rezerwacji po dostawie:', error);
    throw error;
  }
};

/**
 * Konwertuje rezerwację z PO na standardową rezerwację magazynową
 * @param {string} reservationId - ID rezerwacji z PO
 * @param {string} selectedBatchId - ID wybranej partii do rezerwacji
 * @param {number} quantityToConvert - Ilość do przekształcenia
 * @param {string} userId - ID użytkownika
 * @returns {Promise<Object>} - Wynik konwersji
 */
export const convertPOReservationToStandard = async (reservationId, selectedBatchId, quantityToConvert, userId) => {
  try {
    const reservationRef = doc(db, PO_RESERVATIONS_COLLECTION, reservationId);
    const reservationDoc = await getDoc(reservationRef);
    
    if (!reservationDoc.exists()) {
      throw new Error('Rezerwacja z PO nie istnieje');
    }
    
    const reservation = reservationDoc.data();
    
    if (reservation.status !== 'delivered') {
      throw new Error('Można konwertować tylko dostarczone rezerwacje');
    }
    
    // Sprawdź czy ilość do konwersji nie przekracza zarezerwowanej ilości
    const maxAvailableToConvert = Math.min(
      reservation.reservedQuantity - reservation.convertedQuantity,
      reservation.deliveredQuantity - reservation.convertedQuantity
    );
    
    if (quantityToConvert > maxAvailableToConvert) {
      throw new Error(`Ilość do konwersji przekracza dostępną ilość. Maksymalnie można przekształcić: ${maxAvailableToConvert} ${reservation.unit}`);
    }
    
    // Sprawdź czy wybrana partia istnieje w powiązanych partiach
    const selectedBatch = reservation.linkedBatches.find(batch => batch.batchId === selectedBatchId);
    if (!selectedBatch) {
      throw new Error('Wybrana partia nie jest powiązana z tą rezerwacją');
    }
    
    // Utwórz standardową rezerwację magazynową
    const { bookInventoryForTask } = await import('./inventory');
    const bookingResult = await bookInventoryForTask(
      reservation.materialId,
      quantityToConvert,
      reservation.taskId,
      userId,
      'manual',
      selectedBatchId
    );
    
    if (!bookingResult.success) {
      throw new Error(`Nie udało się utworzyć standardowej rezerwacji: ${bookingResult.message}`);
    }
    
    // Aktualizuj rezerwację PO
    const newConvertedQuantity = reservation.convertedQuantity + quantityToConvert;
    const newStatus = newConvertedQuantity >= reservation.reservedQuantity ? 'converted' : 'delivered';
    
    // Utwórz timestamp jako Date object (Firebase nie pozwala serverTimestamp w tablicach)
    const now = new Date();
    
    await updateDoc(reservationRef, {
      convertedQuantity: newConvertedQuantity,
      status: newStatus,
      conversions: [
        ...(reservation.conversions || []),
        {
          batchId: selectedBatchId,
          quantity: quantityToConvert,
          convertedAt: now,
          convertedBy: userId
        }
      ],
      updatedAt: serverTimestamp(),
      updatedBy: userId
    });
    
    console.log(`Przekształcono ${quantityToConvert} ${reservation.unit} z rezerwacji PO na standardową rezerwację`);
    
    return {
      success: true,
      message: `Przekształcono ${quantityToConvert} ${reservation.unit} na standardową rezerwację`,
      bookingResult,
      updatedReservation: {
        ...reservation,
        convertedQuantity: newConvertedQuantity,
        status: newStatus
      }
    };
    
  } catch (error) {
    console.error('Błąd podczas konwersji rezerwacji PO:', error);
    throw error;
  }
};

/**
 * Pobiera dostępne pozycje z PO dla materiału
 * @param {string} materialId - ID pozycji magazynowej
 * @returns {Promise<Array>} - Lista dostępnych pozycji z PO
 */
export const getAvailablePOItems = async (materialId) => {
  try {
    // Pobierz wszystkie PO które mają dozwolone statusy dla rezerwacji
    const poQuery = query(
      collection(db, PURCHASE_ORDERS_COLLECTION),
      where('status', 'in', ['draft', 'pending', 'approved', 'ordered', 'partial', 'shipped'])
    );
    
    const poSnapshot = await getDocs(poQuery);
    const availableItems = [];
    
    for (const poDoc of poSnapshot.docs) {
      const po = poDoc.data();
      
      // Sprawdź pozycje w PO
      if (po.items && Array.isArray(po.items)) {
        for (const item of po.items) {
          if (item.inventoryItemId === materialId) {
            // Sprawdź ile już zostało przyjęte na magazyn
            const received = parseFloat(item.received || 0);
            const ordered = parseFloat(item.quantity || 0);
            const notYetReceived = ordered - received;
            
            // Tylko nieprzyjeżte ilości mogą być rezerwowane
            if (notYetReceived > 0) {
              // Pobierz istniejące rezerwacje dla tej pozycji
              const existingReservations = await getPOReservationsForItem(poDoc.id, item.id);
              const totalReserved = existingReservations.reduce((sum, res) => sum + res.reservedQuantity, 0);
              const availableQuantity = notYetReceived - totalReserved;
              
              if (availableQuantity > 0) {
                availableItems.push({
                  poId: poDoc.id,
                  poNumber: po.number,
                  poItemId: item.id,
                  materialName: item.name,
                  totalQuantity: ordered,
                  receivedQuantity: received,
                  notYetReceivedQuantity: notYetReceived,
                  reservedQuantity: totalReserved,
                  availableQuantity,
                  unit: item.unit,
                  unitPrice: parseFloat(item.unitPrice || 0),
                  currency: po.currency || 'EUR',
                  expectedDeliveryDate: po.expectedDeliveryDate,
                  supplier: po.supplier,
                  status: po.status
                });
              }
            }
          }
        }
      }
    }
    
    return availableItems.sort((a, b) => {
      // Sortuj według daty dostawy, potem według ceny
      const dateA = new Date(a.expectedDeliveryDate || '9999-12-31');
      const dateB = new Date(b.expectedDeliveryDate || '9999-12-31');
      
      if (dateA.getTime() !== dateB.getTime()) {
        return dateA - dateB;
      }
      
      return a.unitPrice - b.unitPrice;
    });
    
  } catch (error) {
    console.error('Błąd podczas pobierania dostępnych pozycji z PO:', error);
    return [];
  }
};

/**
 * Pobiera statystyki rezerwacji z PO dla zadania
 * @param {string} taskId - ID zadania produkcyjnego
 * @returns {Promise<Object>} - Statystyki rezerwacji
 */
export const getPOReservationStats = async (taskId) => {
  try {
    const reservations = await getPOReservationsForTask(taskId);
    
    const stats = {
      total: reservations.length,
      pending: reservations.filter(r => r.status === 'pending').length,
      delivered: reservations.filter(r => r.status === 'delivered').length,
      converted: reservations.filter(r => r.status === 'converted').length,
      cancelled: 0, // Anulowane rezerwacje są usuwane, więc zawsze 0
      totalReservedValue: reservations
        .reduce((sum, r) => sum + (r.reservedQuantity * r.unitPrice), 0),
      totalDeliveredValue: reservations
        .filter(r => r.status === 'delivered' || r.status === 'converted')
        .reduce((sum, r) => sum + (r.deliveredQuantity * r.unitPrice), 0)
    };
    
    return stats;
  } catch (error) {
    console.error('Błąd podczas pobierania statystyk rezerwacji PO:', error);
    return {
      total: 0,
      pending: 0,
      delivered: 0,
      converted: 0,
      cancelled: 0,
      totalReservedValue: 0,
      totalDeliveredValue: 0
    };
  }
};

/**
 * Ręczna synchronizacja rezerwacji PO z partiami magazynowymi
 * @param {string} taskId - ID zadania (opcjonalne, dla synchronizacji konkretnego zadania)
 * @returns {Promise<Object>} - Wynik synchronizacji
 */
export const syncPOReservationsWithBatches = async (taskId = null, userId = 'system') => {
  try {
    console.log('Rozpoczynam synchronizację rezerwacji PO z partiami magazynowymi...');
    
    // Pobierz rezerwacje do synchronizacji
    let reservationsQuery;
    if (taskId) {
      reservationsQuery = query(
        collection(db, PO_RESERVATIONS_COLLECTION),
        where('taskId', '==', taskId),
        where('status', 'in', ['pending', 'delivered'])
      );
    } else {
      reservationsQuery = query(
        collection(db, PO_RESERVATIONS_COLLECTION),
        where('status', 'in', ['pending', 'delivered'])
      );
    }
    
    const reservationsSnapshot = await getDocs(reservationsQuery);
    const reservations = reservationsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`Znaleziono ${reservations.length} rezerwacji do synchronizacji`);
    
    let syncedCount = 0;
    let errorCount = 0;
    const results = [];
    
    for (const reservation of reservations) {
      try {
        // Sprawdź czy rezerwacja ma już powiązane partie
        if (reservation.linkedBatches && reservation.linkedBatches.length > 0) {
          console.log(`Rezerwacja ${reservation.id} ma już powiązane partie, pomijam`);
          continue;
        }
        
        // Znajdź partie dla tego PO i pozycji
        console.log(`Synchronizacja rezerwacji ${reservation.id}: PO ${reservation.poId}, pozycja ${reservation.poItemId}`);
        
        // Spróbuj różne sposoby wyszukiwania partii
        let batches = [];
        
        // 1. Nowy format - purchaseOrderDetails
        const newFormatQuery = query(
          collection(db, INVENTORY_BATCHES_COLLECTION),
          where('purchaseOrderDetails.id', '==', reservation.poId),
          where('purchaseOrderDetails.itemPoId', '==', reservation.poItemId)
        );
        
        const newFormatSnapshot = await getDocs(newFormatQuery);
        batches = newFormatSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // 2. Stary format - sourceDetails
        if (batches.length === 0) {
          const oldFormatQuery = query(
            collection(db, INVENTORY_BATCHES_COLLECTION),
            where('sourceDetails.orderId', '==', reservation.poId),
            where('sourceDetails.itemPoId', '==', reservation.poItemId)
          );
          
          const oldFormatSnapshot = await getDocs(oldFormatQuery);
          batches = oldFormatSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
        }
        
        // 3. Wyszukiwanie po materialId z uwzględnieniem itemPoId
        if (batches.length === 0) {
          const materialQuery = query(
            collection(db, INVENTORY_BATCHES_COLLECTION),
            where('itemId', '==', reservation.materialId),
            where('purchaseOrderDetails.id', '==', reservation.poId)
          );
          
          const materialSnapshot = await getDocs(materialQuery);
          const allMaterialBatches = materialSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          
          // Filtruj partie aby znaleźć tylko te z właściwym itemPoId
          batches = allMaterialBatches.filter(batch => {
            const batchItemPoId = batch.purchaseOrderDetails?.itemPoId || batch.sourceDetails?.itemPoId;
            
            // Jeśli partia ma itemPoId, musi się zgadzać z rezerwacją
            if (batchItemPoId && reservation.poItemId) {
              return batchItemPoId === reservation.poItemId;
            }
            
            // Fallback dla partii bez itemPoId (stare dane) - ale tylko jeśli nie ma innych partii z itemPoId
            const batchesWithItemPoId = allMaterialBatches.filter(b => 
              (b.purchaseOrderDetails?.itemPoId || b.sourceDetails?.itemPoId)
            );
            
            return batchesWithItemPoId.length === 0;
          });
          
          console.log(`Znaleziono ${batches.length} partii dla materialId ${reservation.materialId} z uwzględnieniem itemPoId: ${reservation.poItemId}`);
        }
        
        if (batches.length > 0) {
          // Aktualizuj rezerwację z powiązanymi partiami
          const reservationRef = doc(db, PO_RESERVATIONS_COLLECTION, reservation.id);
          
          const totalDeliveredQuantity = batches.reduce((sum, batch) => sum + (batch.quantity || 0), 0);
          
          // Przygotuj dane do aktualizacji, filtrując undefined wartości
          const updateData = {
            status: 'delivered',
            deliveredQuantity: totalDeliveredQuantity,
            linkedBatches: batches.map(batch => {
              const linkedBatch = {
                batchId: batch.id,
                batchNumber: batch.batchNumber || batch.lotNumber || 'Bez numeru',
                quantity: batch.quantity || 0
              };
              
              // Dodaj tylko zdefiniowane wartości
              if (batch.expiryDate !== undefined && batch.expiryDate !== null) {
                linkedBatch.expiryDate = batch.expiryDate;
              }
              
              if (batch.unitPrice !== undefined && batch.unitPrice !== null) {
                linkedBatch.unitPrice = batch.unitPrice;
              } else if (reservation.unitPrice !== undefined && reservation.unitPrice !== null) {
                linkedBatch.unitPrice = reservation.unitPrice;
              }
              
              return linkedBatch;
            }),
            deliveredAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            updatedBy: userId
          };
          
          await updateDoc(reservationRef, updateData);
          
          syncedCount++;
          results.push({
            reservationId: reservation.id,
            success: true,
            batchesFound: batches.length,
            deliveredQuantity: totalDeliveredQuantity
          });
          
          console.log(`✅ Zsynchronizowano rezerwację ${reservation.id} z ${batches.length} partiami`);
        } else {
          console.log(`⚠️ Nie znaleziono partii dla rezerwacji ${reservation.id}`);
          results.push({
            reservationId: reservation.id,
            success: false,
            error: 'Nie znaleziono partii'
          });
        }
        
      } catch (error) {
        console.error(`Błąd podczas synchronizacji rezerwacji ${reservation.id}:`, error);
        errorCount++;
        results.push({
          reservationId: reservation.id,
          success: false,
          error: error.message
        });
      }
    }
    
    console.log(`Synchronizacja zakończona: ${syncedCount} zsynchronizowane, ${errorCount} błędów`);
    
    return {
      success: true,
      totalReservations: reservations.length,
      syncedCount,
      errorCount,
      results
    };
    
  } catch (error) {
    console.error('Błąd podczas synchronizacji rezerwacji PO:', error);
    throw error;
  }
};

/**
 * Odświeża ilości w powiązanych partiach dla wszystkich rezerwacji PO
 * Powinno być wywoływane po każdej zmianie w magazynie
 * @param {string} batchId - ID partii która się zmieniła (opcjonalne, dla optymalizacji)
 * @returns {Promise<Object>} - Wynik odświeżania
 */
export const refreshLinkedBatchesQuantities = async (batchId = null) => {
  try {
    console.log('Odświeżanie ilości w powiązanych partiach...');
    
    // Pobierz wszystkie rezerwacje PO ze statusem delivered które mają linkedBatches
    let reservationsQuery = query(
      collection(db, PO_RESERVATIONS_COLLECTION),
      where('status', '==', 'delivered')
    );
    
    const reservationsSnapshot = await getDocs(reservationsQuery);
    const reservations = reservationsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    let updatedCount = 0;
    let errorCount = 0;
    
    for (const reservation of reservations) {
      // Pomiń rezerwacje bez powiązanych partii
      if (!reservation.linkedBatches || reservation.linkedBatches.length === 0) {
        continue;
      }
      
      // Jeśli podano konkretną partię, sprawdź czy ta rezerwacja ją zawiera
      if (batchId && !reservation.linkedBatches.some(batch => batch.batchId === batchId)) {
        continue;
      }
      
      try {
        let hasChanges = false;
        const updatedLinkedBatches = [];
        
        // Dla każdej powiązanej partii, pobierz aktualną ilość z magazynu
        for (const linkedBatch of reservation.linkedBatches) {
          const batchRef = doc(db, INVENTORY_BATCHES_COLLECTION, linkedBatch.batchId);
          const batchDoc = await getDoc(batchRef);
          
          if (batchDoc.exists()) {
            const currentBatchData = batchDoc.data();
            const currentQuantity = currentBatchData.quantity || 0;
            
            // Sprawdź czy ilość się zmieniła
            if (currentQuantity !== linkedBatch.quantity) {
              hasChanges = true;
              console.log(`Aktualizacja partii ${linkedBatch.batchNumber}: ${linkedBatch.quantity} → ${currentQuantity}`);
            }
            
            // Zaktualizuj dane partii, filtrując undefined wartości
            const updatedBatch = {
              batchId: linkedBatch.batchId,
              quantity: currentQuantity,
              batchNumber: currentBatchData.batchNumber || currentBatchData.lotNumber || linkedBatch.batchNumber || 'Bez numeru'
            };
            
            // Dodaj tylko zdefiniowane wartości
            const expiryDate = currentBatchData.expiryDate || linkedBatch.expiryDate;
            if (expiryDate !== undefined && expiryDate !== null) {
              updatedBatch.expiryDate = expiryDate;
            }
            
            const unitPrice = currentBatchData.unitPrice || linkedBatch.unitPrice;
            if (unitPrice !== undefined && unitPrice !== null) {
              updatedBatch.unitPrice = unitPrice;
            }
            
            updatedLinkedBatches.push(updatedBatch);
          } else {
            // Partia została usunięta z magazynu
            console.warn(`Partia ${linkedBatch.batchId} nie istnieje w magazynie, usuwam z rezerwacji`);
            hasChanges = true;
          }
        }
        
        // Jeśli były zmiany, zaktualizuj rezerwację
        if (hasChanges) {
          const reservationRef = doc(db, PO_RESERVATIONS_COLLECTION, reservation.id);
          
          // Oblicz nową dostarczoną ilość
          const newDeliveredQuantity = updatedLinkedBatches.reduce((sum, batch) => sum + (batch.quantity || 0), 0);
          
          const updateData = cleanUndefinedValues({
            linkedBatches: updatedLinkedBatches,
            deliveredQuantity: newDeliveredQuantity,
            updatedAt: serverTimestamp(),
            updatedBy: 'system'
          });
          
          await updateDoc(reservationRef, updateData);
          
          updatedCount++;
          console.log(`✅ Zaktualizowano rezerwację ${reservation.id}`);
        }
        
      } catch (error) {
        console.error(`Błąd podczas aktualizacji rezerwacji ${reservation.id}:`, error);
        errorCount++;
      }
    }
    
    console.log(`Odświeżanie zakończone: ${updatedCount} zaktualizowanych, ${errorCount} błędów`);
    
    return {
      success: true,
      updatedCount,
      errorCount,
      totalReservations: reservations.length
    };
    
  } catch (error) {
    console.error('Błąd podczas odświeżania ilości w powiązanych partiach:', error);
    throw error;
  }
};

/**
 * Aktualizuje ceny w rezerwacjach PO po zmianie cen w zamówieniu zakupowym
 * @param {string} purchaseOrderId - ID zamówienia zakupowego
 * @param {Object} poData - Dane zamówienia zakupowego z nowymi cenami
 * @param {string} userId - ID użytkownika
 * @returns {Promise<Object>} - Wynik aktualizacji
 */
export const updatePOReservationsPricesOnPOChange = async (purchaseOrderId, poData, userId = 'system') => {
  try {
    console.log(`🔄 [PO_RES_PRICE_UPDATE] Aktualizacja cen w rezerwacjach PO dla zamówienia ${purchaseOrderId}`);
    
    // Pobierz wszystkie rezerwacje dla tego PO
    const q = query(
      collection(db, PO_RESERVATIONS_COLLECTION),
      where('poId', '==', purchaseOrderId),
      where('status', 'in', ['pending', 'delivered']) // Nie aktualizuj converted
    );
    
    const snapshot = await getDocs(q);
    const reservations = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`📋 [PO_RES_PRICE_UPDATE] Znaleziono ${reservations.length} rezerwacji do aktualizacji`);
    
    if (reservations.length === 0) {
      return { success: true, updated: 0, message: 'Brak rezerwacji do aktualizacji' };
    }
    
    let updatedCount = 0;
    let errorCount = 0;
    const affectedTaskIds = new Set();
    
    // Dla każdej rezerwacji
    for (const reservation of reservations) {
      try {
        // Znajdź odpowiednią pozycję w PO
        const poItem = poData.items?.find(item => item.id === reservation.poItemId);
        
        if (!poItem) {
          console.warn(`⚠️ [PO_RES_PRICE_UPDATE] Nie znaleziono pozycji ${reservation.poItemId} w PO`);
          errorCount++;
          continue;
        }
        
        const newUnitPrice = parseFloat(poItem.unitPrice || 0);
        const oldUnitPrice = parseFloat(reservation.unitPrice || 0);
        
        // Sprawdź czy cena się zmieniła (tolerancja 0.0001)
        if (Math.abs(newUnitPrice - oldUnitPrice) < 0.0001) {
          console.log(`✓ [PO_RES_PRICE_UPDATE] Rezerwacja ${reservation.id}: cena bez zmian (${oldUnitPrice}€)`);
          continue;
        }
        
        // Aktualizuj cenę w rezerwacji
        const reservationRef = doc(db, PO_RESERVATIONS_COLLECTION, reservation.id);
        await updateDoc(reservationRef, {
          unitPrice: newUnitPrice,
          currency: poData.currency || reservation.currency || 'EUR',
          updatedAt: serverTimestamp(),
          updatedBy: userId,
          priceUpdatedFrom: oldUnitPrice,
          priceUpdatedAt: serverTimestamp()
        });
        
        console.log(`✅ [PO_RES_PRICE_UPDATE] Zaktualizowano cenę rezerwacji ${reservation.id}: ${oldUnitPrice}€ → ${newUnitPrice}€`);
        updatedCount++;
        
        // Zapisz zadanie do aktualizacji kosztów
        affectedTaskIds.add(reservation.taskId);
        
      } catch (error) {
        console.error(`❌ [PO_RES_PRICE_UPDATE] Błąd aktualizacji rezerwacji ${reservation.id}:`, error);
        errorCount++;
      }
    }
    
    console.log(`📊 [PO_RES_PRICE_UPDATE] Zaktualizowano ${updatedCount} rezerwacji, ${errorCount} błędów`);
    
    // Aktualizuj koszty w zadaniach które mają zaktualizowane rezerwacje
    if (affectedTaskIds.size > 0) {
      console.log(`🔄 [PO_RES_PRICE_UPDATE] Aktualizacja kosztów w ${affectedTaskIds.size} zadaniach...`);
      
      const { updateTaskCostsAutomatically } = await import('./productionService');
      const taskUpdatePromises = Array.from(affectedTaskIds).map(taskId =>
        updateTaskCostsAutomatically(taskId, userId, 'Automatyczna aktualizacja po zmianie cen w rezerwacjach PO')
      );
      
      const taskResults = await Promise.allSettled(taskUpdatePromises);
      
      const taskSuccessCount = taskResults.filter(r => r.status === 'fulfilled').length;
      const taskErrorCount = taskResults.filter(r => r.status === 'rejected').length;
      
      console.log(`✅ [PO_RES_PRICE_UPDATE] Zaktualizowano koszty: ${taskSuccessCount} zadań pomyślnie, ${taskErrorCount} błędów`);
      
      return {
        success: true,
        updated: updatedCount,
        errors: errorCount,
        affectedTasks: affectedTaskIds.size,
        tasksUpdated: taskSuccessCount,
        tasksErrors: taskErrorCount
      };
    }
    
    return {
      success: true,
      updated: updatedCount,
      errors: errorCount,
      affectedTasks: 0
    };
    
  } catch (error) {
    console.error('❌ [PO_RES_PRICE_UPDATE] Błąd podczas aktualizacji cen w rezerwacjach PO:', error);
    throw error;
  }
}; 

export default {
  createPOReservation,
  getPOReservationsForTask,
  getPOReservationsForItem,
  cancelPOReservation,
  updatePOReservationsOnDelivery,
  convertPOReservationToStandard,
  getAvailablePOItems,
  getPOReservationStats,
  syncPOReservationsWithBatches,
  refreshLinkedBatchesQuantities,
  updatePOReservationsPricesOnPOChange
}; 