import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  where 
} from 'firebase/firestore';
import { db } from '../firebase/config';

const COLLECTION_NAME = 'nutritionalComponents';

/**
 * Pobiera wszystkie sk┼éadniki od┼╝ywcze z bazy danych
 * @returns {Promise<Array>} Lista sk┼éadnik├│w od┼╝ywczych
 */
export const getNutritionalComponents = async () => {
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      orderBy('category'),
      orderBy('code')
    );
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('B┼é─ůd przy pobieraniu sk┼éadnik├│w od┼╝ywczych:', error);
    throw error;
  }
};

/**
 * Pobiera sk┼éadniki od┼╝ywcze wed┼éug kategorii
 * @param {string} category - Kategoria sk┼éadnik├│w
 * @returns {Promise<Array>} Lista sk┼éadnik├│w z danej kategorii
 */
export const getNutritionalComponentsByCategory = async (category) => {
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      where('category', '==', category),
      orderBy('code')
    );
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error(`B┼é─ůd przy pobieraniu sk┼éadnik├│w kategorii ${category}:`, error);
    throw error;
  }
};

/**
 * Dodaje nowy sk┼éadnik od┼╝ywczy
 * @param {Object} componentData - Dane sk┼éadnika
 * @returns {Promise<string>} ID nowego sk┼éadnika
 */
export const addNutritionalComponent = async (componentData) => {
  try {
    const docRef = await addDoc(collection(db, COLLECTION_NAME), {
      ...componentData,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    return docRef.id;
  } catch (error) {
    console.error('B┼é─ůd przy dodawaniu sk┼éadnika od┼╝ywczego:', error);
    throw error;
  }
};

/**
 * Aktualizuje sk┼éadnik od┼╝ywczy
 * @param {string} id - ID sk┼éadnika
 * @param {Object} componentData - Nowe dane sk┼éadnika
 * @returns {Promise<void>}
 */
export const updateNutritionalComponent = async (id, componentData) => {
  try {
    await updateDoc(doc(db, COLLECTION_NAME, id), {
      ...componentData,
      updatedAt: new Date()
    });
  } catch (error) {
    console.error('B┼é─ůd przy aktualizacji sk┼éadnika od┼╝ywczego:', error);
    throw error;
  }
};

/**
 * Usuwa sk┼éadnik od┼╝ywczy
 * @param {string} id - ID sk┼éadnika
 * @returns {Promise<void>}
 */
export const deleteNutritionalComponent = async (id) => {
  try {
    await deleteDoc(doc(db, COLLECTION_NAME, id));
  } catch (error) {
    console.error('B┼é─ůd przy usuwaniu sk┼éadnika od┼╝ywczego:', error);
    throw error;
  }
};

/**
 * Dodaje sk┼éadnik od┼╝ywczy z okre┼Ťlonym ID (u┼╝ywane w migracji)
 * @param {string} id - ID sk┼éadnika
 * @param {Object} componentData - Dane sk┼éadnika
 * @returns {Promise<void>}
 */
export const setNutritionalComponentWithId = async (id, componentData) => {
  try {
    await setDoc(doc(db, COLLECTION_NAME, id), {
      ...componentData,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  } catch (error) {
    console.error('B┼é─ůd przy ustawianiu sk┼éadnika od┼╝ywczego:', error);
    throw error;
  }
};

/**
 * Sprawdza czy sk┼éadnik o danym kodzie ju┼╝ istnieje
 * @param {string} code - Kod sk┼éadnika
 * @returns {Promise<boolean>} True je┼Ťli sk┼éadnik istnieje
 */
export const checkComponentExists = async (code) => {
  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      where('code', '==', code)
    );
    const querySnapshot = await getDocs(q);
    return !querySnapshot.empty;
  } catch (error) {
    console.error('B┼é─ůd przy sprawdzaniu istnienia sk┼éadnika:', error);
    throw error;
  }
};

const nutritionalComponentsService = {
  getNutritionalComponents,
  getNutritionalComponentsByCategory,
  addNutritionalComponent,
  updateNutritionalComponent,
  deleteNutritionalComponent,
  setNutritionalComponentWithId,
  checkComponentExists
};

export default nutritionalComponentsService;
