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
    
    // Aktualizacja łącznej wartości zamówienia
    processedOrder.productsValue = totalProductsValue;
    processedOrder.shippingCost = shippingCost;
    processedOrder.purchaseOrdersValue = poTotalGross;
    processedOrder.totalValue = totalProductsValue + shippingCost;
    
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
    
    // Obliczanie wartości zamówienia z uwzględnieniem kosztów produkcji dla pozycji spoza listy cenowej
    const calculatedTotalValue = calculateOrderTotal(orderData.items);
    
    // Upewnij się, że mamy wartość totalValue - użyj przekazanej lub oblicz
    const totalValue = parseFloat(orderData.totalValue) || calculatedTotalValue;
    
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
    
    // Obliczanie wartości zamówienia z uwzględnieniem kosztów produkcji dla pozycji spoza listy cenowej
    const calculatedTotalValue = calculateOrderTotal(orderData.items);
    
    // Upewnij się, że mamy wartość totalValue - użyj przekazanej lub oblicz
    const totalValue = parseFloat(orderData.totalValue) || calculatedTotalValue;
    
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
      // Oblicz pełną wartość zamówienia
      let fullOrderValue = 0;
      
      // Wartość produktów
      if (order.items && order.items.length > 0) {
        const productsValue = order.items.reduce((sum, item) => {
          const quantity = parseFloat(item.quantity) || 0;
          const price = parseFloat(item.price) || 0;
          return sum + (quantity * price);
        }, 0);
        fullOrderValue += productsValue;
      }
      
      // Koszt wysyłki
      const shippingCost = parseFloat(order.shippingCost) || 0;
      fullOrderValue += shippingCost;
      
      // Dodaj wartość powiązanych zamówień zakupu (PO)
      if (order.linkedPurchaseOrders && order.linkedPurchaseOrders.length > 0) {
        for (let i = 0; i < order.linkedPurchaseOrders.length; i++) {
          const po = order.linkedPurchaseOrders[i];
          try {
            // Dla pełnych danych analitycznych, pobierz świeże dane PO
            // Dla dashboardu używamy istniejących danych dla szybkości
            if (!forDashboard) {
              try {
                const { getPurchaseOrderById } = await import('./purchaseOrderService');
                const freshPoData = await getPurchaseOrderById(po.id);
                if (freshPoData) {
                  console.log(`Pobrano świeże dane PO: ${freshPoData.number}`);
                  
                  // Jeśli zamówienie ma wartość brutto, używamy jej
                  if (freshPoData.totalGross !== undefined && freshPoData.totalGross !== null) {
                    fullOrderValue += parseFloat(freshPoData.totalGross) || 0;
                  } else {
                    // W przeciwnym razie oblicz wartość brutto
                    const poProductsValue = parseFloat(freshPoData.totalValue || freshPoData.value || 0);
                    const vatRate = parseFloat(freshPoData.vatRate || 23);
                    const vatValue = (poProductsValue * vatRate) / 100;
                    
                    // Dodatkowe koszty - sprawdź najpierw nowy format, a potem stary
                    let additionalCosts = 0;
                    if (freshPoData.additionalCostsItems && Array.isArray(freshPoData.additionalCostsItems)) {
                      additionalCosts = freshPoData.additionalCostsItems.reduce((sum, cost) => {
                        return sum + (parseFloat(cost.value) || 0);
                      }, 0);
                    } else if (freshPoData.additionalCosts) {
                      additionalCosts = parseFloat(freshPoData.additionalCosts) || 0;
                    }
                    
                    fullOrderValue += poProductsValue + vatValue + additionalCosts;
                  }
                }
              } catch (error) {
                console.warn(`Nie można pobrać świeżych danych PO ${po.id}: ${error.message}`);
                // Jeśli nie możemy pobrać świeżych danych, używamy istniejących
                if (po.totalGross !== undefined && po.totalGross !== null) {
                  fullOrderValue += parseFloat(po.totalGross) || 0;
                } else {
                  // Jeśli nie ma wartości brutto, oblicz ją
                  const poProductsValue = parseFloat(po.totalValue || po.value || 0);
                  const vatRate = parseFloat(po.vatRate || 23);
                  const vatValue = (poProductsValue * vatRate) / 100;
                  
                  // Dodatkowe koszty - sprawdź najpierw nowy format, a potem stary
                  let additionalCosts = 0;
                  if (po.additionalCostsItems && Array.isArray(po.additionalCostsItems)) {
                    additionalCosts = po.additionalCostsItems.reduce((sum, cost) => {
                      return sum + (parseFloat(cost.value) || 0);
                    }, 0);
                  } else if (po.additionalCosts) {
                    additionalCosts = parseFloat(po.additionalCosts) || 0;
                  }
                  
                  fullOrderValue += poProductsValue + vatValue + additionalCosts;
                }
              }
            } else {
              // Dla dashboardu używamy istniejących danych - znacznie szybciej
              if (po.totalGross !== undefined && po.totalGross !== null) {
                fullOrderValue += parseFloat(po.totalGross) || 0;
              } else {
                // Jeśli nie ma wartości brutto, oblicz ją
                const poProductsValue = parseFloat(po.totalValue || po.value || 0);
                const vatRate = parseFloat(po.vatRate || 23);
                const vatValue = (poProductsValue * vatRate) / 100;
                
                // Dodatkowe koszty - sprawdź najpierw nowy format, a potem stary
                let additionalCosts = 0;
                if (po.additionalCostsItems && Array.isArray(po.additionalCostsItems)) {
                  additionalCosts = po.additionalCostsItems.reduce((sum, cost) => {
                    return sum + (parseFloat(cost.value) || 0);
                  }, 0);
                } else if (po.additionalCosts) {
                  additionalCosts = parseFloat(po.additionalCosts) || 0;
                }
                
                fullOrderValue += poProductsValue + vatValue + additionalCosts;
              }
            }
          } catch (error) {
            console.error(`Błąd przetwarzania PO ${po.orderNumber || po.id}: ${error.message}`);
          }
        }
      }
      
      // Aktualizuj wartość zamówienia
      order.calculatedTotalValue = fullOrderValue;
      
      // Aktualizuj statystyki
      if (order.status) {
        if (stats.byStatus[order.status] !== undefined) {
          stats.byStatus[order.status]++;
        }
      }
      
      // Aktualizacja całkowitej wartości
      stats.totalValue += parseFloat(order.totalValue || fullOrderValue);
      
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
      stats.byMonth[monthKey].value += parseFloat(order.totalValue || fullOrderValue);
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
      calculatedTotalValue: order.calculatedTotalValue || 0,
      totalValue: parseFloat(order.totalValue || order.calculatedTotalValue || 0)
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
export const calculateOrderTotal = (items) => {
  if (!items || !Array.isArray(items)) {
    return 0;
  }
  
  return items.reduce((sum, item) => {
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
      unit: taskData.unit,
      orderItemId: orderItemId // Dodaj identyfikator pozycji zamówienia
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