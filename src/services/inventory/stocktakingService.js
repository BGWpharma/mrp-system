// src/services/inventory/stocktakingService.js

import { 
  collection, 
  doc, 
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  setDoc,
  query, 
  where,
  orderBy,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { 
  COLLECTIONS,
  STOCKTAKING_STATUS,
  TRANSACTION_TYPES
} from './config/constants.js';
import { 
  validateId, 
  validatePositiveNumber,
  validateNonNegativeNumber,
  validateStocktakingData,
  ValidationError 
} from './utils/validators.js';
import { 
  convertTimestampToDate,
  formatDateToLocal,
  formatQuantityPrecision 
} from './utils/formatters.js';
import { FirebaseQueryBuilder } from './config/firebaseQueries.js';

/**
 * Usługa systemu inwentaryzacji (spisu z natury)
 * 
 * Ten moduł zawiera wszystkie funkcje związane z inwentaryzacją:
 * - Tworzenie i zarządzanie inwentaryzacjami
 * - Dodawanie i modyfikowanie pozycji inwentaryzacji
 * - Zakończenie inwentaryzacji z korektami magazynowymi
 * - Generowanie raportów z inwentaryzacji
 * - System korekt i ponownego otwierania
 */

/**
 * Pobiera wszystkie inwentaryzacje
 * @param {Object} options - Opcje filtrowania
 * @param {string} options.status - Status inwentaryzacji do filtrowania
 * @param {string} options.location - Lokalizacja do filtrowania
 * @param {number} options.limit - Limit wyników
 * @returns {Promise<Array>} - Lista inwentaryzacji
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const getAllStocktakings = async (options = {}) => {
  try {
    const { status = null, location = null, limit = null } = options;

    const stocktakingRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_STOCKTAKING);
    let q = query(stocktakingRef, orderBy('createdAt', 'desc'));

    // Dodaj filtry jeśli podano
    if (status) {
      q = query(q, where('status', '==', status));
    }

    if (location) {
      q = query(q, where('location', '==', location));
    }

    if (limit && typeof limit === 'number') {
      q = query(q, limit(limit));
    }
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: convertTimestampToDate(doc.data().createdAt),
      updatedAt: convertTimestampToDate(doc.data().updatedAt),
      completedAt: convertTimestampToDate(doc.data().completedAt)
    }));
  } catch (error) {
    console.error('Błąd podczas pobierania inwentaryzacji:', error);
    throw new Error(`Nie udało się pobrać inwentaryzacji: ${error.message}`);
  }
};

/**
 * Pobiera inwentaryzację po ID
 * @param {string} stocktakingId - ID inwentaryzacji
 * @returns {Promise<Object>} - Dane inwentaryzacji
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const getStocktakingById = async (stocktakingId) => {
  try {
    // Walidacja parametrów
    const validatedId = validateId(stocktakingId, 'stocktakingId');

    const docRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY_STOCKTAKING, validatedId);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      throw new Error('Inwentaryzacja nie istnieje');
    }
    
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      createdAt: convertTimestampToDate(data.createdAt),
      updatedAt: convertTimestampToDate(data.updatedAt),
      completedAt: convertTimestampToDate(data.completedAt)
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas pobierania inwentaryzacji:', error);
    throw new Error(`Nie udało się pobrać inwentaryzacji: ${error.message}`);
  }
};

/**
 * Tworzy nową inwentaryzację
 * @param {Object} stocktakingData - Dane inwentaryzacji
 * @param {string} stocktakingData.name - Nazwa inwentaryzacji
 * @param {string} stocktakingData.description - Opis inwentaryzacji
 * @param {string} stocktakingData.location - Lokalizacja
 * @param {string} stocktakingData.type - Typ inwentaryzacji
 * @param {string} userId - ID użytkownika tworzącego
 * @returns {Promise<Object>} - Utworzona inwentaryzacja
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const createStocktaking = async (stocktakingData, userId) => {
  try {
    // Walidacja parametrów
    validateStocktakingData(stocktakingData);
    const validatedUserId = validateId(userId, 'userId');

    const stocktakingWithMeta = {
      ...stocktakingData,
      status: STOCKTAKING_STATUS.OPEN,
      createdBy: validatedUserId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      completedAt: null,
      itemsCount: 0,
      discrepanciesCount: 0,
      totalValue: 0
    };
    
    const docRef = await addDoc(
      FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_STOCKTAKING), 
      stocktakingWithMeta
    );
    
    return {
      id: docRef.id,
      ...stocktakingWithMeta
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas tworzenia inwentaryzacji:', error);
    throw new Error(`Nie udało się utworzyć inwentaryzacji: ${error.message}`);
  }
};

/**
 * Aktualizuje inwentaryzację
 * @param {string} stocktakingId - ID inwentaryzacji
 * @param {Object} stocktakingData - Nowe dane inwentaryzacji
 * @param {string} userId - ID użytkownika aktualizującego
 * @param {boolean} allowCorrection - Czy pozwolić na korekty zakończonej inwentaryzacji
 * @returns {Promise<Object>} - Zaktualizowana inwentaryzacja
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const updateStocktaking = async (stocktakingId, stocktakingData, userId, allowCorrection = false) => {
  try {
    // Walidacja parametrów
    const validatedId = validateId(stocktakingId, 'stocktakingId');
    const validatedUserId = validateId(userId, 'userId');
    
    if (stocktakingData.name || stocktakingData.description) {
      validateStocktakingData(stocktakingData, false); // Częściowa walidacja przy aktualizacji
    }

    const stocktakingRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY_STOCKTAKING, validatedId);
    
    // Pobierz aktualne dane
    const currentStocktaking = await getStocktakingById(validatedId);
    
    // Sprawdź czy inwentaryzacja nie jest już zakończona (chyba że to korekta)
    if (currentStocktaking.status === STOCKTAKING_STATUS.COMPLETED && 
        stocktakingData.status !== STOCKTAKING_STATUS.COMPLETED && 
        !allowCorrection) {
      throw new Error('Nie można modyfikować zakończonej inwentaryzacji. Użyj funkcji korekty.');
    }
    
    const updatedData = {
      ...stocktakingData,
      updatedAt: serverTimestamp(),
      updatedBy: validatedUserId
    };
    
    // Jeśli status zmienia się na zakończona, dodaj datę zakończenia
    if (stocktakingData.status === STOCKTAKING_STATUS.COMPLETED && 
        currentStocktaking.status !== STOCKTAKING_STATUS.COMPLETED) {
      updatedData.completedAt = serverTimestamp();
    }
    
    await updateDoc(stocktakingRef, updatedData);
    
    return {
      id: validatedId,
      ...currentStocktaking,
      ...updatedData
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas aktualizacji inwentaryzacji:', error);
    throw new Error(`Nie udało się zaktualizować inwentaryzacji: ${error.message}`);
  }
};

/**
 * Ponownie otwiera zakończoną inwentaryzację do korekty
 * @param {string} stocktakingId - ID inwentaryzacji
 * @param {string} userId - ID użytkownika
 * @returns {Promise<Object>} - Wynik operacji
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const reopenStocktakingForCorrection = async (stocktakingId, userId) => {
  try {
    // Walidacja parametrów
    const validatedId = validateId(stocktakingId, 'stocktakingId');
    const validatedUserId = validateId(userId, 'userId');

    const stocktaking = await getStocktakingById(validatedId);
    
    if (!stocktaking) {
      throw new Error('Inwentaryzacja nie istnieje');
    }
    
    if (stocktaking.status !== STOCKTAKING_STATUS.COMPLETED) {
      throw new Error('Można ponownie otworzyć tylko zakończoną inwentaryzację');
    }

    // Dodaj wpis w transakcjach
    await createStocktakingTransaction({
      type: TRANSACTION_TYPES.STOCKTAKING_REOPEN,
      stocktakingId: validatedId,
      stocktakingName: stocktaking.name,
      notes: `Ponownie otwarto zakończoną inwentaryzację "${stocktaking.name}" do wprowadzenia korekt.`,
      userId: validatedUserId
    });
    
    const stocktakingRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY_STOCKTAKING, validatedId);
    
    await updateDoc(stocktakingRef, {
      status: STOCKTAKING_STATUS.IN_CORRECTION,
      reopenedAt: serverTimestamp(),
      reopenedBy: validatedUserId,
      originalCompletedAt: stocktaking.completedAt, // Zachowaj oryginalną datę zakończenia
      correctionHistory: [
        ...(stocktaking.correctionHistory || []),
        {
          reopenedAt: new Date(),
          reopenedBy: validatedUserId,
          reason: 'Korekta inwentaryzacji'
        }
      ]
    });

    return {
      success: true,
      message: 'Inwentaryzacja została ponownie otwarta do korekty'
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas ponownego otwierania inwentaryzacji:', error);
    throw new Error(`Nie udało się ponownie otworzyć inwentaryzacji: ${error.message}`);
  }
};

/**
 * Kończy korektę inwentaryzacji
 * @param {string} stocktakingId - ID inwentaryzacji
 * @param {boolean} adjustInventory - Czy dostosować stany magazynowe
 * @param {string} userId - ID użytkownika
 * @returns {Promise<Object>} - Wynik operacji
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const completeCorrectedStocktaking = async (stocktakingId, adjustInventory = true, userId) => {
  try {
    // Walidacja parametrów
    const validatedId = validateId(stocktakingId, 'stocktakingId');
    const validatedUserId = validateId(userId, 'userId');

    const stocktaking = await getStocktakingById(validatedId);
    
    if (!stocktaking) {
      throw new Error('Inwentaryzacja nie istnieje');
    }
    
    if (stocktaking.status !== STOCKTAKING_STATUS.IN_CORRECTION) {
      throw new Error('Można zakończyć korekty tylko dla inwentaryzacji w stanie korekty');
    }

    // Pobierz elementy inwentaryzacji i wykonaj korekty
    const items = await getStocktakingItems(validatedId);
    
    if (adjustInventory) {
      await processStocktakingAdjustments(items, validatedUserId, 'correction');
    }

    // Zaktualizuj status inwentaryzacji
    const stocktakingRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY_STOCKTAKING, validatedId);
    await updateDoc(stocktakingRef, {
      status: STOCKTAKING_STATUS.COMPLETED,
      completedAt: serverTimestamp(),
      correctionCompletedAt: serverTimestamp(),
      correctionCompletedBy: validatedUserId
    });

    // Dodaj wpis w transakcjach
    await createStocktakingTransaction({
      type: TRANSACTION_TYPES.STOCKTAKING_CORRECTION_COMPLETED,
      stocktakingId: validatedId,
      stocktakingName: stocktaking.name,
      notes: `Zakończono korekty inwentaryzacji "${stocktaking.name}".`,
      userId: validatedUserId
    });

    return {
      success: true,
      message: 'Korekta inwentaryzacji została zakończona'
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas kończenia korekty inwentaryzacji:', error);
    throw new Error(`Nie udało się zakończyć korekty inwentaryzacji: ${error.message}`);
  }
};

/**
 * Pobiera elementy inwentaryzacji
 * @param {string} stocktakingId - ID inwentaryzacji
 * @param {Object} options - Opcje filtrowania
 * @param {boolean} options.includeStats - Czy dołączyć statystyki
 * @returns {Promise<Array>} - Lista elementów inwentaryzacji
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const getStocktakingItems = async (stocktakingId, options = {}) => {
  try {
    // Walidacja parametrów
    const validatedId = validateId(stocktakingId, 'stocktakingId');
    const { includeStats = false } = options;

    const itemsRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_STOCKTAKING_ITEMS);
    const q = query(itemsRef, where('stocktakingId', '==', validatedId));
    
    const querySnapshot = await getDocs(q);
    const items = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: convertTimestampToDate(data.createdAt),
        updatedAt: convertTimestampToDate(data.updatedAt),
        expiryDate: convertTimestampToDate(data.expiryDate)
      };
    });



    if (includeStats) {
      const stats = calculateStocktakingStats(items);
      return { items, stats };
    }

    return items;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas pobierania elementów inwentaryzacji:', error);
    throw new Error(`Nie udało się pobrać elementów inwentaryzacji: ${error.message}`);
  }
};

/**
 * Pobiera partie dla inwentaryzacji
 * @param {string} stocktakingId - ID inwentaryzacji
 * @returns {Promise<Array>} - Lista partii w inwentaryzacji
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const getStocktakingBatches = async (stocktakingId) => {
  try {
    // Walidacja parametrów
    const validatedId = validateId(stocktakingId, 'stocktakingId');

    const itemsRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_STOCKTAKING_ITEMS);
    const q = query(itemsRef, where('stocktakingId', '==', validatedId));
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs
      .map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: convertTimestampToDate(data.createdAt),
          updatedAt: convertTimestampToDate(data.updatedAt),
          expiryDate: convertTimestampToDate(data.expiryDate)
        };
      })
      .filter(item => item.batchId); // Tylko elementy z partiami
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas pobierania partii inwentaryzacji:', error);
    throw new Error(`Nie udało się pobrać partii inwentaryzacji: ${error.message}`);
  }
};

/**
 * Dodaje pozycję do inwentaryzacji
 * @param {string} stocktakingId - ID inwentaryzacji
 * @param {Object} itemData - Dane pozycji
 * @param {string} userId - ID użytkownika
 * @returns {Promise<Object>} - Dodana pozycja
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const addItemToStocktaking = async (stocktakingId, itemData, userId) => {
  try {
    // Walidacja parametrów
    const validatedId = validateId(stocktakingId, 'stocktakingId');
    const validatedUserId = validateId(userId, 'userId');

    // Sprawdź czy inwentaryzacja istnieje i czy można do niej dodawać
    const stocktaking = await getStocktakingById(validatedId);
    
    if (stocktaking.status === STOCKTAKING_STATUS.COMPLETED) {
      throw new Error('Nie można dodawać pozycji do zakończonej inwentaryzacji');
    }

    let stocktakingItem;
    
    // Jeśli podano batchId, dodajemy konkretną partię (LOT)
    if (itemData.batchId) {
      stocktakingItem = await createBatchStocktakingItem(validatedId, itemData, validatedUserId);
    } else {
      stocktakingItem = await createInventoryStocktakingItem(validatedId, itemData, validatedUserId);
    }

    // Dodaj do bazy danych
    const docRef = await addDoc(
      FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_STOCKTAKING_ITEMS), 
      stocktakingItem
    );

    return {
      id: docRef.id,
      ...stocktakingItem
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas dodawania pozycji do inwentaryzacji:', error);
    throw new Error(`Nie udało się dodać pozycji do inwentaryzacji: ${error.message}`);
  }
};

/**
 * Aktualizuje pozycję inwentaryzacji
 * @param {string} itemId - ID pozycji inwentaryzacji
 * @param {Object} itemData - Nowe dane pozycji
 * @param {string} userId - ID użytkownika
 * @returns {Promise<Object>} - Zaktualizowana pozycja
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const updateStocktakingItem = async (itemId, itemData, userId) => {
  try {
    // Walidacja parametrów
    const validatedItemId = validateId(itemId, 'itemId');
    const validatedUserId = validateId(userId, 'userId');

    if (itemData.countedQuantity !== undefined) {
      validateNonNegativeNumber(itemData.countedQuantity, 'countedQuantity'); // Zezwól na 0 i wartości dodatnie
    }

    const itemRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY_STOCKTAKING_ITEMS, validatedItemId);
    
    // Pobierz aktualne dane pozycji
    const currentItem = await getDoc(itemRef);
    if (!currentItem.exists()) {
      throw new Error('Pozycja inwentaryzacji nie istnieje');
    }

    const currentData = currentItem.data();
    
    // Oblicz nową rozbieżność jeśli zmienia się counted quantity
    const updatedData = { ...itemData };
    if (itemData.countedQuantity !== undefined) {
      updatedData.discrepancy = formatQuantityPrecision(
        itemData.countedQuantity - (currentData.systemQuantity || 0)
      );

    }

    updatedData.updatedAt = serverTimestamp();
    updatedData.updatedBy = validatedUserId;

    await updateDoc(itemRef, updatedData);

    return {
      id: validatedItemId,
      ...currentData,
      ...updatedData
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas aktualizacji pozycji inwentaryzacji:', error);
    throw new Error(`Nie udało się zaktualizować pozycji inwentaryzacji: ${error.message}`);
  }
};

/**
 * Usuwa pozycję z inwentaryzacji
 * @param {string} itemId - ID pozycji inwentaryzacji
 * @returns {Promise<Object>} - Wynik operacji
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const deleteStocktakingItem = async (itemId) => {
  try {
    // Walidacja parametrów
    const validatedItemId = validateId(itemId, 'itemId');

    const itemRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY_STOCKTAKING_ITEMS, validatedItemId);
    await deleteDoc(itemRef);

    return {
      success: true,
      message: 'Pozycja inwentaryzacji została usunięta'
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas usuwania pozycji inwentaryzacji:', error);
    throw new Error(`Nie udało się usunąć pozycji inwentaryzacji: ${error.message}`);
  }
};

/**
 * Usuwa całą inwentaryzację
 * @param {string} stocktakingId - ID inwentaryzacji
 * @param {boolean} forceDelete - Czy wymusić usunięcie zakończonej inwentaryzacji
 * @returns {Promise<Object>} - Wynik operacji
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const deleteStocktaking = async (stocktakingId, forceDelete = false) => {
  try {
    // Walidacja parametrów
    const validatedId = validateId(stocktakingId, 'stocktakingId');

    // Pobierz informacje o inwentaryzacji
    const stocktaking = await getStocktakingById(validatedId);
    
    // Sprawdź czy inwentaryzacja nie jest już zakończona (chyba że force delete)
    if (stocktaking.status === STOCKTAKING_STATUS.COMPLETED && !forceDelete) {
      throw new Error('Nie można usunąć zakończonej inwentaryzacji. Użyj opcji "Usuń bez cofania korekt" jeśli chcesz usunąć inwentaryzację zachowując wprowadzone korekty.');
    }
    
    // Pobierz wszystkie elementy inwentaryzacji
    const items = await getStocktakingItems(validatedId);
    
    // Usuń wszystkie elementy inwentaryzacji
    const itemDeletions = items.map(item => 
      deleteDoc(FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY_STOCKTAKING_ITEMS, item.id))
    );
    
    // Poczekaj na usunięcie wszystkich elementów
    await Promise.all(itemDeletions);
    
    // Na końcu usuń samą inwentaryzację
    const stocktakingRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY_STOCKTAKING, validatedId);
    await deleteDoc(stocktakingRef);
    
    return { 
      success: true,
      message: forceDelete ? 
        'Inwentaryzacja została usunięta (korekty zachowane)' : 
        'Inwentaryzacja została usunięta' 
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas usuwania inwentaryzacji:', error);
    throw new Error(`Nie udało się usunąć inwentaryzacji: ${error.message}`);
  }
};

/**
 * Usuwa zakończoną inwentaryzację bez cofania korekt
 * @param {string} stocktakingId - ID inwentaryzacji
 * @param {string} userId - ID użytkownika
 * @returns {Promise<Object>} - Wynik operacji
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const deleteCompletedStocktaking = async (stocktakingId, userId) => {
  try {
    // Walidacja parametrów
    const validatedId = validateId(stocktakingId, 'stocktakingId');
    const validatedUserId = validateId(userId, 'userId');

    // Pobierz informacje o inwentaryzacji
    const stocktaking = await getStocktakingById(validatedId);
    
    if (!stocktaking) {
      throw new Error('Inwentaryzacja nie istnieje');
    }
    
    if (stocktaking.status !== STOCKTAKING_STATUS.COMPLETED) {
      throw new Error('Można usuwać tylko zakończone inwentaryzacje');
    }
    
    // Pobierz wszystkie elementy inwentaryzacji dla logowania
    const items = await getStocktakingItems(validatedId);
    
    // Dodaj wpis w historii transakcji dokumentujący usunięcie inwentaryzacji
    await createStocktakingTransaction({
      type: TRANSACTION_TYPES.STOCKTAKING_DELETION,
      stocktakingId: validatedId,
      stocktakingName: stocktaking.name,
      notes: `Usunięto zakończoną inwentaryzację "${stocktaking.name}" z ${items.length} pozycjami. Korekty pozostały bez zmian.`,
      userId: validatedUserId,
      itemsCount: items.length
    });
    
    // Użyj funkcji deleteStocktaking z parametrem forceDelete
    return await deleteStocktaking(validatedId, true);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas usuwania zakończonej inwentaryzacji:', error);
    throw new Error(`Nie udało się usunąć zakończonej inwentaryzacji: ${error.message}`);
  }
};

/**
 * Akceptuje pojedynczą pozycję inwentaryzacji i opcjonalnie aktualizuje stan magazynowy
 * @param {string} itemId - ID pozycji inwentaryzacji
 * @param {boolean} adjustInventory - Czy zaktualizować stan magazynowy
 * @param {string} userId - ID użytkownika akceptującego
 * @returns {Promise<Object>} - Wynik operacji
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const acceptStocktakingItem = async (itemId, adjustInventory = true, userId) => {
  try {
    const validatedItemId = validateId(itemId, 'itemId');
    const validatedUserId = validateId(userId, 'userId');

    // Pobierz pozycję
    const itemRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY_STOCKTAKING_ITEMS, validatedItemId);
    const itemDoc = await getDoc(itemRef);
    
    if (!itemDoc.exists()) {
      throw new Error('Pozycja inwentaryzacji nie istnieje');
    }

    const item = { id: itemDoc.id, ...itemDoc.data() };

    // Sprawdź czy pozycja nie jest już zaakceptowana
    if (item.accepted) {
      throw new Error('Pozycja jest już zaakceptowana');
    }

    // Sprawdź czy wprowadzono policzoną ilość
    if (item.countedQuantity === null || item.countedQuantity === undefined) {
      throw new ValidationError('Nie można zaakceptować pozycji bez wprowadzonej policzonej ilości', 'countedQuantity');
    }

    // Sprawdź czy inwentaryzacja nie jest zakończona
    const stocktaking = await getStocktakingById(item.stocktakingId);
    if (stocktaking.status === STOCKTAKING_STATUS.COMPLETED) {
      throw new Error('Nie można akceptować pozycji w zakończonej inwentaryzacji');
    }

    // 🔍 SPRAWDŹ REZERWACJE - jeśli będziemy aktualizować stany
    if (adjustInventory) {
      const reservationCheck = await checkSingleItemReservationImpact(item);
      
      if (reservationCheck.hasWarnings) {
        const warning = reservationCheck.warnings[0];
        
        // Przygotuj szczegółowy komunikat o rezerwacjach
        const reservationDetails = warning.reservations
          .map(r => `  • ${r.displayName} - ${r.quantity} ${warning.unit}${r.clientName !== 'N/A' ? ` (${r.clientName})` : ''}`)
          .join('\n');
        
        const errorMessage = 
          `⚠️ OSTRZEŻENIE REZERWACJI\n\n` +
          `Nie można zaakceptować pozycji ze względu na istniejące rezerwacje.\n\n` +
          `📦 Partia: ${warning.batchNumber}\n` +
          `📊 Obecna ilość: ${warning.currentQuantity} ${warning.unit}\n` +
          `📉 Po korekcie: ${warning.newQuantity} ${warning.unit}\n` +
          `🔒 Zarezerwowane: ${warning.totalReserved} ${warning.unit}\n` +
          `❌ Niedobór: ${warning.shortage} ${warning.unit}\n\n` +
          `Zarezerwowane dla zadań:\n${reservationDetails}\n\n` +
          `🔧 Co możesz zrobić:\n` +
          `1. Cofnij/zmniejsz rezerwacje w zadaniach produkcyjnych\n` +
          `2. Skoryguj ilość policzoną w inwentaryzacji\n` +
          `3. Użyj "Zakończ inwentaryzację" z opcją anulowania zagrożonych rezerwacji`;
        
        throw new Error(errorMessage);
      }
    }

    // Jeśli mamy aktualizować stany magazynowe
    if (adjustInventory) {
      const discrepancy = item.discrepancy || 0;
      
      // Pomiń jeśli różnica jest minimalna
      if (Math.abs(discrepancy) >= 0.001) {
        if (item.batchId) {
          // Aktualizuj partię
          const { updateBatch } = await import('./batchService');
          const newQuantity = formatQuantityPrecision((item.systemQuantity || 0) + discrepancy);
          await updateBatch(item.batchId, { quantity: newQuantity }, validatedUserId);
        } else {
          // Aktualizuj pozycję magazynową
          const { updateInventoryItemQuantity } = await import('./inventoryItemsService');
          const newQuantity = formatQuantityPrecision((item.systemQuantity || 0) + discrepancy);
          await updateInventoryItemQuantity(item.inventoryItemId, newQuantity, validatedUserId);
        }

        // Dodaj transakcję korekt
        await createInventoryAdjustmentTransaction({
          item,
          discrepancy,
          operation: 'item_acceptance',
          userId: validatedUserId
        });
      }
    }

    // Oznacz pozycję jako zaakceptowaną
    await updateDoc(itemRef, {
      accepted: true,
      acceptedAt: serverTimestamp(),
      acceptedBy: validatedUserId,
      adjustmentApplied: adjustInventory,
      status: 'Zaakceptowana',
      updatedAt: serverTimestamp(),
      updatedBy: validatedUserId
    });

    return {
      success: true,
      message: 'Pozycja została zaakceptowana',
      itemId: validatedItemId,
      adjustmentApplied: adjustInventory
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    
    // Jeśli to błąd rezerwacji, rzuć go bez opakowywania
    if (error.message && error.message.includes('OSTRZEŻENIE REZERWACJI')) {
      throw error;
    }
    
    console.error('Błąd podczas akceptowania pozycji inwentaryzacji:', error);
    throw new Error(`Nie udało się zaakceptować pozycji: ${error.message}`);
  }
};

/**
 * Anuluje akceptację pozycji inwentaryzacji (cofnięcie)
 * @param {string} itemId - ID pozycji inwentaryzacji
 * @param {boolean} revertInventory - Czy cofnąć zmiany w stanie magazynowym
 * @param {string} userId - ID użytkownika
 * @returns {Promise<Object>} - Wynik operacji
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const unacceptStocktakingItem = async (itemId, revertInventory = true, userId) => {
  try {
    const validatedItemId = validateId(itemId, 'itemId');
    const validatedUserId = validateId(userId, 'userId');

    const itemRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY_STOCKTAKING_ITEMS, validatedItemId);
    const itemDoc = await getDoc(itemRef);
    
    if (!itemDoc.exists()) {
      throw new Error('Pozycja inwentaryzacji nie istnieje');
    }

    const item = { id: itemDoc.id, ...itemDoc.data() };

    if (!item.accepted) {
      throw new Error('Pozycja nie jest zaakceptowana');
    }

    // Sprawdź czy inwentaryzacja nie jest zakończona
    const stocktaking = await getStocktakingById(item.stocktakingId);
    if (stocktaking.status === STOCKTAKING_STATUS.COMPLETED) {
      throw new Error('Nie można cofnąć akceptacji w zakończonej inwentaryzacji');
    }

    // Cofnij zmiany w magazynie jeśli zastosowano korekty
    if (revertInventory && item.adjustmentApplied) {
      const discrepancy = item.discrepancy || 0;
      
      if (Math.abs(discrepancy) >= 0.001) {
        if (item.batchId) {
          const { updateBatch } = await import('./batchService');
          // Przywróć oryginalną ilość systemową
          await updateBatch(item.batchId, { quantity: item.systemQuantity }, validatedUserId);
        } else {
          const { updateInventoryItemQuantity } = await import('./inventoryItemsService');
          await updateInventoryItemQuantity(item.inventoryItemId, item.systemQuantity, validatedUserId);
        }

        // Dodaj transakcję odwrócenia
        await createInventoryAdjustmentTransaction({
          item,
          discrepancy: -discrepancy,
          operation: 'item_acceptance_reversal',
          userId: validatedUserId
        });
      }
    }

    // Cofnij akceptację
    await updateDoc(itemRef, {
      accepted: false,
      acceptedAt: null,
      acceptedBy: null,
      adjustmentApplied: false,
      status: 'Dodano',
      updatedAt: serverTimestamp(),
      updatedBy: validatedUserId
    });

    return {
      success: true,
      message: 'Akceptacja pozycji została cofnięta',
      itemId: validatedItemId
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas cofania akceptacji pozycji:', error);
    throw new Error(`Nie udało się cofnąć akceptacji: ${error.message}`);
  }
};

/**
 * Kończy inwentaryzację i aktualizuje stany magazynowe
 * @param {string} stocktakingId - ID inwentaryzacji
 * @param {boolean} adjustInventory - Czy dostosować stany magazynowe
 * @param {string} userId - ID użytkownika
 * @returns {Promise<Object>} - Wynik operacji z podsumowaniem
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const completeStocktaking = async (stocktakingId, adjustInventory = true, userId) => {
  try {
    // Walidacja parametrów
    const validatedId = validateId(stocktakingId, 'stocktakingId');
    const validatedUserId = validateId(userId, 'userId');

    // Pobierz informacje o inwentaryzacji
    const stocktaking = await getStocktakingById(validatedId);
    
    // Sprawdź czy inwentaryzacja nie jest już zakończona
    if (stocktaking.status === STOCKTAKING_STATUS.COMPLETED) {
      throw new Error('Inwentaryzacja jest już zakończona');
    }
    
    // Pobierz wszystkie elementy inwentaryzacji
    const items = await getStocktakingItems(validatedId);
    
    // Filtruj tylko niezaakceptowane pozycje
    const unacceptedItems = items.filter(item => !item.accepted);
    
    let adjustmentResult = null;
    
    // Jeśli mamy dostosować stany magazynowe dla niezaakceptowanych pozycji
    if (adjustInventory && unacceptedItems.length > 0) {
      adjustmentResult = await processStocktakingAdjustments(unacceptedItems, validatedUserId, 'completion');
      
      // Oznacz niezaakceptowane pozycje jako zaakceptowane
      for (const item of unacceptedItems) {
        const itemRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY_STOCKTAKING_ITEMS, item.id);
        await updateDoc(itemRef, {
          accepted: true,
          acceptedAt: serverTimestamp(),
          acceptedBy: validatedUserId,
          adjustmentApplied: true,
          status: 'Zaakceptowana'
        });
      }
    }

    // Oblicz statystyki dla wszystkich pozycji
    const stats = calculateStocktakingStats(items);
    
    // Policz zaakceptowane pozycje
    const acceptedItemsCount = items.filter(i => i.accepted).length + unacceptedItems.length;

    // Zaktualizuj status inwentaryzacji
    const stocktakingRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY_STOCKTAKING, validatedId);
    await updateDoc(stocktakingRef, {
      status: STOCKTAKING_STATUS.COMPLETED,
      completedAt: serverTimestamp(),
      completedBy: validatedUserId,
      itemsCount: stats.totalItems,
      acceptedItemsCount: acceptedItemsCount,
      discrepanciesCount: stats.itemsWithDiscrepancy,
      totalValue: stats.totalValue,
      adjustmentsApplied: adjustInventory
    });

    // Dodaj wpis w transakcjach
    await createStocktakingTransaction({
      type: TRANSACTION_TYPES.STOCKTAKING_COMPLETED,
      stocktakingId: validatedId,
      stocktakingName: stocktaking.name,
      notes: `Zakończono inwentaryzację "${stocktaking.name}" z ${items.length} pozycjami (${acceptedItemsCount} zaakceptowanych)${adjustInventory ? ' z korektami stanów magazynowych' : ' bez korekt stanów'}.`,
      userId: validatedUserId,
      itemsCount: items.length,
      acceptedItemsCount: acceptedItemsCount,
      discrepanciesCount: stats.itemsWithDiscrepancy
    });

    return {
      success: true,
      message: 'Inwentaryzacja została zakończona',
      stats,
      adjustmentResult,
      acceptedItemsCount
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas kończenia inwentaryzacji:', error);
    throw new Error(`Nie udało się zakończyć inwentaryzacji: ${error.message}`);
  }
};

/**
 * Generuje raport różnic z inwentaryzacji w formacie PDF
 * @param {string} stocktakingId - ID inwentaryzacji
 * @param {Object} options - Opcje generowania raportu
 * @param {boolean} options.includeNoDifferences - Czy dołączyć pozycje bez różnic
 * @param {string} options.format - Format raportu ('pdf'|'csv')
 * @returns {Promise<Object>} - Wygenerowany raport
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const generateStocktakingReport = async (stocktakingId, options = {}) => {
  try {
    // Walidacja parametrów
    const validatedId = validateId(stocktakingId, 'stocktakingId');
    const { includeNoDifferences = false, format = 'pdf' } = options;

    // Pobierz informacje o inwentaryzacji
    const stocktaking = await getStocktakingById(validatedId);
    
    // Pobierz wszystkie elementy inwentaryzacji
    const items = await getStocktakingItems(validatedId);
    
    // Filtruj pozycje jeśli potrzeba
    const reportItems = includeNoDifferences 
      ? items 
      : items.filter(item => Math.abs(item.discrepancy || 0) > 0.001);

    // Pobierz anulowane rezerwacje z dokumentu inwentaryzacji
    const cancelledReservations = stocktaking.cancelledReservations || [];

    if (format === 'csv') {
      return generateStocktakingCSVReport(stocktaking, reportItems, cancelledReservations);
    } else {
      return generateStocktakingPDFReport(stocktaking, reportItems, cancelledReservations);
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas generowania raportu inwentaryzacji:', error);
    throw new Error(`Nie udało się wygenerować raportu inwentaryzacji: ${error.message}`);
  }
};

/**
 * Pobiera statystyki inwentaryzacji
 * @param {string} stocktakingId - ID inwentaryzacji
 * @returns {Promise<Object>} - Statystyki inwentaryzacji
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const getStocktakingStatistics = async (stocktakingId) => {
  try {
    // Walidacja parametrów
    const validatedId = validateId(stocktakingId, 'stocktakingId');

    const items = await getStocktakingItems(validatedId);
    const stats = calculateStocktakingStats(items);
    
    return {
      ...stats,
      stocktakingId: validatedId,
      lastUpdated: new Date()
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas pobierania statystyk inwentaryzacji:', error);
    throw new Error(`Nie udało się pobrać statystyk inwentaryzacji: ${error.message}`);
  }
};

// ===== FUNKCJE POMOCNICZE =====

/**
 * Tworzy pozycję inwentaryzacji dla partii
 * @private
 */
const createBatchStocktakingItem = async (stocktakingId, itemData, userId) => {
  const { getBatchById } = await import('./batchService');
  const { getInventoryItemById } = await import('./inventoryItemsService');
  
  // Pobierz informacje o partii
  const batch = await getBatchById(itemData.batchId);
  if (!batch) {
    throw new Error('Wybrana partia nie istnieje');
  }
  
  // Pobierz dane produktu z magazynu
  const inventoryItem = await getInventoryItemById(batch.itemId);
  
  return {
    stocktakingId,
    inventoryItemId: batch.itemId,
    batchId: itemData.batchId,
    name: inventoryItem.name,
    category: inventoryItem.category,
    unit: inventoryItem.unit,
    location: batch.warehouseId || inventoryItem.location || '',
    lotNumber: batch.lotNumber || '',
    batchNumber: batch.batchNumber || '',
    expiryDate: batch.expiryDate || null,
    systemQuantity: formatQuantityPrecision(batch.quantity || 0),
    countedQuantity: itemData.countedQuantity !== null && itemData.countedQuantity !== undefined 
      ? formatQuantityPrecision(itemData.countedQuantity) 
      : null,
    discrepancy: itemData.countedQuantity !== null && itemData.countedQuantity !== undefined
      ? formatQuantityPrecision(itemData.countedQuantity - (batch.quantity || 0))
      : null,
    unitPrice: batch.unitPrice || 0,
    notes: itemData.notes || '',
    status: 'Dodano',
    createdBy: userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
};

/**
 * Tworzy pozycję inwentaryzacji dla pozycji magazynowej
 * @private
 */
const createInventoryStocktakingItem = async (stocktakingId, itemData, userId) => {
  const { getInventoryItemById } = await import('./inventoryItemsService');
  
  // Pobierz aktualne dane produktu z magazynu
  const inventoryItem = await getInventoryItemById(itemData.inventoryItemId);
  
  return {
    stocktakingId,
    inventoryItemId: itemData.inventoryItemId,
    name: inventoryItem.name,
    category: inventoryItem.category,
    unit: inventoryItem.unit,
    location: inventoryItem.location,
    systemQuantity: formatQuantityPrecision(inventoryItem.quantity || 0),
    countedQuantity: itemData.countedQuantity !== null && itemData.countedQuantity !== undefined 
      ? formatQuantityPrecision(itemData.countedQuantity) 
      : null,
    discrepancy: itemData.countedQuantity !== null && itemData.countedQuantity !== undefined
      ? formatQuantityPrecision(itemData.countedQuantity - (inventoryItem.quantity || 0))
      : null,
    unitPrice: inventoryItem.averagePrice || inventoryItem.unitPrice || 0,
    notes: itemData.notes || '',
    status: 'Dodano',
    createdBy: userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
};

/**
 * Procesuje korekty stanów magazynowych z inwentaryzacji
 * @private
 */
const processStocktakingAdjustments = async (items, userId, operation = 'completion') => {
  const { updateInventoryItemQuantity } = await import('./inventoryItemsService');
  const { updateBatch } = await import('./batchService');
  
  const adjustments = {
    positive: [],
    negative: [],
    totalAdjustments: 0,
    errors: []
  };

  for (const item of items) {
    try {
      const discrepancy = item.discrepancy || 0;
      
      if (Math.abs(discrepancy) < 0.001) continue; // Pomiń minimalne różnice
      
      if (item.batchId) {
        // Korekta partii
        const newQuantity = formatQuantityPrecision((item.systemQuantity || 0) + discrepancy);
        await updateBatch(item.batchId, { quantity: newQuantity }, userId);
      } else {
        // Korekta pozycji magazynowej
        const newQuantity = formatQuantityPrecision((item.systemQuantity || 0) + discrepancy);
        await updateInventoryItemQuantity(item.inventoryItemId, newQuantity, userId);
      }

      // Dodaj transakcję korrekty
      await createInventoryAdjustmentTransaction({
        item,
        discrepancy,
        operation,
        userId
      });

      // Zapisz do statystyk
      if (discrepancy > 0) {
        adjustments.positive.push({ ...item, adjustment: discrepancy });
      } else {
        adjustments.negative.push({ ...item, adjustment: discrepancy });
      }
      
      adjustments.totalAdjustments++;
    } catch (error) {
      console.error(`Błąd podczas korekty pozycji ${item.name}:`, error);
      adjustments.errors.push({
        item: item.name,
        error: error.message
      });
    }
  }

  return adjustments;
};

/**
 * Oblicza statystyki inwentaryzacji
 * @private
 */
const calculateStocktakingStats = (items) => {
  const totalItems = items.length;
  const itemsWithDiscrepancy = items.filter(item => Math.abs(item.discrepancy || 0) > 0.001).length;
  const positiveDiscrepancies = items.filter(item => (item.discrepancy || 0) > 0.001);
  const negativeDiscrepancies = items.filter(item => (item.discrepancy || 0) < -0.001);
  
  const totalPositiveDiscrepancy = positiveDiscrepancies.reduce((sum, item) => sum + (item.discrepancy || 0), 0);
  const totalNegativeDiscrepancy = negativeDiscrepancies.reduce((sum, item) => sum + (item.discrepancy || 0), 0);
  
  const totalPositiveValue = positiveDiscrepancies.reduce((sum, item) => {
    const unitPrice = item.unitPrice || 0;
    return sum + ((item.discrepancy || 0) * unitPrice);
  }, 0);
  
  const totalNegativeValue = negativeDiscrepancies.reduce((sum, item) => {
    const unitPrice = item.unitPrice || 0;
    return sum + ((item.discrepancy || 0) * unitPrice);
  }, 0);

  return {
    totalItems,
    itemsWithDiscrepancy,
    itemsAccurate: totalItems - itemsWithDiscrepancy,
    positiveDiscrepanciesCount: positiveDiscrepancies.length,
    negativeDiscrepanciesCount: negativeDiscrepancies.length,
    totalPositiveDiscrepancy: formatQuantityPrecision(totalPositiveDiscrepancy),
    totalNegativeDiscrepancy: formatQuantityPrecision(totalNegativeDiscrepancy),
    totalPositiveValue: formatQuantityPrecision(totalPositiveValue, 2),
    totalNegativeValue: formatQuantityPrecision(totalNegativeValue, 2),
    totalValue: formatQuantityPrecision(totalPositiveValue + totalNegativeValue, 2),
    accuracyPercentage: totalItems > 0 ? ((totalItems - itemsWithDiscrepancy) / totalItems * 100) : 100
  };
};

/**
 * Tworzy transakcję związaną z inwentaryzacją
 * @private
 */
const createStocktakingTransaction = async (params) => {
  const { type, stocktakingId, stocktakingName, notes, userId, itemsCount = 0, discrepanciesCount = 0 } = params;
  
  const transactionData = {
    type,
    reason: getTransactionReason(type),
    reference: `Inwentaryzacja: ${stocktakingName || stocktakingId}`,
    notes,
    date: new Date().toISOString(),
    createdBy: userId,
    createdAt: serverTimestamp(),
    stocktakingId,
    stocktakingName,
    itemsCount,
    discrepanciesCount
  };
  
  const transactionRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_TRANSACTIONS);
  await addDoc(transactionRef, transactionData);
};

/**
 * Tworzy transakcję korekty magazynowej
 * @private
 */
const createInventoryAdjustmentTransaction = async (params) => {
  const { item, discrepancy, operation, userId } = params;
  
  const transactionData = {
    itemId: item.inventoryItemId,
    itemName: item.name,
    quantity: Math.abs(discrepancy),
    type: discrepancy > 0 ? TRANSACTION_TYPES.ADJUSTMENT_ADD : TRANSACTION_TYPES.ADJUSTMENT_REMOVE,
    reason: `Korekta z inwentaryzacji (${operation})`,
    reference: `Inwentaryzacja: ${item.stocktakingId}`,
    notes: `Korekta stanu: ${discrepancy > 0 ? '+' : ''}${formatQuantityPrecision(discrepancy)} ${item.unit}${item.batchId ? ` (partia: ${item.batchNumber || item.lotNumber})` : ''}`,
    batchId: item.batchId || null,
    batchNumber: item.batchNumber || item.lotNumber || null,
    date: new Date().toISOString(),
    createdBy: userId,
    createdAt: serverTimestamp(),
    stocktakingId: item.stocktakingId
  };
  
  const transactionRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_TRANSACTIONS);
  await addDoc(transactionRef, transactionData);
};

/**
 * Sprawdza wpływ pojedynczej korekty na rezerwacje partii
 * @param {Object} item - Element inwentaryzacji
 * @returns {Promise<Object>} - Wynik sprawdzenia z ostrzeżeniami
 * @private
 */
const checkSingleItemReservationImpact = async (item) => {
  try {
    // Sprawdź tylko jeśli to partia i ma rozbieżność
    if (!item.batchId || Math.abs(item.discrepancy || 0) < 0.001) {
      return { hasWarnings: false, warnings: [] };
    }

    const { getBatchReservations } = await import('./batchService');
    
    // Pobierz rezerwacje dla partii
    const reservations = await getBatchReservations(item.batchId);
    
    if (reservations.length === 0) {
      return { hasWarnings: false, warnings: [] };
    }
    
    // Oblicz nową ilość po korekcie
    const newQuantity = (item.systemQuantity || 0) + (item.discrepancy || 0);
    
    // Oblicz łączną ilość zarezerwowaną
    const totalReserved = reservations.reduce((sum, res) => sum + (res.quantity || 0), 0);
    
    // Sprawdź czy nowa ilość będzie mniejsza niż zarezerwowana
    if (newQuantity < totalReserved) {
      const shortage = totalReserved - newQuantity;
      
      const warning = {
        batchId: item.batchId,
        itemName: item.name,
        batchNumber: item.batchNumber || item.lotNumber || 'Bez numeru',
        currentQuantity: item.systemQuantity || 0,
        newQuantity: formatQuantityPrecision(newQuantity),
        totalReserved: formatQuantityPrecision(totalReserved),
        shortage: formatQuantityPrecision(shortage),
        unit: item.unit || 'szt.',
        reservations: reservations.map(res => ({
          taskNumber: res.taskNumber,
          moNumber: res.moNumber,
          displayName: res.taskNumber || res.moNumber || 'Zadanie nieznane',
          quantity: res.quantity || 0,
          clientName: res.clientName || 'N/A'
        }))
      };
      
      console.log(`⚠️ OSTRZEŻENIE: Partia ${warning.batchNumber} - niedobór ${shortage} ${item.unit}`);
      
      return { hasWarnings: true, warnings: [warning] };
    }
    
    return { hasWarnings: false, warnings: [] };
    
  } catch (error) {
    console.error('Błąd podczas sprawdzania rezerwacji:', error);
    return { hasWarnings: false, warnings: [], error: error.message };
  }
};

/**
 * Sprawdza wpływ korekt inwentaryzacji na rezerwacje partii
 * @param {Array} items - Elementy inwentaryzacji
 * @returns {Promise<Array>} - Lista ostrzeżeń o rezerwacjach
 */
export const checkStocktakingReservationImpact = async (items) => {
  try {
    const warnings = [];
    const { getBatchReservations } = await import('./batchService');
    
    // Filtruj tylko elementy z partiami, które mają rozbieżności
    const batchItemsWithDiscrepancies = items.filter(item => 
      item.batchId && Math.abs(item.discrepancy || 0) > 0.001
    );
    
    if (batchItemsWithDiscrepancies.length === 0) {
      return warnings;
    }
    
    console.log(`🔍 Sprawdzanie wpływu korekt na rezerwacje dla ${batchItemsWithDiscrepancies.length} partii...`);
    
    for (const item of batchItemsWithDiscrepancies) {
      try {
        // Pobierz rezerwacje dla partii
        const reservations = await getBatchReservations(item.batchId);
        
        if (reservations.length === 0) continue;
        
        // Oblicz nową ilość po korekcie
        const newQuantity = (item.systemQuantity || 0) + (item.discrepancy || 0);
        
        // Oblicz łączną ilość zarezerwowaną
        const totalReserved = reservations.reduce((sum, res) => sum + (res.quantity || 0), 0);
        
        // Sprawdź czy nowa ilość będzie mniejsza niż zarezerwowana
        if (newQuantity < totalReserved) {
          const shortage = totalReserved - newQuantity;
          
          warnings.push({
            batchId: item.batchId, // Dodane batchId
            itemName: item.name,
            batchNumber: item.batchNumber || item.lotNumber || 'Bez numeru',
            currentQuantity: item.systemQuantity || 0,
            newQuantity: formatQuantityPrecision(newQuantity),
            totalReserved: formatQuantityPrecision(totalReserved),
            shortage: formatQuantityPrecision(shortage),
            unit: item.unit || 'szt.',
            reservations: reservations.map(res => ({
              taskNumber: res.taskNumber,
              moNumber: res.moNumber,
              displayName: res.taskNumber || res.moNumber || 'Zadanie nieznane',
              quantity: res.quantity || 0,
              clientName: res.clientName || 'N/A'
            }))
          });
        }
      } catch (error) {
        console.error(`Błąd podczas sprawdzania rezerwacji dla partii ${item.batchId}:`, error);
      }
    }
    
    console.log(`⚠️ Znaleziono ${warnings.length} ostrzeżeń dotyczących rezerwacji`);
    return warnings;
    
  } catch (error) {
    console.error('Błąd podczas sprawdzania wpływu korekt na rezerwacje:', error);
    return []; // Zwróć pustą tablicę w przypadku błędu
  }
};

/**
 * Anuluje rezerwacje zagrożone przez korekty inwentaryzacji
 * @param {Array} reservationWarnings - Lista ostrzeżeń o rezerwacjach
 * @param {string} userId - ID użytkownika
 * @returns {Promise<Object>} - Wynik operacji
 */
/**
 * Aktualizuje materialBatches w zadaniach produkcyjnych po anulowaniu rezerwacji
 * @param {Array} results - Lista anulowanych rezerwacji
 * @param {string} batchId - ID partii
 * @private
 */
const updateMaterialBatchesAfterCancellation = async (results, batchId) => {
  try {
    const { getDocs, collection, updateDoc, getDoc, serverTimestamp } = await import('firebase/firestore');
    const { db } = await import('../firebase/config');
    
    // Grupuj rezerwacje według taskId
    const taskIds = [...new Set(results.map(r => r.taskId).filter(Boolean))];
    
    if (taskIds.length === 0) {
      console.log('📭 Brak zadań do aktualizacji materialBatches');
      return;
    }
    
    console.log(`🔄 Aktualizuję materialBatches w ${taskIds.length} zadaniach produkcyjnych po anulowaniu rezerwacji partii ${batchId}`);
    
    // Batch fetch tasków zamiast N+1 getDoc
    const { query: fbQuery, where: fbWhere } = await import('firebase/firestore');
    const taskDataMap = {};
    const taskChunks = [];
    for (let i = 0; i < taskIds.length; i += 30) {
      taskChunks.push(taskIds.slice(i, i + 30));
    }
    const taskResults = await Promise.all(
      taskChunks.map(chunk => {
        const q = fbQuery(collection(db, 'productionTasks'), fbWhere('__name__', 'in', chunk));
        return getDocs(q);
      })
    );
    taskResults.forEach(snap => {
      snap.docs.forEach(d => { taskDataMap[d.id] = d.data(); });
    });
    
    for (const taskId of taskIds) {
      try {
        const taskData = taskDataMap[taskId];
        
        if (!taskData) {
          console.log(`⚠️ Zadanie ${taskId} nie istnieje`);
          continue;
        }
        
        const materialBatches = { ...taskData.materialBatches } || {};
        let hasChanges = false;
        
        for (const [itemId, batches] of Object.entries(materialBatches)) {
          if (Array.isArray(batches)) {
            const filteredBatches = batches.filter(batch => batch.batchId !== batchId);
            
            if (filteredBatches.length !== batches.length) {
              hasChanges = true;
              
              if (filteredBatches.length === 0) {
                delete materialBatches[itemId];
                console.log(`🗑️ Usunięto materiał ${itemId} z zadania ${taskId} (brak partii)`);
              } else {
                materialBatches[itemId] = filteredBatches;
                console.log(`📝 Zaktualizowano partie dla materiału ${itemId} w zadaniu ${taskId}`);
              }
            }
          }
        }
        
        if (hasChanges) {
          const taskRef = FirebaseQueryBuilder.getDocRef('productionTasks', taskId);
          const hasAnyReservations = Object.keys(materialBatches).length > 0;
          
          await updateDoc(taskRef, {
            materialBatches,
            materialsReserved: hasAnyReservations,
            updatedAt: serverTimestamp(),
            updatedBy: 'system-stocktaking-cancellation'
          });
          
          console.log(`✅ Zaktualizowano materialBatches w zadaniu ${taskId}`);
        } else {
          console.log(`ℹ️ Brak zmian w materialBatches dla zadania ${taskId}`);
        }
        
      } catch (error) {
        console.error(`❌ Błąd podczas aktualizacji zadania ${taskId}:`, error);
      }
    }
    
  } catch (error) {
    console.error('❌ Błąd podczas aktualizacji materialBatches po anulowaniu rezerwacji:', error);
  }
};

/**
 * Anuluje rezerwacje na konkretnej partii
 * @param {string} batchId - ID partii
 * @param {string} userId - ID użytkownika
 * @returns {Promise<Object>} - Wynik operacji
 * @private
 */
const cancelBatchReservations = async (batchId, userId) => {
  try {
    const { writeBatch, getDocs, serverTimestamp } = await import('firebase/firestore');
    const { db } = await import('../firebase/config');
    
    // Pobierz wszystkie aktywne rezerwacje dla partii
    const reservationQuery = FirebaseQueryBuilder.buildBatchReservationsQuery(batchId, TRANSACTION_TYPES.BOOKING);
    const querySnapshot = await getDocs(reservationQuery);
    
    if (querySnapshot.empty) {
      console.log(`📭 Brak rezerwacji do anulowania dla partii ${batchId}`);
      return { cancelledCount: 0, results: [] };
    }
    
    const batch = writeBatch(db);
    let cancelledCount = 0;
    const results = [];
    
    querySnapshot.docs.forEach(doc => {
      const reservation = doc.data();
      
      // Usuń rezerwację całkowicie (tak jak przy transferze partii)
      const reservationRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY_TRANSACTIONS, doc.id);
      batch.delete(reservationRef);
      
      cancelledCount++;
      results.push({
        reservationId: doc.id,
        taskId: reservation.taskId,
        taskNumber: reservation.taskNumber || null,
        moNumber: reservation.moNumber || null,
        quantity: reservation.quantity,
        itemId: reservation.itemId,
        itemName: reservation.itemName || null,
        clientName: reservation.clientName || null,
        unit: reservation.unit || 'szt.'
      });
      
      console.log(`🗑️ Usuwam rezerwację ${doc.id} (zadanie: ${reservation.taskId}, ilość: ${reservation.quantity})`);
    });
    
    // Aktualizuj bookedQuantity w pozycjach magazynowych
    const itemUpdates = {};
    results.forEach(result => {
      if (!itemUpdates[result.itemId]) {
        itemUpdates[result.itemId] = 0;
      }
      itemUpdates[result.itemId] += result.quantity || 0;
    });
    
    // Pobierz aktualne stany pozycji i zaktualizuj bookedQuantity
    for (const [itemId, totalToReduce] of Object.entries(itemUpdates)) {
      try {
        const { getInventoryItemById } = await import('./inventoryItemsService');
        const item = await getInventoryItemById(itemId);
        
        const itemRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY, itemId);
        const currentBookedQuantity = item.bookedQuantity || 0;
        const newBookedQuantity = formatQuantityPrecision(
          Math.max(0, currentBookedQuantity - totalToReduce), 
          3
        );
        
        batch.update(itemRef, {
          bookedQuantity: newBookedQuantity,
          updatedAt: serverTimestamp(),
          updatedBy: userId
        });
        
        console.log(`📉 Redukcja bookedQuantity dla ${item.name}: ${currentBookedQuantity} → ${newBookedQuantity} (-${totalToReduce})`);
        
      } catch (error) {
        console.error(`❌ Błąd podczas aktualizacji bookedQuantity dla pozycji ${itemId}:`, error);
      }
    }
    
    // Zatwierdź wszystkie zmiany w Firebase
    await batch.commit();
    
    // Aktualizuj materialBatches w zadaniach produkcyjnych
    await updateMaterialBatchesAfterCancellation(results, batchId);
    
    return { cancelledCount, results };
    
  } catch (error) {
    console.error(`❌ Błąd podczas anulowania rezerwacji partii ${batchId}:`, error);
    throw error;
  }
};

export const cancelThreatenedReservations = async (reservationWarnings, userId) => {
  try {
    let cancelledCount = 0;
    let failedCount = 0;
    const results = [];
    
    console.log(`🚨 Anulowanie zagrożonych rezerwacji w ${reservationWarnings.length} partiach...`);
    
    for (const warning of reservationWarnings) {
      try {
        // Sprawdź czy warning ma rezerwacje
        if (!warning.reservations || warning.reservations.length === 0) {
          console.log(`⏭️ Pomijam partię ${warning.batchNumber} - brak rezerwacji do anulowania`);
          continue;
        }
        
        console.log(`🔄 Anulowanie rezerwacji dla partii ${warning.batchNumber} (${warning.batchId})`);
        
        // Anuluj wszystkie rezerwacje na tej partii
        const batchResult = await cancelBatchReservations(warning.batchId, userId);
        
        cancelledCount += batchResult.cancelledCount;
        
        results.push({
          success: true,
          batchId: warning.batchId,
          batchName: warning.batchNumber,
          reservationCount: batchResult.cancelledCount,
          reservations: batchResult.results
        });
        
        console.log(`✅ Usunięto ${batchResult.cancelledCount} rezerwacji na partii ${warning.batchNumber}`);
        
      } catch (error) {
        console.error(`❌ Błąd podczas anulowania rezerwacji dla partii ${warning.batchNumber}:`, error);
        failedCount++;
        
        results.push({
          success: false,
          batchId: warning.batchId,
          batchName: warning.batchNumber,
          error: error.message
        });
      }
    }
    
    const message = cancelledCount > 0 
      ? `Anulowano ${cancelledCount} rezerwacji. ${failedCount > 0 ? `Nie udało się anulować ${failedCount} rezerwacji.` : ''}`
      : `Nie udało się anulować żadnych rezerwacji.`;
    
    return {
      success: cancelledCount > 0,
      cancelledCount,
      failedCount,
      message,
      results
    };
    
  } catch (error) {
    console.error('Błąd podczas anulowania zagrożonych rezerwacji:', error);
    throw new Error(`Nie udało się anulować rezerwacji: ${error.message}`);
  }
};

/**
 * Generuje raport CSV z inwentaryzacji
 * @private
 */
const generateStocktakingCSVReport = (stocktaking, items, cancelledReservations = []) => {
  const stats = calculateStocktakingStats(items);
  
  const headers = [
    'Nazwa', 'Kategoria', 'Jednostka', 'Lokalizacja', 'Numer partii/LOT',
    'Data ważności', 'Stan systemowy', 'Stan liczony', 'Różnica', 'Cena jednostkowa',
    'Wartość różnicy', 'Uwagi'
  ];
  
  const csvRows = items.map(item => [
    item.name || '',
    item.category || '',
    item.unit || '',
    item.location || '',
    item.batchNumber || item.lotNumber || '',
    item.expiryDate ? formatDateToLocal(item.expiryDate) : '',
    formatQuantityPrecision(item.systemQuantity || 0),
    formatQuantityPrecision(item.countedQuantity || 0),
    formatQuantityPrecision(item.discrepancy || 0),
    formatQuantityPrecision(item.unitPrice || 0, 2),
    formatQuantityPrecision((item.discrepancy || 0) * (item.unitPrice || 0), 2),
    item.notes || ''
  ]);
  
  // Sekcja anulowanych rezerwacji
  const cancelledSection = cancelledReservations.length > 0 ? [
    '',
    '',
    'ANULOWANE REZERWACJE Z POWODU INWENTARYZACJI:',
    `Liczba anulowanych rezerwacji: ${cancelledReservations.length}`,
    '',
    'Numer partii,Numer zadania,Nazwa materialu,Ilosc,Jednostka,Klient',
    ...cancelledReservations.map(res => [
      res.batchNumber || '',
      res.taskNumber || '',
      res.materialName || '',
      formatQuantityPrecision(res.quantity || 0),
      res.unit || '',
      res.clientName || ''
    ].map(cell => 
      typeof cell === 'string' && (cell.includes(',') || cell.includes('"')) 
        ? `"${cell.replace(/"/g, '""')}"` 
        : cell
    ).join(','))
  ] : [];
  
  const csvContent = [
    `Raport inwentaryzacji: ${stocktaking.name}`,
    `Status: ${stocktaking.status}`,
    `Data wygenerowania: ${formatDateToLocal(new Date())}`,
    '',
    `Podsumowanie:`,
    `Liczba pozycji: ${stats.totalItems}`,
    `Pozycje zgodne: ${stats.itemsAccurate}`,
    `Pozycje z różnicami: ${stats.itemsWithDiscrepancy}`,
    `Wartość różnic: ${stats.totalValue} PLN`,
    cancelledReservations.length > 0 ? `Anulowane rezerwacje: ${cancelledReservations.length}` : '',
    '',
    headers.join(','),
    ...csvRows.map(row => row.map(cell => 
      typeof cell === 'string' && (cell.includes(',') || cell.includes('"')) 
        ? `"${cell.replace(/"/g, '""')}"` 
        : cell
    ).join(',')),
    ...cancelledSection
  ].filter(line => line !== '').join('\n');
  
  return {
    content: csvContent,
    filename: `inwentaryzacja_${stocktaking.name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`,
    type: 'text/csv'
  };
};

/**
 * Generuje raport PDF z inwentaryzacji
 * @private
 */
const generateStocktakingPDFReport = async (stocktaking, items, cancelledReservations = []) => {
  // Import dynamiczny jsPDF
  const { jsPDF } = await import('jspdf');
  
  const stats = calculateStocktakingStats(items);
  
  // Utwórz dokument PDF
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });
  
  // Funkcja do poprawiania polskich znaków
  const fixPolishChars = (text) => {
    if (!text) return '';
    
    return text.toString()
      .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e')
      .replace(/ł/g, 'l').replace(/ń/g, 'n').replace(/ó/g, 'o')
      .replace(/ś/g, 's').replace(/ź/g, 'z').replace(/ż/g, 'z')
      .replace(/Ą/g, 'A').replace(/Ć/g, 'C').replace(/Ę/g, 'E')
      .replace(/Ł/g, 'L').replace(/Ń/g, 'N').replace(/Ó/g, 'O')
      .replace(/Ś/g, 'S').replace(/Ź/g, 'Z').replace(/Ż/g, 'Z');
  };
  
  // Kolorowy nagłówek z tłem
  doc.setFillColor(41, 128, 185); // Niebieski
  doc.rect(10, 10, 277, 25, 'F'); // Prostokąt z wypełnieniem
  
  doc.setTextColor(255, 255, 255); // Biały tekst
  doc.setFontSize(22);
  doc.text(fixPolishChars('RAPORT INWENTARYZACJI'), 148.5, 25, { align: 'center' });
  
  // Resetuj kolor tekstu
  doc.setTextColor(0, 0, 0);
  
  // Sekcja informacji podstawowych z ramką
  doc.setDrawColor(41, 128, 185);
  doc.setLineWidth(0.5);
  doc.rect(10, 40, 135, 35); // Lewa ramka
  doc.rect(152, 40, 135, 35); // Prawa ramka
  
  // Lewa kolumna - informacje o inwentaryzacji
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.text(fixPolishChars('Informacje o inwentaryzacji:'), 15, 50);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(10);
  doc.text(fixPolishChars(`Nazwa: ${stocktaking.name}`), 15, 58);
  doc.text(fixPolishChars(`Status: ${stocktaking.status}`), 15, 65);
  doc.text(fixPolishChars(`Lokalizacja: ${stocktaking.location || 'Wszystkie lokalizacje'}`), 15, 72);
  
  // Prawa kolumna - data i czas
  const currentDate = new Date();
  const formattedDate = formatDateToLocal(currentDate);
  doc.setFont(undefined, 'bold');
  doc.text(fixPolishChars('Data i czas:'), 157, 50);
  doc.setFont(undefined, 'normal');
  doc.text(fixPolishChars(`Wygenerowano: ${formattedDate}`), 157, 58);
  doc.text(fixPolishChars(`Godzina: ${currentDate.toLocaleTimeString('pl-PL')}`), 157, 65);
  
  // Sekcja podsumowania z atrakcyjnym layoutem
  doc.setFillColor(52, 152, 219); // Jasnoniebieski
  doc.rect(10, 85, 277, 12, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont(undefined, 'bold');
  doc.text(fixPolishChars('PODSUMOWANIE INWENTARYZACJI'), 148.5, 93, { align: 'center' });
  
  // Resetuj kolory
  doc.setTextColor(0, 0, 0);
  doc.setFont(undefined, 'normal');
  
  // Ramka dla statystyk
  doc.setFillColor(247, 249, 252); // Bardzo jasny szary
  doc.rect(10, 105, 277, 35, 'F');
  doc.setDrawColor(52, 152, 219);
  doc.rect(10, 105, 277, 35);
  
  // Statystyki w trzech kolumnach
  doc.setFontSize(10);
  
  // Kolumna 1 - Ogólne
  doc.setFont(undefined, 'bold');
  doc.text(fixPolishChars('Ogolne:'), 20, 115);
  doc.setFont(undefined, 'normal');
  doc.text(fixPolishChars(`Liczba pozycji: ${stats.totalItems}`), 20, 122);
  doc.text(fixPolishChars(`Pozycje zgodne: ${stats.itemsAccurate}`), 20, 129);
  
  // Kolumna 2 - Różnice
  doc.setFont(undefined, 'bold');
  doc.text(fixPolishChars('Roznice:'), 110, 115);
  doc.setFont(undefined, 'normal');
  doc.text(fixPolishChars(`Z roznicami: ${stats.itemsWithDiscrepancy}`), 110, 122);
  doc.setTextColor(46, 125, 50); // Zielony dla nadwyżek
  doc.text(fixPolishChars(`Nadwyzki: ${stats.positiveDiscrepanciesCount}`), 110, 129);
  doc.setTextColor(211, 47, 47); // Czerwony dla braków
  doc.text(fixPolishChars(`Braki: ${stats.negativeDiscrepanciesCount}`), 110, 136);
  
  // Kolumna 3 - Wartość
  doc.setTextColor(0, 0, 0);
  doc.setFont(undefined, 'bold');
  doc.text(fixPolishChars('Wartosc finansowa:'), 200, 115);
  doc.setFont(undefined, 'normal');
  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  const totalValueColor = stats.totalValue >= 0 ? [46, 125, 50] : [211, 47, 47];
  doc.setTextColor(...totalValueColor);
  doc.text(fixPolishChars(`${stats.totalValue >= 0 ? '+' : ''}${stats.totalValue.toFixed(2)} PLN`), 200, 125);
  
  // Resetuj kolory przed tabelą
  doc.setTextColor(0, 0, 0);
  doc.setFont(undefined, 'normal');
  
  // Przygotuj dane tabeli - tylko pozycje z różnicami
  const discrepancyItems = items.filter(item => Math.abs(item.discrepancy || 0) > 0.001);
  
  if (discrepancyItems.length > 0) {
    // Nagłówek tabeli
    doc.setFillColor(41, 128, 185);
    doc.rect(10, 150, 277, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(fixPolishChars('SZCZEGOLY POZYCJI Z ROZNICAMI'), 148.5, 157, { align: 'center' });
    
    // Resetuj kolory
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'normal');
    
    // Import dynamiczny jspdf-autotable
    const autoTable = (await import('jspdf-autotable')).default;
    
    const tableData = discrepancyItems.map(item => [
      fixPolishChars(item.name || ''),
      fixPolishChars(item.category || ''),
      fixPolishChars(item.unit || ''),
      formatQuantityPrecision(item.systemQuantity || 0),
      formatQuantityPrecision(item.countedQuantity || 0),
      formatQuantityPrecision(item.discrepancy || 0),
      formatQuantityPrecision((item.discrepancy || 0) * (item.unitPrice || 0), 2)
    ]);
    
    autoTable(doc, {
      head: [[
        fixPolishChars('Nazwa produktu'),
        fixPolishChars('Kategoria'),
        fixPolishChars('Jedn.'),
        fixPolishChars('Stan syst.'),
        fixPolishChars('Stan licz.'),
        fixPolishChars('Roznica'),
        fixPolishChars('Wart. rozn.')
      ]],
      body: tableData,
      startY: 165,
      theme: 'striped',
      headStyles: { 
        fillColor: [41, 128, 185],
        textColor: [255, 255, 255],
        fontSize: 9,
        fontStyle: 'bold',
        halign: 'center'
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [33, 37, 41]
      },
      alternateRowStyles: { 
        fillColor: [248, 249, 250] 
      },
      columnStyles: {
        0: { cellWidth: 45, halign: 'left' },
        1: { cellWidth: 30, halign: 'center' },
        2: { cellWidth: 15, halign: 'center' },
        3: { cellWidth: 25, halign: 'right' },
        4: { cellWidth: 25, halign: 'right' },
        5: { cellWidth: 25, halign: 'right', fontStyle: 'bold' },
        6: { cellWidth: 30, halign: 'right', fontStyle: 'bold' }
      },
      didParseCell: function(data) {
        // Kolorowanie komórek z różnicami
        if (data.column.index === 5 || data.column.index === 6) { // Kolumny różnic i wartości
          const cellValue = parseFloat(data.cell.text[0]);
          if (cellValue > 0) {
            data.cell.styles.textColor = [46, 125, 50]; // Zielony dla nadwyżek
          } else if (cellValue < 0) {
            data.cell.styles.textColor = [211, 47, 47]; // Czerwony dla braków
          }
        }
      },
      margin: { top: 10, right: 10, bottom: 10, left: 10 },
      tableLineWidth: 0.1,
      tableLineColor: [189, 195, 199]
    });
  } else {
    // Komunikat o braku różnic
    doc.setFillColor(229, 245, 224); // Jasny zielony
    doc.rect(10, 150, 277, 20, 'F');
    doc.setDrawColor(46, 125, 50);
    doc.rect(10, 150, 277, 20);
    doc.setTextColor(46, 125, 50);
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(fixPolishChars('Gratulacje! Brak pozycji z roznicami'), 148.5, 162, { align: 'center' });
  }
  
  // Sekcja anulowanych rezerwacji
  if (cancelledReservations.length > 0) {
    // Dodaj nową stronę jeśli potrzeba
    const currentY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 20 : 180;
    
    if (currentY > 170) {
      doc.addPage();
    }
    
    const startY = currentY > 170 ? 20 : currentY;
    
    // Nagłówek sekcji
    doc.setFillColor(211, 47, 47); // Czerwony - ostrzegawczy
    doc.rect(10, startY, 277, 12, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(fixPolishChars('ANULOWANE REZERWACJE Z POWODU INWENTARYZACJI'), 148.5, startY + 8, { align: 'center' });
    
    // Resetuj kolory
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'normal');
    
    // Informacja o liczbie anulowanych rezerwacji
    doc.setFillColor(255, 243, 224); // Jasny pomarańczowy
    doc.rect(10, startY + 14, 277, 10, 'F');
    doc.setFontSize(10);
    doc.text(fixPolishChars(`Liczba anulowanych rezerwacji: ${cancelledReservations.length}`), 15, startY + 21);
    
    // Tabela anulowanych rezerwacji
    const autoTableCancelled = (await import('jspdf-autotable')).default;
    
    const cancelledTableData = cancelledReservations.map(res => [
      fixPolishChars(res.batchNumber || ''),
      fixPolishChars(res.taskNumber || ''),
      fixPolishChars(res.materialName || ''),
      formatQuantityPrecision(res.quantity || 0),
      fixPolishChars(res.unit || ''),
      fixPolishChars(res.clientName || 'N/A')
    ]);
    
    autoTableCancelled(doc, {
      head: [[
        fixPolishChars('Nr partii'),
        fixPolishChars('Nr zadania'),
        fixPolishChars('Material'),
        fixPolishChars('Ilosc'),
        fixPolishChars('Jedn.'),
        fixPolishChars('Klient')
      ]],
      body: cancelledTableData,
      startY: startY + 28,
      theme: 'striped',
      headStyles: { 
        fillColor: [211, 47, 47], // Czerwony
        textColor: [255, 255, 255],
        fontSize: 9,
        fontStyle: 'bold',
        halign: 'center'
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [33, 37, 41]
      },
      alternateRowStyles: { 
        fillColor: [255, 235, 238] // Jasny czerwony
      },
      columnStyles: {
        0: { cellWidth: 40, halign: 'center' },
        1: { cellWidth: 40, halign: 'center' },
        2: { cellWidth: 70, halign: 'left' },
        3: { cellWidth: 30, halign: 'right' },
        4: { cellWidth: 20, halign: 'center' },
        5: { cellWidth: 55, halign: 'left' }
      },
      margin: { top: 10, right: 10, bottom: 20, left: 10 },
      tableLineWidth: 0.1,
      tableLineColor: [189, 195, 199]
    });
  }
  
  // Dodaj stopkę na każdej stronie
  const pageCount = doc.internal.getNumberOfPages();
  for(let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    
    // Linia separacyjna
    doc.setDrawColor(189, 195, 199);
    doc.setLineWidth(0.5);
    doc.line(10, 200, 287, 200);
    
    // Stopka
    doc.setFontSize(8);
    doc.setTextColor(108, 117, 125);
    doc.setFont(undefined, 'normal');
    doc.text(fixPolishChars('System MRP - Raport Inwentaryzacji'), 15, 207);
    doc.text(fixPolishChars(`Strona ${i} z ${pageCount}`), 260, 207);
    doc.text(fixPolishChars(`Wygenerowano: ${new Date().toLocaleString('pl-PL')}`), 15, 212);
  }
  
  return {
    content: doc.output('blob'),
    filename: `inwentaryzacja_${stocktaking.name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`,
    type: 'application/pdf'
  };
};

/**
 * Zapisuje informacje o anulowanych rezerwacjach do dokumentu inwentaryzacji
 * @param {string} stocktakingId - ID inwentaryzacji
 * @param {Object} cancellationResults - Wyniki anulowania rezerwacji z cancelThreatenedReservations
 * @param {string} userId - ID użytkownika
 * @returns {Promise<Object>} - Wynik operacji
 */
export const saveCancelledReservationsToStocktaking = async (stocktakingId, cancellationResults, userId) => {
  try {
    const validatedId = validateId(stocktakingId, 'stocktakingId');
    const validatedUserId = validateId(userId, 'userId');
    
    const stocktakingRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY_STOCKTAKING, validatedId);
    
    // Przygotuj dane do zapisania - pobierz szczegóły z wyników anulowania
    const cancelledReservationsData = cancellationResults.results
      .filter(result => result.success)
      .flatMap(result => result.reservations.map(res => ({
        batchId: result.batchId,
        batchNumber: result.batchName || 'Nieznana',
        taskId: res.taskId || null,
        taskNumber: res.taskNumber || res.moNumber || 'Nieznane',
        materialName: res.itemName || 'Nieznany materiał',
        quantity: res.quantity || 0,
        unit: res.unit || 'szt.',
        clientName: res.clientName || 'N/A',
        cancelledAt: new Date().toISOString()
      })));
    
    await updateDoc(stocktakingRef, {
      cancelledReservations: cancelledReservationsData,
      cancelledReservationsCount: cancellationResults.cancelledCount || 0,
      reservationsCancelledAt: serverTimestamp(),
      reservationsCancelledBy: validatedUserId,
      updatedAt: serverTimestamp(),
      updatedBy: validatedUserId
    });
    
    console.log(`✅ Zapisano ${cancelledReservationsData.length} anulowanych rezerwacji do inwentaryzacji ${validatedId}`);
    
    return { success: true, savedCount: cancelledReservationsData.length };
  } catch (error) {
    console.error('Błąd podczas zapisywania anulowanych rezerwacji:', error);
    throw new Error(`Nie udało się zapisać anulowanych rezerwacji: ${error.message}`);
  }
};

/**
 * Zwraca opis powodu transakcji na podstawie typu
 * @private
 */
const getTransactionReason = (type) => {
  const reasons = {
    [TRANSACTION_TYPES.STOCKTAKING_REOPEN]: 'Ponowne otwarcie inwentaryzacji',
    [TRANSACTION_TYPES.STOCKTAKING_CORRECTION_COMPLETED]: 'Zakończenie korekty inwentaryzacji',
    [TRANSACTION_TYPES.STOCKTAKING_DELETION]: 'Usunięcie inwentaryzacji',
    [TRANSACTION_TYPES.STOCKTAKING_COMPLETED]: 'Zakończenie inwentaryzacji'
  };
  
  return reasons[type] || 'Operacja inwentaryzacyjna';
};

// ===== FUNKCJE ZAŁĄCZNIKÓW INWENTARYZACJI =====

/**
 * Przesyła załącznik do inwentaryzacji
 * @param {File} file - Plik do przesłania
 * @param {string} stocktakingId - ID inwentaryzacji
 * @param {string} userId - ID użytkownika
 * @returns {Promise<Object>} - Dane przesłanego załącznika
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const uploadStocktakingAttachment = async (file, stocktakingId, userId) => {
  try {
    const validatedId = validateId(stocktakingId, 'stocktakingId');
    const validatedUserId = validateId(userId, 'userId');

    // Dynamiczny import funkcji uploadFileToStorage
    const { uploadFileToStorage } = await import('../firebase/config');

    // Przygotuj ścieżkę w Storage
    const storagePath = `stocktaking/${validatedId}/attachments`;
    
    // Prześlij plik do Firebase Storage
    const uploadResult = await uploadFileToStorage(file, storagePath);
    
    // Utwórz obiekt załącznika
    const attachment = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      fileName: file.name,
      originalName: file.name,
      size: file.size,
      contentType: file.type,
      storagePath: uploadResult.fullPath || uploadResult.name,
      downloadURL: uploadResult.downloadUrl,
      uploadedAt: new Date().toISOString(),
      uploadedBy: validatedUserId,
      description: ''
    };
    
    console.log(`✅ Przesłano załącznik "${file.name}" do inwentaryzacji ${validatedId}`);
    
    return attachment;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas przesyłania załącznika inwentaryzacji:', error);
    throw new Error(`Nie udało się przesłać załącznika: ${error.message}`);
  }
};

/**
 * Usuwa załącznik z inwentaryzacji
 * @param {Object} attachment - Obiekt załącznika do usunięcia
 * @returns {Promise<boolean>} - Czy usunięcie się powiodło
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const deleteStocktakingAttachment = async (attachment) => {
  try {
    if (attachment.storagePath) {
      // Dynamiczny import funkcji deleteFileFromStorage
      const { deleteFileFromStorage } = await import('../firebase/config');
      await deleteFileFromStorage(attachment.storagePath);
      console.log(`🗑️ Usunięto załącznik "${attachment.fileName}" z Firebase Storage`);
    }
    return true;
  } catch (error) {
    console.error('Błąd podczas usuwania załącznika inwentaryzacji:', error);
    throw new Error(`Nie udało się usunąć załącznika: ${error.message}`);
  }
};

/**
 * Aktualizuje załączniki inwentaryzacji w bazie danych
 * @param {string} stocktakingId - ID inwentaryzacji
 * @param {Array} attachments - Lista załączników
 * @param {string} userId - ID użytkownika
 * @returns {Promise<void>}
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const updateStocktakingAttachments = async (stocktakingId, attachments, userId) => {
  try {
    const validatedId = validateId(stocktakingId, 'stocktakingId');
    const validatedUserId = validateId(userId, 'userId');

    const stocktakingRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY_STOCKTAKING, validatedId);
    
    // Sprawdź czy inwentaryzacja istnieje
    const stocktakingDoc = await getDoc(stocktakingRef);
    if (!stocktakingDoc.exists()) {
      throw new Error(`Nie znaleziono inwentaryzacji o ID ${validatedId}`);
    }
    
    await updateDoc(stocktakingRef, {
      attachments: attachments || [],
      updatedAt: serverTimestamp(),
      updatedBy: validatedUserId
    });
    
    console.log(`✅ Zaktualizowano załączniki inwentaryzacji ${validatedId} (${attachments?.length || 0} załączników)`);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas aktualizacji załączników inwentaryzacji:', error);
    throw new Error(`Nie udało się zaktualizować załączników: ${error.message}`);
  }
};

// ===== ARKUSZ SPISU Z NATURY - PDF =====

/**
 * Wzbogaca pozycje inwentaryzacji o kursy walut z NBP i przeliczone wartości PLN
 * @param {Array} items - Pozycje inwentaryzacji
 * @returns {Promise<Array>} - Pozycje wzbogacone o dane kursowe
 * @private
 */
const enrichStocktakingItemsWithExchangeRates = async (items) => {
  try {
    const { getPurchaseOrderById } = await import('../purchaseOrders');
    const { getExchangeRate } = await import('../finance');
    const { getBatchById } = await import('./batchService');
    
    // Cache dla kursów (unikalne daty) - klucz: "currency_YYYY-MM-DD"
    const exchangeRatesCache = {};
    // Cache dla danych PO
    const poDataCache = {};
    
    const enrichedItems = [];
    
    for (const item of items) {
      let enrichedItem = { ...item };
      
      // Domyślne wartości dla kolumn PLN
      enrichedItem.currency = 'EUR';
      enrichedItem.exchangeRate = null;
      enrichedItem.exchangeRateDate = null;
      enrichedItem.unitPricePLN = null;
      enrichedItem.valuePLN = null;
      enrichedItem.poNumber = null;
      
      // Tylko dla pozycji z batchId
      if (item.batchId) {
        try {
          // 1. Pobierz dane partii
          const batch = await getBatchById(item.batchId);
          const poId = batch?.purchaseOrderDetails?.id || batch?.sourceDetails?.orderId;
          
          if (poId) {
            // 2. Pobierz dane PO (z cache)
            if (!poDataCache[poId]) {
              try {
                poDataCache[poId] = await getPurchaseOrderById(poId);
              } catch (poError) {
                console.warn(`Nie udało się pobrać PO ${poId}:`, poError.message);
                poDataCache[poId] = null;
              }
            }
            const po = poDataCache[poId];
            
            if (po) {
              // 3. Ustal datę dla kursu - dzień POPRZEDZAJĄCY datę zamówienia/faktury
              // Zgodnie z polskim prawem podatkowym: kurs średni NBP z ostatniego dnia roboczego
              // poprzedzającego dzień wystawienia faktury (art. 31a ust. 1 ustawy o VAT)
              let invoiceDate = new Date();
              if (po.orderDate) {
                invoiceDate = typeof po.orderDate === 'string' 
                  ? new Date(po.orderDate) 
                  : (po.orderDate.toDate ? po.orderDate.toDate() : new Date(po.orderDate));
              }
              
              // Kurs z dnia poprzedzającego datę faktury
              const rateDate = new Date(invoiceDate);
              rateDate.setDate(rateDate.getDate() - 1);
              
              const currency = po.currency || 'EUR';
              enrichedItem.currency = currency;
              enrichedItem.poNumber = po.number || null;
              
              // 4. Pobierz kurs EUR/PLN (z cache) - tylko jeśli waluta != PLN
              // exchangeRateService automatycznie znajdzie ostatni dostępny kurs
              // jeśli podana data przypada na weekend/święto
              if (currency !== 'PLN') {
                const dateStr = rateDate.toISOString().split('T')[0];
                const cacheKey = `${currency}_${dateStr}`;
                
                if (exchangeRatesCache[cacheKey] === undefined) {
                  try {
                    exchangeRatesCache[cacheKey] = await getExchangeRate(currency, 'PLN', rateDate);
                    console.log(`📈 Pobrano kurs ${currency}/PLN dla ${dateStr}: ${exchangeRatesCache[cacheKey]}`);
                  } catch (rateError) {
                    console.warn(`Nie udało się pobrać kursu ${currency}/PLN dla ${dateStr}:`, rateError.message);
                    exchangeRatesCache[cacheKey] = null;
                  }
                }
                
                const exchangeRate = exchangeRatesCache[cacheKey];
                
                if (exchangeRate !== null) {
                  // 5. Przelicz wartości
                  const unitPriceEUR = item.unitPrice || 0;
                  const unitPricePLN = unitPriceEUR * exchangeRate;
                  const countedQty = item.countedQuantity || 0;
                  const valuePLN = countedQty * unitPricePLN;
                  
                  enrichedItem.exchangeRate = exchangeRate;
                  enrichedItem.exchangeRateDate = rateDate;
                  enrichedItem.unitPricePLN = unitPricePLN;
                  enrichedItem.valuePLN = valuePLN;
                }
              } else {
                // Waluta już jest PLN - kurs 1:1
                enrichedItem.exchangeRate = 1;
                enrichedItem.exchangeRateDate = rateDate;
                enrichedItem.unitPricePLN = item.unitPrice || 0;
                enrichedItem.valuePLN = (item.countedQuantity || 0) * (item.unitPrice || 0);
              }
            }
          }
        } catch (error) {
          console.warn(`Nie udało się wzbogacić pozycji ${item.name} o dane kursowe:`, error.message);
        }
      }
      
      enrichedItems.push(enrichedItem);
    }
    
    console.log(`✅ Wzbogacono ${enrichedItems.length} pozycji o dane kursowe NBP`);
    return enrichedItems;
    
  } catch (error) {
    console.error('Błąd podczas wzbogacania pozycji o kursy walut:', error);
    // W przypadku błędu zwróć oryginalne pozycje
    return items;
  }
};

/**
 * Generuje PDF "Arkusz spisu z natury" zgodny z polskim wzorem
 * @param {Object} stocktaking - Dane inwentaryzacji
 * @param {Array} items - Pozycje inwentaryzacji
 * @param {Object} options - Opcje raportu
 * @returns {Promise<Object>} - Blob PDF i nazwa pliku
 */
export const generateStocktakingSheetPDF = async (stocktaking, items, options = {}) => {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  
  const {
    companyData = {},
    stocktakingArea = '',       // Nazwa lub numer pola spisowego
    stocktakingSubject = '',    // Przedmiot spisu
    responsiblePerson = '',     // Osoba odpowiedzialna materialnie
    committeeMembers = [],      // Skład zespołu spisowego
    otherPersons = [],          // Inne osoby obecne przy spisie
    stocktakingDate = null,     // Spis z natury na dzień
    startDate = null,           // Spis rozpoczęto dnia
    startTime = '',             // o godz.
    endDate = null,             // Spis zakończono dnia
    endTime = '',               // o godz.
    valuedBy = ''               // Wycenił
  } = options;
  
  // Wzbogać pozycje o kursy walut NBP i wartości w PLN
  console.log('📊 Rozpoczynam wzbogacanie pozycji o kursy walut NBP...');
  const enrichedItems = await enrichStocktakingItemsWithExchangeRates(items);
  
  // Utwórz dokument A4 poziomy (landscape) dla lepszego dopasowania tabeli z kolumną Uwagi
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
    compress: true
  });
  
  const pageWidth = doc.internal.pageSize.getWidth();   // 297mm w landscape
  const pageHeight = doc.internal.pageSize.getHeight(); // 210mm w landscape
  const margin = 10;
  const contentWidth = pageWidth - 2 * margin; // 277mm dostępne
  
  // Funkcja do poprawiania polskich znaków (fallback gdy nie ma fontu)
  const fixPolishChars = (text) => {
    if (!text) return '';
    return text.toString()
      .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e')
      .replace(/ł/g, 'l').replace(/ń/g, 'n').replace(/ó/g, 'o')
      .replace(/ś/g, 's').replace(/ź/g, 'z').replace(/ż/g, 'z')
      .replace(/Ą/g, 'A').replace(/Ć/g, 'C').replace(/Ę/g, 'E')
      .replace(/Ł/g, 'L').replace(/Ń/g, 'N').replace(/Ó/g, 'O')
      .replace(/Ś/g, 'S').replace(/Ź/g, 'Z').replace(/Ż/g, 'Z');
  };
  
  // Funkcja formatowania daty
  const formatDateValue = (date) => {
    if (!date) return '....................';
    try {
      const d = date.seconds ? new Date(date.seconds * 1000) : new Date(date);
      return d.toLocaleDateString('pl-PL');
    } catch {
      return '....................';
    }
  };
  
  // Funkcja do rysowania linii przerywanej
  const drawDottedLine = (x1, y, x2) => {
    doc.setDrawColor(100);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(x1, y, x2, y);
    doc.setLineDashPattern([], 0);
  };
  
  // Funkcja do rysowania pola z etykietą i linią
  const drawField = (label, value, x, y, width) => {
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.text(fixPolishChars(label), x, y);
    const labelWidth = doc.getTextWidth(fixPolishChars(label));
    if (value && value !== '....................') {
      doc.text(fixPolishChars(value), x + labelWidth + 2, y);
    }
    drawDottedLine(x + labelWidth + 2 + (value && value !== '....................' ? doc.getTextWidth(fixPolishChars(value)) + 2 : 0), y + 0.5, x + width);
    return y + 7;
  };
  
  // Oblicz liczbę stron (pozycje na stronę) - landscape ma mniej wysokości
  // Limity pozycji na stronę (10 kolumn z EUR i PLN)
  const itemsPerFirstPage = 6;  // Mniej pozycji na pierwszej stronie (sekcja info)
  const itemsPerNextPage = 16;  // Więcej pozycji na kolejnych stronach
  
  let totalPages = 1;
  if (enrichedItems.length > itemsPerFirstPage) {
    totalPages = 1 + Math.ceil((enrichedItems.length - itemsPerFirstPage) / itemsPerNextPage);
  }
  
  // Funkcja do rysowania nagłówka strony
  const drawPageHeader = (pageNum) => {
    let y = margin;
    
    // Linia 1: Nazwa jednostki i numer strony
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    
    // Nazwa firmy po lewej
    if (companyData?.name) {
      doc.text(fixPolishChars(companyData.name), margin, y + 4);
    }
    drawDottedLine(margin, y + 5, margin + 70);
    doc.text('(nazwa jednostki)', margin + 20, y + 9);
    
    doc.setFontSize(10);
    doc.text(fixPolishChars(`strona nr ${pageNum}`), pageWidth - margin - 25, y + 4);
    
    y += 18;
    
    // Tytuł: Arkusz spisu z natury nr
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    const sheetNumber = stocktaking.name || stocktaking.id?.substring(0, 8) || '...........';
    doc.text(fixPolishChars(`Arkusz spisu z natury nr ${sheetNumber}`), pageWidth / 2, y, { align: 'center' });
    
    y += 12;
    
    return y;
  };
  
  // Funkcja do rysowania sekcji informacyjnej (tylko na pierwszej stronie)
  const drawInfoSection = (startY) => {
    let y = startY;
    const halfWidth = contentWidth / 2 - 5;
    
    // Nazwa lub numer pola spisowego
    const areaValue = stocktakingArea || stocktaking.location || '';
    y = drawField('Nazwa lub numer pola spisowego ', areaValue, margin, y, contentWidth);
    
    // Przedmiot spisu
    const subjectValue = stocktakingSubject || stocktaking.description || '';
    y = drawField('Przedmiot spisu ', subjectValue, margin, y, contentWidth);
    
    // Osoba odpowiedzialna materialnie
    y = drawField('Osoba odpowiedzialna materialnie ', responsiblePerson, margin, y, contentWidth);
    
    y += 3;
    
    // Dwie kolumny: Skład zespołu i Inne osoby
    doc.setFontSize(9);
    doc.setFont(undefined, 'bold');
    doc.text(fixPolishChars('Sklad zespolu spisowego:'), margin, y);
    doc.text(fixPolishChars('Inne osoby obecne przy spisie:'), margin + halfWidth + 10, y);
    
    doc.setFontSize(8);
    doc.setFont(undefined, 'italic');
    doc.text('(imie, nazwisko)', margin, y + 4);
    doc.text('(imie, nazwisko)', margin + halfWidth + 10, y + 4);
    
    y += 8;
    
    // Linie na podpisy (4 linie dla każdej kolumny)
    for (let i = 0; i < 4; i++) {
      // Wypełnij danymi jeśli są
      if (committeeMembers[i]) {
        doc.setFontSize(8);
        doc.setFont(undefined, 'normal');
        doc.text(fixPolishChars(committeeMembers[i]), margin, y + 3);
      }
      if (otherPersons[i]) {
        doc.setFontSize(8);
        doc.setFont(undefined, 'normal');
        doc.text(fixPolishChars(otherPersons[i]), margin + halfWidth + 10, y + 3);
      }
      drawDottedLine(margin, y + 5, margin + halfWidth);
      drawDottedLine(margin + halfWidth + 10, y + 5, pageWidth - margin);
      y += 8;
    }
    
    // Spis z natury na dzień
    y += 3;
    const stockDateValue = formatDateValue(stocktakingDate || stocktaking.scheduledDate);
    y = drawField('Spis z natury na dzien ', stockDateValue, margin, y, contentWidth);
    
    // Dwie kolumny: rozpoczęto/zakończono
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    
    const startDateValue = formatDateValue(startDate || stocktaking.createdAt);
    const endDateValue = formatDateValue(endDate || stocktaking.completedAt);
    
    doc.text(fixPolishChars('Spis rozpoczeto dnia '), margin, y);
    const startLabel = doc.getTextWidth(fixPolishChars('Spis rozpoczeto dnia '));
    doc.text(startDateValue !== '....................' ? startDateValue : '', margin + startLabel, y);
    drawDottedLine(margin + startLabel + (startDateValue !== '....................' ? doc.getTextWidth(startDateValue) + 2 : 0), y + 0.5, margin + halfWidth - 30);
    doc.text(fixPolishChars(' o godz. '), margin + halfWidth - 30, y);
    doc.text(startTime || '', margin + halfWidth - 10, y);
    drawDottedLine(margin + halfWidth - 10 + (startTime ? doc.getTextWidth(startTime) + 2 : 0), y + 0.5, margin + halfWidth);
    
    doc.text(fixPolishChars('Spis zakonczono dnia '), margin + halfWidth + 10, y);
    const endLabel = doc.getTextWidth(fixPolishChars('Spis zakonczono dnia '));
    doc.text(endDateValue !== '....................' ? endDateValue : '', margin + halfWidth + 10 + endLabel, y);
    drawDottedLine(margin + halfWidth + 10 + endLabel + (endDateValue !== '....................' ? doc.getTextWidth(endDateValue) + 2 : 0), y + 0.5, pageWidth - margin - 40);
    doc.text(fixPolishChars(' o godz. '), pageWidth - margin - 40, y);
    doc.text(endTime || '', pageWidth - margin - 20, y);
    drawDottedLine(pageWidth - margin - 20 + (endTime ? doc.getTextWidth(endTime) + 2 : 0), y + 0.5, pageWidth - margin);
    
    y += 10;
    
    return y;
  };
  
  // Funkcja do rysowania stopki strony
  const drawPageFooter = (isLastPage, lastItemNumber) => {
    let y = pageHeight - 62; // Przesunięte wyżej dla landscape (210mm wysokości)
    const halfWidth = contentWidth / 2 - 5;
    
    if (isLastPage) {
      // Spis zakończono na pozycji
      y = drawField('Spis zakonczono na pozycji ', lastItemNumber.toString(), margin, y, halfWidth);
      
      y += 3;
      
      // Dwie kolumny: Podpisy zespołu i Podpis osoby odpowiedzialnej
      doc.setFontSize(8);
      doc.setFont(undefined, 'bold');
      doc.text(fixPolishChars('Podpisy czlonkow zespolu spisowego:'), margin, y);
      doc.text(fixPolishChars('Podpis osoby odpowiedzialnej materialnie oraz jej'), margin + halfWidth + 10, y);
      y += 3;
      doc.text(fixPolishChars('ewentualne uwagi (zastrzezenia):'), margin + halfWidth + 10, y);
      
      y += 4;
      
      // Linie na podpisy (3 linie dla każdej kolumny - zmniejszone z 4)
      for (let i = 0; i < 3; i++) {
        drawDottedLine(margin, y + 4, margin + halfWidth);
        drawDottedLine(margin + halfWidth + 10, y + 4, pageWidth - margin);
        y += 7;
      }
      
      y += 3;
      
      // Wycenił
      doc.setFontSize(8);
      doc.setFont(undefined, 'bold');
      doc.text(fixPolishChars('Wycenil:'), margin, y);
      if (valuedBy) {
        doc.setFont(undefined, 'normal');
        doc.text(fixPolishChars(valuedBy), margin + 20, y);
      }
      y += 5;
      drawDottedLine(margin, y, margin + halfWidth);
    }
  };
  
  // Generuj strony
  let itemIndex = 0;
  let pageNum = 0;
  
  while (itemIndex < enrichedItems.length || pageNum === 0) {
    if (pageNum > 0) {
      doc.addPage();
    }
    
    pageNum++;
    let y = drawPageHeader(pageNum);
    
    // Sekcja informacyjna tylko na pierwszej stronie
    if (pageNum === 1) {
      y = drawInfoSection(y);
    }
    
    // Oblicz ile pozycji na tej stronie
    const itemsOnThisPage = pageNum === 1 ? itemsPerFirstPage : itemsPerNextPage;
    const startIdx = itemIndex;
    const endIdx = Math.min(startIdx + itemsOnThisPage, enrichedItems.length);
    const pageItems = enrichedItems.slice(startIdx, endIdx);
    
    // Przygotuj dane tabeli z kolumnami EUR i PLN
    const tableData = pageItems.map((item, idx) => [
      startIdx + idx + 1, // Poz.
      fixPolishChars(item.lotNumber || item.batchNumber || '-'), // Symbol/LOT
      fixPolishChars(item.name || ''), // Nazwa składnika
      fixPolishChars(item.unit || 'szt.'), // J.m.
      item.countedQuantity !== null && item.countedQuantity !== undefined 
        ? item.countedQuantity.toString() 
        : '', // Ilość
      item.unitPrice ? item.unitPrice.toFixed(2) : '-', // Cena EUR
      item.countedQuantity !== null && item.unitPrice 
        ? (item.countedQuantity * item.unitPrice).toFixed(2) 
        : '', // Wartość EUR
      item.unitPricePLN !== null ? item.unitPricePLN.toFixed(2) : '-', // Cena PLN
      item.valuePLN !== null ? item.valuePLN.toFixed(2) : '-', // Wartość PLN
      fixPolishChars(item.notes || '') // Uwagi
    ]);
    
    // Rysuj tabelę tylko jeśli są pozycje
    if (tableData.length > 0) {
      autoTable(doc, {
        head: [[
          { content: 'Poz.', styles: { halign: 'center' } },
          { content: fixPolishChars('Symbol/LOT'), styles: { halign: 'center' } },
          { content: fixPolishChars('Nazwa skladnika'), styles: { halign: 'left' } },
          { content: 'J.m.', styles: { halign: 'center' } },
          { content: fixPolishChars('Ilosc'), styles: { halign: 'right' } },
          { content: fixPolishChars('Cena EUR'), styles: { halign: 'right' } },
          { content: fixPolishChars('Wart. EUR'), styles: { halign: 'right' } },
          { content: fixPolishChars('Cena PLN'), styles: { halign: 'right' } },
          { content: fixPolishChars('Wart. PLN'), styles: { halign: 'right' } },
          { content: 'Uwagi', styles: { halign: 'left' } }
        ]],
        body: tableData,
        startY: y,
        theme: 'grid',
        headStyles: {
          fillColor: [240, 240, 240],
          textColor: [0, 0, 0],
          fontSize: 6,
          fontStyle: 'bold',
          lineWidth: 0.3,
          lineColor: [0, 0, 0]
        },
        bodyStyles: {
          fontSize: 6,
          textColor: [0, 0, 0],
          lineWidth: 0.2,
          lineColor: [100, 100, 100],
          minCellHeight: 5
        },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },   // Poz.
          1: { cellWidth: 32, halign: 'center' },   // Symbol/LOT
          2: { cellWidth: 55, halign: 'left' },     // Nazwa składnika
          3: { cellWidth: 14, halign: 'center' },   // J.m.
          4: { cellWidth: 20, halign: 'right' },    // Ilość
          5: { cellWidth: 24, halign: 'right' },    // Cena EUR
          6: { cellWidth: 26, halign: 'right' },    // Wartość EUR
          7: { cellWidth: 24, halign: 'right' },    // Cena PLN
          8: { cellWidth: 26, halign: 'right' },    // Wartość PLN
          9: { cellWidth: 46, halign: 'left' }      // Uwagi
        },
        margin: { left: margin, right: margin },
        tableWidth: 'auto',
        tableLineWidth: 0.2,
        tableLineColor: [0, 0, 0]
      });
    }
    
    itemIndex = endIdx;
    
    // Stopka na ostatniej stronie
    const isLastPage = itemIndex >= enrichedItems.length;
    if (isLastPage) {
      drawPageFooter(true, enrichedItems.length);
    }
    
    // Wyjście z pętli jeśli wszystkie pozycje przetworzone
    if (isLastPage) break;
  }
  
  // Jeśli nie ma pozycji, dodaj pustą tabelę
  if (enrichedItems.length === 0) {
    const y = drawInfoSection(drawPageHeader(1));
    
    autoTable(doc, {
      head: [[
        { content: 'Poz.', styles: { halign: 'center' } },
        { content: fixPolishChars('Symbol/LOT'), styles: { halign: 'center' } },
        { content: fixPolishChars('Nazwa skladnika'), styles: { halign: 'left' } },
        { content: 'J.m.', styles: { halign: 'center' } },
        { content: fixPolishChars('Ilosc'), styles: { halign: 'right' } },
        { content: fixPolishChars('Cena EUR'), styles: { halign: 'right' } },
        { content: fixPolishChars('Wart. EUR'), styles: { halign: 'right' } },
        { content: fixPolishChars('Cena PLN'), styles: { halign: 'right' } },
        { content: fixPolishChars('Wart. PLN'), styles: { halign: 'right' } },
        { content: 'Uwagi', styles: { halign: 'left' } }
      ]],
      body: [['', '', '', '', '', '', '', '', '', '']],
      startY: y,
      theme: 'grid',
      headStyles: {
        fillColor: [240, 240, 240],
        textColor: [0, 0, 0],
        fontSize: 6,
        fontStyle: 'bold',
        lineWidth: 0.3,
        lineColor: [0, 0, 0]
      },
      bodyStyles: {
        fontSize: 6,
        minCellHeight: 10
      },
      margin: { left: margin, right: margin }
    });
    
    drawPageFooter(true, 0);
  }
  
  // Zwróć PDF
  const fileName = `arkusz_spisu_z_natury_${(stocktaking.name || 'inwentaryzacja').replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
  
  return {
    content: doc.output('blob'),
    filename: fileName,
    type: 'application/pdf'
  };
};