/**
 * Formatuje obiekt Timestamp z Firestore na czytelny dla użytkownika format daty
 * @param {Object|Date} timestamp - Obiekt Timestamp z Firestore lub obiekt Date
 * @param {Boolean} includeTime - Czy dołączyć czas (domyślnie true)
 * @returns {String} Sformatowana data w formacie DD.MM.YYYY HH:MM lub DD.MM.YYYY
 */
export const formatTimestamp = (timestamp, includeTime = true) => {
  if (!timestamp) return '-';
  
  // Konwersja z Firestore Timestamp na Date jeśli potrzebne
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  
  return formatDate(date, includeTime);
};

/**
 * Formatuje obiekt Date na czytelny dla użytkownika format
 * @param {Date} date - Obiekt Date do sformatowania
 * @param {Boolean} includeTime - Czy dołączyć czas (domyślnie true)
 * @returns {String} Sformatowana data w formacie DD.MM.YYYY HH:MM lub DD.MM.YYYY
 */
export const formatDate = (date, includeTime = true) => {
  if (!date) return '-';
  
  // Obsługa przypadku gdy date jest stringiem
  if (typeof date === 'string') {
    date = new Date(date);
  }
  
  // Sprawdź czy data jest prawidłowa
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return '-';
  }
  
  // Formatowanie daty
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  
  if (!includeTime) {
    return `${day}.${month}.${year}`;
  }
  
  // Formatowanie czasu
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  
  return `${day}.${month}.${year} ${hours}:${minutes}`;
};

/**
 * Formatuje datę do formatu ISO dla inputów typu date
 * @param {Date|String} date - Data do sformatowania
 * @returns {String} Data w formacie YYYY-MM-DD
 */
export const formatDateForInput = (date) => {
  if (!date) return '';
  
  try {
    // Obsługa obiektu timestamp z Firebase
    if (date && typeof date.toDate === 'function') {
      date = date.toDate();
    }
    
    // Zapewnij, że pracujemy z obiektem Date
    let dateObj;
    
    if (typeof date === 'string') {
      // Sprawdź, czy format jest już poprawny dla pola input (YYYY-MM-DD)
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return date;
      }
      
      // Spróbuj sparsować datę
      dateObj = new Date(date);
    } else if (date instanceof Date) {
      // Jeśli to obiekt Date, użyj go bezpośrednio
      dateObj = date;
    } else {
      // Inne przypadki - próba konwersji na Date
      try {
        dateObj = new Date(date);
      } catch (error) {
        console.warn('Błąd konwersji daty:', error);
        return '';
      }
    }
    
    // Sprawdź czy data jest prawidłowa
    if (isNaN(dateObj.getTime())) {
      console.warn('Nieprawidłowy format daty:', date);
      return '';
    }
    
    // Formatuj do YYYY-MM-DD
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    
    const formattedDate = `${year}-${month}-${day}`;
    
    return formattedDate;
  } catch (error) {
    console.error('formatDateForInput - wyjątek przy formatowaniu daty:', error, 'dla wartości:', date);
    // W przypadku błędu zwracamy pusty string, aby nie łamać interfejsu
    return '';
  }
};

/**
 * Zwraca pierwszy dzień miesiąca
 * @param {Date} date - Data (opcjonalna, domyślnie bieżąca data)
 * @returns {Date} Pierwszy dzień miesiąca
 */
export const getFirstDayOfMonth = (date = new Date()) => {
  const newDate = new Date(date);
  newDate.setDate(1);
  return newDate;
};

/**
 * Zwraca ostatni dzień miesiąca
 * @param {Date} date - Data (opcjonalna, domyślnie bieżąca data)
 * @returns {Date} Ostatni dzień miesiąca
 */
export const getLastDayOfMonth = (date = new Date()) => {
  const newDate = new Date(date);
  newDate.setMonth(newDate.getMonth() + 1);
  newDate.setDate(0);
  return newDate;
};

/**
 * Bezpiecznie konwertuje różne formaty daty na obiekt Date
 * @param {*} dateValue - Wartość daty (Date, Timestamp, string, itp.)
 * @returns {Date|null} Zwraca obiekt Date lub null jeśli konwersja nie jest możliwa
 */
export const safeParseDate = (dateValue) => {
  if (!dateValue) {
    return null;
  }
  
  try {
    // Jeśli to już obiekt Date
    if (dateValue instanceof Date) {
      return dateValue;
    }
    
    // Jeśli to Timestamp z Firestore
    if (dateValue && typeof dateValue.toDate === 'function') {
      return dateValue.toDate();
    }
    
    // Jeśli to timestamp w sekundach (obiekt z polem seconds)
    if (dateValue && typeof dateValue === 'object' && dateValue.seconds) {
      return new Date(dateValue.seconds * 1000);
    }
    
    // Jeśli to string lub liczba - próba konwersji
    const parsedDate = new Date(dateValue);
    if (!isNaN(parsedDate.getTime())) {
      return parsedDate;
    }
    
    console.warn('safeParseDate - nieprawidłowy format daty:', dateValue);
    return null;
  } catch (error) {
    console.error('safeParseDate - błąd podczas konwersji daty:', error);
    return null;
  }
};

/**
 * Zapewnia, że wartość daty używana w formularzu jest stringiem w formacie YYYY-MM-DD
 * @param {*} dateValue - Dowolna wartość daty (obiekt Date, string, timestamp, itp.)
 * @returns {String} Data w formacie YYYY-MM-DD lub pusty string
 */
export const ensureDateInputFormat = (dateValue) => {
  if (!dateValue) return '';
  
  // Jeśli to już string w formacie YYYY-MM-DD, zwróć go bezpośrednio
  if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    return dateValue;
  }
  
  // W przeciwnym razie użyj formatDateForInput
  return formatDateForInput(dateValue);
}; 