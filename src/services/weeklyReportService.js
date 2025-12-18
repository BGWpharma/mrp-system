/**
 * Weekly Consumption Report Service
 * Serwis do pobierania cotygodniowych raportów analizy konsumpcji MO
 */

import { doc, getDoc, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from './firebase/config';

/**
 * Pobiera najnowszy raport tygodniowej analizy konsumpcji
 * @returns {Promise<Object|null>} Obiekt raportu lub null jeśli brak
 */
export const getWeeklyConsumptionReport = async () => {
  try {
    const reportRef = doc(db, 'reports', 'weeklyConsumptionAnalysis');
    const reportDoc = await getDoc(reportRef);
    
    if (!reportDoc.exists()) {
      console.log('[WeeklyReport] Brak raportu weeklyConsumptionAnalysis');
      return null;
    }
    
    const data = reportDoc.data();
    
    // Konwertuj Timestamp na Date
    return {
      ...data,
      generatedAt: data.generatedAt?.toDate?.() || null,
      periodStart: data.periodStart?.toDate?.() || null,
      periodEnd: data.periodEnd?.toDate?.() || null,
    };
  } catch (error) {
    console.error('[WeeklyReport] Błąd pobierania raportu:', error);
    throw new Error(`Nie udało się pobrać raportu: ${error.message}`);
  }
};

/**
 * Pobiera historię raportów tygodniowych
 * @param {number} count - Liczba raportów do pobrania (domyślnie 10)
 * @returns {Promise<Array>} Lista raportów historycznych
 */
export const getWeeklyReportHistory = async (count = 10) => {
  try {
    const historyRef = collection(db, 'reports', 'weeklyConsumptionAnalysis', 'history');
    const q = query(
      historyRef,
      orderBy('generatedAt', 'desc'),
      limit(count)
    );
    
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        generatedAt: data.generatedAt?.toDate?.() || null,
        periodStart: data.periodStart?.toDate?.() || null,
        periodEnd: data.periodEnd?.toDate?.() || null,
        archivedAt: data.archivedAt?.toDate?.() || null,
      };
    });
  } catch (error) {
    console.error('[WeeklyReport] Błąd pobierania historii raportów:', error);
    throw new Error(`Nie udało się pobrać historii raportów: ${error.message}`);
  }
};

/**
 * Formatuje datę raportu do wyświetlenia
 * @param {Date} date - Data do sformatowania
 * @returns {string} Sformatowana data
 */
export const formatReportDate = (date) => {
  if (!date) return 'Brak daty';
  
  return date.toLocaleDateString('pl-PL', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

/**
 * Formatuje okres raportu
 * @param {Date} start - Data początkowa
 * @param {Date} end - Data końcowa
 * @returns {string} Sformatowany okres
 */
export const formatReportPeriod = (start, end) => {
  if (!start || !end) return 'Brak danych o okresie';
  
  const formatDate = (date) => date.toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
  
  return `${formatDate(start)} - ${formatDate(end)}`;
};

/**
 * Oblicza ile czasu minęło od wygenerowania raportu
 * @param {Date} generatedAt - Data wygenerowania raportu
 * @returns {string} Tekst opisujący czas
 */
export const getReportAge = (generatedAt) => {
  if (!generatedAt) return 'Nieznany';
  
  const now = new Date();
  const diffMs = now - generatedAt;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  
  if (diffDays > 0) {
    return `${diffDays} ${diffDays === 1 ? 'dzień' : 'dni'} temu`;
  } else if (diffHours > 0) {
    return `${diffHours} ${diffHours === 1 ? 'godzinę' : 'godzin'} temu`;
  } else {
    return 'Przed chwilą';
  }
};

/**
 * Sprawdza czy raport jest aktualny (wygenerowany w ciągu ostatnich 7 dni)
 * @param {Date} generatedAt - Data wygenerowania raportu
 * @returns {boolean} True jeśli raport jest aktualny
 */
export const isReportCurrent = (generatedAt) => {
  if (!generatedAt) return false;
  
  const now = new Date();
  const diffMs = now - generatedAt;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  
  return diffDays <= 7;
};

/**
 * Określa kolor severity dla problemów
 * @param {string} severity - Poziom ważności (high, medium, low)
 * @returns {string} Kolor MUI
 */
export const getSeverityColor = (severity) => {
  switch (severity) {
    case 'high':
      return 'error';
    case 'medium':
      return 'warning';
    case 'low':
      return 'info';
    default:
      return 'default';
  }
};

/**
 * Grupuje problemy według typu
 * @param {Array} issues - Lista problemów
 * @returns {Object} Problemy zgrupowane według typu
 */
export const groupIssuesByType = (issues) => {
  if (!issues || !Array.isArray(issues)) return {};
  
  return issues.reduce((acc, issue) => {
    const type = issue.type || 'other';
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type].push(issue);
    return acc;
  }, {});
};

/**
 * Tłumaczy typ problemu na polski
 * @param {string} type - Typ problemu
 * @returns {string} Przetłumaczony typ
 */
export const translateIssueType = (type) => {
  const translations = {
    'missing_consumption': 'Brak konsumpcji',
    'unused_reservation': 'Nieużyta rezerwacja',
    'fragmented_consumption': 'Fragmentaryczna konsumpcja',
    'other': 'Inne'
  };
  
  return translations[type] || type;
};




