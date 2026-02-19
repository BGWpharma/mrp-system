/**
 * Run Auto Archive - Callable Function
 * Ręczne wywołanie automatycznej archiwizacji z panelu admina
 *
 * DEPLOYMENT:
 * firebase deploy --only functions:bgw-mrp:runAutoArchive --force
 */

const {onCall} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const {executeAutoArchive} = require("../utils/archiveLogic");

const runAutoArchive = onCall(
    {
      region: "europe-central2",
      memory: "512MiB",
      timeoutSeconds: 300,
    },
    async (request) => {
      if (!request.auth) {
        throw new Error("Unauthorized - authentication required");
      }

      logger.info("runAutoArchive - ręczne wywołanie", {
        uid: request.auth.uid,
      });

      return await executeAutoArchive();
    },
);

module.exports = {runAutoArchive};
