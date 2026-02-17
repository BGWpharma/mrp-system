import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit,
  onSnapshot,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from './firebase/config';

const COLLECTION = 'procurementForecasts';

/**
 * Generuje kolejny numer prognozy zakupowej (PF-YYYY-NNN)
 */
const generateForecastNumber = async () => {
  const year = new Date().getFullYear();
  const prefix = `PF-${year}-`;
  
  const q = query(
    collection(db, COLLECTION),
    where('number', '>=', prefix),
    where('number', '<=', prefix + '\uf8ff'),
    orderBy('number', 'desc'),
    limit(1)
  );
  
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) {
    return `${prefix}001`;
  }
  
  const lastNumber = snapshot.docs[0].data().number;
  const lastSeq = parseInt(lastNumber.replace(prefix, ''), 10) || 0;
  const nextSeq = String(lastSeq + 1).padStart(3, '0');
  
  return `${prefix}${nextSeq}`;
};

/**
 * Tworzy nową prognozę zakupową (snapshot z ForecastPage)
 */
export const createProcurementForecast = async (forecastData, period, userId, userName, name = '', notes = '') => {
  try {
    const number = await generateForecastNumber();
    
    const materialsWithShortage = forecastData.filter(item => item.balanceWithFutureDeliveries < 0);
    const totalShortageValue = materialsWithShortage.reduce(
      (sum, item) => sum + (Math.abs(item.balanceWithFutureDeliveries) * (item.price || 0)), 0
    );
    
    const materials = forecastData.map(item => ({
      materialId: item.id,
      materialName: item.name,
      category: item.category || 'Inne',
      unit: item.unit || 'szt.',
      requiredQuantity: item.requiredQuantity || 0,
      availableQuantity: item.availableQuantity || 0,
      balance: item.balance || 0,
      futureDeliveriesTotal: item.futureDeliveriesTotal || 0,
      balanceWithFutureDeliveries: item.balanceWithFutureDeliveries || 0,
      price: item.price || 0,
      cost: item.cost || 0,
      supplierId: item.supplierId || null,
      supplierName: item.supplier || null,
      relatedTaskIds: item.tasks || [],
      futureDeliveries: (item.futureDeliveries || []).map(d => ({
        poId: d.poId || '',
        poNumber: d.poNumber || '',
        status: d.status || '',
        quantity: d.quantity || 0,
        expectedDeliveryDate: d.expectedDeliveryDate || null,
        supplierName: d.supplierName || ''
      })),
      notes: '',
      manualStatus: ''
    }));
    
    const forecastDoc = {
      number,
      name: name || `Prognoza ${number}`,
      forecastPeriod: {
        startDate: period.startDate instanceof Date ? period.startDate.toISOString() : period.startDate,
        endDate: period.endDate instanceof Date ? period.endDate.toISOString() : period.endDate
      },
      materials,
      totalMaterials: forecastData.length,
      materialsWithShortage: materialsWithShortage.length,
      totalShortageValue: parseFloat(totalShortageValue.toFixed(2)),
      status: 'active',
      createdAt: serverTimestamp(),
      createdBy: userId,
      createdByName: userName || '',
      updatedAt: serverTimestamp(),
      notes: notes || ''
    };
    
    const docRef = await addDoc(collection(db, COLLECTION), forecastDoc);
    
    return { id: docRef.id, ...forecastDoc };
  } catch (error) {
    console.error('Błąd podczas tworzenia prognozy zakupowej:', error);
    throw error;
  }
};

/**
 * Pobiera wszystkie prognozy zakupowe (posortowane od najnowszych)
 */
export const getAllProcurementForecasts = async () => {
  try {
    const q = query(
      collection(db, COLLECTION),
      orderBy('createdAt', 'desc')
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || doc.data().createdAt,
      updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() || doc.data().updatedAt
    }));
  } catch (error) {
    console.error('Błąd podczas pobierania prognoz zakupowych:', error);
    return [];
  }
};

/**
 * Pobiera prognozę zakupową po ID
 */
export const getProcurementForecastById = async (id) => {
  try {
    const docRef = doc(db, COLLECTION, id);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return null;
    }
    
    const data = docSnap.data();
    return {
      id: docSnap.id,
      ...data,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt
    };
  } catch (error) {
    console.error('Błąd podczas pobierania prognozy zakupowej:', error);
    throw error;
  }
};

/**
 * Aktualizuje prognozę zakupową (nazwa, notatki, status, notatki materiałowe)
 */
export const updateProcurementForecast = async (id, data, userId) => {
  try {
    const docRef = doc(db, COLLECTION, id);
    
    const updateData = {
      updatedAt: serverTimestamp(),
      updatedBy: userId
    };
    
    if (data.name !== undefined) updateData.name = data.name;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.materials !== undefined) updateData.materials = data.materials;
    
    await updateDoc(docRef, updateData);
    
    return { id, ...updateData };
  } catch (error) {
    console.error('Błąd podczas aktualizacji prognozy zakupowej:', error);
    throw error;
  }
};

/**
 * Archiwizuje prognozę zakupową
 */
export const archiveProcurementForecast = async (id, userId) => {
  return updateProcurementForecast(id, { status: 'archived' }, userId);
};

/**
 * Usuwa prognozę zakupową
 */
export const deleteProcurementForecast = async (id) => {
  try {
    await deleteDoc(doc(db, COLLECTION, id));
    return { success: true };
  } catch (error) {
    console.error('Błąd podczas usuwania prognozy zakupowej:', error);
    throw error;
  }
};

/**
 * Real-time listener na kolekcję prognoz zakupowych
 * Automatycznie reaguje na zmiany (np. z Cloud Function triggera PO)
 * @param {Function} callback - wywoływana z tablicą prognoz
 * @returns {Function} unsubscribe - funkcja do odsubskrybowania
 */
export const subscribeToProcurementForecasts = (callback) => {
  const q = query(
    collection(db, COLLECTION),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate?.()?.toISOString() || doc.data().createdAt,
      updatedAt: doc.data().updatedAt?.toDate?.()?.toISOString() || doc.data().updatedAt
    }));
    callback(data);
  }, (error) => {
    console.error('Błąd subskrypcji prognoz zakupowych:', error);
  });
};

export default {
  createProcurementForecast,
  getAllProcurementForecasts,
  getProcurementForecastById,
  updateProcurementForecast,
  archiveProcurementForecast,
  deleteProcurementForecast,
  subscribeToProcurementForecasts
};
