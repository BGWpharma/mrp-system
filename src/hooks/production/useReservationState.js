/**
 * Hook do zarządzania stanem rezerwacji materiałów w TaskDetailsPage
 * 
 * Konsoliduje stany:
 * - reserveDialogOpen
 * - reservationMethod
 * - reservingMaterials
 * - autoCreatePOReservations
 * - manualBatchQuantities
 * - reservationErrors
 * - selectedBatches
 * - manualBatchSelectionActive
 * - expandedMaterial
 * - showExhaustedBatches
 * - deletingReservation
 */

import { useState, useCallback } from 'react';

export const useReservationState = () => {
  // Skonsolidowany stan
  const [reservationState, setReservationState] = useState({
    dialogOpen: false,
    method: 'automatic', // 'automatic' | 'manual'
    reserving: false,
    autoCreatePO: true,
    manualQuantities: {},
    errors: {},
    selectedBatches: {},
    manualSelectionActive: false,
    expandedMaterial: null,
    showExhaustedBatches: false,
    deletingReservation: false
  });

  // Otwieranie dialogu rezerwacji
  const openReserveDialog = useCallback(() => {
    setReservationState(prev => ({ ...prev, dialogOpen: true }));
  }, []);

  // Zamykanie dialogu rezerwacji
  const closeReserveDialog = useCallback(() => {
    setReservationState(prev => ({ 
      ...prev, 
      dialogOpen: false,
      errors: {}
    }));
  }, []);

  // Ustawianie metody rezerwacji
  const setReservationMethod = useCallback((method) => {
    setReservationState(prev => ({ 
      ...prev, 
      method,
      manualSelectionActive: method === 'manual'
    }));
  }, []);

  // Ustawianie stanu rezerwowania
  const setReservingMaterials = useCallback((reserving) => {
    setReservationState(prev => ({ ...prev, reserving }));
  }, []);

  // Ustawianie automatycznego tworzenia PO
  const setAutoCreatePOReservations = useCallback((autoCreatePO) => {
    setReservationState(prev => ({ ...prev, autoCreatePO }));
  }, []);

  // Ustawianie ilości ręcznych partii
  const setManualBatchQuantities = useCallback((quantities) => {
    setReservationState(prev => ({ 
      ...prev, 
      manualQuantities: typeof quantities === 'function' ? quantities(prev.manualQuantities) : quantities 
    }));
  }, []);

  // Ustawianie błędów rezerwacji
  const setReservationErrors = useCallback((errors) => {
    setReservationState(prev => ({ 
      ...prev, 
      errors: typeof errors === 'function' ? errors(prev.errors) : errors 
    }));
  }, []);

  // Ustawianie wybranych partii
  const setSelectedBatches = useCallback((batches) => {
    setReservationState(prev => ({ 
      ...prev, 
      selectedBatches: typeof batches === 'function' ? batches(prev.selectedBatches) : batches 
    }));
  }, []);

  // Ustawianie aktywności ręcznego wyboru
  const setManualBatchSelectionActive = useCallback((active) => {
    setReservationState(prev => ({ ...prev, manualSelectionActive: active }));
  }, []);

  // Ustawianie rozszerzonego materiału
  const setExpandedMaterial = useCallback((materialId) => {
    setReservationState(prev => ({ ...prev, expandedMaterial: materialId }));
  }, []);

  // Przełączanie rozszerzonego materiału
  const toggleExpandedMaterial = useCallback((materialId) => {
    setReservationState(prev => ({ 
      ...prev, 
      expandedMaterial: prev.expandedMaterial === materialId ? null : materialId 
    }));
  }, []);

  // Ustawianie pokazywania wyczerpanych partii
  const setShowExhaustedBatches = useCallback((show) => {
    setReservationState(prev => ({ ...prev, showExhaustedBatches: show }));
  }, []);

  // Ustawianie stanu usuwania rezerwacji
  const setDeletingReservation = useCallback((deleting) => {
    setReservationState(prev => ({ ...prev, deletingReservation: deleting }));
  }, []);

  // Aktualizacja wybranej partii
  const updateSelectedBatch = useCallback((materialId, batchId, quantity) => {
    setReservationState(prev => {
      const materialBatches = [...(prev.selectedBatches[materialId] || [])];
      const existingIndex = materialBatches.findIndex(b => b.batchId === batchId);
      
      if (existingIndex >= 0) {
        if (quantity < 0) {
          materialBatches.splice(existingIndex, 1);
        } else {
          materialBatches[existingIndex].quantity = quantity;
        }
      } else if (quantity >= 0) {
        materialBatches.push({ batchId, quantity });
      }
      
      return {
        ...prev,
        selectedBatches: {
          ...prev.selectedBatches,
          [materialId]: materialBatches
        }
      };
    });
  }, []);

  // Reset stanu rezerwacji
  const resetReservationState = useCallback(() => {
    setReservationState(prev => ({
      ...prev,
      manualQuantities: {},
      errors: {},
      selectedBatches: {},
      expandedMaterial: null
    }));
  }, []);

  return {
    // Stan (rozpakowany dla kompatybilności wstecznej)
    reserveDialogOpen: reservationState.dialogOpen,
    reservationMethod: reservationState.method,
    reservingMaterials: reservationState.reserving,
    autoCreatePOReservations: reservationState.autoCreatePO,
    manualBatchQuantities: reservationState.manualQuantities,
    reservationErrors: reservationState.errors,
    selectedBatches: reservationState.selectedBatches,
    manualBatchSelectionActive: reservationState.manualSelectionActive,
    expandedMaterial: reservationState.expandedMaterial,
    showExhaustedBatches: reservationState.showExhaustedBatches,
    deletingReservation: reservationState.deletingReservation,
    
    // Akcje
    openReserveDialog,
    closeReserveDialog,
    setReservationMethod,
    setReservingMaterials,
    setAutoCreatePOReservations,
    setManualBatchQuantities,
    setReservationErrors,
    setSelectedBatches,
    setManualBatchSelectionActive,
    setExpandedMaterial,
    toggleExpandedMaterial,
    setShowExhaustedBatches,
    setDeletingReservation,
    updateSelectedBatch,
    resetReservationState,
    
    // Settery dla kompatybilności wstecznej
    setReserveDialogOpen: (open) => setReservationState(prev => ({ ...prev, dialogOpen: open }))
  };
};

export default useReservationState;

