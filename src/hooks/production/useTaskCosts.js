/**
 * Hook do zarządzania obliczeniami kosztów zadania produkcyjnego
 * Implementuje cache z TTL 2s aby unikać wielokrotnych obliczeń
 */

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { preciseAdd, preciseSubtract, preciseMultiply } from '../../utils/mathUtils';

export const useTaskCosts = (task, materials, materialQuantities, includeInCosts, poReservations = []) => {
  const [costsSummary, setCostsSummary] = useState({
    totalMaterialCost: 0,
    unitMaterialCost: 0,
    totalFullProductionCost: 0,
    unitFullProductionCost: 0,
    materialCosts: []
  });
  
  // ⚡ OPTYMALIZACJA: Cache dla calculateAllCosts - TTL 2s
  const costsCache = useRef({
    data: null,
    timestamp: null,
    dependenciesHash: null
  });
  
  // Funkcja do generowania hash dependencies
  const generateDependenciesHash = useCallback(() => {
    const deps = {
      consumedLength: task?.consumedMaterials?.length || 0,
      batchesKeys: Object.keys(task?.materialBatches || {}).sort().join(','),
      materialsLength: materials?.length || 0,
      quantities: JSON.stringify(materialQuantities || {}),
      costs: JSON.stringify(includeInCosts || {}),
      poReservationsLength: poReservations?.length || 0,
      taskQuantity: task?.quantity || 0
    };
    return JSON.stringify(deps);
  }, [task, materials, materialQuantities, includeInCosts, poReservations]);
  
  // ✅ Funkcja do wymuszenia odświeżenia cache
  const invalidateCache = useCallback(() => {
    costsCache.current = {
      data: null,
      timestamp: null,
      dependenciesHash: null
    };
    console.log('🗑️ [CACHE] Wymuszono odświeżenie cache kosztów');
  }, []);
  
  // ✅ Helper: Obliczanie średniej ważonej ceny jednostkowej z rezerwacji PO
  const calculateWeightedUnitPrice = useCallback((material, materialId) => {
    const reservedBatches = task?.materialBatches?.[materialId];
    const materialPOReservations = poReservations.filter(r => r.materialId === materialId);
    
    // Filtruj aktywne rezerwacje PO
    const activePOReservations = materialPOReservations.filter(reservation => {
      if (reservation.status === 'pending') return true;
      if (reservation.status === 'delivered') {
        const convertedQuantity = reservation.convertedQuantity || 0;
        const reservedQuantity = reservation.reservedQuantity || 0;
        return convertedQuantity < reservedQuantity;
      }
      return false;
    });
    
    let totalQuantity = 0;
    let totalValue = 0;
    
    // Dodaj wartość z standardowych rezerwacji
    if (reservedBatches && reservedBatches.length > 0) {
      reservedBatches.forEach(batch => {
        const batchQuantity = parseFloat(batch.quantity || 0);
        const batchPrice = parseFloat(batch.unitPrice || material.unitPrice || 0);
        totalQuantity += batchQuantity;
        totalValue += batchQuantity * batchPrice;
      });
    }
    
    // Dodaj wartość z aktywnych rezerwacji PO
    if (activePOReservations.length > 0) {
      activePOReservations.forEach(reservation => {
        const reservedQuantity = parseFloat(reservation.reservedQuantity || 0);
        const convertedQuantity = parseFloat(reservation.convertedQuantity || 0);
        const availableQuantity = reservedQuantity - convertedQuantity;
        const unitPrice = parseFloat(reservation.unitPrice || 0);
        
        if (availableQuantity > 0 && unitPrice > 0) {
          totalQuantity += availableQuantity;
          totalValue += availableQuantity * unitPrice;
        }
      });
    }
    
    // Jeśli mamy rezerwacje z cenami, zwróć średnią ważoną
    if (totalQuantity > 0 && totalValue > 0) {
      return totalValue / totalQuantity;
    }
    
    // Fallback na cenę materiału
    return parseFloat(material.unitPrice || 0);
  }, [task?.materialBatches, poReservations]);
  
  // ✅ Główna funkcja obliczania kosztów z cache
  const calculateAllCosts = useCallback(async () => {
    if (!task?.id || !materials || materials.length === 0) {
      return {
        totalMaterialCost: 0,
        unitMaterialCost: 0,
        totalFullProductionCost: 0,
        unitFullProductionCost: 0,
        materialCosts: []
      };
    }
    
    const now = Date.now();
    const currentHash = generateDependenciesHash();
    
    // ⚡ CACHE HIT: Sprawdź czy mamy świeże dane w cache (TTL 2s)
    if (
      costsCache.current.data &&
      costsCache.current.timestamp &&
      costsCache.current.dependenciesHash === currentHash &&
      (now - costsCache.current.timestamp) < 2000
    ) {
      const age = now - costsCache.current.timestamp;
      console.log(`✅ [CACHE HIT] Używam danych z cache (wiek: ${age}ms)`);
      return costsCache.current.data;
    }
    
    console.log('🔄 [CACHE MISS] Obliczam koszty od nowa...');
    
    try {
      let totalMaterialCost = 0;
      const materialCosts = [];
      
      materials.forEach(material => {
        const materialId = material.inventoryItemId || material.id;
        const shouldInclude = includeInCosts[material.id] !== false;
        
        if (!shouldInclude) {
          materialCosts.push({
            ...material,
            cost: 0,
            unitPrice: 0,
            included: false
          });
          return;
        }
        
        // Oblicz średnią ważoną cenę
        const weightedPrice = calculateWeightedUnitPrice(material, materialId);
        
        // Użyj rzeczywistej ilości z materialQuantities
        const actualQuantity = materialQuantities[material.id] || material.quantity || 0;
        const plannedQuantity = preciseMultiply(actualQuantity, task.quantity || 1);
        
        const cost = preciseMultiply(plannedQuantity, weightedPrice);
        
        materialCosts.push({
          ...material,
          cost,
          unitPrice: weightedPrice,
          quantity: plannedQuantity,
          included: true
        });
        
        totalMaterialCost = preciseAdd(totalMaterialCost, cost);
      });
      
      // Oblicz koszty jednostkowe
      const taskQuantity = task.totalCompletedQuantity || task.quantity || 1;
      const unitMaterialCost = taskQuantity > 0 ? totalMaterialCost / taskQuantity : 0;
      
      // Koszty pełnej produkcji (materiały + praca)
      const laborCost = task.laborCost || 0;
      const totalFullProductionCost = preciseAdd(totalMaterialCost, laborCost);
      const unitFullProductionCost = taskQuantity > 0 ? totalFullProductionCost / taskQuantity : 0;
      
      const result = {
        totalMaterialCost: Math.round(totalMaterialCost * 10000) / 10000,
        unitMaterialCost: Math.round(unitMaterialCost * 10000) / 10000,
        totalFullProductionCost: Math.round(totalFullProductionCost * 10000) / 10000,
        unitFullProductionCost: Math.round(unitFullProductionCost * 10000) / 10000,
        materialCosts
      };
      
      // Zapisz w cache
      costsCache.current = {
        data: result,
        timestamp: now,
        dependenciesHash: currentHash
      };
      
      console.log('💾 [CACHE] Zapisano nowe obliczenia w cache');
      
      return result;
      
    } catch (error) {
      console.error('❌ Błąd podczas obliczania kosztów:', error);
      return {
        totalMaterialCost: 0,
        unitMaterialCost: 0,
        totalFullProductionCost: 0,
        unitFullProductionCost: 0,
        materialCosts: []
      };
    }
  }, [
    task,
    materials,
    materialQuantities,
    includeInCosts,
    calculateWeightedUnitPrice,
    generateDependenciesHash
  ]);
  
  // ✅ Porównanie kosztów z bazą danych
  const compareCostsWithDatabase = useCallback(async (calculatedCosts) => {
    if (!task?.id) return null;
    
    const dbCosts = {
      totalMaterialCost: task.totalMaterialCost || 0,
      unitMaterialCost: task.unitMaterialCost || 0,
      totalFullProductionCost: task.totalFullProductionCost || 0,
      unitFullProductionCost: task.unitFullProductionCost || 0
    };
    
    const differences = {
      totalMaterialCost: Math.abs(calculatedCosts.totalMaterialCost - dbCosts.totalMaterialCost),
      unitMaterialCost: Math.abs(calculatedCosts.unitMaterialCost - dbCosts.unitMaterialCost),
      totalFullProductionCost: Math.abs(calculatedCosts.totalFullProductionCost - dbCosts.totalFullProductionCost),
      unitFullProductionCost: Math.abs(calculatedCosts.unitFullProductionCost - dbCosts.unitFullProductionCost)
    };
    
    return { dbCosts, differences };
  }, [task]);
  
  // ✅ Memoizuj dependencies aby unikać niepotrzebnych re-renderów
  const taskCostDependencies = useMemo(() => ({
    consumedLength: task?.consumedMaterials?.length || 0,
    batchesHash: Object.keys(task?.materialBatches || {}).sort().join(','),
    totalMaterialCost: task?.totalMaterialCost || 0,
    unitMaterialCost: task?.unitMaterialCost || 0,
    totalFullProductionCost: task?.totalFullProductionCost || 0,
    unitFullProductionCost: task?.unitFullProductionCost || 0
  }), [
    task?.consumedMaterials?.length,
    task?.materialBatches,
    task?.totalMaterialCost,
    task?.unitMaterialCost,
    task?.totalFullProductionCost,
    task?.unitFullProductionCost
  ]);
  
  // ✅ Automatyczne obliczanie kosztów z debouncing
  useEffect(() => {
    if (!task?.id || !materials?.length) return;
    
    let isActive = true;
    const debounceTimeout = setTimeout(async () => {
      if (isActive) {
        const costs = await calculateAllCosts();
        if (isActive) {
          setCostsSummary(costs);
        }
      }
    }, 1200); // Debounce 1200ms
    
    return () => {
      isActive = false;
      clearTimeout(debounceTimeout);
    };
  }, [task?.id, taskCostDependencies, materialQuantities, materials?.length, calculateAllCosts]);
  
  return {
    costsSummary,
    calculateAllCosts,
    invalidateCache,
    compareCostsWithDatabase
  };
};

