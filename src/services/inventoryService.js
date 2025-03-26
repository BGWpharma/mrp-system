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
    setDoc
  } from 'firebase/firestore';
  import { db } from './firebase/config';
  import { generateLOTNumber } from '../utils/numberGenerators';
  
  const INVENTORY_COLLECTION = 'inventory';
  const INVENTORY_TRANSACTIONS_COLLECTION = 'inventoryTransactions';
  const INVENTORY_BATCHES_COLLECTION = 'inventoryBatches';
  const WAREHOUSES_COLLECTION = 'warehouses';
  
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
  export const getAllInventoryItems = async (warehouseId = null) => {
    const itemsRef = collection(db, INVENTORY_COLLECTION);
    const q = query(itemsRef, orderBy('name', 'asc'));
    
    const querySnapshot = await getDocs(q);
    const items = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Jeśli podano warehouseId, filtrujemy za pomocą partii
    if (warehouseId) {
      // Pobierz wszystkie partie dla podanego magazynu
      const batchesRef = collection(db, INVENTORY_BATCHES_COLLECTION);
      const batchesQuery = query(batchesRef, where('warehouseId', '==', warehouseId));
      const batchesSnapshot = await getDocs(batchesQuery);
      
      // Zbierz ID pozycji, które mają partie w danym magazynie
      const itemIdsInWarehouse = new Set();
      batchesSnapshot.docs.forEach(doc => {
        itemIdsInWarehouse.add(doc.data().itemId);
      });
      
      // Filtruj pozycje, które mają partie w danym magazynie
      return items.filter(item => itemIdsInWarehouse.has(item.id));
    }
    
    return items;
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
      throw new Error('Pozycja magazynowa nie istnieje');
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
      const batchesRef = collection(db, INVENTORY_BATCHES_COLLECTION);
      
      let q;
      if (warehouseId) {
        // Jeśli podano magazyn, filtruj partie po magazynie
        q = query(
          batchesRef,
          where('itemId', '==', itemId),
          where('warehouseId', '==', warehouseId),
          orderBy('expiryDate', 'asc') // Sortuj wg daty ważności (FEFO)
        );
      } else {
        // W przeciwnym razie pobierz wszystkie partie dla pozycji
        q = query(
          batchesRef,
          where('itemId', '==', itemId),
          orderBy('expiryDate', 'asc') // Sortuj wg daty ważności (FEFO)
        );
      }
      
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          // Konwertuj Timestamp na Date dla łatwiejszej obsługi
          expiryDate: data.expiryDate ? data.expiryDate.toDate() : null,
          receivedDate: data.receivedDate ? data.receivedDate.toDate() : null,
          // Upewnij się, że cena jednostkowa jest dostępna
          unitPrice: data.unitPrice || 0
        };
      });
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
    
    // Używamy filtrów po stronie serwera z indeksem złożonym
    const q = query(
      batchesRef,
      where('expiryDate', '>=', Timestamp.fromDate(today)),
      where('expiryDate', '<=', Timestamp.fromDate(thresholdDate)),
      where('quantity', '>', 0), // Tylko partie z ilością większą od 0
      orderBy('expiryDate', 'asc')
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  };

  // Pobieranie przeterminowanych partii
  export const getExpiredBatches = async () => {
    const batchesRef = collection(db, INVENTORY_BATCHES_COLLECTION);
    
    // Dzisiejsza data
    const today = new Date();
    
    // Używamy filtrów po stronie serwera z indeksem złożonym
    const q = query(
      batchesRef,
      where('expiryDate', '<', Timestamp.fromDate(today)),
      where('quantity', '>', 0), // Tylko partie z ilością większą od 0
      orderBy('expiryDate', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
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
      
      // Dodaj transakcję
      const transaction = {
        itemId,
        itemName: currentItem.name,
        type: 'RECEIVE',
        quantity: Number(quantity),
        previousQuantity: currentItem.quantity,
        warehouseId: transactionData.warehouseId,
        ...transactionData,
        transactionDate: serverTimestamp(),
        createdBy: userId
      };
      
      const transactionRef = await addDoc(collection(db, INVENTORY_TRANSACTIONS_COLLECTION), transaction);
      
      // Generuj numer partii, jeśli nie został podany
      let generatedLotNumber = transactionData.lotNumber || transactionData.batchNumber;
      
      if (!generatedLotNumber) {
        generatedLotNumber = await generateLOTNumber();
      }
      
      // Dodaj partię
      if (transactionData.addBatch !== false) {
        const batch = {
          itemId,
          itemName: currentItem.name,
          transactionId: transactionRef.id,
          quantity: Number(quantity),
          initialQuantity: Number(quantity),
          batchNumber: generatedLotNumber,
          lotNumber: generatedLotNumber,
          warehouseId: transactionData.warehouseId, // Zawsze dodajemy warehouseId
          receivedDate: serverTimestamp(),
          expiryDate: transactionData.expiryDate || null,
          notes: transactionData.batchNotes || '',
          unitPrice: transactionData.unitPrice || 0,
          createdBy: userId
        };
        
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
      
      // Emituj zdarzenie o zmianie stanu magazynu
      const event = new CustomEvent('inventory-updated', { 
        detail: { itemId, action: 'receive', quantity: Number(quantity) }
      });
      window.dispatchEvent(event);
      
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
          // Sprawdź, czy już mamy dane zadania w transakcji
          if (!transaction.taskNumber && !transaction.taskName) {
            try {
              const taskRef = doc(db, 'productionTasks', transaction.referenceId);
              const taskDoc = await getDoc(taskRef);
              
              if (taskDoc.exists()) {
                const taskData = taskDoc.data();
                transaction.taskName = taskData.name || '';
                transaction.taskNumber = taskData.number || '';
                transaction.clientName = taskData.clientName || '';
                transaction.clientId = taskData.clientId || '';
                
                // Zaktualizuj transakcję, aby zapisać te dane na przyszłość
                await updateDoc(doc(transactionsRef, transaction.id), {
                  taskName: transaction.taskName,
                  taskNumber: transaction.taskNumber,
                  clientName: transaction.clientName,
                  clientId: transaction.clientId
                });
              }
            } catch (error) {
              console.error('Błąd podczas pobierania danych zadania:', error);
              // Kontynuuj, nawet jeśli nie udało się pobrać danych zadania
            }
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
      
      // Jeśli zmieniono datę ważności, konwertuj ją na Timestamp
      if (batchData.expiryDate && batchData.expiryDate instanceof Date) {
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

  // Bookowanie produktu na zadanie produkcyjne
  export const bookInventoryForTask = async (itemId, quantity, taskId, userId, reservationMethod = 'expiry') => {
    try {
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
      
      // Sprawdź, czy jest wystarczająca ilość produktu
      if (availableQuantity < quantity) {
        throw new Error(`Niewystarczająca ilość produktu w magazynie. Dostępne: ${availableQuantity} ${item.unit}`);
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
      
      // Sortuj partie według wybranej metody
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
      
      // Zapisz informacje o zarezerwowanych partiach
      const reservedBatches = [];
      let remainingQuantity = quantity;
      let selectedBatchId = '';
      let selectedBatchNumber = '';
      
      for (const batch of batches) {
        if (remainingQuantity <= 0) break;
        
        const quantityFromBatch = Math.min(batch.quantity, remainingQuantity);
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
      
      // Zapisz informacje o partiach w zadaniu produkcyjnym
      if (taskDoc.exists()) {
        const materialBatches = taskData.materialBatches || {};
        
        materialBatches[itemId] = reservedBatches;
        
        await updateDoc(taskRef, {
          materialBatches,
          updatedAt: serverTimestamp()
        });
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
        notes: `Zarezerwowano na zadanie produkcyjne MO: ${taskNumber || taskId} (metoda: ${reservationMethod})`,
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
      // Pobierz aktualny stan produktu
      const item = await getInventoryItemById(itemId);
      
      // Sprawdź, czy jest wystarczająca ilość zarezerwowana
      if (!item.bookedQuantity || item.bookedQuantity < quantity) {
        throw new Error(`Nie można anulować rezerwacji. Zarezerwowano tylko: ${item.bookedQuantity || 0} ${item.unit}`);
      }
      
      // Aktualizuj pole bookedQuantity w produkcie
      const itemRef = doc(db, INVENTORY_COLLECTION, itemId);
      await updateDoc(itemRef, {
        bookedQuantity: increment(-quantity),
        updatedAt: serverTimestamp(),
        updatedBy: userId
      });
      
      // Pobierz dane zadania produkcyjnego
      let taskNumber = '';
      let taskName = '';
      let clientName = '';
      let clientId = '';
      
      if (taskId) {
        const taskRef = doc(db, 'productionTasks', taskId);
        const taskDoc = await getDoc(taskRef);
        
        if (taskDoc.exists()) {
          const taskData = taskDoc.data();
          taskName = taskData.name || '';
          taskNumber = taskData.number || '';
          clientName = taskData.clientName || '';
          clientId = taskData.clientId || '';
        }
      }
      
      // Dodaj wpis w transakcjach
      const transactionRef = collection(db, INVENTORY_TRANSACTIONS_COLLECTION);
      await addDoc(transactionRef, {
        itemId,
        itemName: item.name,
        quantity,
        type: 'booking_cancel',
        reason: 'Anulowanie rezerwacji',
        referenceId: taskId,
        taskId: taskId,
        taskName: taskName,
        taskNumber: taskNumber,
        clientName: clientName,
        clientId: clientId,
        notes: `Anulowano rezerwację dla zadania produkcyjnego MO: ${taskNumber || taskId}`,
        createdAt: serverTimestamp(),
        createdBy: userId
      });
      
      // Emituj zdarzenie o zmianie stanu magazynu
      const event = new CustomEvent('inventory-updated', { 
        detail: { itemId, action: 'booking_cancel', quantity }
      });
      window.dispatchEvent(event);
      
      return {
        success: true,
        message: `Anulowano rezerwację ${quantity} ${item.unit} produktu ${item.name}`
      };
    } catch (error) {
      console.error('Błąd podczas anulowania rezerwacji produktu:', error);
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
      
      // Filtruj partie, które mają datę ważności (nie null)
      const batchesWithExpiry = availableBatches.filter(batch => batch.expiryDate);
      
      // Sortuj według daty ważności (od najwcześniejszej) - sortowanie po stronie klienta
      batchesWithExpiry.sort((a, b) => {
        const dateA = a.expiryDate instanceof Timestamp ? a.expiryDate.toDate() : new Date(a.expiryDate);
        const dateB = b.expiryDate instanceof Timestamp ? b.expiryDate.toDate() : new Date(b.expiryDate);
        return dateA - dateB;
      });
      
      // Dodaj partie bez daty ważności na koniec
      const batchesWithoutExpiry = availableBatches.filter(batch => !batch.expiryDate);
      
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
      
      // Aktualizuj partię źródłową
      await updateDoc(batchRef, {
        quantity: increment(-transferQuantity),
        updatedAt: serverTimestamp(),
        updatedBy: userId
      });
      
      if (isNewBatch) {
        // Utwórz nową partię w magazynie docelowym
        const newBatchData = {
          ...batchData,
          id: undefined, // Usuń ID, aby Firebase wygenerowało nowe
          quantity: transferQuantity,
          initialQuantity: transferQuantity,
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
        await updateDoc(targetBatchRef, {
          quantity: increment(transferQuantity),
          updatedAt: serverTimestamp(),
          updatedBy: userId,
          lastTransferFrom: sourceWarehouseId,
          lastTransferAt: serverTimestamp()
        });
      }
      
      // Dodaj transakcję
      const transactionData = {
        type: 'TRANSFER',
        itemId,
        itemName: itemData.name,
        quantity: transferQuantity,
        sourceWarehouseId,
        targetWarehouseId,
        sourceBatchId: batchId,
        targetBatchId,
        notes,
        createdBy: userId,
        createdAt: serverTimestamp()
      };
      
      await addDoc(collection(db, INVENTORY_TRANSACTIONS_COLLECTION), transactionData);
      
      // Przelicz i zaktualizuj ilość głównej pozycji na podstawie partii
      // (nie jest to konieczne przy transferze między magazynami, ale zapewniamy spójność danych)
      await recalculateItemQuantity(itemId);
      
      return {
        success: true,
        sourceWarehouseId,
        targetWarehouseId,
        quantity: transferQuantity,
        message: 'Transfer zakończony pomyślnie'
      };
    } catch (error) {
      console.error('Błąd podczas transferu partii:', error);
      throw error;
    }
  };

  // ------ ZARZĄDZANIE INWENTARYZACJĄ ------
  
  const STOCKTAKING_COLLECTION = 'stocktaking';
  const STOCKTAKING_ITEMS_COLLECTION = 'stocktakingItems';
  
  // Pobieranie wszystkich inwentaryzacji
  export const getAllStocktakings = async () => {
    try {
      const stocktakingRef = collection(db, STOCKTAKING_COLLECTION);
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
      const docRef = doc(db, STOCKTAKING_COLLECTION, stocktakingId);
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
      
      const docRef = await addDoc(collection(db, STOCKTAKING_COLLECTION), stocktakingWithMeta);
      
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
      const stocktakingRef = doc(db, STOCKTAKING_COLLECTION, stocktakingId);
      
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
      const itemsRef = collection(db, STOCKTAKING_ITEMS_COLLECTION);
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
      const itemsRef = collection(db, STOCKTAKING_ITEMS_COLLECTION);
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
          expiryDate: batchData.expiryDate,
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
      
      const docRef = await addDoc(collection(db, STOCKTAKING_ITEMS_COLLECTION), stocktakingItem);
      
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
      const itemRef = doc(db, STOCKTAKING_ITEMS_COLLECTION, itemId);
      
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
      const itemRef = doc(db, STOCKTAKING_ITEMS_COLLECTION, itemId);
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
            const itemRef = doc(db, STOCKTAKING_ITEMS_COLLECTION, item.id);
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
      const stocktakingRef = doc(db, STOCKTAKING_COLLECTION, stocktakingId);
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
      
      // Pobierz wszystkie partie dla danej pozycji
      const batches = await getItemBatches(itemId);
      
      // Oblicz sumę ilości ze wszystkich partii
      const totalQuantity = batches.reduce((sum, batch) => sum + (Number(batch.quantity) || 0), 0);
      
      console.log(`Suma ilości z partii: ${totalQuantity}`);
      
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