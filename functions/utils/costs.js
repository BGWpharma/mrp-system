/**
 * Cost calculation utilities for BGW-MRP Cloud Functions
 * Used by triggers to calculate task costs
 */

const logger = require("firebase-functions/logger");
const {
  preciseMultiply,
  preciseAdd,
  preciseSubtract,
  preciseDivide,
} = require("./math");

/**
 * Sprawdza czy koszty uległy znaczącej zmianie
 * @param {Object} oldCosts - Stare koszty
 * @param {Object} newCosts - Nowe koszty
 * @param {number} tolerance - Tolerancja w euro (domyślnie 0.005)
 * @return {boolean} - true jeśli zmiana przekroczyła tolerancję
 */
function hasCostChanged(oldCosts, newCosts, tolerance = 0.005) {
  const taskQuantity = newCosts.taskQuantity || 1;

  // Sprawdź 4 wartości (tak jak frontend): total i unit dla obu kosztów
  const changes = [
    Math.abs((oldCosts.totalMaterialCost || 0) - newCosts.totalMaterialCost),
    Math.abs((oldCosts.unitMaterialCost || 0) -
            (newCosts.totalMaterialCost / taskQuantity)),
    Math.abs((oldCosts.totalFullProductionCost || 0) -
            newCosts.totalFullProductionCost),
    Math.abs((oldCosts.unitFullProductionCost || 0) -
            (newCosts.totalFullProductionCost / taskQuantity)),
  ];

  const hasChanged = changes.some((change) => change > tolerance);
  const maxChange = Math.max(...changes);

  logger.info("Cost change check", {
    oldTotalMaterial: (oldCosts.totalMaterialCost || 0).toFixed(4),
    newTotalMaterial: newCosts.totalMaterialCost.toFixed(4),
    oldUnitMaterial: (oldCosts.unitMaterialCost || 0).toFixed(4),
    newUnitMaterial: (newCosts.totalMaterialCost / taskQuantity).toFixed(4),
    oldTotalFull: (oldCosts.totalFullProductionCost || 0).toFixed(4),
    newTotalFull: newCosts.totalFullProductionCost.toFixed(4),
    oldUnitFull: (oldCosts.unitFullProductionCost || 0).toFixed(4),
    newUnitFull: (newCosts.totalFullProductionCost / taskQuantity).toFixed(4),
    maxChange: maxChange.toFixed(4),
    tolerance,
    changed: hasChanged,
  });

  return hasChanged;
}

/**
 * Oblicza średnią ważoną cenę ze wszystkich partii dla danych materiałów
 * Używa initialQuantity jako wagi (reprezentuje pełną wartość zakupową)
 * Uwzględnia zarówno aktywne jak i wyczerpane partie
 *
 * @param {FirebaseFirestore.Firestore} db - Firestore instance
 * @param {Array<string>} materialIds - Lista ID materiałów
 * @return {Promise<Object>} - Mapa materialId -> {averagePrice, batchCount, priceSource}
 */
async function calculateEstimatedPricesFromBatches(db, materialIds) {
  const result = {};

  if (!materialIds || materialIds.length === 0) return result;

  // Firebase 'in' obsługuje maks 10 elementów na zapytanie
  const batchSize = 10;
  const batchesByMaterial = {};

  // Podziel materialIds na batche po 10
  for (let i = 0; i < materialIds.length; i += batchSize) {
    const batch = materialIds.slice(i, i + batchSize);

    try {
      const batchesSnapshot = await db.collection("inventoryBatches")
          .where("itemId", "in", batch)
          .get();

      batchesSnapshot.docs.forEach((doc) => {
        const batchData = doc.data();
        const materialId = batchData.itemId;
        if (!batchesByMaterial[materialId]) {
          batchesByMaterial[materialId] = [];
        }
        batchesByMaterial[materialId].push(batchData);
      });
    } catch (error) {
      logger.warn(`Error fetching batches for materials ${batch.join(", ")}`, {
        error: error.message,
      });
    }
  }

  // Oblicz średnią ważoną dla każdego materiału
  for (const materialId of materialIds) {
    const batches = batchesByMaterial[materialId] || [];

    let weightedPriceSum = 0;
    let totalQuantity = 0;
    let batchCount = 0;

    batches.forEach((batch) => {
      const unitPrice = parseFloat(batch.unitPrice) || 0;
      const weight = parseFloat(batch.initialQuantity) ||
        parseFloat(batch.quantity) || 0;

      if (unitPrice > 0 && weight > 0) {
        weightedPriceSum += unitPrice * weight;
        totalQuantity += weight;
        batchCount++;
      }
    });

    if (totalQuantity > 0) {
      result[materialId] = {
        averagePrice: weightedPriceSum / totalQuantity,
        totalQuantity,
        batchCount,
        priceSource: "batch-weighted-average",
      };
    } else {
      result[materialId] = {
        averagePrice: 0,
        totalQuantity: 0,
        batchCount: 0,
        priceSource: batches.length > 0 ? "no-priced-batches" : "no-batches",
      };
    }
  }

  const materialsWithPrices = Object.values(result)
      .filter((r) => r.averagePrice > 0).length;
  logger.info(`Calculated estimated prices for ${materialsWithPrices}/${materialIds.length} materials`);

  return result;
}

/**
 * Kompleksowa kalkulacja kosztów zadania produkcyjnego
 * Uwzględnia: consumed materials, reserved batches, PO reservations,
 * processing cost, oraz SZACUNKOWE KOSZTY dla materiałów bez rezerwacji
 * @param {FirebaseFirestore.Firestore} db - Firestore instance
 * @param {Object} taskData - Dane zadania
 * @return {Promise<Object>} - {totalMaterialCost, totalFullProductionCost, estimatedCostDetails}
 */
async function calculateTaskCosts(db, taskData) {
  const materials = taskData.materials || [];
  const materialBatches = taskData.materialBatches || {};
  const consumedMaterials = taskData.consumedMaterials || [];
  const poReservationIds = taskData.poReservationIds || [];

  let totalMaterialCost = 0;
  let totalFullProductionCost = 0;

  logger.info("Starting comprehensive task cost calculation", {
    taskId: taskData.id,
    moNumber: taskData.moNumber,
    materialsCount: materials.length,
    consumedCount: consumedMaterials.length,
    reservedBatchesCount: Object.keys(materialBatches).length,
    poReservationsCount: poReservationIds.length,
  });

  // ============================================================
  // KROK 1: KOSZTY SKONSUMOWANYCH MATERIAŁÓW
  // ============================================================
  if (consumedMaterials.length > 0) {
    logger.info(`Processing ${consumedMaterials.length} consumed materials`);

    // Pobierz aktualne ceny partii dla skonsumowanych materiałów
    const consumedBatchIds = [...new Set(
        consumedMaterials.map((c) => c.batchId).filter(Boolean),
    )];

    const consumedBatchPrices = {};
    if (consumedBatchIds.length > 0) {
      const batchPromises = consumedBatchIds.map(async (batchId) => {
        try {
          const batchDoc = await db.collection("inventoryBatches")
              .doc(batchId).get();
          if (batchDoc.exists) {
            consumedBatchPrices[batchId] =
              parseFloat(batchDoc.data().unitPrice) || 0;
          }
        } catch (error) {
          logger.warn(`Failed to fetch consumed batch ${batchId}`, {
            error: error.message,
          });
          consumedBatchPrices[batchId] = 0;
        }
      });
      await Promise.all(batchPromises);
    }

    // Oblicz koszty skonsumowanych materiałów
    for (const consumed of consumedMaterials) {
      const material = materials.find((m) =>
        (m.inventoryItemId || m.id) === consumed.materialId,
      );
      if (!material) continue;

      const quantity = parseFloat(consumed.quantity) || 0;

      // Hierarchia cen: aktualna z bazy → saved w konsumpcji → fallback
      // WAŻNE: Zawsze używaj aktualnej ceny z bazy jako priorytet!
      let unitPrice = 0;
      let priceSource = "fallback";

      if (consumed.batchId && consumedBatchPrices[consumed.batchId] > 0) {
        // PRIORYTET 1: Aktualna cena z bazy danych
        unitPrice = consumedBatchPrices[consumed.batchId];
        priceSource = "batch-current";
      } else if (consumed.unitPrice !== undefined && consumed.unitPrice > 0) {
        // PRIORYTET 2: Cena zapisana w momencie konsumpcji
        unitPrice = parseFloat(consumed.unitPrice);
        priceSource = "consumed-record";
      } else if (material.unitPrice > 0) {
        // PRIORYTET 3: Cena domyślna z materiału
        unitPrice = parseFloat(material.unitPrice);
        priceSource = "material-default";
      }

      const cost = preciseMultiply(quantity, unitPrice);

      // Sprawdź flagę includeInCosts
      const includeInCosts = consumed.includeInCosts !== undefined ?
        consumed.includeInCosts :
        (taskData.materialInCosts ?
          taskData.materialInCosts[material.id] !== false : true);

      if (includeInCosts) {
        totalMaterialCost = preciseAdd(totalMaterialCost, cost);
      }
      totalFullProductionCost = preciseAdd(totalFullProductionCost, cost);

      logger.info(`Consumed: ${material.name}`, {
        quantity,
        unitPrice: unitPrice.toFixed(4),
        priceSource,
        cost: cost.toFixed(4),
        includeInCosts,
      });
    }
  }

  // ============================================================
  // KROK 2: POBIERZ REZERWACJE PO
  // ============================================================
  const poReservationsByMaterial = {};
  if (poReservationIds.length > 0) {
    logger.info(`Fetching ${poReservationIds.length} PO reservations`);

    try {
      // Pobierz wszystkie rezerwacje PO dla tego zadania
      const taskIdForQuery = taskData.id || taskData.taskId;
      if (taskIdForQuery) {
        const poReservationsSnapshot = await db
            .collection("poReservations")
            .where("taskId", "==", taskIdForQuery)
            .get();

        // Filtruj tylko aktywne (pending, delivered - nie converted)
        poReservationsSnapshot.docs.forEach((doc) => {
          const poRes = doc.data();
          if (poRes.status === "pending" || poRes.status === "delivered") {
            const materialId = poRes.materialId;
            if (!poReservationsByMaterial[materialId]) {
              poReservationsByMaterial[materialId] = [];
            }
            poReservationsByMaterial[materialId].push({
              ...poRes,
              id: doc.id,
            });
          }
        });

        logger.info("PO reservations fetched", {
          activeCount: Object.values(poReservationsByMaterial)
              .flat().length,
          materialsCount: Object.keys(poReservationsByMaterial).length,
        });
      }
    } catch (error) {
      logger.error("Failed to fetch PO reservations", {
        error: error.message,
      });
    }
  }

  // ============================================================
  // KROK 3: POBIERZ CENY PARTII DLA REZERWACJI
  // ============================================================
  const allReservedBatchIds = [];
  Object.values(materialBatches).forEach((batches) => {
    if (Array.isArray(batches)) {
      batches.forEach((batch) => {
        if (batch.batchId) allReservedBatchIds.push(batch.batchId);
      });
    }
  });

  const uniqueReservedBatchIds = [...new Set(allReservedBatchIds)];
  const batchPricesMap = new Map();

  if (uniqueReservedBatchIds.length > 0) {
    logger.info(`Fetching prices for ${uniqueReservedBatchIds.length} batches`);

    const batchPromises = uniqueReservedBatchIds.map(async (batchId) => {
      try {
        const batchDoc = await db.collection("inventoryBatches")
            .doc(batchId).get();
        if (batchDoc.exists) {
          const batchData = batchDoc.data();
          // Przechowuj tylko unitPrice (nie baseUnitPrice - nie jest używane)
          batchPricesMap.set(batchId, parseFloat(batchData.unitPrice) || 0);
        }
      } catch (error) {
        logger.warn(`Failed to fetch batch ${batchId}`, {
          error: error.message,
        });
      }
    });

    await Promise.all(batchPromises);
  }

  // ============================================================
  // KROK 4: IDENTYFIKACJA MATERIAŁÓW BEZ REZERWACJI
  // ============================================================
  const materialIdsWithoutReservations = [];
  for (const material of materials) {
    const materialId = material.inventoryItemId || material.id;
    const reservedBatches = materialBatches[materialId] || [];
    const poReservationsForMaterial =
      poReservationsByMaterial[materialId] || [];
    const hasConsumption = consumedMaterials.some(
        (c) => c.materialId === materialId,
    );

    if (reservedBatches.length === 0 &&
        poReservationsForMaterial.length === 0 &&
        !hasConsumption &&
        materialId) {
      materialIdsWithoutReservations.push(materialId);
    }
  }

  // Pobierz szacunkowe ceny z partii dla materiałów bez rezerwacji
  let estimatedPricesMap = {};
  if (materialIdsWithoutReservations.length > 0) {
    try {
      estimatedPricesMap = await calculateEstimatedPricesFromBatches(
          db, materialIdsWithoutReservations,
      );
      logger.info(`Fetched estimated prices for ${Object.keys(estimatedPricesMap).length} materials without reservations`);
    } catch (error) {
      logger.warn("Error fetching estimated prices", {error: error.message});
    }
  }

  // Obiekt do przechowywania szczegółów szacunkowych kosztów
  const estimatedCostDetails = {};

  // ============================================================
  // KROK 5: KOSZTY ZAREZERWOWANYCH I SZACUNKOWYCH MATERIAŁÓW
  // ============================================================
  for (const material of materials) {
    const materialId = material.inventoryItemId || material.id;
    const reservedBatches = materialBatches[materialId] || [];
    const poReservationsForMaterial =
      poReservationsByMaterial[materialId] || [];

    const hasStandardReservations = reservedBatches.length > 0;
    const hasPOReservations = poReservationsForMaterial.length > 0;

    // Oblicz ile już skonsumowano
    const consumedQuantity = consumedMaterials
        .filter((c) => c.materialId === materialId)
        .reduce((sum, c) => preciseAdd(sum, parseFloat(c.quantity) || 0), 0);

    // Wymagana ilość (użyj actualMaterialUsage jeśli dostępna)
    const actualUsage = taskData.actualMaterialUsage || {};
    const requiredQuantity = actualUsage[materialId] !== undefined ?
      parseFloat(actualUsage[materialId]) || 0 :
      parseFloat(material.quantity) || 0;

    // Pozostała ilość do skonsumowania
    const remainingQuantity = Math.max(0, preciseSubtract(requiredQuantity, consumedQuantity));

    // ZMIANA: Dla materiałów bez rezerwacji oblicz szacunkowy koszt
    if (!hasStandardReservations && !hasPOReservations) {
      if (remainingQuantity > 0) {
        const estimatedData = estimatedPricesMap[materialId];
        let unitPrice = 0;
        let priceSource = "fallback";

        if (estimatedData && estimatedData.averagePrice > 0) {
          unitPrice = estimatedData.averagePrice;
          priceSource = "batch-weighted-average";
          logger.info(`Material ${material.name} (ESTIMATED): price ${unitPrice.toFixed(4)}€ from ${estimatedData.batchCount} batches`);
        } else {
          // Brak partii = cena 0 (nie używamy fallbacku na material.unitPrice)
          unitPrice = 0;
          priceSource = "no-batches";
          logger.info(`Material ${material.name}: no batches, price=0€`);
        }

        const materialCost = preciseMultiply(remainingQuantity, unitPrice);

        // Zapisz szczegóły szacunkowego kosztu
        estimatedCostDetails[materialId] = {
          materialName: material.name,
          quantity: remainingQuantity,
          unitPrice,
          cost: materialCost,
          priceSource,
          isEstimated: true,
          batchCount: estimatedData?.batchCount || 0,
        };

        const includeInCosts = taskData.materialInCosts ?
          taskData.materialInCosts[material.id] !== false : true;

        if (includeInCosts) {
          totalMaterialCost = preciseAdd(totalMaterialCost, materialCost);
        }
        totalFullProductionCost = preciseAdd(totalFullProductionCost, materialCost);

        logger.info(`  ESTIMATED cost: ${materialCost.toFixed(4)}€ (${priceSource})`);
      }
      continue; // Przejdź do następnego materiału
    }

    if (remainingQuantity <= 0) {
      logger.info(`Material ${material.name}: fully consumed, skipping`);
      continue;
    }

    logger.info(`Material ${material.name}`, {
      required: requiredQuantity,
      consumed: consumedQuantity,
      remaining: remainingQuantity,
    });

    // ===== ŚREDNIA WAŻONA Z REZERWACJI =====
    let weightedPriceSum = 0;
    let totalReservedQuantity = 0;

    // A. Standardowe rezerwacje magazynowe
    if (reservedBatches.length > 0) {
      for (const batch of reservedBatches) {
        const batchQuantity = parseFloat(batch.quantity) || 0;
        let batchPrice = 0;

        // Hierarchia: current from DB → saved in batch → material default
        const currentBatchPrice = batchPricesMap.get(batch.batchId);
        if (currentBatchPrice && currentBatchPrice > 0) {
          batchPrice = currentBatchPrice;
        } else if (batch.unitPrice > 0) {
          batchPrice = parseFloat(batch.unitPrice);
        } else if (material.unitPrice > 0) {
          batchPrice = parseFloat(material.unitPrice);
        }

        if (batchQuantity > 0 && batchPrice > 0) {
          const weightedPrice = preciseMultiply(batchPrice, batchQuantity);
          weightedPriceSum = preciseAdd(weightedPriceSum, weightedPrice);
          totalReservedQuantity = preciseAdd(totalReservedQuantity, batchQuantity);
          logger.info(`  Batch ${batch.batchId}: ${batchQuantity} × ${batchPrice.toFixed(4)}€`);
        }
      }
    }

    // B. Rezerwacje PO
    if (poReservationsForMaterial.length > 0) {
      for (const poRes of poReservationsForMaterial) {
        const reservedQty = parseFloat(poRes.reservedQuantity) || 0;
        const convertedQty = parseFloat(poRes.convertedQuantity) || 0;
        const availableQty = Math.max(0, preciseSubtract(reservedQty, convertedQty));
        const unitPrice = parseFloat(poRes.unitPrice) || 0;

        if (availableQty > 0 && unitPrice > 0) {
          const weightedPrice = preciseMultiply(unitPrice, availableQty);
          weightedPriceSum = preciseAdd(weightedPriceSum, weightedPrice);
          totalReservedQuantity = preciseAdd(totalReservedQuantity, availableQty);
          logger.info(`  PO Reservation ${poRes.poNumber}: ${availableQty} × ${unitPrice.toFixed(4)}€`);
        }
      }
    }

    // Oblicz koszt materiału
    let materialCost = 0;
    if (totalReservedQuantity > 0) {
      const averagePrice = preciseDivide(weightedPriceSum, totalReservedQuantity);
      materialCost = preciseMultiply(remainingQuantity, averagePrice);
      logger.info(`  Average price: ${averagePrice.toFixed(4)}€, cost: ${materialCost.toFixed(4)}€`);
    } else {
      // Fallback na cenę z materiału
      const unitPrice = parseFloat(material.unitPrice) || 0;
      materialCost = preciseMultiply(remainingQuantity, unitPrice);
      logger.info(`  Fallback price: ${unitPrice.toFixed(4)}€, cost: ${materialCost.toFixed(4)}€`);
    }

    // Sprawdź czy uwzględniać w kosztach
    const includeInCosts = taskData.materialInCosts ?
      taskData.materialInCosts[material.id] !== false : true;

    if (includeInCosts) {
      totalMaterialCost = preciseAdd(totalMaterialCost, materialCost);
    }
    totalFullProductionCost = preciseAdd(totalFullProductionCost, materialCost);
  }

  // ============================================================
  // KROK 6: KOSZT PROCESOWY
  // ============================================================
  const processingCostPerUnit =
    parseFloat(taskData.processingCostPerUnit) || 0;
  const completedQuantity =
    parseFloat(taskData.totalCompletedQuantity) || 0;
  const taskQuantity = parseFloat(taskData.quantity) || 1;

  let totalProcessingCost = 0;
  if (processingCostPerUnit > 0 && completedQuantity > 0) {
    totalProcessingCost = preciseMultiply(processingCostPerUnit, completedQuantity);
    totalMaterialCost = preciseAdd(totalMaterialCost, totalProcessingCost);
    totalFullProductionCost = preciseAdd(totalFullProductionCost, totalProcessingCost);

    logger.info("Processing cost", {
      perUnit: processingCostPerUnit.toFixed(4),
      completed: completedQuantity,
      planned: taskQuantity,
      total: totalProcessingCost.toFixed(4),
    });
  }

  // ============================================================
  // FINALIZACJA Z PRECYZJĄ
  // ============================================================
  const finalTotalMaterialCost = parseFloat(totalMaterialCost.toFixed(4));
  const finalTotalFullProductionCost =
    parseFloat(totalFullProductionCost.toFixed(4));

  const hasEstimatedCosts = Object.keys(estimatedCostDetails).length > 0;

  logger.info("Task costs calculated", {
    totalMaterialCost: finalTotalMaterialCost,
    totalFullProductionCost: finalTotalFullProductionCost,
    unitMaterialCost: (finalTotalMaterialCost / taskQuantity).toFixed(4),
    unitFullProductionCost:
      (finalTotalFullProductionCost / taskQuantity).toFixed(4),
    estimatedMaterialsCount: Object.keys(estimatedCostDetails).length,
  });

  return {
    totalMaterialCost: finalTotalMaterialCost,
    totalFullProductionCost: finalTotalFullProductionCost,
    taskQuantity: taskQuantity,
    // Szczegóły szacunkowych kosztów dla materiałów bez rezerwacji
    estimatedCostDetails: hasEstimatedCosts ? estimatedCostDetails : null,
  };
}

module.exports = {
  hasCostChanged,
  calculateEstimatedPricesFromBatches,
  calculateTaskCosts,
};

