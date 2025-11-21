# 📦 Eksport Faktur do Comarch Optima - Szybki Start

## 🚀 Szybki Start (3 kroki)

### Krok 1: Uzupełnij dane firmy
1. Otwórz **Ustawienia** → **Dane Firmy**
2. Wypełnij wszystkie pola:
   - ✅ Nazwa firmy
   - ✅ NIP
   - ✅ Adres (ulica, miasto, kod pocztowy, kraj)
   - ✅ Dodaj konto bankowe z nazwą banku
3. Zapisz

### Krok 2: Eksportuj faktury
1. Przejdź do **Faktury** → **Lista faktur**
2. Kliknij **"Eksport do Comarch Optima (XML)"**
3. Ustaw filtry (opcjonalnie):
   - Zakres dat
   - Klient
   - Status
4. Kliknij **"Eksportuj X faktur do XML"**
5. Plik zostanie pobrany automatycznie

### Krok 3: Importuj do Comarch Optima
1. Otwórz **Comarch Optima ERP**
2. **Handel** → **Faktury**
3. **Funkcje dodatkowe** → **Import dokumentów z pliku XML**
4. Wybierz pobrany plik XML
5. Sprawdź dane w buforze
6. Zatwierdź import

---

## ✨ Co robi system automatycznie?

### 1. Pobiera dane firmy
- Z modułu "Dane Firmy" w aplikacji
- Nazwa, NIP, adres, konto bankowe
- Nie musisz nic konfigurować!

### 2. Pobiera kursy NBP
- Automatycznie z API Narodowego Banku Polskiego
- Dla daty wystawienia faktury
- Obsługuje weekendy i święta
- Kursy historyczne dla starych faktur

### 3. Generuje pełny XML
- Zgodny ze schematem Comarch Optima
- Wszystkie wymagane pola
- Tabelka VAT
- Przeliczenia PLN ↔ waluta dokumentu

---

## 📋 Przed pierwszym użyciem - Checklist

- [ ] Dane firmy są uzupełnione w systemie
- [ ] Dodane jest przynajmniej jedno konto bankowe
- [ ] Faktury mają wszystkie wymagane pola:
  - [ ] Numer faktury
  - [ ] Dane klienta (nazwa, NIP)
  - [ ] Data wystawienia
  - [ ] Termin płatności
  - [ ] Co najmniej jedna pozycja

---

## ⚡ Co nowego w wersji 2.0?

### ✅ Pełna integracja z aplikacją
- Dane firmy z modułu aplikacji
- Kursy NBP w czasie rzeczywistym
- Brak ręcznej konfiguracji

### ✅ Pełna zgodność z Comarch Optima
- Oficjalny schemat XML
- Namespace: `http://www.cdn.com.pl/optima/dokument`
- Wszystkie wymagane pola

### ✅ Automatyka
- Pobieranie kursów NBP
- Obliczanie tabelki VAT
- Przeliczanie walut

---

## 📚 Dodatkowa dokumentacja

| Dokument | Opis |
|----------|------|
| [COMARCH_OPTIMA_EXPORT.md](COMARCH_OPTIMA_EXPORT.md) | Szczegółowa dokumentacja funkcjonalności |
| [AKTUALIZACJA_EKSPORTU_XML_2025.md](AKTUALIZACJA_EKSPORTU_XML_2025.md) | Opis zmian i aktualizacji |
| [INSTRUKCJA_DLA_KSIEGOWYCH.md](INSTRUKCJA_DLA_KSIEGOWYCH.md) | Instrukcja krok po kroku dla księgowych |
| [COMARCH_SUMMARY.md](COMARCH_SUMMARY.md) | Podsumowanie technicze implementacji |
| [example_optima_invoice.xml](example_optima_invoice.xml) | Przykładowy plik XML |

---

## ❓ FAQ

### Czy muszę ręcznie ustawiać kursy walut?
**Nie.** System automatycznie pobiera aktualne kursy z API NBP dla daty wystawienia faktury.

### Czy mogę eksportować faktury z różnych okresów?
**Tak.** System użyje kursów historycznych NBP odpowiednich dla każdej faktury.

### Co jeśli brakuje danych firmy?
System wyświetli błąd. Przejdź do **Ustawienia → Dane Firmy** i uzupełnij dane.

### Czy eksport działa offline?
**Nie.** System wymaga połączenia z internetem do pobrania kursów NBP.

### Jakie waluty są obsługiwane?
Wszystkie waluty obsługiwane przez NBP: EUR, USD, GBP, CHF, JPY, CZK, DKK, NOK, SEK, CAD, AUD i wiele innych.

### Czy mogę eksportować faktury zakupu?
**Tak.** System automatycznie rozpoznaje typ faktury (sprzedaż/zakup) i generuje odpowiedni XML.

---

## 🆘 Problemy?

### Eksport się nie udaje
1. Sprawdź dane firmy w ustawieniach
2. Sprawdź czy wszystkie faktury mają wymagane pola
3. Sprawdź połączenie z internetem (dla API NBP)

### Import w Comarch Optima nie działa
1. Sprawdź wersję Comarch Optima (powinno działać na większości wersji)
2. Sprawdź czy moduł "Faktury" jest aktywny
3. Sprawdź komunikaty błędów w Comarch Optima

### Nieprawidłowe kursy walut
Kursy są pobierane automatycznie z NBP i powinny być poprawne. Jeśli widzisz problem:
1. Sprawdź datę wystawienia faktury
2. Sprawdź czy kurs dla tej daty istnieje w NBP
3. Możesz skorygować kurs po imporcie do Comarch Optima

---

**Data aktualizacji:** 21.11.2025  
**Wersja:** 2.0  
**Status:** ✅ Gotowe do użycia

---

## 🔗 Szybkie linki

- [Pełna dokumentacja](COMARCH_OPTIMA_EXPORT.md)
- [Instrukcja dla księgowych](INSTRUKCJA_DLA_KSIEGOWYCH.md)
- [Przykładowy XML](example_optima_invoice.xml)

