// src/services/ai/predictive/PredictiveAssistant.js

import { db } from '../../firebase/config';
import { 
  collection, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit 
} from 'firebase/firestore';

/**
 * Predykcyjny asystent AI - generuje proaktywne sugestie i rekomendacje
 * Analizuje wzorce użytkowania i proponuje akcje optymalizacyjne
 */
export class PredictiveAssistant {

  /**
   * Generuje personalizowane sugestie dla użytkownika
   * @param {string} userId - ID użytkownika
   * @param {Object} context - Kontekst biznesowy
   * @returns {Promise<Array>} - Lista sugestii
   */
  static async generateSuggestions(userId, context = {}) {
    console.log(`[PredictiveAssistant] Generuję sugestie dla użytkownika: ${userId}`);

    try {
      // Pobierz profil użytkownika i historię aktywności
      const userProfile = await this.buildUserProfile(userId);
      
      // Pobierz aktualny stan systemu
      const systemState = await this.getSystemState();
      
      // Generuj różne typy sugestii
      const suggestionCategories = await Promise.all([
        this.generateInventorySuggestions(systemState, userProfile),
        this.generateProductionSuggestions(systemState, userProfile),
        this.generateOrderSuggestions(systemState, userProfile),
        this.generateOptimizationSuggestions(systemState, userProfile),
        this.generateProactiveSuggestions(systemState, userProfile)
      ]);

      // Połącz i priorytetyzuj sugestie
      const allSuggestions = suggestionCategories.flat();
      const prioritizedSuggestions = this.prioritizeSuggestions(allSuggestions, userProfile);
      
      // Ogranicz do najważniejszych sugestii
      const topSuggestions = prioritizedSuggestions.slice(0, 10);

      return {
        suggestions: topSuggestions,
        userProfile: {
          role: userProfile.role,
          preferences: userProfile.preferences,
          activityLevel: userProfile.activityLevel
        },
        systemHealth: systemState.health,
        generatedAt: new Date().toISOString(),
        totalSuggestions: allSuggestions.length
      };

    } catch (error) {
      console.error('[PredictiveAssistant] Błąd podczas generowania sugestii:', error);
      return {
        suggestions: this.getDefaultSuggestions(),
        error: error.message,
        generatedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Buduje profil użytkownika na podstawie historii aktywności
   * @param {string} userId - ID użytkownika
   * @returns {Promise<Object>} - Profil użytkownika
   */
  static async buildUserProfile(userId) {
    try {
      // W rzeczywistej aplikacji można by pobierać dane z:
      // - Historia zapytań AI
      // - Najczęściej używane funkcje
      // - Preferencje użytkownika
      // - Rola w organizacji
      
      return {
        role: 'manager', // Można określić na podstawie uprawnień
        preferences: {
          focusAreas: ['inventory', 'production'], // Na podstawie historii zapytań
          alertLevel: 'medium',
          reportingFrequency: 'daily'
        },
        activityLevel: 'high', // Na podstawie częstotliwości logowania
        lastActive: new Date().toISOString(),
        queryHistory: [], // Historia ostatnich zapytań
        favoriteMetrics: ['recipe_count', 'inventory_status'] // Najczęściej sprawdzane metryki
      };
    } catch (error) {
      console.error('[PredictiveAssistant] Błąd podczas budowania profilu:', error);
      return this.getDefaultUserProfile();
    }
  }

  /**
   * Pobiera aktualny stan systemu
   * @returns {Promise<Object>} - Stan systemu
   */
  static async getSystemState() {
    try {
      // Pobierz podstawowe metryki systemu
      const [inventoryStatus, productionStatus, orderStatus] = await Promise.all([
        this.getInventoryStatus(),
        this.getProductionStatus(),
        this.getOrderStatus()
      ]);

      return {
        health: this.calculateSystemHealth(inventoryStatus, productionStatus, orderStatus),
        inventory: inventoryStatus,
        production: productionStatus,
        orders: orderStatus,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('[PredictiveAssistant] Błąd podczas pobierania stanu systemu:', error);
      return this.getDefaultSystemState();
    }
  }

  /**
   * Pobiera status magazynu
   * @returns {Promise<Object>} - Status magazynu
   */
  static async getInventoryStatus() {
    try {
      // Uproszczona implementacja - w rzeczywistości można wykorzystać istniejące serwisy
      return {
        totalItems: 150,
        lowStockItems: 12,
        outOfStockItems: 3,
        recentChanges: 8,
        alert: 'medium'
      };
    } catch (error) {
      return { alert: 'unknown', error: error.message };
    }
  }

  /**
   * Pobiera status produkcji
   * @returns {Promise<Object>} - Status produkcji
   */
  static async getProductionStatus() {
    try {
      return {
        activeTasks: 25,
        completedToday: 8,
        delayedTasks: 2,
        efficiency: 87,
        alert: 'low'
      };
    } catch (error) {
      return { alert: 'unknown', error: error.message };
    }
  }

  /**
   * Pobiera status zamówień
   * @returns {Promise<Object>} - Status zamówień
   */
  static async getOrderStatus() {
    try {
      return {
        pendingOrders: 18,
        newOrdersToday: 5,
        urgentOrders: 3,
        completionRate: 92,
        alert: 'low'
      };
    } catch (error) {
      return { alert: 'unknown', error: error.message };
    }
  }

  /**
   * Oblicza ogólne zdrowie systemu
   * @param {Object} inventory - Status magazynu
   * @param {Object} production - Status produkcji
   * @param {Object} orders - Status zamówień
   * @returns {string} - Poziom zdrowia systemu
   */
  static calculateSystemHealth(inventory, production, orders) {
    const alerts = [inventory.alert, production.alert, orders.alert];
    
    if (alerts.includes('high')) return 'critical';
    if (alerts.includes('medium')) return 'warning';
    if (alerts.includes('low')) return 'good';
    return 'excellent';
  }

  /**
   * Generuje sugestie dotyczące magazynu
   * @param {Object} systemState - Stan systemu
   * @param {Object} userProfile - Profil użytkownika
   * @returns {Array} - Sugestie magazynowe
   */
  static generateInventorySuggestions(systemState, userProfile) {
    const suggestions = [];
    const inventory = systemState.inventory;

    // Sugestie dla niskich stanów
    if (inventory.lowStockItems > 0) {
      suggestions.push({
        id: 'inventory_low_stock',
        type: 'alert',
        priority: 'high',
        category: 'inventory',
        title: 'Produkty z niskim stanem',
        description: `${inventory.lowStockItems} produktów ma niski stan magazynowy`,
        action: 'Sprawdź produkty z niskim stanem',
        query: 'Które produkty mają niski stan?',
        impact: 'Zapobiega brakom magazynowym',
        timeToAct: 'Dziś',
        confidence: 0.9
      });
    }

    // Sugestie dla braku zapasów
    if (inventory.outOfStockItems > 0) {
      suggestions.push({
        id: 'inventory_out_of_stock',
        type: 'critical',
        priority: 'critical',
        category: 'inventory',
        title: 'Produkty niedostępne',
        description: `${inventory.outOfStockItems} produktów jest niedostępnych`,
        action: 'Natychmiastowe uzupełnienie stanów',
        query: 'Pokaż produkty bez zapasów',
        impact: 'Krytyczne dla ciągłości produkcji',
        timeToAct: 'Natychmiast',
        confidence: 1.0
      });
    }

    // Sugestie optymalizacyjne
    if (inventory.recentChanges > 5) {
      suggestions.push({
        id: 'inventory_optimization',
        type: 'optimization',
        priority: 'medium',
        category: 'inventory',
        title: 'Analiza przepływu magazynowego',
        description: 'Wysokie ruchy magazynowe - warto przeanalizować wzorce',
        action: 'Przeanalizuj trendy magazynowe',
        query: 'Jakie są trendy w magazynie?',
        impact: 'Optymalizacja kosztów magazynowania',
        timeToAct: 'W tym tygodniu',
        confidence: 0.7
      });
    }

    return suggestions;
  }

  /**
   * Generuje sugestie dotyczące produkcji
   * @param {Object} systemState - Stan systemu
   * @param {Object} userProfile - Profil użytkownika
   * @returns {Array} - Sugestie produkcyjne
   */
  static generateProductionSuggestions(systemState, userProfile) {
    const suggestions = [];
    const production = systemState.production;

    // Sugestie dla opóźnionych zadań
    if (production.delayedTasks > 0) {
      suggestions.push({
        id: 'production_delays',
        type: 'alert',
        priority: 'high',
        category: 'production',
        title: 'Opóźnione zadania produkcyjne',
        description: `${production.delayedTasks} zadań ma opóźnienia`,
        action: 'Przegląd opóźnionych zadań',
        query: 'Które zadania produkcyjne są opóźnione?',
        impact: 'Wpływ na terminowość dostaw',
        timeToAct: 'Dziś',
        confidence: 0.9
      });
    }

    // Sugestie dla wydajności
    if (production.efficiency < 85) {
      suggestions.push({
        id: 'production_efficiency',
        type: 'optimization',
        priority: 'medium',
        category: 'production',
        title: 'Niska wydajność produkcji',
        description: `Wydajność: ${production.efficiency}% (poniżej target 85%)`,
        action: 'Analiza wydajności procesów',
        query: 'Jak poprawić wydajność produkcji?',
        impact: 'Zwiększenie produktywności',
        timeToAct: 'W tym tygodniu',
        confidence: 0.8
      });
    }

    // Pozytywne sugestie
    if (production.efficiency > 90) {
      suggestions.push({
        id: 'production_excellence',
        type: 'insight',
        priority: 'low',
        category: 'production',
        title: 'Doskonała wydajność!',
        description: `Wydajność: ${production.efficiency}% - świetny wynik!`,
        action: 'Przeanalizuj czynniki sukcesu',
        query: 'Co wpływa na wysoką wydajność?',
        impact: 'Utrzymanie wysokich standardów',
        timeToAct: 'Planowane',
        confidence: 0.9
      });
    }

    return suggestions;
  }

  /**
   * Generuje sugestie dotyczące zamówień
   * @param {Object} systemState - Stan systemu
   * @param {Object} userProfile - Profil użytkownika
   * @returns {Array} - Sugestie zamówieniowe
   */
  static generateOrderSuggestions(systemState, userProfile) {
    const suggestions = [];
    const orders = systemState.orders;

    // Sugestie dla pilnych zamówień
    if (orders.urgentOrders > 0) {
      suggestions.push({
        id: 'orders_urgent',
        type: 'alert',
        priority: 'high',
        category: 'orders',
        title: 'Pilne zamówienia',
        description: `${orders.urgentOrders} zamówień wymaga pilnej realizacji`,
        action: 'Sprawdź pilne zamówienia',
        query: 'Które zamówienia są pilne?',
        impact: 'Zachowanie satysfakcji klientów',
        timeToAct: 'Dziś',
        confidence: 0.95
      });
    }

    // Sugestie analityczne
    if (orders.newOrdersToday > 10) {
      suggestions.push({
        id: 'orders_trend',
        type: 'insight',
        priority: 'low',
        category: 'orders',
        title: 'Wysokie zapotrzebowanie',
        description: `${orders.newOrdersToday} nowych zamówień dzisiaj`,
        action: 'Przeanalizuj trendy zamówień',
        query: 'Jakie są trendy w zamówieniach?',
        impact: 'Lepsze planowanie zasobów',
        timeToAct: 'W tym tygodniu',
        confidence: 0.7
      });
    }

    return suggestions;
  }

  /**
   * Generuje sugestie optymalizacyjne
   * @param {Object} systemState - Stan systemu
   * @param {Object} userProfile - Profil użytkownika
   * @returns {Array} - Sugestie optymalizacyjne
   */
  static generateOptimizationSuggestions(systemState, userProfile) {
    const suggestions = [];

    // Sugestie oparte na roli użytkownika
    if (userProfile.role === 'manager') {
      suggestions.push({
        id: 'manager_dashboard',
        type: 'insight',
        priority: 'medium',
        category: 'optimization',
        title: 'Przegląd zarządczy',
        description: 'Warto sprawdzić kluczowe wskaźniki wydajności',
        action: 'Otwórz dashboard zarządczy',
        query: 'Pokaż przegląd systemu',
        impact: 'Lepszy nadzór nad operacjami',
        timeToAct: 'Codziennie',
        confidence: 0.8
      });
    }

    // Sugestie dotyczące kosztów
    suggestions.push({
      id: 'cost_analysis',
      type: 'optimization',
      priority: 'medium',
      category: 'optimization',
      title: 'Analiza kosztów',
      description: 'Regularna analiza kosztów może ujawnić oszczędności',
      action: 'Przeanalizuj koszty produkcji',
      query: 'Jakie są najdroższe receptury?',
      impact: 'Redukcja kosztów operacyjnych',
      timeToAct: 'Miesięcznie',
      confidence: 0.6
    });

    return suggestions;
  }

  /**
   * Generuje proaktywne sugestie oparte na wzorcach
   * @param {Object} systemState - Stan systemu
   * @param {Object} userProfile - Profil użytkownika
   * @returns {Array} - Proaktywne sugestie
   */
  static generateProactiveSuggestions(systemState, userProfile) {
    const suggestions = [];
    const currentHour = new Date().getHours();
    const dayOfWeek = new Date().getDay();

    // Sugestie czasowe
    if (currentHour >= 8 && currentHour <= 9) {
      suggestions.push({
        id: 'morning_briefing',
        type: 'routine',
        priority: 'low',
        category: 'proactive',
        title: 'Poranny przegląd',
        description: 'Idealny czas na przegląd stanu systemu',
        action: 'Sprawdź dzisiejszy stan',
        query: 'Jaki jest dzisiejszy status produkcji?',
        impact: 'Proaktywne zarządzanie',
        timeToAct: 'Teraz',
        confidence: 0.7
      });
    }

    // Sugestie tygodniowe
    if (dayOfWeek === 1) { // Poniedziałek
      suggestions.push({
        id: 'weekly_planning',
        type: 'routine',
        priority: 'medium',
        category: 'proactive',
        title: 'Planowanie tygodnia',
        description: 'Rozpocznij tydzień od przeglądu planów',
        action: 'Przejrzyj zadania na tydzień',
        query: 'Jakie są plany produkcyjne na ten tydzień?',
        impact: 'Lepsze planowanie zasobów',
        timeToAct: 'Dziś rano',
        confidence: 0.8
      });
    }

    // Sugestie edukacyjne
    suggestions.push({
      id: 'ai_tip',
      type: 'education',
      priority: 'low',
      category: 'proactive',
      title: 'Wskazówka AI',
      description: 'Czy wiesz, że możesz zapytać o prognozy zapotrzebowania?',
      action: 'Wypróbuj zaawansowane zapytania',
      query: 'Przewiduj zapotrzebowanie na następny miesiąc',
      impact: 'Lepsze wykorzystanie AI',
      timeToAct: 'Kiedy masz czas',
      confidence: 0.5
    });

    return suggestions;
  }

  /**
   * Priorytetyzuje sugestie na podstawie profilu użytkownika
   * @param {Array} suggestions - Lista sugestii
   * @param {Object} userProfile - Profil użytkownika
   * @returns {Array} - Uporządkowane sugestie
   */
  static prioritizeSuggestions(suggestions, userProfile) {
    // Wagi dla różnych typów priorytetów
    const priorityWeights = {
      'critical': 100,
      'high': 80,
      'medium': 50,
      'low': 20
    };

    // Wagi dla kategorii na podstawie preferencji użytkownika
    const categoryWeights = {
      'inventory': userProfile.preferences.focusAreas.includes('inventory') ? 1.2 : 1.0,
      'production': userProfile.preferences.focusAreas.includes('production') ? 1.2 : 1.0,
      'orders': userProfile.preferences.focusAreas.includes('orders') ? 1.2 : 1.0,
      'optimization': 1.0,
      'proactive': 0.8
    };

    // Oblicz wynik dla każdej sugestii
    return suggestions
      .map(suggestion => ({
        ...suggestion,
        score: (priorityWeights[suggestion.priority] || 50) * 
               (categoryWeights[suggestion.category] || 1.0) * 
               suggestion.confidence
      }))
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Pobiera domyślne sugestie (fallback)
   * @returns {Array} - Domyślne sugestie
   */
  static getDefaultSuggestions() {
    return [
      {
        id: 'default_inventory',
        type: 'routine',
        priority: 'medium',
        category: 'inventory',
        title: 'Sprawdź stan magazynu',
        description: 'Regularne sprawdzanie stanu magazynowego',
        action: 'Przejrzyj stany magazynowe',
        query: 'Jaki jest stan magazynu?',
        impact: 'Kontrola zapasów',
        timeToAct: 'Dziś',
        confidence: 0.7
      },
      {
        id: 'default_production',
        type: 'routine',
        priority: 'medium',
        category: 'production',
        title: 'Przegląd produkcji',
        description: 'Sprawdź status zadań produkcyjnych',
        action: 'Otwórz zadania produkcyjne',
        query: 'Jaki jest status produkcji?',
        impact: 'Monitoring produkcji',
        timeToAct: 'Dziś',
        confidence: 0.7
      }
    ];
  }

  /**
   * Pobiera domyślny profil użytkownika
   * @returns {Object} - Domyślny profil
   */
  static getDefaultUserProfile() {
    return {
      role: 'user',
      preferences: {
        focusAreas: ['inventory', 'production'],
        alertLevel: 'medium',
        reportingFrequency: 'daily'
      },
      activityLevel: 'medium',
      lastActive: new Date().toISOString(),
      queryHistory: [],
      favoriteMetrics: []
    };
  }

  /**
   * Pobiera domyślny stan systemu
   * @returns {Object} - Domyślny stan
   */
  static getDefaultSystemState() {
    return {
      health: 'good',
      inventory: { alert: 'low', totalItems: 0, lowStockItems: 0 },
      production: { alert: 'low', activeTasks: 0, efficiency: 85 },
      orders: { alert: 'low', pendingOrders: 0, urgentOrders: 0 },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Formatuje sugestie dla wyświetlenia w UI
   * @param {Array} suggestions - Lista sugestii
   * @returns {Array} - Sformatowane sugestie
   */
  static formatSuggestionsForUI(suggestions) {
    return suggestions.map(suggestion => ({
      id: suggestion.id,
      title: suggestion.title,
      description: suggestion.description,
      priority: suggestion.priority,
      category: suggestion.category,
      action: suggestion.action,
      query: suggestion.query,
      timeToAct: suggestion.timeToAct,
      impact: suggestion.impact,
      icon: this.getIconForCategory(suggestion.category),
      color: this.getColorForPriority(suggestion.priority)
    }));
  }

  /**
   * Pobiera ikonę dla kategorii
   * @param {string} category - Kategoria sugestii
   * @returns {string} - Nazwa ikony
   */
  static getIconForCategory(category) {
    const icons = {
      'inventory': 'warehouse',
      'production': 'manufacturing',
      'orders': 'shopping_cart',
      'optimization': 'tune',
      'proactive': 'lightbulb'
    };
    return icons[category] || 'info';
  }

  /**
   * Pobiera kolor dla priorytetu
   * @param {string} priority - Priorytet sugestii
   * @returns {string} - Kolor
   */
  static getColorForPriority(priority) {
    const colors = {
      'critical': '#f44336',
      'high': '#ff9800',
      'medium': '#2196f3',
      'low': '#4caf50'
    };
    return colors[priority] || '#9e9e9e';
  }
}
