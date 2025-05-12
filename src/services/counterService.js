import { collection, getDocs, query, orderBy, limit, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from './firebase/config';

const COUNTERS_COLLECTION = 'counters';
const CUSTOMERS_COLLECTION = 'customers';

/**
 * Pobiera aktualny obiekt liczników
 * @returns {Promise<Object>} - Obiekt z aktualnymi licznikami i ich ID
 */
export const getCurrentCounters = async () => {
  try {
    const countersRef = collection(db, COUNTERS_COLLECTION);
    const q = query(
      countersRef,
      orderBy('lastUpdated', 'desc'),
      limit(1)
    );
    
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      // Brak liczników - zwróć standardowy obiekt początkowy
      return { 
        data: {
          MO: 1,
          PO: 1,
          CO: 1,
          LOT: 1,
          lastUpdated: new Date(),
          customerCounters: {}
        },
        id: null
      };
    }
    
    // Pobierz istniejący licznik
    const counterDoc = querySnapshot.docs[0];
    const data = counterDoc.data();
    
    return {
      id: counterDoc.id,
      data
    };
  } catch (error) {
    console.error('Błąd podczas pobierania liczników:', error);
    throw error;
  }
};

/**
 * Aktualizuje wartości liczników
 * @param {string} counterId - ID dokumentu licznika
 * @param {Object} counterValues - Obiekt z nowymi wartościami liczników
 * @returns {Promise<boolean>} - Status aktualizacji
 */
export const updateCounters = async (counterId, counterValues) => {
  try {
    if (!counterId) {
      // Jeśli brak ID, dodaj nowy dokument
      await addDoc(collection(db, COUNTERS_COLLECTION), {
        ...counterValues,
        lastUpdated: new Date()
      });
    } else {
      // Aktualizuj istniejący dokument
      const counterRef = doc(db, COUNTERS_COLLECTION, counterId);
      await updateDoc(counterRef, {
        ...counterValues,
        lastUpdated: new Date()
      });
    }
    
    return true;
  } catch (error) {
    console.error('Błąd podczas aktualizacji liczników:', error);
    throw error;
  }
};

/**
 * Pobiera dane klientów na podstawie ich ID
 * @returns {Promise<Object>} - Obiekt z mapowaniem ID klientów na ich nazwy
 */
export const getCustomerNames = async () => {
  try {
    const customersRef = collection(db, CUSTOMERS_COLLECTION);
    const querySnapshot = await getDocs(customersRef);
    
    const customerNames = {};
    
    querySnapshot.forEach(doc => {
      const customerData = doc.data();
      customerNames[doc.id] = customerData.name || 'Nieznany klient';
    });
    
    return customerNames;
  } catch (error) {
    console.error('Błąd podczas pobierania danych klientów:', error);
    return {}; // Zwróć pusty obiekt w przypadku błędu
  }
};
