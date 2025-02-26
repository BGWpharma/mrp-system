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
    increment
  } from 'firebase/firestore';
  import { db } from './firebase/config';
  
  const INVENTORY_COLLECTION = 'inventory';
  const INVENTORY_TRANSACTIONS_COLLECTION = 'inventoryTransactions';
  
  // Pobieranie wszystkich pozycji magazynowych
  export const getAllInventoryItems = async () => {
    const itemsRef = collection(db, INVENTORY_COLLECTION);
    const q = query(itemsRef, orderBy('name', 'asc'));
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
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
    
    const itemWithMeta = {
      ...itemData,
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
    
    const updatedItem = {
      ...itemData,
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
    const itemRef = doc(db, INVENTORY_COLLECTION, itemId);
    await deleteDoc(itemRef);
    
    return { success: true };
  };
  
  // Przyjęcie towaru (zwiększenie stanu)
  export const receiveInventory = async (itemId, quantity, transactionData, userId) => {
    // Pobierz bieżącą pozycję
    const currentItem = await getInventoryItemById(itemId);
    
    // Aktualizuj stan
    const itemRef = doc(db, INVENTORY_COLLECTION, itemId);
    await updateDoc(itemRef, {
      quantity: increment(Number(quantity)),
      updatedAt: serverTimestamp(),
      updatedBy: userId
    });
    
    // Dodaj transakcję
    const transaction = {
      itemId,
      itemName: currentItem.name,
      type: 'RECEIVE',
      quantity: Number(quantity),
      previousQuantity: currentItem.quantity,
      newQuantity: currentItem.quantity + Number(quantity),
      ...transactionData,
      transactionDate: serverTimestamp(),
      createdBy: userId
    };
    
    await addDoc(collection(db, INVENTORY_TRANSACTIONS_COLLECTION), transaction);
    
    return {
      id: itemId,
      quantity: currentItem.quantity + Number(quantity)
    };
  };
  
  // Wydanie towaru (zmniejszenie stanu)
  export const issueInventory = async (itemId, quantity, transactionData, userId) => {
    // Pobierz bieżącą pozycję
    const currentItem = await getInventoryItemById(itemId);
    
    // Sprawdź, czy jest wystarczająca ilość
    if (currentItem.quantity < Number(quantity)) {
      throw new Error('Niewystarczająca ilość towaru w magazynie');
    }
    
    // Aktualizuj stan
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
      ...transactionData,
      transactionDate: serverTimestamp(),
      createdBy: userId
    };
    
    await addDoc(collection(db, INVENTORY_TRANSACTIONS_COLLECTION), transaction);
    
    return {
      id: itemId,
      quantity: currentItem.quantity - Number(quantity)
    };
  };
  
  // Pobieranie historii transakcji dla danej pozycji
  export const getItemTransactions = async (itemId) => {
    const transactionsRef = collection(db, INVENTORY_TRANSACTIONS_COLLECTION);
    const q = query(
      transactionsRef, 
      where('itemId', '==', itemId),
      orderBy('transactionDate', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
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