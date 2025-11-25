# Cloud Functions - Automatyczna Aktualizacja Łańcucha Wartości

## 📋 Przegląd

System trzech triggerów Cloud Functions automatycznie aktualizujących wartości w całym łańcuchu:

**PO (Purchase Order) → LOT (Batch) → MO (Manufacturing Order) → CO (Customer Order)**

## 🔄 Architektura

### Łańcuch triggerów

```
┌─────────────────────┐
│  Purchase Order     │
│  (aktualizacja)     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐     ┌──────────────────┐
│ onPurchaseOrder     │────▶│ _systemEvents    │
│ Update              │     │ (batchPriceUpdate)│
└─────────────────────┘     └────────┬─────────┘
                                     │
           ┌─────────────────────────┘
           ▼
┌─────────────────────┐
│  Inventory Batches  │
│  (cena zaktualizowana)│
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐     ┌──────────────────┐
│ onBatchPrice        │────▶│ _systemEvents    │
│ Update              │     │ (taskCostUpdate) │
└─────────────────────┘     └────────┬─────────┘
                                     │
           ┌─────────────────────────┘
           ▼
┌─────────────────────┐
│ Production Tasks    │
│ (koszt zaktualizowany)│
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ onProductionTask    │
│ CostUpdate          │
└─────────────────────┘
           │
           ▼
┌─────────────────────┐
│ Customer Orders     │
│ (wartość zaktualizowana)│
└─────────────────────┘
```

## 📦 Zaimplementowane Funkcje

### 1. **onPurchaseOrderUpdate**

**Trigger:** `purchaseOrders/{orderId}` (onDocumentUpdated)  
**Pamięć:** 512MiB  
**Region:** europe-central2

#### Co robi:
- Wykrywa zmiany w pozycjach PO (ceny jednostkowe, rabaty)
- Wykrywa zmiany w dodatkowych kosztach PO
- Aktualizuje ceny w powiązanych partiach magazynowych
- Oblicza proporcjonalny udział dodatkowych kosztów
- Tworzy event `batchPriceUpdate` dla kolejnego triggera

#### Aktualizowane pola w partiach:
```javascript
{
  unitPrice: number,              // Cena końcowa
  baseUnitPrice: number,          // Cena bazowa (z rabatem)
  additionalCostPerUnit: number,  // Dodatkowy koszt na jednostkę
  updatedAt: timestamp,
  updatedBy: "system",
  lastPriceUpdateReason: string,
  lastPriceUpdateFrom: string     // ID zamówienia
}
```

#### Logika obliczania cen:
```javascript
// 1. Cena bazowa z rabatem
discountMultiplier = (100 - discount) / 100
baseUnitPrice = unitPrice * discountMultiplier

// 2. Dodatkowy koszt proporcjonalny
batchProportion = batchInitialQuantity / totalInitialQuantity
batchAdditionalCostTotal = additionalCostsGross * batchProportion
additionalCostPerUnit = batchAdditionalCostTotal / batchInitialQuantity

// 3. Cena końcowa
finalUnitPrice = baseUnitPrice + additionalCostPerUnit
```

---

### 2. **onBatchPriceUpdate**

**Trigger:** `_systemEvents/{eventId}` (onDocumentWritten)  
**Filtr:** `type === "batchPriceUpdate"`  
**Pamięć:** 512MiB  
**Region:** europe-central2

#### Co robi:
- Nasłuchuje eventów `batchPriceUpdate`
- Znajduje wszystkie zadania produkcyjne używające zaktualizowanych partii
- Przelicza koszty materiałów w zadaniach
- Uwzględnia flagę `includeInCosts` dla materiałów
- Tworzy event `taskCostUpdate` dla kolejnego triggera

#### Aktualizowane pola w zadaniach:
```javascript
{
  totalMaterialCost: number,          // Koszt materiałów z flagą includeInCosts
  totalFullProductionCost: number,    // Pełny koszt wszystkich materiałów
  unitMaterialCost: number,           // Koszt materiałów na jednostkę
  unitFullProductionCost: number,     // Pełny koszt na jednostkę
  updatedAt: timestamp,
  lastCostUpdateReason: string
}
```

#### Logika obliczania kosztów:
```javascript
// Dla każdego materiału:
// 1. Oblicz średnią ważoną cenę z zarezerwowanych partii
avgUnitPrice = Σ(batchQuantity * batchPrice) / Σ(batchQuantity)
avgBaseUnitPrice = Σ(batchQuantity * batchBasePrice) / Σ(batchQuantity)

// 2. Koszt materiału
materialCost = quantity * avgUnitPrice
materialBaseCost = quantity * avgBaseUnitPrice

// 3. Suma kosztów
if (includeInCosts) {
  totalMaterialCost += materialBaseCost
}
totalFullProductionCost += materialCost
```

#### Pominięcia:
- Zadania z flagą `disableAutomaticCostUpdates: true`

---

### 3. **onProductionTaskCostUpdate**

**Trigger:** `_systemEvents/{eventId}` (onDocumentWritten)  
**Filtr:** `type === "taskCostUpdate"`  
**Pamięć:** 512MiB  
**Region:** europe-central2

#### Co robi:
- Nasłuchuje eventów `taskCostUpdate`
- Znajduje wszystkie zamówienia klientów z pozycjami powiązanymi z zadaniem
- Aktualizuje koszty produkcji w pozycjach zamówienia
- Przelicza całkowitą wartość zamówienia

#### Aktualizowane pola w zamówieniach:
```javascript
{
  items[].productionCost: number,           // Koszt materiałów
  items[].fullProductionCost: number,       // Pełny koszt produkcji
  items[].productionUnitCost: number,       // Koszt na jednostkę
  items[].fullProductionUnitCost: number,   // Pełny koszt na jednostkę
  totalValue: number,                       // Suma wartości pozycji
  updatedAt: timestamp,
  lastCostUpdateReason: string
}
```

#### Logika obliczania:
```javascript
// Dla każdej pozycji zamówienia:
if (item.productionTaskId === taskId) {
  // Uwzględnij logikę listy cenowej
  productionUnitCost = item.fromPriceList ? 
    0 : totalMaterialCost / quantity
  
  fullProductionUnitCost = totalFullProductionCost / quantity
}

// Przelicz wartość zamówienia
totalValue = Σ(item.quantity * item.price)
```

---

## 🚀 Deployment

### Opcja 1: Skrypt PowerShell (Windows)

```powershell
.\deploy-functions.ps1
```

### Opcja 2: Skrypt Bash (Linux/Mac)

```bash
chmod +x deploy-functions.sh
./deploy-functions.sh
```

### Opcja 3: Ręczny deployment

```bash
# Deploy pojedynczej funkcji
firebase deploy --only functions:onPurchaseOrderUpdate
firebase deploy --only functions:onBatchPriceUpdate
firebase deploy --only functions:onProductionTaskCostUpdate

# Deploy wszystkich trzech
firebase deploy --only functions:onPurchaseOrderUpdate,onBatchPriceUpdate,onProductionTaskCostUpdate
```

### ⚠️ WAŻNE: Plan wdrożenia krok po kroku

#### Faza 1: Testowanie (1-2 tygodnie)

```bash
# 1. Deploy pierwszej funkcji
firebase deploy --only functions:onPurchaseOrderUpdate

# 2. Monitorowanie
firebase functions:log --only onPurchaseOrderUpdate

# 3. Sprawdź czy ceny partii aktualizują się poprawnie
```

#### Faza 2: Łańcuch częściowy (1-2 tygodnie)

```bash
# 4. Deploy drugiej funkcji
firebase deploy --only functions:onBatchPriceUpdate

# 5. Monitorowanie całego łańcucha PO → Batch → MO
firebase functions:log
```

#### Faza 3: Pełny łańcuch (stałe)

```bash
# 6. Deploy trzeciej funkcji
firebase deploy --only functions:onProductionTaskCostUpdate

# 7. Monitorowanie pełnego łańcucha PO → Batch → MO → CO
```

---

## 📊 Kolekcja _systemEvents

### Struktura dokumentu

Cloud Functions komunikują się poprzez specjalną kolekcję `_systemEvents`:

#### Event typu `batchPriceUpdate`
```javascript
{
  type: "batchPriceUpdate",
  batchIds: ["batch1", "batch2", ...],
  sourceType: "purchaseOrder",
  sourceId: "PO123",
  timestamp: Timestamp,
  processed: false  // zmienia się na true po przetworzeniu
}
```

#### Event typu `taskCostUpdate`
```javascript
{
  type: "taskCostUpdate",
  tasks: [
    {
      taskId: "task1",
      moNumber: "MO-2024-001",
      totalMaterialCost: 100.50,
      totalFullProductionCost: 120.75
    }
  ],
  sourceType: "batchPriceUpdate",
  sourceBatchIds: ["batch1", "batch2"],
  timestamp: Timestamp,
  processed: false
}
```

### Czyszczenie starych eventów

Zalecane jest dodanie funkcji scheduled do czyszczenia:

```javascript
exports.cleanupSystemEvents = onSchedule("0 2 * * *", async (event) => {
  const db = admin.firestore();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 7); // 7 dni wstecz
  
  const snapshot = await db.collection("_systemEvents")
    .where("timestamp", "<", cutoffDate)
    .where("processed", "==", true)
    .get();
  
  const batch = db.batch();
  snapshot.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  
  logger.info(`Cleaned up ${snapshot.size} old system events`);
});
```

---

## 🔍 Monitorowanie i Debugowanie

### Logi w czasie rzeczywistym

```bash
# Wszystkie funkcje
firebase functions:log --follow

# Konkretna funkcja
firebase functions:log --only onPurchaseOrderUpdate --follow
```

### Konsola Firebase

https://console.firebase.google.com/project/bgw-mrp-system/functions

### Znaczniki logów

- `🔄` - Rozpoczęcie przetwarzania
- `✅` - Sukces
- `❌` - Błąd
- `⚠️` - Ostrzeżenie
- `📊` - Statystyki

### Przykładowy log

```
[onPurchaseOrderUpdate] PO Update detected {orderId: "PO123", status: "approved"}
[onPurchaseOrderUpdate] Price changes detected {itemsChanged: true, additionalCostsChanged: false}
[onPurchaseOrderUpdate] Found 3 batches to update
[onPurchaseOrderUpdate] Batch batch1 price updated {basePrice: 10.50, additionalCost: 0.25, finalPrice: 10.75}
[onPurchaseOrderUpdate] ✅ Updated 3 batches {batchIds: ["batch1", "batch2", "batch3"]}
[onPurchaseOrderUpdate] System event created for batch price update

[onBatchPriceUpdate] 🔄 Batch price update event detected {eventId: "event123", batchCount: 3}
[onBatchPriceUpdate] Found task using batch batch1 {taskId: "task456", moNumber: "MO-2024-001"}
[onBatchPriceUpdate] 📊 Found 2 tasks to update
[onBatchPriceUpdate] Task MO-2024-001 costs updated {totalMaterialCost: 150.75, totalFullProductionCost: 180.50}
[onBatchPriceUpdate] ✅ Updated 2 tasks

[onProductionTaskCostUpdate] 🔄 Task cost update event detected {eventId: "event124", taskCount: 2}
[onProductionTaskCostUpdate] Order item updated {orderId: "order789", itemName: "Product A", fullProductionCost: 180.50}
[onProductionTaskCostUpdate] ✅ Updated 1 customer orders
```

---

## ⚡ Wydajność

### Optymalizacje zaimplementowane

1. **Deduplikacja partii** - unikanie podwójnych aktualizacji
2. **Batch updates** - grupowanie operacji zapisu
3. **Lazy loading** - pobieranie tylko potrzebnych danych
4. **Event-driven** - asynchroniczne przetwarzanie łańcucha
5. **Processed flag** - unikanie ponownego przetwarzania

### Limits Firebase Functions

- **Max instances:** 10 (globalna konfiguracja)
- **Memory:** 512MiB per function
- **Timeout:** 60s (default dla v2)
- **Invocations:** unlimited (pay-as-you-go)

### Szacowane koszty

Dla średniego obciążenia (100 aktualizacji PO/dzień):

```
Invocations: ~300/dzień (3 triggery × 100 PO)
Compute time: ~15s × 300 = 1.25h/dzień
Monthly: ~37.5h

Koszt: ~$0.00 - $1.00/miesiąc (free tier: 2M invocations, 400k GB-s)
```

---

## 🛡️ Bezpieczeństwo

### Autoryzacja

- Triggery Firestore **nie wymagają** autoryzacji użytkownika
- Działają z uprawnieniami **admin** (Firebase Admin SDK)
- Modyfikacje zapisywane jako `updatedBy: "system"`

### Walidacja danych

- Sprawdzanie istnienia dokumentów przed aktualizacją
- Obsługa brakujących/niepoprawnych wartości
- Try-catch dla każdej operacji krytycznej

### Retry logic

Functions v2 automatycznie retry przy błędach:
- Max retries: 3
- Backoff: exponential
- Timeout: 60s

---

## 🚨 Wyłączanie automatycznych aktualizacji

### Dla konkretnego zadania

Ustaw flagę w dokumencie zadania:

```javascript
await updateDoc(taskRef, {
  disableAutomaticCostUpdates: true
});
```

### Dla całego systemu (tymczasowo)

Wyłącz funkcje w konsoli Firebase lub usuń deployment:

```bash
# Usuń funkcję (nie usuwa kodu, tylko deployment)
firebase functions:delete onPurchaseOrderUpdate
firebase functions:delete onBatchPriceUpdate
firebase functions:delete onProductionTaskCostUpdate
```

---

## 📈 Metryki do monitorowania

### Kluczowe wskaźniki

1. **Latency** - czas przetwarzania eventu
   - Target: < 5s per trigger
   
2. **Success rate** - procent udanych aktualizacji
   - Target: > 99%
   
3. **Chain completion time** - czas całego łańcucha PO → CO
   - Target: < 15s
   
4. **Error rate** - liczba błędów
   - Target: < 1%

### Dashboard Firebase

Metryki dostępne w konsoli:
- Invocations (liczba wywołań)
- Execution time (czas wykonania)
- Memory usage (użycie pamięci)
- Errors (błędy)

---

## 🔧 Troubleshooting

### Problem: Funkcja się nie uruchamia

**Sprawdź:**
1. Czy funkcja została poprawnie wdrożona?
   ```bash
   firebase functions:list
   ```
2. Czy są błędy w logach?
   ```bash
   firebase functions:log --only onPurchaseOrderUpdate
   ```
3. Czy dokument faktycznie się zmienił?

### Problem: Koszty nie aktualizują się

**Sprawdź:**
1. Czy zadanie ma flagę `disableAutomaticCostUpdates: true`?
2. Czy event został utworzony w `_systemEvents`?
3. Czy event ma `processed: false`?
4. Czy w logach są błędy?

### Problem: Zbyt długi czas przetwarzania

**Optymalizacje:**
1. Zwiększ memory do 1024MiB
2. Dodaj indeksy w Firestore
3. Ogranicz liczbę pobieranych dokumentów
4. Użyj batch operations

### Problem: Duplikacja aktualizacji

**Sprawdź:**
1. Czy flaga `processed` działa poprawnie?
2. Czy nie ma konfliktów z frontend logic?
3. Czy deduplikacja partii działa?

---

## 📚 Dodatkowe zasoby

### Dokumentacja Firebase

- [Cloud Functions v2](https://firebase.google.com/docs/functions/beta)
- [Firestore Triggers](https://firebase.google.com/docs/functions/firestore-events)
- [Best Practices](https://firebase.google.com/docs/functions/best-practices)

### Kod źródłowy

- `functions/index.js` - główny plik z funkcjami
- `deploy-functions.ps1` - skrypt deployment (Windows)
- `deploy-functions.sh` - skrypt deployment (Linux/Mac)

---

## ✅ Checklist implementacji

- [x] Utworzenie funkcji `onPurchaseOrderUpdate`
- [x] Utworzenie funkcji `onBatchPriceUpdate`
- [x] Utworzenie funkcji `onProductionTaskCostUpdate`
- [x] Implementacja funkcji pomocniczej `calculateTaskCosts`
- [x] Utworzenie skryptów deployment
- [x] Dokumentacja
- [ ] **Deployment na production**
- [ ] Testy integracyjne
- [ ] Monitoring przez 2 tygodnie
- [ ] Wyłączenie logiki frontend (opcjonalnie)

---

**Autor:** Claude (Cursor AI)  
**Data utworzenia:** 25 listopada 2025  
**Wersja:** 1.0.0  
**Status:** ✅ Gotowe do deployment

