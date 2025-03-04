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
    Timestamp
  } from 'firebase/firestore';
  import { db } from './firebase/config';
  import { generateMONumber } from '../utils/numberGenerators';
  
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
    const taskRef = doc(db, PRODUCTION_TASKS_COLLECTION, taskId);
    
    const updates = {
      status,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    };
    
    // Dodaj daty odpowiadające statusom
    if (status === 'W trakcie') {
      updates.startedAt = serverTimestamp();
    } else if (status === 'Zakończone') {
      updates.completedAt = serverTimestamp();
    }
    
    await updateDoc(taskRef, updates);
    
    return {
      id: taskId,
      ...updates
    };
  };
  
  // Usuwanie zadania produkcyjnego
  export const deleteTask = async (taskId) => {
    const taskRef = doc(db, PRODUCTION_TASKS_COLLECTION, taskId);
    await deleteDoc(taskRef);
    
    return { success: true };
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