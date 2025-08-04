# Poprawka problemu z raportami konsumpcji MO

## Problem
Raporty MO nie pobierały konsumpcji materiałów, wykazując brak danych w sekcji konsumpcji.

## Wprowadzone poprawki

### 1. Rozbudowane logowanie debugowe
- Dodano szczegółowe logi dla procesu agregacji konsumpcji
- Sprawdzanie liczby zadań z danymi konsumpcji
- Analiza struktury danych zadań produkcyjnych
- Logowanie każdego kroku przetwarzania konsumpcji

### 2. Ulepszone pobieranie dat konsumpcji
- Dodano obsługę wielokrotnych formatów timestamp (Firestore Timestamp, Date, string, number)
- Implementacja fallback na pole `date` jeśli brak `timestamp`
- Fallback na `updatedAt` i `createdAt` zadania
- Lepsze radzenie sobie z brakującymi datami

### 3. Poprawiona logika filtrowania dat
- Konsumpcja bez daty jest domyślnie uwzględniana w raporcie
- Lepsze komunikaty debugowe o statusie każdej pozycji konsumpcji
- Bardziej elastyczne podejście do dat konsumpcji

### 4. Ulepszone komunikaty błędów
- Szczegółowe komunikaty gdy brak danych konsumpcji
- Wskazówki dla użytkownika o możliwych przyczynach
- Lepsze formatowanie komunikatów o braku danych

### 5. Dodatkowe funkcje debugowe
- `debugTasksStructure()` - analiza struktury zadań
- Statystyki zadań z różnymi polami
- Logowanie wyników agregacji

## Pliki zmodyfikowane
- `src/pages/Production/ProductionReportPage.js`

## Jak testować poprawkę
1. Otwórz konsolę przeglądarki (F12)
2. Przejdź do raportów produkcji → zakładka "Konsumpcja MO"
3. Sprawdź logi w konsoli rozpoczynające się od `[RAPORT KONSUMPCJI]`
4. Logi pokażą:
   - Ile zadań ma dane konsumpcji
   - Jakie problemy występują z datami
   - Dlaczego konsumpcja jest uwzględniana lub pomijana

## Oczekiwane rezultaty
- Jeśli zadania mają dane `consumedMaterials`, powinny być widoczne w raporcie
- Konsumpcja bez dat będzie uwzględniana z fallback datami
- Szczegółowe logi pomogą zdiagnozować problemy z danymi
- Lepsze komunikaty dla użytkownika w przypadku braku danych