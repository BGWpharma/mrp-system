# 📊 Dashboard Analityczny Finansowy - Dokumentacja

## Przegląd

Moduł **Raport Finansowy** to kompleksowy dashboard analityczny, który umożliwia weryfikację kalkulacji kosztów i cen w całym łańcuchu operacji biznesowych:

```
PO (Purchase Orders) → Partia (Inventory Batch) → MO (Manufacturing Orders) → CO (Customer Orders) → Faktura (Invoice)
```

## Lokalizacja w systemie

- **URL**: `/analytics/financial-report`
- **Menu**: Dashboard → Raport Finansowy
- **Dostęp**: Dla wszystkich zalogowanych użytkowników

## Pliki zaimplementowane

### 1. Serwis (Backend Logic)
- **Ścieżka**: `src/services/financialReportService.js`
- **Funkcje**:
  - `generateFinancialReport(filters)` - Generuje raport z danymi z całego łańcucha
  - `exportReportToCSV(reportData)` - Eksportuje dane do pliku CSV
  - `getReportStatistics(reportData)` - Oblicza statystyki agregowane
  - `getFilterOptions()` - Pobiera opcje dla filtrów (dostawcy, klienci)

### 2. Komponent UI (Frontend)
- **Ścieżka**: `src/pages/Analytics/FinancialReportPage.js`
- **Funkcjonalności**:
  - Filtry: zakres dat, dostawca, klient, status MO, wyszukiwanie tekstowe
  - Karty statystyk: wartość zakupów, koszt produkcji, wartość sprzedaży, marża
  - Tabela z paginacją i sortowaniem
  - Eksport do CSV

### 3. Routing
- **Plik**: `src/App.js`
- **Route**: `<Route path="/analytics/financial-report" element={<PrivateLayout><FinancialReportPage /></PrivateLayout>} />`

### 4. Menu nawigacji
- **Plik**: `src/components/common/Sidebar.js`
- **Wpis**: Dashboard → Raport Finansowy

### 5. Tłumaczenia
- **Pliki**:
  - `src/i18n/locales/pl/sidebar.json`
  - `src/i18n/locales/en/sidebar.json`

## Struktura danych w raporcie

### Kolumny w tabeli CSV

#### Grupa PO (Purchase Order)
- `po_number` - Numer zamówienia zakupowego
- `po_date` - Data zamówienia
- `po_supplier` - Dostawca
- `po_item_name` - Nazwa pozycji
- `po_item_quantity` - Ilość zamówiona
- `po_unit_price_original` - Oryginalna cena jednostkowa
- `po_discount` - Rabat (%)
- `po_base_unit_price` - Cena bazowa po rabacie
- `po_additional_costs_per_unit` - Dodatkowe koszty/jednostkę

#### Grupa Batch (Partia)
- `batch_number` - Numer partii/LOT
- `batch_quantity` - Ilość w partii
- `batch_reserved_quantity` - Ilość zarezerwowana dla MO
- `batch_final_unit_price` - **⭐ Cena końcowa jednostkowa**
- `batch_total_value` - Wartość całkowita partii

#### Grupa Material (Materiał w MO)
- `material_name` - Nazwa materiału
- `material_required_quantity` - Wymagana ilość
- `material_unit` - Jednostka

#### Grupa MO (Manufacturing Order)
- `mo_number` - Numer zlecenia produkcyjnego
- `mo_product` - Nazwa produktu
- `mo_quantity` - Ilość planowana
- `mo_completed_quantity` - Ilość wyprodukowana
- `mo_material_cost` - **⭐ Koszt materiałów**
- `mo_processing_cost` - **⭐ Koszt procesowy**
- `mo_full_production_cost` - **⭐ Pełny koszt produkcji**
- `mo_unit_cost` - Koszt jednostkowy
- `mo_status` - Status
- `mo_scheduled_date` - Data

#### Grupa CO (Customer Order)
- `co_number` - Numer zamówienia klienta
- `co_customer` - Klient
- `co_item_name` - Nazwa pozycji
- `co_item_quantity` - Ilość
- `co_sale_price` - **⭐ Cena sprzedaży jednostkowa**
- `co_total_sale_value` - **⭐ Wartość całkowita sprzedaży**
- `co_status` - Status
- `co_order_date` - Data

#### Grupa Invoice (Faktura)
- `invoice_number` - Numer faktury
- `invoice_total` - Wartość faktury
- `invoice_payment_status` - Status płatności
- `invoice_issue_date` - Data wystawienia
- `invoice_total_paid` - Zapłacono

#### Analiza rentowności
- `margin` - **⭐ Marża** (wartość sprzedaży - koszt produkcji)
- `margin_percentage` - **⭐ Marża %**
- `is_complete_chain` - Czy kompletny łańcuch danych (wszystkie elementy są obecne)

## Logika kalkulacji - Weryfikacja

### 1. Cena partii (Batch Price)

**Formuła**:
```
batch_final_unit_price = po_base_unit_price + po_additional_costs_per_unit

gdzie:
po_base_unit_price = po_unit_price_original × (1 - po_discount/100)
po_additional_costs_per_unit = (additionalCosts_total × batchQuantity/totalQuantity) / batchQuantity
```

**Weryfikacja**:
```javascript
✅ batch_final_unit_price ≈ po_base_unit_price + po_additional_costs_per_unit
✅ po_base_unit_price ≈ po_unit_price_original × (1 - po_discount/100)
```

**Lokalizacja kodu źródłowego**: 
- `src/services/purchaseOrderService.js` linie 2732-2757

### 2. Koszt produkcji MO

**Formuła**:
```
mo_material_cost = Σ (ilość_materiału × średnia_cena_ważona_z_partii)
mo_processing_cost = processingCostPerUnit × mo_completed_quantity
mo_full_production_cost = mo_material_cost + mo_processing_cost
```

**Średnia cena ważona z partii**:
```
averagePrice = Σ(batchPrice × batchQuantity) / Σ(batchQuantity)
```

**Weryfikacja**:
```javascript
✅ mo_full_production_cost ≈ mo_material_cost + mo_processing_cost
✅ mo_material_cost = suma kosztów wszystkich materiałów
✅ mo_unit_cost = mo_full_production_cost / mo_quantity
```

**Lokalizacja kodu źródłowego**: 
- `src/services/productionService.js` linie 5025-5281

### 3. Marża i rentowność

**Formuła**:
```
margin = co_total_sale_value - mo_full_production_cost
margin_percentage = (margin / co_total_sale_value) × 100
```

**Weryfikacja**:
```javascript
✅ margin = co_total_sale_value - mo_full_production_cost
✅ margin_percentage = (margin / co_total_sale_value) × 100
```

### 4. Kompletność łańcucha

Rekord jest oznaczony jako `is_complete_chain = true` jeśli:
- ✅ Istnieje PO (Purchase Order)
- ✅ Istnieje Partia (Batch)
- ✅ Istnieje CO (Customer Order)
- ✅ Istnieje Faktura (Invoice)

## Instrukcja użycia

### Krok 1: Dostęp do raportu

1. Zaloguj się do systemu
2. Z menu bocznego wybierz: **Dashboard → Raport Finansowy**
3. Lub przejdź bezpośrednio do: `/analytics/financial-report`

### Krok 2: Ustawienie filtrów

**Dostępne filtry**:

1. **Data od / Data do** - Zakres dat dla zleceń produkcyjnych (MO)
2. **Dostawca** - Filtrowanie po konkretnym dostawcy
3. **Klient** - Filtrowanie po konkretnym kliencie
4. **Status MO** - Status zlecenia produkcyjnego (Wszystkie, Planowane, W trakcie, Zakończone, Anulowane)
5. **Wyszukiwanie** - Wyszukiwanie tekstowe po:
   - Numerze PO
   - Nazwie dostawcy
   - Numerze MO
   - Nazwie produktu
   - Numerze CO
   - Nazwie klienta
   - Numerze faktury
   - Nazwie materiału

### Krok 3: Generowanie raportu

1. Ustaw wybrane filtry
2. Kliknij przycisk **"Generuj Raport"**
3. System pobierze dane z bazy i wygeneruje raport
4. Wyświetlą się karty ze statystykami oraz tabela z danymi

### Krok 4: Analiza statystyk

Po wygenerowaniu raportu zobaczysz 4 karty statystyk:

1. **Wartość Zakupów** 💰
   - Suma wartości wszystkich partii w raporcie
   - Liczba partii

2. **Koszt Produkcji** 🏭
   - Suma kosztów produkcji wszystkich MO
   - Liczba zleceń produkcyjnych

3. **Wartość Sprzedaży** 🚚
   - Suma wartości sprzedaży z CO
   - Liczba zrealizowanych zamówień

4. **Marża** 📈
   - Całkowita marża (sprzedaż - koszty)
   - Średni procent marży

### Krok 5: Praca z tabelą

**Sortowanie**:
- Kliknij na nagłówek kolumny aby posortować
- Dostępne sortowanie po: numerze PO, MO, CO, cenach, kosztach, marży

**Paginacja**:
- Wybierz liczbę wierszy na stronę: 10, 25, 50, 100
- Nawiguj między stronami

**Ikony statusu**:
- ✅ Zielona ikona - kompletny łańcuch danych
- ⚠️ Żółta ikona - niekompletny łańcuch danych

### Krok 6: Eksport do CSV

1. Po wygenerowaniu raportu kliknij przycisk **"Eksport CSV"**
2. Plik CSV zostanie pobrany z nazwą: `raport_finansowy_YYYY-MM-DD.csv`
3. Otwórz plik w Excel lub LibreOffice Calc
4. Wszystkie kolumny są opisane w języku polskim

## Przypadki użycia

### 📋 Przypadek 1: Weryfikacja cen partii z PO

**Cel**: Sprawdzić czy ceny partii są prawidłowo kalkulowane z PO

**Kroki**:
1. Wybierz konkretnego dostawcę w filtrach
2. Generuj raport
3. W tabeli sprawdź:
   - `po_unit_price_original` - oryginalna cena z PO
   - `po_discount` - rabat
   - `po_base_unit_price` - cena po rabacie
   - `po_additional_costs_per_unit` - dodatkowe koszty
   - `batch_final_unit_price` - finalna cena partii
4. Zweryfikuj formuła:
   ```
   batch_final_unit_price ≈ po_base_unit_price + po_additional_costs_per_unit
   ```

### 📋 Przypadek 2: Weryfikacja kosztów produkcji MO

**Cel**: Sprawdzić czy koszty produkcji są prawidłowo kalkulowane

**Kroki**:
1. Wybierz status "Zakończone" w filtrach
2. Generuj raport
3. W tabeli sprawdź:
   - `mo_material_cost` - koszt materiałów
   - `mo_processing_cost` - koszt procesowy
   - `mo_full_production_cost` - pełny koszt
4. Zweryfikuj formułę:
   ```
   mo_full_production_cost ≈ mo_material_cost + mo_processing_cost
   ```
5. Eksportuj do CSV i sprawdź szczegółowo w Excelu

### 📋 Przypadek 3: Analiza rentowności zamówień klientów

**Cel**: Sprawdzić które zamówienia klientów są najbardziej/najmniej rentowne

**Kroki**:
1. Wybierz konkretnego klienta w filtrach (lub wszystkich)
2. Generuj raport
3. Posortuj tabelę po kolumnie "Marża %" (kliknij nagłówek)
4. Zidentyfikuj:
   - ✅ Zamówienia z wysoką marżą (zielone)
   - ❌ Zamówienia z niską marżą lub stratą (czerwone)
5. Eksportuj do CSV do dalszej analizy

### 📋 Przypadek 4: Pełna analiza łańcucha dla konkretnego produktu

**Cel**: Prześledzić pełny łańcuch kosztów i cen dla konkretnego produktu

**Kroki**:
1. W wyszukiwaniu wpisz nazwę produktu
2. Generuj raport
3. Dla każdego rekordu sprawdź:
   - **PO**: Cena zakupu surowca
   - **Partia**: Finalna cena surowca po dodatkowych kosztach
   - **MO**: Koszt produkcji (materiały + processing)
   - **CO**: Cena sprzedaży
   - **Faktura**: Status płatności
   - **Marża**: Czy produkt jest rentowny
4. Zweryfikuj ikonę kompletności łańcucha (✅ lub ⚠️)

### 📋 Przypadek 5: Identyfikacja niekompletnych danych

**Cel**: Znaleźć rekordy z brakującymi danymi w łańcuchu

**Kroki**:
1. Generuj raport (bez filtrów lub z wybranymi)
2. W tabeli zwróć uwagę na kolumnę "Status" (ostatnia kolumna)
3. Rekordy z ⚠️ (żółtą ikoną ostrzeżenia) mają niekompletny łańcuch
4. Sprawdź w szczegółach które dane brakują:
   - Brak PO
   - Brak partii
   - Brak CO
   - Brak faktury
5. Popraw dane w systemie

## Wskazówki i najlepsze praktyki

### ✅ Dobre praktyki

1. **Regularna weryfikacja**
   - Generuj raport co miesiąc
   - Sprawdzaj kluczowe wskaźniki (marże)

2. **Analiza trendów**
   - Eksportuj raporty za różne okresy
   - Porównaj w Excelu trendy kosztów i marż

3. **Identyfikacja problemów**
   - Sprawdzaj niekompletne łańcuchy
   - Weryfikuj obliczenia przy dużych różnicach

4. **Optymalizacja**
   - Identyfikuj najbardziej rentowne produkty
   - Analizuj koszty zakupu u różnych dostawców

### ⚠️ Ważne uwagi

1. **Wydajność**
   - Dla dużych zakresów dat raport może generować się dłużej
   - Używaj filtrów aby zawęzić zakres

2. **Dane w cache**
   - System pobiera dane w czasie rzeczywistym z bazy
   - Zmiany w danych będą widoczne po ponownym wygenerowaniu raportu

3. **Deduplikacja w statystykach**
   - Statystyki są obliczane z deduplikacją po MO
   - To zapobiega wielokrotnemu liczeniu tych samych kosztów produkcji

4. **Wyszukiwanie lokalne**
   - Wyszukiwanie tekstowe działa lokalnie (na już pobranych danych)
   - Jest bardzo szybkie i nie wymaga ponownego zapytania do bazy

## Rozwiązywanie problemów

### Problem: Raport generuje się długo

**Rozwiązanie**:
- Zawęź zakres dat
- Wybierz konkretnego dostawcę lub klienta
- Wybierz konkretny status MO

### Problem: Brak danych w raporcie

**Sprawdź**:
- Czy w wybranym okresie są zakończone MO?
- Czy MO mają powiązania z CO?
- Czy materiały w MO mają zarezerwowane partie?
- Czy partie mają powiązania z PO?

### Problem: Niezgodne kalkulacje

**Weryfikacja**:
1. Sprawdź dane źródłowe w dokumentach (PO, MO, CO)
2. Zweryfikuj czy partie mają prawidłowo ustawione ceny
3. Sprawdź czy MO ma wypełnione pole `processingCostPerUnit`
4. Sprawdź logi konsoli przeglądarki (F12)

### Problem: Eksport CSV nie zawiera wszystkich kolumn

**Rozwiązanie**:
- Funkcja `exportReportToCSV` eksportuje tylko kluczowe kolumny
- Pełne dane są widoczne w tabeli w aplikacji
- Aby eksportować wszystkie kolumny, zmodyfikuj funkcję w `src/services/financialReportService.js`

## Rozwój i rozszerzenia

### Możliwe usprawnienia

1. **Wykresy i wizualizacje**
   - Dodać wykresy słupkowe marż
   - Wykres kołowy udziału kosztów (materiały vs. processing)
   - Trend kosztów w czasie

2. **Zaawansowane filtry**
   - Filtrowanie po kategoriach produktów
   - Filtrowanie po zakresie marży
   - Filtrowanie po statusie płatności faktur

3. **Export do innych formatów**
   - Excel (XLSX) z formatowaniem
   - PDF z wykresami
   - JSON dla integracji API

4. **Alerty i notyfikacje**
   - Alert przy niskiej marży
   - Alert przy niekompletnych łańcuchach
   - Alert przy rozbieżnościach w kalkulacjach

5. **Porównania**
   - Porównanie okresów (miesiąc do miesiąca)
   - Benchmark marż dla kategorii produktów
   - Analiza trendów

## Wsparcie techniczne

### Logi debugowania

Moduł loguje wszystkie operacje w konsoli przeglądarki (F12):

```
📊 [FINANCIAL_REPORT] Rozpoczynam generowanie raportu...
✅ [FINANCIAL_REPORT] Znaleziono 45 zadań produkcyjnych
✅ [FINANCIAL_REPORT] Wygenerowano 127 rekordów z 45 operacji
```

### Kontakt

W razie problemów lub pytań:
- Sprawdź logi w konsoli przeglądarki (F12)
- Zweryfikuj dane w dokumentach źródłowych
- Sprawdź połączenie z bazą danych

## Changelog

### v1.0.0 (2025-10-17)
- ✨ Pierwsza wersja modułu Raport Finansowy
- ✅ Implementacja serwisu `financialReportService.js`
- ✅ Implementacja komponentu `FinancialReportPage.js`
- ✅ Dodanie routingu i menu
- ✅ Tłumaczenia PL/EN
- ✅ Eksport do CSV
- ✅ Filtry: daty, dostawca, klient, status, wyszukiwanie
- ✅ Statystyki: zakupy, produkcja, sprzedaż, marża
- ✅ Tabela z paginacją i sortowaniem

## Licencja

©2025 BGW MRP System - Wszystkie prawa zastrzeżone

