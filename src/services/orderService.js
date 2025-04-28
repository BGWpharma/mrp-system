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

/**
 * Pobiera wszystkie zamówienia
 * Możliwość filtrowania po statusie
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
    
    const orders = [];
    querySnapshot.forEach((doc) => {
      orders.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return orders;
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
    
    // Konwertuj timestamp na obiekty Date
    const processedOrder = {
      id: orderDoc.id,
      ...orderData,
      orderDate: orderData.orderDate instanceof Timestamp ? orderData.orderDate.toDate() : new Date(orderData.orderDate),
      expectedDeliveryDate: orderData.expectedDeliveryDate instanceof Timestamp 
        ? orderData.expectedDeliveryDate.toDate() 
        : orderData.expectedDeliveryDate ? new Date(orderData.expectedDeliveryDate) : null,
      deadline: orderData.deadline instanceof Timestamp 
        ? orderData.deadline.toDate() 
        : orderData.deadline ? new Date(orderData.deadline) : null,
      deliveryDate: orderData.deliveryDate instanceof Timestamp 
        ? orderData.deliveryDate.toDate() 
        : orderData.deliveryDate ? new Date(orderData.deliveryDate) : null,
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
        
        // Jeśli produkt nie jest z listy cenowej i ma koszt produkcji, dodajemy go do wartości
        if (item.fromPriceList !== true && item.productionTaskId && item.productionCost !== undefined) {
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
    processedOrder.totalValue = totalProductsValue + shippingCost + additionalCostsTotal - discountsTotal;
    
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
    const orderNumber = await generateCONumber(customerAffix);
    
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
    
    return {
      id: docRef.id,
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
    
    return {
      id: docRef.id,
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
    // Walidacja danych zamówienia
    validateOrderData(orderData);
    
    // Używamy wartości totalValue przekazanej w danych - ona już zawiera wszystkie składniki
    // (produkty, koszty dostawy, dodatkowe koszty i rabaty)
    const totalValue = parseFloat(orderData.totalValue) || 0;
    
    const updatedOrder = {
      ...orderData,
      totalValue,
      updatedBy: userId,
      updatedAt: serverTimestamp(),
      // Konwersja dat na timestampy Firestore
      orderDate: Timestamp.fromDate(new Date(orderData.orderDate)),
      expectedDeliveryDate: orderData.expectedDeliveryDate 
        ? Timestamp.fromDate(new Date(orderData.expectedDeliveryDate)) 
        : null,
      deadline: orderData.deadline 
        ? Timestamp.fromDate(new Date(orderData.deadline)) 
        : null,
      deliveryDate: orderData.deliveryDate 
        ? Timestamp.fromDate(new Date(orderData.deliveryDate)) 
        : null
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
        const { createStatusChangeNotification } = require('./notificationService');
        await createStatusChangeNotification(
          userId,
          'order',
          orderId,
          orderData.orderNumber || orderId.substring(0, 8),
          oldStatus || 'Nowy',
          status
        );
      } catch (notificationError) {
        console.warn('Nie udało się utworzyć powiadomienia:', notificationError);
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
    return stats;
  } catch (error) {
    console.error('Błąd podczas pobierania statystyk zamówień:', error);
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
    
    // Jeśli produkt ma minimalną ilość zamówienia i jest produktem (nie recepturą),
    // sprawdź czy ilość spełnia wymóg minimalny - tylko jeśli jednostki są takie same
    if (item.id && item.itemType === 'product' && !item.isRecipe) {
      const minOrderQuantity = item.minOrderQuantity || 0;
      if (minOrderQuantity > 0 && item.quantity < minOrderQuantity && item.unit === item.originalUnit) {
        throw new Error(`Pozycja #${index + 1} (${item.name}) wymaga minimalnej ilości zamówienia: ${minOrderQuantity} ${item.unit}`);
      }
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
    
    // Jeśli produkt nie jest z listy cenowej i ma koszt produkcji, dodajemy go do wartości
    if (item.fromPriceList !== true && item.productionTaskId && item.productionCost !== undefined) {
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
        (item.recipeId === recipeId || item.id === recipeId) && 
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