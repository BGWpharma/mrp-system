import { useState, useEffect, useRef, useMemo } from 'react';
import { getInventoryItemsOptimized, clearInventoryItemsCache, deleteInventoryItem, getExpiringBatches, getExpiredBatches, cleanupMicroReservations } from '../../services/inventory';
import { useNotification } from '../useNotification';
import { useInventoryListState } from '../../contexts/InventoryListStateContext';
import { useServiceData } from '../useServiceData';
import { getAllCustomers, CUSTOMERS_CACHE_KEY } from '../../services/crm';
import { useTranslation } from '../useTranslation';

export function useInventoryData() {
  const { t } = useTranslation('inventory');
  const { showSuccess, showError } = useNotification();
  const { state: listState, actions: listActions } = useInventoryListState();

  const searchTerm = listState.searchTerm;
  const searchCategory = listState.searchCategory;
  const selectedWarehouse = listState.selectedWarehouse;
  const currentTab = listState.currentTab;
  const page = listState.page;
  const pageSize = listState.pageSize;
  const tableSort = listState.tableSort;

  const [inventoryItems, setInventoryItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', onConfirm: null });
  const [showArchived, setShowArchived] = useState(false);
  const [expiringCount, setExpiringCount] = useState(0);
  const [expiredCount, setExpiredCount] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [mainTableLoading, setMainTableLoading] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [anchorEl, setAnchorEl] = useState(null);

  const isFirstRender = useRef(true);
  const isPageEffectMounted = useRef(false);
  const searchTermTimerRef = useRef(null);
  const searchCategoryTimerRef = useRef(null);
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);
  const [debouncedSearchCategory, setDebouncedSearchCategory] = useState(searchCategory);

  const { data: customers } = useServiceData(CUSTOMERS_CACHE_KEY, getAllCustomers, { ttl: 10 * 60 * 1000 });
  const [customerFilter, setCustomerFilter] = useState('');

  const displayedItems = useMemo(() => {
    let items = filteredItems;
    if (!showArchived) {
      items = items.filter(item => !item.archived);
    }
    if (customerFilter) {
      items = items.filter(item =>
        item.allCustomers || (item.customerIds && item.customerIds.includes(customerFilter))
      );
    }
    return items;
  }, [filteredItems, customerFilter, showArchived]);

  const customerNameMap = useMemo(() => {
    const map = {};
    customers.forEach(c => { map[c.id] = c.name; });
    return map;
  }, [customers]);

  const fetchInventoryItems = async (newSortField = null, newSortOrder = null, forceRefresh = false) => {
    if (currentTab === 0) {
      setMainTableLoading(true);
      setShowContent(false);
    } else {
      setLoading(true);
    }

    try {
      const sortFieldToUse = newSortField || tableSort.field;
      const sortOrderToUse = newSortOrder || tableSort.order;
      const warehouseFilter = currentTab === 0 ? null : (selectedWarehouse || null);

      const result = await getInventoryItemsOptimized({
        warehouseId: warehouseFilter,
        page,
        pageSize,
        searchTerm: debouncedSearchTerm.trim() !== '' ? debouncedSearchTerm : null,
        searchCategory: debouncedSearchCategory.trim() !== '' ? debouncedSearchCategory : null,
        sortField: sortFieldToUse,
        sortOrder: sortOrderToUse,
        forceRefresh
      });

      if (result && result.items) {
        setInventoryItems(result.items);
        setFilteredItems(result.items);
        setTotalItems(result.totalCount);
        setTotalPages(Math.ceil(result.totalCount / pageSize));
      } else {
        setInventoryItems(result);
        setFilteredItems(result);
      }

      if (currentTab === 0) {
        setTimeout(() => { setShowContent(true); }, 25);
      }
    } catch (error) {
      console.error('Error fetching inventory items:', error);
      showError('Błąd podczas pobierania pozycji ze stanów');
    } finally {
      if (currentTab === 0) {
        setMainTableLoading(false);
      } else {
        setLoading(false);
      }
    }
  };

  const fetchExpiryData = async () => {
    try {
      const expiringBatches = await getExpiringBatches();
      const expiredBatches = await getExpiredBatches();
      setExpiringCount(expiringBatches.length);
      setExpiredCount(expiredBatches.length);
    } catch (error) {
      console.error('Error fetching expiry data:', error);
    }
  };

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      cleanupMicroReservations().catch(err => {
        console.error('Cleanup micro reservations failed:', err);
      });
    }
  }, []);

  useEffect(() => {
    fetchInventoryItems(tableSort.field, tableSort.order, true);
    fetchExpiryData();

    const handleInventoryUpdate = () => {
      fetchInventoryItems(tableSort.field, tableSort.order);
    };
    window.addEventListener('inventory-updated', handleInventoryUpdate);
    return () => { window.removeEventListener('inventory-updated', handleInventoryUpdate); };
  }, []);

  useEffect(() => {
    if (page !== 1) {
      listActions.setPage(1);
    } else {
      fetchInventoryItems();
    }
  }, [debouncedSearchTerm, debouncedSearchCategory]);

  useEffect(() => {
    if (searchTermTimerRef.current) clearTimeout(searchTermTimerRef.current);
    searchTermTimerRef.current = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      if (searchTerm !== debouncedSearchTerm) {
        listActions.setPage(1);
        fetchInventoryItems(tableSort.field, tableSort.order);
      }
    }, 1000);
    return () => { if (searchTermTimerRef.current) clearTimeout(searchTermTimerRef.current); };
  }, [searchTerm]);

  useEffect(() => {
    if (searchCategoryTimerRef.current) clearTimeout(searchCategoryTimerRef.current);
    searchCategoryTimerRef.current = setTimeout(() => {
      setDebouncedSearchCategory(searchCategory);
      if (searchCategory !== debouncedSearchCategory) {
        listActions.setPage(1);
        fetchInventoryItems(tableSort.field, tableSort.order);
      }
    }, 1000);
    return () => { if (searchCategoryTimerRef.current) clearTimeout(searchCategoryTimerRef.current); };
  }, [searchCategory]);

  useEffect(() => {
    if (selectedWarehouse !== undefined) {
      listActions.setPage(1);
      fetchInventoryItems(tableSort.field, tableSort.order);
    }
  }, [selectedWarehouse]);

  useEffect(() => {
    if (!isPageEffectMounted.current) {
      isPageEffectMounted.current = true;
      return;
    }
    fetchInventoryItems(tableSort.field, tableSort.order);
  }, [page, pageSize]);

  useEffect(() => {
    if (!isPageEffectMounted.current) return;
    if (currentTab === 0) {
      fetchInventoryItems(tableSort.field, tableSort.order);
      fetchExpiryData();
    }
  }, [currentTab]);

  const handleDelete = async (id) => {
    setConfirmDialog({
      open: true,
      title: 'Potwierdzenie usunięcia',
      message: 'Czy na pewno chcesz usunąć tę pozycję ze stanów?',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        try {
          await deleteInventoryItem(id);
          fetchInventoryItems();
          showSuccess('Pozycja została usunięta');
        } catch (error) {
          showError('Błąd podczas usuwania pozycji: ' + error.message);
        }
      }
    });
  };

  const handleTableSort = (field) => {
    const newOrder = tableSort.field === field && tableSort.order === 'asc' ? 'desc' : 'asc';
    listActions.setTableSort({ field, order: newOrder });
    listActions.setPage(1);
    fetchInventoryItems(field, newOrder);
  };

  const handlePageChange = (event, newPage) => { listActions.setPage(newPage); };
  const handlePageSizeChange = (event) => {
    listActions.setPageSize(parseInt(event.target.value, 10));
    listActions.setPage(1);
  };

  const handleSearchTermChange = (e) => { listActions.setSearchTerm(e.target.value); };
  const handleSearchCategoryChange = (e) => { listActions.setSearchCategory(e.target.value); };

  const handleSearch = () => {
    listActions.setPage(1);
    setDebouncedSearchTerm(searchTerm);
    setDebouncedSearchCategory(searchCategory);
    fetchInventoryItems(tableSort.field, tableSort.order);
  };

  const handleRefreshList = () => {
    clearInventoryItemsCache();
    if (currentTab === 0) {
      fetchInventoryItems(tableSort.field, tableSort.order);
      fetchExpiryData();
    } else if (currentTab === 5) {
      // Reservations refresh is handled by the tab component
    }
    showSuccess('Lista została odświeżona');
  };

  const handleMenuOpen = (event, item) => { setAnchorEl(event.currentTarget); setSelectedItem(item); };
  const handleMenuClose = () => { setAnchorEl(null); setSelectedItem(null); };

  const handleRecalculateItemQuantity = async () => {
    if (!selectedItem) return;
    try {
      setLoading(true);
      const { recalculateItemQuantity } = await import('../../services/inventory/inventoryOperationsService');
      const oldQuantity = selectedItem.quantity;
      const newQuantity = await recalculateItemQuantity(selectedItem.id);
      showSuccess(`Przeliczono ilość dla "${selectedItem.name}": ${oldQuantity} → ${newQuantity}`);
      await fetchInventoryItems(tableSort.field, tableSort.order);
      handleMenuClose();
    } catch (error) {
      console.error('Błąd podczas przeliczania ilości:', error);
      showError(`Nie udało się przeliczać ilości: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return {
    inventoryItems, filteredItems, loading, setLoading,
    confirmDialog, setConfirmDialog,
    showArchived, setShowArchived,
    expiringCount, expiredCount,
    totalItems, totalPages,
    mainTableLoading, showContent,
    selectedItem, setSelectedItem,
    anchorEl, setAnchorEl,
    displayedItems, customerNameMap,
    customers, customerFilter, setCustomerFilter,
    debouncedSearchTerm, debouncedSearchCategory,
    searchTerm, searchCategory, selectedWarehouse, currentTab,
    page, pageSize, tableSort,
    listState, listActions,
    fetchInventoryItems, fetchExpiryData,
    handleDelete, handleTableSort,
    handlePageChange, handlePageSizeChange,
    handleSearchTermChange, handleSearchCategoryChange,
    handleSearch, handleRefreshList,
    handleMenuOpen, handleMenuClose,
    handleRecalculateItemQuantity,
    showSuccess, showError, t
  };
}
