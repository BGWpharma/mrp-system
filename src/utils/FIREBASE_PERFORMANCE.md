# 🚀 Firebase Performance Tracking w Sentry

## 📊 Co jest śledzone automatycznie?

Od teraz `withFirebaseErrorHandling()` i `withFirebaseBatchErrorHandling()` automatycznie śledzą:

### 1. **Czas trwania operacji**
- Każda operacja Firebase ma zmierzony czas wykonania
- Dane są wysyłane do Sentry Performance tab

### 2. **Wolne zapytania**
- Operacje > 3 sekundy (domyślnie) są automatycznie logowane jako ostrzeżenia
- Widoczne w Sentry jako "Slow Firebase operation"

### 3. **Metryki batch operations**
- Liczba elementów w batch
- Średni czas na element
- Całkowity czas operacji

### 4. **Status operacji**
- Success / Error
- Kod błędu (jeśli wystąpił)
- Czy dokument istnieje (dla getDoc)
- Czy wynik jest pusty (dla query)

---

## ⚙️ Konfiguracja

### Domyślne ustawienia:

```javascript
{
  slowOperationThreshold: 3000,      // 3 sekundy
  enablePerformanceTracking: true,   // Tylko w produkcji
  performanceSampleRate: 0.1         // 10% operacji w produkcji, 100% w dev
}
```

### Zmiana ustawień globalnie:

```javascript
// src/index.js lub na początku aplikacji
import { configureFirebasePerformance } from './utils/firebaseErrorHandler';

configureFirebasePerformance({
  slowOperationThreshold: 2000,     // Uznaj za wolne po 2 sekundach
  enablePerformanceTracking: true,   // Włącz zawsze
  performanceSampleRate: 0.5         // Śledź 50% operacji
});
```

### Zmiana ustawień per operacja:

```javascript
import { withFirebaseErrorHandling } from './utils/firebaseErrorHandler';

const task = await withFirebaseErrorHandling(
  () => getDoc(doc(db, 'tasks', taskId)),
  'taskService.getTask',
  { taskId },
  {
    trackPerformance: true,   // Wymuś tracking dla tej operacji
    slowThreshold: 1000       // Uznaj za wolne jeśli > 1s
  }
);
```

---

## 📈 Co zobaczysz w Sentry?

### Performance Tab:

1. **Transactions:**
   - Lista operacji Firebase z czasami wykonania
   - Filtruj po: `op:firebase.operation` lub `op:firebase.batch`
   - Sortuj według: duration, frequency

2. **Measurements:**
   - `duration` - czas trwania w ms
   - `itemsCount` - liczba elementów (dla batch)
   - `avgTimePerItem` - średni czas na element (dla batch)

3. **Tags dla filtrowania:**
   - `service:firebase`
   - `operation:nazwaOperacji`
   - `status:success` lub `status:error`
   - `errorCode:kod` (tylko dla błędów)
   - `exists:true/false` (dla getDoc)
   - `empty:true/false` (dla query)

### Issues Tab:

Wszystkie **wolne operacje** (> threshold) są logowane jako warnings:
- Message: "Slow Firebase operation: context"
- Level: warning
- Extra data: duration, threshold, customData

---

## 💡 Przykłady użycia

### Przykład 1: Standardowe użycie (bez zmian)

```javascript
// Używaj normalnie - performance tracking działa automatycznie!
const task = await withFirebaseErrorHandling(
  () => getDoc(doc(db, 'tasks', taskId)),
  'taskService.getTask',
  { taskId }
);
```

### Przykład 2: Krytyczna operacja z niskim threshold

```javascript
// Dla krytycznych operacji możesz ustawić niższy próg
const order = await withFirebaseErrorHandling(
  () => getDoc(doc(db, 'orders', orderId)),
  'orderService.getCriticalOrder',
  { orderId, priority: 'high' },
  {
    trackPerformance: true,  // Zawsze śledź
    slowThreshold: 500       // Alert jeśli > 500ms
  }
);
```

### Przykład 3: Batch operation

```javascript
// Batch operations również są automatycznie śledzone
const items = [/* 100 items */];

await withFirebaseBatchErrorHandling(
  async () => {
    const batch = writeBatch(db);
    items.forEach(item => {
      batch.set(doc(db, 'items', item.id), item);
    });
    await batch.commit();
  },
  'inventoryService.batchCreateItems',
  items
);
```

### Przykład 4: Wyłączenie trackingu dla konkretnej operacji

```javascript
// Jeśli wiesz że operacja będzie wolna i to OK
const largeReport = await withFirebaseErrorHandling(
  () => generateHugeReport(),
  'reportService.generateLarge',
  { reportSize: 'large' },
  {
    trackPerformance: false  // Nie śledź wydajności
  }
);
```

---

## 🔍 Analiza wydajności

### W Sentry Dashboard:

1. **Znajdź najwolniejsze operacje:**
   - Performance → Transactions
   - Filtr: `op:firebase.operation`
   - Sortuj: by P95 duration (najgorsze 5%)

2. **Zobacz trendy:**
   - Performance → Trends
   - Wybierz transaction
   - Zobacz jak zmienia się w czasie

3. **Ustaw alerty:**
   - Alerts → New Alert Rule
   - Condition: "Transaction duration is above X ms"
   - Action: Email, Slack, etc.

### Przykładowe metryki do monitorowania:

```
firebase.operation (getDoc) - P95 < 1000ms ✅
firebase.operation (query)  - P95 < 2000ms ✅
firebase.batch              - P95 < 5000ms ✅
```

---

## 🎯 Best Practices

### ✅ DOBRZE:

1. **Używaj zawsze `withFirebaseErrorHandling()`:**
   ```javascript
   // ✅ Automatycznie śledzi błędy + performance
   await withFirebaseErrorHandling(
     () => getDoc(docRef),
     'service.operation'
   );
   ```

2. **Dodawaj kontekst w extraData:**
   ```javascript
   // ✅ Pomaga w debugowaniu wolnych zapytań
   await withFirebaseErrorHandling(
     () => getDocs(query(collection(db, 'tasks'), where('status', '==', status))),
     'taskService.getByStatus',
     { status, expectedCount: 50 }
   );
   ```

3. **Monitoruj alerty:**
   - Ustaw alerty dla P95 > threshold
   - Reaguj na systematycznie wolne operacje

### ❌ ŹLE:

1. **Nie ustawiaj za niskiego threshold:**
   ```javascript
   // ❌ 100ms to za niski próg - zbyt wiele false positives
   { slowThreshold: 100 }
   ```

2. **Nie wyłączaj trackingu bez powodu:**
   ```javascript
   // ❌ Tracisz cenne dane
   { trackPerformance: false }
   ```

3. **Nie ignoruj ostrzeżeń o wolnych operacjach:**
   - Jeśli widzisz warning o wolnej operacji, zbadaj przyczynę
   - Może brakuje indeksu w Firestore

---

## 🛠️ Rozwiązywanie problemów

### Problem: Zbyt wiele "Slow operation" warnings

**Rozwiązanie:**
```javascript
// Zwiększ threshold globalnie
configureFirebasePerformance({
  slowOperationThreshold: 5000  // 5 sekund
});

// Lub tylko dla konkretnej operacji
{ slowThreshold: 5000 }
```

### Problem: Operacje są rzeczywiście wolne

**Sprawdź:**
1. Czy masz odpowiednie indeksy w Firestore?
2. Czy pobierasz za dużo danych? (użyj limit())
3. Czy można użyć cache? (getDocFromCache)
4. Czy można podzielić na mniejsze zapytania?

### Problem: Performance tracking zużywa za dużo quota w Sentry

**Rozwiązanie:**
```javascript
// Zmniejsz sample rate
configureFirebasePerformance({
  performanceSampleRate: 0.05  // Tylko 5% operacji
});
```

---

## 📚 Dodatkowe zasoby

- **Sentry Performance:** https://docs.sentry.io/product/performance/
- **Firebase Indexes:** https://firebase.google.com/docs/firestore/query-data/indexing
- **Best Practices:** `src/utils/SENTRY_ERROR_HANDLING.md`

---

## ✅ Podsumowanie

✅ Performance tracking działa **automatycznie**  
✅ Wolne operacje są **automatycznie logowane**  
✅ Dane są w **Sentry Performance tab**  
✅ Możesz **dostosować** threshold i sample rate  
✅ **Zero zmian** w istniejącym kodzie  

**Miłego optymalizowania!** 🚀📊

---

**Ostatnia aktualizacja:** 2026-01-08

