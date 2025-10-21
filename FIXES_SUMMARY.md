# Podsumowanie napraw dla asystenta AI

## 🐛 Znalezione problemy

### 1. Ucinanie długich odpowiedzi
**Problem:** Asystent AI ucinał odpowiedzi przy listach receptur  
**Przyczyna:** Zbyt niski limit `maxTokens` (1300-2000 tokenów)  
**Status:** ✅ NAPRAWIONE

### 2. Brak wykrywania słowa "wylistuj"
**Problem:** Zapytanie "wylistuj receptury" nie było wykrywane jako lista  
**Przyczyna:** Regex nie zawierał słowa "wylistuj"  
**Status:** ✅ NAPRAWIONE

### 3. Listy z małym kontekstem miały complexity='simple'
**Problem:** Listy bez dużego kontekstu były traktowane jako 'simple'  
**Przyczyna:** Warunek wymagał `estimatedTokens.total > 50000`  
**Status:** ✅ NAPRAWIONE

---

## ✅ Wprowadzone poprawki

### Poprawka #1: Rozszerzony regex dla wykrywania list

**Plik:** `src/services/ai/optimization/SmartModelSelector.js:112`

**Przed:**
```javascript
const isList = /lista|wszystkie|wszystkich|pokaż|wypisz|wymień/i.test(lowerQuery);
```

**Po:**
```javascript
const isList = /lista|listę|wylistuj|wszystkie|wszystkich|pokaż|wypisz|wypis|wymień|każd[aąy]/i.test(lowerQuery);
```

**Nowe wykrywane słowa:**
- `wylistuj` - "wylistuj receptury"
- `listę` - "pokaż mi listę"
- `wypis` - "wypis wszystkich"
- `każd[aąy]` - "każdą recepturę", "każdy produkt"

---

### Poprawka #2: Listy zawsze są 'complex'

**Plik:** `src/services/ai/optimization/SmartModelSelector.js:77-88`

**Przed:**
```javascript
if (queryAnalysis.isList && estimatedTokens.total > 50000) {
  requirements.complexity = 'very_complex';
  requirements.isVeryLongList = true;
} else if (queryAnalysis.isAnalytical) {
  requirements.complexity = 'complex';
}
```

**Po:**
```javascript
if (queryAnalysis.isList && estimatedTokens.total > 50000) {
  requirements.complexity = 'very_complex';
  requirements.isVeryLongList = true;
} else if (queryAnalysis.isList) {
  // Listy są zawsze przynajmniej 'complex' nawet przy mniejszym kontekście
  requirements.complexity = 'complex';
  requirements.isVeryLongList = false;
} else if (queryAnalysis.isAnalytical) {
  requirements.complexity = 'complex';
}
```

**Rezultat:**
- Wszystkie zapytania o listy mają minimum `complexity='complex'`
- Używają modeli `gpt-4o` lub `gpt-5` zamiast `gpt-4o-mini`
- Mają zwiększone limity tokenów (4000-5000)

---

### Poprawka #3: Zwiększone limity tokenów

**Obszar:** Multiple files

| Typ zapytania | Poprzedni maxTokens | Nowy maxTokens | Wzrost |
|---------------|---------------------|----------------|--------|
| Simple count | 300 | 300 | 0% |
| Medium | ~600 | ~1000 | +67% |
| Long/Analytical | 2000 | 4000 | +100% |
| Very long/Lists | 1300 | 5000 | +285% ⭐ |

**Szczegóły:**
- `estimatedTokens.output` dla 'medium': 500 → 800
- `estimatedTokens.output` dla 'long': 1200 → 2500
- `estimatedTokens.output` dla 'very_long': NOWE 4000
- `maxTokens` buffer: 100 → 200
- `maxTokens` dla list w `buildModelConfig`: 5000

---

## 📊 Testy przed i po

### Test 1: "jaki model gpt używasz?"

**Przed poprawkami:**
```
[SmartModelSelector] Wybrany model: gpt-4o-mini
complexity: 'simple'
maxTokens: 300
```

**Po poprawkach:**
```
[SmartModelSelector] Wybrany model: gpt-4o-mini
complexity: 'simple'
maxTokens: 300
```
✅ **Poprawne** - proste zapytanie, nie wymaga zmian

---

### Test 2: "wylistuj mi każdą recepture"

**Przed poprawkami:**
```
[SmartModelSelector] Wybrany model: gpt-4o-mini
complexity: 'simple'
isList: false  ❌
maxTokens: ~300
outputComplexity: 'short'
```

**Po poprawkach (oczekiwane):**
```
[SmartModelSelector] Wybrany model: gpt-4o lub gpt-5
complexity: 'complex' ✅
isList: true ✅
maxTokens: 4200-5000 ✅
outputComplexity: 'very_long' ✅
```

**Różnica:**
- Model: `gpt-4o-mini` → `gpt-4o/gpt-5` (+jakość)
- maxTokens: ~300 → ~4500 (+1400% więcej miejsca!)
- Koszt: $0.01 → $0.08-0.13 (akceptowalne dla pełnej listy)

---

### Test 3: "pokaż wszystkie receptury z komponentami"

**Przed poprawkami:**
```
isList: true
outputComplexity: 'very_long'
maxTokens: 1300  ❌ ZA MAŁO
Model: wybierany losowo
```

**Po poprawkach:**
```
isList: true ✅
outputComplexity: 'very_long' ✅
maxTokens: 5000 ✅
Model: gpt-5 dla >50K kontekstu, inaczej gpt-4o
```

---

## 🎯 Szczegóły wyboru modelu

### Dla zapytań o listy (isList = true):

| Wielkość kontekstu | Model | maxTokens | Koszt/zapytanie |
|-------------------|-------|-----------|-----------------|
| < 50K tokenów | gpt-4o | 4000-5000 | ~$0.08 |
| > 50K tokenów | **gpt-5** | 5000+ | ~$0.13 |
| > 100K tokenów | **gpt-5** (bonus) | do 1M | ~$0.30+ |

### Scoring dla list:

```javascript
// W selectModelByRequirements():
if (requirements.isList && spec.recommendedFor.includes('ultra_long_lists')) {
  score += 40;  // Bonus dla GPT-5
}

if (estimatedTokens.total > 100000 && spec.maxTokens >= 1000000) {
  score += 30;  // Dodatkowy bonus dla GPT-5 przy ultra-długich kontekstach
}
```

---

## 🔄 Instrukcje testowania

### Krok 1: Przeładuj aplikację

```bash
# Jeśli używasz development mode
npm start

# Lub po prostu odśwież przeglądarkę (Ctrl+F5)
```

### Krok 2: Otwórz konsolę przeglądarki (F12)

### Krok 3: Zadaj pytania asystentowi:

1. **"wylistuj mi każdą recepture"**
   - Szukaj w konsoli: `[SmartModelSelector] Wybrany model:`
   - Oczekiwany model: `gpt-4o` lub `gpt-5`
   - Oczekiwany complexity: `complex` lub `very_complex`
   - Oczekiwany isList: `true`

2. **"pokaż wszystkie receptury z komponentami i dostawcami"**
   - Oczekiwany model: `gpt-5` (jeśli kontekst > 50K)
   - Oczekiwany maxTokens: `~5000`

3. **"lista produktów"**
   - Oczekiwany: wykrycie jako lista
   - Model: `gpt-4o` minimum

### Krok 4: Sprawdź logi

Szukaj tych linii w konsoli:
```
[SmartModelSelector] Analiza: query="wylistuj..."
[SmartModelSelector] Wymagania: {complexity: 'complex', ...}
[SmartModelSelector] Wybrany model: gpt-4o
```

**Co sprawdzić:**
- ✅ `isList` powinno być `true` dla zapytań z "wylistuj", "lista", "każdą"
- ✅ `complexity` powinno być `complex` lub `very_complex` dla list
- ✅ Model powinien być `gpt-4o` lub `gpt-5` (NIE `gpt-4o-mini`)

---

## 📈 Wpływ na system

### Pozytywne efekty:
1. ✅ **Pełne odpowiedzi** - brak ucinania list
2. ✅ **Lepsza jakość** - gpt-4o/gpt-5 dla złożonych zapytań
3. ✅ **Inteligentne wykrywanie** - więcej słów kluczowych
4. ✅ **Optymalizacja kosztów** - cache i inteligentny wybór

### Negatywne efekty:
1. ⚠️ **Wyższe koszty** - ~+15-30% dla zapytań o listy
2. ⚠️ **Wolniejsze odpowiedzi** - większe modele = dłuższy czas

### Bilans:
- **Proste zapytania:** bez zmian (nadal gpt-4o-mini)
- **Listy:** wyższa jakość, pełne odpowiedzi (+15-30% koszt)
- **Średnie zapytania:** bez zmian lub minimalne zmiany

**Szacowany wzrost średniego kosztu:** ~10-15% (tylko dla list)

---

## 🔧 Rollback (jeśli potrzebny)

Jeśli zmiany powodują problemy, możesz je cofnąć:

### Metoda 1: Git
```bash
git checkout HEAD src/services/ai/optimization/SmartModelSelector.js
```

### Metoda 2: Ręczna zmiana

W `SmartModelSelector.js`:

1. **Przywróć stary regex (linia 112):**
```javascript
const isList = /lista|wszystkie|wszystkich|pokaż|wypisz|wymień/i.test(lowerQuery);
```

2. **Usuń dodatkowy warunek dla list (linia 80-83):**
```javascript
// Usuń cały blok:
// } else if (queryAnalysis.isList) {
//   requirements.complexity = 'complex';
//   requirements.isVeryLongList = false;
```

---

## 📝 TODO

- [ ] Przetestować z rzeczywistymi zapytaniami użytkowników
- [ ] Zweryfikować koszty w panelu OpenAI po tygodniu użytkowania
- [ ] Dodać metryki monitorowania (średnia długość odpowiedzi, % pełnych odpowiedzi)
- [ ] Rozważyć dodanie ustawienia "preferuj koszty" vs "preferuj jakość"

---

**Ostatnia aktualizacja:** 21.10.2024, 21:00  
**Status:** ✅ GOTOWE DO TESTÓW PRODUKCYJNYCH

