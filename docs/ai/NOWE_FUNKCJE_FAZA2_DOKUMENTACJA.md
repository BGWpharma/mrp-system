# 🎉 Dokumentacja Nowych Funkcji AI Assistant - FAZA 2

## 📋 Podsumowanie Implementacji

**Data:** 2024-11-20  
**Status:** ✅ ZAIMPLEMENTOWANE  
**Liczba nowych funkcji:** 7

Wszystkie funkcje zostały zaimplementowane z **optymalnym filtrowaniem po stronie serwera** oraz zabezpieczeniami przed wysokim zużyciem tokenów.

---

## 🆕 Lista Zaimplementowanych Funkcji

| # | Nazwa Funkcji | Opis | Priorytet |
|---|---------------|------|-----------|
| 2 | `get_production_schedule` | 📅 Harmonogram produkcji z filtrowaniem | 🔴 WYSOKI |
| 3 | `analyze_material_forecast` | 📊 Prognoza zapotrzebowania na materiały | 🟡 ŚREDNI |
| 5 | `analyze_supplier_performance` | 📈 Analiza wydajności dostawców | 🟡 ŚREDNI |
| 6 | `get_customer_analytics` | 📊 Analityka klientów i sprzedaży | 🟡 ŚREDNI |
| 7 | `query_form_responses` | 📝 Odpowiedzi formularzy (hala + produkcja) | 🟢 NISKI |
| 14 | `get_audit_log` | 📜 Log audytowy zmian w systemie | 🟢 NISKI |
| 15 | `calculate_batch_traceability` | 🔍 Pełne traceability partii | 🟡 ŚREDNI |

---

## 📖 Szczegółowa Dokumentacja Funkcji

### 1️⃣ `get_production_schedule` - Harmonogram produkcji

**Zastosowanie:**
- Widok kalendarza produkcji
- Planowanie zasobów i stanowisk
- Identyfikacja konfliktów w harmonogramie
- Lista zadań dla pracownika

**Parametry:**
```javascript
{
  dateFrom: "2024-11-20",        // Data początkowa (SERWER)
  dateTo: "2024-11-30",          // Data końcowa (SERWER)
  status: "Zaplanowane",         // Jeden status (SERWER) lub tablica (KLIENT)
  workstationId: "WS001",        // Filtr stanowiska (KLIENT)
  assignedTo: "USER_ID",         // Filtr użytkownika (KLIENT)
  productId: "PROD_ID",         // Filtr produktu (KLIENT)
  limit: 100                     // Max wyników
}
```

**Przykłady użycia:**

```
Użytkownik: "Pokaż harmonogram produkcji na najbliższy tydzień"
AI → get_production_schedule({
  dateFrom: "2024-11-20",
  dateTo: "2024-11-27",
  limit: 100
})
```

```
Użytkownik: "Jakie zadania są zaplanowane na stanowisku mieszania?"
AI → get_production_schedule({
  dateFrom: "2024-11-20",
  dateTo: "2024-12-31",
  workstationId: "stanowisko_mieszania_id"
})
```

**Zwracane dane:**
```javascript
{
  tasks: [
    {
      id: "TASK_ID",
      moNumber: "MO00123",
      productName: "Suplement Witamina D3",
      status: "Zaplanowane",
      quantity: 1000,
      workstationId: "WS001",
      scheduledDate: "2024-11-22T08:00:00Z",
      endDate: "2024-11-22T16:00:00Z",
      assignedTo: "USER_ID",
      orderNumber: "CO00456"
    }
  ],
  count: 15,
  limitApplied: 100,
  isEmpty: false
}
```

---

### 2️⃣ `analyze_material_forecast` - Prognoza zapotrzebowania

**Zastosowanie:**
- Planowanie zakupów materiałów
- Identyfikacja niedoborów przed rozpoczęciem produkcji
- Optymalizacja poziomu zapasów
- Analiza "co zamówić"

**Parametry:**
```javascript
{
  forecastPeriodDays: 30,        // Okres prognozy (domyślnie: 30 dni)
  materialId: "MAT_ID",         // Konkretny materiał (opcjonalnie)
  includeDetails: true           // Szczegóły zadań i zamówień
}
```

**Przykłady użycia:**

```
Użytkownik: "Jakie materiały będą potrzebne w najbliższym miesiącu?"
AI → analyze_material_forecast({
  forecastPeriodDays: 30,
  includeDetails: false
})
```

```
Użytkownik: "Czy mamy wystarczającą ilość witaminy D3 na planowaną produkcję?"
AI → analyze_material_forecast({
  forecastPeriodDays: 30,
  materialId: "witamina_d3_id",
  includeDetails: true
})
```

**Zwracane dane:**
```javascript
{
  forecast: [
    {
      materialId: "MAT_123",
      materialName: "Witamina D3",
      currentStock: 50,
      minStock: 30,
      plannedDemand: 120,
      orderedQuantity: 80,
      projectedStock: 10,          // 50 + 80 - 120 = 10
      shortfall: 20,               // 30 - 10 = 20 (poniżej minStock)
      status: "shortage",          // critical / shortage / ok
      unit: "kg"
    }
  ],
  count: 25,
  summary: {
    critical: 3,                   // Materiały z ujemnym stanem prognozowanym
    shortage: 5,                   // Materiały poniżej minStock
    ok: 17,
    totalTasksAnalyzed: 42,
    forecastPeriodDays: 30
  },
  isEmpty: false
}
```

---

### 3️⃣ `analyze_supplier_performance` - Analiza dostawców

**Zastosowanie:**
- Ocena niezawodności dostawców
- Wybór najlepszego dostawcy dla materiału
- Identyfikacja problemów z terminowością
- Raportowanie KPI dostawców

**Parametry:**
```javascript
{
  supplierId: "SUP_ID",          // Konkretny dostawca (opcjonalnie)
  dateFrom: "2024-08-01",        // Data początkowa (domyślnie: 90 dni wstecz)
  includeDetails: true,          // Szczegóły zamówień
  limit: 100
}
```

**Przykłady użycia:**

```
Użytkownik: "Którzy dostawcy są najbardziej terminowi?"
AI → analyze_supplier_performance({
  dateFrom: "2024-08-01",
  includeDetails: false
})
```

```
Użytkownik: "Jak oceniasz wydajność dostawcy XYZ?"
AI → analyze_supplier_performance({
  supplierId: "xyz_supplier_id",
  includeDetails: true
})
```

**Zwracane dane:**
```javascript
{
  suppliers: [
    {
      supplierId: "SUP_123",
      supplierName: "Dostawca A",
      totalOrders: 50,
      totalValue: 125000,
      deliveredOnTime: 45,
      deliveredLate: 5,
      onTimeDeliveryRate: 90.00,   // % (45/50)
      averageDelayDays: 2.5,        // Średnie opóźnienie dla spóźnionych
      rating: "excellent",          // excellent / good / fair / poor
      orders: [...]                 // Jeśli includeDetails: true
    }
  ],
  count: 12,
  summary: {
    totalSuppliers: 12,
    totalOrders: 234,
    excellent: 5,
    good: 4,
    fair: 2,
    poor: 1
  },
  isEmpty: false
}
```

**Kryteria oceny:**
- **excellent:** ≥90% on-time delivery
- **good:** ≥70% on-time delivery
- **fair:** ≥50% on-time delivery
- **poor:** <50% on-time delivery

---

### 4️⃣ `get_customer_analytics` - Analiza klientów

**Zastosowanie:**
- Identyfikacja najważniejszych klientów (VIP)
- Analiza wartości życiowej klienta (LTV)
- Segmentacja klientów
- Raportowanie sprzedaży

**Parametry:**
```javascript
{
  customerId: "CUST_ID",         // Konkretny klient (opcjonalnie)
  dateFrom: "2024-08-01",        // Data początkowa (domyślnie: 90 dni wstecz)
  status: "Zakończone",          // Filtr statusu zamówień
  includeDetails: true,          // Szczegóły zamówień
  limit: 100
}
```

**Przykłady użycia:**

```
Użytkownik: "Którzy klienci generują największe przychody?"
AI → get_customer_analytics({
  dateFrom: "2024-01-01",
  includeDetails: false
})
```

```
Użytkownik: "Pokaż statystyki klienta ABC"
AI → get_customer_analytics({
  customerId: "abc_customer_id",
  includeDetails: true
})
```

**Zwracane dane:**
```javascript
{
  customers: [
    {
      customerId: "CUST_123",
      customerName: "Klient A",
      totalOrders: 25,
      totalRevenue: 75000,
      completedOrders: 22,
      cancelledOrders: 3,
      averageOrderValue: 3000,
      completionRate: 88.00,       // % (22/25)
      category: "VIP",             // VIP / Premium / Standard
      orders: [...]                // Jeśli includeDetails: true
    }
  ],
  count: 45,
  summary: {
    totalCustomers: 45,
    totalOrders: 567,
    totalRevenue: 1250000,
    vipCustomers: 8,               // >50k€
    premiumCustomers: 15,          // >10k€
    standardCustomers: 22          // reszta
  },
  isEmpty: false
}
```

**Kryteria kategorii:**
- **VIP:** totalRevenue > 50 000 €
- **Premium:** totalRevenue > 10 000 €
- **Standard:** reszta

---

### 5️⃣ `query_form_responses` - Odpowiedzi formularzy

**Zastosowanie:**
- Przegląd raportów serwisowych
- Analiza zgłoszonych usterek
- Kontrola jakości produkcji
- Compliance i dokumentacja

**Parametry:**
```javascript
{
  formType: "hall",              // "hall" lub "production" lub brak (oba)
  dateFrom: "2024-11-01",        // Data początkowa
  dateTo: "2024-11-30",          // Data końcowa
  author: "user@example.com",    // Email autora (tylko dla "hall")
  moNumber: "MO00123",           // Numer MO (tylko dla "production")
  limit: 50
}
```

**Przykłady użycia:**

```
Użytkownik: "Pokaż raporty serwisowe z ostatniego tygodnia"
AI → query_form_responses({
  formType: "hall",
  dateFrom: "2024-11-13",
  dateTo: "2024-11-20"
})
```

```
Użytkownik: "Jakie formularze wypełniono dla MO00123?"
AI → query_form_responses({
  formType: "production",
  moNumber: "MO00123"
})
```

**Zwracane dane:**
```javascript
{
  responses: [
    {
      id: "RESP_123",
      formType: "TygodniowyRaportSerwisu",
      category: "hall",
      email: "user@example.com",
      fillDate: "2024-11-20T10:00:00Z",
      // ... inne pola formularza
    },
    {
      id: "TASK_456_FormQuality",
      formType: "QualityControl",
      category: "production",
      taskId: "TASK_456",
      moNumber: "MO00123",
      productName: "Suplement",
      submittedAt: "2024-11-20T14:30:00Z",
      // ... pola formularza produkcyjnego
    }
  ],
  count: 12,
  totalResponses: 12,
  summary: {
    hall: 8,
    production: 4
  },
  limitApplied: 50,
  isEmpty: false
}
```

**Typy formularzy hali:**
- `TygodniowyRaportSerwisu`
- `MiesiecznyRaportSerwisu`
- `RejestrUsterek`
- `RaportSerwisNapraw`

---

### 6️⃣ `get_audit_log` - Log audytowy

**Zastosowanie:**
- Śledzenie zmian w systemie
- Audyt compliance
- Debugowanie problemów
- Identyfikacja użytkownika który wykonał zmianę

**Parametry:**
```javascript
{
  dateFrom: "2024-11-13",        // Data początkowa (domyślnie: 7 dni wstecz)
  collection: "purchaseOrders",  // "purchaseOrders", "productionTasks", "customerOrders"
  userId: "USER_ID",             // Filtr użytkownika
  limit: 100
}
```

**Przykłady użycia:**

```
Użytkownik: "Kto zmienił status zamówienia PO00456?"
AI → get_audit_log({
  collection: "purchaseOrders",
  dateFrom: "2024-11-01",
  limit: 100
})
// Następnie filtruje wyniki dla documentNumber === "PO00456"
```

```
Użytkownik: "Pokaż wszystkie zmiany kosztów w ostatnim tygodniu"
AI → get_audit_log({
  collection: "productionTasks",
  dateFrom: "2024-11-13"
})
```

**Zwracane dane:**
```javascript
{
  logs: [
    {
      collection: "purchaseOrders",
      documentId: "PO_123",
      documentNumber: "PO00456",
      action: "statusChange",
      field: "status",
      oldValue: "oczekujące",
      newValue: "dostarczone",
      changedBy: "USER_ID",
      changedAt: "2024-11-20T10:30:00Z",
      timestamp: 1700479800000
    },
    {
      collection: "productionTasks",
      documentId: "TASK_456",
      documentNumber: "MO00123",
      action: "costUpdate",
      field: "totalMaterialCost",
      oldValue: 1250.50,
      newValue: 1320.75,
      changedBy: "USER_ID",
      changedByName: "Jan Kowalski",
      reason: "Aktualizacja cen materiałów",
      changedAt: "2024-11-20T11:00:00Z",
      timestamp: 1700481600000
    }
  ],
  count: 45,
  totalLogs: 45,
  summary: {
    purchaseOrders: 20,
    productionTasks: 18,
    customerOrders: 7,
    byAction: {
      statusChange: 25,
      costUpdate: 15,
      documentUpdate: 5
    }
  },
  limitApplied: 100,
  isEmpty: false
}
```

**UWAGA:** System NIE MA dedykowanej kolekcji `auditLogs`. Dane są zbierane z:
- `purchaseOrders.statusHistory[]`
- `productionTasks.costHistory[]`
- `orders.updatedAt/updatedBy`

---

### 7️⃣ `calculate_batch_traceability` - Traceability partii

**Zastosowanie:**
- Śledzenie pochodzenia surowców (backward)
- Śledzenie gdzie trafiła partia (forward)
- Compliance i regulacje (ISO, GMP)
- Recalls (wycofanie produktu)

**Parametry:**
```javascript
{
  batchNumber: "LOT123",         // Numer partii (priorytet 1)
  lotNumber: "SN00117",          // Alternatywa dla batchNumber
  moNumber: "MO00123",           // Znajdź partie dla MO
  direction: "both",             // "forward", "backward", "both"
  includeDetails: true           // Pełne szczegóły każdego kroku
}
```

**Przykłady użycia:**

```
Użytkownik: "Skąd pochodzi partia LOT12345?"
AI → calculate_batch_traceability({
  batchNumber: "LOT12345",
  direction: "backward",
  includeDetails: true
})
```

```
Użytkownik: "Gdzie trafiła partia produktu z MO00123?"
AI → calculate_batch_traceability({
  moNumber: "MO00123",
  direction: "forward",
  includeDetails: true
})
```

**Zwracane dane:**
```javascript
{
  queryBatch: "LOT12345",
  chain: [
    // KROK 1: Partia produktu
    {
      step: "batch",
      type: "Inventory Batch",
      batchId: "BATCH_123",
      batchNumber: "LOT12345",
      itemName: "Suplement Witamina D3",
      quantity: 1000,
      source: "Produkcja",
      expiryDate: "2025-11-20T00:00:00Z"
    },
    // KROK 2: Zadanie produkcyjne
    {
      step: "production",
      type: "Manufacturing Order",
      taskId: "TASK_456",
      moNumber: "MO00123",
      productName: "Suplement Witamina D3",
      quantity: 1000,
      scheduledDate: "2024-11-15T08:00:00Z",
      status: "Zakończone"
    },
    // KROK 3: Partia materiału użytego
    {
      step: "material",
      type: "Material Batch",
      batchId: "BATCH_789",
      batchNumber: "LOT_MAT_456",
      materialName: "Witamina D3 (proszek)",
      quantity: 25,
      unitPrice: 50.00,
      source: "Zakup"
    },
    // KROK 4: Zamówienie zakupu
    {
      step: "purchase",
      type: "Purchase Order",
      poId: "PO_123",
      poNumber: "PO00456",
      supplierName: "Dostawca A",
      orderDate: "2024-11-01T00:00:00Z",
      deliveryDate: "2024-11-10T10:00:00Z"
    },
    // KROK 5: Zamówienie klienta (jeśli forward)
    {
      step: "delivery",
      type: "Customer Order",
      orderId: "ORDER_789",
      orderNumber: "CO00789",
      customerName: "Klient B",
      orderDate: "2024-11-18T00:00:00Z",
      deliveryDate: "2024-11-25T00:00:00Z"
    }
  ],
  chainLength: 5,
  summary: {
    totalSteps: 5,
    purchaseOrders: 1,
    materialBatches: 1,
    productionTasks: 1,
    customerOrders: 1
  },
  isEmpty: false
}
```

**Łańcuch traceability:**
```
BACKWARD (skąd pochodziło):
PO (zakup) → Batch materiału → MO (produkcja) → Batch produktu

FORWARD (gdzie trafiło):
Batch produktu → CO (zamówienie klienta)

BOTH:
PO → Batch materiału → MO → Batch produktu → CO
```

---

## 🧪 Scenariusze Testowe

### Test 1: Harmonogram produkcji na tydzień
```javascript
get_production_schedule({
  dateFrom: "2024-11-20",
  dateTo: "2024-11-27",
  status: ["Zaplanowane", "W trakcie"]
})
```

**Oczekiwany wynik:** Lista wszystkich zadań w najbliższym tygodniu

---

### Test 2: Materiały do zamówienia
```javascript
analyze_material_forecast({
  forecastPeriodDays: 30,
  includeDetails: false
})
```

**Oczekiwany wynik:** Lista materiałów z status: "critical" lub "shortage"

---

### Test 3: Ranking dostawców
```javascript
analyze_supplier_performance({
  dateFrom: "2024-08-01",
  includeDetails: false
})
```

**Oczekiwany wynik:** Dostawcy posortowani według onTimeDeliveryRate (malejąco)

---

### Test 4: Top 10 klientów
```javascript
get_customer_analytics({
  dateFrom: "2024-01-01",
  includeDetails: false,
  limit: 10
})
```

**Oczekiwany wynik:** 10 klientów z największym totalRevenue

---

### Test 5: Formularze usterek
```javascript
query_form_responses({
  formType: "hall",
  dateFrom: "2024-11-01",
  dateTo: "2024-11-30"
})
```

**Oczekiwany wynik:** Wszystkie formularze hali z listopada

---

### Test 6: Zmiany kosztów
```javascript
get_audit_log({
  collection: "productionTasks",
  dateFrom: "2024-11-01",
  limit: 50
})
```

**Oczekiwany wynik:** Historia zmian kosztów w zadaniach produkcyjnych

---

### Test 7: Traceability LOT
```javascript
calculate_batch_traceability({
  batchNumber: "SN00117",
  direction: "both",
  includeDetails: true
})
```

**Oczekiwany wynik:** Pełny łańcuch od PO do CO dla partii SN00117

---

## ⚙️ Optymalizacje Wydajności

### 1. Filtrowanie po stronie serwera
Wszystkie funkcje priorytetyzują filtrowanie **po stronie serwera** dla najważniejszych parametrów:
- ✅ `get_production_schedule`: `scheduledDate` (zawsze serwer)
- ✅ `analyze_supplier_performance`: `supplierId` lub `orderDate` (serwer)
- ✅ `get_customer_analytics`: `customer.id` lub `orderDate` (serwer)
- ✅ `calculate_batch_traceability`: `batchNumber`, `lotNumber`, `moNumber` (serwer)

### 2. Limity wyników
Domyślne limity zapobiegają przeciążeniu:
- `get_production_schedule`: 100
- `analyze_material_forecast`: 500 zadań + 200 PO + 500 materiałów
- `analyze_supplier_performance`: 100-500
- `get_customer_analytics`: 100-500
- `query_form_responses`: 50
- `get_audit_log`: 100
- `calculate_batch_traceability`: 10 partii + 50 materiałów

### 3. Redukcja tokenów
Funkcje zwracają **tylko niezbędne pola** domyślnie:
- Duże pola (materials, consumedMaterials, formResponses) są **wyłączone** chyba że `includeDetails: true`
- Zamiast pełnych danych zwracane są **counters** (materialsCount, ordersCount)

### 4. Ostrzeżenia
System ostrzega AI o potencjalnych problemach:
- `isEmpty: true` + `warning` gdy brak danych
- Ostrzeżenie gdy wyników > 20 (wysokie zużycie tokenów)

---

## 🚨 Najczęstsze Problemy i Rozwiązania

### Problem 1: "The query requires an index"
**Przyczyna:** Brak Composite Index  
**Rozwiązanie:** Zobacz `COMPOSITE_INDEXES_INSTRUCTIONS.md`

### Problem 2: Funkcja zwraca puste wyniki
**Przyczyna:** Zbyt restrykcyjne filtry lub brak danych  
**Rozwiązanie:** Sprawdź `warning` w odpowiedzi, poluzuj filtry

### Problem 3: Powolne działanie
**Przyczyna:** Filtrowanie po stronie klienta  
**Rozwiązanie:** Utwórz Composite Index dla często używanych kombinacji

### Problem 4: Wysokie zużycie tokenów
**Przyczyna:** `includeDetails: true` + duża liczba wyników  
**Rozwiązanie:** Użyj mniejszego `limit` lub `includeDetails: false`

---

## 📊 Metryki Sukcesu

Po wdrożeniu monitoruj:
- ✅ Liczba wywołań każdej funkcji
- ✅ Średni czas odpowiedzi (<3s docelowo)
- ✅ Procent błędów (<1% docelowo)
- ✅ Zużycie tokenów (tracking w GeminiQueryOrchestrator)
- ✅ Satysfakcja użytkowników

---

## 🔄 Następne Kroki

1. **Utworzyć Composite Indexes** (zobacz `COMPOSITE_INDEXES_INSTRUCTIONS.md`)
2. **Przetestować wszystkie 7 funkcji** z realnymi danymi
3. **Monitorować wydajność** przez pierwszy tydzień
4. **Zebrać feedback** od użytkowników
5. **Iterować i optymalizować** na podstawie metryk

---

**Implementacja zakończona:** 2024-11-20  
**Tester:** Należy przeprowadzić testy akceptacyjne  
**Deployment:** Gotowe do wdrożenia na produkcję (po utworzeniu indeksów)  
**Wersja:** 2.0
