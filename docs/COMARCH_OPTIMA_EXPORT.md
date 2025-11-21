# Eksport Faktur do Comarch Optima ERP

## ⚠️ WAŻNA AKTUALIZACJA (21.11.2025)

**Format XML został zaktualizowany do pełnej zgodności z oficjalnym schematem Comarch Optima!**

Kluczowe zmiany:
- ✅ Dodano namespace XML: `http://www.cdn.com.pl/optima/dokument`
- ✅ Wszystkie tagi w WIELKICH LITERACH zgodnie ze standardem Optima
- ✅ Rozdzielone sekcje: PLATNIK, ODBIORCA, SPRZEDAWCA
- ✅ Dodano kompletne informacje o kursach walut
- ✅ Dodano sekcję KWOTY w nagłówku
- ✅ Szczegółowa struktura pozycji (TOWAR, STAWKA_VAT, CENY, JM_ZLOZONA)
- ✅ Automatyczna TABELKA_VAT z podsumowaniem według stawek
- ✅ Dane sprzedawcy (BGW PHARMA) z NIP i kontem bankowym

## Opis funkcjonalności

System MRP umożliwia eksport faktur do formatu XML w pełni zgodnego ze schematem Comarch Optima ERP, co znacząco ułatwia pracę księgowym poprzez automatyzację procesu przenoszenia danych między systemami.

## Jak używać eksportu

### 1. Przejdź do listy faktur

W menu głównym wybierz **Faktury** → **Lista faktur**

### 2. Znajdź przycisk eksportu

Na liście faktur znajdziesz przycisk:
**"Eksport do Comarch Optima (XML)"**

### 3. Konfiguracja eksportu

Po kliknięciu przycisku otworzy się okno dialogowe z opcjami:

- **Eksportuj wszystkie faktury** - zaznacz, jeśli chcesz wyeksportować wszystkie widoczne (przefiltrowane) faktury
- Jeśli nie zaznaczysz, będą eksportowane tylko faktury spełniające aktualne filtry

### 4. Walidacja

System automatycznie zwaliduje faktury przed eksportem:

✅ **Prawidłowe faktury:**
- Posiadają numer faktury
- Mają przypisanego klienta
- Zawierają datę wystawienia i termin płatności
- Mają co najmniej jedną pozycję

⚠️ **Faktury z błędami:**
- Zostaną wyświetlone z opisem problemu
- Nie zostaną uwzględnione w eksporcie
- Należy poprawić dane i spróbować ponownie

### 5. Pobranie pliku

Po kliknięciu **"Eksportuj X faktur do XML"**:
- System wygeneruje plik XML
- Plik zostanie automatycznie pobrany
- Nazwa pliku będzie zawierać datę i godzinę eksportu

## Import do Comarch Optima

### Krok po kroku:

1. **Otwórz Comarch Optima ERP**
2. **Przejdź do modułu "Handel"**
3. **Wybierz "Faktury"**
4. **Kliknij "Funkcje dodatkowe"**
5. **Wybierz "Import dokumentów z pliku XML"**
6. **Wskaż pobrany plik XML**
7. **Sprawdź dane w buforze**
8. **Zatwierdź import**

## Struktura eksportowanego XML

Każda faktura w pliku XML zawiera kompletne dane zgodnie ze schematem Comarch Optima:

### Nagłówek dokumentu (NAGLOWEK):
- **Generator** - Comarch Opt!ma
- **Typ dokumentu** - 302 (Faktura Sprzedaży) lub 303 (Faktura Zakupu)
- **Rodzaj dokumentu** - 302000 (FS) lub 303000 (FZ)
- **Numer pełny** - pełny numer faktury
- **Daty** - data dokumentu, wystawienia, operacji, termin płatności
- **Forma płatności** - przelew, gotówka, itp.
- **Waluta z kursem** - symbol waluty, kurs NBP, data kursu
- **Kwoty zbiorcze** - razem netto, VAT, brutto (w PLN i walucie dokumentu)
- **Magazyn źródłowy** - nazwa magazynu

### Dane kontrahentów:
System eksportuje trzy sekcje kontrahentów zgodnie ze standardem Optima:

**PLATNIK (Płatnik)**:
- Kod klienta (ID z systemu MRP)
- Nazwa
- NIP z kodem kraju (np. PL, FR, DE)
- Adres (ulica, miasto, kod pocztowy, kraj)

**ODBIORCA (Odbiorca)**:
- Te same dane co płatnik (jeśli nie określono inaczej)

**SPRZEDAWCA (Sprzedawca - Twoja firma)**:
- Dane pobierane automatycznie z modułu **Dane Firmy**
- Nazwa firmy, NIP, Adres
- Konto bankowe (pierwsze z listy)
- Nazwa banku

**Aby zaktualizować dane sprzedawcy:**
Przejdź do **Ustawienia** → **Dane Firmy** w aplikacji MRP

### Pozycje faktury (POZYCJE):
Każda pozycja zawiera szczegółową strukturę:

**TOWAR**:
- Kod towaru (SKU/ID)
- Nazwa
- Opis
- EAN, SWW, numer katalogowy

**STAWKA_VAT**:
- Stawka (np. 23.00, 8.00, 0.00)
- Flaga (0=normalna, 1=zwolnione, 2=eksport/WDT, 3=odwrotne obciążenie)
- Stawka źródłowa

**CENY**:
- Cena w PLN (waluta systemowa)
- Cena w walucie dokumentu
- Ceny po rabacie

**Wartości**:
- Ilość z jednostką miary
- Wartość netto w PLN i walucie dokumentu
- Wartość brutto w PLN i walucie dokumentu

### Płatności (PLATNOSCI):
- Forma płatności
- Termin
- Kwota w walucie dokumentu
- Kwota w walucie systemowej (PLN)
- Szczegóły waluty i kursu

### Tabelka VAT (TABELKA_VAT):
Automatyczne podsumowanie według stawek VAT:
- Dla każdej stawki osobno
- Netto, VAT, Brutto
- W PLN i walucie dokumentu

### Dodatkowe sekcje:
- **KAUCJE** - kaucje (jeśli występują)
- **ATRYBUTY** - dodatkowe atrybuty
- **KODY_JPK_V7** - kody JPK (jeśli wymagane)

## Formaty wspierane przez Comarch Optima

System obsługuje następujące formaty:
- ✅ **XML** - zaimplementowany w systemie MRP
- **PEF** - dla faktur zakupu (opcjonalnie)
- **CSV** - dla cenników i innych danych

## Kursy walut

System **automatycznie pobiera aktualne kursy walut z API NBP** (Narodowego Banku Polskiego):

### Wspierane waluty:
- ✅ **EUR** - Euro
- ✅ **USD** - Dolar amerykański
- ✅ **GBP** - Funt brytyjski
- ✅ **CHF** - Frank szwajcarski
- ✅ **Wszystkie inne waluty** obsługiwane przez NBP (tabele A i B)
- ✅ **PLN** - Złoty polski (kurs: 1.0000)

### Jak działa pobieranie kursów:
1. **Automatyczne pobieranie** - System łączy się z API NBP podczas eksportu
2. **Kursy historyczne** - Dla faktur z przeszłości używa kursów z odpowiednich dni
3. **Weekendy i święta** - Automatycznie używa kursu z ostatniego dnia roboczego
4. **Cache** - Kursy są zapisywane w pamięci, aby przyspieszyć eksport

### Zalety integracji z NBP:
- ✅ Zawsze aktualne kursy
- ✅ Zgodność z oficjalnymi kursami NBP
- ✅ Brak potrzeby ręcznej aktualizacji
- ✅ Kursy identyczne jak w księgowości
- ✅ Automatyczna obsługa dat niestandardowych

## Najczęstsze problemy i rozwiązania

### Problem: Faktura nie przechodzi walidacji

**Rozwiązanie:**
1. Sprawdź czy faktura ma wszystkie wymagane dane
2. Upewnij się, że klient ma wypełnione dane
3. Sprawdź czy są pozycje na fakturze

### Problem: Import w Optimie nie działa

**Rozwiązanie:**
1. Upewnij się, że używasz odpowiedniej wersji Comarch Optima
2. Sprawdź czy moduł "Faktury" jest aktywny
3. Skonsultuj się z administratorem systemu Optima

### Problem: Błędne dane po imporcie

**Rozwiązanie:**
1. Sprawdź mapowanie pól w Comarch Optima
2. Upewnij się, że klienci istnieją w bazie Optima
3. Sprawdź poprawność numerów NIP/VAT

## Wsparcie techniczne

W przypadku problemów skontaktuj się z:
- Administratorem systemu MRP
- Pomocą techniczną Comarch Optima
- Dostawcą oprogramowania BGW-MRP

## Historia zmian

### Wersja 2.0 (2025-11-21) - GŁÓWNA AKTUALIZACJA
- ✅ **Pełna zgodność ze schematem Comarch Optima**
- ✅ Dodano namespace: `http://www.cdn.com.pl/optima/dokument`
- ✅ Wszystkie tagi w WIELKICH LITERACH
- ✅ Rozdzielone sekcje kontrahentów: PLATNIK, ODBIORCA, SPRZEDAWCA
- ✅ Kompletne informacje o kursach walut
- ✅ Sekcja KWOTY w nagłówku z podsumowaniem
- ✅ Szczegółowa struktura pozycji (TOWAR, STAWKA_VAT, CENY)
- ✅ Automatyczna TABELKA_VAT według stawek
- ✅ Dane sprzedawcy (BGW PHARMA) wbudowane
- ✅ Wsparcie dla flag VAT (eksport/WDT)
- ✅ Poprawne przeliczenia PLN ↔ waluta dokumentu

### Wersja 1.0 (2024-11-20)
- Pierwsza wersja eksportu do XML
- Obsługa faktur sprzedaży i zakupu
- Walidacja danych przed eksportem
- Instrukcja dla użytkowników

---

**Uwaga:** Po aktualizacji do wersji 2.0, eksportowane pliki XML powinny być w pełni kompatybilne z Comarch Optima. Zalecamy przetestowanie importu na fakturach testowych.

