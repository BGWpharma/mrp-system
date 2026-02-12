/**
 * Index file - eksportuje wszystkie komponenty dialogów produkcyjnych
 * 
 * 🚀 OPTYMALIZACJA: Centralizacja dialogów
 * - Każdy dialog to osobny, memoizowany komponent
 * - Lazy loading przez React.lazy() w TaskDetailsPage
 * - Czytelniejsza struktura kodu
 */

// Dialogi produkcji
export { default as StartProductionDialog } from './StartProductionDialog';
export { default as AddHistoryDialog } from './AddHistoryDialog';

// Dialogi materiałów
export { default as ReserveMaterialsDialog } from './ReserveMaterialsDialog';
export { default as PackagingDialog } from './PackagingDialog';
export { default as RawMaterialsDialog } from './RawMaterialsDialog';
export { default as AdditionalCostDialog } from './AdditionalCostDialog';

// Dialogi uniwersalne
export { default as DeleteConfirmDialog } from './DeleteConfirmDialog';

// Komponenty pomocnicze
export { default as ManualBatchSelectionContent } from './ManualBatchSelectionContent';

// TODO: Dodać w przyszłości:
// export { default as ConsumeMaterialsDialog } from './ConsumeMaterialsDialog';
// export { default as EditConsumptionDialog } from './EditConsumptionDialog';
// export { default as StopProductionDialog } from './StopProductionDialog';
