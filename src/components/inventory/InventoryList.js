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
  Pagination,
  InputAdornment,
  TablePagination,
  Fade,
  Grow,
  Skeleton
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
  ArrowDropUp as ArrowDropUpIcon,
  PictureAsPdf as PdfIcon,
  TableChart as CsvIcon,
  Clear as ClearIcon,
  Assignment as CoAIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { getAllInventoryItems, getInventoryItemsOptimized, clearInventoryItemsCache, deleteInventoryItem, getExpiringBatches, getExpiredBatches, getItemTransactions, getAllWarehouses, createWarehouse, updateWarehouse, deleteWarehouse, getItemBatches, updateReservation, updateReservationTasks, cleanupDeletedTaskReservations, deleteReservation, getInventoryItemById, recalculateAllInventoryQuantities, cleanupMicroReservations } from '../../services/inventory';
import { useNotification } from '../../hooks/useNotification';
import { formatDate, formatQuantity } from '../../utils/formatters';
import { toast } from 'react-hot-toast';
import { exportToCSV } from '../../utils/exportUtils';
import { useAuth } from '../../hooks/useAuth';
import LabelDialog from './LabelDialog';
import EditReservationDialog from './EditReservationDialog';
import CoAGeneratorDialog from './CoAGeneratorDialog';
import { doc, getDoc, updateDoc, serverTimestamp, collection, getDocs, addDoc, deleteDoc, query, orderBy, limit, where } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { useColumnPreferences } from '../../contexts/ColumnPreferencesContext';
import { useInventoryListState } from '../../contexts/InventoryListStateContext';
import { INVENTORY_CATEGORIES } from '../../utils/constants';
import { useTranslation } from '../../hooks/useTranslation';

// Definicje stałych
const INVENTORY_TRANSACTIONS_COLLECTION = 'inventoryTransactions';

const InventoryList = () => {
  const { t } = useTranslation();
  const [inventoryItems, setInventoryItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expiringCount, setExpiringCount] = useState(0);
  const [expiredCount, setExpiredCount] = useState(0);
  const { showSuccess, showError } = useNotification();
  const [selectedItem, setSelectedItem] = useState(null);
  const [reservationDialogOpen, setReservationDialogOpen] = useState(false);
  const [reservations, setReservations] = useState([]);
  const [filteredReservations, setFilteredReservations] = useState([]);
  const [sortOrder, setSortOrder] = useState('desc');
  const [sortField, setSortField] = useState('createdAt');
  const [warehouses, setWarehouses] = useState([]);
  const [warehousesLoading, setWarehousesLoading] = useState(true);
  const [openWarehouseDialog, setOpenWarehouseDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState('add');
  const [selectedWarehouseForEdit, setSelectedWarehouseForEdit] = useState(null);
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
  const [warehouseItemsLoading, setWarehouseItemsLoading] = useState(false);
  const [batchesDialogOpen, setBatchesDialogOpen] = useState(false);
  const [coaDialogOpen, setCoaDialogOpen] = useState(false);
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);
  const [warehouseItemsTotalCount, setWarehouseItemsTotalCount] = useState(0);
  const [warehouseItemsTotalPages, setWarehouseItemsTotalPages] = useState(1);
  const warehouseSearchTermRef = useRef(null);
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
  
  // Dodaję stany dla zakładki Rezerwacje
  const [allReservations, setAllReservations] = useState([]);
  const [filteredAllReservations, setFilteredAllReservations] = useState([]);
  const [loadingAllReservations, setLoadingAllReservations] = useState(false);
  
  // Zamiast lokalnego stanu, użyjmy kontekstu preferencji kolumn
  const [columnMenuAnchor, setColumnMenuAnchor] = useState(null);
  
  // Użyj kontekstu preferencji kolumn
  const { getColumnPreferencesForView, updateColumnPreferences } = useColumnPreferences();
  // Pobierz preferencje dla widoku 'inventory'
  const visibleColumns = getColumnPreferencesForView('inventory');

  // Użyj kontekstu stanu listy magazynowej
  const { state: listState, actions: listActions } = useInventoryListState();

  // Zmienne stanu z kontekstu
  const searchTerm = listState.searchTerm;
  const searchCategory = listState.searchCategory;
  const selectedWarehouse = listState.selectedWarehouse;
  const currentTab = listState.currentTab;
  const page = listState.page;
  const pageSize = listState.pageSize;
  const tableSort = listState.tableSort;
  const selectedWarehouseForView = listState.selectedWarehouseForView;
  const warehouseItemsPage = listState.warehouseItemsPage;
  const warehouseItemsPageSize = listState.warehouseItemsPageSize;
  const warehouseSearchTerm = listState.warehouseSearchTerm;
  const warehouseItemsSort = listState.warehouseItemsSort;
  const reservationFilter = listState.reservationFilter;
  const moFilter = listState.moFilter;

  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Dodaj useRef dla timerów debouncing
  const searchTermTimerRef = useRef(null);
  const searchCategoryTimerRef = useRef(null);
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);
  const [debouncedSearchCategory, setDebouncedSearchCategory] = useState(searchCategory);

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
    listActions.setSelectedWarehouse(event.target.value);
  };

  // Efekt, który pobiera dane przy pierwszym renderowaniu
  useEffect(() => {
    fetchInventoryItems(tableSort.field, tableSort.order);
    fetchExpiryData();
    
    // Dodaj nasłuchiwanie na zdarzenie aktualizacji stanów
    const handleInventoryUpdate = (event) => {
      console.log('📨 Wykryto aktualizację stanów, odświeżam dane...');
      fetchInventoryItems(tableSort.field, tableSort.order);
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
      listActions.setPage(1);
    } else {
      fetchInventoryItems();
    }
  }, [debouncedSearchTerm, debouncedSearchCategory]);

  // Dodaj efekt do pobierania wszystkich rezerwacji gdy wybrana jest zakładka Rezerwacje
  useEffect(() => {
    if (currentTab === 3) {
      fetchAllReservations();
    }
  }, [currentTab]);
  
  // Dodaj funkcję do pobierania wszystkich rezerwacji
  const fetchAllReservations = async () => {
    try {
      setLoadingAllReservations(true);
      
      // Pobierz wszystkie transakcje typu booking
      const transactionsRef = collection(db, INVENTORY_TRANSACTIONS_COLLECTION);
      const q = query(
        transactionsRef,
        where('type', '==', 'booking'),
        orderBy('createdAt', 'desc'),
        limit(200) // Limituj ilość wyników dla wydajności
      );
      
      const querySnapshot = await getDocs(q);
      const reservations = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAtDate: doc.data().createdAt ? new Date(doc.data().createdAt.seconds * 1000) : new Date()
      }));
      
      // Filtruj rezerwacje - tylko te związane z zadaniami produkcyjnymi
      const productionReservations = reservations.filter(reservation => 
        reservation.referenceId && 
        (reservation.taskNumber || reservation.reason === 'Zadanie produkcyjne')
      );
      
      setAllReservations(productionReservations);
      setFilteredAllReservations(productionReservations);
      
      console.log(`Pobrano ${productionReservations.length} rezerwacji dla zadań produkcyjnych`);
    } catch (error) {
      console.error('Błąd podczas pobierania rezerwacji:', error);
      showError('Nie udało się pobrać listy rezerwacji');
    } finally {
      setLoadingAllReservations(false);
    }
  };
  
  // Dodaj funkcję do filtrowania rezerwacji po numerze MO
  const handleMoFilterChange = (e) => {
    const value = e.target.value;
    listActions.setMoFilter(value);
    
    if (!value) {
      setFilteredAllReservations(allReservations);
      return;
    }
    
    const filtered = allReservations.filter(reservation => {
      const moNumber = reservation.taskNumber || '';
      return moNumber.toLowerCase().includes(value.toLowerCase());
    });
    
    setFilteredAllReservations(filtered);
  };
  
  // Dodaj efekt dla debounced search term
  useEffect(() => {
    if (searchTermTimerRef.current) {
      clearTimeout(searchTermTimerRef.current);
    }
    
    searchTermTimerRef.current = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      // Po ustawieniu nowego terminu wyszukiwania, wywołujemy fetchInventoryItems z aktualnymi parametrami sortowania
      if (searchTerm !== debouncedSearchTerm) {
        listActions.setPage(1); // Reset paginacji
        fetchInventoryItems(tableSort.field, tableSort.order);
      }
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
      // Po ustawieniu nowej kategorii wyszukiwania, wywołujemy fetchInventoryItems z aktualnymi parametrami sortowania
      if (searchCategory !== debouncedSearchCategory) {
        listActions.setPage(1); // Reset paginacji
        fetchInventoryItems(tableSort.field, tableSort.order);
      }
    }, 1000);

    return () => {
      if (searchCategoryTimerRef.current) {
        clearTimeout(searchCategoryTimerRef.current);
      }
    };
  }, [searchCategory]);

  // Efekt, który ponownie pobiera dane po zmianie wybranego magazynu
  useEffect(() => {
    if (selectedWarehouse !== undefined) {
      listActions.setPage(1); // Resetuj stronę po zmianie magazynu
      fetchInventoryItems(tableSort.field, tableSort.order);
    }
  }, [selectedWarehouse]);

  // Dodajemy stan śledzący inicjalizację komponentu
  const [isInitialized, setIsInitialized] = useState(false);
  const isFirstRender = useRef(true);

  // Dodaj nowy stan dla animacji ładowania głównej tabeli
  const [mainTableLoading, setMainTableLoading] = useState(false);
  const [showContent, setShowContent] = useState(false);

  // Dodaj nową funkcję do sortowania głównej tabeli stanów
  const handleTableSort = (field) => {
    const newOrder = tableSort.field === field && tableSort.order === 'asc' ? 'desc' : 'asc';
    const newSort = {
      field,
      order: newOrder
    };
    listActions.setTableSort(newSort);
    
    // Zamiast sortować lokalnie, wywołamy fetchInventoryItems z nowymi parametrami sortowania
    // Najpierw resetujemy paginację
    listActions.setPage(1);
    
    // Następnie pobieramy dane z serwera z nowym sortowaniem
    fetchInventoryItems(field, newOrder);
  };

  // Zmodyfikuj funkcję fetchInventoryItems, aby obsługiwała animacje
  const fetchInventoryItems = async (newSortField = null, newSortOrder = null) => {
    // Rozpocznij animację ładowania tylko dla głównej tabeli stanów
    if (currentTab === 0) {
      setMainTableLoading(true);
      setShowContent(false);
    } else {
      setLoading(true);
    }
    
    try {
      // Wyczyść mikrorezerwacje tylko raz podczas inicjalizacji lub gdy użytkownik wymusi odświeżenie
      if (isFirstRender.current) {
        await cleanupMicroReservations();
        isFirstRender.current = false;
      }
      
      // Użyj przekazanych parametrów sortowania lub tych z stanu
      const sortFieldToUse = newSortField || tableSort.field;
      const sortOrderToUse = newSortOrder || tableSort.order;
      
      // UŻYJ ZOPTYMALIZOWANEJ FUNKCJI dla lepszej wydajności
      // W głównej zakładce "Stany" nie filtrujemy po magazynie - pokazujemy wszystkie pozycje
      const warehouseFilter = currentTab === 0 ? null : (selectedWarehouse || null);
      const result = await getInventoryItemsOptimized({
        warehouseId: warehouseFilter,
        page: page,
        pageSize: pageSize,
        searchTerm: debouncedSearchTerm.trim() !== '' ? debouncedSearchTerm : null,
        searchCategory: debouncedSearchCategory.trim() !== '' ? debouncedSearchCategory : null,
        sortField: sortFieldToUse,
        sortOrder: sortOrderToUse,
        forceRefresh: false
      });
      
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
      
      // PRZYŚPIESZONE ANIMACJE - zmniejszone opóźnienie dla lepszej responsywności
      if (currentTab === 0) {
        setTimeout(() => {
          setShowContent(true);
        }, 25); // Zmniejszone z 100ms do 25ms
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

  // Obsługa zmiany strony
  const handlePageChange = (event, newPage) => {
    listActions.setPage(newPage);
  };

  // Obsługa zmiany rozmiaru strony
  const handlePageSizeChange = (event) => {
    listActions.setPageSize(parseInt(event.target.value, 10));
    listActions.setPage(1); // Resetuj stronę po zmianie rozmiaru strony
  };

  // Modyfikujemy efekt, który ponownie pobiera dane po zmianie strony lub rozmiaru strony
  useEffect(() => {
    // Inicjalizacja komponentu
    if (!isInitialized) {
      setIsInitialized(true);
      return;
    }

    // Pobierz dane tylko jeśli komponent jest już zainicjalizowany
    fetchInventoryItems(tableSort.field, tableSort.order);
  }, [page, pageSize, isInitialized]);

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
    listActions.setReservationFilter(event.target.value);
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
    listActions.setReservationFilter('all');
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
    listActions.setCurrentTab(newValue);
    if (newValue === 2) {
      // Jeśli wybrano zakładkę "Grupy", pobierz je
      fetchGroups();
    }
  };
  
  // Zarządzanie lokalizacjami - nowe funkcje
  const handleOpenWarehouseDialog = (mode, warehouse = null) => {
    setDialogMode(mode);
    setSelectedWarehouseForEdit(warehouse);
    
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
    setSelectedWarehouseForEdit(null);
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
        await updateWarehouse(selectedWarehouseForEdit.id, warehouseFormData, currentUser.uid);
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
  const fetchWarehouseItems = async (warehouseId, newSortField = null, newSortOrder = null) => {
    setWarehouseItemsLoading(true);
    try {
      // Użyj przekazanych parametrów sortowania lub tych z stanu
      const sortFieldToUse = newSortField || warehouseItemsSort.field;
      const sortOrderToUse = newSortOrder || warehouseItemsSort.order;
      
      // Wywołaj getAllInventoryItems z parametrami paginacji, wyszukiwania i sortowania
      const result = await getAllInventoryItems(
        warehouseId, 
        warehouseItemsPage, 
        warehouseItemsPageSize, 
        warehouseSearchTerm.trim() !== '' ? warehouseSearchTerm : null,
        null, // brak filtrowania po kategorii
        sortFieldToUse,
        sortOrderToUse
      );
      
      // Jeśli wynik to obiekt z właściwościami items i totalCount, to używamy paginacji
      if (result && result.items) {
        // Nie filtrujemy - pokazujemy wszystkie pozycje
        setWarehouseItems(result.items);
        setWarehouseItemsTotalCount(result.totalCount);
        setWarehouseItemsTotalPages(Math.ceil(result.totalCount / warehouseItemsPageSize));
      } else {
        // Stara logika dla kompatybilności
        setWarehouseItems(result);
      }
    } catch (error) {
      console.error('Błąd podczas pobierania pozycji z magazynu:', error);
      showError('Nie udało się pobrać pozycji z magazynu');
    } finally {
      setWarehouseItemsLoading(false);
    }
  };

  // Funkcja do obsługi kliknięcia w magazyn
  const handleWarehouseClick = async (warehouse) => {
    listActions.setSelectedWarehouseForView(warehouse);
    await fetchWarehouseItems(warehouse.id);
  };

  // Funkcja do powrotu do listy magazynów
  const handleBackToWarehouses = () => {
    listActions.setSelectedWarehouseForView(null);
  };

  // Funkcja do pokazywania dialogu z partiami dla przedmiotu w lokalizacji
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

  // Funkcja do zamykania dialogu z partiami
  const handleCloseBatchesDialog = () => {
    setBatchesDialogOpen(false);
    setTimeout(() => {
      setSelectedItem(null);
      setSelectedItemBatches([]);
    }, 300);
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
    listActions.setSearchTerm(e.target.value);
  };

  // Dodaj funkcję handleSearchCategoryChange
  const handleSearchCategoryChange = (e) => {
    listActions.setSearchCategory(e.target.value);
  };

  // Modyfikuj funkcję handleSearch, aby uwzględniała aktualne parametry sortowania
  const handleSearch = () => {
    listActions.setPage(1); // Zresetuj paginację
    setDebouncedSearchTerm(searchTerm);
    setDebouncedSearchCategory(searchCategory);
    // Wywołaj fetchInventoryItems z aktualnymi parametrami sortowania
    fetchInventoryItems(tableSort.field, tableSort.order);
  };

  // Funkcja do generowania raportu PDF ze stanów magazynowych
  const generatePdfReport = async () => {
    try {
      setMainTableLoading(true);
      showSuccess('Generowanie raportu PDF...');

      // Pobierz wszystkie pozycje magazynowe do raportu (bez paginacji)
      const allItems = await getAllInventoryItems(
        selectedWarehouse || null, 
        null, 
        null, 
        debouncedSearchTerm.trim() !== '' ? debouncedSearchTerm : null,
        debouncedSearchCategory.trim() !== '' ? debouncedSearchCategory : null,
        tableSort.field,
        tableSort.order
      );

      // Importuj jsPDF i autoTable
      const { jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;

      // Utwórz dokument PDF
      const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      // Funkcja do poprawiania polskich znaków
      const fixPolishChars = (text) => {
        if (!text) return '';
        return text.toString()
          .replace(/ą/g, 'a')
          .replace(/ć/g, 'c')
          .replace(/ę/g, 'e')
          .replace(/ł/g, 'l')
          .replace(/ń/g, 'n')
          .replace(/ó/g, 'o')
          .replace(/ś/g, 's')
          .replace(/ź/g, 'z')
          .replace(/ż/g, 'z')
          .replace(/Ą/g, 'A')
          .replace(/Ć/g, 'C')
          .replace(/Ę/g, 'E')
          .replace(/Ł/g, 'L')
          .replace(/Ń/g, 'N')
          .replace(/Ó/g, 'O')
          .replace(/Ś/g, 'S')
          .replace(/Ź/g, 'Z')
          .replace(/Ż/g, 'Z');
      };

      // Nagłówek
      doc.setFontSize(18);
      doc.text('Inventory Stock Report', 14, 20);

      // Data wygenerowania
      const currentDate = new Date();
      const formattedDate = `${currentDate.getDate()}.${currentDate.getMonth() + 1}.${currentDate.getFullYear()}`;
      doc.setFontSize(12);
      doc.text(`Generated: ${formattedDate}`, 14, 30);

      // Filtr magazynu
      if (selectedWarehouse) {
        const warehouseName = warehouses.find(w => w.id === selectedWarehouse)?.name || selectedWarehouse;
        doc.text(`Warehouse: ${fixPolishChars(warehouseName)}`, 14, 38);
      } else {
        doc.text('Warehouse: All', 14, 38);
      }

      // Filtr wyszukiwania
      if (debouncedSearchTerm) {
        doc.text(`SKU Filter: ${fixPolishChars(debouncedSearchTerm)}`, 14, 46);
      }
      if (debouncedSearchCategory) {
        doc.text(`Category: ${fixPolishChars(debouncedSearchCategory)}`, 14, 54);
      }

      // Podsumowanie ilościowe
      const itemsToShow = Array.isArray(allItems.items) ? allItems.items : allItems;
      const totalItems = itemsToShow.length;
      const totalQuantity = itemsToShow.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
      const totalReserved = itemsToShow.reduce((sum, item) => sum + (Number(item.bookedQuantity) || 0), 0);
      const totalAvailable = totalQuantity - totalReserved;

      doc.setFontSize(14);
      doc.text('Summary', 14, 65);
      doc.setFontSize(10);
      doc.text(`Total items: ${totalItems}`, 14, 73);
      doc.text(`Total quantity: ${totalQuantity.toFixed(2)}`, 14, 80);
      doc.text(`Reserved quantity: ${totalReserved.toFixed(2)}`, 14, 87);
      doc.text(`Available quantity: ${totalAvailable.toFixed(2)}`, 14, 94);

      // Przygotuj dane tabeli
      const tableData = itemsToShow.map(item => {
        const bookedQuantity = Number(item.bookedQuantity) || 0;
        const availableQuantity = Number(item.quantity) - bookedQuantity;
        
        return [
          fixPolishChars(item.category || ''),
          fixPolishChars(item.name || ''), // Przenosimy name do kolumny SKU
          fixPolishChars(item.casNumber || ''),
          fixPolishChars(item.barcode || ''),
          (Number(item.quantity) || 0).toFixed(2) + ' ' + (item.unit || 'pcs.'),
          bookedQuantity.toFixed(2) + ' ' + (item.unit || 'pcs.'),
          availableQuantity.toFixed(2) + ' ' + (item.unit || 'pcs.'),
          fixPolishChars(item.warehouseName || '')
        ];
      });

      // Nagłówki tabeli
      const tableHeaders = [
        'Category',
        'SKU',
        'CAS Number',
        'Barcode',
        'Total Quantity',
        'Reserved Quantity',
        'Available Quantity',
        'Location'
      ];

      // Generuj tabelę
      autoTable(doc, {
        startY: 105,
        head: [tableHeaders],
        body: tableData,
        headStyles: { fillColor: [66, 139, 202], font: 'helvetica' },
        alternateRowStyles: { fillColor: [241, 245, 249] },
        styles: { font: 'helvetica', fontSize: 8, cellPadding: 2 },
        margin: { top: 105 },
        tableLineWidth: 0.1,
        tableLineColor: [0, 0, 0]
      });

      // Stopka
      const pageCount = doc.internal.getNumberOfPages();
      for(let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(10);
        doc.text(
          `Page ${i} of ${pageCount}`,
          doc.internal.pageSize.width / 2,
          doc.internal.pageSize.height - 10,
          { align: 'center' }
        );
      }

      // Zapisz plik
      doc.save(`Inventory_Stock_Report_${formattedDate.replace(/\./g, '_')}.pdf`);
      showSuccess('Raport PDF został wygenerowany');
    } catch (error) {
      console.error('Błąd podczas generowania raportu PDF:', error);
      showError('Błąd podczas generowania raportu PDF: ' + error.message);
    } finally {
      setMainTableLoading(false);
    }
  };

  // Funkcja do generowania raportu CSV ze stanów magazynowych
  const generateCsvReport = async () => {
    try {
      setMainTableLoading(true);
      showSuccess('Generowanie raportu CSV...');

      // Pobierz wszystkie pozycje magazynowe do raportu (bez paginacji)
      const allItems = await getAllInventoryItems(
        selectedWarehouse || null, 
        null, 
        null, 
        debouncedSearchTerm.trim() !== '' ? debouncedSearchTerm : null,
        debouncedSearchCategory.trim() !== '' ? debouncedSearchCategory : null,
        tableSort.field,
        tableSort.order
      );

      const itemsToExport = Array.isArray(allItems.items) ? allItems.items : allItems;

      // Przygotuj dane do eksportu
      const data = itemsToExport.map(item => {
        const bookedQuantity = Number(item.bookedQuantity) || 0;
        const availableQuantity = Number(item.quantity) - bookedQuantity;
        
        return {
          category: item.category || '',
          sku: item.name || '', // Przenosimy name do kolumny SKU
          casNumber: item.casNumber || '',
          barcode: item.barcode || '',
          totalQuantity: (Number(item.quantity) || 0).toFixed(2),
          unit: item.unit || 'pcs.',
          reservedQuantity: bookedQuantity.toFixed(2),
          availableQuantity: availableQuantity.toFixed(2),
          location: item.warehouseName || '',
          minStockLevel: item.minStockLevel || '',
          maxStockLevel: item.maxStockLevel || '',
          unitPrice: item.unitPrice || ''
        };
      });

      // Przygotuj nagłówki dla CSV
      const headers = [
        { label: 'Category', key: 'category' },
        { label: 'SKU', key: 'sku' },
        { label: 'CAS Number', key: 'casNumber' },
        { label: 'Barcode', key: 'barcode' },
        { label: 'Total Quantity', key: 'totalQuantity' },
        { label: 'Unit', key: 'unit' },
        { label: 'Reserved Quantity', key: 'reservedQuantity' },
        { label: 'Available Quantity', key: 'availableQuantity' },
        { label: 'Location', key: 'location' },
        { label: 'Min Stock Level', key: 'minStockLevel' },
        { label: 'Max Stock Level', key: 'maxStockLevel' },
        { label: 'Unit Price', key: 'unitPrice' }
      ];

      // Generuj CSV
      const success = exportToCSV(data, headers, `Inventory_Stock_Report_${new Date().toISOString().slice(0, 10)}`);
      if (success) {
        showSuccess('Raport CSV został wygenerowany');
      } else {
        showError('Błąd podczas generowania raportu CSV');
      }
    } catch (error) {
      console.error('Błąd podczas generowania raportu CSV:', error);
      showError('Błąd podczas generowania raportu CSV: ' + error.message);
    } finally {
      setMainTableLoading(false);
    }
  };

  // Funkcja do obsługi generatora CoA
  const handleCoAGenerator = () => {
    setCoaDialogOpen(true);
  };

  // Funkcja do zamknięcia dialogu CoA
  const handleCloseCoADialog = () => {
    setCoaDialogOpen(false);
  };

  // Funkcja do obsługi wygenerowania CoA
  const handleCoAGenerated = (markdownContent) => {
    showSuccess('Certyfikat CoA został wygenerowany');
    console.log('Generated CoA content:', markdownContent);
  };

  const handleMoreMenuOpen = (event) => {
    setMenuAnchorEl(event.currentTarget);
  };

  const handleMoreMenuClose = () => {
    setMenuAnchorEl(null);
  };

  const handleRefreshList = () => {
    console.log('🔄 Ręczne odświeżanie listy pozycji magazynowych...');
    
    // Wyczyść cache przed odświeżeniem
    clearInventoryItemsCache();
    
    // Odśwież dane w zależności od aktywnej zakładki
    if (currentTab === 0) {
      // Zakładka "Stany"
      fetchInventoryItems(tableSort.field, tableSort.order);
      fetchExpiryData();
    } else if (currentTab === 1 && selectedWarehouse) {
      // Zakładka "Lokalizacje" 
      fetchWarehouseItems(selectedWarehouse.id, warehouseItemsSort.field, warehouseItemsSort.order);
    } else if (currentTab === 1) {
      // Zakładka "Lokalizacje" bez wybranego magazynu
      fetchWarehouses();
    } else if (currentTab === 3) {
      // Zakładka "Rezerwacje"
      fetchAllReservations();
    }
    showSuccess('Lista została odświeżona');
  };

  const handleMenuItemClick = (action) => {
    handleMoreMenuClose();
    switch (action) {
      case 'pdf':
        generatePdfReport();
        break;
      case 'csv':
        generateCsvReport();
        break;
      case 'coa':
        handleCoAGenerator();
        break;
      case 'refresh':
        handleRefreshList();
        break;
      default:
        break;
    }
  };

  // Funkcje do obsługi wyszukiwania w lokalizacji
  const handleWarehouseSearchTermChange = (e) => {
    listActions.setWarehouseSearchTerm(e.target.value);
  };
  
  const clearWarehouseSearch = () => {
    listActions.setWarehouseSearchTerm('');
    warehouseSearchTermRef.current.value = '';
  };
  
  // Funkcje do obsługi paginacji w lokalizacji
  const handleWarehousePageChange = (event, newPage) => {
    listActions.setWarehouseItemsPage(newPage);
  };
  
  const handleWarehousePageSizeChange = (event) => {
    listActions.setWarehouseItemsPageSize(parseInt(event.target.value, 10));
  };
  
  // Funkcja do sortowania w widoku lokalizacji
  const handleWarehouseTableSort = (field) => {
    const newOrder = warehouseItemsSort.field === field && warehouseItemsSort.order === 'asc' ? 'desc' : 'asc';
    const newSort = {
      field,
      order: newOrder
    };
    listActions.setWarehouseItemsSort(newSort);
    
    // Następnie pobieramy dane z serwera z nowym sortowaniem
    if (selectedWarehouseForView) {
      fetchWarehouseItems(selectedWarehouseForView.id, field, newOrder);
    }
  };
  
  /* Usuwam zbędny efekt, ponieważ fetchWarehouseItems jest już wywoływane w funkcjach obsługujących zmianę strony
  // Efekt do pobierania danych przy zmianie strony lub rozmiaru strony w widoku lokalizacji
  useEffect(() => {
    if (selectedWarehouseForView) {
      fetchWarehouseItems(selectedWarehouseForView.id);
    }
  }, [warehouseItemsPage, warehouseItemsPageSize]);
  */

  return (
    <div>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexDirection: { xs: 'column', sm: 'row' }, gap: { xs: 2, sm: 0 } }}>
        <Typography variant="h5">{t('inventory.states.title')}</Typography>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1, width: { xs: '100%', sm: 'auto' } }}>
          <Box sx={{ display: 'flex', gap: 1, width: '100%' }}>
            <Tooltip title={t('inventory.states.moreOptions')}>
              <Button
                variant="outlined"
                color="primary"
                onClick={handleMoreMenuOpen}
                startIcon={<MoreVertIcon />}
                sx={{ flex: 1 }}
                disabled={mainTableLoading}
              >
                {t('inventory.states.more')}
              </Button>
            </Tooltip>
            <Button 
              variant="contained" 
              color="primary" 
              component={RouterLink} 
              to="/inventory/new"
              startIcon={<AddIcon />}
              sx={{ flex: 1 }}
            >
              {t('inventory.states.newItem')}
            </Button>
          </Box>
        </Box>

        {/* Menu rozwijane z opcjami */}
        <Menu
          anchorEl={menuAnchorEl}
          open={Boolean(menuAnchorEl)}
          onClose={handleMoreMenuClose}
          PaperProps={{
            elevation: 3,
            sx: { mt: 1 }
          }}
        >
          <MenuItem onClick={() => handleMenuItemClick('refresh')}>
            <ListItemIcon>
              <RefreshIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Odśwież listę</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => handleMenuItemClick('pdf')}>
            <ListItemIcon>
              <PdfIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t('inventory.states.pdfReport')}</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => handleMenuItemClick('csv')}>
            <ListItemIcon>
              <CsvIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t('inventory.states.csvReport')}</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => handleMenuItemClick('coa')}>
            <ListItemIcon>
              <CoAIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t('inventory.states.coaGenerator')}</ListItemText>
          </MenuItem>
          <MenuItem component={RouterLink} to="/inventory/expiry-dates" onClick={handleMoreMenuClose}>
            <ListItemIcon>
              <Badge badgeContent={expiringCount + expiredCount} color="error" max={99}>
                <WarningIcon fontSize="small" />
              </Badge>
            </ListItemIcon>
            <ListItemText>{t('inventory.states.expiryDates')}</ListItemText>
          </MenuItem>
        </Menu>
      </Box>

      {/* Dodaję zakładkę "Grupy" */}
      <Tabs
        value={currentTab}
        onChange={handleTabChange}
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}
      >
        <Tab label={t('inventory.states.tabs.states')} />
        <Tab label={t('inventory.states.tabs.locations')} />
        <Tab label={t('inventory.states.tabs.groups')} />
        <Tab label={t('inventory.states.tabs.reservations')} />
      </Tabs>

      {/* Zawartość pierwszej zakładki - Stany */}
      {currentTab === 0 && (
        <>
          <Fade in={true} timeout={300}>
            <Box sx={{ display: 'flex', mb: 3, flexWrap: 'wrap', gap: 2 }}>
              <TextField
                label={t('inventory.states.searchSku')}
                variant="outlined"
                value={searchTerm}
                onChange={handleSearchTermChange}
                size="small"
                sx={{ flexGrow: 1, minWidth: '200px' }}
                InputProps={{
                  startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} />,
                }}
              />
              <FormControl sx={{ flexGrow: 1, minWidth: '200px' }}>
                <InputLabel id="category-select-label">{t('inventory.states.searchCategory')}</InputLabel>
                <Select
                  labelId="category-select-label"
                  value={searchCategory}
                  label={t('inventory.states.searchCategory')}
                  onChange={handleSearchCategoryChange}
                  size="small"
                >
                  <MenuItem value="">{t('inventory.states.allCategories')}</MenuItem>
                  {Object.values(INVENTORY_CATEGORIES).map((category) => (
                    <MenuItem key={category} value={category}>{category}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button 
                variant="contained" 
                onClick={handleSearch}
                size="medium"
              >
                {t('inventory.states.searchNow')}
              </Button>
              <Tooltip title="Odśwież listę i wyczyść cache">
                <IconButton 
                  onClick={handleRefreshList}
                  color="primary"
                  size="medium"
                  sx={{ 
                    ml: 1,
                    border: '1px solid',
                    borderColor: 'primary.main',
                    '&:hover': {
                      backgroundColor: 'primary.main',
                      color: 'primary.contrastText'
                    }
                  }}
                >
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title={t('inventory.states.configureColumns')}>
                <IconButton onClick={handleColumnMenuOpen}>
                  <ViewColumnIcon />
                </IconButton>
              </Tooltip>
            </Box>
          </Fade>

          {mainTableLoading ? (
            <Fade in={mainTableLoading} timeout={200}>
              <TableContainer component={Paper} sx={{ mt: 3 }}>
                <Table>
                  <TableHead>
                    <TableRow>
                      {visibleColumns.name && <TableCell>{t('inventory.states.table.sku')}</TableCell>}
                      {visibleColumns.category && <TableCell>{t('inventory.states.table.category')}</TableCell>}
                      {visibleColumns.casNumber && <TableCell>{t('inventory.states.table.casNumber')}</TableCell>}
                      {visibleColumns.barcode && <TableCell>{t('inventory.states.table.barcode')}</TableCell>}
                      {visibleColumns.totalQuantity && <TableCell>{t('inventory.states.table.totalQuantity')}</TableCell>}
                      {visibleColumns.reservedQuantity && <TableCell>{t('inventory.states.table.reservedQuantity')}</TableCell>}
                      {visibleColumns.availableQuantity && <TableCell>{t('inventory.states.table.availableQuantity')}</TableCell>}
                      {visibleColumns.status && <TableCell>{t('inventory.states.table.status')}</TableCell>}
                      {visibleColumns.location && <TableCell>{t('inventory.states.table.location')}</TableCell>}
                      {visibleColumns.actions && <TableCell align="right">{t('inventory.states.table.actions')}</TableCell>}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {Array.from({ length: pageSize }).map((_, index) => (
                      <TableRow key={index}>
                        {visibleColumns.name && (
                          <TableCell>
                            <Skeleton variant="text" width="80%" height={24} />
                            <Skeleton variant="text" width="60%" height={16} />
                          </TableCell>
                        )}
                        {visibleColumns.category && <TableCell><Skeleton variant="text" width="70%" /></TableCell>}
                        {visibleColumns.casNumber && <TableCell><Skeleton variant="text" width="60%" /></TableCell>}
                        {visibleColumns.barcode && <TableCell><Skeleton variant="text" width="60%" /></TableCell>}
                        {visibleColumns.totalQuantity && <TableCell><Skeleton variant="text" width="50%" /></TableCell>}
                        {visibleColumns.reservedQuantity && <TableCell><Skeleton variant="text" width="50%" /></TableCell>}
                        {visibleColumns.availableQuantity && <TableCell><Skeleton variant="text" width="50%" /></TableCell>}
                        {visibleColumns.status && <TableCell><Skeleton variant="rectangular" width={60} height={24} /></TableCell>}
                        {visibleColumns.location && <TableCell><Skeleton variant="text" width="60%" /></TableCell>}
                        {visibleColumns.actions && (
                          <TableCell align="right">
                            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                              <Skeleton variant="circular" width={24} height={24} />
                              <Skeleton variant="circular" width={24} height={24} />
                              <Skeleton variant="circular" width={24} height={24} />
                              <Skeleton variant="circular" width={24} height={24} />
                            </Box>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Fade>
          ) : filteredItems.length === 0 ? (
            <Fade in={!mainTableLoading} timeout={300}>
              <Typography variant="body1" align="center">
                {t('inventory.states.noItemsFound')}
              </Typography>
            </Fade>
          ) : (
            <Fade in={showContent} timeout={300}>
              <div>
                <TableContainer component={Paper} sx={{ mt: 3, transition: 'all 0.2s ease-in-out' }}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        {visibleColumns.name && (
                          <TableCell onClick={() => handleTableSort('name')} style={{ cursor: 'pointer' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                              {t('inventory.states.table.sku')}
                              {tableSort.field === 'name' && (
                                <ArrowDropUpIcon 
                                  sx={{ 
                                    transform: tableSort.order === 'desc' ? 'rotate(180deg)' : 'none',
                                    transition: 'transform 0.2s'
                                  }} 
                                />
                              )}
                            </Box>
                          </TableCell>
                        )}
                        {visibleColumns.category && (
                          <TableCell onClick={() => handleTableSort('category')} style={{ cursor: 'pointer' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                              {t('inventory.states.table.category')}
                              {tableSort.field === 'category' && (
                                <ArrowDropUpIcon 
                                  sx={{ 
                                    transform: tableSort.order === 'desc' ? 'rotate(180deg)' : 'none',
                                    transition: 'transform 0.2s'
                                  }} 
                                />
                              )}
                            </Box>
                          </TableCell>
                        )}
                        {visibleColumns.casNumber && (
                          <TableCell onClick={() => handleTableSort('casNumber')} style={{ cursor: 'pointer' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                              {t('inventory.states.table.casNumber')}
                              {tableSort.field === 'casNumber' && (
                                <ArrowDropUpIcon 
                                  sx={{ 
                                    transform: tableSort.order === 'desc' ? 'rotate(180deg)' : 'none',
                                    transition: 'transform 0.2s'
                                  }} 
                                />
                              )}
                            </Box>
                          </TableCell>
                        )}
                        {visibleColumns.barcode && (
                          <TableCell onClick={() => handleTableSort('barcode')} style={{ cursor: 'pointer' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                              {t('inventory.states.table.barcode')}
                              {tableSort.field === 'barcode' && (
                                <ArrowDropUpIcon 
                                  sx={{ 
                                    transform: tableSort.order === 'desc' ? 'rotate(180deg)' : 'none',
                                    transition: 'transform 0.2s'
                                  }} 
                                />
                              )}
                            </Box>
                          </TableCell>
                        )}
                        {visibleColumns.totalQuantity && (
                          <TableCell onClick={() => handleTableSort('totalQuantity')} style={{ cursor: 'pointer' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                              {t('inventory.states.table.totalQuantity')}
                              {tableSort.field === 'totalQuantity' && (
                                <ArrowDropUpIcon 
                                  sx={{ 
                                    transform: tableSort.order === 'desc' ? 'rotate(180deg)' : 'none',
                                    transition: 'transform 0.2s'
                                  }} 
                                />
                              )}
                            </Box>
                          </TableCell>
                        )}
                        {visibleColumns.reservedQuantity && (
                          <TableCell onClick={() => handleTableSort('reservedQuantity')} style={{ cursor: 'pointer' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                              {t('inventory.states.table.reservedQuantity')}
                              {tableSort.field === 'reservedQuantity' && (
                                <ArrowDropUpIcon 
                                  sx={{ 
                                    transform: tableSort.order === 'desc' ? 'rotate(180deg)' : 'none',
                                    transition: 'transform 0.2s'
                                  }} 
                                />
                              )}
                            </Box>
                          </TableCell>
                        )}
                        {visibleColumns.availableQuantity && (
                          <TableCell onClick={() => handleTableSort('availableQuantity')} style={{ cursor: 'pointer' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                              {t('inventory.states.table.availableQuantity')}
                              {tableSort.field === 'availableQuantity' && (
                                <ArrowDropUpIcon 
                                  sx={{ 
                                    transform: tableSort.order === 'desc' ? 'rotate(180deg)' : 'none',
                                    transition: 'transform 0.2s'
                                  }} 
                                />
                              )}
                            </Box>
                          </TableCell>
                        )}
                        {visibleColumns.status && (
                          <TableCell onClick={() => handleTableSort('status')} style={{ cursor: 'pointer' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                              {t('inventory.states.table.status')}
                              {tableSort.field === 'status' && (
                                <ArrowDropUpIcon 
                                  sx={{ 
                                    transform: tableSort.order === 'desc' ? 'rotate(180deg)' : 'none',
                                    transition: 'transform 0.2s'
                                  }} 
                                />
                              )}
                            </Box>
                          </TableCell>
                        )}
                        {visibleColumns.location && (
                          <TableCell onClick={() => handleTableSort('location')} style={{ cursor: 'pointer' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                              {t('inventory.states.table.location')}
                              {tableSort.field === 'location' && (
                                <ArrowDropUpIcon 
                                  sx={{ 
                                    transform: tableSort.order === 'desc' ? 'rotate(180deg)' : 'none',
                                    transition: 'transform 0.2s'
                                  }} 
                                />
                              )}
                            </Box>
                          </TableCell>
                        )}
                        {visibleColumns.actions && <TableCell align="right">{t('inventory.states.table.actions')}</TableCell>}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredItems.map((item, index) => {
                        // Oblicz ilość dostępną (całkowita - zarezerwowana)
                        const bookedQuantity = item.bookedQuantity || 0;
                        const availableQuantity = item.quantity - bookedQuantity;
                        
                        return (
                          <Grow
                            key={item.id}
                            in={showContent}
                            timeout={100 + (index * 15)}
                            style={{ transformOrigin: '0 0 0' }}
                          >
                            <TableRow 
                              sx={{ 
                                transition: 'all 0.08s ease-in-out',
                                '&:hover': {
                                  backgroundColor: 'action.hover',
                                  transform: 'translateX(1px)'
                                }
                              }}
                            >
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
                              {visibleColumns.casNumber && (
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                                  {item.casNumber ? (
                                    <Typography variant="body2" sx={{ color: 'text.primary' }}>
                                      {item.casNumber}
                                    </Typography>
                                  ) : (
                                    <Typography variant="body2" color="text.secondary">-</Typography>
                                  )}
                                </TableCell>
                              )}
                              {visibleColumns.barcode && (
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                                  {item.barcode ? (
                                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                      <QrCodeIcon sx={{ mr: 0.5, color: 'text.secondary', fontSize: '1rem' }} />
                                      {item.barcode}
                                    </Box>
                                  ) : (
                                    <Typography variant="body2" color="text.secondary">-</Typography>
                                  )}
                                </TableCell>
                              )}
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
                                    sx={{ 
                                      cursor: bookedQuantity > 0 ? 'pointer' : 'default',
                                      transition: 'color 0.2s ease-in-out'
                                    }}
                                    onClick={bookedQuantity > 0 ? () => handleShowReservations(item) : undefined}
                                  >
                                    {bookedQuantity} {item.unit}
                                    {bookedQuantity > 0 && (
                                      <Tooltip title={t('inventory.states.clickToViewReservations')}>
                                        <ReservationIcon 
                                          fontSize="small" 
                                          sx={{ 
                                            ml: 1,
                                            transition: 'transform 0.2s ease-in-out',
                                            '&:hover': { transform: 'scale(1.1)' }
                                          }} 
                                        />
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
                                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                                    <IconButton 
                                      component={RouterLink} 
                                      to={`/inventory/${item.id}`}
                                      color="secondary"
                                      title={t('inventory.states.actions.details')}
                                      sx={{ 
                                        transition: 'all 0.15s ease-in-out',
                                        '&:hover': { transform: 'scale(1.1)' }
                                      }}
                                    >
                                      <InfoIcon />
                                    </IconButton>
                                    <IconButton 
                                      component={RouterLink} 
                                      to={`/inventory/${item.id}/receive`}
                                      color="success"
                                      title={t('inventory.states.actions.receive')}
                                      sx={{ 
                                        transition: 'all 0.15s ease-in-out',
                                        '&:hover': { transform: 'scale(1.1)' }
                                      }}
                                    >
                                      <ReceiveIcon />
                                    </IconButton>
                                    <IconButton 
                                      component={RouterLink} 
                                      to={`/inventory/${item.id}/issue`}
                                      color="warning"
                                      title={t('inventory.states.actions.issue')}
                                      sx={{ 
                                        transition: 'all 0.15s ease-in-out',
                                        '&:hover': { transform: 'scale(1.1)' }
                                      }}
                                    >
                                      <IssueIcon />
                                    </IconButton>
                                    <IconButton
                                      onClick={(e) => handleMenuOpen(e, item)}
                                      color="primary"
                                      title={t('inventory.states.actions.moreActions')}
                                      sx={{ 
                                        transition: 'all 0.15s ease-in-out',
                                        '&:hover': { transform: 'scale(1.1)' }
                                      }}
                                    >
                                      <MoreVertIcon />
                                    </IconButton>
                                  </Box>
                                </TableCell>
                              )}
                            </TableRow>
                          </Grow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>

                {/* Dodaj kontrolki paginacji z animacją */}
                <Fade in={showContent} timeout={400}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Typography variant="body2" sx={{ mr: 2 }}>
                        {t('inventory.states.pagination.itemsPerPage')}:
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
                      {t('inventory.states.pagination.showing', { shown: filteredItems.length, total: totalItems })}
                    </Typography>
                  </Box>
                </Fade>
              </div>
            </Fade>
          )}
          
          {/* Menu konfiguracji kolumn */}
          <Menu
            anchorEl={columnMenuAnchor}
            open={Boolean(columnMenuAnchor)}
            onClose={handleColumnMenuClose}
          >
            <MenuItem onClick={() => toggleColumnVisibility('name')}>
              <Checkbox checked={visibleColumns.name} />
              <ListItemText primary={t('inventory.states.table.sku')} />
            </MenuItem>
            <MenuItem onClick={() => toggleColumnVisibility('category')}>
              <Checkbox checked={visibleColumns.category} />
              <ListItemText primary={t('inventory.states.table.category')} />
            </MenuItem>
            <MenuItem onClick={() => toggleColumnVisibility('casNumber')}>
              <Checkbox checked={visibleColumns.casNumber} />
              <ListItemText primary={t('inventory.states.table.casNumber')} />
            </MenuItem>
            <MenuItem onClick={() => toggleColumnVisibility('barcode')}>
              <Checkbox checked={visibleColumns.barcode} />
              <ListItemText primary={t('inventory.states.table.barcode')} />
            </MenuItem>
            <MenuItem onClick={() => toggleColumnVisibility('totalQuantity')}>
              <Checkbox checked={visibleColumns.totalQuantity} />
              <ListItemText primary={t('inventory.states.table.totalQuantity')} />
            </MenuItem>
            <MenuItem onClick={() => toggleColumnVisibility('reservedQuantity')}>
              <Checkbox checked={visibleColumns.reservedQuantity} />
              <ListItemText primary={t('inventory.states.table.reservedQuantity')} />
            </MenuItem>
            <MenuItem onClick={() => toggleColumnVisibility('availableQuantity')}>
              <Checkbox checked={visibleColumns.availableQuantity} />
              <ListItemText primary={t('inventory.states.table.availableQuantity')} />
            </MenuItem>
            <MenuItem onClick={() => toggleColumnVisibility('status')}>
              <Checkbox checked={visibleColumns.status} />
              <ListItemText primary={t('inventory.states.table.status')} />
            </MenuItem>
            <MenuItem onClick={() => toggleColumnVisibility('location')}>
              <Checkbox checked={visibleColumns.location} />
              <ListItemText primary={t('inventory.states.table.location')} />
            </MenuItem>
            <MenuItem onClick={() => toggleColumnVisibility('actions')}>
              <Checkbox checked={visibleColumns.actions} />
              <ListItemText primary={t('inventory.states.table.actions')} />
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
                  {t('inventory.states.locations.newLocation')}
            </Button>
          </Box>

              <TableContainer component={Paper}>
                <Table sx={{ minWidth: 650 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('inventory.states.locations.name')}</TableCell>
                      <TableCell>{t('inventory.states.locations.address')}</TableCell>
                      <TableCell>{t('inventory.states.locations.description')}</TableCell>
                      <TableCell align="right">{t('inventory.states.table.actions')}</TableCell>
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
                          {t('inventory.states.locations.noLocations')}
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
                  &larr; {t('inventory.states.locations.backToLocations')}
                </Button>
                <Typography variant="h6">
                  {t('inventory.states.locations.itemsInLocation', { locationName: selectedWarehouseForView.name })}
                </Typography>
              </Box>

              <Paper sx={{ mb: 3, p: 2 }}>
                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={12} sm={6} md={4}>
                    <TextField
                      fullWidth
                      variant="outlined"
                      placeholder={t('inventory.states.locations.searchItems')}
                      value={warehouseSearchTerm}
                      onChange={handleWarehouseSearchTermChange}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <SearchIcon />
                          </InputAdornment>
                        ),
                        endAdornment: warehouseSearchTerm && (
                          <InputAdornment position="end">
                            <IconButton size="small" onClick={clearWarehouseSearch}>
                              <ClearIcon />
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={8}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                      <Typography variant="body2" color="textSecondary">
                        {t('inventory.states.locations.foundItems', { count: warehouseItemsTotalCount })}
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>
              </Paper>

              <TableContainer component={Paper}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>
                        <TableSortLabel
                          active={warehouseItemsSort.field === 'name'}
                          direction={warehouseItemsSort.field === 'name' ? warehouseItemsSort.order : 'asc'}
                          onClick={() => handleWarehouseTableSort('name')}
                        >
                          {t('inventory.states.table.sku')}
                        </TableSortLabel>
                      </TableCell>
                      <TableCell>
                        <TableSortLabel
                          active={warehouseItemsSort.field === 'category'}
                          direction={warehouseItemsSort.field === 'category' ? warehouseItemsSort.order : 'asc'}
                          onClick={() => handleWarehouseTableSort('category')}
                        >
                          {t('inventory.states.table.category')}
                        </TableSortLabel>
                      </TableCell>
                      <TableCell>{t('inventory.states.locations.unit')}</TableCell>
                      <TableCell align="right">
                        <TableSortLabel
                          active={warehouseItemsSort.field === 'totalQuantity'}
                          direction={warehouseItemsSort.field === 'totalQuantity' ? warehouseItemsSort.order : 'asc'}
                          onClick={() => handleWarehouseTableSort('totalQuantity')}
                        >
                          {t('inventory.states.locations.quantity')}
                        </TableSortLabel>
                      </TableCell>
                      <TableCell align="right">{t('inventory.states.table.actions')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {warehouseItemsLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} align="center">
                          <CircularProgress />
                        </TableCell>
                      </TableRow>
                    ) : warehouseItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} align="center">
                          {t('inventory.states.locations.noItemsInLocation')}
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
                          <TableCell align="right">{formatQuantity(item.quantity) || 0}</TableCell>
                          <TableCell align="right">
                            <Tooltip title={t('inventory.states.locations.showBatches')}>
                              <IconButton 
                                color="info"
                                onClick={() => handleShowItemBatches(item)}
                              >
                                <ViewListIcon />
                              </IconButton>
                            </Tooltip>
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
                <TablePagination
                  rowsPerPageOptions={[5, 10, 25, 50]}
                  component="div"
                  count={warehouseItemsTotalCount}
                  rowsPerPage={warehouseItemsPageSize}
                  page={warehouseItemsPage - 1} // TablePagination używa indeksu 0, a my używamy indeksu 1
                  onPageChange={handleWarehousePageChange}
                  onRowsPerPageChange={handleWarehousePageSizeChange}
                  labelRowsPerPage={t('inventory.states.pagination.itemsPerPage') + ':'}
                  labelDisplayedRows={({ from, to, count }) => t('inventory.states.pagination.displayedRows', { from, to, count })}
                />
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
              {t('inventory.states.groups.newGroup')}
            </Button>
          </Box>

          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>{t('inventory.states.groups.groupName')}</TableCell>
                  <TableCell>{t('common.description')}</TableCell>
                  <TableCell>{t('inventory.states.groups.itemCount')}</TableCell>
                  <TableCell align="right">{t('inventory.states.table.actions')}</TableCell>
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
                      {t('inventory.states.groups.noGroups')}
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

      {currentTab === 3 && (
        <>
          <Box sx={{ mb: 3 }}>
            <Typography variant="h6" component="h2" gutterBottom>
              {t('inventory.states.reservationsTab.title')}
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {t('inventory.states.reservationsTab.description')}
            </Typography>
          </Box>
          
          <Box sx={{ display: 'flex', mb: 2, gap: 2 }}>
            <TextField
              label={t('inventory.states.reservationsTab.filterByMo')}
              variant="outlined"
              size="small"
              fullWidth
              value={moFilter}
              onChange={handleMoFilterChange}
              InputProps={{
                startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} />,
              }}
            />
            <Button 
              variant="contained" 
              color="primary"
              onClick={() => {
                handleUpdateReservationTasks().then(() => {
                  fetchAllReservations();
                });
              }}
              disabled={updatingTasks}
              startIcon={updatingTasks ? <CircularProgress size={24} /> : <HistoryIcon />}
            >
              {t('inventory.states.reservationsTab.updateTasks')}
            </Button>
            <Button 
              variant="outlined" 
              color="secondary"
              onClick={() => {
                handleCleanupDeletedTaskReservations().then(() => {
                  fetchAllReservations();
                });
              }}
              disabled={cleaningReservations}
              startIcon={cleaningReservations ? <CircularProgress size={24} /> : <DeleteForeverIcon />}
            >
              {t('inventory.states.reservationsTab.removeOutdated')}
            </Button>
          </Box>

          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>{t('inventory.states.reservationsTab.moNumber')}</TableCell>
                  <TableCell>{t('inventory.states.reservationsTab.taskName')}</TableCell>
                  <TableCell>{t('inventory.states.table.sku')}</TableCell>
                  <TableCell>{t('inventory.states.reservationsTab.reservedQuantity')}</TableCell>
                  <TableCell>{t('inventory.states.reservationsTab.batchNumber')}</TableCell>
                  <TableCell>{t('inventory.states.reservationsTab.reservationDate')}</TableCell>
                  <TableCell align="right">{t('inventory.states.table.actions')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loadingAllReservations ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center">
                      <CircularProgress />
                    </TableCell>
                  </TableRow>
                ) : filteredAllReservations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center">
                      <Typography>
                        {moFilter ? t('inventory.states.reservationsTab.noFilterResults') : t('inventory.states.reservationsTab.noReservations')}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAllReservations.map((reservation) => (
                    <TableRow key={reservation.id}>
                      <TableCell>
                        <Typography variant="body2" component="div">
                          {reservation.taskNumber || t('inventory.states.reservationsTab.noMoNumber')}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" component="div">
                          {reservation.taskName || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Link component={RouterLink} to={`/inventory/${reservation.itemId}`}>
                          {reservation.itemName}
                        </Link>
                      </TableCell>
                      <TableCell>{reservation.quantity}</TableCell>
                      <TableCell>{reservation.batchNumber || '-'}</TableCell>
                      <TableCell>
                        {reservation.createdAtDate ? formatDate(reservation.createdAtDate) : '-'}
                      </TableCell>
                      <TableCell align="right">
                        <IconButton
                          color="primary"
                          onClick={() => {
                            // Przygotuj dane do edycji rezerwacji
                            const item = {
                              id: reservation.itemId,
                              name: reservation.itemName
                            };
                            setSelectedItem(item);
                            handleEditReservation(reservation);
                          }}
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          color="error"
                          onClick={() => handleDeleteReservation(reservation.id)}
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
          {groupDialogMode === 'add' ? t('inventory.states.groups.newGroup') : t('inventory.states.groups.editGroup')}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label={t('inventory.states.groups.groupName')}
                  name="name"
                  value={groupFormData.name}
                  onChange={(e) => setGroupFormData(prev => ({ ...prev, name: e.target.value }))}
                  required
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label={t('inventory.states.groups.descriptionOptional')}
                  name="description"
                  value={groupFormData.description}
                  onChange={(e) => setGroupFormData(prev => ({ ...prev, description: e.target.value }))}
                  multiline
                  rows={2}
                />
              </Grid>
              <Grid item xs={12}>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                  {t('inventory.states.groups.itemsInGroup', { count: groupItems.length })}
                </Typography>
                {groupItems.length > 0 ? (
                  <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>{t('inventory.states.table.sku')}</TableCell>
                          <TableCell>{t('inventory.states.table.category')}</TableCell>
                          <TableCell align="right">{t('inventory.states.table.actions')}</TableCell>
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
                  <Box sx={{ p: 2, textAlign: 'center', bgcolor: 'background.paper', borderRadius: 1, mb: 2, border: 1, borderColor: 'divider' }}>
                    <Typography variant="body2" color="text.secondary">
                      {t('inventory.states.groups.noItemsInGroup')}
                    </Typography>
                  </Box>
                )}
                
                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                  {t('inventory.states.groups.availableItems')}
                </Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300, overflowY: 'auto' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>{t('inventory.states.table.sku')}</TableCell>
                        <TableCell>{t('inventory.states.table.category')}</TableCell>
                        <TableCell align="right">{t('inventory.states.table.actions')}</TableCell>
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
          <Button onClick={handleCloseGroupDialog}>{t('common.cancel')}</Button>
          <Button 
            onClick={handleSubmitGroup} 
            variant="contained" 
            color="primary"
            disabled={savingGroup || !groupFormData.name}
          >
            {savingGroup ? <CircularProgress size={24} /> : t('common.save')}
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
          {t('inventory.states.reservations.title', { itemName: selectedItem?.name })}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, mt: 1 }}>
            <Typography variant="subtitle1">
              {t('inventory.states.reservations.totalReserved', { 
                quantity: reservations.reduce((sum, res) => sum + res.quantity, 0), 
                unit: selectedItem?.unit 
              })}
            </Typography>
            <Box sx={{ display: 'flex', gap: 2 }}>
              {reservations.filter(r => !r.taskNumber && r.referenceId).length > 0 && (
                <Typography variant="body2" sx={{ color: 'warning.main' }}>
                  {t('inventory.states.reservations.missingMoNumbers')}
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
                {updatingTasks ? t('inventory.states.reservations.updating') : t('inventory.states.reservations.updateTaskData')}
              </Button>
              <Button 
                variant="outlined" 
                color="error" 
                size="small"
                onClick={handleCleanupDeletedTaskReservations}
                disabled={cleaningReservations}
                startIcon={cleaningReservations ? <CircularProgress size={20} /> : <DeleteForeverIcon />}
              >
                {cleaningReservations ? t('inventory.states.reservations.cleaning') : t('inventory.states.reservations.removeDeletedMoReservations')}
              </Button>
            </Box>
          </Box>
          
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>{t('inventory.states.reservations.date')}</TableCell>
                  <TableCell>{t('inventory.states.reservations.user')}</TableCell>
                  <TableCell>{t('inventory.states.reservations.quantity')}</TableCell>
                  <TableCell>{t('inventory.states.reservations.batch')}</TableCell>
                  <TableCell>{t('inventory.states.reservations.status')}</TableCell>
                  <TableCell>{t('inventory.states.reservations.task')}</TableCell>
                  <TableCell>{t('inventory.states.table.actions')}</TableCell>
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
                        label={reservation.fulfilled ? t('inventory.states.reservations.fulfilled') : t('inventory.states.reservations.active')} 
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
                        t('inventory.states.reservations.noTask')
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
          <Button onClick={handleCloseReservationDialog}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog do dodawania/edycji lokalizacji */}
      <Dialog open={openWarehouseDialog} onClose={handleCloseWarehouseDialog} fullWidth>
        <DialogTitle>
          {dialogMode === 'add' ? t('inventory.states.locations.addNewLocation') : t('inventory.states.locations.editLocation')}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                name="name"
                label={t('inventory.states.locations.locationName')}
                value={warehouseFormData.name}
                onChange={handleWarehouseFormChange}
                fullWidth
                required
                error={!warehouseFormData.name.trim()}
                helperText={!warehouseFormData.name.trim() ? t('inventory.states.locations.nameRequired') : ''}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                name="address"
                label={t('inventory.states.locations.address')}
                value={warehouseFormData.address}
                onChange={handleWarehouseFormChange}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                name="description"
                label={t('inventory.states.locations.description')}
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
          <Button onClick={handleCloseWarehouseDialog}>{t('common.cancel')}</Button>
          <Button
            onClick={handleSubmitWarehouse}
            variant="contained"
            color="primary"
            disabled={savingWarehouse || !warehouseFormData.name.trim()}
          >
            {savingWarehouse ? t('inventory.states.locations.saving') : t('common.save')}
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
          <ListItemText>{t('inventory.states.actions.history')}</ListItemText>
        </MenuItem>
        <MenuItem 
          component={RouterLink} 
          to={selectedItem ? `/inventory/${selectedItem.id}/batches` : '#'}
          onClick={handleMenuClose}
        >
          <ListItemIcon>
            <ViewListIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>{t('inventory.states.actions.batches')}</ListItemText>
        </MenuItem>
        <MenuItem 
          component={RouterLink} 
          to={selectedItem ? `/inventory/${selectedItem.id}/edit` : '#'}
          onClick={handleMenuClose}
        >
          <ListItemIcon>
            <EditIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>{t('inventory.states.actions.edit')}</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => {
          if (selectedItem) handleDelete(selectedItem.id);
          handleMenuClose();
        }}>
          <ListItemIcon>
            <DeleteIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText sx={{ color: 'error.main' }}>{t('inventory.states.actions.delete')}</ListItemText>
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

      {/* Dialog wyświetlający partie dla danego przedmiotu w lokalizacji */}
      <Dialog
        open={batchesDialogOpen}
        onClose={handleCloseBatchesDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {t('inventory.states.locations.batchesFor', { 
            itemName: selectedItem?.name, 
            locationName: selectedWarehouseForView?.name 
          })}
        </DialogTitle>
        <DialogContent>
          {loadingBatches ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          ) : selectedItemBatches.length === 0 ? (
            <Typography variant="body1" align="center" sx={{ py: 3 }}>
              {t('inventory.states.locations.noBatchesFound')}
            </Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>{t('inventory.states.locations.batchNumber')}</TableCell>
                    <TableCell>{t('inventory.states.locations.quantity')}</TableCell>
                    <TableCell>{t('inventory.states.locations.expiryDate')}</TableCell>
                    <TableCell>{t('inventory.states.locations.supplier')}</TableCell>
                    <TableCell>{t('inventory.states.locations.receivedDate')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {selectedItemBatches.map((batch) => (
                    <TableRow key={batch.id}>
                      <TableCell>{batch.batchNumber || batch.lotNumber || '-'}</TableCell>
                      <TableCell>{batch.quantity} {selectedItem?.unit || 'szt.'}</TableCell>
                      <TableCell>
                        {batch.expiryDate ? formatDate(batch.expiryDate) : '-'}
                      </TableCell>
                      <TableCell>
                        {batch.purchaseOrderDetails?.supplier?.name || 
                         batch.supplier?.name || '-'}
                      </TableCell>
                      <TableCell>
                        {batch.receivedDate ? formatDate(batch.receivedDate) : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseBatchesDialog}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog generatora CoA */}
      <CoAGeneratorDialog
        open={coaDialogOpen}
        onClose={handleCloseCoADialog}
        onGenerate={handleCoAGenerated}
      />

    </div>
  );
};

export default InventoryList;
