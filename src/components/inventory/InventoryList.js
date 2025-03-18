// src/components/inventory/InventoryList.js
import React, { useState, useEffect } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow, 
  Paper, 
  Button, 
  TextField, 
  IconButton,
  Typography,
  Box,
  Chip,
  Tooltip,
  Badge,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TableSortLabel,
  Link,
  Tab,
  Tabs,
  Grid
} from '@mui/material';
import { 
  Add as AddIcon, 
  Search as SearchIcon, 
  Edit as EditIcon,
  Delete as DeleteIcon,
  ArrowUpward as ReceiveIcon,
  ArrowDownward as IssueIcon,
  History as HistoryIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  ViewList as ViewListIcon,
  BookmarkAdded as ReservationIcon,
  GetApp as GetAppIcon,
  Warehouse as WarehouseIcon
} from '@mui/icons-material';
import { getAllInventoryItems, deleteInventoryItem, getExpiringBatches, getExpiredBatches, getItemTransactions, getAllWarehouses, createWarehouse, updateWarehouse, deleteWarehouse } from '../../services/inventoryService';
import { useNotification } from '../../hooks/useNotification';
import { formatDate } from '../../utils/formatters';
import { toast } from 'react-hot-toast';
import { exportToCSV } from '../../utils/exportUtils';
import { useAuth } from '../../hooks/useAuth';

const InventoryList = () => {
  const [inventoryItems, setInventoryItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [expiringCount, setExpiringCount] = useState(0);
  const [expiredCount, setExpiredCount] = useState(0);
  const { showSuccess, showError } = useNotification();
  const [selectedItem, setSelectedItem] = useState(null);
  const [reservationDialogOpen, setReservationDialogOpen] = useState(false);
  const [reservations, setReservations] = useState([]);
  const [filteredReservations, setFilteredReservations] = useState([]);
  const [reservationFilter, setReservationFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('desc');
  const [sortField, setSortField] = useState('createdAt');
  const [warehouses, setWarehouses] = useState([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [warehousesLoading, setWarehousesLoading] = useState(true);
  const [currentTab, setCurrentTab] = useState(0);
  const [openWarehouseDialog, setOpenWarehouseDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState('add');
  const [warehouseFormData, setWarehouseFormData] = useState({
    name: '',
    address: '',
    description: ''
  });
  const [savingWarehouse, setSavingWarehouse] = useState(false);
  const { currentUser } = useAuth();

  // Pobierz wszystkie pozycje przy montowaniu komponentu
  useEffect(() => {
    fetchInventoryItems();
    fetchExpiryData();
    
    // Dodaj nasłuchiwanie na zdarzenie aktualizacji magazynu
    const handleInventoryUpdate = () => {
      console.log('Wykryto aktualizację magazynu, odświeżam dane...');
      fetchInventoryItems();
    };
    
    window.addEventListener('inventory-updated', handleInventoryUpdate);
    
    // Usuń nasłuchiwanie przy odmontowaniu komponentu
    return () => {
      window.removeEventListener('inventory-updated', handleInventoryUpdate);
    };
  }, []);

  // Filtruj pozycje przy zmianie searchTerm lub inventoryItems
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredItems(inventoryItems);
    } else {
      const filtered = inventoryItems.filter(item => 
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.category?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredItems(filtered);
    }
  }, [searchTerm, inventoryItems]);

  // Dodaj nowy useEffect do pobrania magazynów
  useEffect(() => {
    fetchWarehouses();
  }, []);

  // Przeniesiona funkcja fetchWarehouses
  const fetchWarehouses = async () => {
    try {
      const warehousesList = await getAllWarehouses();
      setWarehouses(warehousesList);
    } catch (error) {
      console.error('Błąd podczas pobierania magazynów:', error);
      showError('Błąd podczas pobierania magazynów');
    } finally {
      setWarehousesLoading(false);
    }
  };

  // Zmodyfikuj funkcję fetchInventoryItems, aby uwzględniała filtrowanie po magazynie
  const fetchInventoryItems = async () => {
    setLoading(true);
    try {
      const items = await getAllInventoryItems(selectedWarehouse || null);
      setInventoryItems(items);
      setFilteredItems(items);
      
      // Pobierz informacje o rezerwacjach dla każdego przedmiotu
      const reservationPromises = items.map(item => fetchReservations(item));
      await Promise.all(reservationPromises);
      
    } catch (error) {
      console.error('Error fetching inventory items:', error);
      showError('Błąd podczas pobierania pozycji magazynowych');
    } finally {
      setLoading(false);
    }
  };
  
  // Dodaj funkcję obsługującą zmianę wybranego magazynu
  const handleWarehouseChange = (event) => {
    setSelectedWarehouse(event.target.value);
  };
  
  // Efekt, który ponownie pobiera dane po zmianie magazynu
  useEffect(() => {
    fetchInventoryItems();
  }, [selectedWarehouse]);

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

  const handleDelete = async (id) => {
    if (window.confirm('Czy na pewno chcesz usunąć tę pozycję magazynową?')) {
      try {
        await deleteInventoryItem(id);
        showSuccess('Pozycja została usunięta');
        // Odśwież listę pozycji
        fetchInventoryItems();
      } catch (error) {
        showError('Błąd podczas usuwania pozycji: ' + error.message);
        console.error('Error deleting inventory item:', error);
      }
    }
  };

  const getStockLevelIndicator = (quantity, minStock, maxStock) => {
    if (quantity <= 0) {
      return <Chip label="Brak" color="error" size="small" />;
    } else if (minStock && quantity <= minStock) {
      return <Chip label="Niski" color="warning" size="small" />;
    } else if (maxStock && quantity >= maxStock) {
      return <Chip label="Wysoki" color="info" size="small" />;
    } else {
      return <Chip label="OK" color="success" size="small" />;
    }
  };

  // Funkcja do pobierania rezerwacji dla produktu
  const fetchReservations = async (item) => {
    try {
      setLoading(true);
      // Pobierz wszystkie transakcje dla danego przedmiotu
      const transactions = await getItemTransactions(item.id);
      
      // Filtruj tylko transakcje rezerwacji (typ 'booking')
      const bookingTransactions = transactions.filter(
        transaction => transaction.type === 'booking'
      );
      
      setReservations(bookingTransactions);
      
      // Zastosuj filtrowanie i sortowanie
      filterAndSortReservations(reservationFilter, sortField, sortOrder, bookingTransactions);
      
      setLoading(false);
    } catch (error) {
      console.error('Error fetching reservations:', error);
      toast.error('Błąd podczas pobierania rezerwacji');
      setLoading(false);
    }
  };

  // Funkcja do filtrowania rezerwacji
  const handleFilterChange = (event) => {
    const filterValue = event.target.value;
    setReservationFilter(filterValue);
    
    filterAndSortReservations(filterValue, sortField, sortOrder);
  };

  // Funkcja do sortowania rezerwacji
  const handleSort = (field) => {
    const newSortOrder = field === sortField && sortOrder === 'asc' ? 'desc' : 'asc';
    setSortOrder(newSortOrder);
    setSortField(field);
    
    filterAndSortReservations(reservationFilter, field, newSortOrder);
  };

  // Funkcja do filtrowania i sortowania rezerwacji
  const filterAndSortReservations = (filterValue, field, order, data = reservations) => {
    let filtered = [...data];
    
    // Filtrowanie
    if (filterValue === 'active') {
      filtered = filtered.filter(reservation => !reservation.fulfilled);
    } else if (filterValue === 'fulfilled') {
      filtered = filtered.filter(reservation => reservation.fulfilled);
    }
    
    // Sortowanie
    filtered.sort((a, b) => {
      let valueA, valueB;
      
      // Pobierz wartości do porównania w zależności od pola
      if (field === 'createdAt') {
        valueA = new Date(a.createdAt).getTime();
        valueB = new Date(b.createdAt).getTime();
      } else if (field === 'quantity') {
        valueA = a.quantity;
        valueB = b.quantity;
      } else {
        valueA = a[field] || '';
        valueB = b[field] || '';
      }
      
      // Porównaj wartości
      if (typeof valueA === 'string' && typeof valueB === 'string') {
        return order === 'asc' 
          ? valueA.localeCompare(valueB) 
          : valueB.localeCompare(valueA);
      } else {
        return order === 'asc' ? valueA - valueB : valueB - valueA;
      }
    });
    
    setFilteredReservations(filtered);
  };

  // Funkcja do otwierania dialogu z rezerwacjami
  const handleShowReservations = async (item) => {
    setSelectedItem(item);
    await fetchReservations(item);
    setReservationDialogOpen(true);
  };

  // Funkcja do zamykania dialogu z rezerwacjami
  const handleCloseReservationDialog = () => {
    setReservationDialogOpen(false);
    setSelectedItem(null);
    setReservations([]);
    setFilteredReservations([]);
    setReservationFilter('all');
    setSortField('createdAt');
    setSortOrder('desc');
  };

  // Funkcja do eksportu rezerwacji do CSV
  const handleExportReservations = () => {
    try {
      // Przygotuj dane do eksportu
      const dataToExport = filteredReservations.map(reservation => ({
        'Data': formatDate(reservation.createdAt),
        'Typ': reservation.type === 'booking' ? 'Rezerwacja' : 'Anulowanie',
        'Ilość': reservation.quantity,
        'Jednostka': selectedItem?.unit || '',
        'Zadanie': reservation.taskName || reservation.taskId || '',
        'Klient': reservation.clientName || '',
        'Status': reservation.fulfilled ? 'Zrealizowana' : 'Aktywna',
        'Notatki': reservation.notes || ''
      }));
      
      // Nazwa pliku
      const fileName = `rezerwacje_${selectedItem?.name.replace(/\s+/g, '_')}_${formatDate(new Date())}.csv`;
      
      // Eksportuj do CSV
      exportToCSV(dataToExport, fileName);
      
      toast.success('Eksport rezerwacji zakończony sukcesem');
    } catch (error) {
      console.error('Error exporting reservations:', error);
      toast.error('Błąd podczas eksportu rezerwacji');
    }
  };

  // Obsługa przełączania zakładek
  const handleTabChange = (event, newValue) => {
    setCurrentTab(newValue);
  };
  
  // Zarządzanie magazynami - nowe funkcje
  const handleOpenWarehouseDialog = (mode, warehouse = null) => {
    setDialogMode(mode);
    setSelectedWarehouse(warehouse);
    
    if (mode === 'edit' && warehouse) {
      setWarehouseFormData({
        name: warehouse.name || '',
        address: warehouse.address || '',
        description: warehouse.description || ''
      });
    } else {
      setWarehouseFormData({
        name: '',
        address: '',
        description: ''
      });
    }
    
    setOpenWarehouseDialog(true);
  };

  const handleCloseWarehouseDialog = () => {
    setOpenWarehouseDialog(false);
    setSelectedWarehouse(null);
  };

  const handleWarehouseFormChange = (e) => {
    const { name, value } = e.target;
    setWarehouseFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmitWarehouse = async () => {
    if (!warehouseFormData.name.trim()) {
      showError('Nazwa magazynu jest wymagana');
      return;
    }
    
    setSavingWarehouse(true);
    
    try {
      if (dialogMode === 'add') {
        await createWarehouse(warehouseFormData, currentUser.uid);
        showSuccess('Magazyn został utworzony');
      } else {
        await updateWarehouse(selectedWarehouse.id, warehouseFormData, currentUser.uid);
        showSuccess('Magazyn został zaktualizowany');
      }
      
      handleCloseWarehouseDialog();
      fetchWarehouses();
    } catch (error) {
      showError('Błąd podczas zapisywania magazynu: ' + error.message);
      console.error('Error saving warehouse:', error);
    } finally {
      setSavingWarehouse(false);
    }
  };

  const handleDeleteWarehouse = async (warehouseId) => {
    if (!window.confirm('Czy na pewno chcesz usunąć ten magazyn? Ta operacja jest nieodwracalna.')) {
      return;
    }
    
    try {
      await deleteWarehouse(warehouseId);
      showSuccess('Magazyn został usunięty');
      fetchWarehouses();
    } catch (error) {
      showError('Błąd podczas usuwania magazynu: ' + error.message);
      console.error('Error deleting warehouse:', error);
    }
  };

  if (loading) {
    return <div>Ładowanie pozycji magazynowych...</div>;
  }

  return (
    <div>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">Magazyn</Typography>
        <Box>
          <Tooltip title="Sprawdź daty ważności produktów">
            <Button 
              variant="outlined" 
              color="warning" 
              component={RouterLink} 
              to="/inventory/expiry-dates"
              startIcon={
                <Badge badgeContent={expiringCount + expiredCount} color="error" max={99}>
                  <WarningIcon />
                </Badge>
              }
              sx={{ mr: 2 }}
            >
              Daty ważności
            </Button>
          </Tooltip>
          <Button 
            variant="contained" 
            color="primary" 
            component={RouterLink} 
            to="/inventory/new"
            startIcon={<AddIcon />}
          >
            Nowa pozycja
          </Button>
        </Box>
      </Box>

      {/* Dodaj zakładki */}
      <Tabs
        value={currentTab}
        onChange={handleTabChange}
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}
      >
        <Tab label="Magazyn" />
        <Tab label="Magazyny" />
      </Tabs>

      {/* Zawartość pierwszej zakładki - Magazyn */}
      {currentTab === 0 && (
        <>
          <Box sx={{ display: 'flex', mb: 3 }}>
            <TextField
              label="Szukaj pozycji"
              variant="outlined"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              fullWidth
              InputProps={{
                startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} />,
              }}
            />
          </Box>

          {filteredItems.length === 0 ? (
            <Typography variant="body1" align="center">
              Nie znaleziono pozycji magazynowych
            </Typography>
          ) : (
            <TableContainer component={Paper} sx={{ mt: 3 }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Nazwa</TableCell>
                    <TableCell>Kategoria</TableCell>
                    <TableCell>Ilość całkowita</TableCell>
                    <TableCell>Ilość zarezerwowana</TableCell>
                    <TableCell>Ilość dostępna</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Lokalizacja</TableCell>
                    <TableCell>Magazyn</TableCell>
                    <TableCell>Akcje</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredItems.map((item) => {
                    // Oblicz ilość dostępną (całkowita - zarezerwowana)
                    const bookedQuantity = item.bookedQuantity || 0;
                    const availableQuantity = item.quantity - bookedQuantity;
                    
                    // Znajdź nazwę magazynu
                    const warehouse = warehouses.find(w => w.id === item.warehouseId);
                    const warehouseName = warehouse ? warehouse.name : 'Nieznany';
                    
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Typography variant="body1">{item.name}</Typography>
                          <Typography variant="body2" color="textSecondary">{item.description}</Typography>
                        </TableCell>
                        <TableCell>{item.category}</TableCell>
                        <TableCell>
                          <Typography variant="body1">{item.quantity} {item.unit}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography 
                            variant="body1" 
                            color={bookedQuantity > 0 ? "secondary" : "textSecondary"}
                            sx={{ cursor: bookedQuantity > 0 ? 'pointer' : 'default' }}
                            onClick={bookedQuantity > 0 ? () => handleShowReservations(item) : undefined}
                          >
                            {bookedQuantity} {item.unit}
                            {bookedQuantity > 0 && (
                              <Tooltip title="Kliknij, aby zobaczyć szczegóły rezerwacji">
                                <ReservationIcon fontSize="small" sx={{ ml: 1 }} />
                              </Tooltip>
                            )}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography 
                            variant="body1" 
                            color={availableQuantity < item.minStockLevel ? "error" : "primary"}
                          >
                            {availableQuantity} {item.unit}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {getStockLevelIndicator(availableQuantity, item.minStockLevel, item.optimalStockLevel)}
                        </TableCell>
                        <TableCell>{item.location}</TableCell>
                        <TableCell>{warehouseName}</TableCell>
                        <TableCell align="right">
                          <IconButton 
                            component={RouterLink} 
                            to={`/inventory/${item.id}`}
                            color="secondary"
                            title="Szczegóły"
                          >
                            <InfoIcon />
                          </IconButton>
                          <IconButton 
                            component={RouterLink} 
                            to={`/inventory/${item.id}/receive`}
                            color="success"
                            title="Przyjmij"
                          >
                            <ReceiveIcon />
                          </IconButton>
                          <IconButton 
                            component={RouterLink} 
                            to={`/inventory/${item.id}/issue`}
                            color="warning"
                            title="Wydaj"
                          >
                            <IssueIcon />
                          </IconButton>
                          <IconButton 
                            component={RouterLink} 
                            to={`/inventory/${item.id}/history`}
                            color="info"
                            title="Historia"
                          >
                            <HistoryIcon />
                          </IconButton>
                          <IconButton 
                            component={RouterLink} 
                            to={`/inventory/${item.id}/batches`}
                            color="primary"
                            title="Partie"
                          >
                            <ViewListIcon />
                          </IconButton>
                          <IconButton 
                            component={RouterLink} 
                            to={`/inventory/${item.id}/edit`}
                            color="default"
                            title="Edytuj"
                          >
                            <EditIcon />
                          </IconButton>
                          <IconButton 
                            onClick={() => handleDelete(item.id)} 
                            color="error"
                            title="Usuń"
                          >
                            <DeleteIcon />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}

      {/* Zawartość drugiej zakładki - Magazyny */}
      {currentTab === 1 && (
        <>
          <Box sx={{ mb: 3, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              onClick={() => handleOpenWarehouseDialog('add')}
            >
              Dodaj magazyn
            </Button>
          </Box>

          <Paper sx={{ width: '100%', overflow: 'hidden' }}>
            <TableContainer sx={{ maxHeight: 440 }}>
              {warehousesLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                  <CircularProgress />
                </Box>
              ) : (
                <Table stickyHeader aria-label="sticky table">
                  <TableHead>
                    <TableRow>
                      <TableCell>Nazwa</TableCell>
                      <TableCell>Adres</TableCell>
                      <TableCell>Opis</TableCell>
                      <TableCell align="right">Akcje</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {warehouses.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} align="center">
                          <Typography variant="body1" sx={{ py: 2 }}>
                            Brak magazynów. Dodaj pierwszy magazyn, aby rozpocząć.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      warehouses.map((warehouse) => (
                        <TableRow key={warehouse.id} hover>
                          <TableCell>{warehouse.name}</TableCell>
                          <TableCell>{warehouse.address}</TableCell>
                          <TableCell>{warehouse.description}</TableCell>
                          <TableCell align="right">
                            <IconButton
                              color="primary"
                              onClick={() => handleOpenWarehouseDialog('edit', warehouse)}
                            >
                              <EditIcon />
                            </IconButton>
                            <IconButton
                              color="error"
                              onClick={() => handleDeleteWarehouse(warehouse.id)}
                            >
                              <DeleteIcon />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </TableContainer>
          </Paper>
        </>
      )}

      {/* Dialog z rezerwacjami */}
      <Dialog
        open={reservationDialogOpen}
        onClose={handleCloseReservationDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Rezerwacje dla: {selectedItem?.name}
        </DialogTitle>
        <DialogContent>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, mt: 1 }}>
                <Typography variant="subtitle1">
                  Łączna ilość zarezerwowana: {reservations.reduce((sum, res) => sum + res.quantity, 0)} {selectedItem?.unit}
                </Typography>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <FormControl variant="outlined" size="small">
                    <InputLabel id="reservation-filter-label">Filtr</InputLabel>
                    <Select
                      labelId="reservation-filter-label"
                      value={reservationFilter}
                      onChange={handleFilterChange}
                      label="Filtr"
                    >
                      <MenuItem value="all">Wszystkie</MenuItem>
                      <MenuItem value="active">Aktywne</MenuItem>
                      <MenuItem value="fulfilled">Zrealizowane</MenuItem>
                    </Select>
                  </FormControl>
                  <Button 
                    variant="outlined" 
                    size="small" 
                    startIcon={<GetAppIcon />}
                    onClick={handleExportReservations}
                    disabled={filteredReservations.length === 0}
                  >
                    Eksportuj
                  </Button>
                </Box>
              </Box>
              
              {filteredReservations.length === 0 ? (
                <Typography variant="body1" sx={{ p: 2 }}>
                  Brak rezerwacji dla tego produktu.
                </Typography>
              ) : (
                <TableContainer component={Paper} sx={{ mt: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>
                          <TableSortLabel
                            active={sortField === 'createdAt'}
                            direction={sortField === 'createdAt' ? sortOrder : 'asc'}
                            onClick={() => handleSort('createdAt')}
                          >
                            Data
                          </TableSortLabel>
                        </TableCell>
                        <TableCell>Typ</TableCell>
                        <TableCell align="right">
                          <TableSortLabel
                            active={sortField === 'quantity'}
                            direction={sortField === 'quantity' ? sortOrder : 'asc'}
                            onClick={() => handleSort('quantity')}
                          >
                            Ilość
                          </TableSortLabel>
                        </TableCell>
                        <TableCell>
                          <TableSortLabel
                            active={sortField === 'taskName'}
                            direction={sortField === 'taskName' ? sortOrder : 'asc'}
                            onClick={() => handleSort('taskName')}
                          >
                            Zadanie
                          </TableSortLabel>
                        </TableCell>
                        <TableCell>
                          <TableSortLabel
                            active={sortField === 'clientName'}
                            direction={sortField === 'clientName' ? sortOrder : 'asc'}
                            onClick={() => handleSort('clientName')}
                          >
                            Klient
                          </TableSortLabel>
                        </TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Notatki</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredReservations.map((reservation) => (
                        <TableRow key={reservation.id}>
                          <TableCell>
                            {formatDate(reservation.createdAt)}
                          </TableCell>
                          <TableCell>
                            <Chip 
                              label={reservation.type === 'booking' ? 'Rezerwacja' : 'Anulowanie'} 
                              color={reservation.type === 'booking' ? 'primary' : 'error'} 
                              size="small" 
                            />
                          </TableCell>
                          <TableCell align="right">
                            {reservation.quantity} {selectedItem?.unit}
                          </TableCell>
                          <TableCell>
                            {reservation.taskId ? (
                              <Link 
                                component={RouterLink} 
                                to={`/tasks/${reservation.taskId}`}
                                underline="hover"
                              >
                                {reservation.taskName || reservation.taskId}
                              </Link>
                            ) : (
                              <Typography variant="body2" color="text.secondary">
                                Brak zadania
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell>
                            {reservation.clientName || 'Brak klienta'}
                          </TableCell>
                          <TableCell>
                            <Chip 
                              label={reservation.fulfilled ? 'Zrealizowana' : 'Aktywna'} 
                              color={reservation.fulfilled ? 'success' : 'warning'} 
                              size="small" 
                            />
                          </TableCell>
                          <TableCell>
                            {reservation.notes || '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseReservationDialog}>Zamknij</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog do dodawania/edycji magazynu */}
      <Dialog open={openWarehouseDialog} onClose={handleCloseWarehouseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {dialogMode === 'add' ? 'Dodaj nowy magazyn' : 'Edytuj magazyn'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                name="name"
                label="Nazwa magazynu"
                value={warehouseFormData.name}
                onChange={handleWarehouseFormChange}
                fullWidth
                required
                error={!warehouseFormData.name.trim()}
                helperText={!warehouseFormData.name.trim() ? 'Nazwa jest wymagana' : ''}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                name="address"
                label="Adres"
                value={warehouseFormData.address}
                onChange={handleWarehouseFormChange}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                name="description"
                label="Opis"
                value={warehouseFormData.description}
                onChange={handleWarehouseFormChange}
                fullWidth
                multiline
                rows={3}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseWarehouseDialog}>Anuluj</Button>
          <Button
            onClick={handleSubmitWarehouse}
            variant="contained"
            color="primary"
            disabled={savingWarehouse || !warehouseFormData.name.trim()}
          >
            {savingWarehouse ? 'Zapisywanie...' : 'Zapisz'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default InventoryList;