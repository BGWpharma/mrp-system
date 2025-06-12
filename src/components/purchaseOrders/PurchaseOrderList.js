import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Container, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, TextField, Box, Chip, IconButton, Dialog,
  DialogActions, DialogContent, DialogContentText, DialogTitle, MenuItem, Select, FormControl, InputLabel, 
  Tooltip, Menu, Checkbox, ListItemText, TableSortLabel, Pagination, TableFooter, CircularProgress,
  Fade, Skeleton
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, Visibility as ViewIcon, ViewColumn as ViewColumnIcon, Clear as ClearIcon } from '@mui/icons-material';
import { getAllPurchaseOrders, deletePurchaseOrder, updatePurchaseOrderStatus, updatePurchaseOrderPaymentStatus, getPurchaseOrdersWithPagination, clearSearchCache, PURCHASE_ORDER_STATUSES, PURCHASE_ORDER_PAYMENT_STATUSES, translateStatus, translatePaymentStatus } from '../../services/purchaseOrderService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { useColumnPreferences } from '../../contexts/ColumnPreferencesContext';
import { usePurchaseOrderListState } from '../../contexts/PurchaseOrderListStateContext';

const PurchaseOrderList = () => {
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
  const [columnMenuAnchor, setColumnMenuAnchor] = useState(null);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  
  // Dodajemy stan dla opóźnionego wyszukiwania
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const searchTimeout = useRef(null);
  
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
  
  // Funkcja pobierająca dane z obsługą debounce dla wyszukiwania
  const fetchPurchaseOrders = useCallback(async () => {
    try {
      setLoading(true);
      
      // Przygotowujemy parametry filtrowania
      const filters = {
        status: statusFilter !== 'all' ? statusFilter : null,
        searchTerm: debouncedSearchTerm || null
      };
      
      // Jeśli jest wyszukiwanie, wyczyść cache aby pobrać świeże dane
      if (debouncedSearchTerm && debouncedSearchTerm.trim() !== '') {
        clearSearchCache();
        console.log('Wyczyszczono cache wyszukiwania');
      }
      
      // Używamy funkcji z paginacją i filtrowaniem po stronie serwera
      const response = await getPurchaseOrdersWithPagination(
        page, 
        pageSize, 
        tableSort.field, 
        tableSort.order,
        filters // Przekazujemy filtry do funkcji
      );
      
      console.log(`Pobieranie zamówień: strona ${page}, rozmiar ${pageSize}`);
      
      // Ustawiamy dane i informacje o paginacji
      setPurchaseOrders(response.data);
      setFilteredPOs(response.data); // Nie potrzebujemy już lokalnego filtrowania
      
      setTotalItems(response.pagination.totalItems);
      setTotalPages(response.pagination.totalPages);
      
      // Opóźnienie dla efektu wizualnego podobnie jak w liście stanów magazynowych
      setTimeout(() => {
        setLoading(false);
      }, 300);
    } catch (error) {
      console.error('Błąd podczas pobierania zamówień zakupu:', error);
      showError('Nie udało się pobrać listy zamówień zakupu');
      setLoading(false);
    }
  }, [page, pageSize, tableSort.field, tableSort.order, statusFilter, debouncedSearchTerm, showError]);
  
  // Wywołujemy fetchPurchaseOrders przy zmianach parametrów
  useEffect(() => {
    fetchPurchaseOrders();
  }, [fetchPurchaseOrders]);
  
  // Obsługa debounce dla wyszukiwania
  useEffect(() => {
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }
    
    searchTimeout.current = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 1000); // 1000ms opóźnienia (1 sekunda)
    
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
  
  const handleSearchChange = (e) => {
    listActions.setSearchTerm(e.target.value);
    // Nie resetujemy strony tutaj, to nastąpi przy zmianie debouncedSearchTerm
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
      
      // Wywołaj API z pustymi filtrami
      const response = await getPurchaseOrdersWithPagination(
        1, // Reset do pierwszej strony
        pageSize, 
        tableSort.field, 
        tableSort.order,
        { status: null, searchTerm: null } // Puste filtry
      );
      
      // Ustawiamy dane i informacje o paginacji
      setPurchaseOrders(response.data);
      setFilteredPOs(response.data);
      
      setTotalItems(response.pagination.totalItems);
      setTotalPages(response.pagination.totalPages);
      
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
  
  const handleDeleteConfirm = async () => {
    try {
      await deletePurchaseOrder(poToDelete.id);
      // Po usunięciu odświeżamy listę
      fetchPurchaseOrders();
      showSuccess('Zamówienie zakupu zostało usunięte');
      setDeleteDialogOpen(false);
      setPoToDelete(null);
    } catch (error) {
      console.error('Błąd podczas usuwania zamówienia zakupu:', error);
      showError('Nie udało się usunąć zamówienia zakupu');
    }
  };
  
  const handleStatusClick = (po) => {
    setPoToUpdateStatus(po);
    setNewStatus(po.status);
    setStatusDialogOpen(true);
  };
  
  const handleStatusUpdate = async () => {
    try {
      await updatePurchaseOrderStatus(poToUpdateStatus.id, newStatus, currentUser.uid);
      
      // Po aktualizacji odświeżamy listę
      fetchPurchaseOrders();
      
      showSuccess('Status zamówienia zakupu został zaktualizowany');
      setStatusDialogOpen(false);
      setPoToUpdateStatus(null);
    } catch (error) {
      console.error('Błąd podczas aktualizacji statusu zamówienia:', error);
      showError('Nie udało się zaktualizować statusu zamówienia');
    }
  };

  const handlePaymentStatusClick = (po) => {
    setPoToUpdatePaymentStatus(po);
    setNewPaymentStatus(po.paymentStatus || PURCHASE_ORDER_PAYMENT_STATUSES.UNPAID);
    setPaymentStatusDialogOpen(true);
  };

  const handlePaymentStatusUpdate = async () => {
    try {
      await updatePurchaseOrderPaymentStatus(poToUpdatePaymentStatus.id, newPaymentStatus, currentUser.uid);
      
      // Po aktualizacji odświeżamy listę
      fetchPurchaseOrders();
      
      showSuccess('Status płatności został zaktualizowany');
      setPaymentStatusDialogOpen(false);
      setPoToUpdatePaymentStatus(null);
    } catch (error) {
      console.error('Błąd podczas aktualizacji statusu płatności:', error);
      showError('Nie udało się zaktualizować statusu płatności');
    }
  };
  
  // Funkcja do tłumaczenia statusów na skrócone wersje dla listy
  const translateStatusShort = (status) => {
    switch (status) {
      case 'draft': return 'Projekt';
      case 'pending': return 'Oczekujące';
      case 'approved': return 'Zatwierdzone';
      case 'ordered': return 'Zamówione';
      case 'partial': return 'Cz. dostarczone';
      case 'shipped': return 'Wysłane';
      case 'delivered': return 'Dostarczone';
      case 'completed': return 'Zakończone';
      case 'cancelled': return 'Anulowane';
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
      case PURCHASE_ORDER_STATUSES.PENDING:
        color = '#757575'; // szary - oczekujące
        break;
      case PURCHASE_ORDER_STATUSES.APPROVED:
        color = '#ffeb3b'; // żółty - zatwierdzone
        break;
      case PURCHASE_ORDER_STATUSES.ORDERED:
        color = '#1976d2'; // niebieski - zamówione
        break;
      case PURCHASE_ORDER_STATUSES.PARTIAL:
        color = '#81c784'; // jasno zielony - częściowo dostarczone
        break;
      case PURCHASE_ORDER_STATUSES.CONFIRMED:
        color = '#2196f3'; // jasnoniebieski - potwierdzone
        break;
      case PURCHASE_ORDER_STATUSES.SHIPPED:
        color = '#9c27b0'; // fioletowy - wysłane
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
    <Container>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="h5">Zamówienia Zakupu</Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={() => navigate('/purchase-orders/new')}
        >
          Nowe Zamówienie
        </Button>
      </Box>
      
      <Paper sx={{ mb: 1, p: 1 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2 }}>
          <TextField
            label="Szukaj"
            variant="outlined"
            size="small"
            value={searchTerm}
            onChange={handleSearchChange}
            sx={{ minWidth: '250px', flexGrow: 1 }}
          />
          
          <FormControl variant="outlined" size="small" sx={{ minWidth: '200px' }}>
            <InputLabel id="status-filter-label">Status</InputLabel>
            <Select
              labelId="status-filter-label"
              value={statusFilter}
              onChange={handleStatusFilterChange}
              label="Status"
            >
              <MenuItem value="all">Wszystkie statusy</MenuItem>
              {Object.values(PURCHASE_ORDER_STATUSES).map((status) => (
                <MenuItem key={status} value={status}>
                  {translateStatus(status)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          
          <Tooltip title="Wyczyść filtry">
            <IconButton 
              color="secondary" 
              onClick={handleClearFilters}
              size="small"
              disabled={searchTerm === '' && statusFilter === 'all'}
            >
              <ClearIcon />
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
            <ListItemText primary="Numer PO" />
          </MenuItem>
          <MenuItem onClick={() => toggleColumnVisibility('supplier')}>
            <Checkbox checked={!!visibleColumns['supplier']} />
            <ListItemText primary="Dostawca" />
          </MenuItem>
          <MenuItem onClick={() => toggleColumnVisibility('orderDate')}>
            <Checkbox checked={!!visibleColumns['orderDate']} />
            <ListItemText primary="Data zamówienia" />
          </MenuItem>
          <MenuItem onClick={() => toggleColumnVisibility('expectedDeliveryDate')}>
            <Checkbox checked={!!visibleColumns['expectedDeliveryDate']} />
            <ListItemText primary="Oczekiwana dostawa" />
          </MenuItem>
          <MenuItem onClick={() => toggleColumnVisibility('value')}>
            <Checkbox checked={!!visibleColumns['value']} />
            <ListItemText primary="Wartość" />
          </MenuItem>
          <MenuItem onClick={() => toggleColumnVisibility('status')}>
            <Checkbox checked={!!visibleColumns['status']} />
            <ListItemText primary="Status" />
          </MenuItem>
          <MenuItem onClick={() => toggleColumnVisibility('paymentStatus')}>
            <Checkbox checked={!!visibleColumns['paymentStatus']} />
            <ListItemText primary="Status płatności" />
          </MenuItem>
        </Menu>
      </Paper>
      
      <Fade in={!loading} timeout={300}>
        <Paper>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  {visibleColumns['number'] && <SortableTableCell id="number" label="Numer PO" sx={{ width: '120px', minWidth: '100px' }} />}
                  {visibleColumns['supplier'] && <SortableTableCell id="supplier" label="Dostawca" />}
                  {visibleColumns['orderDate'] && <SortableTableCell id="orderDate" label="Data zamówienia" sx={{ width: '130px', minWidth: '120px' }} />}
                  {visibleColumns['expectedDeliveryDate'] && <SortableTableCell id="expectedDeliveryDate" label="Oczekiwana dostawa" sx={{ width: '140px', minWidth: '130px' }} />}
                  {visibleColumns['value'] && <SortableTableCell id="value" label="Wartość" />}
                  {visibleColumns['status'] && <SortableTableCell id="status" label="Status" />}
                  {visibleColumns['paymentStatus'] && <SortableTableCell id="paymentStatus" label="Status płatności" />}
                  <TableCell align="right">Akcje</TableCell>
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
                      {visibleColumns['status'] && (
                        <TableCell>
                          <Skeleton variant="rectangular" width={80} height={24} />
                        </TableCell>
                      )}
                      {visibleColumns['paymentStatus'] && (
                        <TableCell>
                          <Skeleton variant="rectangular" width={100} height={24} />
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
                    <TableCell colSpan={8} align="center">
                      <Typography variant="body1">Brak zamówień zakupowych</Typography>
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
                          {po.orderDate ? new Date(po.orderDate).toLocaleDateString() : '-'}
                        </TableCell>
                      )}
                      
                      {visibleColumns['expectedDeliveryDate'] && (
                        <TableCell>
                          {po.expectedDeliveryDate ? new Date(po.expectedDeliveryDate).toLocaleDateString() : '-'}
                        </TableCell>
                      )}
                      
                      {visibleColumns['value'] && (
                        <TableCell>
                          {po.totalGross !== undefined ? 
                            `${Number(po.totalGross).toFixed(2)} ${formatCurrencySymbol(po.currency || 'PLN')}` : 
                            '-'}
                        </TableCell>
                      )}
                      
                      {visibleColumns['status'] && (
                        <TableCell>
                          {getStatusChip(po.status, po)}
                        </TableCell>
                      )}
                      
                      {visibleColumns['paymentStatus'] && (
                        <TableCell>
                          {getPaymentStatusChip(po.paymentStatus, po)}
                        </TableCell>
                      )}
                      
                      <TableCell align="right">
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <Tooltip title="Podgląd">
                            <IconButton 
                              size="small" 
                              component={Link}
                              to={`/purchase-orders/${po.id}`}
                            >
                              <ViewIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          
                          <Tooltip title="Edytuj">
                            <IconButton 
                              size="small" 
                              component={Link}
                              to={`/purchase-orders/${po.id}/edit`}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          
                          <Tooltip title="Usuń">
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
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={8}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Typography variant="body2">
                          Wierszy na stronę:
                        </Typography>
                        <Select
                          value={pageSize}
                          onChange={handleChangeRowsPerPage}
                          size="small"
                        >
                          {[5, 10, 25, 50].map(size => (
                            <MenuItem key={size} value={size}>
                              {size}
                            </MenuItem>
                          ))}
                        </Select>
                      </Box>
                      <Pagination 
                        count={totalPages}
                        page={page}
                        onChange={handleChangePage}
                        color="primary"
                        showFirstButton
                        showLastButton
                      />
                      <Typography variant="body2">
                        Wyświetlanie {filteredPOs.length > 0 ? (page - 1) * pageSize + 1 : 0}-{Math.min(page * pageSize, totalItems)} z {totalItems}
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </TableContainer>
        </Paper>
      </Fade>

      {/* Dialog potwierdzenia usunięcia */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>Potwierdzenie usunięcia</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Czy na pewno chcesz usunąć zamówienie zakupowe?
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
          <Button onClick={() => setDeleteDialogOpen(false)}>Anuluj</Button>
          <Button color="error" onClick={handleDeleteConfirm}>Usuń</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog zmiany statusu */}
      <Dialog
        open={statusDialogOpen}
        onClose={() => setStatusDialogOpen(false)}
      >
        <DialogTitle>Zmiana statusu zamówienia</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Wybierz nowy status dla zamówienia:
            {poToUpdateStatus && (
              <>
                <br />
                Numer: {poToUpdateStatus.number || `#${poToUpdateStatus.id.substring(0, 8).toUpperCase()}`}
              </>
            )}
          </DialogContentText>
          <FormControl fullWidth>
            <InputLabel id="new-status-label">Status</InputLabel>
            <Select
              labelId="new-status-label"
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              label="Status"
            >
              {Object.values(PURCHASE_ORDER_STATUSES).map((status) => (
                <MenuItem key={status} value={status}>
                  {translateStatus(status)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatusDialogOpen(false)}>Anuluj</Button>
          <Button color="primary" onClick={handleStatusUpdate}>Zaktualizuj</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog zmiany statusu płatności */}
      <Dialog
        open={paymentStatusDialogOpen}
        onClose={() => setPaymentStatusDialogOpen(false)}
      >
        <DialogTitle>Zmiana statusu płatności</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Wybierz nowy status płatności dla zamówienia:
            {poToUpdatePaymentStatus && (
              <>
                <br />
                Numer: {poToUpdatePaymentStatus.number || `#${poToUpdatePaymentStatus.id.substring(0, 8).toUpperCase()}`}
              </>
            )}
          </DialogContentText>
          <FormControl fullWidth>
            <InputLabel id="new-payment-status-label">Status płatności</InputLabel>
            <Select
              labelId="new-payment-status-label"
              value={newPaymentStatus}
              onChange={(e) => setNewPaymentStatus(e.target.value)}
              label="Status płatności"
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
          <Button onClick={() => setPaymentStatusDialogOpen(false)}>Anuluj</Button>
          <Button color="primary" onClick={handlePaymentStatusUpdate}>Zaktualizuj</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default PurchaseOrderList; 