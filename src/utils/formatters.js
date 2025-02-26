// src/utils/formatters.js

/**
 * Formatuje datę w czytelny sposób
 * 
 * @param {Date|Object|string|number} date - Data do sformatowania (może być timestamp z Firebase)
 * @param {Object} options - Opcje formatowania
 * @returns {string} Sformatowana data
 */
export const formatDate = (date, options = {}) => {
    if (!date) return '—';
    
    // Obsługa timestampu Firestore
    if (date && typeof date === 'object' && 'toDate' in date) {
      date = date.toDate();
    }
    
    try {
      const dateObj = new Date(date);
      
      const defaultOptions = {
        dateStyle: 'medium',
        timeStyle: 'short',
        ...options
      };
      
      return new Intl.DateTimeFormat('pl-PL', defaultOptions).format(dateObj);
    } catch (error) {
      console.error('Error formatting date:', error);
      return String(date);
    }
  };
  
  /**
   * Formatuje liczbę jako walutę
   * 
   * @param {number} amount - Kwota do sformatowania
   * @param {string} currency - Kod waluty (domyślnie PLN)
   * @returns {string} Sformatowana kwota
   */
  export const formatCurrency = (amount, currency = 'PLN') => {
    if (amount === undefined || amount === null) return '—';
    
    try {
      return new Intl.NumberFormat('pl-PL', {
        style: 'currency',
        currency
      }).format(amount);
    } catch (error) {
      console.error('Error formatting currency:', error);
      return String(amount);
    }
  };
  
  /**
   * Formatuje liczbę z określoną precyzją
   * 
   * @param {number} value - Wartość do sformatowania
   * @param {number} precision - Liczba miejsc po przecinku
   * @returns {string} Sformatowana liczba
   */
  export const formatNumber = (value, precision = 2) => {
    if (value === undefined || value === null) return '—';
    
    try {
      return new Intl.NumberFormat('pl-PL', {
        minimumFractionDigits: precision,
        maximumFractionDigits: precision
      }).format(value);
    } catch (error) {
      console.error('Error formatting number:', error);
      return String(value);
    }
  };
  
  /**
   * Tworzy skrócony tekst z wielokropkiem
   * 
   * @param {string} text - Tekst do skrócenia
   * @param {number} maxLength - Maksymalna długość
   * @returns {string} Skrócony tekst
   */
  export const truncateText = (text, maxLength = 100) => {
    if (!text) return '';
    
    if (text.length <= maxLength) return text;
    
    return text.substring(0, maxLength) + '...';
  };