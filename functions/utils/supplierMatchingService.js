/**
 * Supplier Matching Service
 *
 * Automatically enriches supplier data based on OCR-extracted invoice information.
 * Uses a "fill empty fields only" strategy - never overwrites existing data.
 *
 * MATCHING STRATEGY:
 * 1. Primary: supplierId from Purchase Order (direct link)
 * 2. Secondary: NIP/taxId match across suppliers collection
 *
 * UPDATED FIELDS (only if currently empty in supplier):
 * - taxId (NIP)
 * - vatEu
 * - email
 * - phone
 * - bankAccount
 * - addresses (adds new address from invoice if no addresses exist)
 *
 * @module utils/supplierMatchingService
 */

const logger = require("firebase-functions/logger");

/**
 * Normalize NIP/taxId for comparison
 * Removes spaces, dashes, and country prefix (PL)
 * @param {string} taxId - Raw tax ID
 * @return {string|null} Normalized tax ID or null
 */
const normalizeTaxId = (taxId) => {
  if (!taxId || typeof taxId !== "string") return null;
  return taxId.replace(/[\s\-.]/g, "").replace(/^PL/i, "").trim() || null;
};

/**
 * Find supplier by supplierId from a Purchase Order
 * @param {Object} db - Firestore database reference
 * @param {string} orderId - Purchase Order ID
 * @return {Promise<Object|null>} Supplier document data with ID, or null
 */
const findSupplierByPO = async (db, orderId) => {
  try {
    const poDoc = await db.collection("purchaseOrders").doc(orderId).get();
    if (!poDoc.exists) {
      logger.warn("[Supplier Match] PO not found", {orderId});
      return null;
    }

    const supplierId = poDoc.data()?.supplierId;
    if (!supplierId) {
      logger.info("[Supplier Match] PO has no supplierId", {orderId});
      return null;
    }

    const supplierDoc = await db.collection("suppliers").doc(supplierId).get();
    if (!supplierDoc.exists) {
      logger.warn("[Supplier Match] Supplier not found", {supplierId});
      return null;
    }

    return {id: supplierDoc.id, ...supplierDoc.data()};
  } catch (error) {
    logger.error("[Supplier Match] Error finding supplier by PO", {
      orderId,
      error: error.message,
    });
    return null;
  }
};

/**
 * Find supplier by CMR document (via linked PO or supplier reference)
 * @param {Object} db - Firestore database reference
 * @param {string} cmrId - CMR document ID
 * @return {Promise<Object|null>} Supplier document data with ID, or null
 */
const findSupplierByCMR = async (db, cmrId) => {
  try {
    const cmrDoc = await db.collection("cmrDocuments").doc(cmrId).get();
    if (!cmrDoc.exists) {
      logger.info("[Supplier Match] CMR not found", {cmrId});
      return null;
    }

    const cmrData = cmrDoc.data();

    // Try direct supplier reference
    if (cmrData.supplierId) {
      const supplierDoc = await db
          .collection("suppliers")
          .doc(cmrData.supplierId)
          .get();
      if (supplierDoc.exists) {
        return {id: supplierDoc.id, ...supplierDoc.data()};
      }
    }

    // Try through linked PO
    if (cmrData.purchaseOrderId) {
      return findSupplierByPO(db, cmrData.purchaseOrderId);
    }

    return null;
  } catch (error) {
    logger.error("[Supplier Match] Error finding supplier by CMR", {
      cmrId,
      error: error.message,
    });
    return null;
  }
};

/**
 * Find supplier by NIP/taxId across all suppliers
 * @param {Object} db - Firestore database reference
 * @param {string} taxId - Tax ID from OCR
 * @return {Promise<Object|null>} Supplier document data with ID, or null
 */
const findSupplierByTaxId = async (db, taxId) => {
  const normalizedTaxId = normalizeTaxId(taxId);
  if (!normalizedTaxId) return null;

  try {
    // Try exact match first
    const exactQuery = await db
        .collection("suppliers")
        .where("taxId", "==", normalizedTaxId)
        .limit(1)
        .get();

    if (!exactQuery.empty) {
      const doc = exactQuery.docs[0];
      return {id: doc.id, ...doc.data()};
    }

    // Try with original format (might have dashes/spaces)
    const originalQuery = await db
        .collection("suppliers")
        .where("taxId", "==", taxId)
        .limit(1)
        .get();

    if (!originalQuery.empty) {
      const doc = originalQuery.docs[0];
      return {id: doc.id, ...doc.data()};
    }

    return null;
  } catch (error) {
    logger.error("[Supplier Match] Error finding supplier by taxId", {
      taxId,
      error: error.message,
    });
    return null;
  }
};

/**
 * Build address object from OCR supplier data
 * @param {Object} ocrSupplier - OCR supplier data with structured address
 * @return {Object|null} Address object compatible with supplier schema, or null
 */
const buildAddressFromOcr = (ocrSupplier) => {
  const addr = ocrSupplier?.address;
  if (!addr) return null;

  // Handle string address (legacy)
  if (typeof addr === "string") {
    if (!addr.trim()) return null;
    return {
      id: `ocr_${Date.now()}`,
      name: "Adres z faktury (OCR)",
      street: addr.trim(),
      city: "",
      postalCode: "",
      country: "Polska",
      isMain: true,
    };
  }

  // Handle structured address
  if (typeof addr === "object") {
    const hasData = addr.street || addr.city || addr.postalCode;
    if (!hasData) return null;

    return {
      id: `ocr_${Date.now()}`,
      name: "Adres z faktury (OCR)",
      street: addr.street || "",
      city: addr.city || "",
      postalCode: addr.postalCode || "",
      country: addr.country || "Polska",
      isMain: true,
    };
  }

  return null;
};

/**
 * Compare OCR data with existing supplier and determine updates
 * Only fills empty/missing fields - never overwrites existing data
 *
 * @param {Object} existingSupplier - Current supplier data from Firestore
 * @param {Object} ocrData - Normalized OCR data (full invoice data)
 * @return {Object} Object with { updates, updatedFields } or empty if no changes
 */
const determineSupplierUpdates = (existingSupplier, ocrData) => {
  const updates = {};
  const updatedFields = [];
  const ocrSupplier = ocrData.supplier || {};

  // --- taxId (NIP) ---
  if (!existingSupplier.taxId && ocrSupplier.taxId) {
    const normalizedTaxId = normalizeTaxId(ocrSupplier.taxId);
    if (normalizedTaxId) {
      updates.taxId = normalizedTaxId;
      updatedFields.push("taxId");
    }
  }

  // --- vatEu ---
  if (!existingSupplier.vatEu && ocrSupplier.vatEu) {
    updates.vatEu = ocrSupplier.vatEu.trim();
    updatedFields.push("vatEu");
  }

  // --- email ---
  if (!existingSupplier.email && ocrSupplier.email) {
    updates.email = ocrSupplier.email.trim();
    updatedFields.push("email");
  }

  // --- phone ---
  if (!existingSupplier.phone && ocrSupplier.phone) {
    updates.phone = ocrSupplier.phone.trim();
    updatedFields.push("phone");
  }

  // --- bankAccount ---
  if (!existingSupplier.bankAccount && ocrData.bankAccount) {
    updates.bankAccount = ocrData.bankAccount.trim();
    updatedFields.push("bankAccount");
  }

  // --- addresses (add only if supplier has no addresses) ---
  const existingAddresses = existingSupplier.addresses || [];
  if (existingAddresses.length === 0) {
    const ocrAddress = buildAddressFromOcr(ocrSupplier);
    if (ocrAddress) {
      updates.addresses = [ocrAddress];
      updatedFields.push("addresses");
    }
  }

  return {updates, updatedFields};
};

/**
 * Match supplier and update with OCR data
 *
 * Main entry point - called from OCR triggers after invoice processing.
 *
 * @param {Object} db - Firestore database reference
 * @param {Object} ocrData - Normalized OCR data
 * @param {Object} sourceInfo - Source info { type: 'po'|'cmr', id: string }
 * @return {Promise<Object>} Result: { matched, updated, supplierId, updatedFields }
 */
const matchAndUpdateSupplier = async (db, ocrData, sourceInfo) => {
  const result = {
    matched: false,
    updated: false,
    supplierId: null,
    updatedFields: [],
    matchMethod: null,
  };

  try {
    let supplier = null;

    // Strategy 1: Find supplier through source document (PO or CMR)
    if (sourceInfo.type === "po" && sourceInfo.id) {
      supplier = await findSupplierByPO(db, sourceInfo.id);
      if (supplier) {
        result.matchMethod = "po_link";
      }
    } else if (sourceInfo.type === "cmr" && sourceInfo.id) {
      supplier = await findSupplierByCMR(db, sourceInfo.id);
      if (supplier) {
        result.matchMethod = "cmr_link";
      }
    }

    // Strategy 2: If no direct link, try matching by NIP/taxId from OCR
    if (!supplier && ocrData.supplier?.taxId) {
      supplier = await findSupplierByTaxId(db, ocrData.supplier.taxId);
      if (supplier) {
        result.matchMethod = "tax_id";
      }
    }

    if (!supplier) {
      logger.info("[Supplier Match] No matching supplier found", {
        sourceType: sourceInfo.type,
        sourceId: sourceInfo.id,
        ocrSupplierName: ocrData.supplier?.name,
        ocrTaxId: ocrData.supplier?.taxId,
      });
      return result;
    }

    result.matched = true;
    result.supplierId = supplier.id;

    logger.info("[Supplier Match] Supplier matched", {
      supplierId: supplier.id,
      supplierName: supplier.name,
      matchMethod: result.matchMethod,
    });

    // Determine what needs to be updated
    const {updates, updatedFields} = determineSupplierUpdates(
        supplier,
        ocrData,
    );

    if (updatedFields.length === 0) {
      logger.info("[Supplier Match] No empty fields to fill", {
        supplierId: supplier.id,
      });
      return result;
    }

    // Apply updates
    const admin = require("firebase-admin");
    await db.collection("suppliers").doc(supplier.id).update({
      ...updates,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: "cloud_function_ocr",
      lastOcrEnrichment: {
        date: admin.firestore.FieldValue.serverTimestamp(),
        sourceType: sourceInfo.type,
        sourceId: sourceInfo.id,
        updatedFields: updatedFields,
        invoiceNumber: ocrData.invoiceNumber || null,
      },
    });

    result.updated = true;
    result.updatedFields = updatedFields;

    logger.info("[Supplier Match] ✅ Supplier enriched from OCR", {
      supplierId: supplier.id,
      supplierName: supplier.name,
      updatedFields,
      sourceType: sourceInfo.type,
      sourceId: sourceInfo.id,
      invoiceNumber: ocrData.invoiceNumber,
    });

    return result;
  } catch (error) {
    // Non-critical - log error but don't throw
    logger.error("[Supplier Match] ❌ Error matching/updating supplier", {
      error: error.message,
      sourceType: sourceInfo.type,
      sourceId: sourceInfo.id,
    });
    return result;
  }
};

module.exports = {
  matchAndUpdateSupplier,
  findSupplierByPO,
  findSupplierByCMR,
  findSupplierByTaxId,
  normalizeTaxId,
  determineSupplierUpdates,
  buildAddressFromOcr,
};
