/**
 * Hook do zarządzania akcjami na zadaniu produkcyjnym
 * Obsługuje start/stop produkcji, zmianę statusu, usuwanie
 */

import { useState, useCallback } from 'react';
import { 
  startProduction, 
  stopProduction, 
  pauseProduction,
  updateTaskStatus,
  deleteTask,
  addTaskProductToInventory
} from '../../services/productionService';
import { useNotification } from '../useNotification';

export const useTaskActions = (taskId, currentUserId, onRefresh) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { showSuccess, showError, showWarning } = useNotification();

  // ✅ Rozpocznij produkcję
  const handleStartProduction = useCallback(async (expiryDate = null) => {
    if (!taskId || !currentUserId) {
      showError('Brak wymaganych danych do rozpoczęcia produkcji');
      return { success: false };
    }

    try {
      setLoading(true);
      setError(null);
      
      const result = await startProduction(taskId, currentUserId, expiryDate);
      
      // Wyświetl odpowiedni komunikat
      if (result.batchResult) {
        if (result.batchResult.message === 'Partia już istnieje') {
          showSuccess('Produkcja wznowiona - używa istniejącą partię produktu');
        } else if (result.batchResult.isNewBatch === false) {
          showSuccess('Produkcja wznowiona - dodano do istniejącej partii produktu');
        } else {
          showSuccess('Produkcja rozpoczęta - utworzono nową pustą partię produktu');
        }
      } else {
        showSuccess('Produkcja rozpoczęta');
      }
      
      if (onRefresh) await onRefresh();
      return { success: true, result };
    } catch (err) {
      console.error('Błąd podczas rozpoczynania produkcji:', err);
      setError(err.message);
      showError('Błąd podczas rozpoczynania produkcji: ' + err.message);
      return { success: false, error: err };
    } finally {
      setLoading(false);
    }
  }, [taskId, currentUserId, onRefresh, showSuccess, showError]);

  // ✅ Zatrzymaj produkcję (pause)
  const handlePauseProduction = useCallback(async () => {
    if (!taskId || !currentUserId) {
      showError('Brak wymaganych danych do wstrzymania produkcji');
      return { success: false };
    }

    try {
      setLoading(true);
      setError(null);
      
      await pauseProduction(taskId, currentUserId);
      showSuccess('Produkcja została wstrzymana. Możesz kontynuować później.');
      
      if (onRefresh) await onRefresh();
      return { success: true };
    } catch (err) {
      console.error('Błąd podczas wstrzymywania produkcji:', err);
      setError(err.message);
      showError('Błąd podczas wstrzymywania produkcji: ' + err.message);
      return { success: false, error: err };
    } finally {
      setLoading(false);
    }
  }, [taskId, currentUserId, onRefresh, showSuccess, showError]);

  // ✅ Zatrzymaj produkcję z danymi (stop)
  const handleStopProduction = useCallback(async (productionData) => {
    if (!taskId || !currentUserId) {
      showError('Brak wymaganych danych do zatrzymania produkcji');
      return { success: false };
    }

    const { completedQuantity, startTime, endTime, inventoryData, addToInventory } = productionData;

    try {
      setLoading(true);
      setError(null);
      
      // Oblicz czas trwania w minutach
      const durationMs = new Date(endTime).getTime() - new Date(startTime).getTime();
      const durationMinutes = Math.round(durationMs / (1000 * 60));
      
      const result = await stopProduction(
        taskId, 
        parseFloat(completedQuantity), 
        durationMinutes, 
        currentUserId,
        {
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString()
        }
      );
      
      // Jeśli użytkownik wybrał opcję dodania do magazynu
      if (addToInventory && inventoryData) {
        try {
          const inventoryResult = await addTaskProductToInventory(taskId, currentUserId, {
            expiryDate: inventoryData.expiryDate?.toISOString?.() || inventoryData.expiryDate,
            lotNumber: inventoryData.lotNumber,
            finalQuantity: parseFloat(inventoryData.finalQuantity),
            warehouseId: inventoryData.warehouseId
          });
          
          showSuccess(`Produkcja zatrzymana i ${inventoryResult.message}`);
        } catch (inventoryError) {
          console.error('Błąd podczas dodawania produktu do magazynu:', inventoryError);
          showWarning('Produkcja zatrzymana, ale wystąpił błąd podczas dodawania produktu do magazynu');
        }
      } else {
        showSuccess(result.isCompleted ? 
          'Produkcja zakończona. Zadanie zostało ukończone.' : 
          'Sesja produkcyjna zapisana. Możesz kontynuować produkcję później.'
        );
      }
      
      if (onRefresh) await onRefresh();
      return { success: true, result };
    } catch (err) {
      console.error('Błąd podczas zatrzymywania produkcji:', err);
      setError(err.message);
      showError('Błąd podczas zatrzymywania produkcji: ' + err.message);
      return { success: false, error: err };
    } finally {
      setLoading(false);
    }
  }, [taskId, currentUserId, onRefresh, showSuccess, showError, showWarning]);

  // ✅ Zmień status zadania
  const handleStatusChange = useCallback(async (newStatus) => {
    if (!taskId || !currentUserId) {
      showError('Brak wymaganych danych do zmiany statusu');
      return { success: false };
    }

    try {
      setLoading(true);
      setError(null);
      
      await updateTaskStatus(taskId, newStatus, currentUserId);
      showSuccess(`Status zadania zmieniony na: ${newStatus}`);
      
      if (onRefresh) await onRefresh();
      return { success: true };
    } catch (err) {
      console.error('Błąd podczas zmiany statusu:', err);
      setError(err.message);
      showError('Błąd podczas zmiany statusu: ' + err.message);
      return { success: false, error: err };
    } finally {
      setLoading(false);
    }
  }, [taskId, currentUserId, onRefresh, showSuccess, showError]);

  // ✅ Usuń zadanie
  const handleDeleteTask = useCallback(async () => {
    if (!taskId || !currentUserId) {
      showError('Brak wymaganych danych do usunięcia zadania');
      return { success: false };
    }

    try {
      setLoading(true);
      setError(null);
      
      await deleteTask(taskId, currentUserId);
      showSuccess('Zadanie zostało usunięte');
      
      return { success: true };
    } catch (err) {
      console.error('Błąd podczas usuwania zadania:', err);
      setError(err.message);
      showError('Błąd podczas usuwania zadania: ' + err.message);
      return { success: false, error: err };
    } finally {
      setLoading(false);
    }
  }, [taskId, currentUserId, showSuccess, showError]);

  // ✅ Dodaj produkt do magazynu
  const handleAddToInventory = useCallback(async (inventoryData) => {
    if (!taskId || !currentUserId) {
      showError('Brak wymaganych danych do dodania do magazynu');
      return { success: false };
    }

    try {
      setLoading(true);
      setError(null);
      
      const result = await addTaskProductToInventory(taskId, currentUserId, {
        expiryDate: inventoryData.expiryDate?.toISOString?.() || inventoryData.expiryDate,
        lotNumber: inventoryData.lotNumber,
        finalQuantity: parseFloat(inventoryData.finalQuantity),
        warehouseId: inventoryData.warehouseId
      });
      
      showSuccess(result.message);
      
      if (onRefresh) await onRefresh();
      return { success: true, result };
    } catch (err) {
      console.error('Błąd podczas dodawania produktu do magazynu:', err);
      setError(err.message);
      showError('Błąd podczas dodawania produktu do magazynu: ' + err.message);
      return { success: false, error: err };
    } finally {
      setLoading(false);
    }
  }, [taskId, currentUserId, onRefresh, showSuccess, showError]);

  return {
    // Stan
    loading,
    error,
    
    // Akcje produkcji
    handleStartProduction,
    handlePauseProduction,
    handleStopProduction,
    
    // Akcje statusu
    handleStatusChange,
    handleDeleteTask,
    
    // Akcje magazynu
    handleAddToInventory
  };
};

