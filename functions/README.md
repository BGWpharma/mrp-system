# Cloud Functions dla BGW-MRP System

## 📋 Przegląd

Cloud Functions dla systemu BGW-MRP działają w regionie `europe-central2` i używają Firebase Functions v2 (2nd Generation) z Node.js 22.

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

### ⚠️ WAŻNE: ZAWSZE deployuj pojedyncze funkcje!

```bash
# ✅ POPRAWNIE - Deploy konkretnej funkcji
firebase deploy --only functions:getRandomBatch

# ❌ NIGDY TAK NIE RÓB - Nadpisze wszystkie funkcje!
firebase deploy --only functions
```

### Przykłady deployment:

```bash
# Deploy funkcji getRandomBatch
firebase deploy --only functions:getRandomBatch

# Deploy wielu konkretnych funkcji
firebase deploy --only functions:getRandomBatch,functions:calculateBatchCosts

# Sprawdź logi funkcji
npm run logs
```

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

