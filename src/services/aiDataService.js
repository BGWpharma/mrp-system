import { db } from './firebase/config';
import { 
  collection, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit,
  startAfter,
  Timestamp 
} from 'firebase/firestore';

/**
 * Pobiera dane z kolekcji i przekształca je do formatu odpowiedniego dla AI
 * @param {string} collectionName - Nazwa kolekcji do pobrania
 * @param {Object} options - Opcje pobierania (limit, filtry, sortowanie)
 * @returns {Promise<Array>} - Dane z kolekcji
 */
const getCollectionData = async (collectionName, options = {}) => {
  try {
    let q = collection(db, collectionName);
    
    // Dodaj filtry do zapytania
    if (options.filters) {
      options.filters.forEach(filter => {
        q = query(q, where(filter.field, filter.operator, filter.value));
      });
    }
    
    // Dodaj sortowanie
    if (options.orderBy) {
      q = query(q, orderBy(options.orderBy.field, options.orderBy.direction || 'asc'));
    }
    
    // Dodaj limit
    if (options.limit) {
      q = query(q, limit(options.limit));
    }
    
    // Dodaj paginację
    if (options.startAfter) {
      q = query(q, startAfter(options.startAfter));
    }
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error(`Błąd podczas pobierania danych z kolekcji ${collectionName}:`, error);
    throw error;
  }
};

/**
 * Pobiera dane o produktach z bazy danych
 * @param {number} limitCount - Limit liczby produktów do pobrania
 * @returns {Promise<Array>} - Lista produktów
 */
export const getInventoryItems = async (limitCount = 100) => {
  return await getCollectionData('inventory', { 
    limit: limitCount,
    orderBy: { field: 'name' }
  });
};

/**
 * Pobiera dane o zamówieniach klientów z bazy danych
 * @param {number} limitCount - Limit liczby zamówień do pobrania
 * @returns {Promise<Array>} - Lista zamówień
 */
export const getCustomerOrders = async (limitCount = 50) => {
  return await getCollectionData('orders', { 
    limit: limitCount,
    orderBy: { field: 'createdAt', direction: 'desc' }
  });
};

/**
 * Pobiera dane o dostawcach z bazy danych
 * @param {number} limitCount - Limit liczby dostawców do pobrania
 * @returns {Promise<Array>} - Lista dostawców
 */
export const getSuppliers = async (limitCount = 50) => {
  return await getCollectionData('suppliers', { 
    limit: limitCount,
    orderBy: { field: 'name' }
  });
};

/**
 * Pobiera dane o zamówieniach od dostawców z bazy danych
 * @param {number} limitCount - Limit liczby zamówień do pobrania
 * @returns {Promise<Array>} - Lista zamówień od dostawców
 */
export const getPurchaseOrders = async (limitCount = 50) => {
  return await getCollectionData('purchaseOrders', { 
    limit: limitCount,
    orderBy: { field: 'createdAt', direction: 'desc' }
  });
};

/**
 * Pobiera dane o zadaniach produkcyjnych z bazy danych
 * @param {number} limitCount - Limit liczby zadań do pobrania
 * @returns {Promise<Array>} - Lista zadań produkcyjnych
 */
export const getProductionTasks = async (limitCount = 50) => {
  return await getCollectionData('productionTasks', { 
    limit: limitCount,
    orderBy: { field: 'plannedStartDate', direction: 'desc' }
  });
};

/**
 * Pobiera dane o recepturach z bazy danych
 * @param {number} limitCount - Limit liczby receptur do pobrania
 * @returns {Promise<Array>} - Lista receptur
 */
export const getRecipes = async (limitCount = 50) => {
  return await getCollectionData('recipes', { 
    limit: limitCount,
    orderBy: { field: 'name' }
  });
};

/**
 * Przygotowuje zbiór danych biznesowych dla zapytania AI
 * @param {string} query - Zapytanie użytkownika
 * @returns {Promise<Object>} - Kontekst danych biznesowych
 */
export const prepareBusinessDataForAI = async (query) => {
  const dataContext = {
    timestamp: new Date().toISOString(),
    query: query,
    data: {}
  };
  
  // Określ, jakie dane są potrzebne na podstawie zapytania
  const needsInventoryData = query.toLowerCase().includes('magazyn') || 
                            query.toLowerCase().includes('stan') ||
                            query.toLowerCase().includes('produkt') ||
                            query.toLowerCase().includes('towar');
  
  const needsOrdersData = query.toLowerCase().includes('zamówieni') || 
                          query.toLowerCase().includes('klient') ||
                          query.toLowerCase().includes('sprzedaż');
  
  const needsProductionData = query.toLowerCase().includes('produkcj') || 
                             query.toLowerCase().includes('zadani') ||
                             query.toLowerCase().includes('wytwarzani');
  
  const needsSupplierData = query.toLowerCase().includes('dostaw') || 
                           query.toLowerCase().includes('zakup');
  
  // Pobierz tylko potrzebne dane
  try {
    if (needsInventoryData) {
      dataContext.data.inventory = await getInventoryItems(50);
    }
    
    if (needsOrdersData) {
      dataContext.data.orders = await getCustomerOrders(30);
    }
    
    if (needsProductionData) {
      dataContext.data.productionTasks = await getProductionTasks(20);
      dataContext.data.recipes = await getRecipes(20);
    }
    
    if (needsSupplierData) {
      dataContext.data.suppliers = await getSuppliers(20);
      dataContext.data.purchaseOrders = await getPurchaseOrders(20);
    }
    
    return dataContext;
  } catch (error) {
    console.error('Błąd podczas przygotowywania danych biznesowych dla AI:', error);
    return {
      timestamp: new Date().toISOString(),
      query: query,
      error: 'Wystąpił błąd podczas pobierania danych biznesowych',
      data: {}
    };
  }
};

/**
 * Pobiera statystyki i podsumowanie danych z systemu MRP
 * @returns {Promise<Object>} - Podsumowanie danych biznesowych
 */
export const getMRPSystemSummary = async () => {
  try {
    // Pobierz podstawowe statystyki
    const inventoryItems = await getInventoryItems(1000);
    const customerOrders = await getCustomerOrders(1000);
    const productionTasks = await getProductionTasks(1000);
    const suppliers = await getSuppliers(1000);
    const purchaseOrders = await getPurchaseOrders(1000);
    
    // Oblicz bieżące statystyki
    const activeOrders = customerOrders.filter(order => 
      order.status !== 'completed' && order.status !== 'cancelled'
    ).length;
    
    const activeProductionTasks = productionTasks.filter(task => 
      task.status !== 'completed' && task.status !== 'cancelled'
    ).length;
    
    const itemsLowOnStock = inventoryItems.filter(item => 
      (item.quantity <= item.minQuantity) && item.minQuantity > 0
    ).length;
    
    const pendingPurchaseOrders = purchaseOrders.filter(po => 
      po.status !== 'completed' && po.status !== 'cancelled'
    ).length;
    
    return {
      timestamp: new Date().toISOString(),
      totalInventoryItems: inventoryItems.length,
      totalOrders: customerOrders.length,
      totalProductionTasks: productionTasks.length,
      totalSuppliers: suppliers.length,
      activeOrders,
      activeProductionTasks,
      itemsLowOnStock,
      pendingPurchaseOrders
    };
  } catch (error) {
    console.error('Błąd podczas pobierania podsumowania systemu MRP:', error);
    return {
      timestamp: new Date().toISOString(),
      error: 'Wystąpił błąd podczas pobierania podsumowania systemu MRP'
    };
  }
}; 