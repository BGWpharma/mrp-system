import { useCallback } from 'react';

export const useReservationHandlers = ({
  batches,
  setReservationMethod,
  setManualBatchSelectionActive,
  setSelectedBatches,
  fetchBatchesForMaterials,
  fetchAwaitingOrdersForMaterials
}) => {
  const handleReservationMethodChange = useCallback((e) => {
    const newMethod = e.target.value;
    setReservationMethod(newMethod);

    if (newMethod === 'manual') {
      if (Object.keys(batches).length === 0) {
        fetchBatchesForMaterials();
      }
      fetchAwaitingOrdersForMaterials();
      setManualBatchSelectionActive(true);
    } else {
      setManualBatchSelectionActive(false);
    }
  }, [batches, setReservationMethod, setManualBatchSelectionActive, fetchBatchesForMaterials, fetchAwaitingOrdersForMaterials]);

  const handleBatchSelection = useCallback((materialId, batchId, quantity) => {
    const numericQuantity = parseFloat(quantity) || 0;

    setSelectedBatches(prev => {
      const materialBatches = [...(prev[materialId] || [])];
      const existingBatchIndex = materialBatches.findIndex(b => b.batchId === batchId);

      if (existingBatchIndex >= 0) {
        if (numericQuantity < 0) {
          materialBatches.splice(existingBatchIndex, 1);
        } else {
          materialBatches[existingBatchIndex].quantity = numericQuantity;
        }
      } else if (numericQuantity >= 0) {
        const batch = batches[materialId]?.find(b => b.id === batchId);
        if (batch) {
          materialBatches.push({
            batchId: batchId,
            quantity: numericQuantity,
            batchNumber: batch.batchNumber || batch.lotNumber || 'Bez numeru'
          });
        }
      }

      return {
        ...prev,
        [materialId]: materialBatches
      };
    });
  }, [batches, setSelectedBatches]);

  return {
    handleReservationMethodChange,
    handleBatchSelection
  };
};

export default useReservationHandlers;
