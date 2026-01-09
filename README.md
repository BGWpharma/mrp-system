# System MRP (Minimum Viable Product)

System zarządzania produkcją i zasobami w wersji MVP (Minimum Viable Product).

## Funkcjonalności

MVP systemu zawiera cztery kluczowe moduły:

1. **Zarządzanie recepturami**
   - Tworzenie i edycja receptur
   - Zarządzanie składnikami
   - Historia wersji receptur

2. **Planowanie produkcji**
   - Tworzenie i zarządzanie zadaniami produkcyjnymi
   - Planowanie z wykorzystaniem receptur
   - Śledzenie statusu zadań

3. **Zarządzanie magazynem**
   - Ewidencja stanów magazynowych
   - Przyjęcie i wydanie towaru
   - Śledzenie historii transakcji

4. **Kontrola jakości**
   - Definiowanie testów jakościowych
   - Rejestrowanie wyników testów
   - Zarządzanie zgodnością jakościową

### System Zarządzania Zasobami Przedsiębiorstwa (MRP)

#### Zamówienia Zakupu
- Tworzenie i edycja zamówień zakupu
- Wielowalutowe rozliczenia z automatycznym przeliczaniem kursów
- Zarządzanie dostawcami i ich cenami
- **NOWE: Załączniki do zamówień zakupu**
  - Możliwość załączania plików (faktury, certyfikaty, dokumenty)
  - Obsługa drag & drop
  - Przechowywanie w Firebase Storage
  - Obsługiwane formaty: PDF, obrazy (JPEG, PNG, GIF, WebP), dokumenty Word/Excel, pliki tekstowe
  - Maksymalny rozmiar pliku: 10 MB
  - Automatyczne generowanie miniatur i metadanych
- Statusy realizacji zamówień
- Integracja z systemem magazynowym
- Automatyczne aktualizacje cen partii magazynowych

#### Zarządzanie Magazynem

## Technologie

- **Frontend**: React, Material-UI
- **Backend**: Firebase (Firestore, Authentication)
- **Error Tracking**: Sentry.io (monitoring błędów i wydajności)
- **Dodatki**: React Router, Date-fns

## Wymagania

- Node.js (wersja 14 lub nowsza)
- npm lub yarn
- Konto Firebase

## Instalacja

1. Klonuj repozytorium:
```
git clone https://github.com/twoja-organizacja/mrp-system.git
cd mrp-system
```

2. Zainstaluj zależności:
```
npm install
```

3. Utwórz projekt w Firebase Console:
   - Przejdź do [Firebase Console](https://console.firebase.google.com/)
   - Utwórz nowy projekt
   - Dodaj aplikację typu Web
   - Skopiuj dane konfiguracyjne

4. Utwórz plik `.env.local` w głównym katalogu projektu i dodaj dane konfiguracyjne:
```
# Firebase Configuration
REACT_APP_FIREBASE_API_KEY=twoj-api-key
REACT_APP_FIREBASE_AUTH_DOMAIN=twoj-auth-domain
REACT_APP_FIREBASE_PROJECT_ID=twoj-project-id
REACT_APP_FIREBASE_STORAGE_BUCKET=twoj-storage-bucket
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=twoj-messaging-sender-id
REACT_APP_FIREBASE_APP_ID=twoj-app-id

# Sentry Configuration (opcjonalne)
REACT_APP_SENTRY_DSN=twoj-sentry-dsn
REACT_APP_SENTRY_ENVIRONMENT=development
```

5. Uruchom aplikację w trybie deweloperskim:
```
npm start
```

## Struktura projektu

```
src/
|-- assets/                 # Pliki statyczne (style, obrazy)
|-- components/             # Komponenty współdzielone
|   |-- common/             # Komponenty ogólne
|   |-- recipes/            # Komponenty zarządzania recepturami
|   |-- production/         # Komponenty planowania produkcji
|   |-- inventory/          # Komponenty zarządzania magazynem
|   |-- quality/            # Komponenty kontroli jakości
|
|-- contexts/               # Konteksty React (auth, notification)
|-- hooks/                  # Hooki niestandardowe
|-- pages/                  # Komponenty stron
|   |-- Auth/               # Strony autoryzacji
|   |-- Dashboard/          # Dashboard
|   |-- Recipes/            # Strony modułu receptur
|   |-- Production/         # Strony modułu produkcji
|   |-- Inventory/          # Strony modułu magazynowego
|   |-- Quality/            # Strony modułu jakości
|
|-- services/               # Usługi (komunikacja z API)
|   |-- firebase/           # Konfiguracja Firebase
|   |-- inventory/          # Zmodularyzowany system magazynowy (refaktoryzacja z inventoryService.js)
|   |   |-- config/         # Konfiguracja i stałe Firebase
|   |   |-- utils/          # Funkcje pomocnicze i walidacja
|   |   |-- warehouseService.js       # Zarządzanie magazynami
|   |   |-- inventoryItemsService.js  # CRUD pozycji magazynowych
|   |   |-- batchService.js           # Zarządzanie partiami/LOT
|   |   |-- inventoryOperationsService.js # Przyjęcia/wydania (FIFO/FEFO)
|   |   |-- reservationService.js     # System rezerwacji i bookowania
|   |   |-- transactionService.js     # Historia zmian i analityka
|   |   |-- stocktakingService.js     # Inwentaryzacja (spis z natury)
|   |   |-- supplierPriceService.js   # Zarządzanie cenami dostawców
|   |   `-- index.js        # Główny punkt eksportu wszystkich funkcji
|   |-- recipeService.js    # Usługi zarządzania recepturami
|   |-- productionService.js # Usługi planowania produkcji
|   |-- qualityService.js   # Usługi kontroli jakości
|
|-- utils/                  # Funkcje pomocnicze
|-- App.js                  # Główny komponent aplikacji
|-- index.js                # Punkt wejściowy aplikacji
|-- routes.js               # Konfiguracja tras
```

## Konfiguracja Firebase

1. W konsoli Firebase włącz Authentication:
   - Włącz metodę logowania przez Email/Hasło
   - Opcjonalnie włącz metodę logowania przez Google
   
2. Skonfiguruj Firestore Database:
   - Utwórz bazę danych w trybie produkcyjnym
   - Ustaw reguły bezpieczeństwa (przykład poniżej)

Przykładowe reguły Firestore:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

## Rozwój projektu

Po uruchomieniu MVP, kolejne kroki rozwoju mogą obejmować:

1. Dodanie zaawansowanego raportowania i analityki
2. Integrację z systemem zamówień i CRM
3. Rozbudowę modułu planowania o harmonogramowanie zasobów
4. Dodanie mechanizmów prognozowania i optymalizacji zapasów
5. Implementację API dla integracji z innymi systemami
6. Rozbudowę modułu kontroli jakości o zaawansowane funkcje GMP

## Licencja

[Wybierz odpowiednią licencję]

## Wsparcie

W przypadku pytań lub problemów, skontaktuj się z:
[mateusz@bgwpahrma.com]

## Limity wiadomości do asystenta AI

W systemie wprowadzono limit liczby wiadomości, które użytkownik może wysłać do asystenta AI w ciągu miesiąca:
- Administrator: 250 wiadomości miesięcznie
- Pracownik: 50 wiadomości miesięcznie

Limity są automatycznie odnawiane na początku każdego miesiąca. Informacja o dostępnych wiadomościach jest widoczna na stronie asystenta AI w formie paska postępu.

### Zarządzanie limitami

Limit wiadomości jest ustawiany automatycznie na podstawie roli użytkownika. Zmiana roli użytkownika z poziomu panelu administracyjnego (Pracownik ↔ Administrator) automatycznie aktualizuje limit wiadomości.

### Migracja danych

Dla istniejących użytkowników można uruchomić migrację limitów poprzez panel administracyjny w sekcji "Narzędzia systemowe". Migracja przypisuje limity na podstawie ról: administratorzy otrzymują 250 wiadomości, a pracownicy 50.

## Optymalizacja wydajności dashboardu

W celu poprawy wydajności dashboardu i ograniczenia zbędnych zapytań do bazy danych wprowadzono następujące optymalizacje:

### 1. Mechanizm cache'owania
- Dodano cache po stronie klienta dla funkcji:
  - `getKpiData` w `analyticsService.js`
  - `getTasksByStatus` w `productionService.js` 
  - `getOrdersStats` w `orderService.js`
- Każda funkcja przechowuje wyniki w pamięci podręcznej przez 60 sekund
- Dodano flagi `fetchInProgress` zapobiegające równoległym zapytaniom o te same dane

### 2. Blokowanie równoległych zapytań
- Każda funkcja potrafi wykryć, że już trwa pobieranie danych
- Dodano mechanizm oczekiwania na zakończenie równoległego zapytania
- Zabezpieczenia przed nieskończonym oczekiwaniem (timeout)

### 3. Optymalizacja komponentu Dashboard
- Dodano zabezpieczenia przed równoległymi wywołaniami funkcji pobierających dane
- Ulepszono mechanizm `Promise.all` do ładowania danych
- Dodano obsługę błędów dla każdego pojedynczego zapytania
- Wprowadzono flagę `isMounted` zapobiegającą aktualizacji stanu po odmontowaniu komponentu

### 4. Inne usprawnienia
- Funkcje używają teraz bezpośrednio niższego poziomu API zamiast funkcji pomocniczych
- Dodano zależności do funkcji `useCallback` aby dokładniej śledzić stan

Te optymalizacje znacząco zmniejszą liczbę zapytań do bazy danych podczas ładowania dashboardu oraz zapobiegną typowym problemom związanym z równoległym wykonywaniem tego samego zapytania z różnych części aplikacji.

## Historia zmian

### [Nowe] - Poprawki responsywności w widoku magazynowym

- Dodano responsywny układ przycisków w szczegółach pozycji magazynowej dla widoku mobilnego
- Przyciski "Odśwież ilość", "Edytuj", "Zarządzaj partiami" i "Drukuj etykietę" dostosowano do ekranów mobilnych
- Przyciski "Przyjmij" i "Wydaj" są teraz układane w kolumnie na małych ekranach
- Dodano responsywność do strony zarządzania partiami - przyciski w nagłówku dostosowano do widoku mobilnego
- Uproszczono tabelę partii w widoku mobilnym pokazując tylko najważniejsze kolumny
- Zoptymalizowano paginację w widoku partii dla urządzeń mobilnych

## 🛡️ Monitoring błędów z Sentry.io

System jest zintegrowany z Sentry.io dla kompleksowego monitorowania błędów i wydajności aplikacji.

### Co jest monitorowane?

✅ **Automatycznie:**
- Wszystkie nieobsłużone błędy JavaScript
- Błędy w komponentach React (przez ErrorBoundary)
- Wszystkie wywołania `console.error()` w produkcji
- Błędy w asynchronicznych operacjach
- Performance metrics (czasy ładowania, transakcje)
- Session Replay (nagrania sesji z błędami)

### Narzędzia dla developerów

W katalogu `src/utils/` znajdziesz:
- **`errorHandler.js`** - Główne funkcje obsługi błędów
- **`firebaseErrorHandler.js`** - Wrappery dla Firebase + **performance tracking**
- **`sentryContext.js`** - 🆕 Custom context (dane biznesowe: task, order, inventory)
- **`SENTRY_ERROR_HANDLING.md`** - Pełna dokumentacja
- **`FIREBASE_PERFORMANCE.md`** - Dokumentacja performance tracking
- **`SENTRY_ADVANCED_FEATURES.md`** - 🆕 Source Maps, Release Tracking, User Feedback
- **`sentryExamples.js`** - 10+ przykładów użycia
- **`README_SENTRY.md`** - Quick start guide

### Szybki start

```javascript
// 1. Podstawowa obsługa błędów
import { handleError } from './utils/errorHandler';

try {
  await someOperation();
} catch (error) {
  handleError(error, 'myService.myFunction', { userId: '123' });
}

// 2. Firebase operacje
import { withFirebaseErrorHandling } from './utils/firebaseErrorHandler';

const task = await withFirebaseErrorHandling(
  () => getDoc(doc(db, 'tasks', taskId)),
  'taskService.getTask',
  { taskId }
);

// 3. Breadcrumbs (śledzenie akcji użytkownika)
import { addBreadcrumb } from './utils/errorHandler';

addBreadcrumb('User clicked submit', 'user-action', 'info');
```

### Testowanie

W **Admin → Narzędzia systemowe** znajdziesz sekcję "Test Sentry Error Tracking" z dwoma przyciskami:
- **"Break the world"** - testuje pełny błąd JavaScript (ErrorBoundary)
- **"Test Message"** - testuje tylko logowanie wiadomości

### Konfiguracja

W pliku `.env.local` dodaj:
```env
REACT_APP_SENTRY_DSN=twoj-sentry-dsn
REACT_APP_SENTRY_ENVIRONMENT=development  # lub 'production'
```

### Przyjazne komunikaty błędów

System automatycznie tłumaczy kody błędów Firebase na przyjazne komunikaty po polsku:
- `permission-denied` → "Brak uprawnień do wykonania tej operacji"
- `not-found` → "Nie znaleziono dokumentu"
- `auth/wrong-password` → "Nieprawidłowe hasło"
- ...i wiele innych

### Dodatkowe funkcje

- **User Context**: Każdy błąd zawiera informacje o zalogowanym użytkowniku
- **Breadcrumbs**: Automatyczne śledzenie nawigacji i akcji przed błędem
- **Extra Data**: Możliwość dodania kontekstu do każdego błędu
- **Filtrowanie**: Automatyczne filtrowanie błędów z rozszerzeń przeglądarki
- **Performance**: Monitoring wydajności aplikacji (10% transakcji w produkcji)
- **Firebase Performance**: Automatyczne śledzenie czasu operacji Firebase, wolne zapytania (>1.5s)
- **🆕 Source Maps**: Czytelne stack traces w produkcji
- **🆕 Release Tracking**: Śledzenie błędów per wersja, porównywanie stabilności
- **🆕 User Feedback**: Użytkownicy mogą zgłaszać szczegóły problemów
- **🆕 Custom Context**: Automatyczne dodawanie danych biznesowych (task, order, inventory)

Więcej informacji: [`src/utils/SENTRY_ERROR_HANDLING.md`](src/utils/SENTRY_ERROR_HANDLING.md)