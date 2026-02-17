/**
 * Purchase Order Update Trigger
 * Trigger 1: PO → Inventory Batches
 * Automatycznie aktualizuje ceny w partiach magazynowych gdy zmienia się PO
 *
 * Trigger 2: PO Status Change → Supplier Product Catalog
 * Automatycznie aktualizuje katalog produktów dostawcy gdy PO zmienia status z draft
 *
 * Trigger 3: PO → Procurement Forecasts
 * Automatycznie aktualizuje aktywne prognozy zakupowe gdy zmienia się PO
 * (status, ilości, daty dostawy, received quantities)
 *
 * DEPLOYMENT:
 * firebase deploy --only functions:bgw-mrp:onPurchaseOrderUpdate
 */

const {onDocumentUpdated} = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const {admin} = require("../config");

/**
 * Aktualizuje katalog produktów dostawcy na podstawie danych PO
 * Wywoływana gdy PO zmienia status z "draft" na inny
 *
 * @param {Object} db - Firestore database instance
 * @param {string} orderId - Purchase order ID
 * @param {Object} poData - Purchase order data
 * @param {Object} logger - Logger instance
 */
async function updateSupplierProductCatalog(db, orderId, poData, logger) {
  const supplierId = poData.supplierId;
  if (!supplierId) {
    logger.warn("PO without supplierId, skipping catalog update", {orderId});
    return;
  }

  const items = poData.items;
  if (!items || items.length === 0) {
    logger.info("PO has no items, skipping catalog update", {orderId});
    return;
  }

  logger.info("Updating supplier product catalog", {
    orderId,
    supplierId,
    itemCount: items.length,
    newStatus: poData.status,
  });

  let updatedCount = 0;

  for (const item of items) {
    const inventoryItemId = item.inventoryItemId || item.itemId;
    if (!inventoryItemId) continue;

    const unitPrice = parseFloat(item.unitPrice);
    if (isNaN(unitPrice) || unitPrice <= 0) continue;

    try {
      // Szukaj istniejącego rekordu
      const existingQuery = db.collection("supplierProducts")
          .where("supplierId", "==", supplierId)
          .where("inventoryItemId", "==", inventoryItemId);

      const existingSnap = await existingQuery.get();

      if (!existingSnap.empty) {
        // Aktualizacja istniejącego
        const existingDoc = existingSnap.docs[0];
        const existingData = existingDoc.data();

        const orderCount = (existingData.orderCount || 0) + 1;
        const totalOrderedQuantity =
          (existingData.totalOrderedQuantity || 0) +
          (parseFloat(item.quantity) || 0);

        const minPrice = Math.min(
            existingData.minPrice || Infinity, unitPrice);
        const maxPrice = Math.max(
            existingData.maxPrice || 0, unitPrice);

        const prevTotal =
          (existingData.averagePrice || unitPrice) *
          (existingData.orderCount || 0);
        const averagePrice = (prevTotal + unitPrice) / orderCount;

        await existingDoc.ref.update({
          lastPrice: unitPrice,
          averagePrice: Math.round(averagePrice * 100) / 100,
          minPrice,
          maxPrice,
          currency: item.currency || poData.currency || "PLN",
          totalOrderedQuantity,
          orderCount,
          lastOrderDate: poData.orderDate ||
            admin.firestore.FieldValue.serverTimestamp(),
          lastPurchaseOrderId: orderId,
          lastPurchaseOrderNumber: poData.number || "",
          productName: item.name || existingData.productName,
          unit: item.unit || existingData.unit,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        // Nowy rekord
        await db.collection("supplierProducts").add({
          supplierId,
          inventoryItemId,
          productName: item.name || "",
          unit: item.unit || "szt",
          supplierProductCode: item.supplierProductCode || "",
          lastPrice: unitPrice,
          averagePrice: unitPrice,
          minPrice: unitPrice,
          maxPrice: unitPrice,
          currency: item.currency || poData.currency || "PLN",
          totalOrderedQuantity: parseFloat(item.quantity) || 0,
          orderCount: 1,
          lastOrderDate: poData.orderDate ||
            admin.firestore.FieldValue.serverTimestamp(),
          lastPurchaseOrderId: orderId,
          lastPurchaseOrderNumber: poData.number || "",
          firstSeenAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      updatedCount++;
    } catch (error) {
      logger.error("Error updating catalog for item", {
        orderId,
        inventoryItemId,
        error: error.message,
      });
    }
  }

  logger.info(`✅ Supplier catalog updated: ${updatedCount} products`, {
    orderId,
    supplierId,
    updatedCount,
  });
}

/**
 * Aktualizuje aktywne prognozy zakupowe przy zmianie PO
 * Szuka prognoz zawierających materiały z dostawami powiązanymi z tym PO
 * i aktualizuje: status, ilości remaining, daty dostawy, bilanse
 *
 * @param {Object} db - Firestore database instance
 * @param {string} orderId - Purchase order ID
 * @param {Object} beforeData - PO data before update
 * @param {Object} afterData - PO data after update
 */
async function updateProcurementForecasts(db, orderId, beforeData, afterData) {
  try {
    // Pobierz tylko aktywne prognozy
    const forecastsQuery = db.collection("procurementForecasts")
        .where("status", "==", "active");
    const forecastsSnapshot = await forecastsQuery.get();

    if (forecastsSnapshot.empty) {
      logger.info("No active procurement forecasts found, skipping");
      return;
    }

    const poNumber = afterData.number || "";
    const poStatus = afterData.status || "";
    const poItems = afterData.items || [];
    const poExpectedDeliveryDate = afterData.expectedDeliveryDate || null;
    const supplierName = afterData.supplierName || "";

    // Statusy PO które oznaczają "nie będzie już dostawy"
    const terminalStatuses = ["completed", "cancelled"];

    let updatedForecastsCount = 0;

    for (const forecastDoc of forecastsSnapshot.docs) {
      const forecast = forecastDoc.data();
      const materials = forecast.materials || [];
      let forecastChanged = false;

      const updatedMaterials = materials.map((material) => {
        const deliveries = material.futureDeliveries || [];
        if (deliveries.length === 0) return material;

        // Sprawdź czy jakiekolwiek dostawy odnoszą się do tego PO
        const hasMatchingDelivery = deliveries.some(
            (d) => d.poId === orderId,
        );
        if (!hasMatchingDelivery) return material;

        // Aktualizuj dostawy powiązane z tym PO
        let updatedDeliveries = deliveries.map((delivery) => {
          if (delivery.poId !== orderId) return delivery;

          // Znajdź odpowiednią pozycję w PO dla tego materiału
          const matchingPoItem = poItems.find(
              (item) => item.inventoryItemId === material.materialId,
          );

          if (!matchingPoItem) {
            // Pozycja została usunięta z PO - oznacz dostawę jako cancelled
            forecastChanged = true;
            return {
              ...delivery,
              status: "cancelled",
              quantity: 0,
              poNumber: poNumber || delivery.poNumber,
            };
          }

          const quantityOrdered = parseFloat(matchingPoItem.quantity) || 0;
          const quantityReceived = parseFloat(matchingPoItem.received) || 0;
          const quantityRemaining = Math.max(
              0, quantityOrdered - quantityReceived,
          );
          const deliveryDate = matchingPoItem.plannedDeliveryDate ||
            poExpectedDeliveryDate;

          // Sprawdź czy coś się zmieniło
          const oldQuantity = parseFloat(delivery.quantity) || 0;
          const oldStatus = delivery.status || "";

          if (
            oldQuantity !== quantityRemaining ||
            oldStatus !== poStatus ||
            delivery.expectedDeliveryDate !== deliveryDate ||
            delivery.supplierName !== supplierName
          ) {
            forecastChanged = true;
          }

          return {
            ...delivery,
            status: poStatus,
            quantity: quantityRemaining,
            poNumber: poNumber || delivery.poNumber,
            expectedDeliveryDate: deliveryDate || delivery.expectedDeliveryDate,
            supplierName: supplierName || delivery.supplierName,
          };
        });

        // Usuń dostawy z terminalnych statusów gdzie remaining = 0
        updatedDeliveries = updatedDeliveries.filter((d) => {
          if (terminalStatuses.includes(d.status) && d.quantity <= 0) {
            forecastChanged = true;
            return false;
          }
          return true;
        });

        // Przelicz sumy i bilanse
        const newFutureDeliveriesTotal = updatedDeliveries.reduce(
            (sum, d) => sum + (parseFloat(d.quantity) || 0), 0,
        );
        const newBalanceWithFutureDeliveries =
          (material.availableQuantity || 0) +
          newFutureDeliveriesTotal -
          (material.requiredQuantity || 0);

        return {
          ...material,
          futureDeliveries: updatedDeliveries,
          futureDeliveriesTotal: parseFloat(
              newFutureDeliveriesTotal.toFixed(2),
          ),
          balanceWithFutureDeliveries: parseFloat(
              newBalanceWithFutureDeliveries.toFixed(2),
          ),
        };
      });

      if (!forecastChanged) continue;

      // Przelicz podsumowanie prognozy
      const materialsWithShortage = updatedMaterials.filter(
          (m) => m.balanceWithFutureDeliveries < 0,
      ).length;
      const totalShortageValue = updatedMaterials
          .filter((m) => m.balanceWithFutureDeliveries < 0)
          .reduce(
              (sum, m) => sum + (
                Math.abs(m.balanceWithFutureDeliveries) * (m.price || 0)
              ), 0,
          );

      await forecastDoc.ref.update({
        materials: updatedMaterials,
        materialsWithShortage,
        totalShortageValue: parseFloat(totalShortageValue.toFixed(2)),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: "system",
        lastAutoUpdateReason: `PO ${poNumber} updated (${poStatus})`,
      });

      updatedForecastsCount++;
      logger.info(`Procurement forecast ${forecastDoc.id} updated`, {
        forecastNumber: forecast.number,
        materialsWithShortage,
        totalShortageValue: totalShortageValue.toFixed(2),
      });
    }

    logger.info(
        `✅ Procurement forecasts update complete: ${updatedForecastsCount}`,
        {orderId, updatedForecastsCount},
    );
  } catch (error) {
    logger.error("❌ Error updating procurement forecasts", {
      orderId,
      error: error.message,
      stack: error.stack,
    });
    // Nie rzucamy błędu - aktualizacja prognoz nie powinna blokować
    // głównego triggera (ceny partii, katalog dostawcy)
  }
}

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

        // === TRIGGER 2: Aktualizacja katalogu produktów dostawcy ===
        // Reaguje na zmianę statusu z 'draft' na dowolny inny
        const statusChanged = beforeData.status !== afterData.status;
        const wasFromDraft = beforeData.status === "draft" &&
                            afterData.status !== "draft";

        if (statusChanged && wasFromDraft) {
          await updateSupplierProductCatalog(db, orderId, afterData, logger);
        }

        // === TRIGGER 3: Aktualizacja prognoz zakupowych ===
        // Reaguje na zmiany statusu, ilości, dat dostawy, received
        const itemsChanged = JSON.stringify(beforeData.items) !==
                            JSON.stringify(afterData.items);
        const poStatusChanged = beforeData.status !== afterData.status;
        const deliveryDateChanged = beforeData.expectedDeliveryDate !==
                                    afterData.expectedDeliveryDate;

        if (itemsChanged || poStatusChanged || deliveryDateChanged) {
          await updateProcurementForecasts(
              db, orderId, beforeData, afterData,
          );
        }

        // === TRIGGER 1: Aktualizacja cen partii magazynowych ===
        // Sprawdź czy są zmiany w pozycjach lub dodatkowych kosztach
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

