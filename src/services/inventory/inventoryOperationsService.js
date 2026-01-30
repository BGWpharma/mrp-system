// src/services/inventory/inventoryOperationsService.js

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
  increment,
  Timestamp
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { 
  COLLECTIONS, 
  TRANSACTION_TYPES,
  FIREBASE_LIMITS 
} from './config/constants.js';
import { 
  validateId, 
  validatePositiveNumber,
  validateTransactionData,
  ValidationError 
} from './utils/validators.js';
import { 
  formatQuantityPrecision,
  convertTimestampToDate 
} from './utils/formatters.js';
import { preciseAdd } from '../../utils/mathUtils.js';
import { FirebaseQueryBuilder } from './config/firebaseQueries.js';
import { generateLOTNumber } from '../../utils/numberGenerators.js';

/**
 * Usługa operacji magazynowych
 * 
 * Ten moduł zawiera główne operacje biznesowe związane z ruchem towaru:
 * - Przyjęcie towaru (receiveInventory)
 * - Wydanie towaru (issueInventory)
 * - Algorytmy rezerwacji (FIFO/FEFO)
 * - Przeliczanie stanów magazynowych
 */

/**
 * Przyjęcie towaru (zwiększenie stanu) z datą ważności
 * @param {string} itemId - ID pozycji magazynowej
 * @param {number} quantity - Ilość przyjmowanego towaru
 * @param {Object} transactionData - Dane transakcji
 * @param {string} userId - ID użytkownika wykonującego operację
 * @returns {Promise<Object>} - Wynik operacji przyjęcia
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const receiveInventory = async (itemId, quantity, transactionData, userId) => {
  try {
    // Walidacja parametrów wejściowych
    const validatedItemId = validateId(itemId, 'itemId');
    const validatedQuantity = formatQuantityPrecision(validatePositiveNumber(quantity, 'quantity'));
    const validatedUserId = validateId(userId, 'userId');
    
    // Sprawdź, czy podano warehouseId - jest wymagany
    if (!transactionData.warehouseId) {
      throw new ValidationError('Należy określić magazyn dla przyjęcia towaru', 'warehouseId');
    }
    
    validateId(transactionData.warehouseId, 'warehouseId');
    
    // Pobierz bieżącą pozycję magazynową
    const { getInventoryItemById } = await import('../inventory');
    const currentItem = await getInventoryItemById(validatedItemId);
    
    if (!currentItem) {
      throw new Error('Pozycja magazynowa nie istnieje');
    }
    
    // Skopiuj dane transakcji, aby nie modyfikować oryginalnego obiektu
    const transactionCopy = { ...transactionData };
    
    // Usuń certificateFile z danych transakcji - nie można zapisać obiektu File w Firestore
    if (transactionCopy.certificateFile) {
      delete transactionCopy.certificateFile;
    }
    
    // Przygotuj dane transakcji
    const transaction = {
      itemId: validatedItemId,
      itemName: currentItem.name,
      type: TRANSACTION_TYPES.RECEIVE,
      quantity: validatedQuantity,
      previousQuantity: currentItem.quantity,
      warehouseId: transactionCopy.warehouseId,
      ...transactionCopy,
      transactionDate: serverTimestamp(),
      createdBy: validatedUserId
    };
    
    // Dodaj dodatkowe pola dotyczące pochodzenia
    ['moNumber', 'orderNumber', 'orderId', 'source', 'sourceId'].forEach(field => {
      if (transactionCopy[field]) {
        transaction[field] = transactionCopy[field];
      }
    });
    
    const transactionRef = await addDoc(
      FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_TRANSACTIONS), 
      transaction
    );
    
    // Generuj lub użyj istniejącego numeru partii
    let lotNumber;
    if (transactionData.lotNumber && transactionData.lotNumber.trim() !== '') {
      lotNumber = transactionData.lotNumber.trim();
      console.log('Używam numeru LOT wprowadzonego przez użytkownika:', lotNumber);
    } else {
      lotNumber = await generateLOTNumber();
      console.log('Wygenerowano nowy numer LOT:', lotNumber);
    }
    
    // Przygotuj dane partii
    const batch = {
      itemId: validatedItemId,
      itemName: currentItem.name,
      transactionId: transactionRef.id,
      quantity: validatedQuantity,
      initialQuantity: validatedQuantity,
      batchNumber: transactionData.batchNumber || lotNumber,
      lotNumber: lotNumber,
      warehouseId: transactionData.warehouseId,
      receivedDate: serverTimestamp(),
      notes: transactionData.batchNotes || transactionData.notes || '',
      unitPrice: formatQuantityPrecision(transactionData.unitPrice || 0, 2), // Cena z precyzją 2 miejsca
      createdBy: validatedUserId
    };
    
    // Obsługa certyfikatu, jeśli został przekazany
    if (transactionData.certificateFile) {
      try {
        const certificateData = await processCertificateFile(transactionData.certificateFile, validatedUserId);
        Object.assign(batch, certificateData);
        console.log('Dodano certyfikat do partii:', transactionData.certificateFile.name);
      } catch (certificateError) {
        console.error('Błąd podczas przetwarzania certyfikatu:', certificateError);
        // Nie przerywamy całej operacji, tylko logujemy błąd
      }
    }
    
    // Ustaw datę ważności tylko jeśli została jawnie podana
    if (transactionData.expiryDate) {
      batch.expiryDate = transactionData.expiryDate instanceof Date 
        ? Timestamp.fromDate(transactionData.expiryDate)
        : transactionData.expiryDate;
    }
    
    // Dodaj informacje o pochodzeniu partii
    ['moNumber', 'orderNumber', 'orderId', 'source', 'sourceId'].forEach(field => {
      if (transactionData[field]) {
        batch[field] = transactionData[field];
      }
    });
    
    // Dodaj dodatkowe dane w strukturze sourceDetails
    if (transactionData.source === 'production' || transactionData.reason === 'production') {
      batch.sourceDetails = {
        moNumber: transactionData.moNumber || null,
        orderNumber: transactionData.orderNumber || null,
        orderId: transactionData.orderId || null,
        sourceType: 'production',
        sourceId: transactionData.sourceId || null
      };
    }
    
    // Obsługa zamówień zakupu
    if (transactionData.source === 'purchase' || transactionData.reason === 'purchase') {
      await processPurchaseOrderDetails(batch, transactionData, validatedQuantity);
    }
    
    // Sprawdź czy dodać do istniejącej partii czy utworzyć nową
    const { batchRef, isNewBatch } = await handleBatchCreationOrUpdate(
      batch, 
      transactionData, 
      validatedQuantity, 
      validatedUserId, 
      transactionRef.id
    );
    
    // Przelicz i zaktualizuj ilość głównej pozycji
    await recalculateItemQuantity(validatedItemId);
    
    // Aktualizuj zamówienie zakupowe jeśli dotyczy
    if (transactionData.source === 'purchase' && transactionData.orderId && transactionData.itemPOId) {
      try {
        // Import funkcji do aktualizacji zamówienia zakupowego
        const { updatePurchaseOrderReceivedQuantity } = await import('../purchaseOrderService');
        
        console.log(`Aktualizacja ilości odebranej dla PO ${transactionData.orderId}, produkt ${transactionData.itemPOId}, ilość: ${validatedQuantity}`);
        await updatePurchaseOrderReceivedQuantity(
          transactionData.orderId, 
          transactionData.itemPOId, 
          validatedQuantity,
          validatedUserId
        );
      } catch (error) {
        console.error('Błąd podczas aktualizacji zamówienia zakupowego:', error);
        // Kontynuuj mimo błędu - przyjęcie towaru jest ważniejsze
      }
    }
    
    // Emituj zdarzenie o zmianie stanu magazynu
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('inventory-updated', { 
        detail: { itemId: validatedItemId, action: 'receive', quantity: validatedQuantity }
      });
      window.dispatchEvent(event);
    }
    
    // Wyślij powiadomienia
    try {
      await sendInventoryReceiveNotification({
        itemId: validatedItemId,
        itemName: currentItem.name,
        quantity: validatedQuantity,
        warehouseId: transactionData.warehouseId,
        lotNumber: isNewBatch ? batch.lotNumber : 'LOT dodany do istniejącej partii',
        source: transactionData.source || 'other',
        sourceId: transactionData.sourceId || null,
        userId: validatedUserId,
        isNewBatch
      });
    } catch (notificationError) {
      console.error('Błąd podczas wysyłania powiadomienia o przyjęciu towaru:', notificationError);
      // Kontynuuj mimo błędu - przyjęcie towaru jest ważniejsze
    }
    
    return {
      id: validatedItemId,
      quantity: await getInventoryItemById(validatedItemId).then(item => item.quantity),
      isNewBatch: isNewBatch,
      batchId: isNewBatch ? null : batchRef?.id,
      lotNumber: batch.lotNumber,
      message: isNewBatch 
        ? `Utworzono nową partię LOT: ${batch.lotNumber}` 
        : `Dodano do istniejącej partii dla pozycji PO ${transactionData.itemPOId}`
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas przyjęcia towaru:', error);
    throw new Error(`Nie udało się przyjąć towaru: ${error.message}`);
  }
};

/**
 * Wydanie towaru (zmniejszenie stanu) z uwzględnieniem partii (FEFO)
 * @param {string} itemId - ID pozycji magazynowej
 * @param {number} quantity - Ilość wydawanego towaru
 * @param {Object} transactionData - Dane transakcji
 * @param {string} userId - ID użytkownika wykonującego operację
 * @returns {Promise<Object>} - Wynik operacji wydania
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const issueInventory = async (itemId, quantity, transactionData, userId) => {
  try {
    // Walidacja parametrów wejściowych
    const validatedItemId = validateId(itemId, 'itemId');
    const validatedQuantity = formatQuantityPrecision(validatePositiveNumber(quantity, 'quantity'));
    const validatedUserId = validateId(userId, 'userId');
    
    // Sprawdź, czy podano warehouseId - jest wymagany
    if (!transactionData.warehouseId) {
      throw new ValidationError('Należy określić magazyn dla wydania towaru', 'warehouseId');
    }
    
    validateId(transactionData.warehouseId, 'warehouseId');

    // Pobierz bieżącą pozycję magazynową
    const { getInventoryItemById } = await import('../inventory');
    const currentItem = await getInventoryItemById(validatedItemId);
    
    if (!currentItem) {
      throw new Error('Pozycja magazynowa nie istnieje');
    }
    
    // Pobierz partie w danym magazynie
    const { getItemBatches } = await import('./batchService');
    const batches = await getItemBatches(validatedItemId, transactionData.warehouseId);
    
    // Oblicz dostępną ilość w magazynie (suma ilości we wszystkich partiach)
    const availableQuantity = batches.reduce((sum, batch) => sum + (batch.quantity || 0), 0);
    
    // Sprawdź, czy jest wystarczająca ilość w danym magazynie
    if (availableQuantity < validatedQuantity) {
      throw new Error(`Niewystarczająca ilość towaru w magazynie. Dostępne: ${availableQuantity}, wymagane: ${validatedQuantity}`);
    }
    
    // Przygotuj dane transakcji
    const transaction = {
      itemId: validatedItemId,
      itemName: currentItem.name,
      type: TRANSACTION_TYPES.ISSUE,
      quantity: validatedQuantity,
      previousQuantity: currentItem.quantity,
      warehouseId: transactionData.warehouseId,
      ...transactionData,
      transactionDate: serverTimestamp(),
      createdBy: validatedUserId
    };
    
    await addDoc(
      FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_TRANSACTIONS), 
      transaction
    );
    
    const issuedBatches = [];
    
    // Jeśli podano konkretną partię do wydania
    if (transactionData.batchId) {
      const issuedBatch = await issueFromSpecificBatch(
        transactionData.batchId, 
        validatedQuantity, 
        transactionData.warehouseId
      );
      issuedBatches.push(issuedBatch);
    } else {
      // Automatyczne wydanie według FEFO (First Expired, First Out)
      const batchesIssued = await issueUsingFEFO(batches, validatedQuantity, transactionData.warehouseId);
      issuedBatches.push(...batchesIssued);
    }

    // Przelicz i zaktualizuj ilość głównej pozycji na podstawie partii
    await recalculateItemQuantity(validatedItemId);
    
    // Emituj zdarzenie o zmianie stanu magazynu
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('inventory-updated', { 
        detail: { itemId: validatedItemId, action: 'issue', quantity: validatedQuantity }
      });
      window.dispatchEvent(event);
    }
    
    return {
      success: true,
      issuedBatches,
      message: `Wydano ${validatedQuantity} ${currentItem.unit} produktu ${currentItem.name}`,
      totalIssued: validatedQuantity
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas wydania towaru:', error);
    throw new Error(`Nie udało się wydać towaru: ${error.message}`);
  }
};

/**
 * Pobiera produkty na zasadzie FIFO (First In, First Out)
 * @param {string} itemId - ID pozycji magazynowej
 * @param {number} quantity - Wymagana ilość
 * @param {string} warehouseId - ID magazynu (opcjonalnie)
 * @returns {Promise<Array>} - Lista partii z ilościami do pobrania
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const getProductsFIFO = async (itemId, quantity, warehouseId = null) => {
  try {
    // Walidacja parametrów
    const validatedItemId = validateId(itemId, 'itemId');
    const validatedQuantity = validatePositiveNumber(quantity, 'quantity');
    
    if (warehouseId) {
      validateId(warehouseId, 'warehouseId');
    }

    // Pobierz wszystkie partie danego produktu
    const batchesRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_BATCHES);
    let q = query(batchesRef, where('itemId', '==', validatedItemId));
    
    // Dodaj filtr magazynu jeśli podano
    if (warehouseId) {
      q = query(q, where('warehouseId', '==', warehouseId));
    }
    
    const querySnapshot = await getDocs(q);
    const batches = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Filtruj partie z ilością > 0
    const availableBatches = batches.filter(batch => {
      const batchQuantity = parseFloat(batch.quantity);
      return !isNaN(batchQuantity) && batchQuantity > 0;
    });
    
    if (availableBatches.length === 0) {
      throw new Error(`Brak dostępnych partii produktu w ${warehouseId ? 'magazynie' : 'systemie'}.`);
    }
    
    // Sortuj według daty utworzenia (od najstarszej) - FIFO
    availableBatches.sort((a, b) => {
      const dateA = convertTimestampToDate(a.createdAt) || new Date(0);
      const dateB = convertTimestampToDate(b.createdAt) || new Date(0);
      return dateA - dateB;
    });
    
    // Wybierz partie, które pokryją żądaną ilość
    let remainingQuantity = validatedQuantity;
    const selectedBatches = [];
    
    for (const batch of availableBatches) {
      if (remainingQuantity <= 0) break;
      
      const batchQuantity = parseFloat(batch.quantity);
      const quantityFromBatch = Math.min(batchQuantity, remainingQuantity);
      
      selectedBatches.push({
        ...batch,
        selectedQuantity: formatQuantityPrecision(quantityFromBatch)
      });
      
      remainingQuantity -= quantityFromBatch;
    }
    
    // Sprawdź, czy udało się pokryć całą żądaną ilość
    if (remainingQuantity > 0) {
      throw new Error(`Niewystarczająca ilość produktu. Brakuje: ${formatQuantityPrecision(remainingQuantity)}`);
    }
    
    return selectedBatches;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas pobierania partii metodą FIFO:', error);
    throw new Error(`Nie udało się pobrać partii FIFO: ${error.message}`);
  }
};

/**
 * Pobiera produkty z najkrótszą datą ważności (FEFO - First Expired, First Out)
 * @param {string} itemId - ID pozycji magazynowej
 * @param {number} quantity - Wymagana ilość
 * @param {string} warehouseId - ID magazynu (opcjonalnie)
 * @returns {Promise<Array>} - Lista partii z ilościami do pobrania
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const getProductsFEFO = async (itemId, quantity, warehouseId = null) => {
  try {
    // Walidacja parametrów
    const validatedItemId = validateId(itemId, 'itemId');
    const validatedQuantity = validatePositiveNumber(quantity, 'quantity');
    
    if (warehouseId) {
      validateId(warehouseId, 'warehouseId');
    }

    // Pobierz partie używając funkcji FIFO jako podstawy
    const batches = await getProductsFIFO(validatedItemId, validatedQuantity + 1000, warehouseId); // Pobierz więcej niż potrzeba
    
    // Filtruj partie które mają datę ważności i są dostępne
    const availableBatches = batches.filter(batch => {
      const hasExpiryDate = batch.expiryDate && !isDefaultDate(convertTimestampToDate(batch.expiryDate));
      const hasQuantity = parseFloat(batch.quantity) > 0;
      return hasExpiryDate && hasQuantity;
    });
    
    if (availableBatches.length === 0) {
      // Fallback do FIFO jeśli brak partii z datą ważności
      console.warn('Brak partii z datą ważności, używam FIFO');
      return getProductsFIFO(validatedItemId, validatedQuantity, warehouseId);
    }
    
    // Sortuj według daty ważności (najwcześniej wygasające pierwsze) - FEFO
    availableBatches.sort((a, b) => {
      const dateA = convertTimestampToDate(a.expiryDate);
      const dateB = convertTimestampToDate(b.expiryDate);
      return dateA - dateB;
    });
    
    // Wybierz partie, które pokryją żądaną ilość
    let remainingQuantity = validatedQuantity;
    const selectedBatches = [];
    
    for (const batch of availableBatches) {
      if (remainingQuantity <= 0) break;
      
      const batchQuantity = parseFloat(batch.quantity);
      const quantityFromBatch = Math.min(batchQuantity, remainingQuantity);
      
      selectedBatches.push({
        ...batch,
        selectedQuantity: formatQuantityPrecision(quantityFromBatch)
      });
      
      remainingQuantity -= quantityFromBatch;
    }
    
    // Sprawdź, czy udało się pokryć całą żądaną ilość
    if (remainingQuantity > 0) {
      // Uzupełnij brakującą ilość partiami bez daty ważności (FIFO)
      const batchesWithoutExpiry = batches.filter(batch => {
        const hasNoExpiryDate = !batch.expiryDate || isDefaultDate(convertTimestampToDate(batch.expiryDate));
        const hasQuantity = parseFloat(batch.quantity) > 0;
        return hasNoExpiryDate && hasQuantity;
      });
      
      for (const batch of batchesWithoutExpiry) {
        if (remainingQuantity <= 0) break;
        
        const batchQuantity = parseFloat(batch.quantity);
        const quantityFromBatch = Math.min(batchQuantity, remainingQuantity);
        
        selectedBatches.push({
          ...batch,
          selectedQuantity: formatQuantityPrecision(quantityFromBatch)
        });
        
        remainingQuantity -= quantityFromBatch;
      }
    }
    
    if (remainingQuantity > 0) {
      throw new Error(`Niewystarczająca ilość produktu. Brakuje: ${formatQuantityPrecision(remainingQuantity)}`);
    }
    
    return selectedBatches;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas pobierania partii metodą FEFO:', error);
    throw new Error(`Nie udało się pobrać partii FEFO: ${error.message}`);
  }
};

/**
 * Funkcja do przeliczania i aktualizacji ilości pozycji magazynowej na podstawie sum partii
 * @param {string} itemId - ID pozycji magazynowej
 * @returns {Promise<number>} - Nowa przeliczona ilość
 * @throws {ValidationError} - Gdy ID jest nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const recalculateItemQuantity = async (itemId) => {
  try {
    // Walidacja ID
    const validatedItemId = validateId(itemId, 'itemId');
    
    console.log(`Przeliczanie ilości dla pozycji ${validatedItemId} na podstawie partii...`);
    
    // Sprawdź czy pozycja magazynowa istnieje
    const itemRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY, validatedItemId);
    const itemSnapshot = await getDoc(itemRef);
    
    if (!itemSnapshot.exists()) {
      console.warn(`Pozycja magazynowa ${validatedItemId} nie istnieje - pomijam przeliczanie`);
      return 0;
    }
    
    // Pobierz wszystkie partie dla danej pozycji bezpośrednio z bazy danych
    const batchesRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_BATCHES);
    const q = query(batchesRef, where('itemId', '==', validatedItemId));
    const querySnapshot = await getDocs(q);
    
    let totalQuantity = 0;
    
    // Iteruj po wszystkich partiach i sumuj ich ilości
    querySnapshot.forEach(doc => {
      const batchData = doc.data();
      // Dodaj ilość niezależnie od daty ważności
      totalQuantity = preciseAdd(totalQuantity, Number(batchData.quantity) || 0);
    });
    
    // Formatuj z odpowiednią precyzją
    totalQuantity = formatQuantityPrecision(totalQuantity);
    
    console.log(`Suma ilości z partii: ${totalQuantity}`);
    
    // Zaktualizuj stan głównej pozycji magazynowej
    await updateDoc(itemRef, {
      quantity: totalQuantity,
      lastUpdated: new Date().toISOString()
    });
    
    console.log(`Zaktualizowano ilość pozycji ${validatedItemId} na ${totalQuantity}`);
    
    return totalQuantity;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error(`Błąd podczas przeliczania ilości dla pozycji ${itemId}:`, error);
    throw new Error(`Nie udało się przeliczać ilości: ${error.message}`);
  }
};

/**
 * Funkcja do przeliczania ilości wszystkich pozycji magazynowych na podstawie partii
 * @returns {Promise<Object>} - Wyniki przeliczania
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const recalculateAllInventoryQuantities = async () => {
  try {
    console.log('Rozpoczynam przeliczanie ilości wszystkich pozycji w magazynie...');
    
    // Pobierz wszystkie pozycje magazynowe
    const { getAllInventoryItems } = await import('./inventoryItemsService');
    const inventoryItems = await getAllInventoryItems();
    
    const results = {
      success: 0,
      failed: 0,
      items: []
    };
    
    // Dla każdej pozycji przelicz ilość na podstawie partii
    for (const item of inventoryItems) {
      try {
        const newQuantity = await recalculateItemQuantity(item.id);
        
        results.success++;
        results.items.push({
          id: item.id,
          name: item.name,
          oldQuantity: item.quantity,
          newQuantity: newQuantity,
          difference: formatQuantityPrecision(newQuantity - item.quantity)
        });
        
        console.log(`Zaktualizowano ilość dla "${item.name}" z ${item.quantity} na ${newQuantity}`);
      } catch (error) {
        console.error(`Błąd podczas przeliczania ilości dla pozycji ${item.name} (${item.id}):`, error);
        results.failed++;
        results.items.push({
          id: item.id,
          name: item.name,
          error: error.message
        });
      }
    }
    
    console.log(`Zakończono przeliczanie ilości. Sukces: ${results.success}, Błędy: ${results.failed}`);
    return results;
  } catch (error) {
    console.error('Błąd podczas przeliczania wszystkich ilości:', error);
    throw new Error(`Nie udało się przeliczać wszystkich ilości: ${error.message}`);
  }
};

// ===== FUNKCJE POMOCNICZE =====

/**
 * Przetwarza plik certyfikatu do przechowania w bazie danych
 * @private
 */
const processCertificateFile = async (certificateFile, userId) => {
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
    });
  };
  
  // Konwertuj plik na base64
  const base64Data = await fileToBase64(certificateFile);
  
  // Sprawdź rozmiar pliku po konwersji
  const base64Size = base64Data.length;
  const fileSizeInMB = base64Size / (1024 * 1024);
  
  // Firestore ma limit 1MB na dokument
  if (fileSizeInMB > 0.9) {
    throw new Error(`Plik certyfikatu jest zbyt duży (${fileSizeInMB.toFixed(2)} MB). Maksymalny rozmiar to 0.9 MB.`);
  }
  
  return {
    certificateFileName: certificateFile.name,
    certificateContentType: certificateFile.type,
    certificateBase64: base64Data,
    certificateUploadedAt: serverTimestamp(),
    certificateUploadedBy: userId
  };
};

/**
 * Przetwarza szczegóły zamówienia zakupu
 * @private
 */
const processPurchaseOrderDetails = async (batch, transactionData, quantity) => {
  const poId = transactionData.orderId;
  if (!poId) return;
  
  try {
    const { getPurchaseOrderById } = await import('../purchaseOrderService');
    const poData = await getPurchaseOrderById(poId);
    
    // Zapisz szczegółowe informacje o PO w partii
    batch.purchaseOrderDetails = {
      id: poId,
      number: poData.number || transactionData.orderNumber || null,
      status: poData.status || null,
      supplier: poData.supplier ? {
        id: poData.supplier.id || null,
        name: poData.supplier.name || null,
        code: poData.supplier.code || null
      } : null,
      orderDate: poData.orderDate || null,
      deliveryDate: poData.expectedDeliveryDate || poData.deliveryDate || null,
      itemPoId: transactionData.itemPOId || null,
      invoiceNumber: poData.invoiceNumber || null,
      invoiceLink: poData.invoiceLink || null
    };
    
    // Zapisz również w starszym formacie dla kompatybilności
    batch.sourceDetails = {
      sourceType: 'purchase',
      orderId: poId || null,
      orderNumber: poData.number || transactionData.orderNumber || null,
      supplierId: poData.supplier?.id || null,
      supplierName: poData.supplier?.name || null,
      itemPoId: transactionData.itemPOId || null
    };
    
    // Aktualizuj cenę jednostkową na podstawie dodatkowych kosztów z PO
    await updateBatchPriceWithAdditionalCosts(batch, poData, quantity);
  } catch (error) {
    console.error('Błąd podczas pobierania szczegółów PO:', error);
    // Dodaj podstawowe informacje nawet jeśli wystąpił błąd
    batch.purchaseOrderDetails = {
      id: poId || null,
      number: transactionData.orderNumber || null
    };
    
    batch.sourceDetails = {
      sourceType: 'purchase',
      orderId: poId || null,
      orderNumber: transactionData.orderNumber || null
    };
  }
};

/**
 * Aktualizuje cenę partii na podstawie dodatkowych kosztów z PO
 * @private
 */
const updateBatchPriceWithAdditionalCosts = async (batch, poData, quantity) => {
  if (!poData || (!poData.additionalCostsItems && !poData.additionalCosts)) return;
  
  try {
    let additionalCostsTotal = 0;
    
    // Oblicz sumę dodatkowych kosztów
    if (poData.additionalCostsItems && Array.isArray(poData.additionalCostsItems)) {
      additionalCostsTotal = poData.additionalCostsItems.reduce((sum, cost) => {
        return sum + (parseFloat(cost.value) || 0);
      }, 0);
    } else if (poData.additionalCosts) {
      additionalCostsTotal = parseFloat(poData.additionalCosts) || 0;
    }
    
    // Oblicz całkowitą ilość produktów w zamówieniu
    let totalProductQuantity = 0;
    if (poData.items && Array.isArray(poData.items)) {
      totalProductQuantity = poData.items.reduce((sum, item) => {
        const qty = item.initialQuantity !== undefined ? parseFloat(item.initialQuantity) : parseFloat(item.quantity);
        return sum + (qty || 0);
      }, 0);
    }
    
    // Jeśli mamy dodatkowe koszty i ilość produktów > 0, oblicz dodatkowy koszt na jednostkę
    if (additionalCostsTotal > 0 && totalProductQuantity > 0) {
      const batchQuantity = Number(quantity);
      const batchProportion = batchQuantity / totalProductQuantity;
      const batchAdditionalCostTotal = additionalCostsTotal * batchProportion;
      const additionalCostPerUnit = batchQuantity > 0 ? batchAdditionalCostTotal / batchQuantity : 0;
      
      let baseUnitPrice = parseFloat(batch.unitPrice) || 0;
      
      // Dodaj informację o dodatkowym koszcie jako osobne pole
      batch.additionalCostPerUnit = formatQuantityPrecision(additionalCostPerUnit, 2);
      
      // Aktualizuj cenę jednostkową - dodaj dodatkowy koszt na jednostkę
      batch.unitPrice = formatQuantityPrecision(baseUnitPrice + additionalCostPerUnit, 2);
      
      // Zachowaj oryginalną cenę jednostkową
      batch.baseUnitPrice = formatQuantityPrecision(baseUnitPrice, 2);
      
      console.log(`Zaktualizowano cenę jednostkową partii z ${baseUnitPrice} na ${batch.unitPrice} (dodatkowy koszt: ${additionalCostPerUnit} per jednostka)`);
    }
  } catch (error) {
    console.error('Błąd podczas aktualizacji ceny jednostkowej na podstawie dodatkowych kosztów:', error);
  }
};

/**
 * Obsługuje tworzenie nowej partii lub aktualizację istniejącej
 * @private
 */
const handleBatchCreationOrUpdate = async (batch, transactionData, quantity, userId, transactionId) => {
  let existingBatchRef = null;
  let isNewBatch = true;
  
  // Sprawdź flagi wymuszające określone zachowanie
  const forceAddToExisting = transactionData.forceAddToExisting === true;
  const forceCreateNew = transactionData.forceCreateNew === true;
  
  if (!forceCreateNew && (forceAddToExisting || (transactionData.source === 'purchase' || transactionData.reason === 'purchase'))) {
    // Sprawdź czy istnieje już partia dla tej kombinacji
    if (transactionData.orderId && transactionData.itemPOId && transactionData.warehouseId) {
      console.log(`Sprawdzanie istniejących partii dla PO ${transactionData.orderId}, pozycja ${transactionData.itemPOId}, magazyn ${transactionData.warehouseId}`);
      
      // Wyszukaj istniejącą partię używając nowego formatu danych
      const existingBatchQuery = query(
        FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_BATCHES),
        where('itemId', '==', batch.itemId),
        where('purchaseOrderDetails.id', '==', transactionData.orderId),
        where('purchaseOrderDetails.itemPoId', '==', transactionData.itemPOId),
        where('warehouseId', '==', transactionData.warehouseId)
      );
      
      const existingBatchSnapshot = await getDocs(existingBatchQuery);
      
      if (!existingBatchSnapshot.empty) {
        // Znaleziono istniejącą partię - użyj jej
        const existingBatch = existingBatchSnapshot.docs[0];
        existingBatchRef = existingBatch.ref;
        isNewBatch = false;
        
        console.log(`Znaleziono istniejącą partię ${existingBatch.id} - dodawanie ${quantity} do istniejącej ilości`);
        
        // Aktualizuj istniejącą partię
        await updateDoc(existingBatchRef, {
          quantity: increment(Number(quantity)),
          initialQuantity: increment(Number(quantity)),
          updatedAt: serverTimestamp(),
          updatedBy: userId,
          lastReceiptUpdate: {
            addedQuantity: Number(quantity),
            addedAt: serverTimestamp(),
            transactionId: transactionId
          }
        });
      }
    }
  }
  
  // Jeśli nie znaleziono istniejącej partii, utwórz nową
  if (isNewBatch) {
    console.log('Tworzenie nowej partii...');
    existingBatchRef = await addDoc(
      FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_BATCHES), 
      batch
    );
  }
  
  return { batchRef: existingBatchRef, isNewBatch };
};

/**
 * Wydaje towar z konkretnej partii
 * @private
 */
const issueFromSpecificBatch = async (batchId, quantity, warehouseId) => {
  const batchRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY_BATCHES, batchId);
  const batchDoc = await getDoc(batchRef);
  
  if (!batchDoc.exists()) {
    throw new Error('Wybrana partia nie istnieje');
  }
  
  const batchData = batchDoc.data();
  
  // Sprawdź czy partia jest w wybranym magazynie
  if (batchData.warehouseId !== warehouseId) {
    throw new Error('Wybrana partia nie znajduje się w wybranym magazynie');
  }
  
  if (batchData.quantity < quantity) {
    throw new Error(`Niewystarczająca ilość w wybranej partii. Dostępne: ${batchData.quantity}, wymagane: ${quantity}`);
  }
  
  await updateDoc(batchRef, {
    quantity: increment(-Number(quantity)),
    updatedAt: serverTimestamp()
  });
  
  return {
    batchId: batchId,
    batchNumber: batchData.batchNumber || batchData.lotNumber,
    quantityIssued: quantity,
    remainingQuantity: batchData.quantity - quantity
  };
};

/**
 * Wydaje towar używając algorytmu FEFO
 * @private
 */
const issueUsingFEFO = async (batches, quantity, warehouseId) => {
  let remainingQuantity = Number(quantity);
  const issuedBatches = [];
  
  // Sortuj partie według daty ważności (najwcześniej wygasające pierwsze)
  const sortedBatches = batches
    .filter(batch => batch.quantity > 0 && batch.warehouseId === warehouseId)
    .sort((a, b) => {
      const dateA = convertTimestampToDate(a.expiryDate) || new Date(0);
      const dateB = convertTimestampToDate(b.expiryDate) || new Date(0);
      return dateA - dateB;
    });
  
  for (const batch of sortedBatches) {
    if (remainingQuantity <= 0) break;
    
    const quantityFromBatch = Math.min(batch.quantity, remainingQuantity);
    remainingQuantity -= quantityFromBatch;
    
    // Aktualizuj ilość w partii
    const batchRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY_BATCHES, batch.id);
    await updateDoc(batchRef, {
      quantity: increment(-quantityFromBatch),
      updatedAt: serverTimestamp()
    });
    
    issuedBatches.push({
      batchId: batch.id,
      batchNumber: batch.batchNumber || batch.lotNumber,
      quantityIssued: quantityFromBatch,
      remainingQuantity: batch.quantity - quantityFromBatch,
      expiryDate: batch.expiryDate
    });
  }
  
  return issuedBatches;
};



/**
 * Wysyła powiadomienie o przyjęciu towaru
 * @private
 */
const sendInventoryReceiveNotification = async (notificationData) => {
  try {
    const { getAllUsers } = await import('../userService');
    const { createRealtimeInventoryReceiveNotification } = await import('../notificationService');
    const { getWarehouseById } = await import('./warehouseService');
    
    // Pobierz nazwę magazynu
    const warehouse = await getWarehouseById(notificationData.warehouseId);
    const warehouseName = warehouse?.name || 'Nieznany';
    
    // Pobierz użytkowników z rolami administratora i magazynu do powiadomienia
    const allUsers = await getAllUsers();
    
    // Filtruj użytkowników według ról
    const adminUsers = allUsers.filter(user => user.role === 'administrator');
    const warehouseUsers = allUsers.filter(user => user.role === 'warehouse' || user.role === 'magazynier');
    
    // Stwórz tablicę unikalnych identyfikatorów użytkowników
    const userIdsToNotify = [...new Set([
      ...adminUsers.map(user => user.id),
      ...warehouseUsers.map(user => user.id)
    ])];
    
    if (userIdsToNotify.length > 0) {
      await createRealtimeInventoryReceiveNotification(
        userIdsToNotify,
        notificationData.itemId,
        notificationData.itemName,
        notificationData.quantity,
        notificationData.warehouseId,
        warehouseName,
        notificationData.lotNumber,
        notificationData.source,
        notificationData.sourceId,
        notificationData.userId
      );
      console.log(`Wysłano powiadomienie o ${notificationData.isNewBatch ? 'przyjęciu towaru na magazyn (nowa partia)' : 'dodaniu towaru do istniejącej partii'}`);
    }
  } catch (error) {
    console.error('Błąd podczas wysyłania powiadomienia:', error);
    throw error;
  }
};

/**
 * Pobiera produkty z najkrótszą datą ważności (FEFO - First Expired, First Out)
 * @param {string} itemId - ID pozycji magazynowej
 * @param {number} quantity - Wymagana ilość
 * @returns {Promise<Array>} - Lista wybranych partii z przypisanymi ilościami
 * @throws {ValidationError} - Gdy parametry są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas pobierania
 */
export const getProductsWithEarliestExpiry = async (itemId, quantity) => {
  try {
    // Walidacja parametrów
    const validatedItemId = validateId(itemId, 'itemId');
    const parsedQuantity = parseFloat(quantity);
    
    if (isNaN(parsedQuantity) || parsedQuantity <= 0) {
      throw new ValidationError(`Nieprawidłowa ilość: ${quantity}. Podaj liczbę większą od zera.`, 'quantity');
    }

    // Pobierz wszystkie partie danego produktu
    const batchesRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_BATCHES);
    const q = query(
      batchesRef, 
      where('itemId', '==', validatedItemId)
    );
    
    const querySnapshot = await getDocs(q);
    const batches = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Filtruj partie z ilością > 0 i upewnij się, że quantity jest liczbą
    const availableBatches = batches.filter(batch => {
      const batchQuantity = parseFloat(batch.quantity);
      return !isNaN(batchQuantity) && batchQuantity > 0;
    });
    
    if (availableBatches.length === 0) {
      throw new Error(`Brak dostępnych partii produktu w magazynie.`);
    }
    
    // Filtruj partie, które mają datę ważności (nie null i nie 1.01.1970)
    const batchesWithExpiry = availableBatches.filter(batch => {
      if (!batch.expiryDate) return false;
      
      const expiryDate = batch.expiryDate instanceof Timestamp 
        ? batch.expiryDate.toDate() 
        : new Date(batch.expiryDate);
        
      // Sprawdź czy to nie domyślna/nieprawidłowa data (rok 1970 lub wcześniejszy)
      return expiryDate.getFullYear() > 1970;
    });
    
    // Sortuj według daty ważności (od najwcześniejszej) - FEFO logic
    batchesWithExpiry.sort((a, b) => {
      const dateA = a.expiryDate instanceof Timestamp ? a.expiryDate.toDate() : new Date(a.expiryDate);
      const dateB = b.expiryDate instanceof Timestamp ? b.expiryDate.toDate() : new Date(b.expiryDate);
      return dateA - dateB;
    });
    
    // Dodaj partie bez daty ważności lub z domyślną datą na koniec
    const batchesWithoutExpiry = availableBatches.filter(batch => {
      if (!batch.expiryDate) return true;
      
      const expiryDate = batch.expiryDate instanceof Timestamp 
        ? batch.expiryDate.toDate() 
        : new Date(batch.expiryDate);
        
      // Sprawdź czy to domyślna/nieprawidłowa data (rok 1970 lub wcześniejszy)
      return expiryDate.getFullYear() <= 1970;
    });
    
    // Połącz obie listy - najpierw z datą ważności, potem bez
    const sortedBatches = [...batchesWithExpiry, ...batchesWithoutExpiry];
    
    // Wybierz partie, które pokryją żądaną ilość
    let remainingQuantity = parsedQuantity;
    const selectedBatches = [];
    
    for (const batch of sortedBatches) {
      if (remainingQuantity <= 0) break;
      
      const batchQuantity = parseFloat(batch.quantity);
      const quantityFromBatch = Math.min(batchQuantity, remainingQuantity);
      
      selectedBatches.push({
        ...batch,
        selectedQuantity: formatQuantityPrecision(quantityFromBatch, 3),
        expiryDate: batch.expiryDate instanceof Timestamp ? batch.expiryDate.toDate() : batch.expiryDate
      });
      
      remainingQuantity -= quantityFromBatch;
    }
    
    // Sprawdź, czy udało się pokryć całą żądaną ilość
    if (remainingQuantity > 0) {
      throw new Error(`Niewystarczająca ilość produktu w magazynie. Brakuje: ${formatQuantityPrecision(remainingQuantity, 3)}`);
    }
    
    console.log(`✅ FEFO: Wybrano ${selectedBatches.length} partii dla ilości ${parsedQuantity}`);
    return selectedBatches;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas pobierania partii z najkrótszą datą ważności (FEFO):', error);
    throw new Error(`Nie udało się pobrać partii FEFO: ${error.message}`);
  }
};

/**
 * Transfer partii między magazynami
 * @param {string} batchId - ID partii do przeniesienia
 * @param {string} sourceWarehouseId - ID magazynu źródłowego
 * @param {string} targetWarehouseId - ID magazynu docelowego
 * @param {number} quantity - Ilość do przeniesienia
 * @param {Object} userData - Dane użytkownika wykonującego operację
 * @returns {Promise<Object>} - Wynik operacji transferu
 */
export const transferBatch = async (batchId, sourceWarehouseId, targetWarehouseId, quantity, userData) => {
  try {
    // Walidacja parametrów
    const validatedBatchId = validateId(batchId, 'batchId');
    const validatedSourceWarehouseId = validateId(sourceWarehouseId, 'sourceWarehouseId');
    const validatedTargetWarehouseId = validateId(targetWarehouseId, 'targetWarehouseId');
    const validatedQuantity = validatePositiveNumber(quantity, 'quantity');

    if (validatedSourceWarehouseId === validatedTargetWarehouseId) {
      throw new ValidationError('Magazyn źródłowy i docelowy muszą być różne');
    }

    // Zabezpiecz userData
    userData = userData || {};
    const userId = (userData.userId || 'unknown').toString();
    const notes = (userData.notes || '').toString();
    const userName = userData.userName || "Nieznany użytkownik";

    console.log('🔄 Rozpoczynam transfer partii:', {
      batchId: validatedBatchId,
      sourceWarehouseId: validatedSourceWarehouseId,
      targetWarehouseId: validatedTargetWarehouseId,
      quantity: validatedQuantity,
      userId,
      userName
    });

    // Pobierz dane partii
    const batchRef = doc(db, COLLECTIONS.INVENTORY_BATCHES, validatedBatchId);
    const batchDoc = await getDoc(batchRef);

    if (!batchDoc.exists()) {
      throw new ValidationError('Partia nie istnieje');
    }

    const batchData = batchDoc.data() || {};

    // Sprawdź, czy partia należy do źródłowego magazynu
    if (batchData.warehouseId !== validatedSourceWarehouseId) {
      throw new ValidationError('Partia nie znajduje się w podanym magazynie źródłowym');
    }

    // Sprawdź dostępną ilość
    const availableQuantity = Number(batchData.quantity || 0);
    if (availableQuantity < validatedQuantity) {
      throw new ValidationError(`Niewystarczająca ilość w partii. Dostępne: ${availableQuantity}, żądane: ${validatedQuantity}`);
    }

    // Pobierz dane magazynów
    const sourceWarehouseRef = doc(db, COLLECTIONS.WAREHOUSES, validatedSourceWarehouseId);
    const sourceWarehouseDoc = await getDoc(sourceWarehouseRef);

    const targetWarehouseRef = doc(db, COLLECTIONS.WAREHOUSES, validatedTargetWarehouseId);
    const targetWarehouseDoc = await getDoc(targetWarehouseRef);

    if (!sourceWarehouseDoc.exists()) {
      throw new ValidationError('Magazyn źródłowy nie istnieje');
    }

    if (!targetWarehouseDoc.exists()) {
      throw new ValidationError('Magazyn docelowy nie istnieje');
    }

    // Pobierz dane pozycji magazynowej
    const itemId = batchData.itemId;
    if (!itemId) {
      throw new ValidationError('Partia nie ma przypisanego ID pozycji');
    }

    const itemRef = doc(db, COLLECTIONS.INVENTORY, itemId);
    const itemDoc = await getDoc(itemRef);

    if (!itemDoc.exists()) {
      throw new ValidationError('Pozycja magazynowa nie istnieje');
    }

    const itemData = itemDoc.data() || {};

    // Sprawdź, czy istnieje już partia tego samego przedmiotu w magazynie docelowym
    const batchesRef = collection(db, COLLECTIONS.INVENTORY_BATCHES);
    const existingBatchQuery = query(
      batchesRef,
      where('itemId', '==', itemId),
      where('batchNumber', '==', batchData.batchNumber),
      where('warehouseId', '==', validatedTargetWarehouseId)
    );

    const existingBatchSnapshot = await getDocs(existingBatchQuery);

    let targetBatchId;
    let isNewBatch = true;

    if (!existingBatchSnapshot.empty) {
      const existingBatch = existingBatchSnapshot.docs[0];
      const existingBatchData = existingBatch.data();

      // Sprawdź, czy daty ważności są takie same
      const existingExpiryDate = existingBatchData.expiryDate;
      const sourceExpiryDate = batchData.expiryDate;

      let datesMatch = true;

      if (existingExpiryDate && sourceExpiryDate) {
        const existingDate = existingExpiryDate instanceof Timestamp 
          ? existingExpiryDate.toDate().getTime() 
          : new Date(existingExpiryDate).getTime();

        const sourceDate = sourceExpiryDate instanceof Timestamp 
          ? sourceExpiryDate.toDate().getTime() 
          : new Date(sourceExpiryDate).getTime();

        datesMatch = existingDate === sourceDate;
      } else if (existingExpiryDate || sourceExpiryDate) {
        datesMatch = false;
      }

      if (datesMatch) {
        targetBatchId = existingBatch.id;
        isNewBatch = false;
      }
    }

    // Sprawdź, czy przenosimy całą partię
    const isFullTransfer = validatedQuantity === availableQuantity;
    const sourceWarehouseName = sourceWarehouseDoc.data()?.name || 'Nieznany magazyn';
    const targetWarehouseName = targetWarehouseDoc.data()?.name || 'Nieznany magazyn';

    if (isFullTransfer) {
      console.log('📦 Transfer całej partii - usuwam partię źródłową');
      
      // Zachowaj informacje o partii przed usunięciem
      const batchDataToKeep = { ...batchData };

      // Usuń partię źródłową
      await deleteDoc(batchRef);

      // Dodaj transakcję informującą o usunięciu partii źródłowej
      const deleteTransactionData = {
        type: TRANSACTION_TYPES.DELETE_BATCH_AFTER_TRANSFER,
        itemId,
        itemName: itemData.name,
        batchId: validatedBatchId,
        batchNumber: batchData.batchNumber || 'Nieznana partia',
        quantity: 0,
        warehouseId: validatedSourceWarehouseId,
        warehouseName: sourceWarehouseName,
        notes: `Usunięcie pustej partii po przeniesieniu całości do magazynu ${targetWarehouseName}`,
        reason: 'Przeniesienie partii do innego magazynu',
        reference: `Transfer do magazynu: ${targetWarehouseName}`,
        source: 'inventory_transfer',
        previousQuantity: availableQuantity,
        transactionDate: serverTimestamp(),
        createdBy: userId,
        createdByName: userName,
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, COLLECTIONS.INVENTORY_TRANSACTIONS), deleteTransactionData);

      // Utwórz nową partię lub zaktualizuj istniejącą w magazynie docelowym
      if (isNewBatch) {
        const newBatchData = {
          ...batchDataToKeep,
          quantity: validatedQuantity,
          initialQuantity: batchDataToKeep.initialQuantity,
          warehouseId: validatedTargetWarehouseId,
          transferredFrom: validatedSourceWarehouseId,
          transferredAt: serverTimestamp(),
          transferredBy: userId,
          transferNotes: notes,
          createdAt: serverTimestamp(),
          createdBy: userId
        };

        // Usuń pole id aby Firebase wygenerowało nowe
        delete newBatchData.id;

        const newBatchRef = await addDoc(collection(db, COLLECTIONS.INVENTORY_BATCHES), newBatchData);
        targetBatchId = newBatchRef.id;
      } else {
        const targetBatchRef = doc(db, COLLECTIONS.INVENTORY_BATCHES, targetBatchId);
        const initialQuantityToTransfer = batchDataToKeep.initialQuantity || 0;

        await updateDoc(targetBatchRef, {
          quantity: increment(validatedQuantity),
          initialQuantity: increment(initialQuantityToTransfer),
          updatedAt: serverTimestamp(),
          updatedBy: userId,
          lastTransferFrom: validatedSourceWarehouseId,
          lastTransferAt: serverTimestamp()
        });
      }
    } else {
      console.log('📦 Transfer częściowy - aktualizuję ilości w obu partiach');
      
      // Transfer częściowy - aktualizuj ilość partii źródłowej
      const transferProportion = validatedQuantity / availableQuantity;
      const initialQuantityToRemove = batchData.initialQuantity * transferProportion;
      const newSourceInitialQuantity = batchData.initialQuantity - initialQuantityToRemove;

      await updateDoc(batchRef, {
        quantity: increment(-validatedQuantity),
        initialQuantity: newSourceInitialQuantity,
        updatedAt: serverTimestamp(),
        updatedBy: userId
      });

      if (isNewBatch) {
        // Utwórz nową partię w magazynie docelowym
        const proportionalInitialQuantity = batchData.initialQuantity * transferProportion;

        const newBatchData = {
          ...batchData,
          quantity: validatedQuantity,
          initialQuantity: proportionalInitialQuantity,
          warehouseId: validatedTargetWarehouseId,
          transferredFrom: validatedSourceWarehouseId,
          transferredAt: serverTimestamp(),
          transferredBy: userId,
          transferNotes: notes,
          createdAt: serverTimestamp(),
          createdBy: userId
        };

        // Usuń pole id aby Firebase wygenerowało nowe
        delete newBatchData.id;

        const newBatchRef = await addDoc(collection(db, COLLECTIONS.INVENTORY_BATCHES), newBatchData);
        targetBatchId = newBatchRef.id;
      } else {
        // Zaktualizuj istniejącą partię w magazynie docelowym
        const targetBatchRef = doc(db, COLLECTIONS.INVENTORY_BATCHES, targetBatchId);
        const initialQuantityToTransfer = batchData.initialQuantity * transferProportion;

        await updateDoc(targetBatchRef, {
          quantity: increment(validatedQuantity),
          initialQuantity: increment(initialQuantityToTransfer),
          updatedAt: serverTimestamp(),
          updatedBy: userId,
          lastTransferFrom: validatedSourceWarehouseId,
          lastTransferAt: serverTimestamp()
        });
      }
    }

    // Dodaj transakcję transferu
    const transactionData = {
      type: TRANSACTION_TYPES.TRANSFER,
      itemId,
      itemName: itemData.name,
      quantity: validatedQuantity,
      sourceWarehouseId: validatedSourceWarehouseId,
      sourceWarehouseName,
      targetWarehouseId: validatedTargetWarehouseId,
      targetWarehouseName,
      sourceBatchId: validatedBatchId,
      targetBatchId,
      notes,
      reason: 'Przeniesienie partii do innego magazynu',
      reference: `Transfer do magazynu: ${targetWarehouseName}`,
      source: 'inventory_transfer',
      transactionDate: serverTimestamp(),
      createdBy: userId,
      createdByName: userName,
      createdAt: serverTimestamp()
    };

    await addDoc(collection(db, COLLECTIONS.INVENTORY_TRANSACTIONS), transactionData);

    // Przelicz i zaktualizuj ilość głównej pozycji na podstawie partii
    await recalculateItemQuantity(itemId);

    // AKTUALIZACJA REZERWACJI PO TRANSFERZE
    try {
      console.log('🔄 Rozpoczynam aktualizację rezerwacji po transferze partii...');
      
      // Import funkcji transferu rezerwacji
      const { updateReservationsOnBatchTransfer } = await import('./batchTransferService.js');
      
      // Określ typ transferu
      let transferType = 'partial';
      if (isFullTransfer) {
        transferType = isNewBatch ? 'full' : 'merge';
      }

      const selectedTransferSource = userData.transferSource || null;
      const sourceRemainingQuantity = isFullTransfer ? 0 : (availableQuantity - validatedQuantity);

      const reservationUpdateResult = await updateReservationsOnBatchTransfer(
        validatedBatchId,
        targetBatchId,
        validatedQuantity,
        sourceRemainingQuantity,
        selectedTransferSource,
        userId,
        transferType
      );

      console.log('✅ Aktualizacja rezerwacji zakończona:', reservationUpdateResult);
      
    } catch (reservationError) {
      console.error('❌ Błąd podczas aktualizacji rezerwacji - zatrzymuję transfer:', reservationError);
      throw new Error(`Transfer partii zakończony, ale aktualizacja rezerwacji nie powiodła się: ${reservationError.message}`);
    }

    // AKTUALIZACJA CONSUMEDMATERIALS PO TRANSFERZE
    try {
      console.log('🔄 Rozpoczynam aktualizację consumedMaterials po transferze partii...');
      
      const { updateConsumedMaterialsOnTransfer } = await import('./batchTransferService.js');
      
      const consumedMaterialsUpdateResult = await updateConsumedMaterialsOnTransfer(
        validatedBatchId,
        targetBatchId,
        targetWarehouseName
      );
      
      console.log('✅ Aktualizacja consumedMaterials zakończona:', consumedMaterialsUpdateResult);
      
    } catch (consumedMaterialsError) {
      // Nie blokujemy transferu - tylko logujemy błąd
      console.error('⚠️ Błąd podczas aktualizacji consumedMaterials (transfer kontynuowany):', consumedMaterialsError);
    }

    console.log('✅ Transfer partii zakończony pomyślnie');

    return {
      success: true,
      sourceWarehouseId: validatedSourceWarehouseId,
      targetWarehouseId: validatedTargetWarehouseId,
      quantity: validatedQuantity,
      targetBatchId: targetBatchId,
      message: isFullTransfer 
        ? 'Transfer całej partii zakończony pomyślnie - partia źródłowa została usunięta'
        : 'Transfer zakończony pomyślnie'
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas transferu partii:', error);
    throw new Error(`Błąd podczas transferu partii: ${error.message}`);
  }
};

/**
 * Sprawdza czy data jest domyślną datą (1.01.1970)
 * @private
 */
const isDefaultDate = (date) => {
  if (!date) return true;
  return date.getFullYear() <= 1970;
};