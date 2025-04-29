import { db, storage } from './firebase/config';
import { 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  getDoc, 
  updateDoc, 
  query, 
  orderBy, 
  serverTimestamp, 
  deleteDoc 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

const BUG_REPORTS_COLLECTION = 'bugReports';

/**
 * Dodaje nowe zgłoszenie błędu do bazy danych
 * @param {Object} reportData - Dane zgłoszenia
 * @param {File} screenshotFile - Plik zrzutu ekranu
 * @param {string} userId - ID użytkownika zgłaszającego błąd
 * @returns {Promise<string>} - ID utworzonego zgłoszenia
 */
export const addBugReport = async (reportData, screenshotFile, userId) => {
  let reportRef = null;
  
  try {
    // Dodaj podstawowe dane zgłoszenia
    reportRef = await addDoc(collection(db, BUG_REPORTS_COLLECTION), {
      ...reportData,
      status: 'nowy',
      createdAt: serverTimestamp(),
      createdBy: userId,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    });
    
    console.log('Utworzono dokument zgłoszenia błędu:', reportRef.id);

    // Jeśli jest zrzut ekranu, spróbuj go przesłać
    if (screenshotFile) {
      try {
        const storageRef = ref(storage, `bugReports/${reportRef.id}/screenshot`);
        await uploadBytes(storageRef, screenshotFile);
        const screenshotUrl = await getDownloadURL(storageRef);

        // Aktualizuj dokument o URL zrzutu ekranu
        await updateDoc(doc(db, BUG_REPORTS_COLLECTION, reportRef.id), {
          screenshotUrl
        });
        
        console.log('Dodano zrzut ekranu do zgłoszenia');
      } catch (uploadError) {
        console.error('Błąd podczas przesyłania zrzutu ekranu:', uploadError);
        
        // Aktualizuj dokument z informacją o błędzie przesyłania
        if (reportRef) {
          await updateDoc(doc(db, BUG_REPORTS_COLLECTION, reportRef.id), {
            screenshotError: "Nie udało się przesłać zrzutu ekranu z powodu błędu CORS. Zgłoszenie zostało utworzone bez zrzutu."
          });
        }
        
        // Nie zatrzymujemy całego procesu, po prostu logujemy błąd
        console.warn('Zgłoszenie zostało zapisane bez zrzutu ekranu');
      }
    }

    return reportRef.id;
  } catch (error) {
    console.error('Błąd podczas dodawania zgłoszenia błędu:', error);
    
    // Jeśli dokument został już utworzony, ale wystąpił inny błąd, dodajmy informację o tym
    if (reportRef) {
      try {
        await updateDoc(doc(db, BUG_REPORTS_COLLECTION, reportRef.id), {
          hasError: true,
          errorMessage: error.message
        });
      } catch (updateError) {
        console.error('Nie można zaktualizować dokumentu z informacją o błędzie:', updateError);
      }
    }
    
    throw error;
  }
};

/**
 * Dodaje nowe zgłoszenie błędu do bazy danych wraz ze zrzutem ekranu jako dane base64
 * Ta metoda unika problemów z CORS, zapisując zrzut ekranu bezpośrednio w Firestore
 * @param {Object} reportData - Dane zgłoszenia
 * @param {File} screenshotFile - Plik zrzutu ekranu
 * @param {string} userId - ID użytkownika zgłaszającego błąd
 * @returns {Promise<string>} - ID utworzonego zgłoszenia
 */
export const addBugReportWithBase64Screenshot = async (reportData, screenshotFile, userId) => {
  try {
    // Konwertuj plik zrzutu ekranu do base64, jeśli istnieje
    let screenshotBase64 = null;
    if (screenshotFile) {
      screenshotBase64 = await convertFileToBase64(screenshotFile);
    }
    
    // Dodaj podstawowe dane zgłoszenia wraz z zakodowanym zrzutem ekranu
    const reportRef = await addDoc(collection(db, BUG_REPORTS_COLLECTION), {
      ...reportData,
      status: 'nowy',
      createdAt: serverTimestamp(),
      createdBy: userId,
      updatedAt: serverTimestamp(),
      updatedBy: userId,
      screenshotBase64: screenshotBase64
    });

    return reportRef.id;
  } catch (error) {
    console.error('Błąd podczas dodawania zgłoszenia błędu z base64:', error);
    throw error;
  }
};

/**
 * Pomocnicza funkcja do konwersji pliku na string base64
 * @param {File} file - Plik do konwersji
 * @returns {Promise<string>} - Zakodowany string base64
 */
const convertFileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });
};

/**
 * Pobiera listę wszystkich zgłoszeń błędów
 * @returns {Promise<Array>} - Lista zgłoszeń błędów
 */
export const getBugReports = async () => {
  try {
    const q = query(
      collection(db, BUG_REPORTS_COLLECTION),
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Błąd podczas pobierania zgłoszeń błędów:', error);
    throw error;
  }
};

/**
 * Pobiera szczegóły pojedynczego zgłoszenia błędu
 * @param {string} reportId - ID zgłoszenia
 * @returns {Promise<Object>} - Szczegóły zgłoszenia
 */
export const getBugReportById = async (reportId) => {
  try {
    const reportRef = doc(db, BUG_REPORTS_COLLECTION, reportId);
    const reportDoc = await getDoc(reportRef);
    
    if (!reportDoc.exists()) {
      throw new Error('Zgłoszenie nie istnieje');
    }
    
    return {
      id: reportDoc.id,
      ...reportDoc.data()
    };
  } catch (error) {
    console.error('Błąd podczas pobierania zgłoszenia błędu:', error);
    throw error;
  }
};

/**
 * Aktualizuje status zgłoszenia błędu
 * @param {string} reportId - ID zgłoszenia
 * @param {string} status - Nowy status ('nowy', 'w trakcie', 'rozwiązany', 'odrzucony')
 * @param {string} userId - ID użytkownika dokonującego zmiany
 * @returns {Promise<void>}
 */
export const updateBugReportStatus = async (reportId, status, userId) => {
  try {
    const reportRef = doc(db, BUG_REPORTS_COLLECTION, reportId);
    
    await updateDoc(reportRef, {
      status,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    });
  } catch (error) {
    console.error('Błąd podczas aktualizacji statusu zgłoszenia:', error);
    throw error;
  }
};

/**
 * Dodaje komentarz do zgłoszenia błędu
 * @param {string} reportId - ID zgłoszenia
 * @param {string} comment - Treść komentarza
 * @param {string} userId - ID użytkownika dodającego komentarz
 * @returns {Promise<void>}
 */
export const addBugReportComment = async (reportId, comment, userId) => {
  try {
    const reportRef = doc(db, BUG_REPORTS_COLLECTION, reportId);
    const reportDoc = await getDoc(reportRef);
    
    if (!reportDoc.exists()) {
      throw new Error('Zgłoszenie nie istnieje');
    }
    
    const reportData = reportDoc.data();
    const comments = reportData.comments || [];
    
    comments.push({
      text: comment,
      createdAt: new Date(),
      createdBy: userId
    });
    
    await updateDoc(reportRef, {
      comments,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    });
  } catch (error) {
    console.error('Błąd podczas dodawania komentarza:', error);
    throw error;
  }
};

/**
 * Usuwa zgłoszenie błędu
 * @param {string} reportId - ID zgłoszenia
 * @returns {Promise<void>}
 */
export const deleteBugReport = async (reportId) => {
  try {
    // Najpierw pobieramy dane zgłoszenia, żeby sprawdzić, czy ma zrzut ekranu i jakiego typu
    const reportRef = doc(db, BUG_REPORTS_COLLECTION, reportId);
    const reportDoc = await getDoc(reportRef);
    
    if (!reportDoc.exists()) {
      throw new Error('Zgłoszenie nie istnieje');
    }
    
    const reportData = reportDoc.data();
    
    // Jeśli zgłoszenie ma zrzut ekranu w Storage, spróbujemy go usunąć
    if (reportData.screenshotUrl) {
      try {
        const storageRef = ref(storage, `bugReports/${reportId}/screenshot`);
        await deleteObject(storageRef);
        console.log('Usunięto zrzut ekranu z Firebase Storage');
      } catch (storageError) {
        // Ignorujemy błędy usuwania z Storage - nie są krytyczne
        // Najczęściej będą to błędy CORS, które nie powinny blokować usunięcia zgłoszenia
        console.warn('Nie udało się usunąć zrzutu ekranu ze Storage. Kontynuujemy usuwanie zgłoszenia.', storageError);
      }
    }
    
    // Usuwamy dokument z Firestore - to najważniejsza część
    await deleteDoc(reportRef);
    console.log('Zgłoszenie zostało usunięte pomyślnie');
    
    return true;
  } catch (error) {
    console.error('Błąd podczas usuwania zgłoszenia błędu:', error);
    throw error;
  }
}; 