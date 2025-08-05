// src/utils/mathUtils.js

/**
 * Eliminuje błędy precyzji liczb zmiennoprzecinkowych bez agresywnego zaokrąglania
 * @param {number} value - Wartość do skorygowania
 * @param {number} epsilon - Tolerancja błędu (domyślnie Number.EPSILON * 100)
 * @returns {number} - Skorygowana wartość
 */
export const fixFloatingPointPrecision = (value, epsilon = Number.EPSILON * 100) => {
  if (typeof value !== 'number' || isNaN(value)) return 0;
  
  // Sprawdź czy wartość jest bardzo bliska liczbie całkowitej
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) < epsilon) {
    return rounded;
  }
  
  // Sprawdź czy wartość jest bardzo bliska liczbie z określoną liczbą miejsc po przecinku
  for (let precision = 1; precision <= 10; precision++) {
    const factor = Math.pow(10, precision);
    const scaled = value * factor;
    const roundedScaled = Math.round(scaled);
    if (Math.abs(scaled - roundedScaled) < epsilon) {
      return roundedScaled / factor;
    }
  }
  
  // Jeśli nie znaleziono dobrego dopasowania, zwróć oryginalną wartość
  return value;
};

/**
 * Mnoży dwie liczby i koryguje błędy precyzji
 * @param {number} a - Pierwsza liczba
 * @param {number} b - Druga liczba
 * @returns {number} - Wynik mnożenia bez błędów precyzji
 */
export const preciseMultiply = (a, b) => {
  const result = a * b;
  return fixFloatingPointPrecision(result);
};

/**
 * Dzieli dwie liczby i koryguje błędy precyzji
 * @param {number} a - Dzielna
 * @param {number} b - Dzielnik
 * @returns {number} - Wynik dzielenia bez błędów precyzji
 */
export const preciseDivide = (a, b) => {
  if (b === 0) {
    console.warn('Próba dzielenia przez zero');
    return 0;
  }
  const result = a / b;
  return fixFloatingPointPrecision(result);
};

/**
 * Dodaje dwie liczby i koryguje błędy precyzji
 * @param {number} a - Pierwsza liczba
 * @param {number} b - Druga liczba
 * @returns {number} - Wynik dodawania bez błędów precyzji
 */
export const preciseAdd = (a, b) => {
  const result = a + b;
  return fixFloatingPointPrecision(result);
};

/**
 * Odejmuje dwie liczby i koryguje błędy precyzji
 * @param {number} a - Odjemna
 * @param {number} b - Odjemnik
 * @returns {number} - Wynik odejmowania bez błędów precyzji
 */
export const preciseSubtract = (a, b) => {
  const result = a - b;
  return fixFloatingPointPrecision(result);
};