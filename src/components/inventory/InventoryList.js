// src/components/inventory/InventoryList.js
import React, { useState, useEffect, useRef } from 'react';
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
  Checkbox,
  Pagination
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
  ViewColumn as ViewColumnIcon,
} from '@mui/icons-material';
import { getAllInventoryItems, deleteInventoryItem, getExpiringBatches, getExpiredBatches, getItemTransactions, getAllWarehouses, createWarehouse, updateWarehouse, deleteWarehouse, getItemBatches, updateReservation, updateReservationTasks, cleanupDeletedTaskReservations, deleteReservation, getInventoryItemById, recalculateAllInventoryQuantities, cleanupMicroReservations } from '../../services/inventoryService';
import { useNotification } from '../../hooks/useNotification';
import { formatDate } from '../../utils/formatters';
import { toast } from 'react-hot-toast';
import { exportToCSV } from '../../utils/exportUtils';
import { useAuth } from '../../hooks/useAuth';
import LabelDialog from './LabelDialog';
import EditReservationDialog from './EditReservationDialog';
import { doc, getDoc, updateDoc, serverTimestamp, collection, getDocs, addDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { useColumnPreferences } from '../../contexts/ColumnPreferencesContext';

// Definicje stałych (takie same jak w inventoryService.js)
const INVENTORY_TRANSACTIONS_COLLECTION = 'inventoryTransactions';

const InventoryList = () => {
  const [inventoryItems, setInventoryItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchCategory, setSearchCategory] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [debouncedSearchCategory, setDebouncedSearchCategory] = useState('');
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
  const [warehouseItems, setWarehouseItems] = useState([]);
  const [selectedWarehouseForView, setSelectedWarehouseForView] = useState(null);
  const [warehouseItemsLoading, setWarehouseItemsLoading] = useState(false);
  const [groups, setGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupFormData, setGroupFormData] = useState({
    name: '',
    description: '',
    items: []
  });
  const [openGroupDialog, setOpenGroupDialog] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [groupItems, setGroupItems] = useState([]);
  const [groupDialogMode, setGroupDialogMode] = useState('add');
  const [savingGroup, setSavingGroup] = useState(false);
  
  // Zamiast lokalnego stanu, użyjmy kontekstu preferencji kolumn
  const [columnMenuAnchor, setColumnMenuAnchor] = useState(null);
  // Usuń lokalny stan visibleColumns
  // const [visibleColumns, setVisibleColumns] = useState({
  //   name: true,
  //   category: true,
  //   totalQuantity: true,
  //   reservedQuantity: true,
  //   availableQuantity: true,
  //   status: true,
  //   location: true,
  //   actions: true
  // });
  
  // Użyj kontekstu preferencji kolumn
  const { getColumnPreferencesForView, updateColumnPreferences } = useColumnPreferences();
  // Pobierz preferencje dla widoku 'inventory'
  const visibleColumns = getColumnPreferencesForView('inventory');

  // Dodaj stany dla paginacji
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Dodaj useRef dla timerów debouncing
  const searchTermTimerRef = useRef(null);
  const searchCategoryTimerRef = useRef(null);

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

  // Dodaj funkcję obsługującą zmianę wybranego stanów
  const handleWarehouseChange = (event) => {
    setSelectedWarehouse(event.target.value);
  };

  // Efekt, który ponownie pobiera dane po zmianie stanów
  useEffect(() => {
    fetchInventoryItems();
  }, [selectedWarehouse]);

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

  // Efekt, który resetuje stronę po zmianie wyszukiwania z debounce
  useEffect(() => {
    if (page !== 1) {
      setPage(1);
    } else {
      fetchInventoryItems();
    }
  }, [debouncedSearchTerm, debouncedSearchCategory]);

  // Dodaj efekt dla debounced search term
  useEffect(() => {
    if (searchTermTimerRef.current) {
      clearTimeout(searchTermTimerRef.current);
    }
    
    searchTermTimerRef.current = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 1000);

    return () => {
      if (searchTermTimerRef.current) {
        clearTimeout(searchTermTimerRef.current);
      }
    };
  }, [searchTerm]);

  // Dodaj efekt dla debounced search category
  useEffect(() => {
    if (searchCategoryTimerRef.current) {
      clearTimeout(searchCategoryTimerRef.current);
    }
    
    searchCategoryTimerRef.current = setTimeout(() => {
      setDebouncedSearchCategory(searchCategory);
    }, 1000);

    return () => {
      if (searchCategoryTimerRef.current) {
        clearTimeout(searchCategoryTimerRef.current);
      }
    };
  }, [searchCategory]);

  // Zmodyfikuj funkcję fetchInventoryItems, aby używała debounced wartości
  const fetchInventoryItems = async () => {
    setLoading(true);
    try {
      // Najpierw wyczyść mikrorezerwacje
      await cleanupMicroReservations();
      
      // Wywołaj getAllInventoryItems z parametrami paginacji i wyszukiwania
      const result = await getAllInventoryItems(
        selectedWarehouse || null, 
        page, 
        pageSize, 
        debouncedSearchTerm.trim() !== '' ? debouncedSearchTerm : null,
        debouncedSearchCategory.trim() !== '' ? debouncedSearchCategory : null
      );
      
      // Jeśli wynik to obiekt z właściwościami items i totalCount, to używamy paginacji
      if (result && result.items) {
        setInventoryItems(result.items);
        setFilteredItems(result.items);
        setTotalItems(result.totalCount);
        setTotalPages(Math.ceil(result.totalCount / pageSize));
      } else {
        // Stara logika dla kompatybilności
        setInventoryItems(result);
        setFilteredItems(result);
      }
      
    } catch (error) {
      console.error('Error fetching inventory items:', error);
      showError('Błąd podczas pobierania pozycji ze stanów');
    } finally {
      setLoading(false);
    }
  };

  // Obsługa zmiany strony
  const handlePageChange = (event, newPage) => {
    setPage(newPage);
  };

  // Obsługa zmiany rozmiaru strony
  const handlePageSizeChange = (event) => {
    setPageSize(parseInt(event.target.value, 10));
    setPage(1); // Resetuj stronę po zmianie rozmiaru strony
  };

  // Efekt, który ponownie pobiera dane po zmianie strony lub rozmiaru strony
  useEffect(() => {
    fetchInventoryItems();
  }, [page, pageSize]);

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
    if (newValue === 2) {
      // Jeśli wybrano zakładkę "Grupy", pobierz je
      fetchGroups();
    }
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

  // Funkcja do usuwania rezerwacji
  const handleDeleteReservation = async (reservationId) => {
    if (!window.confirm('Czy na pewno chcesz usunąć tę rezerwację? Ta operacja jest nieodwracalna.')) {
      return;
    }
    
    try {
      await deleteReservation(reservationId, currentUser.uid);
      showSuccess('Rezerwacja została usunięta');
      // Odśwież dane
      await fetchReservations(selectedItem);
    } catch (error) {
      console.error('Błąd podczas usuwania rezerwacji:', error);
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

  // Dodaję funkcję do pobierania grup
  const fetchGroups = async () => {
    setGroupsLoading(true);
    try {
      // Pobieramy kolekcję grup z Firestore
      const groupsCollection = collection(db, 'itemGroups');
      const groupsSnapshot = await getDocs(groupsCollection);
      const groupsList = groupsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setGroups(groupsList);
    } catch (error) {
      console.error('Błąd podczas pobierania grup:', error);
      showError('Nie udało się pobrać grup');
    } finally {
      setGroupsLoading(false);
    }
  };

  // Dodaję useEffect do pobierania grup przy montowaniu komponentu
  useEffect(() => {
    if (currentTab === 2) {
      fetchGroups();
    }
  }, [currentTab]);

  // Funkcja do pobierania pozycji z wybranego magazynu
  const fetchWarehouseItems = async (warehouseId) => {
    setWarehouseItemsLoading(true);
    try {
      const items = await getAllInventoryItems(warehouseId);
      setWarehouseItems(items);
    } catch (error) {
      console.error('Błąd podczas pobierania pozycji z magazynu:', error);
      showError('Nie udało się pobrać pozycji z magazynu');
    } finally {
      setWarehouseItemsLoading(false);
    }
  };

  // Funkcja do obsługi kliknięcia w magazyn
  const handleWarehouseClick = async (warehouse) => {
    setSelectedWarehouseForView(warehouse);
    await fetchWarehouseItems(warehouse.id);
  };

  // Funkcja do powrotu do listy magazynów
  const handleBackToWarehouses = () => {
    setSelectedWarehouseForView(null);
    setWarehouseItems([]);
  };

  // Funkcja do otwierania dialogu tworzenia/edycji grupy
  const handleOpenGroupDialog = (mode, group = null) => {
    setGroupDialogMode(mode);
    
    if (mode === 'edit' && group) {
      setSelectedGroup(group);
      setGroupFormData({
        name: group.name,
        description: group.description || '',
        items: group.items || []
      });
      
      // Pobierz pozycje należące do grupy
      const groupItemIds = group.items || [];
      const itemsInGroup = inventoryItems.filter(item => groupItemIds.includes(item.id));
      setGroupItems(itemsInGroup);
    } else {
      setSelectedGroup(null);
      setGroupFormData({
        name: '',
        description: '',
        items: []
      });
      setGroupItems([]);
    }
    
    setOpenGroupDialog(true);
  };

  // Funkcja do zamykania dialogu grupy
  const handleCloseGroupDialog = () => {
    setOpenGroupDialog(false);
    setGroupFormData({
      name: '',
      description: '',
      items: []
    });
    setGroupItems([]);
  };

  // Funkcja do zapisywania grupy
  const handleSubmitGroup = async () => {
    if (!groupFormData.name) {
      showError('Nazwa grupy jest wymagana');
      return;
    }
    
    setSavingGroup(true);
    
    try {
      const groupData = {
        ...groupFormData,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid
      };
      
      if (groupDialogMode === 'add') {
        // Dodajemy nową grupę
        const groupsCollection = collection(db, 'itemGroups');
        await addDoc(groupsCollection, {
          ...groupData,
          createdAt: serverTimestamp(),
          createdBy: currentUser.uid
        });
        showSuccess('Grupa została utworzona');
      } else {
        // Aktualizujemy istniejącą grupę
        const groupRef = doc(db, 'itemGroups', selectedGroup.id);
        await updateDoc(groupRef, groupData);
        showSuccess('Grupa została zaktualizowana');
      }
      
      handleCloseGroupDialog();
      fetchGroups();
    } catch (error) {
      console.error('Błąd podczas zapisywania grupy:', error);
      showError('Nie udało się zapisać grupy');
    } finally {
      setSavingGroup(false);
    }
  };

  // Funkcja do usuwania grupy
  const handleDeleteGroup = async (groupId) => {
    if (!window.confirm('Czy na pewno chcesz usunąć tę grupę? Pozycje nie zostaną usunięte.')) {
      return;
    }
    
    try {
      const groupRef = doc(db, 'itemGroups', groupId);
      await deleteDoc(groupRef);
      showSuccess('Grupa została usunięta');
      fetchGroups();
    } catch (error) {
      console.error('Błąd podczas usuwania grupy:', error);
      showError('Nie udało się usunąć grupy');
    }
  };

  // Funkcja do dodawania pozycji do grupy
  const handleAddItemToGroup = (item) => {
    if (!groupFormData.items.includes(item.id)) {
      const updatedItems = [...groupFormData.items, item.id];
      setGroupFormData(prev => ({ ...prev, items: updatedItems }));
      setGroupItems(prev => [...prev, item]);
    }
  };

  // Funkcja do usuwania pozycji z grupy
  const handleRemoveItemFromGroup = (itemId) => {
    const updatedItems = groupFormData.items.filter(id => id !== itemId);
    setGroupFormData(prev => ({ ...prev, items: updatedItems }));
    setGroupItems(prev => prev.filter(item => item.id !== itemId));
  };

  // Dodane funkcje do obsługi menu zarządzania kolumnami
  const handleColumnMenuOpen = (event) => {
    setColumnMenuAnchor(event.currentTarget);
  };
  
  const handleColumnMenuClose = () => {
    setColumnMenuAnchor(null);
  };
  
  const toggleColumnVisibility = (columnName) => {
    // Zamiast lokalnego setVisibleColumns, używamy funkcji updateColumnPreferences z kontekstu
    updateColumnPreferences('inventory', columnName, !visibleColumns[columnName]);
  };

  // Modyfikuj funkcję handleSearchTermChange
  const handleSearchTermChange = (e) => {
    setSearchTerm(e.target.value);
  };

  // Dodaj funkcję handleSearchCategoryChange
  const handleSearchCategoryChange = (e) => {
    setSearchCategory(e.target.value);
  };

  // Modyfikuj funkcję handleSearch, aby bezpośrednio ustawiała wartości debounced
  const handleSearch = () => {
    setPage(1); // Zresetuj paginację
    setDebouncedSearchTerm(searchTerm);
    setDebouncedSearchCategory(searchCategory);
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

      {/* Dodaję zakładkę "Grupy" */}
      <Tabs
        value={currentTab}
        onChange={handleTabChange}
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}
      >
        <Tab label="Stany" />
        <Tab label="Lokalizacje" />
        <Tab label="Grupy" />
      </Tabs>

      {/* Zawartość pierwszej zakładki - Stany */}
      {currentTab === 0 && (
        <>
          <Box sx={{ display: 'flex', mb: 3, flexWrap: 'wrap', gap: 2 }}>
            <TextField
              label="Szukaj SKU"
              variant="outlined"
              value={searchTerm}
              onChange={handleSearchTermChange}
              size="small"
              sx={{ flexGrow: 1, minWidth: '200px' }}
              InputProps={{
                startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} />,
              }}
            />
            <TextField
              label="Szukaj kategorii"
              variant="outlined"
              value={searchCategory}
              onChange={handleSearchCategoryChange}
              size="small"
              sx={{ flexGrow: 1, minWidth: '200px' }}
              InputProps={{
                startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} />,
              }}
            />
            <Button 
              variant="contained" 
              onClick={handleSearch}
              size="medium"
            >
              Szukaj teraz
            </Button>
            <Tooltip title="Konfiguruj widoczne kolumny">
              <IconButton onClick={handleColumnMenuOpen}>
                <ViewColumnIcon />
              </IconButton>
            </Tooltip>
          </Box>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          ) : filteredItems.length === 0 ? (
            <Typography variant="body1" align="center">
              Nie znaleziono pozycji ze stanów
            </Typography>
          ) : (
            <>
              <TableContainer component={Paper} sx={{ mt: 3 }}>
                <Table>
                  <TableHead>
                    <TableRow>
                      {visibleColumns.name && <TableCell>SKU</TableCell>}
                      {visibleColumns.category && <TableCell>Kategoria</TableCell>}
                      {visibleColumns.totalQuantity && <TableCell>Ilość całkowita</TableCell>}
                      {visibleColumns.reservedQuantity && <TableCell>Ilość zarezerwowana</TableCell>}
                      {visibleColumns.availableQuantity && <TableCell>Ilość dostępna</TableCell>}
                      {visibleColumns.status && <TableCell>Status</TableCell>}
                      {visibleColumns.location && <TableCell>Lokalizacja</TableCell>}
                      {visibleColumns.actions && <TableCell align="right">Akcje</TableCell>}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredItems.map((item) => {
                      // Oblicz ilość dostępną (całkowita - zarezerwowana)
                      const bookedQuantity = item.bookedQuantity || 0;
                      const availableQuantity = item.quantity - bookedQuantity;
                      
                      return (
                        <TableRow key={item.id}>
                          {visibleColumns.name && (
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
                          )}
                          {visibleColumns.category && <TableCell>{item.category}</TableCell>}
                          {visibleColumns.totalQuantity && (
                            <TableCell>
                              <Typography variant="body1">{item.quantity} {item.unit}</Typography>
                            </TableCell>
                          )}
                          {visibleColumns.reservedQuantity && (
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
                          )}
                          {visibleColumns.availableQuantity && (
                            <TableCell>
                              <Typography 
                                variant="body1" 
                                color={availableQuantity < item.minStockLevel ? "error" : "primary"}
                              >
                                {availableQuantity} {item.unit}
                              </Typography>
                            </TableCell>
                          )}
                          {visibleColumns.status && (
                            <TableCell>
                              {getStockLevelIndicator(availableQuantity, item.minStockLevel, item.optimalStockLevel)}
                            </TableCell>
                          )}
                          {visibleColumns.location && (
                            <TableCell>
                              {item.location || '-'}
                            </TableCell>
                          )}
                          {visibleColumns.actions && (
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
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Dodaj kontrolki paginacji */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Typography variant="body2" sx={{ mr: 2 }}>
                    Pozycje na stronie:
                  </Typography>
                  <Select
                    value={pageSize}
                    onChange={handlePageSizeChange}
                    size="small"
                  >
                    <MenuItem value={5}>5</MenuItem>
                    <MenuItem value={10}>10</MenuItem>
                    <MenuItem value={20}>20</MenuItem>
                    <MenuItem value={50}>50</MenuItem>
                  </Select>
                </Box>
                <Pagination 
                  count={totalPages} 
                  page={page} 
                  onChange={handlePageChange} 
                  color="primary" 
                />
                <Typography variant="body2">
                  Wyświetlanie {filteredItems.length} z {totalItems} pozycji
                </Typography>
              </Box>
            </>
          )}
          
          {/* Menu konfiguracji kolumn */}
          <Menu
            anchorEl={columnMenuAnchor}
            open={Boolean(columnMenuAnchor)}
            onClose={handleColumnMenuClose}
          >
            <MenuItem onClick={() => toggleColumnVisibility('name')}>
              <Checkbox checked={visibleColumns.name} />
              <ListItemText primary="SKU" />
            </MenuItem>
            <MenuItem onClick={() => toggleColumnVisibility('category')}>
              <Checkbox checked={visibleColumns.category} />
              <ListItemText primary="Kategoria" />
            </MenuItem>
            <MenuItem onClick={() => toggleColumnVisibility('totalQuantity')}>
              <Checkbox checked={visibleColumns.totalQuantity} />
              <ListItemText primary="Ilość całkowita" />
            </MenuItem>
            <MenuItem onClick={() => toggleColumnVisibility('reservedQuantity')}>
              <Checkbox checked={visibleColumns.reservedQuantity} />
              <ListItemText primary="Ilość zarezerwowana" />
            </MenuItem>
            <MenuItem onClick={() => toggleColumnVisibility('availableQuantity')}>
              <Checkbox checked={visibleColumns.availableQuantity} />
              <ListItemText primary="Ilość dostępna" />
            </MenuItem>
            <MenuItem onClick={() => toggleColumnVisibility('status')}>
              <Checkbox checked={visibleColumns.status} />
              <ListItemText primary="Status" />
            </MenuItem>
            <MenuItem onClick={() => toggleColumnVisibility('location')}>
              <Checkbox checked={visibleColumns.location} />
              <ListItemText primary="Lokalizacja" />
            </MenuItem>
            <MenuItem onClick={() => toggleColumnVisibility('actions')}>
              <Checkbox checked={visibleColumns.actions} />
              <ListItemText primary="Akcje" />
            </MenuItem>
          </Menu>
        </>
      )}

      {/* Zakładka Lokalizacje */}
      {currentTab === 1 && (
        <>
          {!selectedWarehouseForView ? (
            // Widok listy lokalizacji
            <>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button
              variant="contained"
              color="primary"
              onClick={() => handleOpenWarehouseDialog('add')}
                  startIcon={<AddIcon />}
            >
                  Nowa lokalizacja
            </Button>
          </Box>

              <TableContainer component={Paper}>
                <Table sx={{ minWidth: 650 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Nazwa</TableCell>
                      <TableCell>Adres</TableCell>
                      <TableCell>Opis</TableCell>
                      <TableCell align="right">Akcje</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {warehousesLoading ? (
                      <TableRow>
                        <TableCell colSpan={4} align="center">
                          <CircularProgress />
                        </TableCell>
                      </TableRow>
                    ) : warehouses.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} align="center">
                          Brak zdefiniowanych lokalizacji
                        </TableCell>
                      </TableRow>
                    ) : (
                      warehouses.map((warehouse) => (
                        <TableRow key={warehouse.id}>
                          <TableCell>
                            <Link 
                              component="button"
                              variant="body1"
                              onClick={() => handleWarehouseClick(warehouse)}
                            >
                              {warehouse.name}
                            </Link>
                          </TableCell>
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
              </TableContainer>
            </>
          ) : (
            // Widok pozycji w wybranej lokalizacji
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
                <Button 
                  variant="outlined" 
                  onClick={handleBackToWarehouses}
                  sx={{ mr: 2 }}
                >
                  &larr; Powrót do lokalizacji
                </Button>
                <Typography variant="h6">
                  Pozycje w lokalizacji: {selectedWarehouseForView.name}
                </Typography>
              </Box>

              <TableContainer component={Paper}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>SKU</TableCell>
                      <TableCell>Kategoria</TableCell>
                      <TableCell>Jednostka</TableCell>
                      <TableCell align="right">Ilość</TableCell>
                      <TableCell align="right">Cena jedn.</TableCell>
                      <TableCell align="right">Akcje</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {warehouseItemsLoading ? (
                      <TableRow>
                        <TableCell colSpan={6} align="center">
                          <CircularProgress />
                        </TableCell>
                      </TableRow>
                    ) : warehouseItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} align="center">
                          Brak pozycji w tej lokalizacji
                        </TableCell>
                      </TableRow>
                    ) : (
                      warehouseItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <Link component={RouterLink} to={`/inventory/${item.id}`}>
                              {item.name}
                            </Link>
                          </TableCell>
                          <TableCell>{item.category || '-'}</TableCell>
                          <TableCell>{item.unit || 'szt.'}</TableCell>
                          <TableCell align="right">{item.quantity || 0}</TableCell>
                          <TableCell align="right">{item.price ? `${item.price} €` : '-'}</TableCell>
                          <TableCell align="right">
                            <IconButton 
                              color="primary" 
                              component={RouterLink} 
                              to={`/inventory/${item.id}`}
                            >
                              <InfoIcon />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
            </TableContainer>
            </>
          )}
        </>
      )}

      {/* Zakładka Grupy */}
      {currentTab === 2 && (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button 
              variant="contained" 
              color="primary" 
              onClick={() => handleOpenGroupDialog('add')}
              startIcon={<AddIcon />}
            >
              Nowa grupa
            </Button>
          </Box>

          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Nazwa grupy</TableCell>
                  <TableCell>Opis</TableCell>
                  <TableCell>Liczba pozycji</TableCell>
                  <TableCell align="right">Akcje</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {groupsLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} align="center">
                      <CircularProgress />
                    </TableCell>
                  </TableRow>
                ) : groups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} align="center">
                      Brak zdefiniowanych grup
                    </TableCell>
                  </TableRow>
                ) : (
                  groups.map((group) => (
                    <TableRow key={group.id}>
                      <TableCell>{group.name}</TableCell>
                      <TableCell>{group.description || '-'}</TableCell>
                      <TableCell>{group.items?.length || 0}</TableCell>
                      <TableCell align="right">
                        <IconButton 
                          color="primary" 
                          onClick={() => handleOpenGroupDialog('edit', group)}
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton 
                          color="error" 
                          onClick={() => handleDeleteGroup(group.id)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      {/* Dialog do dodawania/edycji grup */}
      <Dialog open={openGroupDialog} onClose={handleCloseGroupDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          {groupDialogMode === 'add' ? 'Nowa grupa' : 'Edytuj grupę'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Nazwa grupy"
                  name="name"
                  value={groupFormData.name}
                  onChange={(e) => setGroupFormData(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Opis (opcjonalny)"
                  name="description"
                  value={groupFormData.description}
                  onChange={(e) => setGroupFormData(prev => ({ ...prev, description: e.target.value }))}
                  multiline
                  rows={2}
                />
              </Grid>
              <Grid item xs={12}>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                  Pozycje w grupie ({groupItems.length})
                </Typography>
                {groupItems.length > 0 ? (
                  <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>SKU</TableCell>
                          <TableCell>Kategoria</TableCell>
                          <TableCell align="right">Akcje</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {groupItems.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>{item.name}</TableCell>
                            <TableCell>{item.category || '-'}</TableCell>
                            <TableCell align="right">
                              <IconButton 
                                size="small" 
                                color="error" 
                                onClick={() => handleRemoveItemFromGroup(item.id)}
                              >
                                <DeleteIcon />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  <Box sx={{ p: 2, textAlign: 'center', bgcolor: '#f5f5f5', borderRadius: 1, mb: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      Brak pozycji w grupie. Dodaj pozycje z listy poniżej.
                    </Typography>
                  </Box>
                )}
                
                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                  Dostępne pozycje
                </Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300, overflowY: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>SKU</TableCell>
                        <TableCell>Kategoria</TableCell>
                        <TableCell align="right">Akcje</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {inventoryItems
                        .filter(item => !groupFormData.items.includes(item.id))
                        .map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>{item.name}</TableCell>
                            <TableCell>{item.category || '-'}</TableCell>
                            <TableCell align="right">
                              <IconButton 
                                size="small" 
                                color="primary" 
                                onClick={() => handleAddItemToGroup(item)}
                              >
                                <AddIcon />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseGroupDialog}>Anuluj</Button>
          <Button 
            onClick={handleSubmitGroup} 
            variant="contained" 
            color="primary"
            disabled={savingGroup || !groupFormData.name}
          >
            {savingGroup ? <CircularProgress size={24} /> : 'Zapisz'}
          </Button>
        </DialogActions>
      </Dialog>

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
                      <Box display="flex" justifyContent="flex-end">
                        <IconButton 
                          color="primary" 
                          size="small" 
                          onClick={() => handleEditReservation(reservation)}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton 
                          color="error" 
                          size="small" 
                          onClick={() => handleDeleteReservation(reservation.id)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
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

      {/* Dialog do dodawania/edycji lokalizacji */}
      <Dialog open={openWarehouseDialog} onClose={handleCloseWarehouseDialog} fullWidth>
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

    </div>
  );
};

export default InventoryList;
