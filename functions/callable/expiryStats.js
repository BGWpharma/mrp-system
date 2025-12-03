/**
 * Refresh Expiry Stats - Callable Function
 * Ręczne odświeżenie agregatów wygasających partii
 * Przydatne do pierwszego uruchomienia lub testów
 *
 * DEPLOYMENT:
 * firebase deploy --only functions:bgw-mrp:refreshExpiryStats
 */

const {onCall} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const {admin} = require("../config");

const refreshExpiryStats = onCall(
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

module.exports = {refreshExpiryStats};

