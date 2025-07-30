import { 
  collection, 
  getDocs, 
  query, 
  orderBy, 
  limit,
  where,
  Timestamp
} from 'firebase/firestore';
import { db } from './firebase/config';
import { getOrdersStats } from './orderService';
import { getTasksByStatus } from './productionService';
import { getKpiData } from './analyticsService';

// Cache dla danych Dashboard z osobnymi czasami wygaśnięcia
const dashboardCache = {
  recipes: { data: null, timestamp: null },
  orders: { data: null, timestamp: null },
  tasks: { data: null, timestamp: null },
  analytics: { data: null, timestamp: null },
  announcement: { data: null, timestamp: null }
};

// Różne czasy cache'a dla różnych typów danych
const CACHE_EXPIRY_TIMES = {
  recipes: 15 * 60 * 1000,      // 15 minut - receptury zmieniają się rzadko
  orders: 15 * 60 * 1000,       // 15 minut - zamówienia zmieniają się częściej
  tasks: 10 * 60 * 1000,        // 10 minut - zadania produkcyjne aktualizowane często
  analytics: 40 * 60 * 1000,   // 40 minut - analityka może być starsza
  announcement: 5 * 60 * 1000  // 5 minut - ogłoszenia zmieniają się rzadko
};

/**
 * Sprawdza czy dane w cache są aktualne
 */
const isCacheValid = (cacheKey) => {
  const cached = dashboardCache[cacheKey];
  if (!cached || !cached.data || !cached.timestamp) return false;
  
  const now = Date.now();
  const expiryTime = CACHE_EXPIRY_TIMES[cacheKey] || 5 * 60 * 1000;
  
  return (now - cached.timestamp) < expiryTime;
};

/**
 * Zapisuje dane do cache
 */
const setCacheData = (cacheKey, data) => {
  dashboardCache[cacheKey] = {
    data,
    timestamp: Date.now()
  };
};

/**
 * Pobiera zoptymalizowane dane receptur dla Dashboard
 * Tylko najważniejsze pola + limit 50 najnowszych
 */
export const getDashboardRecipes = async () => {
  const cacheKey = 'recipes';
  
  // Sprawdź cache
  if (isCacheValid(cacheKey)) {
    console.log('Używam cache dla receptur Dashboard');
    return dashboardCache[cacheKey].data;
  }
  
  try {
    console.log('Pobieram zoptymalizowane dane receptur dla Dashboard...');
    
    const recipesRef = collection(db, 'recipes');
    const q = query(
      recipesRef, 
      orderBy('updatedAt', 'desc'),
      limit(50) // Tylko 50 najnowszych receptur zamiast wszystkich
    );
    
    const querySnapshot = await getDocs(q);
    
    // Pobierz tylko najważniejsze pola dla Dashboard
    const recipes = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name,
        productName: data.productName,
        customerId: data.customerId,
        customerName: data.customerName,
        status: data.status,
        updatedAt: data.updatedAt,
        createdAt: data.createdAt
        // Pomijamy ciężkie pola jak ingredients, notes, procedures itp.
      };
    });
    
    setCacheData(cacheKey, recipes);
    console.log(`Pobrano ${recipes.length} receptur dla Dashboard (z cache)`);
    
    return recipes;
  } catch (error) {
    console.error('Błąd podczas pobierania receptur Dashboard:', error);
    return [];
  }
};

/**
 * Pobiera zoptymalizowane statystyki zamówień dla Dashboard
 */
export const getDashboardOrderStats = async () => {
  const cacheKey = 'orders';
  
  if (isCacheValid(cacheKey)) {
    console.log('Używam cache dla statystyk zamówień Dashboard');
    return dashboardCache[cacheKey].data;
  }
  
  try {
    console.log('Pobieram statystyki zamówień dla Dashboard...');
    const stats = await getOrdersStats(true);
    
    setCacheData(cacheKey, stats);
    return stats;
  } catch (error) {
    console.error('Błąd podczas pobierania statystyk zamówień Dashboard:', error);
    return null;
  }
};

/**
 * Pobiera zadania produkcyjne dla Dashboard
 */
export const getDashboardTasks = async () => {
  const cacheKey = 'tasks';
  
  if (isCacheValid(cacheKey)) {
    console.log('Używam cache dla zadań Dashboard');
    return dashboardCache[cacheKey].data;
  }
  
  try {
    console.log('Pobieram zadania dla Dashboard...');
    
    // Najpierw sprawdź zadania w trakcie
    let tasks = await getTasksByStatus('W trakcie');
    
    // Jeśli brak zadań w trakcie, sprawdź zaplanowane (max 10)
    if (!tasks || tasks.length === 0) {
      const plannedTasks = await getTasksByStatus('Zaplanowane');
      tasks = plannedTasks ? plannedTasks.slice(0, 10) : [];
    } else {
      // Ogranicz do 10 zadań w trakcie
      tasks = tasks.slice(0, 10);
    }
    
    setCacheData(cacheKey, tasks);
    return tasks;
  } catch (error) {
    console.error('Błąd podczas pobierania zadań Dashboard:', error);
    return [];
  }
};

/**
 * Pobiera dane analityczne dla Dashboard
 */
export const getDashboardAnalytics = async () => {
  const cacheKey = 'analytics';
  
  if (isCacheValid(cacheKey)) {
    console.log('Używam cache dla analityki Dashboard');
    return dashboardCache[cacheKey].data;
  }
  
  try {
    console.log('Pobieram dane analityczne dla Dashboard...');
    const analytics = await getKpiData();
    
    setCacheData(cacheKey, analytics);
    return analytics;
  } catch (error) {
    console.error('Błąd podczas pobierania analityki Dashboard:', error);
    return null;
  }
};

/**
 * Pobiera ogłoszenie dla Dashboard
 */
export const getDashboardAnnouncement = async () => {
  const cacheKey = 'announcement';
  
  if (isCacheValid(cacheKey)) {
    console.log('Używam cache dla ogłoszenia Dashboard');
    return dashboardCache[cacheKey].data;
  }
  
  try {
    console.log('Pobieram ogłoszenie dla Dashboard...');
    
    const announcementRef = collection(db, 'settings');
    const q = query(
      announcementRef,
      where('key', '==', 'dashboardAnnouncement')
    );
    
    const querySnapshot = await getDocs(q);
    let announcement = '';
    
    if (!querySnapshot.empty) {
      const doc = querySnapshot.docs[0];
      announcement = doc.data().value || '';
    }
    
    setCacheData(cacheKey, announcement);
    return announcement;
  } catch (error) {
    console.error('Błąd podczas pobierania ogłoszenia Dashboard:', error);
    return '';
  }
};

/**
 * Pobiera wszystkie dane Dashboard w jednym zapytaniu wsadowym
 * Z wykorzystaniem cache'a i optymalizacji
 */
export const getDashboardData = async () => {
  console.log('Rozpoczynam pobieranie danych Dashboard...');
  
  try {
    // Wykonaj wszystkie zapytania równolegle
    const [recipes, orderStats, tasks, analytics] = await Promise.all([
      getDashboardRecipes(),
      getDashboardOrderStats(), 
      getDashboardTasks(),
      getDashboardAnalytics()
    ]);
    
    // Ogłoszenie pobierz oddzielnie z opóźnieniem aby nie blokować głównych danych
    setTimeout(async () => {
      try {
        await getDashboardAnnouncement();
      } catch (error) {
        console.error('Błąd podczas pobierania ogłoszenia:', error);
      }
    }, 100);
    
    const result = {
      recipes,
      orderStats,
      tasks,
      analytics,
      timestamp: Date.now()
    };
    
    console.log('Zakończono pobieranie danych Dashboard:', {
      recipesCount: recipes?.length || 0,
      hasOrderStats: !!orderStats,
      tasksCount: tasks?.length || 0,
      hasAnalytics: !!analytics
    });
    
    return result;
  } catch (error) {
    console.error('Błąd podczas pobierania danych Dashboard:', error);
    return {
      recipes: [],
      orderStats: null,
      tasks: [],
      analytics: null,
      timestamp: Date.now()
    };
  }
};

/**
 * Wymusza odświeżenie cache dla konkretnej sekcji
 */
export const refreshDashboardSection = async (section) => {
  console.log(`Odświeżam sekcję Dashboard: ${section}`);
  
  // Wyczyść cache dla danej sekcji
  if (dashboardCache[section]) {
    dashboardCache[section] = { data: null, timestamp: null };
  }
  
  // Pobierz świeże dane
  switch (section) {
    case 'recipes':
      return await getDashboardRecipes();
    case 'orders':
      return await getDashboardOrderStats();
    case 'tasks':
      return await getDashboardTasks();
    case 'analytics':
      return await getDashboardAnalytics();
    case 'announcement':
      return await getDashboardAnnouncement();
    default:
      console.warn(`Nieznana sekcja Dashboard: ${section}`);
      return null;
  }
};

/**
 * Wyczyść cały cache Dashboard (np. po wylogowaniu)
 */
export const clearDashboardCache = () => {
  console.log('Czyszczę cache Dashboard');
  Object.keys(dashboardCache).forEach(key => {
    dashboardCache[key] = { data: null, timestamp: null };
  });
};

/**
 * Pobierz informacje o stanie cache
 */
export const getDashboardCacheInfo = () => {
  const now = Date.now();
  const info = {};
  
  Object.keys(dashboardCache).forEach(key => {
    const cached = dashboardCache[key];
    info[key] = {
      hasData: !!cached.data,
      age: cached.timestamp ? Math.round((now - cached.timestamp) / 1000) : null,
      isValid: isCacheValid(key),
      expiryTime: CACHE_EXPIRY_TIMES[key] / 1000
    };
  });
  
  return info;
}; 