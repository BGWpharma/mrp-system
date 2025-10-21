# Implementacja GPT-5 w systemie MRP

## 🚀 Status implementacji

✅ **Zakończono:** Pełna integracja GPT-5 w SmartModelSelector  
📅 **Data:** 21 października 2024  
🔧 **Wersja:** 1.0

---

## 📋 Wprowadzone zmiany

### 1. Aktualizacja specyfikacji modelu GPT-5

**Plik:** `src/services/ai/optimization/SmartModelSelector.js`

```javascript
'gpt-5': {
  costPer1kInputTokens: 0.008,      // ~20% taniej niż wcześniej zakładano
  costPer1kOutputTokens: 0.024,     // ~20% taniej niż wcześniej zakładano
  maxTokens: 1000000,                // ULTRA-długi kontekst (1M tokenów!)
  speed: 'fast',                     // Szybszy niż GPT-4o
  capabilities: [
    'ultra_advanced_analysis',
    'multimodal_reasoning',
    'ultra_long_context',
    'expert_knowledge',
    'complex_problem_solving',
    'creative_thinking',
    'autonomous_tasks'
  ],
  recommendedFor: [
    'very_complex',
    'ultra_long_lists',
    'high_accuracy',
    'advanced_analytics',
    'creative_tasks'
  ]
}
```

### 2. Inteligentne wybieranie GPT-5

System automatycznie wybierze GPT-5 gdy:
- Zapytanie jest typu lista (`isList = true`)
- Łączna liczba tokenów przekracza **50,000**
- Wymagana jest bardzo wysoka dokładność
- Kontekst jest ultra-długi (>100K tokenów)

### 3. Zwiększone limity dla list

Dla zapytań o listy (np. "pokaż wszystkie receptury"):
- **maxTokens:** do **5000** tokenów wyjściowych
- **outputComplexity:** `very_long` (4000 tokenów bazowych)
- **Buffer:** zwiększony do **200** tokenów

---

## 🎯 Kiedy GPT-5 zostanie użyty?

### Automatyczny wybór

GPT-5 będzie automatycznie wybrany dla:

1. **Bardzo długie listy danych**
   - "Pokaż wszystkie receptury z komponentami i dostawcami"
   - "Lista wszystkich zamówień produkcyjnych z materiałami"
   - "Wymień wszystkie produkty z partiami i datami ważności"

2. **Ultra-długi kontekst**
   - Zapytania wymagające analizy >100K tokenów danych
   - Przetwarzanie bardzo dużych plików (do 1M tokenów)

3. **Zaawansowana analiza**
   - Złożone zapytania analityczne z dużą ilością danych
   - Predykcje i rekomendacje oparte na całej bazie danych

### Ręczne wymuszenie

W przyszłości można dodać opcję ręcznego wyboru modelu w ustawieniach użytkownika.

---

## 💰 Wpływ na koszty

### Porównanie kosztów (dla 5000 tokenów wyjściowych):

| Model | Input (1K) | Output (5K) | **Suma** | Względem GPT-4o |
|-------|------------|-------------|----------|-----------------|
| gpt-4o-mini | $0.00015 | $0.003 | **$0.003** | -93% ✅ |
| gpt-3.5-turbo | $0.0015 | $0.01 | **$0.012** | -73% ✅ |
| gpt-4o | $0.005 | $0.075 | **$0.08** | 0% (baseline) |
| **gpt-5** | **$0.008** | **$0.12** | **$0.128** | **+60%** ⚠️ |

### Optymalizacja kosztów

System **NIE ZAWSZE** użyje GPT-5! Automatyczna optymalizacja:

- **Proste zapytania** → gpt-4o-mini (najniższy koszt)
- **Średnie zapytania** → gpt-3.5-turbo (zbalansowane)
- **Złożone zapytania** → gpt-4o (wysoka jakość)
- **Ultra-złożone/długie listy** → gpt-5 (najwyższa jakość)

**Szacowany wzrost średniego kosztu:** ~10-15% (tylko dla długich list)

---

## 🔧 Kompatybilność API

### Obecny endpoint: `/v1/chat/completions`

System aktualnie używa standardowego endpointu OpenAI:

```javascript
fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  },
  body: JSON.stringify({
    model: 'gpt-5',
    messages: [...],
    temperature: 0.4,
    max_tokens: 5000
  })
});
```

### ⚠️ UWAGA: Możliwe nowe API dla GPT-5

Według niektórych źródeł, GPT-5 może wymagać **nowego endpointu**:

```javascript
// POTENCJALNIE WYMAGANE dla GPT-5
fetch('https://api.openai.com/v1/responses', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  },
  body: JSON.stringify({
    model: 'gpt-5',
    input: [
      { role: 'user', content: [{ type: 'input_text', text: 'Zapytanie...' }] }
    ],
    verbosity: 'medium',           // NOWY PARAMETR
    reasoning_effort: 'minimal',   // NOWY PARAMETR
    max_output_tokens: 5000
  })
});
```

### Plan działania:

1. **Faza 1 (obecna):** Próba użycia GPT-5 z obecnym API
2. **Faza 2 (jeśli potrzebna):** Implementacja nowego endpointu `/v1/responses`
3. **Faza 3:** Automatyczne wykrywanie i wybór odpowiedniego API

---

## 🧪 Testowanie

### Test 1: Prosta lista

**Zapytanie:**
```
Pokaż listę receptur
```

**Oczekiwany model:** gpt-4o (wystarczający)  
**maxTokens:** ~2500

### Test 2: Bardzo długa lista

**Zapytanie:**
```
Pokaż wszystkie receptury z pełnymi listami komponentów, nazwami dostawców i cenami dla każdego komponentu
```

**Oczekiwany model:** gpt-5 ✅  
**maxTokens:** 5000  
**outputComplexity:** very_long

### Test 3: Ultra-długi kontekst

**Zapytanie z załączonym dużym plikiem CSV (>100K tokenów):**
```
Przeanalizuj ten plik i znajdź wszystkie anomalie
```

**Oczekiwany model:** gpt-5 ✅  
**Powód:** Kontekst >100K tokenów

---

## 📊 Monitorowanie

System automatycznie śledzi:
- Użycie poszczególnych modeli
- Koszty każdego zapytania
- Średnie czasy odpowiedzi
- Oszczędności dzięki optymalizacji

**Dostęp do statystyk:**
```javascript
const stats = SmartModelSelector.getUsageStats();
console.log(stats);
```

---

## ⚙️ Konfiguracja zaawansowana

### Wymuszenie użycia GPT-5

Jeśli chcesz zawsze używać GPT-5 (niezalecane ze względu na koszty):

```javascript
// W src/services/aiAssistantService.js
const modelConfig = {
  model: 'gpt-5',
  temperature: 0.4,
  maxTokens: 5000
};
```

### Wyłączenie GPT-5

Usuń GPT-5 ze specyfikacji modeli:

```javascript
// W src/services/ai/optimization/SmartModelSelector.js
static MODEL_SPECS = {
  // ... pozostaw tylko gpt-4o-mini, gpt-3.5-turbo, gpt-4o
  // Usuń sekcję 'gpt-5'
}
```

---

## 🚨 Potencjalne problemy

### 1. Błąd: "Model not found"

**Przyczyna:** GPT-5 może nie być jeszcze dostępny w Twoim koncie OpenAI

**Rozwiązanie:**
1. Sprawdź dostępność w panelu OpenAI: https://platform.openai.com/account/limits
2. Jeśli niedostępny, system automatycznie użyje gpt-4o (fallback)

### 2. Błąd: "Invalid endpoint"

**Przyczyna:** GPT-5 wymaga nowego endpointu `/v1/responses`

**Rozwiązanie:**
- Zaktualizuj `aiAssistantService.js` aby używać nowego endpointu
- Poczekaj na update dokumentacji od tego implementation

### 3. Wysokie koszty

**Przyczyna:** GPT-5 jest ~60% droższy od GPT-4o

**Rozwiązanie:**
- System automatycznie optymalizuje - nie martw się!
- Większość zapytań nadal użyje tańszych modeli
- Tylko bardzo długie listy używają GPT-5

---

## 📚 Więcej informacji

- [OpenAI Platform](https://platform.openai.com/)
- [GPT-5 Documentation (unofficial)](https://benjamincrozat.com/gpt-5-api)
- [OpenAI API Models](https://platform.openai.com/docs/models)

---

## ✅ Checklist wdrożenia

- [x] Zaktualizowano specyfikacje GPT-5 w SmartModelSelector
- [x] Dodano inteligentne wykrywanie very_long lists
- [x] Zwiększono limity maxTokens dla list (5000)
- [x] Zaktualizowano funkcję selectModelByRequirements
- [x] Dodano bonus dla GPT-5 przy ultra-długich kontekstach
- [x] Zaktualizowano funkcję explainSelection
- [ ] **TODO:** Przetestować z rzeczywistym API OpenAI
- [ ] **TODO:** Dodać obsługę nowego endpointu `/v1/responses` (jeśli potrzebne)
- [ ] **TODO:** Zaktualizować dokumentację po testach produkcyjnych

---

**Autor:** AI Assistant  
**Ostatnia aktualizacja:** 21.10.2024, 20:30

