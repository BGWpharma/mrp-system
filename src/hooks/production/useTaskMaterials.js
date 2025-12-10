/**
 * Hook do zarządzania materiałami zadania produkcyjnego
 * Obsługuje ładowanie materiałów, partie, rezerwacje i konsumpcję
 */

import { useState, useCallback, useMemo } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { preciseMultiply } from '../../utils/mathUtils';
import { 
  getReservedQuantityForMaterial, 
  getConsumedQuantityForMaterial 
} from '../../utils/productionUtils';

export const useTaskMaterials = (task) => {
  const [materials, setMaterials] = useState([]);
  const [batches, setBatches] = useState({});
  const [materialQuantities, setMaterialQuantities] = useState({});
  const [includeInCosts, setIncludeInCosts] = useState({});
  const [loading, setLoading] = useState(false);
  const [awaitingOrders, setAwaitingOrders] = useState({});
  
  // ✅ Grupowe pobieranie pozycji magazynowych dla materiałów
  const fetchMaterialsData = useCallback(async (taskMaterials) => {
    if (!taskMaterials || taskMaterials.length === 0) {
      setMaterials([]);
      setMaterialQuantities({});
      setIncludeInCosts({});
      return;
    }
    
    try {
      setLoading(true);
      
      // Zbierz wszystkie ID pozycji magazynowych
      const inventoryItemIds = taskMaterials
        .map(material => material.inventoryItemId)
        .filter(Boolean);
      
      let inventoryItemsMap = new Map();
      
      if (inventoryItemIds.length > 0) {
        // Firebase "in" operator obsługuje maksymalnie 10 elementów
        const batchSize = 10;
        
        for (let i = 0; i < inventoryItemIds.length; i += batchSize) {
          const batch = inventoryItemIds.slice(i, i + batchSize);
          
          try {
            const itemsQuery = query(
              collection(db, 'inventory'),
              where('__name__', 'in', batch)
            );
            
            const itemsSnapshot = await getDocs(itemsQuery);
            itemsSnapshot.forEach(doc => {
              inventoryItemsMap.set(doc.id, {
                id: doc.id,
                ...doc.data()
              });
            });
          } catch (error) {
            console.error(`Błąd podczas pobierania pozycji magazynowych:`, error);
          }
        }
      }
      
      // Przygotuj listę materiałów z aktualnymi cenami
      const materialsList = taskMaterials.map(material => {
        let updatedMaterial = { ...material };
        
        if (material.inventoryItemId && inventoryItemsMap.has(material.inventoryItemId)) {
          const inventoryItem = inventoryItemsMap.get(material.inventoryItemId);
          updatedMaterial.unitPrice = inventoryItem.unitPrice || inventoryItem.price || 0;
        }
        
        return {
          ...updatedMaterial,
          plannedQuantity: preciseMultiply(
            updatedMaterial.quantity || 0, 
            task?.quantity || 1
          )
        };
      });
      
      setMaterials(materialsList);
      
      // Inicjalizacja ilości i kosztów
      const quantities = {};
      const costsInclude = {};
      
      materialsList.forEach(material => {
        const actualQuantity = task?.actualMaterialUsage?.[material.id] !== undefined
          ? task.actualMaterialUsage[material.id]
          : material.quantity;
        
        quantities[material.id] = actualQuantity;
        costsInclude[material.id] = task?.materialInCosts?.[material.id] !== undefined
          ? task.materialInCosts[material.id]
          : true;
      });
      
      setMaterialQuantities(quantities);
      setIncludeInCosts(costsInclude);
      
    } catch (error) {
      console.error('Błąd podczas ładowania materiałów:', error);
    } finally {
      setLoading(false);
    }
  }, [task?.quantity, task?.actualMaterialUsage, task?.materialInCosts]);
  
  // ✅ Pobieranie partii dla materiałów
  const fetchBatchesForMaterials = useCallback(async (materialsList) => {
    if (!materialsList || materialsList.length === 0) {
      setBatches({});
      return;
    }
    
    try {
      setLoading(true);
      
      // Importuj funkcję dynamicznie
      const { getBatchesForMultipleItems } = await import('../../services/inventory');
      
      const inventoryItemIds = materialsList
        .map(m => m.inventoryItemId)
        .filter(Boolean);
      
      if (inventoryItemIds.length === 0) {
        setBatches({});
        return;
      }
      
      const batchesData = await getBatchesForMultipleItems(inventoryItemIds);
      setBatches(batchesData);
      
    } catch (error) {
      console.error('Błąd podczas pobierania partii:', error);
      setBatches({});
    } finally {
      setLoading(false);
    }
  }, []);
  
  // ✅ Pobieranie oczekujących zamówień dla materiałów
  const fetchAwaitingOrders = useCallback(async (materialsList) => {
    if (!materialsList || materialsList.length === 0) {
      setAwaitingOrders({});
      return;
    }
    
    try {
      const { getAwaitingOrdersForInventoryItem } = await import('../../services/inventory');
      
      // Pobierz awaitujące zamówienia równolegle dla wszystkich materiałów
      const ordersPromises = materialsList.map(async (material) => {
        if (!material.inventoryItemId) return null;
        
        try {
          const orders = await getAwaitingOrdersForInventoryItem(material.inventoryItemId);
          return { materialId: material.inventoryItemId, orders };
        } catch (error) {
          console.error(`Błąd pobierania zamówień dla ${material.name}:`, error);
          return null;
        }
      });
      
      const ordersResults = await Promise.all(ordersPromises);
      
      const ordersMap = {};
      ordersResults.forEach(result => {
        if (result && result.materialId) {
          ordersMap[result.materialId] = result.orders;
        }
      });
      
      setAwaitingOrders(ordersMap);
      
    } catch (error) {
      console.error('Błąd podczas pobierania oczekujących zamówień:', error);
      setAwaitingOrders({});
    }
  }, []);
  
  // ✅ Obliczanie pokrycia rezerwacji dla materiału
  const calculateReservationCoverage = useCallback((materialId) => {
    const material = materials.find(m => m.id === materialId || m.inventoryItemId === materialId);
    if (!material) return null;
    
    const requiredQuantity = materialQuantities[material.id] || material.quantity || 0;
    const consumedQuantity = getConsumedQuantityForMaterial(task?.consumedMaterials, materialId);
    const reservedQuantity = getReservedQuantityForMaterial(task?.materialBatches, materialId);
    
    const totalCoverage = consumedQuantity + reservedQuantity;
    const hasFullCoverage = totalCoverage >= requiredQuantity - 0.001; // Tolerancja
    
    return {
      requiredQuantity,
      consumedQuantity,
      reservedQuantity,
      totalCoverage,
      hasFullCoverage,
      coveragePercentage: requiredQuantity > 0 ? (totalCoverage / requiredQuantity) * 100 : 100
    };
  }, [materials, materialQuantities, task?.consumedMaterials, task?.materialBatches]);
  
  // ✅ Memoizowane obliczenia statusu materiałów
  const materialsStatus = useMemo(() => {
    if (!materials.length || !task) return { allReserved: false, allConsumed: false };
    
    let allReserved = true;
    let allConsumed = true;
    
    materials.forEach(material => {
      const coverage = calculateReservationCoverage(material.inventoryItemId || material.id);
      if (coverage) {
        if (!coverage.hasFullCoverage) allReserved = false;
        if (coverage.consumedQuantity < coverage.requiredQuantity - 0.001) allConsumed = false;
      }
    });
    
    return { allReserved, allConsumed };
  }, [materials, task, calculateReservationCoverage]);
  
  return {
    materials,
    batches,
    materialQuantities,
    includeInCosts,
    loading,
    awaitingOrders,
    materialsStatus,
    setMaterials,
    setBatches,
    setMaterialQuantities,
    setIncludeInCosts,
    fetchMaterialsData,
    fetchBatchesForMaterials,
    fetchAwaitingOrders,
    calculateReservationCoverage
  };
};

