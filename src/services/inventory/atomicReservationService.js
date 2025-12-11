/**
 * Atomic Reservation Service
 * Serwis kliencki do wywoływania atomowych Cloud Functions
 * dla operacji rezerwacji i konsumpcji materiałów.
 * 
 * Ten serwis zastępuje bezpośrednie operacje Firestore z reservationService.js
 * atomowymi transakcjami wykonywanymi po stronie serwera.
 * 
 * UŻYCIE:
 * import { atomicBookMaterial, atomicCancelBooking, atomicConfirmConsumption } from './atomicReservationService';
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../firebase/config';

// Pobierz instancję Functions z odpowiednim regionem
// Region europe-central2 zgodnie z konfiguracją projektu
const functions = getFunctions(app, 'europe-central2');

// ============================================================================
// ATOMIC BOOK MATERIAL FOR TASK
// ============================================================================

/**
 * Atomowa rezerwacja materiału na zadanie produkcyjne.
 * Wywołuje Cloud Function która wykonuje wszystkie operacje w jednej transakcji:
 * - Aktualizacja bookedQuantity w pozycji magazynowej
 * - Aktualizacja bookedQuantity w partiach
 * - Utworzenie transakcji rezerwacji
 * - Aktualizacja materialBatches w zadaniu
 * 
 * @param {string} itemId - ID pozycji magazynowej
 * @param {number} quantity - Ilość do zarezerwowania
 * @param {string} taskId - ID zadania produkcyjnego
 * @param {Object} options - Opcje rezerwacji
 * @param {string} [options.batchId] - ID konkretnej partii (opcjonalnie)
 * @param {string} [options.reservationMethod='fifo'] - Metoda rezerwacji ('fifo' lub 'fefo')
 * @returns {Promise<Object>} - Wynik operacji rezerwacji
 * @throws {Error} - W przypadku błędu z Cloud Function
 * 
 * @example
 * // Automatyczna rezerwacja FIFO
 * const result = await atomicBookMaterial('item123', 10, 'task456');
 * 
 * @example
 * // Ręczny wybór partii
 * const result = await atomicBookMaterial('item123', 10, 'task456', { batchId: 'batch789' });
 */
export const atomicBookMaterial = async (itemId, quantity, taskId, options = {}) => {
  const { batchId = null, reservationMethod = 'fifo' } = options;

  console.log('🔄 [ATOMIC] atomicBookMaterial wywołanie:', { itemId, quantity, taskId, batchId, reservationMethod });

  try {
    const bookMaterialForTask = httpsCallable(functions, 'bookMaterialForTask');
    
    const result = await bookMaterialForTask({
      itemId,
      quantity,
      taskId,
      batchId,
      reservationMethod
    });

    console.log('✅ [ATOMIC] atomicBookMaterial sukces:', result.data);
    
    // Emituj zdarzenie o zmianie stanu magazynu (dla kompatybilności z istniejącym UI)
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('inventory-updated', { 
        detail: { itemId, action: 'booking', quantity: result.data.totalQuantity }
      });
      window.dispatchEvent(event);
    }

    return result.data;

  } catch (error) {
    console.error('❌ [ATOMIC] atomicBookMaterial błąd:', error);
    
    // Przekształć błąd Cloud Function na przyjazny dla użytkownika
    const errorMessage = error.message || 'Nieznany błąd rezerwacji';
    const errorCode = error.code || 'unknown';
    
    throw new Error(`Błąd rezerwacji [${errorCode}]: ${errorMessage}`);
  }
};

// ============================================================================
// ATOMIC CANCEL BOOKING
// ============================================================================

/**
 * Atomowe anulowanie rezerwacji materiału.
 * Wywołuje Cloud Function która wykonuje wszystkie operacje w jednej transakcji:
 * - Aktualizacja bookedQuantity w pozycji magazynowej
 * - Aktualizacja bookedQuantity w partiach
 * - Oznaczenie transakcji rezerwacji jako anulowane
 * - Aktualizacja materialBatches w zadaniu
 * 
 * @param {string} itemId - ID pozycji magazynowej
 * @param {string} taskId - ID zadania produkcyjnego
 * @param {Object} options - Opcje anulowania
 * @param {string} [options.batchId] - ID konkretnej partii do anulowania (opcjonalnie)
 * @param {number} [options.quantity] - Ilość do anulowania (opcjonalnie, domyślnie cała rezerwacja)
 * @returns {Promise<Object>} - Wynik operacji anulowania
 * @throws {Error} - W przypadku błędu z Cloud Function
 * 
 * @example
 * // Anuluj wszystkie rezerwacje materiału dla zadania
 * const result = await atomicCancelBooking('item123', 'task456');
 * 
 * @example
 * // Anuluj rezerwację konkretnej partii
 * const result = await atomicCancelBooking('item123', 'task456', { batchId: 'batch789' });
 */
export const atomicCancelBooking = async (itemId, taskId, options = {}) => {
  const { batchId = null, quantity = null } = options;

  console.log('🔄 [ATOMIC] atomicCancelBooking wywołanie:', { itemId, taskId, batchId, quantity });

  try {
    const cancelMaterialBooking = httpsCallable(functions, 'cancelMaterialBooking');
    
    const result = await cancelMaterialBooking({
      itemId,
      taskId,
      batchId,
      quantity
    });

    console.log('✅ [ATOMIC] atomicCancelBooking sukces:', result.data);
    
    // Emituj zdarzenie o zmianie stanu magazynu
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('inventory-updated', { 
        detail: { itemId, action: 'booking-cancelled', quantity: result.data.cancelledQuantity }
      });
      window.dispatchEvent(event);
    }

    return result.data;

  } catch (error) {
    console.error('❌ [ATOMIC] atomicCancelBooking błąd:', error);
    
    const errorMessage = error.message || 'Nieznany błąd anulowania';
    const errorCode = error.code || 'unknown';
    
    throw new Error(`Błąd anulowania rezerwacji [${errorCode}]: ${errorMessage}`);
  }
};

// ============================================================================
// ATOMIC CONFIRM CONSUMPTION
// ============================================================================

/**
 * Atomowe potwierdzenie konsumpcji materiałów.
 * Wywołuje Cloud Function która wykonuje wszystkie operacje w jednej transakcji:
 * - Odjęcie ilości z partii magazynowych
 * - Aktualizacja pozycji magazynowej
 * - Oznaczenie rezerwacji jako completed
 * - Utworzenie transakcji wydania
 * - Zapisanie danych konsumpcji w zadaniu
 * 
 * @param {string} taskId - ID zadania produkcyjnego
 * @param {Object} [consumptionData] - Opcjonalne dane konsumpcji
 * @param {Object} [consumptionData.materialUsage] - Skorygowane ilości materiałów {materialId: quantity}
 * @param {Object} [consumptionData.batchUsage] - Skorygowane ilości partii {materialId_batchId: quantity}
 * @returns {Promise<Object>} - Wynik operacji konsumpcji
 * @throws {Error} - W przypadku błędu z Cloud Function
 * 
 * @example
 * // Potwierdź konsumpcję z domyślnymi ilościami
 * const result = await atomicConfirmConsumption('task456');
 * 
 * @example
 * // Potwierdź ze skorygowanymi ilościami
 * const result = await atomicConfirmConsumption('task456', {
 *   materialUsage: { 'mat1': 8.5, 'mat2': 12.0 },
 *   batchUsage: { 'mat1_batch1': 5.0, 'mat1_batch2': 3.5 }
 * });
 */
export const atomicConfirmConsumption = async (taskId, consumptionData = null) => {
  console.log('🔄 [ATOMIC] atomicConfirmConsumption wywołanie:', { taskId, consumptionData });

  try {
    const confirmMaterialConsumption = httpsCallable(functions, 'confirmMaterialConsumption');
    
    const result = await confirmMaterialConsumption({
      taskId,
      consumptionData
    });

    console.log('✅ [ATOMIC] atomicConfirmConsumption sukces:', result.data);
    
    // Emituj zdarzenie o zmianie stanu magazynu
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('inventory-updated', { 
        detail: { action: 'consumption-confirmed', taskId }
      });
      window.dispatchEvent(event);
    }

    return result.data;

  } catch (error) {
    console.error('❌ [ATOMIC] atomicConfirmConsumption błąd:', error);
    
    const errorMessage = error.message || 'Nieznany błąd konsumpcji';
    const errorCode = error.code || 'unknown';
    
    throw new Error(`Błąd potwierdzania konsumpcji [${errorCode}]: ${errorMessage}`);
  }
};

// ============================================================================
// FEATURE FLAG - przełącznik między starym a nowym API
// ============================================================================

/**
 * Flaga włączająca atomowe operacje.
 * Ustawienie na true przekierowuje operacje do Cloud Functions.
 * Ustawienie na false używa starego API (bezpośrednie operacje Firestore).
 * 
 * UWAGA: Po pełnym wdrożeniu i przetestowaniu Cloud Functions,
 * ta flaga powinna być usunięta a stary kod wyłączony.
 */
export const USE_ATOMIC_OPERATIONS = false; // Domyślnie wyłączone do testów

/**
 * Wrapper funkcji rezerwacji z automatycznym wyborem API.
 * Sprawdza flagę USE_ATOMIC_OPERATIONS i wywołuje odpowiednie API.
 * 
 * @param {Function} atomicFn - Funkcja atomowa (Cloud Function)
 * @param {Function} legacyFn - Funkcja legacy (bezpośrednie Firestore)
 * @param {Array} args - Argumenty do przekazania
 * @returns {Promise<Object>} - Wynik operacji
 */
export const withAtomicFallback = async (atomicFn, legacyFn, ...args) => {
  if (USE_ATOMIC_OPERATIONS) {
    try {
      return await atomicFn(...args);
    } catch (error) {
      console.error('[ATOMIC] Błąd Cloud Function, fallback do legacy:', error);
      // Opcjonalnie: fallback do legacy API przy błędzie
      // return await legacyFn(...args);
      throw error; // Lub po prostu rzuć błąd
    }
  } else {
    return await legacyFn(...args);
  }
};

// ============================================================================
// EKSPORT WSZYSTKICH FUNKCJI
// ============================================================================

export default {
  atomicBookMaterial,
  atomicCancelBooking,
  atomicConfirmConsumption,
  USE_ATOMIC_OPERATIONS,
  withAtomicFallback
};

