// src/services/weeklyProductivityService.js
import { format, startOfISOWeek, endOfISOWeek, eachDayOfInterval } from 'date-fns';
import { pl } from 'date-fns/locale';

/**
 * Oblicza metryki wydajności dla danych tygodniowych
 * @param {Object} weekData - Dane tygodnia z timeByWeek
 * @returns {Object} - Wzbogacone dane z metrykami wydajności
 */
export const calculateWeeklyProductivity = (weekData) => {
  const totalTimeHours = weekData.totalTime / 60;
  const productivity = totalTimeHours > 0 ? weekData.totalQuantity / totalTimeHours : 0;
  const avgSessionDuration = weekData.sessionsCount > 0 ? weekData.totalTime / weekData.sessionsCount : 0;
  const avgQuantityPerSession = weekData.sessionsCount > 0 ? weekData.totalQuantity / weekData.sessionsCount : 0;
  
  return {
    ...weekData,
    totalTimeHours: Math.round(totalTimeHours * 100) / 100,
    productivity: Math.round(productivity * 100) / 100,
    avgSessionDuration: Math.round(avgSessionDuration * 100) / 100,
    avgQuantityPerSession: Math.round(avgQuantityPerSession * 100) / 100
  };
};

/**
 * Porównuje dwa tygodnie i oblicza zmiany procentowe
 * @param {Object} currentWeek - Dane bieżącego tygodnia
 * @param {Object} previousWeek - Dane poprzedniego tygodnia
 * @returns {Object} - Porównanie z procentowymi zmianami
 */
export const compareWeeks = (currentWeek, previousWeek) => {
  if (!previousWeek || previousWeek.productivity === 0) {
    return {
      productivityChange: 0,
      quantityChange: 0,
      timeChange: 0,
      sessionsChange: 0,
      trend: 'neutral'
    };
  }

  const productivityChange = ((currentWeek.productivity - previousWeek.productivity) / previousWeek.productivity) * 100;
  const quantityChange = ((currentWeek.totalQuantity - previousWeek.totalQuantity) / previousWeek.totalQuantity) * 100;
  const timeChange = ((currentWeek.totalTimeHours - previousWeek.totalTimeHours) / previousWeek.totalTimeHours) * 100;
  const sessionsChange = ((currentWeek.sessionsCount - previousWeek.sessionsCount) / previousWeek.sessionsCount) * 100;
  
  return {
    productivityChange: Math.round(productivityChange * 10) / 10,
    quantityChange: Math.round(quantityChange * 10) / 10,
    timeChange: Math.round(timeChange * 10) / 10,
    sessionsChange: Math.round(sessionsChange * 10) / 10,
    trend: productivityChange > 5 ? 'improving' : productivityChange < -5 ? 'declining' : 'stable'
  };
};

/**
 * Analizuje breakdown produktów/zadań dla tygodnia
 * @param {Array} sessions - Sesje produkcyjne w tygodniu
 * @param {Object} tasksMap - Mapa zadań
 * @returns {Array} - Breakdown według zadań/produktów
 */
export const getWeeklyBreakdown = (sessions, tasksMap = {}) => {
  const breakdown = {};
  
  sessions.forEach(session => {
    const task = tasksMap[session.taskId];
    const taskKey = task?.moNumber || task?.name || task?.productName || 'Nieznane';
    
    if (!breakdown[taskKey]) {
      breakdown[taskKey] = {
        taskKey,
        taskId: session.taskId,
        taskName: task?.name || task?.productName || 'Nieznane',
        moNumber: task?.moNumber || '',
        totalTime: 0,
        totalQuantity: 0,
        sessionsCount: 0,
        productivity: 0
      };
    }
    
    breakdown[taskKey].totalTime += session.timeSpent || 0;
    breakdown[taskKey].totalQuantity += session.quantity || 0;
    breakdown[taskKey].sessionsCount += 1;
  });
  
  // Oblicz produktywność i procentowy udział
  const totalTime = Object.values(breakdown).reduce((sum, item) => sum + item.totalTime, 0);
  const totalQuantity = Object.values(breakdown).reduce((sum, item) => sum + item.totalQuantity, 0);
  
  return Object.values(breakdown)
    .map(item => {
      const timeHours = item.totalTime / 60;
      return {
        ...item,
        totalTimeHours: Math.round(timeHours * 100) / 100,
        productivity: timeHours > 0 ? Math.round((item.totalQuantity / timeHours) * 100) / 100 : 0,
        timePercentage: totalTime > 0 ? Math.round((item.totalTime / totalTime) * 100 * 10) / 10 : 0,
        quantityPercentage: totalQuantity > 0 ? Math.round((item.totalQuantity / totalQuantity) * 100 * 10) / 10 : 0
      };
    })
    .sort((a, b) => b.totalTime - a.totalTime);
};

/**
 * Analizuje szczegóły dzienne dla tygodnia
 * @param {Array} sessions - Sesje produkcyjne w tygodniu
 * @param {Date} weekStart - Początek tygodnia
 * @param {Date} weekEnd - Koniec tygodnia
 * @returns {Array} - Breakdown dzienny
 */
export const getDailyBreakdown = (sessions, weekStart, weekEnd) => {
  const dailyData = {};
  
  // Inicjalizuj wszystkie dni tygodnia
  const allDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
  allDays.forEach(day => {
    const dayKey = format(day, 'yyyy-MM-dd');
    dailyData[dayKey] = {
      date: dayKey,
      dayName: format(day, 'EEEE', { locale: pl }),
      dayShort: format(day, 'EEE', { locale: pl }),
      totalTime: 0,
      totalQuantity: 0,
      sessionsCount: 0,
      productivity: 0
    };
  });
  
  // Agreguj sesje według dni
  sessions.forEach(session => {
    const startTime = session.startTime instanceof Date ? session.startTime : new Date(session.startTime);
    const dayKey = format(startTime, 'yyyy-MM-dd');
    
    if (dailyData[dayKey]) {
      dailyData[dayKey].totalTime += session.timeSpent || 0;
      dailyData[dayKey].totalQuantity += session.quantity || 0;
      dailyData[dayKey].sessionsCount += 1;
    }
  });
  
  // Oblicz produktywność
  return Object.values(dailyData).map(day => {
    const timeHours = day.totalTime / 60;
    return {
      ...day,
      totalTimeHours: Math.round(timeHours * 100) / 100,
      productivity: timeHours > 0 ? Math.round((day.totalQuantity / timeHours) * 100) / 100 : 0
    };
  });
};

/**
 * Analizuje trendy tygodniowe
 * @param {Array} weeksData - Tablica danych tygodniowych
 * @returns {Object} - Analiza trendów
 */
export const analyzeWeeklyTrends = (weeksData) => {
  if (!weeksData || weeksData.length === 0) {
    return {
      avgProductivity: 0,
      maxProductivity: 0,
      minProductivity: 0,
      bestWeek: null,
      worstWeek: null,
      trend: 'neutral',
      trendDescription: 'Brak danych'
    };
  }

  const productivities = weeksData.map(w => w.productivity);
  const avgProductivity = productivities.reduce((sum, p) => sum + p, 0) / productivities.length;
  const maxProductivity = Math.max(...productivities);
  const minProductivity = Math.min(...productivities);
  
  const bestWeek = weeksData.find(w => w.productivity === maxProductivity);
  const worstWeek = weeksData.find(w => w.productivity === minProductivity);
  
  // Oblicz trend (porównaj pierwszą i ostatnią połowę okresu)
  const midPoint = Math.floor(weeksData.length / 2);
  const firstHalf = weeksData.slice(0, midPoint);
  const secondHalf = weeksData.slice(midPoint);
  
  const firstHalfAvg = firstHalf.reduce((sum, w) => sum + w.productivity, 0) / firstHalf.length;
  const secondHalfAvg = secondHalf.reduce((sum, w) => sum + w.productivity, 0) / secondHalf.length;
  
  let trend = 'stable';
  let trendDescription = 'Wydajność stabilna';
  
  if (secondHalfAvg > firstHalfAvg * 1.1) {
    trend = 'improving';
    trendDescription = 'Wydajność rośnie';
  } else if (secondHalfAvg < firstHalfAvg * 0.9) {
    trend = 'declining';
    trendDescription = 'Wydajność spada';
  }
  
  return {
    avgProductivity: Math.round(avgProductivity * 100) / 100,
    maxProductivity: Math.round(maxProductivity * 100) / 100,
    minProductivity: Math.round(minProductivity * 100) / 100,
    bestWeek,
    worstWeek,
    trend,
    trendDescription
  };
};

/**
 * Przygotowuje dane tygodniowe z porównaniami
 * @param {Object} timeAnalysis - Analiza czasu z productionTimeAnalysisService
 * @param {Object} tasksMap - Mapa zadań
 * @returns {Array} - Wzbogacone dane tygodniowe
 */
export const prepareWeeklyData = (timeAnalysis, tasksMap = {}) => {
  if (!timeAnalysis || !timeAnalysis.timeByWeek) {
    return [];
  }

  const weeksArray = Object.values(timeAnalysis.timeByWeek)
    .sort((a, b) => a.week.localeCompare(b.week));
  
  // Wzbogać dane o metryki wydajności
  const enrichedWeeks = weeksArray.map(week => calculateWeeklyProductivity(week));
  
  // Dodaj porównania z poprzednim tygodniem
  const weeksWithComparison = enrichedWeeks.map((week, index) => {
    const previousWeek = index > 0 ? enrichedWeeks[index - 1] : null;
    const comparison = compareWeeks(week, previousWeek);
    
    // Parsuj tydzień do daty
    const [year, weekNum] = week.week.split('-W');
    const weekDate = new Date(parseInt(year), 0, 1 + (parseInt(weekNum) - 1) * 7);
    const weekStart = startOfISOWeek(weekDate);
    const weekEnd = endOfISOWeek(weekDate);
    
    // Pobierz sesje dla tego tygodnia
    const weekSessions = (timeAnalysis.sessions || []).filter(session => {
      const sessionDate = session.startTime instanceof Date ? session.startTime : new Date(session.startTime);
      return sessionDate >= weekStart && sessionDate <= weekEnd;
    });
    
    // Oblicz breakdown
    const breakdown = getWeeklyBreakdown(weekSessions, tasksMap);
    const topProduct = breakdown.length > 0 ? breakdown[0] : null;
    
    // Oblicz efektywność (zakładam 40h jako standardowy tydzień pracy)
    const standardWorkWeek = 40;
    const efficiency = Math.round((week.totalTimeHours / standardWorkWeek) * 100);
    
    return {
      ...week,
      ...comparison,
      weekStart,
      weekEnd,
      weekLabel: `${format(weekStart, 'dd.MM', { locale: pl })} - ${format(weekEnd, 'dd.MM.yyyy', { locale: pl })}`,
      breakdown,
      topProduct,
      efficiency: Math.min(efficiency, 100), // Max 100%
      sessions: weekSessions
    };
  });
  
  return weeksWithComparison;
};

/**
 * Generuje insights/alerty dla wydajności tygodniowej
 * @param {Array} weeksData - Dane tygodniowe
 * @returns {Array} - Lista insights
 */
export const generateWeeklyInsights = (weeksData) => {
  const insights = [];
  
  if (!weeksData || weeksData.length === 0) {
    return insights;
  }
  
  const trends = analyzeWeeklyTrends(weeksData);
  const latestWeek = weeksData[weeksData.length - 1];
  
  // Insight 1: Trend ogólny
  if (trends.trend === 'improving') {
    insights.push({
      type: 'success',
      title: '📈 Wydajność rośnie',
      description: `${trends.trendDescription}. Świetna robota!`
    });
  } else if (trends.trend === 'declining') {
    insights.push({
      type: 'warning',
      title: '📉 Spadek wydajności',
      description: `${trends.trendDescription}. Warto przeanalizować przyczyny.`
    });
  }
  
  // Insight 2: Ostatni tydzień
  if (latestWeek.productivityChange > 10) {
    insights.push({
      type: 'success',
      title: '🚀 Znaczący wzrost',
      description: `Wydajność w ostatnim tygodniu wzrosła o ${latestWeek.productivityChange.toFixed(1)}%!`
    });
  } else if (latestWeek.productivityChange < -10) {
    insights.push({
      type: 'error',
      title: '⚠️ Znaczący spadek',
      description: `Wydajność w ostatnim tygodniu spadła o ${Math.abs(latestWeek.productivityChange).toFixed(1)}%.`
    });
  }
  
  // Insight 3: Rekord
  if (latestWeek.productivity === trends.maxProductivity && weeksData.length > 1) {
    insights.push({
      type: 'success',
      title: '🏆 Nowy rekord!',
      description: `Ostatni tydzień osiągnął najlepszą wydajność: ${latestWeek.productivity} szt/h`
    });
  }
  
  // Insight 4: Niska efektywność
  if (latestWeek.efficiency < 50) {
    insights.push({
      type: 'info',
      title: '💡 Niska efektywność czasu',
      description: `Wykorzystano tylko ${latestWeek.efficiency}% dostępnego czasu. Można poprawić planowanie.`
    });
  }
  
  // Insight 5: Top produkt
  if (latestWeek.topProduct && latestWeek.topProduct.timePercentage > 50) {
    insights.push({
      type: 'info',
      title: '🎯 Dominujący produkt',
      description: `${latestWeek.topProduct.taskName} zajął ${latestWeek.topProduct.timePercentage}% czasu produkcji.`
    });
  }
  
  return insights;
};

/**
 * Formatuje week string (np. "2026-W02") na czytelny format
 * @param {string} weekString - Format ISO week (YYYY-Www)
 * @param {string} weekPrefix - Prefix dla tygodnia (np. "Tydz." lub "Week")
 * @returns {string} - Sformatowany string
 */
export const formatWeekString = (weekString, weekPrefix = 'Tydz.') => {
  try {
    const [year, weekNum] = weekString.split('-W');
    const weekDate = new Date(parseInt(year), 0, 1 + (parseInt(weekNum) - 1) * 7);
    const weekStart = startOfISOWeek(weekDate);
    const weekEnd = endOfISOWeek(weekDate);
    
    return `${weekPrefix} ${weekNum}/${year.slice(2)} (${format(weekStart, 'dd.MM', { locale: pl })} - ${format(weekEnd, 'dd.MM', { locale: pl })})`;
  } catch (error) {
    return weekString;
  }
};

