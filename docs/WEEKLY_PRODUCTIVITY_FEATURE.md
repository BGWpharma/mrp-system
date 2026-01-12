# Tygodniówki Wydajności - Dokumentacja

## 📊 Przegląd

Zaimplementowano nową funkcjonalność **"Tygodniówki"** w raporcie MO > Czas produkcji, która umożliwia analizę wydajności produkcji w układzie tygodniowym oraz porównywanie wydajności między tygodniami.

## 🎯 Lokalizacja

**Ścieżka w aplikacji:**
```
Raporty → Raport MO → Czas produkcji → zakładka "Tygodniówki"
```

## 🚀 Funkcjonalności

### 1. **Główne Metryki Tygodniowe**

Dla każdego tygodnia obliczane są następujące metryki:
- **Wydajność** (szt/h) - ilość wyprodukowana na godzinę
- **Łączny czas** (godziny) - suma czasu wszystkich sesji produkcyjnych
- **Wyprodukowana ilość** - suma wyprodukowanych sztuk
- **Liczba sesji** - ilość sesji produkcyjnych
- **Efektywność** (%) - procent wykorzystania dostępnego czasu pracy (zakładając 40h/tydzień)
- **Trend** - porównanie z poprzednim tygodniem (wzrost/spadek/stabilny)

### 2. **Podsumowanie Ogólne**

Wyświetlane są karty z kluczowymi informacjami:
- Średnia wydajność w całym okresie
- Najlepsza wydajność (z informacją o tygodniu)
- Liczba analizowanych tygodni
- Ogólny trend (wydajność rośnie/spada/stabilna)

### 3. **Szybkie Zakresy Dat**

Dropdown z predefiniowanymi zakresami:
- **Ostatnie 4 tygodnie**
- **Ostatnie 8 tygodni** (domyślne)
- **Ostatnie 12 tygodni**
- **Cały rok**
- **Niestandardowy** - pokazuje pola wyboru dat

### 4. **Eksport do CSV**

Przycisk do eksportu wszystkich danych tygodniowych do pliku CSV:
- Automatyczna nazwa pliku z datą: `tygodniowki_YYYY-MM-DD.csv`
- Pełna obsługa polskich znaków (UTF-8 z BOM)
- Zawiera wszystkie kolumny z tabeli

### 5. **Tabela Tygodniowa**

Szczegółowe zestawienie wszystkich tygodni z możliwością:
- **Sortowania** po wszystkich kolumnach (Tydzień, Czas, Ilość, Wydajność, Trend, Efektywność)
- **Sticky header** - nagłówki pozostają widoczne podczas przewijania
- **Rozwijania szczegółów** - kliknięcie przycisku pokazuje:
  - Rozkład dzienny (wykres + tabela)
  - Breakdown według produktów (top 5)
  - Sesje produkcyjne w danym tygodniu
- **Dodawania do porównania** - przycisk w kolumnie "Porównaj" pozwala szybko dodać tydzień do trybu porównania
  - Wizualne wskazówki (badges) pokazują które tygodnie są wybrane
  - Automatyczny wybór poprzedniego tygodnia jako drugi tydzień porównania

### 6. **Wykres Trendu**

Interaktywny wykres liniowy pokazujący:
- Trend wydajności w czasie
- Możliwość wyboru typu wykresu:
  - **Wydajność** (szt/h)
  - **Ilość** (wyprodukowane sztuki)
  - **Czas pracy** (godziny)
  - **Wszystkie** (wykres kompozytowy z wszystkimi metrykami)

### 7. **Tryb Porównania Dwóch Tygodni**

Po włączeniu trybu porównania:
- Wybór dwóch tygodni z dropdownów lub bezpośrednio z tabeli (przycisk "Porównaj")
- **Wykres słupkowy** porównujący 5 kluczowych metryk side-by-side
- **Karty z różnicami procentowymi** dla każdej metryki (kolor zielony/czerwony)
- **Szczegółowe karty** dla każdego z tygodni z pełnymi danymi

## 📁 Struktura Plików

### Nowe pliki:

```
src/
├── services/
│   └── weeklyProductivityService.js          # Serwis logiki biznesowej
│
└── components/production/
    └── WeeklyProductivityTab.js              # Główny komponent UI
```

### Zmodyfikowane pliki:

```
src/
├── components/production/
│   └── ProductionTimeAnalysisTab.js          # Dodano zakładkę "Tygodniówki"
│
└── i18n/locales/
    ├── pl/production.json                     # Dodano tłumaczenia PL
    └── en/production.json                     # Dodano tłumaczenia EN
```

## 🔧 API Serwisu

### `weeklyProductivityService.js`

#### Główne funkcje:

```javascript
// Oblicza metryki wydajności dla tygodnia
calculateWeeklyProductivity(weekData)

// Porównuje dwa tygodnie
compareWeeks(currentWeek, previousWeek)

// Zwraca breakdown produktów/zadań dla tygodnia
getWeeklyBreakdown(sessions, tasksMap)

// Zwraca szczegóły dzienne dla tygodnia
getDailyBreakdown(sessions, weekStart, weekEnd)

// Analizuje trendy w okresie
analyzeWeeklyTrends(weeksData)

// Przygotowuje wzbogacone dane tygodniowe
prepareWeeklyData(timeAnalysis, tasksMap)

// Generuje insights/alerty
generateWeeklyInsights(weeksData)

// Formatuje string tygodnia na czytelny format
formatWeekString(weekString)
```

## 📊 Obliczenia

### Wydajność:
```
Wydajność = Łączna ilość / (Łączny czas w minutach / 60)
```

### Efektywność:
```
Efektywność = (Łączny czas w godzinach / 40h) * 100%
```
*Zakładamy standardowy tydzień pracy = 40 godzin*

### Trend:
```
Trend = ((Wydajność bieżąca - Wydajność poprzednia) / Wydajność poprzednia) * 100%

- improving: trend > +5%
- declining: trend < -5%
- stable: trend między -5% a +5%
```

## 🎨 Komponenty UI

### `WeeklyProductivityTab`
Główny komponent zawierający:
- Insights/alerty
- Karty podsumowania
- Przyciski akcji (porównanie, wybór wykresu)
- Panel porównania (opcjonalny)
- Wykres trendu
- Tabela tygodni

### `WeekComparisonCard`
Karta porównania pojedynczego tygodnia w trybie porównania

### `WeekDetailsPanel`
Rozwijany panel szczegółów dla wybranego tygodnia

## 🌍 Internacjonalizacja

Dodano pełne wsparcie dla języków:
- Polski (pl)
- Angielski (en)

Wszystkie teksty są przetłumaczone i dostępne w plikach:
- `src/i18n/locales/pl/production.json` → sekcja `weeklyProductivity`
- `src/i18n/locales/en/production.json` → sekcja `weeklyProductivity`

## 📈 Wykorzystywane Dane

System wykorzystuje dane z:
- **`timeAnalysis.timeByWeek`** - zagregowane dane tygodniowe
- **`timeAnalysis.sessions`** - szczegółowe sesje produkcyjne
- **`tasksMap`** - informacje o zadaniach produkcyjnych (MO)

## 🔍 Filtrowanie

Dane tygodniowe są automatycznie filtrowane według:
- Zakresu dat wybranego w głównym komponencie
- Wybranych filtrów (zadanie, klient) - jeśli aktywne w zakładce "Analiza czasu"

## 🎯 Przypadki Użycia

### 1. Analiza wydajności w czasie
Manager produkcji chce zobaczyć jak zmieniała się wydajność w ostatnich 8 tygodniach.

### 2. Porównanie wydajności między tygodniami
Porównanie wydajności z ubiegłego tygodnia z tygodniem przed wakacjami.

### 3. Identyfikacja problemów
Szybkie wykrycie spadku wydajności dzięki alertom i trendom.

### 4. Analiza produktów
Sprawdzenie które produkty zajmują najwięcej czasu produkcji w danym tygodniu.

### 5. Planowanie zasobów
Na podstawie historycznej wydajności można lepiej planować przyszłe zlecenia.

## 🚀 Możliwe Rozszerzenia

### Krótkoterminowe:
- Filtrowanie tylko produktów/klientów
- Porównanie 3+ tygodni jednocześnie
- Export wykresu do obrazu

### Średnioterminowe:
- Benchmark (docelowa wydajność)
- Wykrywanie wzorców sezonowych
- Analiza przyczyn spadków (korelacja z innymi danymi)

### Długoterminowe:
- Predykcja wydajności na podstawie ML
- Automatyczne sugestie optymalizacji
- Gamification (rankingi, osiągnięcia)

## 🐛 Troubleshooting

### Brak danych
- Upewnij się, że w wybranym okresie są zarejestrowane sesje produkcyjne
- Sprawdź czy sesje mają wypełnione pole `quantity` i `timeSpent`

### Błędne obliczenia
- Sprawdź czy sesje mają poprawne daty (`startTime`, `endTime`)
- Zweryfikuj czy zadania są poprawnie powiązane z sesjami

### Problemy z wyświetlaniem
- Sprawdź konsole przeglądarki pod kątem błędów
- Upewnij się, że wszystkie zależności są zainstalowane

## 📝 Changelog

### Wersja 1.1.0 (2026-01-12)
- ✅ Szybkie zakresy dat (4/8/12 tygodni, cały rok)
- ✅ Eksport do CSV z polskimi znakami
- ✅ Sortowanie wszystkich kolumn tabeli
- ✅ Sticky header w tabeli
- ✅ Loading states podczas ładowania danych
- ✅ Dodawanie tygodni do porównania z tabeli
- ✅ Wykres porównawczy dla dwóch tygodni
- ❌ Usunięto automatyczne spostrzeżenia (insights)
- ❌ Usunięto funkcję drukowania

### Wersja 1.0.0 (2026-01-12)
- ✅ Podstawowe metryki tygodniowe
- ✅ Tabela z rozwijalnymi szczegółami
- ✅ Wykres trendu wydajności
- ✅ Porównanie dwóch tygodni
- ✅ Breakdown dzienny i według produktów
- ✅ Pełna internacjonalizacja (PL/EN)

## 👥 Autorzy

Implementacja: AI Assistant
Data: 2026-01-12

---

**Status:** ✅ Zaimplementowane, przetestowane i zoptymalizowane (v1.1.0)
**Kompilacja:** ✅ Bez błędów lintera

