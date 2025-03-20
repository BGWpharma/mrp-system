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
    Timestamp
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
      
      // Aktualizuj stan
      const itemRef = doc(db, INVENTORY_COLLECTION, itemId);
      await updateDoc(itemRef, {
        quantity: increment(Number(quantity)),
        updatedAt: serverTimestamp(),
        updatedBy: userId,
        // Aktualizujemy cenę jednostkową w pozycji magazynowej, jeśli została podana
        ...(transactionData.unitPrice !== undefined && { unitPrice: transactionData.unitPrice })
      });
      
      // Dodaj transakcję
      const transaction = {
        itemId,
        itemName: currentItem.name,
        type: 'RECEIVE',
        quantity: Number(quantity),
        previousQuantity: currentItem.quantity,
        newQuantity: currentItem.quantity + Number(quantity),
        warehouseId: transactionData.warehouseId, // Dodajemy warehouseId do transakcji
        ...transactionData,
        transactionDate: serverTimestamp(),
        createdBy: userId
      };
      
      const transactionRef = await addDoc(collection(db, INVENTORY_TRANSACTIONS_COLLECTION), transaction);
      
      // Jeśli podano datę ważności, dodaj partię
      if (transactionData.expiryDate) {
        // Wygeneruj numer LOT jeśli nie podano
        const generatedLotNumber = await generateLOTNumber();
        
        // Użyj podanego numeru partii/LOT lub wygenerowanego
        const batchLotNumber = transactionData.batchNumber || transactionData.lotNumber || generatedLotNumber;
        
        const batch = {
          itemId,
          itemName: currentItem.name,
          transactionId: transactionRef.id,
          quantity: Number(quantity),
          initialQuantity: Number(quantity),
          batchNumber: batchLotNumber, // Używamy jednego numeru dla partii/LOT
          lotNumber: batchLotNumber, // Ten sam numer dla spójności danych
          warehouseId: transactionData.warehouseId, // Zawsze dodajemy warehouseId
          expiryDate: transactionData.expiryDate,
          receivedDate: serverTimestamp(),
          notes: transactionData.batchNotes || '',
          unitPrice: transactionData.unitPrice || 0, // Dodajemy cenę jednostkową do partii
          createdBy: userId
        };
        
        await addDoc(collection(db, INVENTORY_BATCHES_COLLECTION), batch);
      } else {
        // Nawet jeśli nie podano daty ważności, tworzymy partię
        const generatedLotNumber = await generateLOTNumber();
        
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
          notes: transactionData.batchNotes || '',
          unitPrice: transactionData.unitPrice || 0,
          createdBy: userId
        };
        
        await addDoc(collection(db, INVENTORY_BATCHES_COLLECTION), batch);
      }
      
      return {
        id: itemId,
        quantity: currentItem.quantity + Number(quantity)
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
    
    // Aktualizuj stan głównej pozycji
    const itemRef = doc(db, INVENTORY_COLLECTION, itemId);
    await updateDoc(itemRef, {
      quantity: increment(-Number(quantity)),
      updatedAt: serverTimestamp(),
      updatedBy: userId
    });
    
    // Dodaj transakcję
    const transaction = {
      itemId,
      itemName: currentItem.name,
      type: 'ISSUE',
      quantity: Number(quantity),
      previousQuantity: currentItem.quantity,
      newQuantity: currentItem.quantity - Number(quantity),
      warehouseId: transactionData.warehouseId, // Dodajemy warehouseId do transakcji
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
        
        const quantityToDeduct = Math.min(batch.quantity, remainingQuantity);
        remainingQuantity -= quantityToDeduct;
        
        const batchRef = doc(db, INVENTORY_BATCHES_COLLECTION, batch.id);
        await updateDoc(batchRef, {
          quantity: increment(-quantityToDeduct),
          updatedAt: serverTimestamp()
        });
      }
    }
    
    return {
      id: itemId,
      quantity: currentItem.quantity - Number(quantity)
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
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date()
      }));
    } catch (error) {
      console.error('Error getting item transactions:', error);
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
  export const bookInventoryForTask = async (itemId, quantity, taskId, userId) => {
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
      
      // Sprawdź, czy jest wystarczająca ilość produktu
      if (item.quantity < quantity) {
        throw new Error(`Niewystarczająca ilość produktu w magazynie. Dostępne: ${item.quantity} ${item.unit}`);
      }
      
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
      
      // Dodaj wpis w transakcjach
      const transactionRef = collection(db, INVENTORY_TRANSACTIONS_COLLECTION);
      await addDoc(transactionRef, {
        itemId,
        itemName: item.name,
        quantity,
        type: 'booking',
        reason: 'Zadanie produkcyjne',
        referenceId: taskId,
        notes: `Zarezerwowano na zadanie produkcyjne ID: ${taskId}`,
        createdAt: serverTimestamp(),
        createdBy: userId
      });
      
      // Emituj zdarzenie o zmianie stanu magazynu
      const event = new CustomEvent('inventory-updated', { 
        detail: { itemId, action: 'booked', quantity }
      });
      window.dispatchEvent(event);
      
      return {
        success: true,
        message: `Zarezerwowano ${quantity} ${item.unit} produktu ${item.name} na zadanie produkcyjne`
      };
    } catch (error) {
      console.error('Błąd podczas bookowania produktu:', error);
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
      
      // Dodaj wpis w transakcjach
      const transactionRef = collection(db, INVENTORY_TRANSACTIONS_COLLECTION);
      await addDoc(transactionRef, {
        itemId,
        itemName: item.name,
        quantity,
        type: 'booking_cancel',
        reason: 'Anulowanie rezerwacji',
        referenceId: taskId,
        notes: `Anulowano rezerwację dla zadania produkcyjnego ID: ${taskId}`,
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