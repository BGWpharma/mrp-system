/**
 * Production Task Cost Update Trigger
 * Trigger 3: Manufacturing Orders (Tasks) → Customer Orders
 * Automatycznie aktualizuje wartości w zamówieniach klientów
 * gdy zmienia się koszt zadania produkcyjnego
 *
 * ZSYNCHRONIZOWANE Z LOGIKĄ FRONTENDU (productionService.js updateTaskCostsAutomatically)
 *
 * DEPLOYMENT:
 * firebase deploy --only functions:bgw-mrp:onProductionTaskCostUpdate
 */

const {onDocumentWritten} = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const {admin} = require("../config");

const onProductionTaskCostUpdate = onDocumentWritten(
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

          // Pobierz aktualne dane zadania z bazy aby uwzględnić factory costs
          let factoryCostTotal = 0;
          let taskTotalCostWithFactory = 0;
          try {
            const taskDoc = await db.collection("productionTasks")
                .doc(taskId).get();
            if (taskDoc.exists) {
              const taskData = taskDoc.data();
              factoryCostTotal = parseFloat(taskData.factoryCostTotal) || 0;
              taskTotalCostWithFactory =
                parseFloat(taskData.totalCostWithFactory) || 0;
            }
          } catch (err) {
            logger.warn(`Could not fetch task ${taskId} for factory cost`, {
              error: err.message,
            });
          }

          // Koszty z uwzględnieniem factory costs
          const productionCost = totalMaterialCost + factoryCostTotal;
          const fullProductionCost = taskTotalCostWithFactory > 0 ?
            taskTotalCostWithFactory :
            totalFullProductionCost + factoryCostTotal;

          logger.info(`Task ${moNumber || taskId} costs`, {
            materialCost: totalMaterialCost,
            factoryCost: factoryCostTotal,
            productionCost,
            fullProductionCost,
          });

          // Znajdź zamówienia powiązane z tym zadaniem
          const ordersSnapshot = await db.collection("orders").get();

          for (const orderDoc of ordersSnapshot.docs) {
            const orderData = orderDoc.data();
            let orderUpdated = false;
            const updatedItems = [...(orderData.items || [])];

            for (let i = 0; i < updatedItems.length; i++) {
              const item = updatedItems[i];

              if (item.productionTaskId === taskId) {
                const quantity = parseFloat(item.quantity) || 1;
                const price = parseFloat(item.price) || 0;

                let fullProductionUnitCost;
                if (item.fromPriceList && price > 0) {
                  fullProductionUnitCost = fullProductionCost / quantity;
                } else {
                  fullProductionUnitCost =
                    (fullProductionCost / quantity) + price;
                }

                const productionUnitCost = productionCost / quantity;

                updatedItems[i] = {
                  ...item,
                  productionCost,
                  fullProductionCost,
                  productionUnitCost,
                  fullProductionUnitCost,
                  factoryCostIncluded: factoryCostTotal > 0,
                };
                orderUpdated = true;

                logger.info(`Order item updated`, {
                  orderId: orderDoc.id,
                  orderNumber: orderData.orderNumber,
                  itemName: item.name,
                  productionCost: productionCost.toFixed(4),
                  fullProductionCost: fullProductionCost.toFixed(4),
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

module.exports = {onProductionTaskCostUpdate};

