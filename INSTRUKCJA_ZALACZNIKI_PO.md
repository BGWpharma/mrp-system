# Instrukcja obsługi załączników w zamówieniach zakupu

## Wprowadzenie

Nowa funkcjonalność pozwala na załączanie plików do zamówień zakupu (PO), co umożliwia przechowywanie dokumentów takich jak faktury, certyfikaty, listy przewozowe czy inne ważne dokumenty bezpośrednio w systemie MRP.

## Funkcjonalności

### Obsługiwane typy plików
- **PDF** - dokumenty, faktury, certyfikaty
- **Obrazy** - JPEG, PNG, GIF, WebP
- **Dokumenty Word** - DOC, DOCX
- **Arkusze Excel** - XLS, XLSX
- **Pliki tekstowe** - TXT, CSV

### Ograniczenia
- Maksymalny rozmiar pliku: **10 MB**
- Bezpieczne przechowywanie w Firebase Storage
- Dostęp tylko dla autoryzowanych użytkowników

## Instrukcja obsługi

### Dodawanie plików

#### Metoda 1: Przeciąganie i upuszczanie (Drag & Drop)
1. Otwórz formularz zamówienia zakupu (tworzenie nowego lub edycja istniejącego)
2. Znajdź sekcję "Załączniki" 
3. Przeciągnij pliki z komputera do obszaru oznaczonego przerywaną linią
4. Pliki zostaną automatycznie przesłane do systemu

#### Metoda 2: Wybór plików
1. W sekcji "Załączniki" kliknij w obszar z napisem "Przeciągnij pliki lub kliknij"
2. Otworzy się okno wyboru plików
3. Wybierz jeden lub kilka plików naraz
4. Potwierdź wybór - pliki zostaną przesłane automatycznie

### Zarządzanie załącznikami

#### Przeglądanie załączników
- Lista załączników wyświetla się pod obszarem przesyłania
- Dla każdego pliku widoczne są:
  - Nazwa pliku
  - Rozmiar pliku
  - Data przesłania
  - Ikona typu pliku

#### Pobieranie plików
- Kliknij ikonę "Pobierz" (strzałka w dół) obok nazwy pliku
- Plik otworzy się w nowej karcie przeglądarki lub zostanie pobrany

#### Usuwanie plików
- Kliknij czerwoną ikonę "Usuń" (kosz) obok nazwy pliku
- Plik zostanie trwale usunięty z systemu
- **UWAGA**: Operacja jest nieodwracalna

### Wskazówki i dobre praktyki

#### Organizacja plików
- Nadawaj plikom opisowe nazwy przed przesłaniem
- Grupuj powiązane dokumenty (np. "Faktura_VAT_2024_01", "Certyfikat_jakości_produkt_X")
- Regularnie sprawdzaj czy wszystkie potrzebne dokumenty są załączone

#### Bezpieczeństwo
- System automatycznie sprawdza typ i rozmiar plików
- Pliki są przechowywane w bezpiecznej chmurze Firebase
- Dostęp do plików mają tylko autoryzowani użytkownicy systemu

#### Wydajność
- Unikaj przesyłania niepotrzebnie dużych plików
- Kompresuj obrazy jeśli to możliwe
- Rozważ konwersję dokumentów do formatu PDF dla lepszej kompatybilności

## Przykłady zastosowania

### Faktury i dokumenty finansowe
- Przesyłaj faktury VAT w formacie PDF
- Załączaj dokumenty celne dla importu
- Zapisuj potwierdzenia płatności

### Certyfikaty i atesty
- Załączaj certyfikaty jakości produktów
- Przechowuj atesty bezpieczeństwa
- Dokumentuj deklaracje zgodności

### Dokumenty logistyczne
- Listy przewozowe
- Dokumenty ubezpieczeniowe
- Instrukcje obsługi

## Rozwiązywanie problemów

### Błąd: "Plik jest zbyt duży"
- Sprawdź czy plik nie przekracza 10 MB
- Skompresuj plik lub zmień jego format
- Podziel duży dokument na mniejsze części

### Błąd: "Nieobsługiwany typ pliku"
- Sprawdź czy format pliku jest na liście obsługiwanych
- Konwertuj plik do obsługiwanego formatu (np. PDF)
- Skontaktuj się z administratorem systemu

### Problemy z przesyłaniem
- Sprawdź połączenie internetowe
- Odśwież stronę i spróbuj ponownie
- Sprawdź czy masz odpowiednie uprawnienia

## Wsparcie techniczne

W przypadku problemów z funkcjonalnością załączników skontaktuj się z zespołem IT lub administratorem systemu MRP.

---

*Instrukcja dotyczy systemu MRP - wersja z funkcjonalnością załączników do zamówień zakupu* 