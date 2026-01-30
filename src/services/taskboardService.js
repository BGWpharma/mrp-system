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
  Timestamp,
  arrayUnion,
  arrayRemove
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

// ===== BOARD ACCESS MANAGEMENT =====

/**
 * Sprawdza czy użytkownik ma dostęp do tablicy
 * @param {string} boardId - ID tablicy
 * @param {string} userId - ID użytkownika
 * @returns {Promise<boolean>} - Czy użytkownik ma dostęp
 */
export const canAccessBoard = async (boardId, userId) => {
  try {
    const board = await getBoard(boardId);
    if (!board) return false;
    
    // Główna tablica jest dostępna dla wszystkich
    if (board.isMainBoard) return true;
    
    // Publiczne tablice są dostępne dla wszystkich
    if (!board.isPrivate) return true;
    
    // Właściciel ma zawsze dostęp
    if (board.createdBy === userId) return true;
    
    // Sprawdź czy użytkownik jest na liście dozwolonych
    return board.allowedUsers?.includes(userId) || false;
  } catch (error) {
    console.error('Błąd podczas sprawdzania dostępu do tablicy:', error);
    return false;
  }
};

/**
 * Pobiera tablice dostępne dla użytkownika
 * @param {string} userId - ID użytkownika
 * @returns {Promise<Array>} - Lista dostępnych tablic
 */
export const getAccessibleBoards = async (userId) => {
  try {
    const allBoards = await getAllBoards();
    
    return allBoards.filter(board => {
      // Główna tablica jest dostępna dla wszystkich
      if (board.isMainBoard) return true;
      
      // Publiczne tablice są dostępne dla wszystkich
      if (!board.isPrivate) return true;
      
      // Właściciel ma zawsze dostęp
      if (board.createdBy === userId) return true;
      
      // Sprawdź czy użytkownik jest na liście dozwolonych
      return board.allowedUsers?.includes(userId) || false;
    });
  } catch (error) {
    console.error('Błąd podczas pobierania dostępnych tablic:', error);
    throw error;
  }
};

/**
 * Ustawia prywatność tablicy
 * @param {string} boardId - ID tablicy
 * @param {boolean} isPrivate - Czy tablica ma być prywatna
 * @param {string} userId - ID użytkownika wykonującego akcję (musi być właścicielem)
 * @returns {Promise<void>}
 */
export const setBoardPrivacy = async (boardId, isPrivate, userId) => {
  try {
    const board = await getBoard(boardId);
    
    if (!board) {
      throw new Error('Tablica nie istnieje');
    }
    
    // Tylko właściciel może zmienić prywatność
    if (board.createdBy !== userId) {
      throw new Error('Tylko właściciel może zmienić prywatność tablicy');
    }
    
    // Główna tablica nie może być prywatna
    if (board.isMainBoard) {
      throw new Error('Główna tablica nie może być prywatna');
    }
    
    const boardRef = doc(db, 'boards', boardId);
    await updateDoc(boardRef, {
      isPrivate: isPrivate,
      updatedAt: Timestamp.fromDate(new Date()),
    });
  } catch (error) {
    console.error('Błąd podczas zmiany prywatności tablicy:', error);
    throw error;
  }
};

/**
 * Dodaje użytkownika do listy osób z dostępem do tablicy
 * @param {string} boardId - ID tablicy
 * @param {string} userIdToAdd - ID użytkownika do dodania
 * @param {string} ownerId - ID właściciela tablicy
 * @returns {Promise<void>}
 */
export const addUserToBoard = async (boardId, userIdToAdd, ownerId) => {
  try {
    const board = await getBoard(boardId);
    
    if (!board) {
      throw new Error('Tablica nie istnieje');
    }
    
    // Tylko właściciel może zarządzać dostępem
    if (board.createdBy !== ownerId) {
      throw new Error('Tylko właściciel może zarządzać dostępem do tablicy');
    }
    
    // Główna tablica jest zawsze publiczna
    if (board.isMainBoard) {
      throw new Error('Główna tablica jest zawsze dostępna dla wszystkich');
    }
    
    const boardRef = doc(db, 'boards', boardId);
    await updateDoc(boardRef, {
      allowedUsers: arrayUnion(userIdToAdd),
      updatedAt: Timestamp.fromDate(new Date()),
    });
  } catch (error) {
    console.error('Błąd podczas dodawania użytkownika do tablicy:', error);
    throw error;
  }
};

/**
 * Usuwa użytkownika z listy osób z dostępem do tablicy
 * @param {string} boardId - ID tablicy
 * @param {string} userIdToRemove - ID użytkownika do usunięcia
 * @param {string} ownerId - ID właściciela tablicy
 * @returns {Promise<void>}
 */
export const removeUserFromBoard = async (boardId, userIdToRemove, ownerId) => {
  try {
    const board = await getBoard(boardId);
    
    if (!board) {
      throw new Error('Tablica nie istnieje');
    }
    
    // Tylko właściciel może zarządzać dostępem
    if (board.createdBy !== ownerId) {
      throw new Error('Tylko właściciel może zarządzać dostępem do tablicy');
    }
    
    const boardRef = doc(db, 'boards', boardId);
    await updateDoc(boardRef, {
      allowedUsers: arrayRemove(userIdToRemove),
      updatedAt: Timestamp.fromDate(new Date()),
    });
  } catch (error) {
    console.error('Błąd podczas usuwania użytkownika z tablicy:', error);
    throw error;
  }
};

/**
 * Pobiera listę użytkowników z dostępem do tablicy
 * @param {string} boardId - ID tablicy
 * @returns {Promise<Array<string>>} - Lista ID użytkowników z dostępem
 */
export const getBoardAllowedUsers = async (boardId) => {
  try {
    const board = await getBoard(boardId);
    if (!board) return [];
    
    return board.allowedUsers || [];
  } catch (error) {
    console.error('Błąd podczas pobierania listy użytkowników tablicy:', error);
    throw error;
  }
};

/**
 * Sprawdza czy użytkownik jest właścicielem tablicy
 * @param {string} boardId - ID tablicy
 * @param {string} userId - ID użytkownika
 * @returns {Promise<boolean>} - Czy użytkownik jest właścicielem
 */
export const isBoardOwner = async (boardId, userId) => {
  try {
    const board = await getBoard(boardId);
    if (!board) return false;
    
    return board.createdBy === userId;
  } catch (error) {
    console.error('Błąd podczas sprawdzania właściciela tablicy:', error);
    return false;
  }
};
