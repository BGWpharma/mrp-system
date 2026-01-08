/**
 * PRZYKŁADY UŻYCIA SENTRY ERROR HANDLING
 * 
 * Ten plik zawiera przykłady jak używać utility functions
 * do obsługi błędów z Sentry.io w różnych scenariuszach.
 * 
 * NIE IMPORTUJ TEGO PLIKU W PRODUKCJI - to tylko przykłady!
 */

import { db } from '../services/firebase/config';
import { doc, getDoc, updateDoc, writeBatch, collection } from 'firebase/firestore';
import { 
  handleError, 
  logToSentry, 
  withErrorHandling, 
  addBreadcrumb 
} from './errorHandler';
import { 
  withFirebaseErrorHandling,
  withFirebaseBatchErrorHandling,
  logFirebaseOperation,
  getFirebaseErrorMessage
} from './firebaseErrorHandler';

// ============================================================================
// PRZYKŁAD 1: Podstawowa obsługa błędów w serwisie
// ============================================================================

export const exampleBasicErrorHandling = async (taskId) => {
  try {
    // Operacja która może rzucić błąd
    const result = await someRiskyOperation(taskId);
    return result;
  } catch (error) {
    // Obsłuż błąd i wyślij do Sentry
    handleError(error, 'exampleService.basicErrorHandling', {
      taskId,
      timestamp: Date.now()
    });
    
    // Opcjonalnie rzuć dalej
    throw error;
  }
};

// ============================================================================
// PRZYKŁAD 2: Firebase operacje z automatyczną obsługą błędów
// ============================================================================

export const exampleFirebaseGet = async (taskId) => {
  // Automatyczna obsługa błędów Firebase + przyjazne komunikaty
  const taskDoc = await withFirebaseErrorHandling(
    () => getDoc(doc(db, 'tasks', taskId)),
    'exampleService.getTask',
    { taskId }
  );
  
  return taskDoc.data();
};

export const exampleFirebaseUpdate = async (taskId, updates) => {
  // Log operacji (pojawi się jako breadcrumb w Sentry)
  logFirebaseOperation('updateDoc', 'tasks', taskId);
  
  // Wykonaj operację z obsługą błędów
  await withFirebaseErrorHandling(
    () => updateDoc(doc(db, 'tasks', taskId), updates),
    'exampleService.updateTask',
    { taskId, updateKeys: Object.keys(updates) }
  );
};

// ============================================================================
// PRZYKŁAD 3: Batch operations Firebase
// ============================================================================

export const exampleBatchOperation = async (items) => {
  const itemIds = items.map(i => i.id);
  
  await withFirebaseBatchErrorHandling(
    async () => {
      const batch = writeBatch(db);
      
      items.forEach(item => {
        const itemRef = doc(db, 'items', item.id);
        batch.set(itemRef, item);
      });
      
      await batch.commit();
    },
    'exampleService.batchCreateItems',
    items // Przekaż items aby Sentry wiedział ile było elementów
  );
};

// ============================================================================
// PRZYKŁAD 4: Wrapper dla async funkcji
// ============================================================================

export const exampleWithWrapper = async (orderId) => {
  // Wrapper automatycznie obsłuży błędy
  return await withErrorHandling(
    async () => {
      const order = await fetchOrder(orderId);
      const items = await fetchOrderItems(orderId);
      return { order, items };
    },
    'exampleService.fetchOrderWithItems',
    { orderId }
  );
};

// ============================================================================
// PRZYKŁAD 5: Breadcrumbs - śledzenie flow użytkownika
// ============================================================================

export const exampleWithBreadcrumbs = async (taskData) => {
  try {
    // Breadcrumb 1: Początek operacji
    addBreadcrumb('Starting task creation', 'process', 'info', {
      taskType: taskData.type
    });
    
    // Krok 1
    const validatedData = await validateTaskData(taskData);
    addBreadcrumb('Task data validated', 'process', 'info');
    
    // Krok 2
    const reservation = await reserveInventory(validatedData.materials);
    addBreadcrumb('Inventory reserved', 'process', 'info', {
      materialCount: validatedData.materials.length
    });
    
    // Krok 3
    const task = await createTaskInDatabase(validatedData);
    addBreadcrumb('Task created in database', 'process', 'info', {
      taskId: task.id
    });
    
    return task;
    
  } catch (error) {
    // Gdy wystąpi błąd, Sentry pokaże całą sekwencję breadcrumbs
    handleError(error, 'exampleService.createTaskWithReservation', {
      taskData: {
        type: taskData.type,
        // Nie loguj wszystkich danych, tylko najważniejsze
      }
    });
    throw error;
  }
};

// ============================================================================
// PRZYKŁAD 6: Logowanie wiadomości (nie błędów)
// ============================================================================

export const exampleLogMessages = async (reportSize) => {
  // Info - zwykła informacja
  if (reportSize > 1000) {
    logToSentry('Generating large report', 'info', {
      reportSize,
      estimatedTime: reportSize * 0.1
    });
  }
  
  // Warning - ostrzeżenie
  if (reportSize > 5000) {
    logToSentry('Report size exceeds recommended limit', 'warning', {
      reportSize,
      recommendedLimit: 5000
    });
  }
  
  // Wykonaj operację
  await generateReport(reportSize);
};

// ============================================================================
// PRZYKŁAD 7: Obsługa błędów w React Component
// ============================================================================

/**
 * Przykład użycia w komponencie React
 * 
 * import { handleError, addBreadcrumb } from '../utils/errorHandler';
 * 
 * const MyComponent = () => {
 *   const handleSubmit = async (formData) => {
 *     try {
 *       // Breadcrumb przed akcją
 *       addBreadcrumb('User clicked submit', 'user-action', 'info', {
 *         formType: 'taskForm'
 *       });
 *       
 *       await createTask(formData);
 *       
 *       // Breadcrumb po sukcesie
 *       addBreadcrumb('Task created successfully', 'user-action', 'info');
 *       
 *     } catch (error) {
 *       handleError(error, 'TaskForm.handleSubmit', {
 *         formData: { type: formData.type } // Tylko bezpieczne dane
 *       });
 *       
 *       showErrorNotification('Nie udało się utworzyć zadania');
 *     }
 *   };
 *   
 *   return <form onSubmit={handleSubmit}>...</form>;
 * };
 */

// ============================================================================
// PRZYKŁAD 8: Obsługa błędów w Custom Hook
// ============================================================================

/**
 * Przykład użycia w custom hook
 * 
 * import { useState, useEffect } from 'react';
 * import { withFirebaseErrorHandling } from '../utils/firebaseErrorHandler';
 * 
 * export const useTask = (taskId) => {
 *   const [task, setTask] = useState(null);
 *   const [loading, setLoading] = useState(true);
 *   const [error, setError] = useState(null);
 *   
 *   useEffect(() => {
 *     const fetchTask = async () => {
 *       try {
 *         const taskDoc = await withFirebaseErrorHandling(
 *           () => getDoc(doc(db, 'tasks', taskId)),
 *           'useTask.fetchTask',
 *           { taskId }
 *         );
 *         
 *         setTask(taskDoc.data());
 *       } catch (err) {
 *         // Błąd już został wysłany do Sentry przez wrapper
 *         setError(err.message);
 *       } finally {
 *         setLoading(false);
 *       }
 *     };
 *     
 *     if (taskId) {
 *       fetchTask();
 *     }
 *   }, [taskId]);
 *   
 *   return { task, loading, error };
 * };
 */

// ============================================================================
// PRZYKŁAD 9: Try-catch z różnymi poziomami błędów
// ============================================================================

export const exampleErrorLevels = async (operation) => {
  try {
    await operation();
  } catch (error) {
    // Sprawdź typ błędu i użyj odpowiedniego poziomu
    if (error.code === 'permission-denied') {
      // To jest poważny błąd - użyj 'error'
      handleError(error, 'exampleService.criticalOperation', {}, 'error');
    } else if (error.code === 'not-found') {
      // To może być oczekiwane - użyj 'warning'
      handleError(error, 'exampleService.optionalOperation', {}, 'warning');
    } else {
      // Nieznany błąd - domyślnie 'error'
      handleError(error, 'exampleService.unknownOperation', {});
    }
  }
};

// ============================================================================
// PRZYKŁAD 10: Obsługa przyjaznych komunikatów Firebase
// ============================================================================

export const exampleFriendlyMessages = async (taskId) => {
  try {
    await withFirebaseErrorHandling(
      () => updateDoc(doc(db, 'tasks', taskId), { status: 'completed' }),
      'exampleService.completeTask',
      { taskId }
    );
  } catch (error) {
    // error.message będzie teraz po polsku!
    // np. "Brak uprawnień do wykonania tej operacji" zamiast "permission-denied"
    console.log('Przyjazny komunikat:', error.message);
    
    // Możesz pokazać ten komunikat użytkownikowi
    showNotification(error.message);
  }
};

// ============================================================================
// HELPER FUNCTIONS (dla przykładów)
// ============================================================================

const someRiskyOperation = async (id) => {
  // Symulacja operacji
  return { id, result: 'success' };
};

const fetchOrder = async (orderId) => {
  return { id: orderId, total: 100 };
};

const fetchOrderItems = async (orderId) => {
  return [{ id: 1, name: 'Item 1' }];
};

const validateTaskData = async (data) => {
  return data;
};

const reserveInventory = async (materials) => {
  return { reservationId: '123' };
};

const createTaskInDatabase = async (data) => {
  return { id: '123', ...data };
};

const generateReport = async (size) => {
  return { size, data: [] };
};

const showNotification = (message) => {
  console.log('Notification:', message);
};

const showErrorNotification = (message) => {
  console.error('Error notification:', message);
};

// ============================================================================
// EKSPORT (nie używaj tego w produkcji!)
// ============================================================================

export default {
  exampleBasicErrorHandling,
  exampleFirebaseGet,
  exampleFirebaseUpdate,
  exampleBatchOperation,
  exampleWithWrapper,
  exampleWithBreadcrumbs,
  exampleLogMessages,
  exampleErrorLevels,
  exampleFriendlyMessages
};

