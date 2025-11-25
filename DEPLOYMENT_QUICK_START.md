# 🚀 Quick Start - Deployment Cloud Functions

## Automatyczna aktualizacja łańcucha wartości: PO → Batch → MO → CO

---

## ⚡ Szybki Start

### 1. Uruchom skrypt deployment

**Windows (PowerShell):**
```powershell
.\deploy-functions.ps1
```

**Linux/Mac:**
```bash
chmod +x deploy-functions.sh
./deploy-functions.sh
```

### 2. Wybierz opcję z menu

```
Dostępne funkcje:
  1. getRandomBatch                 (funkcja testowa)
  2. onPurchaseOrderUpdate          (PO → Batch)
  3. onBatchPriceUpdate             (Batch → MO)
  4. onProductionTaskCostUpdate     (MO → CO)
  
  5. Wszystkie nowe triggery        (2 + 3 + 4) ⭐ ZALECANE
  6. Wszystkie funkcje              (1 + 2 + 3 + 4)
```

### 3. Potwierdź deployment

Skrypt poprosi o potwierdzenie przed deployment funkcji produkcyjnych.

---

## 📋 Zalecany Plan Wdrożenia

### Faza 1: Testowanie (tydzień 1-2)

```powershell
# Wybierz opcję: 2
# Deploy tylko: onPurchaseOrderUpdate
```

**Co sprawdzić:**
- ✅ Czy ceny partii aktualizują się po zmianie PO?
- ✅ Czy dodatkowe koszty są proporcjonalnie rozdzielane?
- ✅ Czy logi nie pokazują błędów?

```bash
# Monitorowanie
firebase functions:log --only onPurchaseOrderUpdate --follow
```

---

### Faza 2: Łańcuch częściowy (tydzień 3-4)

```powershell
# Wybierz opcję: 3
# Deploy: onBatchPriceUpdate
```

**Co sprawdzić:**
- ✅ Czy koszty zadań aktualizują się po zmianie cen partii?
- ✅ Czy uwzględniona jest flaga `includeInCosts`?
- ✅ Czy `disableAutomaticCostUpdates` działa?

---

### Faza 3: Pełny łańcuch (tydzień 5+)

```powershell
# Wybierz opcję: 4
# Deploy: onProductionTaskCostUpdate
```

**Co sprawdzić:**
- ✅ Czy wartości zamówień aktualizują się po zmianie kosztów zadań?
- ✅ Czy logika listy cenowej (`fromPriceList`) jest respektowana?
- ✅ Czy cały łańcuch działa płynnie?

---

## 🔍 Monitorowanie

### Logi w czasie rzeczywistym

```bash
# Wszystkie funkcje
firebase functions:log --follow

# Konkretna funkcja
firebase functions:log --only onPurchaseOrderUpdate --follow
```

### Konsola Firebase

👉 https://console.firebase.google.com/project/bgw-mrp-system/functions

### Sprawdź eventy systemowe

```javascript
// W Firestore Console
Kolekcja: _systemEvents
Filtr: processed == false (jeśli są nieprzetworzone, może być problem)
```

---

## 📊 Co się zmienia po deployment?

### Przed (logika w frontend):
```
User zmienia PO
    ↓
Frontend aktualizuje Batches
    ↓
Frontend aktualizuje Tasks
    ↓
Frontend aktualizuje Orders
```

### Po (logika w Cloud Functions):
```
User zmienia PO
    ↓
[Cloud Function] onPurchaseOrderUpdate → aktualizuje Batches
    ↓
[Cloud Function] onBatchPriceUpdate → aktualizuje Tasks
    ↓
[Cloud Function] onProductionTaskCostUpdate → aktualizuje Orders
```

**Zalety:**
- ✅ Automatyczne (działa nawet gdy user zamknie przeglądarkę)
- ✅ Niezawodne (retry przy błędach)
- ✅ Szybsze (wykonywane na serwerze)
- ✅ Audytowalne (centralne logowanie)

---

## ❓ FAQ

### Czy muszę wyłączyć logikę w frontend?

**Nie od razu.** Zalecamy:
1. Deploy Cloud Functions
2. Monitorowanie przez 2-4 tygodnie
3. Upewnienie się, że wszystko działa
4. Stopniowe wyłączanie logiki frontend

### Co jeśli coś pójdzie nie tak?

```bash
# Usuń deployment funkcji (kod pozostaje w repo)
firebase functions:delete onPurchaseOrderUpdate
firebase functions:delete onBatchPriceUpdate
firebase functions:delete onProductionTaskCostUpdate
```

System automatycznie wróci do używania logiki frontend.

### Czy funkcje zużywają dużo zasobów Firebase?

**Nie.** Szacowane koszty dla 100 aktualizacji PO/dzień:
- **Invocations:** ~300/dzień
- **Koszt miesięczny:** $0 - $1 (free tier wystarczy)

### Jak wyłączyć automatyczne aktualizacje dla konkretnego zadania?

```javascript
// W zadaniu ustaw:
disableAutomaticCostUpdates: true
```

---

## 📚 Pełna dokumentacja

- **CLOUD_FUNCTIONS_CHAIN_UPDATE.md** - Szczegółowa dokumentacja architektury
- **functions/README.md** - Dokumentacja techniczna Cloud Functions
- **functions/index.js** - Kod źródłowy funkcji

---

## 🆘 Pomoc

### Problem: Skrypt deployment nie działa

**Sprawdź:**
```bash
# Czy Firebase CLI jest zainstalowany?
firebase --version

# Czy jesteś zalogowany?
firebase login

# Czy wybrany jest poprawny projekt?
firebase use bgw-mrp-system
```

### Problem: Funkcje nie aktualizują danych

**Sprawdź logi:**
```bash
firebase functions:log
```

Szukaj:
- ❌ Błędy (czerwone)
- ⚠️ Ostrzeżenia (żółte)
- `processed: false` w `_systemEvents` (nieprzetworzone eventy)

### Dalsze pytania?

1. Sprawdź logi: `firebase functions:log`
2. Zobacz dokumentację: `CLOUD_FUNCTIONS_CHAIN_UPDATE.md`
3. Konsola Firebase: https://console.firebase.google.com/

---

**Gotowy do deployment? Uruchom:**

```powershell
.\deploy-functions.ps1
```

lub

```bash
./deploy-functions.sh
```

🚀 **Powodzenia!**

