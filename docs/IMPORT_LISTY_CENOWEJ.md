# Import listy cenowej z CSV

## 📋 Przegląd

System umożliwia masowy import pozycji do listy cenowej za pomocą pliku CSV. Funkcjonalność obsługuje dodawanie nowych pozycji oraz aktualizację istniejących.

## 🎯 Dostęp do funkcji

1. Przejdź do **Sprzedaż → Listy cenowe**
2. Otwórz szczegóły wybranej listy cenowej
3. Kliknij przycisk **"Importuj CSV"** (niebieski przycisk obok "Eksportuj CSV")

## 📝 Format pliku CSV

### Wymagane kolumny:

| Kolumna | Opis | Wymagane | Przykład |
|---------|------|----------|----------|
| **SKU** | Nazwa produktu/receptury (dokładnie jak w systemie) | ✅ Tak | "Produkt A" |
| **PRICE** | Cena (liczba dziesiętna) | ✅ Tak | 100.00 |
| **CURRENCY** | Waluta (EUR, PLN, USD, GBP) | ❌ Nie | EUR |
| **UNIT** | Jednostka miary | ✅ Tak | kg |
| **MOQ** | Minimalna ilość zamówienia (liczba całkowita) | ✅ Tak | 10 |
| **COMMENTS** | Komentarze/uwagi | ❌ Nie | "Pakowanie 25kg" |

### Przykład pliku CSV:

```csv
SKU,PRICE,CURRENCY,UNIT,MOQ,COMMENTS
"Produkt A",150.00,EUR,kg,10,"Pakowanie 25kg"
"Produkt B",75.50,EUR,szt,5,"Minimum order 5 units"
"Usługa Transport",250.00,PLN,usługa,1,""
```

## 🔍 Proces importu

### 1. Pobierz szablon

Kliknij **"Pobierz szablon"** aby pobrać przykładowy plik CSV z prawidłową strukturą.

### 2. Przygotuj dane

- Wypełnij plik CSV danymi
- Upewnij się, że nazwy produktów (SKU) **dokładnie** odpowiadają nazwom w systemie
- System obsługuje:
  - **Receptury** - produkty z modułu receptur
  - **Usługi** - pozycje magazynowe z kategorii "Inne"

### 3. Wybierz plik

- Kliknij **"Wybierz plik CSV"**
- Wybierz przygotowany plik z dysku
- Maksymalny rozmiar: **5 MB**
- Maksymalna liczba pozycji: **1000**

### 4. Podgląd zmian

System automatycznie:
- Parsuje plik CSV
- Waliduje dane
- Dopasowuje produkty do bazy danych
- Pokazuje podgląd zmian:
  - ✅ **Do dodania** - nowe pozycje
  - 🔄 **Do aktualizacji** - istniejące pozycje z różnicami
  - ⚠️ **Nie znaleziono** - produkty nieistniejące w systemie
  - ❌ **Błędy** - niepoprawne dane

### 5. Opcje importu

Dostępne opcje:
- ☑️ **Aktualizuj istniejące pozycje** - nadpisz ceny/MOQ dla produktów już w liście
- ☑️ **Pomiń nieznalezione produkty** - kontynuuj import mimo brakujących produktów

### 6. Wykonaj import

- Przejrzyj podgląd zmian
- Kliknij **"Importuj (X poz.)"**
- Poczekaj na zakończenie operacji
- System wyświetli podsumowanie:
  - Dodano: X pozycji
  - Zaktualizowano: X pozycji
  - Pominięto: X pozycji

## ✅ Walidacja danych

### Reguły walidacji:

#### SKU (Nazwa produktu)
- ✅ Wymagane
- ✅ Nie może być puste
- ⚠️ Musi istnieć w bazie danych (jako receptura lub usługa)
- ⚠️ Dopasowanie: case-insensitive (ignoruje wielkość liter)

#### PRICE (Cena)
- ✅ Wymagane
- ✅ Musi być liczbą
- ✅ Musi być >= 0
- 📝 Format: dziesiętny z **kropką** jako separatorem (np. 100.00, nie 100,00)
- ⚠️ **WAŻNE:** Zawsze używaj kropki `.` zamiast przecinka `,` w cenach!
- ✅ Import akceptuje oba formaty, ale eksport zawsze używa kropki

#### CURRENCY (Waluta)
- ❌ Opcjonalne
- 📝 Domyślnie: waluta z listy cenowej (zazwyczaj EUR)
- ✅ Dostępne: EUR, PLN, USD, GBP

#### UNIT (Jednostka)
- ✅ Wymagane
- ✅ Nie może być puste
- 📝 Przykłady: kg, szt, l, m, m², usługa

#### MOQ (Minimalna ilość)
- ✅ Wymagane
- ✅ Musi być liczbą całkowitą
- ✅ Musi być > 0
- 📝 Domyślnie: 1

#### COMMENTS (Komentarze)
- ❌ Opcjonalne
- 📝 Może być puste

## ⚠️ Obsługa błędów

### Błędy krytyczne (blokują import):

1. **Brak wymaganych kolumn**
   - Komunikat: "Brak wymaganych kolumn: SKU i PRICE"
   - Rozwiązanie: Dodaj kolumny SKU i PRICE do pliku

2. **Niepoprawna cena**
   - Komunikat: "Niepoprawna cena (musi być liczbą nieujemną)"
   - Rozwiązanie: Upewnij się, że cena to liczba >= 0

3. **Niepoprawne MOQ**
   - Komunikat: "Niepoprawne MOQ (musi być liczbą dodatnią)"
   - Rozwiązanie: MOQ musi być liczbą całkowitą > 0

4. **Produkt nie istnieje** (jeśli opcja "Pomiń" wyłączona)
   - Komunikat: "Produkt nie znaleziony w bazie"
   - Rozwiązanie: 
     - Sprawdź pisownię nazwy produktu
     - Upewnij się, że produkt/receptura istnieje w systemie
     - Lub włącz opcję "Pomiń nieznalezione produkty"

### Ostrzeżenia (nie blokują importu):

1. **Duplikaty SKU w pliku**
   - System użyje ostatniej wartości
   - Zalecenie: Usuń duplikaty z pliku

2. **Produkt już w liście cenowej**
   - Jeśli "Aktualizuj istniejące" włączone → zostanie zaktualizowany
   - Jeśli wyłączone → zostanie pominięty

3. **Produkty nie znalezione**
   - Jeśli "Pomiń nieznalezione" włączone → będą pominięte
   - Lista pominiętych produktów w podglądzie

## 📊 Przykłady użycia

### Przykład 1: Import nowych produktów

```csv
SKU,PRICE,CURRENCY,UNIT,MOQ,COMMENTS
"Witamina C 1000mg",45.00,EUR,kg,50,"Opakowanie zbiorcze"
"Magnez Cytrate",38.50,EUR,kg,25,"Wysoka biodostępność"
"Omega-3 Premium",125.00,EUR,l,10,"Olej rybi wysokiej jakości"
```

### Przykład 2: Aktualizacja cen

```csv
SKU,PRICE,CURRENCY,UNIT,MOQ,COMMENTS
"Produkt A",155.00,EUR,kg,10,"Nowa cena od 2026"
"Produkt B",80.00,EUR,szt,5,"Zwiększona cena"
```

### Przykład 3: Mix produktów i usług

```csv
SKU,PRICE,CURRENCY,UNIT,MOQ,COMMENTS
"Produkt Główny",200.00,EUR,kg,100,""
"Transport standardowy",150.00,PLN,usługa,1,"Dostawa 3-5 dni"
"Pakowanie specjalne",50.00,PLN,usługa,1,"Pakowanie w worki próżniowe"
```

## 🔧 Rozwiązywanie problemów

### Problem: "Plik CSV jest pusty"
**Przyczyna:** Plik nie zawiera danych lub tylko nagłówki  
**Rozwiązanie:** Dodaj przynajmniej jeden wiersz z danymi

### Problem: "Nie znaleziono produktu X"
**Przyczyna:** Nazwa produktu nie istnieje w systemie  
**Rozwiązanie:**
1. Sprawdź pisownię (wielkość liter nie ma znaczenia)
2. Sprawdź czy produkt/receptura istnieje w systemie
3. Upewnij się, że nie ma dodatkowych spacji

### Problem: "Wykryto separator: ;"
**Informacja:** System automatycznie wykrywa separator (przecinek lub średnik)  
**Nie wymaga akcji:** To normalne zachowanie

### Problem: Ceny są niepoprawne po imporcie
**Przyczyna:** Użycie przecinka `,` zamiast kropki `.` w cenach  
**Przykład błędny:** `5,99` - CSV widzi to jako dwie kolumny!  
**Przykład poprawny:** `5.99` - jedna kolumna z ceną  
**Rozwiązanie:**
1. Otwórz plik CSV w edytorze tekstowym (Notepad++)
2. Zamień wszystkie przecinki w kolumnie PRICE na kropki
3. Szukaj: `",(\d+),(\d+),` → Zamień: `".\1.\2,`
4. Lub użyj funkcji Find & Replace w Excelu przed eksportem

### Problem: Importuje się 0 pozycji
**Przyczyna:** Wszystkie produkty już istnieją i opcja "Aktualizuj" jest wyłączona  
**Rozwiązanie:** Włącz opcję "Aktualizuj istniejące pozycje"

## 💡 Wskazówki

1. **Używaj szablonu** - Zawsze zacznij od pobrania szablonu CSV
2. **Sprawdź nazwy** - Upewnij się, że nazwy produktów są dokładnie takie jak w systemie
3. **Testuj małymi plikami** - Zacznij od importu 5-10 pozycji, sprawdź wyniki
4. **Backup** - Przed masowym importem wyeksportuj obecną listę (backup)
5. **Separator CSV** - Używaj przecinka (,) jako separatora kolumn (średnik też działa)
6. **Separator dziesiętny** - Używaj **kropki** (.) w cenach, nie przecinka! (5.99 zamiast 5,99)
7. **Kodowanie** - Zapisz plik jako UTF-8 (dla polskich znaków)
8. **Excel** - Jeśli używasz Excel, zapisz jako "CSV (rozdzielany przecinkami)" i zmień przecinki w cenach na kropki

## 🎓 Najlepsze praktyki

### ✅ Dobre praktyki:

```csv
SKU,PRICE,CURRENCY,UNIT,MOQ,COMMENTS
"Nazwa produktu dokładnie z systemu",100.00,EUR,kg,10,"Jasny komentarz"
```

### ❌ Złe praktyki:

```csv
SKU,PRICE,CURRENCY,UNIT,MOQ,COMMENTS
nazwa bez cudzysłowów,ABC,EUR,kg,0,  # Błędy: brak cudzysłowów, cena nie jest liczbą, MOQ = 0
```

## 📞 Wsparcie

Jeśli napotkasz problemy:
1. Sprawdź tę dokumentację
2. Przejrzyj szczegóły błędów w podglądzie importu
3. Pobierz szablon i porównaj ze swoim plikiem
4. Skontaktuj się z administratorem systemu

---

**Ostatnia aktualizacja:** 2026-01-20  
**Wersja:** 1.0
