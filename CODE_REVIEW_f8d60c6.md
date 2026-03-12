# Code Review: Migracja CRA → Vite + Refaktoryzacja komponentów

**Commit:** `f8d60c60dca2` – *Refactor project to use Vite and update environment configuration*  
**Data review:** 2026-03-12

---

## Podsumowanie zmian

Commit obejmuje dwie równoległe zmiany:
1. **Migracja z Create React App na Vite** – zmiana bundlera, aktualizacja zmiennych środowiskowych (`process.env.REACT_APP_*` → `import.meta.env.VITE_*`), zastąpienie `require()` przez dynamiczne `import()`.
2. **Refaktoryzacja dużych komponentów** – rozbicie monolitycznych komponentów (ProductionTimeline ~3000 linii, OrderForm ~1600 linii, CmrDetailsPage ~3800 linii, InventoryList, RecipeForm, PurchaseOrderForm) na mniejsze hooki i podkomponenty.

Migracja zmiennych środowiskowych jest **kompletna** – brak pozostałości `process.env` ani `REACT_APP_` w kodzie źródłowym.

---

## KRYTYCZNE PROBLEMY (wymagają poprawki)

### 1. Niezgodność wersji Sentry release
**Plik:** `package.json:55`  
**Problem:** Skrypt `sentry:sourcemaps` hardkoduje wersję `mrp-system@0.1.237`, podczas gdy `package.json` ma wersję `0.1.301`, a `index.html` — wersję `1.0.301`. Source mapy są uploadowane pod złą wersję release, przez co błędy w Sentry nie będą poprawnie mapowane na kod źródłowy.  
**Poprawka:** Użyć dynamicznej wersji z `package.json`:
```json
"sentry:sourcemaps": "sentry-cli sourcemaps upload --org bgwpharma --project bgw-mrp-system --release mrp-system@$npm_package_version ./build/assets"
```

### 2. `exportToCSV` wywołane ze złą sygnaturą
**Plik:** `src/hooks/inventory/useInventoryExport.js:261`  
**Problem:** Funkcja `exportToCSV(data, headers, filename)` wymaga trzech argumentów, ale `handleExportReservations` wywołuje ją jako `exportToCSV(dataToExport, fileName)` — bez `headers`. Drugi argument (`fileName`) zostanie potraktowany jako `headers`, co spowoduje runtime error: `headers.map is not a function`.  
**Poprawka:** Dodać odpowiedni obiekt headers przed `fileName`.

### 3. `useRecipeIngredients.linkAllIngredientsWithInventory` – wyścig stanów
**Plik:** `src/hooks/recipes/useRecipeIngredients.js:281-285`  
**Problem:** `updateIngredientId()` wywoływane w pętli `for...of` — każde wywołanie wykonuje `setRecipeData(prev => ...)`, ale ponieważ `updateIngredientId` zamyka się na `recipeData.ingredients` z closure, kolejne iteracje mogą nadpisywać wcześniejsze zmiany.  
**Poprawka:** Zebrać wszystkie zmiany do jednego obiektu i wykonać jeden `setRecipeData` po zakończeniu pętli.

### 4. `usePOInvoices` – brak null-check dla `purchaseOrder`
**Plik:** `src/hooks/purchaseOrders/usePOInvoices.js:9-20`  
**Problem:** `handleInvoiceLinkDialogOpen` i `handleInvoiceLinkSave` bezpośrednio odwołują się do `purchaseOrder.invoiceLink` etc. bez sprawdzenia, czy `purchaseOrder` nie jest `null`. Crash przy otwarciu dialogu faktury zanim PO się załaduje.  
**Poprawka:** Dodać `if (!purchaseOrder) return;` na początku każdej z tych funkcji.

### 5. `useInventoryWarehouses` – brak refetch przy zmianie filtrów
**Plik:** `src/hooks/inventory/useInventoryWarehouses.js:36`  
**Problem:** Jedyny `useEffect` to `fetchWarehouses` na mount (`[]`). Zmiana `selectedWarehouseForView`, `warehouseSearchTerm`, `warehouseItemsPage` nie wywołuje ponownego pobrania elementów magazynu — UI pozostaje na starych danych.  
**Poprawka:** Dodać efekty reagujące na zmianę tych zmiennych, wywołujące `fetchWarehouseItems`.

---

## WYSOKIE PROBLEMY (wpływają na stabilność)

### 6. `useMemo` użyte do side-effectów w `useTimelineDrag`
**Plik:** `src/hooks/production/useTimelineDrag.js:16-20`  
**Problem:** `useMemo` służy do obliczania wartości, nie do mutowania refów. React nie gwarantuje, kiedy `useMemo` zostanie wywołane (np. Strict Mode podwójne renderowanie).  
**Poprawka:** Zamienić na `useEffect`.

### 7. Stale closure w `useOrderFormCosts` – brak `currency` w dependencies
**Plik:** `src/hooks/orders/useOrderFormCosts.js:16-81`  
**Problem:** `useEffect` z pustą tablicą zależności `[]` używa `orderData.currency`. Zmiana waluty po zamontowaniu nie powoduje ponownego pobrania kursów walutowych.  
**Poprawka:** Dodać `orderData.currency` do tablicy zależności.

### 8. `setOrderData` w pętli w `useOrderFormCosts`
**Plik:** `src/hooks/orders/useOrderFormCosts.js:191-213`  
**Problem:** W `calculateEstimatedCostsForAllItems` każda iteracja pętli wywołuje `setOrderData`, ale korzysta z `orderData.items` z closure, nie z `prev`. Późniejsze iteracje nadpisują wcześniejsze.  
**Poprawka:** Zebrać zmiany i wykonać jedno `setOrderData(prev => ...)`.

### 9. `useTimelineTouch` – `initialPinchDistance` jako state zamiast ref
**Plik:** `src/hooks/production/useTimelineTouch.js:176-195`  
**Problem:** `initialPinchDistance` to `useState`. Pierwszy `touchmove` może wykonać się zanim state z `touchstart` się zaktualizuje. Dzielenie przez 0 daje `Infinity`, powodując błędny zoom.  
**Poprawka:** Użyć `useRef` zamiast `useState` dla `initialPinchDistance`.

### 10. `useRecipePriceList` – brak `recipeId` w trybie edycji
**Plik:** `src/hooks/recipes/useRecipePriceList.js:56`  
**Problem:** `productId: newRecipeId` — w trybie edycji `newRecipeId` jest `null`. Dodanie do listy cenowej zapisze `productId: null`.  
**Poprawka:** Przekazać `recipeId` jako fallback: `productId: newRecipeId || recipeId`.

### 11. `orderCache.js` – mutacja tablicy wejściowej
**Plik:** `src/utils/orderCache.js:39`  
**Problem:** `userIds.sort()` mutuje oryginalną tablicę przekazaną przez caller.  
**Poprawka:** `[...userIds].sort()`.

### 12. Brak czyszczenia BroadcastChannel listener w `useOrderData`
**Plik:** `src/hooks/orders/useOrderData.js:384-417`  
**Problem:** `handleCostUpdate` dodawany przez `addEventListener` nie jest usuwany w cleanup effectu. Tylko `channel.close()` jest wywoływane, ale listener może trzymać referencje.  
**Poprawka:** Dodać `channel.removeEventListener('message', handleCostUpdate)` przed `channel.close()`.

---

## ŚREDNIE PROBLEMY (powinny być poprawione)

### 13. `useOrderFormData` – stale closure w promise handler
**Plik:** `src/hooks/orders/useOrderFormData.js:446-453`  
Asynchroniczne `getExchangeRate().then()` używa `orderData.shippingCurrency` z zamknięcia. Gdy promise się rozwiąże, wartość może być nieaktualna.

### 14. Brak null-check dla `currentUser` w `useOrderFormData`
**Plik:** `src/hooks/orders/useOrderFormData.js:429`  
`currentUser.uid` wywoływane bez sprawdzenia `currentUser`. Crash przy niezalogowanym użytkowniku.

### 15. `useTimelineEdit` – mutacja tablicy sort()
**Plik:** `src/hooks/production/useTimelineEdit.js:39, 67`  
`tasksInGroup.sort()` mutuje oryginalną tablicę `tasks`.  
**Poprawka:** `[...tasksInGroup].sort(...)`.

### 16. Race condition w `useTimelineState.enrichTasksWithPO`
**Plik:** `src/hooks/production/useTimelineState.js:234-241`  
`tasks` jest captured w momencie wywołania. Jeśli tasks zmienią się przed rozwiązaniem promise, `setTasks(enrichedTasks)` nadpisze nowsze dane.

### 17. Brak null-checks w komponentach CMR
**Pliki:** `CmrPrintView.js`, `CmrFinanceTab.js`, `CmrPartiesTransportTab.js`, `CmrItemsWeightsTab.js`  
Brak sprawdzenia `cmrData`, `itemsWeightDetails`, `linkedOrders`, `weightSummary` przed użyciem. Crash jeśli dane się nie załadują.

### 18. `useInventoryData` – debounce z stale closures
**Plik:** `src/hooks/inventory/useInventoryData.js:147-169`  
Wewnątrz `setTimeout`, `searchTerm !== debouncedSearchTerm` używa zamknięcia z poprzedniego renderowania, co może prowadzić do zbędnych fetchów lub ich pominięcia.

### 19. Niekompletne `hasActiveAdvancedFilters` w `useTimelineFilters`
**Plik:** `src/hooks/production/useTimelineFilters.js:65-68`  
Ignoruje filtry `startDate` i `endDate` — filtrowanie tylko po datach nie jest traktowane jako aktywny filtr.

### 20. `useOrderDocuments` – nieużywany wynik API
**Plik:** `src/hooks/orders/useOrderDocuments.js:133`  
`getInvoicedAmountsByOrderItems(orderId)` wywoływane, ale wynik nie jest nigdzie używany — niepotrzebne zapytanie do bazy.

---

## PROBLEMY OPTYMALIZACYJNE

### 21. `manualChunks` w Vite mogą powodować problemy
**Plik:** `vite.config.js:26-30`  
Ręcznie zdefiniowane chunki (`vendor`, `firebase`, `mui`) mogą powodować duplikację modułów jeśli podzależności są współdzielone. Vite domyślnie robi dobre tree-shaking.  
**Zalecenie:** Przetestować rozmiar bundla z i bez `manualChunks`. Rozważyć usunięcie lub użycie `splitVendorChunkPlugin`.

### 22. `addVersionToResources` w `index.html` jest zbędne z Vite
**Plik:** `index.html:41-56`  
Vite automatycznie dodaje hashe do nazw plików w buildzie produkcyjnym. Ręczne dodawanie `?v=` do zasobów jest zbędne i może powodować podwójne cachowanie.  
**Poprawka:** Usunąć `addVersionToResources()` — Vite obsługuje cache busting natywnie.

### 23. `window.location.reload(true)` jest deprecated
**Plik:** `index.html:76`  
`forceReload` parametr w `location.reload()` jest deprecated w nowoczesnych przeglądarkach.  
**Poprawka:** Użyć `window.location.reload()` (bez `true`).

### 24. `checkAppVersion` w `index.html` – duplikacja z Vite
**Plik:** `index.html:59-84`  
System wersji oparty na `localStorage` + `confirm()` jest mało elegancki z Vite, który obsługuje HMR i chunk hashing. Lepiej użyć Vite plugin `vite-plugin-pwa` lub Service Worker z powiadomieniami.

### 25. Brak `useCallback` w `useTimelineTooltip`
**Plik:** `src/hooks/production/useTimelineTooltip.js:34-48`  
`hideTooltip`, `showPOTooltip`, `hidePOTooltip` tworzone na każdym renderze. Przekazywane do `useTimelineTouch`, co powoduje dodatkowe re-subskrypcje event listenerów.

### 26. `getBatchesWithPOData` – `where` na zagnieżdżonym polu z `!= null`
**Plik:** `src/services/aiDataService.js`  
Zapytanie `where('purchaseOrderDetails.id', '!=', null)` wymaga composite indexu w Firestore i może nie działać poprawnie na zagnieżdżonym polu. Ponadto `limit(200)` może odciąć ważne dane.  
**Zalecenie:** Zweryfikować, czy index istnieje. Rozważyć dodanie pola boolean `hasPurchaseOrder` na poziomie dokumentu.

---

## NISKIE PROBLEMY / SUGESTIE

| # | Plik | Problem |
|---|------|---------|
| 27 | `useTimelineEdit.js:322` | Hardkodowany tekst po polsku zamiast `t()` |
| 28 | `useOrderFormData.js:695` | Loose equality `==` zamiast `===` |
| 29 | `useOrderNumberEdit.js:6` | Nieużywany prop `refreshOrderData` |
| 30 | `useInventoryReservations.js:101-102` | Zmienna `t` z `filter(t => ...)` przesłania `t` z `useTranslation()` |
| 31 | `useInventoryLabels.js:33` | `setTimeout` bez cleanup na unmount |
| 32 | `DragTimeDisplay.js:49,91,103,108,132` | Hardkodowane polskie stringi zamiast kluczy tłumaczeń |
| 33 | `CmrItemsWeightsTab.js:308` | `key={index}` zamiast stabilnego klucza |
| 34 | `useCmrStatus.js:1` | Nieużywany import `React` |

---

## POZYTYWNE ASPEKTY COMMITU

1. **Kompletna migracja `process.env`** — żadne pozostałości `REACT_APP_` w kodzie
2. **Zamiana `require()` na `import()`** — poprawne dynamiczne importy w ESM
3. **Optymalizacja `getMRPSystemSummary`** — użycie `getCountFromServer` zamiast pobierania pełnych kolekcji (znacząca oszczędność odczytów Firestore)
4. **Batch fetch w `supplierPriceService`** — zamiast N zapytań po jednym, prefetch wszystkich cen dostawcy jednym zapytaniem
5. **Batch fetch w `supplierService.getBestSupplierPricesForItems`** — chunked `where('itemId', 'in', chunk)` zamiast N osobnych zapytań
6. **Dodanie statusu `confirmed` do dozwolonych w `poReservationService`** — poprawka logiki biznesowej
7. **Limit 50 na `subscribeToProcurementForecasts`** — ograniczenie kosztów snapshotów
8. **Dobra dekompozycja komponentów** — z ~3000 linii monolitów do wielu mniejszych hooków

---

## PRIORYTETY POPRAWEK

**Natychmiast (mogą powodować błędy produkcyjne):**
- [ ] #1 – Sentry release version mismatch
- [ ] #2 – `exportToCSV` wrong arguments
- [ ] #4 – `usePOInvoices` null crash
- [ ] #5 – `useInventoryWarehouses` brak refetch

**W najbliższym sprint:**
- [ ] #3 – `linkAllIngredientsWithInventory` race condition
- [ ] #6 – `useMemo` side effects
- [ ] #7-8 – `useOrderFormCosts` stale closure + loop setState
- [ ] #9 – pinch zoom Infinity
- [ ] #10 – `useRecipePriceList` null productId
- [ ] #11 – `orderCache` array mutation
- [ ] #22 – Usunąć zbędne `addVersionToResources`

**Przy okazji:**
- [ ] #13-20 – Race conditions, null checks, stale closures
- [ ] #25-26 – Optymalizacje wydajności
- [ ] #27-34 – Drobne poprawki jakości kodu
