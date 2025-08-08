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
import { getBestSupplierPriceForItem as getBestSupplierPriceForItemFromInventory } from './inventory';

// Stałe dla kolekcji w Firebase
const SUPPLIERS_COLLECTION = 'suppliers';

/**
 * Pobiera wszystkich dostawców
 * @returns {Promise<Array>} - Lista dostawców
 */
export const getAllSuppliers = async () => {
  try {
    const q = query(
      collection(db, SUPPLIERS_COLLECTION), 
      orderBy('name', 'asc')
    );
    
    const querySnapshot = await getDocs(q);
    const suppliers = [];
    
    querySnapshot.forEach(doc => {
      suppliers.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return suppliers;
  } catch (error) {
    console.error('Błąd podczas pobierania dostawców:', error);
    throw error;
  }
};

/**
 * Pobiera tylko wybranych dostawców po ich ID
 * @param {Array<string>} supplierIds - Lista ID dostawców
 * @returns {Promise<Array>} - Lista dostawców o podanych ID
 */
export const getSuppliersByIds = async (supplierIds) => {
  if (!supplierIds || supplierIds.length === 0) return [];
  
  try {
    // Firestore ma limit 10 dla 'in' operator, więc dzielimy na partie
    const batchSize = 10;
    const batches = [];
    
    for (let i = 0; i < supplierIds.length; i += batchSize) {
      const batch = supplierIds.slice(i, i + batchSize);
      batches.push(batch);
    }
    
    const allSuppliers = [];
    
    for (const batch of batches) {
      const q = query(
        collection(db, SUPPLIERS_COLLECTION),
        where('__name__', 'in', batch)
      );
      
      const querySnapshot = await getDocs(q);
      querySnapshot.forEach(doc => {
        allSuppliers.push({
          id: doc.id,
          ...doc.data()
        });
      });
    }
    
    return allSuppliers;
  } catch (error) {
    console.error('Błąd podczas pobierania wybranych dostawców:', error);
    return [];
  }
};

/**
 * Pobiera dostawcę po ID
 * @param {string} id - ID dostawcy
 * @returns {Promise<Object>} - Dane dostawcy
 */
export const getSupplierById = async (id) => {
  try {
    const supplierDoc = await getDoc(doc(db, SUPPLIERS_COLLECTION, id));
    
    if (!supplierDoc.exists()) {
      throw new Error(`Nie znaleziono dostawcy o ID ${id}`);
    }
    
    return {
      id: supplierDoc.id,
      ...supplierDoc.data()
    };
  } catch (error) {
    console.error(`Błąd podczas pobierania dostawcy o ID ${id}:`, error);
    throw error;
  }
};

/**
 * Tworzy nowego dostawcę
 * @param {Object} supplierData - Dane dostawcy
 * @param {string} userId - ID użytkownika
 * @returns {Promise<Object>} - Utworzony dostawca
 */
export const createSupplier = async (supplierData, userId) => {
  try {
    const newSupplier = {
      ...supplierData,
      createdBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    const docRef = await addDoc(collection(db, SUPPLIERS_COLLECTION), newSupplier);
    
    return {
      id: docRef.id,
      ...newSupplier
    };
  } catch (error) {
    console.error('Błąd podczas tworzenia dostawcy:', error);
    throw error;
  }
};

/**
 * Aktualizuje dane dostawcy
 * @param {string} id - ID dostawcy
 * @param {Object} supplierData - Dane dostawcy
 * @param {string} userId - ID użytkownika
 * @returns {Promise<Object>} - Zaktualizowany dostawca
 */
export const updateSupplier = async (id, supplierData, userId) => {
  try {
    const supplierRef = doc(db, SUPPLIERS_COLLECTION, id);
    
    // Sprawdź, czy dostawca istnieje
    const docSnap = await getDoc(supplierRef);
    if (!docSnap.exists()) {
      throw new Error(`Nie znaleziono dostawcy o ID ${id}`);
    }
    
    const updates = {
      ...supplierData,
      updatedBy: userId,
      updatedAt: serverTimestamp()
    };
    
    await updateDoc(supplierRef, updates);
    
    return {
      id: id,
      ...docSnap.data(),
      ...updates
    };
  } catch (error) {
    console.error(`Błąd podczas aktualizacji dostawcy o ID ${id}:`, error);
    throw error;
  }
};

/**
 * Usuwa dostawcę
 * @param {string} id - ID dostawcy
 * @returns {Promise<boolean>} - Wynik usunięcia
 */
export const deleteSupplier = async (id) => {
  try {
    await deleteDoc(doc(db, SUPPLIERS_COLLECTION, id));
    return true;
  } catch (error) {
    console.error(`Błąd podczas usuwania dostawcy o ID ${id}:`, error);
    throw error;
  }
};

/**
 * Pobiera dostawców dla danej pozycji magazynowej
 * @param {string} itemId - ID pozycji magazynowej
 * @returns {Promise<Array>} - Lista dostawców
 */
export const getSuppliersByItem = async (itemId) => {
  try {
    // Pobierz wszystkich dostawców - w przyszłości można dodać powiązanie między przedmiotami a dostawcami
    return getAllSuppliers();
  } catch (error) {
    console.error(`Błąd podczas pobierania dostawców dla przedmiotu o ID ${itemId}:`, error);
    throw error;
  }
};

/**
 * Znajduje najlepszą cenę dostawcy dla pozycji magazynowej
 * @param {string} itemId - ID pozycji magazynowej
 * @param {number} quantity - Ilość produktu
 * @returns {Promise<Object|null>} - Najlepsza cena dostawcy lub null jeśli nie znaleziono
 */
export const getBestSupplierPriceForItem = async (itemId, quantity = 1) => {
  return getBestSupplierPriceForItemFromInventory(itemId, quantity);
};

/**
 * Znajduje najlepsze ceny dostawców dla listy pozycji magazynowych
 * @param {Array} items - Lista obiektów zawierających itemId i quantity
 * @returns {Promise<Object>} - Mapa itemId -> najlepsza cena dostawcy
 */
export const getBestSupplierPricesForItems = async (items) => {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return {};
  }
  
  try {
    const result = {};
    
    // Dla każdej pozycji znajdź najlepszą cenę dostawcy
    for (const item of items) {
      if (item.itemId || item.id) {
        const itemId = item.itemId || item.id;
        const quantity = item.quantity || 1;
        
        const bestPrice = await getBestSupplierPriceForItem(itemId, quantity);
        if (bestPrice) {
          result[itemId] = bestPrice;
        }
      }
    }
    
    return result;
  } catch (error) {
    console.error('Błąd podczas pobierania najlepszych cen dostawców:', error);
    return {};
  }
};

/**
 * Pobiera cenę dostawcy dla konkretnego przedmiotu
 * @param {string} itemId - ID przedmiotu
 * @param {string} supplierId - ID dostawcy
 * @returns {Promise<Object|null>} - Dane cenowe lub null jeśli nie znaleziono
 */
export const getSupplierPriceForItem = async (itemId, supplierId) => {
  try {
    const supplierPricesRef = collection(db, 'inventorySupplierPrices');
    const q = query(
      supplierPricesRef,
      where('itemId', '==', itemId),
      where('supplierId', '==', supplierId)
    );
    
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return null;
    }
    
    const priceDoc = querySnapshot.docs[0];
    const priceData = priceDoc.data();
    
    return {
      id: priceDoc.id,
      ...priceData
    };
  } catch (error) {
    console.error('Błąd podczas pobierania ceny dostawcy dla produktu:', error);
    return null;
  }
}; 