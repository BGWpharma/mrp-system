/**
 * Duplicate Detection Utility for Cloud Functions
 *
 * Checks for duplicate invoices after OCR processing.
 * Detects duplicates by:
 * 1. Invoice number + supplier tax ID (NIP)
 * 2. Invoice number + supplier name (fallback)
 * 3. Cross-PO: same invoice attached to different PO/CMR
 *
 * @module utils/duplicateDetection
 */

const logger = require("firebase-functions/logger");

const PURCHASE_COLLECTION = "purchaseInvoices";
const EXPENSE_COLLECTION = "expenseInvoices";

/**
 * Check for duplicate invoices across both collections
 *
 * @param {Object} db - Firestore database reference
 * @param {Object} params - Invoice params to check
 * @param {string} params.invoiceNumber - Invoice number from OCR
 * @param {string|null} params.supplierTaxId - Supplier NIP
 * @param {string} params.supplierName - Supplier name
 * @param {string} [params.excludeId] - ID to exclude (for retries)
 * @param {string} [params.excludeCollection] - Collection of excludeId
 * @return {Promise<Object>} Duplicate check result
 */
const checkForDuplicateInvoice = async (db, params) => {
  const {
    invoiceNumber, supplierTaxId, supplierName,
    excludeId, excludeCollection,
  } = params;

  // Skip check for empty/placeholder invoice numbers
  if (
    !invoiceNumber ||
    invoiceNumber === "PENDING_OCR" ||
    invoiceNumber === "UNKNOWN" ||
    invoiceNumber === ""
  ) {
    return {isDuplicate: false, duplicateType: "none"};
  }

  try {
    // Strategy 1: Check by invoiceNumber + supplier.taxId (most reliable)
    if (supplierTaxId) {
      // Check purchase invoices
      const purchaseTaxQuery = await db
          .collection(PURCHASE_COLLECTION)
          .where("invoiceNumber", "==", invoiceNumber)
          .where("supplier.taxId", "==", supplierTaxId)
          .limit(5)
          .get();

      for (const doc of purchaseTaxQuery.docs) {
        const isExcluded = excludeId &&
          excludeCollection === PURCHASE_COLLECTION &&
          doc.id === excludeId;
        if (isExcluded) continue;

        logger.info("[Duplicate] Dup by taxId in purchase", {
          existingId: doc.id, invoiceNumber,
        });
        return {
          isDuplicate: true,
          duplicateType: "invoice_number",
          existingInvoiceId: doc.id,
          existingCollection: PURCHASE_COLLECTION,
          message: `Faktura ${invoiceNumber} od NIP ` +
            `${supplierTaxId} - duplikat (zakupowe)`,
        };
      }

      // Check expense invoices
      const expenseTaxQuery = await db
          .collection(EXPENSE_COLLECTION)
          .where("invoiceNumber", "==", invoiceNumber)
          .where("supplier.taxId", "==", supplierTaxId)
          .limit(5)
          .get();

      for (const doc of expenseTaxQuery.docs) {
        const isExcluded = excludeId &&
          excludeCollection === EXPENSE_COLLECTION &&
          doc.id === excludeId;
        if (isExcluded) continue;

        logger.info("[Duplicate] Dup by taxId in expense", {
          existingId: doc.id, invoiceNumber,
        });
        return {
          isDuplicate: true,
          duplicateType: "invoice_number",
          existingInvoiceId: doc.id,
          existingCollection: EXPENSE_COLLECTION,
          message: `Faktura ${invoiceNumber} od NIP ` +
            `${supplierTaxId} - duplikat (kosztowe)`,
        };
      }
    }

    // Strategy 2: Fallback - check by name
    const validName = supplierName &&
      supplierName !== "Unknown" &&
      supplierName !== "Pending OCR...";

    if (validName) {
      const purchaseNameQuery = await db
          .collection(PURCHASE_COLLECTION)
          .where("invoiceNumber", "==", invoiceNumber)
          .where("supplier.name", "==", supplierName)
          .limit(5)
          .get();

      for (const doc of purchaseNameQuery.docs) {
        const isExcluded = excludeId &&
          excludeCollection === PURCHASE_COLLECTION &&
          doc.id === excludeId;
        if (isExcluded) continue;

        logger.info("[Duplicate] Dup by name in purchase", {
          existingId: doc.id, invoiceNumber,
        });
        return {
          isDuplicate: true,
          duplicateType: "invoice_number",
          existingInvoiceId: doc.id,
          existingCollection: PURCHASE_COLLECTION,
          message: `Faktura ${invoiceNumber} od ` +
            `${supplierName} - duplikat (zakupowe)`,
        };
      }

      const expenseNameQuery = await db
          .collection(EXPENSE_COLLECTION)
          .where("invoiceNumber", "==", invoiceNumber)
          .where("supplier.name", "==", supplierName)
          .limit(5)
          .get();

      for (const doc of expenseNameQuery.docs) {
        const isExcluded = excludeId &&
          excludeCollection === EXPENSE_COLLECTION &&
          doc.id === excludeId;
        if (isExcluded) continue;

        logger.info("[Duplicate] Dup by name in expense", {
          existingId: doc.id, invoiceNumber,
        });
        return {
          isDuplicate: true,
          duplicateType: "invoice_number",
          existingInvoiceId: doc.id,
          existingCollection: EXPENSE_COLLECTION,
          message: `Faktura ${invoiceNumber} od ` +
            `${supplierName} - duplikat (kosztowe)`,
        };
      }
    }

    return {isDuplicate: false, duplicateType: "none"};
  } catch (error) {
    logger.error("[Duplicate] Error checking for duplicates:", error);
    // Don't block invoice creation on duplicate check failure
    return {isDuplicate: false, duplicateType: "none", error: error.message};
  }
};

/**
 * Check if the same invoice is already attached to a different PO/CMR
 *
 * @param {Object} db - Firestore database reference
 * @param {string} invoiceNumber - Invoice number from OCR
 * @param {string|null} supplierTaxId - Supplier NIP
 * @param {string} currentSourceId - Current PO/CMR source ID
 * @param {string} [excludeId] - Document ID to exclude
 * @return {Promise<Object>} Cross-PO duplicate check result
 */
const checkCrossPoDuplicate = async (
    db, invoiceNumber, supplierTaxId,
    currentSourceId, excludeId,
) => {
  if (!invoiceNumber || invoiceNumber === "UNKNOWN" || invoiceNumber === "") {
    return {isDuplicate: false, duplicateType: "none"};
  }

  try {
    // Query purchase invoices with same invoice number
    let queryRef = db
        .collection(PURCHASE_COLLECTION)
        .where("invoiceNumber", "==", invoiceNumber);

    if (supplierTaxId) {
      queryRef = queryRef.where("supplier.taxId", "==", supplierTaxId);
    }

    const snapshot = await queryRef.limit(10).get();

    for (const doc of snapshot.docs) {
      if (doc.id === excludeId) continue;

      const data = doc.data();
      if (data.sourceId && data.sourceId !== currentSourceId) {
        logger.info("[Duplicate] Cross-PO duplicate found", {
          existingId: doc.id,
          existingSourceId: data.sourceId,
          currentSourceId,
          invoiceNumber,
        });
        return {
          isDuplicate: true,
          duplicateType: "cross_po",
          existingInvoiceId: doc.id,
          existingCollection: PURCHASE_COLLECTION,
          existingSourceId: data.sourceId,
          existingSourceType: data.sourceType,
          message: `Faktura ${invoiceNumber} przypisana do ` +
            `${(data.sourceType || "PO").toUpperCase()}` +
            `: ${data.sourceId}`,
        };
      }
    }

    return {isDuplicate: false, duplicateType: "none"};
  } catch (error) {
    logger.error("[Duplicate] Error checking cross-PO duplicate:", error);
    return {isDuplicate: false, duplicateType: "none", error: error.message};
  }
};

module.exports = {
  checkForDuplicateInvoice,
  checkCrossPoDuplicate,
};
