# Eksport Zamówień Klientów (CO) do CSV

## Opis funkcjonalności

Dodano możliwość eksportu zamówień klientów (Customer Orders - CO) z wszystkimi szczegółami pozycji do pliku CSV bezpośrednio z listy zamówień klientów.

### Formatowanie danych w CSV
- **Pola numeryczne** (ilości, ceny, wartości) są eksportowane jako liczby bez cudzysłowów dla właściwego rozpoznania w Excel
- **Pola tekstowe** są eksportowane w cudzysłowach z escapowaniem znaków specjalnych
- **Pola logiczne** (boolean) są eksportowane jako "Tak"/"Nie"  
- **Daty** są formatowane w formacie lokalnym z cudzysłowami

## Lokalizacja

**Plik:** `src/components/orders/OrdersList.js`
**Przycisk:** "Eksportuj CO" - zielony przycisk w prawym górnym rogu listy zamówień

## Funkcjonalność

### Co eksportuje:
- **Wszystkie pozycje** ze wszystkich zamówień klientów (każda pozycja = osobny wiersz)
- Dane podstawowe zamówienia (numer, data, klient, status, itp.)
- Szczegóły każdej pozycji (nazwa, ilość, cena, wartość)
- Informacje o produkcji (numer MO, koszty produkcji)
- Daty i terminy
- Informacje o płatnościach

### Uwzględniane filtry:
- Status zamówienia
- Zakres dat (od-do)
- Filtr klienta
- Wyszukiwanie tekstowe

### Format eksportu:
**Nazwa pliku:** `zamowienia_klientow_pozycje_YYYY-MM-DD.csv`

## Struktura eksportowanych danych

| Kolumna | Opis |
|---------|------|
| Numer zamówienia | Numer CO |
| Data zamówienia | Data złożenia zamówienia |
| Nazwa klienta | Nazwa firmy klienta |
| Email klienta | Adres email klienta |
| Telefon klienta | Numer telefonu klienta |
| Adres klienta | Adres klienta |
| Status zamówienia | Aktualny status zamówienia |
| Nr pozycji | Numer pozycji w zamówieniu (1, 2, 3...) |
| Nazwa produktu | Nazwa produktu/usługi |
| Opis produktu | Dodatkowy opis pozycji |
| Ilość | Zamówiona ilość |
| Jednostka | Jednostka miary (szt., kg, m2, itp.) |
| Cena jednostkowa | Cena za jednostkę |
| Wartość pozycji | Ilość × Cena jednostkowa |
| Z listy cenowej | Czy produkt pochodzi z listy cenowej (Tak/Nie) |
| ID zadania produkcyjnego | ID powiązanego zadania MO |
| Numer MO | Numer Manufacturing Order |
| Status produkcji | Status zadania produkcyjnego |
| Koszt produkcji | Koszt produkcji pozycji |
| Łączna wartość pozycji | Wartość pozycji + koszty produkcji |
| Planowana dostawa | Planowana data dostawy |
| Termin realizacji | Termin realizacji zamówienia |
| Data dostawy | Faktyczna data dostawy |
| Koszt dostawy | Koszt dostawy całego zamówienia |
| Łączna wartość zamówienia | Całkowita wartość zamówienia |
| Status płatności | Status płatności |
| Uwagi | Dodatkowe uwagi do zamówienia |
| Utworzone przez | Kto utworzył zamówienie |
| Data utworzenia | Kiedy zamówienie zostało utworzone |
| Data aktualizacji | Ostatnia aktualizacja |

## Logika eksportu

1. **Odświeżanie wartości:**
   - Przed eksportem automatycznie odświeża wszystkie wartości zamówień
   - Aktualizuje koszty produkcji z najnowszych danych zadań MO
   - Przelicza wartości pozycji i całościowe wartości zamówień
   - Synchronizuje dane produkcyjne między zamówieniami a zadaniami

2. **Pobieranie danych:** 
   - Jeśli dane mieszczą się na jednej stronie - używa aktualnie załadowanych zamówień
   - Jeśli jest więcej stron - pobiera wszystkie zamówienia z uwzględnieniem filtrów
   - Pobiera nazwy użytkowników dla pola "Utworzone przez"

3. **Przetwarzanie pozycji:**
   - Każda pozycja zamówienia = osobny wiersz w CSV
   - Łączy dane z `order.productionTasks` z pozycjami przez `orderItemId`
   - Obliczanie wartości z uwzględnieniem kosztów produkcji
   - Obsługa zamówień bez pozycji (dodaje wiersz "BRAK POZYCJI")

4. **Dane kontaktowe klientów:**
   - Priorytet adresów: `shippingAddress` > `billingAddress` > `address`
   - Pobiera email i telefon bezpośrednio z danych klienta

5. **Obliczenia kosztów:**
   - Podstawowa wartość pozycji: `ilość × cena`
   - Łączna wartość pozycji: `podstawowa wartość + koszt produkcji` (jeśli produkt nie z listy cenowej)

6. **Mapowanie użytkowników:**
   - Konwertuje ID użytkowników na ich nazwy wyświetlane (displayName lub email)

## Wykorzystane funkcje

- `getOrdersWithPagination()` - pobieranie zamówień z filtrami
- `getUsersDisplayNames()` - konwersja ID użytkowników na nazwy
- `exportToCSV()` - eksport do pliku CSV
- `formatDateForExport()` - formatowanie dat do eksportu

## Komunikaty dla użytkownika

- **Rozpoczęcie:** "Odświeżanie wartości przed eksportem..."
- **Sukces:** "Odświeżono wartości i wyeksportowano X pozycji z Y zamówień do pliku CSV"
- **Błąd odświeżania:** "Wystąpił błąd podczas odświeżania wartości"
- **Błąd eksportu:** "Nie udało się wyeksportować zamówień do CSV" / szczegóły błędu

## Zgodność z MRP Easy

Eksport jest zaprojektowany zgodnie z formatem znanym z MRP Easy, zawierając wszystkie niezbędne informacje o zamówieniach i ich pozycjach w jednym pliku. 