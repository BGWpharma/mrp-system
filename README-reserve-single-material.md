# Rezerwacja Pojedynczych Surowców w Zleceniach Produkcyjnych

## Wprowadzone zmiany

Zaimplementowano możliwość rezerwacji pojedynczych surowców w zleceniach produkcyjnych (MO) zamiast konieczności rezerwowania wszystkich surowców na raz.

### Główne zmiany w pliku `src/pages/Production/TaskDetailsPage.js`:

1. **Dodano przyciski rezerwacji dla pojedynczych materiałów**:
   - Każdy materiał w widoku ręcznej rezerwacji ma teraz przycisk "Rezerwuj ten materiał"
   - Przycisk jest dostępny tylko gdy materiał ma wystarczającą ilość przypisanych partii
   - Materiały już zarezerwowane mają oznaczenie i zablokowany przycisk rezerwacji

2. **Rozszerzono funkcję `handleReserveMaterials`**:
   - Dodano parametr `singleMaterialId` pozwalający na rezerwację pojedynczego materiału
   - Implementacja sprawdza czy materiał jest już zarezerwowany, aby uniknąć podwójnej rezerwacji
   - Wprowadzono oddzielną ścieżkę dla rezerwacji wszystkich materiałów i pojedynczego materiału

3. **Dodano funkcję `validateManualBatchSelectionForMaterial`**:
   - Sprawdza czy dla pojedynczego materiału wybrano wystarczającą ilość partii
   - Zapobiega rezerwacji z niewystarczającą ilością materiału

4. **Ulepszono interfejs użytkownika**:
   - Dodano Alert z informacją o możliwości rezerwacji pojedynczych materiałów
   - Zaktualizowano etykietę głównego przycisku na "Rezerwuj wszystkie materiały"
   - Dodano oznaczenia dla już zarezerwowanych materiałów

## Korzyści

- Elastyczność w procesie rezerwacji materiałów - można rezerwować materiały w małych partiach
- Możliwość rezerwacji tylko dostępnych materiałów, bez blokowania całego procesu produkcji
- Uproszczenie procesów produkcyjnych, szczególnie w przypadku braku niektórych surowców

## Jak używać

1. W szczegółach zlecenia produkcyjnego kliknij przycisk "Zarezerwuj materiały"
2. Wybierz metodę "Ręczny wybór partii"
3. Dla każdego materiału wybierz odpowiednie partie i ilości
4. Aby zarezerwować pojedynczy materiał:
   - Kliknij przycisk "Rezerwuj ten materiał" przy konkretnym materiale
5. Aby zarezerwować wszystkie materiały jednocześnie:
   - Kliknij przycisk "Rezerwuj wszystkie materiały" na dole okna dialogowego 