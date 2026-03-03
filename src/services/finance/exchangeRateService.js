// Serwis do pobierania kursów walut z API Narodowego Banku Polskiego

// Lokalny cache dla kursów walut - przechowuje kursy, aby uniknąć ponownych zapytań API
const ratesCache = {};

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
 * Pobiera kod tabeli NBP (A lub B) dla danej waluty
 * @param {string} currency - Kod waluty (np. EUR, USD)
 * @returns {string} - Kod tabeli (A lub B)
 */
const getTableType = (currency) => {
  // Tabela A zawiera główne waluty (EUR, USD, GBP, CHF, etc.)
  const tableACurrencies = ['USD', 'EUR', 'CHF', 'GBP', 'JPY', 'CZK', 'DKK', 'NOK', 'SEK', 'CAD', 'AUD'];
  
  if (tableACurrencies.includes(currency)) {
    return 'A';
  }
  
  // Tabela B zawiera pozostałe waluty
  return 'B';
};

/**
 * Pobiera kod waluty używany przez NBP API
 * @param {string} currency - Kod waluty (np. EUR, USD)
 * @returns {string} - Kod waluty używany przez NBP API
 */
const getNBPCurrencyCode = (currency) => {
  // NBP używa 3-literowych kodów ISO
  const currencyCodes = {
    'USD': 'USD',
    'EUR': 'EUR',
    'GBP': 'GBP',
    'CHF': 'CHF',
    'JPY': 'JPY',
    'CZK': 'CZK',
    'DKK': 'DKK',
    'NOK': 'NOK',
    'SEK': 'SEK',
    'CAD': 'CAD',
    'AUD': 'AUD',
    // Możesz dodać więcej walut jeśli potrzebujesz
    'PLN': 'PLN'
  };
  
  return currencyCodes[currency] || currency;
};

/**
 * Pobiera dane o kursie z API NBP dla określonej waluty i daty
 * @param {string} currency - Kod waluty (np. EUR)
 * @param {Date} date - Data, dla której chcemy uzyskać kurs
 * @returns {Promise<Object>} - Obietnica z danymi o kursie
 */
const fetchNBPRate = async (currency, date) => {
  if (currency === 'PLN') {
    return { code: 'PLN', mid: 1 }; // Kurs złotego względem złotego zawsze wynosi 1
  }

  const tableType = getTableType(currency);
  const currencyCode = getNBPCurrencyCode(currency);
  const formattedDate = formatDateForAPI(date);
  
  // API NBP wymaga formatowania dat w formacie YYYY-MM-DD
  // Przykład API: https://api.nbp.pl/api/exchangerates/rates/A/EUR/2023-11-06/
  const apiUrl = `https://api.nbp.pl/api/exchangerates/rates/${tableType}/${currencyCode}/${formattedDate}/?format=json`;
  
  console.log(`Pobieranie kursu ${currency} z NBP dla daty ${formattedDate}`);
  
  const response = await fetch(apiUrl);
  
  if (!response.ok) {
    throw new Error(`Błąd HTTP: ${response.status} dla waluty ${currency} na datę ${formattedDate}`);
  }
  
  const data = await response.json();
  
  if (!data || !data.rates || data.rates.length === 0) {
    throw new Error(`Brak danych dla waluty ${currency} na datę ${formattedDate}`);
  }
  
  // Zwraca obiekt z kodem waluty i kursem średnim
  return {
    code: data.code,
    mid: data.rates[0].mid
  };
};

/**
 * Pobiera kurs wymiany waluty dla określonej daty
 * @param {string} fromCurrency - Waluta źródłowa (np. EUR)
 * @param {string} toCurrency - Waluta docelowa (np. PLN)
 * @param {Date} date - Data, dla której chcemy uzyskać kurs
 * @returns {Promise<number>} - Obiecany kurs wymiany
 */
export const getExchangeRate = async (fromCurrency, toCurrency, date) => {
  try {
    // Sprawdź czy data jest w przyszłości
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let requestDate = new Date(date);
    requestDate.setHours(0, 0, 0, 0);
    
    // Jeśli data jest w przyszłości, użyj dzisiejszej daty
    if (requestDate > today) {
      console.warn(`Data ${formatDateForAPI(requestDate)} jest w przyszłości. Używam dzisiejszej daty.`);
      requestDate = today;
    }
    
    // Formatowanie daty do YYYY-MM-DD
    let formattedDate = formatDateForAPI(requestDate);
    
    // Sprawdź czy mamy już ten kurs w cache
    const cacheKey = `${fromCurrency}/${toCurrency}/${formattedDate}`;
    if (ratesCache[cacheKey]) {
      console.log(`Używam zapisanego kursu z cache dla ${fromCurrency}/${toCurrency} na dzień ${formattedDate}: ${ratesCache[cacheKey]}`);
      return ratesCache[cacheKey];
    }
    
    // NBP nie publikuje kursów w weekendy i święta, więc próbujemy znaleźć najbliższy dostępny kurs
    // Próbujemy do 10 dni wstecz
    for (let i = 0; i < 10; i++) {
      try {
        // Specjalna obsługa dla różnych przypadków walut
        let rate;
        
        // Przypadek 1: Bezpośrednia konwersja z waluty obcej na PLN
        if (toCurrency === 'PLN') {
          const data = await fetchNBPRate(fromCurrency, requestDate);
          rate = data.mid;
        }
        // Przypadek 2: Bezpośrednia konwersja z PLN na walutę obcą
        else if (fromCurrency === 'PLN') {
          const data = await fetchNBPRate(toCurrency, requestDate);
          rate = 1 / data.mid;
        }
        // Przypadek 3: Konwersja między dwiema walutami obcymi (przez PLN)
        else {
          const fromData = await fetchNBPRate(fromCurrency, requestDate);
          const toData = await fetchNBPRate(toCurrency, requestDate);
          
          // Przeliczamy przez PLN: najpierw z fromCurrency na PLN, potem z PLN na toCurrency
          rate = fromData.mid / toData.mid;
        }
        
        console.log(`Pobrano kurs ${fromCurrency}/${toCurrency}: ${rate} dla daty ${formattedDate}`);
        
        // Zapisz kurs w cache
        ratesCache[cacheKey] = rate;
        
        return rate;
      } catch (error) {
        console.warn(`Nie udało się pobrać kursu dla daty ${formattedDate}: ${error.message}. Próbuję wcześniejszą datę.`);
        // Spróbuj z poprzednim dniem
        requestDate.setDate(requestDate.getDate() - 1);
        formattedDate = formatDateForAPI(requestDate);
      }
    }
    
    // Jeśli po 10 próbach nadal nie udało się pobrać kursu, zgłoś błąd
    throw new Error(`Nie udało się pobrać kursu dla pary ${fromCurrency}/${toCurrency} po 10 próbach.`);
  } catch (error) {
    console.error('Błąd podczas pobierania kursu waluty:', error);
    throw error;
  }
};

/**
 * Pobiera kursy walut dla listy walut względem waluty bazowej
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
        try {
        const rate = await getExchangeRate(currency, baseCurrency, date);
        rates[currency] = rate;
        } catch (error) {
          console.error(`Błąd podczas pobierania kursu dla ${currency}/${baseCurrency}:`, error);
          rates[currency] = 0; // W przypadku błędu ustaw kurs na 0
        }
      }
    }
    
    return rates;
  } catch (error) {
    console.error('Błąd podczas pobierania kursów walut:', error);
    return {};
  }
}; 