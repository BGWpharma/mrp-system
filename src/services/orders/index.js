// src/services/orders/index.js
// Barrel file re-exporting order and order items import services

export {
  getAllOrders,
  getOrdersByDateRange,
  getOrderById,
  createOrder,
  createPurchaseOrder,
  updateOrder,
  deleteOrder,
  updateOrderItemName,
  updateOrderItemShippedQuantity,
  updateOrderItemShippedQuantityPrecise,
  updateOrderStatus,
  getCustomerOrders,
  getOrdersStats,
  calculateOrderTotal,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  DEFAULT_ORDER_ITEM,
  DEFAULT_ORDER,
  addProductionTaskToOrder,
  removeProductionTaskFromOrder,
  updateProductionTaskInOrder,
  searchOrdersByNumber,
  getLastRecipeUsageInfo,
  migrateCmrHistoryData,
  clearOrdersCache,
  forceRefreshOrdersCache,
  updateOrderInCache,
  addOrderToCache,
  removeOrderFromCache,
  getOrdersOptimized,
  getOrdersWithPagination,
  refreshShippedQuantitiesFromCMR,
  safeRecalculateShippedQuantities,
  debugOrderCMRConnections,
  cleanupObsoleteCMRConnections,
  getOrdersByProductionTaskId,
  updateCustomerOrderNumber,
  validateOrderNumberFormat,
  archiveOrder,
  unarchiveOrder
} from './orderService';

export {
  parseOrderItemsCSV,
  matchRecipesFromCSV,
  prepareOrderItemsFromCSV,
  generateOrderItemsTemplate
} from './orderItemsImportService';
