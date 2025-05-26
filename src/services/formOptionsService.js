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

// Stałe dla kolekcji
const FORM_OPTIONS_COLLECTION = 'formOptions';

// Typy opcji formularzy
export const FORM_OPTION_TYPES = {
  STAFF: 'staff',
  POSITIONS: 'positions', 
  SHIFT_WORKERS: 'shiftWorkers'
};

// Nazwy kategorii opcji
export const FORM_OPTION_CATEGORIES = {
  [FORM_OPTION_TYPES.STAFF]: 'Pracownicy - Imię i nazwisko',
  [FORM_OPTION_TYPES.POSITIONS]: 'Stanowiska',
  [FORM_OPTION_TYPES.SHIFT_WORKERS]: 'Pracownicy zmian'
};

/**
 * Pobiera wszystkie opcje dla danego typu formularza
 * @param {string} optionType - Typ opcji (np. 'staff', 'positions')
 * @returns {Promise<Array>} Lista opcji
 */
export const getFormOptions = async (optionType) => {
  try {
    const q = query(
      collection(db, FORM_OPTIONS_COLLECTION),
      where('type', '==', optionType),
      where('isActive', '==', true),
      orderBy('order', 'asc'),
      orderBy('value', 'asc')
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error(`Błąd podczas pobierania opcji formularza ${optionType}:`, error);
    throw error;
  }
};

/**
 * Pobiera wszystkie opcje (aktywne i nieaktywne) dla administracji
 * @param {string} optionType - Typ opcji
 * @returns {Promise<Array>} Lista wszystkich opcji
 */
export const getAllFormOptions = async (optionType) => {
  try {
    const q = query(
      collection(db, FORM_OPTIONS_COLLECTION),
      where('type', '==', optionType),
      orderBy('order', 'asc'),
      orderBy('value', 'asc')
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error(`Błąd podczas pobierania wszystkich opcji formularza ${optionType}:`, error);
    throw error;
  }
};

/**
 * Dodaje nową opcję formularza
 * @param {string} optionType - Typ opcji
 * @param {string} value - Wartość opcji
 * @param {number} order - Kolejność wyświetlania
 * @param {string} userId - ID użytkownika dodającego
 * @returns {Promise<Object>} Dodana opcja
 */
export const addFormOption = async (optionType, value, order = 0, userId) => {
  try {
    const optionData = {
      type: optionType,
      value: value.trim(),
      order: order,
      isActive: true,
      createdAt: serverTimestamp(),
      createdBy: userId,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    };
    
    const docRef = await addDoc(collection(db, FORM_OPTIONS_COLLECTION), optionData);
    
    return {
      id: docRef.id,
      ...optionData
    };
  } catch (error) {
    console.error('Błąd podczas dodawania opcji formularza:', error);
    throw error;
  }
};

/**
 * Aktualizuje opcję formularza
 * @param {string} optionId - ID opcji
 * @param {Object} updateData - Dane do aktualizacji
 * @param {string} userId - ID użytkownika aktualizującego
 * @returns {Promise<void>}
 */
export const updateFormOption = async (optionId, updateData, userId) => {
  try {
    const docRef = doc(db, FORM_OPTIONS_COLLECTION, optionId);
    
    const dataToUpdate = {
      ...updateData,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    };
    
    await updateDoc(docRef, dataToUpdate);
  } catch (error) {
    console.error('Błąd podczas aktualizacji opcji formularza:', error);
    throw error;
  }
};

/**
 * Usuwa opcję formularza
 * @param {string} optionId - ID opcji do usunięcia
 * @returns {Promise<void>}
 */
export const deleteFormOption = async (optionId) => {
  try {
    const docRef = doc(db, FORM_OPTIONS_COLLECTION, optionId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Błąd podczas usuwania opcji formularza:', error);
    throw error;
  }
};

/**
 * Migruje istniejące opcje z kodu do bazy danych
 * @param {string} optionType - Typ opcji
 * @param {Array} options - Lista opcji do zmigrowania
 * @param {string} userId - ID użytkownika wykonującego migrację
 * @returns {Promise<Object>} Wynik migracji
 */
export const migrateFormOptions = async (optionType, options, userId) => {
  try {
    let migrated = 0;
    let errors = 0;
    
    // Sprawdź czy opcje już istnieją
    const existingOptions = await getAllFormOptions(optionType);
    const existingValues = existingOptions.map(opt => opt.value);
    
    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      
      // Pomiń jeśli opcja już istnieje
      if (existingValues.includes(option)) {
        continue;
      }
      
      try {
        await addFormOption(optionType, option, i, userId);
        migrated++;
      } catch (error) {
        console.error(`Błąd podczas migracji opcji "${option}":`, error);
        errors++;
      }
    }
    
    return {
      success: true,
      migrated,
      errors,
      message: `Zmigrowano ${migrated} opcji. Błędy: ${errors}`
    };
  } catch (error) {
    console.error('Błąd podczas migracji opcji formularza:', error);
    return {
      success: false,
      error: error.message,
      message: 'Wystąpił błąd podczas migracji opcji'
    };
  }
};

/**
 * Pobiera opcje w formacie odpowiednim dla komponentów Select
 * @param {string} optionType - Typ opcji
 * @returns {Promise<Array>} Lista opcji w formacie {value, label}
 */
export const getFormOptionsForSelect = async (optionType) => {
  try {
    const options = await getFormOptions(optionType);
    return options.map(option => ({
      value: option.value,
      label: option.value
    }));
  } catch (error) {
    console.error(`Błąd podczas pobierania opcji dla Select ${optionType}:`, error);
    // Zwróć pustą tablicę w przypadku błędu
    return [];
  }
}; 