import { useState } from 'react';
import { getItemBatches } from '../../services/inventory';
import { useNotification } from '../useNotification';
import { archiveInventoryItem, unarchiveInventoryItem } from '../../services/inventory';
import { useTranslation } from '../useTranslation';

export function useInventoryLabels({ fetchInventoryItems }) {
  const { showSuccess, showError } = useNotification();
  const { t } = useTranslation('inventory');

  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  const [selectedItemForLabel, setSelectedItemForLabel] = useState(null);
  const [selectedItemBatches, setSelectedItemBatches] = useState([]);
  const [loadingBatches, setLoadingBatches] = useState(false);

  const handleOpenLabelDialog = async (item) => {
    setSelectedItemForLabel(item);
    setLabelDialogOpen(true);
    try {
      setLoadingBatches(true);
      const batches = await getItemBatches(item.id);
      setSelectedItemBatches(batches);
    } catch (error) {
      console.error('Błąd podczas pobierania partii:', error);
      showError('Nie udało się pobrać partii dla tego produktu');
    } finally {
      setLoadingBatches(false);
    }
  };

  const handleCloseLabelDialog = () => {
    setLabelDialogOpen(false);
    setTimeout(() => { setSelectedItemForLabel(null); setSelectedItemBatches([]); }, 300);
  };

  const handleArchiveItem = async (item) => {
    try {
      if (item.archived) {
        await unarchiveInventoryItem(item.id);
        showSuccess(t('common:common.unarchiveSuccess'));
      } else {
        await archiveInventoryItem(item.id);
        showSuccess(t('common:common.archiveSuccess'));
      }
      fetchInventoryItems();
    } catch (error) {
      showError(error.message);
    }
  };

  return {
    labelDialogOpen, selectedItemForLabel,
    selectedItemBatches, loadingBatches,
    handleOpenLabelDialog, handleCloseLabelDialog, handleArchiveItem
  };
}
