/**
 * PO Order Reminder - Scheduled Function
 * Sprawdza rezerwacje PO i ostrzega o niezamówionych materiałach
 * przy zbliżającym się terminie produkcji
 *
 * DEPLOYMENT:
 * firebase deploy --only functions:bgw-mrp:checkUnorderedPOReservations
 */

const {onSchedule} = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const {admin} = require("../config");

// Konfiguracja progów ostrzeżeń (w dniach)
const WARNING_THRESHOLDS = {
  CRITICAL: 7, // Produkcja za 7 dni lub mniej
  URGENT: 14, // Produkcja za 14 dni lub mniej
  NORMAL: 31, // Produkcja za 31 dni lub mniej
};

/**
 * Określa priorytet ostrzeżenia na podstawie dni do produkcji
 * @param {number} daysToProduction - Liczba dni do planowanej produkcji
 * @return {Object|null} Obiekt z poziomem ostrzeżenia lub null
 */
const getWarningLevel = (daysToProduction) => {
  if (daysToProduction <= WARNING_THRESHOLDS.CRITICAL) {
    return {level: "critical", emoji: "🔴", label: "KRYTYCZNE"};
  }
  if (daysToProduction <= WARNING_THRESHOLDS.URGENT) {
    return {level: "urgent", emoji: "🟠", label: "PILNE"};
  }
  if (daysToProduction <= WARNING_THRESHOLDS.NORMAL) {
    return {level: "normal", emoji: "🟡", label: "UWAGA"};
  }
  return null; // Nie wysyłaj powiadomień dla dalszych terminów
};

/**
 * Główna funkcja schedulowana
 * Uruchamiana codziennie o 8:00 rano
 */
const checkUnorderedPOReservations = onSchedule(
    {
      schedule: "every day 08:00",
      region: "europe-central2",
      timeZone: "Europe/Warsaw",
      memory: "512MiB",
    },
    async (event) => {
      logger.info("checkUnorderedPOReservations - rozpoczynam sprawdzanie");

      const db = admin.firestore();
      const rtdb = admin.database();
      const now = new Date();

      try {
        // 1. Pobierz wszystkie rezerwacje PO ze statusem 'pending'
        const reservationsSnapshot = await db
            .collection("poReservations")
            .where("status", "==", "pending")
            .get();

        if (reservationsSnapshot.empty) {
          logger.info("Brak aktywnych rezerwacji PO do sprawdzenia");
          return {success: true, checked: 0, notificationsSent: 0};
        }

        logger.info(
            `Znaleziono ${reservationsSnapshot.size} rezerwacji do sprawdzenia`,
        );

        // 2. Grupuj rezerwacje po PO ID i Task ID
        const reservationsByPO = new Map();

        for (const doc of reservationsSnapshot.docs) {
          const reservation = {id: doc.id, ...doc.data()};
          const key = reservation.poId;

          if (!reservationsByPO.has(key)) {
            reservationsByPO.set(key, []);
          }
          reservationsByPO.get(key).push(reservation);
        }

        // 3. Przetwórz każde PO
        const alerts = [];
        const processedPOs = new Set();

        for (const [poId, reservations] of reservationsByPO) {
          try {
            // Pobierz PO
            const poDoc = await db.collection("purchaseOrders").doc(poId).get();

            if (!poDoc.exists) {
              logger.warn(`PO ${poId} nie istnieje`);
              continue;
            }

            const po = poDoc.data();

            // Sprawdź czy PO jest w statusie 'draft' (projekt)
            if (po.status !== "draft") {
              // PO zostało już zamówione, nie wysyłaj ostrzeżenia
              continue;
            }

            processedPOs.add(poId);

            // Dla każdej rezerwacji sprawdź termin produkcji
            for (const reservation of reservations) {
              try {
                // Pobierz zadanie produkcyjne
                const taskDoc = await db
                    .collection("productionTasks")
                    .doc(reservation.taskId)
                    .get();

                if (!taskDoc.exists) {
                  logger.warn(`Zadanie ${reservation.taskId} nie istnieje`);
                  continue;
                }

                const task = taskDoc.data();

                // Pobierz scheduledDate
                let scheduledDate = null;
                if (task.scheduledDate) {
                  scheduledDate = task.scheduledDate.toDate ?
                    task.scheduledDate.toDate() :
                    new Date(task.scheduledDate);
                }

                if (!scheduledDate || isNaN(scheduledDate.getTime())) {
                  logger.warn(
                      `Zadanie ${reservation.taskId} nie ma prawidłowej daty`,
                  );
                  continue;
                }

                // Oblicz dni do produkcji
                const daysToProduction = Math.ceil(
                    (scheduledDate.getTime() - now.getTime()) /
                    (1000 * 60 * 60 * 24),
                );

                // Sprawdź czy należy wysłać ostrzeżenie
                const warningLevel = getWarningLevel(daysToProduction);

                if (warningLevel && daysToProduction >= 0) {
                  alerts.push({
                    poId,
                    poNumber: po.number,
                    taskId: reservation.taskId,
                    taskNumber: reservation.taskNumber ||
                      task.moNumber ||
                      task.number,
                    taskName: reservation.taskName || task.name,
                    materialName: reservation.materialName,
                    reservedQuantity: reservation.reservedQuantity,
                    unit: reservation.unit,
                    reservedBy: reservation.reservedBy,
                    scheduledDate,
                    daysToProduction,
                    warningLevel,
                    supplierName: po.supplier?.name ||
                      reservation.supplier?.name ||
                      "Nieznany",
                  });
                }
              } catch (taskError) {
                logger.error(
                    `Błąd przetwarzania zadania ${reservation.taskId}:`,
                    taskError,
                );
              }
            }
          } catch (poError) {
            logger.error(`Błąd przetwarzania PO ${poId}:`, poError);
          }
        }

        logger.info(`Znaleziono ${alerts.length} alertów do wysłania`);

        // 4. Grupuj alerty po użytkowniku
        const alertsByUser = new Map();

        for (const alert of alerts) {
          if (!alert.reservedBy) continue;

          if (!alertsByUser.has(alert.reservedBy)) {
            alertsByUser.set(alert.reservedBy, []);
          }
          alertsByUser.get(alert.reservedBy).push(alert);
        }

        // 5. Wyślij powiadomienia
        let notificationsSent = 0;

        for (const [userId, userAlerts] of alertsByUser) {
          try {
            // Sortuj alerty po priorytecie (najważniejsze najpierw)
            userAlerts.sort((a, b) => a.daysToProduction - b.daysToProduction);

            // Przygotuj treść powiadomienia
            const criticalCount = userAlerts.filter(
                (a) => a.warningLevel.level === "critical",
            ).length;
            const urgentCount = userAlerts.filter(
                (a) => a.warningLevel.level === "urgent",
            ).length;

            let title = "⚠️ Niezamówione materiały dla produkcji";
            if (criticalCount > 0) {
              title =
                "🔴 PILNE: Niezamówione materiały - produkcja za mniej niż 7 dni!";
            } else if (urgentCount > 0) {
              title =
                "🟠 UWAGA: Niezamówione materiały - produkcja za mniej niż 14 dni";
            }

            // Przygotuj szczegóły (max 5 pozycji)
            const topAlerts = userAlerts.slice(0, 5);
            const messageLines = topAlerts.map((alert) => {
              const dateStr = alert.scheduledDate.toLocaleDateString("pl-PL");
              return `${alert.warningLevel.emoji} ${alert.taskNumber}: ` +
                `${alert.materialName} (${alert.reservedQuantity} ` +
                `${alert.unit}) - produkcja: ${dateStr} ` +
                `(za ${alert.daysToProduction} dni)`;
            });

            if (userAlerts.length > 5) {
              messageLines.push(
                  `\n...oraz ${userAlerts.length - 5} innych pozycji`,
              );
            }

            const message = messageLines.join("\n");

            // Zapisz powiadomienie do Realtime Database
            const notificationRef = rtdb.ref("notifications").push();
            await notificationRef.set({
              userIds: [userId],
              title,
              message,
              type: criticalCount > 0 ?
                "error" :
                (urgentCount > 0 ? "warning" : "info"),
              entityType: "poOrderReminder",
              entityId: null,
              read: {[userId]: false},
              createdAt: new Date().toISOString(),
              createdBy: "system",
              metadata: {
                alertCount: userAlerts.length,
                criticalCount,
                urgentCount,
                poNumbers: [...new Set(userAlerts.map((a) => a.poNumber))],
                taskNumbers: [...new Set(userAlerts.map((a) => a.taskNumber))],
              },
            });

            notificationsSent++;
            logger.info(
                `Wysłano powiadomienie do użytkownika ${userId} ` +
                `z ${userAlerts.length} alertami`,
            );
          } catch (notifyError) {
            logger.error(
                `Błąd wysyłania powiadomienia do ${userId}:`,
                notifyError,
            );
          }
        }

        // 6. Zapisz statystyki i pełne dane alertów do agregatów (dla cache frontendu)
        const criticalCount = alerts.filter(
            (a) => a.warningLevel.level === "critical",
        ).length;
        const urgentCount = alerts.filter(
            (a) => a.warningLevel.level === "urgent",
        ).length;
        const normalCount = alerts.filter(
            (a) => a.warningLevel.level === "normal",
        ).length;

        // Sortuj alerty po priorytecie (najważniejsze najpierw)
        alerts.sort((a, b) => a.daysToProduction - b.daysToProduction);

        await db.doc("aggregates/poOrderReminders").set({
          lastRun: admin.firestore.FieldValue.serverTimestamp(),
          reservationsChecked: reservationsSnapshot.size,
          draftPOsFound: processedPOs.size,
          alertsGenerated: alerts.length,
          notificationsSent,
          // Pełne dane alertów do wyświetlenia w UI
          alerts: alerts.map((alert) => ({
            id: `${alert.poId}_${alert.taskId}_${alert.materialName}`,
            poId: alert.poId,
            poNumber: alert.poNumber,
            taskId: alert.taskId,
            taskNumber: alert.taskNumber,
            taskName: alert.taskName,
            materialId: alert.materialId || null,
            materialName: alert.materialName,
            reservedQuantity: alert.reservedQuantity,
            unit: alert.unit,
            reservedBy: alert.reservedBy,
            scheduledDate: alert.scheduledDate.toISOString(),
            daysToProduction: alert.daysToProduction,
            warningLevel: alert.warningLevel,
            supplierName: alert.supplierName,
            isOverdue: alert.daysToProduction < 0,
          })),
          // Statystyki
          stats: {
            totalReservations: reservationsSnapshot.size,
            draftPOs: processedPOs.size,
            criticalCount,
            urgentCount,
            normalCount,
          },
        });

        logger.info("checkUnorderedPOReservations - zakończono", {
          reservationsChecked: reservationsSnapshot.size,
          draftPOsFound: processedPOs.size,
          alertsGenerated: alerts.length,
          notificationsSent,
        });

        return {
          success: true,
          reservationsChecked: reservationsSnapshot.size,
          draftPOsFound: processedPOs.size,
          alertsGenerated: alerts.length,
          notificationsSent,
        };
      } catch (error) {
        logger.error("checkUnorderedPOReservations - błąd:", {
          error: error.message,
          stack: error.stack,
        });
        throw error;
      }
    },
);

module.exports = {checkUnorderedPOReservations};
