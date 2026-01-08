import { db, storage } from './firebase/config';
import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  Timestamp 
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytes, 
  getDownloadURL, 
  deleteObject 
} from 'firebase/storage';
import { format } from 'date-fns';
import { updateOrderItemShippedQuantity, updateOrderItemShippedQuantityPrecise } from './orderService';
import { createRealtimeStatusChangeNotification } from './notificationService';
import { safeParseDate } from '../utils/dateUtils';

// Kolekcje
const CMR_COLLECTION = 'cmrDocuments';
const CMR_ITEMS_COLLECTION = 'cmrItems';

// Statusy dokumentów CMR
export const CMR_STATUSES = {
  DRAFT: 'Szkic',
  ISSUED: 'Wystawiony',
  IN_TRANSIT: 'W transporcie',
  DELIVERED: 'Dostarczone',
  COMPLETED: 'Zakończony',
  CANCELED: 'Anulowany'
};

// Stałe dla statusów płatności CMR
export const CMR_PAYMENT_STATUSES = {
  UNPAID: 'unpaid',
  PAID: 'paid'
};

// Funkcja do tłumaczenia statusów płatności na język polski
export const translatePaymentStatus = (status) => {
  switch (status) {
    case 'unpaid': return 'Nie opłacone';
    case 'paid': return 'Opłacone';
    default: return status;
  }
};

// Typy transportu
export const TRANSPORT_TYPES = {
  ROAD: 'Drogowy',
  RAIL: 'Kolejowy',
  SEA: 'Morski',
  AIR: 'Lotniczy',
  MULTIMODAL: 'Multimodalny'
};

// Pobranie wszystkich dokumentów CMR
export const getAllCmrDocuments = async () => {
  try {
    const cmrRef = collection(db, CMR_COLLECTION);
    const q = query(cmrRef, orderBy('issueDate', 'desc'));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => {
      const data = doc.data();
      
      // Funkcja pomocnicza do konwersji pól czasowych
      const convertTimestamp = (field) => {
        if (!field) return null;
        // Sprawdź czy pole jest obiektem Timestamp z metodą toDate
        if (field && typeof field.toDate === 'function') {
          return field.toDate();
        }
        // Sprawdź czy pole jest obiektem z polami seconds i nanoseconds (deserializowany Firestore Timestamp)
        if (field && typeof field === 'object' && typeof field.seconds === 'number') {
          return new Date(field.seconds * 1000 + (field.nanoseconds || 0) / 1000000);
        }
        // Jeśli jest stringiem lub numerem, spróbuj konwertować na Date
        if (typeof field === 'string' || typeof field === 'number') {
          try {
            return new Date(field);
          } catch (e) {
            console.warn('Nie można skonwertować pola na Date:', field);
            return null;
          }
        }
        return null;
      };
      
      return {
        id: doc.id,
        ...data,
        issueDate: convertTimestamp(data.issueDate),
        deliveryDate: convertTimestamp(data.deliveryDate),
        loadingDate: convertTimestamp(data.loadingDate),
        createdAt: convertTimestamp(data.createdAt),
        updatedAt: convertTimestamp(data.updatedAt)
      };
    });
  } catch (error) {
    console.error('Błąd podczas pobierania dokumentów CMR:', error);
    throw error;
  }
};

// Pobranie szczegółów dokumentu CMR
export const getCmrDocumentById = async (cmrId) => {
  try {
    const cmrRef = doc(db, CMR_COLLECTION, cmrId);
    const cmrDoc = await getDoc(cmrRef);
    
    if (!cmrDoc.exists()) {
      throw new Error('Dokument CMR nie istnieje');
    }
    
    const cmrData = cmrDoc.data();
    
    // Pobierz elementy dla tego dokumentu CMR
    const itemsRef = collection(db, CMR_ITEMS_COLLECTION);
    const q = query(itemsRef, where('cmrId', '==', cmrId));
    const itemsSnapshot = await getDocs(q);
    
    const items = itemsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Funkcja pomocnicza do konwersji pól czasowych
    const convertTimestamp = (field) => {
      if (!field) {
        return null;
      }
      
      // Sprawdź czy pole jest obiektem Timestamp z metodą toDate
      if (field && typeof field.toDate === 'function') {
        return field.toDate();
      }
      
      // Sprawdź czy pole jest obiektem z polami seconds i nanoseconds (deserializowany Firestore Timestamp)
      if (field && typeof field === 'object' && typeof field.seconds === 'number') {
        return new Date(field.seconds * 1000 + (field.nanoseconds || 0) / 1000000);
      }
      
      // Jeśli jest stringiem lub numerem, spróbuj konwertować na Date
      if (typeof field === 'string' || typeof field === 'number') {
        try {
          return new Date(field);
        } catch (e) {
          return null;
        }
      }
      return null;
    };
    
    const result = {
      id: cmrId,
      ...cmrData,
      issueDate: convertTimestamp(cmrData.issueDate),
      deliveryDate: convertTimestamp(cmrData.deliveryDate),
      loadingDate: convertTimestamp(cmrData.loadingDate),
      createdAt: convertTimestamp(cmrData.createdAt),
      updatedAt: convertTimestamp(cmrData.updatedAt),
      items
    };
    
    return result;
  } catch (error) {
    console.error('Błąd podczas pobierania szczegółów dokumentu CMR:', error);
    throw error;
  }
};

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
      // Zachowaj pola dat nawet gdy są null
      if (value !== undefined || ['issueDate', 'deliveryDate', 'loadingDate'].includes(key)) {
        cleaned[key] = cleanUndefinedValues(value);
      }
    });
    return cleaned;
  }
  
  return obj;
};

// Utworzenie nowego dokumentu CMR
export const createCmrDocument = async (cmrData, userId) => {
  try {
    // Funkcja pomocnicza do konwersji dat na Firestore Timestamp
    const convertToTimestamp = (dateValue) => {
      if (!dateValue) return null;
      
      // Jeśli to już Firestore Timestamp
      if (dateValue && typeof dateValue === 'object' && typeof dateValue.toDate === 'function') {
        return dateValue;
      }
      
      // Jeśli to obiekt Date
      if (dateValue instanceof Date) {
        return Timestamp.fromDate(dateValue);
      }
      
      // Jeśli to obiekt z sekundami (Firestore Timestamp format)
      if (dateValue && typeof dateValue === 'object' && dateValue.seconds) {
        return Timestamp.fromDate(new Date(dateValue.seconds * 1000));
      }
      
      // Jeśli to string lub liczba
      try {
        const date = new Date(dateValue);
        if (isNaN(date.getTime())) {
          console.warn('Nieprawidłowa data:', dateValue);
          return null;
        }
        return Timestamp.fromDate(date);
      } catch (e) {
        console.warn('Błąd konwersji daty:', dateValue, e);
        return null;
      }
    };
    
    // Pobierz afiks klienta z powiązanego zamówienia (jeśli istnieje)
    let customerAffix = '';
    if (!cmrData.cmrNumber && (cmrData.linkedOrderId || (cmrData.linkedOrderIds && cmrData.linkedOrderIds.length > 0))) {
      try {
        const { getOrderById } = await import('./orderService');
        const orderId = cmrData.linkedOrderId || cmrData.linkedOrderIds[0];
        const order = await getOrderById(orderId);
        if (order && order.customer && order.customer.orderAffix) {
          customerAffix = order.customer.orderAffix;
        }
      } catch (error) {
        console.warn('Nie udało się pobrać afiksu klienta z zamówienia:', error);
      }
    }

    // Formatowanie dat
    const formattedData = {
      ...cmrData,
      issueDate: convertToTimestamp(cmrData.issueDate),
      deliveryDate: convertToTimestamp(cmrData.deliveryDate),
      loadingDate: convertToTimestamp(cmrData.loadingDate),
      status: cmrData.status || CMR_STATUSES.DRAFT,
      paymentStatus: cmrData.paymentStatus || CMR_PAYMENT_STATUSES.UNPAID,
      cmrNumber: cmrData.cmrNumber || generateCmrNumber(cmrData.issueDate, customerAffix),
      createdAt: serverTimestamp(),
      createdBy: userId,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    };
    
    // Usuń items z głównego dokumentu (dodamy je oddzielnie)
    const { items, ...cmrDataWithoutItems } = formattedData;
    
    // Oczyść undefined wartości przed zapisaniem
    const cleanedCmrData = cleanUndefinedValues(cmrDataWithoutItems);
    
    // Dodaj dokument CMR
    const cmrRef = await addDoc(collection(db, CMR_COLLECTION), cleanedCmrData);
    
    // Dodaj elementy dokumentu CMR
    if (items && items.length > 0) {
      const itemPromises = items.map(item => {
        // Przygotuj dane elementu z informacjami o partiach
        const itemData = {
          ...item,
          cmrId: cmrRef.id,
          createdAt: serverTimestamp(),
          createdBy: userId
        };
        
        // Jeśli element ma powiązane partie, zapisz je jako część danych elementu
        if (item.linkedBatches && item.linkedBatches.length > 0) {
          itemData.linkedBatches = item.linkedBatches.map(batch => ({
            id: batch.id || '',
            batchNumber: batch.batchNumber || batch.lotNumber || '',
            itemId: batch.itemId || '',
            itemName: batch.itemName || '',
            barcode: batch.barcode || '',
            quantity: batch.quantity || 0,
            unit: batch.unit || '',
            expiryDate: batch.expiryDate || null,
            warehouseId: batch.warehouseId || '',
            warehouseName: batch.warehouseName || ''
          }));
        }
        
        // Oczyść undefined wartości przed zapisaniem
        const cleanedItemData = cleanUndefinedValues(itemData);
        
        return addDoc(collection(db, CMR_ITEMS_COLLECTION), cleanedItemData);
      });
      
      await Promise.all(itemPromises);
    }
    
    // USUNIĘTO: Automatyczne aktualizacje ilości przy tworzeniu CMR
    // Ilości są aktualizowane TYLKO przy zmianie statusu na "W transporcie"
    console.log('📝 CMR utworzony - ilości wysłane będą zaktualizowane po zmianie statusu na "W transporcie"');

    return {
      id: cmrRef.id,
      ...cleanedCmrData,
      // Konwertuj daty z powrotem na obiekty Date dla wyświetlenia w formularzu
      issueDate: cleanedCmrData.issueDate && cleanedCmrData.issueDate.toDate ? cleanedCmrData.issueDate.toDate() : cleanedCmrData.issueDate,
      deliveryDate: cleanedCmrData.deliveryDate && cleanedCmrData.deliveryDate.toDate ? cleanedCmrData.deliveryDate.toDate() : cleanedCmrData.deliveryDate,
      loadingDate: cleanedCmrData.loadingDate && cleanedCmrData.loadingDate.toDate ? cleanedCmrData.loadingDate.toDate() : cleanedCmrData.loadingDate
    };
  } catch (error) {
    console.error('Błąd podczas tworzenia dokumentu CMR:', error);
    throw error;
  }
};

// Aktualizacja dokumentu CMR
export const updateCmrDocument = async (cmrId, cmrData, userId) => {
  try {
    const cmrRef = doc(db, CMR_COLLECTION, cmrId);
    
    // Funkcja pomocnicza do konwersji dat na Firestore Timestamp
    const convertToTimestamp = (dateValue) => {
      console.log('convertToTimestamp - wejście:', dateValue, 'typ:', typeof dateValue);
      
      if (!dateValue) {
        console.log('convertToTimestamp - brak wartości, zwracam null');
        return null;
      }
      
      // Jeśli to już Firestore Timestamp
      if (dateValue && typeof dateValue === 'object' && typeof dateValue.toDate === 'function') {
        console.log('convertToTimestamp - już Firestore Timestamp');
        return dateValue;
      }
      
      // Jeśli to obiekt Date
      if (dateValue instanceof Date) {
        console.log('convertToTimestamp - obiekt Date, konwertuję na Timestamp');
        const timestamp = Timestamp.fromDate(dateValue);
        console.log('convertToTimestamp - wynik:', timestamp);
        return timestamp;
      }
      
      // Jeśli to obiekt z sekundami (Firestore Timestamp format)
      if (dateValue && typeof dateValue === 'object' && dateValue.seconds) {
        console.log('convertToTimestamp - obiekt z sekundami');
        return Timestamp.fromDate(new Date(dateValue.seconds * 1000));
      }
      
      // Jeśli to string lub liczba
      try {
        const date = new Date(dateValue);
        if (isNaN(date.getTime())) {
          console.warn('Nieprawidłowa data:', dateValue);
          return null;
        }
        console.log('convertToTimestamp - skonwertowano string/liczbę na Date, następnie na Timestamp');
        const timestamp = Timestamp.fromDate(date);
        console.log('convertToTimestamp - wynik:', timestamp);
        return timestamp;
      } catch (e) {
        console.warn('Błąd konwersji daty:', dateValue, e);
        return null;
      }
    };
    
    // Formatowanie dat
    const formattedData = {
      ...cmrData,
      issueDate: convertToTimestamp(cmrData.issueDate),
      deliveryDate: convertToTimestamp(cmrData.deliveryDate),
      loadingDate: convertToTimestamp(cmrData.loadingDate),
      updatedAt: serverTimestamp(),
      updatedBy: userId
    };
    
    console.log('updateCmrDocument - formattedData przed usunięciem items:', formattedData);
    
    // Usuń items z aktualizacji (obsłużymy je oddzielnie)
    const { items, ...updateData } = formattedData;
    
    console.log('updateCmrDocument - updateData przed czyszczeniem:', updateData);
    
    // Oczyść undefined wartości przed zapisaniem
    const cleanedUpdateData = cleanUndefinedValues(updateData);
    
    console.log('updateCmrDocument - cleanedUpdateData po czyszczeniu:', cleanedUpdateData);
    
    await updateDoc(cmrRef, cleanedUpdateData);
    
    console.log('updateCmrDocument - dane zapisane w bazie, zwracam:', {
      id: cmrId,
      ...cleanedUpdateData
    });
    
    // Aktualizacja elementów
    if (items && items.length > 0) {
      // Usuń istniejące elementy
      const itemsRef = collection(db, CMR_ITEMS_COLLECTION);
      const q = query(itemsRef, where('cmrId', '==', cmrId));
      const itemsSnapshot = await getDocs(q);
      
      const deletePromises = itemsSnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      
      // Dodaj nowe elementy
      const itemPromises = items.map(item => {
        // Przygotuj dane elementu z informacjami o partiach
        const itemData = {
          ...item,
          cmrId,
          createdAt: serverTimestamp(),
          createdBy: userId
        };
        
        // Jeśli element ma powiązane partie, zapisz je jako część danych elementu
        if (item.linkedBatches && item.linkedBatches.length > 0) {
          itemData.linkedBatches = item.linkedBatches.map(batch => ({
            id: batch.id || '',
            batchNumber: batch.batchNumber || batch.lotNumber || '',
            itemId: batch.itemId || '',
            itemName: batch.itemName || '',
            barcode: batch.barcode || '',
            quantity: batch.quantity || 0,
            unit: batch.unit || '',
            expiryDate: batch.expiryDate || null,
            warehouseId: batch.warehouseId || '',
            warehouseName: batch.warehouseName || ''
          }));
        }
        
        // Oczyść undefined wartości przed zapisaniem
        const cleanedItemData = cleanUndefinedValues(itemData);
        
        return addDoc(collection(db, CMR_ITEMS_COLLECTION), cleanedItemData);
      });
      
      await Promise.all(itemPromises);
    }
    
    console.log('updateCmrDocument - przed konwersją dat:', {
      issueDate: cleanedUpdateData.issueDate,
      deliveryDate: cleanedUpdateData.deliveryDate,
      loadingDate: cleanedUpdateData.loadingDate
    });
    
    // Konwertuj daty z powrotem na obiekty Date dla wyświetlenia w formularzu
    const convertedIssueDate = cleanedUpdateData.issueDate && cleanedUpdateData.issueDate.toDate ? cleanedUpdateData.issueDate.toDate() : cleanedUpdateData.issueDate;
    const convertedDeliveryDate = cleanedUpdateData.deliveryDate && cleanedUpdateData.deliveryDate.toDate ? cleanedUpdateData.deliveryDate.toDate() : cleanedUpdateData.deliveryDate;
    const convertedLoadingDate = cleanedUpdateData.loadingDate && cleanedUpdateData.loadingDate.toDate ? cleanedUpdateData.loadingDate.toDate() : cleanedUpdateData.loadingDate;
    
    console.log('updateCmrDocument - po konwersji dat:', {
      issueDate: convertedIssueDate,
      deliveryDate: convertedDeliveryDate,
      loadingDate: convertedLoadingDate
    });

    // 🔄 AUTOMATYCZNA AKTUALIZACJA ilości wysłanych w powiązanych zamówieniach przy edycji CMR
    console.log('🔄 Rozpoczynam automatyczne odświeżanie ilości w powiązanych zamówieniach...');
    
    // Zbierz wszystkie powiązane zamówienia
    const ordersToRefresh = new Set();
    if (cmrData.linkedOrderIds && Array.isArray(cmrData.linkedOrderIds)) {
      cmrData.linkedOrderIds.forEach(id => ordersToRefresh.add(id));
    }
    if (cmrData.linkedOrderId && !ordersToRefresh.has(cmrData.linkedOrderId)) {
      ordersToRefresh.add(cmrData.linkedOrderId);
    }

    // Odśwież ilości w każdym zamówieniu
    if (ordersToRefresh.size > 0) {
      console.log(`📦 Odświeżanie ilości w ${ordersToRefresh.size} zamówieniu/zamówieniach...`);
      
      for (const linkedOrderId of ordersToRefresh) {
        try {
          const { refreshShippedQuantitiesFromCMR } = await import('./orderService');
          const refreshResult = await refreshShippedQuantitiesFromCMR(linkedOrderId, userId);
          
          if (refreshResult.success) {
            console.log(`✅ Pomyślnie odświeżono ilości w zamówieniu ${linkedOrderId}`);
            console.log(`   • Przetworzono ${refreshResult.stats?.processedCMRs || 0} dokumentów CMR`);
            console.log(`   • Zaktualizowano ${refreshResult.stats?.shippedItems || 0} pozycji`);
          } else {
            console.warn(`⚠️ Nie udało się odświeżyć ilości w zamówieniu ${linkedOrderId}`);
          }
        } catch (error) {
          console.error(`❌ Błąd podczas odświeżania ilości w zamówieniu ${linkedOrderId}:`, error);
          // Nie przerywamy procesu - logujemy tylko błąd
        }
      }
      
      console.log('✅ Zakończono automatyczne odświeżanie ilości wysłanych');
    } else {
      console.log('ℹ️ Brak powiązanych zamówień do odświeżenia');
    }

    console.log('📝 CMR zaktualizowany pomyślnie');

    return {
      id: cmrId,
      ...cleanedUpdateData,
      issueDate: convertedIssueDate,
      deliveryDate: convertedDeliveryDate,
      loadingDate: convertedLoadingDate
    };
  } catch (error) {
    console.error('Błąd podczas aktualizacji dokumentu CMR:', error);
    throw error;
  }
};

// Usunięcie dokumentu CMR
export const deleteCmrDocument = async (cmrId) => {
  try {
    console.log(`🗑️ Rozpoczęcie usuwania CMR ${cmrId}...`);
    
    // KROK 1: Pobierz dane CMR przed usunięciem (dla anulowania ilości wysłanych)
    let cmrData = null;
    try {
      cmrData = await getCmrDocumentById(cmrId);
      console.log(`📋 Pobrano dane CMR do usunięcia: ${cmrData.cmrNumber}`);
    } catch (error) {
      console.warn('Nie udało się pobrać danych CMR przed usunięciem:', error);
    }
    
    // KROK 2: Anuluj ilości wysłane w powiązanych zamówieniach (jeśli CMR miał pozycje)
    if (cmrData && cmrData.items && cmrData.items.length > 0) {
      try {
        const ordersToUpdate = [];
        
        // Sprawdź nowy format (wiele zamówień)
        if (cmrData.linkedOrderIds && Array.isArray(cmrData.linkedOrderIds) && cmrData.linkedOrderIds.length > 0) {
          ordersToUpdate.push(...cmrData.linkedOrderIds);
        }
        
        // Sprawdź stary format (pojedyncze zamówienie) - dla kompatybilności wstecznej
        if (cmrData.linkedOrderId && !ordersToUpdate.includes(cmrData.linkedOrderId)) {
          ordersToUpdate.push(cmrData.linkedOrderId);
        }
        
        if (ordersToUpdate.length > 0) {
          console.log(`🔄 Anulowanie ilości wysłanych w ${ordersToUpdate.length} zamówieniach przy usuwaniu CMR...`);
          for (const orderId of ordersToUpdate) {
            await cancelLinkedOrderShippedQuantities(orderId, cmrData.items, cmrData.cmrNumber, 'system');
            console.log(`✅ Anulowano ilości wysłane w zamówieniu ${orderId} na podstawie usuniętego CMR ${cmrData.cmrNumber}`);
          }
        }
      } catch (orderUpdateError) {
        console.error('❌ Błąd podczas anulowania ilości wysłanych przy usuwaniu CMR:', orderUpdateError);
        // Nie przerywamy procesu usuwania CMR - tylko logujemy błąd
      }
    }
    
    // KROK 3: Usuń elementy dokumentu CMR (cmrItems)
    const itemsRef = collection(db, CMR_ITEMS_COLLECTION);
    const q = query(itemsRef, where('cmrId', '==', cmrId));
    const itemsSnapshot = await getDocs(q);
    
    console.log(`🗑️ Usuwanie ${itemsSnapshot.docs.length} pozycji CMR...`);
    const deletePromises = itemsSnapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
    
    // KROK 4: Usuń dokument CMR
    const cmrRef = doc(db, CMR_COLLECTION, cmrId);
    await deleteDoc(cmrRef);
    console.log(`✅ Usunięto dokument CMR ${cmrId}`);
    
    // KROK 5: KLUCZOWE - Wyczyść cache CMR i usuń dokument z cache
    console.log('🧹 Czyszczenie cache CMR po usunięciu...');
    removeCmrDocumentFromCache(cmrId);
    
    // Opcjonalnie: wyczyść cały cache jeśli usuwanie jednego dokumentu nie wystarczy
    // clearCmrDocumentsCache();
    
    console.log(`✅ CMR ${cmrId} został całkowicie usunięty i wyczyszczony z cache`);
    return { success: true, cmrId: cmrId, cmrNumber: cmrData?.cmrNumber || 'UNKNOWN' };
  } catch (error) {
    console.error('❌ Błąd podczas usuwania dokumentu CMR:', error);
    throw error;
  }
};

// ULEPSZONA funkcja do walidacji czy wszystkie pozycje CMR mają przypisane partie magazynowe
// NOWA FUNKCJONALNOŚĆ: sprawdza również czy ilość w partiach pokrywa ilość w pozycji CMR
const validateCmrBatches = async (cmrId) => {
  try {
    const cmrData = await getCmrDocumentById(cmrId);
    
    if (!cmrData || !cmrData.items || cmrData.items.length === 0) {
      return { 
        isValid: false, 
        message: 'CMR nie zawiera żadnych pozycji do walidacji' 
      };
    }
    
    const errors = [];
    
    cmrData.items.forEach((item, index) => {
      const itemNumber = index + 1;
      const itemDescription = item.description || `Pozycja ${itemNumber}`;
      const cmrQuantity = parseFloat(item.quantity) || parseFloat(item.numberOfPackages) || 0;
      
      // WALIDACJA 1: Sprawdź czy pozycja ma przypisane partie
      if (!item.linkedBatches || item.linkedBatches.length === 0) {
        errors.push({
          index: itemNumber,
          description: itemDescription,
          error: 'Brak powiązanych partii magazynowych',
          type: 'no_batches'
        });
        return; // Przejdź do następnej pozycji
      }
      
      // WALIDACJA 2: Sprawdź czy pozycja CMR ma określoną ilość
      if (cmrQuantity <= 0) {
        errors.push({
          index: itemNumber,
          description: itemDescription,
          error: 'Pozycja CMR ma zerową lub nieprawidłową ilość',
          type: 'invalid_cmr_quantity',
          cmrQuantity: cmrQuantity
        });
        return; // Przejdź do następnej pozycji
      }
      
      // WALIDACJA 3: Oblicz łączną ilość w przypisanych partiach
      let totalBatchQuantity = 0;
      const batchDetails = [];
      
      item.linkedBatches.forEach((batch, batchIndex) => {
        const batchQuantity = parseFloat(batch.quantity) || 0;
        totalBatchQuantity += batchQuantity;
        
        batchDetails.push({
          batchNumber: batch.batchNumber || batch.lotNumber || `Partia ${batchIndex + 1}`,
          quantity: batchQuantity,
          unit: batch.unit || item.unit || 'szt'
        });
        
        // Sprawdź czy pojedyncza partia ma prawidłową ilość
        if (batchQuantity <= 0) {
          errors.push({
            index: itemNumber,
            description: itemDescription,
            error: `Partia "${batch.batchNumber || batch.lotNumber || 'Nieznana'}" ma zerową lub nieprawidłową ilość (${batchQuantity})`,
            type: 'invalid_batch_quantity',
            batchNumber: batch.batchNumber || batch.lotNumber,
            batchQuantity: batchQuantity
          });
        }
      });
      
      // WALIDACJA 4: KLUCZOWA - Sprawdź czy łączna ilość w partiach pokrywa ilość CMR
      if (totalBatchQuantity < cmrQuantity) {
        const deficit = cmrQuantity - totalBatchQuantity;
        errors.push({
          index: itemNumber,
          description: itemDescription,
          error: `Niewystarczająca ilość w partiach. Wymagane: ${cmrQuantity} ${item.unit || 'szt'}, dostępne w partiach: ${totalBatchQuantity} ${item.unit || 'szt'}, brakuje: ${deficit} ${item.unit || 'szt'}`,
          type: 'insufficient_batch_quantity',
          cmrQuantity: cmrQuantity,
          totalBatchQuantity: totalBatchQuantity,
          deficit: deficit,
          unit: item.unit || 'szt',
          batchDetails: batchDetails
        });
      }
      
      // WALIDACJA 5: Opcjonalne ostrzeżenie o nadmiarze (nie blokuje operacji)
      if (totalBatchQuantity > cmrQuantity) {
        const surplus = totalBatchQuantity - cmrQuantity;
        console.warn(`⚠️ Pozycja "${itemDescription}" ma nadmiar w partiach: +${surplus} ${item.unit || 'szt'} (CMR: ${cmrQuantity}, partie: ${totalBatchQuantity})`);
      }
    });
    
    if (errors.length > 0) {
      // Podziel błędy na kategorie dla lepszego komunikatu
      const noBatchesErrors = errors.filter(err => err.type === 'no_batches');
      const insufficientQuantityErrors = errors.filter(err => err.type === 'insufficient_batch_quantity');
      const invalidQuantityErrors = errors.filter(err => err.type === 'invalid_cmr_quantity' || err.type === 'invalid_batch_quantity');
      
      let errorMessage = 'Nie można rozpocząć transportu z następującymi błędami:\n\n';
      
      if (noBatchesErrors.length > 0) {
        errorMessage += '🚫 BRAK PRZYPISANYCH PARTII:\n';
        errorMessage += noBatchesErrors.map(err => `• ${err.description}`).join('\n');
        errorMessage += '\n\n';
      }
      
      if (insufficientQuantityErrors.length > 0) {
        errorMessage += '📉 NIEWYSTARCZAJĄCA ILOŚĆ W PARTIACH:\n';
        insufficientQuantityErrors.forEach(err => {
          errorMessage += `• ${err.description}:\n`;
          errorMessage += `  - Wymagane: ${err.cmrQuantity} ${err.unit}\n`;
          errorMessage += `  - W partiach: ${err.totalBatchQuantity} ${err.unit}\n`;
          errorMessage += `  - Brakuje: ${err.deficit} ${err.unit}\n`;
          if (err.batchDetails && err.batchDetails.length > 0) {
            errorMessage += `  - Partie: ${err.batchDetails.map(b => `${b.batchNumber} (${b.quantity} ${b.unit})`).join(', ')}\n`;
          }
        });
        errorMessage += '\n';
      }
      
      if (invalidQuantityErrors.length > 0) {
        errorMessage += '❌ NIEPRAWIDŁOWE ILOŚCI:\n';
        errorMessage += invalidQuantityErrors.map(err => `• ${err.description}: ${err.error}`).join('\n');
        errorMessage += '\n';
      }
      
      errorMessage += '\nAby rozpocząć transport, upewnij się że wszystkie pozycje mają:\n';
      errorMessage += '✅ Przypisane partie magazynowe\n';
      errorMessage += '✅ Wystarczającą ilość w partiach do pokrycia zamówionej ilości';
      
      return {
        isValid: false,
        message: errorMessage,
        errors,
        summary: {
          totalErrors: errors.length,
          noBatchesCount: noBatchesErrors.length,
          insufficientQuantityCount: insufficientQuantityErrors.length,
          invalidQuantityCount: invalidQuantityErrors.length
        }
      };
    }
    
    // Wszystkie walidacje przeszły pomyślnie
    const totalPositions = cmrData.items.length;
    const totalBatches = cmrData.items.reduce((sum, item) => sum + (item.linkedBatches ? item.linkedBatches.length : 0), 0);
    
    return { 
      isValid: true, 
      message: `✅ Walidacja zakończona pomyślnie!\n\nPozycje CMR: ${totalPositions}\nPrzypisane partie: ${totalBatches}\n\nWszystkie pozycje mają wystarczającą ilość w partiach magazynowych.`,
      summary: {
        totalPositions,
        totalBatches,
        allValid: true
      }
    };
  } catch (error) {
    console.error('Błąd podczas walidacji partii CMR:', error);
    return {
      isValid: false,
      message: `❌ Błąd podczas walidacji: ${error.message}`
    };
  }
};

// Zmiana statusu dokumentu CMR
export const updateCmrStatus = async (cmrId, newStatus, userId) => {
  try {
    const cmrRef = doc(db, CMR_COLLECTION, cmrId);
    
    // Pobierz aktualny status CMR przed zmianą
    const currentCmrDoc = await getDoc(cmrRef);
    if (!currentCmrDoc.exists()) {
      throw new Error('Dokument CMR nie istnieje');
    }
    const currentStatus = currentCmrDoc.data().status;
    
    // Walidacja partii przy przejściu ze statusu "Szkic" lub "Wystawiony" na "W transporcie"
    if (newStatus === CMR_STATUSES.IN_TRANSIT && 
        (currentStatus === CMR_STATUSES.DRAFT || currentStatus === CMR_STATUSES.ISSUED)) {
      console.log('Walidacja partii przed rozpoczęciem transportu...');
      const validationResult = await validateCmrBatches(cmrId);
      
      if (!validationResult.isValid) {
        throw new Error(`Nie można rozpocząć transportu: ${validationResult.message}`);
      }
      
      console.log('Walidacja partii zakończona pomyślnie');
    }
    
    let reservationResult = null;
    let deliveryResult = null;
    
    // Jeśli przechodzi na status "W transporcie", zarezerwuj partie magazynowe
    if (newStatus === CMR_STATUSES.IN_TRANSIT) {
      console.log('Rozpoczynanie transportu - rezerwacja partii magazynowych...');
      try {
        reservationResult = await reserveBatchesForCmr(cmrId, userId);
        console.log('Rezultat rezerwacji partii:', reservationResult);
      } catch (reservationError) {
        console.error('Błąd podczas rezerwacji partii:', reservationError);
        // Nie przerywamy procesu zmiany statusu - tylko logujemy błąd
        reservationResult = {
          success: false,
          message: `Błąd rezerwacji partii: ${reservationError.message}`,
          errors: [{ error: reservationError.message }]
        };
      }
      
      // Aktualizuj ilości wysłane w powiązanych zamówieniach klienta
      try {
        const cmrData = await getCmrDocumentById(cmrId);
        if (cmrData.items && cmrData.items.length > 0) {
          const ordersToUpdate = [];
          
          // Sprawdź nowy format (wiele zamówień)
          if (cmrData.linkedOrderIds && Array.isArray(cmrData.linkedOrderIds) && cmrData.linkedOrderIds.length > 0) {
            ordersToUpdate.push(...cmrData.linkedOrderIds);
          }
          
          // Sprawdź stary format (pojedyncze zamówienie) - dla kompatybilności wstecznej
          if (cmrData.linkedOrderId && !ordersToUpdate.includes(cmrData.linkedOrderId)) {
            ordersToUpdate.push(cmrData.linkedOrderId);
          }
          
          if (ordersToUpdate.length > 0) {
            // WYŁĄCZONE - Cloud Function onCmrStatusUpdate automatycznie aktualizuje ilości wysłane
            // Dzięki temu unikamy podwójnych aktualizacji i problemów z wyścigami
            console.log('ℹ️ Cloud Function onCmrStatusUpdate zajmie się aktualizacją ilości wysłanych dla zamówień:', ordersToUpdate);
            
            // Dodaj usługi transportowe na podstawie palet (to nadal robimy po stronie klienta)
            console.log('🚚 Dodawanie usług transportowych na podstawie palet z CMR...');
            try {
              const transportResult = await addTransportServicesToOrders(
                cmrId,
                cmrData.items,
                ordersToUpdate,
                userId
              );
              console.log('✅ Rezultat dodawania usług transportowych:', transportResult);
              
              if (transportResult.success && transportResult.results) {
                const successfulUpdates = transportResult.results.filter(r => r.success);
                const failedUpdates = transportResult.results.filter(r => !r.success);
                
                if (successfulUpdates.length > 0) {
                  console.log(`✅ Pomyślnie dodano usługi transportowe do ${successfulUpdates.length} zamówień`);
                  successfulUpdates.forEach(result => {
                    if (result.palletsCount > 0) {
                      console.log(`   📦 ${result.orderNumber}: ${result.palletsCount} palet, wartość: ${result.totalServiceValue}`);
                    }
                  });
                }
                
                if (failedUpdates.length > 0) {
                  console.warn(`⚠️ Nie udało się dodać usług transportowych do ${failedUpdates.length} zamówień`);
                  failedUpdates.forEach(result => {
                    console.warn(`   ❌ ${result.orderNumber || result.orderId}: ${result.message}`);
                  });
                }
              }
            } catch (transportError) {
              console.error('❌ Błąd podczas dodawania usług transportowych:', transportError);
              // Nie przerywamy procesu - usługi transportowe to dodatek
            }
          }
        }
      } catch (orderUpdateError) {
        console.error('Błąd podczas aktualizacji ilości wysłanych w zamówieniach:', orderUpdateError);
        // Nie przerywamy procesu zmiany statusu - tylko logujemy błąd
      }
    }
    
    // Jeśli cofamy ze statusu "W transporcie" na inny status, anuluj ilości wysłane
    if (currentStatus === CMR_STATUSES.IN_TRANSIT && newStatus !== CMR_STATUSES.IN_TRANSIT && newStatus !== CMR_STATUSES.DELIVERED) {
      console.log('Cofanie ze statusu "W transporcie" - anulowanie ilości wysłanych...');
      try {
        const cmrData = await getCmrDocumentById(cmrId);
        if (cmrData.items && cmrData.items.length > 0) {
          const ordersToUpdate = [];
          
          // Sprawdź nowy format (wiele zamówień)
          if (cmrData.linkedOrderIds && Array.isArray(cmrData.linkedOrderIds) && cmrData.linkedOrderIds.length > 0) {
            ordersToUpdate.push(...cmrData.linkedOrderIds);
          }
          
          // Sprawdź stary format (pojedyncze zamówienie) - dla kompatybilności wstecznej
          if (cmrData.linkedOrderId && !ordersToUpdate.includes(cmrData.linkedOrderId)) {
            ordersToUpdate.push(cmrData.linkedOrderId);
          }
          
          if (ordersToUpdate.length > 0) {
            console.log('Anulowanie ilości wysłanych w zamówieniach przy cofnięciu ze statusu "W transporcie"...');
            for (const orderId of ordersToUpdate) {
              await cancelLinkedOrderShippedQuantities(orderId, cmrData.items, cmrData.cmrNumber, userId);
              console.log(`Anulowano ilości wysłane w zamówieniu ${orderId} na podstawie CMR ${cmrData.cmrNumber}`);
            }
          }
        }
      } catch (orderUpdateError) {
        console.error('Błąd podczas anulowania ilości wysłanych w zamówieniach:', orderUpdateError);
        // Nie przerywamy procesu zmiany statusu - tylko logujemy błąd
      }
    }
    
    // Jeśli przechodzi na status "Anulowany", anuluj rezerwacje magazynowe (jeśli były aktywne)
    if (newStatus === CMR_STATUSES.CANCELED) {
      // Anuluj rezerwacje tylko jeśli CMR był w statusie "W transporcie" (czyli miał aktywne rezerwacje)
      if (currentStatus === CMR_STATUSES.IN_TRANSIT) {
        console.log('Anulowanie CMR z statusu "W transporcie" - zwalnianie rezerwacji magazynowych...');
        try {
          const cancellationResult = await cancelCmrReservations(cmrId, userId);
          console.log('Rezultat anulowania rezerwacji:', cancellationResult);
          
          // Dodaj informacje o anulowaniu do rezultatu
          deliveryResult = {
            success: true,
            message: cancellationResult.message,
            cancellationResults: cancellationResult.cancellationResults,
            errors: cancellationResult.errors
          };
        } catch (cancellationError) {
          console.error('Błąd podczas anulowania rezerwacji CMR:', cancellationError);
          // Nie przerywamy procesu zmiany statusu - tylko logujemy błąd
          deliveryResult = {
            success: false,
            message: `Błąd anulowania rezerwacji: ${cancellationError.message}`,
            errors: [{ error: cancellationError.message }]
          };
        }
      } else {
        console.log(`Anulowanie CMR z statusu "${currentStatus}" - brak aktywnych rezerwacji do anulowania`);
        deliveryResult = {
          success: true,
          message: `CMR anulowany z statusu "${currentStatus}" - brak rezerwacji do zwolnienia`
        };
      }
    }

    // Jeśli przechodzi na status "Dostarczone", anuluj rezerwacje i wydaj produkty
    if (newStatus === CMR_STATUSES.DELIVERED) {
      console.log('Dostarczenie CMR - usuwanie rezerwacji i wydanie produktów...');
      try {
        deliveryResult = await processCmrDelivery(cmrId, userId);
        console.log('Rezultat dostarczenia:', deliveryResult);
      } catch (deliveryError) {
        console.error('Błąd podczas przetwarzania dostarczenia:', deliveryError);
        // Nie przerywamy procesu zmiany statusu - tylko logujemy błąd
        deliveryResult = {
          success: false,
          message: `Błąd przetwarzania dostarczenia: ${deliveryError.message}`,
          errors: [{ error: deliveryError.message }]
        };
      }
    }
    
    // Jeśli przechodzi na status "Zakończone", usuń rezerwacje (jak deleteTask)
    if (newStatus === CMR_STATUSES.COMPLETED) {
      console.log('Zakończenie CMR - usuwanie rezerwacji...');
      try {
        deliveryResult = await cancelCmrReservations(cmrId, userId);
        console.log('Rezultat zakończenia:', deliveryResult);
      } catch (completionError) {
        console.error('Błąd podczas zakończenia CMR:', completionError);
        // Nie przerywamy procesu zmiany statusu - tylko logujemy błąd
        deliveryResult = {
          success: false,
          message: `Błąd zakończenia CMR: ${completionError.message}`,
          errors: [{ error: completionError.message }]
        };
      }
    }
    
    await updateDoc(cmrRef, {
      status: newStatus,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    });
    
    // Utwórz powiadomienie o zmianie statusu CMR
    try {
      const cmrData = await getCmrDocumentById(cmrId);
      
      // Określ użytkowników, którzy powinni otrzymać powiadomienie
      // Dodajemy użytkownika, który zmienił status oraz twórcę CMR
      const userIds = [userId];
      if (cmrData.createdBy && cmrData.createdBy !== userId) {
        userIds.push(cmrData.createdBy);
      }
      
      console.log('Tworzenie powiadomienia o zmianie statusu CMR...');
      await createRealtimeStatusChangeNotification(
        userIds,
        'cmr',
        cmrId,
        cmrData.cmrNumber,
        currentStatus,
        newStatus,
        userId
      );
      console.log(`Utworzono powiadomienie o zmianie statusu CMR ${cmrData.cmrNumber} z "${currentStatus}" na "${newStatus}"`);
    } catch (notificationError) {
      console.error('Błąd podczas tworzenia powiadomienia o zmianie statusu CMR:', notificationError);
      // Nie przerywamy procesu zmiany statusu - tylko logujemy błąd
    }
    
    // Aktualizuj cache CMR z nowymi danymi
    const updatedCacheData = {
      status: newStatus,
      updatedAt: new Date(), // Użyj lokalnej daty dla cache
      updatedBy: userId
    };
    
    updateCmrDocumentInCache(cmrId, updatedCacheData);
    
    const result = { 
      success: true, 
      status: newStatus 
    };
    
    // Dodaj informacje o rezerwacji jeśli są dostępne
    if (reservationResult) {
      result.reservationResult = reservationResult;
    }
    
    // Dodaj informacje o dostarczeniu jeśli są dostępne
    if (deliveryResult) {
      result.deliveryResult = deliveryResult;
    }
    
    return result;
  } catch (error) {
    console.error('Błąd podczas aktualizacji statusu dokumentu CMR:', error);
    throw error;
  }
};

// Funkcja do rezerwacji partii magazynowych dla dokumentu CMR
export const reserveBatchesForCmr = async (cmrId, userId) => {
  try {
    // Pobierz dane dokumentu CMR z elementami
    const cmrData = await getCmrDocumentById(cmrId);
    
    if (!cmrData || !cmrData.items || cmrData.items.length === 0) {
      console.log('Brak elementów w dokumencie CMR do rezerwacji');
      return { success: true, message: 'Brak elementów do rezerwacji' };
    }
    
    const { bookInventoryForTask } = await import('./inventory');
    const reservationResults = [];
    const errors = [];
    
    // Dla każdego elementu CMR z powiązanymi partiami
    for (const item of cmrData.items) {
      if (!item.linkedBatches || item.linkedBatches.length === 0) {
        console.log(`Element "${item.description}" nie ma powiązanych partii - pomijam`);
        continue;
      }
      
      // Pobierz ilość z pozycji CMR (ta ilość ma być zarezerwowana)
      const cmrItemQuantity = parseFloat(item.quantity) || 0;
      
      if (cmrItemQuantity <= 0) {
        console.log(`Element "${item.description}" ma zerową ilość - pomijam`);
        continue;
      }
      
      // Oblicz całkowitą ilość we wszystkich powiązanych partiach
      const totalBatchQuantity = item.linkedBatches.reduce((sum, batch) => sum + (parseFloat(batch.quantity) || 0), 0);
      
      if (totalBatchQuantity <= 0) {
        console.log(`Element "${item.description}" ma powiązane partie z zerową ilością - pomijam`);
        continue;
      }
      
      // Dla każdej powiązanej partii, oblicz proporcjonalną ilość do zarezerwowania
      for (const linkedBatch of item.linkedBatches) {
        try {
          const batchQuantity = parseFloat(linkedBatch.quantity) || 0;
          
          // Oblicz ilość do zarezerwowania z tej partii (proporcjonalnie)
          const quantityToReserve = (batchQuantity / totalBatchQuantity) * cmrItemQuantity;
          
          // Jeśli jest tylko jedna partia, zarezerwuj całą ilość z CMR
          const finalQuantityToReserve = item.linkedBatches.length === 1 ? cmrItemQuantity : quantityToReserve;
          
          if (finalQuantityToReserve <= 0) {
            console.log(`Pomijam partię ${linkedBatch.batchNumber} - zerowa ilość do rezerwacji`);
            continue;
          }
          
          console.log(`Rezerwowanie partii ${linkedBatch.batchNumber} - ${finalQuantityToReserve} ${linkedBatch.unit} z pozycji CMR (${cmrItemQuantity} ${item.unit}) dla CMR ${cmrData.cmrNumber}`);
          
          // Użyj funkcji bookInventoryForTask z określoną partią
          // Tworzymy specjalny identyfikator zadania dla CMR
          const cmrTaskId = `CMR-${cmrData.cmrNumber}-${cmrId}`;
          
          const reservationResult = await bookInventoryForTask(
            linkedBatch.itemId,           // ID produktu w magazynie
            finalQuantityToReserve,       // Ilość do zarezerwowania (proporcjonalna z CMR)
            cmrTaskId,                   // Unikalny identyfikator dla CMR
            userId,                      // Użytkownik wykonujący rezerwację
            'manual',                    // Metoda rezerwacji - ręczna
            linkedBatch.id               // Konkretna partia do zarezerwowania
          );
          
          reservationResults.push({
            itemId: linkedBatch.itemId,
            itemName: linkedBatch.itemName,
            batchId: linkedBatch.id,
            batchNumber: linkedBatch.batchNumber,
            quantity: finalQuantityToReserve,
            unit: linkedBatch.unit,
            cmrItemQuantity: cmrItemQuantity,
            cmrItemDescription: item.description,
            result: reservationResult
          });
          
          console.log(`Pomyślnie zarezerwowano ${finalQuantityToReserve} ${linkedBatch.unit} z partii ${linkedBatch.batchNumber}`);
          
        } catch (error) {
          console.error(`Błąd podczas rezerwacji partii ${linkedBatch.batchNumber}:`, error);
          errors.push({
            itemName: linkedBatch.itemName,
            batchNumber: linkedBatch.batchNumber,
            error: error.message
          });
        }
      }
    }
    
    // Przygotuj podsumowanie wyników
    const successCount = reservationResults.length;
    const errorCount = errors.length;
    
    let message = `Proces rezerwacji zakończony. `;
    if (successCount > 0) {
      message += `Pomyślnie zarezerwowano ${successCount} partii. `;
    }
    if (errorCount > 0) {
      message += `Błędy przy ${errorCount} partiach. `;
    }
    
    return {
      success: errorCount === 0,
      message,
      reservationResults,
      errors,
      statistics: {
        successCount,
        errorCount,
        totalAttempted: successCount + errorCount
      }
    };
    
  } catch (error) {
    console.error('Błąd podczas rezerwacji partii dla CMR:', error);
    throw new Error(`Nie można zarezerwować partii: ${error.message}`);
  }
};

// Funkcja do przetwarzania dostarczenia CMR - usuwa rezerwacje i wydaje produkty (jak deleteTask)
export const processCmrDelivery = async (cmrId, userId) => {
  try {
    console.log(`Rozpoczynanie procesu dostarczenia CMR ${cmrId}...`);
    
    // Pobierz dane dokumentu CMR z elementami
    const cmrData = await getCmrDocumentById(cmrId);
    
    if (!cmrData || !cmrData.items || cmrData.items.length === 0) {
      console.log('Brak elementów w dokumencie CMR do przetworzenia');
      return { success: true, message: 'Brak elementów do przetworzenia' };
    }
    
    const { cleanupTaskReservations, issueInventory } = await import('./inventory');
    const deliveryResults = [];
    const errors = [];
    
    // Identyfikator zadania CMR używany do rezerwacji
    const cmrTaskId = `CMR-${cmrData.cmrNumber}-${cmrId}`;
    
    console.log(`Przetwarzanie dostarczenia dla taskId: ${cmrTaskId}`);
    
    // Usuń wszystkie rezerwacje związane z tym CMR (jak w deleteTask)
    try {
      console.log(`Usuwanie wszystkich rezerwacji dla CMR ${cmrTaskId} przy dostarczeniu...`);
      const cleanupResult = await cleanupTaskReservations(cmrTaskId);
      console.log(`Usunięto wszystkie rezerwacje związane z CMR ${cmrTaskId}:`, cleanupResult);
    } catch (error) {
      console.error(`Błąd podczas usuwania rezerwacji dla CMR ${cmrTaskId}:`, error);
      errors.push({
        operation: 'cleanup_reservations',
        error: error.message
      });
      // Kontynuuj mimo błędu - wydanie produktów może się udać
    }
    
    // Oblicz całkowitą ilość we wszystkich powiązanych partiach dla każdego elementu
    for (const item of cmrData.items) {
      if (!item.linkedBatches || item.linkedBatches.length === 0) {
        console.log(`Element "${item.description}" nie ma powiązanych partii - pomijam`);
        continue;
      }
      
      // Pobierz ilość z pozycji CMR
      const cmrItemQuantity = parseFloat(item.quantity) || 0;
      
      if (cmrItemQuantity <= 0) {
        console.log(`Element "${item.description}" ma zerową ilość - pomijam`);
        continue;
      }
      
      // Oblicz całkowitą ilość we wszystkich powiązanych partiach
      const totalBatchQuantity = item.linkedBatches.reduce((sum, batch) => sum + (parseFloat(batch.quantity) || 0), 0);
      
      if (totalBatchQuantity <= 0) {
        console.log(`Element "${item.description}" ma powiązane partie z zerową ilością - pomijam`);
        continue;
      }
      
      // Wydaj produkty z konkretnych partii
      for (const linkedBatch of item.linkedBatches) {
        try {
          const batchQuantity = parseFloat(linkedBatch.quantity) || 0;
          
          // Oblicz ilość do wydania z tej partii (proporcjonalnie)
          const quantityToIssue = item.linkedBatches.length === 1 
            ? cmrItemQuantity 
            : (batchQuantity / totalBatchQuantity) * cmrItemQuantity;
          
          if (quantityToIssue <= 0) {
            console.log(`Pomijam partię ${linkedBatch.batchNumber} - zerowa ilość do wydania`);
            continue;
          }
          
          console.log(`Wydawanie z partii ${linkedBatch.batchNumber} - ${quantityToIssue} ${linkedBatch.unit} dla CMR ${cmrData.cmrNumber}`);
          
          // Wydaj produkt z konkretnej partii
          const issueResult = await issueInventory(
            linkedBatch.itemId,           // ID produktu w magazynie
            quantityToIssue,             // Ilość do wydania
            {
              warehouseId: linkedBatch.warehouseId,  // Magazyn
              batchId: linkedBatch.id,               // Konkretna partia
              reference: `CMR ${cmrData.cmrNumber}`, // Odwołanie
              notes: `Wydanie towaru na podstawie dostarczenia CMR ${cmrData.cmrNumber}`,
              cmrNumber: cmrData.cmrNumber,
              cmrId: cmrId
            },
            userId                       // Użytkownik wykonujący operację
          );
          
          deliveryResults.push({
            operation: 'issue_inventory',
            itemId: linkedBatch.itemId,
            itemName: linkedBatch.itemName,
            batchId: linkedBatch.id,
            batchNumber: linkedBatch.batchNumber,
            quantity: quantityToIssue,
            unit: linkedBatch.unit,
            warehouseId: linkedBatch.warehouseId,
            warehouseName: linkedBatch.warehouseName,
            cmrItemQuantity: cmrItemQuantity,
            cmrItemDescription: item.description,
            result: issueResult
          });
          
          console.log(`Pomyślnie wydano ${quantityToIssue} ${linkedBatch.unit} z partii ${linkedBatch.batchNumber}`);
          
        } catch (error) {
          console.error(`Błąd podczas wydawania z partii ${linkedBatch.batchNumber}:`, error);
          errors.push({
            operation: 'issue_inventory',
            itemName: linkedBatch.itemName,
            batchNumber: linkedBatch.batchNumber,
            error: error.message
          });
        }
      }
    }
    
    // Przygotuj podsumowanie wyników
    const successCount = deliveryResults.length;
    const errorCount = errors.length;
    
    let message = `Proces dostarczenia zakończony. `;
    if (successCount > 0) {
      message += `Pomyślnie wydano ${successCount} partii. `;
    }
    if (errorCount > 0) {
      message += `Błędy przy ${errorCount} operacjach. `;
    }
    
    return {
      success: errorCount === 0,
      message,
      deliveryResults,
      errors,
      statistics: {
        successCount,
        errorCount,
        totalAttempted: successCount + errorCount
      }
    };
    
  } catch (error) {
    console.error('Błąd podczas przetwarzania dostarczenia CMR:', error);
    throw new Error(`Nie można przetworzyć dostarczenia: ${error.message}`);
  }
};

// Wygenerowanie numeru dokumentu CMR
export const generateCmrNumber = (issueDate = null, customerAffix = '') => {
  const date = issueDate ? new Date(issueDate) : new Date();
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  
  // Format: CMR DD-MM-YYYY XX (gdzie XX to afiks klienta)
  let cmrNumber = `CMR ${day}-${month}-${year}`;
  
  // Dodaj afiks klienta jeśli został podany
  if (customerAffix && typeof customerAffix === 'string' && customerAffix.trim() !== '') {
    cmrNumber += ` ${customerAffix.trim()}`;
  }
  
  return cmrNumber;
};

/**
 * Pobierz wszystkie dokumenty CMR związane z danym zamówieniem (obsługuje stary i nowy format)
 */
export const getCmrDocumentsByOrderId = async (orderId) => {
  try {
    // Zapytanie dla starego formatu (linkedOrderId)
    const cmrQueryOld = query(
      collection(db, CMR_COLLECTION),
      where('linkedOrderId', '==', orderId),
      orderBy('issueDate', 'desc')
    );
    
    // Zapytanie dla nowego formatu (linkedOrderIds array)
    const cmrQueryNew = query(
      collection(db, CMR_COLLECTION),
      where('linkedOrderIds', 'array-contains', orderId),
      orderBy('issueDate', 'desc')
    );
    
    // Wykonaj oba zapytania równolegle
    const [oldFormatSnapshot, newFormatSnapshot] = await Promise.all([
      getDocs(cmrQueryOld),
      getDocs(cmrQueryNew)
    ]);
    
    const cmrDocuments = [];
    const seenDocumentIds = new Set(); // Aby uniknąć duplikatów
    
    // Przetwórz wyniki z obu zapytań
    const processSnapshot = (snapshot) => {
      snapshot.forEach((doc) => {
        if (!seenDocumentIds.has(doc.id)) {
          seenDocumentIds.add(doc.id);
          const data = doc.data();
          
          const processedDocument = {
            id: doc.id,
            ...data,
            issueDate: safeParseDate(data.issueDate),
            deliveryDate: safeParseDate(data.deliveryDate),
            loadingDate: safeParseDate(data.loadingDate),
            createdAt: safeParseDate(data.createdAt),
            updatedAt: safeParseDate(data.updatedAt)
          };
          
          cmrDocuments.push(processedDocument);
        }
      });
    };
    
    processSnapshot(oldFormatSnapshot);
    processSnapshot(newFormatSnapshot);
    
    // Pobierz pozycje dla każdego CMR z kolekcji cmrItems
    const cmrDocumentsWithItems = await Promise.all(
      cmrDocuments.map(async (cmrDoc) => {
        try {
          const itemsRef = collection(db, CMR_ITEMS_COLLECTION);
          const itemsQuery = query(itemsRef, where('cmrId', '==', cmrDoc.id));
          const itemsSnapshot = await getDocs(itemsQuery);
          
          const items = itemsSnapshot.docs.map(itemDoc => ({
            id: itemDoc.id,
            ...itemDoc.data()
          }));
          
          return {
            ...cmrDoc,
            items: items
          };
        } catch (error) {
          console.error(`Błąd podczas pobierania pozycji dla CMR ${cmrDoc.id}:`, error);
          return {
            ...cmrDoc,
            items: []
          };
        }
      })
    );
    
    // Sortuj po dacie wystawienia (najnowsze najpierw)
    cmrDocumentsWithItems.sort((a, b) => {
      const dateA = a.issueDate || new Date(0);
      const dateB = b.issueDate || new Date(0);
      return dateB - dateA;
    });
    
    return cmrDocumentsWithItems;
  } catch (error) {
    console.error('Błąd podczas pobierania dokumentów CMR dla zamówienia:', error);
    throw error;
  }
};

// Generowanie raportu z dokumentów CMR
export const generateCmrReport = async (filters = {}) => {
  try {
    console.log('generateCmrReport - otrzymane filtry:', filters);
    
    // Pobierz wszystkie dokumenty CMR bez filtrów
    const cmrRef = collection(db, CMR_COLLECTION);
    const q = query(cmrRef, orderBy('issueDate', 'desc'));
    
    // Pobierz dokumenty CMR
    const snapshot = await getDocs(q);
    
    console.log('generateCmrReport - znaleziono wszystkich dokumentów:', snapshot.docs.length);
    
    // Funkcja pomocnicza do konwersji pól czasowych (podobna do tej w getAllCmrDocuments)
    const convertTimestamp = (field) => {
      if (!field) return null;
      // Sprawdź czy pole jest obiektem Timestamp z metodą toDate
      if (field && typeof field.toDate === 'function') {
        return field.toDate();
      }
      // Sprawdź czy pole jest obiektem z polami seconds i nanoseconds (deserializowany Firestore Timestamp)
      if (field && typeof field === 'object' && typeof field.seconds === 'number') {
        return new Date(field.seconds * 1000 + (field.nanoseconds || 0) / 1000000);
      }
      // Jeśli jest stringiem lub numerem, spróbuj konwertować na Date
      if (typeof field === 'string' || typeof field === 'number') {
        try {
          return new Date(field);
        } catch (e) {
          console.warn('Nie można skonwertować pola na Date:', field);
          return null;
        }
      }
      return null;
    };

    // Mapowanie dokumentów do raportu
    const allCmrDocuments = snapshot.docs.map(doc => {
      const data = doc.data();
      
      const convertedIssueDate = convertTimestamp(data.issueDate);
      
      console.log('generateCmrReport - przetwarzanie dokumentu:', {
        cmrNumber: data.cmrNumber,
        issueDate: data.issueDate,
        issueDateType: typeof data.issueDate,
        issueDateConverted: convertedIssueDate
      });
      
      return {
        id: doc.id,
        cmrNumber: data.cmrNumber,
        issueDate: convertedIssueDate,
        deliveryDate: convertTimestamp(data.deliveryDate),
        sender: data.sender,
        recipient: data.recipient,
        loadingPlace: data.loadingPlace,
        deliveryPlace: data.deliveryPlace,
        status: data.status,
        items: [], // Zostawiamy puste, pobierzemy później jeśli potrzeba
        createdAt: convertTimestamp(data.createdAt)
      };
    });
    
    console.log('generateCmrReport - wszystkie dokumenty po mapowaniu:', allCmrDocuments.length);
    
    // Filtrowanie na poziomie aplikacji
    let cmrDocuments = allCmrDocuments;
    
    // Filtrowanie według dat
    if (filters.startDate && filters.endDate) {
      const startDate = new Date(filters.startDate);
      const endDateObj = new Date(filters.endDate);
      endDateObj.setHours(23, 59, 59, 999);
      
      console.log('generateCmrReport - filtrowanie według dat (aplikacja):', {
        originalStartDate: filters.startDate,
        originalEndDate: filters.endDate,
        startDate: startDate,
        endDate: endDateObj
      });
      
      cmrDocuments = cmrDocuments.filter(doc => {
        if (!doc.issueDate) return false;
        const docDate = new Date(doc.issueDate);
        const inRange = docDate >= startDate && docDate <= endDateObj;
        console.log(`Dokument ${doc.cmrNumber} (${docDate.toISOString()}) - ${inRange ? 'WŁĄCZONY' : 'WYKLUCZONY'}`);
        return inRange;
      });
    }
    
    // Filtrowanie według odbiorcy
    if (filters.recipient) {
      cmrDocuments = cmrDocuments.filter(doc => doc.recipient === filters.recipient);
    }
    
    // Filtrowanie według statusu
    if (filters.status) {
      cmrDocuments = cmrDocuments.filter(doc => doc.status === filters.status);
    }
    
    console.log('generateCmrReport - dokumenty po filtrowaniu:', cmrDocuments.length);
    
    // Opcjonalnie pobieramy elementy dla każdego dokumentu
    if (filters.includeItems) {
      const promises = cmrDocuments.map(async (doc) => {
        const itemsRef = collection(db, CMR_ITEMS_COLLECTION);
        const itemsQuery = query(itemsRef, where('cmrId', '==', doc.id));
        const itemsSnapshot = await getDocs(itemsQuery);
        
        doc.items = itemsSnapshot.docs.map(itemDoc => ({
          id: itemDoc.id,
          ...itemDoc.data()
        }));
        
        return doc;
      });
      
      // Czekamy na zakończenie wszystkich zapytań
      await Promise.all(promises);
    }
    
    // Statystyki raportu
    const statistics = {
      totalDocuments: cmrDocuments.length,
      byStatus: {},
      byRecipient: {}
    };
    
    // Obliczanie statystyk
    cmrDocuments.forEach(doc => {
      // Statystyki według statusu
      if (!statistics.byStatus[doc.status]) {
        statistics.byStatus[doc.status] = 0;
      }
      statistics.byStatus[doc.status]++;
      
      // Statystyki według odbiorcy
      if (!statistics.byRecipient[doc.recipient]) {
        statistics.byRecipient[doc.recipient] = 0;
      }
      statistics.byRecipient[doc.recipient]++;
    });
    
    return {
      documents: cmrDocuments,
      statistics,
      filters,
      generatedAt: new Date(),
      reportName: `Raport CMR ${format(new Date(), 'dd.MM.yyyy')}`
    };
  } catch (error) {
    console.error('Błąd podczas generowania raportu CMR:', error);
    throw error;
  }
}; 

// Funkcja pomocnicza do aktualizacji ilości wysłanych w powiązanym zamówieniu
// ULEPSZONA WERSJA - używa tej samej logiki dopasowania co refreshShippedQuantitiesFromCMR
const updateLinkedOrderShippedQuantities = async (orderId, cmrItems, cmrNumber, userId) => {
  try {
    console.log(`🔄 Rozpoczęcie inteligentnej aktualizacji ilości wysłanych dla zamówienia ${orderId} z CMR ${cmrNumber}...`);
    
    // KROK 1: Pobierz aktualne dane zamówienia
    const { getOrderById } = await import('./orderService');
    const orderData = await getOrderById(orderId);
    
    if (!orderData || !orderData.items || orderData.items.length === 0) {
      console.log('❌ Zamówienie nie istnieje lub nie ma pozycji');
      return;
    }
    
    console.log(`📋 Zamówienie ma ${orderData.items.length} pozycji:`, 
      orderData.items.map(item => ({ id: item.id, name: item.name, quantity: item.quantity })));
    
    // KROK 2: Użyj ulepszonego algorytmu dopasowania (kopiuj z refreshShippedQuantitiesFromCMR)
    const preciseItemUpdates = [];
    
    for (let cmrItemIndex = 0; cmrItemIndex < cmrItems.length; cmrItemIndex++) {
      const cmrItem = cmrItems[cmrItemIndex];
      const quantity = parseFloat(cmrItem.quantity) || parseFloat(cmrItem.numberOfPackages) || 0;
      
      console.log(`🔍 Dopasowywanie CMR pozycji ${cmrItemIndex}: "${cmrItem.description}", ilość: ${quantity}`);
      
      if (quantity <= 0) {
        console.log(`⏭️ Pomijam pozycję z zerową ilością`);
        continue;
      }
      
      // ALGORYTM DOPASOWANIA (skopiowany z refreshShippedQuantitiesFromCMR)
      let orderItemIndex = -1;
      
      // 1. PRIORYTET: Sprawdź orderItemId z walidacją
      if (cmrItem.orderItemId && (
          cmrItem.orderId === orderId ||
          (!cmrItem.orderId && cmrItem.orderNumber === orderData.orderNumber)
      )) {
        orderItemIndex = orderData.items.findIndex(orderItem => orderItem.id === cmrItem.orderItemId);
        if (orderItemIndex !== -1) {
          console.log(`✅ Dopasowano przez orderItemId: ${cmrItem.orderItemId} dla pozycji "${cmrItem.description}"`);
        } else {
          console.warn(`⚠️ NIEAKTUALNE powiązanie: orderItemId ${cmrItem.orderItemId} nie istnieje w zamówieniu "${cmrItem.description}"`);
        }
      } else if (cmrItem.orderItemId && cmrItem.orderId && cmrItem.orderId !== orderId) {
        console.log(`⏭️ Pomijam pozycję CMR z innego zamówienia (orderId): ${cmrItem.orderId} vs ${orderId}`);
        continue;
      } else if (cmrItem.orderItemId && cmrItem.orderNumber && cmrItem.orderNumber !== orderData.orderNumber) {
        console.log(`⏭️ Pomijam pozycję CMR z innego zamówienia (orderNumber): ${cmrItem.orderNumber} vs ${orderData.orderNumber}`);
        continue;
      }
      
      // 2. Funkcja normalizacji nazw (skopiowana z refreshShippedQuantitiesFromCMR)
      const normalizeProductName = (name) => {
        if (!name) return '';
        return name
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '') // usuń wszystkie znaki niealfanumeryczne
          .replace(/omega3/g, 'omega')
          .replace(/omegacaps/g, 'omega')
          .replace(/caps$/g, ''); // usuń "caps" na końcu
      };
      
      const normalizedCmrName = normalizeProductName(cmrItem.description);
      
      // 3. Jeśli nie ma orderItemId lub nie znaleziono, użyj obecnej logiki nazw
      if (orderItemIndex === -1) {
        // 3.1. Dokładne dopasowanie nazwy
        orderItemIndex = orderData.items.findIndex(orderItem => 
          orderItem.name && cmrItem.description && 
          orderItem.name.trim().toLowerCase() === cmrItem.description.trim().toLowerCase()
        );
      
        // 3.2. Jeśli nie znaleziono, spróbuj dopasowania przez ID
        if (orderItemIndex === -1 && cmrItem.itemId) {
          orderItemIndex = orderData.items.findIndex(orderItem => orderItem.id === cmrItem.itemId);
        }
        
        // 3.3. Dopasowanie przez znormalizowane nazwy
        if (orderItemIndex === -1 && normalizedCmrName) {
          orderItemIndex = orderData.items.findIndex(orderItem => {
            const normalizedOrderName = normalizeProductName(orderItem.name);
            return normalizedOrderName === normalizedCmrName;
          });
        }
        
        // 3.4. Częściowe dopasowanie nazwy
        if (orderItemIndex === -1) {
          orderItemIndex = orderData.items.findIndex(orderItem => {
            if (!orderItem.name || !cmrItem.description) return false;
            const orderName = orderItem.name.trim().toLowerCase();
            const cmrDesc = cmrItem.description.trim().toLowerCase();
            return orderName.includes(cmrDesc) || cmrDesc.includes(orderName);
          });
        }
        
        // 3.5. Specjalne dopasowanie dla produktów OMEGA
        if (orderItemIndex === -1 && cmrItem.description && cmrItem.description.toLowerCase().includes('omega')) {
          orderItemIndex = orderData.items.findIndex(orderItem => 
            orderItem.name && orderItem.name.toLowerCase().includes('omega')
          );
        }
        
        // 3.6. Ostatnia próba - dopasowanie według indeksu (tylko jeśli liczba pozycji się zgadza)
        if (orderItemIndex === -1 && orderData.items.length === cmrItems.length && cmrItemIndex < orderData.items.length) {
          console.log(`🔄 Próba dopasowania według indeksu ${cmrItemIndex}`);
          orderItemIndex = cmrItemIndex;
        }
      }
      
      console.log(`🎯 Rezultat dopasowania dla "${cmrItem.description}": indeks ${orderItemIndex}`);
      
      if (orderItemIndex !== -1) {
        // DOKŁADNE DOPASOWANIE - dodaj do precyzyjnych aktualizacji
        preciseItemUpdates.push({
          orderItemId: orderData.items[orderItemIndex].id,  // PRECYZYJNE ID zamiast nazwy/indeksu
          orderItemIndex: orderItemIndex,                   // Dodatkowa walidacja
          itemName: cmrItem.description,
          quantity: quantity,
          cmrNumber: cmrNumber,
          matchMethod: cmrItem.orderItemId ? 'orderItemId' : 'name_matching'
        });
        
        console.log(`✅ Dodano precyzyjną aktualizację dla pozycji "${orderData.items[orderItemIndex].name}" (ID: ${orderData.items[orderItemIndex].id})`);
      } else {
        console.warn(`❌ Nie znaleziono odpowiadającej pozycji w zamówieniu dla "${cmrItem.description}" z CMR ${cmrNumber}`);
        console.log('📝 Dostępne pozycje w zamówieniu:', orderData.items.map((item, idx) => `${idx}: "${item.name}" (ID: ${item.id})`));
      }
    }
    
    // KROK 3: Zastosuj precyzyjne aktualizacje
    if (preciseItemUpdates.length > 0) {
      console.log(`🚀 Aplikowanie ${preciseItemUpdates.length} precyzyjnych aktualizacji do zamówienia ${orderId}`);
      
      // Użyj ulepszonej funkcji aktualizacji
      await updateOrderItemShippedQuantityPrecise(orderId, preciseItemUpdates, userId);
      console.log(`✅ Zaktualizowano ilości wysłane w zamówieniu ${orderId} na podstawie CMR ${cmrNumber} (precyzyjny algorytm)`);
    } else {
      console.log(`⚠️ Brak pozycji do aktualizacji w zamówieniu ${orderId} dla CMR ${cmrNumber}`);
    }
    
  } catch (error) {
    console.error('❌ Błąd podczas inteligentnej aktualizacji ilości wysłanych w zamówieniu:', error);
    // Nie rzucamy błędu, aby nie przerywać procesu tworzenia CMR
  }
};

// POPRAWIONA funkcja pomocnicza do anulowania ilości wysłanych - usuwa wpisy z cmrHistory zamiast dodawać ujemne wartości
const cancelLinkedOrderShippedQuantities = async (orderId, cmrItems, cmrNumber, userId) => {
  try {
    console.log(`🗑️ Rozpoczęcie anulowania przez usunięcie wpisów CMR ${cmrNumber} z zamówienia ${orderId}...`);
    
    // KROK 1: Pobierz aktualne dane zamówienia
    const { getOrderById } = await import('./orderService');
    const orderData = await getOrderById(orderId);
    
    if (!orderData || !orderData.items || orderData.items.length === 0) {
      console.log('❌ Zamówienie nie istnieje lub nie ma pozycji');
      return;
    }
    
    console.log(`📋 Zamówienie ma ${orderData.items.length} pozycji do sprawdzenia dla CMR ${cmrNumber}`);
    
    // KROK 2: Usuń wpisy CMR z historii zamiast dodawać ujemne wartości
    const updatedItems = orderData.items.map(item => {
      // Sprawdź czy pozycja ma historię CMR
      if (!item.cmrHistory || !Array.isArray(item.cmrHistory) || item.cmrHistory.length === 0) {
        return item; // Brak historii CMR - zostaw bez zmian
      }
      
      // Znajdź wpisy do usunięcia dla tego CMR
      const entriesToRemove = item.cmrHistory.filter(entry => entry.cmrNumber === cmrNumber);
      
      if (entriesToRemove.length === 0) {
        return item; // Brak wpisów dla tego CMR - zostaw bez zmian
      }
      
      console.log(`🗑️ Usuwanie ${entriesToRemove.length} wpisów CMR ${cmrNumber} z pozycji "${item.name}"`);
      
      // Usuń wpisy dla tego CMR z historii
      const updatedCmrHistory = item.cmrHistory.filter(entry => entry.cmrNumber !== cmrNumber);
      
      // Przelicz łączną ilość wysłaną na podstawie pozostałej historii
      const newShippedQuantity = updatedCmrHistory.reduce((total, entry) => {
        return total + (parseFloat(entry.quantity) || 0);
      }, 0);
      
      // Znajdź najnowszy wpis CMR dla aktualizacji lastShipmentDate i lastCmrNumber
      let lastShipmentDate = null;
      let lastCmrNumber = null;
      
      if (updatedCmrHistory.length > 0) {
        const sortedEntries = updatedCmrHistory.sort((a, b) => new Date(b.shipmentDate) - new Date(a.shipmentDate));
        lastShipmentDate = sortedEntries[0].shipmentDate;
        lastCmrNumber = sortedEntries[0].cmrNumber;
      }
      
      console.log(`✅ Pozycja "${item.name}": usunięto CMR ${cmrNumber}, nowa ilość wysłana: ${newShippedQuantity} (z ${updatedCmrHistory.length} pozostałych CMR)`);
      
      return {
        ...item,
        shippedQuantity: newShippedQuantity,
        lastShipmentDate: lastShipmentDate,
        lastCmrNumber: lastCmrNumber,
        cmrHistory: updatedCmrHistory,
        canceledAt: new Date().toISOString(), // Dodaj znacznik czasu anulowania
        canceledCmr: cmrNumber, // Dodaj informację o anulowanym CMR
        canceledBy: userId
      };
    });
    
    // KROK 3: Zapisz zaktualizowane dane zamówienia
    const { updateDoc, doc, serverTimestamp } = await import('firebase/firestore');
    const { db } = await import('./firebase/config'); 
    const orderRef = doc(db, 'orders', orderId);
    
    await updateDoc(orderRef, {
      items: updatedItems,
      updatedBy: userId,
      updatedAt: serverTimestamp()
    });
    
    // Policz statystyki
    const updatedPositions = updatedItems.filter((item, index) => {
      const originalItem = orderData.items[index];
      return originalItem.cmrHistory?.some(entry => entry.cmrNumber === cmrNumber);
    }).length;
    
    console.log(`✅ Anulowano CMR ${cmrNumber} w zamówieniu ${orderId}: zaktualizowano ${updatedPositions} pozycji przez usunięcie wpisów z historii`);
    
  } catch (error) {
    console.error('❌ Błąd podczas anulowania przez usunięcie wpisów CMR z historii:', error);
    // Nie rzucamy błędu, aby nie przerywać procesu zmiany statusu/usuwania CMR
  }
};

/**
 * Funkcja do oczyszczenia ujemnych wartości z cmrHistory w całej bazie danych
 * @param {string} userId - ID użytkownika wykonującego oczyszczanie
 * @returns {Promise<object>} - Wynik operacji oczyszczania
 */
export const cleanNegativeCmrHistoryEntries = async (userId = 'system') => {
  try {
    console.log('🧹 Rozpoczynanie oczyszczania ujemnych wpisów z cmrHistory...');
    
    const { collection, getDocs, updateDoc, doc, serverTimestamp } = await import('firebase/firestore');
    const { db } = await import('./firebase/config');
    
    const ordersRef = collection(db, 'orders');
    const snapshot = await getDocs(ordersRef);
    
    let cleanedOrders = 0;
    let cleanedEntries = 0;
    let processedOrders = 0;
    
    for (const orderDoc of snapshot.docs) {
      const orderData = orderDoc.data();
      const items = orderData.items || [];
      let needsUpdate = false;
      processedOrders++;
      
      if (processedOrders % 50 === 0) {
        console.log(`📊 Przetworzono ${processedOrders} zamówień...`);
      }
      
      const cleanedItems = items.map(item => {
        if (!item.cmrHistory || !Array.isArray(item.cmrHistory)) {
          return item;
        }
        
        // Usuń ujemne wpisy z cmrHistory
        const positiveEntries = item.cmrHistory.filter(entry => {
          const quantity = parseFloat(entry.quantity) || 0;
          if (quantity < 0) {
            console.log(`🗑️ Usuwanie ujemnego wpisu z pozycji "${item.name}": CMR ${entry.cmrNumber}, ilość: ${quantity}`);
            cleanedEntries++;
            needsUpdate = true;
            return false;
          }
          return true;
        });
        
        if (needsUpdate && positiveEntries.length !== item.cmrHistory.length) {
          // Przelicz ilość wysłaną na podstawie pozytywnych wpisów
          const newShippedQuantity = positiveEntries.reduce((total, entry) => {
            return total + (parseFloat(entry.quantity) || 0);
          }, 0);
          
          // Znajdź najnowszy wpis dla lastShipmentDate i lastCmrNumber
          let lastShipmentDate = null;
          let lastCmrNumber = null;
          
          if (positiveEntries.length > 0) {
            const sortedEntries = positiveEntries.sort((a, b) => new Date(b.shipmentDate) - new Date(a.shipmentDate));
            lastShipmentDate = sortedEntries[0].shipmentDate;
            lastCmrNumber = sortedEntries[0].cmrNumber;
          }
          
          return {
            ...item,
            cmrHistory: positiveEntries,
            shippedQuantity: newShippedQuantity,
            lastShipmentDate: lastShipmentDate,
            lastCmrNumber: lastCmrNumber,
            cleanedNegativeCmr: true,
            cleanedAt: new Date().toISOString()
          };
        }
        
        return item;
      });
      
      if (needsUpdate) {
        await updateDoc(doc(db, 'orders', orderDoc.id), {
          items: cleanedItems,
          updatedAt: serverTimestamp(),
          updatedBy: userId,
          cleanedNegativeCmrHistory: true,
          cleanedAt: serverTimestamp()
        });
        
        cleanedOrders++;
        console.log(`✅ Oczyszczono zamówienie ${orderData.orderNumber || orderDoc.id}`);
        
        // Dodaj małą pauzę co 10 zamówień, żeby nie przeciążyć bazy
        if (cleanedOrders % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }
    
    console.log(`🎉 Oczyszczanie zakończone:`);
    console.log(`   📋 Przetworzono: ${processedOrders} zamówień`);
    console.log(`   🧹 Oczyszczono: ${cleanedOrders} zamówień`);
    console.log(`   🗑️ Usunięto: ${cleanedEntries} ujemnych wpisów CMR`);
    
    return { 
      success: true, 
      processedOrders,
      cleanedOrders, 
      cleanedEntries,
      message: `Oczyszczono ${cleanedOrders} zamówień, usunięto ${cleanedEntries} ujemnych wpisów z cmrHistory`
    };
    
  } catch (error) {
    console.error('❌ Błąd podczas oczyszczania ujemnych wpisów:', error);
    throw error;
  }
};

/**
 * Dodaje lub aktualizuje usługi transportowe w zamówieniach na podstawie palet z CMR
 * @param {string} cmrId - ID dokumentu CMR
 * @param {Array} cmrItems - Pozycje CMR
 * @param {Array} linkedOrderIds - Lista ID powiązanych zamówień
 * @param {string} userId - ID użytkownika
 * @returns {Promise<object>} - Wynik operacji
 */
export const addTransportServicesToOrders = async (cmrId, cmrItems, linkedOrderIds, userId) => {
  try {
    console.log(`🚚 Rozpoczynam dodawanie usług transportowych dla CMR ${cmrId}`);
    
    if (!linkedOrderIds || linkedOrderIds.length === 0) {
      console.log('Brak powiązanych zamówień - pomijam dodawanie usług transportowych');
      return { success: true, message: 'Brak powiązanych zamówień', ordersUpdated: [] };
    }
    
    const results = [];
    
    // Import potrzebnych serwisów
    const { getOrderById, updateOrder } = await import('./orderService');
    
    for (const orderId of linkedOrderIds) {
      try {
        // Pobierz zamówienie
        const order = await getOrderById(orderId);
        
        if (!order) {
          console.warn(`⚠️ Nie znaleziono zamówienia ${orderId}`);
          results.push({ orderId, success: false, message: 'Zamówienie nie istnieje' });
          continue;
        }
        
        // Zsumuj palety dla tego zamówienia
        // Priorytet: orderId, fallback: orderNumber (dla starszych danych)
        console.log(`🔍 [ADD_TRANSPORT] Sprawdzam pozycje CMR dla zamówienia ${order.orderNumber}...`);
        
        const filteredItems = cmrItems.filter(item => {
          const belongsToOrder = 
            (item.orderId && item.orderId === orderId) ||
            (!item.orderId && item.orderNumber && item.orderNumber === order.orderNumber);
          return belongsToOrder && item.orderItemId;
        });
        
        console.log(`📋 [ADD_TRANSPORT] Znaleziono ${filteredItems.length} pozycji należących do zamówienia`);
        
        const palletsCount = filteredItems.reduce((sum, item) => {
          // Priorytet: volume (pracownicy wpisują tam rzeczywistą liczbę palet), fallback: palletsCount
          const volumeValue = parseFloat(item.volume) || 0;
          const palletsCountValue = parseFloat(item.palletsCount) || 0;
          const quantity = volumeValue || palletsCountValue || 0;
          const sourceField = volumeValue > 0 ? 'volume' : (palletsCountValue > 0 ? 'palletsCount' : 'brak');
          
          console.log(`   📦 [ADD_TRANSPORT] ${item.description}:`, {
            'volume': item.volume,
            'palletsCount': item.palletsCount,
            'UŻYTA WARTOŚĆ': quantity,
            'ŹRÓDŁO': sourceField
          });
          
          return sum + quantity;
        }, 0);
        
        console.log(`📊 [ADD_TRANSPORT] Zamówienie ${order.orderNumber}: SUMA = ${palletsCount} palet`);
        
        if (palletsCount === 0) {
          console.log(`⏭️ Brak palet dla zamówienia ${order.orderNumber} - pomijam`);
          results.push({ orderId, orderNumber: order.orderNumber, success: true, message: 'Brak palet', palletsCount: 0 });
          continue;
        }
        
        // NOWA LOGIKA: Najpierw sprawdź listę cenową klienta
        let transportService = null;
        let servicePrice = 0;
        let fromPriceList = false;
        
        if (order.customer && order.customer.id) {
          try {
            console.log(`🔍 Szukam usługi transportowej w liście cenowej klienta ${order.customer.name}...`);
            
            // Pobierz pozycje z listy cenowej klienta
            const { getPriceListItems, getPriceListsByCustomerId } = await import('./priceListService');
            const { getInventoryItemById } = await import('./inventory');
            
            const priceLists = await getPriceListsByCustomerId(order.customer.id);
            
            // Przeszukaj wszystkie listy cenowe klienta
            for (const priceList of priceLists) {
              if (!priceList.isActive) continue; // Pomiń nieaktywne listy
              
              const priceListItems = await getPriceListItems(priceList.id);
              
              // Znajdź usługę transportową w liście cenowej (zawierającą "TRANSPORT" w nazwie)
              const transportItem = priceListItems.find(item => 
                item.productName && 
                item.productName.toUpperCase().includes('TRANSPORT') &&
                !item.isRecipe // Upewnij się że to nie receptura
              );
              
              if (transportItem && transportItem.productId) {
                console.log(`✅ Znaleziono usługę transportową w liście cenowej: ${transportItem.productName}, cena: ${transportItem.price}`);
                
                // Pobierz pełne dane usługi z magazynu
                try {
                  transportService = await getInventoryItemById(transportItem.productId);
                  servicePrice = transportItem.price || 0;
                  fromPriceList = true;
                  
                  console.log(`💰 Użyto usługi "${transportService.name}" z listy cenowej, cena: ${servicePrice}`);
                  break; // Znaleziono usługę, przerwij pętlę
                } catch (error) {
                  console.warn(`⚠️ Nie można pobrać szczegółów usługi ${transportItem.productId}:`, error);
                }
              }
            }
          } catch (error) {
            console.warn('Błąd podczas szukania usługi w liście cenowej:', error);
          }
        }
        
        // FALLBACK: Jeśli nie znaleziono w liście cenowej, szukaj w magazynie
        if (!transportService) {
          console.log(`🔍 Nie znaleziono usługi transportowej w liście cenowej - szukam w magazynie...`);
          
          const { getInventoryItemsByCategory } = await import('./inventory');
          const servicesData = await getInventoryItemsByCategory('Inne');
          const services = servicesData?.items || servicesData || [];
          
          // Znajdź usługę transportową w magazynie
          transportService = services.find(s => 
            s.name && s.name.toUpperCase().includes('TRANSPORT')
          );
          
          if (!transportService) {
            console.warn(`⚠️ Nie znaleziono usługi transportowej ani w liście cenowej, ani w magazynie`);
            results.push({ orderId, orderNumber: order.orderNumber, success: false, message: 'Brak usługi transportowej w systemie' });
            continue;
          }
          
          console.log(`✅ Znaleziono usługę transportową w magazynie: ${transportService.name}`);
          
          // Użyj standardowej ceny z usługi
          servicePrice = transportService.standardPrice || 0;
          fromPriceList = false;
          console.log(`💰 Użyto standardowej ceny: ${servicePrice}`);
        }
        
        // Sprawdź czy zamówienie już ma usługę transportową
        const updatedItems = [...(order.items || [])];
        const existingServiceIndex = updatedItems.findIndex(item => 
          item.serviceId === transportService.id && item.itemType === 'service'
        );
        
         if (existingServiceIndex !== -1) {
           // Aktualizuj istniejącą usługę
           const existingService = updatedItems[existingServiceIndex];
           const newQuantity = (parseFloat(existingService.quantity) || 0) + palletsCount;
           
           // Przygotuj notatki (dodaj notatki z listy cenowej jeśli są)
           let serviceNotes = `Automatycznie dodane z CMR - ${newQuantity} palet`;
           if (transportService.priceListNotes) {
             serviceNotes = `${transportService.priceListNotes}\n${serviceNotes}`;
           }
           
           updatedItems[existingServiceIndex] = {
             ...existingService,
             quantity: newQuantity,
             totalPrice: newQuantity * servicePrice,
             notes: serviceNotes
           };
           
           console.log(`🔄 Zaktualizowano usługę transportową: ${existingService.quantity} → ${newQuantity} palet`);
        } else {
          // Dodaj nową usługę
          const newService = {
            id: `service-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: transportService.name,
            serviceId: transportService.id,
            itemType: 'service',
            quantity: palletsCount,
            unit: transportService.unit || 'szt.',
            price: servicePrice,
            totalPrice: palletsCount * servicePrice,
            fromPriceList: fromPriceList,
            notes: `Automatycznie dodane z CMR - ${palletsCount} palet`,
            addedFromCmr: true,
            cmrId: cmrId
          };
          
          updatedItems.push(newService);
          console.log(`✨ Dodano nową usługę transportową: ${palletsCount} palet po ${servicePrice}`);
        }
        
        // Przelicz wartość zamówienia
        const newTotalValue = updatedItems.reduce((sum, item) => 
          sum + (parseFloat(item.totalPrice) || 0), 0
        );
        
        // Zaktualizuj zamówienie
        await updateOrder(orderId, {
          items: updatedItems,
          totalValue: newTotalValue
        }, userId);
        
        results.push({
          orderId,
          orderNumber: order.orderNumber,
          success: true,
          message: `Dodano/zaktualizowano usługę transportową: ${palletsCount} palet`,
          palletsCount,
          servicePrice,
          totalServiceValue: palletsCount * servicePrice
        });
        
        console.log(`✅ Zaktualizowano zamówienie ${order.orderNumber}`);
        
      } catch (orderError) {
        console.error(`Błąd podczas przetwarzania zamówienia ${orderId}:`, orderError);
        results.push({
          orderId,
          success: false,
          message: orderError.message,
          error: orderError
        });
      }
    }
    
    return {
      success: true,
      message: `Przetworzono ${results.length} zamówień`,
      results
    };
    
  } catch (error) {
    console.error('Błąd podczas dodawania usług transportowych:', error);
    throw error;
  }
};

/**
 * Aktualizuje usługę transportową w zamówieniu na podstawie WSZYSTKICH powiązanych CMR
 * Przydatne po migracji lub gdy trzeba przeliczyć palety
 * @param {string} orderId - ID zamówienia
 * @param {string} userId - ID użytkownika
 * @returns {Promise<object>} - Wynik operacji
 */
export const recalculateTransportServiceForOrder = async (orderId, userId) => {
  try {
    console.log(`🔄 Rozpoczynam przeliczanie usługi transportowej dla zamówienia ${orderId}`);
    
    // Import potrzebnych serwisów
    const { getOrderById, updateOrder } = await import('./orderService');
    
    // Pobierz zamówienie
    const order = await getOrderById(orderId);
    
    if (!order) {
      throw new Error('Zamówienie nie istnieje');
    }
    
     // KROK 1: Pobierz wszystkie dokumenty CMR powiązane z tym zamówieniem
     console.log(`🔍 [RECALCULATE] Pobieranie dokumentów CMR powiązanych z zamówieniem ${orderId}...`);
     const allCmrDocuments = await getCmrDocumentsByOrderId(orderId);
     
     // Filtruj CMR - pomijamy szkice i wystawione (bierzemy tylko te w transporcie, dostarczone, zakończone)
     const cmrDocuments = allCmrDocuments.filter(cmr => {
       const shouldInclude = cmr.status !== CMR_STATUSES.DRAFT && cmr.status !== CMR_STATUSES.ISSUED;
       if (!shouldInclude) {
         console.log(`⏭️ [RECALCULATE] Pomijam CMR ${cmr.cmrNumber} ze statusem "${cmr.status}"`);
       }
       return shouldInclude;
     });
     
     console.log(`📋 [RECALCULATE] Znaleziono ${allCmrDocuments.length} dokumentów CMR, z czego ${cmrDocuments.length} w odpowiednim statusie (pomijam szkice i wystawione)`);
     
     if (cmrDocuments.length === 0) {
       console.log(`⏭️ [RECALCULATE] Brak dokumentów CMR w odpowiednim statusie dla zamówienia ${order.orderNumber}`);
       return { 
         success: true, 
         message: allCmrDocuments.length > 0 ? 
           `Wszystkie ${allCmrDocuments.length} CMR mają status szkic/wystawione - pominięto` : 
           'Brak dokumentów CMR dla tego zamówienia',
         orderNumber: order.orderNumber,
         palletsCount: 0,
         cmrCount: 0,
         cmrCountTotal: allCmrDocuments.length,
         action: 'none'
       };
     }
     
     // KROK 2: Użyj już pobranych pozycji CMR (bez limitu Firestore!)
     // getCmrDocumentsByOrderId już pobiera pozycje dla każdego dokumentu
     let totalPallets = 0;
     const itemsWithPallets = [];
     const itemsWithoutPallets = [];
     const itemsFromOtherOrders = [];
     
     cmrDocuments.forEach(cmrDoc => {
       console.log(`📋 [RECALCULATE] Przetwarzam CMR ${cmrDoc.cmrNumber} z ${(cmrDoc.items || []).length} pozycjami`);
       
      (cmrDoc.items || []).forEach(item => {
        // Priorytet: volume (pracownicy wpisują tam rzeczywistą liczbę palet), fallback: palletsCount
        const volumeValue = parseFloat(item.volume) || 0;
        const palletsCountValue = parseFloat(item.palletsCount) || 0;
        const palletsCount = volumeValue || palletsCountValue || 0;
        const sourceField = volumeValue > 0 ? 'volume' : (palletsCountValue > 0 ? 'palletsCount' : 'brak');
         
         console.log(`   📦 [RECALCULATE] Pozycja CMR:`, {
           description: item.description,
           'volume (oryg.)': item.volume,
           'palletsCount (oryg.)': item.palletsCount,
           'volume (parsed)': volumeValue,
           'palletsCount (parsed)': palletsCountValue,
           'UŻYTA WARTOŚĆ': palletsCount,
           'ŹRÓDŁO': sourceField,
           cmrId: item.cmrId,
           orderId: item.orderId,
           orderNumber: item.orderNumber,
           targetOrderId: orderId,
           targetOrderNumber: order.orderNumber
         });
         
         // KLUCZOWE: Sprawdź czy pozycja należy do tego zamówienia
         // Priorytet: orderId, fallback: orderNumber (dla starszych danych)
         const belongsToThisOrder = 
           (item.orderId && item.orderId === orderId) ||
           (!item.orderId && item.orderNumber && item.orderNumber === order.orderNumber);
         
         if (!belongsToThisOrder) {
           itemsFromOtherOrders.push({
             description: item.description,
             palletsCount: palletsCount,
             cmrId: item.cmrId,
             orderId: item.orderId,
             orderNumber: item.orderNumber
           });
           console.log(`      ⏭️ [RECALCULATE] Pominięto - pozycja należy do innego zamówienia: orderId=${item.orderId}, orderNumber=${item.orderNumber}`);
           return;
         }
         
         console.log(`      ✓ [RECALCULATE] Pozycja należy do zamówienia (dopasowano przez ${item.orderId ? 'orderId' : 'orderNumber'})`);
         
         if (palletsCount > 0) {
           totalPallets += palletsCount;
           itemsWithPallets.push({
             description: item.description,
             palletsCount: palletsCount,
             cmrId: item.cmrId
           });
           console.log(`      ✅ [RECALCULATE] Dodano ${palletsCount} palet (suma: ${totalPallets})`);
         } else {
           itemsWithoutPallets.push({
             description: item.description,
             cmrId: item.cmrId
           });
           console.log(`      ⏭️ [RECALCULATE] Pozycja bez palet`);
         }
       });
     });
     
     if (itemsWithoutPallets.length > 0) {
       console.log(`⚠️ [RECALCULATE] Pozycje bez palet (${itemsWithoutPallets.length}):`, itemsWithoutPallets);
     }
     
     if (itemsFromOtherOrders.length > 0) {
       console.log(`🔀 [RECALCULATE] Pominięto ${itemsFromOtherOrders.length} pozycji z innych zamówień:`, itemsFromOtherOrders);
     }
     
     const totalItemsForThisOrder = itemsWithPallets.length + itemsWithoutPallets.length;
     console.log(`📊 [RECALCULATE] Zamówienie ${order.orderNumber}: ${totalPallets} palet z ${cmrDocuments.length} dokumentów CMR (${totalItemsForThisOrder} pozycji dla tego zamówienia, ${itemsWithPallets.length} z paletami, ${itemsFromOtherOrders.length} z innych zamówień)`);
    
    if (totalPallets === 0) {
      console.log(`⏭️ Brak palet w CMR dla zamówienia ${order.orderNumber}`);
      return { 
        success: true, 
        message: `Brak palet w ${cmrDocuments.length} dokumentach CMR (${totalItemsForThisOrder} pozycji dla tego zamówienia)`,
        orderNumber: order.orderNumber,
        palletsCount: 0,
        cmrCount: cmrDocuments.length,
        itemsCount: totalItemsForThisOrder,
        itemsFromOtherOrders: itemsFromOtherOrders.length,
        action: 'none'
      };
    }
    
    // Szukaj usługi transportowej (najpierw w liście cenowej, potem w magazynie)
    let transportService = null;
    let servicePrice = 0;
    let fromPriceList = false;
    
    if (order.customer && order.customer.id) {
      try {
        console.log(`🔍 Szukam usługi transportowej w liście cenowej klienta ${order.customer.name}...`);
        
        const { getPriceListItems, getPriceListsByCustomerId } = await import('./priceListService');
        const { getInventoryItemById } = await import('./inventory');
        
        const priceLists = await getPriceListsByCustomerId(order.customer.id);
        
        for (const priceList of priceLists) {
          if (!priceList.isActive) continue;
          
          const priceListItems = await getPriceListItems(priceList.id);
          const transportItem = priceListItems.find(item => 
            item.productName && 
            item.productName.toUpperCase().includes('TRANSPORT') &&
            !item.isRecipe
          );
          
               if (transportItem && transportItem.productId) {
                 transportService = await getInventoryItemById(transportItem.productId);
                 servicePrice = transportItem.price || 0;
                 fromPriceList = true;
                 
                 // Zapisz notatki z listy cenowej
                 transportService.priceListNotes = transportItem.notes || '';
                 
                 console.log(`✅ Znaleziono usługę w liście cenowej: ${transportService.name}, cena: ${servicePrice}`);
                 break;
          }
        }
      } catch (error) {
        console.warn('Błąd podczas szukania usługi w liście cenowej:', error);
      }
    }
    
    // FALLBACK: Szukaj w magazynie
    if (!transportService) {
      console.log(`🔍 Nie znaleziono usługi w liście cenowej - szukam w magazynie...`);
      
      const { getInventoryItemsByCategory } = await import('./inventory');
      const servicesData = await getInventoryItemsByCategory('Inne');
      const services = servicesData?.items || servicesData || [];
      
      transportService = services.find(s => 
        s.name && s.name.toUpperCase().includes('TRANSPORT')
      );
      
      if (!transportService) {
        throw new Error('Nie znaleziono usługi transportowej w systemie');
      }
      
      servicePrice = transportService.standardPrice || 0;
      fromPriceList = false;
      console.log(`✅ Znaleziono usługę w magazynie: ${transportService.name}, cena: ${servicePrice}`);
    }
    
    // Zaktualizuj zamówienie
    const updatedItems = [...(order.items || [])];
    const existingServiceIndex = updatedItems.findIndex(item => 
      item.serviceId === transportService.id && item.itemType === 'service'
    );
    
    let action = 'updated';
    
     if (existingServiceIndex !== -1) {
       // ZASTĄP (nie dodawaj!) ilość
       // Przygotuj notatki (dodaj notatki z listy cenowej jeśli są)
       let serviceNotes = `Przeliczone z ${cmrDocuments.length} CMR (aktywne, pominięto szkice/wystawione) - ${totalPallets} palet`;
       if (transportService.priceListNotes) {
         serviceNotes = `${transportService.priceListNotes}\n${serviceNotes}`;
       }
       
       updatedItems[existingServiceIndex] = {
         ...updatedItems[existingServiceIndex],
         quantity: totalPallets,
         totalPrice: totalPallets * servicePrice,
         notes: serviceNotes
       };
       console.log(`🔄 Zaktualizowano usługę transportową: ${totalPallets} palet`);
     } else {
       // Dodaj nową usługę
       action = 'added';
       
       // Przygotuj notatki (dodaj notatki z listy cenowej jeśli są)
       let serviceNotes = `Przeliczone z ${cmrDocuments.length} CMR (aktywne, pominięto szkice/wystawione) - ${totalPallets} palet`;
       if (transportService.priceListNotes) {
         serviceNotes = `${transportService.priceListNotes}\n${serviceNotes}`;
       }
       
       updatedItems.push({
         id: `service-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
         name: transportService.name,
         serviceId: transportService.id,
         itemType: 'service',
         quantity: totalPallets,
         unit: transportService.unit || 'szt.',
         price: servicePrice,
         totalPrice: totalPallets * servicePrice,
         fromPriceList: fromPriceList,
         notes: serviceNotes,
         addedFromCmr: true
       });
       console.log(`✨ Dodano usługę transportową: ${totalPallets} palet`);
    }
    
    // Przelicz wartość zamówienia
    const newTotalValue = updatedItems.reduce((sum, item) => 
      sum + (parseFloat(item.totalPrice) || 0), 0
    );
    
    // Zaktualizuj zamówienie
    await updateOrder(orderId, {
      items: updatedItems,
      totalValue: newTotalValue
    }, userId);
    
    console.log(`✅ Pomyślnie zaktualizowano zamówienie ${order.orderNumber}`);
    
     return {
       success: true,
       message: `Usługa transportowa ${action === 'added' ? 'dodana' : 'zaktualizowana'}: ${totalPallets} palet z ${cmrDocuments.length} dokumentów CMR`,
       orderNumber: order.orderNumber,
       palletsCount: totalPallets,
       servicePrice,
       totalServiceValue: totalPallets * servicePrice,
       cmrCount: cmrDocuments.length,
       itemsCount: totalItemsForThisOrder,
       itemsFromOtherOrders: itemsFromOtherOrders.length,
       action
     };
    
  } catch (error) {
    console.error('Błąd podczas przeliczania usługi transportowej:', error);
    throw error;
  }
};

/**
 * Aktualizacja statusu płatności dokumentu CMR
 * @param {string} cmrId - ID dokumentu CMR
 * @param {string} newPaymentStatus - Nowy status płatności ('paid' lub 'unpaid')
 * @param {string} userId - ID użytkownika dokonującego zmiany
 * @returns {Promise<object>} - Wynik operacji
 */
export const updateCmrPaymentStatus = async (cmrId, newPaymentStatus, userId) => {
  try {
    if (!cmrId) {
      throw new Error('ID dokumentu CMR jest wymagane');
    }

    if (!newPaymentStatus) {
      throw new Error('Nowy status płatności jest wymagany');
    }

    if (!Object.values(CMR_PAYMENT_STATUSES).includes(newPaymentStatus)) {
      throw new Error(`Nieprawidłowy status płatności: ${newPaymentStatus}`);
    }

    // Pobierz aktualne dane dokumentu CMR
    const cmrRef = doc(db, CMR_COLLECTION, cmrId);
    const cmrDoc = await getDoc(cmrRef);
    
    if (!cmrDoc.exists()) {
      throw new Error(`Nie znaleziono dokumentu CMR o ID ${cmrId}`);
    }

    const cmrData = cmrDoc.data();
    const oldPaymentStatus = cmrData.paymentStatus || CMR_PAYMENT_STATUSES.UNPAID;
    
    // Jeśli status się nie zmienił, nie rób nic
    if (oldPaymentStatus === newPaymentStatus) {
      return { success: true, paymentStatus: newPaymentStatus, message: 'Status płatności nie zmienił się' };
    }

    const updateFields = {
      paymentStatus: newPaymentStatus,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    };

    // Dodaj wpis do historii zmian statusu płatności
    const paymentStatusHistory = cmrData.paymentStatusHistory || [];
    const now = new Date();
    paymentStatusHistory.push({
      from: oldPaymentStatus,
      to: newPaymentStatus,
      changedBy: userId,
      changedAt: now,
      timestamp: now.toISOString()
    });

    updateFields.paymentStatusHistory = paymentStatusHistory;

    // Aktualizuj dokument
    await updateDoc(cmrRef, updateFields);

    // Aktualizuj cache CMR z nowymi danymi
    const updatedCacheData = {
      paymentStatus: newPaymentStatus,
      paymentStatusHistory,
      updatedAt: new Date(), // Użyj lokalnej daty dla cache
      updatedBy: userId
    };
    
    updateCmrDocumentInCache(cmrId, updatedCacheData);

    console.log(`Zaktualizowano status płatności dokumentu CMR ${cmrId} z "${oldPaymentStatus}" na "${newPaymentStatus}"`);

    return { 
      success: true, 
      paymentStatus: newPaymentStatus,
      oldPaymentStatus,
      message: 'Status płatności został zaktualizowany'
    };
  } catch (error) {
    console.error('Błąd podczas aktualizacji statusu płatności dokumentu CMR:', error);
    throw error;
  }
};

/**
 * Migruje istniejące dokumenty CMR ze starego formatu (linkedOrderId) do nowego (linkedOrderIds)
 */
export const migrateCmrToNewFormat = async (cmrId) => {
  try {
    console.log(`Rozpoczęcie migracji CMR ${cmrId} do nowego formatu...`);
    
    const cmrRef = doc(db, CMR_COLLECTION, cmrId);
    const cmrDoc = await getDoc(cmrRef);
    
    if (!cmrDoc.exists()) {
      throw new Error('Dokument CMR nie istnieje');
    }
    
    const cmrData = cmrDoc.data();
    
    // Sprawdź, czy CMR już ma nowy format
    if (cmrData.linkedOrderIds && Array.isArray(cmrData.linkedOrderIds)) {
      console.log(`CMR ${cmrId} już ma nowy format`);
      return { success: true, message: 'CMR już ma nowy format', alreadyMigrated: true };
    }
    
    // Sprawdź, czy ma stary format
    if (!cmrData.linkedOrderId) {
      console.log(`CMR ${cmrId} nie ma powiązanych zamówień`);
      return { success: true, message: 'CMR nie ma powiązanych zamówień', noLinkedOrders: true };
    }
    
    // Migruj ze starego formatu do nowego
    const updateData = {
      linkedOrderIds: [cmrData.linkedOrderId],
      linkedOrderNumbers: cmrData.linkedOrderNumber ? [cmrData.linkedOrderNumber] : [],
      updatedAt: serverTimestamp(),
      migratedAt: serverTimestamp()
    };
    
    await updateDoc(cmrRef, updateData);
    
    console.log(`Zmigrowano CMR ${cmrId} do nowego formatu`);
    return { 
      success: true, 
      message: 'CMR został zmigrowany do nowego formatu',
      oldFormat: { linkedOrderId: cmrData.linkedOrderId },
      newFormat: { linkedOrderIds: updateData.linkedOrderIds }
    };
  } catch (error) {
    console.error(`Błąd podczas migracji CMR ${cmrId}:`, error);
    throw error;
  }
};

/**
 * Migruje wszystkie dokumenty CMR do nowego formatu
 */
export const migrateAllCmrToNewFormat = async () => {
  try {
    console.log('Rozpoczęcie masowej migracji wszystkich CMR do nowego formatu...');
    
    const cmrQuery = query(
      collection(db, CMR_COLLECTION),
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(cmrQuery);
    let migratedCount = 0;
    let alreadyMigratedCount = 0;
    let noLinkedOrdersCount = 0;
    const errors = [];
    
    for (const cmrDoc of querySnapshot.docs) {
      try {
        const result = await migrateCmrToNewFormat(cmrDoc.id);
        
        if (result.alreadyMigrated) {
          alreadyMigratedCount++;
        } else if (result.noLinkedOrders) {
          noLinkedOrdersCount++;
        } else {
          migratedCount++;
        }
      } catch (error) {
        console.error(`Błąd podczas migracji CMR ${cmrDoc.id}:`, error);
        errors.push({ cmrId: cmrDoc.id, error: error.message });
      }
    }
    
    console.log(`Migracja zakończona. Zmigrowano: ${migratedCount}, już zmigrowane: ${alreadyMigratedCount}, bez zamówień: ${noLinkedOrdersCount}, błędy: ${errors.length}`);
    
    return { 
      success: true, 
      migratedCount, 
      alreadyMigratedCount, 
      noLinkedOrdersCount, 
      errorsCount: errors.length,
      errors 
    };
  } catch (error) {
    console.error('Błąd podczas masowej migracji CMR:', error);
    throw error;
  }
};

/**
 * Znajduje CMR dokumenty powiązane z zamówieniem przez różne metody
 * Używa jako fallback wyszukiwanie przez numer zamówienia w polach tekstowych
 */
export const findCmrDocumentsByOrderNumber = async (orderNumber) => {
  try {
    console.log(`Szukanie CMR przez numer zamówienia: ${orderNumber}`);
    
    // Zapytanie wyszukujące CMR gdzie numer zamówienia może być w różnych polach tekstowych
    const cmrRef = collection(db, CMR_COLLECTION);
    const allCmrQuery = query(cmrRef, orderBy('issueDate', 'desc'));
    
    const snapshot = await getDocs(allCmrQuery);
    const matchingCMRs = [];
    
    snapshot.forEach((doc) => {
      const data = doc.data();
      
      // Sprawdź różne pola gdzie może być zapisany numer zamówienia
      const fieldsToCheck = [
        data.attachedDocuments,
        data.instructionsFromSender,
        data.notes,
        data.reservations,
        data.cmrNumber
      ];
      
      const hasOrderReference = fieldsToCheck.some(field => 
        field && typeof field === 'string' && 
        field.toLowerCase().includes(orderNumber.toLowerCase())
      );
      
      if (hasOrderReference) {
        const processedDocument = {
          id: doc.id,
          ...data,
          issueDate: safeParseDate(data.issueDate),
          deliveryDate: safeParseDate(data.deliveryDate),
          loadingDate: safeParseDate(data.loadingDate),
          createdAt: safeParseDate(data.createdAt),
          updatedAt: safeParseDate(data.updatedAt)
        };
        
        matchingCMRs.push(processedDocument);
      }
    });
    
    console.log(`Znaleziono ${matchingCMRs.length} CMR przez numer zamówienia ${orderNumber}`);
    return matchingCMRs;
  } catch (error) {
    console.error('Błąd podczas wyszukiwania CMR przez numer zamówienia:', error);
    return [];
  }
};

// Funkcja do usuwania rezerwacji partii magazynowych dla dokumentu CMR (identyczna logika jak deleteTask)
// 
// UŻYCIE:
// 1. Automatyczne wywoływanie przy zmianie statusu CMR na "Anulowany" lub "Zakończony"
// 2. Można wywołać ręcznie: await cancelCmrReservations(cmrId, userId)
//
// MECHANIZM (identyczny jak deleteTask z productionService.js):
// 1. Fizycznie usuwa wszystkie rezerwacje związane z CMR (cleanupTaskReservations)
// 2. Anuluje ilości wysłane w powiązanych zamówieniach
//
export const cancelCmrReservations = async (cmrId, userId) => {
  try {
    console.log(`Rozpoczynanie anulowania rezerwacji dla CMR ${cmrId}...`);
    
    // Pobierz dane dokumentu CMR z elementami
    const cmrData = await getCmrDocumentById(cmrId);
    
    if (!cmrData || !cmrData.items || cmrData.items.length === 0) {
      console.log('Brak elementów w dokumencie CMR do anulowania rezerwacji');
      return { success: true, message: 'Brak elementów do anulowania rezerwacji' };
    }

    const { cleanupTaskReservations } = await import('./inventory');
    const cancellationResults = [];
    const errors = [];
    
    // Identyfikator zadania CMR używany do rezerwacji
    const cmrTaskId = `CMR-${cmrData.cmrNumber}-${cmrId}`;
    
    console.log(`Usuwanie wszystkich rezerwacji dla CMR taskId: ${cmrTaskId} (jak w deleteTask)`);
    
    // Usuń wszystkie rezerwacje związane z tym CMR (identycznie jak deleteTask)
    try {
      const cleanupResult = await cleanupTaskReservations(cmrTaskId);
      console.log(`Usunięto wszystkie rezerwacje związane z CMR ${cmrTaskId}:`, cleanupResult);
      
      // Dodaj informacje o usuniętych rezerwacjach do wyników
      if (cleanupResult && cleanupResult.cleanedReservations > 0) {
        // Grupuj po pozycjach CMR dla raportowania
        for (const item of cmrData.items) {
          cancellationResults.push({
            item: item.description,
            quantity: parseFloat(item.quantity) || 0,
            unit: item.unit,
            success: true,
            operation: 'deleted' // Fizycznie usunięte (jak w deleteTask)
          });
        }
      }
    } catch (error) {
      console.error(`Błąd podczas usuwania rezerwacji dla CMR ${cmrTaskId}:`, error);
      errors.push({
        operation: 'cleanup',
        error: error.message
      });
    }
    
    // KROK 3: Anuluj ilości wysłane w powiązanych zamówieniach (jeśli istnieją)
    try {
      if (cmrData.items && cmrData.items.length > 0) {
        const ordersToUpdate = [];
        
        // Sprawdź nowy format (wiele zamówień)
        if (cmrData.linkedOrderIds && Array.isArray(cmrData.linkedOrderIds) && cmrData.linkedOrderIds.length > 0) {
          ordersToUpdate.push(...cmrData.linkedOrderIds);
        }
        
        // Sprawdź stary format (pojedyncze zamówienie) - dla kompatybilności wstecznej
        if (cmrData.linkedOrderId && !ordersToUpdate.includes(cmrData.linkedOrderId)) {
          ordersToUpdate.push(cmrData.linkedOrderId);
        }
        
        if (ordersToUpdate.length > 0) {
          console.log('Anulowanie ilości wysłanych w zamówieniach przy anulowaniu CMR...');
          for (const orderId of ordersToUpdate) {
            await cancelLinkedOrderShippedQuantities(orderId, cmrData.items, cmrData.cmrNumber, userId);
            console.log(`Anulowano ilości wysłane w zamówieniu ${orderId} na podstawie anulowanego CMR ${cmrData.cmrNumber}`);
          }
        }
      }
    } catch (orderUpdateError) {
      console.error('Błąd podczas anulowania ilości wysłanych w zamówieniach:', orderUpdateError);
      errors.push({
        operation: 'cancel_shipped_quantities',
        error: orderUpdateError.message
      });
    }
    
    return {
      success: true,
      message: `Anulowano rezerwacje dla CMR ${cmrData.cmrNumber}`,
      cancellationResults,
      errors
    };
  } catch (error) {
    console.error('Błąd podczas anulowania rezerwacji CMR:', error);
    throw error;
  }
};

// ========================
// FUNKCJE ZAŁĄCZNIKÓW CMR
// ========================

/**
 * Przesyła załącznik do CMR
 * @param {File} file - Plik do przesłania
 * @param {string} cmrId - ID dokumentu CMR
 * @param {string} userId - ID użytkownika przesyłającego
 * @returns {Promise<Object>} - Informacje o przesłanym pliku
 */
export const uploadCmrAttachment = async (file, cmrId, userId) => {
  try {
    if (!file || !cmrId || !userId) {
      throw new Error('Brak wymaganych parametrów');
    }

    // Sprawdź rozmiar pliku (maksymalnie 20 MB)
    const fileSizeInMB = file.size / (1024 * 1024);
    if (fileSizeInMB > 20) {
      throw new Error(`Plik jest zbyt duży (${fileSizeInMB.toFixed(2)} MB). Maksymalny rozmiar to 20 MB.`);
    }

    // Sprawdź typ pliku - dozwolone są wszystkie popularne typy dokumentów i obrazów
    const allowedTypes = [
      'text/plain',
      'text/csv',
      'application/json',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/bmp',
      'image/tiff'
    ];

    if (!allowedTypes.includes(file.type)) {
      throw new Error(`Nieobsługiwany typ pliku: ${file.type}. Dozwolone są dokumenty i obrazy.`);
    }

    // Tworzymy ścieżkę do pliku w Firebase Storage
    const timestamp = new Date().getTime();
    const fileExtension = file.name.split('.').pop();
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${timestamp}_${sanitizedFileName}`;
    const storagePath = `cmr-attachments/${cmrId}/${fileName}`;

    // Przesyłamy plik do Firebase Storage
    const fileRef = ref(storage, storagePath);
    await uploadBytes(fileRef, file);

    // Pobieramy URL do pobrania pliku
    const downloadURL = await getDownloadURL(fileRef);

    // Zapisujemy informacje o załączniku w Firestore
    const attachmentData = {
      fileName: file.name,
      originalFileName: file.name,
      storagePath,
      downloadURL,
      contentType: file.type,
      size: file.size,
      cmrId,
      uploadedBy: userId,
      uploadedAt: serverTimestamp()
    };

    const attachmentRef = await addDoc(collection(db, 'cmrAttachments'), attachmentData);

    return {
      id: attachmentRef.id,
      ...attachmentData,
      uploadedAt: new Date() // Konwertujemy na Date dla wyświetlenia
    };
  } catch (error) {
    console.error('Błąd podczas przesyłania załącznika CMR:', error);
    throw error;
  }
};

/**
 * Pobiera wszystkie załączniki dla danego CMR
 * @param {string} cmrId - ID dokumentu CMR
 * @returns {Promise<Array>} - Lista załączników
 */
export const getCmrAttachments = async (cmrId) => {
  try {
    const q = query(
      collection(db, 'cmrAttachments'),
      where('cmrId', '==', cmrId),
      orderBy('uploadedAt', 'desc')
    );

    const snapshot = await getDocs(q);
    const attachments = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      attachments.push({
        id: doc.id,
        ...data,
        uploadedAt: data.uploadedAt ? data.uploadedAt.toDate() : null
      });
    });

    return attachments;
  } catch (error) {
    console.error('Błąd podczas pobierania załączników CMR:', error);
    return [];
  }
};

/**
 * Usuwa załącznik CMR
 * @param {string} attachmentId - ID załącznika w Firestore
 * @param {string} userId - ID użytkownika usuwającego
 * @returns {Promise<void>}
 */
export const deleteCmrAttachment = async (attachmentId, userId) => {
  try {
    // Pobierz informacje o załączniku
    const attachmentDoc = await getDoc(doc(db, 'cmrAttachments', attachmentId));
    
    if (!attachmentDoc.exists()) {
      throw new Error('Załącznik nie został znaleziony');
    }

    const attachmentData = attachmentDoc.data();

    // Usuń plik z Firebase Storage
    if (attachmentData.storagePath) {
      const fileRef = ref(storage, attachmentData.storagePath);
      try {
        await deleteObject(fileRef);
      } catch (storageError) {
        console.warn('Nie udało się usunąć pliku z Storage (może już nie istnieć):', storageError);
      }
    }

    // Usuń rekord z Firestore
    await deleteDoc(doc(db, 'cmrAttachments', attachmentId));

    console.log(`Załącznik ${attachmentData.fileName} został usunięty przez użytkownika ${userId}`);
  } catch (error) {
    console.error('Błąd podczas usuwania załącznika CMR:', error);
    throw error;
  }
};

// ========================
// FUNKCJE FAKTUR CMR
// ========================

/**
 * Przesyła fakturę do CMR
 * @param {File} file - Plik faktury do przesłania
 * @param {string} cmrId - ID dokumentu CMR
 * @param {string} userId - ID użytkownika przesyłającego
 * @returns {Promise<Object>} - Informacje o przesłanym pliku
 */
export const uploadCmrInvoice = async (file, cmrId, userId) => {
  try {
    if (!file || !cmrId || !userId) {
      throw new Error('Brak wymaganych parametrów');
    }

    // Sprawdź rozmiar pliku (maksymalnie 20 MB)
    const fileSizeInMB = file.size / (1024 * 1024);
    if (fileSizeInMB > 20) {
      throw new Error(`Plik jest zbyt duży (${fileSizeInMB.toFixed(2)} MB). Maksymalny rozmiar to 20 MB.`);
    }

    // Dla faktur dozwolone są głównie PDF i dokumenty
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png'
    ];

    if (!allowedTypes.includes(file.type)) {
      throw new Error(`Nieobsługiwany typ pliku dla faktury: ${file.type}. Dozwolone są: PDF, DOC, DOCX, XLS, XLSX, JPG, PNG.`);
    }

    // Tworzymy ścieżkę do pliku w Firebase Storage - ODDZIELNA ŚCIEŻKA dla faktur
    const timestamp = new Date().getTime();
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${timestamp}_${sanitizedFileName}`;
    const storagePath = `cmr-invoices/${cmrId}/${fileName}`; // Oddzielny folder dla faktur

    // Przesyłamy plik do Firebase Storage
    const fileRef = ref(storage, storagePath);
    await uploadBytes(fileRef, file);

    // Pobieramy URL do pobrania pliku
    const downloadURL = await getDownloadURL(fileRef);

    // Zapisujemy informacje o fakturze w Firestore - oddzielna kolekcja
    const invoiceData = {
      fileName: file.name,
      originalFileName: file.name,
      storagePath,
      downloadURL,
      contentType: file.type,
      size: file.size,
      cmrId,
      type: 'invoice',
      uploadedBy: userId,
      uploadedAt: serverTimestamp()
    };

    const invoiceRef = await addDoc(collection(db, 'cmrInvoices'), invoiceData);

    return {
      id: invoiceRef.id,
      ...invoiceData,
      uploadedAt: new Date()
    };
  } catch (error) {
    console.error('Błąd podczas przesyłania faktury CMR:', error);
    throw error;
  }
};

/**
 * Pobiera wszystkie faktury dla danego CMR
 * @param {string} cmrId - ID dokumentu CMR
 * @returns {Promise<Array>} - Lista faktur
 */
export const getCmrInvoices = async (cmrId) => {
  try {
    const q = query(
      collection(db, 'cmrInvoices'),
      where('cmrId', '==', cmrId),
      orderBy('uploadedAt', 'desc')
    );

    const snapshot = await getDocs(q);
    const invoices = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      invoices.push({
        id: doc.id,
        ...data,
        uploadedAt: data.uploadedAt ? data.uploadedAt.toDate() : null
      });
    });

    return invoices;
  } catch (error) {
    console.error('Błąd podczas pobierania faktur CMR:', error);
    return [];
  }
};

/**
 * Usuwa fakturę CMR
 * @param {string} invoiceId - ID faktury w Firestore
 * @param {string} userId - ID użytkownika usuwającego
 * @returns {Promise<void>}
 */
export const deleteCmrInvoice = async (invoiceId, userId) => {
  try {
    // Pobierz informacje o fakturze
    const invoiceDoc = await getDoc(doc(db, 'cmrInvoices', invoiceId));
    
    if (!invoiceDoc.exists()) {
      throw new Error('Faktura nie została znaleziona');
    }

    const invoiceData = invoiceDoc.data();

    // Usuń plik z Firebase Storage
    if (invoiceData.storagePath) {
      const fileRef = ref(storage, invoiceData.storagePath);
      try {
        await deleteObject(fileRef);
      } catch (storageError) {
        console.warn('Nie udało się usunąć pliku faktury z Storage (może już nie istnieć):', storageError);
      }
    }

    // Usuń rekord z Firestore
    await deleteDoc(doc(db, 'cmrInvoices', invoiceId));

    console.log(`Faktura ${invoiceData.fileName} została usunięta przez użytkownika ${userId}`);
  } catch (error) {
    console.error('Błąd podczas usuwania faktury CMR:', error);
    throw error;
  }
};

/**
 * Przesyła "inny" załącznik do CMR
 * @param {File} file - Obiekt pliku
 * @param {string} cmrId - ID dokumentu CMR
 * @param {string} userId - ID użytkownika przesyłającego
 * @returns {Promise<Object>} - Dane utworzonego załącznika
 */
export const uploadCmrOtherAttachment = async (file, cmrId, userId) => {
  try {
    if (!file) {
      throw new Error('Nie wybrano pliku');
    }

    // Walidacja rozmiaru pliku (max 20MB)
    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new Error('Rozmiar pliku przekracza 20MB');
    }

    // Dozwolone typy plików (takie same jak dla faktur + ewentualnie inne)
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
      'text/plain',
      'application/zip',
      'application/x-zip-compressed'
    ];

    // Sprawdzenie typu (opcjonalne, można pominąć jeśli chcemy wszystkie)
    // if (!allowedTypes.includes(file.type)) { ... }

    // Tworzymy ścieżkę do pliku w Firebase Storage - ODDZIELNA ŚCIEŻKA dla innych załączników
    const timestamp = new Date().getTime();
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${timestamp}_${sanitizedFileName}`;
    const storagePath = `cmr-other/${cmrId}/${fileName}`;

    // Przesyłamy plik do Firebase Storage
    const fileRef = ref(storage, storagePath);
    await uploadBytes(fileRef, file);

    // Pobieramy URL do pobrania pliku
    const downloadURL = await getDownloadURL(fileRef);

    // Zapisujemy informacje o załączniku w Firestore - oddzielna kolekcja
    const attachmentData = {
      fileName: file.name,
      originalFileName: file.name,
      storagePath,
      downloadURL,
      contentType: file.type,
      size: file.size,
      cmrId,
      type: 'other',
      uploadedBy: userId,
      uploadedAt: serverTimestamp()
    };

    const attachmentRef = await addDoc(collection(db, 'cmrOtherAttachments'), attachmentData);

    return {
      id: attachmentRef.id,
      ...attachmentData,
      uploadedAt: new Date()
    };
  } catch (error) {
    console.error('Błąd podczas przesyłania innego załącznika CMR:', error);
    throw error;
  }
};

/**
 * Pobiera wszystkie "inne" załączniki dla danego CMR
 * @param {string} cmrId - ID dokumentu CMR
 * @returns {Promise<Array>} - Lista załączników
 */
export const getCmrOtherAttachments = async (cmrId) => {
  try {
    const q = query(
      collection(db, 'cmrOtherAttachments'),
      where('cmrId', '==', cmrId),
      orderBy('uploadedAt', 'desc')
    );

    const snapshot = await getDocs(q);
    const attachments = [];

    snapshot.forEach((doc) => {
      const data = doc.data();
      attachments.push({
        id: doc.id,
        ...data,
        uploadedAt: data.uploadedAt ? data.uploadedAt.toDate() : null
      });
    });

    return attachments;
  } catch (error) {
    console.error('Błąd podczas pobierania innych załączników CMR:', error);
    return [];
  }
};

/**
 * Usuwa "inny" załącznik CMR
 * @param {string} attachmentId - ID załącznika w Firestore
 * @param {string} userId - ID użytkownika usuwającego
 * @returns {Promise<void>}
 */
export const deleteCmrOtherAttachment = async (attachmentId, userId) => {
  try {
    // Pobierz informacje o załączniku
    const attachmentDoc = await getDoc(doc(db, 'cmrOtherAttachments', attachmentId));
    
    if (!attachmentDoc.exists()) {
      throw new Error('Załącznik nie został znalezion');
    }

    const attachmentData = attachmentDoc.data();

    // Usuń plik z Firebase Storage
    if (attachmentData.storagePath) {
      const fileRef = ref(storage, attachmentData.storagePath);
      try {
        await deleteObject(fileRef);
      } catch (storageError) {
        console.warn('Nie udało się usunąć pliku załącznika z Storage (może już nie istnieć):', storageError);
      }
    }

    // Usuń rekord z Firestore
    await deleteDoc(doc(db, 'cmrOtherAttachments', attachmentId));

    console.log(`Załącznik ${attachmentData.fileName} został usunięty przez użytkownika ${userId}`);
  } catch (error) {
    console.error('Błąd podczas usuwania innego załącznika CMR:', error);
    throw error;
  }
};

// Cache dla zoptymalizowanej funkcji pobierania dokumentów CMR
let cmrDocumentsCache = null;
let cmrDocumentsCacheTimestamp = null;
const CMR_CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minuty

/**
 * ZOPTYMALIZOWANA FUNKCJA dla interfejsu listy dokumentów CMR
 * 
 * Ta funkcja została stworzona dla lepszej wydajności w interfejsie listy:
 * - Cachuje wszystkie dokumenty CMR po pierwszym pobraniu
 * - Dynamicznie filtruje i sortuje dane w cache
 * - Implementuje debouncing dla wyszukiwania
 * - Obsługuje filtrowanie po pozycjach CMR
 * 
 * @param {Object} params - Parametry zapytania
 * @param {number} params.page - Numer strony (wymagany)
 * @param {number} params.pageSize - Rozmiar strony (wymagany)
 * @param {string|null} params.searchTerm - Termin wyszukiwania (opcjonalne)
 * @param {string|null} params.statusFilter - Filtr statusu (opcjonalne)
 * @param {string|null} params.itemFilter - Filtr po pozycjach/towarach CMR (opcjonalne)
 * @param {string|null} params.sortField - Pole do sortowania (opcjonalne)
 * @param {string|null} params.sortOrder - Kierunek sortowania (opcjonalne)
 * @param {boolean} params.forceRefresh - Wymuś odświeżenie cache (opcjonalne)
 * @returns {Promise<Object>} - Obiekt z paginacją i danymi
 */
export const getCmrDocumentsOptimized = async ({
  page,
  pageSize,
  searchTerm = null,
  statusFilter = null,
  itemFilter = null,
  sortField = 'issueDate',
  sortOrder = 'desc',
  forceRefresh = false
}) => {
  try {
    console.log('🚀 getCmrDocumentsOptimized - rozpoczynam zoptymalizowane pobieranie');
    console.log('📄 Parametry:', { page, pageSize, searchTerm, statusFilter, itemFilter, sortField, sortOrder, forceRefresh });

    // Walidacja wymaganych parametrów
    if (!page || !pageSize) {
      throw new Error('Parametry page i pageSize są wymagane');
    }

    const pageNum = Math.max(1, parseInt(page));
    const itemsPerPage = Math.max(1, parseInt(pageSize));

    // KROK 1: Sprawdź cache dokumentów CMR
    const now = Date.now();
    const isCacheValid = cmrDocumentsCache && 
                        cmrDocumentsCacheTimestamp && 
                        (now - cmrDocumentsCacheTimestamp) < CMR_CACHE_EXPIRY_MS &&
                        !forceRefresh;

    let allDocuments;

    if (isCacheValid) {
      console.log('💾 Używam cache dokumentów CMR');
      allDocuments = [...cmrDocumentsCache];
    } else {
      console.log('🔄 Pobieram świeże dane dokumentów CMR');
      
      // Pobierz wszystkie dokumenty CMR
      allDocuments = await getAllCmrDocuments();

      // Zaktualizuj cache
      cmrDocumentsCache = [...allDocuments];
      cmrDocumentsCacheTimestamp = now;
      
      console.log('💾 Zapisano do cache:', allDocuments.length, 'dokumentów CMR');
    }

    // KROK 1.5: Jeśli jest filtr po pozycjach, pobierz pozycje dla każdego CMR i filtruj
    if (itemFilter && itemFilter.trim() !== '') {
      console.log('🔍 Filtrowanie po pozycjach CMR:', itemFilter);
      const itemFilterLower = itemFilter.toLowerCase().trim();
      
      // Pobierz pozycje dla wszystkich CMR które mogą pasować
      const cmrDocumentsWithItems = await Promise.all(
        allDocuments.map(async (cmrDoc) => {
          try {
            const itemsRef = collection(db, CMR_ITEMS_COLLECTION);
            const itemsQuery = query(itemsRef, where('cmrId', '==', cmrDoc.id));
            const itemsSnapshot = await getDocs(itemsQuery);
            
            const items = itemsSnapshot.docs.map(itemDoc => ({
              id: itemDoc.id,
              ...itemDoc.data()
            }));
            
            return {
              ...cmrDoc,
              items: items
            };
          } catch (error) {
            console.error(`Błąd podczas pobierania pozycji dla CMR ${cmrDoc.id}:`, error);
            return {
              ...cmrDoc,
              items: []
            };
          }
        })
      );
      
      // Filtruj CMR które mają pozycje pasujące do wyszukiwanego terminu
      allDocuments = cmrDocumentsWithItems.filter(cmrDoc => {
        if (!cmrDoc.items || cmrDoc.items.length === 0) return false;
        
        return cmrDoc.items.some(item => {
          const description = item.description || '';
          const unit = item.unit || '';
          const quantity = item.quantity || item.numberOfPackages || '';
          
          // Sprawdź podstawowe pola pozycji
          const basicFieldsMatch = (
            description.toLowerCase().includes(itemFilterLower) ||
            unit.toLowerCase().includes(itemFilterLower) ||
            quantity.toString().toLowerCase().includes(itemFilterLower)
          );
          
          // Sprawdź pola z powiązanych partii magazynowych
          const batchFieldsMatch = item.linkedBatches && item.linkedBatches.length > 0 && 
            item.linkedBatches.some(batch => {
              const batchNumber = batch.batchNumber || batch.lotNumber || '';
              const itemName = batch.itemName || '';
              const barcode = batch.barcode || '';
              const warehouseName = batch.warehouseName || '';
              
              return (
                batchNumber.toLowerCase().includes(itemFilterLower) ||
                itemName.toLowerCase().includes(itemFilterLower) ||
                barcode.toLowerCase().includes(itemFilterLower) ||
                warehouseName.toLowerCase().includes(itemFilterLower)
              );
            });
          
          return basicFieldsMatch || batchFieldsMatch;
        });
      });
      
      console.log('🔍 Po filtrowaniu po pozycjach:', allDocuments.length, 'dokumentów');
    }

    // KROK 2: Filtrowanie po terminie wyszukiwania
    if (searchTerm && searchTerm.trim() !== '') {
      const searchTermLower = searchTerm.toLowerCase().trim();
      
      // Priorytetowe dopasowania - najpierw numer CMR, potem inne pola
      const cmrNumberMatches = [];
      const otherMatches = [];
      
      allDocuments.forEach(doc => {
        const cmrNumberMatch = doc.cmrNumber && doc.cmrNumber.toLowerCase().includes(searchTermLower);
        const otherFieldsMatch = (
          (doc.recipient && doc.recipient.toLowerCase().includes(searchTermLower)) ||
          (doc.sender && doc.sender.toLowerCase().includes(searchTermLower)) ||
          (doc.loadingPlace && doc.loadingPlace.toLowerCase().includes(searchTermLower)) ||
          (doc.deliveryPlace && doc.deliveryPlace.toLowerCase().includes(searchTermLower)) ||
          (doc.carrierName && doc.carrierName.toLowerCase().includes(searchTermLower)) ||
          (doc.vehicleRegistration && doc.vehicleRegistration.toLowerCase().includes(searchTermLower))
        );
        
        if (cmrNumberMatch) {
          cmrNumberMatches.push(doc);
        } else if (otherFieldsMatch) {
          otherMatches.push(doc);
        }
      });
      
      allDocuments = [...cmrNumberMatches, ...otherMatches];
      console.log('🔍 Po wyszukiwaniu:', allDocuments.length, 'dokumentów');
    }

    // KROK 3: Filtrowanie po statusie
    if (statusFilter && statusFilter.trim() !== '') {
      allDocuments = allDocuments.filter(doc => doc.status === statusFilter);
      console.log('📊 Po filtrowaniu statusu:', allDocuments.length, 'dokumentów');
    }

    // KROK 4: Sortowanie
    const sortByField = (documents, field, order) => {
      return documents.sort((a, b) => {
        let aVal = a[field];
        let bVal = b[field];
        
        // Specjalne obsłużenie dla dat
        if (field === 'issueDate' || field === 'deliveryDate' || field === 'loadingDate' || field === 'createdAt') {
          aVal = aVal ? (aVal.toDate ? aVal.toDate() : new Date(aVal)) : new Date(0);
          bVal = bVal ? (bVal.toDate ? bVal.toDate() : new Date(bVal)) : new Date(0);
        }
        
        // Specjalne obsłużenie dla numerów CMR
        if (field === 'cmrNumber') {
          const getNumericPart = (cmrNumber) => {
            if (!cmrNumber) return 0;
            const match = cmrNumber.match(/CMR(\d+)/);
            return match ? parseInt(match[1], 10) : 0;
          };
          
          aVal = getNumericPart(aVal);
          bVal = getNumericPart(bVal);
        }
        
        // Obsługa null/undefined
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return order === 'asc' ? 1 : -1;
        if (bVal == null) return order === 'asc' ? -1 : 1;
        
        // Porównanie
        if (aVal < bVal) return order === 'asc' ? -1 : 1;
        if (aVal > bVal) return order === 'asc' ? 1 : -1;
        return 0;
      });
    };

    const sortedDocuments = sortByField([...allDocuments], sortField, sortOrder);
    console.log('🔄 Posortowano według:', sortField, sortOrder);

    // KROK 5: Paginacja
    const totalItems = sortedDocuments.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const safePage = Math.min(pageNum, Math.max(1, totalPages));
    
    const startIndex = (safePage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, sortedDocuments.length);
    const paginatedDocuments = sortedDocuments.slice(startIndex, endIndex);

    console.log('📄 Paginacja:', `Strona ${safePage}/${totalPages}, elementy ${startIndex + 1}-${endIndex} z ${totalItems}`);

    return {
      items: paginatedDocuments,
      totalCount: totalItems,
      page: safePage,
      pageSize: itemsPerPage,
      totalPages: totalPages
    };
    
  } catch (error) {
    console.error('❌ Błąd w getCmrDocumentsOptimized:', error);
    throw error;
  }
};

/**
 * Czyści cache dokumentów CMR
 */
export const clearCmrDocumentsCache = () => {
  cmrDocumentsCache = null;
  cmrDocumentsCacheTimestamp = null;
  console.log('🗑️ Cache dokumentów CMR wyczyszczony');
};

/**
 * Aktualizuje pojedynczy dokument CMR w cache (zamiast czyszczenia całego cache)
 * @param {string} documentId - ID dokumentu do aktualizacji
 * @param {Object} updatedDocumentData - Nowe dane dokumentu
 * @returns {boolean} - Czy aktualizacja się powiodła
 */
export const updateCmrDocumentInCache = (documentId, updatedDocumentData) => {
  if (!cmrDocumentsCache || !Array.isArray(cmrDocumentsCache)) {
    console.log('🚫 Cache dokumentów CMR jest pusty, pomijam aktualizację');
    return false;
  }

  const documentIndex = cmrDocumentsCache.findIndex(doc => doc.id === documentId);
  
  if (documentIndex !== -1) {
    cmrDocumentsCache[documentIndex] = {
      ...cmrDocumentsCache[documentIndex],
      ...updatedDocumentData,
      id: documentId // Upewnij się, że ID się nie zmieni
    };
    console.log('✅ Zaktualizowano dokument CMR w cache:', documentId);
    return true;
  } else {
    console.log('❌ Nie znaleziono dokumentu CMR w cache:', documentId);
    return false;
  }
};

/**
 * Dodaje nowy dokument CMR do cache
 * @param {Object} newDocumentData - Dane nowego dokumentu
 * @returns {boolean} - Czy dodanie się powiodło
 */
export const addCmrDocumentToCache = (newDocumentData) => {
  if (!cmrDocumentsCache || !Array.isArray(cmrDocumentsCache)) {
    console.log('🚫 Cache dokumentów CMR jest pusty, pomijam dodanie');
    return false;
  }

  cmrDocumentsCache.unshift(newDocumentData); // Dodaj na początek (najnowszy)
  console.log('✅ Dodano nowy dokument CMR do cache:', newDocumentData.id);
  return true;
};

/**
 * Usuwa dokument CMR z cache
 * @param {string} documentId - ID dokumentu do usunięcia
 * @returns {boolean} - Czy usunięcie się powiodło
 */
export const removeCmrDocumentFromCache = (documentId) => {
  if (!cmrDocumentsCache || !Array.isArray(cmrDocumentsCache)) {
    console.log('🚫 Cache dokumentów CMR jest pusty, pomijam usunięcie');
    return false;
  }

  const documentIndex = cmrDocumentsCache.findIndex(doc => doc.id === documentId);
  
  if (documentIndex !== -1) {
    cmrDocumentsCache.splice(documentIndex, 1);
    console.log('✅ Usunięto dokument CMR z cache:', documentId);
    return true;
  } else {
    console.log('❌ Nie znaleziono dokumentu CMR w cache:', documentId);
    return false;
  }
};


// Eksport bezpiecznej funkcji aktualizacji ilości wysłanych
export { updateLinkedOrderShippedQuantities };
