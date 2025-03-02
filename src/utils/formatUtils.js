/**
 * Formatuje wartość liczbową jako walutę (PLN)
 * @param {number} value - wartość do sformatowania
 * @param {string} currency - symbol waluty (domyślnie PLN)
 * @returns {string} sformatowana wartość walutowa
 */
export const formatCurrency = (value, currency = 'PLN') => {
  const formatter = new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  
  return formatter.format(value);
};

/**
 * Formatuje liczbę jako tekst z określoną liczbą miejsc po przecinku
 * @param {number} value - wartość do sformatowania
 * @param {number} digits - liczba miejsc po przecinku (domyślnie 2)
 * @returns {string} sformatowana liczba
 */
export const formatNumber = (value, digits = 2) => {
  const formatter = new Intl.NumberFormat('pl-PL', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits
  });
  
  return formatter.format(value);
};

/**
 * Formatuje wartość procentową
 * @param {number} value - wartość do sformatowania (np. 0.25 dla 25%)
 * @param {number} digits - liczba miejsc po przecinku (domyślnie 1)
 * @returns {string} sformatowany procent
 */
export const formatPercent = (value, digits = 1) => {
  const formatter = new Intl.NumberFormat('pl-PL', {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: digits
  });
  
  return formatter.format(value);
}; 