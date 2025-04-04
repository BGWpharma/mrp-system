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
  Grid,
  Menu,
  ListItemIcon,
  ListItemText,
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
  Warehouse as WarehouseIcon,
  QrCode as QrCodeIcon,
  MoreVert as MoreVertIcon,
  DeleteForever as DeleteForeverIcon,
} from '@mui/icons-material';
import { getAllInventoryItems, deleteInventoryItem, getExpiringBatches, getExpiredBatches, getItemTransactions, getAllWarehouses, createWarehouse, updateWarehouse, deleteWarehouse, getItemBatches, updateReservation, updateReservationTasks, cleanupDeletedTaskReservations } from '../../services/inventoryService';
import { useNotification } from '../../hooks/useNotification';
import { formatDate } from '../../utils/formatters';
import { toast } from 'react-hot-toast';
import { exportToCSV } from '../../utils/exportUtils';
import { useAuth } from '../../hooks/useAuth';
import LabelDialog from './LabelDialog';
import EditReservationDialog from './EditReservationDialog';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../services/firebase/config';

// Definicje stałych (takie same jak w inventoryService.js)
const INVENTORY_TRANSACTIONS_COLLECTION = 'inventoryTransactions';

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
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  const [selectedItemBatches, setSelectedItemBatches] = useState([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [editingReservation, setEditingReservation] = useState(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    quantity: '',
    batchId: ''
  });
  const [updatingTasks, setUpdatingTasks] = useState(false);
  const [cleaningReservations, setCleaningReservations] = useState(false);

  // Pobierz wszystkie pozycje przy montowaniu komponentu
  useEffect(() => {
    fetchInventoryItems();
    fetchExpiryData();
    
    // Dodaj nasłuchiwanie na zdarzenie aktualizacji stanów
    const handleInventoryUpdate = () => {
      console.log('Wykryto aktualizację stanów, odświeżam dane...');
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

  // Dodaj nowy useEffect do pobrania lokalizacji
  useEffect(() => {
    fetchWarehouses();
  }, []);

  // Przeniesiona funkcja fetchWarehouses
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

  // Zmodyfikuj funkcję fetchInventoryItems, aby uwzględniała filtrowanie po lokalizacji
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
      showError('Błąd podczas pobierania pozycji ze stanów');
    } finally {
      setLoading(false);
    }
  };
  
  // Dodaj funkcję obsługującą zmianę wybranego stanów
  const handleWarehouseChange = (event) => {
    setSelectedWarehouse(event.target.value);
  };
  
  // Efekt, który ponownie pobiera dane po zmianie stanów
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
    if (window.confirm('Czy na pewno chcesz usunąć tę pozycję ze stanów?')) {
      try {
        await deleteInventoryItem(id);
        fetchInventoryItems();
        showSuccess('Pozycja została usunięta');
      } catch (error) {
        showError('Błąd podczas usuwania pozycji: ' + error.message);
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
      let bookingTransactions = transactions.filter(
        transaction => transaction.type === 'booking'
      );
      
      // Lista zadań do sprawdzenia
      const taskIds = bookingTransactions
        .filter(transaction => transaction.referenceId)
        .map(transaction => transaction.referenceId);
      
      // Unikalny zestaw ID zadań do sprawdzenia
      const uniqueTaskIds = [...new Set(taskIds)];
      
      // Sprawdź, które zadania istnieją
      const existingTasksMap = {};
      for (const taskId of uniqueTaskIds) {
        try {
          const taskRef = doc(db, 'productionTasks', taskId);
          const taskDoc = await getDoc(taskRef);
          existingTasksMap[taskId] = taskDoc.exists();
        } catch (error) {
          console.error(`Błąd podczas sprawdzania zadania ${taskId}:`, error);
          existingTasksMap[taskId] = false;
        }
      }
      
      // Filtruj rezerwacje - usuń te, których zadania nie istnieją
      bookingTransactions = bookingTransactions.filter(transaction => {
        if (!transaction.referenceId) return true; // Zachowaj rezerwacje bez zadania
        return existingTasksMap[transaction.referenceId] !== false; // Zachowaj tylko te z istniejącymi zadaniami
      });
      
      // Sprawdź, czy są rezerwacje bez numerów MO
      const reservationsWithoutTasks = bookingTransactions.filter(
        transaction => !transaction.taskNumber && transaction.referenceId && existingTasksMap[transaction.referenceId]
      );
      
      // Jeśli są rezerwacje bez numerów MO, próbuj je uzupełnić automatycznie
      if (reservationsWithoutTasks.length > 0) {
        console.log(`Znaleziono ${reservationsWithoutTasks.length} rezerwacji bez numerów MO. Próbuję zaktualizować...`);
        
        // Aktualizuj rezerwacje bez numerów MO
        for (const reservation of reservationsWithoutTasks) {
          try {
            const taskRef = doc(db, 'productionTasks', reservation.referenceId);
            const taskDoc = await getDoc(taskRef);
            
            if (taskDoc.exists()) {
              const taskData = taskDoc.data();
              const taskName = taskData.name || '';
              // Sprawdź zarówno pole moNumber jak i number (moNumber jest nowszym polem)
              const taskNumber = taskData.moNumber || taskData.number || '';
              const clientName = taskData.clientName || '';
              const clientId = taskData.clientId || '';
              
              // Sprawdź, czy zadanie ma numer MO
              if (taskNumber) {
                // Zaktualizuj rezerwację
                const transactionRef = doc(db, INVENTORY_TRANSACTIONS_COLLECTION, reservation.id);
                await updateDoc(transactionRef, {
                  taskName,
                  taskNumber,
                  clientName,
                  clientId,
                  updatedAt: serverTimestamp()
                });
                
                // Zaktualizuj lokalnie
                reservation.taskName = taskName;
                reservation.taskNumber = taskNumber;
                reservation.clientName = clientName;
                reservation.clientId = clientId;
                
                console.log(`Automatycznie zaktualizowano rezerwację ${reservation.id} - przypisano MO: ${taskNumber}`);
              }
            }
          } catch (error) {
            console.error(`Błąd podczas aktualizacji rezerwacji ${reservation.id}:`, error);
          }
        }
      }
      
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
  
  // Zarządzanie lokalizacjami - nowe funkcje
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
    if (!warehouseFormData.name) {
      showError('Nazwa lokalizacji jest wymagana');
      return;
    }
    
    setSavingWarehouse(true);
    
    try {
      if (dialogMode === 'add') {
        await createWarehouse(warehouseFormData, currentUser.uid);
        showSuccess('Lokalizacja została utworzona');
      } else {
        await updateWarehouse(selectedWarehouse.id, warehouseFormData, currentUser.uid);
        showSuccess('Lokalizacja została zaktualizowana');
      }
      
      handleCloseWarehouseDialog();
      fetchWarehouses();
    } catch (error) {
      showError('Błąd podczas zapisywania lokalizacji: ' + error.message);
      console.error('Error saving warehouse:', error);
    } finally {
      setSavingWarehouse(false);
    }
  };

  const handleDeleteWarehouse = async (warehouseId) => {
    if (!window.confirm('Czy na pewno chcesz usunąć tę lokalizację? Ta operacja jest nieodwracalna.')) {
      return;
    }
    
    try {
      await deleteWarehouse(warehouseId);
      fetchWarehouses();
      showSuccess('Lokalizacja została usunięta');
    } catch (error) {
      showError('Błąd podczas usuwania lokalizacji: ' + error.message);
    }
  };

  // Funkcja otwierająca dialog etykiet
  const handleOpenLabelDialog = async (item) => {
    setSelectedItem(item);
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

  // Funkcja zamykająca dialog etykiet
  const handleCloseLabelDialog = () => {
    setLabelDialogOpen(false);
    // Opóźnij czyszczenie danych, aby uniknąć migotania UI
    setTimeout(() => {
      setSelectedItem(null);
      setSelectedItemBatches([]);
    }, 300);
  };

  const handleMenuOpen = (event, item) => {
    setAnchorEl(event.currentTarget);
    setSelectedItem(item);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedItem(null);
  };

  // Funkcja do otwierania dialogu edycji rezerwacji
  const handleEditReservation = async (reservation) => {
    setEditingReservation(reservation);
    setEditDialogOpen(true);
    
    try {
      setLoadingBatches(true);
      const batches = await getItemBatches(selectedItem.id);
      setSelectedItemBatches(batches);
      
      setEditForm({
        quantity: reservation.quantity,
        batchId: reservation.batchId || ''
      });
    } catch (error) {
      console.error('Błąd podczas pobierania partii:', error);
      showError('Nie udało się pobrać listy partii');
    } finally {
      setLoadingBatches(false);
    }
  };

  // Funkcja do zapisywania zmian w rezerwacji
  const handleSaveReservation = async () => {
    try {
      await updateReservation(
        editingReservation.id,
        selectedItem.id,
        Number(editForm.quantity),
        editForm.batchId,
        currentUser.uid
      );
      
      showSuccess('Rezerwacja została zaktualizowana');
      setEditDialogOpen(false);
      // Odśwież dane
      await fetchReservations(selectedItem);
    } catch (error) {
      console.error('Błąd podczas aktualizacji rezerwacji:', error);
      showError(error.message);
    }
  };

  // Funkcja do aktualizacji informacji o zadaniach w rezerwacjach
  const handleUpdateReservationTasks = async () => {
    if (!window.confirm('Czy na pewno chcesz zaktualizować dane zadań we wszystkich rezerwacjach? To może zająć dłuższą chwilę.')) {
      return;
    }
    
    setUpdatingTasks(true);
    try {
      const result = await updateReservationTasks();
      
      showSuccess(`Zaktualizowano ${result.updated.length} rezerwacji. ${result.notUpdated.length} rezerwacji nie ma przypisanych zadań.`);
      
      // Odśwież dane po aktualizacji
      if (selectedItem) {
        await fetchReservations(selectedItem);
      }
    } catch (error) {
      console.error('Błąd podczas aktualizacji rezerwacji:', error);
      showError('Wystąpił błąd podczas aktualizacji rezerwacji');
    } finally {
      setUpdatingTasks(false);
    }
  };

  // Funkcja do czyszczenia rezerwacji z usuniętych zadań
  const handleCleanupDeletedTaskReservations = async () => {
    if (!window.confirm('Czy na pewno chcesz usunąć wszystkie rezerwacje dla usuniętych zadań produkcyjnych? Ta operacja jest nieodwracalna.')) {
      return;
    }
    
    setCleaningReservations(true);
    try {
      const result = await cleanupDeletedTaskReservations();
      
      if (result.count > 0) {
        showSuccess(`Usunięto ${result.count} rezerwacji z usuniętych zadań produkcyjnych.`);
      } else {
        showSuccess('Nie znaleziono rezerwacji do wyczyszczenia.');
      }
      
      // Odśwież dane po aktualizacji
      if (selectedItem) {
        await fetchReservations(selectedItem);
      }
    } catch (error) {
      console.error('Błąd podczas czyszczenia rezerwacji:', error);
      showError('Wystąpił błąd podczas czyszczenia rezerwacji');
    } finally {
      setCleaningReservations(false);
    }
  };

  if (loading) {
    return <div>Ładowanie pozycji ze stanów...</div>;
  }

  return (
    <div>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">Stany</Typography>
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
        <Tab label="Stany" />
        <Tab label="Lokalizacja" />
      </Tabs>

      {/* Zawartość pierwszej zakładki - Stany */}
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
              Nie znaleziono pozycji ze stanów
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
                    <TableCell align="right">Akcje</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredItems.map((item) => {
                    // Oblicz ilość dostępną (całkowita - zarezerwowana)
                    const bookedQuantity = item.bookedQuantity || 0;
                    const availableQuantity = item.quantity - bookedQuantity;
                    
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Typography variant="body1">{item.name}</Typography>
                          <Typography variant="body2" color="textSecondary">{item.description}</Typography>
                          {(item.packingGroup || item.boxesPerPallet) && (
                            <Box sx={{ mt: 0.5 }}>
                              {item.packingGroup && (
                                <Chip
                                  size="small"
                                  label={`PG: ${item.packingGroup}`}
                                  color="default"
                                  sx={{ mr: 0.5 }}
                                />
                              )}
                              {item.boxesPerPallet && (
                                <Chip
                                  size="small"
                                  label={`${item.boxesPerPallet} kartonów/paletę`}
                                  color="info"
                                />
                              )}
                            </Box>
                          )}
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
                        <TableCell>
                          {item.location || '-'}
                        </TableCell>
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
                            onClick={(e) => handleMenuOpen(e, item)}
                            color="primary"
                            title="Więcej akcji"
                          >
                            <MoreVertIcon />
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

      {/* Zawartość drugiej zakładki - Lokalizacja */}
      {currentTab === 1 && (
        <>
          <Box sx={{ mb: 3, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              onClick={() => handleOpenWarehouseDialog('add')}
            >
              Dodaj lokalizację
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
                            Brak lokalizacji. Dodaj pierwszą lokalizację, aby rozpocząć.
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
          Rezerwacje dla {selectedItem?.name}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, mt: 1 }}>
            <Typography variant="subtitle1">
              Łączna ilość zarezerwowana: {reservations.reduce((sum, res) => sum + res.quantity, 0)} {selectedItem?.unit}
            </Typography>
            <Box sx={{ display: 'flex', gap: 2 }}>
              {reservations.filter(r => !r.taskNumber && r.referenceId).length > 0 && (
                <Typography variant="body2" sx={{ color: 'warning.main' }}>
                  Niektóre rezerwacje nie mają przypisanych numerów MO.
                </Typography>
              )}
              <Button 
                variant="outlined" 
                color="primary" 
                size="small"
                onClick={handleUpdateReservationTasks}
                disabled={updatingTasks}
                startIcon={updatingTasks ? <CircularProgress size={20} /> : <HistoryIcon />}
              >
                {updatingTasks ? 'Aktualizowanie...' : 'Aktualizuj dane zadań'}
              </Button>
              <Button 
                variant="outlined" 
                color="error" 
                size="small"
                onClick={handleCleanupDeletedTaskReservations}
                disabled={cleaningReservations}
                startIcon={cleaningReservations ? <CircularProgress size={20} /> : <DeleteForeverIcon />}
              >
                {cleaningReservations ? 'Czyszczenie...' : 'Usuń rezerwacje usuniętych MO'}
              </Button>
            </Box>
          </Box>
          
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Data</TableCell>
                  <TableCell>Użytkownik</TableCell>
                  <TableCell>Ilość</TableCell>
                  <TableCell>Partia</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Zadanie</TableCell>
                  <TableCell>Akcje</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredReservations.map((reservation) => (
                  <TableRow key={reservation.id}>
                    <TableCell>{formatDate(reservation.createdAt)}</TableCell>
                    <TableCell>{reservation.userName}</TableCell>
                    <TableCell>{reservation.quantity} {selectedItem?.unit}</TableCell>
                    <TableCell>{reservation.batchNumber || '-'}</TableCell>
                    <TableCell>
                      <Chip 
                        label={reservation.fulfilled ? 'Zrealizowana' : 'Aktywna'} 
                        color={reservation.fulfilled ? 'success' : 'primary'} 
                        size="small" 
                      />
                    </TableCell>
                    <TableCell>
                      {reservation.taskNumber ? (
                        <Link 
                          component={RouterLink} 
                          to={`/production/tasks/${reservation.taskId}`}
                          underline="hover"
                          sx={{ display: 'flex', alignItems: 'center' }}
                        >
                          <Chip 
                            label={`MO: ${reservation.taskNumber}`}
                            color="secondary"
                            size="small" 
                            variant="outlined"
                            sx={{ mr: 1 }}
                          />
                          {reservation.taskName && (
                            <Tooltip title={reservation.taskName}>
                              <Box component="span" sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                                {reservation.taskName.substring(0, 15)}
                                {reservation.taskName.length > 15 ? '...' : ''}
                              </Box>
                            </Tooltip>
                          )}
                        </Link>
                      ) : (
                        'Brak zadania'
                      )}
                    </TableCell>
                    <TableCell>
                      {!reservation.fulfilled && (
                        <IconButton
                          size="small"
                          onClick={() => handleEditReservation(reservation)}
                          title="Edytuj rezerwację"
                        >
                          <EditIcon />
                        </IconButton>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseReservationDialog}>Zamknij</Button>
        </DialogActions>
      </Dialog>

      <EditReservationDialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        onSave={handleSaveReservation}
        editForm={editForm}
        setEditForm={setEditForm}
        selectedItem={selectedItem}
        selectedItemBatches={selectedItemBatches}
        loadingBatches={loadingBatches}
      />

      {/* Dialog do dodawania/edycji lokalizacji */}
      <Dialog open={openWarehouseDialog} onClose={handleCloseWarehouseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {dialogMode === 'add' ? 'Dodaj nową lokalizację' : 'Edytuj lokalizację'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                name="name"
                label="Nazwa lokalizacji"
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

      {/* Dialog z etykietami */}
      <LabelDialog
        open={labelDialogOpen}
        onClose={handleCloseLabelDialog}
        item={selectedItem}
        batches={selectedItemBatches}
      />

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem 
          component={RouterLink} 
          to={selectedItem ? `/inventory/${selectedItem.id}/history` : '#'}
          onClick={handleMenuClose}
        >
          <ListItemIcon>
            <HistoryIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Historia</ListItemText>
        </MenuItem>
        <MenuItem 
          component={RouterLink} 
          to={selectedItem ? `/inventory/${selectedItem.id}/batches` : '#'}
          onClick={handleMenuClose}
        >
          <ListItemIcon>
            <ViewListIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Partie</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => {
          if (selectedItem) handleOpenLabelDialog(selectedItem);
          handleMenuClose();
        }}>
          <ListItemIcon>
            <QrCodeIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Drukuj etykietę</ListItemText>
        </MenuItem>
        <MenuItem 
          component={RouterLink} 
          to={selectedItem ? `/inventory/${selectedItem.id}/edit` : '#'}
          onClick={handleMenuClose}
        >
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Edytuj</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => {
          if (selectedItem) handleDelete(selectedItem.id);
          handleMenuClose();
        }}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText sx={{ color: 'error.main' }}>Usuń</ListItemText>
        </MenuItem>
      </Menu>
    </div>
  );
};

export default InventoryList;