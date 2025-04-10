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
      
      // Upewnij się, że zamówienie ma poprawną wartość brutto (totalGross)
      let totalGross = poData.totalGross;
      
      // Jeśli nie ma wartości brutto lub jest nieprawidłowa, oblicz ją
      if (totalGross === undefined || totalGross === null) {
        // Oblicz wartość produktów
        const productsValue = typeof poData.items === 'object' && Array.isArray(poData.items)
          ? poData.items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0)
          : (parseFloat(poData.totalValue) || 0);
        
        // Oblicz VAT (tylko od wartości produktów)
        const vatRate = parseFloat(poData.vatRate) || 0;
        const vatValue = (productsValue * vatRate) / 100;
        
        // Oblicz dodatkowe koszty
        const additionalCosts = poData.additionalCostsItems && Array.isArray(poData.additionalCostsItems) 
          ? poData.additionalCostsItems.reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0)
          : (parseFloat(poData.additionalCosts) || 0);
        
        // Wartość brutto to suma: wartość netto produktów + VAT + dodatkowe koszty
        totalGross = productsValue + vatValue + additionalCosts;
        
        console.log(`Obliczono wartość brutto dla PO ${poData.number}: ${totalGross}`);
      } else {
        totalGross = parseFloat(totalGross) || 0;
      }
      
      purchaseOrders.push({
        id: docRef.id,
        ...poData,
        supplier: supplierData,
        totalGross: totalGross,
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

// Funkcja do generowania numerów zamówień
export const generateOrderNumber = async (prefix) => {
  try {
    const now = new Date();
    const year = now.getFullYear();
    
    // Pobierz listę zamówień z tego roku, aby ustalić numer
    const q = query(
      collection(db, PURCHASE_ORDERS_COLLECTION),
      where('number', '>=', `${prefix}-${year}-`),
      where('number', '<=', `${prefix}-${year}-9999`)
    );
    
    const querySnapshot = await getDocs(q);
    const ordersCount = querySnapshot.size;
    const orderNumber = `${prefix}-${year}-${(ordersCount + 1).toString().padStart(4, '0')}`;
    
    return orderNumber;
  } catch (error) {
    console.error('Błąd podczas generowania numeru zamówienia:', error);
    throw error;
  }
};

export const createPurchaseOrder = async (purchaseOrderData, userId) => {
  try {
    const { 
      supplier, 
      items = [], 
      currency = 'EUR', 
      vatRate = 23, 
      additionalCostsItems = [], 
      additionalCosts = 0,
      status = 'draft', 
      targetWarehouseId = '',
      orderDate = new Date(),
      expectedDeliveryDate,
      deliveryAddress = '',
      notes = ''
    } = purchaseOrderData;

    // Generuj numer zamówienia
    const number = await generateOrderNumber('PO');
    
    // Obliczamy wartość zamówienia
    const totalValue = items.reduce((sum, item) => {
      const itemPrice = parseFloat(item.totalPrice) || 0;
      return sum + itemPrice;
    }, 0);
    
    // Obliczamy wartość VAT (tylko od produktów)
    const vatValue = (totalValue * vatRate) / 100;
    
    // Obliczamy dodatkowe koszty
    const additionalCostsTotal = additionalCostsItems && Array.isArray(additionalCostsItems) 
      ? additionalCostsItems.reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0)
      : (parseFloat(additionalCosts) || 0);
    
    // Obliczamy wartość brutto: wartość netto produktów + VAT + dodatkowe koszty
    const totalGross = totalValue + vatValue + additionalCostsTotal;
    
    // Zapisujemy tylko ID dostawcy, a nie cały obiekt - z zabezpieczeniem przed undefined
    const supplierId = supplier?.id || null;
    
    // Przygotuj obiekt zamówienia zakupowego
    const newPurchaseOrder = {
      number,
      supplierId,
      items,
      totalValue,
      totalGross, // Dodajemy wartość brutto
      additionalCostsItems,
      vatRate,
      currency,
      status,
      targetWarehouseId,
      orderDate: typeof orderDate === 'string' ? new Date(orderDate) : orderDate,
      expectedDeliveryDate: expectedDeliveryDate ? (typeof expectedDeliveryDate === 'string' ? new Date(expectedDeliveryDate) : expectedDeliveryDate) : null,
      deliveryAddress,
      notes,
      createdBy: userId,
      updatedBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    console.log("Dane do zapisania:", newPurchaseOrder);
    
    // Dodaj nowe zamówienie do kolekcji
    const docRef = await addDoc(collection(db, PURCHASE_ORDERS_COLLECTION), newPurchaseOrder);
    const id = docRef.id;
    
    console.log(`Utworzono zamówienie z ID: ${id}`);
    
    // Pobierz dane dostawcy dla zwrócenia pełnego obiektu zamówienia
    let supplierData = null;
    if (supplierId) {
      const supplierDoc = await getDoc(doc(db, SUPPLIERS_COLLECTION, supplierId));
      if (supplierDoc.exists()) {
        supplierData = { id: supplierDoc.id, ...supplierDoc.data() };
      }
    }
    
    // Przygotuj dane wynikowe
    const result = {
      id: id,
      ...newPurchaseOrder,
      supplier: supplierData,
      orderDate: newPurchaseOrder.orderDate.toISOString(),
      expectedDeliveryDate: newPurchaseOrder.expectedDeliveryDate ? newPurchaseOrder.expectedDeliveryDate.toISOString() : null,
      createdAt: new Date().toISOString() // Ponieważ serverTimestamp() nie zwraca rzeczywistej wartości od razu
    };
    
    console.log("Nowe PO - wynik:", result);
    return result;
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
    // Zabezpieczenie przed błędem undefined w supplierId
    let supplierId = purchaseOrderData.supplier?.id;
    if (supplierId === undefined && existingData.supplierId) {
      // Jeśli supplierId nie istnieje w danych wejściowych, ale istnieje w bieżących danych, użyj istniejącego
      supplierId = existingData.supplierId;
      console.log(`Użyto istniejącego supplierId: ${supplierId}`);
    } else if (supplierId === undefined) {
      // Jeśli supplierId nie istnieje nigdzie, ustaw puste pole
      supplierId = '';
      console.log('Ustawiono pusty supplierId, ponieważ nie został podany');
    }
    
    // Zachowujemy numer zamówienia z oryginalnego dokumentu
    const number = existingData.number;
    
    // Obliczamy wartość netto produktów
    const productsValue = purchaseOrderData.items && Array.isArray(purchaseOrderData.items)
      ? purchaseOrderData.items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0)
      : (purchaseOrderData.totalValue || 0);
    
    // Obliczamy wartość VAT (tylko od produktów)
    const vatRate = purchaseOrderData.vatRate || 23;
    const vatValue = (productsValue * vatRate) / 100;
    
    // Obliczamy dodatkowe koszty
    const additionalCosts = purchaseOrderData.additionalCostsItems && Array.isArray(purchaseOrderData.additionalCostsItems) 
      ? purchaseOrderData.additionalCostsItems.reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0)
      : (parseFloat(purchaseOrderData.additionalCosts) || 0);
    
    // Obliczamy wartość brutto: wartość netto produktów + VAT + dodatkowe koszty
    const totalGross = productsValue + vatValue + additionalCosts;
    
    const updates = {
      number: number, // Zachowaj oryginalny numer zamówienia
      supplierId: supplierId, // Użyj bezpiecznego, nienulowego pola
      items: purchaseOrderData.items || [],
      totalValue: productsValue,
      totalGross: totalGross,
      additionalCostsItems: purchaseOrderData.additionalCostsItems || [],
      vatRate: vatRate,
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

export const updatePurchaseOrderStatus = async (purchaseOrderId, newStatus, userId) => {
  try {
    const poRef = doc(db, PURCHASE_ORDERS_COLLECTION, purchaseOrderId);
    const poSnapshot = await getDoc(poRef);
    
    if (!poSnapshot.exists()) {
      throw new Error('Zamówienie zakupowe nie istnieje');
    }
    
    const poData = poSnapshot.data();
    const oldStatus = poData.status;
    
    // Aktualizuj tylko jeśli status faktycznie się zmienił
    if (oldStatus !== newStatus) {
      // Dodanie historii zmian statusu
      const statusHistory = poData.statusHistory || [];
      const statusChange = {
        oldStatus: oldStatus || 'Szkic',
        newStatus: newStatus,
        changedBy: userId,
        changedAt: new Date().toISOString()
      };
      
      const updateFields = {
        status: newStatus,
        updatedBy: userId,
        updatedAt: serverTimestamp(),
        statusHistory: [...statusHistory, statusChange]
      };
      
      // Jeśli status zmieniany jest na "delivered" (dostarczone)
      // dodaj pole z datą i godziną dostarczenia
      if (newStatus === PURCHASE_ORDER_STATUSES.DELIVERED) {
        const now = new Date();
        updateFields.deliveredAt = serverTimestamp();
        updateFields.deliveredBy = userId;
        console.log(`Zamówienie ${purchaseOrderId} oznaczone jako dostarczone w dniu ${now.toLocaleDateString()} o godzinie ${now.toLocaleTimeString()}`);
      }
      
      await updateDoc(poRef, updateFields);
      
      // Jeśli zaimportowano usługę powiadomień, utwórz powiadomienie o zmianie statusu
      try {
        const { createStatusChangeNotification } = require('./notificationService');
        await createStatusChangeNotification(
          userId,
          'purchaseOrder',
          purchaseOrderId,
          poData.number || purchaseOrderId.substring(0, 8),
          oldStatus || 'Szkic',
          newStatus
        );
      } catch (notificationError) {
        console.warn('Nie udało się utworzyć powiadomienia:', notificationError);
      }
    }
    
    return { success: true, status: newStatus };
  } catch (error) {
    console.error('Błąd podczas aktualizacji statusu zamówienia zakupowego:', error);
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

// Stałe dla statusów zamówień
export const PURCHASE_ORDER_STATUSES = {
  DRAFT: 'draft',
  PENDING: 'pending',
  APPROVED: 'approved',
  ORDERED: 'ordered',
  PARTIAL: 'partial',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
  CONFIRMED: 'confirmed'
};

// Funkcja do tłumaczenia statusów na język polski
export const translateStatus = (status) => {
  switch (status) {
    case 'draft': return 'Projekt';
    case 'pending': return 'Oczekujące';
    case 'approved': return 'Zatwierdzone';
    case 'ordered': return 'Zamówione';
    case 'partial': return 'Częściowo dostarczone';
    case 'shipped': return 'Wysłane';
    case 'delivered': return 'Dostarczone';
    case 'completed': return 'Zakończone';
    case 'cancelled': return 'Anulowane';
    case 'confirmed': return 'Potwierdzone';
    default: return status;
  }
};

/**
 * Aktualizacja ilości odebranej dla danego produktu w zamówieniu zakupowym
 * @param {string} purchaseOrderId - ID zamówienia zakupowego
 * @param {string} itemId - ID produktu, który został odebrany
 * @param {number} receivedQuantity - Ilość odebranych produktów
 * @param {string} userId - ID użytkownika dokonującego aktualizacji
 * @returns {Promise<object>} - Zaktualizowane zamówienie zakupowe
 */
export const updatePurchaseOrderReceivedQuantity = async (purchaseOrderId, itemId, receivedQuantity, userId) => {
  try {
    if (!purchaseOrderId) {
      throw new Error('ID zamówienia zakupowego jest wymagane');
    }

    if (!itemId) {
      throw new Error('ID produktu jest wymagane');
    }

    if (!receivedQuantity || isNaN(receivedQuantity) || receivedQuantity <= 0) {
      throw new Error('Ilość odebrana musi być liczbą większą od zera');
    }

    // Pobierz bieżące zamówienie
    const poRef = doc(db, PURCHASE_ORDERS_COLLECTION, purchaseOrderId);
    const poDoc = await getDoc(poRef);

    if (!poDoc.exists()) {
      throw new Error(`Nie znaleziono zamówienia zakupowego o ID ${purchaseOrderId}`);
    }

    const poData = poDoc.data();
    
    // Sprawdź, czy zamówienie zawiera element o podanym ID
    if (!poData.items || !Array.isArray(poData.items)) {
      throw new Error('Zamówienie nie zawiera listy produktów');
    }

    let updatedItems = [...poData.items];
    let itemWasUpdated = false;
    
    console.log(`Próba aktualizacji PO ${purchaseOrderId}, produkt ${itemId}, ilość: ${receivedQuantity}`);
    
    // Najpierw sprawdź bezpośrednie dopasowanie po ID
    updatedItems = updatedItems.map(item => {
      if (item.id === itemId || 
          item.itemId === itemId || 
          item.inventoryItemId === itemId) {
        // Aktualizuj lub ustaw pole received
        const currentReceived = parseFloat(item.received || 0);
        const newReceived = currentReceived + parseFloat(receivedQuantity);
        
        // Oblicz procent realizacji zamówienia
        const ordered = parseFloat(item.quantity) || 0;
        const fulfilledPercentage = ordered > 0 ? (newReceived / ordered) * 100 : 0;
        
        itemWasUpdated = true;
        console.log(`Aktualizacja ilości w PO: ${item.name}, było ${currentReceived}, dodano ${receivedQuantity}, jest ${newReceived}`);
        
        return {
          ...item,
          received: newReceived,
          fulfilledPercentage: Math.min(fulfilledPercentage, 100) // Nie więcej niż 100%
        };
      }
      return item;
    });

    // Jeśli nie znaleziono po ID, spróbuj znaleźć element po nazwie produktu
    if (!itemWasUpdated) {
      try {
        const { getInventoryItemById } = await import('./inventoryService');
        const inventoryItem = await getInventoryItemById(itemId);
        
        if (inventoryItem && inventoryItem.name) {
          const productName = inventoryItem.name;
          console.log(`Szukanie dopasowania produktu po nazwie: ${productName}`);
          
          // Utwórz nową kopię tablicy items do aktualizacji
          let foundIndex = -1;
          
          // Znajdź produkt o pasującej nazwie
          for (let i = 0; i < updatedItems.length; i++) {
            if (updatedItems[i].name && 
                updatedItems[i].name.toLowerCase().includes(productName.toLowerCase())) {
              foundIndex = i;
              break;
            }
          }
          
          if (foundIndex >= 0) {
            // Aktualizuj pole received
            const currentReceived = parseFloat(updatedItems[foundIndex].received || 0);
            const newReceived = currentReceived + parseFloat(receivedQuantity);
            
            // Oblicz procent realizacji zamówienia
            const ordered = parseFloat(updatedItems[foundIndex].quantity) || 0;
            const fulfilledPercentage = ordered > 0 ? (newReceived / ordered) * 100 : 0;
            
            // Zaktualizuj element
            updatedItems[foundIndex] = {
              ...updatedItems[foundIndex],
              received: newReceived,
              fulfilledPercentage: Math.min(fulfilledPercentage, 100),
              // Dodaj również powiązanie z ID produktu magazynowego dla przyszłych aktualizacji
              inventoryItemId: itemId
            };
            
            itemWasUpdated = true;
            console.log(`Zaktualizowano element po nazwie produktu: ${productName}`);
          }
        }
      } catch (error) {
        console.error('Błąd podczas próby dopasowania produktu po nazwie:', error);
      }
    }

    // Jeśli dalej nie znaleziono, spróbuj dopasować po kodzie SKU
    if (!itemWasUpdated && poData.items.length > 0) {
      try {
        // Pobierz informacje o produkcie z magazynu
        const { getInventoryItemById } = await import('./inventoryService');
        const inventoryItem = await getInventoryItemById(itemId);
        
        if (inventoryItem && inventoryItem.sku) {
          // Spróbuj znaleźć produkt o tym samym SKU
          let foundIndex = -1;
          
          for (let i = 0; i < updatedItems.length; i++) {
            if (updatedItems[i].sku && inventoryItem.sku === updatedItems[i].sku) {
              foundIndex = i;
              break;
            }
          }
          
          if (foundIndex >= 0) {
            // Aktualizuj pole received
            const currentReceived = parseFloat(updatedItems[foundIndex].received || 0);
            const newReceived = currentReceived + parseFloat(receivedQuantity);
            
            // Oblicz procent realizacji zamówienia
            const ordered = parseFloat(updatedItems[foundIndex].quantity) || 0;
            const fulfilledPercentage = ordered > 0 ? (newReceived / ordered) * 100 : 0;
            
            // Zaktualizuj element
            updatedItems[foundIndex] = {
              ...updatedItems[foundIndex],
              received: newReceived,
              fulfilledPercentage: Math.min(fulfilledPercentage, 100),
              inventoryItemId: itemId
            };
            
            itemWasUpdated = true;
            console.log(`Zaktualizowano element po kodzie SKU: ${inventoryItem.sku}`);
          }
        }
      } catch (error) {
        console.error('Błąd podczas próby dopasowania produktu po SKU:', error);
      }
    }

    // Ostatnia próba - aktualizuj pierwszy element, jeśli jest tylko jeden
    if (!itemWasUpdated && poData.items.length === 1) {
      const singleItem = poData.items[0];
      const currentReceived = parseFloat(singleItem.received || 0);
      const newReceived = currentReceived + parseFloat(receivedQuantity);
      
      // Oblicz procent realizacji zamówienia
      const ordered = parseFloat(singleItem.quantity) || 0;
      const fulfilledPercentage = ordered > 0 ? (newReceived / ordered) * 100 : 0;
      
      updatedItems[0] = {
        ...singleItem,
        received: newReceived,
        fulfilledPercentage: Math.min(fulfilledPercentage, 100),
        inventoryItemId: itemId // Zapisz powiązanie
      };
      
      itemWasUpdated = true;
      console.log(`Zaktualizowano jedyny element w zamówieniu: ${singleItem.name || 'bez nazwy'}`);
    }

    if (!itemWasUpdated) {
      console.warn(`Nie znaleziono produktu o ID ${itemId} w zamówieniu zakupowym ${purchaseOrderId}`);
      // Zwracamy sukces=false zamiast rzucać wyjątek, aby nie przerywać procesu
      return { 
        success: false, 
        message: 'Nie znaleziono produktu w zamówieniu',
        id: purchaseOrderId
      };
    }

    // Zaktualizuj status zamówienia na podstawie stanu odbioru wszystkich przedmiotów
    let newStatus = poData.status;
    const allItemsFulfilled = updatedItems.every(item => {
      const received = parseFloat(item.received || 0);
      const quantity = parseFloat(item.quantity || 0);
      return received >= quantity;
    });

    const anyItemFulfilled = updatedItems.some(item => {
      const received = parseFloat(item.received || 0);
      return received > 0;
    });

    // Aktualizuj status na podstawie stanu odbioru
    const nonUpdateableStatuses = ['cancelled', 'completed'];
    
    if (!nonUpdateableStatuses.includes(poData.status)) {
      if (allItemsFulfilled) {
        newStatus = 'delivered';
      } else if (anyItemFulfilled) {
        newStatus = 'partial';
      }
    }

    // Dodaj historię zmian statusu, jeśli status się zmienia
    let statusHistory = poData.statusHistory || [];
    if (newStatus !== poData.status) {
      statusHistory = [
        ...statusHistory,
        {
          oldStatus: poData.status || 'Nieznany',
          newStatus: newStatus,
          changedBy: userId,
          changedAt: new Date().toISOString()
        }
      ];
    }

    // Przygotuj dane do aktualizacji
    const updateData = {
      items: updatedItems,
      status: newStatus,
      statusHistory: statusHistory,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    };

    // Aktualizuj dokument w bazie danych
    await updateDoc(poRef, updateData);

    // Zwróć zaktualizowane dane
    return {
      id: purchaseOrderId,
      success: true,
      items: updatedItems,
      status: newStatus
    };
  } catch (error) {
    console.error('Błąd podczas aktualizacji ilości odebranych produktów:', error);
    throw error;
  }
}; 