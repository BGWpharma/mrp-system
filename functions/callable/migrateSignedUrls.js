/**
 * Migrate Signed URLs - One-time Callable Function
 * Regenerates expired GCS signed URLs → Firebase download token URLs
 * for purchaseInvoices and expenseInvoices collections.
 *
 * DEPLOYMENT:
 * firebase deploy --only functions:bgw-mrp:migrateSignedUrls --force
 */

const {onCall} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const {admin} = require("../config");
const {v4: uuidv4} = require("uuid");

const db = admin.firestore();
const bucket = admin.storage().bucket();

/**
 * @param {string} filePath
 * @return {Promise<string|null>}
 */
const generateTokenUrl = async (filePath) => {
  const file = bucket.file(filePath);
  const [exists] = await file.exists();
  if (!exists) return null;

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

/**
 * @param {string} collectionName
 * @return {Promise<{updated: number, skipped: number, errors: number}>}
 */
const migrateCollection = async (collectionName) => {
  const snapshot = await db.collection(collectionName).get();
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const storagePath = data.sourceFile?.storagePath;

    if (!storagePath) {
      skipped++;
      continue;
    }

    const currentUrl = data.sourceFile?.downloadUrl;
    if (currentUrl && !currentUrl.includes("storage.googleapis.com")) {
      skipped++;
      continue;
    }

    try {
      const newUrl = await generateTokenUrl(storagePath);
      if (!newUrl) {
        logger.warn(`[migrate] File not found: ${storagePath} (doc ${doc.id})`);
        skipped++;
        continue;
      }

      await doc.ref.update({"sourceFile.downloadUrl": newUrl});
      updated++;

      if (updated % 50 === 0) {
        logger.info(`[migrate] ${collectionName}: ${updated} updated so far`);
      }
    } catch (err) {
      logger.error(`[migrate] Error for ${doc.id}: ${err.message}`);
      errors++;
    }
  }

  return {updated, skipped, errors};
};

const migrateSignedUrls = onCall(
    {
      region: "europe-central2",
      memory: "1GiB",
      timeoutSeconds: 540,
    },
    async (request) => {
      if (!request.auth) {
        throw new Error("Unauthorized - authentication required");
      }

      logger.info("migrateSignedUrls - start", {uid: request.auth.uid});

      const purchaseResult = await migrateCollection("purchaseInvoices");
      logger.info("[migrate] purchaseInvoices done", purchaseResult);

      const expenseResult = await migrateCollection("expenseInvoices");
      logger.info("[migrate] expenseInvoices done", expenseResult);

      const summary = {
        purchaseInvoices: purchaseResult,
        expenseInvoices: expenseResult,
      };

      logger.info("[migrate] Migration complete", summary);
      return summary;
    },
);

module.exports = {migrateSignedUrls};
