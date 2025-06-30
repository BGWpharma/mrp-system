// src/pages/Inventory/ItemDetailsPage.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  Grid,
  Button,
  Divider,
  Box,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tab,
  Tabs,
  Alert,
  AlertTitle,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  IconButton,
  CircularProgress,
  Tooltip,
  useMediaQuery,
  useTheme
} from '@mui/material';
import {
  Edit as EditIcon,
  ArrowBack as ArrowBackIcon,
  ArrowUpward as ReceiveIcon,
  ArrowDownward as IssueIcon,
  History as HistoryIcon,
  Warning as WarningIcon,
  ViewList as ViewListIcon,
  Add as AddIcon,
  QrCode as QrCodeIcon,
  Refresh as RefreshIcon,
  SortByAlpha as SortIcon,
  FilterList as FilterIcon,
  Delete as DeleteIcon,
  Cached as CachedIcon,
  AccessTime as ClockIcon
} from '@mui/icons-material';
import { getInventoryItemById, getItemTransactions, getItemBatches, getSupplierPrices, deleteReservation, cleanupDeletedTaskReservations, getReservationsGroupedByTask, cleanupItemReservations, getAllWarehouses, recalculateItemQuantity, getAwaitingOrdersForInventoryItem } from '../../services/inventoryService';
import { getAllSuppliers } from '../../services/supplierService';
import { useNotification } from '../../hooks/useNotification';
import { useAuth } from '../../hooks/useAuth';
import { formatDate, formatDateTime, formatQuantity } from '../../utils/formatters';
import { Timestamp } from 'firebase/firestore';
import LabelDialog from '../../components/inventory/LabelDialog';
import { getUsersDisplayNames } from '../../services/userService';

// TabPanel component
function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`item-tabpanel-${index}`}
      aria-labelledby={`item-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

const ItemDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showError, showSuccess } = useNotification();
  const { currentUser } = useAuth();
  const [item, setItem] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [batches, setBatches] = useState([]);
  const [supplierPrices, setSupplierPrices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tabValue, setTabValue] = useState(0);
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  const [reservations, setReservations] = useState([]);
  const [filteredReservations, setFilteredReservations] = useState([]);
  const [reservationFilter, setReservationFilter] = useState('all');
  const [reservationSortField, setReservationSortField] = useState('createdAt');
  const [reservationSortOrder, setReservationSortOrder] = useState('desc');
  const [updatingReservations, setUpdatingReservations] = useState(false);
  const [refreshingQuantity, setRefreshingQuantity] = useState(false);
  const [awaitingOrders, setAwaitingOrders] = useState({});
  const [awaitingOrdersLoading, setAwaitingOrdersLoading] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [userNames, setUserNames] = useState({});
  
  // Dodajemy wykrywanie urządzeń mobilnych
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Funkcja pobierająca dane użytkowników
  const fetchUserNames = async (transactions) => {
    if (!transactions || transactions.length === 0) return;
    
    const userIds = transactions
      .filter(transaction => transaction.createdBy)
      .map(transaction => transaction.createdBy);
    
    // Usuń duplikaty
    const uniqueUserIds = [...new Set(userIds)];
    
    if (uniqueUserIds.length === 0) return;
    
    try {
      const names = await getUsersDisplayNames(uniqueUserIds);
      setUserNames(names);
    } catch (error) {
      console.error("Błąd podczas pobierania danych użytkowników:", error);
    }
  };

  useEffect(() => {
    const fetchItemData = async () => {
      try {
        setLoading(true);
        const itemData = await getInventoryItemById(id);
        setItem(itemData);
        
        // Pobierz historię transakcji
        const transactionsData = await getItemTransactions(id);
        setTransactions(transactionsData);
        
        // Pobierz nazwy użytkowników dla transakcji
        fetchUserNames(transactionsData);
        
        // Pobierz partie
        const batchesData = await getItemBatches(id);
        
        // Pobierz magazyny i dodaj nazwy magazynów do partii
        const warehousesData = await getAllWarehouses();
        const batchesWithWarehouseNames = batchesData.map(batch => {
          const warehouse = warehousesData.find(w => w.id === batch.warehouseId);
          return {
            ...batch,
            warehouseName: warehouse?.name || 'Magazyn podstawowy'
          };
        });
        
        setBatches(batchesWithWarehouseNames);

        // Pobierz ceny dostawców
        const supplierPricesData = await getSupplierPrices(id);
        if (supplierPricesData && supplierPricesData.length > 0) {
          const suppliersList = await getAllSuppliers();
          const pricesWithDetails = supplierPricesData.map(price => {
            const supplier = suppliersList.find(s => s.id === price.supplierId);
            return {
              ...price,
              supplierName: supplier ? supplier.name : 'Nieznany dostawca'
            };
          });
          setSupplierPrices(pricesWithDetails);
        }
        
        // Pobierz rezerwacje (transakcje typu 'booking')
        await fetchReservations(itemData);
        
        // Pobierz oczekiwane zamówienia
        fetchAwaitingOrders(id);
      } catch (error) {
        showError('Błąd podczas pobierania danych pozycji: ' + error.message);
        console.error('Error fetching item details:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchItemData();
    
    // Dodaj nasłuchiwanie na zdarzenie aktualizacji magazynu
    const handleInventoryUpdate = (event) => {
      // Sprawdź, czy aktualizacja dotyczy tego produktu
      if (event.detail && event.detail.itemId === id) {
        console.log('Wykryto aktualizację produktu, odświeżam dane...');
        fetchItemData();
      }
    };
    
    window.addEventListener('inventory-updated', handleInventoryUpdate);
    
    // Usuń nasłuchiwanie przy odmontowaniu komponentu
    return () => {
      window.removeEventListener('inventory-updated', handleInventoryUpdate);
    };
  }, [id, showError]);

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const getStockLevelIndicator = (quantity, minStock, maxStock) => {
    if (quantity <= 0) {
      return <Chip label="Brak" color="error" />;
    } else if (minStock && quantity <= minStock) {
      return <Chip label="Niski stan" color="warning" />;
    } else if (maxStock && quantity >= maxStock) {
      return <Chip label="Wysoki stan" color="info" />;
    } else {
      return <Chip label="Optymalny stan" color="success" />;
    }
  };

  // Sprawdź, czy są partie z krótkim terminem ważności (30 dni)
  const getExpiringBatches = () => {
    const today = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(today.getDate() + 30);
    
    return batches.filter(batch => {
      if (batch.quantity <= 0) return false;
      
      const expiryDate = batch.expiryDate instanceof Timestamp 
        ? batch.expiryDate.toDate() 
        : new Date(batch.expiryDate);
      
      return expiryDate > today && expiryDate <= thirtyDaysFromNow;
    });
  };
  
  // Sprawdź, czy są przeterminowane partie
  const getExpiredBatches = () => {
    const today = new Date();
    
    return batches.filter(batch => {
      if (batch.quantity <= 0) return false;
      
      const expiryDate = batch.expiryDate instanceof Timestamp 
        ? batch.expiryDate.toDate() 
        : new Date(batch.expiryDate);
      
      return expiryDate < today;
    });
  };
  
  const expiringBatches = getExpiringBatches();
  const expiredBatches = getExpiredBatches();

  // Funkcja otwierająca dialog etykiet
  const handleOpenLabelDialog = () => {
    setLabelDialogOpen(true);
  };
  
  // Funkcja zamykająca dialog etykiet
  const handleCloseLabelDialog = () => {
    setLabelDialogOpen(false);
  };

  // Funkcja do pobierania rezerwacji dla produktu
  const fetchReservations = async (itemData) => {
    try {
      // Pobierz zgrupowane rezerwacje zamiast pojedynczych transakcji
      const groupedReservations = await getReservationsGroupedByTask(itemData.id);
      
      console.log('Zgrupowane rezerwacje:', groupedReservations);
      
      // Ustaw rezerwacje
      setReservations(groupedReservations);
      
      // Zastosuj filtrowanie i sortowanie
      filterAndSortReservations(reservationFilter, reservationSortField, reservationSortOrder, groupedReservations);
    } catch (error) {
      console.error('Błąd podczas pobierania rezerwacji:', error);
      showError('Nie udało się pobrać listy rezerwacji');
    }
  };
  
  // Funkcja do filtrowania rezerwacji
  const handleFilterChange = (event) => {
    const filterValue = event.target.value;
    setReservationFilter(filterValue);
    
    filterAndSortReservations(filterValue, reservationSortField, reservationSortOrder);
  };
  
  // Funkcja do sortowania rezerwacji
  const handleSort = (field) => {
    const newSortOrder = field === reservationSortField && reservationSortOrder === 'asc' ? 'desc' : 'asc';
    setReservationSortOrder(newSortOrder);
    setReservationSortField(field);
    
    filterAndSortReservations(reservationFilter, field, newSortOrder);
  };
  
  // Funkcja do filtrowania i sortowania rezerwacji
  const filterAndSortReservations = (filterValue, field, order, data = reservations) => {
    let filtered = [...data];
    
    // Filtrowanie według statusu rezerwacji
    if (filterValue === 'active') {
      // Pokaż tylko aktywne rezerwacje (bez statusu lub ze statusem różnym od 'completed')
      filtered = filtered.filter(reservation => !reservation.status || reservation.status !== 'completed');
    } else if (filterValue === 'fulfilled') {
      // Pokaż tylko zakończone rezerwacje (ze statusem 'completed')
      filtered = filtered.filter(reservation => reservation.status === 'completed');
    }
    // Dla filterValue === 'all', pokazujemy wszystkie rezerwacje
    
    // Sortowanie
    filtered.sort((a, b) => {
      let valueA, valueB;
      
      // Pobierz wartości do porównania w zależności od pola
      if (field === 'createdAt') {
        valueA = new Date(a.createdAt?.seconds ? a.createdAt.toDate() : a.createdAt).getTime();
        valueB = new Date(b.createdAt?.seconds ? b.createdAt.toDate() : b.createdAt).getTime();
      } else if (field === 'quantity') {
        // W nowej strukturze mamy totalQuantity zamiast quantity
        valueA = a.totalQuantity;
        valueB = b.totalQuantity;
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

  // Funkcja do usuwania rezerwacji
  const handleDeleteReservation = async (taskId) => {
    if (!window.confirm('Czy na pewno chcesz usunąć tę rezerwację? Ta operacja jest nieodwracalna.')) {
      return;
    }
    
    try {
      let success = true;
      let allMessage = '';
      
      // Pobierz aktualną rezerwację
      const reservation = reservations.find(r => r.taskId === taskId);
      
      if (reservation && reservation.batches && reservation.batches.length > 0) {
        // Usuń wszystkie rezerwacje dla wszystkich partii
        for (const batch of reservation.batches) {
          try {
            const result = await deleteReservation(batch.reservationId, currentUser.uid);
            if (!result.success) {
              success = false;
              allMessage += result.message + '; ';
            }
          } catch (error) {
            console.error(`Błąd podczas usuwania rezerwacji partii ${batch.batchNumber}:`, error);
            success = false;
            allMessage += error.message + '; ';
          }
        }
      }
      
      if (success) {
        showSuccess('Rezerwacja została usunięta');
      } else {
        showError(allMessage || 'Nie udało się usunąć wszystkich rezerwacji');
      }
      
      // Odśwież dane
      await fetchReservations(item);
    } catch (error) {
      console.error('Błąd podczas usuwania rezerwacji:', error);
      showError(error.message || 'Wystąpił błąd podczas usuwania rezerwacji');
    }
  };

  // Funkcja do czyszczenia rezerwacji z usuniętych zadań
  const handleCleanupDeletedTaskReservations = async () => {
    if (!window.confirm('Czy na pewno chcesz usunąć wszystkie rezerwacje dla usuniętych zadań produkcyjnych? Ta operacja jest nieodwracalna.')) {
      return;
    }
    
    setUpdatingReservations(true);
    try {
      const result = await cleanupDeletedTaskReservations();
      
      if (result.count > 0) {
        showSuccess(`Usunięto ${result.count} rezerwacji z usuniętych zadań produkcyjnych.`);
      } else {
        showSuccess('Nie znaleziono rezerwacji do wyczyszczenia.');
      }
      
      // Odśwież dane po aktualizacji
      await fetchReservations(item);
    } catch (error) {
      console.error('Błąd podczas czyszczenia rezerwacji:', error);
      showError('Wystąpił błąd podczas czyszczenia rezerwacji');
    } finally {
      setUpdatingReservations(false);
    }
  };

  // Funkcja do czyszczenia wszystkich rezerwacji dla produktu
  const handleCleanupAllItemReservations = async () => {
    if (!window.confirm('Czy na pewno chcesz usunąć WSZYSTKIE rezerwacje dla tego produktu? Ta operacja jest nieodwracalna i wpłynie na zadania produkcyjne korzystające z tego surowca.')) {
      return;
    }
    
    setUpdatingReservations(true);
    try {
      const result = await cleanupItemReservations(item.id, currentUser.uid);
      
      if (result.count > 0) {
        showSuccess(`Usunięto wszystkie ${result.count} rezerwacji dla produktu.`);
      } else {
        showSuccess('Nie znaleziono rezerwacji do wyczyszczenia.');
      }
      
      // Odśwież dane po aktualizacji
      await fetchReservations(item);
    } catch (error) {
      console.error('Błąd podczas czyszczenia rezerwacji:', error);
      showError('Wystąpił błąd podczas czyszczenia rezerwacji');
    } finally {
      setUpdatingReservations(false);
    }
  };

  // Funkcja do odświeżania ilości towaru
  const handleRefreshQuantity = async () => {
    try {
      setRefreshingQuantity(true);
      const newQuantity = await recalculateItemQuantity(id);
      
      // Pobierz zaktualizowane dane pozycji
      const updatedItem = await getInventoryItemById(id);
      setItem(updatedItem);
      
      showSuccess(`Odświeżono ilość towaru. Aktualny stan: ${formatQuantity(newQuantity)} ${updatedItem.unit}`);
    } catch (error) {
      console.error('Błąd podczas odświeżania ilości:', error);
      showError('Wystąpił błąd podczas odświeżania ilości: ' + error.message);
    } finally {
      setRefreshingQuantity(false);
    }
  };

  // Funkcja do pobierania oczekiwanych zamówień
  const fetchAwaitingOrders = async (itemId) => {
    try {
      setAwaitingOrdersLoading(true);
      const awaitingOrdersData = await getAwaitingOrdersForInventoryItem(itemId);
      setAwaitingOrders(awaitingOrdersData);
    } catch (error) {
      console.error('Błąd podczas pobierania oczekiwanych zamówień:', error);
      showError('Nie udało się pobrać oczekujących zamówień: ' + error.message);
    } finally {
      setAwaitingOrdersLoading(false);
    }
  };

  if (loading) {
    return <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>Ładowanie danych...</Container>;
  }

  if (!item) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Typography variant="h5">Pozycja nie została znaleziona</Typography>
        <Button 
          variant="contained" 
          component={Link} 
          to="/inventory"
          startIcon={<ArrowBackIcon />}
          sx={{ mt: 2 }}
        >
          Powrót do magazynu
        </Button>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 2 : 0 }}>
        <Button 
          startIcon={<ArrowBackIcon />} 
          onClick={() => navigate('/inventory')}
          variant="outlined"
          sx={{ alignSelf: isMobile ? 'stretch' : 'flex-start' }}
        >
          Powrót
        </Button>
        <Typography variant="h5" fontWeight="bold" align={isMobile ? "center" : "left"}>
          Szczegóły pozycji magazynowej
        </Typography>
        <Box sx={{ 
          display: 'flex', 
          flexDirection: isMobile ? 'column' : 'row', 
          gap: isMobile ? 1 : 0,
          width: isMobile ? '100%' : 'auto'
        }}>
          <Tooltip title="Odśwież ilość towaru">
            <Button 
              variant="outlined" 
              onClick={handleRefreshQuantity}
              startIcon={refreshingQuantity ? <CircularProgress size={20} /> : <CachedIcon />}
              sx={{ mr: isMobile ? 0 : 1, mb: isMobile ? 1 : 0, width: '100%' }}
              disabled={refreshingQuantity}
            >
              Odśwież ilość
            </Button>
          </Tooltip>
          <Button 
            variant="outlined" 
            component={Link} 
            to={`/inventory/${id}/edit`}
            startIcon={<EditIcon />}
            sx={{ mr: isMobile ? 0 : 1, mb: isMobile ? 1 : 0, width: '100%' }}
          >
            Edytuj
          </Button>
          <Button 
            variant="outlined" 
            component={Link} 
            to={`/inventory/${id}/batches`}
            startIcon={<ViewListIcon />}
            sx={{ mr: isMobile ? 0 : 1, mb: isMobile ? 1 : 0, width: '100%' }}
          >
            Zarządzaj partiami
          </Button>
          <Button 
            variant="outlined"
            onClick={handleOpenLabelDialog}
            startIcon={<QrCodeIcon />}
            sx={{ 
              width: isMobile ? '100%' : 'auto',
              minWidth: isMobile ? 'auto' : '150px',
              whiteSpace: 'nowrap'
            }}
          >
            Drukuj etykietę
          </Button>
        </Box>
      </Box>

      {/* Sekcja głównych informacji */}
      <Paper elevation={3} sx={{ mb: 3, overflow: 'hidden', borderRadius: 2 }}>
        <Box sx={{ p: 3, bgcolor: theme => theme.palette.mode === 'dark' ? 'background.paper' : '#f8f9fa' }}>
          <Typography variant="h4" gutterBottom fontWeight="bold">
            {item.name}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Chip 
              label={item.category || 'Brak kategorii'} 
              color="primary" 
              sx={{ mr: 2, fontWeight: 'medium' }}
            />
            {getStockLevelIndicator(item.quantity, item.minStock, item.maxStock)}
          </Box>
          {item.description && (
            <Paper sx={{ p: 2, mb: 2, bgcolor: theme => theme.palette.mode === 'dark' ? 'background.paper' : 'white', borderRadius: 1 }}>
              <Typography variant="body1">
              {item.description}
            </Typography>
            </Paper>
          )}
        </Box>
        
        {/* Statystyki produktu */}
        <Box sx={{ 
          p: 3, 
          display: 'flex', 
          flexWrap: 'wrap', 
          gap: 4, 
          justifyContent: 'space-between', 
          borderTop: '1px solid',
          borderColor: theme => theme.palette.mode === 'dark' ? 'divider' : '#e0e0e0',
          bgcolor: theme => theme.palette.mode === 'dark' ? 'background.default' : 'white'
        }}>
          <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center',
            minWidth: '150px'
          }}>
            <Typography variant="h6" fontWeight="bold" color="primary">
              {formatQuantity(item.quantity)}
            </Typography>
            <Typography variant="subtitle1">
              {item.unit}
            </Typography>
            <Typography variant="body2" color="text.secondary">
                Stan magazynowy
              </Typography>
          </Box>

          <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center',
            minWidth: '150px'
          }}>
            <Typography variant="h6" fontWeight="bold">
              {item.location || 'Nie określono'}
              </Typography>
            <Typography variant="body2" color="text.secondary">
                Lokalizacja
              </Typography>
          </Box>

          <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center',
            minWidth: '150px'
          }}>
            <Typography variant="h6" fontWeight="bold">
              {item.minStock || 'Nie określono'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Min. ilość
            </Typography>
          </Box>

          <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center',
            minWidth: '150px'
          }}>
            <Typography variant="h6" fontWeight="bold">
              {item.maxStock || 'Nie określono'}
              </Typography>
            <Typography variant="body2" color="text.secondary">
              Maks. ilość
              </Typography>
          </Box>

          <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center',
            minWidth: '150px'
          }}>
            <Typography variant="h6" fontWeight="bold">
                {formatDate(item.updatedAt)}
              </Typography>
            <Typography variant="body2" color="text.secondary">
              Ostatnia aktualizacja
            </Typography>
          </Box>
        </Box>

        {/* Przyciski akcji */}
        <Box sx={{ 
          display: 'flex', 
          flexDirection: isMobile ? 'column' : 'row',
          p: 2, 
          borderTop: '1px solid',
          borderColor: theme => theme.palette.mode === 'dark' ? 'divider' : '#e0e0e0',
          bgcolor: theme => theme.palette.mode === 'dark' ? 'background.paper' : '#f8f9fa'
        }}>
          <Button 
            variant="contained" 
            color="success" 
            startIcon={<ReceiveIcon />}
            component={Link}
            to={`/inventory/${id}/receive`}
            sx={{ 
              mr: isMobile ? 0 : 2, 
              mb: isMobile ? 1 : 0,
              borderRadius: 4, 
              px: 3 
            }}
          >
            Przyjmij
          </Button>
          <Button 
            variant="contained" 
            color="warning" 
            startIcon={<IssueIcon />}
            component={Link}
            to={`/inventory/${id}/issue`}
            disabled={item.quantity <= 0}
            sx={{ 
              borderRadius: 4, 
              px: 3 
            }}
          >
            Wydaj
          </Button>
        </Box>
      </Paper>

      {/* Alerty */}
        {expiredBatches.length > 0 && (
        <Paper elevation={3} sx={{ mb: 3, overflow: 'hidden', borderRadius: 2 }}>
          <Alert severity="error" sx={{ borderRadius: 0 }}>
            <AlertTitle><strong>Przeterminowane partie</strong></AlertTitle>
            <Typography>
              W magazynie znajduje się <strong>{expiredBatches.length}</strong> {expiredBatches.length === 1 ? 'przeterminowana partia' : 
              expiredBatches.length < 5 ? 'przeterminowane partie' : 'przeterminowanych partii'} tego produktu.
              Łącznie <strong>{formatQuantity(expiredBatches.reduce((sum, batch) => sum + parseFloat(batch.quantity || 0), 0))} {item?.unit}</strong>.
            </Typography>
          </Alert>
        </Paper>
        )}
        
        {expiringBatches.length > 0 && (
        <Paper elevation={3} sx={{ mb: 3, overflow: 'hidden', borderRadius: 2 }}>
          <Alert severity="warning" sx={{ borderRadius: 0 }}>
            <AlertTitle><strong>Partie z krótkim terminem ważności</strong></AlertTitle>
            <Typography>
              W magazynie znajduje się <strong>{expiringBatches.length}</strong> {expiringBatches.length === 1 ? 'partia' : 
              expiringBatches.length < 5 ? 'partie' : 'partii'} tego produktu z terminem ważności krótszym niż 30 dni.
              Łącznie <strong>{formatQuantity(expiringBatches.reduce((sum, batch) => sum + parseFloat(batch.quantity || 0), 0))} {item?.unit}</strong>.
            </Typography>
          </Alert>
        </Paper>
      )}

      {/* Główne zakładki */}
      <Paper elevation={3} sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: theme => theme.palette.mode === 'dark' ? 'background.paper' : '#f8f9fa' }}>
          <Tabs 
            value={tabValue} 
            onChange={handleTabChange} 
            aria-label="item tabs"
            variant="fullWidth"
            textColor="primary"
            indicatorColor="primary"
          >
            <Tab label="Szczegółowe informacje" id="item-tab-0" sx={{ fontWeight: 'medium', py: 2 }} />
            <Tab label="Partie i daty ważności" id="item-tab-1" sx={{ fontWeight: 'medium', py: 2 }} />
            <Tab label="Historia transakcji" id="item-tab-2" sx={{ fontWeight: 'medium', py: 2 }} />
            <Tab label="Rezerwacje" id="item-tab-3" sx={{ fontWeight: 'medium', py: 2 }} />
            <Tab label="Oczekiwane" id="item-tab-4" sx={{ fontWeight: 'medium', py: 2 }} icon={<ClockIcon fontSize="small" sx={{ mr: 1 }} />} iconPosition="start" />
          </Tabs>
        </Box>

        {/* Zawartość zakładki Szczegółowe informacje */}
        <TabPanel value={tabValue} index={0}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Paper elevation={1} sx={{ p: 2, mb: 3, borderRadius: 2 }}>
                <Typography variant="h6" gutterBottom sx={{ borderBottom: '1px solid', borderColor: theme => theme.palette.mode === 'dark' ? 'divider' : '#e0e0e0', pb: 1, fontWeight: 'bold' }}>
                  Parametry magazynowe
                </Typography>
                <TableContainer>
                  <Table sx={{ '& td, & th': { borderBottom: '1px solid', borderColor: theme => theme.palette.mode === 'dark' ? 'divider' : '#f5f5f5', py: 1.5 } }}>
                    <TableBody>
                      <TableRow>
                        <TableCell component="th" sx={{ width: '40%', fontWeight: 'medium' }}>Numer CAS</TableCell>
                        <TableCell>{item.casNumber || 'Nie określono'}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell component="th" sx={{ width: '40%', fontWeight: 'medium' }}>Kod kreskowy</TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
                          {item.barcode || 'Nie określono'}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell component="th" sx={{ width: '40%', fontWeight: 'medium' }}>Minimalny stan</TableCell>
                        <TableCell>{item.minStock ? `${formatQuantity(item.minStock)} ${item.unit}` : 'Nie określono'}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell component="th" sx={{ fontWeight: 'medium' }}>Maksymalny stan</TableCell>
                        <TableCell>{item.maxStock ? `${formatQuantity(item.maxStock)} ${item.unit}` : 'Nie określono'}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell component="th" sx={{ fontWeight: 'medium' }}>Ilość kartonów na paletę</TableCell>
                        <TableCell>{item.boxesPerPallet ? `${formatQuantity(item.boxesPerPallet)} szt.` : 'Nie określono'}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell component="th" sx={{ fontWeight: 'medium' }}>Ilość produktu per karton</TableCell>
                        <TableCell>{item.itemsPerBox ? `${formatQuantity(item.itemsPerBox)} ${item.unit}` : 'Nie określono'}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>

              {supplierPrices.length > 0 && (
                <Paper elevation={1} sx={{ p: 2, borderRadius: 2 }}>
                  <Typography variant="h6" gutterBottom sx={{ borderBottom: '1px solid', borderColor: theme => theme.palette.mode === 'dark' ? 'divider' : '#e0e0e0', pb: 1, fontWeight: 'bold' }}>
                    Dostawcy i ceny
                  </Typography>
                  <TableContainer>
                    <Table size="small" sx={{ '& th': { fontWeight: 'bold', bgcolor: theme => theme.palette.mode === 'dark' ? 'background.default' : '#f8f9fa' } }}>
                      <TableHead>
                        <TableRow>
                          <TableCell>Dostawca</TableCell>
                          <TableCell align="right">Cena</TableCell>
                          <TableCell align="right">Min. ilość</TableCell>
                          <TableCell align="right">Czas dostawy</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {supplierPrices.map(price => (
                          <TableRow key={price.id} hover>
                            <TableCell sx={{ fontWeight: price.isDefault ? 'bold' : 'normal' }}>
                              {price.isDefault && <Chip size="small" label="Domyślny" color="primary" variant="outlined" sx={{ mr: 1, height: 20 }} />}
                              {price.supplierName}
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'medium' }}>
                              {price.price} {price.currency || item.currency || 'EUR'}
                            </TableCell>
                            <TableCell align="right">{price.minQuantity || 1} {item.unit}</TableCell>
                            <TableCell align="right">{price.leadTime || 7} dni</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>
              )}
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Paper elevation={1} sx={{ p: 2, mb: 3, borderRadius: 2 }}>
                <Typography variant="h6" gutterBottom sx={{ borderBottom: '1px solid', borderColor: theme => theme.palette.mode === 'dark' ? 'divider' : '#e0e0e0', pb: 1, fontWeight: 'bold' }}>
                  Dane finansowe
                </Typography>
                <TableContainer>
                  <Table sx={{ '& td, & th': { borderBottom: '1px solid', borderColor: theme => theme.palette.mode === 'dark' ? 'divider' : '#f5f5f5', py: 1.5 } }}>
                    <TableBody>
                      <TableRow>
                        <TableCell component="th" sx={{ width: '40%', fontWeight: 'medium' }}>Cena</TableCell>
                        <TableCell>{item.price ? `${item.price} ${item.currency || 'EUR'}` : 'Nie określono'}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell component="th" sx={{ fontWeight: 'medium' }}>Min. ilość</TableCell>
                        <TableCell>{item.minQuantity || 1} {item.unit}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell component="th" sx={{ fontWeight: 'medium' }}>Czas dostawy</TableCell>
                        <TableCell>{item.leadTime || 7} dni</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>

              <Paper elevation={1} sx={{ p: 2, mb: 3, borderRadius: 2 }}>
                <Typography variant="h6" gutterBottom sx={{ borderBottom: '1px solid', borderColor: theme => theme.palette.mode === 'dark' ? 'divider' : '#e0e0e0', pb: 1, fontWeight: 'bold' }}>
                  Opis i załączniki
                </Typography>
                <Box sx={{ p: 2, bgcolor: theme => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : '#fafafa', borderRadius: 1, minHeight: '200px' }}>
                  <Typography variant="body2">
                    {item.description || 'Brak opisu produktu.'}
                  </Typography>
                </Box>
              </Paper>
            </Grid>
          </Grid>
        </TabPanel>

        {/* Zawartość zakładki Partie */}
        <TabPanel value={tabValue} index={1}>
          <Box sx={{
            p: 2,
            mb: 2,
            borderRadius: 2,
            bgcolor: theme => theme.palette.mode === 'dark' ? 'background.paper' : 'white'
          }}>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
              Partie i daty ważności
            </Typography>
          </Box>
          
          {batches.length === 0 ? (
            <Paper elevation={1} sx={{ p: 3, borderRadius: 2, textAlign: 'center', bgcolor: theme => theme.palette.mode === 'dark' ? 'background.paper' : '#f8f9fa' }}>
            <Typography variant="body1">Brak zarejestrowanych partii dla tego produktu.</Typography>
            </Paper>
          ) : (
            <TableContainer component={Paper} sx={{ mt: 2, borderRadius: 2, overflow: 'hidden', elevation: 1 }}>
              <Table sx={{ '& th': { fontWeight: 'bold', bgcolor: theme => theme.palette.mode === 'dark' ? 'background.default' : '#f8f9fa' } }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Numer partii</TableCell>
                    <TableCell>Data ważności</TableCell>
                    <TableCell>Ilość</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Lokalizacja</TableCell>
                    <TableCell>Data przyjęcia</TableCell>
                    <TableCell>Notatki</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {batches
                    .sort((a, b) => {
                      const dateA = a.expiryDate instanceof Timestamp ? a.expiryDate.toDate() : new Date(a.expiryDate);
                      const dateB = b.expiryDate instanceof Timestamp ? b.expiryDate.toDate() : new Date(b.expiryDate);
                      return dateA - dateB;
                    })
                    .map(batch => {
                      const expiryDate = batch.expiryDate instanceof Timestamp 
                        ? batch.expiryDate.toDate() 
                        : new Date(batch.expiryDate);
                      
                      const receivedDate = batch.receivedDate instanceof Timestamp 
                        ? batch.receivedDate.toDate() 
                        : new Date(batch.receivedDate);
                      
                      const today = new Date();
                      const thirtyDaysFromNow = new Date();
                      thirtyDaysFromNow.setDate(today.getDate() + 30);
                      
                      let status = 'valid';
                      if (expiryDate < today) {
                        status = 'expired';
                      } else if (expiryDate <= thirtyDaysFromNow) {
                        status = 'expiring';
                      }
                      
                      return (
                        <TableRow 
                          key={batch.id} 
                          hover
                          sx={{
                            bgcolor: theme => 
                              status === 'expired' 
                                ? theme.palette.mode === 'dark' 
                                  ? 'rgba(255, 50, 50, 0.15)' 
                                  : 'rgba(255, 0, 0, 0.05)'
                                : status === 'expiring'
                                  ? theme.palette.mode === 'dark'
                                    ? 'rgba(255, 180, 50, 0.15)'
                                    : 'rgba(255, 152, 0, 0.05)'
                                  : 'inherit'
                          }}
                        >
                          <TableCell sx={{ fontWeight: 'medium' }}>{batch.batchNumber || '-'}</TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                              <Typography sx={{ fontWeight: 'medium' }}>
                            {expiryDate.toLocaleDateString('pl-PL')}
                              </Typography>
                            {status === 'expired' && (
                              <Chip 
                                size="small" 
                                label="Przeterminowane" 
                                color="error" 
                                sx={{ ml: 1 }} 
                              />
                            )}
                            {status === 'expiring' && (
                              <Chip 
                                size="small" 
                                label="Wkrótce wygaśnie" 
                                color="warning" 
                                sx={{ ml: 1 }} 
                              />
                            )}
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                              <Typography sx={{ fontWeight: 'medium' }}>
                            {batch.quantity} {item.unit}
                              </Typography>
                            {batch.quantity === 0 && (
                              <Chip 
                                size="small" 
                                label="Wydane" 
                                color="default" 
                                sx={{ ml: 1 }} 
                              />
                            )}
                            </Box>
                          </TableCell>
                          <TableCell>
                            {status === 'expired' && 'Przeterminowane'}
                            {status === 'expiring' && 'Kończy się termin'}
                            {status === 'valid' && batch.quantity > 0 && 'Dostępne'}
                            {batch.quantity <= 0 && 'Wydane'}
                          </TableCell>
                          <TableCell>{batch.warehouseName || '-'}</TableCell>
                          <TableCell>{receivedDate.toLocaleDateString('pl-PL')}</TableCell>
                          <TableCell>{batch.notes || '-'}</TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </TabPanel>

        <TabPanel value={tabValue} index={2}>
          <Box sx={{
            p: 2,
            mb: 2,
            borderRadius: 2,
            bgcolor: theme => theme.palette.mode === 'dark' ? 'background.paper' : 'white'
          }}>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
              Historia transakcji
            </Typography>
          </Box>
          
          {transactions.length === 0 ? (
            <Typography variant="body1" align="center">
              Brak historii transakcji dla tej pozycji
            </Typography>
          ) : (
            <TableContainer>
              <Table sx={{ '& thead th': { fontWeight: 'bold', bgcolor: theme => theme.palette.mode === 'dark' ? 'background.default' : '#f8f9fa' } }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Data</TableCell>
                    <TableCell>Ilość</TableCell>
                    <TableCell>Powód</TableCell>
                    <TableCell>Referencja</TableCell>
                    <TableCell>Magazyn</TableCell>
                    <TableCell>Notatki</TableCell>
                    <TableCell>Użytkownik</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {transactions.map((transaction) => {
                    // Pobierz datę transakcji - używamy transactionDate lub createdAt
                    const transactionDate = transaction.transactionDate || transaction.createdAt || null;
                    
                    // Przygotuj nazwę magazynu - pobierz z bazy magazynów jeśli to możliwe
                    const warehouseName = transaction.warehouseName || 
                                          (transaction.warehouseId ? 
                                            batches.find(b => b.warehouseId === transaction.warehouseId)?.warehouseName || 
                                            transaction.warehouseId : '—');
                    
                    // Popraw format notatek, zastępując ID MO numerem MO
                    let notesText = transaction.notes || '—';
                    if (notesText.includes('MO:') && transaction.moNumber) {
                      // Zastąp ID zadania numerem MO
                      notesText = notesText.replace(/MO: ([a-zA-Z0-9]+)/, `MO: ${transaction.moNumber}`);
                    }
                    
                    return (
                      <TableRow key={transaction.id}>
                        <TableCell>{transactionDate ? formatDateTime(transactionDate) : '—'}</TableCell>
                        <TableCell>{transaction.quantity} {item.unit}</TableCell>
                        <TableCell>{transaction.reason || '—'}</TableCell>
                        <TableCell>{transaction.moNumber || transaction.reference || '—'}</TableCell>
                        <TableCell>{warehouseName}</TableCell>
                        <TableCell>{notesText}</TableCell>
                        <TableCell>{userNames[transaction.createdBy] || transaction.createdBy || '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </TabPanel>

        <TabPanel value={tabValue} index={3}>
          <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2, borderRadius: 2, bgcolor: theme => theme.palette.mode === 'dark' ? 'background.paper' : 'white' }}>
            <Typography variant="h6" sx={{ fontWeight: 'bold' }}>Rezerwacje produktu</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Button 
                startIcon={updatingReservations ? <CircularProgress size={20} /> : <RefreshIcon />} 
                onClick={() => fetchReservations(item)}
                variant="outlined"
                disabled={updatingReservations}
                sx={{ mr: 2 }}
              >
                Odśwież
              </Button>
              <Button 
                startIcon={updatingReservations ? <CircularProgress size={20} /> : <DeleteIcon />} 
                onClick={handleCleanupDeletedTaskReservations}
                variant="outlined"
                color="warning"
                disabled={updatingReservations}
                sx={{ mr: 2 }}
              >
                {updatingReservations ? 'Czyszczenie...' : 'Usuń rezerwacje usuniętych MO'}
              </Button>
              <FormControl variant="outlined" size="small" sx={{ minWidth: 150, mr: 2 }}>
                <InputLabel id="reservation-filter-label">Filtruj</InputLabel>
                <Select
                  labelId="reservation-filter-label"
                  value={reservationFilter}
                  onChange={handleFilterChange}
                  label="Filtruj"
                >
                  <MenuItem value="all">Wszystkie</MenuItem>
                  <MenuItem value="active">Tylko aktywne</MenuItem>
                  <MenuItem value="fulfilled">Tylko zakończone</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Box>
          
          {filteredReservations.length === 0 ? (
            <Alert severity="info">Brak rezerwacji dla tego produktu.</Alert>
          ) : (
            <TableContainer component={Paper} elevation={0} variant="outlined">
              <Table sx={{ '& thead th': { fontWeight: 'bold', bgcolor: theme => theme.palette.mode === 'dark' ? 'background.default' : '#f8f9fa' } }}>
                <TableHead>
                  <TableRow>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        Data rezerwacji
                        <IconButton size="small" onClick={() => handleSort('createdAt')}>
                          <SortIcon />
                        </IconButton>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        Ilość
                        <IconButton size="small" onClick={() => handleSort('quantity')}>
                          <SortIcon />
                        </IconButton>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        Zadanie produkcyjne
                        <IconButton size="small" onClick={() => handleSort('taskNumber')}>
                          <SortIcon />
                        </IconButton>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        Nr MO
                        <IconButton size="small" onClick={() => handleSort('moNumber')}>
                          <SortIcon />
                        </IconButton>
                      </Box>
                    </TableCell>
                    <TableCell>Partia</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Akcje</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredReservations.map((reservation) => {
                    const createdDate = reservation.createdAt?.seconds ? 
                      reservation.createdAt.toDate() : 
                      new Date(reservation.createdAt);
                      
                    return (
                      <TableRow key={reservation.taskId} hover>
                        <TableCell>
                          {formatDate(createdDate)}
                        </TableCell>
                        <TableCell>
                          <Typography fontWeight="bold">
                            {reservation.totalQuantity} {item.unit}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {reservation.taskName || '—'}
                        </TableCell>
                        <TableCell>
                          {reservation.moNumber || '—'}
                        </TableCell>
                        <TableCell>
                          {reservation.batches?.map((batch, batchIndex) => (
                            <Box key={batchIndex} sx={{ mb: 1 }}>
                              {batch.batchNumber}
                            </Box>
                          )) || '—'}
                        </TableCell>
                        <TableCell>
                          <Chip 
                            label={reservation.status === 'completed' ? 'Zakończona' : 'Aktywna'} 
                            color={reservation.status === 'completed' ? 'default' : 'secondary'} 
                            size="small"
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Box>
                            <IconButton 
                              size="small" 
                              color="error" 
                              onClick={() => handleDeleteReservation(reservation.taskId)}
                              aria-label="Usuń rezerwację"
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </TabPanel>

        {/* Zawartość zakładki Oczekiwane */}
        <TabPanel value={tabValue} index={4}>
          <Box sx={{
            p: 2,
            mb: 2,
            borderRadius: 2,
            bgcolor: theme => theme.palette.mode === 'dark' ? 'background.paper' : 'white',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', mb: 0 }}>
              Oczekiwane pozycje z zamówień zakupowych
            </Typography>
            <Button 
              variant="outlined" 
              startIcon={awaitingOrdersLoading ? <CircularProgress size={20} /> : <RefreshIcon />}
              onClick={() => fetchAwaitingOrders(id)}
              disabled={awaitingOrdersLoading}
            >
              Odśwież
            </Button>
          </Box>
          
          {awaitingOrdersLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          ) : awaitingOrders.length === 0 ? (
            <Alert severity="info" sx={{ mt: 2 }}>
              Brak oczekujących zamówień dla tego produktu.
            </Alert>
          ) : (
            <TableContainer component={Paper} sx={{ mt: 2, borderRadius: 2, overflow: 'hidden', elevation: 1 }}>
              <Table sx={{ '& th': { fontWeight: 'bold', bgcolor: theme => theme.palette.mode === 'dark' ? 'background.default' : '#f8f9fa' } }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Nr zamówienia</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Zamówione</TableCell>
                    <TableCell>Otrzymane</TableCell>
                    <TableCell>Pozostało</TableCell>
                    <TableCell>Cena jednostkowa</TableCell>
                    <TableCell>Data zamówienia</TableCell>
                    <TableCell>Oczekiwana dostawa</TableCell>
                    <TableCell>Tymczasowe ID</TableCell>
                    <TableCell>Akcje</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {awaitingOrders.map(order => {
                    const statusText = (() => {
                      switch(order.status) {
                        case 'pending': return 'Oczekujące';
                        case 'approved': return 'Zatwierdzone';
                        case 'ordered': return 'Zamówione';
                        case 'confirmed': return 'Potwierdzone';
                        case 'partial': return 'Częściowo dostarczone';
                        default: return order.status;
                      }
                    })();
                    
                    const statusColor = (() => {
                      switch(order.status) {
                        case 'pending': return '#757575'; // szary - oczekujące
                        case 'approved': return '#ffeb3b'; // żółty - zatwierdzone
                        case 'ordered': return '#1976d2'; // niebieski - zamówione
                        case 'partial': return '#81c784'; // jasno zielony - częściowo dostarczone
                        case 'confirmed': return '#4caf50'; // oryginalny zielony
                        default: return '#757575'; // oryginalny szary
                      }
                    })();
                    
                    // Iteruj przez wszystkie pozycje w zamówieniu
                    return order.items.map((orderItem, itemIndex) => {
                      // Sprawdź, czy zamówienie jest opóźnione
                      const isOverdue = orderItem.expectedDeliveryDate && new Date(orderItem.expectedDeliveryDate) < new Date();
                      
                      return (
                        <TableRow key={`${order.id}-${itemIndex}`} hover>
                          <TableCell>
                            <Link to={`/purchase-orders/${order.id}`} style={{ textDecoration: 'none', color: 'inherit', fontWeight: 'bold' }}>
                              {order.number || orderItem.poNumber}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Chip 
                              label={statusText} 
                              size="small"
                              sx={{
                                backgroundColor: statusColor,
                                color: order.status === 'approved' ? 'black' : 'white'
                              }}
                            />
                          </TableCell>
                          <TableCell align="right">
                            {orderItem.quantityOrdered} {orderItem.unit}
                          </TableCell>
                          <TableCell align="right">
                            {orderItem.quantityReceived} {orderItem.unit}
                          </TableCell>
                          <TableCell align="right">
                            <Typography fontWeight="bold" color={orderItem.quantityRemaining > 0 ? 'primary' : 'success'}>
                              {orderItem.quantityRemaining} {orderItem.unit}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            {orderItem.unitPrice ? `${Number(orderItem.unitPrice).toFixed(2)} ${orderItem.currency || 'EUR'}` : '-'}
                          </TableCell>
                          <TableCell>
                            {order.orderDate ? new Date(order.orderDate).toLocaleDateString('pl-PL') : '-'}
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                              {orderItem.expectedDeliveryDate ? (
                                <>
                                  {new Date(orderItem.expectedDeliveryDate).toLocaleDateString('pl-PL')}
                                  {isOverdue && (
                                    <Chip 
                                      size="small" 
                                      label="Opóźnione" 
                                      color="error" 
                                      sx={{ ml: 1 }} 
                                    />
                                  )}
                                </>
                              ) : '-'}
                            </Box>
                          </TableCell>
                          <TableCell>
                            {order.id ? `temp-${order.id.substring(0, 8)}` : '-'}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outlined"
                              size="small"
                              component={Link}
                              to={`/purchase-orders/${order.id}`}
                            >
                              Szczegóły
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    });
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </TabPanel>
      </Paper>
    </Container>
  );
};

export default ItemDetailsPage;