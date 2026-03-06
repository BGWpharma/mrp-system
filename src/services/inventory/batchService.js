// src/services/inventory/batchService.js

import { 
  collection, 
  doc, 
  updateDoc, 
  getDoc, 
  getDocs, 
  query, 
  where,
  orderBy,
  serverTimestamp,
  setDoc,
  deleteField,
  addDoc,
  deleteDoc,
  Timestamp
} from 'firebase/firestore';
import { db, storage } from '../firebase/config';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { 
  COLLECTIONS, 
  TRANSACTION_TYPES, 
  FIREBASE_LIMITS 
} from './config/constants.js';
import { 
  validateId, 
  validateBatchUpdateData,
  validateIdList,
  ValidationError 
} from './utils/validators.js';
import { 
  formatQuantityPrecision,
  convertTimestampToDate,
  isDefaultDate 
} from './utils/formatters.js';
import { preciseAdd } from '../../utils/calculations';
import { FirebaseQueryBuilder } from './config/firebaseQueries.js';

/**
 * Usługa zarządzania partiami magazynowymi
 * 
 * Ten moduł zawiera wszystkie funkcje związane z zarządzaniem partiami:
 * - Pobieranie partii dla pozycji magazynowych
 * - Zarządzanie partiami wygasającymi i przeterminowanymi
 * - Historia partii
 * - Aktualizacja partii
 * - Zarządzanie rezerwacjami partii
 * - Optymalizowane operacje grupowe
 */

/**
 * Pobiera partie dla danej pozycji magazynowej
 * @param {string} itemId - ID pozycji magazynowej
 * @param {string|null} warehouseId - ID magazynu (opcjonalnie)
 * @returns {Promise<Array>} - Lista partii
 * @throws {ValidationError} - Gdy ID jest nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas pobierania
 */
export const getItemBatches = async (itemId, warehouseId = null) => {
  try {
    // Walidacja ID pozycji
    const validatedItemId = validateId(itemId, 'itemId');
    
    // Walidacja ID magazynu jeśli podano
    if (warehouseId) {
      validateId(warehouseId, 'warehouseId');
    }
    
    // Utwórz zapytanie
    const q = FirebaseQueryBuilder.buildBatchesQuery(validatedItemId, warehouseId);
    
    // Wykonaj zapytanie
    const querySnapshot = await getDocs(q);
    
    // Jeśli nie znaleziono żadnych partii, zwróć pustą tablicę
    if (querySnapshot.empty) {
      console.log(`Nie znaleziono partii dla pozycji o ID ${validatedItemId}`);
      return [];
    }
    
    // Pobierz i zwróć wyniki
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas pobierania partii pozycji:', error);
    throw new Error(`Nie udało się pobrać partii: ${error.message}`);
  }
};

/**
 * Optymalizowane grupowe pobieranie partii dla wielu pozycji magazynowych
 * @param {Array<string>} itemIds - Lista ID pozycji magazynowych
 * @param {string|null} warehouseId - ID magazynu (opcjonalnie)
 * @param {boolean} excludeExhausted - Czy wykluczyć partie z ilością <= 0 (domyślnie false)
 * @returns {Promise<Object>} - Mapa partii (itemId -> lista partii)
 * @throws {ValidationError} - Gdy lista ID jest nieprawidłowa
 * @throws {Error} - Gdy wystąpi błąd podczas pobierania
 */
export const getBatchesForMultipleItems = async (itemIds, warehouseId = null, excludeExhausted = false) => {
  try {
    if (!itemIds || itemIds.length === 0) {
      return {};
    }

    // Walidacja listy ID
    const validatedIds = validateIdList(itemIds, 100); // Pozwalamy na większe listy dla partii
    
    // Walidacja ID magazynu jeśli podano
    if (warehouseId) {
      validateId(warehouseId, 'warehouseId');
    }

    console.log(`🚀 Grupowe pobieranie partii dla ${validatedIds.length} pozycji magazynowych...`);
    
    // Firebase 'in' operator obsługuje maksymalnie 10 elementów na zapytanie
    const batchSize = FIREBASE_LIMITS.BATCH_SIZE;
    const resultMap = {};
    
    // Inicjalizuj wyniki dla wszystkich itemId
    validatedIds.forEach(itemId => {
      resultMap[itemId] = [];
    });

    // Podziel itemIds na batche po 10
    for (let i = 0; i < validatedIds.length; i += batchSize) {
      const batch = validatedIds.slice(i, i + batchSize);
      
      try {
        // Utwórz zapytanie dla batcha
        const q = FirebaseQueryBuilder.buildBatchGroupQuery(batch, warehouseId);
        
        // Wykonaj zapytanie
        const querySnapshot = await getDocs(q);
        
        // Pogrupuj wyniki według itemId
        querySnapshot.docs.forEach(doc => {
          const batchData = {
            id: doc.id,
            ...doc.data()
          };
          
          const itemId = batchData.itemId;
          if (resultMap[itemId]) {
            resultMap[itemId].push(batchData);
          }
        });
        
        console.log(`✅ Pobrano partie dla batcha ${i + 1}-${Math.min(i + batchSize, validatedIds.length)} z ${validatedIds.length}`);
        
      } catch (error) {
        console.error(`Błąd podczas pobierania partii dla batcha ${i}-${i + batchSize}:`, error);
        // Kontynuuj z następnym batchem, nie przerywaj całego procesu
      }
    }
    
    const totalBatches = Object.values(resultMap).reduce((sum, batches) => sum + batches.length, 0);
    
    // Opcjonalne filtrowanie wyczerpanych partii
    if (excludeExhausted) {
      Object.keys(resultMap).forEach(itemId => {
        resultMap[itemId] = resultMap[itemId].filter(batch => 
          (batch.quantity || 0) > 0
        );
      });
      
      const filteredBatches = Object.values(resultMap).reduce((sum, batches) => sum + batches.length, 0);
      console.log(`🔍 Filtrowanie: Wykluczono ${totalBatches - filteredBatches} wyczerpanych partii, pozostało ${filteredBatches} partii`);
    }
    
    const finalBatches = Object.values(resultMap).reduce((sum, batches) => sum + batches.length, 0);
    console.log(`✅ Optymalizacja: Pobrano ${finalBatches} partii w ${Math.ceil(validatedIds.length / batchSize)} zapytaniach zamiast ${validatedIds.length} osobnych zapytań`);
    
    return resultMap;
    
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas grupowego pobierania partii:', error);
    throw new Error(`Nie udało się pobrać partii grupowo: ${error.message}`);
  }
};

/**
 * Wzbogaca dane partii o nazwy produktów, magazynów i dostawców
 * @param {Array} batches - Lista partii do wzbogacenia
 * @returns {Promise<Array>} - Wzbogacone partie
 */
const enrichBatchesWithNames = async (batches) => {
  if (!batches || batches.length === 0) {
    return batches;
  }

  try {
    // Zbierz unikalne ID produktów, magazynów i zamówień zakupowych
    const itemIds = [...new Set(batches.map(b => b.itemId).filter(Boolean))];
    const warehouseIds = [...new Set(batches.map(b => b.warehouseId).filter(Boolean))];
    const purchaseOrderIds = [...new Set(batches.map(b => 
      b.purchaseOrderDetails?.id || b.sourceDetails?.orderId
    ).filter(Boolean))];

    // Mapy dla nazw
    const itemNamesMap = {};
    const warehouseNamesMap = {};
    const purchaseOrdersMap = {};

    // Pobierz nazwy produktów
    if (itemIds.length > 0) {
      const itemPromises = itemIds.map(async (itemId) => {
        try {
          const itemDoc = await getDoc(doc(db, COLLECTIONS.INVENTORY, itemId));
          if (itemDoc.exists()) {
            const data = itemDoc.data();
            itemNamesMap[itemId] = {
              name: data.name || 'Nieznany produkt',
              unit: data.unit || 'szt.'
            };
          }
        } catch (error) {
          console.warn(`Nie można pobrać produktu ${itemId}:`, error);
        }
      });
      await Promise.all(itemPromises);
    }

    // Pobierz nazwy magazynów
    if (warehouseIds.length > 0) {
      const warehousePromises = warehouseIds.map(async (warehouseId) => {
        try {
          const warehouseDoc = await getDoc(doc(db, COLLECTIONS.WAREHOUSES, warehouseId));
          if (warehouseDoc.exists()) {
            warehouseNamesMap[warehouseId] = warehouseDoc.data().name || 'Nieznany magazyn';
          }
        } catch (error) {
          console.warn(`Nie można pobrać magazynu ${warehouseId}:`, error);
        }
      });
      await Promise.all(warehousePromises);
    }

    // Pobierz zamówienia zakupowe aby uzyskać dostawców
    if (purchaseOrderIds.length > 0) {
      const poPromises = purchaseOrderIds.map(async (poId) => {
        try {
          const poDoc = await getDoc(doc(db, 'purchaseOrders', poId));
          if (poDoc.exists()) {
            const poData = poDoc.data();
            purchaseOrdersMap[poId] = {
              supplierId: poData.supplierId,
              supplierName: poData.supplier?.name || null
            };
            
            // Jeśli nie ma nazwy dostawcy w PO, pobierz z kolekcji suppliers
            if (!purchaseOrdersMap[poId].supplierName && poData.supplierId) {
              try {
                const supplierDoc = await getDoc(doc(db, 'suppliers', poData.supplierId));
                if (supplierDoc.exists()) {
                  purchaseOrdersMap[poId].supplierName = supplierDoc.data().name || 'Nieznany dostawca';
                }
              } catch (error) {
                console.warn(`Nie można pobrać dostawcy ${poData.supplierId}:`, error);
              }
            }
          }
        } catch (error) {
          console.warn(`Nie można pobrać zamówienia ${poId}:`, error);
        }
      });
      await Promise.all(poPromises);
    }

    // Wzbogać partie o nazwy
    return batches.map(batch => {
      const itemInfo = itemNamesMap[batch.itemId] || { name: 'Nieznany produkt', unit: 'szt.' };
      const poId = batch.purchaseOrderDetails?.id || batch.sourceDetails?.orderId;
      const poInfo = poId ? purchaseOrdersMap[poId] : null;
      
      return {
        ...batch,
        itemName: batch.itemName || itemInfo.name,
        unit: batch.unit || itemInfo.unit,
        warehouseName: batch.warehouseName || warehouseNamesMap[batch.warehouseId] || null,
        supplierName: batch.supplierName || poInfo?.supplierName || null
      };
    });
  } catch (error) {
    console.error('Błąd podczas wzbogacania danych partii:', error);
    // W przypadku błędu zwróć oryginalne partie
    return batches;
  }
};

/**
 * Pobiera partie z krótkim terminem ważności (wygasające w ciągu określonej liczby dni)
 * @param {number} daysThreshold - Liczba dni do wygaśnięcia (domyślnie 365)
 * @param {string|null} warehouseId - ID magazynu (opcjonalnie)
 * @returns {Promise<Array>} - Lista wygasających partii
 * @throws {Error} - Gdy wystąpi błąd podczas pobierania
 */
export const getExpiringBatches = async (daysThreshold = 365, warehouseId = null) => {
  try {
    // Walidacja parametrów
    if (typeof daysThreshold !== 'number' || daysThreshold < 0) {
      throw new ValidationError('Liczba dni musi być liczbą nieujemną', 'daysThreshold');
    }
    
    if (warehouseId) {
      validateId(warehouseId, 'warehouseId');
    }

    // Oblicz datę graniczną (dzisiaj + daysThreshold dni)
    const today = new Date();
    const thresholdDate = new Date();
    thresholdDate.setDate(today.getDate() + daysThreshold);
    
    // Utwórz zapytanie
    const q = FirebaseQueryBuilder.buildExpiringBatchesQuery(daysThreshold);
    
    const querySnapshot = await getDocs(q);
    let batches = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Filtruj po magazynie jeśli podano
    if (warehouseId) {
      batches = batches.filter(batch => batch.warehouseId === warehouseId);
    }
    
    // Filtruj po stronie klienta dla pewności
    batches = batches.filter(batch => {
      if (!batch.expiryDate) return false;
      
      const expiryDate = convertTimestampToDate(batch.expiryDate);
      if (!expiryDate) return false;
      
      // Sprawdź czy to domyślna data (1.01.1970)
      return !isDefaultDate(expiryDate);
    });

    // Wzbogać dane partii o nazwy produktów, magazynów i dostawców
    const enrichedBatches = await enrichBatchesWithNames(batches);
    
    return enrichedBatches;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas pobierania wygasających partii:', error);
    throw new Error(`Nie udało się pobrać wygasających partii: ${error.message}`);
  }
};

/**
 * Pobiera przeterminowane partie
 * @param {string|null} warehouseId - ID magazynu (opcjonalnie)
 * @returns {Promise<Array>} - Lista przeterminowanych partii
 * @throws {Error} - Gdy wystąpi błąd podczas pobierania
 */
export const getExpiredBatches = async (warehouseId = null) => {
  try {
    if (warehouseId) {
      validateId(warehouseId, 'warehouseId');
    }

    // Utwórz zapytanie
    const q = FirebaseQueryBuilder.buildExpiredBatchesQuery();
    
    const querySnapshot = await getDocs(q);
    let batches = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Filtruj po magazynie jeśli podano
    if (warehouseId) {
      batches = batches.filter(batch => batch.warehouseId === warehouseId);
    }
    
    // Filtruj po stronie klienta dla pewności
    batches = batches.filter(batch => {
      if (!batch.expiryDate) return false;
      
      const expiryDate = convertTimestampToDate(batch.expiryDate);
      if (!expiryDate) return false;
      
      // Sprawdź czy to domyślna data (1.01.1970)
      return !isDefaultDate(expiryDate);
    });

    // Wzbogać dane partii o nazwy produktów, magazynów i dostawców
    const enrichedBatches = await enrichBatchesWithNames(batches);
    
    return enrichedBatches;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas pobierania przeterminowanych partii:', error);
    throw new Error(`Nie udało się pobrać przeterminowanych partii: ${error.message}`);
  }
};

/**
 * Pobiera historię partii dla danej pozycji magazynowej
 * @param {string} itemId - ID pozycji magazynowej
 * @returns {Promise<Array>} - Lista partii z historią
 * @throws {ValidationError} - Gdy ID jest nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas pobierania
 */
export const getItemBatchHistory = async (itemId) => {
  try {
    // Walidacja ID pozycji
    const validatedItemId = validateId(itemId, 'itemId');
    
    const batchesRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_BATCHES);
    const q = query(
      batchesRef,
      where('itemId', '==', validatedItemId),
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: convertTimestampToDate(doc.data().createdAt) || new Date(),
      expiryDate: convertTimestampToDate(doc.data().expiryDate) || null
    }));
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas pobierania historii partii:', error);
    throw new Error(`Nie udało się pobrać historii partii: ${error.message}`);
  }
};

/**
 * Aktualizuje dane partii
 * @param {string} batchId - ID partii do aktualizacji
 * @param {Object} batchData - Nowe dane partii
 * @param {string} userId - ID użytkownika aktualizującego partię
 * @returns {Promise<Object>} - Zaktualizowana partia
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy partia nie istnieje lub wystąpi błąd
 */
export const updateBatch = async (batchId, batchData, userId) => {
  try {
    // Walidacja ID
    const validatedBatchId = validateId(batchId, 'batchId');
    const validatedUserId = validateId(userId, 'userId');
    
    // Walidacja danych partii (opcjonalne pola przy aktualizacji)
    const validatedData = validateBatchUpdateData(batchData);
    
    const batchRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY_BATCHES, validatedBatchId);
    
    // Pobierz aktualne dane partii
    const batchDoc = await getDoc(batchRef);
    if (!batchDoc.exists()) {
      throw new Error('Partia nie istnieje');
    }
    
    const currentBatch = batchDoc.data();
    const itemId = currentBatch.itemId;
    
    // Sprawdź, czy zmieniono ilość
    const quantityChanged = validatedData.quantity !== undefined && 
      currentBatch.quantity !== validatedData.quantity;
    
    // Przygotuj dane do aktualizacji
    const updateData = {
      ...validatedData,
      updatedAt: serverTimestamp(),
      updatedBy: validatedUserId
    };
    
    // Obsługa daty ważności
    if (batchData.noExpiryDate === true || batchData.expiryDate === null) {
      // Jeśli zaznaczono "brak terminu ważności" lub explicite ustawiono na null
      updateData.expiryDate = deleteField();
    } else if (validatedData.expiryDate && validatedData.expiryDate instanceof Date) {
      updateData.expiryDate = Timestamp.fromDate(validatedData.expiryDate);
    }
    
    // Formatuj ilość z precyzją
    if (validatedData.quantity !== undefined) {
      updateData.quantity = formatQuantityPrecision(validatedData.quantity);
    }
    
    // Aktualizuj partię
    await updateDoc(batchRef, updateData);
    
    // ✅ Sprawdź czy zmieniono cenę - jeśli tak, wyślij event do _systemEvents
    // Dzięki temu Cloud Function onBatchPriceUpdate zaktualizuje koszty w MO
    const priceChanged = validatedData.unitPrice !== undefined && 
      currentBatch.unitPrice !== validatedData.unitPrice;
    
    if (priceChanged) {
      try {
        console.log(`[BATCH_PRICE_CHANGE] Wykryto zmianę ceny partii ${validatedBatchId}: ${currentBatch.unitPrice} → ${validatedData.unitPrice}`);
        
        // Wyślij event do _systemEvents dla Cloud Function
        const systemEventsRef = collection(db, '_systemEvents');
        await addDoc(systemEventsRef, {
          type: 'batchPriceUpdate',
          batchIds: [validatedBatchId],
          sourceType: 'manualBatchEdit',
          sourceId: validatedBatchId,
          userId: validatedUserId,
          timestamp: serverTimestamp(),
          processed: false,
          details: {
            oldPrice: currentBatch.unitPrice || 0,
            newPrice: validatedData.unitPrice,
            batchNumber: currentBatch.batchNumber || currentBatch.lotNumber || validatedBatchId
          }
        });
        
        console.log(`[BATCH_PRICE_CHANGE] Wysłano event batchPriceUpdate do _systemEvents dla partii ${validatedBatchId}`);
        
        // ✅ Wyślij BroadcastChannel aby natychmiast powiadomić otwarte zakładki
        // (zanim Cloud Function przetworzy event)
        if (typeof BroadcastChannel !== 'undefined') {
          const channel = new BroadcastChannel('production-costs-update');
          channel.postMessage({
            type: 'BATCH_COSTS_UPDATED',
            batchIds: [validatedBatchId],
            timestamp: new Date().toISOString(),
            source: 'manual-batch-edit',
            details: {
              oldPrice: currentBatch.unitPrice || 0,
              newPrice: validatedData.unitPrice
            }
          });
          channel.close();
          console.log(`[BATCH_PRICE_CHANGE] Wysłano BroadcastChannel powiadomienie o zmianie ceny partii ${validatedBatchId}`);
        }
      } catch (eventError) {
        // Nie przerywaj operacji - aktualizacja partii jest ważniejsza
        console.error('[BATCH_PRICE_CHANGE] Błąd podczas wysyłania eventu batchPriceUpdate:', eventError);
      }
    }
    
    // Jeśli zmieniono ilość, zaktualizuj główną pozycję magazynową
    if (quantityChanged && itemId) {
      // Dodaj wpis w historii transakcji
      if (currentBatch.quantity !== validatedData.quantity) {
        const transactionType = currentBatch.quantity < validatedData.quantity 
          ? TRANSACTION_TYPES.ADJUSTMENT_ADD 
          : TRANSACTION_TYPES.ADJUSTMENT_REMOVE;
        const qtyDiff = Math.abs(currentBatch.quantity - validatedData.quantity);
        
        const transactionRef = doc(
          FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_TRANSACTIONS)
        );
        await setDoc(transactionRef, {
          itemId,
          itemName: currentBatch.itemName,
          type: transactionType,
          quantity: formatQuantityPrecision(qtyDiff),
          date: serverTimestamp(),
          reason: 'Korekta ilości partii',
          reference: `Partia: ${currentBatch.batchNumber || currentBatch.lotNumber || validatedBatchId}`,
          notes: `Ręczna korekta ilości partii z ${currentBatch.quantity} na ${validatedData.quantity}`,
          batchId: validatedBatchId,
          batchNumber: currentBatch.batchNumber || currentBatch.lotNumber || 'Bez numeru',
          createdBy: validatedUserId,
          createdAt: serverTimestamp()
        });
      }
      
      // Przelicz ilość całkowitą w pozycji magazynowej
      // Import funkcji z głównego inventoryService
      try {
        const { recalculateItemQuantity } = await import('../inventory');
        await recalculateItemQuantity(itemId);
      } catch (error) {
        console.error('Błąd podczas przeliczania ilości pozycji:', error);
        // Nie przerywaj operacji - aktualizacja partii jest ważniejsza
      }
    }
    
    // Emituj zdarzenie o zmianie stanu magazynu (aby odświeżyć widok szczegółów)
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('inventory-updated', { 
        detail: { itemId, action: 'batch-update', batchId: validatedBatchId }
      });
      window.dispatchEvent(event);
    }
    
    return {
      id: validatedBatchId,
      ...currentBatch,
      ...updateData
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas aktualizacji partii:', error);
    throw new Error(`Nie udało się zaktualizować partii: ${error.message}`);
  }
};

/**
 * Pobiera informacje o rezerwacjach dla konkretnej partii
 * @param {string} batchId - ID partii
 * @returns {Promise<Array>} - Lista rezerwacji
 * @throws {ValidationError} - Gdy ID jest nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas pobierania
 */
export const getBatchReservations = async (batchId) => {
  try {
    if (!batchId) {
      return [];
    }
    
    // Walidacja ID partii
    const validatedBatchId = validateId(batchId, 'batchId');
    
    // Pobierz transakcje z typem 'booking' dla danej partii
    const bookingQuery = FirebaseQueryBuilder.buildBatchReservationsQuery(
      validatedBatchId, 
      TRANSACTION_TYPES.BOOKING
    );
    
    const querySnapshot = await getDocs(bookingQuery);
    let reservations = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Uwzględnij anulowania rezerwacji (booking_cancel)
    const cancelQuery = FirebaseQueryBuilder.buildBookingCancellationQuery(validatedBatchId);
    
    const cancelSnapshot = await getDocs(cancelQuery);
    const cancellations = cancelSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Dla każdej anulowanej rezerwacji, odejmij ją od odpowiedniej rezerwacji
    // Grupujemy anulowania po taskId
    const cancellationsByTask = {};
    cancellations.forEach(cancel => {
      const taskId = cancel.taskId || cancel.referenceId;
      if (!taskId) return;
      
      if (!cancellationsByTask[taskId]) {
        cancellationsByTask[taskId] = 0;
      }
      cancellationsByTask[taskId] = preciseAdd(cancellationsByTask[taskId], cancel.quantity || 0);
    });
    
    // Modyfikujemy rezerwacje o anulowania
    reservations = reservations.map(reservation => {
      const taskId = reservation.taskId || reservation.referenceId;
      if (!taskId) return reservation;
      
      const cancelledQuantity = cancellationsByTask[taskId] || 0;
      return {
        ...reservation,
        quantity: Math.max(0, (reservation.quantity || 0) - cancelledQuantity)
      };
    });
    
    // Usuń rezerwacje o ilości 0
    reservations = reservations.filter(reservation => (reservation.quantity || 0) > 0);
    
    return reservations;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas pobierania rezerwacji partii:', error);
    return []; // Zwracamy pustą tablicę zamiast rzucać błąd
  }
};

/**
 * Optymalizowane grupowe pobieranie rezerwacji dla wielu partii
 * @param {Array<string>} batchIds - Lista ID partii
 * @returns {Promise<Object>} - Mapa rezerwacji (batchId -> lista rezerwacji)
 * @throws {ValidationError} - Gdy lista ID jest nieprawidłowa
 * @throws {Error} - Gdy wystąpi błąd podczas pobierania
 */
export const getReservationsForMultipleBatches = async (batchIds) => {
  try {
    if (!batchIds || batchIds.length === 0) {
      return {};
    }

    // Walidacja listy ID
    const validatedIds = validateIdList(batchIds, 100); // Pozwalamy na większe listy
    
    console.log(`🚀 Grupowe pobieranie rezerwacji dla ${validatedIds.length} partii...`);
    
    // Firebase 'in' operator obsługuje maksymalnie 10 elementów na zapytanie
    const batchSize = FIREBASE_LIMITS.BATCH_SIZE;
    const resultMap = {};
    
    // Inicjalizuj wyniki dla wszystkich batchId
    validatedIds.forEach(batchId => {
      resultMap[batchId] = [];
    });

    // Podziel batchIds na batche po 10
    for (let i = 0; i < validatedIds.length; i += batchSize) {
      const batch = validatedIds.slice(i, i + batchSize);
      
      try {
        // Pobierz rezerwacje (booking) i anulowania (booking_cancel) równolegle
        const [bookingQuery, cancelQuery] = [
          FirebaseQueryBuilder.buildReservationGroupQuery(batch, TRANSACTION_TYPES.BOOKING),
          FirebaseQueryBuilder.buildReservationGroupQuery(batch, TRANSACTION_TYPES.BOOKING_CANCEL)
        ];
        
        // Wykonaj oba zapytania równolegle
        const [bookingSnapshot, cancelSnapshot] = await Promise.all([
          getDocs(bookingQuery),
          getDocs(cancelQuery)
        ]);
        
        // Przygotuj mapę rezerwacji
        const reservationsMap = {};
        
        // Dodaj rezerwacje
        bookingSnapshot.docs.forEach(doc => {
          const reservation = {
            id: doc.id,
            ...doc.data()
          };
          
          const batchId = reservation.batchId;
          if (!reservationsMap[batchId]) {
            reservationsMap[batchId] = [];
          }
          reservationsMap[batchId].push(reservation);
        });
        
        // Przygotuj mapę anulowań według taskId
        const cancellationsByTaskAndBatch = {};
        cancelSnapshot.docs.forEach(doc => {
          const cancellation = doc.data();
          const taskId = cancellation.taskId || cancellation.referenceId;
          const batchId = cancellation.batchId;
          
          if (!taskId || !batchId) return;
          
          const key = `${taskId}_${batchId}`;
          if (!cancellationsByTaskAndBatch[key]) {
            cancellationsByTaskAndBatch[key] = 0;
          }
          cancellationsByTaskAndBatch[key] = preciseAdd(cancellationsByTaskAndBatch[key], cancellation.quantity || 0);
        });
        
        // Aplikuj anulowania do rezerwacji i przenieś do resultMap
        Object.entries(reservationsMap).forEach(([batchId, reservations]) => {
          const processedReservations = reservations.map(reservation => {
            const taskId = reservation.taskId || reservation.referenceId;
            if (!taskId) return reservation;
            
            const key = `${taskId}_${batchId}`;
            const cancelledQuantity = cancellationsByTaskAndBatch[key] || 0;
            
            return {
              ...reservation,
              quantity: Math.max(0, (reservation.quantity || 0) - cancelledQuantity)
            };
          }).filter(reservation => (reservation.quantity || 0) > 0); // Usuń rezerwacje o ilości 0
          
          resultMap[batchId] = processedReservations;
        });
        
        console.log(`✅ Pobrano rezerwacje dla batcha ${i + 1}-${Math.min(i + batchSize, validatedIds.length)} z ${validatedIds.length}`);
        
      } catch (error) {
        console.error(`Błąd podczas pobierania rezerwacji dla batcha ${i}-${i + batchSize}:`, error);
        // Kontynuuj z następnym batchem, nie przerywaj całego procesu
      }
    }
    
    const totalReservations = Object.values(resultMap).reduce((sum, reservations) => sum + reservations.length, 0);
    console.log(`✅ Optymalizacja: Pobrano ${totalReservations} rezerwacji w ${Math.ceil(validatedIds.length / batchSize) * 2} zapytaniach zamiast ${validatedIds.length * 2} osobnych zapytań`);
    
    return resultMap;
    
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas grupowego pobierania rezerwacji:', error);
    throw new Error(`Nie udało się pobrać rezerwacji grupowo: ${error.message}`);
  }
};

/**
 * Pobiera partie z określonymi filtrami
 * @param {Object} filters - Filtry zapytania
 * @param {string} [filters.itemId] - ID pozycji magazynowej
 * @param {string} [filters.warehouseId] - ID magazynu
 * @param {number} [filters.minQuantity] - Minimalna ilość
 * @param {Date} [filters.expiryDateFrom] - Data ważności od
 * @param {Date} [filters.expiryDateTo] - Data ważności do
 * @param {Object} [orderBy] - Sortowanie
 * @param {string} [orderBy.field] - Pole sortowania
 * @param {string} [orderBy.direction] - Kierunek sortowania
 * @param {number} [limit] - Limit wyników
 * @returns {Promise<Array>} - Lista partii spełniających kryteria
 * @throws {ValidationError} - Gdy filtry są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas pobierania
 */
export const getBatchesWithFilters = async (filters = {}, orderBy = null, limit = null) => {
  try {
    // Walidacja filtrów
    if (filters.itemId) {
      validateId(filters.itemId, 'itemId');
    }
    
    if (filters.warehouseId) {
      validateId(filters.warehouseId, 'warehouseId');
    }
    
    if (filters.minQuantity !== undefined) {
      if (typeof filters.minQuantity !== 'number' || filters.minQuantity < 0) {
        throw new ValidationError('Minimalna ilość musi być liczbą nieujemną', 'minQuantity');
      }
    }
    
    // Utwórz zapytanie z filtrami
    const q = FirebaseQueryBuilder.buildBatchesWithFiltersQuery({
      ...filters,
      orderBy
    });
    
    // Wykonaj zapytanie
    const querySnapshot = await getDocs(q);
    let batches = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Zastosuj dodatkowe filtry po stronie klienta
    if (filters.expiryDateFrom || filters.expiryDateTo) {
      batches = batches.filter(batch => {
        if (!batch.expiryDate) return false;
        
        const expiryDate = convertTimestampToDate(batch.expiryDate);
        if (!expiryDate || isDefaultDate(expiryDate)) return false;
        
        if (filters.expiryDateFrom && expiryDate < filters.expiryDateFrom) return false;
        if (filters.expiryDateTo && expiryDate > filters.expiryDateTo) return false;
        
        return true;
      });
    }
    
    // Zastosuj limit jeśli podano
    if (limit && typeof limit === 'number' && limit > 0) {
      batches = batches.slice(0, limit);
    }
    
    return batches;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas pobierania partii z filtrami:', error);
    throw new Error(`Nie udało się pobrać partii z filtrami: ${error.message}`);
  }
};

/**
 * Pobiera szczegóły partii po ID
 * @param {string} batchId - ID partii
 * @param {boolean} includeReservations - Czy dołączyć informacje o rezerwacjach
 * @returns {Promise<Object|null>} - Szczegóły partii lub null
 * @throws {ValidationError} - Gdy ID jest nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas pobierania
 */
export const getBatchById = async (batchId, includeReservations = false) => {
  try {
    // Walidacja ID
    const validatedBatchId = validateId(batchId, 'batchId');
    
    const batchRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY_BATCHES, validatedBatchId);
    const batchDoc = await getDoc(batchRef);
    
    if (!batchDoc.exists()) {
      return null;
    }
    
    const batch = {
      id: batchDoc.id,
      ...batchDoc.data(),
      createdAt: convertTimestampToDate(batchDoc.data().createdAt),
      expiryDate: convertTimestampToDate(batchDoc.data().expiryDate)
    };
    
    // Dołącz informacje o rezerwacjach jeśli wymagane
    if (includeReservations) {
      batch.reservations = await getBatchReservations(validatedBatchId);
      batch.reservedQuantity = batch.reservations.reduce((sum, res) => sum + (res.quantity || 0), 0);
      batch.availableQuantity = Math.max(0, (batch.quantity || 0) - batch.reservedQuantity);
    }
    
    return batch;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas pobierania szczegółów partii:', error);
    throw new Error(`Nie udało się pobrać szczegółów partii: ${error.message}`);
  }
};

// ===== ZARZĄDZANIE CERTYFIKATAMI PARTII =====

/**
 * Przesyła certyfikat partii do Firebase Storage
 * @param {File} file - Plik certyfikatu
 * @param {string} batchId - ID partii
 * @param {string} userId - ID użytkownika przesyłającego certyfikat
 * @returns {Promise<string>} - URL do przesłanego certyfikatu
 * @throws {ValidationError} - Gdy parametry są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas przesyłania
 */
export const uploadBatchCertificate = async (file, batchId, userId) => {
  try {
    // Walidacja parametrów
    if (!file || !batchId) {
      throw new ValidationError('Brak pliku lub ID partii', 'file_batchId');
    }

    const validatedBatchId = validateId(batchId, 'batchId');
    const validatedUserId = validateId(userId, 'userId');

    // Sprawdź rozmiar pliku
    const fileSizeInMB = file.size / (1024 * 1024);
    
    // Sprawdzenie rozmiaru pliku (można ustawić inny limit dla Storage)
    if (fileSizeInMB > 5) {
      throw new ValidationError(`Plik jest zbyt duży (${fileSizeInMB.toFixed(2)} MB). Maksymalny rozmiar to 5 MB.`, 'fileSize');
    }

    // Sprawdź czy partia istnieje
    const batchRef = doc(db, COLLECTIONS.INVENTORY_BATCHES, validatedBatchId);
    const batchDoc = await getDoc(batchRef);
    
    if (!batchDoc.exists()) {
      throw new ValidationError('Partia nie istnieje', 'batchId');
    }
    
    // Tworzymy ścieżkę do pliku w Firebase Storage
    const timestamp = new Date().getTime();
    const fileExtension = file.name.split('.').pop();
    const fileName = `${timestamp}_${validatedBatchId}.${fileExtension}`;
    const storagePath = `certificates/${validatedBatchId}/${fileName}`;
    
    // Tworzymy referencję do pliku w Storage
    const fileRef = storageRef(storage, storagePath);
    
    // Przesyłamy plik do Firebase Storage
    await uploadBytes(fileRef, file);
    
    // Pobieramy URL do pobrania pliku
    const downloadURL = await getDownloadURL(fileRef);
    
    // Aktualizacja dokumentu partii o informacje o certyfikacie
    await updateDoc(batchRef, {
      certificateFileName: file.name,
      certificateContentType: file.type,
      certificateStoragePath: storagePath,
      certificateDownloadURL: downloadURL,
      certificateUploadedAt: serverTimestamp(),
      certificateUploadedBy: validatedUserId,
      updatedAt: serverTimestamp(),
      updatedBy: validatedUserId
    });
    
    console.log(`✅ Przesłano certyfikat partii ${validatedBatchId}: ${file.name}`);
    return downloadURL;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas przesyłania certyfikatu partii:', error);
    throw new Error('Błąd podczas przesyłania certyfikatu: ' + error.message);
  }
};

/**
 * Usuwa certyfikat partii z Firebase Storage i bazy danych
 * @param {string} batchId - ID partii
 * @param {string} userId - ID użytkownika usuwającego certyfikat
 * @returns {Promise<boolean>} - Wynik operacji
 * @throws {ValidationError} - Gdy parametry są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas usuwania
 */
export const deleteBatchCertificate = async (batchId, userId) => {
  try {
    // Walidacja parametrów
    const validatedBatchId = validateId(batchId, 'batchId');
    const validatedUserId = validateId(userId, 'userId');
    
    // Pobierz aktualne dane partii
    const batchRef = doc(db, COLLECTIONS.INVENTORY_BATCHES, validatedBatchId);
    const batchDoc = await getDoc(batchRef);
    
    if (!batchDoc.exists()) {
      throw new ValidationError('Partia nie istnieje', 'batchId');
    }
    
    const batchData = batchDoc.data();
    
    // Sprawdź czy partia ma certyfikat
    if (!batchData.certificateStoragePath && !batchData.certificateFileName) {
      throw new ValidationError('Partia nie ma przypisanego certyfikatu', 'certificate');
    }
    
    // Jeśli istnieje ścieżka do pliku w Storage, usuń plik
    if (batchData.certificateStoragePath) {
      const fileRef = storageRef(storage, batchData.certificateStoragePath);
      try {
        await deleteObject(fileRef);
        console.log(`🗑️ Usunięto plik certyfikatu z Storage: ${batchData.certificateStoragePath}`);
      } catch (storageError) {
        console.warn('Nie można usunąć pliku z Storage:', storageError);
        // Kontynuujemy mimo błędu usuwania z Storage
      }
    }
    
    // Aktualizuj dokument partii - usuń informacje o certyfikacie
    await updateDoc(batchRef, {
      certificateFileName: deleteField(),
      certificateContentType: deleteField(),
      certificateStoragePath: deleteField(),
      certificateDownloadURL: deleteField(),
      certificateBase64: deleteField(), // Usuwamy też stare pole base64, jeśli istnieje
      certificateUploadedAt: deleteField(),
      certificateUploadedBy: deleteField(),
      updatedAt: serverTimestamp(),
      updatedBy: validatedUserId
    });
    
    console.log(`✅ Usunięto certyfikat z partii ${validatedBatchId}`);
    return true;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas usuwania certyfikatu partii:', error);
    throw new Error('Błąd podczas usuwania certyfikatu: ' + error.message);
  }
};

/**
 * Pobiera wiele partii po ich ID w grupowych zapytaniach (zamiast N osobnych getDoc).
 * @param {Array<string>} batchIds - Lista ID partii do pobrania
 * @returns {Promise<Map<string, Object>>} Mapa batchId -> batchData
 */
export const getBatchesByIds = async (batchIds) => {
  const resultMap = new Map();
  if (!batchIds || batchIds.length === 0) return resultMap;

  const uniqueIds = [...new Set(batchIds.filter(Boolean))];
  const batchSize = FIREBASE_LIMITS.BATCH_SIZE;

  for (let i = 0; i < uniqueIds.length; i += batchSize) {
    const chunk = uniqueIds.slice(i, i + batchSize);
    try {
      const q = query(
        collection(db, COLLECTIONS.INVENTORY_BATCHES),
        where('__name__', 'in', chunk)
      );
      const snapshot = await getDocs(q);
      snapshot.forEach(docSnap => {
        resultMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
      });
    } catch (error) {
      console.error(`Błąd podczas grupowego pobierania partii (batch ${i}-${i + batchSize}):`, error);
    }
  }

  return resultMap;
};

/**
 * Pobiera pojedynczą partię z magazynu
 * @param {string} batchId - ID partii
 * @returns {Promise<Object|null>} - Dane partii lub null jeśli nie istnieje
 */
export const getInventoryBatch = async (batchId) => {
  try {
    const validatedBatchId = validateId(batchId, 'batchId');

    const batchRef = doc(db, COLLECTIONS.INVENTORY_BATCHES, validatedBatchId);
    const batchSnapshot = await getDoc(batchRef);

    if (!batchSnapshot.exists()) {
      // 🔴 DIAGNOSTYKA: Partia nie istnieje
      console.warn(`🔴 [getInventoryBatch] Partia ${batchId} NIE ISTNIEJE w bazie danych!`);
      return null;
    }

    const batchData = batchSnapshot.data();
    
    // 🔴 DIAGNOSTYKA: Sprawdź czy partia ma cenę
    if (batchData.unitPrice === undefined || batchData.unitPrice === null) {
      console.warn(`🔴 [getInventoryBatch] Partia ${batchId} istnieje, ale BEZ CENY:`, {
        batchNumber: batchData.batchNumber,
        itemId: batchData.itemId,
        quantity: batchData.quantity,
        unitPrice: batchData.unitPrice,
        pricePerUnit: batchData.pricePerUnit,
        allKeys: Object.keys(batchData)
      });
    }

    return {
      id: batchSnapshot.id,
      ...batchData
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error(`Błąd podczas pobierania partii o ID ${batchId}:`, error);
    throw new Error(`Nie udało się pobrać partii: ${error.message}`);
  }
};

/**
 * Sprawdza czy pozycja w zamówieniu zakupowym ma już przypisaną partię
 * @param {string} itemId - ID pozycji magazynowej
 * @param {string} orderId - ID zamówienia zakupowego  
 * @param {string} itemPOId - ID pozycji w zamówieniu
 * @param {string} warehouseId - ID magazynu
 * @returns {Promise<Object|null>} - Zwraca partię jeśli istnieje, lub null
 */
export const getExistingBatchForPOItem = async (itemId, orderId, itemPOId, warehouseId) => {
  try {
    if (!itemId || !orderId || !itemPOId || !warehouseId) {
      return null;
    }

    const validatedItemId = validateId(itemId, 'itemId');
    const validatedOrderId = validateId(orderId, 'orderId');
    const validatedItemPOId = validateId(itemPOId, 'itemPOId');
    const validatedWarehouseId = validateId(warehouseId, 'warehouseId');

    console.log(`Sprawdzanie istniejącej partii dla: itemId=${validatedItemId}, orderId=${validatedOrderId}, itemPOId=${validatedItemPOId}, warehouseId=${validatedWarehouseId}`);

    // Sprawdź w nowym formacie danych
    const newFormatQuery = query(
      collection(db, COLLECTIONS.INVENTORY_BATCHES),
      where('itemId', '==', validatedItemId),
      where('purchaseOrderDetails.id', '==', validatedOrderId),
      where('purchaseOrderDetails.itemPoId', '==', validatedItemPOId),
      where('warehouseId', '==', validatedWarehouseId)
    );

    const newFormatSnapshot = await getDocs(newFormatQuery);
    if (!newFormatSnapshot.empty) {
      const batch = newFormatSnapshot.docs[0];
      return { id: batch.id, ...batch.data() };
    }

    // Sprawdź w starszym formacie danych
    const oldFormatQuery = query(
      collection(db, COLLECTIONS.INVENTORY_BATCHES),
      where('itemId', '==', validatedItemId),
      where('sourceDetails.orderId', '==', validatedOrderId),
      where('sourceDetails.itemPoId', '==', validatedItemPOId),
      where('warehouseId', '==', validatedWarehouseId)
    );

    const oldFormatSnapshot = await getDocs(oldFormatQuery);
    if (!oldFormatSnapshot.empty) {
      const batch = oldFormatSnapshot.docs[0];
      return { id: batch.id, ...batch.data() };
    }

    return null;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error(`Błąd podczas sprawdzania istniejącej partii:`, error);
    return null;
  }
};

/**
 * Pobiera wszystkie partie (LOTy) powiązane z danym zamówieniem zakupowym (PO)
 * @param {string} purchaseOrderId - ID zamówienia zakupowego
 * @returns {Promise<Array>} - Lista partii materiałów powiązanych z zamówieniem
 */
export const getBatchesByPurchaseOrderId = async (purchaseOrderId) => {
  try {
    const validatedOrderId = validateId(purchaseOrderId, 'purchaseOrderId');
    
    // Przygotuj kwerendę - szukaj partii, które mają powiązanie z danym PO
    const q1 = query(
      collection(db, COLLECTIONS.INVENTORY_BATCHES),
      where('purchaseOrderDetails.id', '==', validatedOrderId)
    );
    
    // Wykonaj zapytanie
    const querySnapshot1 = await getDocs(q1);
    let batches = querySnapshot1.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Sprawdź również w starszym formacie danych (dla kompatybilności)
    if (batches.length === 0) {
      const q2 = query(
        collection(db, COLLECTIONS.INVENTORY_BATCHES),
        where('sourceDetails.orderId', '==', validatedOrderId)
      );
      
      const querySnapshot2 = await getDocs(q2);
      batches = querySnapshot2.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    }
    
    // Posortuj partie według daty przyjęcia (od najnowszej)
    batches.sort((a, b) => {
      const dateA = a.receivedDate ? (a.receivedDate.toDate ? a.receivedDate.toDate() : new Date(a.receivedDate)) : new Date(0);
      const dateB = b.receivedDate ? (b.receivedDate.toDate ? b.receivedDate.toDate() : new Date(b.receivedDate)) : new Date(0);
      return dateB - dateA;
    });
    
    return batches;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error(`Błąd podczas pobierania partii dla zamówienia ${purchaseOrderId}:`, error);
    throw new Error(`Nie udało się pobrać partii dla zamówienia: ${error.message}`);
  }
};

/**
 * Usuwa partię z systemu, sprawdzając wcześniej, czy nie jest używana w MO/PO
 * @param {string} batchId - ID partii do usunięcia
 * @param {Object|string} userData - Dane użytkownika wykonującego operację (obiekt lub string z userId)
 * @returns {Promise<Object>} - Wynik operacji
 */
export const deleteBatch = async (batchId, userData) => {
  console.log('===== DELETEBATCH: DIAGNOSTYKA DANYCH UŻYTKOWNIKA =====');
  console.log('deleteBatch - przekazane userData:', userData);
  
  // Obsługa zarówno obiektu userData jak i string userId
  let userId = '';
  let userName = 'Nieznany użytkownik';
  
  if (typeof userData === 'string') {
    userId = userData || 'unknown';
    console.log('deleteBatch - userData jako string, userId:', userId);
  } else if (userData && typeof userData === 'object') {
    userId = (userData.userId || 'unknown').toString();
    userName = userData.userName || 'Nieznany użytkownik';
    console.log('deleteBatch - userData jako obiekt, userId:', userId, 'userName:', userName);
  } else {
    userId = 'unknown';
    console.log('deleteBatch - userData nieprawidłowe, używam unknown');
  }
  
  try {
    const validatedBatchId = validateId(batchId, 'batchId');
    
    // Pobierz dane partii
    const batchRef = doc(db, COLLECTIONS.INVENTORY_BATCHES, validatedBatchId);
    const batchDoc = await getDoc(batchRef);
    
    if (!batchDoc.exists()) {
      throw new ValidationError('Partia nie istnieje');
    }
    
    const batchData = batchDoc.data();
    const itemId = batchData.itemId;
    const quantity = batchData.quantity || 0;
    const lotNumber = batchData.lotNumber || validatedBatchId;
    
    // Sprawdź, czy partia ma aktywne rezerwacje
    const reservationsRef = collection(db, COLLECTIONS.INVENTORY_TRANSACTIONS);
    const reservationsQuery = query(
      reservationsRef,
      where('batchId', '==', validatedBatchId),
      where('type', '==', TRANSACTION_TYPES.BOOKING)
    );
    
    const reservationsSnapshot = await getDocs(reservationsQuery);
    if (!reservationsSnapshot.empty) {
      const reservationDetails = reservationsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          quantity: data.quantity,
          taskId: data.referenceId || data.taskId,
          itemId: data.itemId
        };
      });
      
      return {
        success: false,
        message: `Nie można usunąć partii ${lotNumber} - ma aktywne rezerwacje`,
        activeReservations: reservationDetails.length,
        reservationDetails
      };
    }

    // Jeśli partia ma ilość > 0, zaktualizuj stan magazynowy produktu
    if (quantity > 0 && itemId) {
      const itemRef = doc(db, COLLECTIONS.INVENTORY, itemId);
      const itemDoc = await getDoc(itemRef);
      
      if (itemDoc.exists()) {
        const itemData = itemDoc.data();
        const currentQuantity = itemData.quantity || 0;
        
        // Odejmij ilość partii od całkowitej ilości produktu
        await updateDoc(itemRef, {
          quantity: Math.max(0, currentQuantity - quantity),
          updatedAt: serverTimestamp(),
          updatedBy: userId
        });
      }
    }

    // Pobierz dane użytkownika tylko jeśli nie mamy nazwy użytkownika
    let userDisplayName = userName;
    if (userDisplayName === "Nieznany użytkownik" && userId !== 'unknown') {
      try {
        const { getUserById } = await import('../userService');
        const userDataFromDb = await getUserById(userId);
        console.log('deleteBatch - dane pobrane z bazy:', userDataFromDb);
        if (userDataFromDb) {
          userDisplayName = userDataFromDb.displayName || userDataFromDb.email || userId;
        }
      } catch (error) {
        console.error('Błąd podczas pobierania danych użytkownika:', error);
        // Kontynuuj mimo błędu - mamy przekazaną nazwę użytkownika jako fallback
      }
    }
    
    console.log('deleteBatch - ostateczna nazwa użytkownika:', userDisplayName);
    
    // Dodaj transakcję informującą o usunięciu partii - rozszerzone informacje
    const transactionData = {
      type: 'DELETE_BATCH',
      itemId: itemId,
      itemName: batchData.itemName || 'Nieznany produkt',
      batchId: validatedBatchId,
      batchNumber: lotNumber,
      quantity: quantity,
      // Sprawdź czy warehouseId istnieje, jeśli nie - ustaw domyślną wartość
      warehouseId: batchData.warehouseId || 'default',
      warehouseName: batchData.warehouseName || 'Nieznany magazyn',
      notes: `Usunięcie partii ${lotNumber}`,
      reason: 'Usunięcie partii',
      reference: `Partia: ${lotNumber}`,
      source: 'inventory_management',
      previousQuantity: batchData.quantity || 0,
      transactionDate: serverTimestamp(),
      createdBy: userId,
      createdByName: userDisplayName,
      createdAt: serverTimestamp()
    };
    
    console.log('deleteBatch - transactionData przed zapisem:', {
      ...transactionData,
      transactionDate: 'serverTimestamp',
      createdAt: 'serverTimestamp'
    });
    
    await addDoc(collection(db, COLLECTIONS.INVENTORY_TRANSACTIONS), transactionData);

    // Usuń partię
    await deleteDoc(batchRef);
    
    // Emituj zdarzenie o zmianie stanu magazynu (aby odświeżyć widok szczegółów)
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('inventory-updated', { 
        detail: { itemId, action: 'batch-delete', batchId: validatedBatchId }
      });
      window.dispatchEvent(event);
    }
    
    return {
      success: true,
      message: `Partia ${lotNumber} została usunięta`
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error(`Błąd podczas usuwania partii o ID ${batchId}:`, error);
    throw new Error(`Nie udało się usunąć partii: ${error.message}`);
  }
};

/**
 * Oblicza średnią ważoną cenę ze wszystkich partii dla danego materiału
 * Używa initialQuantity jako wagi (reprezentuje pełną wartość zakupową)
 * Uwzględnia zarówno aktywne jak i wyczerpane partie
 * 
 * @param {string} materialId - ID materiału/pozycji magazynowej
 * @returns {Promise<{averagePrice: number, totalQuantity: number, batchCount: number, priceSource: string}>}
 */
export const calculateEstimatedPriceFromBatches = async (materialId) => {
  try {
    if (!materialId) {
      return { averagePrice: 0, totalQuantity: 0, batchCount: 0, priceSource: 'no-material-id' };
    }

    // Pobierz wszystkie partie dla materiału (włącznie z wyczerpanymi)
    const batchesRef = collection(db, COLLECTIONS.INVENTORY_BATCHES);
    const q = query(batchesRef, where('itemId', '==', materialId));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return { averagePrice: 0, totalQuantity: 0, batchCount: 0, priceSource: 'no-batches' };
    }

    let weightedPriceSum = 0;
    let totalQuantity = 0;
    let batchCount = 0;

    snapshot.docs.forEach(doc => {
      const batch = doc.data();
      const unitPrice = parseFloat(batch.unitPrice) || 0;
      // Użyj initialQuantity jako wagi (reprezentuje oryginalną ilość zakupową)
      const weight = parseFloat(batch.initialQuantity) || parseFloat(batch.quantity) || 0;

      // Uwzględnij tylko partie z ceną > 0
      if (unitPrice > 0 && weight > 0) {
        weightedPriceSum += unitPrice * weight;
        totalQuantity += weight;
        batchCount++;
      }
    });

    if (totalQuantity === 0) {
      return { averagePrice: 0, totalQuantity: 0, batchCount: 0, priceSource: 'no-priced-batches' };
    }

    const averagePrice = weightedPriceSum / totalQuantity;

    console.log(`📊 [ESTIMATED_PRICE] Materiał ${materialId}: średnia ważona ${averagePrice.toFixed(4)}€ z ${batchCount} partii (łączna ilość: ${totalQuantity})`);

    return {
      averagePrice,
      totalQuantity,
      batchCount,
      priceSource: 'batch-weighted-average'
    };
  } catch (error) {
    console.error(`Błąd podczas obliczania szacunkowej ceny dla materiału ${materialId}:`, error);
    return { averagePrice: 0, totalQuantity: 0, batchCount: 0, priceSource: 'error' };
  }
};

/**
 * Pobiera historię transakcji dla konkretnej partii (LOT)
 * Pozwala prześledzić dlaczego partia jest wirtualnie na magazynie
 * (np. wszystkie rezerwacje, korekty, wydania, przyjęcia)
 * 
 * @param {string} batchId - ID partii
 * @param {Object} options - Opcje zapytania
 * @param {number} options.limit - Limit rekordów (domyślnie 50)
 * @returns {Promise<Array>} - Lista transakcji powiązanych z partią
 * @throws {ValidationError} - Gdy ID jest nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas pobierania
 */
export const getBatchTransactionHistory = async (batchId, options = {}) => {
  try {
    if (!batchId) {
      return [];
    }

    const validatedBatchId = validateId(batchId, 'batchId');
    const queryLimit = options.limit || 50;

    // Pobierz wszystkie transakcje powiązane z partią
    const transactionsRef = collection(db, COLLECTIONS.INVENTORY_TRANSACTIONS);
    const q = query(
      transactionsRef,
      where('batchId', '==', validatedBatchId),
      orderBy('createdAt', 'desc')
    );

    const querySnapshot = await getDocs(q);

    let transactions = querySnapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        createdAt: convertTimestampToDate(data.createdAt),
        transactionDate: convertTimestampToDate(data.transactionDate) || convertTimestampToDate(data.createdAt)
      };
    });

    // Wzbogać o nazwy użytkowników
    const userIds = [...new Set(transactions.map(t => t.createdBy).filter(Boolean))];
    const userNamesMap = {};

    if (userIds.length > 0) {
      const userPromises = userIds.map(async (userId) => {
        try {
          const userDoc = await getDoc(doc(db, 'users', userId));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            userNamesMap[userId] = userData.displayName || userData.email || userId;
          }
        } catch (error) {
          console.warn(`Nie można pobrać użytkownika ${userId}:`, error);
        }
      });
      await Promise.all(userPromises);
    }

    // Dodaj nazwy użytkowników do transakcji
    transactions = transactions.map(t => ({
      ...t,
      createdByName: t.createdByName || userNamesMap[t.createdBy] || t.createdBy || '—'
    }));

    // Zastosuj limit
    if (queryLimit && transactions.length > queryLimit) {
      transactions = transactions.slice(0, queryLimit);
    }

    return transactions;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas pobierania historii transakcji partii:', error);
    return [];
  }
};

/**
 * Grupowe pobieranie szacunkowych cen dla wielu materiałów
 * Optymalizowane - używa jednego grupowego zapytania dla wszystkich materiałów
 * 
 * @param {Array<string>} materialIds - Lista ID materiałów
 * @returns {Promise<Object>} - Mapa materialId -> {averagePrice, totalQuantity, batchCount, priceSource}
 */
export const calculateEstimatedPricesForMultipleMaterials = async (materialIds) => {
  try {
    if (!materialIds || materialIds.length === 0) {
      return {};
    }

    const result = {};
    
    // Pobierz wszystkie partie dla wszystkich materiałów jednocześnie
    // Używamy getBatchesForMultipleItems z excludeExhausted = false (domyślnie)
    const batchesMap = await getBatchesForMultipleItems(materialIds, null, false);

    for (const materialId of materialIds) {
      const batches = batchesMap[materialId] || [];
      
      let weightedPriceSum = 0;
      let totalQuantity = 0;
      let batchCount = 0;

      batches.forEach(batch => {
        const unitPrice = parseFloat(batch.unitPrice) || 0;
        const weight = parseFloat(batch.initialQuantity) || parseFloat(batch.quantity) || 0;

        if (unitPrice > 0 && weight > 0) {
          weightedPriceSum += unitPrice * weight;
          totalQuantity += weight;
          batchCount++;
        }
      });

      if (totalQuantity > 0) {
        result[materialId] = {
          averagePrice: weightedPriceSum / totalQuantity,
          totalQuantity,
          batchCount,
          priceSource: 'batch-weighted-average'
        };
      } else {
        result[materialId] = {
          averagePrice: 0,
          totalQuantity: 0,
          batchCount: 0,
          priceSource: batches.length > 0 ? 'no-priced-batches' : 'no-batches'
        };
      }
    }

    const materialsWithPrices = Object.values(result).filter(r => r.averagePrice > 0).length;
    console.log(`📊 [ESTIMATED_PRICES] Obliczono szacunkowe ceny dla ${materialsWithPrices}/${materialIds.length} materiałów`);

    return result;
  } catch (error) {
    console.error('Błąd podczas grupowego obliczania szacunkowych cen:', error);
    return {};
  }
};

/**
 * Archiwizuje partię (lot). Dozwolone tylko gdy quantity === 0.
 */
export const archiveBatch = async (batchId) => {
  try {
    if (!batchId) throw new Error('ID partii jest wymagane');
    const docRef = doc(db, COLLECTIONS.INVENTORY_BATCHES, batchId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error('Partia nie istnieje');

    const batchData = docSnap.data();
    if ((batchData.quantity || 0) !== 0) {
      throw new Error('Nie można zarchiwizować partii z niezerową ilością. Ilość musi wynosić 0.');
    }

    await updateDoc(docRef, {
      archived: true,
      archivedAt: serverTimestamp(),
      archivedBy: 'manual'
    });
    return { success: true };
  } catch (error) {
    console.error('Błąd podczas archiwizacji partii:', error);
    throw error;
  }
};

/**
 * Przywraca partię z archiwum
 */
export const unarchiveBatch = async (batchId) => {
  try {
    if (!batchId) throw new Error('ID partii jest wymagane');
    const docRef = doc(db, COLLECTIONS.INVENTORY_BATCHES, batchId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error('Partia nie istnieje');

    await updateDoc(docRef, {
      archived: false,
      archivedAt: deleteField()
    });
    return { success: true };
  } catch (error) {
    console.error('Błąd podczas przywracania partii z archiwum:', error);
    throw error;
  }
};