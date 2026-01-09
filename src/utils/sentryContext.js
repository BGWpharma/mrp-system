// src/utils/sentryContext.js
import * as Sentry from '@sentry/react';

/**
 * Helper do ustawiania kontekstu biznesowego w Sentry
 * Pozwala dodawać dodatkowe dane do każdego błędu
 */

/**
 * Ustaw kontekst zadania produkcyjnego
 * @param {Object} task - Obiekt zadania
 */
export const setTaskContext = (task) => {
  if (!task) {
    Sentry.setContext('task', null);
    return;
  }
  
  Sentry.setContext('task', {
    id: task.id,
    moNumber: task.moNumber,
    lotNumber: task.lotNumber,
    status: task.status,
    recipeId: task.recipeId,
    recipeName: task.recipeName,
    targetQuantity: task.targetQuantity,
    unit: task.unit,
    hasReservations: task.reservations?.length > 0 || false,
    reservationsCount: task.reservations?.length || 0,
    hasMaterialLinks: task.materialLinks?.length > 0 || false,
    materialsCount: task.materialLinks?.length || 0,
    isCompleted: task.status === 'completed',
    priority: task.priority || 'normal',
  });
  
  // Dodaj jako tags dla łatwego filtrowania
  Sentry.setTags({
    'task.status': task.status,
    'task.priority': task.priority || 'normal',
    'task.hasReservations': task.reservations?.length > 0 || false,
  });
};

/**
 * Ustaw kontekst zamówienia klienta
 * @param {Object} order - Obiekt zamówienia
 */
export const setOrderContext = (order) => {
  if (!order) {
    Sentry.setContext('order', null);
    return;
  }
  
  Sentry.setContext('order', {
    id: order.id,
    orderNumber: order.orderNumber,
    customerId: order.customerId,
    customerName: order.customerName,
    status: order.status,
    totalValue: order.totalValue,
    itemsCount: order.items?.length || 0,
    deliveryDate: order.deliveryDate,
    isUrgent: order.isUrgent || false,
  });
  
  Sentry.setTags({
    'order.status': order.status,
    'order.isUrgent': order.isUrgent || false,
  });
};

/**
 * Ustaw kontekst pozycji magazynowej
 * @param {Object} item - Obiekt pozycji magazynowej
 */
export const setInventoryContext = (item) => {
  if (!item) {
    Sentry.setContext('inventory', null);
    return;
  }
  
  Sentry.setContext('inventory', {
    id: item.id,
    name: item.name,
    sku: item.sku,
    category: item.category,
    currentQuantity: item.quantity,
    unit: item.unit,
    hasBatches: item.batches?.length > 0 || false,
    batchesCount: item.batches?.length || 0,
    isLowStock: item.quantity < (item.minimumStock || 0),
    warehouseId: item.warehouseId,
  });
  
  Sentry.setTags({
    'inventory.category': item.category,
    'inventory.isLowStock': item.quantity < (item.minimumStock || 0),
  });
};

/**
 * Ustaw kontekst partii magazynowej
 * @param {Object} batch - Obiekt partii
 */
export const setBatchContext = (batch) => {
  if (!batch) {
    Sentry.setContext('batch', null);
    return;
  }
  
  Sentry.setContext('batch', {
    id: batch.id,
    batchNumber: batch.batchNumber,
    lotNumber: batch.lotNumber,
    itemId: batch.itemId,
    quantity: batch.quantity,
    remainingQuantity: batch.remainingQuantity,
    expiryDate: batch.expiryDate,
    isExpired: batch.expiryDate ? new Date(batch.expiryDate) < new Date() : false,
    supplierId: batch.supplierId,
    purchaseOrderId: batch.purchaseOrderId,
  });
  
  Sentry.setTags({
    'batch.hasExpiryDate': !!batch.expiryDate,
    'batch.isExpired': batch.expiryDate ? new Date(batch.expiryDate) < new Date() : false,
  });
};

/**
 * Ustaw kontekst receptury
 * @param {Object} recipe - Obiekt receptury
 */
export const setRecipeContext = (recipe) => {
  if (!recipe) {
    Sentry.setContext('recipe', null);
    return;
  }
  
  Sentry.setContext('recipe', {
    id: recipe.id,
    name: recipe.name,
    recipeNumber: recipe.recipeNumber,
    version: recipe.version,
    status: recipe.status,
    ingredientsCount: recipe.ingredients?.length || 0,
    isActive: recipe.status === 'active',
    category: recipe.category,
  });
  
  Sentry.setTags({
    'recipe.status': recipe.status,
    'recipe.category': recipe.category,
  });
};

/**
 * Ustaw kontekst zamówienia zakupu
 * @param {Object} po - Obiekt zamówienia zakupu
 */
export const setPurchaseOrderContext = (po) => {
  if (!po) {
    Sentry.setContext('purchaseOrder', null);
    return;
  }
  
  Sentry.setContext('purchaseOrder', {
    id: po.id,
    poNumber: po.poNumber,
    supplierId: po.supplierId,
    supplierName: po.supplierName,
    status: po.status,
    totalValue: po.totalValue,
    currency: po.currency,
    itemsCount: po.items?.length || 0,
    expectedDeliveryDate: po.expectedDeliveryDate,
  });
  
  Sentry.setTags({
    'po.status': po.status,
    'po.currency': po.currency,
  });
};

/**
 * Ustaw kontekst faktury
 * @param {Object} invoice - Obiekt faktury
 */
export const setInvoiceContext = (invoice) => {
  if (!invoice) {
    Sentry.setContext('invoice', null);
    return;
  }
  
  Sentry.setContext('invoice', {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    customerId: invoice.customerId,
    customerName: invoice.customerName,
    status: invoice.status,
    totalValue: invoice.totalValue,
    currency: invoice.currency,
    dueDate: invoice.dueDate,
    isPaid: invoice.isPaid || false,
  });
  
  Sentry.setTags({
    'invoice.status': invoice.status,
    'invoice.isPaid': invoice.isPaid || false,
  });
};

/**
 * Ustaw ogólny kontekst strony
 * Przydatne dla śledzenia gdzie użytkownik się znajduje
 * 
 * @param {string} pageName - Nazwa strony (np. 'TaskDetailsPage', 'InventoryList')
 * @param {Object} pageData - Dodatkowe dane strony
 */
export const setPageContext = (pageName, pageData = {}) => {
  if (!pageName) {
    Sentry.setContext('page', null);
    return;
  }
  
  Sentry.setContext('page', {
    name: pageName,
    ...pageData,
    timestamp: new Date().toISOString(),
  });
  
  Sentry.setTag('page.name', pageName);
};

/**
 * Ustaw kontekst użytkownika w trybie tylko do odczytu
 * Używane automatycznie w AuthContext, ale można użyć do dodania więcej danych
 * 
 * @param {Object} userData - Dodatkowe dane użytkownika
 */
export const setUserContext = (userData) => {
  if (!userData) {
    return;
  }
  
  // Sentry.setUser jest już używane w AuthContext
  // Ta funkcja pozwala dodać więcej danych
  Sentry.setContext('userDetails', {
    lastLogin: userData.lastLogin,
    preferences: userData.preferences,
    // Nie dodawaj wrażliwych danych!
  });
};

/**
 * Wyczyść wszystkie konteksty
 * Przydatne przy wylogowaniu lub zmianie widoku
 */
export const clearAllContexts = () => {
  Sentry.setContext('task', null);
  Sentry.setContext('order', null);
  Sentry.setContext('inventory', null);
  Sentry.setContext('batch', null);
  Sentry.setContext('recipe', null);
  Sentry.setContext('purchaseOrder', null);
  Sentry.setContext('invoice', null);
  Sentry.setContext('page', null);
  Sentry.setContext('userDetails', null);
};

/**
 * Hook React do automatycznego ustawiania kontekstu strony
 * Użyj w useEffect komponentu
 */
export const usePageContext = (pageName, pageData = {}) => {
  React.useEffect(() => {
    setPageContext(pageName, pageData);
    
    return () => {
      setPageContext(null);
    };
  }, [pageName, JSON.stringify(pageData)]);
};

export default {
  setTaskContext,
  setOrderContext,
  setInventoryContext,
  setBatchContext,
  setRecipeContext,
  setPurchaseOrderContext,
  setInvoiceContext,
  setPageContext,
  setUserContext,
  clearAllContexts,
  usePageContext,
};

