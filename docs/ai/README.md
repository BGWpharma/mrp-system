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
📖 **Dokumentacja:** [docs/ai/tools-README.md](tools-README.md)

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

### 3. ResponseGenerator.js
**Cel:** Generowanie czytelnych odpowiedzi

### 4. AIAssistantV2.js
**Cel:** Główny kontroler nowego systemu

### 5. AIAssistantManager.js
**Cel:** Zarządzanie migracją między systemami

## Obsługiwane Zapytania

### ✅ Obsługiwane przez v2.0 (szybkie)
- Receptury, Magazyn, Zamówienia, Produkcja
- "Pokaż przegląd systemu", dostawcy, klienci

### ⚠️ Fallback do v1.0 (wolniejsze)
- Złożone analizy wymagające AI
- Zapytania o trendy i predykcje
- Analiza załączonych dokumentów

## Integracja

System automatycznie wybiera najlepszą metodę w `aiAssistantService.js`:
- v2.0 dla prostych zapytań
- Fallback do v1.0 (OpenAI API) dla złożonych

## Wsparcie

W przypadku problemów:
1. Sprawdź health check: `AIAssistantV2.healthCheck()`
2. Przeanalizuj zapytanie: `QueryParser.analyzeQuery(query)`
3. Sprawdź logi w konsoli

---

*Dokument wygenerowany automatycznie przez AI Assistant v2.0* 🤖
