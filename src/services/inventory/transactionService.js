// src/services/inventory/transactionService.js

import { 
  collection, 
  doc, 
  getDocs, 
  getDoc,
  updateDoc,
  query, 
  where,
  orderBy,
  limit,
  startAfter
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { 
  COLLECTIONS, 
  TRANSACTION_TYPES,
  QUERY_LIMITS 
} from './config/constants.js';
import { 
  validateId, 
  validatePositiveNumber,
  validateArray,
  ValidationError 
} from './utils/validators.js';
import { 
  convertTimestampToDate,
  formatDateToLocal 
} from './utils/formatters.js';
import { FirebaseQueryBuilder } from './config/firebaseQueries.js';

/**
 * Usługa transakcji i historii magazynowej
 * 
 * Ten moduł zawiera wszystkie funkcje związane z transakcjami magazynowymi:
 * - Pobieranie transakcji dla pozycji
 * - Pobieranie wszystkich transakcji z filtrami
 * - Paginowane pobieranie transakcji
 * - Analiza historii zmian
 * - Raportowanie i eksport danych transakcyjnych
 */

/**
 * Pobiera wszystkie transakcje dla danej pozycji magazynowej
 * @param {string} itemId - ID pozycji magazynowej
 * @param {Object} options - Opcje dodatkowe
 * @param {boolean} options.enrichWithTaskData - Czy wzbogacić dane o informacje z zadań
 * @param {boolean} options.enrichWithBatchData - Czy wzbogacić dane o informacje o partiach
 * @param {number} options.limit - Limit rekordów
 * @returns {Promise<Array>} - Lista transakcji
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const getItemTransactions = async (itemId, options = {}) => {
  try {
    // Walidacja parametrów
    const validatedItemId = validateId(itemId, 'itemId');
    const {
      enrichWithTaskData = true,
      enrichWithBatchData = true,
      limit: queryLimit = QUERY_LIMITS.TRANSACTIONS_DEFAULT
    } = options;

    if (queryLimit) {
      validatePositiveNumber(queryLimit, 'limit');
    }

    const transactionsRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_TRANSACTIONS);
    let q = query(
      transactionsRef,
      where('itemId', '==', validatedItemId),
      orderBy('createdAt', 'desc')
    );

    if (queryLimit) {
      q = query(q, limit(queryLimit));
    }
    
    const querySnapshot = await getDocs(q);
    
    // Pobierz wszystkie transakcje
    const transactions = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: convertTimestampToDate(data.createdAt),
        updatedAt: convertTimestampToDate(data.updatedAt),
        transactionDate: convertTimestampToDate(data.transactionDate) || convertTimestampToDate(data.createdAt)
      };
    });
    
    // Wzbogacenie danych o informacje z zadań produkcyjnych
    if (enrichWithTaskData) {
      await enrichTransactionsWithTaskData(transactions);
    }

    // Wzbogacenie danych o informacje o partiach
    if (enrichWithBatchData) {
      await enrichTransactionsWithBatchData(transactions, validatedItemId);
    }
    
    return transactions;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas pobierania transakcji pozycji:', error);
    throw new Error(`Nie udało się pobrać transakcji pozycji: ${error.message}`);
  }
};

/**
 * Pobiera wszystkie transakcje magazynowe z opcjonalnymi filtrami
 * @param {Object} options - Opcje zapytania
 * @param {number} options.limit - Limit rekordów (domyślnie 50)
 * @param {Array<string>} options.selectFields - Pola do wybrania
 * @param {Array} options.filters - Filtry zapytania
 * @param {Object} options.orderBy - Sortowanie
 * @param {string} options.orderBy.field - Pole sortowania
 * @param {string} options.orderBy.direction - Kierunek sortowania ('asc'|'desc')
 * @returns {Promise<Array>} - Lista transakcji
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const getAllTransactions = async (options = {}) => {
  try {
    const {
      limit: queryLimit = QUERY_LIMITS.TRANSACTIONS_DEFAULT,
      selectFields = null,
      filters = [],
      orderBy: orderByOptions = { field: 'transactionDate', direction: 'desc' }
    } = options;

    // Walidacja parametrów
    if (queryLimit) {
      validatePositiveNumber(queryLimit, 'limit');
    }

    if (selectFields) {
      validateArray(selectFields, 'selectFields');
    }

    if (filters) {
      validateArray(filters, 'filters');
    }

    const transactionsRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_TRANSACTIONS);
    
    // Utwórz zapytanie z sortowaniem
    let q = query(
      transactionsRef, 
      orderBy(orderByOptions.field, orderByOptions.direction)
    );

    // Dodaj filtry
    if (filters && filters.length > 0) {
      filters.forEach(filter => {
        if (filter.field && filter.operator && filter.value !== undefined) {
          q = query(q, where(filter.field, filter.operator, filter.value));
        }
      });
    }

    // Dodaj limit
    if (queryLimit) {
      q = query(q, limit(queryLimit));
    }
    
    const querySnapshot = await getDocs(q);
    
    // Przetwórz wyniki
    let transactions;
    
    if (selectFields && selectFields.length > 0) {
      // Zwróć tylko wybrane pola
      transactions = querySnapshot.docs.map(doc => {
        const data = doc.data();
        const result = { id: doc.id };
        
        selectFields.forEach(field => {
          if (data.hasOwnProperty(field)) {
            if (field.includes('At') || field.includes('Date')) {
              result[field] = convertTimestampToDate(data[field]);
            } else {
              result[field] = data[field];
            }
          }
        });
        
        return result;
      });
    } else {
      // Zwróć wszystkie pola z konwersją dat
      transactions = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: convertTimestampToDate(data.createdAt),
          updatedAt: convertTimestampToDate(data.updatedAt),
          transactionDate: convertTimestampToDate(data.transactionDate) || convertTimestampToDate(data.createdAt),
          completedAt: convertTimestampToDate(data.completedAt),
          cancelledAt: convertTimestampToDate(data.cancelledAt)
        };
      });
    }

    return transactions;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas pobierania wszystkich transakcji:', error);
    throw new Error(`Nie udało się pobrać transakcji: ${error.message}`);
  }
};

/**
 * Pobiera transakcje magazynowe z paginacją opartą na kursorach
 * @param {Object} options - Opcje zapytania
 * @param {number} options.limit - Liczba dokumentów na stronę
 * @param {Array<string>} options.selectFields - Pola do wybrania (opcjonalnie)
 * @param {Object} options.lastVisible - Ostatni widoczny dokument (kursor)
 * @param {Array} options.filters - Dodatkowe filtry dla zapytania
 * @param {Object} options.orderBy - Pole i kierunek sortowania
 * @param {string} options.orderBy.field - Pole sortowania
 * @param {string} options.orderBy.direction - Kierunek sortowania ('asc'|'desc')
 * @returns {Promise<Object>} - Dane transakcji oraz kursor do następnej strony
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const getInventoryTransactionsPaginated = async (options = {}) => {
  try {
    // Walidacja i domyślne wartości
    const pageSize = options.limit || QUERY_LIMITS.TRANSACTIONS_PAGINATED;
    const selectFields = options.selectFields || null;
    const lastDoc = options.lastVisible || null;
    
    // Walidacja parametrów
    validatePositiveNumber(pageSize, 'limit');
    
    if (selectFields) {
      validateArray(selectFields, 'selectFields');
    }

    if (options.filters) {
      validateArray(options.filters, 'filters');
    }
    
    // Utwórz początkowe zapytanie z sortowaniem
    const orderByField = options.orderBy?.field || 'transactionDate';
    const orderByDirection = options.orderBy?.direction || 'desc';
    
    let transactionsQuery = query(
      FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_TRANSACTIONS),
      orderBy(orderByField, orderByDirection)
    );
    
    // Dodaj filtry do zapytania
    if (options.filters && Array.isArray(options.filters)) {
      options.filters.forEach(filter => {
        if (filter.field && filter.operator && filter.value !== undefined) {
          transactionsQuery = query(
            transactionsQuery, 
            where(filter.field, filter.operator, filter.value)
          );
        }
      });
    }
    
    // Dodaj kursor paginacji jeśli istnieje
    if (lastDoc) {
      transactionsQuery = query(
        transactionsQuery,
        startAfter(lastDoc)
      );
    }
    
    // Dodaj limit
    transactionsQuery = query(
      transactionsQuery,
      limit(pageSize)
    );
    
    // Wykonaj zapytanie
    const querySnapshot = await getDocs(transactionsQuery);
    
    // Przygotuj kursor do następnej strony
    const lastVisible = querySnapshot.docs.length > 0 
      ? querySnapshot.docs[querySnapshot.docs.length - 1]
      : null;
    
    // Przetwórz wyniki
    let transactions;
    
    // Jeśli zdefiniowano selectFields, zwróć tylko wybrane pola
    if (selectFields && Array.isArray(selectFields) && selectFields.length > 0) {
      transactions = querySnapshot.docs.map(doc => {
        const data = doc.data();
        const result = { id: doc.id };
        
        // Dodaj tylko wybrane pola z konwersją dat
        selectFields.forEach(field => {
          if (data.hasOwnProperty(field)) {
            if (field.includes('At') || field.includes('Date')) {
              result[field] = convertTimestampToDate(data[field]);
            } else {
              result[field] = data[field];
            }
          }
        });
        
        return result;
      });
    } else {
      // W przeciwnym razie zwróć wszystkie pola z konwersją dat
      transactions = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: convertTimestampToDate(data.createdAt),
          updatedAt: convertTimestampToDate(data.updatedAt),
          transactionDate: convertTimestampToDate(data.transactionDate) || convertTimestampToDate(data.createdAt),
          completedAt: convertTimestampToDate(data.completedAt),
          cancelledAt: convertTimestampToDate(data.cancelledAt)
        };
      });
    }
    
    return {
      transactions,
      lastVisible,
      hasMore: querySnapshot.docs.length === pageSize,
      totalLoaded: querySnapshot.docs.length
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas pobierania transakcji z paginacją:', error);
    return { 
      transactions: [], 
      lastVisible: null, 
      hasMore: false, 
      totalLoaded: 0,
      error: error.message 
    };
  }
};

/**
 * Pobiera transakcje według typu dla danej pozycji
 * @param {string} itemId - ID pozycji magazynowej
 * @param {string|Array<string>} transactionTypes - Typ(y) transakcji
 * @param {Object} options - Opcje dodatkowe
 * @param {number} options.limit - Limit rekordów
 * @param {Object} options.dateRange - Zakres dat
 * @param {Date} options.dateRange.from - Data od
 * @param {Date} options.dateRange.to - Data do
 * @returns {Promise<Array>} - Lista transakcji
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const getTransactionsByType = async (itemId, transactionTypes, options = {}) => {
  try {
    // Walidacja parametrów
    const validatedItemId = validateId(itemId, 'itemId');
    
    // Normalizuj typy transakcji do tablicy
    const types = Array.isArray(transactionTypes) ? transactionTypes : [transactionTypes];
    
    // Waliduj typy transakcji
    types.forEach(type => {
      if (!Object.values(TRANSACTION_TYPES).includes(type)) {
        throw new ValidationError(`Nieprawidłowy typ transakcji: ${type}`, 'transactionTypes');
      }
    });

    const {
      limit: queryLimit = QUERY_LIMITS.TRANSACTIONS_DEFAULT,
      dateRange = null
    } = options;

    if (queryLimit) {
      validatePositiveNumber(queryLimit, 'limit');
    }

    const transactionsRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_TRANSACTIONS);
    
    // Utwórz zapytanie z filtrami
    let q = query(
      transactionsRef,
      where('itemId', '==', validatedItemId),
      orderBy('createdAt', 'desc')
    );

    // Dodaj filtr typu transakcji
    if (types.length === 1) {
      q = query(q, where('type', '==', types[0]));
    } else {
      q = query(q, where('type', 'in', types));
    }

    // Dodaj filtry dat jeśli podano
    if (dateRange && dateRange.from) {
      q = query(q, where('createdAt', '>=', dateRange.from));
    }
    if (dateRange && dateRange.to) {
      q = query(q, where('createdAt', '<=', dateRange.to));
    }

    // Dodaj limit
    if (queryLimit) {
      q = query(q, limit(queryLimit));
    }
    
    const querySnapshot = await getDocs(q);
    
    // Przetwórz wyniki
    const transactions = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: convertTimestampToDate(data.createdAt),
        updatedAt: convertTimestampToDate(data.updatedAt),
        transactionDate: convertTimestampToDate(data.transactionDate) || convertTimestampToDate(data.createdAt)
      };
    });

    return transactions;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas pobierania transakcji według typu:', error);
    throw new Error(`Nie udało się pobrać transakcji według typu: ${error.message}`);
  }
};

/**
 * Pobiera statystyki transakcji dla pozycji magazynowej
 * @param {string} itemId - ID pozycji magazynowej
 * @param {Object} options - Opcje analizy
 * @param {Date} options.fromDate - Data początkowa
 * @param {Date} options.toDate - Data końcowa
 * @param {boolean} options.groupByType - Czy grupować według typu
 * @param {boolean} options.groupByPeriod - Czy grupować według okresów
 * @returns {Promise<Object>} - Statystyki transakcji
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const getTransactionStatistics = async (itemId, options = {}) => {
  try {
    // Walidacja parametrów
    const validatedItemId = validateId(itemId, 'itemId');
    
    const {
      fromDate = null,
      toDate = null,
      groupByType = true,
      groupByPeriod = false
    } = options;

    // Pobierz wszystkie transakcje dla pozycji
    const transactions = await getItemTransactions(validatedItemId, {
      enrichWithTaskData: false,
      enrichWithBatchData: false,
      limit: null // Pobierz wszystkie
    });

    // Filtruj według dat jeśli podano
    let filteredTransactions = transactions;
    if (fromDate || toDate) {
      filteredTransactions = transactions.filter(transaction => {
        const transactionDate = transaction.transactionDate || transaction.createdAt;
        if (!transactionDate) return false;
        
        if (fromDate && transactionDate < fromDate) return false;
        if (toDate && transactionDate > toDate) return false;
        
        return true;
      });
    }

    // Podstawowe statystyki
    const totalTransactions = filteredTransactions.length;
    
    // Statystyki według typu
    const byType = {};
    if (groupByType) {
      filteredTransactions.forEach(transaction => {
        const type = transaction.type || 'unknown';
        if (!byType[type]) {
          byType[type] = {
            count: 0,
            totalQuantity: 0,
            avgQuantity: 0,
            transactions: []
          };
        }
        
        byType[type].count++;
        byType[type].totalQuantity += transaction.quantity || 0;
        byType[type].transactions.push(transaction);
      });

      // Oblicz średnie
      Object.keys(byType).forEach(type => {
        byType[type].avgQuantity = byType[type].count > 0 
          ? byType[type].totalQuantity / byType[type].count 
          : 0;
      });
    }

    // Statystyki według okresów (miesięczne)
    const byPeriod = {};
    if (groupByPeriod) {
      filteredTransactions.forEach(transaction => {
        const transactionDate = transaction.transactionDate || transaction.createdAt;
        if (!transactionDate) return;
        
        const monthKey = `${transactionDate.getFullYear()}-${String(transactionDate.getMonth() + 1).padStart(2, '0')}`;
        
        if (!byPeriod[monthKey]) {
          byPeriod[monthKey] = {
            period: monthKey,
            count: 0,
            totalQuantity: 0,
            types: {}
          };
        }
        
        byPeriod[monthKey].count++;
        byPeriod[monthKey].totalQuantity += transaction.quantity || 0;
        
        const type = transaction.type || 'unknown';
        if (!byPeriod[monthKey].types[type]) {
          byPeriod[monthKey].types[type] = 0;
        }
        byPeriod[monthKey].types[type]++;
      });
    }

    // Znajdź najczęstsze typy transakcji
    const typeFrequency = Object.entries(byType)
      .sort(([,a], [,b]) => b.count - a.count)
      .slice(0, 5);

    // Ostatnie transakcje
    const recentTransactions = filteredTransactions
      .sort((a, b) => {
        const dateA = a.transactionDate || a.createdAt;
        const dateB = b.transactionDate || b.createdAt;
        return dateB - dateA;
      })
      .slice(0, 10);

    return {
      summary: {
        totalTransactions,
        dateRange: {
          from: fromDate,
          to: toDate
        }
      },
      byType: groupByType ? byType : null,
      byPeriod: groupByPeriod ? byPeriod : null,
      topTypes: typeFrequency,
      recentTransactions
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas generowania statystyk transakcji:', error);
    throw new Error(`Nie udało się wygenerować statystyk transakcji: ${error.message}`);
  }
};

/**
 * Eksportuje transakcje do formatu CSV
 * @param {Object} options - Opcje eksportu
 * @param {Array<string>} options.itemIds - Lista ID pozycji (opcjonalnie)
 * @param {Array<string>} options.transactionTypes - Typy transakcji do eksportu
 * @param {Date} options.fromDate - Data początkowa
 * @param {Date} options.toDate - Data końcowa
 * @param {Array<string>} options.fields - Pola do eksportu
 * @returns {Promise<string>} - Dane CSV jako string
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const exportTransactionsToCSV = async (options = {}) => {
  try {
    const {
      itemIds = null,
      transactionTypes = null,
      fromDate = null,
      toDate = null,
      fields = ['id', 'itemId', 'itemName', 'type', 'quantity', 'transactionDate', 'createdBy', 'notes']
    } = options;

    // Walidacja parametrów
    if (itemIds) {
      validateArray(itemIds, 'itemIds');
      itemIds.forEach(id => validateId(id, 'itemId'));
    }

    if (transactionTypes) {
      validateArray(transactionTypes, 'transactionTypes');
    }

    validateArray(fields, 'fields');

    // Przygotuj filtry
    const filters = [];
    
    if (transactionTypes && transactionTypes.length > 0) {
      if (transactionTypes.length === 1) {
        filters.push({ field: 'type', operator: '==', value: transactionTypes[0] });
      } else {
        filters.push({ field: 'type', operator: 'in', value: transactionTypes });
      }
    }

    if (fromDate) {
      filters.push({ field: 'createdAt', operator: '>=', value: fromDate });
    }

    if (toDate) {
      filters.push({ field: 'createdAt', operator: '<=', value: toDate });
    }

    // Pobierz transakcje
    let allTransactions = [];
    
    if (itemIds && itemIds.length > 0) {
      // Pobierz transakcje dla konkretnych pozycji
      const transactionPromises = itemIds.map(itemId => 
        getItemTransactions(itemId, { 
          enrichWithTaskData: false, 
          enrichWithBatchData: false,
          limit: null 
        })
      );
      
      const transactionArrays = await Promise.all(transactionPromises);
      allTransactions = transactionArrays.flat();
    } else {
      // Pobierz wszystkie transakcje z filtrami
      allTransactions = await getAllTransactions({
        limit: null,
        filters
      });
    }

    // Filtruj według dat i typów jeśli nie zostało to zrobione w zapytaniu
    let filteredTransactions = allTransactions;
    
    if (transactionTypes && transactionTypes.length > 0) {
      filteredTransactions = filteredTransactions.filter(t => 
        transactionTypes.includes(t.type)
      );
    }

    if (fromDate || toDate) {
      filteredTransactions = filteredTransactions.filter(transaction => {
        const transactionDate = transaction.transactionDate || transaction.createdAt;
        if (!transactionDate) return false;
        
        if (fromDate && transactionDate < fromDate) return false;
        if (toDate && transactionDate > toDate) return false;
        
        return true;
      });
    }

    // Generuj CSV
    const csvHeader = fields.join(',');
    const csvRows = filteredTransactions.map(transaction => {
      return fields.map(field => {
        let value = transaction[field];
        
        // Formatuj daty
        if (field.includes('Date') || field.includes('At')) {
          value = value ? formatDateToLocal(value) : '';
        }
        
        // Escapuj wartości z przecinkami lub cudzysłowami
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          value = `"${value.replace(/"/g, '""')}"`;
        }
        
        return value || '';
      }).join(',');
    });

    return [csvHeader, ...csvRows].join('\n');
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas eksportu transakcji do CSV:', error);
    throw new Error(`Nie udało się wyeksportować transakcji: ${error.message}`);
  }
};

/**
 * Pobiera podsumowanie transakcji dla danego okresu
 * @param {Object} options - Opcje podsumowania
 * @param {Date} options.fromDate - Data początkowa
 * @param {Date} options.toDate - Data końcowa
 * @param {Array<string>} options.itemIds - Lista ID pozycji (opcjonalnie)
 * @param {string} options.groupBy - Sposób grupowania ('day'|'week'|'month')
 * @returns {Promise<Object>} - Podsumowanie transakcji
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas operacji
 */
export const getTransactionSummary = async (options = {}) => {
  try {
    const {
      fromDate = null,
      toDate = null,
      itemIds = null,
      groupBy = 'day'
    } = options;

    // Walidacja parametrów
    if (itemIds) {
      validateArray(itemIds, 'itemIds');
      itemIds.forEach(id => validateId(id, 'itemId'));
    }

    if (!['day', 'week', 'month'].includes(groupBy)) {
      throw new ValidationError('Nieprawidłowy sposób grupowania. Dozwolone: day, week, month', 'groupBy');
    }

    // Przygotuj filtry
    const filters = [];
    
    if (fromDate) {
      filters.push({ field: 'createdAt', operator: '>=', value: fromDate });
    }

    if (toDate) {
      filters.push({ field: 'createdAt', operator: '<=', value: toDate });
    }

    // Pobierz transakcje
    let transactions = [];
    
    if (itemIds && itemIds.length > 0) {
      const transactionPromises = itemIds.map(itemId => 
        getItemTransactions(itemId, { 
          enrichWithTaskData: false, 
          enrichWithBatchData: false,
          limit: null 
        })
      );
      
      const transactionArrays = await Promise.all(transactionPromises);
      transactions = transactionArrays.flat();
    } else {
      transactions = await getAllTransactions({
        limit: null,
        filters
      });
    }

    // Filtruj według dat jeśli to konieczne
    if (fromDate || toDate) {
      transactions = transactions.filter(transaction => {
        const transactionDate = transaction.transactionDate || transaction.createdAt;
        if (!transactionDate) return false;
        
        if (fromDate && transactionDate < fromDate) return false;
        if (toDate && transactionDate > toDate) return false;
        
        return true;
      });
    }

    // Grupuj transakcje
    const grouped = {};
    
    transactions.forEach(transaction => {
      const transactionDate = transaction.transactionDate || transaction.createdAt;
      if (!transactionDate) return;
      
      let groupKey;
      
      switch (groupBy) {
        case 'day':
          groupKey = transactionDate.toISOString().split('T')[0];
          break;
        case 'week':
          const weekStart = new Date(transactionDate);
          weekStart.setDate(transactionDate.getDate() - transactionDate.getDay());
          groupKey = weekStart.toISOString().split('T')[0];
          break;
        case 'month':
          groupKey = `${transactionDate.getFullYear()}-${String(transactionDate.getMonth() + 1).padStart(2, '0')}`;
          break;
        default:
          groupKey = transactionDate.toISOString().split('T')[0];
      }
      
      if (!grouped[groupKey]) {
        grouped[groupKey] = {
          period: groupKey,
          totalTransactions: 0,
          byType: {},
          totalQuantity: 0,
          uniqueItems: new Set()
        };
      }
      
      grouped[groupKey].totalTransactions++;
      grouped[groupKey].totalQuantity += transaction.quantity || 0;
      grouped[groupKey].uniqueItems.add(transaction.itemId);
      
      const type = transaction.type || 'unknown';
      if (!grouped[groupKey].byType[type]) {
        grouped[groupKey].byType[type] = {
          count: 0,
          totalQuantity: 0
        };
      }
      
      grouped[groupKey].byType[type].count++;
      grouped[groupKey].byType[type].totalQuantity += transaction.quantity || 0;
    });

    // Konwertuj Set na liczby
    Object.keys(grouped).forEach(key => {
      grouped[key].uniqueItems = grouped[key].uniqueItems.size;
    });

    // Sortuj chronologicznie
    const sortedGroups = Object.values(grouped).sort((a, b) => 
      a.period.localeCompare(b.period)
    );

    return {
      summary: {
        totalPeriods: sortedGroups.length,
        totalTransactions: transactions.length,
        totalQuantity: transactions.reduce((sum, t) => sum + (t.quantity || 0), 0),
        uniqueItems: new Set(transactions.map(t => t.itemId)).size,
        dateRange: {
          from: fromDate,
          to: toDate
        },
        groupBy
      },
      periods: sortedGroups
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas generowania podsumowania transakcji:', error);
    throw new Error(`Nie udało się wygenerować podsumowania transakcji: ${error.message}`);
  }
};

// ===== FUNKCJE POMOCNICZE =====

/**
 * Wzbogaca transakcje o dane z zadań produkcyjnych
 * @private
 */
const enrichTransactionsWithTaskData = async (transactions) => {
  const transactionsToUpdate = transactions.filter(transaction => 
    (transaction.type === TRANSACTION_TYPES.BOOKING || transaction.type === TRANSACTION_TYPES.BOOKING_CANCEL) 
    && transaction.referenceId
  );

  if (transactionsToUpdate.length === 0) return;

  const transactionsRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_TRANSACTIONS);

  for (const transaction of transactionsToUpdate) {
    try {
      // Sprawdź aktualny stan zadania produkcyjnego
      const taskRef = FirebaseQueryBuilder.getDocRef('productionTasks', transaction.referenceId);
      const taskDoc = await getDoc(taskRef);
      
      if (taskDoc.exists()) {
        const taskData = taskDoc.data();
        
        // Aktualizuj dane w transakcji (w pamięci)
        transaction.taskName = taskData.name || '';
        transaction.taskNumber = taskData.number || '';
        transaction.moNumber = taskData.moNumber || '';
        transaction.clientName = taskData.clientName || '';
        transaction.clientId = taskData.clientId || '';
        
        // Zaktualizuj transakcję w bazie danych jeśli dane się zmieniły
        const transactionRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY_TRANSACTIONS, transaction.id);
        await updateDoc(transactionRef, {
          taskName: transaction.taskName,
          taskNumber: transaction.taskNumber,
          moNumber: transaction.moNumber,
          clientName: transaction.clientName,
          clientId: transaction.clientId
        });
      }
    } catch (error) {
      console.error('Błąd podczas pobierania danych zadania:', error);
      // Kontynuuj, nawet jeśli nie udało się pobrać danych zadania
    }
  }
};

/**
 * Wzbogaca transakcje o dane o partiach
 * @private
 */
const enrichTransactionsWithBatchData = async (transactions, itemId) => {
  const bookingTransactions = transactions.filter(transaction => 
    transaction.type === TRANSACTION_TYPES.BOOKING && !transaction.batchId
  );

  if (bookingTransactions.length === 0) return;

  const transactionsRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_TRANSACTIONS);

  for (const transaction of bookingTransactions) {
    try {
      // Znajdź partie dla tego zadania w danych zadania
      const taskRef = FirebaseQueryBuilder.getDocRef('productionTasks', transaction.referenceId);
      const taskDoc = await getDoc(taskRef);
      
      if (taskDoc.exists()) {
        const taskData = taskDoc.data();
        const materialBatches = taskData.materialBatches || {};
        
        if (materialBatches[itemId] && materialBatches[itemId].length > 0) {
          const firstBatch = materialBatches[itemId][0];
          
          // Aktualizuj dane w transakcji (w pamięci)
          transaction.batchId = firstBatch.batchId;
          transaction.batchNumber = firstBatch.batchNumber;
          
          // Zaktualizuj transakcję w bazie danych
          const transactionRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.INVENTORY_TRANSACTIONS, transaction.id);
          await updateDoc(transactionRef, {
            batchId: transaction.batchId,
            batchNumber: transaction.batchNumber
          });
        }
      }
    } catch (error) {
      console.error('Błąd podczas pobierania danych o partiach:', error);
    }
  }
};