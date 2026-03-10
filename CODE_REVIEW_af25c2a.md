# Code Review — Commit af25c2a

**Data:** 2026-03-10  
**Commit:** `af25c2aa7bfb47d013a15a981fa51b8fd2d9159f`  
**Opis commita:** Enhance CMR management and introduce new components for improved user experience  
**Pliki:** 31 zmienionych (3 nowe, 28 zmodyfikowanych)

---

## Podsumowanie zmian

Commit wprowadza kilka kategorii zmian:
1. **Nowe komponenty reużywalne** — `FormPageLayout`, `TableSkeleton`, `useAsyncAction`
2. **Optymalizacja memoizacji** — masowe dodanie `useCallback`/`useMemo` w ~15 komponentach
3. **Centralizacja logowania** — zastąpienie `console.*` wrapperem `logger.*`
4. **Refaktor Delivery Notes** — konsolidacja `generateAllDeliveryNoteData` + `buildAttachedDocumentsWithDN`
5. **Unifikacja notyfikacji** — migracja z `toast` na `useNotification`
6. **Drobne zmiany UI** — lżejsze hover effects w Sidebar, `tableHeaderSx` w `muiCommonStyles`

---

## 🔴 BŁĘDY (wymagają naprawy)

### 1. `handleUpdateStatus` w `InvoiceDetails.js` — brakująca zależność `fetchInvoice`

**Plik:** `src/components/invoices/InvoiceDetails.js` linia ~216–239

```javascript
const handleUpdateStatus = useCallback(async (newStatus) => {
    // ...
    await fetchInvoice();  // ← wywołanie funkcji
    // ...
}, [invoiceId, currentUser.uid, showSuccess, showError, t]);
//   ↑ BRAK fetchInvoice w tablicy zależności
```

`fetchInvoice` jest zwykłą funkcją (nie owiniętą w `useCallback`) i nie jest wymieniona w tablicy zależności `useCallback`. To powoduje:
- **Stale closure** — jeśli `fetchInvoice` kiedykolwiek zostanie zmodyfikowany/przebudowany, `handleUpdateStatus` będzie używać przestarzałej wersji
- React eslint rule `react-hooks/exhaustive-deps` powinno to sygnalizować jako warning

**Rekomendacja:** Albo dodać `fetchInvoice` do deps i owinąć ją w `useCallback`, albo usunąć `useCallback` z `handleUpdateStatus` (bo i tak zależy od niestabilnej referencji).

---

### 2. Logger usunął ochronę `isDev` — logi w produkcji

**Plik:** `src/utils/logger.js`

Poprzednia wersja:
```javascript
const isDev = process.env.NODE_ENV !== 'production';
export const logger = {
  debug: (...args) => isDev && console.log(...args),
  info: (...args) => isDev && console.info(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
};
```

Nowa wersja:
```javascript
export const logger = {
  log: (...args) => console.log(...args),       // ← ZAWSZE loguje
  error: (...args) => console.error(...args),
  warn: (...args) => console.warn(...args),
  debug: (...args) => console.log('[DEBUG]', ...args),  // ← ZAWSZE loguje
};
```

**Problem:** Usunięto guard `isDev` i zmieniono nazwę metody z `info` na `log`. Teraz **setki** wywołań `logger.log()` i `logger.debug()` (w cmrService, productionService, purchaseOrderService itd.) będą wyświetlać komunikaty w konsoli produkcyjnej użytkownika. To obejmuje wrażliwe dane debugowe jak:
- `[DEBUG-DELIVERY] linkedBatch.itemId`, `[DEBUG-DELIVERY] linkedBatch.warehouseId`
- Struktury danych zamówień
- Informacje o rezerwacjach magazynowych

**Rekomendacja:** Przywrócić filtrowanie środowiskowe:
```javascript
const isDev = process.env.NODE_ENV !== 'production';
export const logger = {
  log: (...args) => isDev && console.log(...args),
  error: (...args) => console.error(...args),
  warn: (...args) => isDev && console.warn(...args),
  debug: (...args) => isDev && console.log('[DEBUG]', ...args),
};
```

---

### 3. `CmrForm.js` / `NewCmrForm.js` — `handleSubmit` zmieniony na synchroniczny, ale `onSubmit` jest async

**Plik:** `src/pages/Inventory/Cmr/CmrForm.js` linia ~1593, `src/pages/Inventory/Cmr/NewCmrForm.js` linia ~471

`handleSubmit` został zmieniony z `async` na synchroniczny, ale nadal wywołuje `onSubmit(dataToSubmit)` wewnątrz bloku `try/catch`. Jeśli `onSubmit` jest async (i rzeczywiście jest — `CmrCreatePage.handleSubmit` jest async), to:
- Odrzucony Promise z `onSubmit` **nie zostanie złapany** przez `try/catch` (bo nie ma `await`)
- Użytkownik nie zobaczy komunikatu błędu, a w konsoli pojawi się `Unhandled Promise Rejection`

**Rekomendacja:** Przywrócić `await` przed `onSubmit(dataToSubmit)` lub zachować `async` handler:
```javascript
const handleSubmit = async (e) => {
    // ...
    if (isValid) {
        await onSubmit(dataToSubmit);  // ← potrzebny await
    }
};
```

---

## 🟡 OSTRZEŻENIA (potencjalne problemy)

### 4. Stale closure w `toggleFilters` (InvoicesList.js)

```javascript
const toggleFilters = useCallback(() => {
    listActions.setFiltersExpanded(!listState.filtersExpanded);
}, [listActions, listState.filtersExpanded]);
```

Użycie `!listState.filtersExpanded` w callback z `listState.filtersExpanded` jako dependency jest poprawne technicznie, ale callback jest odtwarzany przy każdej zmianie filtra. Lepszy wzorzec to użycie functional update, jeśli `setFiltersExpanded` to wspiera, albo:
```javascript
const toggleFilters = useCallback(() => {
    listActions.setFiltersExpanded(prev => !prev);
}, [listActions]);
```

---

### 5. `selectedBankInfo` — niespójna obsługa null dla `companyInfo`

**Plik:** `src/components/invoices/InvoiceDetails.js` linia 351–361

```javascript
const selectedBankInfo = useMemo(() => {
    if (!invoice) return { bankName: null, accountNumber: null, swift: null };
    const selectedBank = invoice.selectedBankAccount && companyInfo?.bankAccounts  // ← optional chaining
      ? companyInfo.bankAccounts.find(...)
      : null;
    return {
      bankName: selectedBank?.bankName || companyInfo.bankName,       // ← BEZ optional chaining
      accountNumber: selectedBank?.accountNumber || companyInfo.bankAccount,  // ← BEZ
      swift: selectedBank?.swift || companyInfo.swift                 // ← BEZ
    };
}, [invoice, companyInfo]);
```

Jeśli `companyInfo` byłby `null`/`undefined` (np. błąd ładowania), linie 357–359 rzuciłyby `TypeError`. Choć `companyInfo` jest domyślnie ustawiony na `COMPANY_INFO`, warto dodać defensive check.

**Rekomendacja:** Użyj `companyInfo?.bankName` etc. dla spójności.

---

### 6. `useAsyncAction` — hook nieużywany nigdzie w commitcie

**Plik:** `src/hooks/useAsyncAction.js`

Hook został dodany, ale **żaden komponent w tym commitcie go nie używa**. Ponadto:
- Hook re-throw'uje błędy po `showError`, co może powodować niezłapane wyjątki w callsitach, jeśli caller nie użyje `try/catch`
- Brak wsparcia dla wielu równoległych akcji (jeden wspólny `loading` state)

**Rekomendacja:** Rozważyć czy `throw error` w catch jest zamierzonym zachowaniem. Jeśli hook ma być "fire and forget", `throw` jest zbędne. Jeśli caller ma reagować, warto to udokumentować.

---

### 7. `fetchReservations` w `ItemDetailsPage` — stale closure na filtrach

**Plik:** `src/pages/Inventory/ItemDetailsPage.js`

```javascript
const fetchReservations = useCallback(async (itemData) => {
    // ...
    filterAndSortReservations(reservationFilter, reservationSortField, reservationSortOrder, groupedReservations);
}, [filterAndSortReservations, reservationFilter, reservationSortField, reservationSortOrder, showError]);
```

`fetchReservations` zależy od `reservationFilter`, `reservationSortField`, `reservationSortOrder`, co powoduje, że funkcja jest **odtwarzana przy każdej zmianie filtrów/sortowania**. To jest problematyczne, bo `fetchReservations` jest wywoływany w `useEffect` i potencjalnie przez `handleDeleteReservation`. Każda zmiana filtra tworzy nową referencję, co może triggerować niepotrzebne re-rendery lub nieoczekiwane efekty.

**Rekomendacja:** Oddzielić pobieranie danych od filtrowania. `fetchReservations` powinien tylko ustawiać surowe dane, a filtrowanie powinno być realizowane przez `useMemo`:
```javascript
const filteredReservations = useMemo(() => 
    filterAndSort(reservations, reservationFilter, reservationSortField, reservationSortOrder),
    [reservations, reservationFilter, reservationSortField, reservationSortOrder]
);
```

---

### 8. `ConsumptionReportTab` — React.memo bez displayName

**Plik:** `src/pages/Production/ProductionReportPage.js` linia 311

`ConsumptionReportTab` owiniętego w `React.memo` nie ma `displayName`. W React DevTools pojawi się jako `Anonymous` / `Memo`, co utrudnia debugowanie.

**Rekomendacja:**
```javascript
ConsumptionReportTab.displayName = 'ConsumptionReportTab';
```

---

## 🟢 OBSERWACJE DOTYCZĄCE OPTYMALIZACJI

### 9. Nadmierna memoizacja — pure utility functions w `useCallback`

Wiele prostych, czystych funkcji zostało opakowanych w `useCallback` bez realnej korzyści:

| Komponent | Funkcja | Problem |
|---|---|---|
| `InvoiceDetails` | `formatDate` | Czysta funkcja bez deps — `useCallback([])` tworzy stały overhead bez korzyści |
| `InvoiceDetails` | `renderInvoiceStatus` | j.w. — obiekt `statusConfig` jest tworzony przy każdym wywołaniu mimo `useCallback` |
| `InvoicesList` | `formatDate`, `handleSearch` | `handleSearch` jest pustą funkcją — `useCallback` jest zbyteczny |
| `CmrListPage` | `formatDate`, `renderStatusChip` | Brak deps — wyniesienie poza komponent byłoby lepsze |
| `UsersManagementPage` | `getInitials`, `getUserAiLimit`, `getUserAiUsed` | Czyste funkcje — lepiej wynieść poza komponent |
| `FormsResponsesPage` | `formatDateTime`, `formatCSVValue`, `extractStoragePathFromUrl` | j.w. |
| `ProductionReportPage` | `formatCurrency`, `formatQuantity` | j.w. |

**Rekomendacja:** Czyste funkcje utility bez zależności od state/props powinny być zdefiniowane **poza komponentem** zamiast w `useCallback`. To eliminuje overhead hooka i jest bardziej czytelne.

---

### 10. `paginationInfo` useMemo w `CmrListPage` — niepotrzebna memoizacja

```javascript
const paginationInfo = useMemo(() => ({
    start: cmrDocuments.length > 0 ? (page - 1) * pageSize + 1 : 0,
    end: Math.min(page * pageSize, totalItems),
    total: totalItems
}), [cmrDocuments.length, page, pageSize, totalItems]);
```

Tworzenie obiektu z 3 prostymi obliczeniami matematycznymi jest tańsze niż overhead `useMemo`. `useMemo` ma sens dla kosztownych obliczeń lub stabilizacji referencji obiektów. Tutaj nie jest ani jedno, ani drugie (obiekt i tak jest nowy przy każdym render, a wartości prymitywne nie wymagają stabilizacji).

---

### 11. Usunięcie scrollbar styling z ThemeContext

**Plik:** `src/contexts/ThemeContext.js`

Usunięto 21 linii customowych stylów scrollbara (`::-webkit-scrollbar*`). To oznacza, że scrollbar w aplikacji wróci do domyślnego wyglądu przeglądarki. Jeśli to zamierzone (np. z powodu problemów z overlay scrollbar na macOS), OK. Ale może to być regresja wizualna na Windows/Linux gdzie domyślne scrollbary są szerokie i niedopasowane do dark mode.

**Rekomendacja:** Weryfikacja wizualna na Windows w dark mode.

---

## 📋 NIESPÓJNOŚCI

### 12. Mieszanie `console.*` i `logger.*` w tym samym pliku

W wielu plikach serwisów (cmrService, productionService) `console.error()` jest zachowany dla catch bloków, podczas gdy `console.log`/`console.warn` zamieniono na `logger`. To jest **niekonsekwentne** — albo cała obsługa logowania idzie przez logger, albo nie.

Pliki z miksem:
- `src/services/logistics/cmrService.js` — `console.error` (14 wystąpień) + `logger.*` (~60 wystąpień)
- `src/services/production/productionService.js` — j.w.
- `src/pages/Inventory/Cmr/CmrDetailsPage.js` — j.w.

**Rekomendacja:** Przenieść `console.error` na `logger.error` dla spójności. `logger.error` i tak wywołuje `console.error`, więc zachowanie jest identyczne, ale migracja będzie kompletna.

---

### 13. `handleSubmit` w `CmrForm` — usunięto auto-generowanie DN, ale w `CmrCreatePage` nie dodano

Usunięto generowanie Delivery Notes z `CmrForm.handleSubmit` i `NewCmrForm.handleSubmit`. Generowanie zostało przeniesione do `CmrDetailsPage` (przy zmianie statusu na IN_TRANSIT i przy ręcznym kliknięciu). Ale:
- Przy **tworzeniu** CMR (CmrCreatePage) nie ma już żadnego generowania DN
- Przy **edycji** CMR (CmrEditPage) też nie

To oznacza, że pole `attachedDocuments` nie będzie automatycznie uzupełniane tekstem DN przy tworzeniu/edycji. Jest to prawdopodobnie zamierzona zmiana (DN generowane tylko przy "W transporcie"), ale warto potwierdzić, że flow biznesowy tego oczekuje.

---

### 14. `storage.rules` — CMR delivery notes dostępne dla portal users

```
match /cmr-delivery-notes/{cmrId}/{fileName} {
    allow read: if request.auth != null || isPortalUser();
    allow list: if request.auth != null || isPortalUser();
    allow write: if request.auth != null;
}
```

`isPortalUser()` pozwala na odczyt wszystkich plików DN niezależnie od `cmrId`. Jeśli portal obsługuje wielu klientów, jeden klient mógłby odczytać DN innego klienta znając URL. Rozważ dodanie walidacji per-klient.

---

## ✅ POZYTYWNE ASPEKTY

- **`FormPageLayout`** — czysty, reużywalny komponent z loading state
- **`TableSkeleton`** — dobrze zaimplementowany z `React.memo` i `displayName`
- **`buildAttachedDocumentsWithDN`** — eliminacja duplikacji logiki regex w 4 miejscach
- **`generateAllDeliveryNoteData`** — konsolidacja 3 wywołań (`pdf`, `text`, `metadata`) + deduplicja `resolveItemsEcoStatus`
- **`setInvoices(prev => prev.filter(...))`** — poprawka z wartości zamkniętej na functional update w `InvoicesList.handleDeleteConfirm`
- **Migracja z `toast` na `useNotification`** — unifikacja systemu powiadomień
- **`paginatedInvoices` useMemo** — dobra optymalizacja, unika powtarzania `.slice()` przy każdym renderze
- **`uniqueResponsiblePersons` / `uniqueProducts` useMemo** — dobre przeniesienie z wewnątrz `ProductionShiftTable` komponentu do poziomu rodzica z `useMemo`
- **Lżejsze hover effects w Sidebar** — `transition: 'background-color 0.15s ease'` zamiast `all 0.3s` z `transform` + `boxShadow` to realna poprawa wydajności CSS

---

## PRIORYTET NAPRAW

| Priorytet | Issue | Wpływ |
|---|---|---|
| 🔴 Wysoki | #2 Logger bez isDev | Logi debugowe widoczne dla użytkowników produkcyjnych |
| 🔴 Wysoki | #3 Brak await w CmrForm handleSubmit | Niezłapane błędy, brak komunikatu dla użytkownika |
| 🟡 Średni | #1 Brak fetchInvoice w deps | Potencjalny stale data po odświeżeniu statusu |
| 🟡 Średni | #7 fetchReservations stale closure | Niepotrzebne re-fetche, niespójne filtrowanie |
| 🟢 Niski | #9 Nadmierna memoizacja | Minimalny overhead, ale code smell |
| 🟢 Niski | #12 Niekonsekwentny logger/console | Brak realnego wpływu, kwestia stylu |
