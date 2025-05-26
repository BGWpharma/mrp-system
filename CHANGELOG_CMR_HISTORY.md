# Historia CMR - Zmiany w systemie

## Problem
Wcześniej system przechowywał tylko ostatni numer CMR (`lastCmrNumber`) dla każdej pozycji zamówienia. Gdy towar był wysyłany na kilku różnych CMR-ach, wyświetlany był tylko ostatni numer CMR, co utrudniało śledzenie wszystkich wysyłek.

## Rozwiązanie
Wprowadzono nowy system historii CMR, który przechowuje wszystkie dokumenty CMR powiązane z każdą pozycją zamówienia.

## Wprowadzone zmiany

### 1. Struktura danych
**Nowe pole w pozycjach zamówienia:**
```javascript
item: {
  // ... istniejące pola
  cmrHistory: [
    {
      cmrNumber: "CMR-20241201-0001",
      quantity: 5,
      shipmentDate: "2024-12-01T10:30:00.000Z",
      unit: "szt."
    },
    {
      cmrNumber: "CMR-20241201-0002", 
      quantity: 3,
      shipmentDate: "2024-12-01T14:15:00.000Z",
      unit: "szt."
    }
  ]
}
```

### 2. Zmodyfikowane pliki

#### `src/services/orderService.js`
- **Funkcja `updateOrderItemShippedQuantity`**: Dodano logikę tworzenia i aktualizacji historii CMR
- **Nowa funkcja `migrateCmrHistoryData`**: Migruje istniejące dane z `lastCmrNumber` do nowego formatu `cmrHistory`
- **Obsługa duplikatów**: Jeśli CMR już istnieje w historii, aktualizuje ilość zamiast tworzyć duplikat

#### `src/services/cmrService.js`
- **Funkcja `updateCmrDocument`**: Dodano wywołanie aktualizacji ilości wysłanych przy edycji CMR
- **Funkcja `updateLinkedOrderShippedQuantities`**: Pozostaje bez zmian, ale teraz korzysta z nowej logiki w `orderService`

#### `src/components/orders/OrderDetails.js`
- **Kolumna "Wysłano"**: Zmodyfikowano wyświetlanie, aby pokazywać wszystkie CMR z historii
- **Dodano przycisk migracji**: Tymczasowy przycisk do uruchomienia migracji danych (do usunięcia po wdrożeniu)
- **Kompatybilność wsteczna**: Nadal obsługuje stary format z `lastCmrNumber`

### 3. Wyświetlanie w interfejsie

**Przed zmianami:**
```
Wysłano: 8 szt.
CMR: CMR-20241201-0002
```

**Po zmianach:**
```
Wysłano: 8 szt.
CMR: CMR-20241201-0001 (5 szt.)
CMR: CMR-20241201-0002 (3 szt.)
```

### 4. Kompatybilność wsteczna
- System nadal obsługuje stary format z `lastCmrNumber`
- Funkcja migracji automatycznie konwertuje istniejące dane
- Jeśli `cmrHistory` nie istnieje, system wyświetla `lastCmrNumber`

### 5. Testowanie

#### Plik testowy: `src/utils/testCmrHistory.js`
Zawiera funkcje do testowania nowej funkcjonalności:
- `testCmrHistory()` - symuluje dodawanie wielu CMR do pozycji
- `runMigration()` - uruchamia migrację danych
- `sampleTestData` - przykładowe dane testowe

#### Instrukcje testowania:
1. Uruchom migrację: `runMigration()`
2. Przetestuj dodawanie CMR: `testCmrHistory('order-id', testData)`
3. Sprawdź w interfejsie czy wszystkie CMR są wyświetlane

### 6. Wdrożenie

#### Kroki wdrożenia:
1. **Backup bazy danych** - przed wdrożeniem
2. **Wdrożenie kodu** - wszystkie zmiany są kompatybilne wstecz
3. **Uruchomienie migracji** - użyj przycisku "Migruj CMR" lub funkcji `migrateCmrHistoryData()`
4. **Weryfikacja** - sprawdź czy dane zostały poprawnie zmigrowane
5. **Usunięcie przycisku migracji** - po zakończeniu migracji

#### Rollback:
W przypadku problemów system automatycznie używa starych pól (`lastCmrNumber`), więc rollback nie wymaga migracji danych.

### 7. Korzyści
- **Pełna historia wysyłek** - wszystkie CMR są widoczne dla każdej pozycji
- **Lepsza kontrola** - łatwiejsze śledzenie częściowych wysyłek
- **Dokładność** - precyzyjne informacje o ilościach w każdym CMR
- **Kompatybilność** - bezproblemowe przejście ze starego systemu

### 8. Uwagi techniczne
- Nowe pole `cmrHistory` jest tablicą obiektów
- Każdy wpis zawiera: numer CMR, ilość, datę wysyłki, jednostkę
- System automatycznie sumuje ilości z historii CMR
- Obsługa duplikatów - aktualizacja istniejących wpisów zamiast tworzenia nowych

### 9. Przyszłe ulepszenia
- Możliwość edycji historii CMR z poziomu interfejsu
- Eksport historii wysyłek do raportów
- Integracja z systemem śledzenia przesyłek
- Powiadomienia o częściowych wysyłkach 