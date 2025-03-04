import { collection, getDocs, query, orderBy, limit, addDoc } from 'firebase/firestore';
import { db } from '../services/firebase/config';

const COUNTERS_COLLECTION = 'counters';

/**
 * Pobiera i inkrementuje licznik dla danego typu dokumentu
 * @param {string} counterType - Typ licznika (MO, PO, CO, LOT)
 * @returns {Promise<number>} - Nowy numer
 */
const getNextNumber = async (counterType) => {
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
    let currentYear = new Date().getFullYear();
    
    // Jeśli nie ma liczników lub licznik jest z poprzedniego roku, utwórz nowy
    if (querySnapshot.empty) {
      // Utwórz nowy dokument liczników
      counter = {
        MO: 1,
        PO: 1,
        CO: 1,
        LOT: 1,
        year: currentYear,
        lastUpdated: new Date()
      };
      
      await addDoc(countersRef, counter);
    } else {
      // Pobierz istniejący licznik
      const counterDoc = querySnapshot.docs[0];
      counter = counterDoc.data();
      
      // Jeśli licznik jest z poprzedniego roku, zresetuj liczniki
      if (counter.year !== currentYear) {
        counter = {
          MO: 1,
          PO: 1,
          CO: 1,
          LOT: 1,
          year: currentYear,
          lastUpdated: new Date()
        };
        
        await addDoc(countersRef, counter);
      } else {
        // Inkrementuj odpowiedni licznik
        counter[counterType]++;
        
        // Aktualizuj dokument
        await addDoc(countersRef, {
          ...counter,
          lastUpdated: new Date()
        });
      }
    }
    
    return counter[counterType];
  } catch (error) {
    console.error(`Błąd podczas generowania numeru ${counterType}:`, error);
    // W przypadku błędu, wygeneruj losowy numer jako fallback
    return Math.floor(Math.random() * 10000) + 1;
  }
};

/**
 * Generuje numer zlecenia produkcyjnego (MO)
 * Format: MO-ROK-NUMER (np. MO-2023-0001)
 */
export const generateMONumber = async () => {
  const nextNumber = await getNextNumber('MO');
  const year = new Date().getFullYear();
  return `MO-${year}-${nextNumber.toString().padStart(4, '0')}`;
};

/**
 * Generuje numer zamówienia zakupu (PO)
 * Format: PO-ROK-NUMER (np. PO-2023-0001)
 */
export const generatePONumber = async () => {
  const nextNumber = await getNextNumber('PO');
  const year = new Date().getFullYear();
  return `PO-${year}-${nextNumber.toString().padStart(4, '0')}`;
};

/**
 * Generuje numer zamówienia klienta (CO)
 * Format: CO-ROK-NUMER (np. CO-2023-0001)
 */
export const generateCONumber = async () => {
  const nextNumber = await getNextNumber('CO');
  const year = new Date().getFullYear();
  return `CO-${year}-${nextNumber.toString().padStart(4, '0')}`;
};

/**
 * Generuje numer partii (LOT)
 * Format: LOT-ROK-NUMER (np. LOT-2023-0001)
 */
export const generateLOTNumber = async () => {
  const nextNumber = await getNextNumber('LOT');
  const year = new Date().getFullYear();
  return `LOT-${year}-${nextNumber.toString().padStart(4, '0')}`;
}; 