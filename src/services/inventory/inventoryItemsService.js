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
  serverTimestamp
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
    
    console.log('🏭 getAllInventoryItems - pobrano z Firebase:', allItems.length, 'pozycji');
    
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
        totalQuantity += parseFloat(batch.quantity || 0);
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
    
    console.log('📈 getAllInventoryItems - wynik końcowy:', totalCount, 'pozycji', page && pageSize ? `(strona ${page}/${Math.ceil(totalCount / pageSize)})` : '(bez paginacji)');
    
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
 * @returns {Promise<Object>} - Zaktualizowana pozycja
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy pozycja nie istnieje lub nazwa jest zajęta
 */
export const updateInventoryItem = async (itemId, itemData, userId) => {
  try {
    // Walidacja ID
    const validatedId = validateId(itemId, 'itemId');
    const validatedUserId = validateId(userId, 'userId');
    
    // Walidacja danych pozycji (opcjonalne pola)
    const validatedData = validateInventoryItemData(itemData);
    
    // Sprawdź czy pozycja istnieje
    const currentItem = await getInventoryItemById(validatedId);
    if (!currentItem) {
      throw new Error('Pozycja magazynowa nie istnieje');
    }
    
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
    
    const itemRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY, validatedId);
    await updateDoc(itemRef, updatedItem);
    
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
    
    return {
      id: validatedId,
      ...currentItem,
      ...updatedItem
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
export const getAwaitingOrdersForInventoryItem = async (inventoryItemId) => {
  try {
    const validatedItemId = validateId(inventoryItemId, 'inventoryItemId');
    
    // Pobierz zamówienia zakupowe, które mają status inny niż "completed" lub "cancelled"
    // i zawierają szukany produkt
    const purchaseOrdersRef = collection(db, 'purchaseOrders');
    const q = query(
      purchaseOrdersRef,
      where('status', 'not-in', ['completed', 'cancelled'])
    );
    
    const querySnapshot = await getDocs(q);
    const purchaseOrders = [];
    
    // Przefiltruj zamówienia, które zawierają szukany produkt
    for (const docRef of querySnapshot.docs) {
      const poData = docRef.data();
      
      if (poData.items && Array.isArray(poData.items)) {
        const matchingItems = poData.items.filter(item => 
          item.inventoryItemId === validatedItemId
        );
        
        if (matchingItems.length > 0) {
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
              expectedDeliveryDate: item.plannedDeliveryDate || poData.expectedDeliveryDate,
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
              expectedDeliveryDate: poData.expectedDeliveryDate,
              orderDate: poData.orderDate,
              items: relevantItems
            });
          }
        }
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

