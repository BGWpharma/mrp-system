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
 * - bookMaterialForTask       (callable) - Atomowa rezerwacja materiału
 * - cancelMaterialBooking     (callable) - Atomowe anulowanie rezerwacji
 * - confirmMaterialConsumption (callable) - Atomowa konsumpcja materiałów
 * - onPurchaseOrderUpdate     (trigger: purchaseOrders)
 * - onBatchPriceUpdate        (trigger: _systemEvents)
 * - onProductionTaskCostUpdate (trigger: _systemEvents)
 * - onProductionTaskScheduleUpdate (trigger: productionTasks)
 * - onCmrStatusUpdate         (trigger: cmrDocuments)
 * - updateExpiryStats         (scheduled: every day 01:00)
 */

// Initialize config (must be first!)
require("./config");

// ============================================================================
// CALLABLE FUNCTIONS - Funkcje wywoływane z aplikacji
// ============================================================================
const {refreshExpiryStats} = require("./callable/expiryStats");
const {getRandomBatch} = require("./callable/randomBatch");
const {recalculateShippedQuantities} = require("./callable/recalculateShipped");

// Atomowe operacje rezerwacji i konsumpcji
const {
  bookMaterialForTask,
  cancelMaterialBooking,
  confirmMaterialConsumption,
} = require("./callable/reservationOperations");

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

// Atomowe operacje rezerwacji i konsumpcji
exports.bookMaterialForTask = bookMaterialForTask;
exports.cancelMaterialBooking = cancelMaterialBooking;
exports.confirmMaterialConsumption = confirmMaterialConsumption;

// ============================================================================
// FUTURE FUNCTIONS (commented out)
// ============================================================================
// exports.dailyInventoryReport = onSchedule("0 6 * * *", async (event) => {
//   // Dzienny raport inwentarza
// });
