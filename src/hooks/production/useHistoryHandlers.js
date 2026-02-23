import { useCallback } from 'react';
import { addProductionSession, updateProductionSession, deleteProductionSession, addTaskProductToInventory } from '../../services/productionService';

export const useHistoryHandlers = ({
  task,
  currentUser,
  setLoading,
  setEditingHistoryItem,
  setEditedHistoryItem,
  editedHistoryItem,
  deleteHistoryItem,
  setDeleteHistoryItem,
  setDeleteHistoryDialogOpen,
  fetchProductionHistory,
  showSuccess,
  showError
}) => {
  const handleEditHistoryItem = useCallback((item) => {
    setEditingHistoryItem(item.id);
    setEditedHistoryItem({
      quantity: item.quantity || 0,
      startTime: item.startTime ? new Date(item.startTime) : new Date(),
      endTime: item.endTime ? new Date(item.endTime) : new Date(),
    });
  }, [setEditingHistoryItem, setEditedHistoryItem]);

  const handleCancelHistoryItemEdit = useCallback(() => {
    setEditingHistoryItem(null);
  }, [setEditingHistoryItem]);

  const handleSaveHistoryItemEdit = useCallback(async (historyItemId) => {
    try {
      setLoading(true);

      if (!historyItemId) {
        showError('Nie można edytować sesji produkcyjnej: brak identyfikatora');
        return;
      }

      if (editedHistoryItem.endTime < editedHistoryItem.startTime) {
        showError('Czas zakończenia nie może być wcześniejszy niż czas rozpoczęcia');
        return;
      }

      if (isNaN(editedHistoryItem.quantity) || editedHistoryItem.quantity < 0) {
        showError('Nieprawidłowa ilość');
        return;
      }

      const durationMs = editedHistoryItem.endTime.getTime() - editedHistoryItem.startTime.getTime();
      const durationMinutes = Math.round(durationMs / (1000 * 60));

      if (durationMinutes <= 0) {
        showError('Przedział czasowy musi być dłuższy niż 0 minut');
        return;
      }

      const updateData = {
        quantity: parseFloat(editedHistoryItem.quantity),
        timeSpent: durationMinutes,
        startTime: editedHistoryItem.startTime.toISOString(),
        endTime: editedHistoryItem.endTime.toISOString()
      };

      await updateProductionSession(historyItemId, updateData, currentUser.uid);
      showSuccess('Sesja produkcyjna została zaktualizowana');
      await fetchProductionHistory();
      setEditingHistoryItem(null);
    } catch (error) {
      console.error('Błąd podczas aktualizacji sesji produkcyjnej:', error);
      showError('Nie udało się zaktualizować sesji produkcyjnej: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [editedHistoryItem, currentUser?.uid, fetchProductionHistory, setLoading, setEditingHistoryItem, showSuccess, showError]);

  const handleDeleteHistoryItem = useCallback((item) => {
    setDeleteHistoryItem(item);
    setDeleteHistoryDialogOpen(true);
  }, [setDeleteHistoryItem, setDeleteHistoryDialogOpen]);

  const handleConfirmDeleteHistoryItem = useCallback(async () => {
    try {
      setLoading(true);

      if (!deleteHistoryItem || !deleteHistoryItem.id) {
        showError('Nie można usunąć sesji produkcyjnej: brak identyfikatora');
        return { success: false };
      }

      await deleteProductionSession(deleteHistoryItem.id, currentUser.uid);
      showSuccess('Sesja produkcyjna została usunięta');
      await fetchProductionHistory();
      setDeleteHistoryItem(null);
      return { success: true };
    } catch (error) {
      console.error('Błąd podczas usuwania sesji produkcyjnej:', error);
      showError('Nie udało się usunąć sesji produkcyjnej: ' + error.message);
      return { success: false, error };
    } finally {
      setLoading(false);
    }
  }, [deleteHistoryItem, currentUser?.uid, fetchProductionHistory, setLoading, setDeleteHistoryItem, showSuccess, showError]);

  const handleAddHistorySubmit = useCallback(async (formData) => {
    try {
      setLoading(true);

      const { quantity, startTime, endTime, machineId, note, addToInventory, inventoryData } = formData;

      const durationMs = new Date(endTime).getTime() - new Date(startTime).getTime();
      const durationMinutes = Math.round(durationMs / (1000 * 60));

      const sessionData = {
        quantity: parseFloat(quantity),
        timeSpent: durationMinutes,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        userId: currentUser.uid,
        machineId: machineId || null,
        note: note || ''
      };

      await addProductionSession(task.id, sessionData, addToInventory);

      if (addToInventory && inventoryData) {
        try {
          const result = await addTaskProductToInventory(task.id, currentUser.uid, {
            expiryDate: inventoryData.expiryDate instanceof Date
              ? inventoryData.expiryDate.toISOString()
              : inventoryData.expiryDate,
            lotNumber: inventoryData.lotNumber,
            finalQuantity: parseFloat(inventoryData.finalQuantity),
            warehouseId: inventoryData.warehouseId
          });

          showSuccess(`Sesja produkcyjna została dodana i ${result.message}`);
        } catch (inventoryError) {
          console.error('Błąd podczas dodawania produktu do magazynu:', inventoryError);
          showError('Sesja produkcyjna została dodana, ale wystąpił błąd podczas dodawania produktu do magazynu: ' + inventoryError.message);
          return { success: true };
        }
      } else {
        showSuccess('Sesja produkcyjna została dodana');
      }

      await fetchProductionHistory();
      return { success: true };
    } catch (error) {
      console.error('Błąd podczas dodawania sesji produkcyjnej:', error);
      showError('Nie udało się dodać sesji produkcyjnej: ' + error.message);
      return { success: false, error };
    } finally {
      setLoading(false);
    }
  }, [task?.id, currentUser?.uid, fetchProductionHistory, setLoading, showSuccess, showError]);

  return {
    handleEditHistoryItem,
    handleCancelHistoryItemEdit,
    handleSaveHistoryItemEdit,
    handleDeleteHistoryItem,
    handleConfirmDeleteHistoryItem,
    handleAddHistorySubmit
  };
};

export default useHistoryHandlers;
