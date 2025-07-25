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
  serverTimestamp,
  Timestamp,
  limit
} from 'firebase/firestore';
import { db } from './firebase/config';
import { generateCONumber, generatePONumber } from '../utils/numberGenerators';
import { formatDateForInput } from '../utils/dateUtils';

const ORDERS_COLLECTION = 'orders';
const CUSTOMERS_COLLECTION = 'customers';

// Cache dla statystyk zamówień
const ordersStatsCache = {
  data: null,
  timestamp: null,
  fetchInProgress: false,
  ttl: 60000 // 60 sekund cache
};

/**
 * Pobiera wszystkie zamówienia
 * Możliwość filtrowania po statusie
 * Zbiorczo pobiera dane klientów
 */
export const getAllOrders = async (filters = null) => {
  try {
    let ordersQuery;
    
    if (filters) {
      const conditions = [];
      
      if (filters.status && filters.status !== 'all') {
        conditions.push(where('status', '==', filters.status));
      }
      
      if (filters.customerId) {
        conditions.push(where('customer.id', '==', filters.customerId));
      }
      
      if (filters.fromDate) {
        const fromTimestamp = Timestamp.fromDate(new Date(filters.fromDate));
        conditions.push(where('orderDate', '>=', fromTimestamp));
      }
      
      if (filters.toDate) {
        const toTimestamp = Timestamp.fromDate(new Date(filters.toDate));
        conditions.push(where('orderDate', '<=', toTimestamp));
      }
      
      // Jeśli mamy warunki filtrowania, tworzymy odpowiednie zapytanie
      if (conditions.length > 0) {
        ordersQuery = query(
          collection(db, ORDERS_COLLECTION),
          ...conditions,
          orderBy('orderDate', 'desc')
        );
      } else {
        ordersQuery = query(
          collection(db, ORDERS_COLLECTION),
          orderBy('orderDate', 'desc')
        );
      }
    } else {
      ordersQuery = query(
        collection(db, ORDERS_COLLECTION),
        orderBy('orderDate', 'desc')
      );
    }
    
    const querySnapshot = await getDocs(ordersQuery);
    
    // Funkcja pomocnicza do bezpiecznej konwersji dat
    const safeConvertDate = (dateValue, fieldName, docId) => {
      if (!dateValue) return null;
      
      try {
        if (dateValue instanceof Timestamp) {
          return dateValue.toDate();
        } else if (dateValue instanceof Date) {
          return isNaN(dateValue.getTime()) ? null : dateValue;
        } else if (typeof dateValue === 'string' || typeof dateValue === 'number') {
          const converted = new Date(dateValue);
          if (isNaN(converted.getTime())) {
            // Nie logujemy w getAllOrders, aby nie zapychać konsoli
            return null;
          }
          return converted;
        }
        return null;
      } catch (error) {
        return null;
      }
    };

    const orders = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        orderDate: safeConvertDate(data.orderDate, 'orderDate', doc.id),
        expectedDeliveryDate: safeConvertDate(data.expectedDeliveryDate, 'expectedDeliveryDate', doc.id),
        deadline: safeConvertDate(data.deadline, 'deadline', doc.id),
        deliveryDate: safeConvertDate(data.deliveryDate, 'deliveryDate', doc.id),
      };
    });
    
    // Zbierz wszystkie ID klientów
    const customerIds = new Set();
    orders.forEach(order => {
      if (order.customerId && !order.customer) {
        customerIds.add(order.customerId);
      }
    });
    
    // Pobierz klientów jednym zapytaniem, z uwzględnieniem limitu 10 elementów per zapytanie
    const customersMap = {};
    if (customerIds.size > 0) {
      const customerIdsArray = Array.from(customerIds);
      
      // Pobierz klientów w grupach po 10 (limit Firestore dla operatora 'in')
      const batchSize = 10;
      for (let i = 0; i < customerIdsArray.length; i += batchSize) {
        const batch = customerIdsArray.slice(i, i + batchSize);
        const customersQuery = query(
          collection(db, CUSTOMERS_COLLECTION),
          where('__name__', 'in', batch)
        );
        
        const customersSnapshot = await getDocs(customersQuery);
        customersSnapshot.forEach(doc => {
          customersMap[doc.id] = { id: doc.id, ...doc.data() };
        });
      }
    }
    
    // Przypisz dane klientów do zamówień
    const ordersWithCustomers = orders.map(order => {
      if (order.customerId && !order.customer && customersMap[order.customerId]) {
        return {
          ...order,
          customer: customersMap[order.customerId]
        };
      }
      return order;
    });
    
    return ordersWithCustomers;
  } catch (error) {
    console.error('Błąd podczas pobierania zamówień:', error);
    throw error;
  }
};

/**
 * Pobiera zamówienie po ID
 */
export const getOrderById = async (id) => {
  try {
    const orderRef = doc(db, ORDERS_COLLECTION, id);
    const orderDoc = await getDoc(orderRef);
    
    if (!orderDoc.exists()) {
      throw new Error('Zamówienie nie istnieje');
    }
    
    const orderData = orderDoc.data();
    
    console.log(`DEBUG - getOrderById(${id}) - Raw data from database:`, {
      orderNumber: orderData.orderNumber,
      orderSource: orderData.orderSource,
      items: orderData.items,
      itemsLength: orderData.items?.length,
      itemsType: typeof orderData.items,
      itemsIsArray: Array.isArray(orderData.items)
    });
    
    // Konwertuj timestamp na obiekty Date
    // Funkcja pomocnicza do bezpiecznej konwersji dat
    const safeConvertDate = (dateValue, fieldName) => {
      if (!dateValue) return null;
      
      try {
        if (dateValue instanceof Timestamp) {
          return dateValue.toDate();
        } else if (dateValue instanceof Date) {
          return isNaN(dateValue.getTime()) ? null : dateValue;
        } else if (typeof dateValue === 'string' || typeof dateValue === 'number') {
          const converted = new Date(dateValue);
          if (isNaN(converted.getTime())) {
            if (process.env.NODE_ENV === 'development') {
              console.warn(`Nieprawidłowa data ${fieldName} w zamówieniu ${orderData.orderNumber || orderDoc.id}: ${dateValue}`);
            }
            return null;
          }
          return converted;
        }
        return null;
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(`Błąd konwersji daty ${fieldName} w zamówieniu ${orderData.orderNumber || orderDoc.id}:`, error);
        }
        return null;
      }
    };

    const processedOrder = {
      id: orderDoc.id,
      ...orderData,
      orderDate: safeConvertDate(orderData.orderDate, 'orderDate'),
      expectedDeliveryDate: safeConvertDate(orderData.expectedDeliveryDate, 'expectedDeliveryDate'),
      deadline: safeConvertDate(orderData.deadline, 'deadline'),
      deliveryDate: safeConvertDate(orderData.deliveryDate, 'deliveryDate'),
    };
    
    // Przetwarzanie zamówień zakupu powiązanych
    if (processedOrder.linkedPurchaseOrders && processedOrder.linkedPurchaseOrders.length > 0) {
      for (let i = 0; i < processedOrder.linkedPurchaseOrders.length; i++) {
        const po = processedOrder.linkedPurchaseOrders[i];
        
        try {
          // Sprawdź, czy po jest faktycznie obiektem
          if (!po || typeof po !== 'object') {
            console.warn('Nieprawidłowy obiekt zamówienia zakupu:', po);
            continue;
          }
          
          // Jeśli nie ma id, nie możemy zaktualizować danych
          if (!po.id) {
            console.warn('Zamówienie zakupu bez ID:', po);
            continue;
          }
          
          // Pobierz aktualne dane zamówienia zakupu (opcjonalnie)
          if (po.id) {
            try {
              const { getPurchaseOrderById } = await import('./purchaseOrderService');
              const freshPoData = await getPurchaseOrderById(po.id);
              
              // Aktualizuj tylko niektóre kluczowe pola, aby nie zastępować całej struktury
              if (freshPoData) {
                console.log(`Zaktualizowano dane PO ${po.number} z bazy danych`);
                po.totalValue = freshPoData.totalValue;
                po.totalGross = freshPoData.totalGross;
                po.status = freshPoData.status;
                po.vatRate = freshPoData.vatRate;
                
                // Aktualizuj dane o dodatkowych kosztach
                if (freshPoData.additionalCostsItems) {
                  po.additionalCostsItems = freshPoData.additionalCostsItems;
                } else if (freshPoData.additionalCosts) {
                  po.additionalCosts = freshPoData.additionalCosts;
                }
              }
            } catch (error) {
              console.warn(`Nie można pobrać świeżych danych PO ${po.id}: ${error.message}`);
            }
          }
        } catch (error) {
          console.warn(`Błąd przetwarzania PO ${po.number || po.id}: ${error.message}`);
        }
      }
    } else {
      processedOrder.linkedPurchaseOrders = [];
    }
    
    // Oblicz łączną wartość zamówienia z uwzględnieniem wartości zamówień zakupu
    let totalProductsValue = 0;
    if (processedOrder.items && processedOrder.items.length > 0) {
      totalProductsValue = processedOrder.items.reduce((sum, item) => {
        const quantity = parseFloat(item.quantity) || 0;
        const price = parseFloat(item.price) || 0;
        const itemValue = quantity * price;
        
        // Jeśli produkt nie jest z listy cenowej LUB ma cenę 0, i ma koszt produkcji, dodajemy go do wartości
        if ((item.fromPriceList !== true || parseFloat(item.price || 0) === 0) && item.productionTaskId && item.productionCost !== undefined) {
          const productionCost = parseFloat(item.productionCost || 0);
          return sum + itemValue + productionCost;
        }
        
        // W przeciwnym razie tylko standardowa wartość
        return sum + itemValue;
      }, 0);
    }
    
    const shippingCost = parseFloat(processedOrder.shippingCost) || 0;
    
    // Oblicz wartość brutto zamówień zakupu
    let poTotalGross = 0;
    if (processedOrder.linkedPurchaseOrders && processedOrder.linkedPurchaseOrders.length > 0) {
      poTotalGross = processedOrder.linkedPurchaseOrders.reduce((sum, po) => {
        // Jeśli zamówienie ma już wartość brutto, używamy jej
        if (po.totalGross !== undefined && po.totalGross !== null) {
          const value = typeof po.totalGross === 'number' ? po.totalGross : parseFloat(po.totalGross) || 0;
          return sum + value;
        }
        
        // W przeciwnym razie obliczamy wartość brutto
        const productsValue = parseFloat(po.totalValue || po.value) || 0;
        const vatRate = parseFloat(po.vatRate) || 23;
        const vatValue = (productsValue * vatRate) / 100;
        
        // Sprawdzenie czy istnieją dodatkowe koszty
        let additionalCosts = 0;
        if (po.additionalCostsItems && Array.isArray(po.additionalCostsItems)) {
          additionalCosts = po.additionalCostsItems.reduce((costsSum, cost) => {
            return costsSum + (parseFloat(cost.value) || 0);
          }, 0);
        } else {
          additionalCosts = parseFloat(po.additionalCosts) || 0;
        }
        
        return sum + productsValue + vatValue + additionalCosts;
      }, 0);
    }
    
    // Oblicz dodatkowe koszty i rabaty
    let additionalCostsTotal = 0;
    let discountsTotal = 0;
    
    if (processedOrder.additionalCostsItems && Array.isArray(processedOrder.additionalCostsItems)) {
      processedOrder.additionalCostsItems.forEach(cost => {
        const value = parseFloat(cost.value) || 0;
        if (value > 0) {
          additionalCostsTotal += value;
        } else if (value < 0) {
          discountsTotal += Math.abs(value);
        }
      });
    }
    
    // Aktualizacja łącznej wartości zamówienia
    processedOrder.productsValue = totalProductsValue;
    processedOrder.shippingCost = shippingCost;
    processedOrder.purchaseOrdersValue = poTotalGross;
    
    // Tylko oblicz totalValue jeśli nie istnieje w bazie lub jest 0
    // To pozwala zachować ręcznie zaktualizowane wartości
    const existingTotalValue = parseFloat(processedOrder.totalValue) || 0;
    if (existingTotalValue === 0) {
      processedOrder.totalValue = totalProductsValue + shippingCost + additionalCostsTotal - discountsTotal;
      console.log(`Obliczono nową wartość totalValue dla zamówienia ${id}: ${processedOrder.totalValue}`);
    } else {
      console.log(`Zachowano istniejącą wartość totalValue dla zamówienia ${id}: ${existingTotalValue}`);
    }
    
    console.log("Przetworzone dane zamówienia:", processedOrder);
    return processedOrder;
  } catch (error) {
    console.error(`Błąd podczas pobierania zamówienia ${id}:`, error);
    throw error;
  }
};

/**
 * Tworzy nowe zamówienie klienta
 */
export const createOrder = async (orderData, userId) => {
  try {
    // Walidacja danych zamówienia
    validateOrderData(orderData);
    
    // Wygeneruj numer CO z afiksem klienta, jeśli istnieje
    const customerAffix = orderData.customer && orderData.customer.orderAffix ? orderData.customer.orderAffix : '';
    // Pobierz ID klienta, jeśli istnieje
    const customerId = orderData.customer && orderData.customer.id ? orderData.customer.id : null;
    // Przekaż ID klienta do funkcji generującej numer CO
    const orderNumber = await generateCONumber(customerAffix, customerId);
    
    // Używamy wartości totalValue przekazanej w danych - ona już zawiera wszystkie składniki 
    // (produkty, koszty dostawy, dodatkowe koszty i rabaty)
    const totalValue = parseFloat(orderData.totalValue) || 0;
    
    // Upewnij się, że data zamówienia jest poprawna
    let orderDate = orderData.orderDate;
    if (!orderDate) {
      orderDate = new Date();
    } else if (typeof orderDate === 'string') {
      // Jeśli data jest stringiem, spróbuj sparsować
      orderDate = new Date(orderDate);
      // Jeśli parsowanie nie działa, użyj bieżącej daty
      if (isNaN(orderDate.getTime())) {
        console.warn('Nieprawidłowa data zamówienia. Używam bieżącej daty.');
        orderDate = new Date();
      }
    }
    
    // Tworzenie dokumentu zamówienia
    const orderWithMeta = {
      ...orderData,
      orderNumber,
      totalValue,
      orderDate: Timestamp.fromDate(orderDate),
      productionTasks: orderData.productionTasks || [], // Inicjalizacja listy zadań produkcyjnych
      status: orderData.status || 'Nowe',
      createdBy: userId,
      createdAt: serverTimestamp(),
      updatedBy: userId,
      updatedAt: serverTimestamp(),
      // Konwersja pozostałych dat na timestampy Firestore
      expectedDeliveryDate: orderData.expectedDeliveryDate 
        ? Timestamp.fromDate(new Date(orderData.expectedDeliveryDate)) 
        : null,
      deliveryDate: orderData.deliveryDate 
        ? Timestamp.fromDate(new Date(orderData.deliveryDate)) 
        : null
    };
    
    const docRef = await addDoc(collection(db, ORDERS_COLLECTION), orderWithMeta);
    const newOrderId = docRef.id;
    
    // Tworzenie powiadomienia o nowym zamówieniu
    try {
      const { createRealtimeNotification } = require('./notificationService');
      
      // ID użytkowników, którzy powinni otrzymać powiadomienie
      // W tym przypadku wysyłamy powiadomienie do użytkownika, który utworzył zamówienie
      // Dodatkowo można pobierać listę administratorów z bazy danych
      const userIds = [userId];
      
      // Dane klienta do powiadomienia
      const customerName = orderData.customer?.name || 'Nowy klient';
      const customerInfo = customerId ? `(${customerName})` : customerName;
      
      // Tworzymy powiadomienie
      await createRealtimeNotification({
        userIds,
        title: `Nowe zamówienie klienta (CO)`,
        message: `Utworzono nowe zamówienie klienta ${orderNumber} dla ${customerInfo}. Wartość: ${totalValue.toFixed(2)} EUR`,
        type: 'success',
        entityType: 'order',
        entityId: newOrderId,
        createdBy: userId
      });
      
      console.log(`Utworzono powiadomienie o nowym zamówieniu ${orderNumber}`);
    } catch (notificationError) {
      console.warn('Nie udało się utworzyć powiadomienia o nowym zamówieniu:', notificationError);
    }
    
    // Zwracamy obiekt zawierający ID oraz dane zamówienia (dla zachowania kompatybilności)
    return {
      id: newOrderId,
      ...orderWithMeta
    };
  } catch (error) {
    console.error('Błąd podczas tworzenia zamówienia:', error);
    throw error;
  }
};

/**
 * Tworzy nowe zamówienie zakupu
 */
export const createPurchaseOrder = async (orderData, userId) => {
  try {
    // Wygeneruj numer PO
    const orderNumber = await generatePONumber();
    
    const orderWithMeta = {
      ...orderData,
      orderNumber, // Dodaj numer PO
      type: 'purchase', // Oznacz jako zamówienie zakupu
      status: orderData.status || 'Nowe',
      createdBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    const docRef = await addDoc(collection(db, ORDERS_COLLECTION), orderWithMeta);
    const newOrderId = docRef.id;
    
    // Tworzenie powiadomienia o nowym zamówieniu zakupowym
    try {
      const { createRealtimeNotification } = require('./notificationService');
      
      // ID użytkowników, którzy powinni otrzymać powiadomienie
      const userIds = [userId];
      
      // Dane dostawcy do powiadomienia
      const supplierName = orderData.supplier?.name || 'Nowy dostawca';
      const currencySymbol = orderData.currency || 'EUR';
      const totalValue = parseFloat(orderData.totalValue || 0).toFixed(2);
      
      // Tworzymy powiadomienie
      await createRealtimeNotification({
        userIds,
        title: `Nowe zamówienie zakupowe (PO)`,
        message: `Utworzono nowe zamówienie zakupowe ${orderNumber} dla ${supplierName}. Wartość: ${totalValue} ${currencySymbol}`,
        type: 'success',
        entityType: 'purchaseOrder',
        entityId: newOrderId,
        createdBy: userId
      });
      
      console.log(`Utworzono powiadomienie o nowym zamówieniu zakupowym ${orderNumber}`);
    } catch (notificationError) {
      console.warn('Nie udało się utworzyć powiadomienia o nowym zamówieniu zakupowym:', notificationError);
    }
    
    return {
      id: newOrderId,
      ...orderWithMeta
    };
  } catch (error) {
    console.error('Błąd podczas tworzenia zamówienia zakupu:', error);
    throw error;
  }
};

/**
 * Aktualizuje dane zamówienia
 */
export const updateOrder = async (orderId, orderData, userId) => {
  try {
    // Walidacja danych zamówienia - sprawdź czy to częściowa aktualizacja
    const isPartialUpdate = !orderData.customer || !orderData.items;
    if (!isPartialUpdate) {
      validateOrderData(orderData);
    } else {
      // Dla częściowych aktualizacji, sprawdź tylko podstawowe wymagania
      if (orderData.items && (!Array.isArray(orderData.items) || orderData.items.length === 0)) {
        throw new Error('Zamówienie musi zawierać co najmniej jeden produkt');
      }
    }
    
    // Używamy wartości totalValue przekazanej w danych - ona już zawiera wszystkie składniki
    // (produkty, koszty dostawy, dodatkowe koszty i rabaty)
    const totalValue = parseFloat(orderData.totalValue) || 0;
    
    // Funkcja pomocnicza do bezpiecznej konwersji dat
    const safeConvertToTimestamp = (dateValue) => {
      if (!dateValue) return null;
      
      // Jeśli już jest to Timestamp Firestore, zwróć bez zmian
      if (dateValue && typeof dateValue.toDate === 'function') {
        return dateValue;
      }
      
      // Spróbuj przekonwertować na Date
      let date;
      if (dateValue instanceof Date) {
        date = dateValue;
      } else if (typeof dateValue === 'string' || typeof dateValue === 'number') {
        date = new Date(dateValue);
      } else {
        console.warn('Nieprawidłowy format daty:', dateValue);
        return null;
      }
      
      // Sprawdź czy data jest prawidłowa
      if (isNaN(date.getTime())) {
        console.warn('Nieprawidłowa data:', dateValue);
        return null;
      }
      
      return Timestamp.fromDate(date);
    };

    const updatedOrder = {
      ...orderData,
      totalValue,
      updatedBy: userId,
      updatedAt: serverTimestamp(),
      // Bezpieczna konwersja dat na timestampy Firestore
      ...(orderData.orderDate !== undefined && {
        orderDate: safeConvertToTimestamp(orderData.orderDate) || serverTimestamp()
      }),
      ...(orderData.expectedDeliveryDate !== undefined && {
        expectedDeliveryDate: safeConvertToTimestamp(orderData.expectedDeliveryDate)
      }),
      ...(orderData.deadline !== undefined && {
        deadline: safeConvertToTimestamp(orderData.deadline)
      }),
      ...(orderData.deliveryDate !== undefined && {
        deliveryDate: safeConvertToTimestamp(orderData.deliveryDate)
      })
    };
    
    await updateDoc(doc(db, ORDERS_COLLECTION, orderId), updatedOrder);
    return true;
  } catch (error) {
    console.error('Błąd podczas aktualizacji zamówienia:', error);
    throw error;
  }
};

/**
 * Usuwa zamówienie
 */
export const deleteOrder = async (orderId) => {
  try {
    await deleteDoc(doc(db, ORDERS_COLLECTION, orderId));
    return true;
  } catch (error) {
    console.error('Błąd podczas usuwania zamówienia:', error);
    throw error;
  }
};

/**
 * Aktualizuje ilość wysłaną dla pozycji zamówienia na podstawie CMR
 */
export const updateOrderItemShippedQuantity = async (orderId, itemUpdates, userId) => {
  try {
    // Pobierz aktualne dane zamówienia
    const orderRef = doc(db, ORDERS_COLLECTION, orderId);
    const orderDoc = await getDoc(orderRef);
    
    if (!orderDoc.exists()) {
      throw new Error('Zamówienie nie istnieje');
    }
    
    const orderData = orderDoc.data();
    const items = orderData.items || [];
    
    // Aktualizuj ilości wysłane dla odpowiednich pozycji
    const updatedItems = items.map(item => {
      const itemUpdate = itemUpdates.find(update => 
        update.itemName === item.name || 
        update.itemId === item.id ||
        update.itemIndex === items.indexOf(item)
      );
      
      if (itemUpdate) {
        const currentShipped = parseFloat(item.shippedQuantity) || 0;
        const additionalShipped = parseFloat(itemUpdate.quantity) || 0;
        
        // Inicjalizuj historię CMR jeśli nie istnieje
        const cmrHistory = item.cmrHistory || [];
        
        // Sprawdź, czy CMR już istnieje w historii
        const existingCmrIndex = cmrHistory.findIndex(entry => entry.cmrNumber === itemUpdate.cmrNumber);
        
        let updatedCmrHistory;
        if (existingCmrIndex !== -1) {
          // Jeśli CMR już istnieje, zaktualizuj ilość
          updatedCmrHistory = [...cmrHistory];
          updatedCmrHistory[existingCmrIndex] = {
            ...updatedCmrHistory[existingCmrIndex],
            quantity: (parseFloat(updatedCmrHistory[existingCmrIndex].quantity) || 0) + additionalShipped,
            shipmentDate: new Date().toISOString() // Zaktualizuj datę ostatniej wysyłki
          };
        } else {
          // Dodaj nowy wpis do historii CMR
          const newCmrEntry = {
            cmrNumber: itemUpdate.cmrNumber,
            quantity: additionalShipped,
            shipmentDate: new Date().toISOString(),
            unit: item.unit || 'szt.'
          };
          updatedCmrHistory = [...cmrHistory, newCmrEntry];
        }
        
                  return {
            ...item,
            shippedQuantity: currentShipped + additionalShipped,
            lastShipmentDate: new Date().toISOString(),
            lastCmrNumber: itemUpdate.cmrNumber,
            cmrHistory: updatedCmrHistory
          };
      }
      
      return item;
    });
    
    // Zaktualizuj zamówienie
    await updateDoc(orderRef, {
      items: updatedItems,
      updatedBy: userId,
      updatedAt: serverTimestamp()
    });
    
    return { success: true, updatedItems };
  } catch (error) {
    console.error('Błąd podczas aktualizacji ilości wysłanej:', error);
    throw error;
  }
};

/**
 * Aktualizuje status zamówienia
 */
export const updateOrderStatus = async (orderId, status, userId) => {
  try {
    const orderRef = doc(db, ORDERS_COLLECTION, orderId);
    const orderSnapshot = await getDoc(orderRef);
    
    if (!orderSnapshot.exists()) {
      throw new Error('Zamówienie nie istnieje');
    }
    
    const orderData = orderSnapshot.data();
    const oldStatus = orderData.status;
    
    // Aktualizuj dane zamówienia tylko jeśli status się zmienił
    if (oldStatus !== status) {
      // Dodanie historii zmian statusu
      const statusHistory = orderData.statusHistory || [];
      const statusChange = {
        oldStatus: oldStatus || 'Nowy',
        newStatus: status,
        changedBy: userId,
        changedAt: new Date().toISOString()
      };
      
      const updateData = {
        status: status,
        updatedBy: userId,
        updatedAt: serverTimestamp(),
        statusHistory: [...statusHistory, statusChange],
        // Jeśli status to "Dostarczone", ustaw datę dostawy
        ...(status === 'Dostarczone' ? { deliveryDate: serverTimestamp() } : {})
      };
      
      await updateDoc(orderRef, updateData);
      
      // Jeśli zaimportowano usługę powiadomień, utwórz powiadomienie o zmianie statusu
      try {
        const { createRealtimeStatusChangeNotification } = require('./notificationService');
        
        // Pobierz wszystkich administratorów, którzy powinni otrzymać powiadomienie
        // W tym przypadku powiadomienie wysyłamy tylko do użytkownika, który zmienił status,
        // ale można tu dodać więcej użytkowników, np. administratorów systemu
        const userIds = [userId];
        
        await createRealtimeStatusChangeNotification(
          userIds,
          'order',
          orderId,
          orderData.orderNumber || orderId.substring(0, 8),
          oldStatus || 'Nowy',
          status,
          userId // Przekazanie ID użytkownika, który zmienił status
        );
      } catch (notificationError) {
        console.warn('Nie udało się utworzyć powiadomienia w czasie rzeczywistym:', notificationError);
        
        // Fallback do starego systemu powiadomień, jeśli Realtime Database nie zadziała
        try {
          const { createStatusChangeNotification } = require('./notificationService');
          await createStatusChangeNotification(
            userId,
            'order',
            orderId,
            orderData.orderNumber || orderId.substring(0, 8),
            oldStatus || 'Nowy',
            status
          );
        } catch (fallbackError) {
          console.warn('Nie udało się również utworzyć powiadomienia w Firestore:', fallbackError);
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error('Błąd podczas aktualizacji statusu zamówienia:', error);
    throw error;
  }
};

/**
 * Pobiera zamówienia klienta
 */
export const getCustomerOrders = async (customerId) => {
  try {
    const ordersQuery = query(
      collection(db, ORDERS_COLLECTION),
      where('customer.id', '==', customerId),
      orderBy('orderDate', 'desc')
    );
    
    const querySnapshot = await getDocs(ordersQuery);
    
    const orders = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      
      // Konwertuj daty z Timestamp na Date - sprawdzamy czy data jest obiektem Timestamp
      const orderWithDates = {
        id: doc.id,
        ...data,
        orderDate: data.orderDate && typeof data.orderDate.toDate === 'function' ? data.orderDate.toDate() : data.orderDate,
        expectedDeliveryDate: data.expectedDeliveryDate && typeof data.expectedDeliveryDate.toDate === 'function' ? data.expectedDeliveryDate.toDate() : data.expectedDeliveryDate,
        deliveryDate: data.deliveryDate && typeof data.deliveryDate.toDate === 'function' ? data.deliveryDate.toDate() : data.deliveryDate,
        createdAt: data.createdAt && typeof data.createdAt.toDate === 'function' ? data.createdAt.toDate() : data.createdAt,
        updatedAt: data.updatedAt && typeof data.updatedAt.toDate === 'function' ? data.updatedAt.toDate() : data.updatedAt
      };
      
      orders.push(orderWithDates);
    });
    
    return orders;
  } catch (error) {
    console.error('Błąd podczas pobierania zamówień klienta:', error);
    throw error;
  }
};

/**
 * Pobiera statystyki zamówień
 */
export const getOrdersStats = async (forDashboard = false) => {
  try {
    // Sprawdź czy mamy dane w cache i czy są wciąż aktualne
    const now = Date.now();
    if (ordersStatsCache.data && ordersStatsCache.timestamp && (now - ordersStatsCache.timestamp < ordersStatsCache.ttl)) {
      console.log('Statystyki zamówień pobrane z cache (ważne przez', Math.round((ordersStatsCache.timestamp + ordersStatsCache.ttl - now) / 1000), 'sekund)');
      return ordersStatsCache.data;
    }
    
    // Jeśli zapytanie jest już w toku, poczekaj na jego zakończenie
    if (ordersStatsCache.fetchInProgress) {
      console.log('Zapytanie o statystyki zamówień już w toku, oczekuję na jego zakończenie...');
      
      // Czekaj maksymalnie 2 sekundy na zakończenie trwającego zapytania
      let waitTime = 0;
      const waitInterval = 100; // 100ms
      const maxWaitTime = 2000; // 2 sekundy
      
      while (ordersStatsCache.fetchInProgress && waitTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, waitInterval));
        waitTime += waitInterval;
      }
      
      // Jeśli dane są dostępne po oczekiwaniu, zwróć je
      if (ordersStatsCache.data && !ordersStatsCache.fetchInProgress) {
        console.log('Zapytanie o statystyki zamówień zostało zakończone przez inny proces, zwracam dane z cache');
        return ordersStatsCache.data;
      }
      
      // Jeśli nadal trwa zapytanie, zresetuj flagę (na wypadek błędu) i kontynuuj
      if (ordersStatsCache.fetchInProgress) {
        console.log('Przekroczono czas oczekiwania na zapytanie o statystyki zamówień, kontynuuję własne zapytanie');
        ordersStatsCache.fetchInProgress = false;
      }
    }
    
    // Ustaw flagę, że zapytanie jest w toku
    ordersStatsCache.fetchInProgress = true;
    
    try {
      const allOrders = await getAllOrders();
      
      // Podstawowe statystyki
      const stats = {
        total: allOrders.length,
        totalValue: 0,
        byStatus: {
          'Nowe': 0,
          'W realizacji': 0,
          'Gotowe do wysyłki': 0,
          'Wysłane': 0,
          'Dostarczone': 0,
          'Anulowane': 0
        },
        byMonth: {},
        recentOrders: []
      };
      
      // Przetwarzanie zamówień w celu obliczenia pełnych wartości
      for (const order of allOrders) {
        // Aktualizuj statystyki
        if (order.status) {
          if (stats.byStatus[order.status] !== undefined) {
            stats.byStatus[order.status]++;
          }
        }
        
        // Aktualizacja całkowitej wartości - używamy tylko wartości CO z bazy danych
        const orderValue = parseFloat(order.totalValue || 0);
        stats.totalValue += orderValue;
        
        // Aktualizacja statystyk miesięcznych
        const date = order.orderDate ? new Date(order.orderDate) : new Date();
        const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        
        if (!stats.byMonth[monthKey]) {
          stats.byMonth[monthKey] = {
            count: 0,
            value: 0,
            month: date.getMonth() + 1,
            year: date.getFullYear()
          };
        }
        
        stats.byMonth[monthKey].count++;
        stats.byMonth[monthKey].value += orderValue;
      }
      
      // Sortuj zamówienia według daty (najnowsze pierwsze)
      allOrders.sort((a, b) => {
        const dateA = a.orderDate ? new Date(a.orderDate) : new Date(0);
        const dateB = b.orderDate ? new Date(b.orderDate) : new Date(0);
        return dateB - dateA;
      });
      
      // Listy ostatnich zamówień
      stats.recentOrders = allOrders.slice(0, 10).map(order => ({
        id: order.id,
        orderNumber: order.orderNumber,
        date: order.orderDate,
        status: order.status,
        value: order.value || 0,
        totalValue: parseFloat(order.totalValue || 0)
      }));
      
      console.log('Statystyki zamówień zostały obliczone', stats);
      
      // Zapisz dane do cache
      ordersStatsCache.data = stats;
      ordersStatsCache.timestamp = now;
      ordersStatsCache.fetchInProgress = false;
      
      return stats;
    } catch (error) {
      // Zresetuj flagę w przypadku błędu
      ordersStatsCache.fetchInProgress = false;
      throw error;
    }
  } catch (error) {
    console.error('Błąd podczas pobierania statystyk zamówień:', error);
    // Upewnij się, że flaga jest zresetowana nawet w przypadku błędu
    ordersStatsCache.fetchInProgress = false;
    throw error;
  }
};

/**
 * Waliduje dane zamówienia
 */
const validateOrderData = (orderData) => {
  if (!orderData.customer || !orderData.customer.name) {
    throw new Error('Dane klienta są wymagane');
  }
  
  if (!orderData.items || !Array.isArray(orderData.items) || orderData.items.length === 0) {
    throw new Error('Zamówienie musi zawierać co najmniej jeden produkt');
  }
  
  // Sprawdź każdą pozycję zamówienia
  orderData.items.forEach((item, index) => {
    if (!item.name) {
      throw new Error(`Pozycja #${index + 1} musi zawierać nazwę produktu`);
    }
    
    if (item.quantity <= 0) {
      throw new Error(`Pozycja #${index + 1} musi mieć dodatnią ilość`);
    }
    
    if (item.price < 0) {
      throw new Error(`Pozycja #${index + 1} musi mieć poprawną cenę`);
    }
  });
  
  if (!orderData.orderDate) {
    throw new Error('Data zamówienia jest wymagana');
  }
};

/**
 * Oblicza łączną wartość zamówienia
 */
export const calculateOrderTotal = (items, shippingCost = 0, additionalCostsItems = []) => {
  if (!items || !Array.isArray(items)) {
    return 0;
  }
  
  // Obliczamy wartość produktów
  const itemsTotal = items.reduce((sum, item) => {
    const price = parseFloat(item.price) || 0;
    const quantity = parseFloat(item.quantity) || 0;
    const itemValue = price * quantity;
    
    // Jeśli produkt nie jest z listy cenowej LUB ma cenę 0, i ma koszt produkcji, dodajemy go do wartości
    if ((item.fromPriceList !== true || parseFloat(item.price || 0) === 0) && item.productionTaskId && item.productionCost !== undefined) {
      const productionCost = parseFloat(item.productionCost || 0);
      return sum + itemValue + productionCost;
    }
    
    // W przeciwnym razie tylko standardowa wartość
    return sum + itemValue;
  }, 0);
  
  // Dodajemy koszt dostawy
  const totalWithShipping = itemsTotal + parseFloat(shippingCost || 0);
  
  // Jeśli nie ma dodatkowych kosztów, zwracamy wartość produktów + dostawa
  if (!additionalCostsItems || !Array.isArray(additionalCostsItems) || additionalCostsItems.length === 0) {
    return totalWithShipping;
  }
  
  // Obliczamy dodatkowe koszty (tylko wartości dodatnie)
  const additionalCosts = additionalCostsItems.reduce((sum, cost) => {
    const value = parseFloat(cost.value) || 0;
    return sum + (value > 0 ? value : 0);
  }, 0);
  
  // Obliczamy rabaty (tylko wartości ujemne, przekształcone na wartości dodatnie)
  const discounts = Math.abs(additionalCostsItems.reduce((sum, cost) => {
    const value = parseFloat(cost.value) || 0;
    return sum + (value < 0 ? value : 0);
  }, 0));
  
  // Zwracamy łączną wartość
  return totalWithShipping + additionalCosts - discounts;
};

/**
 * Stałe dla statusów zamówień
 */
export const ORDER_STATUSES = [
  { value: 'Nowe', label: 'Nowe' },
  { value: 'W realizacji', label: 'W realizacji' },
  { value: 'Gotowe do wysyłki', label: 'Gotowe do wysyłki' },
  { value: 'Wysłane', label: 'Wysłane' },
  { value: 'Dostarczone', label: 'Dostarczone' },
  { value: 'Anulowane', label: 'Anulowane' }
];

/**
 * Stałe dla metod płatności
 */
export const PAYMENT_METHODS = [
  { value: 'Przelew', label: 'Przelew bankowy' },
  { value: 'Gotówka', label: 'Gotówka' },
  { value: 'Karta', label: 'Karta płatnicza' },
  { value: 'Za pobraniem', label: 'Za pobraniem' }
];

/**
 * Domyślne dane nowego zamówienia
 */
export const DEFAULT_ORDER = {
  customer: {
    id: '',
    name: '',
    email: '',
    phone: '',
    address: '',
    shippingAddress: '',
    orderAffix: ''
  },
  items: [
    {
      id: '',
      name: '',
      description: '',
      quantity: 1,
      unit: 'szt.',
      price: 0
    }
  ],
  productionTasks: [], // Lista powiązanych zadań produkcyjnych (MO)
  orderDate: formatDateForInput(new Date()),
  expectedDeliveryDate: '',
  deliveryDate: '',
  status: 'Nowe',
  paymentMethod: 'Przelew',
  paymentStatus: 'Nieopłacone',
  notes: '',
  shippingMethod: '',
  shippingCost: 0,
  deliveryProof: null,
  shippingAddress: '',
  additionalCostsItems: [] // Inicjalizacja pustej tablicy dla dodatkowych kosztów
};

// Dodaj nową funkcję do aktualizacji listy zadań produkcyjnych
export const addProductionTaskToOrder = async (orderId, taskData, orderItemId = null) => {
  try {
    console.log(`[DEBUG] Rozpoczęto addProductionTaskToOrder - orderId: ${orderId}, taskId: ${taskData.id}, orderItemId: ${orderItemId}`);
    console.log(`[DEBUG] Pełne dane taskData:`, JSON.stringify(taskData, null, 2));
    
    const orderRef = doc(db, ORDERS_COLLECTION, orderId);
    const orderDoc = await getDoc(orderRef);
    
    if (!orderDoc.exists()) {
      console.error(`[ERROR] Zamówienie o ID ${orderId} nie istnieje!`);
      throw new Error('Zamówienie nie istnieje');
    }
    
    const order = orderDoc.data();
    console.log(`[DEBUG] Pobrano zamówienie: ${order.orderNumber || orderId}`);
    const productionTasks = order.productionTasks || [];
    console.log(`[DEBUG] Aktualna lista zadań w zamówieniu:`, JSON.stringify(productionTasks, null, 2));
    
    // Sprawdź, czy zadanie z tym ID już istnieje w tablicy
    const existingTaskIndex = productionTasks.findIndex(task => task.id === taskData.id);
    console.log(`[DEBUG] Czy zadanie już istnieje w zamówieniu: ${existingTaskIndex !== -1}`);
    
    // Zachowaj istniejący orderItemId, jeśli nie podano nowego
    if (!orderItemId && existingTaskIndex !== -1 && productionTasks[existingTaskIndex].orderItemId) {
      orderItemId = productionTasks[existingTaskIndex].orderItemId;
      console.log(`[DEBUG] Używam istniejącego orderItemId z zamówienia: ${orderItemId}`);
    }
    
    // Przygotuj nowe zadanie z orderItemId
    const newTaskData = {
      id: taskData.id,
      moNumber: taskData.moNumber,
      name: taskData.name,
      status: taskData.status,
      createdAt: new Date().toISOString(), // Używamy zwykłej daty zamiast serverTimestamp
      productName: taskData.productName,
      quantity: taskData.quantity,
      unit: taskData.unit,
      orderItemId: orderItemId // Dodaj identyfikator pozycji zamówienia
    };
    console.log(`[DEBUG] Przygotowane dane zadania do dodania:`, JSON.stringify(newTaskData, null, 2));
    
    // Jeśli zadanie już istnieje, zaktualizuj dane, w przeciwnym razie dodaj nowe
    if (existingTaskIndex !== -1) {
      productionTasks[existingTaskIndex] = newTaskData;
      console.log(`[DEBUG] Zaktualizowano zadanie ${taskData.id} w zamówieniu ${orderId} z orderItemId: ${newTaskData.orderItemId}`);
    } else {
      // Dodaj nowe zadanie do listy
      productionTasks.push(newTaskData);
      console.log(`[DEBUG] Dodano zadanie ${taskData.id} do zamówienia ${orderId} z orderItemId: ${orderItemId}`);
    }
    
    // Zawsze aktualizuj zadanie produkcyjne w bazie danych, niezależnie od tego czy orderItemId było podane
    const taskRef = doc(db, 'productionTasks', taskData.id);
    
    try {
      // Pobierz aktualne dane zadania, aby zachować pozostałe pola
      const taskDocSnap = await getDoc(taskRef);
      if (taskDocSnap.exists()) {
        const currentTaskData = taskDocSnap.data();
        console.log(`[DEBUG] Pobrano aktualne dane zadania z bazy:`, JSON.stringify({
          id: taskData.id,
          moNumber: currentTaskData.moNumber,
          orderItemId: currentTaskData.orderItemId,
          orderId: currentTaskData.orderId,
          orderNumber: currentTaskData.orderNumber
        }, null, 2));
        
        // Nie nadpisuj orderItemId, jeśli już istnieje w zadaniu produkcyjnym, chyba że podano nowy
        const finalOrderItemId = orderItemId || currentTaskData.orderItemId || null;
        
        const updateFields = {
          orderItemId: finalOrderItemId,
          orderId: orderId, // Upewniamy się, że orderId również jest ustawione
          orderNumber: order.orderNumber, // Dodaj również numer zamówienia
          updatedAt: serverTimestamp()
        };
        console.log(`[DEBUG] Aktualizacja zadania w bazie, pola:`, JSON.stringify(updateFields, null, 2));
        
        await updateDoc(taskRef, updateFields);
        
        console.log(`[DEBUG] Zaktualizowano zadanie produkcyjne ${taskData.id} z orderItemId: ${finalOrderItemId}`);
      } else {
        console.warn(`[WARN] Nie znaleziono zadania produkcyjnego ${taskData.id} w bazie danych`);
      }
    } catch (error) {
      console.error(`[ERROR] Błąd podczas aktualizacji zadania ${taskData.id}:`, error);
      // Kontynuuj mimo błędu - ważniejsze jest zaktualizowanie zamówienia
    }
    
    // Zaktualizuj zamówienie
    console.log(`[DEBUG] Zapisuję listę zadań w zamówieniu. Liczba zadań: ${productionTasks.length}`);
    await updateDoc(orderRef, {
      productionTasks,
      updatedAt: serverTimestamp()
    });
    console.log(`[DEBUG] Zakończono pomyślnie addProductionTaskToOrder dla zadania ${taskData.id} w zamówieniu ${orderId}`);
    
    return true;
  } catch (error) {
    console.error(`[ERROR] Krytyczny błąd w addProductionTaskToOrder:`, error);
    throw error;
  }
};

// Dodaj nową funkcję do usuwania zadania produkcyjnego z zamówienia
export const removeProductionTaskFromOrder = async (orderId, taskId) => {
  try {
    const orderRef = doc(db, ORDERS_COLLECTION, orderId);
    const orderDoc = await getDoc(orderRef);
    
    if (!orderDoc.exists()) {
      throw new Error('Zamówienie nie istnieje');
    }
    
    const order = orderDoc.data();
    const productionTasks = order.productionTasks || [];
    
    // Zapisz informację o orderItemId przed usunięciem zadania
    let removedTask = productionTasks.find(task => task.id === taskId);
    let orderItemId = removedTask ? removedTask.orderItemId : null;
    
    // Filtrujemy listę zadań, usuwając to z podanym ID
    const updatedTasks = productionTasks.filter(task => task.id !== taskId);
    
    // Jeśli nie znaleziono zadania, zwróć false
    if (updatedTasks.length === productionTasks.length) {
      console.warn(`Zadanie produkcyjne o ID ${taskId} nie zostało znalezione w zamówieniu ${orderId}`);
      return false;
    }
    
    // Zaktualizuj zamówienie
    await updateDoc(orderRef, {
      productionTasks: updatedTasks,
      updatedAt: serverTimestamp()
    });
    
    // Wyczyść powiązanie w zadaniu produkcyjnym, jeśli istnieje
    try {
      const taskRef = doc(db, 'productionTasks', taskId);
      const taskDoc = await getDoc(taskRef);
      
      if (taskDoc.exists()) {
        // Zaktualizuj zadanie produkcyjne - usuń powiązanie z zamówieniem
        await updateDoc(taskRef, {
          orderId: null,
          orderNumber: null,
          orderItemId: null,
          updatedAt: serverTimestamp()
        });
        console.log(`Usunięto powiązanie z zamówieniem w zadaniu produkcyjnym ${taskId}`);
      }
    } catch (taskError) {
      console.error(`Błąd podczas aktualizacji zadania produkcyjnego ${taskId}:`, taskError);
      // Nie przerywamy głównej operacji, nawet jeśli aktualizacja zadania się nie powiedzie
    }
    
    console.log(`Zadanie produkcyjne ${taskId} zostało usunięte z zamówienia ${orderId}`);
    return true;
  } catch (error) {
    console.error('Błąd podczas usuwania zadania produkcyjnego z zamówienia:', error);
    throw error;
  }
};

// Funkcja do aktualizacji informacji o zadaniu produkcyjnym w zamówieniu
export const updateProductionTaskInOrder = async (orderId, taskId, updateData, userId) => {
  try {
    // Pobierz aktualne dane zamówienia
    const orderRef = doc(db, ORDERS_COLLECTION, orderId);
    const orderDoc = await getDoc(orderRef);
    
    if (!orderDoc.exists()) {
      throw new Error('Zamówienie nie istnieje');
    }
    
    const orderData = orderDoc.data();
    
    // Pobierz listę zadań produkcyjnych z zamówienia
    const productionTasks = orderData.productionTasks || [];
    
    // Znajdź indeks zadania w tablicy zadań produkcyjnych
    const taskIndex = productionTasks.findIndex(task => task.id === taskId);
    
    if (taskIndex === -1) {
      throw new Error(`Zadanie o ID ${taskId} nie zostało znalezione w zamówieniu`);
    }
    
    // Zachowaj orderItemId jeśli istnieje, a nie jest podany w updateData
    if (!updateData.orderItemId && productionTasks[taskIndex].orderItemId) {
      updateData.orderItemId = productionTasks[taskIndex].orderItemId;
    }
    
    // Zaktualizuj informacje o zadaniu, zachowując istniejące dane
    productionTasks[taskIndex] = {
      ...productionTasks[taskIndex],
      ...updateData,
      updatedAt: new Date().toISOString()
    };
    
    // Zaktualizuj zamówienie
    await updateDoc(orderRef, {
      productionTasks,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    });
    
    // Zaktualizuj również zadanie produkcyjne w bazie danych z orderItemId
    try {
      const taskRef = doc(db, 'productionTasks', taskId);
      const taskDoc = await getDoc(taskRef);
      
      if (taskDoc.exists()) {
        // Aktualizuj tylko podstawowe pola związane z zamówieniem
        await updateDoc(taskRef, {
          orderItemId: updateData.orderItemId || productionTasks[taskIndex].orderItemId || null,
          orderId: orderId,
          orderNumber: orderData.orderNumber || null,
          updatedAt: serverTimestamp(),
          updatedBy: userId
        });
        
        console.log(`Zaktualizowano powiązanie z zamówieniem w zadaniu produkcyjnym ${taskId}`);
      } else {
        console.warn(`Nie znaleziono zadania produkcyjnego ${taskId} w bazie danych`);
      }
    } catch (error) {
      console.error(`Błąd podczas aktualizacji zadania ${taskId}:`, error);
      // Kontynuuj mimo błędu - ważniejsze jest zaktualizowanie zamówienia
    }
    
    return {
      success: true,
      message: 'Zadanie produkcyjne zaktualizowane w zamówieniu'
    };
  } catch (error) {
    console.error('Błąd podczas aktualizacji zadania produkcyjnego w zamówieniu:', error);
    throw error;
  }
};

/**
 * Wyszukuje zamówienia po numerze
 * @param {string} orderNumber - Fragment numeru zamówienia do wyszukania
 * @param {boolean} onlyCustomerOrders - Czy wyszukiwać tylko zamówienia klienta (nie zamówienia zakupu)
 */
export const searchOrdersByNumber = async (orderNumber, onlyCustomerOrders = true) => {
  try {
    if (!orderNumber) {
      return [];
    }
    
    // Pobierz wszystkie zamówienia
    // Nie możemy filtrować bezpośrednio po numerze zamówienia w zapytaniu, bo Firestore nie obsługuje pełnotekstowego wyszukiwania
    const ordersQuery = query(
      collection(db, ORDERS_COLLECTION),
      orderBy('orderDate', 'desc')
    );
    
    const querySnapshot = await getDocs(ordersQuery);
    
    const orders = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      
      // Sprawdź, czy numer zamówienia zawiera szukany fragment
      if (data.orderNumber && data.orderNumber.toLowerCase().includes(orderNumber.toLowerCase())) {
        // Jeśli szukamy tylko zamówień klienta, filtrujemy zamówienia zakupu
        if (onlyCustomerOrders && data.type === 'purchase') {
          return;
        }
        
        // Konwertuj daty z Timestamp na Date
        const orderWithDates = {
          id: doc.id,
          ...data,
          orderDate: data.orderDate && typeof data.orderDate.toDate === 'function' ? data.orderDate.toDate() : data.orderDate,
          expectedDeliveryDate: data.expectedDeliveryDate && typeof data.expectedDeliveryDate.toDate === 'function' ? data.expectedDeliveryDate.toDate() : data.expectedDeliveryDate,
          deliveryDate: data.deliveryDate && typeof data.deliveryDate.toDate === 'function' ? data.deliveryDate.toDate() : data.deliveryDate,
          createdAt: data.createdAt && typeof data.createdAt.toDate === 'function' ? data.createdAt.toDate() : data.createdAt,
          updatedAt: data.updatedAt && typeof data.updatedAt.toDate === 'function' ? data.updatedAt.toDate() : data.updatedAt
        };
        
        orders.push(orderWithDates);
      }
    });
    
    return orders;
  } catch (error) {
    console.error('Błąd podczas wyszukiwania zamówień:', error);
    throw error;
  }
};

/**
 * Pobiera informacje o ostatnim użyciu receptury w zamówieniach
 * @param {string} recipeId - ID receptury
 * @returns {Promise<Object|null>} - Informacje o ostatnim użyciu receptury (zamówienie, koszt, data) lub null
 */
export const getLastRecipeUsageInfo = async (recipeId) => {
  if (!recipeId) return null;
  
  try {
    // Pobierz wszystkie zamówienia
    const ordersRef = collection(db, ORDERS_COLLECTION);
    const q = query(ordersRef, orderBy('orderDate', 'desc'));
    const querySnapshot = await getDocs(q);
    
    // Przeszukaj wszystkie zamówienia w poszukiwaniu danej receptury
    let lastUsageInfo = null;
    
    for (const doc of querySnapshot.docs) {
      const order = {
        id: doc.id,
        ...doc.data()
      };
      
      // Pominięcie gdy zamówienie nie ma pozycji lub jest anulowane
      if (!order.items || !Array.isArray(order.items) || order.status === 'Anulowane') {
        continue;
      }
      
      // Szukaj pozycji z podaną recepturą
      const recipeItem = order.items.find(item => 
        item.recipeId === recipeId && 
        (item.isRecipe === true || item.itemType === 'recipe')
      );
      
      if (recipeItem) {
        // Znaleziono pozycję z daną recepturą
        const orderDate = order.orderDate instanceof Date 
          ? order.orderDate 
          : order.orderDate?.toDate ? order.orderDate.toDate() : new Date(order.orderDate);
        
        lastUsageInfo = {
          orderId: order.id,
          orderNumber: order.orderNumber,
          orderDate: orderDate,
          customerName: order.customer?.name || 'Nieznany',
          quantity: recipeItem.quantity,
          price: recipeItem.price,
          cost: recipeItem.basePrice || recipeItem.productionCost || 0,
          unit: recipeItem.unit || 'szt.',
          totalValue: (recipeItem.quantity * recipeItem.price) || 0
        };
        
        // Znaleziono - przerywamy pętlę
        break;
      }
    }
    
    return lastUsageInfo;
  } catch (error) {
    console.error('Błąd podczas pobierania informacji o ostatnim użyciu receptury:', error);
    return null;
  }
};

/**
 * Migruje istniejące dane CMR do nowego formatu z historią
 */
export const migrateCmrHistoryData = async () => {
  try {
    console.log('Rozpoczęcie migracji danych CMR do nowego formatu...');
    
    const ordersQuery = query(
      collection(db, ORDERS_COLLECTION),
      orderBy('orderDate', 'desc')
    );
    
    const querySnapshot = await getDocs(ordersQuery);
    let migratedCount = 0;
    
    for (const orderDoc of querySnapshot.docs) {
      const orderData = orderDoc.data();
      const items = orderData.items || [];
      let needsUpdate = false;
      
      const updatedItems = items.map(item => {
        // Jeśli pozycja ma lastCmrNumber ale nie ma cmrHistory, migruj dane
        if (item.lastCmrNumber && !item.cmrHistory) {
          needsUpdate = true;
          
          const cmrEntry = {
            cmrNumber: item.lastCmrNumber,
            quantity: item.shippedQuantity || 0,
            shipmentDate: item.lastShipmentDate || new Date().toISOString(),
            unit: item.unit || 'szt.'
          };
          
          return {
            ...item,
            cmrHistory: [cmrEntry]
          };
        }
        
        return item;
      });
      
      if (needsUpdate) {
        await updateDoc(doc(db, ORDERS_COLLECTION, orderDoc.id), {
          items: updatedItems,
          updatedAt: serverTimestamp()
        });
        
        migratedCount++;
        console.log(`Zmigrowano zamówienie ${orderData.orderNumber || orderDoc.id}`);
      }
    }
    
    console.log(`Migracja zakończona. Zmigrowano ${migratedCount} zamówień.`);
    return { success: true, migratedCount };
  } catch (error) {
    console.error('Błąd podczas migracji danych CMR:', error);
    throw error;
  }
};

/**
 * Pobiera zamówienia klienta z paginacją
 * @param {number} page - Numer strony (numeracja od 1)
 * @param {number} limit - Liczba elementów na stronę
 * @param {string} sortField - Pole, po którym sortujemy
 * @param {string} sortOrder - Kierunek sortowania (asc/desc)
 * @param {Object} filters - Filtry: status, customerId, fromDate, toDate, searchTerm
 * @returns {Object} - Obiekt zawierający dane i metadane paginacji
 */
export const getOrdersWithPagination = async (page = 1, limit = 10, sortField = 'orderDate', sortOrder = 'desc', filters = {}) => {
  try {
    // Ustaw realne wartości dla page i limit
    const pageNum = Math.max(1, page);
    const itemsPerPage = Math.max(1, limit);
    
    // Warunki filtrowania
    const conditions = [];
    
    // Filtruj po statusie
    if (filters.status && filters.status !== 'all') {
      conditions.push(where('status', '==', filters.status));
    }
    
    // Filtruj po kliencie
    if (filters.customerId) {
      conditions.push(where('customer.id', '==', filters.customerId));
    }
    
    // Filtruj po dacie od
    if (filters.fromDate) {
      const fromTimestamp = Timestamp.fromDate(new Date(filters.fromDate));
      conditions.push(where('orderDate', '>=', fromTimestamp));
    }
    
    // Filtruj po dacie do
    if (filters.toDate) {
      const toTimestamp = Timestamp.fromDate(new Date(filters.toDate));
      conditions.push(where('orderDate', '<=', toTimestamp));
    }
    
    // Utwórz zapytanie bazowe
    let ordersQuery;
    
    // Gdy mamy warunki filtrowania
    if (conditions.length > 0) {
      // UWAGA: sortField musi być takie samo jak pole użyte w where() dla poprawnego działania zapytania Firestore
      // W przypadku filtrowania po orderDate, musimy sortować również po orderDate
      if (conditions.some(cond => cond._field?.fieldPath === 'orderDate')) {
        ordersQuery = query(
          collection(db, ORDERS_COLLECTION),
          ...conditions,
          orderBy('orderDate', sortOrder.toLowerCase())
        );
      } else {
        // W pozostałych przypadkach sortuj po wybranym polu
        ordersQuery = query(
          collection(db, ORDERS_COLLECTION),
          ...conditions,
          orderBy(sortField, sortOrder.toLowerCase())
        );
      }
    } else {
      // Gdy nie ma filtrów, sortuj według wybranego pola
      ordersQuery = query(
        collection(db, ORDERS_COLLECTION),
        orderBy(sortField, sortOrder.toLowerCase())
      );
    }
    
    // Pobierz wszystkie dokumenty spełniające kryteria, aby potem możliwa była lokalna paginacja
    // To podejście jest odpowiednie dla małych/średnich zbiorów danych
    // Dla dużych zbiorów lepiej użyć startAfter/limit w Firebase
    const querySnapshot = await getDocs(ordersQuery);
    
    let orders = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Zbierz wszystkie ID klientów
    const customerIds = new Set();
    orders.forEach(order => {
      if (order.customerId && !order.customer) {
        customerIds.add(order.customerId);
      }
    });
    
    // Pobierz klientów jednym zapytaniem, z uwzględnieniem limitu 10 elementów per zapytanie
    const customersMap = {};
    if (customerIds.size > 0) {
      const customerIdsArray = Array.from(customerIds);
      
      // Pobierz klientów w grupach po 10 (limit Firestore dla operatora 'in')
      const batchSize = 10;
      for (let i = 0; i < customerIdsArray.length; i += batchSize) {
        const batch = customerIdsArray.slice(i, i + batchSize);
        const customersQuery = query(
          collection(db, CUSTOMERS_COLLECTION),
          where('__name__', 'in', batch)
        );
        
        const customersSnapshot = await getDocs(customersQuery);
        customersSnapshot.forEach(doc => {
          customersMap[doc.id] = { id: doc.id, ...doc.data() };
        });
      }
    }
    
    // Przypisz dane klientów do zamówień
    orders = orders.map(order => {
      if (order.customerId && !order.customer && customersMap[order.customerId]) {
        return {
          ...order,
          customer: customersMap[order.customerId]
        };
      }
      return order;
    });
    
    // Filtrowanie po searchTerm - wykonujemy lokalnie, ponieważ Firestore nie obsługuje wyszukiwania tekstowego
    if (filters.searchTerm) {
      const searchLower = filters.searchTerm.toLowerCase();
      orders = orders.filter(order => 
        (order.orderNumber && order.orderNumber.toLowerCase().includes(searchLower)) ||
        (order.customer?.name && order.customer.name.toLowerCase().includes(searchLower)) ||
        (order.items && order.items.some(item => item.name && item.name.toLowerCase().includes(searchLower)))
      );
    }
    
    // Oblicz całkowitą liczbę elementów po filtrowaniu
    const totalItems = orders.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    
    // Przeprowadź paginację
    const startIndex = (pageNum - 1) * itemsPerPage;
    const paginatedData = orders.slice(startIndex, startIndex + itemsPerPage);
    
    return {
      data: paginatedData,
      pagination: {
        page: pageNum,
        limit: itemsPerPage,
        totalItems,
        totalPages
      }
    };
  } catch (error) {
    console.error('Błąd podczas pobierania zamówień z paginacją:', error);
    throw error;
  }
};

/**
 * Odświeża ilości wysłane w zamówieniu na podstawie wszystkich powiązanych CMR
 */
export const refreshShippedQuantitiesFromCMR = async (orderId, userId = 'system') => {
  try {
    console.log(`Rozpoczęcie odświeżania ilości wysłanych dla zamówienia ${orderId}...`);
    
    // Pobierz aktualne dane zamówienia
    const orderRef = doc(db, ORDERS_COLLECTION, orderId);
    const orderDoc = await getDoc(orderRef);
    
    if (!orderDoc.exists()) {
      throw new Error('Zamówienie nie istnieje');
    }
    
    const orderData = orderDoc.data();
    const items = orderData.items || [];
    
    console.log(`Zamówienie ma ${items.length} pozycji:`, items.map(item => ({ name: item.name, quantity: item.quantity })));
    
    // Pobierz wszystkie CMR powiązane z tym zamówieniem
    const { getCmrDocumentsByOrderId, findCmrDocumentsByOrderNumber } = await import('./cmrService');
    let linkedCMRs = await getCmrDocumentsByOrderId(orderId);
    
    console.log(`Znaleziono ${linkedCMRs.length} powiązanych CMR dla zamówienia ${orderId}:`, 
      linkedCMRs.map(cmr => ({ 
        cmrNumber: cmr.cmrNumber, 
        status: cmr.status, 
        itemsCount: cmr.items?.length || 0,
        linkedOrderId: cmr.linkedOrderId,
        linkedOrderIds: cmr.linkedOrderIds
      }))
    );
    
    // Jeśli nie znaleziono CMR przez ID, spróbuj wyszukać przez numer zamówienia
    if (linkedCMRs.length === 0 && orderData.orderNumber) {
      console.log(`Próba wyszukania CMR przez numer zamówienia: ${orderData.orderNumber}`);
      const cmrsByOrderNumber = await findCmrDocumentsByOrderNumber(orderData.orderNumber);
      
      if (cmrsByOrderNumber.length > 0) {
        console.log(`✅ Znaleziono ${cmrsByOrderNumber.length} CMR przez numer zamówienia`);
        linkedCMRs = cmrsByOrderNumber;
      }
    }
    
    // Jeśli nie znaleziono CMR, zachowaj istniejące dane
    if (linkedCMRs.length === 0) {
      console.log('Brak powiązanych CMR - zachowuję istniejące dane');
      return { 
        success: true, 
        updatedItems: items,
        stats: {
          processedCMRs: 0,
          shippedItems: items.filter(item => parseFloat(item.shippedQuantity || 0) > 0).length,
          cmrReferences: 0
        }
      };
    }
    
    // Resetuj wszystkie ilości wysłane i historie CMR
    const resetItems = items.map(item => ({
      ...item,
      shippedQuantity: 0,
      lastShipmentDate: null,
      lastCmrNumber: null,
      cmrHistory: []
    }));
    
    // Oblicz ponownie ilości wysłane na podstawie wszystkich CMR
    let updatedItems = [...resetItems];
    let processedCMRs = 0;
    
    // Najpierw zbierz wszystkie dane z CMR dla każdej pozycji
    const itemCmrData = new Map(); // key: orderItemIndex, value: array of CMR entries
    
    // Funkcja pomocnicza do obliczania podobieństwa stringów (Levenshtein distance)
    const calculateStringSimilarity = (str1, str2) => {
      if (!str1 || !str2) return 0;
      
      const s1 = str1.toLowerCase().trim();
      const s2 = str2.toLowerCase().trim();
      
      if (s1 === s2) return 1;
      
      const longer = s1.length > s2.length ? s1 : s2;
      const shorter = s1.length > s2.length ? s2 : s1;
      
      if (longer.length === 0) return 1;
      
      const editDistance = levenshteinDistance(longer, shorter);
      return (longer.length - editDistance) / longer.length;
    };
    
    // Funkcja do obliczania odległości Levenshtein
    const levenshteinDistance = (str1, str2) => {
      const matrix = [];
      for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
      }
      for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
      }
      for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
          if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
            matrix[i][j] = matrix[i - 1][j - 1];
          } else {
            matrix[i][j] = Math.min(
              matrix[i - 1][j - 1] + 1,
              matrix[i][j - 1] + 1,
              matrix[i - 1][j] + 1
            );
          }
        }
      }
      return matrix[str2.length][str1.length];
    };
    
    for (const cmr of linkedCMRs) {
      console.log(`Sprawdzanie CMR ${cmr.cmrNumber} (status: ${cmr.status})...`);
      
      // Przetwarzaj tylko CMR w statusie "W transporcie", "Dostarczone" lub "Zakończony"
      if (cmr.status === 'W transporcie' || cmr.status === 'Dostarczone' || cmr.status === 'Zakończony') {
        console.log(`Przetwarzanie CMR ${cmr.cmrNumber} z ${cmr.items?.length || 0} pozycjami...`);
        processedCMRs++;
        
        if (cmr.items && cmr.items.length > 0) {
          for (let i = 0; i < cmr.items.length; i++) {
            const cmrItem = cmr.items[i];
            const quantity = parseFloat(cmrItem.quantity) || parseFloat(cmrItem.numberOfPackages) || 0;
            
            console.log(`CMR pozycja ${i}: "${cmrItem.description}", ilość: ${quantity}`);
            
            if (quantity <= 0) {
              console.log(`Pomijam pozycję z zerową ilością`);
              continue;
            }
            
            // Ulepszone dopasowanie pozycji w zamówieniu
            let orderItemIndex = -1;
            
            // Funkcja pomocnicza do normalizacji nazw produktów
            const normalizeProductName = (name) => {
              if (!name) return '';
              return name
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]/g, '') // usuń wszystkie znaki niealfanumeryczne
                .replace(/omega3/g, 'omega')
                .replace(/omegacaps/g, 'omega')
                .replace(/caps$/g, ''); // usuń "caps" na końcu
            };
            
            const normalizedCmrName = normalizeProductName(cmrItem.description);
            
            // 1. Dokładne dopasowanie nazwy
            orderItemIndex = updatedItems.findIndex(orderItem => 
              orderItem.name && cmrItem.description && 
              orderItem.name.trim().toLowerCase() === cmrItem.description.trim().toLowerCase()
            );
            
            // 2. Jeśli nie znaleziono, spróbuj dopasowania przez ID
            if (orderItemIndex === -1 && cmrItem.itemId) {
              orderItemIndex = updatedItems.findIndex(orderItem => orderItem.id === cmrItem.itemId);
            }
            
            // 3. Dopasowanie przez znormalizowane nazwy
            if (orderItemIndex === -1 && normalizedCmrName) {
              orderItemIndex = updatedItems.findIndex(orderItem => {
                const normalizedOrderName = normalizeProductName(orderItem.name);
                return normalizedOrderName === normalizedCmrName;
              });
            }
            
            // 4. Częściowe dopasowanie nazwy
            if (orderItemIndex === -1) {
              orderItemIndex = updatedItems.findIndex(orderItem => {
                if (!orderItem.name || !cmrItem.description) return false;
                const orderName = orderItem.name.trim().toLowerCase();
                const cmrDesc = cmrItem.description.trim().toLowerCase();
                return orderName.includes(cmrDesc) || cmrDesc.includes(orderName);
              });
            }
            
            // 5. Specjalne dopasowanie dla produktów OMEGA
            if (orderItemIndex === -1 && cmrItem.description && cmrItem.description.toLowerCase().includes('omega')) {
              orderItemIndex = updatedItems.findIndex(orderItem => 
                orderItem.name && orderItem.name.toLowerCase().includes('omega')
              );
            }
            
            // 6. Ostatnia próba - dopasowanie według indeksu (tylko jeśli liczba pozycji się zgadza)
            if (orderItemIndex === -1 && updatedItems.length === cmr.items.length && i < updatedItems.length) {
              console.log(`Próba dopasowania według indeksu ${i}`);
              orderItemIndex = i;
            }
            
            console.log(`Dopasowanie dla "${cmrItem.description}": indeks ${orderItemIndex}`);
            
            // Dodatkowe debugowanie w przypadku braku dopasowania
            if (orderItemIndex === -1) {
              console.log(`🔍 Szczegółowa analiza dopasowania dla "${cmrItem.description}":`);
              console.log(`  Znormalizowana nazwa CMR: "${normalizedCmrName}"`);
              
              // Sprawdź podobieństwo z każdą pozycją zamówienia
              updatedItems.forEach((orderItem, idx) => {
                const normalizedOrderName = normalizeProductName(orderItem.name);
                const similarity = calculateStringSimilarity(cmrItem.description, orderItem.name);
                
                if (similarity > 0.7 || normalizedOrderName.includes(normalizedCmrName) || normalizedCmrName.includes(normalizedOrderName)) {
                  console.log(`  Możliwe dopasowanie ${idx}: "${orderItem.name}" (norm: "${normalizedOrderName}") - podobieństwo: ${similarity.toFixed(2)}`);
                }
              });
            }
            
            if (orderItemIndex !== -1) {
              // Zbierz dane CMR dla tej pozycji
              if (!itemCmrData.has(orderItemIndex)) {
                itemCmrData.set(orderItemIndex, []);
              }
              
              const cmrEntry = {
                cmrNumber: cmr.cmrNumber,
                quantity: quantity,
                shipmentDate: cmr.issueDate ? (cmr.issueDate.toISOString ? cmr.issueDate.toISOString() : cmr.issueDate) : new Date().toISOString(),
                unit: cmrItem.unit || updatedItems[orderItemIndex].unit || 'szt.'
              };
              
              itemCmrData.get(orderItemIndex).push(cmrEntry);
              console.log(`✅ Zapisano dane CMR ${cmr.cmrNumber} dla pozycji "${updatedItems[orderItemIndex].name}": ${quantity}`);
            } else {
              console.warn(`❌ Nie znaleziono odpowiadającej pozycji w zamówieniu dla "${cmrItem.description}" z CMR ${cmr.cmrNumber}`);
              console.log('Dostępne pozycje w zamówieniu:', updatedItems.map((item, idx) => `${idx}: "${item.name}"`));
            }
          }
        } else {
          console.log(`CMR ${cmr.cmrNumber} nie ma pozycji`);
        }
      } else {
        console.log(`Pomijam CMR ${cmr.cmrNumber} (status: ${cmr.status})`);
      }
    }
    
    // Teraz zaktualizuj pozycje zamówienia na podstawie zebranych danych
    itemCmrData.forEach((cmrEntries, orderItemIndex) => {
      const orderItem = updatedItems[orderItemIndex];
      
      // Usuń duplikaty CMR (jeśli ten sam CMR pojawia się wielokrotnie)
      const uniqueCmrEntries = cmrEntries.reduce((unique, entry) => {
        const existingIndex = unique.findIndex(e => e.cmrNumber === entry.cmrNumber);
        if (existingIndex === -1) {
          unique.push(entry);
        } else {
          // Jeśli CMR już istnieje, zachowaj większą ilość
          if (entry.quantity > unique[existingIndex].quantity) {
            unique[existingIndex] = entry;
          }
        }
        return unique;
      }, []);
      
      // Oblicz łączną ilość wysłaną
      const totalShippedQuantity = uniqueCmrEntries.reduce((total, entry) => total + entry.quantity, 0);
      
      // Znajdź najnowszą datę wysyłki i ostatni numer CMR
      const sortedEntries = uniqueCmrEntries.sort((a, b) => new Date(b.shipmentDate) - new Date(a.shipmentDate));
      const lastShipmentDate = sortedEntries[0]?.shipmentDate || new Date().toISOString();
      const lastCmrNumber = sortedEntries[0]?.cmrNumber || '';
      
      updatedItems[orderItemIndex] = {
        ...orderItem,
        shippedQuantity: totalShippedQuantity,
        lastShipmentDate: lastShipmentDate,
        lastCmrNumber: lastCmrNumber,
        cmrHistory: uniqueCmrEntries
      };
      
      console.log(`✅ Zaktualizowano pozycję "${orderItem.name}": łączna ilość wysłana = ${totalShippedQuantity} (z ${uniqueCmrEntries.length} CMR)`);
      uniqueCmrEntries.forEach(entry => {
        console.log(`  - CMR ${entry.cmrNumber}: ${entry.quantity} ${entry.unit}`);
      });
    });
    
    // Zapisz zaktualizowane dane do bazy
    await updateDoc(orderRef, {
      items: updatedItems,
      updatedBy: userId,
      updatedAt: serverTimestamp()
    });
    
    console.log(`✅ Odświeżono ilości wysłane dla zamówienia ${orderId}`);
    
    // Zwróć statystyki
    const totalShippedItems = updatedItems.filter(item => 
      parseFloat(item.shippedQuantity) > 0
    ).length;
    
    const totalCmrReferences = updatedItems.reduce((total, item) => 
      total + (item.cmrHistory ? item.cmrHistory.length : 0), 0
    );
    
    console.log(`Statystyki: ${totalShippedItems} pozycji wysłanych, ${totalCmrReferences} odniesień do CMR, przetworzono ${processedCMRs} CMR`);
    
    return { 
      success: true, 
      updatedItems,
      stats: {
        processedCMRs: processedCMRs,
        shippedItems: totalShippedItems,
        cmrReferences: totalCmrReferences
      }
    };
  } catch (error) {
    console.error('Błąd podczas odświeżania ilości wysłanych:', error);
    throw error;
  }
};

/**
 * Funkcja pomocnicza do debugowania powiązań CMR z zamówieniami
 */
export const debugOrderCMRConnections = async (orderId) => {
  try {
    console.log(`🔍 Debugowanie połączeń CMR dla zamówienia ${orderId}`);
    
    // Pobierz dane zamówienia
    const orderRef = doc(db, ORDERS_COLLECTION, orderId);
    const orderDoc = await getDoc(orderRef);
    
    if (!orderDoc.exists()) {
      console.log('❌ Zamówienie nie istnieje');
      return;
    }
    
    const orderData = orderDoc.data();
    console.log('📋 Dane zamówienia:', {
      orderNumber: orderData.orderNumber,
      itemsCount: orderData.items?.length || 0,
      items: orderData.items?.map(item => ({
        name: item.name,
        quantity: item.quantity,
        shippedQuantity: item.shippedQuantity || 0,
        cmrHistory: item.cmrHistory?.length || 0,
        lastCmrNumber: item.lastCmrNumber
      }))
    });
    
    // Sprawdź powiązane CMR
    const { getCmrDocumentsByOrderId } = await import('./cmrService');
    const linkedCMRs = await getCmrDocumentsByOrderId(orderId);
    
    console.log(`📦 Znalezione CMR (${linkedCMRs.length}):`);
    linkedCMRs.forEach((cmr, index) => {
      console.log(`  ${index + 1}. CMR ${cmr.cmrNumber}:`, {
        status: cmr.status,
        issueDate: cmr.issueDate,
        linkedOrderId: cmr.linkedOrderId,
        linkedOrderIds: cmr.linkedOrderIds,
        itemsCount: cmr.items?.length || 0,
        items: cmr.items?.map(item => ({
          description: item.description,
          quantity: item.quantity || item.numberOfPackages,
          unit: item.unit
        }))
      });
    });
    
    // Sprawdź dopasowania nazw
    if (linkedCMRs.length > 0 && orderData.items) {
      console.log('🔗 Analiza dopasowań nazw:');
      orderData.items.forEach((orderItem, orderIdx) => {
        console.log(`  Pozycja zamówienia ${orderIdx}: "${orderItem.name}"`);
        
        linkedCMRs.forEach(cmr => {
          if (cmr.items) {
            cmr.items.forEach((cmrItem, cmrIdx) => {
              const exactMatch = orderItem.name && cmrItem.description && 
                orderItem.name.trim().toLowerCase() === cmrItem.description.trim().toLowerCase();
              const partialMatch = orderItem.name && cmrItem.description && 
                (orderItem.name.toLowerCase().includes(cmrItem.description.toLowerCase()) ||
                 cmrItem.description.toLowerCase().includes(orderItem.name.toLowerCase()));
              
              if (exactMatch) {
                console.log(`    ✅ DOKŁADNE dopasowanie z CMR ${cmr.cmrNumber}[${cmrIdx}]: "${cmrItem.description}"`);
              } else if (partialMatch) {
                console.log(`    🔶 CZĘŚCIOWE dopasowanie z CMR ${cmr.cmrNumber}[${cmrIdx}]: "${cmrItem.description}"`);
              }
            });
          }
        });
      });
    }
    
  } catch (error) {
    console.error('❌ Błąd podczas debugowania:', error);
  }
};