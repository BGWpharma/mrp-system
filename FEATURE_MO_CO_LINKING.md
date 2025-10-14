# Funkcja zmiany powiązania MO z CO

## Opis funkcjonalności

Dodano możliwość edycji powiązania Manufacturing Order (MO) z Customer Order (CO) oraz wyboru pozycji z zamówienia, do której przypisane jest zadanie produkcyjne.

## Główne zmiany

### 1. Nowe pola w formularzu edycji MO (`TaskForm.js`)

W trybie edycji zadania produkcyjnego (nie podczas tworzenia nowego) dodano sekcję **"Powiązanie z zamówieniem klienta (CO)"** z następującymi polami:

- **Autocomplete "Zamówienie klienta"**: 
  - Wyświetla listę aktywnych zamówień klientów (nie anulowane/zrealizowane)
  - Pokazuje: numer CO, nazwę klienta, status i liczbę pozycji
  - Informuje o aktualnym powiązaniu i zmianach

- **Select "Pozycja z zamówienia"**:
  - Dostępny po wyborze zamówienia
  - Pokazuje wszystkie pozycje z wybranego CO
  - Informuje jeśli pozycja jest już powiązana z innym MO
  - Wyświetla ilość i jednostkę

### 2. Nowe stany i dane

```javascript
// Nowe stany
const [customerOrders, setCustomerOrders] = useState([]);
const [selectedCustomerOrder, setSelectedCustomerOrder] = useState(null);
const [selectedOrderItemId, setSelectedOrderItemId] = useState('');
const [originalOrderId, setOriginalOrderId] = useState(null);

// Rozszerzony dataLoaded
customerOrders: false
```

### 3. Nowa funkcja `updateOrderProductionTaskLink()`

Automatycznie aktualizuje powiązania w obu zamówieniach:

**Krok 1 - Usunięcie ze starego CO (jeśli istnieje):**
- Usuwa `productionTaskId`, `productionTaskNumber`, `productionStatus` z pozycji
- Usuwa zadanie z tablicy `productionTasks`

**Krok 2 - Dodanie do nowego CO:**
- Dodaje `productionTaskId`, `productionTaskNumber`, `productionStatus` do wybranej pozycji
- Dodaje zadanie do tablicy `productionTasks`

### 4. Rozszerzona logika w `handleSubmit()`

```javascript
// Wykrywanie zmian
const newOrderId = selectedCustomerOrder?.id || null;
const orderLinkChanged = originalOrderId !== newOrderId || 
                         (newOrderId && taskData.orderItemId !== selectedOrderItemId);

// Aktualizacja powiązań
if (orderLinkChanged) {
  await updateOrderProductionTaskLink(taskId, originalOrderId, newOrderId, selectedOrderItemId);
  await updateTask(taskId, orderUpdateData, currentUser.uid);
}
```

## Przypadki użycia

### Scenariusz 1: Przeniesienie MO do innego CO

**Sytuacja:** MO jest powiązane z CO-001, ale powinno być powiązane z CO-002

**Kroki:**
1. Otwórz edycję MO
2. W sekcji "Powiązanie z zamówieniem klienta" wybierz CO-002
3. Wybierz właściwą pozycję z CO-002
4. Zapisz

**Rezultat:**
- MO zostanie usunięte z CO-001 (pozycja traci `productionTaskId`)
- MO zostanie dodane do CO-002 (wybrana pozycja otrzymuje `productionTaskId`)
- Pola `orderId`, `orderNumber`, `orderItemId` w MO zostają zaktualizowane

### Scenariusz 2: Osierocone MO

**Sytuacja:** MO nie ma powiązania z żadnym CO lub CO zostało usunięte

**Kroki:**
1. Otwórz edycję MO
2. Wybierz odpowiednie CO
3. Wybierz pozycję z CO
4. Zapisz

**Rezultat:**
- MO zostaje powiązane z wybraną pozycją w CO
- Klient z CO zostaje przypisany do MO

### Scenariusz 3: Usunięcie powiązania

**Sytuacja:** Chcesz odłączyć MO od CO

**Kroki:**
1. Otwórz edycję MO
2. W Autocomplete usuń wybrane zamówienie (wyczyść pole)
3. Zapisz

**Rezultat:**
- MO zostaje odłączone od CO
- Pozycja w CO traci `productionTaskId`

## Funkcje pomocnicze

### `fetchCustomerOrders()`
- Pobiera wszystkie zamówienia klientów
- Filtruje tylko aktywne (nie anulowane/zrealizowane)
- Wykorzystuje cache w `dataLoaded.customerOrders`

### `useEffect` - automatyczne ustawienie `selectedCustomerOrder`
- Po załadowaniu danych automatycznie ustawia wybrane zamówienie
- Działa przy edycji istniejącego MO z powiązaniem

## Walidacja i bezpieczeństwo

✅ **Sprawdzanie zmian**: System porównuje `originalOrderId` z nowym ID i wykrywa zmiany

✅ **Transakcje**: Wszystkie operacje są wykonywane sekwencyjnie z obsługą błędów

✅ **Informacje dla użytkownika**:
- Alert pokazuje aktualny wybór
- Helper text informuje o zmianach
- Ostrzeżenia przy przenoszeniu między CO

✅ **Obsługa błędów**:
- Błędy usunięcia ze starego CO nie przerywają procesu (non-critical)
- Błędy dodania do nowego CO przerywają i wyświetlają komunikat
- Komunikaty success/warning informują o wyniku operacji

## Struktura danych

### W zadaniu produkcyjnym (Production Task):
```javascript
{
  orderId: "order_id_123",
  orderNumber: "CO-2024-001",
  orderItemId: "item_xyz",
  customer: {
    id: "customer_abc",
    name: "Firma XYZ"
  }
}
```

### W zamówieniu klienta (Customer Order):
```javascript
{
  items: [
    {
      id: "item_xyz",
      name: "Produkt ABC",
      quantity: 100,
      unit: "szt.",
      productionTaskId: "task_123",        // ← Dodawane przez funkcję
      productionTaskNumber: "MO-2024-045", // ← Dodawane przez funkcję
      productionStatus: "W trakcie"        // ← Dodawane przez funkcję
    }
  ],
  productionTasks: [
    {
      id: "task_123",
      moNumber: "MO-2024-045",
      status: "W trakcie"
    }
  ]
}
```

## Logi i debugging

Funkcja loguje wszystkie kluczowe operacje:

```javascript
console.log('🔗 Aktualizacja powiązania MO z CO:', { ... });
console.log('🔄 Wykryto zmianę powiązania z CO');
console.log(`Usunięto powiązanie MO ${taskId} z pozycji "${item.name}" w CO ${oldOrder.orderNumber}`);
console.log(`✅ Usunięto powiązanie z CO ${oldOrder.orderNumber}`);
console.log(`✅ Dodano powiązanie z CO ${newOrder.orderNumber}, pozycja: ${item.name}`);
```

## Testowanie

### Test 1: Przeniesienie MO między zamówieniami
1. Utwórz MO powiązane z CO-001
2. Utwórz CO-002 z pozycją pasującą do produktu
3. Edytuj MO i zmień powiązanie na CO-002
4. Sprawdź że CO-001 nie ma już `productionTaskId` w pozycji
5. Sprawdź że CO-002 ma `productionTaskId` w wybranej pozycji

### Test 2: Osierocone MO
1. Utwórz MO bez powiązania z CO (ręcznie przez formularz nowego zadania)
2. Edytuj MO i dodaj powiązanie z CO
3. Sprawdź że pozycja w CO otrzymała `productionTaskId`

### Test 3: Pozycja już powiązana
1. Utwórz CO z 2 pozycjami
2. Utwórz MO-001 powiązane z pozycją 1
3. Utwórz MO-002 i spróbuj powiązać z pozycją 1
4. System powinien pokazać ostrzeżenie, ale pozwolić na zmianę

## Pliki zmienione

- `src/components/production/TaskForm.js` - główne zmiany
- `src/services/orderService.js` - wykorzystane funkcje: `getAllOrders`, `getOrderById`, `updateOrder`

## Import używanych funkcji

```javascript
import { getAllOrders, getOrderById, updateOrder } from '../../services/orderService';
import { getTaskById } from '../../services/productionService';
```

## Limitacje i uwagi

⚠️ **Funkcja dostępna tylko w trybie edycji** - nie można ustawiać powiązania podczas tworzenia nowego MO (to pozostaje w `CreateFromOrderPage`)

⚠️ **Jedna pozycja może mieć wiele MO** - system nie blokuje przypisania wielu MO do jednej pozycji, tylko informuje

⚠️ **Cache zamówień** - zamówienia klientów są cache'owane podobnie jak inne dane w formularzu (5 minut)

## Przyszłe usprawnienia

- [ ] Dodać walidację zgodności produktu (sprawdzanie czy nazwa produktu w MO pasuje do pozycji w CO)
- [ ] Dodać walidację zgodności ilości
- [ ] Dodać możliwość usunięcia powiązania z przyciskiem "Usuń powiązanie"
- [ ] Dodać historię zmian powiązań w zakładce "Historia zmian"
- [ ] Dodać filtrowanie CO po nazwie klienta lub numerze zamówienia

