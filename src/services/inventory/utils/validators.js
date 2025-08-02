// src/services/inventory/utils/validators.js

import { TRANSACTION_TYPES, RESERVATION_METHODS, STOCKTAKING_STATUS, FIREBASE_LIMITS } from '../config/constants.js';
import { convertTimestampToDate } from './formatters.js';

/**
 * Klasa błędu walidacji
 */
export class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * Waliduje czy wartość jest liczbą dodatnią
 * @param {any} value - Wartość do walidacji
 * @param {string} fieldName - Nazwa pola (dla błędów)
 * @returns {number} - Zwalidowana liczba
 * @throws {ValidationError} - Gdy wartość jest nieprawidłowa
 */
export const validatePositiveNumber = (value, fieldName = 'value') => {
  const numValue = parseFloat(value);
  
  if (isNaN(numValue)) {
    throw new ValidationError(`${fieldName} musi być liczbą`, fieldName);
  }
  
  if (numValue <= 0) {
    throw new ValidationError(`${fieldName} musi być liczbą dodatnią`, fieldName);
  }
  
  return numValue;
};

/**
 * Waliduje czy wartość jest liczbą nieujemną
 * @param {any} value - Wartość do walidacji
 * @param {string} fieldName - Nazwa pola (dla błędów)
 * @returns {number} - Zwalidowana liczba
 * @throws {ValidationError} - Gdy wartość jest nieprawidłowa
 */
export const validateNonNegativeNumber = (value, fieldName = 'value') => {
  const numValue = parseFloat(value);
  
  if (isNaN(numValue)) {
    throw new ValidationError(`${fieldName} musi być liczbą`, fieldName);
  }
  
  if (numValue < 0) {
    throw new ValidationError(`${fieldName} nie może być liczbą ujemną`, fieldName);
  }
  
  return numValue;
};

/**
 * Waliduje ilość (może być 0 lub dodatnia)
 * @param {any} quantity - Ilość do walidacji
 * @param {string} fieldName - Nazwa pola (dla błędów)
 * @returns {number} - Zwalidowana ilość
 * @throws {ValidationError} - Gdy ilość jest nieprawidłowa
 */
export const validateQuantity = (quantity, fieldName = 'quantity') => {
  return validateNonNegativeNumber(quantity, fieldName);
};

/**
 * Waliduje cenę
 * @param {any} price - Cena do walidacji
 * @param {string} fieldName - Nazwa pola (dla błędów)
 * @returns {number} - Zwalidowana cena
 * @throws {ValidationError} - Gdy cena jest nieprawidłowa
 */
export const validatePrice = (price, fieldName = 'price') => {
  return validateNonNegativeNumber(price, fieldName);
};

/**
 * Waliduje czy string nie jest pusty
 * @param {any} value - Wartość do walidacji
 * @param {string} fieldName - Nazwa pola (dla błędów)
 * @param {boolean} required - Czy pole jest wymagane (domyślnie true)
 * @returns {string} - Zwalidowany string
 * @throws {ValidationError} - Gdy wartość jest nieprawidłowa
 */
export const validateRequiredString = (value, fieldName = 'value', required = true) => {
  if (value === null || value === undefined) {
    if (required) {
      throw new ValidationError(`${fieldName} jest wymagane`, fieldName);
    }
    return '';
  }
  
  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} musi być tekstem`, fieldName);
  }
  
  const trimmedValue = value.trim();
  
  if (required && trimmedValue === '') {
    throw new ValidationError(`${fieldName} nie może być puste`, fieldName);
  }
  
  return trimmedValue;
};

/**
 * Waliduje ID (musi być niepustym stringiem)
 * @param {any} id - ID do walidacji
 * @param {string} fieldName - Nazwa pola (dla błędów)
 * @returns {string} - Zwalidowane ID
 * @throws {ValidationError} - Gdy ID jest nieprawidłowe
 */
export const validateId = (id, fieldName = 'id') => {
  return validateRequiredString(id, fieldName, true);
};

/**
 * Waliduje typ transakcji
 * @param {any} type - Typ transakcji do walidacji
 * @returns {string} - Zwalidowany typ transakcji
 * @throws {ValidationError} - Gdy typ jest nieprawidłowy
 */
export const validateTransactionType = (type) => {
  const validatedType = validateRequiredString(type, 'type');
  
  const validTypes = Object.values(TRANSACTION_TYPES);
  if (!validTypes.includes(validatedType)) {
    throw new ValidationError(`Nieprawidłowy typ transakcji. Dozwolone: ${validTypes.join(', ')}`, 'type');
  }
  
  return validatedType;
};

/**
 * Waliduje metodę rezerwacji
 * @param {any} method - Metoda rezerwacji do walidacji
 * @returns {string} - Zwalidowana metoda rezerwacji
 * @throws {ValidationError} - Gdy metoda jest nieprawidłowa
 */
export const validateReservationMethod = (method) => {
  const validatedMethod = validateRequiredString(method, 'reservationMethod');
  
  const validMethods = Object.values(RESERVATION_METHODS);
  if (!validMethods.includes(validatedMethod)) {
    throw new ValidationError(`Nieprawidłowa metoda rezerwacji. Dozwolone: ${validMethods.join(', ')}`, 'reservationMethod');
  }
  
  return validatedMethod;
};

/**
 * Waliduje status spisu z natury
 * @param {any} status - Status do walidacji
 * @returns {string} - Zwalidowany status
 * @throws {ValidationError} - Gdy status jest nieprawidłowy
 */
export const validateStocktakingStatus = (status) => {
  const validatedStatus = validateRequiredString(status, 'status');
  
  const validStatuses = Object.values(STOCKTAKING_STATUS);
  if (!validStatuses.includes(validatedStatus)) {
    throw new ValidationError(`Nieprawidłowy status spisu. Dozwolone: ${validStatuses.join(', ')}`, 'status');
  }
  
  return validatedStatus;
};

/**
 * Waliduje datę
 * @param {any} date - Data do walidacji
 * @param {string} fieldName - Nazwa pola (dla błędów)
 * @param {boolean} required - Czy pole jest wymagane (domyślnie false)
 * @returns {Date|null} - Zwalidowana data
 * @throws {ValidationError} - Gdy data jest nieprawidłowa
 */
export const validateDate = (date, fieldName = 'date', required = false) => {
  if (date === null || date === undefined) {
    if (required) {
      throw new ValidationError(`${fieldName} jest wymagane`, fieldName);
    }
    return null;
  }
  
  const convertedDate = convertTimestampToDate(date);
  
  if (!convertedDate) {
    throw new ValidationError(`${fieldName} musi być prawidłową datą`, fieldName);
  }
  
  return convertedDate;
};

/**
 * Waliduje czy data ważności jest w przyszłości (opcjonalnie)
 * @param {any} expiryDate - Data ważności do walidacji
 * @param {boolean} allowPast - Czy dozwolić daty z przeszłości (domyślnie true)
 * @returns {Date|null} - Zwalidowana data ważności
 * @throws {ValidationError} - Gdy data jest nieprawidłowa
 */
export const validateExpiryDate = (expiryDate, allowPast = true) => {
  const validatedDate = validateDate(expiryDate, 'expiryDate', false);
  
  if (validatedDate && !allowPast) {
    const now = new Date();
    if (validatedDate < now) {
      throw new ValidationError('Data ważności nie może być w przeszłości', 'expiryDate');
    }
  }
  
  return validatedDate;
};

/**
 * Waliduje dane pozycji magazynowej
 * @param {Object} itemData - Dane pozycji do walidacji
 * @returns {Object} - Zwalidowane dane pozycji
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 */
export const validateInventoryItemData = (itemData) => {
  if (!itemData || typeof itemData !== 'object') {
    throw new ValidationError('Dane pozycji magazynowej są wymagane');
  }
  
  const validated = {};
  
  // Nazwa jest wymagana
  validated.name = validateRequiredString(itemData.name, 'name');
  
  // Opis jest opcjonalny
  validated.description = validateRequiredString(itemData.description || '', 'description', false);
  
  // Kategoria jest opcjonalna
  validated.category = validateRequiredString(itemData.category || '', 'category', false);
  
  // Jednostka jest opcjonalna
  validated.unit = validateRequiredString(itemData.unit || '', 'unit', false);
  
  // Numer CAS jest opcjonalny
  validated.casNumber = validateRequiredString(itemData.casNumber || '', 'casNumber', false);
  
  // Ilość (może być 0)
  if (itemData.quantity !== undefined) {
    validated.quantity = validateQuantity(itemData.quantity);
  }
  
  // Cena jednostkowa
  if (itemData.unitPrice !== undefined) {
    validated.unitPrice = validatePrice(itemData.unitPrice);
  }
  
  // Ilość zarezerwowana
  if (itemData.bookedQuantity !== undefined) {
    validated.bookedQuantity = validateQuantity(itemData.bookedQuantity);
  }
  
  return validated;
};

/**
 * Waliduje dane magazynu
 * @param {Object} warehouseData - Dane magazynu do walidacji
 * @returns {Object} - Zwalidowane dane magazynu
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 */
export const validateWarehouseData = (warehouseData) => {
  if (!warehouseData || typeof warehouseData !== 'object') {
    throw new ValidationError('Dane magazynu są wymagane');
  }
  
  const validated = {};
  
  // Nazwa jest wymagana
  validated.name = validateRequiredString(warehouseData.name, 'name');
  
  // Opis jest opcjonalny
  validated.description = validateRequiredString(warehouseData.description || '', 'description', false);
  
  // Lokalizacja jest opcjonalna
  validated.location = validateRequiredString(warehouseData.location || '', 'location', false);
  
  return validated;
};

/**
 * Waliduje dane partii
 * @param {Object} batchData - Dane partii do walidacji
 * @returns {Object} - Zwalidowane dane partii
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 */
export const validateBatchData = (batchData) => {
  if (!batchData || typeof batchData !== 'object') {
    throw new ValidationError('Dane partii są wymagane');
  }
  
  const validated = {};
  
  // ID pozycji jest wymagane
  validated.itemId = validateId(batchData.itemId, 'itemId');
  
  // ID magazynu jest wymagane
  validated.warehouseId = validateId(batchData.warehouseId, 'warehouseId');
  
  // Ilość musi być dodatnia
  validated.quantity = validatePositiveNumber(batchData.quantity, 'quantity');
  
  // Numer partii jest opcjonalny
  validated.batchNumber = validateRequiredString(batchData.batchNumber || '', 'batchNumber', false);
  
  // Numer LOT jest opcjonalny
  validated.lotNumber = validateRequiredString(batchData.lotNumber || '', 'lotNumber', false);
  
  // Data ważności jest opcjonalna
  if (batchData.expiryDate !== undefined) {
    validated.expiryDate = validateExpiryDate(batchData.expiryDate);
  }
  
  // Cena jednostkowa jest opcjonalna
  if (batchData.unitPrice !== undefined) {
    validated.unitPrice = validatePrice(batchData.unitPrice);
  }
  
  // Notatki są opcjonalne
  validated.notes = validateRequiredString(batchData.notes || '', 'notes', false);
  
  return validated;
};

/**
 * Waliduje dane partii do aktualizacji (pola opcjonalne)
 * @param {Object} batchData - Dane partii do walidacji
 * @returns {Object} - Zwalidowane dane partii
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 */
export const validateBatchUpdateData = (batchData) => {
  if (!batchData || typeof batchData !== 'object') {
    throw new ValidationError('Dane partii są wymagane');
  }
  
  const validated = {};
  
  // Wszystkie pola są opcjonalne podczas aktualizacji
  
  // Ilość może być 0 lub dodatnia (jeśli podana) - umożliwia całkowite zużycie partii
  if (batchData.quantity !== undefined) {
    validated.quantity = validateQuantity(batchData.quantity, 'quantity');
  }
  
  // Numer partii jest opcjonalny
  if (batchData.batchNumber !== undefined) {
    validated.batchNumber = validateRequiredString(batchData.batchNumber || '', 'batchNumber', false);
  }
  
  // Numer LOT jest opcjonalny
  if (batchData.lotNumber !== undefined) {
    validated.lotNumber = validateRequiredString(batchData.lotNumber || '', 'lotNumber', false);
  }
  
  // Data ważności jest opcjonalna
  if (batchData.expiryDate !== undefined) {
    validated.expiryDate = validateExpiryDate(batchData.expiryDate);
  }
  
  // Cena jednostkowa jest opcjonalna
  if (batchData.unitPrice !== undefined) {
    validated.unitPrice = validatePrice(batchData.unitPrice);
  }
  
  // Notatki są opcjonalne
  if (batchData.notes !== undefined) {
    validated.notes = validateRequiredString(batchData.notes || '', 'notes', false);
  }
  
  // Dodatkowe pola, które mogą być aktualizowane
  if (batchData.status !== undefined) {
    validated.status = validateRequiredString(batchData.status, 'status', false);
  }
  
  if (batchData.supplierBatchNumber !== undefined) {
    validated.supplierBatchNumber = validateRequiredString(batchData.supplierBatchNumber || '', 'supplierBatchNumber', false);
  }
  
  if (batchData.productionDate !== undefined) {
    validated.productionDate = validateExpiryDate(batchData.productionDate);
  }
  
  if (batchData.receiveDate !== undefined) {
    validated.receiveDate = validateExpiryDate(batchData.receiveDate);
  }
  
  if (batchData.quality !== undefined) {
    validated.quality = validateRequiredString(batchData.quality || '', 'quality', false);
  }
  
  if (batchData.certificate !== undefined) {
    validated.certificate = validateRequiredString(batchData.certificate || '', 'certificate', false);
  }
  
  return validated;
};

/**
 * Waliduje parametry paginacji
 * @param {Object} paginationParams - Parametry paginacji
 * @returns {Object} - Zwalidowane parametry paginacji
 * @throws {ValidationError} - Gdy parametry są nieprawidłowe
 */
export const validatePaginationParams = (paginationParams = {}) => {
  const validated = {};
  
  // Strona (musi być liczbą dodatnią)
  if (paginationParams.page !== undefined && paginationParams.page !== null) {
    validated.page = validatePositiveNumber(paginationParams.page, 'page');
  }
  
  // Rozmiar strony (musi być liczbą dodatnią, max FIREBASE_LIMITS.MAX_PAGE_SIZE)
  if (paginationParams.pageSize !== undefined && paginationParams.pageSize !== null) {
    const pageSize = validatePositiveNumber(paginationParams.pageSize, 'pageSize');
    if (pageSize > FIREBASE_LIMITS.MAX_DOCUMENT_SIZE / 1000) { // Przybliżony limit
      throw new ValidationError(`pageSize nie może być większy niż ${Math.floor(FIREBASE_LIMITS.MAX_DOCUMENT_SIZE / 1000)}`, 'pageSize');
    }
    validated.pageSize = pageSize;
  }
  
  return validated;
};

/**
 * Waliduje rozmiar pliku
 * @param {File} file - Plik do walidacji
 * @param {number} maxSizeBytes - Maksymalny rozmiar w bajtach (domyślnie 1MB)
 * @returns {File} - Zwalidowany plik
 * @throws {ValidationError} - Gdy plik jest za duży
 */
export const validateFileSize = (file, maxSizeBytes = FIREBASE_LIMITS.MAX_DOCUMENT_SIZE * 0.9) => {
  if (!file) {
    throw new ValidationError('Plik jest wymagany');
  }
  
  if (file.size > maxSizeBytes) {
    const maxSizeMB = (maxSizeBytes / (1024 * 1024)).toFixed(1);
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
    throw new ValidationError(`Plik jest zbyt duży (${fileSizeMB} MB). Maksymalny rozmiar to ${maxSizeMB} MB`);
  }
  
  return file;
};

/**
 * Waliduje listę ID dla operacji grupowych
 * @param {Array} ids - Lista ID do walidacji
 * @param {number} maxCount - Maksymalna liczba ID (domyślnie FIREBASE_LIMITS.BATCH_SIZE)
 * @returns {Array} - Zwalidowana lista ID
 * @throws {ValidationError} - Gdy lista jest nieprawidłowa
 */
export const validateIdList = (ids, maxCount = FIREBASE_LIMITS.BATCH_SIZE) => {
  if (!Array.isArray(ids)) {
    throw new ValidationError('Lista ID musi być tablicą');
  }
  
  if (ids.length === 0) {
    throw new ValidationError('Lista ID nie może być pusta');
  }
  
  if (ids.length > maxCount) {
    throw new ValidationError(`Lista ID nie może zawierać więcej niż ${maxCount} elementów`);
  }
  
  // Waliduj każde ID i usuń duplikaty
  const validatedIds = [];
  const seenIds = new Set();
  
  for (const id of ids) {
    const validatedId = validateId(id);
    if (!seenIds.has(validatedId)) {
      validatedIds.push(validatedId);
      seenIds.add(validatedId);
    }
  }
  
  return validatedIds;
};

/**
 * Waliduje dane inwentaryzacji
 * @param {Object} stocktakingData - Dane inwentaryzacji do walidacji
 * @param {boolean} isComplete - Czy wymagać wszystkich pól (dla tworzenia)
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 */
export const validateStocktakingData = (stocktakingData, isComplete = true) => {
  if (!stocktakingData || typeof stocktakingData !== 'object') {
    throw new ValidationError('Dane inwentaryzacji muszą być obiektem', 'stocktakingData');
  }

  if (isComplete) {
    // Wymagane pola przy tworzeniu
    if (!stocktakingData.name || typeof stocktakingData.name !== 'string' || stocktakingData.name.trim().length === 0) {
      throw new ValidationError('Nazwa inwentaryzacji jest wymagana', 'name');
    }

    if (stocktakingData.name.trim().length > 200) {
      throw new ValidationError('Nazwa inwentaryzacji nie może być dłuższa niż 200 znaków', 'name');
    }
  }

  // Opcjonalne walidacje
  if (stocktakingData.description && typeof stocktakingData.description !== 'string') {
    throw new ValidationError('Opis musi być tekstem', 'description');
  }

  if (stocktakingData.description && stocktakingData.description.length > 1000) {
    throw new ValidationError('Opis nie może być dłuższy niż 1000 znaków', 'description');
  }

  if (stocktakingData.location && typeof stocktakingData.location !== 'string') {
    throw new ValidationError('Lokalizacja musi być tekstem', 'location');
  }

  if (stocktakingData.type && typeof stocktakingData.type !== 'string') {
    throw new ValidationError('Typ inwentaryzacji musi być tekstem', 'type');
  }

  return true;
};

/**
 * Waliduje dane ceny dostawcy
 * @param {Object} supplierPriceData - Dane ceny dostawcy do walidacji
 * @param {boolean} isComplete - Czy wymagać wszystkich pól (dla tworzenia)
 * @returns {Object} - Zwalidowane i przekonwertowane dane
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 */
export const validateSupplierPriceData = (supplierPriceData, isComplete = true) => {
  if (!supplierPriceData || typeof supplierPriceData !== 'object') {
    throw new ValidationError('Dane ceny dostawcy muszą być obiektem', 'supplierPriceData');
  }

  const validated = {};

  if (isComplete) {
    // Wymagane pola przy tworzeniu
    if (!supplierPriceData.itemId || typeof supplierPriceData.itemId !== 'string') {
      throw new ValidationError('ID pozycji magazynowej jest wymagane', 'itemId');
    }
    validated.itemId = supplierPriceData.itemId;

    if (!supplierPriceData.supplierId || typeof supplierPriceData.supplierId !== 'string') {
      throw new ValidationError('ID dostawcy jest wymagane', 'supplierId');
    }
    validated.supplierId = supplierPriceData.supplierId;

    // Użyj validatePrice aby prawidłowo skonwertować i zwalidować cenę
    validated.price = validatePrice(supplierPriceData.price, 'price');
  }

  // Opcjonalne walidacje z przekonwertowaniem
  if (supplierPriceData.price !== undefined) {
    validated.price = validatePrice(supplierPriceData.price, 'price');
  }

  if (supplierPriceData.minQuantity !== undefined) {
    validated.minQuantity = validateQuantity(supplierPriceData.minQuantity, 'minQuantity');
  }

  if (supplierPriceData.currency && (typeof supplierPriceData.currency !== 'string' || supplierPriceData.currency.length !== 3)) {
    throw new ValidationError('Waluta musi być 3-znakowym kodem (np. PLN, EUR)', 'currency');
  }
  if (supplierPriceData.currency) {
    validated.currency = supplierPriceData.currency;
  }

  if (supplierPriceData.leadTime !== undefined && supplierPriceData.leadTime !== null) {
    validated.leadTime = validateQuantity(supplierPriceData.leadTime, 'leadTime');
  }

  if (supplierPriceData.supplierProductCode && typeof supplierPriceData.supplierProductCode !== 'string') {
    throw new ValidationError('Kod produktu dostawcy musi być tekstem', 'supplierProductCode');
  }
  if (supplierPriceData.supplierProductCode) {
    validated.supplierProductCode = supplierPriceData.supplierProductCode;
  }

  if (supplierPriceData.supplierProductName && typeof supplierPriceData.supplierProductName !== 'string') {
    throw new ValidationError('Nazwa produktu dostawcy musi być tekstem', 'supplierProductName');
  }
  if (supplierPriceData.supplierProductName) {
    validated.supplierProductName = supplierPriceData.supplierProductName;
  }

  if (supplierPriceData.notes && typeof supplierPriceData.notes !== 'string') {
    throw new ValidationError('Uwagi muszą być tekstem', 'notes');
  }
  if (supplierPriceData.notes && supplierPriceData.notes.length > 1000) {
    throw new ValidationError('Uwagi nie mogą być dłuższe niż 1000 znaków', 'notes');
  }
  if (supplierPriceData.notes) {
    validated.notes = supplierPriceData.notes;
  }

  // Walidacja dat
  if (supplierPriceData.validFrom && !isValidDate(supplierPriceData.validFrom)) {
    throw new ValidationError('Data ważności od musi być prawidłową datą', 'validFrom');
  }
  if (supplierPriceData.validFrom) {
    validated.validFrom = supplierPriceData.validFrom;
  }

  if (supplierPriceData.validTo && !isValidDate(supplierPriceData.validTo)) {
    throw new ValidationError('Data ważności do musi być prawidłową datą', 'validTo');
  }
  if (supplierPriceData.validTo) {
    validated.validTo = supplierPriceData.validTo;
  }

  if (supplierPriceData.validFrom && supplierPriceData.validTo) {
    const from = new Date(supplierPriceData.validFrom);
    const to = new Date(supplierPriceData.validTo);
    
    if (to <= from) {
      throw new ValidationError('Data ważności do musi być późniejsza niż data ważności od', 'validTo');
    }
  }

  // Kopiuj pozostałe pola bez walidacji
  Object.keys(supplierPriceData).forEach(key => {
    if (!validated.hasOwnProperty(key)) {
      validated[key] = supplierPriceData[key];
    }
  });

  return validated;
};

/**
 * Waliduje czy podana wartość jest prawidłową tablicą
 * @param {any} value - Wartość do sprawdzenia
 * @param {string} fieldName - Nazwa pola (dla lepszych komunikatów błędów)
 * @param {Object} options - Opcje walidacji
 * @param {number} options.minLength - Minimalna długość tablicy
 * @param {number} options.maxLength - Maksymalna długość tablicy
 * @param {boolean} options.allowEmpty - Czy pozwalać na pustą tablicę (domyślnie true)
 * @returns {Array} - Zwalidowana tablica
 * @throws {ValidationError} - Gdy walidacja się nie powiedzie
 */
export const validateArray = (value, fieldName, options = {}) => {
  const { minLength = 0, maxLength = Infinity, allowEmpty = true } = options;
  
  if (!Array.isArray(value)) {
    throw new ValidationError(`${fieldName} musi być tablicą`, fieldName);
  }
  
  if (!allowEmpty && value.length === 0) {
    throw new ValidationError(`${fieldName} nie może być pustą tablicą`, fieldName);
  }
  
  if (value.length < minLength) {
    throw new ValidationError(`${fieldName} musi zawierać co najmniej ${minLength} elementów`, fieldName);
  }
  
  if (value.length > maxLength) {
    throw new ValidationError(`${fieldName} może zawierać maksymalnie ${maxLength} elementów`, fieldName);
  }
  
  return value;
};

/**
 * Sprawdza czy podana wartość jest prawidłową datą
 * @private
 */
const isValidDate = (dateValue) => {
  if (!dateValue) return false;
  const date = new Date(dateValue);
  return date instanceof Date && !isNaN(date.getTime());
};