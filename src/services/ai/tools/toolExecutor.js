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
import { getUsersDisplayNames } from '../../userService.js';
import { AIFeedback } from '../../bugReportService.js';

/**
 * Wykonuje narzędzia (funkcje) wywołane przez GPT
 * Każda funkcja wykonuje targetowane zapytanie do Firestore
 */
export class ToolExecutor {
  
  /**
   * Helper: Rozwiązuje nazwy użytkowników dla listy ID
   * @private
   */
  static async resolveUserNames(userIds) {
    if (!userIds || userIds.length === 0) return {};
    
    try {
      const uniqueIds = [...new Set(userIds.filter(id => id))];
      const userNamesMap = await getUsersDisplayNames(uniqueIds);
      return userNamesMap;
    } catch (error) {
      console.warn('[ToolExecutor] ⚠️ Nie udało się pobrać nazw użytkowników:', error.message);
      // Zwróć mapę z ID jako wartościami (fallback)
      const fallbackMap = {};
      userIds.forEach(id => {
        if (id) fallbackMap[id] = id;
      });
      return fallbackMap;
    }
  }
  
  /**
   * Helper: Zamienia ID użytkownika na nazwę (jeśli jest w mapie)
   * @private
   */
  static getUserName(userId, userNamesMap) {
    if (!userId) return null;
    return userNamesMap[userId] || userId; // Fallback do ID jeśli nie ma nazwy
  }
  
  /**
   * Helper: Rozwiązuje nazwy materiałów dla listy ID
   * @private
   */
  static async resolveMaterialNames(materialIds) {
    if (!materialIds || materialIds.length === 0) return {};
    
    try {
      const uniqueIds = [...new Set(materialIds.filter(id => id))];
      const materialNamesMap = {};
      
      // Pobierz materiały z kolekcji inventory
      const inventoryRef = collection(db, COLLECTION_MAPPING.inventory);
      const snapshot = await getDocs(inventoryRef);
      
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        // Użyj zarówno doc.id jak i data.id jako klucze (niektóre materiały mogą używać data.id)
        if (uniqueIds.includes(doc.id)) {
          materialNamesMap[doc.id] = data.name || data.id || doc.id;
        }
        if (data.id && uniqueIds.includes(data.id)) {
          materialNamesMap[data.id] = data.name || data.id;
        }
      });
      
      console.log(`[ToolExecutor] ✅ Rozwiązano nazwy dla ${Object.keys(materialNamesMap).length}/${uniqueIds.length} materiałów`);
      return materialNamesMap;
    } catch (error) {
      console.warn('[ToolExecutor] ⚠️ Nie udało się pobrać nazw materiałów:', error.message);
      // Zwróć pustą mapę (materiały będą pokazane jako ID)
      return {};
    }
  }
  
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
        // ✅ NOWE FUNKCJE
        case 'get_production_schedule':
          result = await this.getProductionSchedule(parameters);
          break;
        case 'analyze_material_forecast':
          result = await this.analyzeMaterialForecast(parameters);
          break;
        case 'analyze_supplier_performance':
          result = await this.analyzeSupplierPerformance(parameters);
          break;
        case 'get_customer_analytics':
          result = await this.getCustomerAnalytics(parameters);
          break;
        case 'query_form_responses':
          result = await this.queryFormResponses(parameters);
          break;
        case 'get_audit_log':
          result = await this.getAuditLog(parameters);
          break;
        case 'calculate_batch_traceability':
          result = await this.calculateBatchTraceability(parameters);
          break;
        // 🆕 NOWA FUNKCJA: Aktualizacja pozycji PO z dokumentu dostawy
        case 'update_purchase_order_items':
          result = await this.updatePurchaseOrderItems(parameters);
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
      
      // 🆕 Automatyczne logowanie błędu narzędzia do AI Feedback
      AIFeedback.logToolError(functionName, parameters, error).catch(err => {
        console.warn('[ToolExecutor] ⚠️ Nie udało się zalogować błąd narzędzia:', err.message);
      });
      
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
    
    // ⚠️ STRATEGIA: Używaj TYLKO JEDNEGO filtru serwera dla pól identyfikujących
    // Reszta filtrów będzie zastosowana po stronie klienta
    // Powód: Firestore wymaga composite indexes dla wielu where() na różnych polach
    
    let serverFilter = null;
    const clientFilters = {};
    
    // PRIORYTET FILTRÓW (od najbardziej do najmniej selektywnego):
    // 1. moNumber - najbardziej unikalny identyfikator
    // 2. lotNumber - wysoka selektywność
    // 3. orderId - może mieć wiele MO
    // 4. productId - może mieć wiele MO
    
    if (params.moNumber) {
      constraints.push(where('moNumber', '==', params.moNumber));
      serverFilter = 'moNumber';
      console.log(`[ToolExecutor] 🔍 Filtr serwera: moNumber = ${params.moNumber}`);
    } else if (params.lotNumber) {
      constraints.push(where('lotNumber', '==', params.lotNumber));
      serverFilter = 'lotNumber';
      console.log(`[ToolExecutor] 🔍 Filtr serwera: lotNumber = ${params.lotNumber}`);
    } else if (params.orderId) {
      constraints.push(where('orderId', '==', params.orderId));
      serverFilter = 'orderId';
      console.log(`[ToolExecutor] 🔍 Filtr serwera: orderId = ${params.orderId}`);
    } else if (params.productId) {
      constraints.push(where('productId', '==', params.productId));
      serverFilter = 'productId';
      console.log(`[ToolExecutor] 🔍 Filtr serwera: productId = ${params.productId}`);
    }
    
    // Zapisz pozostałe filtry do filtrowania po stronie klienta
    if (params.productId && serverFilter !== 'productId') {
      clientFilters.productId = params.productId;
    }
    if (params.orderId && serverFilter !== 'orderId') {
      clientFilters.orderId = params.orderId;
    }
    if (params.lotNumber && serverFilter !== 'lotNumber') {
      clientFilters.lotNumber = params.lotNumber;
    }
    if (params.moNumber && serverFilter !== 'moNumber') {
      clientFilters.moNumber = params.moNumber;
    }
    
    if (Object.keys(clientFilters).length > 0) {
      console.log(`[ToolExecutor] 📋 Filtry klienckie: ${Object.keys(clientFilters).join(', ')}`);
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
    
    // Limit - UWAGA: gdy filtrujemy po productName (klient-side), pobieramy więcej danych
    // bo filtrowanie następuje PO pobraniu z bazy
    const needsClientSideFiltering = !!params.productName;
    const limitValue = needsClientSideFiltering 
      ? (params.limit || 500) // Większy limit dla filtrowania client-side
      : (params.limit || 50);
    constraints.push(firestoreLimit(limitValue));
    
    if (needsClientSideFiltering) {
      console.log(`[ToolExecutor] ⚠️ Filtrowanie client-side - zwiększony limit do ${limitValue}`);
    }
    
    if (constraints.length > 0) {
      q = query(q, ...constraints);
    }
    
    const snapshot = await getDocs(q);
    let tasks = snapshot.docs.map(doc => {
      const data = doc.data();
      
      // ⚡ OPTYMALIZACJA: Usuń duże pola i metadata od razu, aby zaoszczędzić pamięć i tokeny
      const { 
        materials, 
        consumedMaterials, 
        formResponses,
        // Usuń metadane ale ZACHOWAJ pola użytkowników do późniejszego rozwiązania
        attachments,
        notes,
        history,
        ...cleanData 
      } = data;
      
      return {
        id: doc.id,
        ...cleanData,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() || data.updatedAt,
        startDate: data.startDate?.toDate?.()?.toISOString?.() || data.startDate,
        endDate: data.endDate?.toDate?.()?.toISOString?.() || data.endDate,
        // Zachowaj pola użytkowników (będą zamienione na nazwy poniżej)
        createdBy: data.createdBy,
        updatedBy: data.updatedBy,
        assignedTo: data.assignedTo,
        // Dołącz duże pola tylko gdy wyraźnie proszono (includeDetails=true)
        ...(params.includeDetails === true ? {
          materials,
          consumedMaterials,
          formResponses
        } : {
          // Zachowaj podstawowe statystyki zamiast pełnych danych
          materialsCount: materials?.length || 0,
          consumedMaterialsCount: consumedMaterials?.length || 0,
          formResponsesCount: formResponses?.length || 0
        })
      };
    });
    
    // Zastosuj filtry klienckie (dla pól, które nie były użyte w query serwera)
    if (Object.keys(clientFilters).length > 0) {
      const beforeCount = tasks.length;
      tasks = tasks.filter(task => {
        return Object.entries(clientFilters).every(([key, value]) => {
          return task[key] === value;
        });
      });
      console.log(`[ToolExecutor] ✅ Filtrowanie klienckie: ${beforeCount} → ${tasks.length} zadań`);
    }
    
    // Filtruj po nazwie/kodzie produktu (po stronie klienta)
    if (params.productName) {
      const searchTerm = params.productName.toLowerCase();
      const beforeFilter = tasks.length;
      
      // Debug: pokaż przykłady wartości pól w zadaniach
      if (tasks.length > 0) {
        const uniqueProductNames = [...new Set(tasks.slice(0, 20).map(t => t.productName).filter(Boolean))];
        console.log(`[ToolExecutor] 🔍 Przykładowe productNames w bazie:`, uniqueProductNames.slice(0, 5));
      }
      
      tasks = tasks.filter(task => 
        (task.productName || '').toLowerCase().includes(searchTerm) ||
        (task.productId || '').toLowerCase().includes(searchTerm) ||
        (task.productCode || '').toLowerCase().includes(searchTerm) ||
        (task.sku || '').toLowerCase().includes(searchTerm) ||
        (task.moNumber || '').toLowerCase().includes(searchTerm) ||
        (task.name || '').toLowerCase().includes(searchTerm) ||
        (task.recipeId || '').toLowerCase().includes(searchTerm)
      );
      
      console.log(`[ToolExecutor] 🔍 Filtrowanie po productName: "${searchTerm}", przed: ${beforeFilter}, po: ${tasks.length}`);
      
      // Po filtrowaniu zastosuj docelowy limit (żeby nie zwracać 500 wyników do AI)
      const finalLimit = params.limit || 50;
      if (tasks.length > finalLimit) {
        console.log(`[ToolExecutor] ✂️ Ograniczam wyniki z ${tasks.length} do ${finalLimit}`);
        tasks = tasks.slice(0, finalLimit);
      }
    }
    
    // ✅ NOWE: Rozwiąż nazwy użytkowników
    const userIds = [];
    tasks.forEach(task => {
      if (task.createdBy) userIds.push(task.createdBy);
      if (task.updatedBy) userIds.push(task.updatedBy);
      if (task.assignedTo) userIds.push(task.assignedTo);
    });
    
    if (userIds.length > 0) {
      const userNamesMap = await this.resolveUserNames(userIds);
      
      tasks = tasks.map(task => ({
        ...task,
        createdBy: task.createdBy ? this.getUserName(task.createdBy, userNamesMap) : null,
        updatedBy: task.updatedBy ? this.getUserName(task.updatedBy, userNamesMap) : null,
        assignedTo: task.assignedTo ? this.getUserName(task.assignedTo, userNamesMap) : null
      }));
      
      console.log(`[ToolExecutor] ✅ Rozwiązano nazwy dla ${Object.keys(userNamesMap).length} użytkowników`);
    }
    
    // ✅ NOWE: Rozwiąż nazwy materiałów w consumedMaterials (tylko gdy includeDetails=true)
    if (params.includeDetails === true) {
      // Zbierz wszystkie materialId z consumedMaterials i materials
      const materialIds = [];
      tasks.forEach(task => {
        if (task.consumedMaterials) {
          task.consumedMaterials.forEach(cm => {
            if (cm.materialId) materialIds.push(cm.materialId);
          });
        }
        if (task.materials) {
          task.materials.forEach(m => {
            if (m.inventoryItemId) materialIds.push(m.inventoryItemId);
            if (m.id) materialIds.push(m.id);
          });
        }
      });
      
      if (materialIds.length > 0) {
        const materialNamesMap = await this.resolveMaterialNames(materialIds);
        
        // Zaktualizuj consumedMaterials z nazwami materiałów
        tasks = tasks.map(task => {
          if (task.consumedMaterials) {
            task.consumedMaterials = task.consumedMaterials.map(cm => ({
              ...cm,
              // Użyj istniejącej nazwy lub rozwiąż z mapy lub użyj ID jako fallback
              materialName: cm.materialName || materialNamesMap[cm.materialId] || cm.materialId || 'Nieznany materiał'
            }));
          }
          if (task.materials) {
            task.materials = task.materials.map(m => ({
              ...m,
              name: m.name || materialNamesMap[m.inventoryItemId] || materialNamesMap[m.id] || m.name || 'Nieznany materiał'
            }));
          }
          return task;
        });
        
        console.log(`[ToolExecutor] ✅ Rozwiązano nazwy dla ${Object.keys(materialNamesMap).length} materiałów w consumedMaterials`);
      }
    }
    
    // Ostrzeżenie o dużej liczbie wyników (optymalizacja tokenów)
    let warning = null;
    if (tasks.length === 0) {
      warning = "⚠️ BRAK DANYCH - Nie znaleziono żadnych zadań produkcyjnych spełniających kryteria. NIE WYMYŚLAJ danych!";
    } else if (tasks.length > 20) {
      warning = `⚠️ DUŻO WYNIKÓW - Zwrócono ${tasks.length} zadań. To może zwiększyć zużycie tokenów. Rozważ użycie bardziej precyzyjnych filtrów.`;
    }
    
    return {
      tasks,
      count: tasks.length,
      limitApplied: limitValue,
      isEmpty: tasks.length === 0,
      warning
    };
  }
  
  /**
   * Pobiera zamówienia klientów
   */
  static async queryOrders(params) {
    const collectionName = COLLECTION_MAPPING.customer_orders;
    let q = collection(db, collectionName);
    const constraints = [];
    
    // 🆕 Flaga czy potrzebujemy filtrowania client-side (zwiększamy limit)
    const needsClientSideFiltering = !!(
      params.deliveryDateFrom || 
      params.deliveryDateTo ||
      params.customerName
    );
    
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
    
    // Filtr po dacie utworzenia zamówienia
    if (params.dateFrom) {
      const fromDate = Timestamp.fromDate(new Date(params.dateFrom));
      constraints.push(where('orderDate', '>=', fromDate));
      console.log(`[ToolExecutor] 📅 Filtrowanie CO od orderDate: ${params.dateFrom}`);
    }
    
    if (params.dateTo) {
      const toDate = Timestamp.fromDate(new Date(params.dateTo));
      constraints.push(where('orderDate', '<=', toDate));
      console.log(`[ToolExecutor] 📅 Filtrowanie CO do orderDate: ${params.dateTo}`);
    }
    
    // Zwiększ limit jeśli potrzebujemy filtrowania client-side
    const limitValue = needsClientSideFiltering ? 500 : (params.limit || 100);
    constraints.push(firestoreLimit(limitValue));
    
    if (constraints.length > 0) {
      q = query(q, ...constraints);
    }
    
    const snapshot = await getDocs(q);
    let orders = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        orderNumber: data.orderNumber,
        status: data.status,
        customerId: data.customerId,
        customerName: data.customerName,
        orderDate: data.orderDate?.toDate?.()?.toISOString?.() || data.orderDate,
        deliveryDate: data.deliveryDate?.toDate?.()?.toISOString?.() || data.deliveryDate,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt,
        totalValue: data.totalValue || data.total,
        currency: data.currency || 'EUR',
        items: data.items,
        notes: data.notes
      };
    });
    
    console.log(`[ToolExecutor] 📋 Pobrano ${orders.length} zamówień klientów z Firestore`);
    
    // Filtruj po nazwie klienta (po stronie klienta)
    if (params.customerName) {
      const searchTerm = params.customerName.toLowerCase();
      const beforeCount = orders.length;
      orders = orders.filter(order => 
        (order.customerName || '').toLowerCase().includes(searchTerm)
      );
      console.log(`[ToolExecutor] 🔍 Filtrowanie po nazwie klienta "${params.customerName}": ${beforeCount} → ${orders.length}`);
    }
    
    // 🆕 Filtrowanie po dacie dostawy (client-side)
    if (params.deliveryDateFrom) {
      const fromDate = new Date(params.deliveryDateFrom);
      const beforeCount = orders.length;
      orders = orders.filter(order => {
        if (!order.deliveryDate) return false;
        const deliveryDate = new Date(order.deliveryDate);
        return deliveryDate >= fromDate;
      });
      console.log(`[ToolExecutor] 📅 Filtrowanie CO po deliveryDate od ${params.deliveryDateFrom}: ${beforeCount} → ${orders.length}`);
    }
    
    if (params.deliveryDateTo) {
      const toDate = new Date(params.deliveryDateTo);
      const beforeCount = orders.length;
      orders = orders.filter(order => {
        if (!order.deliveryDate) return false;
        const deliveryDate = new Date(order.deliveryDate);
        return deliveryDate <= toDate;
      });
      console.log(`[ToolExecutor] 📅 Filtrowanie CO po deliveryDate do ${params.deliveryDateTo}: ${beforeCount} → ${orders.length}`);
    }
    
    // Po filtrowaniu client-side zastosuj docelowy limit
    const finalLimit = params.limit || 100;
    if (orders.length > finalLimit) {
      console.log(`[ToolExecutor] ✂️ Ograniczam wyniki CO z ${orders.length} do ${finalLimit}`);
      orders = orders.slice(0, finalLimit);
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
      limitApplied: finalLimit,
      filtersApplied: {
        deliveryDateFrom: params.deliveryDateFrom || null,
        deliveryDateTo: params.deliveryDateTo || null,
        customerName: params.customerName || null
      }
    };
  }
  
  /**
   * Pobiera zamówienia zakupu
   */
  static async queryPurchaseOrders(params) {
    const collectionName = COLLECTION_MAPPING.purchase_orders;
    let q = collection(db, collectionName);
    const constraints = [];
    
    // 🆕 Flaga czy potrzebujemy filtrowania client-side (zwiększamy limit)
    const needsClientSideFiltering = !!(
      params.expectedDeliveryDateFrom || 
      params.expectedDeliveryDateTo || 
      params.hasUndeliveredItems ||
      params.supplierName
    );
    
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
    
    // Filtr po dacie utworzenia zamówienia
    if (params.dateFrom) {
      const fromDate = Timestamp.fromDate(new Date(params.dateFrom));
      constraints.push(where('orderDate', '>=', fromDate));
      console.log(`[ToolExecutor] 📅 Filtrowanie PO od orderDate: ${params.dateFrom}`);
    }
    
    if (params.dateTo) {
      const toDate = Timestamp.fromDate(new Date(params.dateTo));
      constraints.push(where('orderDate', '<=', toDate));
      console.log(`[ToolExecutor] 📅 Filtrowanie PO do orderDate: ${params.dateTo}`);
    }
    
    // Zwiększ limit jeśli potrzebujemy filtrowania client-side
    const limitValue = needsClientSideFiltering ? 500 : (params.limit || 100);
    constraints.push(firestoreLimit(limitValue));
    
    if (constraints.length > 0) {
      q = query(q, ...constraints);
    }
    
    const snapshot = await getDocs(q);
    let purchaseOrders = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        number: data.number,
        status: data.status,
        supplierId: data.supplierId,
        supplierName: data.supplierName || data.supplier?.name,
        orderDate: data.orderDate?.toDate?.()?.toISOString?.() || data.orderDate,
        expectedDeliveryDate: data.expectedDeliveryDate?.toDate?.()?.toISOString?.() || data.expectedDeliveryDate,
        actualDeliveryDate: data.actualDeliveryDate?.toDate?.()?.toISOString?.() || data.actualDeliveryDate,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt,
        totalValue: data.totalValue || data.total,
        currency: data.currency || 'EUR',
        items: data.items,
        notes: data.notes
      };
    });
    
    console.log(`[ToolExecutor] 📦 Pobrano ${purchaseOrders.length} zamówień zakupu z Firestore`);
    
    // Filtruj po nazwie dostawcy (client-side)
    if (params.supplierName) {
      const searchTerm = params.supplierName.toLowerCase();
      const beforeCount = purchaseOrders.length;
      purchaseOrders = purchaseOrders.filter(po => 
        (po.supplierName || '').toLowerCase().includes(searchTerm)
      );
      console.log(`[ToolExecutor] 🔍 Filtrowanie po nazwie dostawcy "${params.supplierName}": ${beforeCount} → ${purchaseOrders.length}`);
    }
    
    // 🆕 Filtrowanie po planowanej dacie dostawy (client-side)
    if (params.expectedDeliveryDateFrom) {
      const fromDate = new Date(params.expectedDeliveryDateFrom);
      const beforeCount = purchaseOrders.length;
      purchaseOrders = purchaseOrders.filter(po => {
        if (!po.expectedDeliveryDate) return false;
        const deliveryDate = new Date(po.expectedDeliveryDate);
        return deliveryDate >= fromDate;
      });
      console.log(`[ToolExecutor] 📅 Filtrowanie PO po expectedDeliveryDate od ${params.expectedDeliveryDateFrom}: ${beforeCount} → ${purchaseOrders.length}`);
    }
    
    if (params.expectedDeliveryDateTo) {
      const toDate = new Date(params.expectedDeliveryDateTo);
      const beforeCount = purchaseOrders.length;
      purchaseOrders = purchaseOrders.filter(po => {
        if (!po.expectedDeliveryDate) return false;
        const deliveryDate = new Date(po.expectedDeliveryDate);
        return deliveryDate <= toDate;
      });
      console.log(`[ToolExecutor] 📅 Filtrowanie PO po expectedDeliveryDate do ${params.expectedDeliveryDateTo}: ${beforeCount} → ${purchaseOrders.length}`);
    }
    
    // 🆕 Filtrowanie PO z niedostarczonymi pozycjami (client-side)
    if (params.hasUndeliveredItems === true) {
      const beforeCount = purchaseOrders.length;
      purchaseOrders = purchaseOrders.filter(po => {
        if (!po.items || !Array.isArray(po.items)) return false;
        // Sprawdź czy którakolwiek pozycja ma received < quantity
        return po.items.some(item => {
          const received = item.received || 0;
          const quantity = item.quantity || 0;
          return received < quantity;
        });
      });
      console.log(`[ToolExecutor] 🔍 Filtrowanie PO z niedostarczonymi pozycjami: ${beforeCount} → ${purchaseOrders.length}`);
    }
    
    // Po filtrowaniu client-side zastosuj docelowy limit
    const finalLimit = params.limit || 100;
    if (purchaseOrders.length > finalLimit) {
      console.log(`[ToolExecutor] ✂️ Ograniczam wyniki PO z ${purchaseOrders.length} do ${finalLimit}`);
      purchaseOrders = purchaseOrders.slice(0, finalLimit);
    }
    
    return {
      purchaseOrders,
      count: purchaseOrders.length,
      limitApplied: finalLimit,
      isEmpty: purchaseOrders.length === 0,
      warning: purchaseOrders.length === 0 ? "⚠️ BRAK DANYCH - Nie znaleziono żadnych zamówień zakupu spełniających kryteria. NIE WYMYŚLAJ danych!" : null,
      filtersApplied: {
        expectedDeliveryDateFrom: params.expectedDeliveryDateFrom || null,
        expectedDeliveryDateTo: params.expectedDeliveryDateTo || null,
        hasUndeliveredItems: params.hasUndeliveredItems || null,
        supplierName: params.supplierName || null
      }
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
    
    // Pola, które wymagają konwersji dat na Firestore Timestamp
    const dateFields = [
      'issueDate', 'dueDate', 'paymentDate', 'createdAt', 'updatedAt',
      'expirationDate', 'orderDate', 'expectedDelivery', 'deliveryDate',
      'startDate', 'endDate', 'completedAt', 'scheduledDate'
    ];
    
    // Mapowanie pól dla różnych kolekcji (zagnieżdżone pola, aliasy)
    const fieldMapping = {
      invoices: {
        'customerId': 'customer.id',
        'customerName': 'customer.name',
        'sellerId': 'seller.id',
        'sellerName': 'seller.name'
      },
      customer_orders: {
        'customerId': 'customerId',
        'customerName': 'customerName'
      }
    };
    
    // Zastosuj filtry z konwersją dat i mapowaniem pól
    if (params.filters && params.filters.length > 0) {
      const constraints = params.filters.map(f => {
        let fieldName = f.field;
        let value = f.value;
        
        // Mapowanie pól dla danej kolekcji
        const collectionFieldMap = fieldMapping[params.collection];
        if (collectionFieldMap && collectionFieldMap[fieldName]) {
          const mappedField = collectionFieldMap[fieldName];
          console.log(`[ToolExecutor] 🔄 Mapowanie pola: ${fieldName} → ${mappedField}`);
          fieldName = mappedField;
        }
        
        // Konwersja dat string na Firestore Timestamp
        if (dateFields.includes(f.field) && typeof value === 'string') {
          try {
            value = Timestamp.fromDate(new Date(value));
            console.log(`[ToolExecutor] 📅 Konwersja daty: ${f.field} = "${f.value}" → Timestamp`);
          } catch (e) {
            console.warn(`[ToolExecutor] ⚠️ Nie udało się skonwertować daty: ${f.value}`);
          }
        }
        
        return where(fieldName, f.operator, value);
      });
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
    
    // 🆕 Flaga czy potrzebujemy filtrowania client-side (zwiększamy limit)
    const needsClientSideFiltering = !!(params.invoiceNumber || params.isProforma !== undefined || params.isCorrectionInvoice !== undefined || params.currency);
    
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
      // UWAGA: Faktury mają zagnieżdżone pole customer.id, nie customerId
      constraints.push(where('customer.id', '==', params.customerId));
      console.log(`[ToolExecutor] 🔍 Filtrowanie faktur po customer.id: ${params.customerId}`);
    }
    
    // 🆕 Filtr po powiązanym zamówieniu (server-side)
    if (params.orderId) {
      constraints.push(where('orderId', '==', params.orderId));
      console.log(`[ToolExecutor] 🔍 Filtrowanie faktur po orderId: ${params.orderId}`);
    }
    
    if (params.dateFrom) {
      // Filtruj po issueDate (data wystawienia), nie createdAt
      const fromDate = Timestamp.fromDate(new Date(params.dateFrom));
      constraints.push(where('issueDate', '>=', fromDate));
      console.log(`[ToolExecutor] 📅 Filtrowanie faktur od: ${params.dateFrom}`);
    }
    
    if (params.dateTo) {
      // Filtruj po issueDate (data wystawienia), nie createdAt
      const toDate = Timestamp.fromDate(new Date(params.dateTo));
      constraints.push(where('issueDate', '<=', toDate));
      console.log(`[ToolExecutor] 📅 Filtrowanie faktur do: ${params.dateTo}`);
    }
    
    // Zwiększ limit jeśli potrzebujemy filtrowania client-side
    const limitValue = needsClientSideFiltering ? 500 : (params.limit || 100);
    constraints.push(firestoreLimit(limitValue));
    
    if (constraints.length > 0) {
      q = query(q, ...constraints);
    }
    
    const snapshot = await getDocs(q);
    let invoices = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        number: data.number,
        status: data.status,
        paymentStatus: data.paymentStatus,
        total: data.total || 0,
        totalPaid: data.totalPaid || 0,
        currency: data.currency || 'EUR',
        customer: data.customer,
        isProforma: data.isProforma || data.type === 'proforma',
        isCorrectionInvoice: data.isCorrectionInvoice || false,
        issueDate: data.issueDate?.toDate?.()?.toISOString?.() || data.issueDate,
        dueDate: data.dueDate?.toDate?.()?.toISOString?.() || data.dueDate,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt,
        orderId: data.orderId,
        orderNumber: data.orderNumber,
        items: data.items?.map(item => ({
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          netValue: item.netValue,
          vat: item.vat
        }))
      };
    });
    
    console.log(`[ToolExecutor] 📊 Pobrano ${invoices.length} faktur z Firestore`);
    
    // 🆕 Filtrowanie po numerze faktury (client-side, częściowe dopasowanie)
    if (params.invoiceNumber) {
      const searchTerm = params.invoiceNumber.toLowerCase();
      const beforeCount = invoices.length;
      invoices = invoices.filter(inv => 
        (inv.number || '').toLowerCase().includes(searchTerm)
      );
      console.log(`[ToolExecutor] 🔍 Filtrowanie po numerze faktury "${params.invoiceNumber}": ${beforeCount} → ${invoices.length}`);
    }
    
    // 🆕 Filtrowanie faktur proforma (client-side)
    if (params.isProforma !== undefined) {
      const beforeCount = invoices.length;
      invoices = invoices.filter(inv => inv.isProforma === params.isProforma);
      console.log(`[ToolExecutor] 🔍 Filtrowanie proform (isProforma=${params.isProforma}): ${beforeCount} → ${invoices.length}`);
    }
    
    // 🆕 Filtrowanie faktur korygujących (client-side)
    if (params.isCorrectionInvoice !== undefined) {
      const beforeCount = invoices.length;
      invoices = invoices.filter(inv => inv.isCorrectionInvoice === params.isCorrectionInvoice);
      console.log(`[ToolExecutor] 🔍 Filtrowanie korekt (isCorrectionInvoice=${params.isCorrectionInvoice}): ${beforeCount} → ${invoices.length}`);
    }
    
    // 🆕 Filtrowanie po walucie (client-side)
    if (params.currency) {
      const currencyUpper = params.currency.toUpperCase();
      const beforeCount = invoices.length;
      invoices = invoices.filter(inv => 
        (inv.currency || '').toUpperCase() === currencyUpper
      );
      console.log(`[ToolExecutor] 🔍 Filtrowanie po walucie "${currencyUpper}": ${beforeCount} → ${invoices.length}`);
    }
    
    // Po filtrowaniu client-side zastosuj docelowy limit
    const finalLimit = params.limit || 100;
    if (invoices.length > finalLimit) {
      console.log(`[ToolExecutor] ✂️ Ograniczam wyniki z ${invoices.length} do ${finalLimit}`);
      invoices = invoices.slice(0, finalLimit);
    }
    
    // Oblicz sumę wartości dla szybkiego podglądu
    const totalSum = invoices.reduce((sum, inv) => sum + (parseFloat(inv.total) || 0), 0);
    
    return {
      invoices,
      isEmpty: invoices.length === 0,
      warning: invoices.length === 0 ? "⚠️ BRAK DANYCH - Nie znaleziono żadnych faktur spełniających kryteria. NIE WYMYŚLAJ danych!" : null,
      count: invoices.length,
      totalSum: parseFloat(totalSum.toFixed(2)),
      limitApplied: finalLimit,
      filtersApplied: {
        invoiceNumber: params.invoiceNumber || null,
        isProforma: params.isProforma,
        isCorrectionInvoice: params.isCorrectionInvoice,
        currency: params.currency || null,
        orderId: params.orderId || null
      }
    };
  }
  
  /**
   * Pobiera dokumenty CMR
   */
  static async queryCmrDocuments(params) {
    const collectionName = COLLECTION_MAPPING.cmr_documents;
    let q = collection(db, collectionName);
    const constraints = [];
    
    // 🆕 Flaga czy potrzebujemy filtrowania client-side (zwiększamy limit)
    const needsClientSideFiltering = !!(
      params.cmrNumber || 
      params.carrier || 
      params.sender || 
      params.recipient || 
      params.loadingPlace || 
      params.deliveryPlace
    );
    
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
    
    // 🆕 Filtr po powiązanym zamówieniu (server-side) - sprawdź oba pola
    if (params.linkedOrderId) {
      // CMR może mieć linkedOrderId (pojedyncze) lub linkedOrderIds (tablica)
      // Użyjemy array-contains dla linkedOrderIds lub == dla linkedOrderId
      constraints.push(where('linkedOrderIds', 'array-contains', params.linkedOrderId));
      console.log(`[ToolExecutor] 🔍 Filtrowanie CMR po linkedOrderIds: ${params.linkedOrderId}`);
    }
    
    // 🆕 POPRAWKA: Filtruj po issueDate zamiast createdAt (data wystawienia CMR)
    if (params.dateFrom) {
      const fromDate = Timestamp.fromDate(new Date(params.dateFrom));
      constraints.push(where('issueDate', '>=', fromDate));
      console.log(`[ToolExecutor] 📅 Filtrowanie CMR od issueDate: ${params.dateFrom}`);
    }
    
    if (params.dateTo) {
      const toDate = Timestamp.fromDate(new Date(params.dateTo));
      constraints.push(where('issueDate', '<=', toDate));
      console.log(`[ToolExecutor] 📅 Filtrowanie CMR do issueDate: ${params.dateTo}`);
    }
    
    // Zwiększ limit jeśli potrzebujemy filtrowania client-side
    const limitValue = needsClientSideFiltering ? 500 : (params.limit || 100);
    constraints.push(firestoreLimit(limitValue));
    
    if (constraints.length > 0) {
      q = query(q, ...constraints);
    }
    
    const snapshot = await getDocs(q);
    let cmrDocuments = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        cmrNumber: data.cmrNumber,
        status: data.status,
        paymentStatus: data.paymentStatus,
        // Nadawca
        sender: data.sender,
        senderAddress: data.senderAddress,
        senderCity: data.senderCity,
        senderCountry: data.senderCountry,
        // Odbiorca
        recipient: data.recipient,
        recipientAddress: data.recipientAddress,
        // Przewoźnik
        carrier: data.carrier,
        carrierAddress: data.carrierAddress,
        // Miejsca
        loadingPlace: data.loadingPlace,
        deliveryPlace: data.deliveryPlace,
        // Daty
        issueDate: data.issueDate?.toDate?.()?.toISOString?.() || data.issueDate,
        deliveryDate: data.deliveryDate?.toDate?.()?.toISOString?.() || data.deliveryDate,
        loadingDate: data.loadingDate?.toDate?.()?.toISOString?.() || data.loadingDate,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt,
        transportDate: data.transportDate?.toDate?.()?.toISOString?.() || data.transportDate,
        // Powiązane zamówienia
        linkedOrderId: data.linkedOrderId,
        linkedOrderIds: data.linkedOrderIds,
        linkedOrderNumbers: data.linkedOrderNumbers,
        // Dodatkowe
        transportType: data.transportType,
        vehicleRegistration: data.vehicleRegistration,
        trailerRegistration: data.trailerRegistration,
        notes: data.notes
      };
    });
    
    console.log(`[ToolExecutor] 🚛 Pobrano ${cmrDocuments.length} dokumentów CMR z Firestore`);
    
    // 🆕 Filtrowanie po numerze CMR (client-side, częściowe dopasowanie)
    if (params.cmrNumber) {
      const searchTerm = params.cmrNumber.toLowerCase();
      const beforeCount = cmrDocuments.length;
      cmrDocuments = cmrDocuments.filter(cmr => 
        (cmr.cmrNumber || '').toLowerCase().includes(searchTerm)
      );
      console.log(`[ToolExecutor] 🔍 Filtrowanie po numerze CMR "${params.cmrNumber}": ${beforeCount} → ${cmrDocuments.length}`);
    }
    
    // 🆕 Filtrowanie po przewoźniku (client-side, częściowe dopasowanie)
    if (params.carrier) {
      const searchTerm = params.carrier.toLowerCase();
      const beforeCount = cmrDocuments.length;
      cmrDocuments = cmrDocuments.filter(cmr => 
        (cmr.carrier || '').toLowerCase().includes(searchTerm)
      );
      console.log(`[ToolExecutor] 🔍 Filtrowanie po przewoźniku "${params.carrier}": ${beforeCount} → ${cmrDocuments.length}`);
    }
    
    // 🆕 Filtrowanie po nadawcy (client-side, częściowe dopasowanie)
    if (params.sender) {
      const searchTerm = params.sender.toLowerCase();
      const beforeCount = cmrDocuments.length;
      cmrDocuments = cmrDocuments.filter(cmr => 
        (cmr.sender || '').toLowerCase().includes(searchTerm)
      );
      console.log(`[ToolExecutor] 🔍 Filtrowanie po nadawcy "${params.sender}": ${beforeCount} → ${cmrDocuments.length}`);
    }
    
    // 🆕 Filtrowanie po odbiorcy (client-side, częściowe dopasowanie)
    if (params.recipient) {
      const searchTerm = params.recipient.toLowerCase();
      const beforeCount = cmrDocuments.length;
      cmrDocuments = cmrDocuments.filter(cmr => 
        (cmr.recipient || '').toLowerCase().includes(searchTerm)
      );
      console.log(`[ToolExecutor] 🔍 Filtrowanie po odbiorcy "${params.recipient}": ${beforeCount} → ${cmrDocuments.length}`);
    }
    
    // 🆕 Filtrowanie po miejscu załadunku (client-side, częściowe dopasowanie)
    if (params.loadingPlace) {
      const searchTerm = params.loadingPlace.toLowerCase();
      const beforeCount = cmrDocuments.length;
      cmrDocuments = cmrDocuments.filter(cmr => 
        (cmr.loadingPlace || '').toLowerCase().includes(searchTerm)
      );
      console.log(`[ToolExecutor] 🔍 Filtrowanie po miejscu załadunku "${params.loadingPlace}": ${beforeCount} → ${cmrDocuments.length}`);
    }
    
    // 🆕 Filtrowanie po miejscu dostawy (client-side, częściowe dopasowanie)
    if (params.deliveryPlace) {
      const searchTerm = params.deliveryPlace.toLowerCase();
      const beforeCount = cmrDocuments.length;
      cmrDocuments = cmrDocuments.filter(cmr => 
        (cmr.deliveryPlace || '').toLowerCase().includes(searchTerm)
      );
      console.log(`[ToolExecutor] 🔍 Filtrowanie po miejscu dostawy "${params.deliveryPlace}": ${beforeCount} → ${cmrDocuments.length}`);
    }
    
    // 🆕 Filtrowanie po dacie dostawy (client-side)
    if (params.deliveryDateFrom) {
      const fromDate = new Date(params.deliveryDateFrom);
      const beforeCount = cmrDocuments.length;
      cmrDocuments = cmrDocuments.filter(cmr => {
        if (!cmr.deliveryDate) return false;
        const deliveryDate = new Date(cmr.deliveryDate);
        return deliveryDate >= fromDate;
      });
      console.log(`[ToolExecutor] 📅 Filtrowanie po deliveryDate od ${params.deliveryDateFrom}: ${beforeCount} → ${cmrDocuments.length}`);
    }
    
    if (params.deliveryDateTo) {
      const toDate = new Date(params.deliveryDateTo);
      const beforeCount = cmrDocuments.length;
      cmrDocuments = cmrDocuments.filter(cmr => {
        if (!cmr.deliveryDate) return false;
        const deliveryDate = new Date(cmr.deliveryDate);
        return deliveryDate <= toDate;
      });
      console.log(`[ToolExecutor] 📅 Filtrowanie po deliveryDate do ${params.deliveryDateTo}: ${beforeCount} → ${cmrDocuments.length}`);
    }
    
    // Po filtrowaniu client-side zastosuj docelowy limit
    const finalLimit = params.limit || 100;
    if (cmrDocuments.length > finalLimit) {
      console.log(`[ToolExecutor] ✂️ Ograniczam wyniki CMR z ${cmrDocuments.length} do ${finalLimit}`);
      cmrDocuments = cmrDocuments.slice(0, finalLimit);
    }
    
    return {
      cmrDocuments,
      count: cmrDocuments.length,
      limitApplied: finalLimit,
      isEmpty: cmrDocuments.length === 0,
      warning: cmrDocuments.length === 0 ? "⚠️ BRAK DANYCH - Nie znaleziono żadnych dokumentów CMR spełniających kryteria. NIE WYMYŚLAJ danych!" : null,
      filtersApplied: {
        cmrNumber: params.cmrNumber || null,
        linkedOrderId: params.linkedOrderId || null,
        carrier: params.carrier || null,
        sender: params.sender || null,
        recipient: params.recipient || null,
        loadingPlace: params.loadingPlace || null,
        deliveryPlace: params.deliveryPlace || null
      }
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
        taskId: data.taskId,
        moNumber: data.moNumber,
        sessionIndex: data.sessionIndex,
        startTime: data.startTime?.toDate?.()?.toISOString?.() || data.startTime,
        endTime: data.endTime?.toDate?.()?.toISOString?.() || data.endTime,
        timeSpent: data.timeSpent,
        quantity: data.quantity,
        userId: data.userId,
        userName: data.userName,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt
      };
    });
    
    // Filtruj po minimalnej ilości (po stronie klienta)
    if (params.minQuantity) {
      sessions = sessions.filter(s => (s.quantity || 0) >= params.minQuantity);
    }
    
    // ✅ NOWE: Rozwiąż nazwy użytkowników jeśli nie ma userName
    const userIds = sessions
      .filter(s => s.userId && !s.userName)
      .map(s => s.userId);
    
    if (userIds.length > 0) {
      const userNamesMap = await this.resolveUserNames(userIds);
      
      sessions = sessions.map(s => ({
        ...s,
        userName: s.userName || (s.userId ? this.getUserName(s.userId, userNamesMap) : null)
      }));
      
      console.log(`[ToolExecutor] ✅ Rozwiązano nazwy dla ${Object.keys(userNamesMap).length} użytkowników`);
    }
    
    // ✅ NOWE: Pobierz moNumber dla zadań jeśli nie istnieje
    const sessionsWithoutMO = sessions.filter(s => s.taskId && !s.moNumber);
    if (sessionsWithoutMO.length > 0) {
      const taskIds = [...new Set(sessionsWithoutMO.map(s => s.taskId))];
      const tasksMap = {};
      
      for (const taskId of taskIds) {
        try {
          const taskDoc = await getDoc(doc(db, COLLECTION_MAPPING.production_tasks, taskId));
          if (taskDoc.exists()) {
            const taskData = taskDoc.data();
            tasksMap[taskId] = {
              moNumber: taskData.moNumber,
              productName: taskData.productName
            };
          }
        } catch (error) {
          console.warn(`[ToolExecutor] ⚠️ Nie można pobrać MO dla taskId ${taskId}:`, error.message);
        }
      }
      
      sessions = sessions.map(s => ({
        ...s,
        moNumber: s.moNumber || tasksMap[s.taskId]?.moNumber,
        productName: s.productName || tasksMap[s.taskId]?.productName
      }));
      
      console.log(`[ToolExecutor] ✅ Wzbogacono ${Object.keys(tasksMap).length} sesji o moNumber`);
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
   * UWAGA: Obsługuje tylko jednostki wagowe (kg, g) i objętościowe (l, ml).
   * Jednostki liczone (szt., caps) są POMIJANE w obliczeniach wagi.
   */
  static calculateTotalWeight(ingredients) {
    if (!Array.isArray(ingredients)) return 0;
    
    // Jednostki które NIE są wagą - pomijamy je
    const NON_WEIGHT_UNITS = ['szt.', 'szt', 'caps', 'kaps', 'tab', 'tabl'];
    
    return ingredients.reduce((total, ingredient) => {
      const quantity = parseFloat(ingredient.quantity) || 0;
      const unit = (ingredient.unit || 'g').toLowerCase().trim();
      
      // Pomijaj jednostki liczone (sztuki, kapsułki, tabletki)
      if (NON_WEIGHT_UNITS.some(u => unit.includes(u))) {
        return total; // Nie dodawaj do wagi
      }
      
      // Konwersja na gramy
      let quantityInGrams = 0;
      
      switch(unit) {
        case 'kg':
          quantityInGrams = quantity * 1000;
          break;
        case 'g':
          quantityInGrams = quantity;
          break;
        case 'mg':
          quantityInGrams = quantity / 1000;
          break;
        case 'µg':
        case 'ug':
        case 'mcg':
          quantityInGrams = quantity / 1000000;
          break;
        case 'l':
        case 'litr':
        case 'litry':
          // Przyjmij gęstość ~1 (woda)
          quantityInGrams = quantity * 1000;
          break;
        case 'ml':
          // Przyjmij gęstość ~1 (woda)
          quantityInGrams = quantity;
          break;
        default:
          // Dla nieznanych jednostek, spróbuj domyślnie traktować jako gramy
          // ale tylko jeśli to wygląda na jednostkę wagową
          console.log(`[calculateTotalWeight] Nieznana jednostka: "${unit}" - pomijam`);
          return total; // Pomijaj nieznane jednostki
      }
      
      return total + quantityInGrams;
    }, 0);
  }
  
  /**
   * 2. Pobiera harmonogram produkcji
   */
  static async getProductionSchedule(params) {
    console.log('[ToolExecutor] 📅 Pobieranie harmonogramu produkcji...', params);
    
    const collectionName = COLLECTION_MAPPING.production_tasks;
    let q = collection(db, collectionName);
    const constraints = [];
    const clientFilters = {};
    
    // PRIORYTET 1: Filtruj po zakresie dat (ZAWSZE po stronie serwera)
    if (params.dateFrom) {
      const startTimestamp = Timestamp.fromDate(new Date(params.dateFrom));
      constraints.push(where('scheduledDate', '>=', startTimestamp));
      console.log(`[ToolExecutor] 🔍 Filtrowanie od daty: ${params.dateFrom}`);
    }
    
    if (params.dateTo) {
      const endTimestamp = Timestamp.fromDate(new Date(params.dateTo));
      constraints.push(where('scheduledDate', '<=', endTimestamp));
      console.log(`[ToolExecutor] 🔍 Filtrowanie do daty: ${params.dateTo}`);
    }
    
    // PRIORYTET 2: Status (tylko jeśli jeden status i jest zakres dat)
    if (params.status && !Array.isArray(params.status) && constraints.length > 0) {
      // WYMAGA Composite Index: scheduledDate + status
      constraints.push(where('status', '==', params.status));
      console.log(`[ToolExecutor] 🔍 Filtrowanie po statusie (serwer): ${params.status}`);
    } else if (params.status) {
      // Wiele statusów - po stronie klienta
      clientFilters.status = Array.isArray(params.status) ? params.status : [params.status];
      console.log(`[ToolExecutor] 🔍 Filtrowanie po statusach (klient):`, clientFilters.status);
    }
    
    // POZOSTAŁE filtry po stronie klienta
    if (params.workstationId) {
      clientFilters.workstationId = params.workstationId;
      console.log(`[ToolExecutor] 🔍 Filtrowanie po stanowisku (klient): ${params.workstationId}`);
    }
    
    if (params.assignedTo) {
      clientFilters.assignedTo = params.assignedTo;
      console.log(`[ToolExecutor] 🔍 Filtrowanie po przypisaniu (klient): ${params.assignedTo}`);
    }
    
    if (params.productId) {
      clientFilters.productId = params.productId;
      console.log(`[ToolExecutor] 🔍 Filtrowanie po produkcie (klient): ${params.productId}`);
    }
    
    // Sortowanie i limit
    constraints.push(orderBy('scheduledDate', 'asc'));
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
        moNumber: data.moNumber,
        productName: data.productName,
        productId: data.productId,
        status: data.status,
        quantity: data.quantity,
        finalQuantity: data.finalQuantity,
        workstationId: data.workstationId,
        assignedTo: data.assignedTo,
        scheduledDate: data.scheduledDate?.toDate?.()?.toISOString?.() || data.scheduledDate,
        endDate: data.endDate?.toDate?.()?.toISOString?.() || data.endDate,
        orderId: data.orderId,
        orderNumber: data.orderNumber
      };
    });
    
    console.log(`[ToolExecutor] ✅ Pobrano ${tasks.length} zadań z serwera`);
    
    // Zastosuj filtry klienckie
    if (Object.keys(clientFilters).length > 0) {
      const beforeCount = tasks.length;
      tasks = tasks.filter(task => {
        return Object.entries(clientFilters).every(([key, value]) => {
          if (key === 'status' && Array.isArray(value)) {
            return value.includes(task[key]);
          }
          return task[key] === value;
        });
      });
      console.log(`[ToolExecutor] 🔍 Filtrowanie klienckie: ${beforeCount} → ${tasks.length} zadań`);
    }
    
    // ✅ NOWE: Rozwiąż nazwy użytkowników
    const userIds = tasks.map(t => t.assignedTo).filter(Boolean);
    if (userIds.length > 0) {
      const userNamesMap = await this.resolveUserNames(userIds);
      
      // Zastąp assignedTo ID nazwą użytkownika
      tasks = tasks.map(task => ({
        ...task,
        assignedTo: task.assignedTo ? this.getUserName(task.assignedTo, userNamesMap) : null
      }));
      
      console.log(`[ToolExecutor] ✅ Rozwiązano nazwy dla ${Object.keys(userNamesMap).length} użytkowników`);
    }
    
    return {
      tasks,
      count: tasks.length,
      limitApplied: limitValue,
      isEmpty: tasks.length === 0,
      warning: tasks.length === 0 ? "⚠️ BRAK DANYCH - Nie znaleziono zadań w harmonogramie dla podanych kryteriów." : null
    };
  }
  
  /**
   * 3. Analizuje prognozę zapotrzebowania na materiały
   */
  static async analyzeMaterialForecast(params) {
    console.log('[ToolExecutor] 📊 Analiza prognozy zapotrzebowania...', params);
    
    const forecastDays = params.forecastPeriodDays || 30;
    const now = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + forecastDays);
    
    console.log(`[ToolExecutor] 📅 Okres prognozy: ${now.toISOString().split('T')[0]} - ${endDate.toISOString().split('T')[0]}`);
    
    // 1. Pobierz zadania produkcyjne w okresie prognozy
    const tasksQuery = query(
      collection(db, COLLECTION_MAPPING.production_tasks),
      where('scheduledDate', '<=', Timestamp.fromDate(endDate)),
      where('status', 'in', ['Zaplanowane', 'W trakcie']),
      firestoreLimit(500)
    );
    
    const tasksSnapshot = await getDocs(tasksQuery);
    const tasks = tasksSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`[ToolExecutor] ✅ Pobrano ${tasks.length} zadań produkcyjnych`);
    
    // 2. Agreguj zapotrzebowanie na materiały
    const materialDemand = {};
    
    tasks.forEach(task => {
      if (task.materials && Array.isArray(task.materials)) {
        task.materials.forEach(material => {
          const materialId = material.materialId || material.id;
          if (!materialId) return;
          
          if (!materialDemand[materialId]) {
            materialDemand[materialId] = {
              materialId,
              materialName: material.materialName || material.name,
              totalDemand: 0,
              tasks: [],
              unit: material.unit
            };
          }
          
          const quantity = parseFloat(material.quantity) || 0;
          materialDemand[materialId].totalDemand += quantity;
          materialDemand[materialId].tasks.push({
            taskId: task.id,
            moNumber: task.moNumber,
            productName: task.productName,
            quantity: quantity,
            scheduledDate: task.scheduledDate?.toDate?.()?.toISOString?.() || task.scheduledDate
          });
        });
      }
    });
    
    // 3. Pobierz oczekujące zamówienia zakupu
    const poQuery = query(
      collection(db, COLLECTION_MAPPING.purchase_orders),
      where('status', 'in', ['oczekujące', 'potwierdzone', 'częściowo dostarczone']),
      firestoreLimit(200)
    );
    
    const poSnapshot = await getDocs(poQuery);
    const pendingOrders = {};
    
    poSnapshot.docs.forEach(doc => {
      const po = doc.data();
      if (po.items && Array.isArray(po.items)) {
        po.items.forEach(item => {
          const materialId = item.itemId || item.inventoryId;
          if (!materialId) return;
          
          if (!pendingOrders[materialId]) {
            pendingOrders[materialId] = {
              totalOrdered: 0,
              orders: []
            };
          }
          
          const quantity = parseFloat(item.quantity) || 0;
          pendingOrders[materialId].totalOrdered += quantity;
          pendingOrders[materialId].orders.push({
            poId: doc.id,
            poNumber: po.number,
            quantity: quantity,
            expectedDeliveryDate: po.expectedDeliveryDate?.toDate?.()?.toISOString?.() || po.expectedDeliveryDate
          });
        });
      }
    });
    
    console.log(`[ToolExecutor] ✅ Pobrano ${poSnapshot.docs.length} oczekujących zamówień zakupu`);
    
    // 4. Pobierz aktualny stan magazynowy
    const inventoryQuery = query(
      collection(db, COLLECTION_MAPPING.inventory),
      firestoreLimit(500)
    );
    
    const inventorySnapshot = await getDocs(inventoryQuery);
    const currentStock = {};
    
    inventorySnapshot.docs.forEach(doc => {
      const item = doc.data();
      currentStock[doc.id] = {
        quantity: parseFloat(item.quantity) || 0,
        minQuantity: parseFloat(item.minQuantity) || 0,
        unit: item.unit
      };
    });
    
    console.log(`[ToolExecutor] ✅ Pobrano stan ${inventorySnapshot.docs.length} materiałów`);
    
    // 5. Oblicz prognozę dla każdego materiału
    const forecast = Object.keys(materialDemand).map(materialId => {
      const demand = materialDemand[materialId];
      const stock = currentStock[materialId] || { quantity: 0, minQuantity: 0, unit: demand.unit };
      const ordered = pendingOrders[materialId] || { totalOrdered: 0, orders: [] };
      
      const projectedStock = stock.quantity + ordered.totalOrdered - demand.totalDemand;
      const shortfall = projectedStock < stock.minQuantity ? stock.minQuantity - projectedStock : 0;
      
      return {
        materialId,
        materialName: demand.materialName,
        currentStock: stock.quantity,
        minStock: stock.minQuantity,
        plannedDemand: demand.totalDemand,
        orderedQuantity: ordered.totalOrdered,
        projectedStock: parseFloat(projectedStock.toFixed(2)),
        shortfall: parseFloat(shortfall.toFixed(2)),
        status: projectedStock < stock.minQuantity ? 'shortage' : projectedStock < 0 ? 'critical' : 'ok',
        unit: demand.unit || stock.unit,
        demandDetails: params.includeDetails ? demand.tasks : undefined,
        orderDetails: params.includeDetails ? ordered.orders : undefined
      };
    });
    
    // Sortuj po statusie (krytyczne najpierw)
    forecast.sort((a, b) => {
      const statusOrder = { 'critical': 0, 'shortage': 1, 'ok': 2 };
      return statusOrder[a.status] - statusOrder[b.status];
    });
    
    return {
      forecast,
      count: forecast.length,
      summary: {
        critical: forecast.filter(f => f.status === 'critical').length,
        shortage: forecast.filter(f => f.status === 'shortage').length,
        ok: forecast.filter(f => f.status === 'ok').length,
        totalTasksAnalyzed: tasks.length,
        forecastPeriodDays: forecastDays
      },
      isEmpty: forecast.length === 0,
      warning: forecast.length === 0 ? "⚠️ BRAK DANYCH - Nie znaleziono zadań produkcyjnych do analizy." : null
    };
  }
  
  /**
   * 5. Analizuje wydajność dostawców
   */
  static async analyzeSupplierPerformance(params) {
    console.log('[ToolExecutor] 📈 Analiza wydajności dostawców...', params);
    
    let poQuery;
    
    if (params.supplierId) {
      // Analiza jednego dostawcy
      poQuery = query(
        collection(db, COLLECTION_MAPPING.purchase_orders),
        where('supplierId', '==', params.supplierId),
        orderBy('orderDate', 'desc'),
        firestoreLimit(params.limit || 100)
      );
      console.log(`[ToolExecutor] 🔍 Analiza dostawcy: ${params.supplierId}`);
    } else {
      // Analiza wszystkich dostawców w okresie
      const dateFrom = params.dateFrom 
        ? new Date(params.dateFrom) 
        : new Date(Date.now() - 90*24*60*60*1000); // 90 dni wstecz
      
      poQuery = query(
        collection(db, COLLECTION_MAPPING.purchase_orders),
        where('orderDate', '>=', Timestamp.fromDate(dateFrom)),
        orderBy('orderDate', 'desc'),
        firestoreLimit(500)
      );
      console.log(`[ToolExecutor] 🔍 Analiza wszystkich dostawców od: ${dateFrom.toISOString().split('T')[0]}`);
    }
    
    const poSnapshot = await getDocs(poQuery);
    const pos = poSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`[ToolExecutor] ✅ Pobrano ${pos.length} zamówień zakupu`);
    
    // Dla każdego PO, pobierz partie (receivedDate) aby obliczyć faktyczne opóźnienia
    const supplierMetrics = {};
    
    for (const po of pos) {
      const supplierId = po.supplierId;
      const supplierName = po.supplier?.name || po.supplierName || 'Nieznany dostawca';
      
      if (!supplierMetrics[supplierId]) {
        supplierMetrics[supplierId] = {
          supplierId,
          supplierName,
          totalOrders: 0,
          totalValue: 0,
          deliveredOnTime: 0,
          deliveredLate: 0,
          totalDelay: 0, // w dniach
          orders: []
        };
      }
      
      const metrics = supplierMetrics[supplierId];
      metrics.totalOrders++;
      metrics.totalValue += parseFloat(po.totalGross || po.totalValue || 0);
      
      // Pobierz partie dla tego PO aby określić faktyczną datę dostawy
      const batchesQuery = query(
        collection(db, COLLECTION_MAPPING.inventory_batches),
        where('purchaseOrderDetails.id', '==', po.id),
        firestoreLimit(50)
      );
      
      const batchesSnapshot = await getDocs(batchesQuery);
      
      if (batchesSnapshot.docs.length > 0) {
        // Użyj pierwszej partii do określenia daty dostawy
        const firstBatch = batchesSnapshot.docs[0].data();
        const receivedDate = firstBatch.receivedDate?.toDate?.() || new Date(firstBatch.receivedDate);
        const expectedDate = po.expectedDeliveryDate?.toDate?.() || new Date(po.expectedDeliveryDate);
        
        if (receivedDate && expectedDate) {
          const delayDays = Math.floor((receivedDate - expectedDate) / (1000 * 60 * 60 * 24));
          
          if (delayDays <= 0) {
            metrics.deliveredOnTime++;
          } else {
            metrics.deliveredLate++;
            metrics.totalDelay += delayDays;
          }
          
          if (params.includeDetails) {
            metrics.orders.push({
              poId: po.id,
              poNumber: po.number,
              orderDate: po.orderDate?.toDate?.()?.toISOString?.() || po.orderDate,
              expectedDate: expectedDate.toISOString(),
              receivedDate: receivedDate.toISOString(),
              delayDays: delayDays,
              value: po.totalGross || po.totalValue,
              status: po.status
            });
          }
        }
      }
    }
    
    // Oblicz metryki finalne
    const performance = Object.values(supplierMetrics).map(metrics => {
      const totalDelivered = metrics.deliveredOnTime + metrics.deliveredLate;
      const onTimeRate = totalDelivered > 0 
        ? (metrics.deliveredOnTime / totalDelivered) * 100 
        : 0;
      const avgDelay = metrics.deliveredLate > 0 
        ? metrics.totalDelay / metrics.deliveredLate 
        : 0;
      
      return {
        ...metrics,
        onTimeDeliveryRate: parseFloat(onTimeRate.toFixed(2)),
        averageDelayDays: parseFloat(avgDelay.toFixed(2)),
        totalDelivered,
        rating: onTimeRate >= 90 ? 'excellent' : onTimeRate >= 70 ? 'good' : onTimeRate >= 50 ? 'fair' : 'poor'
      };
    });
    
    // Sortuj po onTimeDeliveryRate (najlepsi najpierw)
    performance.sort((a, b) => b.onTimeDeliveryRate - a.onTimeDeliveryRate);
    
    return {
      suppliers: performance,
      count: performance.length,
      summary: {
        totalSuppliers: performance.length,
        totalOrders: pos.length,
        excellent: performance.filter(s => s.rating === 'excellent').length,
        good: performance.filter(s => s.rating === 'good').length,
        fair: performance.filter(s => s.rating === 'fair').length,
        poor: performance.filter(s => s.rating === 'poor').length
      },
      isEmpty: performance.length === 0,
      warning: performance.length === 0 ? "⚠️ BRAK DANYCH - Nie znaleziono zamówień zakupu do analizy." : null
    };
  }
  
  /**
   * 6. Analiza klientów i ich zamówień
   */
  static async getCustomerAnalytics(params) {
    console.log('[ToolExecutor] 📊 Analiza klientów...', params);
    
    let ordersQuery;
    const clientFilters = {};
    
    if (params.customerId) {
      // Analiza konkretnego klienta
      ordersQuery = query(
        collection(db, COLLECTION_MAPPING.customer_orders),
        where('customer.id', '==', params.customerId),
        orderBy('orderDate', 'desc'),
        firestoreLimit(params.limit || 100)
      );
      console.log(`[ToolExecutor] 🔍 Analiza klienta: ${params.customerId}`);
    } else {
      // Analiza wszystkich klientów w okresie
      const dateFrom = params.dateFrom 
        ? new Date(params.dateFrom) 
        : new Date(Date.now() - 90*24*60*60*1000); // 90 dni wstecz
      
      ordersQuery = query(
        collection(db, COLLECTION_MAPPING.customer_orders),
        where('orderDate', '>=', Timestamp.fromDate(dateFrom)),
        orderBy('orderDate', 'desc'),
        firestoreLimit(500)
      );
      console.log(`[ToolExecutor] 🔍 Analiza wszystkich klientów od: ${dateFrom.toISOString().split('T')[0]}`);
      
      // Filtruj po statusie po stronie klienta jeśli potrzeba
      if (params.status) {
        clientFilters.status = params.status;
      }
    }
    
    const ordersSnapshot = await getDocs(ordersQuery);
    let orders = ordersSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    console.log(`[ToolExecutor] ✅ Pobrano ${orders.length} zamówień`);
    
    // Zastosuj filtry klienckie
    if (Object.keys(clientFilters).length > 0) {
      orders = orders.filter(order => {
        return Object.entries(clientFilters).every(([key, value]) => {
          return order[key] === value;
        });
      });
    }
    
    // Agreguj dane po klientach
    const customerMetrics = {};
    
    orders.forEach(order => {
      const customerId = order.customer?.id || order.customerId;
      const customerName = order.customer?.name || order.customerName || 'Nieznany klient';
      
      if (!customerMetrics[customerId]) {
        customerMetrics[customerId] = {
          customerId,
          customerName,
          totalOrders: 0,
          totalRevenue: 0,
          completedOrders: 0,
          cancelledOrders: 0,
          orders: []
        };
      }
      
      const metrics = customerMetrics[customerId];
      metrics.totalOrders++;
      metrics.totalRevenue += parseFloat(order.totalValue || 0);
      
      if (order.status === 'Zakończone' || order.status === 'zakończone') {
        metrics.completedOrders++;
      } else if (order.status === 'Anulowane' || order.status === 'anulowane') {
        metrics.cancelledOrders++;
      }
      
      if (params.includeDetails) {
        metrics.orders.push({
          orderId: order.id,
          orderNumber: order.orderNumber,
          orderDate: order.orderDate?.toDate?.()?.toISOString?.() || order.orderDate,
          totalValue: order.totalValue,
          status: order.status,
          itemsCount: order.items?.length || 0
        });
      }
    });
    
    // Oblicz metryki finalne
    const analytics = Object.values(customerMetrics).map(metrics => {
      const avgOrderValue = metrics.totalOrders > 0 
        ? metrics.totalRevenue / metrics.totalOrders 
        : 0;
      const completionRate = metrics.totalOrders > 0
        ? (metrics.completedOrders / metrics.totalOrders) * 100
        : 0;
      
      return {
        ...metrics,
        averageOrderValue: parseFloat(avgOrderValue.toFixed(2)),
        completionRate: parseFloat(completionRate.toFixed(2)),
        category: metrics.totalRevenue > 50000 ? 'VIP' : metrics.totalRevenue > 10000 ? 'Premium' : 'Standard'
      };
    });
    
    // Sortuj po totalRevenue (najwięksi klienci najpierw)
    analytics.sort((a, b) => b.totalRevenue - a.totalRevenue);
    
    return {
      customers: analytics,
      count: analytics.length,
      summary: {
        totalCustomers: analytics.length,
        totalOrders: orders.length,
        totalRevenue: analytics.reduce((sum, c) => sum + c.totalRevenue, 0),
        vipCustomers: analytics.filter(c => c.category === 'VIP').length,
        premiumCustomers: analytics.filter(c => c.category === 'Premium').length,
        standardCustomers: analytics.filter(c => c.category === 'Standard').length
      },
      isEmpty: analytics.length === 0,
      warning: analytics.length === 0 ? "⚠️ BRAK DANYCH - Nie znaleziono zamówień klientów do analizy." : null
    };
  }
  
  /**
   * 7. Pobiera odpowiedzi formularzy
   */
  static async queryFormResponses(params) {
    console.log('[ToolExecutor] 📝 Pobieranie odpowiedzi formularzy...', params);
    
    const responses = [];
    
    // 1. FORMULARZE HALI (jeśli formType === 'hall' lub brak typu)
    if (!params.formType || params.formType === 'hall') {
      const formCollections = [
        { path: 'Forms/TygodniowyRaportSerwisu/Odpowiedzi', name: 'TygodniowyRaportSerwisu' },
        { path: 'Forms/RejestrUsterek/Odpowiedzi', name: 'RejestrUsterek' },
        { path: 'Forms/MiesiecznyRaportSerwisu/Odpowiedzi', name: 'MiesiecznyRaportSerwisu' },
        { path: 'Forms/RaportSerwisNapraw/Odpowiedzi', name: 'RaportSerwisNapraw' }
      ];
      
      for (const formColl of formCollections) {
        const constraints = [];
        
        if (params.dateFrom) {
          constraints.push(where('fillDate', '>=', Timestamp.fromDate(new Date(params.dateFrom))));
        }
        
        if (params.dateTo) {
          constraints.push(where('fillDate', '<=', Timestamp.fromDate(new Date(params.dateTo))));
        }
        
        if (params.author) {
          constraints.push(where('email', '==', params.author));
        }
        
        constraints.push(orderBy('createdAt', 'desc'));
        constraints.push(firestoreLimit(params.limit || 50));
        
        try {
          const q = query(collection(db, formColl.path), ...constraints);
          const snapshot = await getDocs(q);
          
          snapshot.docs.forEach(doc => {
            const data = doc.data();
            responses.push({
              id: doc.id,
              formType: formColl.name,
              category: 'hall',
              ...data,
              fillDate: data.fillDate?.toDate?.()?.toISOString?.() || data.fillDate,
              createdAt: data.createdAt?.toDate?.()?.toISOString?.() || data.createdAt
            });
          });
          
          console.log(`[ToolExecutor] ✅ Pobrano ${snapshot.docs.length} odpowiedzi z ${formColl.name}`);
        } catch (error) {
          console.warn(`[ToolExecutor] ⚠️ Błąd przy pobieraniu ${formColl.name}:`, error.message);
        }
      }
    }
    
    // 2. FORMULARZE PRODUKCYJNE (jeśli formType === 'production')
    if (!params.formType || params.formType === 'production') {
      const taskParams = {
        ...params,
        includeDetails: true // ✅ KLUCZOWE - pobierze formResponses[]
      };
      
      const tasksResult = await this.queryProductionTasks(taskParams);
      
      tasksResult.tasks.forEach(task => {
        if (task.formResponses && task.formResponses.length > 0) {
          task.formResponses.forEach(form => {
            responses.push({
              id: `${task.id}_${form.formId || form.formType}`,
              formType: form.formType || 'ProductionForm',
              category: 'production',
              taskId: task.id,
              moNumber: task.moNumber,
              productName: task.productName,
              ...form,
              submittedAt: form.submittedAt?.toDate?.()?.toISOString?.() || form.submittedAt
            });
          });
        }
      });
      
      console.log(`[ToolExecutor] ✅ Pobrano formularze produkcyjne z ${tasksResult.tasks.length} zadań`);
    }
    
    // Sortuj po dacie (najnowsze najpierw)
    responses.sort((a, b) => {
      const dateA = new Date(a.submittedAt || a.fillDate || a.createdAt || 0);
      const dateB = new Date(b.submittedAt || b.fillDate || b.createdAt || 0);
      return dateB - dateA;
    });
    
    // Zastosuj limit globalny
    const limitValue = params.limit || 50;
    const limitedResponses = responses.slice(0, limitValue);
    
    return {
      responses: limitedResponses,
      count: limitedResponses.length,
      totalResponses: responses.length,
      limitApplied: limitValue,
      summary: {
        hall: responses.filter(r => r.category === 'hall').length,
        production: responses.filter(r => r.category === 'production').length
      },
      isEmpty: responses.length === 0,
      warning: responses.length === 0 ? "⚠️ BRAK DANYCH - Nie znaleziono odpowiedzi formularzy dla podanych kryteriów." : null
    };
  }
  
  /**
   * 14. Pobiera log audytowy zmian w systemie
   */
  static async getAuditLog(params) {
    console.log('[ToolExecutor] 📜 Pobieranie logu audytowego...', params);
    
    const logs = [];
    const dateFrom = params.dateFrom 
      ? new Date(params.dateFrom) 
      : new Date(Date.now() - 7*24*60*60*1000); // 7 dni wstecz domyślnie
    
    console.log(`[ToolExecutor] 🔍 Pobieranie zmian od: ${dateFrom.toISOString().split('T')[0]}`);
    
    // 1. Zmiany w zamówieniach zakupu (statusHistory)
    if (!params.collection || params.collection === 'purchaseOrders') {
      try {
        const poQuery = query(
          collection(db, COLLECTION_MAPPING.purchase_orders),
          where('updatedAt', '>=', Timestamp.fromDate(dateFrom)),
          orderBy('updatedAt', 'desc'),
          firestoreLimit(100)
        );
        
        const posSnapshot = await getDocs(poQuery);
        console.log(`[ToolExecutor] ✅ Pobrano ${posSnapshot.docs.length} zamówień zakupu`);
        
        posSnapshot.docs.forEach(doc => {
          const data = doc.data();
          if (data.statusHistory && Array.isArray(data.statusHistory)) {
            data.statusHistory.forEach(change => {
              logs.push({
                collection: 'purchaseOrders',
                documentId: doc.id,
                documentNumber: data.number,
                action: 'statusChange',
                field: 'status',
                oldValue: change.oldStatus,
                newValue: change.newStatus,
                changedBy: change.changedBy,
                changedAt: change.changedAt,
                timestamp: new Date(change.changedAt).getTime()
              });
            });
          }
        });
      } catch (error) {
        console.warn('[ToolExecutor] ⚠️ Błąd przy pobieraniu zmian PO:', error.message);
      }
    }
    
    // 2. Zmiany kosztów w zadaniach produkcyjnych (costHistory)
    if (!params.collection || params.collection === 'productionTasks') {
      try {
        const tasksQuery = query(
          collection(db, COLLECTION_MAPPING.production_tasks),
          where('updatedAt', '>=', Timestamp.fromDate(dateFrom)),
          orderBy('updatedAt', 'desc'),
          firestoreLimit(100)
        );
        
        const tasksSnapshot = await getDocs(tasksQuery);
        console.log(`[ToolExecutor] ✅ Pobrano ${tasksSnapshot.docs.length} zadań produkcyjnych`);
        
        tasksSnapshot.docs.forEach(doc => {
          const data = doc.data();
          if (data.costHistory && Array.isArray(data.costHistory)) {
            data.costHistory.forEach(change => {
              if (new Date(change.timestamp) >= dateFrom) {
                logs.push({
                  collection: 'productionTasks',
                  documentId: doc.id,
                  documentNumber: data.moNumber,
                  action: 'costUpdate',
                  field: 'totalMaterialCost',
                  oldValue: change.previousTotalCost,
                  newValue: change.newTotalCost,
                  changedBy: change.userId,
                  changedByName: change.userName,
                  changedAt: change.timestamp,
                  reason: change.reason,
                  timestamp: new Date(change.timestamp).getTime()
                });
              }
            });
          }
        });
      } catch (error) {
        console.warn('[ToolExecutor] ⚠️ Błąd przy pobieraniu zmian zadań:', error.message);
      }
    }
    
    // 3. Zmiany w zamówieniach klientów (jeśli mają historię)
    if (!params.collection || params.collection === 'customerOrders') {
      try {
        const ordersQuery = query(
          collection(db, COLLECTION_MAPPING.customer_orders),
          where('updatedAt', '>=', Timestamp.fromDate(dateFrom)),
          orderBy('updatedAt', 'desc'),
          firestoreLimit(100)
        );
        
        const ordersSnapshot = await getDocs(ordersQuery);
        console.log(`[ToolExecutor] ✅ Pobrano ${ordersSnapshot.docs.length} zamówień klientów`);
        
        ordersSnapshot.docs.forEach(doc => {
          const data = doc.data();
          
          // Dodaj informację o aktualizacji dokumentu
          if (data.updatedAt && data.updatedBy) {
            logs.push({
              collection: 'customerOrders',
              documentId: doc.id,
              documentNumber: data.orderNumber,
              action: 'documentUpdate',
              field: 'multiple',
              changedBy: data.updatedBy,
              changedAt: data.updatedAt?.toDate?.()?.toISOString?.() || data.updatedAt,
              timestamp: data.updatedAt?.toDate?.()?.getTime?.() || new Date(data.updatedAt).getTime()
            });
          }
        });
      } catch (error) {
        console.warn('[ToolExecutor] ⚠️ Błąd przy pobieraniu zmian zamówień:', error.message);
      }
    }
    
    // ✅ NOWE: Zbierz wszystkie userId do rozwiązania
    const userIds = [];
    logs.forEach(log => {
      if (log.changedBy) userIds.push(log.changedBy);
    });
    
    // Rozwiąż nazwy użytkowników
    let userNamesMap = {};
    if (userIds.length > 0) {
      userNamesMap = await this.resolveUserNames(userIds);
      console.log(`[ToolExecutor] ✅ Rozwiązano nazwy dla ${Object.keys(userNamesMap).length} użytkowników`);
    }
    
    // Zastąp changedBy ID nazwą użytkownika
    const logsWithNames = logs.map(log => ({
      ...log,
      changedBy: log.changedBy ? this.getUserName(log.changedBy, userNamesMap) : null,
      // Zachowaj changedByName jeśli już istnieje (dla costHistory)
      changedByName: log.changedByName || (log.changedBy ? this.getUserName(log.changedBy, userNamesMap) : null)
    }));
    
    // Filtruj po użytkowniku jeśli określono
    let filteredLogs = logsWithNames;
    if (params.userId) {
      // Filtruj zarówno po ID jak i nazwie użytkownika (dla elastyczności)
      filteredLogs = logsWithNames.filter(log => {
        // Sprawdź czy userId pasuje do changedBy (już jako nazwa) lub znajdź w mapie
        const userIdMatches = log.changedBy === params.userId || 
                              log.changedByName === params.userId ||
                              (userNamesMap[params.userId] && userNamesMap[params.userId] === log.changedBy);
        return userIdMatches;
      });
      console.log(`[ToolExecutor] 🔍 Filtrowanie po użytkowniku: ${logsWithNames.length} → ${filteredLogs.length}`);
    }
    
    // Sortuj po timestamp (najnowsze najpierw)
    filteredLogs.sort((a, b) => b.timestamp - a.timestamp);
    
    // Zastosuj limit
    const limitValue = params.limit || 100;
    const limitedLogs = filteredLogs.slice(0, limitValue);
    
    return {
      logs: limitedLogs,
      count: limitedLogs.length,
      totalLogs: filteredLogs.length,
      limitApplied: limitValue,
      summary: {
        purchaseOrders: filteredLogs.filter(l => l.collection === 'purchaseOrders').length,
        productionTasks: filteredLogs.filter(l => l.collection === 'productionTasks').length,
        customerOrders: filteredLogs.filter(l => l.collection === 'customerOrders').length,
        byAction: {
          statusChange: filteredLogs.filter(l => l.action === 'statusChange').length,
          costUpdate: filteredLogs.filter(l => l.action === 'costUpdate').length,
          documentUpdate: filteredLogs.filter(l => l.action === 'documentUpdate').length
        }
      },
      isEmpty: filteredLogs.length === 0,
      warning: filteredLogs.length === 0 ? "⚠️ BRAK DANYCH - Nie znaleziono zmian w systemie dla podanych kryteriów." : null
    };
  }
  
  /**
   * 15. Oblicza śledzenie pochodzenia partii (traceability)
   */
  static async calculateBatchTraceability(params) {
    console.log('[ToolExecutor] 🔍 Traceability partii...', params);
    
    const traceability = {
      queryBatch: params.batchNumber || params.lotNumber || params.moNumber,
      chain: []
    };
    
    // 1. ZNAJDŹ POCZĄTKOWĄ PARTIĘ
    let batchQuery;
    let initialBatch = null;
    
    if (params.batchNumber) {
      batchQuery = query(
        collection(db, COLLECTION_MAPPING.inventory_batches),
        where('batchNumber', '==', params.batchNumber),
        firestoreLimit(10)
      );
      console.log(`[ToolExecutor] 🔍 Szukanie partii: ${params.batchNumber}`);
    } else if (params.lotNumber) {
      batchQuery = query(
        collection(db, COLLECTION_MAPPING.inventory_batches),
        where('lotNumber', '==', params.lotNumber),
        firestoreLimit(10)
      );
      console.log(`[ToolExecutor] 🔍 Szukanie LOT: ${params.lotNumber}`);
    } else if (params.moNumber) {
      batchQuery = query(
        collection(db, COLLECTION_MAPPING.inventory_batches),
        where('moNumber', '==', params.moNumber),
        firestoreLimit(10)
      );
      console.log(`[ToolExecutor] 🔍 Szukanie partii dla MO: ${params.moNumber}`);
    } else {
      return {
        ...traceability,
        error: 'Wymagany jest batchNumber, lotNumber lub moNumber',
        isEmpty: true
      };
    }
    
    const batchSnapshot = await getDocs(batchQuery);
    if (batchSnapshot.empty) {
      return {
        ...traceability,
        error: 'Nie znaleziono partii dla podanych kryteriów',
        isEmpty: true,
        warning: "⚠️ BRAK DANYCH - Nie znaleziono partii w systemie."
      };
    }
    
    initialBatch = { id: batchSnapshot.docs[0].id, ...batchSnapshot.docs[0].data() };
    console.log(`[ToolExecutor] ✅ Znaleziono partię: ${initialBatch.batchNumber || initialBatch.lotNumber}`);
    
    // Dodaj informację o partii do łańcucha
    traceability.chain.push({
      step: 'batch',
      type: 'Inventory Batch',
      batchId: initialBatch.id,
      batchNumber: initialBatch.batchNumber || initialBatch.lotNumber,
      itemName: initialBatch.itemName,
      quantity: initialBatch.quantity,
      source: initialBatch.source,
      expiryDate: initialBatch.expiryDate?.toDate?.()?.toISOString?.() || initialBatch.expiryDate
    });
    
    // 2. TRACEABILITY WSTECZ (BACKWARD) - Skąd pochodzą surowce?
    if (!params.direction || params.direction === 'backward' || params.direction === 'both') {
      if (initialBatch.source === 'Produkcja' && initialBatch.sourceId) {
        // Pobierz zadanie produkcyjne
        const taskDoc = await getDoc(doc(db, COLLECTION_MAPPING.production_tasks, initialBatch.sourceId));
        if (taskDoc.exists()) {
          const task = { id: taskDoc.id, ...taskDoc.data() };
          
          traceability.chain.push({
            step: 'production',
            type: 'Manufacturing Order',
            taskId: task.id,
            moNumber: task.moNumber,
            productName: task.productName,
            quantity: task.quantity,
            finalQuantity: task.finalQuantity,
            scheduledDate: task.scheduledDate?.toDate?.()?.toISOString?.() || task.scheduledDate,
            status: task.status
          });
          
          console.log(`[ToolExecutor] ✅ Znaleziono MO: ${task.moNumber}`);
          
          // Pobierz użyte materiały (consumedMaterials)
          if (task.consumedMaterials && task.consumedMaterials.length > 0) {
            for (const consumed of task.consumedMaterials.slice(0, params.includeDetails ? 50 : 10)) {
              if (consumed.batchId) {
                try {
                  const materialBatch = await getDoc(doc(db, COLLECTION_MAPPING.inventory_batches, consumed.batchId));
                  if (materialBatch.exists()) {
                    const mBatch = materialBatch.data();
                    
                    traceability.chain.push({
                      step: 'material',
                      type: 'Material Batch',
                      batchId: materialBatch.id,
                      batchNumber: mBatch.batchNumber || mBatch.lotNumber,
                      materialName: consumed.materialName || mBatch.itemName,
                      quantity: consumed.quantity,
                      unitPrice: consumed.unitPrice,
                      source: mBatch.source
                    });
                    
                    // Jeśli materiał pochodzi z PO, pobierz PO
                    if (mBatch.purchaseOrderDetails?.id) {
                      const poDoc = await getDoc(doc(db, COLLECTION_MAPPING.purchase_orders, mBatch.purchaseOrderDetails.id));
                      if (poDoc.exists()) {
                        const po = poDoc.data();
                        traceability.chain.push({
                          step: 'purchase',
                          type: 'Purchase Order',
                          poId: poDoc.id,
                          poNumber: po.number,
                          supplierName: po.supplier?.name || po.supplierName,
                          orderDate: po.orderDate?.toDate?.()?.toISOString?.() || po.orderDate,
                          deliveryDate: mBatch.receivedDate?.toDate?.()?.toISOString?.() || mBatch.receivedDate
                        });
                      }
                    }
                  }
                } catch (error) {
                  console.warn(`[ToolExecutor] ⚠️ Błąd przy pobieraniu partii materiału ${consumed.batchId}:`, error.message);
                }
              }
            }
            console.log(`[ToolExecutor] ✅ Znaleziono ${task.consumedMaterials.length} zużytych materiałów`);
          }
        }
      } else if ((initialBatch.source === 'Zakup' || initialBatch.source === 'purchase') && initialBatch.purchaseOrderDetails?.id) {
        // Bezpośrednio z PO
        const poDoc = await getDoc(doc(db, COLLECTION_MAPPING.purchase_orders, initialBatch.purchaseOrderDetails.id));
        if (poDoc.exists()) {
          const po = poDoc.data();
          traceability.chain.push({
            step: 'purchase',
            type: 'Purchase Order',
            poId: poDoc.id,
            poNumber: po.number,
            supplierName: po.supplier?.name || po.supplierName,
            orderDate: po.orderDate?.toDate?.()?.toISOString?.() || po.orderDate,
            expectedDeliveryDate: po.expectedDeliveryDate?.toDate?.()?.toISOString?.() || po.expectedDeliveryDate,
            deliveryDate: initialBatch.receivedDate?.toDate?.()?.toISOString?.() || initialBatch.receivedDate,
            status: po.status
          });
          
          console.log(`[ToolExecutor] ✅ Znaleziono PO: ${po.number}`);
        }
      }
    }
    
    // 3. TRACEABILITY W PRZÓD (FORWARD) - Gdzie trafiła partia?
    if (!params.direction || params.direction === 'forward' || params.direction === 'both') {
      // Znajdź zamówienia klientów powiązane z tą partią
      if (initialBatch.orderId) {
        const orderDoc = await getDoc(doc(db, COLLECTION_MAPPING.customer_orders, initialBatch.orderId));
        if (orderDoc.exists()) {
          const order = orderDoc.data();
          traceability.chain.push({
            step: 'delivery',
            type: 'Customer Order',
            orderId: orderDoc.id,
            orderNumber: order.orderNumber,
            customerName: order.customer?.name || order.customerName,
            orderDate: order.orderDate?.toDate?.()?.toISOString?.() || order.orderDate,
            deliveryDate: order.deliveryDate?.toDate?.()?.toISOString?.() || order.deliveryDate,
            status: order.status
          });
          
          console.log(`[ToolExecutor] ✅ Znaleziono CO: ${order.orderNumber}`);
        }
      }
      
      // Znajdź zadania produkcyjne które mogły użyć tej partii (przez moNumber jeśli istnieje)
      if (initialBatch.moNumber) {
        // Sprawdź czy są inne partie lub zadania powiązane
        const relatedTasksQuery = query(
          collection(db, COLLECTION_MAPPING.production_tasks),
          where('moNumber', '==', initialBatch.moNumber),
          firestoreLimit(5)
        );
        
        const relatedTasksSnapshot = await getDocs(relatedTasksQuery);
        if (!relatedTasksSnapshot.empty) {
          console.log(`[ToolExecutor] ✅ Znaleziono ${relatedTasksSnapshot.docs.length} powiązanych zadań`);
        }
      }
    }
    
    // ✅ NOWE: Zamień ID na czytelne numeracje w łańcuchu
    traceability.chain = traceability.chain.map(step => {
      // Dodaj displayId z priorytetem numeracji nad ID
      if (step.type === 'Manufacturing Order') {
        return {
          ...step,
          displayId: step.moNumber || step.taskId
        };
      }
      if (step.type === 'Purchase Order') {
        return {
          ...step,
          displayId: step.poNumber || step.poId
        };
      }
      if (step.type === 'Customer Order') {
        return {
          ...step,
          displayId: step.orderNumber || step.orderId
        };
      }
      if (step.type === 'Material Batch' || step.type === 'Inventory Batch') {
        return {
          ...step,
          displayId: step.batchNumber || step.lotNumber || step.batchId
        };
      }
      return step;
    });
    
    return {
      ...traceability,
      chainLength: traceability.chain.length,
      summary: {
        totalSteps: traceability.chain.length,
        purchaseOrders: traceability.chain.filter(c => c.type === 'Purchase Order').length,
        materialBatches: traceability.chain.filter(c => c.type === 'Material Batch' || c.type === 'Inventory Batch').length,
        productionTasks: traceability.chain.filter(c => c.type === 'Manufacturing Order').length,
        customerOrders: traceability.chain.filter(c => c.type === 'Customer Order').length
      },
      isEmpty: traceability.chain.length === 0,
      warning: traceability.chain.length === 0 ? "⚠️ BRAK DANYCH - Nie można utworzyć łańcucha traceability." : null
    };
  }
  
  /**
   * 🆕 Aktualizuje pozycje zamówienia zakupowego na podstawie danych z dokumentu dostawy lub faktury
   * @param {Object} params - Parametry aktualizacji
   * @returns {Object} - Wynik aktualizacji z podsumowaniem zmian
   */
  static async updatePurchaseOrderItems(params) {
    const { 
      purchaseOrderId, 
      poNumber, 
      documentType = 'delivery_note',
      itemUpdates = [], 
      deliveryDate, 
      deliveryNoteNumber,
      invoiceData = null,
      dryRun = false 
    } = params;
    
    console.log('[ToolExecutor] 📦 Aktualizuję pozycje PO z dokumentu dostawy');
    console.log('[ToolExecutor] Parametry:', { purchaseOrderId, poNumber, itemUpdatesCount: itemUpdates.length, dryRun });
    
    // Walidacja
    if (!itemUpdates || itemUpdates.length === 0) {
      return {
        success: false,
        error: "Brak aktualizacji pozycji (itemUpdates jest puste)",
        isEmpty: true
      };
    }
    
    try {
      // 1. Znajdź PO po ID lub numerze
      let poDoc = null;
      let poId = purchaseOrderId;
      
      if (purchaseOrderId) {
        // Spróbuj bezpośrednio po ID
        const directRef = doc(db, 'purchaseOrders', purchaseOrderId);
        const directDoc = await getDoc(directRef);
        
        if (directDoc.exists()) {
          poDoc = directDoc;
          poId = directDoc.id;
        } else {
          // Może to numer PO? Szukaj po polu 'number'
          const numberQuery = query(
            collection(db, 'purchaseOrders'),
            where('number', '==', purchaseOrderId),
            firestoreLimit(1)
          );
          const snapshot = await getDocs(numberQuery);
          if (!snapshot.empty) {
            poDoc = snapshot.docs[0];
            poId = poDoc.id;
          }
        }
      }
      
      if (!poDoc && poNumber) {
        // Szukaj po numerze PO
        const numberQuery = query(
          collection(db, 'purchaseOrders'),
          where('number', '==', poNumber),
          firestoreLimit(1)
        );
        const snapshot = await getDocs(numberQuery);
        if (!snapshot.empty) {
          poDoc = snapshot.docs[0];
          poId = poDoc.id;
        }
      }
      
      if (!poDoc) {
        return {
          success: false,
          error: `Nie znaleziono zamówienia zakupowego: ${purchaseOrderId || poNumber}`,
          isEmpty: true
        };
      }
      
      const poData = poDoc.data();
      const items = poData.items || [];
      
      console.log(`[ToolExecutor] ✅ Znaleziono PO: ${poData.number} z ${items.length} pozycjami`);
      
      // 2. Przygotuj aktualizacje
      const updatedItems = [...items];
      const appliedChanges = [];
      const skippedItems = [];
      
      for (const update of itemUpdates) {
        // Znajdź pozycję w PO
        let itemIndex = -1;
        let matchReason = '';
        
        // Najpierw szukaj po itemId
        if (update.itemId) {
          itemIndex = updatedItems.findIndex(item => item.id === update.itemId);
          matchReason = 'itemId';
        }
        
        // Jeśli nie znaleziono, szukaj po nazwie produktu
        if (itemIndex === -1 && update.productName) {
          const normalizedSearchName = update.productName.toLowerCase().trim();
          
          // Dokładne dopasowanie
          itemIndex = updatedItems.findIndex(item => 
            item.name?.toLowerCase().trim() === normalizedSearchName
          );
          
          // Jeśli nie znaleziono, szukaj częściowego dopasowania
          if (itemIndex === -1) {
            itemIndex = updatedItems.findIndex(item => {
              const itemName = item.name?.toLowerCase().trim() || '';
              return itemName.includes(normalizedSearchName) || 
                     normalizedSearchName.includes(itemName);
            });
          }
          
          matchReason = 'productName';
        }
        
        if (itemIndex === -1) {
          skippedItems.push({
            searchCriteria: update.itemId || update.productName,
            reason: 'Nie znaleziono pozycji w PO'
          });
          continue;
        }
        
        // Przygotuj zmiany dla pozycji
        const originalItem = updatedItems[itemIndex];
        const changes = {};
        
        // Aktualizuj received (dodaj do istniejącej wartości)
        if (update.received !== undefined && update.received !== null) {
          const currentReceived = parseFloat(originalItem.received || 0);
          const newReceived = currentReceived + parseFloat(update.received);
          changes.received = newReceived;
        }
        
        // Aktualizuj lotNumber
        if (update.lotNumber) {
          changes.lotNumber = update.lotNumber;
        }
        
        // Aktualizuj expiryDate
        if (update.expiryDate) {
          changes.expiryDate = update.expiryDate;
        }
        
        // Aktualizuj unitPrice (opcjonalnie - z faktury lub WZ)
        if (update.unitPrice !== undefined && update.unitPrice !== null) {
          changes.unitPrice = parseFloat(update.unitPrice);
          // Przelicz totalPrice
          const quantity = parseFloat(originalItem.quantity || 0);
          const discount = parseFloat(originalItem.discount || 0);
          const discountMultiplier = (100 - discount) / 100;
          changes.totalPrice = (quantity * changes.unitPrice * discountMultiplier).toFixed(2);
        }
        
        // Aktualizuj vatRate (z faktury)
        if (update.vatRate !== undefined && update.vatRate !== null) {
          changes.vatRate = parseFloat(update.vatRate);
        }
        
        // Aktualizuj wartości netto/brutto z faktury
        if (update.totalNet !== undefined) {
          changes.invoiceTotalNet = parseFloat(update.totalNet);
        }
        if (update.totalGross !== undefined) {
          changes.invoiceTotalGross = parseFloat(update.totalGross);
        }
        
        // Aktualizuj actualDeliveryDate
        if (deliveryDate) {
          changes.actualDeliveryDate = deliveryDate;
        }
        
        // Aktualizuj notatki
        const notesParts = [];
        if (deliveryNoteNumber) {
          notesParts.push(`WZ: ${deliveryNoteNumber}`);
        }
        if (invoiceData?.invoiceNumber) {
          notesParts.push(`FV: ${invoiceData.invoiceNumber}`);
        }
        if (update.batchNotes) {
          notesParts.push(update.batchNotes);
        }
        
        if (notesParts.length > 0) {
          const existingNotes = originalItem.notes || '';
          changes.notes = existingNotes ? 
            `${existingNotes}\n${notesParts.join(', ')}` : 
            notesParts.join(', ');
        }
        
        // Zastosuj zmiany
        updatedItems[itemIndex] = {
          ...originalItem,
          ...changes,
          lastDeliveryUpdate: new Date().toISOString()
        };
        
        appliedChanges.push({
          itemId: originalItem.id,
          itemName: originalItem.name,
          matchedBy: matchReason,
          changes: changes,
          beforeValues: {
            received: originalItem.received || 0,
            lotNumber: originalItem.lotNumber || null,
            expiryDate: originalItem.expiryDate || null
          }
        });
      }
      
      // 3. Zapisz zmiany (jeśli nie dryRun)
      if (!dryRun && appliedChanges.length > 0) {
        const { updateDoc, arrayUnion } = await import('firebase/firestore');
        const poRef = doc(db, 'purchaseOrders', poId);
        
        const updateData = {
          items: updatedItems,
          updatedAt: new Date()
        };
        
        // Dodaj informacje o dostawie (jeśli to WZ)
        if (documentType === 'delivery_note' || documentType === 'both') {
          updateData.lastDeliveryUpdate = {
            date: new Date().toISOString(),
            deliveryNoteNumber: deliveryNoteNumber || null,
            itemsUpdated: appliedChanges.length
          };
        }
        
        // Dodaj dane z faktury (jeśli to faktura)
        if ((documentType === 'invoice' || documentType === 'both') && invoiceData) {
          // Dodaj link do faktury
          if (invoiceData.invoiceNumber) {
            const newInvoiceLink = {
              id: `inv-${Date.now()}`,
              number: invoiceData.invoiceNumber,
              date: invoiceData.invoiceDate || null,
              dueDate: invoiceData.dueDate || null,
              totalNet: invoiceData.totalNet || null,
              totalVat: invoiceData.totalVat || null,
              totalGross: invoiceData.totalGross || null,
              currency: invoiceData.currency || poData.currency || 'PLN',
              paymentMethod: invoiceData.paymentMethod || null,
              bankAccount: invoiceData.bankAccount || null,
              addedAt: new Date().toISOString(),
              addedBy: 'AI-Vision'
            };
            
            // Użyj arrayUnion aby dodać do istniejącej tablicy
            updateData.invoiceLinks = arrayUnion(newInvoiceLink);
          }
          
          // Zaktualizuj dane rozliczeniowe PO
          if (invoiceData.totalGross) {
            updateData.invoicedTotalGross = invoiceData.totalGross;
          }
          if (invoiceData.totalNet) {
            updateData.invoicedTotalNet = invoiceData.totalNet;
          }
          
          updateData.lastInvoiceUpdate = {
            date: new Date().toISOString(),
            invoiceNumber: invoiceData.invoiceNumber || null,
            itemsUpdated: appliedChanges.length
          };
        }
        
        await updateDoc(poRef, updateData);
        console.log(`[ToolExecutor] ✅ Zapisano ${appliedChanges.length} zmian do PO ${poData.number} (typ: ${documentType})`);
      }
      
      // 4. Zwróć podsumowanie
      const docTypeLabel = documentType === 'invoice' ? 'faktury' : 
                           documentType === 'both' ? 'WZ i faktury' : 'WZ';
      
      return {
        success: true,
        dryRun: dryRun,
        documentType: documentType,
        purchaseOrder: {
          id: poId,
          number: poData.number,
          supplier: poData.supplier?.name || poData.supplierName || 'Nieznany',
          totalItems: items.length,
          currency: poData.currency || 'PLN'
        },
        summary: {
          totalUpdatesRequested: itemUpdates.length,
          appliedChanges: appliedChanges.length,
          skippedItems: skippedItems.length
        },
        appliedChanges: appliedChanges,
        skippedItems: skippedItems,
        deliveryInfo: (documentType === 'delivery_note' || documentType === 'both') ? {
          deliveryDate: deliveryDate || null,
          deliveryNoteNumber: deliveryNoteNumber || null
        } : null,
        invoiceInfo: (documentType === 'invoice' || documentType === 'both') && invoiceData ? {
          invoiceNumber: invoiceData.invoiceNumber || null,
          invoiceDate: invoiceData.invoiceDate || null,
          dueDate: invoiceData.dueDate || null,
          totalNet: invoiceData.totalNet || null,
          totalVat: invoiceData.totalVat || null,
          totalGross: invoiceData.totalGross || null,
          currency: invoiceData.currency || null
        } : null,
        message: dryRun 
          ? `🔍 Podgląd: ${appliedChanges.length} pozycji zostałoby zaktualizowanych z ${docTypeLabel}` 
          : `✅ Zaktualizowano ${appliedChanges.length} pozycji w PO ${poData.number} na podstawie ${docTypeLabel}`,
        isEmpty: appliedChanges.length === 0
      };
      
    } catch (error) {
      console.error('[ToolExecutor] ❌ Błąd aktualizacji PO:', error);
      return {
        success: false,
        error: error.message,
        isEmpty: true
      };
    }
  }
}

