// src/services/workTimeService.js
import { 
  collection, addDoc, getDocs, getDoc, doc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, Timestamp 
} from 'firebase/firestore';
import { db } from './firebase/config';

/**
 * Wyszukuje pracownika po indywidualnym ID pracownika (pole employeeId w kolekcji users)
 * @param {string} code - Indywidualny kod pracownika (np. BGW-001)
 * @returns {Promise<Object|null>} - Dane pracownika lub null
 */
export const getEmployeeByCode = async (code) => {
  try {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('employeeId', '==', code.toUpperCase().trim()));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) return null;
    
    const userDoc = snapshot.docs[0];
    return { id: userDoc.id, ...userDoc.data() };
  } catch (error) {
    console.error('Błąd podczas wyszukiwania pracownika po kodzie:', error);
    throw error;
  }
};

/**
 * Dodaje wpis czasu pracy (może być sam start — endTime opcjonalny)
 * @param {Object} data - Dane wpisu czasu pracy
 * @returns {Promise<DocumentReference>}
 */
export const addWorkTimeEntry = async (data) => {
  try {
    const entry = {
      employeeId: data.employeeId,
      userId: data.userId,
      employeeName: data.employeeName,
      date: Timestamp.fromDate(new Date(new Date().setHours(0, 0, 0, 0))),
      startTime: data.startTime,
      endTime: data.endTime || null,
      startDevice: data.startDevice || null,
      endDevice: null,
      totalHours: null,
      totalMinutes: null,
      status: data.endTime ? 'approved' : 'in_progress',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    // Oblicz czas tylko jeśli jest endTime
    if (data.startTime && data.endTime) {
      const [startH, startM] = data.startTime.split(':').map(Number);
      const [endH, endM] = data.endTime.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      const totalMinutes = endMinutes - startMinutes;
      entry.totalHours = Math.round((totalMinutes / 60) * 100) / 100;
      entry.totalMinutes = totalMinutes;
    }

    return await addDoc(collection(db, 'workTime'), entry);
  } catch (error) {
    console.error('Błąd podczas dodawania wpisu czasu pracy:', error);
    throw error;
  }
};

/**
 * Uzupełnia godzinę zakończenia w istniejącym wpisie (clock out)
 * @param {string} entryId - ID wpisu
 * @param {string} endTime - Godzina zakończenia (HH:mm)
 * @param {string} startTime - Godzina rozpoczęcia (HH:mm) — do obliczenia czasu
 * @returns {Promise<void>}
 */
export const clockOut = async (entryId, endTime, startTime, endDevice = null) => {
  try {
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    const totalMinutes = endMinutes - startMinutes;
    const totalHours = Math.round((totalMinutes / 60) * 100) / 100;

    const entryRef = doc(db, 'workTime', entryId);
    await updateDoc(entryRef, {
      endTime,
      endDevice,
      totalHours,
      totalMinutes,
      status: 'approved',
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Błąd podczas rejestracji wyjścia:', error);
    throw error;
  }
};

/**
 * Pobiera otwarty wpis (rozpoczęty, bez zakończenia) dla pracownika na dziś
 * @param {string} employeeId - ID pracownika
 * @returns {Promise<Object|null>}
 */
export const getOpenEntry = async (employeeId) => {
  try {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date();
    dayEnd.setHours(23, 59, 59, 999);

    const q = query(
      collection(db, 'workTime'),
      where('employeeId', '==', employeeId),
      where('date', '>=', Timestamp.fromDate(dayStart)),
      where('date', '<=', Timestamp.fromDate(dayEnd)),
      where('status', '==', 'in_progress')
    );

    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;

    const docSnap = snapshot.docs[0];
    return { id: docSnap.id, ...docSnap.data() };
  } catch (error) {
    console.error('Błąd podczas pobierania otwartego wpisu:', error);
    throw error;
  }
};

/**
 * Pobiera wpisy czasu pracy dla danego pracownika w danym miesiącu
 * @param {string} employeeId - ID pracownika
 * @param {number} month - Miesiąc (0-11)
 * @param {number} year - Rok
 * @returns {Promise<Array>}
 */
export const getWorkTimeEntries = async (employeeId, month, year) => {
  try {
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0, 23, 59, 59);

    const q = query(
      collection(db, 'workTime'),
      where('employeeId', '==', employeeId),
      where('date', '>=', Timestamp.fromDate(startDate)),
      where('date', '<=', Timestamp.fromDate(endDate)),
      orderBy('date', 'desc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Błąd podczas pobierania wpisów czasu pracy:', error);
    throw error;
  }
};

/**
 * Pobiera wszystkie wpisy czasu pracy za dany dzień
 * @param {Date} date - Data dnia
 * @returns {Promise<Array>}
 */
export const getWorkTimeEntriesByDate = async (date) => {
  try {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(23, 59, 59, 999);

    const q = query(
      collection(db, 'workTime'),
      where('date', '>=', Timestamp.fromDate(dayStart)),
      where('date', '<=', Timestamp.fromDate(dayEnd)),
      orderBy('date', 'desc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Błąd podczas pobierania wpisów czasu pracy po dacie:', error);
    throw error;
  }
};

/**
 * Pobiera wszystkie wpisy czasu pracy (dla admina)
 * @param {number} month - Miesiąc (0-11)
 * @param {number} year - Rok
 * @returns {Promise<Array>}
 */
export const getAllWorkTimeEntries = async (month, year) => {
  try {
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0, 23, 59, 59);

    const q = query(
      collection(db, 'workTime'),
      where('date', '>=', Timestamp.fromDate(startDate)),
      where('date', '<=', Timestamp.fromDate(endDate)),
      orderBy('date', 'desc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Błąd podczas pobierania wszystkich wpisów czasu pracy:', error);
    throw error;
  }
};

/**
 * Aktualizuje status wpisu czasu pracy
 * @param {string} entryId - ID wpisu
 * @param {string} status - Nowy status (approved/rejected)
 * @param {string} reviewedBy - ID osoby zatwierdzającej
 * @returns {Promise<void>}
 */
export const updateWorkTimeStatus = async (entryId, status, reviewedBy) => {
  try {
    const entryRef = doc(db, 'workTime', entryId);
    await updateDoc(entryRef, {
      status,
      reviewedBy,
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Błąd podczas aktualizacji statusu wpisu czasu pracy:', error);
    throw error;
  }
};

/**
 * Usuwa wpis czasu pracy
 * @param {string} entryId - ID wpisu
 * @returns {Promise<void>}
 */
export const deleteWorkTimeEntry = async (entryId) => {
  try {
    await deleteDoc(doc(db, 'workTime', entryId));
  } catch (error) {
    console.error('Błąd podczas usuwania wpisu czasu pracy:', error);
    throw error;
  }
};

/**
 * Dodaje wpis czasu pracy ręcznie przez admina (dowolna data, pola audytowe)
 * @param {Object} data - Dane wpisu
 * @param {string} adminUserId - UID admina
 * @param {string} adminName - Nazwa admina
 * @returns {Promise<DocumentReference>}
 */
export const addWorkTimeEntryAdmin = async (data, adminUserId, adminName) => {
  try {
    const dateObj = data.date instanceof Date ? data.date : new Date(data.date);
    dateObj.setHours(0, 0, 0, 0);

    const entry = {
      employeeId: data.employeeId,
      userId: data.userId,
      employeeName: data.employeeName,
      date: Timestamp.fromDate(dateObj),
      startTime: data.startTime,
      endTime: data.endTime || null,
      startDevice: null,
      endDevice: null,
      totalHours: null,
      totalMinutes: null,
      status: data.endTime ? 'approved' : 'in_progress',
      manualEntry: true,
      manualEntryBy: adminUserId,
      manualEntryByName: adminName,
      manualEntryAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    if (data.startTime && data.endTime) {
      const [startH, startM] = data.startTime.split(':').map(Number);
      const [endH, endM] = data.endTime.split(':').map(Number);
      const startMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;
      const totalMinutes = endMinutes - startMinutes;
      entry.totalHours = Math.round((totalMinutes / 60) * 100) / 100;
      entry.totalMinutes = totalMinutes;
    }

    return await addDoc(collection(db, 'workTime'), entry);
  } catch (error) {
    console.error('Błąd podczas ręcznego dodawania wpisu czasu pracy:', error);
    throw error;
  }
};

/**
 * Edytuje wpis czasu pracy (admin) z pełnym audytem zmian
 * @param {string} entryId - ID wpisu
 * @param {Object} updates - Nowe wartości (startTime, endTime, date, status)
 * @param {string} adminUserId - UID admina
 * @param {string} adminName - Nazwa admina
 * @returns {Promise<void>}
 */
export const updateWorkTimeEntry = async (entryId, updates, adminUserId, adminName) => {
  try {
    const entryRef = doc(db, 'workTime', entryId);
    const entrySnap = await getDoc(entryRef);
    if (!entrySnap.exists()) throw new Error('Wpis nie istnieje');

    const oldData = entrySnap.data();
    const changes = {};

    if (updates.startTime && updates.startTime !== oldData.startTime) {
      changes.startTime = { from: oldData.startTime, to: updates.startTime };
    }
    if (updates.endTime !== undefined && updates.endTime !== oldData.endTime) {
      changes.endTime = { from: oldData.endTime, to: updates.endTime };
    }
    if (updates.status && updates.status !== oldData.status) {
      changes.status = { from: oldData.status, to: updates.status };
    }
    if (updates.date) {
      const newDateObj = updates.date instanceof Date ? updates.date : new Date(updates.date);
      newDateObj.setHours(0, 0, 0, 0);
      const oldDateObj = oldData.date?.toDate ? oldData.date.toDate() : new Date(oldData.date);
      if (newDateObj.getTime() !== oldDateObj.getTime()) {
        changes.date = { from: oldDateObj.toISOString(), to: newDateObj.toISOString() };
      }
    }

    const updateData = { updatedAt: serverTimestamp() };

    if (updates.startTime) updateData.startTime = updates.startTime;
    if (updates.endTime !== undefined) updateData.endTime = updates.endTime;
    if (updates.status) updateData.status = updates.status;
    if (updates.date) {
      const d = updates.date instanceof Date ? updates.date : new Date(updates.date);
      d.setHours(0, 0, 0, 0);
      updateData.date = Timestamp.fromDate(d);
    }

    const startTime = updates.startTime || oldData.startTime;
    const endTime = updates.endTime !== undefined ? updates.endTime : oldData.endTime;
    if (startTime && endTime) {
      const [sH, sM] = startTime.split(':').map(Number);
      const [eH, eM] = endTime.split(':').map(Number);
      const totalMinutes = (eH * 60 + eM) - (sH * 60 + sM);
      updateData.totalHours = Math.round((totalMinutes / 60) * 100) / 100;
      updateData.totalMinutes = totalMinutes;
    }

    updateData.lastEditedBy = adminUserId;
    updateData.lastEditedByName = adminName;
    updateData.lastEditedAt = serverTimestamp();

    const editHistoryEntry = {
      editedBy: adminUserId,
      editedByName: adminName,
      editedAt: new Date().toISOString(),
      changes
    };
    const existingHistory = oldData.editHistory || [];
    updateData.editHistory = [...existingHistory, editHistoryEntry];

    await updateDoc(entryRef, updateData);
  } catch (error) {
    console.error('Błąd podczas edycji wpisu czasu pracy:', error);
    throw error;
  }
};

export default {
  getEmployeeByCode,
  addWorkTimeEntry,
  addWorkTimeEntryAdmin,
  updateWorkTimeEntry,
  clockOut,
  getOpenEntry,
  getWorkTimeEntries,
  getWorkTimeEntriesByDate,
  getAllWorkTimeEntries,
  updateWorkTimeStatus,
  deleteWorkTimeEntry
};
