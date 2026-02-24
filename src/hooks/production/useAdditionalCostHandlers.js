import { useCallback } from 'react';
import { getTaskById } from '../../services/productionService';

export const useAdditionalCostHandlers = ({
  id,
  task,
  setTask,
  currentUser,
  editingAdditionalCost,
  setEditingAdditionalCost,
  setAdditionalCostDialogOpen,
  setAdditionalCostToDelete,
  setDeleteAdditionalCostDialogOpen,
  additionalCostToDelete,
  setSavingAdditionalCost,
  showSuccess,
  showError
}) => {
  const handleAddAdditionalCost = useCallback(() => {
    setEditingAdditionalCost(null);
    setAdditionalCostDialogOpen(true);
  }, [setEditingAdditionalCost, setAdditionalCostDialogOpen]);

  const handleEditAdditionalCost = useCallback((item, index) => {
    setEditingAdditionalCost({ ...item, _editIndex: index });
    setAdditionalCostDialogOpen(true);
  }, [setEditingAdditionalCost, setAdditionalCostDialogOpen]);

  const handleDeleteAdditionalCost = useCallback((item) => {
    setAdditionalCostToDelete(item);
    setDeleteAdditionalCostDialogOpen(true);
  }, [setAdditionalCostToDelete, setDeleteAdditionalCostDialogOpen]);

  const handleSaveAdditionalCost = useCallback(async (data) => {
    try {
      setSavingAdditionalCost(true);
      const { updateTask } = await import('../../services/productionService');
      const currentAdditionalCosts = Array.isArray(task?.additionalCosts) ? [...task.additionalCosts] : [];
      let newList;
      const editIndex = editingAdditionalCost?._editIndex;
      if (data.id && editIndex >= 0 && editIndex < currentAdditionalCosts.length) {
        newList = currentAdditionalCosts.map((c, i) =>
          i === editIndex
            ? { ...c, id: c.id || data.id, name: data.name, amount: data.amount, currency: data.currency || 'EUR', invoiceDate: data.invoiceDate }
            : c
        );
      } else if (data.id && currentAdditionalCosts.some((c) => c.id === data.id)) {
        newList = currentAdditionalCosts.map((c) =>
          c.id === data.id ? { ...c, name: data.name, amount: data.amount, currency: data.currency || 'EUR', invoiceDate: data.invoiceDate } : c
        );
      } else {
        const newItem = {
          id: data.id || `ac_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
          name: data.name,
          amount: data.amount,
          currency: data.currency || 'EUR',
          invoiceDate: data.invoiceDate
        };
        newList = [...currentAdditionalCosts, newItem];
      }
      await updateTask(id, { additionalCosts: newList }, currentUser?.uid || 'system');
      const { updateTaskCostsAutomatically } = await import('../../services/productionService');
      await updateTaskCostsAutomatically(id, currentUser?.uid || 'system', 'Aktualizacja po zmianie dodatkowych kosztów');
      const updatedTask = await getTaskById(id);
      setTask(updatedTask);
      setAdditionalCostDialogOpen(false);
      setEditingAdditionalCost(null);
      showSuccess('Dodatkowy koszt został zapisany');
      return { success: true };
    } catch (error) {
      console.error('Błąd zapisywania dodatkowego kosztu:', error);
      showError('Błąd zapisywania: ' + (error?.message || error));
      return { success: false, error: { message: error?.message } };
    } finally {
      setSavingAdditionalCost(false);
    }
  }, [id, task, editingAdditionalCost, currentUser, setTask, setAdditionalCostDialogOpen, setEditingAdditionalCost, setSavingAdditionalCost, showSuccess, showError]);

  const handleConfirmDeleteAdditionalCost = useCallback(async () => {
    if (!additionalCostToDelete) return { success: false };
    try {
      const { updateTask } = await import('../../services/productionService');
      const currentAdditionalCosts = Array.isArray(task?.additionalCosts) ? task.additionalCosts : [];
      const itemToMatch = additionalCostToDelete;
      const invDateStr = itemToMatch.invoiceDate?.toDate
        ? itemToMatch.invoiceDate.toDate().toISOString().slice(0, 10)
        : (typeof itemToMatch.invoiceDate === 'string' ? itemToMatch.invoiceDate.slice(0, 10) : '');
      const newList = currentAdditionalCosts.filter((c) => {
        if (c.id && itemToMatch.id && c.id === itemToMatch.id) return false;
        const cDate = c.invoiceDate?.toDate ? c.invoiceDate.toDate().toISOString().slice(0, 10) : (typeof c.invoiceDate === 'string' ? c.invoiceDate.slice(0, 10) : '');
        if (c.name === itemToMatch.name && Number(c.amount) === Number(itemToMatch.amount) && cDate === invDateStr) return false;
        return true;
      });
      await updateTask(id, { additionalCosts: newList }, currentUser?.uid || 'system');
      const { updateTaskCostsAutomatically } = await import('../../services/productionService');
      await updateTaskCostsAutomatically(id, currentUser?.uid || 'system', 'Aktualizacja po usunięciu dodatkowego kosztu');
      const updatedTask = await getTaskById(id);
      setTask(updatedTask);
      setDeleteAdditionalCostDialogOpen(false);
      setAdditionalCostToDelete(null);
      showSuccess('Dodatkowy koszt został usunięty');
      return { success: true };
    } catch (error) {
      console.error('Błąd usuwania dodatkowego kosztu:', error);
      showError('Błąd usuwania: ' + (error?.message || error));
      return { success: false };
    }
  }, [id, task, additionalCostToDelete, currentUser, setTask, setDeleteAdditionalCostDialogOpen, setAdditionalCostToDelete, showSuccess, showError]);

  return {
    handleAddAdditionalCost,
    handleEditAdditionalCost,
    handleDeleteAdditionalCost,
    handleSaveAdditionalCost,
    handleConfirmDeleteAdditionalCost
  };
};

export default useAdditionalCostHandlers;
