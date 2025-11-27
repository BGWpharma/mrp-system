# 🚀 Cloud Functions - Ulepszona Kalkulacja Kosztów Zadań Produkcyjnych

## 📅 Data implementacji: 25 listopada 2024

---

## 🎯 Cel

Rozszerzenie Cloud Function `onBatchPriceUpdate` o kompleksową kalkulację kosztów zadań produkcyjnych, identyczną z logiką używaną przez frontend w `productionService.js`.

---

## ✅ Zaimplementowane Komponenty

### **1. Nowa funkcja pomocnicza: `hasCostChanged`**

**Lokalizacja:** `functions/index.js` (linie ~679-710)

**Funkcjonalność:**
- Sprawdza czy koszty uległy znaczącej zmianie
- Tolerancja: **0.005€** (pół centa)
- Porównuje `totalMaterialCost` i `totalFullProductionCost`
- Loguje szczegółowe informacje o zmianach

**Korzyści:**
- ✅ Unika niepotrzebnych aktualizacji bazy danych
- ✅ Zmniejsza liczbę triggerów dla kolejnych Cloud Functions
- ✅ Poprawia wydajność systemu

---

### **2. Rozszerzona funkcja: `calculateTaskCosts`**

**Lokalizacja:** `functions/index.js` (linie ~712-1048)

#### **KROK 1: Koszty Skonsumowanych Materiałów** 🔥

```javascript
consumedMaterials = [
  {
    materialId: "xyz",
    quantity: 10.5,
    batchId: "abc123",
    unitPrice: 2.45,
    includeInCosts: true
  }
]
```

**Hierarchia cen:**
1. `consumed.unitPrice` (zapisana przy konsumpcji) - **priorytet 1**
2. Aktualna cena z `inventoryBatches` (pobierana z bazy) - **priorytet 2**
3. `material.unitPrice` (fallback) - **priorytet 3**

**Logika:**
- Pobiera aktualne ceny partii z `inventoryBatches`
- Dla każdego skonsumowanego materiału: `koszt = quantity × unitPrice`
- Sprawdza flagę `includeInCosts` lub `task.materialInCosts[materialId]`
- Dodaje do `totalMaterialCost` (jeśli includeInCosts)
- Zawsze dodaje do `totalFullProductionCost`

---

#### **KROK 2: Rezerwacje PO (Purchase Orders)** 📦

**Pobieranie:**
```javascript
poReservations = await db
  .collection("poReservations")
  .where("taskId", "==", taskId)
  .get()
```

**Filtrowanie:**
- Status: `'pending'` lub `'delivered'`
- Pomija: `'converted'` (już w `materialBatches`)

**Struktura:**
```javascript
poReservation = {
  materialId: "xyz",
  reservedQuantity: 50,
  convertedQuantity: 20,
  unitPrice: 2.30,
  status: "pending"
}

availableQuantity = reservedQuantity - convertedQuantity
// = 50 - 20 = 30
```

**Grupowanie:** Według `materialId`

---

#### **KROK 3: Ceny Partii dla Rezerwacji** 💰

**Batch fetching:**
- Pobiera wszystkie unikalne `batchId` z `materialBatches`
- Równoległe pobieranie cen (`Promise.all`)
- Cache w `batchPricesMap`

**Struktura:**
```javascript
batchPricesMap.set(batchId, {
  unitPrice: 2.45,        // pełna cena (z dodatkowymi kosztami)
  baseUnitPrice: 2.30     // cena bazowa (bez dodatkowych kosztów)
})
```

---

#### **KROK 4: Koszty Zarezerwowanych Materiałów** 📊

**A. Oblicz już skonsumowaną ilość:**
```javascript
consumedQuantity = sum(consumedMaterials.quantity gdzie materialId === materialId)
```

**B. Wymagana ilość:**
```javascript
if (task.actualMaterialUsage[materialId] !== undefined) {
  requiredQuantity = actualMaterialUsage[materialId]  // rzeczywista
} else {
  requiredQuantity = material.quantity  // planowana
}
```

**C. Pozostała ilość:**
```javascript
remainingQuantity = max(0, requiredQuantity - consumedQuantity)
```

**D. Średnia ważona z rezerwacji:**

**D1. Standardowe rezerwacje (`materialBatches`):**
```javascript
weightedPriceSum += batchQuantity × batchPrice
totalReservedQuantity += batchQuantity
```

Hierarchia cen:
1. `batchPricesMap[batchId].unitPrice` (aktualna z bazy) ✅
2. `batch.unitPrice` (zapisana w rezerwacji)
3. `material.unitPrice` (fallback)

**D2. Rezerwacje PO:**
```javascript
availableQuantity = reservedQuantity - convertedQuantity
weightedPriceSum += availableQuantity × unitPrice
totalReservedQuantity += availableQuantity
```

**D3. Koszt materiału:**
```javascript
if (totalReservedQuantity > 0) {
  averagePrice = weightedPriceSum / totalReservedQuantity
  materialCost = remainingQuantity × averagePrice
} else {
  // Fallback
  materialCost = remainingQuantity × material.unitPrice
}
```

**D4. Dodaj do sum:**
```javascript
if (task.materialInCosts[material.id] !== false) {
  totalMaterialCost += materialCost
}
totalFullProductionCost += materialCost  // zawsze
```

---

#### **KROK 5: Koszt Procesowy** ⚙️

```javascript
task.processingCostPerUnit = 0.50  // €/szt z MO
task.totalCompletedQuantity = 1000  // rzeczywiście wyprodukowane
task.quantity = 1200  // planowane

totalProcessingCost = processingCostPerUnit × completedQuantity
// = 0.50 × 1000 = 500€

totalMaterialCost += totalProcessingCost
totalFullProductionCost += totalProcessingCost
```

**Uwaga:**
- Używa `completedQuantity` (nie `quantity`)
- Jeśli `processingCostPerUnit === null/undefined` → pomija (stare MO)

---

### **3. Zaktualizowana logika w `onBatchPriceUpdate`**

**Lokalizacja:** `functions/index.js` (linie ~471-530)

**Zmiany:**
1. ✅ Dodano `id` do `taskData`: `{id: taskId, ...taskDoc.data()}`
2. ✅ Sprawdzanie tolerancji: `hasCostChanged(oldCosts, newCosts, 0.005)`
3. ✅ Skip jeśli koszty niezmienione
4. ✅ Dodatkowe pola przy aktualizacji:
   - `costLastUpdatedAt`
   - `costLastUpdatedBy: "system"`
   - `updatedBy: "system"`

---

## 📊 Porównanie: Cloud Function vs Frontend

| Komponent | Frontend | Cloud Function (PRZED) | Cloud Function (PO IMPLEMENTACJI) |
|-----------|----------|------------------------|----------------------------------|
| **Consumed materials** | ✅ | ❌ | ✅ |
| **Reserved batches** | ✅ | ✅ | ✅ |
| **PO reservations** | ✅ | ❌ | ✅ |
| **Processing cost** | ✅ | ❌ | ✅ |
| **Średnia ważona** | ✅ | ✅ | ✅ |
| **Aktualne ceny z bazy** | ✅ | ✅ | ✅ |
| **Tolerancja zmian** | ✅ (0.005€) | ❌ | ✅ (0.005€) |
| **Precyzyjne obliczenia** | ✅ (mathUtils) | ❌ | ✅ (4 miejsca) |
| **includeInCosts** | ✅ | ⚠️ (częściowo) | ✅ |
| **actualMaterialUsage** | ✅ | ❌ | ✅ |

---

## 🔍 Szczegółowe Logi

Cloud Function teraz loguje:

### **Początek kalkulacji:**
```
Starting comprehensive task cost calculation {
  taskId, moNumber, materialsCount, consumedCount,
  reservedBatchesCount, poReservationsCount
}
```

### **Skonsumowane materiały:**
```
Consumed: [Material Name] {
  quantity, unitPrice, cost, includeInCosts
}
```

### **Rezerwacje PO:**
```
PO reservations fetched {
  activeCount, materialsCount
}
```

### **Zarezerwowane materiały:**
```
Material [Name] {
  required, consumed, remaining
}
  Batch [ID]: [quantity] × [price]€
  PO Reservation [PO Number]: [quantity] × [price]€
  Average price: [avg]€, cost: [total]€
```

### **Koszt procesowy:**
```
Processing cost {
  perUnit, completed, planned, total
}
```

### **Wynik końcowy:**
```
Task costs calculated {
  totalMaterialCost, totalFullProductionCost,
  unitMaterialCost, unitFullProductionCost
}
```

### **Sprawdzanie zmian:**
```
Cost change check {
  oldTotalMaterial, newTotalMaterial,
  oldTotalFull, newTotalFull,
  maxChange, tolerance, changed
}
```

---

## 🚀 Deployment

**Data:** 25 listopada 2024, 12:00 CET

**Komenda:**
```bash
firebase deploy --only functions:bgw-mrp:onBatchPriceUpdate
```

**Status:** ✅ Successful update operation

**Region:** `europe-central2`

**Runtime:** Node.js 22 (2nd Gen)

**Pamięć:** 512MiB

---

## 🎯 Korzyści

### **1. Dokładność**
- ✅ Identyczna logika jak frontend
- ✅ Uwzględnia wszystkie źródła kosztów
- ✅ Średnia ważona z wielu źródeł rezerwacji

### **2. Wydajność**
- ✅ Tolerancja 0.005€ - unika niepotrzebnych aktualizacji
- ✅ Równoległe pobieranie cen partii
- ✅ Skip dla zadań z wyłączonymi automatycznymi aktualizacjami

### **3. Spójność**
- ✅ Aktualne ceny zawsze z bazy danych
- ✅ Uwzględnia już skonsumowane materiały
- ✅ Respektuje `actualMaterialUsage`

### **4. Debugowanie**
- ✅ Szczegółowe logi na każdym kroku
- ✅ Widoczne źródła cen
- ✅ Śledzenie średniej ważonej

---

## ⚠️ Wymagania

### **Pola w zadaniu (`productionTasks`):**

```javascript
{
  materials: [],              // wymagane
  materialBatches: {},        // opcjonalne
  consumedMaterials: [],      // opcjonalne
  poReservationIds: [],       // opcjonalne
  processingCostPerUnit: 0.50,// opcjonalne
  totalCompletedQuantity: 100,// opcjonalne
  actualMaterialUsage: {},    // opcjonalne
  materialInCosts: {},        // opcjonalne
  disableAutomaticCostUpdates: false  // opcjonalne
}
```

### **Kolekcja `poReservations`:**

```javascript
{
  taskId: "task123",
  materialId: "mat456",
  reservedQuantity: 50,
  convertedQuantity: 20,
  unitPrice: 2.30,
  status: "pending" | "delivered" | "converted",
  poNumber: "PO-2024-001"
}
```

---

## 🧪 Testowanie

### **Scenariusz 1: Zmiana ceny w PO**
1. Otwórz PO i zmień cenę jednostkową pozycji
2. Zapisz zmiany
3. Cloud Function `onPurchaseOrderUpdate` aktualizuje partie
4. Cloud Function `onBatchPriceUpdate` wykrywa zmiany
5. Sprawdź logi w Firebase Console

**Oczekiwany rezultat:**
- ✅ Zadania używające zaktualizowanych partii mają przeliczone koszty
- ✅ Logi pokazują wszystkie komponenty (consumed, reserved, PO, processing)
- ✅ Tylko zadania ze znaczącymi zmianami (>0.005€) są aktualizowane

### **Scenariusz 2: Zadanie ze skonsumowanymi materiałami**
1. Zadanie ma consumed materials i reserved batches
2. Zmień cenę partii używanej zarówno w consumed jak i reserved
3. Sprawdź logi

**Oczekiwany rezultat:**
- ✅ Consumed materials używają nowej ceny
- ✅ Reserved materials też używają nowej ceny
- ✅ Średnia ważona uwzględnia obie grupy

### **Scenariusz 3: Rezerwacje PO**
1. Zadanie ma aktywne rezerwacje PO (pending/delivered)
2. Zmień cenę w PO
3. Sprawdź logi

**Oczekiwany rezultat:**
- ✅ Rezerwacje PO są uwzględnione w średniej ważonej
- ✅ Logi pokazują "PO Reservation [PO Number]: [qty] × [price]€"

---

## 📝 Następne Kroki

1. ✅ **Monitoruj logi** po pierwszej aktualizacji PO
2. ⏳ **Sprawdź wydajność** - czy tolerancja 0.005€ działa poprawnie
3. ⏳ **Testuj edge cases**:
   - Zadania bez rezerwacji
   - Zadania z samymi rezerwacjami PO
   - Zadania ze wszystkimi skonsumowanymi materiałami
4. ⏳ **Opcjonalnie:** Dodaj metryki do Cloud Monitoring

---

## 🔗 Powiązane Pliki

- `functions/index.js` - Cloud Functions
- `src/services/productionService.js` - Frontend logic (linie 5210-5779)
- `src/services/poReservationService.js` - PO reservations
- `CLOUD_FUNCTIONS_CHAIN_UPDATE.md` - Ogólna dokumentacja
- `CLOUD_FUNCTIONS_MIGRATION_COMPLETED.md` - Historia migracji

---

## 👨‍💻 Autor

AI Assistant (Claude Sonnet 4.5) + User (mateu)

**Projekt:** BGW-MRP System  
**Data:** 25 listopada 2024



