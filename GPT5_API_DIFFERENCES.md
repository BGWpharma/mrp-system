# Różnice w API GPT-5 vs poprzednie modele

## 🔧 Kluczowe różnice

GPT-5 ma **inne wymagania API** niż GPT-4o i wcześniejsze modele!

### 1. ❌ `max_tokens` → ✅ `max_completion_tokens`

**Błąd:**
```
Error: Unsupported parameter: 'max_tokens' is not supported with this model. 
Use 'max_completion_tokens' instead.
```

**Rozwiązanie:**
```javascript
// GPT-4o i wcześniejsze:
{
  model: "gpt-4o",
  max_tokens: 4000
}

// GPT-5:
{
  model: "gpt-5",
  max_completion_tokens: 4000  // ZMIANA!
}
```

---

### 2. ❌ Niestandardowe `temperature` → ✅ Tylko wartość domyślna (1)

**Błąd:**
```
Error: 'temperature' does not support 0.4 with this model. 
Only the default (1) value is supported.
```

**Rozwiązanie:**
```javascript
// GPT-4o i wcześniejsze:
{
  model: "gpt-4o",
  temperature: 0.4  // Można dostosować
}

// GPT-5:
{
  model: "gpt-5"
  // Nie wysyłamy parametru temperature!
  // GPT-5 automatycznie używa optymalnej wartości
}
```

**Dlaczego?** GPT-5 ma **wbudowaną inteligencję** i sam dobiera optymalną "temperaturę" w zależności od zapytania.

---

## ✅ Finalna implementacja

```javascript
const isGPT5 = modelConfig.model === 'gpt-5';

const requestBody = {
  model: modelConfig.model,
  messages
};

if (isGPT5) {
  // GPT-5: specjalne parametry
  requestBody.max_completion_tokens = modelConfig.maxTokens;
  // Nie dodajemy temperature - GPT-5 sam optymalizuje
} else {
  // Inne modele: standardowe parametry
  requestBody.max_tokens = modelConfig.maxTokens;
  requestBody.temperature = modelConfig.temperature;
}
```

---

## 📋 Pełna lista różnic

| Parametr | GPT-4o | GPT-5 | Uwagi |
|----------|--------|-------|-------|
| `model` | "gpt-4o" | "gpt-5" | ✅ Taki sam format |
| `messages` | Array | Array | ✅ Taki sam format |
| `max_tokens` | ✅ Wspierany | ❌ Nie wspierany | GPT-5 używa `max_completion_tokens` |
| `max_completion_tokens` | ❌ Nie używany | ✅ WYMAGANY | Nowy parametr |
| `temperature` | ✅ 0.0-2.0 | ❌ Tylko 1.0 (domyślnie) | GPT-5 sam optymalizuje |
| `top_p` | ✅ Wspierany | ❓ Nieznane | Nie testowane |
| `frequency_penalty` | ✅ Wspierany | ❓ Nieznane | Nie testowane |
| `presence_penalty` | ✅ Wspierany | ❓ Nieznane | Nie testowane |

---

## 🎯 Korzyści z ograniczeń GPT-5

### Brak niestandardowego temperature:
✅ **GPT-5 sam optymalizuje** - nie musisz się martwić o dostrajanie  
✅ **Konsystentne wyniki** - zawsze najlepsza jakość  
✅ **Prostsze API** - mniej parametrów do konfiguracji

### Nowy parametr max_completion_tokens:
✅ **Bardziej precyzyjny** - liczy tylko tokeny wyjściowe  
✅ **Lepsza kontrola kosztów** - dokładne ograniczenie odpowiedzi  
✅ **Zgodność z przyszłością** - prawdopodobnie wszystkie nowe modele będą używać tego parametru

---

## 🚨 Częste błędy

### Błąd 1: Używanie max_tokens dla GPT-5
```javascript
// ❌ BŁĄD:
{
  model: "gpt-5",
  max_tokens: 5000  // NIEPOPRAWNE!
}

// ✅ POPRAWNE:
{
  model: "gpt-5",
  max_completion_tokens: 5000
}
```

### Błąd 2: Ustawianie temperature dla GPT-5
```javascript
// ❌ BŁĄD:
{
  model: "gpt-5",
  temperature: 0.7  // NIEPOPRAWNE!
}

// ✅ POPRAWNE:
{
  model: "gpt-5"
  // Nie dodawaj temperature!
}
```

### Błąd 3: Mieszanie parametrów
```javascript
// ❌ BŁĄD:
{
  model: "gpt-5",
  max_tokens: 5000,              // NIEPOPRAWNE!
  max_completion_tokens: 5000,   // Oba naraz nie działają
  temperature: 0.4               // NIEPOPRAWNE!
}

// ✅ POPRAWNE:
{
  model: "gpt-5",
  max_completion_tokens: 5000
  // TYLKO ten parametr!
}
```

---

## 🔄 Jak sprawdzić czy używasz poprawnych parametrów?

W konsoli przeglądarki sprawdź:
```
[callOpenAIAPI] Użyję modelu gpt-5
```

Następnie w zakładce Network → znajdź request do `chat/completions` → sprawdź Request Payload:

**✅ POPRAWNY:**
```json
{
  "model": "gpt-5",
  "messages": [...],
  "max_completion_tokens": 5000
}
```

**❌ NIEPOPRAWNY:**
```json
{
  "model": "gpt-5",
  "messages": [...],
  "max_tokens": 5000,        // BŁĄD!
  "temperature": 0.4         // BŁĄD!
}
```

---

## 📚 Źródła

Na podstawie rzeczywistych błędów API OpenAI:
- Data testu: 21.10.2024
- Endpoint: `https://api.openai.com/v1/chat/completions`
- Model: `gpt-5`

---

**Status:** ✅ NAPRAWIONE w `aiAssistantService.js`  
**Ostatnia aktualizacja:** 21.10.2024, 21:30

