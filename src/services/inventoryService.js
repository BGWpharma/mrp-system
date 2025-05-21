// src/services/inventoryService.js
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
    increment,
    Timestamp,
    setDoc,
    writeBatch,
    limit,
    getCountFromServer,
    startAfter,
    endBefore,
    limitToLast,
    deleteField,
    collectionGroup,
    startAt,
    endAt
  } from 'firebase/firestore';
  import { 
    db, 
    storage, 
    uploadFileToStorage, 
    deleteFileFromStorage
  } from './firebase/config';
  import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
  import { generateLOTNumber } from '../utils/numberGenerators';
  // Dodaję import funkcji powiadomień
  import { createRealtimeInventoryReceiveNotification, createRealtimeBatchLocationChangeNotification } from '../services/notificationService';
  import { getAllUsers } from '../services/userService';
  
  const INVENTORY_COLLECTION = 'inventory';
  const INVENTORY_TRANSACTIONS_COLLECTION = 'inventoryTransactions';
  const INVENTORY_BATCHES_COLLECTION = 'inventoryBatches';
  const WAREHOUSES_COLLECTION = 'warehouses';
  const INVENTORY_STOCKTAKING_COLLECTION = 'stocktaking';
  const INVENTORY_STOCKTAKING_ITEMS_COLLECTION = 'stocktakingItems';
  const INVENTORY_SUPPLIER_PRICES_COLLECTION = 'inventorySupplierPrices';
  const INVENTORY_SUPPLIER_PRICE_HISTORY_COLLECTION = 'inventorySupplierPriceHistory';
  
  // ------ ZARZĄDZANIE MAGAZYNAMI ------
  
  // Pobieranie wszystkich magazynów
  export const getAllWarehouses = async () => {
    const warehousesRef = collection(db, WAREHOUSES_COLLECTION);
    const q = query(warehousesRef, orderBy('name', 'asc'));
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  };
  
  // Pobieranie magazynu po ID
  export const getWarehouseById = async (warehouseId) => {
    const docRef = doc(db, WAREHOUSES_COLLECTION, warehouseId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data()
      };
    } else {
      throw new Error('Magazyn nie istnieje');
    }
  };
  
  // Tworzenie nowego magazynu
  export const createWarehouse = async (warehouseData, userId) => {
    const warehouseWithMeta = {
      ...warehouseData,
      createdBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    const docRef = await addDoc(collection(db, WAREHOUSES_COLLECTION), warehouseWithMeta);
    
    return {
      id: docRef.id,
      ...warehouseWithMeta
    };
  };
  
  // Aktualizacja magazynu
  export const updateWarehouse = async (warehouseId, warehouseData, userId) => {
    const warehouseRef = doc(db, WAREHOUSES_COLLECTION, warehouseId);
    
    const updates = {
      ...warehouseData,
      updatedBy: userId,
      updatedAt: serverTimestamp()
    };
    
    await updateDoc(warehouseRef, updates);
    
    return {
      id: warehouseId,
      ...updates
    };
  };
  
  // Usuwanie magazynu
  export const deleteWarehouse = async (warehouseId) => {
    // Sprawdź, czy magazyn zawiera jakieś partie
    const batchesRef = collection(db, INVENTORY_BATCHES_COLLECTION);
    const q = query(batchesRef, where('warehouseId', '==', warehouseId));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.docs.length > 0) {
      throw new Error('Nie można usunąć magazynu, który zawiera partie magazynowe');
    }
    
    await deleteDoc(doc(db, WAREHOUSES_COLLECTION, warehouseId));
    return true;
  };
  
  // ------ ZARZĄDZANIE POZYCJAMI MAGAZYNOWYMI ------
  
  // Pobieranie wszystkich pozycji magazynowych z możliwością filtrowania po magazynie
  export const getAllInventoryItems = async (warehouseId = null, page = null, pageSize = null, searchTerm = null, searchCategory = null, sortField = null, sortOrder = null) => {
    try {
      // Usuwamy zbędne logowanie
      // console.log('Pobieranie pozycji magazynowych z paginacją:', { warehouseId, page, pageSize, searchTerm, searchCategory, sortField, sortOrder });
      const itemsRef = collection(db, INVENTORY_COLLECTION);
      
      // Mapowanie nazw pól sortowania na pola w bazie danych
      const fieldMapping = {
        'totalQuantity': 'quantity',
        'name': 'name',
        'category': 'category',
        'availableQuantity': 'quantity',  // Domyślnie używamy quantity, ale sortujemy po availableQuantity później
        'reservedQuantity': 'bookedQuantity'
      };

      // Konstruuj zapytanie bazowe z sortowaniem
      let q;
      
      // Określ pole do sortowania - domyślnie 'name'
      const fieldToSort = fieldMapping[sortField] || 'name';
      
      // Określ kierunek sortowania - domyślnie 'asc'
      const direction = sortOrder === 'desc' ? 'desc' : 'asc';
      
      // Utwórz zapytanie z sortowaniem
      q = query(itemsRef, orderBy(fieldToSort, direction));
      
      // Najpierw pobierz wszystkie dokumenty, aby potem filtrować (Firebase ma ograniczenia w złożonych zapytaniach)
      const allItemsSnapshot = await getDocs(q);
      let allItems = allItemsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Filtruj po terminie wyszukiwania SKU (jeśli podany)
      if (searchTerm && searchTerm.trim() !== '') {
        const searchTermLower = searchTerm.toLowerCase().trim();
        allItems = allItems.filter(item => 
          (item.name && item.name.toLowerCase().includes(searchTermLower))
        );
        // Usuwamy zbędne logowanie
        // console.log(`Znaleziono ${allItems.length} pozycji pasujących do SKU "${searchTerm}"`);
      }
      
      // Filtruj po kategorii (jeśli podana)
      if (searchCategory && searchCategory.trim() !== '') {
        const searchCategoryLower = searchCategory.toLowerCase().trim();
        allItems = allItems.filter(item => 
          (item.category && item.category.toLowerCase().includes(searchCategoryLower))
        );
        // Usuwamy zbędne logowanie
        // console.log(`Znaleziono ${allItems.length} pozycji z kategorii "${searchCategory}"`);
      }
      
      // Pobierz partie z bazy danych przed sortowaniem
      // Będziemy potrzebować tych informacji do prawidłowego sortowania po ilości
      const batchesRef = collection(db, INVENTORY_BATCHES_COLLECTION);
      const batchesCache = {};
      
      // Jeśli przekazano warehouseId, pobierz partie tylko dla danego magazynu
      if (warehouseId) {
        const warehouseBatchesQuery = query(batchesRef, where('warehouseId', '==', warehouseId));
        const warehouseBatchesSnapshot = await getDocs(warehouseBatchesQuery);
        
        // Grupuj partie według itemId
        warehouseBatchesSnapshot.docs.forEach(doc => {
          const batch = { id: doc.id, ...doc.data() };
          const itemId = batch.itemId;
          
          if (!batchesCache[itemId]) {
            batchesCache[itemId] = [];
          }
          
          batchesCache[itemId].push(batch);
        });
      } else {
        // Jeśli nie podano warehouseId, pobierz wszystkie partie
        const allBatchesQuery = query(batchesRef);
        const allBatchesSnapshot = await getDocs(allBatchesQuery);
        
        allBatchesSnapshot.docs.forEach(doc => {
          const batch = { id: doc.id, ...doc.data() };
          const itemId = batch.itemId;
          
          if (!batchesCache[itemId]) {
            batchesCache[itemId] = [];
          }
          
          batchesCache[itemId].push(batch);
        });
      }
      
      // Oblicz rzeczywiste ilości dla wszystkich pozycji na podstawie partii
      for (const item of allItems) {
        const itemBatches = batchesCache[item.id] || [];
        let totalQuantity = 0;
        
        itemBatches.forEach(batch => {
          totalQuantity += parseFloat(batch.quantity || 0);
        });
        
        // Przypisz obliczone wartości do pozycji
        item.quantity = totalQuantity;
        item.bookedQuantity = item.bookedQuantity || 0;
        item.availableQuantity = totalQuantity - (item.bookedQuantity || 0);
        item.batches = itemBatches;
        
        // Dodaj informację o magazynie, jeśli filtrujemy po konkretnym magazynie
        if (warehouseId && itemBatches.length > 0) {
          item.warehouseId = warehouseId;
        }
      }
      
      // Dla pól, które wymagają specjalnego sortowania (np. availableQuantity)
      if (sortField === 'availableQuantity') {
        // Sortowanie po ilości dostępnej (quantity - bookedQuantity)
        allItems.sort((a, b) => {
          const availableA = Number(a.availableQuantity || 0);
          const availableB = Number(b.availableQuantity || 0);
          
          return sortOrder === 'desc' ? availableB - availableA : availableA - availableB;
        });
      }
      // Dla pozostałych pól, które nie mogą być sortowane po stronie serwera
      else if (sortField === 'totalQuantity' || sortField === 'reservedQuantity') {
        // Sortowanie po stronie klienta dla pól obliczanych
        allItems.sort((a, b) => {
          let valueA, valueB;
          
          if (sortField === 'totalQuantity') {
            valueA = Number(a.quantity || 0);
            valueB = Number(b.quantity || 0);
          } else if (sortField === 'reservedQuantity') {
            valueA = Number(a.bookedQuantity || 0);
            valueB = Number(b.bookedQuantity || 0);
          }
          
          return sortOrder === 'desc' ? valueB - valueA : valueA - valueB;
        });
      }
      
      // Całkowita liczba pozycji po filtrowaniu
      const totalCount = allItems.length;
      
      // Zastosuj paginację, jeśli podano parametry paginacji
      let paginatedItems = allItems;
      
      if (page !== null && pageSize !== null) {
        const startIndex = (page - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        
        // Wyciągnij tylko pozycje dla bieżącej strony
        paginatedItems = allItems.slice(startIndex, endIndex);
      }
      
      // Zwróć obiekt z paginowanymi danymi i informacjami o paginacji
      if (page !== null && pageSize !== null) {
        return {
          items: paginatedItems,
          totalCount: totalCount,
          page: page,
          pageSize: pageSize,
          totalPages: Math.ceil(totalCount / pageSize)
        };
      }
      
      // Jeśli nie ma paginacji, zwróć wszystkie elementy
      return allItems;
    } catch (error) {
      console.error('Error fetching inventory items:', error);
      throw error;
    }
  };
  
  // Pobieranie pozycji magazynowej po ID
  export const getInventoryItemById = async (itemId) => {
    const docRef = doc(db, INVENTORY_COLLECTION, itemId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data()
      };
    } else {
      // Zamiast rzucać błąd, zwracamy null
      console.log(`Pozycja magazynowa o ID ${itemId} nie istnieje`);
      return null;
    }
  };
  
  // Pobieranie pozycji magazynowej po nazwie
  export const getInventoryItemByName = async (name) => {
    const itemsRef = collection(db, INVENTORY_COLLECTION);
    const q = query(itemsRef, where('name', '==', name));
    
    const querySnapshot = await getDocs(q);
    if (querySnapshot.docs.length > 0) {
      const doc = querySnapshot.docs[0];
      return {
        id: doc.id,
        ...doc.data()
      };
    }
    
    return null;
  };
  
  // Tworzenie nowej pozycji magazynowej
  export const createInventoryItem = async (itemData, userId) => {
    // Sprawdź, czy pozycja o takiej nazwie już istnieje
    const existingItem = await getInventoryItemByName(itemData.name);
    if (existingItem) {
      throw new Error('Pozycja magazynowa o takiej nazwie już istnieje');
    }
    
    // Usuwamy warehouseId, ponieważ teraz pozycje nie są przypisane do magazynów
    const { warehouseId, ...dataWithoutWarehouse } = itemData;
    
    const itemWithMeta = {
      ...dataWithoutWarehouse,
      quantity: Number(itemData.quantity) || 0,
      createdBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    const docRef = await addDoc(collection(db, INVENTORY_COLLECTION), itemWithMeta);
    
    return {
      id: docRef.id,
      ...itemWithMeta
    };
  };
  
  // Aktualizacja pozycji magazynowej
  export const updateInventoryItem = async (itemId, itemData, userId) => {
    const itemRef = doc(db, INVENTORY_COLLECTION, itemId);
    
    // Jeśli nazwa się zmienia, sprawdź unikalność
    if (itemData.name) {
      const currentItem = await getInventoryItemById(itemId);
      if (currentItem.name !== itemData.name) {
        const existingItem = await getInventoryItemByName(itemData.name);
        if (existingItem) {
          throw new Error('Pozycja magazynowa o takiej nazwie już istnieje');
        }
      }
    }
    
    // Usuwamy warehouseId, ponieważ teraz pozycje nie są przypisane do magazynów
    const { warehouseId, ...dataWithoutWarehouse } = itemData;
    
    const updatedItem = {
      ...dataWithoutWarehouse,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    };
    
    // Upewnij się, że quantity jest liczbą
    if (itemData.quantity !== undefined) {
      updatedItem.quantity = Number(itemData.quantity);
    }
    
    await updateDoc(itemRef, updatedItem);
    
    return {
      id: itemId,
      ...updatedItem
    };
  };
  
  // Usuwanie pozycji magazynowej
  export const deleteInventoryItem = async (itemId) => {
    try {
      // Najpierw pobierz wszystkie partie związane z tym produktem
      const batchesRef = collection(db, INVENTORY_BATCHES_COLLECTION);
      const q = query(batchesRef, where('itemId', '==', itemId));
      const batchesSnapshot = await getDocs(q);
      
      // Usuń wszystkie partie
      const batchDeletions = batchesSnapshot.docs.map(doc => 
        deleteDoc(doc.ref)
      );
      
      // Poczekaj na usunięcie wszystkich partii
      await Promise.all(batchDeletions);
      
      // Pobierz transakcje związane z tym produktem
      const transactionsRef = collection(db, INVENTORY_TRANSACTIONS_COLLECTION);
      const transactionsQuery = query(transactionsRef, where('itemId', '==', itemId));
      const transactionsSnapshot = await getDocs(transactionsQuery);
      
      // Usuń wszystkie transakcje
      const transactionDeletions = transactionsSnapshot.docs.map(doc => 
        deleteDoc(doc.ref)
      );
      
      // Poczekaj na usunięcie wszystkich transakcji
      await Promise.all(transactionDeletions);
      
      // Na końcu usuń sam produkt
      const itemRef = doc(db, INVENTORY_COLLECTION, itemId);
      await deleteDoc(itemRef);
      
      return { success: true };
    } catch (error) {
      console.error('Błąd podczas usuwania pozycji magazynowej:', error);
      throw error;
    }
  };
  
  // Pobieranie partii dla danej pozycji magazynowej
  export const getItemBatches = async (itemId, warehouseId = null) => {
    try {
      // Sprawdź czy itemId został podany
      if (!itemId) {
        throw new Error('Nie podano ID pozycji/produktu dla partii');
      }
      
      // Utwórz podstawowe zapytanie
      let q;
      
      if (warehouseId) {
        // Filtruj według ID pozycji i magazynu
        q = query(
          collection(db, INVENTORY_BATCHES_COLLECTION),
          where('itemId', '==', itemId),
          where('warehouseId', '==', warehouseId)
        );
      } else {
        // Filtruj tylko według ID pozycji
        q = query(
          collection(db, INVENTORY_BATCHES_COLLECTION),
          where('itemId', '==', itemId)
        );
      }
      
      // Wykonaj zapytanie
      const querySnapshot = await getDocs(q);
      
      // Jeśli nie znaleziono żadnych partii, zwróć pustą tablicę
      if (querySnapshot.empty) {
        console.log(`Nie znaleziono partii dla pozycji o ID ${itemId}`);
        return [];
      }
      
      // Pobierz i zwróć wyniki - bez filtrowania dat
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Error getting item batches:', error);
      throw error;
    }
  };

  // Pobieranie partii z krótkim terminem ważności (wygasające w ciągu określonej liczby dni)
  export const getExpiringBatches = async (daysThreshold = 30) => {
    const batchesRef = collection(db, INVENTORY_BATCHES_COLLECTION);
    
    // Oblicz datę graniczną (dzisiaj + daysThreshold dni)
    const today = new Date();
    const thresholdDate = new Date();
    thresholdDate.setDate(today.getDate() + daysThreshold);
    
    // Minimalna data do sprawdzenia - wyklucza daty 1.01.1970
    const minValidDate = new Date(1971, 0, 1); // 1 stycznia 1971
    
    // Używamy filtrów po stronie serwera z indeksem złożonym
    const q = query(
      batchesRef,
      where('expiryDate', '>=', Timestamp.fromDate(today)),
      where('expiryDate', '<=', Timestamp.fromDate(thresholdDate)),
      where('expiryDate', '>=', Timestamp.fromDate(minValidDate)), // Wyklucz daty wcześniejsze niż 1.01.1971
      where('quantity', '>', 0), // Tylko partie z ilością większą od 0
      orderBy('expiryDate', 'asc')
    );
    
    const querySnapshot = await getDocs(q);
    const batches = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Nadal filtrujemy po stronie klienta dla pewności
    return batches.filter(batch => {
      if (!batch.expiryDate) return false;
      
      const expiryDate = batch.expiryDate instanceof Timestamp 
        ? batch.expiryDate.toDate() 
        : new Date(batch.expiryDate);
        
      // Sprawdź czy to domyślna data (1.01.1970)
      const isDefaultDate = expiryDate.getFullYear() <= 1970;
      
      return !isDefaultDate;
    });
  };

  // Pobieranie przeterminowanych partii
  export const getExpiredBatches = async () => {
    const batchesRef = collection(db, INVENTORY_BATCHES_COLLECTION);
    
    // Dzisiejsza data
    const today = new Date();
    
    // Minimalna data do sprawdzenia - wyklucza daty 1.01.1970
    const minValidDate = new Date(1971, 0, 1); // 1 stycznia 1971
    
    // Używamy bardziej złożonego zapytania, które wykluczy daty przed 1971 rokiem
    const q1 = query(
      batchesRef,
      where('expiryDate', '<', Timestamp.fromDate(today)),
      where('expiryDate', '>=', Timestamp.fromDate(minValidDate)),
      where('quantity', '>', 0), // Tylko partie z ilością większą od 0
      orderBy('expiryDate', 'desc')
    );
    
    const querySnapshot = await getDocs(q1);
    const batches = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Nadal filtrujemy po stronie klienta dla pewności
    return batches.filter(batch => {
      if (!batch.expiryDate) return false;
      
      const expiryDate = batch.expiryDate instanceof Timestamp 
        ? batch.expiryDate.toDate() 
        : new Date(batch.expiryDate);
        
      // Sprawdź czy to domyślna data (1.01.1970)
      const isDefaultDate = expiryDate.getFullYear() <= 1970;
      
      return !isDefaultDate;
    });
  };

  // Przyjęcie towaru (zwiększenie stanu) z datą ważności
  export const receiveInventory = async (itemId, quantity, transactionData, userId) => {
    try {
      // Sprawdź, czy podano warehouseId - jest teraz wymagany
      if (!transactionData.warehouseId) {
        throw new Error('Należy określić magazyn dla przyjęcia towaru');
      }
      
      // Pobierz bieżącą pozycję
      const currentItem = await getInventoryItemById(itemId);
      
      // Skopiuj dane transakcji, aby nie modyfikować oryginalnego obiektu
      const transactionCopy = { ...transactionData };
      
      // Usuń certificateFile z danych transakcji - nie można zapisać obiektu File w Firestore
      if (transactionCopy.certificateFile) {
        delete transactionCopy.certificateFile;
      }
      
      // Dodaj transakcję
      const transaction = {
        itemId,
        itemName: currentItem.name,
        type: 'RECEIVE',
        quantity: Number(quantity),
        previousQuantity: currentItem.quantity,
        warehouseId: transactionCopy.warehouseId,
        ...transactionCopy,
        transactionDate: serverTimestamp(),
        createdBy: userId
      };
      
      // Dodaj dodatkowe pola dotyczące pochodzenia, jeśli istnieją
      if (transactionCopy.moNumber) {
        transaction.moNumber = transactionCopy.moNumber;
      }
      
      if (transactionCopy.orderNumber) {
        transaction.orderNumber = transactionCopy.orderNumber;
      }
      
      if (transactionCopy.orderId) {
        transaction.orderId = transactionCopy.orderId;
      }
      
      if (transactionCopy.source) {
        transaction.source = transactionCopy.source;
      }
      
      if (transactionCopy.sourceId) {
        transaction.sourceId = transactionCopy.sourceId;
      }
      
      const transactionRef = await addDoc(collection(db, INVENTORY_TRANSACTIONS_COLLECTION), transaction);
      
      // Generuj lub użyj istniejącego numeru partii
      let lotNumber;
      
      // Jeśli użytkownik podał numer LOT, użyj go
      if (transactionData.lotNumber && transactionData.lotNumber.trim() !== '') {
        lotNumber = transactionData.lotNumber.trim();
        console.log('Używam numeru LOT wprowadzonego przez użytkownika:', lotNumber);
      } else {
        // W przeciwnym razie generujemy nowy unikalny numer LOT
        lotNumber = await generateLOTNumber();
        console.log('Wygenerowano nowy numer LOT:', lotNumber);
      }
      
      // Przygotuj dane partii
      const batch = {
        itemId,
        itemName: currentItem.name,
        transactionId: transactionRef.id,
        quantity: Number(quantity),
        initialQuantity: Number(quantity),
        batchNumber: transactionData.batchNumber || lotNumber,
        lotNumber: lotNumber,
        warehouseId: transactionData.warehouseId, // Zawsze dodajemy warehouseId
        receivedDate: serverTimestamp(),
        notes: transactionData.batchNotes || transactionData.notes || '',
        unitPrice: transactionData.unitPrice || 0,
        createdBy: userId
      };
      
          // Obsługa certyfikatu, jeśli został przekazany
    if (transactionData.certificateFile) {
      try {
        const certificateFile = transactionData.certificateFile;
        
        // Funkcja pomocnicza do konwersji pliku na string base64
        const fileToBase64 = (file) => {
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = (error) => reject(error);
          });
        };
        
        // Konwertuj plik na base64
        const base64Data = await fileToBase64(certificateFile);
        
        // Sprawdź rozmiar pliku po konwersji
        const base64Size = base64Data.length;
        const fileSizeInMB = base64Size / (1024 * 1024);
        
        // Firestore ma limit 1MB na dokument, więc sprawdzamy czy plik nie jest za duży
        if (fileSizeInMB > 0.9) {
          console.error(`Plik certyfikatu jest zbyt duży (${fileSizeInMB.toFixed(2)} MB). Maksymalny rozmiar to 0.9 MB.`);
          throw new Error(`Plik certyfikatu jest zbyt duży (${fileSizeInMB.toFixed(2)} MB). Maksymalny rozmiar to 0.9 MB.`);
        }
        
        // Dodaj informacje o certyfikacie do partii
        batch.certificateFileName = certificateFile.name;
        batch.certificateContentType = certificateFile.type;
        batch.certificateBase64 = base64Data;
        batch.certificateUploadedAt = serverTimestamp();
        batch.certificateUploadedBy = userId;
        
        console.log('Dodano certyfikat do partii:', certificateFile.name);
      } catch (certificateError) {
        console.error('Błąd podczas przetwarzania certyfikatu:', certificateError);
        // Nie przerywamy całej operacji, tylko logujemy błąd
      }
    }
      
      // Ustaw datę ważności tylko jeśli została jawnie podana
      // Dzięki temu unikniemy automatycznej konwersji null -> 1.01.1970
      if (transactionData.expiryDate) {
        batch.expiryDate = transactionData.expiryDate;
      }
      
      // Dodaj informacje o pochodzeniu partii
      if (transactionData.moNumber) {
        batch.moNumber = transactionData.moNumber;
      }
      
      if (transactionData.orderNumber) {
        batch.orderNumber = transactionData.orderNumber;
      }
      
      if (transactionData.orderId) {
        batch.orderId = transactionData.orderId;
      }
      
      if (transactionData.source) {
        batch.source = transactionData.source;
      }
      
      if (transactionData.sourceId) {
        batch.sourceId = transactionData.sourceId;
      }
      
      // Dodaj dodatkowe dane w strukturze sourceDetails dla lepszej organizacji
      if (transactionData.source === 'production' || transactionData.reason === 'production') {
        batch.sourceDetails = {
          moNumber: transactionData.moNumber || null,
          orderNumber: transactionData.orderNumber || null,
          orderId: transactionData.orderId || null,
          sourceType: 'production',
          sourceId: transactionData.sourceId || null
        };
      }
      
      // Dodaj szczegółowe dane o zamówieniu zakupu, jeśli przyjęcie pochodzi z PO
      if (transactionData.source === 'purchase' || transactionData.reason === 'purchase') {
        // Pobierz pełne dane o zamówieniu zakupu
        let poId = transactionData.orderId;
        if (poId) {
          try {
            const { getPurchaseOrderById } = await import('./purchaseOrderService');
            const poData = await getPurchaseOrderById(poId);
            
            // Zapisz szczegółowe informacje o PO w partii
            batch.purchaseOrderDetails = {
              id: poId,
              number: poData.number || transactionData.orderNumber || null,
              status: poData.status || null,
              supplier: poData.supplier ? {
                id: poData.supplier.id || null,
                name: poData.supplier.name || null,
                code: poData.supplier.code || null
              } : null,
              orderDate: poData.orderDate || null,
              deliveryDate: poData.expectedDeliveryDate || poData.deliveryDate || null,
              // Zapisz ID pozycji zamówienia - to ważne dla powiązania LOT z konkretną pozycją w PO
              itemPoId: transactionData.itemPOId || null,
              invoiceNumber: poData.invoiceNumber || null,
              invoiceLink: poData.invoiceLink || null
            };
            
            // Zapisz również w starszym formacie dla kompatybilności
            batch.sourceDetails = {
              sourceType: 'purchase',
              orderId: poId || null,
              orderNumber: poData.number || transactionData.orderNumber || null,
              supplierId: poData.supplier?.id || null,
              supplierName: poData.supplier?.name || null,
              // Zapisz ID pozycji zamówienia również w starszym formacie
              itemPoId: transactionData.itemPOId || null
            };
            
            // Aktualizuj cenę jednostkową na podstawie dodatkowych kosztów z PO
            if (poData && (poData.additionalCostsItems || poData.additionalCosts)) {
              try {
                let additionalCostsTotal = 0;
                
                // Oblicz sumę dodatkowych kosztów z nowego formatu additionalCostsItems
                if (poData.additionalCostsItems && Array.isArray(poData.additionalCostsItems)) {
                  additionalCostsTotal = poData.additionalCostsItems.reduce((sum, cost) => {
                    return sum + (parseFloat(cost.value) || 0);
                  }, 0);
                }
                // Dla wstecznej kompatybilności - stare pole additionalCosts
                else if (poData.additionalCosts) {
                  additionalCostsTotal = parseFloat(poData.additionalCosts) || 0;
                }
                
                // Oblicz całkowitą ilość produktów w zamówieniu
                let totalProductQuantity = 0;
                if (poData.items && Array.isArray(poData.items)) {
                  totalProductQuantity = poData.items.reduce((sum, item) => {
                    // Użyj pola initialQuantity (jeśli dostępne), w przeciwnym razie quantity
                    const quantity = item.initialQuantity !== undefined ? parseFloat(item.initialQuantity) : parseFloat(item.quantity);
                    return sum + (quantity || 0);
                  }, 0);
                }
                
                // Jeśli mamy dodatkowe koszty i ilość produktów > 0, oblicz dodatkowy koszt na jednostkę
                if (additionalCostsTotal > 0 && totalProductQuantity > 0) {
                  // Pobierz ilość przyjmowanej partii
                  const batchQuantity = Number(quantity);
                  
                  // Oblicz proporcjonalny udział dodatkowych kosztów dla tej partii
                  const batchProportion = batchQuantity / totalProductQuantity;
                  const batchAdditionalCostTotal = additionalCostsTotal * batchProportion;
                  
                  // Oblicz dodatkowy koszt na jednostkę dla tej konkretnej partii
                  const additionalCostPerUnit = batchQuantity > 0 
                    ? batchAdditionalCostTotal / batchQuantity 
                    : 0;
                  
                  // Aktualizuj cenę jednostkową w partii
                  let baseUnitPrice = parseFloat(transactionData.unitPrice) || 0;
                  
                  // Dodaj informację o dodatkowym koszcie jako osobne pole
                  batch.additionalCostPerUnit = additionalCostPerUnit;
                  
                  // Aktualizuj cenę jednostkową - dodaj dodatkowy koszt na jednostkę
                  batch.unitPrice = baseUnitPrice + additionalCostPerUnit;
                  
                  // Zachowaj oryginalną cenę jednostkową
                  batch.baseUnitPrice = baseUnitPrice;
                  
                  console.log(`Zaktualizowano cenę jednostkową partii z ${baseUnitPrice} na ${batch.unitPrice} (dodatkowy koszt: ${additionalCostPerUnit} per jednostka, proporcja: ${batchProportion}, koszt całkowity partii: ${batchAdditionalCostTotal})`);
                }
              } catch (error) {
                console.error('Błąd podczas aktualizacji ceny jednostkowej na podstawie dodatkowych kosztów:', error);
              }
            }
          } catch (error) {
            console.error('Błąd podczas pobierania szczegółów PO:', error);
            // Dodaj podstawowe informacje nawet jeśli wystąpił błąd
            batch.purchaseOrderDetails = {
              id: poId || null,
              number: transactionData.orderNumber || null
            };
            
            batch.sourceDetails = {
              sourceType: 'purchase',
              orderId: poId || null,
              orderNumber: transactionData.orderNumber || null
            };
          }
        }
      }
      
      // Dodaj partię
      if (transactionData.addBatch !== false) {
        await addDoc(collection(db, INVENTORY_BATCHES_COLLECTION), batch);
      }
      
      // Zamiast bezpośrednio aktualizować ilość, przelicz ją na podstawie partii
      await recalculateItemQuantity(itemId);
      
      // Aktualizuj tylko pole unitPrice w głównej pozycji magazynowej, jeśli podano
      if (transactionData.unitPrice !== undefined) {
        const itemRef = doc(db, INVENTORY_COLLECTION, itemId);
        await updateDoc(itemRef, {
          unitPrice: transactionData.unitPrice,
          updatedAt: serverTimestamp(),
          updatedBy: userId
        });
      }
      
      // Jeśli przyjęcie jest związane z zamówieniem zakupowym, zaktualizuj ilość odebranych produktów
      if (transactionData.source === 'purchase' || transactionData.reason === 'purchase' || transactionData.orderNumber) {
        try {
          // Importuj funkcję do aktualizacji zamówienia zakupowego
          const { updatePurchaseOrderReceivedQuantity } = await import('./purchaseOrderService');
          
          // Jeśli mamy orderId, użyj go, w przeciwnym razie spróbuj znaleźć zamówienie po numerze
          let poId = transactionData.orderId;
          
          // Jeśli nie mamy ID, ale mamy numer zamówienia, spróbuj pobrać zamówienie na podstawie numeru
          if (!poId && transactionData.orderNumber) {
            try {
              const { db } = await import('./firebase/config');
              const { collection, query, where, getDocs } = await import('firebase/firestore');
              
              const poQuery = query(
                collection(db, 'purchaseOrders'),
                where('number', '==', transactionData.orderNumber)
              );
              
              const querySnapshot = await getDocs(poQuery);
              if (!querySnapshot.empty) {
                poId = querySnapshot.docs[0].id;
                console.log(`Znaleziono zamówienie zakupowe o numerze ${transactionData.orderNumber}, ID: ${poId}`);
              }
            } catch (error) {
              console.error('Błąd podczas wyszukiwania PO po numerze:', error);
            }
          }
          
          // Aktualizuj zamówienie, jeśli znaleźliśmy ID oraz ID produktu
          if (poId) {
            let itemPoId = transactionData.itemPOId || itemId;
            
            console.log(`Aktualizacja ilości odebranej dla PO ${poId}, produkt ${itemPoId}, ilość: ${quantity}`);
            await updatePurchaseOrderReceivedQuantity(
              poId, 
              itemPoId, 
              Number(quantity),
              userId
            );
          } else {
            console.warn(`Nie znaleziono identyfikatora zamówienia dla numeru ${transactionData.orderNumber}`);
          }
        } catch (error) {
          console.error('Błąd podczas aktualizacji zamówienia zakupowego:', error);
          // Kontynuuj mimo błędu - przyjęcie towaru jest ważniejsze
        }
      }
      
      // Emituj zdarzenie o zmianie stanu magazynu
      const event = new CustomEvent('inventory-updated', { 
        detail: { itemId, action: 'receive', quantity: Number(quantity) }
      });
      window.dispatchEvent(event);
      
      // Wyślij powiadomienie o przyjęciu towaru na magazyn
      try {
        // Pobierz nazwę magazynu
        const warehouseRef = doc(db, WAREHOUSES_COLLECTION, transactionData.warehouseId);
        const warehouseSnap = await getDoc(warehouseRef);
        const warehouseName = warehouseSnap.exists() ? warehouseSnap.data().name : 'Nieznany';
        
        // Pobierz użytkowników z rolami administratora i magazynu do powiadomienia
        const allUsers = await getAllUsers();
        
        // Filtruj użytkowników według ról
        const adminUsers = allUsers.filter(user => user.role === 'administrator');
        const warehouseUsers = allUsers.filter(user => user.role === 'warehouse' || user.role === 'magazynier');
        
        // Stwórz tablicę unikalnych identyfikatorów użytkowników
        const userIdsToNotify = [...new Set([
          ...adminUsers.map(user => user.id),
          ...warehouseUsers.map(user => user.id)
        ])];
        
        if (userIdsToNotify.length > 0) {
          // Utwórz i wyślij powiadomienie
          await createRealtimeInventoryReceiveNotification(
            userIdsToNotify,
            itemId,
            currentItem.name,
            Number(quantity),
            transactionData.warehouseId,
            warehouseName,
            batch.lotNumber,
            transactionData.source || 'other',
            transactionData.sourceId || null,
            userId
          );
          console.log('Wysłano powiadomienie o przyjęciu towaru na magazyn');
        }
      } catch (notificationError) {
        console.error('Błąd podczas wysyłania powiadomienia o przyjęciu towaru:', notificationError);
        // Kontynuuj mimo błędu - przyjęcie towaru jest ważniejsze
      }
      
      return {
        id: itemId,
        quantity: await getInventoryItemById(itemId).then(item => item.quantity)
      };
    } catch (error) {
      console.error('Error receiving inventory:', error);
      throw error;
    }
  };

  // Wydanie towaru (zmniejszenie stanu) z uwzględnieniem partii (FEFO)
  export const issueInventory = async (itemId, quantity, transactionData, userId) => {
    // Sprawdź, czy podano warehouseId - jest teraz wymagany
    if (!transactionData.warehouseId) {
      throw new Error('Należy określić magazyn dla wydania towaru');
    }

    // Pobierz bieżącą pozycję
    const currentItem = await getInventoryItemById(itemId);
    
    // Pobierz partie w danym magazynie
    const batches = await getItemBatches(itemId, transactionData.warehouseId);
    
    // Oblicz dostępną ilość w magazynie (suma ilości we wszystkich partiach)
    const availableQuantity = batches.reduce((sum, batch) => sum + (batch.quantity || 0), 0);
    
    // Sprawdź, czy jest wystarczająca ilość w danym magazynie
    if (availableQuantity < Number(quantity)) {
      throw new Error(`Niewystarczająca ilość towaru w magazynie. Dostępne: ${availableQuantity}`);
    }
    
    // Dodaj transakcję
    const transaction = {
      itemId,
      itemName: currentItem.name,
      type: 'ISSUE',
      quantity: Number(quantity),
      previousQuantity: currentItem.quantity,
      warehouseId: transactionData.warehouseId,
      ...transactionData,
      transactionDate: serverTimestamp(),
      createdBy: userId
    };
    
    await addDoc(collection(db, INVENTORY_TRANSACTIONS_COLLECTION), transaction);
    
    // Jeśli podano konkretną partię do wydania
    if (transactionData.batchId) {
      const batchRef = doc(db, INVENTORY_BATCHES_COLLECTION, transactionData.batchId);
      const batchDoc = await getDoc(batchRef);
      
      if (batchDoc.exists()) {
        const batchData = batchDoc.data();
        
        // Sprawdź czy partia jest w wybranym magazynie
        if (batchData.warehouseId !== transactionData.warehouseId) {
          throw new Error('Wybrana partia nie znajduje się w wybranym magazynie');
        }
        
        if (batchData.quantity < Number(quantity)) {
          throw new Error('Niewystarczająca ilość w wybranej partii');
        }
        
        await updateDoc(batchRef, {
          quantity: increment(-Number(quantity)),
          updatedAt: serverTimestamp()
        });
      }
    } else {
      // Automatyczne wydanie według FEFO (First Expired, First Out)
      let remainingQuantity = Number(quantity);
      
      // Sortuj partie według daty ważności (najwcześniej wygasające pierwsze)
      const sortedBatches = batches
        .filter(batch => batch.quantity > 0 && batch.warehouseId === transactionData.warehouseId)
        .sort((a, b) => {
          const dateA = a.expiryDate instanceof Timestamp ? a.expiryDate.toDate() : new Date(a.expiryDate);
          const dateB = b.expiryDate instanceof Timestamp ? b.expiryDate.toDate() : new Date(b.expiryDate);
          return dateA - dateB;
        });
      
      for (const batch of sortedBatches) {
        if (remainingQuantity <= 0) break;
        
        const quantityFromBatch = Math.min(batch.quantity, remainingQuantity);
        remainingQuantity -= quantityFromBatch;
        
        // Aktualizuj ilość w partii
        const batchRef = doc(db, INVENTORY_BATCHES_COLLECTION, batch.id);
        await updateDoc(batchRef, {
          quantity: increment(-quantityFromBatch),
          updatedAt: serverTimestamp()
        });
      }
    }

    // Przelicz i zaktualizuj ilość głównej pozycji na podstawie partii
    await recalculateItemQuantity(itemId);
    
    // Emituj zdarzenie o zmianie stanu magazynu
    const event = new CustomEvent('inventory-updated', { 
      detail: { itemId, action: 'issue', quantity: Number(quantity) }
    });
    window.dispatchEvent(event);
    
    return {
      success: true,
      message: `Wydano ${quantity} ${currentItem.unit} produktu ${currentItem.name}`
    };
  };

  // Pobieranie historii partii dla danej pozycji
  export const getItemBatchHistory = async (itemId) => {
    try {
      const batchesRef = collection(db, INVENTORY_BATCHES_COLLECTION);
      const q = query(
        batchesRef,
        where('itemId', '==', itemId),
        orderBy('createdAt', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        expiryDate: doc.data().expiryDate?.toDate() || null
      }));
    } catch (error) {
      console.error('Error getting batch history:', error);
      throw error;
    }
  };
  
  /**
   * Pobiera wszystkie transakcje dla danego produktu
   * @param {string} itemId - ID produktu
   * @returns {Promise<Array>} - Lista transakcji
   */
  export const getItemTransactions = async (itemId) => {
    try {
      const transactionsRef = collection(db, INVENTORY_TRANSACTIONS_COLLECTION);
      const q = query(
        transactionsRef,
        where('itemId', '==', itemId),
        orderBy('createdAt', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      
      // Pobierz wszystkie transakcje
      const transactions = querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt ? data.createdAt.toDate() : null
        };
      });
      
      // Uzupełnij informacje o zadaniach produkcyjnych dla transakcji rezerwacji
      for (const transaction of transactions) {
        if ((transaction.type === 'booking' || transaction.type === 'booking_cancel') && transaction.referenceId) {
          try {
            // Zawsze sprawdzaj aktualny stan zadania produkcyjnego
            const taskRef = doc(db, 'productionTasks', transaction.referenceId);
            const taskDoc = await getDoc(taskRef);
            
            if (taskDoc.exists()) {
              const taskData = taskDoc.data();
              // Aktualizuj dane w transakcji
              transaction.taskName = taskData.name || '';
              transaction.taskNumber = taskData.number || '';
              // Dodawaj informacje o numerze MO
              transaction.moNumber = taskData.moNumber || '';
              transaction.clientName = taskData.clientName || '';
              transaction.clientId = taskData.clientId || '';
              
              // Zaktualizuj transakcję w bazie danych
              await updateDoc(doc(transactionsRef, transaction.id), {
                taskName: transaction.taskName,
                taskNumber: transaction.taskNumber,
                moNumber: transaction.moNumber,
                clientName: transaction.clientName,
                clientId: transaction.clientId
              });
            }
          } catch (error) {
            console.error('Błąd podczas pobierania danych zadania:', error);
            // Kontynuuj, nawet jeśli nie udało się pobrać danych zadania
          }
          
          // Sprawdź, czy mamy informacje o partii dla rezerwacji
          if (!transaction.batchId && transaction.type === 'booking') {
            try {
              // Znajdź partie dla tego zadania w danych zadania
              const taskRef = doc(db, 'productionTasks', transaction.referenceId);
              const taskDoc = await getDoc(taskRef);
              
              if (taskDoc.exists()) {
                const taskData = taskDoc.data();
                const materialBatches = taskData.materialBatches || {};
                
                if (materialBatches[itemId] && materialBatches[itemId].length > 0) {
                  const firstBatch = materialBatches[itemId][0];
                  transaction.batchId = firstBatch.batchId;
                  transaction.batchNumber = firstBatch.batchNumber;
                  
                  // Zaktualizuj transakcję, aby zapisać informacje o partii
                  await updateDoc(doc(transactionsRef, transaction.id), {
                    batchId: transaction.batchId,
                    batchNumber: transaction.batchNumber
                  });
                }
              }
            } catch (error) {
              console.error('Błąd podczas pobierania danych o partiach:', error);
            }
          }
        }
      }
      
      return transactions;
    } catch (error) {
      console.error('Error fetching item transactions:', error);
      throw error;
    }
  };
  
  // Pobieranie wszystkich transakcji
  export const getAllTransactions = async (limit = 50) => {
    const transactionsRef = collection(db, INVENTORY_TRANSACTIONS_COLLECTION);
    const q = query(
      transactionsRef, 
      orderBy('transactionDate', 'desc'),
      limit ? limit : undefined
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  };

  /**
   * Pobiera ceny wszystkich składników lub określonych składników
   * @param {Array} ingredientIds - Opcjonalna lista ID składników do pobrania
   * @param {Object} options - Opcje pobierania cen
   * @returns {Object} - Mapa cen składników (id -> cena)
   */
  export const getIngredientPrices = async (ingredientIds = null, options = {}) => {
    try {
      // Opcje
      const { useBatchPrices = true } = options;
      
      let itemsQuery;
      let querySnapshot;
      
      // Logowanie dla celów diagnostycznych
      console.log('Żądane ID składników:', ingredientIds);
      
      if (ingredientIds && ingredientIds.length > 0) {
        // Pobierz wszystkie składniki i filtruj po stronie klienta
        // Nie używamy where('id', 'in', ingredientIds), ponieważ szukamy po ID dokumentu, a nie po polu 'id'
        itemsQuery = collection(db, INVENTORY_COLLECTION);
        querySnapshot = await getDocs(itemsQuery);
      } else {
        // Pobierz wszystkie składniki
        itemsQuery = collection(db, INVENTORY_COLLECTION);
        querySnapshot = await getDocs(itemsQuery);
      }
      
      const pricesMap = {};
      const itemsToFetchBatches = [];
      
      // Najpierw pobierz ceny z pozycji magazynowych
      querySnapshot.forEach((doc) => {
        const item = doc.data();
        const itemId = doc.id;
        
        // Jeśli mamy listę ID i element nie jest na liście, pomiń go
        if (ingredientIds && ingredientIds.length > 0 && !ingredientIds.includes(itemId)) {
          return;
        }
        
        // Zapisz cenę jednostkową składnika
        pricesMap[itemId] = {
          itemPrice: item.unitPrice || 0,
          batchPrice: null, // Będzie uzupełnione później, jeśli dostępne
          name: item.name || 'Nieznany składnik'
        };
        
        // Dodaj do listy elementów, dla których chcemy pobrać partie
        if (useBatchPrices) {
          itemsToFetchBatches.push(itemId);
        }
      });
      
      // Sprawdź, czy wszystkie żądane składniki zostały znalezione
      if (ingredientIds) {
        ingredientIds.forEach(id => {
          if (!pricesMap[id]) {
            console.warn(`Nie znaleziono składnika o ID: ${id} w magazynie`);
            // Dodaj pusty wpis, aby uniknąć błędów przy dostępie do pricesMap[id]
            pricesMap[id] = {
              itemPrice: 0,
              batchPrice: 0,
              name: 'Nieznaleziony składnik'
            };
          }
        });
      }
      
      // Jeśli mamy używać cen z partii, pobierz je
      if (useBatchPrices && itemsToFetchBatches.length > 0) {
        // Dla każdego składnika pobierz partie i użyj ceny z najnowszej partii
        for (const itemId of itemsToFetchBatches) {
          try {
            const batches = await getItemBatches(itemId);
            
            // Znajdź najnowszą partię z ceną i ilością > 0
            const validBatches = batches
              .filter(batch => batch.quantity > 0 && batch.unitPrice !== undefined && batch.unitPrice > 0)
              .sort((a, b) => {
                // Sortuj od najnowszej do najstarszej
                const dateA = a.receivedDate instanceof Date ? a.receivedDate : new Date(a.receivedDate);
                const dateB = b.receivedDate instanceof Date ? b.receivedDate : new Date(b.receivedDate);
                return dateB - dateA;
              });
            
            // Jeśli znaleziono partię z ceną, użyj jej
            if (validBatches.length > 0) {
              pricesMap[itemId].batchPrice = validBatches[0].unitPrice;
            } else {
              console.warn(`Nie znaleziono ważnych partii z ceną dla składnika ${itemId}`);
            }
          } catch (error) {
            console.error(`Błąd podczas pobierania partii dla składnika ${itemId}:`, error);
            // Kontynuuj z następnym składnikiem
          }
        }
      }
      
      console.log('Pobrane ceny składników:', pricesMap);
      return pricesMap;
    } catch (error) {
      console.error('Błąd podczas pobierania cen składników:', error);
      throw error;
    }
  };

  // Aktualizacja danych partii
  export const updateBatch = async (batchId, batchData, userId) => {
    try {
      const batchRef = doc(db, INVENTORY_BATCHES_COLLECTION, batchId);
      
      // Pobierz aktualne dane partii
      const batchDoc = await getDoc(batchRef);
      if (!batchDoc.exists()) {
        throw new Error('Partia nie istnieje');
      }
      
      const currentBatch = batchDoc.data();
      const itemId = currentBatch.itemId;
      
      // Sprawdź, czy zmieniono ilość
      const quantityChanged = batchData.quantity !== undefined && 
        currentBatch.quantity !== batchData.quantity;
      
      // Przygotuj dane do aktualizacji
      const updateData = {
        ...batchData,
        updatedAt: serverTimestamp(),
        updatedBy: userId
      };
      
      // Jeśli zmieniono datę ważności, konwertuj ją na Timestamp lub usuń pole
      if (batchData.noExpiryDate === true || batchData.expiryDate === null) {
        // Jeśli zaznaczono "brak terminu ważności" lub explicite ustawiono na null
        updateData.expiryDate = deleteField();
      } else if (batchData.expiryDate && batchData.expiryDate instanceof Date) {
        updateData.expiryDate = Timestamp.fromDate(batchData.expiryDate);
      }
      
      // Aktualizuj partię
      await updateDoc(batchRef, updateData);
      
      // Jeśli zmieniono ilość, zaktualizuj główną pozycję magazynową
      if (quantityChanged && itemId) {
        // Dodaj wpis w historii transakcji
        if (currentBatch.quantity !== batchData.quantity) {
          const transactionType = currentBatch.quantity < batchData.quantity ? 'adjustment_add' : 'adjustment_remove';
          const qtyDiff = Math.abs(currentBatch.quantity - batchData.quantity);
          
          const transactionRef = doc(collection(db, INVENTORY_TRANSACTIONS_COLLECTION));
          await setDoc(transactionRef, {
            itemId,
            itemName: currentBatch.itemName,
            type: transactionType,
            quantity: qtyDiff,
            date: serverTimestamp(),
            reason: 'Korekta ilości partii',
            reference: `Partia: ${currentBatch.batchNumber || currentBatch.lotNumber || batchId}`,
            notes: `Ręczna korekta ilości partii z ${currentBatch.quantity} na ${batchData.quantity}`,
            batchId: batchId,
            batchNumber: currentBatch.batchNumber || currentBatch.lotNumber || 'Bez numeru',
            createdBy: userId,
            createdAt: serverTimestamp()
          });
        }
        
        // Przelicz ilość całkowitą w pozycji magazynowej
        await recalculateItemQuantity(itemId);
      }
      
      return {
        id: batchId,
        ...currentBatch,
        ...updateData
      };
    } catch (error) {
      console.error('Error updating batch:', error);
      throw error;
    }
  };

  // Pobranie informacji o rezerwacjach dla konkretnej partii
  export const getBatchReservations = async (batchId) => {
    try {
      if (!batchId) {
        return [];
      }
      
      // Pobierz transakcje z typem 'booking' dla danej partii
      const transactionsRef = collection(db, INVENTORY_TRANSACTIONS_COLLECTION);
      const q = query(
        transactionsRef,
        where('batchId', '==', batchId),
        where('type', '==', 'booking')
      );
      
      const querySnapshot = await getDocs(q);
      let reservations = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Uwzględnij anulowania rezerwacji (booking_cancel)
      const cancelQuery = query(
        transactionsRef,
        where('batchId', '==', batchId),
        where('type', '==', 'booking_cancel')
      );
      
      const cancelSnapshot = await getDocs(cancelQuery);
      const cancellations = cancelSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Dla każdej anulowanej rezerwacji, odejmij ją od odpowiedniej rezerwacji
      // Grupujemy anulowania po taskId
      const cancellationsByTask = {};
      cancellations.forEach(cancel => {
        const taskId = cancel.taskId || cancel.referenceId;
        if (!taskId) return;
        
        if (!cancellationsByTask[taskId]) {
          cancellationsByTask[taskId] = 0;
        }
        cancellationsByTask[taskId] += cancel.quantity || 0;
      });
      
      // Modyfikujemy rezerwacje o anulowania
      reservations = reservations.map(reservation => {
        const taskId = reservation.taskId || reservation.referenceId;
        if (!taskId) return reservation;
        
        const cancelledQuantity = cancellationsByTask[taskId] || 0;
        return {
          ...reservation,
          quantity: Math.max(0, (reservation.quantity || 0) - cancelledQuantity)
        };
      });
      
      // Usuń rezerwacje o ilości 0
      reservations = reservations.filter(reservation => (reservation.quantity || 0) > 0);
      
      return reservations;
    } catch (error) {
      console.error('Błąd podczas pobierania rezerwacji partii:', error);
      return [];
    }
  };

  // Bookowanie produktu na zadanie produkcyjne
  export const bookInventoryForTask = async (itemId, quantity, taskId, userId, reservationMethod = 'expiry', batchId = null) => {
    try {
      console.log(`[DEBUG] Rozpoczynam rezerwację dla itemId=${itemId}, quantity=${quantity}, taskId=${taskId}, method=${reservationMethod}, batchId=${batchId}`);
      
      // Sprawdź, czy ta partia jest już zarezerwowana dla tego zadania
      if (batchId) {
        const existingReservations = await getBatchReservations(batchId);
        const alreadyReservedForTask = existingReservations.find(r => r.taskId === taskId);
        
        if (alreadyReservedForTask) {
          console.log(`[DEBUG] Partia ${batchId} jest już zarezerwowana dla zadania ${taskId}. Pomijam ponowną rezerwację.`);
          return {
            success: true,
            message: `Partia jest już zarezerwowana dla tego zadania`,
            reservedBatches: [{
              batchId: batchId,
              quantity: alreadyReservedForTask.quantity,
              batchNumber: alreadyReservedForTask.batchNumber || 'Bez numeru'
            }]
          };
        }
      }
      
      // Sprawdź, czy pozycja magazynowa istnieje
      let item;
      try {
        item = await getInventoryItemById(itemId);
      } catch (error) {
        if (error.message === 'Pozycja magazynowa nie istnieje') {
          console.warn(`Pozycja magazynowa o ID ${itemId} nie istnieje, pomijam rezerwację`);
          return {
            success: false,
            message: `Pozycja magazynowa o ID ${itemId} nie istnieje`
          };
        }
        throw error;
      }
      
      // Pobierz partie dla tego materiału i oblicz dostępną ilość
      const allBatches = await getItemBatches(itemId);
      const availableQuantity = allBatches.reduce((sum, batch) => sum + (batch.quantity || 0), 0);
      
      // Sprawdź, czy jest wystarczająca ilość produktu po uwzględnieniu już zarezerwowanych ilości
      // Oblicz rzeczywiście dostępną ilość odejmując ilość już zarezerwowaną
      const effectivelyAvailable = availableQuantity - (item.bookedQuantity || 0);
      
      // Sprawdź, czy jest wystarczająca ilość produktu
      if (effectivelyAvailable < quantity) {
        throw new Error(`Niewystarczająca ilość produktu w magazynie po uwzględnieniu rezerwacji. 
        Dostępne fizycznie: ${availableQuantity} ${item.unit}, 
        Zarezerwowane: ${item.bookedQuantity || 0} ${item.unit}, 
        Efektywnie dostępne: ${effectivelyAvailable} ${item.unit},
        Wymagane: ${quantity} ${item.unit}`);
      }
      
      // Pobierz dane zadania produkcyjnego na początku funkcji
      const taskRef = doc(db, 'productionTasks', taskId);
      const taskDoc = await getDoc(taskRef);
      
      let taskData = {};
      let taskName = '';
      let taskNumber = '';
      let clientName = '';
      let clientId = '';
      
      if (taskDoc.exists()) {
        taskData = taskDoc.data();
        taskName = taskData.name || '';
        taskNumber = taskData.number || '';
        clientName = taskData.clientName || '';
        clientId = taskData.clientId || '';
      } else {
        console.warn(`Zadanie produkcyjne o ID ${taskId} nie istnieje`);
      }
      
      // Zapisz log dla diagnostyki
      console.log(`Rezerwacja dla zadania: MO=${taskNumber}, nazwa=${taskName}`);
      
      // Aktualizuj pole bookedQuantity w produkcie
      const itemRef = doc(db, INVENTORY_COLLECTION, itemId);
      
      // Jeśli pole bookedQuantity nie istnieje, utwórz je
      if (item.bookedQuantity === undefined) {
        await updateDoc(itemRef, {
          bookedQuantity: quantity,
          updatedAt: serverTimestamp(),
          updatedBy: userId
        });
      } else {
        // W przeciwnym razie zwiększ istniejącą wartość
        await updateDoc(itemRef, {
          bookedQuantity: increment(quantity),
          updatedAt: serverTimestamp(),
          updatedBy: userId
        });
      }
      
      console.log(`Rezerwacja materiału, metoda: ${reservationMethod}`);
      
      // Pobierz partie dla tego materiału
      const batchesRef = collection(db, INVENTORY_BATCHES_COLLECTION);
      const q = query(
        batchesRef, 
        where('itemId', '==', itemId),
        where('quantity', '>', 0)
      );
      
      const batchesSnapshot = await getDocs(q);
      const batches = batchesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Zapisz informacje o zarezerwowanych partiach
      const reservedBatches = [];
      let remainingQuantity = quantity;
      let selectedBatchId = batchId || ''; // Użyj przekazanej partii, jeśli została podana
      let selectedBatchNumber = '';
      
      // Jeśli podano konkretną partię (ręczny wybór), użyj tylko tej partii
      if (batchId) {
        const selectedBatch = batches.find(batch => batch.id === batchId);
        
        if (!selectedBatch) {
          throw new Error(`Nie znaleziono partii o ID ${batchId}`);
        }
        
        // Oblicz rzeczywiście dostępną ilość w partii (z uwzględnieniem rezerwacji)
        // Pobranie szczegółowych informacji o partii i jej rezerwacjach  
        let availableQuantityInBatch = selectedBatch.quantity;
        
        // Pobierz informacje o rezerwacjach tej partii
        const batchReservations = await getBatchReservations(batchId);
        const batchBookedQuantity = batchReservations.reduce((sum, reservation) => {
          // Nie wliczaj rezerwacji z aktualnego zadania, jeśli edytujemy istniejącą rezerwację
          if (reservation.taskId === taskId) return sum;
          return sum + (reservation.quantity || 0);
        }, 0);
        
        // Oblicz faktycznie dostępną ilość w partii
        const effectivelyAvailableInBatch = availableQuantityInBatch - batchBookedQuantity;
        
        // Sprawdź czy jest wystarczająca ilość w partii
        if (effectivelyAvailableInBatch < quantity) {
          throw new Error(`Niewystarczająca ilość w partii po uwzględnieniu rezerwacji. 
          Dostępne fizycznie: ${availableQuantityInBatch} ${item.unit}, 
          Zarezerwowane przez inne MO: ${batchBookedQuantity} ${item.unit}, 
          Efektywnie dostępne: ${effectivelyAvailableInBatch} ${item.unit},
          Wymagane: ${quantity} ${item.unit}`);
        }
        
        // Zachowaj informacje o partii
        selectedBatchId = selectedBatch.id;
        selectedBatchNumber = selectedBatch.batchNumber || selectedBatch.lotNumber || 'Bez numeru';
        
        reservedBatches.push({
          batchId: selectedBatch.id,
          quantity: quantity,
          batchNumber: selectedBatchNumber
        });
        
        remainingQuantity = 0; // Cała ilość jest zarezerwowana z tej partii
      } else {
        // Standardowa automatyczna rezerwacja - sortuj partie według wybranej metody
        if (reservationMethod === 'fifo') {
          // FIFO - sortuj według daty przyjęcia (najstarsze pierwsze)
          batches.sort((a, b) => {
            const dateA = a.receivedDate ? new Date(a.receivedDate) : new Date(0);
            const dateB = b.receivedDate ? new Date(b.receivedDate) : new Date(0);
            return dateA - dateB;
          });
        } else {
          // Domyślnie: według daty ważności (najkrótszy termin pierwszy)
          batches.sort((a, b) => {
            // Jeśli nie ma daty ważności, traktuj jako najdalszą datę
            const dateA = a.expiryDate ? new Date(a.expiryDate) : new Date(9999, 11, 31);
            const dateB = b.expiryDate ? new Date(b.expiryDate) : new Date(9999, 11, 31);
            return dateA - dateB;
          });
        }
        
        // Przydziel partie automatycznie, uwzględniając już istniejące rezerwacje
        const batchReservationsPromises = batches.map(batch => getBatchReservations(batch.id));
        const batchReservationsArrays = await Promise.all(batchReservationsPromises);
        
        // Konwertuj na mapę batch.id -> ilość zarezerwowana
        const batchReservationsMap = {};
        batches.forEach((batch, idx) => {
          const batchReservations = batchReservationsArrays[idx];
          const totalReserved = batchReservations.reduce((sum, reservation) => {
            // Nie wliczaj rezerwacji z aktualnego zadania
            if (reservation.taskId === taskId) return sum;
            return sum + (reservation.quantity || 0);
          }, 0);
          
          batchReservationsMap[batch.id] = totalReserved;
        });
        
        // Przydziel partie automatycznie, uwzględniając rezerwacje
        for (const batch of batches) {
          if (remainingQuantity <= 0) break;
          
          const reservedForThisBatch = batchReservationsMap[batch.id] || 0;
          const effectivelyAvailable = Math.max(0, batch.quantity - reservedForThisBatch);
          
          if (effectivelyAvailable <= 0) continue; // Pomiń partie całkowicie zarezerwowane
          
          const quantityFromBatch = Math.min(effectivelyAvailable, remainingQuantity);
          if (quantityFromBatch <= 0) continue; // Pomiń partie, z których nie pobieramy ilości
          
          remainingQuantity -= quantityFromBatch;
          
          // Zachowaj informacje o pierwszej partii do rezerwacji
          if (!selectedBatchId) {
            selectedBatchId = batch.id;
            selectedBatchNumber = batch.batchNumber || batch.lotNumber || 'Bez numeru';
          }
          
          reservedBatches.push({
            batchId: batch.id,
            quantity: quantityFromBatch,
            batchNumber: batch.batchNumber || batch.lotNumber || 'Bez numeru'
          });
        }
        
        // Sprawdź, czy udało się zebrać całą wymaganą ilość
        if (remainingQuantity > 0) {
          throw new Error(`Nie można zarezerwować wymaganej ilości ${quantity} ${item.unit} produktu ${item.name}. 
          Brakuje ${remainingQuantity} ${item.unit} ze względu na istniejące rezerwacje przez inne zadania produkcyjne.`);
        }
      }
      
      // Zapisz informacje o partiach w zadaniu produkcyjnym
      if (taskDoc.exists()) {
        const materialBatches = taskData.materialBatches || {};
        
        console.log(`[DEBUG] Stan materialBatches przed aktualizacją:`, JSON.stringify(materialBatches));
        console.log(`[DEBUG] Zarezerwowane partie:`, JSON.stringify(reservedBatches));
        
        // Jeśli jest to ręczna rezerwacja pojedynczej partii, dodajemy do istniejących
        if (batchId && materialBatches[itemId]) {
          // Sprawdź czy ta partia już istnieje w liście
          const existingBatchIndex = materialBatches[itemId].findIndex(b => b.batchId === batchId);
          
          if (existingBatchIndex >= 0) {
            // Aktualizuj istniejącą partię, dodając nową ilość
            materialBatches[itemId][existingBatchIndex].quantity += quantity;
          } else {
            // Dodaj nową partię do listy
            materialBatches[itemId].push(...reservedBatches);
          }
        } else {
          // W przypadku automatycznej rezerwacji lub pierwszej ręcznej rezerwacji, zastąp listę
          materialBatches[itemId] = reservedBatches;
        }
        
        console.log(`[DEBUG] Stan materialBatches po aktualizacji:`, JSON.stringify(materialBatches));
        
        await updateDoc(taskRef, {
          materialBatches,
          updatedAt: serverTimestamp()
        });
        
        console.log(`[DEBUG] Zaktualizowano zadanie produkcyjne z nowymi partiami`);
      }
      
      // Upewnij się, że wszystkie zarezerwowane partie mają numery
      for (let i = 0; i < reservedBatches.length; i++) {
        if (!reservedBatches[i].batchNumber) {
          // Jeśli batchNumber nie istnieje, użyj lotNumber lub wygeneruj numer na podstawie ID
          reservedBatches[i].batchNumber = reservedBatches[i].lotNumber || `Partia ${reservedBatches[i].batchId.substring(0, 6)}`;
        }
      }
      
      // Utwórz nazwę użytkownika (jeśli dostępna)
      const userName = userId || 'System';
      
      // Dodaj wpis w transakcjach
      const transactionRef = collection(db, INVENTORY_TRANSACTIONS_COLLECTION);
      const transactionData = {
        itemId,
        itemName: item.name,
        quantity,
        type: 'booking',
        reason: 'Zadanie produkcyjne',
        referenceId: taskId,
        taskId: taskId,
        taskName: taskName,
        taskNumber: taskNumber,
        clientName: clientName,
        clientId: clientId,
        notes: batchId 
          ? `Zarezerwowano na zadanie produkcyjne MO: ${taskNumber || taskId} (ręczny wybór partii)`
          : `Zarezerwowano na zadanie produkcyjne MO: ${taskNumber || taskId} (metoda: ${reservationMethod})`,
        batchId: selectedBatchId,
        batchNumber: selectedBatchNumber,
        userName: userName,
        createdAt: serverTimestamp(),
        createdBy: userId
      };
      
      console.log('Tworzenie rezerwacji z danymi:', { taskNumber, taskName });
      
      await addDoc(transactionRef, transactionData);
      
      // Emituj zdarzenie o zmianie stanu magazynu
      const event = new CustomEvent('inventory-updated', { 
        detail: { itemId, action: 'booking', quantity }
      });
      window.dispatchEvent(event);
      
      return {
        success: true,
        message: `Zarezerwowano ${quantity} ${item.unit} produktu ${item.name}`,
        reservedBatches
      };
    } catch (error) {
      console.error('Błąd podczas rezerwowania materiału:', error);
      throw error;
    }
  };

  // Anulowanie bookowania produktu
  export const cancelBooking = async (itemId, quantity, taskId, userId) => {
    try {
      // UWAGA: Ta funkcja jest wywoływana w confirmMaterialConsumption (po potwierdzeniu zużycia), 
      // a nie automatycznie przy zmianie statusu zadania na 'Zakończone'
      
      console.log(`[DEBUG REZERWACJE] Rozpoczynam anulowanie rezerwacji: itemId=${itemId}, quantity=${quantity}, taskId=${taskId}`);
      
      // Pobierz aktualny stan produktu
      const item = await getInventoryItemById(itemId);
      console.log(`[DEBUG REZERWACJE] Stan produktu ${item.name}: ilość=${item.quantity}, zarezerwowano=${item.bookedQuantity || 0}`);
      
      // Pobierz oryginalne rezerwacje dla tego zadania
      const originalBookingRef = collection(db, INVENTORY_TRANSACTIONS_COLLECTION);
      const originalBookingQuery = query(
        originalBookingRef,
        where('itemId', '==', itemId),
        where('referenceId', '==', taskId),
        where('type', '==', 'booking')
      );
      
      const originalBookingSnapshot = await getDocs(originalBookingQuery);
      let originalBookedQuantity = 0;
      
      console.log(`[DEBUG REZERWACJE] Znaleziono ${originalBookingSnapshot.size} rezerwacji dla zadania ${taskId}`);
      
      originalBookingSnapshot.forEach((bookingDoc) => {
        const bookingData = bookingDoc.data();
        if (bookingData.quantity) {
          originalBookedQuantity += parseFloat(bookingData.quantity);
          console.log(`[DEBUG REZERWACJE] Rezerwacja ID=${bookingDoc.id}, ilość=${bookingData.quantity}, data=${bookingData.createdAt}`);
        }
      });
      
      console.log(`[DEBUG REZERWACJE] Anulowanie rezerwacji: itemId=${itemId}, taskId=${taskId}, zużycie=${quantity}, oryginalna rezerwacja=${originalBookedQuantity}`);
      
      // Po potwierdzeniu zużycia materiałów, cała rezerwacja powinna być anulowana
      // niezależnie od tego, ile faktycznie zużyto (nawet jeśli zużycie < rezerwacja)
      const shouldCancelAllBooking = true; // Zawsze anuluj całą rezerwację
      const quantityToCancel = item.bookedQuantity || 0; // Zawsze anuluj całą zarezerwowaną ilość
      
      console.log(`[DEBUG REZERWACJE] Anulujemy całą rezerwację niezależnie od zużycia, bookedQuantity=${item.bookedQuantity}`); 
      
      console.log(`[DEBUG REZERWACJE] shouldCancelAllBooking=${shouldCancelAllBooking}, quantityToCancel=${quantityToCancel}`);
      
      // Sprawdź, czy jest wystarczająca ilość zarezerwowana
      if (!item.bookedQuantity || item.bookedQuantity < quantityToCancel) {
        console.log(`[DEBUG REZERWACJE] Niewystarczająca ilość zarezerwowana: bookedQuantity=${item.bookedQuantity}, quantityToCancel=${quantityToCancel}`);
        
        // Jeśli różnica jest bardzo mała (błąd zaokrąglenia), wyzeruj bookedQuantity
        if (item.bookedQuantity > 0 && (Math.abs(item.bookedQuantity - quantityToCancel) < 0.00001 || shouldCancelAllBooking)) {
          // Aktualizuj pole bookedQuantity w produkcie - całkowite wyzerowanie
          const itemRef = doc(db, INVENTORY_COLLECTION, itemId);
          await updateDoc(itemRef, {
            bookedQuantity: 0, // Zerujemy całkowicie
            updatedAt: serverTimestamp(),
            updatedBy: userId
          });
          
          console.log(`[DEBUG REZERWACJE] Zerowanie rezerwacji dla ${item.name} z powodu ${shouldCancelAllBooking ? 'zużycia większego niż rezerwacja' : 'minimalnej różnicy zaokrąglenia'}: ${item.bookedQuantity} vs ${quantityToCancel}`);
        } else {
          // Zamiast rzucać błąd, zwracamy sukces i logujemy informację
          console.warn(`[DEBUG REZERWACJE] Anulowanie rezerwacji dla ${item.name}: zarezerwowano tylko ${item.bookedQuantity || 0} ${item.unit}, próbowano anulować ${quantityToCancel} ${item.unit}`);
          // Jeśli zużycie jest znacząco większe, anulujemy wszystko co jest zarezerwowane
          if (shouldCancelAllBooking && item.bookedQuantity > 0) {
            const itemRef = doc(db, INVENTORY_COLLECTION, itemId);
            await updateDoc(itemRef, {
              bookedQuantity: 0,
              updatedAt: serverTimestamp(),
              updatedBy: userId
            });
            console.log(`[DEBUG REZERWACJE] Zerowanie rezerwacji dla ${item.name} z powodu zużycia większego niż rezerwacja`);
          } else {
            // W przeciwnym razie anuluj tylko dostępną ilość
            if (item.bookedQuantity > 0) {
              const itemRef = doc(db, INVENTORY_COLLECTION, itemId);
              await updateDoc(itemRef, {
                bookedQuantity: 0,
                updatedAt: serverTimestamp(),
                updatedBy: userId
              });
              console.log(`[DEBUG REZERWACJE] Zerowanie dostępnej rezerwacji dla ${item.name} (${item.bookedQuantity})`);
            }
          }
        }
        
        return {
          success: true,
          message: `Anulowano rezerwację ${Math.min(item.bookedQuantity || 0, quantityToCancel)} ${item.unit} produktu ${item.name}`
        };
      } else {
        // Aktualizuj pole bookedQuantity w produkcie
        const itemRef = doc(db, INVENTORY_COLLECTION, itemId);
        
        // Jeśli zużycie jest większe niż rezerwacja, anuluj całą rezerwację
        if (shouldCancelAllBooking) {
          await updateDoc(itemRef, {
            bookedQuantity: 0,
            updatedAt: serverTimestamp(),
            updatedBy: userId
          });
          console.log(`[DEBUG REZERWACJE] Zerowanie całej rezerwacji dla ${item.name} z powodu zużycia większego niż rezerwacja`);
        } else {
          await updateDoc(itemRef, {
            bookedQuantity: increment(-quantityToCancel),
            updatedAt: serverTimestamp(),
            updatedBy: userId
          });
          console.log(`[DEBUG REZERWACJE] Zmniejszenie rezerwacji dla ${item.name} o ${quantityToCancel} (z ${item.bookedQuantity} do ${item.bookedQuantity - quantityToCancel})`);
        }
      }
      
      // Pobierz dane zadania produkcyjnego
      let taskNumber = '';
      let taskName = '';
      let clientName = '';
      let clientId = '';
      
      try {
        const taskRef = doc(db, 'productionTasks', taskId);
        const taskDoc = await getDoc(taskRef);
        
        if (taskDoc.exists()) {
          const taskData = taskDoc.data();
          taskName = taskData.name || '';
          taskNumber = taskData.moNumber || taskData.number || '';
          clientName = taskData.clientName || taskData.customer?.name || '';
          clientId = taskData.clientId || taskData.customer?.id || '';
        }
      } catch (error) {
        console.warn(`[DEBUG REZERWACJE] Nie udało się pobrać danych zadania ${taskId}:`, error);
        // Kontynuuj mimo błędu
      }
      
      // Dodaj transakcję anulowania rezerwacji (booking_cancel)
      const transactionData = {
        itemId,
        type: 'booking_cancel',
        quantity,
        date: new Date().toISOString(),
        reference: `Zadanie: ${taskId}`,
        notes: `Anulowanie rezerwacji materiału`,
        userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        referenceId: taskId,
        taskName,
        taskNumber,
        clientName,
        clientId
      };
      
      const newTransactionRef = await addDoc(collection(db, INVENTORY_TRANSACTIONS_COLLECTION), transactionData);
      console.log(`[DEBUG REZERWACJE] Utworzono transakcję anulowania rezerwacji ID=${newTransactionRef.id}`);
      
      // Znajdź i zaktualizuj status wszystkich rezerwacji dla tego zadania na "completed"
      const reservationRef = collection(db, INVENTORY_TRANSACTIONS_COLLECTION);
      const reservationQuery = query(
        reservationRef,
        where('referenceId', '==', taskId),
        where('type', '==', 'booking')
      );
      
      const reservationSnapshot = await getDocs(reservationQuery);
      const batch = writeBatch(db);
      
      reservationSnapshot.forEach((bookingDoc) => {
        const reservationDocRef = doc(db, INVENTORY_TRANSACTIONS_COLLECTION, bookingDoc.id);
        batch.update(reservationDocRef, { 
          status: 'completed',
          updatedAt: serverTimestamp(),
          completedAt: serverTimestamp()
        });
        console.log(`[DEBUG REZERWACJE] Oznaczono rezerwację ${bookingDoc.id} jako "completed"`);
      });
      
      await batch.commit();
      console.log(`[DEBUG REZERWACJE] Zaktualizowano status wszystkich rezerwacji dla zadania ${taskId} na "completed"`);
      
      // Emituj zdarzenie o zmianie stanu magazynu
      const event = new CustomEvent('inventory-updated', { 
        detail: { itemId, action: 'booking-cancelled' }
      });
      window.dispatchEvent(event);
      
      // Pobierz aktualny stan produktu po anulowaniu rezerwacji
      const updatedItem = await getInventoryItemById(itemId);
      console.log(`[DEBUG REZERWACJE] Stan produktu po anulowaniu: ${updatedItem.name}, ilość=${updatedItem.quantity}, zarezerwowano=${updatedItem.bookedQuantity || 0}`);
      
      return {
        success: true,
        message: `Anulowano rezerwację ${quantity} ${item.unit} produktu ${item.name}`
      };
    } catch (error) {
      console.error('[DEBUG REZERWACJE] Błąd podczas anulowania rezerwacji:', error);
      throw error;
    }
  };

  // Pobieranie produktów na zasadzie FIFO (First In, First Out)
  export const getProductsFIFO = async (itemId, quantity) => {
    try {
      // Sprawdź, czy quantity jest prawidłową liczbą przed rozpoczęciem
      const parsedQuantity = parseFloat(quantity);
      if (isNaN(parsedQuantity) || parsedQuantity <= 0) {
        throw new Error(`Nieprawidłowa ilość: ${quantity}. Podaj liczbę większą od zera.`);
      }

      // Pobierz wszystkie partie danego produktu
      const batchesRef = collection(db, INVENTORY_BATCHES_COLLECTION);
      
      // Proste zapytanie tylko po itemId, bez dodatkowych warunków i sortowania
      const q = query(
        batchesRef, 
        where('itemId', '==', itemId)
      );
      
      const querySnapshot = await getDocs(q);
      const batches = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Filtruj partie z ilością > 0
      const availableBatches = batches.filter(batch => {
        const batchQuantity = parseFloat(batch.quantity);
        return !isNaN(batchQuantity) && batchQuantity > 0;
      });
      
      if (availableBatches.length === 0) {
        throw new Error(`Brak dostępnych partii produktu w magazynie.`);
      }
      
      // Sortuj według daty utworzenia (od najstarszej) - FIFO
      availableBatches.sort((a, b) => {
        const dateA = a.createdAt instanceof Timestamp ? a.createdAt.toDate() : new Date(a.createdAt);
        const dateB = b.createdAt instanceof Timestamp ? b.createdAt.toDate() : new Date(b.createdAt);
        return dateA - dateB;
      });
      
      // Wybierz partie, które pokryją żądaną ilość
      let remainingQuantity = parsedQuantity; // Używamy już zwalidowanej wartości
      
      const selectedBatches = [];
      
      for (const batch of availableBatches) {
        if (remainingQuantity <= 0) break;
        
        const batchQuantity = parseFloat(batch.quantity);
        const quantityFromBatch = Math.min(batchQuantity, remainingQuantity);
        
        selectedBatches.push({
          ...batch,
          selectedQuantity: quantityFromBatch
        });
        
        remainingQuantity -= quantityFromBatch;
      }
      
      // Sprawdź, czy udało się pokryć całą żądaną ilość
      if (remainingQuantity > 0) {
        throw new Error(`Niewystarczająca ilość produktu w magazynie. Brakuje: ${remainingQuantity}`);
      }
      
      return selectedBatches;
    } catch (error) {
      console.error('Błąd podczas pobierania partii metodą FIFO:', error);
      throw error;
    }
  };

  // Pobieranie produktów z najkrótszą datą ważności
  export const getProductsWithEarliestExpiry = async (itemId, quantity) => {
    try {
      // Sprawdź, czy quantity jest prawidłową liczbą przed rozpoczęciem
      const parsedQuantity = parseFloat(quantity);
      if (isNaN(parsedQuantity) || parsedQuantity <= 0) {
        throw new Error(`Nieprawidłowa ilość: ${quantity}. Podaj liczbę większą od zera.`);
      }

      // Pobierz wszystkie partie danego produktu bez żadnych dodatkowych warunków
      const batchesRef = collection(db, INVENTORY_BATCHES_COLLECTION);
      
      // Proste zapytanie tylko po itemId, bez dodatkowych warunków i sortowania
      const q = query(
        batchesRef, 
        where('itemId', '==', itemId)
      );
      
      const querySnapshot = await getDocs(q);
      const batches = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Filtruj partie z ilością > 0 i upewnij się, że quantity jest liczbą
      const availableBatches = batches.filter(batch => {
        const batchQuantity = parseFloat(batch.quantity);
        return !isNaN(batchQuantity) && batchQuantity > 0;
      });
      
      if (availableBatches.length === 0) {
        throw new Error(`Brak dostępnych partii produktu w magazynie.`);
      }
      
      // Filtruj partie, które mają datę ważności (nie null i nie 1.01.1970)
      const batchesWithExpiry = availableBatches.filter(batch => {
        if (!batch.expiryDate) return false;
        
        const expiryDate = batch.expiryDate instanceof Timestamp 
          ? batch.expiryDate.toDate() 
          : new Date(batch.expiryDate);
          
        // Sprawdź czy to nie domyślna/nieprawidłowa data (rok 1970 lub wcześniejszy)
        return expiryDate.getFullYear() > 1970;
      });
      
      // Sortuj według daty ważności (od najwcześniejszej) - sortowanie po stronie klienta
      batchesWithExpiry.sort((a, b) => {
        const dateA = a.expiryDate instanceof Timestamp ? a.expiryDate.toDate() : new Date(a.expiryDate);
        const dateB = b.expiryDate instanceof Timestamp ? b.expiryDate.toDate() : new Date(b.expiryDate);
        return dateA - dateB;
      });
      
      // Dodaj partie bez daty ważności lub z domyślną datą na koniec
      const batchesWithoutExpiry = availableBatches.filter(batch => {
        if (!batch.expiryDate) return true;
        
        const expiryDate = batch.expiryDate instanceof Timestamp 
          ? batch.expiryDate.toDate() 
          : new Date(batch.expiryDate);
          
        // Sprawdź czy to domyślna/nieprawidłowa data (rok 1970 lub wcześniejszy)
        return expiryDate.getFullYear() <= 1970;
      });
      
      // Połącz obie listy
      const sortedBatches = [...batchesWithExpiry, ...batchesWithoutExpiry];
      
      // Wybierz partie, które pokryją żądaną ilość
      let remainingQuantity = parsedQuantity; // Używamy już zwalidowanej wartości
      
      const selectedBatches = [];
      
      for (const batch of sortedBatches) {
        if (remainingQuantity <= 0) break;
        
        const batchQuantity = parseFloat(batch.quantity);
        const quantityFromBatch = Math.min(batchQuantity, remainingQuantity);
        
        selectedBatches.push({
          ...batch,
          selectedQuantity: quantityFromBatch
        });
        
        remainingQuantity -= quantityFromBatch;
      }
      
      // Sprawdź, czy udało się pokryć całą żądaną ilość
      if (remainingQuantity > 0) {
        throw new Error(`Niewystarczająca ilość produktu w magazynie. Brakuje: ${remainingQuantity}`);
      }
      
      return selectedBatches;
    } catch (error) {
      console.error('Błąd podczas pobierania partii z najkrótszą datą ważności:', error);
      throw error;
    }
  };

  // Przenoszenie partii między magazynami
  export const transferBatch = async (batchId, sourceWarehouseId, targetWarehouseId, quantity, userData) => {
    // Sprawdź, czy wszystkie parametry są prawidłowe
    if (!batchId) {
      throw new Error('Nie podano identyfikatora partii');
    }
    
    if (!sourceWarehouseId) {
      throw new Error('Nie podano identyfikatora magazynu źródłowego');
    }
    
    if (!targetWarehouseId) {
      throw new Error('Nie podano identyfikatora magazynu docelowego');
    }
    
    if (sourceWarehouseId === targetWarehouseId) {
      throw new Error('Magazyn źródłowy i docelowy muszą być różne');
    }
    
    try {
      // Zabezpiecz userData
      userData = userData || {};
      const userId = (userData.userId || 'unknown').toString();
      const notes = (userData.notes || '').toString();
      
      // Pobierz dane partii
      const batchRef = doc(db, INVENTORY_BATCHES_COLLECTION, batchId);
      const batchDoc = await getDoc(batchRef);
      
      if (!batchDoc.exists()) {
        throw new Error('Partia nie istnieje');
      }
      
      const batchData = batchDoc.data() || {};
      
      // Sprawdź, czy partia należy do źródłowego magazynu
      if (batchData.warehouseId !== sourceWarehouseId) {
        throw new Error('Partia nie znajduje się w podanym magazynie źródłowym');
      }
      
      // Sprawdź, czy ilość jest prawidłowa
      const availableQuantity = Number(batchData.quantity || 0);
      const transferQuantity = Number(quantity);
      
      if (isNaN(transferQuantity) || transferQuantity <= 0) {
        throw new Error('Nieprawidłowa ilość do transferu');
      }
      
      if (availableQuantity < transferQuantity) {
        throw new Error(`Niewystarczająca ilość w partii. Dostępne: ${availableQuantity}, żądane: ${transferQuantity}`);
      }
      
      // Pobierz dane magazynów do transakcji
      const sourceWarehouseRef = doc(db, WAREHOUSES_COLLECTION, sourceWarehouseId);
      const sourceWarehouseDoc = await getDoc(sourceWarehouseRef);
      
      const targetWarehouseRef = doc(db, WAREHOUSES_COLLECTION, targetWarehouseId);
      const targetWarehouseDoc = await getDoc(targetWarehouseRef);
      
      if (!sourceWarehouseDoc.exists()) {
        throw new Error('Magazyn źródłowy nie istnieje');
      }
      
      if (!targetWarehouseDoc.exists()) {
        throw new Error('Magazyn docelowy nie istnieje');
      }
      
      // Pobierz dane pozycji magazynowej
      const itemId = batchData.itemId;
      if (!itemId) {
        throw new Error('Partia nie ma przypisanego ID pozycji');
      }
      
      const itemRef = doc(db, INVENTORY_COLLECTION, itemId);
      const itemDoc = await getDoc(itemRef);
      
      if (!itemDoc.exists()) {
        throw new Error('Pozycja magazynowa nie istnieje');
      }
      
      const itemData = itemDoc.data() || {};
      
      // Sprawdź, czy istnieje już partia tego samego przedmiotu w magazynie docelowym
      // z tym samym numerem partii i datą ważności
      const batchesRef = collection(db, INVENTORY_BATCHES_COLLECTION);
      const existingBatchQuery = query(
        batchesRef,
        where('itemId', '==', itemId),
        where('batchNumber', '==', batchData.batchNumber),
        where('warehouseId', '==', targetWarehouseId)
      );
      
      const existingBatchSnapshot = await getDocs(existingBatchQuery);
      
      let targetBatchId;
      let isNewBatch = true;
      
      if (!existingBatchSnapshot.empty) {
        const existingBatch = existingBatchSnapshot.docs[0];
        const existingBatchData = existingBatch.data();
        
        // Sprawdź, czy daty ważności są takie same
        const existingExpiryDate = existingBatchData.expiryDate;
        const sourceExpiryDate = batchData.expiryDate;
        
        let datesMatch = true;
        
        // Sprawdzenie dat (jeśli istnieją)
        if (existingExpiryDate && sourceExpiryDate) {
          const existingDate = existingExpiryDate instanceof Timestamp 
            ? existingExpiryDate.toDate().getTime() 
            : new Date(existingExpiryDate).getTime();
          
          const sourceDate = sourceExpiryDate instanceof Timestamp 
            ? sourceExpiryDate.toDate().getTime() 
            : new Date(sourceExpiryDate).getTime();
          
          datesMatch = existingDate === sourceDate;
        } else if (existingExpiryDate || sourceExpiryDate) {
          // Jedna ma datę, druga nie
          datesMatch = false;
        }
        
        if (datesMatch) {
          // Użyj istniejącej partii
          targetBatchId = existingBatch.id;
          isNewBatch = false;
        }
      }
      
      // Sprawdź, czy przenosimy całą partię
      const isFullTransfer = transferQuantity === availableQuantity;
      
      if (isFullTransfer) {
        // Jeśli przenosimy całą partię, usuń ją
        console.log(`Przenoszona jest cała partia (${transferQuantity}/${availableQuantity}). Partia źródłowa zostanie usunięta.`);
        // Zachowaj informacje o partii przed usunięciem jej
        const batchDataToKeep = { ...batchData };
        
        // Usuń partię źródłową
        await deleteDoc(batchRef);
        
        // Pobierz nazwy magazynów
        const warehouseSourceDoc = await getDoc(doc(db, WAREHOUSES_COLLECTION, sourceWarehouseId));
        const warehouseTargetDoc = await getDoc(doc(db, WAREHOUSES_COLLECTION, targetWarehouseId));
        
        const sourceWarehouseName = warehouseSourceDoc.exists() ? warehouseSourceDoc.data().name : 'Nieznany magazyn';
        const targetWarehouseName = warehouseTargetDoc.exists() ? warehouseTargetDoc.data().name : 'Nieznany magazyn';
        
        // Pobierz dane użytkownika
        let userDisplayName = "Nieznany użytkownik";
        try {
          const { getUserById } = await import('./userService');
          const userData = await getUserById(userId);
          if (userData) {
            userDisplayName = userData.displayName || userData.email || userId;
          }
        } catch (error) {
          console.error('Błąd podczas pobierania danych użytkownika:', error);
          // Kontynuuj mimo błędu - mamy fallback
        }
        
        // Dodaj transakcję informującą o usunięciu partii źródłowej - rozszerzone informacje
        const deleteTransactionData = {
          type: 'DELETE_BATCH_AFTER_TRANSFER',
          itemId,
          itemName: itemData.name,
          batchId,
          batchNumber: batchData.batchNumber || 'Nieznana partia',
          quantity: 0,
          warehouseId: sourceWarehouseId || 'default',
          warehouseName: sourceWarehouseName,
          notes: `Usunięcie pustej partii po przeniesieniu całości do magazynu ${targetWarehouseName}`,
          reason: 'Przeniesienie partii do innego magazynu',
          reference: `Transfer do magazynu: ${targetWarehouseName}`,
          source: 'inventory_transfer',
          previousQuantity: availableQuantity,
          transactionDate: serverTimestamp(),
          createdBy: userId,
          createdByName: userDisplayName,
          createdAt: serverTimestamp()
        };
        
        await addDoc(collection(db, INVENTORY_TRANSACTIONS_COLLECTION), deleteTransactionData);
        
        // Utwórz nową partię lub zaktualizuj istniejącą w magazynie docelowym
        if (isNewBatch) {
          // Utwórz nową partię w magazynie docelowym
          const newBatchData = {
            ...batchDataToKeep,
            id: undefined, // Usuń ID, aby Firebase wygenerowało nowe
            quantity: transferQuantity,
            // Zachowaj oryginalną wartość initialQuantity dla poprawnego rozliczania kosztów
            // zamiast ustawiać ją na wartość transferu
            initialQuantity: batchDataToKeep.initialQuantity,
            warehouseId: targetWarehouseId,
            transferredFrom: sourceWarehouseId,
            transferredAt: serverTimestamp(),
            transferredBy: userId,
            transferNotes: notes,
            createdAt: serverTimestamp(),
            createdBy: userId
          };
          
          // Wyczyść pole timestamp z istniejącej referencji dokumentu
          const newBatchDataForFirestore = {};
          Object.entries(newBatchData).forEach(([key, value]) => {
            if (value !== undefined && key !== 'id') {
              newBatchDataForFirestore[key] = value;
            }
          });
          
          const newBatchRef = await addDoc(collection(db, INVENTORY_BATCHES_COLLECTION), newBatchDataForFirestore);
          targetBatchId = newBatchRef.id;
        } else {
          // Zaktualizuj istniejącą partię w magazynie docelowym
          const targetBatchRef = doc(db, INVENTORY_BATCHES_COLLECTION, targetBatchId);
          
          // Pobierz obecne dane partii docelowej przed aktualizacją
          const targetBatchDoc = await getDoc(targetBatchRef);
          const targetBatchData = targetBatchDoc.exists() ? targetBatchDoc.data() : {};
          
          // Przy pełnym transferze, przenosimy całą wartość initialQuantity
          const initialQuantityToTransfer = batchDataToKeep.initialQuantity || 0;
          
          console.log(`Transfer całej partii: dodanie initialQuantity=${initialQuantityToTransfer} do partii docelowej`);
          
          await updateDoc(targetBatchRef, {
            quantity: increment(transferQuantity),
            // Zaktualizuj również initialQuantity, dodając przeniesioną wartość
            initialQuantity: increment(initialQuantityToTransfer),
            updatedAt: serverTimestamp(),
            updatedBy: userId,
            lastTransferFrom: sourceWarehouseId,
            lastTransferAt: serverTimestamp()
          });
        }
      } else {
        // Jeśli przenosimy tylko część partii, aktualizuj ilość partii źródłowej
        
        // Oblicz proporcję przenoszonej ilości do ilości całkowitej partii źródłowej
        const transferProportion = transferQuantity / availableQuantity;
        
        // Oblicz wartość initialQuantity do odjęcia od partii źródłowej
        const initialQuantityToRemove = batchData.initialQuantity * transferProportion;
        const newSourceInitialQuantity = batchData.initialQuantity - initialQuantityToRemove;
        
        console.log(`Transfer częściowy: odjęcie proportion=${transferProportion}, initialQuantityToRemove=${initialQuantityToRemove} od partii źródłowej`);
        console.log(`Partia źródłowa przed aktualizacją: initialQuantity=${batchData.initialQuantity}, quantity=${batchData.quantity}`);
        console.log(`Partia źródłowa po aktualizacji: initialQuantity=${newSourceInitialQuantity}, quantity=${batchData.quantity - transferQuantity}`);
        
        await updateDoc(batchRef, {
          quantity: increment(-transferQuantity),
          // Zaktualizuj również wartość initialQuantity partii źródłowej
          initialQuantity: newSourceInitialQuantity,
          updatedAt: serverTimestamp(),
          updatedBy: userId
        });
        
        if (isNewBatch) {
          // Utwórz nową partię w magazynie docelowym, ale zachowaj oryginalną initialQuantity
          // zamiast ustawiać ją na wartość transferu, co prowadziło do dublowania w rozliczaniu kosztów
          
          // Oblicz proporcję przenoszonej ilości do ilości całkowitej partii źródłowej
          const transferProportion = transferQuantity / availableQuantity;
          
          // Oblicz wartość initialQuantity do przeniesienia proporcjonalnie
          const proportionalInitialQuantity = batchData.initialQuantity * transferProportion;
          
          console.log(`Transfer częściowy do nowej partii: initialQuantity=${proportionalInitialQuantity}, quantity=${transferQuantity}`);
          
          const newBatchData = {
            ...batchData,
            id: undefined, // Usuń ID, aby Firebase wygenerowało nowe
            quantity: transferQuantity,
            // Ustaw wartość initialQuantity proporcjonalnie do przenoszonej ilości
            initialQuantity: proportionalInitialQuantity,
            warehouseId: targetWarehouseId,
            transferredFrom: sourceWarehouseId,
            transferredAt: serverTimestamp(),
            transferredBy: userId,
            transferNotes: notes,
            createdAt: serverTimestamp(),
            createdBy: userId
          };
          
          // Wyczyść pole timestamp z istniejącej referencji dokumentu
          const newBatchDataForFirestore = {};
          Object.entries(newBatchData).forEach(([key, value]) => {
            if (value !== undefined && key !== 'id') {
              newBatchDataForFirestore[key] = value;
            }
          });
          
          const newBatchRef = await addDoc(collection(db, INVENTORY_BATCHES_COLLECTION), newBatchDataForFirestore);
          targetBatchId = newBatchRef.id;
        } else {
          // Zaktualizuj istniejącą partię w magazynie docelowym
          const targetBatchRef = doc(db, INVENTORY_BATCHES_COLLECTION, targetBatchId);
          
          // Pobierz obecne dane partii docelowej przed aktualizacją
          const targetBatchDoc = await getDoc(targetBatchRef);
          const targetBatchData = targetBatchDoc.exists() ? targetBatchDoc.data() : {};
          
          // Oblicz proporcję przenoszonej ilości do ilości całkowitej partii źródłowej
          const transferProportion = transferQuantity / availableQuantity;
          
          // Oblicz wartość initialQuantity do przeniesienia proporcjonalnie
          const initialQuantityToTransfer = batchData.initialQuantity * transferProportion;
          
          console.log(`Transfer częściowy do istniejącej partii: dodanie initialQuantity=${initialQuantityToTransfer} do partii docelowej`);
          console.log(`Partia docelowa przed aktualizacją: initialQuantity=${targetBatchData.initialQuantity || 0}, quantity=${targetBatchData.quantity || 0}`);
          console.log(`Partia docelowa po aktualizacji: initialQuantity=${(targetBatchData.initialQuantity || 0) + initialQuantityToTransfer}, quantity=${(targetBatchData.quantity || 0) + transferQuantity}`);
          
          // Aktualizuj istniejącą partię w magazynie docelowym
          await updateDoc(targetBatchRef, {
            quantity: increment(transferQuantity),
            // Zaktualizuj również initialQuantity, dodając proporcjonalną część
            initialQuantity: increment(initialQuantityToTransfer),
            updatedAt: serverTimestamp(),
            updatedBy: userId,
            lastTransferFrom: sourceWarehouseId,
            lastTransferAt: serverTimestamp()
          });
        }
      }
      
      // Użyjemy już pobrane nazwy magazynów, jeśli są dostępne (przy pełnym transferze).
      // W przeciwnym razie, pobierzemy ich nazwy teraz.
      let sourceWarehouseName, targetWarehouseName;
      
      if (typeof sourceWarehouseName === 'undefined' || typeof targetWarehouseName === 'undefined') {
        const warehouseSourceDoc = await getDoc(doc(db, WAREHOUSES_COLLECTION, sourceWarehouseId));
        const warehouseTargetDoc = await getDoc(doc(db, WAREHOUSES_COLLECTION, targetWarehouseId));
        
        sourceWarehouseName = warehouseSourceDoc.exists() ? warehouseSourceDoc.data().name : 'Nieznany magazyn';
        targetWarehouseName = warehouseTargetDoc.exists() ? warehouseTargetDoc.data().name : 'Nieznany magazyn';
      }

      // Pobierz dane użytkownika
      let userDisplayName = "Nieznany użytkownik";
      try {
        const { getUserById } = await import('./userService');
        const userData = await getUserById(userId);
        if (userData) {
          userDisplayName = userData.displayName || userData.email || userId;
        }
      } catch (error) {
        console.error('Błąd podczas pobierania danych użytkownika:', error);
        // Kontynuuj mimo błędu - mamy fallback
      }

      // Dodaj transakcję z rozszerzonymi informacjami
      const transactionData = {
        type: 'TRANSFER',
        itemId,
        itemName: itemData.name,
        quantity: transferQuantity,
        sourceWarehouseId,
        sourceWarehouseName,
        targetWarehouseId,
        targetWarehouseName,
        sourceBatchId: batchId,
        targetBatchId,
        notes,
        reason: 'Przeniesienie partii do innego magazynu',
        reference: `Transfer do magazynu: ${targetWarehouseName}`,
        source: 'inventory_transfer',
        transactionDate: serverTimestamp(),
        createdBy: userId,
        createdByName: userDisplayName,
        createdAt: serverTimestamp()
      };
      
      await addDoc(collection(db, INVENTORY_TRANSACTIONS_COLLECTION), transactionData);
      
      // Przelicz i zaktualizuj ilość głównej pozycji na podstawie partii
      // (nie jest to konieczne przy transferze między magazynami, ale zapewniamy spójność danych)
      await recalculateItemQuantity(itemId);
      
      // Wyślij powiadomienie o zmianie lokalizacji partii
      try {
        // Nazwy magazynów zostały już pobrane wcześniej podczas tworzenia transakcji
        
        // Pobierz użytkowników z rolami administratora i magazynu do powiadomienia
        const allUsers = await getAllUsers();
        
        // Filtruj użytkowników według ról
        const adminUsers = allUsers.filter(user => user.role === 'administrator');
        const warehouseUsers = allUsers.filter(user => user.role === 'warehouse' || user.role === 'magazynier');
        
        // Stwórz tablicę unikalnych identyfikatorów użytkowników
        const userIdsToNotify = [...new Set([
          ...adminUsers.map(user => user.id),
          ...warehouseUsers.map(user => user.id)
        ])];
        
        if (userIdsToNotify.length > 0) {
          // Utwórz i wyślij powiadomienie
          await createRealtimeBatchLocationChangeNotification(
            userIdsToNotify,
            batchId,
            batchData.lotNumber || batchData.batchNumber || 'Nieznany',
            itemId,
            itemData.name,
            sourceWarehouseId,
            sourceWarehouseName,
            targetWarehouseId,
            targetWarehouseName,
            transferQuantity,
            userId
          );
          console.log('Wysłano powiadomienie o zmianie lokalizacji partii');
        }
      } catch (notificationError) {
        console.error('Błąd podczas wysyłania powiadomienia o zmianie lokalizacji partii:', notificationError);
        // Kontynuuj mimo błędu - transfer partii jest ważniejszy
      }
      
      return {
        success: true,
        sourceWarehouseId,
        targetWarehouseId,
        quantity: transferQuantity,
        message: isFullTransfer 
          ? 'Transfer całej partii zakończony pomyślnie - partia źródłowa została usunięta'
          : 'Transfer zakończony pomyślnie'
      };
    } catch (error) {
      console.error('Błąd podczas transferu partii:', error);
      throw error;
    }
  };

  // ------ ZARZĄDZANIE INWENTARYZACJĄ ------
  
  // Pobieranie wszystkich inwentaryzacji
  export const getAllStocktakings = async () => {
    try {
      const stocktakingRef = collection(db, INVENTORY_STOCKTAKING_COLLECTION);
      const q = query(stocktakingRef, orderBy('createdAt', 'desc'));
      
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Błąd podczas pobierania inwentaryzacji:', error);
      throw error;
    }
  };
  
  // Pobieranie inwentaryzacji po ID
  export const getStocktakingById = async (stocktakingId) => {
    try {
      const docRef = doc(db, INVENTORY_STOCKTAKING_COLLECTION, stocktakingId);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        throw new Error('Inwentaryzacja nie istnieje');
      }
      
      return {
        id: docSnap.id,
        ...docSnap.data()
      };
    } catch (error) {
      console.error('Błąd podczas pobierania inwentaryzacji:', error);
      throw error;
    }
  };
  
  // Tworzenie nowej inwentaryzacji
  export const createStocktaking = async (stocktakingData, userId) => {
    try {
      const stocktakingWithMeta = {
        ...stocktakingData,
        status: 'Otwarta',
        createdBy: userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        completedAt: null
      };
      
      const docRef = await addDoc(collection(db, INVENTORY_STOCKTAKING_COLLECTION), stocktakingWithMeta);
      
      return {
        id: docRef.id,
        ...stocktakingWithMeta
      };
    } catch (error) {
      console.error('Błąd podczas tworzenia inwentaryzacji:', error);
      throw error;
    }
  };
  
  // Aktualizacja inwentaryzacji
  export const updateStocktaking = async (stocktakingId, stocktakingData, userId) => {
    try {
      const stocktakingRef = doc(db, INVENTORY_STOCKTAKING_COLLECTION, stocktakingId);
      
      // Pobierz aktualne dane
      const currentStocktaking = await getStocktakingById(stocktakingId);
      
      // Sprawdź, czy inwentaryzacja nie jest już zakończona
      if (currentStocktaking.status === 'Zakończona' && stocktakingData.status !== 'Zakończona') {
        throw new Error('Nie można modyfikować zakończonej inwentaryzacji');
      }
      
      const updatedData = {
        ...stocktakingData,
        updatedAt: serverTimestamp(),
        updatedBy: userId
      };
      
      // Jeśli status jest zmieniany na "Zakończona", dodaj datę zakończenia
      if (stocktakingData.status === 'Zakończona' && currentStocktaking.status !== 'Zakończona') {
        updatedData.completedAt = serverTimestamp();
      }
      
      await updateDoc(stocktakingRef, updatedData);
      
      return {
        id: stocktakingId,
        ...updatedData
      };
    } catch (error) {
      console.error('Błąd podczas aktualizacji inwentaryzacji:', error);
      throw error;
    }
  };
  
  // Pobieranie elementów inwentaryzacji
  export const getStocktakingItems = async (stocktakingId) => {
    try {
      const itemsRef = collection(db, INVENTORY_STOCKTAKING_ITEMS_COLLECTION);
      const q = query(itemsRef, where('stocktakingId', '==', stocktakingId));
      
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Błąd podczas pobierania elementów inwentaryzacji:', error);
      throw error;
    }
  };
  
  // Pobieranie partii dla inwentaryzacji
  export const getStocktakingBatches = async (stocktakingId) => {
    try {
      const itemsRef = collection(db, INVENTORY_STOCKTAKING_ITEMS_COLLECTION);
      const q = query(itemsRef, where('stocktakingId', '==', stocktakingId));
      
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Błąd podczas pobierania partii inwentaryzacji:', error);
      throw error;
    }
  };
  
  // Dodawanie pozycji do inwentaryzacji
  export const addItemToStocktaking = async (stocktakingId, itemData, userId) => {
    try {
      // Pobierz informacje o inwentaryzacji
      const stocktaking = await getStocktakingById(stocktakingId);
      
      // Sprawdź, czy inwentaryzacja nie jest już zakończona
      if (stocktaking.status === 'Zakończona') {
        throw new Error('Nie można dodawać pozycji do zakończonej inwentaryzacji');
      }
      
      let stocktakingItem;
      
      // Jeśli podano batchId, oznacza to, że dodajemy konkretną partię (LOT)
      if (itemData.batchId) {
        // Pobierz informacje o partii
        const batchRef = doc(db, INVENTORY_BATCHES_COLLECTION, itemData.batchId);
        const batchDoc = await getDoc(batchRef);
        
        if (!batchDoc.exists()) {
          throw new Error('Wybrana partia nie istnieje');
        }
        
        const batchData = batchDoc.data();
        
        // Pobierz dane produktu z magazynu
        const inventoryItem = await getInventoryItemById(batchData.itemId);
        
        stocktakingItem = {
          stocktakingId,
          inventoryItemId: batchData.itemId,
          batchId: itemData.batchId,
          name: inventoryItem.name,
          category: inventoryItem.category,
          unit: inventoryItem.unit,
          location: batchData.warehouseId ? batchData.warehouseId : (inventoryItem.location || ''),
          lotNumber: batchData.lotNumber || '',
          batchNumber: batchData.batchNumber || '',
          expiryDate: batchData.expiryDate || null, // Zabezpieczenie przed undefined
          systemQuantity: batchData.quantity || 0,
          countedQuantity: itemData.countedQuantity || 0,
          discrepancy: (itemData.countedQuantity || 0) - (batchData.quantity || 0),
          unitPrice: batchData.unitPrice || 0, // Dodajemy cenę jednostkową partii
          notes: itemData.notes || '',
          status: 'Dodano',
          createdBy: userId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
      } else {
        // Oryginalna logika dla pozycji magazynowych
        // Pobierz aktualne dane produktu z magazynu
        const inventoryItem = await getInventoryItemById(itemData.inventoryItemId);
        
        stocktakingItem = {
          stocktakingId,
          inventoryItemId: itemData.inventoryItemId,
          name: inventoryItem.name,
          category: inventoryItem.category,
          unit: inventoryItem.unit,
          location: inventoryItem.location,
          systemQuantity: inventoryItem.quantity || 0,
          countedQuantity: itemData.countedQuantity || 0,
          discrepancy: (itemData.countedQuantity || 0) - (inventoryItem.quantity || 0),
          unitPrice: inventoryItem.unitPrice || 0, // Dodajemy cenę jednostkową
          notes: itemData.notes || '',
          status: 'Dodano',
          createdBy: userId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };
      }
      
      const docRef = await addDoc(collection(db, INVENTORY_STOCKTAKING_ITEMS_COLLECTION), stocktakingItem);
      
      return {
        id: docRef.id,
        ...stocktakingItem
      };
    } catch (error) {
      console.error('Błąd podczas dodawania pozycji do inwentaryzacji:', error);
      throw error;
    }
  };
  
  // Aktualizacja pozycji inwentaryzacji
  export const updateStocktakingItem = async (itemId, itemData, userId) => {
    try {
      const itemRef = doc(db, INVENTORY_STOCKTAKING_ITEMS_COLLECTION, itemId);
      
      // Pobierz aktualny element
      const docSnap = await getDoc(itemRef);
      if (!docSnap.exists()) {
        throw new Error('Element inwentaryzacji nie istnieje');
      }
      
      const currentItem = docSnap.data();
      
      // Pobierz informacje o inwentaryzacji
      const stocktaking = await getStocktakingById(currentItem.stocktakingId);
      
      // Sprawdź, czy inwentaryzacja nie jest już zakończona
      if (stocktaking.status === 'Zakończona') {
        throw new Error('Nie można modyfikować elementów zakończonej inwentaryzacji');
      }
      
      // Oblicz nową rozbieżność
      const discrepancy = (itemData.countedQuantity || 0) - currentItem.systemQuantity;
      
      // Jeśli to inwentaryzacja LOTu, dodajemy koszt rozbieżności
      let differenceValue = 0;
      if (currentItem.batchId && currentItem.unitPrice) {
        differenceValue = discrepancy * currentItem.unitPrice;
      }
      
      const updatedItem = {
        ...itemData,
        discrepancy,
        differenceValue,
        updatedAt: serverTimestamp(),
        updatedBy: userId
      };
      
      await updateDoc(itemRef, updatedItem);
      
      return {
        id: itemId,
        ...currentItem,
        ...updatedItem
      };
    } catch (error) {
      console.error('Błąd podczas aktualizacji elementu inwentaryzacji:', error);
      throw error;
    }
  };
  
  // Usuwanie pozycji inwentaryzacji
  export const deleteStocktakingItem = async (itemId) => {
    try {
      // Pobierz element przed usunięciem
      const itemRef = doc(db, INVENTORY_STOCKTAKING_ITEMS_COLLECTION, itemId);
      const docSnap = await getDoc(itemRef);
      
      if (!docSnap.exists()) {
        throw new Error('Element inwentaryzacji nie istnieje');
      }
      
      const item = docSnap.data();
      
      // Pobierz informacje o inwentaryzacji
      const stocktaking = await getStocktakingById(item.stocktakingId);
      
      // Sprawdź, czy inwentaryzacja nie jest już zakończona
      if (stocktaking.status === 'Zakończona') {
        throw new Error('Nie można usuwać elementów zakończonej inwentaryzacji');
      }
      
      await deleteDoc(itemRef);
      
      return { success: true };
    } catch (error) {
      console.error('Błąd podczas usuwania elementu inwentaryzacji:', error);
      throw error;
    }
  };
  
  // Zakończenie inwentaryzacji i aktualizacja stanów magazynowych
  export const completeStocktaking = async (stocktakingId, adjustInventory = true, userId) => {
    try {
      // Pobierz informacje o inwentaryzacji
      const stocktaking = await getStocktakingById(stocktakingId);
      
      // Sprawdź, czy inwentaryzacja nie jest już zakończona
      if (stocktaking.status === 'Zakończona') {
        throw new Error('Inwentaryzacja jest już zakończona');
      }
      
      // Pobierz wszystkie elementy inwentaryzacji
      const items = await getStocktakingItems(stocktakingId);
      
      // Jeśli mamy dostosować stany magazynowe
      if (adjustInventory) {
        // Grupuj elementy według inventoryItemId, aby przeliczać ilości tylko raz na produkt
        const itemsByProduct = {};
        
        // Grupowanie elementów po produktach
        for (const item of items) {
          const productId = item.inventoryItemId;
          if (!itemsByProduct[productId]) {
            itemsByProduct[productId] = [];
          }
          itemsByProduct[productId].push(item);
        }
        
        // Aktualizujemy stany dla każdego produktu
        for (const productId in itemsByProduct) {
          const productItems = itemsByProduct[productId];
          let needsRecalculation = false;
          
          // Dla każdego elementu inwentaryzacji danego produktu
          for (const item of productItems) {
            // Jeśli to inwentaryzacja LOTu/partii
            if (item.batchId) {
              needsRecalculation = true;
              const batchRef = doc(db, INVENTORY_BATCHES_COLLECTION, item.batchId);
              
              // Pobierz aktualny stan partii
              const batchDoc = await getDoc(batchRef);
              if (!batchDoc.exists()) {
                console.error(`Partia ${item.batchId} nie istnieje`);
                continue;
              }
              
              const batchData = batchDoc.data();
              
              // Aktualizuj stan partii
              await updateDoc(batchRef, {
                quantity: item.countedQuantity,
                updatedAt: serverTimestamp(),
                updatedBy: userId
              });
              
              // Oblicz różnicę dla tej partii
              const adjustment = item.countedQuantity - batchData.quantity;
              
              // Dodaj transakcję korygującą
              const transactionData = {
                itemId: item.inventoryItemId,
                itemName: item.name,
                type: adjustment > 0 ? 'adjustment-add' : 'adjustment-remove',
                quantity: Math.abs(adjustment),
                date: serverTimestamp(),
                reason: 'Korekta z inwentaryzacji',
                reference: `Inwentaryzacja #${stocktakingId}`,
                notes: `Korekta stanu partii ${item.lotNumber || item.batchNumber} po inwentaryzacji. ${item.notes || ''}`,
                warehouseId: item.location || batchData.warehouseId, // Dodajemy identyfikator magazynu
                batchId: item.batchId, // Dodajemy ID partii
                lotNumber: item.lotNumber || batchData.lotNumber, // Dodajemy numer LOT
                unitPrice: item.unitPrice || batchData.unitPrice, // Dodajemy cenę jednostkową
                differenceValue: item.differenceValue || (adjustment * (item.unitPrice || batchData.unitPrice || 0)), // Dodajemy wartość różnicy
                createdBy: userId,
                createdAt: serverTimestamp()
              };
              
              await addDoc(collection(db, INVENTORY_TRANSACTIONS_COLLECTION), transactionData);
            } else {
              // Oryginalna logika dla pozycji magazynowych
              const inventoryItemRef = doc(db, INVENTORY_COLLECTION, item.inventoryItemId);
              
              // Pobierz aktualny stan
              const inventoryItem = await getInventoryItemById(item.inventoryItemId);
              
              // Aktualizuj stan magazynowy
              const adjustment = item.countedQuantity - inventoryItem.quantity;
              
              await updateDoc(inventoryItemRef, {
                quantity: item.countedQuantity,
                updatedAt: serverTimestamp(),
                updatedBy: userId
              });
              
              // Dodaj transakcję korygującą
              const transactionData = {
                itemId: item.inventoryItemId,
                itemName: item.name,
                type: adjustment > 0 ? 'adjustment-add' : 'adjustment-remove',
                quantity: Math.abs(adjustment),
                date: serverTimestamp(),
                reason: 'Korekta z inwentaryzacji',
                reference: `Inwentaryzacja #${stocktakingId}`,
                notes: item.notes || 'Korekta stanu po inwentaryzacji',
                unitPrice: item.unitPrice || inventoryItem.unitPrice || 0, // Dodajemy cenę jednostkową
                differenceValue: item.differenceValue || (adjustment * (item.unitPrice || inventoryItem.unitPrice || 0)), // Dodajemy wartość różnicy
                createdBy: userId,
                createdAt: serverTimestamp()
              };
              
              await addDoc(collection(db, INVENTORY_TRANSACTIONS_COLLECTION), transactionData);
            }
            
            // Aktualizuj status elementu inwentaryzacji
            const itemRef = doc(db, INVENTORY_STOCKTAKING_ITEMS_COLLECTION, item.id);
            await updateDoc(itemRef, {
              status: 'Skorygowano',
              updatedAt: serverTimestamp(),
              updatedBy: userId
            });
          }
          
          // Jeśli były aktualizowane partie, przelicz łączną ilość produktu
          if (needsRecalculation) {
            await recalculateItemQuantity(productId);
          }
        }
      }
      
      // Zaktualizuj status inwentaryzacji
      const stocktakingRef = doc(db, INVENTORY_STOCKTAKING_COLLECTION, stocktakingId);
      await updateDoc(stocktakingRef, {
        status: 'Zakończona',
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: userId
      });
      
      return {
        success: true,
        message: adjustInventory 
          ? 'Inwentaryzacja zakończona i stany magazynowe zaktualizowane' 
          : 'Inwentaryzacja zakończona bez aktualizacji stanów magazynowych'
      };
    } catch (error) {
      console.error('Błąd podczas kończenia inwentaryzacji:', error);
      throw error;
    }
  };
  
  // Generowanie raportu różnic z inwentaryzacji
  export const generateStocktakingReport = async (stocktakingId) => {
    try {
      // Pobierz informacje o inwentaryzacji
      const stocktaking = await getStocktakingById(stocktakingId);
      
      // Pobierz wszystkie elementy inwentaryzacji
      const items = await getStocktakingItems(stocktakingId);
      
      // Oblicz statystyki
      const totalItems = items.length;
      const itemsWithDiscrepancy = items.filter(item => item.discrepancy !== 0).length;
      const positiveDiscrepancies = items.filter(item => item.discrepancy > 0);
      const negativeDiscrepancies = items.filter(item => item.discrepancy < 0);
      
      const totalPositiveDiscrepancy = positiveDiscrepancies.reduce((sum, item) => sum + item.discrepancy, 0);
      const totalNegativeDiscrepancy = negativeDiscrepancies.reduce((sum, item) => sum + item.discrepancy, 0);
      
      // Oblicz wartości pieniężne strat i nadwyżek
      const totalPositiveValue = positiveDiscrepancies.reduce((sum, item) => {
        const unitPrice = item.unitPrice || 0;
        return sum + (item.discrepancy * unitPrice);
      }, 0);
      
      const totalNegativeValue = negativeDiscrepancies.reduce((sum, item) => {
        const unitPrice = item.unitPrice || 0;
        return sum + (item.discrepancy * unitPrice);
      }, 0);
      
      // Importuj tylko jsPDF i autoTable
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;
      
      // Utwórz dokument PDF
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });
      
      // Funkcja do poprawiania polskich znaków
      const fixPolishChars = (text) => {
        if (!text) return '';
        
        return text.toString()
          .replace(/ą/g, 'a')
          .replace(/ć/g, 'c')
          .replace(/ę/g, 'e')
          .replace(/ł/g, 'l')
          .replace(/ń/g, 'n')
          .replace(/ó/g, 'o')
          .replace(/ś/g, 's')
          .replace(/ź/g, 'z')
          .replace(/ż/g, 'z')
          .replace(/Ą/g, 'A')
          .replace(/Ć/g, 'C')
          .replace(/Ę/g, 'E')
          .replace(/Ł/g, 'L')
          .replace(/Ń/g, 'N')
          .replace(/Ó/g, 'O')
          .replace(/Ś/g, 'S')
          .replace(/Ź/g, 'Z')
          .replace(/Ż/g, 'Z');
      };
      
      // Nagłówek
      doc.setFontSize(18);
      doc.text(fixPolishChars('Raport inwentaryzacji'), 14, 20);
      
      doc.setFontSize(12);
      doc.text(fixPolishChars(`Nazwa: ${stocktaking.name}`), 14, 30);
      doc.text(fixPolishChars(`Status: ${stocktaking.status}`), 14, 38);
      doc.text(fixPolishChars(`Lokalizacja: ${stocktaking.location || 'Wszystkie lokalizacje'}`), 14, 46);
      
      // Data wygenerowania
      const currentDate = new Date();
      const formattedDate = `${currentDate.getDate()}.${currentDate.getMonth() + 1}.${currentDate.getFullYear()}`;
      doc.text(fixPolishChars(`Wygenerowano: ${formattedDate}`), 14, 54);
      
      // Statystyki
      doc.setFontSize(14);
      doc.text(fixPolishChars('Podsumowanie'), 14, 68);
      
      doc.setFontSize(10);
      doc.text(fixPolishChars(`Liczba produktow/partii: ${totalItems}`), 14, 78);
      doc.text(fixPolishChars(`Pozycje zgodne: ${totalItems - itemsWithDiscrepancy}`), 14, 85);
      doc.text(fixPolishChars(`Pozycje z roznicami: ${itemsWithDiscrepancy}`), 14, 92);
      doc.text(fixPolishChars(`Nadwyzki: ${positiveDiscrepancies.length}`), 14, 99);
      doc.text(fixPolishChars(`Braki: ${negativeDiscrepancies.length}`), 14, 106);
      doc.text(fixPolishChars(`Wartosc nadwyzek: ${totalPositiveValue.toFixed(2)} PLN`), 14, 113);
      doc.text(fixPolishChars(`Wartosc brakow: ${totalNegativeValue.toFixed(2)} PLN`), 14, 120);
      doc.text(fixPolishChars(`Laczna wartosc roznic: ${(totalPositiveValue + totalNegativeValue).toFixed(2)} PLN`), 14, 127);
      
      // Przygotuj dane tabeli
      const tableData = items.map(item => [
        fixPolishChars(item.name),
        fixPolishChars(item.lotNumber || item.batchNumber || 'N/D'),
        fixPolishChars(item.category || ''),
        item.systemQuantity ? item.systemQuantity.toString() : '0',
        item.countedQuantity ? item.countedQuantity.toString() : '0',
        item.discrepancy ? item.discrepancy.toString() : '0',
        item.unitPrice ? item.unitPrice.toFixed(2) + ' PLN' : '0.00 PLN',
        item.discrepancy && item.unitPrice ? (item.discrepancy * item.unitPrice).toFixed(2) + ' PLN' : '0.00 PLN',
        fixPolishChars(item.notes || '')
      ]);
      
      // Nagłówki tabeli
      const tableHeaders = [
        'Nazwa produktu',
        'LOT/Partia',
        'Kategoria',
        'Stan systemowy',
        'Stan policzony',
        'Roznica',
        'Cena jedn.',
        'Wartosc roznicy',
        'Uwagi'
      ];
      
      // Generuj tabelę
      autoTable(doc, {
        startY: 135,
        head: [tableHeaders],
        body: tableData,
        headStyles: { fillColor: [66, 139, 202], font: 'helvetica' },
        alternateRowStyles: { fillColor: [241, 245, 249] },
        styles: { font: 'helvetica', fontSize: 8, cellPadding: 2 },
        margin: { top: 135 },
        tableLineWidth: 0.1,
        tableLineColor: [0, 0, 0]
      });
      
      // Stopka
      const pageCount = doc.internal.getNumberOfPages();
      for(let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(10);
        doc.text(
          `Strona ${i} z ${pageCount}`,
          doc.internal.pageSize.width / 2,
          doc.internal.pageSize.height - 10,
          { align: 'center' }
        );
      }
      
      // Zwróć plik PDF jako Blob
      const pdfBlob = doc.output('blob');
      return pdfBlob;
    } catch (error) {
      console.error('Błąd podczas generowania raportu inwentaryzacji:', error);
      throw error;
    }
  };

  // Aktualizacja rezerwacji produktu
  export const updateReservation = async (reservationId, itemId, newQuantity, newBatchId, userId) => {
    try {
      // Pobierz aktualną rezerwację
      const reservationRef = doc(db, INVENTORY_TRANSACTIONS_COLLECTION, reservationId);
      const reservationDoc = await getDoc(reservationRef);
      
      if (!reservationDoc.exists()) {
        throw new Error('Rezerwacja nie istnieje');
      }
      
      const reservation = reservationDoc.data();
      const oldQuantity = reservation.quantity;
      
      // Pobierz aktualny stan produktu
      const item = await getInventoryItemById(itemId);
      
      // Oblicz różnicę w ilości
      const quantityDiff = newQuantity - oldQuantity;
      
      // Sprawdź, czy jest wystarczająca ilość produktu dla zwiększenia rezerwacji
      if (quantityDiff > 0 && item.quantity - item.bookedQuantity < quantityDiff) {
        throw new Error(`Niewystarczająca ilość produktu w magazynie. Dostępne: ${item.quantity - item.bookedQuantity} ${item.unit}`);
      }
      
      // Aktualizuj pole bookedQuantity w produkcie
      const itemRef = doc(db, INVENTORY_COLLECTION, itemId);
      await updateDoc(itemRef, {
        bookedQuantity: increment(quantityDiff),
        updatedAt: serverTimestamp(),
        updatedBy: userId
      });
      
      // Pobierz informacje o wybranej partii, jeśli została zmieniona
      let batchNumber = reservation.batchNumber || '';
      if (newBatchId && newBatchId !== reservation.batchId) {
        try {
          const batchRef = doc(db, INVENTORY_BATCHES_COLLECTION, newBatchId);
          const batchDoc = await getDoc(batchRef);
          if (batchDoc.exists()) {
            const batchData = batchDoc.data();
            batchNumber = batchData.lotNumber || batchData.batchNumber || 'Bez numeru';
          }
        } catch (error) {
          console.error('Błąd podczas pobierania informacji o partii:', error);
        }
      }
      
      // Jeśli zmieniono partię, zaktualizuj informacje o partiach w zadaniu
      if ((newBatchId !== reservation.batchId || quantityDiff !== 0) && reservation.referenceId) {
        const taskRef = doc(db, 'productionTasks', reservation.referenceId);
        const taskDoc = await getDoc(taskRef);
        
        if (taskDoc.exists()) {
          const taskData = taskDoc.data();
          const materialBatches = taskData.materialBatches || {};
          
          // Zaktualizuj lub dodaj informacje o partii w zadaniu
          if (materialBatches[itemId]) {
            // Jeśli wybrano konkretną partię dla rezerwacji
            if (newBatchId) {
              // Sprawdź, czy ta partia już istnieje w liście
              const existingBatchIndex = materialBatches[itemId].findIndex(b => b.batchId === newBatchId);
              
              if (existingBatchIndex >= 0) {
                // Aktualizuj istniejącą partię
                materialBatches[itemId][existingBatchIndex].quantity = newQuantity;
              } else {
                // Dodaj nową partię i usuń poprzednią
                materialBatches[itemId] = [{
                  batchId: newBatchId,
                  quantity: newQuantity,
                  batchNumber: batchNumber
                }];
              }
            } else {
              // Jeśli nie wybrano konkretnej partii, aktualizuj tylko ilość w pierwszej partii
              if (materialBatches[itemId].length > 0) {
                materialBatches[itemId][0].quantity = newQuantity;
              }
            }
            
            await updateDoc(taskRef, {
              materialBatches,
              updatedAt: serverTimestamp()
            });
          }
        }
      }
      
      // Pobierz aktualne dane zadania (dla pewności, że mamy najnowsze)
      let taskName = reservation.taskName || '';
      let taskNumber = reservation.taskNumber || '';
      let clientName = reservation.clientName || '';
      let clientId = reservation.clientId || '';
      
      if (reservation.referenceId) {
        try {
          const taskRef = doc(db, 'productionTasks', reservation.referenceId);
          const taskDoc = await getDoc(taskRef);
          
          if (taskDoc.exists()) {
            const taskData = taskDoc.data();
            taskName = taskData.name || '';
            taskNumber = taskData.number || '';
            clientName = taskData.clientName || '';
            clientId = taskData.clientId || '';
          }
        } catch (error) {
          console.error('Błąd podczas pobierania danych zadania:', error);
        }
      }
      
      // Aktualizuj rezerwację
      await updateDoc(reservationRef, {
        quantity: newQuantity,
        batchId: newBatchId || null,
        batchNumber: newBatchId ? batchNumber : null,
        updatedAt: serverTimestamp(),
        updatedBy: userId,
        taskName,
        taskNumber,
        clientName,
        clientId,
        notes: `Zaktualizowano rezerwację. Zmieniono ilość z ${oldQuantity} na ${newQuantity}${newBatchId !== reservation.batchId ? ' i zmieniono partię' : ''}`
      });
      
      // Emituj zdarzenie o zmianie stanu magazynu
      const event = new CustomEvent('inventory-updated', { 
        detail: { itemId, action: 'reservation_update', quantity: quantityDiff }
      });
      window.dispatchEvent(event);
      
      return {
        success: true,
        message: `Zaktualizowano rezerwację. Nowa ilość: ${newQuantity} ${item.unit}`
      };
    } catch (error) {
      console.error('Błąd podczas aktualizacji rezerwacji:', error);
      throw error;
    }
  };

  // Funkcja do aktualizacji informacji o zadaniach w rezerwacjach - można uruchomić ręcznie dla istniejących rezerwacji
  export const updateReservationTasks = async () => {
    try {
      // Pobierz wszystkie transakcje typu booking
      const transactionsRef = collection(db, INVENTORY_TRANSACTIONS_COLLECTION);
      const q = query(
        transactionsRef,
        where('type', '==', 'booking')
      );
      
      const querySnapshot = await getDocs(q);
      const transactions = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      console.log(`Znaleziono ${transactions.length} rezerwacji do sprawdzenia`);
      
      const updated = [];
      const notUpdated = [];
      const deletedTasks = [];
      
      // Dla każdej rezerwacji
      for (const transaction of transactions) {
        if (!transaction.taskNumber && transaction.referenceId) {
          try {
            console.log(`Sprawdzanie zadania dla rezerwacji ${transaction.id}`);
            
            // Pobierz zadanie produkcyjne
            const taskRef = doc(db, 'productionTasks', transaction.referenceId);
            const taskDoc = await getDoc(taskRef);
            
            if (taskDoc.exists()) {
              const taskData = taskDoc.data();
              // Sprawdź zarówno pole number jak i moNumber (moNumber jest nowszym polem)
              const taskNumber = taskData.moNumber || taskData.number || '';
              const taskName = taskData.name || '';
              const clientName = taskData.clientName || '';
              const clientId = taskData.clientId || '';
              
              // Jeśli zadanie ma numer MO, zaktualizuj rezerwację
              if (taskNumber) {
                console.log(`Aktualizacja rezerwacji ${transaction.id} - przypisywanie MO: ${taskNumber}`);
                
                const transactionRef = doc(db, INVENTORY_TRANSACTIONS_COLLECTION, transaction.id);
                await updateDoc(transactionRef, {
                  taskName,
                  taskNumber,
                  clientName,
                  clientId,
                  updatedAt: serverTimestamp()
                });
                
                updated.push({
                  id: transaction.id,
                  itemName: transaction.itemName,
                  moNumber: taskNumber
                });
              } else {
                console.log(`Zadanie ${transaction.referenceId} nie ma numeru MO`);
                notUpdated.push({
                  id: transaction.id,
                  itemName: transaction.itemName,
                  reason: 'Brak numeru MO w zadaniu'
                });
              }
            } else {
              console.log(`Nie znaleziono zadania o ID: ${transaction.referenceId} - zadanie zostało usunięte`);
              deletedTasks.push({
                id: transaction.id,
                itemName: transaction.itemName,
                referenceId: transaction.referenceId
              });
            }
          } catch (error) {
            console.error(`Błąd podczas aktualizacji rezerwacji ${transaction.id}:`, error);
            notUpdated.push({
              id: transaction.id,
              itemName: transaction.itemName,
              reason: `Błąd: ${error.message}`
            });
          }
        } else if (transaction.taskNumber) {
          // Rezerwacja ma już numer zadania, ale sprawdźmy czy zadanie nadal istnieje
          if (transaction.referenceId) {
            try {
              const taskRef = doc(db, 'productionTasks', transaction.referenceId);
              const taskDoc = await getDoc(taskRef);
              
              if (!taskDoc.exists()) {
                // Zadanie zostało usunięte
                console.log(`Zadanie ${transaction.referenceId} dla rezerwacji ${transaction.id} zostało usunięte`);
                deletedTasks.push({
                  id: transaction.id,
                  itemName: transaction.itemName,
                  referenceId: transaction.referenceId
                });
              }
            } catch (error) {
              console.error(`Błąd podczas sprawdzania zadania ${transaction.referenceId}:`, error);
            }
          }
        } else {
          console.log(`Rezerwacja ${transaction.id} nie ma ID referencyjnego zadania`);
          notUpdated.push({
            id: transaction.id,
            itemName: transaction.itemName,
            reason: 'Brak ID referencyjnego zadania'
          });
        }
      }
      
      console.log(`Zaktualizowano ${updated.length} rezerwacji, nie zaktualizowano ${notUpdated.length}, znaleziono ${deletedTasks.length} rezerwacji z usuniętymi zadaniami`);
      
      return {
        updated,
        notUpdated,
        deletedTasks
      };
    } catch (error) {
      console.error('Błąd podczas aktualizacji zadań w rezerwacjach:', error);
      throw error;
    }
  };

  // Funkcja do usuwania rezerwacji z usuniętych zadań
  export const cleanupDeletedTaskReservations = async () => {
    try {
      console.log('Rozpoczynam czyszczenie rezerwacji z usuniętych zadań...');
      
      // Najpierw sprawdź, które zadania zostały usunięte
      const result = await updateReservationTasks();
      
      if (result.deletedTasks.length === 0) {
        console.log('Nie znaleziono rezerwacji z usuniętych zadań');
        return { success: true, message: 'Brak rezerwacji do wyczyszczenia', count: 0 };
      }
      
      const deletedReservations = [];
      const errors = [];
      
      // Dla każdej rezerwacji z usuniętym zadaniem
      for (const reservation of result.deletedTasks) {
        try {
          // Pobierz dane rezerwacji
          const reservationRef = doc(db, INVENTORY_TRANSACTIONS_COLLECTION, reservation.id);
          const reservationDoc = await getDoc(reservationRef);
          
          if (reservationDoc.exists()) {
            const reservationData = reservationDoc.data();
            
            // Pobierz informacje o produkcie
            const itemId = reservationData.itemId;
            const quantity = reservationData.quantity;
            
            if (itemId) {
              // Zaktualizuj stan magazynowy - zmniejsz ilość zarezerwowaną
              const itemRef = doc(db, INVENTORY_COLLECTION, itemId);
              const itemDoc = await getDoc(itemRef);
              
              if (itemDoc.exists()) {
                const itemData = itemDoc.data();
                const bookedQuantity = itemData.bookedQuantity || 0;
                
                // Oblicz nową wartość bookedQuantity (nie może być ujemna)
                const newBookedQuantity = Math.max(0, bookedQuantity - quantity);
                
                // Aktualizuj pozycję magazynową
                await updateDoc(itemRef, {
                  bookedQuantity: newBookedQuantity,
                  updatedAt: serverTimestamp()
                });
                
                console.log(`Zaktualizowano bookedQuantity dla ${itemId}: ${bookedQuantity} -> ${newBookedQuantity}`);
              }
            }
            
            // Usuń rezerwację
            await deleteDoc(reservationRef);
            
            console.log(`Usunięto rezerwację ${reservation.id} dla usuniętego zadania ${reservationData.referenceId}`);
            deletedReservations.push(reservation);
          }
        } catch (error) {
          console.error(`Błąd podczas usuwania rezerwacji ${reservation.id}:`, error);
          errors.push({
            id: reservation.id,
            error: error.message
          });
        }
      }
      
      // Emituj zdarzenie o zmianie stanu magazynu
      const event = new CustomEvent('inventory-updated', { 
        detail: { action: 'cleanup-reservations' }
      });
      window.dispatchEvent(event);
      
      return {
        success: true,
        message: `Usunięto ${deletedReservations.length} rezerwacji z usuniętych zadań`,
        count: deletedReservations.length,
        deletedReservations,
        errors
      };
    } catch (error) {
      console.error('Błąd podczas czyszczenia rezerwacji:', error);
      throw new Error(`Błąd podczas czyszczenia rezerwacji: ${error.message}`);
    }
  };

  // Funkcja do przeliczania i aktualizacji ilości pozycji magazynowej na podstawie sum partii
  export const recalculateItemQuantity = async (itemId) => {
    try {
      console.log(`Przeliczanie ilości dla pozycji ${itemId} na podstawie partii...`);
      
      // Pobierz wszystkie partie dla danej pozycji - pobierzmy bezpośrednio z bazy danych
      // zamiast używać funkcji getItemBatches, która może stosować filtrowanie
      const batchesRef = collection(db, INVENTORY_BATCHES_COLLECTION);
      const q = query(batchesRef, where('itemId', '==', itemId));
      const querySnapshot = await getDocs(q);
      
      let totalQuantity = 0;
      
      // Iteruj po wszystkich partiach i sumuj ich ilości
      querySnapshot.forEach(doc => {
        const batchData = doc.data();
        // Dodaj ilość niezależnie od daty ważności
        totalQuantity += Number(batchData.quantity) || 0;
      });
      
      console.log(`Suma ilości z partii (włącznie z partiami bez daty ważności): ${totalQuantity}`);
      
      // Zaktualizuj stan głównej pozycji magazynowej
      const itemRef = doc(db, INVENTORY_COLLECTION, itemId);
      await updateDoc(itemRef, {
        quantity: totalQuantity,
        lastUpdated: new Date().toISOString()
      });
      
      console.log(`Zaktualizowano ilość pozycji ${itemId} na ${totalQuantity}`);
      
      return totalQuantity;
    } catch (error) {
      console.error(`Błąd podczas przeliczania ilości dla pozycji ${itemId}:`, error);
      throw error;
    }
  };

  // Funkcja do przeliczania ilości wszystkich pozycji magazynowych na podstawie partii
  export const recalculateAllInventoryQuantities = async () => {
    try {
      console.log('Rozpoczynam przeliczanie ilości wszystkich pozycji w magazynie...');
      
      // Pobierz wszystkie pozycje magazynowe
      const inventoryItems = await getAllInventoryItems();
      
      const results = {
        success: 0,
        failed: 0,
        items: []
      };
      
      // Dla każdej pozycji przelicz ilość na podstawie partii
      for (const item of inventoryItems) {
        try {
          const newQuantity = await recalculateItemQuantity(item.id);
          
          results.success++;
          results.items.push({
            id: item.id,
            name: item.name,
            oldQuantity: item.quantity,
            newQuantity: newQuantity,
            difference: newQuantity - item.quantity
          });
          
          console.log(`Zaktualizowano ilość dla "${item.name}" z ${item.quantity} na ${newQuantity}`);
        } catch (error) {
          console.error(`Błąd podczas przeliczania ilości dla pozycji ${item.name} (${item.id}):`, error);
          results.failed++;
          results.items.push({
            id: item.id,
            name: item.name,
            error: error.message
          });
        }
      }
      
      console.log(`Zakończono przeliczanie ilości. Sukces: ${results.success}, Błędy: ${results.failed}`);
      return results;
    } catch (error) {
      console.error('Błąd podczas przeliczania wszystkich ilości:', error);
      throw error;
    }
  };

  // ------ ZARZĄDZANIE CENAMI DOSTAWCÓW ------

  /**
   * Pobiera ceny dostawców dla pozycji magazynowej
   * @param {string} itemId - ID pozycji magazynowej
   * @returns {Promise<Array>} - Lista cen dostawców
   */
  export const getSupplierPrices = async (itemId) => {
    try {
      const supplierPricesRef = collection(db, INVENTORY_SUPPLIER_PRICES_COLLECTION);
      const q = query(
        supplierPricesRef, 
        where('itemId', '==', itemId),
        orderBy('price', 'asc')
      );
      
      const querySnapshot = await getDocs(q);
      const supplierPrices = [];
      
      querySnapshot.forEach(doc => {
        supplierPrices.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return supplierPrices;
    } catch (error) {
      console.error('Błąd podczas pobierania cen dostawców:', error);
      throw error;
    }
  };

  /**
   * Dodaje nową cenę dostawcy dla pozycji magazynowej
   * @param {Object} supplierPriceData - Dane ceny dostawcy
   * @param {string} userId - ID użytkownika
   * @returns {Promise<Object>} - Dodana cena dostawcy
   */
  export const addSupplierPrice = async (supplierPriceData, userId) => {
    try {
      if (!supplierPriceData.itemId) {
        throw new Error('ID pozycji magazynowej jest wymagane');
      }
      
      if (!supplierPriceData.supplierId) {
        throw new Error('ID dostawcy jest wymagane');
      }
      
      if (typeof supplierPriceData.price !== 'number') {
        throw new Error('Cena musi być liczbą');
      }
      
      // Sprawdź, czy taki dostawca już istnieje dla tej pozycji
      const existingPricesRef = collection(db, INVENTORY_SUPPLIER_PRICES_COLLECTION);
      const q = query(
        existingPricesRef,
        where('itemId', '==', supplierPriceData.itemId),
        where('supplierId', '==', supplierPriceData.supplierId)
      );
      
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        throw new Error('Ten dostawca już ma przypisaną cenę do tej pozycji');
      }
      
      const newSupplierPrice = {
        ...supplierPriceData,
        createdBy: userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      const docRef = await addDoc(collection(db, INVENTORY_SUPPLIER_PRICES_COLLECTION), newSupplierPrice);
      
      return {
        id: docRef.id,
        ...newSupplierPrice
      };
    } catch (error) {
      console.error('Błąd podczas dodawania ceny dostawcy:', error);
      throw error;
    }
  };

  /**
   * Aktualizuje cenę dostawcy
   * @param {string} priceId - ID ceny dostawcy
   * @param {Object} supplierPriceData - Dane ceny dostawcy do aktualizacji
   * @param {string} userId - ID użytkownika
   * @returns {Promise<boolean>} - Wynik aktualizacji
   */
  export const updateSupplierPrice = async (priceId, supplierPriceData, userId) => {
    try {
      if (typeof supplierPriceData.price !== 'number') {
        throw new Error('Cena musi być liczbą');
      }
      
      // Pobierz aktualną cenę przed aktualizacją, aby zapisać jej historię
      const priceDocRef = doc(db, INVENTORY_SUPPLIER_PRICES_COLLECTION, priceId);
      const priceDoc = await getDoc(priceDocRef);
      
      if (priceDoc.exists()) {
        const currentPriceData = priceDoc.data();
        
        // Jeśli cena się zmieniła, zapisz historię
        if (currentPriceData.price !== supplierPriceData.price) {
          await addSupplierPriceHistory({
            priceId,
            itemId: supplierPriceData.itemId,
            supplierId: supplierPriceData.supplierId,
            oldPrice: currentPriceData.price,
            newPrice: supplierPriceData.price,
            currency: currentPriceData.currency || supplierPriceData.currency,
            changedBy: userId
          });
        }
      }
      
      const updatedData = {
        ...supplierPriceData,
        updatedBy: userId,
        updatedAt: serverTimestamp()
      };
      
      await updateDoc(doc(db, INVENTORY_SUPPLIER_PRICES_COLLECTION, priceId), updatedData);
      
      return true;
    } catch (error) {
      console.error('Błąd podczas aktualizacji ceny dostawcy:', error);
      throw error;
    }
  };

  /**
   * Usuwa cenę dostawcy
   * @param {string} priceId - ID ceny dostawcy
   * @returns {Promise<boolean>} - Wynik usunięcia
   */
  export const deleteSupplierPrice = async (priceId) => {
    try {
      await deleteDoc(doc(db, INVENTORY_SUPPLIER_PRICES_COLLECTION, priceId));
      return true;
    } catch (error) {
      console.error('Błąd podczas usuwania ceny dostawcy:', error);
      throw error;
    }
  };

  /**
   * Pobiera cenę dostawcy dla pozycji magazynowej
   * @param {string} itemId - ID pozycji magazynowej
   * @param {string} supplierId - ID dostawcy
   * @returns {Promise<Object|null>} - Cena dostawcy lub null jeśli nie znaleziono
   */
  export const getSupplierPriceForItem = async (itemId, supplierId) => {
    try {
      console.log(`[DEBUG] Szukam ceny dla produktu ${itemId} od dostawcy ${supplierId}`);
      
      const supplierPricesRef = collection(db, INVENTORY_SUPPLIER_PRICES_COLLECTION);
      const q = query(
        supplierPricesRef,
        where('itemId', '==', itemId),
        where('supplierId', '==', supplierId)
      );
      
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        console.log(`[DEBUG] Nie znaleziono ceny dla produktu ${itemId} od dostawcy ${supplierId}`);
        return null;
      }
      
      const priceDoc = querySnapshot.docs[0];
      const priceData = priceDoc.data();
      
      console.log(`[DEBUG] Znaleziona cena:`, priceData);
      console.log(`[DEBUG] minQuantity:`, priceData.minQuantity);
      console.log(`[DEBUG] leadTime:`, priceData.leadTime);
      
      return {
        id: priceDoc.id,
        ...priceData
      };
    } catch (error) {
      console.error('Błąd podczas pobierania ceny dostawcy dla produktu:', error);
      return null;
    }
  };

  /**
   * Znajduje najlepszą cenę dostawcy dla pozycji magazynowej
   * @param {string} itemId - ID pozycji magazynowej
   * @param {number} quantity - Ilość produktu
   * @returns {Promise<Object|null>} - Najlepsza cena dostawcy lub null jeśli nie znaleziono
   */
  export const getBestSupplierPriceForItem = async (itemId, quantity = 1) => {
    try {
      console.log(`[DEBUG] Szukam najlepszej ceny dla produktu ${itemId}, ilość: ${quantity}`);
      
      // Pobierz wszystkie ceny dostawców dla produktu
      const pricesRef = collection(db, 'inventorySupplierPrices');
      const q = query(pricesRef, where('itemId', '==', itemId));
      const querySnapshot = await getDocs(q);
      
      if (querySnapshot.empty) {
        console.log(`[DEBUG] Brak cen dostawców dla produktu ${itemId}`);
        return null;
      }
      
      // Mapuj dokumenty na obiekty z ceną
      const prices = [];
      querySnapshot.forEach(doc => {
        const priceData = doc.data();
        console.log(`[DEBUG] Znaleziona cena dostawcy:`, priceData);
        console.log(`[DEBUG] minQuantity:`, priceData.minQuantity);
        
        prices.push({
          id: doc.id,
          ...priceData
        });
      });
      
      // Filtruj ceny dostawców według minimalnej ilości - tylko te, które spełniają wymagania
      // Używamy tutaj minQuantity, a nie minOrderQuantity!
      const validPrices = prices.filter(price => {
        const minQ = price.minQuantity || 0;
        const isValid = minQ <= quantity;
        console.log(`[DEBUG] Cena ${price.id}, dostawca ${price.supplierId}, minQuantity: ${minQ}, czy ważna: ${isValid}`);
        return isValid;
      });
      
      if (validPrices.length === 0) {
        console.log(`[DEBUG] Brak ważnych cen dla ilości ${quantity}`);
        return prices[0]; // Zwróć pierwszą cenę, jeśli nie znaleziono spełniających kryterium
      }
      
      // Znajdź najniższą cenę
      validPrices.sort((a, b) => (a.price || 0) - (b.price || 0));
      console.log(`[DEBUG] Najlepsza cena: ${validPrices[0].price}, dostawca: ${validPrices[0].supplierId}, minQuantity: ${validPrices[0].minQuantity}`);
      
      return validPrices[0];
    } catch (error) {
      console.error('Błąd podczas pobierania najlepszej ceny dostawcy:', error);
      return null;
    }
  };

  /**
   * Znajduje najlepsze ceny dostawców dla listy pozycji magazynowych
   * @param {Array} items - Lista obiektów zawierających itemId i quantity
   * @returns {Promise<Object>} - Mapa itemId -> najlepsza cena dostawcy
   */
  export const getBestSupplierPricesForItems = async (items) => {
    if (!items || !Array.isArray(items) || items.length === 0) {
      return {};
    }
    
    try {
      const result = {};
      
      // Dla każdej pozycji znajdź najlepszą cenę dostawcy
      for (const item of items) {
        if (item.itemId || item.id) {
          const itemId = item.itemId || item.id;
          const quantity = item.quantity || 1;
          
          const bestPrice = await getBestSupplierPriceForItem(itemId, quantity);
          if (bestPrice) {
            result[itemId] = bestPrice;
          }
        }
      }
      
      return result;
    } catch (error) {
      console.error('Błąd podczas pobierania najlepszych cen dostawców:', error);
      return {};
    }
  };

  /**
   * Ustawia cenę dostawcy jako domyślną dla danej pozycji magazynowej
   * @param {string} itemId - ID pozycji magazynowej
   * @param {string} priceId - ID ceny dostawcy do ustawienia jako domyślna
   * @returns {Promise<void>}
   */
  export const setDefaultSupplierPrice = async (itemId, priceId) => {
    try {
      // Najpierw pobieramy wszystkie ceny dostawców dla danej pozycji
      const supplierPricesRef = collection(db, INVENTORY_SUPPLIER_PRICES_COLLECTION);
      const q = query(
        supplierPricesRef,
        where('itemId', '==', itemId)
      );
      
      const querySnapshot = await getDocs(q);
      
      // Usuwamy flagę domyślności ze wszystkich pozycji
      const batch = writeBatch(db);
      
      querySnapshot.forEach(doc => {
        // Najpierw zerujemy wszystkie ceny jako nie domyślne
        batch.update(doc.ref, { isDefault: false });
      });
      
      // Ustawiamy wybraną cenę jako domyślną
      const priceDocRef = doc(db, INVENTORY_SUPPLIER_PRICES_COLLECTION, priceId);
      batch.update(priceDocRef, { isDefault: true });
      
      // Zatwierdzamy zmiany
      await batch.commit();
    } catch (error) {
      console.error('Błąd podczas ustawiania domyślnej ceny dostawcy:', error);
      throw error;
    }
  };

  // Usuwanie rezerwacji produktu
  export const deleteReservation = async (reservationId, userId) => {
    try {
      // Pobierz aktualną rezerwację
      const reservationRef = doc(db, INVENTORY_TRANSACTIONS_COLLECTION, reservationId);
      const reservationDoc = await getDoc(reservationRef);
      
      if (!reservationDoc.exists()) {
        throw new Error('Rezerwacja nie istnieje');
      }
      
      const reservation = reservationDoc.data();
      const itemId = reservation.itemId;
      const quantity = reservation.quantity || 0;
      const taskId = reservation.referenceId || reservation.taskId;
      const batchId = reservation.batchId;
      
      if (itemId) {
        // Pobierz aktualny stan produktu
        const itemRef = doc(db, INVENTORY_COLLECTION, itemId);
        const itemDoc = await getDoc(itemRef);
        
        if (itemDoc.exists()) {
          const itemData = itemDoc.data();
          const bookedQuantity = itemData.bookedQuantity || 0;
          
          // Oblicz nową wartość bookedQuantity (nie może być ujemna)
          const newBookedQuantity = Math.max(0, bookedQuantity - quantity);
          
          // Aktualizuj pole bookedQuantity w produkcie
          await updateDoc(itemRef, {
            bookedQuantity: newBookedQuantity,
            updatedAt: serverTimestamp(),
            updatedBy: userId
          });
        }
      }
      
      // Jeśli mamy ID zadania produkcyjnego i ID partii, usuń również referencję z zadania
      if (taskId && batchId) {
        try {
          const taskRef = doc(db, 'productionTasks', taskId);
          const taskDoc = await getDoc(taskRef);
          
          if (taskDoc.exists()) {
            const taskData = taskDoc.data();
            
            // Sprawdź, czy zadanie ma zarezerwowane partie
            if (taskData.materialBatches && taskData.materialBatches[itemId]) {
              // Znajdź i usuń partię z listy
              const updatedBatches = taskData.materialBatches[itemId].filter(
                batch => batch.batchId !== batchId
              );
              
              // Aktualizuj dane zadania
              const materialBatches = { ...taskData.materialBatches };
              
              if (updatedBatches.length === 0) {
                // Jeśli nie zostały żadne partie dla tego materiału, usuń cały klucz
                delete materialBatches[itemId];
              } else {
                materialBatches[itemId] = updatedBatches;
              }
              
              // Sprawdź, czy zostały jakiekolwiek zarezerwowane materiały
              const hasAnyReservations = Object.keys(materialBatches).length > 0;
              
              // Aktualizuj zadanie produkcyjne
              await updateDoc(taskRef, {
                materialBatches,
                materialsReserved: hasAnyReservations,
                updatedAt: serverTimestamp(),
                updatedBy: userId
              });
              
              console.log(`Usunięto rezerwację partii ${batchId} z zadania produkcyjnego ${taskId}`);
            }
          }
        } catch (error) {
          console.error(`Błąd podczas aktualizacji zadania produkcyjnego ${taskId}:`, error);
          // Kontynuuj mimo błędu
        }
      }
      
      // Usuń rezerwację
      await deleteDoc(reservationRef);
      
      // Emituj zdarzenie o zmianie stanu magazynu
      const event = new CustomEvent('inventory-updated', { 
        detail: { itemId, action: 'reservation_delete', quantity, taskId }
      });
      window.dispatchEvent(event);
      
      return {
        success: true,
        message: `Usunięto rezerwację`
      };
    } catch (error) {
      console.error('Błąd podczas usuwania rezerwacji:', error);
      throw error;
    }
  };

  // Funkcja do usuwania wszystkich rezerwacji związanych z konkretnym zadaniem
  export const cleanupTaskReservations = async (taskId, itemIds = null) => {
    try {
      console.log(`Rozpoczynam czyszczenie rezerwacji dla zadania ${taskId}${itemIds ? ' i materiałów ' + itemIds.join(', ') : ''}...`);
      
      // Pobierz wszystkie rezerwacje (transakcje booking) dla tego zadania
      let q;
      const transactionsRef = collection(db, INVENTORY_TRANSACTIONS_COLLECTION);
      
      if (itemIds && itemIds.length > 0) {
        // Jeśli mamy listę konkretnych materiałów, pobieramy tylko ich rezerwacje
        q = query(
          transactionsRef,
          where('type', '==', 'booking'),
          where('referenceId', '==', taskId),
          where('itemId', 'in', itemIds)
        );
      } else {
        // W przeciwnym razie pobieramy wszystkie rezerwacje dla zadania
        q = query(
          transactionsRef,
          where('type', '==', 'booking'),
          where('referenceId', '==', taskId)
        );
      }
      
      const querySnapshot = await getDocs(q);
      const reservations = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      if (reservations.length === 0) {
        console.log(`Nie znaleziono rezerwacji dla zadania ${taskId}${itemIds ? ' i materiałów ' + itemIds.join(', ') : ''}`);
        return { success: true, message: 'Brak rezerwacji do wyczyszczenia', count: 0 };
      }
      
      const deletedReservations = [];
      const errors = [];
      
      // Dla każdej rezerwacji z zadaniem
      for (const reservation of reservations) {
        try {
          // Pobierz informacje o produkcie
          const itemId = reservation.itemId;
          const quantity = reservation.quantity;
          
          if (itemId) {
            // Zaktualizuj stan magazynowy - zmniejsz ilość zarezerwowaną
            const itemRef = doc(db, INVENTORY_COLLECTION, itemId);
            const itemDoc = await getDoc(itemRef);
            
            if (itemDoc.exists()) {
              const itemData = itemDoc.data();
              const bookedQuantity = itemData.bookedQuantity || 0;
              
              // Oblicz nową wartość bookedQuantity (nie może być ujemna)
              const newBookedQuantity = Math.max(0, bookedQuantity - quantity);
              
              // Aktualizuj pozycję magazynową
              await updateDoc(itemRef, {
                bookedQuantity: newBookedQuantity,
                updatedAt: serverTimestamp()
              });
              
              console.log(`Zaktualizowano bookedQuantity dla ${itemId}: ${bookedQuantity} -> ${newBookedQuantity}`);
            }
          }
          
          // Usuń rezerwację
          const reservationRef = doc(db, INVENTORY_TRANSACTIONS_COLLECTION, reservation.id);
          await deleteDoc(reservationRef);
          
          console.log(`Usunięto rezerwację ${reservation.id} dla zadania ${taskId}`);
          deletedReservations.push(reservation);
        } catch (error) {
          console.error(`Błąd podczas usuwania rezerwacji ${reservation.id}:`, error);
          errors.push({
            id: reservation.id,
            error: error.message
          });
        }
      }
      
      // Aktualizuj również dane zadania produkcyjnego, aby odzwierciedlić usunięte rezerwacje
      try {
        const taskRef = doc(db, 'productionTasks', taskId);
        const taskDoc = await getDoc(taskRef);
        
        if (taskDoc.exists()) {
          const taskData = taskDoc.data();
          
          // Jeśli zadanie ma informacje o zarezerwowanych partiach
          if (taskData.materialBatches) {
            let materialBatches = { ...taskData.materialBatches };
            let updated = false;
            
            // Usuń informacje o zarezerwowanych partiach dla określonych materiałów
            if (itemIds && itemIds.length > 0) {
              // Usuń tylko konkretne materiały
              itemIds.forEach(itemId => {
                if (materialBatches[itemId]) {
                  delete materialBatches[itemId];
                  updated = true;
                }
              });
            } else {
              // Usuń wszystkie zarezerwowane partie
              materialBatches = {};
              updated = Object.keys(taskData.materialBatches).length > 0;
            }
            
            // Sprawdź, czy zostały jakiekolwiek zarezerwowane materiały
            const hasAnyReservations = Object.keys(materialBatches).length > 0;
            
            if (updated) {
              // Aktualizuj zadanie produkcyjne
              await updateDoc(taskRef, {
                materialBatches,
                materialsReserved: hasAnyReservations,
                updatedAt: serverTimestamp()
              });
              
              console.log(`Zaktualizowano informacje o zarezerwowanych partiach w zadaniu ${taskId}`);
            }
          }
        }
      } catch (error) {
        console.error(`Błąd podczas aktualizacji informacji o zarezerwowanych partiach w zadaniu ${taskId}:`, error);
        // Kontynuuj mimo błędu
      }
      
      // Emituj zdarzenie o zmianie stanu magazynu
      const event = new CustomEvent('inventory-updated', { 
        detail: { action: 'cleanup-reservations' }
      });
      window.dispatchEvent(event);
      
      return {
        success: true,
        message: `Usunięto ${deletedReservations.length} rezerwacji dla zadania ${taskId}${itemIds ? ' i materiałów ' + itemIds.join(', ') : ''}`,
        count: deletedReservations.length,
        deletedReservations,
        errors
      };
    } catch (error) {
      console.error(`Błąd podczas czyszczenia rezerwacji dla zadania ${taskId}:`, error);
      throw new Error(`Błąd podczas czyszczenia rezerwacji: ${error.message}`);
    }
  };

  /**
   * Pobieranie rezerwacji dla produktu, zgrupowanych według zadania produkcyjnego
   * @param {string} itemId - ID przedmiotu
   * @returns {Promise<Array>} - Lista rezerwacji zgrupowanych według zadania
   */
  export const getReservationsGroupedByTask = async (itemId) => {
    try {
      // Pobierz wszystkie transakcje dla danego przedmiotu
      const transactions = await getItemTransactions(itemId);
      
      // Filtruj tylko transakcje rezerwacji (typ 'booking')
      const bookingTransactions = transactions.filter(
        transaction => transaction.type === 'booking'
      );
      
      // Grupuj rezerwacje według zadania produkcyjnego (referenceId)
      const reservationsByTask = {};
      
      bookingTransactions.forEach(transaction => {
        const taskId = transaction.referenceId || transaction.taskId;
        if (!taskId) return;
        
        if (!reservationsByTask[taskId]) {
          reservationsByTask[taskId] = {
            taskId: taskId,
            taskName: transaction.taskName || '',
            taskNumber: transaction.taskNumber || '',
            moNumber: transaction.moNumber || '', // Dodanie numeru MO
            clientName: transaction.clientName || '',
            clientId: transaction.clientId || '',
            totalQuantity: 0,
            batches: [],
            createdAt: transaction.createdAt,
            updatedAt: transaction.updatedAt,
            status: transaction.status || 'active' // Dodajemy status rezerwacji
          };
        }
        
        // Dodaj ilość do sumy
        reservationsByTask[taskId].totalQuantity += parseFloat(transaction.quantity) || 0;
        
        // Dodaj partię do listy partii dla tego zadania
        if (transaction.batchId) {
          reservationsByTask[taskId].batches.push({
            batchId: transaction.batchId,
            batchNumber: transaction.batchNumber || 'Bez numeru',
            quantity: parseFloat(transaction.quantity) || 0,
            reservationId: transaction.id,
            status: transaction.status || 'active' // Dodajemy status rezerwacji dla partii
          });
        }
      });
      
      // Konwertuj obiekt na tablicę
      return Object.values(reservationsByTask);
    } catch (error) {
      console.error('Błąd podczas pobierania zgrupowanych rezerwacji:', error);
      throw error;
    }
  };

  // Funkcja czyszcząca mikrorezerwacje (bardzo małe wartości zaokrągleń)
  export const cleanupMicroReservations = async () => {
    try {
      // Usuwamy zbędne logowanie
      // console.log('Rozpoczynam czyszczenie mikrorezerwacji...');
      
      // Pobierz wszystkie transakcje rezerwacji
      const transactionsRef = collection(db, INVENTORY_TRANSACTIONS_COLLECTION);
      const q = query(
        transactionsRef,
        where('type', '==', 'booking')
      );
      
      const querySnapshot = await getDocs(q);
      const microReservations = [];
      
      // Znajdź rezerwacje z bardzo małymi wartościami (błędy zaokrągleń)
      for (const doc of querySnapshot.docs) {
        const reservation = doc.data();
        const quantity = reservation.quantity || 0;
        
        // Jeśli ilość jest bliska zeru lub mniejsza niż 0.00001, oznacz do usunięcia
        if (quantity < 0.00001) {
          microReservations.push({
            id: doc.id,
            ...reservation
          });
        }
      }
      
      // Usuwamy zbędne logowanie
      // console.log(`Znaleziono ${microReservations.length} mikrorezerwacji do usunięcia`);
      
      // Usuń mikrorezerwacje i zaktualizuj bookedQuantity w produktach
      for (const reservation of microReservations) {
        try {
          // Pobierz informacje o produkcie
          const itemId = reservation.itemId;
          if (!itemId) continue;
          
          // Zaktualizuj stan magazynowy - zmniejsz ilość zarezerwowaną
          const itemRef = doc(db, INVENTORY_COLLECTION, itemId);
          const itemDoc = await getDoc(itemRef);
          
          if (itemDoc.exists()) {
            const itemData = itemDoc.data();
            const bookedQuantity = itemData.bookedQuantity || 0;
            
            // Oblicz nową wartość bookedQuantity (odejmij mikrorezerwację)
            const newBookedQuantity = Math.max(0, bookedQuantity - reservation.quantity);
            
            // Aktualizuj pozycję magazynową
            await updateDoc(itemRef, {
              bookedQuantity: newBookedQuantity,
              updatedAt: serverTimestamp()
            });
            
            // Usuwamy zbędne logowanie
            // console.log(`Zaktualizowano bookedQuantity dla ${itemId}: ${bookedQuantity} -> ${newBookedQuantity}`);
          }
          
          // Usuń rezerwację
          const reservationRef = doc(db, INVENTORY_TRANSACTIONS_COLLECTION, reservation.id);
          await deleteDoc(reservationRef);
          
          // Usuwamy zbędne logowanie
          // console.log(`Usunięto mikrorezerwację ${reservation.id} o wartości ${reservation.quantity}`);
        } catch (error) {
          console.error(`Błąd podczas usuwania mikrorezerwacji ${reservation.id}:`, error);
        }
      }
      
      // Emituj zdarzenie o zmianie stanu magazynu
      if (microReservations.length > 0) {
        const event = new CustomEvent('inventory-updated', { 
          detail: { action: 'cleanup-microreservations' }
        });
        window.dispatchEvent(event);
      }
      
      return {
        success: true,
        message: `Usunięto ${microReservations.length} mikrorezerwacji`,
        count: microReservations.length
      };
    } catch (error) {
      console.error('Błąd podczas czyszczenia mikrorezerwacji:', error);
      return {
        success: false,
        message: `Błąd podczas czyszczenia mikrorezerwacji: ${error.message}`,
        error
      };
    }
  };

  /**
   * Czyści wszystkie rezerwacje dla konkretnego produktu
   * @param {string} itemId - ID przedmiotu
   * @param {string} userId - ID użytkownika wykonującego operację
   * @returns {Promise<Object>} - Informacja o rezultacie operacji
   */
  export const cleanupItemReservations = async (itemId, userId) => {
    try {
      // console.log(`Rozpoczynam czyszczenie rezerwacji dla produktu ${itemId}...`);
      
      // Pobierz wszystkie rezerwacje (transakcje booking) dla tego produktu
      const transactionsRef = collection(db, INVENTORY_TRANSACTIONS_COLLECTION);
      const q = query(
        transactionsRef,
        where('type', '==', 'booking'),
        where('itemId', '==', itemId)
      );
      
      const querySnapshot = await getDocs(q);
      const reservations = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      if (reservations.length === 0) {
        // console.log(`Nie znaleziono rezerwacji dla produktu ${itemId}`);
        return { success: true, message: 'Brak rezerwacji do wyczyszczenia', count: 0 };
      }
      
      const deletedReservations = [];
      const errors = [];
      
      // Dla każdej rezerwacji produktu
      for (const reservation of reservations) {
        try {
          // Usuń rezerwację
          const reservationRef = doc(db, INVENTORY_TRANSACTIONS_COLLECTION, reservation.id);
          await deleteDoc(reservationRef);
          
          // console.log(`Usunięto rezerwację ${reservation.id} dla produktu ${itemId}`);
          deletedReservations.push(reservation);
        } catch (error) {
          console.error(`Błąd podczas usuwania rezerwacji ${reservation.id}:`, error);
          errors.push({
            id: reservation.id,
            error: error.message
          });
        }
      }
      
      // Zaktualizuj całkowicie bookedQuantity produktu na 0
      const itemRef = doc(db, INVENTORY_COLLECTION, itemId);
      await updateDoc(itemRef, {
        bookedQuantity: 0,
        updatedAt: serverTimestamp(),
        updatedBy: userId || 'system'
      });
      
      // console.log(`Wyzerowano bookedQuantity dla produktu ${itemId}`);
      
      // Emituj zdarzenie o zmianie stanu magazynu
      const event = new CustomEvent('inventory-updated', { 
        detail: { action: 'cleanup-item-reservations', itemId }
      });
      window.dispatchEvent(event);
      
      return {
        success: true,
        message: `Usunięto ${deletedReservations.length} rezerwacji dla produktu`,
        count: deletedReservations.length,
        errors: errors.length > 0 ? errors : undefined
      };
    } catch (error) {
      console.error(`Błąd podczas czyszczenia rezerwacji dla produktu ${itemId}:`, error);
      return {
        success: false,
        message: `Błąd podczas czyszczenia rezerwacji: ${error.message}`,
        error
      };
    }
  };

  // Funkcja do pobierania pojedynczej partii z magazynu
  export const getInventoryBatch = async (batchId) => {
    try {
      if (!batchId) {
        console.error('Nie podano ID partii');
        return null;
      }

      const batchRef = doc(db, 'inventoryBatches', batchId);
      const batchSnapshot = await getDoc(batchRef);

      if (!batchSnapshot.exists()) {
        // console.log(`Nie znaleziono partii o ID ${batchId}`);
        return null;
      }

      return {
        id: batchSnapshot.id,
        ...batchSnapshot.data()
      };
    } catch (error) {
      console.error(`Błąd podczas pobierania partii o ID ${batchId}:`, error);
      throw error;
    }
  };

  /**
   * Pobiera wszystkie partie (LOTy) powiązane z danym zamówieniem zakupowym (PO)
   * @param {string} purchaseOrderId - ID zamówienia zakupowego
   * @returns {Promise<Array>} - Lista partii materiałów powiązanych z zamówieniem
   */
  export const getBatchesByPurchaseOrderId = async (purchaseOrderId) => {
    try {
      if (!purchaseOrderId) {
        throw new Error('ID zamówienia zakupowego jest wymagane');
      }
      
      // Przygotuj kwerendę - szukaj partii, które mają powiązanie z danym PO
      const q1 = query(
        collection(db, INVENTORY_BATCHES_COLLECTION),
        where('purchaseOrderDetails.id', '==', purchaseOrderId)
      );
      
      // Wykonaj zapytanie
      const querySnapshot1 = await getDocs(q1);
      let batches = querySnapshot1.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Sprawdź również w starszym formacie danych (dla kompatybilności)
      if (batches.length === 0) {
        const q2 = query(
          collection(db, INVENTORY_BATCHES_COLLECTION),
          where('sourceDetails.orderId', '==', purchaseOrderId)
        );
        
        const querySnapshot2 = await getDocs(q2);
        batches = querySnapshot2.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
      }
      
      // Posortuj partie według daty przyjęcia (od najnowszej)
      batches.sort((a, b) => {
        const dateA = a.receivedDate ? (a.receivedDate.toDate ? a.receivedDate.toDate() : new Date(a.receivedDate)) : new Date(0);
        const dateB = b.receivedDate ? (b.receivedDate.toDate ? b.receivedDate.toDate() : new Date(b.receivedDate)) : new Date(0);
        return dateB - dateA;
      });
      
      return batches;
    } catch (error) {
      console.error(`Błąd podczas pobierania partii dla zamówienia ${purchaseOrderId}:`, error);
      throw error;
    }
  };

  /**
   * Pobiera oczekiwane zamówienia dla danego produktu magazynowego
   * @param {string} inventoryItemId - ID produktu magazynowego
   * @returns {Promise<Array>} - Lista oczekiwanych zamówień
   */
  export const getAwaitingOrdersForInventoryItem = async (inventoryItemId) => {
    try {
      // Pobierz zamówienia zakupowe, które mają status inny niż "completed" lub "cancelled"
      // i zawierają szukany produkt
      const purchaseOrdersRef = collection(db, 'purchaseOrders');
      const q = query(
        purchaseOrdersRef,
        where('status', 'not-in', ['completed', 'cancelled'])
      );
      
      const querySnapshot = await getDocs(q);
      const purchaseOrders = [];
      
      // Przefiltruj zamówienia, które zawierają szukany produkt
      for (const docRef of querySnapshot.docs) {
        const poData = docRef.data();
        
        if (poData.items && Array.isArray(poData.items)) {
          const matchingItems = poData.items.filter(item => 
            item.inventoryItemId === inventoryItemId
          );
          
          if (matchingItems.length > 0) {
            // Oblicz pozostałą ilość do dostarczenia dla każdego pasującego elementu
            const orderedItems = matchingItems.map(item => {
              const quantityOrdered = parseFloat(item.quantity) || 0;
              const quantityReceived = parseFloat(item.received) || 0;
              const quantityRemaining = Math.max(0, quantityOrdered - quantityReceived);
              
              return {
                ...item,
                quantityOrdered,
                quantityReceived,
                quantityRemaining,
                expectedDeliveryDate: item.plannedDeliveryDate || poData.expectedDeliveryDate,
                poNumber: poData.number || 'Brak numeru'
              };
            });
            
            // Dodaj tylko te pozycje, które mają niezerową pozostałą ilość do dostarczenia
            const relevantItems = orderedItems.filter(item => item.quantityRemaining > 0);
            
            if (relevantItems.length > 0) {
              purchaseOrders.push({
                id: docRef.id,
                number: poData.number,
                status: poData.status,
                expectedDeliveryDate: poData.expectedDeliveryDate,
                orderDate: poData.orderDate,
                items: relevantItems
              });
            }
          }
        }
      }
      
      return purchaseOrders;
    } catch (error) {
      console.error('Błąd podczas pobierania oczekujących zamówień dla elementu:', error);
      return [];
    }
  };

  /**
   * Usuwa partię z systemu, sprawdzając wcześniej, czy nie jest używana w MO/PO
   * @param {string} batchId - ID partii do usunięcia
   * @param {string} userId - ID użytkownika wykonującego operację
   * @returns {Promise<Object>} - Wynik operacji
   */
  export const deleteBatch = async (batchId, userId) => {
    try {
      if (!batchId) {
        throw new Error('Nie podano ID partii');
      }

      // Pobierz dane partii
      const batchRef = doc(db, INVENTORY_BATCHES_COLLECTION, batchId);
      const batchDoc = await getDoc(batchRef);

      if (!batchDoc.exists()) {
        throw new Error('Partia nie istnieje');
      }

      const batchData = batchDoc.data();
      const itemId = batchData.itemId;
      const lotNumber = batchData.lotNumber || batchData.batchNumber || 'Nieznana partia';
      const quantity = batchData.quantity || 0;

      // Sprawdź, czy partia jest używana w zamówieniach produkcyjnych
      // Szukamy zadań produkcyjnych, które mają rezerwacje na tę partię
      const productionTasksRef = collection(db, 'productionTasks');
      let hasReservations = false;
      let reservationDetails = [];

      // Sprawdź zadania produkcyjne, które mają zarezerwowane materiały
      const tasksWithMaterialsQuery = query(
        productionTasksRef,
        where('materialsReserved', '==', true)
      );
      
      const tasksSnapshot = await getDocs(tasksWithMaterialsQuery);
      
      for (const taskDoc of tasksSnapshot.docs) {
        const taskData = taskDoc.data();
        
        // Sprawdź, czy zadanie ma materialBatches z danym itemId
        if (taskData.materialBatches && taskData.materialBatches[itemId]) {
          // Sprawdź czy wśród tych partii jest ta, którą chcemy usunąć
          const batchReservation = taskData.materialBatches[itemId].find(
            batch => batch.batchId === batchId
          );
          
          if (batchReservation) {
            hasReservations = true;
            reservationDetails.push({
              taskId: taskDoc.id,
              taskName: taskData.name || 'Zadanie produkcyjne',
              moNumber: taskData.moNumber || 'Nieznany numer MO',
              quantityReserved: batchReservation.quantity || 0
            });
          }
        }
      }
      
      // Jeśli partia jest używana w zadaniach produkcyjnych, zwróć błąd
      if (hasReservations) {
        let message = `Partia ${lotNumber} jest używana w następujących zadaniach produkcyjnych:`;
        reservationDetails.forEach(detail => {
          message += `\n- ${detail.taskName} (MO: ${detail.moNumber}) - zarezerwowano: ${detail.quantityReserved}`;
        });
        message += '\n\nNajpierw usuń rezerwacje w tych zadaniach.';
        
        return {
          success: false,
          message,
          reservationDetails
        };
      }

      // Jeśli partia ma ilość > 0, zaktualizuj stan magazynowy produktu
      if (quantity > 0 && itemId) {
        const itemRef = doc(db, INVENTORY_COLLECTION, itemId);
        const itemDoc = await getDoc(itemRef);
        
        if (itemDoc.exists()) {
          const itemData = itemDoc.data();
          const currentQuantity = itemData.quantity || 0;
          
          // Odejmij ilość partii od całkowitej ilości produktu
          await updateDoc(itemRef, {
            quantity: Math.max(0, currentQuantity - quantity),
            updatedAt: serverTimestamp(),
            updatedBy: userId
          });
        }
      }

      // Pobierz dane użytkownika
      let userDisplayName = "Nieznany użytkownik";
      try {
        const { getUserById } = await import('./userService');
        const userData = await getUserById(userId);
        if (userData) {
          userDisplayName = userData.displayName || userData.email || userId;
        }
      } catch (error) {
        console.error('Błąd podczas pobierania danych użytkownika:', error);
        // Kontynuuj mimo błędu - mamy fallback
      }
      
      // Dodaj transakcję informującą o usunięciu partii - rozszerzone informacje
      const transactionData = {
        type: 'DELETE_BATCH',
        itemId: itemId,
        itemName: batchData.itemName || 'Nieznany produkt',
        batchId: batchId,
        batchNumber: lotNumber,
        quantity: quantity,
        // Sprawdź czy warehouseId istnieje, jeśli nie - ustaw domyślną wartość
        warehouseId: batchData.warehouseId || 'default',
        warehouseName: batchData.warehouseName || 'Nieznany magazyn',
        notes: `Usunięcie partii ${lotNumber}`,
        reason: 'Usunięcie partii',
        reference: `Partia: ${lotNumber}`,
        source: 'inventory_management',
        previousQuantity: batchData.quantity || 0,
        transactionDate: serverTimestamp(),
        createdBy: userId,
        createdByName: userDisplayName,
        createdAt: serverTimestamp()
      };
      
      await addDoc(collection(db, INVENTORY_TRANSACTIONS_COLLECTION), transactionData);

      // Usuń partię
      await deleteDoc(batchRef);
      
      return {
        success: true,
        message: `Partia ${lotNumber} została usunięta`
      };
    } catch (error) {
      console.error(`Błąd podczas usuwania partii o ID ${batchId}:`, error);
      throw error;
    }
  };

  /**
 * Przesyła certyfikat partii do Firebase Storage
 * @param {File} file - Plik certyfikatu
 * @param {string} batchId - ID partii
 * @param {string} userId - ID użytkownika przesyłającego certyfikat
 * @returns {Promise<string>} URL do przesłanego certyfikatu
 */
export const uploadBatchCertificate = async (file, batchId, userId) => {
  try {
    if (!file || !batchId) {
      throw new Error('Brak pliku lub ID partii');
    }

    // Funkcja pomocnicza do konwersji pliku na string base64
    const fileToBase64 = (file) => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = (error) => reject(error);
      });
    };

    // Konwertuj plik na base64
    const base64Data = await fileToBase64(file);
    
    // Sprawdź rozmiar pliku po konwersji
    const base64Size = base64Data.length;
    const fileSizeInMB = base64Size / (1024 * 1024);
    
    // Firestore ma limit 1MB na dokument, więc sprawdzamy czy plik nie jest za duży
    if (fileSizeInMB > 0.9) {
      throw new Error(`Plik jest zbyt duży (${fileSizeInMB.toFixed(2)} MB). Maksymalny rozmiar to 0.9 MB.`);
    }
    
    // Aktualizacja dokumentu partii o informacje o certyfikacie
    const batchRef = doc(db, INVENTORY_BATCHES_COLLECTION, batchId);
    await updateDoc(batchRef, {
      certificateFileName: file.name,
      certificateContentType: file.type,
      certificateBase64: base64Data,
      certificateUploadedAt: serverTimestamp(),
      certificateUploadedBy: userId,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    });
    
    return "data-url-certificate";
  } catch (error) {
    console.error('Błąd podczas przesyłania certyfikatu partii:', error);
    throw new Error('Błąd podczas przesyłania certyfikatu: ' + error.message);
  }
};

  /**
 * Usuwa certyfikat partii z bazy danych
 * @param {string} batchId - ID partii
 * @param {string} userId - ID użytkownika usuwającego certyfikat
 * @returns {Promise<boolean>} - Wynik operacji
 */
export const deleteBatchCertificate = async (batchId, userId) => {
  try {
    if (!batchId) {
      throw new Error('Brak ID partii');
    }
    
    // Pobierz aktualne dane partii
    const batchRef = doc(db, INVENTORY_BATCHES_COLLECTION, batchId);
    const batchDoc = await getDoc(batchRef);
    
    if (!batchDoc.exists()) {
      throw new Error('Partia nie istnieje');
    }
    
    const batchData = batchDoc.data();
    
    // Sprawdź czy partia ma certyfikat
    if (!batchData.certificateBase64 && !batchData.certificateFileName) {
      throw new Error('Partia nie ma przypisanego certyfikatu');
    }
    
    // Aktualizuj dokument partii - usuń informacje o certyfikacie
    await updateDoc(batchRef, {
      certificateBase64: deleteField(),
      certificateFileName: deleteField(),
      certificateContentType: deleteField(),
      certificateUploadedAt: deleteField(),
      certificateUploadedBy: deleteField(),
      updatedAt: serverTimestamp(),
      updatedBy: userId
    });
    
    return true;
  } catch (error) {
    console.error('Błąd podczas usuwania certyfikatu partii:', error);
    throw new Error('Błąd podczas usuwania certyfikatu: ' + error.message);
  }
};

  /**
   * Dodaje wpis do historii cen dostawcy
   * @param {Object} historyData - Dane historyczne
   * @returns {Promise<Object>} - Dodany wpis historii
   */
  export const addSupplierPriceHistory = async (historyData) => {
    try {
      if (!historyData.priceId) {
        throw new Error('ID ceny dostawcy jest wymagane');
      }
      
      if (!historyData.itemId) {
        throw new Error('ID pozycji magazynowej jest wymagane');
      }
      
      if (!historyData.supplierId) {
        throw new Error('ID dostawcy jest wymagane');
      }
      
      if (typeof historyData.oldPrice !== 'number') {
        throw new Error('Stara cena musi być liczbą');
      }
      
      if (typeof historyData.newPrice !== 'number') {
        throw new Error('Nowa cena musi być liczbą');
      }
      
      const historyEntry = {
        ...historyData,
        createdAt: serverTimestamp()
      };
      
      const docRef = await addDoc(collection(db, INVENTORY_SUPPLIER_PRICE_HISTORY_COLLECTION), historyEntry);
      
      return {
        id: docRef.id,
        ...historyEntry
      };
    } catch (error) {
      console.error('Błąd podczas dodawania wpisu do historii cen dostawcy:', error);
      throw error;
    }
  };

  /**
   * Pobiera historię cen dostawcy
   * @param {string} priceId - ID ceny dostawcy
   * @returns {Promise<Array>} - Lista wpisów historii cen
   */
  export const getSupplierPriceHistory = async (priceId) => {
    try {
      const historyRef = collection(db, INVENTORY_SUPPLIER_PRICE_HISTORY_COLLECTION);
      const q = query(
        historyRef,
        where('priceId', '==', priceId),
        orderBy('createdAt', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      const history = [];
      
      querySnapshot.forEach(doc => {
        history.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return history;
    } catch (error) {
      console.error('Błąd podczas pobierania historii cen dostawcy:', error);
      throw error;
    }
  };

  /**
   * Pobiera historię cen dla pozycji magazynowej
   * @param {string} itemId - ID pozycji magazynowej
   * @returns {Promise<Array>} - Lista wpisów historii cen
   */
  export const getItemSupplierPriceHistory = async (itemId) => {
    try {
      const historyRef = collection(db, INVENTORY_SUPPLIER_PRICE_HISTORY_COLLECTION);
      const q = query(
        historyRef,
        where('itemId', '==', itemId),
        orderBy('createdAt', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      const history = [];
      
      querySnapshot.forEach(doc => {
        history.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return history;
    } catch (error) {
      console.error('Błąd podczas pobierania historii cen dla pozycji magazynowej:', error);
      throw error;
    }
  };