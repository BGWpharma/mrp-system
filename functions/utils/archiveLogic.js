/**
 * Współdzielona logika automatycznej archiwizacji
 * Używana przez scheduled/autoArchive.js i callable/runAutoArchive.js
 */

const logger = require("firebase-functions/logger");
const {admin} = require("../config");

const BATCH_WRITE_LIMIT = 500;

/**
 * Commituje batch writes w porcjach po 500
 * @param {FirebaseFirestore.Firestore} db - instancja Firestore
 * @param {Array} updates - lista aktualizacji {ref, data}
 * @return {number} liczba zatwierdzonych dokumentów
 */
async function commitInBatches(db, updates) {
  const chunks = [];
  for (let i = 0; i < updates.length; i += BATCH_WRITE_LIMIT) {
    chunks.push(updates.slice(i, i + BATCH_WRITE_LIMIT));
  }

  let totalCommitted = 0;
  for (const chunk of chunks) {
    const batch = db.batch();
    for (const {ref, data} of chunk) {
      batch.update(ref, data);
    }
    await batch.commit();
    totalCommitted += chunk.length;
  }
  return totalCommitted;
}

/**
 * Archiwizuje nieaktualizowane dokumenty we wszystkich kolekcjach
 * @return {Object} podsumowanie archiwizacji
 */
async function executeAutoArchive() {
  logger.info("executeAutoArchive - start");

  const db = admin.firestore();
  const now = new Date();
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const cutoff = admin.firestore.Timestamp.fromDate(oneYearAgo);

  const archiveData = {
    archived: true,
    archivedAt: admin.firestore.FieldValue.serverTimestamp(),
    archivedBy: "autoArchive",
  };

  const summary = {
    orders: 0,
    purchaseOrders: 0,
    tasks: 0,
    batches: 0,
    inventoryItems: 0,
    errors: [],
  };

  // ── 1. CO "Rozliczone" ──
  try {
    const snap = await db.collection("orders")
        .where("status", "==", "Rozliczone")
        .where("updatedAt", "<=", cutoff)
        .get();

    const updates = [];
    for (const doc of snap.docs) {
      if (doc.data().archived === true) continue;
      updates.push({ref: doc.ref, data: archiveData});
    }
    if (updates.length > 0) {
      await commitInBatches(db, updates);
      summary.orders = updates.length;
      logger.info(`Zarchiwizowano ${updates.length} zamówień klienta`);
    }
  } catch (err) {
    logger.error("Błąd archiwizacji CO:", err);
    summary.errors.push(`CO: ${err.message}`);
  }

  // ── 2. PO "completed" / "delivered" ──
  try {
    const statuses = ["completed", "delivered"];
    const allUpdates = [];

    for (const status of statuses) {
      const snap = await db.collection("purchaseOrders")
          .where("status", "==", status)
          .where("updatedAt", "<=", cutoff)
          .get();

      for (const doc of snap.docs) {
        if (doc.data().archived === true) continue;
        allUpdates.push({ref: doc.ref, data: archiveData});
      }
    }

    if (allUpdates.length > 0) {
      await commitInBatches(db, allUpdates);
      summary.purchaseOrders = allUpdates.length;
      logger.info(
          `Zarchiwizowano ${allUpdates.length} zamówień zakupu`,
      );
    }
  } catch (err) {
    logger.error("Błąd archiwizacji PO:", err);
    summary.errors.push(`PO: ${err.message}`);
  }

  // ── 3. MO "Zakończone" ──
  try {
    const snap = await db.collection("tasks")
        .where("status", "==", "Zakończone")
        .where("updatedAt", "<=", cutoff)
        .get();

    const updates = [];
    for (const doc of snap.docs) {
      if (doc.data().archived === true) continue;
      updates.push({ref: doc.ref, data: archiveData});
    }
    if (updates.length > 0) {
      await commitInBatches(db, updates);
      summary.tasks = updates.length;
      logger.info(
          `Zarchiwizowano ${updates.length} zleceń produkcyjnych`,
      );
    }
  } catch (err) {
    logger.error("Błąd archiwizacji MO:", err);
    summary.errors.push(`MO: ${err.message}`);
  }

  // ── 4. Puste partie (quantity == 0) ──
  try {
    const snap = await db.collection("inventoryBatches")
        .where("quantity", "==", 0)
        .where("updatedAt", "<=", cutoff)
        .get();

    const updates = [];
    for (const doc of snap.docs) {
      if (doc.data().archived === true) continue;
      updates.push({ref: doc.ref, data: archiveData});
    }
    if (updates.length > 0) {
      await commitInBatches(db, updates);
      summary.batches = updates.length;
      logger.info(`Zarchiwizowano ${updates.length} pustych partii`);
    }
  } catch (err) {
    logger.error("Błąd archiwizacji partii:", err);
    summary.errors.push(`Batches: ${err.message}`);
  }

  // ── 5. Pozycje magazynowe (wszystkie partie mają quantity == 0) ──
  try {
    const itemsSnap = await db.collection("inventoryItems")
        .where("updatedAt", "<=", cutoff)
        .get();

    const nonZeroBatchItems = new Set();
    const nonZeroSnap = await db.collection("inventoryBatches")
        .where("quantity", ">", 0)
        .select("itemId")
        .get();

    for (const doc of nonZeroSnap.docs) {
      const itemId = doc.data().itemId;
      if (itemId) nonZeroBatchItems.add(itemId);
    }

    const updates = [];
    for (const doc of itemsSnap.docs) {
      if (doc.data().archived === true) continue;
      if (nonZeroBatchItems.has(doc.id)) continue;
      updates.push({ref: doc.ref, data: archiveData});
    }

    if (updates.length > 0) {
      await commitInBatches(db, updates);
      summary.inventoryItems = updates.length;
      logger.info(
          `Zarchiwizowano ${updates.length} pozycji magazynowych`,
      );
    }
  } catch (err) {
    logger.error("Błąd archiwizacji pozycji magazynowych:", err);
    summary.errors.push(`InventoryItems: ${err.message}`);
  }

  // ── Zapis podsumowania ──
  const totalArchived = summary.orders + summary.purchaseOrders +
      summary.tasks + summary.batches + summary.inventoryItems;

  try {
    await db.collection("_archiveLogs").add({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      summary,
      totalArchived,
      cutoffDate: oneYearAgo.toISOString(),
    });
  } catch (err) {
    logger.error("Błąd zapisu logu archiwizacji:", err);
  }

  logger.info("executeAutoArchive - zakończono", {
    totalArchived,
    summary,
  });

  return {success: true, totalArchived, summary};
}

module.exports = {executeAutoArchive};
