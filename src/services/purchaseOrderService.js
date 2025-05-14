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
import { createNotification } from './notificationService';

// Stałe dla kolekcji w Firebase
const PURCHASE_ORDERS_COLLECTION = 'purchaseOrders';
const SUPPLIERS_COLLECTION = 'suppliers';

/**
 * Pomocnicza funkcja do bezpiecznej konwersji różnych formatów dat na ISO string
 * Obsługuje Timestamp, Date, string ISO i null
 */
const safeConvertDate = (dateField) => {
  if (!dateField) return null;
  
  try {
    // Jeśli to Timestamp z Firebase
    if (dateField && dateField.toDate && typeof dateField.toDate === 'function') {
      return dateField.toDate().toISOString();
    }
    
    // Jeśli to już string ISO
    if (typeof dateField === 'string') {
      return dateField;
    }
    
    // Jeśli to obiekt Date
    if (dateField instanceof Date) {
      return dateField.toISOString();
    }
    
    // Inne przypadki - spróbuj skonwertować lub zwróć null
    return null;
  } catch (error) {
    console.error("Błąd podczas konwersji daty:", error, dateField);
    return null;
  }
};

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
        // Bezpieczna konwersja dat zamiast bezpośredniego wywołania toDate()
        orderDate: safeConvertDate(poData.orderDate),
        expectedDeliveryDate: safeConvertDate(poData.expectedDeliveryDate),
        createdAt: safeConvertDate(poData.createdAt),
        updatedAt: safeConvertDate(poData.updatedAt)
      });
    }
    
    return purchaseOrders;
  } catch (error) {
    console.error('Błąd podczas pobierania zamówień zakupowych:', error);
    throw error;
  }
};

/**
 * Pobiera zamówienia zakupowe z paginacją
 * @param {number} page - Numer strony (numeracja od 1)
 * @param {number} limit - Liczba elementów na stronę
 * @param {string} sortField - Pole, po którym sortujemy
 * @param {string} sortOrder - Kierunek sortowania (asc/desc)
 * @param {Object} filters - Opcjonalne filtry (status, searchTerm)
 * @returns {Object} - Obiekt zawierający dane i metadane paginacji
 */
export const getPurchaseOrdersWithPagination = async (page = 1, limit = 10, sortField = 'createdAt', sortOrder = 'desc', filters = {}) => {
  try {
    // Ustaw realne wartości dla page i limit
    const pageNum = Math.max(1, page);
    const itemsPerPage = Math.max(1, limit);
    
    // Kolekcjonujemy wszystkie ID dostawców, aby potem pobrać ich dane za jednym razem
    const supplierIds = new Set();
    
    // Najpierw pobieramy wszystkie dane do filtrowania po stronie serwera
    // Przygotuj zapytanie z sortowaniem
    let q = query(
      collection(db, PURCHASE_ORDERS_COLLECTION),
      orderBy(sortField, sortOrder)
    );
    
    // Pobierz wszystkie dokumenty dla sortowania i paginacji
    const querySnapshot = await getDocs(q);
    let allDocs = querySnapshot.docs;
    
    // Filtrowanie po stronie serwera
    if (filters) {
      // Filtrowanie po statusie
      if (filters.status && filters.status !== 'all') {
        allDocs = allDocs.filter(doc => {
          const data = doc.data();
          return data.status === filters.status;
        });
      }
      
      // Filtrowanie po tekście wyszukiwania
      if (filters.searchTerm && filters.searchTerm.trim() !== '') {
        const searchTerm = filters.searchTerm.toLowerCase().trim();
        allDocs = allDocs.filter(doc => {
          const data = doc.data();
          // Szukaj w numerze zamówienia
          if (data.number && data.number.toLowerCase().includes(searchTerm)) {
            return true;
          }
          
          // Szukaj w ID dostawcy - później będziemy szukać w nazwie dostawcy
          if (data.supplierId) {
            supplierIds.add(data.supplierId);
          }
          
          return false;
        });
      }
    }
    
    // Pobierz wszystkich dostawców, których ID zostały zebrane podczas filtrowania i paginacji
    const totalCount = allDocs.length;
    
    // Oblicz liczbę stron
    const totalPages = Math.ceil(totalCount / itemsPerPage);
    
    // Jeśli żądana strona jest większa niż liczba stron, ustaw na ostatnią stronę
    const safePageNum = Math.min(pageNum, Math.max(1, totalPages));
    
    // Ręczna paginacja
    const startIndex = (safePageNum - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, allDocs.length);
    const paginatedDocs = allDocs.slice(startIndex, endIndex);
    
    // Zbierz wszystkie ID dostawców z paginowanych dokumentów
    paginatedDocs.forEach(doc => {
      const data = doc.data();
      if (data.supplierId) {
        supplierIds.add(data.supplierId);
      }
    });
    
    // Pobierz wszystkich dostawców z listy ID jednym zapytaniem zbiorczym
    const suppliersMap = {}; // Mapa ID -> dane dostawcy
    
    if (supplierIds.size > 0) {
      // Konwertuj Set na Array
      const supplierIdsArray = Array.from(supplierIds);
      
      // Firebase ma limit 10 elementów w klauzuli 'in', więc musimy podzielić na mniejsze grupy
      const batchSize = 10;
      for (let i = 0; i < supplierIdsArray.length; i += batchSize) {
        const batch = supplierIdsArray.slice(i, i + batchSize);
        const suppliersQuery = query(
          collection(db, SUPPLIERS_COLLECTION),
          where('__name__', 'in', batch)
        );
        
        const suppliersSnapshot = await getDocs(suppliersQuery);
        suppliersSnapshot.forEach(doc => {
          suppliersMap[doc.id] = { id: doc.id, ...doc.data() };
        });
      }
    }
    
    // Przygotuj dane zamówień
    let purchaseOrders = paginatedDocs.map(docRef => {
      const poData = docRef.data();
      
      // Pobierz dane dostawcy z wcześniej utworzonej mapy
      const supplierData = poData.supplierId ? suppliersMap[poData.supplierId] || null : null;
      
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
      } else {
        totalGross = parseFloat(totalGross) || 0;
      }
      
      return {
        id: docRef.id,
        ...poData,
        supplier: supplierData,
        totalGross: totalGross,
        // Bezpieczna konwersja dat zamiast bezpośredniego wywołania toDate()
        orderDate: safeConvertDate(poData.orderDate),
        expectedDeliveryDate: safeConvertDate(poData.expectedDeliveryDate),
        createdAt: safeConvertDate(poData.createdAt),
        updatedAt: safeConvertDate(poData.updatedAt)
      };
    });
    
    // Dodatkowe filtrowanie po nazwie dostawcy, jeśli jest szukany term
    if (filters.searchTerm && filters.searchTerm.trim() !== '') {
      const searchTerm = filters.searchTerm.toLowerCase().trim();
      // Filtruj zamówienia, gdzie nazwa dostawcy pasuje do wyszukiwanego terminu
      purchaseOrders = purchaseOrders.filter(po => 
        po.supplier && po.supplier.name && 
        po.supplier.name.toLowerCase().includes(searchTerm)
      );
    }
    
    // Zwróć dane wraz z informacjami o paginacji
    return {
      data: purchaseOrders,
      pagination: {
        page: safePageNum,
        limit: itemsPerPage,
        totalItems: totalCount,
        totalPages: totalPages
      }
    };
  } catch (error) {
    console.error('Błąd podczas pobierania zamówień zakupowych z paginacją:', error);
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
    
    // Pobierz dane dostawcy, tylko jeśli zamówienie ma referencję do dostawcy
    // i nie zawiera już pełnych danych dostawcy
    let supplierData = null;
    if (poData.supplier && poData.supplier.id) {
      // Już mamy dane dostawcy w obiekcie zamówienia
      supplierData = poData.supplier;
    } else if (poData.supplierId) {
      // Pobierz dane dostawcy z bazy
      const supplierDoc = await getDoc(doc(db, SUPPLIERS_COLLECTION, poData.supplierId));
      if (supplierDoc.exists()) {
        supplierData = { id: supplierDoc.id, ...supplierDoc.data() };
      }
    }
    
    // Upewnij się, że wszystkie pola są poprawnie przekształcone - użyj destrukturyzacji z wartościami domyślnymi
    // aby uniknąć wielu operacji
    const result = {
      id: purchaseOrderDoc.id,
      ...poData,
      supplier: supplierData,
      number: poData.number || '',
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
    // Użyj funkcji generatePONumber z numberGenerators.js, która tworzy numery w formacie PO00001
    const { generatePONumber } = await import('../utils/numberGenerators');
    return await generatePONumber();
    
    // Poniższy kod jest zakomentowany, ponieważ używamy teraz starego formatu bez roku
    /*
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
    */
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
      additionalCostsItems = [], 
      additionalCosts = 0,
      status = 'draft', 
      targetWarehouseId = '',
      orderDate = new Date(),
      expectedDeliveryDate,
      deliveryAddress = '',
      notes = '',
      totalValue,
      totalGross,
      totalVat
    } = purchaseOrderData;

    // Generuj numer zamówienia
    const number = await generateOrderNumber('PO');
    
    // Obliczamy wartości VAT i brutto jeśli nie zostały dostarczone
    let calculatedTotalValue = totalValue;
    let calculatedTotalGross = totalGross;
    let calculatedTotalVat = totalVat;
    
    if (!calculatedTotalValue || !calculatedTotalGross || !calculatedTotalVat) {
      // Obliczanie wartości netto i VAT dla pozycji produktów
      let itemsNetTotal = 0;
      let itemsVatTotal = 0;
      
      for (const item of items) {
        const itemNet = parseFloat(item.totalPrice) || 0;
        itemsNetTotal += itemNet;
    
        // Obliczanie VAT dla pozycji na podstawie jej indywidualnej stawki VAT
        const vatRate = typeof item.vatRate === 'number' ? item.vatRate : 0;
        const itemVat = (itemNet * vatRate) / 100;
        itemsVatTotal += itemVat;
      }
      
      // Obliczanie wartości netto i VAT dla dodatkowych kosztów
      let additionalCostsNetTotal = 0;
      let additionalCostsVatTotal = 0;
      
      for (const cost of additionalCostsItems) {
        const costNet = parseFloat(cost.value) || 0;
        additionalCostsNetTotal += costNet;
        
        // Obliczanie VAT dla dodatkowego kosztu na podstawie jego indywidualnej stawki VAT
        const vatRate = typeof cost.vatRate === 'number' ? cost.vatRate : 0;
        const costVat = (costNet * vatRate) / 100;
        additionalCostsVatTotal += costVat;
      }
      
      // Dla wstecznej kompatybilności - obsługa starego pola additionalCosts
      if (additionalCosts > 0 && (!additionalCostsItems || additionalCostsItems.length === 0)) {
        additionalCostsNetTotal += parseFloat(additionalCosts) || 0;
      }
      
      // Suma wartości netto: produkty + dodatkowe koszty
      calculatedTotalValue = itemsNetTotal + additionalCostsNetTotal;
      
      // Suma VAT: VAT od produktów + VAT od dodatkowych kosztów
      calculatedTotalVat = itemsVatTotal + additionalCostsVatTotal;
      
      // Wartość brutto: suma netto + suma VAT
      calculatedTotalGross = calculatedTotalValue + calculatedTotalVat;
    }
    
    // Zapisujemy tylko ID dostawcy, a nie cały obiekt - z zabezpieczeniem przed undefined
    const supplierId = supplier?.id || null;
    
    // Bezpieczna konwersja dat do obiektów Date
    const safeConvertToDate = (value) => {
      if (!value) return null;
      
      try {
        // Jeśli to już obiekt Date, zwróć go
        if (value instanceof Date) return value;
        
        // Jeśli to string, konwertuj na Date
        if (typeof value === 'string') return new Date(value);
        
        // Jeśli to Timestamp, użyj toDate()
        if (value && value.toDate && typeof value.toDate === 'function') return value.toDate();
        
        return null;
      } catch (error) {
        console.error("Błąd konwersji daty:", error);
        return null;
      }
    };
    
    // Przygotuj obiekt zamówienia zakupowego
    const newPurchaseOrder = {
      number,
      supplierId,
      items,
      totalValue: calculatedTotalValue,
      totalGross: calculatedTotalGross, // Wartość brutto
      totalVat: calculatedTotalVat, // Wartość VAT (nowe pole)
      additionalCostsItems,
      currency,
      status,
      targetWarehouseId,
      orderDate: safeConvertToDate(orderDate) || new Date(),
      expectedDeliveryDate: safeConvertToDate(expectedDeliveryDate),
      deliveryAddress,
      notes,
      createdBy: userId,
      updatedBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    // Dodaj zamówienie do bazy danych
    const docRef = await addDoc(collection(db, PURCHASE_ORDERS_COLLECTION), newPurchaseOrder);
    
    // Konwersja Date na ISO string dla zwróconych danych
    const result = {
      id: docRef.id,
      ...newPurchaseOrder,
      supplier: supplier, // Dodajemy pełny obiekt dostawcy dla interfejsu
      orderDate: safeConvertDate(newPurchaseOrder.orderDate),
      expectedDeliveryDate: safeConvertDate(newPurchaseOrder.expectedDeliveryDate),
      createdAt: new Date().toISOString(), // serverTimestamp nie zwraca wartości od razu
      updatedAt: new Date().toISOString()
    };
    
    console.log("Nowe PO - wynik:", result);
    return result;
  } catch (error) {
    console.error('Błąd podczas tworzenia zamówienia zakupowego:', error);
    throw error;
  }
};

/**
 * Aktualizuje istniejące zamówienie zakupowe
 * @param {string} purchaseOrderId - ID zamówienia, które ma być zaktualizowane
 * @param {Object} updatedData - Dane do aktualizacji
 * @returns {Promise<Object>} - Zaktualizowane zamówienie
 */
export const updatePurchaseOrder = async (purchaseOrderId, updatedData, userId = null) => {
  try {
    if (!purchaseOrderId) {
      throw new Error('ID zamówienia zakupowego jest wymagane');
    }

    // Pobierz referencję do dokumentu
    const purchaseOrderRef = doc(db, PURCHASE_ORDERS_COLLECTION, purchaseOrderId);
    
    // Pobierz aktualne dane zamówienia
    const poDoc = await getDoc(purchaseOrderRef);
    
    if (!poDoc.exists()) {
      throw new Error(`Nie znaleziono zamówienia zakupowego o ID ${purchaseOrderId}`);
    }
    
    // Aktualizuj dokument
    await updateDoc(purchaseOrderRef, {
      ...updatedData,
      updatedAt: serverTimestamp(),
      updatedBy: userId || 'system'
    });
    
    // Jeśli zaktualizowano dodatkowe koszty, zaktualizuj również powiązane partie
    const hasAdditionalCostsUpdate = updatedData.additionalCostsItems !== undefined || 
                                     updatedData.additionalCosts !== undefined;
    
    if (hasAdditionalCostsUpdate) {
      console.log('Wykryto aktualizację dodatkowych kosztów, aktualizuję ceny partii');
      // Pobierz pełne dane po aktualizacji
      const updatedPoDoc = await getDoc(purchaseOrderRef);
      const updatedPoData = updatedPoDoc.data();
      
      // Aktualizuj ceny w powiązanych partiach
      await updateBatchPricesWithAdditionalCosts(purchaseOrderId, updatedPoData, userId || 'system');
    }
    
    // Pobierz zaktualizowane dane
    return await getPurchaseOrderById(purchaseOrderId);
  } catch (error) {
    console.error(`Błąd podczas aktualizacji zamówienia ${purchaseOrderId}:`, error);
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
        updateFields.deliveredAt = serverTimestamp();
        updateFields.deliveredBy = userId;
        console.log(`Zamówienie ${purchaseOrderId} oznaczone jako dostarczone w dniu ${new Date().toLocaleDateString()} o godzinie ${new Date().toLocaleTimeString()}`);
      }
      
      await updateDoc(poRef, updateFields);
      
      // Jeśli zaimportowano usługę powiadomień, utwórz powiadomienie o zmianie statusu
      try {
        await createNotification({
          userId,
          type: 'statusChange',
          entityType: 'purchaseOrder',
          entityId: purchaseOrderId,
          entityName: poData.number || purchaseOrderId.substring(0, 8),
          oldStatus: oldStatus || 'Szkic',
          newStatus: newStatus,
          createdAt: new Date().toISOString()
        });
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
        // Bezpieczna konwersja dat zamiast bezpośredniego wywołania toDate()
        orderDate: safeConvertDate(poData.orderDate),
        expectedDeliveryDate: safeConvertDate(poData.expectedDeliveryDate),
        createdAt: safeConvertDate(poData.createdAt),
        updatedAt: safeConvertDate(poData.updatedAt)
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
        // Bezpieczna konwersja dat zamiast bezpośredniego wywołania toDate()
        orderDate: safeConvertDate(poData.orderDate),
        expectedDeliveryDate: safeConvertDate(poData.expectedDeliveryDate),
        createdAt: safeConvertDate(poData.createdAt),
        updatedAt: safeConvertDate(poData.updatedAt)
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

export const updatePurchaseOrderItems = async (purchaseOrderId, updatedItems, userId) => {
  try {
    // Sprawdź, czy zamówienie istnieje
    const purchaseOrderRef = doc(db, PURCHASE_ORDERS_COLLECTION, purchaseOrderId);
    const purchaseOrderSnap = await getDoc(purchaseOrderRef);
    
    if (!purchaseOrderSnap.exists()) {
      throw new Error(`Zamówienie zakupowe o ID ${purchaseOrderId} nie istnieje`);
    }
    
    const existingPO = purchaseOrderSnap.data();
    
    // Pobierz istniejące pozycje
    const existingItems = existingPO.items || [];
    
    // Zaktualizuj pozycje - zastępuj istniejące lub dodaj nowe
    const newItems = [...existingItems];
    
    // Dla każdej zaktualizowanej pozycji
    for (const updatedItem of updatedItems) {
      // Znajdź pozycję po ID
      const index = newItems.findIndex(item => item.id === updatedItem.id);
      
      if (index !== -1) {
        // Zaktualizuj istniejącą pozycję
        newItems[index] = {
          ...newItems[index],
          ...updatedItem
        };
      } else {
        // Dodaj nową pozycję
        newItems.push(updatedItem);
      }
    }
    
    // Obliczanie wartości netto i VAT dla zaktualizowanych pozycji
    let itemsNetTotal = 0;
    let itemsVatTotal = 0;
    
    for (const item of newItems) {
      const itemNet = parseFloat(item.totalPrice) || 0;
      itemsNetTotal += itemNet;
      
      // Obliczanie VAT dla pozycji na podstawie jej indywidualnej stawki VAT
      const vatRate = typeof item.vatRate === 'number' ? item.vatRate : 0;
      const itemVat = (itemNet * vatRate) / 100;
      itemsVatTotal += itemVat;
    }
    
    // Obliczanie wartości netto i VAT dla dodatkowych kosztów
    let additionalCostsNetTotal = 0;
    let additionalCostsVatTotal = 0;
    
    if (existingPO.additionalCostsItems && Array.isArray(existingPO.additionalCostsItems)) {
      for (const cost of existingPO.additionalCostsItems) {
        const costNet = parseFloat(cost.value) || 0;
        additionalCostsNetTotal += costNet;
        
        // Obliczanie VAT dla dodatkowego kosztu na podstawie jego indywidualnej stawki VAT
        const vatRate = typeof cost.vatRate === 'number' ? cost.vatRate : 0;
        const costVat = (costNet * vatRate) / 100;
        additionalCostsVatTotal += costVat;
      }
    } else if (existingPO.additionalCosts > 0) {
      // Dla wstecznej kompatybilności - obsługa starego pola additionalCosts
      additionalCostsNetTotal += parseFloat(existingPO.additionalCosts) || 0;
    }
    
    // Suma wartości netto: produkty + dodatkowe koszty
    const calculatedTotalValue = itemsNetTotal + additionalCostsNetTotal;
    
    // Suma VAT: VAT od produktów + VAT od dodatkowych kosztów
    const calculatedTotalVat = itemsVatTotal + additionalCostsVatTotal;
    
    // Wartość brutto: suma netto + suma VAT
    const calculatedTotalGross = calculatedTotalValue + calculatedTotalVat;
    
    // Przygotuj dane do aktualizacji
    const updateFields = {
      items: newItems,
      totalValue: calculatedTotalValue,
      totalGross: calculatedTotalGross,
      totalVat: calculatedTotalVat,
      updatedBy: userId,
      updatedAt: serverTimestamp()
    };
    
    // Aktualizuj dokument
    await updateDoc(purchaseOrderRef, updateFields);
    
    // Pobierz zaktualizowane dane zamówienia
    const updatedDocSnap = await getDoc(purchaseOrderRef);
    
    if (!updatedDocSnap.exists()) {
      throw new Error(`Nie można pobrać zaktualizowanego zamówienia o ID ${purchaseOrderId}`);
    }
    
    return {
      id: purchaseOrderId,
      ...updatedDocSnap.data(),
      updatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('Błąd podczas aktualizacji pozycji zamówienia zakupowego:', error);
    throw error;
  }
};

/**
 * Aktualizuje ceny jednostkowe partii powiązanych z zamówieniem zakupu po dodaniu dodatkowych kosztów
 * @param {string} purchaseOrderId - ID zamówienia zakupowego
 * @param {Object} poData - Dane zamówienia zakupowego
 * @param {string} userId - ID użytkownika dokonującego aktualizacji
 */
const updateBatchPricesWithAdditionalCosts = async (purchaseOrderId, poData, userId) => {
  try {
    console.log(`Aktualizuję ceny partii dla zamówienia ${purchaseOrderId}`);
    
    // Oblicz łączne dodatkowe koszty BRUTTO (z VAT)
    let additionalCostsGrossTotal = 0;
    
    // Z nowego formatu additionalCostsItems
    if (poData.additionalCostsItems && Array.isArray(poData.additionalCostsItems)) {
      additionalCostsGrossTotal = poData.additionalCostsItems.reduce((sum, cost) => {
        const net = parseFloat(cost.value) || 0;
        const vatRate = typeof cost.vatRate === 'number' ? cost.vatRate : 0;
        const vat = (net * vatRate) / 100;
        return sum + net + vat;
      }, 0);
    } 
    // Ze starego pola additionalCosts (dla kompatybilności, traktujemy jako brutto)
    else if (poData.additionalCosts) {
      additionalCostsGrossTotal = parseFloat(poData.additionalCosts) || 0;
    }
    
    // Jeśli brak dodatkowych kosztów, nie ma potrzeby aktualizacji
    if (additionalCostsGrossTotal <= 0) {
      console.log(`Brak dodatkowych kosztów do rozliczenia w zamówieniu ${purchaseOrderId}`);
      return;
    }
    
    // Oblicz całkowitą ilość produktów w zamówieniu
    let totalProductQuantity = 0;
    if (poData.items && Array.isArray(poData.items)) {
      // Obliczamy na podstawie initialQuantity zamiast bieżącej ilości
      totalProductQuantity = poData.items.reduce((sum, item) => {
        // Użyj pola initialQuantity (jeśli dostępne), w przeciwnym razie received lub quantity
        const quantity = item.initialQuantity !== undefined ? parseFloat(item.initialQuantity) : 
                       (item.received !== undefined ? parseFloat(item.received) : parseFloat(item.quantity));
        return sum + (quantity || 0);
      }, 0);
    }
    
    // Jeśli brak produktów, nie ma potrzeby aktualizacji
    if (totalProductQuantity <= 0) {
      console.log(`Brak produktów do podziału kosztów w zamówieniu ${purchaseOrderId}`);
      return;
    }
    
    // Oblicz dodatkowy koszt BRUTTO na jednostkę
    const additionalCostPerUnit = additionalCostsGrossTotal / totalProductQuantity;
    
    console.log(`Obliczony dodatkowy koszt brutto na jednostkę: ${additionalCostPerUnit}`);
    
    // Pobierz wszystkie partie magazynowe powiązane z tym zamówieniem
    const { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
    const firebaseConfig = await import('./firebase/config');
    const db = firebaseConfig.db;
    const INVENTORY_BATCHES_COLLECTION = 'inventoryBatches'; // Używamy bezpośrednio nazwy kolekcji
    
    // Spróbuj znaleźć partie używając obu modeli danych
    let batchesToUpdate = [];
    
    // 1. Szukaj partii z polem purchaseOrderDetails.id równym ID zamówienia
    const batchesQuery = query(
      collection(db, INVENTORY_BATCHES_COLLECTION),
      where('purchaseOrderDetails.id', '==', purchaseOrderId)
    );
    
    const batchesSnapshot = await getDocs(batchesQuery);
    batchesSnapshot.forEach(doc => {
      batchesToUpdate.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    // 2. Szukaj partii używając starszego modelu danych
    if (batchesToUpdate.length === 0) {
      const oldFormatQuery = query(
        collection(db, INVENTORY_BATCHES_COLLECTION),
        where('sourceDetails.orderId', '==', purchaseOrderId)
      );
      
      const oldFormatSnapshot = await getDocs(oldFormatQuery);
      oldFormatSnapshot.forEach(doc => {
        batchesToUpdate.push({
          id: doc.id,
          ...doc.data()
        });
      });
    }
    
    console.log(`Znaleziono ${batchesToUpdate.length} partii powiązanych z zamówieniem ${purchaseOrderId}`);
    
    // Jeśli nie znaleziono partii, zakończ
    if (batchesToUpdate.length === 0) {
      console.log(`Nie znaleziono partii powiązanych z zamówieniem ${purchaseOrderId}`);
      return;
    }
    
    // Aktualizuj każdą partię
    const updatePromises = [];
    
    for (const batchData of batchesToUpdate) {
      const batchRef = doc(db, INVENTORY_BATCHES_COLLECTION, batchData.id);
      
      // Zachowaj oryginalną cenę jako baseUnitPrice, jeśli nie jest już ustawiona
      const baseUnitPrice = batchData.baseUnitPrice !== undefined 
        ? batchData.baseUnitPrice 
        : batchData.unitPrice || 0;
        
      // Ustawienie nowej ceny jednostkowej: cena netto + koszt dodatkowy brutto na jednostkę
      const newUnitPrice = parseFloat(baseUnitPrice) + additionalCostPerUnit;
      
      console.log(`Aktualizuję partię ${batchData.id}: basePrice=${baseUnitPrice}, additionalCostBrutto=${additionalCostPerUnit}, newPrice=${newUnitPrice}`);
      
      // Aktualizuj dokument partii
      updatePromises.push(updateDoc(batchRef, {
        baseUnitPrice: parseFloat(baseUnitPrice),
        additionalCostPerUnit: additionalCostPerUnit,
        unitPrice: newUnitPrice,
        updatedAt: serverTimestamp(),
        updatedBy: userId
      }));
    }
    
    await Promise.all(updatePromises);
    console.log(`Zaktualizowano ceny ${updatePromises.length} partii`);
    
  } catch (error) {
    console.error('Błąd podczas aktualizacji cen partii:', error);
    // Dodamy szczegóły błędu, aby łatwiej zdiagnozować problem w przyszłości
    console.error('Szczegóły błędu:', error.message, error.stack);
    // Nie rzucamy błędu dalej, aby nie przerywać procesu aktualizacji PO
  }
};

// Eksportuję nową funkcję
export const updateBatchesForPurchaseOrder = async (purchaseOrderId, userId) => {
  try {
    // Pobierz dane zamówienia
    const poData = await getPurchaseOrderById(purchaseOrderId);
    if (!poData) {
      throw new Error(`Nie znaleziono zamówienia o ID ${purchaseOrderId}`);
    }
    
    // Aktualizuj ceny partii
    await updateBatchPricesWithAdditionalCosts(purchaseOrderId, poData, userId);
    
    return { success: true };
  } catch (error) {
    console.error('Błąd podczas aktualizacji partii dla zamówienia:', error);
    throw error;
  }
}; 