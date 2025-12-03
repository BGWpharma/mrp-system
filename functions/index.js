/**
 * Cloud Functions for BGW-MRP System
 * Region: europe-central2
 * Node.js: 22
 * Firebase Functions: v2 (2nd Gen)
 *
 * DEPLOYMENT:
 * Always deploy individual functions:
 * firebase deploy --only functions:functionName
 *
 * NEVER use: firebase deploy --only functions (without specific name)
 */

const {setGlobalOptions} = require("firebase-functions/v2");
const {onCall} = require("firebase-functions/v2/https");
const {
  onDocumentWritten,
  onDocumentUpdated,
} = require("firebase-functions/v2/firestore");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp();
}

// Set global options for all functions
setGlobalOptions({
  maxInstances: 10,
  region: "europe-central2",
  memory: "256MiB",
});

// ============================================================================
// CALLABLE FUNCTIONS - Funkcje wywoływane z aplikacji
// ============================================================================

/**
 * refreshExpiryStats - Ręczne odświeżenie agregatów wygasających partii
 * Przydatne do pierwszego uruchomienia lub testów
 *
 * DEPLOYMENT:
 * firebase deploy --only functions:bgw-mrp:refreshExpiryStats
 *
 * @param {Object} request - Request object z Firebase Functions
 * @return {Object} Zaktualizowane statystyki
 */
exports.refreshExpiryStats = onCall(
    {
      region: "europe-central2",
      memory: "256MiB",
    },
    async (request) => {
      try {
        logger.info("refreshExpiryStats called", {auth: request.auth});

        // Verify authentication
        if (!request.auth) {
          throw new Error("Unauthorized - authentication required");
        }

        const db = admin.firestore();
        const now = new Date();
        const thresholdDate = new Date();
        thresholdDate.setDate(now.getDate() + 365);

        // Minimalna data (filtruj domyślne daty 1970)
        const minValidDate = new Date("1971-01-01");

        // Pobierz wygasające partie
        const expiringSnapshot = await db
            .collection("inventoryBatches")
            .where("expiryDate", ">=", admin.firestore.Timestamp.fromDate(now))
            .where("expiryDate", "<=",
                admin.firestore.Timestamp.fromDate(thresholdDate))
            .where("quantity", ">", 0)
            .get();

        // Pobierz przeterminowane partie
        const expiredSnapshot = await db
            .collection("inventoryBatches")
            .where("expiryDate", "<", admin.firestore.Timestamp.fromDate(now))
            .where("quantity", ">", 0)
            .get();

        // Filtruj domyślne daty
        const expiringCount = expiringSnapshot.docs.filter((doc) => {
          const expiryDate = doc.data().expiryDate?.toDate();
          return expiryDate && expiryDate >= minValidDate;
        }).length;

        const expiredCount = expiredSnapshot.docs.filter((doc) => {
          const expiryDate = doc.data().expiryDate?.toDate();
          return expiryDate && expiryDate >= minValidDate;
        }).length;

        // Zapisz agregaty
        await db.doc("aggregates/expiryStats").set({
          expiringCount,
          expiredCount,
          totalCount: expiringCount + expiredCount,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          calculatedAt: now.toISOString(),
          manualRefresh: true,
          refreshedBy: request.auth.uid,
        });

        logger.info("refreshExpiryStats - zakończono", {
          expiringCount,
          expiredCount,
          totalCount: expiringCount + expiredCount,
        });

        return {
          success: true,
          expiringCount,
          expiredCount,
          totalCount: expiringCount + expiredCount,
        };
      } catch (error) {
        logger.error("refreshExpiryStats - błąd", {error: error.message});
        throw new Error(`Błąd podczas odświeżania statystyk: ${error.message}`);
      }
    },
);

/**
 * getRandomBatch - Zwraca losową partię z magazynu
 * Funkcja testowa dla narzędzi systemowych
 *
 * @param {Object} request - Request object z Firebase Functions
 * @return {Object} Losowa partia z magazynu lub błąd
 */
exports.getRandomBatch = onCall(async (request) => {
  try {
    logger.info("getRandomBatch called", {auth: request.auth});

    // Verify authentication
    if (!request.auth) {
      throw new Error("Unauthorized - authentication required");
    }

    // Get all inventory batches
    const batchesSnapshot = await admin.firestore()
        .collection("inventoryBatches")
        .limit(100) // Limit to reasonable number for random selection
        .get();

    if (batchesSnapshot.empty) {
      return {
        success: false,
        message: "Brak partii w magazynie",
        batch: null,
      };
    }

    // Get random batch
    const batches = batchesSnapshot.docs;
    const randomIndex = Math.floor(Math.random() * batches.length);
    const randomBatch = batches[randomIndex];
    const batchData = randomBatch.data();

    // Get material name if materialId exists
    let materialName = "Nieznany";
    if (batchData.materialId) {
      try {
        const materialDoc = await admin.firestore()
            .collection("materials")
            .doc(batchData.materialId)
            .get();

        if (materialDoc.exists) {
          materialName = materialDoc.data().name || "Nieznany";
        }
      } catch (materialError) {
        logger.warn("Could not fetch material name", {
          materialId: batchData.materialId,
          error: materialError.message,
        });
      }
    }

    logger.info("Random batch selected", {
      batchId: randomBatch.id,
      materialName: materialName,
    });

    return {
      success: true,
      message: "Losowa partia została pobrana",
      batch: {
        id: randomBatch.id,
        ...batchData,
        materialName: materialName,
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error("Error in getRandomBatch:", error);
    throw new Error(`Nie udało się pobrać losowej partii: ${error.message}`);
  }
});

// ============================================================================
// FIRESTORE TRIGGERS - Automatyczne aktualizacje danych
// ============================================================================

/**
 * onPurchaseOrderUpdate
 * Trigger 1: PO → Inventory Batches
 * Automatycznie aktualizuje ceny w partiach magazynowych gdy zmienia się PO
 */
exports.onPurchaseOrderUpdate = onDocumentUpdated(
    {
      document: "purchaseOrders/{orderId}",
      region: "europe-central2",
      memory: "512MiB",
    },
    async (event) => {
      const orderId = event.params.orderId;
      const beforeData = event.data.before.data();
      const afterData = event.data.after.data();

      logger.info("PO Update detected", {
        orderId,
        status: afterData.status,
      });

      try {
        const db = admin.firestore();

        // Sprawdź czy są zmiany w pozycjach lub dodatkowych kosztach
        const itemsChanged = JSON.stringify(beforeData.items) !==
                            JSON.stringify(afterData.items);
        const additionalCostsChanged =
          JSON.stringify(beforeData.additionalCostsItems) !==
            JSON.stringify(afterData.additionalCostsItems) ||
          beforeData.additionalCosts !== afterData.additionalCosts;

        if (!itemsChanged && !additionalCostsChanged) {
          logger.info("No price changes detected, skipping batch update");
          return null;
        }

        logger.info("Price changes detected", {
          itemsChanged,
          additionalCostsChanged,
        });

        // Znajdź wszystkie partie powiązane z tym PO
        const batchesQuery1 = db.collection("inventoryBatches")
            .where("purchaseOrderDetails.id", "==", orderId);
        const batchesQuery2 = db.collection("inventoryBatches")
            .where("sourceDetails.orderId", "==", orderId);

        const [snapshot1, snapshot2] = await Promise.all([
          batchesQuery1.get(),
          batchesQuery2.get(),
        ]);

        // Deduplikacja partii
        const batchesMap = new Map();
        [...snapshot1.docs, ...snapshot2.docs].forEach((doc) => {
          if (!batchesMap.has(doc.id)) {
            batchesMap.set(doc.id, {id: doc.id, ...doc.data()});
          }
        });

        const batches = Array.from(batchesMap.values());
        logger.info(`Found ${batches.length} batches to update`);

        if (batches.length === 0) {
          logger.info("No batches found for this PO");
          return null;
        }

        // Oblicz łączne dodatkowe koszty BRUTTO
        let additionalCostsGrossTotal = 0;
        if (afterData.additionalCostsItems?.length) {
          additionalCostsGrossTotal = afterData.additionalCostsItems.reduce(
              (sum, cost) => {
                const net = parseFloat(cost.value) || 0;
                const vatRate = typeof cost.vatRate === "number" ?
                  cost.vatRate : 0;
                const vat = (net * vatRate) / 100;
                return sum + net + vat;
              }, 0);
        } else if (afterData.additionalCosts) {
          additionalCostsGrossTotal =
            parseFloat(afterData.additionalCosts) || 0;
        }

        // Oblicz łączną ilość początkową partii
        const totalInitialQuantity = batches.reduce((sum, batch) => {
          return sum + (parseFloat(batch.initialQuantity) ||
                       parseFloat(batch.quantity) || 0);
        }, 0);

        logger.info("Costs calculated", {
          additionalCostsGrossTotal,
          totalInitialQuantity,
        });

        // Aktualizuj każdą partię
        const updatePromises = [];
        const updatedBatchIds = [];

        // Śledź które pozycje PO zostały już wykorzystane (do lepszego dopasowania)
        const usedItemIds = new Set();

        for (const batch of batches) {
          // Znajdź odpowiadającą pozycję w PO
          const itemPoId = batch.purchaseOrderDetails?.itemPoId ||
                          batch.sourceDetails?.itemPoId;
          let matchingItem = null;

          if (itemPoId) {
            // Priorytet 1: Dopasuj po itemPoId (najbardziej precyzyjne)
            matchingItem = afterData.items?.find(
                (item) => item.id === itemPoId);

            if (matchingItem) {
              logger.info(`Batch ${batch.id} matched by itemPoId: ${itemPoId}`);
            }
          }

          if (!matchingItem) {
            // Priorytet 2: Dopasuj po materialId, ale unikaj już wykorzystanych
            const batchNumber = batch.batchNumber || batch.lotNumber || "";

            // Spróbuj znaleźć pozycję która ma ten sam materialId
            const candidateItems = afterData.items?.filter(
                (item) => item.id === batch.materialId ||
                         item.materialId === batch.materialId,
            ) || [];

            if (candidateItems.length > 0) {
              // Preferuj niewykorzystane pozycje
              matchingItem = candidateItems.find(
                  (item) => !usedItemIds.has(item.id)) ||
                     candidateItems[0]; // Fallback do pierwszej

              if (matchingItem) {
                logger.info(`Batch ${batch.id} matched by materialId`, {
                  materialId: batch.materialId,
                  itemId: matchingItem.id,
                  batchNumber: batchNumber,
                  previouslyUsed: usedItemIds.has(matchingItem.id),
                });
              }
            }
          }

          if (!matchingItem) {
            logger.warn(`No matching item found for batch ${batch.id}`, {
              batchNumber: batch.batchNumber,
              materialId: batch.materialId,
              itemPoId: itemPoId,
            });
            continue;
          }

          // Oznacz tę pozycję jako wykorzystaną (dla kolejnych partii)
          usedItemIds.add(matchingItem.id);

          const batchInitialQuantity = parseFloat(batch.initialQuantity) ||
                                      parseFloat(batch.quantity) || 0;

          // Oblicz cenę bazową z rabatem
          const originalUnitPrice = parseFloat(matchingItem.unitPrice) || 0;
          const discount = parseFloat(matchingItem.discount) || 0;
          const discountMultiplier = (100 - discount) / 100;
          const newBaseUnitPrice = originalUnitPrice * discountMultiplier;

          // Oblicz dodatkowy koszt na jednostkę
          let additionalCostPerUnit = 0;
          if (additionalCostsGrossTotal > 0 &&
              totalInitialQuantity > 0 &&
              batchInitialQuantity > 0) {
            const batchProportion = batchInitialQuantity / totalInitialQuantity;
            const batchAdditionalCostTotal =
              additionalCostsGrossTotal * batchProportion;
            additionalCostPerUnit =
              batchAdditionalCostTotal / batchInitialQuantity;
          }

          // Cena końcowa
          const newFinalUnitPrice = newBaseUnitPrice + additionalCostPerUnit;

          // Aktualizuj partię
          const batchRef = db.collection("inventoryBatches").doc(batch.id);
          updatePromises.push(
              batchRef.update({
                unitPrice: newFinalUnitPrice,
                baseUnitPrice: newBaseUnitPrice,
                additionalCostPerUnit: additionalCostPerUnit,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedBy: "system",
                lastPriceUpdateReason: "PO update via Cloud Function",
                lastPriceUpdateFrom: orderId,
              }),
          );
          updatedBatchIds.push(batch.id);

          logger.info(`Batch ${batch.id} price updated`, {
            itemId: matchingItem.id,
            basePrice: newBaseUnitPrice.toFixed(4),
            additionalCost: additionalCostPerUnit.toFixed(4),
            finalPrice: newFinalUnitPrice.toFixed(4),
          });
        }

        await Promise.all(updatePromises);

        logger.info(`✅ Updated ${updatedBatchIds.length} batches`, {
          batchIds: updatedBatchIds,
        });

        // Zapisz event dla kolejnego triggera
        if (updatedBatchIds.length > 0) {
          await db.collection("_systemEvents").add({
            type: "batchPriceUpdate",
            batchIds: updatedBatchIds,
            sourceType: "purchaseOrder",
            sourceId: orderId,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            processed: false,
          });
          logger.info("System event created for batch price update");
        }

        return {success: true, updatedBatches: updatedBatchIds.length};
      } catch (error) {
        logger.error("❌ Error updating batches from PO", {
          orderId,
          error: error.message,
          stack: error.stack,
        });
        throw error;
      }
    },
);

/**
 * onBatchPriceUpdate
 * Trigger 2: Inventory Batch → Manufacturing Orders (Tasks)
 * Automatycznie aktualizuje koszty w zadaniach produkcyjnych
 * gdy zmienia się cena partii
 */
exports.onBatchPriceUpdate = onDocumentWritten(
    {
      document: "_systemEvents/{eventId}",
      region: "europe-central2",
      memory: "512MiB",
    },
    async (event) => {
      // Sprawdź czy to nowy dokument
      if (!event.data.after.exists) {
        return null;
      }

      const eventData = event.data.after.data();

      // Tylko dla eventów typu batchPriceUpdate
      if (!eventData || eventData.type !== "batchPriceUpdate") {
        return null;
      }

      // Sprawdź czy już przetworzony
      if (eventData.processed === true) {
        return null;
      }

      const batchIds = eventData.batchIds || [];
      logger.info("🔄 Batch price update event detected", {
        eventId: event.params.eventId,
        batchCount: batchIds.length,
      });

      if (batchIds.length === 0) return null;

      try {
        const db = admin.firestore();
        const tasksToUpdate = new Set();

        // Znajdź wszystkie zadania używające tych partii
        logger.info(`Searching for tasks using batches`, {
          batchIds: batchIds,
        });

        // Pobierz wszystkie zadania - UWAGA: To może być wolne dla dużej liczby
        const tasksSnapshot = await db.collection("productionTasks").get();
        logger.info(`Total tasks in database: ${tasksSnapshot.size}`);

        for (const batchId of batchIds) {
          logger.info(`Checking batch ${batchId} in ${tasksSnapshot.size} tasks`);

          tasksSnapshot.docs.forEach((doc) => {
            const taskData = doc.data();
            const materialBatches = taskData.materialBatches || {};

            // Sprawdź czy zadanie używa tej partii
            const materialIds = Object.keys(materialBatches);
            if (materialIds.length > 0) {
              logger.info(`Task ${doc.id} has materialBatches`, {
                materialCount: materialIds.length,
                moNumber: taskData.moNumber,
              });
            }

            for (const materialId of materialIds) {
              const batches = materialBatches[materialId] || [];
              if (batches.some((batch) => batch.batchId === batchId)) {
                tasksToUpdate.add(doc.id);
                logger.info(`✅ Found task using batch ${batchId}`, {
                  taskId: doc.id,
                  moNumber: taskData.moNumber,
                  materialId: materialId,
                });
              }
            }
          });

          // Szukaj w consumedMaterials
          tasksSnapshot.docs.forEach((doc) => {
            const taskData = doc.data();
            const consumedMaterials = taskData.consumedMaterials || [];

            if (consumedMaterials.length > 0) {
              logger.info(`Task ${doc.id} has consumedMaterials`, {
                consumedCount: consumedMaterials.length,
                moNumber: taskData.moNumber,
              });
            }

            if (consumedMaterials.some((cm) => cm.batchId === batchId)) {
              tasksToUpdate.add(doc.id);
              logger.info(`✅ Found task with consumed batch ${batchId}`, {
                taskId: doc.id,
                moNumber: taskData.moNumber,
              });
            }
          });
        }

        logger.info(`📊 Found ${tasksToUpdate.size} tasks to update`);

        if (tasksToUpdate.size === 0) {
          // Oznacz event jako przetworzony
          await event.data.after.ref.update({processed: true});
          return null;
        }

        // Aktualizuj koszty w każdym zadaniu
        const updatePromises = [];
        const updatedTaskIds = [];

        for (const taskId of tasksToUpdate) {
          const taskRef = db.collection("productionTasks").doc(taskId);
          const taskDoc = await taskRef.get();

          if (!taskDoc.exists) {
            logger.warn(`Task ${taskId} not found`);
            continue;
          }

          const taskData = {id: taskId, ...taskDoc.data()};

          // Sprawdź czy automatyczne aktualizacje są włączone
          if (taskData.disableAutomaticCostUpdates === true) {
            logger.info(`Task ${taskId} has automatic updates disabled`);
            continue;
          }

          // Przelicz koszty materiałów
          const newCosts = await calculateTaskCosts(db, taskData);

          const quantity = parseFloat(taskData.quantity) || 1;
          const unitMaterialCost = newCosts.totalMaterialCost / quantity;
          const unitFullProductionCost = newCosts.totalFullProductionCost / quantity;

          // Sprawdź czy koszty się zmieniły (tolerancja 0.005€)
          const oldCosts = {
            totalMaterialCost: taskData.totalMaterialCost,
            totalFullProductionCost: taskData.totalFullProductionCost,
          };

          if (!hasCostChanged(oldCosts, newCosts, 0.005)) {
            logger.info(`Task ${taskData.moNumber || taskId}: costs unchanged, skipping`);
            continue;
          }

          // Aktualizuj zadanie
          const updateData = {
            totalMaterialCost: newCosts.totalMaterialCost,
            totalFullProductionCost: newCosts.totalFullProductionCost,
            unitMaterialCost,
            unitFullProductionCost,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: "system",
            lastCostUpdateReason: "Batch price update via Cloud Function",
            costLastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
            costLastUpdatedBy: "system",
          };

          // NOWE: Dodaj szczegóły szacunkowych kosztów jeśli są
          if (newCosts.estimatedCostDetails) {
            updateData.estimatedMaterialCosts = newCosts.estimatedCostDetails;
            logger.info(`Task ${taskData.moNumber || taskId}: saving estimated costs for ${Object.keys(newCosts.estimatedCostDetails).length} materials`);
          } else {
            // Usuń stare szacunkowe koszty
            updateData.estimatedMaterialCosts = admin.firestore.FieldValue.delete();
          }

          updatePromises.push(taskRef.update(updateData));

          updatedTaskIds.push({
            taskId,
            moNumber: taskData.moNumber,
            totalMaterialCost: newCosts.totalMaterialCost,
            totalFullProductionCost: newCosts.totalFullProductionCost,
          });

          logger.info(`Task ${taskData.moNumber || taskId} costs updated`, {
            totalMaterialCost: newCosts.totalMaterialCost.toFixed(4),
            totalFullProductionCost: newCosts.totalFullProductionCost.toFixed(4),
          });
        }

        await Promise.all(updatePromises);

        logger.info(`✅ Updated ${updatedTaskIds.length} tasks`);

        // Oznacz event jako przetworzony
        await event.data.after.ref.update({processed: true});

        // Zapisz event dla kolejnego triggera
        if (updatedTaskIds.length > 0) {
          await db.collection("_systemEvents").add({
            type: "taskCostUpdate",
            tasks: updatedTaskIds,
            sourceType: "batchPriceUpdate",
            sourceBatchIds: batchIds,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            processed: false,
          });
          logger.info("System event created for task cost update");
        }

        return {success: true, updatedTasks: updatedTaskIds.length};
      } catch (error) {
        logger.error("❌ Error updating tasks from batch price update", {
          error: error.message,
          stack: error.stack,
        });
        throw error;
      }
    },
);

/**
 * onProductionTaskCostUpdate
 * Trigger 3: Manufacturing Orders (Tasks) → Customer Orders
 * Automatycznie aktualizuje wartości w zamówieniach klientów
 * gdy zmienia się koszt zadania produkcyjnego
 *
 * ZSYNCHRONIZOWANE Z LOGIKĄ FRONTENDU (productionService.js updateTaskCostsAutomatically)
 */
exports.onProductionTaskCostUpdate = onDocumentWritten(
    {
      document: "_systemEvents/{eventId}",
      region: "europe-central2",
      memory: "512MiB",
    },
    async (event) => {
      // Sprawdź czy to nowy dokument
      if (!event.data.after.exists) {
        return null;
      }

      const eventData = event.data.after.data();

      // Tylko dla eventów typu taskCostUpdate
      if (!eventData || eventData.type !== "taskCostUpdate") {
        return null;
      }

      // Sprawdź czy już przetworzony
      if (eventData.processed === true) {
        return null;
      }

      const tasks = eventData.tasks || [];
      logger.info("🔄 Task cost update event detected", {
        eventId: event.params.eventId,
        taskCount: tasks.length,
      });

      if (tasks.length === 0) return null;

      try {
        const db = admin.firestore();
        const updatedOrderIds = [];

        for (const task of tasks) {
          const {taskId, moNumber, totalMaterialCost, totalFullProductionCost} =
            task;

          logger.info(`Processing task ${moNumber || taskId}`);

          // Znajdź zamówienia - pobierz wszystkie i filtruj w pamięci
          const ordersSnapshot = await db.collection("orders").get();

          for (const orderDoc of ordersSnapshot.docs) {
            const orderData = orderDoc.data();
            let orderUpdated = false;
            const updatedItems = [...(orderData.items || [])];

            for (let i = 0; i < updatedItems.length; i++) {
              const item = updatedItems[i];

              if (item.productionTaskId === taskId) {
                // Oblicz koszty jednostkowe - ZGODNIE Z LOGIKĄ FRONTENDU
                // (costCalculator.js: calculateFullProductionUnitCost,
                // calculateProductionUnitCost)
                const quantity = parseFloat(item.quantity) || 1;
                const price = parseFloat(item.price) || 0;

                // calculateFullProductionUnitCost logic:
                // - Jeśli z listy cenowej I ma cenę > 0: nie dodawaj ceny
                // - W przeciwnym razie: dodaj cenę jednostkową
                let fullProductionUnitCost;
                if (item.fromPriceList && price > 0) {
                  fullProductionUnitCost = totalFullProductionCost / quantity;
                } else {
                  fullProductionUnitCost =
                    (totalFullProductionCost / quantity) + price;
                }

                // calculateProductionUnitCost logic: zawsze dziel przez ilość
                const productionUnitCost = totalMaterialCost / quantity;

                updatedItems[i] = {
                  ...item,
                  productionCost: totalMaterialCost,
                  fullProductionCost: totalFullProductionCost,
                  productionUnitCost,
                  fullProductionUnitCost,
                };
                orderUpdated = true;

                logger.info(`Order item updated`, {
                  orderId: orderDoc.id,
                  orderNumber: orderData.orderNumber,
                  itemName: item.name,
                  productionCost: totalMaterialCost.toFixed(4),
                  fullProductionCost: totalFullProductionCost.toFixed(4),
                  productionUnitCost: productionUnitCost.toFixed(4),
                  fullProductionUnitCost: fullProductionUnitCost.toFixed(4),
                });
              }
            }

            if (orderUpdated) {
              // ============================================================
              // OBLICZ WARTOŚĆ ZAMÓWIENIA - ZGODNIE Z LOGIKĄ FRONTENDU
              // (productionService.js calculateItemTotalValue)
              // ============================================================

              // Funkcja calculateItemTotalValue z frontendu
              const calculateItemTotalValue = (item) => {
                const itemValue = (parseFloat(item.quantity) || 0) *
                                  (parseFloat(item.price) || 0);

                // Jeśli z listy cenowej I ma cenę > 0, zwróć tylko wartość
                if (item.fromPriceList && parseFloat(item.price || 0) > 0) {
                  return itemValue;
                }

                // Jeśli ma zadanie produkcyjne i koszt produkcji,
                // dodaj koszt produkcji
                if (item.productionTaskId &&
                    item.productionCost !== undefined) {
                  return itemValue + parseFloat(item.productionCost || 0);
                }

                return itemValue;
              };

              // Oblicz subtotal (productsValue) zgodnie z logiką frontendu
              const subtotal = (updatedItems || []).reduce((sum, item) => {
                return sum + calculateItemTotalValue(item);
              }, 0);

              // Pobierz shipping cost
              const shippingCost = parseFloat(orderData.shippingCost) || 0;

              // Oblicz dodatkowe koszty i rabaty z additionalCostsItems
              // ZGODNIE Z LOGIKĄ FRONTENDU - używamy additionalCostsItems
              let additionalCostsTotal = 0;
              let discountsTotal = 0;

              if (orderData.additionalCostsItems &&
                  Array.isArray(orderData.additionalCostsItems)) {
                // Dodatnie wartości = dodatkowe koszty
                additionalCostsTotal = orderData.additionalCostsItems
                    .filter((cost) => parseFloat(cost.value) > 0)
                    .reduce((sum, cost) =>
                      sum + (parseFloat(cost.value) || 0), 0);

                // Ujemne wartości = rabaty (bierzemy wartość bezwzględną)
                discountsTotal = Math.abs(
                    orderData.additionalCostsItems
                        .filter((cost) => parseFloat(cost.value) < 0)
                        .reduce((sum, cost) =>
                          sum + (parseFloat(cost.value) || 0), 0),
                );
              }

              // Oblicz całkowitą wartość zamówienia zgodnie z formułą frontendu
              const totalValue = subtotal + shippingCost +
                               additionalCostsTotal - discountsTotal;

              logger.info(`Order ${orderData.orderNumber} totalValue ` +
                          `calculation (FRONTEND LOGIC)`, {
                subtotal: subtotal.toFixed(4),
                shippingCost: shippingCost.toFixed(4),
                additionalCostsTotal: additionalCostsTotal.toFixed(4),
                discountsTotal: discountsTotal.toFixed(4),
                totalValue: totalValue.toFixed(4),
                oldTotalValue: (orderData.totalValue || 0).toFixed(4),
              });

              await orderDoc.ref.update({
                items: updatedItems,
                totalValue,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedBy: "system",
                lastCostUpdateReason:
                  "Task cost update via Cloud Function (synced with frontend)",
              });

              updatedOrderIds.push(orderDoc.id);
              logger.info(`✅ Order ${orderData.orderNumber} updated`);
            }
          }
        }

        logger.info(`✅ Updated ${updatedOrderIds.length} customer orders`);

        // Oznacz event jako przetworzony
        await event.data.after.ref.update({processed: true});

        return {success: true, updatedOrders: updatedOrderIds.length};
      } catch (error) {
        logger.error("❌ Error updating customer orders", {
          error: error.message,
          stack: error.stack,
        });
        throw error;
      }
    },
);

// ============================================================================
// HELPER FUNCTIONS - Funkcje pomocnicze
// ============================================================================

/**
 * Zaokrągla liczbę do 4 miejsc dziesiętnych (unika błędów floating point)
 * @param {number} num - Liczba do zaokrąglenia
 * @return {number} - Zaokrąglona liczba
 */
function preciseRound(num) {
  return parseFloat(num.toFixed(4));
}

/**
 * Precyzyjne mnożenie dwóch liczb
 * @param {number} a - Pierwsza liczba
 * @param {number} b - Druga liczba
 * @return {number} - Wynik mnożenia
 */
function preciseMultiply(a, b) {
  return preciseRound(a * b);
}

/**
 * Precyzyjne dodawanie dwóch liczb
 * @param {number} a - Pierwsza liczba
 * @param {number} b - Druga liczba
 * @return {number} - Suma
 */
function preciseAdd(a, b) {
  return preciseRound(a + b);
}

/**
 * Precyzyjne odejmowanie dwóch liczb
 * @param {number} a - Pierwsza liczba
 * @param {number} b - Druga liczba
 * @return {number} - Różnica
 */
function preciseSubtract(a, b) {
  return preciseRound(a - b);
}

/**
 * Precyzyjne dzielenie dwóch liczb
 * @param {number} a - Dzielna
 * @param {number} b - Dzielnik
 * @return {number} - Iloraz (lub 0 jeśli dzielnik = 0)
 */
function preciseDivide(a, b) {
  return b !== 0 ? preciseRound(a / b) : 0;
}

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

// ============================================================================
// SCHEDULED FUNCTIONS - Zadania cron
// ============================================================================

/**
 * updateExpiryStats - Aktualizuje statystyki wygasających partii
 * Uruchamiana co godzinę
 *
 * Zapisuje agregaty do: aggregates/expiryStats
 * Sidebar nasłuchuje na ten dokument zamiast pobierać wszystkie partie
 *
 * DEPLOYMENT:
 * firebase deploy --only functions:bgw-mrp:updateExpiryStats
 */
exports.updateExpiryStats = onSchedule(
    {
      schedule: "every 1 hours",
      region: "europe-central2",
      timeZone: "Europe/Warsaw",
      memory: "256MiB",
    },
    async (event) => {
      logger.info("updateExpiryStats - rozpoczynam przeliczanie agregatów");

      const db = admin.firestore();
      const now = new Date();
      const thresholdDate = new Date();
      thresholdDate.setDate(now.getDate() + 365); // 365 dni do przodu

      // Minimalna data (filtruj domyślne daty 1970)
      const minValidDate = new Date("1971-01-01");

      try {
        // Pobierz wygasające partie (w ciągu 365 dni, z quantity > 0)
        const expiringSnapshot = await db
            .collection("inventoryBatches")
            .where("expiryDate", ">=", admin.firestore.Timestamp.fromDate(now))
            .where("expiryDate", "<=",
                admin.firestore.Timestamp.fromDate(thresholdDate))
            .where("quantity", ">", 0)
            .get();

        // Pobierz przeterminowane partie
        const expiredSnapshot = await db
            .collection("inventoryBatches")
            .where("expiryDate", "<", admin.firestore.Timestamp.fromDate(now))
            .where("quantity", ">", 0)
            .get();

        // Filtruj domyślne daty (1970)
        const expiringCount = expiringSnapshot.docs.filter((doc) => {
          const expiryDate = doc.data().expiryDate?.toDate();
          return expiryDate && expiryDate >= minValidDate;
        }).length;

        const expiredCount = expiredSnapshot.docs.filter((doc) => {
          const expiryDate = doc.data().expiryDate?.toDate();
          return expiryDate && expiryDate >= minValidDate;
        }).length;

        // Zapisz agregaty do osobnego dokumentu
        await db.doc("aggregates/expiryStats").set({
          expiringCount,
          expiredCount,
          totalCount: expiringCount + expiredCount,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          calculatedAt: now.toISOString(),
        });

        logger.info("updateExpiryStats - zakończono", {
          expiringCount,
          expiredCount,
          totalCount: expiringCount + expiredCount,
        });

        return {success: true, expiringCount, expiredCount};
      } catch (error) {
        logger.error("updateExpiryStats - błąd", {error: error.message});
        throw error;
      }
    },
);

// exports.dailyInventoryReport = onSchedule("0 6 * * *", async (event) => {
//   // Dzienny raport inwentarza
// });

