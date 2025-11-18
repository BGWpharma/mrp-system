# 📝 Przykłady użycia AI Query Orchestrator

## Podstawowe zapytania

### 1. Proste zliczanie

**Zapytanie:**
```
Ile jest receptur w systemie?
```

**GPT wykona:**
```javascript
get_count({ collection: "recipes" })
```

**Oczekiwana odpowiedź:**
```
W systemie znajduje się obecnie 127 receptur. 📊
```

---

### 2. Zliczanie z filtrem

**Zapytanie:**
```
Ile jest aktywnych receptur?
```

**GPT wykona:**
```javascript
get_count({ 
  collection: "recipes",
  filters: [
    { field: "active", operator: "==", value: true }
  ]
})
```

**Oczekiwana odpowiedź:**
```
W systemie znajduje się 98 aktywnych receptur z 127 całkowitej liczby. 📊
```

---

### 3. Filtrowanie z warunkiem

**Zapytanie:**
```
Które produkty mają niski stan magazynowy?
```

**GPT wykona:**
```javascript
query_inventory({ 
  checkLowStock: true,
  calculateTotals: true,
  limit: 50
})
```

**Oczekiwana odpowiedź:**
```
⚠️ Znaleziono 8 produktów z niskim stanem magazynowym:

1. 🌾 Mąka pszenna
   Stan: 50 kg | Minimum: 100 kg | ⚠️ Brakuje: 50 kg

2. 🍬 Cukier
   Stan: 20 kg | Minimum: 50 kg | ⚠️ Brakuje: 30 kg

3. 🥛 Mleko w proszku
   Stan: 15 kg | Minimum: 40 kg | ⚠️ Brakuje: 25 kg

...

💡 Rekomendacja: Rozważ złożenie zamówienia zakupu dla tych materiałów.
```

---

### 4. Zadania produkcyjne według statusu

**Zapytanie:**
```
Jakie zadania produkcyjne są w trakcie realizacji?
```

**GPT wykona:**
```javascript
query_production_tasks({
  status: ["w trakcie"],
  includeDetails: false,
  limit: 100
})
```

**Oczekiwana odpowiedź:**
```
🏭 **Zadania produkcyjne w trakcie realizacji:** 12

1. MO-2024-001 - Receptura Premium
   Przypisane: Jan Kowalski
   Rozpoczęto: 2024-11-15

2. MO-2024-003 - Receptura Standard
   Przypisane: Anna Nowak
   Rozpoczęto: 2024-11-16

...

📊 Łącznie 12 zadań w realizacji z 45 wszystkich zadań (27%)
```

---

## Zaawansowane zapytania

### 5. Receptury z obliczaniem wagi

**Zapytanie:**
```
Pokaż mi receptury o wadze ponad 900 gramów
```

**GPT wykona:**
```javascript
// Runda 1: Pobierz receptury z wagą
query_recipes({
  calculateWeight: true,
  limit: 500
})

// GPT sam przefiltruje wyniki > 900g w drugiej rundzie
```

**Oczekiwana odpowiedź:**
```
📊 **Receptury o wadze ponad 900g**

Znaleziono 15 receptur spełniających kryteria:

1. ⭐ Receptura Premium
   Waga: 1250g | Składniki: 12 | Status: Aktywna

2. 🌟 Receptura Deluxe
   Waga: 980g | Składniki: 10 | Status: Aktywna

3. 💎 Receptura Extra
   Waga: 1150g | Składniki: 14 | Status: Aktywna

...

📈 Statystyki:
- Łączna liczba receptur: 127
- Receptury > 900g: 15 (12%)
- Średnia waga (wszystkie): 675g
- Średnia waga (> 900g): 1089g
```

---

### 6. Agregacje - grupowanie

**Zapytanie:**
```
Ile zamówień ma każdy klient?
```

**GPT wykona:**
```javascript
aggregate_data({
  collection: "customer_orders",
  operation: "group_by",
  groupBy: "customerId"
})
```

**Oczekiwana odpowiedź:**
```
📋 **Podsumowanie zamówień według klientów**

Łącznie: 142 zamówienia | 25 klientów

🏆 **Top 10 klientów:**
1. Firma ABC Sp. z o.o. - 15 zamówień (11%)
2. XYZ Corporation - 12 zamówień (8%)
3. Delta Partners - 10 zamówień (7%)
4. Gamma Industries - 9 zamówień (6%)
5. Beta Services - 8 zamówień (6%)
...

📊 Średnia liczba zamówień na klienta: 5.7
```

---

### 7. Suma wartości

**Zapytanie:**
```
Jaka jest łączna wartość zakończonych zamówień?
```

**GPT wykona:**
```javascript
aggregate_data({
  collection: "customer_orders",
  operation: "sum",
  field: "totalValue",
  filters: [
    { field: "status", operator: "==", value: "zakończone" }
  ]
})
```

**Oczekiwana odpowiedź:**
```
💰 **Łączna wartość zakończonych zamówień**

Suma: **254,780.50 PLN**

📊 Szczegóły:
- Liczba zakończonych zamówień: 89
- Średnia wartość zamówienia: 2,862.70 PLN
- Status: Zakończone
```

---

### 8. Produkty wygasające

**Zapytanie:**
```
Które produkty wygasają w najbliższym czasie?
```

**GPT wykona:**
```javascript
query_inventory({
  checkExpiring: true,
  calculateTotals: true,
  limit: 50
})
```

**Oczekiwana odpowiedź:**
```
⚠️ **Produkty wygasające w ciągu 30 dni**

Znaleziono 6 partii wymagających uwagi:

🚨 **PILNE (< 7 dni):**
1. Mąka pszenna - Partia #12345
   Data ważności: 2024-11-22 (za 4 dni)
   Ilość: 50 kg

⚡ **Wymaga działania (7-14 dni):**
2. Cukier - Partia #12346
   Data ważności: 2024-11-28 (za 10 dni)
   Ilość: 30 kg

⏰ **Do obserwacji (14-30 dni):**
3. Mleko w proszku - Partia #12347
   Data ważności: 2024-12-05 (za 17 dni)
   Ilość: 25 kg

...

💡 Rekomendacja: Użyj produkty wygasające w pilnych zleceniach lub rozważ promocję.
```

---

## Zapytania wieloetapowe

### 9. Analiza produkcji

**Zapytanie:**
```
Pokaż mi analizę zadań produkcyjnych - ile jest w każdym statusie i jaki jest średni czas realizacji?
```

**GPT wykona (wieloetapowo):**

```javascript
// Runda 1: Zlicz zadania
aggregate_data({
  collection: "production_tasks",
  operation: "group_by",
  groupBy: "status"
})

// Runda 2: Pobierz szczegóły zakończonych zadań
query_production_tasks({
  status: ["zakończone"],
  includeDetails: true,
  limit: 100
})
```

**Oczekiwana odpowiedź:**
```
🏭 **Kompleksowa analiza zadań produkcyjnych**

📊 **Rozkład według statusu:**
┌─────────────────┬────────┬──────────┐
│ Status          │ Liczba │ Procent  │
├─────────────────┼────────┼──────────┤
│ ✅ Zakończone   │   125  │   62%    │
│ 🔄 W trakcie    │    45  │   22%    │
│ 📅 Zaplanowane  │    28  │   14%    │
│ ⏸️ Wstrzymane   │     4  │    2%    │
└─────────────────┴────────┴──────────┘

**Łącznie:** 202 zadania

⏱️ **Czas realizacji (zakończone zadania):**
- Średni czas: 4.2 dni
- Najszybsze: 1.5 dni
- Najdłuższe: 12 dni

📈 **Trendy:**
- Zadania na czas: 89% (111/125)
- Zadania opóźnione: 11% (14/125)
- Średnie opóźnienie: 2.3 dni

💡 **Insights:**
- Dobry wskaźnik ukończenia zadań (62%)
- Wysoki procent realizacji na czas (89%)
- 4 zadania wstrzymane - mogą wymagać interwencji
```

---

### 10. Porównanie dostawców

**Zapytanie:**
```
Porównaj zamówienia zakupu według dostawców - ile zamówień i jaka jest łączna wartość?
```

**GPT wykona:**

```javascript
// Runda 1: Pobierz zamówienia zakupu
query_purchase_orders({
  limit: 500
})

// Runda 2: Agregacja po dostawcach
aggregate_data({
  collection: "purchase_orders",
  operation: "group_by",
  groupBy: "supplierId"
})

// Runda 3: Suma wartości
aggregate_data({
  collection: "purchase_orders",
  operation: "sum",
  field: "totalValue"
})
```

**Oczekiwana odpowiedź:**
```
📊 **Analiza zamówień zakupu według dostawców**

🏆 **Top 5 dostawców:**

1. **Dostawca Premium Sp. z o.o.**
   Zamówienia: 45 | Wartość: 125,450 PLN | Średnia: 2,788 PLN

2. **Global Supplies Ltd.**
   Zamówienia: 38 | Wartość: 98,200 PLN | Średnia: 2,584 PLN

3. **Local Trade**
   Zamówienia: 32 | Wartość: 76,800 PLN | Średnia: 2,400 PLN

4. **Import Master**
   Zamówienia: 28 | Wartość: 65,100 PLN | Średnia: 2,325 PLN

5. **Quick Delivery**
   Zamówienia: 25 | Wartość: 54,250 PLN | Średnia: 2,170 PLN

---

💰 **Podsumowanie finansowe:**
- Łączna wartość wszystkich PO: 547,890 PLN
- Liczba dostawców: 15
- Średnia wartość PO: 2,567 PLN

📈 **Koncentracja:**
- Top 5 dostawców: 77% wartości
- Top 3 dostawców: 55% wartości

💡 **Rekomendacje:**
- Wysoka koncentracja u top dostawców
- Rozważ dywersyfikację dla bezpieczeństwa łańcucha dostaw
- Dostawca Premium ma najwyższą wartość - negocjuj rabaty za wolumen
```

---

## Zapytania czasowe

### 11. Zadania w określonym okresie

**Zapytanie:**
```
Jakie zadania produkcyjne zostały utworzone w tym miesiącu?
```

**GPT wykona:**

```javascript
query_production_tasks({
  dateFrom: "2024-11-01",
  dateTo: "2024-11-30",
  includeDetails: false,
  limit: 200
})
```

**Oczekiwana odpowiedź:**
```
📅 **Zadania produkcyjne - Listopad 2024**

Utworzono: **42 zadania**

📊 **Rozkład według statusu:**
- ✅ Zakończone: 25 (60%)
- 🔄 W trakcie: 12 (29%)
- 📅 Zaplanowane: 4 (9%)
- ⏸️ Wstrzymane: 1 (2%)

📈 **Tygodniowy rozkład:**
- Tydzień 1 (01-07.11): 8 zadań
- Tydzień 2 (08-14.11): 12 zadań  ⬆️ Peak
- Tydzień 3 (15-21.11): 10 zadań
- Tydzień 4 (22-30.11): 12 zadań

🎯 **Najczęściej produkowane:**
1. Receptura Standard - 15 zadań
2. Receptura Premium - 10 zadań
3. Receptura Light - 8 zadań
```

---

## Testowanie systemu

### Jak przetestować lokalnie?

1. **Otwórz konsolę przeglądarki** w aplikacji MRP
2. **Wywołaj funkcję testową:**

```javascript
// Test prostego zapytania
const result = await processAIQuery(
  "Ile jest receptur w systemie?",
  [],  // kontekst
  "test-user-id",  // userId
  [],  // załączniki
  null  // onChunk callback
);

console.log('Odpowiedź:', result);
```

3. **Sprawdź logi** w konsoli:
```
[processAIQuery] 🚀 Rozpoczynam przetwarzanie zapytania: Ile jest receptur w systemie?
[processAIQuery] 🎯 Używam AI Query Orchestrator
[AIQueryOrchestrator] 🚀 Rozpoczynam przetwarzanie zapytania
[AIQueryOrchestrator] 🔄 Runda 1/5: Wysyłam do GPT...
[AIQueryOrchestrator] 🔧 GPT chce wywołać 1 narzędzi:
  - get_count
[ToolExecutor] ⚙️ Wykonuję: get_count { collection: "recipes" }
[ToolExecutor] ✅ get_count wykonany w 67.89ms
[AIQueryOrchestrator] ✅ Otrzymano finalną odpowiedź od GPT
[AIQueryOrchestrator] 🎉 Zakończono w 1247.32ms
[processAIQuery] ✅ Orchestrator zakończył w 1247.32ms
[processAIQuery] 📊 Wykonano 1 targetowanych zapytań do bazy
```

4. **Sprawdź metryki** w odpowiedzi:
```
_🎯 Wykonano 1 zoptymalizowane zapytanie do bazy (68ms)_
_⚡ Całkowity czas: 1247ms | Tokeny: 234 | Koszt: ~$0.0018_
```

---

## Przykłady błędów i rozwiązania

### Błąd 1: Brak klucza API

**Zapytanie:** Dowolne

**Błąd:**
```
❌ Nie znaleziono klucza API OpenAI. Proszę skonfigurować klucz w ustawieniach systemu.
```

**Rozwiązanie:**
1. Przejdź do: **Ustawienia → Integracje → OpenAI API**
2. Wprowadź swój klucz API
3. Zapisz ustawienia

---

### Błąd 2: Przekroczono limit tokensów

**Zapytanie:** Bardzo złożone zapytanie z wieloma funkcjami

**Błąd:**
```
OpenAI API error: 400 Bad Request - This model's maximum context length...
```

**Rozwiązanie:**
1. Uprość zapytanie
2. Podziel na mniejsze części
3. Zmień model na `gpt-4o-mini` (większy limit)

---

### Błąd 3: GPT nie wywołał żadnych funkcji

**Log:**
```
[AIQueryOrchestrator] ⚠️ GPT nie zwrócił ani odpowiedzi ani wywołań narzędzi
```

**Rozwiązanie:**
- Zapytanie może być zbyt ogólne
- System automatycznie przełączy się na fallback (standard v1.0)
- Przeformułuj zapytanie bardziej konkretnie

---

## Wsparcie

Problemy z systemem? Sprawdź:

1. **Logi w konsoli** - szczegółowe informacje o każdym kroku
2. **[README.md](README.md)** - pełna dokumentacja
3. **[Dokumentacja główna](../README.md)** - przegląd wszystkich systemów AI

---

*Wygenerowano automatycznie przez AI Query Orchestrator v1.0* 🤖

