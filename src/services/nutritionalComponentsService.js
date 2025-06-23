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
import { db } from './firebase/config';

const COLLECTION_NAME = 'nutritionalComponents';

/**
 * Pobiera wszystkie składniki odżywcze z bazy danych
 * @returns {Promise<Array>} Lista składników odżywczych
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
    console.error('Błąd przy pobieraniu składników odżywczych:', error);
    throw error;
  }
};

/**
 * Pobiera składniki odżywcze według kategorii
 * @param {string} category - Kategoria składników
 * @returns {Promise<Array>} Lista składników z danej kategorii
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
    console.error(`Błąd przy pobieraniu składników kategorii ${category}:`, error);
    throw error;
  }
};

/**
 * Dodaje nowy składnik odżywczy
 * @param {Object} componentData - Dane składnika
 * @returns {Promise<string>} ID nowego składnika
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
    console.error('Błąd przy dodawaniu składnika odżywczego:', error);
    throw error;
  }
};

/**
 * Aktualizuje składnik odżywczy
 * @param {string} id - ID składnika
 * @param {Object} componentData - Nowe dane składnika
 * @returns {Promise<void>}
 */
export const updateNutritionalComponent = async (id, componentData) => {
  try {
    await updateDoc(doc(db, COLLECTION_NAME, id), {
      ...componentData,
      updatedAt: new Date()
    });
  } catch (error) {
    console.error('Błąd przy aktualizacji składnika odżywczego:', error);
    throw error;
  }
};

/**
 * Usuwa składnik odżywczy
 * @param {string} id - ID składnika
 * @returns {Promise<void>}
 */
export const deleteNutritionalComponent = async (id) => {
  try {
    await deleteDoc(doc(db, COLLECTION_NAME, id));
  } catch (error) {
    console.error('Błąd przy usuwaniu składnika odżywczego:', error);
    throw error;
  }
};

/**
 * Dodaje składnik odżywczy z określonym ID (używane w migracji)
 * @param {string} id - ID składnika
 * @param {Object} componentData - Dane składnika
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
    console.error('Błąd przy ustawianiu składnika odżywczego:', error);
    throw error;
  }
};

/**
 * Sprawdza czy składnik o danym kodzie już istnieje
 * @param {string} code - Kod składnika
 * @returns {Promise<boolean>} True jeśli składnik istnieje
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
    console.error('Błąd przy sprawdzaniu istnienia składnika:', error);
    throw error;
  }
};

export default {
  getNutritionalComponents,
  getNutritionalComponentsByCategory,
  addNutritionalComponent,
  updateNutritionalComponent,
  deleteNutritionalComponent,
  setNutritionalComponentWithId,
  checkComponentExists
}; 