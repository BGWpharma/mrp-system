/**
 * Production Task Schedule Update Trigger
 * Automatycznie aktualizuje expectedDeliveryDate w zamówieniach klientów (CO)
 * na podstawie najdalszej planowanej daty zakończenia powiązanych zadań produkcyjnych
 *
 * DEPLOYMENT:
 * firebase deploy --only functions:bgw-mrp:onProductionTaskScheduleUpdate
 */

const {onDocumentUpdated} = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const {admin} = require("../config");

const onProductionTaskScheduleUpdate = onDocumentUpdated(
    {
      document: "productionTasks/{taskId}",
      region: "europe-central2",
      memory: "512MiB",
    },
    async (event) => {
      const taskId = event.params.taskId;
      const beforeData = event.data.before.data();
      const afterData = event.data.after.data();

      // Sprawdź czy są istotne zmiany (endDate lub status)
      const endDateChanged =
        JSON.stringify(beforeData.endDate) !== JSON.stringify(afterData.endDate);
      const statusChanged = beforeData.status !== afterData.status;

      if (!endDateChanged && !statusChanged) {
        return null;
      }

      logger.info("📅 Production task schedule/status changed", {
        taskId,
        moNumber: afterData.moNumber,
        endDateChanged,
        statusChanged,
        orderId: afterData.orderId,
      });

      // Sprawdź czy zadanie jest powiązane z zamówieniem
      const orderId = afterData.orderId;
      if (!orderId) {
        logger.info("Task not linked to any order, skipping");
        return null;
      }

      try {
        const db = admin.firestore();

        // Pobierz zamówienie
        const orderRef = db.collection("orders").doc(orderId);
        const orderDoc = await orderRef.get();

        if (!orderDoc.exists) {
          logger.warn(`Order ${orderId} not found`);
          return null;
        }

        const orderData = orderDoc.data();
        logger.info(`Found order: ${orderData.orderNumber || orderId}`);

        // Pobierz wszystkie zadania powiązane z tym zamówieniem
        const tasksQuery = db.collection("productionTasks")
            .where("orderId", "==", orderId);
        const tasksSnapshot = await tasksQuery.get();

        if (tasksSnapshot.empty) {
          logger.info("No production tasks found for this order");
          return null;
        }

        // Znajdź najdalszą datę zakończenia spośród niezakończonych zadań
        let latestEndDate = null;

        tasksSnapshot.docs.forEach((doc) => {
          const task = doc.data();

          // Pomijaj zakończone i anulowane zadania
          if (task.status === "Zakończone" || task.status === "Anulowane") {
            return;
          }

          if (!task.endDate) {
            return;
          }

          // Konwertuj endDate na Date object
          let taskEndDate;
          if (task.endDate?.toDate) {
            // Firestore Timestamp
            taskEndDate = task.endDate.toDate();
          } else if (task.endDate instanceof Date) {
            taskEndDate = task.endDate;
          } else if (typeof task.endDate === "string") {
            taskEndDate = new Date(task.endDate);
          } else {
            return;
          }

          if (!latestEndDate || taskEndDate > latestEndDate) {
            latestEndDate = taskEndDate;
            logger.info(`New latest end date from ${task.moNumber}: ` +
              `${taskEndDate.toISOString()}`);
          }
        });

        // Jeśli wszystkie zadania zakończone/anulowane, nie aktualizuj
        if (!latestEndDate) {
          logger.info("All tasks completed/cancelled, " +
            "not updating expectedDeliveryDate");
          return null;
        }

        // Porównaj z obecną expectedDeliveryDate
        let currentExpectedDate = null;
        if (orderData.expectedDeliveryDate?.toDate) {
          currentExpectedDate = orderData.expectedDeliveryDate.toDate();
        } else if (orderData.expectedDeliveryDate) {
          currentExpectedDate = new Date(orderData.expectedDeliveryDate);
        }

        // Sprawdź czy trzeba aktualizować (>1 min różnicy)
        const needsUpdate = !currentExpectedDate ||
          Math.abs(currentExpectedDate.getTime() - latestEndDate.getTime()) >
            60000;

        if (!needsUpdate) {
          logger.info("expectedDeliveryDate already up to date");
          return null;
        }

        // Aktualizuj expectedDeliveryDate w zamówieniu
        await orderRef.update({
          expectedDeliveryDate: admin.firestore.Timestamp.fromDate(latestEndDate),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: "system",
          lastDeliveryDateUpdateReason:
            `Auto-updated from production task ${afterData.moNumber || taskId}`,
        });

        logger.info(`✅ Order ${orderData.orderNumber} ` +
          `expectedDeliveryDate updated`, {
          orderId,
          newDate: latestEndDate.toISOString(),
          previousDate: currentExpectedDate?.toISOString() || "none",
          triggerTask: afterData.moNumber || taskId,
        });

        return {success: true, orderId, newDate: latestEndDate.toISOString()};
      } catch (error) {
        logger.error("❌ Error updating order delivery date", {
          taskId,
          orderId,
          error: error.message,
          stack: error.stack,
        });
        throw error;
      }
    },
);

module.exports = {onProductionTaskScheduleUpdate};

