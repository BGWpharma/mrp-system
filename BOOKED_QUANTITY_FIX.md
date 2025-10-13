# Poprawka: Aktualizacja bookedQuantity podczas konsumpcji materiałów

## Problem
Konsumpcja materiałów nie zmniejszała `bookedQuantity` w pozycji magazynowej, co powodowało rozbieżności między stanem zarezerwowanym a rzeczywistym.

## Przyczyna
W poprzedniej wersji kodu usunięto logikę odpowiedzialną za aktualizację `bookedQuantity` podczas konsumpcji materiałów. Kod był zastąpiony wywołaniem `updateReservation` i `bookInventoryForTask`, które **już zawierają** logikę aktualizacji `bookedQuantity`, ale **tylko przy usuwaniu/przywracaniu konsumpcji**, nie przy samej konsumpcji.

## Rozwiązanie

### 1. Konsumpcja materiałów (TaskDetailsPage.js, linia ~5966)
Dodano atomową aktualizację `bookedQuantity` w transakcji podczas konsumpcji:

```javascript
// 🔒 ATOMOWA aktualizacja rezerwacji i bookedQuantity
await runTransaction(db, async (transaction) => {
  const reservationRef = doc(db, 'inventoryTransactions', reservationDoc.id);
  const inventoryRef = doc(db, 'inventory', materialId);
  
  // ✅ WAŻNE: Wszystkie odczyty MUSZĄ być przed zapisami w transakcji Firebase
  const freshReservationDoc = await transaction.get(reservationRef);
  const inventoryDoc = await transaction.get(inventoryRef);
  
  // ... przetwarzanie danych ...
  
  // ✅ Teraz wykonujemy wszystkie zapisy po odczytach
  if (newReservedQuantity > 0) {
    transaction.update(reservationRef, { /* ... */ });
  } else {
    transaction.delete(reservationRef);
  }
  
  // 🔧 KLUCZOWE: Aktualizuj bookedQuantity w pozycji magazynowej
  if (inventoryDoc.exists()) {
    const inventoryData = inventoryDoc.data();
    const currentBookedQuantity = Number(inventoryData.bookedQuantity) || 0;
    const newBookedQuantity = Math.max(0, currentBookedQuantity - consumeQuantity);
    
    transaction.update(inventoryRef, {
      bookedQuantity: newBookedQuantity,
      updatedAt: serverTimestamp(),
      updatedBy: currentUser.uid
    });
    
    console.log(`🔧 [BOOKED QUANTITY] ${inventoryData.name}: ${currentBookedQuantity} → ${newBookedQuantity} (-${consumeQuantity})`);
  }
});
```

**⚠️ WAŻNE**: Zgodnie z wymaganiami Firebase Firestore, wszystkie operacje `transaction.get()` muszą być wykonane **przed** wszystkimi operacjami `transaction.update()` i `transaction.delete()`.

### 2. Przywracanie rezerwacji przy usuwaniu konsumpcji (TaskDetailsPage.js, linia ~6521)
Wykorzystuje istniejące funkcje `updateReservation` i `bookInventoryForTask` z `src/services/inventory/reservationService.js`, które **już prawidłowo** aktualizują `bookedQuantity`:

```javascript
if (restoreReservation) {
  // updateReservation i bookInventoryForTask automatycznie aktualizują bookedQuantity
  if (!reservationSnapshot.empty) {
    await updateReservation(/* ... */); // ✅ Aktualizuje bookedQuantity
  } else {
    await bookInventoryForTask(/* ... */); // ✅ Aktualizuje bookedQuantity
  }
}
```

## Przepływ aktualizacji bookedQuantity

### Rezerwacja materiału
1. ✅ `bookInventoryForTask` → wywołuje `updateItemBookedQuantity` → **zwiększa** `bookedQuantity`
2. ✅ Tworzy rekord rezerwacji w `inventoryTransactions`

### Konsumpcja materiału  
1. ✅ Aktualizuje/usuwa rezerwację w `inventoryTransactions`
2. ✅ **TERAZ POPRAWIONE**: Atomowo **zmniejsza** `bookedQuantity` w transakcji
3. ✅ Zapisuje konsumpcję w `task.consumedMaterials`

### Usunięcie konsumpcji (restore)
1. ✅ `updateReservation` lub `bookInventoryForTask` → **zwiększa** `bookedQuantity`
2. ✅ Przywraca rezerwację w `inventoryTransactions`
3. ✅ Usuwa konsumpcję z `task.consumedMaterials`

## Testy weryfikacyjne

### Test 1: Konsumpcja zmniejsza bookedQuantity
```
1. Stan początkowy: bookedQuantity = 500
2. Konsumpcja: 500 caps
3. Oczekiwany wynik: bookedQuantity = 0 ✅
4. Log: "🔧 [BOOKED QUANTITY] RAWSHA-MULTIVITAMIN: 500 → 0 (-500)"
```

### Test 2: Usunięcie konsumpcji przywraca bookedQuantity
```
1. Stan początkowy: bookedQuantity = 0 (po konsumpcji)
2. Usunięcie konsumpcji z restore: 500 caps
3. Oczekiwany wynik: bookedQuantity = 500 ✅
4. updateReservation automatycznie zwiększa bookedQuantity
```

## Pliki zmodyfikowane
- `src/pages/Production/TaskDetailsPage.js` (linia ~5966-6019)

## Pliki niezmienione (już zawierają poprawną logikę)
- `src/services/inventory/reservationService.js`:
  - `updateReservation` (linia 426-436) - aktualizuje bookedQuantity
  - `bookInventoryForTask` (linia 153) - wywołuje updateItemBookedQuantity
  - `updateItemBookedQuantity` (linia 314-350) - atomowa aktualizacja bookedQuantity

## Weryfikacja
Po implementacji należy sprawdzić logi:
1. ✅ Rezerwacja: `"✅ [SYNC] Synchronizacja zakończona, bookedQuantity: 500"`
2. ✅ Konsumpcja: `"🔧 [BOOKED QUANTITY] RAWSHA-MULTIVITAMIN: 500 → 0 (-500)"`
3. ✅ Restore: `"🔧 [BOOKED QUANTITY UPDATE] RAWSHA-MULTIVITAMIN: 0 → 500 (+500)"`

