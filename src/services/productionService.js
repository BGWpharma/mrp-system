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
  import { format } from 'date-fns';
  import { generateMONumber, generateLOTNumber } from '../utils/numberGenerators';
  import { 
    getInventoryItemByName, 
    getInventoryItemById,
    receiveInventory, 
    createInventoryItem, 
    getAllInventoryItems,
    bookInventoryForTask,
    cancelBooking,
    addInventoryItem,
    getInventoryBatches
  } from './inventoryService';
  
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
      
      console.log('Konwersja dat w getTasksByDateRange:', 
        'startDate:', startDate, '→', startDateTime, 
        'endDate:', endDate, '→', endDateTime);
      
      // Sprawdzenie, czy daty są poprawne
      if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
        console.error('Nieprawidłowy format daty:', startDate, endDate);
        throw new Error('Nieprawidłowy format daty');
      }
      
      // Pobierz wszystkie zadania bez filtrowania na poziomie zapytania
      const q = query(
        tasksRef,
        orderBy('scheduledDate', 'asc')
      );
      
      console.log('Wykonywanie zapytania do bazy danych...');
      const querySnapshot = await getDocs(q);
      console.log(`Pobrano ${querySnapshot.docs.length} zadań przed filtrowaniem`);
      
      const allTasks = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      console.log('Wszystkie zadania przed filtrowaniem:', allTasks);
      
      // Filtrujemy po stronie klienta, aby uwzględnić wszystkie możliwe przypadki
      const filteredTasks = allTasks.filter(task => {
        // Konwertuj daty zadania
        let taskStartDate, taskEndDate;
        
        // Obsługa daty rozpoczęcia
        if (task.scheduledDate) {
          if (task.scheduledDate instanceof Timestamp) {
            taskStartDate = task.scheduledDate.toDate();
          } else if (typeof task.scheduledDate === 'string') {
            taskStartDate = new Date(task.scheduledDate);
          } else if (task.scheduledDate instanceof Date) {
            taskStartDate = task.scheduledDate;
          } else {
            console.warn(`Nieprawidłowy format daty rozpoczęcia dla zadania ${task.id}:`, task.scheduledDate);
            taskStartDate = new Date(); // Domyślna data
          }
        } else {
          console.warn(`Brak daty rozpoczęcia dla zadania ${task.id}`);
          taskStartDate = new Date(); // Domyślna data
        }
        
        // Obsługa daty zakończenia
        if (task.endDate) {
          if (task.endDate instanceof Timestamp) {
            taskEndDate = task.endDate.toDate();
          } else if (typeof task.endDate === 'string') {
            taskEndDate = new Date(task.endDate);
          } else if (task.endDate instanceof Date) {
            taskEndDate = task.endDate;
          } else {
            console.warn(`Nieprawidłowy format daty zakończenia dla zadania ${task.id}:`, task.endDate);
            // Jeśli data zakończenia jest nieprawidłowa, ustaw ją na 1 godzinę po dacie rozpoczęcia
            taskEndDate = new Date(taskStartDate.getTime() + 60 * 60 * 1000);
          }
        } else {
          // Jeśli nie ma daty zakończenia, ustaw na 1 godzinę po dacie rozpoczęcia
          taskEndDate = new Date(taskStartDate.getTime() + 60 * 60 * 1000);
        }
        
        // Sprawdź, czy zadanie mieści się w wybranym zakresie dat
        // Zadanie powinno zostać uwzględnione, jeśli:
        // - jego początek lub koniec znajduje się w zakresie dat
        // - lub obejmuje cały zakres dat (zaczyna się przed i kończy po zakresie)
        const startsBeforeRangeEnds = taskStartDate <= endDateTime;
        const endsAfterRangeStarts = taskEndDate >= startDateTime;
        
        const isVisible = startsBeforeRangeEnds && endsAfterRangeStarts;
        
        console.log('Sprawdzanie widoczności zadania:', task.id, task.name, 
          'startDate:', taskStartDate, 
          'endDate:', taskEndDate,
          'startDateTime:', startDateTime,
          'endDateTime:', endDateTime,
          'Widoczne?', isVisible);
        
        return isVisible;
      });
      
      console.log(`Po filtrowaniu pozostało ${filteredTasks.length} zadań`);
      return filteredTasks;
    } catch (error) {
      console.error('Error parsing dates:', error);
      // W przypadku błędu zwróć wszystkie zadania
      console.log('Błąd podczas przetwarzania dat, pobieranie wszystkich zadań...');
      const q = query(tasksRef, orderBy('scheduledDate', 'asc'));
      const querySnapshot = await getDocs(q);
      const allTasks = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      console.log(`Pobrano ${allTasks.length} zadań (awaryjnie)`);
      return allTasks;
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
      
      // Zapisz zadanie w bazie danych
      console.log(`Tworzenie zadania z numerem MO: ${moNumber}`);
      const docRef = await addDoc(collection(db, PRODUCTION_TASKS_COLLECTION), taskWithMeta);
      
      // Teraz, gdy zadanie zostało utworzone, zarezerwuj materiały
      const missingMaterials = []; // Lista materiałów, których nie ma w magazynie
      
      if (taskWithMeta.materials && taskWithMeta.materials.length > 0) {
        // Określ metodę rezerwacji (domyślnie według daty ważności)
        const reservationMethod = taskWithMeta.reservationMethod || 'expiry';
        
        for (const material of taskWithMeta.materials) {
          try {
            // Sprawdź, czy materiał jest oznaczony jako brakujący
            if (material.missing) {
              // Pomijamy rezerwację dla brakujących materiałów
              missingMaterials.push(material.name);
              console.log(`Pomijam rezerwację brakującego materiału: ${material.name}`);
              continue;
            }
            
            // Sprawdź dostępność i zarezerwuj materiał z określoną metodą rezerwacji
            const materialId = material.inventoryItemId || material.id;
            if (materialId) {
              console.log(`Rezerwacja materiału ${material.name} dla zadania MO: ${moNumber}`);
              await bookInventoryForTask(materialId, material.quantity, docRef.id, userId, reservationMethod);
            } else {
              console.warn(`Materiał ${material.name} nie ma przypisanego ID pozycji magazynowej, pomijam rezerwację`);
            }
          } catch (error) {
            console.error(`Błąd przy rezerwacji materiału ${material.name}:`, error);
            // Kontynuuj rezerwację pozostałych materiałów mimo błędu
          }
        }
      }
      
      // Jeśli były brakujące materiały, dodaj informację do zadania
      if (missingMaterials.length > 0) {
        // Aktualizuj zadanie z informacją o brakujących materiałach
        await updateDoc(doc(db, PRODUCTION_TASKS_COLLECTION, docRef.id), {
          missingMaterials,
          updatedAt: serverTimestamp()
        });
      }
      
      return {
        id: docRef.id,
        ...taskWithMeta,
        missingMaterials
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
  export const updateTaskStatus = async (taskId, newStatus, userId) => {
    try {
      const taskRef = doc(db, PRODUCTION_TASKS_COLLECTION, taskId);
      const taskSnapshot = await getDoc(taskRef);
      
      if (!taskSnapshot.exists()) {
        throw new Error('Zadanie nie istnieje');
      }
      
      const task = taskSnapshot.data();
      const updates = { status: newStatus };
      
      if (newStatus === 'W trakcie') {
        updates.startDate = new Date().toISOString();
      }
      else if (newStatus === 'Zakończone') {
        updates.completionDate = new Date().toISOString();
        
        // Jeśli zadanie ma produkt, oznaczamy je jako gotowe do dodania do magazynu
        if (task.productName) {
          updates.readyForInventory = true;
          
          // Sprawdź czy zadanie ma materiały i czy nie ma potwierdzonego zużycia
          if (!task.materialConsumptionConfirmed && task.materials && task.materials.length > 0) {
            // Zmień status na "Potwierdzenie zużycia" zamiast "Zakończone"
            updates.status = 'Potwierdzenie zużycia';
            console.log(`Zadanie ${taskId} wymaga potwierdzenia zużycia, zmieniono status na "Potwierdzenie zużycia"`);
          } else {
            // Jeśli zadanie ma potwierdzenie zużycia materiałów lub nie ma materiałów,
            // oznaczamy je jako gotowe do dodania, ale nie dodajemy automatycznie
            console.log(`Zadanie ${taskId} oznaczono jako gotowe do dodania do magazynu`);
          }
        }
      }
      
      await updateDoc(taskRef, updates);
      
      return { success: true, message: `Status zadania zmieniony na ${updates.status}` };
    } catch (error) {
      console.error('Błąd podczas aktualizacji statusu zadania:', error);
      throw error;
    }
  };
  
  // Usuwanie zadania produkcyjnego
  export const deleteTask = async (taskId) => {
    try {
      // Pobierz zadanie, aby sprawdzić materiały
      const taskRef = doc(db, PRODUCTION_TASKS_COLLECTION, taskId);
      const taskSnapshot = await getDoc(taskRef);
      
      if (!taskSnapshot.exists()) {
        throw new Error('Zadanie nie istnieje');
      }
      
      const task = taskSnapshot.data();
      
      // Jeśli zadanie jest w stanie "Zaplanowane" i ma materiały, anuluj rezerwacje
      if (task.status === 'Zaplanowane' && task.materials && task.materials.length > 0) {
        for (const material of task.materials) {
          try {
            // Anuluj rezerwację materiału
            await cancelBooking(material.id, material.quantity, taskId, task.createdBy || 'system');
          } catch (error) {
            console.error(`Błąd przy anulowaniu rezerwacji materiału ${material.name}:`, error);
            // Kontynuuj anulowanie rezerwacji pozostałych materiałów mimo błędu
          }
        }
      }
      
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
      
      // Utwórz zapytanie - bez sortowania, aby uniknąć problemów z indeksem
      // Zapytanie tylko po statusie nie wymaga złożonego indeksu
      const q = query(
        tasksRef, 
        where('status', '==', status)
      );
      
      console.log(`Wykonuję zapytanie do kolekcji ${PRODUCTION_TASKS_COLLECTION} o zadania ze statusem "${status}"`);
      
      // Pobierz dane
      const querySnapshot = await getDocs(q);
      
      // Mapuj rezultaty
      let tasks = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Sortowanie po stronie klienta
      tasks = tasks.sort((a, b) => {
        const dateA = a.scheduledDate ? new Date(a.scheduledDate) : new Date(0);
        const dateB = b.scheduledDate ? new Date(b.scheduledDate) : new Date(0);
        return dateA - dateB;
      });
      
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
          
          // Zaktualizuj zadanie z informacją o znalezionym produkcie magazynowym
          await updateDoc(taskRef, {
            inventoryProductId: inventoryItemId,
            updatedAt: serverTimestamp(),
            updatedBy: userId
          });
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
          
          // Zaktualizuj zadanie z informacją o nowo utworzonym produkcie magazynowym
          await updateDoc(taskRef, {
            inventoryProductId: inventoryItemId,
            updatedAt: serverTimestamp(),
            updatedBy: userId
          });
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

  // Pobiera dane prognozy zapotrzebowania materiałów
  export const getForecastData = async (startDate, endDate, filteredTasks, inventoryItems) => {
    try {
      console.log('Rozpoczynam pobieranie danych prognozy zapotrzebowania');
      
      // Pobierz zadania i materiały, jeśli nie zostały przekazane
      let tasks = filteredTasks;
      let materials = inventoryItems;
      
      if (!tasks) {
        console.log('Brak przekazanych zadań, pobieram zaplanowane zadania');
        tasks = await getAllPlannedTasks();
        tasks = tasks.filter(task => {
          if (!task.scheduledDate) return false;
          
          // Konwersja ciągu znaków na obiekt Date, jeśli to konieczne
          const taskDate = typeof task.scheduledDate === 'string' 
            ? new Date(task.scheduledDate) 
            : task.scheduledDate instanceof Timestamp 
              ? task.scheduledDate.toDate()
              : task.scheduledDate;
              
          return taskDate >= startDate && taskDate <= endDate;
        });
      }
      
      if (!materials) {
        console.log('Brak przekazanych materiałów, pobieram wszystkie materiały z magazynu');
        materials = await getAllInventoryItems();
      }
      
      console.log(`Znaleziono ${tasks.length} zadań i ${materials ? materials.length : 0} materiałów`);
      
      // Sprawdzamy, czy mamy zadania do analizy
      if (!tasks || tasks.length === 0) {
        console.warn('Brak zadań do prognozy zapotrzebowania materiałów');
        return [];
      }
      
      // Oblicz potrzebne ilości materiałów na podstawie zadań produkcyjnych
      const materialRequirements = {};
      
      for (const task of tasks) {
        // Upewnij się, że zadanie ma materiały
        if (!task.materials || task.materials.length === 0) {
          console.log(`Zadanie ${task.id} (${task.name || 'bez nazwy'}) nie ma materiałów, pomijam`);
          continue;
        }
        
        console.log(`Analizuję zadanie ${task.id} (${task.name || 'bez nazwy'}), liczba materiałów: ${task.materials.length}`);
        
        for (const material of task.materials) {
          // Upewnij się, że materiał ma prawidłowe ID - akceptujemy zarówno id jak i inventoryItemId
          const materialId = material.id || material.inventoryItemId;
          
          if (!materialId) {
            console.warn('Materiał bez ID, pomijam', material);
            continue;
          }
          
          // Konwertuj quantity na liczbę i upewnij się, że jest poprawna
          let materialQuantity = parseFloat(material.quantity) || 0;
          let taskQuantity = parseFloat(task.quantity) || 1;
          
          if (materialQuantity <= 0) {
            console.warn(`Materiał ${material.name} ma nieprawidłową ilość: ${material.quantity}`);
            continue;
          }
          
          // Dodatkowa logika dla określenia rzeczywistej ilości materiału na jednostkę produktu
          const quantityPerUnit = material.perUnit || material.quantityPerUnit; 
          if (quantityPerUnit && quantityPerUnit > 0) {
            // Jeśli jest explicit określona ilość na jednostkę, użyj jej
            materialQuantity = quantityPerUnit;
          } else if (material.isFullTaskQuantity || material.isTotal) {
            // Jeśli jest oznaczone, że ilość jest dla całego zadania
            materialQuantity = materialQuantity / taskQuantity;
          } else if (materialQuantity > 20 && taskQuantity > 1) {
            // Heurystyka: jeśli ilość materiału jest znacznie większa niż 1 i mamy więcej niż 1 jednostkę produktu,
            // zakładamy, że jest to ilość dla całego zadania
            materialQuantity = materialQuantity / taskQuantity;
          }
          
          const requiredQuantity = materialQuantity * taskQuantity;
          
          // Dodaj lub zaktualizuj materiał w wymaganiach
          if (!materialRequirements[materialId]) {
            materialRequirements[materialId] = {
              id: materialId,
              name: material.name,
              category: material.category || 'Inne',
              unit: material.unit || 'szt.',
              requiredQuantity: 0,
              availableQuantity: 0,
              perUnit: materialQuantity // Zapamiętaj ilość na jednostkę produktu
            };
          }
          
          materialRequirements[materialId].requiredQuantity += requiredQuantity;
        }
      }
      
      // Uzupełnij dostępne ilości z magazynu
      for (const material of materials) {
        if (materialRequirements[material.id]) {
          materialRequirements[material.id].availableQuantity = parseFloat(material.quantity) || 0;
        }
      }
      
      // Przekształć obiekt do tablicy i upewnij się, że wartości są liczbowe
      const result = Object.values(materialRequirements).map(item => ({
        ...item,
        requiredQuantity: parseFloat(item.requiredQuantity.toFixed(2)) || 0,
        availableQuantity: parseFloat(item.availableQuantity) || 0
      }));
      
      // Sprawdź czy wynik nie jest pusty
      if (result.length === 0) {
        console.warn('Brak materiałów w prognozie zapotrzebowania');
      } else {
        console.log(`Znaleziono ${result.length} materiałów w prognozie zapotrzebowania`);
      }
      
      // Posortuj według zapotrzebowania (od największego)
      result.sort((a, b) => b.requiredQuantity - a.requiredQuantity);
      
      return result;
    } catch (error) {
      console.error('Błąd podczas pobierania danych prognozy:', error);
      throw error;
    }
  };

  // Generuje raport materiałowy do pobrania
  export const generateMaterialsReport = async (forecastData, startDate, endDate) => {
    try {
      console.log('Rozpoczynam generowanie raportu z danymi:', { forecastDataLength: forecastData?.length });
      
      // Sprawdź, czy dane prognozy są dostępne
      if (!forecastData || forecastData.length === 0) {
        // Zamiast rzucać wyjątek, próbujemy pobrać dane jeszcze raz
        console.log('Brak danych prognozy, próba ponownego pobrania danych...');
        const refreshedData = await getForecastData(startDate, endDate);
        
        if (!refreshedData || refreshedData.length === 0) {
          console.error('Nie udało się pobrać danych prognozy. Generuję pusty raport.');
          showEmptyReportAlert();
          return null;
        }
        
        forecastData = refreshedData;
      }

      // Konwertuj daty do czytelnego formatu
      const formattedStartDate = format(startDate, 'dd.MM.yyyy');
      const formattedEndDate = format(endDate, 'dd.MM.yyyy');

      console.log(`Generuję raport za okres ${formattedStartDate} - ${formattedEndDate}`);

      // Dla uproszczenia generujemy raport w formie CSV
      const headers = ["Materiał", "Kategoria", "Dostępna ilość", "Potrzebna ilość", "Bilans", "Jednostka"];
      let csvContent = headers.join(",") + "\n";
      
      // Dodaj dane materiałów
      forecastData.forEach(item => {
        // Sprawdź, czy wartości są liczbami i ustaw domyślne wartości, jeśli nie są
        const availableQuantity = isNaN(parseFloat(item.availableQuantity)) ? 0 : parseFloat(item.availableQuantity);
        const requiredQuantity = isNaN(parseFloat(item.requiredQuantity)) ? 0 : parseFloat(item.requiredQuantity);
        const balance = availableQuantity - requiredQuantity;
        
        const row = [
          `"${(item.name || 'Nieznany').replace(/"/g, '""')}"`, 
          `"${(item.category || 'Inne').replace(/"/g, '""')}"`,
          availableQuantity.toFixed(2),
          requiredQuantity.toFixed(2),
          balance.toFixed(2),
          `"${(item.unit || 'szt.').replace(/"/g, '""')}"`
        ];
        csvContent += row.join(",") + "\n";
      });
      
      console.log('Raport wygenerowany, tworzę blob');
      
      // Tworzymy blob z zawartością CSV
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const reportUrl = URL.createObjectURL(blob);
      
      console.log('Raport URL utworzony:', reportUrl);
      
      // Pobieramy plik używając standardowego mechanizmu
      const link = document.createElement('a');
      const filename = `Raport_zapotrzebowania_${formattedStartDate.replace(/\./g, '-')}_${formattedEndDate.replace(/\./g, '-')}.csv`;
      
      link.setAttribute('href', reportUrl);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      console.log('Pobieranie raportu zainicjowane');
      
      return reportUrl;
    } catch (error) {
      console.error('Błąd podczas generowania raportu materiałowego:', error);
      alert('Wystąpił błąd podczas generowania raportu. Spróbuj ponownie.');
      return null;
    }
  };
  
  // Pomocnicza funkcja do wyświetlania komunikatu o pustym raporcie
  const showEmptyReportAlert = () => {
    alert('Brak danych do wygenerowania raportu. Upewnij się, że istnieją zadania produkcyjne w wybranym okresie.');
  };

  // Pobiera tylko zaplanowane zadania produkcyjne
  export const getAllPlannedTasks = async () => {
    try {
      const tasksRef = collection(db, 'productionTasks');
      // Pobierz zadania zarówno zaplanowane jak i w trakcie realizacji
      const q = query(
        tasksRef, 
        where('status', 'in', ['Zaplanowane', 'W trakcie'])
      );
      const snapshot = await getDocs(q);
      
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (error) {
      console.error('Błąd podczas pobierania zaplanowanych zadań:', error);
      throw error;
    }
  };

  // Pobiera dane do raportów produkcyjnych
  export const getProductionReports = async (startDate, endDate) => {
    try {
      const tasksRef = collection(db, 'productionTasks');
      const snapshot = await getDocs(tasksRef);
      
      const tasks = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Filtruj zadania według daty
      return tasks.filter(task => {
        // Sprawdź daty rozpoczęcia lub zakończenia
        let taskDate = null;
        
        if (task.completionDate) {
          taskDate = new Date(task.completionDate);
        } else if (task.startDate) {
          taskDate = new Date(task.startDate);
        } else if (task.scheduledDate) {
          taskDate = new Date(task.scheduledDate);
        }
        
        if (!taskDate) return false;
        
        return taskDate >= startDate && taskDate <= endDate;
      });
    } catch (error) {
      console.error('Błąd podczas pobierania danych raportów:', error);
      throw error;
    }
  };

  // Pobiera statystyki dla ukończonych zadań
  export const getCompletedTasksStats = async (startDate, endDate) => {
    try {
      // Pobierz wszystkie zakończone zadania w danym okresie
      const tasksRef = collection(db, 'productionTasks');
      const q = query(tasksRef, where('status', '==', 'Zakończone'));
      const snapshot = await getDocs(q);
      
      const completedTasks = snapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        .filter(task => {
          if (!task.completionDate) return false;
          const completionDate = new Date(task.completionDate);
          return completionDate >= startDate && completionDate <= endDate;
        });
      
      if (completedTasks.length === 0) {
        return {
          completedTasks: 0,
          producedItems: 0,
          avgProductionTime: 0,
          materialsUsage: []
        };
      }
      
      // Obliczanie statystyk
      let totalItems = 0;
      let totalProductionTime = 0;
      const materialUsage = {};
      const productivityByCategory = {};
      const dailyOutput = {};
      
      for (const task of completedTasks) {
        // Zliczanie produktów
        totalItems += task.quantity || 0;
        
        // Czas produkcji
        if (task.startDate && task.completionDate) {
          const startDate = new Date(task.startDate);
          const endDate = new Date(task.completionDate);
          const productionTime = (endDate - startDate) / (1000 * 60 * 60); // w godzinach
          totalProductionTime += productionTime;
          
          // Zapisz czas produkcji w zadaniu
          task.productionTime = productionTime.toFixed(1);
        }
        
        // Produktywność według kategorii
        const category = task.category || 'Inne';
        if (!productivityByCategory[category]) {
          productivityByCategory[category] = 0;
        }
        productivityByCategory[category] += task.quantity || 0;
        
        // Dzienny wynik
        if (task.completionDate) {
          const dateStr = new Date(task.completionDate).toISOString().split('T')[0];
          if (!dailyOutput[dateStr]) {
            dailyOutput[dateStr] = 0;
          }
          dailyOutput[dateStr] += task.quantity || 0;
        }
        
        // Zużycie materiałów
        if (task.materials && task.materials.length > 0) {
          for (const material of task.materials) {
            const actualQuantity = task.actualMaterialUsage && task.actualMaterialUsage[material.id] 
              ? task.actualMaterialUsage[material.id] 
              : material.quantity * task.quantity;
            
            if (!materialUsage[material.id]) {
              materialUsage[material.id] = {
                id: material.id,
                name: material.name,
                category: material.category || 'Inne',
                unit: material.unit || 'szt.',
                usedQuantity: 0,
                usageCount: 0
              };
            }
            
            materialUsage[material.id].usedQuantity += actualQuantity;
            materialUsage[material.id].usageCount += 1;
          }
        }
      }
      
      // Przekształć materiały do formatu tablicy i oblicz średnie zużycie
      const materialsUsage = Object.values(materialUsage).map(material => {
        const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) || 1;
        material.avgDailyUsage = (material.usedQuantity / daysDiff).toFixed(2);
        return material;
      });
      
      // Posortuj materiały według zużycia
      materialsUsage.sort((a, b) => b.usedQuantity - a.usedQuantity);
      
      return {
        completedTasks: completedTasks.length,
        producedItems: totalItems,
        avgProductionTime: completedTasks.length ? (totalProductionTime / completedTasks.length).toFixed(1) : 0,
        productivityByCategory,
        dailyOutput,
        materialsUsage
      };
    } catch (error) {
      console.error('Błąd podczas pobierania statystyk zadań:', error);
      throw error;
    }
  };

  // Generuje raport produkcyjny do pobrania
  export const generateProductionReport = async (startDate, endDate, reportType = 'summary') => {
    try {
      // Tutaj można by zaimplementować generowanie PDF lub CSV
      // Dla uproszczenia, zwracamy przykładowy URL do pliku
      console.log(`Generowanie raportu produkcyjnego typu ${reportType}:`, {
        startDate,
        endDate
      });
      
      return "#"; // Symulacja URL do pobrania raportu
    } catch (error) {
      console.error('Błąd podczas generowania raportu produkcyjnego:', error);
      throw error;
    }
  };

  // Aktualizuje faktyczne zużycie materiałów po zakończeniu produkcji
  export const updateActualMaterialUsage = async (taskId, materialUsage) => {
    try {
      const taskRef = doc(db, 'productionTasks', taskId);
      const taskSnapshot = await getDoc(taskRef);
      
      if (!taskSnapshot.exists()) {
        throw new Error('Zadanie nie istnieje');
      }
      
      const task = {
        id: taskSnapshot.id,
        ...taskSnapshot.data()
      };
      
      // Aktualizacja tylko faktycznego zużycia
      await updateDoc(taskRef, {
        actualMaterialUsage: materialUsage,
        materialConsumptionConfirmed: false // Resetuje potwierdzenie zużycia
      });
      
      return { success: true, message: 'Zużycie materiałów zaktualizowane' };
    } catch (error) {
      console.error('Błąd podczas aktualizacji zużycia materiałów:', error);
      throw error;
    }
  };

  // Potwierdza zużycie materiałów i aktualizuje stany magazynowe
  export const confirmMaterialConsumption = async (taskId) => {
    try {
      const taskRef = doc(db, PRODUCTION_TASKS_COLLECTION, taskId);
      const taskSnapshot = await getDoc(taskRef);
      
      if (!taskSnapshot.exists()) {
        throw new Error('Zadanie nie istnieje');
      }
      
      const task = {
        id: taskSnapshot.id,
        ...taskSnapshot.data()
      };
      
      if (task.materialConsumptionConfirmed) {
        throw new Error('Zużycie materiałów zostało już potwierdzone');
      }
      
      // Pobierz materiały
      const materials = task.materials || [];
      const actualUsage = task.actualMaterialUsage || {};
      
      // Dla każdego materiału, zaktualizuj stan magazynowy
      for (const material of materials) {
        const materialId = material.id;
        let consumedQuantity = actualUsage[materialId] !== undefined 
          ? actualUsage[materialId] 
          : material.quantity;
        
        // Sprawdź, czy consumedQuantity jest dodatnią liczbą
        if (isNaN(consumedQuantity) || consumedQuantity < 0) {
          throw new Error(`Zużycie materiału "${material.name}" jest nieprawidłowe (${consumedQuantity}). Musi być liczbą większą lub równą 0.`);
        }
        
        // Pobierz aktualny stan magazynowy
        const inventoryRef = doc(db, 'inventory', materialId);
        const inventorySnapshot = await getDoc(inventoryRef);
        
        if (inventorySnapshot.exists()) {
          const inventoryItem = {
            id: inventorySnapshot.id,
            ...inventorySnapshot.data()
          };
          
          // 1. Najpierw pobierz i sprawdź przypisane loty/partie do tego materiału w zadaniu
          let assignedBatches = [];
          
          // Sprawdź, czy zadanie ma przypisane konkretne partie dla tego materiału
          if (task.materialBatches && task.materialBatches[materialId]) {
            assignedBatches = task.materialBatches[materialId];
          } else {
            // Jeśli nie ma przypisanych partii, pobierz dostępne partie według FEFO
            const batchesRef = collection(db, 'inventoryBatches');
            const q = query(
              batchesRef, 
              where('itemId', '==', materialId),
              where('quantity', '>', 0)
            );
            
            const batchesSnapshot = await getDocs(q);
            const availableBatches = batchesSnapshot.docs
              .map(doc => ({
                id: doc.id,
                ...doc.data()
              }))
              .sort((a, b) => {
                const dateA = a.expiryDate ? new Date(a.expiryDate) : new Date(9999, 11, 31);
                const dateB = b.expiryDate ? new Date(b.expiryDate) : new Date(9999, 11, 31);
                return dateA - dateB;
              });
            
            // Przypisz partie automatycznie według FEFO
            let remainingQuantity = consumedQuantity;
            
            for (const batch of availableBatches) {
              if (remainingQuantity <= 0) break;
              
              const quantityFromBatch = Math.min(batch.quantity, remainingQuantity);
              remainingQuantity -= quantityFromBatch;
              
              assignedBatches.push({
                batchId: batch.id,
                quantity: quantityFromBatch,
                batchNumber: batch.batchNumber || batch.lotNumber || 'Bez numeru'
              });
            }
            
            // Jeśli nie udało się przypisać wszystkich wymaganych ilości
            if (remainingQuantity > 0) {
              throw new Error(`Nie można znaleźć wystarczającej ilości partii dla materiału "${material.name}"`);
            }
          }
          
          // 2. Odejmij ilości z przypisanych partii
          for (const batchAssignment of assignedBatches) {
            const batchRef = doc(db, 'inventoryBatches', batchAssignment.batchId);
            await updateDoc(batchRef, {
              quantity: increment(-batchAssignment.quantity),
              updatedAt: serverTimestamp()
            });
            
            // Dodaj transakcję dla każdej wykorzystanej partii
            const transactionRef = doc(collection(db, 'inventoryTransactions'));
            await setDoc(transactionRef, {
              itemId: materialId,
              itemName: material.name,
              type: 'issue',
              quantity: batchAssignment.quantity,
              date: serverTimestamp(),
              reason: 'Zużycie w produkcji',
              reference: `Zadanie: ${task.name || taskId}`,
              batchId: batchAssignment.batchId,
              batchNumber: batchAssignment.batchNumber,
              notes: `Materiał zużyty w zadaniu produkcyjnym: ${task.name || taskId}`,
              createdAt: serverTimestamp()
            });
          }
          
          // 3. Aktualizuj ogólny stan magazynowy
          await updateDoc(inventoryRef, {
            quantity: increment(-consumedQuantity),
            lastUpdated: new Date().toISOString()
          });
          
          // 4. Zapisz informacje o wykorzystanych partiach w zadaniu
          if (!task.usedBatches) task.usedBatches = {};
          task.usedBatches[materialId] = assignedBatches;
          
          // 5. Anuluj rezerwację materiału, ponieważ został już zużyty
          try {
            // Sprawdź, czy przedmiot ma zarezerwowaną ilość
            if (inventoryItem.bookedQuantity && inventoryItem.bookedQuantity > 0) {
              const bookingQuantity = material.quantity || 0;
              
              // Anuluj rezerwację tylko jeśli jakąś ilość zarezerwowano
              if (bookingQuantity > 0) {
                await cancelBooking(materialId, bookingQuantity, taskId, task.createdBy || 'system');
                console.log(`Anulowano rezerwację ${bookingQuantity} ${inventoryItem.unit} materiału ${material.name} po zatwierdzeniu zużycia`);
              }
            }
          } catch (error) {
            console.error(`Błąd przy anulowaniu rezerwacji materiału ${material.name}:`, error);
            // Kontynuuj mimo błędu anulowania rezerwacji
          }
        }
      }
      
      // Oznacz zużycie jako potwierdzone i zapisz informacje o wykorzystanych partiach
      const updates = {
        materialConsumptionConfirmed: true,
        materialConsumptionDate: new Date().toISOString(),
        usedBatches: task.usedBatches || {}
      };
      
      // Jeśli zadanie miało status "Potwierdzenie zużycia", zmień na "Zakończone"
      if (task.status === 'Potwierdzenie zużycia') {
        updates.status = 'Zakończone';
        console.log(`Zadanie ${taskId} zmieniło status z "Potwierdzenie zużycia" na "Zakończone"`);
      }
      
      await updateDoc(taskRef, updates);
      
      // Jeśli zadanie ma produkt i jest gotowe do dodania do magazynu, nie dodajemy automatycznie
      // Użytkownik musi sam kliknąć przycisk "Dodaj produkt do magazynu"
      if (task.productName) {
        // Upewniamy się, że zadanie jest oznaczone jako gotowe do dodania do magazynu
        await updateDoc(taskRef, {
          readyForInventory: true
        });
      }
      
      return { success: true, message: 'Zużycie materiałów potwierdzone i stany magazynowe zaktualizowane' };
    } catch (error) {
      console.error('Błąd podczas potwierdzania zużycia materiałów:', error);
      throw error;
    }
  };

  // Zarezerwowanie składników dla zadania
  export const reserveMaterialsForTask = async (taskId, materials, reservationMethod = 'auto') => {
    try {
      console.log(`Bookowanie składników dla zadania ID: ${taskId}, metoda: ${reservationMethod}`);
      console.log('Materiały do zarezerwowania:', materials);
      
      if (!materials || materials.length === 0) {
        return { success: true, message: 'Brak materiałów do zarezerwowania' };
      }
      
      // Pobierz dane zadania, aby mieć dostęp do numeru MO
      const taskRef = doc(db, PRODUCTION_TASKS_COLLECTION, taskId);
      const taskDoc = await getDoc(taskRef);
      
      if (!taskDoc.exists()) {
        throw new Error(`Zadanie o ID ${taskId} nie istnieje`);
      }
      
      const taskData = taskDoc.data();
      const userId = getCurrentUserId();
      
      const errors = [];
      const reservedItems = [];
      
      // Dla każdego materiału w zadaniu
      for (const material of materials) {
        if (!material.inventoryItemId) {
          // Jeśli materiał nie ma przypisanego ID pozycji magazynowej, pomijamy go
          console.log(`Materiał ${material.name} nie ma przypisanego ID pozycji magazynowej, pomijamy`);
          continue;
        }
        
        try {
          // Sprawdź, czy pozycja magazynowa istnieje
          await getInventoryItemById(material.inventoryItemId);
          
          // Zarezerwuj materiał w magazynie
          const result = await bookInventoryForTask(
            material.inventoryItemId, 
            material.quantity, 
            taskId, 
            userId, 
            reservationMethod
          );
          
          reservedItems.push({
            itemId: material.inventoryItemId,
            name: material.name,
            quantity: material.quantity,
            unit: material.unit
          });
        } catch (error) {
          console.error(`Błąd podczas rezerwacji materiału ${material.name}:`, error);
          errors.push(`Nie można zarezerwować materiału ${material.name}: ${error.message}`);
        }
      }
      
      // Zwróć informację o wyniku operacji
      if (errors.length === 0) {
        return {
          success: true,
          message: `Zarezerwowano wszystkie ${reservedItems.length} materiały dla zadania`,
          reservedItems
        };
      } else {
        return {
          success: false,
          message: `Zarezerwowano częściowo materiały dla zadania (${reservedItems.length} z ${materials.length})`,
          reservedItems,
          errors
        };
      }
    } catch (error) {
      console.error('Błąd podczas rezerwacji materiałów:', error);
      throw error;
    }
  };

  // Pomocnicza funkcja do pobierania aktualnego ID użytkownika
  const getCurrentUserId = () => {
    // W prawdziwej aplikacji należałoby pobrać ID z kontekstu Auth
    // Na potrzeby tego kodu zwracamy stałą wartość
    return 'system';
  };

  // Rozpoczęcie produkcji
  export const startProduction = async (taskId, userId) => {
    const taskRef = doc(db, PRODUCTION_TASKS_COLLECTION, taskId);
    
    await updateDoc(taskRef, {
      status: 'W trakcie',
      startDate: serverTimestamp(),
      productionSessions: [],
      updatedAt: serverTimestamp(),
      updatedBy: userId
    });
  };

  // Zatrzymanie produkcji
  export const stopProduction = async (taskId, completedQuantity, timeSpent, userId) => {
    const taskRef = doc(db, PRODUCTION_TASKS_COLLECTION, taskId);
    const taskDoc = await getDoc(taskRef);
    const task = taskDoc.data();
    
    // Pobierz aktualną sesję produkcyjną
    const productionSessions = task.productionSessions || [];
    
    // Dodaj nową sesję używając zwykłej daty
    const newSession = {
      startDate: task.startDate,
      endDate: new Date().toISOString(),
      completedQuantity,
      timeSpent, // w minutach
      createdBy: userId
    };
    
    productionSessions.push(newSession);
    
    // Oblicz całkowitą wyprodukowaną ilość
    const totalCompletedQuantity = productionSessions.reduce((sum, session) => sum + session.completedQuantity, 0);
    
    // Sprawdź czy zadanie zostało ukończone
    const isCompleted = totalCompletedQuantity >= task.quantity;
    
    const updates = {
      status: isCompleted ? 'Zakończone' : 'Wstrzymane',
      productionSessions,
      totalCompletedQuantity,
      lastSessionEndDate: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: userId
    };

    // Jeśli zadanie jest zakończone, dodaj dodatkowe pola
    if (isCompleted) {
      updates.completionDate = serverTimestamp();
      updates.readyForInventory = true; // Oznaczamy jako gotowe do dodania do magazynu, ale nie dodajemy automatycznie
      
      // Jeśli zadanie jest zakończone, anuluj rezerwacje materiałów
      if (task.materials && task.materials.length > 0) {
        for (const material of task.materials) {
          try {
            // Pobierz ID materiału (może być przechowywany jako id lub inventoryItemId)
            const materialId = material.id || material.inventoryItemId;
            
            if (!materialId) {
              console.warn(`Materiał ${material.name} nie ma poprawnego ID, pomijam anulowanie rezerwacji`);
              continue;
            }
            
            // Anuluj rezerwację materiału
            await cancelBooking(materialId, material.quantity, taskId, userId);
            console.log(`Anulowano rezerwację ${material.quantity} ${material.unit || 'szt.'} materiału ${material.name} po zakończeniu zadania`);
          } catch (error) {
            console.error(`Błąd przy anulowaniu rezerwacji materiału ${material.name}:`, error);
            // Kontynuuj anulowanie rezerwacji pozostałych materiałów mimo błędu
          }
        }
      }
    }
    
    await updateDoc(taskRef, updates);
    
    return {
      isCompleted,
      totalCompletedQuantity
    };
  };

  // Pobieranie historii produkcji dla zadania
  export const getProductionHistory = async (taskId) => {
    const taskRef = doc(db, PRODUCTION_TASKS_COLLECTION, taskId);
    const taskDoc = await getDoc(taskRef);
    
    if (!taskDoc.exists()) {
      throw new Error('Zadanie nie istnieje');
    }
    
    const task = taskDoc.data();
    return task.productionSessions || [];
  };