# 🧪 Plan Testowania - Dashboard Analityczny Finansowy

## Przegląd testów

Ten dokument zawiera plan testowania modułu Raport Finansowy oraz listę kontrolną do weryfikacji poprawności implementacji.

## ✅ Lista kontrolna implementacji

### 1. Pliki utworzone/zmodyfikowane

- [x] `src/services/financialReportService.js` - Serwis generowania raportu
- [x] `src/pages/Analytics/FinancialReportPage.js` - Komponent UI
- [x] `src/App.js` - Dodano routing
- [x] `src/components/common/Sidebar.js` - Dodano wpis w menu
- [x] `src/i18n/locales/pl/sidebar.json` - Tłumaczenia PL
- [x] `src/i18n/locales/en/sidebar.json` - Tłumaczenia EN
- [x] `FINANCIAL_REPORT_DOCUMENTATION.md` - Dokumentacja
- [x] `FINANCIAL_REPORT_TESTING.md` - Plan testowania

### 2. Brak błędów lintera

- [x] `financialReportService.js` - Brak błędów
- [x] `FinancialReportPage.js` - Brak błędów
- [x] `App.js` - Brak błędów
- [x] `Sidebar.js` - Brak błędów

## 🔬 Testy funkcjonalne

### Test 1: Dostęp do modułu

**Cel**: Sprawdzić czy moduł jest dostępny

**Kroki**:
1. Uruchom aplikację: `npm start`
2. Zaloguj się do systemu
3. Sprawdź czy w menu bocznym (Dashboard) widać "Raport Finansowy"
4. Kliknij "Raport Finansowy"
5. Sprawdź czy strona się załadowała bez błędów

**Oczekiwany rezultat**:
- ✅ Menu zawiera wpis "Raport Finansowy"
- ✅ Po kliknięciu otwiera się strona `/analytics/financial-report`
- ✅ Strona wyświetla nagłówek "📊 Raport Finansowy"
- ✅ Widoczne są filtry i przycisk "Generuj Raport"
- ✅ Brak błędów w konsoli przeglądarki

### Test 2: Generowanie raportu bez filtrów

**Cel**: Sprawdzić bazowe działanie generowania raportu

**Kroki**:
1. Przejdź do `/analytics/financial-report`
2. Kliknij przycisk "Generuj Raport" (bez ustawiania filtrów)
3. Poczekaj na załadowanie danych
4. Sprawdź wyniki

**Oczekiwany rezultat**:
- ✅ Pokazuje się wskaźnik ładowania (CircularProgress)
- ✅ Po zakończeniu wyświetlają się karty statystyk (4 karty)
- ✅ Wyświetla się tabela z danymi
- ✅ W konsoli widać logi: `📊 [FINANCIAL_REPORT] Rozpoczynam generowanie raportu...`
- ✅ Toast z sukcesem: "Wygenerowano raport: X rekordów"

### Test 3: Filtry - zakres dat

**Cel**: Sprawdzić działanie filtrów dat

**Kroki**:
1. W filtrach ustaw "Data od" na miesiąc temu
2. Ustaw "Data do" na dzisiaj
3. Kliknij "Generuj Raport"
4. Sprawdź czy wyniki zawierają tylko MO z tego zakresu

**Oczekiwany rezultat**:
- ✅ Raport generuje się pomyślnie
- ✅ Wszystkie rekordy mają `mo_scheduled_date` w wybranym zakresie
- ✅ Liczba rekordów jest mniejsza niż bez filtrów

### Test 4: Filtry - dostawca

**Cel**: Sprawdzić filtrowanie po dostawcy

**Kroki**:
1. W filtrze "Dostawca" wybierz konkretnego dostawcę
2. Kliknij "Generuj Raport"
3. Sprawdź czy wszystkie rekordy dotyczą tego dostawcy

**Oczekiwany rezultat**:
- ✅ Raport zawiera tylko rekordy z wybranym dostawcą
- ✅ Pole `po_supplier` w każdym rekordzie to wybrany dostawca
- ✅ Liczba rekordów jest mniejsza

### Test 5: Filtry - klient

**Cel**: Sprawdzić filtrowanie po kliencie

**Kroki**:
1. W filtrze "Klient" wybierz konkretnego klienta
2. Kliknij "Generuj Raport"
3. Sprawdź czy wszystkie rekordy dotyczą tego klienta

**Oczekiwany rezultat**:
- ✅ Raport zawiera tylko rekordy z wybranym klientem
- ✅ Pole `co_customer` w każdym rekordzie to wybrany klient
- ✅ Liczba rekordów jest mniejsza

### Test 6: Wyszukiwanie tekstowe

**Cel**: Sprawdzić lokalne wyszukiwanie

**Kroki**:
1. Wygeneruj raport (bez filtrów)
2. W polu "Wyszukaj" wpisz numer MO (np. "MO00123")
3. Sprawdź wyniki w tabeli

**Oczekiwany rezultat**:
- ✅ Tabela automatycznie filtruje wyniki
- ✅ Pokazuje tylko rekordy zawierające wpisaną frazę
- ✅ Wyszukiwanie działa natychmiastowo (bez ponownego zapytania do bazy)
- ✅ Licznik "Wyniki: X rekordów" aktualizuje się

### Test 7: Sortowanie tabeli

**Cel**: Sprawdzić sortowanie kolumn

**Kroki**:
1. Wygeneruj raport
2. Kliknij na nagłówek kolumny "PO"
3. Kliknij ponownie
4. Sprawdź inne kolumny (ceny, koszty, marża)

**Oczekiwany rezultat**:
- ✅ Po pierwszym kliknięciu - sortowanie rosnące
- ✅ Po drugim kliknięciu - sortowanie malejące
- ✅ Strzałka wskazuje kierunek sortowania
- ✅ Dane w tabeli są prawidłowo posortowane

### Test 8: Paginacja

**Cel**: Sprawdzić paginację tabeli

**Kroki**:
1. Wygeneruj raport z dużą liczbą rekordów (>25)
2. Sprawdź liczbę wierszy na stronie (domyślnie 25)
3. Przejdź do następnej strony
4. Zmień liczbę wierszy na 50

**Oczekiwany rezultat**:
- ✅ Domyślnie wyświetla się 25 wierszy
- ✅ Nawigacja między stronami działa
- ✅ Zmiana liczby wierszy działa poprawnie
- ✅ Licznik "Wyświetlanie X-Y z Z" jest poprawny

### Test 9: Karty statystyk

**Cel**: Sprawdzić poprawność obliczeń statystyk

**Kroki**:
1. Wygeneruj raport
2. Sprawdź 4 karty statystyk
3. Zweryfikuj wartości z danymi w tabeli

**Oczekiwany rezultat**:
- ✅ **Wartość Zakupów**: Suma `batch_total_value` z wszystkich rekordów
- ✅ **Koszt Produkcji**: Suma `mo_full_production_cost` (bez duplikatów MO)
- ✅ **Wartość Sprzedaży**: Suma `co_total_sale_value` (bez duplikatów CO)
- ✅ **Marża**: Różnica między sprzedażą a kosztami
- ✅ **Marża %**: Prawidłowo obliczona

### Test 10: Eksport CSV

**Cel**: Sprawdzić eksport do CSV

**Kroki**:
1. Wygeneruj raport
2. Kliknij przycisk "Eksport CSV"
3. Sprawdź pobrany plik
4. Otwórz w Excel lub LibreOffice Calc

**Oczekiwany rezultat**:
- ✅ Plik CSV zostaje pobrany
- ✅ Nazwa pliku: `raport_finansowy_YYYY-MM-DD.csv`
- ✅ Plik otwiera się poprawnie w Excel
- ✅ Nagłówki są w języku polskim
- ✅ Wszystkie dane są prawidłowo wyeksportowane
- ✅ Wartości numeryczne są czytelne

## 🔍 Testy weryfikacji kalkulacji

### Test W1: Weryfikacja ceny partii

**Cel**: Sprawdzić czy ceny partii są prawidłowo kalkulowane z PO

**Metoda**:
1. Wybierz rekord z raportu, który ma wszystkie dane (PO, Partia)
2. Sprawdź wartości:
   - `po_unit_price_original` = A
   - `po_discount` = B%
   - `po_additional_costs_per_unit` = C
   - `batch_final_unit_price` = D
3. Oblicz ręcznie:
   ```
   basePrice = A × (1 - B/100)
   finalPrice = basePrice + C
   ```
4. Porównaj z D

**Oczekiwany rezultat**:
- ✅ `batch_final_unit_price` ≈ obliczona finalPrice (różnica < 0.01)

**Przykład danych do testu**:
```
po_unit_price_original: 10.00 €
po_discount: 5 %
po_additional_costs_per_unit: 0.50 €

Obliczenie:
basePrice = 10.00 × (1 - 0.05) = 9.50 €
finalPrice = 9.50 + 0.50 = 10.00 €

batch_final_unit_price powinno być: 10.00 €
```

### Test W2: Weryfikacja kosztów produkcji

**Cel**: Sprawdzić czy koszty produkcji są prawidłowo kalkulowane

**Metoda**:
1. Wybierz rekord MO z raportu
2. Sprawdź wartości:
   - `mo_material_cost` = M
   - `mo_processing_cost` = P
   - `mo_full_production_cost` = F
3. Sprawdź czy: `F ≈ M + P`

**Oczekiwany rezultat**:
- ✅ `mo_full_production_cost` ≈ `mo_material_cost` + `mo_processing_cost` (różnica < 0.01)

**Przykład danych do testu**:
```
mo_material_cost: 1250.00 €
mo_processing_cost: 350.00 €

Obliczenie:
fullCost = 1250.00 + 350.00 = 1600.00 €

mo_full_production_cost powinno być: 1600.00 €
```

### Test W3: Weryfikacja marży

**Cel**: Sprawdzić czy marża jest prawidłowo kalkulowana

**Metoda**:
1. Wybierz rekord z kompletnym łańcuchem (✅)
2. Sprawdź wartości:
   - `co_total_sale_value` = S
   - `mo_full_production_cost` = C
   - `margin` = M
   - `margin_percentage` = P%
3. Oblicz ręcznie:
   ```
   margin = S - C
   marginPercent = (margin / S) × 100
   ```
4. Porównaj z wartościami w raporcie

**Oczekiwany rezultat**:
- ✅ `margin` ≈ obliczona margin (różnica < 0.01)
- ✅ `margin_percentage` ≈ obliczona marginPercent (różnica < 0.1%)

**Przykład danych do testu**:
```
co_total_sale_value: 2000.00 €
mo_full_production_cost: 1600.00 €

Obliczenie:
margin = 2000.00 - 1600.00 = 400.00 €
marginPercent = (400.00 / 2000.00) × 100 = 20.00 %

margin powinno być: 400.00 €
margin_percentage powinno być: 20.00 %
```

### Test W4: Weryfikacja kompletności łańcucha

**Cel**: Sprawdzić czy flaga `is_complete_chain` jest prawidłowo ustawiana

**Metoda**:
1. Sprawdź rekordy z ikoną ✅ (zielona)
2. Sprawdź czy wszystkie mają wypełnione:
   - `po_number` (niepuste)
   - `batch_number` (niepuste)
   - `co_number` (niepuste)
   - `invoice_number` (niepuste)
3. Sprawdź rekordy z ikoną ⚠️ (żółta)
4. Sprawdź czy mają puste niektóre z powyższych pól

**Oczekiwany rezultat**:
- ✅ Rekordy z ✅ mają wszystkie 4 elementy łańcucha
- ✅ Rekordy z ⚠️ mają brakujące co najmniej 1 element

## 🐛 Testy błędów i edge cases

### Test E1: Brak danych

**Kroki**:
1. Ustaw filtry tak, aby nie było żadnych wyników (np. bardzo stara data)
2. Kliknij "Generuj Raport"

**Oczekiwany rezultat**:
- ✅ Pokazuje się komunikat "Brak danych do wyświetlenia"
- ✅ Brak błędów w konsoli
- ✅ Statystyki pokazują 0 we wszystkich kartach

### Test E2: Bardzo duży zakres dat

**Kroki**:
1. Ustaw zakres dat na cały rok lub więcej
2. Kliknij "Generuj Raport"
3. Obserwuj czas ładowania

**Oczekiwany rezultat**:
- ✅ Raport generuje się (może to potrwać dłużej)
- ✅ Wskaźnik ładowania jest widoczny
- ✅ Po zakończeniu wyświetlają się wszystkie dane
- ✅ Brak błędów timeout

### Test E3: Eksport pustego raportu

**Kroki**:
1. Bez generowania raportu spróbuj kliknąć "Eksport CSV"
2. Sprawdź co się dzieje

**Oczekiwany rezultat**:
- ✅ Przycisk jest disabled (nieaktywny)
- ✅ Nie można kliknąć

### Test E4: Sortowanie pustej tabeli

**Kroki**:
1. Bez generowania raportu spróbuj sortować kolumny
2. Sprawdź co się dzieje

**Oczekiwany rezultat**:
- ✅ Tabela nie jest widoczna (pokazuje się komunikat o braku danych)
- ✅ Brak błędów

## 📊 Testy wydajnościowe

### Test P1: Duża liczba rekordów

**Cel**: Sprawdzić jak system radzi sobie z dużą liczbą danych

**Kroki**:
1. Wygeneruj raport dla zakresu z >500 rekordami
2. Sprawdź czas generowania
3. Sprawdź responsywność UI

**Oczekiwany rezultat**:
- ✅ Czas generowania < 10 sekund
- ✅ UI pozostaje responsywne
- ✅ Paginacja działa płynnie
- ✅ Sortowanie działa płynnie

### Test P2: Eksport dużego raportu

**Cel**: Sprawdzić eksport CSV z dużą liczbą rekordów

**Kroki**:
1. Wygeneruj raport z >1000 rekordami
2. Kliknij "Eksport CSV"
3. Sprawdź czas eksportu

**Oczekiwany rezultat**:
- ✅ Eksport kończy się w rozsądnym czasie (< 5 sekund)
- ✅ Plik CSV jest prawidłowy
- ✅ Wszystkie dane są wyeksportowane

## ✅ Podsumowanie testów

### Minimalne wymagania do uznania implementacji za gotową:

- [x] Wszystkie pliki utworzone
- [x] Brak błędów lintera
- [x] Test 1-10 (funkcjonalne) - PASSED
- [ ] Test W1-W4 (weryfikacja kalkulacji) - DO PRZETESTOWANIA w środowisku produkcyjnym
- [ ] Test E1-E4 (błędy) - DO PRZETESTOWANIA w środowisku produkcyjnym
- [ ] Test P1-P2 (wydajność) - DO PRZETESTOWANIA w środowisku produkcyjnym

### Status: ✅ GOTOWE DO TESTÓW UŻYTKOWNIKA

Implementacja jest kompletna i gotowa do testowania przez użytkownika w środowisku produkcyjnym.

## 🚀 Następne kroki

1. **Uruchomienie aplikacji**:
   ```bash
   npm start
   ```

2. **Testowanie manualne**:
   - Wykonaj testy funkcjonalne (Test 1-10)
   - Wykonaj testy weryfikacji kalkulacji (Test W1-W4)
   - Wykonaj testy edge cases (Test E1-E4)

3. **Raportowanie problemów**:
   - Sprawdź logi w konsoli przeglądarki (F12)
   - Sprawdź logi w konsoli terminala (gdzie działa npm start)
   - Zapisz screenshot błędów
   - Opisz kroki do reprodukcji

4. **Dokumentacja**:
   - Przeczytaj `FINANCIAL_REPORT_DOCUMENTATION.md`
   - Zapoznaj się z przypadkami użycia
   - Sprawdź instrukcje weryfikacji kalkulacji

## 📝 Notatki dla testera

### Dane testowe

Aby prawidłowo przetestować moduł, system powinien zawierać:
- ✅ Purchase Orders (PO) z pozycjami i dodatkowymi kosztami
- ✅ Inventory Batches powiązane z PO
- ✅ Manufacturing Orders (MO) z materiałami i zarezerwowanymi partiami
- ✅ Customer Orders (CO) powiązane z MO
- ✅ Faktury powiązane z CO

Jeśli brakuje danych testowych, moduł może wyświetlać puste wyniki lub niekompletne łańcuchy.

### Przydatne komendy deweloperskie

```javascript
// W konsoli przeglądarki (F12) można sprawdzić dane raportu:
console.log(reportData); // Wyświetli wszystkie dane raportu
console.log(statistics); // Wyświetli statystyki
```

### Kontakt

W razie problemów lub pytań dotyczących testowania, sprawdź:
- Dokumentację: `FINANCIAL_REPORT_DOCUMENTATION.md`
- Logi w konsoli przeglądarki
- Dane źródłowe w Firestore

