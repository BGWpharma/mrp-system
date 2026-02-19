// src/components/inventory/InventoryList.js
import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  TableChart as CsvIcon,
  Clear as ClearIcon,
  Refresh as RefreshIcon,
  Upload as UploadIcon,
  Layers as LayersIcon,
  Calculate as CalculateIcon,
  Archive as ArchiveIcon,
  Unarchive as UnarchiveIcon
} from '@mui/icons-material';
import FormControlLabel from '@mui/material/FormControlLabel';
import { getAllInventoryItems, getInventoryItemsOptimized, clearInventoryItemsCache, deleteInventoryItem, getExpiringBatches, getExpiredBatches, getItemTransactions, getAllWarehouses, createWarehouse, updateWarehouse, deleteWarehouse, getItemBatches, updateReservation, updateReservationTasks, cleanupDeletedTaskReservations, deleteReservation, getInventoryItemById, recalculateAllInventoryQuantities, cleanupMicroReservations, archiveInventoryItem, unarchiveInventoryItem } from '../../services/inventory';
import { getBatchesWithFilters } from '../../services/inventory/batchService';
import { convertTimestampToDate, isDefaultDate } from '../../services/inventory/utils/formatters';
import { exportToExcel } from '../../utils/exportUtils';
import { useNotification } from '../../hooks/useNotification';
import { formatDate, formatQuantity } from '../../utils/formatters';
import { toast } from 'react-hot-toast';
import { exportToCSV } from '../../utils/exportUtils';
import { useAuth } from '../../hooks/useAuth';
import LabelDialog from './LabelDialog';
import EditReservationDialog from './EditReservationDialog';
import { doc, getDoc, updateDoc, serverTimestamp, collection, getDocs, addDoc, deleteDoc, query, orderBy, limit, where } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { useColumnPreferences } from '../../contexts/ColumnPreferencesContext';
import { useInventoryListState } from '../../contexts/InventoryListStateContext';
import { INVENTORY_CATEGORIES } from '../../utils/constants';
import { useTranslation } from '../../hooks/useTranslation';
import { useServiceData } from '../../hooks/useServiceData';
import { getAllCustomers, CUSTOMERS_CACHE_KEY } from '../../services/customerService';
// ✅ OPTYMALIZACJA: Import wspólnych stylów MUI
import { 
  flexCenter, 
  flexBetween,
  loadingContainer,
  mb1,
  mb2,
  mb3,
  mt1,
  mt2,
  mr1,
  p2
} from '../../styles/muiCommonStyles';

// Importy komponentów dla zakładek
import ExpiryDatesPage from '../../pages/Inventory/ExpiryDatesPage';
import SuppliersPage from '../../pages/Suppliers/SuppliersPage';
import StocktakingPage from '../../pages/Inventory/StocktakingPage';


// Definicje stałych
const INVENTORY_TRANSACTIONS_COLLECTION = 'inventoryTransactions';

const InventoryList = () => {
  const { t } = useTranslation('inventory');
  const [inventoryItems, setInventoryItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
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
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);
  const [warehouseItemsTotalCount, setWarehouseItemsTotalCount] = useState(0);
  const [warehouseItemsTotalPages, setWarehouseItemsTotalPages] = useState(1);
  const warehouseSearchTermRef = useRef(null);
  
  // Dodaję stany dla zakładki Rezerwacje
  const [allReservations, setAllReservations] = useState([]);
  const [filteredAllReservations, setFilteredAllReservations] = useState([]);
  const [loadingAllReservations, setLoadingAllReservations] = useState(false);
  
  // Stany dla dialogu importu CSV
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState(null);
  const [importWarnings, setImportWarnings] = useState([]);
  
  // Stany dla dialogu wyboru kategorii przed eksportem CSV
  const [exportCategoryDialogOpen, setExportCategoryDialogOpen] = useState(false);
  const [selectedExportCategories, setSelectedExportCategories] = useState([]);
  
  // Stany dla klientów przypisanych do pozycji
  const { data: customers } = useServiceData(CUSTOMERS_CACHE_KEY, getAllCustomers, { ttl: 10 * 60 * 1000 });
  const [customerFilter, setCustomerFilter] = useState('');
  
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

  // Filtrowanie pozycji po przypisanym kliencie i archiwizacji (front-end)
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

  // Helper: mapa ID klienta -> nazwa
  const customerNameMap = useMemo(() => {
    const map = {};
    customers.forEach(c => { map[c.id] = c.name; });
    return map;
  }, [customers]);

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
    if (currentTab === 5) {
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
      
      // Batch fetch tasków — chunki po 30 zamiast N+1 getDoc
      const existingTasksMap = {};
      const taskDataMap = {};
      
      if (uniqueTaskIds.length > 0) {
        const taskChunks = [];
        for (let i = 0; i < uniqueTaskIds.length; i += 30) {
          taskChunks.push(uniqueTaskIds.slice(i, i + 30));
        }
        
        const taskResults = await Promise.all(
          taskChunks.map(chunk => {
            const q = query(
              collection(db, 'productionTasks'),
              where('__name__', 'in', chunk)
            );
            return getDocs(q);
          })
        );
        
        taskResults.forEach(snapshot => {
          snapshot.docs.forEach(docSnap => {
            existingTasksMap[docSnap.id] = true;
            taskDataMap[docSnap.id] = docSnap.data();
          });
        });
        
        uniqueTaskIds.forEach(id => {
          if (!(id in existingTasksMap)) {
            existingTasksMap[id] = false;
          }
        });
      }
      
      // Filtruj rezerwacje - usuń te, których zadania nie istnieją
      bookingTransactions = bookingTransactions.filter(transaction => {
        if (!transaction.referenceId) return true;
        return existingTasksMap[transaction.referenceId] !== false;
      });
      
      // Sprawdź, czy są rezerwacje bez numerów MO
      const reservationsWithoutTasks = bookingTransactions.filter(
        transaction => !transaction.taskNumber && transaction.referenceId && existingTasksMap[transaction.referenceId]
      );
      
      // Uzupełnij MO korzystając z taskDataMap (bez dodatkowych getDoc)
      if (reservationsWithoutTasks.length > 0) {
        console.log(`Znaleziono ${reservationsWithoutTasks.length} rezerwacji bez numerów MO. Próbuję zaktualizować...`);
        
        for (const reservation of reservationsWithoutTasks) {
          try {
            const taskData = taskDataMap[reservation.referenceId];
            if (taskData) {
              const taskName = taskData.name || '';
              const taskNumber = taskData.moNumber || taskData.number || '';
              const clientName = taskData.clientName || '';
              const clientId = taskData.clientId || '';
              
              if (taskNumber) {
                const transactionRef = doc(db, INVENTORY_TRANSACTIONS_COLLECTION, reservation.id);
                await updateDoc(transactionRef, {
                  taskName,
                  taskNumber,
                  clientName,
                  clientId,
                  updatedAt: serverTimestamp()
                });
                
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

  const handleArchiveItem = async (item) => {
    try {
      if (item.archived) {
        await unarchiveInventoryItem(item.id);
        showSuccess(t('common:common.unarchiveSuccess'));
      } else {
        await archiveInventoryItem(item.id);
        showSuccess(t('common:common.archiveSuccess'));
      }
      fetchInventoryItems();
    } catch (error) {
      showError(error.message);
    }
  };

  const handleMenuOpen = (event, item) => {
    setAnchorEl(event.currentTarget);
    setSelectedItem(item);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setSelectedItem(null);
  };

  // Funkcja do przeliczania ilości pojedynczej pozycji magazynowej
  const handleRecalculateItemQuantity = async () => {
    if (!selectedItem) return;
    
    try {
      setLoading(true);
      const { recalculateItemQuantity } = await import('../../services/inventory/inventoryOperationsService');
      
      const oldQuantity = selectedItem.quantity;
      const newQuantity = await recalculateItemQuantity(selectedItem.id);
      
      showSuccess(`Przeliczono ilość dla "${selectedItem.name}": ${oldQuantity} → ${newQuantity}`);
      
      // Odśwież listę pozycji
      await fetchInventoryItems(tableSort.field, tableSort.order);
      
      handleMenuClose();
    } catch (error) {
      console.error('Błąd podczas przeliczania ilości:', error);
      showError(`Nie udało się przeliczać ilości: ${error.message}`);
    } finally {
      setLoading(false);
    }
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
        showSuccess(t('inventory:states.reservationsTab.noReservationsToClean'));
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

  // Funkcja otwierająca dialog wyboru kategorii przed eksportem CSV
  const openExportCategoryDialog = () => {
    // Domyślnie zaznacz wszystkie kategorie
    setSelectedExportCategories([...Object.values(INVENTORY_CATEGORIES)]);
    setExportCategoryDialogOpen(true);
  };

  // Funkcja do obsługi zaznaczenia/odznaczenia kategorii
  const handleExportCategoryToggle = (category) => {
    setSelectedExportCategories(prev => {
      if (prev.includes(category)) {
        return prev.filter(c => c !== category);
      } else {
        return [...prev, category];
      }
    });
  };

  // Funkcja do zaznaczenia/odznaczenia wszystkich kategorii
  const handleSelectAllCategories = () => {
    if (selectedExportCategories.length === Object.values(INVENTORY_CATEGORIES).length) {
      setSelectedExportCategories([]);
    } else {
      setSelectedExportCategories([...Object.values(INVENTORY_CATEGORIES)]);
    }
  };

  // Funkcja do generowania raportu CSV ze stanów magazynowych z wybranymi kategoriami
  const generateCsvReport = async () => {
    try {
      setExportCategoryDialogOpen(false);
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

      let itemsToExport = Array.isArray(allItems.items) ? allItems.items : allItems;

      // Filtruj pozycje według wybranych kategorii
      if (selectedExportCategories.length > 0 && selectedExportCategories.length < Object.values(INVENTORY_CATEGORIES).length) {
        itemsToExport = itemsToExport.filter(item => 
          selectedExportCategories.includes(item.category)
        );
      }

      if (itemsToExport.length === 0) {
        showError('Brak pozycji do wyeksportowania dla wybranych kategorii');
        setMainTableLoading(false);
        return;
      }

      // Pobierz wszystkie partie, aby obliczyć średnią cenę z aktywnych partii
      const filterParams = selectedWarehouse ? { warehouseId: selectedWarehouse } : {};
      const allBatches = await getBatchesWithFilters(filterParams);

      // Oblicz średnią cenę z aktywnych partii (quantity > 0) dla każdej pozycji
      const avgPriceByItemId = {};
      if (allBatches && allBatches.length > 0) {
        allBatches.forEach(batch => {
          const itemId = batch.itemId;
          const batchQuantity = batch.quantity || 0;
          const batchPrice = batch.unitPrice || 0;
          
          // Uwzględnij tylko partie z ilością > 0
          if (batchQuantity > 0) {
            if (!avgPriceByItemId[itemId]) {
              avgPriceByItemId[itemId] = { totalValue: 0, totalQuantity: 0 };
            }
            avgPriceByItemId[itemId].totalValue += batchQuantity * batchPrice;
            avgPriceByItemId[itemId].totalQuantity += batchQuantity;
          }
        });
      }

      // Przygotuj dane do eksportu
      const data = itemsToExport.map(item => {
        const bookedQuantity = Number(item.bookedQuantity) || 0;
        const availableQuantity = Number(item.quantity) - bookedQuantity;
        
        // Oblicz średnią cenę z aktywnych partii
        const priceData = avgPriceByItemId[item.id];
        const avgPriceFromActiveBatches = priceData && priceData.totalQuantity > 0
          ? (priceData.totalValue / priceData.totalQuantity).toFixed(4)
          : '-';
        
        return {
          category: item.category || '',
          sku: item.name || '', // Przenosimy name do kolumny SKU
          casNumber: item.casNumber || '',
          barcode: item.barcode || '',
          totalQuantity: (Number(item.quantity) || 0).toFixed(2),
          unit: item.unit || 'pcs.',
          reservedQuantity: bookedQuantity.toFixed(2),
          availableQuantity: availableQuantity.toFixed(2),
          avgPriceFromActiveBatches: avgPriceFromActiveBatches,
          location: item.warehouseName || '',
          minStockLevel: item.minStockLevel || '',
          maxStockLevel: item.maxStockLevel || '',
          cardboardPerPallet: item.boxesPerPallet || '',
          pcsPerCardboard: item.itemsPerBox || '',
          grossWeight: item.weight || '',
          description: item.description || ''
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
        { label: 'Avg Price from Active Batches (EUR)', key: 'avgPriceFromActiveBatches' },
        { label: 'Location', key: 'location' },
        { label: 'Min Stock Level', key: 'minStockLevel' },
        { label: 'Max Stock Level', key: 'maxStockLevel' },
        { label: 'Cardboard Per Pallet', key: 'cardboardPerPallet' },
        { label: 'Pcs Per Cardboard', key: 'pcsPerCardboard' },
        { label: 'Gross Weight (kg)', key: 'grossWeight' },
        { label: 'Description', key: 'description' }
      ];

      // Generuj CSV
      const success = exportToCSV(data, headers, `Inventory_Stock_Report_${new Date().toISOString().slice(0, 10)}`);
      if (success) {
        showSuccess(`Raport CSV został wygenerowany (${data.length} pozycji)`);
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

  // Funkcja do generowania eksportu partii CSV z dwoma arkuszami
  const generateBatchesExportCSV = async () => {
    try {
      setMainTableLoading(true);
      showSuccess('Generowanie eksportu partii...');

      // Pobierz wszystkie partie z magazynu
      const filterParams = selectedWarehouse ? { warehouseId: selectedWarehouse } : {};
      const allBatches = await getBatchesWithFilters(filterParams);

      if (!allBatches || allBatches.length === 0) {
        showError('Brak partii do wyeksportowania');
        setMainTableLoading(false);
        return;
      }

      // Pobierz pozycje magazynowe
      const allItems = await getAllInventoryItems(
        selectedWarehouse || null,
        null,
        null,
        null,
        null,
        'name',
        'asc'
      );

      const itemsArray = Array.isArray(allItems.items) ? allItems.items : allItems;
      
      // Stwórz mapę pozycji dla szybkiego dostępu
      const itemsMap = {};
      itemsArray.forEach(item => {
        itemsMap[item.id] = item;
      });

      // ARKUSZ 1: Wszystkie partie z cenami
      const batchesData = allBatches.map(batch => {
        const item = itemsMap[batch.itemId];
        const batchValue = (batch.quantity || 0) * (batch.unitPrice || 0);
        
        return {
          itemName: item?.name || 'Unknown item',
          itemCategory: item?.category || '',
          batchNumber: batch.batchNumber || batch.lotNumber || '-',
          warehouseName: batch.warehouseName || warehouses.find(w => w.id === batch.warehouseId)?.name || '',
          quantity: (batch.quantity || 0).toFixed(4),
          unit: item?.unit || batch.unit || 'pcs',
          availableQuantity: Math.max(0, (batch.quantity || 0) - (batch.bookedQuantity || 0)).toFixed(4),
          unitPrice: batch.unitPrice ? (batch.unitPrice).toFixed(4) : '-',
          batchValue: batchValue.toFixed(2),
          baseUnitPrice: batch.baseUnitPrice ? (batch.baseUnitPrice).toFixed(4) : '-',
          additionalCostPerUnit: batch.additionalCostPerUnit ? (batch.additionalCostPerUnit).toFixed(4) : '-',
          expiryDate: batch.expiryDate && !isDefaultDate(convertTimestampToDate(batch.expiryDate)) 
            ? convertTimestampToDate(batch.expiryDate)?.toLocaleDateString('en-GB') 
            : '-',
          notes: batch.notes || '',
          // Wartości numeryczne do obliczeń sum
          _quantityNum: batch.quantity || 0,
          _batchValueNum: batchValue
        };
      }).sort((a, b) => {
        // Sortowanie według nazwy pozycji, potem według numeru partii
        const nameCompare = a.itemName.localeCompare(b.itemName);
        if (nameCompare !== 0) return nameCompare;
        return a.batchNumber.localeCompare(b.batchNumber);
      });

      // Oblicz sumy
      const totalQuantity = batchesData.reduce((sum, batch) => sum + batch._quantityNum, 0);
      const totalValue = batchesData.reduce((sum, batch) => sum + batch._batchValueNum, 0);

      // Dodaj wiersz z sumami
      batchesData.push({
        itemName: '--- TOTAL ---',
        itemCategory: '',
        batchNumber: '',
        warehouseName: '',
        quantity: totalQuantity.toFixed(4),
        unit: '',
        availableQuantity: '',
        unitPrice: '',
        batchValue: totalValue.toFixed(2),
        baseUnitPrice: '',
        additionalCostPerUnit: '',
        expiryDate: '',
        notes: ''
      });

      const batchesHeaders = [
        { label: 'Item Name', key: 'itemName' },
        { label: 'Category', key: 'itemCategory' },
        { label: 'Batch/LOT Number', key: 'batchNumber' },
        { label: 'Warehouse', key: 'warehouseName' },
        { label: 'Quantity', key: 'quantity' },
        { label: 'Unit', key: 'unit' },
        { label: 'Available Quantity', key: 'availableQuantity' },
        { label: 'Unit Price (EUR)', key: 'unitPrice' },
        { label: 'Total Value (qty × price) (EUR)', key: 'batchValue' },
        { label: 'Base Price (EUR)', key: 'baseUnitPrice' },
        { label: 'Additional Cost/unit (EUR)', key: 'additionalCostPerUnit' },
        { label: 'Expiry Date', key: 'expiryDate' },
        { label: 'Notes', key: 'notes' }
      ];

      // ARKUSZ 2: Pozycje magazynowe z sumą wartości partii
      const itemValuesMap = {};
      
      allBatches.forEach(batch => {
        const itemId = batch.itemId;
        const batchQuantity = batch.quantity || 0;
        const batchValue = batchQuantity * (batch.unitPrice || 0);
        
        if (!itemValuesMap[itemId]) {
          const item = itemsMap[itemId];
          itemValuesMap[itemId] = {
            itemName: item?.name || 'Unknown item',
            itemCategory: item?.category || '',
            warehouseName: item?.warehouseName || '',
            totalQuantity: 0,
            totalReservedQuantity: 0,
            totalAvailableQuantity: 0,
            batchesCount: 0,
            totalValue: 0,
            unit: item?.unit || 'pcs',
            // Dane do obliczenia średniej ceny tylko z niezużytych partii
            activeQuantity: 0,
            activeValue: 0
          };
        }
        
        itemValuesMap[itemId].totalQuantity += batchQuantity;
        itemValuesMap[itemId].totalReservedQuantity += (batch.bookedQuantity || 0);
        itemValuesMap[itemId].totalValue += batchValue;
        itemValuesMap[itemId].batchesCount += 1;
        
        // Dodaj do średniej tylko partie z ilością > 0 (niezużyte)
        if (batchQuantity > 0) {
          itemValuesMap[itemId].activeQuantity += batchQuantity;
          itemValuesMap[itemId].activeValue += batchValue;
        }
      });

      const itemValuesData = Object.values(itemValuesMap).map(item => {
        item.totalAvailableQuantity = Math.max(0, item.totalQuantity - item.totalReservedQuantity);
        // Oblicz średnią cenę tylko z niezużytych partii (quantity > 0)
        const avgPriceFromActive = item.activeQuantity > 0 
          ? (item.activeValue / item.activeQuantity) 
          : 0;
        return {
          ...item,
          totalQuantity: item.totalQuantity.toFixed(4),
          totalAvailableQuantity: item.totalAvailableQuantity.toFixed(4),
          totalValue: item.totalValue.toFixed(2),
          averageUnitPrice: item.totalQuantity > 0 
            ? (item.totalValue / item.totalQuantity).toFixed(4) 
            : '0.0000',
          avgPriceFromActiveBatches: avgPriceFromActive > 0 
            ? avgPriceFromActive.toFixed(4) 
            : '-',
          // Wartości numeryczne do obliczeń sum
          _totalQuantityNum: item.totalQuantity,
          _totalAvailableQuantityNum: item.totalAvailableQuantity,
          _totalValueNum: item.totalValue
        };
      }).sort((a, b) => a.itemName.localeCompare(b.itemName));

      // Oblicz sumy dla arkusza 2
      const sumTotalQuantity = itemValuesData.reduce((sum, item) => sum + item._totalQuantityNum, 0);
      const sumTotalAvailable = itemValuesData.reduce((sum, item) => sum + item._totalAvailableQuantityNum, 0);
      const sumTotalValue = itemValuesData.reduce((sum, item) => sum + item._totalValueNum, 0);

      // Dodaj wiersz z sumami do arkusza 2
      itemValuesData.push({
        itemName: '--- TOTAL ---',
        itemCategory: '',
        totalQuantity: sumTotalQuantity.toFixed(4),
        unit: '',
        totalAvailableQuantity: sumTotalAvailable.toFixed(4),
        batchesCount: '',
        totalValue: sumTotalValue.toFixed(2),
        averageUnitPrice: '',
        avgPriceFromActiveBatches: ''
      });

      const itemValuesHeaders = [
        { label: 'Item Name', key: 'itemName' },
        { label: 'Category', key: 'itemCategory' },
        { label: 'Total Quantity', key: 'totalQuantity' },
        { label: 'Unit', key: 'unit' },
        { label: 'Total Available', key: 'totalAvailableQuantity' },
        { label: 'Batches Count', key: 'batchesCount' },
        { label: 'Total Batches Value (EUR)', key: 'totalValue' },
        { label: 'Average Unit Price (EUR)', key: 'averageUnitPrice' },
        { label: 'Avg Price from Active Batches (EUR)', key: 'avgPriceFromActiveBatches' }
      ];

      // Utwórz arkusze dla Excel
      const worksheets = [
        {
          name: 'Inventory Batches',
          data: batchesData,
          headers: batchesHeaders
        },
        {
          name: 'Item Values',
          data: itemValuesData,
          headers: itemValuesHeaders
        }
      ];

      // Wyeksportuj do Excel
      const success = exportToExcel(
        worksheets, 
        `Batches_Export_${new Date().toISOString().slice(0, 10)}`
      );

      if (success) {
        showSuccess(`Wyeksportowano ${batchesData.length} partii i ${itemValuesData.length} pozycji`);
      } else {
        showError('Błąd podczas generowania eksportu partii');
      }
    } catch (error) {
      console.error('Błąd podczas generowania eksportu partii:', error);
      showError('Błąd podczas generowania eksportu partii: ' + error.message);
    } finally {
      setMainTableLoading(false);
    }
  };

  // Funkcja pomocnicza do normalizacji i porównywania wartości numerycznych
  // Usuwa wiodące zera i porównuje wartości jako liczby
  const areNumericValuesEqual = (value1, value2) => {
    // Jeśli oba puste - są równe
    if (!value1 && !value2) return true;
    // Jeśli tylko jedno puste - nie są równe
    if (!value1 || !value2) return false;
    
    // Konwertuj na liczby i porównaj
    const num1 = parseFloat(value1);
    const num2 = parseFloat(value2);
    
    // Jeśli któraś wartość nie jest liczbą, porównaj jako string
    if (isNaN(num1) || isNaN(num2)) {
      return value1.toString().trim() === value2.toString().trim();
    }
    
    // Porównaj numerycznie z tolerancją na błędy zaokrągleń
    return Math.abs(num1 - num2) < 0.0001;
  };

  // Funkcja parsująca CSV do tablicy obiektów
  const parseCSV = (csvText) => {
    const lines = csvText.split('\n').filter(line => line.trim() !== '');
    console.log('📄 Parsowanie CSV - liczba linii:', lines.length);
    
    if (lines.length < 2) {
      throw new Error('Plik CSV jest pusty lub zawiera tylko nagłówki');
    }

    // Automatyczne wykrywanie separatora (przecinek lub średnik)
    const firstLine = lines[0];
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    const separator = semicolonCount > commaCount ? ';' : ',';
    console.log(`🔍 Wykryto separator: "${separator}" (przecinki: ${commaCount}, średniki: ${semicolonCount})`);

    // Parsuj nagłówki
    const rawHeaders = lines[0].split(separator).map(header => header.replace(/^"|"$/g, '').trim());
    console.log('📋 Nagłówki CSV:', rawHeaders);
    
    // Parsuj wiersze danych
    const data = [];
    for (let i = 1; i < lines.length; i++) {
      const values = [];
      let currentValue = '';
      let insideQuotes = false;
      
      for (let j = 0; j < lines[i].length; j++) {
        const char = lines[i][j];
        const nextChar = lines[i][j + 1];
        
        if (char === '"') {
          if (insideQuotes && nextChar === '"') {
            // Escaped quote
            currentValue += '"';
            j++; // Skip next quote
          } else {
            // Toggle quote state
            insideQuotes = !insideQuotes;
          }
        } else if (char === separator && !insideQuotes) {
          values.push(currentValue.trim());
          currentValue = '';
        } else {
          currentValue += char;
        }
      }
      values.push(currentValue.trim()); // Push last value
      
      // Utwórz obiekt z wartości
      const row = {};
      rawHeaders.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      data.push(row);
    }
    
    console.log('✅ Sparsowano', data.length, 'wierszy danych');
    if (data.length > 0) {
      console.log('📝 Przykładowy wiersz (pierwszy):', data[0]);
    }
    
    return data;
  };

  // Funkcja otwierająca dialog importu
  const handleOpenImportDialog = () => {
    setImportDialogOpen(true);
    setImportFile(null);
    setImportPreview([]);
    setImportError(null);
    setImportWarnings([]);
  };

  // Funkcja zamykająca dialog importu
  const handleCloseImportDialog = () => {
    setImportDialogOpen(false);
    setImportFile(null);
    setImportPreview([]);
    setImportError(null);
    setImportWarnings([]);
  };

  // Funkcja obsługująca wybór pliku
  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setImportFile(file);
    setImportError(null);
    setImportPreview([]);
    setImportWarnings([]);

    try {
      // Wczytaj plik
      const text = await file.text();
      
      // Parsuj CSV
      const csvData = parseCSV(text);
      
      // Załaduj wszystkie pozycje magazynowe z bazy
      console.log('🔄 Ładowanie wszystkich pozycji magazynowych z bazy...');
      const allItemsData = await getAllInventoryItems();
      const allItems = Array.isArray(allItemsData.items) ? allItemsData.items : allItemsData;
      console.log('✅ Załadowano wszystkie pozycje magazynowe z bazy:', allItems.length);
      
      // Załaduj wszystkie magazyny
      const warehousesList = await getAllWarehouses();
      console.log('📦 Załadowano magazyny:', warehousesList.length);
      
      // Przygotuj podgląd aktualizacji i zbieraj ostrzeżenia
      const preview = [];
      const warnings = [];
      
      console.log('📊 Rozpoczęcie parsowania CSV:', csvData.length, 'wierszy');
      console.log('📦 Dostępne pozycje:', allItems.length);
      
      // Sprawdź duplikaty SKU w CSV
      const skuCounts = {};
      csvData.forEach(row => {
        const sku = row['SKU'];
        if (sku) {
          skuCounts[sku] = (skuCounts[sku] || 0) + 1;
        }
      });
      const duplicates = Object.entries(skuCounts).filter(([sku, count]) => count > 1);
      if (duplicates.length > 0) {
        console.log('⚠️ WYKRYTO DUPLIKATY SKU w pliku CSV:', duplicates);
        duplicates.forEach(([sku, count]) => {
          warnings.push({
            sku: sku,
            type: 'warning',
            message: `SKU "${sku}" występuje ${count} razy w pliku CSV. Zostanie użyty tylko ostatni wiersz.`
          });
        });
      }
      
      // Sprawdź które kolumny są w pliku (aby nie nadpisywać pustymi wartościami gdy kolumny brak)
      const csvHeaders = csvData.length > 0 ? Object.keys(csvData[0]) : [];
      const hasDescriptionColumn = csvHeaders.some(h => h.trim().toLowerCase() === 'description');
      
      console.log('\n═══════════════════════════════════════════════════════');
      console.log('🔍 ANALIZA PLIKU CSV - SZCZEGÓŁOWE PORÓWNANIE');
      console.log('═══════════════════════════════════════════════════════\n');
      
      for (const row of csvData) {
        const sku = row['SKU'];
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🔍 Przetwarzanie wiersza CSV:', sku);
        
        if (!sku) {
          console.log('⚠️ Pominięto wiersz bez SKU');
          warnings.push({
            sku: '(pusty)',
            type: 'warning',
            message: 'Wiersz bez SKU został pominięty.'
          });
          continue;
        }
        
        // Znajdź istniejącą pozycję magazynową (z normalizacją - ignoruj spacje i wielkość liter)
        const existingItem = allItems.find(i => 
          i.name.trim().toLowerCase() === sku.trim().toLowerCase()
        );
        
        if (!existingItem) {
          console.log('❌ Nie znaleziono pozycji o SKU:', sku);
          warnings.push({
            sku: sku,
            type: 'warning',
            message: `Pozycja o SKU "${sku}" nie istnieje w bazie danych. Import modyfikuje tylko istniejące pozycje.`
          });
          preview.push({
            sku: sku,
            status: 'new',
            message: 'Nowa pozycja (zostanie pominięta - tylko aktualizacje są obsługiwane)',
            changes: []
          });
          continue;
        }
        
        console.log('✅ Znaleziono pozycję:', sku, 'ID:', existingItem.id);
        console.log('📊 DANE Z BAZY (przed aktualizacją):', {
          id: existingItem.id,
          name: existingItem.name,
          category: existingItem.category,
          casNumber: existingItem.casNumber,
          barcode: existingItem.barcode,
          unit: existingItem.unit,
          description: existingItem.description,
          minStockLevel: existingItem.minStockLevel,
          maxStockLevel: existingItem.maxStockLevel,
          weight: existingItem.weight,
          itemsPerBox: existingItem.itemsPerBox,
          boxesPerPallet: existingItem.boxesPerPallet,
          warehouseName: existingItem.warehouseName
        });
        console.log('📄 DANE Z CSV:', {
          SKU: row['SKU'],
          Category: row['Category'],
          'CAS Number': row['CAS Number'],
          Barcode: row['Barcode'],
          Unit: row['Unit'],
          Description: row['Description'],
          'Min Stock Level': row['Min Stock Level'],
          'Max Stock Level': row['Max Stock Level'],
          'Gross Weight (kg)': row['Gross Weight (kg)'],
          'Pcs Per Cardboard': row['Pcs Per Cardboard'],
          'Cardboard Per Pallet': row['Cardboard Per Pallet'],
          Location: row['Location']
        });
        
        // Wykryj zmiany
        const changes = [];
        const updateData = {
          // Nazwa (SKU) jest wymagana przez walidator, wysyłamy istniejącą wartość
          name: existingItem.name
        };
        
        // Sprawdź kategorię
        const csvCategory = (row['Category'] || '').trim();
        const dbCategory = (existingItem.category || '').trim();
        if (csvCategory && csvCategory !== dbCategory) {
          changes.push({
            field: 'Kategoria',
            oldValue: dbCategory,
            newValue: csvCategory
          });
          updateData.category = csvCategory;
        }
        
        // Sprawdź numer CAS (tylko jeśli CSV zawiera wartość)
        const csvCasNumber = (row['CAS Number'] || '').trim();
        const dbCasNumber = (existingItem.casNumber || '').trim();
        if (csvCasNumber && csvCasNumber !== dbCasNumber) {
          changes.push({
            field: 'Numer CAS',
            oldValue: dbCasNumber,
            newValue: csvCasNumber
          });
          updateData.casNumber = csvCasNumber;
        }
        
        // Sprawdź kod kreskowy (tylko jeśli CSV zawiera wartość)
        const csvBarcode = (row['Barcode'] || '').trim();
        const dbBarcode = (existingItem.barcode || '').trim();
        if (csvBarcode && csvBarcode !== dbBarcode) {
          changes.push({
            field: 'Kod kreskowy',
            oldValue: dbBarcode,
            newValue: csvBarcode
          });
          updateData.barcode = csvBarcode;
        }
        
        // Sprawdź jednostkę
        const csvUnit = (row['Unit'] || '').trim();
        const dbUnit = (existingItem.unit || '').trim();
        if (csvUnit && csvUnit !== dbUnit) {
          changes.push({
            field: 'Jednostka',
            oldValue: dbUnit,
            newValue: csvUnit
          });
          updateData.unit = csvUnit;
        }
        
        // Sprawdź lokalizację/magazyn
        const csvLocation = (row['Location'] || '').trim();
        const dbLocationName = (existingItem.warehouseName || '').trim();
        if (csvLocation !== dbLocationName) {
          const newWarehouse = warehousesList.find(w => w.name.trim().toLowerCase() === csvLocation.toLowerCase());
          if (newWarehouse) {
            changes.push({
              field: 'Lokalizacja',
              oldValue: dbLocationName,
              newValue: csvLocation
            });
            updateData.warehouseName = csvLocation;
          } else if (csvLocation) {
            warnings.push({
              sku: sku,
              type: 'warning',
              message: `Nieznany magazyn: "${csvLocation}". Lokalizacja nie zostanie zaktualizowana.`
            });
          }
        }
        
        // Sprawdź minimalny stan magazynowy (porównanie numeryczne)
        const csvMinStock = (row['Min Stock Level'] || '').trim();
        const dbMinStock = (existingItem.minStockLevel || '').toString().trim();
        if (csvMinStock && !areNumericValuesEqual(csvMinStock, dbMinStock)) {
          changes.push({
            field: 'Min. stan magazynowy',
            oldValue: dbMinStock,
            newValue: csvMinStock
          });
          updateData.minStockLevel = csvMinStock;
        }
        
        // Sprawdź maksymalny stan magazynowy (porównanie numeryczne)
        const csvMaxStock = (row['Max Stock Level'] || '').trim();
        const dbMaxStock = (existingItem.maxStockLevel || '').toString().trim();
        if (csvMaxStock && !areNumericValuesEqual(csvMaxStock, dbMaxStock)) {
          changes.push({
            field: 'Max. stan magazynowy',
            oldValue: dbMaxStock,
            newValue: csvMaxStock
          });
          updateData.maxStockLevel = csvMaxStock;
        }
        
        // Sprawdź kartony na palecie (porównanie numeryczne)
        const csvCardboardPerPallet = (row['Cardboard Per Pallet'] || '').trim();
        const dbCardboardPerPallet = (existingItem.boxesPerPallet || '').toString().trim();
        if (csvCardboardPerPallet && !areNumericValuesEqual(csvCardboardPerPallet, dbCardboardPerPallet)) {
          changes.push({
            field: 'Kartony na palecie',
            oldValue: dbCardboardPerPallet,
            newValue: csvCardboardPerPallet
          });
          updateData.boxesPerPallet = csvCardboardPerPallet;
        }
        
        // Sprawdź sztuki na karton (porównanie numeryczne)
        const csvPcsPerCardboard = (row['Pcs Per Cardboard'] || '').trim();
        const dbPcsPerCardboard = (existingItem.itemsPerBox || '').toString().trim();
        if (csvPcsPerCardboard && !areNumericValuesEqual(csvPcsPerCardboard, dbPcsPerCardboard)) {
          changes.push({
            field: 'Sztuki na karton',
            oldValue: dbPcsPerCardboard,
            newValue: csvPcsPerCardboard
          });
          updateData.itemsPerBox = csvPcsPerCardboard;
        }
        
        // Sprawdź wagę brutto (porównanie numeryczne - ignoruje wiodące zera)
        const csvWeight = (row['Gross Weight (kg)'] || '').trim();
        const dbWeight = (existingItem.weight || '').toString().trim();
        if (csvWeight && !areNumericValuesEqual(csvWeight, dbWeight)) {
          changes.push({
            field: 'Waga brutto (kg)',
            oldValue: dbWeight,
            newValue: csvWeight
          });
          updateData.weight = csvWeight;
        }
        
        // Sprawdź opis (tylko jeśli kolumna Description jest w CSV i zawiera wartość)
        if (hasDescriptionColumn) {
          const descKey = csvHeaders.find(h => h.trim().toLowerCase() === 'description');
          const csvDesc = (row[descKey] || '').trim();
          const dbDesc = (existingItem.description || '').trim();
          if (csvDesc && csvDesc !== dbDesc) {
            changes.push({
              field: 'Opis',
              oldValue: dbDesc,
              newValue: csvDesc
            });
            updateData.description = csvDesc;
          }
        }
        
        // Dodaj do podglądu
        if (changes.length > 0) {
          console.log('🔄 PRZYGOTOWANE DANE DO AKTUALIZACJI:', updateData);
          console.log('📝 WYKRYTE ZMIANY:', changes);
          console.log('⚠️ POLA NIE ZMIENIONE (pozostaną bez zmian):', {
            category: !updateData.hasOwnProperty('category') ? existingItem.category : '(zostanie zmienione)',
            casNumber: !updateData.hasOwnProperty('casNumber') ? existingItem.casNumber : '(zostanie zmienione)',
            barcode: !updateData.hasOwnProperty('barcode') ? existingItem.barcode : '(zostanie zmienione)',
            description: !updateData.hasOwnProperty('description') ? existingItem.description : '(zostanie zmienione)',
            unit: !updateData.hasOwnProperty('unit') ? existingItem.unit : '(zostanie zmienione)',
            minStockLevel: !updateData.hasOwnProperty('minStockLevel') ? existingItem.minStockLevel : '(zostanie zmienione)',
            maxStockLevel: !updateData.hasOwnProperty('maxStockLevel') ? existingItem.maxStockLevel : '(zostanie zmienione)',
            weight: !updateData.hasOwnProperty('weight') ? existingItem.weight : '(zostanie zmienione)',
            itemsPerBox: !updateData.hasOwnProperty('itemsPerBox') ? existingItem.itemsPerBox : '(zostanie zmienione)',
            boxesPerPallet: !updateData.hasOwnProperty('boxesPerPallet') ? existingItem.boxesPerPallet : '(zostanie zmienione)'
          });
          console.log('─────────────────────────────────────────────────');
          preview.push({
            sku: sku,
            itemId: existingItem.id,
            status: 'update',
            message: `${changes.length} zmian(a) wykryta(ych)`,
            changes: changes,
            updateData: updateData
          });
        } else {
          console.log('ℹ️ Brak zmian dla SKU:', sku);
          preview.push({
            sku: sku,
            status: 'no-change',
            message: 'Brak zmian',
            changes: []
          });
        }
      }
      
      setImportPreview(preview);
      setImportWarnings(warnings);
      
      if (preview.filter(p => p.status === 'update').length === 0) {
        setImportError(t('inventory:noChangesToImport'));
      }
      
    } catch (error) {
      console.error('Błąd podczas parsowania pliku:', error);
      setImportError(error.message);
    }
  };

  // Funkcja wykonująca import
  const handleConfirmImport = async () => {
    setImporting(true);
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('🚀 ROZPOCZĘCIE IMPORTU CSV - SZCZEGÓŁOWE LOGOWANIE');
    console.log('═══════════════════════════════════════════════════════');
    
    try {
      const { updateInventoryItem, getInventoryItemById } = await import('../../services/inventory/inventoryItemsService');
      
      // Filtruj tylko te pozycje, które mają zmiany
      const itemsToUpdate = importPreview.filter(p => p.status === 'update');
      console.log(`📦 Liczba pozycji do aktualizacji: ${itemsToUpdate.length}`);
      
      let updatedCount = 0;
      let errorCount = 0;
      
      for (const item of itemsToUpdate) {
        try {
          console.log(`\n🔄 [${updatedCount + 1}/${itemsToUpdate.length}] Aktualizacja: ${item.sku}`);
          console.log('📤 Wysyłane dane (updateData):', item.updateData);
          console.log('📝 Lista zmian:', item.changes.map(c => `${c.field}: "${c.oldValue}" → "${c.newValue}"`).join(', '));
          
          // Aktualizuj pozycję
          await updateInventoryItem(item.itemId, item.updateData, currentUser.uid);
          
          // Pobierz zaktualizowane dane z bazy (aby zweryfikować)
          const updatedItem = await getInventoryItemById(item.itemId);
          console.log('✅ SUKCES! Dane po aktualizacji w bazie:', {
            id: updatedItem.id,
            name: updatedItem.name,
            category: updatedItem.category,
            casNumber: updatedItem.casNumber,
            barcode: updatedItem.barcode,
            unit: updatedItem.unit,
            description: updatedItem.description,
            minStockLevel: updatedItem.minStockLevel,
            maxStockLevel: updatedItem.maxStockLevel,
            weight: updatedItem.weight,
            itemsPerBox: updatedItem.itemsPerBox,
            boxesPerPallet: updatedItem.boxesPerPallet,
            warehouseName: updatedItem.warehouseName
          });
          
          // Weryfikacja - sprawdź czy wszystkie zmiany zostały zastosowane
          const verificationErrors = [];
          item.changes.forEach(change => {
            const fieldMapping = {
              'Kategoria': 'category',
              'Numer CAS': 'casNumber',
              'Kod kreskowy': 'barcode',
              'Jednostka': 'unit',
              'Opis': 'description',
              'Min. stan magazynowy': 'minStockLevel',
              'Max. stan magazynowy': 'maxStockLevel',
              'Waga brutto (kg)': 'weight',
              'Sztuki na karton': 'itemsPerBox',
              'Kartony na palecie': 'boxesPerPallet',
              'Lokalizacja': 'warehouseName'
            };
            
            const dbField = fieldMapping[change.field];
            if (dbField && updatedItem[dbField] != change.newValue) {
              verificationErrors.push(`${change.field}: oczekiwano "${change.newValue}", otrzymano "${updatedItem[dbField]}"`);
            }
          });
          
          if (verificationErrors.length > 0) {
            console.warn('⚠️ WERYFIKACJA: Wykryto niezgodności:', verificationErrors);
          } else {
            console.log('✓ WERYFIKACJA: Wszystkie zmiany zostały poprawnie zastosowane');
          }
          
          updatedCount++;
        } catch (error) {
          console.error(`❌ BŁĄD podczas aktualizacji pozycji ${item.sku}:`, error);
          console.error('📋 Szczegóły błędu:', {
            message: error.message,
            stack: error.stack,
            updateData: item.updateData
          });
          errorCount++;
        }
      }
      
      console.log('\n═══════════════════════════════════════════════════════');
      console.log('📊 PODSUMOWANIE IMPORTU');
      console.log('═══════════════════════════════════════════════════════');
      console.log(`✅ Zaktualizowano: ${updatedCount} pozycji`);
      console.log(`❌ Błędy: ${errorCount} pozycji`);
      console.log(`📈 Wskaźnik sukcesu: ${itemsToUpdate.length > 0 ? ((updatedCount / itemsToUpdate.length) * 100).toFixed(1) : 0}%`);
      console.log('═══════════════════════════════════════════════════════\n');
      
      // Przelicz rzeczywiste ilości na podstawie partii dla wszystkich zaktualizowanych pozycji
      if (updatedCount > 0) {
        console.log('\n🔄 PRZELICZANIE RZECZYWISTYCH ILOŚCI Z PARTII...');
        const { recalculateItemQuantity } = await import('../../services/inventory/inventoryOperationsService');
        
        let recalculatedCount = 0;
        for (const item of itemsToUpdate) {
          if (item.status === 'update' && item.itemId) {
            try {
              const newQuantity = await recalculateItemQuantity(item.itemId);
              console.log(`✅ Przeliczono ilość dla ${item.sku}: ${newQuantity}`);
              recalculatedCount++;
            } catch (error) {
              console.error(`⚠️ Błąd podczas przeliczania ilości dla ${item.sku}:`, error);
            }
          }
        }
        console.log(`✅ Przeliczono ilości dla ${recalculatedCount}/${updatedCount} pozycji\n`);
      }
      
      showSuccess(`Import zakończony! Zaktualizowano ${updatedCount} pozycji. Błędy: ${errorCount}`);
      
      // Zamknij dialog i odśwież listę
      handleCloseImportDialog();
      await fetchInventoryItems(tableSort.field, tableSort.order);
      
    } catch (error) {
      console.error('❌ KRYTYCZNY BŁĄD podczas importu:', error);
      console.error('📋 Szczegóły:', {
        message: error.message,
        stack: error.stack
      });
      showError('Wystąpił błąd podczas importu: ' + error.message);
    } finally {
      console.log('🏁 Import zakończony (finally block)');
      setImporting(false);
    }
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
    } else if (currentTab === 5) {
      // Zakładka "Rezerwacje"
      fetchAllReservations();
    }
    showSuccess('Lista została odświeżona');
  };

  // Funkcja do przeliczania ilości wszystkich pozycji magazynowych z partii
  const handleRecalculateAllQuantities = async () => {
    if (!window.confirm('Czy na pewno chcesz przeliczać ilości wszystkich pozycji magazynowych na podstawie partii? To może zająć kilka minut dla dużych baz danych.')) {
      return;
    }

    try {
      setLoading(true);
      console.log('🔄 Rozpoczynanie przeliczania wszystkich ilości...');
      
      const results = await recalculateAllInventoryQuantities();
      
      console.log('✅ Przeliczanie zakończone:', results);
      
      const changedItems = results.items.filter(item => !item.error && item.difference !== 0);
      
      showSuccess(
        `Przeliczono ilości dla ${results.success} pozycji. ` +
        `Zaktualizowano ${changedItems.length} pozycji. ` +
        `Błędy: ${results.failed}`
      );
      
      // Odśwież listę pozycji
      await fetchInventoryItems(tableSort.field, tableSort.order);
      
    } catch (error) {
      console.error('❌ Błąd podczas przeliczania ilości:', error);
      showError(`Nie udało się przeliczać ilości: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleMenuItemClick = (action) => {
    handleMoreMenuClose();
    switch (action) {
      case 'csv':
        openExportCategoryDialog();
        break;
      case 'batches':
        generateBatchesExportCSV();
        break;
      case 'import':
        handleOpenImportDialog();
        break;
      case 'refresh':
        handleRefreshList();
        break;
      case 'recalculate':
        handleRecalculateAllQuantities();
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
          <MenuItem onClick={() => handleMenuItemClick('csv')}>
            <ListItemIcon>
              <CsvIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>{t('inventory.states.csvReport')}</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => handleMenuItemClick('batches')}>
            <ListItemIcon>
              <LayersIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Export partii CSV</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => handleMenuItemClick('import')}>
            <ListItemIcon>
              <UploadIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Import CSV</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => handleMenuItemClick('recalculate')}>
            <ListItemIcon>
              <CalculateIcon fontSize="small" color="info" />
            </ListItemIcon>
            <ListItemText sx={{ color: 'info.main' }}>Przelicz ilości z partii</ListItemText>
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

      {/* Zakładki komponentu Stany */}
      <Tabs
        value={currentTab}
        onChange={handleTabChange}
        sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}
      >
        <Tab label={t('inventory.states.tabs.states')} />
        <Tab label={t('inventory.states.tabs.locations')} />
        <Tab label={t('inventory.states.tabs.expiryDates')} />
        <Tab label={t('inventory.states.tabs.suppliers')} />
        <Tab label={t('inventory.states.tabs.stocktaking')} />
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
                  startAdornment: <SearchIcon color="action" sx={mr1} />,
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
              <FormControl sx={{ minWidth: '200px' }}>
                <InputLabel id="customer-filter-label">Klient</InputLabel>
                <Select
                  labelId="customer-filter-label"
                  value={customerFilter}
                  label="Klient"
                  onChange={(e) => setCustomerFilter(e.target.value)}
                  size="small"
                >
                  <MenuItem value="">Wszyscy klienci</MenuItem>
                  {customers.map((customer) => (
                    <MenuItem key={customer.id} value={customer.id}>{customer.name}</MenuItem>
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
              <FormControlLabel
                control={
                  <Checkbox
                    checked={showArchived}
                    onChange={(e) => setShowArchived(e.target.checked)}
                    size="small"
                  />
                }
                label={t('common:common.showArchived')}
              />
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
                      {visibleColumns.customers && <TableCell>Klienci</TableCell>}
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
                        {visibleColumns.customers && <TableCell><Skeleton variant="text" width="70%" /></TableCell>}
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
          ) : displayedItems.length === 0 ? (
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
                        {visibleColumns.customers && (
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                              Klienci
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
                      {displayedItems.map((item, index) => {
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
                                opacity: item.archived ? 0.5 : 1,
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
                              {visibleColumns.customers && (
                                <TableCell>
                                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                    {item.allCustomers ? (
                                      <Chip
                                        label="Wszyscy"
                                        size="small"
                                        color="primary"
                                      />
                                    ) : (
                                      <>
                                        {(item.customerIds || []).slice(0, 2).map(cId => (
                                          <Chip
                                            key={cId}
                                            label={customerNameMap[cId] || '...'}
                                            size="small"
                                            variant="outlined"
                                            color="secondary"
                                          />
                                        ))}
                                        {(item.customerIds || []).length > 2 && (
                                          <Chip
                                            label={`+${item.customerIds.length - 2}`}
                                            size="small"
                                            color="default"
                                          />
                                        )}
                                      </>
                                    )}
                                  </Box>
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
                                    <Tooltip title={item.archived ? t('common:common.unarchive') : t('common:common.archive')}>
                                      <IconButton
                                        onClick={() => handleArchiveItem(item)}
                                        sx={{ 
                                          transition: 'all 0.15s ease-in-out',
                                          '&:hover': { transform: 'scale(1.1)' }
                                        }}
                                      >
                                        {item.archived ? <UnarchiveIcon /> : <ArchiveIcon />}
                                      </IconButton>
                                    </Tooltip>
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
                      {t('inventory.states.pagination.showing', { shown: displayedItems.length, total: totalItems })}
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
            <MenuItem onClick={() => toggleColumnVisibility('customers')}>
              <Checkbox checked={visibleColumns.customers} />
              <ListItemText primary="Klienci" />
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

      {/* Zakładka Daty ważności */}
      {currentTab === 2 && (
        <Box sx={{ mt: -3 }}>
          <ExpiryDatesPage embedded={true} />
        </Box>
      )}

      {/* Zakładka Dostawcy */}
      {currentTab === 3 && (
        <Box sx={{ mt: -3 }}>
          <SuppliersPage embedded={true} />
        </Box>
      )}

      {/* Zakładka Inwentaryzacja */}
      {currentTab === 4 && (
        <Box sx={{ mt: -3 }}>
          <StocktakingPage embedded={true} />
        </Box>
      )}

      {/* Zakładka Rezerwacje */}
      {currentTab === 5 && (
        <>
          <Box sx={mb3}>
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
                startAdornment: <SearchIcon color="action" sx={mr1} />,
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
                            sx={mr1}
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

      {/* Dialog wyboru kategorii przed eksportem CSV */}
      <Dialog 
        open={exportCategoryDialogOpen} 
        onClose={() => setExportCategoryDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Select Categories for CSV Export
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Select which product categories should be included in the CSV report.
            </Typography>
            
            {/* Zaznacz/Odznacz wszystkie */}
            <Box sx={{ mb: 2, borderBottom: 1, borderColor: 'divider', pb: 1 }}>
              <FormControl component="fieldset">
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Checkbox
                    checked={selectedExportCategories.length === Object.values(INVENTORY_CATEGORIES).length}
                    indeterminate={selectedExportCategories.length > 0 && selectedExportCategories.length < Object.values(INVENTORY_CATEGORIES).length}
                    onChange={handleSelectAllCategories}
                  />
                  <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                    Select All ({selectedExportCategories.length}/{Object.values(INVENTORY_CATEGORIES).length})
                  </Typography>
                </Box>
              </FormControl>
            </Box>
            
            {/* Lista kategorii */}
            <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
              {Object.values(INVENTORY_CATEGORIES).map((category) => (
                <Box 
                  key={category} 
                  sx={{ 
                    display: 'flex', 
                    alignItems: 'center',
                    '&:hover': { bgcolor: 'action.hover' },
                    borderRadius: 1,
                    px: 1
                  }}
                >
                  <Checkbox
                    checked={selectedExportCategories.includes(category)}
                    onChange={() => handleExportCategoryToggle(category)}
                  />
                  <Typography variant="body2">
                    {category}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExportCategoryDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={generateCsvReport}
            variant="contained"
            color="primary"
            disabled={selectedExportCategories.length === 0}
          >
            Export CSV ({selectedExportCategories.length} categories)
          </Button>
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
        <MenuItem onClick={handleRecalculateItemQuantity}>
          <ListItemIcon>
            <RefreshIcon fontSize="small" color="info" />
          </ListItemIcon>
          <ListItemText sx={{ color: 'info.main' }}>Przelicz ilość z partii</ListItemText>
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

      {/* Dialog importu CSV */}
      <Dialog 
        open={importDialogOpen} 
        onClose={handleCloseImportDialog}
        maxWidth="md" 
        fullWidth
      >
        <DialogTitle>
          Import pozycji magazynowych z CSV
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box 
              sx={{ 
                p: 2, 
                bgcolor: 'info.light', 
                borderRadius: 1,
                border: '1px solid',
                borderColor: 'info.main'
              }}
            >
              <Typography variant="body2" gutterBottom fontWeight="bold">
                Format pliku CSV:
              </Typography>
              <Typography variant="body2" component="div" sx={{ fontSize: '0.875rem' }}>
                • <strong>Wymagana kolumna:</strong> SKU (identyfikator pozycji)<br/>
                • <strong>Opcjonalne kolumny:</strong> Category, CAS Number, Barcode, Unit, Location, Min Stock Level, Max Stock Level, Cardboard Per Pallet, Pcs Per Cardboard, Gross Weight (kg), Description<br/>
                • <strong>Uwaga:</strong> Import aktualizuje tylko istniejące pozycje. Nowe pozycje nie będą tworzone.<br/>
                • <strong>Uwaga:</strong> Kolumny Total Quantity, Reserved Quantity, Available Quantity są ignorowane (ilości zarządzane są przez transakcje).
              </Typography>
            </Box>
            
            <Button
              variant="outlined"
              component="label"
              fullWidth
              startIcon={<UploadIcon />}
            >
              Wybierz plik CSV
              <input
                type="file"
                hidden
                accept=".csv"
                onChange={handleFileSelect}
              />
            </Button>
            
            {importFile && (
              <Box 
                sx={{ 
                  p: 2, 
                  bgcolor: 'success.light', 
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: 'success.main'
                }}
              >
                <Typography variant="body2">
                  ✓ Wczytano plik: <strong>{importFile.name}</strong>
                </Typography>
              </Box>
            )}
            
            {importError && (
              <Box 
                sx={{ 
                  p: 2, 
                  bgcolor: 'error.light', 
                  borderRadius: 1,
                  border: '1px solid',
                  borderColor: 'error.main'
                }}
              >
                <Typography variant="body2" color="error.dark">
                  {importError}
                </Typography>
              </Box>
            )}
            
            {importWarnings.length > 0 && (
              <Box sx={mt2}>
                <Box 
                  sx={{ 
                    p: 2, 
                    bgcolor: 'warning.light', 
                    borderRadius: 1,
                    border: '1px solid',
                    borderColor: 'warning.main'
                  }}
                >
                  <Typography variant="subtitle2" gutterBottom fontWeight="bold">
                    Znaleziono {importWarnings.length} ostrzeżeń:
                  </Typography>
                  <Box component="ul" sx={{ margin: 0, paddingLeft: 2, maxHeight: 200, overflow: 'auto' }}>
                    {importWarnings.map((warning, idx) => (
                      <li key={idx}>
                        <Typography variant="body2">
                          <strong>{warning.sku}:</strong> {warning.message}
                        </Typography>
                      </li>
                    ))}
                  </Box>
                </Box>
              </Box>
            )}
            
            {importPreview.length > 0 && (
              <Box sx={mt2}>
                <Typography variant="subtitle2" gutterBottom fontWeight="bold">
                  Podgląd zmian ({importPreview.filter(p => p.status === 'update').length} pozycji do aktualizacji):
                </Typography>
                
                <Box sx={{ maxHeight: 400, overflow: 'auto', mt: 2 }}>
                  {importPreview.map((item, index) => (
                    <Box 
                      key={index}
                      sx={{ 
                        mb: 2, 
                        p: 2, 
                        border: '1px solid',
                        borderColor: item.status === 'update' ? 'primary.main' : 
                                   item.status === 'new' ? 'warning.main' : 'divider',
                        borderRadius: 1,
                        bgcolor: item.status === 'update' ? 'primary.light' : 
                               item.status === 'new' ? 'warning.light' : 'background.paper'
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="subtitle2" fontWeight="bold">
                          {item.sku}
                        </Typography>
                        <Chip 
                          label={item.message} 
                          size="small"
                          color={item.status === 'update' ? 'primary' : 
                                item.status === 'new' ? 'warning' : 'default'}
                        />
                      </Box>
                      
                      {item.changes.length > 0 && (
                        <TableContainer>
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell>Pole</TableCell>
                                <TableCell>Wartość bieżąca</TableCell>
                                <TableCell>Nowa wartość</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {item.changes.map((change, idx) => (
                                <TableRow key={idx}>
                                  <TableCell>{change.field}</TableCell>
                                  <TableCell sx={{ color: 'error.main' }}>
                                    {change.oldValue || '-'}
                                  </TableCell>
                                  <TableCell sx={{ color: 'success.main' }}>
                                    {change.newValue || '-'}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      )}
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseImportDialog} disabled={importing}>
            Anuluj
          </Button>
          <Button 
            onClick={handleConfirmImport} 
            variant="contained" 
            disabled={
              importing || 
              importPreview.filter(p => p.status === 'update').length === 0
            }
            startIcon={importing ? <CircularProgress size={16} /> : <UploadIcon />}
          >
            {importing ? 'Importowanie...' : `Zatwierdź import (${importPreview.filter(p => p.status === 'update').length} pozycji)`}
          </Button>
        </DialogActions>
      </Dialog>

    </div>
  );
};

export default InventoryList;
