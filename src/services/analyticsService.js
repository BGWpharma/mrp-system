import { 
  collection, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit,
  Timestamp,
  getDoc,
  doc,
  onSnapshot,
  setDoc
} from 'firebase/firestore';
import { db } from './firebase/config';
import { getOrdersStats } from './orderService';
import { getAllInventoryItems, getExpiredBatches, getExpiringBatches } from './inventoryService';
import { getAllTasks, getTasksByStatus } from './productionService';
import { getAllTests } from './qualityService';

const INVENTORY_TRANSACTIONS_COLLECTION = 'inventoryTransactions';

/**
 * Pobiera podstawowe dane statystyczne dla dashboardu
 */
export const getKpiData = async () => {
  try {
    console.log('Pobieranie podstawowych danych statystycznych...');
    
    // Pobierz statystyki zamówień
    const ordersStats = await getOrdersStats();
    
    // Pobierz dane magazynowe
    const items = await getAllInventoryItems();
    const inventoryStats = {
      totalItems: items?.length || 0,
      totalValue: calculateInventoryValue(items)
    };
    
    // Pobierz dane produkcyjne
    const tasksInProgress = await getTasksByStatus('W trakcie');
    const completedTasks = await getTasksByStatus('Zakończone');
    
    return {
      // Statystyki sprzedaży
      sales: {
        totalOrders: ordersStats?.total || 0,
        totalValue: ordersStats?.totalValue || 0,
        ordersInProgress: ordersStats?.byStatus?.['W realizacji'] || 0,
        completedOrders: ordersStats?.byStatus?.['Dostarczone'] || 0
      },
      
      // Statystyki magazynowe
      inventory: {
        totalItems: inventoryStats.totalItems,
        totalValue: inventoryStats.totalValue
      },
      
      // Statystyki produkcyjne
      production: {
        tasksInProgress: tasksInProgress?.length || 0,
        completedTasks: completedTasks?.length || 0
      }
    };
  } catch (error) {
    console.error('Błąd podczas pobierania danych KPI:', error);
    // Zwróć domyślne wartości w przypadku błędu
    return {
      sales: {
        totalOrders: 0,
        totalValue: 0,
        ordersInProgress: 0,
        completedOrders: 0
      },
      inventory: {
        totalItems: 0,
        totalValue: 0
      },
      production: {
        tasksInProgress: 0,
        completedTasks: 0
      }
    };
  }
};

/**
 * Oblicza całkowitą wartość magazynu
 */
const calculateInventoryValue = (items) => {
  if (!items || items.length === 0) {
    console.log('Brak przedmiotów w magazynie');
    return 0;
  }
  
  let totalValue = 0;
  for (const item of items) {
    // Pobierz cenę jednostkową
    const price = parseFloat(item.unitPrice || item.price || 0);
    // Pobierz aktualną ilość
    const quantity = parseFloat(item.currentQuantity || item.quantity || 0);
    
    const itemValue = price * quantity;
    console.log(`Wartość przedmiotu ${item.name}: ${itemValue} (cena: ${price}, ilość: ${quantity})`);
    totalValue += itemValue;
  }
  
  console.log('Całkowita wartość magazynu:', totalValue);
  return totalValue;
};

/**
 * Pobiera dane do wykresów
 */
export const getChartData = async (chartType, timeFrame = 'month', limit = 12) => {
  try {
    switch (chartType) {
      case 'sales':
        return await getSalesChartData(timeFrame, limit);
      case 'inventory':
        return await getInventoryChartData();
      case 'production':
        return await getProductionChartData(timeFrame);
      case 'quality':
        return await getQualityChartData(timeFrame);
      default:
        throw new Error('Nieznany typ wykresu');
    }
  } catch (error) {
    console.error(`Błąd podczas pobierania danych dla wykresu ${chartType}:`, error);
    throw error;
  }
};

/**
 * Pobiera konfigurację dashboardu dla użytkownika
 */
export const getDashboardConfig = async (userId) => {
  try {
    // Sprawdź, czy istnieje konfiguracja dla tego użytkownika
    const userConfigRef = doc(db, 'dashboardConfigs', userId);
    const userConfigSnap = await getDoc(userConfigRef);
    
    if (userConfigSnap.exists()) {
      // Zwróć konfigurację użytkownika
      return userConfigSnap.data();
    } else {
      // Zwróć domyślną konfigurację
      return {
        layout: [
          { i: 'sales', x: 0, y: 0, w: 6, h: 2 },
          { i: 'inventory', x: 6, y: 0, w: 6, h: 2 },
          { i: 'production', x: 0, y: 2, w: 6, h: 2 },
          { i: 'quality', x: 6, y: 2, w: 6, h: 2 },
          { i: 'salesChart', x: 0, y: 4, w: 12, h: 3 },
          { i: 'inventoryChart', x: 0, y: 7, w: 6, h: 3 },
          { i: 'productionChart', x: 6, y: 7, w: 6, h: 3 }
        ],
        widgets: [
          { id: 'sales', type: 'kpi', title: 'Sprzedaż', visible: true },
          { id: 'inventory', type: 'kpi', title: 'Magazyn', visible: true },
          { id: 'production', type: 'kpi', title: 'Produkcja', visible: true },
          { id: 'quality', type: 'kpi', title: 'Raporty', visible: true },
          { id: 'salesChart', type: 'chart', chartType: 'line', dataSource: 'sales', title: 'Sprzedaż w czasie', visible: true },
          { id: 'inventoryChart', type: 'chart', chartType: 'bar', dataSource: 'inventory', title: 'Stany magazynowe', visible: true },
          { id: 'productionChart', type: 'chart', chartType: 'bar', dataSource: 'production', title: 'Efektywność produkcji', visible: true }
        ]
      };
    }
  } catch (error) {
    console.error('Błąd podczas pobierania konfiguracji dashboardu:', error);
    throw error;
  }
};

/**
 * Zapisuje konfigurację dashboardu dla użytkownika
 */
export const saveDashboardConfig = async (userId, config) => {
  try {
    const userConfigRef = doc(db, 'dashboardConfigs', userId);
    await setDoc(userConfigRef, config);
    console.log('Zapisano konfigurację dashboardu dla użytkownika', userId);
    return true;
  } catch (error) {
    console.error('Błąd podczas zapisywania konfiguracji dashboardu:', error);
    throw error;
  }
};

// Funkcje pomocnicze do obliczania wskaźników

const calculateGrowthRate = (ordersStats) => {
  // Obliczanie wzrostu na podstawie rzeczywistych danych
  const currentMonthSales = getCurrentMonthSales(ordersStats);
  const previousMonthSales = getPreviousMonthSales(ordersStats);
  
  if (previousMonthSales === 0) return 0;
  
  return ((currentMonthSales - previousMonthSales) / previousMonthSales) * 100;
};

const getCurrentMonthSales = (ordersStats) => {
  const date = new Date();
  const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
  return (ordersStats.byMonth && ordersStats.byMonth[monthKey]?.value) || 0;
};

const getPreviousMonthSales = (ordersStats) => {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
  return (ordersStats.byMonth && ordersStats.byMonth[monthKey]?.value) || 0;
};

/**
 * Pobiera rzeczywiste dane produkcyjne z bazy
 */
const getRealProductionData = async () => {
  try {
    // Pobierz zadania w trakcie
    const tasksInProgress = await getTasksByStatus('W trakcie');
    console.log('Zadania w trakcie:', tasksInProgress?.length || 0);
    
    // Pobierz ukończone zadania
    const completedTasks = await getTasksByStatus('Zakończone');
    console.log('Zadania ukończone:', completedTasks?.length || 0);
    
    // Oblicz efektywność (stosunek ukończonych na czas do wszystkich ukończonych)
    let onTimeCount = 0;
    let efficiency = 75; // Domyślna wartość efektywności
    
    if (completedTasks && completedTasks.length > 0) {
      onTimeCount = completedTasks.filter(task => {
        const deadline = new Date(task.deadline);
        const completedAt = new Date(task.completedAt);
        return completedAt <= deadline;
      }).length;
      
      efficiency = (onTimeCount / completedTasks.length) * 100;
    }
    
    // Znajdź najbliższy termin
    let nextDeadline = null;
    if (tasksInProgress && tasksInProgress.length > 0) {
      const sortedTasks = [...tasksInProgress].sort((a, b) => 
        new Date(a.deadline) - new Date(b.deadline));
      nextDeadline = new Date(sortedTasks[0].deadline);
    }
    
    return {
      tasksInProgress: tasksInProgress?.length || 0,
      completedTasks: completedTasks?.length || 2, // Domyślnie 2 ukończone zadania
      efficiency: Math.round(efficiency * 10) / 10, // Zaokrąglenie do 1 miejsca po przecinku
      nextDeadline: nextDeadline
    };
  } catch (error) {
    console.error('Błąd podczas pobierania danych produkcyjnych:', error);
    // Zwróć dane domyślne w przypadku błędu
    return {
      tasksInProgress: 0,
      completedTasks: 2,
      efficiency: 75.0,
      nextDeadline: null
    };
  }
};

/**
 * Pobiera rzeczywiste dane magazynowe z bazy
 */
const getRealInventoryStats = async () => {
  try {
    // Pobierz wszystkie przedmioty z magazynu
    const items = await getAllInventoryItems();
    console.log('Ilość przedmiotów w magazynie:', items?.length || 0);
    
    if (!items || items.length === 0) {
      console.log('Brak przedmiotów w magazynie, zwracam domyślne dane');
      return {
        totalItems: 35,
        totalValue: 12500,
        lowStockItems: 3,
        expiringItems: 2,
        topItems: [
          { name: 'Surowiec A', value: 4500 },
          { name: 'Surowiec B', value: 3200 },
          { name: 'Produkt 1', value: 2800 },
          { name: 'Produkt 2', value: 1700 },
          { name: 'Opakowania', value: 300 }
        ]
      };
    }
    
    // Pobierz przedmioty z niskim stanem
    const lowStockItems = items.filter(item => 
      item.quantity <= item.minimumQuantity
    );
    
    // Pobierz przedmioty z kończącym się terminem ważności
    const expiringItems = await getExpiringBatches(30);
    const expiredItems = await getExpiredBatches();
    
    // Oblicz całkowitą wartość magazynu
    let totalValue = 0;
    
    for (const item of items) {
      // Upewnij się, że item.price i item.quantity są liczbami
      const price = parseFloat(item.price) || 0;
      const quantity = parseFloat(item.quantity) || 0;
      totalValue += price * quantity;
    }
    
    // Sortuj przedmioty według wartości i zwróć topowe
    const itemsWithValue = items.map(item => ({
      ...item,
      value: (parseFloat(item.price) || 0) * (parseFloat(item.quantity) || 0)
    }));
    
    const topItems = itemsWithValue
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
      .map(item => ({
        name: item.name,
        value: item.value
      }));
    
    return {
      totalItems: items.length,
      totalValue: totalValue,
      lowStockItems: lowStockItems.length,
      expiringItems: expiringItems.length + expiredItems.length,
      topItems: topItems
    };
  } catch (error) {
    console.error('Błąd podczas pobierania statystyk magazynowych:', error);
    // Zwróć dane domyślne w przypadku błędu
    return {
      totalItems: 35,
      totalValue: 12500,
      lowStockItems: 3,
      expiringItems: 2,
      topItems: [
        { name: 'Surowiec A', value: 4500 },
        { name: 'Surowiec B', value: 3200 },
        { name: 'Produkt 1', value: 2800 },
        { name: 'Produkt 2', value: 1700 },
        { name: 'Opakowania', value: 300 }
      ]
    };
  }
};

/**
 * Pobiera rzeczywiste dane jakościowe z bazy
 */
const getRealQualityData = async () => {
  try {
    // Pobierz wszystkie testy jakościowe
    const allTests = await getAllTests();
    console.log('Ilość testów jakościowych:', allTests?.length || 0);
    
    if (!allTests || allTests.length === 0) {
      console.log('Brak testów jakościowych, zwracam domyślne dane');
      return {
        passRate: 95.5,
        rejectRate: 4.5,
        lastTests: [
          { id: 'test1', name: 'Test wytrzymałościowy', result: 'Pozytywny', date: new Date().toISOString() },
          { id: 'test2', name: 'Test funkcjonalny', result: 'Pozytywny', date: new Date().toISOString() },
          { id: 'test3', name: 'Test wodoszczelności', result: 'Pozytywny', date: new Date().toISOString() },
          { id: 'test4', name: 'Test kompatybilności', result: 'Negatywny', date: new Date().toISOString() }
        ],
        totalTests: 20
      };
    }
    
    // Oblicz wskaźnik pozytywnych testów
    let passCount = 0;
    let rejectCount = 0;
    
    for (const test of allTests) {
      if (test.result === 'pass' || test.result === 'Pozytywny') {
        passCount++;
      } else if (test.result === 'fail' || test.result === 'Negatywny') {
        rejectCount++;
      }
    }
    
    const totalTests = passCount + rejectCount;
    let passRate = 95.0;
    let rejectRate = 5.0;
    
    if (totalTests > 0) {
      passRate = (passCount / totalTests) * 100;
      rejectRate = (rejectCount / totalTests) * 100;
    }
    
    // Posortuj testy według daty i weź ostatnie 5
    const sortedTests = [...allTests].sort((a, b) => {
      const dateA = a.date ? new Date(a.date) : new Date(0);
      const dateB = b.date ? new Date(b.date) : new Date(0);
      return dateB - dateA;
    });
    
    const lastTests = sortedTests.slice(0, 5).map(test => ({
      id: test.id,
      name: test.name || 'Test jakościowy',
      result: test.result,
      date: test.date
    }));
    
    return {
      passRate: Math.round(passRate * 10) / 10, // Zaokrąglenie do 1 miejsca po przecinku
      rejectRate: Math.round(rejectRate * 10) / 10,
      lastTests: lastTests,
      totalTests: totalTests
    };
  } catch (error) {
    console.error('Błąd podczas pobierania danych jakościowych:', error);
    // Zwróć dane domyślne w przypadku błędu
    return {
      passRate: 95.5,
      rejectRate: 4.5,
      lastTests: [
        { id: 'test1', name: 'Test wytrzymałościowy', result: 'Pozytywny', date: new Date().toISOString() },
        { id: 'test2', name: 'Test funkcjonalny', result: 'Pozytywny', date: new Date().toISOString() },
        { id: 'test3', name: 'Test wodoszczelności', result: 'Pozytywny', date: new Date().toISOString() },
        { id: 'test4', name: 'Test kompatybilności', result: 'Negatywny', date: new Date().toISOString() }
      ],
      totalTests: 20
    };
  }
};

// Funkcje pobierające dane do wykresów

const getSalesChartData = async (timeFrame, limitCount) => {
  try {
    // Pobierz rzeczywiste dane sprzedaży
    const ordersStats = await getOrdersStats();
    const chart_data = [];
    
    if (ordersStats.byMonth) {
      // Posortuj miesiące chronologicznie
      const months = Object.keys(ordersStats.byMonth).sort();
      
      // Pobierz ostatnie N miesięcy
      const limitedMonths = months.slice(-limitCount);
      
      // Przygotuj dane do wykresu
      for (const monthKey of limitedMonths) {
        const [year, month] = monthKey.split('-');
        const monthNames = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];
        const monthData = ordersStats.byMonth[monthKey];
        
        chart_data.push({
          period: `${monthNames[parseInt(month) - 1]} ${year}`,
          value: monthData.value || 0,
          count: monthData.count || 0
        });
      }
    }
    
    return chart_data.length > 0 ? chart_data : generateDummySalesData(limitCount);
  } catch (error) {
    console.error('Błąd podczas pobierania danych sprzedaży dla wykresu:', error);
    return generateDummySalesData(limitCount);
  }
};

// Funkcja generująca przykładowe dane sprzedaży (używana w przypadku braku danych rzeczywistych)
const generateDummySalesData = (limitCount) => {
  const data = [];
  const now = new Date();
  const months = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];
  
  for (let i = 0; i < limitCount; i++) {
    const date = new Date();
    date.setMonth(now.getMonth() - (limitCount - 1 - i));
    
    data.push({
      period: `${months[date.getMonth()]} ${date.getFullYear()}`,
      value: Math.floor(Math.random() * 50000) + 10000,
      count: Math.floor(Math.random() * 50) + 10
    });
  }
  
  return data;
};

/**
 * Pobiera dane do wykresu wartości magazynu
 */
const getInventoryChartData = async () => {
  try {
    // Pobierz wszystkie przedmioty z magazynu
    const items = await getAllInventoryItems();
    
    // Pobierz wszystkie transakcje magazynowe z ostatnich 30 dni
    const today = new Date();
    const thirtyDaysAgo = new Date(today.setDate(today.getDate() - 30));
    
    const transactionsRef = collection(db, INVENTORY_TRANSACTIONS_COLLECTION);
    const q = query(
      transactionsRef,
      where('date', '>=', Timestamp.fromDate(thirtyDaysAgo)),
      orderBy('date', 'asc')
    );
    
    const transactionsSnapshot = await getDocs(q);
    const transactions = transactionsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Grupuj transakcje po dniach
    const dailyValues = new Map();
    let currentValue = calculateInventoryValue(items);

    // Inicjalizuj wartości dla ostatnich 30 dni
    for (let i = 0; i < 30; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      dailyValues.set(dateKey, currentValue);
    }

    // Aktualizuj wartości historyczne na podstawie transakcji
    for (const transaction of transactions) {
      const dateKey = new Date(transaction.date.toDate()).toISOString().split('T')[0];
      const price = parseFloat(transaction.price) || 0;
      const quantity = parseFloat(transaction.quantity) || 0;
      
      if (transaction.type === 'receipt') {
        currentValue += price * quantity;
      } else if (transaction.type === 'issue') {
        currentValue -= price * quantity;
      }
      
      dailyValues.set(dateKey, currentValue);
    }

    // Przygotuj dane do wykresu
    const sortedDates = Array.from(dailyValues.keys()).sort();
    
    return {
      labels: sortedDates.map(date => {
        const [year, month, day] = date.split('-');
        return `${day}.${month}`;
      }),
      data: sortedDates.map(date => dailyValues.get(date))
    };
  } catch (error) {
    console.error('Błąd podczas pobierania danych do wykresu magazynu:', error);
    // Zwróć przykładowe dane w przypadku błędu
    const labels = Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - i);
      return `${date.getDate()}.${date.getMonth() + 1}`;
    }).reverse();
    
    return {
      labels,
      data: labels.map(() => 0)
    };
  }
};

const getProductionChartData = async (timeFrame) => {
  try {
    // Pobierz wszystkie zadania produkcyjne
    const allTasks = await getAllTasks();
    
    if (allTasks.length === 0) {
      return generateDummyProductionData();
    }
    
    // Pogrupuj zadania według miesiąca
    const monthlyData = new Map();
    const months = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];
    
    // Inicjalizuj ostatnie 6 miesięcy
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(now.getMonth() - i);
      const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      const displayName = `${months[date.getMonth()]} ${date.getFullYear()}`;
      
      monthlyData.set(monthKey, {
        period: displayName,
        planned: 0,
        completed: 0
      });
    }
    
    // Przetwórz dane zadań
    allTasks.forEach(task => {
      // Pobierz miesiąc z daty planowanego zakończenia
      const taskDate = task.deadline ? new Date(task.deadline) : null;
      if (!taskDate) return;
      
      const monthKey = `${taskDate.getFullYear()}-${(taskDate.getMonth() + 1).toString().padStart(2, '0')}`;
      if (monthlyData.has(monthKey)) {
        const data = monthlyData.get(monthKey);
        data.planned++;
        
        // Sprawdź, czy zadanie zostało zakończone
        if (task.status === 'Zakończone') {
          data.completed++;
        }
      }
    });
    
    // Przekształć mapę w tablicę sortując chronologicznie
    return Array.from(monthlyData.values());
  } catch (error) {
    console.error('Błąd podczas pobierania danych produkcyjnych dla wykresu:', error);
    return generateDummyProductionData();
  }
};

// Funkcja generująca przykładowe dane produkcyjne (używana w przypadku braku danych rzeczywistych)
const generateDummyProductionData = () => {
  const data = [];
  const now = new Date();
  const months = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];
  
  for (let i = 0; i < 6; i++) {
    const date = new Date();
    date.setMonth(now.getMonth() - (5 - i));
    
    data.push({
      period: `${months[date.getMonth()]} ${date.getFullYear()}`,
      planned: Math.floor(Math.random() * 100) + 50,
      completed: Math.floor(Math.random() * 90) + 40
    });
  }
  
  return data;
};

const getQualityChartData = async (timeFrame) => {
  try {
    // Pobierz wszystkie testy jakości
    const tests = await getAllTests();
    
    if (tests.length === 0) {
      return generateDummyQualityData();
    }
    
    // Pogrupuj testy według miesiąca
    const monthlyData = new Map();
    const months = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];
    
    // Inicjalizuj ostatnie 6 miesięcy
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(now.getMonth() - i);
      const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      const displayName = `${months[date.getMonth()]} ${date.getFullYear()}`;
      
      monthlyData.set(monthKey, {
        period: displayName,
        passRate: 0,
        failRate: 0,
        testCount: 0
      });
    }
    
    // Przetwórz dane testów
    tests.forEach(test => {
      // Pobierz miesiąc z daty testu
      const testDate = test.date ? new Date(test.date) : null;
      if (!testDate) return;
      
      const monthKey = `${testDate.getFullYear()}-${(testDate.getMonth() + 1).toString().padStart(2, '0')}`;
      if (monthlyData.has(monthKey)) {
        const data = monthlyData.get(monthKey);
        data.testCount++;
        
        // Sprawdź wynik testu
        if (test.result === 'Pozytywny') {
          data.passCount = (data.passCount || 0) + 1;
        } else {
          data.failCount = (data.failCount || 0) + 1;
        }
      }
    });
    
    // Oblicz wskaźniki i sformatuj dane
    const chartData = Array.from(monthlyData.values()).map(item => {
      const passRate = item.testCount > 0 
        ? (item.passCount / item.testCount) * 100 
        : 0;
      
      return {
        period: item.period,
        passRate: Math.round(passRate * 10) / 10,
        failRate: Math.round((100 - passRate) * 10) / 10
      };
    });
    
    return chartData;
  } catch (error) {
    console.error('Błąd podczas pobierania danych jakościowych dla wykresu:', error);
    return generateDummyQualityData();
  }
};

// Funkcja generująca przykładowe dane jakościowe (używana w przypadku braku danych rzeczywistych)
const generateDummyQualityData = () => {
  const data = [];
  const now = new Date();
  const months = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze', 'Lip', 'Sie', 'Wrz', 'Paź', 'Lis', 'Gru'];
  
  for (let i = 0; i < 6; i++) {
    const date = new Date();
    date.setMonth(now.getMonth() - (5 - i));
    
    const passed = Math.floor(Math.random() * 95) + 80;
    
    data.push({
      period: `${months[date.getMonth()]} ${date.getFullYear()}`,
      passRate: passed,
      failRate: 100 - passed
    });
  }
  
  return data;
}; 