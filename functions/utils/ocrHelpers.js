/**
 * Shared OCR helper functions used by invoiceOcr and expenseInvoiceOcr triggers.
 *
 * @module utils/ocrHelpers
 */

const logger = require("firebase-functions/logger");
const {admin} = require("../config");

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
 * Get signed download URL for file
 * @param {Object} bucket - Storage bucket reference
 * @param {string} filePath - Path to file in Storage
 * @return {Promise<string>} Signed URL
 */
const getSignedUrl = async (bucket, filePath) => {
  const file = bucket.file(filePath);
  const [url] = await file.getSignedUrl({
    action: "read",
    expires: "03-01-2500",
  });
  return url;
};

module.exports = {
  safeParseDateToTimestamp,
  getFileAsBase64,
  getSignedUrl,
};
