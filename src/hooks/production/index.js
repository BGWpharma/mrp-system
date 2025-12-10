/**
 * Index file - eksportuje wszystkie hooki produkcyjne
 * 
 * 🚀 OPTYMALIZACJA: Centralizacja logiki biznesowej w hookach
 * Każdy hook odpowiada za jedną domenę funkcjonalności
 */

// Dane zadania i real-time sync
export { useTaskData } from './useTaskData';

// Materiały, partie, rezerwacje
export { useTaskMaterials } from './useTaskMaterials';

// Historia produkcji
export { useProductionHistory } from './useProductionHistory';

// Obliczanie kosztów
export { useTaskCosts } from './useTaskCosts';

// Zarządzanie dialogami
export { useTaskDialogs } from './useTaskDialogs';

// Komentarze zadania
export { useTaskComments } from './useTaskComments';

// Akcje na zadaniu (start/stop, status, usuwanie)
export { useTaskActions } from './useTaskActions';

// ===== FAZA 1: Konsolidacja stanów useState =====

// Stan opakowań
export { usePackagingState } from './usePackagingState';

// Stan surowców
export { useRawMaterialsState } from './useRawMaterialsState';

// Stan rezerwacji
export { useReservationState } from './useReservationState';

// Stan konsumpcji
export { useConsumptionState } from './useConsumptionState';

// Stan historii produkcji
export { useProductionHistoryState } from './useProductionHistoryState';

// Stan załączników
export { useAttachmentsState } from './useAttachmentsState';
