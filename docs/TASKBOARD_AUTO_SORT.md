# Automatyczne Sortowanie w Taskboardzie

## Przegląd

Funkcja automatycznego sortowania zadań w kolumnach taskboardu pozwala na organizację zadań według różnych kryteriów, zamiast tylko ręcznego przeciągania.

## Funkcjonalność

### Dostępne Opcje Sortowania

1. **Pozycja (ręcznie)** - domyślne, pozwala na ręczne przeciąganie zadań
2. **Priorytet** - sortuje zadania według priorytetu (Pilny → Wysoki → Średni → Niski → Brak)
3. **Termin wykonania** - sortuje według daty wykonania (najwcześniejsze na górze)
4. **Data utworzenia** - sortuje według daty utworzenia (najnowsze na górze)
5. **Data aktualizacji** - sortuje według ostatniej aktualizacji (najnowsze na górze)
6. **Tytuł (A-Z)** - sortuje alfabetycznie rosnąco
7. **Tytuł (Z-A)** - sortuje alfabetycznie malejąco

### Jak Używać

1. Kliknij ikonę trzech kropek (⋮) w nagłówku kolumny
2. Wybierz "Sortuj według"
3. Wybierz preferowaną opcję sortowania
4. Zadania zostaną automatycznie posortowane

### Wizualne Wskaźniki

- Gdy kolumna jest posortowana automatycznie, pojawia się ikona sortowania (⬍) obok nazwy kolumny
- Najechanie kursorem na ikonę pokazuje aktualną opcję sortowania
- Kursor zmienia się z "grab" na "pointer", aby pokazać że przeciąganie jest wyłączone

### Wyłączone Przeciąganie

Gdy aktywne jest automatyczne sortowanie (każda opcja oprócz "Pozycja (ręcznie)"):
- Przeciąganie zadań jest wyłączone
- Kursor nie zmienia się na "grab"
- Zadania są automatycznie sortowane według wybranego kryterium
- Nowe zadania są automatycznie umieszczane w odpowiedniej pozycji

### Przywracanie Ręcznego Sortowania

Aby wrócić do ręcznego porządkowania zadań:
1. Kliknij menu kolumny (⋮)
2. Wybierz "Sortuj według"
3. Wybierz "Pozycja (ręcznie)"
4. Przeciąganie zadań zostanie ponownie włączone

## Implementacja Techniczna

### Struktura Danych

Preferencje sortowania są przechowywane w dokumencie kolumny w Firestore:

```javascript
{
  id: "column-id",
  boardId: "board-id",
  title: "Do zrobienia",
  position: 0,
  sortBy: "priority", // lub "manual", "dueDate", "createdDate", etc.
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### Komponenty

- **ColumnList.js** - główny komponent obsługujący sortowanie
- **ColumnHeader.js** - nagłówek kolumny z menu sortowania
- **TaskCard.js** - karta zadania z obsługą wyłączania drag & drop

### Funkcje Sortowania

Funkcja `sortTasks` w `ColumnList.js` obsługuje wszystkie opcje sortowania:

```javascript
const sortTasks = useCallback((tasksToSort, sortBy) => {
  switch (sortBy) {
    case 'priority':
      // Sortowanie według priorytetu
    case 'dueDate':
      // Sortowanie według terminu
    case 'createdDate':
      // Sortowanie według daty utworzenia
    // ... inne opcje
  }
}, []);
```

### Usługa Taskboard

Funkcja `updateColumn` w `taskboardService.js` zapisuje preferencje sortowania:

```javascript
await updateColumn(columnId, { sortBy: 'priority' });
```

## Zachowanie

### Aktywne i Ukończone Zadania

Sortowanie działa niezależnie dla:
- Aktywnych zadań (status !== 'completed')
- Ukończonych zadań (status === 'completed')

### Nowe Zadania

Nowe zadania są automatycznie sortowane według wybranego kryterium po dodaniu do kolumny.

### Przenoszenie między Kolumnami

Gdy zadanie jest przenoszone do kolumny z aktywnym sortowaniem automatycznym:
1. Zadanie jest dodawane do kolumny
2. Kolumna jest automatycznie sortowana
3. Zadanie pojawia się w odpowiedniej pozycji

### Real-time Aktualizacje

Zmiany sortowania są natychmiast synchronizowane dla wszystkich użytkowników oglądających tę samą tablicę dzięki real-time listenerom Firestore.

### Optimistic Update

Funkcja wykorzystuje technikę **optimistic update**:
- UI aktualizuje się natychmiast po kliknięciu opcji sortowania
- Nie trzeba czekać na odpowiedź z Firestore
- Jeśli zapis się nie powiedzie, zmiana jest automatycznie cofana
- Lepsze doświadczenie użytkownika (brak opóźnień)

## Lokalizacja

Tłumaczenia dla opcji sortowania dostępne w:
- `src/i18n/locales/pl/taskboard.json`
- `src/i18n/locales/en/taskboard.json`

Kluczowe tłumaczenia:
- `sortBy` - "Sortuj według"
- `sortByManual` - "Pozycja (ręcznie)"
- `sortByPriority` - "Priorytet"
- `sortByDueDate` - "Termin wykonania"
- `autoSort` - "Sortowanie automatyczne"

## Kompatybilność

Funkcja jest w pełni kompatybilna z:
- Istniejącymi tablicami i kolumnami
- Drag & drop (wyłącza się automatycznie gdy potrzebne)
- Mobile/tablet view
- Real-time synchronizacją
- Filtrami ukończonych zadań

## Przyszłe Ulepszenia

Potencjalne rozszerzenia funkcjonalności:
1. Sortowanie według liczby przypisanych osób
2. Sortowanie według liczby podzadań
3. Sortowanie według liczby załączników
4. Grupowanie zadań (np. według priorytetu z sekcjami)
5. Własne reguły sortowania
6. Zapisywanie preferencji sortowania na poziomie użytkownika
