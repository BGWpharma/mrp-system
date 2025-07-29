# Wyświetlanie rezerwacji partii w dialogu przenoszenia

## Opis funkcjonalności

W sekcji "Zarządzaj partiami" w dialogu przenoszenia partii dodano funkcjonalność wyświetlającą informacje o rezerwacjach partii przez zamówienia produkcyjne (MO).

## Dodane funkcje

### 1. Automatyczne pobieranie rezerwacji
- Przy otwieraniu dialogu przenoszenia partii system automatycznie pobiera wszystkie aktywne rezerwacje dla danej partii
- Dane obejmują informacje o zadaniach produkcyjnych, klientach i ilościach zarezerwowanych

### 2. Wyświetlanie informacji o rezerwacjach
- **Małe okienko z rezerwacjami**: Kompaktowy widok z przewijaniem pokazujący wszystkie MO które zarezerwowały daną partię
- **Szczegółowe informacje**: Numer MO, zarezerwowana ilość, nazwa klienta, data rezerwacji
- **Przyciski przekierowania**: Bezpośrednie linki do szczegółów każdego MO

### 3. Walidacja transferu względem rezerwacji
- System sprawdza czy planowana ilość do przeniesienia nie przekracza dostępnej ilości (po odjęciu rezerwacji)
- Wyświetla ostrzeżenia gdy transfer może wpłynąć na aktywne rezerwacje
- Pokazuje dostępną ilość do przeniesienia w czasie rzeczywistym

## Implementacja techniczna

### Zmiany w BatchesPage.js
```javascript
// Nowe stany
const [batchReservations, setBatchReservations] = useState([]);
const [loadingReservations, setLoadingReservations] = useState(false);

// Funkcja pobierania rezerwacji przy otwieraniu dialogu
const openTransferDialog = async (batch) => {
  // ... pobieranie i wzbogacanie danych o rezerwacjach
  const enrichedReservations = await Promise.all(
    reservations.map(async (reservation) => {
      const taskDetails = await getTaskById(taskId);
      return { ...reservation, taskDetails, moNumber: taskDetails?.moNumber };
    })
  );
};

// Walidacja uwzględniająca rezerwacje
const validateTransferForm = () => {
  if (batchReservations.length > 0) {
    const totalReserved = batchReservations.reduce((sum, res) => sum + parseFloat(res.quantity), 0);
    const availableForTransfer = selectedBatch.quantity - totalReserved;
    // ... walidacja
  }
};
```

### Komponenty UI
- **Sekcja rezerwacji**: Przewijalne okienko z listą aktywnych rezerwacji
- **Wskaźnik dostępności**: Informacja o ilości dostępnej do przeniesienia
- **Linki nawigacyjne**: Przyciski przekierowania do szczegółów MO

## Korzyści

1. **Lepsza kontrola**: Użytkownicy widzą jakie MO będą dotknięte transferem partii
2. **Zapobieganie błędom**: System blokuje transfery które mogłyby uszkodzić rezerwacje
3. **Łatwa nawigacja**: Bezpośrednie linki do MO ułatwiają weryfikację szczegółów
4. **Przejrzystość**: Wszystkie informacje o rezerwacjach w jednym miejscu

## Wykorzystane API

- `getBatchReservations(batchId)` - pobieranie rezerwacji dla partii
- `getTaskById(taskId)` - szczegóły zadań produkcyjnych
- Funkcje walidacji uwzględniające rezerwacje

## Obsługa błędów

- Graceful fallback gdy nie można pobrać szczegółów MO
- Wyświetlanie ostrzeżeń o problemach z ładowaniem
- Walidacja przed wykonaniem transferu 