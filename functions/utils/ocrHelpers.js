/**
 * Shared OCR helper functions used by invoiceOcr and expenseInvoiceOcr triggers.
 *
 * @module utils/ocrHelpers
 */

const logger = require("firebase-functions/logger");
const {admin} = require("../config");
const {v4: uuidv4} = require("uuid");

/**
 * Safely parse a date string from OCR output to a Firestore Timestamp.
 * Returns null if the string is missing or produces an invalid Date.
 * @param {string} dateStr - Date string from OCR
 * @param {string} [logPrefix="OCR"] - Log prefix for warnings
 * @return {FirebaseFirestore.Timestamp|null}
 */
const safeParseDateToTimestamp = (dateStr, logPrefix = "OCR") => {
  if (!dateStr) return null;
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) {
    logger.warn(`[${logPrefix}] Invalid date format: ${dateStr}`);
    return null;
  }
  return admin.firestore.Timestamp.fromDate(parsed);
};

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
 * Get a persistent Firebase download URL for a file.
 * Uses Firebase Storage download tokens instead of GCS signed URLs,
 * because signed URLs break when Google rotates the managed signing keys.
 * @param {Object} bucket - Storage bucket reference
 * @param {string} filePath - Path to file in Storage
 * @return {Promise<string>} Firebase download URL (token-based, never expires)
 */
const getSignedUrl = async (bucket, filePath) => {
  const file = bucket.file(filePath);
  const [metadata] = await file.getMetadata();
  let token = metadata.metadata?.firebaseStorageDownloadTokens;

  if (!token) {
    token = uuidv4();
    await file.setMetadata({
      metadata: {firebaseStorageDownloadTokens: token},
    });
  }

  const encodedPath = encodeURIComponent(filePath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${token}`;
};

module.exports = {
  safeParseDateToTimestamp,
  getFileAsBase64,
  getSignedUrl,
};
