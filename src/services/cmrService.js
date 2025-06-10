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
    const q = query(cmrRef, orderBy('createdAt', 'desc'));
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
    
    // Formatowanie dat
    const formattedData = {
      ...cmrData,
      issueDate: convertToTimestamp(cmrData.issueDate),
      deliveryDate: convertToTimestamp(cmrData.deliveryDate),
      loadingDate: convertToTimestamp(cmrData.loadingDate),
      status: cmrData.status || CMR_STATUSES.DRAFT,
      cmrNumber: cmrData.cmrNumber || generateCmrNumber(),
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
      
      // Aktualizuj ilości wysłane w powiązanym zamówieniu klienta
      try {
        const cmrData = await getCmrDocumentById(cmrId);
        if (cmrData.linkedOrderId && cmrData.items && cmrData.items.length > 0) {
          console.log('Aktualizacja ilości wysłanych w zamówieniu przy zmianie statusu na "W transporcie"...');
          await updateLinkedOrderShippedQuantities(cmrData.linkedOrderId, cmrData.items, cmrData.cmrNumber, userId);
          console.log(`Zaktualizowano ilości wysłane w zamówieniu ${cmrData.linkedOrderId} na podstawie CMR ${cmrData.cmrNumber}`);
        }
      } catch (orderUpdateError) {
        console.error('Błąd podczas aktualizacji ilości wysłanych w zamówieniu:', orderUpdateError);
        // Nie przerywamy procesu zmiany statusu - tylko logujemy błąd
      }
    }
    
    // Jeśli cofamy ze statusu "W transporcie" na inny status, anuluj ilości wysłane
    if (currentStatus === CMR_STATUSES.IN_TRANSIT && newStatus !== CMR_STATUSES.IN_TRANSIT && newStatus !== CMR_STATUSES.DELIVERED) {
      console.log('Cofanie ze statusu "W transporcie" - anulowanie ilości wysłanych...');
      try {
        const cmrData = await getCmrDocumentById(cmrId);
        if (cmrData.linkedOrderId && cmrData.items && cmrData.items.length > 0) {
          console.log('Anulowanie ilości wysłanych w zamówieniu przy cofnięciu ze statusu "W transporcie"...');
          await cancelLinkedOrderShippedQuantities(cmrData.linkedOrderId, cmrData.items, cmrData.cmrNumber, userId);
          console.log(`Anulowano ilości wysłane w zamówieniu ${cmrData.linkedOrderId} na podstawie CMR ${cmrData.cmrNumber}`);
        }
      } catch (orderUpdateError) {
        console.error('Błąd podczas anulowania ilości wysłanych w zamówieniu:', orderUpdateError);
        // Nie przerywamy procesu zmiany statusu - tylko logujemy błąd
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
export const generateCmrNumber = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  
  return `CMR-${year}${month}${day}-${random}`;
};

/**
 * Pobiera dokumenty CMR powiązane z określonym zamówieniem
 */
export const getCmrDocumentsByOrderId = async (orderId) => {
  try {
    const cmrQuery = query(
      collection(db, CMR_COLLECTION),
      where('linkedOrderId', '==', orderId),
      orderBy('issueDate', 'desc')
    );
    
    const querySnapshot = await getDocs(cmrQuery);
    
    const cmrDocuments = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      cmrDocuments.push({
        id: doc.id,
        ...data,
        issueDate: data.issueDate && typeof data.issueDate.toDate === 'function' ? data.issueDate.toDate() : data.issueDate,
        deliveryDate: data.deliveryDate && typeof data.deliveryDate.toDate === 'function' ? data.deliveryDate.toDate() : data.deliveryDate,
        loadingDate: data.loadingDate && typeof data.loadingDate.toDate === 'function' ? data.loadingDate.toDate() : data.loadingDate,
        createdAt: data.createdAt && typeof data.createdAt.toDate === 'function' ? data.createdAt.toDate() : data.createdAt,
        updatedAt: data.updatedAt && typeof data.updatedAt.toDate === 'function' ? data.updatedAt.toDate() : data.updatedAt
      });
    });
    
    return cmrDocuments;
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