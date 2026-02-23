import { useCallback } from 'react';

const normalizeQuantity = (value) => {
  const num = Number(value) || 0;
  return Math.round(num * 1000) / 1000;
};

export const useConsumptionHandlers = ({
  task,
  materials,
  setConsumedMaterials,
  setConsumeQuantities,
  setSelectedBatchesToConsume,
  setConsumeErrors,
  setConsumeMaterialsDialogOpen
}) => {
  const handleConsumeQuantityChange = useCallback((materialId, batchId, value) => {
    const batchKey = `${materialId}_${batchId}`;
    const numericValue = parseFloat(value);

    setConsumeQuantities(prev => ({
      ...prev,
      [batchKey]: isNaN(numericValue) ? 0 : normalizeQuantity(numericValue)
    }));

    setConsumeErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[batchKey];
      return newErrors;
    });
  }, [setConsumeQuantities, setConsumeErrors]);

  const handleBatchToConsumeSelection = useCallback((materialId, batchId, selected) => {
    setSelectedBatchesToConsume(prev => ({
      ...prev,
      [materialId]: {
        ...prev[materialId],
        [batchId]: selected
      }
    }));
  }, [setSelectedBatchesToConsume]);

  const handleOpenConsumeMaterialsDialog = useCallback(() => {
    const reservedMaterials = materials.filter(material => {
      const materialId = material.inventoryItemId || material.id;
      const reservedBatches = task?.materialBatches?.[materialId];
      return reservedBatches && reservedBatches.length > 0;
    });

    setConsumedMaterials(reservedMaterials);

    const initialQuantities = {};
    const initialSelections = {};

    reservedMaterials.forEach(material => {
      const materialId = material.inventoryItemId || material.id;
      const reservedBatches = task.materialBatches[materialId] || [];
      initialSelections[materialId] = {};

      reservedBatches.forEach(batch => {
        const batchKey = `${materialId}_${batch.batchId}`;
        initialQuantities[batchKey] = '';
        initialSelections[materialId][batch.batchId] = false;
      });
    });

    setConsumeQuantities(initialQuantities);
    setSelectedBatchesToConsume(initialSelections);
    setConsumeErrors({});
    setConsumeMaterialsDialogOpen(true);
  }, [task, materials, setConsumedMaterials, setConsumeQuantities, setSelectedBatchesToConsume, setConsumeErrors, setConsumeMaterialsDialogOpen]);

  return {
    handleConsumeQuantityChange,
    handleBatchToConsumeSelection,
    handleOpenConsumeMaterialsDialog
  };
};

export default useConsumptionHandlers;
