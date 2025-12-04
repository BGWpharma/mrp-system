/**
 * Cloud Functions for BGW-MRP System
 * Region: europe-central2
 * Node.js: 22
 * Firebase Functions: v2 (2nd Gen)
 *
 * DEPLOYMENT:
 * Always deploy individual functions with bgw-mrp prefix:
 * firebase deploy --only functions:bgw-mrp:functionName
 *
 * NEVER use: firebase deploy --only functions (without specific name)
 *
 * Available functions:
 * - refreshExpiryStats        (callable)
 * - getRandomBatch            (callable)
 * - recalculateShippedQuantities (callable)
 * - onPurchaseOrderUpdate     (trigger: purchaseOrders)
 * - onBatchPriceUpdate        (trigger: _systemEvents)
 * - onProductionTaskCostUpdate (trigger: _systemEvents)
 * - onProductionTaskScheduleUpdate (trigger: productionTasks)
 * - onCmrStatusUpdate         (trigger: cmrDocuments)
 * - updateExpiryStats         (scheduled: every 1 hour)
 */

// Initialize config (must be first!)
require("./config");

// ============================================================================
// CALLABLE FUNCTIONS - Funkcje wywoływane z aplikacji
// ============================================================================
const {refreshExpiryStats} = require("./callable/expiryStats");
const {getRandomBatch} = require("./callable/randomBatch");
const {recalculateShippedQuantities} = require("./callable/recalculateShipped");

// ============================================================================
// FIRESTORE TRIGGERS - Automatyczne aktualizacje danych
// ============================================================================
const {onPurchaseOrderUpdate} = require("./triggers/purchaseOrder");
const {onBatchPriceUpdate} = require("./triggers/batchPrice");
const {onProductionTaskCostUpdate} = require("./triggers/productionTask");
const {onProductionTaskScheduleUpdate} = require("./triggers/productionTaskSchedule");
const {onCmrStatusUpdate} = require("./triggers/cmrStatus");

// ============================================================================
// SCHEDULED FUNCTIONS - Zadania cron
// ============================================================================
const {updateExpiryStats} = require("./scheduled/expiryStats");

// ============================================================================
// EXPORTS - Re-export all functions
// ============================================================================
exports.refreshExpiryStats = refreshExpiryStats;
exports.getRandomBatch = getRandomBatch;
exports.recalculateShippedQuantities = recalculateShippedQuantities;
exports.onPurchaseOrderUpdate = onPurchaseOrderUpdate;
exports.onBatchPriceUpdate = onBatchPriceUpdate;
exports.onProductionTaskCostUpdate = onProductionTaskCostUpdate;
exports.onProductionTaskScheduleUpdate = onProductionTaskScheduleUpdate;
exports.onCmrStatusUpdate = onCmrStatusUpdate;
exports.updateExpiryStats = updateExpiryStats;

// ============================================================================
// FUTURE FUNCTIONS (commented out)
// ============================================================================
// exports.dailyInventoryReport = onSchedule("0 6 * * *", async (event) => {
//   // Dzienny raport inwentarza
// });
