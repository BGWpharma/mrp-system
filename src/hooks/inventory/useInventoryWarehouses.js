import { useState, useEffect, useRef } from 'react';
import { getAllWarehouses, createWarehouse, updateWarehouse, deleteWarehouse, getAllInventoryItems, getItemBatches } from '../../services/inventory';
import { formatQuantity } from '../../utils/formatting';
import { useAuth } from '../useAuth';
import { useNotification } from '../useNotification';
import { useInventoryListState } from '../../contexts/InventoryListStateContext';
import { useTranslation } from '../useTranslation';

export function useInventoryWarehouses({ setConfirmDialog }) {
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const { t } = useTranslation('inventory');
  const { state: listState, actions: listActions } = useInventoryListState();

  const selectedWarehouseForView = listState.selectedWarehouseForView;
  const warehouseItemsPage = listState.warehouseItemsPage;
  const warehouseItemsPageSize = listState.warehouseItemsPageSize;
  const warehouseSearchTerm = listState.warehouseSearchTerm;
  const warehouseItemsSort = listState.warehouseItemsSort;

  const [warehouses, setWarehouses] = useState([]);
  const [warehousesLoading, setWarehousesLoading] = useState(true);
  const [openWarehouseDialog, setOpenWarehouseDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState('add');
  const [selectedWarehouseForEdit, setSelectedWarehouseForEdit] = useState(null);
  const [warehouseFormData, setWarehouseFormData] = useState({ name: '', address: '', description: '' });
  const [savingWarehouse, setSavingWarehouse] = useState(false);
  const [warehouseItems, setWarehouseItems] = useState([]);
  const [warehouseItemsLoading, setWarehouseItemsLoading] = useState(false);
  const [warehouseItemsTotalCount, setWarehouseItemsTotalCount] = useState(0);
  const [warehouseItemsTotalPages, setWarehouseItemsTotalPages] = useState(1);
  const [batchesDialogOpen, setBatchesDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedItemBatches, setSelectedItemBatches] = useState([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const warehouseSearchTermRef = useRef(null);

  useEffect(() => { fetchWarehouses(); }, []);

  const fetchWarehouses = async () => {
    try {
      const warehousesList = await getAllWarehouses();
      setWarehouses(warehousesList);
    } catch (error) {
      console.error('Błąd podczas pobierania lokalizacji:', error);
      showError('Błąd podczas pobierania lokalizacji');
    } finally {
      setWarehousesLoading(false);
    }
  };

  const handleWarehouseChange = (event) => { listActions.setSelectedWarehouse(event.target.value); };

  const handleOpenWarehouseDialog = (mode, warehouse = null) => {
    setDialogMode(mode);
    setSelectedWarehouseForEdit(warehouse);
    if (mode === 'edit' && warehouse) {
      setWarehouseFormData({ name: warehouse.name || '', address: warehouse.address || '', description: warehouse.description || '' });
    } else {
      setWarehouseFormData({ name: '', address: '', description: '' });
    }
    setOpenWarehouseDialog(true);
  };

  const handleCloseWarehouseDialog = () => { setOpenWarehouseDialog(false); setSelectedWarehouseForEdit(null); };

  const handleWarehouseFormChange = (e) => {
    const { name, value } = e.target;
    setWarehouseFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmitWarehouse = async () => {
    if (!warehouseFormData.name) { showError('Nazwa lokalizacji jest wymagana'); return; }
    setSavingWarehouse(true);
    try {
      if (dialogMode === 'add') {
        await createWarehouse(warehouseFormData, currentUser.uid);
        showSuccess('Lokalizacja została utworzona');
      } else {
        await updateWarehouse(selectedWarehouseForEdit.id, warehouseFormData, currentUser.uid);
        showSuccess('Lokalizacja została zaktualizowana');
      }
      handleCloseWarehouseDialog();
      fetchWarehouses();
    } catch (error) {
      showError('Błąd podczas zapisywania lokalizacji: ' + error.message);
    } finally {
      setSavingWarehouse(false);
    }
  };

  const handleDeleteWarehouse = async (warehouseId) => {
    setConfirmDialog({
      open: true,
      title: 'Potwierdzenie usunięcia',
      message: 'Czy na pewno chcesz usunąć tę lokalizację? Ta operacja jest nieodwracalna.',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        try {
          await deleteWarehouse(warehouseId);
          fetchWarehouses();
          showSuccess('Lokalizacja została usunięta');
        } catch (error) {
          showError('Błąd podczas usuwania lokalizacji: ' + error.message);
        }
      }
    });
  };

  const fetchWarehouseItems = async (warehouseId, newSortField = null, newSortOrder = null) => {
    setWarehouseItemsLoading(true);
    try {
      const sortFieldToUse = newSortField || warehouseItemsSort.field;
      const sortOrderToUse = newSortOrder || warehouseItemsSort.order;
      const result = await getAllInventoryItems(
        warehouseId, warehouseItemsPage, warehouseItemsPageSize,
        warehouseSearchTerm.trim() !== '' ? warehouseSearchTerm : null,
        null, sortFieldToUse, sortOrderToUse
      );
      if (result && result.items) {
        setWarehouseItems(result.items);
        setWarehouseItemsTotalCount(result.totalCount);
        setWarehouseItemsTotalPages(Math.ceil(result.totalCount / warehouseItemsPageSize));
      } else {
        setWarehouseItems(result);
      }
    } catch (error) {
      console.error('Błąd podczas pobierania pozycji z magazynu:', error);
      showError('Nie udało się pobrać pozycji z magazynu');
    } finally {
      setWarehouseItemsLoading(false);
    }
  };

  const handleWarehouseClick = async (warehouse) => {
    listActions.setSelectedWarehouseForView(warehouse);
    await fetchWarehouseItems(warehouse.id);
  };

  const handleBackToWarehouses = () => { listActions.setSelectedWarehouseForView(null); };

  const handleShowItemBatches = async (item) => {
    setSelectedItem(item);
    try {
      setLoadingBatches(true);
      const batches = await getItemBatches(item.id, selectedWarehouseForView?.id);
      setSelectedItemBatches(batches);
      setBatchesDialogOpen(true);
    } catch (error) {
      console.error('Błąd podczas pobierania partii:', error);
      showError('Nie udało się pobrać partii dla tego produktu');
    } finally {
      setLoadingBatches(false);
    }
  };

  const handleCloseBatchesDialog = () => {
    setBatchesDialogOpen(false);
    setTimeout(() => { setSelectedItem(null); setSelectedItemBatches([]); }, 300);
  };

  const handleWarehouseSearchTermChange = (e) => { listActions.setWarehouseSearchTerm(e.target.value); };
  const clearWarehouseSearch = () => { listActions.setWarehouseSearchTerm(''); if (warehouseSearchTermRef.current) warehouseSearchTermRef.current.value = ''; };

  const handleWarehousePageChange = (event, newPage) => { listActions.setWarehouseItemsPage(newPage); };
  const handleWarehousePageSizeChange = (event) => { listActions.setWarehouseItemsPageSize(parseInt(event.target.value, 10)); };

  const handleWarehouseTableSort = (field) => {
    const newOrder = warehouseItemsSort.field === field && warehouseItemsSort.order === 'asc' ? 'desc' : 'asc';
    listActions.setWarehouseItemsSort({ field, order: newOrder });
    if (selectedWarehouseForView) {
      fetchWarehouseItems(selectedWarehouseForView.id, field, newOrder);
    }
  };

  return {
    warehouses, warehousesLoading,
    openWarehouseDialog, dialogMode, selectedWarehouseForEdit,
    warehouseFormData, savingWarehouse,
    warehouseItems, warehouseItemsLoading,
    warehouseItemsTotalCount, warehouseItemsTotalPages,
    batchesDialogOpen, selectedItem: selectedItem,
    selectedItemBatches, loadingBatches,
    warehouseSearchTermRef,
    selectedWarehouseForView, warehouseSearchTerm, warehouseItemsSort,
    warehouseItemsPage, warehouseItemsPageSize,
    fetchWarehouses, fetchWarehouseItems,
    handleWarehouseChange,
    handleOpenWarehouseDialog, handleCloseWarehouseDialog,
    handleWarehouseFormChange, handleSubmitWarehouse,
    handleDeleteWarehouse,
    handleWarehouseClick, handleBackToWarehouses,
    handleShowItemBatches, handleCloseBatchesDialog,
    handleWarehouseSearchTermChange, clearWarehouseSearch,
    handleWarehousePageChange, handleWarehousePageSizeChange,
    handleWarehouseTableSort
  };
}
