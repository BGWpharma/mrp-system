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
 * - updateExpiryStats         (scheduled: every day 01:00)
 * - checkUnorderedPOReservations (scheduled: every day 08:00)
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
const {checkUnorderedPOReservations} = require("./scheduled/poOrderReminder");

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
exports.checkUnorderedPOReservations = checkUnorderedPOReservations;
