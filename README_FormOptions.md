# Zarządzanie opcjami formularzy

## Opis funkcjonalności

System zarządzania opcjami formularzy pozwala administratorom na dynamiczne zarządzanie opcjami wyboru w formularzach produkcyjnych. Opcje są przechowywane w bazie danych Firestore zamiast być zakodowane na stałe w aplikacji.

## Funkcje

### Dla administratorów:
- **Dodawanie nowych opcji** - możliwość dodawania nowych wartości do list wyboru
- **Edycja istniejących opcji** - modyfikacja wartości, kolejności i statusu aktywności
- **Usuwanie opcji** - usuwanie niepotrzebnych opcji z systemu
- **Zarządzanie kolejnością** - ustawianie kolejności wyświetlania opcji
- **Aktywacja/deaktywacja** - tymczasowe wyłączanie opcji bez ich usuwania
- **Migracja z kodu** - jednorazowe przeniesienie istniejących opcji z kodu do bazy danych

### Dla użytkowników:
- **Automatyczne ładowanie opcji** - opcje są pobierane z bazy danych w czasie rzeczywistym
- **Fallback do opcji domyślnych** - w przypadku problemów z bazą danych używane są opcje domyślne
- **Wskaźniki ładowania** - informacja o stanie ładowania opcji

## Kategorie opcji

System obsługuje następujące kategorie opcji:

1. **Pracownicy - Imię i nazwisko** (`staff`)
   - Używane w polach "Imię i nazwisko" w formularzach
   - Przykłady: "Valentyna Tarasiuk", "Seweryn Burandt"

2. **Stanowiska** (`positions`)
   - Używane w polach "Stanowisko" w formularzach
   - Przykłady: "Mistrz produkcji", "Kierownik Magazynu"

3. **Pracownicy zmian** (`shiftWorkers`)
   - Używane w formularzach zmian produkcyjnych
   - Przykłady: "Luis Carlos Tapiero", "Ewa Bojke"

4. **Produkty** (`products`)
   - Używane w polach wyboru produktów
   - Przykłady: "BLC-COLL-GLYC", "BW3Y-Glycine"

## Struktura danych

### Kolekcja `formOptions`

```javascript
{
  id: "auto-generated-id",
  type: "staff", // Typ opcji (staff, positions, shiftWorkers, products)
  value: "Valentyna Tarasiuk", // Wartość opcji
  order: 0, // Kolejność wyświetlania
  isActive: true, // Czy opcja jest aktywna
  createdAt: Timestamp,
  createdBy: "user-id",
  updatedAt: Timestamp,
  updatedBy: "user-id"
}
```

## Dostęp do funkcjonalności

### Dla administratorów:
1. Zaloguj się jako administrator
2. Przejdź do menu użytkownika (avatar w prawym górnym rogu)
3. Wybierz "Narzędzia systemowe"
4. Znajdź sekcję "Zarządzanie opcjami formularzy"

### Interfejs zarządzania:
- **Kategoria opcji** - wybór typu opcji do zarządzania
- **Lista opcji** - wyświetlenie wszystkich opcji dla wybranej kategorii
- **Dodaj opcję** - przycisk do dodawania nowych opcji
- **Migruj** - przycisk do migracji opcji z kodu (jednorazowe użycie)
- **Odśwież** - przycisk do odświeżenia listy opcji

## Implementacja techniczna

### Serwisy:
- `src/services/formOptionsService.js` - główny serwis do zarządzania opcjami
- `src/hooks/useFormOptions.js` - hooki do pobierania opcji w komponentach

### Komponenty:
- `src/components/admin/FormOptionsManager.js` - interfejs zarządzania dla administratorów
- `src/components/common/FormOptionsLoader.js` - komponent ładowania opcji

### Zaktualizowane formularze:
- `src/components/production/ProductionControlForm.js`
- `src/components/production/ProductionShiftForm.js`

### Indeksy Firestore:
Dodane indeksy dla optymalizacji zapytań:
- `type + isActive + order`
- `type + isActive + value`
- `type + order + value`

## Migracja z istniejącego systemu

### Automatyczna migracja:
1. Przejdź do zarządzania opcjami formularzy
2. Wybierz kategorię opcji
3. Kliknij przycisk "Migruj"
4. Potwierdź migrację

Migracja:
- Dodaje tylko opcje, które jeszcze nie istnieją w bazie danych
- Zachowuje istniejące opcje bez zmian
- Wyświetla raport z liczby zmigrowanych opcji

### Ręczna migracja:
Możesz również dodawać opcje ręcznie:
1. Kliknij "Dodaj opcję"
2. Wprowadź wartość opcji
3. Ustaw kolejność (opcjonalnie)
4. Zapisz opcję

## Bezpieczeństwo

- Tylko administratorzy mają dostęp do zarządzania opcjami
- Wszystkie operacje są logowane (createdBy, updatedBy)
- Usuwanie opcji wymaga potwierdzenia
- Opcje nieaktywne są ukryte dla użytkowników, ale zachowane w systemie

## Obsługa błędów

- W przypadku problemów z bazą danych używane są opcje domyślne
- Wyświetlane są odpowiednie komunikaty o błędach
- System gracefully degraduje do trybu offline

## Wydajność

- Opcje są cache'owane w komponentach
- Używane są indeksy Firestore dla szybkich zapytań
- Minimalna liczba zapytań do bazy danych

## Przyszłe rozszerzenia

Planowane funkcjonalności:
- Drag & drop do zmiany kolejności opcji
- Import/export opcji z plików CSV
- Historia zmian opcji
- Grupowanie opcji w kategorie
- Walidacja unikalności opcji 