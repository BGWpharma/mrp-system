import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Container, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, TextField, Box, Chip, IconButton, Dialog,
  DialogActions, DialogContent, DialogContentText, DialogTitle, MenuItem, Select, FormControl, InputLabel, 
  Tooltip, Menu, Checkbox, ListItemText, TableSortLabel, Pagination, TableFooter
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, Visibility as ViewIcon, Description as DescriptionIcon, ViewColumn as ViewColumnIcon } from '@mui/icons-material';
import { getAllPurchaseOrders, deletePurchaseOrder, updatePurchaseOrderStatus, getPurchaseOrdersWithPagination } from '../../services/purchaseOrderService';
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
  
  // Używamy kontekstu preferencji kolumn
  const { getColumnPreferencesForView, updateColumnPreferences } = useColumnPreferences();
  // Pobieramy preferencje dla widoku 'purchaseOrders'
  const visibleColumns = getColumnPreferencesForView('purchaseOrders');
  
  useEffect(() => {
    fetchPurchaseOrders();
  }, [page, limit, orderBy, order]); // Dodajemy zależności dla paginacji i sortowania
  
  useEffect(() => {
    // Przy zmianie filtrów resetujemy stronę do pierwszej
    if (searchTerm !== '' || statusFilter !== 'all') {
      setPage(1);
    }
    
    filterPurchaseOrders();
  }, [searchTerm, statusFilter, purchaseOrders]);
  
  const fetchPurchaseOrders = async () => {
    try {
      setLoading(true);
      
      // Używamy funkcji z paginacją zamiast getAllPurchaseOrders
      const response = await getPurchaseOrdersWithPagination(
        page, 
        limit, 
        orderBy, 
        order
      );
      
      // Ustawiamy dane i informacje o paginacji
      setPurchaseOrders(response.data);
      setFilteredPOs(response.data);
      setTotalItems(response.pagination.totalItems);
      setTotalPages(response.pagination.totalPages);
      
      setLoading(false);
    } catch (error) {
      console.error('Błąd podczas pobierania zamówień zakupu:', error);
      showError('Nie udało się pobrać listy zamówień zakupu');
      setLoading(false);
    }
  };
  
  const filterPurchaseOrders = () => {
    let filtered = [...purchaseOrders];
    
    // Filtrowanie po statusie
    if (statusFilter !== 'all') {
      filtered = filtered.filter(po => po.status === statusFilter);
    }
    
    // Filtrowanie po wyszukiwanym tekście
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(po => 
        po.number?.toLowerCase().includes(term) ||
        po.supplier?.name?.toLowerCase().includes(term)
      );
    }
    
    // Sortowanie wyników
    filtered = sortData(filtered);
    
    setFilteredPOs(filtered);
  };
  
  // Funkcja sortująca dane
  const sortData = (dataToSort) => {
    return dataToSort.sort((a, b) => {
      let valueA, valueB;
      
      // Określamy, jakie wartości porównać w zależności od wybranej kolumny
      switch (orderBy) {
        case 'number':
          valueA = a.number || '';
          valueB = b.number || '';
          break;
        case 'supplier':
          valueA = a.supplier?.name || '';
          valueB = b.supplier?.name || '';
          break;
        case 'orderDate':
          valueA = a.orderDate ? new Date(a.orderDate).getTime() : 0;
          valueB = b.orderDate ? new Date(b.orderDate).getTime() : 0;
          break;
        case 'expectedDeliveryDate':
          valueA = a.expectedDeliveryDate ? new Date(a.expectedDeliveryDate).getTime() : 0;
          valueB = b.expectedDeliveryDate ? new Date(b.expectedDeliveryDate).getTime() : 0;
          break;
        case 'value':
          // Kalkulujemy wartość brutto dla porównania
          const getTotal = (po) => {
            if (po.totalGross !== undefined && po.totalGross !== null) {
              return parseFloat(po.totalGross);
            }
            
            const productsValue = parseFloat(po.calculatedProductsValue || po.totalValue || 0);
            let additionalCostsValue = 0;
            
            if (po.calculatedAdditionalCosts !== undefined) {
              additionalCostsValue = parseFloat(po.calculatedAdditionalCosts);
            } else if (po.additionalCostsItems && Array.isArray(po.additionalCostsItems)) {
              additionalCostsValue = po.additionalCostsItems.reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0);
            } else if (po.additionalCosts) {
              additionalCostsValue = parseFloat(po.additionalCosts) || 0;
            }
            
            const vatValue = (productsValue * (parseFloat(po.vatRate) || 0)) / 100;
            return productsValue + vatValue + additionalCostsValue;
          };
          
          valueA = getTotal(a);
          valueB = getTotal(b);
          break;
        case 'status':
          valueA = a.status || '';
          valueB = b.status || '';
          break;
        default:
          valueA = a[orderBy] || '';
          valueB = b[orderBy] || '';
      }
      
      // Porównanie wartości
      const compareResult = typeof valueA === 'string' 
        ? valueA.localeCompare(valueB)
        : valueA - valueB;
        
      // Zwróć wynik sortowania w zależności od wybranego kierunku (rosnąco/malejąco)
      return order === 'asc' ? compareResult : -compareResult;
    });
  };
  
  // Funkcja obsługująca kliknięcie w nagłówek kolumny
  const handleRequestSort = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
    // Nie wywołujemy filterPurchaseOrders, ponieważ zmiana order i orderBy spowoduje wywołanie fetchPurchaseOrders 
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
  };
  
  const handleStatusFilterChange = (e) => {
    setStatusFilter(e.target.value);
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
      case PURCHASE_ORDER_STATUSES.PENDING:
        color = 'primary';
        break;
      case PURCHASE_ORDER_STATUSES.CONFIRMED:
        color = 'info';
        break;
      case PURCHASE_ORDER_STATUSES.SHIPPED:
        color = 'secondary';
        break;
      case PURCHASE_ORDER_STATUSES.DELIVERED:
        color = 'success';
        break;
      case PURCHASE_ORDER_STATUSES.CANCELLED:
        color = 'error';
        break;
      case PURCHASE_ORDER_STATUSES.COMPLETED:
        color = 'success';
        break;
      default:
        break;
    }
    
    return <Chip label={label} color={color} />;
  };
  
  const handleColumnMenuOpen = (event) => {
    setColumnMenuAnchor(event.currentTarget);
  };

  const handleColumnMenuClose = () => {
    setColumnMenuAnchor(null);
  };

  const toggleColumnVisibility = (columnName) => {
    // Zamiast lokalnego setVisibleColumns, używamy funkcji updateColumnPreferences z kontekstu
    updateColumnPreferences('purchaseOrders', columnName, !visibleColumns[columnName]);
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
      
      <Box sx={{ display: 'flex', mb: 3, gap: 2 }}>
        <TextField
          label="Szukaj"
          variant="outlined"
          size="small"
          value={searchTerm}
          onChange={handleSearchChange}
          sx={{ flexGrow: 1 }}
        />
        
        <FormControl variant="outlined" size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Status</InputLabel>
          <Select
            value={statusFilter}
            onChange={handleStatusFilterChange}
            label="Status"
          >
            <MenuItem value="all">Wszystkie</MenuItem>
            <MenuItem value={PURCHASE_ORDER_STATUSES.DRAFT}>{STATUS_TRANSLATIONS[PURCHASE_ORDER_STATUSES.DRAFT]}</MenuItem>
            <MenuItem value={PURCHASE_ORDER_STATUSES.PENDING}>{STATUS_TRANSLATIONS[PURCHASE_ORDER_STATUSES.PENDING]}</MenuItem>
            <MenuItem value={PURCHASE_ORDER_STATUSES.CONFIRMED}>{STATUS_TRANSLATIONS[PURCHASE_ORDER_STATUSES.CONFIRMED]}</MenuItem>
            <MenuItem value={PURCHASE_ORDER_STATUSES.SHIPPED}>{STATUS_TRANSLATIONS[PURCHASE_ORDER_STATUSES.SHIPPED]}</MenuItem>
            <MenuItem value={PURCHASE_ORDER_STATUSES.DELIVERED}>{STATUS_TRANSLATIONS[PURCHASE_ORDER_STATUSES.DELIVERED]}</MenuItem>
            <MenuItem value={PURCHASE_ORDER_STATUSES.CANCELLED}>{STATUS_TRANSLATIONS[PURCHASE_ORDER_STATUSES.CANCELLED]}</MenuItem>
            <MenuItem value={PURCHASE_ORDER_STATUSES.COMPLETED}>{STATUS_TRANSLATIONS[PURCHASE_ORDER_STATUSES.COMPLETED]}</MenuItem>
          </Select>
        </FormControl>
        
        <Tooltip title="Konfiguruj widoczne kolumny">
          <IconButton onClick={handleColumnMenuOpen}>
            <ViewColumnIcon />
          </IconButton>
        </Tooltip>
      </Box>
      
      {filteredPOs.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body1">Brak zamówień zakupu spełniających kryteria wyszukiwania</Typography>
        </Paper>
      ) : (
        <Paper>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  {visibleColumns.number && <SortableTableCell id="number" label="Numer" />}
                  {visibleColumns.supplier && <SortableTableCell id="supplier" label="Dostawca" />}
                  {visibleColumns.orderDate && <SortableTableCell id="orderDate" label="Data zamówienia" />}
                  {visibleColumns.expectedDeliveryDate && <SortableTableCell id="expectedDeliveryDate" label="Planowana dostawa" />}
                  {visibleColumns.value && <SortableTableCell id="value" label="Wartość" />}
                  {visibleColumns.status && <SortableTableCell id="status" label="Status" />}
                  {visibleColumns.actions && <SortableTableCell id="actions" label="Akcje" disableSorting={true} />}
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredPOs.map((po) => (
                  <TableRow key={po.id}>
                    {visibleColumns.number && (
                      <TableCell>
                        {po.number}
                        {po.invoiceLink && (
                          <Tooltip title="Faktura załączona">
                            <DescriptionIcon 
                              fontSize="small" 
                              color="primary" 
                              sx={{ ml: 1, verticalAlign: 'middle' }} 
                            />
                          </Tooltip>
                        )}
                      </TableCell>
                    )}
                    {visibleColumns.supplier && <TableCell>{po.supplier?.name}</TableCell>}
                    {visibleColumns.orderDate && <TableCell>{po.orderDate ? new Date(po.orderDate).toLocaleDateString('pl-PL') : '-'}</TableCell>}
                    {visibleColumns.expectedDeliveryDate && <TableCell>{po.expectedDeliveryDate ? new Date(po.expectedDeliveryDate).toLocaleDateString('pl-PL') : '-'}</TableCell>}
                    {visibleColumns.value && (
                      <TableCell>
                        {(() => {
                          // Najpierw sprawdź, czy zamówienie ma już obliczoną wartość brutto
                          if (po.totalGross !== undefined && po.totalGross !== null) {
                            return `${parseFloat(po.totalGross).toFixed(2)} ${po.currency || 'PLN'}`;
                          }
                          
                          // Jeśli nie, używaj wartości produktów + dodatkowe koszty
                          const productsValue = po.calculatedProductsValue || po.totalValue || 0;
                          let additionalCostsValue = 0;
                          
                          if (po.calculatedAdditionalCosts !== undefined) {
                            additionalCostsValue = parseFloat(po.calculatedAdditionalCosts);
                          } else if (po.additionalCostsItems && Array.isArray(po.additionalCostsItems)) {
                            additionalCostsValue = po.additionalCostsItems.reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0);
                          } else if (po.additionalCosts) {
                            additionalCostsValue = parseFloat(po.additionalCosts) || 0;
                          }
                          
                          const vatValue = (parseFloat(productsValue) * (parseFloat(po.vatRate) || 0)) / 100;
                          const totalGross = parseFloat(productsValue) + vatValue + additionalCostsValue;
                          
                          return `${totalGross.toFixed(2)} ${po.currency || 'PLN'}`;
                        })()}
                      </TableCell>
                    )}
                    {visibleColumns.status && (
                      <TableCell onClick={() => handleStatusClick(po)} style={{ cursor: 'pointer' }}>
                        {getStatusChip(po.status)}
                      </TableCell>
                    )}
                    {visibleColumns.actions && (
                      <TableCell>
                        <Tooltip title="Zobacz szczegóły">
                          <IconButton
                            component={Link}
                            to={`/purchase-orders/${po.id}`}
                            color="primary"
                          >
                            <ViewIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Edytuj">
                          <IconButton
                            component={Link}
                            to={`/purchase-orders/${po.id}/edit`}
                            color="secondary"
                            disabled={po.status !== PURCHASE_ORDER_STATUSES.DRAFT}
                          >
                            <EditIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Usuń">
                          <IconButton
                            color="error"
                            onClick={() => handleDeleteClick(po)}
                            disabled={po.status !== PURCHASE_ORDER_STATUSES.DRAFT}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
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
                        Wyświetlanie {(page - 1) * limit + 1}-{Math.min(page * limit, totalItems)} z {totalItems}
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </TableContainer>
        </Paper>
      )}
      
      {/* Menu konfiguracji kolumn */}
      <Menu
        anchorEl={columnMenuAnchor}
        open={Boolean(columnMenuAnchor)}
        onClose={handleColumnMenuClose}
      >
        <MenuItem onClick={() => toggleColumnVisibility('number')}>
          <Checkbox checked={visibleColumns.number} />
          <ListItemText primary="Numer" />
        </MenuItem>
        <MenuItem onClick={() => toggleColumnVisibility('supplier')}>
          <Checkbox checked={visibleColumns.supplier} />
          <ListItemText primary="Dostawca" />
        </MenuItem>
        <MenuItem onClick={() => toggleColumnVisibility('orderDate')}>
          <Checkbox checked={visibleColumns.orderDate} />
          <ListItemText primary="Data zamówienia" />
        </MenuItem>
        <MenuItem onClick={() => toggleColumnVisibility('expectedDeliveryDate')}>
          <Checkbox checked={visibleColumns.expectedDeliveryDate} />
          <ListItemText primary="Planowana dostawa" />
        </MenuItem>
        <MenuItem onClick={() => toggleColumnVisibility('value')}>
          <Checkbox checked={visibleColumns.value} />
          <ListItemText primary="Wartość" />
        </MenuItem>
        <MenuItem onClick={() => toggleColumnVisibility('status')}>
          <Checkbox checked={visibleColumns.status} />
          <ListItemText primary="Status" />
        </MenuItem>
        <MenuItem onClick={() => toggleColumnVisibility('actions')}>
          <Checkbox checked={visibleColumns.actions} />
          <ListItemText primary="Akcje" />
        </MenuItem>
      </Menu>
      
      {/* Dialog potwierdzenia usunięcia */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>Potwierdź usunięcie</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Czy na pewno chcesz usunąć zamówienie zakupu {poToDelete?.number}? Tej operacji nie można cofnąć.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Anuluj</Button>
          <Button onClick={handleDeleteConfirm} color="error">Usuń</Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog zmiany statusu */}
      <Dialog
        open={statusDialogOpen}
        onClose={() => setStatusDialogOpen(false)}
      >
        <DialogTitle>Zmień status zamówienia</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Wybierz nowy status dla zamówienia {poToUpdateStatus?.number}:
          </DialogContentText>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              label="Status"
            >
              <MenuItem value="draft">Projekt</MenuItem>
              <MenuItem value="pending">Oczekujące</MenuItem>
              <MenuItem value="approved">Zatwierdzone</MenuItem>
              <MenuItem value="ordered">Zamówione</MenuItem>
              <MenuItem value="partial">Częściowo dostarczone</MenuItem>
              <MenuItem value="shipped">Wysłane</MenuItem>
              <MenuItem value="delivered">Dostarczone</MenuItem>
              <MenuItem value="cancelled">Anulowane</MenuItem>
              <MenuItem value="completed">Zakończone</MenuItem>
              <MenuItem value="confirmed">Potwierdzone</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatusDialogOpen(false)}>Anuluj</Button>
          <Button onClick={handleStatusUpdate} color="primary">Zapisz</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default PurchaseOrderList; 