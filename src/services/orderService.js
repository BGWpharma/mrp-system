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
export const getOrderById = async (orderId) => {
  try {
    const orderDoc = await getDoc(doc(db, ORDERS_COLLECTION, orderId));
    
    if (!orderDoc.exists()) {
      throw new Error('Zamówienie nie zostało znalezione');
    }
    
    return {
      id: orderDoc.id,
      ...orderDoc.data()
    };
  } catch (error) {
    console.error('Błąd podczas pobierania zamówienia:', error);
    throw error;
  }
};

/**
 * Tworzy nowe zamówienie
 */
export const createOrder = async (orderData, userId) => {
  try {
    // Wygeneruj numer CO
    const orderNumber = await generateCONumber();
    
    // Oblicz łączną wartość zamówienia, jeśli nie została obliczona
    let totalValue = orderData.totalValue;
    if (!totalValue && orderData.items && orderData.items.length > 0) {
      totalValue = orderData.items.reduce((sum, item) => {
        return sum + (item.quantity * item.price || 0);
      }, 0);
      
      // Dodaj koszt wysyłki, jeśli istnieje
      if (orderData.shippingCost) {
        totalValue += parseFloat(orderData.shippingCost) || 0;
      }
    }
    
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
    
    const orderWithMeta = {
      ...orderData,
      orderNumber,
      totalValue: totalValue || 0,
      orderDate: orderDate,
      productionTasks: [], // Inicjalizacja pustej listy zadań produkcyjnych
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
    
    // Obliczanie wartości zamówienia
    const totalValue = calculateOrderTotal(orderData.items);
    
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
      await updateDoc(orderRef, {
        status: status,
        updatedBy: userId,
        updatedAt: serverTimestamp(),
        // Jeśli status to "Dostarczone", ustaw datę dostawy
        ...(status === 'Dostarczone' ? { deliveryDate: serverTimestamp() } : {})
      });
      
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
export const getOrdersStats = async () => {
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
    
    // Najnowsze zamówienia (max 5)
    stats.recentOrders = allOrders.slice(0, 5).map(order => ({
      id: order.id,
      customer: order.customer.name,
      date: order.orderDate,
      value: order.totalValue,
      status: order.status
    }));
    
    // Przetwarzanie statystyk
    allOrders.forEach(order => {
      // Suma wartości wszystkich zamówień
      stats.totalValue += order.totalValue || 0;
      
      // Statystyki według statusu
      if (stats.byStatus[order.status] !== undefined) {
        stats.byStatus[order.status]++;
      }
      
      // Statystyki według miesiąca
      const orderDate = order.orderDate instanceof Timestamp 
        ? order.orderDate.toDate() 
        : new Date(order.orderDate);
      
      const monthKey = `${orderDate.getFullYear()}-${(orderDate.getMonth() + 1).toString().padStart(2, '0')}`;
      
      if (!stats.byMonth[monthKey]) {
        stats.byMonth[monthKey] = {
          total: 0,
          value: 0
        };
      }
      
      stats.byMonth[monthKey].total++;
      stats.byMonth[monthKey].value += order.totalValue || 0;
    });
    
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
  });
  
  if (!orderData.orderDate) {
    throw new Error('Data zamówienia jest wymagana');
  }
};

/**
 * Oblicza łączną wartość zamówienia
 */
const calculateOrderTotal = (items) => {
  return items.reduce((sum, item) => {
    return sum + (item.price * item.quantity);
  }, 0);
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
    shippingAddress: ''
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
  shippingAddress: ''
};

// Dodaj nową funkcję do aktualizacji listy zadań produkcyjnych
export const addProductionTaskToOrder = async (orderId, taskData) => {
  try {
    const orderRef = doc(db, ORDERS_COLLECTION, orderId);
    const orderDoc = await getDoc(orderRef);
    
    if (!orderDoc.exists()) {
      throw new Error('Zamówienie nie istnieje');
    }
    
    const order = orderDoc.data();
    const productionTasks = order.productionTasks || [];
    
    // Dodaj nowe zadanie do listy
    productionTasks.push({
      id: taskData.id,
      moNumber: taskData.moNumber,
      name: taskData.name,
      status: taskData.status,
      createdAt: new Date().toISOString(), // Używamy zwykłej daty zamiast serverTimestamp
      productName: taskData.productName,
      quantity: taskData.quantity,
      unit: taskData.unit
    });
    
    // Zaktualizuj zamówienie
    await updateDoc(orderRef, {
      productionTasks,
      updatedAt: serverTimestamp()
    });
    
    return true;
  } catch (error) {
    console.error('Błąd podczas dodawania zadania produkcyjnego do zamówienia:', error);
    throw error;
  }
}; 