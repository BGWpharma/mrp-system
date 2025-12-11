/**
 * Hook do zarządzania stanem surowców w TaskDetailsPage
 * 
 * Konsoliduje stany:
 * - rawMaterialsDialogOpen
 * - rawMaterialsItems
 * - loadingRawMaterials
 * - searchRawMaterials
 * - materialCategoryTab
 */

import { useState, useCallback } from 'react';

export const useRawMaterialsState = () => {
  // Skonsolidowany stan
  const [rawMaterialsState, setRawMaterialsState] = useState({
    dialogOpen: false,
    items: [],
    loading: false,
    search: '',
    categoryTab: 0 // 0 = Surowce, 1 = Opakowania jednostkowe
  });

  // Otwieranie dialogu
  const openRawMaterialsDialog = useCallback(() => {
    setRawMaterialsState(prev => ({ ...prev, dialogOpen: true }));
  }, []);

  // Zamykanie dialogu z resetem stanu
  const closeRawMaterialsDialog = useCallback(() => {
    setRawMaterialsState(prev => ({ 
      ...prev, 
      dialogOpen: false,
      search: ''
    }));
  }, []);

  // Ustawianie elementów surowców
  const setRawMaterialsItems = useCallback((items) => {
    setRawMaterialsState(prev => ({ 
      ...prev, 
      items: typeof items === 'function' ? items(prev.items) : items 
    }));
  }, []);

  // Ustawianie stanu ładowania
  const setLoadingRawMaterials = useCallback((loading) => {
    setRawMaterialsState(prev => ({ ...prev, loading }));
  }, []);

  // Ustawianie wyszukiwania
  const setSearchRawMaterials = useCallback((search) => {
    setRawMaterialsState(prev => ({ ...prev, search }));
  }, []);

  // Ustawianie zakładki kategorii
  const setMaterialCategoryTab = useCallback((categoryTab) => {
    setRawMaterialsState(prev => ({ ...prev, categoryTab }));
  }, []);

  // Reset stanu dialogu
  const resetRawMaterialsDialog = useCallback(() => {
    setRawMaterialsState(prev => ({
      ...prev,
      search: '',
      categoryTab: 0
    }));
  }, []);

  return {
    // Stan (rozpakowany dla kompatybilności wstecznej)
    rawMaterialsDialogOpen: rawMaterialsState.dialogOpen,
    rawMaterialsItems: rawMaterialsState.items,
    loadingRawMaterials: rawMaterialsState.loading,
    searchRawMaterials: rawMaterialsState.search,
    materialCategoryTab: rawMaterialsState.categoryTab,
    
    // Akcje
    openRawMaterialsDialog,
    closeRawMaterialsDialog,
    setRawMaterialsItems,
    setLoadingRawMaterials,
    setSearchRawMaterials,
    setMaterialCategoryTab,
    resetRawMaterialsDialog,
    
    // Settery dla kompatybilności wstecznej
    setRawMaterialsDialogOpen: (open) => setRawMaterialsState(prev => ({ ...prev, dialogOpen: open }))
  };
};

export default useRawMaterialsState;

