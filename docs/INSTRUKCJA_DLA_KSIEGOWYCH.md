# Instrukcja dla Księgowych - Eksport Faktur do Comarch Optima

## 📋 Szybki Start

### Krok 1: Przejdź do faktur
1. Zaloguj się do systemu BGW-MRP
2. W menu wybierz **Faktury** → **Lista faktur**

### Krok 2: Zastosuj filtry (opcjonalnie)
Możesz wyfiltrować faktury przed eksportem:
- 📅 **Okres** - wybierz zakres dat
- 👤 **Klient** - konkretny kontrahent
- 📊 **Status** - np. tylko wystawione faktury

### Krok 3: Eksportuj do XML
1. Kliknij przycisk **"Eksport do Comarch Optima (XML)"**
2. W oknie dialogowym:
   - ✅ Zaznacz **"Eksportuj wszystkie faktury"** jeśli chcesz wszystkie widoczne
   - ℹ️ Zobacz podsumowanie: ile faktur jest prawidłowych
   - ⚠️ Sprawdź czy są faktury z błędami
3. Kliknij **"Eksportuj X faktur do XML"**
4. Plik XML zostanie pobrany automatycznie

### Krok 4: Importuj do Comarch Optima
1. Otwórz **Comarch Optima ERP**
2. **Handel** → **Faktury**
3. **Funkcje dodatkowe** → **Import dokumentów z pliku XML**
4. Wybierz pobrany plik XML
5. Sprawdź dane w buforze
6. Zatwierdź import

## ✅ Co jest sprawdzane przed eksportem?

System automatycznie sprawdza czy każda faktura ma:
- ✓ Numer faktury
- ✓ Dane klienta (nazwa, NIP)
- ✓ Datę wystawienia
- ✓ Termin płatności
- ✓ Co najmniej jedną pozycję

## ⚠️ Najczęstsze błędy

| Błąd | Rozwiązanie |
|------|-------------|
| "Brak numeru faktury" | Uzupełnij numer w systemie MRP |
| "Brak nazwy klienta" | Sprawdź czy klient ma wypełnioną nazwę |
| "Brak pozycji faktury" | Dodaj przynajmniej jedną pozycję do faktury |
| "Brak daty wystawienia" | Uzupełnij datę wystawienia |

## 📁 Co zawiera plik XML?

Eksportowany plik zawiera wszystkie dane potrzebne w Comarch Optima:
- 📄 **Dane faktury**: numer, daty, forma płatności, waluta
- 👥 **Dane kontrahenta**: nazwa, NIP, adres, kontakt
- 🛒 **Pozycje**: nazwy, ilości, ceny, VAT
- 💰 **Płatności**: zapłacone, przedpłaty, pozostało
- 📝 **Uwagi**: dodatkowe informacje

## 💡 Wskazówki

### Przed eksportem:
1. ✓ Sprawdź czy wszystkie faktury mają kompletne dane
2. ✓ Upewnij się, że klienci mają prawidłowe NIP-y
3. ✓ Zweryfikuj daty i kwoty

### Po imporcie w Optima:
1. ✓ Sprawdź kilka faktur czy dane się zgadzają
2. ✓ Zweryfikuj kontrahentów
3. ✓ Sprawdź sumy kontrolne

### Regularne eksporty:
- 📅 **Codziennie** - nowe faktury z poprzedniego dnia
- 📅 **Tydzień** - podsumowanie tygodniowe
- 📅 **Miesiąc** - eksport miesięczny na koniec okresu

## 🔧 Rozwiązywanie problemów

### Problem: Nie mogę wyeksportować faktur
**Sprawdź:**
- Czy jesteś zalogowany/a?
- Czy masz uprawnienia do eksportu?
- Czy są faktury do wyeksportowania?

### Problem: Faktury mają błędy walidacji
**Rozwiązanie:**
1. Zobacz listę faktur z błędami w oknie eksportu
2. Wejdź w każdą taką fakturę
3. Uzupełnij brakujące dane
4. Spróbuj ponownie

### Problem: Import w Optima nie działa
**Sprawdź:**
- Czy plik XML nie jest uszkodzony?
- Czy masz uprawnienia do importu w Optima?
- Czy kontrahenci istnieją w bazie Optima?

## 📞 Kontakt

W razie problemów skontaktuj się z:
- **Administrator systemu MRP** - problemy z eksportem
- **Helpdesk Comarch** - problemy z importem do Optima
- **Kierownik działu** - problemy z danymi

## 📚 Dodatkowe materiały

- `COMARCH_OPTIMA_EXPORT.md` - pełna dokumentacja techniczna
- `example_optima_invoice.xml` - przykładowy plik XML

---

**Ostatnia aktualizacja:** 20.11.2024  
**Wersja:** 1.0

