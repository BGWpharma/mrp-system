# 🚀 Zaawansowane funkcje Sentry - Przewodnik

## 📋 Spis treści
1. [Source Maps](#source-maps)
2. [Release Tracking](#release-tracking)
3. [User Feedback Widget](#user-feedback-widget)
4. [Custom Context - Dane biznesowe](#custom-context)
5. [Przykłady użycia](#przykłady-użycia)

---

## 1️⃣ Source Maps 🗺️

### Co to daje?
Czytelne stack traces w produkcji. Zamiast zminifikowanego kodu widzisz rzeczywiste nazwy funkcji i plików.

### Konfiguracja

#### Krok 1: Token Sentry Auth

Utwórz plik `.env.local`:
```env
# Sentry Auth Token (z Sentry Dashboard → Settings → Auth Tokens)
SENTRY_AUTH_TOKEN=twoj-sentry-token

# Release tracking
REACT_APP_SENTRY_RELEASE=mrp-system@0.1.237
REACT_APP_SENTRY_ENVIRONMENT=production
```

#### Krok 2: Build i upload

```bash
# Build z automatycznym uplodem source maps
npm run build

# Lub build bez source maps (dev)
npm run build:dev
```

#### Krok 3: Sprawdź w Sentry

1. Deployment → Releases
2. Znajdź swoją wersję (mrp-system@0.1.237)
3. Zobacz "Artifacts" - powinny być tam pliki .map

### Troubleshooting

**Problem:** Source maps nie są uploadowane

**Rozwiązanie:**
```bash
# Ręczny upload
sentry-cli sourcemaps upload \
  --org bgw-pharma \
  --project mrp-system \
  --release mrp-system@0.1.237 \
  ./build/static/js
```

**Problem:** Token nie działa

**Rozwiązanie:**
1. Sentry Dashboard → Settings → Auth Tokens
2. Create New Token
3. Uprawnienia: `project:releases` + `project:write`
4. Skopiuj token do `.env.local`

---

## 2️⃣ Release Tracking 📦

### Co to daje?
- Zobacz które błędy pojawiły się w nowej wersji
- Porównaj stabilność między wersjami
- Automatyczne powiadomienia o regresji
- Śledzenie deploy'ów

### Jak działa?

Release jest automatycznie ustawiany z `package.json`:
```javascript
// src/index.js
release: `mrp-system@${packageJson.version}`
```

### W Sentry Dashboard

**Releases → Twoja wersja:**
- **Issues**: Błędy w tej wersji
- **Commits**: Zmiany w kodzie (jeśli podłączysz Git)
- **Deploys**: Historia deploymentów
- **Adoption**: Ile użytkowników używa tej wersji

### Porównanie wersji

```
Releases → Compare Versions
v0.1.237 vs v0.1.236

Nowe błędy: 3
Naprawione: 2
Regresja: 1
```

### Powiadomienia o regresji

**Alerts → New Alert:**
- Condition: "A new issue is created"
- Filter: `release:mrp-system@latest`
- Action: Slack #dev-alerts

---

## 3️⃣ User Feedback Widget 💬

### Co to daje?
Użytkownicy mogą zgłaszać szczegóły problemu bezpośrednio z ErrorBoundary.

### Implementacja

ErrorBoundary z feedback widget jest już zaimplementowany w `App.js`:

```javascript
// Automatycznie pokazuje przycisk "Zgłoś szczegóły problemu"
<Sentry.ErrorBoundary fallback={...}>
  <App />
</Sentry.ErrorBoundary>
```

### Jak wygląda dla użytkownika?

1. Wystąpił błąd → pojawia się ErrorBoundary
2. Użytkownik klika "Zgłoś szczegóły problemu"
3. Otwiera się formularz:
   - Imię (opcjonalne)
   - Email (opcjonalne)
   - Opis: "Co się wydarzyło?"
4. Użytkownik wysyła raport
5. W Sentry widzisz issue + komentarz użytkownika

### W Sentry Dashboard

**Issues → Konkretny błąd → User Feedback:**
- Widzisz wszystkie zgłoszenia od użytkowników
- Imię, email, opis problemu
- Możesz odpowiedzieć bezpośrednio

### Własny widget (zaawansowane)

```javascript
// W dowolnym miejscu aplikacji
import * as Sentry from '@sentry/react';

<Button onClick={() => {
  Sentry.showReportDialog({
    title: 'Zgłoś problem',
    subtitle: 'Pomóż nam naprawić błąd',
    labelName: 'Twoje imię',
    labelEmail: 'Email',
    labelComments: 'Opisz problem',
  });
}}>
  Zgłoś problem
</Button>
```

---

## 4️⃣ Custom Context - Dane biznesowe 📊

### Co to daje?
Dodatkowe dane MRP do każdego błędu:
- Dane zadania produkcyjnego
- Informacje o zamówieniu
- Stan magazynowy
- Kontekst użytkownika

### Dostępne funkcje

```javascript
import {
  setTaskContext,
  setOrderContext,
  setInventoryContext,
  setBatchContext,
  setRecipeContext,
  setPurchaseOrderContext,
  setInvoiceContext,
  setPageContext,
  clearAllContexts,
} from './utils/sentryContext';
```

### Przykład 1: TaskDetailsPage

```javascript
// src/pages/Production/TaskDetailsPage.js
import { setTaskContext, setPageContext } from '../../utils/sentryContext';

const TaskDetailsPage = () => {
  const { taskId } = useParams();
  const [task, setTask] = useState(null);
  
  useEffect(() => {
    // Ustaw kontekst strony
    setPageContext('TaskDetailsPage', { taskId });
    
    return () => setPageContext(null);
  }, [taskId]);
  
  useEffect(() => {
    if (task) {
      // Ustaw kontekst zadania
      setTaskContext(task);
    }
    
    return () => setTaskContext(null);
  }, [task]);
  
  // ... rest of component
};
```

### Przykład 2: InventoryPage

```javascript
// src/pages/Inventory/ItemDetailsPage.js
import { setInventoryContext, setBatchContext } from '../../utils/sentryContext';

const ItemDetailsPage = () => {
  const { itemId } = useParams();
  const [item, setItem] = useState(null);
  const [selectedBatch, setSelectedBatch] = useState(null);
  
  useEffect(() => {
    if (item) {
      setInventoryContext(item);
    }
    return () => setInventoryContext(null);
  }, [item]);
  
  useEffect(() => {
    if (selectedBatch) {
      setBatchContext(selectedBatch);
    }
    return () => setBatchContext(null);
  }, [selectedBatch]);
  
  // ... rest
};
```

### Przykład 3: OrderForm

```javascript
import { setOrderContext } from '../../utils/sentryContext';

const OrderForm = ({ orderId }) => {
  const [order, setOrder] = useState(null);
  
  useEffect(() => {
    if (order) {
      setOrderContext(order);
    }
    return () => setOrderContext(null);
  }, [order]);
  
  const handleSubmit = async (formData) => {
    try {
      await updateOrder(orderId, formData);
    } catch (error) {
      // Error będzie zawierał pełny kontekst zamówienia!
      handleError(error, 'OrderForm.handleSubmit', { formData });
    }
  };
};
```

### Co zobaczysz w Sentry?

**Dla błędu w TaskDetailsPage:**
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
      "materialsCount": 8
    }
  },
  "tags": {
    "page.name": "TaskDetailsPage",
    "task.status": "in_progress",
    "task.hasReservations": true
  }
}
```

### Best Practices

✅ **DOBRZE:**
```javascript
// Ustaw context w useEffect
useEffect(() => {
  if (task) setTaskContext(task);
  return () => setTaskContext(null); // Wyczyść przy unmount
}, [task]);
```

✅ **DOBRZE:**
```javascript
// Użyj hook dla page context
import { usePageContext } from '../../utils/sentryContext';

const MyPage = () => {
  usePageContext('MyPage', { customData: 'value' });
  // Automatyczne cleanup
};
```

❌ **ŹLE:**
```javascript
// Nie ustawiaj wrażliwych danych!
setTaskContext({
  password: userPassword, // ❌ NIGDY
  creditCard: card.number, // ❌ NIGDY
});
```

❌ **ŹLE:**
```javascript
// Nie zapomnij cleanup
useEffect(() => {
  setTaskContext(task);
  // ❌ Brak cleanup - context zostanie dla innych stron
}, [task]);
```

---

## 5️⃣ Przykłady użycia 💡

### Przykład A: Kompleksowy TaskDetailsPage

```javascript
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { 
  setTaskContext, 
  setRecipeContext, 
  setPageContext,
  clearAllContexts
} from '../../utils/sentryContext';
import { withFirebaseErrorHandling } from '../../utils/firebaseErrorHandler';
import { handleError, addBreadcrumb } from '../../utils/errorHandler';

const TaskDetailsPage = () => {
  const { taskId } = useParams();
  const [task, setTask] = useState(null);
  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Ustaw kontekst strony
  useEffect(() => {
    setPageContext('TaskDetailsPage', { taskId });
    return () => setPageContext(null);
  }, [taskId]);
  
  // Pobierz dane
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Breadcrumb przed operacją
        addBreadcrumb('Fetching task details', 'data', 'info', { taskId });
        
        // Pobierz zadanie
        const taskDoc = await withFirebaseErrorHandling(
          () => getDoc(doc(db, 'tasks', taskId)),
          'TaskDetailsPage.fetchTask',
          { taskId }
        );
        
        const taskData = taskDoc.data();
        setTask(taskData);
        
        // Ustaw kontekst zadania
        setTaskContext(taskData);
        
        // Pobierz recepturę
        if (taskData.recipeId) {
          const recipeDoc = await withFirebaseErrorHandling(
            () => getDoc(doc(db, 'recipes', taskData.recipeId)),
            'TaskDetailsPage.fetchRecipe',
            { recipeId: taskData.recipeId }
          );
          
          const recipeData = recipeDoc.data();
          setRecipe(recipeData);
          
          // Ustaw kontekst receptury
          setRecipeContext(recipeData);
        }
        
        addBreadcrumb('Task data loaded successfully', 'data', 'info');
        
      } catch (error) {
        handleError(error, 'TaskDetailsPage.fetchData', { taskId });
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
    
    return () => {
      // Cleanup contexts
      setTaskContext(null);
      setRecipeContext(null);
    };
  }, [taskId]);
  
  const handleComplete = async () => {
    try {
      addBreadcrumb('User clicked complete task', 'user-action', 'info', {
        taskId,
        currentStatus: task.status
      });
      
      await withFirebaseErrorHandling(
        () => updateDoc(doc(db, 'tasks', taskId), { status: 'completed' }),
        'TaskDetailsPage.completeTask',
        { taskId, previousStatus: task.status }
      );
      
      showSuccess('Zadanie zakończone pomyślnie');
      
    } catch (error) {
      // Error zawiera pełny kontekst: task, recipe, page
      handleError(error, 'TaskDetailsPage.handleComplete', { taskId });
      showError('Nie udało się zakończyć zadania');
    }
  };
  
  if (loading) return <Loading />;
  
  return (
    <div>
      <h1>{task.moNumber}</h1>
      <button onClick={handleComplete}>Zakończ</button>
    </div>
  );
};
```

### Przykład B: Globalne czyszczenie przy wylogowaniu

```javascript
// src/contexts/AuthContext.js
import { clearAllContexts } from '../utils/sentryContext';
import * as Sentry from '@sentry/react';

const logout = useCallback(() => {
  // Wyczyść user w Sentry
  Sentry.setUser(null);
  
  // Wyczyść wszystkie konteksty biznesowe
  clearAllContexts();
  
  return signOut(auth);
}, []);
```

### Przykład C: Error z pełnym kontekstem

Gdy wystąpi błąd w TaskDetailsPage z ustawionym kontekstem, w Sentry zobaczysz:

```json
{
  "event_id": "abc123",
  "level": "error",
  "user": {
    "id": "user123",
    "email": "jan@bgwpharma.com",
    "role": "admin"
  },
  "contexts": {
    "page": {
      "name": "TaskDetailsPage",
      "taskId": "task456"
    },
    "task": {
      "id": "task456",
      "moNumber": "MO-2026-001",
      "status": "in_progress",
      "hasReservations": true,
      "materialsCount": 8
    },
    "recipe": {
      "id": "recipe789",
      "name": "Receptura A",
      "ingredientsCount": 10
    },
    "localStorage": {
      "theme": "dark",
      "language": "pl"
    }
  },
  "tags": {
    "page.name": "TaskDetailsPage",
    "task.status": "in_progress",
    "recipe.status": "active"
  },
  "breadcrumbs": [
    { "message": "Fetching task details", "category": "data" },
    { "message": "Task data loaded successfully", "category": "data" },
    { "message": "User clicked complete task", "category": "user-action" }
  ]
}
```

**Teraz wiesz dokładnie:**
- Kim był użytkownik
- Na jakiej stronie był
- Jakie zadanie przeglądał
- Jaki status miało zadanie
- Co robił przed błędem
- Jaką recepturę używał

---

## 🎯 Checklist implementacji

### Dla każdej ważnej strony:

- [ ] Dodaj `setPageContext()` w useEffect
- [ ] Dodaj odpowiedni context (task/order/inventory)
- [ ] Dodaj cleanup w return useEffect
- [ ] Użyj `addBreadcrumb()` przed krytycznymi operacjami
- [ ] Użyj `withFirebaseErrorHandling()` dla Firebase
- [ ] Użyj `handleError()` w try-catch

### Priorytetowe strony do implementacji:

1. ✅ **TaskDetailsPage** - najważniejsza strona produkcji
2. ✅ **ItemDetailsPage** - szczegóły magazynu
3. ✅ **OrderDetails** - zamówienia klientów
4. ✅ **PurchaseOrderDetails** - zamówienia zakupu
5. ✅ **RecipeDetailsPage** - receptury

---

## 📚 Dodatkowe zasoby

- **Source Maps**: https://docs.sentry.io/platforms/javascript/sourcemaps/
- **Releases**: https://docs.sentry.io/product/releases/
- **User Feedback**: https://docs.sentry.io/product/user-feedback/
- **Context**: https://docs.sentry.io/platforms/javascript/enriching-events/context/

---

**Ostatnia aktualizacja:** 2026-01-08
