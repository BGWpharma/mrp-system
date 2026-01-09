// src/utils/firebaseErrorHandler.js
import * as Sentry from '@sentry/react';

/**
 * Konfiguracja performance tracking
 */
const PERFORMANCE_CONFIG = {
  // Próg czasu (ms) po którym operacja jest uznawana za wolną
  slowOperationThreshold: 1500,
  // Czy włączyć performance tracking (domyślnie tak w produkcji)
  enablePerformanceTracking: process.env.NODE_ENV === 'production' || process.env.REACT_APP_SENTRY_DEBUG === 'true',
  // Procent operacji do śledzenia (1.0 = 100%, 0.1 = 10%)
  performanceSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0
};

/**
 * Mapowanie kodów błędów Firebase na przyjazne komunikaty po polsku
 */
const FIREBASE_ERROR_MESSAGES = {
  // Auth errors
  'auth/user-not-found': 'Nie znaleziono użytkownika',
  'auth/wrong-password': 'Nieprawidłowe hasło',
  'auth/email-already-in-use': 'Ten adres email jest już używany',
  'auth/weak-password': 'Hasło jest za słabe',
  'auth/invalid-email': 'Nieprawidłowy adres email',
  'auth/user-disabled': 'Konto użytkownika zostało wyłączone',
  'auth/operation-not-allowed': 'Operacja niedozwolona',
  'auth/too-many-requests': 'Zbyt wiele prób. Spróbuj ponownie później',
  
  // Firestore errors
  'permission-denied': 'Brak uprawnień do wykonania tej operacji',
  'not-found': 'Nie znaleziono dokumentu',
  'already-exists': 'Dokument już istnieje',
  'resource-exhausted': 'Przekroczono limit zasobów',
  'failed-precondition': 'Niespełnione warunki wstępne',
  'aborted': 'Operacja została przerwana',
  'out-of-range': 'Wartość poza zakresem',
  'unimplemented': 'Operacja nie jest zaimplementowana',
  'internal': 'Wewnętrzny błąd serwera',
  'unavailable': 'Usługa niedostępna',
  'data-loss': 'Utrata danych',
  'unauthenticated': 'Wymagane uwierzytelnienie',
  
  // Storage errors
  'storage/object-not-found': 'Nie znaleziono pliku',
  'storage/bucket-not-found': 'Nie znaleziono bucketu',
  'storage/project-not-found': 'Nie znaleziono projektu',
  'storage/quota-exceeded': 'Przekroczono limit przestrzeni',
  'storage/unauthenticated': 'Wymagane uwierzytelnienie',
  'storage/unauthorized': 'Brak autoryzacji',
  'storage/retry-limit-exceeded': 'Przekroczono limit prób',
  'storage/invalid-checksum': 'Nieprawidłowa suma kontrolna',
  'storage/canceled': 'Operacja anulowana',
  'storage/invalid-event-name': 'Nieprawidłowa nazwa zdarzenia',
  'storage/invalid-url': 'Nieprawidłowy URL',
  'storage/invalid-argument': 'Nieprawidłowy argument',
  'storage/no-default-bucket': 'Brak domyślnego bucketu',
  'storage/cannot-slice-blob': 'Nie można podzielić blob',
  'storage/server-file-wrong-size': 'Nieprawidłowy rozmiar pliku na serwerze'
};

/**
 * Pobierz przyjazny komunikat błędu Firebase
 * @param {Error} error - Błąd Firebase
 * @returns {string} - Przyjazny komunikat
 */
export const getFirebaseErrorMessage = (error) => {
  if (!error) return 'Nieznany błąd';
  
  const errorCode = error.code || '';
  return FIREBASE_ERROR_MESSAGES[errorCode] || error.message || 'Wystąpił błąd Firebase';
};

/**
 * Wrapper dla operacji Firebase z automatyczną obsługą błędów i performance tracking
 * 
 * @param {Function} operation - Funkcja asynchroniczna Firebase do wykonania
 * @param {string} context - Kontekst operacji (np. 'getTaskDetails', 'updateInventory')
 * @param {Object} extraData - Dodatkowe dane do debugowania
 * @param {Object} options - Opcje konfiguracyjne
 * @param {boolean} options.trackPerformance - Czy śledzić wydajność (domyślnie true w prod)
 * @param {number} options.slowThreshold - Próg wolnej operacji w ms (domyślnie 3000)
 * @returns {Promise} - Wynik operacji lub rzuca błąd
 * 
 * @example
 * const task = await withFirebaseErrorHandling(
 *   () => getDoc(doc(db, 'tasks', taskId)),
 *   'productionService.getTask',
 *   { taskId }
 * );
 */
export const withFirebaseErrorHandling = async (operation, context, extraData = {}, options = {}) => {
  const {
    trackPerformance = PERFORMANCE_CONFIG.enablePerformanceTracking,
    slowThreshold = PERFORMANCE_CONFIG.slowOperationThreshold
  } = options;
  
  // Decyduj czy śledzić performance na podstawie sample rate
  const shouldTrackPerformance = trackPerformance && Math.random() < PERFORMANCE_CONFIG.performanceSampleRate;
  
  // Rozpocznij transaction dla performance tracking
  let transaction = null;
  if (shouldTrackPerformance) {
    transaction = Sentry.startTransaction({
      op: 'firebase.operation',
      name: context,
      tags: {
        service: 'firebase',
        operation: context
      }
    });
  }
  
  const startTime = performance.now();
  
  try {
    const result = await operation();
    const duration = performance.now() - startTime;
    
    // Zakończ transaction pomyślnie
    if (transaction) {
      transaction.setTag('status', 'success');
      transaction.setMeasurement('duration', duration, 'millisecond');
      transaction.setStatus('ok');
      
      // Dodaj informacje o wyniku jeśli dostępne
      if (result && typeof result === 'object') {
        if (result.exists !== undefined) {
          transaction.setTag('exists', result.exists());
        }
        if (result.empty !== undefined) {
          transaction.setTag('empty', result.empty);
          transaction.setTag('size', result.size || 0);
        }
      }
    }
    
    // Jeśli operacja była wolna, zaloguj ostrzeżenie
    if (duration > slowThreshold) {
      console.warn(`⚠️ Slow Firebase operation: ${context} took ${duration.toFixed(0)}ms`);
      
      Sentry.captureMessage(`Slow Firebase operation: ${context}`, {
        level: 'warning',
        tags: {
          service: 'firebase',
          operation: context,
          performance: 'slow'
        },
        extra: {
          duration,
          threshold: slowThreshold,
          ...extraData
        }
      });
    }
    
    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    
    // Przygotuj informacje o błędzie
    const errorInfo = {
      code: error.code || 'unknown',
      message: error.message || 'Unknown error',
      friendlyMessage: getFirebaseErrorMessage(error),
      duration,
      ...extraData
    };
    
    // Loguj do konsoli
    console.error(`Firebase error in ${context}:`, error, errorInfo);
    
    // Zakończ transaction z błędem
    if (transaction) {
      transaction.setTag('status', 'error');
      transaction.setTag('errorCode', error.code || 'unknown');
      transaction.setMeasurement('duration', duration, 'millisecond');
      transaction.setStatus('error');
    }
    
    // Wyślij do Sentry
    Sentry.captureException(error, {
      tags: {
        service: 'firebase',
        operation: context,
        errorCode: error.code || 'unknown'
      },
      extra: errorInfo,
      level: 'error'
    });
    
    // Rzuć błąd dalej z przyjaznym komunikatem
    const enhancedError = new Error(errorInfo.friendlyMessage);
    enhancedError.originalError = error;
    enhancedError.code = error.code;
    enhancedError.duration = duration;
    throw enhancedError;
  } finally {
    // Zawsze zakończ transaction
    if (transaction) {
      transaction.finish();
    }
  }
};

/**
 * Wrapper dla batch operations Firebase z performance tracking
 * Automatycznie dzieli błędy na poszczególne operacje i śledzi wydajność
 * 
 * @param {Function} batchOperation - Funkcja batch Firebase
 * @param {string} context - Kontekst
 * @param {Array} items - Lista elementów do batch
 * @param {Object} options - Opcje konfiguracyjne
 * @returns {Promise}
 */
export const withFirebaseBatchErrorHandling = async (batchOperation, context, items = [], options = {}) => {
  const {
    trackPerformance = PERFORMANCE_CONFIG.enablePerformanceTracking,
    slowThreshold = PERFORMANCE_CONFIG.slowOperationThreshold
  } = options;
  
  const shouldTrackPerformance = trackPerformance && Math.random() < PERFORMANCE_CONFIG.performanceSampleRate;
  
  let transaction = null;
  if (shouldTrackPerformance) {
    transaction = Sentry.startTransaction({
      op: 'firebase.batch',
      name: context,
      tags: {
        service: 'firebase',
        operation: 'batch',
        itemsCount: items.length
      }
    });
  }
  
  const startTime = performance.now();
  
  try {
    const result = await batchOperation();
    const duration = performance.now() - startTime;
    
    if (transaction) {
      transaction.setTag('status', 'success');
      transaction.setMeasurement('duration', duration, 'millisecond');
      transaction.setMeasurement('itemsCount', items.length, 'none');
      transaction.setMeasurement('avgTimePerItem', duration / Math.max(items.length, 1), 'millisecond');
      transaction.setStatus('ok');
    }
    
    // Ostrzeżenie dla wolnych batch operations
    if (duration > slowThreshold) {
      console.warn(`⚠️ Slow Firebase batch operation: ${context} took ${duration.toFixed(0)}ms for ${items.length} items`);
      
      Sentry.captureMessage(`Slow Firebase batch operation: ${context}`, {
        level: 'warning',
        tags: {
          service: 'firebase',
          operation: 'batch',
          performance: 'slow'
        },
        extra: {
          duration,
          itemsCount: items.length,
          avgTimePerItem: duration / Math.max(items.length, 1),
          threshold: slowThreshold
        }
      });
    }
    
    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    
    const errorInfo = {
      code: error.code || 'unknown',
      message: error.message || 'Unknown error',
      friendlyMessage: getFirebaseErrorMessage(error),
      duration,
      itemsCount: items.length,
      items: items.slice(0, 5) // Pokaż tylko pierwsze 5 elementów
    };
    
    console.error(`Firebase batch error in ${context}:`, error, errorInfo);
    
    if (transaction) {
      transaction.setTag('status', 'error');
      transaction.setTag('errorCode', error.code || 'unknown');
      transaction.setMeasurement('duration', duration, 'millisecond');
      transaction.setStatus('error');
    }
    
    Sentry.captureException(error, {
      tags: {
        service: 'firebase',
        operation: 'batch',
        context: context,
        errorCode: error.code || 'unknown'
      },
      extra: errorInfo,
      level: 'error'
    });
    
    throw error;
  } finally {
    if (transaction) {
      transaction.finish();
    }
  }
};

/**
 * Loguj operację Firebase do Sentry jako breadcrumb
 * Przydatne do śledzenia sekwencji operacji przed błędem
 * 
 * @param {string} operation - Nazwa operacji (np. 'getDoc', 'setDoc', 'updateDoc')
 * @param {string} collection - Nazwa kolekcji
 * @param {string} documentId - ID dokumentu (opcjonalne)
 */
export const logFirebaseOperation = (operation, collection, documentId = null) => {
  Sentry.addBreadcrumb({
    message: `Firebase ${operation}: ${collection}${documentId ? `/${documentId}` : ''}`,
    category: 'firebase',
    level: 'info',
    data: {
      operation,
      collection,
      documentId
    }
  });
};

/**
 * Skonfiguruj ustawienia performance tracking
 * Wywołaj na początku aplikacji aby dostosować zachowanie
 * 
 * @param {Object} config - Obiekt konfiguracyjny
 * @param {number} config.slowOperationThreshold - Próg wolnej operacji w ms
 * @param {boolean} config.enablePerformanceTracking - Czy włączyć tracking
 * @param {number} config.performanceSampleRate - Procent operacji do śledzenia (0.0-1.0)
 * 
 * @example
 * configureFirebasePerformance({
 *   slowOperationThreshold: 2000, // 2 sekundy
 *   enablePerformanceTracking: true,
 *   performanceSampleRate: 0.5 // 50% operacji
 * });
 */
export const configureFirebasePerformance = (config) => {
  if (config.slowOperationThreshold !== undefined) {
    PERFORMANCE_CONFIG.slowOperationThreshold = config.slowOperationThreshold;
  }
  if (config.enablePerformanceTracking !== undefined) {
    PERFORMANCE_CONFIG.enablePerformanceTracking = config.enablePerformanceTracking;
  }
  if (config.performanceSampleRate !== undefined) {
    PERFORMANCE_CONFIG.performanceSampleRate = Math.max(0, Math.min(1, config.performanceSampleRate));
  }
  
  console.log('Firebase Performance Tracking configured:', PERFORMANCE_CONFIG);
};

/**
 * Pobierz aktualną konfigurację performance tracking
 * @returns {Object} - Aktualna konfiguracja
 */
export const getFirebasePerformanceConfig = () => {
  return { ...PERFORMANCE_CONFIG };
};

export default withFirebaseErrorHandling;

