/**
 * Cloud Functions Service
 * Serwis do wywoływania Cloud Functions Firebase
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../firebase';

// Initialize Functions with europe-central2 region
const functions = getFunctions(app, 'europe-central2');

/**
 * Pobiera losową partię z magazynu
 * @returns {Promise<Object>} Obiekt z danymi losowej partii
 */
export const getRandomBatch = async () => {
  try {
    const getRandomBatchFn = httpsCallable(functions, 'getRandomBatch');
    const result = await getRandomBatchFn();
    return result.data;
  } catch (error) {
    console.error('Error calling getRandomBatch:', error);
    throw new Error(`Nie udało się pobrać losowej partii: ${error.message}`);
  }
};

/**
 * Ręczne odświeżenie agregatów wygasających partii
 * Aktualizuje dokument aggregates/expiryStats używany przez Sidebar
 * 
 * @returns {Promise<Object>} Obiekt z liczbą wygasających i przeterminowanych partii
 */
export const refreshExpiryStats = async () => {
  try {
    const refreshExpiryStatsFn = httpsCallable(functions, 'refreshExpiryStats');
    const result = await refreshExpiryStatsFn();
    return result.data;
  } catch (error) {
    console.error('Error calling refreshExpiryStats:', error);
    throw new Error(`Nie udało się odświeżyć statystyk wygasających partii: ${error.message}`);
  }
};

/**
 * Przelicza ilości wysłane dla zamówienia na podstawie CMR
 * @param {string} orderId - ID zamówienia
 * @returns {Promise<Object>} Obiekt z wynikiem przeliczenia
 */
export const recalculateShippedQuantities = async (orderId) => {
  try {
    const recalculateShippedFn = httpsCallable(functions, 'recalculateShippedQuantities');
    const result = await recalculateShippedFn({ orderId });
    return result.data;
  } catch (error) {
    console.error('Error calling recalculateShippedQuantities:', error);
    throw new Error(`Nie udało się przeliczyć ilości wysłanych: ${error.message}`);
  }
};

/**
 * Template dla kolejnych funkcji:
 * 
 * export const functionName = async (params) => {
 *   try {
 *     const functionNameFn = httpsCallable(functions, 'functionName');
 *     const result = await functionNameFn(params);
 *     return result.data;
 *   } catch (error) {
 *     console.error('Error calling functionName:', error);
 *     throw error;
 *   }
 * };
 */







