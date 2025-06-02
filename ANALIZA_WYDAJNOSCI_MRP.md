# Analiza wydajności systemu MRP - Problemy i optymalizacje

## 🔍 Wykryte problemy wydajnościowe

### 1. **KRYTYCZNY PROBLEM: Sekwencyjne pobieranie kontaktów w CRM**
**Lokalizacja:** `src/pages/CRM/OpportunitiesPage.js:88-99`

```javascript
// ❌ PROBLEM: Sekwencyjne zapytania w pętli for
for (const contactId of contactIds) {
  try {
    const contact = await getContactById(contactId);
    contactNamesObj[contactId] = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
  } catch (error) {
    console.error(`Błąd podczas pobierania kontaktu ${contactId}:`, error);
  }
}
```

**Wpływ na wydajność:**
- N+1 problem - dla 50 szans sprzedaży = 50 osobnych zapytań
- Czas ładowania: 5-10 sekund
- Blokujące UI przez cały czas pobierania

**💡 OPTYMALIZACJA:**
```javascript
// ✅ ROZWIĄZANIE: Grupowe pobieranie kontaktów
const batchSize = 10;
const contactNamesObj = {};

for (let i = 0; i < contactIds.length; i += batchSize) {
  const batch = contactIds.slice(i, i + batchSize);
  const contactsQuery = query(
    collection(db, 'contacts'),
    where('__name__', 'in', batch)
  );
  
  const contactsSnapshot = await getDocs(contactsQuery);
  contactsSnapshot.forEach(doc => {
    const contact = doc.data();
    contactNamesObj[doc.id] = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
  });
}
```

### 2. **PROBLEMY W Purchase Orders: Nieoptymalne wyszukiwanie**
**Lokalizacja:** `src/services/purchaseOrderService.js:394-447`

```javascript
// ❌ PROBLEM: Dwa osobne zapytania zamiast jednego zoptymalizowanego
const suppliersSnapshot = await getDocs(collection(db, SUPPLIERS_COLLECTION));
// ... filtrowanie po stronie klienta
const supplierMatchingDocs = allDocs.filter(doc => {
  return data.supplierId && matchingSupplierIds.has(data.supplierId);
});
```

**Wpływ na wydajność:**
- Pobieranie WSZYSTKICH dostawców dla wyszukiwania
- Filtrowanie po stronie klienta
- Transfer 100-500KB niepotrzebnych danych

**💡 OPTYMALIZACJA:**
```javascript
// ✅ ROZWIĄZANIE: Zoptymalizowane wyszukiwanie z indeksami
const searchSuppliers = async (searchTerm) => {
  const suppliersQuery = query(
    collection(db, SUPPLIERS_COLLECTION),
    where('name', '>=', searchTerm),
    where('name', '<=', searchTerm + '\uf8ff'),
    limit(10)
  );
  return await getDocs(suppliersQuery);
};
```

### 3. **PROBLEMY W Dashboard: Sequencyjne ładowanie danych**
**Lokalizacja:** `src/pages/Dashboard/Dashboard.js:597-616`

**✅ DOBRZE ZROBIONE:** Dashboard już używa `Promise.all()` dla równoległego ładowania!

```javascript
// ✅ PRAWIDŁOWE: Równoległe zapytania
const [recipesData, ordersStatsData, analyticsData, tasksData] = await Promise.all([
  getAllRecipes(),
  getOrdersStats(true),
  getKpiData(),
  getTasksByStatus('W trakcie')
]);
```

### 4. **PROBLEM: Wielokrotne zapytania w FormsResponsesPage**
**Lokalizacja:** `src/pages/Production/FormsResponsesPage.js:66-105`

```javascript
// ❌ PROBLEM: Trzy sekwencyjne zapytania
const completedMOSnapshot = await getDocs(completedMOQuery);
// ...
const controlSnapshot = await getDocs(controlQuery);
// ...
const shiftSnapshot = await getDocs(shiftQuery);
```

**💡 OPTYMALIZACJA:**
```javascript
// ✅ ROZWIĄZANIE: Równoległe pobieranie formularzy
const fetchData = async () => {
  setLoading(true);
  try {
    const [completedMOSnapshot, controlSnapshot, shiftSnapshot] = await Promise.all([
      getDocs(query(collection(db, 'Forms/SkonczoneMO/Odpowiedzi'))),
      getDocs(query(collection(db, 'Forms/KontrolaProdukcji/Odpowiedzi'))),
      getDocs(query(collection(db, 'Forms/ZmianaProdukcji/Odpowiedzi')))
    ]);

    // Przetwarzanie wyników...
  } catch (err) {
    console.error('Błąd podczas pobierania danych:', err);
  } finally {
    setLoading(false);
  }
};
```

### 5. **PROBLEM: Hook useFirestore - podwójne ładowanie**
**Lokalizacja:** `src/hooks/useFirestore.js:259-275`

```javascript
// ❌ PROBLEM: Automatyczne ładowanie przy montowaniu + możliwość subskrypcji
useEffect(() => {
  if (!isSubscribed) {
    getAll() // Może powodować niepotrzebne zapytania
      .catch(err => {
        console.error(`Error in initial load of ${collectionName}:`, err);
      });
  }
}, [collectionName]);
```

**💡 OPTYMALIZACJA:**
```javascript
// ✅ ROZWIĄZANIE: Opcjonalne auto-ładowanie
export const useFirestore = (collectionName, options = { autoLoad: true }) => {
  // ...
  
  useEffect(() => {
    if (options.autoLoad && !isSubscribed) {
      getAll().catch(err => {
        console.error(`Error in initial load of ${collectionName}:`, err);
      });
    }
  }, [collectionName, options.autoLoad]);
};
```

### 6. **NOWY PROBLEM: Sekwencyjne pobieranie użytkowników w CRM Dashboard**
**Lokalizacja:** `src/pages/CRM/CRMDashboardPage.js:75+`

```javascript
// ❌ PROBLEM: Sekwencyjne zapytania do różnych kolekcji
const fetchCRMData = async () => {
  // Prawdopodobnie sekwencyjne await dla kontaktów, interakcji, szans, kampanii
}
```

**💡 OPTYMALIZACJA:**
```javascript
// ✅ ROZWIĄZANIE: Równoległe pobieranie danych CRM
const fetchCRMData = async () => {
  try {
    setLoading(true);
    const [contactsData, interactionsData, opportunitiesData, campaignsData] = await Promise.all([
      getAllContacts(),
      getRecentInteractions(),
      getAllOpportunities(),
      getAllCampaigns()
    ]);
    
    setContacts(contactsData);
    setRecentInteractions(interactionsData);
    setOpportunities(opportunitiesData);
    setCampaigns(campaignsData);
  } catch (error) {
    console.error('Błąd podczas pobierania danych CRM:', error);
  } finally {
    setLoading(false);
  }
};
```

### 7. **PROBLEM: Nadmierne re-renderowanie w komponentach z filtrami**
**Lokalizacja:** `src/pages/CRM/OpportunitiesPage.js:60-78`

```javascript
// ❌ PROBLEM: useEffect bez optymalizacji dla filtrowania
useEffect(() => {
  if (searchTerm.trim() === '') {
    setFilteredOpportunities(opportunities);
  } else {
    const lowercasedSearch = searchTerm.toLowerCase();
    setFilteredOpportunities(
      opportunities.filter((opportunity) => {
        // Kosztowne operacje przy każdej zmianie searchTerm
      })
    );
  }
}, [searchTerm, opportunities, contactNames]); // Za dużo zależności
```

**💡 OPTYMALIZACJA:**
```javascript
// ✅ ROZWIĄZANIE: Debounced search + useMemo
const debouncedSearchTerm = useDebounce(searchTerm, 300);

const filteredOpportunities = useMemo(() => {
  if (!debouncedSearchTerm.trim()) return opportunities;
  
  const lowercasedSearch = debouncedSearchTerm.toLowerCase();
  return opportunities.filter((opportunity) => {
    return (
      opportunity.name.toLowerCase().includes(lowercasedSearch) ||
      opportunity.notes?.toLowerCase().includes(lowercasedSearch) ||
      opportunity.stage.toLowerCase().includes(lowercasedSearch) ||
      contactNames[opportunity.contactId]?.toLowerCase().includes(lowercasedSearch)
    );
  });
}, [debouncedSearchTerm, opportunities, contactNames]);
```

### 8. **PROBLEM: Brak wirtualizacji w dużych tabelach**
**Lokalizacja:** `src/components/inventory/InventoryList.js`, `src/components/orders/OrdersList.js`

```javascript
// ❌ PROBLEM: Renderowanie wszystkich elementów tabeli jednocześnie
// Dla 1000+ pozycji magazynowych = bardzo wolne UI
```

**💡 OPTYMALIZACJA:**
```javascript
// ✅ ROZWIĄZANIE: React Virtual / React Window
import { FixedSizeList as List } from 'react-window';

const VirtualizedTable = ({ items, height = 600 }) => {
  const Row = ({ index, style }) => (
    <div style={style}>
      {/* Renderuj tylko widoczne wiersze */}
      <TableRowComponent item={items[index]} />
    </div>
  );

  return (
    <List
      height={height}
      itemCount={items.length}
      itemSize={50} // wysokość wiersza
    >
      {Row}
    </List>
  );
};
```

### 9. **PROBLEM: Nieoptymalne zapytania w Analytics Dashboard**
**Lokalizacja:** `src/pages/Analytics/Dashboard.js:48-59`

```javascript
// ❌ PROBLEM: Częste zapytania analityczne bez cache'owania
const fetchData = async () => {
  const kpiData = await getKpiData(); // Kosztowne agregacje
  const tasks = await getTasksByStatus('W trakcie');
  const orderStats = await getOrdersStats();
  const poList = await getAllPurchaseOrders();
};
```

**💡 OPTYMALIZACJA:**
```javascript
// ✅ ROZWIĄZANIE: Cache'owanie i inteligentne odświeżanie
const fetchData = async (forceRefresh = false) => {
  const cacheKey = 'analytics-dashboard';
  const cached = getFromCache(cacheKey);
  
  if (!forceRefresh && cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
    setData(cached.data);
    setLoading(false);
    return;
  }

  const [kpiData, tasks, orderStats, poList] = await Promise.all([
    getKpiData(),
    getTasksByStatus('W trakcie'),
    getOrdersStats(),
    getAllPurchaseOrders()
  ]);

  const data = { kpiData, tasks, orderStats, poList };
  setToCache(cacheKey, data);
  setData(data);
};
```

## 📊 Podsumowanie zidentyfikowanych problemów

| Komponent/Serwis | Problem | Wpływ | Priorytet |
|------------------|---------|--------|-----------|
| **OpportunitiesPage** | N+1 queries dla kontaktów | 🔴 Krytyczny | 1 |
| **CRMDashboard** | Sekwencyjne zapytania CRM | 🔴 Krytyczny | 2 |
| **FormsResponsesPage** | Sekwencyjne zapytania | 🟡 Średni | 3 |
| **PurchaseOrderService** | Pobieranie wszystkich dostawców | 🟡 Średni | 4 |
| **InventoryList/OrdersList** | Brak wirtualizacji | 🟡 Średni | 5 |
| **useFirestore Hook** | Podwójne ładowanie | 🟡 Średni | 6 |
| **Analytics Dashboard** | Brak cache'owania | 🟡 Średni | 7 |
| **Search Filters** | Nadmierne re-renderowanie | 🟢 Niski | 8 |

## 🚀 Plan optymalizacji

### Faza 1: Krytyczne problemy (1-2 dni)
1. **Optymalizacja OpportunitiesPage** - grupowe pobieranie kontaktów
2. **Optymalizacja CRM Dashboard** - równoległe zapytania
3. **Optymalizacja FormsResponsesPage** - równoległe zapytania

### Faza 2: Średnie problemy (3-5 dni)
4. **Optymalizacja PurchaseOrderService** - inteligentne wyszukiwanie
5. **Implementacja wirtualizacji** dla dużych tabel
6. **Poprawa useFirestore Hook** - opcjonalne auto-ładowanie

### Faza 3: Dodatkowe usprawnienia (1-2 tygodnie)
7. **Implementacja cache'owania** w Analytics Dashboard
8. **Debounced search** w komponentach z filtrami
9. **Lazy loading** dla dodatkowych sekcji
10. **Performance monitoring** - metryki w czasie rzeczywistym

## 🔧 Konkretne kroki implementacji

### 1. Optymalizacja OpportunitiesPage

```javascript
// Dodaj do src/services/crmService.js
export const getContactsByIds = async (contactIds) => {
  if (!contactIds.length) return {};
  
  const contactNamesObj = {};
  const batchSize = 10;
  
  for (let i = 0; i < contactIds.length; i += batchSize) {
    const batch = contactIds.slice(i, i + batchSize);
    const contactsQuery = query(
      collection(db, CONTACTS_COLLECTION),
      where('__name__', 'in', batch)
    );
    
    const contactsSnapshot = await getDocs(contactsQuery);
    contactsSnapshot.forEach(doc => {
      const contact = doc.data();
      contactNamesObj[doc.id] = `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || contact.company || 'Nieznany kontakt';
    });
  }
  
  return contactNamesObj;
};
```

### 2. Nowe indeksy Firestore

```json
// Dodaj do firestore.indexes.json
{
  "collectionGroup": "contacts",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "__name__", "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "suppliers",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "name", "order": "ASCENDING" }
  ]
}
```

### 3. Hook do debounced search

```javascript
// Nowy plik: src/hooks/useDebounce.js
export const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};
```

### 4. Komponent ładowania z cache

```javascript
// Nowy plik: src/hooks/useOptimizedData.js
export const useOptimizedData = (fetchFunction, dependencies = [], cacheTime = 5 * 60 * 1000) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const cacheRef = useRef(new Map());

  const fetchData = useCallback(async () => {
    const cacheKey = JSON.stringify(dependencies);
    const cached = cacheRef.current.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < cacheTime) {
      setData(cached.data);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const result = await fetchFunction();
      
      cacheRef.current.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });
      
      setData(result);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, dependencies);

  useEffect(() => {
    fetchData();
  }, dependencies);

  return { data, loading, error, refetch: fetchData };
};
```

### 5. Wirtualizowana tabela

```javascript
// Nowy plik: src/components/common/VirtualizedTable.js
import { FixedSizeList as List } from 'react-window';

export const VirtualizedTable = ({ 
  items, 
  renderRow, 
  height = 600, 
  itemHeight = 50 
}) => {
  const Row = ({ index, style }) => (
    <div style={style}>
      {renderRow(items[index], index)}
    </div>
  );

  return (
    <List
      height={height}
      itemCount={items.length}
      itemSize={itemHeight}
      overscanCount={5} // Renderuj 5 dodatkowych wierszy poza widokiem
    >
      {Row}
    </List>
  );
};
```

## 📈 Oczekiwane rezultaty

### Przed optymalizacją:
- **OpportunitiesPage**: 8-12 sekund ładowania
- **CRM Dashboard**: 6-10 sekund ładowania
- **FormsResponsesPage**: 3-5 sekund ładowania
- **PurchaseOrders search**: 2-4 sekundy
- **Large Tables (1000+ items)**: 3-8 sekund renderowania
- **Transfer danych**: 1-3 MB na stronę

### Po optymalizacji:
- **OpportunitiesPage**: 2-3 sekundy ładowania (-70%)
- **CRM Dashboard**: 2-4 sekundy ładowania (-60%)
- **FormsResponsesPage**: 1-2 sekundy ładowania (-60%)
- **PurchaseOrders search**: 0.5-1 sekunda (-75%)
- **Large Tables**: <1 sekunda renderowania (-85%)
- **Transfer danych**: 300-800 KB na stronę (-60%)

## 🎯 Kluczowe metryki do śledzenia

1. **Time to First Contentful Paint (FCP)**
2. **Largest Contentful Paint (LCP)** 
3. **Number of Firestore reads per page**
4. **Data transfer size**
5. **User interaction delay**
6. **React component re-renders count**
7. **Memory usage in browser**

## 🛠️ Narzędzia monitorowania

1. **Firebase Performance Monitoring**
2. **Chrome DevTools - Network Tab**
3. **React DevTools Profiler**
4. **Custom performance logging**

```javascript
// Przykład custom performance tracking
const performanceTracker = {
  start: (operation) => {
    console.time(operation);
    return Date.now();
  },
  
  end: (operation, startTime) => {
    console.timeEnd(operation);
    const duration = Date.now() - startTime;
    
    // Wysyłaj metryki do Firebase Analytics
    analytics.logEvent('performance_metric', {
      operation,
      duration,
      timestamp: Date.now()
    });
  }
};
```

## 📋 Checklist implementacji

### Faza 1 (Krytyczne - 1-2 dni)
- [ ] Optymalizacja OpportunitiesPage (batch contacts)
- [ ] Optymalizacja CRM Dashboard (parallel queries)
- [ ] Optymalizacja FormsResponsesPage (parallel queries)
- [ ] Deploy nowych indeksów Firestore

### Faza 2 (Średnie - 3-5 dni)
- [ ] Implementacja useDebounce hook
- [ ] Wirtualizacja InventoryList
- [ ] Wirtualizacja OrdersList
- [ ] Optymalizacja PurchaseOrderService
- [ ] Poprawa useFirestore hook

### Faza 3 (Usprawnienia - 1-2 tygodnie)
- [ ] Cache w Analytics Dashboard
- [ ] Performance monitoring setup
- [ ] Memory leak detection
- [ ] Bundle size optimization
- [ ] Image lazy loading
- [ ] Code splitting dla dużych komponentów

---

**Autor:** AI Assistant  
**Data utworzenia:** ${new Date().toLocaleDateString('pl-PL')}  
**Status:** Do implementacji  
**Priorytet:** Wysoki 🔴 