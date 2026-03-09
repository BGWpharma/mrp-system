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

        const allCmrDocs = [];
        cmrSnapshot1.forEach((doc) => {
          if (!allCmrDocs.find((cmr) => cmr.id === doc.id)) {
            allCmrDocs.push({id: doc.id, ...doc.data()});
          }
        });
        cmrSnapshot2.forEach((doc) => {
          if (!allCmrDocs.find((cmr) => cmr.id === doc.id)) {
            allCmrDocs.push({id: doc.id, ...doc.data()});
          }
        });

        // Przefiltruj tylko CMR w odpowiednich statusach
        const filteredCmrs = allCmrDocs.filter((cmr) =>
          ["W transporcie", "Dostarczone", "Zakończony"].includes(cmr.status),
        );

        // Pobierz pozycje dla każdego CMR z kolekcji cmrItems
        const validCmrs = await Promise.all(
            filteredCmrs.map(async (cmrDoc) => {
              try {
                const itemsSnapshot = await db.collection("cmrItems")
                    .where("cmrId", "==", cmrDoc.id)
                    .get();

                const items = itemsSnapshot.docs.map((itemDoc) => ({
                  id: itemDoc.id,
                  ...itemDoc.data(),
                }));

                return {
                  ...cmrDoc,
                  items: items,
                };
              } catch (error) {
                logger.warn(`Error fetching items for CMR ${cmrDoc.cmrNumber}:`, error);
                return {
                  ...cmrDoc,
                  items: [],
                };
              }
            }),
        );

        logger.info(`Found ${validCmrs.length} valid CMR documents for order ${orderId}`);

        // Log order items for debugging
        logger.info("Order items:", {
          orderNumber: orderData.orderNumber,
          items: orderData.items.map((item) => ({
            id: item.id,
            name: item.name,
            productId: item.productId,
          })),
        });

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
          if (!cmr.items || cmr.items.length === 0) {
            logger.info(`CMR ${cmr.cmrNumber} has no items, skipping`);
            continue;
          }

          logger.info(`Processing CMR ${cmr.cmrNumber} with ${cmr.items.length} items`, {
            cmrItems: cmr.items.map((item) => ({
              description: item.description,
              orderItemId: item.orderItemId,
              orderId: item.orderId,
              orderNumber: item.orderNumber,
              quantity: item.quantity,
            })),
          });

          finalItems = finalItems.map((orderItem) => {
            const matchingCmrItems = findMatchingCmrItems(
                orderItem,
                cmr.items,
                orderId,
                orderData.orderNumber,
            );

            if (matchingCmrItems.length > 0) {
              logger.info(`Found ${matchingCmrItems.length} matches for order item`, {
                orderItemName: orderItem.name,
                orderItemId: orderItem.id,
                matches: matchingCmrItems.map((m) => m.description),
              });
            }

            if (matchingCmrItems.length > 0) {
              const totalQuantity = matchingCmrItems.reduce(
                  (sum, item) => sum + (parseFloat(item.quantity) || 0),
                  0,
              );
              const currentShipped = parseFloat(orderItem.shippedQuantity) || 0;

              const cmrHistory = orderItem.cmrHistory || [];
              const newHistoryEntries = matchingCmrItems.map((item) => {
                // Buduj obiekt bez undefined wartości
                const entry = {
                  cmrNumber: cmr.cmrNumber || "",
                  cmrId: cmr.id || "",
                  quantity: parseFloat(item.quantity) || 0,
                  unit: item.unit || "szt.",
                  shipmentDate: item.shipmentDate || cmr.shipmentDate || new Date().toISOString(),
                  orderItemId: item.orderItemId || orderItem.id || "",
                  description: item.description || "",
                };
                // Dodaj itemId tylko jeśli istnieje
                if (item.itemId) {
                  entry.itemId = item.itemId;
                }
                // Dodaj productId jeśli istnieje
                if (item.productId) {
                  entry.productId = item.productId;
                }
                return entry;
              });

              return {
                ...orderItem,
                shippedQuantity: currentShipped + totalQuantity,
                lastShipmentDate: cmr.shipmentDate || new Date().toISOString(),
                lastCmrNumber: cmr.cmrNumber,
                lastCmrId: cmr.id,
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
 * @param {string} orderId - ID zamówienia
 * @param {string} orderNumber - Numer zamówienia
 * @return {Array} Pasujące pozycje CMR
 */
function findMatchingCmrItems(orderItem, cmrItems, orderId, orderNumber) {
  const matches = [];

  for (const cmrItem of cmrItems) {
    const quantity = parseFloat(cmrItem.quantity) || parseFloat(cmrItem.numberOfPackages) || 0;
    if (quantity <= 0) continue;

    // Sprawdź czy pozycja CMR należy do tego zamówienia
    const belongsToThisOrder =
      cmrItem.orderId === orderId ||
      (!cmrItem.orderId && cmrItem.orderNumber === orderNumber);

    // 1. PRIORYTET: Dopasowanie przez orderItemId (najdokładniejsze)
    if (cmrItem.orderItemId && belongsToThisOrder) {
      // Jeśli CMR ma orderItemId - dopasuj TYLKO przez orderItemId
      // NIE używaj fallbacków (nazwy) dla pozycji z orderItemId
      if (cmrItem.orderItemId === orderItem.id) {
        matches.push(cmrItem);
      }
      // Niezależnie czy pasuje czy nie - przejdź do następnej pozycji CMR
      // (nie próbuj dopasować przez nazwę)
      continue;
    }

    // Jeśli pozycja CMR ma orderItemId ale dla innego zamówienia - pomiń
    if (cmrItem.orderItemId) {
      continue;
    }

    // Poniższe fallbacki TYLKO dla pozycji CMR BEZ orderItemId
    // (starsze CMR bez precyzyjnego powiązania)

    // 2. Dokładne dopasowanie nazwy
    if (orderItem.name && cmrItem.description &&
        orderItem.name.trim().toLowerCase() === cmrItem.description.trim().toLowerCase()) {
      matches.push(cmrItem);
      continue;
    }

    // 3. Dopasowanie przez ID produktu (productId)
    if (orderItem.productId && cmrItem.productId && orderItem.productId === cmrItem.productId) {
      matches.push(cmrItem);
      continue;
    }

    // 4. Normalizacja nazw i porównanie
    const normalizedOrderName = normalizeProductName(orderItem.name || "");
    const normalizedCmrName = normalizeProductName(cmrItem.description || "");

    if (normalizedOrderName && normalizedCmrName === normalizedOrderName) {
      matches.push(cmrItem);
      continue;
    }

    // 5. Częściowe dopasowanie (fallback)
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
