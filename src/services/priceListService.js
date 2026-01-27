// src/services/priceListService.js
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
import { db } from './firebase/config';

const PRICE_LISTS_COLLECTION = 'priceLists';
const PRICE_LIST_ITEMS_COLLECTION = 'priceListItems';

/**
 * Pobiera wszystkie listy cenowe
 */
export const getAllPriceLists = async () => {
  try {
    const priceListsQuery = query(
      collection(db, PRICE_LISTS_COLLECTION), 
      orderBy('name', 'asc')
    );
    const querySnapshot = await getDocs(priceListsQuery);
    
    const priceLists = [];
    querySnapshot.forEach((doc) => {
      priceLists.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return priceLists;
  } catch (error) {
    console.error('Błąd podczas pobierania list cenowych:', error);
    throw error;
  }
};

/**
 * Pobiera listę cenową po ID
 */
export const getPriceListById = async (priceListId) => {
  try {
    const priceListDoc = await getDoc(doc(db, PRICE_LISTS_COLLECTION, priceListId));
    
    if (!priceListDoc.exists()) {
      throw new Error('Lista cenowa nie została znaleziona');
    }
    
    return {
      id: priceListDoc.id,
      ...priceListDoc.data()
    };
  } catch (error) {
    console.error('Błąd podczas pobierania listy cenowej:', error);
    throw error;
  }
};

/**
 * Tworzy nową listę cenową
 */
export const createPriceList = async (priceListData, userId) => {
  try {
    validatePriceListData(priceListData);
    
    const newPriceList = {
      ...priceListData,
      createdBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    const docRef = await addDoc(collection(db, PRICE_LISTS_COLLECTION), newPriceList);
    return docRef.id;
  } catch (error) {
    console.error('Błąd podczas tworzenia listy cenowej:', error);
    throw error;
  }
};

/**
 * Aktualizuje dane listy cenowej
 */
export const updatePriceList = async (priceListId, priceListData, userId) => {
  try {
    validatePriceListData(priceListData);
    
    const updatedPriceList = {
      ...priceListData,
      updatedBy: userId,
      updatedAt: serverTimestamp()
    };
    
    await updateDoc(doc(db, PRICE_LISTS_COLLECTION, priceListId), updatedPriceList);
    return true;
  } catch (error) {
    console.error('Błąd podczas aktualizacji listy cenowej:', error);
    throw error;
  }
};

/**
 * Usuwa listę cenową
 */
export const deletePriceList = async (priceListId) => {
  try {
    await deleteDoc(doc(db, PRICE_LISTS_COLLECTION, priceListId));
    return true;
  } catch (error) {
    console.error('Błąd podczas usuwania listy cenowej:', error);
    throw error;
  }
};

/**
 * Pobiera elementy listy cenowej
 */
export const getPriceListItems = async (priceListId) => {
  try {
    const itemsQuery = query(
      collection(db, PRICE_LIST_ITEMS_COLLECTION),
      where('priceListId', '==', priceListId),
      orderBy('productName', 'asc')
    );
    
    const querySnapshot = await getDocs(itemsQuery);
    
    const items = [];
    querySnapshot.forEach((doc) => {
      items.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return items;
  } catch (error) {
    console.error('Błąd podczas pobierania elementów listy cenowej:', error);
    throw error;
  }
};

/**
 * Dodaje element do listy cenowej
 */
export const addPriceListItem = async (priceListId, itemData, userId) => {
  try {
    validatePriceListItemData(itemData);
    
    const newItem = {
      ...itemData,
      priceListId,
      createdBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    const docRef = await addDoc(collection(db, PRICE_LIST_ITEMS_COLLECTION), newItem);
    return docRef.id;
  } catch (error) {
    console.error('Błąd podczas dodawania elementu do listy cenowej:', error);
    throw error;
  }
};

/**
 * Aktualizuje element listy cenowej
 */
export const updatePriceListItem = async (itemId, itemData, userId) => {
  try {
    validatePriceListItemData(itemData);
    
    const updatedItem = {
      ...itemData,
      updatedBy: userId,
      updatedAt: serverTimestamp()
    };
    
    await updateDoc(doc(db, PRICE_LIST_ITEMS_COLLECTION, itemId), updatedItem);
    return true;
  } catch (error) {
    console.error('Błąd podczas aktualizacji elementu listy cenowej:', error);
    throw error;
  }
};

/**
 * Usuwa element listy cenowej
 */
export const deletePriceListItem = async (itemId) => {
  try {
    await deleteDoc(doc(db, PRICE_LIST_ITEMS_COLLECTION, itemId));
    return true;
  } catch (error) {
    console.error('Błąd podczas usuwania elementu listy cenowej:', error);
    throw error;
  }
};

/**
 * Pobiera listy cenowe dla klienta
 */
export const getPriceListsByCustomerId = async (customerId) => {
  try {
    const priceListsQuery = query(
      collection(db, PRICE_LISTS_COLLECTION),
      where('customerId', '==', customerId)
    );
    
    const querySnapshot = await getDocs(priceListsQuery);
    
    const priceLists = [];
    querySnapshot.forEach((doc) => {
      priceLists.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return priceLists;
  } catch (error) {
    console.error('Błąd podczas pobierania list cenowych klienta:', error);
    throw error;
  }
};

/**
 * Waliduje dane listy cenowej
 */
const validatePriceListData = (priceListData) => {
  if (!priceListData.name || priceListData.name.trim() === '') {
    throw new Error('Nazwa listy cenowej jest wymagana');
  }
  
  if (!priceListData.customerId) {
    throw new Error('ID klienta jest wymagane');
  }
};

/**
 * Waliduje dane elementu listy cenowej
 */
const validatePriceListItemData = (itemData) => {
  if (!itemData.productId) {
    throw new Error('ID produktu jest wymagane');
  }
  
  if (!itemData.productName || itemData.productName.trim() === '') {
    throw new Error('Nazwa produktu jest wymagana');
  }
  
  if (typeof itemData.price !== 'number' || itemData.price < 0) {
    throw new Error('Cena musi być liczbą nieujemną');
  }
  
  if (typeof itemData.minQuantity !== 'number' || itemData.minQuantity <= 0) {
    throw new Error('Minimalna ilość musi być liczbą dodatnią');
  }
};

/**
 * Domyślne dane nowej listy cenowej
 */
export const DEFAULT_PRICE_LIST = {
  name: '',
  customerId: '',
  customerName: '',
  description: '',
  validFrom: null,
  validTo: null,
  currency: 'EUR',
  isActive: true
};

/**
 * Domyślne dane nowego elementu listy cenowej
 */
export const DEFAULT_PRICE_LIST_ITEM = {
  productId: '',
  productName: '',
  price: 0,
  unit: 'szt.',
  minQuantity: 1,
  notes: '',
  isRecipe: false // Informacja czy element jest recepturą
};

/**
 * Pobiera wszystkie aktywne listy cenowe dla klienta
 * @param {string} customerId - ID klienta
 * @returns {Promise<Array>} - Lista aktywnych list cenowych
 */
export const getActivePriceListsByCustomer = async (customerId) => {
  if (!customerId) return [];
  
  try {
    const priceListsQuery = query(
      collection(db, PRICE_LISTS_COLLECTION),
      where('customerId', '==', customerId),
      where('isActive', '==', true)
    );
    
    const querySnapshot = await getDocs(priceListsQuery);
    
    if (querySnapshot.empty) {
      return []; // Brak aktywnych list cenowych
    }
    
    const priceLists = [];
    querySnapshot.forEach((doc) => {
      priceLists.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return priceLists;
  } catch (error) {
    console.error('Błąd podczas pobierania aktywnych list cenowych klienta:', error);
    return [];
  }
};

/**
 * Pobiera cenę dla produktu danego klienta
 * @param {string} customerId - ID klienta
 * @param {string} productId - ID produktu
 * @param {boolean} isRecipe - Czy produkt jest recepturą
 * @returns {Promise<number|null>} - Cenę lub null jeśli nie znaleziono
 */
export const getPriceForCustomerProduct = async (customerId, productId, isRecipe = false) => {
  if (!customerId || !productId) return null;
  
  try {
    // Pobierz wszystkie aktywne listy cenowe dla klienta
    const priceLists = await getActivePriceListsByCustomer(customerId);
    
    if (priceLists.length === 0) return null;
    
    // Szukaj produktu w listach cenowych
    let bestPrice = null;
    let newestDate = null;
    
    for (const priceList of priceLists) {
      // Pobierz wszystkie pozycje z listy cenowej
      const items = await getPriceListItems(priceList.id);
      
      // Znajdź pozycję dla danego produktu, uwzględniając czy to receptura czy nie
      const item = items.find(item => 
        item.productId === productId && 
        (isRecipe === true ? !!item.isRecipe === true : true)
      );
      
      if (item) {
        const updatedAt = priceList.updatedAt ? new Date(priceList.updatedAt.seconds * 1000) : new Date(0);
        
        // Jeśli pierwsza znaleziona cena lub nowsza lista cenowa
        if (bestPrice === null || (newestDate !== null && updatedAt > newestDate)) {
          bestPrice = item.price;
          newestDate = updatedAt;
        }
      }
    }
    
    return bestPrice;
  } catch (error) {
    console.error('Błąd podczas pobierania ceny dla klienta:', error);
    return null;
  }
};

/**
 * Pobiera pełne dane pozycji z listy cenowej dla produktu danego klienta
 * @param {string} customerId - ID klienta
 * @param {string} productId - ID produktu
 * @param {boolean} isRecipe - Czy produkt jest recepturą
 * @returns {Promise<object|null>} - Obiekt pozycji listy cenowej lub null jeśli nie znaleziono
 */
export const getPriceListItemForCustomerProduct = async (customerId, productId, isRecipe = false) => {
  if (!customerId || !productId) return null;
  
  try {
    // Pobierz wszystkie aktywne listy cenowe dla klienta
    const priceLists = await getActivePriceListsByCustomer(customerId);
    
    if (priceLists.length === 0) return null;
    
    // Szukaj produktu w listach cenowych
    let bestItem = null;
    let newestDate = null;
    
    for (const priceList of priceLists) {
      // Pobierz wszystkie pozycje z listy cenowej
      const items = await getPriceListItems(priceList.id);
      
      // Znajdź pozycję dla danego produktu
      const item = items.find(item => 
        item.productId === productId && 
        (isRecipe === true ? !!item.isRecipe === true : true)
      );
      
      if (item) {
        const updatedAt = priceList.updatedAt ? new Date(priceList.updatedAt.seconds * 1000) : new Date(0);
        
        // Jeśli pierwsza znaleziona pozycja lub nowsza lista cenowa
        if (bestItem === null || (newestDate !== null && updatedAt > newestDate)) {
          bestItem = item;
          newestDate = updatedAt;
        }
      }
    }
    
    return bestItem;
  } catch (error) {
    console.error('Błąd podczas pobierania pozycji z listy cenowej dla klienta:', error);
    return null;
  }
};

/**
 * Pobiera wszystkie listy cenowe zawierające daną recepturę
 * @param {string} recipeId - ID receptury
 * @returns {Promise<Array>} - Lista obiektów zawierających informacje o liście cenowej i pozycji
 */
export const getPriceListsContainingRecipe = async (recipeId) => {
  if (!recipeId) return [];
  
  try {
    // Pobierz wszystkie elementy list cenowych dla danej receptury
    const itemsQuery = query(
      collection(db, PRICE_LIST_ITEMS_COLLECTION),
      where('productId', '==', recipeId),
      where('isRecipe', '==', true)
    );
    
    const itemsSnapshot = await getDocs(itemsQuery);
    
    if (itemsSnapshot.empty) {
      return [];
    }
    
    const priceListsWithItems = [];
    
    // Dla każdego znalezionego elementu, pobierz informacje o liście cenowej
    for (const itemDoc of itemsSnapshot.docs) {
      const itemData = { id: itemDoc.id, ...itemDoc.data() };
      
      try {
        // Pobierz szczegóły listy cenowej
        const priceListDoc = await getDoc(doc(db, PRICE_LISTS_COLLECTION, itemData.priceListId));
        
        if (priceListDoc.exists()) {
          const priceListData = { id: priceListDoc.id, ...priceListDoc.data() };
          
          priceListsWithItems.push({
            priceList: priceListData,
            item: itemData,
            customerName: priceListData.customerName || 'Nieznany klient',
            price: itemData.price || 0,
            unit: itemData.unit || 'szt.',
            notes: itemData.notes || '',
            isActive: priceListData.isActive || false
          });
        }
      } catch (error) {
        console.error(`Błąd podczas pobierania listy cenowej ${itemData.priceListId}:`, error);
      }
    }
    
    // Sortuj według nazwy klienta
    priceListsWithItems.sort((a, b) => 
      (a.customerName || '').localeCompare(b.customerName || '')
    );
    
    return priceListsWithItems;
  } catch (error) {
    console.error('Błąd podczas pobierania list cenowych zawierających recepturę:', error);
    return [];
  }
};

/**
 * Eksportuje listę cenową do formatu CSV
 * Format: SKU, PRICE, CURRENCY, UNIT, MOQ, COMMENTS
 * @param {string} priceListId - ID listy cenowej
 * @returns {Promise<boolean>} - Status powodzenia eksportu
 */
export const exportPriceListToCSV = async (priceListId) => {
  try {
    // Pobierz listę cenową i jej pozycje
    const priceList = await getPriceListById(priceListId);
    const items = await getPriceListItems(priceListId);
    
    if (!items || items.length === 0) {
      throw new Error('Lista cenowa nie zawiera żadnych pozycji do eksportu');
    }
    
    // Import funkcji eksportu - dynamiczny import, aby uniknąć problemów z cyklicznymi zależnościami
    const { exportToCSV } = await import('../utils/exportUtils');
    
    // Nagłówki CSV zgodnie z wymaganiami
    const headers = [
      { label: 'SKU', key: 'productName' },
      { label: 'PRICE', key: 'price' },
      { label: 'CURRENCY', key: 'currency' },
      { label: 'UNIT', key: 'unit' },
      { label: 'MOQ', key: 'minQuantity' },
      { label: 'COMMENTS', key: 'notes' }
    ];
    
    // Przygotuj dane do eksportu - dodaj walutę z głównej listy cenowej do każdej pozycji
    // Formatuj cenę z dwoma miejscami dziesiętnymi (zawsze z kropką, niezależnie od locale)
    const dataForExport = items.map(item => ({
      ...item,
      // Wymuszamy format z kropką dziesiętną (5.00 zamiast 5,00) dla kompatybilności CSV
      price: typeof item.price === 'number' ? Number(item.price).toFixed(2) : String(item.price).replace(',', '.'),
      currency: item.currency || priceList.currency || 'EUR',
      minQuantity: item.minQuantity || 1,
      notes: item.notes || ''
    }));
    
    // Nazwa pliku: nazwa listy cenowej + data
    const sanitizedName = priceList.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `price_list_${sanitizedName}_${dateStr}`;
    
    // Eksportuj do CSV
    const success = exportToCSV(dataForExport, headers, filename);
    
    if (!success) {
      throw new Error('Eksport do CSV nie powiódł się');
    }
    
    return true;
  } catch (error) {
    console.error('Błąd podczas eksportowania listy cenowej do CSV:', error);
    throw error;
  }
};

/**
 * Aktualizuje nazwę produktu we wszystkich pozycjach list cenowych dla danej receptury
 * @param {string} recipeId - ID receptury
 * @param {string} newProductName - Nowa nazwa produktu (SKU)
 * @param {string} userId - ID użytkownika wykonującego aktualizację
 * @returns {Promise<number>} - Liczba zaktualizowanych pozycji
 */
export const updateProductNameInPriceLists = async (recipeId, newProductName, userId) => {
  if (!recipeId || !newProductName) {
    throw new Error('ID receptury i nowa nazwa produktu są wymagane');
  }
  
  try {
    // Pobierz wszystkie elementy list cenowych dla danej receptury
    const itemsQuery = query(
      collection(db, PRICE_LIST_ITEMS_COLLECTION),
      where('productId', '==', recipeId),
      where('isRecipe', '==', true)
    );
    
    const itemsSnapshot = await getDocs(itemsQuery);
    
    if (itemsSnapshot.empty) {
      return 0;
    }
    
    // Aktualizuj każdą pozycję
    let updatedCount = 0;
    const updatePromises = [];
    
    itemsSnapshot.forEach((docSnapshot) => {
      const updatePromise = updateDoc(doc(db, PRICE_LIST_ITEMS_COLLECTION, docSnapshot.id), {
        productName: newProductName,
        updatedBy: userId,
        updatedAt: serverTimestamp()
      });
      updatePromises.push(updatePromise);
      updatedCount++;
    });
    
    await Promise.all(updatePromises);
    
    return updatedCount;
  } catch (error) {
    console.error('Błąd podczas aktualizacji nazwy produktu w listach cenowych:', error);
    throw error;
  }
};