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
    increment,
    arrayUnion,
    limit,
    onSnapshot,
    writeBatch
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
    getItemBatches,
    recalculateItemQuantity,
    getInventoryBatch
  } from './inventoryService';
  
  const PRODUCTION_TASKS_COLLECTION = 'productionTasks';
  
  // Cache dla danych zadań produkcyjnych
  const tasksCache = {
    byStatus: {}, // Dane cache'owane według statusu
    timestamp: {}, // Znaczniki czasu dla każdego statusu
    fetchInProgress: {}, // Flagi zapobiegające równoległym zapytaniom o te same dane
    ttl: 60000 // Czas życia cache w ms (60 sekund)
  };
  
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
  
  /**
   * Pobiera zadania produkcyjne z paginacją
   * @param {number} page - Numer strony (numeracja od 1)
   * @param {number} limit - Liczba elementów na stronę
   * @param {string} sortField - Pole, po którym sortujemy (domyślnie 'scheduledDate')
   * @param {string} sortOrder - Kierunek sortowania (asc/desc) (domyślnie 'asc')
   * @param {Object} filters - Opcjonalne filtry (status, nazwa, itd.)
   * @returns {Object} - Obiekt zawierający dane i informacje o paginacji
   */
  export const getTasksWithPagination = async (page = 1, limit = 10, sortField = 'scheduledDate', sortOrder = 'asc', filters = {}) => {
    try {
      // Pobierz całkowitą liczbę zadań (przed filtrowaniem)
      let countQuery = collection(db, PRODUCTION_TASKS_COLLECTION);
      
      // Dodaj filtry do zapytania liczącego
      if (filters.status) {
        countQuery = query(
          countQuery,
          where('status', '==', filters.status)
        );
      } else if (filters.statuses && Array.isArray(filters.statuses) && filters.statuses.length > 0) {
        countQuery = query(
          countQuery,
          where('status', 'in', filters.statuses)
        );
      }
      
      if (filters.workstationId) {
        countQuery = query(
          countQuery,
          where('workstationId', '==', filters.workstationId)
        );
      }
      
      const countSnapshot = await getDocs(countQuery);
      const totalCount = countSnapshot.size;
      
      // Ustaw realne wartości dla page i limit
      const pageNum = Math.max(1, page);
      const itemsPerPage = Math.max(1, limit);
      
      // Oblicz liczbę stron
      const totalPages = Math.ceil(totalCount / itemsPerPage);
      
      // Jeśli żądana strona jest większa niż liczba stron, ustaw na ostatnią stronę
      const safePageNum = Math.min(pageNum, Math.max(1, totalPages));
      
      // Funkcja do numerycznego sortowania numerów MO
      const sortByMoNumber = (docs, sortOrder) => {
        return docs.sort((a, b) => {
          const dataA = a.data();
          const dataB = b.data();
          
          const moA = dataA.moNumber || '';
          const moB = dataB.moNumber || '';
          
          // Ekstraktuj część numeryczną z numerów MO (np. MO00001 -> 1)
          const getNumericPart = (moNumber) => {
            const match = moNumber.match(/MO(\d+)/);
            return match ? parseInt(match[1], 10) : 0;
          };
          
          const numA = getNumericPart(moA);
          const numB = getNumericPart(moB);
          
          if (sortOrder === 'asc') {
            return numA - numB;
          } else {
            return numB - numA;
          }
        });
      };
      
      // Przygotuj zapytanie - jeśli sortowanie jest po moNumber, nie używamy orderBy Firebase
      let q;
      const isCustomSort = sortField === 'moNumber';
      
      if (!isCustomSort) {
        q = query(
          collection(db, PRODUCTION_TASKS_COLLECTION),
          orderBy(sortField, sortOrder)
        );
      } else {
        // Dla sortowania po moNumber pobierz wszystkie dokumenty bez sortowania
        q = collection(db, PRODUCTION_TASKS_COLLECTION);
      }
      
      // Dodaj filtry do głównego zapytania
      if (filters.status) {
        if (!isCustomSort) {
          q = query(
            collection(db, PRODUCTION_TASKS_COLLECTION),
            where('status', '==', filters.status),
            orderBy(sortField, sortOrder)
          );
        } else {
          q = query(
            collection(db, PRODUCTION_TASKS_COLLECTION),
            where('status', '==', filters.status)
          );
        }
      } else if (filters.statuses && Array.isArray(filters.statuses) && filters.statuses.length > 0) {
        if (!isCustomSort) {
          q = query(
            collection(db, PRODUCTION_TASKS_COLLECTION),
            where('status', 'in', filters.statuses),
            orderBy(sortField, sortOrder)
          );
        } else {
          q = query(
            collection(db, PRODUCTION_TASKS_COLLECTION),
            where('status', 'in', filters.statuses)
          );
        }
      }
      
      if (filters.workstationId) {
        if (!isCustomSort) {
          q = query(
            collection(db, PRODUCTION_TASKS_COLLECTION),
            where('workstationId', '==', filters.workstationId),
            orderBy(sortField, sortOrder)
          );
        } else {
          q = query(
            collection(db, PRODUCTION_TASKS_COLLECTION),
            where('workstationId', '==', filters.workstationId)
          );
        }
      }
      
      // Pobierz wszystkie dokumenty
      const querySnapshot = await getDocs(q);
      let allDocs = querySnapshot.docs;
      
      // Zastosuj sortowanie po numerach MO jeśli potrzebne
      if (isCustomSort) {
        allDocs = sortByMoNumber(allDocs, sortOrder);
      }
      
      // Filtruj wyniki na serwerze jeśli podano searchTerm
      let filteredDocs = allDocs;
      if (filters.searchTerm && filters.searchTerm.trim() !== '') {
        const searchTermLower = filters.searchTerm.toLowerCase().trim();
        filteredDocs = allDocs.filter(doc => {
          const data = doc.data();
          return (
            (data.name && data.name.toLowerCase().includes(searchTermLower)) ||
            (data.description && data.description.toLowerCase().includes(searchTermLower)) ||
            (data.productName && data.productName.toLowerCase().includes(searchTermLower)) ||
            (data.moNumber && data.moNumber.toLowerCase().includes(searchTermLower)) ||
            (data.clientName && data.clientName.toLowerCase().includes(searchTermLower))
          );
        });
        
        // Aktualizujemy liczby po filtrowaniu
        const filteredTotalCount = filteredDocs.length;
        const filteredTotalPages = Math.ceil(filteredTotalCount / itemsPerPage);
        const filteredSafePageNum = Math.min(pageNum, Math.max(1, filteredTotalPages));
        
        // Ręczna paginacja po filtrowaniu
        const startIndex = (filteredSafePageNum - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, filteredDocs.length);
        const paginatedDocs = filteredDocs.slice(startIndex, endIndex);
        
        // Mapujemy dokumenty na obiekty
        const tasks = paginatedDocs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // Zwróć dane wraz z informacjami o paginacji
        return {
          data: tasks,
          pagination: {
            page: filteredSafePageNum,
            limit: itemsPerPage,
            totalItems: filteredTotalCount,
            totalPages: filteredTotalPages
          }
        };
      }
      
      // Standardowa paginacja bez wyszukiwania
      const startIndex = (safePageNum - 1) * itemsPerPage;
      const endIndex = Math.min(startIndex + itemsPerPage, allDocs.length);
      const paginatedDocs = allDocs.slice(startIndex, endIndex);
      
      // Mapujemy dokumenty na obiekty
      const tasks = paginatedDocs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Zwróć dane wraz z informacjami o paginacji
      return {
        data: tasks,
        pagination: {
          page: safePageNum,
          limit: itemsPerPage,
          totalItems: totalCount,
          totalPages: totalPages
        }
      };
    } catch (error) {
      console.error('Błąd podczas pobierania zadań produkcyjnych z paginacją:', error);
      throw error;
    }
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
  
  // Pobieranie zadań produkcyjnych na dany okres z filtrowaniem po stronie serwera
  export const getTasksByDateRangeOptimized = async (startDate, endDate, statuses = ['Zaplanowane', 'W trakcie', 'Wstrzymane']) => {
    try {
      const tasksRef = collection(db, PRODUCTION_TASKS_COLLECTION);
      
      // Konwersja dat na Timestamp dla Firestore
      const startTimestamp = Timestamp.fromDate(new Date(startDate));
      const endTimestamp = Timestamp.fromDate(new Date(endDate));
      
      console.log('Pobieranie zadań z serwera dla okresu:', startDate, '-', endDate);
      
      // Przygotuj zapytanie z filtrowaniem po stronie serwera
      let q;
      
      if (statuses.length === 1) {
        // Optymalne zapytanie dla jednego statusu
        q = query(
          tasksRef,
          where('status', '==', statuses[0]),
          where('scheduledDate', '>=', startTimestamp),
          where('scheduledDate', '<=', endTimestamp),
          orderBy('scheduledDate', 'asc')
        );
      } else {
        // Dla wielu statusów - nie można użyć 'in' z range query na innym polu
        // Będziemy musieli pobrać według dat i przefiltrować statusy po stronie klienta
        q = query(
          tasksRef,
          where('scheduledDate', '>=', startTimestamp),
          where('scheduledDate', '<=', endTimestamp),
          orderBy('scheduledDate', 'asc')
        );
      }
      
      const querySnapshot = await getDocs(q);
      let tasks = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Filtruj po statusach po stronie klienta (tylko jeśli mamy więcej niż jeden status)
      if (statuses.length > 1) {
        tasks = tasks.filter(task => statuses.includes(task.status));
      }
      
      // Specjalne traktowanie dla zadań "Wstrzymane" - pobierz je zawsze, niezależnie od daty
      if (statuses.includes('Wstrzymane')) {
        const pausedTasksQuery = query(
          tasksRef,
          where('status', '==', 'Wstrzymane')
        );
        
        const pausedSnapshot = await getDocs(pausedTasksQuery);
        const pausedTasks = pausedSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        // Dodaj zadania wstrzymane, które nie są już w głównej liście
        const existingTaskIds = new Set(tasks.map(t => t.id));
        const additionalPausedTasks = pausedTasks.filter(task => !existingTaskIds.has(task.id));
        
        tasks = [...tasks, ...additionalPausedTasks];
      }
      
      console.log(`Pobrano ${tasks.length} zadań z serwera`);
      
      return tasks;
    } catch (error) {
      console.error('Błąd podczas pobierania zadań z optymalizacją:', error);
      
      // Fallback - użyj starszej metody
      console.log('Fallback do starszej metody pobierania zadań');
      return await getTasksByDateRange(startDate, endDate);
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
  export const createTask = async (taskData, userId, autoReserveMaterials = true) => {
    try {
      console.log(`[DEBUG-MO] Rozpoczęto tworzenie zadania produkcyjnego:`, JSON.stringify({
        productName: taskData.productName,
        orderItemId: taskData.orderItemId,
        orderId: taskData.orderId,
        orderNumber: taskData.orderNumber,
      }, null, 2));
      
      // Wygeneruj numer MO
      const moNumber = await generateMONumber();
      console.log(`[DEBUG-MO] Wygenerowano numer MO: ${moNumber}`);
      
      // Przygotuj dane zadania z metadanymi
      const taskWithMeta = {
        ...taskData,
        moNumber, // Dodaj numer MO
        createdBy: userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        autoReserveMaterials, // Zapisz informację o tym, czy materiały zostały automatycznie zarezerwowane
        totalMaterialCost: 0, // Inicjalizacja kosztu całkowitego materiałów (tylko wliczane do kosztów)
        unitMaterialCost: 0, // Inicjalizacja kosztu jednostkowego materiałów (tylko wliczane do kosztów)
        totalFullProductionCost: 0, // Inicjalizacja pełnego kosztu produkcji (wszystkie materiały niezależnie od flagi "wliczaj")
        unitFullProductionCost: 0, // Inicjalizacja jednostkowego pełnego kosztu produkcji
        costLastUpdatedAt: serverTimestamp(), // Data inicjalizacji kosztów
        costLastUpdatedBy: userId, // Użytkownik inicjalizujący koszty
        orderItemId: taskData.orderItemId || null, // Dodaj identyfikator pozycji zamówienia, jeśli dostępne
        costHistory: [{
          timestamp: new Date().toISOString(), // Używamy ISO string zamiast serverTimestamp()
          userId: userId,
          userName: 'System',
          previousTotalCost: 0,
          newTotalCost: 0,
          previousUnitCost: 0,
          newUnitCost: 0,
          reason: 'Inicjalizacja kosztów przy tworzeniu zadania'
        }]
      };
      
      console.log(`[DEBUG-MO] Dane powiązane z zamówieniem w taskWithMeta:`, JSON.stringify({
        orderItemId: taskWithMeta.orderItemId,
        orderId: taskWithMeta.orderId,
        orderNumber: taskWithMeta.orderNumber
      }, null, 2));
      
      // Jeśli nie podano daty zakończenia, ustaw ją na 1 godzinę po dacie rozpoczęcia
      if (!taskWithMeta.endDate && taskWithMeta.scheduledDate) {
        const scheduledDate = taskWithMeta.scheduledDate instanceof Date 
          ? taskWithMeta.scheduledDate 
          : new Date(taskWithMeta.scheduledDate);
        
        const endDate = new Date(scheduledDate.getTime() + 60 * 60 * 1000); // +1 godzina
        taskWithMeta.endDate = endDate;
      }
      
      // Jeśli określono numer LOT, użyj go, w przeciwnym razie wygeneruj domyślny numer LOT na podstawie MO
      if (!taskWithMeta.lotNumber) {
        taskWithMeta.lotNumber = `LOT-${moNumber}`;
      }
      
      // Jeśli nie określono daty ważności, ustaw domyślnie na rok od teraz
      if (!taskWithMeta.expiryDate) {
        const defaultExpiryDate = new Date();
        defaultExpiryDate.setFullYear(defaultExpiryDate.getFullYear() + 1);
        taskWithMeta.expiryDate = defaultExpiryDate;
      }
      
      // Zapisz zadanie w bazie danych
      console.log(`[DEBUG-MO] Tworzenie zadania z numerem MO: ${moNumber}`, 
        taskWithMeta.orderId ? `powiązanego z zamówieniem: ${taskWithMeta.orderNumber || taskWithMeta.orderId}` : 'bez powiązania z zamówieniem');
      const docRef = await addDoc(collection(db, PRODUCTION_TASKS_COLLECTION), taskWithMeta);
      console.log(`[DEBUG-MO] Utworzono zadanie z ID: ${docRef.id}`);
      
      // Jeśli zadanie jest powiązane z zamówieniem, dodaj je do listy zadań w zamówieniu
      if (taskWithMeta.orderId) {
        try {
          console.log(`[DEBUG-MO] Próba dodania zadania ${docRef.id} do zamówienia ${taskWithMeta.orderId} z orderItemId: ${taskWithMeta.orderItemId}`);
          const { addProductionTaskToOrder } = await import('./orderService');
          await addProductionTaskToOrder(taskWithMeta.orderId, {
            id: docRef.id,
            moNumber,
            name: taskWithMeta.name,
            status: taskWithMeta.status,
            productName: taskWithMeta.productName,
            quantity: taskWithMeta.quantity,
            unit: taskWithMeta.unit
          }, taskWithMeta.orderItemId);
          console.log(`[DEBUG-MO] Pomyślnie dodano zadanie ${docRef.id} do zamówienia ${taskWithMeta.orderId}`);
        } catch (error) {
          console.error(`[ERROR-MO] Błąd podczas dodawania zadania do zamówienia:`, error);
          // Nie przerywamy głównej operacji, jeśli dodawanie do zamówienia się nie powiedzie
        }
      } else {
        console.log(`[DEBUG-MO] Zadanie ${docRef.id} nie jest powiązane z zamówieniem - brak orderId`);
      }
      
      // Teraz, gdy zadanie zostało utworzone, zarezerwuj materiały
      const missingMaterials = [];
      
      // Rezerwuj materiały tylko jeśli autoReserveMaterials jest true
      if (autoReserveMaterials && taskWithMeta.materials && taskWithMeta.materials.length > 0) {
        console.log(`Automatyczne rezerwowanie materiałów dla MO: ${moNumber}`);
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
      } else if (!autoReserveMaterials) {
        console.log(`Pominięto automatyczną rezerwację materiałów dla MO: ${moNumber} zgodnie z wyborem użytkownika`);
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
    try {
      // Pobierz aktualne dane zadania, aby zachować pola kosztów jeśli nie są aktualizowane
      const taskRef = doc(db, PRODUCTION_TASKS_COLLECTION, taskId);
      const taskDoc = await getDoc(taskRef);
      
      if (!taskDoc.exists()) {
        throw new Error('Zadanie nie istnieje');
      }
      
      const currentTask = taskDoc.data();
      
      // Upewnij się, że endDate jest ustawiona
      if (!taskData.endDate) {
        // Jeśli nie ma endDate, ustaw na 1 godzinę po scheduledDate
        const scheduledDate = taskData.scheduledDate instanceof Date 
          ? taskData.scheduledDate 
          : new Date(taskData.scheduledDate);
        
        taskData.endDate = new Date(scheduledDate.getTime() + 60 * 60 * 1000);
      }
      
      // Zachowaj pola kosztów, jeśli nie są aktualizowane
      if (taskData.totalMaterialCost === undefined && currentTask.totalMaterialCost !== undefined) {
        taskData.totalMaterialCost = currentTask.totalMaterialCost;
      }
      
      if (taskData.unitMaterialCost === undefined && currentTask.unitMaterialCost !== undefined) {
        taskData.unitMaterialCost = currentTask.unitMaterialCost;
      }
      
      if (taskData.totalFullProductionCost === undefined && currentTask.totalFullProductionCost !== undefined) {
        taskData.totalFullProductionCost = currentTask.totalFullProductionCost;
      }
      
      if (taskData.unitFullProductionCost === undefined && currentTask.unitFullProductionCost !== undefined) {
        taskData.unitFullProductionCost = currentTask.unitFullProductionCost;
      }
      
      if (taskData.costLastUpdatedAt === undefined && currentTask.costLastUpdatedAt !== undefined) {
        taskData.costLastUpdatedAt = currentTask.costLastUpdatedAt;
      }
      
      if (taskData.costLastUpdatedBy === undefined && currentTask.costLastUpdatedBy !== undefined) {
        taskData.costLastUpdatedBy = currentTask.costLastUpdatedBy;
      }
      
      if (taskData.costHistory === undefined && currentTask.costHistory !== undefined) {
        taskData.costHistory = currentTask.costHistory;
      }
      
      // Jeśli pola kosztów nadal nie istnieją, zainicjuj je wartościami domyślnymi
      if (taskData.totalMaterialCost === undefined) {
        taskData.totalMaterialCost = 0;
      }
      
      if (taskData.unitMaterialCost === undefined) {
        taskData.unitMaterialCost = 0;
      }
      
      if (taskData.totalFullProductionCost === undefined) {
        taskData.totalFullProductionCost = 0;
      }
      
      if (taskData.unitFullProductionCost === undefined) {
        taskData.unitFullProductionCost = 0;
      }
      
      if (taskData.costLastUpdatedAt === undefined) {
        taskData.costLastUpdatedAt = serverTimestamp();
      }
      
      if (taskData.costLastUpdatedBy === undefined) {
        taskData.costLastUpdatedBy = userId;
      }
      
      if (taskData.costHistory === undefined) {
        taskData.costHistory = [{
          timestamp: new Date().toISOString(), // Używamy ISO string zamiast serverTimestamp()
          userId: userId,
          userName: 'System',
          previousTotalCost: 0,
          newTotalCost: 0,
          previousUnitCost: 0,
          newUnitCost: 0,
          reason: 'Inicjalizacja kosztów podczas aktualizacji zadania'
        }];
      }
      
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
    } catch (error) {
      console.error('Błąd podczas aktualizacji zadania:', error);
      throw error;
    }
  };
  
  // Aktualizacja statusu zadania
  export const updateTaskStatus = async (taskId, newStatus, userId) => {
    try {
      // Sprawdź, czy zadanie istnieje
      const taskRef = doc(db, PRODUCTION_TASKS_COLLECTION, taskId);
      const taskDoc = await getDoc(taskRef);
      
      if (!taskDoc.exists()) {
        throw new Error('Zadanie nie istnieje');
      }
      
      const task = taskDoc.data();
      const oldStatus = task.status;
      
      // Jeśli status się nie zmienił, nie rób nic
      if (oldStatus === newStatus) {
        return { success: true, message: `Status zadania jest już ustawiony na ${oldStatus}` };
      }
      
      // Przygotuj aktualizację
      const updates = {
        status: newStatus,
        updatedAt: serverTimestamp(),
        updatedBy: userId,
        statusHistory: [
          ...(task.statusHistory || []),
          {
            oldStatus: oldStatus || 'Nowe',
            newStatus: newStatus,
            changedBy: userId,
            changedAt: new Date().toISOString()
          }
        ]
      };
      
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
      
      // Jeśli status faktycznie się zmienił, wyślij powiadomienie
      if (oldStatus !== updates.status) {
        // Jeśli zaimportowano usługę powiadomień, utwórz powiadomienie o zmianie statusu
        try {
          const { createRealtimeStatusChangeNotification } = require('./notificationService');
          
          // Określ użytkowników, którzy powinni otrzymać powiadomienie
          // Na przykład: użytkownik wykonujący zmianę oraz opcjonalnie menadżerowie produkcji
          const userIds = [userId];
          
          await createRealtimeStatusChangeNotification(
            userIds,
            'productionTask',
            taskId,
            task.moNumber || task.name || taskId.substring(0, 8),
            oldStatus || 'Nowe',
            updates.status,
            userId // Przekazanie ID użytkownika, który zmienił status
          );
        } catch (notificationError) {
          console.warn('Nie udało się utworzyć powiadomienia w czasie rzeczywistym:', notificationError);
          
          // Fallback do starego systemu powiadomień, jeśli Realtime Database nie zadziała
          try {
            const { createStatusChangeNotification } = require('./notificationService');
            await createStatusChangeNotification(
              userId,
              'productionTask',
              taskId,
              task.moNumber || task.name || taskId.substring(0, 8),
              oldStatus || 'Nowe',
              updates.status
            );
          } catch (fallbackError) {
            console.warn('Nie udało się również utworzyć powiadomienia w Firestore:', fallbackError);
          }
        }
      }
      
      // Jeśli zadanie jest powiązane z zamówieniem klienta, zaktualizuj informacje w zamówieniu
      if (task.orderId) {
        try {
          console.log(`Próba aktualizacji zadania ${taskId} w zamówieniu ${task.orderId}`);
          
          // Pobierz bezpośrednio z bazy danych aktualne dane zamówienia
          const orderRef = doc(db, 'orders', task.orderId);
          const orderDoc = await getDoc(orderRef);
          
          if (!orderDoc.exists()) {
            console.error(`Zamówienie o ID ${task.orderId} nie istnieje`);
            return { success: true, message: `Status zadania zmieniony na ${updates.status}, ale zamówienie nie istnieje` };
          }
          
          const orderData = orderDoc.data();
          const productionTasks = orderData.productionTasks || [];
          
          // Znajdź indeks zadania w tablicy zadań produkcyjnych
          const taskIndex = productionTasks.findIndex(t => t.id === taskId);
          
          if (taskIndex === -1) {
            console.error(`Zadanie ${taskId} nie znaleziono w zamówieniu ${task.orderId}`);
            
            // Jeśli nie znaleziono zadania w zamówieniu, dodaj je
            productionTasks.push({
              id: taskId,
              moNumber: task.moNumber,
              name: task.name,
              status: updates.status,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              productName: task.productName,
              quantity: task.quantity,
              unit: task.unit
            });
            
            await updateDoc(orderRef, {
              productionTasks,
              updatedAt: serverTimestamp(),
              updatedBy: userId
            });
            
            console.log(`Dodano zadanie ${taskId} do zamówienia ${task.orderId}`);
          } else {
            // Aktualizuj informacje o zadaniu w zamówieniu
            productionTasks[taskIndex] = {
              ...productionTasks[taskIndex],
              status: updates.status,
              updatedAt: new Date().toISOString(),
              ...(updates.completionDate ? { completionDate: updates.completionDate } : {}),
              // Zachowaj orderItemId, jeśli istnieje
              orderItemId: productionTasks[taskIndex].orderItemId || task.orderItemId || null
            };
            
            // Zaktualizuj zamówienie
            await updateDoc(orderRef, {
              productionTasks: productionTasks,
              updatedAt: serverTimestamp(),
              updatedBy: userId
            });
            
            console.log(`Zaktualizowano status zadania ${taskId} w zamówieniu ${task.orderId}`);
          }
        } catch (orderUpdateError) {
          console.error(`Błąd podczas aktualizacji zadania w zamówieniu: ${orderUpdateError.message}`, orderUpdateError);
          // Nie przerywamy głównej operacji, jeśli aktualizacja zamówienia się nie powiedzie
        }
      }
      
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
      
      // Anuluj rezerwacje materiałów bez względu na stan zadania
      if (task.materials && task.materials.length > 0) {
        for (const material of task.materials) {
          try {
            if (!material.id && !material.inventoryItemId) {
              console.warn(`Materiał ${material.name} nie ma ID, pomijam anulowanie rezerwacji`);
              continue;
            }
            // Anuluj rezerwację materiału
            const materialId = material.inventoryItemId || material.id;
            await cancelBooking(materialId, material.quantity, taskId, task.createdBy || 'system');
            console.log(`Anulowano rezerwację materiału ${material.name} dla usuniętego zadania`);
          } catch (error) {
            console.error(`Błąd przy anulowaniu rezerwacji materiału ${material.name}:`, error);
            // Kontynuuj anulowanie rezerwacji pozostałych materiałów mimo błędu
          }
        }
      }
      
      // Usuń wszystkie rezerwacje związane z tym zadaniem z kolekcji transakcji
      try {
        const { cleanupTaskReservations, cleanupDeletedTaskReservations } = await import('./inventoryService');
        
        // Najpierw wyczyść konkretne rezerwacje dla tego zadania
        await cleanupTaskReservations(taskId);
        console.log(`Usunięto wszystkie rezerwacje związane z zadaniem ${taskId}`);
        
        
        // Dodatkowo uruchom pełne czyszczenie rezerwacji z usuniętych zadań
        // to zapewni że wszystkie rezerwacje będą usunięte, nawet jeśli pojedyncze anulowanie się nie powiodło
        await cleanupDeletedTaskReservations();
        console.log(`Wykonano pełne czyszczenie rezerwacji z usuniętych zadań`);
      } catch (error) {
        console.error(`Błąd podczas usuwania rezerwacji dla zadania ${taskId}:`, error);
        // Kontynuuj usuwanie zadania mimo błędu
      }
      
      // Ta część została usunięta, aby zachować partie produktów w magazynie
      // Zamiast usuwania partii, tylko zalogujemy, że istnieją
      try {
        const batchesRef = collection(db, 'inventoryBatches');
        const q = query(batchesRef, where('sourceId', '==', taskId), where('source', '==', 'Produkcja'));
        const batchesSnapshot = await getDocs(q);
        
        if (batchesSnapshot.docs.length > 0) {
          console.log(`Zadanie ${taskId} ma ${batchesSnapshot.docs.length} powiązanych partii produktów w magazynie, które zostały zachowane.`);
        }
      } catch (error) {
        console.error(`Błąd podczas sprawdzania partii produktów: ${error.message}`);
      }
      
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
      
      // Sprawdź, czy zadanie jest powiązane z zamówieniem klienta
      if (task.orderId) {
        try {
          // Importuj funkcję do usuwania zadania z zamówienia
          const { removeProductionTaskFromOrder } = await import('./orderService');
          
          // Usuń zadanie z zamówienia
          await removeProductionTaskFromOrder(task.orderId, taskId);
          console.log(`Zadanie produkcyjne ${taskId} zostało usunięte z zamówienia ${task.orderId}`);
        } catch (orderError) {
          console.error(`Błąd podczas usuwania zadania ${taskId} z zamówienia ${task.orderId}:`, orderError);
          // Kontynuuj usuwanie zadania mimo błędu
        }
      }
      
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
    
    // Sprawdź, czy mamy dane w cache i czy są aktualne
    const now = Date.now();
    if (
      tasksCache.byStatus[status] && 
      tasksCache.timestamp[status] && 
      (now - tasksCache.timestamp[status] < tasksCache.ttl)
    ) {
      console.log(`Zwracam zadania o statusie "${status}" z cache. Dane ważne przez ${Math.round((tasksCache.timestamp[status] + tasksCache.ttl - now) / 1000)} sekund.`);
      return tasksCache.byStatus[status];
    }
    
    // Jeśli zapytanie jest już w toku, poczekaj na jego zakończenie 
    // zamiast uruchamiania kolejnego równoległego zapytania
    if (tasksCache.fetchInProgress[status]) {
      console.log(`Zapytanie o zadania ze statusem "${status}" już w toku, oczekuję na jego zakończenie...`);
      
      // Czekaj maksymalnie 2 sekundy na zakończenie trwającego zapytania
      let waitTime = 0;
      const waitInterval = 100; // 100ms
      const maxWaitTime = 2000; // 2 sekundy
      
      while (tasksCache.fetchInProgress[status] && waitTime < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, waitInterval));
        waitTime += waitInterval;
      }
      
      // Jeśli dane są dostępne po oczekiwaniu, zwróć je
      if (tasksCache.byStatus[status] && !tasksCache.fetchInProgress[status]) {
        console.log(`Zapytanie o zadania ze statusem "${status}" zostało zakończone przez inny proces, zwracam dane z cache`);
        return tasksCache.byStatus[status];
      }
      
      // Jeśli nadal trwa zapytanie, zresetuj flagę (na wypadek błędu) i kontynuuj
      if (tasksCache.fetchInProgress[status]) {
        console.log(`Przekroczono czas oczekiwania na zapytanie o zadania ze statusem "${status}", kontynuuję własne zapytanie`);
        tasksCache.fetchInProgress[status] = false;
      }
    }
    
    // Ustaw flagę, że zapytanie jest w toku
    tasksCache.fetchInProgress[status] = true;
    
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
      
      // Zapisz wyniki do cache
      tasksCache.byStatus[status] = tasks;
      tasksCache.timestamp[status] = now;
      
      // Zakończ zapytanie
      tasksCache.fetchInProgress[status] = false;
      
      return tasks;
    } catch (error) {
      console.error(`Błąd podczas pobierania zadań o statusie "${status}":`, error);
      // Zresetuj flagę w przypadku błędu
      tasksCache.fetchInProgress[status] = false;
      throw error;
    }
  };
  
  // Dodanie produktu z zadania produkcyjnego do magazynu jako partii
  export const addTaskProductToInventory = async (taskId, userId, inventoryParams = {}) => {
    try {
      console.log(`Dodawanie produktu z zadania ${taskId} do magazynu`, inventoryParams);
      
      // Pobierz dane zadania
      const taskRef = doc(db, PRODUCTION_TASKS_COLLECTION, taskId);
      const taskSnapshot = await getDoc(taskRef);
      
      if (!taskSnapshot.exists()) {
        throw new Error(`Zadanie o ID ${taskId} nie istnieje`);
      }
      
      const taskData = taskSnapshot.data();
      
      // Upewnij się, że zadanie posiada produkt i ilość
      if (!taskData.productName || !taskData.quantity) {
        throw new Error('Zadanie nie zawiera informacji o produkcie lub ilości');
      }
      
      // Sprawdź, czy zadanie ma powiązany produkt w magazynie
      let inventoryItemId = taskData.inventoryProductId;
      let inventoryItem = null;
      
      if (!inventoryItemId) {
        // Jeśli nie ma określonego produktu, spróbuj znaleźć go według nazwy
        const inventoryRef = collection(db, 'inventory');
        const q = query(inventoryRef, where('name', '==', taskData.productName));
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
      
      // Użyj parametrów przekazanych z formularza lub wartości z zadania produkcyjnego
      const finalQuantity = inventoryParams.finalQuantity ? parseFloat(inventoryParams.finalQuantity) : taskData.quantity;
      
      // Jeśli podano numer LOT z formularza - użyj go, 
      // w innym przypadku sprawdź czy zadanie ma zdefiniowany LOT, 
      // a jeśli nie, wygeneruj domyślny numer LOT
      const lotNumber = inventoryParams.lotNumber || 
                        taskData.lotNumber || 
                        (taskData.moNumber ? `LOT-${taskData.moNumber}` : `LOT-PROD-${taskId.substring(0, 6)}`);
      
      // Przygotuj datę ważności - użyj przekazanej w parametrach, 
      // lub z zadania produkcyjnego, lub ustaw null
      let expiryDate = null;
      if (inventoryParams.expiryDate) {
        expiryDate = new Date(inventoryParams.expiryDate);
      } else if (taskData.expiryDate) {
        // Konwertuj timestamp lub string na obiekt Date
        try {
          if (taskData.expiryDate instanceof Date) {
            expiryDate = taskData.expiryDate;
          } else if (taskData.expiryDate.toDate) {
            // Firebase Timestamp
            expiryDate = taskData.expiryDate.toDate();
          } else {
            // String z datą
            expiryDate = new Date(taskData.expiryDate);
          }
        } catch (error) {
          console.error('Błąd podczas konwersji daty ważności:', error);
        }
      }
      
      // Sprawdź czy podano ID magazynu w parametrach
      const warehouseId = inventoryParams.warehouseId || null;
      
      // Zbierz szczegóły dotyczące pochodzenia partii
      const sourceDetails = {
        moNumber: taskData.moNumber || null,
        orderNumber: taskData.orderNumber || null,
        orderId: taskData.orderId || null,
        productionTaskName: taskData.name || null
      };
      
      // Przygotuj opis pochodzenia partii
      let sourceNotes = `Partia z zadania produkcyjnego: ${taskData.name || ''}`;
      
      if (taskData.moNumber) {
        sourceNotes += ` (MO: ${taskData.moNumber})`;
      }
      
      if (taskData.orderNumber) {
        sourceNotes += ` (CO: ${taskData.orderNumber})`;
      }
      
      // Sprawdź czy istnieje już partia z tym samym numerem LOT w tym magazynie
      const existingBatchQuery = query(
        collection(db, 'inventoryBatches'),
        where('itemId', '==', inventoryItemId),
        where('lotNumber', '==', lotNumber),
        where('warehouseId', '==', warehouseId || null)
      );
      
      const existingBatchSnapshot = await getDocs(existingBatchQuery);
      let batchRef;
      let isNewBatch = true;
      
      if (!existingBatchSnapshot.empty) {
        // Znaleziono istniejącą partię - dodaj do niej ilość
        const existingBatch = existingBatchSnapshot.docs[0];
        batchRef = existingBatch.ref;
        isNewBatch = false;
        
        // Aktualizuj istniejącą partię
        await updateDoc(batchRef, {
          quantity: increment(finalQuantity),
          initialQuantity: increment(finalQuantity),
          updatedAt: serverTimestamp(),
          updatedBy: userId,
          // Dodaj informacje o ostatnim dodaniu z produkcji
          lastProductionUpdate: {
            taskId: taskId,
            taskName: taskData.name,
            addedQuantity: finalQuantity,
            addedAt: serverTimestamp(),
            moNumber: taskData.moNumber || null,
            orderNumber: taskData.orderNumber || null
          }
        });
        
        console.log(`Dodano ${finalQuantity} do istniejącej partii LOT: ${lotNumber}`);
      } else {
        // Nie znaleziono istniejącej partii - utwórz nową
        batchRef = doc(collection(db, 'inventoryBatches'));
        const batchData = {
          itemId: inventoryItemId,
          itemName: taskData.productName,
          quantity: finalQuantity,
          initialQuantity: finalQuantity,
          batchNumber: lotNumber,
          receivedDate: serverTimestamp(),
          expiryDate: expiryDate ? Timestamp.fromDate(expiryDate) : null,
          lotNumber: lotNumber,
          source: 'Produkcja',
          sourceId: taskId,
          // Dodajemy pola przechowujące informacje o pochodzeniu
          moNumber: taskData.moNumber || null,
          orderNumber: taskData.orderNumber || null,
          orderId: taskData.orderId || null,
          sourceDetails: sourceDetails,
          notes: sourceNotes,
          unitPrice: 0, // Ustaw cenę jednostkową na 0
          warehouseId: warehouseId, // Dodaj ID magazynu jeśli zostało przekazane
          createdAt: serverTimestamp(),
          createdBy: userId
        };
        
        await setDoc(batchRef, batchData);
        console.log(`Utworzono nową partię LOT: ${lotNumber} z ilością ${finalQuantity}`);
      }
      
      // Zaktualizuj ilość w magazynie
      
      // Zaktualizuj ilość w magazynie
      await recalculateItemQuantity(inventoryItemId);
      
      // Dodaj transakcję do historii
      const transactionRef = doc(collection(db, 'inventoryTransactions'));
      const transactionData = {
        itemId: inventoryItemId,
        itemName: taskData.productName,
        type: 'receive',
        quantity: finalQuantity,
        date: serverTimestamp(),
        reason: isNewBatch ? 'Z produkcji (nowa partia)' : 'Z produkcji (dodano do istniejącej partii)',
        reference: `Zadanie: ${taskData.name} (ID: ${taskId})`,
        notes: isNewBatch ? sourceNotes : `${sourceNotes} - Dodano do istniejącej partii LOT: ${lotNumber}`,
        moNumber: taskData.moNumber || null,
        orderNumber: taskData.orderNumber || null,
        batchId: batchRef.id,
        warehouseId: warehouseId, // Dodaj ID magazynu jeśli zostało przekazane
        createdBy: userId,
        createdAt: serverTimestamp()
      };
      
      await setDoc(transactionRef, transactionData);
      
      // Zaktualizuj zadanie
      const updates = {
        inventoryUpdated: true,
        inventoryItemId: inventoryItemId,
        inventoryBatchId: batchRef.id,
        finalQuantity: finalQuantity, // Zapisz końcową ilość w zadaniu
        lotNumber: lotNumber, // Zapisz numer partii do zadania
        warehouseId: warehouseId, // Zapisz ID magazynu do zadania
        readyForInventory: false, // Oznacz jako już dodane do magazynu
        updatedAt: serverTimestamp(),
        updatedBy: userId
      };
      
      await updateDoc(taskRef, updates);
      
      // Jeśli zadanie jest powiązane z zamówieniem klienta, zaktualizuj informacje w zamówieniu
      if (taskData.orderId) {
        try {
          // Pobierz aktualne dane zamówienia
          const orderRef = doc(db, 'orders', taskData.orderId);
          const orderDoc = await getDoc(orderRef);
          
          if (orderDoc.exists()) {
            const orderData = orderDoc.data();
            // Pobierz listę zadań produkcyjnych z zamówienia
            const productionTasks = orderData.productionTasks || [];
            
            // Znajdź indeks zadania w tablicy zadań produkcyjnych
            const taskIndex = productionTasks.findIndex(task => task.id === taskId);
            
            if (taskIndex !== -1) {
              // Zaktualizuj informacje o zadaniu w zamówieniu
              productionTasks[taskIndex] = {
                ...productionTasks[taskIndex],
                status: 'Zakończone',
                lotNumber: lotNumber,
                finalQuantity: finalQuantity,
                inventoryBatchId: batchRef.id,
                inventoryItemId: inventoryItemId,
                updatedAt: new Date().toISOString(),
                // Zachowaj orderItemId, jeśli istnieje
                orderItemId: productionTasks[taskIndex].orderItemId || taskData.orderItemId || null
              };
              
              // Zaktualizuj zamówienie
              await updateDoc(orderRef, {
                productionTasks: productionTasks,
                updatedAt: serverTimestamp(),
                updatedBy: userId
              });
              
              console.log(`Zaktualizowano informacje o partii LOT w zamówieniu ${taskData.orderNumber}`);
            } else {
              console.warn(`Nie znaleziono zadania ${taskId} w zamówieniu ${taskData.orderId}`);
            }
          } else {
            console.warn(`Zamówienie o ID ${taskData.orderId} nie istnieje`);
          }
        } catch (orderError) {
          console.error(`Błąd podczas aktualizacji informacji o partii w zamówieniu: ${orderError.message}`, orderError);
          // Nie przerywamy głównej operacji, jeśli aktualizacja zamówienia się nie powiedzie
        }
      } else {
        // Jeśli zadanie nie ma powiązanego zamówienia klienta, sprawdź czy ma OrderId w polu sourceDetails
        if (taskData.sourceDetails && taskData.sourceDetails.orderId) {
          try {
            // Pobierz aktualne dane zamówienia
            const orderRef = doc(db, 'orders', taskData.sourceDetails.orderId);
            const orderDoc = await getDoc(orderRef);
            
            if (orderDoc.exists()) {
              const orderData = orderDoc.data();
              // Pobierz listę zadań produkcyjnych z zamówienia
              const productionTasks = orderData.productionTasks || [];
              
              // Znajdź indeks zadania w tablicy zadań produkcyjnych
              const taskIndex = productionTasks.findIndex(task => task.id === taskId);
              
              if (taskIndex !== -1) {
                // Zaktualizuj informacje o zadaniu w zamówieniu
                productionTasks[taskIndex] = {
                  ...productionTasks[taskIndex],
                  status: 'Zakończone',
                  lotNumber: lotNumber,
                  finalQuantity: finalQuantity,
                  inventoryBatchId: batchRef.id,
                  inventoryItemId: inventoryItemId,
                  updatedAt: new Date().toISOString(),
                  // Zachowaj orderItemId, jeśli istnieje
                  orderItemId: productionTasks[taskIndex].orderItemId || taskData.orderItemId || null
                };
                
                // Zaktualizuj zamówienie
                await updateDoc(orderRef, {
                  productionTasks: productionTasks,
                  updatedAt: serverTimestamp(),
                  updatedBy: userId
                });
                
                console.log(`Zaktualizowano informacje o partii LOT w zamówieniu ze źródła ${taskData.sourceDetails.orderNumber}`);
              }
            }
          } catch (sourceOrderError) {
            console.error(`Błąd podczas aktualizacji informacji o partii w zamówieniu źródłowym: ${sourceOrderError.message}`, sourceOrderError);
          }
        }
      }
      
      return {
        success: true,
        inventoryItemId,
        inventoryBatchId: batchRef.id,
        lotNumber: lotNumber,
        isNewBatch: isNewBatch,
        message: isNewBatch 
          ? `Utworzono nową partię LOT: ${lotNumber}` 
          : `Dodano do istniejącej partii LOT: ${lotNumber}`
      };
    } catch (error) {
      console.error('Błąd podczas dodawania produktu do magazynu:', error);
      
      // Zaktualizuj zadanie z informacją o błędzie
      try {
        const taskRef = doc(db, PRODUCTION_TASKS_COLLECTION, taskId);
        await updateDoc(taskRef, {
          inventoryError: error.message,
          updatedAt: serverTimestamp(),
          updatedBy: userId
        });
      } catch (updateError) {
        console.error('Błąd podczas aktualizacji zadania z informacją o błędzie:', updateError);
      }
      
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
              
          // Sprawdzamy tylko zakres dat, bez wykluczania wstrzymanych zadań
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
      
      // Znane poprawne wartości materiałów na jednostkę
      const knownMaterialQuantities = {
        'RAWBW-Sucralose Suralose': 2.07
      };
      
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
          
          // Sprawdź, czy mamy znaną wartość dla tego materiału
          if (knownMaterialQuantities[material.name]) {
            materialQuantity = knownMaterialQuantities[material.name];
          } else if (quantityPerUnit && quantityPerUnit > 0) {
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

      // Rozszerzony zestaw nagłówków CSV
      const headers = [
        "Materiał", 
        "Kategoria", 
        "Dostępna ilość", 
        "Potrzebna ilość", 
        "Bilans", 
        "Oczekiwane dostawy", 
        "Bilans z dostawami", 
        "Jednostka", 
        "Koszt materiału", 
        "Koszt niedoboru", 
        "Status",
        "Ilość na jednostkę produktu"
      ];
      
      let csvContent = headers.join(",") + "\n";
      
      // Dodaj dane materiałów z kompletnymi informacjami
      forecastData.forEach(item => {
        // Sprawdź, czy wartości są liczbami i ustaw domyślne wartości, jeśli nie są
        const availableQuantity = isNaN(parseFloat(item.availableQuantity)) ? 0 : parseFloat(item.availableQuantity);
        const requiredQuantity = isNaN(parseFloat(item.requiredQuantity)) ? 0 : parseFloat(item.requiredQuantity);
        const balance = availableQuantity - requiredQuantity;
        const futureDeliveries = isNaN(parseFloat(item.futureDeliveriesTotal)) ? 0 : parseFloat(item.futureDeliveriesTotal);
        const balanceWithDeliveries = balance + futureDeliveries;
        const price = isNaN(parseFloat(item.price)) ? 0 : parseFloat(item.price);
        const cost = requiredQuantity * price;
        const shortageCost = balance < 0 ? Math.abs(balance) * price : 0;
        const perUnitQuantity = isNaN(parseFloat(item.perUnit || item.perUnitQuantity)) ? "" : parseFloat(item.perUnit || item.perUnitQuantity).toFixed(4);
        
        // Określ status
        let status = "Wystarczająca ilość";
        if (balanceWithDeliveries < 0) {
          status = "Niedobór";
        } else if (balance < 0 && balanceWithDeliveries >= 0) {
          status = "Uzupełniany dostawami";
        }
        
        const row = [
          `"${(item.name || 'Nieznany').replace(/"/g, '""')}"`, 
          `"${(item.category || 'Inne').replace(/"/g, '""')}"`,
          availableQuantity.toFixed(2),
          requiredQuantity.toFixed(2),
          balance.toFixed(2),
          futureDeliveries.toFixed(2),
          balanceWithDeliveries.toFixed(2),
          `"${(item.unit || 'szt.').replace(/"/g, '""')}"`,
          cost.toFixed(2),
          shortageCost.toFixed(2),
          `"${status}"`,
          perUnitQuantity
        ];
        csvContent += row.join(",") + "\n";
      });
      
      // Dodaj podsumowanie do raportu
      csvContent += "\n";
      csvContent += "Podsumowanie:,,,,,,,,,,,\n";
      
      // Oblicz sumy
      const totalItems = forecastData.length;
      const requiredItems = forecastData.filter(item => 
        (item.availableQuantity - item.requiredQuantity) < 0
      ).length;
      const requiredItemsAfterDeliveries = forecastData.filter(item => {
        const balance = item.availableQuantity - item.requiredQuantity;
        const futureDeliveries = isNaN(parseFloat(item.futureDeliveriesTotal)) ? 0 : parseFloat(item.futureDeliveriesTotal);
        return (balance + futureDeliveries) < 0;
      }).length;
      
      const totalCost = forecastData.reduce((sum, item) => {
        const reqQuantity = isNaN(parseFloat(item.requiredQuantity)) ? 0 : parseFloat(item.requiredQuantity);
        const price = isNaN(parseFloat(item.price)) ? 0 : parseFloat(item.price);
        return sum + (reqQuantity * price);
      }, 0);
      
      const shortageValue = forecastData.reduce((sum, item) => {
        const availableQuantity = isNaN(parseFloat(item.availableQuantity)) ? 0 : parseFloat(item.availableQuantity);
        const requiredQuantity = isNaN(parseFloat(item.requiredQuantity)) ? 0 : parseFloat(item.requiredQuantity);
        const balance = availableQuantity - requiredQuantity;
        const price = isNaN(parseFloat(item.price)) ? 0 : parseFloat(item.price);
        
        if (balance < 0) {
          return sum + (Math.abs(balance) * price);
        }
        return sum;
      }, 0);
      
      const shortageValueAfterDeliveries = forecastData.reduce((sum, item) => {
        const availableQuantity = isNaN(parseFloat(item.availableQuantity)) ? 0 : parseFloat(item.availableQuantity);
        const requiredQuantity = isNaN(parseFloat(item.requiredQuantity)) ? 0 : parseFloat(item.requiredQuantity);
        const futureDeliveries = isNaN(parseFloat(item.futureDeliveriesTotal)) ? 0 : parseFloat(item.futureDeliveriesTotal);
        const balance = availableQuantity - requiredQuantity + futureDeliveries;
        const price = isNaN(parseFloat(item.price)) ? 0 : parseFloat(item.price);
        
        if (balance < 0) {
          return sum + (Math.abs(balance) * price);
        }
        return sum;
      }, 0);
      
      // Dodaj dane podsumowania do raportu
      csvContent += `Łączna liczba materiałów:,${totalItems},,,,,,,,,,\n`;
      csvContent += `Materiały wymagające zakupu:,${requiredItems},,,,,,,,,,\n`;
      csvContent += `Materiały z niedoborem po dostawach:,${requiredItemsAfterDeliveries},,,,,,,,,,\n`;
      csvContent += `Wartość niedoborów:,${shortageValue.toFixed(2)} PLN,,,,,,,,,,\n`;
      csvContent += `Wartość niedoborów po dostawach:,${shortageValueAfterDeliveries.toFixed(2)} PLN,,,,,,,,,,\n`;
      csvContent += `Szacowany koszt całkowity:,${totalCost.toFixed(2)} PLN,,,,,,,,,,\n`;
      csvContent += `Okres raportu:,${formattedStartDate} - ${formattedEndDate},,,,,,,,,,\n`;
      
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
      console.log('Pobieranie zaplanowanych zadań produkcyjnych...');
      
      // Pobierz zadania zaplanowane, w trakcie realizacji oraz wstrzymane
      const q = query(
        tasksRef, 
        where('status', 'in', ['Zaplanowane', 'W trakcie', 'Wstrzymane'])
      );
      const snapshot = await getDocs(q);
      
      const allTasks = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      console.log(`Pobrano ${allTasks.length} zadań`);
      
      // Zbierz wszystkie ID receptur używanych w zadaniach
      const recipeIds = new Set();
      allTasks.forEach(task => {
        if (task.recipeId) {
          recipeIds.add(task.recipeId);
        }
      });
      
      // Jeśli mamy receptury do pobrania, zróbmy to zbiorczo
      let recipesMap = {};
      if (recipeIds.size > 0) {
        // Importuj funkcje z recipeService
        const { getAllRecipes } = await import('./recipeService');
        
        // Pobierz wszystkie receptury
        const recipes = await getAllRecipes();
        
        // Utwórz mapę ID -> receptura
        recipesMap = recipes.reduce((map, recipe) => {
          map[recipe.id] = recipe;
          return map;
        }, {});
      }
      
      // Przypisz dane receptur do zadań
      const tasksWithRecipes = allTasks.map(task => {
        if (task.recipeId && recipesMap[task.recipeId]) {
          return {
            ...task,
            recipe: recipesMap[task.recipeId]
          };
        }
        return task;
      });
      
      return tasksWithRecipes;
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
  export const updateActualMaterialUsage = async (taskId, materialUsage, batchUsage = {}, userId = null) => {
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
      
      // Sprawdź, czy zużycie zostało wcześniej potwierdzone
      const wasConfirmedBefore = task.materialConsumptionConfirmed === true;
      
      // Jeśli zużycie było już potwierdzone, musimy najpierw anulować poprzednie zużycie
      if (wasConfirmedBefore) {
        console.log(`Zużycie materiałów dla zadania ${taskId} było już potwierdzone. Anulowanie poprzedniego zużycia...`);
        
        // Pobierz poprzednio zużyte partie
        const usedBatches = task.usedBatches || {};
        
        // Dla każdego materiału, przywróć ilości do partii
        for (const materialId in usedBatches) {
          const batches = usedBatches[materialId];
          
          for (const batchAssignment of batches) {
            // Przywróć ilość do partii
            const batchRef = doc(db, 'inventoryBatches', batchAssignment.batchId);
            await updateDoc(batchRef, {
              quantity: increment(batchAssignment.quantity),
              updatedAt: serverTimestamp()
            });
            
            // Dodaj transakcję dla przywrócenia ilości
            const transactionRef = doc(collection(db, 'inventoryTransactions'));
            await setDoc(transactionRef, {
              itemId: materialId,
              itemName: task.materials.find(m => m.id === materialId)?.name || 'Nieznany materiał',
              type: 'adjustment_add',
              quantity: batchAssignment.quantity,
              date: serverTimestamp(),
              reason: 'Korekta zużycia w produkcji',
              reference: `Zadanie: ${task.name || taskId}`,
              batchId: batchAssignment.batchId,
              batchNumber: batchAssignment.batchNumber,
              notes: `Korekta zużycia materiału w zadaniu produkcyjnym: ${task.name || taskId}`,
              createdAt: serverTimestamp(),
              createdBy: userId || 'system'
            });
          }
          
          // Przelicz ilość dla danego materiału
          await recalculateItemQuantity(materialId);
        }
      }
      
      // Aktualizacja faktycznego zużycia i zresetowanie potwierdzenia
      const updates = {
        actualMaterialUsage: materialUsage,
        materialConsumptionConfirmed: false, // Resetuje potwierdzenie zużycia
        updatedAt: serverTimestamp(),
        updatedBy: userId || 'system'
      };
      
      // Dodaj informacje o zużyciu na poziomie partii, jeśli zostały przekazane
      if (Object.keys(batchUsage).length > 0) {
        updates.batchActualUsage = batchUsage;
      }
      
      // Aktualizuj pole usedBatches tylko jeśli trzeba
      if (wasConfirmedBefore) {
        updates.usedBatches = {}; // Wyczyść informacje o zużytych partiach, jeśli były potwierdzone
      }
      
      await updateDoc(taskRef, updates);
      
      return { 
        success: true, 
        message: wasConfirmedBefore 
          ? 'Zużycie materiałów zaktualizowane. Poprzednie potwierdzenie zużycia zostało anulowane. Proszę ponownie potwierdzić zużycie.'
          : 'Zużycie materiałów zaktualizowane'
      };
    } catch (error) {
      console.error('Błąd podczas aktualizacji zużycia materiałów:', error);
      throw error;
    }
  };

  // Potwierdza zużycie materiałów i aktualizuje stany magazynowe
  export const confirmMaterialConsumption = async (taskId, userId = null) => {
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
      const batchActualUsage = task.batchActualUsage || {};
      
      console.log("[DEBUG REZERWACJE] Rozpoczynam potwierdzanie zużycia materiałów dla zadania:", taskId);
      console.log("[DEBUG REZERWACJE] Aktualne zużycie materiałów:", actualUsage);
      console.log("[DEBUG REZERWACJE] Aktualne zużycie na poziomie partii:", batchActualUsage);
      
      // Dla każdego materiału, zaktualizuj stan magazynowy
      for (const material of materials) {
        const materialId = material.id;
        // Preferuj inventory item ID nad ID materiału, jeśli jest dostępne
        const inventoryMaterialId = material.inventoryItemId || materialId;
        
        // Użyj skorygowanej ilości, jeśli została podana, w przeciwnym razie użyj planowanej ilości
        let consumedQuantity = actualUsage[materialId] !== undefined 
          ? parseFloat(actualUsage[materialId]) 
          : parseFloat(material.quantity);
        
        console.log(`[DEBUG REZERWACJE] Materiał ${material.name}: planowana ilość = ${material.quantity}, skorygowana ilość = ${consumedQuantity}`);
        
        // Sprawdź, czy consumedQuantity jest dodatnią liczbą
        if (isNaN(consumedQuantity) || consumedQuantity < 0) {
          throw new Error(`Zużycie materiału "${material.name}" jest nieprawidłowe (${consumedQuantity}). Musi być liczbą większą lub równą 0.`);
        }
        
        // Jeśli skorygowana ilość wynosi 0, pomijamy aktualizację partii dla tego materiału
        if (consumedQuantity === 0) {
          console.log(`[DEBUG REZERWACJE] Pomijam aktualizację partii dla materiału ${material.name} - zużycie wynosi 0`);
          continue;
        }
        
        // Pobierz aktualny stan magazynowy
        const inventoryRef = doc(db, 'inventory', inventoryMaterialId);
        const inventorySnapshot = await getDoc(inventoryRef);
        
        if (inventorySnapshot.exists()) {
          const inventoryItem = {
            id: inventorySnapshot.id,
            ...inventorySnapshot.data()
          };
          
          console.log(`[DEBUG REZERWACJE] Stan magazynowy ${material.name}: ilość=${inventoryItem.quantity}, zarezerwowano=${inventoryItem.bookedQuantity || 0}`);
          
          // 1. Najpierw pobierz i sprawdź przypisane loty/partie do tego materiału w zadaniu
          let assignedBatches = [];
          
          // Sprawdź, czy zadanie ma przypisane konkretne partie dla tego materiału
          if (task.materialBatches && task.materialBatches[inventoryMaterialId]) {
            // Pobierz oryginalne przypisane partie
            const originalBatches = task.materialBatches[inventoryMaterialId];
            
            // Przetwórz każdą partię, używając skorygowanych ilości z batchActualUsage jeśli są dostępne
            assignedBatches = originalBatches.map(batch => {
              const batchKey = `${inventoryMaterialId}_${batch.batchId}`;
              let actualBatchQuantity = batch.quantity; // Domyślnie użyj oryginalnej ilości
              
              // Jeśli dla tej partii zdefiniowano niestandardową ilość zużycia, użyj jej
              if (batchActualUsage[batchKey] !== undefined) {
                actualBatchQuantity = parseFloat(batchActualUsage[batchKey]);
                console.log(`Używam skorygowanej ilości dla partii ${batch.batchNumber}: ${actualBatchQuantity} (oryginalna: ${batch.quantity})`);
              }
              
              // Sprawdź czy ilość jest poprawna
              if (isNaN(actualBatchQuantity) || actualBatchQuantity < 0) {
                throw new Error(`Zużycie dla partii "${batch.batchNumber}" materiału "${material.name}" jest nieprawidłowe (${actualBatchQuantity}). Musi być liczbą większą lub równą 0.`);
              }
              
              return {
                ...batch,
                quantity: actualBatchQuantity
              };
            });
            
            // Odfiltruj partie z zerowym zużyciem
            assignedBatches = assignedBatches.filter(batch => batch.quantity > 0);
            
            console.log(`Przygotowano partie do aktualizacji dla ${material.name}:`, assignedBatches);
          } else {
            // Brak przypisanych partii - automatycznie przydziel partie według FIFO/FEFO
            console.log(`Brak przypisanych partii dla materiału ${material.name}. Przydzielanie automatyczne...`);
            
            // Pobierz dostępne partie dla tego materiału
            const batchesQuery = query(
              collection(db, 'inventoryBatches'),
              where('itemId', '==', inventoryMaterialId),
              where('status', '==', 'active')
            );
            
            const batchesSnapshot = await getDocs(batchesQuery);
            
            if (batchesSnapshot.empty) {
              throw new Error(`Nie znaleziono żadnych partii dla materiału "${material.name}". Nie można potwierdzić zużycia.`);
            }
            
            // Konwertuj dokumenty na obiekty
            const availableBatches = batchesSnapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            }));
            
            // Sortuj partie według FIFO (daty utworzenia) lub FEFO (daty ważności)
            const methodOfReservation = 'fifo'; // Zastępuję niezdefiniowaną zmienną reservationMethod
            if (methodOfReservation === 'fifo') {
              availableBatches.sort((a, b) => {
                const dateA = a.createdAt ? (a.createdAt instanceof Timestamp ? a.createdAt.toDate() : new Date(a.createdAt)) : new Date(0);
                const dateB = b.createdAt ? (b.createdAt instanceof Timestamp ? b.createdAt.toDate() : new Date(b.createdAt)) : new Date(0);
                return dateA - dateB;
              });
            } else {
              // Według daty ważności (expiry)
              availableBatches.sort((a, b) => {
                const dateA = a.expiryDate ? new Date(a.expiryDate) : new Date(9999, 11, 31);
                const dateB = b.expiryDate ? new Date(b.expiryDate) : new Date(9999, 11, 31);
                return dateA - dateB;
              });
            }
            
            console.log(`Posortowane partie dla materiału ${material.name}:`, 
                        availableBatches.map(b => `${b.batchId} (${b.quantity || 0} ${material.unit || 'szt.'})`));
            
            // Przypisz partie automatycznie według FEFO - użyj skorygowanej ilości
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
              
              console.log(`Przypisano ${quantityFromBatch} z partii ${batch.batchNumber || batch.lotNumber || batch.id}`);
            }
            
            // Jeśli nie udało się przypisać wszystkich wymaganych ilości
            if (remainingQuantity > 0) {
              throw new Error(`Nie można znaleźć wystarczającej ilości partii dla materiału "${material.name}". Brakuje ${remainingQuantity} ${inventoryItem.unit || 'szt.'}`);
            }
          }
          
          console.log(`Przypisane partie dla materiału ${material.name}:`, assignedBatches);
          
          // 2. Odejmij ilości z przypisanych partii
          for (const batchAssignment of assignedBatches) {
            const batchRef = doc(db, 'inventoryBatches', batchAssignment.batchId);
            
            // Sprawdź, czy ilość do odjęcia jest większa od zera
            if (batchAssignment.quantity <= 0) {
              console.log(`Pomijam aktualizację partii ${batchAssignment.batchId} - ilość do odjęcia wynosi ${batchAssignment.quantity}`);
              continue;
            }
            
            console.log(`Aktualizacja partii ${batchAssignment.batchId} - odejmowanie ${batchAssignment.quantity}`);
            
            await updateDoc(batchRef, {
              quantity: increment(-batchAssignment.quantity),
              updatedAt: serverTimestamp()
            });
            
            // Dodaj transakcję dla każdej wykorzystanej partii
            const transactionRef = doc(collection(db, 'inventoryTransactions'));
            await setDoc(transactionRef, {
              itemId: inventoryMaterialId,
              itemName: material.name,
              type: 'issue',
              quantity: batchAssignment.quantity,
              date: serverTimestamp(),
              reason: 'Zużycie w produkcji',
              reference: `Zadanie: ${task.name || taskId}`,
              batchId: batchAssignment.batchId,
              batchNumber: batchAssignment.batchNumber,
              notes: `Materiał zużyty w zadaniu produkcyjnym: ${task.name || taskId}`,
              createdAt: serverTimestamp(),
              createdBy: userId || 'system',
              category: material.category || '-'
            });
          }
          
          // 3. Aktualizacja głównej pozycji magazynowej jest nadal potrzebna dla spójności danych,
          // ale teraz jest ona tylko konsekwencją zmian na poziomie partii, a nie oddzielną operacją
          // Pomaga to utrzymać zgodność sumy ilości partii z główną pozycją magazynową
          await recalculateItemQuantity(inventoryMaterialId);
          
          // 4. Zapisz informacje o wykorzystanych partiach w zadaniu
          if (!task.usedBatches) task.usedBatches = {};
          task.usedBatches[inventoryMaterialId] = assignedBatches;
          
          // 5. Anuluj rezerwację materiału, ponieważ został już zużyty
          try {
            // Sprawdź, czy przedmiot ma zarezerwowaną ilość
            if (inventoryItem.bookedQuantity && inventoryItem.bookedQuantity > 0) {
              // Anuluj rezerwację na podstawie faktycznego zużycia, a nie planowanej ilości
              // Używamy consumedQuantity zamiast material.quantity
              const bookingQuantity = consumedQuantity;
              
              console.log(`[DEBUG REZERWACJE] Przygotowanie do anulowania rezerwacji: materiał=${material.name}, ilość=${bookingQuantity}, bookedQuantity=${inventoryItem.bookedQuantity}`);
              
              // Anuluj rezerwację tylko jeśli jakąś ilość zarezerwowano
              if (bookingQuantity > 0) {
                console.log(`[DEBUG REZERWACJE] Wywołuję cancelBooking dla materiału ${material.name} z ilością ${bookingQuantity}`);
                await cancelBooking(inventoryMaterialId, bookingQuantity, taskId, task.createdBy || 'system');
                console.log(`[DEBUG REZERWACJE] Anulowano rezerwację ${bookingQuantity} ${inventoryItem.unit} materiału ${material.name} po zatwierdzeniu zużycia`);
              }
            } else {
              console.log(`[DEBUG REZERWACJE] Materiał ${material.name} nie ma zarezerwowanej ilości (bookedQuantity=${inventoryItem.bookedQuantity || 0})`);
            }
          } catch (error) {
            console.error(`[DEBUG REZERWACJE] Błąd przy anulowaniu rezerwacji materiału ${material.name}:`, error);
            // Kontynuuj mimo błędu anulowania rezerwacji
          }
        }
      }
      
      console.log("[DEBUG REZERWACJE] Zakończono anulowanie rezerwacji, aktualizuję status zadania");
      
      // Oznacz zużycie jako potwierdzone i zapisz informacje o wykorzystanych partiach
      const updates = {
        materialConsumptionConfirmed: true,
        materialConsumptionDate: serverTimestamp(),
        materialConsumptionBy: userId || 'system',
        usedBatches: task.usedBatches || {},
        updatedAt: serverTimestamp(),
        updatedBy: userId || 'system'
      };
      
      // Zapisz w bazie danych
      await updateDoc(taskRef, updates);
      
      console.log("[DEBUG REZERWACJE] Zakończono potwierdzanie zużycia materiałów");
      
      return {
        success: true,
        message: 'Zużycie materiałów zostało potwierdzone. Stany magazynowe zostały zaktualizowane.',
        materialConsumptionConfirmed: true,
        materialConsumptionDate: updates.materialConsumptionDate,
        materialConsumptionBy: updates.materialConsumptionBy,
        usedBatches: updates.usedBatches
      };
    } catch (error) {
      console.error('Błąd podczas potwierdzania zużycia materiałów:', error);
      throw error;
    }
  };

  // Zarezerwowanie składników dla zadania
  export const reserveMaterialsForTask = async (taskId, userId, reservationMethod, selectedBatches = []) => {
    try {
      console.log(`[DEBUG] Rozpoczynam rezerwację materiałów dla zadania ${taskId}, metoda=${reservationMethod}`);
      
      // Pobierz dane zadania produkcyjnego
      const taskRef = doc(db, PRODUCTION_TASKS_COLLECTION, taskId);
      const taskDoc = await getDoc(taskRef);
      if (!taskDoc.exists()) {
        throw new Error(`Nie znaleziono zadania o ID: ${taskId}`);
      }
      
      const task = { id: taskDoc.id, ...taskDoc.data() };
      console.log("Pobrano zadanie:", task.moNumber || task.id);
      
      // Sprawdź, czy istnieją nowe materiały, które nie są jeszcze zarezerwowane
      const existingReservedMaterials = new Set();
      
      // Zbierz ID wszystkich już zarezerwowanych materiałów
      if (task.materialBatches) {
        Object.keys(task.materialBatches).forEach(materialId => {
          existingReservedMaterials.add(materialId);
        });
      }
      
      // Sprawdź, czy są nowe materiały do zarezerwowania
      let newMaterialsToReserve = [];
      
      if (task.requiredMaterials && task.requiredMaterials.length > 0) {
        newMaterialsToReserve = task.requiredMaterials.filter(material => {
          return material.id && !existingReservedMaterials.has(material.id);
        });
      } else if (task.materials && task.materials.length > 0) {
        newMaterialsToReserve = task.materials.filter(material => {
          const materialId = material.inventoryItemId || material.id;
          return materialId && !existingReservedMaterials.has(materialId);
        });
      }
      
      // Sprawdź, czy materiały są już zarezerwowane dla tego zadania i nie ma nowych materiałów
      if (task.materialsReserved && newMaterialsToReserve.length === 0) {
        console.log(`[DEBUG] Materiały dla zadania ${taskId} są już zarezerwowane i nie ma nowych materiałów. Pomijam ponowną rezerwację.`);
        return {
          success: true,
          message: 'Materiały są już zarezerwowane dla tego zadania',
          reservedItems: []
        };
      }
      
      // Jeśli są już zarezerwowane materiały, ale są też nowe do zarezerwowania
      if (task.materialsReserved && newMaterialsToReserve.length > 0) {
        console.log(`[DEBUG] Zadanie ma już zarezerwowane materiały, ale wykryto ${newMaterialsToReserve.length} nowych materiałów do zarezerwowania.`);
      }
      
      // Reszta kodu pozostaje bez zmian...

      // Jeśli nie ma wymaganych materiałów, nie rób nic
      if (!task.requiredMaterials || task.requiredMaterials.length === 0) {
        console.log("Brak wymaganych materiałów dla tego zadania.");
        
        // Sprawdź, czy są materiały w polu materials
        if (task.materials && task.materials.length > 0) {
          console.log("Znaleziono materiały w polu 'materials':", task.materials);
          // Utwórz requiredMaterials na podstawie pola materials
          const requiredMaterials = task.materials.map(material => ({
            id: material.inventoryItemId || material.id,
            name: material.name,
            quantity: material.quantity,
            unit: material.unit || 'szt.'
          }));
          
          // Zaktualizuj zadanie z requiredMaterials
          await updateDoc(taskRef, {
            requiredMaterials: requiredMaterials
          });
          
          console.log("Utworzono requiredMaterials na podstawie materials:", requiredMaterials);
          task.requiredMaterials = requiredMaterials;
        } else {
          return { success: true, message: "Brak materiałów do zarezerwowania" };
        }
      }

      // Pobierz aktualny stan rezerwacji
      let currentReservations = [];
      if (task.materialReservations && task.materialReservations.length > 0) {
        currentReservations = [...task.materialReservations];
        console.log("Istniejące rezerwacje materiałów:", currentReservations);
      }

      // Zainicjuj zmienne do śledzenia postępu i błędów
      let reservationsSuccess = false;
      let reservedItems = [];
      let errors = [];

      // Dla każdego wymaganego materiału
      for (const requiredMaterial of task.requiredMaterials) {
        // Jeśli zadanie ma już zarezerwowane materiały i ten materiał jest już zarezerwowany, pomiń go
        if (task.materialsReserved && existingReservedMaterials.has(requiredMaterial.id)) {
          console.log(`Materiał ${requiredMaterial.name} jest już zarezerwowany, pomijam.`);
          continue;
        }
        
        // Pomiń jeśli materiał jest już w pełni zarezerwowany
        const existingReservation = currentReservations.find(r => r.materialId === requiredMaterial.id);
        const alreadyReservedQty = existingReservation ? existingReservation.reservedQuantity : 0;
        
        // Zaokrąglij wymaganą ilość do 10 miejsc po przecinku
        const requiredQuantity = parseFloat(parseFloat(requiredMaterial.quantity).toFixed(10));
        
        // Oblicz ile jeszcze potrzeba zarezerwować
        let remainingToReserve = parseFloat((requiredQuantity - alreadyReservedQty).toFixed(10));
        
        if (remainingToReserve <= 0) {
          console.log(`Materiał ${requiredMaterial.name} jest już w pełni zarezerwowany.`);
          continue;
        }

        console.log(`Rezerwowanie materiału: ${requiredMaterial.name}, Wymagane: ${requiredQuantity}, 
                   Już zarezerwowane: ${alreadyReservedQty}, Pozostało do zarezerwowania: ${remainingToReserve}`);

        // Znajdź wybraną partię dla tego materiału
        let materialBatches = selectedBatches.filter(b => b.materialId === requiredMaterial.id);
        
        // Jeśli nie wybrano ręcznie partii, a metoda to FIFO lub expiry, pobierz dostępne partie automatycznie
        if (materialBatches.length === 0 && (reservationMethod === 'fifo' || reservationMethod === 'expiry')) {
          console.log(`Automatyczne wybieranie partii dla materiału ${requiredMaterial.name} metodą ${reservationMethod}`);
          
          // Pobierz dostępne partie dla tego materiału
          const batchesRef = collection(db, 'inventoryBatches');
          const q = query(
            batchesRef,
            where('itemId', '==', requiredMaterial.id),
            where('quantity', '>', 0)
          );
          
          const batchesSnapshot = await getDocs(q);
          if (batchesSnapshot.empty) {
            console.warn(`Brak dostępnych partii dla materiału: ${requiredMaterial.name}`);
            errors.push(`Brak dostępnych partii dla materiału: ${requiredMaterial.name}`);
            continue;
          }
          
          const availableBatches = batchesSnapshot.docs.map(doc => ({
            id: doc.id,
            batchId: doc.id,
            ...doc.data(),
            materialId: requiredMaterial.id
          }));
          
          console.log(`Znaleziono ${availableBatches.length} dostępnych partii dla materiału ${requiredMaterial.name}`);
          
          // Sortuj partie według metody rezerwacji
          if (reservationMethod === 'fifo') {
            availableBatches.sort((a, b) => {
              const dateA = a.createdAt ? (a.createdAt instanceof Timestamp ? a.createdAt.toDate() : new Date(a.createdAt)) : new Date(0);
              const dateB = b.createdAt ? (b.createdAt instanceof Timestamp ? b.createdAt.toDate() : new Date(b.createdAt)) : new Date(0);
              return dateA - dateB;
            });
          } else {
            // Według daty ważności (expiry)
            availableBatches.sort((a, b) => {
              const dateA = a.expiryDate ? new Date(a.expiryDate) : new Date(9999, 11, 31);
              const dateB = b.expiryDate ? new Date(b.expiryDate) : new Date(9999, 11, 31);
              return dateA - dateB;
            });
          }
          
          console.log(`Posortowane partie dla materiału ${requiredMaterial.name}:`, 
                      availableBatches.map(b => `${b.batchId} (${b.quantity || 0} ${requiredMaterial.unit || 'szt.'})`));
          
          // Dodaj partie do listy wybranych partii
          materialBatches = availableBatches;
        }
        
        if (materialBatches.length === 0) {
          console.warn(`Nie wybrano partii dla materiału: ${requiredMaterial.name}`);
          errors.push(`Nie wybrano partii dla materiału: ${requiredMaterial.name}`);
          continue;
        }

        // Lista rezerwacji dla tego materiału
        let materialReservations = [];
        if (existingReservation && existingReservation.batches) {
          materialReservations = [...existingReservation.batches];
        }

        // Dla każdej wybranej partii
        for (const batch of materialBatches) {
          if (remainingToReserve <= 0) break;

          try {
            // Pobierz aktualny stan partii dla logowania
            const batchRef = doc(db, 'inventoryBatches', batch.batchId);
            const batchDoc = await getDoc(batchRef);
            if (!batchDoc.exists()) {
              console.error(`Nie znaleziono partii o ID: ${batch.batchId}`);
              errors.push(`Nie znaleziono partii o ID: ${batch.batchId}`);
              continue;
            }
            
            const batchData = batchDoc.data();
            const availableQty = batchData.quantity || 0;
            
            console.log(`Partia ${batch.batchId}, Dostępna ilość: ${availableQty} ${requiredMaterial.unit || 'szt.'}`);
            
            // Oblicz ile można zarezerwować z tej partii
            const toReserve = Math.min(remainingToReserve, availableQty);
            // Zaokrąglij rezerwowaną ilość do 10 miejsc po przecinku
            const reserveAmount = parseFloat(toReserve.toFixed(10));
            
            if (reserveAmount <= 0) {
              console.warn(`Partia ${batch.batchId} nie ma dostępnej ilości.`);
              continue;
            }
            
            console.log(`Rezerwowanie ${reserveAmount} ${requiredMaterial.unit || 'szt.'} z partii ${batch.batchId}`);
            
            // Użyj funkcji bookInventoryForTask z inventoryService
            const { bookInventoryForTask } = await import('../services/inventoryService');
            const bookingResult = await bookInventoryForTask(
              requiredMaterial.id,
              reserveAmount,
              taskId,
              userId || 'system',
              reservationMethod,
              batch.batchId
            );
            
            console.log(`Wynik rezerwacji partii ${batch.batchId}:`, bookingResult);
            
            if (bookingResult.success) {
              try {
                // Uwzględnij informacje z bookInventoryForTask
                if (bookingResult.reservedBatches && bookingResult.reservedBatches.length > 0) {
                  // Upewnij się, że mamy numery partii
                  const enhancedBatches = bookingResult.reservedBatches.map(reservedBatch => {
                    // Jeśli nie ma batchNumber, spróbuj pobrać z batchData
                    if (!reservedBatch.batchNumber && batchData) {
                      return {
                        ...reservedBatch,
                        batchNumber: batchData.batchNumber || batchData.lotNumber || `Partia ${reservedBatch.batchId.substring(0, 6)}`
                      };
                    }
                    return reservedBatch;
                  });
                  
                  materialReservations.push(...enhancedBatches);
                }
              } catch (batchError) {
                console.error('Błąd podczas przetwarzania informacji o partiach:', batchError);
              }
              
              remainingToReserve = parseFloat((remainingToReserve - reserveAmount).toFixed(3));
              console.log(`Zarezerwowano ${reserveAmount} z partii ${batchData.batchNumber || batch.batchId}, 
                         Pozostało do zarezerwowania: ${remainingToReserve}`);
                         
              // Dodaj do listy zarezerwowanych materiałów
              reservedItems.push({
                materialId: requiredMaterial.id,
                itemId: requiredMaterial.id, // Dodaję itemId, ponieważ czasem używamy tego pola
                name: requiredMaterial.name,
                batchId: batch.batchId,
                batchNumber: batchData.batchNumber || batchData.lotNumber || `Partia ${batch.batchId.substring(0, 6)}`,
                quantity: reserveAmount
              });
              
              reservationsSuccess = true;
            } else {
              console.error(`Błąd rezerwacji partii ${batch.batchId}:`, bookingResult.message || 'Nieznany błąd');
              errors.push(bookingResult.message || `Nie można zarezerwować partii ${batch.batchId}`);
            }
          } catch (error) {
            console.error(`Błąd podczas rezerwacji partii ${batch.batchId}:`, error);
            errors.push(error.message || `Nieznany błąd podczas rezerwacji partii ${batch.batchId}`);
          }
        }
      }

      // Aktualizuj zadanie z informacjami o rezerwacjach
      console.log("[DEBUG] Aktualizacja zadania z rezerwacjami:", JSON.stringify(currentReservations));
      
      // Przygotuj materialBatches do aktualizacji
      let materialBatches = {};
      
      // Jeśli zadanie ma już zarezerwowane materiały, zachowaj istniejące rezerwacje partii
      if (task.materialsReserved && task.materialBatches) {
        materialBatches = { ...task.materialBatches };
      }
      
      // Dodaj nowe rezerwacje partii
      for (const item of reservedItems) {
        if (item.batches && item.batches.length > 0) {
          if (!materialBatches[item.materialId]) {
            materialBatches[item.materialId] = [];
          }
          
          // Dla każdej partii wybranej dla tego materiału
          for (const batch of item.batches) {
            // Dodaj partię do listy, tylko jeśli nie jest już dodana
            const alreadyExists = materialBatches[item.materialId].some(
              existing => existing.batchId === batch.batchId
            );
            
            if (!alreadyExists) {
              materialBatches[item.materialId].push({
                batchId: batch.batchId,
                quantity: batch.quantity,
                batchNumber: batch.batchNumber
              });
            }
          }
        }
      }
      
      // Jeśli z jakiegoś powodu materialBatches jest nadal puste, ale mamy reservedItems,
      // zbudujmy materialBatches na podstawie reservedItems
      if (Object.keys(materialBatches).length === 0 && reservedItems.length > 0) {
        console.log("[DEBUG] Odtwarzanie materialBatches z reservedItems");
        for (const item of reservedItems) {
          if (!materialBatches[item.materialId]) {
            materialBatches[item.materialId] = [];
          }
          materialBatches[item.materialId].push({
            batchId: item.batchId,
            quantity: item.quantity,
            batchNumber: item.batchNumber
          });
          console.log(`[DEBUG] Dodano partię do ${item.name}:`, JSON.stringify(materialBatches[item.materialId]));
        }
      }
      
      console.log("[DEBUG] Przygotowane materialBatches do aktualizacji:", JSON.stringify(materialBatches));
      
      // Ustaw materialsReserved na true tylko jeśli wszystkie materiały zostały zarezerwowane
      // lub jeśli było to już ustawione wcześniej
      const allMaterialsReserved = task.materialsReserved || 
        (task.requiredMaterials.length === reservedItems.length + existingReservedMaterials.size);
      
      await updateDoc(taskRef, {
        materialReservations: currentReservations,
        materialsReserved: allMaterialsReserved,
        reservationComplete: allMaterialsReserved,
        materialBatches: materialBatches  // Dodajemy aktualizację materialBatches
      });
      
      console.log("[DEBUG] Zakończono aktualizację zadania z materialBatches");

      if (errors.length > 0) {
        return { 
          success: reservationsSuccess, 
          message: reservationsSuccess 
            ? "Materiały zostały częściowo zarezerwowane" 
            : "Wystąpiły problemy podczas rezerwowania materiałów",
          reservedItems,
          errors
        };
      }

      return { success: true, message: "Materiały zostały zarezerwowane", reservedItems };
    } catch (error) {
      console.error("Błąd podczas rezerwowania materiałów:", error);
      return { success: false, message: "Wystąpił błąd podczas rezerwowania materiałów", error };
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
  export const stopProduction = async (taskId, completedQuantity, timeSpent, userId, timeInfo = null) => {
    const taskRef = doc(db, PRODUCTION_TASKS_COLLECTION, taskId);
    const taskDoc = await getDoc(taskRef);
    const task = taskDoc.data();
    
    // Pobierz aktualną sesję produkcyjną
    const productionSessions = task.productionSessions || [];
    
    // Dodaj nową sesję
    const newSession = {
      // Jeśli przekazano timeInfo, użyj dokładnych dat, w przeciwnym razie użyj poprzedniej logiki
      startDate: timeInfo?.startTime || task.startDate,
      endDate: timeInfo?.endTime || new Date().toISOString(),
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
      
      // USUNIĘTO: automatyczne anulowanie rezerwacji po zakończeniu zadania
      // Rezerwacje będą anulowane dopiero po potwierdzeniu zużycia materiałów
      // Materiały pozostają zarezerwowane, dopóki użytkownik nie potwierdzi ich zużycia
      console.log(`Zadanie ${taskId} zostało zakończone. Rezerwacje materiałów pozostają aktywne do momentu potwierdzenia zużycia.`);
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
    const productionSessions = task.productionSessions || [];
    
    // Tworzymy wpisy w kolekcji productionHistory jeśli nie istnieją
    // i upewniamy się, że zawierają wszystkie potrzebne dane
    const historyCollectionRef = collection(db, 'productionHistory');
    const historyItems = [];
    
    // Dla każdej sesji, sprawdź czy istnieje już w kolekcji productionHistory
    for (const [index, session] of productionSessions.entries()) {
      // Tworzymy unikalny identyfikator na podstawie ID zadania i indeksu sesji
      // (dla zapewnienia kompatybilności z istniejącymi danymi)
      const sessionId = `${taskId}_session_${index}`;
      
      // Sprawdzamy czy wpis już istnieje
      const historyDocRef = doc(db, 'productionHistory', sessionId);
      const historyDoc = await getDoc(historyDocRef);
      
      let historyItem;
      
      if (historyDoc.exists()) {
        // Pobierz istniejący dokument
        historyItem = {
          id: historyDoc.id,
          ...historyDoc.data()
        };
      } else {
        // Utwórz nowy dokument w kolekcji productionHistory
        const newHistoryItem = {
          taskId,
          sessionIndex: index,
          startTime: session.startDate,
          endTime: session.endDate,
          timeSpent: session.timeSpent,
          quantity: session.completedQuantity,
          userId: session.createdBy,
          createdAt: serverTimestamp()
        };
        
        // Zapisz w bazie danych
        await setDoc(doc(db, 'productionHistory', sessionId), newHistoryItem);
        
        historyItem = {
          id: sessionId,
          ...newHistoryItem
        };
      }
      
      historyItems.push(historyItem);
    }
    
    return historyItems;
  };

  // Funkcja do aktualizacji sesji produkcyjnej
  export const updateProductionSession = async (sessionId, updateData, userId) => {
    try {
      // Pobierz aktualne dane sesji
      const sessionRef = doc(db, 'productionHistory', sessionId);
      const sessionDoc = await getDoc(sessionRef);
      
      if (!sessionDoc.exists()) {
        throw new Error('Sesja produkcyjna nie istnieje');
      }
      
      const sessionData = sessionDoc.data();
      const taskId = sessionData.taskId;
      const sessionIndex = sessionData.sessionIndex;
      
      // Pobierz dane zadania
      const taskRef = doc(db, PRODUCTION_TASKS_COLLECTION, taskId);
      const taskDoc = await getDoc(taskRef);
      
      if (!taskDoc.exists()) {
        throw new Error('Zadanie produkcyjne nie istnieje');
      }
      
      const task = taskDoc.data();
      const productionSessions = [...(task.productionSessions || [])];
      
      // Sprawdź czy sesja istnieje w tablicy sesji zadania
      if (!productionSessions[sessionIndex]) {
        throw new Error('Sesja produkcyjna nie została znaleziona w zadaniu');
      }
      
      // Aktualizuj dane w dokumencie productionHistory
      await updateDoc(sessionRef, {
        ...updateData,
        updatedAt: serverTimestamp(),
        updatedBy: userId
      });
      
      // Aktualizuj dane w tablicy sesji zadania
      productionSessions[sessionIndex] = {
        ...productionSessions[sessionIndex],
        startDate: updateData.startTime,
        endDate: updateData.endTime,
        timeSpent: updateData.timeSpent,
        completedQuantity: updateData.quantity
      };
      
      // Oblicz całkowitą wyprodukowaną ilość
      const totalCompletedQuantity = productionSessions.reduce(
        (sum, session) => sum + (session.completedQuantity || 0), 
        0
      );
      
      // Aktualizuj zadanie produkcyjne
      await updateDoc(taskRef, {
        productionSessions,
        totalCompletedQuantity,
        updatedAt: serverTimestamp(),
        updatedBy: userId
      });
      
      return {
        success: true,
        message: 'Sesja produkcyjna została zaktualizowana'
      };
    } catch (error) {
      console.error('Błąd podczas aktualizacji sesji produkcyjnej:', error);
      throw error;
    }
  };

  // Funkcja do ręcznego dodawania sesji produkcyjnej
  export const addProductionSession = async (taskId, sessionData) => {
    try {
      // Pobierz dane zadania
      const taskRef = doc(db, PRODUCTION_TASKS_COLLECTION, taskId);
      const taskDoc = await getDoc(taskRef);
      
      if (!taskDoc.exists()) {
        throw new Error('Zadanie produkcyjne nie istnieje');
      }
      
      const task = taskDoc.data();
      const productionSessions = [...(task.productionSessions || [])];
      
      // Dodaj nową sesję produkcyjną
      const newSession = {
        startDate: sessionData.startTime,
        endDate: sessionData.endTime,
        completedQuantity: sessionData.quantity,
        timeSpent: sessionData.timeSpent,
        createdBy: sessionData.userId,
        createdAt: new Date().toISOString() // Używamy zwykłej daty zamiast serverTimestamp()
      };
      
      productionSessions.push(newSession);
      
      // Oblicz całkowitą wyprodukowaną ilość
      const totalCompletedQuantity = productionSessions.reduce(
        (sum, session) => sum + (parseFloat(session.completedQuantity) || 0), 
        0
      );
      
      // Aktualizuj zadanie produkcyjne
      await updateDoc(taskRef, {
        productionSessions,
        totalCompletedQuantity,
        updatedAt: serverTimestamp(),
        updatedBy: sessionData.userId
      });
      
      // Dodaj wpis w kolekcji productionHistory
      const sessionId = `${taskId}_session_${productionSessions.length - 1}`;
      const historyItem = {
        taskId,
        sessionIndex: productionSessions.length - 1,
        startTime: sessionData.startTime,
        endTime: sessionData.endTime,
        timeSpent: sessionData.timeSpent,
        quantity: sessionData.quantity,
        userId: sessionData.userId,
        createdAt: serverTimestamp()
      };
      
      await setDoc(doc(db, 'productionHistory', sessionId), historyItem);
      
      // Zwróć dane
      return {
        success: true,
        message: 'Sesja produkcyjna została dodana',
        sessionId
      };
    } catch (error) {
      console.error('Błąd podczas dodawania sesji produkcyjnej:', error);
      throw error;
    }
  };

  // Generuje raport materiałów i LOTów dla zlecenia produkcyjnego (MO)
  export const generateMaterialsAndLotsReport = async (taskId) => {
    try {
      if (!taskId) {
        throw new Error('Nie podano ID zadania produkcyjnego');
      }
      
      // Pobierz dane zadania produkcyjnego
      const task = await getTaskById(taskId);
      
      if (!task) {
        throw new Error('Nie znaleziono zadania produkcyjnego');
      }

      // Pobierz szczegółowe dane partii dla wszystkich materiałów
      const batchesDetails = {};
      const materialIds = [];
      const inventoryItemsDetails = {}; // Dodaj obiekt do przechowywania szczegółów elementów inwentarza

      // Zbierz wszystkie ID materiałów
      if (task.materials && task.materials.length > 0) {
        for (const material of task.materials) {
          const materialId = material.inventoryItemId || material.id;
          if (materialId) {
            materialIds.push(materialId);
          }
        }
      }
      
      // Pobierz szczegóły partii i elementów inwentarza dla wszystkich materiałów
      if (materialIds.length > 0) {
        const { collection, query, where, getDocs, doc, getDoc } = await import('firebase/firestore');
        
        // Pobierz szczegóły elementów inwentarza
        for (const materialId of materialIds) {
          try {
            const itemRef = doc(db, 'inventory', materialId);
            const itemSnap = await getDoc(itemRef);
            
            if (itemSnap.exists()) {
              inventoryItemsDetails[materialId] = itemSnap.data();
            }
          } catch (error) {
            console.error(`Błąd podczas pobierania szczegółów elementu inwentarza ${materialId}:`, error);
          }
        }

        // Pobierz wszystkie partie dla materiałów
        for (const materialId of materialIds) {
          // Pobierz partie dla danego materiału
          const batchesRef = collection(db, 'inventoryBatches');
          const q = query(batchesRef, where('itemId', '==', materialId));
          const batchesSnapshot = await getDocs(q);
          
          // Zapisz dane partii
          batchesDetails[materialId] = {};
          batchesSnapshot.docs.forEach(doc => {
            const batchData = doc.data();
            batchesDetails[materialId][doc.id] = {
              ...batchData,
              id: doc.id
            };
          });
        }
      }
      
      // Przygotuj wynik raportu
      const result = {
        task: {
          id: task.id,
          name: task.name,
          moNumber: task.moNumber,
          productName: task.productName,
          quantity: task.quantity,
          unit: task.unit,
          scheduledDate: task.scheduledDate,
          status: task.status
        },
        materials: []
      };
      
      // Przygotuj tabelę materiałów z aktualnymi cenami z partii
      if (task.materials && task.materials.length > 0) {
        // Kopiuj materiały do wyniku
        for (const material of task.materials) {
          const materialId = material.inventoryItemId || material.id;
          const materialBatches = task.materialBatches && task.materialBatches[materialId] || [];
          
          // Pobierz szczegóły materiału z inwentarza
          const inventoryDetails = inventoryItemsDetails[materialId] || {};
          
          // Oblicz średnią ważoną cenę jednostkową na podstawie zarezerwowanych partii
          let totalCost = 0;
          let totalQuantity = 0;
          let averageUnitPrice = 0;
          
          // Przelicz cenę tylko jeśli są zarezerwowane partie
          if (materialBatches.length > 0) {
            for (const batch of materialBatches) {
              // Pobierz aktualne dane partii (może zawierać zaktualizowaną cenę)
              const batchDetails = batch.batchId && batchesDetails[materialId] && batchesDetails[materialId][batch.batchId];
              
              // Użyj aktualnej ceny z bazy danych, jeśli jest dostępna
              const batchUnitPrice = batchDetails?.unitPrice || batch.unitPrice || 0;
              const batchQuantity = parseFloat(batch.quantity) || 0;
              
              totalCost += batchUnitPrice * batchQuantity;
              totalQuantity += batchQuantity;
            }
            
            // Oblicz średnią ważoną cenę
            if (totalQuantity > 0) {
              averageUnitPrice = totalCost / totalQuantity;
            }
          }
          
          // Dodaj materiał do wyniku
          result.materials.push({
            id: material.id,
            inventoryItemId: materialId,
            name: material.name,
            quantity: material.quantity,
            unit: material.unit || inventoryDetails.unit || 'szt.',
            category: material.category || inventoryDetails.category || '',
            // Użyj średniej ważonej ceny jeśli jest dostępna, w przeciwnym razie użyj ceny z materiału lub inwentarza
            unitPrice: averageUnitPrice || material.unitPrice || inventoryDetails.unitPrice || 0,
            // Dodaj informację o partiach
            batches: materialBatches,
            // Dodaj informację, czy materiał jest dostępny
            available: materialBatches.length > 0,
            // Dodaj informację, czy materiał ma być wliczany do kosztów
            includeInCosts: task.materialInCosts && task.materialInCosts[material.id] !== undefined 
                           ? task.materialInCosts[material.id] 
                           : true
          });
        }
      }
      
      // Przygotuj tabelę partii
      result.batches = {};
      
      if (task.materialBatches) {
        for (const [materialId, batches] of Object.entries(task.materialBatches)) {
          if (!result.batches[materialId]) {
            result.batches[materialId] = [];
          }
          
          for (const batch of batches) {
            // Pobierz aktualne dane partii z bazy danych
            const batchDetails = batch.batchId && batchesDetails[materialId] && batchesDetails[materialId][batch.batchId];
            
            // Merge data from batch reservation with current batch details
            result.batches[materialId].push({
              batchId: batch.batchId,
              batchNumber: batch.batchNumber || batchDetails?.batchNumber || 'Brak numeru',
              quantity: batch.quantity,
              expiryDate: batchDetails?.expiryDate || batch.expiryDate,
              // Użyj aktualnej ceny z bazy danych, jeśli jest dostępna
              unitPrice: batchDetails?.unitPrice || batch.unitPrice || 0
            });
          }
        }
      }
      
      // Oblicz łączny koszt materiałów uwzględniając tylko te, które mają być wliczane do kosztów
      let totalMaterialCost = 0;
      for (const material of result.materials) {
        if (material.includeInCosts && material.batches && material.batches.length > 0) {
          const cost = material.quantity * material.unitPrice;
          material.cost = cost;
          totalMaterialCost += cost;
        } else {
          material.cost = 0;
        }
      }
      
      // Koszt materiałów na jednostkę produktu
      const unitMaterialCost = task.quantity > 0 ? totalMaterialCost / task.quantity : 0;
      
      // Dodaj podsumowanie kosztów
      result.totalMaterialCost = totalMaterialCost;
      result.unitMaterialCost = unitMaterialCost;
      
      return result;
    } catch (error) {
      console.error('Błąd podczas generowania raportu materiałów i LOT-ów:', error);
      throw error;
    }
  };

  // Zapisuje plan mieszań jako checklistę w zadaniu produkcyjnym
  export const saveProductionMixingPlan = async (taskId, mixingPlan, userId) => {
    try {
      if (!taskId) {
        throw new Error('Nie podano ID zadania produkcyjnego');
      }
      
      // Pobierz referencję do dokumentu zadania
      const taskRef = doc(db, PRODUCTION_TASKS_COLLECTION, taskId);
      const taskDoc = await getDoc(taskRef);
      
      if (!taskDoc.exists()) {
        throw new Error('Nie znaleziono zadania produkcyjnego');
      }
      
      // Przygotuj elementy checklisty na podstawie planu mieszań
      const checklistItems = [];
      
      mixingPlan.forEach(mixing => {
        // Dodaj nagłówek mieszania
        const headerItem = {
          id: `mixing-${mixing.mixingNumber}`,
          type: 'header',
          text: `Mieszanie nr ${mixing.mixingNumber}`,
          details: `Objętość: ${mixing.volumeToMix.toFixed(4)} kg${mixing.piecesCount ? `, Liczba sztuk: ${mixing.piecesCount}` : ''}`,
          completed: false,
          createdAt: new Date().toISOString(),
          createdBy: userId
        };
        
        checklistItems.push(headerItem);
        
        // Dodaj składniki jako elementy checklisty pod nagłówkiem
        mixing.ingredients.forEach((ingredient, index) => {
          // Pomijamy opakowania (dodatkowe zabezpieczenie)
          if (ingredient.name && !ingredient.name.includes('PACK')) {
            const ingredientItem = {
              id: `mixing-${mixing.mixingNumber}-ingredient-${index}`,
              type: 'ingredient',
              text: ingredient.name,
              details: `Ilość: ${ingredient.quantity.toFixed(4)} ${ingredient.unit}`,
              parentId: headerItem.id,
              completed: false,
              createdAt: new Date().toISOString(),
              createdBy: userId
            };
            
            checklistItems.push(ingredientItem);
          }
        });
        
        // Dodaj elementy sprawdzające dla każdego mieszania
        const checkItems = [
          {
            id: `mixing-${mixing.mixingNumber}-check-ingredients`,
            type: 'check',
            text: 'Sprawdzenie składników',
            parentId: headerItem.id,
            completed: false,
            createdAt: new Date().toISOString(),
            createdBy: userId
          },
          {
            id: `mixing-${mixing.mixingNumber}-add-to-mixer`,
            type: 'check',
            text: 'Dodane do mieszalnika',
            parentId: headerItem.id,
            completed: false,
            createdAt: new Date().toISOString(),
            createdBy: userId
          },
          {
            id: `mixing-${mixing.mixingNumber}-mixing-complete`,
            type: 'check',
            text: 'Mieszanie zakończone',
            parentId: headerItem.id,
            completed: false,
            createdAt: new Date().toISOString(),
            createdBy: userId
          }
        ];
        
        checklistItems.push(...checkItems);
      });
      
      // Przygotuj dane do aktualizacji
      const updateData = {
        mixingPlanChecklist: checklistItems,
        updatedAt: serverTimestamp(),
        updatedBy: userId
      };
      
      // Zapisz checklistę w zadaniu
      await updateDoc(taskRef, updateData);
      
      return {
        success: true,
        message: 'Plan mieszań został zapisany w zadaniu produkcyjnym'
      };
    } catch (error) {
      console.error('Błąd podczas zapisywania planu mieszań:', error);
      throw error;
    }
  };

  // Aktualizuje koszty zadania produkcyjnego
  export const updateTaskCosts = async (taskId, costsData, userId) => {
    try {
      const taskRef = doc(db, PRODUCTION_TASKS_COLLECTION, taskId);
      
      // Przygotuj dane do aktualizacji
      const updatedData = {
        materialCost: costsData.materialCost || 0,
        unitMaterialCost: costsData.unitMaterialCost || 0,
        updatedAt: serverTimestamp(),
        updatedBy: userId
      };
      
      await updateDoc(taskRef, updatedData);
      
      return {
        success: true,
        message: 'Koszty zadania zostały zaktualizowane'
      };
    } catch (error) {
      console.error('Błąd podczas aktualizacji kosztów zadania:', error);
      throw error;
    }
  };

  // Funkcja do jednorazowej inicjalizacji brakujących pól kosztów w istniejących zadaniach
  export const initializeMissingCostFields = async (userId) => {
    try {
      const tasksRef = collection(db, PRODUCTION_TASKS_COLLECTION);
      const q = query(tasksRef);
      const querySnapshot = await getDocs(q);
      
      const updatedTasks = [];
      const failedTasks = [];
      
      console.log(`Znaleziono ${querySnapshot.docs.length} zadań produkcyjnych do sprawdzenia`);
      
      for (const doc of querySnapshot.docs) {
        try {
          const taskData = doc.data();
          const taskId = doc.id;
          
          // Sprawdź czy zadanie ma już pola kosztów
          const hasTotalMaterialCost = taskData.totalMaterialCost !== undefined;
          const hasUnitMaterialCost = taskData.unitMaterialCost !== undefined;
          const hasTotalFullProductionCost = taskData.totalFullProductionCost !== undefined;
          const hasUnitFullProductionCost = taskData.unitFullProductionCost !== undefined;
          const hasCostHistory = taskData.costHistory !== undefined;
          
          // Jeśli brakuje któregokolwiek pola, zaktualizuj zadanie
          if (!hasTotalMaterialCost || !hasUnitMaterialCost || !hasTotalFullProductionCost || !hasUnitFullProductionCost || !hasCostHistory) {
            console.log(`Inicjalizacja pól kosztów dla zadania ${taskId} (MO: ${taskData.moNumber || 'brak'})`);
            
            const updateData = {};
            
            if (!hasTotalMaterialCost) {
              updateData.totalMaterialCost = 0;
            }
            
            if (!hasUnitMaterialCost) {
              updateData.unitMaterialCost = 0;
            }
            
            if (!hasTotalFullProductionCost) {
              updateData.totalFullProductionCost = 0;
            }
            
            if (!hasUnitFullProductionCost) {
              updateData.unitFullProductionCost = 0;
            }
            
            if (!taskData.costLastUpdatedAt) {
              updateData.costLastUpdatedAt = serverTimestamp();
            }
            
            if (!taskData.costLastUpdatedBy) {
              updateData.costLastUpdatedBy = userId;
            }
            
                          if (!hasCostHistory) {
                updateData.costHistory = [{
                  timestamp: new Date().toISOString(), // Używamy ISO string zamiast serverTimestamp()
                  userId: userId,
                  userName: 'System',
                  previousTotalCost: 0,
                  newTotalCost: updateData.totalMaterialCost || taskData.totalMaterialCost || 0,
                  previousUnitCost: 0,
                  newUnitCost: updateData.unitMaterialCost || taskData.unitMaterialCost || 0,
                  previousFullProductionCost: 0,
                  newFullProductionCost: updateData.totalFullProductionCost || taskData.totalFullProductionCost || 0,
                  previousUnitFullProductionCost: 0,
                  newUnitFullProductionCost: updateData.unitFullProductionCost || taskData.unitFullProductionCost || 0,
                  reason: 'Migracja danych - inicjalizacja pól kosztów'
                }];
              }
            
            // Wykonaj aktualizację tylko jeśli są jakieś pola do zaktualizowania
            if (Object.keys(updateData).length > 0) {
              await updateDoc(doc(db, PRODUCTION_TASKS_COLLECTION, taskId), updateData);
              updatedTasks.push(taskId);
            }
          }
        } catch (error) {
          console.error(`Błąd podczas aktualizacji zadania ${doc.id}:`, error);
          failedTasks.push(doc.id);
        }
      }
      
      return {
        success: true,
        message: `Zaktualizowano pola kosztów dla ${updatedTasks.length} zadań. Nie udało się zaktualizować ${failedTasks.length} zadań.`,
        updatedTasks,
        failedTasks
      };
    } catch (error) {
      console.error('Błąd podczas inicjalizacji pól kosztów:', error);
      return {
        success: false,
        message: `Błąd podczas inicjalizacji pól kosztów: ${error.message}`,
        error: error.toString()
      };
    }
  };

  // Funkcja do usuwania sesji produkcyjnej
  export const deleteProductionSession = async (sessionId, userId) => {
    try {
      // Pobierz dane sesji produkcyjnej
      const sessionRef = doc(db, 'productionHistory', sessionId);
      const sessionDoc = await getDoc(sessionRef);
      
      if (!sessionDoc.exists()) {
        throw new Error('Sesja produkcyjna nie istnieje');
      }
      
      const sessionData = sessionDoc.data();
      const taskId = sessionData.taskId;
      const sessionIndex = sessionData.sessionIndex;
      
      // Pobierz dane zadania
      const taskRef = doc(db, PRODUCTION_TASKS_COLLECTION, taskId);
      const taskDoc = await getDoc(taskRef);
      
      if (!taskDoc.exists()) {
        throw new Error('Zadanie produkcyjne nie istnieje');
      }
      
      const task = taskDoc.data();
      
      // Upewnij się, że tablica sesji istnieje
      const productionSessions = [...(task.productionSessions || [])];
      
      // Sprawdź, czy sesja istnieje w tablicy sesji zadania
      if (!productionSessions[sessionIndex]) {
        throw new Error('Sesja produkcyjna nie została znaleziona w zadaniu');
      }
      
      // Usuń sesję z tablicy produkcyjnej
      productionSessions.splice(sessionIndex, 1);
      
      // Oblicz całkowitą wyprodukowaną ilość
      const totalCompletedQuantity = productionSessions.reduce(
        (sum, session) => sum + (parseFloat(session.completedQuantity) || 0), 
        0
      );
      
      // Aktualizuj zadanie produkcyjne
      await updateDoc(taskRef, {
        productionSessions,
        totalCompletedQuantity,
        updatedAt: serverTimestamp(),
        updatedBy: userId
      });
      
      // Usuń dokument z kolekcji productionHistory
      await deleteDoc(sessionRef);
      
      // Zaktualizuj indeksy pozostałych sesji w kolekcji productionHistory
      for (let i = sessionIndex; i < productionSessions.length; i++) {
        const oldSessionId = `${taskId}_session_${i + 1}`;
        const newSessionId = `${taskId}_session_${i}`;
        
        // Sprawdź czy istnieje dokument sesji o starym indeksie
        const oldSessionRef = doc(db, 'productionHistory', oldSessionId);
        const oldSessionDoc = await getDoc(oldSessionRef);
        
        if (oldSessionDoc.exists()) {
          // Stwórz nowy dokument sesji z zaktualizowanym indeksem
          const oldSessionData = oldSessionDoc.data();
          await setDoc(doc(db, 'productionHistory', newSessionId), {
            ...oldSessionData,
            sessionIndex: i
          });
          
          // Usuń stary dokument sesji
          await deleteDoc(oldSessionRef);
        }
      }
      
      return {
        success: true,
        message: 'Sesja produkcyjna została usunięta'
      };
    } catch (error) {
      console.error('Błąd podczas usuwania sesji produkcyjnej:', error);
      throw error;
    }
  };

  // Zmodyfikowana funkcja do pobierania receptury dla zadania
  export const fetchRecipeByTaskId = async (taskId) => {
    try {
      // Pobierz zadanie
      const taskDoc = await getTaskById(taskId);
      
      if (!taskDoc || !taskDoc.recipeId) {
        throw new Error('Zadanie nie istnieje lub nie ma przypisanej receptury');
      }
      
      // Importuj funkcje z recipeService
      const { getRecipeById } = await import('./recipeService');
      
      // Pobierz recepturę
      const recipe = await getRecipeById(taskDoc.recipeId);
      
      return {
        taskId,
        recipeId: taskDoc.recipeId,
        recipe
      };
    } catch (error) {
      console.error('Błąd podczas pobierania receptury dla zadania:', error);
      throw error;
    }
  };
