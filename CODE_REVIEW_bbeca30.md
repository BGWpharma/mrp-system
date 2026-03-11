# Przegląd kodu — commit `bbeca304`

> **Enhance invoice processing and duplicate detection logic**
> Data analizy: 2026-03-11

---

## 1. KRYTYCZNE — Błędy mogące powodować utratę danych lub niespójności

### 1.1 Race condition przy cross-PO duplicate detection (`invoiceOcr.js`)

**Plik:** `functions/triggers/invoiceOcr.js` (linie 118–144)

Gdy dwa pliki fakturowe dla tego samego numeru faktury zostaną wgrane niemal jednocześnie do dwóch różnych PO, obie instancje triggera mogą przejść `checkCrossPoDuplicate` zanim którakolwiek utworzy dokument `purchaseInvoice`. Efekt: powstają dwie niezależne faktury zamiast jednej z cross-PO linkiem.

**Proponowane rozwiązanie:** Użyć Firestore transaction albo distributed lock (np. osobny dokument „lock" z TTL) w `createPurchaseInvoice`, aby operacja check + create była atomowa.

---

### 1.2 `linkedAt: new Date()` zamiast server timestamp (`invoiceOcr.js`)

**Plik:** `functions/triggers/invoiceOcr.js` (linie 499, 753, 1316)

`arrayUnion` z obiektem zawierającym `new Date()` generuje unikalny timestamp przy każdym wywołaniu. Oznacza to, że:
- Retry tej samej operacji **nie** zdeduplikuje wpisu (inne milisekundy = inny obiekt),
- Czas klienta cloud function może nie być zsynchronizowany z Firestore.

**Proponowane rozwiązanie:** Zamienić `linkedAt: new Date()` na stały format (np. ISO string z dokładnością do sekundy) lub wydzielić `linkedAt` poza `arrayUnion` i ustawiać oddzielnie.

---

### 1.3 Brak atomowości przy cross-PO linkowaniu (`invoiceOcr.js`)

**Plik:** `functions/triggers/invoiceOcr.js` (linie 493–511)

Dwie operacje `update` (na `purchaseInvoices` i `purchaseOrders`) nie są w transakcji. Jeśli druga się nie powiedzie, dane będą niespójne — faktura ma dodatkowe źródło, ale PO nie ma referencji do faktury.

**Proponowane rozwiązanie:** Użyć `db.runTransaction()` lub `WriteBatch` dla obu operacji.

---

### 1.4 Błąd w error handler `retryInvoiceOcr` po merge (`invoiceOcr.js`)

**Plik:** `functions/triggers/invoiceOcr.js` (linia 1683)

W bloku `catch`, handler próbuje `db.collection("purchaseInvoices").doc(invoiceId).update(...)`, ale jeśli faktura została już usunięta w ścieżce cross-PO merge (linia 1369), ten update rzuci wyjątek maskujący oryginalny błąd.

**Proponowane rozwiązanie:** Dodać guard `try/catch` wewnątrz error handlera lub sprawdzać czy dokument istnieje.

---

## 2. WAŻNE — Błędy logiczne i niespójności

### 2.1 `isProforma` — pomijanie starych dokumentów bez tego pola (`duplicateDetection.js`)

**Plik:** `functions/utils/duplicateDetection.js` (linie 64–66, 96–98, 134–136, 165–167)

```javascript
if (isProforma !== undefined && docData.isProforma !== undefined) {
  if (isProforma !== docData.isProforma) continue;
}
```

Gdy `docData.isProforma === undefined` (stare dokumenty sprzed migracji), warunek jest pomijany i porównanie nie następuje. Duplikat proformy z fakturą VAT (lub odwrotnie) w starych danych **nie zostanie wykryty**, ale jednocześnie stare dokumenty bez pola mogą być fałszywie traktowane jako duplikaty.

**Proponowane rozwiązanie:** Traktować brak pola `isProforma` jako `false` (domyślnie nie-proforma):
```javascript
const existingIsProforma = docData.isProforma ?? false;
if (isProforma !== existingIsProforma) continue;
```

---

### 2.2 Wykrywanie duplikatów po nazwie jest case-sensitive (`duplicateDetection.js`)

**Plik:** `functions/utils/duplicateDetection.js` (linie 119–149)

Strategia 2 (fallback po nazwie dostawcy) używa dokładnego `where("supplier.name", "==", supplierName)`. "ABC Sp. z o.o." ≠ "ABC SP. Z O.O." — łatwo ominąć detekcję.

**Proponowane rozwiązanie:** Dodać pole `supplier.nameNormalized` (lowercase, trimmed) przy tworzeniu i szukać po nim.

---

### 2.3 `StatusChip` — biały tekst na jasnych kolorach statusu (`StatusChip.js`)

**Plik:** `src/components/common/StatusChip.js` (linia 76–77)

```javascript
bgcolor: chipColor,
color: '#fff',
```

Dla statusu `pending` (żółty `#f59e0b`) i `partial` (żółty) biały tekst ma niewystarczający kontrast WCAG. Mimo że `statusColors` definiuje `text: 'rgba(0, 0, 0, 0.87)'` dla tych statusów, nigdy nie jest użyty.

**Proponowane rozwiązanie:**
```javascript
const getChipTextColor = (statusLabel) => {
  const key = getStatusKeyFromLabel(statusLabel);
  return statusColors[key]?.text || '#fff';
};
// Następnie: color: getChipTextColor(status)
```

---

### 2.4 `StatusStepper` — `steps.indexOf()` zwraca -1 dla nieznanych statusów (`StatusStepper.js`)

**Plik:** `src/components/common/StatusStepper.js` (linia 49)

```javascript
const currentIndex = steps.indexOf(currentStatus);
```

Jeśli `currentStatus` nie istnieje w tablicy `steps`, `currentIndex = -1`, co prowadzi do `activeStep = -1` w `<Stepper>`. MUI Stepper z `activeStep=-1` nie wyróżni żadnego kroku, ale wizualnie może to być mylące.

**Proponowane rozwiązanie:** Dodać fallback: `const currentIndex = Math.max(0, steps.indexOf(currentStatus));` lub wyświetlić alert/warning w dev mode.

---

### 2.5 `STATUS_KEY_MAP` jest niekompletny (`colorConfig.js`)

**Plik:** `src/styles/colorConfig.js` (linie 155–172)

Brakuje mapowań dla statusów używanych w backendzie i UI:
- `'pending_review'`, `'posted'`, `'rejected'`, `'ocr_failed'`, `'proforma_posted'` (statusy faktur zakupowych)
- `'Nowe'`, `'Zaakceptowane'`, `'Otrzymane'` (statusy PO po polsku)
- `'Częściowo zapłacone'`, `'Zapłacone'` (statusy płatności)

Efekt: `getStatusKeyFromLabel('pending_review')` zwraca `'draft'` (szary) zamiast np. `'pending'` (żółty).

**Proponowane rozwiązanie:** Rozszerzyć `STATUS_KEY_MAP` o brakujące statusy.

---

### 2.6 Dwie różne funkcje `getStatusColor` z różnymi sygnaturami

**Pliki:**
- `src/styles/colorConfig.js` (linia 231) — zwraca **obiekt** `{ main, light, dark, text }`
- `src/utils/formatting/taskFormatters.js` (linia 149) — zwraca **string** (sam kolor)

Konsumenci importujący z `formatting/index.js` dostają wersję string, a z `colorConfig.js` wersję obiektową. To prowadzi do subtelnych błędów gdy ktoś użyje złego importu.

**Proponowane rozwiązanie:** Usunąć jedną wersję i zunifikować API. Lub zmienić nazwy na `getStatusColorPalette()` vs `getStatusMainColor()`.

---

## 3. OSTRZEŻENIA — Problemy z optymalizacją i jakością kodu

### 3.1 `FormSectionNav` — nieużywany prop `containerRef`

**Plik:** `src/components/common/FormSectionNav.js` (linia 5)

Prop `containerRef` jest destrukturyzowany, ale nigdy nie jest wykorzystywany w komponencie. Dead code.

---

### 3.2 `FormSectionNav` — nieefektywna memoizacja `handleIntersect`

**Plik:** `src/components/common/FormSectionNav.js` (linia 10)

`useCallback` ma zależność `[sections]`, ale `sections` to tablica prop — nowa referencja przy każdym renderze rodzica. Efektywnie `useCallback` jest bezużyteczny, a `IntersectionObserver` jest tworzony przy każdym renderze.

**Proponowane rozwiązanie:** Użyć `useRef` do przechowywania sections lub memoizować tablicę w komponencie rodzica.

---

### 3.3 `Navbar.js` — `performSearch` captured by stale closure

**Plik:** `src/components/common/Navbar.js` (linie 370–373)

```javascript
const debouncedSearch = useMemo(
  () => debounce(performSearch, 400),
  []
);
```

Pusta tablica zależności oznacza, że `performSearch` jest przechwycony z pierwszego renderowania. Obecna implementacja działa bo `searchCache` to ref, ale jakakolwiek zmiana w `performSearch` zależna od stanu nie będzie odzwierciedlona.

**Proponowane rozwiązanie:** Użyć wzorca `useLatestRef(performSearch)` lub dodać `performSearch` do dependencies z `useCallback`.

---

### 3.4 `Navbar.js` — deprecated `onKeyPress`

**Plik:** `src/components/common/Navbar.js` (linia 536)

`onKeyPress` jest deprecated w React 17+. Powinno być `onKeyDown`.

---

### 3.5 `Sidebar.js` — biały tekst na pół-przezroczystym tle w light mode

**Plik:** `src/components/common/Sidebar.js` (linie 627–629)

```javascript
color: isMenuActive(item.path) 
  ? '#ffffff'
  : 'inherit',
```

W light mode, selected background to `alpha(#2563eb, 0.12)` (jasny niebieski) — biały tekst na tym tle jest praktycznie nieczytelny.

**Proponowane rozwiązanie:** W light mode użyć ciemnego koloru tekstu: `theme.palette.primary.dark`.

---

### 3.6 `console.log` w produkcyjnym kodzie (`Navbar.js`)

**Plik:** `src/components/common/Navbar.js` (linie 157, 316, 323)

Debug logi typu `console.log('Przełączenie sidebara...')` i `console.log('Wykonuję wyszukiwanie...')` pozostały w kodzie.

---

### 3.7 `handleConfirm` w `StatusChip` — dialog nie zamyka się po błędzie

**Plik:** `src/components/common/StatusChip.js` (linie 59–73)

Jeśli `onStatusChange(selectedStatus)` rzuci wyjątek, `handleClose()` nie zostanie wywołany (jest poza `finally`). Dialog pozostanie otwarty z loading state = false.

**Proponowane rozwiązanie:**
```javascript
try {
  await onStatusChange(selectedStatus);
} catch (err) {
  console.error('Status change failed:', err);
} finally {
  setInternalLoading(false);
  handleClose();
}
```

---

## 4. DROBNE — Sugestie poprawy

| # | Plik | Problem | Rozwiązanie |
|---|------|---------|-------------|
| 4.1 | `FormSectionNav.js` | `key={i}` zamiast stabilnego klucza | Użyć `key={section.label}` |
| 4.2 | `FormSectionNav.js` | `top: 64` hardcoded | Użyć theme variable lub CSS calc |
| 4.3 | `StatusStepper.js` | Brak `React.memo()` | Dodać memoizację dla komponentu |
| 4.4 | `BackgroundEffects.js` | Bardzo prosty komponent z useTheme | Rozważyć inline w rodzicu |
| 4.5 | `enhancements.css` | CSS status classes mogą kolidować z MUI styles | Przenieść do MUI theme overrides |
| 4.6 | `global.css:44` | `min-height: calc(100vh - 64px)` hardcoded | Użyć CSS variable |

---

## 5. POZYTYWNE aspekty zmian

- Logika cross-PO jest kompleksowa i pokrywa wiele scenariuszy (link, merge na retry, cleanup przy usunięciu)
- `StatusChip` z dialogiem zmiany statusu — dobry wzorzec reużywalnego komponentu
- `FormSectionNav` z IntersectionObserver — nowoczesne podejście do nawigacji po sekcjach
- Usunięcie 8 plików CSS i konsolidacja w ThemeContext — porządkowanie design system
- Odporność na błędy w OCR (graceful degradation z `try/catch` na non-critical operations)
- Użycie `admin.firestore.FieldValue.serverTimestamp()` w większości miejsc
- `canSafelyDeleteExpenseInvoice` — safety check przed usuwaniem (dobra praktyka)

---

## Priorytetyzacja poprawek

| Priorytet | Elementy |
|-----------|----------|
| **P0 (natychmiast)** | 1.1 Race condition, 1.2 linkedAt, 1.3 atomowość, 1.4 error handler |
| **P1 (w najbliższym sprincie)** | 2.1 isProforma fallback, 2.3 kontrast tekstu, 2.5 STATUS_KEY_MAP |
| **P2 (planowanie)** | 2.2 case-sensitive name, 2.4 indexOf fallback, 2.6 getStatusColor unifikacja |
| **P3 (refactoring)** | 3.x ostrzeżenia, 4.x drobne |
