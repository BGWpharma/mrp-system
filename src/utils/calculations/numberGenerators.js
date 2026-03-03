import { collection, getDocs, query, orderBy, limit, addDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../services/firebase/config';

const COUNTERS_COLLECTION = 'counters';

/**
 * Pobiera i inkrementuje licznik dla danego typu dokumentu
 * @param {string} counterType - Typ licznika (MO, PO, CO, LOT)
 * @param {string} customerId - ID klienta (opcjonalne, tylko dla licznika CO)
 * @returns {Promise<number>} - Nowy numer
 */
const getNextNumber = async (counterType, customerId = null) => {
  try {
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
    if (querySnapshot.empty) {
      counter = {
        MO: 1,
        PO: 1,
        CO: 1,
        LOT: 1,
        lastUpdated: new Date(),
        customerCounters: {}
      };
      if (counterType === 'CO' && customerId) {
        counter.customerCounters[customerId] = 1;
        currentNumber = 1;
      } else {
        currentNumber = counter[counterType];
      }
      await addDoc(countersRef, counter);
    } else {
      const counterDoc = querySnapshot.docs[0];
      counterDocRef = counterDoc.ref;
      counter = counterDoc.data();
      if (!counter.customerCounters) {
        counter.customerCounters = {};
      }
      if (counterType === 'CO' && customerId) {
        if (counter.customerCounters[customerId] === undefined) {
          counter.customerCounters[customerId] = 1;
          currentNumber = 1;
        } else {
          counter.customerCounters[customerId]++;
          currentNumber = counter.customerCounters[customerId];
        }
        await updateDoc(counterDocRef, { ...counter, lastUpdated: new Date() });
      } else {
        counter[counterType]++;
        currentNumber = counter[counterType];
        await updateDoc(counterDocRef, { ...counter, lastUpdated: new Date() });
      }
    }
    return currentNumber;
  } catch (error) {
    console.error(`Błąd podczas generowania numeru ${counterType}:`, error);
    return Math.floor(Math.random() * 10000) + 1;
  }
};

export const generateMONumber = async () => {
  const nextNumber = await getNextNumber('MO');
  return `MO${nextNumber.toString().padStart(5, '0')}`;
};

export const generatePONumber = async () => {
  const nextNumber = await getNextNumber('PO');
  return `PO${nextNumber.toString().padStart(5, '0')}`;
};

export const generateCONumber = async (customerAffix = '', customerId = null) => {
  const nextNumber = await getNextNumber('CO', customerId);
  const baseNumber = `CO${nextNumber.toString().padStart(5, '0')}`;
  if (customerAffix && typeof customerAffix === 'string' && customerAffix.trim() !== '') {
    return `${baseNumber}${customerAffix.trim()}`;
  }
  return baseNumber;
};

export const generateLOTNumber = async () => {
  const nextNumber = await getNextNumber('LOT');
  return `LOT${nextNumber.toString().padStart(5, '0')}`;
};

const getNextMonthlyInvoiceNumber = async (invoiceType) => {
  try {
    const now = new Date();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const year = now.getFullYear().toString();
    const counterKey = `${invoiceType}_${month}_${year}`;
    const countersRef = collection(db, COUNTERS_COLLECTION);
    const q = query(countersRef, orderBy('lastUpdated', 'desc'), limit(1));
    const querySnapshot = await getDocs(q);
    let counter;
    let currentNumber;
    let counterDocRef;
    if (querySnapshot.empty) {
      counter = {
        MO: 1,
        PO: 1,
        CO: 1,
        LOT: 1,
        monthlyInvoiceCounters: { [counterKey]: 1 },
        lastUpdated: new Date(),
        customerCounters: {}
      };
      currentNumber = 1;
      await addDoc(countersRef, counter);
    } else {
      const counterDoc = querySnapshot.docs[0];
      counterDocRef = counterDoc.ref;
      counter = counterDoc.data();
      if (!counter.monthlyInvoiceCounters) {
        counter.monthlyInvoiceCounters = {};
      }
      if (counter.monthlyInvoiceCounters[counterKey] === undefined) {
        counter.monthlyInvoiceCounters[counterKey] = 1;
        currentNumber = 1;
      } else {
        counter.monthlyInvoiceCounters[counterKey]++;
        currentNumber = counter.monthlyInvoiceCounters[counterKey];
      }
      await updateDoc(counterDocRef, {
        monthlyInvoiceCounters: counter.monthlyInvoiceCounters,
        lastUpdated: new Date()
      });
    }
    return { number: currentNumber, month, year };
  } catch (error) {
    console.error(`Błąd podczas generowania numeru ${invoiceType}:`, error);
    throw error;
  }
};

export const generateFSNumber = async () => {
  const { number, month, year } = await getNextMonthlyInvoiceNumber('FS');
  return `FS/${number}/${month}/${year}`;
};

export const generateFPFNumber = async () => {
  const { number, month, year } = await getNextMonthlyInvoiceNumber('FPF');
  return `FPF/${number}/${month}/${year}`;
};

export const generateFKNumber = async () => {
  const { number, month, year } = await getNextMonthlyInvoiceNumber('FK');
  return `FK/${number}/${month}/${year}`;
};