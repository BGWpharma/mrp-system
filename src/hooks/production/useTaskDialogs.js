/**
 * Hook do zarządzania stanami dialogów w TaskDetailsPage
 * Centralizuje zarządzanie otwieraniem/zamykaniem wszystkich dialogów
 */

import { useState, useCallback } from 'react';

export const useTaskDialogs = () => {
  // ✅ Wszystkie stany dialogów w jednym obiekcie
  const [dialogsState, setDialogsState] = useState({
    consumption: false,
    confirmation: false,
    delete: false,
    stopProduction: false,
    receive: false,
    reserve: false,
    packaging: false,
    rawMaterials: false,
    addHistory: false,
    deleteHistory: false,
    productionControl: false,
    completedMO: false,
    productionShift: false,
    startProduction: false,
    deleteMaterial: false,
    consumeMaterials: false,
    editConsumption: false,
    deleteConsumption: false,
    commentsDrawer: false
  });
  
  // ✅ Dane kontekstowe dla dialogów (np. wybrany element do edycji/usunięcia)
  const [dialogContext, setDialogContext] = useState({
    selectedMaterial: null,
    selectedConsumption: null,
    selectedHistoryItem: null,
    editedData: null
  });
  
  // ✅ Otwórz dialog (z opcjonalnym kontekstem)
  const openDialog = useCallback((dialogName, context = {}) => {
    console.log(`📂 [DIALOG] Otwieranie dialogu: ${dialogName}`, context);
    
    setDialogsState(prev => ({
      ...prev,
      [dialogName]: true
    }));
    
    // Jeśli przekazano kontekst, zapisz go
    if (Object.keys(context).length > 0) {
      setDialogContext(prev => ({
        ...prev,
        ...context
      }));
    }
  }, []);
  
  // ✅ Zamknij dialog (z czyszczeniem kontekstu)
  const closeDialog = useCallback((dialogName, clearContext = true) => {
    console.log(`📁 [DIALOG] Zamykanie dialogu: ${dialogName}`);
    
    setDialogsState(prev => ({
      ...prev,
      [dialogName]: false
    }));
    
    // Wyczyść kontekst po zamknięciu
    if (clearContext) {
      setDialogContext({
        selectedMaterial: null,
        selectedConsumption: null,
        selectedHistoryItem: null,
        editedData: null
      });
    }
  }, []);
  
  // ✅ Zamknij wszystkie dialogi
  const closeAllDialogs = useCallback(() => {
    console.log('📁 [DIALOG] Zamykanie wszystkich dialogów');
    
    setDialogsState({
      consumption: false,
      confirmation: false,
      delete: false,
      stopProduction: false,
      receive: false,
      reserve: false,
      packaging: false,
      rawMaterials: false,
      addHistory: false,
      deleteHistory: false,
      productionControl: false,
      completedMO: false,
      productionShift: false,
      startProduction: false,
      deleteMaterial: false,
      consumeMaterials: false,
      editConsumption: false,
      deleteConsumption: false,
      commentsDrawer: false
    });
    
    setDialogContext({
      selectedMaterial: null,
      selectedConsumption: null,
      selectedHistoryItem: null,
      editedData: null
    });
  }, []);
  
  // ✅ Sprawdź czy jakikolwiek dialog jest otwarty
  const isAnyDialogOpen = useCallback(() => {
    return Object.values(dialogsState).some(isOpen => isOpen === true);
  }, [dialogsState]);
  
  // ✅ Helper do aktualizacji kontekstu dialogu
  const updateDialogContext = useCallback((updates) => {
    setDialogContext(prev => ({
      ...prev,
      ...updates
    }));
  }, []);
  
  return {
    // Stany dialogów
    dialogs: dialogsState,
    dialogContext,
    
    // Funkcje zarządzające
    openDialog,
    closeDialog,
    closeAllDialogs,
    isAnyDialogOpen,
    updateDialogContext,
    
    // Pomocnicze gettery dla czytelności
    isDialogOpen: (dialogName) => dialogsState[dialogName] === true,
    getDialogContext: (key) => dialogContext[key]
  };
};

