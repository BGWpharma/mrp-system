// src/services/inventory/batchTransferService.js

import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  query, 
  where,
  writeBatch,
  serverTimestamp,
  updateDoc
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { COLLECTIONS, TRANSACTION_TYPES } from './config/constants.js';
import { validateId, ValidationError } from './utils/validators.js';
import { getBatchReservations } from './batchService.js';

/**
 * 🔄 SYSTEM TRANSFERU PARTII
 * 
 * Ten moduł zawiera zaawansowane funkcje do obsługi transferu partii
 * między różnymi lokalizacjami z automatyczną aktualizacją:
 * - Rezerwacji materiałów
 * - MaterialBatches w zadaniach produkcyjnych
 * - Historii transferów
 * 
 * Obsługuje różne typy transferów:
 * - Partial: Częściowy transfer części wolnej
 * - Full: Pełny transfer całej partii
 * - Merge: Łączenie partii
 * - Specific: Transfer konkretnej rezerwacji MO
 */

/**
 * Aktualizuje rezerwacje przy transferze partii między lokalizacjami
 * @param {string} sourceBatchId - ID partii źródłowej
 * @param {string} targetBatchId - ID partii docelowej
 * @param {number} transferQuantity - Ilość do przeniesienia
 * @param {number} sourceRemainingQuantity - Pozostała ilość w partii źródłowej
 * @param {string} selectedTransferSource - ID konkretnej rezerwacji lub 'free'
 * @param {string} userId - ID użytkownika wykonującego transfer
 * @param {string} transferType - Typ transferu: 'partial', 'full', 'merge'
 * @returns {Promise<Object>} - Wynik operacji z listą zaktualizowanych rezerwacji
 * @throws {ValidationError} - Gdy parametry są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas transferu
 */
export const updateReservationsOnBatchTransfer = async (
  sourceBatchId, 
  targetBatchId, 
  transferQuantity, 
  sourceRemainingQuantity, 
  selectedTransferSource, 
  userId,
  transferType = 'partial'
) => {
  try {
    // Walidacja parametrów
    const validatedSourceBatchId = validateId(sourceBatchId, 'sourceBatchId');
    const validatedTargetBatchId = validateId(targetBatchId, 'targetBatchId');
    const validatedUserId = validateId(userId, 'userId');
    
    const parsedTransferQuantity = parseFloat(transferQuantity);
    const parsedSourceRemainingQuantity = parseFloat(sourceRemainingQuantity);
    
    if (isNaN(parsedTransferQuantity) || parsedTransferQuantity <= 0) {
      throw new ValidationError('Ilość transferu musi być liczbą większą od zera', 'transferQuantity');
    }
    
    if (isNaN(parsedSourceRemainingQuantity) || parsedSourceRemainingQuantity < 0) {
      throw new ValidationError('Pozostała ilość musi być liczbą nieujemną', 'sourceRemainingQuantity');
    }
    
    const validTransferTypes = ['partial', 'full', 'merge'];
    if (!validTransferTypes.includes(transferType)) {
      throw new ValidationError(`Nieprawidłowy typ transferu. Dozwolone: ${validTransferTypes.join(', ')}`, 'transferType');
    }

    console.log(`🔄 Rozpoczynam aktualizację rezerwacji przy transferze partii...`);
    console.log(`Source: ${validatedSourceBatchId}, Target: ${validatedTargetBatchId}, Qty: ${parsedTransferQuantity}, Type: ${transferType}`);
    console.log(`Selected source: ${selectedTransferSource}`);
    
    // Pobierz wszystkie aktywne rezerwacje dla partii źródłowej
    const sourceReservations = await getBatchReservations(validatedSourceBatchId);
    
    if (sourceReservations.length === 0) {
      console.log('✅ Brak rezerwacji do aktualizacji');
      return { success: true, message: 'Brak rezerwacji do aktualizacji' };
    }
    
    console.log(`📋 Znaleziono ${sourceReservations.length} rezerwacji do aktualizacji`);
    
    const batch = writeBatch(db);
    const results = [];
    const errors = [];
    
    // Sprawdź czy transfer dotyczy konkretnej rezerwacji czy części wolnej
    if (selectedTransferSource && selectedTransferSource !== 'free') {
      // Transfer konkretnej rezerwacji MO
      await handleSpecificReservationTransfer(
        validatedSourceBatchId, 
        validatedTargetBatchId, 
        selectedTransferSource, 
        parsedTransferQuantity, 
        validatedUserId, 
        batch, 
        results, 
        errors
      );
    } else {
      // Transfer części wolnej lub pełny transfer
      await handleGeneralBatchTransfer(
        validatedSourceBatchId,
        validatedTargetBatchId,
        parsedTransferQuantity,
        parsedSourceRemainingQuantity,
        transferType,
        sourceReservations,
        validatedUserId,
        batch,
        results,
        errors
      );
    }
    
    // Wykonaj wszystkie aktualizacje transakcji w jednej transakcji
    if (batch._mutations && batch._mutations.length > 0) {
      await batch.commit();
      console.log(`✅ Zaktualizowano ${results.length} transakcji rezerwacji`);
    }
    
    // AKTUALIZACJA MATERIALBATCHES W ZADANIACH PRODUKCYJNYCH
    try {
      console.log(`🔄 Rozpoczynam aktualizację materialBatches w zadaniach MO...`);
      const materialBatchesUpdateResult = await updateMaterialBatchesOnTransfer(
        validatedSourceBatchId,
        validatedTargetBatchId,
        parsedTransferQuantity,
        selectedTransferSource,
        transferType,
        results
      );
      console.log(`✅ Aktualizacja materialBatches zakończona:`, materialBatchesUpdateResult);
    } catch (materialBatchesError) {
      console.error(`❌ Błąd podczas aktualizacji materialBatches:`, materialBatchesError);
      errors.push(`Błąd aktualizacji materialBatches: ${materialBatchesError.message}`);
    }
    
    return {
      success: true,
      message: `Zaktualizowano ${results.length} rezerwacji i materialBatches w zadaniach MO`,
      results,
      errors,
      transferType,
      transferQuantity: parsedTransferQuantity,
      sourceRemainingQuantity: parsedSourceRemainingQuantity
    };
    
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('❌ Błąd podczas aktualizacji rezerwacji przy transferze:', error);
    throw new Error(`Błąd transferu partii: ${error.message}`);
  }
};

// ===== FUNKCJE POMOCNICZE - OBSŁUGA RÓŻNYCH TYPÓW TRANSFERÓW =====

/**
 * Obsługuje transfer konkretnej rezerwacji MO
 * @private
 */
const handleSpecificReservationTransfer = async (
  sourceBatchId, 
  targetBatchId, 
  reservationId, 
  transferQuantity, 
  userId, 
  batch, 
  results, 
  errors
) => {
  try {
    console.log(`🎯 Obsługuję transfer konkretnej rezerwacji: ${reservationId}`);
    console.log(`   - sourceBatchId: ${sourceBatchId}`);
    console.log(`   - targetBatchId: ${targetBatchId}`);
    console.log(`   - transferQuantity: ${transferQuantity}`);
    
    // Znajdź konkretną rezerwację w transakcjach
    let reservationDoc = null;
    let reservationData = null;
    
    try {
      const directDocRef = doc(db, COLLECTIONS.INVENTORY_TRANSACTIONS, reservationId);
      const directDoc = await getDoc(directDocRef);
      
      if (directDoc.exists() && directDoc.data().type === TRANSACTION_TYPES.BOOKING && directDoc.data().batchId === sourceBatchId) {
        reservationDoc = directDoc;
        reservationData = directDoc.data();
        console.log(`✅ Znaleziono rezerwację bezpośrednio po ID: ${reservationId}`);
      }
    } catch (error) {
      console.log('Nie udało się znaleźć rezerwacji bezpośrednio po ID, szukam w kolekcji...');
    }
    
    // Jeśli nie znaleziono bezpośrednio, przeszukaj wszystkie rezerwacje dla tej partii
    if (!reservationDoc) {
      const transactionsRef = collection(db, COLLECTIONS.INVENTORY_TRANSACTIONS);
      const reservationQuery = query(
        transactionsRef,
        where('type', '==', TRANSACTION_TYPES.BOOKING),
        where('batchId', '==', sourceBatchId)
      );
      
      const querySnapshot = await getDocs(reservationQuery);
      const foundReservation = querySnapshot.docs.find(doc => 
        doc.id === reservationId || 
        doc.data().referenceId === reservationId ||
        doc.data().taskId === reservationId
      );
      
      if (foundReservation) {
        reservationDoc = foundReservation;
        reservationData = foundReservation.data();
        console.log(`✅ Znaleziono rezerwację w kolekcji: ${foundReservation.id}`);
      }
    }
    
    if (!reservationDoc || !reservationData) {
      errors.push(`Nie znaleziono rezerwacji ${reservationId} dla partii ${sourceBatchId}`);
      return;
    }
    
    const reservedQuantity = parseFloat(reservationData.quantity || 0);
    const transferQty = parseFloat(transferQuantity);
    
    console.log(`📊 Znaleziona rezerwacja - szczegóły:`);
    console.log(`   - ID: ${reservationDoc.id}`);
    console.log(`   - taskId: ${reservationData.taskId}`);
    console.log(`   - referenceId: ${reservationData.referenceId}`);
    console.log(`   - itemId: ${reservationData.itemId}`);
    console.log(`   - batchId: ${reservationData.batchId}`);
    console.log(`   - quantity (zarezerwowana): ${reservedQuantity}`);
    console.log(`   - quantity (do transferu): ${transferQty}`);
    
    if (transferQty >= reservedQuantity) {
      // Przenosimy całą rezerwację
      await handleFullReservationTransfer(
        reservationDoc,
        reservationData,
        sourceBatchId,
        targetBatchId,
        reservedQuantity,
        userId,
        batch,
        results
      );
    } else {
      // Dzielimy rezerwację
      await handlePartialReservationTransfer(
        reservationDoc,
        reservationData,
        sourceBatchId,
        targetBatchId,
        transferQty,
        reservedQuantity,
        userId,
        batch,
        results
      );
    }
    
  } catch (error) {
    console.error(`❌ Błąd podczas obsługi rezerwacji ${reservationId}:`, error);
    errors.push(`Błąd rezerwacji ${reservationId}: ${error.message}`);
  }
};

/**
 * Obsługuje pełny transfer rezerwacji
 * @private
 */
const handleFullReservationTransfer = async (
  reservationDoc,
  reservationData,
  sourceBatchId,
  targetBatchId,
  reservedQuantity,
  userId,
  batch,
  results
) => {
  // Sprawdź czy istnieje już podobna rezerwacja w partii docelowej
  const taskIdentifier = reservationData.taskId || reservationData.referenceId;
  
  console.log(`🔍 [DEBUG] Szukam istniejących rezerwacji w partii docelowej:`);
  console.log(`   - targetBatchId: ${targetBatchId}`);
  console.log(`   - taskIdentifier: ${taskIdentifier}`);
  console.log(`   - itemId: ${reservationData.itemId}`);
  console.log(`   - reservationData.taskId: ${reservationData.taskId}`);
  console.log(`   - reservationData.referenceId: ${reservationData.referenceId}`);
  
  // Pierwsza próba - po referenceId
  let targetReservationsQuery = query(
    collection(db, COLLECTIONS.INVENTORY_TRANSACTIONS),
    where('batchId', '==', targetBatchId),
    where('type', '==', TRANSACTION_TYPES.BOOKING),
    where('referenceId', '==', taskIdentifier),
    where('itemId', '==', reservationData.itemId)
  );
  
  let targetReservationsSnapshot = await getDocs(targetReservationsQuery);
  let existingReservations = targetReservationsSnapshot.docs.map(doc => ({
    id: doc.id,
    ref: doc.ref,
    ...doc.data()
  }));
  
  console.log(`📋 [DEBUG] Pierwsza próba (po referenceId): znaleziono ${existingReservations.length} rezerwacji`);
  
  // Jeśli nie znaleziono, spróbuj po taskId (starszy format)
  if (existingReservations.length === 0) {
    console.log(`📋 Nie znaleziono po referenceId, sprawdzam po taskId...`);
    targetReservationsQuery = query(
      collection(db, COLLECTIONS.INVENTORY_TRANSACTIONS),
      where('batchId', '==', targetBatchId),
      where('type', '==', TRANSACTION_TYPES.BOOKING),
      where('taskId', '==', taskIdentifier),
      where('itemId', '==', reservationData.itemId)
    );
    
    targetReservationsSnapshot = await getDocs(targetReservationsQuery);
    existingReservations = targetReservationsSnapshot.docs.map(doc => ({
      id: doc.id,
      ref: doc.ref,
      ...doc.data()
    }));
    
    console.log(`📋 [DEBUG] Druga próba (po taskId): znaleziono ${existingReservations.length} rezerwacji`);
  }
  
  // Dodatkowe sprawdzenie - wszystkie rezerwacje w partii docelowej
  console.log(`🔍 [DEBUG] Sprawdzam WSZYSTKIE rezerwacje w partii docelowej ${targetBatchId}:`);
  const allTargetReservationsQuery = query(
    collection(db, COLLECTIONS.INVENTORY_TRANSACTIONS),
    where('batchId', '==', targetBatchId),
    where('type', '==', TRANSACTION_TYPES.BOOKING)
  );
  const allTargetSnapshot = await getDocs(allTargetReservationsQuery);
  allTargetSnapshot.docs.forEach((doc, idx) => {
    const data = doc.data();
    console.log(`   ${idx + 1}. ID: ${doc.id}, taskId: ${data.taskId}, referenceId: ${data.referenceId}, itemId: ${data.itemId}, quantity: ${data.quantity}`);
  });
  
  console.log(`📊 Znaleziono ${existingReservations.length} istniejących rezerwacji dla tego MO w partii docelowej`);
  
  if (existingReservations.length > 0) {
    // Istnieje już rezerwacja - połącz z nią
    const existingReservation = existingReservations[0];
    const newTotalQuantity = parseFloat(existingReservation.quantity || 0) + reservedQuantity;
    
    console.log(`🔗 Łączę rezerwacje: ${existingReservation.quantity} + ${reservedQuantity} = ${newTotalQuantity}`);
    
    batch.update(existingReservation.ref, {
      quantity: newTotalQuantity,
      updatedAt: serverTimestamp(),
      updatedBy: userId,
      notes: (existingReservation.notes || '') + `\n[${new Date().toISOString()}] Połączono z rezerwacją ${reservationDoc.id} z partii ${sourceBatchId} (dodano ${reservedQuantity})`,
      lastMergeAt: serverTimestamp(),
      mergedFromReservation: reservationDoc.id,
      mergedFromBatch: sourceBatchId
    });
    
    // Usuń oryginalną rezerwację
    batch.delete(reservationDoc.ref);
    
    results.push({
      reservationId: reservationDoc.id,
      action: 'merged_into_existing',
      quantity: reservedQuantity,
      mergedIntoReservation: existingReservation.id,
      newTotalQuantity,
      fromBatch: sourceBatchId,
      toBatch: targetBatchId
    });
  } else {
    // Brak istniejącej rezerwacji - po prostu przenieś
    batch.update(reservationDoc.ref, {
      batchId: targetBatchId,
      updatedAt: serverTimestamp(),
      updatedBy: userId,
      notes: (reservationData.notes || '') + `\n[${new Date().toISOString()}] Przeniesiono całą rezerwację (${reservedQuantity}) z partii ${sourceBatchId} do ${targetBatchId}`,
      lastTransferAt: serverTimestamp()
    });
    
    results.push({
      reservationId: reservationDoc.id,
      action: 'moved_full',
      quantity: reservedQuantity,
      fromBatch: sourceBatchId,
      toBatch: targetBatchId
    });
  }
};

/**
 * Obsługuje częściowy transfer rezerwacji (podział)
 * @private
 */
const handlePartialReservationTransfer = async (
  reservationDoc,
  reservationData,
  sourceBatchId,
  targetBatchId,
  transferQty,
  reservedQuantity,
  userId,
  batch,
  results
) => {
  const remainingQuantity = reservedQuantity - transferQty;
  
  // Aktualizuj oryginalną rezerwację (zmniejsz ilość)
  batch.update(reservationDoc.ref, {
    quantity: remainingQuantity,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
    notes: (reservationData.notes || '') + `\n[${new Date().toISOString()}] Podzielono rezerwację: ${remainingQuantity} pozostało w partii ${sourceBatchId}, ${transferQty} przeniesiono do ${targetBatchId}`,
    lastTransferAt: serverTimestamp()
  });
  
  // Sprawdź czy istnieje już rezerwacja dla tego MO w partii docelowej
  const taskIdentifier = reservationData.taskId || reservationData.referenceId;
  
  console.log(`🔍 [DEBUG PARTIAL] Szukam istniejących rezerwacji w partii docelowej:`);
  console.log(`   - targetBatchId: ${targetBatchId}`);
  console.log(`   - taskIdentifier: ${taskIdentifier}`);
  console.log(`   - itemId: ${reservationData.itemId}`);
  console.log(`   - transferQty: ${transferQty}`);
  console.log(`   - reservedQuantity: ${reservedQuantity}`);
  console.log(`   - remainingQuantity: ${remainingQuantity}`);
  
  // Pierwsza próba - po referenceId
  let targetReservationsQuery = query(
    collection(db, COLLECTIONS.INVENTORY_TRANSACTIONS),
    where('batchId', '==', targetBatchId),
    where('type', '==', TRANSACTION_TYPES.BOOKING),
    where('referenceId', '==', taskIdentifier),
    where('itemId', '==', reservationData.itemId)
  );
  
  let targetReservationsSnapshot = await getDocs(targetReservationsQuery);
  let existingReservations = targetReservationsSnapshot.docs.map(doc => ({
    id: doc.id,
    ref: doc.ref,
    ...doc.data()
  }));
  
  console.log(`📋 [DEBUG PARTIAL] Pierwsza próba (po referenceId): znaleziono ${existingReservations.length} rezerwacji`);
  
  // Jeśli nie znaleziono, spróbuj po taskId (starszy format)
  if (existingReservations.length === 0) {
    console.log(`📋 Nie znaleziono po referenceId, sprawdzam po taskId...`);
    targetReservationsQuery = query(
      collection(db, COLLECTIONS.INVENTORY_TRANSACTIONS),
      where('batchId', '==', targetBatchId),
      where('type', '==', TRANSACTION_TYPES.BOOKING),
      where('taskId', '==', taskIdentifier),
      where('itemId', '==', reservationData.itemId)
    );
    
    targetReservationsSnapshot = await getDocs(targetReservationsQuery);
    existingReservations = targetReservationsSnapshot.docs.map(doc => ({
      id: doc.id,
      ref: doc.ref,
      ...doc.data()
    }));
    
    console.log(`📋 [DEBUG PARTIAL] Druga próba (po taskId): znaleziono ${existingReservations.length} rezerwacji`);
  }
  
      console.log(`📊 Znaleziono ${existingReservations.length} istniejących rezerwacji dla tego MO w partii docelowej`);
    
    if (existingReservations.length > 0) {
      // Istnieje już rezerwacja - dodaj do niej przeniesioną ilość
      const existingReservation = existingReservations[0];
      const newTotalQuantity = parseFloat(existingReservation.quantity || 0) + transferQty;
      
      console.log(`🔗 [PARTIAL] Łączę z istniejącą rezerwacją: ${existingReservation.quantity} + ${transferQty} = ${newTotalQuantity}`);
      
      batch.update(existingReservation.ref, {
        quantity: newTotalQuantity,
        updatedAt: serverTimestamp(),
        updatedBy: userId,
        notes: (existingReservation.notes || '') + `\n[${new Date().toISOString()}] Dodano ${transferQty} z podzielonej rezerwacji ${reservationDoc.id}`,
        lastMergeAt: serverTimestamp(),
        mergedFromSplitReservation: reservationDoc.id
      });
      
      results.push({
        originalReservationId: reservationDoc.id,
        existingReservationId: existingReservation.id,
        action: 'split_and_merged',
        remainingQuantity,
        transferredQuantity: transferQty,
        newTotalQuantity,
        fromBatch: sourceBatchId,
        toBatch: targetBatchId
      });
      
      console.log(`✅ [PARTIAL] Zaktualizowano istniejącą rezerwację ${existingReservation.id}`);
    } else {
      // Brak istniejącej rezerwacji - utwórz nową
      console.log(`➕ [PARTIAL] Tworzę NOWĄ rezerwację dla podzielonej części`);
      
      const newReservationData = {
        ...reservationData,
        quantity: transferQty,
        batchId: targetBatchId,
        createdAt: serverTimestamp(),
        createdBy: userId,
        notes: `Utworzono przez podział rezerwacji ${reservationDoc.id}. Przeniesiono ${transferQty} do partii ${targetBatchId}`,
        originalReservationId: reservationDoc.id,
        splitFromReservation: true,
        updatedAt: serverTimestamp(),
        updatedBy: userId
      };
      
      const newReservationRef = doc(collection(db, COLLECTIONS.INVENTORY_TRANSACTIONS));
      batch.set(newReservationRef, newReservationData);
      
      results.push({
        originalReservationId: reservationDoc.id,
        newReservationId: newReservationRef.id,
        action: 'split',
        remainingQuantity,
        transferredQuantity: transferQty,
        fromBatch: sourceBatchId,
        toBatch: targetBatchId
      });
      
      console.log(`✅ [PARTIAL] Utworzono nową rezerwację ${newReservationRef.id}`);
    }
};

/**
 * Obsługuje ogólny transfer partii (część wolna lub pełny transfer)
 * @private
 */
const handleGeneralBatchTransfer = async (
  sourceBatchId,
  targetBatchId,
  transferQuantity,
  sourceRemainingQuantity,
  transferType,
  sourceReservations,
  userId,
  batch,
  results,
  errors
) => {
  try {
    console.log(`🔄 Obsługuję ogólny transfer: ${transferType}`);
    
    if (transferType === 'full') {
      // Pełny transfer - wszystkie rezerwacje przechodzą na nową partię
      console.log(`📦 Pełny transfer - przenoszę ${sourceReservations.length} rezerwacji`);
      
      for (const reservation of sourceReservations) {
        const reservationRef = doc(db, COLLECTIONS.INVENTORY_TRANSACTIONS, reservation.id);
        
        batch.update(reservationRef, {
          batchId: targetBatchId,
          updatedAt: serverTimestamp(),
          updatedBy: userId,
          notes: (reservation.notes || '') + `\n[${new Date().toISOString()}] Przeniesiono przez pełny transfer partii z ${sourceBatchId} do ${targetBatchId}`,
          lastTransferAt: serverTimestamp()
        });
        
        results.push({
          reservationId: reservation.id,
          action: 'moved_full_batch',
          quantity: reservation.quantity,
          fromBatch: sourceBatchId,
          toBatch: targetBatchId
        });
      }
    } else if (transferType === 'partial') {
      // Częściowy transfer części wolnej - rezerwacje pozostają w partii źródłowej
      console.log('ℹ️ Transfer części wolnej - rezerwacje pozostają w partii źródłowej');
      
      results.push({
        action: 'free_part_transfer',
        message: `Przeniesiono ${transferQuantity} z części wolnej. Rezerwacje pozostają w partii źródłowej.`,
        fromBatch: sourceBatchId,
        toBatch: targetBatchId
      });
    } else if (transferType === 'merge') {
      // Łączenie partii - zaawansowana logika łączenia rezerwacji
      await handleMergeTransfer(
        sourceBatchId,
        targetBatchId,
        sourceReservations,
        userId,
        batch,
        results
      );
    }
    
  } catch (error) {
    console.error('❌ Błąd podczas ogólnej obsługi transferu:', error);
    errors.push(`Błąd ogólnej obsługi: ${error.message}`);
  }
};

/**
 * Obsługuje łączenie partii (merge)
 * @private
 */
const handleMergeTransfer = async (
  sourceBatchId,
  targetBatchId,
  sourceReservations,
  userId,
  batch,
  results
) => {
  console.log(`🔗 Łączenie partii - sprawdzam rezerwacje w partii docelowej i źródłowej`);
  
  // Pobierz istniejące rezerwacje w partii docelowej
  const targetReservationsQuery = query(
    collection(db, COLLECTIONS.INVENTORY_TRANSACTIONS),
    where('batchId', '==', targetBatchId),
    where('type', '==', TRANSACTION_TYPES.BOOKING)
  );
  
  const targetReservationsSnapshot = await getDocs(targetReservationsQuery);
  const targetReservations = targetReservationsSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
  
  console.log(`📊 Znaleziono ${targetReservations.length} istniejących rezerwacji w partii docelowej`);
  console.log(`📊 Przenoszę ${sourceReservations.length} rezerwacji z partii źródłowej`);
  
  // Grupuj rezerwacje według klucza (taskId/referenceId + itemId)
  const mergeGroups = {};
  
  // Dodaj istniejące rezerwacje do grup
  targetReservations.forEach(reservation => {
    const key = `${reservation.taskId || reservation.referenceId}_${reservation.itemId}`;
    if (!mergeGroups[key]) {
      mergeGroups[key] = { target: null, sources: [] };
    }
    mergeGroups[key].target = reservation;
  });
  
  // Dodaj source rezerwacje do grup
  sourceReservations.forEach(reservation => {
    const key = `${reservation.taskId || reservation.referenceId}_${reservation.itemId}`;
    if (!mergeGroups[key]) {
      mergeGroups[key] = { target: null, sources: [] };
    }
    mergeGroups[key].sources.push(reservation);
  });
  
  console.log(`🗂️ Utworzono ${Object.keys(mergeGroups).length} grup do łączenia`);
  
  // Przetwórz każdą grupę
  for (const [groupKey, group] of Object.entries(mergeGroups)) {
    console.log(`🔄 Przetwarzam grupę: ${groupKey}`);
    
    if (group.target && group.sources.length > 0) {
      // Istnieje rezerwacja docelowa - połącz z nią source rezerwacje
      await mergeSourcesWithTarget(group, batch, results, sourceBatchId, targetBatchId, userId);
    } else if (group.sources.length > 0 && !group.target) {
      // Brak rezerwacji docelowej - przenieś source rezerwacje
      await moveSourcesWithoutTarget(group, batch, results, sourceBatchId, targetBatchId, userId);
    }
  }
};

/**
 * Łączy rezerwacje źródłowe z istniejącą docelową
 * @private
 */
const mergeSourcesWithTarget = async (group, batch, results, sourceBatchId, targetBatchId, userId) => {
  const totalSourceQuantity = group.sources.reduce((sum, res) => sum + parseFloat(res.quantity || 0), 0);
  const newTotalQuantity = parseFloat(group.target.quantity || 0) + totalSourceQuantity;
  
  // Aktualizuj rezerwację docelową
  const targetRef = doc(db, COLLECTIONS.INVENTORY_TRANSACTIONS, group.target.id);
  batch.update(targetRef, {
    quantity: newTotalQuantity,
    updatedAt: serverTimestamp(),
    updatedBy: userId,
    notes: (group.target.notes || '') + `\n[${new Date().toISOString()}] Połączono z ${group.sources.length} rezerwacjami z partii ${sourceBatchId} (dodano ${totalSourceQuantity})`,
    lastMergeAt: serverTimestamp(),
    mergedFromBatch: sourceBatchId,
    mergedReservationsCount: group.sources.length
  });
  
  // Usuń source rezerwacje
  group.sources.forEach(sourceRes => {
    const sourceRef = doc(db, COLLECTIONS.INVENTORY_TRANSACTIONS, sourceRes.id);
    batch.delete(sourceRef);
    
    results.push({
      reservationId: sourceRes.id,
      action: 'merged_and_deleted',
      quantity: sourceRes.quantity,
      mergedIntoReservation: group.target.id,
      fromBatch: sourceBatchId,
      toBatch: targetBatchId
    });
  });
  
  results.push({
    reservationId: group.target.id,
    action: 'updated_with_merge',
    originalQuantity: parseFloat(group.target.quantity || 0),
    addedQuantity: totalSourceQuantity,
    newTotalQuantity,
    mergedReservationsCount: group.sources.length,
    fromBatch: sourceBatchId,
    toBatch: targetBatchId
  });
};

/**
 * Przenosi rezerwacje źródłowe bez docelowej
 * @private
 */
const moveSourcesWithoutTarget = async (group, batch, results, sourceBatchId, targetBatchId, userId) => {
  if (group.sources.length === 1) {
    // Jedna rezerwacja - po prostu zmień batchId
    const sourceRes = group.sources[0];
    const sourceRef = doc(db, COLLECTIONS.INVENTORY_TRANSACTIONS, sourceRes.id);
    
    batch.update(sourceRef, {
      batchId: targetBatchId,
      updatedAt: serverTimestamp(),
      updatedBy: userId,
      notes: (sourceRes.notes || '') + `\n[${new Date().toISOString()}] Przeniesiono przez łączenie partii z ${sourceBatchId} do ${targetBatchId}`,
      lastTransferAt: serverTimestamp()
    });
    
    results.push({
      reservationId: sourceRes.id,
      action: 'moved_merge',
      quantity: sourceRes.quantity,
      fromBatch: sourceBatchId,
      toBatch: targetBatchId
    });
  } else {
    // Wiele rezerwacji - połącz je w jedną
    const totalQuantity = group.sources.reduce((sum, res) => sum + parseFloat(res.quantity || 0), 0);
    const primaryRes = group.sources[0];
    const primaryRef = doc(db, COLLECTIONS.INVENTORY_TRANSACTIONS, primaryRes.id);
    
    // Aktualizuj pierwszą rezerwację
    batch.update(primaryRef, {
      batchId: targetBatchId,
      quantity: totalQuantity,
      updatedAt: serverTimestamp(),
      updatedBy: userId,
      notes: (primaryRes.notes || '') + `\n[${new Date().toISOString()}] Połączono ${group.sources.length} rezerwacji przy łączeniu partii ${sourceBatchId} -> ${targetBatchId} (łączna ilość: ${totalQuantity})`,
      lastTransferAt: serverTimestamp(),
      mergedReservationsCount: group.sources.length,
      originalReservations: group.sources.map(res => ({ id: res.id, quantity: res.quantity }))
    });
    
    // Usuń pozostałe rezerwacje
    for (let i = 1; i < group.sources.length; i++) {
      const sourceRef = doc(db, COLLECTIONS.INVENTORY_TRANSACTIONS, group.sources[i].id);
      batch.delete(sourceRef);
      
      results.push({
        reservationId: group.sources[i].id,
        action: 'merged_and_deleted',
        quantity: group.sources[i].quantity,
        mergedIntoReservation: primaryRes.id,
        fromBatch: sourceBatchId,
        toBatch: targetBatchId
      });
    }
    
    results.push({
      reservationId: primaryRes.id,
      action: 'updated_as_merged_primary',
      totalQuantity,
      mergedReservationsCount: group.sources.length,
      fromBatch: sourceBatchId,
      toBatch: targetBatchId
    });
  }
};

/**
 * Aktualizuje materialBatches w zadaniach produkcyjnych po transferze partii
 * @private
 */
const updateMaterialBatchesOnTransfer = async (
  sourceBatchId,
  targetBatchId,
  transferQuantity,
  selectedTransferSource,
  transferType,
  transactionResults
) => {
  try {
    console.log(`🔍 Szukam zadań MO z materialBatches zawierającymi partię: ${sourceBatchId}`);
    
    // Pobierz wszystkie zadania produkcyjne które zawierają referencje do sourceBatchId w materialBatches
    const tasksRef = collection(db, 'productionTasks');
    const tasksSnapshot = await getDocs(tasksRef);
    
    const tasksToUpdate = [];
    const tasksData = [];
    
    // Znajdź zadania które zawierają sourceBatchId w materialBatches
    tasksSnapshot.docs.forEach(doc => {
      const taskData = doc.data();
      if (taskData.materialBatches) {
        Object.entries(taskData.materialBatches).forEach(([materialId, batches]) => {
          const hasBatch = batches.some(batch => batch.batchId === sourceBatchId);
          if (hasBatch) {
            tasksToUpdate.push({
              id: doc.id,
              ref: doc.ref,
              materialId,
              taskData
            });
            tasksData.push({
              id: doc.id,
              moNumber: taskData.moNumber,
              materialId
            });
          }
        });
      }
    });
    
    console.log(`📋 Znaleziono ${tasksToUpdate.length} zadań MO do aktualizacji:`, tasksData);
    
    if (tasksToUpdate.length === 0) {
      return { success: true, message: 'Brak zadań MO do aktualizacji' };
    }
    
    // Przygotuj batch do aktualizacji zadań MO
    const tasksBatch = writeBatch(db);
    const updateResults = [];
    
    for (const task of tasksToUpdate) {
      const { taskData, materialId, ref } = task;
      let materialBatches = { ...taskData.materialBatches };
      let batchesArray = [...materialBatches[materialId]];
      
      console.log(`🔧 Aktualizuję materialBatches dla MO ${taskData.moNumber}, materiał ${materialId}`);
      console.log(`📊 [DEBUG MATERIAL] Szczegóły:`);
      console.log(`   - transferType: ${transferType}`);
      console.log(`   - selectedTransferSource: ${selectedTransferSource}`);
      console.log(`   - sourceBatchId: ${sourceBatchId}`);
      console.log(`   - targetBatchId: ${targetBatchId}`);
      console.log(`   - batchesArray.length: ${batchesArray.length}`);
      
      // Aktualizuj batchId zgodnie z typem transferu
      for (let i = 0; i < batchesArray.length; i++) {
        console.log(`🔍 [BATCH ${i}] Sprawdzam partię:`, batchesArray[i]);
        if (batchesArray[i].batchId === sourceBatchId) {
          console.log(`✅ [BATCH ${i}] Znaleziono partię do aktualizacji!`);
          if (transferType === 'full' || transferType === 'merge') {
            console.log(`🔄 [BATCH ${i}] Aktualizuję dla full/merge`);
            // Pełny transfer lub łączenie - zmień batchId
            batchesArray[i] = {
              ...batchesArray[i],
              batchId: targetBatchId,
              transferNotes: `${transferType === 'full' ? 'Pełny transfer' : 'Łączenie partii'} z ${sourceBatchId}`,
              lastTransferAt: new Date().toISOString()
            };
            updateResults.push({
              taskId: task.id,
              moNumber: taskData.moNumber,
              action: `${transferType}_mo_update`,
              fromBatch: sourceBatchId,
              toBatch: targetBatchId
            });
          } else if (transferType === 'partial' && selectedTransferSource && selectedTransferSource !== 'free') {
            console.log(`🔄 [BATCH ${i}] Aktualizuję dla partial z konkretną rezerwacją`);
            
            // UWAGA: Przy partial transfer konkretnej rezerwacji:
            // 1. Jeśli to była CAŁA rezerwacja (transferQty >= reservedQuantity) - zmień batchId
            // 2. Jeśli to był PODZIAŁ rezerwacji (transferQty < reservedQuantity) - dodaj NOWĄ pozycję
            
            // Sprawdź czy to pełny transfer rezerwacji czy podział
            const isFullReservationTransfer = transactionResults.some(result => 
              result.action === 'merged_into_existing' || result.action === 'moved_full'
            );
            const isPartialSplit = transactionResults.some(result => 
              result.action === 'split' || result.action === 'split_and_merged'
            );
            
            console.log(`🔍 [BATCH ${i}] Typ operacji:`);
            console.log(`   - isFullReservationTransfer: ${isFullReservationTransfer}`);
            console.log(`   - isPartialSplit: ${isPartialSplit}`);
            
            if (isPartialSplit) {
              // PODZIAŁ: Dodaj nową pozycję dla przeniesionej części
              console.log(`✂️ [BATCH ${i}] PODZIAŁ - dodaję nową pozycję dla przeniesionej części`);
              
              const transferredQuantity = transactionResults.find(r => r.action === 'split' || r.action === 'split_and_merged')?.transferredQuantity || 0;
              const remainingQuantity = batchesArray[i].quantity - transferredQuantity;
              
              // Zmniejsz ilość w oryginalnej pozycji
              batchesArray[i] = {
                ...batchesArray[i],
                quantity: remainingQuantity,
                transferNotes: `Podzielono partię - pozostało ${remainingQuantity}`,
                lastTransferAt: new Date().toISOString()
              };
              
              // Dodaj nową pozycję dla przeniesionej części
              batchesArray.push({
                ...batchesArray[i],
                batchId: targetBatchId,
                quantity: transferredQuantity,
                transferNotes: `Przeniesiona część z ${sourceBatchId}`,
                lastTransferAt: new Date().toISOString()
              });
              
            } else {
              // PEŁNY TRANSFER: Po prostu zmień batchId
              console.log(`🔄 [BATCH ${i}] PEŁNY TRANSFER - zmieniam batchId`);
              batchesArray[i] = {
                ...batchesArray[i],
                batchId: targetBatchId,
                transferNotes: `Transfer konkretnej rezerwacji z ${sourceBatchId}`,
                lastTransferAt: new Date().toISOString()
              };
            }
            
            updateResults.push({
              taskId: task.id,
              moNumber: taskData.moNumber,
              action: isPartialSplit ? 'partial_split_mo_update' : 'partial_specific_reservation_mo_update',
              fromBatch: sourceBatchId,
              toBatch: targetBatchId
            });
          } else {
            console.log(`⏸️ [BATCH ${i}] Pomijam aktualizację - warunki nie spełnione:`);
            console.log(`   - transferType: ${transferType}`);
            console.log(`   - selectedTransferSource: ${selectedTransferSource}`);
            console.log(`   - selectedTransferSource !== 'free': ${selectedTransferSource !== 'free'}`);
          }
          // Dla 'partial' przy transferze części wolnej (selectedTransferSource === 'free') - nie zmieniamy nic
        }
      }
      
      // Zaktualizuj materialBatches w zadaniu
      materialBatches[materialId] = batchesArray;
      
      // GRUPOWANIE: Połącz partie z tym samym batchId (ALE NIE przy podziale)
      const hasPartialSplit = updateResults.some(result => result.action === 'partial_split_mo_update');
      
      console.log(`🔍 [GROUPING] Sprawdzam czy grupować partie:`);
      console.log(`   - hasPartialSplit: ${hasPartialSplit}`);
      
      if (!hasPartialSplit) {
        // Normalne grupowanie - łącz partie z tym samym batchId
        console.log(`🔗 [GROUPING] Normalnie grupuję partie`);
        const groupedBatches = {};
        materialBatches[materialId].forEach(batch => {
          const key = batch.batchId;
          if (groupedBatches[key]) {
            // Połącz z istniejącą partią
            groupedBatches[key].quantity = parseFloat(groupedBatches[key].quantity || 0) + parseFloat(batch.quantity || 0);
            // Zachowaj najnowsze transferNotes
            if (batch.transferNotes) {
              groupedBatches[key].transferNotes = batch.transferNotes;
            }
            if (batch.lastTransferAt) {
              groupedBatches[key].lastTransferAt = batch.lastTransferAt;
            }
          } else {
            // Dodaj nową partię
            groupedBatches[key] = { ...batch };
          }
        });
        
        // Zastąp array zgrupowanymi partiami
        materialBatches[materialId] = Object.values(groupedBatches);
      } else {
        // Podział partii - NIE grupuj, zachowaj obie pozycje
        console.log(`✂️ [GROUPING] PODZIAŁ - nie grupuję, zachowuję obie pozycje`);
      }
      
      console.log(`💾 [SAVE] Zapisuję zaktualizowane materialBatches dla MO ${taskData.moNumber}`);
      console.log(`   - Ilość wyników do dodania: ${updateResults.length}`);
      console.log(`   - Partie przed grupowaniem: ${batchesArray.length}`);
      console.log(`   - Partie po grupowaniu: ${materialBatches[materialId].length}`);
      
      tasksBatch.update(ref, {
        materialBatches,
        updatedAt: serverTimestamp(),
        lastBatchTransferUpdate: serverTimestamp()
      });
    }
    
    // Wykonaj aktualizację wszystkich zadań MO
    await tasksBatch.commit();
    console.log(`✅ Zaktualizowano materialBatches w ${tasksToUpdate.length} zadaniach MO`);
    
    return {
      success: true,
      message: `Zaktualizowano materialBatches w ${tasksToUpdate.length} zadaniach MO`,
      updatedTasks: updateResults
    };
    
  } catch (error) {
    console.error('❌ Błąd podczas aktualizacji materialBatches w zadaniach MO:', error);
    throw new Error(`Błąd aktualizacji materialBatches: ${error.message}`);
  }
};