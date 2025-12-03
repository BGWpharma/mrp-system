/**
 * Precision math utilities for BGW-MRP Cloud Functions
 * Avoid floating point errors in cost calculations
 */

/**
 * Zaokrągla liczbę do 4 miejsc dziesiętnych (unika błędów floating point)
 * @param {number} num - Liczba do zaokrąglenia
 * @return {number} - Zaokrąglona liczba
 */
function preciseRound(num) {
  return parseFloat(num.toFixed(4));
}

/**
 * Precyzyjne mnożenie dwóch liczb
 * @param {number} a - Pierwsza liczba
 * @param {number} b - Druga liczba
 * @return {number} - Wynik mnożenia
 */
function preciseMultiply(a, b) {
  return preciseRound(a * b);
}

/**
 * Precyzyjne dodawanie dwóch liczb
 * @param {number} a - Pierwsza liczba
 * @param {number} b - Druga liczba
 * @return {number} - Suma
 */
function preciseAdd(a, b) {
  return preciseRound(a + b);
}

/**
 * Precyzyjne odejmowanie dwóch liczb
 * @param {number} a - Pierwsza liczba
 * @param {number} b - Druga liczba
 * @return {number} - Różnica
 */
function preciseSubtract(a, b) {
  return preciseRound(a - b);
}

/**
 * Precyzyjne dzielenie dwóch liczb
 * @param {number} a - Dzielna
 * @param {number} b - Dzielnik
 * @return {number} - Iloraz (lub 0 jeśli dzielnik = 0)
 */
function preciseDivide(a, b) {
  return b !== 0 ? preciseRound(a / b) : 0;
}

module.exports = {
  preciseRound,
  preciseMultiply,
  preciseAdd,
  preciseSubtract,
  preciseDivide,
};

