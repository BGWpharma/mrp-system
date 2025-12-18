// src/services/ai/data/QueryExecutor.js

import { 
  collection, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit as firestoreLimit,
  getCountFromServer
} from 'firebase/firestore';
import { db } from '../../firebase/config';

/**
 * Klasa wykonująca zapytania do bazy danych Firebase
 * Optymalizuje pobieranie danych na podstawie intencji użytkownika
 */
export class QueryExecutor {

  /**
   * Wykonuje zapytanie na podstawie intencji i parametrów z retry mechanism
   * @param {string} intent - Typ zapytania
   * @param {Object} parameters - Parametry zapytania
   * @param {number} retryCount - Licznik prób (internal)
   * @returns {Promise<Object>} - Wyniki zapytania
   */
  static async executeQuery(intent, parameters = {}, retryCount = 0) {
    const maxRetries = 2;
    const baseDelay = 1000; // 1 sekunda
    
    try {
      console.log(`[QueryExecutor] Wykonuję zapytanie: ${intent}${retryCount > 0 ? ` (próba ${retryCount + 1})` : ''}`, parameters);

      return await this.executeQueryInternal(intent, parameters);
    } catch (error) {
      console.error(`[QueryExecutor] Błąd podczas wykonywania zapytania ${intent}:`, error);
      
      // Sprawdź czy błąd kwalifikuje się do retry
      if (retryCount < maxRetries && this.isRetryableError(error)) {
        const delay = baseDelay * Math.pow(2, retryCount); // Exponential backoff
        console.log(`[QueryExecutor] Ponawianie za ${delay}ms...`);
        
        await this.delay(delay);
        return this.executeQuery(intent, parameters, retryCount + 1);
      }
      
      // Jeśli retry się nie udał lub błąd nie kwalifikuje się do retry
      return {
        success: false,
        error: error.message,
        intent,
        parameters,
        retryCount,
        errorType: this.classifyError(error)
      };
    }
  }

  /**
   * Wykonuje właściwe zapytanie bez retry logic
   * @param {string} intent - Typ zapytania
   * @param {Object} parameters - Parametry zapytania
   * @returns {Promise<Object>} - Wyniki zapytania
   */
  static async executeQueryInternal(intent, parameters = {}) {
    switch (intent) {
        // Receptury
        case 'recipe_count':
          return await this.executeRecipeCount(parameters);
        case 'recipe_count_by_weight':
          return await this.executeRecipeCountByWeight(parameters);
        case 'recipe_count_by_ingredients':
          return await this.executeRecipeCountByIngredients(parameters);
        case 'recipe_weight_analysis':
          return await this.executeRecipeWeightAnalysis(parameters);
        case 'recipe_info':
          return await this.executeRecipeInfo(parameters);

        // Magazyn
        case 'inventory_count':
          return await this.executeInventoryCount(parameters);
        case 'inventory_count_low_stock':
          return await this.executeInventoryCountLowStock(parameters);
        case 'inventory_low_stock':
          return await this.executeInventoryLowStock(parameters);
        case 'inventory_high_stock':
          return await this.executeInventoryHighStock(parameters);
        case 'inventory_status':
          return await this.executeInventoryStatus(parameters);

        // Zamówienia
        case 'orders_count':
          return await this.executeOrdersCount(parameters);
        case 'customer_orders_count':
          return await this.executeCustomerOrdersCount(parameters);
        case 'orders_status':
          return await this.executeOrdersStatus(parameters);
        case 'orders_info':
          return await this.executeOrdersInfo(parameters);

        // Zamówienia zakupu
        case 'purchase_orders_count':
          return await this.executePurchaseOrdersCount(parameters);
        case 'purchase_orders_info':
          return await this.executePurchaseOrdersInfo(parameters);

        // Produkcja
        case 'production_count':
          return await this.executeProductionCount(parameters);
        case 'production_count_in_progress':
          return await this.executeProductionCountByStatus(parameters, 'w trakcie');
        case 'production_count_on_hold':
          return await this.executeProductionCountByStatus(parameters, 'wstrzymane');
        case 'production_count_planned':
          return await this.executeProductionCountByStatus(parameters, 'zaplanowane');
        case 'production_count_finished':
          return await this.executeProductionCountByStatus(parameters, 'zakończone');
        case 'production_in_progress':
          return await this.executeProductionByStatus(parameters, 'w trakcie');
        case 'production_on_hold':
          return await this.executeProductionByStatus(parameters, 'wstrzymane');
        case 'production_planned':
          return await this.executeProductionByStatus(parameters, 'zaplanowane');
        case 'production_finished':
          return await this.executeProductionByStatus(parameters, 'zakończone');
        case 'production_status':
          return await this.executeProductionStatus(parameters);
        case 'production_info':
          return await this.executeProductionInfo(parameters);

        // Dostawcy
        case 'suppliers_count':
          return await this.executeSuppliersCount(parameters);
        case 'suppliers_info':
          return await this.executeSuppliersInfo(parameters);

        // Klienci
        case 'customers_count':
          return await this.executeCustomersCount(parameters);
        case 'customers_info':
          return await this.executeCustomersInfo(parameters);

        // Ogólne informacje
        case 'general_info':
          return await this.executeGeneralInfo(parameters);

        default:
          return await this.executeGeneralInfo(parameters);
      }
  }

  // ==================== RECEPTURY ====================

  /**
   * Zlicza wszystkie receptury
   */
  static async executeRecipeCount(parameters) {
    const recipesRef = collection(db, 'recipes');
    // ✅ OPTYMALIZACJA: Użyj getCountFromServer dla lepszej wydajności
    const countSnapshot = await getCountFromServer(recipesRef);
    
    return {
      success: true,
      count: countSnapshot.data().count,
      type: 'count',
      collection: 'recipes'
    };
  }

  /**
   * Zlicza receptury według wagi składników
   */
  static async executeRecipeCountByWeight(parameters) {
    const recipesRef = collection(db, 'recipes');
    const snapshot = await getDocs(recipesRef);
    
    const recipes = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Filtruj receptury według wagi składników
    let filteredRecipes = recipes;
    
    if (parameters.filters && parameters.filters.length > 0) {
      filteredRecipes = recipes.filter(recipe => {
        const totalWeight = this.calculateTotalWeight(recipe.ingredients || []);
        
        return parameters.filters.some(filter => {
          switch (filter.operator) {
            case '>':
              return totalWeight > filter.value;
            case '<':
              return totalWeight < filter.value;
            case '=':
              return Math.abs(totalWeight - filter.value) < 1; // tolerancja 1g
            default:
              return false;
          }
        });
      });
    }

    const recipesWithWeights = filteredRecipes.map(recipe => ({
      id: recipe.id,
      name: recipe.name,
      totalWeight: this.calculateTotalWeight(recipe.ingredients || []),
      ingredientsCount: (recipe.ingredients || []).length
    }));

    return {
      success: true,
      count: filteredRecipes.length,
      totalRecipes: recipes.length,
      type: 'count_with_filter',
      collection: 'recipes',
      filter: 'weight',
      recipes: recipesWithWeights,
      filterCriteria: parameters.filters
    };
  }

  /**
   * Zlicza receptury według liczby składników
   */
  static async executeRecipeCountByIngredients(parameters) {
    const recipesRef = collection(db, 'recipes');
    const snapshot = await getDocs(recipesRef);
    
    const recipes = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Filtruj receptury według liczby składników
    let filteredRecipes = recipes;
    
    if (parameters.filters && parameters.filters.length > 0) {
      filteredRecipes = recipes.filter(recipe => {
        const ingredientsCount = (recipe.ingredients || []).length;
        
        return parameters.filters.some(filter => {
          switch (filter.operator) {
            case '>':
              return ingredientsCount > filter.originalValue;
            case '<':
              return ingredientsCount < filter.originalValue;
            case '=':
              return ingredientsCount === filter.originalValue;
            default:
              return false;
          }
        });
      });
    }

    const recipesWithCounts = filteredRecipes.map(recipe => ({
      id: recipe.id,
      name: recipe.name,
      ingredientsCount: (recipe.ingredients || []).length,
      totalWeight: this.calculateTotalWeight(recipe.ingredients || [])
    }));

    return {
      success: true,
      count: filteredRecipes.length,
      totalRecipes: recipes.length,
      type: 'count_with_filter',
      collection: 'recipes',
      filter: 'ingredients_count',
      recipes: recipesWithCounts,
      filterCriteria: parameters.filters
    };
  }

  /**
   * Analizuje wagi receptur
   */
  static async executeRecipeWeightAnalysis(parameters) {
    const recipesRef = collection(db, 'recipes');
    const snapshot = await getDocs(recipesRef);
    
    const recipes = snapshot.docs.map(doc => ({
      id: doc.id,
      name: doc.name,
      ingredients: doc.data().ingredients || []
    }));

    const analysis = recipes.map(recipe => {
      const totalWeight = this.calculateTotalWeight(recipe.ingredients);
      return {
        id: recipe.id,
        name: recipe.name,
        totalWeight,
        ingredientsCount: recipe.ingredients.length,
        ingredients: recipe.ingredients.map(ing => ({
          name: ing.name,
          quantity: parseFloat(ing.quantity) || 0,
          unit: ing.unit,
          weightInGrams: this.convertToGrams(parseFloat(ing.quantity) || 0, ing.unit)
        }))
      };
    });

    // Sortuj według wagi
    analysis.sort((a, b) => b.totalWeight - a.totalWeight);

    const stats = {
      totalRecipes: analysis.length,
      averageWeight: analysis.reduce((sum, r) => sum + r.totalWeight, 0) / analysis.length,
      maxWeight: Math.max(...analysis.map(r => r.totalWeight)),
      minWeight: Math.min(...analysis.map(r => r.totalWeight)),
      heaviestRecipe: analysis[0],
      lightestRecipe: analysis[analysis.length - 1]
    };

    return {
      success: true,
      type: 'analysis',
      collection: 'recipes',
      analysis,
      stats
    };
  }

  /**
   * Pobiera informacje o recepturach
   */
  static async executeRecipeInfo(parameters) {
    const recipesRef = collection(db, 'recipes');
    const q = query(recipesRef, orderBy('updatedAt', 'desc'), firestoreLimit(10));
    const snapshot = await getDocs(q);
    
    const recipes = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      totalWeight: this.calculateTotalWeight(doc.data().ingredients || [])
    }));

    return {
      success: true,
      type: 'info',
      collection: 'recipes',
      recipes,
      count: recipes.length
    };
  }

  // ==================== MAGAZYN ====================

  /**
   * Zlicza wszystkie produkty w magazynie
   */
  static async executeInventoryCount(parameters) {
    const inventoryRef = collection(db, 'inventory');
    // ✅ OPTYMALIZACJA: Użyj getCountFromServer dla lepszej wydajności
    const countSnapshot = await getCountFromServer(inventoryRef);
    
    return {
      success: true,
      count: countSnapshot.data().count,
      type: 'count',
      collection: 'inventory'
    };
  }

  /**
   * Zlicza produkty z niskim stanem
   */
  static async executeInventoryCountLowStock(parameters) {
    const inventoryRef = collection(db, 'inventory');
    const snapshot = await getDocs(inventoryRef);
    
    const items = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    const lowStockItems = items.filter(item => {
      const currentQuantity = parseFloat(item.quantity) || 0;
      const minQuantity = parseFloat(item.minQuantity) || 0;
      return currentQuantity <= minQuantity;
    });

    return {
      success: true,
      count: lowStockItems.length,
      totalItems: items.length,
      type: 'count_with_filter',
      collection: 'inventory',
      filter: 'low_stock',
      items: lowStockItems.map(item => ({
        id: item.id,
        name: item.name,
        currentQuantity: item.quantity,
        minQuantity: item.minQuantity,
        unit: item.unit
      }))
    };
  }

  /**
   * Pobiera produkty z niskim stanem
   */
  static async executeInventoryLowStock(parameters) {
    const result = await this.executeInventoryCountLowStock(parameters);
    result.type = 'list';
    return result;
  }

  /**
   * Pobiera produkty z wysokim stanem
   */
  static async executeInventoryHighStock(parameters) {
    const inventoryRef = collection(db, 'inventory');
    const snapshot = await getDocs(inventoryRef);
    
    const items = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Zakładamy "wysoki stan" jako ponad 10x min quantity
    const highStockItems = items.filter(item => {
      const currentQuantity = parseFloat(item.quantity) || 0;
      const minQuantity = parseFloat(item.minQuantity) || 0;
      return minQuantity > 0 && currentQuantity > (minQuantity * 10);
    });

    return {
      success: true,
      count: highStockItems.length,
      totalItems: items.length,
      type: 'list',
      collection: 'inventory',
      filter: 'high_stock',
      items: highStockItems.map(item => ({
        id: item.id,
        name: item.name,
        currentQuantity: item.quantity,
        minQuantity: item.minQuantity,
        unit: item.unit,
        overstock: ((parseFloat(item.quantity) || 0) / (parseFloat(item.minQuantity) || 1)).toFixed(1)
      }))
    };
  }

  /**
   * Pobiera ogólny status magazynu
   */
  static async executeInventoryStatus(parameters) {
    const inventoryRef = collection(db, 'inventory');
    const snapshot = await getDocs(inventoryRef);
    
    const items = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    const lowStockItems = items.filter(item => {
      const currentQuantity = parseFloat(item.quantity) || 0;
      const minQuantity = parseFloat(item.minQuantity) || 0;
      return currentQuantity <= minQuantity;
    });

    const outOfStockItems = items.filter(item => {
      const currentQuantity = parseFloat(item.quantity) || 0;
      return currentQuantity <= 0;
    });

    const totalValue = items.reduce((sum, item) => {
      const quantity = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.price) || 0;
      return sum + (quantity * price);
    }, 0);

    return {
      success: true,
      type: 'status',
      collection: 'inventory',
      stats: {
        totalItems: items.length,
        lowStockCount: lowStockItems.length,
        outOfStockCount: outOfStockItems.length,
        totalValue: totalValue.toFixed(2),
        lowStockPercentage: ((lowStockItems.length / items.length) * 100).toFixed(1)
      },
      lowStockItems: lowStockItems.slice(0, 5).map(item => ({
        name: item.name,
        currentQuantity: item.quantity,
        minQuantity: item.minQuantity,
        unit: item.unit
      }))
    };
  }

  // ==================== ZAMÓWIENIA ====================

  /**
   * Zlicza wszystkie zamówienia
   */
  static async executeOrdersCount(parameters) {
    const ordersRef = collection(db, 'orders');
    // ✅ OPTYMALIZACJA: Użyj getCountFromServer dla lepszej wydajności
    const countSnapshot = await getCountFromServer(ordersRef);
    
    return {
      success: true,
      count: countSnapshot.data().count,
      type: 'count',
      collection: 'orders'
    };
  }

  /**
   * Zlicza zamówienia klientów
   */
  static async executeCustomerOrdersCount(parameters) {
    const ordersRef = collection(db, 'orders');
    const snapshot = await getDocs(ordersRef);
    
    const orders = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Grupuj według klientów
    const customerOrdersMap = {};
    orders.forEach(order => {
      const customerId = order.customerId || 'brak_klienta';
      if (!customerOrdersMap[customerId]) {
        customerOrdersMap[customerId] = [];
      }
      customerOrdersMap[customerId].push(order);
    });

    return {
      success: true,
      count: orders.length,
      type: 'count_grouped',
      collection: 'orders',
      groupBy: 'customer',
      customerOrdersCount: Object.keys(customerOrdersMap).length,
      customerOrders: Object.entries(customerOrdersMap).map(([customerId, orders]) => ({
        customerId,
        orderCount: orders.length,
        totalValue: orders.reduce((sum, order) => sum + (parseFloat(order.totalAmount) || 0), 0)
      }))
    };
  }

  /**
   * Pobiera status zamówień
   */
  static async executeOrdersStatus(parameters) {
    const ordersRef = collection(db, 'orders');
    const snapshot = await getDocs(ordersRef);
    
    const orders = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Grupuj według statusu
    const statusGroups = {};
    orders.forEach(order => {
      const status = order.status || 'nieznany';
      if (!statusGroups[status]) {
        statusGroups[status] = [];
      }
      statusGroups[status].push(order);
    });

    return {
      success: true,
      type: 'status',
      collection: 'orders',
      totalOrders: orders.length,
      statusBreakdown: Object.entries(statusGroups).map(([status, orders]) => ({
        status,
        count: orders.length,
        percentage: ((orders.length / orders.length) * 100).toFixed(1),
        totalValue: orders.reduce((sum, order) => sum + (parseFloat(order.totalAmount) || 0), 0)
      }))
    };
  }

  /**
   * Pobiera informacje o zamówieniach
   */
  static async executeOrdersInfo(parameters) {
    const ordersRef = collection(db, 'orders');
    const q = query(ordersRef, orderBy('orderDate', 'desc'), firestoreLimit(10));
    const snapshot = await getDocs(q);
    
    const orders = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return {
      success: true,
      type: 'info',
      collection: 'orders',
      orders,
      count: orders.length
    };
  }

  // ==================== ZAMÓWIENIA ZAKUPU ====================

  /**
   * Zlicza zamówienia zakupu
   */
  static async executePurchaseOrdersCount(parameters) {
    const purchaseOrdersRef = collection(db, 'purchaseOrders');
    // ✅ OPTYMALIZACJA: Użyj getCountFromServer dla lepszej wydajności
    const countSnapshot = await getCountFromServer(purchaseOrdersRef);
    
    return {
      success: true,
      count: countSnapshot.data().count,
      type: 'count',
      collection: 'purchaseOrders'
    };
  }

  /**
   * Pobiera informacje o zamówieniach zakupu
   */
  static async executePurchaseOrdersInfo(parameters) {
    const purchaseOrdersRef = collection(db, 'purchaseOrders');
    const q = query(purchaseOrdersRef, orderBy('orderDate', 'desc'), firestoreLimit(10));
    const snapshot = await getDocs(q);
    
    const purchaseOrders = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return {
      success: true,
      type: 'info',
      collection: 'purchaseOrders',
      purchaseOrders,
      count: purchaseOrders.length
    };
  }

  // ==================== PRODUKCJA ====================

  /**
   * Zlicza zadania produkcyjne
   */
  static async executeProductionCount(parameters) {
    const tasksRef = collection(db, 'productionTasks');
    // ✅ OPTYMALIZACJA: Użyj getCountFromServer dla lepszej wydajności
    const countSnapshot = await getCountFromServer(tasksRef);
    
    return {
      success: true,
      count: countSnapshot.data().count,
      type: 'count',
      collection: 'productionTasks'
    };
  }

  /**
   * Pobiera status zadań produkcyjnych
   */
  static async executeProductionStatus(parameters) {
    const tasksRef = collection(db, 'productionTasks');
    const snapshot = await getDocs(tasksRef);
    
    const tasks = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Grupuj według statusu
    const statusGroups = {};
    tasks.forEach(task => {
      const status = task.status || 'nieznany';
      if (!statusGroups[status]) {
        statusGroups[status] = [];
      }
      statusGroups[status].push(task);
    });

    return {
      success: true,
      type: 'status',
      collection: 'productionTasks',
      totalTasks: tasks.length,
      statusBreakdown: Object.entries(statusGroups).map(([status, statusTasks]) => ({
        status,
        count: statusTasks.length,
        percentage: ((statusTasks.length / tasks.length) * 100).toFixed(1)
      }))
    };
  }

  /**
   * Pobiera informacje o zadaniach produkcyjnych
   */
  static async executeProductionInfo(parameters) {
    const tasksRef = collection(db, 'productionTasks');
    const q = query(tasksRef, orderBy('scheduledDate', 'desc'), firestoreLimit(10));
    const snapshot = await getDocs(q);
    
    const tasks = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return {
      success: true,
      type: 'info',
      collection: 'productionTasks',
      tasks,
      count: tasks.length
    };
  }

  /**
   * Zlicza zadania produkcyjne według statusu
   */
  static async executeProductionCountByStatus(parameters, targetStatus) {
    try {
      const tasksRef = collection(db, 'productionTasks');
      const q = query(tasksRef, where('status', '==', targetStatus));
      // ✅ OPTYMALIZACJA: Użyj getCountFromServer dla lepszej wydajności
      const countSnapshot = await getCountFromServer(q);
      const count = countSnapshot.data().count;
      
      return {
        success: true,
        count: count,
        type: 'count_by_status',
        collection: 'productionTasks',
        status: targetStatus,
        message: `Znaleziono ${count} zadań produkcyjnych o statusie "${targetStatus}"`
      };
    } catch (error) {
      console.error(`[QueryExecutor] Błąd podczas liczenia zadań o statusie ${targetStatus}:`, error);
      return {
        success: false,
        error: error.message,
        count: 0,
        status: targetStatus
      };
    }
  }

  /**
   * Pobiera zadania produkcyjne według statusu z szczegółami
   */
  static async executeProductionByStatus(parameters, targetStatus) {
    try {
      const tasksRef = collection(db, 'productionTasks');
      const q = query(
        tasksRef, 
        where('status', '==', targetStatus),
        orderBy('scheduledDate', 'desc'),
        firestoreLimit(50) // Zwiększam limit aby móc filtrować
      );
      const snapshot = await getDocs(q);
      
      let tasks = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Filtrowanie na podstawie parametrów czasowych
      if (parameters.timePeriod) {
        tasks = this.filterTasksByTimePeriod(tasks, parameters.timePeriod);
      }

      // Dodatkowe informacje dla planowanych zadań - sprawdź które "zaraz się zaczną"
      if (targetStatus === 'zaplanowane') {
        const now = new Date();
        const soonTasks = tasks.filter(task => {
          if (task.scheduledDate) {
            const scheduledDate = task.scheduledDate.toDate ? task.scheduledDate.toDate() : new Date(task.scheduledDate);
            const diffDays = (scheduledDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
            return diffDays <= 7 && diffDays >= 0; // Zadania w ciągu 7 dni
          }
          return false;
        });

        return {
          success: true,
          type: 'tasks_by_status_with_schedule',
          collection: 'productionTasks',
          status: targetStatus,
          tasks,
          totalCount: tasks.length,
          soonTasks,
          soonCount: soonTasks.length,
          count: tasks.length,
          parameters,
          message: `Znaleziono ${tasks.length} zadań o statusie "${targetStatus}". ${soonTasks.length} z nich rozpocznie się w ciągu 7 dni.`
        };
      }

      return {
        success: true,
        type: 'tasks_by_status',
        collection: 'productionTasks',
        status: targetStatus,
        tasks,
        count: tasks.length,
        parameters,
        message: `Znaleziono ${tasks.length} zadań produkcyjnych o statusie "${targetStatus}"`
      };
    } catch (error) {
      console.error(`[QueryExecutor] Błąd podczas pobierania zadań o statusie ${targetStatus}:`, error);
      return {
        success: false,
        error: error.message,
        status: targetStatus,
        tasks: []
      };
    }
  }

  // ==================== DOSTAWCY ====================

  /**
   * Zlicza dostawców
   */
  static async executeSuppliersCount(parameters) {
    const suppliersRef = collection(db, 'suppliers');
    // ✅ OPTYMALIZACJA: Użyj getCountFromServer dla lepszej wydajności
    const countSnapshot = await getCountFromServer(suppliersRef);
    
    return {
      success: true,
      count: countSnapshot.data().count,
      type: 'count',
      collection: 'suppliers'
    };
  }

  /**
   * Pobiera informacje o dostawcach
   */
  static async executeSuppliersInfo(parameters) {
    const suppliersRef = collection(db, 'suppliers');
    const snapshot = await getDocs(suppliersRef);
    
    const suppliers = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return {
      success: true,
      type: 'info',
      collection: 'suppliers',
      suppliers,
      count: suppliers.length
    };
  }

  // ==================== KLIENCI ====================

  /**
   * Zlicza klientów
   */
  static async executeCustomersCount(parameters) {
    const customersRef = collection(db, 'customers');
    // ✅ OPTYMALIZACJA: Użyj getCountFromServer dla lepszej wydajności
    const countSnapshot = await getCountFromServer(customersRef);
    
    return {
      success: true,
      count: countSnapshot.data().count,
      type: 'count',
      collection: 'customers'
    };
  }

  /**
   * Pobiera informacje o klientach
   */
  static async executeCustomersInfo(parameters) {
    const customersRef = collection(db, 'customers');
    const snapshot = await getDocs(customersRef);
    
    const customers = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return {
      success: true,
      type: 'info',
      collection: 'customers',
      customers,
      count: customers.length
    };
  }

  // ==================== OGÓLNE INFORMACJE ====================

  /**
   * Pobiera ogólne informacje o systemie
   */
  static async executeGeneralInfo(parameters) {
    // Pobierz podstawowe statystyki z różnych kolekcji
    const [recipes, inventory, orders, production] = await Promise.all([
      this.executeRecipeCount(),
      this.executeInventoryCount(),
      this.executeOrdersCount(),
      this.executeProductionCount()
    ]);

    return {
      success: true,
      type: 'general_info',
      summary: {
        recipes: recipes.count,
        inventory: inventory.count,
        orders: orders.count,
        production: production.count
      }
    };
  }

  // ==================== FUNKCJE POMOCNICZE ====================

  /**
   * Oblicza łączną wagę składników receptury w gramach
   * @param {Array} ingredients - Lista składników
   * @returns {number} - Łączna waga w gramach
   */
  static calculateTotalWeight(ingredients = []) {
    return ingredients.reduce((total, ingredient) => {
      const quantity = parseFloat(ingredient.quantity) || 0;
      const weightInGrams = this.convertToGrams(quantity, ingredient.unit);
      return total + weightInGrams;
    }, 0);
  }

  /**
   * Konwertuje ilość do gramów
   * @param {number} quantity - Ilość
   * @param {string} unit - Jednostka
   * @returns {number} - Ilość w gramach
   */
  static convertToGrams(quantity, unit) {
    if (!unit || !quantity) return 0;
    
    const normalizedUnit = unit.toLowerCase().trim();
    
    switch (normalizedUnit) {
      case 'kg':
      case 'kilogram':
      case 'kilogramy':
        return quantity * 1000;
        
      case 'g':
      case 'gram':
      case 'gramy':
      case 'gramów':
        return quantity;
        
      case 'mg':
      case 'miligram':
      case 'miligramy':
        return quantity / 1000;
        
      case 'l':
      case 'litr':
      case 'litry':
        // Zakładamy gęstość wody (1g/ml)
        return quantity * 1000;
        
      case 'ml':
      case 'mililitr':
      case 'mililitry':
        // Zakładamy gęstość wody (1g/ml)
        return quantity;
        
      // Jednostki inne niż waga/objętość - nie konwertujemy
      case 'szt':
      case 'szt.':
      case 'sztuki':
      case 'sztuka':
      case 'pcs':
      case 'pieces':
      case 'caps':
      case 'kaps':
      case 'kapsułki':
      case 'kapsułka':
      case 'tab':
      case 'tabl':
      case 'tabletki':
      case 'tabletka':
        return 0; // Nie uwzględniamy w wadze - to jednostki liczone
        
      default:
        // Dla nieznanych jednostek pomijamy (bezpieczniejsze niż zakładać gramy)
        console.log(`[convertToGrams] Nieznana jednostka: "${unit}" - pomijam`);
        return 0;
    }
  }

  /**
   * Filtruje zadania według okresu czasowego z ulepszoną obsługą null dates
   * @param {Array} tasks - Lista zadań
   * @param {string} timePeriod - Okres czasowy
   * @returns {Array} - Przefiltrowane zadania
   */
  static filterTasksByTimePeriod(tasks, timePeriod) {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    
    return tasks.filter(task => {
      // Ulepszona walidacja daty
      if (!task.scheduledDate) {
        console.warn(`[QueryExecutor] Task ${task.id} ma brak scheduledDate`);
        return false;
      }
      
      let scheduledDate;
      try {
        // Bezpieczna konwersja daty z obsługą błędów
        if (task.scheduledDate.toDate && typeof task.scheduledDate.toDate === 'function') {
          // Firestore Timestamp
          scheduledDate = task.scheduledDate.toDate();
        } else if (task.scheduledDate instanceof Date) {
          // Już jest obiektem Date
          scheduledDate = task.scheduledDate;
        } else if (typeof task.scheduledDate === 'string' || typeof task.scheduledDate === 'number') {
          // String lub timestamp
          scheduledDate = new Date(task.scheduledDate);
        } else {
          throw new Error(`Nieznany format daty: ${typeof task.scheduledDate}`);
        }
        
        // Sprawdź czy data jest valid
        if (isNaN(scheduledDate.getTime())) {
          throw new Error('Invalid Date');
        }
      } catch (error) {
        console.error(`[QueryExecutor] Invalid date for task ${task.id}:`, error, 'scheduledDate:', task.scheduledDate);
        return false;
      }
      
      try {
        switch (timePeriod) {
          case 'thisMonth':
            return scheduledDate.getFullYear() === currentYear && 
                   scheduledDate.getMonth() === currentMonth;
          
          case 'nextMonth':
            const nextMonth = new Date(currentYear, currentMonth + 1);
            return scheduledDate.getFullYear() === nextMonth.getFullYear() && 
                   scheduledDate.getMonth() === nextMonth.getMonth();
          
          case 'thisWeek':
            const startOfWeek = new Date(now);
            startOfWeek.setDate(now.getDate() - now.getDay() + 1); // Poniedziałek
            startOfWeek.setHours(0, 0, 0, 0);
            
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(startOfWeek.getDate() + 6); // Niedziela
            endOfWeek.setHours(23, 59, 59, 999);
            
            return scheduledDate >= startOfWeek && scheduledDate <= endOfWeek;
          
          case 'nextWeek':
            const nextWeekStart = new Date(now);
            nextWeekStart.setDate(now.getDate() - now.getDay() + 8); // Następny poniedziałek
            nextWeekStart.setHours(0, 0, 0, 0);
            
            const nextWeekEnd = new Date(nextWeekStart);
            nextWeekEnd.setDate(nextWeekStart.getDate() + 6);
            nextWeekEnd.setHours(23, 59, 59, 999);
            
            return scheduledDate >= nextWeekStart && scheduledDate <= nextWeekEnd;
          
          case 'soon':
            const inSevenDays = new Date(now.getTime() + (7 * 24 * 60 * 60 * 1000));
            return scheduledDate >= now && scheduledDate <= inSevenDays;
          
          default:
            return true;
        }
      } catch (periodError) {
        console.error(`[QueryExecutor] Error filtering by time period ${timePeriod} for task ${task.id}:`, periodError);
        return false;
      }
    });
  }

  // ==================== ERROR RECOVERY ====================

  /**
   * Sprawdza czy błąd kwalifikuje się do ponowienia próby
   * @param {Error} error - Błąd do sprawdzenia
   * @returns {boolean} - Czy można ponowić próbę
   */
  static isRetryableError(error) {
    const retryablePatterns = [
      /network.*error/i,
      /connection.*timeout/i,
      /temporarily.*unavailable/i,
      /service.*unavailable/i,
      /internal.*error/i,
      /deadline.*exceeded/i,
      /quota.*exceeded/i,
      /rate.*limit/i,
      /throttle/i,
      /congestion/i
    ];

    const errorMessage = error.message || error.toString();
    
    // Sprawdź czy błąd pasuje do wzorców błędów tymczasowych
    const isRetryable = retryablePatterns.some(pattern => pattern.test(errorMessage));
    
    // Nie ponawiaj próby dla błędów autoryzacji lub nieprawidłowych zapytań
    const nonRetryablePatterns = [
      /permission.*denied/i,
      /unauthorized/i,
      /forbidden/i,
      /not.*found/i,
      /invalid.*argument/i,
      /already.*exists/i
    ];
    
    const isNonRetryable = nonRetryablePatterns.some(pattern => pattern.test(errorMessage));
    
    if (isNonRetryable) {
      console.log(`[QueryExecutor] Błąd nie kwalifikuje się do retry: ${errorMessage}`);
      return false;
    }
    
    return isRetryable;
  }

  /**
   * Klasyfikuje typ błędu dla lepszej diagnostyki
   * @param {Error} error - Błąd do klasyfikacji
   * @returns {string} - Typ błędu
   */
  static classifyError(error) {
    const errorMessage = error.message || error.toString();
    
    if (/network|connection|timeout/i.test(errorMessage)) {
      return 'network';
    }
    if (/permission|unauthorized|forbidden/i.test(errorMessage)) {
      return 'authorization';
    }
    if (/quota|rate.*limit|throttle/i.test(errorMessage)) {
      return 'quota';
    }
    if (/not.*found/i.test(errorMessage)) {
      return 'not_found';
    }
    if (/invalid.*argument|validation/i.test(errorMessage)) {
      return 'validation';
    }
    if (/internal.*error|service.*unavailable/i.test(errorMessage)) {
      return 'server';
    }
    
    return 'unknown';
  }

  /**
   * Opóźnienie wykonania o zadaną liczbę milisekund
   * @param {number} ms - Liczba milisekund opóźnienia
   * @returns {Promise<void>}
   */
  static delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Sprawdza połączenie z Firebase
   * @returns {Promise<boolean>} - Czy połączenie działa
   */
  static async checkFirebaseConnection() {
    try {
      // Prosta próba pobrania jednego dokumentu
      const testRef = collection(db, 'recipes');
      const testQuery = query(testRef, firestoreLimit(1));
      await getDocs(testQuery);
      return true;
    } catch (error) {
      console.error('[QueryExecutor] Test połączenia Firebase nieudany:', error);
      return false;
    }
  }

  /**
   * Pobiera diagnostyczne informacje o stanie systemu
   * @returns {Promise<Object>} - Informacje diagnostyczne
   */
  static async getDiagnostics() {
    const diagnostics = {
      timestamp: new Date().toISOString(),
      firebaseConnection: false,
      collections: {},
      performance: {}
    };

    try {
      // Test połączenia
      const connectionStart = performance.now();
      diagnostics.firebaseConnection = await this.checkFirebaseConnection();
      const connectionTime = performance.now() - connectionStart;
      
      diagnostics.performance.connectionTest = `${connectionTime.toFixed(2)}ms`;

      // Test dostępu do kolekcji
      const collections = ['recipes', 'inventory', 'orders', 'productionTasks', 'suppliers', 'customers'];
      
      for (const collectionName of collections) {
        try {
          const start = performance.now();
          const testRef = collection(db, collectionName);
          const testQuery = query(testRef, firestoreLimit(1));
          const snapshot = await getDocs(testQuery);
          const time = performance.now() - start;
          
          diagnostics.collections[collectionName] = {
            accessible: true,
            hasData: snapshot.size > 0,
            responseTime: `${time.toFixed(2)}ms`
          };
        } catch (error) {
          diagnostics.collections[collectionName] = {
            accessible: false,
            error: error.message,
            responseTime: 'N/A'
          };
        }
      }
    } catch (error) {
      diagnostics.error = error.message;
    }

    return diagnostics;
  }
}
