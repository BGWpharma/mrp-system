import { db } from './firebase/config';
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
import { format } from 'date-fns';
import { updateOrderItemShippedQuantity } from './orderService';
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
      console.log('getCmrDocumentById convertTimestamp - wejście:', field, 'typ:', typeof field);
      
      if (!field) {
        console.log('getCmrDocumentById convertTimestamp - brak wartości, zwracam null');
        return null;
      }
      
      // Sprawdź czy pole jest obiektem Timestamp z metodą toDate
      if (field && typeof field.toDate === 'function') {
        const converted = field.toDate();
        console.log('getCmrDocumentById convertTimestamp - skonwertowano Firestore Timestamp:', converted);
        return converted;
      }
      
      // Sprawdź czy pole jest obiektem z polami seconds i nanoseconds (deserializowany Firestore Timestamp)
      if (field && typeof field === 'object' && typeof field.seconds === 'number') {
        const converted = new Date(field.seconds * 1000 + (field.nanoseconds || 0) / 1000000);
        console.log('getCmrDocumentById convertTimestamp - skonwertowano obiekt z seconds/nanoseconds:', converted);
        return converted;
      }
      
      // Jeśli jest stringiem lub numerem, spróbuj konwertować na Date
      if (typeof field === 'string' || typeof field === 'number') {
        try {
          const converted = new Date(field);
          console.log('getCmrDocumentById convertTimestamp - skonwertowano string/number:', converted);
          return converted;
        } catch (e) {
          console.warn('Nie można skonwertować pola na Date:', field);
          return null;
        }
      }
      console.log('getCmrDocumentById convertTimestamp - nieznany typ, zwracam null');
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
    
    console.log('getCmrDocumentById - zwracam dane z datami:', {
      issueDate: result.issueDate,
      deliveryDate: result.deliveryDate,
      loadingDate: result.loadingDate
    });
    
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
    // Usuń elementy dokumentu CMR
    const itemsRef = collection(db, CMR_ITEMS_COLLECTION);
    const q = query(itemsRef, where('cmrId', '==', cmrId));
    const itemsSnapshot = await getDocs(q);
    
    const deletePromises = itemsSnapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
    
    // Usuń dokument CMR
    const cmrRef = doc(db, CMR_COLLECTION, cmrId);
    await deleteDoc(cmrRef);
    
    return { success: true };
  } catch (error) {
    console.error('Błąd podczas usuwania dokumentu CMR:', error);
    throw error;
  }
};

// Funkcja do walidacji czy wszystkie pozycje CMR mają przypisane partie magazynowe
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
      if (!item.linkedBatches || item.linkedBatches.length === 0) {
        errors.push({
          index: index + 1,
          description: item.description || `Pozycja ${index + 1}`,
          error: 'Brak powiązanych partii magazynowych'
        });
      }
    });
    
    if (errors.length > 0) {
      const errorMessages = errors.map(err => `• ${err.description}: ${err.error}`).join('\n');
      return {
        isValid: false,
        message: `Następujące pozycje nie mają przypisanych partii magazynowych:\n${errorMessages}`,
        errors
      };
    }
    
    return { isValid: true, message: 'Wszystkie pozycje mają przypisane partie' };
  } catch (error) {
    console.error('Błąd podczas walidacji partii CMR:', error);
    return {
      isValid: false,
      message: `Błąd podczas walidacji: ${error.message}`
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
            console.log('Aktualizacja ilości wysłanych w zamówieniach przy zmianie statusu na "W transporcie"...');
            for (const orderId of ordersToUpdate) {
              await updateLinkedOrderShippedQuantities(orderId, cmrData.items, cmrData.cmrNumber, userId);
              console.log(`Zaktualizowano ilości wysłane w zamówieniu ${orderId} na podstawie CMR ${cmrData.cmrNumber}`);
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
      console.log('Dostarczenie CMR - anulowanie rezerwacji i wydanie produktów...');
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
    
    const { bookInventoryForTask } = await import('./inventoryService');
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

// Funkcja do przetwarzania dostarczenia CMR - anuluje rezerwacje i wydaje produkty
export const processCmrDelivery = async (cmrId, userId) => {
  try {
    console.log(`Rozpoczynanie procesu dostarczenia CMR ${cmrId}...`);
    
    // Pobierz dane dokumentu CMR z elementami
    const cmrData = await getCmrDocumentById(cmrId);
    
    if (!cmrData || !cmrData.items || cmrData.items.length === 0) {
      console.log('Brak elementów w dokumencie CMR do przetworzenia');
      return { success: true, message: 'Brak elementów do przetworzenia' };
    }
    
    const { cancelBooking, issueInventory } = await import('./inventoryService');
    const deliveryResults = [];
    const errors = [];
    
    // Identyfikator zadania CMR używany do rezerwacji
    const cmrTaskId = `CMR-${cmrData.cmrNumber}-${cmrId}`;
    
    console.log(`Przetwarzanie dostarczenia dla taskId: ${cmrTaskId}`);
    
    // Dla każdego elementu CMR z powiązanymi partiami
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
      
      // Anuluj rezerwację dla tego produktu
      try {
        console.log(`Anulowanie rezerwacji dla produktu ${item.linkedBatches[0].itemName} - ${cmrItemQuantity} ${item.unit}`);
        
        const cancelResult = await cancelBooking(
          item.linkedBatches[0].itemId,  // ID produktu w magazynie
          cmrItemQuantity,               // Ilość do anulowania (ta z CMR)
          cmrTaskId,                     // Identyfikator zadania CMR
          userId                         // Użytkownik wykonujący operację
        );
        
        console.log(`Pomyślnie anulowano rezerwację dla ${item.linkedBatches[0].itemName}:`, cancelResult);
        
      } catch (error) {
        console.error(`Błąd podczas anulowania rezerwacji dla ${item.linkedBatches[0].itemName}:`, error);
        errors.push({
          operation: 'cancel_reservation',
          itemName: item.linkedBatches[0].itemName,
          error: error.message
        });
        // Kontynuuj mimo błędu anulowania rezerwacji
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
          
          console.log(`CMR ${cmrDoc.cmrNumber} ma ${items.length} pozycji:`, items.map(item => ({
            description: item.description,
            quantity: item.quantity || item.numberOfPackages,
            unit: item.unit
          })));
          
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
    // Budowanie zapytania z filtrami
    const cmrRef = collection(db, CMR_COLLECTION);
    let q = query(cmrRef, orderBy('issueDate', 'desc'));
    
    // Dodawanie filtrów do zapytania
    if (filters.startDate && filters.endDate) {
      const startDate = Timestamp.fromDate(new Date(filters.startDate));
      const endDate = Timestamp.fromDate(new Date(filters.endDate));
      q = query(q, where('issueDate', '>=', startDate), where('issueDate', '<=', endDate));
    }
    
    if (filters.sender) {
      q = query(q, where('sender', '==', filters.sender));
    }
    
    if (filters.recipient) {
      q = query(q, where('recipient', '==', filters.recipient));
    }
    
    if (filters.status) {
      q = query(q, where('status', '==', filters.status));
    }
    
    // Pobierz dokumenty CMR według filtrów
    const snapshot = await getDocs(q);
    
    // Mapowanie dokumentów do raportu
    const cmrDocuments = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        cmrNumber: data.cmrNumber,
        issueDate: data.issueDate ? data.issueDate.toDate() : null,
        deliveryDate: data.deliveryDate ? data.deliveryDate.toDate() : null,
        sender: data.sender,
        recipient: data.recipient,
        loadingPlace: data.loadingPlace,
        deliveryPlace: data.deliveryPlace,
        status: data.status,
        items: [], // Zostawiamy puste, pobierzemy później jeśli potrzeba
        createdAt: data.createdAt ? data.createdAt.toDate() : null
      };
    });
    
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
      bySender: {},
      byRecipient: {}
    };
    
    // Obliczanie statystyk
    cmrDocuments.forEach(doc => {
      // Statystyki według statusu
      if (!statistics.byStatus[doc.status]) {
        statistics.byStatus[doc.status] = 0;
      }
      statistics.byStatus[doc.status]++;
      
      // Statystyki według nadawcy
      if (!statistics.bySender[doc.sender]) {
        statistics.bySender[doc.sender] = 0;
      }
      statistics.bySender[doc.sender]++;
      
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
const updateLinkedOrderShippedQuantities = async (orderId, cmrItems, cmrNumber, userId) => {
  try {
    // Mapuj elementy CMR na aktualizacje zamówienia
    const itemUpdates = cmrItems.map((item, index) => ({
      itemName: item.description,
      quantity: parseFloat(item.quantity) || parseFloat(item.numberOfPackages) || 0,
      itemIndex: index,
      cmrNumber: cmrNumber
    })).filter(update => update.quantity > 0);
    
    if (itemUpdates.length > 0) {
      await updateOrderItemShippedQuantity(orderId, itemUpdates, userId);
      console.log(`Zaktualizowano ilości wysłane w zamówieniu ${orderId} na podstawie CMR ${cmrNumber}`);
    }
  } catch (error) {
    console.error('Błąd podczas aktualizacji ilości wysłanych w zamówieniu:', error);
    // Nie rzucamy błędu, aby nie przerywać procesu tworzenia CMR
  }
};

// Funkcja pomocnicza do anulowania ilości wysłanych w powiązanym zamówieniu
const cancelLinkedOrderShippedQuantities = async (orderId, cmrItems, cmrNumber, userId) => {
  try {
    // Mapuj elementy CMR na aktualizacje zamówienia z ujemnymi wartościami (anulowanie)
    const itemUpdates = cmrItems.map((item, index) => ({
      itemName: item.description,
      quantity: -(parseFloat(item.quantity) || parseFloat(item.numberOfPackages) || 0), // Ujemna wartość dla anulowania
      itemIndex: index,
      cmrNumber: cmrNumber
    })).filter(update => update.quantity < 0); // Filtruj tylko ujemne wartości
    
    if (itemUpdates.length > 0) {
      await updateOrderItemShippedQuantity(orderId, itemUpdates, userId);
      console.log(`Anulowano ilości wysłane w zamówieniu ${orderId} na podstawie CMR ${cmrNumber}`);
    }
  } catch (error) {
    console.error('Błąd podczas anulowania ilości wysłanych w zamówieniu:', error);
    // Nie rzucamy błędu, aby nie przerywać procesu zmiany statusu CMR
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

// Funkcja do anulowania rezerwacji partii magazynowych dla dokumentu CMR (wzorowana na deleteTask z productionService)
// 
// UŻYCIE:
// 1. Automatyczne wywoływanie przy zmianie statusu CMR na "Anulowany"
// 2. Można wywołać ręcznie: await cancelCmrReservations(cmrId, userId)
//
// MECHANIZM (wzorowany na deleteTask z productionService.js):
// 1. Anuluje konkretne rezerwacje dla każdego produktu (cancelBooking)
// 2. Czyści wszystkie pozostałe rezerwacje dla CMR (cleanupTaskReservations)  
// 3. Anuluje ilości wysłane w powiązanych zamówieniach
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

    const { cancelBooking, cleanupTaskReservations } = await import('./inventoryService');
    const cancellationResults = [];
    const errors = [];
    
    // Identyfikator zadania CMR używany do rezerwacji
    const cmrTaskId = `CMR-${cmrData.cmrNumber}-${cmrId}`;
    
    console.log(`Anulowanie rezerwacji dla taskId: ${cmrTaskId}`);
    
    // KROK 1: Anuluj konkretne rezerwacje dla każdego elementu CMR (podobnie jak w deleteTask)
    const itemCancellationPromises = [];
    
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
      
      // Dodaj do promises zamiast await w pętli (optymalizacja jak w deleteTask)
      const itemId = item.linkedBatches[0].itemId; // Użyj pierwszej partii dla ID produktu
      itemCancellationPromises.push(
        cancelBooking(itemId, cmrItemQuantity, cmrTaskId, userId)
          .then(() => {
            console.log(`Anulowano rezerwację dla produktu ${item.linkedBatches[0].itemName} - ${cmrItemQuantity} ${item.unit}`);
            cancellationResults.push({
              item: item.description,
              quantity: cmrItemQuantity,
              unit: item.unit,
              success: true
            });
          })
          .catch(error => {
            console.error(`Błąd przy anulowaniu rezerwacji dla ${item.linkedBatches[0].itemName}:`, error);
            errors.push({
              item: item.description,
              error: error.message
            });
          })
      );
    }
    
    // Wykonaj wszystkie anulowania równolegle
    if (itemCancellationPromises.length > 0) {
      await Promise.allSettled(itemCancellationPromises);
    }
    
    // KROK 2: Wyczyść wszystkie pozostałe rezerwacje związane z tym CMR (podobnie jak cleanupTaskReservations)
    try {
      console.log(`Czyszczenie wszystkich rezerwacji związanych z CMR ${cmrTaskId}...`);
      const cleanupResult = await cleanupTaskReservations(cmrTaskId);
      console.log(`Rezultat czyszczenia rezerwacji:`, cleanupResult);
    } catch (error) {
      console.error(`Błąd podczas czyszczenia rezerwacji dla CMR ${cmrTaskId}:`, error);
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