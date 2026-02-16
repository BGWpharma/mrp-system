/**
 * Proforma Matching Service
 *
 * Automatically matches incoming VAT invoices with existing proforma invoices.
 * Used during OCR processing to link proforma payments to final invoices.
 *
 * Matching strategies (in order of confidence):
 * 1. Referenced proforma number extracted by OCR (confidence: 0.99)
 * 2. Same PO sourceId + supplier + amount ±2% (confidence: 0.95)
 * 3. Same supplier NIP + amount ±2% (confidence: 0.80)
 *
 * @module utils/proformaMatchingService
 */

const logger = require("firebase-functions/logger");
const {admin} = require("../config");

const PURCHASE_COLLECTION = "purchaseInvoices";
const EXPENSE_COLLECTION = "expenseInvoices";

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Normalize invoice number for fuzzy comparison.
 * Removes separators, normalizes prefixes, uppercases.
 * "PF 001/2026" → "PF0012026"
 * "PF/001/2026" → "PF0012026"
 * "Proforma-001/2026" → "PF0012026"
 *
 * @param {string} num - Invoice number
 * @return {string} Normalized number
 */
const normalizeInvoiceNumber = (num) => {
  if (!num) return "";
  return num
      .toUpperCase()
      .replace(/^(PROFORMA|PROFAKTURA|PRO[\s-]?FORMA|INVOICE\s*PROFORMA)\s*/, "PF")
      .replace(/[\s\-_./\\,;:]+/g, "")
      .trim();
};

/**
 * Calculate amount tolerance for matching.
 * 2% of amount, but capped at 100 (EUR/PLN), minimum 0.01
 *
 * @param {number} amount - Invoice gross amount
 * @return {number} Tolerance value
 */
const calculateTolerance = (amount) => {
  if (!amount || amount <= 0) return 0.01;
  const percentage = amount * 0.02; // 2%
  return Math.max(Math.min(percentage, 100), 0.01);
};

/**
 * Check if two amounts match within tolerance.
 *
 * @param {number} amount1 - First amount
 * @param {number} amount2 - Second amount
 * @return {boolean} True if amounts match within tolerance
 */
const amountsMatch = (amount1, amount2) => {
  const tolerance = calculateTolerance(Math.max(amount1, amount2));
  return Math.abs(amount1 - amount2) <= tolerance;
};

/**
 * Check if a proforma is available for linking (not already fully linked).
 *
 * @param {Object} proformaData - Proforma document data
 * @return {boolean} True if proforma can be linked
 */
const isProformaAvailable = (proformaData) => {
  // Check if proforma has remaining unsettled amount
  const totalGross = proformaData.summary?.totalGross || 0;
  const totalUsed = proformaData.totalUsedAsSettlement || 0;

  if (totalUsed >= totalGross - 0.01) {
    // Proforma is fully settled
    return false;
  }

  return true;
};

/**
 * Get the amount available for settlement from a proforma.
 *
 * @param {Object} proformaData - Proforma document data
 * @return {number} Amount available for settlement
 */
const getAvailableSettlementAmount = (proformaData) => {
  const totalGross = proformaData.summary?.totalGross || 0;
  const totalUsed = proformaData.totalUsedAsSettlement || 0;
  return Math.max(0, totalGross - totalUsed);
};

/**
 * Calculate payment status based on invoice amounts and payments.
 *
 * @param {number} grossAmount - Total gross amount of invoice
 * @param {number} directPayments - Sum of direct payments
 * @param {number} settledFromProformas - Sum settled from proformas
 * @param {Date|null} dueDate - Invoice due date
 * @return {string} Payment status
 */
const calculatePaymentStatus = (grossAmount, directPayments, settledFromProformas, dueDate) => {
  const totalCovered = (directPayments || 0) + (settledFromProformas || 0);

  if (totalCovered >= grossAmount - 0.01) return "paid";
  if (totalCovered > 0.01) return "partially_paid";

  if (dueDate) {
    const dueDateObj = dueDate instanceof Date ? dueDate : new Date(dueDate);
    if (dueDateObj < new Date()) return "overdue";
  }

  return "unpaid";
};

// ============================================================================
// MATCHING STRATEGIES
// ============================================================================

/**
 * STRATEGY A: Match by referenced proforma number from OCR.
 * Highest confidence (0.99) - OCR extracted a proforma reference from the VAT invoice.
 *
 * @param {Object} db - Firestore database reference
 * @param {string} referencedNumber - Proforma number referenced on VAT invoice
 * @param {string} collectionName - Firestore collection to search
 * @param {string|null} excludeId - Document ID to exclude
 * @return {Promise<Object>} Match result
 */
const matchByReferencedNumber = async (db, referencedNumber, collectionName, excludeId = null) => {
  if (!referencedNumber) return {matched: false};

  const normalizedRef = normalizeInvoiceNumber(referencedNumber);
  if (!normalizedRef) return {matched: false};

  try {
    // Get all proformas from the collection (including posted advances)
    const proformasQuery = await db
        .collection(collectionName)
        .where("isProforma", "==", true)
        .where("status", "in", ["proforma", "proforma_posted"])
        .get();

    for (const doc of proformasQuery.docs) {
      if (doc.id === excludeId) continue;

      const data = doc.data();
      if (!isProformaAvailable(data)) continue;

      const normalizedInvoiceNum = normalizeInvoiceNumber(data.invoiceNumber);
      if (normalizedInvoiceNum === normalizedRef) {
        logger.info("[ProformaMatch] Strategy A: Matched by referenced number", {
          proformaId: doc.id,
          proformaNumber: data.invoiceNumber,
          referencedNumber,
        });

        return {
          matched: true,
          proformaId: doc.id,
          proformaNumber: data.invoiceNumber,
          proformaGross: data.summary?.totalGross || 0,
          availableAmount: getAvailableSettlementAmount(data),
          matchMethod: "referenced_on_invoice",
          confidence: 0.99,
          autoLink: true,
        };
      }
    }

    return {matched: false};
  } catch (error) {
    logger.error("[ProformaMatch] Strategy A error:", error);
    return {matched: false, error: error.message};
  }
};

/**
 * STRATEGY B: Match by same PO sourceId + similar amount.
 * High confidence (0.95) - same purchase order, similar amounts.
 * Only applicable for purchase invoices (which have sourceId).
 *
 * @param {Object} db - Firestore database reference
 * @param {string} sourceId - PO/CMR source ID
 * @param {number} grossAmount - Gross amount of incoming invoice
 * @param {string|null} excludeId - Document ID to exclude
 * @return {Promise<Object>} Match result
 */
const matchBySameSource = async (db, sourceId, grossAmount, excludeId = null) => {
  if (!sourceId || !grossAmount) return {matched: false};

  try {
    const proformasQuery = await db
        .collection(PURCHASE_COLLECTION)
        .where("sourceId", "==", sourceId)
        .where("isProforma", "==", true)
        .where("status", "in", ["proforma", "proforma_posted"])
        .get();

    const candidates = [];

    for (const doc of proformasQuery.docs) {
      if (doc.id === excludeId) continue;

      const data = doc.data();
      if (!isProformaAvailable(data)) continue;

      const proformaGross = data.summary?.totalGross || 0;
      if (amountsMatch(proformaGross, grossAmount)) {
        candidates.push({
          proformaId: doc.id,
          proformaNumber: data.invoiceNumber,
          proformaGross,
          availableAmount: getAvailableSettlementAmount(data),
          amountDiff: Math.abs(proformaGross - grossAmount),
        });
      }
    }

    if (candidates.length === 0) return {matched: false};

    // If exactly 1 match → autoLink
    if (candidates.length === 1) {
      const best = candidates[0];
      logger.info("[ProformaMatch] Strategy B: Matched by same source + amount", {
        proformaId: best.proformaId,
        proformaNumber: best.proformaNumber,
        sourceId,
      });

      return {
        matched: true,
        proformaId: best.proformaId,
        proformaNumber: best.proformaNumber,
        proformaGross: best.proformaGross,
        availableAmount: best.availableAmount,
        matchMethod: "same_po_amount",
        confidence: 0.95,
        autoLink: true,
      };
    }

    // Multiple matches → suggest best (lowest amount diff), no autoLink
    candidates.sort((a, b) => a.amountDiff - b.amountDiff);
    const best = candidates[0];

    logger.info("[ProformaMatch] Strategy B: Multiple candidates, suggesting best", {
      candidateCount: candidates.length,
      bestProformaId: best.proformaId,
      sourceId,
    });

    return {
      matched: true,
      proformaId: best.proformaId,
      proformaNumber: best.proformaNumber,
      proformaGross: best.proformaGross,
      availableAmount: best.availableAmount,
      matchMethod: "same_po_amount",
      confidence: 0.85, // Lowered due to ambiguity
      autoLink: false,
      multipleCandidates: candidates.length,
    };
  } catch (error) {
    logger.error("[ProformaMatch] Strategy B error:", error);
    return {matched: false, error: error.message};
  }
};

/**
 * STRATEGY C: Match by supplier NIP + similar amount.
 * Medium confidence (0.80) - same supplier, similar amounts.
 * Never autoLinks - always a suggestion for the user.
 *
 * @param {Object} db - Firestore database reference
 * @param {string} supplierTaxId - Supplier NIP/VAT ID
 * @param {number} grossAmount - Gross amount of incoming invoice
 * @param {string} collectionName - Firestore collection to search
 * @param {string|null} excludeId - Document ID to exclude
 * @return {Promise<Object>} Match result
 */
const matchBySupplierAndAmount = async (
    db, supplierTaxId, grossAmount, collectionName, excludeId = null,
) => {
  if (!supplierTaxId || !grossAmount) return {matched: false};

  try {
    const proformasQuery = await db
        .collection(collectionName)
        .where("supplier.taxId", "==", supplierTaxId)
        .where("isProforma", "==", true)
        .where("status", "in", ["proforma", "proforma_posted"])
        .get();

    const candidates = [];

    for (const doc of proformasQuery.docs) {
      if (doc.id === excludeId) continue;

      const data = doc.data();
      if (!isProformaAvailable(data)) continue;

      const proformaGross = data.summary?.totalGross || 0;
      if (amountsMatch(proformaGross, grossAmount)) {
        candidates.push({
          proformaId: doc.id,
          proformaNumber: data.invoiceNumber,
          proformaGross,
          availableAmount: getAvailableSettlementAmount(data),
          amountDiff: Math.abs(proformaGross - grossAmount),
        });
      }
    }

    if (candidates.length === 0) return {matched: false};

    // Sort by smallest difference
    candidates.sort((a, b) => a.amountDiff - b.amountDiff);
    const best = candidates[0];

    logger.info("[ProformaMatch] Strategy C: Matched by supplier NIP + amount", {
      proformaId: best.proformaId,
      proformaNumber: best.proformaNumber,
      supplierTaxId,
      candidateCount: candidates.length,
    });

    return {
      matched: true,
      proformaId: best.proformaId,
      proformaNumber: best.proformaNumber,
      proformaGross: best.proformaGross,
      availableAmount: best.availableAmount,
      matchMethod: "supplier_nip_amount",
      confidence: candidates.length === 1 ? 0.80 : 0.70,
      autoLink: false, // Never autoLink by NIP only
      multipleCandidates: candidates.length,
    };
  } catch (error) {
    logger.error("[ProformaMatch] Strategy C error:", error);
    return {matched: false, error: error.message};
  }
};

// ============================================================================
// MAIN MATCHING FUNCTIONS
// ============================================================================

/**
 * Match a new/incoming purchase invoice (from PO/CMR OCR) with existing proformas.
 *
 * Runs strategies in order: A → B → C. Returns first match found.
 * Only strategies with confidence >= 0.95 will autoLink.
 *
 * @param {Object} db - Firestore database reference
 * @param {Object} ocrData - Normalized OCR data from Gemini
 * @param {Object} sourceInfo - Source tracking info { type, id }
 * @param {string|null} excludeId - Document ID to exclude (for retry)
 * @return {Promise<Object>} Match result
 */
const matchProformaForPurchaseInvoice = async (db, ocrData, sourceInfo, excludeId = null) => {
  const {checkIfProforma} = require("./ocrService");

  // Don't match if document itself is a proforma
  if (checkIfProforma(ocrData)) {
    return {matched: false, reason: "document_is_proforma"};
  }

  const grossAmount = ocrData.summary?.totalGross || 0;
  const supplierTaxId = ocrData.supplier?.taxId || null;

  logger.info("[ProformaMatch] Starting purchase invoice matching", {
    invoiceNumber: ocrData.invoiceNumber,
    grossAmount,
    supplierTaxId,
    sourceId: sourceInfo?.id,
    referencedProforma: ocrData.referencedProformaNumber || null,
  });

  // Strategy A: Referenced proforma number
  if (ocrData.referencedProformaNumber) {
    const resultA = await matchByReferencedNumber(
        db, ocrData.referencedProformaNumber, PURCHASE_COLLECTION, excludeId,
    );
    if (resultA.matched) return resultA;
  }

  // Strategy B: Same PO + amount
  if (sourceInfo?.id) {
    const resultB = await matchBySameSource(
        db, sourceInfo.id, grossAmount, excludeId,
    );
    if (resultB.matched) return resultB;
  }

  // Strategy C: Supplier NIP + amount
  if (supplierTaxId) {
    const resultC = await matchBySupplierAndAmount(
        db, supplierTaxId, grossAmount, PURCHASE_COLLECTION, excludeId,
    );
    if (resultC.matched) return resultC;
  }

  logger.info("[ProformaMatch] No proforma match found for purchase invoice", {
    invoiceNumber: ocrData.invoiceNumber,
  });

  return {matched: false};
};

/**
 * Match a new/incoming expense invoice with existing proformas.
 *
 * For expense invoices, never autoLink - always suggest.
 * Only strategies A and C apply (no sourceId on expense invoices).
 *
 * @param {Object} db - Firestore database reference
 * @param {Object} ocrData - Normalized OCR data from Gemini
 * @param {string|null} excludeId - Document ID to exclude (for retry)
 * @return {Promise<Object>} Match result
 */
const matchProformaForExpenseInvoice = async (db, ocrData, excludeId = null) => {
  const {checkIfProforma} = require("./ocrService");

  if (checkIfProforma(ocrData)) {
    return {matched: false, reason: "document_is_proforma"};
  }

  const grossAmount = ocrData.summary?.totalGross || 0;
  const supplierTaxId = ocrData.supplier?.taxId || null;

  logger.info("[ProformaMatch] Starting expense invoice matching", {
    invoiceNumber: ocrData.invoiceNumber,
    grossAmount,
    supplierTaxId,
    referencedProforma: ocrData.referencedProformaNumber || null,
  });

  // Strategy A: Referenced proforma number
  if (ocrData.referencedProformaNumber) {
    const resultA = await matchByReferencedNumber(
        db, ocrData.referencedProformaNumber, EXPENSE_COLLECTION, excludeId,
    );
    if (resultA.matched) {
      // Override autoLink to false for expense invoices
      resultA.autoLink = false;
      return resultA;
    }
  }

  // Strategy C: Supplier NIP + amount (no Strategy B - no sourceId)
  if (supplierTaxId) {
    const resultC = await matchBySupplierAndAmount(
        db, supplierTaxId, grossAmount, EXPENSE_COLLECTION, excludeId,
    );
    if (resultC.matched) return resultC;
  }

  logger.info("[ProformaMatch] No proforma match found for expense invoice", {
    invoiceNumber: ocrData.invoiceNumber,
  });

  return {matched: false};
};

// ============================================================================
// LINKING FUNCTIONS
// ============================================================================

/**
 * Link a proforma to a final VAT invoice (atomic operation using transaction).
 *
 * Updates both documents:
 * - Proforma: adds to linkedFinalInvoices[], updates totalUsedAsSettlement
 * - VAT Invoice: adds to proformaSettlements[], updates settledFromProformas, paymentStatus
 *
 * @param {Object} db - Firestore database reference
 * @param {string} collectionName - Firestore collection
 * @param {string} proformaId - Proforma document ID
 * @param {string} invoiceId - VAT invoice document ID
 * @param {string} invoiceNumber - VAT invoice number (for display)
 * @param {number|null} settlementAmount - Amount to settle
 *   (null = use proforma total paid or gross)
 * @return {Promise<Object>} Link result
 */
const linkProformaToInvoice = async (
    db, collectionName, proformaId, invoiceId, invoiceNumber, settlementAmount = null,
) => {
  try {
    const result = await db.runTransaction(async (transaction) => {
      const proformaRef = db.collection(collectionName).doc(proformaId);
      const invoiceRef = db.collection(collectionName).doc(invoiceId);

      const proformaDoc = await transaction.get(proformaRef);
      const invoiceDoc = await transaction.get(invoiceRef);

      if (!proformaDoc.exists) {
        throw new Error(`Proforma ${proformaId} not found`);
      }
      if (!invoiceDoc.exists) {
        throw new Error(`Invoice ${invoiceId} not found`);
      }

      const proformaData = proformaDoc.data();
      const invoiceData = invoiceDoc.data();

      // Determine settlement amount
      // Priority: explicit amount > proforma totalPaid > proforma gross
      const proformaGross = proformaData.summary?.totalGross || 0;
      const proformaPaid = proformaData.totalPaid || 0;
      const available = getAvailableSettlementAmount(proformaData);
      const amount = settlementAmount ||
        Math.min(proformaPaid > 0 ? proformaPaid : proformaGross, available);

      if (amount <= 0) {
        throw new Error("No amount available for settlement");
      }

      // Update PROFORMA
      const existingLinked = proformaData.linkedFinalInvoices || [];
      // Check if already linked to this invoice
      if (existingLinked.some((l) => l.invoiceId === invoiceId)) {
        throw new Error(`Proforma already linked to invoice ${invoiceId}`);
      }

      const updatedLinked = [...existingLinked, {
        invoiceId,
        invoiceNumber,
        settledAmount: amount,
      }];
      const updatedTotalUsed = (proformaData.totalUsedAsSettlement || 0) + amount;

      transaction.update(proformaRef, {
        linkedFinalInvoices: updatedLinked,
        totalUsedAsSettlement: updatedTotalUsed,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Update VAT INVOICE
      const existingSettlements = invoiceData.proformaSettlements || [];
      const updatedSettlements = [...existingSettlements, {
        proformaInvoiceId: proformaId,
        proformaNumber: proformaData.invoiceNumber,
        amount,
        currency: proformaData.currency || invoiceData.currency || "EUR",
      }];
      const updatedSettledFrom =
        (invoiceData.settledFromProformas || 0) + amount;

      // Recalculate payment status
      const invoiceGross = invoiceData.summary?.totalGross || 0;
      const directPayments = (invoiceData.payments || [])
          .reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
      const dueDate = invoiceData.dueDate ?
        (invoiceData.dueDate.toDate ?
          invoiceData.dueDate.toDate() :
          new Date(invoiceData.dueDate)) :
        null;
      const newPaymentStatus = calculatePaymentStatus(
          invoiceGross, directPayments,
          updatedSettledFrom, dueDate,
      );

      transaction.update(invoiceRef, {
        proformaSettlements: updatedSettlements,
        settledFromProformas: updatedSettledFrom,
        paymentStatus: newPaymentStatus,
        // Clear suggestion if it was auto-confirmed
        suggestedProformaMatch: null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        amount,
        proformaNumber: proformaData.invoiceNumber,
        newPaymentStatus,
      };
    });

    logger.info("[ProformaMatch] ✅ Successfully linked proforma to invoice", {
      proformaId,
      invoiceId,
      amount: result.amount,
      newPaymentStatus: result.newPaymentStatus,
    });

    return result;
  } catch (error) {
    logger.error("[ProformaMatch] ❌ Error linking proforma to invoice", {
      error: error.message,
      proformaId,
      invoiceId,
    });
    return {success: false, error: error.message};
  }
};

/**
 * Unlink a proforma from a final VAT invoice.
 * Reverses the linkProformaToInvoice operation.
 *
 * @param {Object} db - Firestore database reference
 * @param {string} collectionName - Firestore collection
 * @param {string} proformaId - Proforma document ID
 * @param {string} invoiceId - VAT invoice document ID
 * @return {Promise<Object>} Unlink result
 */
const unlinkProformaFromInvoice = async (db, collectionName, proformaId, invoiceId) => {
  try {
    await db.runTransaction(async (transaction) => {
      const proformaRef = db.collection(collectionName).doc(proformaId);
      const invoiceRef = db.collection(collectionName).doc(invoiceId);

      const proformaDoc = await transaction.get(proformaRef);
      const invoiceDoc = await transaction.get(invoiceRef);

      if (proformaDoc.exists) {
        const proformaData = proformaDoc.data();
        const existingLinked =
          proformaData.linkedFinalInvoices || [];
        const linkToRemove = existingLinked
            .find((l) => l.invoiceId === invoiceId);
        const amountToReverse =
          linkToRemove?.settledAmount || 0;

        const updatedLinked = existingLinked
            .filter((l) => l.invoiceId !== invoiceId);
        const updatedTotalUsed = Math.max(
            0,
            (proformaData.totalUsedAsSettlement || 0) -
              amountToReverse,
        );

        transaction.update(proformaRef, {
          linkedFinalInvoices: updatedLinked,
          totalUsedAsSettlement: updatedTotalUsed,
          updatedAt:
            admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      if (invoiceDoc.exists) {
        const invoiceData = invoiceDoc.data();
        const existingSettlements =
          invoiceData.proformaSettlements || [];
        const settlementToRemove = existingSettlements
            .find((s) => s.proformaInvoiceId === proformaId);
        const amountToReverse =
          settlementToRemove?.amount || 0;

        const updatedSettlements = existingSettlements
            .filter(
                (s) => s.proformaInvoiceId !== proformaId,
            );
        const updatedSettledFrom = Math.max(
            0,
            (invoiceData.settledFromProformas || 0) -
              amountToReverse,
        );

        // Recalculate payment status
        const invoiceGross =
          invoiceData.summary?.totalGross || 0;
        const directPayments = (invoiceData.payments || [])
            .reduce(
                (sum, p) => sum + (parseFloat(p.amount) || 0),
                0,
            );
        const dueDate = invoiceData.dueDate ?
          (invoiceData.dueDate.toDate ?
            invoiceData.dueDate.toDate() :
            new Date(invoiceData.dueDate)) :
          null;
        const newPaymentStatus = calculatePaymentStatus(
            invoiceGross, directPayments,
            updatedSettledFrom, dueDate,
        );

        transaction.update(invoiceRef, {
          proformaSettlements: updatedSettlements,
          settledFromProformas: updatedSettledFrom,
          paymentStatus: newPaymentStatus,
          updatedAt:
            admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    });

    logger.info(
        "[ProformaMatch] Unlinked proforma from invoice",
        {proformaId, invoiceId},
    );

    return {success: true};
  } catch (error) {
    logger.error(
        "[ProformaMatch] Error unlinking proforma",
        {error: error.message, proformaId, invoiceId},
    );
    return {success: false, error: error.message};
  }
};

/**
 * Unlink ALL proformas from an invoice (used before OCR retry).
 *
 * @param {Object} db - Firestore database reference
 * @param {string} collectionName - Firestore collection
 * @param {string} invoiceId - Invoice document ID
 * @return {Promise<void>}
 */
const unlinkAllProformasFromInvoice = async (db, collectionName, invoiceId) => {
  try {
    const invoiceRef = db.collection(collectionName).doc(invoiceId);
    const invoiceDoc = await invoiceRef.get();

    if (!invoiceDoc.exists) return;

    const invoiceData = invoiceDoc.data();
    const settlements = invoiceData.proformaSettlements || [];

    // Unlink each proforma
    for (const settlement of settlements) {
      await unlinkProformaFromInvoice(
          db, collectionName, settlement.proformaInvoiceId, invoiceId,
      );
    }

    logger.info("[ProformaMatch] Unlinked all proformas from invoice", {
      invoiceId,
      count: settlements.length,
    });
  } catch (error) {
    logger.error("[ProformaMatch] Error unlinking all proformas", {
      error: error.message,
      invoiceId,
    });
  }
};

module.exports = {
  normalizeInvoiceNumber,
  calculateTolerance,
  amountsMatch,
  calculatePaymentStatus,
  isProformaAvailable,
  getAvailableSettlementAmount,
  matchProformaForPurchaseInvoice,
  matchProformaForExpenseInvoice,
  linkProformaToInvoice,
  unlinkProformaFromInvoice,
  unlinkAllProformasFromInvoice,
};
