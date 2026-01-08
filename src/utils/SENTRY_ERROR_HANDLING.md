# Przewodnik obsługi błędów z Sentry

## 📋 Spis treści
1. [Automatyczne przechwytywanie](#automatyczne-przechwytywanie)
2. [Ręczne przechwytywanie](#ręczne-przechwytywanie)
3. [Obsługa błędów Firebase](#obsługa-błędów-firebase)
4. [Best Practices](#best-practices)
5. [Przykłady użycia](#przykłady-użycia)

---

## 🤖 Automatyczne przechwytywanie

### Co jest automatycznie przechwytywane?

✅ **TAK - automatycznie w Sentry:**
- Nieobsłużone błędy JavaScript (`throw new Error()`)
- Błędy w komponentach React (przez `ErrorBoundary`)
- Błędy w async/await bez try-catch
- `console.error()` w produkcji (wszystkie wywołania)

❌ **NIE - wymaga ręcznego zgłoszenia:**
- Błędy w blokach `try-catch` (jeśli nie użyjesz helper funkcji)
- Błędy logiki biznesowej (validation errors)
- Ciche błędy (np. niewłaściwe dane bez rzucania błędu)

---

## 🛠️ Ręczne przechwytywanie

### 1. Podstawowa obsługa błędów - `handleError()`

```javascript
import { handleError } from '../utils/errorHandler';

try {
  await someOperation();
} catch (error) {
  handleError(error, 'productionService.createTask', { 
    taskId: '123',
    userId: currentUser.uid 
  });
  // Opcjonalnie rzuć dalej
  throw error;
}
```

**Parametry:**
- `error` (Error) - Obiekt błędu
- `context` (string) - Kontekst: 'serwis.funkcja'
- `extraData` (object) - Dodatkowe dane do debugowania
- `level` (string) - Poziom: 'error', 'warning', 'info'

### 2. Logowanie wiadomości - `logToSentry()`

```javascript
import { logToSentry } from '../utils/errorHandler';

// Zaloguj ważne zdarzenie (nie błąd)
logToSentry('Rozpoczęto eksport dużego raportu', 'info', {
  reportType: 'weekly',
  itemsCount: 1000
});

// Ostrzeżenie
logToSentry('Zbliżasz się do limitu API', 'warning', {
  currentCount: 950,
  limit: 1000
});
```

### 3. Wrapper dla funkcji async - `withErrorHandling()`

```javascript
import { withErrorHandling } from '../utils/errorHandler';

const fetchTaskData = async (taskId) => {
  return await withErrorHandling(
    async () => {
      const taskDoc = await getDoc(doc(db, 'tasks', taskId));
      return taskDoc.data();
    },
    'productionService.fetchTaskData',
    { taskId }
  );
};
```

### 4. Breadcrumbs - `addBreadcrumb()`

```javascript
import { addBreadcrumb } from '../utils/errorHandler';

// Dodaj breadcrumb przed operacją
addBreadcrumb('User clicked create task button', 'user-action', 'info', {
  section: 'production',
  taskType: 'manufacturing'
});

// W razie błędu, Sentry pokaże ścieżkę akcji użytkownika
```

---

## 🔥 Obsługa błędów Firebase

### 1. Podstawowy wrapper - `withFirebaseErrorHandling()`

```javascript
import { withFirebaseErrorHandling } from '../utils/firebaseErrorHandler';

// Get document
const task = await withFirebaseErrorHandling(
  () => getDoc(doc(db, 'tasks', taskId)),
  'getTaskDetails',
  { taskId }
);

// Set document
await withFirebaseErrorHandling(
  () => setDoc(doc(db, 'tasks', taskId), taskData),
  'createTask',
  { taskData }
);

// Update document
await withFirebaseErrorHandling(
  () => updateDoc(doc(db, 'tasks', taskId), updates),
  'updateTask',
  { taskId, updates }
);

// Delete document
await withFirebaseErrorHandling(
  () => deleteDoc(doc(db, 'tasks', taskId)),
  'deleteTask',
  { taskId }
);
```

### 2. Batch operations - `withFirebaseBatchErrorHandling()`

```javascript
import { withFirebaseBatchErrorHandling } from '../utils/firebaseErrorHandler';

const items = [/* array of items */];

await withFirebaseBatchErrorHandling(
  async () => {
    const batch = writeBatch(db);
    items.forEach(item => {
      batch.set(doc(db, 'items', item.id), item);
    });
    await batch.commit();
  },
  'batchCreateItems',
  items
);
```

### 3. Logowanie operacji Firebase - `logFirebaseOperation()`

```javascript
import { logFirebaseOperation } from '../utils/firebaseErrorHandler';

// Przed operacją Firebase
logFirebaseOperation('getDoc', 'tasks', taskId);
const task = await getDoc(doc(db, 'tasks', taskId));

// W razie późniejszego błędu, Sentry pokaże sekwencję operacji
```

---

## 📚 Best Practices

### ✅ DO (Rób tak):

1. **Używaj kontekstu w formacie `serwis.funkcja`:**
   ```javascript
   handleError(error, 'inventoryService.updateStock', { itemId });
   ```

2. **Dodawaj istotne dane kontekstowe:**
   ```javascript
   handleError(error, 'orderService.createOrder', {
     customerId,
     orderTotal,
     itemsCount: items.length
   });
   ```

3. **Użyj breadcrumbs dla śledzenia flow:**
   ```javascript
   addBreadcrumb('Starting batch update', 'process');
   // ... operacje ...
   addBreadcrumb('Batch update completed', 'process');
   ```

4. **Dla Firebase używaj dedykowanych wrapper'ów:**
   ```javascript
   // ✅ Dobre
   await withFirebaseErrorHandling(
     () => getDoc(docRef),
     'context'
   );
   
   // ❌ Złe
   try {
     await getDoc(docRef);
   } catch (error) {
     console.error(error);
   }
   ```

### ❌ DON'T (Nie rób tego):

1. **Nie używaj pustego kontekstu:**
   ```javascript
   // ❌ Złe
   handleError(error, '', {});
   
   // ✅ Dobre
   handleError(error, 'productionService.updateTask', { taskId });
   ```

2. **Nie loguj wrażliwych danych:**
   ```javascript
   // ❌ Złe - hasła, tokeny
   handleError(error, 'auth', { 
     password: userPassword,
     apiKey: secretKey 
   });
   
   // ✅ Dobre - tylko niezbędne info
   handleError(error, 'authService.login', { 
     userId: userId,
     timestamp: Date.now()
   });
   ```

3. **Nie duplikuj błędów:**
   ```javascript
   // ❌ Złe - błąd zostanie wysłany 2 razy
   try {
     await operation();
   } catch (error) {
     handleError(error, 'context1');
     throw error; // i zostanie złapany wyżej przez inny handleError
   }
   ```

---

## 💡 Przykłady użycia

### Przykład 1: Service z Firebase

```javascript
// src/services/taskService.js
import { db } from '../firebase/config';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { withFirebaseErrorHandling, logFirebaseOperation } from '../utils/firebaseErrorHandler';
import { addBreadcrumb } from '../utils/errorHandler';

export const updateTaskStatus = async (taskId, newStatus, userId) => {
  // Dodaj breadcrumb
  addBreadcrumb('Updating task status', 'task-operation', 'info', {
    taskId,
    newStatus,
    userId
  });
  
  // Log operacji Firebase
  logFirebaseOperation('updateDoc', 'tasks', taskId);
  
  // Wykonaj operację z obsługą błędów
  return await withFirebaseErrorHandling(
    async () => {
      const taskRef = doc(db, 'tasks', taskId);
      await updateDoc(taskRef, {
        status: newStatus,
        updatedBy: userId,
        updatedAt: serverTimestamp()
      });
    },
    'taskService.updateTaskStatus',
    { taskId, newStatus, userId }
  );
};
```

### Przykład 2: React Component

```javascript
// src/components/TaskForm.js
import React, { useState } from 'react';
import { handleError, addBreadcrumb } from '../../utils/errorHandler';
import { createTask } from '../../services/taskService';

const TaskForm = () => {
  const [loading, setLoading] = useState(false);
  
  const handleSubmit = async (formData) => {
    try {
      setLoading(true);
      
      // Breadcrumb przed operacją
      addBreadcrumb('User submitted task form', 'user-action', 'info', {
        taskType: formData.type
      });
      
      await createTask(formData);
      
      // Breadcrumb po sukcesie
      addBreadcrumb('Task created successfully', 'user-action', 'info');
      
    } catch (error) {
      // Obsłuż błąd
      handleError(error, 'TaskForm.handleSubmit', {
        formData: {
          type: formData.type,
          // Nie loguj wrażliwych danych
        }
      });
      
      // Pokaż komunikat użytkownikowi
      showNotification('Błąd podczas tworzenia zadania');
      
    } finally {
      setLoading(false);
    }
  };
  
  // ... rest of component
};
```

### Przykład 3: Async Function w Hook

```javascript
// src/hooks/useInventory.js
import { useState, useEffect } from 'react';
import { withErrorHandling } from '../utils/errorHandler';
import { withFirebaseErrorHandling } from '../utils/firebaseErrorHandler';

export const useInventory = (itemId) => {
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const fetchItem = async () => {
      try {
        const itemData = await withFirebaseErrorHandling(
          () => getDoc(doc(db, 'inventory', itemId)),
          'useInventory.fetchItem',
          { itemId }
        );
        
        setItem(itemData.data());
      } catch (error) {
        // Błąd już został wysłany do Sentry przez wrapper
        console.error('Failed to fetch item');
      } finally {
        setLoading(false);
      }
    };
    
    fetchItem();
  }, [itemId]);
  
  return { item, loading };
};
```

---

## 🔍 Testowanie

### Test lokalny:

1. Przejdź do **Admin → Narzędzia systemowe**
2. Znajdź sekcję "🛡️ Test Sentry Error Tracking"
3. Użyj przycisku "Break the world" (testuje pełny błąd) lub "Test Message" (testuje tylko logowanie)
4. Sprawdź w konsoli przeglądarki czy błędy są logowane
5. Sprawdź w Sentry.io czy błędy/wiadomości się pojawiają

### Test w produkcji:

1. Ustaw `REACT_APP_SENTRY_ENVIRONMENT=production`
2. Deploy aplikacji
3. Wywołaj celowo błąd (np. przez admin panel test button)
4. Sprawdź Sentry Dashboard

---

## 📊 Co zobaczysz w Sentry?

Dla każdego błędu zobaczysz:
- **Stos wywołań** (stack trace)
- **User context** - kto doświadczył błędu
- **Breadcrumbs** - co użytkownik robił przed błędem
- **Extra data** - dane kontekstowe przekazane w handleError
- **Tags** - dla łatwego filtrowania (context, service, etc.)
- **Environment** - development/production
- **Device info** - przeglądarka, OS, etc.

---

## 🆘 Potrzebujesz pomocy?

Jeśli masz pytania dotyczące obsługi błędów:
1. Sprawdź ten dokument
2. Zobacz przykłady w kodzie
3. Sprawdź oficjalną dokumentację Sentry: https://docs.sentry.io/

---

**Ostatnia aktualizacja:** 2026-01-08

