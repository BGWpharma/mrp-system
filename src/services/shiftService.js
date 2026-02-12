// src/services/shiftService.js
import {
  collection, addDoc, getDocs, doc, updateDoc, deleteDoc, setDoc,
  query, where, orderBy, serverTimestamp, Timestamp, writeBatch
} from 'firebase/firestore';
import { db } from './firebase/config';

/**
 * Predefiniowane typy zmian
 */
export const SHIFT_TYPES = {
  MORNING: 'morning',
  AFTERNOON: 'afternoon',
  NIGHT: 'night',
  CUSTOM: 'custom',
  OFF: 'off',
};

export const SHIFT_PRESETS = {
  [SHIFT_TYPES.MORNING]:   { label: 'Ranna',         start: '06:00', end: '14:00', color: '#4caf50' },
  [SHIFT_TYPES.AFTERNOON]: { label: 'Popołudniowa',  start: '14:00', end: '22:00', color: '#2196f3' },
  [SHIFT_TYPES.NIGHT]:     { label: 'Nocna',         start: '22:00', end: '06:00', color: '#7c4dff' },
  [SHIFT_TYPES.OFF]:       { label: 'Wolne',         start: null,    end: null,     color: '#9e9e9e' },
};

// ===================== SZABLONY ZMIAN =====================

/**
 * Pobiera szablony zmian
 */
export const getShiftTemplates = async () => {
  try {
    const q = query(collection(db, 'shiftTemplates'), orderBy('name', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('Błąd pobierania szablonów zmian:', error);
    throw error;
  }
};

/**
 * Dodaje szablon zmiany
 */
export const addShiftTemplate = async (data) => {
  try {
    return await addDoc(collection(db, 'shiftTemplates'), {
      name: data.name,
      startTime: data.startTime,
      endTime: data.endTime,
      color: data.color || '#4caf50',
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Błąd dodawania szablonu zmiany:', error);
    throw error;
  }
};

/**
 * Usuwa szablon zmiany
 */
export const deleteShiftTemplate = async (templateId) => {
  try {
    await deleteDoc(doc(db, 'shiftTemplates', templateId));
  } catch (error) {
    console.error('Błąd usuwania szablonu zmiany:', error);
    throw error;
  }
};

// ===================== ZMIANY (SHIFTS) =====================

/**
 * Zapisuje zmianę dla pracownika na dany dzień.
 * Używa deterministycznego ID: `YYYY-MM-DD_employeeId`
 */
export const saveShift = async (data) => {
  try {
    const dateStr = formatDateKey(data.date);
    const shiftId = `${dateStr}_${data.employeeId}`;
    const shiftRef = doc(db, 'shifts', shiftId);

    await setDoc(shiftRef, {
      employeeId: data.employeeId,
      employeeName: data.employeeName,
      date: Timestamp.fromDate(normalizeDate(data.date)),
      dateKey: dateStr,
      shiftType: data.shiftType || SHIFT_TYPES.CUSTOM,
      startTime: data.startTime || null,
      endTime: data.endTime || null,
      color: data.color || '#4caf50',
      updatedAt: serverTimestamp(),
    }, { merge: true });

    return shiftId;
  } catch (error) {
    console.error('Błąd zapisywania zmiany:', error);
    throw error;
  }
};

/**
 * Zapisuje wiele zmian jednocześnie (batch)
 */
export const saveShiftsBatch = async (shifts) => {
  try {
    const batch = writeBatch(db);
    shifts.forEach(s => {
      const dateStr = formatDateKey(s.date);
      const shiftId = `${dateStr}_${s.employeeId}`;
      const ref = doc(db, 'shifts', shiftId);
      batch.set(ref, {
        employeeId: s.employeeId,
        employeeName: s.employeeName,
        date: Timestamp.fromDate(normalizeDate(s.date)),
        dateKey: dateStr,
        shiftType: s.shiftType || SHIFT_TYPES.CUSTOM,
        startTime: s.startTime || null,
        endTime: s.endTime || null,
        color: s.color || '#4caf50',
        updatedAt: serverTimestamp(),
      }, { merge: true });
    });
    await batch.commit();
  } catch (error) {
    console.error('Błąd batch-zapisu zmian:', error);
    throw error;
  }
};

/**
 * Usuwa zmianę
 */
export const deleteShift = async (shiftId) => {
  try {
    await deleteDoc(doc(db, 'shifts', shiftId));
  } catch (error) {
    console.error('Błąd usuwania zmiany:', error);
    throw error;
  }
};

/**
 * Pobiera zmiany w zakresie dat (do widoku tygodnia/miesiąca)
 */
export const getShiftsByDateRange = async (startDate, endDate) => {
  try {
    const q = query(
      collection(db, 'shifts'),
      where('date', '>=', Timestamp.fromDate(normalizeDate(startDate))),
      where('date', '<=', Timestamp.fromDate(normalizeDate(endDate))),
      orderBy('date', 'asc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    console.error('Błąd pobierania zmian:', error);
    throw error;
  }
};

/**
 * Pobiera zmiany w danym tygodniu (Mon-Sun)
 */
export const getShiftsForWeek = async (weekStartDate) => {
  const start = normalizeDate(weekStartDate);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return getShiftsByDateRange(start, end);
};

// ===================== HELPERS =====================

function normalizeDate(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateKey(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Zwraca poniedziałek danego tygodnia
 */
export const getMonday = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

export default {
  SHIFT_TYPES,
  SHIFT_PRESETS,
  getShiftTemplates,
  addShiftTemplate,
  deleteShiftTemplate,
  saveShift,
  saveShiftsBatch,
  deleteShift,
  getShiftsByDateRange,
  getShiftsForWeek,
  getMonday,
};
