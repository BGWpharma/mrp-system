// src/utils/firebaseErrorHandler.js
import * as Sentry from '@sentry/react';
import i18n from 'i18next';

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
 * Mapowanie kodów błędów Firebase na klucze i18n (namespace: common)
 */
const FIREBASE_ERROR_KEY_MAP = {
  'auth/user-not-found': 'firebaseErrors.authUserNotFound',
  'auth/wrong-password': 'firebaseErrors.authWrongPassword',
  'auth/email-already-in-use': 'firebaseErrors.authEmailInUse',
  'auth/weak-password': 'firebaseErrors.authWeakPassword',
  'auth/invalid-email': 'firebaseErrors.authInvalidEmail',
  'auth/user-disabled': 'firebaseErrors.authUserDisabled',
  'auth/operation-not-allowed': 'firebaseErrors.authOperationNotAllowed',
  'auth/too-many-requests': 'firebaseErrors.authTooManyRequests',
  'permission-denied': 'firebaseErrors.permissionDenied',
  'not-found': 'firebaseErrors.notFound',
  'already-exists': 'firebaseErrors.alreadyExists',
  'resource-exhausted': 'firebaseErrors.resourceExhausted',
  'failed-precondition': 'firebaseErrors.failedPrecondition',
  'aborted': 'firebaseErrors.aborted',
  'out-of-range': 'firebaseErrors.outOfRange',
  'unimplemented': 'firebaseErrors.unimplemented',
  'internal': 'firebaseErrors.internal',
  'unavailable': 'firebaseErrors.unavailable',
  'data-loss': 'firebaseErrors.dataLoss',
  'unauthenticated': 'firebaseErrors.unauthenticated',
  'storage/object-not-found': 'firebaseErrors.storageObjectNotFound',
  'storage/bucket-not-found': 'firebaseErrors.storageBucketNotFound',
  'storage/project-not-found': 'firebaseErrors.storageProjectNotFound',
  'storage/quota-exceeded': 'firebaseErrors.storageQuotaExceeded',
  'storage/unauthenticated': 'firebaseErrors.storageUnauthenticated',
  'storage/unauthorized': 'firebaseErrors.storageUnauthorized',
  'storage/retry-limit-exceeded': 'firebaseErrors.storageRetryLimitExceeded',
  'storage/invalid-checksum': 'firebaseErrors.storageInvalidChecksum',
  'storage/canceled': 'firebaseErrors.storageCanceled',
  'storage/invalid-event-name': 'firebaseErrors.storageInvalidEventName',
  'storage/invalid-url': 'firebaseErrors.storageInvalidUrl',
  'storage/invalid-argument': 'firebaseErrors.storageInvalidArgument',
  'storage/no-default-bucket': 'firebaseErrors.storageNoDefaultBucket',
  'storage/cannot-slice-blob': 'firebaseErrors.storageCannotSliceBlob',
  'storage/server-file-wrong-size': 'firebaseErrors.storageServerFileWrongSize'
};

/**
 * Pobierz przyjazny komunikat błędu Firebase
 * @param {Error} error - Błąd Firebase
 * @returns {string} - Przyjazny komunikat
 */
export const getFirebaseErrorMessage = (error) => {
  if (!error) return i18n.t('common:firebaseErrors.unknownError');
  
  const errorCode = error.code || '';
  const translationKey = FIREBASE_ERROR_KEY_MAP[errorCode];
  
  if (translationKey) {
    return i18n.t(`common:${translationKey}`);
  }
  
  return error.message || i18n.t('common:firebaseErrors.firebaseError');
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
  
  const startTime = performance.now();
  let spanData = null;
  
  try {
    const result = await operation();
    const duration = performance.now() - startTime;
    
    // Trackuj performance jeśli włączone
    if (shouldTrackPerformance) {
      spanData = {
        status: 'success',
        duration,
      };
      
      // Dodaj informacje o wyniku jeśli dostępne
      if (result && typeof result === 'object') {
        if (result.exists !== undefined) {
          spanData.exists = result.exists();
        }
        if (result.empty !== undefined) {
          spanData.empty = result.empty;
          spanData.size = result.size || 0;
        }
      }
      
      Sentry.startSpan(
        {
          op: 'firebase.operation',
          name: context,
          attributes: {
            service: 'firebase',
            operation: context,
            ...spanData
          }
        },
        () => {
          // Span jest automatycznie zakończony po wykonaniu callbacka
        }
      );
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
    
    // Trackuj błąd w performance jeśli włączone
    if (shouldTrackPerformance) {
      Sentry.startSpan(
        {
          op: 'firebase.operation',
          name: context,
          attributes: {
            service: 'firebase',
            operation: context,
            status: 'error',
            errorCode: error.code || 'unknown',
            duration
          }
        },
        () => {
          // Span jest automatycznie zakończony
        }
      );
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
  
  const startTime = performance.now();
  
  try {
    const result = await batchOperation();
    const duration = performance.now() - startTime;
    
    if (shouldTrackPerformance) {
      Sentry.startSpan(
        {
          op: 'firebase.batch',
          name: context,
          attributes: {
            service: 'firebase',
            operation: 'batch',
            itemsCount: items.length,
            status: 'success',
            duration,
            avgTimePerItem: duration / Math.max(items.length, 1)
          }
        },
        () => {
          // Span jest automatycznie zakończony
        }
      );
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
    
    if (shouldTrackPerformance) {
      Sentry.startSpan(
        {
          op: 'firebase.batch',
          name: context,
          attributes: {
            service: 'firebase',
            operation: 'batch',
            itemsCount: items.length,
            status: 'error',
            errorCode: error.code || 'unknown',
            duration
          }
        },
        () => {
          // Span jest automatycznie zakończony
        }
      );
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


