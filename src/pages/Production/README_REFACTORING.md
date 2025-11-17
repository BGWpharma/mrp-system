# 🚀 Quick Start - Zrefaktoryzowany TaskDetailsPage

## ✅ Co zostało zrobione?

Zrefaktoryzowano `TaskDetailsPage.js` (9350 linii → 500 linii) poprzez:

### 1. **Custom Hooki** 🎣
```javascript
import {
  useTaskData,         // Real-time sync, ładowanie danych
  useTaskMaterials,    // Materiały, rezerwacje, konsumpcja
  useProductionHistory,// Historia produkcji
  useTaskCosts,        // Obliczenia kosztów z cache
  useTaskDialogs       // Zarządzanie dialogami
} from '../../hooks/production';
```

### 2. **Komponenty współdzielone** 🧩
```javascript
import {
  StatusChip,
  MaterialReservationBadge,
  CostSummaryCard
} from '../../components/production/shared';
```

### 3. **Nowa struktura plików** 📁
```
src/
├── hooks/production/          ✅ 5 hooków + index.js
├── components/production/
│   ├── shared/                ✅ 3 komponenty + index.js
│   └── dialogs/               ⚠️ Placeholder (do implementacji)
└── pages/Production/
    ├── TaskDetailsPage.js             🔴 Oryginał
    └── TaskDetailsPageRefactored.js   ✅ Nowa wersja
```

---

## 🎯 Jak używać nowej wersji?

### Opcja 1: Testowanie równoległe
1. Dodaj route w routerze:
```javascript
<Route path="/production/:id/refactored" element={<TaskDetailsPageRefactored />} />
```

2. Przetestuj nową wersję na `/production/:id/refactored`

3. Porównaj funkcjonalności z oryginalną wersją

### Opcja 2: Podmiana bezpośrednia
1. Utwórz backup: `cp TaskDetailsPage.js TaskDetailsPage.js.backup`

2. Zastąp zawartość `TaskDetailsPage.js` zawartością z `TaskDetailsPageRefactored.js`

3. Testuj dokładnie wszystkie funkcjonalności

---

## 📊 Przykład użycia hooków

```javascript
const TaskDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  // ✅ Hook 1: Dane zadania z real-time sync
  const { task, loading, refreshTask } = useTaskData(id, navigate);
  
  // ✅ Hook 2: Materiały
  const { 
    materials, 
    batches,
    fetchMaterialsData 
  } = useTaskMaterials(task);
  
  // ✅ Hook 3: Historia produkcji
  const {
    productionHistory,
    fetchHistory,
    addHistoryEntry
  } = useProductionHistory(id);
  
  // ✅ Hook 4: Koszty z cache
  const {
    costsSummary,
    calculateAllCosts,
    invalidateCache
  } = useTaskCosts(task, materials, materialQuantities, includeInCosts);
  
  // ✅ Hook 5: Dialogi
  const {
    dialogs,
    openDialog,
    closeDialog
  } = useTaskDialogs();
  
  // ... render
};
```

---

## ⚠️ Co pozostało do zrobienia?

### 1. Wydzielenie dialogów (17 dialogów)
Należy stworzyć osobne komponenty dla każdego dialogu:

**Priorytety:**
- 🔴 **Wysokie:** ConsumptionDialog, ReservationDialog, StartProductionDialog
- 🟡 **Średnie:** PackagingDialog, RawMaterialsDialog, AddHistoryDialog
- 🟢 **Niskie:** EditConsumptionDialog, DeleteConsumptionDialog, etc.

**Template dialogu:**
```javascript
// src/components/production/dialogs/ConsumptionDialog.js
import React, { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';

const ConsumptionDialog = ({ 
  open, 
  onClose, 
  task, 
  materials, 
  batches,
  onConsume 
}) => {
  const [quantities, setQuantities] = useState({});
  
  const handleConfirm = async () => {
    await onConsume(quantities);
    onClose();
  };
  
  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>Konsumpcja materiałów</DialogTitle>
      <DialogContent>
        {/* ... zawartość ... */}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Anuluj</Button>
        <Button onClick={handleConfirm} variant="contained">Potwierdź</Button>
      </DialogActions>
    </Dialog>
  );
};

export default ConsumptionDialog;
```

---

## 🔍 Sprawdź czy wszystko działa

### Testy funkcjonalne:
- [ ] Real-time synchronizacja (zmień zadanie w innej zakładce)
- [ ] Lazy loading zakładek (sprawdź network)
- [ ] Cache kosztów (otwórz konsole, zmień materiały)
- [ ] Otwieranie/zamykanie dialogów
- [ ] Ładowanie historii produkcji
- [ ] Obliczanie rezerwacji materiałów
- [ ] Prefetching przy hover nad zakładkami

### Testy wydajności:
- [ ] Czas ładowania zadania
- [ ] Liczba zapytań do bazy
- [ ] Re-renders komponentów
- [ ] Pamięć RAM (przed/po)

---

## 🆘 Troubleshooting

### Problem: "Cannot find module 'useTaskData'"
**Rozwiązanie:** Sprawdź czy plik `src/hooks/production/index.js` istnieje i eksportuje hooki.

### Problem: "Task is undefined"
**Rozwiązanie:** Hook `useTaskData` zwraca `null` przez pierwsze ~300ms. Użyj warunku:
```javascript
if (!task) return <CircularProgress />;
```

### Problem: "Cache nie działa"
**Rozwiązanie:** Wywołaj `invalidateCache()` po operacjach które zmieniają koszty.

### Problem: "Dialogi nie działają"
**Rozwiązanie:** Upewnij się że używasz `dialogs` i `openDialog/closeDialog` z hooka `useTaskDialogs`.

---

## 📚 Dodatkowa dokumentacja

Pełna dokumentacja: [`REFACTORING.md`](./REFACTORING.md)

---

**Powodzenia!** 🚀

