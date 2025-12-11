/**
 * Hook do zarządzania stanem opakowań w TaskDetailsPage
 * 
 * Konsoliduje stany:
 * - packagingDialogOpen
 * - packagingItems
 * - loadingPackaging
 * - selectedPackaging
 * - packagingQuantities
 * - searchPackaging
 * - consumePackagingImmediately
 */

import { useState, useCallback } from 'react';

export const usePackagingState = () => {
  // Skonsolidowany stan
  const [packagingState, setPackagingState] = useState({
    dialogOpen: false,
    items: [],
    loading: false,
    selected: {},
    quantities: {},
    search: '',
    consumeImmediately: true
  });

  // Otwieranie dialogu
  const openPackagingDialog = useCallback(() => {
    setPackagingState(prev => ({ ...prev, dialogOpen: true }));
  }, []);

  // Zamykanie dialogu z resetem stanu
  const closePackagingDialog = useCallback(() => {
    setPackagingState(prev => ({ 
      ...prev, 
      dialogOpen: false,
      selected: {},
      quantities: {},
      search: ''
    }));
  }, []);

  // Ustawianie elementów opakowań
  const setPackagingItems = useCallback((items) => {
    setPackagingState(prev => ({ 
      ...prev, 
      items: typeof items === 'function' ? items(prev.items) : items 
    }));
  }, []);

  // Ustawianie stanu ładowania
  const setLoadingPackaging = useCallback((loading) => {
    setPackagingState(prev => ({ ...prev, loading }));
  }, []);

  // Aktualizacja wybranego opakowania
  const setSelectedPackaging = useCallback((selected) => {
    setPackagingState(prev => ({ 
      ...prev, 
      selected: typeof selected === 'function' ? selected(prev.selected) : selected 
    }));
  }, []);

  // Aktualizacja ilości opakowań
  const setPackagingQuantities = useCallback((quantities) => {
    setPackagingState(prev => ({ 
      ...prev, 
      quantities: typeof quantities === 'function' ? quantities(prev.quantities) : quantities 
    }));
  }, []);

  // Ustawianie wyszukiwania
  const setSearchPackaging = useCallback((search) => {
    setPackagingState(prev => ({ ...prev, search }));
  }, []);

  // Przełączanie natychmiastowej konsumpcji
  const setConsumePackagingImmediately = useCallback((consumeImmediately) => {
    setPackagingState(prev => ({ ...prev, consumeImmediately }));
  }, []);

  // Toggle wyboru opakowania
  const togglePackagingSelection = useCallback((itemId) => {
    setPackagingState(prev => ({
      ...prev,
      selected: {
        ...prev.selected,
        [itemId]: !prev.selected[itemId]
      }
    }));
  }, []);

  // Aktualizacja ilości dla konkretnego opakowania
  const updatePackagingQuantity = useCallback((itemId, quantity) => {
    setPackagingState(prev => ({
      ...prev,
      quantities: {
        ...prev.quantities,
        [itemId]: quantity
      }
    }));
  }, []);

  // Reset stanu dialogu
  const resetPackagingDialog = useCallback(() => {
    setPackagingState(prev => ({
      ...prev,
      selected: {},
      quantities: {},
      search: ''
    }));
  }, []);

  return {
    // Stan (rozpakowany dla kompatybilności wstecznej)
    packagingDialogOpen: packagingState.dialogOpen,
    packagingItems: packagingState.items,
    loadingPackaging: packagingState.loading,
    selectedPackaging: packagingState.selected,
    packagingQuantities: packagingState.quantities,
    searchPackaging: packagingState.search,
    consumePackagingImmediately: packagingState.consumeImmediately,
    
    // Akcje
    openPackagingDialog,
    closePackagingDialog,
    setPackagingItems,
    setLoadingPackaging,
    setSelectedPackaging,
    setPackagingQuantities,
    setSearchPackaging,
    setConsumePackagingImmediately,
    togglePackagingSelection,
    updatePackagingQuantity,
    resetPackagingDialog,
    
    // Settery dla kompatybilności wstecznej
    setPackagingDialogOpen: (open) => setPackagingState(prev => ({ ...prev, dialogOpen: open }))
  };
};

export default usePackagingState;

