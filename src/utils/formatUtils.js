/**
 * Formatuje wartość liczbową jako walutę (EUR)
 * @param {number} value - wartość do sformatowania
 * @param {string} currency - symbol waluty (domyślnie EUR)
 * @param {number} precision - liczba miejsc po przecinku (domyślnie 2)
 * @returns {string} sformatowana wartość walutowa
 */
export const formatCurrency = (value, currency = 'EUR', precision = 2) => {
  const formatter = new Intl.NumberFormat('pl-PL', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: precision
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
 * Formatuje cenę jednostkową bez zbędnych zer po przecinku
 * @param {number} value - wartość ceny do sformatowania
 * @param {string} currency - symbol waluty (domyślnie EUR)
 * @param {number} maxPrecision - maksymalna liczba miejsc po przecinku (domyślnie 6)
 * @returns {string} sformatowana cena jednostkowa
 */
export const formatUnitPrice = (value, currency = 'EUR', maxPrecision = 6) => {
  // Konwertuj do liczby i sprawdź czy jest to liczba całkowita
  const numValue = parseFloat(value);
  
  if (isNaN(numValue)) {
    return '-';
  }
  
  // Sprawdź czy liczba jest całkowita (bez części ułamkowej)
  if (Number.isInteger(numValue)) {
    // Dla liczb całkowitych nie pokazuj miejsc po przecinku
    const formatter = new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
    
    return formatter.format(numValue);
  } else {
    // Dla liczb z częścią ułamkową, usuń końcowe zera
    // Najpierw przekształć do stringa z maksymalną precyzją
    const valueStr = numValue.toFixed(maxPrecision);
    // Usuń końcowe zera
    const trimmedStr = valueStr.replace(/\.?0+$/, '');
    
    // Określ faktyczną liczbę miejsc po przecinku
    const decimalPlaces = trimmedStr.includes('.') ? 
      trimmedStr.length - trimmedStr.indexOf('.') - 1 : 0;
    
    const formatter = new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency,
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces
    });
    
    return formatter.format(numValue);
  }
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