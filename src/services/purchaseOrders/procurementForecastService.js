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
import { db } from '../firebase/config';

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
export const createProcurementForecast = async (forecastData, period, userId, userName, name = '', notes = '', filterInfo = null) => {
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
      consumedQuantity: item.consumedQuantity || 0,
      availableQuantity: item.availableQuantity || 0,
      balance: item.balance || 0,
      futureDeliveriesTotal: item.futureDeliveriesTotal || 0,
      balanceWithFutureDeliveries: item.balanceWithFutureDeliveries || 0,
      price: item.price || 0,
      cost: item.cost || 0,
      supplierId: item.supplierId || null,
      supplierName: item.supplier || null,
      relatedTaskIds: item.tasks || [],
      relatedTasks: (item.taskDetails || []).map(t => ({
        id: t.id || '',
        number: t.number || '',
        name: t.name || ''
      })),
      futureDeliveries: (item.futureDeliveries || []).map(d => ({
        poId: d.poId || '',
        poNumber: d.poNumber || '',
        status: d.status || '',
        quantity: d.quantity || 0,
        originalQuantity: d.originalQuantity || 0,
        receivedQuantity: d.receivedQuantity || 0,
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
      notes: notes || '',
      appliedFilter: filterInfo || null
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
    orderBy('createdAt', 'desc'),
    limit(50)
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

/**
 * Normalizuje ilość materiału do wartości per-unit na podstawie danych zadania.
 */
const correctMaterialQuantity = (material, taskQuantity) => {
  if (material.quantityPerUnit && material.quantityPerUnit > 0) {
    return material.quantityPerUnit;
  }
  if (material.isFullTaskQuantity || material.isTotal) {
    return material.quantity / taskQuantity;
  }
  if (taskQuantity > 0) {
    return material.quantity / taskQuantity;
  }
  return material.quantity;
};

/**
 * Oblicza aktualne requiredQuantity i consumedQuantity per materiał
 * na podstawie zadań produkcyjnych z okresu prognozy.
 * Zwraca Map<materialId, { requiredQuantity, consumedQuantity, taskDetails }>.
 */
const calculateRequirementsFromTasks = (tasks) => {
  const requirements = new Map();

  for (const task of tasks) {
    if (!task.materials || task.materials.length === 0) continue;

    const taskQuantity = typeof task.quantity === 'number'
      ? task.quantity
      : parseFloat(task.quantity) || 1;
    const actualMaterialUsage = task.actualMaterialUsage || {};

    for (const material of task.materials) {
      const materialId = material.id || material.inventoryItemId;
      if (!materialId) continue;

      let totalRequiredForTask;
      const actualQty = actualMaterialUsage[material.id] ?? actualMaterialUsage[materialId];

      if (actualQty !== undefined) {
        totalRequiredForTask = parseFloat(actualQty) || 0;
      } else {
        const materialQuantity = typeof material.quantity === 'number'
          ? material.quantity
          : parseFloat(material.quantity) || 0;
        if (materialQuantity <= 0) continue;

        const perUnit = correctMaterialQuantity(material, taskQuantity);
        totalRequiredForTask = perUnit * taskQuantity;
      }

      if (totalRequiredForTask <= 0) continue;

      let consumedQuantity = 0;
      if (task.consumedMaterials && Array.isArray(task.consumedMaterials)) {
        const matching = task.consumedMaterials.filter(
          cm => (cm.materialId === materialId || cm.inventoryItemId === materialId)
        );
        if (matching.length > 0) {
          consumedQuantity = matching.reduce(
            (sum, cm) => sum + (parseFloat(cm.quantity) || 0), 0
          );
        }
      }

      const remaining = Math.max(0, totalRequiredForTask - consumedQuantity);

      if (!requirements.has(materialId)) {
        requirements.set(materialId, {
          requiredQuantity: 0,
          consumedQuantity: 0,
          taskDetails: []
        });
      }

      const entry = requirements.get(materialId);
      entry.requiredQuantity += remaining;
      entry.consumedQuantity += consumedQuantity;

      if (!entry.taskDetails.some(t => t.id === task.id)) {
        entry.taskDetails.push({
          id: task.id,
          number: task.moNumber || task.number || task.taskNumber || '',
          name: task.name || task.productName || ''
        });
      }
    }
  }

  return requirements;
};

/**
 * Przelicza istniejącą prognozę zakupową na podstawie aktualnych:
 * - zadań produkcyjnych (requiredQuantity z uwzględnieniem consumedMaterials)
 * - stanów magazynowych (availableQuantity)
 * - zamówień zakupowych (futureDeliveries)
 */
export const recalculateProcurementForecast = async (forecastId, userId) => {
  try {
    const forecast = await getProcurementForecastById(forecastId);
    if (!forecast) throw new Error('Prognoza nie znaleziona');

    const materialIds = (forecast.materials || [])
      .map(m => m.materialId)
      .filter(Boolean);

    const {
      getAllInventoryItems,
      getAwaitingOrdersForMultipleItems,
      invalidateActivePOCache
    } = await import('../inventory');

    const { getTasksByDateRangeOptimized } = await import('../production/productionService');

    const startDate = forecast.forecastPeriod?.startDate;
    const endDate = forecast.forecastPeriod?.endDate;

    const [allItems, tasksData] = await Promise.all([
      getAllInventoryItems(),
      (startDate && endDate)
        ? getTasksByDateRangeOptimized(startDate, endDate)
        : Promise.resolve([])
    ]);

    const inventoryMap = new Map();
    allItems.forEach(item => inventoryMap.set(item.id, item));

    const taskRequirements = calculateRequirementsFromTasks(tasksData);

    invalidateActivePOCache();
    const allPOs = await getAwaitingOrdersForMultipleItems(materialIds);

    const forecastEndDate = endDate ? new Date(endDate) : null;

    const updatedMaterials = forecast.materials.map(material => {
      const inventoryItem = inventoryMap.get(material.materialId);
      const currentAvailable = inventoryItem
        ? parseFloat(inventoryItem.quantity) || 0
        : material.availableQuantity || 0;

      const taskReq = taskRequirements.get(material.materialId);
      const recalculatedRequired = taskReq
        ? parseFloat(taskReq.requiredQuantity.toFixed(2))
        : 0;
      const recalculatedConsumed = taskReq
        ? parseFloat(taskReq.consumedQuantity.toFixed(2))
        : 0;
      const updatedTaskDetails = taskReq?.taskDetails || material.relatedTasks || [];

      const purchaseOrders = allPOs[material.materialId] || [];
      const futureDeliveries = [];

      for (const po of purchaseOrders) {
        for (const item of po.items) {
          const deliveryDate = item.expectedDeliveryDate || po.expectedDeliveryDate;

          if (deliveryDate && forecastEndDate) {
            const dDate = deliveryDate instanceof Date ? deliveryDate : new Date(deliveryDate);
            if (dDate > forecastEndDate) continue;
          }

          futureDeliveries.push({
            poId: po.id,
            poNumber: po.number || 'Brak numeru',
            status: po.status,
            quantity: item.quantityRemaining,
            originalQuantity: item.quantityOrdered,
            receivedQuantity: item.quantityReceived,
            expectedDeliveryDate: deliveryDate instanceof Date
              ? deliveryDate.toISOString()
              : deliveryDate || null,
            supplierName: po.supplierName || ''
          });
        }
      }

      const freshPoIds = new Set(futureDeliveries.map(d => d.poId));
      const existingCompleted = (material.futureDeliveries || [])
        .filter(d => d.status === 'completed' && !freshPoIds.has(d.poId));
      futureDeliveries.push(...existingCompleted);

      futureDeliveries.sort((a, b) => {
        if (!a.expectedDeliveryDate) return 1;
        if (!b.expectedDeliveryDate) return -1;
        return new Date(a.expectedDeliveryDate) - new Date(b.expectedDeliveryDate);
      });

      const futureDeliveriesTotal = futureDeliveries.reduce(
        (sum, d) => sum + (parseFloat(d.quantity) || 0), 0
      );
      const balance = currentAvailable - recalculatedRequired;
      const balanceWithFutureDeliveries =
        currentAvailable + futureDeliveriesTotal - recalculatedRequired;

      return {
        ...material,
        requiredQuantity: recalculatedRequired,
        consumedQuantity: recalculatedConsumed,
        availableQuantity: parseFloat(currentAvailable.toFixed(2)),
        balance: parseFloat(balance.toFixed(2)),
        futureDeliveries,
        futureDeliveriesTotal: parseFloat(futureDeliveriesTotal.toFixed(2)),
        balanceWithFutureDeliveries: parseFloat(balanceWithFutureDeliveries.toFixed(2)),
        relatedTasks: updatedTaskDetails
      };
    });

    const materialsWithShortage = updatedMaterials.filter(
      m => m.balanceWithFutureDeliveries < 0
    ).length;
    const totalShortageValue = updatedMaterials
      .filter(m => m.balanceWithFutureDeliveries < 0)
      .reduce(
        (sum, m) => sum + (Math.abs(m.balanceWithFutureDeliveries) * (m.price || 0)),
        0
      );

    const docRef = doc(db, COLLECTION, forecastId);
    await updateDoc(docRef, {
      materials: updatedMaterials,
      materialsWithShortage,
      totalShortageValue: parseFloat(totalShortageValue.toFixed(2)),
      totalMaterials: updatedMaterials.length,
      updatedAt: serverTimestamp(),
      updatedBy: userId,
      lastAutoUpdateReason: 'Ręczne przeliczenie prognozy'
    });

    return { success: true, materialsWithShortage, totalShortageValue };
  } catch (error) {
    console.error('Błąd podczas przeliczania prognozy:', error);
    throw error;
  }
};

const procurementForecastService = {
  createProcurementForecast,
  getAllProcurementForecasts,
  getProcurementForecastById,
  updateProcurementForecast,
  archiveProcurementForecast,
  deleteProcurementForecast,
  subscribeToProcurementForecasts,
  recalculateProcurementForecast
};

export default procurementForecastService;
