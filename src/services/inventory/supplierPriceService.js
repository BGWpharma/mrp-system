// src/services/inventory/supplierPriceService.js

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
  writeBatch,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { 
  COLLECTIONS,
  FIREBASE_LIMITS,
  PAGINATION_DEFAULTS
} from './config/constants.js';
import { 
  validateId, 
  validatePositiveNumber,
  validateSupplierPriceData,
  ValidationError 
} from './utils/validators.js';
import { 
  convertTimestampToDate,
  formatPrice,
  formatQuantityPrecision 
} from './utils/formatters.js';
import { FirebaseQueryBuilder } from './config/firebaseQueries.js';

/**
 * Usługa zarządzania cenami dostawców
 * 
 * Ten modul zawiera wszystkie funkcje związane z zarządzaniem cenami dostawców:
 * - CRUD operacje na cenach dostawców
 * - Optymalizacja wyboru najlepszych cen
 * - Historia zmian cen
 * - Automatyczna aktualizacja cen z zamówień zakupowych
 * - Zarządzanie cenami domyślnymi
 * - Analiza i raportowanie cen
 */

/**
 * Pobiera wszystkie ceny dostawców dla pozycji magazynowej
 * @param {string} itemId - ID pozycji magazynowej
 * @param {Object} options - Opcje filtrowania
 * @param {string} options.sortBy - Pole sortowania ('price', 'createdAt', 'supplierName')
 * @param {string} options.sortDirection - Kierunek sortowania ('asc', 'desc')
 * @param {boolean} options.includeInactive - Czy dołączyć nieaktywne ceny
 * @returns {Promise<Array>} - Lista cen dostawców
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const getSupplierPrices = async (itemId, options = {}) => {
  try {
    // Walidacja parametrów
    const validatedId = validateId(itemId, 'itemId');
    const { 
      sortBy = 'price', 
      sortDirection = 'asc', 
      includeInactive = false 
    } = options;

    const supplierPricesRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_SUPPLIER_PRICES);
    let q = query(
      supplierPricesRef, 
      where('itemId', '==', validatedId)
    );

    // Nie filtrujemy na poziomie Firebase ze względu na kompatybilność ze starymi rekordami
    // które mogą nie mieć pola isActive - filtrowanie nastąpi na poziomie aplikacji

    // Dodaj sortowanie
    const validSortFields = ['price', 'createdAt', 'supplierName', 'updatedAt'];
    if (validSortFields.includes(sortBy)) {
      q = query(q, orderBy(sortBy, sortDirection));
    } else {
      q = query(q, orderBy('price', 'asc'));
    }
    
    const querySnapshot = await getDocs(q);
    const supplierPrices = [];
    
    querySnapshot.forEach(doc => {
      const data = doc.data();
      
      // Filtrowanie na poziomie aplikacji dla kompatybilności ze starymi rekordami
      if (!includeInactive && data.isActive === false) {
        return; // Pomiń nieaktywne ceny jeśli includeInactive === false
      }
      
      supplierPrices.push({
        id: doc.id,
        ...data,
        createdAt: convertTimestampToDate(data.createdAt),
        updatedAt: convertTimestampToDate(data.updatedAt),
        validFrom: convertTimestampToDate(data.validFrom),
        validTo: convertTimestampToDate(data.validTo)
      });
    });
    
    return supplierPrices;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas pobierania cen dostawców:', error);
    throw new Error(`Nie udało się pobrać cen dostawców: ${error.message}`);
  }
};

/**
 * Dodaje nową cenę dostawcy dla pozycji magazynowej
 * @param {Object} supplierPriceData - Dane ceny dostawcy
 * @param {string} supplierPriceData.itemId - ID pozycji magazynowej
 * @param {string} supplierPriceData.supplierId - ID dostawcy
 * @param {number} supplierPriceData.price - Cena
 * @param {string} supplierPriceData.currency - Waluta
 * @param {number} supplierPriceData.minQuantity - Minimalna ilość
 * @param {string} userId - ID użytkownika
 * @returns {Promise<Object>} - Dodana cena dostawcy
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const addSupplierPrice = async (supplierPriceData, userId) => {
  try {
    // Walidacja parametrów - teraz zwraca przekonwertowane dane
    const validatedData = validateSupplierPriceData(supplierPriceData);
    const validatedUserId = validateId(userId, 'userId');
    
    // Sprawdź czy taki dostawca już istnieje dla tej pozycji (uwzględnij stare rekordy bez isActive)
    const existingPricesRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_SUPPLIER_PRICES);
    const q = query(
      existingPricesRef,
      where('itemId', '==', validatedData.itemId),
      where('supplierId', '==', validatedData.supplierId)
    );
    
    const querySnapshot = await getDocs(q);
    
    // Sprawdź na poziomie aplikacji czy istnieje aktywna cena
    const hasActivePrice = querySnapshot.docs.some(doc => {
      const data = doc.data();
      return data.isActive !== false; // Aktywne jeśli isActive !== false (w tym undefined)
    });
    
    if (hasActivePrice) {
      throw new Error('Ten dostawca już ma przypisaną aktywną cenę do tej pozycji. Zaktualizuj istniejącą cenę lub dezaktywuj ją przed dodaniem nowej.');
    }
    
    const newSupplierPrice = {
      ...validatedData,
      price: formatPrice(validatedData.price),
      minQuantity: formatQuantityPrecision(validatedData.minQuantity || 0),
      isActive: true,
      isDefault: false,
      createdBy: validatedUserId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      validFrom: validatedData.validFrom ? Timestamp.fromDate(new Date(validatedData.validFrom)) : null,
      validTo: validatedData.validTo ? Timestamp.fromDate(new Date(validatedData.validTo)) : null
    };
    
    const docRef = await addDoc(
      FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_SUPPLIER_PRICES), 
      newSupplierPrice
    );
    
    // Dodaj wpis do historii cen
    if (validatedData.trackHistory !== false) {
      await addSupplierPriceHistory({
        priceId: docRef.id,
        itemId: validatedData.itemId,
        supplierId: validatedData.supplierId,
        oldPrice: 0,
        newPrice: validatedData.price,
        currency: validatedData.currency || 'PLN',
        changeReason: 'Dodanie nowej ceny dostawcy',
        changedBy: validatedUserId
      });
    }
    
    return {
      id: docRef.id,
      ...newSupplierPrice
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas dodawania ceny dostawcy:', error);
    throw new Error(`Nie udało się dodać ceny dostawcy: ${error.message}`);
  }
};

/**
 * Aktualizuje cenę dostawcy
 * @param {string} priceId - ID ceny dostawcy
 * @param {Object} supplierPriceData - Dane ceny dostawcy do aktualizacji
 * @param {string} userId - ID użytkownika
 * @param {Object} options - Opcje aktualizacji
 * @param {boolean} options.trackHistory - Czy śledzić historię zmian
 * @param {string} options.changeReason - Powód zmiany
 * @returns {Promise<Object>} - Zaktualizowana cena dostawcy
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const updateSupplierPrice = async (priceId, supplierPriceData, userId, options = {}) => {
  try {
    // Walidacja parametrów
    const validatedPriceId = validateId(priceId, 'priceId');
    const validatedUserId = validateId(userId, 'userId');
    const { trackHistory = true, changeReason = 'Aktualizacja ceny' } = options;
    
    if (supplierPriceData.price !== undefined) {
      validatePositiveNumber(supplierPriceData.price, 'price');
    }
    
    // Pobierz aktualną cenę przed aktualizacją
    const priceDocRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY_SUPPLIER_PRICES, validatedPriceId);
    const priceDoc = await getDoc(priceDocRef);
    
    if (!priceDoc.exists()) {
      throw new Error('Cena dostawcy nie istnieje');
    }
    
    const currentPriceData = priceDoc.data();
    
    // Przygotuj dane do aktualizacji
    const updatedData = {
      ...supplierPriceData,
      updatedAt: serverTimestamp(),
      updatedBy: validatedUserId
    };
    
    // Formatuj numeryczne pola
    if (updatedData.price !== undefined) {
      updatedData.price = formatPrice(updatedData.price);
    }
    if (updatedData.minQuantity !== undefined) {
      updatedData.minQuantity = formatQuantityPrecision(updatedData.minQuantity);
    }
    
    // Konwertuj daty jeśli podano
    if (updatedData.validFrom) {
      updatedData.validFrom = Timestamp.fromDate(new Date(updatedData.validFrom));
    }
    if (updatedData.validTo) {
      updatedData.validTo = Timestamp.fromDate(new Date(updatedData.validTo));
    }
    
    // Jeśli zmienia się cena, dodaj wpis do historii
    if (trackHistory && 
        updatedData.price !== undefined && 
        currentPriceData.price !== updatedData.price) {
      await addSupplierPriceHistory({
        priceId: validatedPriceId,
        itemId: currentPriceData.itemId,
        supplierId: currentPriceData.supplierId,
        oldPrice: currentPriceData.price,
        newPrice: updatedData.price,
        currency: currentPriceData.currency || updatedData.currency || 'PLN',
        changeReason,
        changedBy: validatedUserId
      });
    }
    
    await updateDoc(priceDocRef, updatedData);
    
    return {
      id: validatedPriceId,
      ...currentPriceData,
      ...updatedData
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas aktualizacji ceny dostawcy:', error);
    throw new Error(`Nie udało się zaktualizować ceny dostawcy: ${error.message}`);
  }
};

/**
 * Usuwa cenę dostawcy (soft delete - oznacza jako nieaktywną)
 * @param {string} priceId - ID ceny dostawcy
 * @param {string} userId - ID użytkownika
 * @param {boolean} hardDelete - Czy całkowicie usunąć z bazy danych
 * @returns {Promise<Object>} - Wynik operacji
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const deleteSupplierPrice = async (priceId, userId = null, hardDelete = false) => {
  try {
    // Walidacja parametrów
    const validatedPriceId = validateId(priceId, 'priceId');
    
    if (hardDelete) {
      // Twarde usunięcie
      await deleteDoc(FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY_SUPPLIER_PRICES, validatedPriceId));
      
      return {
        success: true,
        message: 'Cena dostawcy została całkowicie usunięta'
      };
    } else {
      // Miękkie usunięcie - oznacz jako nieaktywną
      const validatedUserId = userId ? validateId(userId, 'userId') : null;
      
      const updateData = {
        isActive: false,
        deactivatedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      if (validatedUserId) {
        updateData.deactivatedBy = validatedUserId;
        updateData.updatedBy = validatedUserId;
      }
      
      await updateDoc(
        FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY_SUPPLIER_PRICES, validatedPriceId), 
        updateData
      );
      
      return {
        success: true,
        message: 'Cena dostawcy została dezaktywowana'
      };
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas usuwania ceny dostawcy:', error);
    throw new Error(`Nie udało się usunąć ceny dostawcy: ${error.message}`);
  }
};

/**
 * Pobiera konkretną cenę dostawcy dla pozycji magazynowej
 * @param {string} itemId - ID pozycji magazynowej
 * @param {string} supplierId - ID dostawcy
 * @param {boolean} includeInactive - Czy uwzględnić nieaktywne ceny
 * @returns {Promise<Object|null>} - Cena dostawcy lub null jeśli nie znaleziono
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const getSupplierPriceForItem = async (itemId, supplierId, includeInactive = false) => {
  try {
    // Walidacja parametrów
    const validatedItemId = validateId(itemId, 'itemId');
    const validatedSupplierId = validateId(supplierId, 'supplierId');

    const supplierPricesRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_SUPPLIER_PRICES);
    let q = query(
      supplierPricesRef,
      where('itemId', '==', validatedItemId),
      where('supplierId', '==', validatedSupplierId)
    );
    
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return null;
    }
    
    // Znajdź pierwszą aktywną cenę (filtrowanie na poziomie aplikacji)
    let activeDoc = null;
    for (const doc of querySnapshot.docs) {
      const data = doc.data();
      if (includeInactive || data.isActive !== false) {
        activeDoc = doc;
        break;
      }
    }
    
    if (!activeDoc) {
      return null;
    }
    
    const data = activeDoc.data();
    
    return {
      id: activeDoc.id,
      ...data,
      createdAt: convertTimestampToDate(data.createdAt),
      updatedAt: convertTimestampToDate(data.updatedAt),
      validFrom: convertTimestampToDate(data.validFrom),
      validTo: convertTimestampToDate(data.validTo)
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas pobierania ceny dostawcy:', error);
    throw new Error(`Nie udało się pobrać ceny dostawcy: ${error.message}`);
  }
};

/**
 * Znajduje najlepszą cenę dostawcy dla pozycji magazynowej
 * @param {string} itemId - ID pozycji magazynowej
 * @param {number} quantity - Ilość produktu
 * @param {Object} options - Opcje wyszukiwania
 * @param {Array} options.excludeSuppliers - Lista ID dostawców do wykluczenia
 * @param {boolean} options.onlyDefault - Czy szukać tylko wśród domyślnych
 * @param {boolean} options.includeExpired - Czy uwzględnić wygasłe ceny
 * @param {boolean} options.includeSupplierNames - Czy dołączyć nazwy dostawców
 * @returns {Promise<Object|null>} - Najlepsza cena dostawcy lub null jeśli nie znaleziono
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const getBestSupplierPriceForItem = async (itemId, quantity = 1, options = {}) => {
  try {
    // Walidacja parametrów
    const validatedItemId = validateId(itemId, 'itemId');
    validatePositiveNumber(quantity, 'quantity', true); // Zezwól na 0
    
    const { 
      excludeSuppliers = [], 
      onlyDefault = false, 
      includeExpired = true,
      includeSupplierNames = false 
    } = options;
    
    // Pobierz wszystkie ceny dostawców dla produktu
    const pricesRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_SUPPLIER_PRICES);
    let q = query(pricesRef, where('itemId', '==', validatedItemId));
    
    // Nie filtrujemy na poziomie Firebase - kompatybilność ze starymi rekordami
    
    // Filtruj tylko domyślne jeśli wymagane
    if (onlyDefault) {
      q = query(q, where('isDefault', '==', true));
    }
    
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return null;
    }
    
    // Mapuj dokumenty na obiekty z ceną
    const prices = [];
    const now = new Date();
    
    querySnapshot.forEach(doc => {
      const priceData = doc.data();
      
      // Filtrowanie na poziomie aplikacji - pomiń nieaktywne ceny (ale uwzględnij te bez pola isActive)
      if (priceData.isActive === false) {
        return;
      }
      
      // Wykluczaj określonych dostawców
      if (excludeSuppliers.includes(priceData.supplierId)) {
        return;
      }
      
      // Sprawdź ważność czasową
      if (!includeExpired) {
        const validFrom = convertTimestampToDate(priceData.validFrom);
        const validTo = convertTimestampToDate(priceData.validTo);
        
        if (validFrom && validFrom > now) return;
        if (validTo && validTo < now) return;
      }
      
      prices.push({
        id: doc.id,
        ...priceData
      });
    });
    
    if (prices.length === 0) {
      return null;
    }
    
    // Filtruj ceny według minimalnej ilości
    const validPrices = prices.filter(price => {
      const minQ = price.minQuantity || 0;
      return minQ <= quantity;
    });
    
    const finalPrices = validPrices.length > 0 ? validPrices : prices;
    
    // Znajdź najniższą cenę
    finalPrices.sort((a, b) => (a.price || 0) - (b.price || 0));
    
    const bestPrice = finalPrices[0];
    
    let result = {
      ...bestPrice,
      createdAt: convertTimestampToDate(bestPrice.createdAt),
      updatedAt: convertTimestampToDate(bestPrice.updatedAt),
      validFrom: convertTimestampToDate(bestPrice.validFrom),
      validTo: convertTimestampToDate(bestPrice.validTo)
    };
    
    // Dołącz nazwę dostawcy jeśli wymagane
    if (includeSupplierNames && bestPrice.supplierId) {
      try {
        const { getAllSuppliers } = await import('../supplierService');
        const suppliers = await getAllSuppliers();
        const supplier = suppliers.find(s => s.id === bestPrice.supplierId);
        result.supplierName = supplier ? supplier.name : 'Nieznany dostawca';
      } catch (error) {
        console.warn('Nie udało się pobrać nazwy dostawcy:', error);
        result.supplierName = 'Nieznany dostawca';
      }
    }
    
    return result;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas pobierania najlepszej ceny dostawcy:', error);
    return null;
  }
};

/**
 * Znajduje najlepsze ceny dostawców dla listy pozycji magazynowych (zoptymalizowana wersja)
 * @param {Array} items - Lista obiektów zawierających itemId i quantity
 * @param {Object} options - Opcje wyszukiwania
 * @param {Array} options.excludeSuppliers - Lista ID dostawców do wykluczenia
 * @param {boolean} options.onlyDefault - Czy szukać tylko wśród domyślnych
 * @param {boolean} options.includeExpired - Czy uwzględnić wygasłe ceny
 * @param {boolean} options.includeSupplierNames - Czy dołączyć nazwy dostawców
 * @returns {Promise<Object>} - Mapa itemId -> najlepsza cena dostawcy
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const getBestSupplierPricesForItems = async (items, options = {}) => {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return {};
  }
  
  try {
    const { excludeSuppliers = [], onlyDefault = false, includeExpired = true, includeSupplierNames = false } = options;
    const result = {};
    
    // Zbierz wszystkie unikalne itemId
    const uniqueItemIds = [...new Set(items.map(item => item.itemId || item.id).filter(Boolean))];
    
    if (uniqueItemIds.length === 0) {
      return {};
    }
    
    // Pobierz wszystkie ceny dostawców w batches (Firestore limit to 30 dla 'in' queries)
    const batchSize = 30; // Firestore limit dla zapytań 'in'
    const allPrices = new Map(); // itemId -> array of prices
    for (let i = 0; i < uniqueItemIds.length; i += batchSize) {
      const batchItemIds = uniqueItemIds.slice(i, i + batchSize);
      
      // Sprawdź czy batch nie jest pusty (Firestore wymaga niepustej tablicy dla 'in')
      if (batchItemIds.length === 0) {
        continue;
      }
      
      const pricesRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_SUPPLIER_PRICES);
      let q = query(pricesRef, where('itemId', 'in', batchItemIds));
      
      // Nie filtrujemy na poziomie Firebase - kompatybilność ze starymi rekordami bez isActive
      
      // Filtruj tylko domyślne jeśli wymagane
      if (onlyDefault) {
        q = query(q, where('isDefault', '==', true));
      }
      
      const querySnapshot = await getDocs(q);
      
      // Grupuj ceny według itemId
      querySnapshot.forEach(doc => {
        const priceData = { id: doc.id, ...doc.data() };
        const itemId = priceData.itemId;
        
        // Filtrowanie na poziomie aplikacji - pomiń nieaktywne ceny (ale uwzględnij te bez pola isActive)
        if (priceData.isActive === false) {
          return;
        }
        
        // Wykluczaj określonych dostawców
        if (excludeSuppliers.includes(priceData.supplierId)) {
          return;
        }
        
        if (!allPrices.has(itemId)) {
          allPrices.set(itemId, []);
        }
        allPrices.get(itemId).push(priceData);
      });
    }
    
    // Dla każdej pozycji znajdź najlepszą cenę
    const now = new Date();
    
    for (const item of items) {
      const itemId = item.itemId || item.id;
      const quantity = item.quantity || 1;
      
      if (!itemId || !allPrices.has(itemId)) {
        continue;
      }
      
      const prices = allPrices.get(itemId);
      
      // Filtruj ceny według ważności czasowej i minimalnej ilości
      const validPrices = prices.filter(price => {
        // Sprawdź ważność czasową tylko jeśli nie uwzględniamy wygasłych
        if (!includeExpired) {
          const validFrom = convertTimestampToDate(price.validFrom);
          const validTo = convertTimestampToDate(price.validTo);
          
          if (validFrom && validFrom > now) return false;
          if (validTo && validTo < now) return false;
        }
        
        // Sprawdź minimalną ilość
        const minQ = price.minQuantity || 0;
        return minQ <= quantity;
      });
      
      const finalPrices = validPrices.length > 0 ? validPrices : prices;
      
      if (finalPrices.length > 0) {
        // Znajdź najniższą cenę
        finalPrices.sort((a, b) => (a.price || 0) - (b.price || 0));
        const bestPrice = finalPrices[0];
        
        result[itemId] = {
          ...bestPrice,
          createdAt: convertTimestampToDate(bestPrice.createdAt),
          updatedAt: convertTimestampToDate(bestPrice.updatedAt),
          validFrom: convertTimestampToDate(bestPrice.validFrom),
          validTo: convertTimestampToDate(bestPrice.validTo)
        };
      }
    }
    
    // Dołącz nazwy dostawców jeśli wymagane
    if (includeSupplierNames && Object.keys(result).length > 0) {
      try {
        // Import funkcji getAllSuppliers dynamicznie aby uniknąć cyklicznych zależności
        const { getAllSuppliers } = await import('../supplierService');
        const suppliers = await getAllSuppliers();
        
        // Dodaj nazwy dostawców do wyników
        for (const itemId in result) {
          const supplier = suppliers.find(s => s.id === result[itemId].supplierId);
          result[itemId].supplierName = supplier ? supplier.name : 'Nieznany dostawca';
        }
      } catch (error) {
        console.warn('Nie udało się pobrać nazw dostawców:', error);
        // Kontynuuj bez nazw dostawców
      }
    }
    
    return result;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas pobierania najlepszych cen dostawców:', error);
    return {};
  }
};

/**
 * Ustawia cenę dostawcy jako domyślną dla danej pozycji magazynowej
 * @param {string} itemId - ID pozycji magazynowej
 * @param {string} priceId - ID ceny dostawcy do ustawienia jako domyślna
 * @param {string} userId - ID użytkownika
 * @returns {Promise<Object>} - Wynik operacji
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const setDefaultSupplierPrice = async (itemId, priceId, userId = null) => {
  try {
    // Walidacja parametrów
    const validatedItemId = validateId(itemId, 'itemId');
    const validatedPriceId = validateId(priceId, 'priceId');
    const validatedUserId = userId ? validateId(userId, 'userId') : null;
    
    // Pobierz wszystkie ceny dostawców dla danej pozycji (kompatybilność ze starymi rekordami)
    const supplierPricesRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_SUPPLIER_PRICES);
    const q = query(
      supplierPricesRef,
      where('itemId', '==', validatedItemId)
    );
    
    const querySnapshot = await getDocs(q);
    
    // Użyj batch do atomowej aktualizacji
    const batch = writeBatch(db);
    let targetPriceExists = false;
    
    querySnapshot.forEach(doc => {
      const data = doc.data();
      
      // Pomiń nieaktywne ceny (ale uwzględnij te bez pola isActive)
      if (data.isActive === false) {
        return;
      }
      const updateData = { 
        isDefault: doc.id === validatedPriceId,
        updatedAt: serverTimestamp()
      };
      
      if (validatedUserId) {
        updateData.updatedBy = validatedUserId;
      }
      
      batch.update(doc.ref, updateData);
      
      if (doc.id === validatedPriceId) {
        targetPriceExists = true;
      }
    });
    
    if (!targetPriceExists) {
      throw new Error('Wybrana cena dostawcy nie istnieje lub jest nieaktywna');
    }
    
    // Wykonaj batch update
    await batch.commit();
    
    return {
      success: true,
      message: 'Cena dostawcy została ustawiona jako domyślna'
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas ustawiania domyślnej ceny dostawcy:', error);
    throw new Error(`Nie udało się ustawić domyślnej ceny dostawcy: ${error.message}`);
  }
};

/**
 * Usuwa oznaczenie domyślnej ceny dostawcy dla pozycji magazynowej
 * @param {string} itemId - ID pozycji magazynowej
 * @param {string} userId - ID użytkownika
 * @returns {Promise<Object>} - Wynik operacji
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const unsetDefaultSupplierPrice = async (itemId, userId = null) => {
  try {
    // Walidacja parametrów
    const validatedItemId = validateId(itemId, 'itemId');
    const validatedUserId = userId ? validateId(userId, 'userId') : null;
    
    const supplierPricesRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_SUPPLIER_PRICES);
    const q = query(
      supplierPricesRef,
      where('itemId', '==', validatedItemId),
      where('isDefault', '==', true)
    );
    
    const querySnapshot = await getDocs(q);
    
    // Użyj batch do aktualizacji wszystkich domyślnych cen
    const batch = writeBatch(db);
    
    querySnapshot.forEach(doc => {
      const updateData = { 
        isDefault: false,
        updatedAt: serverTimestamp()
      };
      
      if (validatedUserId) {
        updateData.updatedBy = validatedUserId;
      }
      
      batch.update(doc.ref, updateData);
    });
    
    await batch.commit();
    
    return {
      success: true,
      message: 'Usunięto oznaczenie domyślnej ceny dostawcy'
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas usuwania domyślnej ceny dostawcy:', error);
    throw new Error(`Nie udało się usunąć domyślnej ceny dostawcy: ${error.message}`);
  }
};

/**
 * Dodaje wpis do historii cen dostawcy
 * @param {Object} historyData - Dane historii ceny
 * @param {string} historyData.priceId - ID ceny dostawcy
 * @param {string} historyData.itemId - ID pozycji magazynowej
 * @param {string} historyData.supplierId - ID dostawcy
 * @param {number} historyData.oldPrice - Stara cena
 * @param {number} historyData.newPrice - Nowa cena
 * @param {string} historyData.currency - Waluta
 * @param {string} historyData.changeReason - Powód zmiany
 * @param {string} historyData.changedBy - ID użytkownika wprowadzającego zmianę
 * @returns {Promise<Object>} - Dodany wpis historii
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const addSupplierPriceHistory = async (historyData) => {
  try {
    // Walidacja podstawowych pól
    if (!historyData.priceId) {
      throw new ValidationError('ID ceny dostawcy jest wymagane', 'priceId');
    }
    
    if (!historyData.itemId) {
      throw new ValidationError('ID pozycji magazynowej jest wymagane', 'itemId');
    }
    
    if (!historyData.supplierId) {
      throw new ValidationError('ID dostawcy jest wymagane', 'supplierId');
    }
    
    if (typeof historyData.oldPrice !== 'number') {
      throw new ValidationError('Stara cena musi być liczbą', 'oldPrice');
    }
    
    if (typeof historyData.newPrice !== 'number') {
      throw new ValidationError('Nowa cena musi być liczbą', 'newPrice');
    }
    
    const historyEntry = {
      ...historyData,
      oldPrice: formatPrice(historyData.oldPrice),
      newPrice: formatPrice(historyData.newPrice),
      currency: historyData.currency || 'PLN',
      changeReason: historyData.changeReason || 'Aktualizacja ceny',
      priceChange: formatPrice(historyData.newPrice - historyData.oldPrice),
      priceChangePercent: historyData.oldPrice > 0 ? 
        formatPrice(((historyData.newPrice - historyData.oldPrice) / historyData.oldPrice) * 100) : 0,
      createdAt: serverTimestamp()
    };
    
    const docRef = await addDoc(
      FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_SUPPLIER_PRICE_HISTORY), 
      historyEntry
    );
    
    return {
      id: docRef.id,
      ...historyEntry
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas dodawania wpisu do historii cen dostawcy:', error);
    throw new Error(`Nie udało się dodać wpisu do historii cen: ${error.message}`);
  }
};

/**
 * Pobiera historię cen dostawcy
 * @param {string} priceId - ID ceny dostawcy
 * @param {Object} options - Opcje filtrowania
 * @param {number} options.limit - Limit wyników
 * @param {Date} options.startDate - Data początkowa
 * @param {Date} options.endDate - Data końcowa
 * @returns {Promise<Array>} - Lista wpisów historii cen
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const getSupplierPriceHistory = async (priceId, options = {}) => {
  try {
    // Walidacja parametrów
    const validatedPriceId = validateId(priceId, 'priceId');
    const { limit = PAGINATION_DEFAULTS.DEFAULT_LIMIT, startDate, endDate } = options;
    
    const historyRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_SUPPLIER_PRICE_HISTORY);
    let q = query(
      historyRef,
      where('priceId', '==', validatedPriceId),
      orderBy('createdAt', 'desc')
    );
    
    // Dodaj filtr dat jeśli podano
    if (startDate) {
      q = query(q, where('createdAt', '>=', Timestamp.fromDate(startDate)));
    }
    if (endDate) {
      q = query(q, where('createdAt', '<=', Timestamp.fromDate(endDate)));
    }
    
    // Dodaj limit
    if (limit && typeof limit === 'number') {
      q = query(q, limit(limit));
    }
    
    const querySnapshot = await getDocs(q);
    const history = [];
    
    querySnapshot.forEach(doc => {
      const data = doc.data();
      history.push({
        id: doc.id,
        ...data,
        createdAt: convertTimestampToDate(data.createdAt)
      });
    });
    
    return history;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas pobierania historii cen dostawcy:', error);
    throw new Error(`Nie udało się pobrać historii cen dostawcy: ${error.message}`);
  }
};

/**
 * Pobiera historię cen dla pozycji magazynowej
 * @param {string} itemId - ID pozycji magazynowej
 * @param {Object} options - Opcje filtrowania
 * @param {number} options.limit - Limit wyników
 * @param {string} options.supplierId - ID konkretnego dostawcy
 * @param {Date} options.startDate - Data początkowa
 * @param {Date} options.endDate - Data końcowa
 * @returns {Promise<Array>} - Lista wpisów historii cen
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const getItemSupplierPriceHistory = async (itemId, options = {}) => {
  try {
    // Walidacja parametrów
    const validatedItemId = validateId(itemId, 'itemId');
    const { 
      limit = PAGINATION_DEFAULTS.DEFAULT_LIMIT, 
      supplierId, 
      startDate, 
      endDate 
    } = options;
    
    const historyRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_SUPPLIER_PRICE_HISTORY);
    let q = query(
      historyRef,
      where('itemId', '==', validatedItemId),
      orderBy('createdAt', 'desc')
    );
    
    // Dodaj filtr dostawcy jeśli podano
    if (supplierId) {
      const validatedSupplierId = validateId(supplierId, 'supplierId');
      q = query(q, where('supplierId', '==', validatedSupplierId));
    }
    
    // Dodaj filtr dat jeśli podano
    if (startDate) {
      q = query(q, where('createdAt', '>=', Timestamp.fromDate(startDate)));
    }
    if (endDate) {
      q = query(q, where('createdAt', '<=', Timestamp.fromDate(endDate)));
    }
    
    // Dodaj limit
    if (limit && typeof limit === 'number') {
      q = query(q, limit(limit));
    }
    
    const querySnapshot = await getDocs(q);
    const history = [];
    
    querySnapshot.forEach(doc => {
      const data = doc.data();
      history.push({
        id: doc.id,
        ...data,
        createdAt: convertTimestampToDate(data.createdAt)
      });
    });
    
    return history;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas pobierania historii cen dla pozycji magazynowej:', error);
    throw new Error(`Nie udało się pobrać historii cen dla pozycji: ${error.message}`);
  }
};

/**
 * Automatycznie aktualizuje ceny dostawców na podstawie zakończonego zamówienia zakupowego
 * @param {string} purchaseOrderId - ID zamówienia zakupowego
 * @param {string} userId - ID użytkownika wykonującego aktualizację
 * @param {Object} options - Opcje aktualizacji
 * @param {boolean} options.setAsDefault - Czy ustawić jako domyślne
 * @param {boolean} options.updateExisting - Czy aktualizować istniejące ceny
 * @returns {Promise<Object>} - Wynik operacji z liczbą zaktualizowanych cen
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const updateSupplierPricesFromCompletedPO = async (purchaseOrderId, userId, options = {}) => {
  try {
    // Walidacja parametrów
    const validatedPOId = validateId(purchaseOrderId, 'purchaseOrderId');
    const validatedUserId = validateId(userId, 'userId');
    const { setAsDefault = true, updateExisting = true } = options;
    
    console.log(`Rozpoczynam aktualizację cen dostawców dla zamówienia ${validatedPOId}`);
    
    // Pobierz zamówienie zakupowe (import dynamiczny żeby uniknąć cyklicznych zależności)
    const { getPurchaseOrderById } = await import('../purchaseOrderService');
    const purchaseOrder = await getPurchaseOrderById(validatedPOId);
    
    if (!purchaseOrder) {
      throw new Error('Zamówienie zakupowe nie istnieje');
    }
    
    if (purchaseOrder.status !== 'completed') {
      throw new Error('Można aktualizować ceny tylko z zakończonych zamówień');
    }
    
    if (!purchaseOrder.items || purchaseOrder.items.length === 0) {
      return {
        success: true,
        message: 'Brak pozycji do przetworzenia',
        updated: 0,
        errors: []
      };
    }
    
    const supplierId = purchaseOrder.supplierId;
    if (!supplierId) {
      throw new Error('Brak informacji o dostawcy w zamówieniu');
    }
    
    let updatedCount = 0;
    const errors = [];
    
    // Przetwórz każdą pozycję zamówienia
    for (const item of purchaseOrder.items) {
      try {
        const itemId = item.inventoryItemId || item.itemId;
        if (!itemId || !item.unitPrice) {
          continue;
        }
        
        // Konwertuj cenę na liczbę (podobnie jak w starym inventoryService)
        const unitPrice = parseFloat(item.unitPrice);
        if (isNaN(unitPrice) || unitPrice <= 0) {
          console.log(`Nieprawidłowa cena dla pozycji ${item.name}: ${item.unitPrice}, pomijam`);
          continue;
        }
        
        // Sprawdź czy istnieje cena dla tego dostawcy
        const existingPrice = await getSupplierPriceForItem(itemId, supplierId);
        
        if (existingPrice && updateExisting) {
          // Aktualizuj istniejącą cenę
          const supplierPriceData = {
            price: unitPrice,
            currency: item.currency || purchaseOrder.currency || 'PLN',
            minQuantity: item.minOrderQuantity || 0,
            leadTime: item.leadTime || null,
            lastOrderDate: new Date(),
            lastOrderPrice: unitPrice,
            lastOrderQuantity: item.quantity || 0
          };
          
          await updateSupplierPrice(
            existingPrice.id, 
            supplierPriceData, 
            validatedUserId,
            {
              trackHistory: true,
              changeReason: `Aktualizacja z zamówienia ${validatedPOId}`
            }
          );
          
          // Ustaw jako domyślną jeśli wymagane
          if (setAsDefault) {
            await setDefaultSupplierPrice(itemId, existingPrice.id, validatedUserId);
          }
          
          updatedCount++;
          console.log(`Zaktualizowano cenę dostawcy dla pozycji ${itemId}`);
        } else if (!existingPrice) {
          // Dodaj nową cenę dostawcy
          const supplierPriceData = {
            itemId,
            supplierId,
            price: unitPrice,
            currency: item.currency || purchaseOrder.currency || 'PLN',
            minQuantity: item.minOrderQuantity || 0,
            leadTime: item.leadTime || null,
            supplierProductCode: item.supplierProductCode || '',
            supplierProductName: item.supplierProductName || item.name || '',
            lastOrderDate: new Date(),
            lastOrderPrice: unitPrice,
            lastOrderQuantity: item.quantity || 0,
            isActive: true,
            trackHistory: true
          };
          
          const newPriceRecord = await addSupplierPrice(supplierPriceData, validatedUserId);
          
          // Ustaw jako domyślną jeśli wymagane
          if (setAsDefault) {
            await setDefaultSupplierPrice(itemId, newPriceRecord.id, validatedUserId);
          }
          
          updatedCount++;
          console.log(`Dodano nową cenę dostawcy dla pozycji ${itemId}`);
        }
      } catch (error) {
        console.error(`Błąd podczas przetwarzania pozycji ${item.inventoryItemId}:`, error);
        errors.push({
          itemId: item.inventoryItemId,
          error: error.message
        });
      }
    }
    
    const message = `Przetworzono zamówienie ${validatedPOId}: zaktualizowano ${updatedCount} cen dostawców, błędy: ${errors.length}`;
    console.log(message);
    
    return {
      success: true,
      message,
      purchaseOrderId: validatedPOId,
      updated: updatedCount,
      errors
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas aktualizacji cen dostawców z zamówienia:', error);
    throw new Error(`Nie udało się zaktualizować cen dostawców z zamówienia: ${error.message}`);
  }
};

/**
 * Masowa aktualizacja cen dostawców z zakończonych zamówień zakupowych
 * @param {string} userId - ID użytkownika wykonującego aktualizację
 * @param {Object} options - Opcje aktualizacji
 * @param {number} options.daysBack - Liczba dni wstecz do przeszukania
 * @param {boolean} options.setAsDefault - Czy ustawić jako domyślne
 * @param {boolean} options.updateExisting - Czy aktualizować istniejące ceny
 * @param {Array} options.supplierIds - Lista ID dostawców do przetworzenia
 * @returns {Promise<Object>} - Wynik operacji z podsumowaniem
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const bulkUpdateSupplierPricesFromCompletedPOs = async (userId, options = {}) => {
  try {
    // Walidacja parametrów
    const validatedUserId = validateId(userId, 'userId');
    const { 
      daysBack = 30, 
      setAsDefault = true, 
      updateExisting = true,
      supplierIds = []
    } = options;
    
    console.log(`Rozpoczynam masową aktualizację cen dostawców z ostatnich ${daysBack} dni`);
    
    // Oblicz datę graniczną
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);
    
    // Znajdź wszystkie zakończone zamówienia z ostatnich X dni
    const poRef = FirebaseQueryBuilder.getCollectionRef('purchaseOrders');
    let q = query(
      poRef,
      where('status', '==', 'completed'),
      where('updatedAt', '>=', Timestamp.fromDate(cutoffDate)),
      orderBy('updatedAt', 'desc')
    );
    
    // Filtruj po dostawcach jeśli podano
    if (supplierIds.length > 0) {
      // Dla większej liczby dostawców trzeba by zastosować batching
      if (supplierIds.length <= 30) {
        q = query(q, where('supplierId', 'in', supplierIds));
      }
    }
    
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return {
        success: true,
        message: `Nie znaleziono zakończonych zamówień z ostatnich ${daysBack} dni`,
        processed: 0,
        updated: 0,
        errors: 0,
        results: []
      };
    }
    
    let processedCount = 0;
    let totalUpdated = 0;
    let errorCount = 0;
    const results = [];
    
    // Przetwórz każde zakończone zamówienie
    for (const doc of querySnapshot.docs) {
      try {
        const poData = doc.data();
        
        // Pomiń jeśli filtrujemy po dostawcach i ten nie jest na liście
        if (supplierIds.length > 30 && 
            supplierIds.length > 0 && 
            !supplierIds.includes(poData.supplierId)) {
          continue;
        }
        
        const result = await updateSupplierPricesFromCompletedPO(
          doc.id, 
          validatedUserId,
          { setAsDefault, updateExisting }
        );
        
        processedCount++;
        totalUpdated += result.updated;
        results.push(result);
        
        console.log(`Przetworzono zamówienie ${doc.id}: ${result.updated} aktualizacji`);
      } catch (error) {
        console.error(`Błąd podczas przetwarzania zamówienia ${doc.id}:`, error);
        errorCount++;
        results.push({
          purchaseOrderId: doc.id,
          success: false,
          error: error.message,
          updated: 0
        });
      }
    }
    
    const message = `Przetworzono ${processedCount} zamówień, zaktualizowano ${totalUpdated} cen dostawców, błędy: ${errorCount}`;
    console.log(message);
    
    return {
      success: true,
      message,
      processed: processedCount,
      updated: totalUpdated,
      errors: errorCount,
      results
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas masowej aktualizacji cen dostawców:', error);
    throw new Error(`Nie udało się wykonać masowej aktualizacji cen dostawców: ${error.message}`);
  }
};

/**
 * Pobiera statystyki cen dostawców dla pozycji magazynowej
 * @param {string} itemId - ID pozycji magazynowej
 * @returns {Promise<Object>} - Statystyki cen dostawców
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const getSupplierPriceStatistics = async (itemId) => {
  try {
    // Walidacja parametrów
    const validatedItemId = validateId(itemId, 'itemId');
    
    const prices = await getSupplierPrices(validatedItemId, { includeInactive: false });
    
    if (prices.length === 0) {
      return {
        itemId: validatedItemId,
        totalSuppliers: 0,
        averagePrice: 0,
        minPrice: 0,
        maxPrice: 0,
        priceSpread: 0,
        defaultPrice: null,
        lastUpdated: new Date()
      };
    }
    
    const activePrices = prices.filter(p => p.isActive !== false);
    const priceValues = activePrices.map(p => p.price || 0).filter(p => p > 0);
    
    if (priceValues.length === 0) {
      return {
        itemId: validatedItemId,
        totalSuppliers: activePrices.length,
        averagePrice: 0,
        minPrice: 0,
        maxPrice: 0,
        priceSpread: 0,
        defaultPrice: null,
        lastUpdated: new Date()
      };
    }
    
    const minPrice = Math.min(...priceValues);
    const maxPrice = Math.max(...priceValues);
    const averagePrice = priceValues.reduce((sum, price) => sum + price, 0) / priceValues.length;
    const defaultPriceEntry = activePrices.find(p => p.isDefault === true);
    
    return {
      itemId: validatedItemId,
      totalSuppliers: activePrices.length,
      averagePrice: formatPrice(averagePrice),
      minPrice: formatPrice(minPrice),
      maxPrice: formatPrice(maxPrice),
      priceSpread: formatPrice(maxPrice - minPrice),
      priceSpreadPercent: minPrice > 0 ? formatPrice(((maxPrice - minPrice) / minPrice) * 100) : 0,
      defaultPrice: defaultPriceEntry ? {
        id: defaultPriceEntry.id,
        price: defaultPriceEntry.price,
        supplierId: defaultPriceEntry.supplierId,
        supplierName: defaultPriceEntry.supplierName
      } : null,
      lastUpdated: new Date()
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas pobierania statystyk cen dostawców:', error);
    throw new Error(`Nie udało się pobrać statystyk cen dostawców: ${error.message}`);
  }
};

/**
 * Porównuje ceny dostawców dla wielu pozycji magazynowych
 * @param {Array} itemIds - Lista ID pozycji magazynowych
 * @param {Object} options - Opcje porównania
 * @param {boolean} options.includeHistory - Czy dołączyć historię cen
 * @param {number} options.historyDays - Liczba dni historii
 * @returns {Promise<Object>} - Porównanie cen dostawców
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const compareSupplierPrices = async (itemIds, options = {}) => {
  try {
    // Walidacja parametrów
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      throw new ValidationError('Lista ID pozycji magazynowych jest wymagana', 'itemIds');
    }
    
    const validatedItemIds = itemIds.map(id => validateId(id, 'itemId'));
    const { includeHistory = false, historyDays = 30 } = options;
    
    const comparison = {};
    
    // Pobierz ceny dla każdej pozycji
    for (const itemId of validatedItemIds) {
      const prices = await getSupplierPrices(itemId, { includeInactive: false });
      const statistics = await getSupplierPriceStatistics(itemId);
      
      let history = [];
      if (includeHistory) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - historyDays);
        history = await getItemSupplierPriceHistory(itemId, { 
          startDate, 
          limit: 100 
        });
      }
      
      comparison[itemId] = {
        prices,
        statistics,
        history: includeHistory ? history : undefined
      };
    }
    
    return {
      comparison,
      summary: {
        itemsCount: validatedItemIds.length,
        totalUniquePrices: Object.values(comparison).reduce((sum, item) => sum + item.prices.length, 0),
        averagePricesPerItem: Object.values(comparison).reduce((sum, item) => sum + item.prices.length, 0) / validatedItemIds.length,
        generatedAt: new Date()
      }
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas porównywania cen dostawców:', error);
    throw new Error(`Nie udało się porównać cen dostawców: ${error.message}`);
  }
};

/**
 * Eksportuje ceny dostawców do formatu CSV
 * @param {Object} filters - Filtry eksportu
 * @param {Array} filters.itemIds - ID pozycji magazynowych
 * @param {Array} filters.supplierIds - ID dostawców
 * @param {boolean} filters.onlyActive - Tylko aktywne ceny
 * @param {boolean} filters.includeHistory - Dołączyć historię
 * @returns {Promise<Object>} - Wygenerowany plik CSV
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const exportSupplierPricesToCSV = async (filters = {}) => {
  try {
    const { 
      itemIds = [], 
      supplierIds = [], 
      onlyActive = true, 
      includeHistory = false 
    } = filters;
    
    // Nagłówki CSV
    const headers = [
      'ID pozycji', 'Nazwa pozycji', 'ID dostawcy', 'Nazwa dostawcy',
      'Cena', 'Waluta', 'Min. ilość', 'Czas dostawy', 'Domyślna',
      'Aktywna', 'Data utworzenia', 'Data aktualizacji'
    ];
    
    if (includeHistory) {
      headers.push('Ostatnia zmiana', 'Stara cena', 'Powód zmiany');
    }
    
    const rows = [];
    
    // Pobierz dane o cenach
    let query = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_SUPPLIER_PRICES);
    
    // Kompatybilność ze starymi rekordami - filtrowanie na poziomie aplikacji
    
    // Dla większych list trzeba by zastosować batching
    if (itemIds.length > 0 && itemIds.length <= 30) {
      query = query.where('itemId', 'in', itemIds);
    }
    
    const snapshot = await getDocs(query);
    
    for (const doc of snapshot.docs) {
      const data = doc.data();
      
      // Filtruj nieaktywne ceny (kompatybilność ze starymi rekordami)
      if (onlyActive && data.isActive === false) {
        continue;
      }
      
      // Filtruj po dostawcach jeśli podano
      if (supplierIds.length > 0 && !supplierIds.includes(data.supplierId)) {
        continue;
      }
      
      // Filtruj po pozycjach jeśli lista jest za duża dla 'in' query
      if (itemIds.length > 30 && !itemIds.includes(data.itemId)) {
        continue;
      }
      
      const row = [
        data.itemId || '',
        data.itemName || '',
        data.supplierId || '',
        data.supplierName || '',
        formatPrice(data.price || 0),
        data.currency || 'PLN',
        formatQuantityPrecision(data.minQuantity || 0),
        data.leadTime || '',
        data.isDefault ? 'Tak' : 'Nie',
        data.isActive !== false ? 'Tak' : 'Nie',
        data.createdAt ? convertTimestampToDate(data.createdAt).toISOString().split('T')[0] : '',
        data.updatedAt ? convertTimestampToDate(data.updatedAt).toISOString().split('T')[0] : ''
      ];
      
      if (includeHistory) {
        // Pobierz ostatnią zmianę z historii
        const history = await getSupplierPriceHistory(doc.id, { limit: 1 });
        if (history.length > 0) {
          const lastChange = history[0];
          row.push(
            lastChange.createdAt.toISOString().split('T')[0],
            formatPrice(lastChange.oldPrice || 0),
            lastChange.changeReason || ''
          );
        } else {
          row.push('', '', '');
        }
      }
      
      rows.push(row);
    }
    
    // Generuj zawartość CSV
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => 
        typeof cell === 'string' && (cell.includes(',') || cell.includes('"')) 
          ? `"${cell.replace(/"/g, '""')}"` 
          : cell
      ).join(','))
    ].join('\n');
    
    return {
      content: csvContent,
      filename: `ceny_dostawcow_${new Date().toISOString().split('T')[0]}.csv`,
      type: 'text/csv',
      recordsCount: rows.length
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas eksportu cen dostawców do CSV:', error);
    throw new Error(`Nie udało się wyeksportować cen dostawców: ${error.message}`);
  }
};

// ===== FUNKCJE POMOCNICZE ZAMÓWIEŃ ZAKUPOWYCH =====

/**
 * Znajduje najnowsze zakończone zamówienie zakupu dla danej pozycji magazynowej i dostawcy
 * @param {string} itemId - ID pozycji magazynowej
 * @param {string} supplierId - ID dostawcy
 * @returns {Promise<Object|null>} - Najnowsze zakończone zamówienie lub null
 * @throws {ValidationError} - Gdy parametry są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas wyszukiwania
 */
export const getLatestCompletedPurchaseOrderForItem = async (itemId, supplierId) => {
  try {
    // Walidacja parametrów
    const validatedItemId = validateId(itemId, 'itemId');
    const validatedSupplierId = validateId(supplierId, 'supplierId');

    // Import Firebase functions dynamically
    const { collection, query, where, orderBy, limit, getDocs } = await import('firebase/firestore');
    const { db } = await import('../firebase/config');
    
    // Znajdź zamówienia zakupu z danym dostawcą i statusem 'completed'
    const poRef = collection(db, 'purchaseOrders');
    const q = query(
      poRef,
      where('supplier.id', '==', validatedSupplierId),
      where('status', '==', 'completed'),
      orderBy('updatedAt', 'desc'),
      limit(50) // Ograniczenie dla wydajności
    );
    
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      console.log(`Brak zakończonych zamówień dla dostawcy ${validatedSupplierId}`);
      return null;
    }
    
    // Przeszukaj zamówienia w poszukiwaniu takiego, które zawiera daną pozycję
    for (const doc of querySnapshot.docs) {
      const poData = doc.data();
      
      // Sprawdź czy zamówienie zawiera pozycję o danym itemId
      const hasItem = poData.items && poData.items.some(item => 
        item.inventoryItemId === validatedItemId && 
        item.unitPrice && 
        parseFloat(item.unitPrice) > 0
      );
      
      if (hasItem) {
        const itemData = poData.items.find(item => item.inventoryItemId === validatedItemId);
        
        console.log(`✅ Znaleziono najnowsze zamówienie ${doc.id} dla pozycji ${validatedItemId} i dostawcy ${validatedSupplierId}`);
        
        return {
          id: doc.id,
          ...poData,
          // Znajdź konkretną pozycję w zamówieniu
          itemData: itemData
        };
      }
    }
    
    console.log(`Nie znaleziono zamówień zawierających pozycję ${validatedItemId} dla dostawcy ${validatedSupplierId}`);
    return null;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas wyszukiwania najnowszego zakończonego zamówienia:', error);
    throw new Error(`Nie udało się wyszukać zamówienia: ${error.message}`);
  }
};