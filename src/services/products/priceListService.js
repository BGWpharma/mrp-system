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
import { db } from '../firebase/config';

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
    console.error('B?é??d podczas pobierania list cenowych:', error);
    throw error;
  }
};

/**
 * Pobiera list?Ö cenow?? po ID
 */
export const getPriceListById = async (priceListId) => {
  try {
    const priceListDoc = await getDoc(doc(db, PRICE_LISTS_COLLECTION, priceListId));
    
    if (!priceListDoc.exists()) {
      throw new Error('Lista cenowa nie zosta?éa znaleziona');
    }
    
    return {
      id: priceListDoc.id,
      ...priceListDoc.data()
    };
  } catch (error) {
    console.error('B?é??d podczas pobierania listy cenowej:', error);
    throw error;
  }
};

/**
 * Tworzy now?? list?Ö cenow??
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
    console.error('B?é??d podczas tworzenia listy cenowej:', error);
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
    console.error('B?é??d podczas aktualizacji listy cenowej:', error);
    throw error;
  }
};

/**
 * Usuwa list?Ö cenow??
 */
export const deletePriceList = async (priceListId) => {
  try {
    await deleteDoc(doc(db, PRICE_LISTS_COLLECTION, priceListId));
    return true;
  } catch (error) {
    console.error('B?é??d podczas usuwania listy cenowej:', error);
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
    console.error('B?é??d podczas pobierania element??w listy cenowej:', error);
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
    console.error('B?é??d podczas dodawania elementu do listy cenowej:', error);
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
    console.error('B?é??d podczas aktualizacji elementu listy cenowej:', error);
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
    console.error('B?é??d podczas usuwania elementu listy cenowej:', error);
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
    console.error('B?é??d podczas pobierania list cenowych klienta:', error);
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
    throw new Error('Cena musi by?ç liczb?? nieujemn??');
  }
  
  if (typeof itemData.minQuantity !== 'number' || itemData.minQuantity <= 0) {
    throw new Error('Minimalna ilo???ç musi by?ç liczb?? dodatni??');
  }
};

/**
 * Domy??lne dane nowej listy cenowej
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
 * Domy??lne dane nowego elementu listy cenowej
 */
export const DEFAULT_PRICE_LIST_ITEM = {
  productId: '',
  productName: '',
  price: 0,
  unit: 'szt.',
  minQuantity: 1,
  notes: '',
  isRecipe: false // Informacja czy element jest receptur??
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
    console.error('B?é??d podczas pobierania aktywnych list cenowych klienta:', error);
    return [];
  }
};

/**
 * Pobiera cen?Ö dla produktu danego klienta
 * @param {string} customerId - ID klienta
 * @param {string} productId - ID produktu
 * @param {boolean} isRecipe - Czy produkt jest receptur??
 * @returns {Promise<number|null>} - Cen?Ö lub null je??li nie znaleziono
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
      
      // Znajd?? pozycj?Ö dla danego produktu, uwzgl?Ödniaj??c czy to receptura czy nie
      const item = items.find(item => 
        item.productId === productId && 
        (isRecipe === true ? !!item.isRecipe === true : true)
      );
      
      if (item) {
        const updatedAt = priceList.updatedAt ? new Date(priceList.updatedAt.seconds * 1000) : new Date(0);
        
        // Je??li pierwsza znaleziona cena lub nowsza lista cenowa
        if (bestPrice === null || (newestDate !== null && updatedAt > newestDate)) {
          bestPrice = item.price;
          newestDate = updatedAt;
        }
      }
    }
    
    return bestPrice;
  } catch (error) {
    console.error('B?é??d podczas pobierania ceny dla klienta:', error);
    return null;
  }
};

/**
 * Pobiera pe?éne dane pozycji z listy cenowej dla produktu danego klienta
 * @param {string} customerId - ID klienta
 * @param {string} productId - ID produktu
 * @param {boolean} isRecipe - Czy produkt jest receptur??
 * @returns {Promise<object|null>} - Obiekt pozycji listy cenowej lub null je??li nie znaleziono
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
      
      // Znajd?? pozycj?Ö dla danego produktu
      const item = items.find(item => 
        item.productId === productId && 
        (isRecipe === true ? !!item.isRecipe === true : true)
      );
      
      if (item) {
        const updatedAt = priceList.updatedAt ? new Date(priceList.updatedAt.seconds * 1000) : new Date(0);
        
        // Je??li pierwsza znaleziona pozycja lub nowsza lista cenowa
        if (bestItem === null || (newestDate !== null && updatedAt > newestDate)) {
          bestItem = item;
          newestDate = updatedAt;
        }
      }
    }
    
    return bestItem;
  } catch (error) {
    console.error('B?é??d podczas pobierania pozycji z listy cenowej dla klienta:', error);
    return null;
  }
};

/**
 * Pobiera wszystkie listy cenowe zawieraj??ce dan?? receptur?Ö
 * @param {string} recipeId - ID receptury
 * @returns {Promise<Array>} - Lista obiekt??w zawieraj??cych informacje o li??cie cenowej i pozycji
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
    
    // Batch fetch list cenowych zamiast N+1 getDoc
    const allItems = itemsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    const priceListIds = [...new Set(allItems.map(i => i.priceListId).filter(Boolean))];
    
    const priceListMap = {};
    if (priceListIds.length > 0) {
      const chunks = [];
      for (let i = 0; i < priceListIds.length; i += 30) {
        chunks.push(priceListIds.slice(i, i + 30));
      }
      const plResults = await Promise.all(
        chunks.map(chunk => {
          const plq = query(collection(db, PRICE_LISTS_COLLECTION), where('__name__', 'in', chunk));
          return getDocs(plq);
        })
      );
      plResults.forEach(snap => {
        snap.docs.forEach(d => { priceListMap[d.id] = { id: d.id, ...d.data() }; });
      });
    }
    
    const priceListsWithItems = [];
    for (const itemData of allItems) {
      const priceListData = priceListMap[itemData.priceListId];
      if (priceListData) {
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
    }
    
    // Sortuj wed?éug nazwy klienta
    priceListsWithItems.sort((a, b) => 
      (a.customerName || '').localeCompare(b.customerName || '')
    );
    
    return priceListsWithItems;
  } catch (error) {
    console.error('B?é??d podczas pobierania list cenowych zawieraj??cych receptur?Ö:', error);
    return [];
  }
};

/**
 * Eksportuje list?Ö cenow?? do formatu CSV
 * Format: SKU, PRICE, CURRENCY, UNIT, MOQ, COMMENTS
 * @param {string} priceListId - ID listy cenowej
 * @returns {Promise<boolean>} - Status powodzenia eksportu
 */
export const exportPriceListToCSV = async (priceListId) => {
  try {
    // Pobierz list?Ö cenow?? i jej pozycje
    const priceList = await getPriceListById(priceListId);
    const items = await getPriceListItems(priceListId);
    
    if (!items || items.length === 0) {
      throw new Error('Lista cenowa nie zawiera ??adnych pozycji do eksportu');
    }
    
    // Import funkcji eksportu - dynamiczny import, aby unikn???ç problem??w z cyklicznymi zale??no??ciami
    const { exportToCSV } = await import('../../utils/exportUtils');
    
    // Nag?é??wki CSV zgodnie z wymaganiami
    const headers = [
      { label: 'SKU', key: 'productName' },
      { label: 'PRICE', key: 'price' },
      { label: 'CURRENCY', key: 'currency' },
      { label: 'UNIT', key: 'unit' },
      { label: 'MOQ', key: 'minQuantity' },
      { label: 'COMMENTS', key: 'notes' }
    ];
    
    // Przygotuj dane do eksportu - dodaj walut?Ö z g?é??wnej listy cenowej do ka??dej pozycji
    // Formatuj cen?Ö z dwoma miejscami dziesi?Ötnymi (zawsze z kropk??, niezale??nie od locale)
    const dataForExport = items.map(item => ({
      ...item,
      // Wymuszamy format z kropk?? dziesi?Ötn?? (5.00 zamiast 5,00) dla kompatybilno??ci CSV
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
      throw new Error('Eksport do CSV nie powi??d?é si?Ö');
    }
    
    return true;
  } catch (error) {
    console.error('B?é??d podczas eksportowania listy cenowej do CSV:', error);
    throw error;
  }
};

/**
 * Aktualizuje nazw?Ö produktu we wszystkich pozycjach list cenowych dla danej receptury
 * @param {string} recipeId - ID receptury
 * @param {string} newProductName - Nowa nazwa produktu (SKU)
 * @param {string} userId - ID u??ytkownika wykonuj??cego aktualizacj?Ö
 * @returns {Promise<number>} - Liczba zaktualizowanych pozycji
 */
export const updateProductNameInPriceLists = async (recipeId, newProductName, userId) => {
  if (!recipeId || !newProductName) {
    throw new Error('ID receptury i nowa nazwa produktu s?? wymagane');
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
    
    // Aktualizuj ka??d?? pozycj?Ö
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
    console.error('B?é??d podczas aktualizacji nazwy produktu w listach cenowych:', error);
    throw error;
  }
};
