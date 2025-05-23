import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Container, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, TextField, Box, Chip, IconButton, Dialog,
  DialogActions, DialogContent, DialogContentText, DialogTitle, MenuItem, Select, FormControl, InputLabel, 
  Tooltip, Menu, Checkbox, ListItemText, TableSortLabel, Pagination, TableFooter
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, Visibility as ViewIcon, Description as DescriptionIcon, ViewColumn as ViewColumnIcon } from '@mui/icons-material';
import { getAllPurchaseOrders, deletePurchaseOrder, updatePurchaseOrderStatus, getPurchaseOrdersWithPagination, clearSearchCache } from '../../services/purchaseOrderService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { STATUS_TRANSLATIONS, PURCHASE_ORDER_STATUSES } from '../../config';
import { useColumnPreferences } from '../../contexts/ColumnPreferencesContext';

const PurchaseOrderList = () => {
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const navigate = useNavigate();
  
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [filteredPOs, setFilteredPOs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [poToDelete, setPoToDelete] = useState(null);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [poToUpdateStatus, setPoToUpdateStatus] = useState(null);
  const [newStatus, setNewStatus] = useState('');
  const [columnMenuAnchor, setColumnMenuAnchor] = useState(null);
  
  // Dodajemy stany do obsługi sortowania
  const [orderBy, setOrderBy] = useState('number'); // Domyślnie sortowanie po numerze
  const [order, setOrder] = useState('asc'); // Domyślnie rosnąco
  
  // Dodajemy stany do obsługi paginacji
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  
  // Dodajemy stan dla opóźnionego wyszukiwania
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [searchTimeout, setSearchTimeout] = useState(null);
  
  // Używamy kontekstu preferencji kolumn
  const { getColumnPreferencesForView, updateColumnPreferences } = useColumnPreferences();
  // Pobieramy preferencje dla widoku 'purchaseOrders'
  const visibleColumns = getColumnPreferencesForView('purchaseOrders');
  
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
      
      // OPTYMALIZACJA: Zwiększamy interwały między zapytaniami i zmniejszamy ilość danych
      // Zmniejszamy domyślną liczbę elementów z 10 do 5, jeśli nie jest określona inaczej
      const optimizedLimit = limit || 5;
      
      // Używamy funkcji z paginacją i filtrowaniem po stronie serwera
      // Dodajemy ograniczenie ilości pobieranych pól, aby zmniejszyć rozmiar odpowiedzi
      const response = await getPurchaseOrdersWithPagination(
        page, 
        optimizedLimit, 
        orderBy, 
        order,
        filters // Przekazujemy filtry do funkcji
      );
      
      console.log(`Zoptymalizowane pobieranie: strona ${page}, limit ${optimizedLimit}`);
      
      // Ustawiamy dane i informacje o paginacji
      setPurchaseOrders(response.data);
      setFilteredPOs(response.data); // Nie potrzebujemy już lokalnego filtrowania
      
      setTotalItems(response.pagination.totalItems);
      setTotalPages(response.pagination.totalPages);
      
      setLoading(false);
    } catch (error) {
      console.error('Błąd podczas pobierania zamówień zakupu:', error);
      showError('Nie udało się pobrać listy zamówień zakupu');
      setLoading(false);
    }
  }, [page, limit, orderBy, order, statusFilter, debouncedSearchTerm, showError]);
  
  // Wywołujemy fetchPurchaseOrders przy zmianach parametrów
  useEffect(() => {
    fetchPurchaseOrders();
  }, [fetchPurchaseOrders]);
  
  // Obsługa debounce dla wyszukiwania
  useEffect(() => {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    const timeoutId = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 1000); // 1000ms opóźnienia (1 sekunda)
    
    setSearchTimeout(timeoutId);
    
    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
    };
  }, [searchTerm]);
  
  // Funkcja obsługująca kliknięcie w nagłówek kolumny
  const handleRequestSort = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
    setPage(1); // Resetujemy do pierwszej strony przy zmianie sortowania
  };
  
  // Funkcja obsługująca zmianę strony
  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };
  
  // Funkcja obsługująca zmianę liczby elementów na stronę
  const handleChangeRowsPerPage = (event) => {
    setLimit(parseInt(event.target.value, 10));
    setPage(1); // Resetujemy do pierwszej strony
  };
  
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    // Nie resetujemy strony tutaj, to nastąpi przy zmianie debouncedSearchTerm
  };
  
  const handleStatusFilterChange = (e) => {
    setStatusFilter(e.target.value);
    setPage(1); // Resetujemy do pierwszej strony przy zmianie filtra
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
  
  const getStatusChip = (status) => {
    let label = STATUS_TRANSLATIONS[status] || status;
    let color = 'default';
    
    switch (status) {
      case PURCHASE_ORDER_STATUSES.DRAFT:
        color = 'default';
        break;
      case PURCHASE_ORDER_STATUSES.SENT:
        color = 'primary';
        break;
      case PURCHASE_ORDER_STATUSES.CONFIRMED:
        color = 'info';
        break;
      case PURCHASE_ORDER_STATUSES.PARTIALLY_RECEIVED:
        color = 'warning';
        break;
      case PURCHASE_ORDER_STATUSES.RECEIVED:
        color = 'success';
        break;
      case PURCHASE_ORDER_STATUSES.CANCELLED:
        color = 'error';
        break;
      default:
        color = 'default';
    }
    
    return (
      <Chip 
        label={label} 
        color={color} 
        size="small" 
        variant="filled"
        sx={{ fontWeight: 'medium' }}
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
    updateColumnPreferences('purchaseOrders', columnName);
  };
  
  // Komponent dla nagłówka kolumny z sortowaniem
  const SortableTableCell = ({ id, label, disableSorting = false }) => {
    return (
      <TableCell>
        {disableSorting ? (
          label
        ) : (
          <TableSortLabel
            active={orderBy === id}
            direction={orderBy === id ? order : 'asc'}
            onClick={() => handleRequestSort(id)}
          >
            {label}
          </TableSortLabel>
        )}
      </TableCell>
    );
  };
  
  if (loading) {
    return (
      <Container>
        <Typography variant="h6">Ładowanie zamówień zakupu...</Typography>
      </Container>
    );
  }
  
  return (
    <Container>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
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
      
      <Paper sx={{ mb: 3, p: 2 }}>
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
                  {STATUS_TRANSLATIONS[status] || status}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          
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
            <ListItemText primary="Numer zamówienia" />
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
        </Menu>
      </Paper>
      
      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                {visibleColumns['number'] && <SortableTableCell id="number" label="Numer zamówienia" />}
                {visibleColumns['supplier'] && <SortableTableCell id="supplier" label="Dostawca" />}
                {visibleColumns['orderDate'] && <SortableTableCell id="orderDate" label="Data zamówienia" />}
                {visibleColumns['expectedDeliveryDate'] && <SortableTableCell id="expectedDeliveryDate" label="Oczekiwana dostawa" />}
                {visibleColumns['value'] && <SortableTableCell id="value" label="Wartość" />}
                {visibleColumns['status'] && <SortableTableCell id="status" label="Status" />}
                <TableCell align="right">Akcje</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredPOs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center">
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
                          `${Number(po.totalGross).toFixed(2)} ${po.currency || 'PLN'}` : 
                          '-'}
                      </TableCell>
                    )}
                    
                    {visibleColumns['status'] && (
                      <TableCell>
                        {getStatusChip(po.status)}
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
                        
                        <Tooltip title="Zmień status">
                          <IconButton 
                            size="small" 
                            onClick={() => handleStatusClick(po)}
                          >
                            <DescriptionIcon fontSize="small" />
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
                <TableCell colSpan={7}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Typography variant="body2">
                        Wierszy na stronę:
                      </Typography>
                      <Select
                        value={limit}
                        onChange={handleChangeRowsPerPage}
                        size="small"
                      >
                        {[5, 10, 25, 50].map(pageSize => (
                          <MenuItem key={pageSize} value={pageSize}>
                            {pageSize}
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
                      Wyświetlanie {filteredPOs.length > 0 ? (page - 1) * limit + 1 : 0}-{Math.min(page * limit, totalItems)} z {totalItems}
                    </Typography>
                  </Box>
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </TableContainer>
      </Paper>

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
                  {STATUS_TRANSLATIONS[status] || status}
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
    </Container>
  );
};

export default PurchaseOrderList; 