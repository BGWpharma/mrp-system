/**
 * Update Expiry Stats - Scheduled Function
 * Aktualizuje statystyki wygasających partii
 * Uruchamiana co godzinę
 *
 * Zapisuje agregaty do: aggregates/expiryStats
 * Sidebar nasłuchuje na ten dokument zamiast pobierać wszystkie partie
 *
 * DEPLOYMENT:
 * firebase deploy --only functions:bgw-mrp:updateExpiryStats
 */

const {onSchedule} = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const {admin} = require("../config");

const updateExpiryStats = onSchedule(
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

module.exports = {updateExpiryStats};

