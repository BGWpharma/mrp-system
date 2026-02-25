// src/services/ai/parser/QueryParser.js

/**
 * Klasa do analizy i parsowania zapytań użytkownika
 * Rozpoznaje intencje i wyciąga parametry z tekstu
 */
export class QueryParser {
  
  /**
   * Wzorce do rozpoznawania różnych typów zapytań
   */
  static patterns = {
    // Operacje zliczania
    count: /ile|liczba|ilość|count/i,
    
    // Receptury
    recipes: /receptur|recepty|recept|recipe/i,
    recipeWeight: /suma składników|łączna waga|gram|gr|kg|waga/i,
    ingredients: /składnik|ingredient|skład/i,
    
    // Stany magazynowe
    inventory: /stan|magazyn|produkt|item|inventory/i,
    lowStock: /niski stan|brakuje|mało|kończy się|low stock/i,
    highStock: /wysoki stan|dużo|za dużo|nadmiar/i,
    
    // Zamówienia
    orders: /zamówien|zamówi|order|CO/i,
    customerOrders: /zamówien.*klient|klient.*zamówien/i,
    
    // Zamówienia zakupu
    purchaseOrders: /zamówien.*zakup|zakup.*zamówien|PO|purchase/i,
    
    // Zadania produkcyjne
    production: /produkc|zlecen|zadani|MO|manufacturing/i,
    productionStatus: /status.*produkc|produkc.*status/i,
    
    // Dostawcy
    suppliers: /dostawc|supplier/i,
    
    // Klienci
    customers: /klient|customer/i,
    
    // Filtry liczbowe
    numbers: /\d+/g,
    operators: /ponad|powyżej|więcej|>|mniej|poniżej|<|równa|=|wynosi/i,
    
    // Jednostki wagi
    weightUnits: /gram|gr|g|kilogram|kg/i,
    
    // Status
    status: /status|stan/i,
    active: /aktywn|active/i,
    completed: /zakończon|completed|done/i,
    pending: /oczekuj|pending|waiting/i,
    
    // Statusy produkcji - MRP specyficzne
    inProgress: /w trakcie|w realizacji|trwaj|realizuj|wykonyw/i,
    onHold: /wstrzymane|wstrzymany|zatrzymane|zatrzymany|hold|paused/i,
    planned: /zaplanowane|zaplanowany|planned|scheduled|powinny.*zacząć|powinny.*rozpocz|mają.*rozpocz|będą.*rozpocz|planowane.*rozpoczęcie/i,
    finished: /zakończone|zakończony|skończone|finished|completed/i,
    
    // Daty
    dates: /dzisiaj|today|wczoraj|yesterday|tydzień|week|miesiąc|month/i,
    
    // Porównania
    comparison: /najw|najwięc|najmn|najmniej|top|bottom|max|min/i,
    
    // NOWE: Zaawansowane wzorce analityczne
    // Trendy i analizy czasowe
    trends: /trend|tendencj|wzrost|spadek|zmian|rozwój|ewolucj/i,
    analytics: /analiz|analizy|badani|przegląd|raport|statystyk/i,
    forecasting: /prognoz|przewidy|będzie|przyszł|następn|szacuj|oczekuj/i,
    
    // Optymalizacja i rekomendacje
    optimization: /optymalizuj|optymalizacja|najleps|ulepsze|poprawi|efektywn/i,
    recommendations: /polec|rekomend|sugeruj|radz|zaproponuj|co warto/i,
    
    // Porównania i benchmarking
    comparison_advanced: /porówn|vs|versus|względem|kontra|zestawien/i,
    benchmarking: /ranking|classifica|pozycj|miejsce|benchmark/i,
    
    // Problemy i ryzyka
    problems: /problem|trudności|przeszkod|wyzwani|błęd/i,
    risks: /ryzyko|zagroże|niebezpieczeń|słab|defekt/i,
    // Koszty i finanse
    costs: /koszt|cena|wydatk|opłacalność|zyskown|rentowność|finansow|budżet|economy/i,
    profitability: /zysk|profit|marża|zwrot|rentowność|ROI/i,
    
    // Wydajność i monitoring
    performance: /wydajność|efektywność|produktywność|tempo|szybkość/i,
    monitoring: /monitor|śledz|kontroluj|obserwuj|nadzoruj/i,
    
    // Planowanie i harmonogramy
    planning: /plan|harmonogram|terminarz|kalendarz|schedule/i,
    capacity: /pojemność|zdolność|limit|maksimum|capacity/i,
    
    // Parametry czasowe rozszerzone
    timeRecent: /ostatni|najnowsz|aktualn|current|teraz/i,
    timePeriods: /dziś|wczoraj|tydzień|miesiąc|kwartał|rok|decade/i,
    timeComparison: /porówn.*okres|rok do roku|miesiąc do miesiąc/i,
    
    // Okresy specyficzne dla planowania
    thisMonth: /w tym miesiąc|tego miesiąc|bieżącym miesiąc/i,
    nextMonth: /następny miesiąc|przyszły miesiąc|w przyszłym miesiąc/i,
    thisWeek: /w tym tygodn|tego tygodn|bieżącym tygodn/i,
    nextWeek: /następny tydzień|przyszły tydzień|w przyszłym tygodn/i,
    soon: /wkrótce|niedługo|zaraz|w najbliższym czasie|rychło/i
  };

  /**
   * Główna metoda analizująca zapytanie użytkownika z ulepszoną walidacją
   * @param {string} query - Zapytanie użytkownika
   * @returns {Object} - Obiekt z rozpoznaną intencją i parametrami
   */
  static analyzeQuery(query) {
    // Enhanced input validation
    const validationResult = this.validateInput(query);
    if (!validationResult.isValid) {
      console.warn(`[QueryParser] Invalid input: ${validationResult.reason}`);
      return {
        intent: 'unknown',
        parameters: {},
        confidence: 0,
        query: query || '',
        error: validationResult.reason,
        validationPassed: false
      };
    }

    const normalizedQuery = this.sanitizeAndNormalize(query);
    
    try {
      const intent = this.recognizeIntent(normalizedQuery);
      const parameters = this.extractParameters(normalizedQuery);
      const confidence = this.calculateConfidence(intent, parameters, normalizedQuery);
      
      // Post-processing validation
      const finalValidation = this.validateResults(intent, parameters, confidence);
      
      return {
        intent: finalValidation.intent,
        parameters: finalValidation.parameters,
        confidence: finalValidation.confidence,
        query: normalizedQuery,
        originalQuery: query,
        validationPassed: true,
        processingTime: performance.now(),
        warnings: finalValidation.warnings || []
      };
    } catch (error) {
      console.error('[QueryParser] Error during analysis:', error);
      return {
        intent: 'unknown',
        parameters: {},
        confidence: 0,
        query: normalizedQuery,
        originalQuery: query,
        error: `Analysis error: ${error.message}`,
        validationPassed: false
      };
    }
  }

  /**
   * Rozpoznaje główną intencję zapytania
   * @param {string} query - Znormalizowane zapytanie
   * @returns {string} - Typ intencji
   */
  static recognizeIntent(query) {
    // Receptury - zliczanie
    if (this.patterns.count.test(query) && this.patterns.recipes.test(query)) {
      if (this.patterns.recipeWeight.test(query)) {
        return 'recipe_count_by_weight';
      }
      if (this.patterns.ingredients.test(query)) {
        return 'recipe_count_by_ingredients';
      }
      return 'recipe_count';
    }

    // Receptury - ogólne
    if (this.patterns.recipes.test(query)) {
      if (this.patterns.recipeWeight.test(query)) {
        return 'recipe_weight_analysis';
      }
      return 'recipe_info';
    }

    // Magazyn - zliczanie
    if (this.patterns.count.test(query) && this.patterns.inventory.test(query)) {
      if (this.patterns.lowStock.test(query)) {
        return 'inventory_count_low_stock';
      }
      return 'inventory_count';
    }

    // Magazyn - stany
    if (this.patterns.inventory.test(query)) {
      if (this.patterns.lowStock.test(query)) {
        return 'inventory_low_stock';
      }
      if (this.patterns.highStock.test(query)) {
        return 'inventory_high_stock';
      }
      return 'inventory_status';
    }

    // Zamówienia - zliczanie
    if (this.patterns.count.test(query) && this.patterns.orders.test(query)) {
      if (this.patterns.customerOrders.test(query)) {
        return 'customer_orders_count';
      }
      return 'orders_count';
    }

    // Zamówienia - ogólne
    if (this.patterns.orders.test(query)) {
      if (this.patterns.status.test(query)) {
        return 'orders_status';
      }
      return 'orders_info';
    }

    // Zamówienia zakupu
    if (this.patterns.purchaseOrders.test(query)) {
      if (this.patterns.count.test(query)) {
        return 'purchase_orders_count';
      }
      return 'purchase_orders_info';
    }

    // Produkcja - zliczanie
    if (this.patterns.count.test(query) && this.patterns.production.test(query)) {
      // Sprawdź czy pytanie dotyczy konkretnego statusu
      if (this.patterns.inProgress.test(query)) {
        return 'production_count_in_progress';
      }
      if (this.patterns.onHold.test(query)) {
        return 'production_count_on_hold';
      }
      if (this.patterns.planned.test(query)) {
        return 'production_count_planned';
      }
      if (this.patterns.finished.test(query)) {
        return 'production_count_finished';
      }
      return 'production_count';
    }

    // Produkcja - konkretne statusy
    if (this.patterns.production.test(query)) {
      if (this.patterns.inProgress.test(query)) {
        return 'production_in_progress';
      }
      if (this.patterns.onHold.test(query)) {
        return 'production_on_hold';
      }
      if (this.patterns.planned.test(query) || 
          (this.patterns.thisMonth.test(query) || this.patterns.nextMonth.test(query) || 
           this.patterns.thisWeek.test(query) || this.patterns.nextWeek.test(query) || 
           this.patterns.soon.test(query))) {
        return 'production_planned';
      }
      if (this.patterns.finished.test(query)) {
        return 'production_finished';
      }
      if (this.patterns.status.test(query)) {
        return 'production_status';
      }
      return 'production_info';
    }

    // Dostawcy
    if (this.patterns.suppliers.test(query)) {
      if (this.patterns.count.test(query)) {
        return 'suppliers_count';
      }
      return 'suppliers_info';
    }

    // Klienci
    if (this.patterns.customers.test(query)) {
      if (this.patterns.count.test(query)) {
        return 'customers_count';
      }
      return 'customers_info';
    }

    // NOWE: Zaawansowane zapytania analityczne
    
    // Analizy trendów
    if (this.patterns.trends.test(query) || this.patterns.analytics.test(query)) {
      if (this.patterns.inventory.test(query)) {
        return 'analytics_inventory_trends';
      }
      if (this.patterns.orders.test(query)) {
        return 'analytics_orders_trends';
      }
      if (this.patterns.production.test(query)) {
        return 'analytics_production_trends';
      }
      if (this.patterns.recipes.test(query)) {
        return 'analytics_recipes_trends';
      }
      if (this.patterns.comparison_advanced.test(query)) {
        return 'analytics_comparison';
      }
      return 'analytics_general_trends';
    }

    // Prognozowanie
    if (this.patterns.forecasting.test(query)) {
      if (this.patterns.inventory.test(query)) {
        return 'prediction_inventory';
      }
      if (this.patterns.production.test(query)) {
        return 'prediction_production';
      }
      if (this.patterns.orders.test(query)) {
        return 'prediction_orders';
      }
      return 'prediction_general';
    }

    // Optymalizacja
    if (this.patterns.optimization.test(query)) {
      if (this.patterns.inventory.test(query)) {
        return 'optimization_inventory';
      }
      if (this.patterns.production.test(query)) {
        return 'optimization_production';
      }
      if (this.patterns.costs.test(query)) {
        return 'optimization_costs';
      }
      return 'optimization_general';
    }

    // Rekomendacje
    if (this.patterns.recommendations.test(query)) {
      if (this.patterns.inventory.test(query)) {
        return 'recommendations_inventory';
      }
      if (this.patterns.production.test(query)) {
        return 'recommendations_production';
      }
      if (this.patterns.suppliers.test(query)) {
        return 'recommendations_suppliers';
      }
      return 'recommendations_general';
    }

    // Wydajność i benchmarking
    if (this.patterns.performance.test(query) || this.patterns.benchmarking.test(query)) {
      if (this.patterns.production.test(query)) {
        return 'performance_production';
      }
      if (this.patterns.inventory.test(query)) {
        return 'performance_inventory';
      }
      return 'performance_general';
    }

    // Analiza ryzyka i jakości
    if (this.patterns.risks.test(query) || this.patterns.problems.test(query)) {
      return 'risk_analysis';
    }
    
    // Monitoring systemu
    if (this.patterns.monitoring.test(query)) {
      return 'system_monitoring';
    }

    // Planowanie
    if (this.patterns.planning.test(query)) {
      if (this.patterns.production.test(query)) {
        return 'planning_production';
      }
      if (this.patterns.capacity.test(query)) {
        return 'planning_capacity';
      }
      return 'planning_general';
    }

    // Analizy finansowe
    if (this.patterns.costs.test(query) || this.patterns.profitability.test(query)) {
      if (this.patterns.recipes.test(query)) {
        return 'financial_recipes';
      }
      if (this.patterns.production.test(query)) {
        return 'financial_production';
      }
      return 'financial_analysis';
    }

    // Głęboka analiza (kompleksowe zapytania)
    if (query.length > 50 && (this.patterns.analytics.test(query) || this.patterns.comparison_advanced.test(query))) {
      return 'deep_analysis';
    }

    // Przegląd systemu
    if (/przegląd.*system|podsumowanie.*system|overview|summary/i.test(query)) {
      return 'system_summary';
    }

    // Domyślna intencja
    return 'general_info';
  }

  /**
   * Wyciąga parametry z zapytania
   * @param {string} query - Znormalizowane zapytanie
   * @returns {Object} - Obiekt z parametrami
   */
  static extractParameters(query) {
    const parameters = {};

    // Wyciągnij liczby
    const numbers = query.match(this.patterns.numbers);
    if (numbers) {
      parameters.numbers = numbers.map(num => parseFloat(num));
    }

    // Określ operator porównania
    if (this.patterns.operators.test(query)) {
      if (/ponad|powyżej|więcej|>/i.test(query)) {
        parameters.operator = '>';
      } else if (/mniej|poniżej|</i.test(query)) {
        parameters.operator = '<';
      } else if (/równa|=|wynosi/i.test(query)) {
        parameters.operator = '=';
      }
    }

    // Określ jednostki wagi
    if (this.patterns.weightUnits.test(query)) {
      if (/kilogram|kg/i.test(query)) {
        parameters.weightUnit = 'kg';
      } else if (/gram|gr|g/i.test(query)) {
        parameters.weightUnit = 'g';
      }
    }

    // Określ status
    if (this.patterns.status.test(query)) {
      if (this.patterns.active.test(query)) {
        parameters.status = 'active';
      } else if (this.patterns.completed.test(query)) {
        parameters.status = 'completed';
      } else if (this.patterns.pending.test(query)) {
        parameters.status = 'pending';
      }
    }

    // Określ statusy produkcji MRP
    if (this.patterns.inProgress.test(query)) {
      parameters.productionStatus = 'w trakcie';
    } else if (this.patterns.onHold.test(query)) {
      parameters.productionStatus = 'wstrzymane';
    } else if (this.patterns.planned.test(query)) {
      parameters.productionStatus = 'zaplanowane';
    } else if (this.patterns.finished.test(query)) {
      parameters.productionStatus = 'zakończone';
    }

    // Określ parametry czasowe dla planowania
    if (this.patterns.thisMonth.test(query)) {
      parameters.timePeriod = 'thisMonth';
    } else if (this.patterns.nextMonth.test(query)) {
      parameters.timePeriod = 'nextMonth';
    } else if (this.patterns.thisWeek.test(query)) {
      parameters.timePeriod = 'thisWeek';
    } else if (this.patterns.nextWeek.test(query)) {
      parameters.timePeriod = 'nextWeek';
    } else if (this.patterns.soon.test(query)) {
      parameters.timePeriod = 'soon';
    }

    // Określ typ porównania
    if (this.patterns.comparison.test(query)) {
      if (/najw|najwięc|top|max/i.test(query)) {
        parameters.comparison = 'max';
      } else if (/najmn|najmniej|bottom|min/i.test(query)) {
        parameters.comparison = 'min';
      }
    }

    // Kombinuj liczby z operatorami dla filtrów
    if (parameters.numbers && parameters.operator) {
      parameters.filters = [];
      parameters.numbers.forEach(num => {
        // Konwertuj jednostki wagi na gramy
        let value = num;
        if (parameters.weightUnit === 'kg') {
          value = num * 1000; // konwertuj kg na gramy
        }
        
        parameters.filters.push({
          operator: parameters.operator,
          value: value,
          originalValue: num,
          unit: parameters.weightUnit || 'g'
        });
      });
    }

    return parameters;
  }

  /**
   * Oblicza poziom pewności rozpoznania
   * @param {string} intent - Rozpoznana intencja
   * @param {Object} parameters - Wyciągnięte parametry
   * @param {string} query - Zapytanie
   * @returns {number} - Poziom pewności (0-1)
   */
  static calculateConfidence(intent, parameters, query) {
    let confidence = 0.5; // Bazowa pewność

    // Zwiększ pewność dla rozpoznanych wzorców
    if (intent !== 'unknown' && intent !== 'general_info') {
      confidence += 0.3;
    }

    // Zwiększ pewność dla wyciągniętych parametrów
    if (Object.keys(parameters).length > 0) {
      confidence += 0.2;
    }

    // Zwiększ pewność dla konkretnych liczb
    if (parameters.numbers && parameters.numbers.length > 0) {
      confidence += 0.1;
    }

    // Zwiększ pewność dla operatorów
    if (parameters.operator) {
      confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Sprawdza czy zapytanie dotyczy konkretnej kolekcji danych
   * @param {string} intent - Intencja zapytania
   * @returns {Array} - Lista kolekcji potrzebnych do odpowiedzi
   */
  static getRequiredCollections(intent) {
    const collectionMap = {
      // Podstawowe zapytania
      'recipe_count': ['recipes'],
      'recipe_count_by_weight': ['recipes'],
      'recipe_count_by_ingredients': ['recipes'],
      'recipe_weight_analysis': ['recipes'],
      'recipe_info': ['recipes'],
      
      'inventory_count': ['inventory'],
      'inventory_count_low_stock': ['inventory'],
      'inventory_low_stock': ['inventory'],
      'inventory_high_stock': ['inventory'],
      'inventory_status': ['inventory'],
      
      'orders_count': ['orders'],
      'customer_orders_count': ['orders', 'customers'],
      'orders_status': ['orders'],
      'orders_info': ['orders', 'customers'],
      
      'purchase_orders_count': ['purchaseOrders'],
      'purchase_orders_info': ['purchaseOrders', 'suppliers'],
      
      'production_count': ['productionTasks'],
      'production_count_in_progress': ['productionTasks'],
      'production_count_on_hold': ['productionTasks'],
      'production_count_planned': ['productionTasks'],
      'production_count_finished': ['productionTasks'],
      'production_in_progress': ['productionTasks'],
      'production_on_hold': ['productionTasks'],
      'production_planned': ['productionTasks'],
      'production_finished': ['productionTasks'],
      'production_status': ['productionTasks'],
      'production_info': ['productionTasks', 'recipes'],
      
      'suppliers_count': ['suppliers'],
      'suppliers_info': ['suppliers'],
      
      'customers_count': ['customers'],
      'customers_info': ['customers'],
      
      'general_info': ['inventory', 'orders', 'productionTasks', 'recipes'],
      
      // NOWE: Zaawansowane zapytania analityczne
      // Analizy trendów - wymagają danych historycznych
      'analytics_inventory_trends': ['inventory', 'inventoryHistory', 'batchHistory'],
      'analytics_orders_trends': ['orders', 'orderHistory', 'customers'],
      'analytics_production_trends': ['productionTasks', 'productionHistory', 'recipes'],
      'analytics_recipes_trends': ['recipes', 'recipeUsage', 'productionTasks'],
      'analytics_general_trends': ['inventory', 'orders', 'productionTasks', 'suppliers'],
      'analytics_comparison': ['inventory', 'orders', 'productionTasks', 'recipes'],
      
      // Prognozowanie - potrzeba szerokiego kontekstu
      'prediction_inventory': ['inventory', 'orders', 'productionTasks', 'suppliers'],
      'prediction_production': ['productionTasks', 'orders', 'recipes', 'inventory'],
      'prediction_orders': ['orders', 'customers', 'inventory', 'seasonality'],
      'prediction_general': ['inventory', 'orders', 'productionTasks', 'customers'],
      
      // Optymalizacja
      'optimization_inventory': ['inventory', 'orders', 'suppliers', 'costs'],
      'optimization_production': ['productionTasks', 'recipes', 'inventory', 'capacity'],
      'optimization_costs': ['recipes', 'suppliers', 'inventory', 'costs'],
      'optimization_general': ['inventory', 'orders', 'productionTasks', 'suppliers'],
      
      // Rekomendacje
      'recommendations_inventory': ['inventory', 'orders', 'suppliers', 'usage'],
      'recommendations_production': ['productionTasks', 'recipes', 'capacity', 'orders'],
      'recommendations_suppliers': ['suppliers', 'purchaseOrders', 'costs'],
      'recommendations_general': ['inventory', 'orders', 'suppliers', 'customers'],
      
      // Wydajność i benchmarking
      'performance_production': ['productionTasks', 'efficiency', 'capacity', 'targets'],
      'performance_inventory': ['inventory', 'turnover', 'costs', 'usage'],
      'performance_general': ['inventory', 'orders', 'productionTasks', 'kpis'],
      
      // Ryzyka i jakość
      'risk_analysis': ['inventory', 'suppliers', 'dependencies'],
      
      // Monitoring i planowanie
      'system_monitoring': ['systemHealth', 'performance', 'alerts', 'metrics'],
      'planning_production': ['productionTasks', 'capacity', 'orders', 'resources'],
      'planning_capacity': ['capacity', 'demands', 'resources', 'constraints'],
      'planning_general': ['orders', 'inventory', 'production', 'resources'],
      
      // Finanse
      'financial_recipes': ['recipes', 'costs', 'materials', 'profitability'],
      'financial_production': ['productionTasks', 'costs', 'efficiency', 'margins'],
      'financial_analysis': ['costs', 'revenues', 'profitability', 'budgets'],
      
      // Kompleksowe analizy
      'deep_analysis': ['inventory', 'orders', 'productionTasks', 'recipes', 'suppliers', 'customers'],
      'system_summary': ['summary', 'kpis', 'status', 'alerts']
    };

    return collectionMap[intent] || ['inventory', 'orders', 'productionTasks', 'recipes'];
  }

  /**
   * NOWA METODA: Analizuje zaawansowane zapytanie z dodatkowymi parametrami
   * @param {string} query - Zapytanie użytkownika
   * @returns {Object} - Rozszerzona analiza z dodatkową logiką
   */
  static analyzeAdvancedQuery(query) {
    const basicAnalysis = this.analyzeQuery(query);
    
    // Dodaj rozszerzone informacje
    const advancedInfo = {
      ...basicAnalysis,
      isAdvanced: this.isAdvancedQuery(basicAnalysis.intent),
      complexity: this.assessComplexity(query, basicAnalysis),
      estimatedProcessingTime: this.estimateProcessingTime(basicAnalysis.intent),
      requiresHistoricalData: this.requiresHistoricalData(basicAnalysis.intent),
      timeParameters: this.extractTimeParameters(query),
      analysisType: this.getAnalysisType(basicAnalysis.intent)
    };
    
    return advancedInfo;
  }

  /**
   * Sprawdza czy zapytanie jest zaawansowane
   * @param {string} intent - Intencja zapytania
   * @returns {boolean} - Czy zapytanie jest zaawansowane
   */
  static isAdvancedQuery(intent) {
    const advancedIntents = [
      'analytics_', 'prediction_', 'optimization_', 'recommendations_',
      'performance_', 'risk_analysis', 'planning_',
      'financial_', 'deep_analysis', 'system_monitoring'
    ];
    
    return advancedIntents.some(prefix => intent.startsWith(prefix));
  }

  /**
   * Ocenia złożoność zapytania
   * @param {string} query - Zapytanie
   * @param {Object} analysis - Podstawowa analiza
   * @returns {string} - Poziom złożoności
   */
  static assessComplexity(query, analysis) {
    let complexityScore = 0;
    
    // Długość zapytania
    if (query.length > 100) complexityScore += 2;
    else if (query.length > 50) complexityScore += 1;
    
    // Liczba parametrów
    complexityScore += Object.keys(analysis.parameters).length;
    
    // Typ intencji
    if (this.isAdvancedQuery(analysis.intent)) complexityScore += 3;
    if (analysis.intent.includes('trends') || analysis.intent.includes('prediction')) complexityScore += 2;
    
    // Klasyfikacja
    if (complexityScore >= 6) return 'complex';
    if (complexityScore >= 3) return 'medium';
    return 'simple';
  }

  /**
   * Szacuje czas przetwarzania
   * @param {string} intent - Intencja zapytania
   * @returns {string} - Szacowany czas
   */
  static estimateProcessingTime(intent) {
    if (intent.includes('count') && !this.isAdvancedQuery(intent)) {
      return 'fast'; // < 1s
    }
    
    if (intent.includes('prediction') || intent.includes('deep_analysis')) {
      return 'slow'; // > 10s
    }
    
    if (this.isAdvancedQuery(intent)) {
      return 'medium'; // 2-10s
    }
    
    return 'fast';
  }

  /**
   * Sprawdza czy zapytanie wymaga danych historycznych
   * @param {string} intent - Intencja zapytania
   * @returns {boolean} - Czy wymaga danych historycznych
   */
  static requiresHistoricalData(intent) {
    const historicalIntents = [
      'analytics_', 'prediction_', 'trends', 'comparison', 'performance_'
    ];
    
    return historicalIntents.some(pattern => intent.includes(pattern));
  }

  /**
   * Wyciąga parametry czasowe z zapytania
   * @param {string} query - Zapytanie
   * @returns {Object} - Parametry czasowe
   */
  static extractTimeParameters(query) {
    const timeParams = {};
    
    // Okresy
    if (/ostatni.*tydzień|last.*week/i.test(query)) timeParams.lastWeek = true;
    if (/ostatni.*miesiąc|last.*month/i.test(query)) timeParams.lastMonth = true;
    if (/ostatni.*rok|last.*year/i.test(query)) timeParams.lastYear = true;
    if (/ostatni.*kwartał|last.*quarter/i.test(query)) timeParams.lastQuarter = true;
    
    // Porównania czasowe
    if (/rok do roku|year over year/i.test(query)) timeParams.yearOverYear = true;
    if (/miesiąc do miesiąc|month over month/i.test(query)) timeParams.monthOverMonth = true;
    
    return timeParams;
  }

  /**
   * Określa typ analizy
   * @param {string} intent - Intencja zapytania
   * @returns {string} - Typ analizy
   */
  static getAnalysisType(intent) {
    if (intent.includes('trends') || intent.includes('analytics')) return 'trend_analysis';
    if (intent.includes('prediction') || intent.includes('forecast')) return 'predictive_analysis';
    if (intent.includes('optimization')) return 'optimization_analysis';
    if (intent.includes('recommendations')) return 'recommendation_engine';
    if (intent.includes('performance') || intent.includes('benchmark')) return 'performance_analysis';
    if (intent.includes('risk')) return 'risk_assessment';
    if (intent.includes('financial') || intent.includes('cost')) return 'financial_analysis';
    
    return 'descriptive_analysis';
  }

  // ==================== INPUT VALIDATION ====================

  /**
   * Waliduje wejściowe zapytanie użytkownika
   * @param {*} query - Zapytanie do walidacji
   * @returns {Object} - Wynik walidacji
   */
  static validateInput(query) {
    // Sprawdź czy query istnieje
    if (!query) {
      return {
        isValid: false,
        reason: 'Brak zapytania'
      };
    }

    // Sprawdź typ danych
    if (typeof query !== 'string') {
      return {
        isValid: false,
        reason: `Nieprawidłowy typ danych: ${typeof query}, oczekiwano string`
      };
    }

    // Sprawdź długość
    const trimmedQuery = query.trim();
    if (trimmedQuery.length === 0) {
      return {
        isValid: false,
        reason: 'Puste zapytanie'
      };
    }

    if (trimmedQuery.length < 3) {
      return {
        isValid: false,
        reason: 'Zapytanie zbyt krótkie (minimum 3 znaki)'
      };
    }

    if (trimmedQuery.length > 1000) {
      return {
        isValid: false,
        reason: 'Zapytanie zbyt długie (maksimum 1000 znaków)'
      };
    }

    // Sprawdź czy zapytanie zawiera tylko białe znaki lub specjalne znaki
    const hasAlphanumeric = /[a-zA-Z0-9]/.test(trimmedQuery);
    if (!hasAlphanumeric) {
      return {
        isValid: false,
        reason: 'Zapytanie nie zawiera prawidłowych znaków alfanumerycznych'
      };
    }

    // Sprawdź podejrzane wzorce (potencjalnie niebezpieczne)
    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /data:text\/html/i,
      /vbscript:/i
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(trimmedQuery)) {
        return {
          isValid: false,
          reason: 'Zapytanie zawiera podejrzane wzorce'
        };
      }
    }

    // Sprawdź czy zapytanie nie jest po prostu serią powtarzających się znaków
    const uniqueChars = new Set(trimmedQuery.toLowerCase()).size;
    if (uniqueChars < 3 && trimmedQuery.length > 10) {
      return {
        isValid: false,
        reason: 'Zapytanie zawiera zbyt mało unikalnych znaków'
      };
    }

    return {
      isValid: true,
      reason: 'Walidacja przeszła pomyślnie'
    };
  }

  /**
   * Sanityzuje i normalizuje zapytanie
   * @param {string} query - Zapytanie do normalizacji
   * @returns {string} - Znormalizowane zapytanie
   */
  static sanitizeAndNormalize(query) {
    let normalized = query;

    // Usuń potencjalnie niebezpieczne znaki
    normalized = normalized.replace(/<[^>]*>/g, ''); // HTML tags
    normalized = normalized.replace(/[<>\"']/g, ''); // Potencjalnie niebezpieczne znaki

    // Normalizuj białe znaki
    normalized = normalized.replace(/\s+/g, ' '); // Wielokrotne spacje na jedną
    normalized = normalized.trim();

    // Konwertuj na małe litery
    normalized = normalized.toLowerCase();

    // Normalizuj polskie znaki diakrytyczne dla lepszego dopasowania
    const diacriticsMap = {
      'ą': 'a', 'ć': 'c', 'ę': 'e', 'ł': 'l', 'ń': 'n', 'ó': 'o', 'ś': 's', 'ź': 'z', 'ż': 'z'
    };

    // Stwórz wersję bez polskich znaków dla fallback matching
    let normalizedFallback = normalized;
    for (const [accented, plain] of Object.entries(diacriticsMap)) {
      normalizedFallback = normalizedFallback.replace(new RegExp(accented, 'g'), plain);
    }

    // Zwróć oryginał z polskimi znakami, ale zapisz fallback dla późniejszego użycia
    this._lastNormalizedFallback = normalizedFallback;

    return normalized;
  }

  /**
   * Waliduje wyniki analizy i wprowadza korekty
   * @param {string} intent - Rozpoznana intencja
   * @param {Object} parameters - Wyciągnięte parametry
   * @param {number} confidence - Poziom pewności
   * @returns {Object} - Zwalidowane wyniki
   */
  static validateResults(intent, parameters, confidence) {
    const warnings = [];
    let validatedIntent = intent;
    let validatedParameters = { ...parameters };
    let validatedConfidence = confidence;

    // Walidacja intencji
    if (!intent || typeof intent !== 'string') {
      warnings.push('Nieprawidłowa intencja, ustawiono domyślną');
      validatedIntent = 'general_info';
      validatedConfidence = Math.min(validatedConfidence, 0.3);
    }

    // Walidacja parametrów
    if (parameters && typeof parameters === 'object') {
      // Sprawdź liczby
      if (parameters.numbers && Array.isArray(parameters.numbers)) {
        const validNumbers = parameters.numbers.filter(num => 
          typeof num === 'number' && !isNaN(num) && isFinite(num)
        );
        
        if (validNumbers.length !== parameters.numbers.length) {
          warnings.push('Usunięto nieprawidłowe liczby z parametrów');
          validatedParameters.numbers = validNumbers;
        }

        // Sprawdź rozsądne zakresy liczb
        const outOfRangeNumbers = validNumbers.filter(num => num < 0 || num > 1000000);
        if (outOfRangeNumbers.length > 0) {
          warnings.push('Niektóre liczby wydają się być poza rozsądnym zakresem');
        }
      }

      // Walidacja filtrów
      if (parameters.filters && Array.isArray(parameters.filters)) {
        const validFilters = parameters.filters.filter(filter => 
          filter && 
          typeof filter === 'object' && 
          filter.operator && 
          typeof filter.value === 'number' &&
          !isNaN(filter.value)
        );

        if (validFilters.length !== parameters.filters.length) {
          warnings.push('Usunięto nieprawidłowe filtry');
          validatedParameters.filters = validFilters;
        }
      }

      // Walidacja statusów produkcji
      if (parameters.productionStatus) {
        const validStatuses = ['w trakcie', 'wstrzymane', 'zaplanowane', 'zakończone'];
        if (!validStatuses.includes(parameters.productionStatus)) {
          warnings.push('Nieprawidłowy status produkcji, usunięto z parametrów');
          delete validatedParameters.productionStatus;
        }
      }

      // Walidacja okresów czasowych
      if (parameters.timePeriod) {
        const validPeriods = ['thisMonth', 'nextMonth', 'thisWeek', 'nextWeek', 'soon'];
        if (!validPeriods.includes(parameters.timePeriod)) {
          warnings.push('Nieprawidłowy okres czasowy, usunięto z parametrów');
          delete validatedParameters.timePeriod;
        }
      }
    } else if (parameters) {
      warnings.push('Parametry nie są obiektem, zresetowano');
      validatedParameters = {};
    }

    // Walidacja confidence
    if (typeof confidence !== 'number' || isNaN(confidence) || confidence < 0 || confidence > 1) {
      warnings.push('Nieprawidłowy poziom pewności, ustawiono domyślny');
      validatedConfidence = 0.5;
    }

    // Sprawdź spójność intencji z parametrami
    if (validatedIntent.includes('count') && (!parameters.numbers || parameters.numbers.length === 0)) {
      // To jest OK - zapytania count nie muszą mieć liczb
    }

    if (validatedIntent.includes('weight') && !parameters.weightUnit && !parameters.filters) {
      warnings.push('Zapytanie o wagę bez parametrów wagowych - obniżono pewność');
      validatedConfidence = Math.min(validatedConfidence, 0.6);
    }

    return {
      intent: validatedIntent,
      parameters: validatedParameters,
      confidence: validatedConfidence,
      warnings
    };
  }

  /**
   * Sprawdza czy zapytanie jest potencjalnie problematyczne
   * @param {string} query - Zapytanie do sprawdzenia
   * @returns {Object} - Informacje o potencjalnych problemach
   */
  static analyzeQuerySafety(query) {
    const issues = [];
    const lowerQuery = query.toLowerCase();

    // Sprawdź długość
    if (query.length > 500) {
      issues.push({
        type: 'length_warning',
        message: 'Bardzo długie zapytanie może wpłynąć na wydajność'
      });
    }

    // Sprawdź złożoność
    const wordCount = query.split(/\s+/).length;
    if (wordCount > 50) {
      issues.push({
        type: 'complexity_warning', 
        message: 'Bardzo złożone zapytanie - rozważ podział na mniejsze części'
      });
    }

    // Sprawdź czy zapytanie zawiera wiele pytań
    const questionMarks = (query.match(/\?/g) || []).length;
    if (questionMarks > 3) {
      issues.push({
        type: 'multiple_questions',
        message: 'Zapytanie zawiera wiele pytań - najlepsze wyniki dla jednego pytania na raz'
      });
    }

    // Sprawdź czy zapytanie nie jest zbyt ogólne
    const veryGeneralPatterns = [
      /^(co|jak|gdzie|kiedy|dlaczego)\s*\?*$/i,
      /^(powiedz mi|pokaż|wyświetl)\s*$/i,
      /^(wszystko|wszystkie|całość)\s*$/i
    ];

    if (veryGeneralPatterns.some(pattern => pattern.test(query.trim()))) {
      issues.push({
        type: 'too_general',
        message: 'Zapytanie jest bardzo ogólne - sprecyzuj czego szukasz'
      });
    }

    return {
      isSafe: issues.length === 0,
      issues,
      riskLevel: issues.length === 0 ? 'low' : issues.length < 3 ? 'medium' : 'high'
    };
  }
}
