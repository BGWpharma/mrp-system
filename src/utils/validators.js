// src/utils/validators.js

/**
 * Sprawdza, czy ciąg znaków jest poprawnym adresem email
 * 
 * @param {string} email - Email do sprawdzenia
 * @returns {boolean} Czy email jest poprawny
 */
export const isValidEmail = (email) => {
    if (!email) return false;
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };
  
  /**
   * Sprawdza, czy hasło spełnia wymagania bezpieczeństwa
   * 
   * @param {string} password - Hasło do sprawdzenia
   * @returns {Object} Obiekt zawierający informację o poprawności i ewentualny komunikat błędu
   */
  export const validatePassword = (password) => {
    if (!password) {
      return { isValid: false, message: 'Hasło jest wymagane' };
    }
    
    if (password.length < 6) {
      return { isValid: false, message: 'Hasło musi mieć co najmniej 6 znaków' };
    }
    
    return { isValid: true, message: '' };
  };
  
  /**
   * Sprawdza, czy podana wartość jest liczbą
   * 
   * @param {*} value - Wartość do sprawdzenia
   * @returns {boolean} Czy wartość jest liczbą
   */
  export const isNumber = (value) => {
    if (value === null || value === undefined || value === '') return false;
    return !isNaN(Number(value));
  };
  
  /**
   * Sprawdza, czy podana wartość jest liczbą dodatnią
   * 
   * @param {*} value - Wartość do sprawdzenia
   * @returns {boolean} Czy wartość jest liczbą dodatnią
   */
  export const isPositiveNumber = (value) => {
    return isNumber(value) && Number(value) > 0;
  };
  
  /**
   * Sprawdza, czy podana wartość jest liczbą nieujemną (zero lub dodatnia)
   * 
   * @param {*} value - Wartość do sprawdzenia
   * @returns {boolean} Czy wartość jest liczbą nieujemną
   */
  export const isNonNegativeNumber = (value) => {
    return isNumber(value) && Number(value) >= 0;
  };
  
  /**
   * Sprawdza, czy podana data jest w przyszłości
   * 
   * @param {Date|string|number} date - Data do sprawdzenia
   * @returns {boolean} Czy data jest w przyszłości
   */
  export const isFutureDate = (date) => {
    if (!date) return false;
    
    const dateObj = new Date(date);
    const now = new Date();
    
    return dateObj > now;
  };
  
  /**
   * Sprawdza, czy wartość jest pusta (undefined, null, pusty string)
   * 
   * @param {*} value - Wartość do sprawdzenia
   * @returns {boolean} Czy wartość jest pusta
   */
  export const isEmpty = (value) => {
    return value === undefined || value === null || value === '';
  };
  
  /**
   * Sprawdza, czy obiekt zawiera wszystkie wymagane pola
   * 
   * @param {Object} obj - Obiekt do sprawdzenia
   * @param {Array<string>} requiredFields - Lista wymaganych pól
   * @returns {Object} Obiekt zawierający informację o poprawności i listę brakujących pól
   */
  export const hasRequiredFields = (obj, requiredFields) => {
    if (!obj || !requiredFields) {
      return { isValid: false, missingFields: requiredFields || [] };
    }
    
    const missingFields = requiredFields.filter(field => isEmpty(obj[field]));
    
    return {
      isValid: missingFields.length === 0,
      missingFields
    };
  };