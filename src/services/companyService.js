import { 
  doc, 
  getDoc, 
  setDoc,
  updateDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from './firebase/config';
import { COMPANY_INFO } from '../config';

const COMPANY_SETTINGS_DOC = 'settings/company';

/**
 * Pobiera dane firmy z bazy danych
 * Jeśli dane nie istnieją, zwraca domyślne dane z konfiguracji
 */
export const getCompanyInfo = async () => {
  try {
    const docRef = doc(db, COMPANY_SETTINGS_DOC);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return docSnap.data();
    } else {
      // Jeśli dane nie istnieją w bazie, użyj domyślnych wartości z konfiguracji
      return COMPANY_INFO;
    }
  } catch (error) {
    console.error('Błąd podczas pobierania danych firmy:', error);
    throw error;
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
 * Domyślne dane firmy
 */
export const DEFAULT_COMPANY = {
  name: 'Twoja Firma Sp. z o.o.',
  address: 'ul. Przykładowa 123',
  city: '00-000 Miasto',
  nip: '123-456-78-90',
  regon: '123456789',
  krs: '0000123456',
  email: 'kontakt@twojafirma.pl',
  phone: '+48 123 456 789',
  website: 'www.twojafirma.pl',
  bankName: 'Bank Polski S.A.',
  bankAccount: 'PL 00 1234 5678 9012 3456 7890 1234'
}; 