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
  
  // Obsługa obiektu timestamp z Firebase
  if (date && typeof date.toDate === 'function') {
    date = date.toDate();
  }
  
  // Obsługa string w różnych formatach
  let dateObj;
  if (typeof date === 'string') {
    // Sprawdź, czy format jest już poprawny dla pola input (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date;
    }
    
    // Spróbuj sparsować datę
    dateObj = new Date(date);
  } else {
    // Jeśli to obiekt Date, użyj go bezpośrednio
    dateObj = date instanceof Date ? date : new Date(date);
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
  
  return `${year}-${month}-${day}`;
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