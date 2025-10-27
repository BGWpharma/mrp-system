// src/services/ai/monitoring/MetricsCollector.js

/**
 * MetricsCollector - zbiera i analizuje metryki wydajności AI Assistant
 * Umożliwia tracking, analitykę i optymalizację systemu
 */
export class MetricsCollector {
  static STORAGE_KEY = 'ai_metrics_v1';
  static MAX_RECORDS = 1000; // Maksymalna liczba rekordów w localStorage

  /**
   * Zapisuje metrykę zapytania
   */
  static recordQuery(queryData) {
    try {
      const metric = {
        timestamp: Date.now(),
        query: this.sanitizeQuery(queryData.query),
        intent: queryData.intent,
        confidence: queryData.confidence,
        processingTime: queryData.processingTime,
        method: queryData.method, // v2_optimized, v2_cached, v1_fallback
        success: queryData.success,
        fromCache: queryData.fromCache || false,
        dataPoints: queryData.dataPoints,
        userId: queryData.userId || 'anonymous',
        
        // Dodatkowe metryki
        collections: queryData.collections,
        modelUsed: queryData.modelUsed,
        tokensUsed: queryData.tokensUsed,
        cost: queryData.cost
      };

      this.saveMetric(metric);
      
      console.log(`[MetricsCollector] Recorded: ${metric.method} - ${metric.processingTime.toFixed(2)}ms`);
      
    } catch (error) {
      console.error('[MetricsCollector] Error recording query:', error);
    }
  }

  /**
   * Pobiera statystyki za określony okres
   */
  static getStats(timeRange = '24h') {
    try {
      const metrics = this.loadMetrics();
      const cutoffTime = this.getCutoffTime(timeRange);
      
      const relevantMetrics = metrics.filter(m => m.timestamp >= cutoffTime);
      
      if (relevantMetrics.length === 0) {
        return this.getEmptyStats();
      }

      return {
        timeRange,
        totalQueries: relevantMetrics.length,
        
        // Wydajność
        performance: this.calculatePerformanceStats(relevantMetrics),
        
        // Cache
        cache: this.calculateCacheStats(relevantMetrics),
        
        // Metody
        methods: this.calculateMethodStats(relevantMetrics),
        
        // Intencje
        intents: this.calculateIntentStats(relevantMetrics),
        
        // Użytkownicy
        users: this.calculateUserStats(relevantMetrics),
        
        // Koszty
        costs: this.calculateCostStats(relevantMetrics),
        
        // Trendy
        trends: this.calculateTrends(relevantMetrics),
        
        // Generowane
        generatedAt: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('[MetricsCollector] Error getting stats:', error);
      return this.getEmptyStats();
    }
  }

  /**
   * Oblicza statystyki wydajności
   */
  static calculatePerformanceStats(metrics) {
    const times = metrics.map(m => m.processingTime).filter(t => t != null);
    
    if (times.length === 0) {
      return {
        avgResponseTime: 0,
        medianResponseTime: 0,
        p95ResponseTime: 0,
        minResponseTime: 0,
        maxResponseTime: 0
      };
    }

    const sorted = times.sort((a, b) => a - b);
    const sum = times.reduce((acc, t) => acc + t, 0);
    
    return {
      avgResponseTime: (sum / times.length).toFixed(2),
      medianResponseTime: sorted[Math.floor(sorted.length / 2)].toFixed(2),
      p95ResponseTime: sorted[Math.floor(sorted.length * 0.95)].toFixed(2),
      minResponseTime: sorted[0].toFixed(2),
      maxResponseTime: sorted[sorted.length - 1].toFixed(2)
    };
  }

  /**
   * Oblicza statystyki cache
   */
  static calculateCacheStats(metrics) {
    const cacheHits = metrics.filter(m => m.fromCache).length;
    const total = metrics.length;
    const hitRate = total > 0 ? (cacheHits / total * 100).toFixed(1) : 0;
    
    return {
      totalQueries: total,
      cacheHits: cacheHits,
      cacheMisses: total - cacheHits,
      hitRate: `${hitRate}%`,
      
      // Porównanie czasów
      avgTimeCached: this.avgTime(metrics.filter(m => m.fromCache)),
      avgTimeNonCached: this.avgTime(metrics.filter(m => !m.fromCache)),
      
      // Oszczędności czasu dzięki cache
      timeSaved: this.calculateTimeSaved(metrics)
    };
  }

  /**
   * Oblicza statystyki metod
   */
  static calculateMethodStats(metrics) {
    const methodCounts = {};
    const methodTimes = {};
    
    metrics.forEach(m => {
      const method = m.method || 'unknown';
      methodCounts[method] = (methodCounts[method] || 0) + 1;
      
      if (!methodTimes[method]) {
        methodTimes[method] = [];
      }
      if (m.processingTime != null) {
        methodTimes[method].push(m.processingTime);
      }
    });
    
    const methodStats = {};
    for (const method in methodCounts) {
      const times = methodTimes[method] || [];
      const avgTime = times.length > 0 
        ? (times.reduce((a, b) => a + b, 0) / times.length).toFixed(2)
        : 0;
      
      methodStats[method] = {
        count: methodCounts[method],
        percentage: ((methodCounts[method] / metrics.length) * 100).toFixed(1) + '%',
        avgTime: avgTime
      };
    }
    
    return methodStats;
  }

  /**
   * Oblicza statystyki intencji
   */
  static calculateIntentStats(metrics) {
    const intentCounts = {};
    
    metrics.forEach(m => {
      const intent = m.intent || 'unknown';
      intentCounts[intent] = (intentCounts[intent] || 0) + 1;
    });
    
    // Sortuj po popularności
    const sorted = Object.entries(intentCounts)
      .map(([intent, count]) => ({
        intent,
        count,
        percentage: ((count / metrics.length) * 100).toFixed(1) + '%'
      }))
      .sort((a, b) => b.count - a.count);
    
    return {
      total: Object.keys(intentCounts).length,
      top10: sorted.slice(0, 10),
      all: sorted
    };
  }

  /**
   * Oblicza statystyki użytkowników
   */
  static calculateUserStats(metrics) {
    const userCounts = {};
    
    metrics.forEach(m => {
      const userId = m.userId || 'anonymous';
      userCounts[userId] = (userCounts[userId] || 0) + 1;
    });
    
    const uniqueUsers = Object.keys(userCounts).length;
    const totalQueries = metrics.length;
    const avgQueriesPerUser = uniqueUsers > 0 
      ? (totalQueries / uniqueUsers).toFixed(1)
      : 0;
    
    // Top użytkownicy
    const topUsers = Object.entries(userCounts)
      .map(([userId, count]) => ({ userId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    return {
      uniqueUsers,
      totalQueries,
      avgQueriesPerUser,
      topUsers
    };
  }

  /**
   * Oblicza statystyki kosztów
   */
  static calculateCostStats(metrics) {
    const totalCost = metrics
      .filter(m => m.cost != null)
      .reduce((sum, m) => sum + m.cost, 0);
    
    const avgCostPerQuery = metrics.length > 0 
      ? (totalCost / metrics.length).toFixed(4)
      : 0;
    
    // Koszty według metody
    const costByMethod = {};
    metrics.forEach(m => {
      if (m.cost != null) {
        const method = m.method || 'unknown';
        if (!costByMethod[method]) {
          costByMethod[method] = { total: 0, count: 0 };
        }
        costByMethod[method].total += m.cost;
        costByMethod[method].count++;
      }
    });
    
    for (const method in costByMethod) {
      costByMethod[method].avg = (costByMethod[method].total / costByMethod[method].count).toFixed(4);
    }
    
    return {
      totalCost: totalCost.toFixed(4),
      avgCostPerQuery: avgCostPerQuery,
      costByMethod
    };
  }

  /**
   * Oblicza trendy (porównanie z poprzednim okresem)
   */
  static calculateTrends(metrics) {
    // Podziel na dwie połowy dla porównania
    const midpoint = Math.floor(metrics.length / 2);
    const firstHalf = metrics.slice(0, midpoint);
    const secondHalf = metrics.slice(midpoint);
    
    if (firstHalf.length === 0 || secondHalf.length === 0) {
      return { available: false };
    }
    
    const firstAvgTime = this.avgTime(firstHalf);
    const secondAvgTime = this.avgTime(secondHalf);
    
    const timeChange = secondAvgTime - firstAvgTime;
    const timeChangePercent = firstAvgTime > 0 
      ? ((timeChange / firstAvgTime) * 100).toFixed(1)
      : 0;
    
    const firstCacheRate = firstHalf.filter(m => m.fromCache).length / firstHalf.length * 100;
    const secondCacheRate = secondHalf.filter(m => m.fromCache).length / secondHalf.length * 100;
    const cacheRateChange = (secondCacheRate - firstCacheRate).toFixed(1);
    
    return {
      available: true,
      responseTime: {
        change: timeChange.toFixed(2),
        changePercent: timeChangePercent + '%',
        trend: timeChange < 0 ? 'improving' : 'degrading'
      },
      cacheHitRate: {
        change: cacheRateChange + '%',
        trend: parseFloat(cacheRateChange) > 0 ? 'improving' : 'degrading'
      },
      queryVolume: {
        firstPeriod: firstHalf.length,
        secondPeriod: secondHalf.length,
        change: secondHalf.length - firstHalf.length,
        trend: secondHalf.length > firstHalf.length ? 'increasing' : 'decreasing'
      }
    };
  }

  /**
   * Generuje raport w formacie tekstowym
   */
  static generateReport(timeRange = '24h') {
    const stats = this.getStats(timeRange);
    
    let report = `📊 AI Assistant - Raport Wydajności (${timeRange})\n`;
    report += `Wygenerowano: ${new Date().toLocaleString('pl-PL')}\n\n`;
    
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `📈 PODSUMOWANIE\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `Łączna liczba zapytań: ${stats.totalQueries}\n`;
    report += `Średni czas odpowiedzi: ${stats.performance.avgResponseTime}ms\n`;
    report += `Cache hit rate: ${stats.cache.hitRate}\n\n`;
    
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `⚡ WYDAJNOŚĆ\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `Średnia: ${stats.performance.avgResponseTime}ms\n`;
    report += `Mediana: ${stats.performance.medianResponseTime}ms\n`;
    report += `P95: ${stats.performance.p95ResponseTime}ms\n`;
    report += `Min: ${stats.performance.minResponseTime}ms\n`;
    report += `Max: ${stats.performance.maxResponseTime}ms\n\n`;
    
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `💾 CACHE\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `Hit rate: ${stats.cache.hitRate}\n`;
    report += `Cache hits: ${stats.cache.cacheHits}\n`;
    report += `Cache misses: ${stats.cache.cacheMisses}\n`;
    report += `Avg czas (cache): ${stats.cache.avgTimeCached}ms\n`;
    report += `Avg czas (no cache): ${stats.cache.avgTimeNonCached}ms\n`;
    report += `Zaoszczędzony czas: ${stats.cache.timeSaved}ms\n\n`;
    
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `🔧 METODY\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    for (const [method, data] of Object.entries(stats.methods)) {
      report += `${method}: ${data.count} (${data.percentage}) - avg: ${data.avgTime}ms\n`;
    }
    report += `\n`;
    
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `🎯 TOP 10 INTENCJI\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    stats.intents.top10.forEach((item, i) => {
      report += `${i + 1}. ${item.intent}: ${item.count} (${item.percentage})\n`;
    });
    report += `\n`;
    
    if (stats.trends.available) {
      report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      report += `📊 TRENDY\n`;
      report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      report += `Czas odpowiedzi: ${stats.trends.responseTime.change}ms (${stats.trends.responseTime.changePercent}) - ${stats.trends.responseTime.trend}\n`;
      report += `Cache hit rate: ${stats.trends.cacheHitRate.change} - ${stats.trends.cacheHitRate.trend}\n`;
      report += `Wolumen zapytań: ${stats.trends.queryVolume.change} - ${stats.trends.queryVolume.trend}\n`;
    }
    
    return report;
  }

  /**
   * Eksportuje metryki do CSV
   */
  static exportToCSV(timeRange = '24h') {
    const metrics = this.loadMetrics();
    const cutoffTime = this.getCutoffTime(timeRange);
    const relevantMetrics = metrics.filter(m => m.timestamp >= cutoffTime);
    
    let csv = 'timestamp,query,intent,confidence,processingTime,method,success,fromCache,userId\n';
    
    relevantMetrics.forEach(m => {
      csv += `${m.timestamp},"${m.query}",${m.intent},${m.confidence},${m.processingTime},${m.method},${m.success},${m.fromCache},${m.userId}\n`;
    });
    
    return csv;
  }

  // ==================== PRIVATE METHODS ====================

  static saveMetric(metric) {
    try {
      let metrics = this.loadMetrics();
      
      // Dodaj nową metrykę
      metrics.push(metric);
      
      // Ogranicz rozmiar (zachowaj najnowsze)
      if (metrics.length > this.MAX_RECORDS) {
        metrics = metrics.slice(-this.MAX_RECORDS);
      }
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(metrics));
    } catch (error) {
      console.error('[MetricsCollector] Error saving metric:', error);
      
      // Jeśli quota exceeded, usuń starsze rekordy
      if (error.name === 'QuotaExceededError') {
        this.pruneOldMetrics();
      }
    }
  }

  static loadMetrics() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('[MetricsCollector] Error loading metrics:', error);
      return [];
    }
  }

  static getCutoffTime(timeRange) {
    const now = Date.now();
    
    const ranges = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      'all': Infinity
    };
    
    const range = ranges[timeRange] || ranges['24h'];
    return now - range;
  }

  static avgTime(metrics) {
    const times = metrics.map(m => m.processingTime).filter(t => t != null);
    if (times.length === 0) return 0;
    return (times.reduce((a, b) => a + b, 0) / times.length).toFixed(2);
  }

  static calculateTimeSaved(metrics) {
    const cached = metrics.filter(m => m.fromCache);
    const nonCached = metrics.filter(m => !m.fromCache);
    
    if (cached.length === 0 || nonCached.length === 0) return 0;
    
    const avgCachedTime = parseFloat(this.avgTime(cached));
    const avgNonCachedTime = parseFloat(this.avgTime(nonCached));
    
    const timeSavedPerQuery = avgNonCachedTime - avgCachedTime;
    const totalTimeSaved = timeSavedPerQuery * cached.length;
    
    return totalTimeSaved.toFixed(2);
  }

  static sanitizeQuery(query) {
    // Usuń potencjalnie wrażliwe dane
    if (typeof query !== 'string') return 'unknown';
    return query.substring(0, 200); // Max 200 znaków
  }

  static getEmptyStats() {
    return {
      totalQueries: 0,
      performance: {},
      cache: {},
      methods: {},
      intents: { total: 0, top10: [], all: [] },
      users: {},
      costs: {},
      trends: { available: false }
    };
  }

  static pruneOldMetrics() {
    try {
      let metrics = this.loadMetrics();
      
      // Zachowaj tylko 50% najnowszych
      const keep = Math.floor(metrics.length / 2);
      metrics = metrics.slice(-keep);
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(metrics));
      console.log(`[MetricsCollector] Pruned to ${metrics.length} records`);
    } catch (error) {
      console.error('[MetricsCollector] Error pruning metrics:', error);
    }
  }

  /**
   * Czyści wszystkie metryki
   */
  static clear() {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      console.log('[MetricsCollector] Metrics cleared');
    } catch (error) {
      console.error('[MetricsCollector] Error clearing metrics:', error);
    }
  }
}

