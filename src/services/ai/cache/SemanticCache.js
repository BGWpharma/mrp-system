// src/services/ai/cache/SemanticCache.js

/**
 * Semantic Cache - inteligentny cache wykorzystujący podobieństwo zapytań
 * Redukuje koszty i czas odpowiedzi dla podobnych zapytań
 */
export class SemanticCache {
  static SIMILARITY_THRESHOLD = 0.75; // 75% podobieństwa
  static TTL = 10 * 60 * 1000; // 10 minut
  static MAX_CACHE_SIZE = 100;
  static CACHE_KEY = 'ai_semantic_cache_v2';
  static STATS_KEY = 'ai_cache_stats';

  /**
   * Generuje "embedding" dla zapytania (uproszczona heurystyka)
   * W przyszłości można zastąpić prawdziwymi embeddingami z API
   */
  static generateEmbedding(text) {
    const normalized = text.toLowerCase()
      .replace(/[^\w\sąćęłńóśźż]/g, '')
      .trim();

    // Wyciągnij keywords (słowa > 3 znaki, bez stop words)
    const stopWords = new Set(['jest', 'są', 'ile', 'jaki', 'która', 'które', 'który', 'czy', 'jak', 'gdzie', 'kiedy', 'dlaczego']);
    
    const keywords = normalized
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word))
      .slice(0, 15); // Max 15 keywords

    // Wyciągnij liczby
    const numbers = (text.match(/\d+/g) || []).map(n => parseInt(n));

    // Wyciągnij operatory porównania
    const hasGreater = /ponad|powyżej|więcej|>/i.test(text);
    const hasLess = /poniżej|mniej|</i.test(text);
    const hasEqual = /równa|wynosi|=/i.test(text);

    // Wyciągnij kategorie
    const categories = {
      recipes: /receptur|recepty|recept/i.test(text),
      inventory: /magazyn|produkt|stan|zapas/i.test(text),
      orders: /zamówien|zamówi|order/i.test(text),
      production: /produkc|zlecen|zadani|MO/i.test(text),
      suppliers: /dostawc|supplier/i.test(text),
      customers: /klient|customer/i.test(text)
    };

    return {
      keywords: new Set(keywords),
      numbers: numbers.sort(),
      operators: { hasGreater, hasLess, hasEqual },
      categories,
      length: text.length,
      originalQuery: text
    };
  }

  /**
   * Oblicza podobieństwo między dwoma zapytaniami (Jaccard + heurystyki)
   */
  static calculateSimilarity(embedding1, embedding2) {
    let score = 0;
    let maxScore = 0;

    // 1. Podobieństwo keywords (najważniejsze) - waga 60%
    const keywords1 = embedding1.keywords;
    const keywords2 = embedding2.keywords;
    const intersection = [...keywords1].filter(k => keywords2.has(k)).length;
    const union = new Set([...keywords1, ...keywords2]).size;
    
    if (union > 0) {
      score += (intersection / union) * 60;
    }
    maxScore += 60;

    // 2. Podobieństwo kategorii - waga 20%
    let categoryMatches = 0;
    let categoryTotal = 0;
    for (const cat in embedding1.categories) {
      if (embedding1.categories[cat] || embedding2.categories[cat]) {
        categoryTotal++;
        if (embedding1.categories[cat] === embedding2.categories[cat]) {
          categoryMatches++;
        }
      }
    }
    if (categoryTotal > 0) {
      score += (categoryMatches / categoryTotal) * 20;
    }
    maxScore += 20;

    // 3. Podobieństwo liczb - waga 10%
    const numbers1 = embedding1.numbers;
    const numbers2 = embedding2.numbers;
    if (numbers1.length > 0 && numbers2.length > 0) {
      const numIntersection = numbers1.filter(n => numbers2.includes(n)).length;
      const numUnion = new Set([...numbers1, ...numbers2]).size;
      score += (numIntersection / numUnion) * 10;
    } else if (numbers1.length === 0 && numbers2.length === 0) {
      score += 10; // Oba nie mają liczb - to też jest podobieństwo
    }
    maxScore += 10;

    // 4. Podobieństwo operatorów - waga 10%
    let operatorMatches = 0;
    if (embedding1.operators.hasGreater === embedding2.operators.hasGreater) operatorMatches++;
    if (embedding1.operators.hasLess === embedding2.operators.hasLess) operatorMatches++;
    if (embedding1.operators.hasEqual === embedding2.operators.hasEqual) operatorMatches++;
    score += (operatorMatches / 3) * 10;
    maxScore += 10;

    return maxScore > 0 ? score / maxScore : 0;
  }

  /**
   * Pobiera wynik z cache jeśli istnieje podobne zapytanie
   */
  static async get(queryText) {
    try {
      const embedding = this.generateEmbedding(queryText);
      const cache = this.loadCache();

      // Usuń expired entries
      const now = Date.now();
      const validCache = cache.filter(entry => now - entry.timestamp < this.TTL);

      // Znajdź najbardziej podobne zapytanie
      let bestMatch = null;
      let bestSimilarity = 0;

      for (const entry of validCache) {
        const similarity = this.calculateSimilarity(embedding, entry.embedding);
        
        if (similarity > bestSimilarity && similarity >= this.SIMILARITY_THRESHOLD) {
          bestSimilarity = similarity;
          bestMatch = entry;
        }
      }

      if (bestMatch) {
        console.log(`[SemanticCache] 🎯 HIT! Similarity: ${(bestSimilarity * 100).toFixed(1)}%`);
        console.log(`[SemanticCache] Original: "${bestMatch.embedding.originalQuery}"`);
        console.log(`[SemanticCache] Current:  "${queryText}"`);
        
        // Update stats
        this.recordCacheHit(true, bestSimilarity);
        
        return {
          ...bestMatch.result,
          fromCache: true,
          cacheSimilarity: bestSimilarity,
          cachedQuery: bestMatch.embedding.originalQuery
        };
      }

      console.log(`[SemanticCache] ❌ MISS - no similar queries found`);
      this.recordCacheHit(false, 0);
      return null;

    } catch (error) {
      console.error('[SemanticCache] Error in get:', error);
      return null;
    }
  }

  /**
   * Zapisuje wynik do cache
   */
  static async set(queryText, result) {
    try {
      const embedding = this.generateEmbedding(queryText);
      
      const cacheEntry = {
        embedding,
        result: {
          ...result,
          fromCache: false // Remove cache flag when storing
        },
        timestamp: Date.now()
      };

      let cache = this.loadCache();

      // Usuń expired entries
      const now = Date.now();
      cache = cache.filter(entry => now - entry.timestamp < this.TTL);

      // Ogranicz rozmiar cache
      if (cache.length >= this.MAX_CACHE_SIZE) {
        // Usuń najstarsze wpisy
        cache.sort((a, b) => b.timestamp - a.timestamp);
        cache = cache.slice(0, this.MAX_CACHE_SIZE - 1);
      }

      // Dodaj nowy wpis
      cache.push(cacheEntry);

      // Zapisz
      this.saveCache(cache);

      console.log(`[SemanticCache] 💾 Cached query (total: ${cache.length})`);

    } catch (error) {
      console.error('[SemanticCache] Error in set:', error);
    }
  }

  /**
   * Czyści cache
   */
  static clear() {
    try {
      localStorage.removeItem(this.CACHE_KEY);
      console.log('[SemanticCache] Cache cleared');
    } catch (error) {
      console.error('[SemanticCache] Error clearing cache:', error);
    }
  }

  /**
   * Pobiera statystyki cache
   */
  static getStats() {
    try {
      const stats = JSON.parse(localStorage.getItem(this.STATS_KEY) || '{}');
      
      const hitRate = stats.total > 0 
        ? ((stats.hits || 0) / stats.total * 100).toFixed(1)
        : 0;

      const avgSimilarity = stats.totalSimilarity && stats.hits
        ? (stats.totalSimilarity / stats.hits).toFixed(2)
        : 0;

      return {
        hits: stats.hits || 0,
        misses: stats.misses || 0,
        total: stats.total || 0,
        hitRate: `${hitRate}%`,
        avgSimilarity: avgSimilarity,
        cacheSize: this.loadCache().length,
        lastReset: stats.lastReset || null
      };
    } catch (error) {
      console.error('[SemanticCache] Error getting stats:', error);
      return {
        hits: 0,
        misses: 0,
        total: 0,
        hitRate: '0%',
        avgSimilarity: 0,
        cacheSize: 0
      };
    }
  }

  /**
   * Resetuje statystyki
   */
  static resetStats() {
    try {
      localStorage.setItem(this.STATS_KEY, JSON.stringify({
        hits: 0,
        misses: 0,
        total: 0,
        totalSimilarity: 0,
        lastReset: new Date().toISOString()
      }));
      console.log('[SemanticCache] Stats reset');
    } catch (error) {
      console.error('[SemanticCache] Error resetting stats:', error);
    }
  }

  // ==================== PRIVATE METHODS ====================

  static loadCache() {
    try {
      const cacheData = localStorage.getItem(this.CACHE_KEY);
      if (!cacheData) return [];

      const cache = JSON.parse(cacheData);
      
      // Convert keywords back to Set
      return cache.map(entry => ({
        ...entry,
        embedding: {
          ...entry.embedding,
          keywords: new Set(entry.embedding.keywords || [])
        }
      }));
    } catch (error) {
      console.error('[SemanticCache] Error loading cache:', error);
      return [];
    }
  }

  static saveCache(cache) {
    try {
      // Convert Set to Array for JSON serialization
      const serializable = cache.map(entry => ({
        ...entry,
        embedding: {
          ...entry.embedding,
          keywords: [...entry.embedding.keywords]
        }
      }));

      localStorage.setItem(this.CACHE_KEY, JSON.stringify(serializable));
    } catch (error) {
      console.error('[SemanticCache] Error saving cache:', error);
      
      // If quota exceeded, clear old entries
      if (error.name === 'QuotaExceededError') {
        console.warn('[SemanticCache] Quota exceeded, clearing old entries');
        const reducedCache = cache.slice(-50); // Keep only 50 newest
        this.saveCache(reducedCache);
      }
    }
  }

  static recordCacheHit(isHit, similarity) {
    try {
      const stats = JSON.parse(localStorage.getItem(this.STATS_KEY) || '{}');

      stats.total = (stats.total || 0) + 1;
      
      if (isHit) {
        stats.hits = (stats.hits || 0) + 1;
        stats.totalSimilarity = (stats.totalSimilarity || 0) + similarity;
      } else {
        stats.misses = (stats.misses || 0) + 1;
      }

      localStorage.setItem(this.STATS_KEY, JSON.stringify(stats));
    } catch (error) {
      console.error('[SemanticCache] Error recording stats:', error);
    }
  }

  /**
   * Maintenance - usuwa expired entries (uruchamiane okresowo)
   */
  static maintenance() {
    try {
      const cache = this.loadCache();
      const now = Date.now();
      const validCache = cache.filter(entry => now - entry.timestamp < this.TTL);
      
      if (validCache.length < cache.length) {
        this.saveCache(validCache);
        console.log(`[SemanticCache] Maintenance: removed ${cache.length - validCache.length} expired entries`);
      }
    } catch (error) {
      console.error('[SemanticCache] Error in maintenance:', error);
    }
  }
}

// Uruchom maintenance co 5 minut
if (typeof window !== 'undefined') {
  setInterval(() => {
    SemanticCache.maintenance();
  }, 5 * 60 * 1000);
}

