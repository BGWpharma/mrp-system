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

/**
 * Pobiera dane KPI dla dashboardu
 */
export const getKpiData = async () => {
  try {
    console.log('Próba pobrania danych KPI...');
    // Pobierz statystyki zamówień
    const ordersStats = await getOrdersStats();
    console.log('Pobrano statystyki zamówień:', ordersStats ? 'TAK' : 'NIE');

    // Pobierz statystyki magazynowe
    const inventoryStats = await getRealInventoryStats();
    console.log('Pobrano statystyki magazynowe:', inventoryStats ? 'TAK' : 'NIE');

    // Pobierz dane produkcyjne
    const productionData = await getRealProductionData();
    console.log('Pobrano dane produkcyjne:', productionData ? 'TAK' : 'NIE');

    // Pobierz dane jakościowe
    const qualityData = await getRealQualityData();
    console.log('Pobrano dane jakościowe:', qualityData ? 'TAK' : 'NIE');

    // Wylicz i zwróć wskaźniki KPI
    return {
      // Wskaźniki sprzedażowe
      sales: {
        totalOrders: ordersStats?.total || 0,
        totalValue: ordersStats?.totalValue || 0,
        ordersInProgress: ordersStats?.byStatus?.['W realizacji'] || 0,
        completedOrders: ordersStats?.byStatus?.['Dostarczone'] || 0,
        averageOrderValue: ordersStats?.total > 0 
          ? ordersStats.totalValue / ordersStats.total 
          : 0,
        // Porównanie z poprzednim miesiącem
        growthRate: calculateGrowthRate(ordersStats),
      },
      
      // Wskaźniki magazynowe
      inventory: {
        totalItems: inventoryStats?.totalItems || 0,
        totalValue: inventoryStats?.totalValue || 0,
        lowStockItems: inventoryStats?.lowStockItems || 0,
        expiringItems: inventoryStats?.expiringItems || 0,
        topItems: inventoryStats?.topItems || []
      },
      
      // Wskaźniki produkcyjne
      production: {
        tasksInProgress: productionData?.tasksInProgress || 0,
        completedTasks: productionData?.completedTasks || 0,
        efficiency: productionData?.efficiency || 0,
        nextDeadline: productionData?.nextDeadline || null
      },
      
      // Wskaźniki jakościowe
      quality: {
        passRate: qualityData?.passRate || 95.5,
        rejectRate: qualityData?.rejectRate || 4.5,
        lastTests: qualityData?.lastTests || []
      }
    };
  } catch (error) {
    console.error('Błąd podczas pobierania danych KPI:', error);
    throw error;
  }
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
          { id: 'quality', type: 'kpi', title: 'Jakość', visible: true },
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
    
    // Pobierz ukończone zadania
    const completedTasks = await getTasksByStatus('Zakończone');
    
    // Oblicz efektywność (stosunek ukończonych na czas do wszystkich ukończonych)
    let onTimeCount = 0;
    let efficiency = 0;
    
    if (completedTasks.length > 0) {
      onTimeCount = completedTasks.filter(task => {
        const deadline = new Date(task.deadline);
        const completedAt = new Date(task.completedAt);
        return completedAt <= deadline;
      }).length;
      
      efficiency = (onTimeCount / completedTasks.length) * 100;
    }
    
    // Znajdź najbliższy termin
    let nextDeadline = null;
    if (tasksInProgress.length > 0) {
      const sortedTasks = [...tasksInProgress].sort((a, b) => 
        new Date(a.deadline) - new Date(b.deadline));
      nextDeadline = new Date(sortedTasks[0].deadline);
    }
    
    return {
      tasksInProgress: tasksInProgress.length,
      completedTasks: completedTasks.length,
      efficiency: Math.round(efficiency * 10) / 10, // Zaokrąglenie do 1 miejsca po przecinku
      nextDeadline: nextDeadline
    };
  } catch (error) {
    console.error('Błąd podczas pobierania danych produkcyjnych:', error);
    // Zwróć dane domyślne w przypadku błędu
    return {
      tasksInProgress: 0,
      completedTasks: 0,
      efficiency: 0,
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
    
    // Pobierz przedmioty z niskim stanem
    const lowStockItems = items.filter(item => 
      item.currentQuantity <= item.minQuantity);
    
    // Pobierz wygasające partie
    const expiringItems = await getExpiringBatches();
    
    // Oblicz łączną wartość magazynu
    const totalValue = items.reduce((sum, item) => 
      sum + (item.currentQuantity * (item.unitPrice || 0)), 0);
    
    // Posortuj przedmioty według wartości i pobierz top 3
    const topItems = [...items]
      .sort((a, b) => 
        (b.currentQuantity * (b.unitPrice || 0)) - (a.currentQuantity * (a.unitPrice || 0)))
      .slice(0, 3)
      .map(item => ({
        name: item.name,
        quantity: item.currentQuantity,
        unit: item.unit
      }));
    
    return {
      totalItems: items.length,
      totalValue: totalValue,
      lowStockItems: lowStockItems.length,
      expiringItems: expiringItems.length,
      topItems: topItems
    };
  } catch (error) {
    console.error('Błąd podczas pobierania statystyk magazynowych:', error);
    // Zwróć dane domyślne w przypadku błędu
    return {
      totalItems: 0,
      totalValue: 0,
      lowStockItems: 0,
      expiringItems: 0,
      topItems: []
    };
  }
};

/**
 * Pobiera rzeczywiste dane jakościowe
 */
const getRealQualityData = async () => {
  try {
    // Pobierz wszystkie testy jakości
    const tests = await getAllTests();
    
    if (tests.length === 0) {
      return {
        passRate: 0,
        rejectRate: 0,
        lastTests: []
      };
    }
    
    // Oblicz wskaźnik pozytywnych testów
    const passedTests = tests.filter(test => test.result === 'Pozytywny').length;
    const passRate = (passedTests / tests.length) * 100;
    const rejectRate = 100 - passRate;
    
    // Pobierz ostatnie testy
    const lastTests = [...tests]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5)
      .map(test => ({
        id: test.id,
        name: test.name,
        result: test.result,
        date: test.date
      }));
    
    return {
      passRate: Math.round(passRate * 10) / 10, // Zaokrąglenie do 1 miejsca po przecinku
      rejectRate: Math.round(rejectRate * 10) / 10,
      lastTests
    };
  } catch (error) {
    console.error('Błąd podczas pobierania danych jakościowych:', error);
    // Zwróć dane domyślne w przypadku błędu
    return {
      passRate: 0,
      rejectRate: 0,
      lastTests: []
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

const getInventoryChartData = async () => {
  try {
    // Pobierz rzeczywiste dane magazynowe
    const items = await getAllInventoryItems();
    
    if (items.length === 0) {
      return generateDummyInventoryData();
    }
    
    // Grupuj przedmioty według kategorii
    const categoriesMap = new Map();
    
    items.forEach(item => {
      const category = item.category || 'Inne';
      const currentValue = categoriesMap.get(category) || 0;
      categoriesMap.set(category, currentValue + (item.currentQuantity * (item.unitPrice || 0)));
    });
    
    // Przekształć mapę w tablicę danych wykresu
    const chartData = Array.from(categoriesMap).map(([name, value]) => ({
      name,
      value: Math.round(value)
    }));
    
    // Posortuj według wartości (malejąco)
    return chartData.sort((a, b) => b.value - a.value);
  } catch (error) {
    console.error('Błąd podczas pobierania danych magazynowych dla wykresu:', error);
    return generateDummyInventoryData();
  }
};

// Funkcja generująca przykładowe dane magazynowe (używana w przypadku braku danych rzeczywistych)
const generateDummyInventoryData = () => {
  return [
    { name: 'Surowce A', value: 4500 },
    { name: 'Surowce B', value: 3200 },
    { name: 'Surowce C', value: 2800 },
    { name: 'Produkt 1', value: 5600 },
    { name: 'Produkt 2', value: 3900 },
    { name: 'Produkt 3', value: 2700 }
  ];
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