import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Container, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, TextField, Box, Chip, IconButton, Dialog,
  DialogActions, DialogContent, DialogContentText, DialogTitle, MenuItem, Select, FormControl, InputLabel, 
  Tooltip, Menu, Checkbox, ListItemText, TableSortLabel, Pagination, TableFooter, CircularProgress,
  Fade, Skeleton, List, ListItem, ListItemIcon, ListItemText as MuiListItemText, Alert
} from '@mui/material';
import { format, isValid } from 'date-fns';
import { pl } from 'date-fns/locale';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, Visibility as ViewIcon, ViewColumn as ViewColumnIcon, Clear as ClearIcon, Refresh as RefreshIcon, Sync as SyncIcon, Assessment as ReportIcon } from '@mui/icons-material';
import { 
  getAllPurchaseOrders, 
  deletePurchaseOrder, 
  updatePurchaseOrderStatus, 
  updatePurchaseOrderPaymentStatus, 
  getPurchaseOrdersWithPagination, 
  getPurchaseOrdersOptimized,
  clearPurchaseOrdersCache,
  updatePurchaseOrderInCache,
  addPurchaseOrderToCache,
  removePurchaseOrderFromCache,
  clearSearchCache,
  updateBatchPricesOnAnySave,
  updateBatchPricesWithDetails,
  getPurchaseOrderById,
  checkShortExpiryItems,
  PURCHASE_ORDER_STATUSES, 
  PURCHASE_ORDER_PAYMENT_STATUSES, 
  translateStatus, 
  translatePaymentStatus 
} from '../../services/purchaseOrderService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { useColumnPreferences } from '../../contexts/ColumnPreferencesContext';
import { usePurchaseOrderListState } from '../../contexts/PurchaseOrderListStateContext';
import { useTranslation } from '../../hooks/useTranslation';
import PurchaseOrderReportDialog from './PurchaseOrderReportDialog';
import { generatePurchaseOrderReport } from '../../services/purchaseOrderReportService';

const PurchaseOrderList = () => {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const navigate = useNavigate();
  
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [filteredPOs, setFilteredPOs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [poToDelete, setPoToDelete] = useState(null);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [poToUpdateStatus, setPoToUpdateStatus] = useState(null);
  const [newStatus, setNewStatus] = useState('');
  const [paymentStatusDialogOpen, setPaymentStatusDialogOpen] = useState(false);
  const [poToUpdatePaymentStatus, setPoToUpdatePaymentStatus] = useState(null);
  const [newPaymentStatus, setNewPaymentStatus] = useState('');
  const [supplierPricesDialogOpen, setSupplierPricesDialogOpen] = useState(false);
  const [pendingStatusUpdate, setPendingStatusUpdate] = useState(null);
  const [columnMenuAnchor, setColumnMenuAnchor] = useState(null);
  const [shortExpiryConfirmDialogOpen, setShortExpiryConfirmDialogOpen] = useState(false);
  const [shortExpiryItems, setShortExpiryItems] = useState([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  
  // Stany dla aktualizacji partii
  const [updatingBatches, setUpdatingBatches] = useState({});
  const [batchUpdateDialogOpen, setBatchUpdateDialogOpen] = useState(false);
  const [batchUpdateResults, setBatchUpdateResults] = useState(null);
  
  // Stan dla dialogu raportu CSV
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  
  // Dodajemy stan dla opóźnionego wyszukiwania
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const searchTimeout = useRef(null);
  
  // Stany dla animacji ładowania (podobnie jak w TaskList)
  const [mainTableLoading, setMainTableLoading] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const isFirstRender = useRef(true);
  
  // Używamy kontekstu preferencji kolumn
  const { getColumnPreferencesForView, updateColumnPreferences } = useColumnPreferences();
  // Pobieramy preferencje dla widoku 'purchaseOrders'
  const visibleColumns = getColumnPreferencesForView('purchaseOrders');
  
  // Użyj kontekstu stanu listy zamówień zakupu
  const { state: listState, actions: listActions } = usePurchaseOrderListState();

  // Zmienne stanu z kontekstu
  const searchTerm = listState.searchTerm;
  const statusFilter = listState.statusFilter;
  const page = listState.page;
  const pageSize = listState.pageSize;
  const tableSort = listState.tableSort;
  
  // Zoptymalizowana funkcja pobierania zamówień zakupu (podobnie jak w TaskList)
  const fetchPurchaseOrdersOptimized = useCallback(async (newSortField = null, newSortOrder = null) => {
    setMainTableLoading(true);
    setShowContent(false);
    
    try {
      // Wymuszenie odświeżenia cache tylko przy pierwszym renderze
      if (isFirstRender.current) {
        await clearPurchaseOrdersCache();
        isFirstRender.current = false;
      }
      
      // Użyj przekazanych parametrów sortowania lub tych z kontekstu
      const sortFieldToUse = newSortField || tableSort.field;
      const sortOrderToUse = newSortOrder || tableSort.order;
      
      // UŻYJ ZOPTYMALIZOWANEJ FUNKCJI dla lepszej wydajności
      const result = await getPurchaseOrdersOptimized({
        page: page,
        pageSize: pageSize,
        searchTerm: debouncedSearchTerm.trim() !== '' ? debouncedSearchTerm : null,
        statusFilter: statusFilter !== 'all' ? statusFilter : null,
        sortField: sortFieldToUse,
        sortOrder: sortOrderToUse,
        forceRefresh: false
      });
      
      // Jeśli wynik to obiekt z właściwościami items i totalCount, to używamy paginacji
      if (result && result.items) {
        setPurchaseOrders(result.items);
        setFilteredPOs(result.items);
        setTotalItems(result.totalCount);
        setTotalPages(Math.ceil(result.totalCount / pageSize));
      } else {
        // Stara logika dla kompatybilności
        setPurchaseOrders(result);
        setFilteredPOs(result);
      }
      
      // PRZYŚPIESZONE ANIMACJE - zmniejszone opóźnienie dla lepszej responsywności
      setTimeout(() => {
        setShowContent(true);
      }, 25); // Zmniejszone z 300ms do 25ms
      
    } catch (error) {
      console.error('Error fetching purchase orders:', error);
      showError('Błąd podczas pobierania zamówień zakupu: ' + error.message);
    } finally {
      setMainTableLoading(false);
      setLoading(false); // Zachowaj kompatybilność ze starym loading
    }
  }, [page, pageSize, tableSort.field, tableSort.order, statusFilter, debouncedSearchTerm, showError]);
  
  // Wywołujemy fetchPurchaseOrdersOptimized przy zmianach parametrów
  useEffect(() => {
    fetchPurchaseOrdersOptimized();
  }, [fetchPurchaseOrdersOptimized]);
  
  // Obsługa debounce dla wyszukiwania
  useEffect(() => {
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }
    
    searchTimeout.current = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300); // 300ms opóźnienia
    
    return () => {
      if (searchTimeout.current) {
        clearTimeout(searchTimeout.current);
      }
    };
  }, [searchTerm]);
  
  // Funkcja obsługująca kliknięcie w nagłówek kolumny
  const handleRequestSort = (property) => {
    const isAsc = tableSort.field === property && tableSort.order === 'asc';
    const newOrder = isAsc ? 'desc' : 'asc';
    listActions.setTableSort({ field: property, order: newOrder });
    listActions.setPage(1); // Resetujemy do pierwszej strony przy zmianie sortowania
  };
  
  // Funkcja obsługująca zmianę strony
  const handleChangePage = (event, newPage) => {
    listActions.setPage(newPage);
  };
  
  // Funkcja obsługująca zmianę liczby elementów na stronę
  const handleChangeRowsPerPage = (event) => {
    listActions.setPageSize(parseInt(event.target.value, 10));
  };
  
  // Funkcja obsługi zmiany wyszukiwania
  const handleSearchChange = (event) => {
    listActions.setSearchTerm(event.target.value);
  };

  // Funkcja obsługi sortowania tabeli
  const handleTableSort = (field) => {
    const isAsc = tableSort.field === field && tableSort.order === 'asc';
    const newOrder = isAsc ? 'desc' : 'asc';
    const newSort = { field, order: newOrder };
    
    listActions.setTableSort(newSort);
    
    // Wywołaj funkcję pobierania z nowymi parametrami sortowania
    fetchPurchaseOrdersOptimized(field, newOrder);
  };


  
  const handleStatusFilterChange = (e) => {
    listActions.setStatusFilter(e.target.value);
  };
  
  // Funkcja czyszczenia wyszukiwania i filtrów
  const handleClearFilters = async () => {
    listActions.setSearchTerm('');
    listActions.setStatusFilter('all');
    setDebouncedSearchTerm(''); // Natychmiastowe wyczyszczenie również debounced term
    
    // Natychmiast odśwież listę z pustymi filtrami
    try {
      setLoading(true);
      
              // Wywołaj zoptymalizowaną funkcję z pustymi filtrami
        const response = await getPurchaseOrdersOptimized({
          page: 1, // Reset do pierwszej strony
          pageSize: pageSize,
          searchTerm: null,
          statusFilter: null,
          sortField: tableSort.field,
          sortOrder: tableSort.order,
          forceRefresh: true
        });
        
        // Ustawiamy dane i informacje o paginacji
        setPurchaseOrders(response.items);
        setFilteredPOs(response.items);
        
        setTotalItems(response.totalCount);
        setTotalPages(Math.ceil(response.totalCount / pageSize));
      
      // Resetuj również stronę
      listActions.setPage(1);
      
      setTimeout(() => {
        setLoading(false);
      }, 300);
    } catch (error) {
      console.error('Błąd podczas czyszczenia filtrów:', error);
      showError('Nie udało się wyczyścić filtrów');
      setLoading(false);
    }
  };
  
  const handleDeleteClick = (po) => {
    setPoToDelete(po);
    setDeleteDialogOpen(true);
  };
  
  // Funkcja obsługi aktualizacji partii
  const handleUpdateBatches = async (po) => {
    try {
      setUpdatingBatches(prev => ({ ...prev, [po.id]: true }));
      
      console.log(`Rozpoczynam aktualizację partii dla PO ${po.number || po.id}`);
      
      // Wywołaj funkcję aktualizacji partii ze szczegółami
      const result = await updateBatchPricesWithDetails(po.id, currentUser?.uid);
      
      console.log('Rezultat aktualizacji partii:', result);
      
      // Zapisz rezultaty i otwórz dialog z zabezpieczeniami
      setBatchUpdateResults({
        ...result,
        summary: result.summary || { changed: 0, unchanged: 0, errors: 0 },
        details: result.details || [],
        message: result.message || 'Aktualizacja zakończona',
        poNumber: po.number || po.id,
        poId: po.id
      });
      setBatchUpdateDialogOpen(true);
      
      // Pokaż krótkie powiadomienie
      showSuccess(`Aktualizacja partii zakończona: ${result.message}`);
      
    } catch (error) {
      console.error('Błąd podczas aktualizacji partii:', error);
      showError(`Nie udało się zaktualizować partii: ${error.message}`);
    } finally {
      setUpdatingBatches(prev => ({ ...prev, [po.id]: false }));
    }
  };
  
  const handleDeleteConfirm = async () => {
    if (poToDelete) {
      try {
        await deletePurchaseOrder(poToDelete.id);
        
        // Usuń z cache zamiast odświeżania całej listy
        removePurchaseOrderFromCache(poToDelete.id);
        
        // Odśwież listę
        await fetchPurchaseOrdersOptimized();
        
        showSuccess(t('purchaseOrders.notifications.deleteSuccess'));
        setDeleteDialogOpen(false);
        setPoToDelete(null);
      } catch (error) {
        console.error('Błąd podczas usuwania zamówienia zakupu:', error);
        showError(t('purchaseOrders.notifications.deleteError'));
      }
    }
  };

  // Funkcja generowania eksportu CSV
  const handleGenerateReport = async (filters) => {
    try {
      const result = await generatePurchaseOrderReport(filters);
      showSuccess(result.message);
    } catch (error) {
      console.error('Błąd podczas generowania eksportu:', error);
      showError(error.message || 'Błąd podczas generowania eksportu');
    }
  };
  
  const handleStatusClick = (po) => {
    setPoToUpdateStatus(po);
    setNewStatus(po.status);
    setStatusDialogOpen(true);
  };
  
  const handleStatusUpdate = async () => {
    if (poToUpdateStatus && newStatus) {
      try {
        // Sprawdź czy status zmienia się na "ordered" i czy są pozycje z krótką datą ważności
        if (newStatus === 'ordered' && 
            poToUpdateStatus?.items?.length > 0 && 
            poToUpdateStatus?.orderDate) {
          
          const itemsWithShortExpiry = checkShortExpiryItems(poToUpdateStatus.items, poToUpdateStatus.orderDate);
          if (itemsWithShortExpiry.length > 0) {
            // Pokaż dialog potwierdzenia dla krótkich dat ważności
            setShortExpiryItems(itemsWithShortExpiry);
            setShortExpiryConfirmDialogOpen(true);
            return;
          }
        }
        
        // Sprawdź czy status zmienia się na "completed" i czy zamówienie ma pozycje i dostawcę
        if (newStatus === 'completed' && 
            poToUpdateStatus?.items?.length > 0 && 
            poToUpdateStatus?.supplier?.id &&
            poToUpdateStatus.status !== 'completed') {
          
          // Zapisz dane do oczekującej aktualizacji i pokaż dialog
          setPendingStatusUpdate({
            purchaseOrder: poToUpdateStatus,
            newStatus: newStatus,
            currentStatus: poToUpdateStatus.status
          });
          setSupplierPricesDialogOpen(true);
          setStatusDialogOpen(false);
          return;
        }
        
        // Standardowa aktualizacja statusu
        await updatePurchaseOrderStatus(poToUpdateStatus.id, newStatus, currentUser.uid);
        
        // Zaktualizuj w cache zamiast odświeżania całej listy
        updatePurchaseOrderInCache(poToUpdateStatus.id, { 
          status: newStatus,
          updatedAt: new Date()
        });
        
        // Odśwież listę
        await fetchPurchaseOrdersOptimized();
        
        showSuccess(t('purchaseOrders.notifications.statusUpdateSuccess'));
        setStatusDialogOpen(false);
        setPoToUpdateStatus(null);
        setNewStatus('');
      } catch (error) {
        // Wyświetl konkretny komunikat błędu jeśli dostępny, w przeciwnym razie ogólny
        const errorMessage = error.message || t('purchaseOrders.notifications.statusUpdateError');
        showError(errorMessage);
      }
    }
  };

  // Funkcje obsługujące dialog potwierdzenia krótkich dat ważności
  const handleShortExpiryConfirm = async () => {
    try {
      setShortExpiryConfirmDialogOpen(false);
      
      // Kontynuuj z aktualizacją statusu
      await updatePurchaseOrderStatus(poToUpdateStatus.id, newStatus, currentUser.uid);
      
      // Zaktualizuj w cache zamiast odświeżania całej listy
      updatePurchaseOrderInCache(poToUpdateStatus.id, { 
        status: newStatus,
        updatedAt: new Date()
      });
      
      // Odśwież listę
      await fetchPurchaseOrdersOptimized();
      
      showSuccess(t('purchaseOrders.notifications.statusUpdateSuccess'));
      setStatusDialogOpen(false);
      setPoToUpdateStatus(null);
      setNewStatus('');
    } catch (error) {
      const errorMessage = error.message || t('purchaseOrders.notifications.statusUpdateError');
      showError(errorMessage);
    } finally {
      setShortExpiryItems([]);
    }
  };

  const handleShortExpiryCancel = () => {
    setShortExpiryConfirmDialogOpen(false);
    setShortExpiryItems([]);
    setNewStatus('');
  };

  const handlePaymentStatusClick = (po) => {
    setPoToUpdatePaymentStatus(po);
    setNewPaymentStatus(po.paymentStatus || PURCHASE_ORDER_PAYMENT_STATUSES.UNPAID);
    setPaymentStatusDialogOpen(true);
  };

  const handlePaymentStatusUpdate = async () => {
    if (poToUpdatePaymentStatus && newPaymentStatus) {
      try {
        await updatePurchaseOrderPaymentStatus(poToUpdatePaymentStatus.id, newPaymentStatus, currentUser.uid);
        
        // Zaktualizuj w cache zamiast odświeżania całej listy
        updatePurchaseOrderInCache(poToUpdatePaymentStatus.id, { 
          paymentStatus: newPaymentStatus,
          updatedAt: new Date()
        });
        
        // Odśwież listę
        await fetchPurchaseOrdersOptimized();
        
        showSuccess(t('purchaseOrders.notifications.paymentStatusUpdateSuccess'));
        setPaymentStatusDialogOpen(false);
        setPoToUpdatePaymentStatus(null);
        setNewPaymentStatus('');
      } catch (error) {
        console.error('Błąd podczas aktualizacji statusu płatności zamówienia zakupu:', error);
        showError(t('purchaseOrders.notifications.paymentStatusUpdateError'));
      }
    }
  };

  const handleSupplierPricesConfirm = async (updatePrices) => {
    try {
      if (!pendingStatusUpdate) return;

      // Zaktualizuj status zamówienia
      await updatePurchaseOrderStatus(pendingStatusUpdate.purchaseOrder.id, pendingStatusUpdate.newStatus, currentUser.uid);
      
      // Jeśli użytkownik chce zaktualizować ceny dostawców
      if (updatePrices) {
        try {
          const { updateSupplierPricesFromCompletedPO } = await import('../../services/inventory');
          const result = await updateSupplierPricesFromCompletedPO(pendingStatusUpdate.purchaseOrder.id, currentUser.uid);
          
          if (result.success && result.updated > 0) {
            showSuccess(`Status zamówienia został zaktualizowany. Dodatkowo zaktualizowano ${result.updated} cen dostawców i ustawiono jako domyślne.`);
          } else {
            showSuccess('Status zamówienia został zaktualizowany. Nie znaleziono cen dostawców do aktualizacji.');
          }
        } catch (pricesError) {
          console.error('Błąd podczas aktualizacji cen dostawców:', pricesError);
          showSuccess('Status zamówienia został zaktualizowany.');
          showError('Błąd podczas aktualizacji cen dostawców: ' + pricesError.message);
        }
      } else {
        showSuccess('Status zamówienia został zaktualizowany bez aktualizacji cen dostawców.');
      }
      
              // Po aktualizacji odświeżamy listę
        fetchPurchaseOrdersOptimized();
      
    } catch (error) {
      console.error('Błąd podczas aktualizacji statusu:', error);
      showError('Nie udało się zaktualizować statusu zamówienia');
    } finally {
      setSupplierPricesDialogOpen(false);
      setPendingStatusUpdate(null);
      setStatusDialogOpen(false);
      setPoToUpdateStatus(null);
    }
  };

  const handleSupplierPricesCancel = () => {
    setSupplierPricesDialogOpen(false);
    setPendingStatusUpdate(null);
    setNewStatus('');
  };
  
  // Funkcja do tłumaczenia statusów na skrócone wersje dla listy
  const translateStatusShort = (status) => {
    switch (status) {
      case 'draft': return 'Projekt';
      case 'ordered': return 'Zamówione';
      case 'shipped': return 'Wysłane';
      case 'partial': return 'Cz. dostarczone';
      case 'delivered': return 'Dostarczone';
      case 'completed': return 'Zakończone';
      case 'cancelled': return 'Anulowane';
      // Zachowujemy obsługę ukrytych statusów dla istniejących zamówień
      case 'pending': return 'Oczekujące';
      case 'approved': return 'Zatwierdzone';
      case 'confirmed': return 'Potwierdzone';
      default: return status;
    }
  };

  const getStatusChip = (status, po) => {
    let label = translateStatusShort(status);
    let color = '#757575'; // oryginalny szary domyślny
    
    switch (status) {
      case PURCHASE_ORDER_STATUSES.DRAFT:
        color = '#757575'; // szary - projekt
        break;
      case PURCHASE_ORDER_STATUSES.ORDERED:
        color = '#1976d2'; // niebieski - zamówione
        break;
      case PURCHASE_ORDER_STATUSES.SHIPPED:
        color = '#9c27b0'; // fioletowy - wysłane
        break;
      case PURCHASE_ORDER_STATUSES.PARTIAL:
        color = '#81c784'; // jasno zielony - częściowo dostarczone
        break;
      case PURCHASE_ORDER_STATUSES.DELIVERED:
        color = '#4caf50'; // zielony - dostarczone
        break;
      case PURCHASE_ORDER_STATUSES.COMPLETED:
        color = '#4caf50'; // zielony - zakończone
        break;
      case PURCHASE_ORDER_STATUSES.CANCELLED:
        color = '#f44336'; // czerwony - anulowane
        break;
      // Zachowujemy obsługę ukrytych statusów dla istniejących zamówień
      case PURCHASE_ORDER_STATUSES.PENDING:
        color = '#757575'; // szary - oczekujące
        break;
      case PURCHASE_ORDER_STATUSES.APPROVED:
        color = '#ffeb3b'; // żółty - zatwierdzone
        break;
      case PURCHASE_ORDER_STATUSES.CONFIRMED:
        color = '#2196f3'; // jasnoniebieski - potwierdzone
        break;
      default:
        color = '#757575'; // szary domyślny
    }
    
    return (
      <Chip 
        label={label} 
        size="small" 
        variant="filled"
        clickable
        onClick={() => handleStatusClick(po)}
        sx={{ 
          fontWeight: 'medium',
          backgroundColor: color,
          color: status === PURCHASE_ORDER_STATUSES.APPROVED ? 'black' : 'white', // czarny tekst na żółtym tle
          cursor: 'pointer',
          '&:hover': {
            opacity: 0.8
          }
        }}
      />
    );
  };
  
  const getPaymentStatusChip = (paymentStatus, po) => {
    const status = paymentStatus || PURCHASE_ORDER_PAYMENT_STATUSES.UNPAID;
    const label = translatePaymentStatus(status);
    let color = '#f44336'; // czerwony domyślny dla nie opłacone
    
    switch (status) {
      case PURCHASE_ORDER_PAYMENT_STATUSES.PAID:
        color = '#4caf50'; // zielony - opłacone
        break;
      case PURCHASE_ORDER_PAYMENT_STATUSES.UNPAID:
      default:
        color = '#f44336'; // czerwony - nie opłacone
        break;
    }
    
    return (
      <Chip 
        label={label} 
        size="small" 
        variant="filled"
        clickable
        onClick={() => handlePaymentStatusClick(po)}
        sx={{ 
          fontWeight: 'medium',
          backgroundColor: color,
          color: 'white',
          cursor: 'pointer',
          '&:hover': {
            opacity: 0.8
          }
        }}
      />
    );
  };
  
  const handleColumnMenuOpen = (event) => {
    setColumnMenuAnchor(event.currentTarget);
  };
  
  const handleColumnMenuClose = () => {
    setColumnMenuAnchor(null);
  };
  
  const toggleColumnVisibility = (columnName) => {
    updateColumnPreferences('purchaseOrders', columnName, !visibleColumns[columnName]);
  };
  
  // Funkcja do formatowania symboli walut
  const formatCurrencySymbol = (currencyCode) => {
    const currencySymbols = {
      'EUR': '€',
      'USD': '$',
      'PLN': 'zł',
      'GBP': '£'
    };
    return currencySymbols[currencyCode] || currencyCode;
  };
  
  // Komponent dla nagłówka kolumny z sortowaniem
  const SortableTableCell = ({ id, label, disableSorting = false, sx }) => {
    return (
      <TableCell sx={sx}>
        {disableSorting ? (
          label
        ) : (
          <TableSortLabel
            active={tableSort.field === id}
            direction={tableSort.field === id ? tableSort.order : 'asc'}
            onClick={() => handleRequestSort(id)}
          >
            {label}
          </TableSortLabel>
        )}
      </TableCell>
    );
  };
  
  return (
    <Container maxWidth="xl">
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="h5">{t('purchaseOrders.title')}</Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={() => navigate('/purchase-orders/new')}
        >
          {t('purchaseOrders.newOrder')}
        </Button>
      </Box>
      
      <Paper sx={{ mb: 1, p: 1 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
          <TextField
            label={t('purchaseOrders.filters.search')}
            variant="outlined"
            size="small"
            value={searchTerm}
            onChange={handleSearchChange}
            sx={{ minWidth: '250px', flexGrow: 1 }}
          />
          
          <FormControl variant="outlined" size="small" sx={{ minWidth: '200px' }}>
            <InputLabel id="status-filter-label">{t('purchaseOrders.filters.status')}</InputLabel>
            <Select
              labelId="status-filter-label"
              value={statusFilter}
              onChange={handleStatusFilterChange}
              label={t('purchaseOrders.filters.status')}
            >
              <MenuItem value="all">{t('purchaseOrders.filters.all')}</MenuItem>
              {['draft', 'ordered', 'shipped', 'partial', 'delivered', 'completed', 'cancelled'].map((status) => (
                <MenuItem key={status} value={status}>
                  {translateStatus(status)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          
          <Tooltip title={t('purchaseOrders.filters.clear')}>
            <IconButton 
              color="secondary" 
              onClick={handleClearFilters}
              size="small"
              disabled={searchTerm === '' && statusFilter === 'all'}
            >
              <ClearIcon />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Odśwież dane (wyczyść cache)">
            <IconButton 
              color="warning" 
              onClick={async () => {
                await clearPurchaseOrdersCache();
                await fetchPurchaseOrdersOptimized();
              }}
              size="small"
            >
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          
          <Tooltip title="Konfiguracja kolumn">
            <IconButton 
              color="primary" 
              onClick={handleColumnMenuOpen}
              size="small"
            >
              <ViewColumnIcon />
            </IconButton>
          </Tooltip>
          
          <Button
            variant="outlined"
            color="primary"
            startIcon={<ReportIcon />}
            onClick={() => setReportDialogOpen(true)}
            size="small"
          >
            Eksport
          </Button>
        </Box>
        
        <Menu
          anchorEl={columnMenuAnchor}
          open={Boolean(columnMenuAnchor)}
          onClose={handleColumnMenuClose}
        >
          <MenuItem>
            <ListItemText primary="Widoczne kolumny" sx={{ fontWeight: 'bold' }} />
          </MenuItem>
          <MenuItem onClick={() => toggleColumnVisibility('number')}>
            <Checkbox checked={!!visibleColumns['number']} />
            <ListItemText primary={t('purchaseOrders.table.number')} />
          </MenuItem>
          <MenuItem onClick={() => toggleColumnVisibility('supplier')}>
            <Checkbox checked={!!visibleColumns['supplier']} />
            <ListItemText primary={t('purchaseOrders.table.supplier')} />
          </MenuItem>
          <MenuItem onClick={() => toggleColumnVisibility('orderDate')}>
            <Checkbox checked={!!visibleColumns['orderDate']} />
            <ListItemText primary={t('purchaseOrders.table.orderDate')} />
          </MenuItem>
          <MenuItem onClick={() => toggleColumnVisibility('expectedDeliveryDate')}>
            <Checkbox checked={!!visibleColumns['expectedDeliveryDate']} />
            <ListItemText primary="Oczekiwana dostawa" />
          </MenuItem>
          <MenuItem onClick={() => toggleColumnVisibility('value')}>
            <Checkbox checked={!!visibleColumns['value']} />
            <ListItemText primary={t('purchaseOrders.table.totalValue')} />
          </MenuItem>
          <MenuItem onClick={() => toggleColumnVisibility('statusAndPayment')}>
            <Checkbox checked={!!visibleColumns['statusAndPayment']} />
            <ListItemText primary="Status / Płatność" />
          </MenuItem>
        </Menu>
      </Paper>
      
      <Fade in={!loading} timeout={300}>
        <Paper>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  {visibleColumns['number'] && <SortableTableCell id="number" label={t('purchaseOrders.table.number')} sx={{ width: '120px', minWidth: '100px' }} />}
                  {visibleColumns['supplier'] && <SortableTableCell id="supplier" label={t('purchaseOrders.table.supplier')} />}
                  {visibleColumns['orderDate'] && <SortableTableCell id="orderDate" label={t('purchaseOrders.table.orderDate')} sx={{ width: '130px', minWidth: '120px' }} />}
                  {visibleColumns['expectedDeliveryDate'] && <SortableTableCell id="expectedDeliveryDate" label="Oczekiwana dostawa" sx={{ width: '140px', minWidth: '130px' }} />}
                  {visibleColumns['value'] && <SortableTableCell id="value" label={t('purchaseOrders.table.totalValue')} />}
                  {visibleColumns['statusAndPayment'] && <SortableTableCell id="status" label="Status / Płatność" />}
                  <TableCell align="right">{t('purchaseOrders.table.actions')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  Array.from({ length: pageSize }).map((_, index) => (
                    <TableRow key={index}>
                      {visibleColumns['number'] && (
                        <TableCell>
                          <Skeleton variant="text" width="80%" height={24} />
                        </TableCell>
                      )}
                      {visibleColumns['supplier'] && (
                        <TableCell>
                          <Skeleton variant="text" width="70%" height={24} />
                        </TableCell>
                      )}
                      {visibleColumns['orderDate'] && (
                        <TableCell>
                          <Skeleton variant="text" width="60%" height={24} />
                        </TableCell>
                      )}
                      {visibleColumns['expectedDeliveryDate'] && (
                        <TableCell>
                          <Skeleton variant="text" width="60%" height={24} />
                        </TableCell>
                      )}
                      {visibleColumns['value'] && (
                        <TableCell>
                          <Skeleton variant="text" width="50%" height={24} />
                        </TableCell>
                      )}
                      {visibleColumns['statusAndPayment'] && (
                        <TableCell>
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                            <Skeleton variant="rectangular" width={80} height={24} />
                            <Skeleton variant="rectangular" width={100} height={24} />
                          </Box>
                        </TableCell>
                      )}
                      <TableCell align="right">
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                          <Skeleton variant="circular" width={24} height={24} />
                          <Skeleton variant="circular" width={24} height={24} />
                          <Skeleton variant="circular" width={24} height={24} />
                          <Skeleton variant="circular" width={24} height={24} />
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))
                ) : filteredPOs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      <Typography variant="body1">{t('purchaseOrders.noOrdersFound')}</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredPOs.map((po) => (
                    <TableRow key={po.id}>
                      {visibleColumns['number'] && (
                        <TableCell>
                          <Link 
                            to={`/purchase-orders/${po.id}`}
                            style={{ textDecoration: 'none', color: 'inherit' }}
                          >
                            <Typography variant="body2" fontWeight="medium">
                              {po.number || `#${po.id.substring(0, 8).toUpperCase()}`}
                            </Typography>
                          </Link>
                        </TableCell>
                      )}
                      
                      {visibleColumns['supplier'] && (
                        <TableCell>
                          {po.supplier ? po.supplier.name : '-'}
                        </TableCell>
                      )}
                      
                      {visibleColumns['orderDate'] && (
                        <TableCell>
                          {(() => {
                            if (!po.orderDate) return '-';
                            try {
                              let dateObj;
                              
                              // Obsługa Firestore Timestamp
                              if (po.orderDate && typeof po.orderDate.toDate === 'function') {
                                dateObj = po.orderDate.toDate();
                              } 
                              // Obsługa stringa ISO
                              else if (typeof po.orderDate === 'string') {
                                dateObj = new Date(po.orderDate);
                              } 
                              // Obsługa obiektu Date
                              else if (po.orderDate instanceof Date) {
                                dateObj = po.orderDate;
                              } 
                              else {
                                return 'Invalid Date';
                              }
                              
                              return dateObj.toLocaleDateString();
                            } catch (error) {
                              return 'Invalid Date';
                            }
                          })()}
                        </TableCell>
                      )}
                      
                      {visibleColumns['expectedDeliveryDate'] && (
                        <TableCell>
                          {(() => {
                            if (!po.expectedDeliveryDate) return '-';
                            try {
                              let dateObj;
                              
                              // Obsługa Firestore Timestamp
                              if (po.expectedDeliveryDate && typeof po.expectedDeliveryDate.toDate === 'function') {
                                dateObj = po.expectedDeliveryDate.toDate();
                              } 
                              // Obsługa stringa ISO
                              else if (typeof po.expectedDeliveryDate === 'string') {
                                dateObj = new Date(po.expectedDeliveryDate);
                              } 
                              // Obsługa obiektu Date
                              else if (po.expectedDeliveryDate instanceof Date) {
                                dateObj = po.expectedDeliveryDate;
                              } 
                              else {
                                return 'Invalid Date';
                              }
                              
                              return dateObj.toLocaleDateString();
                            } catch (error) {
                              return 'Invalid Date';
                            }
                          })()}
                        </TableCell>
                      )}
                      
                      {visibleColumns['value'] && (
                        <TableCell>
                          {po.totalGross !== undefined ? 
                            `${Number(po.totalGross).toFixed(2)} ${formatCurrencySymbol(po.currency || 'PLN')}` : 
                            '-'}
                        </TableCell>
                      )}
                      
                      {visibleColumns['statusAndPayment'] && (
                        <TableCell>
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                            {getStatusChip(po.status, po)}
                            {getPaymentStatusChip(po.paymentStatus, po)}
                          </Box>
                        </TableCell>
                      )}
                      
                      <TableCell align="right">
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <Tooltip title={t('purchaseOrders.actions.view')}>
                            <IconButton 
                              size="small" 
                              component={Link}
                              to={`/purchase-orders/${po.id}`}
                            >
                              <ViewIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          
                          <Tooltip title={t('purchaseOrders.actions.edit')}>
                            <IconButton 
                              size="small" 
                              component={Link}
                              to={`/purchase-orders/${po.id}/edit`}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          
                          <Tooltip title="Aktualizuj ceny partii">
                            <IconButton 
                              size="small" 
                              color="primary"
                              onClick={() => handleUpdateBatches(po)}
                              disabled={updatingBatches[po.id] || false}
                            >
                              {updatingBatches[po.id] ? (
                                <CircularProgress size={16} />
                              ) : (
                                <SyncIcon fontSize="small" />
                              )}
                            </IconButton>
                          </Tooltip>
                          
                          <Tooltip title={t('purchaseOrders.actions.delete')}>
                            <IconButton 
                              size="small" 
                              color="error"
                              onClick={() => handleDeleteClick(po)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>

            </Table>
          </TableContainer>
        </Paper>
      </Fade>
      
      {/* Paginacja podobnie jak w TaskList */}
      <Fade in={showContent && !mainTableLoading} timeout={300}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2, flexDirection: 'column', alignItems: 'center' }}>
          <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
            <Typography variant="body2" color="textSecondary">
              Wyświetlanie {purchaseOrders.length > 0 ? (page - 1) * pageSize + 1 : 0} - {Math.min(page * pageSize, totalItems)} z {totalItems} zamówień zakupu
            </Typography>
            
            <FormControl variant="outlined" size="small" sx={{ minWidth: 80 }}>
              <Select
                value={pageSize}
                onChange={handleChangeRowsPerPage}
              >
                <MenuItem value={5}>5</MenuItem>
                <MenuItem value={10}>10</MenuItem>
                <MenuItem value={25}>25</MenuItem>
                <MenuItem value={50}>50</MenuItem>
              </Select>
            </FormControl>
          </Box>
          
          <Pagination
            count={totalPages}
            page={page}
            onChange={handleChangePage}
            shape="rounded"
            color="primary"
          />
        </Box>
      </Fade>

      {/* Dialog potwierdzenia usunięcia */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>{t('purchaseOrders.dialogs.deleteConfirm.title')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('purchaseOrders.dialogs.deleteConfirm.message')}
            {poToDelete && (
              <>
                <br />
                Numer: {poToDelete.number || `#${poToDelete.id.substring(0, 8).toUpperCase()}`}
                <br />
                Dostawca: {poToDelete.supplier ? poToDelete.supplier.name : 'Nieznany'}
              </>
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button color="error" onClick={handleDeleteConfirm}>{t('common.delete')}</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog zmiany statusu */}
      <Dialog
        open={statusDialogOpen}
        onClose={() => setStatusDialogOpen(false)}
      >
        <DialogTitle>{t('purchaseOrders.dialogs.statusUpdate.title')}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {t('purchaseOrders.dialogs.statusUpdate.newStatus')}:
            {poToUpdateStatus && (
              <>
                <br />
                Numer: {poToUpdateStatus.number || `#${poToUpdateStatus.id.substring(0, 8).toUpperCase()}`}
              </>
            )}
          </DialogContentText>
          <FormControl fullWidth>
            <InputLabel id="new-status-label">{t('purchaseOrders.table.status')}</InputLabel>
            <Select
              labelId="new-status-label"
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              label={t('purchaseOrders.table.status')}
            >
              {['draft', 'ordered', 'shipped', 'partial', 'delivered', 'completed', 'cancelled'].map((status) => (
                <MenuItem key={status} value={status}>
                  {translateStatus(status)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatusDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button color="primary" onClick={handleStatusUpdate}>{t('common.update')}</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog potwierdzenia aktualizacji cen dostawców */}
      <Dialog
        open={supplierPricesDialogOpen}
        onClose={handleSupplierPricesCancel}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Zaktualizować ceny dostawców?
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Zamówienie zostanie oznaczone jako zakończone.
          </DialogContentText>
          <DialogContentText sx={{ mt: 2, fontWeight: 'bold' }}>
            Czy chcesz również automatycznie zaktualizować ceny dostawców w pozycjach magazynowych na podstawie cen z tego zamówienia?
          </DialogContentText>
          <DialogContentText sx={{ mt: 2, fontSize: '0.875rem', color: 'text.secondary' }}>
            • Zaktualizowane ceny zostaną ustawione jako domyślne<br/>
            • Historia zmian cen zostanie zachowana<br/>
            • Można to zrobić później ręcznie z menu akcji
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleSupplierPricesCancel} color="inherit">
            Anuluj
          </Button>
          <Button 
            onClick={() => handleSupplierPricesConfirm(false)} 
            color="primary"
            variant="outlined"
          >
            Tylko zmień status
          </Button>
          <Button 
            onClick={() => handleSupplierPricesConfirm(true)} 
            color="primary"
            variant="contained"
            startIcon={<RefreshIcon />}
          >
            Zmień status i zaktualizuj ceny
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog zmiany statusu płatności */}
      <Dialog
        open={paymentStatusDialogOpen}
        onClose={() => setPaymentStatusDialogOpen(false)}
      >
        <DialogTitle>{t('purchaseOrders.dialogs.paymentStatusUpdate.title')}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {t('purchaseOrders.dialogs.paymentStatusUpdate.newPaymentStatus')}:
            {poToUpdatePaymentStatus && (
              <>
                <br />
                Numer: {poToUpdatePaymentStatus.number || `#${poToUpdatePaymentStatus.id.substring(0, 8).toUpperCase()}`}
              </>
            )}
          </DialogContentText>
          <FormControl fullWidth>
            <InputLabel id="new-payment-status-label">{t('purchaseOrders.table.paymentStatus')}</InputLabel>
            <Select
              labelId="new-payment-status-label"
              value={newPaymentStatus}
              onChange={(e) => setNewPaymentStatus(e.target.value)}
              label={t('purchaseOrders.table.paymentStatus')}
            >
              <MenuItem value={PURCHASE_ORDER_PAYMENT_STATUSES.UNPAID}>
                {translatePaymentStatus(PURCHASE_ORDER_PAYMENT_STATUSES.UNPAID)}
              </MenuItem>
              <MenuItem value={PURCHASE_ORDER_PAYMENT_STATUSES.PAID}>
                {translatePaymentStatus(PURCHASE_ORDER_PAYMENT_STATUSES.PAID)}
              </MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPaymentStatusDialogOpen(false)}>{t('common.cancel')}</Button>
          <Button color="primary" onClick={handlePaymentStatusUpdate}>{t('common.update')}</Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog szczegółów aktualizacji partii */}
      <Dialog
        open={batchUpdateDialogOpen}
        onClose={() => setBatchUpdateDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SyncIcon color="primary" />
            Wyniki aktualizacji cen partii
            {batchUpdateResults && (
              <Chip 
                label={`PO: ${batchUpdateResults.poNumber}`} 
                variant="outlined" 
                size="small" 
              />
            )}
          </Box>
        </DialogTitle>
        <DialogContent>
          {batchUpdateResults && (
            <>
              {/* Podsumowanie */}
              <Alert 
                severity={batchUpdateResults.summary?.errors > 0 ? 'warning' : 'success'} 
                sx={{ mb: 2 }}
              >
                <Typography variant="body2">
                  <strong>{batchUpdateResults.message}</strong>
                </Typography>
                <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                  Łącznie partii: {batchUpdateResults.total} | 
                  Ze zmianami: {batchUpdateResults.summary?.changed || 0} | 
                  Bez zmian: {batchUpdateResults.summary?.unchanged || 0} | 
                  Błędy: {batchUpdateResults.summary?.errors || 0}
                  {batchUpdateResults.additionalCosts > 0 && (
                    <> | Dodatkowe koszty: {batchUpdateResults.additionalCosts.toFixed(2)} €</>
                  )}
                </Typography>
              </Alert>
              
              {/* Lista szczegółów partii */}
              <Typography variant="h6" gutterBottom>
                Szczegóły aktualizacji partii:
              </Typography>
              
              <Paper variant="outlined" sx={{ maxHeight: 400, overflow: 'auto' }}>
                <List dense>
                  {batchUpdateResults.details.map((batch, index) => (
                    <ListItem key={batch.batchId} sx={{ 
                      borderBottom: index < batchUpdateResults.details.length - 1 ? '1px solid #e0e0e0' : 'none',
                      flexDirection: 'column',
                      alignItems: 'stretch'
                    }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', mb: 1 }}>
                        <Box>
                          <Typography variant="subtitle2" color="primary">
                            {batch.batchNumber} - {batch.itemName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            ID: {batch.batchId} | Ilość: {batch.quantity}
                            {batch.itemPoId && ` | Item PO ID: ${batch.itemPoId}`}
                          </Typography>
                        </Box>
                        <Box sx={{ textAlign: 'right' }}>
                          {batch.updated ? (
                            batch.hasChanges ? (
                              <Chip label="Zaktualizowano" color="success" size="small" />
                            ) : (
                              <Chip label="Bez zmian" color="default" size="small" />
                            )
                          ) : (
                            <Chip label="Błąd" color="error" size="small" />
                          )}
                        </Box>
                      </Box>
                      
                      {batch.error && (
                        <Alert severity="error" sx={{ mt: 1 }}>
                          <Typography variant="caption">{batch.error}</Typography>
                        </Alert>
                      )}
                      
                      {batch.changes && (
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, mt: 1 }}>
                          {/* Cena bazowa */}
                          <Box>
                            <Typography variant="caption" color="text.secondary" display="block">
                              Cena bazowa:
                            </Typography>
                            <Typography variant="body2">
                              {batch.changes.baseUnitPrice.old.toFixed(4)} €
                              {batch.changes.baseUnitPrice.changed && (
                                <>
                                  {' → '}
                                  <strong style={{ color: batch.changes.baseUnitPrice.difference > 0 ? '#4caf50' : '#f44336' }}>
                                    {batch.changes.baseUnitPrice.new.toFixed(4)} €
                                  </strong>
                                  <Typography variant="caption" display="block" 
                                    style={{ color: batch.changes.baseUnitPrice.difference > 0 ? '#4caf50' : '#f44336' }}
                                  >
                                    ({batch.changes.baseUnitPrice.difference > 0 ? '+' : ''}{batch.changes.baseUnitPrice.difference.toFixed(4)} €)
                                  </Typography>
                                </>
                              )}
                            </Typography>
                          </Box>
                          
                          {/* Dodatkowy koszt */}
                          <Box>
                            <Typography variant="caption" color="text.secondary" display="block">
                              Koszt dodatkowy:
                            </Typography>
                            <Typography variant="body2">
                              {batch.changes.additionalCostPerUnit.old.toFixed(4)} €
                              {batch.changes.additionalCostPerUnit.changed && (
                                <>
                                  {' → '}
                                  <strong style={{ color: batch.changes.additionalCostPerUnit.difference > 0 ? '#4caf50' : '#f44336' }}>
                                    {batch.changes.additionalCostPerUnit.new.toFixed(4)} €
                                  </strong>
                                  <Typography variant="caption" display="block" 
                                    style={{ color: batch.changes.additionalCostPerUnit.difference > 0 ? '#4caf50' : '#f44336' }}
                                  >
                                    ({batch.changes.additionalCostPerUnit.difference > 0 ? '+' : ''}{batch.changes.additionalCostPerUnit.difference.toFixed(4)} €)
                                  </Typography>
                                </>
                              )}
                            </Typography>
                          </Box>
                          
                          {/* Cena końcowa */}
                          <Box>
                            <Typography variant="caption" color="text.secondary" display="block">
                              <strong>Cena końcowa:</strong>
                            </Typography>
                            <Typography variant="body2">
                              <strong>{batch.changes.finalUnitPrice.old.toFixed(4)} €</strong>
                              {batch.changes.finalUnitPrice.changed && (
                                <>
                                  {' → '}
                                  <strong style={{ 
                                    color: batch.changes.finalUnitPrice.difference > 0 ? '#4caf50' : '#f44336',
                                    fontSize: '1.1em'
                                  }}>
                                    {batch.changes.finalUnitPrice.new.toFixed(4)} €
                                  </strong>
                                  <Typography variant="caption" display="block" 
                                    style={{ 
                                      color: batch.changes.finalUnitPrice.difference > 0 ? '#4caf50' : '#f44336',
                                      fontWeight: 'bold'
                                    }}
                                  >
                                    ({batch.changes.finalUnitPrice.difference > 0 ? '+' : ''}{batch.changes.finalUnitPrice.difference.toFixed(4)} €)
                                  </Typography>
                                </>
                              )}
                            </Typography>
                          </Box>
                        </Box>
                      )}
                    </ListItem>
                  ))}
                </List>
              </Paper>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBatchUpdateDialogOpen(false)} variant="contained">
            Zamknij
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog potwierdzenia krótkich dat ważności */}
      <Dialog
        open={shortExpiryConfirmDialogOpen}
        onClose={handleShortExpiryCancel}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Ostrzeżenie - Krótkie daty ważności</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Następujące pozycje mają datę ważności krótszą niż 16 miesięcy od daty zamówienia:
          </DialogContentText>
          
          {shortExpiryItems.length > 0 && (
            <Table size="small" sx={{ mt: 2 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Nazwa produktu</TableCell>
                  <TableCell>Data ważności</TableCell>
                  <TableCell>Miesiące do wygaśnięcia</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {shortExpiryItems.map((item, index) => {
                  const orderDate = new Date(poToUpdateStatus?.orderDate);
                  const expiryDate = typeof item.expiryDate === 'string' 
                    ? new Date(item.expiryDate) 
                    : item.expiryDate instanceof Date 
                      ? item.expiryDate 
                      : item.expiryDate?.toDate?.() || new Date();
                  
                  const monthsDiff = Math.floor((expiryDate - orderDate) / (1000 * 60 * 60 * 24 * 30.44));
                  
                  return (
                    <TableRow key={index}>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>
                        {isValid(expiryDate) 
                          ? format(expiryDate, 'dd.MM.yyyy', { locale: pl })
                          : 'Nieprawidłowa data'
                        }
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={`${monthsDiff} miesięcy`}
                          color={monthsDiff < 12 ? 'error' : monthsDiff < 16 ? 'warning' : 'default'}
                          size="small"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          
          <DialogContentText sx={{ mt: 2, fontWeight: 'bold' }}>
            Czy na pewno chcesz kontynuować zmianę statusu na "Zamówione"?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleShortExpiryCancel}>Anuluj</Button>
          <Button onClick={handleShortExpiryConfirm} color="warning" variant="contained">
            Kontynuuj mimo ostrzeżenia
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog generowania raportu CSV */}
      <PurchaseOrderReportDialog
        open={reportDialogOpen}
        onClose={() => setReportDialogOpen(false)}
        onGenerate={handleGenerateReport}
      />
    </Container>
  );
};

export default PurchaseOrderList; 