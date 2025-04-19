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

## Technologie

- **Frontend**: React, Material-UI
- **Backend**: Firebase (Firestore, Authentication)
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

4. Utwórz plik `.env.local` w głównym katalogu projektu i dodaj dane konfiguracyjne Firebase:
```
REACT_APP_FIREBASE_API_KEY=twoj-api-key
REACT_APP_FIREBASE_AUTH_DOMAIN=twoj-auth-domain
REACT_APP_FIREBASE_PROJECT_ID=twoj-project-id
REACT_APP_FIREBASE_STORAGE_BUCKET=twoj-storage-bucket
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=twoj-messaging-sender-id
REACT_APP_FIREBASE_APP_ID=twoj-app-id
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
|   |-- recipeService.js    # Usługi zarządzania recepturami
|   |-- productionService.js # Usługi planowania produkcji
|   |-- inventoryService.js # Usługi zarządzania magazynem
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