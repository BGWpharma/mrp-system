/**
 * Hook do zarządzania stanem konsumpcji materiałów w TaskDetailsPage
 * 
 * Konsoliduje stany:
 * - consumeMaterialsDialogOpen
 * - consumedMaterials
 * - selectedBatchesToConsume
 * - consumeQuantities
 * - consumeErrors
 * - consumingMaterials
 * - editConsumptionDialogOpen
 * - deleteConsumptionDialogOpen
 * - selectedConsumption
 * - editedQuantity
 * - restoreReservation
 * - deletingConsumption
 */

import { useState, useCallback } from 'react';

export const useConsumptionState = () => {
  // Skonsolidowany stan
  const [consumptionState, setConsumptionState] = useState({
    // Dialog konsumpcji
    dialogOpen: false,
    materials: [],
    selectedBatches: {},
    quantities: {},
    errors: {},
    consuming: false,
    
    // Dialog edycji konsumpcji
    editDialogOpen: false,
    selectedConsumption: null,
    editedQuantity: 0,
    
    // Dialog usuwania konsumpcji
    deleteDialogOpen: false,
    restoreReservation: true,
    deleting: false
  });

  // === Dialog konsumpcji ===
  
  const openConsumeMaterialsDialog = useCallback(() => {
    setConsumptionState(prev => ({ ...prev, dialogOpen: true }));
  }, []);

  const closeConsumeMaterialsDialog = useCallback(() => {
    setConsumptionState(prev => ({ 
      ...prev, 
      dialogOpen: false,
      selectedBatches: {},
      quantities: {},
      errors: {}
    }));
  }, []);

  const setConsumedMaterials = useCallback((materials) => {
    setConsumptionState(prev => ({ ...prev, materials }));
  }, []);

  const setSelectedBatchesToConsume = useCallback((batches) => {
    setConsumptionState(prev => ({ 
      ...prev, 
      selectedBatches: typeof batches === 'function' ? batches(prev.selectedBatches) : batches 
    }));
  }, []);

  const setConsumeQuantities = useCallback((quantities) => {
    setConsumptionState(prev => ({ 
      ...prev, 
      quantities: typeof quantities === 'function' ? quantities(prev.quantities) : quantities 
    }));
  }, []);

  const setConsumeErrors = useCallback((errors) => {
    setConsumptionState(prev => ({ 
      ...prev, 
      errors: typeof errors === 'function' ? errors(prev.errors) : errors 
    }));
  }, []);

  const setConsumingMaterials = useCallback((consuming) => {
    setConsumptionState(prev => ({ ...prev, consuming }));
  }, []);

  // === Dialog edycji konsumpcji ===
  
  const openEditConsumptionDialog = useCallback((consumption) => {
    setConsumptionState(prev => ({ 
      ...prev, 
      editDialogOpen: true,
      selectedConsumption: consumption,
      editedQuantity: consumption?.quantity || 0
    }));
  }, []);

  const closeEditConsumptionDialog = useCallback(() => {
    setConsumptionState(prev => ({ 
      ...prev, 
      editDialogOpen: false,
      selectedConsumption: null,
      editedQuantity: 0
    }));
  }, []);

  const setEditedQuantity = useCallback((quantity) => {
    setConsumptionState(prev => ({ ...prev, editedQuantity: quantity }));
  }, []);

  // === Dialog usuwania konsumpcji ===
  
  const openDeleteConsumptionDialog = useCallback((consumption) => {
    setConsumptionState(prev => ({ 
      ...prev, 
      deleteDialogOpen: true,
      selectedConsumption: consumption
    }));
  }, []);

  const closeDeleteConsumptionDialog = useCallback(() => {
    setConsumptionState(prev => ({ 
      ...prev, 
      deleteDialogOpen: false,
      selectedConsumption: null
    }));
  }, []);

  const setRestoreReservation = useCallback((restore) => {
    setConsumptionState(prev => ({ ...prev, restoreReservation: restore }));
  }, []);

  const setDeletingConsumption = useCallback((deleting) => {
    setConsumptionState(prev => ({ ...prev, deleting }));
  }, []);

  // === Pomocnicze ===

  // Aktualizacja wyboru partii do konsumpcji
  const updateBatchToConsumeSelection = useCallback((materialId, batchId, selected) => {
    setConsumptionState(prev => ({
      ...prev,
      selectedBatches: {
        ...prev.selectedBatches,
        [materialId]: {
          ...(prev.selectedBatches[materialId] || {}),
          [batchId]: selected
        }
      }
    }));
  }, []);

  // Aktualizacja ilości konsumpcji dla partii
  const updateConsumeQuantity = useCallback((materialId, batchId, quantity) => {
    const key = `${materialId}_${batchId}`;
    setConsumptionState(prev => ({
      ...prev,
      quantities: {
        ...prev.quantities,
        [key]: quantity
      }
    }));
  }, []);

  // Reset stanu konsumpcji
  const resetConsumptionState = useCallback(() => {
    setConsumptionState(prev => ({
      ...prev,
      selectedBatches: {},
      quantities: {},
      errors: {}
    }));
  }, []);

  return {
    // Stan (rozpakowany dla kompatybilności wstecznej)
    consumeMaterialsDialogOpen: consumptionState.dialogOpen,
    consumedMaterials: consumptionState.materials,
    selectedBatchesToConsume: consumptionState.selectedBatches,
    consumeQuantities: consumptionState.quantities,
    consumeErrors: consumptionState.errors,
    consumingMaterials: consumptionState.consuming,
    editConsumptionDialogOpen: consumptionState.editDialogOpen,
    deleteConsumptionDialogOpen: consumptionState.deleteDialogOpen,
    selectedConsumption: consumptionState.selectedConsumption,
    editedQuantity: consumptionState.editedQuantity,
    restoreReservation: consumptionState.restoreReservation,
    deletingConsumption: consumptionState.deleting,
    
    // Akcje - dialog konsumpcji
    openConsumeMaterialsDialog,
    closeConsumeMaterialsDialog,
    setConsumedMaterials,
    setSelectedBatchesToConsume,
    setConsumeQuantities,
    setConsumeErrors,
    setConsumingMaterials,
    
    // Akcje - dialog edycji
    openEditConsumptionDialog,
    closeEditConsumptionDialog,
    setEditedQuantity,
    
    // Akcje - dialog usuwania
    openDeleteConsumptionDialog,
    closeDeleteConsumptionDialog,
    setRestoreReservation,
    setDeletingConsumption,
    
    // Pomocnicze
    updateBatchToConsumeSelection,
    updateConsumeQuantity,
    resetConsumptionState,
    
    // Settery dla kompatybilności wstecznej
    setConsumeMaterialsDialogOpen: (open) => setConsumptionState(prev => ({ ...prev, dialogOpen: open })),
    setEditConsumptionDialogOpen: (open) => setConsumptionState(prev => ({ ...prev, editDialogOpen: open })),
    setDeleteConsumptionDialogOpen: (open) => setConsumptionState(prev => ({ ...prev, deleteDialogOpen: open })),
    setSelectedConsumption: (consumption) => setConsumptionState(prev => ({ ...prev, selectedConsumption: consumption }))
  };
};

export default useConsumptionState;

