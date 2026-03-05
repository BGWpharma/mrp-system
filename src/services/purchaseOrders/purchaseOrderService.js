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
  deleteField,
  limit as firebaseLimit,
  limit
} from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import { createNotification } from '../notificationService';
import { ServiceCacheManager } from '../cache/serviceCacheManager';

const PURCHASE_ORDERS_COLLECTION = 'purchaseOrders';
const SUPPLIERS_COLLECTION = 'suppliers';

const PO_CACHE_PREFIX = 'po:search:';
const PO_INV_SEARCH_PREFIX = 'po:inv-search:';
const PO_CACHE_TTL = 60 * 1000; // 60 sekund

const generatePOCacheKey = (page, itemsPerPage, sortField, sortOrder, filters) => {
  return PO_CACHE_PREFIX + JSON.stringify({
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
};

const invalidatePOCacheForOrder = (orderId) => {
  ServiceCacheManager.invalidateByPredicate(
    (key, data) => key.startsWith(PO_CACHE_PREFIX) && data?.data?.some(po => po.id === orderId)
  );
};

const clearAllPOCache = () => {
  ServiceCacheManager.invalidateByPrefix(PO_CACHE_PREFIX);
  ServiceCacheManager.invalidateByPrefix(PO_INV_SEARCH_PREFIX);
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
    const cacheKey = generatePOCacheKey(page, itemsPerPage, sortField, sortOrder, filters);
    
    const shouldUseCache = useCache && (!filters.searchTerm || filters.searchTerm.trim() === '');
    
    if (shouldUseCache && ServiceCacheManager.has(cacheKey)) {
      console.log('Używam danych z cache dla zapytania:', { page, itemsPerPage, sortField, sortOrder });
      return ServiceCacheManager.get(cacheKey);
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
          
          // NOWE: Wyszukiwanie po wartości (gdy searchTerm jest liczbą)
          const searchNumber = parseFloat(searchTerm.replace(',', '.').replace(/\s/g, ''));
          const isNumericSearch = !isNaN(searchNumber) && searchNumber > 0;
          
          if (isNumericSearch) {
            // Tolerancja dla porównania wartości (1% lub minimum 1 jednostka waluty)
            const tolerance = Math.max(searchNumber * 0.01, 1);
            
            // Wyszukiwanie po wartości całkowitej PO
            const totalGross = parseFloat(data.totalGross) || 0;
            const totalValue = parseFloat(data.totalValue) || 0;
            const totalNet = parseFloat(data.totalNet) || 0;
            
            if (Math.abs(totalGross - searchNumber) <= tolerance ||
                Math.abs(totalValue - searchNumber) <= tolerance ||
                Math.abs(totalNet - searchNumber) <= tolerance) {
              console.log(`✓ Znaleziono dopasowanie w wartości PO: ${data.number} (totalGross: ${totalGross})`);
              return true;
            }
            
            // Wyszukiwanie po wartości pozycji zamówienia
            if (data.items && Array.isArray(data.items) && data.items.some(item => {
              const itemTotalPrice = parseFloat(item.totalPrice) || 0;
              const itemUnitPrice = parseFloat(item.unitPrice) || 0;
              const itemNetValue = parseFloat(item.netValue) || 0;
              
              return Math.abs(itemTotalPrice - searchNumber) <= tolerance ||
                     Math.abs(itemUnitPrice - searchNumber) <= tolerance ||
                     Math.abs(itemNetValue - searchNumber) <= tolerance;
            })) {
              console.log(`✓ Znaleziono dopasowanie w wartości pozycji: ${data.number}`);
              return true;
            }
            
            // Wyszukiwanie po wartości dodatkowych kosztów
            if (data.additionalCostsItems && Array.isArray(data.additionalCostsItems) && data.additionalCostsItems.some(cost => {
              const costValue = parseFloat(cost.value) || 0;
              return Math.abs(costValue - searchNumber) <= tolerance;
            })) {
              console.log(`✓ Znaleziono dopasowanie w wartości kosztu dodatkowego: ${data.number}`);
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
            
            const cachedInvSearch = ServiceCacheManager.get(`${PO_INV_SEARCH_PREFIX}${inventoryCacheKey}`);
            if (cachedInvSearch) {
              matchingInventoryItemIds = cachedInvSearch;
              console.log(`Używam cache dla wyszukiwania pozycji magazynowych: ${matchingInventoryItemIds.size} pozycji`);
            }
            
            // Jeśli nie ma w cache lub cache wygasł, wykonaj wyszukiwanie
            if (matchingInventoryItemIds.size === 0) {
              try {
                // Importuj i użyj funkcji wyszukiwania pozycji magazynowych
                const { getAllInventoryItems } = await import('../inventory');
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
                  ServiceCacheManager.set(`${PO_INV_SEARCH_PREFIX}${inventoryCacheKey}`, matchingInventoryItemIds, PO_CACHE_TTL);
                  console.log(`Zapisano ${matchingInventoryItemIds.size} pozycji magazynowych w cache`);
                } else {
                  ServiceCacheManager.set(`${PO_INV_SEARCH_PREFIX}${inventoryCacheKey}`, new Set(), PO_CACHE_TTL);
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
      ServiceCacheManager.set(cacheKey, result, PO_CACHE_TTL);
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
    const { generatePONumber } = await import('../../utils/calculations');
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
      globalDiscount = 0, // Rabat globalny w procentach
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
      
      // Suma wartości netto przed rabatem: produkty + dodatkowe koszty
      const totalNetBeforeDiscount = itemsNetTotal + additionalCostsNetTotal;
      
      // Suma VAT przed rabatem: VAT od produktów + VAT od dodatkowych kosztów
      const totalVatBeforeDiscount = itemsVatTotal + additionalCostsVatTotal;
      
      // Wartość brutto przed rabatem: suma netto + suma VAT
      const totalGrossBeforeDiscount = totalNetBeforeDiscount + totalVatBeforeDiscount;
      
      // Obliczanie rabatu globalnego (stosowany do wartości brutto)
      const globalDiscountMultiplier = (100 - parseFloat(globalDiscount || 0)) / 100;
      
      // Końcowe wartości z uwzględnieniem rabatu globalnego
      calculatedTotalValue = totalNetBeforeDiscount * globalDiscountMultiplier;
      calculatedTotalVat = totalVatBeforeDiscount * globalDiscountMultiplier;
      calculatedTotalGross = totalGrossBeforeDiscount * globalDiscountMultiplier;
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
    
    // Automatycznie określ status płatności na podstawie pozycji
    const autoPaymentStatus = determinePaymentStatus(items, PURCHASE_ORDER_PAYMENT_STATUSES.UNPAID);
    
    // Przygotuj obiekt zamówienia zakupowego
    const newPurchaseOrder = {
      number,
      supplierId,
      items,
      totalValue: calculatedTotalValue,
      totalGross: calculatedTotalGross, // Wartość brutto
      totalVat: calculatedTotalVat, // Wartość VAT (nowe pole)
      additionalCostsItems,
      globalDiscount, // Rabat globalny w procentach
      currency,
      status,
      paymentStatus: autoPaymentStatus, // Automatycznie określony status płatności
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
    
    clearAllPOCache();
    clearLimitedPOCache();
    
    // Dodaj nowe zamówienie do zoptymalizowanego cache
    addPurchaseOrderToCache(result);
    
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
    
    // Przygotuj dane do aktualizacji z konwersją dat
    const dataToUpdate = {
      ...updatedData,
      updatedAt: serverTimestamp(),
      updatedBy: userId || 'system'
    };
    
    // Konwertuj daty jeśli istnieją w aktualizowanych danych
    if (updatedData.orderDate !== undefined) {
      dataToUpdate.orderDate = safeConvertToDate(updatedData.orderDate);
    }
    if (updatedData.expectedDeliveryDate !== undefined) {
      dataToUpdate.expectedDeliveryDate = safeConvertToDate(updatedData.expectedDeliveryDate);
    }
    
    // Jeśli aktualizujemy items, automatycznie zaktualizuj status płatności (jeśli nie jest już opłacone)
    if (updatedData.items && updatedData.paymentStatus !== PURCHASE_ORDER_PAYMENT_STATUSES.PAID) {
      const currentPaymentStatus = updatedData.paymentStatus || oldPoData.paymentStatus || PURCHASE_ORDER_PAYMENT_STATUSES.UNPAID;
      dataToUpdate.paymentStatus = determinePaymentStatus(updatedData.items, currentPaymentStatus);
    }
    
    // Aktualizuj dokument
    await updateDoc(purchaseOrderRef, dataToUpdate);
    
    // Pobierz pełne dane po aktualizacji
    const updatedPoDoc = await getDoc(purchaseOrderRef);
    const newPoData = updatedPoDoc.data();
    
    // Sprawdź czy zaktualizowano pozycje z cenami jednostkowymi
    const hasItemsUpdate = updatedData.items !== undefined;
    
    console.log(`🔍 [PO_UPDATE_DEBUG] Aktualizacja PO ${purchaseOrderId}:`, {
      hasItemsUpdate,
      hasOldData: !!oldPoData,
      oldItemsCount: oldPoData?.items?.length || 0,
      newItemsCount: newPoData?.items?.length || 0
    });
    
    // ============================================================================
    // WYŁĄCZONE: Cloud Functions obsługują aktualizację partii (onPurchaseOrderUpdate)
    // Cloud Function automatycznie wykryje zmiany w PO i zaktualizuje partie
    // ============================================================================
    console.log('ℹ️ [PO_UPDATE_DEBUG] Aktualizacja cen partii będzie wykonana przez Cloud Function (onPurchaseOrderUpdate)');
    
    /*
    // STARA LOGIKA (przed Cloud Functions): Zawsze aktualizuj ceny partii przy każdym zapisie PO
    console.log('🔄 [PO_UPDATE_DEBUG] Rozpoczynam automatyczną aktualizację cen partii przy zapisie PO');
    try {
      await updateBatchPricesOnAnySave(purchaseOrderId, newPoData, userId || 'system');
      console.log('✅ [PO_UPDATE_DEBUG] Pomyślnie zaktualizowano ceny partii przy zapisie PO');
    } catch (error) {
      console.error('❌ [PO_UPDATE_DEBUG] Błąd podczas aktualizacji cen partii przy zapisie:', error);
      // Nie przerywamy procesu zapisywania PO z powodu błędu aktualizacji partii
    }
    */
    
    // Aktualizuj ceny w rezerwacjach PO
    console.log('🔄 [PO_UPDATE_DEBUG] Rozpoczynam aktualizację cen w rezerwacjach PO');
    try {
      const { updatePOReservationsPricesOnPOChange } = await import('./poReservationService');
      const poResUpdateResult = await updatePOReservationsPricesOnPOChange(purchaseOrderId, newPoData, userId || 'system');
      console.log('✅ [PO_UPDATE_DEBUG] Pomyślnie zaktualizowano ceny w rezerwacjach PO:', poResUpdateResult);
    } catch (error) {
      console.error('❌ [PO_UPDATE_DEBUG] Błąd podczas aktualizacji cen w rezerwacjach PO:', error);
      // Nie przerywamy procesu zapisywania PO z powodu błędu aktualizacji rezerwacji
    }

    // Aktualizuj planowaną datę dostawy w rezerwacjach PO
    const hasDeliveryDateChange = updatedData.expectedDeliveryDate !== undefined ||
      (updatedData.items?.some(item => item.plannedDeliveryDate !== undefined));
    if (hasDeliveryDateChange) {
      try {
        const { updatePOReservationsDeliveryDateOnPOChange } = await import('./poReservationService');
        const dateUpdateResult = await updatePOReservationsDeliveryDateOnPOChange(purchaseOrderId, newPoData, userId || 'system');
        console.log('✅ [PO_UPDATE_DEBUG] Zaktualizowano daty dostawy w rezerwacjach PO:', dateUpdateResult);
      } catch (error) {
        console.error('❌ [PO_UPDATE_DEBUG] Błąd aktualizacji dat dostawy w rezerwacjach PO:', error);
      }
    }
    
    // WYŁĄCZONA STARA LOGIKA: Nowa funkcja updateBatchPricesOnAnySave już obsługuje wszystkie przypadki
    // Stara funkcja updateBatchBasePricesOnUnitPriceChange powodowała konflikty przy dopasowywaniu partii
    if (false && hasItemsUpdate) {
      console.log('🔍 [PO_UPDATE_DEBUG] WYŁĄCZONE: Stara logika weryfikacji zmian cen (zastąpiona przez updateBatchPricesOnAnySave)');
      try {
        await updateBatchBasePricesOnUnitPriceChange(purchaseOrderId, oldPoData, newPoData, userId || 'system');
      } catch (error) {
        console.warn('⚠️ [PO_UPDATE_DEBUG] Błąd podczas dodatkowej weryfikacji zmian cen:', error);
      }
    }
    
    // ============================================================================
    // WYŁĄCZONE: Cloud Functions obsługują aktualizację partii (onPurchaseOrderUpdate)
    // Dotyczy także aktualizacji dodatkowych kosztów
    // ============================================================================
    const hasAdditionalCostsUpdate = updatedData.additionalCostsItems !== undefined || 
                                     updatedData.additionalCosts !== undefined;
    
    if (hasAdditionalCostsUpdate) {
      console.log('ℹ️ [PO_UPDATE_DEBUG] Wykryto aktualizację dodatkowych kosztów - Cloud Function obsłuży aktualizację partii');
      /*
      // STARA LOGIKA (przed Cloud Functions)
      console.log('Wykryto aktualizację dodatkowych kosztów, aktualizuję ceny partii');
      await updateBatchPricesWithAdditionalCosts(purchaseOrderId, newPoData, userId || 'system');
      */
    }
    
    // Wyczyść cache po aktualizacji
    invalidatePOCacheForOrder(purchaseOrderId);
    clearLimitedPOCache();
    
    // Aktualizuj zamówienie w zoptymalizowanym cache
    updatePurchaseOrderInCache(purchaseOrderId, {
      ...updatedData,
      updatedAt: new Date()
    });
    
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
    invalidatePOCacheForOrder(id);
    clearLimitedPOCache();
    
    // Usuń zamówienie z zoptymalizowanego cache
    removePurchaseOrderFromCache(id);
    
    return { id };
  } catch (error) {
    console.error(`Błąd podczas usuwania zamówienia zakupowego o ID ${id}:`, error);
    throw error;
  }
};

/**
 * Sprawdza czy są pozycje z datą ważności krótszą niż 16 miesięcy od daty zamówienia
 * @param {Array} items - pozycje zamówienia
 * @param {Date|string} orderDate - data zamówienia
 * @returns {Array} - pozycje z krótką datą ważności
 */
export const checkShortExpiryItems = (items, orderDate) => {
  if (!items || !orderDate) return [];
  
  try {
    // Konwertuj orderDate na obiekt Date
    let orderDateObj;
    if (typeof orderDate === 'string') {
      orderDateObj = new Date(orderDate);
    } else if (orderDate instanceof Date) {
      orderDateObj = orderDate;
    } else if (orderDate && typeof orderDate.toDate === 'function') {
      orderDateObj = orderDate.toDate();
    } else {
      return [];
    }
    
    // Oblicz datę 16 miesięcy od daty zamówienia
    const sixteenMonthsLater = new Date(orderDateObj);
    sixteenMonthsLater.setMonth(orderDateObj.getMonth() + 16);
    
    // Sprawdź które pozycje mają datę ważności krótszą niż 16 miesięcy
    const shortExpiryItems = items.filter(item => {
      // Pomiń pozycje oznaczone jako "brak daty ważności"
      if (item.noExpiryDate === true) return false;
      
      if (!item.expiryDate) return false;
      
      let expiryDateObj;
      if (typeof item.expiryDate === 'string') {
        expiryDateObj = new Date(item.expiryDate);
      } else if (item.expiryDate instanceof Date) {
        expiryDateObj = item.expiryDate;
      } else if (item.expiryDate && typeof item.expiryDate.toDate === 'function') {
        expiryDateObj = item.expiryDate.toDate();
      } else {
        return false;
      }
      
      return expiryDateObj < sixteenMonthsLater;
    });
    
    return shortExpiryItems;
  } catch (error) {
    return [];
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
    
    // Walidacja daty ważności przy zmianie statusu z "szkic" na "zamówione"
    if (oldStatus === PURCHASE_ORDER_STATUSES.DRAFT && newStatus === PURCHASE_ORDER_STATUSES.ORDERED) {
      const itemsWithoutExpiryDate = poData.items?.filter(item => !item.expiryDate && !item.noExpiryDate) || [];
      if (itemsWithoutExpiryDate.length > 0) {
        throw new Error('Wszystkie pozycje muszą mieć określoną datę ważności lub być oznaczone jako "brak daty ważności" przed zmianą statusu na "Zamówione"');
      }
    }
    
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
        const { createRealtimeStatusChangeNotification } = require('../notificationService');
        
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
          const { createStatusChangeNotification } = require('../notificationService');
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
    invalidatePOCacheForOrder(purchaseOrderId);
    
    // Aktualizuj zamówienie w zoptymalizowanym cache
    updatePurchaseOrderInCache(purchaseOrderId, {
      status: newStatus,
      updatedAt: new Date()
    });
    
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
    
    // Batch fetch dostawców zamiast N+1 getDoc
    const supplierIds = [...new Set(
      querySnapshot.docs.map(d => d.data().supplierId).filter(Boolean)
    )];
    
    const supplierMap = {};
    if (supplierIds.length > 0) {
      const chunks = [];
      for (let i = 0; i < supplierIds.length; i += 30) {
        chunks.push(supplierIds.slice(i, i + 30));
      }
      const supplierResults = await Promise.all(
        chunks.map(chunk => {
          const sq = query(collection(db, SUPPLIERS_COLLECTION), where('__name__', 'in', chunk));
          return getDocs(sq);
        })
      );
      supplierResults.forEach(snap => {
        snap.docs.forEach(d => { supplierMap[d.id] = { id: d.id, ...d.data() }; });
      });
    }
    
    return querySnapshot.docs.map(docRef => {
      const poData = docRef.data();
      return {
        id: docRef.id,
        ...poData,
        supplier: poData.supplierId ? (supplierMap[poData.supplierId] || null) : null,
        orderDate: safeConvertDate(poData.orderDate),
        expectedDeliveryDate: safeConvertDate(poData.expectedDeliveryDate),
        createdAt: safeConvertDate(poData.createdAt),
        updatedAt: safeConvertDate(poData.updatedAt)
      };
    });
  } catch (error) {
    console.error(`Błąd podczas pobierania zamówień zakupowych o statusie ${status}:`, error);
    throw error;
  }
};

export const getPurchaseOrdersBySupplier = async (supplierId) => {
  try {
    // Pobierz dostawcę RAZ (supplierId jest zawsze taki sam w wynikach)
    let supplierData = null;
    if (supplierId) {
      const supplierDoc = await getDoc(doc(db, SUPPLIERS_COLLECTION, supplierId));
      if (supplierDoc.exists()) {
        supplierData = { id: supplierDoc.id, ...supplierDoc.data() };
      }
    }
    
    const q = query(
      collection(db, PURCHASE_ORDERS_COLLECTION), 
      where('supplierId', '==', supplierId),
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(docRef => {
      const poData = docRef.data();
      return {
        id: docRef.id,
        ...poData,
        supplier: supplierData,
        orderDate: safeConvertDate(poData.orderDate),
        expectedDeliveryDate: safeConvertDate(poData.expectedDeliveryDate),
        createdAt: safeConvertDate(poData.createdAt),
        updatedAt: safeConvertDate(poData.updatedAt)
      };
    });
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

export const KANBAN_COLUMN_ORDER = [
  'draft', 'ordered', 'shipped', 'partial', 'delivered', 'completed', 'cancelled'
];

export const KANBAN_COLUMN_COLORS = {
  draft: '#9E9E9E',
  pending: '#FF9800',
  approved: '#2196F3',
  ordered: '#3F51B5',
  confirmed: '#00BCD4',
  shipped: '#7C4DFF',
  delivered: '#4CAF50',
  partial: '#FFC107',
  completed: '#388E3C',
  cancelled: '#F44336'
};

const STATUS_TRANSITIONS = {
  draft:     ['ordered', 'cancelled'],
  pending:   ['ordered', 'cancelled', 'draft'],
  approved:  ['ordered', 'cancelled'],
  ordered:   ['shipped', 'delivered', 'partial', 'cancelled'],
  confirmed: ['shipped', 'delivered', 'partial', 'cancelled', 'ordered'],
  shipped:   ['delivered', 'partial', 'cancelled'],
  delivered: ['partial', 'completed', 'cancelled'],
  partial:   ['delivered', 'completed', 'cancelled'],
  completed: [],
  cancelled: ['draft']
};

export const validateStatusTransition = (currentStatus, newStatus) => {
  if (!currentStatus || !newStatus) return false;
  if (currentStatus === newStatus) return false;
  const allowed = STATUS_TRANSITIONS[currentStatus];
  return allowed ? allowed.includes(newStatus) : false;
};

export const getAlowedTransitions = (currentStatus) => {
  return STATUS_TRANSITIONS[currentStatus] || [];
};

// Stałe dla statusów płatności zamówień zakupowych
export const PURCHASE_ORDER_PAYMENT_STATUSES = {
  UNPAID: 'unpaid',
  TO_BE_PAID: 'to_be_paid',
  PARTIALLY_PAID: 'partially_paid',
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
    case 'to_be_paid': return 'Do zapłaty';
    case 'partially_paid': return 'Częściowo opłacone';
    case 'paid': return 'Opłacone';
    default: return status;
  }
};

/**
 * Oblicza najbliższą datę płatności z pozycji zamówienia
 * @param {Array} items - Pozycje zamówienia
 * @returns {Date|null} - Najbliższa data płatności lub null jeśli brak
 */
export const getNextPaymentDueDate = (items) => {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return [];
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Zbierz wszystkie daty płatności
  const dueDates = items
    .filter(item => item.paymentDueDate)
    .map(item => {
      try {
        let date;
        
        // Obsługa Firestore Timestamp
        if (item.paymentDueDate && typeof item.paymentDueDate.toDate === 'function') {
          date = item.paymentDueDate.toDate();
        } 
        // Obsługa stringa ISO lub obiektu Date
        else {
          date = new Date(item.paymentDueDate);
        }
        
        return !isNaN(date.getTime()) ? date : null;
      } catch (error) {
        return null;
      }
    })
    .filter(date => date !== null);

  if (dueDates.length === 0) {
    return [];
  }

  // Usuń duplikaty dat (porównując timestamp)
  const uniqueDates = [];
  const seenTimestamps = new Set();
  
  dueDates.forEach(date => {
    const timestamp = date.getTime();
    if (!seenTimestamps.has(timestamp)) {
      seenTimestamps.add(timestamp);
      uniqueDates.push(date);
    }
  });

  // Sortuj daty rosnąco (od najwcześniejszej)
  return uniqueDates.sort((a, b) => a - b);
};

/**
 * Automatycznie określa status płatności na podstawie pozycji zamówienia
 * @param {Array} items - Pozycje zamówienia
 * @param {string} currentPaymentStatus - Obecny status płatności
 * @returns {string} - Odpowiedni status płatności
 */
export const determinePaymentStatus = (items, currentPaymentStatus) => {
  // Jeśli już opłacone, zachowaj ten status
  if (currentPaymentStatus === PURCHASE_ORDER_PAYMENT_STATUSES.PAID) {
    return PURCHASE_ORDER_PAYMENT_STATUSES.PAID;
  }

  // Sprawdź czy jest jakakolwiek data płatności w pozycjach
  const hasPaymentDueDate = items && items.some(item => item.paymentDueDate);

  if (hasPaymentDueDate) {
    return PURCHASE_ORDER_PAYMENT_STATUSES.TO_BE_PAID;
  }

  return PURCHASE_ORDER_PAYMENT_STATUSES.UNPAID;
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
        const { getInventoryItemById } = await import('../inventory');
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
        const { getInventoryItemById } = await import('../inventory');
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
    invalidatePOCacheForOrder(purchaseOrderId);

    // Aktualizuj cache zamówień zakupu
    updatePurchaseOrderInCache(purchaseOrderId, {
      items: updatedItems,
      status: newStatus
    });

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
    invalidatePOCacheForOrder(purchaseOrderId);
    
    // Pobierz zaktualizowane dane zamówienia
    const updatedDocSnap = await getDoc(purchaseOrderRef);
    
    if (!updatedDocSnap.exists()) {
      throw new Error(`Nie można pobrać zaktualizowanego zamówienia o ID ${purchaseOrderId}`);
    }
    
    const updatedData = {
      id: purchaseOrderId,
      ...updatedDocSnap.data(),
      updatedAt: new Date().toISOString()
    };

    // Aktualizuj cache zamówień zakupu
    updatePurchaseOrderInCache(purchaseOrderId, updatedData);

    return updatedData;
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
    
    // Pobierz wszystkie partie magazynowe powiązane z tym zamówieniem
    const { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
    const firebaseConfig = await import('../firebase/config');
    const db = firebaseConfig.db;
    const INVENTORY_BATCHES_COLLECTION = 'inventoryBatches';
    
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
    
    console.log(`Znaleziono ${batchesToUpdate.length} unikalnych partii powiązanych z zamówieniem ${purchaseOrderId}`);
    
    if (batchesToUpdate.length === 0) {
      console.log(`Nie znaleziono partii powiązanych z zamówieniem ${purchaseOrderId}`);
      return;
    }
    
    // Mapa do przechowywania dodatkowych kosztów na jednostkę dla każdej partii
    const batchAdditionalCosts = new Map();
    
    // Inicjalizuj mapę - każda partia zaczyna z kosztem 0
    batchesToUpdate.forEach(batch => {
      batchAdditionalCosts.set(batch.id, 0);
    });
    
    // Przetwarzaj każdy dodatkowy koszt osobno
    const additionalCostsItems = poData.additionalCostsItems || [];
    
    // Obsługa starego formatu (dla kompatybilności wstecznej)
    if (poData.additionalCosts && (!additionalCostsItems || additionalCostsItems.length === 0)) {
      const oldFormatCost = parseFloat(poData.additionalCosts) || 0;
      if (oldFormatCost > 0) {
        additionalCostsItems.push({
          value: oldFormatCost,
          vatRate: 0,
          affectedItems: [] // Puste = wszystkie pozycje
        });
      }
    }
    
    // Przetwórz każdy dodatkowy koszt
    for (const cost of additionalCostsItems) {
      const costNet = parseFloat(cost.value) || 0;
      const vatRate = typeof cost.vatRate === 'number' ? cost.vatRate : 0;
      const costVat = (costNet * vatRate) / 100;
      const costGrossTotal = costNet + costVat;
      
      if (costGrossTotal <= 0) {
        continue; // Pomiń zerowe koszty
      }
      
      // Określ, które partie są objęte tym kosztem
      let affectedBatches = [];
      
      if (cost.affectedItems && Array.isArray(cost.affectedItems) && cost.affectedItems.length > 0) {
        // Koszt dotyczy tylko wybranych pozycji
        affectedBatches = batchesToUpdate.filter(batch => {
          const itemPoId = batch.purchaseOrderDetails?.itemPoId || batch.sourceDetails?.itemPoId;
          return itemPoId && cost.affectedItems.includes(itemPoId);
        });
        console.log(`Koszt "${cost.description || 'bez opisu'}" (${costGrossTotal.toFixed(2)}) przypisany do ${cost.affectedItems.length} pozycji, znaleziono ${affectedBatches.length} partii`);
      } else {
        // Koszt dotyczy wszystkich pozycji (domyślnie)
        affectedBatches = batchesToUpdate;
        console.log(`Koszt "${cost.description || 'bez opisu'}" (${costGrossTotal.toFixed(2)}) przypisany do wszystkich pozycji (${affectedBatches.length} partii)`);
      }
      
      if (affectedBatches.length === 0) {
        console.log(`Brak partii dla kosztu "${cost.description || 'bez opisu'}", pomijam`);
        continue;
      }
      
      // Oblicz łączną ilość początkową dla objętych partii
      const totalAffectedQuantity = affectedBatches.reduce((sum, batch) => {
        const initialQuantity = parseFloat(batch.initialQuantity) || parseFloat(batch.quantity) || 0;
        return sum + initialQuantity;
      }, 0);
      
      if (totalAffectedQuantity <= 0) {
        console.log(`Brak poprawnych ilości dla kosztu "${cost.description || 'bez opisu'}", pomijam`);
        continue;
      }
      
      // Rozlicz koszt proporcjonalnie na objęte partie
      for (const batch of affectedBatches) {
        const batchInitialQuantity = parseFloat(batch.initialQuantity) || parseFloat(batch.quantity) || 0;
        
        if (batchInitialQuantity > 0) {
          const batchProportion = batchInitialQuantity / totalAffectedQuantity;
          const batchCostTotal = costGrossTotal * batchProportion;
          const costPerUnit = batchCostTotal / batchInitialQuantity;
          
          // Dodaj do już obliczonych kosztów dla tej partii
          const currentCost = batchAdditionalCosts.get(batch.id) || 0;
          batchAdditionalCosts.set(batch.id, currentCost + costPerUnit);
        }
      }
    }
    
    // Aktualizuj każdą partię z obliczonymi kosztami
    const updatePromises = [];
    
    for (const batchData of batchesToUpdate) {
      const batchRef = doc(db, INVENTORY_BATCHES_COLLECTION, batchData.id);
      
      // Zachowaj oryginalną cenę jako baseUnitPrice, jeśli nie jest już ustawiona
      const baseUnitPrice = batchData.baseUnitPrice !== undefined 
        ? batchData.baseUnitPrice 
        : batchData.unitPrice || 0;
      
      // Pobierz obliczony dodatkowy koszt dla tej partii
      const additionalCostPerUnit = batchAdditionalCosts.get(batchData.id) || 0;
      
      // Oblicz nową cenę jednostkową
      const newUnitPrice = parseFloat(baseUnitPrice) + additionalCostPerUnit;
      
      const batchInitialQuantity = parseFloat(batchData.initialQuantity) || parseFloat(batchData.quantity) || 0;
      console.log(`Aktualizuję partię ${batchData.id}: initialQuantity=${batchInitialQuantity}, additionalCostPerUnit=${additionalCostPerUnit.toFixed(6)}, basePrice=${baseUnitPrice}, newPrice=${newUnitPrice.toFixed(6)}`);
      
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
    invalidatePOCacheForOrder(purchaseOrderId);
    
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
  clearAllPOCache();
};

// Eksportuj funkcję do czyszczenia całego cache
export const clearAllCache = () => {
  clearAllPOCache();
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
    console.log(`🔍 [BATCH_PRICE_DEBUG] Sprawdzam zmiany cen jednostkowych dla zamówienia ${purchaseOrderId}`);
    console.log(`🔍 [BATCH_PRICE_DEBUG] Stare dane PO:`, { itemsCount: oldPoData.items?.length || 0, items: oldPoData.items?.map(i => ({ id: i.id, name: i.name, unitPrice: i.unitPrice })) });
    console.log(`🔍 [BATCH_PRICE_DEBUG] Nowe dane PO:`, { itemsCount: newPoData.items?.length || 0, items: newPoData.items?.map(i => ({ id: i.id, name: i.name, unitPrice: i.unitPrice })) });
    
    // Sprawdź czy są zmiany cen jednostkowych w pozycjach
    const oldItems = oldPoData.items || [];
    const newItems = newPoData.items || [];
    
    // Znajdź pozycje z zmienionymi cenami jednostkowymi
    const itemsWithPriceChanges = [];
    
    for (const newItem of newItems) {
      console.log(`🔍 [BATCH_PRICE_DEBUG] Sprawdzam pozycję:`, { id: newItem.id, name: newItem.name, unitPrice: newItem.unitPrice });
      
      const oldItem = oldItems.find(item => 
        item.id === newItem.id || 
        item.inventoryItemId === newItem.inventoryItemId ||
        (item.name === newItem.name && item.inventoryItemId === newItem.inventoryItemId)
      );
      
      if (oldItem) {
        const oldUnitPrice = parseFloat(oldItem.unitPrice) || 0;
        const newUnitPrice = parseFloat(newItem.unitPrice) || 0;
        
        console.log(`🔍 [BATCH_PRICE_DEBUG] Znaleziono starą pozycję:`, { 
          oldId: oldItem.id, 
          oldName: oldItem.name, 
          oldUnitPrice, 
          newUnitPrice, 
          difference: newUnitPrice - oldUnitPrice,
          absDifference: Math.abs(oldUnitPrice - newUnitPrice)
        });
        
        // Sprawdź czy cena się zmieniła (bez tolerancji - wykryj każdą zmianę)
        if (oldUnitPrice !== newUnitPrice) {
          const priceChangeData = {
            ...newItem,
            oldUnitPrice,
            newUnitPrice,
            priceDifference: newUnitPrice - oldUnitPrice
          };
          
          itemsWithPriceChanges.push(priceChangeData);
          
          console.log(`✅ [BATCH_PRICE_DEBUG] Wykryto zmianę ceny dla pozycji ${newItem.name}: ${oldUnitPrice} -> ${newUnitPrice} (różnica: ${newUnitPrice - oldUnitPrice})`);
          console.log(`✅ [BATCH_PRICE_DEBUG] Dane zmiany:`, priceChangeData);
        } else {
          console.log(`⚪ [BATCH_PRICE_DEBUG] Brak zmiany ceny dla pozycji ${newItem.name} (${oldUnitPrice} -> ${newUnitPrice})`);
        }
      } else {
        console.log(`❌ [BATCH_PRICE_DEBUG] Nie znaleziono starej pozycji dla:`, { id: newItem.id, name: newItem.name });
      }
    }
    
    // Jeśli nie ma zmian cen, zakończ
    if (itemsWithPriceChanges.length === 0) {
      console.log(`⚪ [BATCH_PRICE_DEBUG] Brak zmian cen jednostkowych w zamówieniu ${purchaseOrderId}`);
      return;
    }
    
    console.log(`🎯 [BATCH_PRICE_DEBUG] Znaleziono ${itemsWithPriceChanges.length} pozycji z zmienionymi cenami:`, 
      itemsWithPriceChanges.map(item => ({ 
        id: item.id, 
        name: item.name, 
        oldPrice: item.oldUnitPrice, 
        newPrice: item.newUnitPrice 
      }))
    );
    
    // Pobierz wszystkie partie magazynowe powiązane z tym zamówieniem
    const { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
    const firebaseConfig = await import('../firebase/config');
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
    
    console.log(`🔍 [BATCH_PRICE_DEBUG] Znaleziono ${batchesToUpdate.length} partii powiązanych z zamówieniem ${purchaseOrderId}`);
    console.log(`🔍 [BATCH_PRICE_DEBUG] Szczegóły partii:`, 
      batchesToUpdate.map(batch => ({
        id: batch.id,
        itemId: batch.itemId,
        itemName: batch.itemName,
        unitPrice: batch.unitPrice,
        baseUnitPrice: batch.baseUnitPrice,
        additionalCostPerUnit: batch.additionalCostPerUnit,
        itemPoId: batch.purchaseOrderDetails?.itemPoId || batch.sourceDetails?.itemPoId,
        warehouseId: batch.warehouseId
      }))
    );
    
    if (batchesToUpdate.length === 0) {
      console.log(`❌ [BATCH_PRICE_DEBUG] Nie znaleziono partii powiązanych z zamówieniem ${purchaseOrderId}`);
      return;
    }
    
    // Aktualizuj partie - dopasuj do pozycji z zmienioną ceną
    const updatePromises = [];
    
    for (const batchData of batchesToUpdate) {
      console.log(`🔍 [BATCH_PRICE_DEBUG] Przetwarzam partię ${batchData.id}:`, {
        itemId: batchData.itemId,
        itemName: batchData.itemName,
        currentUnitPrice: batchData.unitPrice,
        currentBaseUnitPrice: batchData.baseUnitPrice,
        additionalCostPerUnit: batchData.additionalCostPerUnit
      });
      
      // NAJPIERW: Spróbuj dopasować partię do konkretnej pozycji w zamówieniu używając itemPoId
      let matchingItem = null;
      
      // 1. Sprawdź czy partia ma zapisane itemPoId (ID konkretnej pozycji w zamówieniu)
      const batchItemPoId = batchData.purchaseOrderDetails?.itemPoId || batchData.sourceDetails?.itemPoId;
      
      console.log(`🔍 [BATCH_PRICE_DEBUG] Partia ${batchData.id} - itemPoId: ${batchItemPoId}`);
      
      if (batchItemPoId) {
        // Znajdź pozycję o dokładnie tym ID
        matchingItem = itemsWithPriceChanges.find(item => item.id === batchItemPoId);
        
        if (matchingItem) {
          console.log(`✅ [BATCH_PRICE_DEBUG] Dopasowano partię ${batchData.id} do pozycji ${matchingItem.name} (ID: ${matchingItem.id}) na podstawie itemPoId`);
        } else {
          console.log(`❌ [BATCH_PRICE_DEBUG] Nie znaleziono pozycji z ID ${batchItemPoId} w liście zmian cen`);
        }
      } else {
        console.log(`⚠️ [BATCH_PRICE_DEBUG] Partia ${batchData.id} nie ma itemPoId - użyję fallback`);
      }
      
      // 2. Jeśli nie znaleziono dopasowania po itemPoId, spróbuj starszej metody (tylko jako fallback)
      if (!matchingItem) {
        console.log(`🔍 [BATCH_PRICE_DEBUG] Próbuję fallback dla partii ${batchData.id}`);
        
        // Znajdź odpowiadającą pozycję w zamówieniu na podstawie inventoryItemId lub nazwy
        matchingItem = itemsWithPriceChanges.find(item => {
          const matchByInventoryItemId = item.inventoryItemId && batchData.inventoryItemId === item.inventoryItemId;
          const matchByItemId = item.itemId && batchData.itemId === item.itemId;
          const matchByItemName = item.name && batchData.itemName === item.name;
          const matchByName = item.name && batchData.name === item.name;
          
          console.log(`🔍 [BATCH_PRICE_DEBUG] Sprawdzam dopasowanie fallback:`, {
            itemId: item.id,
            itemName: item.name,
            batchId: batchData.id,
            batchItemName: batchData.itemName,
            matchByInventoryItemId,
            matchByItemId,
            matchByItemName,
            matchByName
          });
          
          return matchByInventoryItemId || matchByItemId || matchByItemName || matchByName;
        });
        
        if (matchingItem) {
          console.log(`✅ [BATCH_PRICE_DEBUG] Dopasowano partię ${batchData.id} do pozycji ${matchingItem.name} (ID: ${matchingItem.id}) na podstawie inventoryItemId/nazwy (fallback)`);
        } else {
          console.log(`❌ [BATCH_PRICE_DEBUG] Nie znaleziono dopasowania fallback dla partii ${batchData.id}`);
        }
      }
      
      if (matchingItem) {
        const batchRef = doc(db, INVENTORY_BATCHES_COLLECTION, batchData.id);
        
        // Oblicz cenę bazową z uwzględnieniem rabatu pozycji
        const originalUnitPrice = matchingItem.newUnitPrice;
        const discount = parseFloat(matchingItem.discount) || 0;
        const discountMultiplier = (100 - discount) / 100;
        const newBaseUnitPrice = originalUnitPrice * discountMultiplier;
        const currentBaseUnitPrice = batchData.baseUnitPrice || batchData.unitPrice || 0;
        
        // Zachowaj dodatkowy koszt na jednostkę jeśli istnieje
        const additionalCostPerUnit = parseFloat(batchData.additionalCostPerUnit) || 0;
        
        // Oblicz nową cenę końcową: nowa cena bazowa (z rabatem) + dodatkowy koszt
        const newFinalUnitPrice = newBaseUnitPrice + additionalCostPerUnit;
        
        console.log(`🎯 [BATCH_PRICE_DEBUG] AKTUALIZACJA PARTII ${batchData.id}:`);
        console.log(`🎯 [BATCH_PRICE_DEBUG] - Pozycja: ${matchingItem.name} (ID: ${matchingItem.id})`);
        console.log(`🎯 [BATCH_PRICE_DEBUG] - Oryginalna cena: ${originalUnitPrice}`);
        console.log(`🎯 [BATCH_PRICE_DEBUG] - Rabat: ${discount}%`);
        console.log(`🎯 [BATCH_PRICE_DEBUG] - Stara cena bazowa: ${currentBaseUnitPrice}`);
        console.log(`🎯 [BATCH_PRICE_DEBUG] - Nowa cena bazowa: ${newBaseUnitPrice}`);
        console.log(`🎯 [BATCH_PRICE_DEBUG] - Dodatkowy koszt/jednostka: ${additionalCostPerUnit}`);
        console.log(`🎯 [BATCH_PRICE_DEBUG] - Stara cena końcowa: ${batchData.unitPrice}`);
        console.log(`🎯 [BATCH_PRICE_DEBUG] - Nowa cena końcowa: ${newFinalUnitPrice}`);
        console.log(`🎯 [BATCH_PRICE_DEBUG] - Zmiana ceny bazowej: ${newBaseUnitPrice - currentBaseUnitPrice}`);
        
        const updateData = {
          baseUnitPrice: newBaseUnitPrice,
          originalUnitPrice: originalUnitPrice,
          discount: discount,
          unitPrice: newFinalUnitPrice,
          updatedAt: serverTimestamp(),
          updatedBy: userId
        };
        
        console.log(`🎯 [BATCH_PRICE_DEBUG] - Dane aktualizacji:`, updateData);
        
        // Aktualizuj dokument partii
        updatePromises.push(updateDoc(batchRef, updateData));
        
        console.log(`✅ [BATCH_PRICE_DEBUG] Dodano partię ${batchData.id} do kolejki aktualizacji`);
      } else {
        console.log(`❌ [BATCH_PRICE_DEBUG] Nie znaleziono dopasowania dla partii ${batchData.id}:`, {
          itemPoId: batchItemPoId,
          inventoryItemId: batchData.inventoryItemId,
          itemId: batchData.itemId,
          itemName: batchData.itemName,
          name: batchData.name
        });
      }
    }
    
    console.log(`🎯 [BATCH_PRICE_DEBUG] Kolejka aktualizacji zawiera ${updatePromises.length} partii`);
    
    if (updatePromises.length > 0) {
      console.log(`🎯 [BATCH_PRICE_DEBUG] Wykonuję aktualizację ${updatePromises.length} partii...`);
      
      try {
        await Promise.all(updatePromises);
        console.log(`✅ [BATCH_PRICE_DEBUG] Pomyślnie zaktualizowano ceny bazowe ${updatePromises.length} partii na podstawie zmian cen pozycji`);
      } catch (error) {
        console.error(`❌ [BATCH_PRICE_DEBUG] Błąd podczas aktualizacji partii:`, error);
        throw error;
      }
    } else {
      console.log(`⚪ [BATCH_PRICE_DEBUG] Nie znaleziono partii do aktualizacji na podstawie zmian cen pozycji`);
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
    const firebaseConfig = await import('../firebase/config');
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
        
        // Oblicz cenę bazową z uwzględnieniem rabatu pozycji
        const originalUnitPrice = parseFloat(matchingItem.unitPrice) || 0;
        const discount = parseFloat(matchingItem.discount) || 0;
        const discountMultiplier = (100 - discount) / 100;
        const newBaseUnitPrice = originalUnitPrice * discountMultiplier;
        
        // Zachowaj dodatkowy koszt na jednostkę jeśli istnieje
        const additionalCostPerUnit = parseFloat(batchData.additionalCostPerUnit) || 0;
        
        // Oblicz nową cenę końcową: cena bazowa (z rabatem) + dodatkowy koszt
        const newFinalUnitPrice = newBaseUnitPrice + additionalCostPerUnit;
        
        console.log(`Ręczna aktualizacja: Aktualizuję partię ${batchData.id} dla pozycji ${matchingItem.name}: originalPrice -> ${originalUnitPrice}, discount -> ${discount}%, basePrice -> ${newBaseUnitPrice}, finalPrice -> ${newFinalUnitPrice}`);
        
        // Aktualizuj dokument partii
        updatePromises.push(updateDoc(batchRef, {
          baseUnitPrice: newBaseUnitPrice,
          originalUnitPrice: originalUnitPrice,
          discount: discount,
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
    invalidatePOCacheForOrder(purchaseOrderId);
    
    return { success: true, updated: updatePromises.length };
  } catch (error) {
    console.error('Błąd podczas ręcznej aktualizacji cen bazowych partii dla zamówienia:', error);
    throw error;
  }
};

/**
 * Aktualizuje ceny partii przy każdym zapisie PO, niezależnie od wykrytych zmian
 * @param {string} purchaseOrderId - ID zamówienia zakupowego
 * @param {Object} poData - Dane zamówienia zakupowego
 * @param {string} userId - ID użytkownika dokonującego aktualizacji
 */
const updateBatchPricesOnAnySave = async (purchaseOrderId, poData, userId) => {
  try {
    console.log(`🔄 [BATCH_AUTO_UPDATE] Rozpoczynam automatyczną aktualizację cen partii dla zamówienia ${purchaseOrderId}`);
    
    // Pobierz wszystkie partie magazynowe powiązane z tym zamówieniem
    const { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
    const firebaseConfig = await import('../firebase/config');
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
    
    console.log(`🔄 [BATCH_AUTO_UPDATE] Znaleziono ${batchesToUpdate.length} partii powiązanych z zamówieniem ${purchaseOrderId}`);
    
    if (batchesToUpdate.length === 0) {
      console.log(`ℹ️ [BATCH_AUTO_UPDATE] Nie znaleziono partii powiązanych z zamówieniem ${purchaseOrderId}`);
      return { success: true, updated: 0 };
    }
    
    // Aktualizuj partie - dopasuj do pozycji z zamówienia
    const updatePromises = [];
    const items = poData.items || [];
    
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
    
    // Oblicz łączną ilość początkową wszystkich partii dla proporcjonalnego rozdziału kosztów
    const totalInitialQuantity = batchesToUpdate.reduce((sum, batch) => {
      return sum + (parseFloat(batch.initialQuantity) || parseFloat(batch.quantity) || 0);
    }, 0);
    
    console.log(`🔄 [BATCH_AUTO_UPDATE] Dodatkowe koszty: ${additionalCostsGrossTotal}, łączna ilość partii: ${totalInitialQuantity}`);
    
    for (const batchData of batchesToUpdate) {
      // Dopasuj partię do pozycji w zamówieniu
      let matchingItem = null;
      
      // 1. Sprawdź czy partia ma zapisane itemPoId (ID konkretnej pozycji w zamówieniu)
      const batchItemPoId = batchData.purchaseOrderDetails?.itemPoId || batchData.sourceDetails?.itemPoId;
      
      if (batchItemPoId) {
        // Znajdź pozycję o dokładnie tym ID
        matchingItem = items.find(item => item.id === batchItemPoId);
        
        if (matchingItem) {
          console.log(`🔄 [BATCH_AUTO_UPDATE] Dopasowano partię ${batchData.id} do pozycji ${matchingItem.name} (ID: ${matchingItem.id}) na podstawie itemPoId`);
        }
      }
      
      // 2. Jeśli nie znaleziono dopasowania po itemPoId, spróbuj starszej metody (fallback)
      if (!matchingItem) {
        // Spróbuj dopasować po inventoryItemId
        const batchInventoryItemId = batchData.inventoryItemId || batchData.itemId;
        if (batchInventoryItemId) {
          matchingItem = items.find(item => 
            item.inventoryItemId === batchInventoryItemId || item.id === batchInventoryItemId
          );
          
          if (matchingItem) {
            console.log(`🔄 [BATCH_AUTO_UPDATE] Dopasowano partię ${batchData.id} do pozycji ${matchingItem.name} na podstawie inventoryItemId`);
          }
        }
        
        // Jeśli nadal nie znaleziono, spróbuj po nazwie (ostatnia deska ratunku)
        if (!matchingItem) {
          const batchItemName = batchData.itemName || batchData.name;
          if (batchItemName) {
            matchingItem = items.find(item => item.name === batchItemName);
            
            if (matchingItem) {
              console.log(`🔄 [BATCH_AUTO_UPDATE] Dopasowano partię ${batchData.id} do pozycji ${matchingItem.name} na podstawie nazwy (fallback)`);
            }
          }
        }
      }
      
      if (matchingItem && matchingItem.unitPrice !== undefined) {
        const batchRef = doc(db, INVENTORY_BATCHES_COLLECTION, batchData.id);
        
        // Pobierz ilość początkową partii
        const batchInitialQuantity = parseFloat(batchData.initialQuantity) || parseFloat(batchData.quantity) || 0;
        
        // Oblicz cenę bazową z uwzględnieniem rabatu pozycji
        const originalUnitPrice = parseFloat(matchingItem.unitPrice) || 0;
        const discount = parseFloat(matchingItem.discount) || 0;
        const discountMultiplier = (100 - discount) / 100;
        const newBaseUnitPrice = originalUnitPrice * discountMultiplier;
        
        // Oblicz dodatkowy koszt na jednostkę dla tej partii
        let additionalCostPerUnit = 0;
        if (additionalCostsGrossTotal > 0 && totalInitialQuantity > 0 && batchInitialQuantity > 0) {
          // Oblicz proporcjonalny udział dodatkowych kosztów dla tej partii
          const batchProportion = batchInitialQuantity / totalInitialQuantity;
          const batchAdditionalCostTotal = additionalCostsGrossTotal * batchProportion;
          additionalCostPerUnit = batchAdditionalCostTotal / batchInitialQuantity;
        }
        
        // Oblicz nową cenę końcową: cena bazowa (z rabatem) + dodatkowy koszt
        const newFinalUnitPrice = newBaseUnitPrice + additionalCostPerUnit;
        
        console.log(`🔄 [BATCH_AUTO_UPDATE] Aktualizuję partię ${batchData.id} dla pozycji ${matchingItem.name}:`, {
          originalPrice: originalUnitPrice,
          discount: discount,
          basePrice: newBaseUnitPrice,
          additionalCost: additionalCostPerUnit,
          finalPrice: newFinalUnitPrice,
          quantity: batchInitialQuantity
        });
        
        // Aktualizuj dokument partii
        updatePromises.push(updateDoc(batchRef, {
          baseUnitPrice: newBaseUnitPrice,
          originalUnitPrice: originalUnitPrice, // Zachowaj oryginalną cenę przed rabatem
          discount: discount, // Zachowaj informację o rabacie
          additionalCostPerUnit: additionalCostPerUnit,
          unitPrice: newFinalUnitPrice,
          updatedAt: serverTimestamp(),
          updatedBy: userId
        }));
      } else if (!matchingItem) {
        console.warn(`⚠️ [BATCH_AUTO_UPDATE] Nie znaleziono dopasowania dla partii ${batchData.id}:`, {
          itemPoId: batchItemPoId,
          inventoryItemId: batchData.inventoryItemId,
          itemId: batchData.itemId,
          itemName: batchData.itemName,
          name: batchData.name
        });
      }
    }
    
    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
      console.log(`✅ [BATCH_AUTO_UPDATE] Pomyślnie zaktualizowano ${updatePromises.length} partii przy zapisie PO`);
    } else {
      console.log(`ℹ️ [BATCH_AUTO_UPDATE] Brak partii do aktualizacji`);
    }
    
    // Wyczyść cache dotyczące tego zamówienia
    invalidatePOCacheForOrder(purchaseOrderId);
    
    // ============================================================================
    // WYŁĄCZONE: Cloud Functions obsługują aktualizację zadań (onBatchPriceUpdate)
    // Cloud Function automatycznie wykryje zmiany cen partii i zaktualizuje zadania
    // ============================================================================
    if (updatePromises.length > 0) {
      console.log(`ℹ️ [TASK_COST_UPDATE] Aktualizacja kosztów zadań będzie wykonana przez Cloud Function (onBatchPriceUpdate) dla ${updatePromises.length} partii`);
      
      /*
      // STARA LOGIKA (przed Cloud Functions): Automatycznie aktualizuj koszty zadań
      try {
        console.log(`🔄 [TASK_COST_UPDATE] Rozpoczynam aktualizację kosztów zadań po zmianie cen partii...`);
        
        // Pobierz wszystkie zadania które używają zaktualizowanych partii
        const { updateTaskCostsForUpdatedBatches } = await import('../productionService');
        const batchIds = batchesToUpdate.map(batch => batch.id);
        
        const taskUpdateResult = await updateTaskCostsForUpdatedBatches(batchIds, userId || 'system');
        console.log(`✅ [TASK_COST_UPDATE] Zakończono aktualizację kosztów zadań:`, taskUpdateResult);
        
        return { 
          success: true, 
          updated: updatePromises.length,
          taskCostUpdate: taskUpdateResult
        };
        
      } catch (error) {
        console.error('❌ [TASK_COST_UPDATE] Błąd podczas aktualizacji kosztów zadań:', error);
        // Nie przerywamy procesu - błąd aktualizacji kosztów nie powinien blokować aktualizacji PO
        return { 
          success: true, 
          updated: updatePromises.length,
          taskCostUpdateError: error.message
        };
      }
      */
    }
    
    return { success: true, updated: updatePromises.length };
  } catch (error) {
    console.error(`❌ [BATCH_AUTO_UPDATE] Błąd podczas automatycznej aktualizacji cen partii dla zamówienia ${purchaseOrderId}:`, error);
    throw error;
  }
};

/**
 * Aktualizuje ceny partii z pełnymi szczegółami różnic (do użycia w interfejsie)
 * @param {string} purchaseOrderId - ID zamówienia zakupowego
 * @param {string} userId - ID użytkownika dokonującego aktualizacji
 * @returns {Promise<Object>} - Szczegółowy raport z różnicami
 */
const updateBatchPricesWithDetails = async (purchaseOrderId, userId) => {
  try {
    console.log(`🔄 [BATCH_DETAILS_UPDATE] Rozpoczynam aktualizację cen partii z raportem dla zamówienia ${purchaseOrderId}`);
    
    // Pobierz aktualne dane zamówienia
    const poData = await getPurchaseOrderById(purchaseOrderId);
    if (!poData) {
      throw new Error(`Nie znaleziono zamówienia o ID ${purchaseOrderId}`);
    }
    
    // Pobierz wszystkie partie magazynowe powiązane z tym zamówieniem
    const { collection, query, where, getDocs, doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
    const firebaseConfig = await import('../firebase/config');
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
    
    console.log(`🔄 [BATCH_DETAILS_UPDATE] Znaleziono ${batchesToUpdate.length} partii powiązanych z zamówieniem ${purchaseOrderId}`);
    
    if (batchesToUpdate.length === 0) {
      return {
        success: true,
        updated: 0,
        total: 0,
        details: [],
        additionalCosts: 0,
        summary: {
          changed: 0,
          unchanged: 0,
          errors: 0
        },
        message: 'Nie znaleziono partii powiązanych z zamówieniem'
      };
    }
    
    const items = poData.items || [];
    
    // Oblicz łączne dodatkowe koszty BRUTTO (z VAT)
    let additionalCostsGrossTotal = 0;
    
    if (poData.additionalCostsItems && Array.isArray(poData.additionalCostsItems)) {
      additionalCostsGrossTotal = poData.additionalCostsItems.reduce((sum, cost) => {
        const net = parseFloat(cost.value) || 0;
        const vatRate = typeof cost.vatRate === 'number' ? cost.vatRate : 0;
        const vat = (net * vatRate) / 100;
        return sum + net + vat;
      }, 0);
    } else if (poData.additionalCosts) {
      additionalCostsGrossTotal = parseFloat(poData.additionalCosts) || 0;
    }
    
    // Oblicz łączną ilość początkową wszystkich partii
    const totalInitialQuantity = batchesToUpdate.reduce((sum, batch) => {
      return sum + (parseFloat(batch.initialQuantity) || parseFloat(batch.quantity) || 0);
    }, 0);
    
    console.log(`🔄 [BATCH_DETAILS_UPDATE] Dodatkowe koszty: ${additionalCostsGrossTotal}, łączna ilość partii: ${totalInitialQuantity}`);
    
    // Przygotuj szczegółowy raport z różnicami
    const updateDetails = [];
    const updatePromises = [];
    
    for (const batchData of batchesToUpdate) {
      let matchingItem = null;
      
      // Dopasuj partię do pozycji
      const batchItemPoId = batchData.purchaseOrderDetails?.itemPoId || batchData.sourceDetails?.itemPoId;
      
      if (batchItemPoId) {
        matchingItem = items.find(item => item.id === batchItemPoId);
      }
      
      if (!matchingItem) {
        const batchInventoryItemId = batchData.inventoryItemId || batchData.itemId;
        if (batchInventoryItemId) {
          matchingItem = items.find(item => 
            item.inventoryItemId === batchInventoryItemId || item.id === batchInventoryItemId
          );
        }
        
        if (!matchingItem) {
          const batchItemName = batchData.itemName || batchData.name;
          if (batchItemName) {
            matchingItem = items.find(item => item.name === batchItemName);
          }
        }
      }
      
      if (matchingItem && matchingItem.unitPrice !== undefined) {
        const oldUnitPrice = parseFloat(batchData.unitPrice) || 0;
        const oldBaseUnitPrice = parseFloat(batchData.baseUnitPrice) || oldUnitPrice;
        const oldAdditionalCost = parseFloat(batchData.additionalCostPerUnit) || 0;
        
        // Oblicz cenę bazową z uwzględnieniem rabatu pozycji
        const originalUnitPrice = parseFloat(matchingItem.unitPrice) || 0;
        const discount = parseFloat(matchingItem.discount) || 0;
        const discountMultiplier = (100 - discount) / 100;
        const newBaseUnitPrice = originalUnitPrice * discountMultiplier;
        let newAdditionalCost = 0;
        
        const batchInitialQuantity = parseFloat(batchData.initialQuantity) || parseFloat(batchData.quantity) || 0;
        if (additionalCostsGrossTotal > 0 && totalInitialQuantity > 0 && batchInitialQuantity > 0) {
          const batchProportion = batchInitialQuantity / totalInitialQuantity;
          const batchAdditionalCostTotal = additionalCostsGrossTotal * batchProportion;
          newAdditionalCost = batchAdditionalCostTotal / batchInitialQuantity;
        }
        
        const newFinalUnitPrice = newBaseUnitPrice + newAdditionalCost;
        
        // Sprawdź czy są różnice
        const baseChanged = Math.abs(oldBaseUnitPrice - newBaseUnitPrice) > 0.0001;
        const additionalChanged = Math.abs(oldAdditionalCost - newAdditionalCost) > 0.0001;
        const finalChanged = Math.abs(oldUnitPrice - newFinalUnitPrice) > 0.0001;
        
        updateDetails.push({
          batchId: batchData.id,
          batchNumber: batchData.batchNumber || batchData.lotNumber || 'Bez numeru',
          itemName: matchingItem.name,
          itemPoId: batchItemPoId,
          quantity: batchInitialQuantity,
          changes: {
            baseUnitPrice: {
              old: oldBaseUnitPrice,
              new: newBaseUnitPrice,
              changed: baseChanged,
              difference: newBaseUnitPrice - oldBaseUnitPrice
            },
            additionalCostPerUnit: {
              old: oldAdditionalCost,
              new: newAdditionalCost,
              changed: additionalChanged,
              difference: newAdditionalCost - oldAdditionalCost
            },
            finalUnitPrice: {
              old: oldUnitPrice,
              new: newFinalUnitPrice,
              changed: finalChanged,
              difference: newFinalUnitPrice - oldUnitPrice
            }
          },
          hasChanges: baseChanged || additionalChanged || finalChanged,
          updated: true
        });
        
        // Dodaj do kolejki aktualizacji
        const batchRef = doc(db, INVENTORY_BATCHES_COLLECTION, batchData.id);
        updatePromises.push(updateDoc(batchRef, {
          baseUnitPrice: newBaseUnitPrice,
          originalUnitPrice: originalUnitPrice,
          discount: discount,
          additionalCostPerUnit: newAdditionalCost,
          unitPrice: newFinalUnitPrice,
          updatedAt: serverTimestamp(),
          updatedBy: userId
        }));
        
      } else {
        updateDetails.push({
          batchId: batchData.id,
          batchNumber: batchData.batchNumber || batchData.lotNumber || 'Bez numeru',
          itemName: batchData.itemName || batchData.name || 'Nieznany',
          quantity: parseFloat(batchData.initialQuantity) || parseFloat(batchData.quantity) || 0,
          changes: null,
          hasChanges: false,
          updated: false,
          error: 'Nie znaleziono dopasowania do pozycji w PO'
        });
      }
    }
    
    // Wykonaj aktualizacje
    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
      console.log(`✅ [BATCH_DETAILS_UPDATE] Pomyślnie zaktualizowano ${updatePromises.length} partii`);
    }
    
    // Wyczyść cache
    invalidatePOCacheForOrder(purchaseOrderId);
    
    // Zlicz różnice
    const changedBatches = updateDetails.filter(batch => batch.hasChanges).length;
    const unchangedBatches = updateDetails.filter(batch => batch.updated && !batch.hasChanges).length;
    const errorBatches = updateDetails.filter(batch => !batch.updated).length;
    
    return { 
      success: true, 
      updated: updatePromises.length,
      total: batchesToUpdate.length,
      details: updateDetails,
      additionalCosts: additionalCostsGrossTotal,
      summary: {
        changed: changedBatches,
        unchanged: unchangedBatches,
        errors: errorBatches
      },
      message: `Zaktualizowano ${updatePromises.length} partii (${changedBatches} ze zmianami, ${unchangedBatches} bez zmian, ${errorBatches} błędów)`
    };
    
  } catch (error) {
    console.error(`❌ [BATCH_DETAILS_UPDATE] Błąd podczas aktualizacji cen partii z raportem dla zamówienia ${purchaseOrderId}:`, error);
    throw error;
  }
};

// Eksportuję funkcję do automatycznej aktualizacji cen partii przy każdym zapisie PO
export { updateBatchPricesOnAnySave, updateBatchPricesWithDetails };

// Cache dla ograniczonej listy zamówień
let limitedPOCache = null;
let limitedPOCacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minut

// Cache dla zoptymalizowanej funkcji pobierania zamówień zakupu
let purchaseOrdersCache = null;
let purchaseOrdersCacheTimestamp = null;
const PO_CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minut

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
    invalidatePOCacheForOrder(purchaseOrderId);

    // Aktualizuj zamówienie w zoptymalizowanym cache
    updatePurchaseOrderInCache(purchaseOrderId, {
      paymentStatus: newPaymentStatus,
      updatedAt: new Date()
    });

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

    invalidatePOCacheForOrder(purchaseOrderId);

    updatePurchaseOrderInCache(purchaseOrderId, updateFields);

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

      invalidatePOCacheForOrder(purchaseOrderId);
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

/**
 * ZOPTYMALIZOWANA FUNKCJA dla interfejsu listy zamówień zakupu
 * 
 * Ta funkcja została stworzona dla lepszej wydajności w interfejsie listy:
 * - Cachuje wszystkie zamówienia po pierwszym pobraniu
 * - Dynamicznie filtruje i sortuje dane w cache
 * - Implementuje debouncing dla wyszukiwania
 * 
 * @param {Object} params - Parametry zapytania
 * @param {number} params.page - Numer strony (wymagany)
 * @param {number} params.pageSize - Rozmiar strony (wymagany)
 * @param {string|null} params.searchTerm - Termin wyszukiwania (opcjonalne)
 * @param {string|null} params.statusFilter - Filtr statusu (opcjonalne)
 * @param {string|null} params.sortField - Pole do sortowania (opcjonalne)
 * @param {string|null} params.sortOrder - Kierunek sortowania (opcjonalne)
 * @param {boolean} params.forceRefresh - Wymuś odświeżenie cache (opcjonalne)
 * @returns {Promise<Object>} - Obiekt z paginacją i danymi
 */
export const getPurchaseOrdersOptimized = async ({
  page,
  pageSize,
  searchTerm = null,
  statusFilter = null,
  paymentStatusFilter = null,
  sortField = 'createdAt',
  sortOrder = 'desc',
  forceRefresh = false
}) => {
  try {
    console.log('🚀 getPurchaseOrdersOptimized - rozpoczynam zoptymalizowane pobieranie');
    console.log('📄 Parametry:', { page, pageSize, searchTerm, statusFilter, paymentStatusFilter, sortField, sortOrder, forceRefresh });

    // Walidacja wymaganych parametrów
    if (!page || !pageSize) {
      throw new Error('Parametry page i pageSize są wymagane');
    }

    const pageNum = Math.max(1, parseInt(page));
    const itemsPerPage = Math.max(1, parseInt(pageSize));

    // KROK 1: Sprawdź cache zamówień zakupu
    const now = Date.now();
    const isCacheValid = purchaseOrdersCache && 
                        purchaseOrdersCacheTimestamp && 
                        (now - purchaseOrdersCacheTimestamp) < PO_CACHE_EXPIRY_MS &&
                        !forceRefresh;

    let allOrders;

    if (isCacheValid) {
      console.log('💾 Używam cache zamówień zakupu');
      allOrders = [...purchaseOrdersCache];
    } else {
      console.log('🔄 Pobieram świeże dane zamówień zakupu');
      
      // Pobierz wszystkie zamówienia zakupu
      const ordersRef = collection(db, PURCHASE_ORDERS_COLLECTION);
      const q = query(ordersRef);
      const allOrdersSnapshot = await getDocs(q);
      
      // Zbierz wszystkie ID dostawców
      const supplierIds = new Set();
      const ordersData = allOrdersSnapshot.docs.map(doc => {
        const orderData = doc.data();
        if (orderData.supplierId) {
          supplierIds.add(orderData.supplierId);
        }
        return {
          id: doc.id,
          ...orderData
        };
      });

      // Pobierz dostawców jednym zapytaniem batch
      const suppliersData = {};
      if (supplierIds.size > 0) {
        const supplierPromises = Array.from(supplierIds).map(async (supplierId) => {
          try {
            const supplierDoc = await getDoc(doc(db, SUPPLIERS_COLLECTION, supplierId));
            if (supplierDoc.exists()) {
              return { id: supplierId, data: supplierDoc.data() };
            }
          } catch (error) {
            console.warn(`Błąd podczas pobierania dostawcy ${supplierId}:`, error);
          }
          return null;
        });

        const suppliers = await Promise.all(supplierPromises);
        suppliers.forEach(supplier => {
          if (supplier) {
            suppliersData[supplier.id] = supplier.data;
          }
        });
      }

      // Przypisz dane dostawców do zamówień
      allOrders = ordersData.map(order => ({
        ...order,
        supplier: order.supplierId && suppliersData[order.supplierId] 
          ? { id: order.supplierId, ...suppliersData[order.supplierId] }
          : null,
        // Konwersja dat Firestore na obiekty Date dla lepszego sortowania
        createdAt: order.createdAt?.toDate ? order.createdAt.toDate() : order.createdAt,
        updatedAt: order.updatedAt?.toDate ? order.updatedAt.toDate() : order.updatedAt,
        dueDate: order.dueDate?.toDate ? order.dueDate.toDate() : order.dueDate,
        orderDate: order.orderDate?.toDate ? order.orderDate.toDate() : order.orderDate,
        expectedDeliveryDate: order.expectedDeliveryDate?.toDate ? order.expectedDeliveryDate.toDate() : order.expectedDeliveryDate,
      }));

      // Zaktualizuj cache
      purchaseOrdersCache = [...allOrders];
      purchaseOrdersCacheTimestamp = now;
      
      console.log('💾 Zapisano do cache:', allOrders.length, 'zamówień zakupu');
    }

    // KROK 2: Filtrowanie po terminie wyszukiwania
    if (searchTerm && searchTerm.trim() !== '') {
      const searchLower = searchTerm.toLowerCase().trim();
      console.log('🔍 Filtrowanie po terminie wyszukiwania:', searchLower);
      
      // Sprawdź czy searchTerm to liczba (obsługa wyszukiwania po wartości)
      const searchNumber = parseFloat(searchTerm.replace(',', '.').replace(/\s/g, ''));
      const isNumericSearch = !isNaN(searchNumber) && searchNumber > 0;
      
      allOrders = allOrders.filter(order => {
        // Wyszukiwanie w numerze zamówienia
        if (order.number && order.number.toLowerCase().includes(searchLower)) {
          return true;
        }
        
        // Wyszukiwanie w nazwach dostawców
        if (order.supplier?.name && order.supplier.name.toLowerCase().includes(searchLower)) {
          return true;
        }
        
        // Wyszukiwanie w pozycjach zamówienia
        if (order.items && order.items.some(item => 
          (item.name && item.name.toLowerCase().includes(searchLower)) ||
          (item.description && item.description.toLowerCase().includes(searchLower)) ||
          (item.code && item.code.toLowerCase().includes(searchLower))
        )) {
          return true;
        }
        
        // Wyszukiwanie w kosztach dodatkowych
        if (order.additionalCostsItems && order.additionalCostsItems.some(cost => 
          (cost.description && cost.description.toLowerCase().includes(searchLower))
        )) {
          return true;
        }
        
        // Wyszukiwanie w notatkach
        if (order.notes && order.notes.toLowerCase().includes(searchLower)) {
          return true;
        }
        
        // NOWE: Wyszukiwanie po wartości (gdy searchTerm jest liczbą)
        if (isNumericSearch) {
          // Tolerancja dla porównania wartości (1% lub minimum 1 jednostka waluty)
          const tolerance = Math.max(searchNumber * 0.01, 1);
          
          // Wyszukiwanie po wartości całkowitej PO
          const totalGross = parseFloat(order.totalGross) || 0;
          const totalValue = parseFloat(order.totalValue) || 0;
          const totalNet = parseFloat(order.totalNet) || 0;
          
          if (Math.abs(totalGross - searchNumber) <= tolerance ||
              Math.abs(totalValue - searchNumber) <= tolerance ||
              Math.abs(totalNet - searchNumber) <= tolerance) {
            console.log(`✓ Znaleziono dopasowanie w wartości PO: ${order.number} (totalGross: ${totalGross})`);
            return true;
          }
          
          // Wyszukiwanie po wartości pozycji zamówienia
          if (order.items && order.items.some(item => {
            const itemTotalPrice = parseFloat(item.totalPrice) || 0;
            const itemUnitPrice = parseFloat(item.unitPrice) || 0;
            const itemNetValue = parseFloat(item.netValue) || 0;
            
            return Math.abs(itemTotalPrice - searchNumber) <= tolerance ||
                   Math.abs(itemUnitPrice - searchNumber) <= tolerance ||
                   Math.abs(itemNetValue - searchNumber) <= tolerance;
          })) {
            console.log(`✓ Znaleziono dopasowanie w wartości pozycji: ${order.number}`);
            return true;
          }
          
          // Wyszukiwanie po wartości dodatkowych kosztów
          if (order.additionalCostsItems && order.additionalCostsItems.some(cost => {
            const costValue = parseFloat(cost.value) || 0;
            return Math.abs(costValue - searchNumber) <= tolerance;
          })) {
            console.log(`✓ Znaleziono dopasowanie w wartości kosztu dodatkowego: ${order.number}`);
            return true;
          }
        }
        
        return false;
      });
      
      console.log('🔍 Po filtrowaniu wyszukiwania:', allOrders.length, 'zamówień');
    }

    // KROK 3: Filtrowanie po statusie
    if (statusFilter && statusFilter !== 'all' && statusFilter.trim() !== '') {
      console.log('📋 Filtrowanie po statusie:', statusFilter);
      allOrders = allOrders.filter(order => order.status === statusFilter);
      console.log('📋 Po filtrowaniu statusu:', allOrders.length, 'zamówień');
    }

    // KROK 3.5: Filtrowanie po statusie płatności
    if (paymentStatusFilter && paymentStatusFilter !== 'all' && paymentStatusFilter.trim() !== '') {
      console.log('💳 Filtrowanie po statusie płatności:', paymentStatusFilter);
      allOrders = allOrders.filter(order => {
        const orderPaymentStatus = order.paymentStatus || 'unpaid'; // domyślnie 'unpaid' jeśli brak statusu
        return orderPaymentStatus === paymentStatusFilter;
      });
      console.log('💳 Po filtrowaniu statusu płatności:', allOrders.length, 'zamówień');
    }

    // KROK 4: Sortowanie
    console.log('📊 Sortowanie po polu:', sortField, 'kierunek:', sortOrder);
    allOrders.sort((a, b) => {
      let valueA = a[sortField];
      let valueB = b[sortField];

      // Obsługa dat
      if (valueA instanceof Date || valueB instanceof Date) {
        valueA = valueA ? new Date(valueA).getTime() : 0;
        valueB = valueB ? new Date(valueB).getTime() : 0;
      }
      
      // Obsługa stringów
      if (typeof valueA === 'string') valueA = valueA.toLowerCase();
      if (typeof valueB === 'string') valueB = valueB.toLowerCase();
      
      // Obsługa wartości null/undefined
      if (valueA == null && valueB == null) return 0;
      if (valueA == null) return sortOrder === 'asc' ? -1 : 1;
      if (valueB == null) return sortOrder === 'asc' ? 1 : -1;

      let comparison = 0;
      if (valueA < valueB) comparison = -1;
      else if (valueA > valueB) comparison = 1;

      return sortOrder === 'desc' ? -comparison : comparison;
    });

    // KROK 5: Paginacja
    const totalItems = allOrders.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startIndex = (pageNum - 1) * itemsPerPage;
    const paginatedData = allOrders.slice(startIndex, startIndex + itemsPerPage);

    console.log('📊 Wyniki paginacji:', {
      totalItems,
      totalPages,
      currentPage: pageNum,
      itemsPerPage,
      returnedItems: paginatedData.length
    });

    return {
      items: paginatedData,
      totalCount: totalItems,
      totalPages,
      currentPage: pageNum,
      pageSize: itemsPerPage
    };

  } catch (error) {
    console.error('❌ Błąd w getPurchaseOrdersOptimized:', error);
    throw error;
  }
};

/**
 * Czyści cache zamówień zakupu
 */
export const clearPurchaseOrdersCache = () => {
  purchaseOrdersCache = null;
  purchaseOrdersCacheTimestamp = null;
  console.log('🗑️ Cache zamówień zakupu wyczyszczony');
};

/**
 * Aktualizuje pojedyncze zamówienie w cache (zamiast czyszczenia całego cache)
 * @param {string} orderId - ID zamówienia do aktualizacji
 * @param {Object} updatedOrderData - Nowe dane zamówienia
 * @returns {boolean} - Czy aktualizacja się powiodła
 */
export const updatePurchaseOrderInCache = (orderId, updatedOrderData) => {
  if (!purchaseOrdersCache || !Array.isArray(purchaseOrdersCache)) {
    return false;
  }

  const orderIndex = purchaseOrdersCache.findIndex(order => order.id === orderId);
  if (orderIndex === -1) {
    return false;
  }

  // Aktualizuj zamówienie w cache
  purchaseOrdersCache[orderIndex] = {
    ...purchaseOrdersCache[orderIndex],
    ...updatedOrderData,
    updatedAt: new Date()
  };

  console.log('✏️ Zaktualizowano zamówienie w cache:', orderId);
  return true;
};

/**
 * Dodaje nowe zamówienie do cache
 * @param {Object} newOrderData - Dane nowego zamówienia
 * @returns {boolean} - Czy dodanie się powiodło
 */
export const addPurchaseOrderToCache = (newOrderData) => {
  if (!purchaseOrdersCache || !Array.isArray(purchaseOrdersCache)) {
    return false;
  }

  // Dodaj nowe zamówienie na początek listy (najnowsze pierwsze)
  purchaseOrdersCache.unshift({
    ...newOrderData,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  console.log('➕ Dodano nowe zamówienie do cache:', newOrderData.id);
  return true;
};

/**
 * Usuwa zamówienie z cache
 * @param {string} orderId - ID zamówienia do usunięcia
 * @returns {boolean} - Czy usunięcie się powiodło
 */
export const removePurchaseOrderFromCache = (orderId) => {
  if (!purchaseOrdersCache || !Array.isArray(purchaseOrdersCache)) {
    return false;
  }

  const initialLength = purchaseOrdersCache.length;
  purchaseOrdersCache = purchaseOrdersCache.filter(order => order.id !== orderId);

  if (purchaseOrdersCache.length < initialLength) {
    console.log('🗑️ Usunięto zamówienie z cache:', orderId);
    return true;
  }

  return false;
};

/**
 * Wyszukuje PO po numerze (prefix search) - optymalne dla Firebase
 * Używa indeksowanego zapytania zamiast pobierania wszystkich danych
 * Obsługuje wyszukiwanie po:
 * - pełnym numerze (np. "PO00092")
 * - samym numerze bez prefiksu (np. "92" -> szuka "PO...92")
 * 
 * @param {string} numberPrefix - Początek numeru PO do wyszukania (może być z lub bez prefiksu PO)
 * @param {number} maxResults - Maksymalna liczba wyników (domyślnie 15)
 * @returns {Promise<Array>} - Tablica zamówień zakupowych pasujących do wyszukiwania
 */
export const searchPurchaseOrdersByNumber = async (numberPrefix, maxResults = 15) => {
  try {
    if (!numberPrefix || numberPrefix.trim().length < 2) {
      // Dla pustego lub zbyt krótkiego wyszukiwania zwróć puste wyniki
      return [];
    }

    const searchTerm = numberPrefix.trim().toUpperCase();
    
    // Sprawdź czy użytkownik wpisał sam numer (bez PO) lub wartość
    const isNumericOnly = /^\d+$/.test(searchTerm);
    
    // Sprawdź czy to może być wyszukiwanie po wartości (liczba zmiennoprzecinkowa)
    const searchNumber = parseFloat(numberPrefix.replace(',', '.').replace(/\s/g, ''));
    const isValueSearch = !isNaN(searchNumber) && searchNumber > 100; // Wartości > 100 traktuj jako wyszukiwanie po wartości
    
    let querySnapshot;
    
    if (isNumericOnly || isValueSearch) {
      // Użytkownik wpisał sam numer (np. "92") lub wartość (np. "1500") - przeszukaj po stronie klienta
      const q = query(
        collection(db, PURCHASE_ORDERS_COLLECTION),
        orderBy('createdAt', 'desc'),
        firebaseLimit(100) // Pobierz więcej żeby znaleźć pasujące
      );
      
      const allResults = await getDocs(q);
      const filteredDocs = allResults.docs.filter(doc => {
        const data = doc.data();
        const number = data.number || '';
        
        // Szukaj numeru w dowolnym miejscu (np. "92" w "PO00092")
        if (number.includes(searchTerm)) {
          return true;
        }
        
        // NOWE: Wyszukiwanie po wartości (dla liczb > 100)
        if (isValueSearch) {
          const tolerance = Math.max(searchNumber * 0.01, 1); // 1% tolerancji
          
          // Wartość całkowita PO
          const totalGross = parseFloat(data.totalGross) || 0;
          const totalValue = parseFloat(data.totalValue) || 0;
          
          if (Math.abs(totalGross - searchNumber) <= tolerance ||
              Math.abs(totalValue - searchNumber) <= tolerance) {
            return true;
          }
          
          // Wartość pozycji
          if (data.items && Array.isArray(data.items)) {
            const foundInItems = data.items.some(item => {
              const itemTotalPrice = parseFloat(item.totalPrice) || 0;
              const itemUnitPrice = parseFloat(item.unitPrice) || 0;
              return Math.abs(itemTotalPrice - searchNumber) <= tolerance ||
                     Math.abs(itemUnitPrice - searchNumber) <= tolerance;
            });
            if (foundInItems) return true;
          }
          
          // Wartość dodatkowych kosztów
          if (data.additionalCostsItems && Array.isArray(data.additionalCostsItems)) {
            const foundInCosts = data.additionalCostsItems.some(cost => {
              const costValue = parseFloat(cost.value) || 0;
              return Math.abs(costValue - searchNumber) <= tolerance;
            });
            if (foundInCosts) return true;
          }
        }
        
        return false;
      }).slice(0, maxResults);
      
      querySnapshot = { docs: filteredDocs };
    } else {
      // Użytkownik wpisał pełny prefix (np. "PO00") - używamy prefix search
      const q = query(
        collection(db, PURCHASE_ORDERS_COLLECTION),
        where('number', '>=', searchTerm),
        where('number', '<=', searchTerm + '\uf8ff'),
        orderBy('number'),
        firebaseLimit(maxResults)
      );
      
      querySnapshot = await getDocs(q);
    }
    const results = querySnapshot.docs.map(doc => {
      const data = doc.data();
      
      // Przetworz dane PO - oblicz wartości
      const productsValue = Array.isArray(data.items) 
        ? data.items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || (parseFloat(item.price) * parseFloat(item.quantity)) || 0), 0)
        : 0;
      
      let additionalCostsValue = 0;
      if (data.additionalCostsItems && Array.isArray(data.additionalCostsItems)) {
        additionalCostsValue = data.additionalCostsItems.reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0);
      } else if (data.additionalCosts) {
        additionalCostsValue = parseFloat(data.additionalCosts) || 0;
      }
      
      const vatRate = parseFloat(data.vatRate) || 23;
      const vatValue = (productsValue * vatRate) / 100;
      const calculatedGrossValue = productsValue + vatValue + additionalCostsValue;
      
      return {
        id: doc.id,
        ...data,
        calculatedProductsValue: productsValue,
        calculatedAdditionalCosts: additionalCostsValue,
        calculatedVatValue: vatValue,
        calculatedGrossValue: calculatedGrossValue,
        finalGrossValue: parseFloat(data.totalGross) || calculatedGrossValue
      };
    });
    
    return results;
  } catch (error) {
    console.error('Błąd podczas wyszukiwania PO po numerze:', error);
    return [];
  }
};

/**
 * Szybkie wyszukiwanie zamówień zakupowych dla formularzy
 * Zoptymalizowane dla autouzupełniania i szybkiego wyszukiwania
 * 
 * @param {string} searchTerm - Fraza do wyszukania
 * @param {number} maxResults - Maksymalna liczba wyników (domyślnie 20)
 * @returns {Promise<Array>} - Tablica zamówień zakupowych
 */
export const searchPurchaseOrdersQuick = async (searchTerm, maxResults = 20) => {
  try {
    if (!searchTerm || searchTerm.trim().length < 1) {
      // Dla pustego wyszukiwania zwróć najnowsze zamówienia
      const q = query(
        collection(db, PURCHASE_ORDERS_COLLECTION),
        orderBy('createdAt', 'desc'),
        firebaseLimit(maxResults)
      );
      
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    }

    // Pobierz wszystkie zamówienia do przeszukania po stronie klienta
    // (Firebase nie obsługuje fuzzy search, więc robimy to lokalnie)
    const allOrdersQuery = query(
      collection(db, PURCHASE_ORDERS_COLLECTION),
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(allOrdersQuery);
    const allOrders = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    const searchLower = searchTerm.toLowerCase().trim();
    
    // Filtruj i punktuj wyniki według trafności
    const scoredResults = allOrders
      .map(order => {
        let score = 0;
        const searchableFields = {
          number: order.number || '',
          supplierName: order.supplier?.name || '',
          supplierCompany: order.supplier?.company || '',
          notes: order.notes || '',
          deliveryAddress: order.deliveryAddress || ''
        };

        // Punktacja za dokładne dopasowania
        if (searchableFields.number.toLowerCase() === searchLower) score += 100;
        if (searchableFields.supplierName.toLowerCase() === searchLower) score += 80;
        
        // Punktacja za częściowe dopasowania
        Object.entries(searchableFields).forEach(([field, value]) => {
          if (value.toLowerCase().includes(searchLower)) {
            switch (field) {
              case 'number': score += 50; break;
              case 'supplierName': score += 30; break;
              case 'supplierCompany': score += 25; break;
              case 'notes': score += 10; break;
              case 'deliveryAddress': score += 5; break;
            }
          }
        });

        // Dodatkowa punktacja za wyszukiwanie w pozycjach zamówienia
        if (order.items && Array.isArray(order.items)) {
          order.items.forEach(item => {
            const itemName = (item.name || '').toLowerCase();
            const itemDescription = (item.description || '').toLowerCase();
            const itemProductName = (item.productName || '').toLowerCase();
            
            if (itemName.includes(searchLower) || 
                itemDescription.includes(searchLower) || 
                itemProductName.includes(searchLower)) {
              score += 15;
            }
          });
        }

        return { ...order, searchScore: score };
      })
      .filter(order => order.searchScore > 0)
      .sort((a, b) => {
        // Sortuj najpierw po wyniku, potem po dacie
        if (b.searchScore !== a.searchScore) {
          return b.searchScore - a.searchScore;
        }
        return new Date(b.createdAt?.toDate?.() || b.createdAt) - 
               new Date(a.createdAt?.toDate?.() || a.createdAt);
      })
      .slice(0, maxResults);

    console.log(`🔍 Wyszukano ${scoredResults.length} wyników dla "${searchTerm}"`);
    return scoredResults;

  } catch (error) {
    console.error('Błąd podczas szybkiego wyszukiwania PO:', error);
    throw error;
  }
};

/**
 * Pobierz najnowsze zamówienia zakupowe (dla domyślnej listy)
 * @param {number} limit - Maksymalna liczba wyników
 * @returns {Promise<Array>} - Tablica zamówień zakupowych
 */
export const getRecentPurchaseOrders = async (limit = 20) => {
  try {
    const q = query(
      collection(db, PURCHASE_ORDERS_COLLECTION),
      orderBy('createdAt', 'desc'),
      firebaseLimit(limit)
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Błąd podczas pobierania najnowszych PO:', error);
    throw error;
  }
};

/**
 * Archiwizuje zamówienie zakupowe (PO)
 */
export const archivePurchaseOrder = async (purchaseOrderId) => {
  try {
    if (!purchaseOrderId) throw new Error('ID zamówienia zakupowego jest wymagane');
    const docRef = doc(db, PURCHASE_ORDERS_COLLECTION, purchaseOrderId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error('Zamówienie zakupowe nie istnieje');

    await updateDoc(docRef, {
      archived: true,
      archivedAt: serverTimestamp(),
      archivedBy: 'manual'
    });

    purchaseOrdersCacheTimestamp = null;
    return { success: true };
  } catch (error) {
    console.error('Błąd podczas archiwizacji zamówienia zakupowego:', error);
    throw error;
  }
};

/**
 * Przywraca zamówienie zakupowe z archiwum
 */
export const unarchivePurchaseOrder = async (purchaseOrderId) => {
  try {
    if (!purchaseOrderId) throw new Error('ID zamówienia zakupowego jest wymagane');
    const docRef = doc(db, PURCHASE_ORDERS_COLLECTION, purchaseOrderId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) throw new Error('Zamówienie zakupowe nie istnieje');

    await updateDoc(docRef, {
      archived: false,
      archivedAt: deleteField()
    });

    purchaseOrdersCacheTimestamp = null;
    return { success: true };
  } catch (error) {
    console.error('Błąd podczas przywracania zamówienia zakupowego z archiwum:', error);
    throw error;
  }
};

/**
 * Przelicza status płatności PO na podstawie wpłat na powiązanych fakturach.
 * Sumuje bezpośrednie wpłaty (payments[]) ze wszystkich faktur/proform
 * przypisanych do PO i porównuje z wartością brutto PO.
 * Nie uwzględnia settledFromProformas, aby uniknąć podwójnego liczenia.
 *
 * @param {string} purchaseOrderId - ID zamówienia zakupowego
 * @param {string} userId - ID użytkownika
 * @returns {Promise<object>} - Wynik przeliczenia
 */
export const recalculatePOPaymentFromInvoices = async (purchaseOrderId, userId) => {
  try {
    if (!purchaseOrderId) {
      throw new Error('ID zamówienia zakupowego jest wymagane');
    }

    const poRef = doc(db, PURCHASE_ORDERS_COLLECTION, purchaseOrderId);
    const poDoc = await getDoc(poRef);

    if (!poDoc.exists()) {
      throw new Error(`Nie znaleziono zamówienia zakupowego o ID ${purchaseOrderId}`);
    }

    const poData = poDoc.data();
    const poTotalGross = parseFloat(poData.totalGross) || 0;

    const invoicesQuery = query(
      collection(db, 'purchaseInvoices'),
      where('sourceId', '==', purchaseOrderId),
      where('sourceType', '==', 'po')
    );
    const invoicesSnapshot = await getDocs(invoicesQuery);

    let totalPaidForPO = 0;
    let hasAnyDueDate = false;
    const invoicesSummary = [];

    invoicesSnapshot.forEach((docSnap) => {
      const inv = docSnap.data();
      if (inv.status === 'rejected') return;

      const directPayments = (inv.payments || []).reduce(
        (sum, p) => sum + (parseFloat(p.amount) || 0), 0
      );
      totalPaidForPO += directPayments;

      if (inv.dueDate) hasAnyDueDate = true;

      invoicesSummary.push({
        id: docSnap.id,
        number: inv.invoiceNumber || inv.number,
        isProforma: inv.isProforma || false,
        directPayments,
        paymentStatus: inv.paymentStatus,
      });
    });

    const poItems = poData.items || [];
    if (poItems.some(item => item.paymentDueDate)) {
      hasAnyDueDate = true;
    }

    let newPaymentStatus;
    if (poTotalGross <= 0) {
      newPaymentStatus = PURCHASE_ORDER_PAYMENT_STATUSES.UNPAID;
    } else if (totalPaidForPO >= poTotalGross - 0.01) {
      newPaymentStatus = PURCHASE_ORDER_PAYMENT_STATUSES.PAID;
    } else if (totalPaidForPO > 0.01) {
      newPaymentStatus = PURCHASE_ORDER_PAYMENT_STATUSES.PARTIALLY_PAID;
    } else if (hasAnyDueDate) {
      newPaymentStatus = PURCHASE_ORDER_PAYMENT_STATUSES.TO_BE_PAID;
    } else {
      newPaymentStatus = PURCHASE_ORDER_PAYMENT_STATUSES.UNPAID;
    }

    const oldPaymentStatus = poData.paymentStatus || PURCHASE_ORDER_PAYMENT_STATUSES.UNPAID;

    const updateFields = {
      paymentStatus: newPaymentStatus,
      totalPaidFromInvoices: totalPaidForPO,
      updatedAt: serverTimestamp(),
      updatedBy: userId,
    };

    if (oldPaymentStatus !== newPaymentStatus) {
      const paymentStatusHistory = poData.paymentStatusHistory || [];
      paymentStatusHistory.push({
        from: oldPaymentStatus,
        to: newPaymentStatus,
        changedBy: userId || 'system:manual-recalc',
        changedAt: new Date(),
        timestamp: new Date().toISOString(),
        totalPaid: totalPaidForPO,
        poTotalGross,
      });
      updateFields.paymentStatusHistory = paymentStatusHistory;
    }

    await updateDoc(poRef, updateFields);

    invalidatePOCacheForOrder(purchaseOrderId);
    updatePurchaseOrderInCache(purchaseOrderId, {
      paymentStatus: newPaymentStatus,
      totalPaidFromInvoices: totalPaidForPO,
      updatedAt: new Date(),
    });

    return {
      success: true,
      paymentStatus: newPaymentStatus,
      oldPaymentStatus,
      totalPaidFromInvoices: totalPaidForPO,
      poTotalGross,
      coveragePercent: poTotalGross > 0
        ? Math.round((totalPaidForPO / poTotalGross) * 100)
        : 0,
      invoicesCount: invoicesSummary.length,
      invoicesSummary,
    };
  } catch (error) {
    console.error('Błąd podczas przeliczania statusu płatności PO z faktur:', error);
    throw error;
  }
};