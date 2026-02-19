# LoadingScreen Component

Komponent LoadingScreen zapewnia profesjonalny ekran ładowania z animowanym logo BGW dla aplikacji.

## Funkcje

- **Animowane logo SVG** - używa obracających się elementów z `rotating_svg_logo.svg`
- **Responsive design** - dostosowuje się do różnych rozmiarów ekranu
- **Obsługa motywów** - automatycznie dostosowuje kolory do trybu jasnego/ciemnego
- **Płynne animacje** - efekt pulsowania i płynne przejścia
- **Konfigurowalne** - możliwość dostosowania rozmiaru, komunikatu i trybu wyświetlania

## Właściwości (Props)

| Prop | Typ | Domyślna wartość | Opis |
|------|-----|------------------|------|
| `message` | string | "Ładowanie..." | Komunikat wyświetlany pod logo |
| `showMessage` | boolean | true | Czy pokazywać komunikat |
| `fullScreen` | boolean | true | Czy ekran ma zajmować całą stronę |
| `size` | number | 120 | Rozmiar logo w pikselach |

## Przykłady użycia

### Podstawowe użycie
```jsx
import LoadingScreen from './components/common/LoadingScreen';

// Pełnoekranowy loader
<LoadingScreen message="Ładowanie danych..." />
```

### Kompaktowy loader
```jsx
// Mniejszy loader do użycia w komponentach
<LoadingScreen 
  message="Pobieranie..." 
  fullScreen={false}
  size={80}
/>
```

### Loader bez komunikatu
```jsx
// Tylko animowane logo
<LoadingScreen 
  showMessage={false}
  size={60}
/>
```

## Automatyczne zastosowanie

Komponent jest automatycznie używany w:

1. **AuthContext** - podczas inicjalizacji aplikacji
2. **PrivateRoute** - podczas sprawdzania autoryzacji
3. **HTML (index.html)** - wczesny ekran ładowania przed załadowaniem React'a

## Animacje

- **Logo**: Obracanie głównego kształtu (8s) i elipsy (4s)
- **Pulsowanie**: Delikatne skalowanie logo (2s)
- **Tekst**: Płynne zanikanie i pojawianie się komunikatu (2s)
- **Przejścia**: Płynne pojawianie się całego komponentu (300ms)

## Responsywność

Komponent automatycznie dostosowuje się do:
- Różnych rozmiarów ekranu
- Trybu jasnego/ciemnego
- Preferencji systemowych użytkownika
