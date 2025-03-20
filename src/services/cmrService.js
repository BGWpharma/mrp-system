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
const CMR_COLLECTION = 'cmrDocuments';
const CMR_ITEMS_COLLECTION = 'cmrItems';

// Statusy dokumentów CMR
export const CMR_STATUSES = {
  DRAFT: 'Szkic',
  ISSUED: 'Wystawiony',
  IN_TRANSIT: 'W transporcie',
  DELIVERED: 'Dostarczony',
  COMPLETED: 'Zakończony',
  CANCELED: 'Anulowany'
};

// Typy transportu
export const TRANSPORT_TYPES = {
  ROAD: 'Drogowy',
  RAIL: 'Kolejowy',
  SEA: 'Morski',
  AIR: 'Lotniczy',
  MULTIMODAL: 'Multimodalny'
};

// Pobranie wszystkich dokumentów CMR
export const getAllCmrDocuments = async () => {
  try {
    const cmrRef = collection(db, CMR_COLLECTION);
    const q = query(cmrRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      issueDate: doc.data().issueDate ? doc.data().issueDate.toDate() : null,
      deliveryDate: doc.data().deliveryDate ? doc.data().deliveryDate.toDate() : null,
      createdAt: doc.data().createdAt ? doc.data().createdAt.toDate() : null,
      updatedAt: doc.data().updatedAt ? doc.data().updatedAt.toDate() : null
    }));
  } catch (error) {
    console.error('Błąd podczas pobierania dokumentów CMR:', error);
    throw error;
  }
};

// Pobranie szczegółów dokumentu CMR
export const getCmrDocumentById = async (cmrId) => {
  try {
    const cmrRef = doc(db, CMR_COLLECTION, cmrId);
    const cmrDoc = await getDoc(cmrRef);
    
    if (!cmrDoc.exists()) {
      throw new Error('Dokument CMR nie istnieje');
    }
    
    const cmrData = cmrDoc.data();
    
    // Pobierz elementy dla tego dokumentu CMR
    const itemsRef = collection(db, CMR_ITEMS_COLLECTION);
    const q = query(itemsRef, where('cmrId', '==', cmrId));
    const itemsSnapshot = await getDocs(q);
    
    const items = itemsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    return {
      id: cmrId,
      ...cmrData,
      issueDate: cmrData.issueDate ? cmrData.issueDate.toDate() : null,
      deliveryDate: cmrData.deliveryDate ? cmrData.deliveryDate.toDate() : null,
      createdAt: cmrData.createdAt ? cmrData.createdAt.toDate() : null,
      updatedAt: cmrData.updatedAt ? cmrData.updatedAt.toDate() : null,
      items
    };
  } catch (error) {
    console.error('Błąd podczas pobierania szczegółów dokumentu CMR:', error);
    throw error;
  }
};

// Utworzenie nowego dokumentu CMR
export const createCmrDocument = async (cmrData, userId) => {
  try {
    // Formatowanie dat
    const formattedData = {
      ...cmrData,
      issueDate: cmrData.issueDate ? Timestamp.fromDate(new Date(cmrData.issueDate)) : null,
      deliveryDate: cmrData.deliveryDate ? Timestamp.fromDate(new Date(cmrData.deliveryDate)) : null,
      status: cmrData.status || CMR_STATUSES.DRAFT,
      cmrNumber: cmrData.cmrNumber || generateCmrNumber(),
      createdAt: serverTimestamp(),
      createdBy: userId,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    };
    
    // Usuń items z głównego dokumentu (dodamy je oddzielnie)
    const { items, ...cmrDataWithoutItems } = formattedData;
    
    // Dodaj dokument CMR
    const cmrRef = await addDoc(collection(db, CMR_COLLECTION), cmrDataWithoutItems);
    
    // Dodaj elementy dokumentu CMR
    if (items && items.length > 0) {
      const itemPromises = items.map(item => 
        addDoc(collection(db, CMR_ITEMS_COLLECTION), {
          ...item,
          cmrId: cmrRef.id,
          createdAt: serverTimestamp(),
          createdBy: userId
        })
      );
      
      await Promise.all(itemPromises);
    }
    
    return {
      id: cmrRef.id,
      ...cmrDataWithoutItems
    };
  } catch (error) {
    console.error('Błąd podczas tworzenia dokumentu CMR:', error);
    throw error;
  }
};

// Aktualizacja dokumentu CMR
export const updateCmrDocument = async (cmrId, cmrData, userId) => {
  try {
    const cmrRef = doc(db, CMR_COLLECTION, cmrId);
    
    // Formatowanie dat
    const formattedData = {
      ...cmrData,
      issueDate: cmrData.issueDate ? Timestamp.fromDate(new Date(cmrData.issueDate)) : null,
      deliveryDate: cmrData.deliveryDate ? Timestamp.fromDate(new Date(cmrData.deliveryDate)) : null,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    };
    
    // Usuń items z aktualizacji (obsłużymy je oddzielnie)
    const { items, ...updateData } = formattedData;
    
    await updateDoc(cmrRef, updateData);
    
    // Aktualizacja elementów
    if (items && items.length > 0) {
      // Usuń istniejące elementy
      const itemsRef = collection(db, CMR_ITEMS_COLLECTION);
      const q = query(itemsRef, where('cmrId', '==', cmrId));
      const itemsSnapshot = await getDocs(q);
      
      const deletePromises = itemsSnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      
      // Dodaj nowe elementy
      const itemPromises = items.map(item => 
        addDoc(collection(db, CMR_ITEMS_COLLECTION), {
          ...item,
          cmrId,
          createdAt: serverTimestamp(),
          createdBy: userId
        })
      );
      
      await Promise.all(itemPromises);
    }
    
    return {
      id: cmrId,
      ...updateData
    };
  } catch (error) {
    console.error('Błąd podczas aktualizacji dokumentu CMR:', error);
    throw error;
  }
};

// Usunięcie dokumentu CMR
export const deleteCmrDocument = async (cmrId) => {
  try {
    // Usuń elementy dokumentu CMR
    const itemsRef = collection(db, CMR_ITEMS_COLLECTION);
    const q = query(itemsRef, where('cmrId', '==', cmrId));
    const itemsSnapshot = await getDocs(q);
    
    const deletePromises = itemsSnapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
    
    // Usuń dokument CMR
    const cmrRef = doc(db, CMR_COLLECTION, cmrId);
    await deleteDoc(cmrRef);
    
    return { success: true };
  } catch (error) {
    console.error('Błąd podczas usuwania dokumentu CMR:', error);
    throw error;
  }
};

// Zmiana statusu dokumentu CMR
export const updateCmrStatus = async (cmrId, newStatus, userId) => {
  try {
    const cmrRef = doc(db, CMR_COLLECTION, cmrId);
    
    await updateDoc(cmrRef, {
      status: newStatus,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    });
    
    return { success: true, status: newStatus };
  } catch (error) {
    console.error('Błąd podczas aktualizacji statusu dokumentu CMR:', error);
    throw error;
  }
};

// Wygenerowanie numeru dokumentu CMR
export const generateCmrNumber = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  
  return `CMR-${year}${month}${day}-${random}`;
}; 