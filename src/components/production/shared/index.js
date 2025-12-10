/**
 * Index file - eksportuje wszystkie współdzielone komponenty produkcyjne
 * 
 * 🚀 OPTYMALIZACJA: Centralizacja komponentów współdzielonych
 * - Każdy komponent to osobny, memoizowany plik
 * - Ułatwia import i utrzymanie kodu
 */

// Komponenty statusów
export { default as StatusChip } from './StatusChip';
export { default as TaskStatusChip } from './TaskStatusChip';

// Komponenty materiałów i kosztów
export { default as MaterialReservationBadge } from './MaterialReservationBadge';
export { default as CostSummaryCard } from './CostSummaryCard';

// Komponenty UI
export { default as CommentsDrawer } from './CommentsDrawer';
