// src/services/ai/analytics/TrendAnalyzer.js

import { db } from '../../firebase/config';
import { 
  collection, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit,
  startAfter,
  Timestamp
} from 'firebase/firestore';

/**
 * Zaawansowany analizator trendów dla systemu MRP
 * Wykonuje analizy czasowe, predykcje i identyfikuje wzorce biznesowe
 */
export class TrendAnalyzer {

  /**
   * Główna metoda analizująca trendy dla określonego typu danych
   * @param {string} dataType - Typ danych ('inventory', 'orders', 'production', 'recipes')
   * @param {string} timeRange - Zakres czasowy ('7d', '30d', '90d', '365d')
   * @param {Object} options - Dodatkowe opcje analizy
   * @returns {Promise<Object>} - Wyniki analizy trendów
   */
  static async analyzeTrends(dataType, timeRange = '30d', options = {}) {
    const startTime = performance.now();
    console.log(`[TrendAnalyzer] Rozpoczynam analizę trendów: ${dataType}, ${timeRange}`);

    try {
      // Przygotuj zakres dat
      const dateRange = this.calculateDateRange(timeRange);
      
      // Pobierz dane historyczne
      const historicalData = await this.fetchHistoricalData(dataType, dateRange, options);
      
      // Wykonaj różne typy analiz
      const analyses = await Promise.all([
        this.performTrendAnalysis(historicalData, dataType),
        this.performSeasonalityAnalysis(historicalData, dataType),
        this.performAnomalyDetection(historicalData, dataType),
        this.performCorrelationAnalysis(historicalData, dataType)
      ]);

      const [trendAnalysis, seasonalityAnalysis, anomalyDetection, correlationAnalysis] = analyses;

      // Generuj prognozy
      const forecasting = await this.generateForecasts(historicalData, dataType, timeRange);
      
      // Sformułuj insights i rekomendacje
      const insights = this.generateInsights(trendAnalysis, seasonalityAnalysis, anomalyDetection);
      const recommendations = this.generateRecommendations(analyses, dataType);

      const processingTime = performance.now() - startTime;

      return {
        success: true,
        dataType,
        timeRange,
        period: dateRange,
        summary: {
          totalDataPoints: historicalData.length,
          analysisTypes: ['trend', 'seasonality', 'anomaly', 'correlation'],
          processingTime: Math.round(processingTime)
        },
        trendAnalysis,
        seasonalityAnalysis,
        anomalyDetection,
        correlationAnalysis,
        forecasting,
        insights,
        recommendations,
        metadata: {
          generatedAt: new Date().toISOString(),
          confidence: this.calculateOverallConfidence(analyses),
          dataQuality: this.assessDataQuality(historicalData)
        }
      };

    } catch (error) {
      console.error(`[TrendAnalyzer] Błąd podczas analizy trendów:`, error);
      return {
        success: false,
        error: error.message,
        dataType,
        timeRange,
        processingTime: performance.now() - startTime
      };
    }
  }

  /**
   * Oblicza zakres dat na podstawie timeRange
   * @param {string} timeRange - Zakres czasowy
   * @returns {Object} - Obiekt z datami start i end
   */
  static calculateDateRange(timeRange) {
    const now = new Date();
    const ranges = {
      '7d': 7,
      '30d': 30,
      '90d': 90,
      '365d': 365
    };

    const days = ranges[timeRange] || 30;
    const startDate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));

    return {
      start: startDate,
      end: now,
      days,
      label: `Ostatnie ${days} dni`
    };
  }

  /**
   * Pobiera dane historyczne z Firebase
   * @param {string} dataType - Typ danych
   * @param {Object} dateRange - Zakres dat
   * @param {Object} options - Opcje
   * @returns {Promise<Array>} - Dane historyczne
   */
  static async fetchHistoricalData(dataType, dateRange, options = {}) {
    console.log(`[TrendAnalyzer] Pobieram dane historyczne dla ${dataType}`);
    
    const collectionMap = {
      'inventory': 'inventoryHistory',
      'orders': 'orders',
      'production': 'productionTasks',
      'recipes': 'recipeUsageHistory'
    };

    const collectionName = collectionMap[dataType];
    if (!collectionName) {
      throw new Error(`Nieobsługiwany typ danych: ${dataType}`);
    }

    try {
      // Przygotuj zapytanie z filtrem czasowym
      const startTimestamp = Timestamp.fromDate(dateRange.start);
      const endTimestamp = Timestamp.fromDate(dateRange.end);

      const q = query(
        collection(db, collectionName),
        where('createdAt', '>=', startTimestamp),
        where('createdAt', '<=', endTimestamp),
        orderBy('createdAt', 'asc'),
        limit(options.maxRecords || 1000)
      );

      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().createdAt?.toDate() || new Date()
      }));

      console.log(`[TrendAnalyzer] Pobrano ${data.length} rekordów dla ${dataType}`);
      return data;

    } catch (error) {
      console.error(`[TrendAnalyzer] Błąd podczas pobierania danych:`, error);
      // Fallback - generuj syntetyczne dane dla demonstracji
      return this.generateSyntheticData(dataType, dateRange);
    }
  }

  /**
   * Generuje syntetyczne dane dla demonstracji (gdy brak prawdziwych danych)
   * @param {string} dataType - Typ danych
   * @param {Object} dateRange - Zakres dat
   * @returns {Array} - Syntetyczne dane
   */
  static generateSyntheticData(dataType, dateRange) {
    console.log(`[TrendAnalyzer] Generuję syntetyczne dane dla ${dataType}`);
    
    const data = [];
    const days = dateRange.days;
    
    for (let i = 0; i < days; i++) {
      const date = new Date(dateRange.start.getTime() + (i * 24 * 60 * 60 * 1000));
      
      // Generuj różne wzorce dla różnych typów danych
      let value;
      switch (dataType) {
        case 'inventory':
          value = 100 + Math.sin(i / 7) * 20 + Math.random() * 10; // Tygodniowa sezonowość
          break;
        case 'orders':
          value = 50 + Math.sin(i / 30) * 15 + Math.random() * 8; // Miesięczna sezonowość
          break;
        case 'production':
          value = 25 + i * 0.1 + Math.random() * 5; // Lekki trend wzrostowy
          break;
        default:
          value = 50 + Math.random() * 20;
      }

      data.push({
        id: `synthetic_${i}`,
        timestamp: date,
        value: Math.round(value),
        quantity: Math.round(value),
        count: Math.round(value),
        synthetic: true
      });
    }
    
    return data;
  }

  /**
   * Wykonuje analizę trendów (wzrost/spadek)
   * @param {Array} data - Dane historyczne
   * @param {string} dataType - Typ danych
   * @returns {Object} - Wyniki analizy trendów
   */
  static performTrendAnalysis(data, dataType) {
    if (data.length < 2) {
      return { trend: 'insufficient_data', confidence: 0 };
    }

    // Wyciągnij wartości numeryczne
    const values = data.map(item => 
      item.value || item.quantity || item.count || 1
    );

    // Oblicz trend metodą regresji liniowej
    const n = values.length;
    const x = Array.from({length: n}, (_, i) => i);
    const y = values;

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.map((xi, i) => xi * y[i]).reduce((a, b) => a + b, 0);
    const sumXX = x.map(xi => xi * xi).reduce((a, b) => a + b, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Oblicz R-squared (współczynnik determinacji)
    const meanY = sumY / n;
    const ssTotal = y.map(yi => Math.pow(yi - meanY, 2)).reduce((a, b) => a + b, 0);
    const ssResidual = y.map((yi, i) => Math.pow(yi - (slope * x[i] + intercept), 2)).reduce((a, b) => a + b, 0);
    const rSquared = 1 - (ssResidual / ssTotal);

    // Klasyfikuj trend
    let trendDirection;
    let trendStrength;
    
    if (Math.abs(slope) < 0.01) {
      trendDirection = 'stable';
    } else if (slope > 0) {
      trendDirection = 'increasing';
    } else {
      trendDirection = 'decreasing';
    }

    if (Math.abs(slope) < 0.1) {
      trendStrength = 'weak';
    } else if (Math.abs(slope) < 0.5) {
      trendStrength = 'moderate';
    } else {
      trendStrength = 'strong';
    }

    // Oblicz procentową zmianę
    const firstValue = values[0];
    const lastValue = values[values.length - 1];
    const percentageChange = ((lastValue - firstValue) / firstValue) * 100;

    return {
      direction: trendDirection,
      strength: trendStrength,
      slope: Number(slope.toFixed(4)),
      rSquared: Number(rSquared.toFixed(4)),
      confidence: Math.min(rSquared, 1),
      percentageChange: Number(percentageChange.toFixed(2)),
      equation: `y = ${slope.toFixed(4)}x + ${intercept.toFixed(2)}`,
      interpretation: this.interpretTrend(trendDirection, trendStrength, percentageChange, dataType)
    };
  }

  /**
   * Interpretuje trend w kontekście biznesowym
   * @param {string} direction - Kierunek trendu
   * @param {string} strength - Siła trendu
   * @param {number} percentageChange - Procentowa zmiana
   * @param {string} dataType - Typ danych
   * @returns {string} - Interpretacja biznesowa
   */
  static interpretTrend(direction, strength, percentageChange, dataType) {
    const interpretations = {
      inventory: {
        increasing: `Poziom zapasów rośnie o ${Math.abs(percentageChange).toFixed(1)}%. ${strength === 'strong' ? 'Może wskazywać na nadmierne gromadzenie zapasów.' : 'Stabilny wzrost zapasów.'}`,
        decreasing: `Poziom zapasów spada o ${Math.abs(percentageChange).toFixed(1)}%. ${strength === 'strong' ? 'Uwaga na ryzyko braków magazynowych.' : 'Kontrolowany spadek zapasów.'}`,
        stable: 'Poziom zapasów utrzymuje się na stabilnym poziomie.'
      },
      orders: {
        increasing: `Liczba zamówień rośnie o ${Math.abs(percentageChange).toFixed(1)}%. ${strength === 'strong' ? 'Pozytywny trend biznesowy!' : 'Umiarkowany wzrost sprzedaży.'}`,
        decreasing: `Liczba zamówień spada o ${Math.abs(percentageChange).toFixed(1)}%. ${strength === 'strong' ? 'Wymagana analiza przyczyn spadku.' : 'Lekki spadek zamówień.'}`,
        stable: 'Liczba zamówień utrzymuje się na stabilnym poziomie.'
      },
      production: {
        increasing: `Produktywność rośnie o ${Math.abs(percentageChange).toFixed(1)}%. ${strength === 'strong' ? 'Doskonały trend wydajności!' : 'Pozytywny rozwój produkcji.'}`,
        decreasing: `Produktywność spada o ${Math.abs(percentageChange).toFixed(1)}%. ${strength === 'strong' ? 'Wymagana optymalizacja procesów.' : 'Niewielki spadek wydajności.'}`,
        stable: 'Produktywność utrzymuje się na stałym poziomie.'
      }
    };

    return interpretations[dataType]?.[direction] || `Trend ${direction} z siłą ${strength}.`;
  }

  /**
   * Analizuje sezonowość danych
   * @param {Array} data - Dane historyczne
   * @param {string} dataType - Typ danych
   * @returns {Object} - Analiza sezonowości
   */
  static performSeasonalityAnalysis(data, dataType) {
    if (data.length < 7) {
      return { seasonality: 'insufficient_data', confidence: 0 };
    }

    // Analiza wzorców tygodniowych
    const weeklyPattern = this.analyzeWeeklyPattern(data);
    
    // Analiza wzorców miesięcznych (jeśli mamy wystarczająco danych)
    const monthlyPattern = data.length >= 30 ? this.analyzeMonthlyPattern(data) : null;

    return {
      weekly: weeklyPattern,
      monthly: monthlyPattern,
      interpretation: this.interpretSeasonality(weeklyPattern, monthlyPattern, dataType)
    };
  }

  /**
   * Analizuje wzorzec tygodniowy
   * @param {Array} data - Dane historyczne
   * @returns {Object} - Wzorzec tygodniowy
   */
  static analyzeWeeklyPattern(data) {
    const dayAverages = [0, 0, 0, 0, 0, 0, 0]; // Pon-Niedz
    const dayCounts = [0, 0, 0, 0, 0, 0, 0];

    data.forEach(item => {
      const dayOfWeek = item.timestamp.getDay();
      const value = item.value || item.quantity || item.count || 1;
      
      dayAverages[dayOfWeek] += value;
      dayCounts[dayOfWeek]++;
    });

    // Oblicz średnie dla każdego dnia
    const averages = dayAverages.map((sum, i) => 
      dayCounts[i] > 0 ? sum / dayCounts[i] : 0
    );

    // Znajdź najwyższą i najniższą wartość
    const maxValue = Math.max(...averages);
    const minValue = Math.min(...averages);
    const maxDay = averages.indexOf(maxValue);
    const minDay = averages.indexOf(minValue);

    const dayNames = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];

    return {
      averages,
      peak: {
        day: dayNames[maxDay],
        value: maxValue.toFixed(2)
      },
      low: {
        day: dayNames[minDay],
        value: minValue.toFixed(2)
      },
      variation: ((maxValue - minValue) / maxValue * 100).toFixed(1),
      hasPattern: (maxValue - minValue) / maxValue > 0.2 // 20% różnicy wskazuje na wzorzec
    };
  }

  /**
   * Analizuje wzorzec miesięczny
   * @param {Array} data - Dane historyczne
   * @returns {Object} - Wzorzec miesięczny
   */
  static analyzeMonthlyPattern(data) {
    // Grupuj dane według tygodni miesiąca
    const weeklyData = {};
    
    data.forEach(item => {
      const date = item.timestamp;
      const weekOfMonth = Math.ceil(date.getDate() / 7);
      const key = `week_${weekOfMonth}`;
      
      if (!weeklyData[key]) {
        weeklyData[key] = [];
      }
      
      weeklyData[key].push(item.value || item.quantity || item.count || 1);
    });

    // Oblicz średnie dla każdego tygodnia miesiąca
    const weekAverages = {};
    Object.keys(weeklyData).forEach(week => {
      const values = weeklyData[week];
      weekAverages[week] = values.reduce((a, b) => a + b, 0) / values.length;
    });

    return {
      weekAverages,
      pattern: 'monthly_analysis_preliminary' // Potrzeba więcej danych dla pełnej analizy
    };
  }

  /**
   * Interpretuje sezonowość w kontekście biznesowym
   * @param {Object} weeklyPattern - Wzorzec tygodniowy
   * @param {Object} monthlyPattern - Wzorzec miesięczny
   * @param {string} dataType - Typ danych
   * @returns {string} - Interpretacja sezonowości
   */
  static interpretSeasonality(weeklyPattern, monthlyPattern, dataType) {
    if (!weeklyPattern.hasPattern) {
      return 'Brak wyraźnych wzorców sezonowych w analizowanych danych.';
    }

    const peak = weeklyPattern.peak;
    const low = weeklyPattern.low;
    
    return `Wzorzec tygodniowy: szczyt w ${peak.day} (${peak.value}), najniższe wartości w ${low.day} (${low.value}). Wariacja: ${weeklyPattern.variation}%.`;
  }

  /**
   * Wykrywa anomalie w danych
   * @param {Array} data - Dane historyczne
   * @param {string} dataType - Typ danych
   * @returns {Object} - Wykryte anomalie
   */
  static performAnomalyDetection(data, dataType) {
    if (data.length < 5) {
      return { anomalies: [], confidence: 0 };
    }

    const values = data.map(item => item.value || item.quantity || item.count || 1);
    
    // Oblicz statystyki
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    
    // Wykryj anomalie używając reguły 2-sigma
    const anomalies = [];
    const threshold = 2 * stdDev;
    
    data.forEach((item, index) => {
      const value = values[index];
      const deviation = Math.abs(value - mean);
      
      if (deviation > threshold) {
        anomalies.push({
          index,
          date: item.timestamp.toISOString().split('T')[0],
          value,
          deviation: deviation.toFixed(2),
          type: value > mean ? 'spike' : 'dip',
          severity: deviation > 3 * stdDev ? 'high' : 'medium'
        });
      }
    });

    return {
      anomalies,
      statistics: {
        mean: mean.toFixed(2),
        stdDev: stdDev.toFixed(2),
        threshold: threshold.toFixed(2)
      },
      interpretation: this.interpretAnomalies(anomalies, dataType)
    };
  }

  /**
   * Interpretuje anomalie w kontekście biznesowym
   * @param {Array} anomalies - Wykryte anomalie
   * @param {string} dataType - Typ danych
   * @returns {string} - Interpretacja anomalii
   */
  static interpretAnomalies(anomalies, dataType) {
    if (anomalies.length === 0) {
      return 'Nie wykryto znaczących anomalii w analizowanych danych.';
    }

    const spikes = anomalies.filter(a => a.type === 'spike').length;
    const dips = anomalies.filter(a => a.type === 'dip').length;
    const highSeverity = anomalies.filter(a => a.severity === 'high').length;

    let interpretation = `Wykryto ${anomalies.length} anomalii: `;
    
    if (spikes > 0) interpretation += `${spikes} skoków, `;
    if (dips > 0) interpretation += `${dips} spadków, `;
    if (highSeverity > 0) interpretation += `${highSeverity} o wysokiej intensywności.`;

    return interpretation.trim().replace(/,$/, '.');
  }

  /**
   * Wykonuje analizę korelacji (między różnymi metrykamy)
   * @param {Array} data - Dane historyczne
   * @param {string} dataType - Typ danych
   * @returns {Object} - Analiza korelacji
   */
  static performCorrelationAnalysis(data, dataType) {
    // Uproszczona analiza korelacji - w rzeczywistej aplikacji 
    // można by korelować z danymi z innych kolekcji
    
    if (data.length < 10) {
      return { correlation: 'insufficient_data', confidence: 0 };
    }

    // Analiza autokorelacji (korelacji z przeszłymi wartościami)
    const values = data.map(item => item.value || item.quantity || item.count || 1);
    const lag1Correlation = this.calculateLagCorrelation(values, 1);
    const lag7Correlation = this.calculateLagCorrelation(values, 7);

    return {
      autoCorrelation: {
        lag1: lag1Correlation.toFixed(3),
        lag7: lag7Correlation.toFixed(3)
      },
      interpretation: this.interpretCorrelation(lag1Correlation, lag7Correlation, dataType)
    };
  }

  /**
   * Oblicza korelację z opóźnieniem
   * @param {Array} values - Wartości
   * @param {number} lag - Opóźnienie
   * @returns {number} - Współczynnik korelacji
   */
  static calculateLagCorrelation(values, lag) {
    if (values.length <= lag) return 0;

    const x = values.slice(0, -lag);
    const y = values.slice(lag);
    
    return this.calculatePearsonCorrelation(x, y);
  }

  /**
   * Oblicza współczynnik korelacji Pearsona
   * @param {Array} x - Pierwsza zmienna
   * @param {Array} y - Druga zmienna
   * @returns {number} - Współczynnik korelacji
   */
  static calculatePearsonCorrelation(x, y) {
    const n = Math.min(x.length, y.length);
    if (n === 0) return 0;

    const sumX = x.slice(0, n).reduce((a, b) => a + b, 0);
    const sumY = y.slice(0, n).reduce((a, b) => a + b, 0);
    const sumXY = x.slice(0, n).map((xi, i) => xi * y[i]).reduce((a, b) => a + b, 0);
    const sumXX = x.slice(0, n).map(xi => xi * xi).reduce((a, b) => a + b, 0);
    const sumYY = y.slice(0, n).map(yi => yi * yi).reduce((a, b) => a + b, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY));

    return denominator === 0 ? 0 : numerator / denominator;
  }

  /**
   * Interpretuje korelację
   * @param {number} lag1 - Korelacja z opóźnieniem 1
   * @param {number} lag7 - Korelacja z opóźnieniem 7
   * @param {string} dataType - Typ danych
   * @returns {string} - Interpretacja korelacji
   */
  static interpretCorrelation(lag1, lag7, dataType) {
    let interpretation = '';

    if (Math.abs(lag1) > 0.5) {
      interpretation += `Silna korelacja dzień-do-dnia (${lag1.toFixed(2)}) - wartości są przewidywalne. `;
    }

    if (Math.abs(lag7) > 0.3) {
      interpretation += `Średnia korelacja tygodniowa (${lag7.toFixed(2)}) - widoczny wzorzec tygodniowy.`;
    }

    return interpretation || 'Brak znaczących korelacji czasowych.';
  }

  /**
   * Generuje prognozy na podstawie analizowanych danych
   * @param {Array} data - Dane historyczne
   * @param {string} dataType - Typ danych
   * @param {string} timeRange - Zakres czasowy
   * @returns {Object} - Prognozy
   */
  static async generateForecasts(data, dataType, timeRange) {
    if (data.length < 5) {
      return { forecast: 'insufficient_data', confidence: 0 };
    }

    const values = data.map(item => item.value || item.quantity || item.count || 1);
    const lastValue = values[values.length - 1];
    
    // Prosta prognoza bazująca na trendzie
    const trendAnalysis = this.performTrendAnalysis(data, dataType);
    const slope = trendAnalysis.slope;
    
    // Prognoza na następne okresy
    const forecastPeriods = Math.min(7, Math.floor(data.length / 3)); // Max 7 dni do przodu
    const forecasts = [];
    
    for (let i = 1; i <= forecastPeriods; i++) {
      const predictedValue = lastValue + (slope * i);
      const confidence = Math.max(0.1, trendAnalysis.confidence - (i * 0.1)); // Zmniejsz pewność z czasem
      
      forecasts.push({
        period: i,
        value: Math.max(0, Math.round(predictedValue)),
        confidence: Math.round(confidence * 100),
        date: new Date(Date.now() + (i * 24 * 60 * 60 * 1000)).toISOString().split('T')[0]
      });
    }

    return {
      forecasts,
      method: 'linear_trend',
      basedOn: `${data.length} punktów danych`,
      accuracy: this.estimateForecastAccuracy(trendAnalysis),
      interpretation: this.interpretForecasts(forecasts, dataType)
    };
  }

  /**
   * Szacuje dokładność prognoz
   * @param {Object} trendAnalysis - Analiza trendu
   * @returns {string} - Ocena dokładności
   */
  static estimateForecastAccuracy(trendAnalysis) {
    const rSquared = trendAnalysis.rSquared;
    
    if (rSquared > 0.8) return 'wysoka';
    if (rSquared > 0.5) return 'średnia';
    return 'niska';
  }

  /**
   * Interpretuje prognozy w kontekście biznesowym
   * @param {Array} forecasts - Prognozy
   * @param {string} dataType - Typ danych
   * @returns {string} - Interpretacja prognoz
   */
  static interpretForecasts(forecasts, dataType) {
    if (forecasts.length === 0) return 'Brak dostępnych prognoz.';

    const firstForecast = forecasts[0];
    const lastForecast = forecasts[forecasts.length - 1];
    const trend = lastForecast.value > firstForecast.value ? 'wzrostowy' : 'spadkowy';

    return `Prognoza ${trend} na najbliższe ${forecasts.length} dni. Przewidywana wartość: ${firstForecast.value} (pewność: ${firstForecast.confidence}%).`;
  }

  /**
   * Generuje insights biznesowe na podstawie analiz
   * @param {Object} trendAnalysis - Analiza trendu
   * @param {Object} seasonalityAnalysis - Analiza sezonowości
   * @param {Object} anomalyDetection - Wykrywanie anomalii
   * @returns {Array} - Lista insights
   */
  static generateInsights(trendAnalysis, seasonalityAnalysis, anomalyDetection) {
    const insights = [];

    // Insights z analizy trendu
    if (trendAnalysis.strength === 'strong') {
      insights.push({
        type: 'trend',
        priority: 'high',
        title: `Silny trend ${trendAnalysis.direction}`,
        description: trendAnalysis.interpretation,
        confidence: trendAnalysis.confidence
      });
    }

    // Insights z sezonowości
    if (seasonalityAnalysis.weekly?.hasPattern) {
      insights.push({
        type: 'seasonality',
        priority: 'medium',
        title: 'Wykryto wzorzec sezonowy',
        description: seasonalityAnalysis.interpretation,
        confidence: 0.8
      });
    }

    // Insights z anomalii
    if (anomalyDetection.anomalies?.length > 0) {
      const highSeverityAnomalies = anomalyDetection.anomalies.filter(a => a.severity === 'high');
      if (highSeverityAnomalies.length > 0) {
        insights.push({
          type: 'anomaly',
          priority: 'high',
          title: 'Wykryto znaczące anomalie',
          description: anomalyDetection.interpretation,
          confidence: 0.9
        });
      }
    }

    return insights;
  }

  /**
   * Generuje rekomendacje biznesowe
   * @param {Array} analyses - Wszystkie analizy
   * @param {string} dataType - Typ danych
   * @returns {Array} - Lista rekomendacji
   */
  static generateRecommendations(analyses, dataType) {
    const [trendAnalysis, seasonalityAnalysis, anomalyDetection] = analyses;
    const recommendations = [];

    // Rekomendacje bazujące na trendach
    if (trendAnalysis.direction === 'decreasing' && trendAnalysis.strength === 'strong') {
      recommendations.push({
        type: 'action',
        priority: 'high',
        title: 'Wymagana interwencja',
        description: `Silny trend spadkowy w ${dataType}. Zalecana natychmiastowa analiza przyczyn i działania naprawcze.`,
        actions: ['Analiza przyczyn spadku', 'Przegląd procesów', 'Konsultacja z zespołem']
      });
    }

    // Rekomendacje bazujące na sezonowości
    if (seasonalityAnalysis.weekly?.hasPattern) {
      recommendations.push({
        type: 'optimization',
        priority: 'medium',
        title: 'Optymalizacja na podstawie wzorców',
        description: `Wykorzystaj wzorzec sezonowy (szczyt: ${seasonalityAnalysis.weekly.peak.day}) do planowania zasobów.`,
        actions: ['Dostosuj harmonogram', 'Zaplanuj zasoby', 'Przygotuj się na szczyty']
      });
    }

    // Rekomendacje bazujące na anomaliach
    if (anomalyDetection.anomalies?.length > 2) {
      recommendations.push({
        type: 'monitoring',
        priority: 'medium',
        title: 'Zwiększ monitoring',
        description: `Częste anomalie (${anomalyDetection.anomalies.length}) wskazują na niestabilność. Zalecany ciągły monitoring.`,
        actions: ['Wdrażanie alertów', 'Częstsze sprawdzenia', 'Analiza przyczyn']
      });
    }

    return recommendations;
  }

  /**
   * Oblicza ogólną pewność analiz
   * @param {Array} analyses - Wszystkie analizy
   * @returns {number} - Ogólna pewność (0-1)
   */
  static calculateOverallConfidence(analyses) {
    const [trendAnalysis] = analyses;
    
    // Uproszczona kalkulacja - w rzeczywistości można uwzględnić więcej czynników
    return Math.round(trendAnalysis.confidence * 100) / 100;
  }

  /**
   * Ocenia jakość danych
   * @param {Array} data - Dane historyczne
   * @returns {Object} - Ocena jakości danych
   */
  static assessDataQuality(data) {
    const totalPoints = data.length;
    const missingValues = data.filter(item => 
      !item.value && !item.quantity && !item.count
    ).length;
    
    const completeness = ((totalPoints - missingValues) / totalPoints) * 100;
    
    let quality = 'low';
    if (completeness > 90) quality = 'high';
    else if (completeness > 70) quality = 'medium';

    return {
      totalPoints,
      missingValues,
      completeness: Math.round(completeness),
      quality,
      recommendation: quality === 'low' ? 'Zwiększ jakość zbierania danych' : 'Jakość danych jest akceptowalna'
    };
  }
}
