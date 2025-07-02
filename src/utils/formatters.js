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
    
    try {
      // Obsługa timestampu Firestore z metodą toDate
      if (date && typeof date === 'object' && typeof date.toDate === 'function') {
        date = date.toDate();
      }
      
      // Obsługa obiektu Firestore Timestamp z polami seconds i nanoseconds
      if (date && typeof date === 'object' && 'seconds' in date && 'nanoseconds' in date) {
        date = new Date(date.seconds * 1000 + date.nanoseconds / 1000000);
      }
      
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
        // Nie loguj warning-u dla pustych lub nieprawidłowych dat
        return '—';
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
   * @param {number} precision - Liczba miejsc po przecinku (domyślnie automatyczna)
   * @returns {string} Sformatowana kwota
   */
  export const formatCurrency = (amount, currency = 'EUR', precision = null) => {
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
      // Jeśli precision nie jest określona, automatycznie wykryj potrzebną precyzję
      if (precision === null) {
        // Sprawdź czy liczba jest całkowita
        if (Number.isInteger(amount)) {
          precision = 0;
        } else {
          // Znajdź minimalną potrzebną precyzję (maksymalnie 4 miejsca)
          const amountStr = amount.toFixed(4);
          const trimmed = amountStr.replace(/\.?0+$/, '');
          const decimalPart = trimmed.split('.')[1];
          precision = decimalPart ? decimalPart.length : 0;
        }
      }
      
      return new Intl.NumberFormat('pl-PL', {
        style: 'currency',
        currency,
        minimumFractionDigits: precision,
        maximumFractionDigits: precision
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
   * Formatuje liczbę usuwając niepotrzebne zera po przecinku
   * 
   * @param {number} value - Wartość do sformatowania
   * @param {number} maxPrecision - Maksymalna liczba miejsc po przecinku (domyślnie 6)
   * @returns {string} Sformatowana liczba
   */
  export const formatNumberClean = (value, maxPrecision = 6) => {
    if (value === undefined || value === null) return '—';
    
    try {
      // Upewnij się, że value jest liczbą
      if (typeof value === 'string') {
        value = parseFloat(value);
      }
      
      if (isNaN(value)) {
        console.warn('Nieprawidłowa wartość liczby:', value);
        return '—';
      }
      
      // Zaokrąglij do maksymalnej precyzji
      const roundedValue = parseFloat(value.toFixed(maxPrecision));
      
      // Konwertuj na string i usuń niepotrzebne zera na końcu
      let result = roundedValue.toString();
      
      // Jeśli jest kropka dziesiętna, usuń niepotrzebne zera po przecinku
      if (result.includes('.')) {
        result = result.replace(/\.?0+$/, '');
      }
      
      // W polskim formacie używamy przecinka zamiast kropki
      return result.replace('.', ',');
    } catch (error) {
      console.error('Error formatting number clean:', error);
      return String(value);
    }
  };

  /**
   * Formatuje ilość towaru w pozycji magazynowej z zaokrągleniem do 4 cyfr po przecinku
   * bez wyświetlania nadmiarowych zer
   * 
   * @param {number} value - Wartość do sformatowania
   * @returns {string} Sformatowana liczba
   */
  export const formatQuantity = (value) => {
    if (value === undefined || value === null) return '—';
    
    try {
      // Upewnij się, że value jest liczbą
      if (typeof value === 'string') {
        value = parseFloat(value);
      }
      
      if (isNaN(value)) {
        console.warn('Nieprawidłowa wartość ilości:', value);
        return '—';
      }
      
      // Zaokrąglij do 4 miejsc po przecinku
      const roundedValue = parseFloat(value.toFixed(4));
      
      // Konwertuj na string i usuń niepotrzebne zera na końcu
      let result = roundedValue.toString();
      
      // Jeśli jest kropka dziesiętna, usuń niepotrzebne zera po przecinku
      if (result.includes('.')) {
        result = result.replace(/\.?0+$/, '');
      }
      
      // W polskim formacie używamy przecinka zamiast kropki
      return result.replace('.', ',');
    } catch (error) {
      console.error('Error formatting quantity:', error);
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
    
    // Jeśli data jest stringiem i jest pusty lub składa się tylko z białych znaków
    if (typeof date === 'string' && !date.trim()) {
      return '—';
    }
    
    // Sprawdź czy data nie jest obiektem z nullem lub undefined
    if (date === null || date === undefined) {
      return '—';
    }
    
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
        // Nie loguj warning-u dla pustych lub nieprawidłowych dat
        return '—';
      }
      
      // Formatuj datę i godzinę
      return new Intl.DateTimeFormat('pl-PL', {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(dateObj);
    } catch (error) {
      // Tylko loguj błędy rzeczywiste, nie warning-i
      return '—';
    }
  };