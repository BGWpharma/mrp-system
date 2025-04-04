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
  serverTimestamp 
} from 'firebase/firestore';
import { db } from './firebase/config';

// Kolekcja stanowisk produkcyjnych
const WORKSTATIONS_COLLECTION = 'workstations';

/**
 * Pobiera wszystkie stanowiska produkcyjne
 * @returns {Promise<Array>} Lista stanowisk produkcyjnych
 */
export const getAllWorkstations = async () => {
  try {
    const workstationsRef = collection(db, WORKSTATIONS_COLLECTION);
    const q = query(workstationsRef, orderBy('name', 'asc'));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Błąd podczas pobierania stanowisk produkcyjnych:', error);
    throw error;
  }
};

/**
 * Pobiera stanowisko produkcyjne po ID
 * @param {string} workstationId - ID stanowiska produkcyjnego
 * @returns {Promise<Object>} Dane stanowiska produkcyjnego
 */
export const getWorkstationById = async (workstationId) => {
  try {
    const docRef = doc(db, WORKSTATIONS_COLLECTION, workstationId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data()
      };
    } else {
      throw new Error('Stanowisko produkcyjne nie istnieje');
    }
  } catch (error) {
    console.error('Błąd podczas pobierania stanowiska produkcyjnego:', error);
    throw error;
  }
};

/**
 * Tworzy nowe stanowisko produkcyjne
 * @param {Object} workstationData - Dane stanowiska produkcyjnego
 * @param {string} userId - ID użytkownika tworzącego stanowisko
 * @returns {Promise<Object>} Utworzone stanowisko produkcyjne
 */
export const createWorkstation = async (workstationData, userId) => {
  try {
    const workstationWithMeta = {
      ...workstationData,
      createdBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    const docRef = await addDoc(collection(db, WORKSTATIONS_COLLECTION), workstationWithMeta);
    
    return {
      id: docRef.id,
      ...workstationWithMeta
    };
  } catch (error) {
    console.error('Błąd podczas tworzenia stanowiska produkcyjnego:', error);
    throw error;
  }
};

/**
 * Aktualizuje stanowisko produkcyjne
 * @param {string} workstationId - ID stanowiska produkcyjnego
 * @param {Object} workstationData - Dane stanowiska produkcyjnego do aktualizacji
 * @param {string} userId - ID użytkownika aktualizującego stanowisko
 * @returns {Promise<Object>} Zaktualizowane stanowisko produkcyjne
 */
export const updateWorkstation = async (workstationId, workstationData, userId) => {
  try {
    const workstationRef = doc(db, WORKSTATIONS_COLLECTION, workstationId);
    
    const updatedWorkstation = {
      ...workstationData,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    };
    
    await updateDoc(workstationRef, updatedWorkstation);
    
    return {
      id: workstationId,
      ...updatedWorkstation
    };
  } catch (error) {
    console.error('Błąd podczas aktualizacji stanowiska produkcyjnego:', error);
    throw error;
  }
};

/**
 * Usuwa stanowisko produkcyjne
 * @param {string} workstationId - ID stanowiska produkcyjnego
 * @returns {Promise<void>}
 */
export const deleteWorkstation = async (workstationId) => {
  try {
    const workstationRef = doc(db, WORKSTATIONS_COLLECTION, workstationId);
    await deleteDoc(workstationRef);
  } catch (error) {
    console.error('Błąd podczas usuwania stanowiska produkcyjnego:', error);
    throw error;
  }
}; 