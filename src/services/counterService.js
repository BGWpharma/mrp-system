import { collection, getDocs, query, orderBy, limit, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from './firebase/config';

const COUNTERS_COLLECTION = 'counters';
const CUSTOMERS_COLLECTION = 'customers';

/**
 * Pobiera aktualny obiekt liczników z cachowaniem
 * @returns {Promise<Object>} - Obiekt z aktualnymi licznikami i ich ID
 */
// Dodajemy cachowanie wyników aby zmniejszyć liczbę operacji
let countersCache = null;
let countersCacheExpiry = null;
const CACHE_DURATION = 60000; // 1 minuta w milisekundach

export const getCurrentCounters = async () => {
  try {
    // Jeśli mamy ważne dane w cache, użyj ich zamiast pobierać ponownie
    const now = new Date().getTime();
    if (countersCache && countersCacheExpiry && now < countersCacheExpiry) {
      console.log('Użyto cache dla liczników');
      return countersCache;
    }
    
    const countersRef = collection(db, COUNTERS_COLLECTION);
    const q = query(
      countersRef,
      orderBy('lastUpdated', 'desc'),
      limit(1)
    );
    
    const querySnapshot = await getDocs(q);
    
    let result;
    if (querySnapshot.empty) {
      // Brak liczników - zwróć standardowy obiekt początkowy
      result = { 
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
    } else {
      // Pobierz istniejący licznik
      const counterDoc = querySnapshot.docs[0];
      const data = counterDoc.data();
      
      result = {
        id: counterDoc.id,
        data
      };
    }
    
    // Zapisz w cache
    countersCache = result;
    countersCacheExpiry = now + CACHE_DURATION;
    
    return result;
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
    
    // Resetuj cache po aktualizacji
    countersCache = null;
    countersCacheExpiry = null;
    
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
