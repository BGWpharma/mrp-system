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
import { format, isWithinInterval, parseISO, eachDayOfInterval, isWeekend, setHours, setMinutes, isAfter, isBefore, differenceInMinutes } from 'date-fns';
import plLocale from 'date-fns/locale/pl';

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
  } else if (remainingMinutes > 0) {
    return `${remainingMinutes} min`;
  } else {
    // Dla wartości poniżej 1 minuty pokazuj sekundy
    const seconds = Math.round(minutes * 60);
    return `${seconds} sek`;
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

/**
 * Sprawdza luki w czasach produkcji w zadanym okresie
 * @param {Date} startDate - Data początkowa analizy
 * @param {Date} endDate - Data końcowa analizy
 * @param {Object} options - Opcje analizy
 * @param {number} options.workStartHour - Godzina rozpoczęcia pracy (domyślnie 6)
 * @param {number} options.workEndHour - Godzina zakończenia pracy (domyślnie 22)
 * @param {boolean} options.includeWeekends - Czy uwzględniać weekendy (domyślnie false)
 * @param {number} options.minGapMinutes - Minimalna długość luki w minutach do raportowania (domyślnie 30)
 * @returns {Promise<Object>} - Analiza luk w produkcji
 */
export const analyzeProductionGaps = async (startDate, endDate, options = {}) => {
  const {
    workStartHour = 6,
    workEndHour = 22,
    includeWeekends = false,
    minGapMinutes = 30
  } = options;

  try {
    console.log(`[ANALIZA LUK] Rozpoczęcie analizy luk od ${format(startDate, 'dd.MM.yyyy')} do ${format(endDate, 'dd.MM.yyyy')}`);
    
    // Pobierz historię produkcji dla zadanego okresu
    const productionHistory = await getProductionHistoryByDateRange(startDate, endDate);
    
    // Pobierz informacje o zadaniach dla tych sesji
    const taskIds = [...new Set(productionHistory.map(session => session.taskId).filter(Boolean))];
    const tasksMap = taskIds.length > 0 ? await getTasksForTimeAnalysis(taskIds) : {};
    
    // Sortuj sesje według czasu rozpoczęcia
    const sortedSessions = productionHistory
      .map(session => {
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

        return {
          ...session,
          startTime,
          endTime
        };
      })
      .filter(session => session.startTime && session.endTime)
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    // Generuj wszystkie dni robocze w zadanym okresie, ale nie dalej niż dzisiaj
    const today = new Date();
    today.setHours(23, 59, 59, 999); // Ustaw na koniec dnia dzisiejszego
    
    const effectiveEndDate = endDate > today ? today : endDate;
    const allDays = eachDayOfInterval({ start: startDate, end: effectiveEndDate });
    const workDays = includeWeekends ? allDays : allDays.filter(day => !isWeekend(day));

    const gaps = [];
    const dailyAnalysis = {};
    let totalWorkMinutes = 0;
    let totalProductionMinutes = 0;
    let totalGapMinutes = 0;

    for (const day of workDays) {
      const dayStart = setMinutes(setHours(day, workStartHour), 0);
      const dayEnd = setMinutes(setHours(day, workEndHour), 0);
      const dayKey = format(day, 'yyyy-MM-dd');

      // Oblicz całkowity czas pracy w dniu (w minutach)
      const workMinutesInDay = (workEndHour - workStartHour) * 60;
      totalWorkMinutes += workMinutesInDay;

      // Znajdź wszystkie sesje produkcyjne w tym dniu
      const daysSessions = sortedSessions.filter(session => {
        return format(session.startTime, 'yyyy-MM-dd') === dayKey;
      });

      dailyAnalysis[dayKey] = {
        date: dayKey,
        formattedDate: format(day, 'dd.MM.yyyy'),
        dayOfWeek: format(day, 'EEEE', { locale: plLocale }),
        workStart: format(dayStart, 'HH:mm'),
        workEnd: format(dayEnd, 'HH:mm'),
        workStartTime: dayStart,
        workEndTime: dayEnd,
        totalWorkMinutes: workMinutesInDay,
        sessions: daysSessions.length,
        sessionDetails: daysSessions, // Dodaj szczegóły sesji
        productionMinutes: 0,
        gapMinutes: 0,
        gaps: [],
        coverage: 0 // procent pokrycia czasu pracy przez produkcję
      };

      if (daysSessions.length === 0) {
        // Cały dzień bez produkcji
        const gap = {
          type: 'full_day',
          date: dayKey,
          formattedDate: format(day, 'dd.MM.yyyy'),
          dayOfWeek: format(day, 'EEEE', { locale: plLocale }),
          startTime: dayStart,
          endTime: dayEnd,
          formattedStartTime: format(dayStart, 'HH:mm'),
          formattedEndTime: format(dayEnd, 'HH:mm'),
          gapMinutes: workMinutesInDay,
          description: `Brak produkcji przez cały dzień roboczy (${format(dayStart, 'HH:mm')} - ${format(dayEnd, 'HH:mm')})`
        };
        
        gaps.push(gap);
        dailyAnalysis[dayKey].gaps.push(gap);
        dailyAnalysis[dayKey].gapMinutes = workMinutesInDay;
        totalGapMinutes += workMinutesInDay;
        continue;
      }

      // NOWA LOGIKA: Łączenie nakładających się sesji w ciągłe okresy produkcji
      const mergedPeriods = [];
      
      if (daysSessions.length > 0) {
        // Sortuj sesje według czasu rozpoczęcia (już posortowane, ale dla pewności)
        const sortedDaySessions = [...daysSessions].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
        
        let currentPeriod = {
          startTime: sortedDaySessions[0].startTime,
          endTime: sortedDaySessions[0].endTime,
          sessions: [sortedDaySessions[0]]
        };
        
        for (let i = 1; i < sortedDaySessions.length; i++) {
          const session = sortedDaySessions[i];
          
          // Sprawdź czy sesja nakłada się lub bezpośrednio sąsiaduje z obecnym okresem
          // Używamy <= zamiast < aby uwzględnić przypadki gdy jedna sesja kończy się dokładnie gdy druga się zaczyna
          if (session.startTime <= currentPeriod.endTime) {
            // Sesja nakłada się lub sąsiaduje - rozszerz obecny okres
            currentPeriod.endTime = new Date(Math.max(currentPeriod.endTime.getTime(), session.endTime.getTime()));
            currentPeriod.sessions.push(session);
            
            console.log(`[ANALIZA LUK] Połączono nakładające się sesje: ${format(session.startTime, 'HH:mm')}-${format(session.endTime, 'HH:mm')} z okresem ${format(currentPeriod.startTime, 'HH:mm')}-${format(currentPeriod.endTime, 'HH:mm')}`);
          } else {
            // Sesja nie nakłada się - zakończ obecny okres i rozpocznij nowy
            mergedPeriods.push(currentPeriod);
            currentPeriod = {
              startTime: session.startTime,
              endTime: session.endTime,
              sessions: [session]
            };
          }
        }
        
        // Dodaj ostatni okres
        mergedPeriods.push(currentPeriod);
        
        console.log(`[ANALIZA LUK] Dzień ${dayKey}: ${daysSessions.length} sesji połączono w ${mergedPeriods.length} ciągłych okresów produkcji`);
      }

      // Sprawdź lukę przed pierwszym okresem
      if (mergedPeriods.length > 0) {
        const firstPeriod = mergedPeriods[0];
        if (isAfter(firstPeriod.startTime, dayStart)) {
          const gapMinutes = differenceInMinutes(firstPeriod.startTime, dayStart);
          if (gapMinutes >= minGapMinutes) {
            const gap = {
              type: 'before_first_session',
              date: dayKey,
              formattedDate: format(day, 'dd.MM.yyyy'),
              dayOfWeek: format(day, 'EEEE', { locale: plLocale }),
              startTime: dayStart,
              endTime: firstPeriod.startTime,
              formattedStartTime: format(dayStart, 'HH:mm'),
              formattedEndTime: format(firstPeriod.startTime, 'HH:mm'),
              gapMinutes,
              nextSessions: firstPeriod.sessions.map(session => ({
                id: session.id,
                taskId: session.taskId,
                quantity: session.quantity,
                task: tasksMap[session.taskId] || null
              })),
              description: `Luka przed pierwszym okresem produkcyjnym (${format(dayStart, 'HH:mm')} - ${format(firstPeriod.startTime, 'HH:mm')})`
            };
            
            gaps.push(gap);
            dailyAnalysis[dayKey].gaps.push(gap);
            dailyAnalysis[dayKey].gapMinutes += gapMinutes;
            totalGapMinutes += gapMinutes;
          }
        }
      }

      // Sprawdź luki między okresami produkcji
      for (let i = 0; i < mergedPeriods.length - 1; i++) {
        const currentPeriod = mergedPeriods[i];
        const nextPeriod = mergedPeriods[i + 1];
        
        // Teraz sprawdzamy luki tylko między rzeczywiście oddzielonymi okresami
        const gapMinutes = differenceInMinutes(nextPeriod.startTime, currentPeriod.endTime);
        if (gapMinutes >= minGapMinutes) {
          const gap = {
            type: 'between_sessions',
            date: dayKey,
            formattedDate: format(day, 'dd.MM.yyyy'),
            dayOfWeek: format(day, 'EEEE', { locale: plLocale }),
            startTime: currentPeriod.endTime,
            endTime: nextPeriod.startTime,
            formattedStartTime: format(currentPeriod.endTime, 'HH:mm'),
            formattedEndTime: format(nextPeriod.startTime, 'HH:mm'),
            gapMinutes,
            beforeSessions: currentPeriod.sessions.map(session => ({
              id: session.id,
              taskId: session.taskId,
              quantity: session.quantity,
              task: tasksMap[session.taskId] || null
            })),
            afterSessions: nextPeriod.sessions.map(session => ({
              id: session.id,
              taskId: session.taskId,
              quantity: session.quantity,
              task: tasksMap[session.taskId] || null
            })),
            description: `Luka między okresami produkcyjnymi (${format(currentPeriod.endTime, 'HH:mm')} - ${format(nextPeriod.startTime, 'HH:mm')})`
          };
          
          gaps.push(gap);
          dailyAnalysis[dayKey].gaps.push(gap);
          dailyAnalysis[dayKey].gapMinutes += gapMinutes;
          totalGapMinutes += gapMinutes;
        }
      }

      // Sprawdź lukę po ostatnim okresie
      if (mergedPeriods.length > 0) {
        const lastPeriod = mergedPeriods[mergedPeriods.length - 1];
        if (isBefore(lastPeriod.endTime, dayEnd)) {
          const gapMinutes = differenceInMinutes(dayEnd, lastPeriod.endTime);
          if (gapMinutes >= minGapMinutes) {
            const gap = {
              type: 'after_last_session',
              date: dayKey,
              formattedDate: format(day, 'dd.MM.yyyy'),
              dayOfWeek: format(day, 'EEEE', { locale: plLocale }),
              startTime: lastPeriod.endTime,
              endTime: dayEnd,
              formattedStartTime: format(lastPeriod.endTime, 'HH:mm'),
              formattedEndTime: format(dayEnd, 'HH:mm'),
              gapMinutes,
              previousSessions: lastPeriod.sessions.map(session => ({
                id: session.id,
                taskId: session.taskId,
                quantity: session.quantity,
                task: tasksMap[session.taskId] || null
              })),
              description: `Luka po ostatnim okresie produkcyjnym (${format(lastPeriod.endTime, 'HH:mm')} - ${format(dayEnd, 'HH:mm')})`
            };
            
            gaps.push(gap);
            dailyAnalysis[dayKey].gaps.push(gap);
            dailyAnalysis[dayKey].gapMinutes += gapMinutes;
            totalGapMinutes += gapMinutes;
          }
        }
      }

      // Oblicz łączny czas produkcji w dniu
      daysSessions.forEach(session => {
        if (session.timeSpent) {
          dailyAnalysis[dayKey].productionMinutes += session.timeSpent;
          totalProductionMinutes += session.timeSpent;
        }
      });

      // Oblicz pokrycie procentowe
      dailyAnalysis[dayKey].coverage = dailyAnalysis[dayKey].productionMinutes > 0 
        ? Math.round((dailyAnalysis[dayKey].productionMinutes / workMinutesInDay) * 100)
        : 0;
    }

    // Przygotuj podsumowanie
    const analysis = {
      period: {
        startDate: format(startDate, 'dd.MM.yyyy'),
        endDate: format(effectiveEndDate, 'dd.MM.yyyy'),
        originalEndDate: format(endDate, 'dd.MM.yyyy'),
        limitedToToday: endDate > today,
        totalDays: workDays.length,
        weekendsIncluded: includeWeekends
      },
      workSchedule: {
        startHour: workStartHour,
        endHour: workEndHour,
        dailyWorkHours: workEndHour - workStartHour,
        dailyWorkMinutes: (workEndHour - workStartHour) * 60
      },
      summary: {
        totalWorkMinutes,
        totalWorkHours: Math.round((totalWorkMinutes / 60) * 100) / 100,
        totalProductionMinutes,
        totalProductionHours: Math.round((totalProductionMinutes / 60) * 100) / 100,
        totalGapMinutes,
        totalGapHours: Math.round((totalGapMinutes / 60) * 100) / 100,
        overallCoverage: totalWorkMinutes > 0 
          ? Math.round((totalProductionMinutes / totalWorkMinutes) * 100)
          : 0,
        gapsCount: gaps.length,
        daysWithGaps: Object.values(dailyAnalysis).filter(day => day.gaps.length > 0).length,
        daysWithoutProduction: Object.values(dailyAnalysis).filter(day => day.sessions === 0).length
      },
      gaps: gaps.sort((a, b) => b.gapMinutes - a.gapMinutes), // Sortuj od największych luk
      dailyAnalysis,
      recommendations: generateProductionRecommendations(gaps, dailyAnalysis, { workStartHour, workEndHour, minGapMinutes }),
      tasksMap // Dodaj mapę zadań do wyników
    };

    console.log(`[ANALIZA LUK] Znaleziono ${gaps.length} luk o łącznej długości ${totalGapMinutes} minut`);
    console.log(`[ANALIZA LUK] Pokrycie produkcją: ${analysis.summary.overallCoverage}%`);
    if (endDate > today) {
      console.log(`[ANALIZA LUK] Okres analizy ograniczony do dzisiaj (${format(today, 'dd.MM.yyyy')}) zamiast ${format(endDate, 'dd.MM.yyyy')}`);
    }

    return analysis;

  } catch (error) {
    console.error('Błąd podczas analizy luk w produkcji:', error);
    throw error;
  }
};

/**
 * Generuje zalecenia na podstawie analizy luk w produkcji
 * @param {Array} gaps - Lista znalezionych luk
 * @param {Object} dailyAnalysis - Analiza dzienna
 * @param {Object} options - Opcje analizy
 * @returns {Array} - Lista zaleceń
 */
const generateProductionRecommendations = (gaps, dailyAnalysis, options) => {
  const recommendations = [];
  const { workStartHour, workEndHour, minGapMinutes } = options;

  // Sprawdź czy są długie luki
  const longGaps = gaps.filter(gap => gap.gapMinutes > 120); // Powyżej 2 godzin
  if (longGaps.length > 0) {
    recommendations.push({
      type: 'long_gaps',
      severity: 'high',
      title: 'Wykryto długie przerwy w produkcji',
      description: `Znaleziono ${longGaps.length} luk dłuższych niż 2 godziny. Najdłuższa luka: ${Math.round(Math.max(...longGaps.map(g => g.gapMinutes)) / 60 * 100) / 100} godzin.`,
      suggestions: [
        'Sprawdź czy wszystkie sesje produkcyjne zostały prawidłowo zarejestrowane',
        'Zweryfikuj czy w czasie długich przerw nie odbywała się produkcja',
        'Rozważ wprowadzenie automatycznego monitorowania czasu pracy'
      ]
    });
  }

  // Sprawdź dni bez produkcji
  const daysWithoutProduction = Object.values(dailyAnalysis).filter(day => day.sessions === 0);
  if (daysWithoutProduction.length > 0) {
    recommendations.push({
      type: 'no_production_days',
      severity: 'medium',
      title: 'Dni bez zarejestrowanej produkcji',
      description: `Wykryto ${daysWithoutProduction.length} dni roboczych bez żadnej zarejestrowanej produkcji.`,
      suggestions: [
        'Sprawdź czy w te dni faktycznie nie odbywała się produkcja',
        'Zweryfikuj poprawność rejestrowania sesji produkcyjnych',
        'Upewnij się, że pracownicy prawidłowo korzystają z systemu'
      ]
    });
  }

  // Sprawdź niskie pokrycie
  const lowCoverageDays = Object.values(dailyAnalysis).filter(day => day.coverage < 50 && day.sessions > 0);
  if (lowCoverageDays.length > 0) {
    recommendations.push({
      type: 'low_coverage',
      severity: 'medium',
      title: 'Niskie pokrycie czasu pracy',
      description: `Wykryto ${lowCoverageDays.length} dni z pokryciem produkcją poniżej 50% czasu pracy.`,
      suggestions: [
        'Sprawdź czy czas trwania sesji jest prawidłowo rejestrowany',
        'Zweryfikuj czy wszystkie czynności produkcyjne są uwzględniane',
        'Rozważ optymalizację procesów produkcyjnych'
      ]
    });
  }

  // Sprawdź wzorce luk
  const earlyGaps = gaps.filter(gap => gap.type === 'before_first_session');
  const lateGaps = gaps.filter(gap => gap.type === 'after_last_session');

  if (earlyGaps.length > 3) {
    recommendations.push({
      type: 'early_gaps_pattern',
      severity: 'low',
      title: 'Wzorzec opóźnień rozpoczęcia pracy',
      description: `Wykryto ${earlyGaps.length} przypadków opóźnionego rozpoczęcia produkcji względem godzin pracy zakładu.`,
      suggestions: [
        'Sprawdź czy godziny rozpoczęcia pracy są prawidłowo ustawione',
        'Zweryfikuj procedury przygotowania do produkcji',
        'Rozważ dostosowanie harmonogramu pracy'
      ]
    });
  }

  if (lateGaps.length > 3) {
    recommendations.push({
      type: 'late_gaps_pattern',
      severity: 'low',
      title: 'Wzorzec przedwczesnego zakończenia pracy',
      description: `Wykryto ${lateGaps.length} przypadków przedwczesnego zakończenia produkcji względem godzin pracy zakładu.`,
      suggestions: [
        'Sprawdź czy godziny zakończenia pracy są prawidłowo ustawione',
        'Zweryfikuj procedury kończenia produkcji',
        'Rozważ optymalizację harmonogramu pracy'
      ]
    });
  }

  return recommendations;
};
