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






