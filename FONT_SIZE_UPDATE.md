# 🔤 Aktualizacja Rozmiarów Czcionek

**Data:** 2025-01-17  
**Powód:** Czcionki były za duże dla aplikacji biznesowej

---

## Zmiany

### Podstawowy rozmiar (base)

| Element | Przed | Po | Zmiana |
|---------|-------|-----|---------|
| `body` | 16px | **14px** | -2px (-12.5%) |
| `button` | 16px | **14px** | -2px |
| `body1` | 16px | **14px** | -2px |

### Nagłówki

| Element | Przed | Po | Zmiana |
|---------|-------|-----|---------|
| `h1` | 48px | **32px** | -16px (-33%) |
| `h2` | 36px | **28px** | -8px (-22%) |
| `h3` | 30px | **24px** | -6px (-20%) |
| `h4` | 24px | **20px** | -4px (-17%) |
| `h5` | 20px | **18px** | -2px (-10%) |
| `h6` | 18px | **16px** | -2px (-11%) |

### Tekst pomocniczy

| Element | Przed | Po | Zmiana |
|---------|-------|-----|---------|
| `caption` | 12px | **11px** | -1px |
| `body2` | 14px | **13px** | -1px |
| `subtitle1` | 16px | **15px** | -1px |
| `subtitle2` | 14px | **13px** | -1px |

---

## Porównanie

### Przed

```css
--font-size-xs: 0.75rem;      /* 12px */
--font-size-sm: 0.875rem;     /* 14px */
--font-size-base: 1rem;       /* 16px */
--font-size-lg: 1.125rem;     /* 18px */
--font-size-xl: 1.25rem;      /* 20px */
```

### Po

```css
--font-size-xs: 0.6875rem;    /* 11px */
--font-size-sm: 0.8125rem;    /* 13px */
--font-size-base: 0.875rem;   /* 14px ⬅️ Główna zmiana */
--font-size-md: 0.9375rem;    /* 15px (nowy) */
--font-size-lg: 1rem;         /* 16px */
--font-size-xl: 1.125rem;     /* 18px */
```

---

## Pliki zaktualizowane

1. ✅ `src/styles/design-tokens.css` - zmienne CSS
2. ✅ `src/contexts/ThemeContext.js` - Material-UI Typography
3. ✅ `src/index.css` - base font-size na body
4. ✅ `src/styles/utilities.css` - utility classes

---

## Korzyści

✅ **Lepsza czytelność** - optymalne rozmiary dla aplikacji biznesowej  
✅ **Więcej treści** - zmieści się więcej informacji na ekranie  
✅ **Lepsze proporcje** - nagłówki nie dominują nad tekstem  
✅ **Spójność** - wszystkie rozmiary zsynchronizowane  

---

## Utility Classes

Zaktualizowane klasy:

```jsx
<p className="text-xs">11px - bardzo mały tekst</p>
<p className="text-sm">13px - mały tekst</p>
<p className="text-base">14px - normalny tekst (domyślny)</p>
<p className="text-md">15px - trochę większy</p>
<p className="text-lg">16px - większy tekst</p>
<p className="text-xl">18px - duży tekst</p>
```

---

## Material-UI Typography

Przykłady użycia:

```jsx
<Typography variant="h1">32px - Główny tytuł</Typography>
<Typography variant="h2">28px - Podtytuł</Typography>
<Typography variant="h3">24px - Sekcja</Typography>
<Typography variant="h4">20px - Podsekcja</Typography>
<Typography variant="body1">14px - Normalny tekst</Typography>
<Typography variant="body2">13px - Mniejszy tekst</Typography>
<Typography variant="caption">11px - Etykiety</Typography>
```

---

## Testowanie

Sprawdź następujące elementy:

- [ ] Dashboard - nagłówki i karty
- [ ] Tabele - rozmiary tekstu w komórkach
- [ ] Formularze - etykiety i inputs
- [ ] Listy - rozmiary pozycji
- [ ] Przyciski - rozmiar tekstu
- [ ] Modale/Dialogi - nagłówki i treść

---

## Rollback (jeśli potrzeba)

Jeśli rozmiary są za małe, możesz je zwiększyć edytując:

1. `src/styles/design-tokens.css` - zwiększ `--font-size-base`
2. `src/contexts/ThemeContext.js` - zwiększ `fontSize: 14` na np. `15`

Lub użyj klas utility:
```jsx
<div className="text-base">...</div>  → <div className="text-lg">...</div>
```

---

**Status:** ✅ Zaimplementowane  
**Wpływ:** Całość aplikacji

