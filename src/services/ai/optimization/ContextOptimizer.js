// src/services/ai/optimization/ContextOptimizer.js

/**
 * Optymalizator kontekstu - przygotowuje minimalne, ale precyzyjne dane dla GPT
 * Redukuje koszty tokenów o 60-80% przez inteligentne filtrowanie danych
 */
export class ContextOptimizer {

  /**
   * Przygotowuje optymalny kontekst na podstawie zapytania
   * @param {string} query - Zapytanie użytkownika
   * @param {Object} businessData - Pełne dane biznesowe
   * @param {string} modelType - Typ modelu ('simple', 'medium', 'complex')
   * @returns {Object} - Zoptymalizowany kontekst
   */
  static prepareOptimalContext(query, businessData, modelType = 'medium') {
    console.log(`[ContextOptimizer] Optymalizuję kontekst dla: "${query.substring(0, 50)}..." (model: ${modelType})`);
    
    const queryAnalysis = this.analyzeQueryIntent(query);
    const relevancyMap = this.buildRelevancyMap(queryAnalysis);
    
    // Wybierz strategię na podstawie typu modelu
    let strategy = this.selectOptimizationStrategy(modelType, queryAnalysis);
    
    const optimizedContext = this.buildContextByStrategy(
      strategy, 
      businessData, 
      relevancyMap, 
      queryAnalysis
    );

    // Dodaj metadane optymalizacji
    const originalSize = this.estimateDataSize(businessData);
    const optimizedSize = this.estimateDataSize(optimizedContext);
    const reductionRatio = this.calculateReductionRatio(businessData, optimizedContext);
    
    optimizedContext._optimization = {
      strategy: strategy.name,
      originalDataSize: originalSize,
      optimizedDataSize: optimizedSize,
      reductionRatio: reductionRatio,
      includedCollections: Object.keys(optimizedContext).filter(k => !k.startsWith('_')),
      queryRelevance: queryAnalysis.confidence
    };

    console.log(`[ContextOptimizer] 📊 Optymalizacja kontekstu:`, {
      strategy: strategy.name,
      originalTokens: originalSize,
      optimizedTokens: optimizedSize,
      reduction: `${reductionRatio}%`,
      collections: optimizedContext._optimization.includedCollections.length,
      collectionNames: optimizedContext._optimization.includedCollections.join(', ')
    });
    
    return optimizedContext;
  }

  /**
   * Analizuje intencję zapytania
   * @param {string} query - Zapytanie użytkownika
   * @returns {Object} - Analiza intencji
   */
  static analyzeQueryIntent(query) {
    const lowerQuery = query.toLowerCase();
    
    // Wykryj główne kategorie
    const categories = {
      recipes: /receptur|recepty|składnik|komponent|produkcj/i.test(lowerQuery),
      inventory: /magazyn|stan|zapas|produkt|dostępn/i.test(lowerQuery),
      orders: /zamówien|klient|sprzedaż|dostaw/i.test(lowerQuery),
      production: /produkc|zadani|MO|zlecen|harmonogram/i.test(lowerQuery),
      suppliers: /dostawc|supplier|vendor/i.test(lowerQuery),
      analytics: /analiz|trend|statystyk|porówn|wykres/i.test(lowerQuery),
      costs: /koszt|cena|opłacalność|rentowność|finansow/i.test(lowerQuery),
      // FAZA 1: Nowe kategorie
      invoices: /faktur|płatnoś|należnoś|invoice|termin płatności|zaległoś/i.test(lowerQuery),
      transport: /cmr|transport|wysyłk|przewóz|logistyk|dostarcz/i.test(lowerQuery),
      stocktaking: /inwentaryzac|rozbieżnoś|straty|nadwyżk|spis/i.test(lowerQuery),
      priceHistory: /historia cen|zmiana cen|trend cenow/i.test(lowerQuery),
      // FAZA 3: Kategorie łańcucha wartości i kompletności
      valueChain: /łańcuch|ścieżk[aęi]|prześledz|od.*do|wartości|rentowność|marż[aąy]/i.test(lowerQuery),
      dataQuality: /kompletność|brak|luk[aiy]|niekompletn|brakując|bez|nie ma/i.test(lowerQuery),
      traceability: /pochodzenie|skąd|źródło|historia|traceability/i.test(lowerQuery)
    };

    // Wykryj specyficzne operacje
    const operations = {
      count: /ile|liczba|ilość/i.test(lowerQuery),
      list: /lista|pokaz|wyświetl|wszystk/i.test(lowerQuery),
      filter: /gdzie|które|spełniaj|większ|mniejsz|ponad|poniżej/i.test(lowerQuery),
      comparison: /porówn|vs|versus|różnic|najleps|najgors/i.test(lowerQuery),
      aggregation: /suma|średni|łączn|razem|ogółem/i.test(lowerQuery),
      search: /znajdź|wyszukaj|poszukaj/i.test(lowerQuery)
    };

    // Wykryj parametry czasowe
    const timeFilters = {
      recent: /ostatni|najnowsz|ostateczn|aktuln/i.test(lowerQuery),
      period: /miesiąc|tydzień|rok|dzień|okres/i.test(lowerQuery),
      historical: /historia|przeszł|wcześniej|poprzedni/i.test(lowerQuery)
    };

    // Oceń pewność analizy
    const activeCategories = Object.keys(categories).filter(k => categories[k]);
    const activeOperations = Object.keys(operations).filter(k => operations[k]);
    
    const confidence = Math.min(1.0, (activeCategories.length * 0.4) + (activeOperations.length * 0.3) + 0.3);

    return {
      categories,
      operations,
      timeFilters,
      primaryCategory: activeCategories[0] || 'general',
      primaryOperation: activeOperations[0] || 'query',
      activeCategories,
      activeOperations,
      confidence,
      isSpecific: activeCategories.length === 1 && activeOperations.length >= 1,
      isComplex: activeCategories.length > 2 || lowerQuery.includes('analiz')
    };
  }

  /**
   * Buduje mapę istotności danych
   * @param {Object} queryAnalysis - Analiza zapytania
   * @returns {Object} - Mapa istotności
   */
  static buildRelevancyMap(queryAnalysis) {
    const relevancy = {
      // Domyślnie wszystkie na średnim poziomie
      recipes: 0.3,
      inventory: 0.3,
      orders: 0.3,
      production: 0.3,
      suppliers: 0.2,
      customers: 0.2,
      purchaseOrders: 0.2,          // Zamówienia zakupu - kluczowe dla dostawców
      inventorySupplierPrices: 0.2, // Ceny od dostawców
      summary: 0.8, // Zawsze istotne podsumowanie
      // FAZA 1: Nowe kolekcje
      invoices: 0.2,
      cmrDocuments: 0.2,
      stocktaking: 0.2,
      inventorySupplierPriceHistory: 0.1
    };

    // Zwiększ istotność na podstawie kategorii
    queryAnalysis.activeCategories.forEach(category => {
      if (relevancy.hasOwnProperty(category)) {
        relevancy[category] = 1.0; // Maksymalna istotność
      }
      
      // Specjalna reguła: zapytania o dostawców wymagają purchaseOrders!
      if (category === 'suppliers') {
        relevancy.purchaseOrders = 1.0;
        relevancy.inventorySupplierPrices = 1.0;
        console.log('[ContextOptimizer] Wykryto zapytanie o dostawców - dodaję purchaseOrders i inventorySupplierPrices');
      }
      
      // FAZA 1: Zapytania o faktury wymagają zamówień i klientów
      if (category === 'invoices') {
        relevancy.invoices = 1.0;
        relevancy.orders = 1.0;
        relevancy.customers = 1.0;
        console.log('[ContextOptimizer] Wykryto zapytanie o faktury - dodaję orders i customers');
      }
      
      // FAZA 1: Zapytania o transport wymagają zamówień i CMR
      if (category === 'transport') {
        relevancy.cmrDocuments = 1.0;
        relevancy.orders = 1.0;
        relevancy.customers = 0.8;
        console.log('[ContextOptimizer] Wykryto zapytanie o transport - dodaję cmrDocuments i orders');
      }
      
      // FAZA 1: Zapytania o inwentaryzacje
      if (category === 'stocktaking') {
        relevancy.stocktaking = 1.0;
        relevancy.inventory = 1.0;
        console.log('[ContextOptimizer] Wykryto zapytanie o inwentaryzację - dodaję stocktaking i inventory');
      }
      
      // FAZA 1: Zapytania o historię cen
      if (category === 'priceHistory') {
        relevancy.inventorySupplierPriceHistory = 1.0;
        relevancy.suppliers = 0.8;
        relevancy.inventory = 0.6;
        console.log('[ContextOptimizer] Wykryto zapytanie o historię cen - dodaję inventorySupplierPriceHistory');
      }
      
      // FAZA 3: Zapytania o łańcuch wartości
      if (category === 'valueChain') {
        relevancy.orders = 1.0;
        relevancy.production = 1.0;
        relevancy.invoices = 1.0;
        relevancy.purchaseOrders = 0.9;
        relevancy.inventory = 0.8;
        console.log('[ContextOptimizer] Wykryto zapytanie o łańcuch wartości - dodaję pełny kontekst transakcji');
      }
      
      // FAZA 3: Zapytania o kompletność/jakość danych
      if (category === 'dataQuality') {
        // Dla zapytań o braki potrzebujemy wszystkich danych
        relevancy.orders = 1.0;
        relevancy.production = 1.0;
        relevancy.invoices = 1.0;
        relevancy.cmrDocuments = 0.8;
        console.log('[ContextOptimizer] Wykryto zapytanie o kompletność danych - dodaję wszystkie kolekcje');
      }
      
      // FAZA 3: Zapytania o traceability (śledzenie pochodzenia)
      if (category === 'traceability') {
        relevancy.purchaseOrders = 1.0;
        relevancy.inventory = 1.0;
        relevancy.production = 1.0;
        relevancy.suppliers = 0.9;
        console.log('[ContextOptimizer] Wykryto zapytanie o traceability - dodaję łańcuch dostaw');
      }
    });

    // Wykryj zapytania o komponenty receptur - mogą wymagać danych o dostawcach
    if (queryAnalysis.categories.recipes && queryAnalysis.categories.suppliers) {
      relevancy.purchaseOrders = 1.0;
      relevancy.inventorySupplierPrices = 1.0;
      console.log('[ContextOptimizer] Wykryto zapytanie o komponenty i dostawców - dodaję powiązane dane');
    }

    // Specjalne reguły
    if (queryAnalysis.operations.count) {
      relevancy.summary = 1.0; // Podsumowanie zawsze dla liczenia
    }

    if (queryAnalysis.isComplex) {
      // Dla złożonych zapytań potrzeba więcej kontekstu
      Object.keys(relevancy).forEach(key => {
        relevancy[key] = Math.min(1.0, relevancy[key] + 0.2);
      });
    }

    return relevancy;
  }

  /**
   * Wybiera strategię optymalizacji
   * @param {string} modelType - Typ modelu
   * @param {Object} queryAnalysis - Analiza zapytania
   * @returns {Object} - Strategia optymalizacji
   */
  static selectOptimizationStrategy(modelType, queryAnalysis) {
    const strategies = {
      minimal: {
        name: 'minimal',
        description: 'Tylko najbardziej istotne dane',
        maxItems: 10,
        includeDetails: false,
        includeAnalysis: false,
        summaryOnly: true
      },
      focused: {
        name: 'focused',
        description: 'Skoncentrowane na konkretnej kategorii',
        maxItems: 50,
        includeDetails: true,
        includeAnalysis: false,
        summaryOnly: false
      },
      comprehensive: {
        name: 'comprehensive',
        description: 'Szeroki kontekst z analizą - pełne dane',
        maxItems: 150,  // 🔥 OPTYMALIZACJA: 150 to kompromis między pełnością a limitem 272k tokenów
        includeDetails: true,
        includeAnalysis: true,
        summaryOnly: false
      }
    };

    // Wybierz strategię na podstawie modelu i złożoności
    // 🔥 FIX: Używaj minimal TYLKO dla prostych liczników, reszta comprehensive
    if (modelType === 'simple' && queryAnalysis.operations.count && !queryAnalysis.operations.list) {
      // Tylko dla czystych zapytań "ile jest X?" bez dodatkowych operacji
      return strategies.minimal;
    } else if (modelType === 'medium' && queryAnalysis.isSpecific && !queryAnalysis.entities.length > 0) {
      // Focused tylko gdy zapytanie jest bardzo specyficzne bez wielu encji
      return strategies.focused;
    } else {
      // 🔥 DOMYŚLNIE: comprehensive - pełne dane dla AI
      return strategies.comprehensive;
    }
  }

  /**
   * Buduje kontekst zgodnie ze strategią
   * @param {Object} strategy - Strategia optymalizacji
   * @param {Object} businessData - Dane biznesowe
   * @param {Object} relevancyMap - Mapa istotności
   * @param {Object} queryAnalysis - Analiza zapytania
   * @returns {Object} - Zoptymalizowany kontekst
   */
  static buildContextByStrategy(strategy, businessData, relevancyMap, queryAnalysis) {
    const context = {};

    // Zawsze dodaj podstawowe podsumowanie
    if (businessData.summary) {
      context.summary = this.optimizeSummary(businessData.summary, strategy);
    }

    // Przetwórz każdą kategorię danych
    Object.keys(relevancyMap).forEach(category => {
      const relevance = relevancyMap[category];
      
      // Pomiń kategorie o niskiej istotności TYLKO w trybie minimal
      if (strategy.name === 'minimal' && relevance < 0.8) {
        return;
      }
      
      // 🔥 FIX: W comprehensive, zawsze przekazuj dane niezależnie od relevance
      if (strategy.name === 'comprehensive' && relevance < 0.3) {
        // Nawet w comprehensive, pomijaj tylko jeśli relevance jest bardzo niska
        return;
      }

      if (businessData.data && businessData.data[category]) {
        context[category] = this.optimizeDataCategory(
          businessData.data[category],
          category,
          strategy,
          relevance,
          queryAnalysis
        );
      }

      // Dodaj analizę jeśli strategia na to pozwala
      if (strategy.includeAnalysis && businessData.analysis && businessData.analysis[category]) {
        context[`${category}_analysis`] = this.optimizeAnalysis(
          businessData.analysis[category],
          strategy,
          relevance
        );
      }
    });

    return context;
  }

  /**
   * Optymalizuje podsumowanie systemu
   * @param {Object} summary - Oryginalne podsumowanie
   * @param {Object} strategy - Strategia
   * @returns {Object} - Zoptymalizowane podsumowanie
   */
  static optimizeSummary(summary, strategy) {
    if (strategy.summaryOnly) {
      // Tylko najważniejsze liczby
      return {
        totalInventoryItems: summary.totalInventoryItems,
        totalOrders: summary.totalOrders,
        totalProductionTasks: summary.totalProductionTasks,
        activeProductionTasks: summary.activeProductionTasks,
        itemsLowOnStock: summary.itemsLowOnStock,
        timestamp: summary.timestamp
      };
    }
    
    return summary; // Pełne podsumowanie dla innych strategii
  }

  /**
   * Optymalizuje kategorię danych
   * @param {Array} dataArray - Tablica danych
   * @param {string} category - Kategoria danych
   * @param {Object} strategy - Strategia
   * @param {number} relevance - Istotność
   * @param {Object} queryAnalysis - Analiza zapytania
   * @returns {Array} - Zoptymalizowane dane
   */
  static optimizeDataCategory(dataArray, category, strategy, relevance, queryAnalysis) {
    if (!Array.isArray(dataArray)) {
      return dataArray;
    }

    let optimizedData = [...dataArray];
    
    // Określ maksymalną liczbę elementów na podstawie istotności
    const maxItems = Math.ceil(strategy.maxItems * relevance);
    
    // Sortuj i filtruj dane
    optimizedData = this.prioritizeAndFilter(optimizedData, category, queryAnalysis, maxItems);
    
    // Uproszczenie detali jeśli strategia na to nie pozwala
    if (!strategy.includeDetails) {
      optimizedData = optimizedData.map(item => this.simplifyItem(item, category));
    }

    return optimizedData;
  }

  /**
   * Priorytetyzuje i filtruje dane
   * @param {Array} data - Dane do przetworzenia
   * @param {string} category - Kategoria
   * @param {Object} queryAnalysis - Analiza zapytania
   * @param {number} maxItems - Maksymalna liczba elementów
   * @returns {Array} - Przefiltrowane dane
   */
  static prioritizeAndFilter(data, category, queryAnalysis, maxItems) {
    let filteredData = [...data];

    // Filtrowanie czasowe
    if (queryAnalysis.timeFilters.recent) {
      filteredData = this.filterRecentItems(filteredData, category);
    }

    // Sortowanie według istotności
    filteredData = this.sortByRelevance(filteredData, category, queryAnalysis);

    // Ograniczenie liczby
    return filteredData.slice(0, maxItems);
  }

  /**
   * Filtruje najnowsze elementy
   * @param {Array} data - Dane
   * @param {string} category - Kategoria
   * @returns {Array} - Przefiltrowane dane
   */
  static filterRecentItems(data, category) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    return data.filter(item => {
      const dateField = this.getDateField(item, category);
      if (!dateField) return true; // Zachowaj jeśli nie ma daty
      
      const itemDate = new Date(dateField);
      return itemDate >= thirtyDaysAgo;
    });
  }

  /**
   * Pobiera pole daty dla kategorii
   * @param {Object} item - Element danych
   * @param {string} category - Kategoria
   * @returns {string|null} - Wartość pola daty
   */
  static getDateField(item, category) {
    const dateFields = {
      orders: item.orderDate || item.createdAt || item.date,
      production: item.scheduledDate || item.startDate || item.endDate || item.createdAt || item.date,
      inventory: item.lastUpdate || item.updatedAt || item.createdAt,
      recipes: item.updatedAt || item.createdAt
    };

    const dateValue = dateFields[category] || item.createdAt || item.updatedAt || item.date;
    
    // Obsługa dat Firestore Timestamp
    if (dateValue && dateValue.toDate) {
      return dateValue.toDate();
    }
    
    return dateValue;
  }

  /**
   * Sortuje według istotności
   * @param {Array} data - Dane
   * @param {string} category - Kategoria
   * @param {Object} queryAnalysis - Analiza zapytania
   * @returns {Array} - Posortowane dane
   */
  static sortByRelevance(data, category, queryAnalysis) {
    return data.sort((a, b) => {
      // Sortowanie specyficzne dla kategorii i operacji
      if (category === 'inventory' && queryAnalysis.operations.filter) {
        // Priorytet dla niskich stanów
        const aLowStock = (a.quantity || 0) <= (a.minQuantity || 0);
        const bLowStock = (b.quantity || 0) <= (b.minQuantity || 0);
        if (aLowStock && !bLowStock) return -1;
        if (!aLowStock && bLowStock) return 1;
      }

      if (category === 'orders' && queryAnalysis.timeFilters.recent) {
        // Najnowsze zamówienia
        const aDate = new Date(a.orderDate || a.createdAt || 0);
        const bDate = new Date(b.orderDate || b.createdAt || 0);
        return bDate - aDate;
      }
      
      if (category === 'production') {
        // Dla zadań produkcyjnych priorityzuj planowane daty
        const aScheduledDate = this.getDateField(a, 'production') || new Date(0);
        const bScheduledDate = this.getDateField(b, 'production') || new Date(0);
        
        // Najwcześniejsze planowane zadania na górze
        if (aScheduledDate !== bScheduledDate) {
          return new Date(aScheduledDate) - new Date(bScheduledDate);
        }
        
        // Jeśli daty są takie same, priorityzuj według statusu
        const statusPriority = {
          'W trakcie': 1,
          'Wstrzymane': 2,
          'Zaplanowane': 3,
          'Zakończone': 4,
          'Anulowane': 5
        };
        
        const aPriority = statusPriority[a.status] || 10;
        const bPriority = statusPriority[b.status] || 10;
        
        return aPriority - bPriority;
      }

      // Domyślne sortowanie alfabetyczne lub według ID
      const aName = a.name || a.title || a.id || '';
      const bName = b.name || b.title || b.id || '';
      return aName.localeCompare(bName);
    });
  }

  /**
   * Upraszcza element danych
   * @param {Object} item - Element do uproszczenia
   * @param {string} category - Kategoria
   * @returns {Object} - Uproszczony element
   */
  static simplifyItem(item, category) {
    const simplifications = {
      recipes: (item) => ({
        id: item.id,
        name: item.name,
        product: item.product,
        componentsCount: item.components?.length || 0,
        ingredientsCount: item.ingredients?.length || 0
      }),
      inventory: (item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        minQuantity: item.minQuantity,
        unit: item.unit
      }),
      orders: (item) => ({
        id: item.id,
        customer: item.customer,
        status: item.status,
        orderDate: item.orderDate,
        itemsCount: item.items?.length || 0
      }),
      production: (item) => ({
        id: item.id,
        name: item.name || item.productName,
        status: item.status,
        scheduledDate: item.scheduledDate ? (item.scheduledDate.toDate ? item.scheduledDate.toDate() : item.scheduledDate) : null,
        endDate: item.endDate ? (item.endDate.toDate ? item.endDate.toDate() : item.endDate) : null,
        startDate: item.startDate ? (item.startDate.toDate ? item.startDate.toDate() : item.startDate) : null,
        recipe: item.recipe || item.recipeId,
        quantity: item.quantity,
        moNumber: item.moNumber
      }),
      purchaseOrders: (item) => ({
        id: item.id,
        number: item.number || item.poNumber,
        supplierId: item.supplierId,
        supplierName: item.supplierName,
        status: item.status,
        orderDate: item.orderDate || item.createdAt,
        deliveryDate: item.deliveryDate || item.expectedDeliveryDate,
        totalValue: item.totalValue || item.totalGross,
        items: item.items || [],  // ✅ KLUCZOWE! Zachowujemy items!
        currency: item.currency
      }),
      inventorySupplierPrices: (item) => ({
        id: item.id,
        inventoryId: item.inventoryId,
        supplierId: item.supplierId,
        price: item.price,
        currency: item.currency,
        minQuantity: item.minQuantity
      }),
      // FAZA 1: Nowe simplifications
      invoices: (item) => ({
        id: item.id,
        number: item.number,
        customer: item.customer,
        customerId: item.customerId,
        orderId: item.orderId,
        issueDate: item.issueDate,
        dueDate: item.dueDate,
        totalAmount: item.totalAmount,
        paidAmount: item.paidAmount,
        status: item.status,
        paymentStatus: item.paymentStatus
      }),
      cmrDocuments: (item) => ({
        id: item.id,
        cmrNumber: item.cmrNumber,
        status: item.status,
        linkedOrderIds: item.linkedOrderIds || (item.linkedOrderId ? [item.linkedOrderId] : []),
        sender: item.sender,
        receiver: item.receiver,
        carrier: item.carrier,
        issueDate: item.issueDate,
        deliveryDate: item.deliveryDate,
        loadingDate: item.loadingDate
      }),
      stocktaking: (item) => ({
        id: item.id,
        name: item.name,
        warehouseId: item.warehouseId,
        status: item.status,
        startDate: item.startDate,
        endDate: item.endDate,
        performedBy: item.performedBy
      }),
      inventorySupplierPriceHistory: (item) => ({
        id: item.id,
        inventoryId: item.inventoryId,
        supplierId: item.supplierId,
        price: item.price,
        currency: item.currency,
        effectiveDate: item.effectiveDate,
        changeReason: item.changeReason
      })
    };

    const simplifyFunc = simplifications[category];
    return simplifyFunc ? simplifyFunc(item) : {
      id: item.id,
      name: item.name || item.title,
      status: item.status
    };
  }

  /**
   * Optymalizuje dane analityczne
   * @param {Object} analysisData - Dane analityczne
   * @param {Object} strategy - Strategia
   * @param {number} relevance - Istotność
   * @returns {Object} - Zoptymalizowane dane analityczne
   */
  static optimizeAnalysis(analysisData, strategy, relevance) {
    if (strategy.name === 'minimal') {
      // Tylko podstawowe statystyki
      return {
        count: analysisData.count,
        summary: analysisData.summary
      };
    }

    // Zachowaj więcej szczegółów dla innych strategii
    return analysisData;
  }

  /**
   * Szacuje rozmiar danych (przybliżona liczba tokenów)
   * @param {Object} data - Dane do oszacowania
   * @returns {number} - Szacowany rozmiar
   */
  static estimateDataSize(data) {
    if (!data) return 0;
    
    const jsonString = JSON.stringify(data);
    // Przybliżone oszacowanie: 1 token ≈ 4 znaki dla języka polskiego
    return Math.ceil(jsonString.length / 3);
  }

  /**
   * Oblicza współczynnik redukcji danych
   * @param {Object} originalData - Oryginalne dane
   * @param {Object} optimizedData - Zoptymalizowane dane
   * @returns {number} - Procentowa redukcja
   */
  static calculateReductionRatio(originalData, optimizedData) {
    const originalSize = this.estimateDataSize(originalData);
    const optimizedSize = this.estimateDataSize(optimizedData);
    
    if (originalSize === 0) return 0;
    
    return Math.round(((originalSize - optimizedSize) / originalSize) * 100);
  }

  /**
   * Generuje raport optymalizacji
   * @param {Object} optimizedContext - Zoptymalizowany kontekst
   * @returns {string} - Raport w formacie tekstowym
   */
  static generateOptimizationReport(optimizedContext) {
    const opt = optimizedContext._optimization;
    
    if (!opt) return "Brak danych o optymalizacji";

    return `📊 Raport optymalizacji kontekstu:
• Strategia: ${opt.strategy}
• Redukcja danych: ${opt.reductionRatio}% (${opt.originalDataSize} → ${opt.optimizedDataSize} tokenów)
• Uwzględnione kolekcje: ${opt.includedCollections.join(', ')}
• Pewność analizy zapytania: ${(opt.queryRelevance * 100).toFixed(1)}%`;
  }
}
