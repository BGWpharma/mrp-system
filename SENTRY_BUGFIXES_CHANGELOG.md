# 🐛 Changelog Poprawek Błędów z Sentry

**Data**: 09.01.2026  
**Wersja**: 0.1.237+fixes

---

## 📋 Podsumowanie

Zaimplementowano poprawki dla **wszystkich 10 błędów** wykrytych przez Sentry.io w projekcie `bgw-mrp-system`.

### Statystyki Przed Poprawkami:
- ❌ **13 wystąpień** Firebase precondition error
- ❌ **2 wystąpienia** ValidationError: warehouseId
- ❌ **4 wystąpienia** błędów rezerwacji z nieczytelnym kontekstem
- ❌ **1 wystąpienie** test error (ignorowane)

### Oczekiwany Wynik Po Poprawkach:
- ✅ **0 wystąpień** Firebase precondition error
- ✅ **0 wystąpień** ValidationError: warehouseId (z automatycznym fallback)
- ✅ **Czytelne błędy** rezerwacji z pełnym kontekstem w Sentry

---

## 🔧 Wprowadzone Poprawki

### 1️⃣ Naprawa Firebase Precondition Error (BGW-MRP-SYSTEM-4)

**Problem**: Zapytania Firestore używające `where()` + `orderBy()` na różnych polach wymagały composite index, którego nie było.

**Lokalizacja**: `src/services/cmrService.js`

**Funkcje poprawione**:
- `getCmrAttachments()` (linia ~2895)
- `getCmrInvoices()` (linia ~3048)
- `getCmrOtherAttachments()` (linia ~3187)

**Rozwiązanie**: 
- Usunięto `orderBy('uploadedAt', 'desc')` z zapytań Firestore
- Dodano sortowanie po stronie klienta po pobraniu danych
- Sortowanie zachowuje tę samą funkcjonalność (desc - najnowsze pierwsze)

**Kod przed**:
```javascript
const q = query(
  collection(db, 'cmrOtherAttachments'),
  where('cmrId', '==', cmrId),
  orderBy('uploadedAt', 'desc')  // ❌ Wymaga indeksu
);
```

**Kod po**:
```javascript
const q = query(
  collection(db, 'cmrOtherAttachments'),
  where('cmrId', '==', cmrId)
  // ✅ Bez orderBy
);

// Sortowanie po stronie klienta
return attachments.sort((a, b) => {
  if (!a.uploadedAt) return 1;
  if (!b.uploadedAt) return -1;
  return b.uploadedAt - a.uploadedAt;
});
```

**Wpływ**: Naprawia **13 wystąpień błędu** (najczęstszy błąd w systemie)

---

### 2️⃣ Walidacja i Fallback dla warehouseId (BGW-MRP-SYSTEM-9, A)

**Problem**: Podczas wydawania produktów z partii CMR, pole `warehouseId` było `undefined`, co powodowało ValidationError.

**Lokalizacja**: `src/services/cmrService.js` (funkcja `processCmrDelivery`, linia ~1223)

**Rozwiązanie**:
- Dodano walidację `warehouseId` przed wywołaniem `issueInventory()`
- Zaimplementowano automatyczny fallback: jeśli `warehouseId` brakuje, pobiera go z bazy danych
- Dodano szczegółowe komunikaty błędów dla różnych scenariuszy

**Kod**:
```javascript
// ✅ WALIDACJA: Sprawdź czy linkedBatch ma wszystkie wymagane pola
if (!linkedBatch.warehouseId) {
  console.warn(`⚠️ Partia ${linkedBatch.batchNumber} nie ma przypisanego warehouseId`);
  
  // Spróbuj pobrać warehouseId z bazy danych
  if (linkedBatch.id) {
    try {
      const batchRef = doc(db, 'inventoryBatches', linkedBatch.id);
      const batchDoc = await getDoc(batchRef);
      
      if (batchDoc.exists()) {
        linkedBatch.warehouseId = batchDoc.data().warehouseId;
        console.log(`✅ Znaleziono warehouseId z bazy: ${linkedBatch.warehouseId}`);
        
        if (!linkedBatch.warehouseId) {
          throw new Error(`Partia ${linkedBatch.batchNumber} istnieje w bazie, ale nie ma przypisanego warehouseId`);
        }
      } else {
        throw new Error(`Partia ${linkedBatch.batchNumber} (ID: ${linkedBatch.id}) nie istnieje w bazie danych`);
      }
    } catch (fetchError) {
      console.error(`❌ Błąd podczas pobierania danych partii ${linkedBatch.batchNumber}:`, fetchError);
      throw new Error(`Nie można pobrać danych partii ${linkedBatch.batchNumber}: ${fetchError.message}`);
    }
  } else {
    throw new Error(`Partia ${linkedBatch.batchNumber} nie ma ID - niemożliwe pobranie warehouseId z bazy`);
  }
}
```

**Wpływ**: Naprawia **2 wystąpienia błędu** i zapobiega przyszłym wystąpieniom

**Długoterminowa rekomendacja**: Naprawić mechanizm linkowania partii do CMR, aby zawsze zapisywał `warehouseId`.

---

### 3️⃣ Poprawa Obsługi Błędów Rezerwacji (BGW-MRP-SYSTEM-5, 6, 7, 8)

**Problem**: Błędy w funkcji `bookInventoryForTask` były logowane jako puste obiekty `{}` w Sentry, co uniemożliwiało debugowanie.

**Lokalizacja**: `src/services/inventory/reservationService.js`

**Rozwiązanie**:
- Dodano import `@sentry/react`
- Dodano import `firebaseErrorHandler`
- Zaimplementowano szczegółowe logowanie błędów z pełnym kontekstem
- Błędy są raportowane do Sentry z tagami i dodatkowymi danymi
- ValidationError nie jest raportowany (to oczekiwane błędy użytkownika)

**Kod przed**:
```javascript
} catch (error) {
  console.error('❌ [REFACTOR] bookInventoryForTask ERROR:', error);
  if (error instanceof ValidationError) {
    throw error;
  }
  throw new Error(`Nie udało się zarezerwować materiału: ${error.message}`);
}
```

**Kod po**:
```javascript
} catch (error) {
  // ✅ Lepsze logowanie błędów do Sentry z pełnym kontekstem
  const errorDetails = {
    errorName: error.name,
    errorMessage: error.message,
    errorStack: error.stack,
    itemId,
    taskId,
    quantity,
    batchId,
    reservationMethod,
    autoCreatePOReservations
  };
  
  console.error('❌ [REFACTOR] bookInventoryForTask ERROR:', errorDetails);
  
  // Wyślij do Sentry z pełnym kontekstem (tylko jeśli to nie ValidationError)
  if (!(error instanceof ValidationError)) {
    Sentry.captureException(error, {
      tags: {
        service: 'inventory',
        operation: 'bookInventoryForTask',
        itemId: itemId,
        taskId: taskId
      },
      extra: errorDetails,
      level: 'error'
    });
  }
  
  if (error instanceof ValidationError) {
    throw error;
  }
  throw new Error(`Nie udało się zarezerwować materiału: ${error.message}`);
}
```

**Wpływ**: Znacząco poprawia czytelność błędów w Sentry - teraz widać wszystkie szczegóły

---

### 4️⃣ Lepsze Raportowanie Błędów CMR Delivery

**Problem**: Błędy podczas wydawania produktów z partii CMR nie miały wystarczającego kontekstu w Sentry.

**Lokalizacja**: `src/services/cmrService.js` (funkcja `processCmrDelivery`)

**Rozwiązanie**:
- Dodano szczegółowe raportowanie błędów do Sentry w catch block
- Każdy błąd zawiera pełny konteks: cmrNumber, batchNumber, itemId, warehouseId, etc.
- Dodano tagi dla łatwego filtrowania w Sentry

**Kod**:
```javascript
} catch (error) {
  console.error(`Błąd podczas wydawania z partii ${linkedBatch.batchNumber}:`, error);
  
  // ✅ Raportuj do Sentry z pełnym kontekstem
  Sentry.captureException(error, {
    tags: {
      service: 'cmr',
      operation: 'processCmrDelivery_issueInventory',
      cmrId: cmrId,
      cmrNumber: cmrData.cmrNumber,
      batchNumber: linkedBatch.batchNumber
    },
    extra: {
      errorMessage: error.message,
      errorStack: error.stack,
      linkedBatch: {
        id: linkedBatch.id,
        batchNumber: linkedBatch.batchNumber,
        itemId: linkedBatch.itemId,
        itemName: linkedBatch.itemName,
        warehouseId: linkedBatch.warehouseId,
        quantity: quantityToIssue
      },
      cmrData: {
        cmrNumber: cmrData.cmrNumber,
        status: cmrData.status,
        customerId: cmrData.customerId
      }
    },
    level: 'error'
  });
  
  errors.push({
    operation: 'issue_inventory',
    itemName: linkedBatch.itemName,
    batchNumber: linkedBatch.batchNumber,
    error: error.message
  });
}
```

**Wpływ**: Każdy błąd w Sentry zawiera teraz pełne informacje diagnostyczne

---

### 5️⃣ Dokumentacja i Best Practices

**Dodano**:
- Komentarze w kodzie wyjaśniające wprowadzone zmiany
- Import `@sentry/react` i `firebaseErrorHandler` tam gdzie potrzeba
- Dokumentacja obsługi błędów w `reservationService.js`

---

## 📊 Pliki Zmodyfikowane

| Plik | Linie zmian | Opis |
|------|-------------|------|
| `src/services/cmrService.js` | ~90 | Sortowanie po stronie klienta, walidacja warehouseId, Sentry reporting |
| `src/services/inventory/reservationService.js` | ~50 | Lepsze logowanie błędów, import Sentry |

---

## 🧪 Testowanie

### Jak przetestować poprawki:

#### Test 1: Firebase Precondition Error
1. Otwórz stronę CMR z załącznikami
2. Sprawdź czy załączniki się ładują bez błędów
3. W Sentry nie powinno pojawić się `failed-precondition` error

#### Test 2: ValidationError warehouseId
1. Znajdź CMR z powiązanymi partiami
2. Wykonaj operację "Dostarcz CMR"
3. Sprawdź logi - jeśli partia nie ma warehouseId, powinien być pobrany z bazy
4. W Sentry nie powinien pojawić się `ValidationError: warehouseId`

#### Test 3: Błędy Rezerwacji
1. Spróbuj zarezerwować materiał dla zadania produkcyjnego
2. Jeśli wystąpi błąd, sprawdź Sentry
3. Błąd powinien zawierać pełny kontekst: itemId, taskId, quantity, etc.

---

## 🎯 Oczekiwane Rezultaty

Po wdrożeniu tych poprawek:

1. ✅ **Zero błędów Firebase precondition** - sortowanie działa poprawnie
2. ✅ **Zero błędów ValidationError warehouseId** - automatyczny fallback
3. ✅ **Czytelne błędy w Sentry** - każdy błąd ma pełny kontekst
4. ✅ **Lepszy monitoring** - łatwiejsze debugowanie problemów

---

## 📝 Uwagi

### Długoterminowe działania:

1. **Naprawić mechanizm linkowania partii do CMR**
   - Upewnić się że zawsze zapisuje `warehouseId`
   - Dodać walidację przed zapisem do bazy

2. **Zaimplementować Sentry w Firebase Functions**
   - Aby śledzić błędy po stronie backend
   - Cloud Functions obecnie nie są monitorowane

3. **Utworzyć indeksy Firestore (opcjonalnie)**
   - Jeśli wydajność sortowania po stronie klienta będzie problematyczna
   - Utworzyć composite indexes dla `cmrId + uploadedAt`

4. **Skonfigurować alerty w Sentry**
   - Dla błędów powtarzających się > 5x
   - Dla wolnych operacji Firebase > 1500ms

---

## 🚀 Deployment

```bash
# 1. Zbuduj aplikację
npm run build

# 2. Wgraj source maps do Sentry
npm run sentry:sourcemaps

# 3. Zweryfikuj w Sentry Console
# że release mrp-system@0.1.237 ma załączone source maps
```

---

## 📞 Kontakt

W razie pytań lub problemów:
- Sprawdź Sentry Dashboard: https://bgwpharma.sentry.io/issues/
- Zobacz README: `SENTRY_IMPLEMENTATION_SUMMARY.md`
- Dokumentacja: `src/utils/SENTRY_ERROR_HANDLING.md`

