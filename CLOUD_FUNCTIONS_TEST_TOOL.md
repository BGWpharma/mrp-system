# 🧪 Narzędzie testowe Cloud Functions

## Data: 25 listopada 2025

---

## 📋 Przegląd

Utworzono kompleksowe narzędzie testowe dla Cloud Functions w **Narzędziach Systemowych** (Admin → Zarządzanie systemem).

### Usunięto:
- ❌ `getRandomBatch` - funkcja testowa (już niepotrzebna)

### Dodano:
- ✅ **Test łańcucha aktualizacji PO → Batch → MO → CO**
- ✅ Weryfikacja statusu Cloud Functions
- ✅ Analiza przykładowych danych
- ✅ Rekomendacje i następne kroki

---

## 🎯 Co testuje narzędzie?

### 1. Status Cloud Functions
- Sprawdza czy kolekcja `_systemEvents` istnieje
- Analizuje ostatnie 10 eventów
- Wykrywa czy funkcje są aktywne

### 2. Kompletność łańcucha danych
Szuka kompletnego łańcucha:
```
Purchase Order
    ↓
Inventory Batch (powiązana z PO)
    ↓
Manufacturing Order (używa partii)
    ↓
Customer Order (powiązane z zadaniem)
```

### 3. Potwierdzenie działania Cloud Functions
- Sprawdza pole `lastPriceUpdateReason` w partiach
- Sprawdza pole `lastCostUpdateReason` w zadaniach
- Sprawdza pole `lastCostUpdateReason` w zamówieniach
- Weryfikuje czy zawierają tekst "Cloud Function"

---

## 🚀 Jak używać?

### Krok 1: Otwórz narzędzie
1. Zaloguj się jako administrator
2. Idź do: **Admin** → **Zarządzanie systemem**
3. Przewiń do sekcji: **⚡ Cloud Functions - Test łańcucha aktualizacji**

### Krok 2: Uruchom test
Kliknij przycisk: **"Testuj Cloud Functions"**

### Krok 3: Przeanalizuj wyniki

---

## 📊 Interpretacja wyników

### Status Cloud Functions:

#### ✅ Potwierdzone - Działają
```
Status: confirmed
```
**Oznacza:** Cloud Functions są wdrożone i aktywnie aktualizują dane.
**Dowód:** Wykryto aktualizacje z polem `lastPriceUpdateReason: "...Cloud Function..."`

#### ℹ️ Aktywne (eventy wykryte)
```
Status: active
```
**Oznacza:** Są eventy w `_systemEvents`, ale nie wykryto jeszcze aktualizacji przez CF.
**Możliwe przyczyny:**
- Funkcje dopiero wdrożone
- Nie było jeszcze żadnych zmian w PO
- Dane testowe są stare

#### ⚠️ Brak eventów
```
Status: no_events
```
**Oznacza:** Brak kolekcji `_systemEvents` lub jest pusta.
**Możliwe przyczyny:**
- Cloud Functions nie są wdrożone
- Funkcje mają błędy
- Nie było żadnych aktualizacji PO od czasu deployment

---

### Łańcuch danych:

#### ✅ Kompletny łańcuch (4/4)
```
PO ✅ → Batch ✅ → MO ✅ → CO ✅
```
**Idealny scenariusz testowy!**

Rekomendacja:
```
✅ Znaleziono kompletny łańcuch PO → Batch → MO → CO!
💡 Możesz teraz przetestować: Edytuj PO (zmień cenę), 
   zapisz i sprawdź czy wartości aktualizują się automatycznie.
```

#### ⚠️ Niekompletny łańcuch (1-3/4)

**Przykład 1: PO ✅, Batch ❌**
```
Znaleziono PO, ale nie ma powiązanych partii.
Utwórz przyjęcie magazynowe.
```

**Przykład 2: PO ✅, Batch ✅, MO ❌**
```
Znaleziono partię, ale nie jest używana w żadnym zadaniu.
Zarezerwuj partię w zadaniu produkcyjnym.
```

**Przykład 3: PO ✅, Batch ✅, MO ✅, CO ❌**
```
Znaleziono zadanie, ale nie jest powiązane z zamówieniem.
Utwórz zamówienie klienta z tym zadaniem.
```

---

### Eventy systemowe:

Tabela pokazuje ostatnie 10 eventów z kolekcji `_systemEvents`:

| Typ | Przetworzony | Data |
|-----|--------------|------|
| batchPriceUpdate | ✅ Tak | 25.11.2025, 14:30 |
| taskCostUpdate | ✅ Tak | 25.11.2025, 14:31 |
| batchPriceUpdate | ⏳ Nie | 25.11.2025, 14:35 |

**Kolumny:**
- **Typ:** Rodzaj eventu (`batchPriceUpdate`, `taskCostUpdate`)
- **Przetworzony:** Czy event został przetworzony przez Cloud Function
- **Data:** Kiedy event został utworzony

**⏳ Nie przetworzony?**
- Może oznaczać problem z Cloud Function
- Lub event jest bardzo świeży (< 1 min)

---

## 🧪 Scenariusz testowy E2E

### Przygotowanie:

1. **Uruchom test** i sprawdź wyniki
2. Jeśli status = **"Potwierdzone"** → przejdź dalej
3. Jeśli status = **"Brak eventów"** → Wdroż Cloud Functions:
   ```powershell
   .\deploy-functions.ps1
   ```

### Test właściwy:

#### 1. Znajdź testowe PO
Z wyników testu skopiuj:
- PO Number (np. "PO-2025-001")
- ID (np. "abc123...")

#### 2. Edytuj PO
1. Idź do: **Zakupy** → **Zamówienia zakupowe**
2. Znajdź i otwórz testowe PO
3. **Zmień cenę jednostkową** jednej pozycji (np. z 10.00€ na 10.50€)
4. **Zapisz** zamówienie

#### 3. Monitoruj Cloud Functions
Otwórz terminal:
```bash
firebase functions:log --follow
```

**Oczekiwane logi (w ciągu 5-15s):**
```
[onPurchaseOrderUpdate] PO Update detected {orderId: "abc123"}
[onPurchaseOrderUpdate] Found 3 batches to update
[onPurchaseOrderUpdate] ✅ Updated 3 batches

[onBatchPriceUpdate] 🔄 Batch price update event detected
[onBatchPriceUpdate] 📊 Found 2 tasks to update
[onBatchPriceUpdate] ✅ Updated 2 tasks

[onProductionTaskCostUpdate] 🔄 Task cost update event detected
[onProductionTaskCostUpdate] ✅ Updated 1 customer orders
```

#### 4. Sprawdź aktualizacje w aplikacji

**A. Partie (Inventory Batches):**
1. Idź do: **Magazyn** → **Partie**
2. Znajdź partię z testowego PO
3. Sprawdź czy **cena jednostkowa** się zmieniła
4. Sprawdź pole **"Ostatnia aktualizacja"** → powinno zawierać "Cloud Function"

**B. Zadanie (Manufacturing Order):**
1. Idź do: **Produkcja** → **Zadania**
2. Znajdź testowe zadanie (MO)
3. Sprawdź **"Koszt materiałów"**
4. Sprawdź czy zakładka "Historia zmian" pokazuje aktualizację

**C. Zamówienie (Customer Order):**
1. Idź do: **Sprzedaż** → **Zamówienia**
2. Znajdź testowe zamówienie (CO)
3. Sprawdź **"Całkowita wartość"**
4. Sprawdź koszty produkcji w pozycjach

#### 5. Uruchom test ponownie
W **Narzędziach Systemowych** kliknij ponownie **"Testuj Cloud Functions"**

**Powinno pokazać:**
- Status: ✅ Potwierdzone - Działają
- Nowe eventy w tabeli
- Aktualizacje dat w łańcuchu danych

---

## 🐛 Troubleshooting

### Problem: Status "Brak eventów"

**Diagnoza:**
```bash
firebase functions:list
```

**Jeśli funkcje nie są na liście:**
```powershell
.\deploy-functions.ps1
```
Wybierz opcję **5** (wszystkie triggery)

---

### Problem: Eventy są, ale `processed: false`

**Możliwe przyczyny:**
1. Cloud Function ma błąd
2. Timeout (funkcja działa > 60s)
3. Brak uprawnień

**Sprawdź logi:**
```bash
firebase functions:log --only onBatchPriceUpdate
```

**Szukaj błędów:**
```
❌ Error updating tasks from batch price update
```

---

### Problem: "Brak testowego PO"

**Rozwiązanie:**
1. Utwórz Purchase Order
2. Dodaj pozycje z cenami
3. Zmień status na "Zatwierdzone"
4. Utwórz przyjęcie magazynowe (Inventory Batch)
5. Uruchom test ponownie

---

### Problem: Łańcuch niekompletny (PO i Batch, brak MO)

**Rozwiązanie:**
1. Utwórz zadanie produkcyjne
2. Zarezerwuj partię w zadaniu
3. Uruchom test ponownie

---

### Problem: Dane się nie aktualizują

**Sprawdź w przeglądarce (Console F12):**

Szukaj komunikatów:
```javascript
ℹ️ [PO_UPDATE_DEBUG] Aktualizacja cen partii będzie wykonana przez Cloud Function
```

**Jeśli widzisz:**
```javascript
🔄 [PO_UPDATE_DEBUG] Rozpoczynam automatyczną aktualizację cen partii...
```

**To oznacza:** Stara logika klienta jest nadal aktywna!

**Rozwiązanie:** Sprawdź czy kod został zakomentowany (CLOUD_FUNCTIONS_MIGRATION_COMPLETED.md)

---

## 📈 Metryki testowe

Po uruchomieniu testu sprawdź:

### Czas wykonania łańcucha:
```
Edycja PO → CO zaktualizowane
```
**Oczekiwany czas:** < 15 sekund

### Poprawność aktualizacji:
- ✅ Wszystkie partie zaktualizowane
- ✅ Wszystkie zadania zaktualizowane
- ✅ Wszystkie zamówienia zaktualizowane

### Error rate:
```bash
firebase functions:log | grep "❌"
```
**Oczekiwany:** 0 błędów

---

## 📚 Dokumentacja powiązana

- **CLOUD_FUNCTIONS_CHAIN_UPDATE.md** - Pełna dokumentacja Cloud Functions
- **CLOUD_FUNCTIONS_MIGRATION_COMPLETED.md** - Szczegóły migracji
- **DEPLOYMENT_QUICK_START.md** - Quick start guide
- **functions/README.md** - Dokumentacja funkcji

---

## 🔗 Linki

### Firebase Console:
https://console.firebase.google.com/project/bgw-mrp-system/functions

### Firestore (sprawdź _systemEvents):
https://console.firebase.google.com/project/bgw-mrp-system/firestore/data

### Logi w czasie rzeczywistym:
```bash
firebase functions:log --follow
```

---

## ✨ Podsumowanie

**Narzędzie testowe Cloud Functions** to kompletny system diagnostyczny, który:
- ✅ Sprawdza status wdrożenia
- ✅ Weryfikuje kompletność danych testowych
- ✅ Potwierdza działanie funkcji
- ✅ Daje konkretne rekomendacje
- ✅ Ułatwia debugowanie

**Zalecane użycie:**
- Po każdym deployment Cloud Functions
- Przed testami E2E
- Przy zgłoszeniach problemów z aktualizacjami
- Jako część checklisty produkcyjnej

---

**Autor:** Claude (Cursor AI)  
**Data:** 25 listopada 2025  
**Wersja:** 1.0.0

