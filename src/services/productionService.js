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
    serverTimestamp 
  } from 'firebase/firestore';
  import { db } from './firebase/config';
  
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
    const q = query(
      tasksRef, 
      where('scheduledDate', '>=', startDate),
      where('scheduledDate', '<=', endDate),
      orderBy('scheduledDate', 'asc')
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
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
    const taskWithMeta = {
      ...taskData,
      createdBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      status: taskData.status || 'Zaplanowane'
    };
    
    const docRef = await addDoc(collection(db, PRODUCTION_TASKS_COLLECTION), taskWithMeta);
    
    return {
      id: docRef.id,
      ...taskWithMeta
    };
  };
  
  // Aktualizacja zadania produkcyjnego
  export const updateTask = async (taskId, taskData, userId) => {
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
    const tasksRef = collection(db, PRODUCTION_TASKS_COLLECTION);
    const q = query(
      tasksRef, 
      where('status', '==', status),
      orderBy('scheduledDate', 'asc')
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  };