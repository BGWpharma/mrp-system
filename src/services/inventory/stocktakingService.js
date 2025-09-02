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
    
    let adjustmentResult = null;
    
    // Jeśli mamy dostosować stany magazynowe
    if (adjustInventory) {
      adjustmentResult = await processStocktakingAdjustments(items, validatedUserId, 'completion');
    }

    // Oblicz statystyki
    const stats = calculateStocktakingStats(items);

    // Zaktualizuj status inwentaryzacji
    const stocktakingRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY_STOCKTAKING, validatedId);
    await updateDoc(stocktakingRef, {
      status: STOCKTAKING_STATUS.COMPLETED,
      completedAt: serverTimestamp(),
      completedBy: validatedUserId,
      itemsCount: stats.totalItems,
      discrepanciesCount: stats.itemsWithDiscrepancy,
      totalValue: stats.totalValue,
      adjustmentsApplied: adjustInventory
    });

    // Dodaj wpis w transakcjach
    await createStocktakingTransaction({
      type: TRANSACTION_TYPES.STOCKTAKING_COMPLETED,
      stocktakingId: validatedId,
      stocktakingName: stocktaking.name,
      notes: `Zakończono inwentaryzację "${stocktaking.name}" z ${items.length} pozycjami${adjustInventory ? ' z korektami stanów magazynowych' : ' bez korekt stanów'}.`,
      userId: validatedUserId,
      itemsCount: items.length,
      discrepanciesCount: stats.itemsWithDiscrepancy
    });

    return {
      success: true,
      message: 'Inwentaryzacja została zakończona',
      stats,
      adjustmentResult
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

    if (format === 'csv') {
      return generateStocktakingCSVReport(stocktaking, reportItems);
    } else {
      return generateStocktakingPDFReport(stocktaking, reportItems);
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
    
    for (const taskId of taskIds) {
      try {
        const taskRef = FirebaseQueryBuilder.getDocRef('productionTasks', taskId);
        const taskDoc = await getDoc(taskRef);
        
        if (!taskDoc.exists()) {
          console.log(`⚠️ Zadanie ${taskId} nie istnieje`);
          continue;
        }
        
        const taskData = taskDoc.data();
        const materialBatches = { ...taskData.materialBatches } || {};
        let hasChanges = false;
        
        // Sprawdź wszystkie materiały w zadaniu
        for (const [itemId, batches] of Object.entries(materialBatches)) {
          if (Array.isArray(batches)) {
            // Usuń partie o danym batchId
            const filteredBatches = batches.filter(batch => batch.batchId !== batchId);
            
            if (filteredBatches.length !== batches.length) {
              hasChanges = true;
              
              if (filteredBatches.length === 0) {
                // Usuń całkowicie materiał jeśli nie ma żadnych partii
                delete materialBatches[itemId];
                console.log(`🗑️ Usunięto materiał ${itemId} z zadania ${taskId} (brak partii)`);
              } else {
                // Zaktualizuj partie
                materialBatches[itemId] = filteredBatches;
                console.log(`📝 Zaktualizowano partie dla materiału ${itemId} w zadaniu ${taskId}`);
              }
            }
          }
        }
        
        // Zapisz zmiany jeśli są jakieś
        if (hasChanges) {
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
        quantity: reservation.quantity,
        itemId: reservation.itemId
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
const generateStocktakingCSVReport = (stocktaking, items) => {
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
    '',
    headers.join(','),
    ...csvRows.map(row => row.map(cell => 
      typeof cell === 'string' && (cell.includes(',') || cell.includes('"')) 
        ? `"${cell.replace(/"/g, '""')}"` 
        : cell
    ).join(','))
  ].join('\n');
  
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
const generateStocktakingPDFReport = async (stocktaking, items) => {
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