// src/services/scheduleService.js
import { 
  collection, addDoc, getDocs, getDoc, doc, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, Timestamp 
} from 'firebase/firestore';
import { db } from './firebase/config';

/**
 * Typy wniosków / wpisów grafiku
 */
export const REQUEST_TYPES = {
  VACATION: 'vacation',           // Urlop wypoczynkowy
  SICK_LEAVE: 'sick_leave',       // Zwolnienie lekarskie
  DAY_OFF: 'day_off',             // Dzień wolny
  UNPAID_LEAVE: 'unpaid_leave',   // Urlop bezpłatny
  SCHEDULE_CHANGE: 'schedule_change', // Zmiana grafiku
  OTHER: 'other'                  // Inne
};

/**
 * Etykiety typów wniosków (PL)
 */
export const REQUEST_TYPE_LABELS = {
  [REQUEST_TYPES.VACATION]: 'Urlop wypoczynkowy',
  [REQUEST_TYPES.SICK_LEAVE]: 'Zwolnienie lekarskie',
  [REQUEST_TYPES.DAY_OFF]: 'Dzień wolny',
  [REQUEST_TYPES.UNPAID_LEAVE]: 'Urlop bezpłatny',
  [REQUEST_TYPES.SCHEDULE_CHANGE]: 'Zmiana grafiku',
  [REQUEST_TYPES.OTHER]: 'Inne'
};

/**
 * Statusy wniosków
 */
export const REQUEST_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected'
};

/**
 * Etykiety statusów (PL)
 */
export const REQUEST_STATUS_LABELS = {
  [REQUEST_STATUSES.PENDING]: 'Oczekujący',
  [REQUEST_STATUSES.APPROVED]: 'Zatwierdzony',
  [REQUEST_STATUSES.REJECTED]: 'Odrzucony'
};

/**
 * Kolory statusów (do UI)
 */
export const REQUEST_STATUS_COLORS = {
  [REQUEST_STATUSES.PENDING]: 'warning',
  [REQUEST_STATUSES.APPROVED]: 'success',
  [REQUEST_STATUSES.REJECTED]: 'error'
};

/**
 * Dodaje nowy wniosek (urlop, dzień wolny, itp.)
 * @param {Object} data - Dane wniosku
 * @returns {Promise<DocumentReference>}
 */
export const addScheduleRequest = async (data) => {
  try {
    return await addDoc(collection(db, 'scheduleRequests'), {
      employeeId: data.employeeId,
      userId: data.userId,
      employeeName: data.employeeName,
      type: data.type,
      startDate: Timestamp.fromDate(new Date(data.startDate)),
      endDate: Timestamp.fromDate(new Date(data.endDate)),
      reason: data.reason || '',
      notes: data.notes || '',
      status: REQUEST_STATUSES.PENDING,
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Błąd podczas dodawania wniosku:', error);
    throw error;
  }
};

/**
 * Pobiera wnioski pracownika
 * @param {string} employeeId - ID pracownika
 * @returns {Promise<Array>}
 */
export const getEmployeeRequests = async (employeeId) => {
  try {
    const q = query(
      collection(db, 'scheduleRequests'),
      where('employeeId', '==', employeeId),
      orderBy('createdAt', 'desc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Błąd podczas pobierania wniosków pracownika:', error);
    throw error;
  }
};

/**
 * Pobiera wszystkie wnioski (dla admina)
 * @param {string|null} statusFilter - Opcjonalny filtr statusu
 * @returns {Promise<Array>}
 */
export const getAllRequests = async (statusFilter = null) => {
  try {
    let q;
    if (statusFilter) {
      q = query(
        collection(db, 'scheduleRequests'),
        where('status', '==', statusFilter),
        orderBy('createdAt', 'desc')
      );
    } else {
      q = query(
        collection(db, 'scheduleRequests'),
        orderBy('createdAt', 'desc')
      );
    }

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error('Błąd podczas pobierania wszystkich wniosków:', error);
    throw error;
  }
};

/**
 * Pobiera wnioski za dany miesiąc (do grafiku)
 * @param {number} month - Miesiąc (0-11)
 * @param {number} year - Rok
 * @returns {Promise<Array>}
 */
export const getRequestsByMonth = async (month, year) => {
  try {
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0, 23, 59, 59);

    const q = query(
      collection(db, 'scheduleRequests'),
      where('startDate', '<=', Timestamp.fromDate(endDate)),
      where('status', '==', REQUEST_STATUSES.APPROVED),
      orderBy('startDate', 'asc')
    );

    const snapshot = await getDocs(q);
    // Filtruj też po endDate >= startDate miesiąca (Firestore nie pozwala na range na 2 polach)
    return snapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(req => {
        const reqEnd = req.endDate.toDate ? req.endDate.toDate() : new Date(req.endDate);
        return reqEnd >= startDate;
      });
  } catch (error) {
    console.error('Błąd podczas pobierania wniosków za miesiąc:', error);
    throw error;
  }
};

/**
 * Aktualizuje status wniosku (zatwierdzenie/odrzucenie)
 * @param {string} requestId - ID wniosku
 * @param {string} status - Nowy status
 * @param {string} reviewedBy - ID osoby zatwierdzającej
 * @param {string} reviewNote - Notatka
 * @returns {Promise<void>}
 */
export const updateRequestStatus = async (requestId, status, reviewedBy, reviewNote = '') => {
  try {
    const requestRef = doc(db, 'scheduleRequests', requestId);
    await updateDoc(requestRef, {
      status,
      reviewedBy,
      reviewedAt: serverTimestamp(),
      reviewNote,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Błąd podczas aktualizacji statusu wniosku:', error);
    throw error;
  }
};

/**
 * Usuwa wniosek
 * @param {string} requestId - ID wniosku
 * @returns {Promise<void>}
 */
export const deleteScheduleRequest = async (requestId) => {
  try {
    await deleteDoc(doc(db, 'scheduleRequests', requestId));
  } catch (error) {
    console.error('Błąd podczas usuwania wniosku:', error);
    throw error;
  }
};

export default {
  REQUEST_TYPES,
  REQUEST_TYPE_LABELS,
  REQUEST_STATUSES,
  REQUEST_STATUS_LABELS,
  REQUEST_STATUS_COLORS,
  addScheduleRequest,
  getEmployeeRequests,
  getAllRequests,
  getRequestsByMonth,
  updateRequestStatus,
  deleteScheduleRequest
};
