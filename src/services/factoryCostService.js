// src/services/factoryCostService.js
/**
 * Serwis do zarządzania kosztami zakładu
 * Obsługuje CRUD kosztów oraz obliczenia efektywnego czasu pracy
 */

import { 
  collection, 
  doc, 
  addDoc,
  getDoc,
  getDocs, 
  updateDoc,
  deleteDoc,
  query, 
  where,
  orderBy,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from './firebase/config';
import { getProductionHistoryByDateRange } from './productionTimeAnalysisService';
import { format, parseISO, isWithinInterval } from 'date-fns';

const FACTORY_COSTS_COLLECTION = 'factoryCosts';

/**
 * Pobiera listę zadań produkcyjnych (MO) z sesjami w podanym zakresie dat
 * Używane do wyświetlania listy MO do wykluczenia
 * @param {Date} startDate - Data początkowa
 * @param {Date} endDate - Data końcowa
 * @returns {Promise<Array>} - Lista unikalnych zadań z informacjami
 */
export const getProductionTasksInDateRange = async (startDate, endDate) => {
  try {
    console.log(`[FACTORY COST] Pobieranie zadań produkcyjnych w zakresie ${format(startDate, 'dd.MM.yyyy')} - ${format(endDate, 'dd.MM.yyyy')}`);
    
    // Pobierz sesje nachodzące na zakres
    const historyRef = collection(db, 'productionHistory');
    const q = query(historyRef, orderBy('startTime', 'asc'));
    
    const querySnapshot = await getDocs(q);
    const allHistory = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Filtruj sesje nachodzące na zakres
    const filteredHistory = allHistory.filter(session => {
      if (!session.startTime || !session.endTime) return false;

      let startTime = session.startTime;
      if (startTime?.toDate) startTime = startTime.toDate();
      else if (typeof startTime === 'string') startTime = parseISO(startTime);
      else if (!(startTime instanceof Date)) startTime = new Date(startTime);

      let endTime = session.endTime;
      if (endTime?.toDate) endTime = endTime.toDate();
      else if (typeof endTime === 'string') endTime = parseISO(endTime);
      else if (!(endTime instanceof Date)) endTime = new Date(endTime);

      return startTime <= endDate && endTime >= startDate;
    });

    // Zbierz unikalne taskId
    const taskIds = [...new Set(filteredHistory.map(s => s.taskId).filter(Boolean))];
    
    if (taskIds.length === 0) {
      return [];
    }

    // Pobierz szczegóły zadań
    const tasksRef = collection(db, 'productionTasks');
    const tasksMap = {};
    
    // Pobierz zadania batch'ami (limit 10 dla where...in)
    const batchSize = 10;
    for (let i = 0; i < taskIds.length; i += batchSize) {
      const batch = taskIds.slice(i, i + batchSize);
      const tasksQuery = query(tasksRef, where('__name__', 'in', batch));
      const tasksSnapshot = await getDocs(tasksQuery);
      
      tasksSnapshot.forEach(doc => {
        tasksMap[doc.id] = {
          id: doc.id,
          ...doc.data()
        };
      });
    }

    // Oblicz czas dla każdego zadania w zakresie
    const tasksSummary = taskIds.map(taskId => {
      const task = tasksMap[taskId] || {};
      const taskSessions = filteredHistory.filter(s => s.taskId === taskId);
      
      // Oblicz czas sesji w zakresie (przycięty)
      let totalMinutes = 0;
      taskSessions.forEach(session => {
        let startTime = session.startTime;
        if (startTime?.toDate) startTime = startTime.toDate();
        else if (!(startTime instanceof Date)) startTime = new Date(startTime);
        
        let endTime = session.endTime;
        if (endTime?.toDate) endTime = endTime.toDate();
        else if (!(endTime instanceof Date)) endTime = new Date(endTime);
        
        const effectiveStart = new Date(Math.max(startTime.getTime(), startDate.getTime()));
        const effectiveEnd = new Date(Math.min(endTime.getTime(), endDate.getTime()));
        
        if (effectiveStart < effectiveEnd) {
          totalMinutes += (effectiveEnd - effectiveStart) / (1000 * 60);
        }
      });

      return {
        taskId,
        moNumber: task.moNumber || `MO-${taskId.substring(0, 8)}`,
        productName: task.productName || task.name || 'Nieznany produkt',
        orderId: task.orderId || null,
        orderNumber: task.orderNumber || null,
        sessionsCount: taskSessions.length,
        totalMinutes: Math.round(totalMinutes),
        totalHours: Math.round(totalMinutes / 60 * 100) / 100
      };
    });

    // Sortuj po numerze MO
    tasksSummary.sort((a, b) => (a.moNumber || '').localeCompare(b.moNumber || ''));

    console.log(`[FACTORY COST] Znaleziono ${tasksSummary.length} zadań produkcyjnych w zakresie`);
    return tasksSummary;
  } catch (error) {
    console.error('Błąd podczas pobierania zadań produkcyjnych:', error);
    throw error;
  }
};

/**
 * Dodaje nowy koszt zakładu i od razu oblicza efektywny czas oraz koszt/min
 * @param {Object} costData - Dane kosztu
 * @param {Date} costData.startDate - Data początkowa okresu
 * @param {Date} costData.endDate - Data końcowa okresu
 * @param {number} costData.amount - Kwota kosztu
 * @param {string} costData.description - Opis (opcjonalny)
 * @param {Array} costData.excludedTaskIds - Lista ID zadań wykluczonych z kalkulacji (opcjonalny)
 * @param {string} userId - ID użytkownika tworzącego wpis
 * @returns {Promise<Object>} - Utworzony dokument
 */
export const addFactoryCost = async (costData, userId) => {
  try {
    const startDate = new Date(costData.startDate);
    const endDate = new Date(costData.endDate);
    const amount = parseFloat(costData.amount) || 0;
    const excludedTaskIds = costData.excludedTaskIds || [];
    const isPaid = costData.isPaid !== undefined ? costData.isPaid : true; // Domyślnie opłacone

    // Oblicz efektywny czas od razu przy tworzeniu (z uwzględnieniem wykluczeń)
    const effectiveTime = await calculateEffectiveProductionTime(startDate, endDate, excludedTaskIds);
    
    // Oblicz koszt na minutę
    const costPerMinute = effectiveTime.totalMinutes > 0 
      ? amount / effectiveTime.totalMinutes 
      : 0;
    const costPerHour = costPerMinute * 60;

    const docData = {
      startDate: Timestamp.fromDate(startDate),
      endDate: Timestamp.fromDate(endDate),
      amount: amount,
      description: costData.description || '',
      excludedTaskIds: excludedTaskIds, // Lista wykluczonych zadań
      isPaid: isPaid, // Status płatności
      createdBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      // Zapisane obliczenia - będą automatycznie aktualizowane przez Cloud Function
      effectiveMinutes: effectiveTime.totalMinutes,
      effectiveHours: effectiveTime.totalHours,
      sessionsCount: effectiveTime.sessionsCount,
      mergedPeriodsCount: effectiveTime.mergedPeriodsCount,
      duplicatesEliminated: effectiveTime.duplicatesEliminated,
      clippedPeriods: effectiveTime.clippedPeriods || 0,
      excludedSessionsCount: effectiveTime.excludedSessionsCount || 0,
      costPerMinute: Math.round(costPerMinute * 100) / 100,
      costPerHour: Math.round(costPerHour * 100) / 100,
      lastCalculatedAt: serverTimestamp()
    };

    const docRef = await addDoc(collection(db, FACTORY_COSTS_COLLECTION), docData);
    
    console.log(`[FACTORY COST] Dodano koszt zakładu: ${docRef.id} z obliczeniami (wykluczone: ${excludedTaskIds.length} zadań)`);
    
    return {
      id: docRef.id,
      ...docData,
      startDate: startDate,
      endDate: endDate
    };
  } catch (error) {
    console.error('Błąd podczas dodawania kosztu zakładu:', error);
    throw error;
  }
};

/**
 * Pobiera wszystkie koszty zakładu
 * @returns {Promise<Array>} - Lista kosztów
 */
export const getFactoryCosts = async () => {
  try {
    const costsRef = collection(db, FACTORY_COSTS_COLLECTION);
    const q = query(costsRef, orderBy('startDate', 'desc'));
    
    const querySnapshot = await getDocs(q);
    const costs = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        startDate: data.startDate?.toDate ? data.startDate.toDate() : new Date(data.startDate),
        endDate: data.endDate?.toDate ? data.endDate.toDate() : new Date(data.endDate),
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : null,
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : null
      };
    });

    console.log(`[FACTORY COST] Pobrano ${costs.length} kosztów zakładu`);
    return costs;
  } catch (error) {
    console.error('Błąd podczas pobierania kosztów zakładu:', error);
    throw error;
  }
};

/**
 * Pobiera koszty zakładu w określonym zakresie dat
 * @param {Date} startDate - Data początkowa
 * @param {Date} endDate - Data końcowa
 * @returns {Promise<Array>} - Lista kosztów w zakresie
 */
export const getFactoryCostsByDateRange = async (startDate, endDate) => {
  try {
    const allCosts = await getFactoryCosts();
    
    // Filtruj koszty które nachodzą na wybrany zakres dat
    const filteredCosts = allCosts.filter(cost => {
      // Koszt nachodzi na zakres jeśli:
      // - rozpoczyna się przed końcem zakresu I
      // - kończy się po początku zakresu
      return cost.startDate <= endDate && cost.endDate >= startDate;
    });

    console.log(`[FACTORY COST] Znaleziono ${filteredCosts.length} kosztów w zakresie ${format(startDate, 'dd.MM.yyyy')} - ${format(endDate, 'dd.MM.yyyy')}`);
    return filteredCosts;
  } catch (error) {
    console.error('Błąd podczas pobierania kosztów zakładu w zakresie dat:', error);
    throw error;
  }
};

/**
 * Aktualizuje koszt zakładu i przelicza efektywny czas oraz koszt/min
 * @param {string} id - ID dokumentu do aktualizacji
 * @param {Object} updates - Dane do aktualizacji
 * @returns {Promise<void>}
 */
export const updateFactoryCost = async (id, updates) => {
  try {
    const docRef = doc(db, FACTORY_COSTS_COLLECTION, id);
    
    // Pobierz aktualne dane dokumentu
    const currentDoc = await getDoc(docRef);
    if (!currentDoc.exists()) {
      throw new Error('Koszt zakładu nie istnieje');
    }
    const currentData = currentDoc.data();
    
    // Przygotuj dane do aktualizacji
    const updateData = {
      updatedAt: serverTimestamp()
    };
    
    // Konwertuj daty
    const startDate = updates.startDate 
      ? new Date(updates.startDate) 
      : (currentData.startDate?.toDate ? currentData.startDate.toDate() : new Date(currentData.startDate));
    const endDate = updates.endDate 
      ? new Date(updates.endDate) 
      : (currentData.endDate?.toDate ? currentData.endDate.toDate() : new Date(currentData.endDate));
    const amount = updates.amount !== undefined 
      ? parseFloat(updates.amount) || 0 
      : currentData.amount;
    
    // Obsługa wykluczonych zadań
    const excludedTaskIds = updates.excludedTaskIds !== undefined 
      ? updates.excludedTaskIds 
      : (currentData.excludedTaskIds || []);

    if (updates.startDate) {
      updateData.startDate = Timestamp.fromDate(startDate);
    }
    if (updates.endDate) {
      updateData.endDate = Timestamp.fromDate(endDate);
    }
    if (updates.amount !== undefined) {
      updateData.amount = amount;
    }
    if (updates.description !== undefined) {
      updateData.description = updates.description;
    }
    if (updates.excludedTaskIds !== undefined) {
      updateData.excludedTaskIds = updates.excludedTaskIds;
    }
    if (updates.isPaid !== undefined) {
      updateData.isPaid = updates.isPaid;
    }

    // Oblicz efektywny czas na nowo (z uwzględnieniem wykluczeń)
    const effectiveTime = await calculateEffectiveProductionTime(startDate, endDate, excludedTaskIds);
    
    // Oblicz koszt na minutę
    const costPerMinute = effectiveTime.totalMinutes > 0 
      ? amount / effectiveTime.totalMinutes 
      : 0;
    const costPerHour = costPerMinute * 60;

    // Dodaj obliczone wartości
    updateData.effectiveMinutes = effectiveTime.totalMinutes;
    updateData.effectiveHours = effectiveTime.totalHours;
    updateData.sessionsCount = effectiveTime.sessionsCount;
    updateData.mergedPeriodsCount = effectiveTime.mergedPeriodsCount;
    updateData.duplicatesEliminated = effectiveTime.duplicatesEliminated;
    updateData.clippedPeriods = effectiveTime.clippedPeriods || 0;
    updateData.excludedSessionsCount = effectiveTime.excludedSessionsCount || 0;
    updateData.costPerMinute = Math.round(costPerMinute * 100) / 100;
    updateData.costPerHour = Math.round(costPerHour * 100) / 100;
    updateData.lastCalculatedAt = serverTimestamp();

    await updateDoc(docRef, updateData);
    console.log(`[FACTORY COST] Zaktualizowano koszt zakładu: ${id} z przeliczeniem (wykluczone: ${excludedTaskIds.length} zadań)`);
  } catch (error) {
    console.error('Błąd podczas aktualizacji kosztu zakładu:', error);
    throw error;
  }
};

/**
 * Usuwa koszt zakładu
 * @param {string} id - ID dokumentu do usunięcia
 * @returns {Promise<void>}
 */
export const deleteFactoryCost = async (id) => {
  try {
    const docRef = doc(db, FACTORY_COSTS_COLLECTION, id);
    await deleteDoc(docRef);
    console.log(`[FACTORY COST] Usunięto koszt zakładu: ${id}`);
  } catch (error) {
    console.error('Błąd podczas usuwania kosztu zakładu:', error);
    throw error;
  }
};

/**
 * Pobiera historię produkcji która NACHODZI na podany zakres dat
 * (nie tylko sesje które się w nim zaczynają, ale też te które wykraczają poza zakres)
 * 
 * @param {Date} rangeStart - Data początkowa zakresu
 * @param {Date} rangeEnd - Data końcowa zakresu
 * @returns {Promise<Array>} - Lista sesji produkcyjnych nachodzących na zakres
 */
const getOverlappingProductionHistory = async (rangeStart, rangeEnd) => {
  try {
    console.log(`[FACTORY COST] Pobieranie sesji nachodzących na zakres ${format(rangeStart, 'dd.MM.yyyy')} - ${format(rangeEnd, 'dd.MM.yyyy')}`);
    
    // Pobierz wszystkie wpisy z kolekcji productionHistory
    const { collection, getDocs, query, orderBy } = await import('firebase/firestore');
    const { db } = await import('./firebase/config');
    
    const historyRef = collection(db, 'productionHistory');
    const q = query(historyRef, orderBy('startTime', 'asc'));
    
    const querySnapshot = await getDocs(q);
    const allHistory = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    console.log(`[FACTORY COST] Pobrano ${allHistory.length} wpisów historii produkcji`);

    // Filtruj wpisy które NACHODZĄ na zakres (nie tylko zaczynają się w nim)
    // Sesja nachodzi na zakres jeśli: startTime <= rangeEnd AND endTime >= rangeStart
    const filteredHistory = allHistory.filter(session => {
      if (!session.startTime || !session.endTime) {
        return false;
      }

      // Konwertuj startTime
      let startTime = session.startTime;
      if (startTime?.toDate) {
        startTime = startTime.toDate();
      } else if (typeof startTime === 'string') {
        startTime = parseISO(startTime);
      } else if (!(startTime instanceof Date)) {
        startTime = new Date(startTime);
      }

      // Konwertuj endTime
      let endTime = session.endTime;
      if (endTime?.toDate) {
        endTime = endTime.toDate();
      } else if (typeof endTime === 'string') {
        endTime = parseISO(endTime);
      } else if (!(endTime instanceof Date)) {
        endTime = new Date(endTime);
      }

      // Sesja nachodzi na zakres jeśli zaczyna się przed końcem zakresu I kończy się po początku zakresu
      const overlaps = startTime <= rangeEnd && endTime >= rangeStart;
      
      return overlaps;
    });

    console.log(`[FACTORY COST] Po filtrowaniu: ${filteredHistory.length} sesji nachodzących na zakres`);
    
    return filteredHistory;
  } catch (error) {
    console.error('Błąd podczas pobierania nachodzących sesji produkcji:', error);
    throw error;
  }
};

/**
 * Oblicza efektywny czas produkcji bez duplikatów (nakładających się sesji)
 * Wykorzystuje logikę łączenia nakładających się okresów (merged periods)
 * WAŻNE: Przycina okresy do granic zakresu analizy
 * 
 * @param {Date} startDate - Data początkowa analizy
 * @param {Date} endDate - Data końcowa analizy
 * @param {Array} excludedTaskIds - Lista ID zadań do wykluczenia z kalkulacji (opcjonalny)
 * @returns {Promise<Object>} - Obiekt z obliczonym czasem
 */
export const calculateEffectiveProductionTime = async (startDate, endDate, excludedTaskIds = []) => {
  try {
    console.log(`[FACTORY COST] Obliczanie efektywnego czasu produkcji od ${format(startDate, 'dd.MM.yyyy HH:mm')} do ${format(endDate, 'dd.MM.yyyy HH:mm')}`);
    if (excludedTaskIds.length > 0) {
      console.log(`[FACTORY COST] Wykluczone zadania: ${excludedTaskIds.length}`);
    }
    
    // Pobierz sesje które NACHODZĄ na zakres (nie tylko te które się w nim zaczynają)
    const productionHistory = await getOverlappingProductionHistory(startDate, endDate);
    
    if (!productionHistory || productionHistory.length === 0) {
      console.log('[FACTORY COST] Brak historii produkcji nachodzących na podany zakres');
      return {
        totalMinutes: 0,
        totalHours: 0,
        sessionsCount: 0,
        mergedPeriodsCount: 0,
        duplicatesEliminated: 0,
        excludedSessionsCount: 0
      };
    }

    // Filtruj sesje wykluczonych zadań
    const excludedSet = new Set(excludedTaskIds);
    const filteredByExclusions = productionHistory.filter(session => {
      if (!session.taskId) return true; // Sesje bez taskId nie są wykluczone
      return !excludedSet.has(session.taskId);
    });
    
    const excludedSessionsCount = productionHistory.length - filteredByExclusions.length;
    if (excludedSessionsCount > 0) {
      console.log(`[FACTORY COST] Wykluczono ${excludedSessionsCount} sesji z ${productionHistory.length}`);
    }

    // Konwertuj i sortuj sesje według czasu rozpoczęcia
    const sortedSessions = filteredByExclusions
      .map(session => {
        let sessionStartTime = session.startTime;
        if (sessionStartTime?.toDate) {
          sessionStartTime = sessionStartTime.toDate();
        } else if (typeof sessionStartTime === 'string') {
          sessionStartTime = parseISO(sessionStartTime);
        } else if (!(sessionStartTime instanceof Date)) {
          sessionStartTime = new Date(sessionStartTime);
        }

        let sessionEndTime = session.endTime;
        if (sessionEndTime?.toDate) {
          sessionEndTime = sessionEndTime.toDate();
        } else if (typeof sessionEndTime === 'string') {
          sessionEndTime = parseISO(sessionEndTime);
        } else if (!(sessionEndTime instanceof Date)) {
          sessionEndTime = new Date(sessionEndTime);
        }

        return {
          ...session,
          startTime: sessionStartTime,
          endTime: sessionEndTime
        };
      })
      .filter(session => session.startTime && session.endTime && session.startTime < session.endTime)
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    if (sortedSessions.length === 0) {
      return {
        totalMinutes: 0,
        totalHours: 0,
        sessionsCount: 0,
        mergedPeriodsCount: 0,
        duplicatesEliminated: 0,
        excludedSessionsCount
      };
    }

    // Łączenie nakładających się sesji w ciągłe okresy (eliminacja duplikatów)
    const mergedPeriods = [];
    
    let currentPeriod = {
      startTime: sortedSessions[0].startTime,
      endTime: sortedSessions[0].endTime,
      sessions: [sortedSessions[0]]
    };
    
    for (let i = 1; i < sortedSessions.length; i++) {
      const session = sortedSessions[i];
      
      // Sprawdź czy sesja nakłada się lub bezpośrednio sąsiaduje z obecnym okresem
      if (session.startTime <= currentPeriod.endTime) {
        // Sesja nakłada się lub sąsiaduje - rozszerz obecny okres
        currentPeriod.endTime = new Date(Math.max(currentPeriod.endTime.getTime(), session.endTime.getTime()));
        currentPeriod.sessions.push(session);
        
        console.log(`[FACTORY COST] Połączono nakładające się sesje: ${format(session.startTime, 'HH:mm dd.MM')} z okresem kończącym się ${format(currentPeriod.endTime, 'HH:mm dd.MM')}`);
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

    // Oblicz łączny czas z połączonych okresów - PRZYCINAJĄC DO GRANIC ZAKRESU
    let totalMinutes = 0;
    let clippedPeriodsInfo = [];
    
    mergedPeriods.forEach((period, index) => {
      // Przytnij okres do granic zakresu analizy
      const effectiveStart = new Date(Math.max(period.startTime.getTime(), startDate.getTime()));
      const effectiveEnd = new Date(Math.min(period.endTime.getTime(), endDate.getTime()));
      
      // Oblicz czas tylko jeśli efektywny zakres jest poprawny
      if (effectiveStart < effectiveEnd) {
        const periodMinutes = (effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60);
        totalMinutes += periodMinutes;
        
        // Loguj jeśli okres został przycięty
        const wasClipped = period.startTime < startDate || period.endTime > endDate;
        if (wasClipped) {
          console.log(`[FACTORY COST] Okres ${index + 1} przycięty: ${format(period.startTime, 'dd.MM HH:mm')}-${format(period.endTime, 'dd.MM HH:mm')} → ${format(effectiveStart, 'dd.MM HH:mm')}-${format(effectiveEnd, 'dd.MM HH:mm')} (${Math.round(periodMinutes)} min)`);
          clippedPeriodsInfo.push({
            original: { start: period.startTime, end: period.endTime },
            clipped: { start: effectiveStart, end: effectiveEnd },
            minutes: periodMinutes
          });
        }
      }
    });

    const result = {
      totalMinutes: Math.round(totalMinutes * 100) / 100,
      totalHours: Math.round((totalMinutes / 60) * 100) / 100,
      sessionsCount: sortedSessions.length,
      mergedPeriodsCount: mergedPeriods.length,
      duplicatesEliminated: sortedSessions.length - mergedPeriods.length,
      clippedPeriods: clippedPeriodsInfo.length,
      excludedSessionsCount
    };

    console.log(`[FACTORY COST] Efektywny czas (przycięty do zakresu): ${result.totalHours}h (${result.totalMinutes} min)`);
    console.log(`[FACTORY COST] Sesji: ${result.sessionsCount}, połączonych okresów: ${result.mergedPeriodsCount}, wyeliminowanych duplikatów: ${result.duplicatesEliminated}, przyciętych okresów: ${result.clippedPeriods}, wykluczonych: ${excludedSessionsCount}`);

    return result;
  } catch (error) {
    console.error('Błąd podczas obliczania efektywnego czasu produkcji:', error);
    throw error;
  }
};

/**
 * Oblicza proporcjonalną kwotę kosztu dla danego zakresu dat
 * @param {Object} cost - Obiekt kosztu
 * @param {Date} rangeStart - Początek zakresu analizy
 * @param {Date} rangeEnd - Koniec zakresu analizy
 * @returns {number} - Proporcjonalna kwota
 */
const calculateProportionalCost = (cost, rangeStart, rangeEnd) => {
  // Oblicz faktyczny okres nachodzenia
  const overlapStart = new Date(Math.max(cost.startDate.getTime(), rangeStart.getTime()));
  const overlapEnd = new Date(Math.min(cost.endDate.getTime(), rangeEnd.getTime()));
  
  // Czas nachodzenia w dniach
  const overlapDays = (overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24);
  
  // Całkowity czas kosztu w dniach
  const totalCostDays = (cost.endDate.getTime() - cost.startDate.getTime()) / (1000 * 60 * 60 * 24);
  
  if (totalCostDays <= 0) return cost.amount;
  
  // Proporcjonalna kwota
  const proportion = overlapDays / totalCostDays;
  return cost.amount * proportion;
};

/**
 * Oblicza koszt zakładu na minutę pracy
 * @param {Date} startDate - Data początkowa analizy
 * @param {Date} endDate - Data końcowa analizy
 * @returns {Promise<Object>} - Obiekt z obliczeniami
 */
export const calculateCostPerMinute = async (startDate, endDate) => {
  try {
    console.log(`[FACTORY COST] Obliczanie kosztu na minutę dla okresu ${format(startDate, 'dd.MM.yyyy')} - ${format(endDate, 'dd.MM.yyyy')}`);
    
    // Pobierz koszty zakładu dla zakresu
    const factoryCosts = await getFactoryCostsByDateRange(startDate, endDate);
    
    // Oblicz łączny proporcjonalny koszt
    let totalCost = 0;
    factoryCosts.forEach(cost => {
      const proportionalCost = calculateProportionalCost(cost, startDate, endDate);
      totalCost += proportionalCost;
      console.log(`[FACTORY COST] Koszt ${cost.id}: ${cost.amount} EUR, proporcjonalnie: ${proportionalCost.toFixed(2)} EUR`);
    });
    
    // Oblicz efektywny czas pracy
    const effectiveTime = await calculateEffectiveProductionTime(startDate, endDate);
    
    // Oblicz koszt na minutę
    const costPerMinute = effectiveTime.totalMinutes > 0 
      ? totalCost / effectiveTime.totalMinutes 
      : 0;
    
    // Oblicz koszt na godzinę
    const costPerHour = costPerMinute * 60;

    const result = {
      totalCost: Math.round(totalCost * 100) / 100,
      effectiveMinutes: effectiveTime.totalMinutes,
      effectiveHours: effectiveTime.totalHours,
      sessionsCount: effectiveTime.sessionsCount,
      mergedPeriodsCount: effectiveTime.mergedPeriodsCount,
      duplicatesEliminated: effectiveTime.duplicatesEliminated,
      costPerMinute: Math.round(costPerMinute * 100) / 100,
      costPerHour: Math.round(costPerHour * 100) / 100,
      costsCount: factoryCosts.length,
      period: {
        startDate: format(startDate, 'dd.MM.yyyy'),
        endDate: format(endDate, 'dd.MM.yyyy')
      }
    };

    console.log(`[FACTORY COST] Wynik: koszt ${result.totalCost} EUR / ${result.effectiveMinutes} min = ${result.costPerMinute} EUR/min`);

    return result;
  } catch (error) {
    console.error('Błąd podczas obliczania kosztu na minutę:', error);
    throw error;
  }
};

/**
 * Pobiera szczegółową analizę kosztów zakładu
 * @param {Date} startDate - Data początkowa
 * @param {Date} endDate - Data końcowa
 * @returns {Promise<Object>} - Szczegółowa analiza
 */
export const getFactoryCostAnalysis = async (startDate, endDate) => {
  try {
    const [costs, costPerMinuteData] = await Promise.all([
      getFactoryCostsByDateRange(startDate, endDate),
      calculateCostPerMinute(startDate, endDate)
    ]);

    return {
      costs,
      analysis: costPerMinuteData
    };
  } catch (error) {
    console.error('Błąd podczas pobierania analizy kosztów zakładu:', error);
    throw error;
  }
};

/**
 * Oblicza efektywny czas pracy i koszt na minutę dla pojedynczego kosztu zakładu
 * @param {Object} cost - Obiekt kosztu zakładu
 * @returns {Promise<Object>} - Koszt wzbogacony o obliczenia
 */
export const calculateCostAnalysis = async (cost) => {
  try {
    console.log(`[FACTORY COST] Obliczanie analizy dla kosztu ${cost.id}: ${format(cost.startDate, 'dd.MM.yyyy')} - ${format(cost.endDate, 'dd.MM.yyyy')}`);
    
    // Oblicz efektywny czas pracy dla zakresu dat tego kosztu
    const effectiveTime = await calculateEffectiveProductionTime(cost.startDate, cost.endDate);
    
    // Oblicz koszt na minutę
    const costPerMinute = effectiveTime.totalMinutes > 0 
      ? cost.amount / effectiveTime.totalMinutes 
      : 0;
    
    // Oblicz koszt na godzinę
    const costPerHour = costPerMinute * 60;

    return {
      ...cost,
      effectiveMinutes: effectiveTime.totalMinutes,
      effectiveHours: effectiveTime.totalHours,
      sessionsCount: effectiveTime.sessionsCount,
      mergedPeriodsCount: effectiveTime.mergedPeriodsCount,
      duplicatesEliminated: effectiveTime.duplicatesEliminated,
      clippedPeriods: effectiveTime.clippedPeriods || 0,
      costPerMinute: Math.round(costPerMinute * 100) / 100,
      costPerHour: Math.round(costPerHour * 100) / 100
    };
  } catch (error) {
    console.error(`Błąd podczas obliczania analizy kosztu ${cost.id}:`, error);
    return {
      ...cost,
      effectiveMinutes: 0,
      effectiveHours: 0,
      sessionsCount: 0,
      mergedPeriodsCount: 0,
      duplicatesEliminated: 0,
      clippedPeriods: 0,
      costPerMinute: 0,
      costPerHour: 0,
      error: true
    };
  }
};

/**
 * Ręcznie przelicza wszystkie koszty zakładu
 * Używane do synchronizacji po migracji lub w razie problemów
 * @returns {Promise<Object>} - Wynik przeliczania
 */
export const recalculateAllFactoryCosts = async () => {
  try {
    console.log('[FACTORY COST] Ręczne przeliczanie wszystkich kosztów...');
    
    const costs = await getFactoryCosts();
    
    if (costs.length === 0) {
      return { updated: 0 };
    }
    
    let updatedCount = 0;
    
    for (const cost of costs) {
      try {
        // Pobierz wykluczone zadania
        const excludedTaskIds = cost.excludedTaskIds || [];
        
        // Oblicz efektywny czas (z uwzględnieniem wykluczeń)
        const effectiveTime = await calculateEffectiveProductionTime(cost.startDate, cost.endDate, excludedTaskIds);
        
        // Oblicz koszt na minutę
        const amount = parseFloat(cost.amount) || 0;
        const costPerMinute = effectiveTime.totalMinutes > 0 
          ? amount / effectiveTime.totalMinutes 
          : 0;
        const costPerHour = costPerMinute * 60;
        
        // Aktualizuj dokument
        const docRef = doc(db, FACTORY_COSTS_COLLECTION, cost.id);
        await updateDoc(docRef, {
          effectiveMinutes: effectiveTime.totalMinutes,
          effectiveHours: effectiveTime.totalHours,
          sessionsCount: effectiveTime.sessionsCount,
          mergedPeriodsCount: effectiveTime.mergedPeriodsCount,
          duplicatesEliminated: effectiveTime.duplicatesEliminated,
          clippedPeriods: effectiveTime.clippedPeriods || 0,
          excludedSessionsCount: effectiveTime.excludedSessionsCount || 0,
          costPerMinute: Math.round(costPerMinute * 100) / 100,
          costPerHour: Math.round(costPerHour * 100) / 100,
          lastCalculatedAt: serverTimestamp()
        });
        
        updatedCount++;
        console.log(`[FACTORY COST] Przeliczono koszt ${cost.id} (wykluczone: ${excludedTaskIds.length} zadań)`);
      } catch (error) {
        console.error(`[FACTORY COST] Błąd przeliczania kosztu ${cost.id}:`, error);
      }
    }
    
    console.log(`[FACTORY COST] Przeliczono ${updatedCount}/${costs.length} kosztów`);
    return { updated: updatedCount, total: costs.length };
  } catch (error) {
    console.error('Błąd podczas przeliczania kosztów zakładu:', error);
    throw error;
  }
};

/**
 * Pobiera wszystkie koszty zakładu z zapisanymi wartościami efektywnego czasu i kosztu/min
 * Wartości są automatycznie aktualizowane przez Cloud Function przy zmianach w historii produkcji
 * Jeśli brak zapisanych wartości (stare dokumenty), oblicza je na bieżąco
 * @returns {Promise<Array>} - Lista kosztów z obliczeniami
 */
export const getFactoryCostsWithAnalysis = async () => {
  try {
    console.log('[FACTORY COST] Pobieranie kosztów z zapisaną analizą...');
    
    // Pobierz wszystkie koszty (już zawierają zapisane obliczenia)
    const costs = await getFactoryCosts();
    
    if (costs.length === 0) {
      return [];
    }
    
    // Sprawdź czy koszty mają zapisane obliczenia, jeśli nie - oblicz
    const costsWithAnalysis = await Promise.all(
      costs.map(async (cost) => {
        // Jeśli koszt ma już zapisane obliczenia (effectiveMinutes), użyj ich
        if (cost.effectiveMinutes !== undefined && cost.costPerMinute !== undefined) {
          console.log(`[FACTORY COST] Koszt ${cost.id} - używam zapisanych obliczeń`);
          return cost;
        }
        
        // Dla starych dokumentów bez obliczeń - oblicz na bieżąco
        console.log(`[FACTORY COST] Koszt ${cost.id} - brak zapisanych obliczeń, obliczam...`);
        return await calculateCostAnalysis(cost);
      })
    );
    
    console.log(`[FACTORY COST] Pobrano ${costsWithAnalysis.length} kosztów z analizą`);
    
    return costsWithAnalysis;
  } catch (error) {
    console.error('Błąd podczas pobierania kosztów z analizą:', error);
    throw error;
  }
};

// ============================================================================
// PROPORCJONALNY PODZIAŁ KOSZTÓW ZAKŁADU MIĘDZY ZADANIA PRODUKCYJNE
// ============================================================================

/**
 * Oblicza proporcjonalny czas dla każdego zadania produkcyjnego
 * Gdy sesje się nakładają, czas jest dzielony równo między wszystkie aktywne zadania
 * 
 * Przykład:
 * - Produkcja1: 10:00-16:00, Produkcja2: 12:00-18:00
 * - 10:00-12:00: tylko P1 → P1 dostaje 100%
 * - 12:00-16:00: P1 + P2 → każde dostaje 50%
 * - 16:00-18:00: tylko P2 → P2 dostaje 100%
 * 
 * @param {Array} sessions - Lista sesji produkcyjnych z polami: taskId, startTime, endTime
 * @param {Date} rangeStart - Początek zakresu analizy
 * @param {Date} rangeEnd - Koniec zakresu analizy
 * @param {Array} excludedTaskIds - Lista wykluczonych zadań
 * @returns {Object} - Mapa taskId -> { proportionalMinutes, sessionsCount }
 */
export const calculateProportionalTimePerTask = (sessions, rangeStart, rangeEnd, excludedTaskIds = []) => {
  if (!sessions || sessions.length === 0) {
    return {};
  }

  const excludedSet = new Set(excludedTaskIds || []);
  
  // Filtruj i konwertuj sesje
  const validSessions = sessions
    .filter(session => {
      if (!session.taskId || !session.startTime || !session.endTime) return false;
      if (excludedSet.has(session.taskId)) return false;
      return true;
    })
    .map(session => {
      let startTime = session.startTime;
      let endTime = session.endTime;
      
      if (startTime?.toDate) startTime = startTime.toDate();
      else if (typeof startTime === 'string') startTime = parseISO(startTime);
      else if (!(startTime instanceof Date)) startTime = new Date(startTime);
      
      if (endTime?.toDate) endTime = endTime.toDate();
      else if (typeof endTime === 'string') endTime = parseISO(endTime);
      else if (!(endTime instanceof Date)) endTime = new Date(endTime);
      
      // Przytnij do granic zakresu
      const clippedStart = new Date(Math.max(startTime.getTime(), rangeStart.getTime()));
      const clippedEnd = new Date(Math.min(endTime.getTime(), rangeEnd.getTime()));
      
      if (clippedStart >= clippedEnd) return null;
      
      return {
        taskId: session.taskId,
        startTime: clippedStart,
        endTime: clippedEnd
      };
    })
    .filter(Boolean);

  if (validSessions.length === 0) {
    return {};
  }

  // Zbierz wszystkie unikalne punkty czasowe
  const timePoints = new Set();
  validSessions.forEach(session => {
    timePoints.add(session.startTime.getTime());
    timePoints.add(session.endTime.getTime());
  });
  
  const sortedTimePoints = Array.from(timePoints).sort((a, b) => a - b);
  
  // Inicjalizuj wynik dla każdego zadania
  const taskTimeMap = {};
  validSessions.forEach(session => {
    if (!taskTimeMap[session.taskId]) {
      taskTimeMap[session.taskId] = {
        proportionalMinutes: 0,
        sessionsCount: 0,
        taskId: session.taskId
      };
    }
    taskTimeMap[session.taskId].sessionsCount++;
  });

  // Dla każdego przedziału między punktami czasowymi
  for (let i = 0; i < sortedTimePoints.length - 1; i++) {
    const intervalStart = sortedTimePoints[i];
    const intervalEnd = sortedTimePoints[i + 1];
    const intervalMinutes = (intervalEnd - intervalStart) / (1000 * 60);
    
    if (intervalMinutes <= 0) continue;
    
    // Znajdź wszystkie aktywne sesje w tym przedziale
    const activeTasks = new Set();
    validSessions.forEach(session => {
      if (session.startTime.getTime() <= intervalStart && session.endTime.getTime() >= intervalEnd) {
        activeTasks.add(session.taskId);
      }
    });
    
    const activeCount = activeTasks.size;
    if (activeCount === 0) continue;
    
    // Podziel czas równo między aktywne zadania
    const minutesPerTask = intervalMinutes / activeCount;
    activeTasks.forEach(taskId => {
      taskTimeMap[taskId].proportionalMinutes += minutesPerTask;
    });
  }

  // Zaokrąglij wyniki
  Object.keys(taskTimeMap).forEach(taskId => {
    taskTimeMap[taskId].proportionalMinutes = Math.round(taskTimeMap[taskId].proportionalMinutes * 100) / 100;
  });

  console.log(`[FACTORY COST] Obliczono proporcjonalny czas dla ${Object.keys(taskTimeMap).length} zadań`);
  
  return taskTimeMap;
};

/**
 * Oblicza koszt zakładu dla wszystkich zadań produkcyjnych w zakresie kosztu
 * @param {Object} factoryCost - Dokument kosztu zakładu
 * @returns {Promise<Object>} - Mapa taskId -> { factoryCostTotal, factoryCostPerUnit, proportionalMinutes }
 */
export const calculateFactoryCostForTasks = async (factoryCost) => {
  try {
    const startDate = factoryCost.startDate instanceof Date 
      ? factoryCost.startDate 
      : (factoryCost.startDate?.toDate ? factoryCost.startDate.toDate() : new Date(factoryCost.startDate));
    const endDate = factoryCost.endDate instanceof Date 
      ? factoryCost.endDate 
      : (factoryCost.endDate?.toDate ? factoryCost.endDate.toDate() : new Date(factoryCost.endDate));
    
    const costPerMinute = factoryCost.costPerMinute || 0;
    const excludedTaskIds = factoryCost.excludedTaskIds || [];

    if (costPerMinute <= 0) {
      console.log('[FACTORY COST] Brak costPerMinute - pomijam obliczenia dla zadań');
      return {};
    }

    console.log(`[FACTORY COST] Obliczanie kosztów zakładu dla zadań w zakresie ${format(startDate, 'dd.MM.yyyy')} - ${format(endDate, 'dd.MM.yyyy')}`);
    console.log(`[FACTORY COST] costPerMinute: ${costPerMinute} EUR/min, wykluczone: ${excludedTaskIds.length} zadań`);

    // Pobierz sesje nachodzące na zakres
    const historyRef = collection(db, 'productionHistory');
    const q = query(historyRef, orderBy('startTime', 'asc'));
    const querySnapshot = await getDocs(q);
    
    const sessions = [];
    querySnapshot.forEach(doc => {
      const data = doc.data();
      if (!data.startTime || !data.endTime || !data.taskId) return;
      
      let sessionStart = data.startTime?.toDate ? data.startTime.toDate() : new Date(data.startTime);
      let sessionEnd = data.endTime?.toDate ? data.endTime.toDate() : new Date(data.endTime);
      
      // Sesja nachodzi na zakres
      if (sessionStart <= endDate && sessionEnd >= startDate) {
        sessions.push({
          id: doc.id,
          taskId: data.taskId,
          startTime: sessionStart,
          endTime: sessionEnd
        });
      }
    });

    console.log(`[FACTORY COST] Znaleziono ${sessions.length} sesji w zakresie`);

    // Oblicz proporcjonalny czas dla każdego zadania
    const taskTimeMap = calculateProportionalTimePerTask(sessions, startDate, endDate, excludedTaskIds);

    // Pobierz dane o ilości dla każdego zadania
    const taskIds = Object.keys(taskTimeMap);
    if (taskIds.length === 0) {
      return {};
    }

    const tasksRef = collection(db, 'productionTasks');
    const taskCostMap = {};

    // Pobierz zadania batch'ami
    const batchSize = 10;
    for (let i = 0; i < taskIds.length; i += batchSize) {
      const batch = taskIds.slice(i, i + batchSize);
      const tasksQuery = query(tasksRef, where('__name__', 'in', batch));
      const tasksSnapshot = await getDocs(tasksQuery);
      
      tasksSnapshot.forEach(doc => {
        const taskData = doc.data();
        const taskId = doc.id;
        const timeData = taskTimeMap[taskId];
        
        if (!timeData) return;
        
        const factoryCostTotal = timeData.proportionalMinutes * costPerMinute;
        const quantity = parseFloat(taskData.quantity) || 1;
        const factoryCostPerUnit = factoryCostTotal / quantity;
        
        taskCostMap[taskId] = {
          taskId,
          moNumber: taskData.moNumber,
          productName: taskData.productName || taskData.name,
          quantity,
          proportionalMinutes: timeData.proportionalMinutes,
          sessionsCount: timeData.sessionsCount,
          factoryCostTotal: Math.round(factoryCostTotal * 100) / 100,
          factoryCostPerUnit: Math.round(factoryCostPerUnit * 10000) / 10000,
          costPerMinute,
          factoryCostId: factoryCost.id
        };
      });
    }

    console.log(`[FACTORY COST] Obliczono koszt zakładu dla ${Object.keys(taskCostMap).length} zadań`);
    
    return taskCostMap;
  } catch (error) {
    console.error('Błąd podczas obliczania kosztów zakładu dla zadań:', error);
    throw error;
  }
};

/**
 * Aktualizuje koszty zakładu we wszystkich zadaniach produkcyjnych dla danego kosztu zakładu
 * @param {string} factoryCostId - ID kosztu zakładu
 * @returns {Promise<Object>} - Wynik aktualizacji
 */
export const updateFactoryCostInTasks = async (factoryCostId) => {
  try {
    console.log(`[FACTORY COST] Aktualizacja kosztów zakładu w zadaniach dla factoryCost: ${factoryCostId}`);
    
    // Pobierz koszt zakładu
    const costDoc = await getDoc(doc(db, FACTORY_COSTS_COLLECTION, factoryCostId));
    if (!costDoc.exists()) {
      throw new Error('Koszt zakładu nie istnieje');
    }
    
    const factoryCost = {
      id: costDoc.id,
      ...costDoc.data()
    };

    // Oblicz koszty dla każdego zadania
    const taskCostMap = await calculateFactoryCostForTasks(factoryCost);
    
    // Najpierw wyczyść koszty zakładu dla wykluczonych zadań
    const excludedTaskIds = factoryCost.excludedTaskIds || [];
    for (const taskId of excludedTaskIds) {
      try {
        const taskRef = doc(db, 'productionTasks', taskId);
        const taskDoc = await getDoc(taskRef);
        if (taskDoc.exists()) {
          const taskData = taskDoc.data();
          const totalFullProductionCost = parseFloat(taskData.totalFullProductionCost) || 0;
          const unitFullProductionCost = parseFloat(taskData.unitFullProductionCost) || 0;
          
          await updateDoc(taskRef, {
            factoryCostTotal: 0,
            factoryCostPerUnit: 0,
            factoryCostMinutes: 0,
            factoryCostId: null,
            factoryCostUpdatedAt: serverTimestamp(),
            totalCostWithFactory: Math.round(totalFullProductionCost * 100) / 100,
            unitCostWithFactory: Math.round(unitFullProductionCost * 10000) / 10000
          });
          console.log(`[FACTORY COST] Wyczyszczono koszt zakładu dla wykluczonego zadania ${taskId}`);
        }
      } catch (error) {
        console.error(`[FACTORY COST] Błąd czyszczenia kosztu dla wykluczonego zadania ${taskId}:`, error);
      }
    }

    if (Object.keys(taskCostMap).length === 0) {
      console.log('[FACTORY COST] Brak zadań do aktualizacji (wszystkie wykluczone lub brak sesji)');
      
      // Mimo braku zadań do aktualizacji, propaguj do zamówień aby wyczyścić koszty
      if (excludedTaskIds.length > 0) {
        console.log(`[FACTORY COST] Propagowanie wyczyszczonych kosztów do zamówień dla ${excludedTaskIds.length} wykluczonych zadań...`);
        await propagateFactoryCostToOrders(excludedTaskIds, taskCostMap, excludedTaskIds);
      }
      
      return { updated: 0, excludedCleared: excludedTaskIds.length };
    }

    // Aktualizuj zadania
    let updatedCount = 0;
    for (const [taskId, costData] of Object.entries(taskCostMap)) {
      try {
        const taskRef = doc(db, 'productionTasks', taskId);
        
        // Pobierz aktualne dane zadania aby obliczyć totalCostWithFactory
        const taskDoc = await getDoc(taskRef);
        const taskData = taskDoc.exists() ? taskDoc.data() : {};
        
        const totalFullProductionCost = parseFloat(taskData.totalFullProductionCost) || 0;
        const unitFullProductionCost = parseFloat(taskData.unitFullProductionCost) || 0;
        
        // Oblicz pełne koszty z zakładem
        const totalCostWithFactory = totalFullProductionCost + costData.factoryCostTotal;
        const unitCostWithFactory = unitFullProductionCost + costData.factoryCostPerUnit;
        
        await updateDoc(taskRef, {
          factoryCostTotal: costData.factoryCostTotal,
          factoryCostPerUnit: costData.factoryCostPerUnit,
          factoryCostMinutes: costData.proportionalMinutes,
          factoryCostId: factoryCostId,
          factoryCostUpdatedAt: serverTimestamp(),
          // Nowe pola z pełnym kosztem (materiały + zakład)
          totalCostWithFactory: Math.round(totalCostWithFactory * 100) / 100,
          unitCostWithFactory: Math.round(unitCostWithFactory * 10000) / 10000
        });
        
        // Zaktualizuj taskCostMap o pełne koszty (do propagacji do zamówień)
        taskCostMap[taskId].totalCostWithFactory = totalCostWithFactory;
        taskCostMap[taskId].unitCostWithFactory = unitCostWithFactory;
        taskCostMap[taskId].totalFullProductionCost = totalFullProductionCost;
        
        updatedCount++;
        console.log(`[FACTORY COST] Zaktualizowano zadanie ${costData.moNumber}: ${costData.factoryCostPerUnit.toFixed(4)} EUR/szt (pełny koszt: ${unitCostWithFactory.toFixed(4)} EUR/szt)`);
      } catch (error) {
        console.error(`[FACTORY COST] Błąd aktualizacji zadania ${taskId}:`, error);
      }
    }

    console.log(`[FACTORY COST] Zaktualizowano ${updatedCount} zadań produkcyjnych`);

    // Propaguj koszty do zamówień (CO)
    const taskIds = Object.keys(taskCostMap);
    const allTaskIds = [...taskIds, ...excludedTaskIds];
    
    if (allTaskIds.length > 0) {
      console.log(`[FACTORY COST] Propagowanie kosztów do zamówień dla ${allTaskIds.length} zadań...`);
      await propagateFactoryCostToOrders(allTaskIds, taskCostMap, excludedTaskIds);
    }

    return { updated: updatedCount, taskCostMap };
  } catch (error) {
    console.error('Błąd podczas aktualizacji kosztów zakładu w zadaniach:', error);
    throw error;
  }
};

/**
 * Propaguje koszty zakładu do zamówień (CO)
 * @param {Array} taskIds - Lista ID zadań do sprawdzenia
 * @param {Object} taskCostMap - Mapa kosztów dla zadań (już obliczone, nie trzeba pobierać z bazy)
 * @param {Array} excludedTaskIds - Lista wykluczonych zadań
 */
const propagateFactoryCostToOrders = async (taskIds, taskCostMap, excludedTaskIds) => {
  try {
    const ordersRef = collection(db, 'orders');
    const ordersSnapshot = await getDocs(ordersRef);
    
    let ordersUpdated = 0;
    
    for (const orderDoc of ordersSnapshot.docs) {
      const orderData = orderDoc.data();
      let orderNeedsUpdate = false;
      const updatedItems = [...(orderData.items || [])];
      
      for (let i = 0; i < updatedItems.length; i++) {
        const item = updatedItems[i];
        const taskId = item.productionTaskId;
        
        if (!taskId) continue;
        
        // Sprawdź czy to zadanie jest na liście
        if (taskIds.includes(taskId)) {
          // Pobierz dane zadania z bazy
          const taskRef = doc(db, 'productionTasks', taskId);
          const taskDoc = await getDoc(taskRef);
          
          if (taskDoc.exists()) {
            const taskData = taskDoc.data();
            const isExcluded = excludedTaskIds.includes(taskId);
            
            // Użyj danych z taskCostMap (już obliczone) jeśli dostępne
            const factoryCostData = taskCostMap[taskId];
            const factoryCostTotal = factoryCostData ? factoryCostData.factoryCostTotal : 0;
            const factoryCostPerUnit = factoryCostData ? factoryCostData.factoryCostPerUnit : 0;
            
            // Oblicz pełny koszt z zakładem
            const totalFullProductionCost = parseFloat(taskData.totalFullProductionCost) || 0;
            const unitFullProductionCost = parseFloat(taskData.unitFullProductionCost) || 0;
            
            const totalCostWithFactory = isExcluded ? totalFullProductionCost : (totalFullProductionCost + factoryCostTotal);
            const unitCostWithFactory = isExcluded ? unitFullProductionCost : (unitFullProductionCost + factoryCostPerUnit);
            
            updatedItems[i] = {
              ...item,
              productionCost: totalCostWithFactory,
              fullProductionCost: totalCostWithFactory,
              fullProductionUnitCost: Math.round(unitCostWithFactory * 10000) / 10000,
              factoryCostIncluded: !isExcluded && factoryCostTotal > 0
            };
            orderNeedsUpdate = true;
            
            console.log(`[FACTORY COST] Zaktualizowano pozycję ${item.name} w zamówieniu ${orderData.orderNumber}: ${totalCostWithFactory.toFixed(2)} EUR (materiały: ${totalFullProductionCost.toFixed(2)} + zakład: ${factoryCostTotal.toFixed(2)})`);
          }
        }
      }
      
      if (orderNeedsUpdate) {
        // Przelicz totalValue zamówienia
        const calculateItemTotalValue = (item) => {
          const itemValue = (parseFloat(item.quantity) || 0) * (parseFloat(item.price) || 0);
          if (item.fromPriceList && parseFloat(item.price || 0) > 0) {
            return itemValue;
          }
          if (item.productionTaskId && item.productionCost !== undefined) {
            return itemValue + parseFloat(item.productionCost || 0);
          }
          return itemValue;
        };
        
        const subtotal = updatedItems.reduce((sum, item) => sum + calculateItemTotalValue(item), 0);
        const shippingCost = parseFloat(orderData.shippingCost) || 0;
        const additionalCosts = orderData.additionalCostsItems ?
          orderData.additionalCostsItems
            .filter(cost => parseFloat(cost.value) > 0)
            .reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0) : 0;
        const discounts = orderData.additionalCostsItems ?
          Math.abs(orderData.additionalCostsItems
            .filter(cost => parseFloat(cost.value) < 0)
            .reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0)) : 0;
        
        const newTotalValue = subtotal + shippingCost + additionalCosts - discounts;
        
        await updateDoc(orderDoc.ref, {
          items: updatedItems,
          totalValue: Math.round(newTotalValue * 100) / 100,
          updatedAt: serverTimestamp()
        });
        
        ordersUpdated++;
        console.log(`[FACTORY COST] Zaktualizowano zamówienie ${orderData.orderNumber}: totalValue=${newTotalValue.toFixed(2)} EUR`);
      }
    }
    
    console.log(`[FACTORY COST] Zaktualizowano ${ordersUpdated} zamówień`);
    return { ordersUpdated };
  } catch (error) {
    console.error('[FACTORY COST] Błąd podczas propagacji do zamówień:', error);
    // Nie rzucaj błędu - to jest operacja dodatkowa
  }
};

/**
 * Przelicza koszty zakładu dla wszystkich zadań ze wszystkich kosztów zakładu
 * @returns {Promise<Object>} - Wynik przeliczania
 */
export const recalculateAllTaskFactoryCosts = async () => {
  try {
    console.log('[FACTORY COST] Przeliczanie kosztów zakładu dla wszystkich zadań...');
    
    const costs = await getFactoryCosts();
    
    if (costs.length === 0) {
      return { updated: 0, costsProcessed: 0 };
    }

    let totalUpdated = 0;
    
    for (const cost of costs) {
      try {
        const result = await updateFactoryCostInTasks(cost.id);
        totalUpdated += result.updated;
      } catch (error) {
        console.error(`[FACTORY COST] Błąd przeliczania dla kosztu ${cost.id}:`, error);
      }
    }

    console.log(`[FACTORY COST] Przeliczono koszty zakładu dla ${totalUpdated} zadań z ${costs.length} kosztów`);
    return { updated: totalUpdated, costsProcessed: costs.length };
  } catch (error) {
    console.error('Błąd podczas przeliczania kosztów zakładu dla zadań:', error);
    throw error;
  }
};
