/**
 * Callable Function: Recalculate Shipped Quantities
 * Pozwala użytkownikowi ręcznie przeliczyć ilości wysłane dla zamówienia
 * Resetuje wszystko i przelicza od zera na podstawie wszystkich CMR
 *
 * DEPLOYMENT:
 * firebase deploy --only functions:bgw-mrp:recalculateShippedQuantities
 */

const {onCall} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const {admin} = require("../config");

const recalculateShippedQuantities = onCall(
    {
      region: "europe-central2",
      memory: "512MiB",
    },
    async (request) => {
      const {orderId} = request.data;
      const userId = request.auth?.uid || "system";

      if (!orderId) {
        throw new Error("orderId is required");
      }

      logger.info("🔄 Manual shipped quantities recalculation requested", {orderId, userId});

      try {
        const db = admin.firestore();

        // Pobierz zamówienie
        const orderDoc = await db.collection("orders").doc(orderId).get();
        if (!orderDoc.exists) {
          throw new Error(`Order ${orderId} not found`);
        }

        const orderData = orderDoc.data();

        // Znajdź wszystkie CMR powiązane z tym zamówieniem
        const [cmrSnapshot1, cmrSnapshot2] = await Promise.all([
          db.collection("cmrDocuments").where("linkedOrderIds", "array-contains", orderId).get(),
          db.collection("cmrDocuments").where("linkedOrderId", "==", orderId).get(),
        ]);

        const allCmrs = [];
        cmrSnapshot1.forEach((doc) => {
          if (!allCmrs.find((cmr) => cmr.id === doc.id)) {
            allCmrs.push({id: doc.id, ...doc.data()});
          }
        });
        cmrSnapshot2.forEach((doc) => {
          if (!allCmrs.find((cmr) => cmr.id === doc.id)) {
            allCmrs.push({id: doc.id, ...doc.data()});
          }
        });

        // Przefiltruj tylko CMR w odpowiednich statusach
        const validCmrs = allCmrs.filter((cmr) =>
          ["W transporcie", "Dostarczone", "Zakończone"].includes(cmr.status),
        );

        logger.info(`Found ${validCmrs.length} valid CMR documents for order ${orderId}`);

        // Resetuj wszystkie ilości do zera
        const resetItems = orderData.items.map((item) => ({
          ...item,
          shippedQuantity: 0,
          lastShipmentDate: null,
          lastCmrNumber: null,
          cmrHistory: [],
        }));

        // Przelicz od nowa na podstawie wszystkich CMR
        let finalItems = [...resetItems];

        for (const cmr of validCmrs) {
          if (!cmr.items || cmr.items.length === 0) continue;

          finalItems = finalItems.map((orderItem) => {
            const matchingCmrItems = findMatchingCmrItems(orderItem, cmr.items);

            if (matchingCmrItems.length > 0) {
              const totalQuantity = matchingCmrItems.reduce(
                  (sum, item) => sum + (parseFloat(item.quantity) || 0),
                  0,
              );
              const currentShipped = parseFloat(orderItem.shippedQuantity) || 0;

              const cmrHistory = orderItem.cmrHistory || [];
              const newHistoryEntries = matchingCmrItems.map((item) => ({
                cmrNumber: cmr.cmrNumber,
                quantity: parseFloat(item.quantity) || 0,
                unit: item.unit || "szt.",
                shipmentDate: item.shipmentDate || new Date().toISOString(),
                itemId: item.itemId,
                description: item.description,
              }));

              return {
                ...orderItem,
                shippedQuantity: currentShipped + totalQuantity,
                lastShipmentDate: new Date().toISOString(),
                lastCmrNumber: cmr.cmrNumber,
                cmrHistory: [...cmrHistory, ...newHistoryEntries],
              };
            }

            return orderItem;
          });
        }

        // Zapisz wynik atomowo
        await db.collection("orders").doc(orderId).update({
          items: finalItems,
          updatedBy: userId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastManualRecalculation: admin.firestore.FieldValue.serverTimestamp(),
        });

        const shippedItemsCount = finalItems.filter(
            (item) => (parseFloat(item.shippedQuantity) || 0) > 0,
        ).length;

        logger.info("✅ Manual recalculation completed", {
          orderId,
          cmrCount: validCmrs.length,
          shippedItemsCount,
        });

        return {
          success: true,
          message: `Przeliczono ilości wysłane. Przetworzono ${validCmrs.length} CMR, zaktualizowano ${shippedItemsCount} pozycji.`,
          stats: {
            processedCmrs: validCmrs.length,
            shippedItems: shippedItemsCount,
          },
        };
      } catch (error) {
        logger.error("❌ Error in manual recalculation", {orderId, error: error.message});
        throw new Error(`Błąd podczas przeliczania: ${error.message}`);
      }
    },
);

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

module.exports = {recalculateShippedQuantities};
