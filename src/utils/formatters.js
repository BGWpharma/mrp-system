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
    if (date && typeof date === 'object' && typeof date.toDate === 'function') {
      date = date.toDate();
    }
    
    try {
      // Obsługa stringa
      if (typeof date === 'string') {
        // Sprawdź czy jest to format ISO
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(date) || 
            /^\d{4}-\d{2}-\d{2}/.test(date)) {
          date = new Date(date);
        } else {
          // Spróbuj wyodrębnić datę z potencjalnie nieprawidłowego formatu
          const parts = date.split(/[./-]/);
          if (parts.length >= 3) {
            // Zakładamy format DD.MM.YYYY lub YYYY-MM-DD
            const year = parts[2].length === 4 ? parts[2] : parts[0];
            const month = parts[1] - 1; // Miesiące w JS są 0-based
            const day = parts[2].length === 4 ? parts[0] : parts[2];
            date = new Date(year, month, day);
          } else {
            date = new Date(date);
          }
        }
      }
      
      const dateObj = new Date(date);
      
      // Sprawdź czy data jest prawidłowa
      if (isNaN(dateObj.getTime())) {
        console.warn('Nieprawidłowy format daty:', date);
        return String(date);
      }
      
      const defaultOptions = {
        dateStyle: 'medium',
        ...options
      };
      
      // Użyj DateTimeFormat tylko jeśli data jest poprawna
      return new Intl.DateTimeFormat('pl-PL', defaultOptions).format(dateObj);
    } catch (error) {
      console.error('Error formatting date:', error, date);
      return String(date);
    }
  };
  
  /**
   * Formatuje liczbę jako walutę
   * 
   * @param {number} amount - Kwota do sformatowania
   * @param {string} currency - Kod waluty (domyślnie EUR)
   * @returns {string} Sformatowana kwota
   */
  export const formatCurrency = (amount, currency = 'EUR') => {
    if (amount === undefined || amount === null) return '—';
    
    // Upewnij się, że amount jest liczbą
    if (typeof amount === 'string') {
      amount = parseFloat(amount);
    }
    
    if (isNaN(amount)) {
      console.warn('Nieprawidłowa wartość kwoty:', amount);
      return '—';
    }
    
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

  /**
   * Formatuje datę wraz z godziną w czytelny sposób
   * 
   * @param {Date|Object|string|number} date - Data do sformatowania (może być timestamp z Firebase)
   * @returns {string} Sformatowana data wraz z godziną
   */
  export const formatDateTime = (date) => {
    if (!date) return '—';
    
    // Obsługa timestampu Firestore
    if (date && typeof date === 'object' && typeof date.toDate === 'function') {
      date = date.toDate();
    }
    
    try {
      // Obsługa stringa
      if (typeof date === 'string') {
        date = new Date(date);
      }
      
      const dateObj = new Date(date);
      
      // Sprawdź czy data jest prawidłowa
      if (isNaN(dateObj.getTime())) {
        console.warn('Nieprawidłowy format daty:', date);
        return String(date);
      }
      
      // Formatuj datę i godzinę
      return new Intl.DateTimeFormat('pl-PL', {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(dateObj);
    } catch (error) {
      console.error('Error formatting date:', error, date);
      return String(date);
    }
  };