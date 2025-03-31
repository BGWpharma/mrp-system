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
  currency: 'PLN',
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
  notes: ''
}; 