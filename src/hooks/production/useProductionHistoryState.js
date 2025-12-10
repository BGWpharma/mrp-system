/**
 * Hook do zarządzania stanem historii produkcji w TaskDetailsPage
 * 
 * Konsoliduje stany:
 * - productionHistory
 * - editingHistoryItem
 * - editedHistoryItem
 * - enrichedProductionHistory
 * - addHistoryDialogOpen
 * - deleteHistoryItem
 * - deleteHistoryDialogOpen
 * - editedHistoryNote
 * - editedHistoryQuantity
 * - historyItemToDelete
 * - availableMachines
 * - selectedMachineId
 */

import { useState, useCallback } from 'react';

export const useProductionHistoryState = () => {
  // Skonsolidowany stan
  const [historyState, setHistoryState] = useState({
    // Dane historii
    history: [],
    enrichedHistory: [],
    
    // Edycja wpisu
    editingItem: null,
    editedItem: {
      startTime: new Date(),  // ✅ POPRAWKA: zgodne z oryginalnym useState
      endTime: new Date(),    // ✅ POPRAWKA: zgodne z oryginalnym useState
      quantity: 0,            // ✅ POPRAWKA: zgodne z oryginalnym useState
      machineId: '',
      note: ''
    },
    editedNote: '',
    editedQuantity: '',
    
    // Dialog dodawania
    addDialogOpen: false,
    
    // Dialog usuwania
    deleteDialogOpen: false,
    deleteItem: null,
    itemToDelete: null,
    
    // Maszyny
    machines: [],
    selectedMachineId: ''
  });

  // === Dane historii ===
  
  const setProductionHistory = useCallback((history) => {
    setHistoryState(prev => ({ ...prev, history }));
  }, []);

  const setEnrichedProductionHistory = useCallback((enrichedHistory) => {
    setHistoryState(prev => ({ ...prev, enrichedHistory }));
  }, []);

  // === Edycja wpisu ===
  
  const setEditingHistoryItem = useCallback((item) => {
    setHistoryState(prev => ({ 
      ...prev, 
      editingItem: item,
      editedItem: item ? {
        startTime: item.startTime,
        endTime: item.endTime,
        quantity: item.quantity || '',
        machineId: item.machineId || '',
        note: item.note || ''
      } : {
        startTime: new Date(),
        endTime: new Date(),
        quantity: 0,
        machineId: '',
        note: ''
      }
    }));
  }, []);

  const setEditedHistoryItem = useCallback((item) => {
    setHistoryState(prev => ({ 
      ...prev, 
      editedItem: typeof item === 'function' ? item(prev.editedItem) : item 
    }));
  }, []);

  const setEditedHistoryNote = useCallback((note) => {
    setHistoryState(prev => ({ ...prev, editedNote: note }));
  }, []);

  const setEditedHistoryQuantity = useCallback((quantity) => {
    setHistoryState(prev => ({ ...prev, editedQuantity: quantity }));
  }, []);

  const updateEditedItem = useCallback((field, value) => {
    setHistoryState(prev => ({
      ...prev,
      editedItem: {
        ...prev.editedItem,
        [field]: value
      }
    }));
  }, []);

  const cancelEditing = useCallback(() => {
    setHistoryState(prev => ({
      ...prev,
      editingItem: null,
      editedItem: {
        startTime: new Date(),
        endTime: new Date(),
        quantity: 0,
        machineId: '',
        note: ''
      }
    }));
  }, []);

  // === Dialog dodawania ===
  
  const openAddHistoryDialog = useCallback(() => {
    setHistoryState(prev => ({ ...prev, addDialogOpen: true }));
  }, []);

  const closeAddHistoryDialog = useCallback(() => {
    setHistoryState(prev => ({ ...prev, addDialogOpen: false }));
  }, []);

  // === Dialog usuwania ===
  
  const openDeleteHistoryDialog = useCallback((item) => {
    setHistoryState(prev => ({ 
      ...prev, 
      deleteDialogOpen: true,
      deleteItem: item,
      itemToDelete: item
    }));
  }, []);

  const closeDeleteHistoryDialog = useCallback(() => {
    setHistoryState(prev => ({ 
      ...prev, 
      deleteDialogOpen: false,
      deleteItem: null,
      itemToDelete: null
    }));
  }, []);

  const setDeleteHistoryItem = useCallback((item) => {
    setHistoryState(prev => ({ ...prev, deleteItem: item }));
  }, []);

  const setHistoryItemToDelete = useCallback((item) => {
    setHistoryState(prev => ({ ...prev, itemToDelete: item }));
  }, []);

  // === Maszyny ===
  
  const setAvailableMachines = useCallback((machines) => {
    setHistoryState(prev => ({ ...prev, machines }));
  }, []);

  const setSelectedMachineId = useCallback((machineId) => {
    setHistoryState(prev => ({ ...prev, selectedMachineId: machineId }));
  }, []);

  // === Reset ===
  
  const resetHistoryState = useCallback(() => {
    setHistoryState(prev => ({
      ...prev,
      editingItem: null,
      editedItem: {
        startTime: new Date(),
        endTime: new Date(),
        quantity: 0,
        machineId: '',
        note: ''
      },
      editedNote: '',
      editedQuantity: '',
      deleteItem: null,
      itemToDelete: null
    }));
  }, []);

  return {
    // Stan (rozpakowany dla kompatybilności wstecznej)
    productionHistory: historyState.history,
    enrichedProductionHistory: historyState.enrichedHistory,
    editingHistoryItem: historyState.editingItem,
    editedHistoryItem: historyState.editedItem,
    editedHistoryNote: historyState.editedNote,
    editedHistoryQuantity: historyState.editedQuantity,
    addHistoryDialogOpen: historyState.addDialogOpen,
    deleteHistoryDialogOpen: historyState.deleteDialogOpen,
    deleteHistoryItem: historyState.deleteItem,
    historyItemToDelete: historyState.itemToDelete,
    availableMachines: historyState.machines,
    selectedMachineId: historyState.selectedMachineId,
    
    // Akcje - dane historii
    setProductionHistory,
    setEnrichedProductionHistory,
    
    // Akcje - edycja
    setEditingHistoryItem,
    setEditedHistoryItem,
    setEditedHistoryNote,
    setEditedHistoryQuantity,
    updateEditedItem,
    cancelEditing,
    
    // Akcje - dialog dodawania
    openAddHistoryDialog,
    closeAddHistoryDialog,
    
    // Akcje - dialog usuwania
    openDeleteHistoryDialog,
    closeDeleteHistoryDialog,
    setDeleteHistoryItem,
    setHistoryItemToDelete,
    
    // Akcje - maszyny
    setAvailableMachines,
    setSelectedMachineId,
    
    // Reset
    resetHistoryState,
    
    // Settery dla kompatybilności wstecznej
    setAddHistoryDialogOpen: (open) => setHistoryState(prev => ({ ...prev, addDialogOpen: open })),
    setDeleteHistoryDialogOpen: (open) => setHistoryState(prev => ({ ...prev, deleteDialogOpen: open }))
  };
};

export default useProductionHistoryState;

