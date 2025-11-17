# 🎨 Przewodnik Stylowania - MRP System

## Spis treści

1. [Wprowadzenie](#wprowadzenie)
2. [Architektura Stylowania](#architektura-stylowania)
3. [Design Tokens](#design-tokens)
4. [Motywy (Themes)](#motywy-themes)
5. [Utility Classes](#utility-classes)
6. [Komponenty](#komponenty)
7. [Best Practices](#best-practices)
8. [Migracja ze starych stylów](#migracja-ze-starych-stylów)

---

## Wprowadzenie

System stylowania MRP został zrefaktoryzowany dla lepszej **spójności**, **czytelności** i **maintainability**. Wszystkie style są teraz scentralizowane i zorganizowane według jasnej struktury.

### Główne zasady

✅ **Używaj zmiennych CSS** zamiast hardcoded wartości  
✅ **Utility classes** dla prostych stylów  
✅ **Component classes** dla złożonych komponentów  
✅ **Spójność** między CSS a Material-UI Theme  

---

## Architektura Stylowania

```
src/
├── index.css                    # Główny plik (importuje wszystko)
├── styles/
│   ├── design-tokens.css        # Zmienne CSS (kolory, spacing, etc.)
│   ├── animations.css           # Wszystkie animacje
│   ├── utilities.css            # Utility classes (Tailwind-like)
│   ├── themes/
│   │   ├── light.css            # Jasny motyw
│   │   └── dark.css             # Ciemny motyw
│   └── components/
│       ├── cards.css            # Style dla kart
│       ├── buttons.css          # Style dla przycisków
│       └── tables.css           # Style dla tabel
└── contexts/
    └── ThemeContext.js          # Material-UI Theme (zsynchronizowany z CSS)
```

---

## Design Tokens

### Kolory

Wszystkie kolory zdefiniowane są w `design-tokens.css`:

```css
/* Przykłady */
--color-primary-500: #2196f3;
--color-success-500: #4caf50;
--color-error-500: #f44336;
--color-warning-500: #ff9800;
```

**Używanie:**

```css
.my-element {
  color: var(--color-primary-500);
  background-color: var(--color-success-50);
}
```

### Spacing Scale

System spacing: **1 unit = 4px**

```css
--space-1: 0.25rem;   /* 4px */
--space-2: 0.5rem;    /* 8px */
--space-4: 1rem;      /* 16px */
--space-8: 2rem;      /* 32px */
```

**Używanie:**

```css
.my-element {
  padding: var(--space-4);
  margin-bottom: var(--space-2);
}
```

### Typography

```css
--font-size-xs: 0.75rem;      /* 12px */
--font-size-sm: 0.875rem;     /* 14px */
--font-size-base: 1rem;       /* 16px */
--font-size-lg: 1.125rem;     /* 18px */

--font-weight-normal: 400;
--font-weight-medium: 500;
--font-weight-semibold: 600;
--font-weight-bold: 700;
```

### Border Radius

```css
--radius-sm: 6px;
--radius-md: 8px;
--radius-lg: 12px;
--radius-xl: 16px;
--radius-full: 9999px;
```

### Shadows

```css
--shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.08);
--shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
--shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);
--shadow-xl: 0 20px 25px rgba(0, 0, 0, 0.15);
```

### Transitions

```css
--transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
--transition-base: 300ms cubic-bezier(0.4, 0, 0.2, 1);
--transition-slow: 500ms cubic-bezier(0.4, 0, 0.2, 1);
```

---

## Motywy (Themes)

### Jasny Motyw (`light.css`)

```css
[data-theme='light'] {
  --bg-primary: #f5f5f5;
  --bg-paper: rgba(255, 255, 255, 0.8);
  --text-primary: rgba(0, 0, 0, 0.87);
  --text-secondary: rgba(0, 0, 0, 0.6);
}
```

### Ciemny Motyw (`dark.css`)

```css
[data-theme='dark'] {
  --bg-primary: #111827;
  --bg-paper: rgba(31, 41, 55, 0.8);
  --text-primary: #ffffff;
  --text-secondary: rgba(255, 255, 255, 0.7);
}
```

### Przełączanie motywu

Motyw jest kontrolowany przez `ThemeContext.js` i automatycznie ustawia atrybut `data-theme` na elemencie `<html>`.

---

## Utility Classes

Inspirowane Tailwind CSS - szybkie stylowanie bez pisania CSS.

### Layout

```css
.flex { display: flex; }
.flex-col { flex-direction: column; }
.items-center { align-items: center; }
.justify-between { justify-content: space-between; }
.gap-4 { gap: var(--space-4); }
```

### Spacing

```css
.p-4 { padding: var(--space-4); }
.px-4 { padding-left: var(--space-4); padding-right: var(--space-4); }
.py-4 { padding-top: var(--space-4); padding-bottom: var(--space-4); }

.m-4 { margin: var(--space-4); }
.mt-4 { margin-top: var(--space-4); }
.mb-4 { margin-bottom: var(--space-4); }
```

### Typography

```css
.text-sm { font-size: var(--font-size-sm); }
.text-base { font-size: var(--font-size-base); }
.text-lg { font-size: var(--font-size-lg); }

.font-medium { font-weight: var(--font-weight-medium); }
.font-semibold { font-weight: var(--font-weight-semibold); }
.font-bold { font-weight: var(--font-weight-bold); }

.text-center { text-align: center; }
```

### Border & Shadow

```css
.rounded-md { border-radius: var(--radius-md); }
.rounded-lg { border-radius: var(--radius-lg); }
.rounded-full { border-radius: var(--radius-full); }

.shadow-sm { box-shadow: var(--shadow-sm); }
.shadow-md { box-shadow: var(--shadow-md); }
.shadow-lg { box-shadow: var(--shadow-lg); }
```

### Przykład użycia

```jsx
<div className="flex items-center justify-between p-4 rounded-lg shadow-md">
  <h2 className="text-lg font-semibold">Tytuł</h2>
  <button className="px-4 py-2 rounded-md">Przycisk</button>
</div>
```

---

## Komponenty

### Cards

```css
.card                 /* Podstawowa karta */
.card-glass          /* Glassmorphism */
.card-elevated       /* Podniesiona karta */
.card-hover          /* Z hover effect */
.dashboard-card      /* Karta dashboardu */
```

**Przykład:**

```jsx
<div className="card p-6 animate-slide-up">
  <h3 className="text-xl font-bold mb-4">Tytuł karty</h3>
  <p>Zawartość karty...</p>
</div>
```

### Buttons

```css
.btn-gradient        /* Gradient button */
.btn-glass           /* Glassmorphism button */
.btn-fab             /* Floating Action Button */
```

**Przykład:**

```jsx
<button className="btn-gradient px-6 py-3 rounded-lg">
  Zapisz zmiany
</button>
```

### Tables

```css
.table-container     /* Container dla tabeli */
.table-row           /* Wiersz tabeli */
.table-cell          /* Komórka tabeli */
.table-loading       /* Loading state */
```

---

## Animacje

Wszystkie animacje w `animations.css`.

### Podstawowe animacje

```css
.animate-fade-in     /* Fade in */
.animate-slide-up    /* Slide from bottom */
.animate-slide-down  /* Slide from top */
.animate-scale-up    /* Scale up */
```

### Delay classes

```css
.delay-100           /* 100ms delay */
.delay-200           /* 200ms delay */
.delay-300           /* 300ms delay */
```

### Staggered animations

```css
.stagger-item        /* Auto delay dla list items */
```

**Przykład:**

```jsx
<div className="animate-slide-up delay-200">
  Zawartość z opóźnieniem
</div>

{items.map((item, index) => (
  <div key={item.id} className="stagger-item animate-fade-in">
    {item.name}
  </div>
))}
```

---

## Best Practices

### ✅ DO

```css
/* Używaj zmiennych CSS */
.my-element {
  color: var(--color-primary-500);
  padding: var(--space-4);
  border-radius: var(--radius-md);
}

/* Używaj utility classes */
<div className="flex items-center gap-4 p-6">

/* Używaj semantycznych nazw */
.product-card-header { }
.invoice-table-row { }
```

### ❌ DON'T

```css
/* Nie hardcode wartości */
.my-element {
  color: #2196f3;           /* ❌ */
  padding: 16px;            /* ❌ */
  border-radius: 12px;      /* ❌ */
}

/* Nie twórz niepotrzebnych klas */
.mt-16px { margin-top: 16px; }  /* ❌ użyj .mt-4 */

/* Nie używaj !important bez powodu */
.my-element {
  color: red !important;    /* ❌ */
}
```

### Responsive Design

```css
/* Mobile first approach */
.my-element {
  padding: var(--space-2);
}

@media (min-width: 768px) {
  .my-element {
    padding: var(--space-4);
  }
}

/* Lub użyj utility classes */
.hide-mobile          /* Ukryj na mobile */
.hide-tablet          /* Ukryj na tablet */
.hide-desktop         /* Ukryj na desktop */
```

---

## Migracja ze starych stylów

### Stare → Nowe

```css
/* PRZED */
.my-card {
  background-color: #ffffff;
  padding: 24px;
  border-radius: 12px;
  box-shadow: 0 5px 15px rgba(0,0,0,0.1);
}

/* PO */
.my-card {
  background-color: var(--bg-paper);
  padding: var(--space-6);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}

/* LUB użyj gotowych klas */
<div className="card p-6">
```

### Inline styles → CSS classes

```jsx
/* PRZED */
<div style={{ 
  display: 'flex', 
  alignItems: 'center', 
  padding: '16px' 
}}>

/* PO */
<div className="flex items-center p-4">
```

### Custom animations → Utility classes

```css
/* PRZED */
@keyframes myFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
.my-element {
  animation: myFadeIn 0.3s ease;
}

/* PO */
<div className="animate-fade-in">
```

---

## Wsparcie i Rozwój

### Dodawanie nowych tokenów

1. Dodaj zmienną w `design-tokens.css`
2. Zaktualizuj `ThemeContext.js` jeśli potrzeba
3. Dodaj dokumentację tutaj

### Dodawanie nowych komponentów

1. Utwórz plik w `styles/components/`
2. Zaimportuj w `index.css`
3. Dodaj dokumentację tutaj

### Debugging

Użyj narzędzi deweloperskich przeglądarki:

```
Elements → Computed → Zobacz jakie zmienne CSS są używane
```

---

## Przykłady

### Pełny przykład karty

```jsx
<div className="card-glass p-6 rounded-xl shadow-lg animate-slide-up">
  <div className="flex items-center justify-between mb-4">
    <h3 className="text-xl font-bold">Tytuł Sekcji</h3>
    <button className="btn-glass px-4 py-2 rounded-md">
      Akcja
    </button>
  </div>
  
  <div className="grid grid-cols-2 gap-4">
    <div className="p-4 rounded-lg shadow-sm">
      <p className="text-sm text-secondary mb-1">Label</p>
      <p className="text-lg font-semibold">Wartość</p>
    </div>
  </div>
</div>
```

### Pełny przykład formularza

```jsx
<form className="flex flex-col gap-4 p-6">
  <div className="flex flex-col gap-2">
    <label className="text-sm font-medium">Nazwa</label>
    <input 
      type="text"
      className="px-4 py-2 rounded-md border"
    />
  </div>
  
  <div className="flex gap-2 justify-end mt-4">
    <button 
      type="button"
      className="px-4 py-2 rounded-md"
    >
      Anuluj
    </button>
    <button 
      type="submit"
      className="btn-gradient px-6 py-2 rounded-md"
    >
      Zapisz
    </button>
  </div>
</form>
```

---

## Podsumowanie

✨ **Spójny system design tokenów**  
🎨 **Łatwe przełączanie między motywami**  
⚡ **Szybkie stylowanie z utility classes**  
📦 **Komponenty gotowe do użycia**  
🚀 **Łatwa maintainability**

---

**Ostatnia aktualizacja:** 2025-01-17  
**Wersja:** 2.0.0

