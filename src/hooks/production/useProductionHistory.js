/**
 * Hook do zarządzania historią produkcji zadania
 * Obsługuje ładowanie, dodawanie, edycję i usuwanie wpisów historii
 */

import { useState, useCallback, useEffect } from 'react';
import { 
  getProductionHistory,
  addProductionSession,
  updateProductionSession,
  deleteProductionSession
} from '../../services/productionService';
import { useNotification } from '../useNotification';
import { useUserNames } from '../useUserNames';

export const useProductionHistory = (taskId) => {
  const [productionHistory, setProductionHistory] = useState([]);
  const [enrichedHistory, setEnrichedHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [availableMachines, setAvailableMachines] = useState([]);
  const [selectedMachineId, setSelectedMachineId] = useState('');
  
  const { showSuccess, showError } = useNotification();
  const { userNames, fetchUserNames } = useUserNames();
  
  // ✅ Pobieranie historii produkcji
  const fetchHistory = useCallback(async () => {
    if (!taskId) {
      setProductionHistory([]);
      return;
    }
    
    try {
      setLoading(true);
      console.log('⚡ [LAZY-LOAD] Ładowanie historii produkcji dla zadania:', taskId);
      
      const history = await getProductionHistory(taskId);
      setProductionHistory(history || []);
      
      // Pobierz nazwy użytkowników z historii
      const userIds = [...new Set(history?.map(s => s.userId).filter(Boolean))];
      if (userIds.length > 0) {
        await fetchUserNames(userIds);
      }
      
      console.log('✅ [LAZY-LOAD] Historia produkcji załadowana:', history?.length || 0, 'wpisów');
      
    } catch (error) {
      console.error('Błąd podczas pobierania historii produkcji:', error);
      showError('Nie udało się pobrać historii produkcji');
      setProductionHistory([]);
    } finally {
      setLoading(false);
    }
  }, [taskId, fetchUserNames, showError]);
  
  // ✅ Pobieranie dostępnych maszyn
  const fetchMachines = useCallback(async () => {
    try {
      const { getAvailableMachines } = await import('../../services/machineService');
      const machines = await getAvailableMachines();
      setAvailableMachines(machines);
      return machines;
    } catch (error) {
      console.error('Błąd podczas pobierania maszyn:', error);
      return [];
    }
  }, []);
  
  // ✅ Wzbogacanie historii o dane z maszyn
  const enrichHistoryWithMachineData = useCallback(async () => {
    if (!selectedMachineId || !productionHistory || productionHistory.length === 0) {
      setEnrichedHistory(productionHistory || []);
      return;
    }
    
    try {
      console.log(`Wzbogacanie historii produkcji danymi z maszyny ${selectedMachineId}`);
      const { getProductionDataForHistory } = await import('../../services/machineService');
      const enriched = await getProductionDataForHistory(selectedMachineId, productionHistory);
      setEnrichedHistory(enriched);
    } catch (error) {
      console.error('Błąd podczas wzbogacania historii produkcji:', error);
      setEnrichedHistory(productionHistory || []);
    }
  }, [selectedMachineId, productionHistory]);
  
  // ✅ Dodawanie wpisu historii
  const addHistoryEntry = useCallback(async (historyData) => {
    if (!taskId) {
      showError('Brak ID zadania');
      return { success: false };
    }
    
    try {
      console.log('Dodawanie wpisu historii produkcji:', historyData);
      await addProductionSession(taskId, historyData);
      
      // Odśwież historię
      await fetchHistory();
      
      showSuccess('Dodano wpis do historii produkcji');
      return { success: true };
      
    } catch (error) {
      console.error('Błąd podczas dodawania wpisu historii:', error);
      showError('Nie udało się dodać wpisu do historii');
      return { success: false, error };
    }
  }, [taskId, fetchHistory, showSuccess, showError]);
  
  // ✅ Aktualizacja wpisu historii
  const updateHistoryEntry = useCallback(async (sessionId, updates) => {
    if (!taskId || !sessionId) {
      showError('Brak ID zadania lub sesji');
      return { success: false };
    }
    
    try {
      console.log('Aktualizacja wpisu historii:', sessionId, updates);
      await updateProductionSession(taskId, sessionId, updates);
      
      // Odśwież historię
      await fetchHistory();
      
      showSuccess('Zaktualizowano wpis historii');
      return { success: true };
      
    } catch (error) {
      console.error('Błąd podczas aktualizacji wpisu historii:', error);
      showError('Nie udało się zaktualizować wpisu');
      return { success: false, error };
    }
  }, [taskId, fetchHistory, showSuccess, showError]);
  
  // ✅ Usuwanie wpisu historii
  const deleteHistoryEntry = useCallback(async (sessionId) => {
    if (!taskId || !sessionId) {
      showError('Brak ID zadania lub sesji');
      return { success: false };
    }
    
    try {
      console.log('Usuwanie wpisu historii:', sessionId);
      await deleteProductionSession(taskId, sessionId);
      
      // Odśwież historię
      await fetchHistory();
      
      showSuccess('Usunięto wpis z historii');
      return { success: true };
      
    } catch (error) {
      console.error('Błąd podczas usuwania wpisu historii:', error);
      showError('Nie udało się usunąć wpisu');
      return { success: false, error };
    }
  }, [taskId, fetchHistory, showSuccess, showError]);
  
  // ✅ Automatyczne wzbogacanie historii gdy zmieni się maszyna lub historia
  useEffect(() => {
    enrichHistoryWithMachineData();
  }, [enrichHistoryWithMachineData]);
  
  return {
    productionHistory,
    enrichedHistory,
    loading,
    availableMachines,
    selectedMachineId,
    setSelectedMachineId,
    fetchHistory,
    fetchMachines,
    addHistoryEntry,
    updateHistoryEntry,
    deleteHistoryEntry,
    enrichHistoryWithMachineData
  };
};

