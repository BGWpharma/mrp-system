// src/services/productionService.js
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
    Timestamp,
    setDoc,
    increment
  } from 'firebase/firestore';
  import { db } from './firebase/config';
  import { generateMONumber, generateLOTNumber } from '../utils/numberGenerators';
  import { getInventoryItemByName, receiveInventory, createInventoryItem } from './inventoryService';
  
  const PRODUCTION_TASKS_COLLECTION = 'productionTasks';
  
  // Pobieranie wszystkich zadań produkcyjnych
  export const getAllTasks = async () => {
    const tasksRef = collection(db, PRODUCTION_TASKS_COLLECTION);
    const q = query(tasksRef, orderBy('scheduledDate', 'asc'));
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  };
  
  // Pobieranie zadań produkcyjnych na dany okres
  export const getTasksByDateRange = async (startDate, endDate) => {
    const tasksRef = collection(db, PRODUCTION_TASKS_COLLECTION);
    
    // Konwersja stringów dat na obiekty Date
    let startDateTime, endDateTime;
    
    try {
      startDateTime = new Date(startDate);
      endDateTime = new Date(endDate);
      
      // Sprawdzenie, czy daty są poprawne
      if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
        throw new Error('Nieprawidłowy format daty');
      }
      
      // Konwersja na Timestamp dla Firestore
      const startTimestamp = Timestamp.fromDate(startDateTime);
      const endTimestamp = Timestamp.fromDate(endDateTime);
      
      // Pobierz zadania, które zaczynają się w zakresie dat
      // lub kończą się w zakresie dat
      // lub obejmują cały zakres dat (zaczynają się przed i kończą po)
      const q = query(
        tasksRef,
        where('scheduledDate', '<=', endTimestamp),
        orderBy('scheduledDate', 'asc')
      );
      
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        .filter(task => {
          // Sprawdź, czy zadanie kończy się po dacie początkowej zakresu
          const taskEndDate = task.endDate 
            ? (task.endDate instanceof Timestamp ? task.endDate.toDate() : new Date(task.endDate))
            : (task.scheduledDate instanceof Timestamp ? new Date(task.scheduledDate.toDate().getTime() + 60 * 60 * 1000) : new Date(new Date(task.scheduledDate).getTime() + 60 * 60 * 1000));
          
          return taskEndDate >= startDateTime;
        });
    } catch (error) {
      console.error('Error parsing dates:', error);
      // W przypadku błędu zwróć wszystkie zadania
      const q = query(tasksRef, orderBy('scheduledDate', 'asc'));
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    }
  };
  
  // Pobieranie zadania po ID
  export const getTaskById = async (taskId) => {
    const docRef = doc(db, PRODUCTION_TASKS_COLLECTION, taskId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data()
      };
    } else {
      throw new Error('Zadanie produkcyjne nie istnieje');
    }
  };
  
  // Tworzenie nowego zadania produkcyjnego
  export const createTask = async (taskData, userId) => {
    try {
      // Wygeneruj numer MO
      const moNumber = await generateMONumber();
      
      // Przygotuj dane zadania z metadanymi
      const taskWithMeta = {
        ...taskData,
        moNumber, // Dodaj numer MO
        createdBy: userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      // Jeśli nie podano daty zakończenia, ustaw ją na 1 godzinę po dacie rozpoczęcia
      if (!taskWithMeta.endDate && taskWithMeta.scheduledDate) {
        const scheduledDate = taskWithMeta.scheduledDate instanceof Date 
          ? taskWithMeta.scheduledDate 
          : new Date(taskWithMeta.scheduledDate);
        
        const endDate = new Date(scheduledDate.getTime() + 60 * 60 * 1000); // +1 godzina
        taskWithMeta.endDate = endDate;
      }
      
      const docRef = await addDoc(collection(db, PRODUCTION_TASKS_COLLECTION), taskWithMeta);
      
      return {
        id: docRef.id,
        ...taskWithMeta
      };
    } catch (error) {
      console.error('Error creating task:', error);
      throw error;
    }
  };
  
  // Aktualizacja zadania produkcyjnego
  export const updateTask = async (taskId, taskData, userId) => {
    // Upewnij się, że endDate jest ustawiona
    if (!taskData.endDate) {
      // Jeśli nie ma endDate, ustaw na 1 godzinę po scheduledDate
      const scheduledDate = taskData.scheduledDate instanceof Date 
        ? taskData.scheduledDate 
        : new Date(taskData.scheduledDate);
      
      taskData.endDate = new Date(scheduledDate.getTime() + 60 * 60 * 1000);
    }
    
    const taskRef = doc(db, PRODUCTION_TASKS_COLLECTION, taskId);
    
    const updatedTask = {
      ...taskData,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    };
    
    await updateDoc(taskRef, updatedTask);
    
    return {
      id: taskId,
      ...updatedTask
    };
  };
  
  // Aktualizacja statusu zadania
  export const updateTaskStatus = async (taskId, status, userId) => {
    try {
      const taskRef = doc(db, PRODUCTION_TASKS_COLLECTION, taskId);
      const taskDoc = await getDoc(taskRef);
      
      if (!taskDoc.exists()) {
        throw new Error('Zadanie nie istnieje');
      }
      
      const taskData = taskDoc.data();
      const updates = {
        status,
        updatedAt: serverTimestamp(),
        updatedBy: userId
      };
      
      // Jeśli zadanie jest zakończone, oznacz je jako gotowe do dodania do magazynu
      if (status === 'Zakończone') {
        updates.readyForInventory = true;
        updates.completedAt = serverTimestamp();
      }
      
      await updateDoc(taskRef, updates);
      
      return { success: true };
    } catch (error) {
      console.error('Błąd podczas aktualizacji statusu zadania:', error);
      throw error;
    }
  };
  
  // Usuwanie zadania produkcyjnego
  export const deleteTask = async (taskId) => {
    try {
      // Sprawdź, czy zadanie ma powiązane partie w magazynie
      const batchesRef = collection(db, 'inventoryBatches');
      const q = query(batchesRef, where('sourceId', '==', taskId), where('source', '==', 'Produkcja'));
      const batchesSnapshot = await getDocs(q);
      
      // Usuń wszystkie powiązane partie
      const batchDeletions = batchesSnapshot.docs.map(doc => 
        deleteDoc(doc.ref)
      );
      
      // Poczekaj na usunięcie wszystkich partii
      await Promise.all(batchDeletions);
      
      // Pobierz transakcje związane z tym zadaniem
      const transactionsRef = collection(db, 'inventoryTransactions');
      const transactionsQuery = query(transactionsRef, where('reference', '==', `Zadanie: ${taskId}`));
      const transactionsSnapshot = await getDocs(transactionsQuery);
      
      // Usuń wszystkie transakcje
      const transactionDeletions = transactionsSnapshot.docs.map(doc => 
        deleteDoc(doc.ref)
      );
      
      // Poczekaj na usunięcie wszystkich transakcji
      await Promise.all(transactionDeletions);
      
      // Na końcu usuń samo zadanie
      const taskRef = doc(db, PRODUCTION_TASKS_COLLECTION, taskId);
      await deleteDoc(taskRef);
      
      return { success: true };
    } catch (error) {
      console.error('Błąd podczas usuwania zadania produkcyjnego:', error);
      throw error;
    }
  };
  
  // Pobieranie zadań według statusu
  export const getTasksByStatus = async (status) => {
    console.log(`Próba pobrania zadań o statusie: "${status}"`);
    
    // Sprawdźmy, czy status nie jest pusty
    if (!status) {
      console.error('Błąd: status nie może być pusty');
      return [];
    }
    
    try {
      const tasksRef = collection(db, PRODUCTION_TASKS_COLLECTION);
      
      // Utwórz zapytanie
      const q = query(
        tasksRef, 
        where('status', '==', status),
        orderBy('scheduledDate', 'asc')
      );
      
      console.log(`Wykonuję zapytanie do kolekcji ${PRODUCTION_TASKS_COLLECTION} o zadania ze statusem "${status}"`);
      
      // Pobierz dane
      const querySnapshot = await getDocs(q);
      
      // Mapuj rezultaty
      const tasks = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      console.log(`Znaleziono ${tasks.length} zadań o statusie "${status}"`);
      
      return tasks;
    } catch (error) {
      console.error(`Błąd podczas pobierania zadań o statusie "${status}":`, error);
      throw error;
    }
  };
  
  // Dodanie produktu z zadania produkcyjnego do magazynu jako partii
  export const addTaskProductToInventory = async (taskId, userId) => {
    const taskRef = doc(db, PRODUCTION_TASKS_COLLECTION, taskId);
    
    // Pobierz aktualne dane zadania
    const taskDoc = await getDoc(taskRef);
    if (!taskDoc.exists()) {
      throw new Error('Zadanie nie istnieje');
    }
    
    const taskData = taskDoc.data();
    
    // Sprawdź, czy zadanie jest zakończone i gotowe do dodania do magazynu
    if (taskData.status !== 'Zakończone' || !taskData.readyForInventory) {
      throw new Error('Zadanie nie jest gotowe do dodania do magazynu');
    }
    
    // Sprawdź, czy zadanie ma nazwę produktu i ilość
    if (!taskData.productName || !taskData.quantity) {
      throw new Error('Zadanie nie zawiera informacji o produkcie lub ilości');
    }
    
    try {
      let inventoryItem;
      let inventoryItemId;
      
      // Jeśli zadanie ma powiązany produkt z magazynu, użyj go
      if (taskData.inventoryProductId) {
        inventoryItemId = taskData.inventoryProductId;
        const itemRef = doc(db, 'inventory', inventoryItemId);
        const itemDoc = await getDoc(itemRef);
        
        if (itemDoc.exists()) {
          inventoryItem = itemDoc.data();
        } else {
          throw new Error(`Produkt o ID ${inventoryItemId} nie istnieje w magazynie`);
        }
      } else {
        // Spróbuj znaleźć produkt po nazwie
        const inventoryRef = collection(db, 'inventory');
        const q = query(
          inventoryRef,
          where('name', '==', taskData.productName),
          where('category', '==', 'Gotowe produkty')
        );
        
        const querySnapshot = await getDocs(q);
        
        if (!querySnapshot.empty) {
          // Użyj pierwszego znalezionego produktu
          const doc = querySnapshot.docs[0];
          inventoryItemId = doc.id;
          inventoryItem = doc.data();
        } else {
          // Produkt nie istnieje, utwórz nowy
          const newItemRef = doc(collection(db, 'inventory'));
          inventoryItemId = newItemRef.id;
          
          const newItem = {
            name: taskData.productName,
            description: `Produkt utworzony automatycznie z zadania produkcyjnego: ${taskData.name}`,
            category: 'Gotowe produkty',
            quantity: 0,
            unit: taskData.unit || 'szt.',
            minStockLevel: 0,
            optimalStockLevel: taskData.quantity * 2, // Przykładowa wartość
            location: 'Magazyn główny',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdBy: userId,
            updatedBy: userId
          };
          
          await setDoc(newItemRef, newItem);
          inventoryItem = newItem;
        }
      }
      
      // Wygeneruj numer LOT
      const lotNumber = await generateLOTNumber();
      
      // Dodaj partię do magazynu
      const batchRef = doc(collection(db, 'inventoryBatches'));
      const batchData = {
        itemId: inventoryItemId,
        itemName: taskData.productName,
        quantity: taskData.quantity,
        initialQuantity: taskData.quantity,
        batchNumber: `PROD-${taskId.substring(0, 6)}`,
        receivedDate: serverTimestamp(),
        expiryDate: null, // Można dodać logikę określania daty ważności
        lotNumber: lotNumber,
        source: 'Produkcja',
        sourceId: taskId,
        notes: `Partia z zadania produkcyjnego: ${taskData.name}`,
        unitPrice: taskData.costs ? (taskData.costs.totalCost / taskData.quantity) : 0,
        createdAt: serverTimestamp(),
        createdBy: userId
      };
      
      await setDoc(batchRef, batchData);
      
      // Zaktualizuj ilość w magazynie
      const itemRef = doc(db, 'inventory', inventoryItemId);
      await updateDoc(itemRef, {
        quantity: increment(taskData.quantity),
        updatedAt: serverTimestamp(),
        updatedBy: userId
      });
      
      // Dodaj transakcję do historii
      const transactionRef = doc(collection(db, 'inventoryTransactions'));
      const transactionData = {
        itemId: inventoryItemId,
        itemName: taskData.productName,
        type: 'receive',
        quantity: taskData.quantity,
        date: serverTimestamp(),
        reason: 'Z produkcji',
        reference: `Zadanie: ${taskData.name} (ID: ${taskId})`,
        notes: `Produkt dodany do magazynu z zadania produkcyjnego`,
        batchId: batchRef.id,
        createdBy: userId,
        createdAt: serverTimestamp()
      };
      
      await setDoc(transactionRef, transactionData);
      
      // Zaktualizuj zadanie
      const updates = {
        inventoryUpdated: true,
        inventoryItemId: inventoryItemId,
        inventoryBatchId: batchRef.id,
        readyForInventory: false, // Oznacz jako już dodane do magazynu
        updatedAt: serverTimestamp(),
        updatedBy: userId
      };
      
      await updateDoc(taskRef, updates);
      
      return {
        success: true,
        inventoryItemId,
        inventoryBatchId: batchRef.id
      };
    } catch (error) {
      console.error('Błąd podczas dodawania produktu do magazynu:', error);
      
      // Zaktualizuj zadanie z informacją o błędzie
      await updateDoc(taskRef, {
        inventoryError: error.message,
        updatedAt: serverTimestamp(),
        updatedBy: userId
      });
      
      throw error;
    }
  };