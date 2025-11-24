/**
 * Cloud Functions for BGW-MRP System
 * Region: europe-central2
 * Node.js: 22
 * Firebase Functions: v2 (2nd Gen)
 *
 * DEPLOYMENT:
 * Always deploy individual functions:
 * firebase deploy --only functions:functionName
 *
 * NEVER use: firebase deploy --only functions (without specific name)
 */

const {setGlobalOptions} = require("firebase-functions/v2");
const {onCall} = require("firebase-functions/v2/https");
// const {
//   onDocumentWritten,
//   onDocumentUpdated,
//   onDocumentCreated,
//   onDocumentDeleted,
// } = require("firebase-functions/v2/firestore");
// const {onSchedule} = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp();
}

// Set global options for all functions
setGlobalOptions({
  maxInstances: 10,
  region: "europe-central2",
  memory: "256MiB",
});

// ============================================================================
// CALLABLE FUNCTIONS - Funkcje wywoływane z aplikacji
// ============================================================================

/**
 * getRandomBatch - Zwraca losową partię z magazynu
 * Funkcja testowa dla narzędzi systemowych
 *
 * @param {Object} request - Request object z Firebase Functions
 * @return {Object} Losowa partia z magazynu lub błąd
 */
exports.getRandomBatch = onCall(async (request) => {
  try {
    logger.info("getRandomBatch called", {auth: request.auth});

    // Verify authentication
    if (!request.auth) {
      throw new Error("Unauthorized - authentication required");
    }

    // Get all inventory batches
    const batchesSnapshot = await admin.firestore()
        .collection("inventoryBatches")
        .limit(100) // Limit to reasonable number for random selection
        .get();

    if (batchesSnapshot.empty) {
      return {
        success: false,
        message: "Brak partii w magazynie",
        batch: null,
      };
    }

    // Get random batch
    const batches = batchesSnapshot.docs;
    const randomIndex = Math.floor(Math.random() * batches.length);
    const randomBatch = batches[randomIndex];
    const batchData = randomBatch.data();

    // Get material name if materialId exists
    let materialName = "Nieznany";
    if (batchData.materialId) {
      try {
        const materialDoc = await admin.firestore()
            .collection("materials")
            .doc(batchData.materialId)
            .get();

        if (materialDoc.exists) {
          materialName = materialDoc.data().name || "Nieznany";
        }
      } catch (materialError) {
        logger.warn("Could not fetch material name", {
          materialId: batchData.materialId,
          error: materialError.message,
        });
      }
    }

    logger.info("Random batch selected", {
      batchId: randomBatch.id,
      materialName: materialName,
    });

    return {
      success: true,
      message: "Losowa partia została pobrana",
      batch: {
        id: randomBatch.id,
        ...batchData,
        materialName: materialName,
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error("Error in getRandomBatch:", error);
    throw new Error(`Nie udało się pobrać losowej partii: ${error.message}`);
  }
});

// ============================================================================
// FIRESTORE TRIGGERS - Automatyczne aktualizacje danych
// ============================================================================

// Przykłady funkcji do implementacji (z memory 8098927):
//
// exports.onPurchaseOrderUpdate = onDocumentUpdated(
//   {document: "purchaseOrders/{orderId}"},
//   async (event) => {
//     // Aktualizacja cen partii na podstawie zmian w PO
//   }
// );
//
// exports.onBatchPriceUpdate = onDocumentUpdated(
//   {document: "inventoryBatches/{batchId}"},
//   async (event) => {
//     // Aktualizacja kosztów MO na podstawie zmian w partiach
//   }
// );
//
// exports.onProductionTaskCostUpdate = onDocumentUpdated(
//   {document: "tasks/{taskId}"},
//   async (event) => {
//     // Aktualizacja wartości CO na podstawie zmian w zadaniach
//   }
// );

// ============================================================================
// SCHEDULED FUNCTIONS - Zadania cron
// ============================================================================

// exports.dailyInventoryReport = onSchedule("0 6 * * *", async (event) => {
//   // Dzienny raport inwentarza
// });

