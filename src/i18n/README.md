# Internacjonalizacja (i18n) - React i18next

## Przegląd

Ten projekt używa React i18next do obsługi tłumaczeń między językiem polskim (domyślny) a angielskim.

## Struktura plików

```
src/i18n/
├── index.js                    # Główna konfiguracja i18next
├── locales/
│   ├── pl/
│   │   └── translation.json    # Polskie tłumaczenia
│   └── en/
│       └── translation.json    # Angielskie tłumaczenia
└── README.md                   # Ta dokumentacja
```

## Jak używać tłumaczeń

### 1. Podstawowe użycie w komponentach

```jsx
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation();
  
  return (
    <div>
      <h1>{t('common.save')}</h1>
      <button>{t('auth.loginButton')}</button>
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
import { useTranslation } from 'react-i18next';

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

## Dodawanie nowych tłumaczeń

1. Dodaj klucz do `src/i18n/locales/pl/translation.json`
2. Dodaj odpowiednie tłumaczenie do `src/i18n/locales/en/translation.json`
3. Użyj klucza w komponencie: `t('your.new.key')`

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