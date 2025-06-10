import { 
  doc, 
  getDoc, 
  setDoc,
  updateDoc,
  serverTimestamp,
  collection
} from 'firebase/firestore';
import { db } from './firebase/config';
import { COMPANY_INFO } from '../config';

const COMPANY_SETTINGS_DOC = 'settings/company';
const COMPANY_COLLECTION = 'company';
const COMPANY_DOCUMENT_ID = 'openai'; // Identyfikator dokumentu przechowującego dane firmy

/**
 * Pobiera dane firmy z bazy danych.
 * Najpierw próbuje pobrać z kolekcji company, a jeśli nie znajdzie, 
 * próbuje pobrać z dokumentu settings/company, a na końcu używa domyślnych wartości z config.js
 * 
 * @returns {Promise<Object>} Dane firmy
 */
export const getCompanyData = async () => {
  try {
    // Najpierw spróbuj pobrać z kolekcji company
    const companyRef = doc(db, COMPANY_COLLECTION, COMPANY_DOCUMENT_ID);
    const companyDoc = await getDoc(companyRef);
    
    if (companyDoc.exists()) {
      return {
        id: companyDoc.id,
        ...companyDoc.data()
      };
    }
    
    // Jeśli nie znaleziono w kolekcji company, spróbuj pobrać z dokumentu settings/company
    const settingsRef = doc(db, COMPANY_SETTINGS_DOC);
    const settingsDoc = await getDoc(settingsRef);
    
    if (settingsDoc.exists()) {
      return {
        id: 'settings',
        ...settingsDoc.data()
      };
    }
    
    // Jeśli nie znaleziono w bazie, użyj domyślnych wartości z config.js
    console.warn('Nie znaleziono danych firmy w bazie - używam domyślnych wartości z konfiguracji');
    return {
      id: 'default',
      ...COMPANY_INFO
    };
  } catch (error) {
    console.error('Błąd podczas pobierania danych firmy:', error);
    
    // Jeśli wystąpił błąd, zwróć domyślne wartości z config.js
    return {
      id: 'default',
      ...COMPANY_INFO
    };
  }
};

/**
 * Pobiera dane firmy z dokumentu settings/company
 */
export const getCompanyInfo = async () => {
  try {
    const docRef = doc(db, COMPANY_SETTINGS_DOC);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return docSnap.data();
    } else {
      // Jeśli dokument nie istnieje w bazie, zwróć domyślne dane
      console.warn('Dokument company settings nie istnieje w bazie - używam domyślnych wartości');
      return COMPANY_INFO;
    }
  } catch (error) {
    console.error('Błąd podczas pobierania informacji o firmie:', error);
    // W przypadku błędu, zwróć domyślne wartości
    return COMPANY_INFO;
  }
};

/**
 * Zapisuje dane firmy do bazy danych
 */
export const saveCompanyInfo = async (companyData, userId) => {
  try {
    const docRef = doc(db, COMPANY_SETTINGS_DOC);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      // Aktualizacja istniejących danych
      await updateDoc(docRef, {
        ...companyData,
        updatedBy: userId,
        updatedAt: serverTimestamp()
      });
    } else {
      // Utworzenie nowego dokumentu
      await setDoc(docRef, {
        ...companyData,
        createdBy: userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
    
    return true;
  } catch (error) {
    console.error('Błąd podczas zapisywania danych firmy:', error);
    throw error;
  }
};

/**
 * Aktualizuje dane firmy w dokumencie settings/company
 */
export const updateCompanyInfo = async (data) => {
  try {
    await updateDoc(doc(db, COMPANY_SETTINGS_DOC), {
      ...data,
      updatedAt: serverTimestamp()
    });
    
    return true;
  } catch (error) {
    // Jeśli dokument nie istnieje (błąd not-found), spróbuj go utworzyć
    if (error.code === 'not-found') {
      try {
        await setDoc(doc(db, COMPANY_SETTINGS_DOC), {
          ...data,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        
        return true;
      } catch (innerError) {
        console.error('Błąd podczas tworzenia dokumentu company:', innerError);
        throw innerError;
      }
    }
    
    console.error('Błąd podczas aktualizacji danych firmy:', error);
    throw error;
  }
};

/**
 * Aktualizuje dane firmy w kolekcji company
 * @param {Object} companyData - Dane firmy do aktualizacji
 * @returns {Promise<boolean>} True jeśli operacja się powiodła
 */
export const updateCompanyData = async (companyData) => {
  try {
    const companyRef = doc(db, COMPANY_COLLECTION, COMPANY_DOCUMENT_ID);
    await updateDoc(companyRef, {
      ...companyData,
      updatedAt: new Date().toISOString()
    });
    
    return true;
  } catch (error) {
    console.error('Błąd podczas aktualizacji danych firmy:', error);
    
    // Jeśli dokument nie istnieje, utwórz go
    if (error.code === 'not-found') {
      try {
        await setDoc(doc(db, COMPANY_COLLECTION, COMPANY_DOCUMENT_ID), {
          ...companyData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        
        return true;
      } catch (createError) {
        console.error('Błąd podczas tworzenia dokumentu firmy:', createError);
        throw createError;
      }
    }
    
    throw error;
  }
};

/**
 * Pobiera wszystkie pola z kolekcji company
 */
export const getAllCompanyData = async () => {
  try {
    const companySnapshot = await getDoc(doc(db, COMPANY_COLLECTION, COMPANY_DOCUMENT_ID));
    
    if (companySnapshot.exists()) {
      return companySnapshot.data();
    } else {
      console.warn('Nie znaleziono dokumentu company');
      return null;
    }
  } catch (error) {
    console.error('Błąd podczas pobierania danych z kolekcji company:', error);
    throw error;
  }
};

/**
 * Domyślne dane firmy
 */
export const DEFAULT_COMPANY = {
  name: '',
  address: '',
  city: '',
  nip: '',
  regon: '',
  krs: '',
  email: '',
  phone: '',
  website: '',
  bankAccounts: []
}; 