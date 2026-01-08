# 🛡️ Sentry Error Handling - Quick Start

## 📦 Dostępne narzędzia

W katalogu `src/utils/` znajdziesz:

1. **`errorHandler.js`** - Główne funkcje do obsługi błędów
2. **`firebaseErrorHandler.js`** - Specjalne wrappery dla Firebase
3. **`SENTRY_ERROR_HANDLING.md`** - Pełna dokumentacja
4. **`sentryExamples.js`** - Przykłady użycia

## 🚀 Szybki start

### 1. Podstawowa obsługa błędów

```javascript
import { handleError } from '../utils/errorHandler';

try {
  await someOperation();
} catch (error) {
  handleError(error, 'myService.myFunction', { userId: '123' });
  throw error; // opcjonalnie
}
```

### 2. Firebase operacje

```javascript
import { withFirebaseErrorHandling } from '../utils/firebaseErrorHandler';

const task = await withFirebaseErrorHandling(
  () => getDoc(doc(db, 'tasks', taskId)),
  'taskService.getTask',
  { taskId }
);
```

### 3. Breadcrumbs (śledzenie akcji użytkownika)

```javascript
import { addBreadcrumb } from '../utils/errorHandler';

addBreadcrumb('User clicked create button', 'user-action', 'info', {
  section: 'production'
});
```

## 📚 Dokumentacja

Pełna dokumentacja: [`SENTRY_ERROR_HANDLING.md`](./SENTRY_ERROR_HANDLING.md)

## 🔥 Co jest automatycznie przechwytywane?

✅ **Automatycznie:**
- Nieobsłużone błędy JavaScript
- Błędy w komponentach React (ErrorBoundary)
- `console.error()` w produkcji
- Błędy w async/await bez try-catch

❌ **Wymaga ręcznego zgłoszenia:**
- Błędy w try-catch (użyj `handleError()`)
- Błędy Firebase (użyj `withFirebaseErrorHandling()`)

## 🧪 Testowanie

Przejdź do **Admin → Narzędzia systemowe** i użyj sekcji "Test Sentry Error Tracking":
- **"Break the world"** - testuje pełny błąd (pojawi się ErrorBoundary)
- **"Test Message"** - testuje tylko logowanie wiadomości (bez błędu)

## 📊 Co zobaczysz w Sentry?

- Stack trace (ścieżka wywołań)
- User context (zalogowany użytkownik)
- Breadcrumbs (akcje przed błędem)
- Extra data (dane kontekstowe)
- Environment (dev/production)
- Device info (browser, OS)

## 💡 Przykłady

Zobacz [`sentryExamples.js`](./sentryExamples.js) dla 10+ przykładów użycia.

## 🆘 Wsparcie

1. Przeczytaj [`SENTRY_ERROR_HANDLING.md`](./SENTRY_ERROR_HANDLING.md)
2. Zobacz przykłady w [`sentryExamples.js`](./sentryExamples.js)
3. Sprawdź [dokumentację Sentry](https://docs.sentry.io/)

---

**Status:** ✅ Zaimplementowano i gotowe do użycia  
**Data:** 2026-01-08

