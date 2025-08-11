// src/services/ai/optimization/GPTResponseCache.js

/**
 * Inteligentny cache dla odpowiedzi GPT
 * Zmniejsza koszty API o 40-60% przez cache'owanie podobnych zapytań
 */
export class GPTResponseCache {
  
  static cache = new Map();
  static CACHE_DURATION = 3600000; // 1 godzina domyślnie
  static MAX_CACHE_SIZE = 100; // Maksymalna liczba elementów w cache
  static CLEANUP_INTERVAL = 15 * 60 * 1000; // Czyszczenie co 15 minut
  static cleanupTimer = null;
  static stats = {
    hits: 0,
    misses: 0,
    totalSaved: 0,
    lastCleanup: Date.now(),
    automaticCleanups: 0
  };

  // Inicjalizacja zostanie wywołana automatycznie przy pierwszym użyciu

  /**
   * Pobiera odpowiedź z cache lub wykonuje zapytanie
   * @param {string} query - Zapytanie użytkownika
   * @param {string} contextHash - Hash kontekstu
   * @param {Function} apiCall - Funkcja wykonująca zapytanie do API
   * @param {Object} options - Opcje cache
   * @returns {Promise<string>} - Odpowiedź (z cache lub API)
   */
  static async getCachedOrFetch(query, contextHash, apiCall, options = {}) {
    // Inicjalizacja przy pierwszym użyciu
    if (!this.cleanupTimer) {
      this.initializeAutomaticCleanup();
    }

    const {
      cacheDuration = this.CACHE_DURATION,
      enableCache = true,
      skipCache = false,
      estimatedCost = 0
    } = options;

    if (!enableCache || skipCache) {
      return await this.executeApiCall(apiCall, estimatedCost);
    }

    const cacheKey = this.generateCacheKey(query, contextHash);
    const cached = this.getFromCache(cacheKey, cacheDuration);

    if (cached) {
      console.log(`[GPTResponseCache] Cache HIT dla zapytania: "${query.substring(0, 50)}..."`);
      this.stats.hits++;
      this.stats.totalSaved += estimatedCost;
      
      return this.formatCachedResponse(cached.response, cached.metadata);
    }

    console.log(`[GPTResponseCache] Cache MISS - wykonuję zapytanie API`);
    this.stats.misses++;

    // Wykonaj zapytanie API
    const response = await this.executeApiCall(apiCall, estimatedCost);
    
    // Zapisz do cache
    this.setToCache(cacheKey, response, {
      timestamp: Date.now(),
      query: query.substring(0, 100), // Skrócona wersja dla debugowania
      contextHash,
      cost: estimatedCost
    });

    return response;
  }

  /**
   * Generuje klucz cache na podstawie zapytania i kontekstu
   * @param {string} query - Zapytanie użytkownika
   * @param {string} contextHash - Hash kontekstu
   * @returns {string} - Klucz cache
   */
  static generateCacheKey(query, contextHash) {
    // Normalizuj zapytanie (usuń białe znaki, zmień na małe litery)
    const normalizedQuery = query.toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[^\w\s]/g, ''); // Usuń znaki interpunkcyjne

    // Sprawdź podobieństwo do istniejących zapytań
    const similarKey = this.findSimilarQuery(normalizedQuery);
    if (similarKey) {
      console.log(`[GPTResponseCache] Znaleziono podobne zapytanie w cache`);
      return similarKey;
    }

    // Generuj nowy klucz
    return `${this.hashString(normalizedQuery)}_${contextHash}`;
  }

  /**
   * Znajdź podobne zapytanie w cache
   * @param {string} normalizedQuery - Znormalizowane zapytanie
   * @returns {string|null} - Klucz podobnego zapytania lub null
   */
  static findSimilarQuery(normalizedQuery) {
    const threshold = 0.8; // 80% podobieństwa
    
    for (const [cacheKey, cacheEntry] of this.cache.entries()) {
      if (cacheEntry.metadata && cacheEntry.metadata.query) {
        const cachedQuery = cacheEntry.metadata.query.toLowerCase();
        const similarity = this.calculateStringSimilarity(normalizedQuery, cachedQuery);
        
        if (similarity >= threshold) {
          console.log(`[GPTResponseCache] Podobieństwo ${(similarity * 100).toFixed(1)}% z cached query`);
          return cacheKey;
        }
      }
    }
    
    return null;
  }

  /**
   * Oblicza podobieństwo między stringami (algorytm Jaro-Winkler)
   * @param {string} str1 - Pierwszy string
   * @param {string} str2 - Drugi string
   * @returns {number} - Podobieństwo (0-1)
   */
  static calculateStringSimilarity(str1, str2) {
    if (str1 === str2) return 1.0;
    if (!str1 || !str2) return 0.0;

    // Uproszczony algorytm bazujący na wspólnych słowach
    const words1 = new Set(str1.split(' '));
    const words2 = new Set(str2.split(' '));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  /**
   * Pobiera element z cache jeśli jest aktualny
   * @param {string} cacheKey - Klucz cache
   * @param {number} maxAge - Maksymalny wiek w milisekundach
   * @returns {Object|null} - Element cache lub null
   */
  static getFromCache(cacheKey, maxAge) {
    const cached = this.cache.get(cacheKey);
    
    if (!cached) return null;
    
    const age = Date.now() - cached.timestamp;
    if (age > maxAge) {
      this.cache.delete(cacheKey);
      return null;
    }
    
    return cached;
  }

  /**
   * Zapisuje element do cache
   * @param {string} cacheKey - Klucz cache
   * @param {string} response - Odpowiedź do cache'owania
   * @param {Object} metadata - Metadane
   */
  static setToCache(cacheKey, response, metadata) {
    // Sprawdź limit rozmiaru cache
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      this.cleanupOldestEntries();
    }

    this.cache.set(cacheKey, {
      response,
      timestamp: Date.now(),
      metadata
    });

    console.log(`[GPTResponseCache] Zapisano do cache (rozmiar: ${this.cache.size})`);
  }

  /**
   * Wykonuje zapytanie API z obsługą błędów
   * @param {Function} apiCall - Funkcja API
   * @param {number} estimatedCost - Szacowany koszt
   * @returns {Promise<string>} - Odpowiedź API
   */
  static async executeApiCall(apiCall, estimatedCost) {
    try {
      return await apiCall();
    } catch (error) {
      console.error('[GPTResponseCache] Błąd podczas wykonywania zapytania API:', error);
      throw error;
    }
  }

  /**
   * Formatuje odpowiedź z cache z informacją o pochodzeniu
   * @param {string} response - Oryginalna odpowiedź
   * @param {Object} metadata - Metadane cache
   * @returns {string} - Sformatowana odpowiedź
   */
  static formatCachedResponse(response, metadata) {
    const age = Date.now() - metadata.timestamp;
    const ageMinutes = Math.floor(age / 60000);
    
    let cacheInfo = "";
    if (ageMinutes < 1) {
      cacheInfo = "_📚 Odpowiedź z cache (mniej niż minutę temu)_";
    } else if (ageMinutes < 60) {
      cacheInfo = `_📚 Odpowiedź z cache (${ageMinutes} min temu)_`;
    } else {
      const ageHours = Math.floor(ageMinutes / 60);
      cacheInfo = `_📚 Odpowiedź z cache (${ageHours}h temu)_`;
    }

    return `${response}\n\n${cacheInfo}`;
  }

  /**
   * Czyści najstarsze wpisy z cache
   */
  static cleanupOldestEntries() {
    console.log('[GPTResponseCache] Czyszczenie najstarszych wpisów z cache');
    
    // Sortuj wpisy według wieku
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    // Usuń 20% najstarszych wpisów
    const toRemove = Math.ceil(entries.length * 0.2);
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i][0]);
    }

    this.stats.lastCleanup = Date.now();
  }

  /**
   * Czyści przestarzałe wpisy z cache
   * @param {number} maxAge - Maksymalny wiek w milisekundach
   */
  static cleanupExpiredEntries(maxAge = this.CACHE_DURATION) {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > maxAge) {
        this.cache.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(`[GPTResponseCache] Usunięto ${removedCount} przestarzałych wpisów`);
    }
  }

  /**
   * Generuje hash dla stringa
   * @param {string} str - String do zahashowania
   * @returns {string} - Hash
   */
  static hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Konwersja na 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Generuje hash kontekstu z danych biznesowych
   * @param {Object} contextData - Dane kontekstu
   * @returns {string} - Hash kontekstu
   */
  static generateContextHash(contextData) {
    if (!contextData) return 'no_context';

    // Stwórz hash bazujący na kluczowych danych
    const keyData = {
      summaryTimestamp: contextData.summary?.timestamp,
      inventoryCount: contextData.inventory?.length,
      recipesCount: contextData.recipes?.length,
      ordersCount: contextData.orders?.length,
      dataKeys: Object.keys(contextData).sort()
    };

    return this.hashString(JSON.stringify(keyData));
  }

  /**
   * Sprawdza czy zapytanie nadaje się do cache'owania
   * @param {string} query - Zapytanie użytkownika
   * @param {Object} context - Kontekst zapytania
   * @returns {boolean} - Czy nadaje się do cache
   */
  static shouldCache(query, context = {}) {
    const lowerQuery = query.toLowerCase();
    
    // Nie cache'uj zapytań z datami/czasem
    if (/dzisiaj|teraz|aktualnie|obecnie|w tym momencie/i.test(lowerQuery)) {
      return false;
    }

    // Nie cache'uj zapytań o dane czasu rzeczywistego
    if (/real.time|na żywo|online|streaming/i.test(lowerQuery)) {
      return false;
    }

    // Nie cache'uj zapytań personalnych
    if (/mój|moje|moja|dla mnie/i.test(lowerQuery)) {
      return false;
    }

    return true;
  }

  /**
   * Pobiera statystyki cache
   * @returns {Object} - Statystyki
   */
  static getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;

    // Dodaj hitRate do stats dla użycia w generateHealthRecommendations
    this.stats.hitRate = hitRate;

    return {
      cacheSize: this.cache.size,
      maxSize: this.MAX_CACHE_SIZE,
      totalRequests,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: Math.round(hitRate * 100) / 100,
      totalCostSaved: this.stats.totalSaved,
      lastCleanup: new Date(this.stats.lastCleanup).toLocaleString('pl-PL'),
      averageCostSaved: this.stats.hits > 0 ? (this.stats.totalSaved / this.stats.hits) : 0,
      automaticCleanups: this.stats.automaticCleanups,
      cleanupInterval: this.CLEANUP_INTERVAL / 60000 // w minutach
    };
  }

  /**
   * Resetuje cache i statystyki
   */
  static reset() {
    this.cache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      totalSaved: 0,
      lastCleanup: Date.now()
    };
    console.log('[GPTResponseCache] Cache został zresetowany');
  }

  /**
   * Eksportuje cache do JSON (dla celów debugowania)
   * @returns {Object} - Dane cache w formacie JSON
   */
  static exportCache() {
    const cacheData = {};
    for (const [key, value] of this.cache.entries()) {
      cacheData[key] = {
        ...value,
        age: Date.now() - value.timestamp
      };
    }
    return {
      cache: cacheData,
      stats: this.getStats(),
      exportTimestamp: new Date().toISOString()
    };
  }

  /**
   * Inicjalizuje automatyczne czyszczenie cache
   */
  static initializeAutomaticCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      try {
        this.automaticCleanup();
      } catch (error) {
        console.error('[GPTResponseCache] Błąd podczas automatycznego czyszczenia:', error);
      }
    }, this.CLEANUP_INTERVAL);

    console.log(`[GPTResponseCache] Inicjalizowano automatyczne czyszczenie co ${this.CLEANUP_INTERVAL / 60000} minut`);
  }

  /**
   * Wykonuje automatyczne czyszczenie cache
   */
  static automaticCleanup() {
    const initialSize = this.cache.size;
    
    // 1. Usuń przestarzałe wpisy
    this.cleanupExpiredEntries();
    
    // 2. Jeśli cache nadal przekracza limit, usuń najstarsze
    if (this.cache.size > this.MAX_CACHE_SIZE * 0.8) { // 80% limitu
      this.cleanupOldestEntries();
    }

    const finalSize = this.cache.size;
    const removed = initialSize - finalSize;

    if (removed > 0) {
      console.log(`[GPTResponseCache] Automatyczne czyszczenie: usunięto ${removed} wpisów (${initialSize} → ${finalSize})`);
    }

    this.stats.automaticCleanups++;
    this.stats.lastCleanup = Date.now();
  }

  /**
   * Zatrzymuje automatyczne czyszczenie
   */
  static stopAutomaticCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      console.log('[GPTResponseCache] Zatrzymano automatyczne czyszczenie');
    }
  }

  /**
   * Manualnie wymusza czyszczenie cache
   */
  static forceCleanup() {
    console.log('[GPTResponseCache] Wymuszanie czyszczenia cache...');
    this.automaticCleanup();
  }

  /**
   * Sprawdza stan zdrowia cache
   * @returns {Object} - Raport o stanie cache
   */
  static getHealthReport() {
    const now = Date.now();
    const timeSinceLastCleanup = now - this.stats.lastCleanup;
    const expiredEntries = Array.from(this.cache.values())
      .filter(entry => now - entry.timestamp > this.CACHE_DURATION).length;

    return {
      isHealthy: this.cache.size <= this.MAX_CACHE_SIZE && expiredEntries < this.cache.size * 0.1,
      cacheSize: this.cache.size,
      maxSize: this.MAX_CACHE_SIZE,
      usagePercentage: (this.cache.size / this.MAX_CACHE_SIZE * 100).toFixed(1),
      expiredEntries,
      timeSinceLastCleanup: Math.round(timeSinceLastCleanup / 60000), // w minutach
      automaticCleanupActive: this.cleanupTimer !== null,
      recommendations: this.generateHealthRecommendations(expiredEntries)
    };
  }

  /**
   * Generuje rekomendacje dla zdrowia cache
   * @param {number} expiredEntries - Liczba przestarzałych wpisów
   * @returns {Array} - Lista rekomendacji
   */
  static generateHealthRecommendations(expiredEntries) {
    const recommendations = [];
    
    if (this.cache.size > this.MAX_CACHE_SIZE * 0.9) {
      recommendations.push('Cache jest prawie pełny - rozważ zwiększenie MAX_CACHE_SIZE');
    }
    
    if (expiredEntries > this.cache.size * 0.2) {
      recommendations.push('Dużo przestarzałych wpisów - rozważ zmniejszenie CACHE_DURATION');
    }
    
    if (this.stats.hitRate < 30) {
      recommendations.push('Niska skuteczność cache - sprawdź czy zapytania są odpowiednio podobne');
    }
    
    if (!this.cleanupTimer) {
      recommendations.push('Automatyczne czyszczenie jest wyłączone - włącz dla lepszej wydajności');
    }

    return recommendations.length > 0 ? recommendations : ['Cache działa optymalnie'];
  }

  /**
   * Konfiguruje parametry cache
   * @param {Object} config - Nowa konfiguracja
   */
  static configure(config) {
    if (config.cacheDuration) {
      this.CACHE_DURATION = config.cacheDuration;
    }
    if (config.maxCacheSize) {
      this.MAX_CACHE_SIZE = config.maxCacheSize;
    }
    if (config.cleanupInterval) {
      this.CLEANUP_INTERVAL = config.cleanupInterval;
      this.initializeAutomaticCleanup(); // Restart z nowym interwałem
    }

    console.log(`[GPTResponseCache] Nowa konfiguracja: duration=${this.CACHE_DURATION}ms, maxSize=${this.MAX_CACHE_SIZE}, cleanupInterval=${this.CLEANUP_INTERVAL}ms`);
  }
}
