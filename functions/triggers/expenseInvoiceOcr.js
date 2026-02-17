/**
 * Expense Invoice OCR Cloud Functions
 *
 * Automatically processes expense invoice attachments uploaded by employees
 * using Gemini Vision OCR and creates expenseInvoices documents for BGW-Accounting.
 *
 * SUPPORTED PATHS:
 * - expense-invoices/ - Manual uploads from BGW-Accounting app
 * - email-invoices/   - Auto uploads from App Engine Mail
 *
 * TRIGGERS:
 * 1. onExpenseInvoiceUploaded - Storage trigger for expense invoices (both paths)
 * 2. onExpenseInvoiceDeleted - Cleanup when file is deleted
 *
 * DEPLOYMENT:
 * firebase deploy --only functions:bgw-mrp:onExpenseInvoiceUploaded
 * firebase deploy --only functions:bgw-mrp:onExpenseInvoiceDeleted
 * firebase deploy --only functions:bgw-mrp:processExpenseInvoiceOcr
 *
 * @module triggers/expenseInvoiceOcr
 */

const {onObjectFinalized, onObjectDeleted} = require("firebase-functions/v2/storage");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const {admin} = require("../config");
const {
  callGeminiVision,
  normalizeOcrResult,
  SUPPORTED_MIME_TYPES,
} = require("../utils/ocrService");
const {convertToPLN} = require("../utils/exchangeRates");
const {checkForDuplicateInvoice} = require("../utils/duplicateDetection");
const {
  matchProformaForExpenseInvoice,
} = require("../utils/proformaMatchingService");

// Define secret for Gemini API key
const geminiApiKey = defineSecret("GEMINI_API_KEY");

// Storage bucket name
const STORAGE_BUCKET = "bgw-mrp-system.firebasestorage.app";

// Collection name for expense invoices
const COLLECTION = "expenseInvoices";

/**
 * Check if file path is an expense invoice
 * @param {string} filePath - Storage file path
 * @return {Object|null} - Source info or null if not expense invoice
 */
const getExpenseInvoiceSource = (filePath) => {
  if (filePath.startsWith("expense-invoices/")) {
    return {type: "app_upload", path: "expense-invoices/"};
  }
  if (filePath.startsWith("email-invoices/")) {
    return {type: "email", path: "email-invoices/"};
  }
  return null;
};

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
 * Update expenseInvoice document with OCR data
 * @param {Object} db - Firestore database reference
 * @param {string} invoiceId - Document ID
 * @param {Object} ocrData - Normalized OCR data
 * @param {string} downloadUrl - Signed download URL
 */
const updateExpenseInvoiceWithOcr = async (db, invoiceId, ocrData, downloadUrl) => {
  // Get exchange rate if currency is not PLN
  let exchangeRateData = null;
  const totalGross = ocrData.summary?.totalGross || 0;

  if (ocrData.currency && ocrData.currency !== "PLN") {
    try {
      // Art. 31a VAT: use NBP rate from day BEFORE tax obligation date
      // Tax obligation = serviceDate (if set), else invoiceDate
      const taxObligationDate = ocrData.serviceDate ?
        new Date(ocrData.serviceDate) :
        (ocrData.invoiceDate ? new Date(ocrData.invoiceDate) : new Date());
      const rateDateForNBP = new Date(taxObligationDate);
      rateDateForNBP.setDate(rateDateForNBP.getDate() - 1);
      logger.info(`[Expense OCR] Fetching exchange rate for ${ocrData.currency}, ` +
        `taxObligationDate: ${taxObligationDate.toISOString().slice(0, 10)}, ` +
        `rateDate: ${rateDateForNBP.toISOString().slice(0, 10)}`);
      exchangeRateData = await convertToPLN(totalGross, ocrData.currency, rateDateForNBP);
      logger.info(`[Expense OCR] Rate: ${exchangeRateData.rate}, Total in PLN: ${exchangeRateData.amountInPLN.toFixed(2)}`);
    } catch (error) {
      logger.error(`[Expense OCR] Failed to fetch exchange rate for ${ocrData.currency}:`, error);
      // Continue without exchange rate - will be PLN by default
    }
  }

  // Check if document is a proforma
  const {checkIfProforma} = require("../utils/ocrService");
  const isProforma = checkIfProforma(ocrData);

  // DUPLICATE DETECTION - check by invoice number + supplier
  const duplicateResult = await checkForDuplicateInvoice(db, {
    invoiceNumber: ocrData.invoiceNumber,
    supplierTaxId: ocrData.supplier?.taxId || null,
    supplierName: ocrData.supplier?.name || "",
    excludeId: invoiceId,
    excludeCollection: "expenseInvoices",
  });

  if (duplicateResult.isDuplicate) {
    logger.warn("[Expense OCR] Duplicate detected", {
      invoiceId,
      invoiceNumber: ocrData.invoiceNumber,
      duplicateType: duplicateResult.duplicateType,
      existingId: duplicateResult.existingInvoiceId,
      message: duplicateResult.message,
    });
  }

  // AUTO-REJECT: only duplicates (proformas get dedicated "proforma" status)
  const shouldAutoReject = duplicateResult.isDuplicate;
  let autoRejectReason = null;
  if (shouldAutoReject) {
    autoRejectReason = "Automatycznie odrzucone: " +
      "Duplikat faktury. " +
      (duplicateResult.message || "");
  }

  // PROFORMA MATCHING - for expense invoices, always suggest (never autoLink)
  let expenseProformaMatch = {matched: false};
  if (!isProforma && !shouldAutoReject) {
    try {
      expenseProformaMatch = await matchProformaForExpenseInvoice(db, ocrData, invoiceId);
      if (expenseProformaMatch.matched) {
        logger.info("[Expense OCR] Proforma match suggestion found", {
          proformaId: expenseProformaMatch.proformaId,
          proformaNumber: expenseProformaMatch.proformaNumber,
          method: expenseProformaMatch.matchMethod,
          confidence: expenseProformaMatch.confidence,
        });
      }
    } catch (matchError) {
      logger.warn("[Expense OCR] Proforma matching failed (non-critical)", {
        error: matchError.message,
      });
    }
  }

  const updateData = {
    // Invoice data from OCR
    "invoiceNumber": ocrData.invoiceNumber,
    "invoiceDate": ocrData.invoiceDate ?
      admin.firestore.Timestamp.fromDate(
          new Date(ocrData.invoiceDate)) :
      null,
    "serviceDate": ocrData.serviceDate ?
      admin.firestore.Timestamp.fromDate(
          new Date(ocrData.serviceDate)) :
      null,
    "dueDate": ocrData.dueDate ?
      admin.firestore.Timestamp.fromDate(
          new Date(ocrData.dueDate)) :
      null,

    // Supplier
    "supplier": ocrData.supplier,

    // Financial
    "currency": ocrData.currency,
    "items": ocrData.items,
    "summary": ocrData.summary,
    "paymentMethod": ocrData.paymentMethod,
    "bankAccount": ocrData.bankAccount,

    // Document type detection
    "documentType": ocrData.documentType || "invoice",
    "isProforma": isProforma,

    // Multi-currency support
    ...(exchangeRateData && {
      "exchangeRate": exchangeRateData.rate,
      "exchangeRateDate": admin.firestore.Timestamp.fromDate(
          new Date(exchangeRateData.rateDate)),
      "exchangeRateSource": "nbp",
      "totalInPLN": exchangeRateData.amountInPLN,
    }),
    // If PLN or no exchange rate, set totalInPLN = totalGross
    ...(!exchangeRateData && {
      "exchangeRate": 1,
      "totalInPLN": totalGross,
    }),

    // OCR metadata
    "ocrConfidence": ocrData.parseConfidence,
    "ocrWarnings": duplicateResult.isDuplicate ?
      [...(ocrData.warnings || []),
        `DUPLIKAT: ${duplicateResult.message}`] :
      ocrData.warnings,
    "ocrProcessed": true,
    "ocrProcessedAt": admin.firestore.FieldValue.serverTimestamp(),

    // Duplicate detection
    ...(duplicateResult.isDuplicate && {
      "duplicateOf": duplicateResult.existingInvoiceId,
      "duplicateStatus": "confirmed",
    }),
    ...(!duplicateResult.isDuplicate && {
      "duplicateStatus": "none",
    }),

    // Update download URL with signed version
    "sourceFile.downloadUrl": downloadUrl,

    // proforma → "proforma", duplicate → "rejected", normal → "pending_review"
    "status": isProforma ? "proforma" :
      (shouldAutoReject ? "rejected" : "pending_review"),

    // === Payment tracking ===
    "paymentStatus": "unpaid",
    "payments": [],
    "totalPaid": 0,
    "paymentDate": null,

    // === Proforma suggestion (expense invoices never autoLink) ===
    ...(expenseProformaMatch.matched && {
      "suggestedProformaMatch": {
        proformaInvoiceId: expenseProformaMatch.proformaId,
        proformaNumber: expenseProformaMatch.proformaNumber,
        proformaGross: expenseProformaMatch.proformaGross,
        matchMethod: expenseProformaMatch.matchMethod,
        confidence: expenseProformaMatch.confidence,
      },
    }),
    ...(!expenseProformaMatch.matched && {
      "suggestedProformaMatch": null,
    }),

    // Review tracking (for auto-rejected)
    ...(shouldAutoReject && {
      "reviewedBy": "cloud_function_ocr_auto_reject",
      "reviewedAt": admin.firestore.FieldValue.serverTimestamp(),
      "reviewNotes": autoRejectReason,
    }),

    // Audit
    "updatedAt": admin.firestore.FieldValue.serverTimestamp(),
  };

  await db.collection(COLLECTION).doc(invoiceId).update(updateData);
  logger.info(`[Expense OCR] Updated: ${invoiceId}`, {
    isProforma: isProforma,
    documentType: ocrData.documentType,
    isDuplicate: duplicateResult.isDuplicate,
    duplicateType: duplicateResult.duplicateType,
    autoRejected: shouldAutoReject,
    proformaMatch: expenseProformaMatch.matched,
  });
};

/**
 * Find expense invoice document by storage path
 * @param {Object} db - Firestore database reference
 * @param {string} storagePath - Storage path to search for
 * @return {Promise<Object|null>} Document data with ID or null
 */
const findExpenseInvoiceByStoragePath = async (db, storagePath) => {
  const query = await db
      .collection(COLLECTION)
      .where("sourceFile.storagePath", "==", storagePath)
      .limit(1)
      .get();

  if (query.empty) {
    return null;
  }

  const doc = query.docs[0];
  return {id: doc.id, ...doc.data()};
};

/**
 * Create a new expense invoice document for email attachments
 * @param {Object} db - Firestore database reference
 * @param {string} storagePath - Storage file path
 * @param {string} fileName - Original file name
 * @param {string} contentType - MIME type
 * @return {Promise<Object>} Created document with ID
 */
const createExpenseInvoiceFromEmail = async (db, storagePath, fileName, contentType) => {
  // Extract email info from file path if available
  // Format might be: email-invoices/{timestamp}_{sender}_{filename}
  const pathParts = fileName.split("_");
  let senderEmail = "unknown@email";

  // Try to extract sender from filename pattern
  if (pathParts.length >= 2) {
    // Check if second part looks like an email
    const potentialEmail = pathParts[1];
    if (potentialEmail && potentialEmail.includes("@")) {
      senderEmail = potentialEmail;
    }
  }

  const now = admin.firestore.FieldValue.serverTimestamp();

  const newDoc = {
    // Will be filled by OCR
    "invoiceNumber": "",
    "invoiceDate": null,
    "dueDate": null,
    "supplier": {
      "name": "",
      "taxId": "",
      "address": "",
    },
    "currency": "PLN",
    "items": [],
    "summary": {
      "netTotal": 0,
      "vatTotal": 0,
      "grossTotal": 0,
    },
    "paymentMethod": "",
    "bankAccount": null,

    // Source info
    "sourceType": "email",
    "sourceFile": {
      "storagePath": storagePath,
      "fileName": fileName,
      "mimeType": contentType,
      "downloadUrl": null, // Will be set after OCR
    },

    // Submitter info (from email)
    "submittedBy": null,
    "submittedByEmail": senderEmail,
    "submittedByName": "Email Attachment",
    "submittedAt": now,

    // Categorization (to be filled by accountant)
    "category": null,
    "costCenter": null,
    "notes": `Automatycznie zaimportowano z email: ${fileName}`,

    // OCR status
    "ocrProcessed": false,
    "ocrConfidence": 0,
    "ocrWarnings": [],

    // Workflow
    "status": "pending_ocr",
    "journalEntryId": null,

    // Audit
    "createdAt": now,
    "updatedAt": now,
    "createdBy": "system:email-import",
  };

  const docRef = await db.collection(COLLECTION).add(newDoc);
  logger.info("[Expense OCR] Created new expenseInvoice from email", {
    id: docRef.id,
    fileName,
    senderEmail,
  });

  return {id: docRef.id, ...newDoc};
};

// ============================================================================
// TRIGGER 1: Storage trigger for expense invoice uploads
// ============================================================================

/**
 * Processes expense invoice files uploaded to Storage
 * Supports two paths:
 * - expense-invoices/{timestamp}_{fileName} - Manual app uploads
 * - email-invoices/{...} - App Engine Mail attachments
 */
const onExpenseInvoiceUploaded = onObjectFinalized(
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

      // Check if this is an expense invoice (either path)
      const sourceInfo = getExpenseInvoiceSource(filePath);
      if (!sourceInfo) {
        // Not an expense invoice, skip silently
        return null;
      }

      const fileName = filePath.split("/").pop();

      logger.info("[Expense OCR] Expense invoice upload detected", {
        fileName,
        contentType,
        filePath,
        sourceType: sourceInfo.type,
      });

      // Validate content type
      if (!SUPPORTED_MIME_TYPES.includes(contentType)) {
        logger.warn("[Expense OCR] Unsupported file type, skipping", {contentType});
        return null;
      }

      const apiKey = geminiApiKey.value();
      if (!apiKey) {
        logger.error("[Expense OCR] GEMINI_API_KEY secret not configured");
        return null;
      }

      const db = admin.firestore();
      const bucket = admin.storage().bucket(event.data.bucket);

      try {
        // Find or create the expense invoice document
        let expenseInvoice = await findExpenseInvoiceByStoragePath(db, filePath);

        // For email uploads, create document automatically if not found
        if (!expenseInvoice && sourceInfo.type === "email") {
          logger.info("[Expense OCR] Creating document for email attachment", {
            filePath,
          });
          expenseInvoice = await createExpenseInvoiceFromEmail(
              db,
              filePath,
              fileName,
              contentType,
          );
        }

        if (!expenseInvoice) {
          logger.warn("[Expense OCR] No expenseInvoice document found for path", {
            filePath,
            sourceType: sourceInfo.type,
          });
          return null;
        }

        // Check if already processed
        if (expenseInvoice.ocrProcessed === true) {
          logger.info("[Expense OCR] Already processed, skipping", {
            id: expenseInvoice.id,
          });
          return null;
        }

        // Download file
        logger.info("[Expense OCR] Downloading file...");
        const base64Data = await getFileAsBase64(bucket, filePath);

        // Call Gemini OCR
        logger.info("[Expense OCR] Calling Gemini Vision API...");
        const rawOcrResult = await callGeminiVision(
            apiKey,
            base64Data,
            contentType,
        );
        const ocrData = normalizeOcrResult(rawOcrResult);

        logger.info("[Expense OCR] OCR completed", {
          invoiceNumber: ocrData.invoiceNumber,
          confidence: ocrData.parseConfidence,
          itemsCount: ocrData.items.length,
        });

        // Get signed download URL
        const downloadUrl = await getSignedUrl(bucket, filePath);

        // Update expense invoice document with OCR data
        await updateExpenseInvoiceWithOcr(
            db,
            expenseInvoice.id,
            ocrData,
            downloadUrl,
        );

        logger.info("[Expense OCR] ✅ Expense invoice processed successfully", {
          invoiceId: expenseInvoice.id,
          invoiceNumber: ocrData.invoiceNumber,
          submittedBy: expenseInvoice.submittedByEmail,
          sourceType: sourceInfo.type,
        });

        return {success: true, invoiceId: expenseInvoice.id};
      } catch (error) {
        logger.error("[Expense OCR] ❌ Error processing expense invoice", {
          error: error.message,
          stack: error.stack,
          filePath,
          sourceType: sourceInfo.type,
        });

        // Try to mark the document as failed
        try {
          const existingInvoice = await findExpenseInvoiceByStoragePath(db, filePath);
          if (existingInvoice) {
            await db.collection(COLLECTION).doc(existingInvoice.id).update({
              "status": "ocr_failed",
              "ocrError": error.message,
              "ocrProcessed": false,
              "ocrAttemptedAt": admin.firestore.FieldValue.serverTimestamp(),
              "updatedAt": admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        } catch (updateError) {
          logger.error("[Expense OCR] Could not update failure status", {
            error: updateError.message,
          });
        }

        throw error;
      }
    },
);

// ============================================================================
// TRIGGER 2: Storage trigger for expense invoice deletion
// ============================================================================

/**
 * Handles deletion of expense invoice files from Storage
 * Deletes the corresponding Firestore document
 */
const onExpenseInvoiceDeleted = onObjectDeleted(
    {
      bucket: STORAGE_BUCKET,
      region: "europe-central2",
    },
    async (event) => {
      const filePath = event.data.name;

      // Check if this is an expense invoice (either path)
      const sourceInfo = getExpenseInvoiceSource(filePath);
      if (!sourceInfo) {
        return null;
      }

      logger.info("[Expense OCR Cleanup] Expense invoice file deleted", {
        filePath,
        sourceType: sourceInfo.type,
      });

      const db = admin.firestore();

      try {
        // Find expense invoice by storage path
        const expenseInvoice = await findExpenseInvoiceByStoragePath(db, filePath);

        if (!expenseInvoice) {
          logger.info("[Expense OCR Cleanup] No matching document found");
          return null;
        }

        // Delete the document
        await db.collection(COLLECTION).doc(expenseInvoice.id).delete();

        logger.info("[Expense OCR Cleanup] ✅ Deleted expenseInvoice", {
          id: expenseInvoice.id,
          filePath,
          sourceType: sourceInfo.type,
        });

        return {success: true, deleted: 1};
      } catch (error) {
        logger.error("[Expense OCR Cleanup] ❌ Error", {
          error: error.message,
          filePath,
        });
        throw error;
      }
    },
);

// ============================================================================
// CALLABLE: Process/Retry OCR for expense invoice
// ============================================================================

/**
 * Process or retry OCR for an expense invoice
 * Call from client when user clicks "Retry OCR" button
 */
const processExpenseInvoiceOcr = onCall(
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

      logger.info("[Expense OCR Retry] Starting OCR processing", {
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
            .collection(COLLECTION)
            .doc(invoiceId)
            .get();

        if (!invoiceDoc.exists) {
          throw new HttpsError("not-found", "Expense invoice not found");
        }

        const invoiceData = invoiceDoc.data();
        const storagePath = invoiceData.sourceFile?.storagePath;

        if (!storagePath) {
          throw new HttpsError(
              "failed-precondition",
              "No source file path found",
          );
        }

        logger.info("[Expense OCR Retry] Downloading file...", {storagePath});

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

        logger.info("[Expense OCR Retry] Calling Gemini Vision API...");
        const rawOcrResult = await callGeminiVision(
            apiKey,
            base64Data,
            contentType,
        );
        const ocrData = normalizeOcrResult(rawOcrResult);

        logger.info("[Expense OCR Retry] OCR completed", {
          invoiceNumber: ocrData.invoiceNumber,
          confidence: ocrData.parseConfidence,
          itemsCount: ocrData.items.length,
        });

        // Get signed URL
        const downloadUrl = await getSignedUrl(bucket, storagePath);

        // Get exchange rate if currency is not PLN
        let exchangeRateData = null;
        const totalGross = ocrData.summary?.totalGross || 0;

        if (ocrData.currency && ocrData.currency !== "PLN") {
          try {
            // Art. 31a VAT: use NBP rate from day BEFORE tax obligation date
            // Tax obligation = serviceDate (if set), else invoiceDate
            const taxObligationDate = ocrData.serviceDate ?
              new Date(ocrData.serviceDate) :
              (ocrData.invoiceDate ? new Date(ocrData.invoiceDate) : new Date());
            const rateDateForNBP = new Date(taxObligationDate);
            rateDateForNBP.setDate(rateDateForNBP.getDate() - 1);
            logger.info(`[Expense OCR Retry] Fetching exchange rate for ${ocrData.currency}, ` +
              `taxObligationDate: ${taxObligationDate.toISOString().slice(0, 10)}, ` +
              `rateDate: ${rateDateForNBP.toISOString().slice(0, 10)}`);
            exchangeRateData = await convertToPLN(totalGross, ocrData.currency, rateDateForNBP);
            logger.info(`[Expense OCR Retry] Rate: ${exchangeRateData.rate}, Total in PLN: ${exchangeRateData.amountInPLN.toFixed(2)}`);
          } catch (rateError) {
            logger.error(`[Expense OCR Retry] Failed to fetch exchange rate:`, rateError);
            // Continue without exchange rate
          }
        }

        // DUPLICATE DETECTION on retry
        const retryDuplicateResult = await checkForDuplicateInvoice(db, {
          invoiceNumber: ocrData.invoiceNumber,
          supplierTaxId: ocrData.supplier?.taxId || null,
          supplierName: ocrData.supplier?.name || "",
          excludeId: invoiceId,
          excludeCollection: "expenseInvoices",
        });

        if (retryDuplicateResult.isDuplicate) {
          logger.warn("[Expense OCR Retry] Duplicate detected", {
            invoiceId,
            invoiceNumber: ocrData.invoiceNumber,
            duplicateType: retryDuplicateResult.duplicateType,
            existingId: retryDuplicateResult.existingInvoiceId,
          });
        }

        // Check if proforma
        const {checkIfProforma} = require("../utils/ocrService");
        const isProforma = checkIfProforma(ocrData);

        // AUTO-REJECT: duplicate invoices
        const retryAutoReject = retryDuplicateResult.isDuplicate;
        let retryRejectReason = null;
        if (retryAutoReject) {
          retryRejectReason = "Automatycznie odrzucone: " +
            "Duplikat faktury. " +
            (retryDuplicateResult.message || "");
        }

        // PROFORMA MATCHING on retry (expense = always suggest)
        let retryExpenseProformaMatch = {matched: false};
        if (!isProforma && !retryAutoReject) {
          try {
            retryExpenseProformaMatch = await matchProformaForExpenseInvoice(
                db, ocrData, invoiceId,
            );
            if (retryExpenseProformaMatch.matched) {
              logger.info("[Expense OCR Retry] Proforma match suggestion found", {
                proformaId: retryExpenseProformaMatch.proformaId,
                method: retryExpenseProformaMatch.matchMethod,
                confidence: retryExpenseProformaMatch.confidence,
              });
            }
          } catch (matchError) {
            logger.warn("[Expense OCR Retry] Proforma matching failed (non-critical)", {
              error: matchError.message,
            });
          }
        }

        // Update the invoice with new OCR data
        const updateData = {
          "invoiceNumber": ocrData.invoiceNumber,
          "invoiceDate": ocrData.invoiceDate ?
            admin.firestore.Timestamp.fromDate(
                new Date(ocrData.invoiceDate)) :
            null,
          "serviceDate": ocrData.serviceDate ?
            admin.firestore.Timestamp.fromDate(
                new Date(ocrData.serviceDate)) :
            null,
          "dueDate": ocrData.dueDate ?
            admin.firestore.Timestamp.fromDate(
                new Date(ocrData.dueDate)) :
            null,
          "supplier": ocrData.supplier,
          "currency": ocrData.currency,
          "items": ocrData.items,
          "summary": ocrData.summary,
          "paymentMethod": ocrData.paymentMethod,
          "bankAccount": ocrData.bankAccount,
          "documentType": ocrData.documentType || "invoice",
          "isProforma": isProforma,
          "ocrConfidence": ocrData.parseConfidence,
          "ocrWarnings": retryDuplicateResult.isDuplicate ?
            [...(ocrData.warnings || []),
              `DUPLIKAT: ${retryDuplicateResult.message}`] :
            ocrData.warnings,
          "ocrError": admin.firestore.FieldValue.delete(),
          "ocrProcessed": true,
          "ocrProcessedAt":
            admin.firestore.FieldValue.serverTimestamp(),
          "sourceFile.downloadUrl": downloadUrl,
          // proforma → "proforma", duplicate → "rejected", normal → "pending_review"
          "status": isProforma ? "proforma" :
            (retryAutoReject ? "rejected" : "pending_review"),
          "updatedAt":
            admin.firestore.FieldValue.serverTimestamp(),
          "lastOcrRetryAt":
            admin.firestore.FieldValue.serverTimestamp(),
          "lastOcrRetryBy": request.auth.uid,
          // Duplicate detection fields
          ...(retryDuplicateResult.isDuplicate && {
            "duplicateOf":
              retryDuplicateResult.existingInvoiceId,
            "duplicateStatus": "confirmed",
          }),
          ...(!retryDuplicateResult.isDuplicate && {
            "duplicateStatus": "none",
          }),
          // === Payment tracking (preserve manual payments on retry) ===
          "paymentStatus": isProforma ? "unpaid" : (invoiceData.paymentStatus || "unpaid"),
          "payments": invoiceData.payments || [],
          "totalPaid": invoiceData.totalPaid || 0,
          "paymentDate": invoiceData.paymentDate || null,

          // === Proforma suggestion (expense = always suggest) ===
          ...(retryExpenseProformaMatch.matched && {
            "suggestedProformaMatch": {
              proformaInvoiceId: retryExpenseProformaMatch.proformaId,
              proformaNumber: retryExpenseProformaMatch.proformaNumber,
              proformaGross: retryExpenseProformaMatch.proformaGross,
              matchMethod: retryExpenseProformaMatch.matchMethod,
              confidence: retryExpenseProformaMatch.confidence,
            },
          }),
          ...(!retryExpenseProformaMatch.matched && {
            "suggestedProformaMatch": null,
          }),

          // Review tracking (for auto-rejected)
          ...(retryAutoReject && {
            "reviewedBy": "cloud_function_ocr_auto_reject",
            "reviewedAt":
              admin.firestore.FieldValue.serverTimestamp(),
            "reviewNotes": retryRejectReason,
          }),
        };

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

        await db.collection(COLLECTION).doc(invoiceId).update(updateData);

        logger.info("[Expense OCR Retry] ✅ Invoice updated successfully", {
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
        logger.error("[Expense OCR Retry] ❌ Error", {
          error: error.message,
          invoiceId,
        });

        // Update invoice with error
        try {
          await db.collection(COLLECTION).doc(invoiceId).update({
            ocrError: error.message,
            status: "ocr_failed",
            ocrProcessed: false,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastOcrRetryAt: admin.firestore.FieldValue.serverTimestamp(),
            lastOcrRetryBy: request.auth.uid,
          });
        } catch (updateError) {
          logger.error("[Expense OCR Retry] Could not update error status", {
            error: updateError.message,
          });
        }

        if (error instanceof HttpsError) {
          throw error;
        }
        throw new HttpsError("internal", `OCR failed: ${error.message}`);
      }
    },
);

module.exports = {
  onExpenseInvoiceUploaded,
  onExpenseInvoiceDeleted,
  processExpenseInvoiceOcr,
};
