/**
 * Firebase configuration for BGW-MRP Cloud Functions
 * Shared admin instance and global options
 */

const {setGlobalOptions} = require("firebase-functions/v2");
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK (singleton)
if (!admin.apps.length) {
  admin.initializeApp();
}

// Set global options for all functions
setGlobalOptions({
  maxInstances: 10,
  region: "europe-central2",
  memory: "256MiB",
});

module.exports = {admin};

