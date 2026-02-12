/**
 * NBP Exchange Rate Utilities
 * 
 * Pobiera kursy walut z API NBP (Narodowy Bank Polski)
 * dla wielowalutowych faktur.
 * 
 * Zgodnie z Art. 31a ustawy o VAT - używamy kursu z dnia poprzedzającego
 * dzień wystawienia faktury.
 */

const NBP_API_BASE = "https://api.nbp.pl/api/exchangerates/rates/a";

/**
 * Pobiera kurs wymiany z API NBP dla konkretnej daty
 * 
 * @param {string} currency - Kod waluty (EUR, USD, etc.)
 * @param {Date|string} date - Data kursu (YYYY-MM-DD lub Date object)
 * @returns {Promise<{rate: number, date: string, currency: string}>}
 */
export const getNBPExchangeRate = async (currency, date) => {
  // PLN do PLN to zawsze 1
  if (currency === "PLN") {
    return {
      currency: "PLN",
      rate: 1,
      date: formatDateForNBP(date || new Date()),
    };
  }

  try {
    // Formatuj datę dla API NBP (YYYY-MM-DD)
    const dateStr = formatDateForNBP(date);

    // Zbuduj URL - endpoint dla konkretnej daty
    const url = `${NBP_API_BASE}/${currency}/${dateStr}/?format=json`;

    console.log(`[NBP] Pobieranie kursu dla ${currency} na dzień ${dateStr}`);

    const response = await fetch(url);

    if (!response.ok) {
      // Jeśli nie znaleziono kursu dla konkretnej daty (weekend/święto), 
      // spróbuj pobrać ostatni dostępny kurs
      if (response.status === 404) {
        console.warn(`[NBP] Brak kursu dla ${dateStr}, pobieranie ostatniego dostępnego kursu`);
        return getNBPCurrentExchangeRate(currency);
      }
      throw new Error(`NBP API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Struktura API NBP: { rates: [{ mid: number, effectiveDate: string }] }
    const rateData = data.rates?.[0];

    if (!rateData || !rateData.mid) {
      throw new Error("Nieprawidłowy format odpowiedzi z API NBP");
    }

    console.log(`[NBP] Kurs dla ${currency}: ${rateData.mid} PLN na dzień ${rateData.effectiveDate}`);

    return {
      currency,
      rate: rateData.mid,
      date: rateData.effectiveDate,
    };
  } catch (error) {
    console.error(`[NBP] Błąd pobierania kursu dla ${currency}:`, error);
    throw new Error(`Nie udało się pobrać kursu wymiany dla ${currency}: ${error.message}`);
  }
};

/**
 * Pobiera aktualny (ostatni dostępny) kurs z API NBP
 * 
 * @param {string} currency - Kod waluty
 * @returns {Promise<{rate: number, date: string, currency: string}>}
 */
export const getNBPCurrentExchangeRate = async (currency) => {
  if (currency === "PLN") {
    return {
      currency: "PLN",
      rate: 1,
      date: formatDateForNBP(new Date()),
    };
  }

  try {
    // Endpoint dla aktualnego kursu (bez daty)
    const url = `${NBP_API_BASE}/${currency}/?format=json`;

    console.log(`[NBP] Pobieranie aktualnego kursu dla ${currency}`);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`NBP API error: ${response.status}`);
    }

    const data = await response.json();
    const rateData = data.rates?.[0];

    if (!rateData || !rateData.mid) {
      throw new Error("Nieprawidłowy format odpowiedzi z API NBP");
    }

    console.log(`[NBP] Aktualny kurs dla ${currency}: ${rateData.mid} PLN`);

    return {
      currency,
      rate: rateData.mid,
      date: rateData.effectiveDate,
    };
  } catch (error) {
    console.error(`[NBP] Błąd pobierania aktualnego kursu dla ${currency}:`, error);
    throw error;
  }
};

/**
 * Przelicza kwotę na PLN używając kursu wymiany
 * 
 * @param {number} amount - Kwota w walucie źródłowej
 * @param {string} currency - Waluta źródłowa
 * @param {Date|string} date - Data kursu (opcjonalna)
 * @returns {Promise<{amountInPLN: number, rate: number, rateDate: string}>}
 */
export const convertToPLN = async (amount, currency, date) => {
  // Jeśli PLN, nie trzeba przeliczać
  if (currency === "PLN") {
    return {
      amountInPLN: amount,
      rate: 1,
      rateDate: formatDateForNBP(date || new Date()),
    };
  }

  // Pobierz kurs wymiany
  const rateInfo = await getNBPExchangeRate(currency, date);

  // Oblicz kwotę w PLN
  const amountInPLN = amount * rateInfo.rate;

  console.log(`[Convert] ${amount} ${currency} = ${amountInPLN.toFixed(2)} PLN (kurs: ${rateInfo.rate})`);

  return {
    amountInPLN: parseFloat(amountInPLN.toFixed(2)), // Zaokrąglij do 2 miejsc po przecinku
    rate: rateInfo.rate,
    rateDate: rateInfo.date,
  };
};

/**
 * Pobiera kurs dla faktury zgodnie z Art. 31a (dzień poprzedzający)
 * 
 * @param {Date|string} invoiceDate - Data wystawienia faktury
 * @param {string} currency - Waluta faktury
 * @returns {Promise<{rate: number, date: string, currency: string}>}
 */
export const getInvoiceExchangeRate = async (invoiceDate, currency) => {
  // Dla PLN nie pobieraj kursu
  if (currency === "PLN") {
    return {
      currency: "PLN",
      rate: 1,
      date: formatDateForNBP(invoiceDate),
    };
  }

  // Oblicz dzień poprzedzający
  const invoiceDateObj = typeof invoiceDate === 'string' 
    ? new Date(invoiceDate) 
    : invoiceDate;
  
  const previousDay = new Date(invoiceDateObj);
  previousDay.setDate(previousDay.getDate() - 1);

  console.log(`[Invoice] Pobieranie kursu dla faktury z ${formatDateForNBP(invoiceDate)} - używam kursu z ${formatDateForNBP(previousDay)}`);

  // Pobierz kurs z dnia poprzedzającego
  return getNBPExchangeRate(currency, previousDay);
};

/**
 * Przelicza total faktury na PLN zgodnie z Art. 31a
 * 
 * @param {number} total - Kwota faktury
 * @param {string} currency - Waluta faktury
 * @param {Date|string} invoiceDate - Data wystawienia faktury
 * @returns {Promise<{totalInPLN: number, exchangeRate: number, exchangeRateDate: string, exchangeRateSource: string}>}
 */
export const calculateInvoiceTotalInPLN = async (total, currency, invoiceDate) => {
  // Dla PLN zwróć tę samą kwotę
  if (currency === "PLN") {
    return {
      totalInPLN: total,
      exchangeRate: 1,
      exchangeRateDate: formatDateForNBP(invoiceDate || new Date()),
      exchangeRateSource: "nbp",
    };
  }

  // Pobierz kurs z dnia poprzedzającego
  const rateInfo = await getInvoiceExchangeRate(invoiceDate, currency);

  // Oblicz total w PLN
  const totalInPLN = total * rateInfo.rate;

  console.log(`[Invoice Total] ${total} ${currency} = ${totalInPLN.toFixed(2)} PLN (kurs: ${rateInfo.rate} z dnia ${rateInfo.date})`);

  return {
    totalInPLN: parseFloat(totalInPLN.toFixed(2)),
    exchangeRate: rateInfo.rate,
    exchangeRateDate: rateInfo.date,
    exchangeRateSource: "nbp",
  };
};

/**
 * Przelicza kwotę dodatkowego kosztu na EUR zgodnie z Art. 31a VAT
 * (kurs NBP z dnia poprzedzającego datę wystawienia faktury)
 *
 * @param {number} amount - Kwota w walucie źródłowej
 * @param {string} currency - Kod waluty (EUR, PLN, USD, etc.)
 * @param {Date|string} invoiceDate - Data wystawienia faktury
 * @returns {Promise<{amountInEUR: number, exchangeRate?: number, exchangeRateDate?: string}>}
 */
export const convertAdditionalCostToEUR = async (amount, currency, invoiceDate) => {
  if (!amount || amount <= 0) {
    return { amountInEUR: 0 };
  }

  const currencyUpper = (currency || "EUR").toUpperCase();
  if (currencyUpper === "EUR") {
    return { amountInEUR: parseFloat(amount) };
  }

  const invoiceDateObj = typeof invoiceDate === "string" ? new Date(invoiceDate) : (invoiceDate || new Date());
  const previousDay = new Date(invoiceDateObj);
  previousDay.setDate(previousDay.getDate() - 1);

  try {
    const { getExchangeRate } = await import("../services/exchangeRateService");
    const rate = await getExchangeRate(currencyUpper, "EUR", previousDay);
    const amountInEUR = amount * rate;
    return {
      amountInEUR: parseFloat(amountInEUR.toFixed(4)),
      exchangeRate: rate,
      exchangeRateDate: formatDateForNBP(previousDay),
    };
  } catch (error) {
    console.error(`[NBP] Błąd przeliczania ${amount} ${currency} na EUR:`, error);
    return { amountInEUR: 0 };
  }
};

/**
 * Formatuje datę dla API NBP (YYYY-MM-DD)
 * 
 * @param {Date|string} date - Data do sformatowania
 * @returns {string} Data w formacie YYYY-MM-DD
 */
function formatDateForNBP(date) {
  if (typeof date === "string") {
    // Jeśli już jest stringiem, sprawdź czy jest w odpowiednim formacie
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date;
    }
    // Jeśli nie, spróbuj sparsować
    date = new Date(date);
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}
