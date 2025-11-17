# ⚠️ DEPRECATED

Ten folder zawiera stare pliki stylów, które zostały zastąpione nową strukturą.

## Nowa struktura stylowania

Wszystkie style zostały przeniesione do:

```
src/
├── index.css                    # Główny plik
├── styles/
│   ├── design-tokens.css        # Zmienne CSS
│   ├── animations.css           # Animacje
│   ├── utilities.css            # Utility classes
│   ├── themes/
│   │   ├── light.css            # Jasny motyw
│   │   └── dark.css             # Ciemny motyw
│   └── components/
│       ├── cards.css
│       ├── buttons.css
│       └── tables.css
```

## Co zostało przeniesione

### `global.css` → Nowe pliki

- Zmienne CSS → `design-tokens.css`
- Style body/html → `index.css`
- Animacje → `animations.css`
- Dashboard cards → `components/cards.css`
- Helper classes → `utilities.css`

## Dokumentacja

Zobacz `STYLING_GUIDE.md` w root projektu dla pełnej dokumentacji.

---

**Data deprecation:** 2025-01-17  
**Można usunąć po:** 2025-02-01 (po pełnej migracji)

