// src/services/inventory/utils/formatters.js

import { Timestamp } from 'firebase/firestore';
import { PRECISION_DEFAULTS } from '../config/constants.js';

/**
 * Formatuje wartości liczbowe z określoną precyzją
 * @param {number} value - Wartość do sformatowania
 * @param {number} precision - Liczba miejsc po przecinku (domyślnie 3)
 * @returns {number} - Sformatowana wartość
 */
export const formatQuantityPrecision = (value, precision = PRECISION_DEFAULTS.QUANTITY) => {
  if (typeof value !== 'number' || isNaN(value)) return 0;
  return Math.round(value * Math.pow(10, precision)) / Math.pow(10, precision);
};

/**
 * Formatuje cenę z określoną precyzją
 * @param {number} price - Cena do sformatowania
 * @param {number} precision - Liczba miejsc po przecinku (domyślnie 2)
 * @returns {number} - Sformatowana cena
 */
export const formatPrice = (price, precision = PRECISION_DEFAULTS.PRICE) => {
  if (typeof price !== 'number' || isNaN(price)) return 0;
  return Math.round(price * Math.pow(10, precision)) / Math.pow(10, precision);
};

/**
 * Formatuje procent z określoną precyzją
 * @param {number} percentage - Procent do sformatowania
 * @param {number} precision - Liczba miejsc po przecinku (domyślnie 4)
 * @returns {number} - Sformatowany procent
 */
export const formatPercentage = (percentage, precision = PRECISION_DEFAULTS.PERCENTAGE) => {
  if (typeof percentage !== 'number' || isNaN(percentage)) return 0;
  return Math.round(percentage * Math.pow(10, precision)) / Math.pow(10, precision);
};

/**
 * Konwertuje Timestamp Firebase na obiekt Date
 * @param {Timestamp|Date|string} timestamp - Timestamp do konwersji
 * @returns {Date|null} - Obiekt Date lub null jeśli konwersja nie jest możliwa
 */
export const convertTimestampToDate = (timestamp) => {
  if (!timestamp) return null;
  
  if (timestamp instanceof Timestamp) {
    return timestamp.toDate();
  }
  
  if (timestamp instanceof Date) {
    return timestamp;
  }
  
  if (typeof timestamp === 'string') {
    const date = new Date(timestamp);
    return isNaN(date.getTime()) ? null : date;
  }
  
  return null;
};

/**
 * Formatuje datę do stringa w formacie lokalnym
 * @param {Date|Timestamp} date - Data do sformatowania
 * @param {string} locale - Lokalizacja (domyślnie 'pl-PL')
 * @param {Object} options - Opcje formatowania daty
 * @returns {string} - Sformatowana data
 */
export const formatDate = (date, locale = 'pl-PL', options = {}) => {
  const convertedDate = convertTimestampToDate(date);
  if (!convertedDate) return '';
  
  const defaultOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...options
  };
  
  return convertedDate.toLocaleDateString(locale, defaultOptions);
};

/**
 * Formatuje datę i czas do stringa w formacie lokalnym
 * @param {Date|Timestamp} datetime - Data i czas do sformatowania
 * @param {string} locale - Lokalizacja (domyślnie 'pl-PL')
 * @param {Object} options - Opcje formatowania daty i czasu
 * @returns {string} - Sformatowana data i czas
 */
export const formatDateTime = (datetime, locale = 'pl-PL', options = {}) => {
  const convertedDate = convertTimestampToDate(datetime);
  if (!convertedDate) return '';
  
  const defaultOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...options
  };
  
  return convertedDate.toLocaleString(locale, defaultOptions);
};

/**
 * Sprawdza czy data jest domyślną datą (1.01.1970)
 * @param {Date|Timestamp} date - Data do sprawdzenia
 * @returns {boolean} - True jeśli to domyślna data
 */
export const isDefaultDate = (date) => {
  const convertedDate = convertTimestampToDate(date);
  if (!convertedDate) return false;
  
  return convertedDate.getFullYear() <= 1970;
};

/**
 * Formatuje ilość z jednostką
 * @param {number} quantity - Ilość
 * @param {string} unit - Jednostka
 * @param {number} precision - Precyzja (domyślnie 3)
 * @returns {string} - Sformatowana ilość z jednostką
 */
export const formatQuantityWithUnit = (quantity, unit = '', precision = PRECISION_DEFAULTS.QUANTITY) => {
  const formattedQuantity = formatQuantityPrecision(quantity, precision);
  return unit ? `${formattedQuantity} ${unit}` : formattedQuantity.toString();
};

/**
 * Formatuje cenę z walutą
 * @param {number} price - Cena
 * @param {string} currency - Waluta (domyślnie 'PLN')
 * @param {number} precision - Precyzja (domyślnie 2)
 * @returns {string} - Sformatowana cena z walutą
 */
export const formatPriceWithCurrency = (price, currency = 'PLN', precision = PRECISION_DEFAULTS.PRICE) => {
  const formattedPrice = formatPrice(price, precision);
  return `${formattedPrice} ${currency}`;
};

/**
 * Formatuje numer partii/LOT do wyświetlania
 * @param {string} batchNumber - Numer partii
 * @param {string} lotNumber - Numer LOT
 * @param {string} fallback - Tekst zastępczy (domyślnie 'Bez numeru')
 * @returns {string} - Sformatowany numer partii
 */
export const formatBatchNumber = (batchNumber, lotNumber, fallback = 'Bez numeru') => {
  return batchNumber || lotNumber || fallback;
};

/**
 * Formatuje status do wyświetlania (pierwsza litera wielka)
 * @param {string} status - Status do sformatowania
 * @returns {string} - Sformatowany status
 */
export const formatStatus = (status) => {
  if (!status || typeof status !== 'string') return '';
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
};

/**
 * Formatuje rozmiar pliku
 * @param {number} bytes - Rozmiar w bajtach
 * @param {number} decimals - Liczba miejsc po przecinku (domyślnie 2)
 * @returns {string} - Sformatowany rozmiar pliku
 */
export const formatFileSize = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

/**
 * Skraca tekst do określonej długości z wielokropkiem
 * @param {string} text - Tekst do skrócenia
 * @param {number} maxLength - Maksymalna długość (domyślnie 50)
 * @param {string} suffix - Suffix do dodania (domyślnie '...')
 * @returns {string} - Skrócony tekst
 */
export const truncateText = (text, maxLength = 50, suffix = '...') => {
  if (!text || typeof text !== 'string') return '';
  if (text.length <= maxLength) return text;
  
  return text.substring(0, maxLength - suffix.length) + suffix;
};

/**
 * Formatuje różnicę czasu w czytelnej formie
 * @param {Date|Timestamp} startDate - Data początkowa
 * @param {Date|Timestamp} endDate - Data końcowa (domyślnie teraz)
 * @returns {string} - Sformatowana różnica czasu
 */
export const formatTimeDifference = (startDate, endDate = new Date()) => {
  const start = convertTimestampToDate(startDate);
  const end = convertTimestampToDate(endDate);
  
  if (!start || !end) return '';
  
  const diffMs = Math.abs(end - start);
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (diffDays > 0) {
    return `${diffDays} dni, ${diffHours} godz.`;
  } else if (diffHours > 0) {
    return `${diffHours} godz., ${diffMinutes} min.`;
  } else {
    return `${diffMinutes} min.`;
  }
};

/**
 * Formatuje datę na format lokalny polski
 * @param {Date|Timestamp|string} dateInput - Data do sformatowania
 * @returns {string} - Sformatowana data w formacie dd.mm.yyyy lub 'Nie określono'
 */
export const formatDateToLocal = (dateInput) => {
  if (!dateInput) return 'Nie określono';
  
  let date = dateInput;
  
  if (dateInput instanceof Timestamp) {
    date = dateInput.toDate();
  } else if (typeof dateInput === 'string') {
    date = new Date(dateInput);
  }
  
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return 'Nie określono';
  }
  
  return date.toLocaleDateString('pl-PL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};