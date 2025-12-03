/**
 * Get Random Batch - Callable Function
 * Zwraca losową partię z magazynu
 * Funkcja testowa dla narzędzi systemowych
 *
 * DEPLOYMENT:
 * firebase deploy --only functions:bgw-mrp:getRandomBatch
 */

const {onCall} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const {admin} = require("../config");

const getRandomBatch = onCall(async (request) => {
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

module.exports = {getRandomBatch};

