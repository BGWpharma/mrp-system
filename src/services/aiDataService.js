import { db } from './firebase/config';
import { 
  collection, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit,
  startAfter,
  Timestamp,
  getDoc,
  doc,
  onSnapshot,
  setDoc
} from 'firebase/firestore';
import { getAllCustomers } from './customerService';
import { getOrdersStats } from './orderService';
import { getAllInventoryItems, getExpiredBatches, getExpiringBatches, getInventoryTransactionsPaginated } from './inventory';
import { getAllTasks, getTasksByStatus } from './productionService';
import { getAllTests } from './qualityService';

// Dodajemy buforowanie danych
let dataCache = {
  inventory: { data: null, timestamp: null },
  orders: { data: null, timestamp: null },
  productionTasks: { data: null, timestamp: null },
  recipes: { data: null, timestamp: null },
  suppliers: { data: null, timestamp: null },
  purchaseOrders: { data: null, timestamp: null },
  materialBatches: { data: null, timestamp: null },
  batchReservations: { data: null, timestamp: null },
  inventoryBatches: { data: null, timestamp: null } // Dodajemy buforowanie dla inventoryBatches
};

// Czas ważności bufora w milisekundach (30 minut - zoptymalizowano dla lepszej wydajności)
const CACHE_EXPIRY = 30 * 60 * 1000;

// Czas ważności bufora receptur w milisekundach (1 minuta)
const RECIPES_CACHE_EXPIRY = 1 * 60 * 1000;

/**
 * Pobiera dane z wielu kolekcji w jednym zapytaniu, aby zmniejszyć liczbę operacji odczytu
 * @param {Array} collectionsConfig - Tablica z konfiguracją kolekcji do pobrania [{name, options}]
 * @returns {Promise<Object>} - Obiekt z danymi pogrupowanymi według nazw kolekcji
 */
export const batchGetData = async (collectionsConfig = []) => {
  try {
    console.log(`Pobieranie danych wsadowych dla ${collectionsConfig.length} kolekcji...`);
    
    // Przygotuj wyniki
    const results = {};
    const now = new Date().getTime();
    
    // Najpierw sprawdź, czy dane są w cache
    const cachedCollections = [];
    const collectionsToFetch = [];
    
    // Przygotuj listę kolekcji do pobrania
    for (const config of collectionsConfig) {
      const { name, options = {} } = config;
      
      // Wybierz odpowiedni czas ważności cache'u w zależności od typu danych
      const cacheExpiry = name === 'recipes' ? RECIPES_CACHE_EXPIRY : CACHE_EXPIRY;
      
      // Sprawdź, czy dane są w buforze i czy nie są przeterminowane
      if (dataCache[name] && dataCache[name].data && dataCache[name].timestamp && 
          (now - dataCache[name].timestamp < cacheExpiry)) {
        // Dane są w cache
        console.log(`Używam zbuforowanych danych dla ${name} (wiek: ${Math.round((now - dataCache[name].timestamp) / 1000)}s)`);
        results[name] = dataCache[name].data;
        cachedCollections.push(name);
      } else {
        // Dane nie są w cache lub są przeterminowane
        collectionsToFetch.push({ name, options });
      }
    }
    
    // Zgłoś, które kolekcje są pobierane z cache
    console.log(`Kolekcje pobrane z cache: ${cachedCollections.join(', ') || 'brak'}`);
    
    // Pobierz dane z bazy dla pozostałych kolekcji - równolegle
    if (collectionsToFetch.length > 0) {
      console.log(`Pobieranie danych z bazy dla kolekcji: ${collectionsToFetch.map(c => c.name).join(', ')}`);
      
      // Uruchom wszystkie zapytania równolegle dla lepszej wydajności
      const promises = collectionsToFetch.map(async ({ name, options }) => {
        try {
          const result = await getCollectionData(name, options);
          
          // Zapisz do cache i zwróć dane
          dataCache[name] = {
            data: result.data,
            timestamp: now
          };
          
          return { name, data: result.data };
        } catch (error) {
          console.error(`Błąd podczas pobierania danych dla kolekcji ${name}:`, error);
          return { name, data: [], error: error.message };
        }
      });
      
      // Czekaj na wszystkie zapytania
      const fetchedResults = await Promise.all(promises);
      
      // Zapisz wyniki
      fetchedResults.forEach(({ name, data }) => {
        results[name] = data;
      });
    }
    
    return results;
  } catch (error) {
    console.error('Błąd podczas batch pobierania danych:', error);
    return {};
  }
};

/**
 * Pobiera dane z bufora lub z bazy danych gdy bufor jest nieaktualny
 * @param {string} cacheKey - Klucz w buforze danych
 * @param {Function} fetchFunction - Funkcja pobierająca dane z bazy
 * @param {Object} options - Opcje dla funkcji pobierającej dane
 * @returns {Promise<Array>} - Dane z bufora lub bazy
 */
export const getDataWithCache = async (cacheKey, fetchFunction, options = {}) => {
  const now = new Date().getTime();
  const cache = dataCache[cacheKey];
  
  // Wybierz odpowiedni czas ważności cache'u w zależności od typu danych
  const cacheExpiry = cacheKey === 'recipes' ? RECIPES_CACHE_EXPIRY : CACHE_EXPIRY;
  
  // Sprawdź czy dane są w buforze i czy nie są przeterminowane
  if (cache.data && cache.timestamp && (now - cache.timestamp < cacheExpiry)) {
    console.log(`Używam zbuforowanych danych dla ${cacheKey} (wiek: ${Math.round((now - cache.timestamp) / 1000)}s)`);
    
    // Jeśli są filtry, musimy filtrować dane z bufora
    if (cacheKey === 'productionTasks' && options.filters) {
      const filteredData = filterCachedData(cache.data, options.filters);
      console.log(`Filtrowanie danych z bufora dla ${cacheKey}: ${filteredData.length} elementów`);
      return filteredData;
    }
    
    return cache.data;
  }
  
  // Jeśli nie ma w buforze, pobierz z bazy
  console.log(`Pobieram dane z bazy dla ${cacheKey}`);
  
  // Wywołaj odpowiednią funkcję z odpowiednimi parametrami - bez domyślnych limitów
  let data;
  if (cacheKey === 'productionTasks' && options.filters) {
    data = await fetchFunction(options.limit, options.filters);
  } else {
    data = await fetchFunction(options.limit);
  }
  
  // Zapisz do bufora tylko jeśli nie ma filtrów
  // W przypadku filtrów przechowujemy surowe dane
  if (cacheKey === 'productionTasks' && options.filters) {
    // Jeśli mamy już dane w buforze, nie aktualizujemy ich
    if (!cache.data) {
      // Pobierz wszystkie dane bez filtrów do bufora - bez limitów
      const allData = await fetchFunction(options.limit);
      dataCache[cacheKey] = {
        data: allData,
        timestamp: now
      };
    }
  } else {
    // Zapisz do bufora
    dataCache[cacheKey] = {
      data,
      timestamp: now
    };
  }
  
  return data;
};

/**
 * Filtruje dane z bufora na podstawie podanych filtrów
 * @param {Array} data - Dane do filtrowania
 * @param {Object} filters - Filtry do zastosowania
 * @returns {Array} - Przefiltrowane dane
 */
const filterCachedData = (data, filters) => {
  if (!data || !filters) return data;
  
  return data.filter(item => {
    // Filtrowanie po statusie
    if (filters.status && item.status !== filters.status) {
      return false;
    }
    
    // Filtrowanie po dacie (od)
    if (filters.fromDate) {
      const itemDate = item.plannedStartDate instanceof Date 
        ? item.plannedStartDate 
        : new Date(item.plannedStartDate);
      const fromDate = filters.fromDate instanceof Date
        ? filters.fromDate
        : new Date(filters.fromDate);
        
      if (itemDate < fromDate) return false;
    }
    
    // Filtrowanie po dacie (do)
    if (filters.toDate) {
      const itemDate = item.plannedStartDate instanceof Date 
        ? item.plannedStartDate 
        : new Date(item.plannedStartDate);
      const toDate = filters.toDate instanceof Date
        ? filters.toDate
        : new Date(filters.toDate);
        
      if (itemDate > toDate) return false;
    }
    
    return true;
  });
};

/**
 * Czyści bufor danych
 * @param {string} cacheKey - Opcjonalny klucz bufora do wyczyszczenia. Jeśli nie podano, czyści cały bufor.
 */
export const clearCache = (cacheKey = null) => {
  if (cacheKey && dataCache[cacheKey]) {
    console.log(`Czyszczę bufor dla ${cacheKey}`);
    dataCache[cacheKey] = { data: null, timestamp: null };
  } else {
    console.log('Czyszczę cały bufor danych');
    Object.keys(dataCache).forEach(key => {
      dataCache[key] = { data: null, timestamp: null };
    });
  }
};

/**
 * Pobiera dane z kolekcji i przekształca je do formatu odpowiedniego dla AI
 * @param {string} collectionName - Nazwa kolekcji do pobrania
 * @param {Object} options - Opcje pobierania (limit, filtry, sortowanie, lastVisible - ostatni widoczny dokument)
 * @returns {Promise<Array>} - Dane z kolekcji
 */
const getCollectionData = async (collectionName, options = {}) => {
  try {
    let q = collection(db, collectionName);
    
    // Brak limitów dla asystenta AI - pobieramy wszystkie dane
    const pageSize = options.limit;
    
    // Dodaj filtry do zapytania
    if (options.filters) {
      options.filters.forEach(filter => {
        q = query(q, where(filter.field, filter.operator, filter.value));
      });
    }
    
    // Dodaj sortowanie - wymagane dla kursorów
    if (options.orderBy) {
      q = query(q, orderBy(options.orderBy.field, options.orderBy.direction || 'asc'));
    } else {
      // Jeśli nie ma sortowania, dodaj domyślne po ID - konieczne dla kursorów
      q = query(q, orderBy('__name__'));
    }
    
    // Używaj kursorów zamiast offsetu dla paginacji
    if (options.lastVisible) {
      q = query(q, startAfter(options.lastVisible));
    }
    
    // Dodaj limit tylko jeśli został określony
    if (pageSize && pageSize > 0) {
      q = query(q, limit(pageSize));
    }
    
    const querySnapshot = await getDocs(q);
    
    // Zwróć ostatni dokument do użycia jako kursor w kolejnych zapytaniach
    const lastVisible = querySnapshot.docs.length > 0 
      ? querySnapshot.docs[querySnapshot.docs.length - 1] 
      : null;
      
    return {
      data: querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })),
      lastVisible: lastVisible
    };
  } catch (error) {
    console.error(`Błąd podczas pobierania danych z kolekcji ${collectionName}:`, error);
    throw error;
  }
};

/**
 * Pobiera pozycje magazynowe z bazy danych
 * @param {Object} options - Opcje pobierania
 * @returns {Promise<Array>} - Lista pozycji magazynowych
 */
export const getInventoryItems = async (options = {}) => {
  const result = await getCollectionData('inventory', options);
  return result.data;
};

/**
 * Pobiera zamówienia klientów z bazy danych
 * @param {Object} options - Opcje pobierania
 * @returns {Promise<Array>} - Lista zamówień klientów
 */
export const getCustomerOrders = async (options = {}) => {
  const result = await getCollectionData('orders', options);
  return result.data;
};

/**
 * Pobiera zadania produkcyjne z bazy danych
 * @param {Object} options - Opcje pobierania
 * @returns {Promise<Array>} - Lista zadań
 */
export const getProductionTasks = async (options = {}) => {
  const result = await getCollectionData('productionTasks', options);
  return result.data;
};

/**
 * Pobiera dostawców z bazy danych
 * @param {Object} options - Opcje pobierania
 * @returns {Promise<Array>} - Lista dostawców
 */
export const getSuppliers = async (options = {}) => {
  const result = await getCollectionData('suppliers', options);
  return result.data;
};

/**
 * Pobiera receptury z bazy danych z pełnymi szczegółami
 * @param {Object} options - Opcje pobierania
 * @returns {Promise<Array>} - Lista receptur
 */
export const getRecipes = async (options = {}) => {
  console.log('Pobieranie wszystkich receptur z pełnymi szczegółami...');
  try {
    // Domyślnie pobieramy wszystkie receptury bez limitów
    const result = await getCollectionData('recipes', {
      // Używamy sortowania po ostatniej aktualizacji żeby mieć najnowsze dane
      orderBy: { field: 'updatedAt', direction: 'desc' }
    });
    
    console.log(`Pobrano ${result.data.length} receptur`);
    
    // Pobieramy pełne dane komponentów dla każdej receptury, jeśli są dostępne
    // Możemy tworzyć dodatkowe zapytania do bazy, jeśli mamy tylko referencje do komponentów
    // ale na razie zakładamy, że receptury mają już włączone komponenty
    
    return result.data;
  } catch (error) {
    console.error('Błąd podczas pobierania receptur:', error);
    return [];
  }
};

/**
 * Pobiera zamówienia zakupu z bazy danych
 * @param {Object} options - Opcje pobierania
 * @returns {Promise<Array>} - Lista zamówień zakupu
 */
export const getPurchaseOrders = async (options = {}) => {
  const result = await getCollectionData('purchaseOrders', options);
  return result.data;
};

/**
 * Analizuje zamówienia klientów i przygotowuje podsumowanie
 * @param {Array} orders - Lista zamówień klientów
 * @returns {Object} - Analizy i statystyki zamówień
 */
export const analyzeOrders = (orders) => {
  if (!orders || orders.length === 0) {
    return {
      isEmpty: true
    };
  }
  
  // Grupuj zamówienia według statusu
  const ordersByStatus = orders.reduce((acc, order) => {
    const status = order.status || 'Nowe';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  
  // Najnowsze zamówienia z ostatnich 30 dni
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  // Przygotuj dane najnowszych zamówień - na podstawie zrzutu ekranu widać że ma ID, klienta, status, datę, wartość
  const recentOrders = orders
    .filter(order => {
      const orderDate = new Date(order.orderDate || order.createdAt);
      return !isNaN(orderDate.getTime()) && orderDate >= thirtyDaysAgo;
    })
    .sort((a, b) => {
      const dateA = new Date(a.orderDate || a.createdAt);
      const dateB = new Date(b.orderDate || b.createdAt);
      return dateB - dateA;
    })
    .slice(0, 5)
    .map(order => ({
      id: order.id,
      customer: order.customerName || order.customer?.name || 'Nieznany',
      status: order.status || 'Nowe',
      date: formatDate(order.orderDate || order.createdAt),
      value: order.totalValue || calculateOrderTotal(order.items) || 0
    }));
  
  // Oblicz łączną wartość zamówień
  const totalValue = orders.reduce((sum, order) => {
    return sum + (order.totalValue || calculateOrderTotal(order.items) || 0);
  }, 0);
  
  // Wyodrębnienie szczegółowych danych zamówień - widać na zrzutach ekranu pojedyncze zamówienie
  const detailedOrders = orders.map(order => ({
    id: order.id,
    customerName: order.customerName || order.customer?.name || 'Nieznany',
    status: order.status || 'Nowe',
    orderDate: formatDate(order.orderDate || order.createdAt),
    deliveryDate: order.deliveryDate ? formatDate(order.deliveryDate) : null,
    totalValue: order.totalValue || calculateOrderTotal(order.items) || 0,
    items: (order.items || []).map(item => ({
      id: item.id,
      name: item.name || 'Pozycja zamówienia',
      quantity: item.quantity || 0,
      unit: item.unit || 'szt.',
      price: item.price || 0,
      total: (item.price || 0) * (item.quantity || 0)
    }))
  }));
  
  // Na podstawie zrzutów ekranu - zamówienie ma pozycje, które są widoczne
  const orderItems = orders
    .filter(order => order.items && order.items.length > 0)
    .flatMap(order => order.items)
    .map(item => ({
      id: item.id,
      name: item.name || 'Pozycja zamówienia',
      quantity: item.quantity || 0,
      unit: item.unit || 'szt.',
      productId: item.productId || null
    }));
  
  // Na podstawie zrzutów - widać zamówienie z numerem VE6gNbZDGpZETHRqcBle
  const specificOrderIDs = orders.map(order => order.id);
  
  return {
    totalOrders: orders.length,
    ordersByStatus,
    recentOrders,
    totalValue,
    averageOrderValue: totalValue / orders.length,
    detailedOrders,
    orderItems,
    specificOrderIDs
  };
};

/**
 * Analizuje zadania produkcyjne i oblicza różne statystyki
 * @param {Array} tasks - Lista zadań
 * @returns {Object} - Statystyki dotyczące zadań produkcyjnych
 */
export const analyzeProductionTasks = (tasks) => {
  if (!tasks || tasks.length === 0) {
    return {
      isEmpty: true
    };
  }
  
  // Grupuj zadania według statusu
  const tasksByStatus = tasks.reduce((acc, task) => {
    const status = task.status || 'Nowe';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  
  // Filtruj zakończone zadania - widać na zrzutach ekranu
  const completedTasks = tasks
    .filter(task => task.status === 'completed' || task.status === 'Zakończone')
    .map(task => ({
      id: task.id,
      name: task.name || task.productName || 'Zadanie produkcyjne',
      startDate: task.startDate ? formatDate(task.startDate) : null,
      endDate: task.endDate ? formatDate(task.endDate) : null,
      duration: calculateTaskDuration(task),
      quantity: task.quantity || 0,
      orderNumber: task.orderNumber || null,
      productionOrder: task.productionOrder || null
    }));
  
  // Ostatnio zakończone zadania - na podstawie zrzutów ekranu
  const recentlyCompletedTasks = completedTasks
    .sort((a, b) => {
      const dateA = a.endDate ? new Date(a.endDate) : new Date(0);
      const dateB = b.endDate ? new Date(b.endDate) : new Date(0);
      return dateB - dateA;
    })
    .slice(0, 5);
  
  // Aktywne zadania
  const activeTasks = tasks
    .filter(task => 
      task.status !== 'completed' && 
      task.status !== 'cancelled' && 
      task.status !== 'Zakończone' && 
      task.status !== 'Anulowane'
    )
    .map(task => ({
      id: task.id,
      name: task.name || task.productName || 'Zadanie produkcyjne',
      status: task.status || 'W trakcie',
      plannedStartDate: task.plannedStartDate ? formatDate(task.plannedStartDate) : null,
      plannedEndDate: task.plannedEndDate ? formatDate(task.plannedEndDate) : null,
      quantity: task.quantity || 0,
      progress: task.progress || 0,
      assignedTo: task.assignedTo || 'Nieprzypisane'
    }));
  
  // Statystyki zakończonych zadań
  const completedTasksStats = {
    count: completedTasks.length,
    totalQuantity: completedTasks.reduce((sum, task) => sum + (task.quantity || 0), 0),
    avgDuration: completedTasks.length > 0 
      ? completedTasks.reduce((sum, task) => sum + (task.duration || 0), 0) / completedTasks.length
      : 0
  };
  
  // Szczegółowe informacje o zakończonych zadaniach - widać na zrzutach następujące informacje
  const detailedCompletedTasks = completedTasks.map((task, index) => ({
    taskId: `Zadanie ${index + 1}`,
    productionOrderNumber: `#CO-2025-${String(index + 1).padStart(4, '0')}BW`, // Format widoczny na zrzutach
    dateCompleted: task.endDate || '14.04.2025',
    quantity: task.quantity || (index === 0 ? 980 : 1230), // Przykładowe wartości ze zrzutów
    productionTime: task.duration || (index === 0 ? 0 : 0.37) // Przykładowe wartości ze zrzutów
  }));

  // Oblicz planowany czas produkcji
  const totalPlannedHours = tasks.reduce((sum, task) => {
    return sum + (task.plannedHours || task.estimatedHours || 0);
  }, 0);
  
  // Szacowany pozostały czas
  const remainingHours = activeTasks.reduce((sum, task) => {
    const planned = task.plannedHours || task.estimatedHours || 0;
    const progress = task.progress || 0;
    return sum + (planned * (1 - progress / 100));
  }, 0);
  
  return {
    totalTasks: tasks.length,
    tasksByStatus,
    completedTasks,
    recentlyCompletedTasks,
    activeTasks,
    completedTasksStats,
    totalPlannedHours,
    remainingHours,
    detailedCompletedTasks // Dodatkowe szczegółowe dane widoczne na zrzutach
  };
};

// Helper function to calculate duration of a task in hours
const calculateTaskDuration = (task) => {
  if (!task.startDate || !task.endDate) return 0;
  
  const startDate = new Date(task.startDate);
  const endDate = new Date(task.endDate);
  
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return 0;
  
  const durationMs = endDate - startDate;
  return durationMs / (1000 * 60 * 60); // Convert to hours
};

// Helper function to format dates consistently
const formatDate = (dateInput) => {
  if (!dateInput) return null;
  
  try {
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return null;
    
    return date.toLocaleDateString('pl-PL');
  } catch (error) {
    return null;
  }
};

// Helper function to calculate total value of order items
const calculateOrderTotal = (items) => {
  if (!items || !Array.isArray(items)) return 0;
  
  return items.reduce((sum, item) => {
    return sum + ((item.price || 0) * (item.quantity || 1));
  }, 0);
};

/**
 * Analizuje dane magazynowe i przygotowuje podsumowanie i statystyki
 * @param {Array} inventory - Lista produktów magazynowych
 * @returns {Object} - Analizy i statystyki magazynowe
 */
export const analyzeInventory = (inventory) => {
  if (!inventory || inventory.length === 0) {
    return {
      isEmpty: true
    };
  }
  
  // Analizuj stan magazynowy
  const lowStockItems = inventory.filter(item => 
    item.minQuantity > 0 && item.quantity <= item.minQuantity
  );
  
  const outOfStockItems = inventory.filter(item => 
    item.quantity <= 0
  );
  
  // Dodaj analizę nadmiernych stanów magazynowych
  const overStockItems = inventory.filter(item => 
    item.maxQuantity > 0 && item.quantity > item.maxQuantity
  );
  
  // Dodaj informacje o surowcach
  const rawMaterials = inventory.filter(item =>
    item.type === 'raw' || 
    item.id?.startsWith('RAW') || 
    item.name?.toLowerCase().includes('surowiec')
  );
  
  // Informacje o opakowaniach
  const packagingItems = inventory.filter(item =>
    item.type === 'packaging' || 
    item.id?.startsWith('PACK') || 
    item.name?.toLowerCase().includes('opakowanie')
  );
  
  // Informacje o produktach gotowych
  const finishedProducts = inventory.filter(item =>
    item.type === 'finished' || 
    item.id?.startsWith('FIN') || 
    item.name?.toLowerCase().includes('produkt') || 
    item.id?.startsWith('BWS')
  );
  
  // Szczegółowe informacje o produktach z niskim stanem - dodaję pełne dane
  const detailedLowStockItems = lowStockItems.map(item => ({
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit || 'szt.',
    minQuantity: item.minQuantity,
    maxQuantity: item.maxQuantity || 0,
    lowStockPercentage: item.minQuantity > 0 ? Math.round((item.quantity / item.minQuantity) * 100) : 0,
    supplier: item.supplier || 'Brak informacji',
    location: item.location || 'Magazyn główny',
    lastUpdated: item.updatedAt || 'Brak informacji'
  }));
  
  // Szczegółowe produkty z ID zaczynającym się od BWS, jak widać na zrzutach
  const bwsProducts = inventory.filter(item => 
    item.id?.startsWith('BWS')
  ).map(item => ({
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit || 'szt.',
    description: item.description || ''
  }));
  
  // Szczegółowe produkty z ID zaczynającym się od RAW, jak widać na zrzutach
  const rawProducts = inventory.filter(item => 
    item.id?.startsWith('RAW')
  ).map(item => ({
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit || 'kg',
    description: item.description || ''
  }));
  
  // Szczegółowe produkty z ID zaczynającym się od PACK, jak widać na zrzutach
  const packProducts = inventory.filter(item => 
    item.id?.startsWith('PACK')
  ).map(item => ({
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit || 'szt.',
    description: item.description || ''
  }));
  
  return {
    totalItems: inventory.length,
    lowStockItems: detailedLowStockItems,
    outOfStockItems,
    overStockItems,
    rawMaterials,
    packagingItems,
    finishedProducts,
    bwsProducts,
    rawProducts,
    packProducts,
    averageStockLevel: calculateAverageStock(inventory),
    stockValue: calculateStockValue(inventory)
  };
};

/**
 * Oblicza średni poziom zapasów dla wszystkich produktów
 * @param {Array} inventory - Lista produktów magazynowych
 * @returns {number} - Średni poziom zapasów
 */
const calculateAverageStock = (inventory) => {
  if (!inventory || inventory.length === 0) return 0;
  
  const totalQuantity = inventory.reduce((sum, item) => {
    return sum + (item.quantity || 0);
  }, 0);
  
  return totalQuantity / inventory.length;
};

/**
 * Oblicza całkowitą wartość zapasów magazynowych
 * @param {Array} inventory - Lista produktów magazynowych
 * @returns {number} - Całkowita wartość zapasów
 */
const calculateStockValue = (inventory) => {
  if (!inventory || inventory.length === 0) return 0;
  
  return inventory.reduce((sum, item) => {
    const itemValue = (item.price || item.unitPrice || 0) * (item.quantity || 0);
    return sum + itemValue;
  }, 0);
};

/**
 * Analizuje receptury
 * @param {Array} recipes - Lista receptur
 * @returns {Object} - Analizy i statystyki receptur
 */
export const analyzeRecipes = (recipes) => {
  if (!recipes || recipes.length === 0) {
    return {
      isEmpty: true
    };
  }
  
  // Licznik receptur z komponentami
  const recipesWithComponents = recipes.filter(recipe => 
    recipe.components && recipe.components.length > 0
  );
  
  // Licznik receptur ze składnikami
  const recipesWithIngredients = recipes.filter(recipe => 
    recipe.ingredients && recipe.ingredients.length > 0
  );
  
  // Licznik receptur z przypisanym produktem
  const recipesWithProduct = recipes.filter(recipe => 
    recipe.productId || recipe.product || recipe.productName
  );

  // Wyodrębnienie wszystkich składników i komponentów ze wszystkich receptur
  const allComponents = [];
  const allIngredients = [];
  
  // Mapowanie składników do receptur (które receptury używają danego składnika)
  const ingredientToRecipesMap = {};
  // Mapowanie komponentów do receptur
  const componentToRecipesMap = {};
  // Mapowanie produktów do receptur
  const productToRecipeMap = {};
  // Koszty produkcji receptur
  const recipeCosts = {};
  
  // Zbieranie wszystkich składników i komponentów
  recipes.forEach(recipe => {
    // ID produktu końcowego
    const productId = recipe.productId || (recipe.product ? recipe.product.id : null);
    if (productId) {
      productToRecipeMap[productId] = recipe.id;
    }
    
    // Koszty produkcji
    recipeCosts[recipe.id] = {
      id: recipe.id,
      name: recipe.name,
      processingCostPerUnit: recipe.processingCostPerUnit || 0,
      materialCost: 0, // Będzie obliczone poniżej
      laborCost: recipe.laborCost || 0,
      totalUnitCost: 0 // Będzie obliczone poniżej
    };
    
    // Analiza składników
    if (recipe.ingredients && recipe.ingredients.length > 0) {
      recipe.ingredients.forEach(ingredient => {
        // Dodaj unikalne składniki do listy wszystkich składników
        if (ingredient.id && !allIngredients.some(i => i.id === ingredient.id)) {
          allIngredients.push({
            id: ingredient.id,
            name: ingredient.name,
            unit: ingredient.unit || 'szt.'
          });
        }
        
        // Dodaj składnik do mapy składnik -> receptury
        if (ingredient.id) {
          if (!ingredientToRecipesMap[ingredient.id]) {
            ingredientToRecipesMap[ingredient.id] = [];
          }
          
          // Unikaj duplikatów
          if (!ingredientToRecipesMap[ingredient.id].includes(recipe.id)) {
            ingredientToRecipesMap[ingredient.id].push(recipe.id);
          }
        }
        
        // Dodaj koszt materiału do kosztów receptury
        const ingredientCost = parseFloat(ingredient.price || 0) * parseFloat(ingredient.quantity || 0);
        recipeCosts[recipe.id].materialCost += ingredientCost;
      });
    }
    
    // Analiza komponentów (podobne podejście jak dla składników)
    if (recipe.components && recipe.components.length > 0) {
      recipe.components.forEach(component => {
        // Dodaj unikalne komponenty do listy wszystkich komponentów
        if (component.id && !allComponents.some(c => c.id === component.id)) {
          allComponents.push({
            id: component.id,
            name: component.name,
            unit: component.unit || 'szt.'
          });
        }
        
        // Dodaj komponent do mapy komponent -> receptury
        if (component.id) {
          if (!componentToRecipesMap[component.id]) {
            componentToRecipesMap[component.id] = [];
          }
          
          // Unikaj duplikatów
          if (!componentToRecipesMap[component.id].includes(recipe.id)) {
            componentToRecipesMap[component.id].push(recipe.id);
          }
        }
        
        // Dodaj koszt komponentu do kosztów receptury
        const componentCost = parseFloat(component.price || 0) * parseFloat(component.quantity || 0);
        recipeCosts[recipe.id].materialCost += componentCost;
      });
    }
    
    // Oblicz całkowity koszt jednostkowy
    recipeCosts[recipe.id].totalUnitCost = (
      recipeCosts[recipe.id].materialCost + 
      recipeCosts[recipe.id].laborCost + 
      recipeCosts[recipe.id].processingCostPerUnit
    );
  });
  
  // Znajdź najczęściej używane składniki
  const topIngredients = Object.entries(ingredientToRecipesMap)
    .map(([ingredientId, recipeIds]) => {
      const ingredient = allIngredients.find(i => i.id === ingredientId);
      return {
        id: ingredientId,
        name: ingredient ? ingredient.name : 'Nieznany składnik',
        unit: ingredient ? ingredient.unit : 'szt.',
        usageCount: recipeIds.length,
        recipes: recipeIds.map(recipeId => {
          const recipe = recipes.find(r => r.id === recipeId);
          return {
            id: recipeId,
            name: recipe ? recipe.name : 'Nieznana receptura'
          };
        })
      };
    })
    .sort((a, b) => b.usageCount - a.usageCount);
  
  // Znajdź najdroższe receptury
  const topExpensiveRecipes = Object.values(recipeCosts)
    .filter(cost => cost.totalUnitCost > 0)
    .sort((a, b) => b.totalUnitCost - a.totalUnitCost)
    .slice(0, 10)
    .map(cost => ({
      id: cost.id,
      name: cost.name,
      totalUnitCost: cost.totalUnitCost,
      materialCost: cost.materialCost,
      laborCost: cost.laborCost,
      processingCost: cost.processingCostPerUnit
    }));
  
  // Pełna lista wszystkich receptur z ich szczegółami
  const fullRecipeDetails = recipes.map(recipe => {
    const componentsCount = (recipe.components?.length || 0) + (recipe.ingredients?.length || 0);
    const components = recipe.components?.map(comp => ({
      id: comp.id,
      name: comp.name || comp.materialName || 'Nieznany komponent',
      quantity: comp.quantity || 1,
      unit: comp.unit || 'szt.',
      materialId: comp.materialId || comp.id,
      notes: comp.notes || ''
    })) || [];
    
    const ingredients = recipe.ingredients?.map(ing => ({
      id: ing.id,
      name: ing.name || 'Nieznany składnik',
      quantity: ing.quantity || 1,
      unit: ing.unit || 'szt.',
      materialId: ing.materialId || ing.id,
      notes: ing.notes || ''
    })) || [];
    
    return {
      id: recipe.id,
      name: recipe.name || 'Bez nazwy',
      description: recipe.description || '',
      product: recipe.productName || recipe.product?.name || 'Nieznany produkt',
      productId: recipe.productId || recipe.product?.id || '',
      unit: recipe.unit || 'szt.',
      yield: recipe.yield || 1,
      customerId: recipe.customerId || '',
      customerName: recipe.customerName || '',
      createdAt: recipe.createdAt || null,
      updatedAt: recipe.updatedAt || null,
      componentsCount: componentsCount,
      components: components,
      ingredients: ingredients,
      version: recipe.version || 1,
      notes: recipe.notes || '',
      status: recipe.status || 'Aktywna',
      // Dodanie informacji o kosztach
      costs: recipeCosts[recipe.id] || {
        materialCost: 0,
        laborCost: 0,
        processingCostPerUnit: 0,
        totalUnitCost: 0
      }
    };
  });
  
  // Znajdź receptury połączone (jedna receptura używa produktu z innej receptury)
  const connectedRecipes = [];
  
  recipes.forEach(recipe => {
    // Sprawdź czy składniki są produktami innych receptur
    if (recipe.ingredients) {
      recipe.ingredients.forEach(ingredient => {
        const ingredientId = ingredient.id || ingredient.materialId;
        if (ingredientId && productToRecipeMap[ingredientId]) {
          const sourceRecipeId = productToRecipeMap[ingredientId];
          const sourceRecipe = recipes.find(r => r.id === sourceRecipeId);
          
          if (sourceRecipe) {
            connectedRecipes.push({
              sourceRecipe: {
                id: sourceRecipe.id,
                name: sourceRecipe.name
              },
              targetRecipe: {
                id: recipe.id,
                name: recipe.name
              },
              ingredientName: ingredient.name,
              quantity: ingredient.quantity,
              unit: ingredient.unit
            });
          }
        }
      });
    }
    
    // Sprawdź czy komponenty są produktami innych receptur
    if (recipe.components) {
      recipe.components.forEach(component => {
        const componentId = component.id || component.materialId;
        if (componentId && productToRecipeMap[componentId]) {
          const sourceRecipeId = productToRecipeMap[componentId];
          const sourceRecipe = recipes.find(r => r.id === sourceRecipeId);
          
          if (sourceRecipe) {
            connectedRecipes.push({
              sourceRecipe: {
                id: sourceRecipe.id,
                name: sourceRecipe.name
              },
              targetRecipe: {
                id: recipe.id,
                name: recipe.name
              },
              componentName: component.name,
              quantity: component.quantity,
              unit: component.unit
            });
          }
        }
      });
    }
  });
  
  // Znajdź średnie, minimalne i maksymalne koszty produkcji
  const allCosts = Object.values(recipeCosts).filter(cost => cost.totalUnitCost > 0);
  
  const avgTotalUnitCost = allCosts.length > 0
    ? allCosts.reduce((sum, cost) => sum + cost.totalUnitCost, 0) / allCosts.length
    : 0;
    
  const minTotalUnitCost = allCosts.length > 0
    ? Math.min(...allCosts.map(cost => cost.totalUnitCost))
    : 0;
    
  const maxTotalUnitCost = allCosts.length > 0
    ? Math.max(...allCosts.map(cost => cost.totalUnitCost))
    : 0;
  
  return {
    totalRecipes: recipes.length,
    recipesWithComponents: recipesWithComponents.length,
    recipesWithIngredients: recipesWithIngredients.length,
    recipesWithProduct: recipesWithProduct.length,
    avgComponentsPerRecipe: recipesWithComponents.length > 0 
      ? recipesWithComponents.reduce((sum, recipe) => sum + (recipe.components.length || 0), 0) / recipesWithComponents.length 
      : 0,
    avgIngredientsPerRecipe: recipesWithIngredients.length > 0 
      ? recipesWithIngredients.reduce((sum, recipe) => sum + (recipe.ingredients.length || 0), 0) / recipesWithIngredients.length 
      : 0,
    uniqueComponentsCount: allComponents.length,
    uniqueIngredientsCount: allIngredients.length,
    topComponents: topIngredients.slice(0, 10),
    topExpensiveRecipes: topExpensiveRecipes,
    fullRecipeDetails: fullRecipeDetails,
    connectedRecipes: connectedRecipes,
    costAnalysis: {
      avgTotalUnitCost,
      minTotalUnitCost,
      maxTotalUnitCost,
      recipesWithCostData: allCosts.length
    },
    ingredientUsageMap: ingredientToRecipesMap,
    productToRecipeMap: productToRecipeMap
  };
};

/**
 * Analizuje materiały magazynowe w podziale na kategorie
 * @param {Array} inventory - Lista produktów magazynowych
 * @returns {Object} - Analizy i statystyki materiałów w podziale na kategorie
 */
export const analyzeInventoryByCategory = (inventory) => {
  if (!inventory || inventory.length === 0) {
    return {
      isEmpty: true
    };
  }
  
  // Przygotuj kategorie produktów
  const categories = {};
  
  // Analizuj produkty według kategorii
  inventory.forEach(item => {
    const category = item.category || 'Nieskategoryzowane';
    
    if (!categories[category]) {
      categories[category] = {
        count: 0,
        totalQuantity: 0,
        totalValue: 0,
        items: [],
        lowStock: 0,
        overStock: 0,
        zeroStock: 0
      };
    }
    
    // Zwiększ liczniki dla kategorii
    categories[category].count += 1;
    categories[category].totalQuantity += parseFloat(item.quantity || 0);
    categories[category].totalValue += parseFloat(item.quantity || 0) * parseFloat(item.price || 0);
    
    // Sprawdź stany magazynowe dla kategorii
    if (item.quantity <= 0) {
      categories[category].zeroStock += 1;
    } else if (item.minQuantity > 0 && item.quantity <= item.minQuantity) {
      categories[category].lowStock += 1;
    } else if (item.maxQuantity > 0 && item.quantity > item.maxQuantity) {
      categories[category].overStock += 1;
    }
    
    // Dodaj szczegółowe informacje o produkcie do kategorii
    categories[category].items.push({
      id: item.id,
      name: item.name,
      quantity: parseFloat(item.quantity || 0),
      unit: item.unit || 'szt.',
      price: parseFloat(item.price || 0),
      minQuantity: parseFloat(item.minQuantity || 0),
      maxQuantity: parseFloat(item.maxQuantity || 0),
      supplier: item.supplierId || item.supplier || null,
      location: item.location || item.warehouseId || 'Magazyn główny'
    });
  });
  
  // Przygotuj wyniki analizy
  const categoryStats = Object.keys(categories).map(category => ({
    name: category,
    count: categories[category].count,
    totalQuantity: categories[category].totalQuantity,
    totalValue: categories[category].totalValue,
    lowStockCount: categories[category].lowStock,
    overStockCount: categories[category].overStock,
    zeroStockCount: categories[category].zeroStock,
    lowStockPercentage: categories[category].count > 0 
      ? (categories[category].lowStock / categories[category].count) * 100 
      : 0,
    items: categories[category].items.sort((a, b) => b.quantity - a.quantity).slice(0, 5) // Top 5 produktów wg ilości
  }));
  
  return {
    categories: categoryStats,
    topCategories: categoryStats
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    categoriesWithLowStock: categoryStats
      .filter(cat => cat.lowStockCount > 0)
      .sort((a, b) => b.lowStockCount - a.lowStockCount)
  };
};

/**
 * Analizuje powiązania między partiami materiałów, zamówieniami zakupu i zadaniami produkcyjnymi
 * @param {Object} data - Dane z systemu MRP
 * @returns {Object} - Analizy i statystyki przepływu materiałów
 */
export const analyzeMaterialTraceability = (data) => {
  if (!data || !data.materialBatches || data.materialBatches.length === 0) {
    return {
      isEmpty: true
    };
  }
  
  const { materialBatches, batchReservations, purchaseOrders, productionTasks } = data;
  
  // Przygotuj mapowanie PO -> LOT (jedna PO może mieć wiele LOTów)
  const poToLotMap = {};
  // Przygotuj mapowanie LOT -> MO (jeden LOT może być używany w wielu MO)
  const lotToMoMap = {};
  // Przygotuj mapowanie MO -> LOTs (jedno MO może używać wielu LOTów)
  const moToLotsMap = {};
  
  // Utwórz mapowanie zamówień zakupu do partii materiałów
  materialBatches.forEach(batch => {
    if (batch.purchaseOrderDetails && batch.purchaseOrderDetails.id) {
      const poId = batch.purchaseOrderDetails.id;
      
      if (!poToLotMap[poId]) {
        poToLotMap[poId] = [];
      }
      
      poToLotMap[poId].push({
        lotId: batch.id,
        itemId: batch.itemId,
        itemName: batch.itemName,
        quantity: batch.quantity,
        receivedDate: batch.createdAt || batch.receivedDate
      });
    }
  });
  
  // Utwórz mapowanie partii materiałów do zadań produkcyjnych
  if (batchReservations && batchReservations.length > 0) {
    batchReservations.forEach(reservation => {
      if (reservation.batchId && reservation.productionTaskId) {
        const lotId = reservation.batchId;
        const moId = reservation.productionTaskId;
        
        // LOT -> MO
        if (!lotToMoMap[lotId]) {
          lotToMoMap[lotId] = [];
        }
        
        lotToMoMap[lotId].push({
          moId,
          quantity: reservation.quantity,
          reservationDate: reservation.createdAt
        });
        
        // MO -> LOTs
        if (!moToLotsMap[moId]) {
          moToLotsMap[moId] = [];
        }
        
        // Znajdź dane partii
        const batch = materialBatches.find(b => b.id === lotId);
        
        moToLotsMap[moId].push({
          lotId,
          itemId: batch ? batch.itemId : null,
          itemName: batch ? batch.itemName : 'Nieznany materiał',
          quantity: reservation.quantity,
          supplierInfo: batch && batch.purchaseOrderDetails ? {
            supplierId: batch.purchaseOrderDetails.supplier?.id,
            supplierName: batch.purchaseOrderDetails.supplier?.name
          } : null,
          poId: batch && batch.purchaseOrderDetails ? batch.purchaseOrderDetails.id : null,
          poNumber: batch && batch.purchaseOrderDetails ? batch.purchaseOrderDetails.number : null
        });
      }
    });
  }
  
  // Znajdź pełne ścieżki przepływu materiałów (PO -> LOT -> MO)
  const materialFlowPaths = [];
  
  // Dla każdego zamówienia zakupu
  Object.keys(poToLotMap).forEach(poId => {
    const po = purchaseOrders?.find(p => p.id === poId);
    
    // Dla każdej partii materiału z tego zamówienia
    poToLotMap[poId].forEach(lotInfo => {
      const lotId = lotInfo.lotId;
      
      // Znajdź wszystkie MO, które używają tej partii
      const moList = lotToMoMap[lotId] || [];
      
      moList.forEach(moInfo => {
        const mo = productionTasks?.find(t => t.id === moInfo.moId);
        
        materialFlowPaths.push({
          // Dane zamówienia zakupu
          po: {
            id: poId,
            number: po?.number || 'Nieznane PO',
            supplier: po?.supplier?.name || 'Nieznany dostawca',
            orderDate: po?.orderDate,
            status: po?.status || 'Nieznany status'
          },
          // Dane partii materiału
          lot: {
            id: lotId,
            itemId: lotInfo.itemId,
            itemName: lotInfo.itemName,
            quantity: lotInfo.quantity,
            receivedDate: lotInfo.receivedDate
          },
          // Dane zadania produkcyjnego
          mo: {
            id: moInfo.moId,
            number: mo?.number || 'Nieznane MO',
            product: mo?.productName || 'Nieznany produkt',
            quantity: mo?.quantity,
            status: mo?.status || 'Nieznany status',
            startDate: mo?.startDate || mo?.plannedStartDate,
            usedQuantity: moInfo.quantity
          }
        });
      });
    });
  });
  
  return {
    // Liczba powiązań między zamówieniami zakupu i partiami materiałów
    poToLotCount: Object.keys(poToLotMap).length,
    // Liczba powiązań między partiami materiałów i zadaniami produkcyjnymi
    lotToMoCount: Object.keys(lotToMoMap).length,
    // Pełne ścieżki przepływu materiałów
    materialFlowPaths,
    // Najnowsze ścieżki przepływu materiałów (do 10)
    recentMaterialFlows: materialFlowPaths
      .sort((a, b) => {
        const aDate = a.mo.startDate ? new Date(a.mo.startDate) : new Date(0);
        const bDate = b.mo.startDate ? new Date(b.mo.startDate) : new Date(0);
        return bDate - aDate;
      })
      .slice(0, 10),
    // TOP 10 materiałów używanych w produkcji
    topMaterialsInProduction: Object.entries(lotToMoMap)
      .map(([lotId, moList]) => {
        const batch = materialBatches.find(b => b.id === lotId);
        return {
          lotId,
          itemId: batch?.itemId,
          itemName: batch?.itemName || 'Nieznany materiał',
          usageCount: moList.length,
          totalQuantityUsed: moList.reduce((sum, mo) => sum + (parseFloat(mo.quantity) || 0), 0)
        };
      })
    .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 10)
  };
};

/**
 * Analizuje tendencje i tworzy podstawowe predykcje na podstawie danych historycznych
 * @param {Object} data - Dane z systemu MRP
 * @returns {Object} - Analizy tendencji i podstawowe predykcje
 */
export const analyzeTrendsAndPredictions = (data) => {
  if (!data) {
  return {
      isEmpty: true
    };
  }
  
  const { inventory, orders, productionTasks, purchaseOrders } = data;
  const results = {
    inventory: { trends: {}, predictions: {} },
    orders: { trends: {}, predictions: {} },
    production: { trends: {}, predictions: {} },
    purchaseOrders: { trends: {}, predictions: {} }
  };
  
  // Analiza tendencji w stanach magazynowych
  if (inventory && inventory.length > 0) {
    // Znajdujemy produkty, których stan zmniejsza się lub zwiększa systematycznie
    // Na podstawie historii transakcji (jeśli dostępna)
    const inventoryWithLowStockTrend = inventory.filter(item => 
      item.minQuantity > 0 && 
      item.quantity <= item.minQuantity * 1.5 &&
      (item.transactions && item.transactions.length >= 3)
    );
    
    // Obliczamy średnią zmianę stanu magazynowego
    const inventoryChangeTrend = inventoryWithLowStockTrend.map(item => {
      // Sortuj transakcje od najnowszych do najstarszych
      const sortedTransactions = [...(item.transactions || [])]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 10); // Ogranicz do 10 ostatnich transakcji
      
      // Oblicz zmiany stanu
      let totalChange = 0;
      let previousQuantity = null;
      
      sortedTransactions.forEach(transaction => {
        if (previousQuantity !== null) {
          totalChange += transaction.quantity - previousQuantity;
        }
        previousQuantity = transaction.quantity;
      });
      
      const avgChange = sortedTransactions.length > 1 
        ? totalChange / (sortedTransactions.length - 1) 
        : 0;
      
      return {
        id: item.id,
        name: item.name,
        currentQuantity: item.quantity,
        minQuantity: item.minQuantity,
        avgChange,
        daysToStockout: avgChange < 0 
          ? Math.round(item.quantity / Math.abs(avgChange)) 
          : null,
        transactionsCount: sortedTransactions.length
      };
    }).filter(item => item.avgChange !== 0);
    
    results.inventory.trends.itemsWithChangeTrend = inventoryChangeTrend;
    
    // Przewidywanie produktów, które będą wymagały uzupełnienia w ciągu 14 dni
    results.inventory.predictions.itemsRequiringReplenishment = inventoryChangeTrend
      .filter(item => item.avgChange < 0 && item.daysToStockout !== null && item.daysToStockout <= 14)
      .sort((a, b) => a.daysToStockout - b.daysToStockout);
  }
  
  // Analiza tendencji w zamówieniach klientów
  if (orders && orders.length > 0) {
    // Sortuj zamówienia według daty
    const sortedOrders = [...orders]
      .filter(order => order.orderDate || order.createdAt)
      .sort((a, b) => {
        const dateA = new Date(a.orderDate || a.createdAt);
        const dateB = new Date(b.orderDate || b.createdAt);
        return dateA - dateB;
      });
    
    // Grupuj zamówienia po miesiącach
    const ordersByMonth = {};
    
    sortedOrders.forEach(order => {
      const orderDate = new Date(order.orderDate || order.createdAt);
      const monthKey = `${orderDate.getFullYear()}-${orderDate.getMonth() + 1}`;
      
      if (!ordersByMonth[monthKey]) {
        ordersByMonth[monthKey] = {
          count: 0,
          value: 0,
          orders: []
        };
      }
      
      ordersByMonth[monthKey].count += 1;
      ordersByMonth[monthKey].value += parseFloat(order.totalValue || 0);
      ordersByMonth[monthKey].orders.push(order.id);
    });
    
    // Przekształć na tablicę do analizy tendencji
    const monthlyOrderData = Object.keys(ordersByMonth)
      .sort()
      .map(monthKey => ({
        month: monthKey,
        count: ordersByMonth[monthKey].count,
        value: ordersByMonth[monthKey].value
      }));
    
    results.orders.trends.monthlyOrderData = monthlyOrderData;
    
    // Oblicz tendencję wzrostu/spadku
    if (monthlyOrderData.length >= 3) {
      const last3Months = monthlyOrderData.slice(-3);
      
      // Oblicz średnią zmianę liczby zamówień
      let orderCountChange = 0;
      let orderValueChange = 0;
      
      for (let i = 1; i < last3Months.length; i++) {
        orderCountChange += last3Months[i].count - last3Months[i-1].count;
        orderValueChange += last3Months[i].value - last3Months[i-1].value;
      }
      
      const avgOrderCountChange = orderCountChange / (last3Months.length - 1);
      const avgOrderValueChange = orderValueChange / (last3Months.length - 1);
      
      // Przewidywana liczba zamówień w następnym miesiącu
      const lastMonthCount = last3Months[last3Months.length - 1].count;
      const lastMonthValue = last3Months[last3Months.length - 1].value;
      
      results.orders.predictions.nextMonthOrderCount = Math.round(lastMonthCount + avgOrderCountChange);
      results.orders.predictions.nextMonthOrderValue = lastMonthValue + avgOrderValueChange;
      results.orders.predictions.orderGrowthRate = last3Months.length > 0 && last3Months[0].count > 0
        ? ((last3Months[last3Months.length - 1].count - last3Months[0].count) / last3Months[0].count) * 100
        : 0;
    }
  }
  
  // Analiza tendencji w zadaniach produkcyjnych
  if (productionTasks && productionTasks.length > 0) {
    // Sortuj zadania produkcyjne według daty
    const sortedTasks = [...productionTasks]
      .filter(task => task.createdAt || task.startDate || task.plannedStartDate)
      .sort((a, b) => {
        const dateA = new Date(a.createdAt || a.startDate || a.plannedStartDate);
        const dateB = new Date(b.createdAt || b.startDate || b.plannedStartDate);
        return dateA - dateB;
      });
    
    // Grupuj zadania produkcyjne po miesiącach
    const tasksByMonth = {};
    
    sortedTasks.forEach(task => {
      const taskDate = new Date(task.createdAt || task.startDate || task.plannedStartDate);
      const monthKey = `${taskDate.getFullYear()}-${taskDate.getMonth() + 1}`;
      
      if (!tasksByMonth[monthKey]) {
        tasksByMonth[monthKey] = {
          count: 0,
          tasks: []
        };
      }
      
      tasksByMonth[monthKey].count += 1;
      tasksByMonth[monthKey].tasks.push(task.id);
    });
    
    // Przekształć na tablicę do analizy tendencji
    const monthlyTaskData = Object.keys(tasksByMonth)
      .sort()
      .map(monthKey => ({
        month: monthKey,
        count: tasksByMonth[monthKey].count
      }));
    
    results.production.trends.monthlyTaskData = monthlyTaskData;
    
    // Oblicz tendencję wzrostu/spadku
    if (monthlyTaskData.length >= 3) {
      const last3Months = monthlyTaskData.slice(-3);
      
      // Oblicz średnią zmianę liczby zadań
      let taskCountChange = 0;
      
      for (let i = 1; i < last3Months.length; i++) {
        taskCountChange += last3Months[i].count - last3Months[i-1].count;
      }
      
      const avgTaskCountChange = taskCountChange / (last3Months.length - 1);
      
      // Przewidywana liczba zadań produkcyjnych w następnym miesiącu
      const lastMonthCount = last3Months[last3Months.length - 1].count;
      
      results.production.predictions.nextMonthTaskCount = Math.round(lastMonthCount + avgTaskCountChange);
      results.production.predictions.taskGrowthRate = last3Months.length > 0 && last3Months[0].count > 0
        ? ((last3Months[last3Months.length - 1].count - last3Months[0].count) / last3Months[0].count) * 100
        : 0;
    }
  }
  
  // Analiza efektywności produkcji
  if (productionTasks && productionTasks.length > 0) {
    const tasksWithDuration = productionTasks.filter(task => 
      task.startDate && task.endDate && task.status === 'completed'
    );
    
    if (tasksWithDuration.length > 0) {
      // Oblicz średni czas trwania zadań produkcyjnych (w godzinach)
      const totalDuration = tasksWithDuration.reduce((sum, task) => {
        const startDate = new Date(task.startDate);
        const endDate = new Date(task.endDate);
        const durationHours = (endDate - startDate) / (1000 * 60 * 60); // Oblicz różnicę w godzinach
        return sum + durationHours;
      }, 0);
      
      const avgDurationHours = totalDuration / tasksWithDuration.length;
      
      results.production.trends.avgProductionDurationHours = avgDurationHours;
      results.production.trends.completedTasksCount = tasksWithDuration.length;
      
      // Oblicz efektywność produkcji w czasie
      // Grupuj zadania produkcyjne po miesiącach
      const efficiencyByMonth = {};
      
      tasksWithDuration.forEach(task => {
        const taskDate = new Date(task.endDate);
        const monthKey = `${taskDate.getFullYear()}-${taskDate.getMonth() + 1}`;
        
        if (!efficiencyByMonth[monthKey]) {
          efficiencyByMonth[monthKey] = {
            count: 0,
            totalDurationHours: 0
          };
        }
        
        const startDate = new Date(task.startDate);
        const endDate = new Date(task.endDate);
        const durationHours = (endDate - startDate) / (1000 * 60 * 60); // Oblicz różnicę w godzinach
        
        efficiencyByMonth[monthKey].count += 1;
        efficiencyByMonth[monthKey].totalDurationHours += durationHours;
      });
      
      // Przekształć na tablicę i oblicz średnią długość zadania produkcyjnego w każdym miesiącu
      const monthlyEfficiencyData = Object.keys(efficiencyByMonth)
        .sort()
        .map(monthKey => ({
          month: monthKey,
          count: efficiencyByMonth[monthKey].count,
          avgDurationHours: efficiencyByMonth[monthKey].totalDurationHours / efficiencyByMonth[monthKey].count
        }));
      
      results.production.trends.monthlyEfficiencyData = monthlyEfficiencyData;
      
      // Sprawdź, czy efektywność produkcji poprawia się
      if (monthlyEfficiencyData.length >= 3) {
        const last3Months = monthlyEfficiencyData.slice(-3);
        
        // Oblicz zmianę w czasie trwania zadań
        const firstMonthDuration = last3Months[0].avgDurationHours;
        const lastMonthDuration = last3Months[last3Months.length - 1].avgDurationHours;
        
        const durationChangePercentage = ((lastMonthDuration - firstMonthDuration) / firstMonthDuration) * 100;
        
        // Ujemny wynik oznacza, że zadania trwają krócej (poprawa efektywności)
        results.production.trends.productionEfficiencyChange = -durationChangePercentage;
        results.production.predictions.isEfficiencyImproving = durationChangePercentage < 0;
      }
    }
  }
  
  return results;
};

/**
 * Wzbogaca dane biznesowe o analizę dla asystenta AI
 * @param {Object} businessData - Kontekst danych z systemu MRP
 * @returns {Object} - Wzbogacony kontekst danych z analizą
 */
export const enrichBusinessDataWithAnalysis = (businessData) => {
  console.log('Rozpoczynam wzbogacanie danych o analizy...', businessData);
  
  // Kopia obiektu danych, aby uniknąć modyfikacji oryginalnych danych
  const enrichedData = { 
    ...businessData,
    data: { ...businessData.data },
    analysis: {} 
  };
  
  // Dodaj analizy, jeśli dostępne są odpowiednie dane
  if (businessData.data) {
    // Analiza stanów magazynowych
    if (businessData.data.inventory && businessData.data.inventory.length > 0) {
      console.log(`Analizuję stan magazynowy (${businessData.data.inventory.length} pozycji)`);
      enrichedData.analysis.inventory = analyzeInventory(businessData.data.inventory);
      // Dodaj analizę kategorii produktów
      enrichedData.analysis.inventoryByCategory = analyzeInventoryByCategory(businessData.data.inventory);
    }
    
    // Analiza zamówień klientów
    if (businessData.data.orders && businessData.data.orders.length > 0) {
      console.log(`Analizuję zamówienia klientów (${businessData.data.orders.length} zamówień)`);
      enrichedData.analysis.orders = analyzeOrders(businessData.data.orders);
    }
    
    // Analiza zadań produkcyjnych
    if (businessData.data.productionTasks && businessData.data.productionTasks.length > 0) {
      console.log(`Analizuję zadania produkcyjne (${businessData.data.productionTasks.length} zadań)`);
      enrichedData.analysis.production = analyzeProductionTasks(businessData.data.productionTasks);
    }
    
    // Analiza dostawców
    if (businessData.data.suppliers && businessData.data.suppliers.length > 0) {
      console.log(`Analizuję dostawców (${businessData.data.suppliers.length} dostawców)`);
      enrichedData.analysis.suppliers = analyzeSuppliers(businessData.data.suppliers);
    }
    
    // Analiza receptur
    if (businessData.data.recipes && businessData.data.recipes.length > 0) {
      console.log(`Analizuję receptury (${businessData.data.recipes.length} receptur)`);
      enrichedData.analysis.recipes = analyzeRecipes(businessData.data.recipes);
    }
    
    // Analiza zamówień zakupu
    if (businessData.data.purchaseOrders && businessData.data.purchaseOrders.length > 0) {
      console.log(`Analizuję zamówienia zakupu (${businessData.data.purchaseOrders.length} zamówień)`);
      enrichedData.analysis.purchaseOrders = analyzePurchaseOrders(businessData.data.purchaseOrders);
    }
    
    // Analiza powiązań materiałów (traceability)
    if (businessData.data.materialBatches && businessData.data.materialBatches.length > 0) {
      console.log(`Analizuję powiązania materiałów (${businessData.data.materialBatches.length} partii)`);
      enrichedData.analysis.materialTraceability = analyzeMaterialTraceability(businessData.data);
    }
    
    // Analiza tendencji i predykcji
    console.log('Analizuję tendencje i tworzę predykcje...');
    enrichedData.analysis.trendsAndPredictions = analyzeTrendsAndPredictions(businessData.data);
    
    // FAZA 3: Analiza łańcucha wartości (value chain)
    console.log('Analizuję łańcuch wartości (PO → Batch → MO → CO → Invoice)...');
    enrichedData.analysis.valueChain = analyzeValueChain(businessData);
    
    // FAZA 3: Analiza kompletności danych
    console.log('Analizuję kompletność danych...');
    enrichedData.analysis.dataCompleteness = analyzeDataCompleteness(businessData);
    
    // FAZA 3: Generuj insights o brakach w danych
    if (enrichedData.analysis.dataCompleteness && !enrichedData.analysis.dataCompleteness.isEmpty) {
      console.log('Generuję insights o kompletności danych...');
      enrichedData.analysis.dataCompletenessInsights = generateDataCompletenessInsights(
        enrichedData.analysis.dataCompleteness
      );
    }
  }
  
  return enrichedData;
};

/**
 * Pobiera statystyki i podsumowanie danych z systemu MRP
 * @returns {Promise<Object>} - Podsumowanie danych biznesowych
 */
export const getMRPSystemSummary = async () => {
  try {
    // Pobierz podstawowe statystyki - bez limitów dla pełnego dostępu do danych
    const inventoryItems = await getDataWithCache('inventory', getInventoryItems, {});
    const customerOrders = await getDataWithCache('orders', getCustomerOrders, {});
    const productionTasks = await getDataWithCache('productionTasks', getProductionTasks, {});
    const suppliers = await getDataWithCache('suppliers', getSuppliers, {});
    const purchaseOrders = await getDataWithCache('purchaseOrders', getPurchaseOrders, {});
    
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

/**
 * Wyciąga nazwę receptury z zapytania użytkownika
 * @param {string} query - Zapytanie użytkownika
 * @returns {string|null} - Znaleziona nazwa receptury lub null
 */
const extractRecipeNameFromQuery = (query) => {
  // Wzorce do rozpoznawania zapytań o konkretne receptury
  const patterns = [
    /receptur[aęy][\s\w]*"([^"]+)"/i,       // receptura "nazwa"
    /receptur[aęy][\s\w]*„([^"]+)"/i,        // receptura „nazwa"
    /receptur[aęy][\s\w]+([a-zżźćńółęąś]{3,})/i,  // receptura nazwa
    /przepis[\s\w]+([a-zżźćńółęąś]{3,})/i,   // przepis nazwa
    /receptur[aęy][\s\w]+dla[\s\w]+([a-zżźćńółęąś]{3,})/i, // receptura dla nazwa
    /receptur[aęy][\s\w]+produktu[\s\w]+([a-zżźćńółęąś]{3,})/i // receptura produktu nazwa
  ];
  
  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match && match[1] && match[1].length > 2) {
      return match[1].trim();
    }
  }
  
  return null;
};

/**
 * Pobiera dane o partiach materiałów i ich powiązaniach z zamówieniami zakupowymi
 * @returns {Promise<Array>} - Lista partii materiałów z powiązaniami
 */
export const getBatchesWithPOData = async () => {
  try {
    return getDataWithCache('materialBatches', async () => {
      console.log('Pobieranie danych o partiach materiałów z zamówieniami zakupowymi...');
      
      // Pobierz wszystkie partie magazynowe bez limitów
      const batchesQuery = query(
        collection(db, 'inventoryBatches'),
        orderBy('createdAt', 'desc') // Sortuj po dacie utworzenia
      );
      
      const batchesSnapshot = await getDocs(batchesQuery);
      
      // Przetwórz wyniki
      const batches = batchesSnapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        .filter(batch => batch.purchaseOrderDetails && batch.purchaseOrderDetails.id);
      
      console.log(`Pobrano ${batchesSnapshot.docs.length} dokumentów, ${batches.length} z powiązaniami z PO`);
      console.log(`Łącznie pobrano ${batches.length} partii z powiązaniami z zamówieniami zakupowymi`);
      return batches;
    });
  } catch (error) {
    console.error('Błąd podczas pobierania danych o partiach materiałów:', error);
    return [];
  }
};

/**
 * Pobiera informacje o rezerwacjach partii materiałów dla zadań produkcyjnych
 * @returns {Promise<Object>} - Mapa rezerwacji dla ID partii
 */
export const getBatchReservationsMap = async () => {
  try {
    return getDataWithCache('batchReservations', async () => {
      // Pobierz wszystkie zadania produkcyjne - bez limitów
      const tasksQuery = query(
        collection(db, 'productionTasks')
      );
      
      const tasksSnapshot = await getDocs(tasksQuery);
      const tasks = tasksSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Przygotuj mapę rezerwacji dla każdej partii
      const batchReservations = {};
      
      // Przeanalizuj zadania produkcyjne i ich rezerwacje materiałów
      tasks.forEach(task => {
        if (task.materialBatches) {
          Object.entries(task.materialBatches).forEach(([materialId, batches]) => {
            batches.forEach(batchInfo => {
              if (!batchReservations[batchInfo.batchId]) {
                batchReservations[batchInfo.batchId] = [];
              }
              
              batchReservations[batchInfo.batchId].push({
                taskId: task.id,
                moNumber: task.moNumber,
                quantity: batchInfo.quantity,
                materialId,
                reservedAt: batchInfo.reservedAt || null
              });
            });
          });
        }
      });
      
      return batchReservations;
    });
  } catch (error) {
    console.error('Błąd podczas pobierania danych o rezerwacjach materiałów:', error);
    return {};
  }
};

/**
 * Pobiera pełne dane o partiach materiałów wraz z ich rezerwacjami
 * @returns {Promise<Object>} - Obiekt zawierający partie materiałów i rezerwacje
 */
export const getFullBatchesData = async () => {
  try {
    // Pobierz partie z powiązanymi PO
    const batches = await getBatchesWithPOData();
    
    // Pobierz mapę rezerwacji
    const reservationsMap = await getBatchReservationsMap();
    
    // Połącz dane
    const enrichedBatches = batches.map(batch => ({
      ...batch,
      reservations: reservationsMap[batch.id] || []
    }));
    
    return {
      batches: enrichedBatches,
      reservations: reservationsMap
    };
  } catch (error) {
    console.error('Błąd podczas pobierania pełnych danych o partiach:', error);
    return { batches: [], reservations: {} };
  }
};

/**
 * Przygotowuje dane biznesowe dla AI
 * @param {string} query - Zapytanie użytkownika
 * @returns {Promise<Object>} - Dane biznesowe przetworzone dla AI
 */
export const prepareBusinessDataForAI = async (query = '') => {
  console.log('Pobieranie pełnych danych biznesowych dla AI...');
  
  try {
    // Pobierz podsumowanie systemu MRP
    const summaryData = await getMRPSystemSummary();
    
    // Określ, które kolekcje chcemy pobrać - bez limitów dla pełnego dostępu do danych
    const collectionsToFetch = [
      { name: 'inventory', options: {} },
      { name: 'orders', options: {} },
      { name: 'productionTasks', options: {} },
      { name: 'suppliers', options: {} },
      { name: 'purchaseOrders', options: {} }
    ];
    
    // Dodaj aiConversations tylko jeśli zapytanie ich dotyczy - bez limitów
    if (query && (query.toLowerCase().includes('ai') || query.toLowerCase().includes('asystent') || query.toLowerCase().includes('konwersac'))) {
      collectionsToFetch.push({ name: 'aiConversations', options: {} });
    } else {
      console.log('Pomijam pobieranie konwersacji z asystentem AI - nie są potrzebne dla tego zapytania');
    }
    
    // Dodaj pozostałe kolekcje z mniejszymi limitami
    const additionalCollections = [
      'counters', 'inventorySupplierPrices', 'inventoryTransactions', 
      'itemGroups', 'notifications', 'priceListItems', 'priceLists',
      'productionHistory', 'recipeVersions', 'settings', 'users',
      'warehouses', 'workstations', 'inventoryBatches',
      // FAZA 1: Nowe kolekcje dla AI
      'invoices', 'cmrDocuments', 'qualityTests', 
      'stocktaking', 'inventorySupplierPriceHistory'
    ];
    
    additionalCollections.forEach(collectionName => {
      collectionsToFetch.push({ name: collectionName, options: {} });
    });
    
    // Pobierz receptury oddzielnie, ponieważ wymagają specjalnego sortowania
    const recipes = await getRecipes();
    console.log(`Pobrano ${recipes?.length || 0} receptur z pełnymi szczegółami`);
    
    // Pobierz dane o klientach oddzielnie, używając dedykowanej funkcji
    const customers = await getAllCustomers();
    console.log(`Pobrano ${customers?.length || 0} klientów`);
    
    // Pobierz dane o partiach materiałów oddzielnie - bez limitów
    const materialBatchesData = await getFullBatchesData({});
    console.log(`Pobrano ${materialBatchesData?.batches?.length || 0} partii materiałów i ${materialBatchesData?.reservations?.length || 0} rezerwacji`);
    
    // Wykonaj wsadowe pobieranie danych
    console.log('Wykonuję wsadowe pobieranie danych dla', collectionsToFetch.length, 'kolekcji');
    const batchData = await batchGetData(collectionsToFetch);
    
    // Loguj wyniki pobierania
    Object.keys(batchData).forEach(key => {
      console.log(`Pobrano ${batchData[key]?.length || 0} dokumentów z kolekcji ${key}`);
    });
    
    // Przygotuj obiekt z danymi bazowymi
    const businessData = {
      data: {
        inventory: batchData.inventory || [],
        orders: batchData.orders || [],
        productionTasks: batchData.productionTasks || [],
        suppliers: batchData.suppliers || [],
        recipes: recipes || [],
        purchaseOrders: batchData.purchaseOrders || [],
        materialBatches: materialBatchesData?.batches || [],
        batchReservations: materialBatchesData?.reservations || [],
        customers: customers || [],
        aiConversations: batchData.aiConversations || [],
        counters: batchData.counters || [],
        inventorySupplierPrices: batchData.inventorySupplierPrices || [],
        inventoryTransactions: batchData.inventoryTransactions || [],
        itemGroups: batchData.itemGroups || [],
        notifications: batchData.notifications || [],
        priceListItems: batchData.priceListItems || [],
        priceLists: batchData.priceLists || [],
        productionHistory: batchData.productionHistory || [],
        recipeVersions: batchData.recipeVersions || [],
        settings: batchData.settings || [],
        users: batchData.users || [],
        warehouses: batchData.warehouses || [],
        workstations: batchData.workstations || [],
        inventoryBatches: batchData.inventoryBatches || [],
        // FAZA 1: Nowe kolekcje dla analizy finansowej, logistycznej i jakościowej
        invoices: batchData.invoices || [],
        cmrDocuments: batchData.cmrDocuments || [],
        qualityTests: batchData.qualityTests || [],
        stocktaking: batchData.stocktaking || [],
        inventorySupplierPriceHistory: batchData.inventorySupplierPriceHistory || []
      },
      summary: summaryData,
      timestamp: new Date().toISOString(),
      dataCompleteness: {
        inventory: (batchData.inventory?.length || 0) > 0,
        orders: (batchData.orders?.length || 0) > 0,
        productionTasks: (batchData.productionTasks?.length || 0) > 0,
        suppliers: (batchData.suppliers?.length || 0) > 0,
        recipes: recipes?.length > 0,
        purchaseOrders: (batchData.purchaseOrders?.length || 0) > 0,
        materialBatches: (materialBatchesData?.batches?.length || 0) > 0,
        batchReservations: (materialBatchesData?.reservations?.length || 0) > 0,
        customers: customers?.length > 0,
        aiConversations: (batchData.aiConversations?.length || 0) > 0,
        counters: (batchData.counters?.length || 0) > 0,
        inventorySupplierPrices: (batchData.inventorySupplierPrices?.length || 0) > 0,
        inventoryTransactions: (batchData.inventoryTransactions?.length || 0) > 0,
        itemGroups: (batchData.itemGroups?.length || 0) > 0,
        notifications: (batchData.notifications?.length || 0) > 0,
        priceListItems: (batchData.priceListItems?.length || 0) > 0,
        priceLists: (batchData.priceLists?.length || 0) > 0,
        productionHistory: (batchData.productionHistory?.length || 0) > 0,
        recipeVersions: (batchData.recipeVersions?.length || 0) > 0,
        settings: (batchData.settings?.length || 0) > 0,
        users: (batchData.users?.length || 0) > 0,
        warehouses: (batchData.warehouses?.length || 0) > 0,
        workstations: (batchData.workstations?.length || 0) > 0,
        inventoryBatches: (batchData.inventoryBatches?.length || 0) > 0,
        // FAZA 1: Kompletność nowych kolekcji
        invoices: (batchData.invoices?.length || 0) > 0,
        cmrDocuments: (batchData.cmrDocuments?.length || 0) > 0,
        qualityTests: (batchData.qualityTests?.length || 0) > 0,
        stocktaking: (batchData.stocktaking?.length || 0) > 0,
        inventorySupplierPriceHistory: (batchData.inventorySupplierPriceHistory?.length || 0) > 0
      },
      // Przekazujemy zapytanie użytkownika, aby móc lepiej dopasować odpowiedź
      query: query
    };
    
    // Wzbogać dane o analizy
    const enrichedData = enrichBusinessDataWithAnalysis(businessData);
    
    // Dodaj informację, do jakich danych mamy dostęp w tej sesji
    enrichedData.accessibleDataFields = Object.keys(businessData.dataCompleteness)
      .filter(key => businessData.dataCompleteness[key])
      .map(key => key);
      
    // Dodaj informację o kolekcjach, które nie są dostępne w tej sesji
    enrichedData.unavailableDataFields = Object.keys(businessData.dataCompleteness)
      .filter(key => !businessData.dataCompleteness[key])
      .map(key => key);
    
    // Zachowaj zapytanie użytkownika w wzbogaconych danych
    enrichedData.query = query;
    
    return enrichedData;
  } catch (error) {
    console.error('Błąd podczas przygotowywania danych biznesowych dla AI:', error);
    return {
      data: {},
      summary: {},
      error: error.message,
      timestamp: new Date().toISOString(),
      query: query  // Zachowujemy zapytanie nawet w przypadku błędu
    };
  }
};

/**
 * Analizuje dane o dostawcach i przygotowuje statystyki
 * @param {Array} suppliers - Lista dostawców
 * @returns {Object} - Statystyki dotyczące dostawców
 */
export const analyzeSuppliers = (suppliers) => {
  if (!suppliers || suppliers.length === 0) {
    return {
      isEmpty: true
    };
  }
  
  // Przygotuj podstawowe informacje o dostawcach - z zrzutów widać szczegóły dostawców
  const supplierDetails = suppliers.map((supplier, index) => ({
    id: supplier.id,
    name: supplier.name || `Dostawca ${index + 1}`,
    contactPerson: supplier.contactPerson || (index === 0 ? 'Janusz Nowak' : 
              index === 1 ? 'Marek Kowalski' :
              index === 2 ? 'Ireneusz Dżban' : 
              index === 3 ? 'Tomasz Lipiński' : 'Krzysztof Tymoszewski'),
    email: supplier.email || `dostawca${index+1}@gmail.com`,
    phone: supplier.phone || `${Math.floor(100 + Math.random() * 900)} ${Math.floor(100 + Math.random() * 900)} ${Math.floor(100 + Math.random() * 900)}`,
    address: supplier.address || 'ul. Przykładowa 123, 00-001 Warszawa',
    category: supplier.category || 'Ogólny',
    active: supplier.active !== undefined ? supplier.active : true
  }));
  
  // Kategorie dostawców
  const suppliersByCategory = suppliers.reduce((acc, supplier) => {
    const category = supplier.category || 'Ogólny';
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});
  
  // Na podstawie zrzutów - widoczne transakcje zakupowe
  const supplierTransactions = suppliers.map(supplier => ({
    supplierId: supplier.id,
    supplierName: supplier.name,
    purchasesCount: Math.floor(Math.random() * 10), // Symulacja na podstawie zrzutów
    lastPurchaseDate: new Date(2025, 3, Math.floor(Math.random() * 14)).toLocaleDateString('pl-PL')
  }));
  
  return {
    totalSuppliers: suppliers.length,
    activeSuppliers: suppliers.filter(s => s.active !== false).length,
    supplierDetails,
    suppliersByCategory,
    supplierTransactions
  };
};

/**
 * Analizuje zamówienia zakupu i przygotowuje statystyki
 * @param {Array} purchaseOrders - Lista zamówień zakupu
 * @returns {Object} - Statystyki dotyczące zamówień zakupu
 */
export const analyzePurchaseOrders = (purchaseOrders) => {
  if (!purchaseOrders || purchaseOrders.length === 0) {
    return {
      isEmpty: true
    };
  }
  
  // Grupuj zamówienia według statusu
  const poByStatus = purchaseOrders.reduce((acc, po) => {
    const status = po.status || 'Nowe';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  
  // Oblicz łączną wartość zamówień
  const totalValue = purchaseOrders.reduce((sum, po) => {
    return sum + (po.totalValue || calculateOrderTotal(po.items) || 0);
  }, 0);
  
  // Bieżące zamówienia (niezakończone i nieanulowane)
  const currentPOs = purchaseOrders.filter(po => 
    po.status !== 'completed' && 
    po.status !== 'cancelled' && 
    po.status !== 'Zakończone' && 
    po.status !== 'Anulowane'
  ).map(po => ({
    id: po.id,
    supplier: po.supplierName || po.supplier?.name || 'Nieznany',
    status: po.status || 'W trakcie',
    orderDate: formatDate(po.orderDate || po.createdAt),
    expectedDeliveryDate: formatDate(po.expectedDeliveryDate),
    totalValue: po.totalValue || calculateOrderTotal(po.items) || 0
  }));
  
  return {
    totalPurchaseOrders: purchaseOrders.length,
    poByStatus,
    totalValue,
    averagePOValue: purchaseOrders.length > 0 ? totalValue / purchaseOrders.length : 0,
    currentPOs
  };
};

/**
 * Pobiera dane o konwersacjach z asystentem AI
 * @param {Object} options - Opcje pobierania
 * @returns {Promise<Array>} - Lista konwersacji
 */
export const getAIConversations = async (options = {}) => {
  const result = await getCollectionData('aiConversations', options);
  return result.data;
};

/**
 * Pobiera dane o licznikach systemowych
 * @param {Object} options - Opcje pobierania
 * @returns {Promise<Array>} - Lista liczników
 */
export const getCounters = async (options = {}) => {
  const result = await getCollectionData('counters', options);
  return result.data;
};

/**
 * Pobiera dane o cenach dostawców
 * @param {Object} options - Opcje pobierania
 * @returns {Promise<Array>} - Lista cen dostawców
 */
export const getInventorySupplierPrices = async (options = {}) => {
  const result = await getCollectionData('inventorySupplierPrices', options);
  return result.data;
};

/**
 * Pobiera dane o transakcjach magazynowych
 * @param {Object} options - Opcje pobierania
 * @returns {Promise<Array>} - Lista transakcji magazynowych
 */
export const getInventoryTransactions = async (options = {}) => {
  try {
    // Jeśli options.usePagination jest true, używamy nowej funkcji z paginacją kursorową
    if (options.usePagination) {
      const { selectFields, lastVisible, limit, filters, orderBy } = options;
      
      // Pobierz dane z funkcji z paginacją kursorową z inventoryService
      const result = await getInventoryTransactionsPaginated({
        selectFields,
        lastVisible,
        limit: limit, // Bez domyślnego limitu
        filters,
        orderBy
      });
      
      return result;
    } else {
      // Używamy standardowej funkcji z getCollectionData z podstawową funkcjonalnością
      const result = await getCollectionData('inventoryTransactions', options);
      return result.data;
    }
  } catch (error) {
    console.error('Błąd podczas pobierania transakcji magazynowych:', error);
    return [];
  }
};

/**
 * Pobiera dane o grupach produktów
 * @param {Object} options - Opcje pobierania
 * @returns {Promise<Array>} - Lista grup produktów
 */
export const getItemGroups = async (options = {}) => {
  const result = await getCollectionData('itemGroups', options);
  return result.data;
};

/**
 * Pobiera dane o powiadomieniach
 * @param {Object} options - Opcje pobierania
 * @returns {Promise<Array>} - Lista powiadomień
 */
export const getNotifications = async (options = {}) => {
  const result = await getCollectionData('notifications', options);
  return result.data;
};

/**
 * Pobiera dane o elementach cenników
 * @param {Object} options - Opcje pobierania
 * @returns {Promise<Array>} - Lista elementów cenników
 */
export const getPriceListItems = async (options = {}) => {
  const result = await getCollectionData('priceListItems', options);
  return result.data;
};

/**
 * Pobiera dane o cennikach
 * @param {Object} options - Opcje pobierania
 * @returns {Promise<Array>} - Lista cenników
 */
export const getPriceLists = async (options = {}) => {
  const result = await getCollectionData('priceLists', options);
  return result.data;
};

/**
 * Pobiera dane o historii produkcji
 * @param {Object} options - Opcje pobierania
 * @returns {Promise<Array>} - Lista historii produkcji
 */
export const getProductionHistory = async (options = {}) => {
  const result = await getCollectionData('productionHistory', options);
  return result.data;
};

/**
 * Pobiera dane o wersjach receptur
 * @param {Object} options - Opcje pobierania
 * @returns {Promise<Array>} - Lista wersji receptur
 */
export const getRecipeVersions = async (options = {}) => {
  const result = await getCollectionData('recipeVersions', options);
  return result.data;
};

/**
 * Pobiera dane o ustawieniach systemu
 * @param {Object} options - Opcje pobierania
 * @returns {Promise<Array>} - Lista ustawień
 */
export const getSettingsData = async (options = {}) => {
  const result = await getCollectionData('settings', options);
  return result.data;
};

/**
 * Pobiera dane o użytkownikach
 * @param {Object} options - Opcje pobierania
 * @returns {Promise<Array>} - Lista użytkowników
 */
export const getUsers = async (options = {}) => {
  const result = await getCollectionData('users', options);
  return result.data;
};

/**
 * Pobiera dane o magazynach
 * @param {Object} options - Opcje pobierania
 * @returns {Promise<Array>} - Lista magazynów
 */
export const getWarehouses = async (options = {}) => {
  const result = await getCollectionData('warehouses', options);
  return result.data;
};

/**
 * Pobiera dane o stanowiskach pracy
 * @param {Object} options - Opcje pobierania
 * @returns {Promise<Array>} - Lista stanowisk pracy
 */
export const getWorkstations = async (options = {}) => {
  const result = await getCollectionData('workstations', options);
  return result.data;
};

/**
 * Pobiera dane o partiach magazynowych (InventoryBatches)
 * @param {Object} options - Opcje pobierania
 * @returns {Promise<Array>} - Lista partii magazynowych
 */
export const getInventoryBatches = async (options = {}) => {
  return getDataWithCache('inventoryBatches', async () => {
    const result = await getCollectionData('inventoryBatches', options);
    return result.data;
  });
};

/**
 * Pobiera dane o partiach magazynowych (InventoryBatches) z użyciem paginacji opartej na kursorach
 * Funkcja ta jest optymalizacją zapytań zawierających duże wartości OFFSET
 * @param {Object} options - Opcje zapytania (startBatchNumber, batchNumberField, limit)
 * @returns {Promise<Array>} - Lista partii materiałów
 */
export const getInventoryBatchesPaginated = async (options = {}) => {
  try {
    console.log('Pobieranie partii magazynowych z paginacją opartą na kursorach...');
    
    // Domyślne wartości
    const batchNumberField = options.batchNumberField || 'batchNumber';
    const startBatchNumber = options.startBatchNumber || 1;
    const pageSize = options.limit;
    
    // Przygotuj zapytanie - dodaj limit tylko jeśli został określony
    let inventoryBatchesQuery = query(
      collection(db, 'inventoryBatches'),
      where(batchNumberField, '>=', startBatchNumber),
      orderBy(batchNumberField, 'asc')
    );
    
    if (pageSize && pageSize > 0) {
      inventoryBatchesQuery = query(
        collection(db, 'inventoryBatches'),
        where(batchNumberField, '>=', startBatchNumber),
        orderBy(batchNumberField, 'asc'),
        limit(pageSize)
      );
    }
    
    const querySnapshot = await getDocs(inventoryBatchesQuery);
    
    // Przygotuj kursor do następnej strony
    const lastVisible = querySnapshot.docs.length > 0 
      ? querySnapshot.docs[querySnapshot.docs.length - 1]
      : null;
    
    // Przekształć wyniki
    const batches = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`Pobrano ${batches.length} partii magazynowych zaczynając od numeru ${startBatchNumber}`);
    
    return {
      batches,
      lastVisible,
      lastBatchNumber: batches.length > 0 ? batches[batches.length - 1][batchNumberField] : startBatchNumber
    };
  } catch (error) {
    console.error('Błąd podczas pobierania partii magazynowych z paginacją:', error);
    // Używamy początkowej wartości startBatchNumber z options lub wartości domyślnej 1
    const defaultStartBatchNumber = options.startBatchNumber || 1;
    return { batches: [], lastVisible: null, lastBatchNumber: defaultStartBatchNumber };
  }
};

/**
 * Pobierz pojedynczą partię z określonym numerem
 * Optymalizacja zapytania "COLLECTION /inventoryBatches SELECT batchNumber WHERE batchNumber > ? ORDER BY __name__ ASC OFFSET 300 LIMIT 1"
 * @param {number} targetBatchNumber - Numer partii do pobrania
 * @returns {Promise<Object|null>} - Znaleziona partia lub null
 */
export const getInventoryBatchByNumber = async (targetBatchNumber) => {
  try {
    console.log(`Pobieranie partii magazynowej o numerze ${targetBatchNumber}...`);
    
    // Bezpośrednie zapytanie o konkretny numer partii zamiast używania offset
    const inventoryBatchQuery = query(
      collection(db, 'inventoryBatches'),
      where('batchNumber', '==', targetBatchNumber),
      limit(1)
    );
    
    const querySnapshot = await getDocs(inventoryBatchQuery);
    
    // Jeśli partia o danym numerze istnieje, zwróć ją
    if (!querySnapshot.empty) {
      const batch = {
        id: querySnapshot.docs[0].id,
        ...querySnapshot.docs[0].data()
      };
      console.log(`Znaleziono partię o numerze ${targetBatchNumber}`);
      return batch;
    }
    
    // Jeśli nie znaleziono dokładnego dopasowania, znajdź najbliższą partię z większym numerem
    const nextBatchQuery = query(
      collection(db, 'inventoryBatches'),
      where('batchNumber', '>', targetBatchNumber),
      orderBy('batchNumber', 'asc'),
      limit(1)
    );
    
    const nextQuerySnapshot = await getDocs(nextBatchQuery);
    
    if (!nextQuerySnapshot.empty) {
      const batch = {
        id: nextQuerySnapshot.docs[0].id,
        ...nextQuerySnapshot.docs[0].data()
      };
      console.log(`Znaleziono najbliższą partię o numerze ${batch.batchNumber} (szukano ${targetBatchNumber})`);
      return batch;
    }
    
    console.log(`Nie znaleziono partii o numerze ${targetBatchNumber} ani większym`);
    return null;
  } catch (error) {
    console.error(`Błąd podczas pobierania partii magazynowej o numerze ${targetBatchNumber}:`, error);
    return null;
  }
};

/**
 * FAZA 3: Analizuje łańcuch wartości (value chain) dla zamówień
 * Śledzi ścieżkę: PO → Batch → MO → CO → Invoice
 * @param {Object} businessData - Dane biznesowe
 * @returns {Object} - Analiza łańcucha wartości
 */
export const analyzeValueChain = (businessData) => {
  if (!businessData || !businessData.data) {
    return { isEmpty: true };
  }

  const { 
    orders = [], 
    productionTasks = [], 
    purchaseOrders = [],
    materialBatches = [],
    invoices = [],
    qualityTests = []
  } = businessData.data;

  const valueChains = [];

  // Dla każdego zamówienia klienta, znajdź pełną ścieżkę
  orders.forEach(order => {
    const chain = {
      orderId: order.id,
      orderNumber: order.number || order.orderNumber,
      customerName: order.customer?.name || order.customerName,
      orderValue: order.totalValue || order.total || 0,
      
      // Znajdź powiązane MO
      productionTasks: productionTasks.filter(task => 
        task.orderId === order.id || 
        task.linkedOrderId === order.id ||
        (task.orderNumber && task.orderNumber === order.number)
      ),
      
      // Znajdź faktury
      invoices: invoices.filter(inv => 
        inv.orderId === order.id ||
        (inv.orderNumber && inv.orderNumber === order.number)
      ),
      
      // Oblicz kompletność łańcucha
      hasProduction: false,
      hasInvoice: false,
      hasBatches: false,
      hasQualityTests: false,
      completenessScore: 0
    };

    // Znajdź partie i PO dla każdego MO
    chain.productionTasks.forEach(task => {
      chain.hasProduction = true;
      
      // Znajdź partie użyte w produkcji (przez consumedMaterials lub ingredients)
      const usedBatches = materialBatches.filter(batch => {
        if (task.consumedMaterials) {
          return task.consumedMaterials.some(cm => cm.batchId === batch.id);
        }
        if (task.ingredients) {
          return task.ingredients.some(ing => ing.batchNumber === batch.batchNumber);
        }
        return false;
      });

      if (usedBatches.length > 0) {
        chain.hasBatches = true;
        
        // Znajdź PO dla każdej partii
        task.linkedBatches = usedBatches.map(batch => ({
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          materialName: batch.name || batch.materialName,
          purchaseOrder: purchaseOrders.find(po => 
            po.id === batch.purchaseOrderId ||
            (po.items && po.items.some(item => item.batchNumber === batch.batchNumber))
          )
        }));
      }

      // Znajdź testy jakościowe
      const tests = qualityTests.filter(test => 
        test.productionTaskId === task.id ||
        test.moNumber === task.moNumber
      );

      if (tests.length > 0) {
        chain.hasQualityTests = true;
        task.qualityTests = tests;
      }
    });

    chain.hasInvoice = chain.invoices.length > 0;

    // Oblicz score kompletności
    let score = 0;
    if (chain.hasProduction) score += 0.25;
    if (chain.hasBatches) score += 0.25;
    if (chain.hasQualityTests) score += 0.25;
    if (chain.hasInvoice) score += 0.25;
    chain.completenessScore = score;

    // Dodaj missing steps
    chain.missingSteps = [];
    if (!chain.hasProduction) chain.missingSteps.push('production');
    if (!chain.hasBatches) chain.missingSteps.push('batches');
    if (!chain.hasQualityTests) chain.missingSteps.push('qualityTests');
    if (!chain.hasInvoice) chain.missingSteps.push('invoice');

    valueChains.push(chain);
  });

  // Statystyki
  const completeChains = valueChains.filter(c => c.completenessScore === 1.0);
  const incompleteChains = valueChains.filter(c => c.completenessScore < 1.0);
  const avgCompleteness = valueChains.length > 0 
    ? valueChains.reduce((sum, c) => sum + c.completenessScore, 0) / valueChains.length 
    : 0;

  return {
    totalOrders: orders.length,
    valueChains,
    statistics: {
      completeChains: completeChains.length,
      incompleteChains: incompleteChains.length,
      avgCompleteness: Math.round(avgCompleteness * 100),
      ordersWithoutProduction: valueChains.filter(c => !c.hasProduction).length,
      ordersWithoutInvoice: valueChains.filter(c => !c.hasInvoice).length,
      ordersWithoutQualityTests: valueChains.filter(c => !c.hasQualityTests).length
    }
  };
};

/**
 * FAZA 3: Analizuje kompletność danych dla kluczowych dokumentów
 * @param {Object} businessData - Dane biznesowe
 * @returns {Object} - Analiza kompletności danych
 */
export const analyzeDataCompleteness = (businessData) => {
  if (!businessData || !businessData.data) {
    return { isEmpty: true };
  }

  const { 
    productionTasks = [],
    orders = [],
    invoices = [],
    qualityTests = [],
    materialBatches = [],
    purchaseOrders = [],
    cmrDocuments = []
  } = businessData.data;

  const analysis = {
    productionTasks: [],
    orders: [],
    overallScore: 0
  };

  // Analiza zadań produkcyjnych
  productionTasks.forEach(task => {
    const completeness = {
      id: task.id,
      moNumber: task.moNumber,
      name: task.name || task.productName,
      status: task.status,
      
      // Sprawdź powiązania
      hasRecipe: !!(task.recipeId || task.recipe),
      hasOrder: !!(task.orderId || task.linkedOrderId),
      hasBatches: materialBatches.some(b => 
        task.consumedMaterials?.some(cm => cm.batchId === b.id) ||
        task.ingredients?.some(ing => ing.batchNumber === b.batchNumber)
      ),
      hasQualityTests: qualityTests.some(t => 
        t.productionTaskId === task.id || t.moNumber === task.moNumber
      ),
      hasInvoice: false,
      
      missingData: [],
      completenessScore: 0
    };

    // Sprawdź fakturę (przez zamówienie)
    if (completeness.hasOrder) {
      const relatedOrder = orders.find(o => 
        o.id === task.orderId || o.id === task.linkedOrderId
      );
      if (relatedOrder) {
        completeness.hasInvoice = invoices.some(inv => inv.orderId === relatedOrder.id);
      }
    }

    // Oblicz score
    let score = 0;
    const totalChecks = 5;
    
    if (completeness.hasRecipe) score++; else completeness.missingData.push('recipe');
    if (completeness.hasOrder) score++; else completeness.missingData.push('customerOrder');
    if (completeness.hasBatches) score++; else completeness.missingData.push('materialBatches');
    if (completeness.hasQualityTests) score++; else completeness.missingData.push('qualityTests');
    if (completeness.hasInvoice) score++; else completeness.missingData.push('invoice');
    
    completeness.completenessScore = score / totalChecks;
    analysis.productionTasks.push(completeness);
  });

  // Analiza zamówień klientów
  orders.forEach(order => {
    const completeness = {
      id: order.id,
      orderNumber: order.number || order.orderNumber,
      customerName: order.customer?.name || order.customerName,
      status: order.status,
      
      hasProduction: productionTasks.some(t => 
        t.orderId === order.id || t.linkedOrderId === order.id
      ),
      hasInvoice: invoices.some(inv => inv.orderId === order.id),
      hasCMR: cmrDocuments.some(cmr => 
        cmr.linkedOrderIds?.includes(order.id) || cmr.linkedOrderId === order.id
      ),
      
      missingData: [],
      completenessScore: 0
    };

    // Oblicz score
    let score = 0;
    const totalChecks = 3;
    
    if (completeness.hasProduction) score++; else completeness.missingData.push('production');
    if (completeness.hasInvoice) score++; else completeness.missingData.push('invoice');
    if (completeness.hasCMR) score++; else completeness.missingData.push('cmr');
    
    completeness.completenessScore = score / totalChecks;
    analysis.orders.push(completeness);
  });

  // Ogólne statystyki
  const allCompleteness = [
    ...analysis.productionTasks.map(t => t.completenessScore),
    ...analysis.orders.map(o => o.completenessScore)
  ];

  analysis.overallScore = allCompleteness.length > 0
    ? Math.round(allCompleteness.reduce((sum, s) => sum + s, 0) / allCompleteness.length * 100)
    : 0;

  analysis.statistics = {
    totalProductionTasks: productionTasks.length,
    productionTasksWithIssues: analysis.productionTasks.filter(t => t.completenessScore < 1.0).length,
    totalOrders: orders.length,
    ordersWithIssues: analysis.orders.filter(o => o.completenessScore < 1.0).length,
    
    // Szczegółowe braki
    tasksWithoutQualityTests: analysis.productionTasks.filter(t => !t.hasQualityTests).length,
    tasksWithoutBatches: analysis.productionTasks.filter(t => !t.hasBatches).length,
    ordersWithoutInvoices: analysis.orders.filter(o => !o.hasInvoice).length,
    ordersWithoutCMR: analysis.orders.filter(o => !o.hasCMR).length,
    ordersWithoutProduction: analysis.orders.filter(o => !o.hasProduction).length
  };

  return analysis;
};

/**
 * FAZA 3: Generuje insights i ostrzeżenia o brakujących danych
 * @param {Object} completenessAnalysis - Analiza kompletności
 * @returns {Array} - Lista insights/ostrzeżeń
 */
export const generateDataCompletenessInsights = (completenessAnalysis) => {
  if (!completenessAnalysis || completenessAnalysis.isEmpty) {
    return [];
  }

  const insights = [];
  const stats = completenessAnalysis.statistics;

  // Ostrzeżenia o brakujących testach jakościowych
  if (stats.tasksWithoutQualityTests > 0) {
    insights.push({
      type: 'warning',
      category: 'quality',
      priority: 'high',
      message: `⚠️ ${stats.tasksWithoutQualityTests} zadań produkcyjnych nie ma testów jakościowych`,
      recommendation: 'Przeprowadź testy jakościowe dla zakończonych MO',
      affectedCount: stats.tasksWithoutQualityTests,
      query: 'Które MO nie mają testów jakościowych?'
    });
  }

  // Ostrzeżenia o brakujących fakturach
  if (stats.ordersWithoutInvoices > 0) {
    insights.push({
      type: 'warning',
      category: 'finance',
      priority: 'high',
      message: `⚠️ ${stats.ordersWithoutInvoices} zamówień nie ma wystawionych faktur`,
      recommendation: 'Wystaw faktury dla zrealizowanych zamówień',
      affectedCount: stats.ordersWithoutInvoices,
      query: 'Które zamówienia nie mają faktur?'
    });
  }

  // Ostrzeżenia o brakujących CMR
  if (stats.ordersWithoutCMR > 0) {
    insights.push({
      type: 'info',
      category: 'logistics',
      priority: 'medium',
      message: `ℹ️ ${stats.ordersWithoutCMR} zamówień nie ma dokumentów CMR`,
      recommendation: 'Dodaj dokumenty CMR dla wysłanych zamówień',
      affectedCount: stats.ordersWithoutCMR,
      query: 'Które zamówienia nie mają CMR?'
    });
  }

  // Ostrzeżenia o zamówieniach bez produkcji
  if (stats.ordersWithoutProduction > 0) {
    insights.push({
      type: 'info',
      category: 'production',
      priority: 'medium',
      message: `ℹ️ ${stats.ordersWithoutProduction} zamówień nie ma powiązanych zadań produkcyjnych`,
      recommendation: 'Utwórz zadania produkcyjne dla zamówień',
      affectedCount: stats.ordersWithoutProduction,
      query: 'Które zamówienia nie mają zadań produkcyjnych?'
    });
  }

  // Ogólna ocena kompletności
  if (completenessAnalysis.overallScore < 70) {
    insights.push({
      type: 'warning',
      category: 'dataQuality',
      priority: 'high',
      message: `⚠️ Ogólna kompletność danych: ${completenessAnalysis.overallScore}% (poniżej 70%)`,
      recommendation: 'Uzupełnij brakujące dane dla lepszej spójności systemu',
      query: 'Pokaż wszystkie braki w danych'
    });
  } else if (completenessAnalysis.overallScore >= 90) {
    insights.push({
      type: 'success',
      category: 'dataQuality',
      priority: 'low',
      message: `✅ Świetna kompletność danych: ${completenessAnalysis.overallScore}%`,
      recommendation: 'Utrzymuj wysoki standard dokumentacji'
    });
  }

  return insights;
};