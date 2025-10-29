# Łańcuch Aktualizacji Kosztów: PO → Rezerwacje PO → Zadania Produkcyjne

## Przegląd

System automatycznie aktualizuje koszty w całym łańcuchu zależności gdy zmienia się cena w zamówieniu zakupowym (PO).

## Łańcuch Aktualizacji

```
Purchase Order (PO)
    ├─> Partie Magazynowe (Inventory Batches)
    │       └─> Zadania Produkcyjne (MO) - koszty zarezerwowanych partii
    │
    └─> Rezerwacje PO (PO Reservations)
            └─> Zadania Produkcyjne (MO) - koszty rezerwacji PO
```

## Implementacja

### 1. Aktualizacja Ceny w PO → Partie Magazynowe → MO
**Plik:** `src/services/purchaseOrderService.js`

W funkcji `updatePurchaseOrder` (linia 1068):
- Wywołuje `updateBatchPricesOnAnySave` (linia 1143)
- Aktualizuje `unitPrice` we wszystkich partiach magazynowych powiązanych z PO
- Wywołuje `updateTaskCostsForUpdatedBatches` (linia 2796)
- Aktualizuje koszty w zadaniach produkcyjnych używających tych partii

### 2. Aktualizacja Ceny w PO → Rezerwacje PO → MO (NOWE)
**Plik:** `src/services/poReservationService.js`

Nowa funkcja `updatePOReservationsPricesOnPOChange` (linia 946):

```javascript
export const updatePOReservationsPricesOnPOChange = async (purchaseOrderId, poData, userId)
```

**Działanie:**
1. Pobiera wszystkie rezerwacje PO dla danego zamówienia (statusy: `pending`, `delivered`)
2. Dla każdej rezerwacji:
   - Znajduje odpowiednią pozycję w PO
   - Sprawdza czy cena się zmieniła (tolerancja: 0.0001€)
   - Aktualizuje `unitPrice` w rezerwacji PO
   - Zapisuje historię zmiany ceny (`priceUpdatedFrom`, `priceUpdatedAt`)
3. Zbiera wszystkie zadania produkcyjne powiązane z zaktualizowanymi rezerwacjami
4. Wywołuje `updateTaskCostsAutomatically` dla każdego zadania

**Wywołanie:** 
`src/services/purchaseOrderService.js` linia 1150-1159

### 3. Obliczanie Kosztów z Rezerwacji PO
**Pliki:** 
- `src/services/productionService.js` (linia 5438-5486)
- `src/pages/Production/TaskDetailsPage.js` (linia 5069-5146)

Funkcje `updateTaskCostsAutomatically` i `calculateAllCosts` uwzględniają:

```javascript
// Sekcja 2A. KOSZTY REZERWACJI Z ZAMÓWIEŃ ZAKUPOWYCH (PO)
if (task.poReservationIds && task.poReservationIds.length > 0) {
  const poReservations = await getPOReservationsForTask(taskId);
  const activePoReservations = poReservations.filter(r => 
    r.status === 'pending' || r.status === 'delivered'
  );
  
  for (const poRes of activePoReservations) {
    const effectiveQuantity = reservedQuantity - convertedQuantity;
    const poCost = effectiveQuantity × unitPrice;
    totalMaterialCost += poCost;
  }
}
```

**Kluczowe aspekty:**
- ✅ Uwzględnia tylko rezerwacje `pending` i `delivered`
- ✅ Wyklucza `converted` (już przekonwertowane na standardowe rezerwacje)
- ✅ Oblicza efektywną ilość: `reservedQuantity - convertedQuantity`
- ✅ Używa aktualnej ceny `unitPrice` z rezerwacji PO
- ✅ Respektuje flagę `materialInCosts` dla każdego materiału

## Przepływ Danych

### Scenariusz 1: Zmiana Ceny w PO
```
1. Użytkownik zmienia cenę pozycji w PO (np. z 10€ na 12€)
   ↓
2. updatePurchaseOrder() zapisuje PO
   ↓
3. updateBatchPricesOnAnySave() aktualizuje partie magazynowe
   ├─> Partia A: unitPrice = 12€
   └─> Partia B: unitPrice = 12€
   ↓
4. updatePOReservationsPricesOnPOChange() aktualizuje rezerwacje PO
   ├─> Rezerwacja PO #1: unitPrice = 12€ (było 10€)
   └─> Rezerwacja PO #2: unitPrice = 12€ (było 10€)
   ↓
5. updateTaskCostsForUpdatedBatches() aktualizuje koszty w MO
   ├─> MO-001: totalMaterialCost przeliczany (partie + rezerwacje PO)
   └─> MO-002: totalMaterialCost przeliczany (partie + rezerwacje PO)
```

### Scenariusz 2: Obliczanie Kosztów w MO
```
Zadanie Produkcyjne (MO-001):
  Materiał: Siarczan Magnezu
  Ilość potrzebna: 100 kg
  
  Rezerwacje:
  ├─> Partia #A: 50 kg @ 10€/kg = 500€
  ├─> Rezerwacja PO #123: 30 kg @ 12€/kg = 360€
  └─> Partia #B: 20 kg @ 11€/kg = 220€
  
  Koszt materiału = 500€ + 360€ + 220€ = 1080€
```

## Pola w Rezerwacji PO

```javascript
{
  unitPrice: 12.00,           // Aktualna cena (aktualizowana przy zmianie PO)
  priceUpdatedFrom: 10.00,    // Poprzednia cena (historia)
  priceUpdatedAt: Timestamp,  // Kiedy zaktualizowano cenę
  updatedBy: "user123",       // Kto zaktualizował
  currency: "EUR",            // Waluta
  status: "pending",          // pending | delivered | converted
  reservedQuantity: 30,       // Zarezerwowana ilość
  convertedQuantity: 0        // Ilość przekonwertowana na standardowe rezerwacje
}
```

## Unikanie Podwójnego Liczenia

### Problem
Rezerwacja PO może zostać przekonwertowana na standardową rezerwację magazynową. Bez odpowiedniej logiki koszt byłby liczony dwukrotnie.

### Rozwiązanie
```javascript
// Filtruj tylko aktywne rezerwacje
const activePoReservations = poReservations.filter(r => 
  r.status === 'pending' || r.status === 'delivered'
);

// Odejmij już przekonwertowaną ilość
const effectiveQuantity = Math.max(0, 
  preciseSubtract(reservedQuantity, convertedQuantity)
);
```

**Statusy rezerwacji:**
- `pending` - czeka na dostawę → **LICZY SIĘ** w kosztach
- `delivered` - dostarczona, nie przekonwertowana → **LICZY SIĘ** w kosztach
- `converted` - przekonwertowana na standardową rezerwację → **NIE LICZY SIĘ** (jest już w `materialBatches`)

## Logowanie i Debugowanie

Wszystkie operacje są szczegółowo logowane z prefiksami:

- `[PO_UPDATE_DEBUG]` - aktualizacja zamówienia zakupowego
- `[PO_RES_PRICE_UPDATE]` - aktualizacja cen w rezerwacjach PO
- `[AUTO]` - automatyczna aktualizacja kosztów (backend)
- `[UI-COSTS]` - obliczanie kosztów (frontend)
- `[BATCH_AUTO_UPDATE]` - aktualizacja partii
- `[BATCH_COST_UPDATE]` - aktualizacja kosztów po zmianie partii

### Przykład logów:

```
🔄 [PO_UPDATE_DEBUG] Rozpoczynam aktualizację cen w rezerwacjach PO
📋 [PO_RES_PRICE_UPDATE] Znaleziono 3 rezerwacji do aktualizacji
✅ [PO_RES_PRICE_UPDATE] Zaktualizowano cenę rezerwacji xyz: 10.00€ → 12.00€
📊 [PO_RES_PRICE_UPDATE] Zaktualizowano 3 rezerwacji, 0 błędów
🔄 [PO_RES_PRICE_UPDATE] Aktualizacja kosztów w 2 zadaniach...
✅ [PO_RES_PRICE_UPDATE] Zaktualizowano koszty: 2 zadań pomyślnie, 0 błędów
```

## Testy

### Test 1: Zmiana Ceny w PO
```
1. Utwórz PO z pozycją: Materiał A, cena 10€
2. Utwórz MO i zarezerwuj z PO: 50 kg
3. Sprawdź koszt w MO: 50 kg × 10€ = 500€
4. Zmień cenę w PO na 12€
5. Sprawdź koszt w MO: 50 kg × 12€ = 600€ ✅
```

### Test 2: Konwersja Rezerwacji
```
1. Utwórz PO z pozycją: Materiał A, cena 10€, ilość 100 kg
2. Utwórz MO i zarezerwuj z PO: 50 kg
3. Dostawa PO → utworzono partię magazynową
4. Przekonwertuj 30 kg z rezerwacji PO na standardową rezerwację
5. Sprawdź koszt w MO:
   - Partia: 30 kg × 10€ = 300€
   - Rezerwacja PO: 20 kg × 10€ = 200€ (50 - 30)
   - Razem: 500€ ✅ (bez duplikacji)
```

## Kompatybilność Wsteczna

Implementacja jest w pełni kompatybilna wstecz:
- Stare MO bez rezerwacji PO działają jak dotychczas
- Stare rezerwacje PO bez pola `priceUpdatedFrom` działają poprawnie
- Funkcja aktualizacji cen nie przerywa zapisywania PO w przypadku błędu

## Data Implementacji

- **Rezerwacje PO w kosztach:** 29 października 2024
- **Aktualizacja cen rezerwacji PO:** 29 października 2024

## Powiązane Pliki

- `src/services/poReservationService.js` - zarządzanie rezerwacjami PO
- `src/services/purchaseOrderService.js` - zarządzanie zamówieniami zakupowymi
- `src/services/productionService.js` - zarządzanie zadaniami produkcyjnymi
- `src/pages/Production/TaskDetailsPage.js` - UI szczegółów zadania
- `src/components/production/POReservationManager.js` - UI zarządzania rezerwacjami PO

