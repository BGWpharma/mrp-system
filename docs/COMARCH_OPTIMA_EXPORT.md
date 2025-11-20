# Eksport Faktur do Comarch Optima ERP

## Opis funkcjonalności

System MRP umożliwia eksport faktur do formatu XML zgodnego z Comarch Optima ERP, co znacząco ułatwia pracę księgowym poprzez automatyzację procesu przenoszenia danych między systemami.

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

Każda faktura w pliku XML zawiera:

### Nagłówek dokumentu:
- Typ (FS = Faktura Sprzedaży, FZ = Faktura Zakupu)
- Numer faktury
- Daty: wystawienia, sprzedaży, termin płatności
- Forma płatności
- Waluta
- Status

### Dane kontrahenta:
- Kod klienta (ID z systemu MRP)
- Nazwa
- NIP/VAT EU
- Email
- Telefon
- Adres (ulica, miasto, kod pocztowy, kraj)

### Pozycje faktury:
- Lp. (numer pozycji)
- Nazwa produktu/usługi
- Opis
- Ilość
- Jednostka miary
- Cena netto
- Stawka VAT
- Wartość netto
- Wartość VAT
- Wartość brutto

### Podsumowanie:
- Suma netto
- Suma VAT
- Suma brutto
- Waluta

### Płatności:
- Suma zapłacona
- Rozliczone przedpłaty
- Pozostało do zapłaty

### Metadane:
- Data eksportu
- System źródłowy (BGW-MRP)
- Czy proforma
- Czy refaktura

## Formaty wspierane przez Comarch Optima

System obsługuje następujące formaty:
- ✅ **XML** - zaimplementowany w systemie MRP
- **PEF** - dla faktur zakupu (opcjonalnie)
- **CSV** - dla cenników i innych danych

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

### Wersja 1.0 (2024-11-20)
- Pierwsza wersja eksportu do XML
- Obsługa faktur sprzedaży i zakupu
- Walidacja danych przed eksportem
- Instrukcja dla użytkowników

---

**Uwaga:** Przed pierwszym użyciem zaleca się przetestowanie eksportu na kilku fakturach testowych i sprawdzenie poprawności importu w systemie Comarch Optima.

