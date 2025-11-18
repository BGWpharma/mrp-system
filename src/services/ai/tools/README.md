# 🎯 AI Query Orchestrator - Inteligentne zapytania do bazy danych

## Przegląd

**AI Query Orchestrator** to zaawansowany system, który używa OpenAI Function Calling (Tool Use), aby **GPT sam decydował** jakie dane pobrać z bazy Firestore na podstawie zapytania użytkownika.

### Jak to działa?

```
User: "Ile receptur ma wagę ponad 900g?"
     ↓
GPT analizuje pytanie
     ↓
GPT decyduje: "Potrzebuję query_recipes z calculateWeight: true"
     ↓
System wykonuje TYLKO to jedno zapytanie (nie pobiera całej bazy!)
     ↓
GPT otrzymuje wyniki i generuje odpowiedź
     ↓
User: "Znaleziono 15 receptur o wadze ponad 900g: ..."
```

## 🚀 Główne zalety

✅ **Pobiera TYLKO potrzebne dane** - nie całą bazę  
✅ **AI sam orkiestruje** - elastyczne, działa z dowolnymi zapytaniami  
✅ **Szybkie** - targetowane zapytania zamiast full scan  
✅ **Przejrzyste** - widzisz dokładnie jakie zapytania zostały wykonane  
✅ **Skalowalny** - łatwo dodawać nowe funkcje  
✅ **Inteligentny fallback** - automatycznie przełącza się na standardowy system gdy potrzeba

## 📁 Struktura plików

```
src/services/ai/tools/
├── databaseTools.js       # Definicje funkcji dostępnych dla GPT
├── toolExecutor.js        # Wykonawca funkcji (zapytania do Firestore)
└── README.md             # Ta dokumentacja

src/services/ai/
└── AIQueryOrchestrator.js # Główny kontroler systemu
```

## 🛠️ Dostępne funkcje (tools)

### 1. `query_recipes`
Pobiera receptury z opcjonalnymi filtrami.

**Parametry:**
- `filters[]` - Filtry (field, operator, value)
- `limit` - Maksymalna liczba wyników (domyślnie 100)
- `orderBy` - Sortowanie
- `calculateWeight` - Czy obliczyć łączną wagę składników (domyślnie true)

**Przykład użycia przez GPT:**
```json
{
  "filters": [
    {"field": "active", "operator": "==", "value": true}
  ],
  "limit": 50,
  "calculateWeight": true
}
```

### 2. `query_inventory`
Pobiera stany magazynowe (partie materiałów).

**Parametry:**
- `filters[]` - Filtry
- `checkLowStock` - Tylko produkty z niskim stanem
- `checkExpiring` - Tylko produkty wygasające w ciągu 30 dni
- `calculateTotals` - Czy obliczyć sumy
- `limit` - Limit wyników

### 3. `query_production_tasks`
Pobiera zadania produkcyjne (MO).

**Parametry:**
- `status[]` - Lista statusów (zaplanowane, w trakcie, wstrzymane, zakończone)
- `dateFrom` / `dateTo` - Przedział dat (ISO format)
- `assignedTo` - ID użytkownika
- `productName` - Nazwa produktu (częściowe dopasowanie)
- `includeDetails` - Czy dołączyć szczegóły (materiały, koszty)
- `limit` - Limit

### 4. `query_orders`
Pobiera zamówienia klientów (CO).

**Parametry:**
- `status[]` - Statusy zamówień
- `customerId` - ID klienta
- `customerName` - Nazwa klienta
- `dateFrom` / `dateTo` - Przedział dat
- `includeItems` - Czy dołączyć pozycje
- `limit` - Limit

### 5. `query_purchase_orders`
Pobiera zamówienia zakupu (PO).

**Parametry:**
- `status[]` - Statusy
- `supplierId` - ID dostawcy
- `supplierName` - Nazwa dostawcy
- `dateFrom` / `dateTo` - Daty
- `limit` - Limit

### 6. `aggregate_data`
Wykonuje agregacje danych (suma, średnia, liczba, grupowanie).

**Parametry:**
- `collection` - Kolekcja (recipes, inventory, production_tasks, customer_orders, purchase_orders)
- `operation` - Operacja (count, sum, average, min, max, group_by)
- `field` - Pole do agregacji (dla sum, average, min, max)
- `groupBy` - Pole grupowania (dla group_by)
- `filters[]` - Opcjonalne filtry

**Przykład - suma wartości zamówień:**
```json
{
  "collection": "customer_orders",
  "operation": "sum",
  "field": "totalValue",
  "filters": [
    {"field": "status", "operator": "==", "value": "completed"}
  ]
}
```

### 7. `get_count`
Szybkie zliczanie dokumentów (używa getCountFromServer - najszybsze!).

**Parametry:**
- `collection` - Kolekcja do zliczenia
- `filters[]` - Opcjonalne filtry

**Przykład:**
```json
{
  "collection": "recipes",
  "filters": [
    {"field": "active", "operator": "==", "value": true}
  ]
}
```

### 8. `get_customers`
Pobiera listę klientów.

**Parametry:**
- `active` - Tylko aktywni klienci (boolean)
- `searchName` - Szukaj po nazwie
- `limit` - Limit

### 9. `get_suppliers`
Pobiera listę dostawców.

**Parametry:**
- `active` - Tylko aktywni
- `searchName` - Szukaj po nazwie
- `limit` - Limit

## 💡 Przykłady działania

### Przykład 1: Proste zliczanie
```
User: "Ile jest receptur w systemie?"

GPT wywołuje:
get_count({ collection: "recipes" })

Wynik:
{ count: 127, collection: "recipes", method: "getCountFromServer" }

Odpowiedź:
"W systemie znajduje się obecnie **127 receptur**. 📊"
```

### Przykład 2: Filtrowanie z warunkiem
```
User: "Które produkty mają niski stan?"

GPT wywołuje:
query_inventory({ 
  checkLowStock: true, 
  calculateTotals: true,
  limit: 100 
})

Wynik:
{
  items: [
    { materialName: "Mąka pszenna", quantity: 50, minQuantity: 100 },
    { materialName: "Cukier", quantity: 20, minQuantity: 50 },
    ...
  ],
  count: 8,
  totals: { lowStockCount: 8, totalItems: 8 }
}

Odpowiedź:
"⚠️ Znaleziono **8 produktów z niskim stanem magazynowym**:

1. 🌾 Mąka pszenna - stan: 50 kg (min: 100 kg)
2. 🍬 Cukier - stan: 20 kg (min: 50 kg)
..."
```

### Przykład 3: Złożone zapytanie z wieloma funkcjami
```
User: "Pokaż mi aktywne receptury o wadze ponad 900g i ich średnią wagę"

Runda 1 - GPT wywołuje:
query_recipes({ 
  filters: [{ field: "active", operator: "==", value: true }],
  calculateWeight: true,
  limit: 500
})

Runda 2 - GPT filtruje wyniki > 900g i wywołuje:
aggregate_data({
  collection: "recipes",
  operation: "average",
  field: "totalWeight"
})

Odpowiedź:
"📊 **Analiza receptur o wadze ponad 900g**

Znaleziono **15 aktywnych receptur** spełniających kryteria:
1. Receptura Premium - 1250g
2. Receptura Deluxe - 980g
...

Średnia waga wszystkich receptur w systemie: **675g**"
```

### Przykład 4: Agregacje
```
User: "Ile zamówień ma każdy klient?"

GPT wywołuje:
aggregate_data({
  collection: "customer_orders",
  operation: "group_by",
  groupBy: "customerId"
})

Wynik:
{
  groups: {
    "customer1": { count: 15, items: [...] },
    "customer2": { count: 8, items: [...] },
    ...
  },
  totalGroups: 25,
  totalItems: 142
}

Odpowiedź:
"📋 **Podsumowanie zamówień według klientów** (142 zamówienia, 25 klientów):

🏆 Top 5 klientów:
1. Firma ABC - 15 zamówień
2. Firma XYZ - 12 zamówień
..."
```

## 🔧 Dodawanie nowych funkcji

### Krok 1: Dodaj definicję w `databaseTools.js`

```javascript
export const DATABASE_TOOLS = [
  // ... istniejące funkcje
  {
    type: "function",
    function: {
      name: "query_quality_reports",
      description: "Pobiera raporty jakości z opcjonalnymi filtrami",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "array",
            items: { type: "string" },
            description: "Statusy raportów (approved, rejected, pending)"
          },
          dateFrom: { type: "string" },
          dateTo: { type: "string" },
          limit: { type: "number", default: 100 }
        }
      }
    }
  }
];
```

### Krok 2: Implementuj w `toolExecutor.js`

```javascript
export class ToolExecutor {
  static async executeFunction(functionName, parameters) {
    // ...
    switch (functionName) {
      // ... istniejące case'y
      case 'query_quality_reports':
        result = await this.queryQualityReports(parameters);
        break;
    }
  }
  
  static async queryQualityReports(params) {
    const collectionName = 'quality_reports';
    let q = collection(db, collectionName);
    const constraints = [];
    
    if (params.status && params.status.length > 0) {
      constraints.push(where('status', 'in', params.status));
    }
    
    if (params.dateFrom) {
      constraints.push(where('reportDate', '>=', Timestamp.fromDate(new Date(params.dateFrom))));
    }
    
    // ... reszta implementacji
    
    return { reports, count, limitApplied };
  }
}
```

### Krok 3: Gotowe! GPT automatycznie zacznie używać nowej funkcji

GPT sam wykryje nową funkcję na podstawie opisów i zacznie ją wywoływać gdy użytkownik zapyta o raporty jakości.

## 📊 Monitoring i metryki

System automatycznie loguje:
- Liczbę wykonanych funkcji
- Czas wykonania każdej funkcji
- Użyte tokeny GPT
- Szacowany koszt zapytania

Przykładowy log:
```
[AIQueryOrchestrator] 🎉 Zakończono w 1247.32ms
[AIQueryOrchestrator] 📊 Statystyki:
  - Rundy: 2
  - Wykonane funkcje: 3
  - Tokeny użyte: 1854
[AIQueryOrchestrator] 📋 Wykonane zapytania:
  1. query_recipes (234.56ms)
  2. aggregate_data (145.23ms)
  3. get_count (67.89ms)
```

Informacja dla użytkownika:
```
_🎯 Wykonano 3 zoptymalizowane zapytania do bazy (447ms)_
_⚡ Całkowity czas: 1247ms | Tokeny: 1854 | Koszt: ~$0.0139_
```

## ⚙️ Konfiguracja

### Zmiana modelu GPT

W `aiAssistantService.js`, funkcja `processAIQuery`:

```javascript
const orchestratorResult = await AIQueryOrchestrator.processQuery(
  query, 
  apiKey, 
  context,
  {
    model: 'gpt-4o-mini',  // Zmień na gpt-4o-mini dla oszczędności
    onChunk: onChunk
  }
);
```

**Porównanie modeli:**
- `gpt-4o` - Najinteligentniejszy, najdroższy (~$0.005/$0.015 za 1K tokenów)
- `gpt-4o-mini` - Bardzo dobry, tańszy (~$0.00015/$0.0006 za 1K tokenów) - **REKOMENDOWANE**

### Limit rund

W `AIQueryOrchestrator.js`, zmień `maxRounds`:

```javascript
const maxRounds = 5;  // Zmień na 3 dla szybszego przetwarzania
```

Więcej rund = GPT może wywoływać więcej funkcji sekwencyjnie, ale trwa dłużej.

## 🔍 Debugowanie

### Włącz szczegółowe logi

Wszystkie logi są już włączone domyślnie. Sprawdź Console w przeglądarce:

```javascript
console.log('[AIQueryOrchestrator] 🚀 Rozpoczynam przetwarzanie...')
console.log('[AIQueryOrchestrator] 🔧 GPT chce wywołać 2 narzędzi...')
console.log('[ToolExecutor] ⚙️ Wykonuję: query_recipes...')
console.log('[ToolExecutor] ✅ query_recipes wykonany w 234.56ms')
```

### Sprawdź jakie funkcje zostały wywołane

Wynik orchestratora zawiera `executedTools`:

```javascript
const result = await AIQueryOrchestrator.processQuery(...);
console.log('Wykonane funkcje:', result.executedTools);
// [
//   { name: 'query_recipes', arguments: {...}, result: {...}, executionTime: 234.56 },
//   { name: 'get_count', arguments: {...}, result: {...}, executionTime: 67.89 }
// ]
```

## 🚨 Rozwiązywanie problemów

### GPT nie wywołuje żadnych funkcji

**Przyczyna:** Zapytanie może być zbyt ogólne lub konwersacyjne.

**Rozwiązanie:** System automatycznie przełączy się na standardowy system (fallback).

### GPT wywołuje złą funkcję

**Przyczyna:** Opis funkcji w `databaseTools.js` może być niejasny.

**Rozwiązanie:** Popraw `description` funkcji, dodaj więcej szczegółów i przykłady.

### Błąd "Nieznana kolekcja"

**Przyczyna:** Nazwa kolekcji w `COLLECTION_MAPPING` nie istnieje.

**Rozwiązanie:** Dodaj mapowanie w `databaseTools.js`:

```javascript
export const COLLECTION_MAPPING = {
  'my_collection': 'actual_firestore_collection_name'
};
```

### Wolne zapytania

**Przyczyna:** Brak indeksów w Firestore lub zbyt duże limity.

**Rozwiązanie:** 
1. Dodaj indeksy composite w Firestore Console
2. Zmniejsz domyślne limity w `databaseTools.js`
3. Użyj `get_count` dla prostych zliczeń

## 📈 Porównanie z innymi systemami

| System | Pobiera dane | Elastyczność | Szybkość | Koszt |
|--------|-------------|--------------|----------|-------|
| **Stary (v1.0)** | Całą bazę | Wysoka | Wolno | Wysoki |
| **AI Assistant v2.0** | Wzorce | Niska | Bardzo szybko | Bardzo niski |
| **AI Query Orchestrator** | Targetowane | **Bardzo wysoka** | **Szybko** | **Średni** |

**Rekomendacja:** Orchestrator jako główny system z fallbackiem do v1.0 dla załączników.

## 🎓 Best Practices

### ✅ DO:
- Używaj `get_count` dla prostych zliczeń (najszybsze)
- Dodawaj filtry w definicjach funkcji
- Ogranicz limity do minimum
- Testuj nowe funkcje przed wdrożeniem
- Monitoruj użycie tokenów

### ❌ DON'T:
- Nie pobieraj wszystkich danych bez limitu
- Nie dodawaj funkcji bez jasnych opisów
- Nie pomijaj walidacji parametrów
- Nie używaj orchestratora dla załączników (zdjęcia, PDFy)

## 📚 Zasoby

- [OpenAI Function Calling Documentation](https://platform.openai.com/docs/guides/function-calling)
- [Firestore Query Documentation](https://firebase.google.com/docs/firestore/query-data/queries)
- [Firebase Performance Best Practices](https://firebase.google.com/docs/firestore/best-practices)

---

**Autor:** AI Query Orchestrator v1.0  
**Data:** 2024  
**Licencja:** Internal BGW Pharma MRP System

