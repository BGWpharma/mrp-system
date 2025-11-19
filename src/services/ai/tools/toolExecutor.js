// src/services/ai/tools/toolExecutor.js

import { 
  collection, 
  getDocs, 
  getDoc,
  doc,
  query, 
  where, 
  orderBy, 
  limit as firestoreLimit,
  getCountFromServer,
  Timestamp
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { COLLECTION_MAPPING } from './databaseTools.js';

/**
 * Wykonuje narzędzia (funkcje) wywołane przez GPT
 * Każda funkcja wykonuje targetowane zapytanie do Firestore
 */
export class ToolExecutor {
  
  /**
   * Wykonuje funkcję wywołaną przez GPT
   * @param {string} functionName - Nazwa funkcji do wykonania
   * @param {Object} parameters - Parametry funkcji
   * @returns {Promise<Object>} - Wynik wykonania funkcji
   */
  static async executeFunction(functionName, parameters) {
    console.log(`[ToolExecutor] Wykonuję funkcję: ${functionName}`, parameters);
    
    const startTime = performance.now();
    
    try {
      let result;
      
      switch (functionName) {
        case 'query_recipes':
          result = await this.queryRecipes(parameters);
          break;
        case 'query_inventory':
          result = await this.queryInventory(parameters);
          break;
        case 'query_production_tasks':
          result = await this.queryProductionTasks(parameters);
          break;
        case 'query_orders':
          result = await this.queryOrders(parameters);
          break;
        case 'query_purchase_orders':
          result = await this.queryPurchaseOrders(parameters);
          break;
        case 'aggregate_data':
          result = await this.aggregateData(parameters);
          break;
        case 'get_count':
          result = await this.getCount(parameters);
          break;
        case 'get_customers':
          result = await this.getCustomers(parameters);
          break;
        case 'get_suppliers':
          result = await this.getSuppliers(parameters);
          break;
        case 'query_invoices':
          result = await this.queryInvoices(parameters);
          break;
        case 'query_cmr_documents':
          result = await this.queryCmrDocuments(parameters);
          break;
        case 'query_inventory_batches':
          result = await this.queryInventoryBatches(parameters);
          break;
        case 'get_users':
          result = await this.getUsers(parameters);
          break;
        case 'query_production_history':
          result = await this.queryProductionHistory(parameters);
          break;
        case 'query_inventory_transactions':
          result = await this.queryInventoryTransactions(parameters);
          break;
        case 'get_system_alerts':
          result = await this.getSystemAlerts(parameters);
          break;
        case 'calculate_production_costs':
          result = await this.calculateProductionCosts(parameters);
          break;
        case 'trace_material_flow':
          result = await this.traceMaterialFlow(parameters);
          break;
        default:
          throw new Error(`Nieznana funkcja: ${functionName}`);
      }
      
      const executionTime = performance.now() - startTime;
      
      console.log(`[ToolExecutor] ✅ Funkcja ${functionName} wykonana w ${executionTime.toFixed(2)}ms`);
      
      return {
        success: true,
        data: result,
        executionTime,
        functionName
      };
      
    } catch (error) {
      console.error(`[ToolExecutor] ❌ Błąd podczas wykonywania ${functionName}:`, error);
      return {
        success: false,
        error: error.message,
        functionName,
        executionTime: performance.now() - startTime
      };
    }
  }
  
  /**
   * Pobiera receptury z filtrami
   */
  static async queryRecipes(params) {
    const collectionName = COLLECTION_MAPPING.recipes;
    let q = collection(db, collectionName);
    const constraints = [];
    
    // Zastosuj filtry
    if (params.filters && params.filters.length > 0) {
      for (const filter of params.filters) {
        constraints.push(where(filter.field, filter.operator, filter.value));
      }
    }
    
    // Sortowanie
    if (params.orderBy) {
      constraints.push(orderBy(params.orderBy.field, params.orderBy.direction || 'asc'));
    }
    
    // Limit
    const limitValue = Math.min(params.limit || 100, 500);
    constraints.push(firestoreLimit(limitValue));
    
    if (constraints.length > 0) {
      q = query(q, ...constraints);
    }
    
    const snapshot = await getDocs(q);
    let recipes = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Opcjonalnie: oblicz łączną wagę składników
    if (params.calculateWeight !== false) {
      recipes = recipes.map(recipe => {
        const totalWeight = this.calculateTotalWeight(recipe.ingredients || []);
        const result = {
          ...recipe,
          totalWeight,
          ingredientCount: (recipe.ingredients || []).length
        };
        
        // Dla większych zapytań (>10 receptur) usuń pełną listę składników (oszczędność tokenów)
        // GPT dostanie statystyki, ale nie pełne dane
        if (recipes.length > 10 && recipe.ingredients) {
          delete result.ingredients;
        }
        
        return result;
      });
    }
    
    return {
      recipes,
      count: recipes.length,
      limitApplied: limitValue,
      isEmpty: recipes.length === 0,
      warning: recipes.length === 0 ? "⚠️ BRAK DANYCH - Nie znaleziono żadnych receptur spełniających kryteria. NIE WYMYŚLAJ danych!" : null
    };
  }
  
  /**
   * Pobiera stany magazynowe
   */
  static async queryInventory(params) {
    const collectionName = COLLECTION_MAPPING.inventory;
    let q = collection(db, collectionName);
    const constraints = [];
    
    // Filtr po ID materiału (exact match - po stronie serwera)
    if (params.materialId) {
      constraints.push(where('id', '==', params.materialId));
    }
    
    // Filtr po kategorii (exact match - po stronie serwera)
    if (params.categoryId) {
      constraints.push(where('categoryId', '==', params.categoryId));
    }
    
    // Filtry użytkownika
    if (params.filters && params.filters.length > 0) {
      for (const filter of params.filters) {
        // Konwersja dat
        let value = filter.value;
        if (filter.field === 'expirationDate' && typeof value === 'string') {
          value = Timestamp.fromDate(new Date(value));
        }
        constraints.push(where(filter.field, filter.operator, value));
      }
    }
    
    // Limit (zwiększony dla wyszukiwania tekstowego)
    const limitValue = params.searchText ? 500 : (params.limit || 100);
    constraints.push(firestoreLimit(limitValue));
    
    if (constraints.length > 0) {
      q = query(q, ...constraints);
    }
    
    console.log(`[ToolExecutor] 📦 Pobieranie pozycji magazynowych z Firestore...`);
    const snapshot = await getDocs(q);
    let items = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        // Konwertuj Timestamp na czytelny format
        expirationDate: data.expirationDate?.toDate?.()?.toISOString?.() || data.expirationDate
      };
    });
    
    console.log(`[ToolExecutor] ✅ Pobrano ${items.length} pozycji z Firestore`);
    
    // 🆕 NOWE: Filtrowanie tekstowe po stronie klienta z normalizacją jednostek
    if (params.searchText) {
      const searchTerm = params.searchText.toLowerCase();
      console.log(`[ToolExecutor] 🔍 Wyszukiwanie tekstowe po nazwie/opisie/ID: "${searchTerm}"`);
      console.log(`[ToolExecutor] 📦 Liczba pozycji przed filtrowaniem: ${items.length}`);
      
      // Podziel wyszukiwanie na słowa z normalizacją jednostek
      const searchWords = searchTerm
        .replace(/[^a-z0-9\s]/g, ' ')  // zamień znaki specjalne na spacje
        .replace(/\s+(g|gr|kg|ml|l)\b/g, '$1')  // usuń spacje przed jednostkami: "300 g" → "300g"
        .replace(/\bgr\b/g, 'g')  // normalizuj: "gr" → "g"
        .split(/\s+/)                   // podziel na słowa
        .filter(word => word.length > 0); // usuń puste
      
      console.log(`[ToolExecutor] 🔤 Słowa do wyszukania (po normalizacji): [${searchWords.join(', ')}]`);
      
      items = items.filter(item => {
        const name = (item.name || '').toLowerCase();
        const description = (item.description || '').toLowerCase();
        const itemId = (item.id || '').toLowerCase();
        
        // Normalizuj tekst przed wyszukiwaniem (tak samo jak searchWords)
        const searchableText = `${name} ${description} ${itemId}`
          .replace(/\s+(g|gr|kg|ml|l)\b/g, '$1')  // "300 gr" → "300gr"
          .replace(/\bgr\b/g, 'g');  // "gr" → "g"
        
        // Wszystkie słowa muszą wystąpić w znormalizowanym tekście (AND logic)
        return searchWords.every(word => searchableText.includes(word));
      });
      
      console.log(`[ToolExecutor] ✅ Po filtrowaniu tekstowym: ${items.length} pozycji`);
    }
    
    // Filtrowanie niskiego stanu (po stronie klienta, bo Firestore nie obsługuje porównań między polami)
    if (params.checkLowStock) {
      items = items.filter(item => 
        (item.quantity || 0) < (item.minQuantity || 0)
      );
    }
    
    // Filtrowanie wygasających produktów (w ciągu 30 dni)
    if (params.checkExpiring) {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      
      items = items.filter(item => {
        if (!item.expirationDate) return false;
        const expDate = new Date(item.expirationDate);
        return expDate <= thirtyDaysFromNow && expDate >= new Date();
      });
    }
    
    // Oblicz łączne wartości
    let totals = null;
    if (params.calculateTotals !== false) {
      totals = {
        totalItems: items.length,
        totalQuantity: items.reduce((sum, item) => sum + (item.quantity || 0), 0),
        totalValue: items.reduce((sum, item) => 
          sum + ((item.quantity || 0) * (item.unitPrice || 0)), 0
        ),
        lowStockCount: items.filter(item => 
          (item.quantity || 0) < (item.minQuantity || 0)
        ).length
      };
    }
    
    return {
      items,
      count: items.length,
      totals,
      limitApplied: limitValue,
      searchedText: params.searchText || null,
      isEmpty: items.length === 0,
      warning: items.length === 0 ? "⚠️ BRAK DANYCH - Nie znaleziono żadnych pozycji magazynowych spełniających kryteria. NIE WYMYŚLAJ danych!" : null
    };
  }
  
  /**
   * Pobiera zadania produkcyjne
   */
  static async queryProductionTasks(params) {
    const collectionName = COLLECTION_MAPPING.production_tasks;
    let q = collection(db, collectionName);
    const constraints = [];
    
    // Filtr po numerze MO (exact match - po stronie serwera)
    if (params.moNumber) {
      constraints.push(where('moNumber', '==', params.moNumber));
    }
    
    // Filtr po ID produktu (exact match - po stronie serwera)
    if (params.productId) {
      constraints.push(where('productId', '==', params.productId));
    }
    
    // Filtr po ID zamówienia (exact match - po stronie serwera)
    if (params.orderId) {
      constraints.push(where('orderId', '==', params.orderId));
      console.log(`[ToolExecutor] 🔍 Filtrowanie MO po orderId: ${params.orderId}`);
    }
    
    // Filtr po numerze LOT (exact match - po stronie serwera)
    if (params.lotNumber) {
      constraints.push(where('lotNumber', '==', params.lotNumber));
      console.log(`[ToolExecutor] 🔍 Filtrowanie MO po lotNumber: ${params.lotNumber}`);
    }
    
    // Filtr po statusie - NORMALIZUJ statusy przed zapytaniem (case-sensitive!)
    if (params.status && params.status.length > 0) {
      // Mapowanie statusów z małych liter na właściwe wartości w Firestore
      const statusMapping = {
        'zaplanowane': 'Zaplanowane',
        'w trakcie': 'W trakcie',
        'wstrzymane': 'Wstrzymane',
        'zakończone': 'Zakończone',
        'anulowane': 'Anulowane',
        'on hold': 'On Hold',
        'completed': 'Zakończone',
        'in progress': 'W trakcie',
        'planned': 'Zaplanowane',
        'paused': 'Wstrzymane',
        'cancelled': 'Anulowane'
      };
      
      // Normalizuj każdy status
      const normalizedStatuses = params.status.map(s => {
        const lower = s.toLowerCase();
        const normalized = statusMapping[lower] || s; // Jeśli nie ma w mapowaniu, użyj oryginalnego
        if (statusMapping[lower]) {
          console.log(`[ToolExecutor] 🔄 Normalizacja statusu: "${s}" → "${normalized}"`);
        }
        return normalized;
      });
      
      // Firestore obsługuje 'in' tylko dla max 10 wartości
      if (normalizedStatuses.length <= 10) {
        constraints.push(where('status', 'in', normalizedStatuses));
      }
    }
    
    // Filtr po dacie utworzenia
    if (params.dateFrom) {
      const fromDate = Timestamp.fromDate(new Date(params.dateFrom));
      constraints.push(where('createdAt', '>=', fromDate));
    }
    
    if (params.dateTo) {
      const toDate = Timestamp.fromDate(new Date(params.dateTo));
      constraints.push(where('createdAt', '<=', toDate));
    }
    
    // Filtr po przypisanym użytkowniku
    if (params.assignedTo) {
      constraints.push(where('assignedTo', '==', params.assignedTo));
    }
    
    // Limit
    const limitValue = params.limit || 100;
    constraints.push(firestoreLimit(limitValue));
    
    if (constraints.length > 0) {
      q = query(q, ...constraints);
    }
    
    const snapshot = await getDocs(q);
    let tasks = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || data.updatedAt,
        startDate: data.startDate?.toDate?.()?.toISOString?.() || data.startDate,
        endDate: data.endDate?.toDate?.()?.toISOString?.() || data.endDate
      };
    });
    
    // Filtruj po nazwie produktu (po stronie klienta)
    if (params.productName) {
      const searchTerm = params.productName.toLowerCase();
      tasks = tasks.filter(task => 
        (task.productName || '').toLowerCase().includes(searchTerm) ||
        (task.moNumber || '').toLowerCase().includes(searchTerm)
      );
    }
    
    // ZAWSZE usuń duże pola (oszczędność tokenów) - zachowaj tylko gdy wyraźnie proszono o szczegóły
    if (params.includeDetails !== true) {
      tasks = tasks.map(({ materials, consumedMaterials, formResponses, ...task }) => ({
        ...task,
        // Zachowaj podstawowe statystyki zamiast pełnych danych
        materialsCount: materials?.length || 0,
        consumedMaterialsCount: consumedMaterials?.length || 0,
        formResponsesCount: formResponses?.length || 0
      }));
    }
    
    return {
      tasks,
      count: tasks.length,
      limitApplied: limitValue,
      isEmpty: tasks.length === 0,
      warning: tasks.length === 0 ? "⚠️ BRAK DANYCH - Nie znaleziono żadnych zadań produkcyjnych spełniających kryteria. NIE WYMYŚLAJ danych!" : null
    };
  }
  
  /**
   * Pobiera zamówienia klientów
   */
  static async queryOrders(params) {
    const collectionName = COLLECTION_MAPPING.customer_orders;
    let q = collection(db, collectionName);
    const constraints = [];
    
    // Filtr po numerze zamówienia (exact match - po stronie serwera)
    if (params.orderNumber) {
      constraints.push(where('orderNumber', '==', params.orderNumber));
    }
    
    // Filtr po statusie - NORMALIZUJ statusy przed zapytaniem (case-sensitive!)
    if (params.status && params.status.length > 0 && params.status.length <= 10) {
      // Mapowanie statusów zamówień z małych liter na właściwe wartości w Firestore
      const statusMapping = {
        'nowe': 'Nowe',
        'w realizacji': 'W realizacji',
        'zakończone': 'Zakończone',
        'anulowane': 'Anulowane',
        'new': 'Nowe',
        'in progress': 'W realizacji',
        'completed': 'Zakończone',
        'cancelled': 'Anulowane',
        'wstrzymane': 'Wstrzymane',
        'on hold': 'Wstrzymane'
      };
      
      // Normalizuj każdy status
      const normalizedStatuses = params.status.map(s => {
        const lower = s.toLowerCase();
        const normalized = statusMapping[lower] || s;
        if (statusMapping[lower]) {
          console.log(`[ToolExecutor] 🔄 Normalizacja statusu zamówienia: "${s}" → "${normalized}"`);
        }
        return normalized;
      });
      
      constraints.push(where('status', 'in', normalizedStatuses));
    }
    
    // Filtr po kliencie
    if (params.customerId) {
      constraints.push(where('customerId', '==', params.customerId));
    }
    
    // Filtr po dacie
    if (params.dateFrom) {
      const fromDate = Timestamp.fromDate(new Date(params.dateFrom));
      constraints.push(where('orderDate', '>=', fromDate));
    }
    
    if (params.dateTo) {
      const toDate = Timestamp.fromDate(new Date(params.dateTo));
      constraints.push(where('orderDate', '<=', toDate));
    }
    
    // Limit
    const limitValue = params.limit || 100;
    constraints.push(firestoreLimit(limitValue));
    
    if (constraints.length > 0) {
      q = query(q, ...constraints);
    }
    
    const snapshot = await getDocs(q);
    let orders = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        orderDate: data.orderDate?.toDate?.()?.toISOString?.() || data.orderDate,
        deliveryDate: data.deliveryDate?.toDate?.()?.toISOString?.() || data.deliveryDate,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt
      };
    });
    
    // Filtruj po nazwie klienta (po stronie klienta)
    if (params.customerName) {
      const searchTerm = params.customerName.toLowerCase();
      orders = orders.filter(order => 
        (order.customerName || '').toLowerCase().includes(searchTerm)
      );
    }
    
    // ZAWSZE usuń pozycje jeśli nie są wyraźnie wymagane (oszczędność tokenów)
    if (params.includeItems !== true) {
      orders = orders.map(({ items, ...order }) => ({
        ...order,
        itemsCount: items?.length || 0
      }));
    }
    
    return {
      orders,
      count: orders.length,
      isEmpty: orders.length === 0,
      warning: orders.length === 0 ? "⚠️ BRAK DANYCH - Nie znaleziono żadnych zamówień klientów spełniających kryteria. NIE WYMYŚLAJ danych!" : null,
      limitApplied: limitValue
    };
  }
  
  /**
   * Pobiera zamówienia zakupu
   */
  static async queryPurchaseOrders(params) {
    const collectionName = COLLECTION_MAPPING.purchase_orders;
    let q = collection(db, collectionName);
    const constraints = [];
    
    // Filtr po numerze PO (exact match - po stronie serwera)
    // UWAGA: W Firestore pole nazywa się 'number' a nie 'poNumber'
    if (params.poNumber) {
      constraints.push(where('number', '==', params.poNumber));
    }
    
    // Filtr po statusie - NORMALIZUJ statusy przed zapytaniem (case-sensitive!)
    if (params.status && params.status.length > 0 && params.status.length <= 10) {
      // Mapowanie statusów PO z małych liter na właściwe wartości w Firestore
      const statusMapping = {
        'oczekujące': 'pending',
        'potwierdzone': 'confirmed',
        'częściowo dostarczone': 'partial',
        'dostarczone': 'delivered',
        'anulowane': 'cancelled',
        'pending': 'pending',
        'confirmed': 'confirmed',
        'partial': 'partial',
        'delivered': 'delivered',
        'cancelled': 'cancelled',
        'w trakcie': 'confirmed',
        'zakończone': 'delivered'
      };
      
      // Normalizuj każdy status
      const normalizedStatuses = params.status.map(s => {
        const lower = s.toLowerCase();
        const normalized = statusMapping[lower] || s;
        if (statusMapping[lower]) {
          console.log(`[ToolExecutor] 🔄 Normalizacja statusu PO: "${s}" → "${normalized}"`);
        }
        return normalized;
      });
      
      constraints.push(where('status', 'in', normalizedStatuses));
    }
    
    // Filtr po dostawcy
    if (params.supplierId) {
      constraints.push(where('supplierId', '==', params.supplierId));
    }
    
    // Filtr po dacie
    if (params.dateFrom) {
      const fromDate = Timestamp.fromDate(new Date(params.dateFrom));
      constraints.push(where('orderDate', '>=', fromDate));
    }
    
    if (params.dateTo) {
      const toDate = Timestamp.fromDate(new Date(params.dateTo));
      constraints.push(where('orderDate', '<=', toDate));
    }
    
    // Limit
    const limitValue = params.limit || 100;
    constraints.push(firestoreLimit(limitValue));
    
    if (constraints.length > 0) {
      q = query(q, ...constraints);
    }
    
    const snapshot = await getDocs(q);
    let purchaseOrders = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        orderDate: data.orderDate?.toDate?.()?.toISOString?.() || data.orderDate,
        expectedDeliveryDate: data.expectedDeliveryDate?.toDate?.()?.toISOString?.() || data.expectedDeliveryDate,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt
      };
    });
    
    // Filtruj po nazwie dostawcy
    if (params.supplierName) {
      const searchTerm = params.supplierName.toLowerCase();
      purchaseOrders = purchaseOrders.filter(po => 
        (po.supplierName || '').toLowerCase().includes(searchTerm)
      );
    }
    
    return {
      purchaseOrders,
      count: purchaseOrders.length,
      limitApplied: limitValue,
      isEmpty: purchaseOrders.length === 0,
      warning: purchaseOrders.length === 0 ? "⚠️ BRAK DANYCH - Nie znaleziono żadnych zamówień zakupu spełniających kryteria. NIE WYMYŚLAJ danych!" : null
    };
  }
  
  /**
   * Wykonuje agregacje danych
   */
  static async aggregateData(params) {
    const collectionName = COLLECTION_MAPPING[params.collection];
    if (!collectionName) {
      throw new Error(`Nieznana kolekcja: ${params.collection}`);
    }
    
    let q = collection(db, collectionName);
    
    // Zastosuj filtry
    if (params.filters && params.filters.length > 0) {
      const constraints = params.filters.map(f => 
        where(f.field, f.operator, f.value)
      );
      q = query(q, ...constraints);
    }
    
    const snapshot = await getDocs(q);
    const docs = snapshot.docs.map(doc => doc.data());
    
    // Wykonaj operację
    switch (params.operation) {
      case 'count':
        return { 
          count: docs.length,
          collection: params.collection
        };
        
      case 'sum': {
        if (!params.field) throw new Error('Pole "field" jest wymagane dla operacji sum');
        const sum = docs.reduce((acc, doc) => acc + (parseFloat(doc[params.field]) || 0), 0);
        return { 
          sum: parseFloat(sum.toFixed(2)), 
          field: params.field,
          count: docs.length
        };
      }
        
      case 'average': {
        if (!params.field) throw new Error('Pole "field" jest wymagane dla operacji average');
        const total = docs.reduce((acc, doc) => acc + (parseFloat(doc[params.field]) || 0), 0);
        return { 
          average: docs.length > 0 ? parseFloat((total / docs.length).toFixed(2)) : 0, 
          field: params.field,
          count: docs.length
        };
      }
        
      case 'min': {
        if (!params.field) throw new Error('Pole "field" jest wymagane dla operacji min');
        const values = docs.map(doc => parseFloat(doc[params.field]) || Infinity).filter(v => v !== Infinity);
        const min = values.length > 0 ? Math.min(...values) : null;
        return { 
          min, 
          field: params.field,
          count: values.length
        };
      }
        
      case 'max': {
        if (!params.field) throw new Error('Pole "field" jest wymagane dla operacji max');
        const values = docs.map(doc => parseFloat(doc[params.field]) || -Infinity).filter(v => v !== -Infinity);
        const max = values.length > 0 ? Math.max(...values) : null;
        return { 
          max, 
          field: params.field,
          count: values.length
        };
      }
        
      case 'group_by': {
        if (!params.groupBy) throw new Error('Pole "groupBy" jest wymagane dla operacji group_by');
        const groups = {};
        docs.forEach(doc => {
          const key = doc[params.groupBy] || 'undefined';
          if (!groups[key]) {
            groups[key] = { count: 0, items: [] };
          }
          groups[key].count++;
          groups[key].items.push(doc);
        });
        return { 
          groups, 
          groupedBy: params.groupBy,
          totalGroups: Object.keys(groups).length,
          totalItems: docs.length
        };
      }
        
      default:
        throw new Error(`Nieznana operacja: ${params.operation}`);
    }
  }
  
  /**
   * Szybkie zliczanie (używa getCountFromServer)
   */
  static async getCount(params) {
    const collectionName = COLLECTION_MAPPING[params.collection];
    if (!collectionName) {
      throw new Error(`Nieznana kolekcja: ${params.collection}`);
    }
    
    let q = collection(db, collectionName);
    
    // Jeśli są filtry, musimy użyć getDocs (getCountFromServer nie obsługuje złożonych filtrów)
    if (params.filters && params.filters.length > 0) {
      const constraints = params.filters.map(f => 
        where(f.field, f.operator, f.value)
      );
      q = query(q, ...constraints);
      
      const snapshot = await getDocs(q);
      return {
        count: snapshot.size,
        collection: params.collection,
        method: 'getDocs'
      };
    }
    
    // Użyj szybkiej metody getCountFromServer
    const snapshot = await getCountFromServer(q);
    return {
      count: snapshot.data().count,
      collection: params.collection,
      method: 'getCountFromServer'
    };
  }
  
  /**
   * Pobiera klientów
   */
  static async getCustomers(params) {
    const collectionName = COLLECTION_MAPPING.customers;
    let q = collection(db, collectionName);
    const constraints = [];
    
    if (params.active !== undefined) {
      constraints.push(where('active', '==', params.active));
    }
    
    const limitValue = params.limit || 100;
    constraints.push(firestoreLimit(limitValue));
    
    if (constraints.length > 0) {
      q = query(q, ...constraints);
    }
    
    const snapshot = await getDocs(q);
    let customers = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Filtruj po nazwie (po stronie klienta)
    if (params.searchName) {
      const searchTerm = params.searchName.toLowerCase();
      customers = customers.filter(customer => 
        (customer.name || '').toLowerCase().includes(searchTerm) ||
        (customer.company || '').toLowerCase().includes(searchTerm)
      );
    }
    
    return {
      customers,
      count: customers.length,
      limitApplied: limitValue
    };
  }
  
  /**
   * Pobiera dostawców
   */
  static async getSuppliers(params) {
    const collectionName = COLLECTION_MAPPING.suppliers;
    let q = collection(db, collectionName);
    const constraints = [];
    
    if (params.active !== undefined) {
      constraints.push(where('active', '==', params.active));
    }
    
    const limitValue = params.limit || 100;
    constraints.push(firestoreLimit(limitValue));
    
    if (constraints.length > 0) {
      q = query(q, ...constraints);
    }
    
    const snapshot = await getDocs(q);
    let suppliers = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Filtruj po nazwie
    if (params.searchName) {
      const searchTerm = params.searchName.toLowerCase();
      suppliers = suppliers.filter(supplier => 
        (supplier.name || '').toLowerCase().includes(searchTerm) ||
        (supplier.company || '').toLowerCase().includes(searchTerm)
      );
    }
    
    return {
      suppliers,
      count: suppliers.length,
      limitApplied: limitValue
    };
  }
  
  /**
   * Pobiera faktury
   */
  static async queryInvoices(params) {
    const collectionName = COLLECTION_MAPPING.invoices;
    let q = collection(db, collectionName);
    const constraints = [];
    
    // Filtr po statusie - NORMALIZUJ statusy przed zapytaniem (case-sensitive!)
    // UWAGA: Faktury mają DWA pola: 'status' (draft/issued/cancelled) i 'paymentStatus' (paid/unpaid/partially_paid)
    if (params.status && params.status.length > 0 && params.status.length <= 10) {
      // Mapowanie statusów faktur z małych liter na właściwe wartości w Firestore
      const statusMapping = {
        // Statusy dokumentu
        'szkic': 'draft',
        'wystawiona': 'issued',
        'anulowana': 'cancelled',
        'draft': 'draft',
        'issued': 'issued',
        'cancelled': 'cancelled',
        // Statusy płatności (mogą być przekazane jako status)
        'opłacona': 'paid',
        'nieopłacona': 'unpaid',
        'częściowo opłacona': 'partially_paid',
        'przeterminowana': 'overdue',
        'paid': 'paid',
        'unpaid': 'unpaid',
        'partially_paid': 'partially_paid',
        'overdue': 'overdue'
      };
      
      // Normalizuj każdy status
      const normalizedStatuses = params.status.map(s => {
        const lower = s.toLowerCase();
        const normalized = statusMapping[lower] || s;
        if (statusMapping[lower]) {
          console.log(`[ToolExecutor] 🔄 Normalizacja statusu faktury: "${s}" → "${normalized}"`);
        }
        return normalized;
      });
      
      // UWAGA: Faktury mają osobne pole paymentStatus, więc jeśli status to paid/unpaid/partially_paid/overdue,
      // powinniśmy filtrować po paymentStatus zamiast status
      const paymentStatuses = ['paid', 'unpaid', 'partially_paid', 'overdue'];
      const isPaymentStatusFilter = normalizedStatuses.every(s => paymentStatuses.includes(s));
      
      if (isPaymentStatusFilter) {
        console.log(`[ToolExecutor] 📊 Filtrowanie faktur po paymentStatus: [${normalizedStatuses}]`);
        constraints.push(where('paymentStatus', 'in', normalizedStatuses));
      } else {
        console.log(`[ToolExecutor] 📊 Filtrowanie faktur po status: [${normalizedStatuses}]`);
        constraints.push(where('status', 'in', normalizedStatuses));
      }
    }
    
    if (params.customerId) {
      constraints.push(where('customerId', '==', params.customerId));
    }
    
    if (params.dateFrom) {
      const fromDate = Timestamp.fromDate(new Date(params.dateFrom));
      constraints.push(where('createdAt', '>=', fromDate));
    }
    
    if (params.dateTo) {
      const toDate = Timestamp.fromDate(new Date(params.dateTo));
      constraints.push(where('createdAt', '<=', toDate));
    }
    
    const limitValue = params.limit || 100;
    constraints.push(firestoreLimit(limitValue));
    
    if (constraints.length > 0) {
      q = query(q, ...constraints);
    }
    
    const snapshot = await getDocs(q);
    const invoices = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt,
        dueDate: data.dueDate?.toDate?.()?.toISOString?.() || data.dueDate
      };
    });
    
    return {
      invoices,
      isEmpty: invoices.length === 0,
      warning: invoices.length === 0 ? "⚠️ BRAK DANYCH - Nie znaleziono żadnych faktur spełniających kryteria. NIE WYMYŚLAJ danych!" : null,
      count: invoices.length,
      limitApplied: limitValue
    };
  }
  
  /**
   * Pobiera dokumenty CMR
   */
  static async queryCmrDocuments(params) {
    const collectionName = COLLECTION_MAPPING.cmr_documents;
    let q = collection(db, collectionName);
    const constraints = [];
    
    // Filtr po statusie - NORMALIZUJ statusy przed zapytaniem (case-sensitive!)
    if (params.status && params.status.length > 0 && params.status.length <= 10) {
      // Mapowanie statusów CMR z małych liter na właściwe wartości w Firestore
      const statusMapping = {
        'szkic': 'Szkic',
        'wystawiony': 'Wystawiony',
        'w transporcie': 'W transporcie',
        'dostarczone': 'Dostarczone',
        'zakończony': 'Zakończony',
        'anulowany': 'Anulowany',
        'draft': 'Szkic',
        'issued': 'Wystawiony',
        'in transit': 'W transporcie',
        'delivered': 'Dostarczone',
        'completed': 'Zakończony',
        'cancelled': 'Anulowany',
        'canceled': 'Anulowany'
      };
      
      // Normalizuj każdy status
      const normalizedStatuses = params.status.map(s => {
        const lower = s.toLowerCase();
        const normalized = statusMapping[lower] || s;
        if (statusMapping[lower]) {
          console.log(`[ToolExecutor] 🔄 Normalizacja statusu CMR: "${s}" → "${normalized}"`);
        }
        return normalized;
      });
      
      constraints.push(where('status', 'in', normalizedStatuses));
    }
    
    if (params.dateFrom) {
      const fromDate = Timestamp.fromDate(new Date(params.dateFrom));
      constraints.push(where('createdAt', '>=', fromDate));
    }
    
    if (params.dateTo) {
      const toDate = Timestamp.fromDate(new Date(params.dateTo));
      constraints.push(where('createdAt', '<=', toDate));
    }
    
    const limitValue = params.limit || 100;
    constraints.push(firestoreLimit(limitValue));
    
    if (constraints.length > 0) {
      q = query(q, ...constraints);
    }
    
    const snapshot = await getDocs(q);
    const cmrDocuments = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt,
        transportDate: data.transportDate?.toDate?.()?.toISOString?.() || data.transportDate
      };
    });
    
    return {
      cmrDocuments,
      count: cmrDocuments.length,
      limitApplied: limitValue,
      isEmpty: cmrDocuments.length === 0,
      warning: cmrDocuments.length === 0 ? "⚠️ BRAK DANYCH - Nie znaleziono żadnych dokumentów CMR spełniających kryteria. NIE WYMYŚLAJ danych!" : null
    };
  }
  
  /**
   * Pobiera partie magazynowe
   */
  static async queryInventoryBatches(params) {
    const collectionName = COLLECTION_MAPPING.inventory_batches;
    let q = collection(db, collectionName);
    const constraints = [];
    
    // 🔥 NOWE: Jeśli jest materialName, najpierw znajdź itemId w kolekcji inventory
    let resolvedItemId = params.materialId;
    let itemsFound = 0;
    let usedInQuery = false; // Flaga czy użyliśmy 'in' query
    
    if (params.materialName && !resolvedItemId) {
      console.log(`[ToolExecutor] 🔍 Szukam pozycji magazynowej o nazwie zawierającej: "${params.materialName}"`);
      
      // Pobierz pozycje magazynowe
      const inventoryRef = collection(db, COLLECTION_MAPPING.inventory);
      const inventorySnapshot = await getDocs(query(inventoryRef, firestoreLimit(500)));
      
      const searchTerm = params.materialName.toLowerCase();
      const matchingItems = inventorySnapshot.docs.filter(doc => {
        const data = doc.data();
        const itemName = (data.name || data.id || '').toLowerCase();
        return itemName.includes(searchTerm);
      });
      
      itemsFound = matchingItems.length;
      console.log(`[ToolExecutor] ✅ Znaleziono ${itemsFound} pasujących pozycji magazynowych`);
      
      if (matchingItems.length === 0) {
        console.log(`[ToolExecutor] ❌ Nie znaleziono pozycji magazynowej dla: "${params.materialName}"`);
        // Zwróć puste wyniki
        return {
          batches: [],
          count: 0,
          limitApplied: params.limit || 100,
          searchedTerm: params.materialName,
          itemsFound: 0,
          isEmpty: true,
          warning: `⚠️ BRAK DANYCH - Nie znaleziono pozycji magazynowej o nazwie "${params.materialName}". NIE WYMYŚLAJ danych!`
        };
      } else if (matchingItems.length === 1) {
        // Jeśli jest dokładnie jedna, użyj jej
        resolvedItemId = matchingItems[0].id;
        const itemName = matchingItems[0].data().name;
        console.log(`[ToolExecutor] 🎯 Znaleziono pozycję: "${itemName}" (ID: ${resolvedItemId})`);
      } else if (matchingItems.length <= 10) {
        // Dla wielu pozycji (max 10), użyj 'in'
        const itemIds = matchingItems.map(doc => doc.id);
        constraints.push(where('itemId', 'in', itemIds));
        usedInQuery = true;
        console.log(`[ToolExecutor] 🎯 Używam ${itemIds.length} itemIds (${matchingItems.map(d => d.data().name).join(', ')})`);
      } else {
        // Więcej niż 10, użyj pierwszych 10
        const itemIds = matchingItems.slice(0, 10).map(doc => doc.id);
        constraints.push(where('itemId', 'in', itemIds));
        usedInQuery = true;
        console.log(`[ToolExecutor] ⚠️ Znaleziono ${matchingItems.length} pozycji - używam pierwszych 10`);
      }
    }
    
    // Filtrowanie po stronie serwera (Firestore)
    if (params.batchNumber) {
      constraints.push(where('batchNumber', '==', params.batchNumber));
    }
    
    // UWAGA: W Firestore pole nazywa się 'itemId' a nie 'materialId'
    // Użyj resolvedItemId tylko jeśli nie użyliśmy już 'in' query
    if (resolvedItemId && !usedInQuery) {
      constraints.push(where('itemId', '==', resolvedItemId));
      console.log(`[ToolExecutor] 🔍 Filtrowanie partii po itemId: ${resolvedItemId}`);
    }
    
    // UWAGA: W Firestore PO jest przechowywany w zagnieżdżonym obiekcie 'purchaseOrderDetails.id'
    // (stary format: 'sourceDetails.orderId' - dla kompatybilności wstecznej)
    if (params.purchaseOrderId) {
      constraints.push(where('purchaseOrderDetails.id', '==', params.purchaseOrderId));
    }
    
    if (params.supplierId) {
      constraints.push(where('supplierId', '==', params.supplierId));
    }
    
    // Filtr po dacie wygaśnięcia (po stronie serwera)
    // UWAGA: Wymaga Composite Index w Firestore Console!
    if (params.expirationDateBefore) {
      const expirationDate = Timestamp.fromDate(new Date(params.expirationDateBefore));
      constraints.push(where('expirationDate', '<=', expirationDate));
      console.log(`[ToolExecutor] 🔍 Filtrowanie partii wygasających przed: ${params.expirationDateBefore}`);
    }
    
    const limitValue = params.limit || 100;
    constraints.push(firestoreLimit(limitValue));
    
    if (constraints.length > 0) {
      q = query(q, ...constraints);
    }
    
    console.log(`[ToolExecutor] 📦 Pobieranie partii z Firestore...`);
    const snapshot = await getDocs(q);
    let batches = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        expirationDate: data.expirationDate?.toDate?.()?.toISOString?.() || data.expirationDate,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt
      };
    });
    
    console.log(`[ToolExecutor] ✅ Pobrano ${batches.length} partii z Firestore`);
    
    // Filtruj wygasające partie
    if (params.checkExpiring) {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      
      batches = batches.filter(batch => {
        if (!batch.expirationDate) return false;
        const expDate = new Date(batch.expirationDate);
        return expDate <= thirtyDaysFromNow && expDate >= new Date();
      });
      
      console.log(`[ToolExecutor] ⏰ Po filtrowaniu wygasających: ${batches.length} partii`);
    }
    
    return {
      batches,
      count: batches.length,
      limitApplied: limitValue,
      searchedTerm: params.materialName || null,
      itemsFound: itemsFound || null,
      isEmpty: batches.length === 0,
      warning: batches.length === 0 ? "⚠️ BRAK DANYCH - Nie znaleziono żadnych partii magazynowych spełniających kryteria. NIE WYMYŚLAJ danych!" : null
    };
  }
  
  /**
   * Pobiera użytkowników
   */
  static async getUsers(params) {
    const collectionName = COLLECTION_MAPPING.users;
    let q = collection(db, collectionName);
    const constraints = [];
    
    if (params.role) {
      constraints.push(where('role', '==', params.role));
    }
    
    if (params.active !== undefined) {
      constraints.push(where('active', '==', params.active));
    }
    
    const limitValue = params.limit || 100;
    constraints.push(firestoreLimit(limitValue));
    
    if (constraints.length > 0) {
      q = query(q, ...constraints);
    }
    
    const snapshot = await getDocs(q);
    const users = snapshot.docs.map(doc => {
      const data = doc.data();
      // Nie zwracaj wrażliwych danych jak hasła, tokeny itp.
      const { password, resetToken, apiKeys, ...safeData } = data;
      return {
        id: doc.id,
        ...safeData,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt
      };
    });
    
    return {
      users,
      count: users.length,
      limitApplied: limitValue
    };
  }
  
  /**
   * Pobiera historię sesji produkcyjnych
   */
  static async queryProductionHistory(params) {
    const collectionName = COLLECTION_MAPPING.production_history;
    let q = collection(db, collectionName);
    const constraints = [];
    
    // Filtr po zadaniu
    if (params.taskId) {
      constraints.push(where('taskId', '==', params.taskId));
    }
    
    // Filtr po użytkowniku
    if (params.userId) {
      constraints.push(where('userId', '==', params.userId));
    }
    
    // Filtr po dacie
    if (params.dateFrom) {
      const fromDate = Timestamp.fromDate(new Date(params.dateFrom));
      constraints.push(where('startTime', '>=', fromDate));
    }
    
    if (params.dateTo) {
      const toDate = Timestamp.fromDate(new Date(params.dateTo));
      constraints.push(where('startTime', '<=', toDate));
    }
    
    // Limit
    const limitValue = params.limit || 100;
    constraints.push(firestoreLimit(limitValue));
    
    if (constraints.length > 0) {
      q = query(q, ...constraints);
    }
    
    const snapshot = await getDocs(q);
    let sessions = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        startTime: data.startTime?.toDate?.()?.toISOString?.() || data.startTime,
        endTime: data.endTime?.toDate?.()?.toISOString?.() || data.endTime,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt
      };
    });
    
    // Filtruj po minimalnej ilości (po stronie klienta)
    if (params.minQuantity) {
      sessions = sessions.filter(s => (s.quantity || 0) >= params.minQuantity);
    }
    
    // Oblicz produktywność
    let productivity = null;
    if (params.calculateProductivity !== false && sessions.length > 0) {
      const totalQuantity = sessions.reduce((sum, s) => sum + (s.quantity || 0), 0);
      const totalTime = sessions.reduce((sum, s) => sum + (s.timeSpent || 0), 0);
      
      productivity = {
        totalQuantity,
        totalTime,
        totalSessions: sessions.length,
        avgQuantityPerSession: totalQuantity / sessions.length,
        avgTimePerSession: totalTime / sessions.length,
        quantityPerHour: totalTime > 0 ? (totalQuantity / (totalTime / 3600)) : 0
      };
    }
    
    // Grupowanie
    if (params.groupBy) {
      const groups = {};
      sessions.forEach(session => {
        let key;
        switch (params.groupBy) {
          case 'user':
            key = session.userName || session.userId || 'Unknown';
            break;
          case 'task':
            key = session.taskId || 'Unknown';
            break;
          case 'day':
            key = session.startTime ? session.startTime.split('T')[0] : 'Unknown';
            break;
          case 'week':
            if (session.startTime) {
              const date = new Date(session.startTime);
              const week = Math.ceil((date.getDate() + new Date(date.getFullYear(), date.getMonth(), 1).getDay()) / 7);
              key = `${date.getFullYear()}-W${week}`;
            } else {
              key = 'Unknown';
            }
            break;
          case 'month':
            key = session.startTime ? session.startTime.substring(0, 7) : 'Unknown';
            break;
          default:
            key = 'Other';
        }
        
        if (!groups[key]) {
          groups[key] = { sessions: [], totalQuantity: 0, totalTime: 0 };
        }
        groups[key].sessions.push(session);
        groups[key].totalQuantity += session.quantity || 0;
        groups[key].totalTime += session.timeSpent || 0;
      });
      
      return {
        groups,
        totalGroups: Object.keys(groups).length,
        groupedBy: params.groupBy,
        productivity,
        limitApplied: limitValue
      };
    }
    
    return {
      sessions,
      count: sessions.length,
      productivity,
      limitApplied: limitValue
    };
  }
  
  /**
   * Pobiera transakcje magazynowe
   */
  static async queryInventoryTransactions(params) {
    const collectionName = COLLECTION_MAPPING.inventory_transactions;
    let q = collection(db, collectionName);
    const constraints = [];
    
    // Filtr po typie transakcji - NORMALIZUJ typy przed zapytaniem (case-sensitive!)
    if (params.type && params.type.length > 0) {
      if (params.type.length <= 10) {
        // Mapowanie typów transakcji z małych liter na właściwe wartości w Firestore
        // UWAGA: Typy muszą odpowiadać TRANSACTION_TYPES w src/services/inventory/config/constants.js
        const typeMapping = {
          // Polskie nazwy
          'rozpoczęcie produkcji': 'production_start',
          'zużycie': 'ISSUE',           // POPRAWIONE - konsumpcja to ISSUE
          'konsumpcja': 'ISSUE',         // DODANE - alias dla zużycia
          'przyjęcie materiału': 'RECEIVE',  // POPRAWIONE - przyjęcie to RECEIVE
          'przyjęcie': 'RECEIVE',        // DODANE - skrót
          'wydanie materiału': 'ISSUE',  // wydanie to też ISSUE
          'wydanie': 'ISSUE',            // DODANE - skrót
          'korekta dodanie': 'adjustment-add',
          'korekta odjęcie': 'adjustment-remove',
          'korekta': 'adjustment-add',   // domyślnie dodanie
          'rezerwacja': 'booking',       // POPRAWIONE - rezerwacja to booking
          'anulowanie rezerwacji': 'booking_cancel',
          'transfer': 'TRANSFER',
          'przeniesienie': 'TRANSFER',
          
          // Angielskie nazwy - bezpośrednie mapowanie na rzeczywiste typy w Firestore
          'production_start': 'production_start',
          'consumption': 'ISSUE',        // POPRAWIONE - consumption to faktycznie ISSUE
          'issue': 'ISSUE',              // DODANE - bezpośredni typ
          'receipt': 'RECEIVE',          // DODANE - receipt to RECEIVE
          'receive': 'RECEIVE',          // DODANE - bezpośredni typ
          'material_in': 'RECEIVE',      // material_in to RECEIVE
          'material_out': 'ISSUE',       // material_out to ISSUE
          'adjustment': 'adjustment-add',
          'adjustment-add': 'adjustment-add',
          'adjustment-remove': 'adjustment-remove',
          'reservation': 'booking',      // POPRAWIONE - reservation to booking
          'booking': 'booking',          // DODANE - bezpośredni typ
          'booking_cancel': 'booking_cancel',  // DODANE - bezpośredni typ
          'transfer': 'TRANSFER',        // DODANE - bezpośredni typ
          
          // Dodatkowe aliasy dla lepszego rozpoznawania
          'produkcja': 'production_start',
          'start produkcji': 'production_start'
        };
        
        // Normalizuj każdy typ
        const normalizedTypes = params.type.map(t => {
          const lower = t.toLowerCase();
          const normalized = typeMapping[lower] || t;
          if (typeMapping[lower]) {
            console.log(`[ToolExecutor] 🔄 Normalizacja typu transakcji: "${t}" → "${normalized}"`);
          } else {
            console.warn(`[ToolExecutor] ⚠️ Nieznany typ transakcji: "${t}" - używam bez zmian`);
          }
          return normalized;
        });
        
        constraints.push(where('type', 'in', normalizedTypes));
      }
    }
    
    // Filtr po materiale
    if (params.itemId) {
      constraints.push(where('itemId', '==', params.itemId));
    }
    
    // Filtr po zadaniu
    if (params.taskId) {
      constraints.push(where('taskId', '==', params.taskId));
    }
    
    // Filtr po partii
    if (params.batchId) {
      constraints.push(where('batchId', '==', params.batchId));
    }
    
    // Filtr po użytkowniku
    if (params.userId) {
      constraints.push(where('createdBy', '==', params.userId));
    }
    
    // Filtr po dacie
    if (params.dateFrom) {
      const fromDate = Timestamp.fromDate(new Date(params.dateFrom));
      constraints.push(where('createdAt', '>=', fromDate));
    }
    
    if (params.dateTo) {
      const toDate = Timestamp.fromDate(new Date(params.dateTo));
      constraints.push(where('createdAt', '<=', toDate));
    }
    
    // Limit
    const limitValue = params.limit || 100;
    constraints.push(firestoreLimit(limitValue));
    
    if (constraints.length > 0) {
      q = query(q, ...constraints);
    }
    
    const snapshot = await getDocs(q);
    let transactions = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || data.updatedAt
      };
    });
    
    // Filtruj po nazwie materiału (po stronie klienta)
    if (params.itemName) {
      const searchTerm = params.itemName.toLowerCase();
      transactions = transactions.filter(t => 
        (t.itemName || '').toLowerCase().includes(searchTerm)
      );
    }
    
    // Oblicz sumy
    let totals = null;
    if (params.calculateTotals !== false) {
      const totalsByType = {};
      transactions.forEach(t => {
        const type = t.type || 'unknown';
        if (!totalsByType[type]) {
          totalsByType[type] = { count: 0, totalQuantity: 0 };
        }
        totalsByType[type].count++;
        totalsByType[type].totalQuantity += t.quantity || 0;
      });
      
      totals = {
        totalTransactions: transactions.length,
        byType: totalsByType
      };
    }
    
    // Grupowanie
    if (params.groupBy) {
      const groups = {};
      transactions.forEach(transaction => {
        let key;
        switch (params.groupBy) {
          case 'type':
            key = transaction.type || 'Unknown';
            break;
          case 'item':
            key = transaction.itemName || 'Unknown';
            break;
          case 'task':
            key = transaction.taskNumber || transaction.taskId || 'N/A';
            break;
          case 'user':
            key = transaction.userName || 'Unknown';
            break;
          case 'day':
            key = transaction.createdAt ? transaction.createdAt.split('T')[0] : 'Unknown';
            break;
          case 'week':
            if (transaction.createdAt) {
              const date = new Date(transaction.createdAt);
              const week = Math.ceil((date.getDate() + new Date(date.getFullYear(), date.getMonth(), 1).getDay()) / 7);
              key = `${date.getFullYear()}-W${week}`;
            } else {
              key = 'Unknown';
            }
            break;
          default:
            key = 'Other';
        }
        
        if (!groups[key]) {
          groups[key] = { transactions: [], count: 0, totalQuantity: 0 };
        }
        groups[key].transactions.push(transaction);
        groups[key].count++;
        groups[key].totalQuantity += transaction.quantity || 0;
      });
      
      return {
        groups,
        totalGroups: Object.keys(groups).length,
        groupedBy: params.groupBy,
        totals,
        limitApplied: limitValue
      };
    }
    
    return {
      transactions,
      count: transactions.length,
      totals,
      limitApplied: limitValue
    };
  }
  
  /**
   * Generuje alerty systemowe
   */
  static async getSystemAlerts(params) {
    const alerts = [];
    const alertTypes = params.alertTypes || ['low_stock', 'expiring_batches', 'delayed_mo', 'pending_orders', 'overdue_invoices'];
    const severity = params.severity || 'all';
    
    // 1. Niskie stany magazynowe
    if (alertTypes.includes('low_stock')) {
      const inventoryRef = collection(db, COLLECTION_MAPPING.inventory);
      const inventorySnapshot = await getDocs(inventoryRef);
      
      inventorySnapshot.docs.forEach(doc => {
        const data = doc.data();
        const quantity = data.quantity || 0;
        const minQuantity = data.minQuantity || 0;
        
        if (quantity < minQuantity) {
          const severityLevel = quantity === 0 ? 'critical' : 'warning';
          if (severity === 'all' || severity === severityLevel) {
            alerts.push({
              type: 'low_stock',
              severity: severityLevel,
              title: `Niski stan: ${data.name}`,
              message: `Aktualny stan: ${quantity}, Minimalny: ${minQuantity}`,
              itemId: doc.id,
              itemName: data.name,
              currentQuantity: quantity,
              minQuantity: minQuantity,
              deficit: minQuantity - quantity
            });
          }
        }
      });
    }
    
    // 2. Wygasające partie
    if (alertTypes.includes('expiring_batches')) {
      const batchesRef = collection(db, COLLECTION_MAPPING.inventory_batches);
      const batchesSnapshot = await getDocs(batchesRef);
      
      const today = new Date();
      const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
      
      batchesSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.expirationDate) {
          const expDate = data.expirationDate.toDate ? data.expirationDate.toDate() : new Date(data.expirationDate);
          
          if (expDate <= thirtyDaysFromNow && expDate >= today) {
            const daysLeft = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
            const severityLevel = daysLeft <= 7 ? 'critical' : daysLeft <= 14 ? 'warning' : 'info';
            
            if (severity === 'all' || severity === severityLevel) {
              alerts.push({
                type: 'expiring_batch',
                severity: severityLevel,
                title: `Wygasa partia: ${data.batchNumber}`,
                message: `Materiał: ${data.itemName || 'Nieznany'}, Wygasa za ${daysLeft} dni`,
                batchId: doc.id,
                batchNumber: data.batchNumber,
                itemName: data.itemName || 'Nieznany',  // UWAGA: Firestore używa 'itemName' nie 'materialName'
                expirationDate: expDate.toISOString(),
                daysLeft
              });
            }
          }
        }
      });
    }
    
    // 3. Opóźnione MO
    if (alertTypes.includes('delayed_mo')) {
      const tasksRef = collection(db, COLLECTION_MAPPING.production_tasks);
      const tasksQuery = query(
        tasksRef,
        where('status', 'in', ['zaplanowane', 'w trakcie'])
      );
      const tasksSnapshot = await getDocs(tasksQuery);
      
      const today = new Date();
      
      tasksSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.plannedEndDate) {
          const endDate = data.plannedEndDate.toDate ? data.plannedEndDate.toDate() : new Date(data.plannedEndDate);
          
          if (endDate < today) {
            const daysOverdue = Math.ceil((today - endDate) / (1000 * 60 * 60 * 24));
            const severityLevel = daysOverdue > 7 ? 'critical' : 'warning';
            
            if (severity === 'all' || severity === severityLevel) {
              alerts.push({
                type: 'delayed_mo',
                severity: severityLevel,
                title: `Opóźnione MO: ${data.moNumber}`,
                message: `${data.productName}, Opóźnienie: ${daysOverdue} dni`,
                taskId: doc.id,
                moNumber: data.moNumber,
                productName: data.productName,
                plannedEndDate: endDate.toISOString(),
                daysOverdue,
                status: data.status
              });
            }
          }
        }
      });
    }
    
    // 4. Oczekujące zamówienia
    if (alertTypes.includes('pending_orders')) {
      const ordersRef = collection(db, COLLECTION_MAPPING.customer_orders);
      const ordersQuery = query(
        ordersRef,
        where('status', '==', 'pending')
      );
      const ordersSnapshot = await getDocs(ordersQuery);
      
      const today = new Date();
      
      ordersSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.deliveryDate) {
          const deliveryDate = data.deliveryDate.toDate ? data.deliveryDate.toDate() : new Date(data.deliveryDate);
          const daysUntilDelivery = Math.ceil((deliveryDate - today) / (1000 * 60 * 60 * 24));
          
          if (daysUntilDelivery <= 7) {
            const severityLevel = daysUntilDelivery <= 2 ? 'critical' : 'warning';
            
            if (severity === 'all' || severity === severityLevel) {
              alerts.push({
                type: 'pending_order',
                severity: severityLevel,
                title: `Oczekujące CO: ${data.orderNumber}`,
                message: `Klient: ${data.customerName}, Dostawa za ${daysUntilDelivery} dni`,
                orderId: doc.id,
                orderNumber: data.orderNumber,
                customerName: data.customerName,
                deliveryDate: deliveryDate.toISOString(),
                daysUntilDelivery
              });
            }
          }
        }
      });
    }
    
    // 5. Przeterminowane faktury
    if (alertTypes.includes('overdue_invoices')) {
      const invoicesRef = collection(db, COLLECTION_MAPPING.invoices);
      const invoicesQuery = query(
        invoicesRef,
        where('status', '!=', 'paid')
      );
      const invoicesSnapshot = await getDocs(invoicesQuery);
      
      const today = new Date();
      
      invoicesSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.dueDate) {
          const dueDate = data.dueDate.toDate ? data.dueDate.toDate() : new Date(data.dueDate);
          
          if (dueDate < today) {
            const daysOverdue = Math.ceil((today - dueDate) / (1000 * 60 * 60 * 24));
            const severityLevel = daysOverdue > 30 ? 'critical' : 'warning';
            
            if (severity === 'all' || severity === severityLevel) {
              alerts.push({
                type: 'overdue_invoice',
                severity: severityLevel,
                title: `Przeterminowana faktura: ${data.invoiceNumber}`,
                message: `Klient: ${data.customerName}, Zaległość: ${daysOverdue} dni`,
                invoiceId: doc.id,
                invoiceNumber: data.invoiceNumber,
                customerName: data.customerName,
                dueDate: dueDate.toISOString(),
                daysOverdue,
                amount: data.totalAmount
              });
            }
          }
        }
      });
    }
    
    // Sortuj alerty wg severity (critical > warning > info)
    const severityOrder = { 'critical': 0, 'warning': 1, 'info': 2 };
    alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
    
    // Zastosuj limit
    const limitValue = params.limit || 50;
    const limitedAlerts = alerts.slice(0, limitValue);
    
    // Statystyki
    const stats = {
      total: alerts.length,
      bySeverity: {
        critical: alerts.filter(a => a.severity === 'critical').length,
        warning: alerts.filter(a => a.severity === 'warning').length,
        info: alerts.filter(a => a.severity === 'info').length
      },
      byType: {}
    };
    
    alertTypes.forEach(type => {
      stats.byType[type] = alerts.filter(a => a.type === type || a.type === type.replace('_', '')).length;
    });
    
    return {
      alerts: limitedAlerts,
      count: limitedAlerts.length,
      totalAlerts: alerts.length,
      stats,
      limitApplied: limitValue
    };
  }
  
  /**
   * Oblicza koszty produkcji
   */
  static async calculateProductionCosts(params) {
    const tasksRef = collection(db, COLLECTION_MAPPING.production_tasks);
    let q = tasksRef;
    const constraints = [];
    
    // Filtr po konkretnym zadaniu
    if (params.taskId) {
      const taskDoc = await getDoc(doc(db, COLLECTION_MAPPING.production_tasks, params.taskId));
      if (!taskDoc.exists()) {
        return { error: 'Nie znaleziono zadania produkcyjnego' };
      }
      
      const task = { id: taskDoc.id, ...taskDoc.data() };
      const costAnalysis = await this.analyzeTaskCosts(task, params);
      
      return {
        task: {
          id: task.id,
          moNumber: task.moNumber,
          productName: task.productName,
          ...costAnalysis
        },
        count: 1
      };
    }
    
    // Filtr po nazwie produktu
    if (params.productName) {
      const searchTerm = params.productName.toLowerCase();
      // Pobierzemy wszystkie i przefiltrujemy po stronie klienta
    }
    
    // Filtr po dacie
    if (params.dateFrom) {
      const fromDate = Timestamp.fromDate(new Date(params.dateFrom));
      constraints.push(where('createdAt', '>=', fromDate));
    }
    
    if (params.dateTo) {
      const toDate = Timestamp.fromDate(new Date(params.dateTo));
      constraints.push(where('createdAt', '<=', toDate));
    }
    
    // Limit
    const limitValue = params.limit || 100;
    constraints.push(firestoreLimit(limitValue));
    
    if (constraints.length > 0) {
      q = query(q, ...constraints);
    }
    
    const snapshot = await getDocs(q);
    let tasks = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Filtruj po nazwie produktu (po stronie klienta)
    if (params.productName) {
      const searchTerm = params.productName.toLowerCase();
      tasks = tasks.filter(task => 
        (task.productName || '').toLowerCase().includes(searchTerm)
      );
    }
    
    // Analizuj koszty dla każdego zadania
    const tasksWithCosts = await Promise.all(
      tasks.map(async (task) => {
        const costAnalysis = await this.analyzeTaskCosts(task, params);
        return {
          id: task.id,
          moNumber: task.moNumber,
          productName: task.productName,
          status: task.status,
          finalQuantity: task.finalQuantity,
          ...costAnalysis
        };
      })
    );
    
    // Grupowanie po produkcie
    if (params.groupByProduct) {
      const groups = {};
      tasksWithCosts.forEach(task => {
        const key = task.productName || 'Unknown';
        if (!groups[key]) {
          groups[key] = {
            tasks: [],
            totalCost: 0,
            totalQuantity: 0,
            avgCostPerUnit: 0
          };
        }
        groups[key].tasks.push(task);
        groups[key].totalCost += task.totalCost || 0;
        groups[key].totalQuantity += task.finalQuantity || 0;
      });
      
      // Oblicz średnie koszty
      Object.keys(groups).forEach(key => {
        const group = groups[key];
        group.avgCostPerUnit = group.totalQuantity > 0 
          ? group.totalCost / group.totalQuantity 
          : 0;
      });
      
      return {
        groups,
        totalGroups: Object.keys(groups).length,
        count: tasksWithCosts.length
      };
    }
    
    return {
      tasks: tasksWithCosts,
      count: tasksWithCosts.length,
      limitApplied: limitValue
    };
  }
  
  /**
   * Analizuje koszty pojedynczego zadania
   * @private
   */
  static async analyzeTaskCosts(task, params) {
    const consumedMaterials = task.consumedMaterials || [];
    let totalCost = 0;
    const breakdown = [];
    
    for (const material of consumedMaterials) {
      const materialCost = (material.quantity || 0) * (material.unitPrice || 0);
      totalCost += materialCost;
      
      if (params.includeBreakdown) {
        breakdown.push({
          materialName: material.materialName,
          quantity: material.quantity,
          unitPrice: material.unitPrice,
          totalCost: materialCost
        });
      }
    }
    
    const result = {
      totalCost: parseFloat(totalCost.toFixed(2)),
      materialCount: consumedMaterials.length
    };
    
    if (params.includeBreakdown) {
      result.breakdown = breakdown;
    }
    
    // Porównanie z ceną sprzedaży
    if (params.compareWithPrice && task.unitPrice) {
      const revenue = (task.finalQuantity || 0) * (task.unitPrice || 0);
      const profit = revenue - totalCost;
      const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
      
      result.priceAnalysis = {
        unitPrice: task.unitPrice,
        totalRevenue: parseFloat(revenue.toFixed(2)),
        totalProfit: parseFloat(profit.toFixed(2)),
        marginPercent: parseFloat(margin.toFixed(2)),
        costPerUnit: task.finalQuantity > 0 
          ? parseFloat((totalCost / task.finalQuantity).toFixed(2))
          : 0
      };
    }
    
    return result;
  }
  
  /**
   * Śledzi przepływ materiału przez system
   */
  static async traceMaterialFlow(params) {
    const flow = {
      startPoint: null,
      purchaseOrders: [],
      batches: [],
      productionTasks: [],
      customerOrders: [],
      direction: params.direction || 'both'
    };
    
    // Określ punkt startu
    if (params.batchId) {
      flow.startPoint = { type: 'batch', id: params.batchId };
      
      // Pobierz partię
      const batchDoc = await getDoc(doc(db, COLLECTION_MAPPING.inventory_batches, params.batchId));
      if (batchDoc.exists()) {
        flow.batches.push({ id: batchDoc.id, ...batchDoc.data() });
        
        // Backward: Znajdź PO
        if (params.direction === 'backward' || params.direction === 'both') {
          const batch = batchDoc.data();
          if (batch.purchaseOrderId) {
            const poDoc = await getDoc(doc(db, COLLECTION_MAPPING.purchase_orders, batch.purchaseOrderId));
            if (poDoc.exists()) {
              flow.purchaseOrders.push({ id: poDoc.id, ...poDoc.data() });
            }
          }
        }
        
        // Forward: Znajdź MO które użyły tej partii
        if (params.direction === 'forward' || params.direction === 'both') {
          const transactionsRef = collection(db, COLLECTION_MAPPING.inventory_transactions);
          const q = query(
            transactionsRef,
            where('batchId', '==', params.batchId),
            where('type', '==', 'consumption')
          );
          const transSnapshot = await getDocs(q);
          
          const taskIds = [...new Set(transSnapshot.docs.map(doc => doc.data().taskId).filter(Boolean))];
          
          for (const taskId of taskIds) {
            const taskDoc = await getDoc(doc(db, COLLECTION_MAPPING.production_tasks, taskId));
            if (taskDoc.exists()) {
              const task = taskDoc.data();
              flow.productionTasks.push({
                id: taskDoc.id,
                moNumber: task.moNumber,
                productName: task.productName,
                status: task.status
              });
              
              // Znajdź CO powiązane z tym MO
              if (task.orderId) {
                const orderDoc = await getDoc(doc(db, COLLECTION_MAPPING.customer_orders, task.orderId));
                if (orderDoc.exists()) {
                  flow.customerOrders.push({ id: orderDoc.id, ...orderDoc.data() });
                }
              }
            }
          }
        }
      }
    } else if (params.taskId) {
      flow.startPoint = { type: 'production_task', id: params.taskId };
      
      // Pobierz zadanie
      const taskDoc = await getDoc(doc(db, COLLECTION_MAPPING.production_tasks, params.taskId));
      if (taskDoc.exists()) {
        const task = taskDoc.data();
        flow.productionTasks.push({ id: taskDoc.id, ...task });
        
        // Backward: Znajdź partie z których pobrano materiały
        if (params.direction === 'backward' || params.direction === 'both') {
          const transactionsRef = collection(db, COLLECTION_MAPPING.inventory_transactions);
          const q = query(
            transactionsRef,
            where('taskId', '==', params.taskId),
            where('type', '==', 'consumption')
          );
          const transSnapshot = await getDocs(q);
          
          const batchIds = [...new Set(transSnapshot.docs.map(doc => doc.data().batchId).filter(Boolean))];
          
          for (const batchId of batchIds) {
            const batchDoc = await getDoc(doc(db, COLLECTION_MAPPING.inventory_batches, batchId));
            if (batchDoc.exists()) {
              flow.batches.push({ id: batchDoc.id, ...batchDoc.data() });
            }
          }
        }
        
        // Forward: Znajdź CO
        if (params.direction === 'forward' || params.direction === 'both') {
          if (task.orderId) {
            const orderDoc = await getDoc(doc(db, COLLECTION_MAPPING.customer_orders, task.orderId));
            if (orderDoc.exists()) {
              flow.customerOrders.push({ id: orderDoc.id, ...orderDoc.data() });
            }
          }
        }
      }
    } else if (params.orderId) {
      flow.startPoint = { type: 'customer_order', id: params.orderId };
      
      // Pobierz zamówienie
      const orderDoc = await getDoc(doc(db, COLLECTION_MAPPING.customer_orders, params.orderId));
      if (orderDoc.exists()) {
        flow.customerOrders.push({ id: orderDoc.id, ...orderDoc.data() });
        
        // Backward: Znajdź MO powiązane z tym CO
        if (params.direction === 'backward' || params.direction === 'both') {
          const tasksRef = collection(db, COLLECTION_MAPPING.production_tasks);
          const q = query(tasksRef, where('orderId', '==', params.orderId));
          const tasksSnapshot = await getDocs(q);
          
          for (const taskDoc of tasksSnapshot.docs) {
            const task = taskDoc.data();
            flow.productionTasks.push({ id: taskDoc.id, ...task });
            
            // Znajdź partie użyte w tych MO
            const transactionsRef = collection(db, COLLECTION_MAPPING.inventory_transactions);
            const transQ = query(
              transactionsRef,
              where('taskId', '==', taskDoc.id),
              where('type', '==', 'consumption')
            );
            const transSnapshot = await getDocs(transQ);
            
            const batchIds = [...new Set(transSnapshot.docs.map(doc => doc.data().batchId).filter(Boolean))];
            
            for (const batchId of batchIds) {
              const batchDoc = await getDoc(doc(db, COLLECTION_MAPPING.inventory_batches, batchId));
              if (batchDoc.exists()) {
                flow.batches.push({ id: batchDoc.id, ...batchDoc.data() });
              }
            }
          }
        }
      }
    } else if (params.materialId) {
      flow.startPoint = { type: 'material', id: params.materialId };
      
      // Znajdź wszystkie partie tego materiału
      const batchesRef = collection(db, COLLECTION_MAPPING.inventory_batches);
      const q = query(batchesRef, where('materialId', '==', params.materialId));
      const batchesSnapshot = await getDocs(q);
      
      flow.batches = batchesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    }
    
    // Usuń duplikaty
    flow.batches = Array.from(new Map(flow.batches.map(item => [item.id, item])).values());
    flow.productionTasks = Array.from(new Map(flow.productionTasks.map(item => [item.id, item])).values());
    flow.customerOrders = Array.from(new Map(flow.customerOrders.map(item => [item.id, item])).values());
    flow.purchaseOrders = Array.from(new Map(flow.purchaseOrders.map(item => [item.id, item])).values());
    
    // Usuń szczegóły jeśli nie są potrzebne
    if (!params.includeDetails) {
      flow.batches = flow.batches.map(({ id, batchNumber, materialName }) => ({ id, batchNumber, materialName }));
      flow.productionTasks = flow.productionTasks.map(({ id, moNumber, productName, status }) => ({ id, moNumber, productName, status }));
      flow.customerOrders = flow.customerOrders.map(({ id, orderNumber, customerName, status }) => ({ id, orderNumber, customerName, status }));
      flow.purchaseOrders = flow.purchaseOrders.map(({ id, poNumber, supplierName, status }) => ({ id, poNumber, supplierName, status }));
    }
    
    return {
      flow,
      summary: {
        purchaseOrders: flow.purchaseOrders.length,
        batches: flow.batches.length,
        productionTasks: flow.productionTasks.length,
        customerOrders: flow.customerOrders.length
      }
    };
  }
  
  /**
   * Oblicza łączną wagę składników receptury
   */
  static calculateTotalWeight(ingredients) {
    if (!Array.isArray(ingredients)) return 0;
    
    return ingredients.reduce((total, ingredient) => {
      const quantity = parseFloat(ingredient.quantity) || 0;
      const unit = ingredient.unit || 'g';
      
      // Konwersja na gramy
      let quantityInGrams = quantity;
      if (unit === 'kg') {
        quantityInGrams = quantity * 1000;
      } else if (unit === 'ml') {
        // Przyjmij gęstość ~1 dla uproszczenia
        quantityInGrams = quantity;
      }
      
      return total + quantityInGrams;
    }, 0);
  }
}

