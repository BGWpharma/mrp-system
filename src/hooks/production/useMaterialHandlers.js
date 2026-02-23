import { useCallback } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { getTaskById } from '../../services/productionService';
import { getAllInventoryItems, getInventoryBatch, updateBatch } from '../../services/inventory';

export const useMaterialHandlers = ({
  task,
  id,
  currentUser,
  materials,
  errors,
  setErrors,
  setLoading,
  setMaterialQuantities,
  setIncludeInCosts,
  setMaterialToDelete,
  setDeleteMaterialDialogOpen,
  materialToDelete,
  invalidateCostsCache,
  // packaging state
  packagingItems,
  consumePackagingImmediately,
  setPackagingItems,
  setLoadingPackaging,
  setPackagingDialogOpen,
  // raw materials state
  materialCategoryTab,
  setMaterialCategoryTab,
  setSearchRawMaterials,
  setRawMaterialsItems,
  setLoadingRawMaterials,
  setRawMaterialsDialogOpen,
  showSuccess,
  showError
}) => {
  const handleQuantityChange = useCallback((materialId, value) => {
    const numValue = value === '' ? '' : parseFloat(value);

    if (value === '' || (!isNaN(numValue))) {
      setMaterialQuantities(prev => ({
        ...prev,
        [materialId]: numValue
      }));

      if (errors[materialId]) {
        setErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[materialId];
          return newErrors;
        });
      }
    }
  }, [errors, setMaterialQuantities, setErrors]);

  const handleDeleteMaterial = useCallback((material) => {
    setMaterialToDelete(material);
    setDeleteMaterialDialogOpen(true);
  }, [setMaterialToDelete, setDeleteMaterialDialogOpen]);

  const handleConfirmDeleteMaterial = useCallback(async () => {
    try {
      setLoading(true);

      if (!materialToDelete) {
        showError('Nie wybrano materiału do usunięcia');
        return { success: false };
      }

      const updatedTask = await getTaskById(id);
      const currentMaterials = updatedTask.materials || [];
      const updatedMaterials = currentMaterials.filter(m => m.id !== materialToDelete.id);

      await updateDoc(doc(db, 'productionTasks', id), {
        materials: updatedMaterials,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid
      });

      showSuccess(`Materiał "${materialToDelete.name}" został usunięty z zadania`);
      setMaterialToDelete(null);
      return { success: true };
    } catch (error) {
      console.error('Błąd podczas usuwania materiału:', error);
      showError('Nie udało się usunąć materiału: ' + error.message);
      return { success: false, error };
    } finally {
      setLoading(false);
    }
  }, [materialToDelete, id, currentUser?.uid, setLoading, setMaterialToDelete, showSuccess, showError]);

  const handleIncludeInCostsChange = useCallback(async (materialId, checked) => {
    try {
      setIncludeInCosts(prev => ({
        ...prev,
        [materialId]: checked
      }));

      if (task?.id) {
        const taskRef = doc(db, 'productionTasks', task.id);
        await updateDoc(taskRef, {
          [`materialInCosts.${materialId}`]: checked
        });
        invalidateCostsCache?.();
        showSuccess('Zaktualizowano ustawienia kosztów');
      }
    } catch (error) {
      console.error('Błąd podczas aktualizacji ustawień kosztów:', error);
      showError('Nie udało się zaktualizować ustawień kosztów');
    }
  }, [task?.id, setIncludeInCosts, invalidateCostsCache, showSuccess, showError]);

  // --- Packaging handlers ---

  const handlePackagingSelection = useCallback((itemId, selected) => {
    setPackagingItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, selected, selectedBatch: null, batchQuantity: 0 } : item
    ));
  }, [setPackagingItems]);

  const handlePackagingBatchSelection = useCallback((itemId, batchId) => {
    setPackagingItems(prev => prev.map(item => {
      if (item.id === itemId) {
        const selectedBatch = item.batches.find(batch => batch.id === batchId);
        return { ...item, selectedBatch, batchQuantity: 0 };
      }
      return item;
    }));
  }, [setPackagingItems]);

  const handlePackagingBatchQuantityChange = useCallback((itemId, value) => {
    setPackagingItems(prev => prev.map(item => {
      if (item.id === itemId && item.selectedBatch) {
        const parsedValue = parseFloat(value) || 0;
        const limitedValue = Math.min(parsedValue, item.selectedBatch.quantity);
        return { ...item, batchQuantity: limitedValue, quantity: limitedValue };
      }
      return item;
    }));
  }, [setPackagingItems]);

  const handleAddPackagingToTask = useCallback(async () => {
    try {
      setLoadingPackaging(true);

      const packagingToAdd = packagingItems.filter(item =>
        item.selected && item.selectedBatch && item.batchQuantity > 0
      );

      if (packagingToAdd.length === 0) {
        showError('Nie wybrano żadnych opakowań z partiami do dodania');
        return;
      }

      const updatedTask = await getTaskById(id);
      const currentMaterials = updatedTask.materials || [];

      const newMaterials = packagingToAdd.map(item => {
        const material = {
          id: item.id,
          name: item.name || '',
          quantity: item.batchQuantity || 0,
          unit: item.unit || '',
          inventoryItemId: item.id,
          isPackaging: true,
          category: item.category || 'Opakowania zbiorcze',
          unitPrice: item.unitPrice || 0,
          selectedBatch: {
            id: item.selectedBatch.id,
            quantity: item.batchQuantity || 0
          }
        };

        if (item.selectedBatch.lotNumber || item.selectedBatch.batchNumber) {
          material.selectedBatch.lotNumber = item.selectedBatch.lotNumber || item.selectedBatch.batchNumber;
        }
        if (item.selectedBatch.expiryDate) {
          material.selectedBatch.expiryDate = item.selectedBatch.expiryDate;
        }

        return material;
      });

      const updatedMaterials = [...currentMaterials];

      newMaterials.forEach(newMaterial => {
        const existingIndex = updatedMaterials.findIndex(m => m.id === newMaterial.id);
        if (existingIndex >= 0) {
          updatedMaterials[existingIndex].quantity =
            (parseFloat(updatedMaterials[existingIndex].quantity) || 0) +
            (parseFloat(newMaterial.quantity) || 0);
          if (newMaterial.selectedBatch) {
            updatedMaterials[existingIndex].selectedBatch = newMaterial.selectedBatch;
          }
        } else {
          updatedMaterials.push(newMaterial);
        }
      });

      let consumptionData = [];
      let successMessage = 'Opakowania zostały dodane do zadania';

      if (consumePackagingImmediately) {
        for (const item of packagingToAdd) {
          try {
            const currentBatch = await getInventoryBatch(item.selectedBatch.id);
            if (currentBatch) {
              const currentQuantity = Number(currentBatch.quantity) || 0;
              const consumeQuantity = Number(item.batchQuantity) || 0;
              const newQuantity = Math.max(0, currentQuantity - consumeQuantity);

              await updateBatch(item.selectedBatch.id, { quantity: newQuantity }, currentUser.uid);

              consumptionData.push({
                materialId: item.id,
                batchId: item.selectedBatch.id,
                batchNumber: item.selectedBatch.lotNumber || item.selectedBatch.batchNumber || 'Brak numeru',
                quantity: consumeQuantity,
                unitPrice: item.unitPrice || 0,
                timestamp: new Date().toISOString(),
                userId: currentUser.uid,
                userName: currentUser.displayName || currentUser.email,
                includeInCosts: true
              });
            }
          } catch (error) {
            console.error(`Błąd podczas konsumpcji partii ${item.selectedBatch.id}:`, error);
            showError(`Nie udało się skonsumować partii ${item.selectedBatch.lotNumber || item.selectedBatch.batchNumber}: ${error.message}`);
          }
        }
        successMessage = 'Opakowania zostały dodane do zadania i skonsumowane z wybranych partii';
      }

      const currentConsumedMaterials = updatedTask.consumedMaterials || [];
      const newConsumedMaterials = [...currentConsumedMaterials, ...consumptionData];

      const updatedActualUsage = { ...(updatedTask.actualMaterialUsage || {}) };
      updatedMaterials.forEach(material => {
        updatedActualUsage[material.id] = parseFloat(material.quantity) || 0;
      });

      const updateData = {
        materials: updatedMaterials,
        actualMaterialUsage: updatedActualUsage,
        updatedAt: serverTimestamp()
      };

      if (consumePackagingImmediately) {
        updateData.consumedMaterials = newConsumedMaterials;
      }

      await updateDoc(doc(db, 'productionTasks', id), updateData);
      showSuccess(successMessage);
      setPackagingDialogOpen(false);
    } catch (error) {
      console.error('Błąd podczas dodawania opakowań:', error);
      showError('Nie udało się dodać opakowań do zadania: ' + error.message);
    } finally {
      setLoadingPackaging(false);
    }
  }, [id, packagingItems, consumePackagingImmediately, currentUser, setLoadingPackaging, setPackagingDialogOpen, showSuccess, showError]);

  // --- Raw materials handlers ---

  const fetchAvailableRawMaterials = useCallback(async (category = null) => {
    try {
      setLoadingRawMaterials(true);
      const targetCategory = category || (materialCategoryTab === 0 ? 'Surowce' : 'Opakowania jednostkowe');
      const result = await getAllInventoryItems();
      const allItems = Array.isArray(result) ? result : result.items || [];
      const rawItems = allItems.filter(item => item.category === targetCategory);

      setRawMaterialsItems(rawItems.map(item => ({
        ...item,
        selected: false,
        quantity: 0,
        availableQuantity: item.currentQuantity || item.quantity || 0,
        unitPrice: item.unitPrice || item.price || 0
      })));
    } catch (error) {
      console.error('Błąd podczas pobierania materiałów:', error);
      showError('Nie udało się pobrać listy materiałów: ' + error.message);
    } finally {
      setLoadingRawMaterials(false);
    }
  }, [materialCategoryTab, setLoadingRawMaterials, setRawMaterialsItems, showError]);

  const handleOpenRawMaterialsDialog = useCallback(() => {
    setMaterialCategoryTab(0);
    setSearchRawMaterials('');
    fetchAvailableRawMaterials('Surowce');
    setRawMaterialsDialogOpen(true);
  }, [setMaterialCategoryTab, setSearchRawMaterials, fetchAvailableRawMaterials, setRawMaterialsDialogOpen]);

  const handleRawMaterialsQuantityChange = useCallback((itemId, value) => {
    setRawMaterialsItems(prev => prev.map(item => {
      if (item.id === itemId) {
        const parsedValue = value === '' ? '' : parseFloat(value);
        const finalValue = value === '' ? 0 : (isNaN(parsedValue) ? 0 : Math.max(0, parsedValue));
        return { ...item, quantity: finalValue, selected: finalValue > 0 };
      }
      return item;
    }));
  }, [setRawMaterialsItems]);

  const handleRawMaterialsSelection = useCallback((itemId, selected) => {
    setRawMaterialsItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, selected } : item
    ));
  }, [setRawMaterialsItems]);

  const handleAddRawMaterialsSubmit = useCallback(async (formData) => {
    try {
      setLoadingRawMaterials(true);

      const { items } = formData;
      if (!items || items.length === 0) {
        showError('Nie wybrano żadnych materiałów do dodania');
        return { success: false };
      }

      const updatedTask = await getTaskById(id);
      const currentMaterials = updatedTask.materials || [];

      const newMaterials = items.map(item => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        inventoryItemId: item.id,
        isRawMaterial: true,
        category: item.category || 'Surowce',
        unitPrice: item.unitPrice || 0
      }));

      const updatedMaterials = [...currentMaterials];
      newMaterials.forEach(newMaterial => {
        const existingIndex = updatedMaterials.findIndex(m => m.id === newMaterial.id);
        if (existingIndex >= 0) {
          updatedMaterials[existingIndex].quantity =
            (parseFloat(updatedMaterials[existingIndex].quantity) || 0) +
            (parseFloat(newMaterial.quantity) || 0);
        } else {
          updatedMaterials.push(newMaterial);
        }
      });

      const updatedActualUsage = { ...(updatedTask.actualMaterialUsage || {}) };
      updatedMaterials.forEach(material => {
        updatedActualUsage[material.id] = parseFloat(material.quantity) || 0;
      });

      await updateDoc(doc(db, 'productionTasks', id), {
        materials: updatedMaterials,
        actualMaterialUsage: updatedActualUsage,
        updatedAt: serverTimestamp()
      });

      showSuccess('Materiały zostały dodane do zadania produkcyjnego');
      return { success: true };
    } catch (error) {
      console.error('Błąd podczas dodawania materiałów:', error);
      showError('Nie udało się dodać materiałów do zadania: ' + error.message);
      return { success: false, error };
    } finally {
      setLoadingRawMaterials(false);
    }
  }, [id, setLoadingRawMaterials, showSuccess, showError]);

  return {
    handleQuantityChange,
    handleDeleteMaterial,
    handleConfirmDeleteMaterial,
    handleIncludeInCostsChange,
    handlePackagingSelection,
    handlePackagingBatchSelection,
    handlePackagingBatchQuantityChange,
    handleAddPackagingToTask,
    fetchAvailableRawMaterials,
    handleOpenRawMaterialsDialog,
    handleRawMaterialsQuantityChange,
    handleRawMaterialsSelection,
    handleAddRawMaterialsSubmit
  };
};

export default useMaterialHandlers;
