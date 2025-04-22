// Serwis do pobierania kursów walut

/**
 * Pobiera kurs wymiany waluty dla określonej daty
 * @param {string} fromCurrency - Waluta źródłowa (np. EUR)
 * @param {string} toCurrency - Waluta docelowa (np. PLN)
 * @param {Date} date - Data, dla której chcemy uzyskać kurs (najlepiej wczorajsza)
 * @returns {Promise<number>} - Obiecany kurs wymiany
 */
export const getExchangeRate = async (fromCurrency, toCurrency, date) => {
  try {
    // Formatowanie daty do YYYY-MM-DD
    const formattedDate = formatDateForAPI(date);
    
    // Różne API do pobierania kursów walut, NBP, ECB, Narodowy Bank Polski
    // Tutaj jako przykład użyjemy API Europejskiego Banku Centralnego (ECB)
    const apiUrl = `https://api.exchangerate.host/${formattedDate}?base=${fromCurrency}&symbols=${toCurrency}`;
    
    console.log(`Pobieranie kursu ${fromCurrency}/${toCurrency} dla daty ${formattedDate}`);
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      throw new Error(`Błąd pobierania kursu waluty: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.rates || !data.rates[toCurrency]) {
      console.warn(`Brak kursu dla pary ${fromCurrency}/${toCurrency} na dzień ${formattedDate}`);
      // Użyj kursu z innego źródła lub zwróć wartość domyślną
      return getDefaultExchangeRate(fromCurrency, toCurrency);
    }
    
    const rate = data.rates[toCurrency];
    console.log(`Pobrano kurs ${fromCurrency}/${toCurrency}: ${rate}`);
    
    return rate;
  } catch (error) {
    console.error('Błąd podczas pobierania kursu waluty:', error);
    // W przypadku błędu zwróć domyślny kurs
    return getDefaultExchangeRate(fromCurrency, toCurrency);
  }
};

/**
 * Formatuje datę do formatu YYYY-MM-DD
 * @param {Date} date - Data do sformatowania
 * @returns {string} - Sformatowana data
 */
const formatDateForAPI = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Zwraca domyślny kurs wymiany w przypadku braku danych
 * @param {string} fromCurrency - Waluta źródłowa
 * @param {string} toCurrency - Waluta docelowa
 * @returns {number} - Domyślny kurs wymiany
 */
const getDefaultExchangeRate = (fromCurrency, toCurrency) => {
  // Tabela domyślnych kursów podstawowych walut
  const defaultRates = {
    'EUR': {
      'PLN': 4.3,
      'USD': 1.08,
      'GBP': 0.85,
      'CHF': 0.96
    },
    'PLN': {
      'EUR': 0.23,
      'USD': 0.25,
      'GBP': 0.2,
      'CHF': 0.22
    },
    'USD': {
      'EUR': 0.92,
      'PLN': 3.97,
      'GBP': 0.79,
      'CHF': 0.88
    },
    'GBP': {
      'EUR': 1.17,
      'PLN': 5.06,
      'USD': 1.27,
      'CHF': 1.13
    },
    'CHF': {
      'EUR': 1.04,
      'PLN': 4.49,
      'USD': 1.13,
      'GBP': 0.89
    }
  };
  
  // Jeśli mamy bezpośredni kurs, użyj go
  if (defaultRates[fromCurrency] && defaultRates[fromCurrency][toCurrency]) {
    return defaultRates[fromCurrency][toCurrency];
  }
  
  // Jeśli mamy kurs odwrotny, użyj odwrotności
  if (defaultRates[toCurrency] && defaultRates[toCurrency][fromCurrency]) {
    return 1 / defaultRates[toCurrency][fromCurrency];
  }
  
  // Jeśli nic nie pasuje, zwróć 1 (bez przewalutowania)
  console.warn(`Brak domyślnego kursu dla pary ${fromCurrency}/${toCurrency}`);
  return 1;
};

/**
 * Pobiera kursy walut dla listy walut
 * @param {Array<string>} currencies - Lista walut, dla których chcemy uzyskać kursy
 * @param {string} baseCurrency - Waluta bazowa
 * @param {Date} date - Data, dla której chcemy uzyskać kursy
 * @returns {Promise<Object>} - Obiekt z kursami walut
 */
export const getExchangeRates = async (currencies, baseCurrency, date) => {
  try {
    const rates = {};
    
    // Dodaj kurs 1 dla waluty bazowej
    rates[baseCurrency] = 1;
    
    // Pobierz kursy dla wszystkich walut
    for (const currency of currencies) {
      if (currency !== baseCurrency) {
        const rate = await getExchangeRate(currency, baseCurrency, date);
        rates[currency] = rate;
      }
    }
    
    return rates;
  } catch (error) {
    console.error('Błąd podczas pobierania kursów walut:', error);
    return {};
  }
}; 