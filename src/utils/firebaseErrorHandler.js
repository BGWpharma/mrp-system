// src/utils/firebaseErrorHandler.js
import * as Sentry from '@sentry/react';

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
 * Wrapper dla operacji Firebase z automatyczną obsługą błędów
 * 
 * @param {Function} operation - Funkcja asynchroniczna Firebase do wykonania
 * @param {string} context - Kontekst operacji (np. 'getTaskDetails', 'updateInventory')
 * @param {Object} extraData - Dodatkowe dane do debugowania
 * @returns {Promise} - Wynik operacji lub rzuca błąd
 * 
 * @example
 * const task = await withFirebaseErrorHandling(
 *   () => getDoc(doc(db, 'tasks', taskId)),
 *   'productionService.getTask',
 *   { taskId }
 * );
 */
export const withFirebaseErrorHandling = async (operation, context, extraData = {}) => {
  try {
    return await operation();
  } catch (error) {
    // Przygotuj informacje o błędzie
    const errorInfo = {
      code: error.code || 'unknown',
      message: error.message || 'Unknown error',
      friendlyMessage: getFirebaseErrorMessage(error),
      ...extraData
    };
    
    // Loguj do konsoli
    console.error(`Firebase error in ${context}:`, error, errorInfo);
    
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
    throw enhancedError;
  }
};

/**
 * Wrapper dla batch operations Firebase
 * Automatycznie dzieli błędy na poszczególne operacje
 * 
 * @param {Function} batchOperation - Funkcja batch Firebase
 * @param {string} context - Kontekst
 * @param {Array} items - Lista elementów do batch
 * @returns {Promise}
 */
export const withFirebaseBatchErrorHandling = async (batchOperation, context, items = []) => {
  try {
    return await batchOperation();
  } catch (error) {
    const errorInfo = {
      code: error.code || 'unknown',
      message: error.message || 'Unknown error',
      friendlyMessage: getFirebaseErrorMessage(error),
      itemsCount: items.length,
      items: items.slice(0, 5) // Pokaż tylko pierwsze 5 elementów
    };
    
    console.error(`Firebase batch error in ${context}:`, error, errorInfo);
    
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

export default withFirebaseErrorHandling;

