/**
 * CMR Status Update Trigger
 * Trigger 4: CMR Documents → Customer Orders
 * Automatycznie aktualizuje ilości wysłane w zamówieniach gdy CMR zmienia status na "W transporcie"
 *
 * DEPLOYMENT:
 * firebase deploy --only functions:bgw-mrp:onCmrStatusUpdate
 */

const {onDocumentUpdated} = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const {admin} = require("../config");

const onCmrStatusUpdate = onDocumentUpdated(
    {
      document: "cmrDocuments/{cmrId}",
      region: "europe-central2",
      memory: "512MiB",
    },
    async (event) => {
      const cmrId = event.params.cmrId;
      const beforeData = event.data.before.data();
      const afterData = event.data.after.data();

      // Tylko gdy status zmieni się na "W transporcie"
      if (beforeData.status !== "W transporcie" && afterData.status === "W transporcie") {
        logger.info("🚛 CMR status changed to 'W transporcie'", {cmrId});

        try {
          const db = admin.firestore();

          // Pobierz pełne dane CMR
          const cmrDoc = await db.collection("cmrDocuments").doc(cmrId).get();
          const cmrData = cmrDoc.data();

          if (!cmrData) {
            logger.warn("CMR document not found", {cmrId});
            return null;
          }

          // Pobierz pozycje CMR z osobnej kolekcji cmrItems
          const itemsSnapshot = await db.collection("cmrItems")
              .where("cmrId", "==", cmrId)
              .get();

          const cmrItems = [];
          itemsSnapshot.forEach((doc) => {
            cmrItems.push({id: doc.id, ...doc.data()});
          });

          if (cmrItems.length === 0) {
            logger.warn("CMR has no items in cmrItems collection", {cmrId});
            return null;
          }

          logger.info("Found CMR items", {cmrId, itemsCount: cmrItems.length});

          // Znajdź powiązane zamówienia
          const orderIds = [];
          if (cmrData.linkedOrderIds && cmrData.linkedOrderIds.length > 0) {
            orderIds.push(...cmrData.linkedOrderIds);
          }
          if (cmrData.linkedOrderId) {
            orderIds.push(cmrData.linkedOrderId);
          }

          if (orderIds.length === 0) {
            logger.warn("CMR has no linked orders", {cmrId});
            return null;
          }

          // Dla każdego zamówienia - bezpiecznie dodaj ilości
          const uniqueOrderIds = [...new Set(orderIds)];
          for (const orderId of uniqueOrderIds) {
            await updateOrderShippedQuantities(
                db, orderId, cmrItems, cmrData.cmrNumber, "system",
            );
          }

          logger.info("✅ Successfully updated shipped quantities for CMR", {
            cmrId,
            cmrNumber: cmrData.cmrNumber,
            orderCount: uniqueOrderIds.length,
          });
        } catch (error) {
          logger.error("❌ Error updating shipped quantities for CMR", {cmrId, error: error.message});
          throw error; // Re-throw to trigger retry
        }
      }

      return null;
    },
);

/**
 * Bezpieczna funkcja aktualizacji ilości wysłanych z transakcją Firestore
 * @param {Object} db - Instancja Firestore
 * @param {string} orderId - ID zamówienia
 * @param {Array} cmrItems - Lista pozycji CMR
 * @param {string} cmrNumber - Numer CMR
 * @param {string} userId - ID użytkownika
 * @return {Promise<Array>} Zaktualizowane pozycje
 */
async function updateOrderShippedQuantities(db, orderId, cmrItems, cmrNumber, userId) {
  return db.runTransaction(async (transaction) => {
    const orderRef = db.collection("orders").doc(orderId);
    const orderDoc = await transaction.get(orderRef);

    if (!orderDoc.exists) {
      throw new Error(`Order ${orderId} not found`);
    }

    const orderData = orderDoc.data();
    const items = orderData.items || [];

    logger.info(`Processing order ${orderId} with ${items.length} items and ${cmrItems.length} CMR items`);

    // Algorytm dopasowywania pozycji CMR do zamówienia (skopiowany z istniejącego kodu)
    const updatedItems = items.map((orderItem) => {
      // Sprawdź czy ta pozycja już ma ten CMR w historii (żeby uniknąć duplikatów)
      const existingCmrEntry = orderItem.cmrHistory?.find((entry) => entry.cmrNumber === cmrNumber);
      if (existingCmrEntry) {
        logger.info(
            `CMR ${cmrNumber} already processed for item ${orderItem.id || orderItem.name}`,
        );
        return orderItem; // Nie aktualizuj ponownie
      }

      // Znajdź pasujące pozycje CMR
      const matchingCmrItems = findMatchingCmrItems(orderItem, cmrItems);

      if (matchingCmrItems.length > 0) {
        const totalQuantity = matchingCmrItems.reduce(
            (sum, item) => sum + (parseFloat(item.quantity) || 0),
            0,
        );

        // Dodaj do istniejącej ilości wysłanej
        const currentShipped = parseFloat(orderItem.shippedQuantity) || 0;
        const newShipped = currentShipped + totalQuantity;

        // Zaktualizuj historię CMR - filtruj undefined wartości
        const cmrHistory = orderItem.cmrHistory || [];
        const newHistoryEntries = matchingCmrItems.map((item) => {
          const entry = {
            cmrNumber,
            quantity: parseFloat(item.quantity) || 0,
            unit: item.unit || "szt.",
            shipmentDate: new Date().toISOString(),
          };
          // Dodaj opcjonalne pola tylko jeśli nie są undefined
          if (item.itemId) entry.itemId = item.itemId;
          if (item.description) entry.description = item.description;
          return entry;
        });

        logger.info(`Adding ${totalQuantity} units from CMR ${cmrNumber} to order item ${orderItem.id || orderItem.name}`);

        return {
          ...orderItem,
          shippedQuantity: newShipped,
          lastShipmentDate: new Date().toISOString(),
          lastCmrNumber: cmrNumber,
          cmrHistory: [...cmrHistory, ...newHistoryEntries],
        };
      }

      return orderItem;
    });

    // Zapisz atomowo
    transaction.update(orderRef, {
      items: updatedItems,
      updatedBy: userId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return updatedItems;
  });
}

/**
 * Funkcja dopasowywania pozycji CMR do pozycji zamówienia
 * @param {Object} orderItem - Pozycja zamówienia
 * @param {Array} cmrItems - Lista pozycji CMR
 * @return {Array} Pasujące pozycje CMR
 */
function findMatchingCmrItems(orderItem, cmrItems) {
  const matches = [];

  for (const cmrItem of cmrItems) {
    const quantity = parseFloat(cmrItem.quantity) || parseFloat(cmrItem.numberOfPackages) || 0;
    if (quantity <= 0) continue;

    // 1. Dokładne dopasowanie nazwy
    if (orderItem.name && cmrItem.description &&
        orderItem.name.trim().toLowerCase() === cmrItem.description.trim().toLowerCase()) {
      matches.push(cmrItem);
      continue;
    }

    // 2. Dopasowanie przez ID produktu
    if (orderItem.id && cmrItem.itemId && orderItem.id === cmrItem.itemId) {
      matches.push(cmrItem);
      continue;
    }

    // 3. Normalizacja nazw i porównanie
    const normalizedOrderName = normalizeProductName(orderItem.name || "");
    const normalizedCmrName = normalizeProductName(cmrItem.description || "");

    if (normalizedOrderName && normalizedCmrName === normalizedOrderName) {
      matches.push(cmrItem);
      continue;
    }

    // 4. Częściowe dopasowanie
    if (orderItem.name && cmrItem.description) {
      const orderName = orderItem.name.trim().toLowerCase();
      const cmrDesc = cmrItem.description.trim().toLowerCase();
      if (orderName.includes(cmrDesc) || cmrDesc.includes(orderName)) {
        matches.push(cmrItem);
        continue;
      }
    }
  }

  return matches;
}

/**
 * Funkcja normalizacji nazw produktów
 * @param {string} name - Nazwa produktu
 * @return {string} Znormalizowana nazwa
 */
function normalizeProductName(name) {
  if (!name) return "";
  return name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") // usuń wszystkie znaki niealfanumeryczne
      .replace(/omega3/g, "omega")
      .replace(/omegacaps/g, "omega")
      .replace(/caps$/g, ""); // usuń "caps" na końcu
}

module.exports = {onCmrStatusUpdate};
