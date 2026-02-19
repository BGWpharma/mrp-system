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

### 3. **Funkcja getGeminiApiKey**

Dodano do `src/services/aiAssistantService.js`:
- Sprawdza globalny klucz w systemSettings
- Sprawdza klucz użytkownika w users/{userId}

**Gdzie przechowywać klucz:**
- **Globalnie**: `settings` → `geminiApiKey` + `useGlobalGeminiKey: true`
- **Per użytkownik**: `users/{userId}` → `geminiApiKey`

### 4. **Aktualizacja processAIQuery**

Zmieniono główną logikę w `src/services/aiAssistantService.js`:
- ❌ ~~AIQueryOrchestrator (OpenAI)~~
- ✅ GeminiQueryOrchestrator (Gemini)

---

## 🚀 Jak używać

### 1. Uzyskaj klucz API Gemini
Przejdź na: https://aistudio.google.com/app/apikey

### 2. Skonfiguruj klucz w systemie

**Opcja A: Globalny klucz**
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

### 3. Gotowe! 🎉

---

## 📊 Porównanie: GPT vs Gemini

| Funkcja | GPT-4o-mini | Gemini 2.5 Pro |
|---------|-------------|----------------|
| **Kontekst** | 128k tokens | 1M tokens (8x więcej!) |
| **Thinking Mode** | ❌ Nie | ✅ Tak |
| **Function Calling** | ✅ Tak | ✅ Tak (identyczne API) |
| **Jakość** | Bardzo dobra | **Doskonała** (lepsze rozumowanie) |
| **Darmowy model** | ❌ Nie | ✅ Tak (2.0 Flash Exp) |

---

## 🐛 Troubleshooting

### Błąd: "Nie znaleziono klucza API Gemini"
1. Sprawdź czy klucz jest zapisany w Firestore
2. Sprawdź czy klucz zaczyna się od `AIza`
3. Uzyskaj nowy klucz: https://aistudio.google.com/app/apikey

### Błąd: "Gemini API error: 400"
- Nieprawidłowy klucz API
- Brak uprawnień - Aktywuj Gemini API w Google Cloud Console
- Limit zapytań

### Błąd: "Response was blocked: SAFETY"
- Przeformułuj zapytanie
- Usuń potencjalnie wrażliwe treści

---

## 📝 Changelog

### v4.0 - Gemini 2.5 Pro (Bieżąca wersja)
- ✅ Implementacja GeminiQueryOrchestrator
- ✅ Thinking Mode dla 2.5 Pro
- ✅ Inteligentny wybór modelu
- ✅ Funkcja getGeminiApiKey
- ✅ Aktualizacja processAIQuery

---

**Wersja:** 4.0  
**Data:** 2025-11-18  
**Status:** ✅ Gotowe do użycia
