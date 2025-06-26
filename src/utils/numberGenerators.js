import { collection, getDocs, query, orderBy, limit, addDoc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase/config';

const COUNTERS_COLLECTION = 'counters';

/**
 * Pobiera i inkrementuje licznik dla danego typu dokumentu
 * @param {string} counterType - Typ licznika (MO, PO, CO, LOT)
 * @param {string} customerId - ID klienta (opcjonalne, tylko dla licznika CO)
 * @returns {Promise<number>} - Nowy numer
 */
const getNextNumber = async (counterType, customerId = null) => {
  try {
    // Sprawdź, czy istnieje kolekcja liczników
    const countersRef = collection(db, COUNTERS_COLLECTION);
    const q = query(
      countersRef,
      orderBy('lastUpdated', 'desc'),
      limit(1)
    );
    
    const querySnapshot = await getDocs(q);
    
    let counter;
    let currentNumber;
    let counterDocRef;
    
    // Jeśli nie ma liczników, utwórz nowy
    if (querySnapshot.empty) {
      // Utwórz nowy dokument liczników
      counter = {
        MO: 1,
        PO: 1,
        CO: 1,
        LOT: 1,
        lastUpdated: new Date(),
        customerCounters: {} // Pole do przechowywania liczników klientów
      };
      
      // Jeśli to licznik CO dla konkretnego klienta, dodaj go do customerCounters
      if (counterType === 'CO' && customerId) {
        counter.customerCounters[customerId] = 1;
        currentNumber = 1;
      } else {
        // Dla pozostałych typów dokumentów, zwracamy początkową wartość
        currentNumber = counter[counterType];
      }
      
      await addDoc(countersRef, counter);
    } else {
      // Pobierz istniejący licznik
      const counterDoc = querySnapshot.docs[0];
      counterDocRef = counterDoc.ref;
      counter = counterDoc.data();
      
      // Upewnij się, że istnieje obiekt customerCounters
      if (!counter.customerCounters) {
        counter.customerCounters = {};
      }
      
      // Jeśli to licznik CO dla konkretnego klienta
      if (counterType === 'CO' && customerId) {
        // Sprawdź czy istnieje licznik dla danego klienta
        if (counter.customerCounters[customerId] === undefined) {
          counter.customerCounters[customerId] = 1;
          currentNumber = 1;
        } else {
          // Inkrementuj licznik PRZED pobraniem wartości (zgodnie z portalem)
          counter.customerCounters[customerId]++;
          currentNumber = counter.customerCounters[customerId];
        }
        
        // POPRAWKA: Aktualizuj istniejący dokument zamiast tworzyć nowy
        await updateDoc(counterDocRef, {
          ...counter,
          lastUpdated: new Date()
        });
      } else {
        // Inkrementuj odpowiedni licznik globalny PRZED pobraniem wartości
        counter[counterType]++;
        currentNumber = counter[counterType];
        
        // POPRAWKA: Aktualizuj istniejący dokument zamiast tworzyć nowy
        await updateDoc(counterDocRef, {
          ...counter,
          lastUpdated: new Date()
        });
      }
    }
    
    // Zwracamy bieżącą wartość licznika
    return currentNumber;
  } catch (error) {
    console.error(`Błąd podczas generowania numeru ${counterType}:`, error);
    // W przypadku błędu, wygeneruj losowy numer jako fallback
    return Math.floor(Math.random() * 10000) + 1;
  }
};

/**
 * Generuje numer zlecenia produkcyjnego (MO)
 * Format: MO00001 (np. MO00001)
 */
export const generateMONumber = async () => {
  const nextNumber = await getNextNumber('MO');
  return `MO${nextNumber.toString().padStart(5, '0')}`;
};

/**
 * Generuje numer zamówienia zakupu (PO)
 * Format: PO00001 (np. PO00001)
 */
export const generatePONumber = async () => {
  const nextNumber = await getNextNumber('PO');
  return `PO${nextNumber.toString().padStart(5, '0')}`;
};

/**
 * Generuje numer zamówienia klienta (CO)
 * Format: CO00001 (np. CO00001) lub CO00001AFIKS (np. CO00001GW)
 * @param {string} customerAffix - Opcjonalny afiks do dodania do numeru zamówienia
 * @param {string} customerId - ID klienta, do którego należy zamówienie
 */
export const generateCONumber = async (customerAffix = '', customerId = null) => {
  // Jeśli podano ID klienta, użyj licznika dla tego klienta
  const nextNumber = await getNextNumber('CO', customerId);
  
  // Nowy format bez roku: CO00001
  const baseNumber = `CO${nextNumber.toString().padStart(5, '0')}`;
  
  // Dodaj afiks tylko jeśli został podany
  if (customerAffix && typeof customerAffix === 'string' && customerAffix.trim() !== '') {
    return `${baseNumber}${customerAffix.trim()}`;
  }
  
  return baseNumber;
};

/**
 * Generuje numer partii (LOT)
 * Format: LOT00001 (np. LOT00001)
 */
export const generateLOTNumber = async () => {
  const nextNumber = await getNextNumber('LOT');
  return `LOT${nextNumber.toString().padStart(5, '0')}`;
}; 