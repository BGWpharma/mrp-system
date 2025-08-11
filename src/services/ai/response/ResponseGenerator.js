// src/services/ai/response/ResponseGenerator.js

/**
 * Klasa generująca odpowiedzi na podstawie wyników zapytań
 * Formatuje dane w czytelny sposób dla użytkownika
 */
export class ResponseGenerator {

  /**
   * Szablony odpowiedzi dla różnych typów zapytań
   */
  static templates = {
    // Receptury
    recipe_count: {
      simple: "W systemie znajduje się **{count} receptur**.",
      withDetails: "W systemie znajduje się **{count} receptur**.\n\n📊 **Szczegóły:**\n{details}"
    },

    recipe_count_by_weight: {
      simple: "Znaleziono **{count} receptur** spełniających kryteria wagowe.",
      withFilter: "Znaleziono **{count} receptur** z {totalRecipes} całkowitej liczby, których suma składników {filterDescription}.\n\n📋 **Przykłady receptur:**\n{examples}",
      detailed: "🔍 **Analiza receptur według wagi składników**\n\nZnaleziono **{count} receptur** z {totalRecipes} całkowitej liczby, które spełniają kryteria: {filterDescription}\n\n📋 **Lista receptur:**\n{recipesList}\n\n📊 **Statystyki:**\n{stats}"
    },

    recipe_count_by_ingredients: {
      withFilter: "Znaleziono **{count} receptur** z {totalRecipes} całkowitej liczby, które mają {filterDescription}.\n\n📋 **Przykłady receptur:**\n{examples}"
    },

    recipe_weight_analysis: {
      detailed: "📊 **Analiza wag receptur**\n\n🔢 **Statystyki ogólne:**\n• Łączna liczba receptur: **{totalRecipes}**\n• Średnia waga receptury: **{averageWeight}g**\n• Najcięższa receptura: **{maxWeight}g** ({heaviestRecipe})\n• Najlżejsza receptura: **{minWeight}g** ({lightestRecipe})\n\n📋 **Top 5 najcięższych receptur:**\n{topRecipes}"
    },

    // Magazyn
    inventory_count: {
      simple: "W magazynie znajduje się **{count} produktów**."
    },

    inventory_count_low_stock: {
      simple: "**{count} produktów** z {totalItems} ma niski stan magazynowy.",
      withList: "⚠️ **Produkty z niskim stanem magazynowym**\n\nZnaleziono **{count} produktów** z {totalItems} całkowitej liczby, które mają stan na poziomie minimum lub poniżej:\n\n{itemsList}\n\n💡 **Zalecenie:** Rozważ uzupełnienie stanów tych produktów."
    },

    inventory_low_stock: {
      detailed: "⚠️ **Produkty z niskim stanem magazynowym**\n\n{itemsList}\n\n📊 **Podsumowanie:** {count} produktów wymaga uzupełnienia stanów."
    },

    inventory_high_stock: {
      detailed: "📈 **Produkty z wysokim stanem magazynowym**\n\n{itemsList}\n\n📊 **Podsumowanie:** {count} produktów ma nadmierny stan (ponad 10x minimum)."
    },

    inventory_status: {
      overview: "📦 **Status magazynu**\n\n🔢 **Statystyki ogólne:**\n• Łączna liczba produktów: **{totalItems}**\n• Produkty z niskim stanem: **{lowStockCount}** ({lowStockPercentage}%)\n• Produkty bez stanu: **{outOfStockCount}**\n• Łączna wartość magazynu: **{totalValue} PLN**\n\n⚠️ **Produkty wymagające uwagi:**\n{lowStockItems}"
    },

    // Zamówienia
    orders_count: {
      simple: "W systemie znajduje się **{count} zamówień**."
    },

    customer_orders_count: {
      detailed: "📋 **Zamówienia klientów**\n\n🔢 **Statystyki:**\n• Łączna liczba zamówień: **{count}**\n• Liczba klientów z zamówieniami: **{customerOrdersCount}**\n\n💰 **Top klienci według wartości:**\n{topCustomers}"
    },

    orders_status: {
      breakdown: "📊 **Status zamówień**\n\nŁączna liczba zamówień: **{totalOrders}**\n\n📈 **Podział według statusu:**\n{statusBreakdown}"
    },

    // Zamówienia zakupu
    purchase_orders_count: {
      simple: "W systemie znajduje się **{count} zamówień zakupu**."
    },

    // Produkcja
    production_count: {
      simple: "W systemie znajduje się **{count} zadań produkcyjnych**."
    },

    production_status: {
      breakdown: "🏭 **Status zadań produkcyjnych**\n\nŁączna liczba zadań: **{totalTasks}**\n\n📊 **Podział według statusu:**\n{statusBreakdown}"
    },

    // Dostawcy i klienci
    suppliers_count: {
      simple: "W systemie znajduje się **{count} dostawców**."
    },

    customers_count: {
      simple: "W systemie znajduje się **{count} klientów**."
    },

    // Ogólne
    general_info: {
      overview: "📊 **Przegląd systemu MRP**\n\n🔢 **Podstawowe statystyki:**\n• Receptury: **{recipes}**\n• Produkty w magazynie: **{inventory}**\n• Zamówienia: **{orders}**\n• Zadania produkcyjne: **{production}**"
    },

    // Błędy
    error: {
      general: "❌ Wystąpił błąd podczas przetwarzania zapytania: {error}",
      noData: "ℹ️ Nie znaleziono danych spełniających podane kryteria.",
      invalidQuery: "❓ Nie rozumiem tego zapytania. Spróbuj zapytać inaczej lub użyj bardziej konkretnych słów."
    }
  };

  /**
   * Główna metoda generująca odpowiedź
   * @param {string} intent - Typ zapytania
   * @param {Object} queryResult - Wyniki zapytania z QueryExecutor
   * @param {Object} parameters - Parametry zapytania
   * @returns {string} - Sformatowana odpowiedź
   */
  static generateResponse(intent, queryResult, parameters = {}) {
    try {
      if (!queryResult.success) {
        return this.generateErrorResponse(queryResult.error || 'Nieznany błąd');
      }

      console.log(`[ResponseGenerator] Generuję odpowiedź dla: ${intent}`, queryResult);

      switch (intent) {
        // Receptury
        case 'recipe_count':
          return this.generateRecipeCountResponse(queryResult);
        
        case 'recipe_count_by_weight':
          return this.generateRecipeCountByWeightResponse(queryResult, parameters);
        
        case 'recipe_count_by_ingredients':
          return this.generateRecipeCountByIngredientsResponse(queryResult, parameters);
        
        case 'recipe_weight_analysis':
          return this.generateRecipeWeightAnalysisResponse(queryResult);

        // Magazyn
        case 'inventory_count':
          return this.generateInventoryCountResponse(queryResult);
        
        case 'inventory_count_low_stock':
        case 'inventory_low_stock':
          return this.generateInventoryLowStockResponse(queryResult);
        
        case 'inventory_high_stock':
          return this.generateInventoryHighStockResponse(queryResult);
        
        case 'inventory_status':
          return this.generateInventoryStatusResponse(queryResult);

        // Zamówienia
        case 'orders_count':
          return this.generateOrdersCountResponse(queryResult);
        
        case 'customer_orders_count':
          return this.generateCustomerOrdersCountResponse(queryResult);
        
        case 'orders_status':
          return this.generateOrdersStatusResponse(queryResult);

        // Zamówienia zakupu
        case 'purchase_orders_count':
          return this.generatePurchaseOrdersCountResponse(queryResult);

        // Produkcja
        case 'production_count':
          return this.generateProductionCountResponse(queryResult);
        
        case 'production_count_in_progress':
        case 'production_count_on_hold':
        case 'production_count_planned':
        case 'production_count_finished':
          return this.generateProductionCountByStatusResponse(queryResult);
        
        case 'production_in_progress':
        case 'production_on_hold':
        case 'production_planned':
        case 'production_finished':
          return this.generateProductionByStatusResponse(queryResult);
        
        case 'production_status':
          return this.generateProductionStatusResponse(queryResult);

        // Dostawcy i klienci
        case 'suppliers_count':
          return this.generateSuppliersCountResponse(queryResult);
        
        case 'customers_count':
          return this.generateCustomersCountResponse(queryResult);

        // Ogólne
        case 'general_info':
          return this.generateGeneralInfoResponse(queryResult);

        default:
          return this.generateDefaultResponse(queryResult, intent);
      }
    } catch (error) {
      console.error('[ResponseGenerator] Błąd podczas generowania odpowiedzi:', error);
      return this.generateErrorResponse('Błąd podczas formatowania odpowiedzi');
    }
  }

  // ==================== GENERATORY ODPOWIEDZI ====================

  /**
   * Generuje odpowiedź dla zliczania receptur
   */
  static generateRecipeCountResponse(result) {
    return this.fillTemplate(this.templates.recipe_count.simple, {
      count: result.count
    });
  }

  /**
   * Generuje odpowiedź dla zliczania receptur według wagi
   */
  static generateRecipeCountByWeightResponse(result, parameters) {
    const filterDescription = this.generateFilterDescription(result.filterCriteria);
    
    let examples = '';
    if (result.recipes && result.recipes.length > 0) {
      examples = result.recipes.slice(0, 5).map((recipe, index) => 
        `${index + 1}. **${recipe.name}** - ${recipe.totalWeight.toFixed(1)}g (${recipe.ingredientsCount} składników)`
      ).join('\n');
    }

    const stats = result.recipes ? this.generateWeightStats(result.recipes) : '';

    if (result.recipes && result.recipes.length <= 10) {
      const recipesList = result.recipes.map((recipe, index) => 
        `${index + 1}. **${recipe.name}** - ${recipe.totalWeight.toFixed(1)}g (${recipe.ingredientsCount} składników)`
      ).join('\n');

      return this.fillTemplate(this.templates.recipe_count_by_weight.detailed, {
        count: result.count,
        totalRecipes: result.totalRecipes,
        filterDescription,
        recipesList,
        stats
      });
    }

    return this.fillTemplate(this.templates.recipe_count_by_weight.withFilter, {
      count: result.count,
      totalRecipes: result.totalRecipes,
      filterDescription,
      examples
    });
  }

  /**
   * Generuje odpowiedź dla zliczania receptur według składników
   */
  static generateRecipeCountByIngredientsResponse(result, parameters) {
    const filterDescription = this.generateFilterDescription(result.filterCriteria);
    
    let examples = '';
    if (result.recipes && result.recipes.length > 0) {
      examples = result.recipes.slice(0, 5).map((recipe, index) => 
        `${index + 1}. **${recipe.name}** - ${recipe.ingredientsCount} składników (${recipe.totalWeight.toFixed(1)}g)`
      ).join('\n');
    }

    return this.fillTemplate(this.templates.recipe_count_by_ingredients.withFilter, {
      count: result.count,
      totalRecipes: result.totalRecipes,
      filterDescription,
      examples
    });
  }

  /**
   * Generuje odpowiedź dla analizy wag receptur
   */
  static generateRecipeWeightAnalysisResponse(result) {
    const stats = result.stats;
    const topRecipes = result.analysis.slice(0, 5).map((recipe, index) => 
      `${index + 1}. **${recipe.name}** - ${recipe.totalWeight.toFixed(1)}g`
    ).join('\n');

    return this.fillTemplate(this.templates.recipe_weight_analysis.detailed, {
      totalRecipes: stats.totalRecipes,
      averageWeight: stats.averageWeight.toFixed(1),
      maxWeight: stats.maxWeight.toFixed(1),
      minWeight: stats.minWeight.toFixed(1),
      heaviestRecipe: stats.heaviestRecipe?.name || 'brak',
      lightestRecipe: stats.lightestRecipe?.name || 'brak',
      topRecipes
    });
  }

  /**
   * Generuje odpowiedź dla stanu magazynu
   */
  static generateInventoryCountResponse(result) {
    return this.fillTemplate(this.templates.inventory_count.simple, {
      count: result.count
    });
  }

  /**
   * Generuje odpowiedź dla produktów z niskim stanem
   */
  static generateInventoryLowStockResponse(result) {
    if (result.count === 0) {
      return "✅ **Świetnie!** Wszystkie produkty mają wystarczający stan magazynowy.";
    }

    const itemsList = result.items.slice(0, 10).map((item, index) => 
      `${index + 1}. **${item.name}** - ${item.currentQuantity} ${item.unit} (min: ${item.minQuantity})`
    ).join('\n');

    return this.fillTemplate(this.templates.inventory_count_low_stock.withList, {
      count: result.count,
      totalItems: result.totalItems,
      itemsList
    });
  }

  /**
   * Generuje odpowiedź dla produktów z wysokim stanem
   */
  static generateInventoryHighStockResponse(result) {
    if (result.count === 0) {
      return "ℹ️ Nie znaleziono produktów z nadmiernym stanem magazynowym.";
    }

    const itemsList = result.items.slice(0, 10).map((item, index) => 
      `${index + 1}. **${item.name}** - ${item.currentQuantity} ${item.unit} (${item.overstock}x minimum)`
    ).join('\n');

    return this.fillTemplate(this.templates.inventory_high_stock.detailed, {
      count: result.count,
      itemsList
    });
  }

  /**
   * Generuje odpowiedź dla ogólnego statusu magazynu
   */
  static generateInventoryStatusResponse(result) {
    const stats = result.stats;
    const lowStockItems = result.lowStockItems.map((item, index) => 
      `${index + 1}. **${item.name}** - ${item.currentQuantity} ${item.unit}`
    ).join('\n');

    return this.fillTemplate(this.templates.inventory_status.overview, {
      totalItems: stats.totalItems,
      lowStockCount: stats.lowStockCount,
      outOfStockCount: stats.outOfStockCount,
      lowStockPercentage: stats.lowStockPercentage,
      totalValue: stats.totalValue,
      lowStockItems: lowStockItems || "Brak produktów z niskim stanem"
    });
  }

  /**
   * Generuje odpowiedź dla zliczania zamówień
   */
  static generateOrdersCountResponse(result) {
    return this.fillTemplate(this.templates.orders_count.simple, {
      count: result.count
    });
  }

  /**
   * Generuje odpowiedź dla zamówień klientów
   */
  static generateCustomerOrdersCountResponse(result) {
    const topCustomers = result.customerOrders
      .sort((a, b) => b.totalValue - a.totalValue)
      .slice(0, 5)
      .map((customer, index) => 
        `${index + 1}. Klient ${customer.customerId} - ${customer.orderCount} zamówień (${customer.totalValue.toFixed(2)} PLN)`
      ).join('\n');

    return this.fillTemplate(this.templates.customer_orders_count.detailed, {
      count: result.count,
      customerOrdersCount: result.customerOrdersCount,
      topCustomers
    });
  }

  /**
   * Generuje odpowiedź dla statusu zamówień
   */
  static generateOrdersStatusResponse(result) {
    const statusBreakdown = result.statusBreakdown.map(status => 
      `• **${status.status}**: ${status.count} zamówień (${status.percentage}%) - ${status.totalValue.toFixed(2)} PLN`
    ).join('\n');

    return this.fillTemplate(this.templates.orders_status.breakdown, {
      totalOrders: result.totalOrders,
      statusBreakdown
    });
  }

  /**
   * Generuje odpowiedź dla zamówień zakupu
   */
  static generatePurchaseOrdersCountResponse(result) {
    return this.fillTemplate(this.templates.purchase_orders_count.simple, {
      count: result.count
    });
  }

  /**
   * Generuje odpowiedź dla zadań produkcyjnych
   */
  static generateProductionCountResponse(result) {
    return this.fillTemplate(this.templates.production_count.simple, {
      count: result.count
    });
  }

  /**
   * Generuje odpowiedź dla statusu produkcji
   */
  static generateProductionStatusResponse(result) {
    const statusBreakdown = result.statusBreakdown.map(status => 
      `• **${status.status}**: ${status.count} zadań (${status.percentage}%)`
    ).join('\n');

    return this.fillTemplate(this.templates.production_status.breakdown, {
      totalTasks: result.totalTasks,
      statusBreakdown
    });
  }

  /**
   * Generuje odpowiedź dla dostawców
   */
  static generateSuppliersCountResponse(result) {
    return this.fillTemplate(this.templates.suppliers_count.simple, {
      count: result.count
    });
  }

  /**
   * Generuje odpowiedź dla klientów
   */
  static generateCustomersCountResponse(result) {
    return this.fillTemplate(this.templates.customers_count.simple, {
      count: result.count
    });
  }

  /**
   * Generuje odpowiedź dla ogólnych informacji
   */
  static generateGeneralInfoResponse(result) {
    return this.fillTemplate(this.templates.general_info.overview, result.summary);
  }

  /**
   * Generuje domyślną odpowiedź
   */
  static generateDefaultResponse(result, intent) {
    if (result.count !== undefined) {
      return `W systemie znajduje się **${result.count}** elementów w kolekcji ${result.collection}.`;
    }
    return `Znaleziono dane dla zapytania typu: ${intent}`;
  }

  /**
   * Generuje odpowiedź błędu
   */
  static generateErrorResponse(error) {
    return this.fillTemplate(this.templates.error.general, { error });
  }

  // ==================== FUNKCJE POMOCNICZE ====================

  /**
   * Wypełnia szablon danymi
   * @param {string} template - Szablon z placeholderami {key}
   * @param {Object} data - Dane do wstawienia
   * @returns {string} - Wypełniony szablon
   */
  static fillTemplate(template, data) {
    return template.replace(/\{(\w+)\}/g, (match, key) => {
      return data[key] !== undefined ? data[key] : match;
    });
  }

  /**
   * Generuje opis filtra
   * @param {Array} filters - Lista filtrów
   * @returns {string} - Opis filtra
   */
  static generateFilterDescription(filters) {
    if (!filters || filters.length === 0) {
      return "spełnia wszystkie kryteria";
    }

    return filters.map(filter => {
      const operator = filter.operator === '>' ? 'powyżej' : 
                     filter.operator === '<' ? 'poniżej' : 'równa';
      return `${operator} ${filter.originalValue}${filter.unit}`;
    }).join(' i ');
  }

  /**
   * Generuje statystyki wagi
   * @param {Array} recipes - Lista receptur
   * @returns {string} - Sformatowane statystyki
   */
  static generateWeightStats(recipes) {
    if (!recipes || recipes.length === 0) return '';

    const weights = recipes.map(r => r.totalWeight);
    const avg = weights.reduce((sum, w) => sum + w, 0) / weights.length;
    const max = Math.max(...weights);
    const min = Math.min(...weights);

    return `• Średnia waga: ${avg.toFixed(1)}g\n• Najwyższa waga: ${max.toFixed(1)}g\n• Najniższa waga: ${min.toFixed(1)}g`;
  }

  /**
   * Generuje odpowiedź o liczbie zadań według statusu
   */
  static generateProductionCountByStatusResponse(data) {
    if (!data.success) {
      return `❌ Wystąpił błąd podczas pobierania zadań o statusie "${data.status}".`;
    }

    const emoji = this.getStatusEmoji(data.status);
    let response = `${emoji} **Zadania produkcyjne o statusie "${data.status}"**\n\n`;
    response += `**Liczba zadań:** ${data.count}\n\n`;
    
    if (data.count === 0) {
      response += `Nie ma obecnie zadań o statusie "${data.status}".`;
    } else {
      response += `${data.message}`;
    }

    return response;
  }

  /**
   * Generuje odpowiedź z listą zadań według statusu
   */
  static generateProductionByStatusResponse(data) {
    if (!data.success) {
      return `❌ Wystąpił błąd podczas pobierania zadań o statusie "${data.status}".`;
    }

    const emoji = this.getStatusEmoji(data.status);
    
    // Specjalne nagłówki dla zapytań czasowych
    let title = `**Zadania produkcyjne o statusie "${data.status}"**`;
    if (data.parameters && data.parameters.timePeriod) {
      const periodText = this.getTimePeriodText(data.parameters.timePeriod);
      title = `**Zadania produkcyjne zaplanowane ${periodText}**`;
    }
    
    let response = `${emoji} ${title}\n\n`;
    
    if (data.count === 0) {
      const nothingText = data.parameters?.timePeriod ? 
        `Nie ma zadań zaplanowanych ${this.getTimePeriodText(data.parameters.timePeriod)}.` :
        `Nie ma obecnie zadań o statusie "${data.status}".`;
      response += nothingText;
      return response;
    }

    response += `**Znalezione zadania (${data.count}):**\n\n`;

    // Specjalne obsłużenie dla zadań zaplanowanych
    if (data.type === 'tasks_by_status_with_schedule' && data.soonTasks && data.soonTasks.length > 0) {
      response += `⚡ **Zadania rozpoczynające się wkrótce (${data.soonCount}):**\n`;
      data.soonTasks.forEach((task, index) => {
        const taskNumber = task.manufacturingOrderNumber || task.id;
        const scheduledDate = task.scheduledDate ? 
          (task.scheduledDate.toDate ? task.scheduledDate.toDate() : new Date(task.scheduledDate)).toLocaleDateString('pl-PL') : 
          'Brak daty';
        response += `${index + 1}. **${taskNumber}**\n`;
        response += `   - Nazwa: ${task.name || 'Brak nazwy'}\n`;
        response += `   - Data rozpoczęcia: ${scheduledDate}\n`;
        if (task.recipe) {
          response += `   - Receptura: ${task.recipe}\n`;
        }
        response += `\n`;
      });

      if (data.tasks.length > data.soonTasks.length) {
        response += `\n📋 **Pozostałe zadania (${data.tasks.length - data.soonTasks.length}):**\n`;
        const remainingTasks = data.tasks.filter(task => 
          !data.soonTasks.some(soonTask => soonTask.id === task.id)
        ).slice(0, 10); // Max 10 pozostałych

        remainingTasks.forEach((task, index) => {
          const taskNumber = task.manufacturingOrderNumber || task.id;
          response += `${index + 1}. **${taskNumber}** - ${task.name || 'Brak nazwy'}\n`;
        });
      }
    } else {
      // Standardowa lista zadań
      const displayTasks = data.tasks.slice(0, 15); // Max 15 zadań
      displayTasks.forEach((task, index) => {
        const taskNumber = task.manufacturingOrderNumber || task.id;
        response += `${index + 1}. **${taskNumber}**\n`;
        response += `   - ID: ${task.id}\n`;
        response += `   - Nazwa: ${task.name || 'Brak nazwy'}\n`;
        
        if (task.scheduledDate) {
          const scheduledDate = task.scheduledDate.toDate ? 
            task.scheduledDate.toDate() : 
            new Date(task.scheduledDate);
          response += `   - Data zaplanowana: ${scheduledDate.toLocaleDateString('pl-PL')}\n`;
        }
        
        if (task.recipe) {
          response += `   - Receptura: ${task.recipe}\n`;
        }
        
        if (task.quantity) {
          response += `   - Ilość: ${task.quantity}\n`;
        }
        
        response += `\n`;
      });

      if (data.tasks.length > 15) {
        response += `\n*... i ${data.tasks.length - 15} innych zadań*`;
      }
    }

    return response;
  }

  /**
   * Pobiera emoji dla statusu
   */
  static getStatusEmoji(status) {
    const emojiMap = {
      'w trakcie': '🔄',
      'wstrzymane': '⏸️',
      'zaplanowane': '📅',
      'zakończone': '✅',
      'aktywne': '▶️',
      'pending': '⏳',
      'completed': '✅'
    };
    return emojiMap[status] || '📋';
  }

  /**
   * Pobiera tekst opisujący okres czasowy
   */
  static getTimePeriodText(timePeriod) {
    const periodMap = {
      'thisMonth': 'w tym miesiącu',
      'nextMonth': 'w następnym miesiącu',
      'thisWeek': 'w tym tygodniu',
      'nextWeek': 'w następnym tygodniu',
      'soon': 'wkrótce (w ciągu 7 dni)'
    };
    return periodMap[timePeriod] || 'w wybranym okresie';
  }
}
