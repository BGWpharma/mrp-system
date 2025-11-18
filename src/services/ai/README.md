# 🤖 AI Assistant - System asystenta AI dla MRP

## Dostępne systemy

System MRP posiada **3 różne systemy AI**, każdy zaprojektowany dla innych zastosowań:

### 1. 🎯 **AI Query Orchestrator** (NOWY! v3.0) - REKOMENDOWANY
**GPT sam decyduje jakie dane pobrać z bazy**

- **Elastyczność:** ⭐⭐⭐⭐⭐ - Działa z dowolnymi zapytaniami
- **Szybkość:** ⭐⭐⭐⭐ - Targetowane zapytania do Firestore
- **Koszt:** ⭐⭐⭐ - Średni (tylko tokeny GPT)
- **Użycie:** Główny system dla zapytań o dane

📁 **Pliki:** `ai/AIQueryOrchestrator.js`, `ai/tools/`  
📖 **Dokumentacja:** [ai/tools/README.md](tools/README.md)

### 2. 🚀 **AI Assistant v2.0** - Wzorce
**Predefiniowane wzorce odpowiedzi**

- **95% szybszą** odpowiedź (z sekund do milisekund)
- **80-90% niższe** koszty (brak OpenAI API dla prostych zapytań)
- **Wyższą niezawodność** (działanie offline)
- **Ograniczona elastyczność** (tylko predefiniowane zapytania)

### 3. 📚 **Standard v1.0** - Pełny kontekst
**Pobiera wszystkie dane i wysyła do GPT**

- **Elastyczność:** ⭐⭐⭐⭐⭐ - Obsługuje wszystko (załączniki, złożone analizy)
- **Szybkość:** ⭐⭐ - Wolne (pobiera całą bazę)
- **Koszt:** ⭐ - Wysoki (duże konteksty GPT)
- **Użycie:** Fallback dla załączników i złożonych analiz

## Architektura

### Nowy System (v2.0)
```
Zapytanie → QueryParser → QueryExecutor → ResponseGenerator → Odpowiedź
     ↓           ↓              ↓               ↓
  Analiza → Optymalizacja → Firebase → Formatowanie
```

### Stary System (v1.0) 
```
Zapytanie → Pobranie WSZYSTKICH danych → OpenAI API → Odpowiedź
     ↓              ↓                        ↓
  Oczekiwanie → 15-30 sekund → Wysokie koszty
```

## Komponenty

### 1. QueryParser.js
**Cel:** Inteligentna analiza zapytań użytkownika

**Funkcjonalności:**
- Rozpoznawanie intencji (receptury, magazyn, zamówienia, produkcja)
- Wyciąganie parametrów (liczby, operatory, filtry)
- Określanie poziomu pewności
- Mapowanie na kolekcje Firebase

**Przykład:**
```javascript
QueryParser.analyzeQuery("ile receptur ma sumę składników ponad 900g?")
// Zwraca:
{
  intent: 'recipe_count_by_weight',
  parameters: {
    filters: [{ operator: '>', value: 900, unit: 'g' }]
  },
  confidence: 0.9
}
```

### 2. QueryExecutor.js
**Cel:** Optymalne wykonywanie zapytań do Firebase

**Funkcjonalności:**
- Bezpośrednie zapytania do Firebase (bez pobierania wszystkich danych)
- Obliczenia po stronie klienta (agregacje, filtrowania)
- Konwersje jednostek (kg → g, ml → g)
- Cache dla często używanych danych (TODO)

**Przykład:**
```javascript
QueryExecutor.executeQuery('recipe_count_by_weight', { 
  filters: [{ operator: '>', value: 900 }] 
})
// Wykonuje: zapytanie do kolekcji 'recipes', filtruje po wadze składników
```

### 3. ResponseGenerator.js
**Cel:** Generowanie czytelnych odpowiedzi

**Funkcjonalności:**
- Szablony odpowiedzi dla różnych typów zapytań
- Formatowanie danych liczbowych
- Markdown dla lepszej prezentacji
- Kontekstowe rekomendacje

**Przykład:**
```javascript
ResponseGenerator.generateResponse('recipe_count_by_weight', {
  count: 15,
  totalRecipes: 100,
  recipes: [...] 
})
// Zwraca: "Znaleziono **15 receptur** z 100 całkowitej liczby..."
```

### 4. AIAssistantV2.js
**Cel:** Główny kontroler nowego systemu

**Funkcjonalności:**
- Koordynacja wszystkich komponentów
- Obsługa błędów i fallback
- Metryki wydajności
- Health check systemu

### 5. AIAssistantManager.js
**Cel:** Zarządzanie migracją między systemami

**Funkcjonalności:**
- Porównywanie wydajności v1 vs v2
- Inteligentny routing zapytań
- Analiza statystyk użytkowania
- Stopniowa migracja

## Obsługiwane Zapytania

### ✅ Obsługiwane przez v2.0 (szybkie)

#### Receptury
- "Ile jest receptur w systemie?"
- "Ile receptur ma sumę składników ponad 900g?"
- "Które receptury mają więcej niż 10 składników?"
- "Pokaż analizę wag receptur"

#### Magazyn
- "Ile produktów jest w magazynie?"
- "Które produkty mają niski stan?"
- "Pokaż produkty z wysokim stanem"
- "Jaki jest ogólny status magazynu?"

#### Zamówienia
- "Ile jest zamówień w systemie?"
- "Pokaż status zamówień"
- "Ile zamówień ma każdy klient?"

#### Produkcja
- "Ile zadań produkcyjnych jest w systemie?"
- "Jaki jest status zadań produkcyjnych?"

#### Ogólne
- "Pokaż przegląd systemu"
- "Ile jest dostawców?"
- "Ile jest klientów?"

### ⚠️ Fallback do v1.0 (wolniejsze)
- Złożone analizy wymagające AI
- Zapytania o trendy i predykcje
- Analiza załączonych dokumentów
- Zapytania w języku naturalnym bez struktury

## Integracja

### Automatyczna (już wdrożona)
System automatycznie wybiera najlepszą metodę:

```javascript
// W aiAssistantService.js
export const processAIQuery = async (query, context, userId, attachments) => {
  // 1. Sprawdź czy v2.0 może obsłużyć zapytanie
  if (AIAssistantV2.canHandleQuery(query)) {
    const result = await AIAssistantV2.processQuery(query);
    if (result.success) {
      return result.response; // Szybka odpowiedź
    }
  }
  
  // 2. Fallback do v1.0 (OpenAI API)
  return await processWithOpenAI(query, context, userId, attachments);
}
```

### Ręczna (do testowania)
```javascript
import { AIAssistantManager } from './ai/AIAssistantManager.js';

// Porównanie systemów
const comparison = await AIAssistantManager.compareVersions(
  "Ile receptur ma ponad 900g składników?",
  { userId: 'test-user' }
);

console.log('V2:', comparison.v2.processingTime, 'ms');
console.log('V1:', comparison.v1.processingTime, 'ms');
console.log('Poprawa:', comparison.comparison.speedImprovement);
```

## Testowanie

### Komponent testowy
```jsx
import AIAssistantTest from '../components/AIAssistantTest.js';

// Dodaj do routera lub wyświetl bezpośrednio
<AIAssistantTest />
```

### Programowe testowanie
```javascript
import { AIAssistantV2 } from './ai/AIAssistantV2.js';

// Test pojedynczego zapytania
const result = await AIAssistantV2.processQuery("Ile jest receptur?");
console.log('Odpowiedź:', result.response);
console.log('Czas:', result.processingTime, 'ms');

// Health check
const health = await AIAssistantV2.healthCheck();
console.log('Status:', health.healthy ? 'OK' : 'Problem');
```

## Metryki i Monitoring

### Automatyczne metryki
- Czas przetwarzania każdego zapytania
- Poziom pewności rozpoznania intencji
- Typ użytej metody (v2_optimized / v1_fallback)
- Liczba przetworzonych punktów danych

### Dostępne statystyki
```javascript
const stats = AIAssistantV2.getPerformanceStats();
// {
//   totalQueries: 1247,
//   averageProcessingTime: 347,
//   successRate: 0.94,
//   optimizationImpact: {
//     speedImprovement: '95%',
//     costReduction: '80%'
//   }
// }
```

## Rozszerzenia Systemu

### Dodawanie nowych typów zapytań

1. **Rozszerz QueryParser:**
```javascript
// W patterns dodaj nowy wzorzec
static patterns = {
  // ... istniejące wzorce
  suppliers: /dostawc|supplier/i,
  supplierAnalysis: /analiza.*dostawc|dostawc.*analiza/i
}

// W recognizeIntent dodaj nową logikę
if (this.patterns.suppliers.test(query)) {
  if (this.patterns.supplierAnalysis.test(query)) {
    return 'supplier_analysis';
  }
  return 'supplier_info';
}
```

2. **Rozszerz QueryExecutor:**
```javascript
// Dodaj nową metodę
static async executeSupplierAnalysis(parameters) {
  const suppliersRef = collection(db, 'suppliers');
  const snapshot = await getDocs(suppliersRef);
  
  // Implementuj logikę analizy
  return {
    success: true,
    type: 'analysis',
    analysis: // wyniki analizy
  };
}

// Dodaj do switch w executeQuery
case 'supplier_analysis':
  return await this.executeSupplierAnalysis(parameters);
```

3. **Rozszerz ResponseGenerator:**
```javascript
// Dodaj nowy szablon
static templates = {
  // ... istniejące szablony
  supplier_analysis: {
    detailed: "📊 **Analiza dostawców**\n\n{analysis}"
  }
}

// Dodaj metodę generowania
static generateSupplierAnalysisResponse(result) {
  return this.fillTemplate(this.templates.supplier_analysis.detailed, {
    analysis: this.formatSupplierAnalysis(result.analysis)
  });
}
```

### Cache dla częstych zapytań (TODO)
```javascript
// Planowana implementacja
class CacheManager {
  static cache = new Map();
  static ttl = 5 * 60 * 1000; // 5 minut
  
  static get(key) {
    const item = this.cache.get(key);
    if (item && Date.now() - item.timestamp < this.ttl) {
      return item.data;
    }
    return null;
  }
  
  static set(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }
}
```

## Rozwiązywanie Problemów

### System nie rozpoznaje zapytania
```javascript
// Sprawdź analizę zapytania
const analysis = QueryParser.analyzeQuery("twoje zapytanie");
console.log('Confidence:', analysis.confidence);
console.log('Intent:', analysis.intent);

// Jeśli confidence < 0.5, dodaj nowe wzorce do QueryParser
```

### Błędy w QueryExecutor
```javascript
// Sprawdź dostęp do Firebase
try {
  const result = await QueryExecutor.executeQuery('recipe_count', {});
  console.log('Firebase OK:', result.success);
} catch (error) {
  console.log('Firebase Error:', error.message);
}
```

### Wolne zapytania
```javascript
// Sprawdź które kolekcje są używane
const collections = QueryParser.getRequiredCollections(intent);
console.log('Required collections:', collections);

// Możliwe optymalizacje:
// 1. Dodaj indeksy w Firebase
// 2. Ogranicz pobierane pola
// 3. Dodaj cache dla często używanych danych
```

## Plan Rozwoju

### Faza 1 (Wdrożona) ✅
- [x] Podstawowa architektura
- [x] QueryParser z obsługą głównych intencji
- [x] QueryExecutor z optymalizacjami Firebase
- [x] ResponseGenerator z szablonami
- [x] Integracja z obecnym systemem
- [x] Komponent testowy

### Faza 2 (Planowana)
- [ ] Cache dla często używanych zapytań
- [ ] Bardziej zaawansowane analizy
- [ ] Obsługa zapytań z parametrami dat
- [ ] Eksport wyników do plików
- [ ] Dashboard z metrykami

### Faza 3 (Przyszłość)
- [ ] Machine Learning dla lepszego rozpoznawania intencji
- [ ] Personalizacja odpowiedzi na podstawie historii
- [ ] Proaktywne sugestie optymalizacji
- [ ] Integracja z zewnętrznymi API (pogoda, kursy walut)

## Wsparcie

W przypadku problemów:

1. **Sprawdź health check:** `AIAssistantV2.healthCheck()`
2. **Przeanalizuj zapytanie:** `QueryParser.analyzeQuery(query)`
3. **Przetestuj komponent:** Użyj `AIAssistantTest`
4. **Sprawdź logi:** Console w przeglądarce
5. **Skontaktuj się z zespołem:** Opisz problem z przykładami

---

*Dokument wygenerowany automatycznie przez AI Assistant v2.0* 🤖
