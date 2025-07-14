# Zarządzanie Użytkownikami - Instrukcja dla Administratorów

## Przegląd

System BGW-MRP zawiera zaawansowany panel zarządzania użytkownikami dostępny tylko dla administratorów. Panel umożliwia pełne zarządzanie kontami użytkowników, ich danymi osobowymi, rolami oraz uprawnieniami.

## Dostęp do Panelu

Panel zarządzania użytkownikami jest dostępny pod adresem `/admin/users` i wymaga uprawnień administratora.

### Jak uzyskać dostęp:
1. Zaloguj się jako administrator
2. Przejdź do menu głównego
3. Wybierz **Zarządzanie użytkownikami**

## Funkcjonalności

### 1. Edycja Danych Użytkownika 👤

Ikona: **AccountBox** (niebieska)

**Dostępne pola do edycji:**
- **Nazwa użytkownika** (wymagane)
- **Adres email** (wymagane)
- **URL zdjęcia profilowego** (opcjonalne)
- **Numer telefonu** (opcjonalne)
- **Stanowisko** (opcjonalne)
- **Dział** (opcjonalne)

**Walidacja:**
- Sprawdzanie formatu adresu email
- Walidacja URL zdjęcia profilowego
- Sprawdzanie formatu numeru telefonu
- Unikalność adresu email w systemie

**Ograniczenia bezpieczeństwa:**
- Tylko administratorzy mogą edytować dane użytkowników
- Zmiana emaila może wpłynąć na możliwość logowania
- Wszystkie zmiany są logowane z timestampem

### 2. Zarządzanie Rolami 🔧

Ikona: **Edit** (szara)

**Dostępne role:**
- **Administrator** - pełny dostęp do systemu, limit 250 wiadomości AI/miesiąc
- **Pracownik** - standardowy dostęp, limit 50 wiadomości AI/miesiąc

**Automatyczne działania przy zmianie roli:**
- Aktualizacja limitu wiadomości AI
- Odświeżenie uprawnień w systemie
- Wylogowanie cache użytkownika

**Ograniczenia:**
- Administrator nie może edytować własnej roli
- Zmiana roli wymaga potwierdzenia

### 3. Zarządzanie Zakładkami Sidebara 👁️

Ikona: **Visibility** (fioletowa)

**Dostępne zakładki do ukrycia/pokazania:**
- **Asystent AI** (`/ai-assistant`)
- **Dashboard** (`/`)
- **Parametry hali** (`/hall-data`)
- **Sprzedaż** (`/customers`)
- **Produkcja** (`/production`)
- **Stany** (`/inventory`)

**Funkcjonalność:**
- Ukrywanie całych sekcji menu dla konkretnych użytkowników
- Instant preview zmian w interfejsie
- Podgląd ukrytych zakładek w dialogu
- Zmiany są natychmiast widoczne po następnym zalogowaniu użytkownika

## Widok Tabeli Użytkowników

### Kolumny:
1. **Użytkownik** - Zdjęcie profilowe i nazwa
2. **Email** - Adres email użytkownika
3. **Stanowisko** - Pozycja w firmie
4. **Dział** - Dział, w którym pracuje użytkownik
5. **Rola** - Administrator lub Pracownik (chip kolorowy)
6. **Limit AI** - Miesięczny limit wiadomości do asystenta AI
7. **Wykorzystano** - Liczba wykorzystanych wiadomości w bieżącym miesiącu
8. **Akcje** - Przyciski do zarządzania użytkownikiem

### Sortowanie i filtrowanie:
- Domyślnie sortowane alfabetycznie po nazwie użytkownika
- Przycisk "Odśwież" do manualnego odświeżenia listy
- Automatyczne odświeżanie po każdej zmianie

## Przepływ Pracy

### Dodawanie Nowego Użytkownika:
1. Użytkownik rejestruje się samodzielnie przez formularz rejestracji
2. Administrator może następnie edytować jego dane i uprawnienia
3. Domyślnie nowi użytkownicy otrzymują rolę "Pracownik"

### Edytowanie Istniejącego Użytkownika:
1. Znajdź użytkownika na liście
2. Kliknij odpowiednią ikonę akcji:
   - 👤 **Edytuj dane osobowe**
   - 🔧 **Zmień rolę**
   - 👁️ **Zarządzaj zakładkami**
3. Wprowadź zmiany w dialogu
4. Kliknij "Zapisz" aby zatwierdzić

### Zarządzanie Dostępem:
1. Użyj funkcji ukrywania zakładek do ograniczenia dostępu
2. Zmień rolę na "Pracownik" aby ograniczyć uprawnienia administracyjne
3. Edytuj dane kontaktowe w razie potrzeby

## Bezpieczeństwo

### Zabezpieczenia:
- **Autoryzacja na poziomie serwisu** - wszystkie operacje weryfikują uprawnienia administratora
- **Walidacja danych** - sprawdzanie poprawności formatów i unikalności
- **Audit log** - wszystkie zmiany zapisywane z timestampem i ID administratora
- **Cache invalidation** - automatyczne wyczyścenie cache po zmianach

### Najlepsze Praktyki:
- Regularnie sprawdzaj listę użytkowników
- Nie przyznawaj uprawnień administratora bez konieczności
- Weryfikuj adresy email przed zapisaniem
- Używaj funkcji ukrywania zakładek zamiast usuwania kont
- Dokumentuj zmiany uprawnień dla celów audytowych

## Rozwiązywanie Problemów

### Częste Problemy:

**Problem:** Użytkownik nie może się zalogować po zmianie emaila
**Rozwiązanie:** Sprawdź czy nowy email jest prawidłowy i czy użytkownik wie o zmianie

**Problem:** Zmiany w zakładkach nie są widoczne
**Rozwiązanie:** Użytkownik musi się wylogować i zalogować ponownie

**Problem:** Błąd "Email już istnieje"
**Rozwiązanie:** Sprawdź czy inny użytkownik nie używa już tego adresu

**Problem:** Nie można edytować własnego konta
**Rozwiązanie:** To zabezpieczenie - poproś innego administratora o pomoc

### Kontakt do Wsparcia:
W przypadku problemów technicznych skontaktuj się z zespołem IT.

## Historia Zmian

- **v1.0.0** - Podstawowe zarządzanie rolami
- **v1.1.0** - Dodanie edycji danych użytkowników
- **v1.2.0** - Zarządzanie zakładkami sidebara
- **v1.3.0** - Rozszerzone dane profilu (stanowisko, dział, telefon) 