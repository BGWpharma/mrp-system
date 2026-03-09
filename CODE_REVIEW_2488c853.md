# Code Review — Commit 2488c853

**Data:** 2026-03-09  
**Commit:** `Add migrateSignedUrls function and update dependencies`  
**Autor:** BGWpharma

---

## 1. KRYTYCZNE — `firebase-debug.log` dodany do repozytorium

Plik `firebase-debug.log` (353 linii) został zacommitowany do repozytorium. Ten plik:
- Zawiera lokalne logi debugowania Firebase CLI
- Może zawierać wrażliwe informacje (ścieżki, tokeny, konfigurację)
- Będzie rosnąć z każdym lokalnym uruchomieniem Firebase

**Poprawka:**
```bash
echo "firebase-debug.log" >> .gitignore
git rm --cached firebase-debug.log
```

---

## 2. KRYTYCZNE — Zduplikowana logika generowania URL

Funkcja `generateTokenUrl` w `functions/callable/migrateSignedUrls.js` (linie 22-39) jest **identyczna** z `getSignedUrl` w `functions/utils/ocrHelpers.js` (linie 41-55). Obie:
- Pobierają metadata pliku
- Sprawdzają/generują token `firebaseStorageDownloadTokens`
- Budują URL Firebase Storage

**Ryzyko:** Jeśli w przyszłości zmieni się format URL lub logika tokenów, trzeba pamiętać o aktualizacji w dwóch miejscach.

**Poprawka:** `migrateSignedUrls.js` powinien importować `getSignedUrl` z `ocrHelpers.js`:
```javascript
const { getSignedUrl } = require("../utils/ocrHelpers");
// Użycie: const newUrl = await getSignedUrl(bucket, storagePath);
```

---

## 3. BUG — `receivedDelta` ignoruje korekty w dół (purchaseOrder.js)

```javascript
// Linia 231
if (receivedDelta > 0) {
  updatedAvailableQuantity += receivedDelta;
  forecastChanged = true;
}
```

Jeśli ilość przyjęta zostanie skorygowana w dół (np. ze 100 na 80, delta = -20), `availableQuantity` w prognozie **nie zostanie zmniejszona**. To prowadzi do zawyżenia stanu dostępnego w prognozach.

**Poprawka:**
```javascript
if (receivedDelta !== 0) {
  updatedAvailableQuantity += receivedDelta;
  updatedAvailableQuantity = Math.max(0, updatedAvailableQuantity);
  forecastChanged = true;
}
```

---

## 4. BUG — Dzielenie przez zero w `correctMaterialQuantity` (procurementForecastService.js)

```javascript
const correctMaterialQuantity = (material, taskQuantity) => {
  if (material.quantityPerUnit && material.quantityPerUnit > 0) {
    return material.quantityPerUnit;
  }
  if (material.isFullTaskQuantity || material.isTotal) {
    return material.quantity / taskQuantity; // ⚠️ taskQuantity może być 0!
  }
  if (taskQuantity > 0) {
    return material.quantity / taskQuantity;
  }
  return material.quantity;
};
```

Gdy `material.isFullTaskQuantity === true` i `taskQuantity === 0`, nastąpi dzielenie przez zero (`Infinity`). Guard `taskQuantity > 0` chroni tylko ostatni branch.

**Poprawka:**
```javascript
if (material.isFullTaskQuantity || material.isTotal) {
  return taskQuantity > 0 ? material.quantity / taskQuantity : material.quantity;
}
```

> **UWAGA:** Ten sam bug istnieje w `src/pages/Production/ForecastPage.js` (linia 258). Logika jest zduplikowana — powinna być wydzielona do wspólnego modułu utility.

---

## 5. BUG — Status `"draft"` w `terminalStatuses` powoduje niespójność (purchaseOrder.js)

Dodanie `"draft"` do `terminalStatuses`:
```javascript
const terminalStatuses = ["completed", "cancelled", "draft"];
```

**Problem:** Gdy PO zmienia status z `"ordered"` na `"draft"`:
- Nowe dostawy dla draft PO **nie zostaną dodane** (linia 299: blokuje terminalStatuses)
- Ale istniejące dostawy powiązane z tym PO **nie zostaną usunięte** — filtr na linii 290 usuwa tylko `cancelled` ze `quantity <= 0`
- Dostawa pozostaje w prognozie ze starym statusem, zaburzając bilans

**Poprawka:** Dodać usuwanie dostaw dla PO ze statusem `"draft"`:
```javascript
updatedDeliveries = updatedDeliveries.filter((d) => {
  if ((d.status === "cancelled" || d.status === "draft") && d.quantity <= 0) {
    forecastChanged = true;
    return false;
  }
  return true;
});
```
Lub bardziej kompleksowo — aktualizować status dostawy na "draft" i wyzerować quantity.

---

## 6. PROBLEM UX — WorkTimePage: domyślne czasy mogą być niespójne

Nowa logika zaokrąglania:
- `startTime = roundUp30(now)` → np. 10:15 → **10:30**
- `endTime = roundDown30(now)` → np. 10:15 → **10:00**

Domyślnie `endTime (10:00) < startTime (10:30)`, co jest stanem nieprawidłowym. Walidacja `minEndTime` wymaga `end > start`, więc użytkownik musi ręcznie poprawić czas końcowy.

Dodatkowo walidacja startu:
```javascript
// Start nie może być wcześniej niż teraz
if (time < nowCheck) { return error; }
```
Ale `roundUp30(10:15) = 10:30`, a `now = 10:15`. Start (10:30) > now (10:15) — przejdzie walidację. Ale jeśli jest dokładnie 10:30, zanim użytkownik kliknie "Zapisz", `now` może być 10:30:02, i start (10:30:00) < now — walidacja odrzuci.

**Poprawka:** Dodać margines tolerancji (np. 1-2 minuty) lub zaokrąglać `now` w walidacji:
```javascript
const validateStartTime = (time) => {
  if (!time || isNaN(time.getTime())) return t('validation.selectValidTime');
  const nowCheck = new Date();
  nowCheck.setSeconds(0, 0); // Zaokrągl do pełnej minuty
  if (time < nowCheck) { ... }
  return '';
};
```

---

## 7. WYDAJNOŚĆ — `recalculateProcurementForecast` pobiera WSZYSTKIE pozycje magazynowe

```javascript
const [allItems, tasksData] = await Promise.all([
  getAllInventoryItems(),  // ⚠️ Pobiera WSZYSTKIE pozycje!
  ...
]);
```

`getAllInventoryItems()` pobiera całą kolekcję `inventory` z Firestore (włącznie z obliczaniem partii), a potem filtruje jedynie po `materialIds`. Dla dużego magazynu (setki/tysiące pozycji) jest to znaczące obciążenie.

**Poprawka:** Użyć `getInventoryItemById` w pętli lub dodać metodę `getInventoryItemsByIds(ids)`:
```javascript
const inventoryItems = await Promise.all(
  materialIds.map(id => getInventoryItemById(id).catch(() => null))
);
```
Lub jeszcze lepiej — stworzyć zoptymalizowaną funkcję batchową z `documentId()` query.

---

## 8. BEZPIECZEŃSTWO — `migrateSignedUrls` brak weryfikacji uprawnień

```javascript
if (!request.auth) {
  throw new Error("Unauthorized - authentication required");
}
```

Każdy zalogowany użytkownik może wywołać tę migrację. Jako jednorazowa operacja administracyjna, powinna wymagać weryfikacji roli admina.

**Poprawka:**
```javascript
if (!request.auth) {
  throw new Error("Unauthorized");
}
// Weryfikacja roli admina
const userDoc = await db.collection('users').doc(request.auth.uid).get();
if (!userDoc.exists || userDoc.data().role !== 'admin') {
  throw new Error("Forbidden - admin role required");
}
```

---

## 9. WYDAJNOŚĆ — `migrateSignedUrls` przetwarza dokumenty sekwencyjnie

Funkcja `migrateCollection` przetwarza każdy dokument po kolei (`for...of`). Przy limitie 540 sekund i dużej kolekcji, może nie zdążyć.

**Poprawka:** Przetwarzanie w równoległych batchach:
```javascript
const BATCH_SIZE = 10;
for (let i = 0; i < snapshot.docs.length; i += BATCH_SIZE) {
  const batch = snapshot.docs.slice(i, i + BATCH_SIZE);
  await Promise.all(batch.map(async (doc) => { /* ... */ }));
}
```

---

## 10. EDGE CASE — `recalculateProcurementForecast` zeruje materiały bez aktywnych tasków

Jeśli materiał istnieje w prognozie, ale nie ma aktywnych tasków w okresie prognozy (np. task został ukończony lub usunięty):
```javascript
const recalculatedRequired = taskReq
  ? parseFloat(taskReq.requiredQuantity.toFixed(2))
  : 0;  // ⚠️ Wyzeruje requiredQuantity!
```

Materiał traci swoją wartość `requiredQuantity`, co może być zaskakujące — zwłaszcza jeśli materiał został dodany ręcznie.

**Poprawka:** Zachować oryginalną wartość jako fallback:
```javascript
const recalculatedRequired = taskReq
  ? parseFloat(taskReq.requiredQuantity.toFixed(2))
  : material.requiredQuantity || 0;
```

---

## 11. CODE SMELL — Zduplikowana logika `correctMaterialQuantity`

Identyczna funkcja istnieje w dwóch miejscach:
- `src/pages/Production/ForecastPage.js` (linie 251-269)
- `src/services/purchaseOrders/procurementForecastService.js` (nowa)

**Poprawka:** Wydzielić do wspólnego modułu:
```
src/utils/materialCalculations.js
```

---

## 12. DROBNE — `colSpan` zmieniony z 10 na 9, ale liczba kolumn wymaga weryfikacji

Zmiana `colSpan={10}` na `colSpan={9}` w `ProcurementForecastsPage.js`. Usunięto kolumnę "Kategoria" i "Bilans", ale dodano kolumnę "Skonsumowano". Aktualna liczba kolumn:
1. Expand icon
2. Materiał (z kategorią)
3. MO
4. Wymagane
5. **Skonsumowano (nowa)**
6. Dostępne
7. Przyszłe dostawy
8. Bilans z dostawami
9. Notatki

= **9 kolumn** — wartość `colSpan={9}` jest poprawna ✓

---

## 13. POZYTYWNE ZMIANY

- **Migracja z signed URLs na token-based URLs** — dobra decyzja, signed URLs Google wygasają przy rotacji kluczy
- **Optymalizacja pobierania PO** w `ForecastPage.js` — jedno zapytanie `getAwaitingOrdersForMultipleItems` zamiast N zapytań
- **Komponent `NotesCell`** wydzielony z `React.memo` — lepsza wydajność, unika niepotrzebnych rerenderów
- **Filtrowanie dostaw wg zakresu prognozy** (`isWithinForecastRange`) — poprawna logika
- **Zmiana `find` na `filter` + `reduce`** dla `consumedMaterials` — obsługuje przypadek wielu wpisów zużycia tego samego materiału w jednym tasku
- **Formatowanie budgetSuggestionService.js** — wydzielenie `rawJson` poprawia czytelność i debugowalność
- **Zmiana `let` → `const`** w `exchangeRates.js` — poprawne, obiekt nie jest reassignowany

---

## PRIORYTETY POPRAWEK

| # | Priorytet | Problem | Plik |
|---|-----------|---------|------|
| 1 | 🔴 Krytyczny | `firebase-debug.log` w repo | `.gitignore` |
| 2 | 🔴 Krytyczny | Duplikacja `generateTokenUrl` | `migrateSignedUrls.js` |
| 3 | 🟠 Wysoki | `receivedDelta` ignoruje korekty w dół | `purchaseOrder.js` |
| 4 | 🟠 Wysoki | Dzielenie przez zero | `procurementForecastService.js`, `ForecastPage.js` |
| 5 | 🟠 Wysoki | `"draft"` w terminalStatuses niespójny | `purchaseOrder.js` |
| 6 | 🟡 Średni | Domyślne czasy endTime < startTime | `WorkTimePage.js` |
| 7 | 🟡 Średni | getAllInventoryItems() pobiera wszystko | `procurementForecastService.js` |
| 8 | 🟡 Średni | Brak weryfikacji roli admina | `migrateSignedUrls.js` |
| 9 | 🟢 Niski | Sekwencyjne przetwarzanie migracji | `migrateSignedUrls.js` |
| 10 | 🟢 Niski | Zerowanie requiredQuantity bez tasków | `procurementForecastService.js` |
| 11 | 🟢 Niski | Duplikacja correctMaterialQuantity | Oba pliki |
