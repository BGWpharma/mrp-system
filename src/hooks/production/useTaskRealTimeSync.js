/**
 * Hook do zarządzania synchronizacją w czasie rzeczywistym zadania produkcyjnego
 * 
 * Zawiera:
 * - Firestore onSnapshot listener na dokument zadania
 * - processTaskUpdate - przetwarzanie aktualizacji zadania
 * - processMaterialsUpdate - przetwarzanie aktualizacji materiałów
 * - processConsumedMaterialsUpdate - przetwarzanie aktualizacji skonsumowanych materiałów
 * - Debouncing (300ms) i smart update (porównanie timestampów)
 * - Shallow comparison helpers (areMaterialsChanged, areConsumedMaterialsChanged)
 */

import { useEffect, useRef, useCallback } from 'react';
import { db } from '../../services/firebase/config';
import { doc, onSnapshot, getDocs, collection, query, where } from 'firebase/firestore';
import { preciseMultiply } from '../../utils/mathUtils';

// Shallow comparison dla materiałów - 10-100x szybsze niż JSON.stringify
const areMaterialsChanged = (newMaterials, oldMaterials) => {
  if (!oldMaterials) return true;
  if (!Array.isArray(newMaterials) || !Array.isArray(oldMaterials)) return true;
  if (newMaterials.length !== oldMaterials.length) return true;
  
  const oldMaterialsMap = new Map();
  oldMaterials.forEach((m, idx) => {
    const key = m.id || m.inventoryItemId || `temp_${idx}_${m.name || 'unknown'}`;
    oldMaterialsMap.set(key, m);
  });
  
  return newMaterials.some((newMat, idx) => {
    const matId = newMat.id || newMat.inventoryItemId || `temp_${idx}_${newMat.name || 'unknown'}`;
    const oldMat = oldMaterialsMap.get(matId);
    
    return !oldMat ||
      newMat.quantity !== oldMat.quantity ||
      newMat.inventoryItemId !== oldMat.inventoryItemId ||
      newMat.reservedQuantity !== oldMat.reservedQuantity;
  });
};

// Shallow comparison dla skonsumowanych materiałów
const areConsumedMaterialsChanged = (newConsumed, oldConsumed) => {
  if (!oldConsumed) return true;
  if (!Array.isArray(newConsumed) || !Array.isArray(oldConsumed)) return true;
  if (newConsumed.length !== oldConsumed.length) return true;
  
  const oldConsumedMap = new Map();
  oldConsumed.forEach((c, idx) => {
    const matId = c.materialId || `no-mat-${idx}`;
    const batchId = c.batchId || `no-batch-${idx}`;
    oldConsumedMap.set(`${matId}_${batchId}`, c);
  });
  
  return newConsumed.some((newCons, idx) => {
    if (!newCons.materialId || !newCons.batchId) {
      console.warn('⚠️ Konsumpcja bez materialId lub batchId:', newCons);
      return true;
    }
    
    const key = `${newCons.materialId}_${newCons.batchId}`;
    const oldCons = oldConsumedMap.get(key);
    
    return !oldCons ||
      newCons.quantity !== oldCons.quantity ||
      newCons.timestamp?.toMillis?.() !== oldCons.timestamp?.toMillis?.();
  });
};

/**
 * @param {string} id - ID zadania produkcyjnego
 * @param {Object} callbacks - Obiekty callback:
 *   setTask, setMaterials, setMaterialQuantities, setIncludeInCosts, setLoading,
 *   showError, navigate,
 *   enrichConsumedMaterialsData, fetchFormResponsesOptimized,
 *   fetchAwaitingOrdersForMaterials, fetchPOReservations,
 *   fetchProductionHistory, invalidateCostsCache
 * @param {Object} loadedTabs - Obiekt śledzący załadowane zakładki
 */
export const useTaskRealTimeSync = (id, callbacks, loadedTabs) => {
  const {
    setTask,
    setMaterials,
    setMaterialQuantities,
    setIncludeInCosts,
    setLoading,
    showError,
    navigate,
    enrichConsumedMaterialsData,
    fetchFormResponsesOptimized,
    fetchAwaitingOrdersForMaterials,
    fetchPOReservations,
    fetchProductionHistory,
    invalidateCostsCache
  } = callbacks;

  const taskRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const callbacksRef = useRef(callbacks);
  const loadedTabsRef = useRef(loadedTabs);

  // Aktualizuj refs przy każdym renderze
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  useEffect(() => {
    loadedTabsRef.current = loadedTabs;
  }, [loadedTabs]);

  // Eksponuj taskRef do aktualizacji z zewnątrz
  const updateTaskRef = useCallback((task) => {
    taskRef.current = task;
  }, []);

  // Przetwarzanie aktualizacji materiałów (grupowe pobieranie z Firestore)
  const processMaterialsUpdate = useCallback(async (taskData) => {
    if (!taskData.materials || taskData.materials.length === 0) {
      callbacksRef.current.setMaterials([]);
      callbacksRef.current.setMaterialQuantities({});
      callbacksRef.current.setIncludeInCosts({});
      return;
    }
    
    const inventoryItemIds = taskData.materials
      .map(material => material.inventoryItemId)
      .filter(Boolean);
    
    let inventoryItemsMap = new Map();
    
    if (inventoryItemIds.length > 0) {
      const batchSize = 10;
      
      for (let i = 0; i < inventoryItemIds.length; i += batchSize) {
        const batch = inventoryItemIds.slice(i, i + batchSize);
        
        try {
          const itemsQuery = query(
            collection(db, 'inventory'),
            where('__name__', 'in', batch)
          );
          
          const itemsSnapshot = await getDocs(itemsQuery);
          itemsSnapshot.forEach(docSnap => {
            inventoryItemsMap.set(docSnap.id, {
              id: docSnap.id,
              ...docSnap.data()
            });
          });
        } catch (error) {
          console.error(`❌ [RealTimeSync] Błąd batch pobierania inventory:`, error);
        }
      }
    }
    
    const materialsList = taskData.materials.map(material => {
      let updatedMaterial = { ...material };
      
      if (material.inventoryItemId && inventoryItemsMap.has(material.inventoryItemId)) {
        const inventoryItem = inventoryItemsMap.get(material.inventoryItemId);
        updatedMaterial.unitPrice = inventoryItem.unitPrice || inventoryItem.price || 0;
      }
      
      return {
        ...updatedMaterial,
        plannedQuantity: preciseMultiply(updatedMaterial.quantity || 0, taskData.quantity || 1)
      };
    });
    
    callbacksRef.current.setMaterials(materialsList);
    
    const quantities = {};
    const costsInclude = {};
    
    materialsList.forEach(material => {
      const actualQuantity = taskData.actualMaterialUsage && taskData.actualMaterialUsage[material.id] !== undefined
        ? taskData.actualMaterialUsage[material.id]
        : material.quantity;
      
      quantities[material.id] = actualQuantity;
      costsInclude[material.id] = taskData.materialInCosts && taskData.materialInCosts[material.id] !== undefined
        ? taskData.materialInCosts[material.id]
        : true;
    });
    
    callbacksRef.current.setMaterialQuantities(quantities);
    callbacksRef.current.setIncludeInCosts(costsInclude);
  }, []);

  // Przetwarzanie aktualizacji skonsumowanych materiałów (wzbogacanie danych)
  const processConsumedMaterialsUpdate = useCallback(async (taskData) => {
    if (!taskData.consumedMaterials || taskData.consumedMaterials.length === 0) {
      return taskData;
    }
    
    try {
      const enrichedConsumedMaterials = await callbacksRef.current.enrichConsumedMaterialsData(taskData.consumedMaterials);
      taskData.consumedMaterials = enrichedConsumedMaterials;
      return taskData;
    } catch (error) {
      console.error('❌ [RealTimeSync] processConsumedMaterialsUpdate błąd:', error);
      return taskData;
    }
  }, []);

  // Główna funkcja przetwarzania aktualizacji zadania
  const processTaskUpdate = useCallback(async (taskData) => {
    try {
      const previousTask = taskRef.current;
      const promises = [];
      
      const materialsChanged = areMaterialsChanged(taskData.materials, previousTask?.materials);
      const consumedChanged = areConsumedMaterialsChanged(taskData.consumedMaterials, previousTask?.consumedMaterials);
      
      if (materialsChanged || !previousTask) {
        promises.push(processMaterialsUpdate(taskData));
      }
      
      if (consumedChanged || !previousTask) {
        taskData = await processConsumedMaterialsUpdate(taskData);
      }
      
      if (taskData.moNumber && taskData.moNumber !== previousTask?.moNumber) {
        promises.push(callbacksRef.current.fetchFormResponsesOptimized(taskData.moNumber));
      }
      
      if (taskData.id && (materialsChanged || !previousTask)) {
        promises.push(callbacksRef.current.fetchAwaitingOrdersForMaterials(taskData));
        promises.push(callbacksRef.current.fetchPOReservations());
      }
      
      const currentLoadedTabs = loadedTabsRef.current;
      if (taskData.id && currentLoadedTabs.productionPlan && previousTask && (materialsChanged || consumedChanged)) {
        promises.push(callbacksRef.current.fetchProductionHistory(taskData.id));
      }
      
      const results = await Promise.allSettled(promises);
      
      const errors = results.filter(r => r.status === 'rejected');
      if (errors.length > 0) {
        console.error('❌ [REAL-TIME] Błędy podczas aktualizacji:', 
          errors.map((e, idx) => ({ index: idx, error: e.reason }))
        );
      }
      
      if (materialsChanged || consumedChanged) {
        callbacksRef.current.invalidateCostsCache();
      }
      
      const hasActualChanges = !previousTask || 
        taskData.updatedAt?.toMillis?.() !== previousTask.updatedAt?.toMillis?.() ||
        taskData.status !== previousTask.status ||
        taskData.moNumber !== previousTask.moNumber ||
        taskData.mixingPlanChecklist?.length !== previousTask.mixingPlanChecklist?.length ||
        JSON.stringify(taskData.mixingPlanChecklist) !== JSON.stringify(previousTask.mixingPlanChecklist) ||
        taskData.productionDocs?.length !== previousTask.productionDocs?.length ||
        taskData.plannedStartDate?.toMillis?.() !== previousTask.plannedStartDate?.toMillis?.() ||
        taskData.actualStartDate?.toMillis?.() !== previousTask.actualStartDate?.toMillis?.() ||
        taskData.actualEndDate?.toMillis?.() !== previousTask.actualEndDate?.toMillis?.() ||
        taskData.comments?.length !== previousTask.comments?.length ||
        JSON.stringify(taskData.comments) !== JSON.stringify(previousTask.comments) ||
        taskData.totalMaterialCost !== previousTask.totalMaterialCost ||
        taskData.unitMaterialCost !== previousTask.unitMaterialCost ||
        taskData.totalFullProductionCost !== previousTask.totalFullProductionCost ||
        taskData.unitFullProductionCost !== previousTask.unitFullProductionCost ||
        taskData.factoryCostTotal !== previousTask.factoryCostTotal ||
        taskData.factoryCostPerUnit !== previousTask.factoryCostPerUnit ||
        taskData.totalCostWithFactory !== previousTask.totalCostWithFactory ||
        taskData.unitCostWithFactory !== previousTask.unitCostWithFactory;
      
      if (hasActualChanges) {
        callbacksRef.current.setTask(taskData);
      }
      
    } catch (error) {
      console.error('❌ [RealTimeSync] processTaskUpdate błąd:', error);
    }
  }, [processMaterialsUpdate, processConsumedMaterialsUpdate]);

  // Główny Firestore onSnapshot listener
  useEffect(() => {
    if (!id) return;
    
    let isMounted = true;
    
    setLoading(true);
    
    const taskDocRef = doc(db, 'productionTasks', id);
    let lastUpdateTimestamp = null;
    
    const unsubscribe = onSnapshot(
      taskDocRef,
      { includeMetadataChanges: false },
      async (docSnapshot) => {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        
        debounceTimerRef.current = setTimeout(async () => {
          if (!isMounted) return;
          
          if (!docSnapshot.exists()) {
            if (isMounted) {
              showError('Zadanie nie istnieje');
              navigate('/production');
            }
            return;
          }
          
          const taskData = { id: docSnapshot.id, ...docSnapshot.data() };
          const updateTimestamp = taskData.updatedAt?.toMillis?.() || Date.now();
          
          if (lastUpdateTimestamp && updateTimestamp < lastUpdateTimestamp) {
            return;
          }
          
          lastUpdateTimestamp = updateTimestamp;
          
          await processTaskUpdate(taskData);
          
          if (isMounted) {
            setLoading(false);
          }
        }, 300);
      },
      (error) => {
        console.error('❌ [RealTimeSync] Listener error:', error);
        if (isMounted) {
          showError('Błąd synchronizacji danych zadania');
          setLoading(false);
        }
      }
    );
    
    return () => {
      isMounted = false;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, navigate, showError]);

  return {
    updateTaskRef,
    processTaskUpdate,
    processMaterialsUpdate,
    processConsumedMaterialsUpdate
  };
};
