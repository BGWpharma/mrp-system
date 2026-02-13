/**
 * BGW Overhead Cloud Function Trigger
 *
 * Nasłuchuje na zmiany w kolekcji journalEntries.
 * Gdy wpis zostanie zaksięgowany (status -> "posted") lub stornowany,
 * automatycznie przelicza Pulę BGW za dany miesiąc i aktualizuje
 * dokument factoryCosts.
 *
 * Istniejący trigger onFactoryCostChange przejmuje dalszą obsługę
 * (costPerMinute, propagacja do zadań produkcyjnych i zamówień).
 *
 * DEPLOYMENT:
 * firebase deploy --only functions:bgw-mrp:onJournalEntryChange
 */

const {onDocumentWritten} = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const {admin} = require("../config");
const {syncFactoryCostWithAccounting} = require("../utils/bgwPool");

/**
 * Konwertuje Firestore Timestamp na Date
 * @param {any} dateValue - Wartość daty
 * @return {Date|null}
 */
const toDate = (dateValue) => {
  if (!dateValue) return null;
  if (dateValue.toDate) return dateValue.toDate();
  if (dateValue instanceof Date) return dateValue;
  if (typeof dateValue === "string") return new Date(dateValue);
  if (typeof dateValue === "number") return new Date(dateValue);
  return null;
};

/**
 * Trigger: nasłuchuje na zmiany w kolekcji journalEntries
 * i synchronizuje Pulę BGW z factoryCosts
 */
const onJournalEntryChange = onDocumentWritten(
    {
      document: "journalEntries/{entryId}",
      region: "europe-central2",
      memory: "512MiB",
      timeoutSeconds: 120,
    },
    async (event) => {
      const entryId = event.params.entryId;
      const db = admin.firestore();

      const beforeData = event.data?.before?.exists ?
        event.data.before.data() : null;
      const afterData = event.data?.after?.exists ?
        event.data.after.data() : null;

      // Określ status przed i po zmianie
      const beforeStatus = beforeData?.status;
      const afterStatus = afterData?.status;

      // Określ typ zmiany
      const isCreated = !beforeData && afterData;
      const isDeleted = beforeData && !afterData;
      const isUpdated = beforeData && afterData;

      // Czy zmiana dotyczy statusu?
      const statusChanged = beforeStatus !== afterStatus;

      // Interesują nas tylko zmiany wpływające na obroty:
      // - Nowy wpis ze statusem "posted" (bezpośrednie zaksięgowanie)
      // - Zmiana statusu na "posted" (zaksięgowanie draft'a)
      // - Zmiana statusu na "reversed" (storno)
      // - Usunięcie zaksięgowanego wpisu
      const isNewlyPosted = afterStatus === "posted" && beforeStatus !== "posted";
      const isReversed = afterStatus === "reversed" && beforeStatus !== "reversed";
      const isDeletedPosted = isDeleted && beforeStatus === "posted";

      // Nowy draft lub zmiana w draft - ignoruj
      if (isCreated && afterStatus === "draft") {
        logger.info(`[BGW] Ignoruję nowy draft ${entryId}`);
        return null;
      }

      if (isUpdated && !statusChanged) {
        logger.info(`[BGW] Ignoruję zmianę bez zmiany statusu ${entryId}`);
        return null;
      }

      if (!isNewlyPosted && !isReversed && !isDeletedPosted) {
        logger.info(`[BGW] Ignoruję zmianę statusu ${beforeStatus} -> ${afterStatus} dla ${entryId}`);
        return null;
      }

      const changeType = isNewlyPosted ? "POSTED" :
        isReversed ? "REVERSED" : "DELETED";

      logger.info(`📊 [BGW] Journal entry ${changeType}: ${entryId}`, {
        beforeStatus,
        afterStatus,
      });

      // Określ miesiąc z entryDate
      const entryDate = toDate(afterData?.entryDate || beforeData?.entryDate);
      if (!entryDate || isNaN(entryDate.getTime())) {
        logger.warn(`[BGW] Brak prawidłowej daty wpisu ${entryId}`);
        return null;
      }

      const year = entryDate.getFullYear();
      const month = entryDate.getMonth() + 1; // 1-based
      const periodKey = `${year}-${String(month).padStart(2, "0")}`;

      logger.info(`[BGW] Przeliczam Pulę BGW dla ${periodKey}`);

      try {
        const result = await syncFactoryCostWithAccounting(db, year, month);

        logger.info(`✅ [BGW] Synchronizacja zakończona dla ${periodKey}`, {
          costDocId: result.costDocId,
          totalAmountPLN: result.totalAmountPLN,
          totalAmountEUR: result.totalAmountEUR,
          exchangeRate: result.exchangeRate,
          isNew: result.isNew,
        });

        // Jeśli storno - wpis mógł dotyczyć innego miesiąca (storno jest datowane na dziś)
        // Sprawdź czy oryginalny wpis miał inną datę
        if (isReversed && beforeData?.entryDate) {
          const beforeDate = toDate(beforeData.entryDate);
          if (beforeDate) {
            const beforeYear = beforeDate.getFullYear();
            const beforeMonth = beforeDate.getMonth() + 1;
            const beforePeriodKey = `${beforeYear}-${String(beforeMonth).padStart(2, "0")}`;

            if (beforePeriodKey !== periodKey) {
              logger.info(`[BGW] Storno dotyczy też miesiąca ${beforePeriodKey}, przeliczam`);
              await syncFactoryCostWithAccounting(db, beforeYear, beforeMonth);
            }
          }
        }

        return result;
      } catch (error) {
        logger.error(`❌ [BGW] Błąd synchronizacji dla ${periodKey}:`, {
          error: error.message,
          stack: error.stack,
        });
        throw error;
      }
    },
);

module.exports = {
  onJournalEntryChange,
};
