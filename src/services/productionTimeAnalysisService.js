// src/services/productionTimeAnalysisService.js
import { 
  collection, 
  doc, 
  getDocs, 
  query, 
  where,
  orderBy
} from 'firebase/firestore';
import { db } from './firebase/config';
import { format, isWithinInterval, parseISO } from 'date-fns';

/**
 * Pobiera historię produkcji w określonym zakresie czasu
 * @param {Date} startDate - Data początkowa
 * @param {Date} endDate - Data końcowa
 * @returns {Promise<Array>} - Lista sesji produkcyjnych
 */
export const getProductionHistoryByDateRange = async (startDate, endDate) => {
  try {
    console.log(`[ANALIZA CZASU] Pobieranie historii produkcji od ${format(startDate, 'dd.MM.yyyy')} do ${format(endDate, 'dd.MM.yyyy')}`);
    
    // Pobierz wszystkie wpisy z kolekcji productionHistory
    const historyRef = collection(db, 'productionHistory');
    const q = query(historyRef, orderBy('startTime', 'asc'));
    
    const querySnapshot = await getDocs(q);
    const allHistory = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log(`[ANALIZA CZASU] Pobrano ${allHistory.length} wpisów historii produkcji`);

    // Filtruj wpisy według zakresu dat
    const filteredHistory = allHistory.filter(session => {
      if (!session.startTime || !session.endTime) {
        return false;
      }

      // Konwertuj daty
      let startTime = session.startTime;
      if (startTime.toDate) {
        startTime = startTime.toDate();
      } else if (typeof startTime === 'string') {
        startTime = parseISO(startTime);
      } else if (!(startTime instanceof Date)) {
        startTime = new Date(startTime);
      }

      // Sprawdź czy data rozpoczęcia jest w zadanym zakresie
      return isWithinInterval(startTime, { start: startDate, end: endDate });
    });

    console.log(`[ANALIZA CZASU] Po filtrowaniu: ${filteredHistory.length} sesji w zakresie dat`);
    
    return filteredHistory;
  } catch (error) {
    console.error('Błąd podczas pobierania historii produkcji:', error);
    throw error;
  }
};

/**
 * Analizuje czas produkcji na podstawie historii sesji
 * @param {Array} productionHistory - Historia sesji produkcyjnych
 * @returns {Object} - Analizowane dane czasowe
 */
export const analyzeProductionTime = (productionHistory) => {
  console.log(`[ANALIZA CZASU] Analizowanie ${productionHistory.length} sesji produkcyjnych`);
  
  const analysis = {
    totalSessions: productionHistory.length,
    totalTimeMinutes: 0,
    totalTimeHours: 0,
    totalQuantity: 0,
    averageTimePerSession: 0,
    averageTimePerUnit: 0,
    sessionsByTask: {},
    timeByDay: {},
    timeByWeek: {},
    timeByMonth: {},
    sessions: []
  };

  if (productionHistory.length === 0) {
    return analysis;
  }

  productionHistory.forEach(session => {
    const timeSpent = session.timeSpent || 0;
    const quantity = session.quantity || 0;

    analysis.totalTimeMinutes += timeSpent;
    analysis.totalQuantity += quantity;

    // Konwertuj daty
    let startTime = session.startTime;
    if (startTime.toDate) {
      startTime = startTime.toDate();
    } else if (typeof startTime === 'string') {
      startTime = parseISO(startTime);
    } else if (!(startTime instanceof Date)) {
      startTime = new Date(startTime);
    }

    let endTime = session.endTime;
    if (endTime.toDate) {
      endTime = endTime.toDate();
    } else if (typeof endTime === 'string') {
      endTime = parseISO(endTime);
    } else if (!(endTime instanceof Date)) {
      endTime = new Date(endTime);
    }

    // Grupowanie według zadania
    if (session.taskId) {
      if (!analysis.sessionsByTask[session.taskId]) {
        analysis.sessionsByTask[session.taskId] = {
          taskId: session.taskId,
          sessionsCount: 0,
          totalTime: 0,
          totalQuantity: 0,
          sessions: []
        };
      }
      
      analysis.sessionsByTask[session.taskId].sessionsCount++;
      analysis.sessionsByTask[session.taskId].totalTime += timeSpent;
      analysis.sessionsByTask[session.taskId].totalQuantity += quantity;
      analysis.sessionsByTask[session.taskId].sessions.push(session);
    }

    // Grupowanie według dnia
    const dayKey = format(startTime, 'yyyy-MM-dd');
    if (!analysis.timeByDay[dayKey]) {
      analysis.timeByDay[dayKey] = {
        date: dayKey,
        totalTime: 0,
        sessionsCount: 0,
        totalQuantity: 0
      };
    }
    analysis.timeByDay[dayKey].totalTime += timeSpent;
    analysis.timeByDay[dayKey].sessionsCount++;
    analysis.timeByDay[dayKey].totalQuantity += quantity;

    // Grupowanie według tygodnia
    const weekKey = format(startTime, "yyyy-'W'II");
    if (!analysis.timeByWeek[weekKey]) {
      analysis.timeByWeek[weekKey] = {
        week: weekKey,
        totalTime: 0,
        sessionsCount: 0,
        totalQuantity: 0
      };
    }
    analysis.timeByWeek[weekKey].totalTime += timeSpent;
    analysis.timeByWeek[weekKey].sessionsCount++;
    analysis.timeByWeek[weekKey].totalQuantity += quantity;

    // Grupowanie według miesiąca
    const monthKey = format(startTime, 'yyyy-MM');
    if (!analysis.timeByMonth[monthKey]) {
      analysis.timeByMonth[monthKey] = {
        month: monthKey,
        totalTime: 0,
        sessionsCount: 0,
        totalQuantity: 0
      };
    }
    analysis.timeByMonth[monthKey].totalTime += timeSpent;
    analysis.timeByMonth[monthKey].sessionsCount++;
    analysis.timeByMonth[monthKey].totalQuantity += quantity;

    // Dodaj sesję do listy
    analysis.sessions.push({
      ...session,
      startTime,
      endTime,
      formattedStartTime: format(startTime, 'dd.MM.yyyy HH:mm'),
      formattedEndTime: format(endTime, 'dd.MM.yyyy HH:mm'),
      timeSpentFormatted: formatMinutes(timeSpent)
    });
  });

  // Oblicz średnie
  analysis.totalTimeHours = Math.round((analysis.totalTimeMinutes / 60) * 100) / 100;
  analysis.averageTimePerSession = analysis.totalSessions > 0 
    ? Math.round((analysis.totalTimeMinutes / analysis.totalSessions) * 100) / 100 
    : 0;
  analysis.averageTimePerUnit = analysis.totalQuantity > 0 
    ? Math.round((analysis.totalTimeMinutes / analysis.totalQuantity) * 100) / 100 
    : 0;

  console.log(`[ANALIZA CZASU] Łączny czas: ${analysis.totalTimeMinutes} min (${analysis.totalTimeHours} h)`);
  console.log(`[ANALIZA CZASU] Łączna ilość: ${analysis.totalQuantity}`);
  console.log(`[ANALIZA CZASU] Średni czas na sesję: ${analysis.averageTimePerSession} min`);
  console.log(`[ANALIZA CZASU] Średni czas na jednostkę: ${analysis.averageTimePerUnit} min`);

  return analysis;
};

/**
 * Formatuje minuty na format czytelny dla użytkownika
 * @param {number} minutes - Liczba minut
 * @returns {string} - Sformatowany czas
 */
export const formatMinutes = (minutes) => {
  if (!minutes) return '0 min';
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = Math.round(minutes % 60);
  
  if (hours > 0) {
    return `${hours}h ${remainingMinutes}min`;
  } else {
    return `${remainingMinutes} min`;
  }
};

/**
 * Pobiera zadania produkcyjne dla analizy czasu
 * @param {Array} taskIds - Lista ID zadań
 * @returns {Promise<Object>} - Mapa zadań {taskId: task}
 */
export const getTasksForTimeAnalysis = async (taskIds) => {
  try {
    if (!taskIds || taskIds.length === 0) {
      return {};
    }

    console.log(`[ANALIZA CZASU] Pobieranie ${taskIds.length} zadań produkcyjnych`);
    
    const tasksRef = collection(db, 'productionTasks');
    const tasksMap = {};
    
    // Pobierz zadania batch'ami (Firestore ma limit 10 elementów dla where...in)
    const batchSize = 10;
    for (let i = 0; i < taskIds.length; i += batchSize) {
      const batch = taskIds.slice(i, i + batchSize);
      const q = query(tasksRef, where('__name__', 'in', batch));
      const querySnapshot = await getDocs(q);
      
      querySnapshot.docs.forEach(doc => {
        tasksMap[doc.id] = {
          id: doc.id,
          ...doc.data()
        };
      });
    }

    console.log(`[ANALIZA CZASU] Pobrano ${Object.keys(tasksMap).length} zadań`);
    return tasksMap;
  } catch (error) {
    console.error('Błąd podczas pobierania zadań:', error);
    return {};
  }
};
