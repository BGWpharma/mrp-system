/**
 * Hook do zarządzania obliczeniami kosztów zadania produkcyjnego
 * Implementuje cache z TTL 2s aby unikać wielokrotnych obliczeń
 * 
 * Zawiera:
 * - calculateAllCosts (zunifikowana funkcja kosztów)
 * - calculateWeightedUnitPrice (średnia ważona cena z rezerwacji PO)
 * - calculateMaterialReservationCoverage (pokrycie rezerwacji)
 * - getPriceBreakdownTooltip (tooltip składu ceny)
 * - isEstimatedPrice (czy cena jest szacunkowa)
 * - compareCostsWithDatabase (porównanie UI vs DB)
 * - BroadcastChannel sync (nasłuchiwanie aktualizacji kosztów)
 */

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { preciseAdd, preciseSubtract, preciseMultiply } from '../../utils/mathUtils';
import { getConsumedQuantityForMaterial } from '../../utils/productionUtils';
import { db } from '../../services/firebase/config';
import { doc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';

const EMPTY_COSTS = {
  consumed: { totalCost: 0, details: {} },
  reserved: { totalCost: 0, details: {} },
  poReservations: { totalCost: 0, details: {} },
  totalMaterialCost: 0,
  unitMaterialCost: 0,
  totalFullProductionCost: 0,
  unitFullProductionCost: 0,
  totalAdditionalCosts: 0
};

export const useTaskCosts = (task, materials, materialQuantities, includeInCosts, poReservations = []) => {
  const [costsSummary, setCostsSummary] = useState(EMPTY_COSTS);
  
  const costsCache = useRef({
    data: null,
    timestamp: null,
    dependenciesHash: null
  });
  
  const invalidateCache = useCallback(() => {
    costsCache.current = {
      data: null,
      timestamp: null,
      dependenciesHash: null
    };
  }, []);

  // Helper: filtruj PO rezerwacje dla danego materiału
  const getPOReservationsForMaterial = useCallback((materialId) => {
    return poReservations.filter(reservation => 
      reservation.materialId === materialId
    );
  }, [poReservations]);

  // Helper: filtruj aktywne PO rezerwacje (pending lub delivered ale nie w pełni przekształcone)
  const filterActivePOReservations = useCallback((allReservations) => {
    return allReservations.filter(reservation => {
      if (reservation.status === 'pending') return true;
      if (reservation.status === 'delivered') {
        const convertedQuantity = reservation.convertedQuantity || 0;
        const reservedQuantity = reservation.reservedQuantity || 0;
        return convertedQuantity < reservedQuantity;
      }
      return false;
    });
  }, []);

  // Średnia ważona cena jednostkowa z rezerwacji PO i szacunków
  const calculateWeightedUnitPrice = useCallback((material, materialId) => {
    const reservedBatches = task?.materialBatches?.[materialId];
    const allPOReservations = getPOReservationsForMaterial(materialId);
    const activePOReservations = filterActivePOReservations(allPOReservations);

    let totalQuantity = 0;
    let totalValue = 0;

    if (reservedBatches && reservedBatches.length > 0) {
      reservedBatches.forEach(batch => {
        const batchQuantity = parseFloat(batch.quantity || 0);
        const batchPrice = parseFloat(batch.unitPrice || material.unitPrice || 0);
        totalQuantity += batchQuantity;
        totalValue += batchQuantity * batchPrice;
      });
    }

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

    if (totalQuantity > 0 && totalValue > 0) {
      return totalValue / totalQuantity;
    }

    // Szacunkowa cena z bazy
    if (task?.estimatedMaterialCosts?.[materialId]) {
      const estimatedData = task.estimatedMaterialCosts[materialId];
      if (estimatedData.unitPrice > 0) {
        return parseFloat(estimatedData.unitPrice);
      }
    }

    // Dynamicznie obliczona cena z costsSummary
    if (costsSummary?.reserved?.details?.[materialId]) {
      const reservedData = costsSummary.reserved.details[materialId];
      if (reservedData.unitPrice > 0) {
        return parseFloat(reservedData.unitPrice);
      }
    }

    return 0;
  }, [task?.materialBatches, task?.estimatedMaterialCosts, costsSummary, getPOReservationsForMaterial, filterActivePOReservations]);

  // Czy cena materiału jest szacunkowa (brak rezerwacji)
  const isEstimatedPrice = useCallback((materialId) => {
    const reservedBatches = task?.materialBatches?.[materialId];
    const allPOReservations = getPOReservationsForMaterial(materialId);
    const activePOReservations = filterActivePOReservations(allPOReservations);

    const hasReservations = (reservedBatches && reservedBatches.length > 0) || activePOReservations.length > 0;
    const hasEstimatedData = (task?.estimatedMaterialCosts?.[materialId]) ||
                             (costsSummary?.reserved?.details?.[materialId]?.isEstimated);
    
    return !hasReservations && hasEstimatedData;
  }, [task?.materialBatches, task?.estimatedMaterialCosts, costsSummary, getPOReservationsForMaterial, filterActivePOReservations]);

  // Tooltip z informacją o składzie ceny
  const getPriceBreakdownTooltip = useCallback((material, materialId) => {
    const reservedBatches = task?.materialBatches?.[materialId];
    const allPOReservations = getPOReservationsForMaterial(materialId);
    const activePOReservations = filterActivePOReservations(allPOReservations);

    const breakdown = [];
    
    if (reservedBatches && reservedBatches.length > 0) {
      const batchTotal = reservedBatches.reduce((sum, batch) => sum + parseFloat(batch.quantity || 0), 0);
      breakdown.push(`Rezerwacje magazynowe: ${batchTotal} ${material.unit}`);
    }

    if (activePOReservations.length > 0) {
      const poTotal = activePOReservations.reduce((sum, reservation) => {
        const reservedQuantity = parseFloat(reservation.reservedQuantity || 0);
        const convertedQuantity = parseFloat(reservation.convertedQuantity || 0);
        return sum + (reservedQuantity - convertedQuantity);
      }, 0);
      breakdown.push(`Rezerwacje z PO: ${poTotal} ${material.unit}`);
      
      activePOReservations.forEach(reservation => {
        const availableQuantity = parseFloat(reservation.reservedQuantity || 0) - parseFloat(reservation.convertedQuantity || 0);
        const unitPrice = parseFloat(reservation.unitPrice || 0);
        breakdown.push(`  • PO ${reservation.poNumber}: ${availableQuantity} ${material.unit} @ ${unitPrice.toFixed(4)}€`);
      });
    }

    if (breakdown.length === 0) {
      const estimatedData = task?.estimatedMaterialCosts?.[materialId] || costsSummary?.reserved?.details?.[materialId];
      
      if (estimatedData && (estimatedData.unitPrice > 0 || estimatedData.averagePrice > 0)) {
        const batchCount = estimatedData.batchCount || 0;
        const unitPrice = estimatedData.unitPrice || estimatedData.averagePrice || 0;
        const priceSource = (estimatedData.priceSource === 'batch-weighted-average' || 
                            estimatedData.priceCalculationMethod === 'batch-weighted-average-estimated')
          ? `średnia ważona z ${batchCount} partii` 
          : batchCount > 0 ? `średnia ważona z ${batchCount} partii` : 'brak partii';
        return `📊 CENA SZACUNKOWA\n\nŹródło: ${priceSource}\nCena jednostkowa: ${parseFloat(unitPrice).toFixed(4)}€\n\nBrak rezerwacji - cena obliczona na podstawie historycznych cen zakupu.`;
      }
      
      return `Brak rezerwacji i brak partii w magazynie.\nCena jednostkowa: 0.0000€`;
    }

    return breakdown.join('\n');
  }, [task?.materialBatches, task?.estimatedMaterialCosts, costsSummary, getPOReservationsForMaterial, filterActivePOReservations]);

  // Pokrycie rezerwacji materiału
  const calculateMaterialReservationCoverage = useCallback((material, materialId) => {
    const actualUsage = task?.actualMaterialUsage || {};
    const requiredQuantity = (actualUsage[materialId] !== undefined) 
      ? parseFloat(actualUsage[materialId]) || 0
      : (materialQuantities[material.id] || material.quantity || 0);
    
    const consumedQuantity = getConsumedQuantityForMaterial(task?.consumedMaterials, materialId);
    
    const reservedBatches = task?.materialBatches?.[materialId];
    const standardReservationsTotal = reservedBatches ? reservedBatches.reduce((sum, batch) => {
      return sum + (parseFloat(batch.quantity || 0));
    }, 0) : 0;
    
    const allPOReservations = getPOReservationsForMaterial(materialId);
    const activePOReservationsTotal = filterActivePOReservations(allPOReservations)
      .reduce((sum, reservation) => {
        const convertedQuantity = reservation.convertedQuantity || 0;
        const reservedQuantity = reservation.reservedQuantity || 0;
        return sum + (reservedQuantity - convertedQuantity);
      }, 0);
    
    const formatPrecision = (value) => Math.round(value * 1000) / 1000;
    
    const formattedRequiredQuantity = formatPrecision(requiredQuantity);
    const formattedConsumedQuantity = formatPrecision(consumedQuantity);
    const formattedStandardReservationsTotal = formatPrecision(standardReservationsTotal);
    const totalCoverage = formatPrecision(formattedConsumedQuantity + formattedStandardReservationsTotal);
    
    const tolerance = 0.001;
    const hasFullCoverage = (totalCoverage + tolerance) >= formattedRequiredQuantity;
    
    return {
      requiredQuantity: formattedRequiredQuantity,
      consumedQuantity: formattedConsumedQuantity,
      standardReservationsTotal: formattedStandardReservationsTotal,
      activePOReservationsTotal,
      totalCoverage,
      hasFullCoverage,
      coveragePercentage: formattedRequiredQuantity > 0 ? (totalCoverage / formattedRequiredQuantity) * 100 : 100
    };
  }, [task?.actualMaterialUsage, task?.consumedMaterials, task?.materialBatches, materialQuantities, getPOReservationsForMaterial, filterActivePOReservations]);

  // Zunifikowana funkcja obliczania wszystkich kosztów
  const calculateAllCosts = useCallback(async (customConsumedMaterials = null, customMaterialBatches = null) => {
    try {
      if (!task?.id || !materials || materials.length === 0) {
        return EMPTY_COSTS;
      }

      const currentConsumedMaterials = customConsumedMaterials || task?.consumedMaterials || [];
      const currentMaterialBatches = customMaterialBatches || task?.materialBatches || {};
      
      const dependenciesHash = JSON.stringify({
        consumedLength: currentConsumedMaterials.length,
        consumedIds: currentConsumedMaterials.map(c => c.id || c.materialId).sort(),
        consumedDetails: currentConsumedMaterials.map(c => ({
          id: c.id || c.materialId,
          quantity: c.quantity,
          unitPrice: c.unitPrice,
          batchId: c.batchId,
          includeInCosts: c.includeInCosts
        })).sort((a, b) => (a.id || '').localeCompare(b.id || '')),
        batchesDetails: Object.entries(currentMaterialBatches)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([materialId, batches]) => ({
            materialId,
            batches: (batches || []).map(b => ({
              batchId: b.batchId,
              quantity: b.quantity,
              unitPrice: b.unitPrice
            }))
          })),
        taskUpdatedAt: task?.updatedAt?.toMillis?.() || task?.updatedAt || Date.now(),
        poReservationIds: (task?.poReservationIds || []).sort(),
        materialsLength: materials.length,
        taskQuantity: task?.quantity,
        completedQuantity: task?.completedQuantity,
        processingCost: task?.processingCostPerUnit,
        additionalCosts: (task?.additionalCosts?.length || 0)
      });
      
      const CACHE_TTL_MS = 2000;
      const now = Date.now();
      
      if (costsCache.current.data && 
          costsCache.current.dependenciesHash === dependenciesHash &&
          (now - costsCache.current.timestamp) < CACHE_TTL_MS) {
        return costsCache.current.data;
      }
      
      const { fixFloatingPointPrecision, preciseMultiply: pMul, preciseAdd: pAdd, preciseSubtract: pSub, preciseDivide } = await import('../../utils/mathUtils');
      
      let totalMaterialCost = 0;
      let totalFullProductionCost = 0;

      // ===== 1. KOSZTY SKONSUMOWANYCH MATERIAŁÓW =====
      const consumedCostDetails = {};
      
      if (currentConsumedMaterials.length > 0) {
        const uniqueBatchIds = [...new Set(
          currentConsumedMaterials
            .filter(consumed => consumed.batchId)
            .map(consumed => consumed.batchId)
        )];
        
        const consumedBatchPricesCache = {};
        const batchPromises = uniqueBatchIds.map(async (batchId) => {
          try {
            const batchRef = doc(db, 'inventoryBatches', batchId);
            const batchDoc = await getDoc(batchRef);
            if (batchDoc.exists()) {
              const batchData = batchDoc.data();
              consumedBatchPricesCache[batchId] = fixFloatingPointPrecision(parseFloat(batchData.unitPrice) || 0);
            } else {
              consumedBatchPricesCache[batchId] = 0;
              const consumptionsUsingThisBatch = currentConsumedMaterials.filter(c => c.batchId === batchId);
              console.warn(`⚠️ [UI-COSTS] Nie znaleziono partii ${batchId} | Używana przez ${consumptionsUsingThisBatch.length} konsumpcji:`, 
                consumptionsUsingThisBatch.map(c => `${c.materialName || c.materialId} (qty:${c.quantity}, price:${c.unitPrice})`)
              );
            }
          } catch (error) {
            console.warn(`⚠️ [UI-COSTS] Błąd podczas pobierania ceny skonsumowanej partii ${batchId}:`, error);
            consumedBatchPricesCache[batchId] = 0;
          }
        });
        
        await Promise.all(batchPromises);
        
        for (const consumed of currentConsumedMaterials) {
          const materialId = consumed.materialId;
          const material = materials.find(m => (m.inventoryItemId || m.id) === materialId);
          
          if (!material) continue;

          if (!consumedCostDetails[materialId]) {
            consumedCostDetails[materialId] = {
              material,
              totalQuantity: 0,
              totalCost: 0,
              batches: []
            };
          }

          let unitPrice = 0;
          let priceSource = 'fallback';

          if (consumed.unitPrice !== undefined && consumed.unitPrice > 0) {
            unitPrice = fixFloatingPointPrecision(parseFloat(consumed.unitPrice));
            priceSource = 'consumed-record';
          } else if (consumed.batchId && consumedBatchPricesCache[consumed.batchId] > 0) {
            unitPrice = consumedBatchPricesCache[consumed.batchId];
            priceSource = 'batch-current-ui';
          } else if (material.unitPrice > 0) {
            unitPrice = fixFloatingPointPrecision(parseFloat(material.unitPrice));
            priceSource = 'material-fallback';
          }

          const quantity = fixFloatingPointPrecision(parseFloat(consumed.quantity) || 0);
          const cost = pMul(quantity, unitPrice);

          consumedCostDetails[materialId].totalQuantity = pAdd(
            consumedCostDetails[materialId].totalQuantity, 
            quantity
          );
          consumedCostDetails[materialId].totalCost = pAdd(
            consumedCostDetails[materialId].totalCost, 
            cost
          );
          consumedCostDetails[materialId].batches.push({
            batchId: consumed.batchId,
            quantity,
            unitPrice,
            cost,
            priceSource
          });

          const shouldIncludeInCosts = consumed.includeInCosts !== undefined 
            ? consumed.includeInCosts 
            : (includeInCosts[material.id] !== false);

          if (shouldIncludeInCosts) {
            totalMaterialCost = pAdd(totalMaterialCost, cost);
          }

          totalFullProductionCost = pAdd(totalFullProductionCost, cost);
        }
      }

      // ===== 2. KOSZTY ZAREZERWOWANYCH (NIESKONSUMOWANYCH) MATERIAŁÓW =====
      const reservedCostDetails = {};
      const poReservationsCostDetails = {};
      
      const poReservationsByMaterial = {};
      if (task?.poReservationIds && task.poReservationIds.length > 0) {
        const { getPOReservationsForTask } = await import('../../services/poReservationService');
        const fetchedPOReservations = await getPOReservationsForTask(task.id);
        
        const activePoReservations = fetchedPOReservations.filter(r => 
          r.status === 'pending' || r.status === 'delivered'
        );
        
        for (const poRes of activePoReservations) {
          const materialId = poRes.materialId;
          if (!poReservationsByMaterial[materialId]) {
            poReservationsByMaterial[materialId] = [];
          }
          poReservationsByMaterial[materialId].push(poRes);
        }
      }

      if (materials.length > 0) {
        const allReservedBatchIds = [];
        Object.values(currentMaterialBatches).forEach(batches => {
          if (Array.isArray(batches)) {
            batches.forEach(batch => {
              if (batch.batchId) allReservedBatchIds.push(batch.batchId);
            });
          }
        });
        
        const uniqueReservedBatchIds = [...new Set(allReservedBatchIds)];
        const batchPricesCache = {};
        
        if (uniqueReservedBatchIds.length > 0) {
          const reservedBatchPromises = uniqueReservedBatchIds.map(async (batchId) => {
            try {
              const batchRef = doc(db, 'inventoryBatches', batchId);
              const batchDoc = await getDoc(batchRef);
              if (batchDoc.exists()) {
                const batchData = batchDoc.data();
                const { fixFloatingPointPrecision: fix } = await import('../../utils/mathUtils');
                batchPricesCache[batchId] = fix(parseFloat(batchData.unitPrice) || 0);
              } else {
                batchPricesCache[batchId] = 0;
                console.warn(`⚠️ [UI-COSTS] Nie znaleziono zarezerwowanej partii ${batchId}`);
              }
            } catch (error) {
              console.warn(`⚠️ [UI-COSTS] Błąd podczas pobierania ceny zarezerwowanej partii ${batchId}:`, error);
              batchPricesCache[batchId] = 0;
            }
          });
          
          await Promise.all(reservedBatchPromises);
        }

        // Dynamicznie pobierz szacunkowe ceny dla materiałów bez rezerwacji
        const materialIdsWithoutReservationsOrEstimates = materials
          .filter(material => {
            const materialId = material.inventoryItemId || material.id;
            const reservedBatches = currentMaterialBatches[materialId];
            const poReservationsForMaterial = poReservationsByMaterial[materialId] || [];
            const hasStandardReservations = reservedBatches && reservedBatches.length > 0;
            const hasPOReservations = poReservationsForMaterial.length > 0;
            const hasEstimatedData = task?.estimatedMaterialCosts?.[materialId];
            const hasConsumption = currentConsumedMaterials.some(c => c.materialId === materialId);
            
            return !hasStandardReservations && !hasPOReservations && !hasConsumption && !hasEstimatedData;
          })
          .map(m => m.inventoryItemId || m.id)
          .filter(Boolean);

        let dynamicEstimatedPrices = {};
        if (materialIdsWithoutReservationsOrEstimates.length > 0) {
          try {
            const { calculateEstimatedPricesForMultipleMaterials } = await import('../../services/inventory');
            dynamicEstimatedPrices = await calculateEstimatedPricesForMultipleMaterials(materialIdsWithoutReservationsOrEstimates);
          } catch (error) {
            console.warn('[UI-COSTS] Błąd podczas pobierania dynamicznych szacunkowych cen:', error);
          }
        }

        materials.forEach(material => {
          const materialId = material.inventoryItemId || material.id;
          const reservedBatches = currentMaterialBatches[materialId];
          const poReservationsForMaterial = poReservationsByMaterial[materialId] || [];
          
          const hasStandardReservations = reservedBatches && reservedBatches.length > 0;
          const hasPOReservations = poReservationsForMaterial.length > 0;

          const consumedQuantity = currentConsumedMaterials
            .filter(consumed => consumed.materialId === materialId)
            .reduce((sum, consumed) => {
              const qty = fixFloatingPointPrecision(parseFloat(consumed.quantity) || 0);
              return pAdd(sum, qty);
            }, 0);
          
          const requiredQuantity = fixFloatingPointPrecision(
            parseFloat(materialQuantities[material.id] || material.quantity) || 0
          );
          const remainingQuantity = Math.max(0, pSub(requiredQuantity, consumedQuantity));
          
          // Materiały bez rezerwacji - szacunkowa cena
          if (!hasStandardReservations && !hasPOReservations) {
            const hasConsumption = consumedQuantity > 0;
            
            if (hasConsumption) {
              return;
            }
            
            if (remainingQuantity > 0) {
              const estimatedData = task?.estimatedMaterialCosts?.[materialId] || dynamicEstimatedPrices[materialId];
              let unitPrice = 0;
              let priceCalculationMethod = 'no-batches';
              let batchCount = 0;
              
              if (estimatedData && estimatedData.unitPrice > 0) {
                unitPrice = fixFloatingPointPrecision(estimatedData.unitPrice);
                priceCalculationMethod = 'batch-weighted-average-estimated';
                batchCount = estimatedData.batchCount || 0;
              } else if (estimatedData && estimatedData.averagePrice > 0) {
                unitPrice = fixFloatingPointPrecision(estimatedData.averagePrice);
                priceCalculationMethod = 'batch-weighted-average-estimated';
                batchCount = estimatedData.batchCount || 0;
              }
              
              const materialCost = pMul(remainingQuantity, unitPrice);
              
              reservedCostDetails[materialId] = {
                material,
                quantity: remainingQuantity,
                unitPrice,
                cost: materialCost,
                priceCalculationMethod,
                batchesUsed: 0,
                poReservationsUsed: 0,
                isEstimated: true
              };
              
              const shouldIncludeInCosts = includeInCosts[material.id] !== false;
              
              if (shouldIncludeInCosts) {
                totalMaterialCost = pAdd(totalMaterialCost, materialCost);
              }
              totalFullProductionCost = pAdd(totalFullProductionCost, materialCost);
            }
            return;
          }
          
          if (remainingQuantity > 0) {
            let weightedPriceSum = 0;
            let totalReservedQuantity = 0;
            
            if (hasStandardReservations) {
              reservedBatches.forEach(batch => {
                const batchQuantity = fixFloatingPointPrecision(parseFloat(batch.quantity) || 0);
                let batchPrice = 0;
                
                if (batch.batchId && batchPricesCache[batch.batchId] > 0) {
                  batchPrice = batchPricesCache[batch.batchId];
                } else if (batch.unitPrice > 0) {
                  batchPrice = fixFloatingPointPrecision(parseFloat(batch.unitPrice));
                } else if (material.unitPrice > 0) {
                  batchPrice = fixFloatingPointPrecision(parseFloat(material.unitPrice));
                }
                
                if (batchQuantity > 0 && batchPrice > 0) {
                  weightedPriceSum = pAdd(weightedPriceSum, pMul(batchPrice, batchQuantity));
                  totalReservedQuantity = pAdd(totalReservedQuantity, batchQuantity);
                }
              });
            }
            
            if (hasPOReservations) {
              poReservationsForMaterial.forEach(poRes => {
                const reservedQuantity = fixFloatingPointPrecision(parseFloat(poRes.reservedQuantity) || 0);
                const convertedQuantity = fixFloatingPointPrecision(parseFloat(poRes.convertedQuantity) || 0);
                const availableQuantity = Math.max(0, pSub(reservedQuantity, convertedQuantity));
                const unitPrice = fixFloatingPointPrecision(parseFloat(poRes.unitPrice) || 0);
                
                if (availableQuantity > 0 && unitPrice > 0) {
                  weightedPriceSum = pAdd(weightedPriceSum, pMul(unitPrice, availableQuantity));
                  totalReservedQuantity = pAdd(totalReservedQuantity, availableQuantity);
                  
                  if (!poReservationsCostDetails[materialId]) {
                    poReservationsCostDetails[materialId] = {
                      material,
                      reservations: []
                    };
                  }
                  poReservationsCostDetails[materialId].reservations.push({
                    poNumber: poRes.poNumber,
                    quantity: availableQuantity,
                    unitPrice,
                    status: poRes.status
                  });
                }
              });
            }
            
            let materialCost = 0;
            let unitPrice = 0;
            let priceCalculationMethod = 'fallback';
            
            if (totalReservedQuantity > 0) {
              unitPrice = preciseDivide(weightedPriceSum, totalReservedQuantity);
              materialCost = pMul(remainingQuantity, unitPrice);
              priceCalculationMethod = 'weighted-average';
            } else {
              unitPrice = fixFloatingPointPrecision(parseFloat(material.unitPrice) || 0);
              materialCost = pMul(remainingQuantity, unitPrice);
              priceCalculationMethod = 'material-fallback';
            }
            
            reservedCostDetails[materialId] = {
              material,
              quantity: remainingQuantity,
              unitPrice,
              cost: materialCost,
              priceCalculationMethod,
              batchesUsed: hasStandardReservations ? reservedBatches.length : 0,
              poReservationsUsed: hasPOReservations ? poReservationsForMaterial.length : 0
            };
            
            const shouldIncludeInCosts = includeInCosts[material.id] !== false;
            
            if (shouldIncludeInCosts) {
              totalMaterialCost = pAdd(totalMaterialCost, materialCost);
            }

            totalFullProductionCost = pAdd(totalFullProductionCost, materialCost);
          }
        });
      }

      // ===== 3. KOSZT PROCESOWY =====
      let processingCostPerUnit = 0;
      if (task?.processingCostPerUnit !== undefined && task?.processingCostPerUnit !== null) {
        const { fixFloatingPointPrecision: fix } = await import('../../utils/mathUtils');
        processingCostPerUnit = fix(parseFloat(task.processingCostPerUnit) || 0);
      }

      const completedQuantity = fixFloatingPointPrecision(parseFloat(task?.totalCompletedQuantity) || 0);
      
      const totalProcessingCost = processingCostPerUnit > 0 && completedQuantity > 0
        ? pMul(processingCostPerUnit, completedQuantity)
        : 0;

      totalMaterialCost = pAdd(totalMaterialCost, totalProcessingCost);
      totalFullProductionCost = pAdd(totalFullProductionCost, totalProcessingCost);

      // ===== 4. DODATKOWE KOSZTY =====
      let totalAdditionalCostsInEUR = 0;
      if (task?.additionalCosts && Array.isArray(task.additionalCosts) && task.additionalCosts.length > 0) {
        const { convertAdditionalCostToEUR } = await import('../../utils/nbpExchangeRates');
        for (const item of task.additionalCosts) {
          const amount = parseFloat(item.amount) || 0;
          if (amount <= 0) continue;
          const currency = (item.currency || 'EUR').toUpperCase();
          const invoiceDate = item.invoiceDate
            ? (item.invoiceDate?.toDate ? item.invoiceDate.toDate() : new Date(item.invoiceDate))
            : new Date();
          const { amountInEUR } = await convertAdditionalCostToEUR(amount, currency, invoiceDate);
          totalAdditionalCostsInEUR = pAdd(totalAdditionalCostsInEUR, amountInEUR);
        }
        totalMaterialCost = pAdd(totalMaterialCost, totalAdditionalCostsInEUR);
        totalFullProductionCost = pAdd(totalFullProductionCost, totalAdditionalCostsInEUR);
      }

      // ===== 5. KOSZTY NA JEDNOSTKĘ =====
      const taskQuantity = fixFloatingPointPrecision(parseFloat(task?.quantity) || 1);
      const unitMaterialCost = taskQuantity > 0 ? preciseDivide(totalMaterialCost, taskQuantity) : 0;
      const unitFullProductionCost = taskQuantity > 0 ? preciseDivide(totalFullProductionCost, taskQuantity) : 0;

      const finalResults = {
        consumed: {
          totalCost: fixFloatingPointPrecision(
            Object.values(consumedCostDetails).reduce((sum, item) => pAdd(sum, item.totalCost || 0), 0)
          ),
          details: consumedCostDetails
        },
        reserved: {
          totalCost: fixFloatingPointPrecision(
            Object.values(reservedCostDetails).reduce((sum, item) => pAdd(sum, item.cost || 0), 0)
          ),
          details: reservedCostDetails
        },
        poReservations: {
          totalCost: fixFloatingPointPrecision(
            Object.values(poReservationsCostDetails).reduce((sum, item) => pAdd(sum, item.cost || 0), 0)
          ),
          details: poReservationsCostDetails
        },
        totalMaterialCost: fixFloatingPointPrecision(totalMaterialCost),
        unitMaterialCost: fixFloatingPointPrecision(unitMaterialCost),
        totalFullProductionCost: fixFloatingPointPrecision(totalFullProductionCost),
        unitFullProductionCost: fixFloatingPointPrecision(unitFullProductionCost),
        totalAdditionalCosts: fixFloatingPointPrecision(totalAdditionalCostsInEUR)
      };

      costsCache.current = {
        data: finalResults,
        timestamp: Date.now(),
        dependenciesHash: dependenciesHash
      };

      return finalResults;

    } catch (error) {
      console.error('❌ [UI-COSTS] Błąd podczas zunifikowanego obliczania kosztów w UI:', error);
      return EMPTY_COSTS;
    }
  }, [task, materials, materialQuantities, includeInCosts]);

  // Porównanie kosztów UI vs baza danych
  const compareCostsWithDatabase = useCallback(async (providedUiCosts = null) => {
    try {
      const uiCosts = providedUiCosts || await calculateAllCosts();
      
      const { getTaskById } = await import('../../services/productionService');
      const freshTask = await getTaskById(task.id);
      
      const dbCosts = {
        totalMaterialCost: freshTask?.totalMaterialCost || 0,
        unitMaterialCost: freshTask?.unitMaterialCost || 0,
        totalFullProductionCost: freshTask?.totalFullProductionCost || 0,
        unitFullProductionCost: freshTask?.unitFullProductionCost || 0
      };
      
      const differences = {
        totalMaterialCost: Math.abs(uiCosts.totalMaterialCost - dbCosts.totalMaterialCost),
        unitMaterialCost: Math.abs(uiCosts.unitMaterialCost - dbCosts.unitMaterialCost),
        totalFullProductionCost: Math.abs(uiCosts.totalFullProductionCost - dbCosts.totalFullProductionCost),
        unitFullProductionCost: Math.abs(uiCosts.unitFullProductionCost - dbCosts.unitFullProductionCost)
      };
      
      return { uiCosts, dbCosts, differences };
    } catch (error) {
      console.error('❌ [COST-COMPARE] Błąd podczas porównywania kosztów:', error);
      return null;
    }
  }, [task?.id, calculateAllCosts]);

  // Memoizowane dependencies kosztów
  const taskCostDependencies = useMemo(() => ({
    consumedLength: task?.consumedMaterials?.length || 0,
    batchesHash: Object.keys(task?.materialBatches || {}).sort().join(','),
    totalMaterialCost: task?.totalMaterialCost || 0,
    unitMaterialCost: task?.unitMaterialCost || 0,
    totalFullProductionCost: task?.totalFullProductionCost || 0,
    unitFullProductionCost: task?.unitFullProductionCost || 0,
    factoryCostTotal: task?.factoryCostTotal || 0,
    factoryCostPerUnit: task?.factoryCostPerUnit || 0,
    totalCostWithFactory: task?.totalCostWithFactory || 0,
    unitCostWithFactory: task?.unitCostWithFactory || 0
  }), [
    task?.consumedMaterials?.length,
    task?.materialBatches,
    task?.totalMaterialCost,
    task?.unitMaterialCost,
    task?.totalFullProductionCost,
    task?.unitFullProductionCost,
    task?.factoryCostTotal,
    task?.factoryCostPerUnit,
    task?.totalCostWithFactory,
    task?.unitCostWithFactory
  ]);

  // Automatyczne obliczanie kosztów z debouncing + synchronizacja z DB
  useEffect(() => {
    if (!task?.id || !materials?.length) return;
    
    let isActive = true;
    let debounceTimeout = null;
    
    const updateCostsAndSync = async () => {
      try {
        const costs = await calculateAllCosts();
        if (!isActive) return;
        
        setCostsSummary(costs);
        
        const comparison = await compareCostsWithDatabase(costs);
        if (!comparison || !isActive) return;
        
        const { differences } = comparison;
        const COST_TOLERANCE = 0.005;
        const maxChange = Math.max(...Object.values(differences));
        const costChanged = maxChange > COST_TOLERANCE;
        
        if (costChanged) {
          setTimeout(async () => {
            if (!isActive) return;
            try {
              const { updateTaskCostsAutomatically, getTaskById } = await import('../../services/productionService');
              await updateTaskCostsAutomatically(
                task.id, 
                'system', 
                'Synchronizacja kosztów - różnica między UI a bazą danych'
              );
            } catch (error) {
              console.error('❌ [COST-SYNC] Błąd podczas synchronizacji kosztów:', error);
            }
          }, 2000);
        }
      } catch (error) {
        console.error('❌ [TaskCosts] updateCostsAndSync błąd:', error);
      }
    };
    
    debounceTimeout = setTimeout(() => {
      if (isActive) updateCostsAndSync();
    }, 1200);
    
    return () => {
      isActive = false;
      if (debounceTimeout) clearTimeout(debounceTimeout);
    };
  }, [task?.id, taskCostDependencies, materialQuantities, materials?.length, calculateAllCosts, compareCostsWithDatabase]);

  // BroadcastChannel - nasłuchiwanie aktualizacji kosztów z innych miejsc
  useEffect(() => {
    if (!task?.id) return;

    let channel;
    try {
      channel = new BroadcastChannel('production-costs-update');
      
      const handleCostUpdate = async (event) => {
        const { type, taskId, batchIds } = event.data;
        
        if (type === 'TASK_COSTS_UPDATED' && taskId === task.id) {
          setTimeout(async () => {
            invalidateCache();
            const costs = await calculateAllCosts();
            setCostsSummary(costs);
          }, 500);
        }
        
        if (type === 'BATCH_COSTS_UPDATED' && batchIds && batchIds.length > 0) {
          const taskBatchIds = new Set();
          
          if (task.materialBatches) {
            Object.values(task.materialBatches).forEach(batches => {
              if (Array.isArray(batches)) {
                batches.forEach(batch => {
                  if (batch.batchId) taskBatchIds.add(batch.batchId);
                });
              }
            });
          }
          
          if (task.consumedMaterials) {
            task.consumedMaterials.forEach(consumed => {
              if (consumed.batchId) taskBatchIds.add(consumed.batchId);
            });
          }
          
          const affectedBatch = batchIds.find(batchId => taskBatchIds.has(batchId));
          
          if (affectedBatch) {
            setTimeout(async () => {
              invalidateCache();
              const costs = await calculateAllCosts();
              setCostsSummary(costs);
            }, 2000);
          }
        }
      };

      channel.addEventListener('message', handleCostUpdate);
    } catch (error) {
      console.warn('Nie można utworzyć BroadcastChannel dla kosztów zadań:', error);
    }

    return () => {
      if (channel) {
        channel.close();
      }
    };
  }, [task?.id, task?.materialBatches, task?.consumedMaterials, calculateAllCosts, invalidateCache]);

  return {
    costsSummary,
    setCostsSummary,
    calculateAllCosts,
    invalidateCache,
    compareCostsWithDatabase,
    calculateWeightedUnitPrice,
    calculateMaterialReservationCoverage,
    getPriceBreakdownTooltip,
    isEstimatedPrice,
    getPOReservationsForMaterial,
    taskCostDependencies
  };
};
