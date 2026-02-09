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
 * - suggestAccountsForPosting (callable: AI account suggestions)
 * - onPurchaseOrderUpdate     (trigger: purchaseOrders)
 * - onBatchPriceUpdate        (trigger: _systemEvents)
 * - onProductionTaskCostUpdate (trigger: _systemEvents)
 * - onProductionTaskScheduleUpdate (trigger: productionTasks)
 * - onCmrStatusUpdate         (trigger: cmrDocuments)
 * - onProductionHistoryChange (trigger: productionHistory)
 * - onFactoryCostChange       (trigger: factoryCosts)
 * - onInvoiceAttachmentUploaded (trigger: Storage - PO invoices)
 * - onCmrInvoiceCreated       (trigger: cmrInvoices)
 * - onExpenseInvoiceUploaded  (trigger: Storage - expense invoices)
 * - processExpenseInvoiceOcr  (callable: retry OCR for expense)
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
const {suggestAccountsForPosting} = require("./callable/suggestAccounts");

// ============================================================================
// FIRESTORE TRIGGERS - Automatyczne aktualizacje danych
// ============================================================================
const {onPurchaseOrderUpdate} = require("./triggers/purchaseOrder");
const {onBatchPriceUpdate} = require("./triggers/batchPrice");
const {onProductionTaskCostUpdate} = require("./triggers/productionTask");
const {onProductionTaskScheduleUpdate} = require("./triggers/productionTaskSchedule");
const {onCmrStatusUpdate} = require("./triggers/cmrStatus");
const {onProductionHistoryChange, onFactoryCostChange} = require("./triggers/factoryCost");

// ============================================================================
// INVOICE OCR TRIGGERS - Automatyczne przetwarzanie faktur
// ============================================================================
const {
  onInvoiceAttachmentUploaded,
  onCmrInvoiceCreated,
  onInvoiceAttachmentDeleted,
  onCmrInvoiceDeleted,
  retryInvoiceOcr,
} = require("./triggers/invoiceOcr");

// ============================================================================
// EXPENSE INVOICE OCR TRIGGERS - Faktury kosztowe od pracowników
// ============================================================================
const {
  onExpenseInvoiceUploaded,
  onExpenseInvoiceDeleted,
  processExpenseInvoiceOcr,
} = require("./triggers/expenseInvoiceOcr");

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
exports.suggestAccountsForPosting = suggestAccountsForPosting;
exports.onPurchaseOrderUpdate = onPurchaseOrderUpdate;
exports.onBatchPriceUpdate = onBatchPriceUpdate;
exports.onProductionTaskCostUpdate = onProductionTaskCostUpdate;
exports.onProductionTaskScheduleUpdate = onProductionTaskScheduleUpdate;
exports.onCmrStatusUpdate = onCmrStatusUpdate;
exports.onProductionHistoryChange = onProductionHistoryChange;
exports.onFactoryCostChange = onFactoryCostChange;
exports.updateExpiryStats = updateExpiryStats;
exports.checkUnorderedPOReservations = checkUnorderedPOReservations;

// Invoice OCR Functions
exports.onInvoiceAttachmentUploaded = onInvoiceAttachmentUploaded;
exports.onCmrInvoiceCreated = onCmrInvoiceCreated;
exports.onInvoiceAttachmentDeleted = onInvoiceAttachmentDeleted;
exports.onCmrInvoiceDeleted = onCmrInvoiceDeleted;
exports.retryInvoiceOcr = retryInvoiceOcr;

// Expense Invoice OCR Functions
exports.onExpenseInvoiceUploaded = onExpenseInvoiceUploaded;
exports.onExpenseInvoiceDeleted = onExpenseInvoiceDeleted;
exports.processExpenseInvoiceOcr = processExpenseInvoiceOcr;
