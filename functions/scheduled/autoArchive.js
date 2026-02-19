/**
 * Auto Archive Stale Documents - Scheduled Function
 * Automatycznie archiwizuje nieaktualizowane dokumenty
 * Uruchamiana 1. dnia każdego miesiąca o 02:00
 *
 * DEPLOYMENT:
 * firebase deploy --only functions:bgw-mrp:autoArchiveStaleDocuments --force
 */

const {onSchedule} = require("firebase-functions/v2/scheduler");
const {executeAutoArchive} = require("../utils/archiveLogic");

const autoArchiveStaleDocuments = onSchedule(
    {
      schedule: "0 2 1 * *",
      region: "europe-central2",
      timeZone: "Europe/Warsaw",
      memory: "512MiB",
      timeoutSeconds: 300,
    },
    async (event) => {
      return await executeAutoArchive();
    },
);

module.exports = {autoArchiveStaleDocuments};
