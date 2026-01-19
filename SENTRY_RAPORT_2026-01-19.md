# 📊 Raport Błędów i Wydajności - Sentry.io

**Data raportu:** 19 stycznia 2026  
**Okres analizy:** 14 dni (05.01.2026 - 19.01.2026)  
**Projekt:** bgw-mrp-system  
**Organizacja:** BGW Pharma

---

## 📈 Podsumowanie Wykonawcze

| Metryka | Wartość |
|---------|---------|
| **Nierozwiązane błędy** | 43 |
| **Błędy krytyczne (High Priority)** | ~30 |
| **Najwolniejsze transakcje (>3s)** | 100+ |
| **Transakcje z timeout (30s)** | 9 |
| **Średni czas dla /production** | 8-13s |
| **Średni czas dla /purchase-orders** | 9-15s |

---

## 🚨 BŁĘDY KRYTYCZNE (Wymagające Natychmiastowej Naprawy)

### 1️⃣ **ReferenceError: Cannot access '__WEBPACK_DEFAULT_EXPORT__' before initialization**
| ID | BGW-MRP-SYSTEM-** |
|---|---|
| **Lokalizacje** | `/analytics`, `/sales/co-reports`, `/production` |
| **Wystąpienia** | Wielokrotne (dzisiaj!) |
| **Ostatnie** | 2026-01-19 11:59:13 |
| **Priorytet** | 🔴 KRYTYCZNY |

**Opis problemu:** Błąd cyklicznych importów modułów. Moduł jest eksportowany przed pełną inicjalizacją.

**Rozwiązanie:** 
- Sprawdzić cykliczne zależności w modułach `analytics`, `sales/co-reports`
- Przenieść wspólne zależności do oddzielnych plików
- Użyć dynamicznych importów `React.lazy()` dla komponentów z cyklicznymi zależnościami

---

### 2️⃣ **FirebaseError: failed-precondition**
| ID | BGW-MRP-SYSTEM-5, inne |
|---|---|
| **Lokalizacje** | `/production/tasks/*/edit`, `/ai-assistant` |
| **Funkcje** | `getActiveRecipesMinimal`, `aggregate_data` |
| **Wystąpienia** | 3+ |
| **Priorytet** | 🔴 KRYTYCZNY |

**Opis problemu:** Zapytania Firestore używające `where()` + `orderBy()` wymagają composite index.

**Rozwiązanie:**
```bash
# Utworzyć indeksy w Firebase Console lub przez CLI:
firebase firestore:indexes
```

Wymagane indeksy:
- `recipes`: `isActive` (ASC) + `name` (ASC)
- Inne kolekcje używane w AI Assistant

---

### 3️⃣ **FirebaseError: unavailable / offline**
| ID | BGW-MRP-SYSTEM-H, I |
|---|---|
| **Lokalizacje** | `/orders/*`, `/production/tasks/*` |
| **Wystąpienia** | 4+ |
| **Priorytet** | 🟡 ŚREDNI |

**Opis problemu:** Klient Firestore traci połączenie z backendem.

**Rozwiązanie:**
- Dodać offline persistence: `enableIndexedDbPersistence()`
- Implementować retry logic w `withFirebaseErrorHandling`
- Pokazywać użytkownikowi komunikat o problemach z siecią

---

### 4️⃣ **ValidationError: warehouseId undefined**
| ID | BGW-MRP-SYSTEM-34, 35 |
|---|---|
| **Lokalizacje** | `/inventory/cmr/*` |
| **Partia** | SN00038, SN00124 |
| **Priorytet** | 🟡 ŚREDNI (już naprawione częściowo) |

**Opis problemu:** Przy wydawaniu z partii CMR, `warehouseId` jest `undefined`.

**Status:** Częściowo naprawione w poprzednim release (fallback do bazy danych).

**Dodatkowe działanie:** Naprawić mechanizm linkowania partii do CMR, aby zawsze zapisywał `warehouseId`.

---

### 5️⃣ **Element type is invalid (undefined component)**
| ID | BGW-MRP-SYSTEM-C, D, F |
|---|---|
| **Lokalizacje** | `/production`, `/sales/co-reports` |
| **Komponenty** | `WeeklyProductivityTab`, lazy imports |
| **Wystąpienia** | 5+ |
| **Priorytet** | 🟡 ŚREDNI |

**Opis problemu:** Komponenty są importowane jako `undefined` - brakujące eksporty lub złe ścieżki.

**Rozwiązanie:**
- Sprawdzić eksporty w `WeeklyProductivityTab`
- Zweryfikować lazy loading w routerze
- Upewnić się że wszystkie komponenty mają `export default` lub prawidłowy named export

---

### 6️⃣ **ReferenceError: Variable not defined**
| ID | Różne |
|---|---|
| **Zmienne** | `ChangeHistoryTab`, `processedTasksCount`, `trendChartData`, `TimelineIcon`, `useEffect` |
| **Lokalizacje** | `/production/tasks/*`, `/sales/co-reports` |
| **Priorytet** | 🟡 ŚREDNI |

**Opis problemu:** Zmienne/komponenty używane przed deklaracją lub niezaimportowane.

**Rozwiązanie:**
- `ChangeHistoryTab` - zaimportować lub usunąć użycie
- `processedTasksCount` - zadeklarować przed użyciem w useMemo
- `trendChartData` - naprawić kolejność deklaracji
- `TimelineIcon` - dodać import z `@mui/icons-material`
- `useEffect` - dodać `import { useEffect } from 'react'`

---

### 7️⃣ **TypeError: date_fns function is not a function**
| ID | BGW-MRP-SYSTEM-** |
|---|---|
| **Lokalizacja** | `/production` |
| **Priorytet** | 🟡 ŚREDNI |

**Opis problemu:** Nieprawidłowy import z `date-fns`.

**Rozwiązanie:**
```javascript
// ❌ Źle
import format from 'date-fns';

// ✅ Dobrze
import { format } from 'date-fns';
```

---

### 8️⃣ **SyntaxError: Unexpected token '<'**
| ID | BGW-MRP-SYSTEM-** |
|---|---|
| **Lokalizacja** | `/recipes` |
| **Priorytet** | 🟡 ŚREDNI |

**Opis problemu:** Serwer zwraca HTML zamiast JavaScript (np. 404/500 page).

**Możliwe przyczyny:**
- Chunk dynamiczny nie istnieje po deploy
- Service worker cache z poprzedniej wersji
- Błąd w routingu serwera

**Rozwiązanie:**
- Wyczyścić service worker cache
- Sprawdzić czy wszystkie chunks są uploadowane
- Dodać retry logic przy ładowaniu chunks

---

### 9️⃣ **Błąd synchronizacji magazynowej**
| ID | BGW-MRP-SYSTEM-** |
|---|---|
| **Komunikat** | "DUŻA ROZBIEŻNOŚĆ (20.31 kg) dla pozycji RAWGW-SWEET" |
| **Lokalizacja** | `/production/tasks/*` |
| **Priorytet** | 🟠 UWAGA BIZNESOWA |

**Opis problemu:** System wykrył znaczącą rozbieżność między ilością w magazynie a oczekiwaną.

**Działanie:** Wymaga manualnej analizy - to alert biznesowy, nie błąd techniczny.

---

## 🐢 PROBLEMY WYDAJNOŚCIOWE

### Najwolniejsze Strony (Średni Czas Ładowania)

| Strona | Najwolniejszy Czas | Średni Czas | Status |
|--------|-------------------|-------------|--------|
| **/** (Home) | 30,000 ms (timeout) | 14-22s | 🔴 KRYTYCZNY |
| **/purchase-orders** | 30,000 ms (timeout) | 9-15s | 🔴 KRYTYCZNY |
| **/production** | 13,617 ms | 8-13s | 🔴 KRYTYCZNY |
| **/production/timeline** | 10,981 ms | 9-11s | 🟡 ŚREDNI |
| **/production/tasks/:id** | 9,872 ms | 6-10s | 🟡 ŚREDNI |
| **/production/tasks/*/new** | 20,512 ms | 15-20s | 🔴 KRYTYCZNY |
| **/purchase-orders/new** | 9,879 ms | 8-10s | 🟡 ŚREDNI |
| **/purchase-orders/:id** | 13,707 ms | 10-14s | 🔴 KRYTYCZNY |
| **/inventory/:id** | 3,403 ms | 2-4s | 🟢 OK |
| **/inventory** | 2,710 ms | 2-3s | 🟢 OK |
| **/ai-assistant** | 3,698 ms | 2-4s | 🟢 OK |
| **/analytics** | 1,137 ms | 1-2s | 🟢 OK |

### Transakcje z Timeout (30s)

9 transakcji osiągnęło timeout 30s w ostatnich 14 dniach:
- **/** - 7 timeoutów
- **/purchase-orders** - 1 timeout
- **/production/tasks/:id** - 1 timeout

**Przyczyna prawdopodobna:** Utrata połączenia z Firestore lub bardzo wolne zapytania.

---

## 🔧 REKOMENDACJE OPTYMALIZACJI

### 1. Strona Główna (/) - KRYTYCZNE
**Problem:** Timeout 30s, średnio 14-22s

**Działania:**
- [ ] Lazy loading dla wszystkich sekcji dashboard
- [ ] Zmniejszyć ilość danych pobieranych na start (paginacja)
- [ ] Cache danych w IndexedDB
- [ ] Skeleton loaders zamiast spinnerów

### 2. Lista Zamówień Zakupu (/purchase-orders) - KRYTYCZNE
**Problem:** Timeout 30s, średnio 9-15s

**Działania:**
- [ ] Implementować paginację po stronie serwera
- [ ] Zmniejszyć pageSize (obecnie prawdopodobnie pobiera wszystkie)
- [ ] Dodać virtualizację listy (react-window)
- [ ] Optymalizować zapytania Firestore (indeksy composite)

### 3. Lista Produkcji (/production) - KRYTYCZNE  
**Problem:** Średnio 8-13s

**Działania:**
- [ ] Paginacja po stronie serwera
- [ ] Virtualizacja listy zadań
- [ ] Zmniejszyć ilość pól pobieranych w liście (select tylko potrzebne)
- [ ] Cache statusów użytkowników

### 4. Timeline Produkcji (/production/timeline) - ŚREDNIE
**Problem:** Średnio 9-11s

**Działania:**
- [ ] Lazy loading danych po zakresie dat
- [ ] Agregacja po stronie serwera (Cloud Functions)
- [ ] Cache danych kalendarza

### 5. Nowe Zadanie Produkcyjne (/production/tasks/*/new) - KRYTYCZNE
**Problem:** Średnio 15-20s

**Działania:**
- [ ] Preload receptur w tle
- [ ] Lazy loading materiałów
- [ ] Optimistic UI updates

---

## 📊 Statystyki Błędów wg Lokalizacji

| Lokalizacja | Liczba Unikalnych Błędów | Priorytet |
|-------------|-------------------------|-----------|
| `/production` | 12 | 🔴 |
| `/production/tasks/*` | 8 | 🔴 |
| `/inventory/cmr/*` | 6 | 🟡 |
| `/sales/co-reports` | 4 | 🟡 |
| `/purchase-orders` | 3 | 🟡 |
| `/analytics` | 2 | 🟡 |
| `/orders/*` | 2 | 🟢 |
| `/ai-assistant` | 2 | 🟢 |
| `/recipes` | 1 | 🟢 |
| `/admin/system` | 2 (testowe) | ✅ |

---

## 📅 Plan Naprawczy (Priorytetyzowany)

### Tydzień 1 - Błędy Krytyczne
1. ✅ Naprawić cykliczne importy w `/analytics` i `/sales/co-reports`
2. ✅ Utworzyć brakujące indeksy Firestore dla `recipes` i AI Assistant
3. ✅ Naprawić brakujące importy (`ChangeHistoryTab`, `TimelineIcon`, `useEffect`)
4. ✅ Naprawić eksporty komponentów (`WeeklyProductivityTab`)

### Tydzień 2 - Wydajność Krytyczna
1. ⏳ Paginacja strony głównej
2. ⏳ Paginacja `/purchase-orders`
3. ⏳ Paginacja `/production`
4. ⏳ Virtualizacja list (react-window)

### Tydzień 3 - Błędy Średnie
1. ⏳ Offline handling dla Firestore
2. ⏳ Retry logic dla failed chunks
3. ⏳ Naprawić linkowanie partii CMR (warehouseId)

### Tydzień 4 - Wydajność Średnia
1. ⏳ Lazy loading dla Timeline
2. ⏳ Preload receptur w formularzu nowego zadania
3. ⏳ Cache w IndexedDB dla często używanych danych

---

## 🔗 Linki do Sentry

- **Dashboard:** https://bgwpharma.sentry.io/issues/
- **Performance:** https://bgwpharma.sentry.io/performance/
- **Releases:** https://bgwpharma.sentry.io/releases/

---

## 📝 Uwagi

1. **Błędy testowe** (`Test message from SystemManagementPage`, `This is your first error!`) - można zignorować, to testy z Admin Panel.

2. **Encoding problemów** - Niektóre komunikaty błędów wyświetlają się z błędnym kodowaniem (np. "BA?ąd" zamiast "Błąd") - to problem z raportowaniem do Sentry, nie wpływa na funkcjonalność.

3. **Błędy sieciowe** (`auth/network-request-failed`, `client is offline`) - Głównie spowodowane problemami z siecią użytkownika, nie aplikacji. Warto dodać lepszy handling offline.

---

---

## 🔍 Szczegółowa Analiza Błędów Cyklicznych Importów

### Problem: `ReferenceError: Cannot access '__WEBPACK_DEFAULT_EXPORT__' before initialization`

**Analiza kodu źródłowego wykazała:**

Błąd występuje w:
- `/analytics` - strony analityczne
- `/sales/co-reports` - raporty sprzedażowe

**Potencjalne źródło:**
1. `CashflowPage.js` importuje `CashflowTab` z `../Sales/COReports/CashflowTab`
2. `COReportsPage.js` również importuje `CashflowTab` z `./CashflowTab`
3. Komponenty wewnątrz `COReports/` mogą mieć cykliczne zależności z serwisami

**Rekomendowana ścieżka naprawy:**
1. Sprawdzić czy `CashflowTab` nie importuje czegoś z `COReportsPage`
2. Wydzielić współdzielone komponenty do osobnego folderu `components/sales/co-reports/`
3. Unikać importów między stronami - używać tylko shared components

---

## 📋 Lista Plików Do Sprawdzenia

| Plik | Problem | Priorytet |
|------|---------|-----------|
| `src/pages/Sales/COReports/CashflowTab.js` | Import cykliczny? | 🔴 |
| `src/pages/Analytics/CashflowPage.js` | Import z COReports | 🔴 |
| `src/pages/Sales/COReports/COReportsPage.js` | Import CashflowTab | 🔴 |
| `src/pages/Production/TaskDetailsPage.js` | Lazy imports, 8500+ linii | 🟡 |
| `src/components/production/WeeklyProductivityTab.js` | 2230 linii | 🟡 |

---

**Wygenerowano automatycznie przez AI Assistant**  
**Data:** 2026-01-19 13:40  
**Źródło:** Sentry API (bgwpharma/bgw-mrp-system)
