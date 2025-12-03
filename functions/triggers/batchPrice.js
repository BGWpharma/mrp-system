/**
 * Batch Price Update Trigger
 * Trigger 2: Inventory Batch → Manufacturing Orders (Tasks)
 * Automatycznie aktualizuje koszty w zadaniach produkcyjnych
 * gdy zmienia się cena partii
 *
 * DEPLOYMENT:
 * firebase deploy --only functions:bgw-mrp:onBatchPriceUpdate
 */

const {onDocumentWritten} = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const {admin} = require("../config");
const {hasCostChanged, calculateTaskCosts} = require("../utils/costs");

const onBatchPriceUpdate = onDocumentWritten(
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

module.exports = {onBatchPriceUpdate};

