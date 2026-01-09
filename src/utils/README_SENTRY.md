# 🛡️ Sentry Error Handling - Quick Start

## 📦 Dostępne narzędzia

W katalogu `src/utils/` znajdziesz:

1. **`errorHandler.js`** - Główne funkcje do obsługi błędów
2. **`firebaseErrorHandler.js`** - Wrappery dla Firebase + **performance tracking**
3. **`sentryContext.js`** - 🆕 Custom context (dane biznesowe)
4. **`SENTRY_ERROR_HANDLING.md`** - Pełna dokumentacja
5. **`FIREBASE_PERFORMANCE.md`** - Dokumentacja performance tracking
6. **`SENTRY_ADVANCED_FEATURES.md`** - 🆕 Source Maps, Release Tracking, User Feedback
7. **`sentryExamples.js`** - Przykłady użycia

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
- **🆕 Performance Firebase** - czas trwania operacji, wolne zapytania

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
- **🆕 Performance metrics** (czasy operacji Firebase, wolne zapytania)

## 💡 Przykłady

Zobacz [`sentryExamples.js`](./sentryExamples.js) dla 10+ przykładów użycia.

## 🆘 Wsparcie

1. **Quick Start**: Ten plik!
2. **Podstawy**: [`SENTRY_ERROR_HANDLING.md`](./SENTRY_ERROR_HANDLING.md)
3. **Performance**: [`FIREBASE_PERFORMANCE.md`](./FIREBASE_PERFORMANCE.md)
4. **Zaawansowane**: 🆕 [`SENTRY_ADVANCED_FEATURES.md`](./SENTRY_ADVANCED_FEATURES.md)
5. **Przykłady**: [`sentryExamples.js`](./sentryExamples.js)
6. **Sentry Docs**: https://docs.sentry.io/

---

**Status:** ✅ Zaimplementowano i gotowe do użycia  
**Data:** 2026-01-08

