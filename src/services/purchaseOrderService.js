import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  getDoc, 
  getDocs, 
  deleteDoc, 
  query, 
  where,
  orderBy,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from './firebase/config';

// Stałe dla kolekcji w Firebase
const PURCHASE_ORDERS_COLLECTION = 'purchaseOrders';
const SUPPLIERS_COLLECTION = 'suppliers';

// Funkcje do obsługi zamówień zakupowych
export const getAllPurchaseOrders = async () => {
  try {
    const q = query(
      collection(db, PURCHASE_ORDERS_COLLECTION), 
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    const purchaseOrders = [];
    
    for (const docRef of querySnapshot.docs) {
      const poData = docRef.data();
      
      // Pobierz dane dostawcy, jeśli zamówienie ma referencję do dostawcy
      let supplierData = null;
      if (poData.supplierId) {
        const supplierDoc = await getDoc(doc(db, SUPPLIERS_COLLECTION, poData.supplierId));
        if (supplierDoc.exists()) {
          supplierData = { id: supplierDoc.id, ...supplierDoc.data() };
        }
      }
      
      purchaseOrders.push({
        id: docRef.id,
        ...poData,
        supplier: supplierData,
        // Konwersja Timestamp na ISO string (dla kompatybilności z istniejącym kodem)
        orderDate: poData.orderDate ? poData.orderDate.toDate().toISOString() : null,
        expectedDeliveryDate: poData.expectedDeliveryDate ? poData.expectedDeliveryDate.toDate().toISOString() : null,
        createdAt: poData.createdAt ? poData.createdAt.toDate().toISOString() : null,
        updatedAt: poData.updatedAt ? poData.updatedAt.toDate().toISOString() : null
      });
    }
    
    return purchaseOrders;
  } catch (error) {
    console.error('Błąd podczas pobierania zamówień zakupowych:', error);
    throw error;
  }
};

export const getPurchaseOrderById = async (id) => {
  try {
    const purchaseOrderDoc = await getDoc(doc(db, PURCHASE_ORDERS_COLLECTION, id));
    
    if (!purchaseOrderDoc.exists()) {
      throw new Error(`Nie znaleziono zamówienia zakupowego o ID ${id}`);
    }
    
    const poData = purchaseOrderDoc.data();
    console.log("Dane PO z bazy:", poData);
    
    // Pobierz dane dostawcy, jeśli zamówienie ma referencję do dostawcy
    let supplierData = null;
    if (poData.supplierId) {
      const supplierDoc = await getDoc(doc(db, SUPPLIERS_COLLECTION, poData.supplierId));
      if (supplierDoc.exists()) {
        supplierData = { id: supplierDoc.id, ...supplierDoc.data() };
      }
    }
    
    // Bezpieczna konwersja dat - obsługuje zarówno Timestamp, jak i stringi ISO
    const safeConvertDate = (dateField) => {
      if (!dateField) return null;
      
      try {
        // Jeśli to Timestamp z Firebase
        if (dateField.toDate && typeof dateField.toDate === 'function') {
          return dateField.toDate().toISOString();
        }
        
        // Jeśli to już string ISO
        if (typeof dateField === 'string') {
          return new Date(dateField).toISOString();
        }
        
        // Jeśli to obiekt Date
        if (dateField instanceof Date) {
          return dateField.toISOString();
        }
        
        // Inne przypadki - spróbuj skonwertować
        return new Date(dateField).toISOString();
      } catch (error) {
        console.error("Błąd podczas konwersji daty:", error);
        return new Date().toISOString(); // Domyślnie bieżąca data
      }
    };
    
    // Pastewniamy, że wszystkie pola są poprawnie przekształcone
    const result = {
      id: purchaseOrderDoc.id,
      ...poData,
      number: poData.number || '',
      supplier: supplierData,
      items: poData.items || [],
      totalValue: poData.totalValue || 0,
      totalGross: poData.totalGross || 0,
      vatRate: poData.vatRate || 23,
      currency: poData.currency || 'EUR',
      targetWarehouseId: poData.targetWarehouseId || '',
      deliveryAddress: poData.deliveryAddress || '',
      notes: poData.notes || '',
      status: poData.status || 'draft',
      // Bezpieczna konwersja dat
      orderDate: safeConvertDate(poData.orderDate),
      expectedDeliveryDate: safeConvertDate(poData.expectedDeliveryDate),
      createdAt: safeConvertDate(poData.createdAt),
      updatedAt: safeConvertDate(poData.updatedAt)
    };
    
    console.log("Pobrane PO (po konwersji):", result);
    return result;
  } catch (error) {
    console.error(`Błąd podczas pobierania zamówienia zakupowego o ID ${id}:`, error);
    throw error;
  }
};

export const createPurchaseOrder = async (purchaseOrderData) => {
  try {
    // Generuj numer zamówienia
    const poNumberPrefix = 'PO-' + new Date().getFullYear() + '-';
    const qPo = query(collection(db, PURCHASE_ORDERS_COLLECTION), where('number', '>=', poNumberPrefix), where('number', '<', poNumberPrefix + '999'));
    const existingPOs = await getDocs(qPo);
    
    let highestNumber = 0;
    existingPOs.forEach(doc => {
      const poNumber = doc.data().number;
      const numberPart = poNumber.split('-')[2];
      const numValue = parseInt(numberPart, 10);
      if (!isNaN(numValue) && numValue > highestNumber) {
        highestNumber = numValue;
      }
    });
    
    const newNumberSuffix = String(highestNumber + 1).padStart(3, '0');
    const poNumber = poNumberPrefix + newNumberSuffix;
    
    // Przygotuj dane zamówienia do zapisania
    // Zapisujemy tylko ID dostawcy, a nie cały obiekt
    const supplierId = purchaseOrderData.supplier?.id;
    
    const newPurchaseOrder = {
      number: poNumber,
      supplierId: supplierId,
      items: purchaseOrderData.items || [],
      totalValue: purchaseOrderData.totalValue || 0,
      currency: purchaseOrderData.currency || 'EUR',
      status: purchaseOrderData.status || 'draft',
      orderDate: purchaseOrderData.orderDate ? new Date(purchaseOrderData.orderDate) : new Date(),
      expectedDeliveryDate: purchaseOrderData.expectedDeliveryDate ? new Date(purchaseOrderData.expectedDeliveryDate) : null,
      deliveryAddress: purchaseOrderData.deliveryAddress || '',
      notes: purchaseOrderData.notes || '',
      createdBy: purchaseOrderData.createdBy || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    // Zapisz zamówienie w bazie danych
    const docRef = await addDoc(collection(db, PURCHASE_ORDERS_COLLECTION), newPurchaseOrder);
    
    // Pobierz dane dostawcy dla zwrócenia pełnego obiektu zamówienia
    let supplierData = null;
    if (supplierId) {
      const supplierDoc = await getDoc(doc(db, SUPPLIERS_COLLECTION, supplierId));
      if (supplierDoc.exists()) {
        supplierData = { id: supplierDoc.id, ...supplierDoc.data() };
      }
    }
    
    return {
      id: docRef.id,
      ...newPurchaseOrder,
      supplier: supplierData,
      // Konwersja Date na ISO string (dla kompatybilności z istniejącym kodem)
      orderDate: newPurchaseOrder.orderDate.toISOString(),
      expectedDeliveryDate: newPurchaseOrder.expectedDeliveryDate ? newPurchaseOrder.expectedDeliveryDate.toISOString() : null
    };
  } catch (error) {
    console.error('Błąd podczas tworzenia zamówienia zakupowego:', error);
    throw error;
  }
};

export const updatePurchaseOrder = async (id, purchaseOrderData) => {
  try {
    console.log("Aktualizacja zamówienia - dane wejściowe:", purchaseOrderData);
    
    const purchaseOrderRef = doc(db, PURCHASE_ORDERS_COLLECTION, id);
    
    // Sprawdź, czy zamówienie istnieje
    const docSnap = await getDoc(purchaseOrderRef);
    if (!docSnap.exists()) {
      throw new Error(`Nie znaleziono zamówienia zakupowego o ID ${id}`);
    }
    
    const existingData = docSnap.data();
    
    // Zapisujemy tylko ID dostawcy, a nie cały obiekt
    const supplierId = purchaseOrderData.supplier?.id;
    
    // Zachowujemy numer zamówienia z oryginalnego dokumentu
    const number = existingData.number;
    
    const updates = {
      number: number, // Zachowaj oryginalny numer zamówienia
      supplierId: supplierId,
      items: purchaseOrderData.items || [],
      totalValue: purchaseOrderData.totalValue || 0,
      totalGross: purchaseOrderData.totalGross || 0,
      vatRate: purchaseOrderData.vatRate || 23,
      currency: purchaseOrderData.currency || 'EUR',
      status: purchaseOrderData.status || 'draft',
      targetWarehouseId: purchaseOrderData.targetWarehouseId || '',
      orderDate: purchaseOrderData.orderDate ? new Date(purchaseOrderData.orderDate) : new Date(),
      expectedDeliveryDate: purchaseOrderData.expectedDeliveryDate ? new Date(purchaseOrderData.expectedDeliveryDate) : null,
      deliveryAddress: purchaseOrderData.deliveryAddress || '',
      notes: purchaseOrderData.notes || '',
      updatedBy: purchaseOrderData.updatedBy || null,
      updatedAt: serverTimestamp()
    };
    
    console.log("Dane do zaktualizowania:", updates);
    
    // Aktualizuj zamówienie w bazie danych
    await updateDoc(purchaseOrderRef, updates);
    
    // Pobierz dane dostawcy dla zwrócenia pełnego obiektu zamówienia
    let supplierData = null;
    if (supplierId) {
      const supplierDoc = await getDoc(doc(db, SUPPLIERS_COLLECTION, supplierId));
      if (supplierDoc.exists()) {
        supplierData = { id: supplierDoc.id, ...supplierDoc.data() };
      }
    }
    
    // Przygotuj dane wynikowe z zachowaniem wszystkich pól
    const result = {
      id: id,
      ...existingData,
      ...updates,
      supplier: supplierData,
      // Konwersja Date na ISO string (dla kompatybilności z istniejącym kodem)
      orderDate: updates.orderDate.toISOString(),
      expectedDeliveryDate: updates.expectedDeliveryDate ? updates.expectedDeliveryDate.toISOString() : null,
      updatedAt: new Date().toISOString() // Ponieważ serverTimestamp() nie zwraca rzeczywistej wartości od razu
    };
    
    console.log("Zaktualizowane PO - wynik:", result);
    return result;
  } catch (error) {
    console.error(`Błąd podczas aktualizacji zamówienia zakupowego o ID ${id}:`, error);
    throw error;
  }
};

export const deletePurchaseOrder = async (id) => {
  try {
    const purchaseOrderRef = doc(db, PURCHASE_ORDERS_COLLECTION, id);
    
    // Sprawdź, czy zamówienie istnieje
    const docSnap = await getDoc(purchaseOrderRef);
    if (!docSnap.exists()) {
      throw new Error(`Nie znaleziono zamówienia zakupowego o ID ${id}`);
    }
    
    // Usuń zamówienie z bazy danych
    await deleteDoc(purchaseOrderRef);
    
    return { id };
  } catch (error) {
    console.error(`Błąd podczas usuwania zamówienia zakupowego o ID ${id}:`, error);
    throw error;
  }
};

export const updatePurchaseOrderStatus = async (id, status, userId) => {
  try {
    const purchaseOrderRef = doc(db, PURCHASE_ORDERS_COLLECTION, id);
    
    // Sprawdź, czy zamówienie istnieje
    const docSnap = await getDoc(purchaseOrderRef);
    if (!docSnap.exists()) {
      throw new Error(`Nie znaleziono zamówienia zakupowego o ID ${id}`);
    }
    
    // Aktualizuj status zamówienia
    const updates = {
      status: status,
      updatedBy: userId,
      updatedAt: serverTimestamp()
    };
    
    await updateDoc(purchaseOrderRef, updates);
    
    // Zwróć zaktualizowane dane zamówienia
    const updatedDoc = await getDoc(purchaseOrderRef);
    const poData = updatedDoc.data();
    
    // Pobierz dane dostawcy
    let supplierData = null;
    if (poData.supplierId) {
      const supplierDoc = await getDoc(doc(db, SUPPLIERS_COLLECTION, poData.supplierId));
      if (supplierDoc.exists()) {
        supplierData = { id: supplierDoc.id, ...supplierDoc.data() };
      }
    }
    
    return {
      id: updatedDoc.id,
      ...poData,
      supplier: supplierData,
      // Konwersja Timestamp na ISO string (dla kompatybilności z istniejącym kodem)
      orderDate: poData.orderDate ? poData.orderDate.toDate().toISOString() : null,
      expectedDeliveryDate: poData.expectedDeliveryDate ? poData.expectedDeliveryDate.toDate().toISOString() : null,
      createdAt: poData.createdAt ? poData.createdAt.toDate().toISOString() : null,
      updatedAt: poData.updatedAt ? poData.updatedAt.toDate().toISOString() : null
    };
  } catch (error) {
    console.error(`Błąd podczas aktualizacji statusu zamówienia zakupowego o ID ${id}:`, error);
    throw error;
  }
};

// Funkcje do obsługi dostawców
export const getAllSuppliers = async () => {
  try {
    const q = query(
      collection(db, SUPPLIERS_COLLECTION), 
      orderBy('name', 'asc')
    );
    
    const querySnapshot = await getDocs(q);
    const suppliers = [];
    
    querySnapshot.forEach(doc => {
      suppliers.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return suppliers;
  } catch (error) {
    console.error('Błąd podczas pobierania dostawców:', error);
    throw error;
  }
};

export const getSupplierById = async (id) => {
  try {
    const supplierDoc = await getDoc(doc(db, SUPPLIERS_COLLECTION, id));
    
    if (!supplierDoc.exists()) {
      throw new Error(`Nie znaleziono dostawcy o ID ${id}`);
    }
    
    return {
      id: supplierDoc.id,
      ...supplierDoc.data()
    };
  } catch (error) {
    console.error(`Błąd podczas pobierania dostawcy o ID ${id}:`, error);
    throw error;
  }
};

export const createSupplier = async (supplierData, userId) => {
  try {
    const newSupplier = {
      ...supplierData,
      createdBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    const docRef = await addDoc(collection(db, SUPPLIERS_COLLECTION), newSupplier);
    
    return {
      id: docRef.id,
      ...newSupplier
    };
  } catch (error) {
    console.error('Błąd podczas tworzenia dostawcy:', error);
    throw error;
  }
};

export const updateSupplier = async (id, supplierData, userId) => {
  try {
    const supplierRef = doc(db, SUPPLIERS_COLLECTION, id);
    
    // Sprawdź, czy dostawca istnieje
    const docSnap = await getDoc(supplierRef);
    if (!docSnap.exists()) {
      throw new Error(`Nie znaleziono dostawcy o ID ${id}`);
    }
    
    const updates = {
      ...supplierData,
      updatedBy: userId,
      updatedAt: serverTimestamp()
    };
    
    await updateDoc(supplierRef, updates);
    
    return {
      id: id,
      ...docSnap.data(),
      ...updates
    };
  } catch (error) {
    console.error(`Błąd podczas aktualizacji dostawcy o ID ${id}:`, error);
    throw error;
  }
};

export const deleteSupplier = async (id) => {
  try {
    const supplierRef = doc(db, SUPPLIERS_COLLECTION, id);
    
    // Sprawdź, czy dostawca istnieje
    const docSnap = await getDoc(supplierRef);
    if (!docSnap.exists()) {
      throw new Error(`Nie znaleziono dostawcy o ID ${id}`);
    }
    
    // Sprawdź, czy dostawca jest używany w zamówieniach
    const q = query(collection(db, PURCHASE_ORDERS_COLLECTION), where('supplierId', '==', id));
    const poSnapshot = await getDocs(q);
    
    if (!poSnapshot.empty) {
      throw new Error(`Nie można usunąć dostawcy, ponieważ jest używany w zamówieniach`);
    }
    
    // Usuń dostawcę z bazy danych
    await deleteDoc(supplierRef);
    
    return { id };
  } catch (error) {
    console.error(`Błąd podczas usuwania dostawcy o ID ${id}:`, error);
    throw error;
  }
};

// Funkcje pomocnicze
export const getPurchaseOrdersByStatus = async (status) => {
  try {
    const q = query(
      collection(db, PURCHASE_ORDERS_COLLECTION), 
      where('status', '==', status),
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    const purchaseOrders = [];
    
    for (const docRef of querySnapshot.docs) {
      const poData = docRef.data();
      
      // Pobierz dane dostawcy
      let supplierData = null;
      if (poData.supplierId) {
        const supplierDoc = await getDoc(doc(db, SUPPLIERS_COLLECTION, poData.supplierId));
        if (supplierDoc.exists()) {
          supplierData = { id: supplierDoc.id, ...supplierDoc.data() };
        }
      }
      
      purchaseOrders.push({
        id: docRef.id,
        ...poData,
        supplier: supplierData,
        // Konwersja Timestamp na ISO string (dla kompatybilności z istniejącym kodem)
        orderDate: poData.orderDate ? poData.orderDate.toDate().toISOString() : null,
        expectedDeliveryDate: poData.expectedDeliveryDate ? poData.expectedDeliveryDate.toDate().toISOString() : null,
        createdAt: poData.createdAt ? poData.createdAt.toDate().toISOString() : null,
        updatedAt: poData.updatedAt ? poData.updatedAt.toDate().toISOString() : null
      });
    }
    
    return purchaseOrders;
  } catch (error) {
    console.error(`Błąd podczas pobierania zamówień zakupowych o statusie ${status}:`, error);
    throw error;
  }
};

export const getPurchaseOrdersBySupplier = async (supplierId) => {
  try {
    const q = query(
      collection(db, PURCHASE_ORDERS_COLLECTION), 
      where('supplierId', '==', supplierId),
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    const purchaseOrders = [];
    
    for (const docRef of querySnapshot.docs) {
      const poData = docRef.data();
      
      // Pobierz dane dostawcy
      let supplierData = null;
      if (poData.supplierId) {
        const supplierDoc = await getDoc(doc(db, SUPPLIERS_COLLECTION, poData.supplierId));
        if (supplierDoc.exists()) {
          supplierData = { id: supplierDoc.id, ...supplierDoc.data() };
        }
      }
      
      purchaseOrders.push({
        id: docRef.id,
        ...poData,
        supplier: supplierData,
        // Konwersja Timestamp na ISO string (dla kompatybilności z istniejącym kodem)
        orderDate: poData.orderDate ? poData.orderDate.toDate().toISOString() : null,
        expectedDeliveryDate: poData.expectedDeliveryDate ? poData.expectedDeliveryDate.toDate().toISOString() : null,
        createdAt: poData.createdAt ? poData.createdAt.toDate().toISOString() : null,
        updatedAt: poData.updatedAt ? poData.updatedAt.toDate().toISOString() : null
      });
    }
    
    return purchaseOrders;
  } catch (error) {
    console.error(`Błąd podczas pobierania zamówień zakupowych dla dostawcy o ID ${supplierId}:`, error);
    throw error;
  }
};

export const getSuppliersByItem = async (itemId) => {
  try {
    // Pobierz wszystkich dostawców - w przyszłości można dodać powiązanie między przedmiotami a dostawcami
    return getAllSuppliers();
  } catch (error) {
    console.error(`Błąd podczas pobierania dostawców dla przedmiotu o ID ${itemId}:`, error);
    throw error;
  }
};

// Stałe dla statusów zamówień
export const PURCHASE_ORDER_STATUSES = {
  DRAFT: 'draft',
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed'
};

// Funkcja do tłumaczenia statusów na język polski
export const translateStatus = (status) => {
  const translations = {
    [PURCHASE_ORDER_STATUSES.DRAFT]: 'Szkic',
    [PURCHASE_ORDER_STATUSES.PENDING]: 'Oczekujące',
    [PURCHASE_ORDER_STATUSES.CONFIRMED]: 'Potwierdzone',
    [PURCHASE_ORDER_STATUSES.SHIPPED]: 'Wysłane',
    [PURCHASE_ORDER_STATUSES.DELIVERED]: 'Dostarczone',
    [PURCHASE_ORDER_STATUSES.CANCELLED]: 'Anulowane',
    [PURCHASE_ORDER_STATUSES.COMPLETED]: 'Zakończone'
  };
  
  return translations[status] || status;
}; 