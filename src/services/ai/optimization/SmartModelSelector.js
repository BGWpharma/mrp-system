// src/services/ai/optimization/SmartModelSelector.js

/**
 * Inteligentny selektor modeli GPT - optymalizuje koszty i wydajność
 * Automatycznie wybiera najlepszy model na podstawie złożoności zapytania
 */
export class SmartModelSelector {
  
  // Definicje kosztów i wydajności modeli (stan na 2024)
  static MODEL_SPECS = {
    'gpt-4o-mini': {
      costPer1kInputTokens: 0.00015,
      costPer1kOutputTokens: 0.0006,
      maxTokens: 128000,
      speed: 'very_fast',
      capabilities: ['simple_analysis', 'basic_qa', 'summarization'],
      recommendedFor: ['simple', 'fast_response']
    },
    'gpt-3.5-turbo': {
      costPer1kInputTokens: 0.0015,
      costPer1kOutputTokens: 0.002,
      maxTokens: 16385,
      speed: 'fast',
      capabilities: ['medium_analysis', 'reasoning', 'complex_qa'],
      recommendedFor: ['medium', 'balanced']
    },
    'gpt-4o': {
      costPer1kInputTokens: 0.005,
      costPer1kOutputTokens: 0.015,
      maxTokens: 128000,
      speed: 'medium',
      capabilities: ['complex_analysis', 'advanced_reasoning', 'expert_knowledge'],
      recommendedFor: ['complex', 'high_accuracy']
    },
    'gpt-5': {
      costPer1kInputTokens: 0.01,
      costPer1kOutputTokens: 0.03,
      maxTokens: 200000,
      speed: 'medium_fast',
      capabilities: ['advanced_analysis', 'multimodal_reasoning', 'expert_knowledge', 'complex_problem_solving', 'creative_thinking'],
      recommendedFor: ['complex', 'high_accuracy', 'advanced_analytics', 'creative_tasks']
    }
  };

  /**
   * Wybiera optymalny model na podstawie parametrów zapytania
   * @param {string} query - Zapytanie użytkownika
   * @param {number} dataSize - Szacunkowy rozmiar danych (w tokenach)
   * @param {string} complexity - Poziom złożoności: 'simple', 'medium', 'complex'
   * @param {Object} options - Dodatkowe opcje
   * @returns {Object} - Konfiguracja modelu
   */
  static selectOptimalModel(query, dataSize = 1000, complexity = 'medium', options = {}) {
    console.log(`[SmartModelSelector] Analiza: query="${query.substring(0, 50)}...", dataSize=${dataSize}, complexity=${complexity}`);
    
    const {
      prioritizeSpeed = false,
      prioritizeCost = false,
      requireHighAccuracy = false,
      maxBudgetPer1kTokens = null
    } = options;

    // Analiza charakterystyki zapytania
    const queryAnalysis = this.analyzeQueryCharacteristics(query);
    const estimatedTokens = this.estimateTokenUsage(dataSize, queryAnalysis.outputComplexity);
    
    // Określ wymagania na podstawie analizy
    let requirements = {
      complexity: complexity,
      speed: prioritizeSpeed ? 'required' : 'preferred',
      cost: prioritizeCost ? 'minimize' : 'optimize',
      accuracy: requireHighAccuracy ? 'high' : 'standard',
      estimatedCost: null
    };

    // Zaktualizuj complexity na podstawie analizy zapytania
    if (queryAnalysis.isAnalytical) {
      requirements.complexity = 'complex';
    } else if (queryAnalysis.isSimpleCount) {
      requirements.complexity = 'simple';
    }

    console.log(`[SmartModelSelector] Wymagania:`, requirements);

    // Wybierz model na podstawie wymagań
    let selectedModel = this.selectModelByRequirements(requirements, estimatedTokens, maxBudgetPer1kTokens);
    
    // Przygotuj konfigurację modelu
    const modelConfig = this.buildModelConfig(selectedModel, queryAnalysis, estimatedTokens);
    
    console.log(`[SmartModelSelector] Wybrany model: ${selectedModel} (szacowany koszt: $${modelConfig.estimatedCost.toFixed(4)})`);
    
    return modelConfig;
  }

  /**
   * Analizuje charakterystykę zapytania
   * @param {string} query - Zapytanie użytkownika
   * @returns {Object} - Analiza zapytania
   */
  static analyzeQueryCharacteristics(query) {
    const lowerQuery = query.toLowerCase();
    
    // Wykryj typ zapytania
    const isSimpleCount = /^(ile|liczba|ilość)\s+(jest|są|wynosi|znajduje się)/i.test(query);
    const isAnalytical = /analiz|trend|prognoz|porówn|optymalizuj|rekomend/i.test(lowerQuery);
    const isComplex = /dlaczego|jak można|w jaki sposób|przyczyn|mechanizm/i.test(lowerQuery);
    const requiresCreativity = /stwórz|napisz|przygotuj|zaprojektuj/i.test(lowerQuery);
    
    // Szacuj złożoność odpowiedzi
    let outputComplexity = 'short'; // short, medium, long
    
    if (isAnalytical || isComplex) {
      outputComplexity = 'long';
    } else if (requiresCreativity || lowerQuery.includes('szczegół')) {
      outputComplexity = 'medium';
    }

    return {
      isSimpleCount,
      isAnalytical,
      isComplex,
      requiresCreativity,
      outputComplexity,
      containsNumbers: /\d+/.test(query),
      isQuestion: query.includes('?'),
      language: 'polish'
    };
  }

  /**
   * Szacuje użycie tokenów
   * @param {number} inputDataSize - Rozmiar danych wejściowych
   * @param {string} outputComplexity - Złożoność oczekiwanej odpowiedzi
   * @returns {Object} - Szacowanie tokenów
   */
  static estimateTokenUsage(inputDataSize, outputComplexity) {
    // Szacunkowe współczynniki dla języka polskiego
    const inputTokens = Math.ceil(inputDataSize * 1.3); // Polski ma więcej tokenów
    
    let outputTokens = 100; // Domyślnie
    switch(outputComplexity) {
      case 'short':
        outputTokens = 150;
        break;
      case 'medium':
        outputTokens = 500;
        break;
      case 'long':
        outputTokens = 1200;
        break;
    }

    return {
      input: inputTokens,
      output: outputTokens,
      total: inputTokens + outputTokens
    };
  }

  /**
   * Wybiera model na podstawie wymagań
   * @param {Object} requirements - Wymagania
   * @param {Object} estimatedTokens - Szacowanie tokenów
   * @param {number} maxBudget - Maksymalny budżet
   * @returns {string} - Nazwa wybranego modelu
   */
  static selectModelByRequirements(requirements, estimatedTokens, maxBudget = null) {
    const models = Object.keys(this.MODEL_SPECS);
    const scores = {};

    for (const model of models) {
      const spec = this.MODEL_SPECS[model];
      let score = 0;

      // Ocena zgodności z complexity
      if (requirements.complexity === 'simple' && spec.recommendedFor.includes('simple')) {
        score += 50;
      } else if (requirements.complexity === 'medium' && spec.recommendedFor.includes('balanced')) {
        score += 50;
      } else if (requirements.complexity === 'complex' && spec.recommendedFor.includes('high_accuracy')) {
        score += 50;
      }

      // Ocena prędkości
      if (requirements.speed === 'required') {
        if (spec.speed === 'very_fast') score += 30;
        else if (spec.speed === 'fast') score += 20;
        else score -= 10;
      }

      // Ocena kosztów
      const estimatedCost = this.calculateEstimatedCost(model, estimatedTokens);
      if (requirements.cost === 'minimize') {
        // Im niższy koszt, tym wyższy score
        const maxCost = Math.max(...models.map(m => this.calculateEstimatedCost(m, estimatedTokens)));
        score += 30 * (1 - (estimatedCost / maxCost));
      }

      // Sprawdź budżet
      if (maxBudget && estimatedCost > maxBudget) {
        score -= 100; // Dyskwalifikacja
      }

      // Sprawdź limity tokenów
      if (estimatedTokens.total > spec.maxTokens) {
        score -= 50;
      }

      scores[model] = score;
    }

    // Wybierz model z najwyższym score
    const selectedModel = Object.keys(scores).reduce((a, b) => 
      scores[a] > scores[b] ? a : b
    );

    return selectedModel;
  }

  /**
   * Oblicza szacowany koszt dla modelu
   * @param {string} model - Nazwa modelu
   * @param {Object} estimatedTokens - Szacowanie tokenów
   * @returns {number} - Koszt w USD
   */
  static calculateEstimatedCost(model, estimatedTokens) {
    const spec = this.MODEL_SPECS[model];
    const inputCost = (estimatedTokens.input / 1000) * spec.costPer1kInputTokens;
    const outputCost = (estimatedTokens.output / 1000) * spec.costPer1kOutputTokens;
    return inputCost + outputCost;
  }

  /**
   * Buduje finalną konfigurację modelu
   * @param {string} modelName - Nazwa modelu
   * @param {Object} queryAnalysis - Analiza zapytania
   * @param {Object} estimatedTokens - Szacowanie tokenów
   * @returns {Object} - Konfiguracja modelu
   */
  static buildModelConfig(modelName, queryAnalysis, estimatedTokens) {
    const spec = this.MODEL_SPECS[modelName];
    
    // Dostosuj parametry na podstawie analizy
    let temperature = 0.7; // Default
    let maxTokens = estimatedTokens.output + 100; // Buffer
    
    if (queryAnalysis.isSimpleCount) {
      temperature = 0.1; // Precyzja dla liczb
      maxTokens = Math.min(maxTokens, 300);
    } else if (queryAnalysis.isAnalytical) {
      temperature = 0.3; // Logiczna analiza
      maxTokens = Math.min(maxTokens, 2000);
    } else if (queryAnalysis.requiresCreativity) {
      temperature = 0.8; // Kreatywność
    }

    // Nie przekraczaj limitów modelu
    maxTokens = Math.min(maxTokens, spec.maxTokens);

    return {
      model: modelName,
      temperature,
      maxTokens,
      estimatedCost: this.calculateEstimatedCost(modelName, estimatedTokens),
      estimatedTokens,
      spec,
      rationale: this.explainSelection(modelName, queryAnalysis),
      optimizationUsed: true
    };
  }

  /**
   * Wyjaśnia wybór modelu
   * @param {string} modelName - Nazwa modelu
   * @param {Object} queryAnalysis - Analiza zapytania
   * @returns {string} - Uzasadnienie wyboru
   */
  static explainSelection(modelName, queryAnalysis) {
    const reasons = [];
    
    if (modelName === 'gpt-4o-mini') {
      reasons.push('optymalizacja kosztów');
      if (queryAnalysis.isSimpleCount) {
        reasons.push('proste zapytanie ilościowe');
      }
    } else if (modelName === 'gpt-3.5-turbo') {
      reasons.push('zbalansowany stosunek jakości do ceny');
    } else if (modelName === 'gpt-4o') {
      reasons.push('wymaga zaawansowanej analizy');
      if (queryAnalysis.isAnalytical) {
        reasons.push('zapytanie analityczne');
      }
    } else if (modelName === 'gpt-5') {
      reasons.push('najnowsza technologia AI');
      if (queryAnalysis.isAnalytical) {
        reasons.push('zaawansowana analiza');
      }
      if (queryAnalysis.requiresCreativity) {
        reasons.push('zadania kreatywne');
      }
    }

    return reasons.join(', ');
  }

  /**
   * Pobiera statystyki użycia modeli
   * @returns {Object} - Statystyki
   */
  static getUsageStats() {
    const stats = this.loadStatsFromStorage();
    return {
      totalQueries: stats.totalQueries || 0,
      modelUsage: stats.modelUsage || {},
      totalCostSaved: stats.totalCostSaved || 0,
      averageResponseTime: stats.averageResponseTime || {},
      totalCostSpent: stats.totalCostSpent || 0,
      lastUpdate: stats.lastUpdate || new Date().toISOString(),
      recommendation: this.generateStatsRecommendation(stats)
    };
  }

  /**
   * Zapisuje statystyki użycia modelu
   * @param {string} modelName - Nazwa użytego modelu
   * @param {number} cost - Koszt zapytania
   * @param {number} responseTime - Czas odpowiedzi w ms
   */
  static recordUsage(modelName, cost, responseTime) {
    const stats = this.loadStatsFromStorage();
    
    // Aktualizuj podstawowe statystyki
    stats.totalQueries = (stats.totalQueries || 0) + 1;
    stats.totalCostSpent = (stats.totalCostSpent || 0) + cost;
    stats.lastUpdate = new Date().toISOString();
    
    // Inicjalizuj modelUsage jeśli nie istnieje
    if (!stats.modelUsage) {
      stats.modelUsage = {};
    }
    
    // Aktualizuj statystyki dla konkretnego modelu
    if (!stats.modelUsage[modelName]) {
      stats.modelUsage[modelName] = {
        count: 0,
        totalCost: 0,
        averageResponseTime: 0,
        totalResponseTime: 0
      };
    }
    
    const modelStats = stats.modelUsage[modelName];
    modelStats.count += 1;
    modelStats.totalCost += cost;
    modelStats.totalResponseTime += responseTime;
    modelStats.averageResponseTime = modelStats.totalResponseTime / modelStats.count;
    
    // Oblicz oszczędności (porównanie z zawsze używaniem gpt-4o)
    const gpt4oCost = this.calculateEstimatedCost('gpt-4o', { input: 1000, output: 300 });
    if (modelName !== 'gpt-4o') {
      const savedCost = gpt4oCost - cost;
      stats.totalCostSaved = (stats.totalCostSaved || 0) + Math.max(0, savedCost);
    }
    
    this.saveStatsToStorage(stats);
    console.log(`[SmartModelSelector] Zapisano statystyki: ${modelName}, koszt: $${cost.toFixed(4)}, czas: ${responseTime}ms`);
  }

  /**
   * Ładuje statystyki z localStorage
   * @returns {Object} - Statystyki
   */
  static loadStatsFromStorage() {
    try {
      const statsJson = localStorage.getItem('ai_model_stats');
      return statsJson ? JSON.parse(statsJson) : {};
    } catch (error) {
      console.warn('[SmartModelSelector] Błąd ładowania statystyk:', error);
      return {};
    }
  }

  /**
   * Zapisuje statystyki do localStorage
   * @param {Object} stats - Statystyki do zapisania
   */
  static saveStatsToStorage(stats) {
    try {
      localStorage.setItem('ai_model_stats', JSON.stringify(stats));
    } catch (error) {
      console.warn('[SmartModelSelector] Błąd zapisywania statystyk:', error);
    }
  }

  /**
   * Generuje rekomendacje na podstawie statystyk
   * @param {Object} stats - Statystyki
   * @returns {string} - Rekomendacja
   */
  static generateStatsRecommendation(stats) {
    if (!stats.totalQueries || stats.totalQueries === 0) {
      return "Statystyki będą dostępne po pierwszych zapytaniach";
    }
    
    const recommendations = [];
    
    // Analiza oszczędności
    if (stats.totalCostSaved > 0) {
      recommendations.push(`Zaoszczędzono $${stats.totalCostSaved.toFixed(2)} dzięki optymalizacji modeli`);
    }
    
    // Analiza najpopularniejszego modelu
    const modelUsage = stats.modelUsage || {};
    const modelKeys = Object.keys(modelUsage);
    
    if (modelKeys.length > 0) {
      const mostUsedModel = modelKeys.reduce((a, b) => 
        (modelUsage[a]?.count || 0) > (modelUsage[b]?.count || 0) ? a : b
      );
      
      if (mostUsedModel && modelUsage[mostUsedModel]) {
        recommendations.push(`Najczęściej używany model: ${mostUsedModel} (${modelUsage[mostUsedModel].count} zapytań)`);
      }
    }
    
    // Analiza wydajności
    const totalCost = stats.totalCostSpent || 0;
    const avgCostPerQuery = totalCost / stats.totalQueries;
    
    if (avgCostPerQuery < 0.01) {
      recommendations.push("Doskonała optymalizacja kosztów");
    } else if (avgCostPerQuery < 0.05) {
      recommendations.push("Dobra optymalizacja kosztów");
    } else {
      recommendations.push("Rozważ użycie tańszych modeli dla prostszych zapytań");
    }
    
    return recommendations.join('. ');
  }

  /**
   * Resetuje statystyki
   */
  static resetStats() {
    localStorage.removeItem('ai_model_stats');
    console.log('[SmartModelSelector] Statystyki zostały zresetowane');
  }

  /**
   * Testuje różne modele dla zapytania (tryb porównawczy)
   * @param {string} query - Zapytanie testowe
   * @param {number} dataSize - Rozmiar danych
   * @returns {Array} - Porównanie modeli
   */
  static compareModelsForQuery(query, dataSize = 1000) {
    const results = [];
    const models = Object.keys(this.MODEL_SPECS);
    
    for (const model of models) {
      const config = this.buildModelConfig(
        model, 
        this.analyzeQueryCharacteristics(query),
        this.estimateTokenUsage(dataSize, 'medium')
      );
      
      results.push({
        model,
        estimatedCost: config.estimatedCost,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
        rationale: config.rationale,
        recommended: model === this.selectOptimalModel(query, dataSize).model
      });
    }
    
    return results.sort((a, b) => a.estimatedCost - b.estimatedCost);
  }
}
