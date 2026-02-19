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
│   │   └── ... (inne namespace'y)
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
  const { t } = useTranslation('inventory');
  
  return (
    <div>
      <h1>{t('title')}</h1>
      <button>{t('newItem')}</button>
    </div>
  );
}
```

### 2. Użycie wielu namespace'ów

```jsx
import { useTranslation } from '../../hooks/useTranslation';

function OrderComponent() {
  const { t } = useTranslation(['orders', 'common']);
  
  return (
    <div>
      <h1>{t('orders:title')}</h1>
      <button>{t('common:save')}</button>
    </div>
  );
}
```

### 3. Domyślny namespace (common)

```jsx
const { t } = useTranslation();
<button>{t('save')}</button>
```

### 4. Tłumaczenia z interpolacją

```jsx
// W pliku translation.json:
// "welcome": "Witaj {{name}} w systemie"

return <h1>{t('welcome', { name: 'Jan' })}</h1>;
```

### 5. Pluralizacja

```jsx
// W pliku translation.json:
// "items": "{{count}} element",
// "items_few": "{{count}} elementy", 
// "items_many": "{{count}} elementów"

return <p>{t('items', { count: 5 })}</p>;
```

## Zmiana języka

### Używając komponentu LanguageSwitcher

```jsx
import LanguageSwitcher from '../components/common/LanguageSwitcher';

<LanguageSwitcher variant="button" />
```

### Programowo

```jsx
const { i18n } = useTranslation();
i18n.changeLanguage('en');
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
return <p>{t('missing.key', { fallback: 'Domyślny tekst' })}</p>;
```

### 3. Lazy loading (w przyszłości)
Konfiguracja umożliwia ładowanie tłumaczeń z serwera

## ✅ MIGRACJA ZAKOŃCZONA - Kompatybilność wsteczna

**Automatyczne mapowanie kluczy:**
- `t('suppliers.title')` → automatycznie mapowane na `suppliers:title`
- `t('inventory.newItem')` → automatycznie mapowane na `inventory:newItem`
- `t('common.save')` → automatycznie mapowane na `common:save`

### Zarządzanie namespace'ami i tłumaczeniami

#### Dodawanie nowych tłumaczeń

1. **Do istniejącego namespace'u:**
   - Dodaj klucz do odpowiedniego pliku, np. `src/i18n/locales/pl/inventory.json`
   - Dodaj tłumaczenie do `src/i18n/locales/en/inventory.json`
   - Użyj w komponencie: `t('inventory.newKey')` lub `t('inventory:newKey')`

2. **Nowy namespace:**
   - Utwórz nowe pliki w `src/i18n/locales/pl/` i `src/i18n/locales/en/`
   - Dodaj import w `src/i18n/index.js`
   - Dodaj do listy `ns` w konfiguracji
   - Dodaj do `resources` w obu językach
   - Dodaj mapowanie w `src/hooks/useTranslation.js`

### Dostępne skrypty

```bash
# Automatyczny podział dużego pliku translation.json na namespace'y
npm run i18n:split

# Skanowanie kodu w poszukiwaniu kluczy tłumaczeń (i18next-scanner)
npm run i18n:scan
```

### Korzyści z migracji

✅ **Plik 3681 linii → 24 pliki (średnio 150 linii)**  
✅ **Lepsza organizacja i łatwiejsze zarządzanie**  
✅ **Zero breaking changes**  
✅ **Możliwość lazy loading w przyszłości**  
✅ **Prostsze dodawanie nowych tłumaczeń**  

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

## Migracja z obecnego systemu

1. Zidentyfikuj wszystkie polskie teksty w kodzie
2. Zastąp je kluczami tłumaczeń: `"Zapisz"` → `{t('common.save')}`
3. Dodaj klucze do plików JSON
4. Przetestuj przełączanie języków
