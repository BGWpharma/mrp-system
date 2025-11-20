# 📋 Instrukcje Tworzenia Composite Indexes dla Firestore

## ⚠️ WAŻNE!
Niektóre z nowo zaimplementowanych funkcji AI Assistant wymagają **Composite Indexes** w Firestore, aby działały optymalnie. Bez tych indeksów zapytania mogą:
- Zwracać błędy `requires an index`
- Być wolne (filtrowanie tylko po stronie klienta)
- Zużywać więcej Read Operations

---

## 🔧 Jak Utworzyć Composite Index?

### Metoda 1: Automatycznie przez Link Error (Zalecane)
1. Uruchom funkcję w AI Assistant (np. `get_production_schedule`)
2. Jeśli Firestore zwróci błąd: **"The query requires an index..."**
3. W konsoli będzie **link do utworzenia indeksu** - kliknij go
4. Potwierdź utworzenie indeksu
5. Poczekaj 2-5 minut na zbudowanie indeksu

### Metoda 2: Ręcznie w Firebase Console
1. Przejdź do [Firebase Console](https://console.firebase.google.com/)
2. Wybierz projekt: **BGW-MRP**
3. Przejdź do **Firestore Database → Indexes**
4. Kliknij **Create Index**
5. Wprowadź parametry z poniższej listy

---

## 📊 Lista Wymaganych Composite Indexes

### 1. **get_production_schedule** - Harmonogram produkcji z filtrowaniem po statusie

**Collection:** `productionTasks`

| Field Name      | Mode       |
|-----------------|------------|
| scheduledDate   | Ascending  |
| status          | Ascending  |
| __name__        | Ascending  |

**Query Scope:** Collection

**Priorytet:** 🔴 WYSOKI - używany często w harmonogramie

---

### 2. **get_production_schedule** - Harmonogram produkcji ze stanowiskiem

**Collection:** `productionTasks`

| Field Name      | Mode       |
|-----------------|------------|
| scheduledDate   | Ascending  |
| workstationId   | Ascending  |
| __name__        | Ascending  |

**Query Scope:** Collection

**Priorytet:** 🟡 ŚREDNI - używany w widoku stanowisk

---

### 3. **analyze_material_forecast** - Prognoza zapotrzebowania

**Collection:** `productionTasks`

| Field Name      | Mode       |
|-----------------|------------|
| scheduledDate   | Ascending  |
| status          | Ascending  |
| __name__        | Ascending  |

**Query Scope:** Collection

**Priorytet:** 🟢 NISKI - podobny do #1, może używać tego samego indeksu

**UWAGA:** Ten sam indeks co #1 - nie trzeba tworzyć ponownie!

---

### 4. **analyze_supplier_performance** - Wydajność dostawców

**Collection:** `purchaseOrders`

| Field Name      | Mode       |
|-----------------|------------|
| supplierId      | Ascending  |
| orderDate       | Descending |
| __name__        | Descending |

**Query Scope:** Collection

**Priorytet:** 🟡 ŚREDNI - używany w analizie dostawców

---

### 5. **get_customer_analytics** - Analiza klientów

**Collection:** `orders`

| Field Name      | Mode       |
|-----------------|------------|
| customer.id     | Ascending  |
| orderDate       | Descending |
| __name__        | Descending |

**Query Scope:** Collection

**Priorytet:** 🟡 ŚREDNI - używany w analizie sprzedaży

**UWAGA:** Pole zagnieżdżone `customer.id` może wymagać specjalnej konfiguracji!

---

### 6. **query_form_responses** - Formularze hali

**Collection:** `Forms/TygodniowyRaportSerwisu/Odpowiedzi`

| Field Name      | Mode       |
|-----------------|------------|
| fillDate        | Ascending  |
| email           | Ascending  |
| __name__        | Ascending  |

**Query Scope:** Collection

**Priorytet:** 🟢 NISKI - rzadko używany

**UWAGA:** Powtórz dla innych kolekcji formularzy:
- `Forms/RejestrUsterek/Odpowiedzi`
- `Forms/MiesiecznyRaportSerwisu/Odpowiedzi`
- `Forms/RaportSerwisNapraw/Odpowiedzi`

---

### 7. **get_audit_log** - Log audytowy dla PO

**Collection:** `purchaseOrders`

| Field Name      | Mode       |
|-----------------|------------|
| updatedAt       | Descending |
| __name__        | Descending |

**Query Scope:** Collection

**Priorytet:** 🟢 NISKI - prosty indeks, może działać bez niego

---

### 8. **get_audit_log** - Log audytowy dla zadań produkcyjnych

**Collection:** `productionTasks`

| Field Name      | Mode       |
|-----------------|------------|
| updatedAt       | Descending |
| __name__        | Descending |

**Query Scope:** Collection

**Priorytet:** 🟢 NISKI - prosty indeks, może działać bez niego

---

### 9. **calculate_batch_traceability** - Traceability partii (batchNumber)

**Collection:** `inventoryBatches`

| Field Name      | Mode       |
|-----------------|------------|
| batchNumber     | Ascending  |
| __name__        | Ascending  |

**Query Scope:** Collection

**Priorytet:** 🟡 ŚREDNI - używany w traceability

**UWAGA:** Może już istnieć jeśli batchNumber jest indeksowane!

---

### 10. **calculate_batch_traceability** - Traceability partii (moNumber)

**Collection:** `inventoryBatches`

| Field Name      | Mode       |
|-----------------|------------|
| moNumber        | Ascending  |
| __name__        | Ascending  |

**Query Scope:** Collection

**Priorytet:** 🟡 ŚREDNI - używany w traceability

---

### 11. **query_inventory_batches** - Partie wygasające (expirationDate)

**Collection:** `inventoryBatches`

| Field Name        | Mode       |
|-------------------|------------|
| expirationDate    | Ascending  |
| __name__          | Ascending  |

**Query Scope:** Collection

**Priorytet:** 🟡 ŚREDNI - używany do znajdowania wygasających partii

**UWAGA:** Ten indeks był już wspomniany w poprzednich implementacjach!

---

## 📝 Podsumowanie Priorytetów

### 🔴 Krytyczne (Utwórz natychmiast):
1. `productionTasks`: `scheduledDate + status` - dla harmonogramu

### 🟡 Ważne (Utwórz wkrótce):
2. `purchaseOrders`: `supplierId + orderDate` - dla analizy dostawców
3. `orders`: `customer.id + orderDate` - dla analizy klientów
4. `inventoryBatches`: `batchNumber` - dla traceability
5. `inventoryBatches`: `moNumber` - dla traceability

### 🟢 Opcjonalne (Utwórz jeśli pojawią się błędy):
6. `productionTasks`: `scheduledDate + workstationId` - dla widoku stanowisk
7. Formularze hali: `fillDate + email`
8. Audit logs: `updatedAt` (pojedyncze pole - może działać bez indeksu)

---

## 🧪 Testowanie Po Utworzeniu Indeksów

Po utworzeniu indeksów, przetestuj funkcje w AI Assistant:

```javascript
// Test 1: Harmonogram produkcji
get_production_schedule({
  dateFrom: "2024-11-01",
  dateTo: "2024-11-30",
  status: "Zaplanowane"
})

// Test 2: Analiza dostawców
analyze_supplier_performance({
  supplierId: "SUPPLIER_ID"
})

// Test 3: Analiza klientów
get_customer_analytics({
  customerId: "CUSTOMER_ID"
})

// Test 4: Traceability partii
calculate_batch_traceability({
  batchNumber: "LOT123"
})
```

---

## ⏱️ Czas Budowania Indeksów

- **Mała baza danych (<1000 dokumentów):** 2-5 minut
- **Średnia baza danych (1000-10000 dokumentów):** 5-15 minut
- **Duża baza danych (>10000 dokumentów):** 15-60 minut

**Status budowania** możesz sprawdzić w Firebase Console → Firestore → Indexes

---

## 🚨 Troubleshooting

### Problem: "The query requires an index"
**Rozwiązanie:** Kliknij link w błędzie lub utwórz indeks ręcznie według powyższych instrukcji.

### Problem: Zapytanie działa ale jest wolne
**Rozwiązanie:** Prawdopodobnie filtrowanie odbywa się po stronie klienta. Utwórz odpowiedni Composite Index.

### Problem: Nie mogę utworzyć indeksu dla `customer.id`
**Rozwiązanie:** Pole zagnieżdżone wymaga specjalnej składni. W Firebase Console użyj pełnej ścieżki: `customer.id`

### Problem: Indeks jest "Building" od kilku godzin
**Rozwiązanie:** 
1. Sprawdź czy nie ma błędów w konfiguracji indeksu
2. Spróbuj usunąć i utworzyć ponownie
3. Skontaktuj się z Firebase Support jeśli problem trwa >24h

---

## 📚 Dodatkowe Zasoby

- [Firestore Indexes Documentation](https://firebase.google.com/docs/firestore/query-data/indexing)
- [Understanding Composite Indexes](https://firebase.google.com/docs/firestore/query-data/index-overview#composite_indexes)
- [Firestore Pricing](https://firebase.google.com/docs/firestore/pricing) - indeksy nie zwiększają kosztów przechowywania znacząco

---

## ✅ Checklist Implementacji

- [ ] Utworzono indeks: `productionTasks` → `scheduledDate + status`
- [ ] Utworzono indeks: `purchaseOrders` → `supplierId + orderDate`
- [ ] Utworzono indeks: `orders` → `customer.id + orderDate`
- [ ] Utworzono indeks: `inventoryBatches` → `batchNumber`
- [ ] Utworzono indeks: `inventoryBatches` → `moNumber`
- [ ] Przetestowano wszystkie 7 nowych funkcji
- [ ] Zweryfikowano brak błędów w konsoli
- [ ] Potwierdzono szybkie działanie zapytań

---

**Data utworzenia instrukcji:** 2024-11-20
**Wersja:** 1.0
**Autor:** AI Assistant Implementation Team

