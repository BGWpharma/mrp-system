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

      logger.info(`Task ${taskData.moNumber || taskId} updated`, {
        factoryCostPerUnit: factoryCostPerUnit.toFixed(4),
        proportionalMinutes: timeData.proportionalMinutes,
        totalCostWithFactory: totalCostWithFactory.toFixed(2),
        unitCostWithFactory: unitCostWithFactory.toFixed(4),
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
        const taskData = taskDoc.data();
        // Przywróć wartości bez kosztu zakładu
        const existingTotalFullProductionCost =
          parseFloat(taskData.totalFullProductionCost) || 0;
        const existingUnitFullProductionCost =
          parseFloat(taskData.unitFullProductionCost) || 0;

        await taskRef.update({
          factoryCostTotal: 0,
          factoryCostPerUnit: 0,
          factoryCostMinutes: 0,
          factoryCostId: null,
          factoryCostUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          // Dla wykluczonych: *WithFactory = koszty produkcji bez zakładu
          totalCostWithFactory: existingTotalFullProductionCost,
          unitCostWithFactory: existingUnitFullProductionCost,
        });
        logger.info(`Cleared factory cost for excluded task ${taskId}`);
      }
    } catch (error) {
      logger.warn(`Failed to clear excluded task ${taskId}`, {error: error.message});
    }
  }

  logger.info(`✅ Updated ${updatedCount} tasks with factory cost`);

  // Propaguj zmiany do powiązanych zamówień
  await propagateToOrders(db, taskIds, excludedTaskIds);

  return {updated: updatedCount};
};

/**
 * Propaguje koszty z zakładem do powiązanych zamówień
 * @param {Firestore} db - Instancja Firestore
 * @param {Array} taskIds - Lista ID zadań do zaktualizowania
 * @param {Array} excludedTaskIds - Lista wykluczonych ID zadań
 */
const propagateToOrders = async (db, taskIds, excludedTaskIds) => {
  const allTaskIds = [...taskIds, ...excludedTaskIds];
  if (allTaskIds.length === 0) return;

  logger.info(`Propagating costs to orders for ${allTaskIds.length} tasks`);

  // Znajdź zamówienia powiązane z tymi zadaniami
  const ordersRef = db.collection("orders");

  for (const taskId of allTaskIds) {
    try {
      // Pobierz aktualne dane zadania
      const taskDoc = await db.collection("productionTasks").doc(taskId).get();
      if (!taskDoc.exists()) continue;

      const taskData = taskDoc.data();
      const totalCostWithFactory = parseFloat(taskData.totalCostWithFactory) || 0;
      const quantity = parseFloat(taskData.quantity) || 1;

      // Znajdź zamówienia z tym zadaniem - metoda 1: przez productionTaskIds
      let ordersSnapshot = await ordersRef
          .where("productionTaskIds", "array-contains", taskId)
          .get();

      logger.info(`Search method 1 (productionTaskIds): ${ordersSnapshot.empty ? "not found" : `found ${ordersSnapshot.docs.length}`}`);

      // Metoda 2: szukaj przez orderId w zadaniu
      if (ordersSnapshot.empty && taskData.orderId) {
        const orderDoc = await ordersRef.doc(taskData.orderId).get();
        if (orderDoc.exists) {
          ordersSnapshot = {
            empty: false,
            docs: [orderDoc],
          };
          logger.info(`Search method 2 (task.orderId): found order ${taskData.orderId}`);
        }
      }

      // Metoda 3: szukaj przez orderNumber w zadaniu
      if (ordersSnapshot.empty && taskData.orderNumber) {
        const orderByNumberSnapshot = await ordersRef
            .where("orderNumber", "==", taskData.orderNumber)
            .limit(1)
            .get();
        if (!orderByNumberSnapshot.empty) {
          ordersSnapshot = orderByNumberSnapshot;
          logger.info(`Search method 3 (orderNumber): found order ${taskData.orderNumber}`);
        }
      }

      // Metoda 4: przeszukaj wszystkie zamówienia i sprawdź items[].productionTaskId
      if (ordersSnapshot.empty) {
        logger.info(`Trying method 4: scanning all orders for task ${taskId}`);
        const allOrdersSnapshot = await ordersRef.get();
        const matchingOrders = [];

        for (const orderDoc of allOrdersSnapshot.docs) {
          const orderData = orderDoc.data();
          const hasTask = (orderData.items || []).some(
              (item) => item.productionTaskId === taskId,
          );
          if (hasTask) {
            matchingOrders.push(orderDoc);
            logger.info(`Search method 4: found order ${orderData.orderNumber} with task ${taskId}`);
          }
        }

        if (matchingOrders.length > 0) {
          ordersSnapshot = {
            empty: false,
            docs: matchingOrders,
          };
        }
      }

      if (ordersSnapshot.empty) {
        logger.info(`No orders found for task ${taskId} (moNumber: ${taskData.moNumber})`);
        continue;
      }

      for (const orderDoc of ordersSnapshot.docs) {
        const orderData = orderDoc.data();
        let orderUpdated = false;
        const updatedItems = [...(orderData.items || [])];

        for (let i = 0; i < updatedItems.length; i++) {
          if (updatedItems[i].productionTaskId === taskId) {
            const item = updatedItems[i];

            // Oblicz koszt jednostkowy dla tej pozycji
            const fullProductionUnitCost = totalCostWithFactory / quantity;

            updatedItems[i] = {
              ...item,
              productionCost: totalCostWithFactory,
              fullProductionCost: totalCostWithFactory,
              fullProductionUnitCost: Math.round(fullProductionUnitCost * 10000) / 10000,
              factoryCostIncluded: true,
            };
            orderUpdated = true;

            logger.info(`Updated order item in ${orderData.orderNumber}`, {
              taskId,
              totalCostWithFactory,
              fullProductionUnitCost,
            });
          }
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

          await orderDoc.ref.update({
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
    } catch (error) {
      logger.warn(`Failed to propagate to orders for task ${taskId}`, {
        error: error.message,
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

      const startDate = costData.startDate?.toDate ?
        costData.startDate.toDate() : new Date(costData.startDate);
      const endDate = costData.endDate?.toDate ?
        costData.endDate.toDate() : new Date(costData.endDate);

      logger.info(`Processing factory cost change for period`, {
        costId,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      try {
        // Znajdź wszystkie sesje produkcyjne w tym zakresie dat
        const historyRef = db.collection("productionHistory");
        const historySnapshot = await historyRef
            .where("startTime", ">=", admin.firestore.Timestamp.fromDate(startDate))
            .where("startTime", "<=", admin.firestore.Timestamp.fromDate(endDate))
            .get();

        if (historySnapshot.empty) {
          logger.info(`No production history in date range for cost ${costId}`);

          // Mimo braku historii, zaktualizuj sam koszt zakładu
          if (afterData) {
            await recalculateSingleFactoryCost(db, costId, afterData);
          }
          return null;
        }

        // Zbierz unikalne taskId z historii produkcji
        const taskIds = new Set();
        historySnapshot.docs.forEach((doc) => {
          const data = doc.data();
          if (data.taskId) {
            taskIds.add(data.taskId);
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
  const startDate = costData.startDate?.toDate ?
    costData.startDate.toDate() : new Date(costData.startDate);
  const endDate = costData.endDate?.toDate ?
    costData.endDate.toDate() : new Date(costData.endDate);
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

  // Pobierz historię produkcji w zakresie dat
  const historyRef = db.collection("productionHistory");
  const historySnapshot = await historyRef
      .where("startTime", ">=", admin.firestore.Timestamp.fromDate(startDate))
      .where("startTime", "<=", admin.firestore.Timestamp.fromDate(endDate))
      .get();

  if (historySnapshot.empty) {
    logger.info(`No production history for cost ${costId}`);
    return;
  }

  // Przetwórz sesje produkcji
  const sessions = historySnapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      taskId: data.taskId,
      startTime: data.startTime?.toDate ? data.startTime.toDate() : new Date(data.startTime),
      endTime: data.endTime?.toDate ? data.endTime.toDate() : new Date(data.endTime),
    };
  }).filter((s) => !excludedTaskIds.includes(s.taskId));

  // Oblicz proporcjonalny czas dla każdego zadania
  const taskTimeMap = calculateProportionalTime(sessions, startDate, endDate);

  // Zaktualizuj zadania produkcyjne
  const tasksRef = db.collection("productionTasks");
  let writeBatch = db.batch();
  let batchCount = 0;
  let tasksUpdated = 0;

  for (const [taskId, timeData] of taskTimeMap) {
    const taskDoc = await tasksRef.doc(taskId).get();
    if (!taskDoc.exists) continue;

    const taskData = taskDoc.data();
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
      existingTotalFullProductionCost,
      existingUnitFullProductionCost,
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
      writeBatch = db.batch(); // Utwórz nowy batch po commicie!
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await writeBatch.commit();
  }

  logger.info(`Updated ${tasksUpdated} tasks with factory costs`);

  // Propaguj do zamówień
  const taskIds = Array.from(taskTimeMap.keys());
  await propagateToOrders(db, taskIds, excludedTaskIds);

  logger.info(`✅ Propagated factory cost ${costId}`, {
    costPerMinute,
    tasksUpdated: taskTimeMap.size,
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
 * @param {Firestore} db - Instancja Firestore
 * @param {string} costId - ID usuniętego kosztu
 * @param {Set} taskIds - Zestaw ID zadań do aktualizacji
 */
const clearFactoryCostFromTasks = async (db, costId, taskIds) => {
  const tasksRef = db.collection("productionTasks");
  const writeBatch = db.batch();
  let batchCount = 0;

  for (const taskId of taskIds) {
    const taskDoc = await tasksRef.doc(taskId).get();
    if (!taskDoc.exists) continue;

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
    if (batchCount >= 400) {
      await writeBatch.commit();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await writeBatch.commit();
  }

  // Propaguj zerowe koszty do zamówień
  await propagateToOrders(db, Array.from(taskIds), []);

  logger.info(`✅ Cleared factory cost ${costId} from ${taskIds.size} tasks`);
};

module.exports = {
  onProductionHistoryChange,
  onFactoryCostChange,
  recalculateAllFactoryCosts,
};
