# 🧠 Gemini 2.5 Pro - Implementacja w AI Assistant

## ✅ Co zostało zaimplementowane

### 1. **GeminiQueryOrchestrator.js** - Nowy Orchestrator AI
Utworzono nowy plik `src/services/ai/GeminiQueryOrchestrator.js` który zastępuje OpenAI GPT na Google Gemini 2.5 Pro.

**Kluczowe funkcje:**
- 🧠 **Thinking Mode** - Gemini 2.5 Pro rozumuje przed odpowiedzią
- 🎯 **Function Calling** - Identyczna funkcjonalność jak OpenAI Tool Use
- 📚 **1M tokenów kontekstu** - Gemini 2.5 Pro (2M dla 1.5 Pro)
- ⚡ **Inteligentny wybór modelu** - Automatycznie wybiera najlepszy model dla zapytania
- 💰 **Niższe koszty** - Gemini jest tańszy niż GPT-4o

### 2. **Inteligentny wybór modelu**

System automatycznie wybiera najlepszy model na podstawie zapytania:

| Model | Kiedy używany | Cechy |
|-------|---------------|-------|
| **gemini-2.5-pro** | Złożone analizy, optymalizacje, rekomendacje | 🧠 Thinking mode, 1M tokens, najlepsze rozumowanie |
| **gemini-1.5-pro** | Bardzo duży kontekst (>1M tokens) | 📚 2M tokens, mega kontekst |
| **gemini-2.0-flash-exp** | Proste zapytania (liczby, listy) | ⚡ Szybki, DARMOWY w wersji experimental |

**Przykłady:**

```javascript
// Proste zapytanie → 2.0 Flash (darmowy)
"Ile mamy receptur?"
"Pokaż 10 MO"

// Złożona analiza → 2.5 Pro z Thinking
"Optymalizuj plan produkcji"
"Porównaj rentowność produktów"
"Zaproponuj strategię redukcji kosztów"

// Mega kontekst → 1.5 Pro
"Pokaż wszystkie dane + receptury + MO + CO + PO"
```

### 3. **Funkcja getGeminiApiKey**

Dodano do `src/services/aiAssistantService.js`:

```javascript
export const getGeminiApiKey = async (userId) => {
  // 1. Sprawdź globalny klucz w systemSettings
  // 2. Sprawdź klucz użytkownika w users/{userId}
  // 3. Zwróć null jeśli brak
}
```

**Gdzie przechowywać klucz:**
- **Globalnie**: `settings` → `geminiApiKey` + `useGlobalGeminiKey: true`
- **Per użytkownik**: `users/{userId}` → `geminiApiKey`

### 4. **Aktualizacja processAIQuery**

Zmieniono główną logikę w `src/services/aiAssistantService.js`:
- ❌ ~~`AIQueryOrchestrator` (OpenAI)~~
- ✅ `GeminiQueryOrchestrator` (Gemini)

**Zachowane funkcje:**
- ✅ Function Calling (identyczna funkcjonalność)
- ✅ Targetowane zapytania do Firestore
- ✅ Optymalizacja danych (usuwanie ciężkich pól)
- ✅ Metryki (tokeny, czas, koszt)
- ✅ Wszystkie istniejące narzędzia (tools)

**Nowe funkcje:**
- 🧠 Thinking mode dla 2.5 Pro
- 🎯 Inteligentny wybór modelu
- 📊 Informacja o użytym modelu w odpowiedzi
- 💰 Estymacja kosztu dla Gemini

---

## 🚀 Jak używać

### 1. **Uzyskaj klucz API Gemini**
Przejdź na: https://aistudio.google.com/app/apikey

### 2. **Skonfiguruj klucz w systemie**

**Opcja A: Globalny klucz (dla wszystkich użytkowników)**
```javascript
// W Firestore: settings/system
{
  geminiApiKey: "AIza...",
  useGlobalGeminiKey: true
}
```

**Opcja B: Per użytkownik**
```javascript
// W Firestore: users/{userId}
{
  geminiApiKey: "AIza...",
  // ... inne dane użytkownika
}
```

### 3. **Gotowe! 🎉**
System automatycznie wykryje klucz i zacznie używać Gemini.

---

## 📊 Porównanie: GPT vs Gemini

| Funkcja | GPT-4o-mini | Gemini 2.5 Pro |
|---------|-------------|----------------|
| **Kontekst** | 128k tokens | 1M tokens (8x więcej!) |
| **Thinking Mode** | ❌ Nie | ✅ Tak |
| **Function Calling** | ✅ Tak | ✅ Tak (identyczne API) |
| **Koszt Input** | $0.150 / 1M | $1.25 / 1M |
| **Koszt Output** | $0.600 / 1M | $5.00 / 1M |
| **Szybkość** | ~2-3s | ~2-4s |
| **Jakość** | Bardzo dobra | **Doskonała** (lepsze rozumowanie) |
| **Darmowy model** | ❌ Nie | ✅ Tak (2.0 Flash Exp) |

**Podsumowanie:**
- Gemini 2.5 Pro ma **lepsze rozumowanie** dzięki Thinking Mode
- Gemini ma **8x większy kontekst** (1M vs 128k)
- Gemini oferuje **darmowy model** dla prostych zapytań
- GPT jest **tańszy** dla małych zapytań
- Gemini jest **lepszy** dla złożonych analiz

---

## 🔧 Konfiguracja zaawansowana

### Wymuś konkretny model

Możesz wymusić użycie konkretnego modelu w `aiAssistantService.js`:

```javascript
const orchestratorResult = await GeminiQueryOrchestrator.processQuery(
  query, 
  apiKey, 
  context,
  {
    forceModel: 'gemini-2.5-pro',  // Wymusza 2.5 Pro
    enableThinking: true           // Włącza thinking mode
  }
);
```

### Dostępne modele

```javascript
// Główny model - najlepsze rozumowanie
forceModel: 'gemini-2.5-pro'

// Mega kontekst
forceModel: 'gemini-1.5-pro'

// Szybki i darmowy
forceModel: 'gemini-2.0-flash-exp'

// Szybki płatny
forceModel: 'gemini-1.5-flash'
```

### Wyłącz Thinking Mode

```javascript
const orchestratorResult = await GeminiQueryOrchestrator.processQuery(
  query, 
  apiKey, 
  context,
  {
    enableThinking: false  // Wyłącza thinking mode (szybsze odpowiedzi)
  }
);
```

---

## 📈 Thinking Mode - Co to jest?

**Thinking Mode** to unikalna funkcja Gemini 2.5 Pro, która pozwala modelowi "myśleć" przed udzieleniem odpowiedzi.

**Jak to działa:**
1. Model najpierw **analizuje problem** wewnętrznie
2. Rozważa **różne podejścia**
3. Wybiera **najlepsze rozwiązanie**
4. Dopiero wtedy **generuje odpowiedź**

**Kiedy to pomaga:**
- 🧠 Złożone analizy biznesowe
- 🎯 Optymalizacje i rekomendacje
- 📊 Porównania wielu opcji
- 💡 Strategiczne planowanie

**Przykład:**
```
Zapytanie: "Jak zoptymalizować plan produkcji aby zmniejszyć koszty?"

Bez Thinking:
"Sugeruję zmniejszyć ilość materiałów..."

Z Thinking:
[Model myśli:]
- Analizuję aktualne koszty produkcji
- Rozważam alternatywne dostawców
- Badam możliwość optymalizacji harmonogramu
- Porównuję różne scenariusze

[Odpowiedź:]
"Na podstawie analizy Twoich danych produkcyjnych, oto 3 konkretne działania..."
```

**Włączone domyślnie:** ✅ Tak (dla zapytań wymagających rozumowania)

---

## 🧪 Testowanie

### Sprawdź czy Gemini działa

1. Otwórz AI Assistant
2. Zapytaj: `"ile mamy receptur?"`
3. Sprawdź w konsoli:
   ```
   [processAIQuery] 🎯 Używam Gemini Query Orchestrator
   [processAIQuery] 🤖 Użyty model: gemini-2.0-flash-exp
   ```

### Test złożonego zapytania

1. Zapytaj: `"Porównaj rentowność 5 najczęściej produkowanych produktów"`
2. Sprawdź w konsoli:
   ```
   [GeminiQueryOrchestrator] 🧠 Złożona analiza - używam 2.5 Pro z thinking mode
   [processAIQuery] 🤖 Użyty model: gemini-2.5-pro
   ```

### Test mega kontekstu

1. Zapytaj: `"Pokaż wszystkie receptury + wszystkie MO + wszystkie zamówienia"`
2. Sprawdź w konsoli:
   ```
   [GeminiQueryOrchestrator] 📚 Bardzo duży kontekst - używam 1.5 Pro (2M tokenów)
   [processAIQuery] 🤖 Użyty model: gemini-1.5-pro
   ```

---

## 🐛 Troubleshooting

### Błąd: "Nie znaleziono klucza API Gemini"

**Rozwiązanie:**
1. Sprawdź czy klucz jest zapisany w Firestore:
   - `settings` → `geminiApiKey` + `useGlobalGeminiKey: true`
   - LUB `users/{userId}` → `geminiApiKey`
2. Sprawdź czy klucz zaczyna się od `AIza`
3. Uzyskaj nowy klucz: https://aistudio.google.com/app/apikey

### Błąd: "Gemini API error: 400"

**Możliwe przyczyny:**
1. **Nieprawidłowy klucz API** - Sprawdź czy klucz jest poprawny
2. **Brak uprawnień** - Aktywuj Gemini API w Google Cloud Console
3. **Limit zapytań** - Sprawdź czy nie przekroczyłeś darmowego limitu

**Rozwiązanie:**
- Przejdź do: https://aistudio.google.com/
- Sprawdź status API
- Sprawdź limity i billing

### Błąd: "Response was blocked: SAFETY"

**Przyczyna:** Gemini zablokował odpowiedź z powodów bezpieczeństwa.

**Rozwiązanie:**
1. Przeformułuj zapytanie
2. Usuń potencjalnie wrażliwe treści
3. Spróbuj ponownie

---

## 📝 Changelog

### v4.0 - Gemini 2.5 Pro (Bieżąca wersja)
- ✅ Implementacja GeminiQueryOrchestrator
- ✅ Thinking Mode dla 2.5 Pro
- ✅ Inteligentny wybór modelu
- ✅ Funkcja getGeminiApiKey
- ✅ Aktualizacja processAIQuery
- ✅ Pełna kompatybilność z istniejącymi narzędziami

### v3.0 - AI Query Orchestrator (GPT)
- Targetowane zapytania do bazy
- Function Calling
- Optymalizacja danych

### v2.0 - AI Assistant v2
- Gotowe odpowiedzi
- Cache
- Brak dostępu do bazy

### v1.0 - Pierwotny system
- Pobieranie całej bazy
- Wolne zapytania

---

## 🎯 Następne kroki

1. ✅ **Skonfiguruj klucz API Gemini** w ustawieniach systemu
2. ✅ **Przetestuj** kilka zapytań w AI Assistant
3. ✅ **Porównaj wyniki** z poprzednim systemem GPT
4. 🔜 **Monitoruj koszty** - Gemini ma darmowy limit
5. 🔜 **Optymalizuj** - Dostosuj `selectBestModel()` pod swoje potrzeby

---

## 💡 Wskazówki

### Jak pisać dobre zapytania dla Gemini

**Dobre zapytania:**
- ✅ "Pokaż 10 ostatnich MO"
- ✅ "Które partie wygasają w tym miesiącu?"
- ✅ "Jaka jest rentowność produktu X?"
- ✅ "Porównaj produktywność pracowników"
- ✅ "Zoptymalizuj plan produkcji"

**Złe zapytania:**
- ❌ "Co nowego?" (zbyt ogólne)
- ❌ "Wszystko" (zbyt szerokie)
- ❌ "?" (brak kontekstu)

### Jak wykorzystać Thinking Mode

Dla złożonych zapytań, dodaj słowa kluczowe:
- "optymalizuj"
- "zaproponuj"
- "porównaj szczegółowo"
- "przeanalizuj dokładnie"
- "jak poprawić"
- "rekomenduj"

To sprawi, że Gemini użyje Thinking Mode i udzieli lepszej odpowiedzi.

---

## 📞 Wsparcie

W razie problemów:
1. Sprawdź logi w konsoli przeglądarki
2. Sprawdź czy klucz API jest poprawny
3. Sprawdź dokumentację Gemini: https://ai.google.dev/gemini-api/docs

---

**Wersja:** 4.0  
**Data:** 2025-11-18  
**Status:** ✅ Gotowe do użycia

