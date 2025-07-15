import { useTranslation as useI18nextTranslation } from 'react-i18next';

/**
 * Niestandardowy hook do obsługi tłumaczeń
 * Rozszerza standardowy useTranslation z react-i18next o dodatkowe funkcjonalności
 */
export const useTranslation = (namespace) => {
  const { t, i18n, ready } = useI18nextTranslation(namespace);

  /**
   * Funkcja do tłumaczenia z fallback do oryginalnego tekstu
   * Jeśli klucz nie istnieje, zwraca oryginalny tekst zamiast klucza
   */
  const translate = (key, options = {}) => {
    const translation = t(key, { ...options, fallback: key });
    
    // Jeśli tłumaczenie jest równe kluczowi, prawdopodobnie nie zostało znalezione
    if (translation === key && options.fallback) {
      return options.fallback;
    }
    
    return translation;
  };

  /**
   * Sprawdza czy klucz tłumaczenia istnieje
   */
  const hasTranslation = (key) => {
    return i18n.exists(key);
  };

  /**
   * Zwraca obecny język
   */
  const currentLanguage = i18n.language || 'pl';

  /**
   * Sprawdza czy obecny język to polski
   */
  const isPolish = currentLanguage === 'pl';

  /**
   * Sprawdza czy obecny język to angielski  
   */
  const isEnglish = currentLanguage === 'en';

  /**
   * Zmienia język aplikacji
   */
  const changeLanguage = (lng) => {
    return i18n.changeLanguage(lng);
  };

  /**
   * Formatuje liczbę zgodnie z lokalizacją
   */
  const formatNumber = (number, options = {}) => {
    const locale = currentLanguage === 'pl' ? 'pl-PL' : 'en-US';
    return new Intl.NumberFormat(locale, options).format(number);
  };

  /**
   * Formatuje datę zgodnie z lokalizacją
   */
  const formatDate = (date, options = {}) => {
    const locale = currentLanguage === 'pl' ? 'pl-PL' : 'en-US';
    return new Intl.DateTimeFormat(locale, options).format(new Date(date));
  };

  /**
   * Formatuje walutę zgodnie z lokalizacją
   */
  const formatCurrency = (amount, currency = 'PLN') => {
    const locale = currentLanguage === 'pl' ? 'pl-PL' : 'en-US';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency
    }).format(amount);
  };

  return {
    // Podstawowe funkcje z react-i18next
    t: translate,
    i18n,
    ready,
    
    // Rozszerzone funkcjonalności
    translate,
    hasTranslation,
    currentLanguage,
    isPolish,
    isEnglish,
    changeLanguage,
    
    // Formatowanie według lokalizacji
    formatNumber,
    formatDate,
    formatCurrency
  };
}; 