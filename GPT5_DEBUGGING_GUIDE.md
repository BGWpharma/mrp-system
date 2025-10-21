# GPT-5 Debugging Guide

## 🔍 Problem

GPT-5 zwracał puste odpowiedzi mimo braku błędów API.

## ✅ Zaimplementowane rozwiązania

### 1. Dodane wymagane parametry GPT-5

```javascript
// Dla GPT-5:
{
  model: "gpt-5",
  messages: [...],
  max_completion_tokens: 5000,
  reasoning_effort: 'medium',  // NOWY PARAMETR
  verbosity: 'medium'          // NOWY PARAMETR
}
```

### Znaczenie parametrów:

**`reasoning_effort`** - kontroluje czas i głębokość rozumowania modelu:
- `low` - szybkie odpowiedzi, podstawowe rozumowanie
- `medium` - zbalansowane (domyślnie)
- `high` - dokładne rozumowanie, dłuższy czas odpowiedzi

**`verbosity`** - kontroluje długość i szczegółowość odpowiedzi:
- `low` - zwięzłe odpowiedzi
- `medium` - zbalansowane (domyślnie)
- `high` - bardzo szczegółowe odpowiedzi

---

### 2. Dodane szczegółowe logowanie

#### Logi parametrów zapytania:
```
[GPT-5] Parametry zapytania: {
  max_completion_tokens: 5000,
  reasoning_effort: 'medium',
  verbosity: 'medium'
}
```

#### Logi debugowania odpowiedzi:
```
[GPT-5 DEBUG] Pełna odpowiedź API: {...}
[GPT-5 DEBUG] data.choices: [...]
[GPT-5 DEBUG] data.choices[0]: {...}
[GPT-5 DEBUG] data.choices[0].message: {...}
[GPT-5 DEBUG] data.choices[0].message.content: "..."
```

#### Logi błędów:
```
[API Error] Status: 400
[API Error] Message: ...
[API Error] Full error data: {...}
```

---

### 3. Ulepszona obsługa błędów

**Sprawdzanie struktury odpowiedzi:**
```javascript
if (!data.choices || !data.choices[0] || !data.choices[0].message) {
  throw new Error('API zwróciło odpowiedź w nieoczekiwanym formacie');
}
```

**Sprawdzanie pustej zawartości:**
```javascript
if (!content || content.trim() === '') {
  throw new Error('API zwróciło pustą odpowiedź');
}
```

---

## 🧪 Jak debugować

### Krok 1: Przeładuj aplikację
```
Ctrl+F5 (lub Cmd+Shift+R na Mac)
```

### Krok 2: Otwórz konsolę (F12)

### Krok 3: Wyczyść logi
```
Clear console (ikona 🚫 lub Ctrl+L)
```

### Krok 4: Zadaj pytanie
```
wylistuj mi wszystkie receptury
```

### Krok 5: Szukaj w logach

#### A) Parametry zapytania GPT-5:
```
[GPT-5] Parametry zapytania: {...}
```
✅ **Sprawdź czy** zawiera `reasoning_effort` i `verbosity`

#### B) Odpowiedź API:
```
[GPT-5 DEBUG] Pełna odpowiedź API: {...}
```
✅ **Skopiuj tę odpowiedź** - pokaż mi jeśli nadal nie działa

#### C) Czy są błędy?
```
[API Error] ...
```
❌ **Jeśli tak** - skopiuj pełny błąd

---

## 📊 Możliwe scenariusze

### Scenariusz 1: ✅ GPT-5 działa!

**Logi:**
```
[GPT-5] Parametry zapytania: {...}
[GPT-5 DEBUG] data.choices[0].message.content: "Oto lista wszystkich receptur:..."
Otrzymano odpowiedź z API OpenAI
```

**Akcja:** Gratulacje! GPT-5 działa poprawnie.

---

### Scenariusz 2: ❌ Błąd "model not found"

**Logi:**
```
[API Error] Status: 404
[API Error] Message: The model 'gpt-5' does not exist
```

**Przyczyna:** GPT-5 nie jest dostępny w Twoim koncie OpenAI

**Rozwiązanie:** 
1. Sprawdź dostępność: https://platform.openai.com/account/limits
2. Jeśli nie masz dostępu, będziemy musieli użyć GPT-4o

---

### Scenariusz 3: ❌ Błąd parametrów

**Logi:**
```
[API Error] Status: 400
[API Error] Message: Unsupported parameter: 'reasoning_effort'...
```

**Przyczyna:** GPT-5 w Twoim API nie wspiera tych parametrów (inna wersja?)

**Rozwiązanie:** Usuniemy `reasoning_effort` i `verbosity`

---

### Scenariusz 4: ❌ Pusta odpowiedź mimo braku błędów

**Logi:**
```
[GPT-5 DEBUG] data.choices[0].message.content: ""
[API Error] Pusta zawartość w odpowiedzi
```

**Przyczyna:** GPT-5 zwraca pustą string w `content`

**Rozwiązanie:** Sprawdzimy czy dane są w innym polu (np. `data.output`)

---

### Scenariusz 5: ❌ Inna struktura odpowiedzi

**Logi:**
```
[GPT-5 DEBUG] Pełna odpowiedź API: {
  "output": "...",  // Zamiast choices
  "completion": "..."
}
```

**Przyczyna:** GPT-5 używa innej struktury odpowiedzi niż poprzednie modele

**Rozwiązanie:** Zaktualizujemy kod aby odczytywać z właściwego pola

---

## 🔧 Dostosowywanie parametrów

### Jeśli odpowiedzi są za krótkie:
```javascript
requestBody.verbosity = 'high';  // Zamiast 'medium'
```

### Jeśli odpowiedzi są za wolne:
```javascript
requestBody.reasoning_effort = 'low';  // Zamiast 'medium'
```

### Jeśli potrzebujesz najwyższej jakości:
```javascript
requestBody.reasoning_effort = 'high';
requestBody.verbosity = 'high';
```

---

## 📋 Checklist debugowania

Po przeładowaniu aplikacji sprawdź:

- [ ] W konsoli widzisz `[GPT-5] Parametry zapytania`
- [ ] Parametry zawierają `reasoning_effort` i `verbosity`
- [ ] Widzisz `[GPT-5 DEBUG] Pełna odpowiedź API`
- [ ] W odpowiedzi jest pole `choices`
- [ ] W `choices[0].message.content` jest tekst
- [ ] Asystent wyświetla odpowiedź w UI

---

## 🚨 Jeśli nadal nie działa

1. **Skopiuj wszystkie logi** zaczynające się od `[GPT-5]` lub `[API Error]`
2. **Skopiuj pełną odpowiedź API** z `[GPT-5 DEBUG] Pełna odpowiedź API`
3. **Pokaż mi te logi** - zdiagnozuję dokładny problem

---

## 📚 Dokumentacja referencyjna

- **Parametry:** reasoning_effort, verbosity
- **Struktura odpowiedzi:** Zgodna z OpenAI Chat Completions API
- **Endpoint:** `https://api.openai.com/v1/chat/completions`

---

---

## 🎯 FINALNA IMPLEMENTACJA (REASONING TOKENS FIX)

### Problem wykryty:
GPT-5 używał **wszystkich 4200 tokenów na wewnętrzne rozumowanie** (reasoning_tokens), pozostawiając **0 tokenów na faktyczną odpowiedź** (output).

### Rozwiązanie:
1. **Zwiększono `max_completion_tokens` do 20000** w `aiAssistantService.js`
2. **Zmieniono `verbosity` na 'high'** dla pełniejszych odpowiedzi
3. **Dodano monitoring użycia tokenów** - szczegółowe logi pokazują podział reasoning/output
4. **Zaktualizowano `SmartModelSelector.js`** - osobne limity dla GPT-5 (20k dla list, 15k dla analiz)

### Kluczowe zmiany:

**aiAssistantService.js:**
```javascript
if (isGPT5) {
  requestBody.max_completion_tokens = 20000;  // Zamiast 4200!
  requestBody.reasoning_effort = 'medium';
  requestBody.verbosity = 'high';  // Zamiast 'medium'
}
```

**SmartModelSelector.js:**
```javascript
if (queryAnalysis.isList) {
  if (modelName === 'gpt-5') {
    maxTokens = 20000;  // GPT-5: reasoning + output
  } else {
    maxTokens = 5000;   // Inne modele
  }
}
```

### Nowe logi debugowania:
```
[GPT-5 DEBUG] 📊 Użycie tokenów: {
  prompt_tokens: 23231,
  completion_tokens: 18500,
  reasoning_tokens: 10200,
  output_tokens: 8300,     // ✅ TERAZ JEST MIEJSCE NA ODPOWIEDŹ!
  finish_reason: 'stop'
}
```

---

**Status:** ✅ ZAIMPLEMENTOWANE  
**Data:** 21.10.2024, 23:05  
**Następny krok:** TEST - przeładuj aplikację i zapytaj "wylistuj wszystkie receptury"

