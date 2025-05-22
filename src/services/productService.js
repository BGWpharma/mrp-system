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
  writeBatch
} from 'firebase/firestore';
import { db } from './firebase/config';

const PRODUCTS_COLLECTION = 'products';

/**
 * Pobiera wszystkie produkty
 * @returns {Promise<Array<string>>} Lista nazw produktów
 */
export const getAllProducts = async () => {
  try {
    const productsRef = collection(db, PRODUCTS_COLLECTION);
    const q = query(productsRef, orderBy('name', 'asc'));
    const querySnapshot = await getDocs(q);
    
    const products = [];
    querySnapshot.forEach((doc) => {
      const product = doc.data();
      products.push(product.name);
    });
    
    // Jeśli lista jest pusta, zwróć listę domyślnych produktów
    if (products.length === 0) {
      return getDefaultProducts();
    }
    
    return products;
  } catch (error) {
    console.error('Błąd podczas pobierania produktów:', error);
    // W przypadku błędu, zwróć domyślną listę produktów
    return getDefaultProducts();
  }
};

/**
 * Dodaje nowy produkt do bazy danych
 * @param {string} name - Nazwa produktu
 * @param {Object} productData - Dodatkowe dane produktu
 * @returns {Promise<string>} ID nowo dodanego produktu
 */
export const addProduct = async (name, productData = {}) => {
  try {
    const productsRef = collection(db, PRODUCTS_COLLECTION);
    
    const newProduct = {
      name,
      ...productData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    const docRef = await addDoc(productsRef, newProduct);
    return docRef.id;
  } catch (error) {
    console.error('Błąd podczas dodawania produktu:', error);
    throw error;
  }
};

/**
 * Aktualizuje istniejący produkt
 * @param {string} productId - ID produktu do aktualizacji
 * @param {Object} productData - Dane do aktualizacji
 * @returns {Promise<void>}
 */
export const updateProduct = async (productId, productData) => {
  try {
    const productRef = doc(db, PRODUCTS_COLLECTION, productId);
    
    const dataToUpdate = {
      ...productData,
      updatedAt: serverTimestamp()
    };
    
    await updateDoc(productRef, dataToUpdate);
  } catch (error) {
    console.error('Błąd podczas aktualizacji produktu:', error);
    throw error;
  }
};

/**
 * Usuwa produkt z bazy danych
 * @param {string} productId - ID produktu do usunięcia
 * @returns {Promise<void>}
 */
export const deleteProduct = async (productId) => {
  try {
    const productRef = doc(db, PRODUCTS_COLLECTION, productId);
    await deleteDoc(productRef);
  } catch (error) {
    console.error('Błąd podczas usuwania produktu:', error);
    throw error;
  }
};

/**
 * Domyślna lista produktów (używana tylko awaryjnie)
 * @returns {Array<string>} Lista nazw produktów
 */
export const getDefaultProducts = () => [
  "BLC-COLL-GLYC",
  "BW3Y-Glycine",
  "BW3Y-MAGN-BISG",
  "BW3Y-VITAMINC",
  "BW3Y-GAINER-VANILLA",
  "BW3Y-PREWORKOUT-CAF-200G",
  "BW3Y-RICECREAM-1500G-CHOCOLATE",
  "BW3Y-WPI-900G-CHOCOLATE",
  "BW3Y-VITD3",
  "BW3Y-ZMMB",
  "BW3Y-ZINC",
  "BW3Y-CREA-MONOHYDRATE",
  "BW3Y-GAINER-CHOCOLATE",
  "BW3Y-CREA-MONOHYDRATE-NON-LABELISEE-300G",
  "BW3Y-O3-CAPS-90",
  "BW3Y-COLL",
  "BW3Y-SHAKER-NOIR-LOGO-600ML",
  "BW3Y-RICECREAM-1500G-VANILLA",
  "BW3Y-DOSING-CUPS",
  "BW3Y-WPI-900G-VANILLA",
  "BW3Y-MULTIVIT",
  "COR-COLLAGEN-PEACH-180G",
  "COR-OMEGA3-250DHA-120CAPS",
  "COR-GLYCINE-300G",
  "COR-CREATINE-300G",
  "COR-NWPI-CHOC-1000G",
  "COR-MULTIVIT 60 caps",
  "COR-PREWORKOUT-200G",
  "GRN-VITAMIND3-CAPS",
  "GRN-VPM-VANILLA-V2",
  "GRN-COLLAGEN-UNFLAVORED",
  "GRN-MCI-COFFEE",
  "GRN-WPI-BLUBERRY",
  "GRN-GLYCINE-LUBLIN",
  "GRN-MULTIVITAMINS-CAPS",
  "GRN-WPI-COFFEE",
  "GRN-OMEGA3-CAPS",
  "GRN-ZINC-CAPS",
  "GRN-VPM-BLUBERRY-V2",
  "GRN-PROBIOTICS-CAPS",
  "GRN-MAGNESIUM-CAPS",
  "GRN-WPC-CHOCOLATE",
  "GRN-VPM-COFFEE-V2",
  "GRN-VITAMINC-CAPS",
  "GRN-COLLAGEN-UNFLAVORED-LUBLIN",
  "GRN-MCI-CHOCOLATE",
  "GRN-WPC-VANILLA",
  "GRN-CREA-UNFLAVORED",
  "GRN-COLLAGEN-COCOA",
  "GRN-MCI-VANILLA",
  "GRN-WPI-CHOCOLATE",
  "GRN-OMEGA3-CAPS-40/30",
  "GRN-WPI-VANILLA",
  "GRN-PREWORKOUT",
  "GRN-GLYCINE",
  "GRN-WPC-BLUBERRY",
  "GRN-BCAA-MANGO",
  "GRN-VPM-CHOCOLATE-V2",
  "GRN-SLEEP-CAPS",
  "GRN-SPIRULINA-TABS",
  "GRN-MCI-BLUEBERRY",
  "GRN-WPC-COFFEE"
];

/**
 * Funkcja pomocnicza do importowania domyślnych produktów do bazy danych
 * Przydatna przy pierwszym uruchomieniu systemu
 * @returns {Promise<void>}
 */
export const importDefaultProductsToDatabase = async () => {
  try {
    const defaultProducts = getDefaultProducts();
    const batch = writeBatch(db);
    
    // Sprawdź, czy kolekcja już istnieje i ma dokumenty
    const productsRef = collection(db, PRODUCTS_COLLECTION);
    const q = query(productsRef);
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      console.log('Baza danych produktów już istnieje, pomijam import');
      return;
    }
    
    // Dodaj wszystkie produkty z listy domyślnej
    for (const productName of defaultProducts) {
      const newProductRef = doc(collection(db, PRODUCTS_COLLECTION));
      batch.set(newProductRef, {
        name: productName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
    
    await batch.commit();
    console.log(`Zaimportowano ${defaultProducts.length} domyślnych produktów do bazy danych`);
  } catch (error) {
    console.error('Błąd podczas importowania domyślnych produktów:', error);
    throw error;
  }
}; 