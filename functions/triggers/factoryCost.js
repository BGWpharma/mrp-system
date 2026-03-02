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

// Marker używany do wykrywania zmian pochodzących z funkcji (zapobieganie pętlom)
const FUNCTION_TRIGGER_MARKER = "_triggeredByFunction";

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
 * Dzieli tablicę na mniejsze chunki
 * @param {Array} array - Tablica do podzielenia
 * @param {number} size - Rozmiar chunka
 * @return {Array} - Tablica chunków
 */
const chunkArray = (array, size) => {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

/**
 * Pobiera sesje produkcyjne nachodzące na podany zakres dat
 * UWAGA: startTime/endTime w productionHistory mogą być zarówno
 * Firestore Timestamp jak i string ISO (zależnie od źródła zapisu).
 * Dlatego pobieramy wszystkie dokumenty i filtrujemy w kodzie.
 * @param {Firestore} db - Instancja Firestore
 * @param {Date} rangeStart - Początek zakresu
 * @param {Date} rangeEnd - Koniec zakresu
 * @return {Promise<Array>} - Lista sesji
 */
const getOverlappingSessions = async (db, rangeStart, rangeEnd) => {
  const historyRef = db.collection("productionHistory");

  // Pobieramy wszystkie dokumenty - startTime może być string lub Timestamp,
  // Firestore nie obsługuje porównań cross-type w where()
  const snapshot = await historyRef.get();

  const sessions = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    const startTime = toDate(data.startTime);
    const endTime = toDate(data.endTime);

    if (!startTime || !endTime) return;
    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) return;

    // Sesja nachodzi na zakres jeśli: startTime <= rangeEnd AND endTime >= rangeStart
    if (startTime <= rangeEnd && endTime >= rangeStart) {
      sessions.push({
        id: doc.id,
        taskId: data.taskId,
        startTime,
        endTime,
      });
    }
  });

  // Sortuj po startTime
  sessions.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

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

      // Aktualizuj dokument z markerem zapobiegającym pętlom
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
        [FUNCTION_TRIGGER_MARKER]: true,
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
 * ZOPTYMALIZOWANE: używa batch queries zamiast N+1
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

  // Najpierw wyczyść koszty dla wykluczonych zadań - BATCH QUERY
  const tasksRef = db.collection("productionTasks");
  if (excludedTaskIds.length > 0) {
    const excludedChunks = chunkArray(excludedTaskIds, 10);

    for (const chunk of excludedChunks) {
      const excludedSnapshot = await tasksRef
          .where(admin.firestore.FieldPath.documentId(), "in", chunk)
          .get();

      if (excludedSnapshot.empty) continue;

      const clearBatch = db.batch();

      excludedSnapshot.forEach((taskDoc) => {
        const taskData = taskDoc.data();
        const existingTotalFullProductionCost =
          parseFloat(taskData.totalFullProductionCost) || 0;
        const existingUnitFullProductionCost =
          parseFloat(taskData.unitFullProductionCost) || 0;

        clearBatch.update(taskDoc.ref, {
          factoryCostTotal: 0,
          factoryCostPerUnit: 0,
          factoryCostMinutes: 0,
          factoryCostId: null,
          factoryCostUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          totalCostWithFactory: existingTotalFullProductionCost,
          unitCostWithFactory: existingUnitFullProductionCost,
        });

        logger.info(`Cleared factory cost for excluded task ${taskDoc.id}`);
      });

      await clearBatch.commit();
    }
  }

  const taskIds = Object.keys(taskTimeMap);
  if (taskIds.length === 0) {
    logger.info("No tasks to update (all excluded or no sessions)");

    // Mimo braku zadań, propaguj do zamówień aby wyczyścić koszty
    if (excludedTaskIds.length > 0) {
      await propagateToOrders(db, [], excludedTaskIds);
    }

    return {updated: 0, excludedCleared: excludedTaskIds.length};
  }

  // Pobierz i aktualizuj zadania batch'ami (max 10 w zapytaniu "in")
  let updatedCount = 0;
  const updatedTaskIds = [];

  const taskChunks = chunkArray(taskIds, 10);

  for (const chunk of taskChunks) {
    const tasksSnapshot = await tasksRef
        .where(admin.firestore.FieldPath.documentId(), "in", chunk)
        .get();

    const writeBatch = db.batch();
    const taskDocs = tasksSnapshot.docs;

    for (const taskDoc of taskDocs) {
      const taskData = taskDoc.data();
      const taskId = taskDoc.id;
      const timeData = taskTimeMap[taskId];

      if (!timeData) continue;

      const factoryCostTotal = timeData.proportionalMinutes * costPerMinute;
      const quantity = parseFloat(taskData.quantity) || 1;
      const factoryCostPerUnit = factoryCostTotal / quantity;

      // Pobierz istniejące koszty produkcji z zadania
      const existingTotalFullProductionCost =
        parseFloat(taskData.totalFullProductionCost) || 0;
      const existingUnitFullProductionCost =
        parseFloat(taskData.unitFullProductionCost) || 0;

      // Oblicz pełne koszty z zakładem
      const totalCostWithFactory =
        existingTotalFullProductionCost + factoryCostTotal;
      const unitCostWithFactory =
        existingUnitFullProductionCost + factoryCostPerUnit;

      writeBatch.update(taskDoc.ref, {
        factoryCostTotal: Math.round(factoryCostTotal * 100) / 100,
        factoryCostPerUnit: Math.round(factoryCostPerUnit * 10000) / 10000,
        factoryCostMinutes: timeData.proportionalMinutes,
        factoryCostId: factoryCostId,
        factoryCostUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        // Nowe pola z pełnym kosztem (materiały + zakład)
        totalCostWithFactory: Math.round(totalCostWithFactory * 100) / 100,
        unitCostWithFactory: Math.round(unitCostWithFactory * 10000) / 10000,
      });

      updatedCount++;
      updatedTaskIds.push(taskId);

      logger.info(`Task ${taskData.moNumber || taskId} updated`, {
        factoryCostPerUnit: factoryCostPerUnit.toFixed(4),
        proportionalMinutes: timeData.proportionalMinutes,
        totalCostWithFactory: totalCostWithFactory.toFixed(2),
        unitCostWithFactory: unitCostWithFactory.toFixed(4),
      });
    }

    await writeBatch.commit();
  }

  logger.info(`✅ Updated ${updatedCount} tasks with factory cost`);

  // Propaguj zmiany do powiązanych zamówień
  await propagateToOrders(db, updatedTaskIds, excludedTaskIds);

  return {updated: updatedCount};
};

/**
 * Propaguje koszty z zakładem do powiązanych zamówień
 * ZOPTYMALIZOWANE: używa batch queries, usunięta "Metoda 4" (skanowanie wszystkich zamówień)
 * @param {Firestore} db - Instancja Firestore
 * @param {Array} taskIds - Lista ID zadań do zaktualizowania
 * @param {Array} excludedTaskIds - Lista wykluczonych ID zadań
 */
const propagateToOrders = async (db, taskIds, excludedTaskIds) => {
  const allTaskIds = [...taskIds, ...excludedTaskIds];
  if (allTaskIds.length === 0) return;

  logger.info(`Propagating costs to orders for ${allTaskIds.length} tasks`);

  const tasksRef = db.collection("productionTasks");
  const ordersRef = db.collection("orders");

  // Pobierz wszystkie zadania batch'ami
  const taskChunks = chunkArray(allTaskIds, 10);
  const taskDataMap = new Map();

  for (const chunk of taskChunks) {
    const tasksSnapshot = await tasksRef
        .where(admin.firestore.FieldPath.documentId(), "in", chunk)
        .get();

    tasksSnapshot.forEach((doc) => {
      taskDataMap.set(doc.id, doc.data());
    });
  }

  // Zbierz unikalne orderId i orderNumber z zadań
  const orderIds = new Set();
  const orderNumbers = new Set();

  taskDataMap.forEach((taskData) => {
    if (taskData.orderId) orderIds.add(taskData.orderId);
    if (taskData.orderNumber) orderNumbers.add(taskData.orderNumber);
  });

  // Pobierz zamówienia po ID (batch)
  const ordersToUpdate = new Map();

  if (orderIds.size > 0) {
    const orderIdChunks = chunkArray(Array.from(orderIds), 10);
    for (const chunk of orderIdChunks) {
      const ordersSnapshot = await ordersRef
          .where(admin.firestore.FieldPath.documentId(), "in", chunk)
          .get();

      ordersSnapshot.forEach((doc) => {
        ordersToUpdate.set(doc.id, {ref: doc.ref, data: doc.data()});
      });
    }
  }

  // Pobierz brakujące zamówienia po orderNumber (batch)
  const missingOrderNumbers = Array.from(orderNumbers).filter((num) => {
    // Sprawdź czy już mamy to zamówienie
    for (const [, order] of ordersToUpdate) {
      if (order.data.orderNumber === num) return false;
    }
    return true;
  });

  if (missingOrderNumbers.length > 0) {
    const orderNumChunks = chunkArray(missingOrderNumbers, 10);
    for (const chunk of orderNumChunks) {
      const ordersSnapshot = await ordersRef
          .where("orderNumber", "in", chunk)
          .get();

      ordersSnapshot.forEach((doc) => {
        if (!ordersToUpdate.has(doc.id)) {
          ordersToUpdate.set(doc.id, {ref: doc.ref, data: doc.data()});
        }
      });
    }
  }

  // Pobierz zamówienia przez productionTaskIds (batch)
  for (const chunk of taskChunks) {
    for (const taskId of chunk) {
      const ordersSnapshot = await ordersRef
          .where("productionTaskIds", "array-contains", taskId)
          .limit(5) // Ograniczenie - zadanie nie powinno być w wielu zamówieniach
          .get();

      ordersSnapshot.forEach((doc) => {
        if (!ordersToUpdate.has(doc.id)) {
          ordersToUpdate.set(doc.id, {ref: doc.ref, data: doc.data()});
        }
      });
    }
  }

  logger.info(`Found ${ordersToUpdate.size} orders to update`);

  // Aktualizuj zamówienia
  for (const [, orderInfo] of ordersToUpdate) {
    const orderData = orderInfo.data;
    let orderUpdated = false;
    const updatedItems = [...(orderData.items || [])];

    for (let i = 0; i < updatedItems.length; i++) {
      const item = updatedItems[i];
      const taskId = item.productionTaskId;

      if (!taskId || !taskDataMap.has(taskId)) continue;

      const taskData = taskDataMap.get(taskId);
      const totalMaterialCost = parseFloat(taskData.totalMaterialCost) || 0;
      const factoryCostTotal = parseFloat(taskData.factoryCostTotal) || 0;
      const totalCostWithFactory = parseFloat(taskData.totalCostWithFactory) || 0;
      const quantity = parseFloat(taskData.quantity) || 1;

      // productionCost = materiały z flagą "wliczaj" + factory cost
      const materialCostWithFactory = totalMaterialCost + factoryCostTotal;
      const fullProductionUnitCost = totalCostWithFactory / quantity;

      updatedItems[i] = {
        ...item,
        productionCost: materialCostWithFactory,
        fullProductionCost: totalCostWithFactory,
        productionUnitCost: Math.round((materialCostWithFactory / quantity) * 10000) / 10000,
        fullProductionUnitCost: Math.round(fullProductionUnitCost * 10000) / 10000,
        factoryCostIncluded: factoryCostTotal > 0,
      };
      orderUpdated = true;

      logger.info(`Updated order item in ${orderData.orderNumber}`, {
        taskId,
        materialCostWithFactory,
        totalCostWithFactory,
        fullProductionUnitCost,
      });
    }

    if (orderUpdated) {
      // Przelicz totalValue zamówienia
      const calculateItemTotalValue = (item) => {
        const itemValue = (parseFloat(item.quantity) || 0) *
          (parseFloat(item.price) || 0);
        if (item.fromPriceList && parseFloat(item.price || 0) > 0) {
          return itemValue;
        }
        if (item.productionTaskId && item.productionCost !== undefined) {
          return itemValue + parseFloat(item.productionCost || 0);
        }
        return itemValue;
      };

      const subtotal = updatedItems.reduce((sum, item) => {
        return sum + calculateItemTotalValue(item);
      }, 0);

      const shippingCost = parseFloat(orderData.shippingCost) || 0;
      const additionalCosts = orderData.additionalCostsItems ?
        orderData.additionalCostsItems
            .filter((cost) => parseFloat(cost.value) > 0)
            .reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0) :
        0;
      const discounts = orderData.additionalCostsItems ?
        Math.abs(orderData.additionalCostsItems
            .filter((cost) => parseFloat(cost.value) < 0)
            .reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0)) :
        0;

      const newTotalValue = subtotal + shippingCost + additionalCosts - discounts;

      await orderInfo.ref.update({
        items: updatedItems,
        totalValue: Math.round(newTotalValue * 100) / 100,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      logger.info(`Updated order ${orderData.orderNumber} totalValue`, {
        oldValue: orderData.totalValue,
        newValue: newTotalValue,
      });
    }
  }
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
      [FUNCTION_TRIGGER_MARKER]: true,
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

/**
 * Trigger: Nasłuchuje na zmiany w kolekcji factoryCosts
 * i przelicza koszty dla zadań produkcyjnych w zakresie dat
 *
 * DEPLOYMENT:
 * firebase deploy --only functions:bgw-mrp:onFactoryCostChange
 */
const onFactoryCostChange = onDocumentWritten(
    {
      document: "factoryCosts/{costId}",
      region: "europe-central2",
    },
    async (event) => {
      const costId = event.params.costId;
      const beforeData = event.data?.before?.data();
      const afterData = event.data?.after?.data();

      // ZAPOBIEGANIE PĘTLOM: sprawdź czy zmiana pochodzi z funkcji
      if (afterData?.[FUNCTION_TRIGGER_MARKER] && beforeData?.[FUNCTION_TRIGGER_MARKER]) {
        // Obie wersje mają marker - sprawdź czy tylko marker/timestamp się zmienił
        const beforeWithoutMeta = {...beforeData};
        const afterWithoutMeta = {...afterData};

        // Usuń pola meta do porównania
        delete beforeWithoutMeta[FUNCTION_TRIGGER_MARKER];
        delete afterWithoutMeta[FUNCTION_TRIGGER_MARKER];
        delete beforeWithoutMeta.lastCalculatedAt;
        delete afterWithoutMeta.lastCalculatedAt;
        delete beforeWithoutMeta.effectiveMinutes;
        delete afterWithoutMeta.effectiveMinutes;
        delete beforeWithoutMeta.effectiveHours;
        delete afterWithoutMeta.effectiveHours;
        delete beforeWithoutMeta.costPerMinute;
        delete afterWithoutMeta.costPerMinute;
        delete beforeWithoutMeta.costPerHour;
        delete afterWithoutMeta.costPerHour;
        delete beforeWithoutMeta.sessionsCount;
        delete afterWithoutMeta.sessionsCount;
        delete beforeWithoutMeta.mergedPeriodsCount;
        delete afterWithoutMeta.mergedPeriodsCount;
        delete beforeWithoutMeta.duplicatesEliminated;
        delete afterWithoutMeta.duplicatesEliminated;
        delete beforeWithoutMeta.clippedPeriods;
        delete afterWithoutMeta.clippedPeriods;
        delete beforeWithoutMeta.excludedSessionsCount;
        delete afterWithoutMeta.excludedSessionsCount;

        const beforeJson = JSON.stringify(beforeWithoutMeta);
        const afterJson = JSON.stringify(afterWithoutMeta);

        if (beforeJson === afterJson) {
          logger.info(`⏭️ Skipping factory cost change - triggered by function (no user data change)`, {
            costId,
          });
          return null;
        }
      }

      // Określ typ zmiany
      const isCreate = !beforeData && afterData;
      const isDelete = beforeData && !afterData;

      const changeType = isCreate ? "CREATE" : isDelete ? "DELETE" : "UPDATE";
      logger.info(`📊 Factory cost change detected`, {
        costId,
        changeType,
      });

      const db = admin.firestore();

      // Pobierz zakres dat z kosztu (przed lub po zmianie)
      const costData = afterData || beforeData;
      if (!costData) {
        logger.warn(`No cost data available for ${costId}`);
        return null;
      }

      const startDate = toDate(costData.startDate);
      const endDate = toDate(costData.endDate);

      if (!startDate || !endDate) {
        logger.warn(`Invalid date range for cost ${costId}`);
        return null;
      }

      logger.info(`Processing factory cost change for period`, {
        costId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      try {
        // Znajdź wszystkie sesje produkcyjne w tym zakresie dat
        const sessions = await getOverlappingSessions(db, startDate, endDate);

        if (sessions.length === 0) {
          logger.info(`No production history in date range for cost ${costId}`);

          // Mimo braku historii, zaktualizuj sam koszt zakładu
          if (afterData) {
            await recalculateSingleFactoryCost(db, costId, afterData);
          }
          return null;
        }

        // Zbierz unikalne taskId z historii produkcji
        const taskIds = new Set();
        sessions.forEach((session) => {
          if (session.taskId) {
            taskIds.add(session.taskId);
          }
        });

        logger.info(`Found ${taskIds.size} tasks affected by factory cost change`);

        // Przelicz koszt zakładu
        if (afterData) {
          await recalculateSingleFactoryCost(db, costId, afterData);
        } else if (isDelete) {
          // Przy usunięciu - wyzeruj koszty zakładu dla zadań
          await clearFactoryCostFromTasks(db, costId, taskIds);
        }

        return {
          costId,
          changeType,
          affectedTasks: taskIds.size,
        };
      } catch (error) {
        logger.error(`Error processing factory cost change`, {
          costId,
          error: error.message,
        });
        throw error;
      }
    },
);

/**
 * Propaguje koszt zakładu do zadań produkcyjnych i zamówień
 * NIE nadpisuje danych obliczonych przez frontend (effectiveMinutes, costPerMinute)
 * Frontend jest odpowiedzialny za obliczanie i zapisywanie tych wartości
 * @param {Firestore} db - Instancja Firestore
 * @param {string} costId - ID kosztu zakładu
 * @param {Object} costData - Dane kosztu zakładu (z bazy, już obliczone przez frontend)
 */
const recalculateSingleFactoryCost = async (db, costId, costData) => {
  const startDate = toDate(costData.startDate);
  const endDate = toDate(costData.endDate);
  const excludedTaskIds = costData.excludedTaskIds || [];

  // Użyj costPerMinute zapisanego przez frontend (NIE przeliczaj od nowa!)
  const costPerMinute = parseFloat(costData.costPerMinute) || 0;

  logger.info(`Propagating factory cost ${costId} to tasks`, {
    costPerMinute,
    effectiveMinutes: costData.effectiveMinutes,
    excludedCount: excludedTaskIds.length,
  });

  // Jeśli nie ma costPerMinute, nie ma co propagować
  if (costPerMinute <= 0) {
    logger.info(`No costPerMinute for ${costId}, skipping task updates`);
    return;
  }

  // Pobierz historię produkcji w zakresie dat (zoptymalizowane)
  const sessions = await getOverlappingSessions(db, startDate, endDate);

  if (sessions.length === 0) {
    logger.info(`No production history for cost ${costId}`);
    return;
  }

  // Filtruj wykluczone sesje
  const filteredSessions = sessions.filter((s) => !excludedTaskIds.includes(s.taskId));

  // Najpierw wyczyść koszty dla wykluczonych zadań
  const tasksRef = db.collection("productionTasks");
  if (excludedTaskIds.length > 0) {
    const excludedChunks = chunkArray(excludedTaskIds, 10);

    for (const chunk of excludedChunks) {
      const excludedSnapshot = await tasksRef
          .where(admin.firestore.FieldPath.documentId(), "in", chunk)
          .get();

      if (excludedSnapshot.empty) continue;

      const clearBatch = db.batch();

      excludedSnapshot.forEach((taskDoc) => {
        const taskData = taskDoc.data();
        const existingTotalFullProductionCost =
          parseFloat(taskData.totalFullProductionCost) || 0;
        const existingUnitFullProductionCost =
          parseFloat(taskData.unitFullProductionCost) || 0;

        clearBatch.update(taskDoc.ref, {
          factoryCostTotal: 0,
          factoryCostPerUnit: 0,
          factoryCostMinutes: 0,
          factoryCostId: null,
          factoryCostUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          totalCostWithFactory: existingTotalFullProductionCost,
          unitCostWithFactory: existingUnitFullProductionCost,
        });

        logger.info(`Cleared factory cost for excluded task ${taskDoc.id}`);
      });

      await clearBatch.commit();
    }
  }

  // Oblicz proporcjonalny czas dla każdego zadania
  const taskTimeMap = calculateProportionalTime(filteredSessions, startDate, endDate);

  // Zaktualizuj zadania produkcyjne - BATCH QUERIES
  const taskIds = Array.from(taskTimeMap.keys());
  let tasksUpdated = 0;

  if (taskIds.length === 0) {
    logger.info(`No tasks to update (all excluded or no sessions) for cost ${costId}`);

    // Mimo braku zadań, propaguj do zamówień aby wyczyścić koszty
    if (excludedTaskIds.length > 0) {
      await propagateToOrders(db, [], excludedTaskIds);
    }

    logger.info(`✅ Propagated factory cost ${costId} (excluded only)`, {
      costPerMinute,
      excludedCleared: excludedTaskIds.length,
    });
    return;
  }

  const taskChunks = chunkArray(taskIds, 10);

  for (const chunk of taskChunks) {
    const tasksSnapshot = await tasksRef
        .where(admin.firestore.FieldPath.documentId(), "in", chunk)
        .get();

    let writeBatch = db.batch();
    let batchCount = 0;

    for (const taskDoc of tasksSnapshot.docs) {
      const taskData = taskDoc.data();
      const taskId = taskDoc.id;
      const timeData = taskTimeMap.get(taskId);

      if (!timeData) continue;

      const quantity = parseFloat(taskData.quantity) || 1;
      const factoryCostTotal = timeData.proportionalMinutes * costPerMinute;
      const factoryCostPerUnit = factoryCostTotal / quantity;

      const existingTotalFullProductionCost =
        parseFloat(taskData.totalFullProductionCost) || 0;
      const existingUnitFullProductionCost =
        parseFloat(taskData.unitFullProductionCost) || 0;

      const totalCostWithFactory = existingTotalFullProductionCost + factoryCostTotal;
      const unitCostWithFactory = existingUnitFullProductionCost + factoryCostPerUnit;

      logger.info(`Updating task ${taskData.moNumber || taskId}`, {
        factoryCostTotal,
        factoryCostPerUnit,
        totalCostWithFactory,
        unitCostWithFactory,
      });

      writeBatch.update(taskDoc.ref, {
        factoryCostTotal: Math.round(factoryCostTotal * 100) / 100,
        factoryCostPerUnit: Math.round(factoryCostPerUnit * 10000) / 10000,
        factoryCostMinutes: timeData.proportionalMinutes,
        factoryCostId: costId,
        factoryCostUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        totalCostWithFactory: Math.round(totalCostWithFactory * 100) / 100,
        unitCostWithFactory: Math.round(unitCostWithFactory * 10000) / 10000,
      });

      batchCount++;
      tasksUpdated++;

      if (batchCount >= 400) {
        await writeBatch.commit();
        writeBatch = db.batch();
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await writeBatch.commit();
    }
  }

  logger.info(`Updated ${tasksUpdated} tasks with factory costs`);

  // Propaguj do zamówień
  await propagateToOrders(db, taskIds, excludedTaskIds);

  logger.info(`✅ Propagated factory cost ${costId}`, {
    costPerMinute,
    tasksUpdated,
  });
};

/**
 * Pomocnicza funkcja do obliczania proporcjonalnego czasu
 * (uproszczona wersja z głównego triggera)
 * @param {Array} sessions - Lista sesji produkcyjnych
 * @param {Date} startDate - Data początkowa zakresu
 * @param {Date} endDate - Data końcowa zakresu
 * @return {Map} Mapa taskId -> { proportionalMinutes }
 */
const calculateProportionalTime = (sessions, startDate, endDate) => {
  const taskTimeMap = new Map();

  // Sortuj sesje po czasie rozpoczęcia
  sessions.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  // Zbierz wszystkie punkty czasowe
  const timePoints = new Set();
  sessions.forEach((s) => {
    // Przytnij do zakresu dat kosztu
    const clippedStart = new Date(Math.max(s.startTime.getTime(), startDate.getTime()));
    const clippedEnd = new Date(Math.min(s.endTime.getTime(), endDate.getTime()));
    if (clippedStart < clippedEnd) {
      timePoints.add(clippedStart.getTime());
      timePoints.add(clippedEnd.getTime());
    }
  });

  const sortedPoints = Array.from(timePoints).sort((a, b) => a - b);

  // Dla każdego przedziału oblicz ile zadań jest aktywnych
  for (let i = 0; i < sortedPoints.length - 1; i++) {
    const intervalStart = sortedPoints[i];
    const intervalEnd = sortedPoints[i + 1];
    const intervalMinutes = (intervalEnd - intervalStart) / 60000;

    // Znajdź aktywne sesje w tym przedziale
    const activeSessions = sessions.filter((s) => {
      const clippedStart = Math.max(s.startTime.getTime(), startDate.getTime());
      const clippedEnd = Math.min(s.endTime.getTime(), endDate.getTime());
      return clippedStart <= intervalStart && clippedEnd >= intervalEnd;
    });

    if (activeSessions.length > 0) {
      const minutesPerTask = intervalMinutes / activeSessions.length;

      activeSessions.forEach((s) => {
        const current = taskTimeMap.get(s.taskId) || {proportionalMinutes: 0};
        current.proportionalMinutes += minutesPerTask;
        taskTimeMap.set(s.taskId, current);
      });
    }
  }

  return taskTimeMap;
};

/**
 * Wyzeruj koszty zakładu dla zadań przy usunięciu kosztu
 * ZOPTYMALIZOWANE: używa batch queries
 * @param {Firestore} db - Instancja Firestore
 * @param {string} costId - ID usuniętego kosztu
 * @param {Set} taskIds - Zestaw ID zadań do aktualizacji
 */
const clearFactoryCostFromTasks = async (db, costId, taskIds) => {
  const tasksRef = db.collection("productionTasks");
  const taskIdArray = Array.from(taskIds);
  const taskChunks = chunkArray(taskIdArray, 10);
  const clearedTaskIds = [];

  for (const chunk of taskChunks) {
    const tasksSnapshot = await tasksRef
        .where(admin.firestore.FieldPath.documentId(), "in", chunk)
        .get();

    const writeBatch = db.batch();
    let batchCount = 0;

    for (const taskDoc of tasksSnapshot.docs) {
      const taskData = taskDoc.data();

      // Sprawdź czy to zadanie miało ten koszt zakładu
      if (taskData.factoryCostId !== costId) continue;

      const existingTotalFullProductionCost =
        parseFloat(taskData.totalFullProductionCost) || 0;
      const existingUnitFullProductionCost =
        parseFloat(taskData.unitFullProductionCost) || 0;

      writeBatch.update(taskDoc.ref, {
        factoryCostTotal: 0,
        factoryCostPerUnit: 0,
        factoryCostMinutes: 0,
        factoryCostId: null,
        factoryCostUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        totalCostWithFactory: existingTotalFullProductionCost,
        unitCostWithFactory: existingUnitFullProductionCost,
      });

      batchCount++;
      clearedTaskIds.push(taskDoc.id);

      if (batchCount >= 400) {
        await writeBatch.commit();
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await writeBatch.commit();
    }
  }

  // Propaguj zerowe koszty do zamówień
  if (clearedTaskIds.length > 0) {
    await propagateToOrders(db, clearedTaskIds, []);
  }

  logger.info(`✅ Cleared factory cost ${costId} from ${clearedTaskIds.length} tasks`);
};

module.exports = {
  onProductionHistoryChange,
  onFactoryCostChange,
  recalculateAllFactoryCosts,
};
