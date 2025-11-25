# Cloud Functions dla BGW-MRP System

## 📋 Przegląd

Cloud Functions dla systemu BGW-MRP działają w regionie `europe-central2` i używają Firebase Functions v2 (2nd Generation) z Node.js 22.

### Zaimplementowane funkcje:

#### 1. Callable Functions
- **getRandomBatch** - ~~Funkcja testowa~~ (PRZESTARZAŁA - zastąpiona narzędziem testowym w UI)

#### 2. Firestore Triggers - Automatyczna aktualizacja łańcucha wartości ⭐
- **onPurchaseOrderUpdate** - PO → Batch (aktualizacja cen partii)
- **onBatchPriceUpdate** - Batch → MO (aktualizacja kosztów zadań) 🔥 **ULEPSZONA × 2**
- **onProductionTaskCostUpdate** - MO → CO (aktualizacja wartości zamówień) 🔥 **ULEPSZONA**

**Kompleksowa kalkulacja kosztów zadań (100% zgodność z frontendem):** ✨
- ✅ Consumed materials (skonsumowane materiały) - **aktualna cena z bazy jako priorytet** 🆕
- ✅ Reserved batches (zarezerwowane partie)  
- ✅ PO reservations (rezerwacje z zamówień zakupowych)
- ✅ Processing cost (koszt procesowy)
- ✅ Średnia ważona cena z wszystkich źródeł
- ✅ Tolerancja zmian (0.005€) - sprawdza 4 wartości
- ✅ **Precyzyjne obliczenia** - eliminacja błędów floating point
- ✅ **Identyczna logika** jak frontend

**Pełna kalkulacja totalValue zamówień klientów:** ✨
- ✅ Wartość produktów (productsValue)
- ✅ Koszt dostawy (shippingCost) 🆕
- ✅ Dodatkowe koszty (additionalCostsTotal) 🆕
- ✅ Rabaty (discountsTotal) 🆕
- ✅ **Zgodność lista CO = szczegóły CO** 🆕

#### 3. Narzędzia testowe w UI 🧪
Zamiast wywołań funkcji testowych, system posiada **kompleksowe narzędzie testowe** w:
- **Admin** → **Zarządzanie systemem** → **Test Cloud Functions**

📖 **Dokumentacja:**
- `CLOUD_FUNCTIONS_CHAIN_UPDATE.md` - Pełna dokumentacja techniczna
- `CLOUD_FUNCTIONS_ENHANCED_COST_CALCULATION.md` - Ulepszona kalkulacja kosztów
- `CLOUD_FUNCTIONS_PRECISION_FIX.md` - Poprawka precyzji floating point (25.11.2024)
- `CLOUD_FUNCTIONS_PRICE_HIERARCHY_FIX.md` - Poprawka hierarchii cen (25.11.2024) 🆕
- `CLOUD_FUNCTIONS_TOTALVALUE_FIX.md` - Poprawka totalValue w CO (25.11.2024) ⭐ NAJNOWSZE
- `CLOUD_FUNCTIONS_TEST_TOOL.md` - Przewodnik po narzędziu testowym
- `CLOUD_FUNCTIONS_MIGRATION_COMPLETED.md` - Szczegóły migracji

## 🔧 Konfiguracja

- **Region**: `europe-central2`
- **Node.js**: 22
- **Firebase Functions**: v2 (2nd Gen)
- **Projekt Firebase**: `bgw-mrp-system`
- **Max instances**: 10
- **Domyślna pamięć**: 256MiB

## 📁 Struktura

```
functions/
├── index.js           # Główny plik z definicjami funkcji
├── package.json       # Zależności i skrypty
├── .eslintrc.js       # Konfiguracja ESLint (Google style)
├── .gitignore         # Ignorowane pliki
└── README.md          # Ta dokumentacja
```

## 🚀 Deployment

### ⚠️ WAŻNE: ZAWSZE używaj prefixu codebase `bgw-mrp:`!

```bash
# ✅ POPRAWNIE - Deploy konkretnej funkcji z prefiksem codebase
firebase deploy --only functions:bgw-mrp:onBatchPriceUpdate

# ❌ NIGDY TAK NIE RÓB - Może nadpisać funkcje z innych projektów!
firebase deploy --only functions
firebase deploy --only functions:onBatchPriceUpdate  # BEZ prefixu bgw-mrp:
```

**Dlaczego prefix `bgw-mrp:` jest wymagany?**
Projekt ma wiele codebase (np. `bgw-mrp`, `customer-portal`). Deploy bez prefixu może nadpisać funkcje z innych codebase!

### Przykłady deployment:

```bash
# Deploy funkcji getRandomBatch
firebase deploy --only functions:bgw-mrp:getRandomBatch

# Deploy funkcji automatycznej aktualizacji
firebase deploy --only functions:bgw-mrp:onPurchaseOrderUpdate
firebase deploy --only functions:bgw-mrp:onBatchPriceUpdate
firebase deploy --only functions:bgw-mrp:onProductionTaskCostUpdate

# Deploy wielu funkcji naraz
firebase deploy --only functions:bgw-mrp:onPurchaseOrderUpdate,bgw-mrp:onBatchPriceUpdate,bgw-mrp:onProductionTaskCostUpdate

# Sprawdź logi funkcji
npm run logs
```

### Deployment za pomocą skryptów (zalecane):

```powershell
# Windows PowerShell
.\deploy-functions.ps1
```

```bash
# Linux/Mac
chmod +x deploy-functions.sh
./deploy-functions.sh
```

Skrypty oferują:
- ✅ Automatyczną weryfikację kodu (linting)
- ✅ Interaktywny wybór funkcji do deployment
- ✅ Potwierdzenia przed deployment krytycznych funkcji
- ✅ Kolorowe logowanie postępu

## 🧪 Development

### Instalacja zależności

```bash
cd functions
npm install
```

### Uruchomienie emulatora lokalnie

```bash
npm run serve
# lub
firebase emulators:start --only functions
```

### Linting

```bash
npm run lint

# Auto-fix
npm run lint -- --fix
```

## 📝 Implementowane funkcje

### 1. getRandomBatch (Callable Function)

**Status**: ✅ Zaimplementowana

Zwraca losową partię z magazynu wraz z nazwą materiału.

**Wywołanie z aplikacji**:
```javascript
import { getRandomBatch } from '../../services/cloudFunctionsService';

const result = await getRandomBatch();
// result.batch - dane partii
// result.batch.materialName - nazwa materiału
```

**Wykorzystanie**: Narzędzia systemowe (Admin > Zarządzanie systemem)

### 2. Przyszłe funkcje (Do implementacji)

Z pamięci 8098927 - automatyczne aktualizacje łańcucha wartości:

- `onPurchaseOrderUpdate` - Aktualizuje ceny partii na podstawie zmian w PO
- `onBatchPriceUpdate` - Aktualizuje koszty MO na podstawie zmian w partiach
- `onProductionTaskCostUpdate` - Aktualizuje wartości CO na podstawie zmian w zadaniach

## 🔗 Integracja z aplikacją

### Frontend (React)

W aplikacji używamy serwisu `cloudFunctionsService.js`:

```javascript
// src/services/cloudFunctionsService.js
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '../firebase';

const functions = getFunctions(app, 'europe-central2');

export const getRandomBatch = async () => {
  const getRandomBatchFn = httpsCallable(functions, 'getRandomBatch');
  const result = await getRandomBatchFn();
  return result.data;
};
```

### Wymagania

- Użytkownik musi być zalogowany (weryfikacja `request.auth`)
- Region musi być ustawiony na `europe-central2`
- Funkcje są callable (wywoływane przez HTTPS)

## 📊 Monitoring i Logi

### Sprawdzanie logów

```bash
# Logi wszystkich funkcji
firebase functions:log

# Logi konkretnej funkcji
firebase functions:log --only getRandomBatch

# Live logi
firebase functions:log --only getRandomBatch --follow
```

### W konsoli Firebase

1. Przejdź do [Firebase Console](https://console.firebase.google.com)
2. Wybierz projekt `bgw-mrp-system`
3. Functions > Logs

## 🔒 Bezpieczeństwo

- Wszystkie funkcje wymagają uwierzytelnienia (`request.auth`)
- Funkcje callable automatycznie weryfikują token Firebase Auth
- Firestore triggers działają z pełnymi uprawnieniami Admin SDK
- Walidacja danych wejściowych w każdej funkcji

## 📚 Dokumentacja

- [Firebase Functions v2 Docs](https://firebase.google.com/docs/functions)
- [Callable Functions](https://firebase.google.com/docs/functions/callable)
- [Firestore Triggers](https://firebase.google.com/docs/functions/firestore-events)
- [Scheduled Functions](https://firebase.google.com/docs/functions/schedule-functions)

## 🐛 Troubleshooting

### Problem: Funkcja nie deployuje się

```bash
# Sprawdź linting
npm run lint

# Sprawdź czy jesteś zalogowany
firebase login

# Sprawdź projekt
firebase use
```

### Problem: Region nie działa

Upewnij się że używasz regionu w kodzie:
```javascript
const functions = getFunctions(app, 'europe-central2');
```

### Problem: Błąd uprawnień

Sprawdź czy użytkownik jest zalogowany:
```javascript
if (!request.auth) {
  throw new Error("Unauthorized");
}
```

## 📞 Wsparcie

W razie problemów sprawdź:
1. Logi funkcji: `firebase functions:log`
2. Konsola Firebase: https://console.firebase.google.com
3. Konsola przeglądarki (F12) dla błędów frontend

---

**Data utworzenia**: 24 listopada 2025  
**Wersja**: 1.0.0



