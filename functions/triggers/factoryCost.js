/**
 * Factory Cost Update Trigger
 * Automatycznie przelicza efektywny czas pracy i koszt na minutę
 * dla kosztów zakładu gdy zmienia się historia produkcji
 *
 * DEPLOYMENT:
 * firebase deploy --only functions:bgw-mrp:onProductionHistoryChange
 */

const {onDocumentWritten} = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const {admin} = require("../config");

/**
 * Konwertuje Firestore Timestamp lub inne formaty daty na Date
 * @param {any} dateValue - Wartość daty
 * @return {Date|null} - Obiekt Date lub null
 */
const toDate = (dateValue) => {
  if (!dateValue) return null;
  if (dateValue.toDate) return dateValue.toDate();
  if (dateValue instanceof Date) return dateValue;
  if (typeof dateValue === "string") return new Date(dateValue);
  if (typeof dateValue === "number") return new Date(dateValue);
  return null;
};

/**
 * Pobiera sesje produkcyjne nachodzące na podany zakres dat
 * @param {Firestore} db - Instancja Firestore
 * @param {Date} rangeStart - Początek zakresu
 * @param {Date} rangeEnd - Koniec zakresu
 * @return {Promise<Array>} - Lista sesji
 */
const getOverlappingSessions = async (db, rangeStart, rangeEnd) => {
  const historyRef = db.collection("productionHistory");
  const snapshot = await historyRef.orderBy("startTime", "asc").get();

  const sessions = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    const startTime = toDate(data.startTime);
    const endTime = toDate(data.endTime);

    if (!startTime || !endTime) return;

    // Sesja nachodzi na zakres jeśli: startTime <= rangeEnd AND endTime >= rangeStart
    if (startTime <= rangeEnd && endTime >= rangeStart) {
      sessions.push({
        id: doc.id,
        taskId: data.taskId,
        startTime, // Już skonwertowane na Date
        endTime, // Już skonwertowane na Date
      });
    }
  });

  return sessions;
};

/**
 * Oblicza efektywny czas produkcji z eliminacją duplikatów
 * i przycinaniem do granic zakresu
 * @param {Array} sessions - Lista sesji produkcyjnych
 * @param {Date} rangeStart - Początek zakresu
 * @param {Date} rangeEnd - Koniec zakresu
 * @param {Array} excludedTaskIds - Lista ID zadań do wykluczenia
 * @return {Object} - Obliczenia
 */
const calculateEffectiveTime = (sessions, rangeStart, rangeEnd, excludedTaskIds = []) => {
  if (!sessions || sessions.length === 0) {
    return {
      totalMinutes: 0,
      totalHours: 0,
      sessionsCount: 0,
      mergedPeriodsCount: 0,
      duplicatesEliminated: 0,
      clippedPeriods: 0,
      excludedSessionsCount: 0,
    };
  }

  // Filtruj wykluczone sesje
  const excludedSet = new Set(excludedTaskIds || []);
  const filteredByExclusions = sessions.filter((session) => {
    if (!session.taskId) return true; // Sesje bez taskId nie są wykluczone
    return !excludedSet.has(session.taskId);
  });
  const excludedSessionsCount = sessions.length - filteredByExclusions.length;

  // Sortuj sesje według czasu rozpoczęcia
  const sortedSessions = filteredByExclusions
      .filter((s) => s.startTime && s.endTime && s.startTime < s.endTime)
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  if (sortedSessions.length === 0) {
    return {
      totalMinutes: 0,
      totalHours: 0,
      sessionsCount: 0,
      mergedPeriodsCount: 0,
      duplicatesEliminated: 0,
      clippedPeriods: 0,
      excludedSessionsCount,
    };
  }

  // Łączenie nakładających się sesji w ciągłe okresy
  const mergedPeriods = [];
  let currentPeriod = {
    startTime: sortedSessions[0].startTime,
    endTime: sortedSessions[0].endTime,
  };

  for (let i = 1; i < sortedSessions.length; i++) {
    const session = sortedSessions[i];

    if (session.startTime <= currentPeriod.endTime) {
      // Sesja nakłada się - rozszerz okres
      currentPeriod.endTime = new Date(
          Math.max(currentPeriod.endTime.getTime(), session.endTime.getTime()),
      );
    } else {
      // Sesja nie nakłada się - zapisz obecny i rozpocznij nowy
      mergedPeriods.push(currentPeriod);
      currentPeriod = {
        startTime: session.startTime,
        endTime: session.endTime,
      };
    }
  }
  mergedPeriods.push(currentPeriod);

  // Oblicz łączny czas z przycinaniem do granic zakresu
  let totalMinutes = 0;
  let clippedPeriods = 0;

  mergedPeriods.forEach((period) => {
    const effectiveStart = new Date(
        Math.max(period.startTime.getTime(), rangeStart.getTime()),
    );
    const effectiveEnd = new Date(
        Math.min(period.endTime.getTime(), rangeEnd.getTime()),
    );

    if (effectiveStart < effectiveEnd) {
      const periodMinutes =
        (effectiveEnd.getTime() - effectiveStart.getTime()) / (1000 * 60);
      totalMinutes += periodMinutes;

      if (period.startTime < rangeStart || period.endTime > rangeEnd) {
        clippedPeriods++;
      }
    }
  });

  return {
    totalMinutes: Math.round(totalMinutes * 100) / 100,
    totalHours: Math.round((totalMinutes / 60) * 100) / 100,
    sessionsCount: sortedSessions.length,
    mergedPeriodsCount: mergedPeriods.length,
    duplicatesEliminated: sortedSessions.length - mergedPeriods.length,
    clippedPeriods,
    excludedSessionsCount,
  };
};

/**
 * Aktualizuje wszystkie koszty zakładu których zakres nachodzi na sesję
 * @param {Firestore} db - Instancja Firestore
 * @param {Date} sessionStart - Początek sesji
 * @param {Date} sessionEnd - Koniec sesji
 */
const updateAffectedFactoryCosts = async (db, sessionStart, sessionEnd) => {
  // Pobierz wszystkie koszty zakładu
  const costsSnapshot = await db.collection("factoryCosts").get();

  if (costsSnapshot.empty) {
    logger.info("No factory costs to update");
    return {updated: 0, tasksUpdated: 0};
  }

  let updatedCount = 0;
  const batch = db.batch();
  const affectedCosts = []; // Lista kosztów do aktualizacji zadań

  for (const costDoc of costsSnapshot.docs) {
    const costData = costDoc.data();
    const costStart = toDate(costData.startDate);
    const costEnd = toDate(costData.endDate);

    if (!costStart || !costEnd) continue;

    // Sprawdź czy sesja nachodzi na zakres kosztu
    const overlaps = sessionStart <= costEnd && sessionEnd >= costStart;

    if (overlaps) {
      // Pobierz wykluczone zadania z dokumentu kosztu
      const excludedTaskIds = costData.excludedTaskIds || [];

      logger.info(`Updating factory cost ${costDoc.id}`, {
        costPeriod: `${costStart.toISOString()} - ${costEnd.toISOString()}`,
        excludedTaskIds: excludedTaskIds.length,
      });

      // Pobierz sesje dla tego zakresu
      const sessions = await getOverlappingSessions(db, costStart, costEnd);

      // Oblicz efektywny czas (z uwzględnieniem wykluczeń)
      const effectiveTime = calculateEffectiveTime(
          sessions, costStart, costEnd, excludedTaskIds,
      );

      // Oblicz koszt na minutę
      const amount = parseFloat(costData.amount) || 0;
      const costPerMinute = effectiveTime.totalMinutes > 0 ?
        amount / effectiveTime.totalMinutes : 0;
      const costPerHour = costPerMinute * 60;

      // Aktualizuj dokument
      batch.update(costDoc.ref, {
        effectiveMinutes: effectiveTime.totalMinutes,
        effectiveHours: effectiveTime.totalHours,
        sessionsCount: effectiveTime.sessionsCount,
        mergedPeriodsCount: effectiveTime.mergedPeriodsCount,
        duplicatesEliminated: effectiveTime.duplicatesEliminated,
        clippedPeriods: effectiveTime.clippedPeriods,
        excludedSessionsCount: effectiveTime.excludedSessionsCount,
        costPerMinute: Math.round(costPerMinute * 100) / 100,
        costPerHour: Math.round(costPerHour * 100) / 100,
        lastCalculatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      updatedCount++;

      logger.info(`Factory cost ${costDoc.id} calculated`, {
        effectiveHours: effectiveTime.totalHours,
        costPerMinute: costPerMinute.toFixed(4),
        sessionsCount: effectiveTime.sessionsCount,
        excludedSessions: effectiveTime.excludedSessionsCount,
      });

      // Dodaj do listy kosztów do aktualizacji zadań
      affectedCosts.push({
        id: costDoc.id,
        data: {
          ...costData,
          costPerMinute: Math.round(costPerMinute * 100) / 100,
        },
      });
    }
  }

  if (updatedCount > 0) {
    await batch.commit();
  }

  // Aktualizuj koszty zakładu w zadaniach produkcyjnych
  let tasksUpdated = 0;
  for (const cost of affectedCosts) {
    try {
      const result = await updateTasksWithFactoryCost(db, cost.id, cost.data);
      tasksUpdated += result.updated;
    } catch (error) {
      logger.error(`Error updating tasks for cost ${cost.id}`, {
        error: error.message,
      });
    }
  }

  logger.info(`✅ Updated ${tasksUpdated} production tasks with factory costs`);

  return {updated: updatedCount, tasksUpdated};
};

/**
 * Trigger: Nasłuchuje na zmiany w kolekcji productionHistory
 * i przelicza koszty zakładu których to dotyczy
 */
const onProductionHistoryChange = onDocumentWritten(
    {
      document: "productionHistory/{sessionId}",
      region: "europe-central2",
      memory: "512MiB",
      timeoutSeconds: 120,
    },
    async (event) => {
      const db = admin.firestore();

      // Pobierz dane przed i po zmianie
      const beforeData = event.data.before.exists ?
        event.data.before.data() : null;
      const afterData = event.data.after.exists ?
        event.data.after.data() : null;

      // Określ zakres dat do sprawdzenia
      let sessionStart = null;
      let sessionEnd = null;

      if (afterData) {
        sessionStart = toDate(afterData.startTime);
        sessionEnd = toDate(afterData.endTime);
      }
      if (beforeData) {
        const beforeStart = toDate(beforeData.startTime);
        const beforeEnd = toDate(beforeData.endTime);

        if (beforeStart && (!sessionStart || beforeStart < sessionStart)) {
          sessionStart = beforeStart;
        }
        if (beforeEnd && (!sessionEnd || beforeEnd > sessionEnd)) {
          sessionEnd = beforeEnd;
        }
      }

      if (!sessionStart || !sessionEnd) {
        logger.warn("Could not determine session time range", {
          sessionId: event.params.sessionId,
        });
        return null;
      }

      logger.info("🔄 Production history change detected", {
        sessionId: event.params.sessionId,
        operation: !beforeData ? "create" : !afterData ? "delete" : "update",
        sessionStart: sessionStart.toISOString(),
        sessionEnd: sessionEnd.toISOString(),
      });

      try {
        const result = await updateAffectedFactoryCosts(
            db, sessionStart, sessionEnd,
        );

        logger.info(`✅ Factory costs update completed`, {
          updatedCosts: result.updated,
        });

        return result;
      } catch (error) {
        logger.error("❌ Error updating factory costs", {
          error: error.message,
          stack: error.stack,
        });
        throw error;
      }
    },
);

// ============================================================================
// PROPORCJONALNY PODZIAŁ KOSZTÓW ZAKŁADU MIĘDZY ZADANIA PRODUKCYJNE
// ============================================================================

/**
 * Oblicza proporcjonalny czas dla każdego zadania produkcyjnego
 * Gdy sesje się nakładają, czas jest dzielony równo między wszystkie aktywne zadania
 * @param {Array} sessions - Lista sesji z taskId, startTime, endTime
 * @param {Date} rangeStart - Początek zakresu
 * @param {Date} rangeEnd - Koniec zakresu
 * @param {Array} excludedTaskIds - Lista wykluczonych zadań
 * @return {Object} - Mapa taskId -> { proportionalMinutes, sessionsCount }
 */
const calculateProportionalTimePerTask = (sessions, rangeStart, rangeEnd, excludedTaskIds = []) => {
  if (!sessions || sessions.length === 0) {
    return {};
  }

  const excludedSet = new Set(excludedTaskIds || []);

  // Filtruj i konwertuj sesje
  const validSessions = sessions
      .filter((session) => {
        if (!session.taskId || !session.startTime || !session.endTime) return false;
        if (excludedSet.has(session.taskId)) return false;
        return true;
      })
      .map((session) => {
        const startTime = toDate(session.startTime);
        const endTime = toDate(session.endTime);

        if (!startTime || !endTime) return null;

        // Przytnij do granic zakresu
        const clippedStart = new Date(
            Math.max(startTime.getTime(), rangeStart.getTime()),
        );
        const clippedEnd = new Date(
            Math.min(endTime.getTime(), rangeEnd.getTime()),
        );

        if (clippedStart >= clippedEnd) return null;

        return {
          taskId: session.taskId,
          startTime: clippedStart,
          endTime: clippedEnd,
        };
      })
      .filter(Boolean);

  if (validSessions.length === 0) {
    return {};
  }

  // Zbierz wszystkie unikalne punkty czasowe
  const timePoints = new Set();
  validSessions.forEach((session) => {
    timePoints.add(session.startTime.getTime());
    timePoints.add(session.endTime.getTime());
  });

  const sortedTimePoints = Array.from(timePoints).sort((a, b) => a - b);

  // Inicjalizuj wynik dla każdego zadania
  const taskTimeMap = {};
  validSessions.forEach((session) => {
    if (!taskTimeMap[session.taskId]) {
      taskTimeMap[session.taskId] = {
        proportionalMinutes: 0,
        sessionsCount: 0,
        taskId: session.taskId,
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
    validSessions.forEach((session) => {
      if (session.startTime.getTime() <= intervalStart &&
          session.endTime.getTime() >= intervalEnd) {
        activeTasks.add(session.taskId);
      }
    });

    const activeCount = activeTasks.size;
    if (activeCount === 0) continue;

    // Podziel czas równo między aktywne zadania
    const minutesPerTask = intervalMinutes / activeCount;
    activeTasks.forEach((taskId) => {
      taskTimeMap[taskId].proportionalMinutes += minutesPerTask;
    });
  }

  // Zaokrąglij wyniki
  Object.keys(taskTimeMap).forEach((taskId) => {
    taskTimeMap[taskId].proportionalMinutes =
      Math.round(taskTimeMap[taskId].proportionalMinutes * 100) / 100;
  });

  return taskTimeMap;
};

/**
 * Aktualizuje koszty zakładu we wszystkich zadaniach produkcyjnych
 * dla danego kosztu zakładu
 * @param {Firestore} db - Instancja Firestore
 * @param {string} factoryCostId - ID kosztu zakładu
 * @param {Object} factoryCostData - Dane kosztu zakładu
 * @return {Promise<Object>} - Wynik aktualizacji
 */
const updateTasksWithFactoryCost = async (db, factoryCostId, factoryCostData) => {
  const costStart = toDate(factoryCostData.startDate);
  const costEnd = toDate(factoryCostData.endDate);
  const costPerMinute = factoryCostData.costPerMinute || 0;
  const excludedTaskIds = factoryCostData.excludedTaskIds || [];

  if (!costStart || !costEnd || costPerMinute <= 0) {
    logger.info("Skipping task update - no valid cost data", {factoryCostId});
    return {updated: 0};
  }

  logger.info(`Updating tasks with factory cost ${factoryCostId}`, {
    costPerMinute,
    excludedCount: excludedTaskIds.length,
  });

  // Pobierz sesje nachodzące na zakres
  const sessions = await getOverlappingSessions(db, costStart, costEnd);

  // Oblicz proporcjonalny czas dla każdego zadania
  const taskTimeMap = calculateProportionalTimePerTask(
      sessions, costStart, costEnd, excludedTaskIds,
  );

  const taskIds = Object.keys(taskTimeMap);
  if (taskIds.length === 0) {
    logger.info("No tasks to update");
    return {updated: 0};
  }

  // Pobierz dane o ilości dla każdego zadania
  const tasksRef = db.collection("productionTasks");
  let updatedCount = 0;

  // Pobierz i aktualizuj zadania batch'ami
  const batchSize = 10;
  for (let i = 0; i < taskIds.length; i += batchSize) {
    const batchIds = taskIds.slice(i, i + batchSize);
    const tasksSnapshot = await tasksRef
        .where(admin.firestore.FieldPath.documentId(), "in", batchIds)
        .get();

    const writeBatch = db.batch();

    tasksSnapshot.forEach((taskDoc) => {
      const taskData = taskDoc.data();
      const taskId = taskDoc.id;
      const timeData = taskTimeMap[taskId];

      if (!timeData) return;

      const factoryCostTotal = timeData.proportionalMinutes * costPerMinute;
      const quantity = parseFloat(taskData.quantity) || 1;
      const factoryCostPerUnit = factoryCostTotal / quantity;

      writeBatch.update(taskDoc.ref, {
        factoryCostTotal: Math.round(factoryCostTotal * 100) / 100,
        factoryCostPerUnit: Math.round(factoryCostPerUnit * 10000) / 10000,
        factoryCostMinutes: timeData.proportionalMinutes,
        factoryCostId: factoryCostId,
        factoryCostUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(), // Dla real-time listener
      });

      updatedCount++;

      logger.info(`Task ${taskData.moNumber || taskId} updated`, {
        factoryCostPerUnit: factoryCostPerUnit.toFixed(4),
        proportionalMinutes: timeData.proportionalMinutes,
      });
    });

    await writeBatch.commit();
  }

  // Wyczyść koszty dla wykluczonych zadań
  for (const taskId of excludedTaskIds) {
    try {
      const taskRef = tasksRef.doc(taskId);
      const taskDoc = await taskRef.get();
      if (taskDoc.exists()) {
        await taskRef.update({
          factoryCostTotal: 0,
          factoryCostPerUnit: 0,
          factoryCostMinutes: 0,
          factoryCostId: null,
          factoryCostUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(), // Dla real-time listener
        });
        logger.info(`Cleared factory cost for excluded task ${taskId}`);
      }
    } catch (error) {
      logger.warn(`Failed to clear excluded task ${taskId}`, {error: error.message});
    }
  }

  logger.info(`✅ Updated ${updatedCount} tasks with factory cost`);
  return {updated: updatedCount};
};

/**
 * Funkcja pomocnicza do ręcznego przeliczania wszystkich kosztów
 * Może być wywołana jako callable function
 * @param {Firestore} db - Instancja Firestore
 * @return {Promise<Object>} - Wynik przeliczania
 */
const recalculateAllFactoryCosts = async (db) => {
  const costsSnapshot = await db.collection("factoryCosts").get();

  if (costsSnapshot.empty) {
    return {updated: 0, tasksUpdated: 0};
  }

  let updatedCount = 0;
  const batch = db.batch();
  const processedCosts = [];

  for (const costDoc of costsSnapshot.docs) {
    const costData = costDoc.data();
    const costStart = toDate(costData.startDate);
    const costEnd = toDate(costData.endDate);

    if (!costStart || !costEnd) continue;

    // Pobierz wykluczone zadania
    const excludedTaskIds = costData.excludedTaskIds || [];

    const sessions = await getOverlappingSessions(db, costStart, costEnd);
    const effectiveTime = calculateEffectiveTime(
        sessions, costStart, costEnd, excludedTaskIds,
    );

    const amount = parseFloat(costData.amount) || 0;
    const costPerMinute = effectiveTime.totalMinutes > 0 ?
      amount / effectiveTime.totalMinutes : 0;
    const costPerHour = costPerMinute * 60;

    batch.update(costDoc.ref, {
      effectiveMinutes: effectiveTime.totalMinutes,
      effectiveHours: effectiveTime.totalHours,
      sessionsCount: effectiveTime.sessionsCount,
      mergedPeriodsCount: effectiveTime.mergedPeriodsCount,
      duplicatesEliminated: effectiveTime.duplicatesEliminated,
      clippedPeriods: effectiveTime.clippedPeriods,
      excludedSessionsCount: effectiveTime.excludedSessionsCount,
      costPerMinute: Math.round(costPerMinute * 100) / 100,
      costPerHour: Math.round(costPerHour * 100) / 100,
      lastCalculatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    processedCosts.push({
      id: costDoc.id,
      data: {
        ...costData,
        costPerMinute: Math.round(costPerMinute * 100) / 100,
      },
    });

    updatedCount++;
  }

  if (updatedCount > 0) {
    await batch.commit();
  }

  // Aktualizuj koszty zakładu w zadaniach produkcyjnych
  let tasksUpdated = 0;
  for (const cost of processedCosts) {
    try {
      const result = await updateTasksWithFactoryCost(db, cost.id, cost.data);
      tasksUpdated += result.updated;
    } catch (error) {
      logger.error(`Error updating tasks for cost ${cost.id}`, {
        error: error.message,
      });
    }
  }

  logger.info(`✅ Recalculated ${updatedCount} costs, updated ${tasksUpdated} tasks`);

  return {updated: updatedCount, tasksUpdated};
};

module.exports = {
  onProductionHistoryChange,
  recalculateAllFactoryCosts,
};
