// src/services/inventory/config/constants.js

/**
 * Stałe kolekcji Firebase dla systemu inwentarza
 */
export const COLLECTIONS = {
  INVENTORY: 'inventory',
  INVENTORY_TRANSACTIONS: 'inventoryTransactions',
  INVENTORY_BATCHES: 'inventoryBatches',
  WAREHOUSES: 'warehouses',
  INVENTORY_STOCKTAKING: 'stocktaking',
  INVENTORY_STOCKTAKING_ITEMS: 'stocktakingItems',
  INVENTORY_SUPPLIER_PRICES: 'inventorySupplierPrices',
  INVENTORY_SUPPLIER_PRICE_HISTORY: 'inventorySupplierPriceHistory'
};

/**
 * Typy transakcji magazynowych
 */
export const TRANSACTION_TYPES = {
  RECEIVE: 'RECEIVE',
  ISSUE: 'ISSUE',
  BOOKING: 'booking',
  BOOKING_CANCEL: 'booking_cancel',
  ADJUSTMENT_ADD: 'adjustment-add',
  ADJUSTMENT_REMOVE: 'adjustment-remove',
  TRANSFER: 'TRANSFER',
  DELETE_BATCH_AFTER_TRANSFER: 'DELETE_BATCH_AFTER_TRANSFER',
  STOCKTAKING: 'stocktaking',
  STOCKTAKING_DELETION: 'stocktaking-deletion',
  STOCKTAKING_COMPLETED: 'stocktaking-completed',
  STOCKTAKING_CORRECTION_COMPLETED: 'stocktaking-correction-completed',
  STOCKTAKING_REOPEN: 'stocktaking-reopen'
};

/**
 * Metody rezerwacji partii
 */
export const RESERVATION_METHODS = {
  EXPIRY: 'expiry', // Według daty ważności (FEFO)
  FIFO: 'fifo',     // Pierwszy przyjęty, pierwszy wydany
  MANUAL: 'manual'  // Ręczny wybór partii
};

/**
 * Statusy rezerwacji
 */
export const RESERVATION_STATUS = {
  ACTIVE: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

/**
 * Statusy spisu z natury
 */
export const STOCKTAKING_STATUS = {
  OPEN: 'Otwarta',
  IN_PROGRESS: 'W trakcie',
  IN_CORRECTION: 'W korekcie',
  COMPLETED: 'Zakończona',
  CANCELLED: 'Anulowana'
};

/**
 * Domyślne ustawienia paginacji
 */
export const PAGINATION_DEFAULTS = {
  PAGE_SIZE: 50,
  MAX_PAGE_SIZE: 100
};

/**
 * Domyślne ustawienia precyzji obliczeń
 */
export const PRECISION_DEFAULTS = {
  QUANTITY: 3,
  PRICE: 2,
  PERCENTAGE: 4
};

/**
 * Limity dla Firebase
 */
export const FIREBASE_LIMITS = {
  BATCH_SIZE: 10,     // Maksymalna liczba elementów w zapytaniu 'in'
  MAX_DOCUMENT_SIZE: 1048576 // 1MB limit Firestore
};

/**
 * Mapowanie pól sortowania
 */
export const SORT_FIELD_MAPPING = {
  'totalQuantity': 'quantity',
  'name': 'name',
  'category': 'category',
  'availableQuantity': 'quantity',
  'reservedQuantity': 'bookedQuantity'
};

/**
 * Limity zapytań dla różnych operacji
 */
export const QUERY_LIMITS = {
  TRANSACTIONS_DEFAULT: 50,
  TRANSACTIONS_PAGINATED: 25,
  TRANSACTIONS_EXPORT_MAX: 10000,
  BATCHES_DEFAULT: 100,
  ITEMS_DEFAULT: 50
};

/**
 * Domyślne wartości dla dat
 */
export const DATE_DEFAULTS = {
  MIN_VALID_DATE: new Date(1971, 0, 1), // 1 stycznia 1971
  DEFAULT_EXPIRY_THRESHOLD_DAYS: 30
};