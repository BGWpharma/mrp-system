import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  getDoc, 
  getDocs, 
  deleteDoc, 
  query, 
  where,
  orderBy,
  serverTimestamp,
  limit as firebaseLimit,
  limit
} from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase/config';
import { createNotification } from './notificationService';

// Stałe dla kolekcji w Firebase
const PURCHASE_ORDERS_COLLECTION = 'purchaseOrders';
const SUPPLIERS_COLLECTION = 'suppliers';

// Dodajemy prosty mechanizm pamięci podręcznej dla zwiększenia wydajności
const searchCache = {
  results: new Map(),
  timestamp: new Map(),
  maxCacheAge: 60 * 1000, // 60 sekund (1 minuta)
  
  // Nowy cache dla wyszukiwania pozycji magazynowych
  inventorySearchCache: new Map(),
  inventorySearchTimestamp: new Map(),
  
  // Debouncing dla wyszukiwania pozycji magazynowych
  inventorySearchTimeout: null,
  
  // Generuje klucz cache na podstawie parametrów zapytania
  generateKey(page, itemsPerPage, sortField, sortOrder, filters) {
    // Uwzględnij wszystkie filtry w kluczu cache, szczególnie searchTerm
    return JSON.stringify({ 
      page, 
      itemsPerPage, 
      sortField, 
      sortOrder, 
      filters: {
        status: filters.status || null,
        searchTerm: filters.searchTerm || null,
        dateFrom: filters.dateFrom || null,
        dateTo: filters.dateTo || null,
        supplierName: filters.supplierName || null,
        priceMin: filters.priceMin || null,
        priceMax: filters.priceMax || null
      }
    });
  },
  
  // Sprawdza, czy w cache istnieje aktualny wynik dla danego zapytania
  has(key) {
    if (!this.results.has(key)) return false;
    
    const timestamp = this.timestamp.get(key) || 0;
    const now = Date.now();
    return (now - timestamp) < this.maxCacheAge;
  },
  
  // Pobiera wynik z cache
  get(key) {
    return this.results.get(key);
  },
  
  // Zapisuje wynik do cache
  set(key, result) {
    this.results.set(key, result);
    this.timestamp.set(key, Date.now());
    
    // Jeśli cache jest zbyt duży, usuń najstarsze wpisy
    if (this.results.size > 50) {
      const oldestKey = [...this.timestamp.entries()]
        .sort((a, b) => a[1] - b[1])
        [0][0];
      
      this.results.delete(oldestKey);
      this.timestamp.delete(oldestKey);
    }
  },
  
  // Czyści cache dla konkretnego zamówienia (używane po aktualizacji/usunięciu)
  invalidateForOrder(orderId) {
    for (const [key, result] of this.results.entries()) {
      if (result && result.data && result.data.some(po => po.id === orderId)) {
        this.results.delete(key);
        this.timestamp.delete(key);
      }
    }
  },
  
  // Czyści cały cache
  clear() {
    this.results.clear();
    this.timestamp.clear();
    this.inventorySearchCache.clear();
    this.inventorySearchTimestamp.clear();
    console.log('Cache został wyczyszczony');
  },
  
  // Dodaj funkcję do czyszczenia cache dla zapytań wyszukiwania
  clearSearchCache() {
    for (const [key] of this.results.entries()) {
      try {
        const parsedKey = JSON.parse(key);
        if (parsedKey.filters && parsedKey.filters.searchTerm) {
          this.results.delete(key);
          this.timestamp.delete(key);
        }
      } catch (error) {
        // Jeśli nie można parsować klucza, usuń go
        this.results.delete(key);
        this.timestamp.delete(key);
      }
    }
    // Wyczyść również cache wyszukiwania pozycji magazynowych
    this.inventorySearchCache.clear();
    this.inventorySearchTimestamp.clear();
    console.log('Cache wyszukiwania został wyczyszczony');
  }
};

/**
 * Pomocnicza funkcja do bezpiecznej konwersji różnych formatów dat na ISO string
 * Obsługuje Timestamp, Date, string ISO i null
 */
const safeConvertDate = (dateField) => {
  if (!dateField) return null;
  
  try {
    // Jeśli to Timestamp z Firebase
    if (dateField && dateField.toDate && typeof dateField.toDate === 'function') {
      return dateField.toDate().toISOString();
    }
    
    // Jeśli to już string ISO
    if (typeof dateField === 'string') {
      return dateField;
    }
    
    // Jeśli to obiekt Date
    if (dateField instanceof Date) {
      return dateField.toISOString();
    }
    
    // Inne przypadki - spróbuj skonwertować lub zwróć null
    return null;
  } catch (error) {
    console.error("Błąd podczas konwersji daty:", error, dateField);
    return null;
  }
};

// Funkcje do obsługi zamówień zakupowych
export const getAllPurchaseOrders = async () => {
  try {
    const q = query(
      collection(db, PURCHASE_ORDERS_COLLECTION), 
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    const purchaseOrders = [];
    
    for (const docRef of querySnapshot.docs) {
      const poData = docRef.data();
      
      // Pobierz dane dostawcy, jeśli zamówienie ma referencję do dostawcy
      let supplierData = null;
      if (poData.supplierId) {
        const supplierDoc = await getDoc(doc(db, SUPPLIERS_COLLECTION, poData.supplierId));
        if (supplierDoc.exists()) {
          supplierData = { id: supplierDoc.id, ...supplierDoc.data() };
        }
      }
      
      // Upewnij się, że zamówienie ma poprawną wartość brutto (totalGross)
      let totalGross = poData.totalGross;
      
      // Jeśli nie ma wartości brutto lub jest nieprawidłowa, oblicz ją
      if (totalGross === undefined || totalGross === null) {
        // Oblicz wartość produktów
        const productsValue = typeof poData.items === 'object' && Array.isArray(poData.items)
          ? poData.items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0)
          : (parseFloat(poData.totalValue) || 0);
        
        // Oblicz VAT (tylko od wartości produktów)
        const vatRate = parseFloat(poData.vatRate) || 0;
        const vatValue = (productsValue * vatRate) / 100;
        
        // Oblicz dodatkowe koszty
        const additionalCosts = poData.additionalCostsItems && Array.isArray(poData.additionalCostsItems) 
          ? poData.additionalCostsItems.reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0)
          : (parseFloat(poData.additionalCosts) || 0);
        
        // Wartość brutto to suma: wartość netto produktów + VAT + dodatkowe koszty
        totalGross = productsValue + vatValue + additionalCosts;
        
        console.log(`Obliczono wartość brutto dla PO ${poData.number}: ${totalGross}`);
      } else {
        totalGross = parseFloat(totalGross) || 0;
      }
      
      purchaseOrders.push({
        id: docRef.id,
        ...poData,
        supplier: supplierData,
        totalGross: totalGross,
        // Bezpieczna konwersja dat zamiast bezpośredniego wywołania toDate()
        orderDate: safeConvertDate(poData.orderDate),
        expectedDeliveryDate: safeConvertDate(poData.expectedDeliveryDate),
        createdAt: safeConvertDate(poData.createdAt),
        updatedAt: safeConvertDate(poData.updatedAt)
      });
    }
    
    return purchaseOrders;
  } catch (error) {
    console.error('Błąd podczas pobierania zamówień zakupowych:', error);
    throw error;
  }
};

/**
 * Pobiera zamówienia zakupowe z paginacją i zaawansowanym wyszukiwaniem
 * 
 * NOWE FUNKCJE WYSZUKIWANIA:
 * - Wyszukuje w pozycjach zamówienia (nazwy produktów, kody, opisy)
 * - Wyszukuje w pozycjach magazynowych powiązanych z zamówieniami
 * - Używa cache dla lepszej wydajności
 * - Obsługuje debouncing dla wyszukiwania pozycji magazynowych
 * 
 * @param {number} page - Numer strony (numeracja od 1)
 * @param {number} itemsPerPage - Liczba elementów na stronę
 * @param {string} sortField - Pole, po którym sortujemy
 * @param {string} sortOrder - Kierunek sortowania (asc/desc)
 * @param {Object} filters - Opcjonalne filtry (status, searchTerm, dateFrom, dateTo, supplierName, priceMin, priceMax)
 *   - searchTerm: Wyszukuje w numerach PO, notatkach, nazwach dostawców, nazwach produktów w pozycjach
 * @param {boolean} useCache - Czy używać cache (domyślnie true)
 * @returns {Object} - Obiekt zawierający dane i metadane paginacji
 */
export const getPurchaseOrdersWithPagination = async (page = 1, itemsPerPage = 10, sortField = 'createdAt', sortOrder = 'desc', filters = {}, useCache = true) => {
  try {
    // Sprawdź, czy mamy dane w cache - ale nie używaj cache dla wyszukiwania
    const cacheKey = searchCache.generateKey(page, itemsPerPage, sortField, sortOrder, filters);
    
    // Wyłącz cache dla zapytań wyszukiwania, aby zawsze pobierać świeże dane
    const shouldUseCache = useCache && (!filters.searchTerm || filters.searchTerm.trim() === '');
    
    if (shouldUseCache && searchCache.has(cacheKey)) {
      console.log('Używam danych z cache dla zapytania:', { page, itemsPerPage, sortField, sortOrder });
      return searchCache.get(cacheKey);
    }
    
    console.log('Pobieranie świeżych danych dla zapytania:', { page, itemsPerPage, sortField, sortOrder, hasSearchTerm: !!(filters.searchTerm && filters.searchTerm.trim()) });
    
    // Ustaw realne wartości dla page i itemsPerPage
    const pageNum = Math.max(1, page);
    const itemsLimit = Math.max(1, itemsPerPage);
    
    // Kolekcjonujemy wszystkie ID dostawców, aby potem pobrać ich dane za jednym razem
    const supplierIds = new Set();
    
    // Najpierw pobieramy wszystkie dane do filtrowania po stronie serwera
    // Przygotuj zapytanie z sortowaniem
    let q = query(
      collection(db, PURCHASE_ORDERS_COLLECTION),
      orderBy(sortField, sortOrder)
    );
    
    // Pobierz wszystkie dokumenty dla sortowania i paginacji
    const querySnapshot = await getDocs(q);
    let allDocs = querySnapshot.docs;
    
    // Filtrowanie po stronie serwera
    if (filters) {
      // Filtrowanie po statusie
      if (filters.status && filters.status !== 'all') {
        allDocs = allDocs.filter(doc => {
          const data = doc.data();
          return data.status === filters.status;
        });
      }
      
      // Filtrowanie po dacie od
      if (filters.dateFrom && filters.dateFrom.trim() !== '') {
        const dateFrom = new Date(filters.dateFrom);
        dateFrom.setHours(0, 0, 0, 0); // Początek dnia
        
        allDocs = allDocs.filter(doc => {
          const data = doc.data();
          if (!data.orderDate) return false;
          
          let orderDate;
          if (data.orderDate && typeof data.orderDate.toDate === 'function') {
            orderDate = data.orderDate.toDate();
          } else if (typeof data.orderDate === 'string') {
            orderDate = new Date(data.orderDate);
          } else {
            return false;
          }
          
          return orderDate >= dateFrom;
        });
      }
      
      // Filtrowanie po dacie do
      if (filters.dateTo && filters.dateTo.trim() !== '') {
        const dateTo = new Date(filters.dateTo);
        dateTo.setHours(23, 59, 59, 999); // Koniec dnia
        
        allDocs = allDocs.filter(doc => {
          const data = doc.data();
          if (!data.orderDate) return false;
          
          let orderDate;
          if (data.orderDate && typeof data.orderDate.toDate === 'function') {
            orderDate = data.orderDate.toDate();
          } else if (typeof data.orderDate === 'string') {
            orderDate = new Date(data.orderDate);
          } else {
            return false;
          }
          
          return orderDate <= dateTo;
        });
      }
      
      // Filtrowanie po zakresie cenowym minimalnym
      if (filters.priceMin && !isNaN(parseFloat(filters.priceMin))) {
        const priceMin = parseFloat(filters.priceMin);
        
        allDocs = allDocs.filter(doc => {
          const data = doc.data();
          // Sprawdź różne pola cenowe
          const totalGross = parseFloat(data.totalGross) || 0;
          const totalValue = parseFloat(data.totalValue) || 0;
          
          return totalGross >= priceMin || totalValue >= priceMin;
        });
      }
      
      // Filtrowanie po zakresie cenowym maksymalnym
      if (filters.priceMax && !isNaN(parseFloat(filters.priceMax))) {
        const priceMax = parseFloat(filters.priceMax);
        
        allDocs = allDocs.filter(doc => {
          const data = doc.data();
          // Sprawdź różne pola cenowe
          const totalGross = parseFloat(data.totalGross) || 0;
          const totalValue = parseFloat(data.totalValue) || 0;
          
          return (totalGross > 0 && totalGross <= priceMax) || (totalValue > 0 && totalValue <= priceMax);
        });
      }
      
      // Filtrowanie po tekście wyszukiwania
      if (filters.searchTerm && filters.searchTerm.trim() !== '') {
        const searchTerm = filters.searchTerm.toLowerCase().trim();
        console.log(`Rozpoczynam wyszukiwanie dla terminu: "${searchTerm}"`);
        
        // DEBUG: Pokaż przykładowe numery PO z bazy danych (pierwsze 3)
        console.log('--- DEBUG: Przykładowe numery PO w bazie ---');
        allDocs.slice(0, 3).forEach(doc => {
          const data = doc.data();
          console.log(`ID: ${doc.id}, number: "${data.number}"`);
        });
        console.log('--- KONIEC DEBUG ---');
        
        // Najpierw znajdź zamówienia pasujące bezpośrednio po tekście
        const directMatchingDocs = allDocs.filter(doc => {
          const data = doc.data();
          
          // Szukaj w numerze zamówienia (zarówno pełnej nazwie jak i części)
          if (data.number && data.number.toLowerCase().includes(searchTerm)) {
            console.log(`✓ Znaleziono dopasowanie w numerze: ${data.number}`);
            return true;
          }
          
          // Szukaj w ID dokumentu (dla numerów PO)
          if (doc.id.toLowerCase().includes(searchTerm)) {
            console.log(`✓ Znaleziono dopasowanie w ID dokumentu: ${doc.id}`);
            return true;
          }
          
          // Dodatkowe wyszukiwanie - sprawdź czy searchTerm jest częścią numeru bez rozróżniania wielkości liter
          if (data.number) {
            const numberUpper = data.number.toUpperCase();
            const searchUpper = searchTerm.toUpperCase();
            if (numberUpper.includes(searchUpper)) {
              console.log(`✓ Znaleziono dopasowanie w numerze (case insensitive): ${data.number}`);
              return true;
            }
          }
          
          // Sprawdź czy ID dokumentu pasuje (case insensitive)
          if (doc.id.toUpperCase().includes(searchTerm.toUpperCase())) {
            console.log(`✓ Znaleziono dopasowanie w ID (case insensitive): ${doc.id}`);
            return true;
          }
          
          // Szukaj w notatkach
          if (data.notes && data.notes.toLowerCase().includes(searchTerm)) {
            console.log(`✓ Znaleziono dopasowanie w notatkach`);
            return true;
          }
          
          // Szukaj w numerach referencyjnych
          if (data.referenceNumber && data.referenceNumber.toLowerCase().includes(searchTerm)) {
            console.log(`✓ Znaleziono dopasowanie w numerze referencyjnym: ${data.referenceNumber}`);
            return true;
          }
          
          // NOWE: Szukaj w pozycjach zamówienia (items)
          if (data.items && Array.isArray(data.items)) {
            const foundInItems = data.items.some(item => {
              // Szukaj w nazwie produktu
              if (item.name && item.name.toLowerCase().includes(searchTerm)) {
                console.log(`✓ Znaleziono dopasowanie w nazwie produktu: ${item.name}`);
                return true;
              }
              
              // Szukaj w kodzie produktu/SKU (jeśli istnieje)
              if (item.code && item.code.toLowerCase().includes(searchTerm)) {
                console.log(`✓ Znaleziono dopasowanie w kodzie produktu: ${item.code}`);
                return true;
              }
              
              // Szukaj w numerze katalogowym (jeśli istnieje)
              if (item.catalogNumber && item.catalogNumber.toLowerCase().includes(searchTerm)) {
                console.log(`✓ Znaleziono dopasowanie w numerze katalogowym: ${item.catalogNumber}`);
                return true;
              }
              
              // Szukaj w opisie pozycji (jeśli istnieje)
              if (item.description && item.description.toLowerCase().includes(searchTerm)) {
                console.log(`✓ Znaleziono dopasowanie w opisie pozycji: ${item.description}`);
                return true;
              }
              
              // Szukaj w numerze faktury pozycji (może być przydatne)
              if (item.invoiceNumber && item.invoiceNumber.toLowerCase().includes(searchTerm)) {
                console.log(`✓ Znaleziono dopasowanie w numerze faktury pozycji: ${item.invoiceNumber}`);
                return true;
              }
              
              return false;
            });
            
            if (foundInItems) {
              return true;
            }
          }
          
          return false;
        });
        
        console.log(`Znaleziono ${directMatchingDocs.length} zamówień pasujących bezpośrednio`);
        
        // ✅ OPTYMALIZACJA: Inteligentne wyszukiwanie dostawców z indeksami
        let matchingSupplierIds = new Set();
        
        if (searchTerm.length >= 2) { // Minimum 2 znaki dla wyszukiwania
          try {
            // Użyj zapytania z zakresem dla wydajniejszego wyszukiwania
            const suppliersQuery = query(
              collection(db, SUPPLIERS_COLLECTION),
              where('name', '>=', searchTerm),
              where('name', '<=', searchTerm + '\uf8ff'),
              firebaseLimit(20) // Ogranicz do 20 dostawców
            );
            
            const suppliersSnapshot = await getDocs(suppliersQuery);
            suppliersSnapshot.forEach(doc => {
              matchingSupplierIds.add(doc.id);
              console.log(`✓ Znaleziono dostawcę: ${doc.data().name}`);
            });
            
            // Jeśli nie znaleziono przez zapytanie zakresowe, spróbuj fallback
            if (matchingSupplierIds.size === 0) {
              console.log('Brak wyników z zapytania zakresowego, używam fallback...');
              const allSuppliersQuery = query(collection(db, SUPPLIERS_COLLECTION), firebaseLimit(100));
              const allSuppliersSnapshot = await getDocs(allSuppliersQuery);
              
              allSuppliersSnapshot.forEach(doc => {
                const supplierData = doc.data();
                if (supplierData.name && 
                    supplierData.name.toLowerCase().includes(searchTerm.toLowerCase())) {
                  matchingSupplierIds.add(doc.id);
                  console.log(`✓ Znaleziono dostawcę (fallback): ${supplierData.name}`);
                }
              });
            }
            
            console.log(`Znaleziono ${matchingSupplierIds.size} dostawców pasujących do '${searchTerm}'`);
          } catch (error) {
            console.warn('Błąd podczas wyszukiwania dostawców:', error);
            // W przypadku błędu, nie dodawaj żadnych dostawców
          }
        }

        // Znajdź zamówienia z pasującymi dostawcami
        const supplierMatchingDocs = allDocs.filter(doc => {
          const data = doc.data();
          return data.supplierId && matchingSupplierIds.has(data.supplierId);
        });
        
        console.log(`Znaleziono ${supplierMatchingDocs.length} zamówień z pasującymi dostawcami`);
        
        // Połącz wyniki i usuń duplikaty
        const combinedDocsMap = new Map();
        
        // Dodaj zamówienia pasujące bezpośrednio
        directMatchingDocs.forEach(doc => {
          combinedDocsMap.set(doc.id, doc);
        });
        
        // Dodaj zamówienia z pasującymi dostawcami
        supplierMatchingDocs.forEach(doc => {
          combinedDocsMap.set(doc.id, doc);
        });
        
        // Konwertuj z powrotem na tablicę
        allDocs = Array.from(combinedDocsMap.values());
        
        console.log(`Łącznie znaleziono ${allDocs.length} zamówień dla zapytania '${searchTerm}'`);
        
        // NOWE: Wyszukiwanie dodatkowe w pozycjach magazynowych
        // Pobierz pozycje magazynowe pasujące do zapytania wyszukiwania
        if (searchTerm.length >= 3) { // Zwiększono do 3 znaków dla lepszej wydajności
          const inventorySearchStartTime = Date.now();
          try {
            console.log(`[PERFORMANCE] Rozpoczynam wyszukiwanie w pozycjach magazynowych dla: "${searchTerm}"`);
            
            // Sprawdź cache dla wyszukiwania pozycji magazynowych
            const inventoryCacheKey = searchTerm.toLowerCase().trim();
            const now = Date.now();
            let matchingInventoryItemIds = new Set();
            
            if (searchCache.inventorySearchCache.has(inventoryCacheKey) && 
                searchCache.inventorySearchTimestamp.has(inventoryCacheKey)) {
              const cacheTime = searchCache.inventorySearchTimestamp.get(inventoryCacheKey);
              if (now - cacheTime < searchCache.maxCacheAge) {
                matchingInventoryItemIds = searchCache.inventorySearchCache.get(inventoryCacheKey);
                console.log(`Używam cache dla wyszukiwania pozycji magazynowych: ${matchingInventoryItemIds.size} pozycji`);
              }
            }
            
            // Jeśli nie ma w cache lub cache wygasł, wykonaj wyszukiwanie
            if (matchingInventoryItemIds.size === 0) {
              try {
                // Importuj i użyj funkcji wyszukiwania pozycji magazynowych
                const { getAllInventoryItems } = await import('./inventory');
                const inventorySearchResult = await getAllInventoryItems(
                  null, // warehouseId - wszystkie magazyny
                  1, // page - pierwsza strona
                  50, // pageSize - ograniczenie do 50 najlepszych wyników dla wydajności
                  searchTerm, // searchTerm - nasze zapytanie
                  null, // searchCategory
                  'name', // sortField - sortuj po nazwie dla lepszych wyników
                  'asc'  // sortOrder - rosnąco
                );
                
                // Wyciągnij ID pozycji magazynowych, które pasują do wyszukiwania
                matchingInventoryItemIds = new Set(
                  inventorySearchResult.map ? inventorySearchResult.map(item => item.id) : 
                  inventorySearchResult.items ? inventorySearchResult.items.map(item => item.id) : []
                );
                
                // Zapisz w cache tylko jeśli znaleziono wyniki
                if (matchingInventoryItemIds.size > 0) {
                  searchCache.inventorySearchCache.set(inventoryCacheKey, matchingInventoryItemIds);
                  searchCache.inventorySearchTimestamp.set(inventoryCacheKey, now);
                  console.log(`Zapisano ${matchingInventoryItemIds.size} pozycji magazynowych w cache`);
                } else {
                  // Zapisz również puste wyniki w cache, aby uniknąć powtórnych zapytań
                  searchCache.inventorySearchCache.set(inventoryCacheKey, new Set());
                  searchCache.inventorySearchTimestamp.set(inventoryCacheKey, now);
                  console.log(`Zapisano pusty wynik wyszukiwania pozycji magazynowych w cache`);
                }
              } catch (inventoryError) {
                console.warn('Błąd podczas wyszukiwania pozycji magazynowych:', inventoryError);
                // W przypadku błędu, kontynuuj bez pozycji magazynowych
                matchingInventoryItemIds = new Set();
              }
            }
            
            const inventorySearchDuration = Date.now() - inventorySearchStartTime;
            console.log(`[PERFORMANCE] Wyszukiwanie pozycji magazynowych zakończone w ${inventorySearchDuration}ms. Znaleziono ${matchingInventoryItemIds.size} pozycji`);
            
            if (matchingInventoryItemIds.size > 0) {
              // Znajdź zamówienia zawierające te pozycje magazynowe
              // Optymalizacja: użyj Set dla szybszego dostępu
              const existingOrderIds = new Set(allDocs.map(doc => doc.id));
              let addedCount = 0;
              
              // Przefiltruj wszystkie dokumenty, ale tylko te, które jeszcze nie są w wynikach
              const inventoryMatchingDocs = allDocs.filter(doc => {
                if (existingOrderIds.has(doc.id)) {
                  return false; // Już mamy to zamówienie
                }
                
                const data = doc.data();
                if (data.items && Array.isArray(data.items)) {
                  return data.items.some(item => 
                    item.inventoryItemId && matchingInventoryItemIds.has(item.inventoryItemId)
                  );
                }
                return false;
              });
              
              console.log(`Znaleziono ${inventoryMatchingDocs.length} nowych zamówień z pasującymi pozycjami magazynowymi`);
              
              // Dodaj znalezione zamówienia do wyników
              for (const doc of inventoryMatchingDocs) {
                if (!existingOrderIds.has(doc.id)) {
                  allDocs.push(doc);
                  existingOrderIds.add(doc.id);
                  addedCount++;
                }
              }
              
              console.log(`Dodano ${addedCount} nowych zamówień. Łącznie: ${allDocs.length} zamówień`);
            }
          } catch (error) {
            const inventorySearchDuration = Date.now() - inventorySearchStartTime;
            console.warn(`[PERFORMANCE] Błąd podczas wyszukiwania w pozycjach magazynowych po ${inventorySearchDuration}ms:`, error);
            // Kontynuuj bez tego wyszukiwania w przypadku błędu
          }
        }
        
        // Zbierz ID dostawców do późniejszego pobrania
        allDocs.forEach(doc => {
          const data = doc.data();
          if (data.supplierId) {
            supplierIds.add(data.supplierId);
          }
        });
      }
      
      // Pobierz wszystkich dostawców niezależnie od filtrowania tekstowego
      // aby umożliwić wyszukiwanie przez nazwy dostawców
      if (supplierIds.size > 0 || (filters.searchTerm && filters.searchTerm.trim() !== '')) {
        const searchTerm = filters.searchTerm ? filters.searchTerm.toLowerCase().trim() : '';
        
        // Pobierz wszystkich dostawców
        const suppliersSnapshot = await getDocs(collection(db, SUPPLIERS_COLLECTION));
        const suppliersMapByName = {};
        
        suppliersSnapshot.forEach(doc => {
          const supplierData = doc.data();
          // Pamiętaj o ID dostawcy dla późniejszego filtrowania
          // Jeśli szukamy po tekście, dodaj tylko pasujących dostawców
          if (searchTerm && supplierData.name && 
              supplierData.name.toLowerCase().includes(searchTerm)) {
            suppliersMapByName[doc.id] = true;
            console.log(`Znaleziono dostawcę pasującego do zapytania '${searchTerm}': ${supplierData.name}`);
          } else if (!searchTerm) {
            // Jeśli nie szukamy po tekście, dodaj wszystkich dostawców
            suppliersMapByName[doc.id] = true;
          }
        });
        
        // Znajdź zamówienia z dopasowanymi dostawcami i dodaj do wyników wyszukiwania
        if (Object.keys(suppliersMapByName).length > 0 && filters.searchTerm) {
          const ordersWithMatchingSuppliers = allDocs.filter(doc => {
            const data = doc.data();
            return data.supplierId && suppliersMapByName[data.supplierId];
          });
          
          // Połącz wyniki filtrowania po zamówieniach z wynikami filtrowania po dostawcach
          // usuwając duplikaty
          const orderIds = new Set(allDocs.map(doc => doc.id));
          
          // Dodaj zamówienia z dopasowanymi dostawcami, których jeszcze nie mamy
          for (const doc of ordersWithMatchingSuppliers) {
            if (!orderIds.has(doc.id)) {
              allDocs.push(doc);
              orderIds.add(doc.id);
            }
          }
          
          console.log(`Znaleziono ${ordersWithMatchingSuppliers.length} zamówień z pasującymi dostawcami`);
        }
      }
    }
    
    // Pobierz wszystkich dostawców, których ID zostały zebrane podczas filtrowania i paginacji
    const totalCount = allDocs.length;
    
    // Oblicz liczbę stron
    const totalPages = Math.ceil(totalCount / itemsLimit);
    
    // Jeśli żądana strona jest większa niż liczba stron, ustaw na ostatnią stronę
    const safePageNum = Math.min(pageNum, Math.max(1, totalPages));
    
    // Ręczna paginacja
    const startIndex = (safePageNum - 1) * itemsLimit;
    const endIndex = Math.min(startIndex + itemsLimit, allDocs.length);
    const paginatedDocs = allDocs.slice(startIndex, endIndex);
    
    // Zbierz wszystkie ID dostawców z paginowanych dokumentów
    paginatedDocs.forEach(doc => {
      const data = doc.data();
      if (data.supplierId) {
        supplierIds.add(data.supplierId);
      }
    });
    
    // Pobierz wszystkich dostawców z listy ID jednym zapytaniem zbiorczym
    const suppliersMap = {}; // Mapa ID -> dane dostawcy
    
    if (supplierIds.size > 0) {
      // Konwertuj Set na Array
      const supplierIdsArray = Array.from(supplierIds);
      
      // Firebase ma limit 10 elementów w klauzuli 'in', więc musimy podzielić na mniejsze grupy
      const batchSize = 10;
      for (let i = 0; i < supplierIdsArray.length; i += batchSize) {
        const batch = supplierIdsArray.slice(i, i + batchSize);
        const suppliersQuery = query(
          collection(db, SUPPLIERS_COLLECTION),
          where('__name__', 'in', batch)
        );
        
        const suppliersSnapshot = await getDocs(suppliersQuery);
        suppliersSnapshot.forEach(doc => {
          suppliersMap[doc.id] = { id: doc.id, ...doc.data() };
        });
      }
    }
    
    // Przygotuj dane zamówień
    let purchaseOrders = paginatedDocs.map(docRef => {
      const poData = docRef.data();
      
      // Pobierz dane dostawcy z wcześniej utworzonej mapy
      const supplierData = poData.supplierId ? suppliersMap[poData.supplierId] || null : null;
      
      // Upewnij się, że zamówienie ma poprawną wartość brutto (totalGross)
      let totalGross = poData.totalGross;
      
      // Jeśli nie ma wartości brutto lub jest nieprawidłowa, oblicz ją
      if (totalGross === undefined || totalGross === null) {
        // Oblicz wartość produktów
        const productsValue = typeof poData.items === 'object' && Array.isArray(poData.items)
          ? poData.items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0)
          : (parseFloat(poData.totalValue) || 0);
        
        // Oblicz VAT (tylko od wartości produktów)
        const vatRate = parseFloat(poData.vatRate) || 0;
        const vatValue = (productsValue * vatRate) / 100;
        
        // Oblicz dodatkowe koszty
        const additionalCosts = poData.additionalCostsItems && Array.isArray(poData.additionalCostsItems) 
          ? poData.additionalCostsItems.reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0)
          : (parseFloat(poData.additionalCosts) || 0);
        
        // Wartość brutto to suma: wartość netto produktów + VAT + dodatkowe koszty
        totalGross = productsValue + vatValue + additionalCosts;
      } else {
        totalGross = parseFloat(totalGross) || 0;
      }
      
      return {
        id: docRef.id,
        ...poData,
        supplier: supplierData,
        totalGross: totalGross,
        // Bezpieczna konwersja dat zamiast bezpośredniego wywołania toDate()
        orderDate: safeConvertDate(poData.orderDate),
        expectedDeliveryDate: safeConvertDate(poData.expectedDeliveryDate),
        createdAt: safeConvertDate(poData.createdAt),
        updatedAt: safeConvertDate(poData.updatedAt)
      };
    });
    
    // Cache wynik przed zwróceniem - ale nie cache'uj wyników wyszukiwania
    const result = {
      data: purchaseOrders,
      pagination: {
        totalItems: totalCount,
        totalPages: totalPages,
        currentPage: safePageNum,
        itemsPerPage: itemsLimit
      }
    };
    
    if (shouldUseCache) {
      searchCache.set(cacheKey, result);
      console.log('Zapisano wyniki do cache');
    } else {
      console.log('Wyniki wyszukiwania nie zostały zapisane do cache');
    }
    
    return result;
  } catch (error) {
    console.error('Błąd podczas pobierania zamówień zakupowych z paginacją:', error);
    throw error;
  }
};

export const getPurchaseOrderById = async (id) => {
  try {
    const purchaseOrderDoc = await getDoc(doc(db, PURCHASE_ORDERS_COLLECTION, id));
    
    if (!purchaseOrderDoc.exists()) {
      throw new Error(`Nie znaleziono zamówienia zakupowego o ID ${id}`);
    }
    
    const poData = purchaseOrderDoc.data();
    console.log("Dane PO z bazy:", poData);
    
    // Pobierz dane dostawcy, tylko jeśli zamówienie ma referencję do dostawcy
    // i nie zawiera już pełnych danych dostawcy
    let supplierData = null;
    if (poData.supplier && poData.supplier.id) {
      // Już mamy dane dostawcy w obiekcie zamówienia
      supplierData = poData.supplier;
    } else if (poData.supplierId) {
      // Pobierz dane dostawcy z bazy
      const supplierDoc = await getDoc(doc(db, SUPPLIERS_COLLECTION, poData.supplierId));
      if (supplierDoc.exists()) {
        supplierData = { id: supplierDoc.id, ...supplierDoc.data() };
      }
    }
    
    // Upewnij się, że wszystkie pola są poprawnie przekształcone - użyj destrukturyzacji z wartościami domyślnymi
    // aby uniknąć wielu operacji
    const result = {
      id: purchaseOrderDoc.id,
      ...poData,
      supplier: supplierData,
      number: poData.number || '',
      items: poData.items || [],
      totalValue: poData.totalValue || 0,
      totalGross: poData.totalGross || 0,
      vatRate: poData.vatRate || 23,
      currency: poData.currency || 'EUR',
      targetWarehouseId: poData.targetWarehouseId || '',
      deliveryAddress: poData.deliveryAddress || '',
      notes: poData.notes || '',
      status: poData.status || 'draft',
      // Bezpieczna konwersja dat
      orderDate: safeConvertDate(poData.orderDate),
      expectedDeliveryDate: safeConvertDate(poData.expectedDeliveryDate),
      createdAt: safeConvertDate(poData.createdAt),
      updatedAt: safeConvertDate(poData.updatedAt)
    };
    
    console.log("Pobrane PO (po konwersji):", result);
    return result;
  } catch (error) {
    console.error(`Błąd podczas pobierania zamówienia zakupowego o ID ${id}:`, error);
    throw error;
  }
};

// Funkcja do generowania numerów zamówień
export const generateOrderNumber = async (prefix) => {
  try {
    // Użyj funkcji generatePONumber z numberGenerators.js, która tworzy numery w formacie PO00001
    const { generatePONumber } = await import('../utils/numberGenerators');
    return await generatePONumber();
    
    // Poniższy kod jest zakomentowany, ponieważ używamy teraz starego formatu bez roku
    /*
    const now = new Date();
    const year = now.getFullYear();
    
    // Pobierz listę zamówień z tego roku, aby ustalić numer
    const q = query(
      collection(db, PURCHASE_ORDERS_COLLECTION),
      where('number', '>=', `${prefix}-${year}-`),
      where('number', '<=', `${prefix}-${year}-9999`)
    );
    
    const querySnapshot = await getDocs(q);
    const ordersCount = querySnapshot.size;
    const orderNumber = `${prefix}-${year}-${(ordersCount + 1).toString().padStart(4, '0')}`;
    
    return orderNumber;
    */
  } catch (error) {
    console.error('Błąd podczas generowania numeru zamówienia:', error);
    throw error;
  }
};

export const createPurchaseOrder = async (purchaseOrderData, userId) => {
  try {
    const { 
      supplier, 
      items = [], 
      currency = 'EUR', 
      additionalCostsItems = [], 
      additionalCosts = 0,
      status = 'draft', 
      targetWarehouseId = '',
      orderDate = new Date(),
      expectedDeliveryDate,
      deliveryAddress = '',
      notes = '',
      totalValue,
      totalGross,
      totalVat,
      // Nowe pola dla załączników
      attachments = [], // Stare pole dla kompatybilności
      coaAttachments = [], // Certyfikaty analizy
      invoiceAttachments = [], // Załączniki faktur
      generalAttachments = [] // Ogólne załączniki
    } = purchaseOrderData;

    // Generuj numer zamówienia
    const number = await generateOrderNumber('PO');
    
    // Obliczamy wartości VAT i brutto jeśli nie zostały dostarczone
    let calculatedTotalValue = totalValue;
    let calculatedTotalGross = totalGross;
    let calculatedTotalVat = totalVat;
    
    if (!calculatedTotalValue || !calculatedTotalGross || !calculatedTotalVat) {
      // Obliczanie wartości netto i VAT dla pozycji produktów
      let itemsNetTotal = 0;
      let itemsVatTotal = 0;
      
      for (const item of items) {
        const itemNet = parseFloat(item.totalPrice) || 0;
        itemsNetTotal += itemNet;
    
        // Obliczanie VAT dla pozycji na podstawie jej indywidualnej stawki VAT
        const vatRate = typeof item.vatRate === 'number' ? item.vatRate : 0;
        const itemVat = (itemNet * vatRate) / 100;
        itemsVatTotal += itemVat;
      }
      
      // Obliczanie wartości netto i VAT dla dodatkowych kosztów
      let additionalCostsNetTotal = 0;
      let additionalCostsVatTotal = 0;
      
      for (const cost of additionalCostsItems) {
        const costNet = parseFloat(cost.value) || 0;
        additionalCostsNetTotal += costNet;
        
        // Obliczanie VAT dla dodatkowego kosztu na podstawie jego indywidualnej stawki VAT
        const vatRate = typeof cost.vatRate === 'number' ? cost.vatRate : 0;
        const costVat = (costNet * vatRate) / 100;
        additionalCostsVatTotal += costVat;
      }
      
      // Dla wstecznej kompatybilności - obsługa starego pola additionalCosts
      if (additionalCosts > 0 && (!additionalCostsItems || additionalCostsItems.length === 0)) {
        additionalCostsNetTotal += parseFloat(additionalCosts) || 0;
      }
      
      // Suma wartości netto: produkty + dodatkowe koszty
      calculatedTotalValue = itemsNetTotal + additionalCostsNetTotal;
      
      // Suma VAT: VAT od produktów + VAT od dodatkowych kosztów
      calculatedTotalVat = itemsVatTotal + additionalCostsVatTotal;
      
      // Wartość brutto: suma netto + suma VAT
      calculatedTotalGross = calculatedTotalValue + calculatedTotalVat;
    }
    
    // Zapisujemy tylko ID dostawcy, a nie cały obiekt - z zabezpieczeniem przed undefined
    const supplierId = supplier?.id || null;
    
    // Bezpieczna konwersja dat do obiektów Date
    const safeConvertToDate = (value) => {
      if (!value) return null;
      
      try {
        // Jeśli to już obiekt Date, zwróć go
        if (value instanceof Date) return value;
        
        // Jeśli to string, konwertuj na Date
        if (typeof value === 'string') return new Date(value);
        
        // Jeśli to Timestamp, użyj toDate()
        if (value && value.toDate && typeof value.toDate === 'function') return value.toDate();
        
        return null;
      } catch (error) {
        console.error("Błąd konwersji daty:", error);
        return null;
      }
    };
    
    // Przygotuj obiekt zamówienia zakupowego
    const newPurchaseOrder = {
      number,
      supplierId,
      items,
      totalValue: calculatedTotalValue,
      totalGross: calculatedTotalGross, // Wartość brutto
      totalVat: calculatedTotalVat, // Wartość VAT (nowe pole)
      additionalCostsItems,
      currency,
      status,
      targetWarehouseId,
      orderDate: safeConvertToDate(orderDate) || new Date(),
      expectedDeliveryDate: safeConvertToDate(expectedDeliveryDate),
      deliveryAddress,
      notes,
      // Załączniki - zarówno stare jak i nowe pola
      attachments,
      coaAttachments,
      invoiceAttachments,
      generalAttachments,
      createdBy: userId,
      updatedBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    // Dodaj zamówienie do bazy danych
    const docRef = await addDoc(collection(db, PURCHASE_ORDERS_COLLECTION), newPurchaseOrder);
    
    // Konwersja Date na ISO string dla zwróconych danych
    const result = {
      id: docRef.id,
      ...newPurchaseOrder,
      supplier: supplier, // Dodajemy pełny obiekt dostawcy dla interfejsu
      orderDate: safeConvertDate(newPurchaseOrder.orderDate),
      expectedDeliveryDate: safeConvertDate(newPurchaseOrder.expectedDeliveryDate),
      createdAt: new Date().toISOString(), // serverTimestamp nie zwraca wartości od razu
      updatedAt: new Date().toISOString()
    };
    
    console.log("Nowe PO - wynik:", result);
    
    // Wyczyść cache po utworzeniu nowego zamówienia
    searchCache.clear();
    clearLimitedPOCache();
    
    return result;
  } catch (error) {
    console.error('Błąd podczas tworzenia zamówienia zakupowego:', error);
    throw error;
  }
};

/**
 * Aktualizuje istniejące zamówienie zakupowe
 * @param {string} purchaseOrderId - ID zamówienia, które ma być zaktualizowane
 * @param {Object} updatedData - Dane do aktualizacji
 * @returns {Promise<Object>} - Zaktualizowane zamówienie
 */
export const updatePurchaseOrder = async (purchaseOrderId, updatedData, userId = null) => {
  try {
    if (!purchaseOrderId) {
      throw new Error('ID zamówienia zakupowego jest wymagane');
    }

    // Pobierz referencję do dokumentu
    const purchaseOrderRef = doc(db, PURCHASE_ORDERS_COLLECTION, purchaseOrderId);
    
    // Pobierz aktualne dane zamówienia
    const poDoc = await getDoc(purchaseOrderRef);
    
    if (!poDoc.exists()) {
      throw new Error(`Nie znaleziono zamówienia zakupowego o ID ${purchaseOrderId}`);
    }
    
    // Zapisz stare dane przed aktualizacją
    const oldPoData = poDoc.data();
    
    // Aktualizuj dokument
    await updateDoc(purchaseOrderRef, {
      ...updatedData,
      updatedAt: serverTimestamp(),
      updatedBy: userId || 'system'
    });
    
    // Pobierz pełne dane po aktualizacji
    const updatedPoDoc = await getDoc(purchaseOrderRef);
    const newPoData = updatedPoDoc.data();
    
    // Sprawdź czy zaktualizowano pozycje z cenami jednostkowymi
    const hasItemsUpdate = updatedData.items !== undefined;
    
    // Jeśli zaktualizowano pozycje, sprawdź zmiany cen jednostkowych
    if (hasItemsUpdate) {
      console.log('Wykryto aktualizację pozycji, sprawdzam zmiany cen jednostkowych');
      await updateBatchBasePricesOnUnitPriceChange(purchaseOrderId, oldPoData, newPoData, userId || 'system');
    }
    
    // Jeśli zaktualizowano dodatkowe koszty, zaktualizuj również powiązane partie
    const hasAdditionalCostsUpdate = updatedData.additionalCostsItems !== undefined || 
                                     updatedData.additionalCosts !== undefined;
    
    if (hasAdditionalCostsUpdate) {
      console.log('Wykryto aktualizację dodatkowych kosztów, aktualizuję ceny partii');
      // Aktualizuj ceny w powiązanych partiach
      await updateBatchPricesWithAdditionalCosts(purchaseOrderId, newPoData, userId || 'system');
    }
    
    // Wyczyść cache po aktualizacji
    searchCache.invalidateForOrder(purchaseOrderId);
    clearLimitedPOCache();
    
    // Pobierz zaktualizowane dane
    return await getPurchaseOrderById(purchaseOrderId);
  } catch (error) {
    console.error(`Błąd podczas aktualizacji zamówienia ${purchaseOrderId}:`, error);
    throw error;
  }
};

export const deletePurchaseOrder = async (id) => {
  try {
    const purchaseOrderRef = doc(db, PURCHASE_ORDERS_COLLECTION, id);
    
    // Sprawdź, czy zamówienie istnieje
    const docSnap = await getDoc(purchaseOrderRef);
    if (!docSnap.exists()) {
      throw new Error(`Nie znaleziono zamówienia zakupowego o ID ${id}`);
    }
    
    // Usuń zamówienie z bazy danych
    await deleteDoc(purchaseOrderRef);
    
    // Wyczyść cache dotyczące tego zamówienia
    searchCache.invalidateForOrder(id);
    clearLimitedPOCache();
    
    return { id };
  } catch (error) {
    console.error(`Błąd podczas usuwania zamówienia zakupowego o ID ${id}:`, error);
    throw error;
  }
};

export const updatePurchaseOrderStatus = async (purchaseOrderId, newStatus, userId) => {
  try {
    const poRef = doc(db, PURCHASE_ORDERS_COLLECTION, purchaseOrderId);
    const poSnapshot = await getDoc(poRef);
    
    if (!poSnapshot.exists()) {
      throw new Error('Zamówienie zakupowe nie istnieje');
    }
    
    const poData = poSnapshot.data();
    const oldStatus = poData.status;
    
    // Aktualizuj tylko jeśli status faktycznie się zmienił
    if (oldStatus !== newStatus) {
      // Dodanie historii zmian statusu
      const statusHistory = poData.statusHistory || [];
      const now = new Date();
      const statusChange = {
        oldStatus: oldStatus || 'Szkic',
        newStatus: newStatus,
        changedBy: userId,
        changedAt: now.toISOString()
      };
      
      const updateFields = {
        status: newStatus,
        updatedBy: userId,
        updatedAt: serverTimestamp(),
        statusHistory: [...statusHistory, statusChange]
      };
      
      // Jeśli status zmieniany jest na "delivered" (dostarczone)
      // dodaj pole z datą i godziną dostarczenia
      if (newStatus === PURCHASE_ORDER_STATUSES.DELIVERED) {
        updateFields.deliveredAt = serverTimestamp();
        updateFields.deliveredBy = userId;
        console.log(`Zamówienie ${purchaseOrderId} oznaczone jako dostarczone w dniu ${new Date().toLocaleDateString()} o godzinie ${new Date().toLocaleTimeString()}`);
      }

      // Jeśli status zmieniany jest na "completed" (zakończone)
      // dodaj pole z datą i godziną zakończenia
      if (newStatus === PURCHASE_ORDER_STATUSES.COMPLETED) {
        updateFields.completedAt = serverTimestamp();
        updateFields.completedBy = userId;
        console.log(`Zamówienie ${purchaseOrderId} oznaczone jako zakończone w dniu ${new Date().toLocaleDateString()} o godzinie ${new Date().toLocaleTimeString()}`);
      }
      
      await updateDoc(poRef, updateFields);

      // Sprawdź czy zmiana statusu wymaga powiadomień o dostawie PO z rezerwacjami
      try {
        const { shouldSendDeliveryNotification, handlePODeliveryNotification } = await import('./poDeliveryNotificationService');
        
        if (shouldSendDeliveryNotification(oldStatus, newStatus)) {
          console.log(`Sprawdzanie rezerwacji PO dla dostawy: ${poData.number || purchaseOrderId}`);
          const deliveryResult = await handlePODeliveryNotification(purchaseOrderId, userId);
          
          if (deliveryResult.notificationsSent > 0) {
            console.log(`Wysłano ${deliveryResult.notificationsSent} powiadomień o dostawie PO z rezerwacjami`);
          }
        }
      } catch (poNotificationError) {
        console.warn('Błąd podczas obsługi powiadomień o dostawie PO z rezerwacjami:', poNotificationError);
        // Nie przerywamy procesu - to dodatkowa funkcjonalność
      }

      // Uwaga: Automatyczna aktualizacja cen dostawców została przeniesiona do interfejsu użytkownika
      // gdzie użytkownik może zdecydować czy chce zaktualizować ceny przy zmianie statusu na 'completed'
      
      // Mapuj angielskie statusy na polskie
      const statusTranslations = {
        'draft': 'Szkic',
        'pending': 'Oczekujące',
        'approved': 'Zatwierdzone',
        'ordered': 'Zamówione',
        'partial': 'Częściowo dostarczone',
        'shipped': 'Wysłane',
        'delivered': 'Dostarczone',
        'cancelled': 'Anulowane',
        'completed': 'Zakończone',
        'confirmed': 'Potwierdzone'
      };
      
      const oldStatusPL = statusTranslations[oldStatus] || oldStatus || 'Szkic';
      const newStatusPL = statusTranslations[newStatus] || newStatus;
      
      // Spróbuj utworzyć powiadomienie w czasie rzeczywistym
      try {
        const { createRealtimeStatusChangeNotification } = require('./notificationService');
        
        // Powiadomienie wysyłamy nie tylko do użytkownika, który zmienił status,
        // ale do wszystkich administratorów
        // Tutaj można dodać logikę pobierania administratorów z DB
        const userIds = [userId]; // Tymczasowo tylko dla użytkownika zmieniającego
        
        await createRealtimeStatusChangeNotification(
          userIds,
          'purchaseOrder',
          purchaseOrderId,
          poData.number || purchaseOrderId.substring(0, 8),
          oldStatusPL,
          newStatusPL,
          userId // Przekazanie ID użytkownika, który zmienił status
        );
        
        console.log(`Utworzono powiadomienie o zmianie statusu zamówienia ${poData.number} z "${oldStatusPL}" na "${newStatusPL}"`);
      } catch (notificationError) {
        console.warn('Nie udało się utworzyć powiadomienia w czasie rzeczywistym:', notificationError);
        
        // Fallback do starego systemu powiadomień, jeśli Realtime Database nie zadziała
        try {
          const { createStatusChangeNotification } = require('./notificationService');
          await createStatusChangeNotification(
            userId,
            'purchaseOrder',
            purchaseOrderId,
            poData.number || purchaseOrderId.substring(0, 8),
            oldStatusPL,
            newStatusPL
          );
          
          console.log(`Utworzono powiadomienie (fallback) o zmianie statusu zamówienia ${poData.number}`);
        } catch (fallbackError) {
          console.warn('Nie udało się również utworzyć powiadomienia w Firestore:', fallbackError);
        }
      }
    }
    
    // Wyczyść cache dotyczące tego zamówienia
    searchCache.invalidateForOrder(purchaseOrderId);
    
    return { success: true, status: newStatus };
  } catch (error) {
    console.error('Błąd podczas aktualizacji statusu zamówienia zakupowego:', error);
    throw error;
  }
};

// Funkcje pomocnicze
export const getPurchaseOrdersByStatus = async (status) => {
  try {
    const q = query(
      collection(db, PURCHASE_ORDERS_COLLECTION), 
      where('status', '==', status),
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    const purchaseOrders = [];
    
    for (const docRef of querySnapshot.docs) {
      const poData = docRef.data();
      
      // Pobierz dane dostawcy
      let supplierData = null;
      if (poData.supplierId) {
        const supplierDoc = await getDoc(doc(db, SUPPLIERS_COLLECTION, poData.supplierId));
        if (supplierDoc.exists()) {
          supplierData = { id: supplierDoc.id, ...supplierDoc.data() };
        }
      }
      
      purchaseOrders.push({
        id: docRef.id,
        ...poData,
        supplier: supplierData,
        // Bezpieczna konwersja dat zamiast bezpośredniego wywołania toDate()
        orderDate: safeConvertDate(poData.orderDate),
        expectedDeliveryDate: safeConvertDate(poData.expectedDeliveryDate),
        createdAt: safeConvertDate(poData.createdAt),
        updatedAt: safeConvertDate(poData.updatedAt)
      });
    }
    
    return purchaseOrders;
  } catch (error) {
    console.error(`Błąd podczas pobierania zamówień zakupowych o statusie ${status}:`, error);
    throw error;
  }
};

export const getPurchaseOrdersBySupplier = async (supplierId) => {
  try {
    const q = query(
      collection(db, PURCHASE_ORDERS_COLLECTION), 
      where('supplierId', '==', supplierId),
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    const purchaseOrders = [];
    
    for (const docRef of querySnapshot.docs) {
      const poData = docRef.data();
      
      // Pobierz dane dostawcy
      let supplierData = null;
      if (poData.supplierId) {
        const supplierDoc = await getDoc(doc(db, SUPPLIERS_COLLECTION, poData.supplierId));
        if (supplierDoc.exists()) {
          supplierData = { id: supplierDoc.id, ...supplierDoc.data() };
        }
      }
      
      purchaseOrders.push({
        id: docRef.id,
        ...poData,
        supplier: supplierData,
        // Bezpieczna konwersja dat zamiast bezpośredniego wywołania toDate()
        orderDate: safeConvertDate(poData.orderDate),
        expectedDeliveryDate: safeConvertDate(poData.expectedDeliveryDate),
        createdAt: safeConvertDate(poData.createdAt),
        updatedAt: safeConvertDate(poData.updatedAt)
      });
    }
    
    return purchaseOrders;
  } catch (error) {
    console.error(`Błąd podczas pobierania zamówień zakupowych dla dostawcy o ID ${supplierId}:`, error);
    throw error;
  }
};

// Stałe dla statusów zamówień
export const PURCHASE_ORDER_STATUSES = {
  DRAFT: 'draft',
  PENDING: 'pending',
  APPROVED: 'approved',
  ORDERED: 'ordered',
  PARTIAL: 'partial',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
  CONFIRMED: 'confirmed'
};

// Stałe dla statusów płatności zamówień zakupowych
export const PURCHASE_ORDER_PAYMENT_STATUSES = {
  UNPAID: 'unpaid',
  PAID: 'paid'
};

// Funkcja do tłumaczenia statusów na język polski
export const translateStatus = (status) => {
  switch (status) {
    case 'draft': return 'Projekt';
    case 'ordered': return 'Zamówione';
    case 'shipped': return 'Wysłane';
    case 'partial': return 'Częściowo dostarczone';
    case 'delivered': return 'Dostarczone';
    case 'completed': return 'Zakończone';
    case 'cancelled': return 'Anulowane';
    // Zachowujemy obsługę ukrytych statusów dla istniejących zamówień
    case 'pending': return 'Oczekujące';
    case 'approved': return 'Zatwierdzone';
    case 'confirmed': return 'Potwierdzone';
    default: return status;
  }
};

// Funkcja do tłumaczenia statusów płatności na język polski
export const translatePaymentStatus = (status) => {
  switch (status) {
    case 'unpaid': return 'Nie opłacone';
    case 'paid': return 'Opłacone';
    default: return status;
  }
};

/**
 * Aktualizacja ilości odebranej dla danego produktu w zamówieniu zakupowym
 * @param {string} purchaseOrderId - ID zamówienia zakupowego
 * @param {string} itemId - ID produktu, który został odebrany
 * @param {number} receivedQuantity - Ilość odebranych produktów
 * @param {string} userId - ID użytkownika dokonującego aktualizacji
 * @returns {Promise<object>} - Zaktualizowane zamówienie zakupowe
 */
export const updatePurchaseOrderReceivedQuantity = async (purchaseOrderId, itemId, receivedQuantity, userId) => {
  try {
    if (!purchaseOrderId) {
      throw new Error('ID zamówienia zakupowego jest wymagane');
    }

    if (!itemId) {
      throw new Error('ID produktu jest wymagane');
    }

    if (!receivedQuantity || isNaN(receivedQuantity) || receivedQuantity <= 0) {
      throw new Error('Ilość odebrana musi być liczbą większą od zera');
    }

    // Pobierz bieżące zamówienie
    const poRef = doc(db, PURCHASE_ORDERS_COLLECTION, purchaseOrderId);
    const poDoc = await getDoc(poRef);

    if (!poDoc.exists()) {
      throw new Error(`Nie znaleziono zamówienia zakupowego o ID ${purchaseOrderId}`);
    }

    const poData = poDoc.data();
    
    // Sprawdź, czy zamówienie zawiera element o podanym ID
    if (!poData.items || !Array.isArray(poData.items)) {
      throw new Error('Zamówienie nie zawiera listy produktów');
    }

    let updatedItems = [...poData.items];
    let itemWasUpdated = false;
    
    console.log(`Próba aktualizacji PO ${purchaseOrderId}, produkt ${itemId}, ilość: ${receivedQuantity}`);
    
    // Najpierw sprawdź bezpośrednie dopasowanie po ID
    updatedItems = updatedItems.map(item => {
      if (item.id === itemId || 
          item.itemId === itemId || 
          item.inventoryItemId === itemId) {
        // Aktualizuj lub ustaw pole received
        const currentReceived = parseFloat(item.received || 0);
        const newReceived = currentReceived + parseFloat(receivedQuantity);
        
        // Oblicz procent realizacji zamówienia
        const ordered = parseFloat(item.quantity) || 0;
        const fulfilledPercentage = ordered > 0 ? (newReceived / ordered) * 100 : 0;
        
        itemWasUpdated = true;
        console.log(`Aktualizacja ilości w PO: ${item.name}, było ${currentReceived}, dodano ${receivedQuantity}, jest ${newReceived}`);
        
        return {
          ...item,
          received: newReceived,
          fulfilledPercentage: Math.min(fulfilledPercentage, 100) // Nie więcej niż 100%
        };
      }
      return item;
    });

    // Jeśli nie znaleziono po ID, spróbuj znaleźć element po nazwie produktu
    if (!itemWasUpdated) {
      try {
        const { getInventoryItemById } = await import('./inventory');
        const inventoryItem = await getInventoryItemById(itemId);
        
        if (inventoryItem && inventoryItem.name) {
          const productName = inventoryItem.name;
          console.log(`Szukanie dopasowania produktu po nazwie: ${productName}`);
          
          // Utwórz nową kopię tablicy items do aktualizacji
          let foundIndex = -1;
          
          // Znajdź produkt o pasującej nazwie
          for (let i = 0; i < updatedItems.length; i++) {
            if (updatedItems[i].name && 
                updatedItems[i].name.toLowerCase().includes(productName.toLowerCase())) {
              foundIndex = i;
              break;
            }
          }
          
          if (foundIndex >= 0) {
            // Aktualizuj pole received
            const currentReceived = parseFloat(updatedItems[foundIndex].received || 0);
            const newReceived = currentReceived + parseFloat(receivedQuantity);
            
            // Oblicz procent realizacji zamówienia
            const ordered = parseFloat(updatedItems[foundIndex].quantity) || 0;
            const fulfilledPercentage = ordered > 0 ? (newReceived / ordered) * 100 : 0;
            
            // Zaktualizuj element
            updatedItems[foundIndex] = {
              ...updatedItems[foundIndex],
              received: newReceived,
              fulfilledPercentage: Math.min(fulfilledPercentage, 100),
              // Dodaj również powiązanie z ID produktu magazynowego dla przyszłych aktualizacji
              inventoryItemId: itemId
            };
            
            itemWasUpdated = true;
            console.log(`Zaktualizowano element po nazwie produktu: ${productName}`);
          }
        }
      } catch (error) {
        console.error('Błąd podczas próby dopasowania produktu po nazwie:', error);
      }
    }

    // Jeśli dalej nie znaleziono, spróbuj dopasować po kodzie SKU
    if (!itemWasUpdated && poData.items.length > 0) {
      try {
        // Pobierz informacje o produkcie z magazynu
        const { getInventoryItemById } = await import('./inventory');
        const inventoryItem = await getInventoryItemById(itemId);
        
        if (inventoryItem && inventoryItem.sku) {
          // Spróbuj znaleźć produkt o tym samym SKU
          let foundIndex = -1;
          
          for (let i = 0; i < updatedItems.length; i++) {
            if (updatedItems[i].sku && inventoryItem.sku === updatedItems[i].sku) {
              foundIndex = i;
              break;
            }
          }
          
          if (foundIndex >= 0) {
            // Aktualizuj pole received
            const currentReceived = parseFloat(updatedItems[foundIndex].received || 0);
            const newReceived = currentReceived + parseFloat(receivedQuantity);
            
            // Oblicz procent realizacji zamówienia
            const ordered = parseFloat(updatedItems[foundIndex].quantity) || 0;
            const fulfilledPercentage = ordered > 0 ? (newReceived / ordered) * 100 : 0;
            
            // Zaktualizuj element
            updatedItems[foundIndex] = {
              ...updatedItems[foundIndex],
              received: newReceived,
              fulfilledPercentage: Math.min(fulfilledPercentage, 100),
              inventoryItemId: itemId
            };
            
            itemWasUpdated = true;
            console.log(`Zaktualizowano element po kodzie SKU: ${inventoryItem.sku}`);
          }
        }
      } catch (error) {
        console.error('Błąd podczas próby dopasowania produktu po SKU:', error);
      }
    }

    // Ostatnia próba - aktualizuj pierwszy element, jeśli jest tylko jeden
    if (!itemWasUpdated && poData.items.length === 1) {
      const singleItem = poData.items[0];
      const currentReceived = parseFloat(singleItem.received || 0);
      const newReceived = currentReceived + parseFloat(receivedQuantity);
      
      // Oblicz procent realizacji zamówienia
      const ordered = parseFloat(singleItem.quantity) || 0;
      const fulfilledPercentage = ordered > 0 ? (newReceived / ordered) * 100 : 0;
      
      updatedItems[0] = {
        ...singleItem,
        received: newReceived,
        fulfilledPercentage: Math.min(fulfilledPercentage, 100),
        inventoryItemId: itemId // Zapisz powiązanie
      };
      
      itemWasUpdated = true;
      console.log(`Zaktualizowano jedyny element w zamówieniu: ${singleItem.name || 'bez nazwy'}`);
    }

    if (!itemWasUpdated) {
      console.warn(`Nie znaleziono produktu o ID ${itemId} w zamówieniu zakupowym ${purchaseOrderId}`);
      // Zwracamy sukces=false zamiast rzucać wyjątek, aby nie przerywać procesu
      return { 
        success: false, 
        message: 'Nie znaleziono produktu w zamówieniu',
        id: purchaseOrderId
      };
    }

    // Zaktualizuj status zamówienia na podstawie stanu odbioru wszystkich przedmiotów
    let newStatus = poData.status;
    const allItemsFulfilled = updatedItems.every(item => {
      const received = parseFloat(item.received || 0);
      const quantity = parseFloat(item.quantity || 0);
      return received >= quantity;
    });

    const anyItemFulfilled = updatedItems.some(item => {
      const received = parseFloat(item.received || 0);
      return received > 0;
    });

    // Aktualizuj status na podstawie stanu odbioru
    const nonUpdateableStatuses = ['cancelled', 'completed'];
    
    if (!nonUpdateableStatuses.includes(poData.status)) {
      if (allItemsFulfilled) {
        newStatus = 'delivered';
      } else if (anyItemFulfilled) {
        newStatus = 'partial';
      }
    }

    // Dodaj historię zmian statusu, jeśli status się zmienia
    let statusHistory = poData.statusHistory || [];
    if (newStatus !== poData.status) {
      statusHistory = [
        ...statusHistory,
        {
          oldStatus: poData.status || 'Nieznany',
          newStatus: newStatus,
          changedBy: userId,
          changedAt: new Date().toISOString()
        }
      ];
    }

    // Przygotuj dane do aktualizacji
    const updateData = {
      items: updatedItems,
      status: newStatus,
      statusHistory: statusHistory,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    };

    // Aktualizuj dokument w bazie danych
    await updateDoc(poRef, updateData);

    // Wyczyść cache dotyczące tego zamówienia
    searchCache.invalidateForOrder(purchaseOrderId);

    // Zwróć zaktualizowane dane
    return {
      id: purchaseOrderId,
      success: true,
      items: updatedItems,
      status: newStatus
    };
  } catch (error) {
    console.error('Błąd podczas aktualizacji ilości odebranych produktów:', error);
    throw error;
  }
};

export const updatePurchaseOrderItems = async (purchaseOrderId, updatedItems, userId) => {
  try {
    // Sprawdź, czy zamówienie istnieje
    const purchaseOrderRef = doc(db, PURCHASE_ORDERS_COLLECTION, purchaseOrderId);
    const purchaseOrderSnap = await getDoc(purchaseOrderRef);
    
    if (!purchaseOrderSnap.exists()) {
      throw new Error(`Zamówienie zakupowe o ID ${purchaseOrderId} nie istnieje`);
    }
    
    const existingPO = purchaseOrderSnap.data();
    
    // Pobierz istniejące pozycje
    const existingItems = existingPO.items || [];
    
    // Zaktualizuj pozycje - zastępuj istniejące lub dodaj nowe
    const newItems = [...existingItems];
    
    // Dla każdej zaktualizowanej pozycji
    for (const updatedItem of updatedItems) {
      // Znajdź pozycję po ID
      const index = newItems.findIndex(item => item.id === updatedItem.id);
      
      if (index !== -1) {
        // Zaktualizuj istniejącą pozycję
        newItems[index] = {
          ...newItems[index],
          ...updatedItem
        };
      } else {
        // Dodaj nową pozycję
        newItems.push(updatedItem);
      }
    }
    
    // Obliczanie wartości netto i VAT dla zaktualizowanych pozycji
    let itemsNetTotal = 0;
    let itemsVatTotal = 0;
    
    for (const item of newItems) {
      const itemNet = parseFloat(item.totalPrice) || 0;
      itemsNetTotal += itemNet;
      
      // Obliczanie VAT dla pozycji na podstawie jej indywidualnej stawki VAT
      const vatRate = typeof item.vatRate === 'number' ? item.vatRate : 0;
      const itemVat = (itemNet * vatRate) / 100;
      itemsVatTotal += itemVat;
    }
    
    // Obliczanie wartości netto i VAT dla dodatkowych kosztów
    let additionalCostsNetTotal = 0;
    let additionalCostsVatTotal = 0;
    
    if (existingPO.additionalCostsItems && Array.isArray(existingPO.additionalCostsItems)) {
      for (const cost of existingPO.additionalCostsItems) {
        const costNet = parseFloat(cost.value) || 0;
        additionalCostsNetTotal += costNet;
        
        // Obliczanie VAT dla dodatkowego kosztu na podstawie jego indywidualnej stawki VAT
        const vatRate = typeof cost.vatRate === 'number' ? cost.vatRate : 0;
        const costVat = (costNet * vatRate) / 100;
        additionalCostsVatTotal += costVat;
      }
    } else if (existingPO.additionalCosts > 0) {
      // Dla wstecznej kompatybilności - obsługa starego pola additionalCosts
      additionalCostsNetTotal += parseFloat(existingPO.additionalCosts) || 0;
    }
    
    // Suma wartości netto: produkty + dodatkowe koszty
    const calculatedTotalValue = itemsNetTotal + additionalCostsNetTotal;
    
    // Suma VAT: VAT od produktów + VAT od dodatkowych kosztów
    const calculatedTotalVat = itemsVatTotal + additionalCostsVatTotal;
    
    // Wartość brutto: suma netto + suma VAT
    const calculatedTotalGross = calculatedTotalValue + calculatedTotalVat;
    
    // Przygotuj dane do aktualizacji
    const updateFields = {
      items: newItems,
      totalValue: calculatedTotalValue,
      totalGross: calculatedTotalGross,
      totalVat: calculatedTotalVat,
      updatedBy: userId,
      updatedAt: serverTimestamp()
    };
    
    // Aktualizuj dokument
    await updateDoc(purchaseOrderRef, updateFields);
    
    // Wyczyść cache dotyczące tego zamówienia
    searchCache.invalidateForOrder(purchaseOrderId);
    
    // Pobierz zaktualizowane dane zamówienia
    const updatedDocSnap = await getDoc(purchaseOrderRef);
    
    if (!updatedDocSnap.exists()) {
      throw new Error(`Nie można pobrać zaktualizowanego zamówienia o ID ${purchaseOrderId}`);
    }
    
    return {
      id: purchaseOrderId,
      ...updatedDocSnap.data(),
      updatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('Błąd podczas aktualizacji pozycji zamówienia zakupowego:', error);
    throw error;
  }
};

/**
 * Aktualizuje ceny jednostkowe partii powiązanych z zamówieniem zakupu po dodaniu dodatkowych kosztów
 * @param {string} purchaseOrderId - ID zamówienia zakupowego
 * @param {Object} poData - Dane zamówienia zakupowego
 * @param {string} userId - ID użytkownika dokonującego aktualizacji
 */
const updateBatchPricesWithAdditionalCosts = async (purchaseOrderId, poData, userId) => {
  try {
    console.log(`Aktualizuję ceny partii dla zamówienia ${purchaseOrderId}`);
    
    // Oblicz łączne dodatkowe koszty BRUTTO (z VAT)
    let additionalCostsGrossTotal = 0;
    
    // Z nowego formatu additionalCostsItems
    if (poData.additionalCostsItems && Array.isArray(poData.additionalCostsItems)) {
      additionalCostsGrossTotal = poData.additionalCostsItems.reduce((sum, cost) => {
        const net = parseFloat(cost.value) || 0;
        const vatRate = typeof cost.vatRate === 'number' ? cost.vatRate : 0;
        const vat = (net * vatRate) / 100;
        return sum + net + vat;
      }, 0);
    } 
    // Ze starego pola additionalCosts (dla kompatybilności, traktujemy jako brutto)
    else if (poData.additionalCosts) {
      additionalCostsGrossTotal = parseFloat(poData.additionalCosts) || 0;
    }
    
    // Jeśli brak dodatkowych kosztów, nie ma potrzeby aktualizacji
    if (additionalCostsGrossTotal <= 0) {
      console.log(`Brak dodatkowych kosztów do rozliczenia w zamówieniu ${purchaseOrderId}`);
      return;
    }
    
    // Pobierz wszystkie partie magazynowe powiązane z tym zamówieniem
    const { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
    const firebaseConfig = await import('./firebase/config');
    const db = firebaseConfig.db;
    const INVENTORY_BATCHES_COLLECTION = 'inventoryBatches'; // Używamy bezpośrednio nazwy kolekcji
    
    // Spróbuj znaleźć partie używając obu modeli danych
    let batchesToUpdate = [];
    
    // 1. Szukaj partii z polem purchaseOrderDetails.id równym ID zamówienia
    const batchesQuery = query(
      collection(db, INVENTORY_BATCHES_COLLECTION),
      where('purchaseOrderDetails.id', '==', purchaseOrderId)
    );
    
    const batchesSnapshot = await getDocs(batchesQuery);
    batchesSnapshot.forEach(doc => {
      batchesToUpdate.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    // 2. Szukaj partii używając starszego modelu danych
    if (batchesToUpdate.length === 0) {
      const oldFormatQuery = query(
        collection(db, INVENTORY_BATCHES_COLLECTION),
        where('sourceDetails.orderId', '==', purchaseOrderId)
      );
      
      const oldFormatSnapshot = await getDocs(oldFormatQuery);
      oldFormatSnapshot.forEach(doc => {
        batchesToUpdate.push({
          id: doc.id,
          ...doc.data()
        });
      });
    }
    
    // DEDUPLIKACJA: Usuń duplikaty partii (mogą pojawić się przy transferach)
    // Użyj Map z ID jako kluczem, aby zapewnić unikalność
    const uniqueBatchesMap = new Map();
    batchesToUpdate.forEach(batch => {
      // Jeśli partia o tym ID nie została jeszcze dodana lub ma nowszą datę aktualizacji, dodaj/zaktualizuj
      if (!uniqueBatchesMap.has(batch.id) || 
          (batch.updatedAt && (!uniqueBatchesMap.get(batch.id).updatedAt || 
          batch.updatedAt.toDate() > uniqueBatchesMap.get(batch.id).updatedAt.toDate()))) {
        uniqueBatchesMap.set(batch.id, batch);
      }
    });
    
    // Konwertuj z powrotem na tablicę
    batchesToUpdate = Array.from(uniqueBatchesMap.values());
    
    console.log(`Znaleziono ${batchesToUpdate.length} unikalnych partii powiązanych z zamówieniem ${purchaseOrderId}`);
    
    // Jeśli nie znaleziono partii, zakończ
    if (batchesToUpdate.length === 0) {
      console.log(`Nie znaleziono partii powiązanych z zamówieniem ${purchaseOrderId}`);
      return;
    }
    
    // Oblicz łączną ilość początkową wszystkich partii do rozdzielenia kosztów proporcjonalnie
    const totalInitialQuantity = batchesToUpdate.reduce((sum, batch) => {
      const initialQuantity = parseFloat(batch.initialQuantity) || parseFloat(batch.quantity) || 0;
      return sum + initialQuantity;
    }, 0);
    
    if (totalInitialQuantity <= 0) {
      console.log(`Brak poprawnych ilości początkowych w partiach do podziału kosztów w zamówieniu ${purchaseOrderId}`);
      return;
    }
    
    console.log(`Łączna ilość początkowa partii: ${totalInitialQuantity}, dodatkowe koszty: ${additionalCostsGrossTotal}`);
    
    // Aktualizuj każdą partię - teraz koszty są rozdzielane proporcjonalnie do initialQuantity partii
    const updatePromises = [];
    
    for (const batchData of batchesToUpdate) {
      const batchRef = doc(db, INVENTORY_BATCHES_COLLECTION, batchData.id);
      
      // Pobierz ilość początkową partii
      const batchInitialQuantity = parseFloat(batchData.initialQuantity) || parseFloat(batchData.quantity) || 0;
      
      // Zachowaj oryginalną cenę jako baseUnitPrice, jeśli nie jest już ustawiona
      const baseUnitPrice = batchData.baseUnitPrice !== undefined 
        ? batchData.baseUnitPrice 
        : batchData.unitPrice || 0;
      
      // Oblicz proporcjonalny udział dodatkowych kosztów dla tej partii
      const batchProportion = batchInitialQuantity / totalInitialQuantity;
      const batchAdditionalCostTotal = additionalCostsGrossTotal * batchProportion;
      
      // Oblicz dodatkowy koszt na jednostkę dla tej konkretnej partii
      const additionalCostPerUnit = batchInitialQuantity > 0 
        ? batchAdditionalCostTotal / batchInitialQuantity 
        : 0;
      
      // Ustawienie nowej ceny jednostkowej: cena bazowa + koszt dodatkowy na jednostkę
      const newUnitPrice = parseFloat(baseUnitPrice) + additionalCostPerUnit;
      
      console.log(`Aktualizuję partię ${batchData.id}: initialQuantity=${batchInitialQuantity}, proportion=${batchProportion}, additionalCostTotal=${batchAdditionalCostTotal}, additionalCostPerUnit=${additionalCostPerUnit}, basePrice=${baseUnitPrice}, newPrice=${newUnitPrice}`);
      
      // Aktualizuj dokument partii
      updatePromises.push(updateDoc(batchRef, {
        baseUnitPrice: parseFloat(baseUnitPrice),
        additionalCostPerUnit: additionalCostPerUnit,
        unitPrice: newUnitPrice,
        updatedAt: serverTimestamp(),
        updatedBy: userId
      }));
    }
    
    await Promise.all(updatePromises);
    console.log(`Zaktualizowano ceny ${updatePromises.length} partii`);
    
  } catch (error) {
    console.error(`Błąd podczas aktualizacji cen partii dla zamówienia ${purchaseOrderId}:`, error);
    throw error;
  }
};

// Eksportuję nową funkcję
export const updateBatchesForPurchaseOrder = async (purchaseOrderId, userId) => {
  try {
    // Pobierz dane zamówienia
    const poData = await getPurchaseOrderById(purchaseOrderId);
    if (!poData) {
      throw new Error(`Nie znaleziono zamówienia o ID ${purchaseOrderId}`);
    }
    
    // Aktualizuj ceny partii
    await updateBatchPricesWithAdditionalCosts(purchaseOrderId, poData, userId);
    
    // Wyczyść cache dotyczące tego zamówienia
    searchCache.invalidateForOrder(purchaseOrderId);
    
    return { success: true };
  } catch (error) {
    console.error('Błąd podczas aktualizacji partii dla zamówienia:', error);
    throw error;
  }
};

// Funkcja do czyszczenia cache ograniczonej listy zamówień
export const clearLimitedPOCache = () => {
  limitedPOCache = null;
  limitedPOCacheTimestamp = null;
  console.log('Wyczyszczono cache ograniczonej listy zamówień');
};

// Eksportuj funkcję do czyszczenia cache wyszukiwania
export const clearSearchCache = () => {
  searchCache.clearSearchCache();
};

// Eksportuj funkcję do czyszczenia całego cache
export const clearAllCache = () => {
  searchCache.clear();
  clearLimitedPOCache();
};

/**
 * Aktualizuje ceny bazowe partii powiązanych z zamówieniem przy zmianie cen jednostkowych pozycji
 * @param {string} purchaseOrderId - ID zamówienia zakupowego
 * @param {Object} oldPoData - Stare dane zamówienia zakupowego
 * @param {Object} newPoData - Nowe dane zamówienia zakupowego
 * @param {string} userId - ID użytkownika dokonującego aktualizacji
 */
const updateBatchBasePricesOnUnitPriceChange = async (purchaseOrderId, oldPoData, newPoData, userId) => {
  try {
    console.log(`Sprawdzam zmiany cen jednostkowych dla zamówienia ${purchaseOrderId}`);
    
    // Sprawdź czy są zmiany cen jednostkowych w pozycjach
    const oldItems = oldPoData.items || [];
    const newItems = newPoData.items || [];
    
    // Znajdź pozycje z zmienionymi cenami jednostkowymi
    const itemsWithPriceChanges = [];
    
    for (const newItem of newItems) {
      const oldItem = oldItems.find(item => 
        item.id === newItem.id || 
        item.inventoryItemId === newItem.inventoryItemId ||
        (item.name === newItem.name && item.inventoryItemId === newItem.inventoryItemId)
      );
      
      if (oldItem) {
        const oldUnitPrice = parseFloat(oldItem.unitPrice) || 0;
        const newUnitPrice = parseFloat(newItem.unitPrice) || 0;
        
        // Sprawdź czy cena się zmieniła (z tolerancją na błędy zaokrąglenia)
        if (Math.abs(oldUnitPrice - newUnitPrice) > 0.0001) {
          itemsWithPriceChanges.push({
            ...newItem,
            oldUnitPrice,
            newUnitPrice,
            priceDifference: newUnitPrice - oldUnitPrice
          });
          
          console.log(`Wykryto zmianę ceny dla pozycji ${newItem.name}: ${oldUnitPrice} -> ${newUnitPrice} (różnica: ${newUnitPrice - oldUnitPrice})`);
        }
      }
    }
    
    // Jeśli nie ma zmian cen, zakończ
    if (itemsWithPriceChanges.length === 0) {
      console.log(`Brak zmian cen jednostkowych w zamówieniu ${purchaseOrderId}`);
      return;
    }
    
    // Pobierz wszystkie partie magazynowe powiązane z tym zamówieniem
    const { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
    const firebaseConfig = await import('./firebase/config');
    const db = firebaseConfig.db;
    const INVENTORY_BATCHES_COLLECTION = 'inventoryBatches';
    
    // Znajdź partie używając obu modeli danych
    let batchesToUpdate = [];
    
    // 1. Szukaj partii z polem purchaseOrderDetails.id równym ID zamówienia
    const batchesQuery = query(
      collection(db, INVENTORY_BATCHES_COLLECTION),
      where('purchaseOrderDetails.id', '==', purchaseOrderId)
    );
    
    const batchesSnapshot = await getDocs(batchesQuery);
    batchesSnapshot.forEach(doc => {
      batchesToUpdate.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    // 2. Szukaj partii używając starszego modelu danych
    if (batchesToUpdate.length === 0) {
      const oldFormatQuery = query(
        collection(db, INVENTORY_BATCHES_COLLECTION),
        where('sourceDetails.orderId', '==', purchaseOrderId)
      );
      
      const oldFormatSnapshot = await getDocs(oldFormatQuery);
      oldFormatSnapshot.forEach(doc => {
        batchesToUpdate.push({
          id: doc.id,
          ...doc.data()
        });
      });
    }
    
    // DEDUPLIKACJA: Usuń duplikaty partii
    const uniqueBatchesMap = new Map();
    batchesToUpdate.forEach(batch => {
      if (!uniqueBatchesMap.has(batch.id) || 
          (batch.updatedAt && (!uniqueBatchesMap.get(batch.id).updatedAt || 
          batch.updatedAt.toDate() > uniqueBatchesMap.get(batch.id).updatedAt.toDate()))) {
        uniqueBatchesMap.set(batch.id, batch);
      }
    });
    
    batchesToUpdate = Array.from(uniqueBatchesMap.values());
    
    console.log(`Znaleziono ${batchesToUpdate.length} partii powiązanych z zamówieniem ${purchaseOrderId}`);
    
    if (batchesToUpdate.length === 0) {
      console.log(`Nie znaleziono partii powiązanych z zamówieniem ${purchaseOrderId}`);
      return;
    }
    
    // Aktualizuj partie - dopasuj do pozycji z zmienioną ceną
    const updatePromises = [];
    
    for (const batchData of batchesToUpdate) {
      // NAJPIERW: Spróbuj dopasować partię do konkretnej pozycji w zamówieniu używając itemPoId
      let matchingItem = null;
      
      // 1. Sprawdź czy partia ma zapisane itemPoId (ID konkretnej pozycji w zamówieniu)
      const batchItemPoId = batchData.purchaseOrderDetails?.itemPoId || batchData.sourceDetails?.itemPoId;
      
      if (batchItemPoId) {
        // Znajdź pozycję o dokładnie tym ID
        matchingItem = itemsWithPriceChanges.find(item => item.id === batchItemPoId);
        
        if (matchingItem) {
          console.log(`Dopasowano partię ${batchData.id} do pozycji ${matchingItem.name} (ID: ${matchingItem.id}) na podstawie itemPoId`);
        }
      }
      
      // 2. Jeśli nie znaleziono dopasowania po itemPoId, spróbuj starszej metody (tylko jako fallback)
      if (!matchingItem) {
        // Znajdź odpowiadającą pozycję w zamówieniu na podstawie inventoryItemId lub nazwy
        matchingItem = itemsWithPriceChanges.find(item => {
          // Sprawdź różne sposoby dopasowania
          return (
            (item.inventoryItemId && batchData.inventoryItemId === item.inventoryItemId) ||
            (item.itemId && batchData.itemId === item.itemId) ||
            (item.name && batchData.itemName === item.name) ||
            (item.name && batchData.name === item.name)
          );
        });
        
        if (matchingItem) {
          console.log(`Dopasowano partię ${batchData.id} do pozycji ${matchingItem.name} (ID: ${matchingItem.id}) na podstawie inventoryItemId/nazwy (fallback)`);
        }
      }
      
      if (matchingItem) {
        const batchRef = doc(db, INVENTORY_BATCHES_COLLECTION, batchData.id);
        
        // Aktualizuj cenę bazową partii na nową cenę jednostkową z pozycji
        const newBaseUnitPrice = matchingItem.newUnitPrice;
        
        // Zachowaj dodatkowy koszt na jednostkę jeśli istnieje
        const additionalCostPerUnit = parseFloat(batchData.additionalCostPerUnit) || 0;
        
        // Oblicz nową cenę końcową: nowa cena bazowa + dodatkowy koszt
        const newFinalUnitPrice = newBaseUnitPrice + additionalCostPerUnit;
        
        console.log(`Aktualizuję partię ${batchData.id} dla pozycji ${matchingItem.name}: basePrice ${batchData.baseUnitPrice || batchData.unitPrice} -> ${newBaseUnitPrice}, finalPrice -> ${newFinalUnitPrice}`);
        
        // Aktualizuj dokument partii
        updatePromises.push(updateDoc(batchRef, {
          baseUnitPrice: newBaseUnitPrice,
          unitPrice: newFinalUnitPrice,
          updatedAt: serverTimestamp(),
          updatedBy: userId
        }));
      } else {
        console.log(`Nie znaleziono dopasowania dla partii ${batchData.id} (itemPoId: ${batchItemPoId}, inventoryItemId: ${batchData.inventoryItemId})`);
      }
    }
    
    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
      console.log(`Zaktualizowano ceny bazowe ${updatePromises.length} partii na podstawie zmian cen pozycji`);
    } else {
      console.log(`Nie znaleziono partii do aktualizacji na podstawie zmian cen pozycji`);
    }
    
  } catch (error) {
    console.error(`Błąd podczas aktualizacji cen bazowych partii dla zamówienia ${purchaseOrderId}:`, error);
    throw error;
  }
}; 

// Eksportuję funkcję do aktualizacji cen bazowych przy zmianie cen pozycji
export const updateBatchBasePricesForPurchaseOrder = async (purchaseOrderId, userId) => {
  try {
    // Pobierz aktualne dane zamówienia
    const currentPoData = await getPurchaseOrderById(purchaseOrderId);
    if (!currentPoData) {
      throw new Error(`Nie znaleziono zamówienia o ID ${purchaseOrderId}`);
    }
    
    // Funkcja pomocnicza - nie mamy starych danych, więc sprawdzimy wszystkie partie
    console.log(`Ręczna aktualizacja cen bazowych partii dla zamówienia ${purchaseOrderId}`);
    
    // Pobierz wszystkie partie magazynowe powiązane z tym zamówieniem
    const { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
    const firebaseConfig = await import('./firebase/config');
    const db = firebaseConfig.db;
    const INVENTORY_BATCHES_COLLECTION = 'inventoryBatches';
    
    // Znajdź partie używając obu modeli danych
    let batchesToUpdate = [];
    
    // 1. Szukaj partii z polem purchaseOrderDetails.id równym ID zamówienia
    const batchesQuery = query(
      collection(db, INVENTORY_BATCHES_COLLECTION),
      where('purchaseOrderDetails.id', '==', purchaseOrderId)
    );
    
    const batchesSnapshot = await getDocs(batchesQuery);
    batchesSnapshot.forEach(doc => {
      batchesToUpdate.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    // 2. Szukaj partii używając starszego modelu danych
    if (batchesToUpdate.length === 0) {
      const oldFormatQuery = query(
        collection(db, INVENTORY_BATCHES_COLLECTION),
        where('sourceDetails.orderId', '==', purchaseOrderId)
      );
      
      const oldFormatSnapshot = await getDocs(oldFormatQuery);
      oldFormatSnapshot.forEach(doc => {
        batchesToUpdate.push({
          id: doc.id,
          ...doc.data()
        });
      });
    }
    
    // DEDUPLIKACJA
    const uniqueBatchesMap = new Map();
    batchesToUpdate.forEach(batch => {
      if (!uniqueBatchesMap.has(batch.id)) {
        uniqueBatchesMap.set(batch.id, batch);
      }
    });
    
    batchesToUpdate = Array.from(uniqueBatchesMap.values());
    
    console.log(`Znaleziono ${batchesToUpdate.length} partii powiązanych z zamówieniem ${purchaseOrderId}`);
    
    if (batchesToUpdate.length === 0) {
      console.log(`Nie znaleziono partii powiązanych z zamówieniem ${purchaseOrderId}`);
      return { success: true, updated: 0 };
    }
    
    // Aktualizuj partie - dopasuj do pozycji z zamówienia
    const updatePromises = [];
    const items = currentPoData.items || [];
    
    for (const batchData of batchesToUpdate) {
      // NAJPIERW: Spróbuj dopasować partię do konkretnej pozycji w zamówieniu używając itemPoId
      let matchingItem = null;
      
      // 1. Sprawdź czy partia ma zapisane itemPoId (ID konkretnej pozycji w zamówieniu)
      const batchItemPoId = batchData.purchaseOrderDetails?.itemPoId || batchData.sourceDetails?.itemPoId;
      
      if (batchItemPoId) {
        // Znajdź pozycję o dokładnie tym ID
        matchingItem = items.find(item => item.id === batchItemPoId);
        
        if (matchingItem) {
          console.log(`Ręczna aktualizacja: Dopasowano partię ${batchData.id} do pozycji ${matchingItem.name} (ID: ${matchingItem.id}) na podstawie itemPoId`);
        }
      }
      
      // 2. Jeśli nie znaleziono dopasowania po itemPoId, spróbuj starszej metody (tylko jako fallback)
      if (!matchingItem) {
        // Znajdź odpowiadającą pozycję w zamówieniu
        matchingItem = items.find(item => {
          return (
            (item.inventoryItemId && batchData.inventoryItemId === item.inventoryItemId) ||
            (item.itemId && batchData.itemId === item.itemId) ||
            (item.name && batchData.itemName === item.name) ||
            (item.name && batchData.name === item.name)
          );
        });
        
        if (matchingItem) {
          console.log(`Ręczna aktualizacja: Dopasowano partię ${batchData.id} do pozycji ${matchingItem.name} (ID: ${matchingItem.id}) na podstawie inventoryItemId/nazwy (fallback)`);
        }
      }
      
      if (matchingItem && matchingItem.unitPrice !== undefined) {
        const batchRef = doc(db, INVENTORY_BATCHES_COLLECTION, batchData.id);
        
        // Ustaw cenę bazową na aktualną cenę jednostkową z pozycji
        const newBaseUnitPrice = parseFloat(matchingItem.unitPrice) || 0;
        
        // Zachowaj dodatkowy koszt na jednostkę jeśli istnieje
        const additionalCostPerUnit = parseFloat(batchData.additionalCostPerUnit) || 0;
        
        // Oblicz nową cenę końcową: cena bazowa + dodatkowy koszt
        const newFinalUnitPrice = newBaseUnitPrice + additionalCostPerUnit;
        
        console.log(`Ręczna aktualizacja: Aktualizuję partię ${batchData.id} dla pozycji ${matchingItem.name}: basePrice -> ${newBaseUnitPrice}, finalPrice -> ${newFinalUnitPrice}`);
        
        // Aktualizuj dokument partii
        updatePromises.push(updateDoc(batchRef, {
          baseUnitPrice: newBaseUnitPrice,
          unitPrice: newFinalUnitPrice,
          updatedAt: serverTimestamp(),
          updatedBy: userId
        }));
      } else if (!matchingItem) {
        console.log(`Ręczna aktualizacja: Nie znaleziono dopasowania dla partii ${batchData.id} (itemPoId: ${batchItemPoId}, inventoryItemId: ${batchData.inventoryItemId})`);
      }
    }
    
    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
      console.log(`Zaktualizowano ceny bazowe ${updatePromises.length} partii`);
    }
    
    // Wyczyść cache dotyczące tego zamówienia
    searchCache.invalidateForOrder(purchaseOrderId);
    
    return { success: true, updated: updatePromises.length };
  } catch (error) {
    console.error('Błąd podczas ręcznej aktualizacji cen bazowych partii dla zamówienia:', error);
    throw error;
  }
};

// Cache dla ograniczonej listy zamówień
let limitedPOCache = null;
let limitedPOCacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minut

/**
 * Pobiera ograniczoną listę zamówień zakupowych dla edycji partii
 * Optymalizowana wersja - pobiera tylko niezbędne pola i ogranicza liczbę dokumentów
 * @returns {Promise<Array>} - Lista zamówień z podstawowymi danymi
 */
export const getLimitedPurchaseOrdersForBatchEdit = async () => {
  try {
    // Sprawdź cache
    const now = Date.now();
    if (limitedPOCache && limitedPOCacheTimestamp && (now - limitedPOCacheTimestamp < CACHE_DURATION)) {
      console.log('Używam danych z cache dla ograniczonej listy zamówień');
      return limitedPOCache;
    }
    // Pobierz tylko najnowsze 50 zamówień (większość edycji dotyczy najnowszych zamówień)
    const q = query(
      collection(db, PURCHASE_ORDERS_COLLECTION), 
      orderBy('createdAt', 'desc'),
      limit(50) // Ograniczenie do 50 najnowszych zamówień
    );
    
    const querySnapshot = await getDocs(q);
    const purchaseOrders = [];
    
    // Zbierz wszystkie unikalne ID dostawców
    const supplierIds = new Set();
    const docsData = [];
    
    querySnapshot.docs.forEach(docRef => {
      const poData = docRef.data();
      docsData.push({ id: docRef.id, data: poData });
      
      if (poData.supplierId) {
        supplierIds.add(poData.supplierId);
      }
    });
    
    // Pobierz wszystkich dostawców jednym zapytaniem batch
    const suppliersData = {};
    if (supplierIds.size > 0) {
      const supplierPromises = Array.from(supplierIds).map(async (supplierId) => {
        try {
          const supplierDoc = await getDoc(doc(db, SUPPLIERS_COLLECTION, supplierId));
          if (supplierDoc.exists()) {
            return { id: supplierDoc.id, ...supplierDoc.data() };
          }
          return null;
        } catch (error) {
          console.error(`Błąd podczas pobierania dostawcy ${supplierId}:`, error);
          return null;
        }
      });
      
      const suppliersResults = await Promise.all(supplierPromises);
      suppliersResults.forEach(supplier => {
        if (supplier) {
          suppliersData[supplier.id] = supplier;
        }
      });
    }
    
    // Przetwórz dokumenty z już pobranymi danymi dostawców
    docsData.forEach(({ id, data: poData }) => {
      purchaseOrders.push({
        id: id,
        number: poData.number,
        status: poData.status,
        supplier: suppliersData[poData.supplierId] || null,
        // Tylko podstawowe daty - bez kosztownych obliczeń
        orderDate: safeConvertDate(poData.orderDate),
        createdAt: safeConvertDate(poData.createdAt),
        // Tylko podstawowe pola potrzebne do wyświetlenia
        items: poData.items || [],
        supplierId: poData.supplierId
      });
    });
    
    // Zapisz do cache
    limitedPOCache = purchaseOrders;
    limitedPOCacheTimestamp = now;
    console.log(`Pobrano i zapisano do cache ${purchaseOrders.length} zamówień dla edycji partii`);
    
    return purchaseOrders;
  } catch (error) {
    console.error('Błąd podczas pobierania ograniczonej listy zamówień zakupowych:', error);
    throw error;
  }
};

/**
 * Aktualizacja statusu płatności zamówienia zakupowego
 * @param {string} purchaseOrderId - ID zamówienia zakupowego
 * @param {string} newPaymentStatus - Nowy status płatności ('paid' lub 'unpaid')
 * @param {string} userId - ID użytkownika dokonującego zmiany
 * @returns {Promise<object>} - Wynik operacji
 */
export const updatePurchaseOrderPaymentStatus = async (purchaseOrderId, newPaymentStatus, userId) => {
  try {
    if (!purchaseOrderId) {
      throw new Error('ID zamówienia zakupowego jest wymagane');
    }

    if (!newPaymentStatus) {
      throw new Error('Nowy status płatności jest wymagany');
    }

    if (!Object.values(PURCHASE_ORDER_PAYMENT_STATUSES).includes(newPaymentStatus)) {
      throw new Error(`Nieprawidłowy status płatności: ${newPaymentStatus}`);
    }

    // Pobierz aktualne dane zamówienia
    const poRef = doc(db, PURCHASE_ORDERS_COLLECTION, purchaseOrderId);
    const poDoc = await getDoc(poRef);
    
    if (!poDoc.exists()) {
      throw new Error(`Nie znaleziono zamówienia zakupowego o ID ${purchaseOrderId}`);
    }

    const poData = poDoc.data();
    const oldPaymentStatus = poData.paymentStatus || PURCHASE_ORDER_PAYMENT_STATUSES.UNPAID;
    
    // Jeśli status się nie zmienił, nie rób nic
    if (oldPaymentStatus === newPaymentStatus) {
      return { success: true, paymentStatus: newPaymentStatus, message: 'Status płatności nie zmienił się' };
    }

    const updateFields = {
      paymentStatus: newPaymentStatus,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    };

    // Dodaj wpis do historii zmian statusu płatności
    const paymentStatusHistory = poData.paymentStatusHistory || [];
    const now = new Date();
    paymentStatusHistory.push({
      from: oldPaymentStatus,
      to: newPaymentStatus,
      changedBy: userId,
      changedAt: now,
      timestamp: now.toISOString()
    });

    updateFields.paymentStatusHistory = paymentStatusHistory;

    // Aktualizuj dokument
    await updateDoc(poRef, updateFields);

    console.log(`Zaktualizowano status płatności zamówienia ${purchaseOrderId} z "${oldPaymentStatus}" na "${newPaymentStatus}"`);

    // Wyczyść cache dotyczące tego zamówienia
    searchCache.invalidateForOrder(purchaseOrderId);

    return { 
      success: true, 
      paymentStatus: newPaymentStatus,
      oldPaymentStatus,
      message: 'Status płatności został zaktualizowany'
    };
  } catch (error) {
    console.error('Błąd podczas aktualizacji statusu płatności zamówienia zakupowego:', error);
    throw error;
  }
};

/**
 * Aktualizuje załączniki zamówienia zakupowego w bazie danych
 * @param {string} purchaseOrderId - ID zamówienia zakupowego
 * @param {Object} attachments - Obiekt z załącznikami {coaAttachments, invoiceAttachments, generalAttachments}
 * @param {string} userId - ID użytkownika wykonującego aktualizację
 * @returns {Promise<void>}
 */
export const updatePurchaseOrderAttachments = async (purchaseOrderId, attachments, userId) => {
  try {
    if (!purchaseOrderId) {
      throw new Error('ID zamówienia zakupowego jest wymagane');
    }

    const poRef = doc(db, PURCHASE_ORDERS_COLLECTION, purchaseOrderId);
    
    // Sprawdź czy zamówienie istnieje
    const poDoc = await getDoc(poRef);
    if (!poDoc.exists()) {
      throw new Error(`Nie znaleziono zamówienia zakupowego o ID ${purchaseOrderId}`);
    }

    const updateFields = {
      coaAttachments: attachments.coaAttachments || [],
      invoiceAttachments: attachments.invoiceAttachments || [],
      generalAttachments: attachments.generalAttachments || [],
      // Aktualizuj także stare pole dla kompatybilności
      attachments: [
        ...(attachments.coaAttachments || []),
        ...(attachments.invoiceAttachments || []),
        ...(attachments.generalAttachments || [])
      ],
      updatedAt: serverTimestamp(),
      updatedBy: userId
    };

    // Aktualizuj dokument
    await updateDoc(poRef, updateFields);

    console.log(`Zaktualizowano załączniki zamówienia ${purchaseOrderId}`);

    // Wyczyść cache dotyczące tego zamówienia
    if (searchCache.invalidateForOrder) {
      searchCache.invalidateForOrder(purchaseOrderId);
    }

    return { 
      success: true, 
      message: 'Załączniki zostały zaktualizowane'
    };
  } catch (error) {
    console.error('Błąd podczas aktualizacji załączników zamówienia zakupowego:', error);
    throw error;
  }
};

/**
 * Sprawdza istnienie załączników w Firebase Storage i usuwa nieistniejące z bazy danych
 * @param {string} purchaseOrderId - ID zamówienia zakupowego
 * @param {string} userId - ID użytkownika wykonującego operację
 * @returns {Promise<Object>} - Wynik operacji z informacjami o usuniętych załącznikach
 */
export const validateAndCleanupAttachments = async (purchaseOrderId, userId) => {
  try {
    if (!purchaseOrderId) {
      throw new Error('ID zamówienia zakupowego jest wymagane');
    }

    // Pobierz aktualne dane zamówienia
    const poRef = doc(db, PURCHASE_ORDERS_COLLECTION, purchaseOrderId);
    const poDoc = await getDoc(poRef);
    
    if (!poDoc.exists()) {
      throw new Error(`Nie znaleziono zamówienia zakupowego o ID ${purchaseOrderId}`);
    }

    const poData = poDoc.data();
    
    // Pobierz wszystkie kategorie załączników
    const coaAttachments = poData.coaAttachments || [];
    const invoiceAttachments = poData.invoiceAttachments || [];
    const generalAttachments = poData.generalAttachments || [];
    const oldAttachments = poData.attachments || [];

    // Funkcja sprawdzania istnienia pliku w Storage
    const checkFileExists = async (attachment) => {
      try {
        if (!attachment.storagePath) {
          console.warn(`Załącznik ${attachment.fileName} nie ma ścieżki storage`);
          return false;
        }
        
        const fileRef = ref(storage, attachment.storagePath);
        await getDownloadURL(fileRef); // Jeśli plik istnieje, to się powiedzie
        return true;
      } catch (error) {
        if (error.code === 'storage/object-not-found') {
          console.warn(`Plik nie istnieje w Storage: ${attachment.storagePath}`);
          return false;
        }
        // Inne błędy mogą oznaczać problemy z siecią, więc zachowujemy załącznik
        console.error(`Błąd podczas sprawdzania pliku ${attachment.storagePath}:`, error);
        return true; // Zachowaj załącznik w przypadku błędu sieci
      }
    };

    // Sprawdź każdą kategorię załączników
    const [validCoaAttachments, validInvoiceAttachments, validGeneralAttachments, validOldAttachments] = 
      await Promise.all([
        Promise.all(coaAttachments.map(async (attachment) => {
          const exists = await checkFileExists(attachment);
          return exists ? attachment : null;
        })),
        Promise.all(invoiceAttachments.map(async (attachment) => {
          const exists = await checkFileExists(attachment);
          return exists ? attachment : null;
        })),
        Promise.all(generalAttachments.map(async (attachment) => {
          const exists = await checkFileExists(attachment);
          return exists ? attachment : null;
        })),
        Promise.all(oldAttachments.map(async (attachment) => {
          const exists = await checkFileExists(attachment);
          return exists ? attachment : null;
        }))
      ]);

    // Filtruj null wartości (nieistniejące pliki)
    const cleanedCoaAttachments = validCoaAttachments.filter(attachment => attachment !== null);
    const cleanedInvoiceAttachments = validInvoiceAttachments.filter(attachment => attachment !== null);
    const cleanedGeneralAttachments = validGeneralAttachments.filter(attachment => attachment !== null);
    const cleanedOldAttachments = validOldAttachments.filter(attachment => attachment !== null);

    // Policz usunięte załączniki
    const removedCount = {
      coa: coaAttachments.length - cleanedCoaAttachments.length,
      invoice: invoiceAttachments.length - cleanedInvoiceAttachments.length,
      general: generalAttachments.length - cleanedGeneralAttachments.length,
      old: oldAttachments.length - cleanedOldAttachments.length
    };

    const totalRemoved = removedCount.coa + removedCount.invoice + removedCount.general + removedCount.old;

    // Aktualizuj bazę danych tylko jeśli coś zostało usunięte
    if (totalRemoved > 0) {
      const updateFields = {
        coaAttachments: cleanedCoaAttachments,
        invoiceAttachments: cleanedInvoiceAttachments,
        generalAttachments: cleanedGeneralAttachments,
        attachments: cleanedOldAttachments,
        updatedAt: serverTimestamp(),
        updatedBy: userId
      };

      await updateDoc(poRef, updateFields);

      console.log(`Usunięto ${totalRemoved} nieistniejących załączników z zamówienia ${purchaseOrderId}`);

      // Wyczyść cache dotyczące tego zamówienia
      if (searchCache.invalidateForOrder) {
        searchCache.invalidateForOrder(purchaseOrderId);
      }
    }

    return {
      success: true,
      removedCount,
      totalRemoved,
      updatedAttachments: {
        coaAttachments: cleanedCoaAttachments,
        invoiceAttachments: cleanedInvoiceAttachments,
        generalAttachments: cleanedGeneralAttachments,
        attachments: cleanedOldAttachments
      },
      message: totalRemoved > 0 
        ? `Usunięto ${totalRemoved} nieistniejących załączników`
        : 'Wszystkie załączniki są aktualne'
    };

  } catch (error) {
    console.error('Błąd podczas sprawdzania załączników:', error);
    throw error;
  }
};