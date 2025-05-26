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
import { updateOrderItemShippedQuantity } from './orderService';

// Kolekcje
const CMR_COLLECTION = 'cmrDocuments';
const CMR_ITEMS_COLLECTION = 'cmrItems';

// Statusy dokumentów CMR
export const CMR_STATUSES = {
  DRAFT: 'Szkic',
  ISSUED: 'Wystawiony',
  IN_TRANSIT: 'W transporcie',
  DELIVERED: 'Dostarczone',
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
      loadingDate: cmrData.loadingDate ? cmrData.loadingDate.toDate() : null,
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
      loadingDate: cmrData.loadingDate ? Timestamp.fromDate(new Date(cmrData.loadingDate)) : null,
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
    
    // Jeśli CMR jest powiązany z zamówieniem klienta, zaktualizuj ilości wysłane
    if (cmrData.linkedOrderId && items && items.length > 0) {
      await updateLinkedOrderShippedQuantities(cmrData.linkedOrderId, items, formattedData.cmrNumber, userId);
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
      loadingDate: cmrData.loadingDate ? Timestamp.fromDate(new Date(cmrData.loadingDate)) : null,
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
      
      // Jeśli CMR jest powiązany z zamówieniem klienta, zaktualizuj ilości wysłane
      if (cmrData.linkedOrderId) {
        await updateLinkedOrderShippedQuantities(cmrData.linkedOrderId, items, updateData.cmrNumber || cmrData.cmrNumber, userId);
      }
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

// Generowanie raportu z dokumentów CMR
export const generateCmrReport = async (filters = {}) => {
  try {
    // Budowanie zapytania z filtrami
    const cmrRef = collection(db, CMR_COLLECTION);
    let q = query(cmrRef, orderBy('issueDate', 'desc'));
    
    // Dodawanie filtrów do zapytania
    if (filters.startDate && filters.endDate) {
      const startDate = Timestamp.fromDate(new Date(filters.startDate));
      const endDate = Timestamp.fromDate(new Date(filters.endDate));
      q = query(q, where('issueDate', '>=', startDate), where('issueDate', '<=', endDate));
    }
    
    if (filters.sender) {
      q = query(q, where('sender', '==', filters.sender));
    }
    
    if (filters.recipient) {
      q = query(q, where('recipient', '==', filters.recipient));
    }
    
    if (filters.status) {
      q = query(q, where('status', '==', filters.status));
    }
    
    // Pobierz dokumenty CMR według filtrów
    const snapshot = await getDocs(q);
    
    // Mapowanie dokumentów do raportu
    const cmrDocuments = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        cmrNumber: data.cmrNumber,
        issueDate: data.issueDate ? data.issueDate.toDate() : null,
        deliveryDate: data.deliveryDate ? data.deliveryDate.toDate() : null,
        sender: data.sender,
        recipient: data.recipient,
        loadingPlace: data.loadingPlace,
        deliveryPlace: data.deliveryPlace,
        status: data.status,
        items: [], // Zostawiamy puste, pobierzemy później jeśli potrzeba
        createdAt: data.createdAt ? data.createdAt.toDate() : null
      };
    });
    
    // Opcjonalnie pobieramy elementy dla każdego dokumentu
    if (filters.includeItems) {
      const promises = cmrDocuments.map(async (doc) => {
        const itemsRef = collection(db, CMR_ITEMS_COLLECTION);
        const itemsQuery = query(itemsRef, where('cmrId', '==', doc.id));
        const itemsSnapshot = await getDocs(itemsQuery);
        
        doc.items = itemsSnapshot.docs.map(itemDoc => ({
          id: itemDoc.id,
          ...itemDoc.data()
        }));
        
        return doc;
      });
      
      // Czekamy na zakończenie wszystkich zapytań
      await Promise.all(promises);
    }
    
    // Statystyki raportu
    const statistics = {
      totalDocuments: cmrDocuments.length,
      byStatus: {},
      bySender: {},
      byRecipient: {}
    };
    
    // Obliczanie statystyk
    cmrDocuments.forEach(doc => {
      // Statystyki według statusu
      if (!statistics.byStatus[doc.status]) {
        statistics.byStatus[doc.status] = 0;
      }
      statistics.byStatus[doc.status]++;
      
      // Statystyki według nadawcy
      if (!statistics.bySender[doc.sender]) {
        statistics.bySender[doc.sender] = 0;
      }
      statistics.bySender[doc.sender]++;
      
      // Statystyki według odbiorcy
      if (!statistics.byRecipient[doc.recipient]) {
        statistics.byRecipient[doc.recipient] = 0;
      }
      statistics.byRecipient[doc.recipient]++;
    });
    
    return {
      documents: cmrDocuments,
      statistics,
      filters,
      generatedAt: new Date(),
      reportName: `Raport CMR ${format(new Date(), 'dd.MM.yyyy')}`
    };
  } catch (error) {
    console.error('Błąd podczas generowania raportu CMR:', error);
    throw error;
  }
}; 

// Funkcja pomocnicza do aktualizacji ilości wysłanych w powiązanym zamówieniu
const updateLinkedOrderShippedQuantities = async (orderId, cmrItems, cmrNumber, userId) => {
  try {
    // Mapuj elementy CMR na aktualizacje zamówienia
    const itemUpdates = cmrItems.map((item, index) => ({
      itemName: item.description,
      quantity: parseFloat(item.quantity) || parseFloat(item.numberOfPackages) || 0,
      itemIndex: index,
      cmrNumber: cmrNumber
    })).filter(update => update.quantity > 0);
    
    if (itemUpdates.length > 0) {
      await updateOrderItemShippedQuantity(orderId, itemUpdates, userId);
      console.log(`Zaktualizowano ilości wysłane w zamówieniu ${orderId} na podstawie CMR ${cmrNumber}`);
    }
  } catch (error) {
    console.error('Błąd podczas aktualizacji ilości wysłanych w zamówieniu:', error);
    // Nie rzucamy błędu, aby nie przerywać procesu tworzenia CMR
  }
};