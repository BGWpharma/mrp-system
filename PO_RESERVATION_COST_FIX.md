# Poprawka: Ujednolicenie Obliczania Kosztów Rezerwacji PO

## Problem

Istniała **niekonsekwencja** w obliczaniu kosztów między **standardowymi rezerwacjami magazynowymi** a **rezerwacjami z zamówień zakupowych (PO)**.

### Objaw problemu:
```
Tabela materiałów pokazywała:
  Koszt = 210.00 € (10 szt × 21€)

Podsumowanie kosztów pokazywało:
  Łączny koszt materiałów = 105.00 € (5 szt × 21€)
  
ROZBIEŻNOŚĆ: 2x różnica!
```

## Analiza przyczyny

### Standardowe rezerwacje magazynowe (POPRAWNE):
```javascript
// 1. Oblicz pozostałą ilość (potrzebna - skonsumowana)
const remainingQuantity = requiredQuantity - consumedQuantity;

// 2. Oblicz średnią ważoną cenę z zarezerwowanych partii
const averagePrice = (suma cen × ilości) / suma ilości;

// 3. Koszt = pozostała ilość × średnia cena
materialCost = remainingQuantity × averagePrice;
```

**Przykład:** Potrzeba 10 szt, zarezerwowano 1 szt @ 5.4762€
- Koszt = **10 szt × 5.4762€ = 54.76€** ✅

### Rezerwacje PO (NIEPOPRAWNE - przed poprawką):
```javascript
// 1. Oblicz zarezerwowaną ilość
const effectiveQuantity = reservedQuantity - convertedQuantity;

// 2. Koszt = zarezerwowana ilość × cena
const poCost = effectiveQuantity × unitPrice;
```

**Przykład:** Potrzeba 10 szt, zarezerwowano z PO 5 szt @ 21€
- Koszt = **5 szt × 21€ = 105€** ❌ (powinno być 10 × 21 = 210€)

### Dlaczego tabela pokazywała prawidłową wartość?

Funkcja `calculateWeightedUnitPrice` (używana w tabeli) obliczała średnią ważoną cenę i mnożyła przez **całą potrzebną ilość**:

```javascript
const unitPrice = calculateWeightedUnitPrice(material, materialId); // 21€
const cost = quantity × unitPrice; // 10 × 21 = 210€
```

## Rozwiązanie

Ujednolicono obliczanie kosztów - **rezerwacje PO są teraz uwzględniane w średniej ważonej cenie** tak samo jak standardowe rezerwacje magazynowe.

### Nowa logika (po poprawce):

```javascript
// 1. Zbierz wszystkie rezerwacje (standardowe + PO) dla materiału
const reservedBatches = task.materialBatches[materialId];
const poReservationsForMaterial = poReservationsByMaterial[materialId];

// 2. Oblicz średnią ważoną cenę z WSZYSTKICH rezerwacji
let weightedPriceSum = 0;
let totalReservedQuantity = 0;

// Dodaj standardowe rezerwacje
reservedBatches.forEach(batch => {
  weightedPriceSum += batch.quantity × batch.unitPrice;
  totalReservedQuantity += batch.quantity;
});

// Dodaj rezerwacje PO
poReservationsForMaterial.forEach(poRes => {
  const availableQuantity = poRes.reservedQuantity - poRes.convertedQuantity;
  weightedPriceSum += availableQuantity × poRes.unitPrice;
  totalReservedQuantity += availableQuantity;
});

// 3. Oblicz średnią ważoną cenę
const averagePrice = weightedPriceSum / totalReservedQuantity;

// 4. Koszt = pozostała ilość × średnia ważona cena
const materialCost = remainingQuantity × averagePrice;
```

### Przykład po poprawce:

**Scenariusz:**
- Materiał: PACKCOR-MULTIVITAMIN
- Potrzeba: 10 szt
- Zarezerwowano z PO: 5 szt @ 21.00€

**Obliczenie:**
```
Średnia ważona cena = (5 × 21) / 5 = 21.00€
Koszt = 10 × 21.00€ = 210.00€
```

**Wynik:**
- Tabela materiałów: **210.00 €** ✅
- Podsumowanie kosztów: **210.00 €** ✅
- **ZGODNOŚĆ!** 🎉

## Zmiany w kodzie

### 1. `src/services/productionService.js` (funkcja `updateTaskCostsAutomatically`)

**Przed (linie 5322-5486):**
- Sekcja 2: Koszty standardowych rezerwacji
- Sekcja 2A: Koszty rezerwacji PO (osobno, nieprawidłowo)

**Po (linie 5322-5493):**
- Sekcja 2 (zunifikowana): Koszty wszystkich rezerwacji
  - Najpierw pobierz i zgrupuj rezerwacje PO według materiału
  - Dla każdego materiału oblicz średnią ważoną cenę z obu typów rezerwacji
  - Koszt = remainingQuantity × średnia ważona cena

### 2. `src/pages/Production/TaskDetailsPage.js` (funkcja `calculateAllCosts`)

**Przed (linie 4934-5146):**
- Sekcja 2: Koszty standardowych rezerwacji
- Sekcja 2A: Koszty rezerwacji PO (osobno, nieprawidłowo)

**Po (linie 4934-5127):**
- Sekcja 2 (zunifikowana): Koszty wszystkich rezerwacji
  - Identyczna logika jak w `productionService.js`
  - Dodatkowe zbieranie szczegółów rezerwacji PO dla UI

## Kluczowe aspekty implementacji

✅ **Ujednolicona logika** - rezerwacje PO traktowane tak samo jak standardowe  
✅ **Średnia ważona cena** - uwzględnia ilości z obu typów rezerwacji  
✅ **Zgodność z tabelą** - podsumowanie kosztów zgadza się z tabelą materiałów  
✅ **Brak duplikacji** - rezerwacje `converted` nadal wykluczane  
✅ **Kompatybilność wsteczna** - działa ze starymi danymi  

## Logika obliczania krok po kroku

### Krok 1: Zgrupuj rezerwacje PO według materiału
```javascript
const poReservationsByMaterial = {};
for (const poRes of activePoReservations) {
  if (!poReservationsByMaterial[poRes.materialId]) {
    poReservationsByMaterial[poRes.materialId] = [];
  }
  poReservationsByMaterial[poRes.materialId].push(poRes);
}
```

### Krok 2: Dla każdego materiału oblicz średnią ważoną
```javascript
materials.forEach(material => {
  const reservedBatches = task.materialBatches[materialId];
  const poReservations = poReservationsByMaterial[materialId] || [];
  
  // Pomiń jeśli brak rezerwacji
  if (!reservedBatches?.length && !poReservations.length) return;
  
  let weightedPriceSum = 0;
  let totalReservedQuantity = 0;
  
  // Standardowe rezerwacje
  reservedBatches?.forEach(batch => {
    weightedPriceSum += batch.quantity × batch.unitPrice;
    totalReservedQuantity += batch.quantity;
  });
  
  // Rezerwacje PO
  poReservations.forEach(poRes => {
    const qty = poRes.reservedQuantity - poRes.convertedQuantity;
    weightedPriceSum += qty × poRes.unitPrice;
    totalReservedQuantity += qty;
  });
  
  // Średnia ważona cena
  const averagePrice = weightedPriceSum / totalReservedQuantity;
  
  // Koszt
  const materialCost = remainingQuantity × averagePrice;
});
```

### Krok 3: Zsumuj koszty
```javascript
if (shouldIncludeInCosts) {
  totalMaterialCost += materialCost;
}
totalFullProductionCost += materialCost;
```

## Scenariusze testowe

### Test 1: Tylko rezerwacja PO
```
Materiał: PACKCOR-MULTIVITAMIN
Potrzeba: 10 szt
Rezerwacje:
  - PO PO000099: 5 szt @ 21.00€

Średnia cena = (5 × 21) / 5 = 21.00€
Koszt = 10 × 21.00€ = 210.00€ ✅
```

### Test 2: Rezerwacja PO + standardowa rezerwacja
```
Materiał: Siarczan Magnezu
Potrzeba: 100 kg
Rezerwacje:
  - Partia A: 50 kg @ 10.00€
  - PO PO-123: 30 kg @ 12.00€
  - Partia B: 20 kg @ 11.00€

Średnia cena = (50×10 + 30×12 + 20×11) / (50+30+20)
             = (500 + 360 + 220) / 100
             = 1080 / 100
             = 10.80€

Koszt = 100 × 10.80€ = 1,080.00€ ✅
```

### Test 3: Częściowo przekonwertowana rezerwacja PO
```
Materiał: Test Material
Potrzeba: 10 szt
Rezerwacje:
  - PO PO-456: zarezerwowano 8 szt @ 15.00€
    - przekonwertowano: 3 szt
    - dostępne: 5 szt

Średnia cena = (5 × 15) / 5 = 15.00€
Koszt = 10 × 15.00€ = 150.00€ ✅

Uwaga: Przekonwertowane 3 szt są już w standardowych rezerwacjach
```

## Logi debugowania

System dodaje szczegółowe logi z prefiksami:

```
[AUTO] Znaleziono 1 aktywnych rezerwacji PO dla 1 materiałów
[AUTO] Rezerwacja PO PO000099: ilość=5, cena=21€
[AUTO] Materiał PACKCOR-MULTIVITAMIN: pozostała ilość=10, średnia ważona cena=21.0000€, koszt=210.0000€
```

```
[UI-COSTS] Przetwarzam 1 rezerwacji PO
[UI-COSTS] Znaleziono 1 aktywnych rezerwacji PO dla 1 materiałów
[UI-COSTS] Rezerwacja PO PO000099: ilość=5, cena=21€
[UI-COSTS] Materiał PACKCOR-MULTIVITAMIN: pozostała ilość=10, średnia ważona cena=21.0000€, koszt=210.0000€
```

## Kompatybilność

- ✅ Działa ze starymi zadaniami bez rezerwacji PO
- ✅ Działa z zadaniami mającymi tylko standardowe rezerwacje
- ✅ Działa z zadaniami mającymi tylko rezerwacje PO
- ✅ Działa z zadaniami mającymi oba typy rezerwacji
- ✅ Prawidłowo obsługuje częściowo przekonwertowane rezerwacje PO

## Dodatkowa poprawka: Zabezpieczenie przed pomijaniem zadań z samymi rezerwacjami PO

### Problem
Gdy zadanie miało **tylko rezerwacje PO** (bez standardowych rezerwacji, bez konsumpcji, bez kosztu procesowego), funkcja `updateTaskCostsAutomatically` zwracała `success: false` i **nie zapisywała kosztów do bazy**.

### Przyczyna
Zabezpieczenie w linii 5524 sprawdzało tylko:
```javascript
const hasReservedMaterials = task.materialBatches && Object.keys(task.materialBatches).length > 0;
const hasDataForCalculation = hasConsumedMaterials || hasReservedMaterials || totalProcessingCost > 0;
```

Nie sprawdzało `task.poReservationIds`!

### Rozwiązanie
Dodano sprawdzenie rezerwacji PO:
```javascript
const hasPOReservations = task.poReservationIds && task.poReservationIds.length > 0;
const hasDataForCalculation = hasConsumedMaterials || hasReservedMaterials || hasPOReservations || totalProcessingCost > 0;
```

**Lokalizacja:** `src/services/productionService.js` linia 5524

## Data implementacji

- **29 października 2024** - Poprawka obliczania kosztów rezerwacji PO (ujednolicenie logiki)
- **29 października 2024** - Poprawka zabezpieczenia dla zadań z samymi rezerwacjami PO

## Powiązane pliki

- `src/services/productionService.js` - funkcja `updateTaskCostsAutomatically`
- `src/pages/Production/TaskDetailsPage.js` - funkcja `calculateAllCosts`
- `PO_RESERVATION_COST_CHAIN.md` - dokumentacja łańcucha aktualizacji PO → MO

