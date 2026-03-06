/**
 * Exchange Rate Utilities for Cloud Functions
 *
 * Fetches currency exchange rates from NBP (Narodowy Bank Polski) API
 * for multi-currency invoice processing.
 *
 * @module utils/exchangeRates
 */

const logger = require("firebase-functions/logger");
// Node 22 has built-in fetch, no need for node-fetch

// NBP API base URL
const NBP_API_BASE = "https://api.nbp.pl/api/exchangerates/rates/a";

/**
 * Get exchange rate from NBP API for a specific date
 * NOTE: For invoices, pass the day BEFORE invoice date (Polish tax law Art. 31a)
 * @param {string} currency - Currency code (EUR, USD, etc.)
 * @param {Date|string} date - Date for rate (optional, defaults to today)
 * @return {Promise<{rate: number, date: string, currency: string}>}
 */
const getNBPExchangeRate = async (currency, date) => {
  // PLN to PLN is always 1
  if (currency === "PLN") {
    return {
      currency: "PLN",
      rate: 1,
      date: formatDateForNBP(date || new Date()),
    };
  }

  try {
    // Format date for NBP API (YYYY-MM-DD)
    const dateStr = formatDateForNBP(date || new Date());

    // Build URL - specific date endpoint
    const url = `${NBP_API_BASE}/${currency}/${dateStr}/?format=json`;

    logger.info(`[NBP] Fetching rate for ${currency} on ${dateStr}`);

    const response = await fetch(url);

    if (!response.ok) {
      // If rate not found for exact date (weekend/holiday), walk back to last business day
      if (response.status === 404 && date) {
        logger.warn(`[NBP] No rate for ${dateStr}, searching previous business days`);
        return getNBPPreviousBusinessDayRate(currency, date);
      }
      throw new Error(`NBP API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // NBP API structure: { rates: [{ mid: number, effectiveDate: string }] }
    const rateData = data.rates?.[0];

    if (!rateData || !rateData.mid) {
      throw new Error("Invalid NBP API response format");
    }

    logger.info(`[NBP] Rate for ${currency}: ${rateData.mid} PLN on ${rateData.effectiveDate}`);

    return {
      currency,
      rate: rateData.mid,
      date: rateData.effectiveDate,
    };
  } catch (error) {
    logger.error(`[NBP] Error fetching exchange rate for ${currency}:`, error);
    throw new Error(`Failed to fetch exchange rate for ${currency}: ${error.message}`);
  }
};

/**
 * Walk back from given date to find the last published NBP rate.
 * NBP does not publish rates on weekends and public holidays;
 * Art. 31a VAT requires using the rate from the last business day
 * before the tax obligation date.
 * @param {string} currency - Currency code (EUR, USD, etc.)
 * @param {Date|string} startDate - Date that returned 404
 * @param {number} [maxRetries=7] - Max days to walk back
 * @return {Promise<{rate: number, date: string, currency: string}>}
 */
const getNBPPreviousBusinessDayRate = async (currency, startDate, maxRetries = 7) => {
  let dateObj = typeof startDate === "string" ? new Date(startDate) : new Date(startDate);

  for (let i = 1; i <= maxRetries; i++) {
    dateObj.setDate(dateObj.getDate() - 1);
    const dateStr = formatDateForNBP(dateObj);
    const url = `${NBP_API_BASE}/${currency}/${dateStr}/?format=json`;

    logger.info(`[NBP] Retry ${i}/${maxRetries}: trying ${currency} on ${dateStr}`);

    try {
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        const rateData = data.rates?.[0];
        if (rateData && rateData.mid) {
          logger.info(`[NBP] Found rate on ${rateData.effectiveDate}: ${rateData.mid}`);
          return {
            currency,
            rate: rateData.mid,
            date: rateData.effectiveDate,
          };
        }
      }
    } catch (err) {
      logger.warn(`[NBP] Retry ${i} error: ${err.message}`);
    }
  }

  logger.warn(`[NBP] No rate found in last ${maxRetries} days, falling back to current rate`);
  return getNBPCurrentExchangeRate(currency);
};

/**
 * Get current (latest) exchange rate from NBP API
 * @param {string} currency - Currency code
 * @return {Promise<{rate: number, date: string, currency: string}>}
 */
const getNBPCurrentExchangeRate = async (currency) => {
  if (currency === "PLN") {
    return {
      currency: "PLN",
      rate: 1,
      date: formatDateForNBP(new Date()),
    };
  }

  try {
    // Current rate endpoint (no date)
    const url = `${NBP_API_BASE}/${currency}/?format=json`;

    logger.info(`[NBP] Fetching current rate for ${currency}`);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`NBP API error: ${response.status}`);
    }

    const data = await response.json();
    const rateData = data.rates?.[0];

    if (!rateData || !rateData.mid) {
      throw new Error("Invalid NBP API response format");
    }

    logger.info(`[NBP] Current rate for ${currency}: ${rateData.mid} PLN`);

    return {
      currency,
      rate: rateData.mid,
      date: rateData.effectiveDate,
    };
  } catch (error) {
    logger.error(`[NBP] Error fetching current rate for ${currency}:`, error);
    throw error;
  }
};

/**
 * Convert amount to PLN using exchange rate
 * @param {number} amount - Amount in source currency
 * @param {string} currency - Source currency
 * @param {Date|string} date - Date for rate (optional)
 * @return {Promise<{amountInPLN: number, rate: number, rateDate: string}>}
 */
const convertToPLN = async (amount, currency, date) => {
  // If PLN, no conversion needed
  if (currency === "PLN") {
    return {
      amountInPLN: amount,
      rate: 1,
      rateDate: formatDateForNBP(date || new Date()),
    };
  }

  // Fetch exchange rate
  const rateInfo = await getNBPExchangeRate(currency, date);

  // Calculate amount in PLN
  const amountInPLN = amount * rateInfo.rate;

  logger.info(`[Convert] ${amount} ${currency} = ${amountInPLN.toFixed(2)} PLN (rate: ${rateInfo.rate})`);

  return {
    amountInPLN,
    rate: rateInfo.rate,
    rateDate: rateInfo.date,
  };
};

/**
 * Convert additional cost to EUR (Art. 31a VAT - NBP rate from day BEFORE invoice date)
 * @param {number} amount - Amount in source currency
 * @param {string} currency - Source currency (EUR, PLN, USD, etc.)
 * @param {Date|string|Object} invoiceDate - Invoice date (Firestore Timestamp or Date)
 * @return {Promise<{amountInEUR: number}>}
 */
const convertAdditionalCostToEUR = async (amount, currency, invoiceDate) => {
  if (!amount || amount <= 0) return {amountInEUR: 0};
  const currencyUpper = (currency || "EUR").toUpperCase();
  if (currencyUpper === "EUR") return {amountInEUR: parseFloat(amount)};

  let dateObj;
  if (invoiceDate && typeof invoiceDate.toDate === "function") {
    dateObj = invoiceDate.toDate();
  } else if (typeof invoiceDate === "string") {
    dateObj = new Date(invoiceDate);
  } else if (invoiceDate instanceof Date) {
    dateObj = invoiceDate;
  } else {
    dateObj = new Date();
  }
  const previousDay = new Date(dateObj);
  previousDay.setDate(previousDay.getDate() - 1);

  try {
    const eurRateInfo = await getNBPExchangeRate("EUR", previousDay);
    const srcRateInfo = await getNBPExchangeRate(currencyUpper, previousDay);
    const amountInPLN = amount * srcRateInfo.rate;
    const amountInEUR = amountInPLN / eurRateInfo.rate;
    logger.info(`[Convert] ${amount} ${currency} = ${amountInEUR.toFixed(4)} EUR`);
    return {amountInEUR: parseFloat(amountInEUR.toFixed(4))};
  } catch (err) {
    logger.error(`[NBP] Error converting ${amount} ${currency} to EUR:`, err);
    return {amountInEUR: 0};
  }
};

/**
 * Format date for NBP API (YYYY-MM-DD)
 * @param {Date|string} date - Date to format
 * @return {string} Formatted date
 */
function formatDateForNBP(date) {
  if (typeof date === "string") {
    return date;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

module.exports = {
  getNBPExchangeRate,
  getNBPCurrentExchangeRate,
  convertToPLN,
  convertAdditionalCostToEUR,
};
