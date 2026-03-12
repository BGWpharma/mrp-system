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

// ===== FAZA 2: Ekstrakcja handlerów =====

// Handlery formularzy produkcyjnych
export { useFormHandlers } from './useFormHandlers';

// Handlery historii produkcji
export { useHistoryHandlers } from './useHistoryHandlers';

// Handlery materiałów (opakowania, surowce, usuwanie, koszty)
export { useMaterialHandlers } from './useMaterialHandlers';

// Handlery konsumpcji materiałów
export { useConsumptionHandlers } from './useConsumptionHandlers';

// Handlery rezerwacji materiałów
export { useReservationHandlers } from './useReservationHandlers';

// Handlery kontroli produkcji (status, start/stop, przyjęcie, drukowanie)
export { useProductionControlHandlers } from './useProductionControlHandlers';

// Handlery plików i załączników
export { useFileHandlers } from './useFileHandlers';

// Handlery dodatkowych kosztów MO
export { useAdditionalCostHandlers } from './useAdditionalCostHandlers';

// ===== FAZA 1.3: Rozszerzone hooki kosztów i synchronizacji =====

// Synchronizacja real-time (Firestore onSnapshot)
export { useTaskRealTimeSync } from './useTaskRealTimeSync';

// ===== FAZA B: Ekstrakcja fetcherów danych =====

// Pobieranie danych zadania (fetchTask, fetchAllTaskData, fetchPOReservations, etc.)
export { useTaskFetcher } from './useTaskFetcher';

// ===== FAZA 2+: Ekstrakcja report/fetcher =====

// Pobieranie danych raportu, alergeny, generowanie PDF
export { useTaskReportFetcher } from './useTaskReportFetcher';

// Pobieranie materiałów, partii, cen i zamówień oczekujących
export { useTaskMaterialFetcher } from './useTaskMaterialFetcher';

// ===== FAZA 1+: Kolejna konsolidacja stanów useState =====

// Stan raportu (firma, stanowisko, alergeny, PDF, naprawa receptury)
export { useTaskReportState } from './useTaskReportState';

// Stan debugowania spójności partii
export { useTaskDebugState } from './useTaskDebugState';

// Stan UI materiałów (zakładki, oczekujące zamówienia, ładowanie partii, koszty)
export { useTaskMaterialUIState } from './useTaskMaterialUIState';

// ===== FAZA 3: Hooki Timeline (ProductionTimeline) =====

// Stan danych timeline (tasks, workstations, customers, fetch)
export { useTimelineState } from './useTimelineState';

// Stan widoku timeline (zoom, skala, suwak, canvas)
export { useTimelineView } from './useTimelineView';

// Stan filtrów timeline (groupBy, workstations, customers, zaawansowane filtry)
export { useTimelineFilters } from './useTimelineFilters';

// Ustawienia timeline (kolory, tryb edycji, PO delivery, mobile)
export { useTimelineSettings } from './useTimelineSettings';

// Edycja zadań timeline (dialog, undo, move, resize, select)
export { useTimelineEdit } from './useTimelineEdit';

// Tooltip timeline (tooltip danych, PO tooltip)
export { useTimelineTooltip } from './useTimelineTooltip';

// Drag & drop timeline (przeciąganie kafelków)
export { useTimelineDrag } from './useTimelineDrag';

// Touch/gesture timeline (wheel, pinch, swipe, touchpad)
export { useTimelineTouch } from './useTimelineTouch';
