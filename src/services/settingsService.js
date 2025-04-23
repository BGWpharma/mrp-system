import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase/config';

// Stałe dla dokumentów
const SYSTEM_SETTINGS_DOC = 'settings/system';
const OPENAI_SETTINGS_DOC = 'settings/openai'; 

/**
 * Pobiera ustawienia systemowe z bazy danych
 * @returns {Promise<Object>} Ustawienia systemowe
 */
export const getSystemSettings = async () => {
  try {
    const docRef = doc(db, SYSTEM_SETTINGS_DOC);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return docSnap.data();
    } else {
      // Domyślne ustawienia, gdy nie ma ich w bazie
      return {
        useGlobalApiKey: false
      };
    }
  } catch (error) {
    console.error('Błąd podczas pobierania ustawień systemowych:', error);
    // W przypadku błędu, zwróć podstawowe ustawienia
    return {
      useGlobalApiKey: false
    };
  }
};

/**
 * Zapisuje ustawienia systemowe do bazy danych
 * @param {Object} settingsData - Dane ustawień do zapisania
 * @param {string} userId - ID użytkownika dokonującego zmiany
 * @returns {Promise<boolean>} Czy operacja zakończyła się sukcesem
 */
export const saveSystemSettings = async (settingsData, userId) => {
  try {
    const docRef = doc(db, SYSTEM_SETTINGS_DOC);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      // Aktualizacja istniejących ustawień
      await updateDoc(docRef, {
        ...settingsData,
        updatedBy: userId,
        updatedAt: serverTimestamp()
      });
    } else {
      // Utworzenie nowego dokumentu z ustawieniami
      await setDoc(docRef, {
        ...settingsData,
        createdBy: userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
    
    return true;
  } catch (error) {
    console.error('Błąd podczas zapisywania ustawień systemowych:', error);
    throw error;
  }
};

/**
 * Pobiera globalny klucz API OpenAI (jeśli istnieje)
 * @returns {Promise<string|null>} Klucz API lub null jeśli nie znaleziono
 */
export const getGlobalOpenAIApiKey = async () => {
  try {
    // Zmieniamy referencję na dokument w kolekcji
    const apiKeyRef = doc(db, 'settings', 'openai');
    const apiKeyDoc = await getDoc(apiKeyRef);
    
    if (apiKeyDoc.exists() && apiKeyDoc.data().globalApiKey) {
      return apiKeyDoc.data().globalApiKey;
    }
    
    return null;
  } catch (error) {
    console.error('Błąd podczas pobierania globalnego klucza API OpenAI:', error);
    throw error;
  }
};

/**
 * Zapisuje globalny klucz API OpenAI
 * @param {string} apiKey - Klucz API OpenAI
 * @param {string} userId - ID użytkownika dokonującego zmiany
 * @returns {Promise<void>}
 */
export const saveGlobalOpenAIApiKey = async (apiKey, userId) => {
  try {
    // Zmieniamy referencję na dokument w kolekcji
    const apiKeyRef = doc(db, 'settings', 'openai');
    await updateDoc(apiKeyRef, {
      globalApiKey: apiKey,
      updatedBy: userId,
      updatedAt: serverTimestamp()
    }).catch(async (error) => {
      // Jeśli dokument nie istnieje, tworzymy go
      if (error.code === 'not-found') {
        await setDoc(apiKeyRef, {
          globalApiKey: apiKey,
          updatedBy: userId,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp()
        });
      } else {
        throw error;
      }
    });
  } catch (error) {
    console.error('Błąd podczas zapisywania globalnego klucza API OpenAI:', error);
    throw error;
  }
}; 