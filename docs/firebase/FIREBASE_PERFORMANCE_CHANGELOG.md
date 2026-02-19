# 🚀 Firebase Performance Tracking - Changelog

**Data:** 2026-01-08  
**Status:** ✅ Zaimplementowane

---

## 🎉 Co nowego?

### Automatyczne śledzenie wydajności Firebase

Wszystkie operacje Firebase używające `withFirebaseErrorHandling()` i `withFirebaseBatchErrorHandling()` **automatycznie** śledzą teraz:

1. **Czas trwania operacji** (w milisekundach)
2. **Status operacji** (success/error)
3. **Wolne zapytania** (> 3 sekundy automatycznie logowane)
4. **Metryki batch operations** (liczba elementów, średni czas)
5. **Dodatkowe dane** (czy dokument istnieje, czy wynik jest pusty)

---

## 🔄 Czy muszę zmienić swój kod?

### **NIE! Zero zmian wymaganych!** ✅

Jeśli już używasz `withFirebaseErrorHandling()`, performance tracking działa automatycznie:

```javascript
// Ten kod już śledzi wydajność automatycznie!
const task = await withFirebaseErrorHandling(
  () => getDoc(doc(db, 'tasks', taskId)),
  'taskService.getTask',
  { taskId }
);
```

---

## ⚙️ Nowe funkcje (opcjonalne)

### 1. Konfiguracja globalna

```javascript
// src/index.js - na początku aplikacji
import { configureFirebasePerformance } from './utils/firebaseErrorHandler';

configureFirebasePerformance({
  slowOperationThreshold: 2000,     // Alert dla operacji > 2s
  enablePerformanceTracking: true,   // Włącz tracking
  performanceSampleRate: 0.5         // Śledź 50% operacji
});
```

### 2. Konfiguracja per operacja

```javascript
// Możesz dostosować opcje dla pojedynczej operacji
const task = await withFirebaseErrorHandling(
  () => getDoc(doc(db, 'tasks', taskId)),
  'taskService.getTask',
  { taskId },
  {
    trackPerformance: true,   // Wymuś tracking
    slowThreshold: 1000       // Alert jeśli > 1s
  }
);
```

### 3. Nowe funkcje pomocnicze

```javascript
import { 
  getFirebasePerformanceConfig,
  configureFirebasePerformance 
} from './utils/firebaseErrorHandler';

// Sprawdź aktualną konfigurację
const config = getFirebasePerformanceConfig();
console.log('Current config:', config);
```

---

## 📊 Co zobaczysz w Sentry?

### Performance Tab:
- **Transactions** - lista operacji Firebase z czasami
- **Measurements** - duration, itemsCount, avgTimePerItem
- **Tags** - service, operation, status, errorCode

### Issues Tab:
- **Warnings** dla wolnych operacji (> 3s)
- Message: "Slow Firebase operation: context"
- Extra data: duration, threshold, customData

### Przykładowe metryki:

```
Operation: firebase.operation (taskService.getTask)
Duration: P50: 245ms, P95: 892ms, P99: 2.1s
Status: 98.5% success, 1.5% error
Tags: service:firebase, operation:taskService.getTask
```

---

## 🎯 Domyślna konfiguracja

```javascript
{
  slowOperationThreshold: 3000,      // 3 sekundy
  enablePerformanceTracking: true,   // Tylko w produkcji
  performanceSampleRate: 0.1         // 10% w produkcji, 100% w dev
}
```

### Dlaczego 10% w produkcji?

- **Quota Sentry** - oszczędza limit transakcji
- **Performance** - minimalizuje overhead
- **Statystyki** - 10% to wystarczająco reprezentatywna próbka

W development śledzone jest 100% operacji dla pełnego wglądu.

---

## 📚 Dokumentacja

Pełna dokumentacja dostępna w:
- **`docs/firebase/FIREBASE_PERFORMANCE.md`** - kompletny przewodnik
- **`docs/sentry/README_SENTRY.md`** - quick start
- **`src/utils/sentryExamples.js`** - przykłady użycia

---

## 🔧 Przykłady użycia

### Standardowe użycie (bez zmian):
```javascript
// Automatycznie śledzi wydajność
const doc = await withFirebaseErrorHandling(
  () => getDoc(docRef),
  'service.operation'
);
```

### Z niskim threshold dla krytycznych operacji:
```javascript
const order = await withFirebaseErrorHandling(
  () => getDoc(doc(db, 'orders', orderId)),
  'orderService.getCriticalOrder',
  { orderId },
  { slowThreshold: 500 } // Alert jeśli > 500ms
);
```

### Batch operations:
```javascript
// Automatycznie śledzi: duration, itemsCount, avgTimePerItem
await withFirebaseBatchErrorHandling(
  async () => {
    const batch = writeBatch(db);
    items.forEach(item => batch.set(doc(db, 'items', item.id), item));
    await batch.commit();
  },
  'service.batchOperation',
  items
);
```

---

## ⚠️ Breaking Changes

**BRAK!** Wszystko jest wstecznie kompatybilne.

Nowe parametry `options` są opcjonalne:
```javascript
// Stare wywołanie - nadal działa
withFirebaseErrorHandling(operation, context, extraData)

// Nowe wywołanie - z opcjami
withFirebaseErrorHandling(operation, context, extraData, options)
```

---

## 🐛 Znane problemy

**Brak znanych problemów.**

Jeśli napotkasz problem:
1. Sprawdź konsolę przeglądarki
2. Zobacz `getFirebasePerformanceConfig()`
3. Zgłoś przez Sentry lub GitHub

---

## 💡 Best Practices

### ✅ Zalecane:
1. Pozostaw domyślną konfigurację dla większości przypadków
2. Ustaw niższy threshold dla krytycznych operacji
3. Monitoruj Sentry Dashboard regularnie
4. Reaguj na systematycznie wolne operacje

### ⚠️ Uwaga:
1. Nie ustawiaj za niskiego threshold (< 500ms)
2. Nie zwiększaj sample rate bez potrzeby (quota Sentry)
3. Nie wyłączaj trackingu globalnie (tracisz cenne dane)

---

## 📈 Analiza wydajności

### W Sentry Dashboard:

1. **Performance → Transactions**
   - Filtr: `op:firebase.operation`
   - Sortuj: by P95 duration

2. **Performance → Trends**
   - Wybierz operation
   - Zobacz zmiany w czasie

3. **Alerts → New Alert**
   - Condition: "Transaction duration > Xms"
   - Action: Email/Slack

---

## ✅ Checklist migracji

- [x] Zaktualizowano `firebaseErrorHandler.js`
- [x] Dodano performance tracking
- [x] Dodano konfigurację
- [x] Utworzono dokumentację
- [x] Zaktualizowano przykłady
- [x] Zero breaking changes
- [x] Backward compatible
- [x] Gotowe do użycia!

---

## 🎊 Podsumowanie

✅ **Automatyczne śledzenie** wydajności Firebase  
✅ **Zero zmian** w istniejącym kodzie  
✅ **Konfigurowalny** threshold i sample rate  
✅ **Dane w Sentry** Performance tab  
✅ **Ostrzeżenia** dla wolnych operacji  
✅ **Wstecznie kompatybilny**  

**Ciesz się automatycznym monitoringiem wydajności!** 🚀📊

---

**Ostatnia aktualizacja:** 2026-01-08
