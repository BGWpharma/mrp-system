/**
 * Reservation Operations - Callable Cloud Functions
 * Atomowe operacje rezerwacji i konsumpcji materiałów
 *
 * DEPLOYMENT:
 * firebase deploy --only functions:bgw-mrp:bookMaterialForTask
 * firebase deploy --only functions:bgw-mrp:cancelMaterialBooking
 * firebase deploy --only functions:bgw-mrp:confirmMaterialConsumption
 *
 * REGION: europe-central2
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const { admin } = require("../config");
const { preciseAdd, preciseSubtract, preciseMultiply } = require("../utils/math");

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Formatuje ilość z określoną precyzją
 */
const formatQuantity = (value, precision = 3) => {
  if (typeof value !== "number" || isNaN(value)) return 0;
  return Math.round(value * Math.pow(10, precision)) / Math.pow(10, precision);
};

/**
 * Waliduje wymagane parametry
 */
const validateRequired = (data, requiredFields) => {
  const missing = requiredFields.filter((field) => !data[field]);
  if (missing.length > 0) {
    throw new HttpsError(
      "invalid-argument",
      `Brakujące wymagane pola: ${missing.join(", ")}`
    );
  }
};

/**
 * Waliduje ID dokumentu
 */
const validateId = (id, fieldName) => {
  if (!id || typeof id !== "string" || id.trim().length === 0) {
    throw new HttpsError("invalid-argument", `Nieprawidłowe ID: ${fieldName}`);
  }
  return id.trim();
};

/**
 * Waliduje ilość (musi być >= 0)
 */
const validateQuantity = (quantity, fieldName) => {
  const num = parseFloat(quantity);
  if (isNaN(num) || num < 0) {
    throw new HttpsError(
      "invalid-argument",
      `Nieprawidłowa ilość: ${fieldName} = ${quantity}`
    );
  }
  return formatQuantity(num);
};

// ============================================================================
// BOOK MATERIAL FOR TASK - Atomowa rezerwacja materiału
// ============================================================================

const bookMaterialForTask = onCall(
  {
    region: "europe-central2",
    memory: "512MiB",
    timeoutSeconds: 60,
  },
  async (request) => {
    // Sprawdź autentykację
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Wymagane zalogowanie");
    }

    const { itemId, quantity, taskId, batchId, reservationMethod = "fifo" } =
      request.data;
    const userId = request.auth.uid;

    // Walidacja parametrów
    validateRequired(request.data, ["itemId", "quantity", "taskId"]);
    const validatedItemId = validateId(itemId, "itemId");
    const validatedTaskId = validateId(taskId, "taskId");
    const validatedQuantity = validateQuantity(quantity, "quantity");
    const validatedBatchId = batchId ? validateId(batchId, "batchId") : null;

    logger.info("📦 bookMaterialForTask START", {
      itemId: validatedItemId,
      quantity: validatedQuantity,
      taskId: validatedTaskId,
      batchId: validatedBatchId,
      userId,
    });

    const db = admin.firestore();

    try {
      const result = await db.runTransaction(async (transaction) => {
        // ============================================================
        // KROK 1: Pobierz wszystkie potrzebne dokumenty (READ)
        // ============================================================
        const itemRef = db.collection("inventory").doc(validatedItemId);
        const taskRef = db.collection("productionTasks").doc(validatedTaskId);

        const [itemDoc, taskDoc] = await Promise.all([
          transaction.get(itemRef),
          transaction.get(taskRef),
        ]);

        // Walidacja istnienia dokumentów
        if (!itemDoc.exists) {
          throw new HttpsError(
            "not-found",
            `Pozycja magazynowa nie istnieje: ${validatedItemId}`
          );
        }

        if (!taskDoc.exists) {
          throw new HttpsError(
            "not-found",
            `Zadanie produkcyjne nie istnieje: ${validatedTaskId}`
          );
        }

        const item = { id: itemDoc.id, ...itemDoc.data() };
        const task = { id: taskDoc.id, ...taskDoc.data() };

        // ============================================================
        // KROK 2: Pobierz partie i oblicz dostępność
        // ============================================================
        let batchesToReserve = [];
        let selectedBatch = null;

        if (validatedBatchId) {
          // Ręczny wybór konkretnej partii
          const batchRef = db
            .collection("inventoryBatches")
            .doc(validatedBatchId);
          const batchDoc = await transaction.get(batchRef);

          if (!batchDoc.exists) {
            throw new HttpsError(
              "not-found",
              `Partia nie istnieje: ${validatedBatchId}`
            );
          }

          selectedBatch = { id: batchDoc.id, ...batchDoc.data() };

          // Sprawdź dostępność w partii
          const batchAvailable = formatQuantity(
            (selectedBatch.quantity || 0) - (selectedBatch.bookedQuantity || 0)
          );

          if (batchAvailable < validatedQuantity) {
            throw new HttpsError(
              "failed-precondition",
              `Niewystarczająca ilość w partii. ` +
                `Dostępne: ${batchAvailable} ${item.unit}, ` +
                `Wymagane: ${validatedQuantity} ${item.unit}`
            );
          }

          batchesToReserve.push({
            batchId: selectedBatch.id,
            batchNumber:
              selectedBatch.batchNumber ||
              selectedBatch.lotNumber ||
              "Bez numeru",
            quantity: validatedQuantity,
            batchRef,
          });
        } else {
          // Automatyczny wybór partii (FIFO/FEFO)
          const batchesQuery = db
            .collection("inventoryBatches")
            .where("itemId", "==", validatedItemId)
            .where("quantity", ">", 0);

          const batchesSnapshot = await transaction.get(batchesQuery);
          const batches = batchesSnapshot.docs.map((doc) => ({
            id: doc.id,
            ref: doc.ref,
            ...doc.data(),
          }));

          // Sortuj według metody rezerwacji
          if (reservationMethod === "fifo") {
            batches.sort((a, b) => {
              const dateA = a.receivedDate?.toDate?.() || new Date(0);
              const dateB = b.receivedDate?.toDate?.() || new Date(0);
              return dateA - dateB;
            });
          } else {
            // FEFO - według daty ważności
            batches.sort((a, b) => {
              const dateA = a.expiryDate?.toDate?.() || new Date(9999, 11, 31);
              const dateB = b.expiryDate?.toDate?.() || new Date(9999, 11, 31);
              return dateA - dateB;
            });
          }

          // Przydziel partie
          let remainingQuantity = validatedQuantity;

          for (const batch of batches) {
            if (remainingQuantity <= 0) break;

            const batchAvailable = formatQuantity(
              (batch.quantity || 0) - (batch.bookedQuantity || 0)
            );

            if (batchAvailable <= 0) continue;

            const quantityFromBatch = Math.min(batchAvailable, remainingQuantity);
            remainingQuantity = preciseSubtract(remainingQuantity, quantityFromBatch);

            batchesToReserve.push({
              batchId: batch.id,
              batchNumber: batch.batchNumber || batch.lotNumber || "Bez numeru",
              quantity: formatQuantity(quantityFromBatch),
              batchRef: batch.ref,
            });
          }

          if (remainingQuantity > 0) {
            throw new HttpsError(
              "failed-precondition",
              `Niewystarczająca ilość materiału ${item.name}. ` +
                `Brakuje: ${formatQuantity(remainingQuantity)} ${item.unit}`
            );
          }
        }

        // ============================================================
        // KROK 3: Wykonaj wszystkie zapisy atomowo (WRITE)
        // ============================================================

        // 3.1 Aktualizuj bookedQuantity w pozycji magazynowej
        const currentBookedQuantity = item.bookedQuantity || 0;
        const newBookedQuantity = formatQuantity(
          preciseAdd(currentBookedQuantity, validatedQuantity)
        );

        transaction.update(itemRef, {
          bookedQuantity: newBookedQuantity,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: userId,
        });

        // 3.2 Aktualizuj bookedQuantity w każdej partii
        for (const batch of batchesToReserve) {
          const batchDoc = await transaction.get(batch.batchRef);
          const batchData = batchDoc.data();
          const currentBatchBooked = batchData.bookedQuantity || 0;

          transaction.update(batch.batchRef, {
            bookedQuantity: formatQuantity(
              preciseAdd(currentBatchBooked, batch.quantity)
            ),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        // 3.3 Utwórz transakcje rezerwacji dla każdej partii
        for (const batch of batchesToReserve) {
          const transactionRef = db.collection("inventoryTransactions").doc();

          transaction.set(transactionRef, {
            itemId: validatedItemId,
            itemName: item.name,
            quantity: batch.quantity,
            type: "booking",
            reason: "Zadanie produkcyjne",
            referenceId: validatedTaskId,
            taskId: validatedTaskId,
            taskName: task.name || "",
            taskNumber: task.moNumber || task.number || "",
            clientName: task.clientName || "",
            clientId: task.clientId || "",
            batchId: batch.batchId,
            batchNumber: batch.batchNumber,
            notes: `Zarezerwowano na zadanie MO: ${task.moNumber || validatedTaskId}`,
            status: "active",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: userId,
          });
        }

        // 3.4 Aktualizuj materialBatches w zadaniu produkcyjnym
        const materialBatches = task.materialBatches || {};
        const existingBatches = materialBatches[validatedItemId] || [];

        // Dodaj nowe partie lub aktualizuj istniejące
        for (const batch of batchesToReserve) {
          const existingIndex = existingBatches.findIndex(
            (b) => b.batchId === batch.batchId
          );

          if (existingIndex >= 0) {
            existingBatches[existingIndex].quantity = formatQuantity(
              preciseAdd(existingBatches[existingIndex].quantity, batch.quantity)
            );
          } else {
            existingBatches.push({
              batchId: batch.batchId,
              batchNumber: batch.batchNumber,
              quantity: batch.quantity,
            });
          }
        }

        materialBatches[validatedItemId] = existingBatches;

        transaction.update(taskRef, {
          materialBatches,
          materialsReserved: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: userId,
        });

        logger.info("✅ bookMaterialForTask SUCCESS", {
          itemId: validatedItemId,
          taskId: validatedTaskId,
          reservedBatches: batchesToReserve.length,
          totalQuantity: validatedQuantity,
        });

        return {
          success: true,
          message: `Zarezerwowano ${validatedQuantity} ${item.unit} materiału ${item.name}`,
          reservedBatches: batchesToReserve.map((b) => ({
            batchId: b.batchId,
            batchNumber: b.batchNumber,
            quantity: b.quantity,
          })),
          totalQuantity: validatedQuantity,
        };
      });

      return result;
    } catch (error) {
      logger.error("❌ bookMaterialForTask ERROR", {
        error: error.message,
        code: error.code,
        itemId: validatedItemId,
        taskId: validatedTaskId,
      });

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "internal",
        `Błąd rezerwacji materiału: ${error.message}`
      );
    }
  }
);

// ============================================================================
// CANCEL MATERIAL BOOKING - Atomowe anulowanie rezerwacji
// ============================================================================

const cancelMaterialBooking = onCall(
  {
    region: "europe-central2",
    memory: "512MiB",
    timeoutSeconds: 60,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Wymagane zalogowanie");
    }

    const { itemId, taskId, batchId, quantity } = request.data;
    const userId = request.auth.uid;

    validateRequired(request.data, ["itemId", "taskId"]);
    const validatedItemId = validateId(itemId, "itemId");
    const validatedTaskId = validateId(taskId, "taskId");
    const validatedBatchId = batchId ? validateId(batchId, "batchId") : null;
    const validatedQuantity = quantity
      ? validateQuantity(quantity, "quantity")
      : null;

    logger.info("🚫 cancelMaterialBooking START", {
      itemId: validatedItemId,
      taskId: validatedTaskId,
      batchId: validatedBatchId,
      quantity: validatedQuantity,
      userId,
    });

    const db = admin.firestore();

    try {
      const result = await db.runTransaction(async (transaction) => {
        // ============================================================
        // KROK 1: Pobierz rezerwacje do anulowania
        // ============================================================
        let reservationsQuery = db
          .collection("inventoryTransactions")
          .where("itemId", "==", validatedItemId)
          .where("referenceId", "==", validatedTaskId)
          .where("type", "==", "booking");

        if (validatedBatchId) {
          reservationsQuery = reservationsQuery.where(
            "batchId",
            "==",
            validatedBatchId
          );
        }

        const reservationsSnapshot = await transaction.get(reservationsQuery);

        if (reservationsSnapshot.empty) {
          logger.warn("Brak rezerwacji do anulowania");
          return {
            success: true,
            message: "Brak rezerwacji do anulowania",
            cancelledQuantity: 0,
          };
        }

        // ============================================================
        // KROK 2: Oblicz ilość do anulowania
        // ============================================================
        let totalToCancel = 0;
        const reservationsToCancel = [];
        const batchQuantities = {}; // batchId -> quantity

        for (const doc of reservationsSnapshot.docs) {
          const data = doc.data();

          // Pomiń już anulowane lub completed
          if (data.status === "cancelled" || data.status === "completed") {
            continue;
          }

          const reservationQty = parseFloat(data.quantity) || 0;
          totalToCancel = preciseAdd(totalToCancel, reservationQty);

          reservationsToCancel.push({
            ref: doc.ref,
            data,
          });

          // Grupuj ilości po partiach
          if (data.batchId) {
            batchQuantities[data.batchId] = preciseAdd(
              batchQuantities[data.batchId] || 0,
              reservationQty
            );
          }
        }

        // Jeśli podano konkretną ilość, ogranicz
        if (validatedQuantity !== null && validatedQuantity < totalToCancel) {
          totalToCancel = validatedQuantity;
        }

        // ============================================================
        // KROK 3: Pobierz i zaktualizuj pozycję magazynową
        // ============================================================
        const itemRef = db.collection("inventory").doc(validatedItemId);
        const itemDoc = await transaction.get(itemRef);

        if (!itemDoc.exists) {
          throw new HttpsError("not-found", "Pozycja magazynowa nie istnieje");
        }

        const item = itemDoc.data();
        const currentBookedQuantity = item.bookedQuantity || 0;
        const newBookedQuantity = formatQuantity(
          Math.max(0, preciseSubtract(currentBookedQuantity, totalToCancel))
        );

        transaction.update(itemRef, {
          bookedQuantity: newBookedQuantity,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: userId,
        });

        // ============================================================
        // KROK 4: Zaktualizuj partie
        // ============================================================
        for (const [batchId, qty] of Object.entries(batchQuantities)) {
          const batchRef = db.collection("inventoryBatches").doc(batchId);
          const batchDoc = await transaction.get(batchRef);

          if (batchDoc.exists) {
            const batchData = batchDoc.data();
            const currentBatchBooked = batchData.bookedQuantity || 0;
            const newBatchBooked = formatQuantity(
              Math.max(0, preciseSubtract(currentBatchBooked, qty))
            );

            transaction.update(batchRef, {
              bookedQuantity: newBatchBooked,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        }

        // ============================================================
        // KROK 5: Oznacz rezerwacje jako anulowane
        // ============================================================
        for (const reservation of reservationsToCancel) {
          transaction.update(reservation.ref, {
            status: "cancelled",
            cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
            cancelledBy: userId,
            cancelReason: "Anulowanie rezerwacji przez użytkownika",
          });
        }

        // ============================================================
        // KROK 6: Zaktualizuj zadanie produkcyjne
        // ============================================================
        const taskRef = db.collection("productionTasks").doc(validatedTaskId);
        const taskDoc = await transaction.get(taskRef);

        if (taskDoc.exists) {
          const task = taskDoc.data();
          const materialBatches = task.materialBatches || {};

          if (validatedBatchId && materialBatches[validatedItemId]) {
            // Usuń konkretną partię
            materialBatches[validatedItemId] = materialBatches[
              validatedItemId
            ].filter((b) => b.batchId !== validatedBatchId);

            if (materialBatches[validatedItemId].length === 0) {
              delete materialBatches[validatedItemId];
            }
          } else if (!validatedBatchId) {
            // Usuń wszystkie partie dla tego materiału
            delete materialBatches[validatedItemId];
          }

          const hasAnyReservations = Object.keys(materialBatches).length > 0;

          transaction.update(taskRef, {
            materialBatches,
            materialsReserved: hasAnyReservations,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: userId,
          });
        }

        // ============================================================
        // KROK 7: Utwórz transakcję anulowania
        // ============================================================
        const cancelTransactionRef = db.collection("inventoryTransactions").doc();
        transaction.set(cancelTransactionRef, {
          itemId: validatedItemId,
          type: "booking_cancel",
          quantity: totalToCancel,
          referenceId: validatedTaskId,
          notes: "Anulowanie rezerwacji",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          createdBy: userId,
        });

        logger.info("✅ cancelMaterialBooking SUCCESS", {
          itemId: validatedItemId,
          taskId: validatedTaskId,
          cancelledQuantity: totalToCancel,
          cancelledReservations: reservationsToCancel.length,
        });

        return {
          success: true,
          message: `Anulowano rezerwację ${formatQuantity(totalToCancel)} ${item.unit}`,
          cancelledQuantity: formatQuantity(totalToCancel),
          cancelledReservations: reservationsToCancel.length,
        };
      });

      return result;
    } catch (error) {
      logger.error("❌ cancelMaterialBooking ERROR", {
        error: error.message,
        itemId: validatedItemId,
        taskId: validatedTaskId,
      });

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "internal",
        `Błąd anulowania rezerwacji: ${error.message}`
      );
    }
  }
);

// ============================================================================
// CONFIRM MATERIAL CONSUMPTION - Atomowa konsumpcja materiałów
// ============================================================================

const confirmMaterialConsumption = onCall(
  {
    region: "europe-central2",
    memory: "1GiB",
    timeoutSeconds: 120,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Wymagane zalogowanie");
    }

    const { taskId, consumptionData } = request.data;
    const userId = request.auth.uid;

    validateRequired(request.data, ["taskId"]);
    const validatedTaskId = validateId(taskId, "taskId");

    logger.info("🔥 confirmMaterialConsumption START", {
      taskId: validatedTaskId,
      userId,
      consumptionDataProvided: !!consumptionData,
    });

    const db = admin.firestore();

    try {
      const result = await db.runTransaction(async (transaction) => {
        // ============================================================
        // KROK 1: Pobierz zadanie produkcyjne
        // ============================================================
        const taskRef = db.collection("productionTasks").doc(validatedTaskId);
        const taskDoc = await transaction.get(taskRef);

        if (!taskDoc.exists) {
          throw new HttpsError("not-found", "Zadanie produkcyjne nie istnieje");
        }

        const task = { id: taskDoc.id, ...taskDoc.data() };

        if (task.materialConsumptionConfirmed) {
          throw new HttpsError(
            "failed-precondition",
            "Zużycie materiałów zostało już potwierdzone"
          );
        }

        const materials = task.materials || [];
        const materialBatches = task.materialBatches || {};
        const actualUsage = task.actualMaterialUsage || {};
        const batchActualUsage = task.batchActualUsage || {};

        // Merge z przekazanymi danymi konsumpcji
        if (consumptionData) {
          Object.assign(actualUsage, consumptionData.materialUsage || {});
          Object.assign(batchActualUsage, consumptionData.batchUsage || {});
        }

        const consumedMaterials = [];
        const usedBatches = {};
        const errors = [];

        // ============================================================
        // KROK 2: Przetwórz każdy materiał
        // ============================================================
        for (const material of materials) {
          const materialId = material.id;
          const inventoryMaterialId = material.inventoryItemId || materialId;

          // Oblicz ilość do skonsumowania
          let consumedQuantity =
            actualUsage[materialId] !== undefined
              ? parseFloat(actualUsage[materialId])
              : parseFloat(material.quantity);

          consumedQuantity = formatQuantity(consumedQuantity);

          if (consumedQuantity <= 0) {
            logger.info(`Pomijam materiał ${material.name} - zużycie = 0`);
            continue;
          }

          // Pobierz pozycję magazynową
          const itemRef = db.collection("inventory").doc(inventoryMaterialId);
          const itemDoc = await transaction.get(itemRef);

          if (!itemDoc.exists) {
            errors.push(`Pozycja magazynowa nie istnieje: ${material.name}`);
            continue;
          }

          const item = itemDoc.data();

          // Pobierz przypisane partie
          const assignedBatches = materialBatches[inventoryMaterialId] || [];
          const batchesToConsume = [];
          let remainingToConsume = consumedQuantity;

          if (assignedBatches.length > 0) {
            // Użyj przypisanych partii
            for (const batch of assignedBatches) {
              if (remainingToConsume <= 0) break;

              const batchKey = `${inventoryMaterialId}_${batch.batchId}`;
              let batchQuantity =
                batchActualUsage[batchKey] !== undefined
                  ? parseFloat(batchActualUsage[batchKey])
                  : parseFloat(batch.quantity);

              batchQuantity = formatQuantity(
                Math.min(batchQuantity, remainingToConsume)
              );

              if (batchQuantity <= 0) continue;

              // Pobierz partię
              const batchRef = db
                .collection("inventoryBatches")
                .doc(batch.batchId);
              const batchDoc = await transaction.get(batchRef);

              if (!batchDoc.exists) {
                errors.push(`Partia nie istnieje: ${batch.batchNumber}`);
                continue;
              }

              const batchData = batchDoc.data();

              batchesToConsume.push({
                batchId: batch.batchId,
                batchNumber: batch.batchNumber,
                quantity: batchQuantity,
                batchRef,
                batchData,
                unitPrice: batchData.unitPrice || 0,
              });

              remainingToConsume = preciseSubtract(
                remainingToConsume,
                batchQuantity
              );
            }
          } else {
            // Automatyczny wybór partii (FIFO)
            const batchesQuery = db
              .collection("inventoryBatches")
              .where("itemId", "==", inventoryMaterialId)
              .where("quantity", ">", 0);

            const batchesSnapshot = await transaction.get(batchesQuery);

            const batches = batchesSnapshot.docs
              .map((doc) => ({
                id: doc.id,
                ref: doc.ref,
                ...doc.data(),
              }))
              .sort((a, b) => {
                const dateA = a.receivedDate?.toDate?.() || new Date(0);
                const dateB = b.receivedDate?.toDate?.() || new Date(0);
                return dateA - dateB;
              });

            for (const batch of batches) {
              if (remainingToConsume <= 0) break;

              const availableQty = batch.quantity || 0;
              const batchQuantity = formatQuantity(
                Math.min(availableQty, remainingToConsume)
              );

              if (batchQuantity <= 0) continue;

              batchesToConsume.push({
                batchId: batch.id,
                batchNumber: batch.batchNumber || batch.lotNumber || "Bez numeru",
                quantity: batchQuantity,
                batchRef: batch.ref,
                batchData: batch,
                unitPrice: batch.unitPrice || 0,
              });

              remainingToConsume = preciseSubtract(
                remainingToConsume,
                batchQuantity
              );
            }
          }

          if (remainingToConsume > 0) {
            throw new HttpsError(
              "failed-precondition",
              `Niewystarczająca ilość materiału "${material.name}". ` +
                `Brakuje: ${formatQuantity(remainingToConsume)} ${item.unit}`
            );
          }

          // ============================================================
          // KROK 3: Aktualizuj partie i utwórz transakcje
          // ============================================================
          for (const batch of batchesToConsume) {
            // Odejmij ilość z partii
            const newBatchQuantity = formatQuantity(
              Math.max(0, preciseSubtract(batch.batchData.quantity, batch.quantity))
            );

            // Odejmij z bookedQuantity partii
            const currentBatchBooked = batch.batchData.bookedQuantity || 0;
            const newBatchBooked = formatQuantity(
              Math.max(0, preciseSubtract(currentBatchBooked, batch.quantity))
            );

            transaction.update(batch.batchRef, {
              quantity: newBatchQuantity,
              bookedQuantity: newBatchBooked,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // Utwórz transakcję wydania
            const issueTransactionRef = db
              .collection("inventoryTransactions")
              .doc();

            transaction.set(issueTransactionRef, {
              itemId: inventoryMaterialId,
              itemName: material.name,
              type: "issue",
              quantity: batch.quantity,
              date: admin.firestore.FieldValue.serverTimestamp(),
              reason: "Zużycie w produkcji",
              reference: `Zadanie: ${task.name || validatedTaskId}`,
              batchId: batch.batchId,
              batchNumber: batch.batchNumber,
              notes: `Materiał zużyty w zadaniu: ${task.moNumber || validatedTaskId}`,
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
              createdBy: userId,
              category: material.category || "-",
            });

            // Zapisz do consumedMaterials
            consumedMaterials.push({
              materialId: inventoryMaterialId,
              materialName: material.name,
              batchId: batch.batchId,
              batchNumber: batch.batchNumber,
              quantity: batch.quantity,
              unitPrice: batch.unitPrice,
              cost: preciseMultiply(batch.quantity, batch.unitPrice),
              consumedAt: new Date().toISOString(),
              consumedBy: userId,
            });
          }

          usedBatches[inventoryMaterialId] = batchesToConsume.map((b) => ({
            batchId: b.batchId,
            batchNumber: b.batchNumber,
            quantity: b.quantity,
          }));

          // ============================================================
          // KROK 4: Aktualizuj pozycję magazynową
          // ============================================================
          // Przelicz ilość na podstawie partii (suma partii)
          const allBatchesQuery = db
            .collection("inventoryBatches")
            .where("itemId", "==", inventoryMaterialId);
          const allBatchesSnapshot = await transaction.get(allBatchesQuery);

          let newItemQuantity = 0;
          let newBookedQuantity = 0;

          allBatchesSnapshot.docs.forEach((doc) => {
            const data = doc.data();
            // Uwzględnij aktualizacje w tej transakcji
            const batchConsumed = batchesToConsume.find(
              (b) => b.batchId === doc.id
            );

            if (batchConsumed) {
              newItemQuantity += formatQuantity(
                Math.max(
                  0,
                  preciseSubtract(data.quantity, batchConsumed.quantity)
                )
              );
              newBookedQuantity += formatQuantity(
                Math.max(
                  0,
                  preciseSubtract(
                    data.bookedQuantity || 0,
                    batchConsumed.quantity
                  )
                )
              );
            } else {
              newItemQuantity += data.quantity || 0;
              newBookedQuantity += data.bookedQuantity || 0;
            }
          });

          transaction.update(itemRef, {
            quantity: formatQuantity(newItemQuantity),
            bookedQuantity: formatQuantity(newBookedQuantity),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: userId,
          });
        }

        // ============================================================
        // KROK 5: Oznacz rezerwacje jako completed
        // ============================================================
        const reservationsQuery = db
          .collection("inventoryTransactions")
          .where("referenceId", "==", validatedTaskId)
          .where("type", "==", "booking");

        const reservationsSnapshot = await transaction.get(reservationsQuery);

        for (const doc of reservationsSnapshot.docs) {
          transaction.update(doc.ref, {
            status: "completed",
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        // ============================================================
        // KROK 6: Zaktualizuj zadanie produkcyjne
        // ============================================================
        const totalMaterialCost = consumedMaterials.reduce(
          (sum, cm) => preciseAdd(sum, cm.cost || 0),
          0
        );

        transaction.update(taskRef, {
          materialConsumptionConfirmed: true,
          materialConsumptionDate: admin.firestore.FieldValue.serverTimestamp(),
          materialConsumptionBy: userId,
          usedBatches,
          consumedMaterials,
          totalMaterialCost: formatQuantity(totalMaterialCost, 4),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedBy: userId,
        });

        logger.info("✅ confirmMaterialConsumption SUCCESS", {
          taskId: validatedTaskId,
          consumedMaterialsCount: consumedMaterials.length,
          totalMaterialCost,
          errors: errors.length,
        });

        return {
          success: true,
          message: "Zużycie materiałów zostało potwierdzone",
          consumedMaterials,
          totalMaterialCost: formatQuantity(totalMaterialCost, 4),
          usedBatches,
          errors: errors.length > 0 ? errors : undefined,
        };
      });

      return result;
    } catch (error) {
      logger.error("❌ confirmMaterialConsumption ERROR", {
        error: error.message,
        taskId: validatedTaskId,
        stack: error.stack,
      });

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "internal",
        `Błąd potwierdzania konsumpcji: ${error.message}`
      );
    }
  }
);

module.exports = {
  bookMaterialForTask,
  cancelMaterialBooking,
  confirmMaterialConsumption,
};

