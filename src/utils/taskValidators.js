import { getConsumedQuantityForMaterial } from './productionUtils';

const normalizeQuantity = (value) => {
  const num = Number(value) || 0;
  return Math.round(num * 1000) / 1000;
};

export const getRequiredQuantityForReservation = (material, materialId, materialQuantities, task) => {
  const baseQuantity = materialQuantities[materialId] !== undefined 
    ? materialQuantities[materialId] 
    : material.quantity;
  
  const consumedQuantity = getConsumedQuantityForMaterial(task.consumedMaterials, materialId);
  
  if (!task.materialConsumptionConfirmed) {
    return baseQuantity;
  } else {
    const remainingQuantity = Math.max(0, baseQuantity - consumedQuantity);
    return remainingQuantity;
  }
};

/**
 * @param {Array} materials
 * @param {Object} materialQuantities - { [materialId]: quantity }
 * @returns {{ isValid: boolean, errors: Object }}
 */
export const validateQuantities = (materials, materialQuantities) => {
  const newErrors = {};
  let isValid = true;
  
  materials.forEach(material => {
    const quantity = materialQuantities[material.id];
    
    if (isNaN(quantity)) {
      newErrors[material.id] = 'Ilość musi być liczbą';
      isValid = false;
    }
    else if (quantity < 0) {
      newErrors[material.id] = 'Ilość nie może być ujemna';
      isValid = false;
    }
  });
  
  return { isValid, errors: newErrors };
};

/**
 * @param {Object} task
 * @param {Object} selectedBatches - { [materialId]: [{ quantity, ... }] }
 * @param {Object} materialQuantities
 * @returns {{ valid: boolean, error?: string }}
 */
export const validateManualBatchSelection = (task, selectedBatches, materialQuantities) => {
  if (!task || !task.materials) return { valid: false, error: "Brak materiałów do walidacji" };
  
  for (const material of task.materials) {
    const materialId = material.inventoryItemId || material.id;
    if (!materialId) continue;
    
    const requiredQuantity = getRequiredQuantityForReservation(material, materialId, materialQuantities, task);
    
    if (task.materialConsumptionConfirmed && requiredQuantity <= 0) {
      continue;
    }
    
    const materialBatches = selectedBatches[materialId] || [];
    const totalSelectedQuantity = materialBatches.reduce((sum, batch) => sum + parseFloat(batch.quantity || 0), 0);
  }
  
  return { valid: true };
};

/**
 * @param {string} materialId
 * @param {Object} task
 * @param {Object} selectedBatches
 * @param {Object} materialQuantities
 * @returns {{ valid: boolean, error?: string }}
 */
export const validateManualBatchSelectionForMaterial = (materialId, task, selectedBatches, materialQuantities) => {
  const materialBatches = selectedBatches[materialId] || [];
  const material = task.materials.find(m => (m.inventoryItemId || m.id) === materialId);
  
  if (!material) {
    return { valid: false, error: `Nie znaleziono materiału dla ID: ${materialId}. Sprawdź czy materiał istnieje w zadaniu.` };
  }
  
  const requiredQuantity = getRequiredQuantityForReservation(material, materialId, materialQuantities, task);
  
  if (task.materialConsumptionConfirmed && requiredQuantity <= 0) {
    return { valid: true };
  }
  
  const totalSelectedQuantity = materialBatches.reduce((sum, batch) => sum + parseFloat(batch.quantity || 0), 0);
  
  return { valid: true };
};

/**
 * @param {Object} selectedBatchesToConsume - { [materialId]: { [batchId]: boolean } }
 * @param {Object} consumeQuantities - { [batchKey]: quantity }
 * @param {Object} task
 * @returns {{ isValid: boolean, errors: Object }}
 */
export const validateConsumeQuantities = (selectedBatchesToConsume, consumeQuantities, task) => {
  const errors = {};
  let isValid = true;

  Object.entries(selectedBatchesToConsume).forEach(([materialId, batches]) => {
    Object.entries(batches).forEach(([batchId, isSelected]) => {
      if (isSelected) {
        const batchKey = `${materialId}_${batchId}`;
        const quantity = consumeQuantities[batchKey];
        
        if (quantity === '' || quantity === null || quantity === undefined) {
          errors[batchKey] = 'Podaj ilość do konsumpcji';
          isValid = false;
        } else {
          const numericQuantity = normalizeQuantity(quantity);
          
          if (isNaN(numericQuantity)) {
            errors[batchKey] = 'Wartość musi być liczbą';
            isValid = false;
          } else if (numericQuantity <= 0) {
            errors[batchKey] = 'Wartość musi być większa od zera';
            isValid = false;
          } else {
            const reservedBatches = task.materialBatches[materialId] || [];
            const batch = reservedBatches.find(b => b.batchId === batchId);
            
            if (batch) {
              const reservedQuantity = normalizeQuantity(batch.quantity);
              
              if (numericQuantity > reservedQuantity) {
                errors[batchKey] = `Nie można skonsumować więcej niż zarezerwowano (${reservedQuantity})`;
                isValid = false;
              }
            }
          }
        }
      }
    });
  });

  return { isValid, errors };
};
