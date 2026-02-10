/**
 * Invoice OCR Cloud Functions
 *
 * Automatically processes invoice attachments using Gemini Vision OCR
 * and creates purchaseInvoices documents for BGW-Accounting.
 *
 * TRIGGERS:
 * 1. onInvoiceAttachmentUploaded - Storage trigger for PO invoices
 * 2. onCmrInvoiceCreated - Firestore trigger for CMR invoices
 *
 * DEPLOYMENT:
 * firebase deploy --only functions:bgw-mrp:onInvoiceAttachmentUploaded
 * firebase deploy --only functions:bgw-mrp:onCmrInvoiceCreated
 *
 * @module triggers/invoiceOcr
 */

const {onObjectFinalized, onObjectDeleted} = require("firebase-functions/v2/storage");
const {onDocumentCreated, onDocumentDeleted} = require("firebase-functions/v2/firestore");
const {defineSecret} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const {admin} = require("../config");
const {
  callGeminiVision,
  normalizeOcrResult,
  SUPPORTED_MIME_TYPES,
} = require("../utils/ocrService");
const {convertToPLN} = require("../utils/exchangeRates");
const {checkForDuplicateInvoice, checkCrossPoDuplicate} = require("../utils/duplicateDetection");
const {matchAndUpdateSupplier} = require("../utils/supplierMatchingService");
const {
  matchProformaForPurchaseInvoice,
  linkProformaToInvoice,
  unlinkAllProformasFromInvoice,
} = require("../utils/proformaMatchingService");

// Define secret for Gemini API key
const geminiApiKey = defineSecret("GEMINI_API_KEY");

// Storage bucket name
const STORAGE_BUCKET = "bgw-mrp-system.firebasestorage.app";

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Download file from Storage and convert to base64
 * @param {Object} bucket - Storage bucket reference
 * @param {string} filePath - Path to file in Storage
 * @return {Promise<string>} Base64 encoded file data
 */
const getFileAsBase64 = async (bucket, filePath) => {
  const file = bucket.file(filePath);
  const [buffer] = await file.download();
  return buffer.toString("base64");
};

/**
 * Get signed download URL for file
 * @param {Object} bucket - Storage bucket reference
 * @param {string} filePath - Path to file in Storage
 * @return {Promise<string>} Signed URL
 */
const getSignedUrl = async (bucket, filePath) => {
  const file = bucket.file(filePath);
  const [url] = await file.getSignedUrl({
    action: "read",
    expires: "03-01-2500", // Long-lived URL
  });
  return url;
};

/**
 * Get content type from file extension
 * @param {string} fileName - File name
 * @return {string} MIME type
 */
const getContentTypeFromFileName = (fileName) => {
  const ext = fileName.toLowerCase().split(".").pop();
  const types = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };
  return types[ext] || "application/octet-stream";
};

/**
 * Create purchaseInvoice document in Firestore
 * @param {Object} db - Firestore database reference
 * @param {Object} ocrData - Normalized OCR data
 * @param {Object} sourceInfo - Source tracking info
 * @return {Promise<string>} Created document ID
 */
const createPurchaseInvoice = async (db, ocrData, sourceInfo) => {
  // Get exchange rate if currency is not PLN
  let exchangeRateData = null;
  const totalGross = ocrData.summary?.totalGross || 0;

  if (ocrData.currency && ocrData.currency !== "PLN") {
    try {
      logger.info(`[OCR] Fetching exchange rate for ${ocrData.currency}`);
      const invoiceDate = ocrData.invoiceDate ? new Date(ocrData.invoiceDate) : new Date();
      // Polish tax law (Art. 31a VAT): use NBP rate from day BEFORE invoice date
      const rateDateForNBP = new Date(invoiceDate);
      rateDateForNBP.setDate(rateDateForNBP.getDate() - 1);
      exchangeRateData = await convertToPLN(totalGross, ocrData.currency, rateDateForNBP);
      logger.info(`[OCR] Rate: ${exchangeRateData.rate}, Total in PLN: ${exchangeRateData.amountInPLN.toFixed(2)}`);
    } catch (error) {
      logger.error(`[OCR] Failed to fetch exchange rate for ${ocrData.currency}:`, error);
      // Continue without exchange rate
    }
  }

  // Check if document is a proforma
  const {checkIfProforma} = require("../utils/ocrService");
  const isProforma = checkIfProforma(ocrData);

  // DUPLICATE DETECTION - check by invoice number + supplier
  // Applies to ALL documents including proformas
  let duplicateResult = {isDuplicate: false};
  let crossPoResult = {isDuplicate: false};

  duplicateResult = await checkForDuplicateInvoice(db, {
    invoiceNumber: ocrData.invoiceNumber,
    supplierTaxId: ocrData.supplier?.taxId || null,
    supplierName: ocrData.supplier?.name || "",
  });

  // Also check cross-PO duplicate
  if (!duplicateResult.isDuplicate && sourceInfo.id) {
    crossPoResult = await checkCrossPoDuplicate(
        db,
        ocrData.invoiceNumber,
        ocrData.supplier?.taxId || null,
        sourceInfo.id,
    );
  }

  const isDuplicate = duplicateResult.isDuplicate ||
    crossPoResult.isDuplicate;
  const duplicateInfo = duplicateResult.isDuplicate ?
    duplicateResult : crossPoResult;

  if (isDuplicate) {
    logger.warn("[OCR] ⚠️ Duplicate detected", {
      invoiceNumber: ocrData.invoiceNumber,
      isProforma,
      duplicateType: duplicateInfo.duplicateType,
      existingId: duplicateInfo.existingInvoiceId,
      message: duplicateInfo.message,
    });
  }

  // AUTO-REJECT: duplicates (both regular invoices and proformas)
  const shouldAutoReject = isDuplicate;
  let autoRejectReason = null;
  if (isDuplicate) {
    const docLabel = isProforma ? "proformy" : "faktury";
    autoRejectReason = "Automatycznie odrzucone: " +
      `Duplikat ${docLabel}. ` +
      (duplicateInfo.message || "");
  }

  // PROFORMA MATCHING - if this is a VAT invoice, try to find matching proforma
  let proformaMatch = {matched: false};
  if (!isProforma && !shouldAutoReject) {
    try {
      proformaMatch = await matchProformaForPurchaseInvoice(db, ocrData, sourceInfo);
      if (proformaMatch.matched) {
        logger.info("[OCR] Proforma match found", {
          proformaId: proformaMatch.proformaId,
          proformaNumber: proformaMatch.proformaNumber,
          method: proformaMatch.matchMethod,
          confidence: proformaMatch.confidence,
          autoLink: proformaMatch.autoLink,
        });
      }
    } catch (matchError) {
      logger.warn("[OCR] Proforma matching failed (non-critical)", {
        error: matchError.message,
      });
    }
  }

  // NOTE: Payment status and proforma settlements are NOT set here for autoLink.
  // linkProformaToInvoice() will set them atomically via a Firestore transaction
  // after the document is created. This prevents double-counting.

  // Fetch human-readable source number (PO number or CMR number)
  let sourceNumber = null;
  try {
    if (sourceInfo.type === "po" && sourceInfo.id) {
      const poDoc = await db.collection("purchaseOrders").doc(sourceInfo.id).get();
      if (poDoc.exists) {
        sourceNumber = poDoc.data().number || null;
      }
    } else if (sourceInfo.type === "cmr" && sourceInfo.id) {
      const cmrDoc = await db.collection("cmrDocuments").doc(sourceInfo.id).get();
      if (cmrDoc.exists) {
        sourceNumber = cmrDoc.data().cmrNumber || null;
      }
    }
    if (sourceNumber) {
      logger.info("[OCR] Resolved source number", {sourceType: sourceInfo.type, sourceNumber});
    }
  } catch (sourceError) {
    logger.warn("[OCR] Could not fetch source number (non-critical)", {error: sourceError.message});
  }

  const purchaseInvoice = {
    // Invoice data from OCR
    invoiceNumber: ocrData.invoiceNumber,
    invoiceDate: ocrData.invoiceDate ?
      admin.firestore.Timestamp.fromDate(new Date(ocrData.invoiceDate)) :
      null,
    dueDate: ocrData.dueDate ?
      admin.firestore.Timestamp.fromDate(new Date(ocrData.dueDate)) :
      null,

    // Supplier
    supplier: ocrData.supplier,

    // Financial
    currency: ocrData.currency,
    items: ocrData.items,
    summary: ocrData.summary,
    paymentMethod: ocrData.paymentMethod,
    bankAccount: ocrData.bankAccount,

    // Document type detection
    documentType: ocrData.documentType || "invoice",
    isProforma: isProforma,

    // Multi-currency support
    ...(exchangeRateData && {
      exchangeRate: exchangeRateData.rate,
      exchangeRateDate: admin.firestore.Timestamp.fromDate(new Date(exchangeRateData.rateDate)),
      exchangeRateSource: "nbp",
      totalInPLN: exchangeRateData.amountInPLN,
    }),
    ...(!exchangeRateData && {
      exchangeRate: 1,
      totalInPLN: totalGross,
    }),

    // Source tracking
    sourceType: sourceInfo.type, // 'po' or 'cmr'
    sourceId: sourceInfo.id,
    ...(sourceNumber && {sourceNumber}),
    sourceFile: {
      storagePath: sourceInfo.storagePath,
      downloadUrl: sourceInfo.downloadUrl,
      fileName: sourceInfo.fileName,
    },

    // OCR metadata
    ocrConfidence: ocrData.parseConfidence,
    ocrWarnings: isDuplicate ?
      [...(ocrData.warnings || []), `DUPLIKAT: ${duplicateInfo.message}`] :
      ocrData.warnings,
    ocrRawData: JSON.stringify(ocrData),

    // Duplicate detection
    ...(isDuplicate && {
      duplicateOf: duplicateInfo.existingInvoiceId,
      duplicateStatus: "confirmed",
    }),
    ...(!isDuplicate && {
      duplicateStatus: "none",
    }),

    // Workflow status: duplicate → "rejected", proforma → "proforma", normal → "pending_review"
    status: shouldAutoReject ? "rejected" : (isProforma ? "proforma" : "pending_review"),

    journalEntryId: null,

    // === Payment tracking ===
    // Initial status is "unpaid" - linkProformaToInvoice will update if auto-linked
    paymentStatus: "unpaid",
    payments: [],
    totalPaid: 0,
    paymentDate: null,

    // === Proforma suggestion (for manual confirmation in UI) ===
    ...(proformaMatch.matched && !proformaMatch.autoLink && {
      suggestedProformaMatch: {
        proformaInvoiceId: proformaMatch.proformaId,
        proformaNumber: proformaMatch.proformaNumber,
        proformaGross: proformaMatch.proformaGross,
        matchMethod: proformaMatch.matchMethod,
        confidence: proformaMatch.confidence,
      },
    }),

    // Review tracking (for auto-rejected)
    ...(shouldAutoReject && {
      reviewedBy: "cloud_function_ocr_auto_reject",
      reviewedAt: admin.firestore.FieldValue.serverTimestamp(),
      reviewNotes: autoRejectReason,
    }),

    // Audit
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: "cloud_function_ocr",
    processedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  const docRef = await db.collection("purchaseInvoices").add(purchaseInvoice);
  logger.info(`[OCR] Created purchaseInvoice: ${docRef.id}`, {
    isProforma: isProforma,
    status: purchaseInvoice.status,
    autoRejected: shouldAutoReject,
    documentType: ocrData.documentType,
  });
  return {invoiceId: docRef.id, proformaMatch};
};

// ============================================================================
// TRIGGER 1: Storage trigger for PO invoice attachments
// ============================================================================

/**
 * Processes invoice files uploaded to PO attachments
 * Path: purchase-order-attachments/{orderId}/invoice/{fileName}
 */
const onInvoiceAttachmentUploaded = onObjectFinalized(
    {
      bucket: STORAGE_BUCKET,
      region: "europe-central2",
      memory: "1GiB",
      timeoutSeconds: 180,
      secrets: [geminiApiKey],
    },
    async (event) => {
      const filePath = event.data.name;
      const contentType = event.data.contentType;

      // Check if this is a PO invoice attachment
      const poInvoiceMatch = filePath.match(
          /^purchase-order-attachments\/([^/]+)\/invoice\/(.+)$/,
      );

      if (!poInvoiceMatch) {
        // Not a PO invoice, skip silently
        return null;
      }

      const orderId = poInvoiceMatch[1];
      const fileName = poInvoiceMatch[2];

      logger.info("[OCR] PO Invoice attachment detected", {
        orderId,
        fileName,
        contentType,
        filePath,
      });

      // Validate content type
      if (!SUPPORTED_MIME_TYPES.includes(contentType)) {
        logger.warn("[OCR] Unsupported file type, skipping", {contentType});
        return null;
      }

      const apiKey = geminiApiKey.value();
      if (!apiKey) {
        logger.error("[OCR] GEMINI_API_KEY secret not configured");
        return null;
      }

      const db = admin.firestore();
      const bucket = admin.storage().bucket(event.data.bucket);

      try {
        // Check if already processed (avoid duplicates)
        const existingQuery = await db
            .collection("purchaseInvoices")
            .where("sourceFile.storagePath", "==", filePath)
            .limit(1)
            .get();

        if (!existingQuery.empty) {
          logger.info("[OCR] File already processed, skipping", {filePath});
          return null;
        }

        // Download file
        logger.info("[OCR] Downloading file...");
        const base64Data = await getFileAsBase64(bucket, filePath);

        // Call Gemini OCR
        logger.info("[OCR] Calling Gemini Vision API...");
        const rawOcrResult = await callGeminiVision(
            apiKey,
            base64Data,
            contentType,
        );
        const ocrData = normalizeOcrResult(rawOcrResult);

        logger.info("[OCR] OCR completed", {
          invoiceNumber: ocrData.invoiceNumber,
          confidence: ocrData.parseConfidence,
          itemsCount: ocrData.items.length,
        });

        // Get download URL
        const downloadUrl = await getSignedUrl(bucket, filePath);

        // Create purchaseInvoice document
        const result = await createPurchaseInvoice(db, ocrData, {
          type: "po",
          id: orderId,
          storagePath: filePath,
          downloadUrl: downloadUrl,
          fileName: fileName,
        });
        const invoiceId = result.invoiceId;
        const proformaMatch = result.proformaMatch;

        // Link proforma if auto-matched
        if (proformaMatch.matched && proformaMatch.autoLink) {
          try {
            const settlementAmount =
              ocrData.advancePaymentAmount ||
              proformaMatch.availableAmount ||
              proformaMatch.proformaGross;
            await linkProformaToInvoice(
                db, "purchaseInvoices",
                proformaMatch.proformaId, invoiceId,
                ocrData.invoiceNumber,
                settlementAmount,
            );
            logger.info("[OCR] Auto-linked proforma", {
              proformaId: proformaMatch.proformaId,
              invoiceId,
              settlementAmount,
            });
          } catch (linkError) {
            logger.warn("[OCR] Proforma link failed", {
              error: linkError.message,
            });
          }
        }

        // Match & enrich supplier data from OCR
        try {
          const supplierResult = await matchAndUpdateSupplier(db, ocrData, {
            type: "po",
            id: orderId,
          });
          if (supplierResult.updated) {
            logger.info("[OCR] Supplier enriched from invoice OCR", {
              supplierId: supplierResult.supplierId,
              updatedFields: supplierResult.updatedFields,
              matchMethod: supplierResult.matchMethod,
            });
          }
        } catch (supplierError) {
          // Non-critical, log and continue
          logger.warn("[OCR] Supplier matching failed (non-critical)", {
            error: supplierError.message,
          });
        }

        // Update source PO with reference (optional, for traceability)
        try {
          await db
              .collection("purchaseOrders")
              .doc(orderId)
              .update({
                linkedPurchaseInvoices:
                admin.firestore.FieldValue.arrayUnion(invoiceId),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
          logger.info("[OCR] Updated PO with invoice reference", {
            orderId,
            invoiceId,
          });
        } catch (poUpdateError) {
          // Non-critical, log and continue
          logger.warn("[OCR] Could not update PO reference", {
            error: poUpdateError.message,
          });
        }

        logger.info("[OCR] ✅ PO invoice processed successfully", {
          invoiceId,
          orderId,
          invoiceNumber: ocrData.invoiceNumber,
        });

        return {success: true, invoiceId, orderId};
      } catch (error) {
        logger.error("[OCR] ❌ Error processing PO invoice", {
          error: error.message,
          stack: error.stack,
          filePath,
          orderId,
        });

        // Create failed record for debugging
        try {
          await db.collection("purchaseInvoices").add({
            status: "ocr_failed",
            ocrError: error.message,
            sourceType: "po",
            sourceId: orderId,
            sourceFile: {
              storagePath: filePath,
              fileName: fileName,
            },
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: "cloud_function_ocr",
          });
        } catch (logError) {
          logger.error("[OCR] Could not log failure", {error: logError.message});
        }

        throw error;
      }
    },
);

// ============================================================================
// TRIGGER 2: Firestore trigger for CMR invoices
// ============================================================================

/**
 * Processes newly created CMR invoice documents
 * Collection: cmrInvoices/{invoiceId}
 */
const onCmrInvoiceCreated = onDocumentCreated(
    {
      document: "cmrInvoices/{invoiceId}",
      region: "europe-central2",
      memory: "1GiB",
      timeoutSeconds: 180,
      secrets: [geminiApiKey],
    },
    async (event) => {
      const invoiceId = event.params.invoiceId;
      const invoiceData = event.data.data();

      logger.info("[OCR] CMR Invoice created", {
        invoiceId,
        cmrId: invoiceData.cmrId,
        fileName: invoiceData.fileName,
      });

      // Check if already processed
      if (invoiceData.ocrProcessed === true) {
        logger.info("[OCR] Already processed, skipping");
        return null;
      }

      const storagePath = invoiceData.storagePath;
      if (!storagePath) {
        logger.warn("[OCR] No storagePath in document, skipping");
        return null;
      }

      const contentType =
      invoiceData.contentType ||
      getContentTypeFromFileName(invoiceData.fileName || "");

      // Validate content type
      if (!SUPPORTED_MIME_TYPES.includes(contentType)) {
        logger.warn("[OCR] Unsupported file type, skipping", {contentType});

        // Mark as skipped
        await admin
            .firestore()
            .collection("cmrInvoices")
            .doc(invoiceId)
            .update({
              ocrProcessed: false,
              ocrSkipReason: `Unsupported file type: ${contentType}`,
              ocrAttemptedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

        return null;
      }

      const apiKey = geminiApiKey.value();
      if (!apiKey) {
        logger.error("[OCR] GEMINI_API_KEY secret not configured");
        return null;
      }

      const db = admin.firestore();
      const bucket = admin.storage().bucket();

      try {
        // Download file
        logger.info("[OCR] Downloading file...", {storagePath});
        const base64Data = await getFileAsBase64(bucket, storagePath);

        // Call Gemini OCR
        logger.info("[OCR] Calling Gemini Vision API...");
        const rawOcrResult = await callGeminiVision(
            apiKey,
            base64Data,
            contentType,
        );
        const ocrData = normalizeOcrResult(rawOcrResult);

        logger.info("[OCR] OCR completed", {
          invoiceNumber: ocrData.invoiceNumber,
          confidence: ocrData.parseConfidence,
          itemsCount: ocrData.items.length,
        });

        // Create purchaseInvoice document
        const cmrResult = await createPurchaseInvoice(db, ocrData, {
          type: "cmr",
          id: invoiceData.cmrId,
          storagePath: storagePath,
          downloadUrl: invoiceData.downloadURL,
          fileName: invoiceData.fileName,
        });
        const purchaseInvoiceId = cmrResult.invoiceId;
        const cmrProformaMatch = cmrResult.proformaMatch;

        // Link proforma if auto-matched
        if (cmrProformaMatch.matched && cmrProformaMatch.autoLink) {
          try {
            const settlementAmount =
              ocrData.advancePaymentAmount ||
              cmrProformaMatch.availableAmount ||
              cmrProformaMatch.proformaGross;
            await linkProformaToInvoice(
                db, "purchaseInvoices",
                cmrProformaMatch.proformaId,
                purchaseInvoiceId,
                ocrData.invoiceNumber,
                settlementAmount,
            );
            logger.info("[OCR] Auto-linked proforma (CMR)", {
              proformaId: cmrProformaMatch.proformaId,
              purchaseInvoiceId,
              settlementAmount,
            });
          } catch (linkError) {
            logger.warn("[OCR] Proforma link failed (CMR)", {
              error: linkError.message,
            });
          }
        }

        // Match & enrich supplier data from OCR
        try {
          const supplierResult = await matchAndUpdateSupplier(db, ocrData, {
            type: "cmr",
            id: invoiceData.cmrId,
          });
          if (supplierResult.updated) {
            logger.info("[OCR] Supplier enriched from CMR invoice OCR", {
              supplierId: supplierResult.supplierId,
              updatedFields: supplierResult.updatedFields,
              matchMethod: supplierResult.matchMethod,
            });
          }
        } catch (supplierError) {
          // Non-critical, log and continue
          logger.warn("[OCR] Supplier matching failed (non-critical)", {
            error: supplierError.message,
          });
        }

        // Mark CMR invoice as processed
        await db.collection("cmrInvoices").doc(invoiceId).update({
          ocrProcessed: true,
          linkedPurchaseInvoiceId: purchaseInvoiceId,
          ocrProcessedAt: admin.firestore.FieldValue.serverTimestamp(),
          ocrInvoiceNumber: ocrData.invoiceNumber,
          ocrConfidence: ocrData.parseConfidence,
        });

        logger.info("[OCR] ✅ CMR invoice processed successfully", {
          purchaseInvoiceId,
          cmrInvoiceId: invoiceId,
          cmrId: invoiceData.cmrId,
          invoiceNumber: ocrData.invoiceNumber,
        });

        return {success: true, purchaseInvoiceId, cmrInvoiceId: invoiceId};
      } catch (error) {
        logger.error("[OCR] ❌ Error processing CMR invoice", {
          error: error.message,
          stack: error.stack,
          invoiceId,
          storagePath,
        });

        // Mark as failed
        await db.collection("cmrInvoices").doc(invoiceId).update({
          ocrProcessed: false,
          ocrError: error.message,
          ocrAttemptedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        throw error;
      }
    },
);

// ============================================================================
// TRIGGER 3: Storage trigger for PO invoice attachment deletion
// ============================================================================

/**
 * Deletes purchaseInvoice when source file is deleted from Storage
 * Path: purchase-order-attachments/{orderId}/invoice/{fileName}
 */
const onInvoiceAttachmentDeleted = onObjectDeleted(
    {
      bucket: STORAGE_BUCKET,
      region: "europe-central2",
    },
    async (event) => {
      const filePath = event.data.name;

      // Check if this is a PO invoice attachment
      const poInvoiceMatch = filePath.match(
          /^purchase-order-attachments\/([^/]+)\/invoice\/(.+)$/,
      );

      if (!poInvoiceMatch) {
        return null;
      }

      const fileName = poInvoiceMatch[2];

      logger.info("[OCR Cleanup] PO Invoice attachment deleted", {
        filePath,
        fileName,
      });

      const db = admin.firestore();

      try {
        // Find purchaseInvoice by storage path
        const invoicesQuery = await db
            .collection("purchaseInvoices")
            .where("sourceFile.storagePath", "==", filePath)
            .get();

        if (invoicesQuery.empty) {
          logger.info("[OCR Cleanup] No matching purchaseInvoice found");
          return null;
        }

        // Delete all matching invoices (should be only one)
        const batch = db.batch();
        invoicesQuery.forEach((doc) => {
          logger.info("[OCR Cleanup] Deleting purchaseInvoice", {id: doc.id});
          batch.delete(doc.ref);
        });

        await batch.commit();

        logger.info("[OCR Cleanup] ✅ Deleted purchaseInvoice(s)", {
          count: invoicesQuery.size,
          filePath,
        });

        return {success: true, deleted: invoicesQuery.size};
      } catch (error) {
        logger.error("[OCR Cleanup] ❌ Error deleting purchaseInvoice", {
          error: error.message,
          filePath,
        });
        throw error;
      }
    },
);

// ============================================================================
// TRIGGER 4: Firestore trigger for CMR invoice deletion
// ============================================================================

/**
 * Deletes purchaseInvoice when CMR invoice document is deleted
 * Collection: cmrInvoices/{invoiceId}
 */
const onCmrInvoiceDeleted = onDocumentDeleted(
    {
      document: "cmrInvoices/{invoiceId}",
      region: "europe-central2",
    },
    async (event) => {
      const invoiceId = event.params.invoiceId;
      const deletedData = event.data.data();

      logger.info("[OCR Cleanup] CMR Invoice deleted", {
        invoiceId,
        cmrId: deletedData?.cmrId,
        linkedPurchaseInvoiceId: deletedData?.linkedPurchaseInvoiceId,
      });

      const db = admin.firestore();

      try {
        // If we have direct link to purchaseInvoice, use it
        if (deletedData?.linkedPurchaseInvoiceId) {
          const docRef = db
              .collection("purchaseInvoices")
              .doc(deletedData.linkedPurchaseInvoiceId);

          const docSnap = await docRef.get();
          if (docSnap.exists) {
            await docRef.delete();
            logger.info("[OCR Cleanup] ✅ Deleted linked purchaseInvoice", {
              id: deletedData.linkedPurchaseInvoiceId,
            });
            return {success: true, deleted: 1};
          }
        }

        // Fallback: find by storage path
        if (deletedData?.storagePath) {
          const invoicesQuery = await db
              .collection("purchaseInvoices")
              .where("sourceFile.storagePath", "==", deletedData.storagePath)
              .get();

          if (!invoicesQuery.empty) {
            const batch = db.batch();
            invoicesQuery.forEach((doc) => {
              batch.delete(doc.ref);
            });
            await batch.commit();

            logger.info("[OCR Cleanup] ✅ Deleted purchaseInvoice(s) by path", {
              count: invoicesQuery.size,
            });
            return {success: true, deleted: invoicesQuery.size};
          }
        }

        logger.info("[OCR Cleanup] No purchaseInvoice to delete");
        return {success: true, deleted: 0};
      } catch (error) {
        logger.error("[OCR Cleanup] ❌ Error", {
          error: error.message,
          invoiceId,
        });
        throw error;
      }
    },
);

// ============================================================================
// CALLABLE: Manual OCR retry
// ============================================================================

const {onCall, HttpsError} = require("firebase-functions/v2/https");

/**
 * Manually retry OCR for a purchase invoice
 * Call from client when user clicks "Retry OCR" button
 */
const retryInvoiceOcr = onCall(
    {
      region: "europe-central2",
      memory: "1GiB",
      timeoutSeconds: 180,
      secrets: [geminiApiKey],
    },
    async (request) => {
      // Verify authentication
      if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be authenticated");
      }

      const {invoiceId} = request.data;
      if (!invoiceId) {
        throw new HttpsError("invalid-argument", "invoiceId is required");
      }

      logger.info("[OCR Retry] Starting manual OCR retry", {
        invoiceId,
        userId: request.auth.uid,
      });

      const db = admin.firestore();
      const bucket = admin.storage().bucket();
      const apiKey = geminiApiKey.value();

      if (!apiKey) {
        throw new HttpsError("internal", "GEMINI_API_KEY not configured");
      }

      try {
        // Get the invoice document
        const invoiceDoc = await db
            .collection("purchaseInvoices")
            .doc(invoiceId)
            .get();

        if (!invoiceDoc.exists) {
          throw new HttpsError("not-found", "Invoice not found");
        }

        const invoiceData = invoiceDoc.data();
        const storagePath = invoiceData.sourceFile?.storagePath;

        if (!storagePath) {
          throw new HttpsError(
              "failed-precondition",
              "No source file path found",
          );
        }

        logger.info("[OCR Retry] Downloading file...", {storagePath});

        // Get file metadata to determine content type
        const file = bucket.file(storagePath);
        const [metadata] = await file.getMetadata();
        const contentType = metadata.contentType || "application/pdf";

        // Validate content type
        if (!SUPPORTED_MIME_TYPES.includes(contentType)) {
          throw new HttpsError(
              "failed-precondition",
              `Unsupported file type: ${contentType}`,
          );
        }

        // Download and process
        const base64Data = await getFileAsBase64(bucket, storagePath);

        logger.info("[OCR Retry] Calling Gemini Vision API...");
        const rawOcrResult = await callGeminiVision(
            apiKey,
            base64Data,
            contentType,
        );
        const ocrData = normalizeOcrResult(rawOcrResult);

        logger.info("[OCR Retry] OCR completed", {
          invoiceNumber: ocrData.invoiceNumber,
          confidence: ocrData.parseConfidence,
          itemsCount: ocrData.items.length,
        });

        // Get exchange rate if currency is not PLN
        let exchangeRateData = null;
        const totalGross = ocrData.summary?.totalGross || 0;

        if (ocrData.currency && ocrData.currency !== "PLN") {
          try {
            logger.info(`[OCR Retry] Fetching exchange rate for ${ocrData.currency}`);
            const invoiceDate = ocrData.invoiceDate ? new Date(ocrData.invoiceDate) : new Date();
            // Polish tax law (Art. 31a VAT): use NBP rate from day BEFORE invoice date
            const rateDateForNBP = new Date(invoiceDate);
            rateDateForNBP.setDate(rateDateForNBP.getDate() - 1);
            exchangeRateData = await convertToPLN(totalGross, ocrData.currency, rateDateForNBP);
            logger.info(`[OCR Retry] Rate: ${exchangeRateData.rate}, Total in PLN: ${exchangeRateData.amountInPLN.toFixed(2)}`);
          } catch (rateError) {
            logger.error(`[OCR Retry] Failed to fetch exchange rate:`, rateError);
            // Continue without exchange rate
          }
        }

        // Check if proforma
        const {checkIfProforma} = require("../utils/ocrService");
        const isProforma = checkIfProforma(ocrData);

        // DUPLICATE DETECTION on retry (applies to ALL documents incl. proformas)
        let retryDuplicateResult = {isDuplicate: false};
        let retryCrossPoResult = {isDuplicate: false};

        retryDuplicateResult = await checkForDuplicateInvoice(db, {
          invoiceNumber: ocrData.invoiceNumber,
          supplierTaxId: ocrData.supplier?.taxId || null,
          supplierName: ocrData.supplier?.name || "",
          excludeId: invoiceId,
          excludeCollection: "purchaseInvoices",
        });

        if (!retryDuplicateResult.isDuplicate &&
            invoiceData.sourceId) {
          retryCrossPoResult = await checkCrossPoDuplicate(
              db,
              ocrData.invoiceNumber,
              ocrData.supplier?.taxId || null,
              invoiceData.sourceId,
              invoiceId,
          );
        }

        const retryIsDuplicate =
          retryDuplicateResult.isDuplicate ||
          retryCrossPoResult.isDuplicate;
        const retryDuplicateInfo =
          retryDuplicateResult.isDuplicate ?
            retryDuplicateResult : retryCrossPoResult;

        if (retryIsDuplicate) {
          logger.warn("[OCR Retry] Duplicate detected", {
            invoiceNumber: ocrData.invoiceNumber,
            isProforma,
            duplicateType: retryDuplicateInfo.duplicateType,
            existingId: retryDuplicateInfo.existingInvoiceId,
          });
        }

        // AUTO-REJECT: duplicates (both regular invoices and proformas)
        const shouldAutoReject = retryIsDuplicate;
        let autoRejectReason = null;
        if (retryIsDuplicate) {
          const docLabel = isProforma ? "proformy" : "faktury";
          autoRejectReason = "Automatycznie odrzucone: " +
            `Duplikat ${docLabel}. ` +
            (retryDuplicateInfo.message || "");
        }

        // PROFORMA: Unlink old proformas before re-matching
        if (invoiceData.proformaSettlements && invoiceData.proformaSettlements.length > 0) {
          try {
            await unlinkAllProformasFromInvoice(db, "purchaseInvoices", invoiceId);
            logger.info("[OCR Retry] Unlinked old proforma settlements before re-matching");
          } catch (unlinkError) {
            logger.warn("[OCR Retry] Failed to unlink old proformas (non-critical)", {
              error: unlinkError.message,
            });
          }
        }

        // PROFORMA MATCHING on retry
        let retryProformaMatch = {matched: false};
        if (!isProforma && !shouldAutoReject) {
          try {
            retryProformaMatch = await matchProformaForPurchaseInvoice(
                db, ocrData,
                {type: invoiceData.sourceType || "po", id: invoiceData.sourceId},
                invoiceId,
            );
            if (retryProformaMatch.matched) {
              logger.info("[OCR Retry] Proforma match found", {
                proformaId: retryProformaMatch.proformaId,
                method: retryProformaMatch.matchMethod,
                autoLink: retryProformaMatch.autoLink,
              });
            }
          } catch (matchError) {
            logger.warn("[OCR Retry] Proforma matching failed (non-critical)", {
              error: matchError.message,
            });
          }
        }

        // NOTE: Payment status and proforma settlements for autoLink are NOT set here.
        // linkProformaToInvoice() will set them atomically after the update.
        // This prevents double-counting settlements.

        // Fetch source number if not already stored
        let retrySourceNumber = invoiceData.sourceNumber || null;
        if (!retrySourceNumber && invoiceData.sourceId) {
          try {
            const srcType = invoiceData.sourceType || "po";
            if (srcType === "po") {
              const poDoc = await db.collection("purchaseOrders").doc(invoiceData.sourceId).get();
              if (poDoc.exists) retrySourceNumber = poDoc.data().number || null;
            } else if (srcType === "cmr") {
              const cmrDoc = await db.collection("cmrDocuments").doc(invoiceData.sourceId).get();
              if (cmrDoc.exists) retrySourceNumber = cmrDoc.data().cmrNumber || null;
            }
          } catch (srcError) {
            logger.warn("[OCR Retry] Could not fetch source number", {error: srcError.message});
          }
        }

        // Update the invoice with new OCR data
        const updateData = {
          invoiceNumber: ocrData.invoiceNumber,
          invoiceDate: ocrData.invoiceDate ?
            admin.firestore.Timestamp.fromDate(
                new Date(ocrData.invoiceDate)) :
            null,
          dueDate: ocrData.dueDate ?
            admin.firestore.Timestamp.fromDate(
                new Date(ocrData.dueDate)) :
            null,
          supplier: ocrData.supplier,
          currency: ocrData.currency,
          items: ocrData.items,
          summary: ocrData.summary,
          paymentMethod: ocrData.paymentMethod,
          bankAccount: ocrData.bankAccount,
          documentType: ocrData.documentType || "invoice",
          isProforma: isProforma,
          ocrConfidence: ocrData.parseConfidence,
          ocrWarnings: retryIsDuplicate ?
            [...(ocrData.warnings || []),
              `DUPLIKAT: ${retryDuplicateInfo.message}`] :
            ocrData.warnings,
          ocrError: admin.firestore.FieldValue.delete(),
          ocrRawData: JSON.stringify(ocrData),
          // duplicate → "rejected", proforma → "proforma", normal → "pending_review"
          status: shouldAutoReject ? "rejected" :
            (isProforma ? "proforma" : "pending_review"),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastOcrRetryAt: admin.firestore.FieldValue.serverTimestamp(),
          lastOcrRetryBy: request.auth.uid,
          // Duplicate detection fields
          ...(retryIsDuplicate && {
            duplicateOf: retryDuplicateInfo.existingInvoiceId,
            duplicateStatus: "confirmed",
          }),
          ...(!retryIsDuplicate && {
            duplicateOf: admin.firestore.FieldValue.delete(),
            duplicateStatus: "none",
          }),

          // Source number (backfill if missing)
          ...(retrySourceNumber && {sourceNumber: retrySourceNumber}),

          // Payment tracking (preserve manual payments, reset proforma fields)
          // paymentStatus will be recalculated by linkProformaToInvoice if autoLink
          paymentStatus: "unpaid",
          payments: invoiceData.payments || [], // Preserve manual payments
          totalPaid: invoiceData.totalPaid || 0, // Preserve manual payments
          paymentDate: null,

          // Reset proforma fields (linkProformaToInvoice will set them for autoLink)
          proformaSettlements: [],
          settledFromProformas: 0,

          // Proforma suggestion (only for non-autoLink matches)
          ...(retryProformaMatch.matched && !retryProformaMatch.autoLink && {
            suggestedProformaMatch: {
              proformaInvoiceId: retryProformaMatch.proformaId,
              proformaNumber: retryProformaMatch.proformaNumber,
              proformaGross: retryProformaMatch.proformaGross,
              matchMethod: retryProformaMatch.matchMethod,
              confidence: retryProformaMatch.confidence,
            },
          }),
          ...((!retryProformaMatch.matched || retryProformaMatch.autoLink) && {
            suggestedProformaMatch: null,
          }),
        };

        // Add review notes if auto-rejected
        if (shouldAutoReject) {
          updateData.reviewedBy =
            "cloud_function_ocr_auto_reject";
          updateData.reviewedAt =
            admin.firestore.FieldValue.serverTimestamp();
          updateData.reviewNotes = autoRejectReason;
        }

        // Add exchange rate data if available
        if (exchangeRateData) {
          updateData.exchangeRate = exchangeRateData.rate;
          updateData.exchangeRateDate = admin.firestore.Timestamp.fromDate(
              new Date(exchangeRateData.rateDate),
          );
          updateData.exchangeRateSource = "nbp";
          updateData.totalInPLN = exchangeRateData.amountInPLN;
        } else {
          updateData.exchangeRate = 1;
          updateData.totalInPLN = totalGross;
        }

        await db.collection("purchaseInvoices").doc(invoiceId).update(updateData);

        // Link proforma if auto-matched on retry
        if (retryProformaMatch.matched && retryProformaMatch.autoLink) {
          try {
            const retrySettlementAmount = ocrData.advancePaymentAmount ||
                retryProformaMatch.availableAmount || retryProformaMatch.proformaGross;
            await linkProformaToInvoice(
                db, "purchaseInvoices",
                retryProformaMatch.proformaId, invoiceId,
                ocrData.invoiceNumber,
                retrySettlementAmount,
            );
            logger.info("[OCR Retry] ✅ Auto-linked proforma after retry", {
              proformaId: retryProformaMatch.proformaId,
              invoiceId,
              settlementAmount: retrySettlementAmount,
            });
          } catch (linkError) {
            logger.warn("[OCR Retry] Failed to link proforma after retry (non-critical)", {
              error: linkError.message,
            });
          }
        }

        // Match & enrich supplier data from OCR (on retry too)
        try {
          const sourceType = invoiceData.sourceType || "po";
          const sourceId = invoiceData.sourceId;
          if (sourceId) {
            const supplierResult = await matchAndUpdateSupplier(db, ocrData, {
              type: sourceType,
              id: sourceId,
            });
            if (supplierResult.updated) {
              logger.info("[OCR Retry] Supplier enriched from OCR retry", {
                supplierId: supplierResult.supplierId,
                updatedFields: supplierResult.updatedFields,
                matchMethod: supplierResult.matchMethod,
              });
            }
          }
        } catch (supplierError) {
          // Non-critical, log and continue
          logger.warn("[OCR Retry] Supplier matching failed (non-critical)", {
            error: supplierError.message,
          });
        }

        logger.info("[OCR Retry] ✅ Invoice updated successfully", {
          invoiceId,
          invoiceNumber: ocrData.invoiceNumber,
        });

        return {
          success: true,
          invoiceNumber: ocrData.invoiceNumber,
          confidence: ocrData.parseConfidence,
          itemsCount: ocrData.items.length,
        };
      } catch (error) {
        logger.error("[OCR Retry] ❌ Error", {
          error: error.message,
          invoiceId,
        });

        // Update invoice with error
        await db.collection("purchaseInvoices").doc(invoiceId).update({
          ocrError: error.message,
          status: "ocr_failed",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastOcrRetryAt: admin.firestore.FieldValue.serverTimestamp(),
          lastOcrRetryBy: request.auth.uid,
        });

        if (error instanceof HttpsError) {
          throw error;
        }
        throw new HttpsError("internal", `OCR failed: ${error.message}`);
      }
    },
);

module.exports = {
  onInvoiceAttachmentUploaded,
  onCmrInvoiceCreated,
  onInvoiceAttachmentDeleted,
  onCmrInvoiceDeleted,
  retryInvoiceOcr,
};
