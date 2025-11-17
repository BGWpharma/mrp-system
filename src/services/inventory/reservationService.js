// src/services/inventory/reservationService.js

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
  serverTimestamp,
  writeBatch,
  Timestamp
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { 
  COLLECTIONS, 
  TRANSACTION_TYPES,
  RESERVATION_METHODS,
  RESERVATION_STATUS 
} from './config/constants.js';
import { 
  validateId, 
  validatePositiveNumber,
  validateQuantity,
  validateReservationMethod,
  ValidationError 
} from './utils/validators.js';
import { 
  formatQuantityPrecision,
  convertTimestampToDate 
} from './utils/formatters.js';
import { preciseSubtract, preciseAdd, preciseIsLessThan, preciseIsLessOrEqual } from '../../utils/mathUtils.js';
import { FirebaseQueryBuilder } from './config/firebaseQueries.js';

// ✅ OPTYMALIZACJA 2: Statyczne importy zamiast dynamicznych (await import)
// Zmniejsza opóźnienie o ~50-100ms przy każdym wywołaniu funkcji
import { 
  getBatchReservations, 
  getItemBatches, 
  getReservationsForMultipleBatches 
} from './batchService.js';
import { 
  getInventoryItemById, 
  getAllInventoryItems 
} from './inventoryItemsService.js';
import { 
  getAvailablePOItems, 
  createPOReservation 
} from '../poReservationService.js';

/**
 * Usługa systemu rezerwacji magazynowych
 * 
 * Ten moduł zawiera wszystkie funkcje związane z rezerwacjami i bookowaniami:
 * - Rezerwowanie materiałów na zadania produkcyjne
 * - Anulowanie rezerwacji
 * - Zarządzanie rezerwacjami partii
 * - Aktualizacja i synchronizacja rezerwacji
 * - Cleanup i optymalizacje
 */

/**
 * Bookowanie produktu na zadanie produkcyjne lub transport CMR
 * @param {string} itemId - ID pozycji magazynowej
 * @param {number} quantity - Ilość do zarezerwowania
 * @param {string} taskId - ID zadania produkcyjnego lub CMR
 * @param {string} userId - ID użytkownika
 * @param {string} reservationMethod - Metoda rezerwacji ('expiry', 'fifo')
 * @param {string|null} batchId - ID konkretnej partii (opcjonalnie)
 * @param {boolean} autoCreatePOReservations - Czy automatycznie tworzyć rezerwacje PO gdy brakuje partii (domyślnie false)
 * @returns {Promise<Object>} - Wynik operacji rezerwacji
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const bookInventoryForTask = async (itemId, quantity, taskId, userId, reservationMethod = 'expiry', batchId = null, autoCreatePOReservations = false) => {
  try {
    console.log('🔄 [REFACTOR] bookInventoryForTask START:', { itemId, quantity, taskId, userId, reservationMethod, batchId, autoCreatePOReservations });
    
    // Walidacja parametrów wejściowych
    const validatedItemId = validateId(itemId, 'itemId');
    // Używamy validateQuantity zamiast validatePositiveNumber aby umożliwić quantity = 0 (usuwanie rezerwacji)
    const validatedQuantity = formatQuantityPrecision(validateQuantity(quantity, 'quantity'));
    const validatedTaskId = validateId(taskId, 'taskId');
    const validatedUserId = validateId(userId, 'userId');
    const validatedMethod = validateReservationMethod(reservationMethod);
    
    console.log('✅ [REFACTOR] Walidacja parametrów zakończona:', { validatedItemId, validatedQuantity, validatedTaskId, validatedMethod });
    
    if (batchId) {
      validateId(batchId, 'batchId');
    }

    // Sprawdź czy ta partia jest już zarezerwowana dla tego zadania
    let existingReservation = null;
    if (batchId) {
      const existingReservations = await getBatchReservations(batchId);
      existingReservation = existingReservations.find(r => r.taskId === validatedTaskId);
      
      if (existingReservation) {
        console.log('🔍 [REFACTOR] Znaleziono istniejącą rezerwację dla partii, będzie zaktualizowana:', existingReservation);
      }
    }
    
    // Sprawdź czy pozycja magazynowa istnieje
    console.log('🔍 [REFACTOR] Sprawdzanie pozycji magazynowej...');
    let item;
    try {
      item = await getInventoryItemById(validatedItemId);
      console.log('✅ [REFACTOR] Pozycja magazynowa znaleziona:', { name: item.name, bookedQuantity: item.bookedQuantity });
    } catch (error) {
      console.error('❌ [REFACTOR] Błąd podczas pobierania pozycji magazynowej:', error);
      if (error.message === 'Pozycja magazynowa nie istnieje') {
        console.warn(`Pozycja magazynowa o ID ${validatedItemId} nie istnieje, pomijam rezerwację`);
        return {
          success: false,
          message: `Pozycja magazynowa o ID ${validatedItemId} nie istnieje`
        };
      }
      throw error;
    }

    // 🔄 SYNCHRONIZACJA BOOKEDQUANTITY - zapewnienie spójności danych przed rezerwacją
    console.log('🔄 [SYNC] Synchronizacja bookedQuantity przed procesem rezerwacji...');
    try {
      item = await synchronizeBookedQuantity(item, validatedUserId);
      console.log('✅ [SYNC] Synchronizacja zakończona, bookedQuantity:', item.bookedQuantity);
    } catch (error) {
      console.warn('⚠️ [SYNC] Błąd synchronizacji - kontynuuję bez synchronizacji:', error.message);
      // Nie przerywamy procesu rezerwacji jeśli synchronizacja się nie powiodła
    }
    
    // Pobierz partie dla tego materiału i oblicz dostępną ilość
    console.log('🔍 [REFACTOR] Pobieranie partii...');
    const allBatches = await getItemBatches(validatedItemId);
    const availableQuantity = allBatches.reduce((sum, batch) => sum + (batch.quantity || 0), 0);
    console.log('📦 [REFACTOR] Znalezione partie:', { count: allBatches.length, availableQuantity });
    
    // Sprawdź dostępność po uwzględnieniu rezerwacji
    const effectivelyAvailable = availableQuantity - (item.bookedQuantity || 0);
    console.log('📊 [REFACTOR] Analiza dostępności:', { 
      availableQuantity, 
      bookedQuantity: item.bookedQuantity || 0, 
      effectivelyAvailable, 
      required: validatedQuantity 
    });
    
    // 🔧 NOWA LOGIKA: Dla automatycznej rezerwacji (batchId === null) rezerwuj tyle ile jest dostępne
    let actualQuantityToReserve = validatedQuantity;
    let isPartialReservation = false;
    
    if (preciseIsLessThan(effectivelyAvailable, validatedQuantity)) {
      // Jeśli to ręczna rezerwacja konkretnej partii, rzuć błąd
      if (batchId) {
        const errorMsg = `Niewystarczająca ilość produktu w magazynie po uwzględnieniu rezerwacji. 
        Dostępne fizycznie: ${availableQuantity} ${item.unit}, 
        Zarezerwowane: ${item.bookedQuantity || 0} ${item.unit}, 
        Efektywnie dostępne: ${effectivelyAvailable} ${item.unit},
        Wymagane: ${validatedQuantity} ${item.unit}`;
        console.error('❌ [REFACTOR] Niewystarczająca ilość:', errorMsg);
        throw new Error(errorMsg);
      }
      
      // Dla automatycznej rezerwacji - rezerwuj tyle ile jest dostępne
      if (preciseIsLessOrEqual(effectivelyAvailable, 0)) {
        throw new Error(`Brak dostępnej ilości produktu ${item.name} w magazynie (całość zarezerwowana przez inne zadania).`);
      }
      
      actualQuantityToReserve = effectivelyAvailable;
      isPartialReservation = true;
      console.warn(`⚠️ [REFACTOR] Częściowa rezerwacja: dostępne ${effectivelyAvailable} ${item.unit}, wymagane ${validatedQuantity} ${item.unit}`);
    }
    
    // Pobierz dane zadania/CMR
    console.log('🔍 [REFACTOR] Pobieranie danych zadania...');
    const taskData = await getTaskOrCmrData(validatedTaskId);
    console.log('📋 [REFACTOR] Dane zadania:', taskData);
    
    // Aktualizuj pole bookedQuantity w pozycji magazynowej
    await updateItemBookedQuantity(validatedItemId, item, actualQuantityToReserve, validatedUserId, 'add');
    
    console.log(`Rezerwacja materiału, metoda: ${validatedMethod}, ilość: ${actualQuantityToReserve} ${item.unit}`);
    
    // Pobierz i posortuj partie zgodnie z metodą rezerwacji
    const sortedBatches = await getSortedBatchesForReservation(validatedItemId, validatedMethod);
    
    // Jeśli istnieje rezerwacja, zaktualizuj ją zamiast tworzyć nową
    if (existingReservation) {
      console.log('🔄 [REFACTOR] Aktualizacja istniejącej rezerwacji...');
      return await updateExistingReservation(
        existingReservation,
        validatedItemId,
        actualQuantityToReserve,
        validatedTaskId,
        validatedUserId,
        item,
        taskData
      );
    }

    // Wybierz partie do rezerwacji
    const reservationResult = await selectBatchesForReservation(
      sortedBatches, 
      actualQuantityToReserve, 
      validatedTaskId, 
      batchId, 
      item,
      existingReservation
    );
    
    // Zapisz informacje o partiach w zadaniu produkcyjnym (tylko dla zadań produkcyjnych)
    if (!taskData.isCmrReservation && taskData && Object.keys(taskData).length > 0) {
      const taskRef = FirebaseQueryBuilder.getDocRef('productionTasks', validatedTaskId);
      const materialBatches = taskData.materialBatches || {};
      
      // Jeśli jest to ręczna rezerwacja pojedynczej partii, dodajemy do istniejących
      if (batchId && materialBatches[validatedItemId]) {
        // Sprawdź czy ta partia już istnieje w liście
        const existingBatchIndex = materialBatches[validatedItemId].findIndex(b => b.batchId === batchId);
        
        if (existingBatchIndex >= 0) {
          // Aktualizuj istniejącą partię, zastępując ilość nową wartością
          materialBatches[validatedItemId][existingBatchIndex].quantity = actualQuantityToReserve;
        } else {
          // Dodaj nową partię do listy
          materialBatches[validatedItemId].push(...reservationResult.reservedBatches);
        }
      } else {
        // W przypadku automatycznej rezerwacji lub pierwszej ręcznej rezerwacji, zastąp listę
        materialBatches[validatedItemId] = reservationResult.reservedBatches;
      }
      
      await updateDoc(taskRef, {
        materialBatches,
        updatedAt: serverTimestamp()
      });
    }
    
    // Upewnij się, że wszystkie zarezerwowane partie mają numery
    const formattedBatches = formatReservedBatches(reservationResult.reservedBatches);
    
    // 🔧 POPRAWKA: Utwórz osobną transakcję dla każdej zarezerwowanej partii
    // Gdy automatyczna rezerwacja FIFO wybiera wiele partii (np. 5kg z partii A + 3kg z partii B),
    // musimy utworzyć osobną transakcję rezerwacji dla każdej partii z odpowiednią ilością
    for (const reservedBatch of reservationResult.reservedBatches) {
      await createBookingTransaction({
        itemId: validatedItemId,
        item,
        quantity: reservedBatch.quantity,  // Ilość dla konkretnej partii
        taskId: validatedTaskId,
        taskData,
        batchId: reservedBatch.batchId,    // ID konkretnej partii
        batchNumber: reservedBatch.batchNumber,
        reservationMethod: validatedMethod,
        userId: validatedUserId
      });
    }
    
    // Emituj zdarzenie o zmianie stanu magazynu
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('inventory-updated', { 
        detail: { itemId: validatedItemId, action: 'booking', quantity: actualQuantityToReserve }
      });
      window.dispatchEvent(event);
    }
    
    console.log('🎉 [REFACTOR] bookInventoryForTask SUCCESS!');
    
    // Przygotuj odpowiedni komunikat w zależności od tego czy była to pełna czy częściowa rezerwacja
    let message = `Zarezerwowano ${actualQuantityToReserve} ${item.unit} produktu ${item.name}`;
    if (isPartialReservation) {
      const missingQuantity = preciseSubtract(validatedQuantity, actualQuantityToReserve);
      message += ` (⚠️ Częściowa rezerwacja: brakuje ${missingQuantity} ${item.unit})`;
    }
    
    // 🆕 NOWA LOGIKA: Automatyczne tworzenie rezerwacji PO gdy brakuje partii
    let poReservationCreated = null;
    if (isPartialReservation && !batchId && autoCreatePOReservations) {
      const missingQuantity = preciseSubtract(validatedQuantity, actualQuantityToReserve);
      
      console.log(`🔍 [AUTO_PO] Sprawdzam dostępność PO dla brakującej ilości: ${missingQuantity} ${item.unit}`);
      
      try {
        // Sprawdź czy są dostępne pozycje w PO dla tego materiału
        const availablePOItems = await getAvailablePOItems(validatedItemId);
        
        if (availablePOItems.length > 0) {
          console.log(`✅ [AUTO_PO] Znaleziono ${availablePOItems.length} dostępnych pozycji w PO`);
          
          // Wybierz najlepsze PO (pierwsze z listy - sortowane wg daty dostawy i ceny)
          const bestPO = availablePOItems[0];
          
          // Ilość do zarezerwowania z PO (maksymalnie tyle ile brakuje lub ile jest dostępne w PO)
          const quantityToReserveFromPO = Math.min(missingQuantity, bestPO.availableQuantity);
          
          console.log(`📦 [AUTO_PO] Tworzę rezerwację: ${quantityToReserveFromPO} ${item.unit} z PO ${bestPO.poNumber}`);
          
          // Utwórz rezerwację PO
          poReservationCreated = await createPOReservation(
            validatedTaskId,
            bestPO.poId,
            bestPO.poItemId,
            quantityToReserveFromPO,
            validatedUserId
          );
          
          console.log(`✅ [AUTO_PO] Utworzono rezerwację PO: ${poReservationCreated.id}`);
          
          // Zaktualizuj komunikat
          const remainingMissing = preciseSubtract(missingQuantity, quantityToReserveFromPO);
          const expectedDate = bestPO.expectedDeliveryDate 
            ? new Date(bestPO.expectedDeliveryDate).toLocaleDateString('pl-PL')
            : 'nieokreślona';
            
          if (preciseIsLessOrEqual(remainingMissing, 0)) {
            message = `Zarezerwowano ${actualQuantityToReserve} ${item.unit} z partii magazynowych + ${quantityToReserveFromPO} ${item.unit} z zamówienia ${bestPO.poNumber} (oczekiwana dostawa: ${expectedDate})`;
          } else {
            message = `Zarezerwowano ${actualQuantityToReserve} ${item.unit} z partii + ${quantityToReserveFromPO} ${item.unit} z PO ${bestPO.poNumber} (⚠️ Nadal brakuje ${remainingMissing} ${item.unit})`;
          }
          
        } else {
          console.log(`❌ [AUTO_PO] Brak dostępnych pozycji w PO dla materiału ${item.name}`);
        }
        
      } catch (poError) {
        console.error('❌ [AUTO_PO] Błąd podczas tworzenia rezerwacji PO:', poError);
        // Nie przerywamy procesu - rezerwacja partii jest już utworzona
        console.warn('⚠️ [AUTO_PO] Rezerwacja partii została utworzona pomimo błędu rezerwacji PO');
      }
    }
    
    return {
      success: true,
      message,
      reservedBatches: reservationResult.reservedBatches,
      isPartialReservation,
      requestedQuantity: validatedQuantity,
      actualQuantity: actualQuantityToReserve,
      poReservation: poReservationCreated  // 🆕 Informacja o utworzonej rezerwacji PO
    };
  } catch (error) {
    console.error('❌ [REFACTOR] bookInventoryForTask ERROR:', error);
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas rezerwowania materiału:', error);
    throw new Error(`Nie udało się zarezerwować materiału: ${error.message}`);
  }
};

/**
 * Anulowanie bookowania produktu
 * @param {string} itemId - ID pozycji magazynowej
 * @param {number} quantity - Ilość do anulowania
 * @param {string} taskId - ID zadania
 * @param {string} userId - ID użytkownika
 * @returns {Promise<Object>} - Wynik operacji anulowania
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const cancelBooking = async (itemId, quantity, taskId, userId) => {
  try {
    // Walidacja parametrów wejściowych
    const validatedItemId = validateId(itemId, 'itemId');
    const validatedQuantity = formatQuantityPrecision(validatePositiveNumber(quantity, 'quantity'));
    const validatedTaskId = validateId(taskId, 'taskId');
    const validatedUserId = validateId(userId, 'userId');

    // Równoległe pobieranie danych
    const [item, originalBookingSnapshot, taskData] = await Promise.all([
      // Pobierz aktualny stan produktu
      getInventoryItemById(validatedItemId),
      
      // Pobierz oryginalne rezerwacje dla tego zadania
      getOriginalBookings(validatedItemId, validatedTaskId),
      
      // Pobierz dane zadania produkcyjnego równolegle
      getTaskData(validatedTaskId)
    ]);
    
    // Oblicz oryginalną zarezerwowaną ilość
    let originalBookedQuantity = 0;
    originalBookingSnapshot.forEach((bookingDoc) => {
      const bookingData = bookingDoc.data();
      if (bookingData.quantity) {
        originalBookedQuantity = preciseAdd(originalBookedQuantity, parseFloat(bookingData.quantity));
      }
    });
    
    // Zawsze anuluj całą rezerwację po potwierdzeniu zużycia
    const shouldCancelAllBooking = true;
    const quantityToCancel = formatQuantityPrecision(item.bookedQuantity || 0, 3);
    
    // Aktualizuj pole bookedQuantity - zawsze wyzeruj
    await updateItemBookedQuantity(validatedItemId, item, quantityToCancel, validatedUserId, 'cancel');
    
    // Równoległe tworzenie transakcji i aktualizacja rezerwacji
    await Promise.all([
      // Dodaj transakcję anulowania rezerwacji
      createCancellationTransaction({
        itemId: validatedItemId,
        quantity: validatedQuantity,
        taskId: validatedTaskId,
        taskData,
        userId: validatedUserId
      }),
      
      // Sprawdź, czy zadanie zostało usunięte, jeśli tak - usuń rezerwacje fizycznie
      (async () => {
        try {
          const taskRef = FirebaseQueryBuilder.getDocRef('productionTasks', validatedTaskId);
          const taskDoc = await getDoc(taskRef);
          
          if (!taskDoc.exists()) {
            // Zadanie zostało usunięte - usuń rezerwacje fizycznie
            if (originalBookingSnapshot.docs.length > 0) {
              const batch = writeBatch(db);
              
              originalBookingSnapshot.forEach((bookingDoc) => {
                const reservationDocRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY_TRANSACTIONS, bookingDoc.id);
                batch.delete(reservationDocRef);
              });
              
              await batch.commit();
              console.log(`Fizycznie usunięto ${originalBookingSnapshot.docs.length} rezerwacji dla usuniętego zadania ${validatedTaskId}`);
            }
          } else {
            // Zadanie istnieje - tylko zaktualizuj status
            await updateReservationStatus(originalBookingSnapshot);
          }
        } catch (error) {
          console.error(`Błąd podczas sprawdzania statusu zadania ${validatedTaskId}:`, error);
          // W przypadku błędu, wykonaj standardowe oznaczenie jako completed
          await updateReservationStatus(originalBookingSnapshot);
        }
      })()
    ]);
    
    // Emituj zdarzenie o zmianie stanu magazynu
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('inventory-updated', { 
        detail: { itemId: validatedItemId, action: 'booking-cancelled' }
      });
      window.dispatchEvent(event);
    }
    
    return {
      success: true,
      message: `Anulowano rezerwację ${validatedQuantity} ${item.unit} produktu ${item.name}`
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas anulowania rezerwacji:', error);
    throw new Error(`Nie udało się anulować rezerwacji: ${error.message}`);
  }
};

/**
 * Aktualizacja istniejącej rezerwacji
 * @param {string} reservationId - ID rezerwacji do aktualizacji
 * @param {string} itemId - ID pozycji magazynowej
 * @param {number} newQuantity - Nowa ilość
 * @param {string} newBatchId - Nowy ID partii (opcjonalnie)
 * @param {string} userId - ID użytkownika
 * @returns {Promise<Object>} - Wynik operacji aktualizacji
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const updateReservation = async (reservationId, itemId, newQuantity, newBatchId, userId) => {
  try {
    // Walidacja parametrów
    const validatedReservationId = validateId(reservationId, 'reservationId');
    const validatedItemId = validateId(itemId, 'itemId');
    const validatedQuantity = formatQuantityPrecision(validateQuantity(newQuantity, 'newQuantity'));
    const validatedUserId = validateId(userId, 'userId');
    
    if (newBatchId) {
      validateId(newBatchId, 'newBatchId');
    }

    // Pobierz aktualną rezerwację
    const reservationRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY_TRANSACTIONS, validatedReservationId);
    const reservationDoc = await getDoc(reservationRef);
    
    if (!reservationDoc.exists()) {
      throw new Error('Rezerwacja nie istnieje');
    }
    
    const reservation = reservationDoc.data();
    const oldQuantity = reservation.quantity;
    
    // Pobierz aktualny stan produktu
    let item = await getInventoryItemById(validatedItemId);
    
    // 🔄 SYNCHRONIZACJA BOOKEDQUANTITY przed aktualizacją rezerwacji
    console.log('🔄 [SYNC] Synchronizacja bookedQuantity przed aktualizacją rezerwacji...');
    try {
      item = await synchronizeBookedQuantity(item, validatedUserId);
      console.log('✅ [SYNC] Synchronizacja przed aktualizacją zakończona, bookedQuantity:', item.bookedQuantity);
    } catch (error) {
      console.warn('⚠️ [SYNC] Błąd synchronizacji przed aktualizacją - kontynuuję bez synchronizacji:', error.message);
    }
    
    // Jeśli nowa ilość jest 0 lub ujemna, usuń rezerwację
    if (validatedQuantity <= 0) {
      console.log('🗑️ [REFACTOR] Usuwanie rezerwacji z powodu newQuantity <= 0');
      return await deleteReservation(validatedReservationId, validatedUserId);
    }
    
    // Oblicz różnicę w ilości
    const quantityDiff = validatedQuantity - oldQuantity;
    
    // Sprawdź dostępność dla zwiększenia rezerwacji
    const availableQuantity = preciseSubtract(item.quantity, item.bookedQuantity);
    if (quantityDiff > 0 && preciseIsLessThan(availableQuantity, quantityDiff)) {
      throw new Error(`Niewystarczająca ilość produktu w magazynie. Dostępne: ${availableQuantity} ${item.unit}`);
    }
    
    // Aktualizuj pole bookedQuantity w produkcie
    const itemRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY, validatedItemId);
    const formattedQuantityDiff = formatQuantityPrecision(quantityDiff, 3);
    const currentBookedQuantity = item.bookedQuantity || 0;
    const newBookedQuantity = formatQuantityPrecision(currentBookedQuantity + formattedQuantityDiff, 3);
    
    await updateDoc(itemRef, {
      bookedQuantity: newBookedQuantity,
      updatedAt: serverTimestamp(),
      updatedBy: validatedUserId
    });
    
    // Pobierz informacje o wybranej partii, jeśli została zmieniona
    let batchNumber = reservation.batchNumber || '';
    if (newBatchId && newBatchId !== reservation.batchId) {
      try {
        const batchRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY_BATCHES, newBatchId);
        const batchDoc = await getDoc(batchRef);
        if (batchDoc.exists()) {
          const batchData = batchDoc.data();
          batchNumber = batchData.lotNumber || batchData.batchNumber || 'Bez numeru';
        }
      } catch (error) {
        console.error('Błąd podczas pobierania informacji o partii:', error);
      }
    }
    
    // Aktualizuj informacje o partiach w zadaniu jeśli to konieczne
    if ((newBatchId !== reservation.batchId || quantityDiff !== 0) && reservation.referenceId) {
      await updateTaskBatchesOnReservationChange(
        reservation.referenceId, 
        validatedItemId, 
        newBatchId, 
        quantityDiff, 
        batchNumber
      );
    }
    
    // Aktualizuj rezerwację
    const updateData = {
      quantity: validatedQuantity,
      updatedAt: serverTimestamp(),
      updatedBy: validatedUserId
    };
    
    if (newBatchId) {
      updateData.batchId = newBatchId;
      updateData.batchNumber = batchNumber;
    }
    
    await updateDoc(reservationRef, updateData);
    
    return {
      success: true,
      message: `Zaktualizowano rezerwację na ${validatedQuantity} ${item.unit}`,
      updatedReservation: {
        id: validatedReservationId,
        ...reservation,
        ...updateData
      }
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas aktualizacji rezerwacji:', error);
    throw new Error(`Nie udało się zaktualizować rezerwacji: ${error.message}`);
  }
};

/**
 * Pobiera rezerwacje dla zadania i materiału
 * @param {string} taskId - ID zadania
 * @param {string} materialId - ID materiału
 * @param {string} batchId - ID partii (opcjonalnie)
 * @returns {Promise<Array>} - Lista rezerwacji
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const getReservationsForTaskAndMaterial = async (taskId, materialId, batchId = null) => {
  try {
    // Walidacja parametrów
    const validatedTaskId = validateId(taskId, 'taskId');
    const validatedMaterialId = validateId(materialId, 'materialId');
    
    if (batchId) {
      validateId(batchId, 'batchId');
    }

    const transactionsRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_TRANSACTIONS);
    let q = query(
      transactionsRef,
      where('itemId', '==', validatedMaterialId),
      where('referenceId', '==', validatedTaskId),
      where('type', '==', TRANSACTION_TYPES.BOOKING)
    );
    
    // Dodaj filtr partii jeśli podano
    if (batchId) {
      q = query(q, where('batchId', '==', batchId));
    }
    
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: convertTimestampToDate(doc.data().createdAt),
      updatedAt: convertTimestampToDate(doc.data().updatedAt)
    }));
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas pobierania rezerwacji:', error);
    throw new Error(`Nie udało się pobrać rezerwacji: ${error.message}`);
  }
};

/**
 * Czyści rezerwacje dla usuniętego zadania
 * @param {string} taskId - ID zadania
 * @param {Array<string>} itemIds - Lista ID pozycji (opcjonalnie)
 * @returns {Promise<Object>} - Wynik operacji czyszczenia
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const cleanupTaskReservations = async (taskId, itemIds = null) => {
  try {
    // Walidacja parametrów
    const validatedTaskId = validateId(taskId, 'taskId');
    
    if (itemIds) {
      itemIds.forEach(id => validateId(id, 'itemId'));
    }

    console.log(`Czyszczenie rezerwacji dla zadania: ${validatedTaskId}`);
    
    // Pobierz wszystkie rezerwacje dla zadania
    const transactionsRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_TRANSACTIONS);
    let q = query(
      transactionsRef,
      where('referenceId', '==', validatedTaskId),
      where('type', '==', TRANSACTION_TYPES.BOOKING)
    );
    
    const querySnapshot = await getDocs(q);
    const reservations = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    if (reservations.length === 0) {
      console.log(`Brak rezerwacji do wyczyszczenia dla zadania ${validatedTaskId}`);
      return {
        success: true,
        message: 'Brak rezerwacji do wyczyszczenia',
        cleanedReservations: 0
      };
    }
    
    const batch = writeBatch(db);
    let cleanedCount = 0;
    
    // Grupuj rezerwacje według itemId
    const reservationsByItem = reservations.reduce((acc, reservation) => {
      const itemId = reservation.itemId;
      if (!itemIds || itemIds.includes(itemId)) {
        if (!acc[itemId]) {
          acc[itemId] = [];
        }
        acc[itemId].push(reservation);
      }
      return acc;
    }, {});
    
    // Dla każdej pozycji, anuluj rezerwacje
    for (const [itemId, itemReservations] of Object.entries(reservationsByItem)) {
      try {
        // Oblicz całkowitą zarezerwowaną ilość
        const totalReservedQuantity = itemReservations.reduce((sum, res) => sum + (res.quantity || 0), 0);
        
        if (totalReservedQuantity > 0) {
          // Pobierz aktualny stan pozycji i zaktualizuj bookedQuantity
          const item = await getInventoryItemById(itemId);
          
          const itemRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY, itemId);
          const currentBookedQuantity = item.bookedQuantity || 0;
          const newBookedQuantity = formatQuantityPrecision(
            Math.max(0, currentBookedQuantity - totalReservedQuantity), 
            3
          );
          
          batch.update(itemRef, {
            bookedQuantity: newBookedQuantity,
            updatedAt: serverTimestamp(),
            updatedBy: 'system-cleanup'
          });
        }
        
        // Usuń rezerwacje fizycznie (tak jak w starej implementacji)
        itemReservations.forEach(reservation => {
          const reservationRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY_TRANSACTIONS, reservation.id);
          batch.delete(reservationRef);
          cleanedCount++;
        });
        
      } catch (error) {
        console.error(`Błąd podczas czyszczenia rezerwacji dla pozycji ${itemId}:`, error);
      }
    }
    
    // Wykonaj batch update
    if (cleanedCount > 0) {
      await batch.commit();
      console.log(`Wyczyszczono ${cleanedCount} rezerwacji dla zadania ${validatedTaskId}`);
    }
    
    return {
      success: true,
      message: `Wyczyszczono ${cleanedCount} rezerwacji`,
      cleanedReservations: cleanedCount
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas czyszczenia rezerwacji zadania:', error);
    throw new Error(`Nie udało się wyczyścić rezerwacji: ${error.message}`);
  }
};

/**
 * Pobiera rezerwacje pogrupowane według zadań dla danej pozycji
 * @param {string} itemId - ID pozycji magazynowej
 * @returns {Promise<Object>} - Rezerwacje pogrupowane według zadań
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const getReservationsGroupedByTask = async (itemId) => {
  try {
    // Walidacja parametrów
    const validatedItemId = validateId(itemId, 'itemId');

    const transactionsRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_TRANSACTIONS);
    const q = query(
      transactionsRef,
      where('itemId', '==', validatedItemId),
      where('type', '==', TRANSACTION_TYPES.BOOKING),
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    const reservations = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: convertTimestampToDate(doc.data().createdAt)
    }));
    
    // Grupuj według taskId/referenceId
    const grouped = reservations.reduce((acc, reservation) => {
      const taskId = reservation.referenceId || reservation.taskId;
      if (!taskId) return acc;
      
      if (!acc[taskId]) {
        acc[taskId] = {
          taskId,
          taskName: reservation.taskName || '',
          taskNumber: reservation.taskNumber || '',
          moNumber: reservation.taskNumber || reservation.moNumber || '', // Użyj taskNumber (zawiera numer MO lub CMR)
          clientName: reservation.clientName || '',
          clientId: reservation.clientId || '',
          reservations: [],
          batches: [], // Dodanie struktury partii dla kompatybilności
          totalQuantity: 0,
          createdAt: reservation.createdAt,
          updatedAt: reservation.updatedAt,
          status: reservation.status || 'active' // Dodanie statusu dla kompatybilności
        };
      }
      
      acc[taskId].reservations.push(reservation);
      acc[taskId].totalQuantity = preciseAdd(acc[taskId].totalQuantity, reservation.quantity || 0);
      
      // Dodaj partię do listy partii dla tego zadania (kompatybilność z oryginalną strukturą)
      if (reservation.batchId) {
        acc[taskId].batches.push({
          batchId: reservation.batchId,
          batchNumber: reservation.batchNumber || 'Bez numeru',
          quantity: parseFloat(reservation.quantity) || 0,
          reservationId: reservation.id,
          status: reservation.status || 'active'
        });
      }
      
      return acc;
    }, {});
    
    // Konwertuj obiekt na tablicę dla kompatybilności z oryginalną implementacją
    return Object.values(grouped);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas pobierania rezerwacji pogrupowanych:', error);
    throw new Error(`Nie udało się pobrać rezerwacji: ${error.message}`);
  }
};

/**
 * Czyści mikro-rezerwacje (bardzo małe ilości)
 * @param {number} threshold - Próg poniżej którego rezerwacje są usuwane
 * @returns {Promise<Object>} - Wynik operacji czyszczenia
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const cleanupMicroReservations = async (threshold = 0.001) => {
  try {
    if (typeof threshold !== 'number' || threshold <= 0) {
      throw new ValidationError('Próg musi być liczbą dodatnią', 'threshold');
    }

    console.log(`Rozpoczynam czyszczenie mikro-rezerwacji poniżej ${threshold}`);
    
    const transactionsRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_TRANSACTIONS);
    const q = query(
      transactionsRef,
      where('type', '==', TRANSACTION_TYPES.BOOKING)
    );
    
    const querySnapshot = await getDocs(q);
    const reservations = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Filtruj mikro-rezerwacje
    const microReservations = reservations.filter(r => 
      r.quantity && r.quantity < threshold && r.quantity > 0
    );
    
    if (microReservations.length === 0) {
      console.log('Brak mikro-rezerwacji do wyczyszczenia');
      return {
        success: true,
        message: 'Brak mikro-rezerwacji do wyczyszczenia',
        cleanedReservations: 0
      };
    }
    
    const batch = writeBatch(db);
    
    // Grupuj mikro-rezerwacje według pozycji
    const microReservationsByItem = microReservations.reduce((acc, reservation) => {
      const itemId = reservation.itemId;
      if (!acc[itemId]) {
        acc[itemId] = [];
      }
      acc[itemId].push(reservation);
      return acc;
    }, {});
    
    // Dla każdej pozycji, anuluj mikro-rezerwacje
    for (const [itemId, itemMicroReservations] of Object.entries(microReservationsByItem)) {
      try {
        // Oblicz całkowitą ilość mikro-rezerwacji
        const totalMicroQuantity = itemMicroReservations.reduce((sum, res) => sum + (res.quantity || 0), 0);
        
        if (totalMicroQuantity > 0) {
          // Zaktualizuj bookedQuantity pozycji
          const item = await getInventoryItemById(itemId);
          
          const itemRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY, itemId);
          const currentBookedQuantity = item.bookedQuantity || 0;
          const newBookedQuantity = formatQuantityPrecision(
            Math.max(0, currentBookedQuantity - totalMicroQuantity), 
            3
          );
          
          batch.update(itemRef, {
            bookedQuantity: newBookedQuantity,
            updatedAt: serverTimestamp(),
            updatedBy: 'system-cleanup'
          });
        }
        
        // Oznacz mikro-rezerwacje jako anulowane
        itemMicroReservations.forEach(reservation => {
          const reservationRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY_TRANSACTIONS, reservation.id);
          batch.update(reservationRef, {
            status: RESERVATION_STATUS.CANCELLED,
            cancelledAt: serverTimestamp(),
            cancelledBy: 'system-cleanup',
            cancelReason: `Mikro-rezerwacja poniżej progu ${threshold}`
          });
        });
        
      } catch (error) {
        console.error(`Błąd podczas czyszczenia mikro-rezerwacji dla pozycji ${itemId}:`, error);
      }
    }
    
    // Wykonaj batch update
    await batch.commit();
    
    console.log(`Wyczyszczono ${microReservations.length} mikro-rezerwacji`);
    
    return {
      success: true,
      message: `Wyczyszczono ${microReservations.length} mikro-rezerwacji`,
      cleanedReservations: microReservations.length
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas czyszczenia mikro-rezerwacji:', error);
    throw new Error(`Nie udało się wyczyścić mikro-rezerwacji: ${error.message}`);
  }
};

/**
 * Czyści wszystkie rezerwacje dla danej pozycji magazynowej
 * @param {string} itemId - ID pozycji magazynowej
 * @param {string} userId - ID użytkownika
 * @returns {Promise<Object>} - Wynik operacji czyszczenia
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const cleanupItemReservations = async (itemId, userId) => {
  try {
    // Walidacja parametrów
    const validatedItemId = validateId(itemId, 'itemId');
    const validatedUserId = validateId(userId, 'userId');

    console.log(`Rozpoczynam czyszczenie wszystkich rezerwacji dla pozycji: ${validatedItemId}`);
    
    const transactionsRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_TRANSACTIONS);
    const q = query(
      transactionsRef,
      where('itemId', '==', validatedItemId),
      where('type', '==', TRANSACTION_TYPES.BOOKING)
    );
    
    const querySnapshot = await getDocs(q);
    const reservations = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    if (reservations.length === 0) {
      console.log(`Brak rezerwacji do wyczyszczenia dla pozycji ${validatedItemId}`);
      return {
        success: true,
        message: 'Brak rezerwacji do wyczyszczenia',
        cleanedReservations: 0
      };
    }
    
    // Oblicz całkowitą zarezerwowaną ilość
    const totalReservedQuantity = reservations.reduce((sum, res) => sum + (res.quantity || 0), 0);
    
    const batch = writeBatch(db);
    
    // Wyzeruj bookedQuantity w pozycji
    if (totalReservedQuantity > 0) {
      const itemRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY, validatedItemId);
      batch.update(itemRef, {
        bookedQuantity: 0,
        updatedAt: serverTimestamp(),
        updatedBy: validatedUserId
      });
    }
    
    // Oznacz wszystkie rezerwacje jako anulowane
    reservations.forEach(reservation => {
      const reservationRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY_TRANSACTIONS, reservation.id);
      batch.update(reservationRef, {
        status: RESERVATION_STATUS.CANCELLED,
        cancelledAt: serverTimestamp(),
        cancelledBy: validatedUserId,
        cancelReason: 'Czyszczenie wszystkich rezerwacji pozycji'
      });
    });
    
    // Wykonaj batch update
    await batch.commit();
    
    console.log(`Wyczyszczono ${reservations.length} rezerwacji dla pozycji ${validatedItemId}`);
    
    return {
      success: true,
      message: `Wyczyszczono ${reservations.length} rezerwacji`,
      cleanedReservations: reservations.length,
      totalQuantityReleased: formatQuantityPrecision(totalReservedQuantity)
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas czyszczenia rezerwacji pozycji:', error);
    throw new Error(`Nie udało się wyczyścić rezerwacji pozycji: ${error.message}`);
  }
};

// ===== FUNKCJE POMOCNICZE =====

/**
 * Pobiera dane zadania produkcyjnego lub CMR
 * @private
 */
const getTaskOrCmrData = async (taskId) => {
  let taskData = {
    taskName: '',
    taskNumber: '',
    clientName: '',
    clientId: '',
    isCmrReservation: false,
    cmrNumber: '',
    taskExists: false
  };
  
  // Sprawdź czy to rezerwacja dla CMR
  if (taskId && taskId.startsWith('CMR-')) {
    taskData.isCmrReservation = true;
    
    const cmrMatch = taskId.match(/^CMR-(.+)-(.+)$/);
    if (cmrMatch) {
      taskData.cmrNumber = cmrMatch[1];
      taskData.taskName = `Transport CMR ${taskData.cmrNumber}`;
      taskData.taskNumber = taskData.cmrNumber;
      console.log(`Rezerwacja dla CMR: ${taskData.cmrNumber}`);
    } else {
      console.warn(`Nieprawidłowy format taskId dla CMR: ${taskId}`);
      taskData.taskName = 'Transport CMR';
    }
  } else {
    // Standardowa rezerwacja dla zadania produkcyjnego
    try {
      const taskRef = FirebaseQueryBuilder.getDocRef('productionTasks', taskId);
      const taskDoc = await getDoc(taskRef);
      
      if (taskDoc.exists()) {
        const data = taskDoc.data();
        taskData.taskExists = true;
        taskData.taskName = data.name || '';
        taskData.taskNumber = data.moNumber || data.number || ''; // Sprawdź moNumber jako priorytet
        taskData.clientName = data.clientName || '';
        taskData.clientId = data.clientId || '';
        taskData.materialBatches = data.materialBatches || {}; // Dodaj materialBatches
      } else {
        console.warn(`Zadanie produkcyjne o ID ${taskId} nie istnieje`);
      }
    } catch (error) {
      console.error(`Błąd podczas pobierania zadania ${taskId}:`, error);
    }
    
    console.log(`Rezerwacja dla zadania: MO=${taskData.taskNumber}, nazwa=${taskData.taskName}`);
  }
  
  return taskData;
};

/**
 * Aktualizuje pole bookedQuantity w pozycji magazynowej
 * @private
 */
const updateItemBookedQuantity = async (itemId, item, quantity, userId, operation) => {
  const itemRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY, itemId);
  const formattedQuantity = formatQuantityPrecision(quantity, 3);
  
  if (operation === 'add') {
    // Dodaj do rezerwacji
    if (item.bookedQuantity === undefined) {
      await updateDoc(itemRef, {
        bookedQuantity: formattedQuantity,
        updatedAt: serverTimestamp(),
        updatedBy: userId
      });
    } else {
      const currentBookedQuantity = item.bookedQuantity || 0;
      const newBookedQuantity = formatQuantityPrecision(currentBookedQuantity + formattedQuantity, 3);
      await updateDoc(itemRef, {
        bookedQuantity: newBookedQuantity,
        updatedAt: serverTimestamp(),
        updatedBy: userId
      });
    }
  } else if (operation === 'cancel') {
    // Anuluj rezerwację - zawsze wyzeruj
    await updateDoc(itemRef, {
      bookedQuantity: 0,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    });
  }
};

/**
 * Pobiera i sortuje partie według metody rezerwacji
 * @private
 */
const getSortedBatchesForReservation = async (itemId, reservationMethod) => {
  const batchesRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_BATCHES);
  const q = query(
    batchesRef, 
    where('itemId', '==', itemId),
    where('quantity', '>', 0)
  );
  
  const batchesSnapshot = await getDocs(q);
  const batches = batchesSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
  
  // Sortuj partie według wybranej metody
  if (reservationMethod === RESERVATION_METHODS.FIFO) {
    // FIFO - sortuj według daty przyjęcia (najstarsze pierwsze)
    batches.sort((a, b) => {
      const dateA = convertTimestampToDate(a.receivedDate) || new Date(0);
      const dateB = convertTimestampToDate(b.receivedDate) || new Date(0);
      return dateA - dateB;
    });
  } else {
    // Domyślnie FEFO: według daty ważności (najkrótszy termin pierwszy)
    batches.sort((a, b) => {
      const dateA = convertTimestampToDate(a.expiryDate) || new Date(9999, 11, 31);
      const dateB = convertTimestampToDate(b.expiryDate) || new Date(9999, 11, 31);
      return dateA - dateB;
    });
  }
  
  return batches;
};

/**
 * Wybiera partie do rezerwacji
 * @private
 */
const selectBatchesForReservation = async (batches, quantity, taskId, batchId, item, existingReservation = null) => {
  const reservedBatches = [];
  let remainingQuantity = quantity;
  let selectedBatchId = batchId || '';
  let selectedBatchNumber = '';
  
  if (batchId) {
    // Ręczny wybór konkretnej partii
    const selectedBatch = batches.find(batch => batch.id === batchId);
    
    if (!selectedBatch) {
      throw new Error(`Nie znaleziono partii o ID ${batchId}`);
    }
    
    // Sprawdź dostępność w partii
    const batchReservations = await getBatchReservations(batchId);
    const batchBookedQuantity = batchReservations.reduce((sum, reservation) => {
      // Jeśli jest to istniejąca rezerwacja dla tego zadania, nie wliczaj jej do blokady
      if (reservation.taskId === taskId) return sum;
      return sum + (reservation.quantity || 0);
    }, 0);
    
    const effectivelyAvailableInBatch = preciseSubtract(selectedBatch.quantity, batchBookedQuantity);
    
    if (preciseIsLessThan(effectivelyAvailableInBatch, quantity)) {
      throw new Error(`Niewystarczająca ilość w partii po uwzględnieniu rezerwacji. 
      Dostępne fizycznie: ${selectedBatch.quantity} ${item.unit}, 
      Zarezerwowane przez inne MO: ${batchBookedQuantity} ${item.unit}, 
      Efektywnie dostępne: ${effectivelyAvailableInBatch} ${item.unit},
      Wymagane: ${quantity} ${item.unit}`);
    }
    
    selectedBatchId = selectedBatch.id;
    selectedBatchNumber = selectedBatch.batchNumber || selectedBatch.lotNumber || 'Bez numeru';
    
    reservedBatches.push({
      batchId: selectedBatch.id,
      quantity: quantity,
      batchNumber: selectedBatchNumber
    });
    
    remainingQuantity = 0;
  } else {
    // Automatyczna rezerwacja - uwzględnij istniejące rezerwacje
    const batchReservationsPromises = batches.map(batch => getBatchReservations(batch.id));
    const batchReservationsArrays = await Promise.all(batchReservationsPromises);
    
    const batchReservationsMap = {};
    batches.forEach((batch, idx) => {
      const batchReservations = batchReservationsArrays[idx];
      const totalReserved = batchReservations.reduce((sum, reservation) => {
        if (reservation.taskId === taskId) return sum;
        return sum + (reservation.quantity || 0);
      }, 0);
      
      batchReservationsMap[batch.id] = totalReserved;
    });
    
    // Przydziel partie automatycznie
    for (const batch of batches) {
      if (remainingQuantity <= 0) break;
      
      const reservedForThisBatch = batchReservationsMap[batch.id] || 0;
      const effectivelyAvailable = Math.max(0, preciseSubtract(batch.quantity, reservedForThisBatch));
      
      if (preciseIsLessOrEqual(effectivelyAvailable, 0)) continue;
      
      const quantityFromBatch = Math.min(effectivelyAvailable, remainingQuantity);
      if (preciseIsLessOrEqual(quantityFromBatch, 0)) continue;
      
      remainingQuantity -= quantityFromBatch;
      
      if (!selectedBatchId) {
        selectedBatchId = batch.id;
        selectedBatchNumber = batch.batchNumber || batch.lotNumber || 'Bez numeru';
      }
      
      reservedBatches.push({
        batchId: batch.id,
        quantity: quantityFromBatch,
        batchNumber: batch.batchNumber || batch.lotNumber || 'Bez numeru'
      });
    }
    
    // 🔧 NOWA LOGIKA: Nie rzucaj błędu - pozwól na częściową rezerwację
    // System teraz rezerwuje tyle ile jest dostępne, nawet jeśli nie wystarcza pełna ilość
    if (!preciseIsLessOrEqual(remainingQuantity, 0)) {
      const reservedQuantity = preciseSubtract(quantity, remainingQuantity);
      console.warn(`⚠️ Częściowa rezerwacja w selectBatchesForReservation: zarezerwowano ${reservedQuantity} ${item.unit} z wymaganych ${quantity} ${item.unit}, brakuje ${remainingQuantity} ${item.unit}`);
    }
  }
  
  return { reservedBatches, selectedBatchId, selectedBatchNumber };
};



/**
 * Aktualizuje istniejącą rezerwację
 * @private
 */
const updateExistingReservation = async (existingReservation, itemId, newQuantity, taskId, userId, item, taskData) => {
  try {
    const oldQuantity = existingReservation.quantity || 0;
    const quantityDiff = newQuantity - oldQuantity;
    
    console.log(`🔄 [REFACTOR] Aktualizacja rezerwacji: ${oldQuantity} → ${newQuantity} (${quantityDiff > 0 ? '+' : ''}${quantityDiff})`);
    
    // Jeśli nowa ilość jest 0 lub ujemna, usuń rezerwację
    if (newQuantity <= 0) {
      console.log('🗑️ [REFACTOR] Usuwanie rezerwacji z powodu quantity <= 0');
      return await deleteReservation(existingReservation.id, userId);
    }
    
    // Aktualizuj bookedQuantity w pozycji magazynowej
    await updateItemBookedQuantity(itemId, item, quantityDiff, userId, 'add');
    
    // Aktualizuj rezerwację w bazie danych
    const reservationRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY_TRANSACTIONS, existingReservation.id);
    await updateDoc(reservationRef, {
      quantity: newQuantity,
      updatedAt: serverTimestamp(),
      updatedBy: userId,
      notes: `Zaktualizowano ilość z ${oldQuantity} na ${newQuantity} ${item.unit}`
    });
    
    // Aktualizuj materialBatches w zadaniu (jeśli nie jest to CMR)
    if (!taskData.isCmrReservation && taskData && taskData.taskExists) {
      const taskRef = FirebaseQueryBuilder.getDocRef('productionTasks', taskId);
      const materialBatches = taskData.materialBatches || {};
      
      if (materialBatches[itemId] && existingReservation.batchId) {
        const existingBatchIndex = materialBatches[itemId].findIndex(b => b.batchId === existingReservation.batchId);
        
        if (existingBatchIndex >= 0) {
          // Aktualizuj ilość w istniejącej partii
          materialBatches[itemId][existingBatchIndex].quantity = newQuantity;
          materialBatches[itemId][existingBatchIndex].batchNumber = existingReservation.batchNumber || 'Bez numeru';
        } else {
          // Dodaj partię jeśli nie istnieje
          materialBatches[itemId] = materialBatches[itemId] || [];
          materialBatches[itemId].push({
            batchId: existingReservation.batchId,
            quantity: newQuantity,
            batchNumber: existingReservation.batchNumber || 'Bez numeru'
          });
        }
        
        await updateDoc(taskRef, {
          materialBatches,
          updatedAt: serverTimestamp()
        });
        
        console.log(`✅ [REFACTOR] Zaktualizowano materialBatches w zadaniu: ${itemId} → ${newQuantity}`);
      }
    }
    
    // Emituj zdarzenie o zmianie stanu magazynu
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('inventory-updated', { 
        detail: { itemId, action: 'reservation_update', quantity: quantityDiff }
      });
      window.dispatchEvent(event);
    }
    
    console.log('🎉 [REFACTOR] updateExistingReservation SUCCESS!');
    return {
      success: true,
      message: `Zaktualizowano rezerwację. Nowa ilość: ${newQuantity} ${item.unit}`,
      reservedBatches: [{
        batchId: existingReservation.batchId,
        quantity: newQuantity,
        batchNumber: existingReservation.batchNumber || 'Bez numeru'
      }]
    };
  } catch (error) {
    console.error('❌ [REFACTOR] updateExistingReservation ERROR:', error);
    throw new Error(`Nie udało się zaktualizować rezerwacji: ${error.message}`);
  }
};

/**
 * Formatuje zarezerwowane partie
 * @private
 */
const formatReservedBatches = (reservedBatches) => {
  return reservedBatches.map(batch => ({
    ...batch,
    batchNumber: batch.batchNumber || batch.lotNumber || `Partia ${batch.batchId.substring(0, 6)}`
  }));
};

/**
 * Tworzy transakcję rezerwacji
 * @private
 */
const createBookingTransaction = async (params) => {
  const {
    itemId,
    item,
    quantity,
    taskId,
    taskData,
    batchId,
    batchNumber,
    reservationMethod,
    userId
  } = params;
  
  const userName = userId || 'System';
  
  const transactionData = {
    itemId,
    itemName: item.name,
    quantity,
    type: TRANSACTION_TYPES.BOOKING,
    reason: taskData.isCmrReservation ? 'Transport CMR' : 'Zadanie produkcyjne',
    referenceId: taskId,
    taskId: taskId,
    taskName: taskData.taskName,
    taskNumber: taskData.taskNumber,
    clientName: taskData.clientName,
    clientId: taskData.clientId,
    notes: taskData.isCmrReservation 
      ? (batchId 
        ? `Zarezerwowano na transport CMR: ${taskData.cmrNumber} (ręczny wybór partii)`
        : `Zarezerwowano na transport CMR: ${taskData.cmrNumber} (metoda: ${reservationMethod})`)
      : (batchId 
        ? `Zarezerwowano na zadanie produkcyjne MO: ${taskData.taskNumber || taskId} (ręczny wybór partii)`
        : `Zarezerwowano na zadanie produkcyjne MO: ${taskData.taskNumber || taskId} (metoda: ${reservationMethod})`),
    batchId: batchId,
    batchNumber: batchNumber,
    userName: userName,
    createdAt: serverTimestamp(),
    createdBy: userId,
    cmrNumber: taskData.isCmrReservation ? taskData.cmrNumber : null
  };
  
  console.log('Tworzenie rezerwacji z danymi:', { 
    taskNumber: taskData.taskNumber, 
    taskName: taskData.taskName 
  });
  
  const transactionRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_TRANSACTIONS);
  await addDoc(transactionRef, transactionData);
};

/**
 * Pobiera oryginalne rezerwacje dla zadania
 * @private
 */
const getOriginalBookings = async (itemId, taskId) => {
  const originalBookingRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_TRANSACTIONS);
  const originalBookingQuery = query(
    originalBookingRef,
    where('itemId', '==', itemId),
    where('referenceId', '==', taskId),
    where('type', '==', TRANSACTION_TYPES.BOOKING)
  );
  return await getDocs(originalBookingQuery);
};

/**
 * Pobiera dane zadania dla anulowania
 * @private
 */
const getTaskData = async (taskId) => {
  try {
    const taskRef = FirebaseQueryBuilder.getDocRef('productionTasks', taskId);
    const taskDoc = await getDoc(taskRef);
    
    if (taskDoc.exists()) {
      const data = taskDoc.data();
      return {
        taskName: data.name || '',
        taskNumber: data.moNumber || data.number || '',
        clientName: data.clientName || data.customer?.name || '',
        clientId: data.clientId || data.customer?.id || ''
      };
    }
    return {
      taskName: '',
      taskNumber: '',
      clientName: '',
      clientId: ''
    };
  } catch (error) {
    console.warn(`Nie udało się pobrać danych zadania ${taskId}:`, error);
    return {
      taskName: '',
      taskNumber: '',
      clientName: '',
      clientId: ''
    };
  }
};

/**
 * Tworzy transakcję anulowania rezerwacji
 * @private
 */
const createCancellationTransaction = async (params) => {
  const { itemId, quantity, taskId, taskData, userId } = params;
  
  const transactionData = {
    itemId,
    type: TRANSACTION_TYPES.BOOKING_CANCEL,
    quantity,
    date: new Date().toISOString(),
    reference: `Zadanie: ${taskId}`,
    notes: `Anulowanie rezerwacji materiału`,
    userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    referenceId: taskId,
    taskName: taskData.taskName,
    taskNumber: taskData.taskNumber,
    clientName: taskData.clientName,
    clientId: taskData.clientId
  };
  
  const transactionRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_TRANSACTIONS);
  return await addDoc(transactionRef, transactionData);
};

/**
 * Aktualizuje status rezerwacji na completed
 * @private
 */
const updateReservationStatus = async (originalBookingSnapshot) => {
  if (originalBookingSnapshot.docs.length > 0) {
    const batch = writeBatch(db);
    
    originalBookingSnapshot.forEach((bookingDoc) => {
      const reservationDocRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY_TRANSACTIONS, bookingDoc.id);
      batch.update(reservationDocRef, { 
        status: RESERVATION_STATUS.COMPLETED,
        updatedAt: serverTimestamp(),
        completedAt: serverTimestamp()
      });
    });
    
    return await batch.commit();
  }
  return null;
};

/**
 * Aktualizuje informacje o partiach w zadaniu przy zmianie rezerwacji
 * @private
 */
const updateTaskBatchesOnReservationChange = async (taskId, itemId, newBatchId, quantityDiff, batchNumber) => {
  try {
    const taskRef = FirebaseQueryBuilder.getDocRef('productionTasks', taskId);
    const taskDoc = await getDoc(taskRef);
    
    if (!taskDoc.exists()) return;
    
    const taskData = taskDoc.data();
    const materialBatches = taskData.materialBatches || {};
    
    if (materialBatches[itemId]) {
      // Aktualizuj informacje o partiach
      if (newBatchId) {
        // Znajdź i zaktualizuj odpowiednią partię
        const batchIndex = materialBatches[itemId].findIndex(b => b.batchId === newBatchId);
        if (batchIndex >= 0) {
          materialBatches[itemId][batchIndex].quantity = preciseAdd(materialBatches[itemId][batchIndex].quantity, quantityDiff);
          materialBatches[itemId][batchIndex].batchNumber = batchNumber;
        }
      }
      
      await updateDoc(taskRef, {
        materialBatches,
        updatedAt: serverTimestamp()
      });
    }
  } catch (error) {
    console.error('Błąd podczas aktualizacji partii w zadaniu:', error);
  }
};

/**
 * Usuwa konkretną rezerwację
 * @param {string} reservationId - ID rezerwacji do usunięcia
 * @param {string} userId - ID użytkownika
 * @returns {Promise<Object>} - Wynik operacji usuwania
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const deleteReservation = async (reservationId, userId) => {
  try {
    // Walidacja parametrów
    const validatedReservationId = validateId(reservationId, 'reservationId');
    const validatedUserId = validateId(userId, 'userId');

    // Pobierz aktualną rezerwację
    const reservationRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY_TRANSACTIONS, validatedReservationId);
    const reservationDoc = await getDoc(reservationRef);
    
    if (!reservationDoc.exists()) {
      throw new Error('Rezerwacja nie istnieje');
    }
    
    const reservation = reservationDoc.data();
    const itemId = reservation.itemId;
    const quantity = reservation.quantity || 0;
    const taskId = reservation.referenceId || reservation.taskId;
    const batchId = reservation.batchId;
    
    if (itemId) {
      // Pobierz aktualny stan produktu
      const item = await getInventoryItemById(itemId);
      
      const bookedQuantity = item.bookedQuantity || 0;
      
      // Oblicz nową wartość bookedQuantity (nie może być ujemna)
      const newBookedQuantity = formatQuantityPrecision(Math.max(0, bookedQuantity - quantity), 3);
      
      // Aktualizuj pole bookedQuantity w produkcie
      const itemRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY, itemId);
      await updateDoc(itemRef, {
        bookedQuantity: newBookedQuantity,
        updatedAt: serverTimestamp(),
        updatedBy: validatedUserId
      });
    }
    
    // Jeśli mamy ID zadania produkcyjnego i ID partii, usuń również referencję z zadania
    if (taskId && batchId) {
      try {
        const taskRef = FirebaseQueryBuilder.getDocRef('productionTasks', taskId);
        const taskDoc = await getDoc(taskRef);
        
        if (taskDoc.exists()) {
          const taskData = taskDoc.data();
          
          // Sprawdź, czy zadanie ma zarezerwowane partie
          if (taskData.materialBatches && taskData.materialBatches[itemId]) {
            // Znajdź i usuń partię z listy
            const updatedBatches = taskData.materialBatches[itemId].filter(
              batch => batch.batchId !== batchId
            );
            
            // Aktualizuj dane zadania
            const materialBatches = { ...taskData.materialBatches };
            
            if (updatedBatches.length === 0) {
              // Jeśli nie zostały żadne partie dla tego materiału, usuń cały klucz
              delete materialBatches[itemId];
            } else {
              materialBatches[itemId] = updatedBatches;
            }
            
            // Sprawdź, czy zostały jakiekolwiek zarezerwowane materiały
            const hasAnyReservations = Object.keys(materialBatches).length > 0;
            
            // Aktualizuj zadanie produkcyjne
            await updateDoc(taskRef, {
              materialBatches,
              materialsReserved: hasAnyReservations,
              updatedAt: serverTimestamp(),
              updatedBy: validatedUserId
            });
            
            console.log(`Usunięto rezerwację partii ${batchId} z zadania produkcyjnego ${taskId}`);
          }
        }
      } catch (error) {
        console.error(`Błąd podczas aktualizacji zadania produkcyjnego ${taskId}:`, error);
        // Kontynuuj mimo błędu
      }
    }
    
    // Usuń rezerwację
    await deleteDoc(reservationRef);
    
    // Emituj zdarzenie o zmianie stanu magazynu
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('inventory-updated', { 
        detail: { itemId, action: 'reservation_delete', quantity, taskId }
      });
      window.dispatchEvent(event);
    }
    
    return {
      success: true,
      message: `Usunięto rezerwację`
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas usuwania rezerwacji:', error);
    throw new Error(`Nie udało się usunąć rezerwacji: ${error.message}`);
  }
};

/**
 * Aktualizuje informacje o zadaniach w rezerwacjach
 * @returns {Promise<Object>} - Wynik operacji aktualizacji
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const updateReservationTasks = async () => {
  try {
    // Pobierz wszystkie transakcje typu booking
    const transactionsRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_TRANSACTIONS);
    const q = query(
      transactionsRef,
      where('type', '==', TRANSACTION_TYPES.BOOKING)
    );
    
    const querySnapshot = await getDocs(q);
    const transactions = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`Znaleziono ${transactions.length} rezerwacji do sprawdzenia`);
    
    const updated = [];
    const notUpdated = [];
    const deletedTasks = [];
    
    // Dla każdej rezerwacji
    for (const transaction of transactions) {
      if (!transaction.taskNumber && transaction.referenceId) {
        try {
          console.log(`Sprawdzanie zadania dla rezerwacji ${transaction.id}`);
          
          // Pobierz zadanie produkcyjne
          const taskRef = FirebaseQueryBuilder.getDocRef('productionTasks', transaction.referenceId);
          const taskDoc = await getDoc(taskRef);
          
          if (taskDoc.exists()) {
            const taskData = taskDoc.data();
            // Sprawdź zarówno pole number jak i moNumber (moNumber jest nowszym polem)
            const taskNumber = taskData.moNumber || taskData.number || '';
            const taskName = taskData.name || '';
            const clientName = taskData.clientName || '';
            const clientId = taskData.clientId || '';
            
            // Jeśli zadanie ma numer MO, zaktualizuj rezerwację
            if (taskNumber) {
              console.log(`Aktualizacja rezerwacji ${transaction.id} - przypisywanie MO: ${taskNumber}`);
              
              const transactionRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY_TRANSACTIONS, transaction.id);
              await updateDoc(transactionRef, {
                taskName,
                taskNumber,
                clientName,
                clientId,
                updatedAt: serverTimestamp()
              });
              
              updated.push({
                id: transaction.id,
                itemName: transaction.itemName,
                moNumber: taskNumber
              });
            } else {
              console.log(`Zadanie ${transaction.referenceId} nie ma numeru MO`);
              notUpdated.push({
                id: transaction.id,
                itemName: transaction.itemName,
                reason: 'Brak numeru MO w zadaniu'
              });
            }
          } else {
            console.log(`Nie znaleziono zadania o ID: ${transaction.referenceId} - zadanie zostało usunięte`);
            deletedTasks.push({
              id: transaction.id,
              itemName: transaction.itemName,
              referenceId: transaction.referenceId
            });
          }
        } catch (error) {
          console.error(`Błąd podczas aktualizacji rezerwacji ${transaction.id}:`, error);
          notUpdated.push({
            id: transaction.id,
            itemName: transaction.itemName,
            reason: `Błąd: ${error.message}`
          });
        }
      } else if (transaction.taskNumber) {
        // Rezerwacja ma już numer zadania, ale sprawdźmy czy zadanie nadal istnieje
        if (transaction.referenceId) {
          try {
            const taskRef = FirebaseQueryBuilder.getDocRef('productionTasks', transaction.referenceId);
            const taskDoc = await getDoc(taskRef);
            
            if (!taskDoc.exists()) {
              // Zadanie zostało usunięte
              console.log(`Zadanie ${transaction.referenceId} dla rezerwacji ${transaction.id} zostało usunięte`);
              deletedTasks.push({
                id: transaction.id,
                itemName: transaction.itemName,
                referenceId: transaction.referenceId
              });
            }
          } catch (error) {
            console.error(`Błąd podczas sprawdzania zadania ${transaction.referenceId}:`, error);
          }
        }
      } else {
        console.log(`Rezerwacja ${transaction.id} nie ma ID referencyjnego zadania`);
        notUpdated.push({
          id: transaction.id,
          itemName: transaction.itemName,
          reason: 'Brak ID referencyjnego zadania'
        });
      }
    }
    
    console.log(`Zaktualizowano ${updated.length} rezerwacji, nie zaktualizowano ${notUpdated.length}, znaleziono ${deletedTasks.length} rezerwacji z usuniętymi zadaniami`);
    
    return {
      updated,
      notUpdated,
      deletedTasks
    };
  } catch (error) {
    console.error('Błąd podczas aktualizacji zadań w rezerwacjach:', error);
    throw new Error(`Błąd podczas aktualizacji zadań w rezerwacjach: ${error.message}`);
  }
};

/**
 * Czyści rezerwacje z usuniętych zadań
 * @returns {Promise<Object>} - Wynik operacji czyszczenia
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const cleanupDeletedTaskReservations = async () => {
  try {
    console.log('Rozpoczynam czyszczenie rezerwacji z usuniętych zadań...');
    
    // Najpierw sprawdź, które zadania zostały usunięte
    const result = await updateReservationTasks();
    
    if (result.deletedTasks.length === 0) {
      console.log('Nie znaleziono rezerwacji z usuniętych zadań');
      return { success: true, message: 'Brak rezerwacji do wyczyszczenia', count: 0 };
    }
    
    const deletedReservations = [];
    const errors = [];
    
    // Dla każdej rezerwacji z usuniętym zadaniem
    for (const reservation of result.deletedTasks) {
      try {
        // Pobierz dane rezerwacji
        const reservationRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY_TRANSACTIONS, reservation.id);
        const reservationDoc = await getDoc(reservationRef);
        
        if (reservationDoc.exists()) {
          const reservationData = reservationDoc.data();
          
          // Pobierz informacje o produkcie
          const itemId = reservationData.itemId;
          const quantity = reservationData.quantity;
          
          if (itemId) {
            // Zaktualizuj stan magazynowy - zmniejsz ilość zarezerwowaną
            const item = await getInventoryItemById(itemId);
            
            const bookedQuantity = item.bookedQuantity || 0;
            
            // Oblicz nową wartość bookedQuantity (nie może być ujemna)
            const newBookedQuantity = formatQuantityPrecision(Math.max(0, bookedQuantity - quantity), 3);
            
            // Aktualizuj pozycję magazynową
            const itemRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY, itemId);
            await updateDoc(itemRef, {
              bookedQuantity: newBookedQuantity,
              updatedAt: serverTimestamp()
            });
            
            console.log(`Zaktualizowano bookedQuantity dla ${itemId}: ${bookedQuantity} -> ${newBookedQuantity}`);
          }
          
          // Usuń rezerwację
          await deleteDoc(reservationRef);
          
          console.log(`Usunięto rezerwację ${reservation.id} dla usuniętego zadania ${reservationData.referenceId}`);
          deletedReservations.push(reservation);
        }
      } catch (error) {
        console.error(`Błąd podczas usuwania rezerwacji ${reservation.id}:`, error);
        errors.push({
          id: reservation.id,
          error: error.message
        });
      }
    }
    
    // Emituj zdarzenie o zmianie stanu magazynu
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('inventory-updated', { 
        detail: { action: 'cleanup-reservations' }
      });
      window.dispatchEvent(event);
    }
    
    return {
      success: true,
      message: `Usunięto ${deletedReservations.length} rezerwacji z usuniętych zadań`,
      count: deletedReservations.length,
      deletedReservations,
      errors
    };
  } catch (error) {
    console.error('Błąd podczas czyszczenia rezerwacji:', error);
    throw new Error(`Błąd podczas czyszczenia rezerwacji: ${error.message}`);
  }
};

/**
 * Synchronizuje bookedQuantity z rzeczywistymi rezerwacjami z partii
 * @param {Object} item - Pozycja magazynowa
 * @param {string} userId - ID użytkownika dla logowania (opcjonalnie)
 * @returns {Promise<Object>} - Pozycja z zaktualizowanym bookedQuantity
 * @throws {Error} - W przypadku krytycznego błędu (nie blokuje procesu rezerwacji)
 */
export const synchronizeBookedQuantity = async (item, userId = 'system-sync') => {
  try {
    console.log(`🔄 [SYNC] Rozpoczynam synchronizację bookedQuantity dla ${item.name} (ID: ${item.id})...`);
    
    // 1. Pobierz wszystkie partie dla pozycji
    const allBatches = await getItemBatches(item.id);
    
    if (!allBatches || allBatches.length === 0) {
      console.log(`ℹ️ [SYNC] Brak partii dla pozycji ${item.name} - bookedQuantity powinno być 0`);
      
      // Jeśli brak partii, a bookedQuantity > 0, to wyzeruj
      if (item.bookedQuantity > 0) {
        console.warn(`⚠️ [SYNC] Znaleziono bookedQuantity=${item.bookedQuantity} dla pozycji bez partii - zerowanie`);
        
        const itemRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY, item.id);
        await updateDoc(itemRef, {
          bookedQuantity: 0,
          lastSynchronized: serverTimestamp(),
          updatedAt: serverTimestamp(),
          updatedBy: userId
        });
        
        item.bookedQuantity = 0;
        console.log(`✅ [SYNC] Wyzerowano bookedQuantity dla pozycji bez partii`);
      }
      
      return item;
    }
    
    // 2. Pobierz wszystkie aktywne rezerwacje dla wszystkich partii
    const batchIds = allBatches.map(batch => batch.id);
    const batchReservationsMap = await getReservationsForMultipleBatches(batchIds);
    
    // 3. Oblicz rzeczywistą sumę rezerwacji
    let actualBookedQuantity = 0;
    let reservationCount = 0;
    
    Object.entries(batchReservationsMap).forEach(([batchId, reservations]) => {
      if (reservations && reservations.length > 0) {
        reservations.forEach(reservation => {
          // Uwzględnij tylko aktywne rezerwacje (nie anulowane i nie completed)
          if (!reservation.status || reservation.status === 'active' || reservation.status === 'pending') {
            actualBookedQuantity = preciseAdd(actualBookedQuantity, parseFloat(reservation.quantity || 0));
            reservationCount++;
          }
        });
      }
    });
    
    // 4. Formatuj z precyzją
    actualBookedQuantity = formatQuantityPrecision(actualBookedQuantity, 3);
    const currentBookedQuantity = formatQuantityPrecision(item.bookedQuantity || 0, 3);
    
    // 5. Sprawdź czy są rozbieżności (z tolerancją na błędy zaokrąglenia)
    const discrepancy = Math.abs(actualBookedQuantity - currentBookedQuantity);
    const tolerance = 0.001; // 0.001 jednostki tolerancji
    
    if (discrepancy > tolerance) {
      console.warn(`⚠️ [SYNC] ROZBIEŻNOŚĆ w bookedQuantity dla ${item.name}:
        📊 Zapisane w pozycji: ${currentBookedQuantity} ${item.unit}
        🔍 Rzeczywiste z rezerwacji: ${actualBookedQuantity} ${item.unit}
        📈 Różnica: ${formatQuantityPrecision(discrepancy, 3)} ${item.unit}
        📋 Liczba aktywnych rezerwacji: ${reservationCount}
        🗂️ Partie z rezerwacjami: ${Object.keys(batchReservationsMap).length}`);
      
      // 6. Aktualizuj pozycję magazynową
      const itemRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY, item.id);
      await updateDoc(itemRef, {
        bookedQuantity: actualBookedQuantity,
        lastSynchronized: serverTimestamp(),
        synchronizationDiscrepancy: discrepancy,
        updatedAt: serverTimestamp(),
        updatedBy: userId,
        syncMetadata: {
          oldValue: currentBookedQuantity,
          newValue: actualBookedQuantity,
          reservationCount,
          batchCount: Object.keys(batchReservationsMap).length,
          syncReason: 'automatic-synchronization'
        }
      });
      
      console.log(`✅ [SYNC] Zsynchronizowano bookedQuantity: ${currentBookedQuantity} → ${actualBookedQuantity} ${item.unit}`);
      
      // Zaktualizuj lokalny obiekt
      item.bookedQuantity = actualBookedQuantity;
      
      // Dodatkowe logowanie dla większych rozbieżności
      if (discrepancy > 1.0) {
        console.error(`🚨 [SYNC] DUŻA ROZBIEŻNOŚĆ (${discrepancy} ${item.unit}) dla pozycji ${item.name}! Wymaga analizy.`);
      }
      
    } else {
      console.log(`✅ [SYNC] bookedQuantity jest zgodne (${currentBookedQuantity} ${item.unit}, ${reservationCount} rezerwacji)`);
      
      // Zaktualizuj timestamp ostatniej synchronizacji nawet jeśli nie było rozbieżności
      const itemRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY, item.id);
      await updateDoc(itemRef, {
        lastSynchronized: serverTimestamp(),
        updatedBy: userId
      });
    }
    
    return item;
    
  } catch (error) {
    console.error(`❌ [SYNC] Błąd podczas synchronizacji bookedQuantity dla ${item.name}:`, error);
    
    // W przypadku błędu nie blokuj procesu rezerwacji - zwróć oryginalną pozycję
    // ale zaloguj problem do dalszej analizy
    console.warn(`⚠️ [SYNC] Kontynuuję bez synchronizacji dla pozycji ${item.name} ze względu na błąd`);
    
    return item;
  }
};

/**
 * Synchronizuje bookedQuantity dla wszystkich pozycji magazynowych w systemie
 * Funkcja użyteczna dla administratorów do naprawienia rozbieżności w całym systemie
 * @param {string} userId - ID użytkownika wykonującego synchronizację
 * @param {number} batchSize - Rozmiar batch'a do przetwarzania (domyślnie 50)
 * @returns {Promise<Object>} - Statystyki synchronizacji
 * @throws {Error} - W przypadku krytycznego błędu
 */
export const synchronizeAllBookedQuantities = async (userId = 'system-sync', batchSize = 50) => {
  console.log('🚀 [SYNC-ALL] Rozpoczynam synchronizację bookedQuantity dla wszystkich pozycji...');
  
  const stats = {
    totalItems: 0,
    synchronized: 0,
    discrepancies: 0,
    errors: 0,
    totalDiscrepancyValue: 0,
    largestDiscrepancy: 0,
    startTime: new Date(),
    endTime: null,
    processedBatches: 0,
    errorDetails: []
  };
  
  try {
    // 1. Pobierz wszystkie pozycje magazynowe w batch'ach
    let hasMore = true;
    let page = 1;
    
    while (hasMore) {
      console.log(`📦 [SYNC-ALL] Przetwarzanie batch'a ${page} (rozmiar: ${batchSize})...`);
      
      const itemsResponse = await getAllInventoryItems(
        null, // warehouseId - wszystkie magazyny
        page,
        batchSize
      );
      
      const items = itemsResponse.items || [];
      stats.totalItems += items.length;
      stats.processedBatches++;
      
      if (items.length === 0) {
        hasMore = false;
        break;
      }
      
      // 2. Synchronizuj każdą pozycję w tym batch'u
      for (const item of items) {
        try {
          console.log(`🔄 [SYNC-ALL] Synchronizacja pozycji: ${item.name} (${stats.totalItems - items.length + items.indexOf(item) + 1}/${stats.totalItems})`);
          
          const originalBookedQuantity = item.bookedQuantity || 0;
          const synchronizedItem = await synchronizeBookedQuantity(item, userId);
          
          stats.synchronized++;
          
          // Sprawdź czy była rozbieżność
          const newBookedQuantity = synchronizedItem.bookedQuantity || 0;
          const discrepancy = Math.abs(newBookedQuantity - originalBookedQuantity);
          
          if (discrepancy > 0.001) {
            stats.discrepancies++;
            stats.totalDiscrepancyValue += discrepancy;
            
            if (discrepancy > stats.largestDiscrepancy) {
              stats.largestDiscrepancy = discrepancy;
            }
            
            console.log(`📊 [SYNC-ALL] Rozbieżność w ${item.name}: ${originalBookedQuantity} → ${newBookedQuantity} (różnica: ${discrepancy})`);
          }
          
        } catch (error) {
          stats.errors++;
          stats.errorDetails.push({
            itemId: item.id,
            itemName: item.name,
            error: error.message
          });
          
          console.error(`❌ [SYNC-ALL] Błąd synchronizacji pozycji ${item.name}:`, error);
        }
      }
      
      // 3. Sprawdź czy są kolejne strony
      if (items.length < batchSize) {
        hasMore = false;
      } else {
        page++;
      }
      
      // Krótka pauza między batch'ami żeby nie przeciążać systemu
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    stats.endTime = new Date();
    const durationMs = stats.endTime - stats.startTime;
    const durationMin = Math.round(durationMs / 60000 * 100) / 100;
    
    console.log(`✅ [SYNC-ALL] Synchronizacja zakończona!
      📊 Statystyki:
      - Łącznie pozycji: ${stats.totalItems}
      - Zsynchronizowano: ${stats.synchronized}
      - Znalezione rozbieżności: ${stats.discrepancies}
      - Błędy: ${stats.errors}
      - Łączna wartość rozbieżności: ${stats.totalDiscrepancyValue.toFixed(3)}
      - Największa rozbieżność: ${stats.largestDiscrepancy.toFixed(3)}
      - Czas wykonania: ${durationMin} min
      - Przetworzone batch'e: ${stats.processedBatches}`);
    
    return {
      success: true,
      message: `Zsynchronizowano ${stats.synchronized} pozycji. Znaleziono ${stats.discrepancies} rozbieżności.`,
      stats
    };
    
  } catch (error) {
    stats.endTime = new Date();
    console.error('❌ [SYNC-ALL] Błąd podczas synchronizacji wszystkich pozycji:', error);
    
    return {
      success: false,
      message: `Błąd podczas synchronizacji: ${error.message}`,
      stats
    };
  }
};

/**
 * Sprawdza stan synchronizacji bookedQuantity dla pozycji magazynowej bez wprowadzania zmian
 * @param {string} itemId - ID pozycji magazynowej
 * @returns {Promise<Object>} - Raport stanu synchronizacji
 * @throws {ValidationError} - Gdy ID jest nieprawidłowe
 * @throws {Error} - W przypadku błędu podczas operacji
 */
export const checkBookedQuantitySync = async (itemId) => {
  try {
    // Walidacja ID
    const validatedItemId = validateId(itemId, 'itemId');
    
    console.log(`🔍 [CHECK-SYNC] Sprawdzanie synchronizacji bookedQuantity dla pozycji ${validatedItemId}...`);
    
    // 1. Pobierz pozycję magazynową
    const item = await getInventoryItemById(validatedItemId);
    
    // 2. Pobierz wszystkie partie dla pozycji
    const allBatches = await getItemBatches(validatedItemId);
    
    if (!allBatches || allBatches.length === 0) {
      return {
        itemId: validatedItemId,
        itemName: item.name,
        synchronized: item.bookedQuantity === 0,
        storedBookedQuantity: item.bookedQuantity || 0,
        actualBookedQuantity: 0,
        discrepancy: Math.abs((item.bookedQuantity || 0) - 0),
        reservationCount: 0,
        batchCount: 0,
        batches: [],
        reservations: [],
        lastSynchronized: item.lastSynchronized || null,
        recommendation: item.bookedQuantity === 0 ? 'OK' : 'SYNC_NEEDED'
      };
    }
    
    // 3. Pobierz wszystkie aktywne rezerwacje dla wszystkich partii
    const batchIds = allBatches.map(batch => batch.id);
    const batchReservationsMap = await getReservationsForMultipleBatches(batchIds);
    
    // 4. Oblicz rzeczywistą sumę rezerwacji
    let actualBookedQuantity = 0;
    let reservationCount = 0;
    const allReservations = [];
    
    Object.entries(batchReservationsMap).forEach(([batchId, reservations]) => {
      if (reservations && reservations.length > 0) {
        reservations.forEach(reservation => {
          // Uwzględnij tylko aktywne rezerwacje
          if (!reservation.status || reservation.status === 'active' || reservation.status === 'pending') {
            actualBookedQuantity = preciseAdd(actualBookedQuantity, parseFloat(reservation.quantity || 0));
            reservationCount++;
            allReservations.push({
              ...reservation,
              batchId
            });
          }
        });
      }
    });
    
    // 5. Formatuj z precyzją
    actualBookedQuantity = formatQuantityPrecision(actualBookedQuantity, 3);
    const storedBookedQuantity = formatQuantityPrecision(item.bookedQuantity || 0, 3);
    
    // 6. Oblicz rozbieżność
    const discrepancy = Math.abs(actualBookedQuantity - storedBookedQuantity);
    const tolerance = 0.001;
    const synchronized = discrepancy <= tolerance;
    
    let recommendation = 'OK';
    if (!synchronized) {
      if (discrepancy > 1.0) {
        recommendation = 'URGENT_SYNC_NEEDED';
      } else {
        recommendation = 'SYNC_RECOMMENDED';
      }
    }
    
    const result = {
      itemId: validatedItemId,
      itemName: item.name,
      unit: item.unit,
      synchronized,
      storedBookedQuantity,
      actualBookedQuantity,
      discrepancy: formatQuantityPrecision(discrepancy, 3),
      reservationCount,
      batchCount: allBatches.length,
      batches: allBatches.map(batch => ({
        id: batch.id,
        batchNumber: batch.batchNumber || batch.lotNumber,
        quantity: batch.quantity,
        warehouseId: batch.warehouseId
      })),
      reservations: allReservations.map(res => ({
        id: res.id,
        taskId: res.referenceId || res.taskId,
        batchId: res.batchId,
        quantity: res.quantity,
        status: res.status || 'active',
        createdAt: res.createdAt
      })),
      lastSynchronized: item.lastSynchronized || null,
      recommendation,
      message: synchronized 
        ? `Dane są zsynchronizowane (${storedBookedQuantity} ${item.unit})`
        : `Rozbieżność: zapisane ${storedBookedQuantity} vs rzeczywiste ${actualBookedQuantity} ${item.unit}`
    };
    
    console.log(`📊 [CHECK-SYNC] Wynik sprawdzenia dla ${item.name}: ${synchronized ? 'ZSYNCHRONIZOWANE' : 'ROZBIEŻNOŚĆ'} (${discrepancy} ${item.unit})`);
    
    return result;
    
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error(`❌ [CHECK-SYNC] Błąd podczas sprawdzania synchronizacji dla pozycji ${itemId}:`, error);
    throw new Error(`Nie udało się sprawdzić synchronizacji: ${error.message}`);
  }
};