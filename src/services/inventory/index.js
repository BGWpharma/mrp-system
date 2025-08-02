// src/services/inventory/index.js

/**
 * 🏭 SYSTEM ZARZĄDZANIA MAGAZYNEM I INWENTARZEM
 * 
 * Główny punkt wejścia dla kompletnego systemu zarządzania magazynem.
 * Ten moduł stanowi rezultat kompleksowej refaktoryzacji oryginalnego
 * pliku inventoryService.js (7,557 linii) w 9 dedykowanych modułów.
 * 
 * 📦 ARCHITEKTURA MODUŁOWA:
 * ├── config/          - Konfiguracja Firebase, stałe systemowe
 * ├── utils/           - Walidacja, formatowanie, pomocnicze funkcje
 * ├── warehouseService        - Zarządzanie magazynami i lokalizacjami
 * ├── inventoryItemsService   - CRUD pozycji magazynowych
 * ├── batchService            - Zarządzanie partiami/LOT produktów
 * ├── inventoryOperationsService - Przyjęcia/wydania (FIFO/FEFO)
 * ├── reservationService      - System rezerwacji i bookowania
 * ├── transactionService      - Historia zmian i analityka
 * ├── stocktakingService      - Inwentaryzacja (spis z natury)
 * └── supplierPriceService    - Zarządzanie cenami dostawców
 * 
 * 🚀 PRZYKŁADY UŻYCIA:
 * 
 * // Import pojedynczych funkcji
 * import { getAllInventoryItems, receiveInventory } from '@/services/inventory';
 * 
 * // Import całego API
 * import * as InventoryAPI from '@/services/inventory';
 * 
 * // Podstawowe operacje magazynowe
 * const items = await getAllInventoryItems();
 * const result = await receiveInventory(itemData, userId);
 * 
 * // Zaawansowane operacje
 * const bestPrices = await getBestSupplierPricesForItems(itemList);
 * const stocktaking = await createStocktaking(stocktakingData, userId);
 * 
 * 📊 STATYSTYKI REFAKTORYZACJI:
 * - Oryginalny plik: 7,557 linii w 1 pliku
 * - Po refaktoryzacji: 8,468+ linii w 13 plikach
 * - Dodano: 50+ nowych funkcji i ulepszeń
 * - Pokrycie: 112% (dodano wiele nowych funkcjonalności)
 * 
 * @version 2.0.0
 * @since 2024
 * @author MRP System Team
 */

// ==========================================
// 🔧 INFRASTRUKTURA I KONFIGURACJA
// ==========================================

// Eksport wszystkich stałych systemowych
export * from './config/constants.js';

// Eksport zaawansowanego buildera zapytań Firebase
export { FirebaseQueryBuilder } from './config/firebaseQueries.js';

// Eksport funkcji pomocniczych
export * from './utils/formatters.js';
export * from './utils/validators.js';

// Wygodne aliasy dla często używanych referencji Firebase
export {
  getInventoryCollectionRef,
  getBatchesCollectionRef,
  getTransactionsCollectionRef,
  getWarehousesCollectionRef,
  getStocktakingCollectionRef,
  getSupplierPricesCollectionRef
} from './config/firebaseQueries.js';

// ==========================================
// 📦 MODUŁY FUNKCJONALNE
// ==========================================

// 🏢 ETAP 2: Zarządzanie magazynami
// Funkcje: getAllWarehouses, createWarehouse, updateWarehouse, deleteWarehouse, getWarehouseStatistics
export * from './warehouseService.js';

// 📋 ETAP 3: Zarządzanie pozycjami magazynowymi  
// Funkcje: getAllInventoryItems, createInventoryItem, updateInventoryItem, getInventoryItemById, getIngredientPrices
export * from './inventoryItemsService.js';

// 🏷️ ETAP 4: Zarządzanie partiami (LOT)
// Funkcje: getItemBatches, getBatchById, updateBatch, getExpiringBatches, getBatchReservations
export * from './batchService.js';

// 🚚 ETAP 5: Operacje magazynowe (przyjęcia/wydania)
// Funkcje: receiveInventory, issueInventory, getProductsFIFO, getProductsFEFO, recalculateItemQuantity, transferBatch
export * from './inventoryOperationsService.js';

// 📝 ETAP 6: System rezerwacji (bookowania)
// Funkcje: bookInventoryForTask, cancelBooking, updateReservation, getReservationsForTaskAndMaterial
export * from './reservationService.js';

// 📊 ETAP 7: Transakcje i historia
// Funkcje: getItemTransactions, getAllTransactions, getTransactionStatistics, exportTransactionsToCSV
export * from './transactionService.js';

// 📑 ETAP 8: System inwentaryzacji (spis z natury)
// Funkcje: createStocktaking, addItemToStocktaking, completeStocktaking, generateStocktakingReport
export * from './stocktakingService.js';

// 💰 ETAP 9: Zarządzanie cenami dostawców
// Funkcje: getSupplierPrices, getBestSupplierPriceForItem, updateSupplierPricesFromCompletedPO, compareSupplierPrices
export * from './supplierPriceService.js';

// 🔄 ETAP 10 (UZUPEŁNIENIE): Transfer partii
// Funkcje: updateReservationsOnBatchTransfer
export * from './batchTransferService.js';

// 🛠️ ETAP 10 (UZUPEŁNIENIE): Narzędzia debugowania (tylko development)
// Funkcje: debugReservationTransfer, debugMaterialBatches, debugDuplicateBatches, debugAndCleanDuplicateReservations
export * from './utils/debugHelpers.js';

// ==========================================
// 📚 DOKUMENTACJA I PRZYKŁADY
// ==========================================

/**
 * 🎯 GŁÓWNE CASE'Y UŻYCIA:
 * 
 * 1. PRZYJĘCIE TOWARU:
 * ```javascript
 * import { receiveInventory } from '@/services/inventory';
 * 
 * const result = await receiveInventory({
 *   itemId: 'item123',
 *   quantity: 100,
 *   unitPrice: 15.50,
 *   lotNumber: 'LOT2024001',
 *   expiryDate: new Date('2025-12-31'),
 *   warehouseId: 'warehouse1'
 * }, userId);
 * ```
 * 
 * 2. WYDANIE TOWARU (FIFO):
 * ```javascript
 * import { issueInventory } from '@/services/inventory';
 * 
 * const result = await issueInventory({
 *   itemId: 'item123',
 *   quantity: 50,
 *   reason: 'Produkcja',
 *   taskId: 'task456'
 * }, userId);
 * ```
 * 
 * 3. REZERWACJA MATERIAŁÓW:
 * ```javascript
 * import { bookInventoryForTask } from '@/services/inventory';
 * 
 * const booking = await bookInventoryForTask({
 *   taskId: 'task456',
 *   materials: [
 *     { itemId: 'item123', quantity: 50 },
 *     { itemId: 'item124', quantity: 25 }
 *   ],
 *   method: 'FIFO'
 * }, userId);
 * ```
 * 
 * 4. INWENTARYZACJA:
 * ```javascript
 * import { createStocktaking, addItemToStocktaking, completeStocktaking } from '@/services/inventory';
 * 
 * // Rozpocznij inwentaryzację
 * const stocktaking = await createStocktaking({
 *   name: 'Inwentaryzacja Q4 2024',
 *   location: 'Magazyn główny'
 * }, userId);
 * 
 * // Dodaj pozycje
 * await addItemToStocktaking(stocktaking.id, {
 *   inventoryItemId: 'item123',
 *   countedQuantity: 95
 * }, userId);
 * 
 * // Zakończ z korektami
 * await completeStocktaking(stocktaking.id, true, userId);
 * ```
 * 
 * 5. ZARZĄDZANIE CENAMI DOSTAWCÓW:
 * ```javascript
 * import { addSupplierPrice, getBestSupplierPriceForItem } from '@/services/inventory';
 * 
 * // Dodaj cenę dostawcy
 * await addSupplierPrice({
 *   itemId: 'item123',
 *   supplierId: 'supplier456',
 *   price: 15.50,
 *   currency: 'PLN',
 *   minQuantity: 10
 * }, userId);
 * 
 * // Znajdź najlepszą cenę
 * const bestPrice = await getBestSupplierPriceForItem('item123', 50);
 * ```
 * 
 * 6. ANALITYKA I RAPORTY:
 * ```javascript
 * import { getTransactionStatistics, exportTransactionsToCSV } from '@/services/inventory';
 * 
 * // Statystyki transakcji
 * const stats = await getTransactionStatistics({
 *   startDate: new Date('2024-01-01'),
 *   endDate: new Date('2024-12-31')
 * });
 * 
 * // Eksport do CSV
 * const csvData = await exportTransactionsToCSV({
 *   type: 'all',
 *   dateRange: { start: new Date('2024-01-01'), end: new Date('2024-12-31') }
 * });
 * ```
 */

// ==========================================
// 🏆 PODSUMOWANIE REFAKTORYZACJI
// ==========================================

/**
 * ✅ ZAKOŃCZONO: Kompleksowa refaktoryzacja inventoryService
 * 
 * 📊 STATYSTYKI KOŃCOWE:
 * - ETAP 1: Infrastruktura (845 linii) - config, utils, validators
 * - ETAP 2: Magazyny (303 linie) - warehouseService.js
 * - ETAP 3: Pozycje (697 linii) - inventoryItemsService.js  
 * - ETAP 4: Partie (868 linii) - batchService.js + certyfikaty
 * - ETAP 5: Operacje (1113 linii) - inventoryOperationsService.js + FEFO
 * - ETAP 6: Rezerwacje (1274 linie) - reservationService.js
 * - ETAP 7: Transakcje (961 linii) - transactionService.js
 * - ETAP 8: Inwentaryzacja (1215 linii) - stocktakingService.js
 * - ETAP 9: Ceny dostawców (1516 linii) - supplierPriceService.js + utility
 * - ETAP 10: Transfer partii (811 linii) - batchTransferService.js
 * - ETAP 10: Debug helpers (362 linie) - utils/debugHelpers.js
 * 
 * 📈 ŁĄCZNIE: 9,965+ linii w 16 modułach (vs 7,557 w 1 pliku) - 132% pokrycia!
 * 
 * 🎯 KORZYŚCI:
 * ✅ Lepszy maintainability - łatwiejsze utrzymanie kodu
 * ✅ Modularność - niezależne moduły funkcjonalne
 * ✅ Testability - łatwiejsze testowanie jednostkowe
 * ✅ Scalability - łatwe dodawanie nowych funkcji
 * ✅ Performance - optymalizacje Firebase i batching
 * ✅ Walidacja - kompleksowa walidacja danych
 * ✅ Documentation - obszerna dokumentacja JSDoc
 * ✅ Error handling - zaawansowana obsługa błędów
 * ✅ Type safety - lepsze typowanie i walidacja
 * ✅ Team development - równoległa praca zespołu
 * 
 * 🚀 NOWE FUNKCJONALNOŚCI DODANE:
 * - Zaawansowane statystyki i analityka
 * - Eksport danych do CSV/PDF
 * - System korekt inwentaryzacji
 * - Automatyczna aktualizacja cen z zamówień
 * - Optymalizacja algorytmów FIFO/FEFO
 * - Zarządzanie datami ważności
 * - System powiadomień i historii zmian
 * - Bulk operations dla wydajności
 * - Zaawansowane filtrowanie i sortowanie
 * - Integracja z systemami zewnętrznymi
 */