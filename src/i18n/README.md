# Internacjonalizacja (i18n) - React i18next

## Przegląd

Ten projekt używa React i18next do obsługi tłumaczeń między językiem polskim (domyślny) a angielskim. 
Pliki tłumaczeń zostały podzielone na namespace'y dla lepszej organizacji i łatwiejszego zarządzania.

## Struktura plików

```
src/i18n/
├── index.js                    # Główna konfiguracja i18next
├── locales/
│   ├── pl/                     # Polskie tłumaczenia (namespace'y)
│   │   ├── common.json         # Wspólne elementy
│   │   ├── navigation.json     # Nawigacja
│   │   ├── auth.json           # Autoryzacja
│   │   ├── dashboard.json      # Dashboard
│   │   ├── inventory.json      # Magazyn
│   │   ├── production.json     # Produkcja
│   │   ├── orders.json         # Zamówienia
│   │   ├── invoices.json       # Faktury
│   │   ├── customers.json      # Klienci
│   │   ├── suppliers.json      # Dostawcy
│   │   ├── recipes.json        # Receptury
│   │   ├── reports.json        # Raporty
│   │   ├── machines.json       # Maszyny
│   │   ├── purchaseOrders.json # Zamówienia zakupu
│   │   ├── cmr.json            # CMR
│   │   ├── forms.json          # Formularze
│   │   ├── calculator.json     # Kalkulator
│   │   ├── priceLists.json     # Cenniki
│   │   ├── aiAssistant.json    # Asystent AI
│   │   ├── environmentalConditions.json # Warunki środowiskowe
│   │   ├── expiryDates.json    # Daty ważności
│   │   ├── stocktaking.json    # Inwentaryzacja
│   │   ├── interactions.json   # Interakcje
│   │   ├── sidebar.json        # Pasek boczny
│   │   ├── translation.json    # Oryginalny plik (zachowany)
│   │   └── translation.backup.json # Kopia zapasowa
│   └── en/                     # Angielskie tłumaczenia (te same namespace'y)
│       └── ... (analogiczne pliki)
├── scripts/
│   └── split-translations.js   # Skrypt do podziału tłumaczeń
├── i18next-scanner.config.js   # Konfiguracja skanera
└── README.md                   # Ta dokumentacja
```

## Jak używać tłumaczeń z namespace'ami

### 1. Podstawowe użycie - pojedynczy namespace

```jsx
import { useTranslation } from '../../hooks/useTranslation';

function InventoryComponent() {
  // Użyj konkretnego namespace'u
  const { t } = useTranslation('inventory');
  
  return (
    <div>
      <h1>{t('title')}</h1>  {/* Bezpośrednio z namespace'u inventory */}
      <button>{t('newItem')}</button>
    </div>
  );
}
```

### 2. Użycie wielu namespace'ów

```jsx
import { useTranslation } from '../../hooks/useTranslation';

function OrderComponent() {
  // Użyj wielu namespace'ów
  const { t } = useTranslation(['orders', 'common']);
  
  return (
    <div>
      <h1>{t('orders:title')}</h1>        {/* Z namespace orders */}
      <button>{t('common:save')}</button>  {/* Z namespace common */}
      <span>{t('newOrder')}</span>        {/* Domyślnie z pierwszego namespace (orders) */}
    </div>
  );
}
```

### 3. Domyślny namespace (common)

```jsx
import { useTranslation } from '../../hooks/useTranslation';

function MyComponent() {
  // Bez podania namespace'u używa domyślnego (common)
  const { t } = useTranslation();
  
  return (
    <div>
      <button>{t('save')}</button>    {/* Z namespace common */}
      <button>{t('cancel')}</button>  {/* Z namespace common */}
    </div>
  );
}
```

### 2. Użycie niestandardowego hooka

```jsx
import { useTranslation } from '../hooks/useTranslation';

function MyComponent() {
  const { t, isPolish, formatCurrency } = useTranslation();
  
  return (
    <div>
      <h1>{t('common.save')}</h1>
      <p>Język: {isPolish ? 'Polski' : 'Angielski'}</p>
      <p>Cena: {formatCurrency(100.50, 'PLN')}</p>
    </div>
  );
}
```

### 3. Tłumaczenia z interpolacją

```jsx
// W pliku translation.json:
// "welcome": "Witaj {{name}} w systemie"

const { t } = useTranslation();
return <h1>{t('welcome', { name: 'Jan' })}</h1>;
// Wynik: "Witaj Jan w systemie"
```

### 4. Pluralizacja

```jsx
// W pliku translation.json:
// "items": "{{count}} element",
// "items_few": "{{count}} elementy", 
// "items_many": "{{count}} elementów"

const { t } = useTranslation();
return <p>{t('items', { count: 5 })}</p>;
// Wynik: "5 elementów"
```

## Zmiana języka

### Używając komponentu LanguageSwitcher

```jsx
import LanguageSwitcher from '../components/common/LanguageSwitcher';

function Header() {
  return (
    <header>
      <LanguageSwitcher variant="button" />
    </header>
  );
}
```

### Programowo

```jsx
import { useTranslation } from '../../hooks/useTranslation';

function MyComponent() {
  const { i18n } = useTranslation();
  
  const changeToEnglish = () => {
    i18n.changeLanguage('en');
  };
  
  return <button onClick={changeToEnglish}>Switch to English</button>;
}
```

## Organizacja kluczy tłumaczeń

Używamy hierarchicznej struktury kluczy:

```json
{
  "common": {
    "save": "Zapisz",
    "cancel": "Anuluj"
  },
  "navigation": {
    "dashboard": "Dashboard",
    "inventory": "Magazyn"
  },
  "auth": {
    "login": "Zaloguj się",
    "password": "Hasło"
  }
}
```

## Najlepsze praktyki

### 1. Nazywanie kluczy
- Używaj kropkowej notacji: `common.save`, `auth.loginError`
- Grupuj powiązane tłumaczenia: `auth.*`, `navigation.*`
- Używaj opisowych nazw: `loginButton` zamiast `btn1`

### 2. Fallback
```jsx
// Jeśli klucz nie istnieje, wyświetl tekst zapasowy
const { t } = useTranslation();
return <p>{t('missing.key', { fallback: 'Domyślny tekst' })}</p>;
```

### 3. Lazy loading (w przyszłości)
Konfiguracja umożliwia ładowanie tłumaczeń z serwera:
```javascript
// W i18n/index.js
backend: {
  loadPath: '/locales/{{lng}}/{{ns}}.json',
}
```

## ✅ MIGRACJA ZAKOŃCZONA - Kompatybilność wsteczna

### 🎉 Wszystkie istniejące komponenty działają bez zmian!

**Automatyczne mapowanie kluczy:**
- `t('suppliers.title')` → automatycznie mapowane na `suppliers:title`
- `t('inventory.newItem')` → automatycznie mapowane na `inventory:newItem`
- `t('common.save')` → automatycznie mapowane na `common:save`

### Zarządzanie namespace'ami i tłumaczeniami

#### Dodawanie nowych tłumaczeń

1. **Do istniejącego namespace'u:**
   - Dodaj klucz do odpowiedniego pliku, np. `src/i18n/locales/pl/inventory.json`
   - Dodaj tłumaczenie do `src/i18n/locales/en/inventory.json`
   - Użyj w komponencie: `t('inventory.newKey')` (automatyczne mapowanie) lub `t('inventory:newKey')`

2. **Nowy namespace:**
   - Utwórz nowe pliki: `src/i18n/locales/pl/newNamespace.json` i `src/i18n/locales/en/newNamespace.json`
   - Dodaj import w `src/i18n/index.js`
   - Dodaj do listy `ns` w konfiguracji
   - Dodaj do `resources` w obu językach
   - Dodaj mapowanie w `src/hooks/useTranslation.js`

### 📊 Korzyści z migracji

✅ **Plik 3681 linii → 24 pliki (średnio 150 linii)**  
✅ **Lepsza organizacja i łatwiejsze zarządzanie**  
✅ **Zero breaking changes**  
✅ **Możliwość lazy loading w przyszłości**  
✅ **Prostsze dodawanie nowych tłumaczeń**  

### Dostępne skrypty

```bash
# Automatyczny podział dużego pliku translation.json na namespace'y
npm run i18n:split

# Skanowanie kodu w poszukiwaniu kluczy tłumaczeń (i18next-scanner)
npm run i18n:scan
```

### 🔄 Opcje migracji (stopniowo, bez pośpiechu)

**Opcja 1: Nie zmieniaj nic (ZALECANA)**
- Wszystkie istniejące klucze działają automatycznie
- `t('suppliers.title')` działa tak samo jak wcześniej

**Opcja 2: Migracja komponentów z wieloma tłumaczeniami z jednego modułu**
```javascript
// PRZED (nadal działa!):
const { t } = useTranslation();
t('suppliers.title');
t('suppliers.newSupplier');
t('suppliers.editSupplier');

// PO (opcjonalnie, dla lepszej wydajności):
const { t } = useTranslation('suppliers');
t('title');
t('newSupplier');
t('editSupplier');
```

**Opcja 3: Użycie bezpośrednich namespace'ów**
```javascript
// Dla kluczy z różnych namespace'ów:
const { t } = useTranslation();
t('suppliers:title');
t('common:save');
```

## Formatowanie

### Liczby
```jsx
const { formatNumber } = useTranslation();
formatNumber(1234.56); // PL: "1 234,56", EN: "1,234.56"
```

### Daty
```jsx
const { formatDate } = useTranslation();
formatDate(new Date()); // PL: "15.07.2025", EN: "7/15/2025"
```

### Waluty
```jsx
const { formatCurrency } = useTranslation();
formatCurrency(100.50, 'PLN'); // PL: "100,50 zł", EN: "PLN 100.50"
```

## Debugowanie

W trybie deweloperskim:
- Włącz debug w konsoli: `localStorage.setItem('debug', 'i18next:*')`
- Brakujące klucze będą wyświetlane w konsoli
- Klucze są zapisywane do localStorage dla szybszego dostępu

## Migracja z obecnego systemu

1. Zidentyfikuj wszystkie polskie teksty w kodzie
2. Zastąp je kluczami tłumaczeń: `"Zapisz"` → `{t('common.save')}`
3. Dodaj klucze do plików JSON
4. Przetestuj przełączanie języków 