import { db } from './firebase/config';
import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  Timestamp 
} from 'firebase/firestore';
import { format } from 'date-fns';

// Kolekcje
const WAYBILLS_COLLECTION = 'waybills';
const WAYBILL_ITEMS_COLLECTION = 'waybillItems';

// Statusy listów przewozowych
export const WAYBILL_STATUSES = {
  DRAFT: 'Szkic',
  PLANNED: 'Zaplanowany',
  IN_TRANSIT: 'W transporcie',
  DELIVERED: 'Dostarczony',
  CANCELED: 'Anulowany'
};

// Typy listów przewozowych
export const WAYBILL_TYPES = {
  DELIVERY: 'Dostawa do klienta',
  RECEIPT: 'Odbiór od dostawcy',
  INTERNAL: 'Transport wewnętrzny',
  RETURN: 'Zwrot'
};

// Pobranie wszystkich listów przewozowych
export const getAllWaybills = async () => {
  try {
    const waybillsRef = collection(db, WAYBILLS_COLLECTION);
    const q = query(waybillsRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      plannedDate: doc.data().plannedDate ? doc.data().plannedDate.toDate() : null,
      createdAt: doc.data().createdAt ? doc.data().createdAt.toDate() : null,
      updatedAt: doc.data().updatedAt ? doc.data().updatedAt.toDate() : null
    }));
  } catch (error) {
    console.error('Błąd podczas pobierania listów przewozowych:', error);
    throw error;
  }
};

// Pobranie szczegółów listu przewozowego
export const getWaybillById = async (waybillId) => {
  try {
    const waybillRef = doc(db, WAYBILLS_COLLECTION, waybillId);
    const waybillDoc = await getDoc(waybillRef);
    
    if (!waybillDoc.exists()) {
      throw new Error('List przewozowy nie istnieje');
    }
    
    const waybillData = waybillDoc.data();
    
    // Pobierz elementy dla tego listu przewozowego
    const itemsRef = collection(db, WAYBILL_ITEMS_COLLECTION);
    const q = query(itemsRef, where('waybillId', '==', waybillId));
    const itemsSnapshot = await getDocs(q);
    
    const items = itemsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    return {
      id: waybillId,
      ...waybillData,
      plannedDate: waybillData.plannedDate ? waybillData.plannedDate.toDate() : null,
      createdAt: waybillData.createdAt ? waybillData.createdAt.toDate() : null,
      updatedAt: waybillData.updatedAt ? waybillData.updatedAt.toDate() : null,
      items
    };
  } catch (error) {
    console.error('Błąd podczas pobierania szczegółów listu przewozowego:', error);
    throw error;
  }
};

// Utworzenie nowego listu przewozowego
export const createWaybill = async (waybillData, userId) => {
  try {
    // Formatowanie daty
    const formattedData = {
      ...waybillData,
      plannedDate: waybillData.plannedDate ? Timestamp.fromDate(new Date(waybillData.plannedDate)) : null,
      status: waybillData.status || WAYBILL_STATUSES.DRAFT,
      createdAt: serverTimestamp(),
      createdBy: userId,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    };
    
    // Usuń items z głównego dokumentu (dodamy je oddzielnie)
    const { items, ...waybillDataWithoutItems } = formattedData;
    
    // Dodaj dokument listu przewozowego
    const waybillRef = await addDoc(collection(db, WAYBILLS_COLLECTION), waybillDataWithoutItems);
    
    // Dodaj elementy listu przewozowego
    if (items && items.length > 0) {
      const itemPromises = items.map(item => 
        addDoc(collection(db, WAYBILL_ITEMS_COLLECTION), {
          ...item,
          waybillId: waybillRef.id,
          createdAt: serverTimestamp(),
          createdBy: userId
        })
      );
      
      await Promise.all(itemPromises);
    }
    
    return {
      id: waybillRef.id,
      ...waybillDataWithoutItems
    };
  } catch (error) {
    console.error('Błąd podczas tworzenia listu przewozowego:', error);
    throw error;
  }
};

// Aktualizacja listu przewozowego
export const updateWaybill = async (waybillId, waybillData, userId) => {
  try {
    const waybillRef = doc(db, WAYBILLS_COLLECTION, waybillId);
    
    // Formatowanie daty
    const formattedData = {
      ...waybillData,
      plannedDate: waybillData.plannedDate ? Timestamp.fromDate(new Date(waybillData.plannedDate)) : null,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    };
    
    // Usuń items z aktualizacji (obsłużymy je oddzielnie)
    const { items, ...updateData } = formattedData;
    
    await updateDoc(waybillRef, updateData);
    
    // Aktualizacja elementów
    if (items && items.length > 0) {
      // Usuń istniejące elementy
      const itemsRef = collection(db, WAYBILL_ITEMS_COLLECTION);
      const q = query(itemsRef, where('waybillId', '==', waybillId));
      const itemsSnapshot = await getDocs(q);
      
      const deletePromises = itemsSnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      
      // Dodaj nowe elementy
      const itemPromises = items.map(item => 
        addDoc(collection(db, WAYBILL_ITEMS_COLLECTION), {
          ...item,
          waybillId,
          createdAt: serverTimestamp(),
          createdBy: userId
        })
      );
      
      await Promise.all(itemPromises);
    }
    
    return {
      id: waybillId,
      ...updateData
    };
  } catch (error) {
    console.error('Błąd podczas aktualizacji listu przewozowego:', error);
    throw error;
  }
};

// Usunięcie listu przewozowego
export const deleteWaybill = async (waybillId) => {
  try {
    // Usuń elementy listu przewozowego
    const itemsRef = collection(db, WAYBILL_ITEMS_COLLECTION);
    const q = query(itemsRef, where('waybillId', '==', waybillId));
    const itemsSnapshot = await getDocs(q);
    
    const deletePromises = itemsSnapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
    
    // Usuń dokument listu przewozowego
    const waybillRef = doc(db, WAYBILLS_COLLECTION, waybillId);
    await deleteDoc(waybillRef);
    
    return { success: true };
  } catch (error) {
    console.error('Błąd podczas usuwania listu przewozowego:', error);
    throw error;
  }
};

// Zmiana statusu listu przewozowego
export const updateWaybillStatus = async (waybillId, newStatus, userId) => {
  try {
    const waybillRef = doc(db, WAYBILLS_COLLECTION, waybillId);
    
    await updateDoc(waybillRef, {
      status: newStatus,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    });
    
    return { success: true, status: newStatus };
  } catch (error) {
    console.error('Błąd podczas aktualizacji statusu listu przewozowego:', error);
    throw error;
  }
};

// Wygenerowanie numeru listu przewozowego
export const generateWaybillNumber = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  
  return `WB-${year}${month}${day}-${random}`;
}; 