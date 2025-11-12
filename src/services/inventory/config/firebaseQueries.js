// src/services/inventory/config/firebaseQueries.js

import { 
  collection, 
  doc, 
  query, 
  where,
  orderBy,
  limit,
  startAfter,
  endBefore,
  limitToLast,
  startAt,
  endAt,
  Timestamp
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { COLLECTIONS, DATE_DEFAULTS } from './constants.js';

/**
 * Pomocnicze funkcje do tworzenia zapytań Firebase
 */
export class FirebaseQueryBuilder {
  
  /**
   * Tworzy referencję do kolekcji
   */
  static getCollectionRef(collectionName) {
    return collection(db, collectionName);
  }

  /**
   * Tworzy referencję do dokumentu
   */
  static getDocRef(collectionName, docId) {
    return doc(db, collectionName, docId);
  }

  /**
   * Tworzy zapytanie dla pozycji magazynowych z sortowaniem
   */
  static buildInventoryItemsQuery(sortField = 'name', sortDirection = 'asc') {
    return query(
      this.getCollectionRef(COLLECTIONS.INVENTORY),
      orderBy(sortField, sortDirection)
    );
  }

  /**
   * Tworzy zapytanie dla partii magazynowych
   */
  static buildBatchesQuery(itemId, warehouseId = null) {
    let q = query(
      this.getCollectionRef(COLLECTIONS.INVENTORY_BATCHES),
      where('itemId', '==', itemId)
    );

    if (warehouseId) {
      q = query(q, where('warehouseId', '==', warehouseId));
    }

    return q;
  }

  /**
   * Tworzy zapytanie dla partii z dodatkowymi filtrami
   */
  static buildBatchesWithFiltersQuery(filters = {}) {
    let q = this.getCollectionRef(COLLECTIONS.INVENTORY_BATCHES);

    if (filters.itemId) {
      q = query(q, where('itemId', '==', filters.itemId));
    }

    if (filters.warehouseId) {
      q = query(q, where('warehouseId', '==', filters.warehouseId));
    }

    if (filters.minQuantity !== undefined) {
      q = query(q, where('quantity', '>', filters.minQuantity));
    }

    if (filters.orderBy) {
      q = query(q, orderBy(filters.orderBy.field, filters.orderBy.direction || 'asc'));
    }

    return q;
  }

  /**
   * Tworzy zapytanie dla wygasających partii
   */
  static buildExpiringBatchesQuery(daysThreshold = 365) {
    const today = new Date();
    const thresholdDate = new Date();
    thresholdDate.setDate(today.getDate() + daysThreshold);

    return query(
      this.getCollectionRef(COLLECTIONS.INVENTORY_BATCHES),
      where('expiryDate', '>=', Timestamp.fromDate(today)),
      where('expiryDate', '<=', Timestamp.fromDate(thresholdDate)),
      where('expiryDate', '>=', Timestamp.fromDate(DATE_DEFAULTS.MIN_VALID_DATE)),
      where('quantity', '>', 0),
      orderBy('expiryDate', 'asc')
    );
  }

  /**
   * Tworzy zapytanie dla przeterminowanych partii
   */
  static buildExpiredBatchesQuery() {
    const today = new Date();

    return query(
      this.getCollectionRef(COLLECTIONS.INVENTORY_BATCHES),
      where('expiryDate', '<', Timestamp.fromDate(today)),
      where('expiryDate', '>=', Timestamp.fromDate(DATE_DEFAULTS.MIN_VALID_DATE)),
      where('quantity', '>', 0),
      orderBy('expiryDate', 'desc')
    );
  }

  /**
   * Tworzy zapytanie dla transakcji
   */
  static buildTransactionsQuery(itemId = null, transactionType = null, orderByField = 'transactionDate', orderDirection = 'desc') {
    let q = this.getCollectionRef(COLLECTIONS.INVENTORY_TRANSACTIONS);

    if (itemId) {
      q = query(q, where('itemId', '==', itemId));
    }

    if (transactionType) {
      q = query(q, where('type', '==', transactionType));
    }

    q = query(q, orderBy(orderByField, orderDirection));

    return q;
  }

  /**
   * Tworzy zapytanie dla transakcji z paginacją
   */
  static buildPaginatedTransactionsQuery(options = {}) {
    const {
      filters = [],
      orderBy: orderByOptions = { field: 'transactionDate', direction: 'desc' },
      pageSize = 50,
      lastVisible = null
    } = options;

    let q = query(
      this.getCollectionRef(COLLECTIONS.INVENTORY_TRANSACTIONS),
      orderBy(orderByOptions.field, orderByOptions.direction)
    );

    // Dodaj filtry
    filters.forEach(filter => {
      if (filter.field && filter.operator && filter.value !== undefined) {
        q = query(q, where(filter.field, filter.operator, filter.value));
      }
    });

    // Dodaj cursor pagination
    if (lastVisible) {
      q = query(q, startAfter(lastVisible));
    }

    // Dodaj limit
    q = query(q, limit(pageSize));

    return q;
  }

  /**
   * Tworzy zapytanie dla rezerwacji partii
   */
  static buildBatchReservationsQuery(batchId, transactionType = 'booking') {
    return query(
      this.getCollectionRef(COLLECTIONS.INVENTORY_TRANSACTIONS),
      where('batchId', '==', batchId),
      where('type', '==', transactionType)
    );
  }

  /**
   * Tworzy zapytanie dla anulowań rezerwacji
   */
  static buildBookingCancellationQuery(batchId) {
    return query(
      this.getCollectionRef(COLLECTIONS.INVENTORY_TRANSACTIONS),
      where('batchId', '==', batchId),
      where('type', '==', 'booking_cancel')
    );
  }

  /**
   * Tworzy zapytanie dla partii w ramach zamówienia zakupowego
   */
  static buildPurchaseOrderBatchesQuery(itemId, orderId, itemPoId, warehouseId) {
    return query(
      this.getCollectionRef(COLLECTIONS.INVENTORY_BATCHES),
      where('itemId', '==', itemId),
      where('purchaseOrderDetails.id', '==', orderId),
      where('purchaseOrderDetails.itemPoId', '==', itemPoId),
      where('warehouseId', '==', warehouseId)
    );
  }

  /**
   * Tworzy zapytanie dla partii w starym formacie (kompatybilność)
   */
  static buildLegacyPurchaseOrderBatchesQuery(itemId, orderId, itemPoId, warehouseId) {
    return query(
      this.getCollectionRef(COLLECTIONS.INVENTORY_BATCHES),
      where('itemId', '==', itemId),
      where('sourceDetails.orderId', '==', orderId),
      where('sourceDetails.itemPoId', '==', itemPoId),
      where('warehouseId', '==', warehouseId)
    );
  }

  /**
   * Tworzy zapytanie dla magazynów
   */
  static buildWarehousesQuery(orderByField = 'name', orderDirection = 'asc') {
    return query(
      this.getCollectionRef(COLLECTIONS.WAREHOUSES),
      orderBy(orderByField, orderDirection)
    );
  }

  /**
   * Tworzy zapytanie dla grupowego pobierania partii (do optymalizacji)
   */
  static buildBatchGroupQuery(itemIds, warehouseId = null) {
    let q = query(
      this.getCollectionRef(COLLECTIONS.INVENTORY_BATCHES),
      where('itemId', 'in', itemIds)
    );

    if (warehouseId) {
      q = query(q, where('warehouseId', '==', warehouseId));
    }

    return q;
  }

  /**
   * Tworzy zapytanie dla grupowego pobierania rezerwacji (do optymalizacji)
   */
  static buildReservationGroupQuery(batchIds, transactionType = 'booking') {
    return query(
      this.getCollectionRef(COLLECTIONS.INVENTORY_TRANSACTIONS),
      where('batchId', 'in', batchIds),
      where('type', '==', transactionType)
    );
  }
}

/**
 * Eksportowane pomocnicze funkcje dla wstecznej kompatybilności
 */
export const getInventoryCollectionRef = () => FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY);
export const getBatchesCollectionRef = () => FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_BATCHES);
export const getTransactionsCollectionRef = () => FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_TRANSACTIONS);
export const getWarehousesCollectionRef = () => FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.WAREHOUSES);
export const getStocktakingCollectionRef = () => FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_STOCKTAKING);
export const getSupplierPricesCollectionRef = () => FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_SUPPLIER_PRICES);