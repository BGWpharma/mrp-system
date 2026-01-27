// src/services/taskboardService.js
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp
} from 'firebase/firestore';
import { db } from './firebase/config';

// ===== MAIN BOARD =====

const MAIN_BOARD_ID = 'main-board';

export const getOrCreateMainBoard = async () => {
  try {
    const boardRef = doc(db, 'boards', MAIN_BOARD_ID);
    const boardDoc = await getDoc(boardRef);
    
    if (boardDoc.exists()) {
      const data = boardDoc.data();
      return {
        id: boardDoc.id,
        ...data,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
        isMainBoard: true
      };
    }
    
    // Utwórz główną tablicę jeśli nie istnieje
    const { setDoc } = await import('firebase/firestore');
    const mainBoardData = {
      title: 'Main',
      description: 'Główna tablica dla całego zespołu',
      color: '#4ECDC4',
      icon: 'Dashboard',
      isMainBoard: true,
      createdAt: Timestamp.fromDate(new Date()),
      updatedAt: Timestamp.fromDate(new Date()),
    };
    
    await setDoc(boardRef, mainBoardData);
    
    // Utwórz domyślne kolumny
    const defaultColumns = [
      { title: 'Do zrobienia', position: 0 },
      { title: 'W trakcie', position: 1 },
      { title: 'Zrobione', position: 2 }
    ];
    
    for (const col of defaultColumns) {
      await addDoc(collection(db, 'columns'), {
        boardId: MAIN_BOARD_ID,
        title: col.title,
        position: col.position,
        createdAt: Timestamp.fromDate(new Date()),
        updatedAt: Timestamp.fromDate(new Date()),
      });
    }
    
    return {
      id: MAIN_BOARD_ID,
      ...mainBoardData,
      createdAt: new Date(),
      updatedAt: new Date(),
      isMainBoard: true
    };
  } catch (error) {
    console.error('Błąd podczas pobierania/tworzenia głównej tablicy:', error);
    throw error;
  }
};

export const isMainBoard = (boardId) => boardId === MAIN_BOARD_ID;

// ===== BOARDS =====

export const createBoard = async (boardData) => {
  try {
    const boardsRef = collection(db, 'boards');
    
    const docRef = await addDoc(boardsRef, {
      ...boardData,
      createdAt: Timestamp.fromDate(new Date()),
      updatedAt: Timestamp.fromDate(new Date()),
    });
    return docRef.id;
  } catch (error) {
    console.error('Błąd podczas tworzenia tablicy:', error);
    throw error;
  }
};

export const getAllBoards = async () => {
  try {
    const boardsRef = collection(db, 'boards');
    const q = query(
      boardsRef,
      orderBy('updatedAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    const boards = querySnapshot.docs.map((docSnapshot) => {
      const data = docSnapshot.data();
      return {
        id: docSnapshot.id,
        ...data,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
      };
    });
    
    return boards;
  } catch (error) {
    console.error('Błąd podczas pobierania tablic:', error);
    throw error;
  }
};

export const getBoard = async (boardId) => {
  try {
    const boardRef = doc(db, 'boards', boardId);
    const boardDoc = await getDoc(boardRef);
    
    if (!boardDoc.exists()) {
      return null;
    }
    
    const data = boardDoc.data();
    return {
      id: boardDoc.id,
      ...data,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date(),
    };
  } catch (error) {
    console.error('Błąd podczas pobierania tablicy:', error);
    throw error;
  }
};

export const updateBoard = async (boardId, boardData) => {
  try {
    const boardRef = doc(db, 'boards', boardId);
    
    await updateDoc(boardRef, {
      ...boardData,
      updatedAt: Timestamp.fromDate(new Date()),
    });
  } catch (error) {
    console.error('Błąd podczas aktualizacji tablicy:', error);
    throw error;
  }
};

export const deleteBoard = async (boardId) => {
  try {
    // Usuń wszystkie kolumny tablicy
    const columnsRef = collection(db, 'columns');
    const columnsQuery = query(columnsRef, where('boardId', '==', boardId));
    const columnsSnapshot = await getDocs(columnsQuery);
    
    const columnDeletePromises = columnsSnapshot.docs.map((docSnapshot) => 
      deleteDoc(docSnapshot.ref)
    );
    await Promise.all(columnDeletePromises);
    
    // Usuń wszystkie zadania tablicy
    const tasksRef = collection(db, 'tasks');
    const tasksQuery = query(tasksRef, where('boardId', '==', boardId));
    const tasksSnapshot = await getDocs(tasksQuery);
    
    const taskDeletePromises = tasksSnapshot.docs.map((docSnapshot) => 
      deleteDoc(docSnapshot.ref)
    );
    await Promise.all(taskDeletePromises);
    
    // Usuń samą tablicę
    const boardRef = doc(db, 'boards', boardId);
    await deleteDoc(boardRef);
  } catch (error) {
    console.error('Błąd podczas usuwania tablicy:', error);
    throw error;
  }
};

// ===== COLUMNS =====

export const createColumn = async (columnData) => {
  try {
    const columnsRef = collection(db, 'columns');
    
    const docRef = await addDoc(columnsRef, {
      ...columnData,
      createdAt: Timestamp.fromDate(new Date()),
      updatedAt: Timestamp.fromDate(new Date()),
    });
    return docRef.id;
  } catch (error) {
    console.error('Błąd podczas tworzenia kolumny:', error);
    throw error;
  }
};

export const getBoardColumns = async (boardId) => {
  try {
    const columnsRef = collection(db, 'columns');
    const q = query(
      columnsRef,
      where('boardId', '==', boardId),
      orderBy('position', 'asc')
    );
    
    const querySnapshot = await getDocs(q);
    const columns = querySnapshot.docs.map((docSnapshot) => {
      const data = docSnapshot.data();
      return {
        id: docSnapshot.id,
        ...data,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
      };
    });
    
    return columns;
  } catch (error) {
    console.error('Błąd podczas pobierania kolumn:', error);
    throw error;
  }
};

export const updateColumn = async (columnId, columnData) => {
  try {
    const columnRef = doc(db, 'columns', columnId);
    
    await updateDoc(columnRef, {
      ...columnData,
      updatedAt: Timestamp.fromDate(new Date()),
    });
  } catch (error) {
    console.error('Błąd podczas aktualizacji kolumny:', error);
    throw error;
  }
};

export const deleteColumn = async (columnId) => {
  try {
    // Usuń wszystkie zadania w kolumnie
    const tasksRef = collection(db, 'tasks');
    const tasksQuery = query(tasksRef, where('columnId', '==', columnId));
    const tasksSnapshot = await getDocs(tasksQuery);
    
    const taskDeletePromises = tasksSnapshot.docs.map((docSnapshot) => 
      deleteDoc(docSnapshot.ref)
    );
    await Promise.all(taskDeletePromises);
    
    // Usuń samą kolumnę
    const columnRef = doc(db, 'columns', columnId);
    await deleteDoc(columnRef);
  } catch (error) {
    console.error('Błąd podczas usuwania kolumny:', error);
    throw error;
  }
};

// ===== TASKS =====

export const createTask = async (taskData) => {
  try {
    const tasksRef = collection(db, 'tasks');
    
    const docRef = await addDoc(tasksRef, {
      ...taskData,
      dueDate: taskData.dueDate ? Timestamp.fromDate(taskData.dueDate) : null,
      completedAt: taskData.completedAt ? Timestamp.fromDate(taskData.completedAt) : null,
      createdAt: Timestamp.fromDate(new Date()),
      updatedAt: Timestamp.fromDate(new Date()),
    });
    return docRef.id;
  } catch (error) {
    console.error('Błąd podczas tworzenia zadania:', error);
    throw error;
  }
};

export const getColumnTasks = async (columnId) => {
  try {
    const tasksRef = collection(db, 'tasks');
    const q = query(
      tasksRef,
      where('columnId', '==', columnId),
      orderBy('position', 'asc')
    );
    
    const querySnapshot = await getDocs(q);
    const tasks = querySnapshot.docs.map((docSnapshot) => {
      const data = docSnapshot.data();
      return {
        id: docSnapshot.id,
        ...data,
        dueDate: data.dueDate?.toDate(),
        completedAt: data.completedAt?.toDate(),
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
        workStartTime: data.workStartTime?.toDate(),
        workEndTime: data.workEndTime?.toDate(),
      };
    });
    
    return tasks;
  } catch (error) {
    console.error('Błąd podczas pobierania zadań:', error);
    throw error;
  }
};

export const getBoardTasks = async (boardId) => {
  try {
    const tasksRef = collection(db, 'tasks');
    const q = query(
      tasksRef,
      where('boardId', '==', boardId),
      orderBy('position', 'asc')
    );
    
    const querySnapshot = await getDocs(q);
    const tasks = querySnapshot.docs.map((docSnapshot) => {
      const data = docSnapshot.data();
      return {
        id: docSnapshot.id,
        ...data,
        dueDate: data.dueDate?.toDate(),
        completedAt: data.completedAt?.toDate(),
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date(),
        workStartTime: data.workStartTime?.toDate(),
        workEndTime: data.workEndTime?.toDate(),
      };
    });
    
    return tasks;
  } catch (error) {
    console.error('Błąd podczas pobierania zadań tablicy:', error);
    throw error;
  }
};

export const updateTask = async (taskId, taskData) => {
  try {
    const taskRef = doc(db, 'tasks', taskId);
    const updateData = {
      updatedAt: Timestamp.fromDate(new Date()),
    };
    
    // Iteruj przez wszystkie pola i dodaj je do updateData
    Object.keys(taskData).forEach((key) => {
      const value = taskData[key];
      
      // Konwertuj daty na Timestamp
      if (key === 'dueDate' && value) {
        updateData[key] = Timestamp.fromDate(value);
      } else if (key === 'completedAt' && value) {
        updateData[key] = Timestamp.fromDate(value);
      } else if (key === 'workStartTime' && value) {
        updateData[key] = Timestamp.fromDate(value);
      } else if (key === 'workEndTime' && value) {
        updateData[key] = Timestamp.fromDate(value);
      } else if (value !== null && value !== undefined) {
        updateData[key] = value;
      }
    });
    
    await updateDoc(taskRef, updateData);
  } catch (error) {
    console.error('Błąd podczas aktualizacji zadania:', error);
    throw error;
  }
};

export const deleteTask = async (taskId) => {
  try {
    const taskRef = doc(db, 'tasks', taskId);
    await deleteDoc(taskRef);
  } catch (error) {
    console.error('Błąd podczas usuwania zadania:', error);
    throw error;
  }
};

export const moveTask = async (taskId, newColumnId, newPosition) => {
  try {
    const taskRef = doc(db, 'tasks', taskId);
    await updateDoc(taskRef, {
      columnId: newColumnId,
      position: newPosition,
      updatedAt: Timestamp.fromDate(new Date()),
    });
  } catch (error) {
    console.error('Błąd podczas przenoszenia zadania:', error);
    throw error;
  }
};
