# 🚀 Changelog - Zaawansowane funkcje Sentry

**Data implementacji:** 2026-01-09

---

## ✨ Co zostało dodane?

### 1. Source Maps Configuration 🗺️

**Pliki zmienione/utworzone:**
- ✅ `.sentryclirc` - konfiguracja Sentry CLI
- ✅ `package.json` - dodane skrypty build
- ✅ `.env.local.example` - przykładowa konfiguracja

**Nowe skrypty npm:**
```json
{
  "build": "react-scripts build && npm run sentry:sourcemaps",
  "build:dev": "react-scripts build",
  "sentry:sourcemaps": "sentry-cli sourcemaps upload --org bgw-pharma --project mrp-system ./build/static/js"
}
```

**Co to daje:**
- Czytelne stack traces w produkcji (zamiast zminifikowanego kodu)
- Automatyczny upload source maps po każdym build
- Lepsze debugowanie błędów produkcyjnych

**Wymagane zmienne środowiskowe:**
```env
SENTRY_AUTH_TOKEN=twoj-sentry-token
```

---

### 2. Release Tracking 📦

**Pliki zmienione:**
- ✅ `src/index.js` - dodano release i dist tracking

**Zmiany w kodzie:**
```javascript
// src/index.js
const packageJson = require('../package.json');

Sentry.init({
  // ... existing
  release: process.env.REACT_APP_SENTRY_RELEASE || `mrp-system@${packageJson.version}`,
  dist: process.env.REACT_APP_BUILD_NUMBER || packageJson.version,
});
```

**Co to daje:**
- Śledzenie błędów per wersja aplikacji
- Porównywanie stabilności między wersjami
- Automatyczne powiadomienia o regresji
- Zobacz które błędy są nowe w danej wersji

**W Sentry Dashboard:**
- Releases → mrp-system@0.1.237
- Zobacz: Issues, Commits, Deploys, Adoption

---

### 3. User Feedback Widget 💬

**Pliki zmienione:**
- ✅ `src/App.js` - zaktualizowano ErrorBoundary

**Zmiany w kodzie:**
```javascript
// src/App.js
<Sentry.ErrorBoundary 
  fallback={({ error, componentStack, resetError, eventId }) => (
    // ... UI ...
    {eventId && (
      <Button onClick={() => {
        Sentry.showReportDialog({ 
          eventId,
          title: 'Zgłoś problem',
          subtitle: 'Nasz zespół został powiadomiony o tym błędzie',
          // ... polski formularz ...
        });
      }}>
        Zgłoś szczegóły problemu
      </Button>
    )}
  )}
  showDialog={false}
>
```

**Co to daje:**
- Użytkownicy mogą opisać co robili przed błędem
- Feedback pojawia się w Sentry pod każdym issue
- Polski formularz: imię, email (opcjonalne), opis
- Lepsza komunikacja z użytkownikami

---

### 4. Custom Context - Dane biznesowe 📊

**Nowe pliki:**
- ✅ `src/utils/sentryContext.js` (370+ linii)

**Dostępne funkcje:**

```javascript
// Konteksty biznesowe
setTaskContext(task)              // Zadanie produkcyjne
setOrderContext(order)            // Zamówienie klienta
setInventoryContext(item)         // Pozycja magazynowa
setBatchContext(batch)            // Partia magazynowa
setRecipeContext(recipe)          // Receptura
setPurchaseOrderContext(po)       // Zamówienie zakupu
setInvoiceContext(invoice)        // Faktura
setPageContext(pageName, data)    // Kontekst strony

// Utilities
clearAllContexts()                // Wyczyść wszystkie
usePageContext(name, data)        // React hook
```

**Przykład użycia:**

```javascript
// src/pages/Production/TaskDetailsPage.js
import { setTaskContext, setPageContext } from '../../utils/sentryContext';

useEffect(() => {
  setPageContext('TaskDetailsPage', { taskId });
  return () => setPageContext(null);
}, [taskId]);

useEffect(() => {
  if (task) {
    setTaskContext(task);
  }
  return () => setTaskContext(null);
}, [task]);

// Teraz każdy błąd zawiera:
// - Kontekst strony (TaskDetailsPage, taskId)
// - Dane zadania (MO number, status, rezerwacje, materiały)
// - User context (email, role)
// - localStorage, viewport
// - Breadcrumbs (co użytkownik robił)
```

**Co trafia do Sentry:**

```json
{
  "contexts": {
    "page": {
      "name": "TaskDetailsPage",
      "taskId": "abc123"
    },
    "task": {
      "id": "abc123",
      "moNumber": "MO-2026-001",
      "status": "in_progress",
      "hasReservations": true,
      "reservationsCount": 5,
      "materialsCount": 8,
      "priority": "high"
    }
  },
  "tags": {
    "page.name": "TaskDetailsPage",
    "task.status": "in_progress",
    "task.priority": "high",
    "task.hasReservations": true
  }
}
```

**Korzyści:**
- Pełny kontekst każdego błędu
- Łatwiejsza diagnoza problemów
- Automatyczne tagowanie dla filtrowania
- Śledzenie gdzie użytkownicy mają problemy

---

### 5. Enhanced beforeSend hooks

**Pliki zmienione:**
- ✅ `src/index.js` - rozszerzone beforeSend

**Dodane do każdego błędu:**

```javascript
// localStorage context (nie wrażliwe dane!)
event.contexts.localStorage = {
  theme: localStorage.getItem('theme'),
  language: localStorage.getItem('i18nextLng'),
  hasSeenOnboarding: localStorage.getItem('hasSeenOnboarding'),
};

// Viewport context
event.contexts.viewport = {
  width: window.innerWidth,
  height: window.innerHeight,
  orientation: window.innerWidth > window.innerHeight ? 'landscape' : 'portrait',
};
```

**Korzyści:**
- Zobacz jaką wersję aplikacji użytkownik ma (theme, language)
- Problemy specyficzne dla rozdzielczości
- Lepsze debugowanie problemów mobile/tablet

---

### 6. Enhanced Session Replay

**Pliki zmienione:**
- ✅ `src/index.js` - dodano maskAllInputs

**Zmiany:**
```javascript
Sentry.replayIntegration({
  maskAllText: false,
  blockAllMedia: false,
  maskAllInputs: true, // 🆕 Maskuj wszystkie inputy (bezpieczeństwo)
})
```

**Korzyści:**
- Bezpieczniejsze nagrania (hasła, dane osobowe są maskowane)
- Zgodność z RODO/GDPR

---

## 📚 Nowa dokumentacja

### ✅ `src/utils/SENTRY_ADVANCED_FEATURES.md`

Kompleksowy przewodnik (300+ linii) zawierający:

**Rozdział 1: Source Maps**
- Konfiguracja krок po kroku
- Troubleshooting (upload nie działa, token problems)
- Weryfikacja w Sentry Dashboard

**Rozdział 2: Release Tracking**
- Jak działa automatyczne tracking
- Porównywanie wersji w Dashboard
- Konfiguracja alertów o regresji

**Rozdział 3: User Feedback Widget**
- Implementacja (już gotowa w App.js)
- Jak wygląda dla użytkownika
- Jak zobaczyć feedback w Sentry
- Własny widget (zaawansowane)

**Rozdział 4: Custom Context**
- Wszystkie dostępne funkcje
- 3 kompleksowe przykłady:
  - TaskDetailsPage (task + recipe context)
  - InventoryPage (item + batch context)
  - OrderForm (order context)
- Best practices (co robić, czego unikać)
- Co zobaczysz w Sentry

**Rozdział 5: Przykłady użycia**
- Przykład A: Kompleksowy TaskDetailsPage (70+ linii)
- Przykład B: Globalne czyszczenie przy wylogowaniu
- Przykład C: Error z pełnym kontekstem (JSON przykład)

**Checklist implementacji:**
- Lista kroków dla każdej ważnej strony
- Priorytetowe strony (TaskDetailsPage, ItemDetailsPage, etc.)

---

## 🔄 Zmiany w istniejących plikach

### `src/index.js`
```diff
+ const packageJson = require('../package.json');
  
  Sentry.init({
    dsn: process.env.REACT_APP_SENTRY_DSN || "...",
+   release: process.env.REACT_APP_SENTRY_RELEASE || `mrp-system@${packageJson.version}`,
+   dist: process.env.REACT_APP_BUILD_NUMBER || packageJson.version,
    environment: process.env.REACT_APP_SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
+       maskAllInputs: true,
      }),
    ],
    
    beforeSend(event, hint) {
      // ... existing filters ...
      
+     // Dodaj localStorage context
+     if (typeof window !== 'undefined' && localStorage) {
+       event.contexts = event.contexts || {};
+       event.contexts.localStorage = {
+         theme: localStorage.getItem('theme'),
+         language: localStorage.getItem('i18nextLng'),
+         hasSeenOnboarding: localStorage.getItem('hasSeenOnboarding'),
+       };
+     }
+     
+     // Dodaj viewport context
+     if (typeof window !== 'undefined') {
+       event.contexts = event.contexts || {};
+       event.contexts.viewport = {
+         width: window.innerWidth,
+         height: window.innerHeight,
+         orientation: window.innerWidth > window.innerHeight ? 'landscape' : 'portrait',
+       };
+     }
      
      return event;
    },
  });
```

### `src/App.js`
```diff
  <Sentry.ErrorBoundary 
-   fallback={({ error, componentStack, resetError }) => (
+   fallback={({ error, componentStack, resetError, eventId }) => (
      <Box>
        <Typography variant="h4">Ups! Coś poszło nie tak</Typography>
        <Typography>Przepraszamy za niedogodności.</Typography>
        
-       <Button onClick={resetError}>Spróbuj ponownie</Button>
+       <Box sx={{ display: 'flex', gap: 2 }}>
+         <Button onClick={resetError}>Spróbuj ponownie</Button>
+         
+         {eventId && (
+           <Button onClick={() => {
+             Sentry.showReportDialog({ 
+               eventId,
+               title: 'Zgłoś problem',
+               // ... polski formularz ...
+             });
+           }}>
+             Zgłoś szczegóły problemu
+           </Button>
+         )}
+       </Box>
      </Box>
    )}
-   showDialog
+   showDialog={false}
  >
```

### `package.json`
```diff
  "scripts": {
    "start": "set PORT=3003 && react-scripts start",
-   "build": "react-scripts build",
+   "build": "react-scripts build && npm run sentry:sourcemaps",
+   "build:dev": "react-scripts build",
    "test": "react-scripts test",
    "eject": "react-scripts eject",
    "i18n:scan": "i18next-scanner",
-   "i18n:split": "node scripts/split-translations.js"
+   "i18n:split": "node scripts/split-translations.js",
+   "sentry:sourcemaps": "sentry-cli sourcemaps upload --org bgw-pharma --project mrp-system ./build/static/js"
  },
```

---

## 🎯 Następne kroki (opcjonalne)

Funkcje które mogą być dodane w przyszłości:

### Profiling (głębsza analiza wydajności)
```javascript
Sentry.init({
  // ... existing
  profilesSampleRate: 0.1,
  integrations: [
    new Sentry.BrowserProfilingIntegration(),
  ],
});
```

### Cron Monitoring (dla Firebase Functions)
```javascript
// Dla scheduled functions
export const weeklyReport = functions
  .pubsub.schedule('every monday 09:00')
  .onRun(async (context) => {
    const checkInId = Sentry.captureCheckIn({
      monitorSlug: 'weekly-report',
      status: 'in_progress',
    });
    
    try {
      await generateReport();
      Sentry.captureCheckIn({ checkInId, status: 'ok' });
    } catch (error) {
      Sentry.captureCheckIn({ checkInId, status: 'error' });
      throw error;
    }
  });
```

### Custom Metrics
```javascript
// Metryki biznesowe
transaction.setMeasurement('task.completion_time', duration, 'millisecond');
transaction.setMeasurement('batch.size', itemsCount, 'none');
transaction.setMeasurement('export.file_size', fileSizeKB, 'kilobyte');
```

---

## 📈 Co się zmieniło?

### Przed (wersja podstawowa):
- ✅ Przechwytywanie błędów
- ✅ Performance monitoring
- ✅ Session Replay
- ✅ User context
- ✅ Firebase error handling

### Po (wersja zaawansowana):
- ✅ Wszystko powyżej +
- 🆕 **Source Maps** - czytelne stack traces
- 🆕 **Release Tracking** - śledzenie wersji
- 🆕 **User Feedback** - zgłoszenia od użytkowników
- 🆕 **Custom Context** - dane biznesowe MRP
- 🆕 **localStorage & viewport** - dodatkowy kontekst
- 🆕 **Enhanced Replay** - bezpieczniejsze nagrania
- 🆕 **3 nowe dokumenty** (SENTRY_ADVANCED_FEATURES + changelog)

---

## ✅ Checklist wdrożenia produkcyjnego

Przed wdrożeniem na produkcję:

1. **Source Maps:**
   - [ ] Wygeneruj SENTRY_AUTH_TOKEN w Sentry Dashboard
   - [ ] Dodaj token do `.env.local` (lub CI/CD)
   - [ ] Przetestuj `npm run build` - sprawdź czy source maps są uploadowane
   - [ ] Zweryfikuj w Sentry Dashboard → Releases → Artifacts

2. **Release Tracking:**
   - [ ] Ustaw `REACT_APP_SENTRY_RELEASE` w `.env.local` (lub auto z package.json)
   - [ ] Po deploy sprawdź Sentry Dashboard → Releases
   - [ ] Skonfiguruj alerty (Alerts → New Alert Rule → Regression)

3. **User Feedback:**
   - [ ] Przetestuj feedback widget w staging
   - [ ] Sprawdź czy polski formularz wyświetla się poprawnie
   - [ ] Zweryfikuj w Sentry Dashboard → Issues → User Feedback

4. **Custom Context:**
   - [ ] Zaimplementuj w priorytetowych stronach:
     - [ ] TaskDetailsPage
     - [ ] ItemDetailsPage  
     - [ ] OrderDetails
     - [ ] RecipeDetailsPage
   - [ ] Dodaj cleanup w useEffect (return function)
   - [ ] Przetestuj czy kontekst jest widoczny w Sentry

5. **Testing:**
   - [ ] Użyj przycisków testowych w System Management
   - [ ] Sprawdź czy błędy mają pełny kontekst
   - [ ] Zweryfikuj breadcrumbs
   - [ ] Potwierdź source maps (readable stack traces)

---

**Status:** ✅ Gotowe do użycia  
**Ostatnia aktualizacja:** 2026-01-09

