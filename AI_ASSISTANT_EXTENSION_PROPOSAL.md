# 🤖 Propozycje rozszerzeń Asystenta AI - Analiza Aplikacji

## 📊 Stan obecny

### Obecnie dostępne dane w AI (22 kolekcje):
✅ **Podstawowe**:
- `inventory` - pozycje magazynowe
- `orders` - zamówienia klientów (CO)
- `productionTasks` - zadania produkcyjne (MO)
- `suppliers` - dostawcy
- `recipes` - receptury
- `purchaseOrders` - zamówienia zakupowe (PO)
- `customers` - klienci

✅ **Zaawansowane**:
- `materialBatches` - partie materiałów z rezerwacjami
- `batchReservations` - rezerwacje partii
- `inventoryBatches` - partie magazynowe
- `inventorySupplierPrices` - ceny od dostawców
- `inventoryTransactions` - transakcje magazynowe
- `productionHistory` - historia produkcji
- `recipeVersions` - wersje receptur
- `priceListItems` + `priceLists` - cenniki
- `warehouses` - magazyny
- `workstations` - stanowiska produkcyjne
- `users` - użytkownicy
- `settings` - ustawienia
- `notifications` - powiadomienia
- `counters` - liczniki

---

## 🎯 FAZA 1: Rozszerzenia krytyczne (implementacja natychmiastowa)

### 1.1 📄 **Faktury (Invoices)**
**Kolekcje**: `invoices` + `invoiceItems`

**Uzasadnienie**:
- Brak faktur uniemożliwia analizę finansową łańcucha sprzedaży
- AI nie może odpowiedzieć na pytania typu:
  - "Jakie faktury są nieopłacone?"
  - "Który klient ma najwyższe zaległości?"
  - "Ile faktury wystawiliśmy w tym miesiącu?"

**Powiązania**:
```
invoices → orders (zamówienia klientów)
invoices → customers (klienci)
invoices → purchaseOrders (rozliczanie zaliczek)
```

**Struktura danych**:
```javascript
{
  id, number, customer, orderId, 
  issueDate, dueDate, paymentDate,
  totalAmount, paidAmount, status,
  paymentStatus, items[], linkedPurchaseOrders[]
}
```

---

### 1.2 🚚 **Dokumenty CMR (Transport)**
**Kolekcje**: `cmrDocuments` + `cmrItems`

**Uzasadnienie**:
- AI nie wie o statusach wysyłek i transportów
- Brak informacji o dostawach do klientów
- Niemożliwa analiza logistyki

**Pytania, na które AI będzie mogło odpowiedzieć**:
- "Które przesyłki są obecnie w transporcie?"
- "Kiedy dotarła ostatnia dostawa do klienta X?"
- "Ile dokumentów CMR wystawiliśmy w tym miesiącu?"

**Powiązania**:
```
cmrDocuments → orders (linkedOrderIds)
cmrDocuments → customers
cmrDocuments → carriers (przewoźnicy)
```

**Struktura danych**:
```javascript
{
  id, cmrNumber, status, 
  linkedOrderIds[], 
  sender, receiver, carrier,
  issueDate, deliveryDate, loadingDate,
  items[], paymentStatus
}
```

---

### 1.3 🔬 **Testy jakościowe (Quality)**
**Kolekcje**: `qualityTests` + `qualityResults`

**Uzasadnienie**:
- Brak możliwości analizy jakości produkcji
- AI nie wie o testach i certyfikatach
- Niemożliwa korelacja jakości z partiami/dostawcami

**Pytania, na które AI będzie mogło odpowiedzieć**:
- "Jakie testy zostały przeprowadzone dla partii X?"
- "Które partie nie przeszły testów jakościowych?"
- "Który dostawca ma najwyższą jakość?"

**Powiązania**:
```
qualityTests → productionTasks
qualityTests → inventory (batchNumber)
qualityTests → materialBatches
qualityResults → qualityTests
```

**Struktura danych**:
```javascript
{
  id, testName, batchNumber, 
  productionTaskId, status,
  testDate, performedBy,
  results: { parameter, value, status }[]
}
```

---

## 🚀 FAZA 2: Rozszerzenia ważne (do implementacji w 2. kolejności)

### 2.1 📋 **Inwentaryzacje (Stocktaking)**
**Kolekcje**: `stocktaking` + `stocktakingItems`

**Uzasadnienie**:
- AI nie wie o rozbieżnościach w stanach magazynowych
- Brak analizy strat/nadwyżek
- Niemożliwa weryfikacja dokładności systemu

**Pytania**:
- "Jakie rozbieżności znaleziono w ostatniej inwentaryzacji?"
- "Które produkty mają największe straty?"
- "Kiedy była ostatnia inwentaryzacja magazynu X?"

**Powiązania**:
```
stocktaking → warehouses
stocktakingItems → inventory
stocktakingItems → stocktaking
```

---

### 2.2 📈 **Historia cen od dostawców**
**Kolekcja**: `inventorySupplierPriceHistory`

**Uzasadnienie**:
- AI widzi tylko aktualną cenę, nie historię zmian
- Niemożliwa analiza trendów cenowych
- Brak możliwości predykcji przyszłych cen

**Pytania**:
- "Jak zmieniała się cena materiału X w ostatnich miesiącach?"
- "Który dostawca ma najbardziej stabilne ceny?"
- "O ile wzrosła cena składnika Y w tym roku?"

**Powiązania**:
```
inventorySupplierPriceHistory → inventory
inventorySupplierPriceHistory → suppliers
inventorySupplierPriceHistory → inventorySupplierPrices
```

---

## 📝 FAZA 3: Rozszerzenia dodatkowe (opcjonalne)

### 3.1 📋 **Formularze produkcyjne**
**Kolekcje**:
- `Forms/SkonczoneMO/Odpowiedzi` (zakończone MO)
- `Forms/KontrolaProdukcji/Odpowiedzi` (kontrola produkcji)
- `Forms/ZmianaProdukcji/Odpowiedzi` (raporty zmian)

**Uzasadnienie**:
- Szczegółowe dane o procesie produkcyjnym
- Warunki atmosferyczne podczas produkcji
- Pracownicy zaangażowani w produkcję

**Pytania**:
- "Jakie warunki atmosferyczne były podczas produkcji partii X?"
- "Którzy pracownicy uczestniczyli w produkcji MO-123?"
- "Ile raportów produkcyjnych wypełniono w tym miesiącu?"

---

### 3.2 📦 **Formularze magazynowe**
**Kolekcje**:
- `Forms/ZaladunekTowaru/Odpowiedzi` (załadunek)
- `Forms/RozladunekTowaru/Odpowiedzi` (rozładunek)

**Uzasadnienie**:
- Dokumentacja procesów logistycznych
- Stan techniczny pojazdów
- Jakość towaru przy przyjęciu/wydaniu

**Pytania**:
- "Jakie uwagi były przy rozładunku dostawy X?"
- "Który przewoźnik miał problemy techniczne?"
- "Ile razy odnotowano uszkodzenia przy rozładunku?"

---

## 🔗 FAZA 4: Nowe powiązania i analizy cross-collection

### 4.1 **Finansowy łańcuch wartości**
```
PO → Batch → MO → CO → Invoice → Payment
```

**Implementacja**: Dodać pola relacyjne:
- `invoice.linkedOrderId` ✅ (już jest)
- `order.linkedProductionTaskIds` (nowe)
- `productionTask.linkedBatchIds` (nowe)
- `batch.linkedPurchaseOrderId` ✅ (już jest)

**Korzyści dla AI**:
- Pełna ścieżka kosztu od zakupu do sprzedaży
- Analiza marży na poziomie produktu
- Wykrywanie nierentownych zleceń

---

### 4.2 **Łańcuch jakości**
```
Supplier → PO → Batch → QualityTest → Production → FinalProduct → Customer
```

**Implementacja**:
- Dodać `qualityTest.supplierId` (z batch → PO → supplier)
- Dodać `qualityTest.materialBatchId`
- Korelacja wyników testów z dostawcami

**Korzyści dla AI**:
- "Który dostawca ma najwyższą jakość?"
- "Czy są korelacje między dostawcą a wynikami testów?"
- Predykcja problemów jakościowych

---

### 4.3 **Analiza kompletności danych**
**Nowe pole**: `dataCompleteness` dla każdego dokumentu

Przykład dla `productionTask`:
```javascript
{
  id: "MO-123",
  // ... inne pola ...
  dataCompleteness: {
    hasPurchaseOrder: true,
    hasBatches: true,
    hasQualityTests: false,  // ⚠️ brak testów
    hasCustomerOrder: true,
    hasInvoice: false,  // ⚠️ brak faktury
    hasFormsCompleted: true,
    completenessScore: 0.75  // 75%
  }
}
```

**Korzyści dla AI**:
- Wykrywanie luk w dokumentacji
- "Które MO nie mają testów jakościowych?"
- "Które zamówienia nie zostały zafakturowane?"

---

## 🧠 FAZA 5: Inteligentne agregacje i cache

### 5.1 **Pre-computed analytics**
Zamiast obliczać za każdym razem, tworzyć cache:

```javascript
// Nowa kolekcja: analyticsCache
{
  id: "monthly_2025_10",
  type: "monthly_summary",
  period: "2025-10",
  data: {
    totalSales: 1500000,
    totalProduction: 120,
    topCustomers: [...],
    topProducts: [...],
    avgMargin: 0.35
  },
  updatedAt: "2025-10-21T12:00:00Z"
}
```

**Korzyści**:
- 100x szybsze odpowiedzi na pytania analityczne
- Mniejsze zużycie tokenów
- Możliwość trendów rok-do-roku

---

### 5.2 **Smart summaries per entity**
Dodać pole `aiSummary` do kluczowych dokumentów:

```javascript
{
  id: "customer-123",
  name: "Firma XYZ",
  // ... inne pola ...
  aiSummary: {
    generatedAt: "2025-10-21",
    text: "Klient od 2 lat, 50 zamówień, średnia wartość 30k PLN, zawsze płaci w terminie, preferuje produkty A i B",
    tags: ["vip", "reliable", "high_volume"],
    keyMetrics: {
      totalOrders: 50,
      totalValue: 1500000,
      avgOrderValue: 30000,
      paymentDelayAvg: -5  // płaci 5 dni przed terminem
    }
  }
}
```

---

## 📦 Implementacja - Plan działania

### Krok 1: Rozszerzenie `aiDataService.js`
```javascript
// Dodać do getBatchData():
collectionsToFetch.push(
  { name: 'invoices', options: {} },
  { name: 'invoiceItems', options: {} },
  { name: 'cmrDocuments', options: {} },
  { name: 'cmrItems', options: {} },
  { name: 'qualityTests', options: {} },
  { name: 'qualityResults', options: {} },
  { name: 'stocktaking', options: {} },
  { name: 'stocktakingItems', options: {} },
  { name: 'inventorySupplierPriceHistory', options: {} }
);
```

### Krok 2: Rozszerzenie `ContextOptimizer.js`
```javascript
// Dodać nowe kategorie w analyzeQueryIntent():
const categories = {
  // ... existing ...
  invoices: /faktur|płatnoś|należnoś|invoice/i,
  transport: /cmr|transport|wysyłk|dostaw/i,
  quality: /jakość|test|kontrola|certyfikat|CoA/i,
  stocktaking: /inwentaryzac|rozbieżnoś|straty/i,
  logistics: /logistyk|załadunek|rozładunek|magazynier/i
};

// Dodać do buildRelevancyMap():
relevancy.invoices = 0.2;
relevancy.cmrDocuments = 0.2;
relevancy.qualityTests = 0.2;
relevancy.stocktaking = 0.2;
```

### Krok 3: Rozszerzenie `simplifyItem()` w `ContextOptimizer.js`
```javascript
invoices: (item) => ({
  id, number, customer, orderId,
  issueDate, dueDate, totalAmount, paidAmount,
  status, paymentStatus
}),
cmrDocuments: (item) => ({
  id, cmrNumber, status, linkedOrderIds,
  sender, receiver, carrier,
  issueDate, deliveryDate, items
}),
qualityTests: (item) => ({
  id, testName, batchNumber, productionTaskId,
  status, testDate, results
}),
```

---

## 🎯 Priorytety implementacji

### ✅ NATYCHMIAST (Faza 1):
1. ✅ Invoices - **najpilniejsze** - brak kompletnego łańcucha finansowego
2. ✅ CMR Documents - **pilne** - brak informacji o transporcie
3. ✅ Quality Tests - **ważne** - brak kontroli jakości

### 📅 W CIĄGU TYGODNIA (Faza 2):
4. ⏳ Stocktaking - analiza rozbieżności
5. ⏳ Supplier Price History - trendy cenowe

### 📆 W PRZYSZŁOŚCI (Faza 3-5):
6. ⏳ Formularze produkcyjne
7. ⏳ Formularze magazynowe
8. ⏳ Cross-collection relationships
9. ⏳ Pre-computed analytics
10. ⏳ AI summaries

---

## 📊 Szacowany wpływ na możliwości AI

| Kategoria zapytań | Przed | Po Fazie 1 | Po Fazie 2 | Po Fazie 5 |
|-------------------|-------|------------|------------|------------|
| Finanse | 40% | **95%** ✅ | 95% | 100% |
| Logistyka | 30% | **85%** ✅ | 90% | 100% |
| Jakość | 20% | **80%** ✅ | 85% | 95% |
| Produkcja | 80% | 85% | **95%** ✅ | 100% |
| Magazyn | 70% | 75% | **90%** ✅ | 100% |
| Analizy | 50% | 60% | 70% | **100%** ✅ |

---

## 🔧 Dodatkowe usprawnienia

### A. Kontekstowe podpowiedzi dla użytkownika
```javascript
// W UI asystenta, pokazać sugerowane pytania na podstawie dostępnych danych:
"Oto co mogę dla Ciebie zrobić:"
- 💰 "Jakie faktury są nieopłacone?" (nowe!)
- 🚚 "Które przesyłki są w transporcie?" (nowe!)
- 🔬 "Pokaż wyniki testów dla partii X" (nowe!)
- 📊 "Analiza sprzedaży w tym miesiącu"
- 🏭 "Status zadań produkcyjnych"
```

### B. Wykrywanie luk w danych
AI powinien proaktywnie informować:
```
⚠️ Uwaga: Znalazłem 3 zamówienia bez faktur
⚠️ Uwaga: 5 partii nie ma testów jakościowych
⚠️ Uwaga: 2 MO nie mają powiązanych formularzy
```

### C. Inteligentne follow-up questions
```
User: "Pokaż mi faktury z października"
AI: "Znalazłem 15 faktur. Czy chcesz:
  1. Zobaczyć tylko nieopłacone?
  2. Posortować według wartości?
  3. Sprawdzić które są po terminie?"
```

---

## 📝 Podsumowanie

**Faza 1** (3 kolekcje) znacząco rozszerzy możliwości AI o:
- ✅ Pełną analizę finansową (faktury)
- ✅ Monitoring logistyki (CMR)
- ✅ Kontrolę jakości (testy)

**Szacowany czas implementacji Fazy 1**: 2-3 godziny

**Oczekiwane rezultaty**:
- +50% pokrycia pytań finansowych
- +60% pokrycia pytań logistycznych
- +70% pokrycia pytań o jakość
- Pełna ścieżka: PO → Batch → MO → CO → Invoice → CMR

**Następne kroki**:
1. Zatwierdzenie propozycji przez użytkownika
2. Implementacja Fazy 1 (invoices, CMR, quality)
3. Testowanie z rzeczywistymi zapytaniami
4. Przejście do Fazy 2

