# Naprawa błędu: Usuwanie powiązania zamówienia klienta przy aktualizacji ilości

## 🐛 Problem

Pracownik zgłosił poważny błąd: **aktualizacja ilości w zadaniu produkcyjnym powodowała usunięcie powiązania z zamówieniem klienta**.

### Przyczyna

W pliku `src/components/production/TaskForm.js` istniał **warunek wyścigowy** (race condition):

1. Użytkownik otwiera formularz edycji zadania produkcyjnego
2. Funkcja `fetchTask()` ładuje zadanie z powiązaniem (`orderId`, `orderNumber`, `orderItemId`)
3. Zamówienia klientów (`customerOrders`) są ładowane **asynchronicznie w tle**
4. **JEŚLI użytkownik zmieni ilość ZANIM zamówienia się załadują**, `selectedCustomerOrder` pozostaje `null`
5. W funkcji `handleSubmit`:
   - `const newOrderId = selectedCustomerOrder?.id || null;` zwraca `null`
   - `orderLinkChanged = true` (bo `originalOrderId !== null`)
   - Kod błędnie interpretuje to jako **zamierzone usunięcie powiązania**
   - Pola `orderId`, `orderNumber`, `orderItemId` są ustawiane na `null`
6. **Powiązanie zostaje usunięte z bazy danych**

## ✅ Rozwiązanie

Zaimplementowano **trzy zabezpieczenia** w pliku `TaskForm.js`:

### ZABEZPIECZENIE 1: Ochrona istniejącego powiązania (linie 786-794)

Przed wywołaniem `updateTask()`, kod sprawdza czy dane zamówień zostały załadowane:

```javascript
// Jeśli edytujemy zadanie z powiązaniem, ale zamówienia nie zostały załadowane,
// zachowaj istniejące pola powiązania aby uniknąć przypadkowego usunięcia
if (!dataLoaded.customerOrders && taskData.orderId) {
  formattedData.orderId = taskData.orderId;
  formattedData.orderNumber = taskData.orderNumber;
  formattedData.orderItemId = taskData.orderItemId;
  formattedData.customer = taskData.customer;
  console.log('🛡️ Zachowano istniejące powiązanie z zamówieniem');
}
```

### ZABEZPIECZENIE 2: Warunkowa detekcja zmian (linie 800-806)

Zmiana powiązania jest wykrywana **TYLKO** gdy dane zamówień zostały załadowane:

```javascript
// Sprawdź czy zmieniono powiązanie z zamówieniem klienta
// WAŻNE: Tylko jeśli dane zamówień zostały załadowane!
const newOrderId = selectedCustomerOrder?.id || null;
const orderLinkChanged = dataLoaded.customerOrders && (
  originalOrderId !== newOrderId || 
  (newOrderId && taskData.orderItemId !== selectedOrderItemId)
);
```

### ZABEZPIECZENIE 3: Ostrzeżenie przy usuwaniu powiązania (linie 812-816)

Dodano logging dla debugowania:

```javascript
// Jeśli newOrderId jest null ale originalOrderId istnieje,
// sprawdź czy użytkownik faktycznie chciał usunąć powiązanie
if (!newOrderId && originalOrderId) {
  console.warn('⚠️ Próba usunięcia powiązania z zamówieniem - to jest zamierzona akcja użytkownika');
}
```

## 🔧 Dodatkowe poprawki

Naprawiono również **niebezpieczne użycia `setTaskData`** które mogły prowadzić do utraty danych:

- `handleQuantityChange` - zmieniono na callback pattern
- `handleRecipeChange` - zmieniono na callback pattern
- `handleEndDateChange` - zmieniono na callback pattern
- Inne inline handlery - zmieniono na callback pattern

**Przed:**
```javascript
setTaskData({
  ...taskData,
  quantity: newQuantity
});
```

**Po:**
```javascript
setTaskData(prev => ({
  ...prev,
  quantity: newQuantity
}));
```

## 📋 Testowanie

Aby zweryfikować poprawkę:

1. Otwórz formularz edycji zadania produkcyjnego powiązanego z zamówieniem klienta
2. **SZYBKO** zmień ilość (zanim załadują się dane zamówień)
3. Zapisz zadanie
4. **Sprawdź czy powiązanie z zamówieniem nadal istnieje** ✅

## 🎯 Wpływ

- **Zatrzymano utratę danych**: Powiązania z zamówieniami klientów nie będą już usuwane przypadkowo
- **Poprawiono stabilność**: Eliminacja warunków wyścigowych przy ładowaniu danych
- **Lepszy debugging**: Dodano logi ostrzegawcze dla nieoczekiwanych operacji

## 📅 Data implementacji

17 listopada 2025

## 🔗 Powiązane pliki

- `src/components/production/TaskForm.js` - główny plik z poprawkami
- `src/services/productionService.js` - funkcja `updateTask` (bez zmian)
- `src/services/orderService.js` - funkcje zarządzania powiązaniami (bez zmian)

