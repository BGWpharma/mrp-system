// src/services/inventory/inventoryItemsService.js

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
  deleteField
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { COLLECTIONS, SORT_FIELD_MAPPING } from './config/constants.js';
import { 
  validateId, 
  validateInventoryItemData,
  validatePaginationParams,
  validateIdList,
  validateRequiredString,
  ValidationError 
} from './utils/validators.js';
import { 
  formatQuantityPrecision,
  convertTimestampToDate 
} from './utils/formatters.js';
import { preciseAdd } from '../../utils/calculations';
import { FirebaseQueryBuilder } from './config/firebaseQueries.js';

/**
 * Usługa zarządzania pozycjami magazynowymi
 * 
 * Ten moduł zawiera wszystkie funkcje związane z zarządzaniem pozycjami magazynowymi:
 * - Pobieranie listy pozycji z filtrowaniem i paginacją
 * - Pobieranie szczegółów pozycji
 * - Tworzenie nowych pozycji
 * - Aktualizacja istniejących pozycji
 * - Usuwanie pozycji (z kaskadą)
 * - Zarządzanie cenami składników
 */

/**
 * Pobiera wszystkie pozycje magazynowe z możliwością filtrowania i paginacji
 * @param {string|null} warehouseId - ID magazynu (opcjonalne)
 * @param {number|null} page - Numer strony (opcjonalne)
 * @param {number|null} pageSize - Rozmiar strony (opcjonalne)
 * @param {string|null} searchTerm - Termin wyszukiwania (opcjonalne)
 * @param {string|null} searchCategory - Kategoria do filtrowania (opcjonalne)
 * @param {string|null} sortField - Pole do sortowania (opcjonalne)
 * @param {string|null} sortOrder - Kierunek sortowania: 'asc' lub 'desc' (opcjonalne)
 * @returns {Promise<Array|Object>} - Lista pozycji lub obiekt z paginacją
 * @throws {ValidationError} - Gdy parametry są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas pobierania
 */
export const getAllInventoryItems = async (
  warehouseId = null, 
  page = null,
  pageSize = null, 
  searchTerm = null, 
  searchCategory = null, 
  sortField = null, 
  sortOrder = null
) => {
  try {
    // Walidacja parametrów paginacji
    if (page !== null || pageSize !== null) {
      validatePaginationParams({ page, pageSize });
    }

    // Walidacja ID magazynu jeśli podano
    if (warehouseId) {
      validateId(warehouseId, 'warehouseId');
    }

    const itemsRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY);
    
    // Określ pole do sortowania - domyślnie 'name'
    const fieldToSort = SORT_FIELD_MAPPING[sortField] || 'name';
    
    // Określ kierunek sortowania - domyślnie 'asc'
    const direction = sortOrder === 'desc' ? 'desc' : 'asc';
    
    // POPRAWKA: Pobierz wszystkie dokumenty bez sortowania Firebase
    // Firebase orderBy pomija dokumenty które nie mają danego pola!
    // Sortowanie robimy po stronie klienta aby uniknąć pomijania dokumentów
    const q = query(itemsRef);
    
    // Pobierz wszystkie dokumenty
    const allItemsSnapshot = await getDocs(q);
    let allItems = allItemsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Filtruj po terminie wyszukiwania (nazwa, opis, numer CAS)
    if (searchTerm && searchTerm.trim() !== '') {
      const searchTermLower = searchTerm.toLowerCase().trim();
      allItems = allItems.filter(item => 
        (item.name && item.name.toLowerCase().includes(searchTermLower)) ||
        (item.description && item.description.toLowerCase().includes(searchTermLower)) ||
        (item.casNumber && item.casNumber.toLowerCase().includes(searchTermLower))
      );
    }
    
    // Filtruj po kategorii
    if (searchCategory && searchCategory.trim() !== '') {
      const searchCategoryLower = searchCategory.toLowerCase().trim();
      allItems = allItems.filter(item => 
        (item.category && item.category.toLowerCase().includes(searchCategoryLower))
      );
    }
    
    // Pobierz partie z bazy danych do obliczenia rzeczywistych ilości
    const batchesRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_BATCHES);
    const batchesCache = {};
    
    // Jeśli przekazano warehouseId, pobierz partie tylko dla danego magazynu
    if (warehouseId) {
      const warehouseBatchesQuery = query(batchesRef, where('warehouseId', '==', warehouseId));
      const warehouseBatchesSnapshot = await getDocs(warehouseBatchesQuery);
      
      // Grupuj partie według itemId
      warehouseBatchesSnapshot.docs.forEach(doc => {
        const batch = { id: doc.id, ...doc.data() };
        const itemId = batch.itemId;
        
        if (!batchesCache[itemId]) {
          batchesCache[itemId] = [];
        }
        
        batchesCache[itemId].push(batch);
      });
    } else {
      // Pobierz wszystkie partie
      const allBatchesQuery = query(batchesRef);
      const allBatchesSnapshot = await getDocs(allBatchesQuery);
      
      allBatchesSnapshot.docs.forEach(doc => {
        const batch = { id: doc.id, ...doc.data() };
        const itemId = batch.itemId;
        
        if (!batchesCache[itemId]) {
          batchesCache[itemId] = [];
        }
        
        batchesCache[itemId].push(batch);
      });
    }
    
    // Oblicz rzeczywiste ilości dla wszystkich pozycji na podstawie partii
    for (const item of allItems) {
      const itemBatches = batchesCache[item.id] || [];
      let totalQuantity = 0;
      
      itemBatches.forEach(batch => {
        totalQuantity = preciseAdd(totalQuantity, parseFloat(batch.quantity || 0));
      });
      
      // Przypisz obliczone wartości do pozycji
      item.quantity = formatQuantityPrecision(totalQuantity);
      item.bookedQuantity = formatQuantityPrecision(item.bookedQuantity || 0);
      item.availableQuantity = formatQuantityPrecision(totalQuantity - (item.bookedQuantity || 0));
      item.batches = itemBatches;
      
      // Dodaj informację o magazynie, jeśli filtrujemy po konkretnym magazynie
      if (warehouseId && itemBatches.length > 0) {
        item.warehouseId = warehouseId;
      }
    }
    
    // Sortowanie po stronie klienta dla WSZYSTKICH pól (bezpieczniejsze niż Firebase orderBy)
    if (sortField && fieldToSort) {
      allItems.sort((a, b) => {
        let valueA, valueB;
        
        if (sortField === 'availableQuantity') {
          valueA = Number(a.availableQuantity || 0);
          valueB = Number(b.availableQuantity || 0);
        } else if (sortField === 'totalQuantity') {
          valueA = Number(a.quantity || 0);
          valueB = Number(b.quantity || 0);
        } else if (sortField === 'reservedQuantity') {
          valueA = Number(a.bookedQuantity || 0);
          valueB = Number(b.bookedQuantity || 0);
        } else {
          // Dla stringów i innych pól
          valueA = (a[fieldToSort] || '').toString().toLowerCase();
          valueB = (b[fieldToSort] || '').toString().toLowerCase();
        }
        
        // Porównanie numeryczne dla liczb, leksykograficzne dla stringów
        if (typeof valueA === 'number' && typeof valueB === 'number') {
          return sortOrder === 'desc' ? valueB - valueA : valueA - valueB;
        } else {
          if (valueA < valueB) return sortOrder === 'desc' ? 1 : -1;
          if (valueA > valueB) return sortOrder === 'desc' ? -1 : 1;
          return 0;
        }
      });
    }
    
    // Całkowita liczba pozycji po filtrowaniu
    const totalCount = allItems.length;
    
    // Zastosuj paginację, jeśli podano parametry paginacji
    if (page !== null && pageSize !== null) {
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      
      const paginatedItems = allItems.slice(startIndex, endIndex);
      
      return {
        items: paginatedItems,
        totalCount: totalCount,
        page: page,
        pageSize: pageSize,
        totalPages: Math.ceil(totalCount / pageSize)
      };
    }
    
    // Jeśli nie ma paginacji, zwróć wszystkie elementy
    return allItems;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas pobierania pozycji magazynowych:', error);
    throw new Error(`Nie udało się pobrać pozycji magazynowych: ${error.message}`);
  }
};

/**
 * Pobiera pozycję magazynową po ID
 * @param {string} itemId - ID pozycji magazynowej
 * @returns {Promise<Object|null>} - Dane pozycji lub null jeśli nie istnieje
 * @throws {ValidationError} - Gdy ID jest nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas pobierania
 */
export const getInventoryItemById = async (itemId) => {
  try {
    // Walidacja ID
    const validatedId = validateId(itemId, 'itemId');
    
    const docRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY, validatedId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data()
      };
    } else {
      console.log(`Pozycja magazynowa o ID ${validatedId} nie istnieje`);
      return null;
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas pobierania pozycji magazynowej:', error);
    throw new Error(`Nie udało się pobrać pozycji magazynowej: ${error.message}`);
  }
};

/**
 * Pobiera pozycję magazynową po nazwie
 * @param {string} name - Nazwa pozycji
 * @returns {Promise<Object|null>} - Znaleziona pozycja lub null
 * @throws {ValidationError} - Gdy nazwa jest nieprawidłowa
 * @throws {Error} - Gdy wystąpi błąd podczas pobierania
 */
export const getInventoryItemByName = async (name) => {
  try {
    // Walidacja nazwy
    const validatedName = validateRequiredString(name, 'name');
    
    const itemsRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY);
    const q = query(itemsRef, where('name', '==', validatedName));
    
    const querySnapshot = await getDocs(q);
    if (querySnapshot.docs.length > 0) {
      const doc = querySnapshot.docs[0];
      return {
        id: doc.id,
        ...doc.data()
      };
    }
    
    return null;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas wyszukiwania pozycji po nazwie:', error);
    throw new Error(`Nie udało się znaleźć pozycji po nazwie: ${error.message}`);
  }
};

/**
 * Pobiera pozycję magazynową powiązaną z recepturą
 * @param {string} recipeId - ID receptury
 * @returns {Promise<Object|null>} - Znaleziona pozycja lub null
 * @throws {ValidationError} - Gdy ID receptury jest nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas pobierania
 */
export const getInventoryItemByRecipeId = async (recipeId) => {
  try {
    // Walidacja ID receptury
    const validatedRecipeId = validateId(recipeId, 'recipeId');
    
    const itemsRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY);
    const q = query(itemsRef, where('recipeId', '==', validatedRecipeId));
    
    const querySnapshot = await getDocs(q);
    if (querySnapshot.docs.length > 0) {
      const doc = querySnapshot.docs[0];
      return {
        id: doc.id,
        ...doc.data()
      };
    }
    
    return null;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas pobierania pozycji magazynowej dla receptury:', error);
    throw new Error(`Nie udało się pobrać pozycji dla receptury: ${error.message}`);
  }
};

/**
 * ⚡ OPTYMALIZACJA: Pobiera pozycje magazynowe dla wielu receptur jednym zapytaniem batch
 * Zamiast N osobnych zapytań (getInventoryItemByRecipeId w pętli), wykonuje 1 zapytanie
 * z operatorem 'in' (Firestore obsługuje do 30 elementów w 'in').
 * Dla większych zbiorów automatycznie dzieli na chunki po 30.
 * 
 * @param {string[]} recipeIds - Tablica ID receptur
 * @returns {Promise<Object>} - Mapa { recipeId: inventoryItem }
 */
export const getInventoryItemsByRecipeIds = async (recipeIds) => {
  try {
    if (!recipeIds || recipeIds.length === 0) {
      return {};
    }

    // Firestore 'in' obsługuje max 30 elementów - dzielimy na chunki
    const CHUNK_SIZE = 30;
    const inventoryMap = {};
    
    for (let i = 0; i < recipeIds.length; i += CHUNK_SIZE) {
      const chunk = recipeIds.slice(i, i + CHUNK_SIZE);
      
      const itemsRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY);
      const q = query(itemsRef, where('recipeId', 'in', chunk));
      const snapshot = await getDocs(q);
      
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.recipeId) {
          inventoryMap[data.recipeId] = {
            id: doc.id,
            ...data
          };
        }
      });
    }
    
    return inventoryMap;
  } catch (error) {
    console.error('Błąd podczas batch pobierania pozycji magazynowych dla receptur:', error);
    return {};
  }
};

/**
 * Tworzy nową pozycję magazynową
 * @param {Object} itemData - Dane pozycji
 * @param {string} itemData.name - Nazwa pozycji (wymagana)
 * @param {string} [itemData.description] - Opis pozycji
 * @param {string} [itemData.category] - Kategoria pozycji
 * @param {string} [itemData.unit] - Jednostka miary
 * @param {string} [itemData.casNumber] - Numer CAS
 * @param {number} [itemData.quantity] - Ilość początkowa
 * @param {number} [itemData.unitPrice] - Cena jednostkowa
 * @param {string} userId - ID użytkownika tworzącego pozycję
 * @returns {Promise<Object>} - Utworzona pozycja z ID
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy pozycja o takiej nazwie już istnieje lub wystąpi błąd
 */
export const createInventoryItem = async (itemData, userId) => {
  try {
    // Walidacja danych pozycji
    const validatedData = validateInventoryItemData(itemData);
    
    // Walidacja ID użytkownika
    const validatedUserId = validateId(userId, 'userId');
    
    // Sprawdź, czy pozycja o takiej nazwie już istnieje
    const existingItem = await getInventoryItemByName(validatedData.name);
    if (existingItem) {
      throw new ValidationError('Pozycja magazynowa o takiej nazwie już istnieje', 'name');
    }
    
    // Usuń warehouseId z danych (pozycje nie są przypisane do magazynów)
    const { warehouseId, ...dataWithoutWarehouse } = validatedData;
    
    const itemWithMeta = {
      ...dataWithoutWarehouse,
      quantity: formatQuantityPrecision(validatedData.quantity || 0),
      createdBy: validatedUserId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    const collectionRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY);
    const docRef = await addDoc(collectionRef, itemWithMeta);
    
    // Emituj zdarzenie o utworzeniu nowej pozycji magazynowej
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('inventory-updated', { 
        detail: { itemId: docRef.id, action: 'create', itemName: validatedData.name }
      });

      window.dispatchEvent(event);
    }
    
    // Wyczyść cache dla pozycji magazynowych w aiDataService
    try {
      const { clearCache } = await import('../aiDataService');
      clearCache('inventory');
    } catch (error) {
      console.error('Błąd podczas czyszczenia cache inventory:', error);
      // Nie przerywaj operacji jeśli nie udało się wyczyścić cache
    }
    
    // Wyczyść cache zoptymalizowanej funkcji
    clearInventoryItemsCache();
    
    return {
      id: docRef.id,
      ...itemWithMeta
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas tworzenia pozycji magazynowej:', error);
    throw new Error(`Nie udało się utworzyć pozycji magazynowej: ${error.message}`);
  }
};

/**
 * Aktualizuje istniejącą pozycję magazynową
 * @param {string} itemId - ID pozycji do aktualizacji
 * @param {Object} itemData - Nowe dane pozycji
 * @param {string} userId - ID użytkownika aktualizującego pozycję
 * @param {Object} [options] - Opcje (np. skipRecipeUpdates: true - pomiń aktualizację receptur przy zmianie nazwy)
 * @returns {Promise<Object>} - Zaktualizowana pozycja
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy pozycja nie istnieje lub nazwa jest zajęta
 */
export const updateInventoryItem = async (itemId, itemData, userId, options = {}) => {
  try {
    // Walidacja ID
    const validatedId = validateId(itemId, 'itemId');
    const validatedUserId = validateId(userId, 'userId');
    
    console.log('🔧 updateInventoryItem - dane wejściowe:', itemData);
    
    // Walidacja danych pozycji (opcjonalne pola)
    const validatedData = validateInventoryItemData(itemData);
    
    console.log('✅ updateInventoryItem - dane po walidacji:', validatedData);
    
    // Sprawdź czy pozycja istnieje
    const currentItem = await getInventoryItemById(validatedId);
    if (!currentItem) {
      throw new Error('Pozycja magazynowa nie istnieje');
    }
    
    console.log('📊 updateInventoryItem - aktualne dane w bazie:', currentItem);
    
    // Jeśli nazwa się zmienia, sprawdź unikalność
    if (validatedData.name && validatedData.name !== currentItem.name) {
      const existingItem = await getInventoryItemByName(validatedData.name);
      if (existingItem && existingItem.id !== validatedId) {
        throw new ValidationError('Pozycja magazynowa o takiej nazwie już istnieje', 'name');
      }
    }
    
    // Usuń warehouseId z danych (pozycje nie są przypisane do magazynów)
    const { warehouseId, ...dataWithoutWarehouse } = validatedData;
    
    const updatedItem = {
      ...dataWithoutWarehouse,
      updatedAt: serverTimestamp(),
      updatedBy: validatedUserId
    };
    
    // Upewnij się, że quantity jest poprawnie sformatowane
    if (validatedData.quantity !== undefined) {
      updatedItem.quantity = formatQuantityPrecision(validatedData.quantity);
    }
    
    console.log('💾 updateInventoryItem - dane do zapisu w Firebase:', updatedItem);
    console.log('🔑 updateInventoryItem - pola które ZOSTANĄ zaktualizowane:', Object.keys(updatedItem));
    
    const itemRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY, validatedId);
    await updateDoc(itemRef, updatedItem);
    
    console.log('✅ updateInventoryItem - zapis do Firebase zakończony pomyślnie');
    
    // Jeśli nazwa się zmieniła - zaktualizuj składniki we wszystkich recepturach (nowa wersja receptury)
    // Pomijane gdy options.skipRecipeUpdates === true (np. użytkownik odmówił w dialogu)
    let updatedRecipesCount = 0;
    if (!options.skipRecipeUpdates && validatedData.name && validatedData.name !== currentItem.name) {
      try {
        const { getRecipesContainingIngredient, updateRecipe } = await import('../products');
        const recipesToUpdate = await getRecipesContainingIngredient(validatedId);
        
        for (const recipe of recipesToUpdate) {
          try {
            const updatedIngredients = (recipe.ingredients || []).map(ing =>
              ing.id === validatedId ? { ...ing, name: validatedData.name } : ing
            );
            const { id: _recipeId, ...recipeFields } = recipe;
            const recipeDataForUpdate = {
              ...recipeFields,
              ingredients: updatedIngredients
            };
            await updateRecipe(recipe.id, recipeDataForUpdate, validatedUserId);
            updatedRecipesCount++;
          } catch (recipeError) {
            console.error(`Błąd podczas aktualizacji receptury ${recipe.id} po zmianie nazwy SKU:`, recipeError);
          }
        }
        if (updatedRecipesCount > 0) {
          console.log(`📋 updateInventoryItem - zaktualizowano ${updatedRecipesCount} receptur(ach) z nową nazwą składnika`);
        }
      } catch (error) {
        console.error('Błąd podczas aktualizacji receptur po zmianie nazwy pozycji magazynowej:', error);
      }
    }
    
    // Emituj zdarzenie o aktualizacji pozycji magazynowej
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('inventory-updated', { 
        detail: { itemId: validatedId, action: 'update', itemName: updatedItem.name || currentItem.name }
      });
      window.dispatchEvent(event);
    }
    
    // Wyczyść cache dla pozycji magazynowych w aiDataService
    try {
      const { clearCache } = await import('../aiDataService');
      clearCache('inventory');
    } catch (error) {
      console.error('Błąd podczas czyszczenia cache inventory:', error);
      // Nie przerywaj operacji jeśli nie udało się wyczyścić cache
    }
    
    // Wyczyść cache zoptymalizowanej funkcji
    clearInventoryItemsCache();
    
    return {
      id: validatedId,
      ...currentItem,
      ...updatedItem,
      ...(updatedRecipesCount > 0 && { updatedRecipesCount })
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas aktualizacji pozycji magazynowej:', error);
    throw new Error(`Nie udało się zaktualizować pozycji magazynowej: ${error.message}`);
  }
};

/**
 * Usuwa pozycję magazynową wraz z powiązanymi partiami i transakcjami
 * @param {string} itemId - ID pozycji do usunięcia
 * @returns {Promise<Object>} - Obiekt z informacją o sukcesie
 * @throws {ValidationError} - Gdy ID jest nieprawidłowe
 * @throws {Error} - Gdy pozycja nie istnieje lub wystąpi błąd podczas usuwania
 */
export const deleteInventoryItem = async (itemId) => {
  try {
    // Walidacja ID
    const validatedId = validateId(itemId, 'itemId');
    
    // Sprawdź czy pozycja istnieje
    const existingItem = await getInventoryItemById(validatedId);
    if (!existingItem) {
      throw new Error('Pozycja magazynowa nie istnieje');
    }
    
    // Pobierz wszystkie partie związane z tym produktem
    const batchesRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_BATCHES);
    const batchesQuery = query(batchesRef, where('itemId', '==', validatedId));
    const batchesSnapshot = await getDocs(batchesQuery);
    
    // Usuń wszystkie partie
    const batchDeletions = batchesSnapshot.docs.map(doc => 
      deleteDoc(doc.ref)
    );
    await Promise.all(batchDeletions);
    
    // Pobierz transakcje związane z tym produktem
    const transactionsRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_TRANSACTIONS);
    const transactionsQuery = query(transactionsRef, where('itemId', '==', validatedId));
    const transactionsSnapshot = await getDocs(transactionsQuery);
    
    // Usuń wszystkie transakcje
    const transactionDeletions = transactionsSnapshot.docs.map(doc => 
      deleteDoc(doc.ref)
    );
    await Promise.all(transactionDeletions);
    
    // Na końcu usuń sam produkt
    const itemRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY, validatedId);
    await deleteDoc(itemRef);
    
    // Emituj zdarzenie o usunięciu pozycji magazynowej
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('inventory-updated', { 
        detail: { itemId: validatedId, action: 'delete', itemName: existingItem.name }
      });
      window.dispatchEvent(event);
    }
    
    // Wyczyść cache
    try {
      const { clearCache } = await import('../aiDataService');
      clearCache('inventory');
    } catch (error) {
      console.error('Błąd podczas czyszczenia cache inventory:', error);
    }
    
    // Wyczyść cache zoptymalizowanej funkcji
    clearInventoryItemsCache();
    
    return { 
      success: true,
      deletedBatches: batchesSnapshot.docs.length,
      deletedTransactions: transactionsSnapshot.docs.length,
      message: `Usunięto pozycję magazynową "${existingItem.name}" wraz z ${batchesSnapshot.docs.length} partiami i ${transactionsSnapshot.docs.length} transakcjami`
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas usuwania pozycji magazynowej:', error);
    throw new Error(`Nie udało się usunąć pozycji magazynowej: ${error.message}`);
  }
};

/**
 * Pobiera ceny składników (pozycji magazynowych)
 * @param {Array|null} ingredientIds - Opcjonalna lista ID składników do pobrania
 * @param {Object} options - Opcje pobierania cen
 * @param {boolean} [options.useBatchPrices=true] - Czy używać cen z partii
 * @returns {Promise<Object>} - Mapa cen składników (id -> obiekt z cenami)
 * @throws {ValidationError} - Gdy lista ID jest nieprawidłowa
 * @throws {Error} - Gdy wystąpi błąd podczas pobierania
 */
export const getIngredientPrices = async (ingredientIds = null, options = {}) => {
  try {
    // Opcje
    const { useBatchPrices = true } = options;
    
    // Walidacja listy ID jeśli została podana
    if (ingredientIds && Array.isArray(ingredientIds)) {
      // Pozwalamy na większe listy dla tego przypadku użycia
      if (ingredientIds.length > 100) {
        throw new ValidationError('Lista składników nie może zawierać więcej niż 100 elementów', 'ingredientIds');
      }
    }
    
    // Pobierz wszystkie składniki (pozycje magazynowe)
    const itemsQuery = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY);
    const querySnapshot = await getDocs(itemsQuery);
    
    const pricesMap = {};
    const itemsToFetchBatches = [];
    
    // Najpierw pobierz ceny z pozycji magazynowych
    querySnapshot.forEach((doc) => {
      const item = doc.data();
      const itemId = doc.id;
      
      // Jeśli mamy listę ID i element nie jest na liście, pomiń go
      if (ingredientIds && ingredientIds.length > 0 && !ingredientIds.includes(itemId)) {
        return;
      }
      
      // Zapisz cenę jednostkową składnika
      pricesMap[itemId] = {
        itemPrice: item.unitPrice || 0,
        batchPrice: null, // Będzie uzupełnione później, jeśli dostępne
        name: item.name || 'Nieznany składnik'
      };
      
      // Dodaj do listy elementów, dla których chcemy pobrać partie
      if (useBatchPrices) {
        itemsToFetchBatches.push(itemId);
      }
    });
    
    // Sprawdź, czy wszystkie żądane składniki zostały znalezione
    if (ingredientIds) {
      ingredientIds.forEach(id => {
        if (!pricesMap[id]) {
          console.warn(`Nie znaleziono składnika o ID: ${id} w magazynie`);
          // Dodaj pusty wpis, aby uniknąć błędów przy dostępie do pricesMap[id]
          pricesMap[id] = {
            itemPrice: 0,
            batchPrice: 0,
            name: 'Nieznaleziony składnik'
          };
        }
      });
    }
    
    // Jeśli mamy używać cen z partii, pobierz je
    if (useBatchPrices && itemsToFetchBatches.length > 0) {
      // Import funkcji do pobierania partii z odpowiedniego modułu
      const { getItemBatches } = await import('../inventory');
      
      // Dla każdego składnika pobierz partie i użyj ceny z najnowszej partii
      for (const itemId of itemsToFetchBatches) {
        try {
          const batches = await getItemBatches(itemId);
          
          // Znajdź najnowszą partię z ceną i ilością > 0
          const validBatches = batches
            .filter(batch => batch.quantity > 0 && batch.unitPrice !== undefined && batch.unitPrice > 0)
            .sort((a, b) => {
              // Sortuj od najnowszej do najstarszej
              const dateA = convertTimestampToDate(a.receivedDate) || new Date(0);
              const dateB = convertTimestampToDate(b.receivedDate) || new Date(0);
              return dateB - dateA;
            });
          
          // Jeśli znaleziono partię z ceną, użyj jej
          if (validBatches.length > 0) {
            pricesMap[itemId].batchPrice = validBatches[0].unitPrice;
          } else {
            console.warn(`Nie znaleziono ważnych partii z ceną dla składnika ${itemId}`);
          }
        } catch (error) {
          console.error(`Błąd podczas pobierania partii dla składnika ${itemId}:`, error);
          // Kontynuuj z następnym składnikiem
        }
      }
    }
    
    console.log('Pobrane ceny składników:', pricesMap);
    return pricesMap;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas pobierania cen składników:', error);
    throw new Error(`Nie udało się pobrać cen składników: ${error.message}`);
  }
};

/**
 * Wyszukuje pozycje magazynowe według różnych kryteriów
 * @param {Object} searchCriteria - Kryteria wyszukiwania
 * @param {string} [searchCriteria.name] - Nazwa pozycji
 * @param {string} [searchCriteria.category] - Kategoria
 * @param {string} [searchCriteria.casNumber] - Numer CAS
 * @param {string} [searchCriteria.description] - Opis
 * @param {number} [limit=50] - Maksymalna liczba wyników
 * @returns {Promise<Array>} - Lista znalezionych pozycji
 * @throws {Error} - Gdy wystąpi błąd podczas wyszukiwania
 */
export const searchInventoryItems = async (searchCriteria, limit = 50) => {
  try {
    const itemsRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY);
    
    // Buduj zapytanie na podstawie kryteriów
    let q = query(itemsRef);
    
    // Dodaj sortowanie
    q = query(q, orderBy('name', 'asc'));
    
    // Wykonaj zapytanie
    const querySnapshot = await getDocs(q);
    let results = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Filtruj wyniki po stronie klienta (Firebase ma ograniczenia w złożonych zapytaniach)
    if (searchCriteria.name) {
      const nameLower = searchCriteria.name.toLowerCase();
      results = results.filter(item => 
        item.name && item.name.toLowerCase().includes(nameLower)
      );
    }
    
    if (searchCriteria.category) {
      const categoryLower = searchCriteria.category.toLowerCase();
      results = results.filter(item => 
        item.category && item.category.toLowerCase().includes(categoryLower)
      );
    }
    
    if (searchCriteria.casNumber) {
      const casLower = searchCriteria.casNumber.toLowerCase();
      results = results.filter(item => 
        item.casNumber && item.casNumber.toLowerCase().includes(casLower)
      );
    }
    
    if (searchCriteria.description) {
      const descLower = searchCriteria.description.toLowerCase();
      results = results.filter(item => 
        item.description && item.description.toLowerCase().includes(descLower)
      );
    }
    
    // Ogranicz liczbę wyników
    return results.slice(0, limit);
  } catch (error) {
    console.error('Błąd podczas wyszukiwania pozycji magazynowych:', error);
    throw new Error(`Nie udało się wyszukać pozycji magazynowych: ${error.message}`);
  }
};

/**
 * Pobiera oczekiwane zamówienia dla danego produktu magazynowego
 * @param {string} inventoryItemId - ID produktu magazynowego
 * @returns {Promise<Array>} - Lista oczekiwanych zamówień
 */
/**
 * ⚡ OPTYMALIZACJA: Pobiera wszystkie aktywne zamówienia zakupowe i zwraca je zindeksowane po inventoryItemId
 * Używane do grupowego pobierania oczekujących zamówień dla wielu materiałów naraz (10x szybciej!)
 * @returns {Promise<Object>} Mapa { inventoryItemId: [purchaseOrders] }
 */
export const getAllAwaitingOrdersIndexed = async () => {
  try {
    const startTime = performance.now();
    console.log('🔵 [Inventory] getAllAwaitingOrdersIndexed START');
    
    // Pobierz wszystkie aktywne zamówienia zakupowe
    const purchaseOrdersRef = collection(db, 'purchaseOrders');
    const q = query(
      purchaseOrdersRef,
      where('status', 'not-in', ['completed', 'cancelled', 'draft'])
    );
    
    const fetchStart = performance.now();
    const querySnapshot = await getDocs(q);
    console.log('✅ [Inventory] Aktywne PO pobrane', {
      duration: `${(performance.now() - fetchStart).toFixed(2)}ms`,
      count: querySnapshot.size
    });
    
    // ⚡ OPTYMALIZACJA: Zbierz unikalne ID dostawców
    const uniqueSupplierIds = new Set();
    const posWithItems = [];
    
    querySnapshot.docs.forEach(docRef => {
      const poData = docRef.data();
      if (poData.items && Array.isArray(poData.items)) {
        posWithItems.push({ docRef, poData });
        if (poData.supplierId) {
          uniqueSupplierIds.add(poData.supplierId);
        }
      }
    });
    
    // ⚡ OPTYMALIZACJA: Pobierz wszystkich dostawców równolegle
    const supplierStart = performance.now();
    const supplierNamesMap = {};
    if (uniqueSupplierIds.size > 0) {
      const supplierPromises = Array.from(uniqueSupplierIds).map(async (supplierId) => {
        try {
          const supplierDoc = await getDoc(doc(db, 'suppliers', supplierId));
          return {
            supplierId,
            name: supplierDoc.exists() ? supplierDoc.data().name : null
          };
        } catch (error) {
          console.warn(`Nie można pobrać dostawcy ${supplierId}:`, error);
          return { supplierId, name: null };
        }
      });
      
      const supplierResults = await Promise.all(supplierPromises);
      supplierResults.forEach(({ supplierId, name }) => {
        supplierNamesMap[supplierId] = name;
      });
    }
    console.log('✅ [Inventory] Dostawcy pobrani', {
      duration: `${(performance.now() - supplierStart).toFixed(2)}ms`,
      count: uniqueSupplierIds.size
    });
    
    // Indeksuj zamówienia po inventoryItemId
    const indexStart = performance.now();
    const ordersIndex = {};
    
    posWithItems.forEach(({ docRef, poData }) => {
      poData.items.forEach(item => {
        const inventoryItemId = item.inventoryItemId;
        if (!inventoryItemId) return;
        
        const quantityOrdered = parseFloat(item.quantity) || 0;
        const quantityReceived = parseFloat(item.received) || 0;
        const quantityRemaining = Math.max(0, quantityOrdered - quantityReceived);
        
        // Tylko jeśli jest coś do dostarczenia
        if (quantityRemaining <= 0) return;
        
        const orderItem = {
          ...item,
          quantityOrdered,
          quantityReceived,
          quantityRemaining,
          expectedDeliveryDate: convertTimestampToDate(item.plannedDeliveryDate || poData.expectedDeliveryDate),
          poNumber: poData.number || 'Brak numeru'
        };
        
        // Utwórz/pobierz wpis dla tego inventoryItemId
        if (!ordersIndex[inventoryItemId]) {
          ordersIndex[inventoryItemId] = [];
        }
        
        // Sprawdź czy PO już istnieje dla tego materiału
        let existingPO = ordersIndex[inventoryItemId].find(po => po.id === docRef.id);
        
        if (existingPO) {
          // Dodaj item do istniejącego PO
          existingPO.items.push(orderItem);
        } else {
          // Utwórz nowy wpis PO
          ordersIndex[inventoryItemId].push({
            id: docRef.id,
            number: poData.number,
            status: poData.status,
            expectedDeliveryDate: convertTimestampToDate(poData.expectedDeliveryDate),
            orderDate: convertTimestampToDate(poData.orderDate),
            supplierId: poData.supplierId,
            supplierName: poData.supplierId ? supplierNamesMap[poData.supplierId] : null,
            items: [orderItem]
          });
        }
      });
    });
    
    console.log('✅ [Inventory] getAllAwaitingOrdersIndexed COMPLETED', {
      totalDuration: `${(performance.now() - startTime).toFixed(2)}ms`,
      itemsIndexed: Object.keys(ordersIndex).length,
      totalOrders: posWithItems.length
    });
    
    return ordersIndex;
  } catch (error) {
    console.error('❌ [Inventory] getAllAwaitingOrdersIndexed błąd:', error);
    return {};
  }
};

export const getAwaitingOrdersForInventoryItem = async (inventoryItemId) => {
  try {
    const validatedItemId = validateId(inventoryItemId, 'inventoryItemId');
    
    // Pobierz zamówienia zakupowe, które mają status inny niż "completed", "cancelled" lub "draft"
    // i zawierają szukany produkt
    const purchaseOrdersRef = collection(db, 'purchaseOrders');
    const q = query(
      purchaseOrdersRef,
      where('status', 'not-in', ['completed', 'cancelled', 'draft'])
    );
    
    const querySnapshot = await getDocs(q);
    const purchaseOrders = [];
    
    // ⚡ OPTYMALIZACJA: Najpierw zbierz wszystkie unikalne ID dostawców
    const uniqueSupplierIds = new Set();
    const posWithMatchingItems = [];
    
    // Pierwsza iteracja: znajdź pasujące PO i zbierz ID dostawców
    for (const docRef of querySnapshot.docs) {
      const poData = docRef.data();
      
      if (poData.items && Array.isArray(poData.items)) {
        const matchingItems = poData.items.filter(item => 
          item.inventoryItemId === validatedItemId
        );
        
        if (matchingItems.length > 0) {
          posWithMatchingItems.push({ docRef, poData, matchingItems });
          if (poData.supplierId) {
            uniqueSupplierIds.add(poData.supplierId);
          }
        }
      }
    }
    
    // ⚡ OPTYMALIZACJA: Pobierz wszystkich dostawców równolegle
    const supplierNamesMap = {};
    if (uniqueSupplierIds.size > 0) {
      const supplierPromises = Array.from(uniqueSupplierIds).map(async (supplierId) => {
        try {
          const supplierDoc = await getDoc(doc(db, 'suppliers', supplierId));
          return {
            supplierId,
            name: supplierDoc.exists() ? supplierDoc.data().name : null
          };
        } catch (error) {
          console.warn(`Nie można pobrać dostawcy ${supplierId}:`, error);
          return { supplierId, name: null };
        }
      });
      
      const supplierResults = await Promise.all(supplierPromises);
      supplierResults.forEach(({ supplierId, name }) => {
        supplierNamesMap[supplierId] = name;
      });
    }
    
    // Druga iteracja: utwórz obiekty purchaseOrders z nazwami dostawców
    for (const { docRef, poData, matchingItems } of posWithMatchingItems) {
      // Oblicz pozostałą ilość do dostarczenia dla każdego pasującego elementu
      const orderedItems = matchingItems.map(item => {
        const quantityOrdered = parseFloat(item.quantity) || 0;
        const quantityReceived = parseFloat(item.received) || 0;
        const quantityRemaining = Math.max(0, quantityOrdered - quantityReceived);
        
        return {
          ...item,
          quantityOrdered,
          quantityReceived,
          quantityRemaining,
          expectedDeliveryDate: convertTimestampToDate(item.plannedDeliveryDate || poData.expectedDeliveryDate),
          poNumber: poData.number || 'Brak numeru'
        };
      });
      
      // Dodaj tylko te pozycje, które mają niezerową pozostałą ilość do dostarczenia
      const relevantItems = orderedItems.filter(item => item.quantityRemaining > 0);
      
      if (relevantItems.length > 0) {
        purchaseOrders.push({
          id: docRef.id,
          number: poData.number,
          status: poData.status,
          expectedDeliveryDate: convertTimestampToDate(poData.expectedDeliveryDate),
          orderDate: convertTimestampToDate(poData.orderDate),
          supplierId: poData.supplierId,
          supplierName: poData.supplierId ? supplierNamesMap[poData.supplierId] : null,
          items: relevantItems
        });
      }
    }
    
    return purchaseOrders;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas pobierania oczekiwanych zamówień:', error);
    return [];
  }
};

let activePOCache = { data: null, timestamp: 0 };
const ACTIVE_PO_CACHE_TTL = 60000;

export const invalidateActivePOCache = () => {
  activePOCache = { data: null, timestamp: 0 };
};

/**
 * Pobiera aktywne zamówienia zakupowe dla wielu pozycji magazynowych w jednym zapytaniu.
 * Zamiast N osobnych zapytań (getAwaitingOrdersForInventoryItem x N), wykonuje 1 zapytanie
 * na kolekcji purchaseOrders i filtruje wyniki dla wszystkich materialów naraz.
 *
 * @param {Array<string>} inventoryItemIds - Lista ID pozycji magazynowych
 * @returns {Promise<Object>} Mapa { materialId: purchaseOrders[] }
 */
export const getAwaitingOrdersForMultipleItems = async (inventoryItemIds) => {
  try {
    if (!inventoryItemIds || inventoryItemIds.length === 0) return {};

    const validatedIds = new Set(inventoryItemIds.filter(Boolean));
    if (validatedIds.size === 0) return {};

    const now = Date.now();
    let querySnapshot;

    if (activePOCache.data && (now - activePOCache.timestamp) < ACTIVE_PO_CACHE_TTL) {
      querySnapshot = activePOCache.data;
    } else {
      const purchaseOrdersRef = collection(db, 'purchaseOrders');
      const q = query(
        purchaseOrdersRef,
        where('status', 'not-in', ['completed', 'cancelled', 'draft'])
      );
      querySnapshot = await getDocs(q);
      activePOCache = { data: querySnapshot, timestamp: now };
    }

    const resultMap = {};
    validatedIds.forEach(id => { resultMap[id] = []; });

    const uniqueSupplierIds = new Set();
    const posWithMatchingItems = [];

    for (const docRef of querySnapshot.docs) {
      const poData = docRef.data();
      if (!poData.items || !Array.isArray(poData.items)) continue;

      const matchesByMaterial = new Map();

      for (const item of poData.items) {
        if (item.inventoryItemId && validatedIds.has(item.inventoryItemId)) {
          if (!matchesByMaterial.has(item.inventoryItemId)) {
            matchesByMaterial.set(item.inventoryItemId, []);
          }
          matchesByMaterial.get(item.inventoryItemId).push(item);
        }
      }

      if (matchesByMaterial.size > 0) {
        posWithMatchingItems.push({ docRef, poData, matchesByMaterial });
        if (poData.supplierId) {
          uniqueSupplierIds.add(poData.supplierId);
        }
      }
    }

    const supplierNamesMap = {};
    if (uniqueSupplierIds.size > 0) {
      const supplierPromises = Array.from(uniqueSupplierIds).map(async (supplierId) => {
        try {
          const supplierDoc = await getDoc(doc(db, 'suppliers', supplierId));
          return {
            supplierId,
            name: supplierDoc.exists() ? supplierDoc.data().name : null
          };
        } catch (error) {
          return { supplierId, name: null };
        }
      });

      const supplierResults = await Promise.all(supplierPromises);
      supplierResults.forEach(({ supplierId, name }) => {
        supplierNamesMap[supplierId] = name;
      });
    }

    for (const { docRef, poData, matchesByMaterial } of posWithMatchingItems) {
      for (const [materialId, matchingItems] of matchesByMaterial) {
        const orderedItems = matchingItems.map(item => {
          const quantityOrdered = parseFloat(item.quantity) || 0;
          const quantityReceived = parseFloat(item.received) || 0;
          const quantityRemaining = Math.max(0, quantityOrdered - quantityReceived);

          return {
            ...item,
            quantityOrdered,
            quantityReceived,
            quantityRemaining,
            expectedDeliveryDate: convertTimestampToDate(item.plannedDeliveryDate || poData.expectedDeliveryDate),
            poNumber: poData.number || 'Brak numeru'
          };
        });

        const relevantItems = orderedItems.filter(item => item.quantityRemaining > 0);

        if (relevantItems.length > 0) {
          resultMap[materialId].push({
            id: docRef.id,
            number: poData.number,
            status: poData.status,
            expectedDeliveryDate: convertTimestampToDate(poData.expectedDeliveryDate),
            orderDate: convertTimestampToDate(poData.orderDate),
            supplierId: poData.supplierId,
            supplierName: poData.supplierId ? supplierNamesMap[poData.supplierId] : null,
            items: relevantItems
          });
        }
      }
    }

    return resultMap;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas grupowego pobierania oczekiwanych zamówień:', error);
    return {};
  }
};

/**
 * Pobiera unikalne kategorie produktów z magazynu
 * @param {string} warehouseId - ID magazynu (opcjonalne)
 * @returns {Promise<Array<string>>} Lista unikalnych kategorii
 */
export const getInventoryCategories = async (warehouseId = null) => {
  try {
    console.log('🏷️ getInventoryCategories - rozpoczynam pobieranie kategorii');
    
    // Walidacja ID magazynu jeśli podano
    if (warehouseId) {
      validateId(warehouseId, 'warehouseId');
    }

    const itemsRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY);
    const q = query(itemsRef);
    
    // Pobierz wszystkie dokumenty
    const allItemsSnapshot = await getDocs(q);
    const categories = new Set();
    
    allItemsSnapshot.docs.forEach(doc => {
      const item = doc.data();
      
      // Filtruj po magazynie jeśli podano
      if (warehouseId && item.warehouseId !== warehouseId) {
        return;
      }
      
      // Dodaj kategorię do zbioru (jeśli istnieje)
      if (item.category && item.category.trim() !== '') {
        categories.add(item.category.trim());
      }
    });
    
    // Konwertuj Set na Array i posortuj alfabetycznie
    const categoriesArray = Array.from(categories).sort();
    
    console.log('🏷️ getInventoryCategories - znaleziono kategorie:', categoriesArray.length);
    return categoriesArray;
    
  } catch (error) {
    console.error('Błąd podczas pobierania kategorii produktów:', error);
    // W przypadku błędu zwróć podstawowe kategorie z constants
    return ['Surowce', 'Opakowania zbiorcze', 'Opakowania jednostkowe', 'Gotowe produkty', 'Inne'];
  }
};

/**
 * Pobiera produkty z magazynu filtrując bezpośrednio po kategorii w Firebase
 * OPTYMALIZACJA: Zamiast pobierać wszystkie produkty i filtrować po stronie klienta,
 * to zapytanie filtruje na poziomie bazy danych, co znacznie poprawia wydajność
 * 
 * @param {string} category - Kategoria produktów do pobrania
 * @param {string} warehouseId - ID magazynu (opcjonalne)
 * @param {number} page - Numer strony (opcjonalne)
 * @param {number} pageSize - Rozmiar strony (opcjonalne)
 * @param {string} searchTerm - Termin wyszukiwania (opcjonalne)
 * @param {string} sortField - Pole sortowania (opcjonalne)
 * @param {string} sortOrder - Kierunek sortowania (opcjonalne)
 * @returns {Promise<Array|Object>} Lista produktów z wybranej kategorii
 */
export const getInventoryItemsByCategory = async (
  category,
  warehouseId = null,
  page = null,
  pageSize = null,
  searchTerm = null,
  sortField = null,
  sortOrder = null
) => {
  try {
    console.log('🔍 getInventoryItemsByCategory - rozpoczynam optymalne pobieranie dla kategorii:', category);
    
    // Walidacja kategorii
    if (!category || category.trim() === '') {
      throw new ValidationError('Kategoria jest wymagana');
    }
    
    // Walidacja parametrów paginacji
    if (page !== null || pageSize !== null) {
      validatePaginationParams({ page, pageSize });
    }

    // Walidacja ID magazynu jeśli podano
    if (warehouseId) {
      validateId(warehouseId, 'warehouseId');
    }

    const itemsRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY);
    
    // OPTYMALIZACJA: Filtrowanie po kategorii bezpośrednio w Firebase
    let q = query(
      itemsRef,
      where('category', '==', category.trim())
    );
    
    // Dodaj filtr magazynu jeśli podano
    if (warehouseId) {
      q = query(q, where('warehouseId', '==', warehouseId));
    }
    
    // Pobierz dokumenty z Firebase
    const categoryItemsSnapshot = await getDocs(q);
    let categoryItems = categoryItemsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log('🔍 getInventoryItemsByCategory - pobrano z Firebase dla kategorii', category + ':', categoryItems.length, 'pozycji');
    
    // Filtruj po terminie wyszukiwania (nazwa, opis, numer CAS) - już po zoptymalizowanym zbiorze
    if (searchTerm && searchTerm.trim() !== '') {
      const searchTermLower = searchTerm.toLowerCase().trim();
      categoryItems = categoryItems.filter(item => 
        (item.name && item.name.toLowerCase().includes(searchTermLower)) ||
        (item.description && item.description.toLowerCase().includes(searchTermLower)) ||
        (item.casNumber && item.casNumber.toLowerCase().includes(searchTermLower))
      );
      console.log('🔍 getInventoryItemsByCategory - po filtrowaniu wyszukiwania:', categoryItems.length, 'pozycji');
    }
    
    // Pobierz partie z bazy danych do obliczenia rzeczywistych ilości
    const batchesRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_BATCHES);
    const batchesCache = {};
    
    // Pobierz partie dla wszystkich produktów z kategorii (już zoptymalizowany zbiór)
    const itemIds = categoryItems.map(item => item.id);
    console.log('🔍 getInventoryItemsByCategory - pobieranie partii dla', itemIds.length, 'produktów');
    
    // Grupuj zapytania o partie w batche po 10 (limit Firebase 'in')
    const batchSize = 10;
    const itemIdBatches = [];
    for (let i = 0; i < itemIds.length; i += batchSize) {
      itemIdBatches.push(itemIds.slice(i, i + batchSize));
    }
    
    // Pobierz wszystkie partie w równoległych zapytaniach
    const batchPromises = itemIdBatches.map(async (idBatch) => {
      if (idBatch.length === 0) return [];
      
      const batchQuery = query(
        batchesRef, 
        where('itemId', 'in', idBatch)
      );
      const batchSnapshot = await getDocs(batchQuery);
      return batchSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    });
    
    const allBatches = (await Promise.all(batchPromises)).flat();
    
    // Organizuj partie w cache według itemId (pole w bazie to 'itemId', nie 'inventoryItemId')
    allBatches.forEach(batch => {
      const batchItemId = batch.itemId || batch.inventoryItemId; // Obsługa obu pól dla kompatybilności
      if (!batchItemId) return;
      
      if (!batchesCache[batchItemId]) {
        batchesCache[batchItemId] = [];
      }
      batchesCache[batchItemId].push(batch);
    });
    
    console.log('🔍 getInventoryItemsByCategory - pobrano', allBatches.length, 'partii dla kategorii', category);
    
    // Przelicz rzeczywiste ilości dla każdego produktu z kategorii
    const enrichedItems = categoryItems.map(item => {
      const itemBatches = batchesCache[item.id] || [];
      
      // Oblicz rzeczywistą ilość z partii
      const realQuantity = itemBatches.reduce((total, batch) => {
        return total + (parseFloat(batch.quantity) || 0);
      }, 0);
      
      // Pobierz najniższą cenę jednostkową z partii
      const batchPrices = itemBatches
        .map(batch => parseFloat(batch.unitPrice) || 0)
        .filter(price => price > 0);
      const lowestUnitPrice = batchPrices.length > 0 ? Math.min(...batchPrices) : (parseFloat(item.unitPrice) || 0);
      
      return {
        ...item,
        quantity: realQuantity,
        unitPrice: lowestUnitPrice,
        batchCount: itemBatches.length,
        batches: itemBatches // Dodajemy partie dla ewentualnego użycia
      };
    });
    
    // Określ pole do sortowania
    const fieldToSort = SORT_FIELD_MAPPING[sortField] || 'name';
    const direction = sortOrder === 'desc' ? 'desc' : 'asc';
    
    // Sortowanie po stronie klienta (już na zoptymalizowanym zbiorze)
    enrichedItems.sort((a, b) => {
      let aVal = a[fieldToSort];
      let bVal = b[fieldToSort];
      
      // Obsługa różnych typów danych
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (typeof aVal === 'undefined') aVal = '';
      if (typeof bVal === 'undefined') bVal = '';
      
      if (direction === 'desc') {
        return bVal > aVal ? 1 : bVal < aVal ? -1 : 0;
      } else {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      }
    });
    
    console.log('🔍 getInventoryItemsByCategory - posortowano według:', fieldToSort, direction);
    
    // Oblicz statystyki
    const totalCount = enrichedItems.length;
    const totalValue = enrichedItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    
    // Paginacja (jeśli wymagana)
    let paginatedItems = enrichedItems;
    let totalPages = 1;
    
    if (page && pageSize) {
      const startIndex = (page - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      paginatedItems = enrichedItems.slice(startIndex, endIndex);
      totalPages = Math.ceil(totalCount / pageSize);
      
      console.log('🔍 getInventoryItemsByCategory - paginacja:', {
        page,
        pageSize,
        totalPages,
        totalCount,
        returnedCount: paginatedItems.length
      });
    }
    
    // Zwróć wynik w formacie zgodnym z getAllInventoryItems
    const result = {
      items: paginatedItems,
      totalCount,
      totalPages,
      currentPage: page || 1,
      totalValue,
      category,
      hasNextPage: page ? page < totalPages : false,
      hasPrevPage: page ? page > 1 : false
    };
    
    console.log('🔍 getInventoryItemsByCategory - wynik końcowy dla kategorii', category + ':', {
      itemsCount: paginatedItems.length,
      totalCount,
      totalValue: totalValue.toFixed(2),
      batchesLoaded: allBatches.length
    });
    
    return result;
    
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas pobierania produktów z kategorii:', error);
    throw new Error(`Nie udało się pobrać produktów z kategorii ${category}: ${error.message}`);
  }
};

// Cache dla pozycji magazynowych - optymalizacja dla interfejsu listy
let inventoryItemsCache = null;
let inventoryItemsCacheTimestamp = null;
const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minut

/**
 * NOWA ZOPTYMALIZOWANA FUNKCJA dla interfejsu listy pozycji magazynowych
 * 
 * Ta funkcja została stworzona aby rozwiązać problem wydajności w interfejsie listy:
 * - Cachuje wszystkie pozycje magazynowe po pierwszym pobraniu
 * - Dynamicznie pobiera partie tylko dla aktualnie wyświetlanych pozycji
 * - Nie modyfikuje istniejącej funkcji getAllInventoryItems
 * 
 * @param {Object} params - Parametry zapytania
 * @param {string|null} params.warehouseId - ID magazynu (opcjonalne)
 * @param {number} params.page - Numer strony (wymagany)
 * @param {number} params.pageSize - Rozmiar strony (wymagany)
 * @param {string|null} params.searchTerm - Termin wyszukiwania (opcjonalne)
 * @param {string|null} params.searchCategory - Kategoria do filtrowania (opcjonalne)
 * @param {string|null} params.sortField - Pole do sortowania (opcjonalne)
 * @param {string|null} params.sortOrder - Kierunek sortowania (opcjonalne)
 * @param {boolean} params.forceRefresh - Wymuś odświeżenie cache (opcjonalne)
 * @returns {Promise<Object>} - Obiekt z paginacją i danymi
 */
export const getInventoryItemsOptimized = async ({
  warehouseId = null,
  page,
  pageSize,
  searchTerm = null,
  searchCategory = null,
  sortField = null,
  sortOrder = null,
  forceRefresh = false
}) => {
  try {
    console.log('🚀 getInventoryItemsOptimized - rozpoczynam zoptymalizowane pobieranie');
    console.log('📄 Parametry:', { warehouseId, page, pageSize, searchTerm, searchCategory, sortField, sortOrder, forceRefresh });

    // Walidacja wymaganych parametrów
    validatePaginationParams({ page, pageSize });

    // Walidacja ID magazynu jeśli podano
    if (warehouseId) {
      validateId(warehouseId, 'warehouseId');
    }

    // KROK 1: Sprawdź cache pozycji magazynowych
    const now = Date.now();
    const isCacheValid = inventoryItemsCache && 
                        inventoryItemsCacheTimestamp && 
                        (now - inventoryItemsCacheTimestamp) < CACHE_EXPIRY_MS &&
                        !forceRefresh;

    let allItems;

    if (isCacheValid) {
      console.log('💾 Używam cache pozycji magazynowych');
      allItems = [...inventoryItemsCache];
    } else {
      console.log('🔄 Pobieram świeże dane pozycji magazynowych');
      
      // Pobierz wszystkie pozycje magazynowe (bez partii!)
      const itemsRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY);
      const q = query(itemsRef);
      const allItemsSnapshot = await getDocs(q);
      
      allItems = allItemsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Zaktualizuj cache
      inventoryItemsCache = [...allItems];
      inventoryItemsCacheTimestamp = now;
      
      console.log('💾 Zapisano do cache:', allItems.length, 'pozycji');
    }

    // KROK 2: Filtrowanie po terminie wyszukiwania
    if (searchTerm && searchTerm.trim() !== '') {
      const searchTermLower = searchTerm.toLowerCase().trim();
      allItems = allItems.filter(item => 
        (item.name && item.name.toLowerCase().includes(searchTermLower)) ||
        (item.description && item.description.toLowerCase().includes(searchTermLower)) ||
        (item.casNumber && item.casNumber.toLowerCase().includes(searchTermLower))
      );
      console.log('🔍 Po filtrowaniu wyszukiwania:', allItems.length, 'pozycji');
    }

    // KROK 3: Filtrowanie po kategorii
    if (searchCategory && searchCategory.trim() !== '') {
      const searchCategoryLower = searchCategory.toLowerCase().trim();
      allItems = allItems.filter(item => 
        (item.category && item.category.toLowerCase().includes(searchCategoryLower))
      );
      console.log('🏷️ Po filtrowaniu kategorii:', allItems.length, 'pozycji');
    }

    // KROK 4: Sortowanie
    const fieldToSort = SORT_FIELD_MAPPING[sortField] || 'name';
    const direction = sortOrder === 'desc' ? 'desc' : 'asc';

    allItems.sort((a, b) => {
      let valueA, valueB;
      
      // Dla sortowania po ilościach używamy domyślnych wartości (będą przeliczone z partii)
      if (sortField === 'availableQuantity' || sortField === 'totalQuantity' || sortField === 'reservedQuantity') {
        valueA = Number(a[fieldToSort] || 0);
        valueB = Number(b[fieldToSort] || 0);
      } else {
        // Dla stringów i innych pól
        valueA = (a[fieldToSort] || '').toString().toLowerCase();
        valueB = (b[fieldToSort] || '').toString().toLowerCase();
      }
      
      if (typeof valueA === 'number' && typeof valueB === 'number') {
        return direction === 'desc' ? valueB - valueA : valueA - valueB;
      } else {
        if (valueA < valueB) return direction === 'desc' ? 1 : -1;
        if (valueA > valueB) return direction === 'desc' ? -1 : 1;
        return 0;
      }
    });

    // KROK 5: Paginacja - wytnij tylko aktualną stronę
    const totalCount = allItems.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const pageItems = allItems.slice(startIndex, endIndex);

    console.log('📄 Paginacja - strona:', page, 'rozmiar:', pageSize, 'pozycji na stronie:', pageItems.length);

    // KROK 6: Pobierz partie TYLKO dla pozycji na aktualnej stronie
    const pageItemIds = pageItems.map(item => item.id);
    const batchesRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_BATCHES);
    
    console.log('🎯 Pobieram partie tylko dla', pageItemIds.length, 'pozycji na aktualnej stronie');

    // Grupuj zapytania o partie w batche po 10 (limit Firebase 'in')
    const batchSize = 10;
    const itemIdBatches = [];
    for (let i = 0; i < pageItemIds.length; i += batchSize) {
      itemIdBatches.push(pageItemIds.slice(i, i + batchSize));
    }

    // Pobierz partie dla pozycji na aktualnej stronie
    const batchPromises = itemIdBatches.map(async (idBatch) => {
      if (idBatch.length === 0) return [];
      
      let batchQuery;
      if (warehouseId) {
        // Filtruj po magazynie I po pozycjach
        batchQuery = query(
          batchesRef,
          where('itemId', 'in', idBatch),
          where('warehouseId', '==', warehouseId)
        );
      } else {
        // Tylko po pozycjach
        batchQuery = query(
          batchesRef,
          where('itemId', 'in', idBatch)
        );
      }
      
      const batchSnapshot = await getDocs(batchQuery);
      return batchSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    });

    const pageBatches = (await Promise.all(batchPromises)).flat();
    
    console.log('📦 Pobrano', pageBatches.length, 'partii dla aktualnej strony');

    // KROK 7: Organizuj partie w cache według itemId
    const batchesCache = {};
    pageBatches.forEach(batch => {
      const itemId = batch.itemId;
      if (!batchesCache[itemId]) {
        batchesCache[itemId] = [];
      }
      batchesCache[itemId].push(batch);
    });

    // KROK 8: Przelicz rzeczywiste ilości dla pozycji na stronie
    const enrichedPageItems = pageItems.map(item => {
      const itemBatches = batchesCache[item.id] || [];
      let totalQuantity = 0;

      itemBatches.forEach(batch => {
        totalQuantity = preciseAdd(totalQuantity, parseFloat(batch.quantity || 0));
      });

      // Przypisz obliczone wartości
      const enrichedItem = {
        ...item,
        quantity: formatQuantityPrecision(totalQuantity),
        bookedQuantity: formatQuantityPrecision(item.bookedQuantity || 0),
        availableQuantity: formatQuantityPrecision(totalQuantity - (item.bookedQuantity || 0)),
        batches: itemBatches,
        batchCount: itemBatches.length
      };

      // Dodaj informację o magazynie, jeśli filtrujemy po konkretnym magazynie
      if (warehouseId && itemBatches.length > 0) {
        enrichedItem.warehouseId = warehouseId;
      }

      return enrichedItem;
    });

    // KROK 9: Zwróć wynik
    const result = {
      items: enrichedPageItems,
      totalCount: totalCount,
      page: page,
      pageSize: pageSize,
      totalPages: totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      // Dodatkowe informacje
      cacheUsed: isCacheValid,
      batchesLoaded: pageBatches.length,
      optimization: {
        totalItemsInCache: inventoryItemsCache?.length || 0,
        itemsOnPage: enrichedPageItems.length,
        batchQueriesExecuted: itemIdBatches.length
      }
    };

    console.log('✅ getInventoryItemsOptimized - zakończono:', {
      totalCount,
      currentPage: page,
      totalPages,
      itemsOnPage: enrichedPageItems.length,
      batchesLoaded: pageBatches.length,
      cacheUsed: isCacheValid
    });

    return result;

  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('❌ Błąd w getInventoryItemsOptimized:', error);
    throw new Error(`Nie udało się pobrać pozycji magazynowych (zoptymalizowane): ${error.message}`);
  }
};

/**
 * Wyczyść cache pozycji magazynowych
 * Użyj tej funkcji gdy wiesz, że dane mogły się zmienić (np. po dodaniu/edycji/usunięciu pozycji)
 */
export const clearInventoryItemsCache = () => {
  inventoryItemsCache = null;
  inventoryItemsCacheTimestamp = null;
  console.log('🗑️ Cache pozycji magazynowych został wyczyszczony');
};

/**
 * Sprawdź status cache pozycji magazynowych
 */
export const getInventoryItemsCacheStatus = () => {
  const now = Date.now();
  return {
    hasCache: !!inventoryItemsCache,
    itemsCount: inventoryItemsCache?.length || 0,
    cacheAge: inventoryItemsCacheTimestamp ? now - inventoryItemsCacheTimestamp : null,
    isValid: inventoryItemsCache && 
             inventoryItemsCacheTimestamp && 
             (now - inventoryItemsCacheTimestamp) < CACHE_EXPIRY_MS,
    expiryTime: inventoryItemsCacheTimestamp ? inventoryItemsCacheTimestamp + CACHE_EXPIRY_MS : null
  };
};

/**
 * Archiwizuje pozycję magazynową.
 * Dozwolone tylko gdy wszystkie powiązane loty mają quantity === 0.
 */
export const archiveInventoryItem = async (itemId) => {
  try {
    if (!itemId) throw new Error('ID pozycji magazynowej jest wymagane');
    const docRef = doc(db, COLLECTIONS.INVENTORY, itemId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error('Pozycja magazynowa nie istnieje');

    const batchesRef = collection(db, COLLECTIONS.INVENTORY_BATCHES);
    const batchesQuery = query(batchesRef, where('itemId', '==', itemId));
    const batchesSnapshot = await getDocs(batchesQuery);

    const nonZeroBatch = batchesSnapshot.docs.find(d => (d.data().quantity || 0) !== 0);
    if (nonZeroBatch) {
      throw new Error('Nie można zarchiwizować pozycji magazynowej — posiada loty z niezerową ilością.');
    }

    await updateDoc(docRef, {
      archived: true,
      archivedAt: serverTimestamp(),
      archivedBy: 'manual'
    });

    clearInventoryItemsCache();
    return { success: true };
  } catch (error) {
    console.error('Błąd podczas archiwizacji pozycji magazynowej:', error);
    throw error;
  }
};

/**
 * Przywraca pozycję magazynową z archiwum
 */
export const unarchiveInventoryItem = async (itemId) => {
  try {
    if (!itemId) throw new Error('ID pozycji magazynowej jest wymagane');
    const docRef = doc(db, COLLECTIONS.INVENTORY, itemId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error('Pozycja magazynowa nie istnieje');

    await updateDoc(docRef, {
      archived: false,
      archivedAt: deleteField()
    });

    clearInventoryItemsCache();
    return { success: true };
  } catch (error) {
    console.error('Błąd podczas przywracania pozycji magazynowej z archiwum:', error);
    throw error;
  }
};

