/**
 * Purchase Order Update Trigger
 * Trigger 1: PO → Inventory Batches
 * Automatycznie aktualizuje ceny w partiach magazynowych gdy zmienia się PO
 *
 * DEPLOYMENT:
 * firebase deploy --only functions:bgw-mrp:onPurchaseOrderUpdate
 */

const {onDocumentUpdated} = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const {admin} = require("../config");

const onPurchaseOrderUpdate = onDocumentUpdated(
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

module.exports = {onPurchaseOrderUpdate};

