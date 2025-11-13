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
  useTheme,
  Skeleton
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
import { getInventoryItemById, getItemBatches, getSupplierPrices, deleteReservation, cleanupDeletedTaskReservations, getReservationsGroupedByTask, cleanupItemReservations, getAllWarehouses, recalculateItemQuantity, getAwaitingOrdersForInventoryItem } from '../../services/inventory';
import { getAllSuppliers, getSuppliersByIds } from '../../services/supplierService';
import { useNotification } from '../../hooks/useNotification';
import { useAuth } from '../../hooks/useAuth';
import { useTranslation } from '../../hooks/useTranslation';
import { formatDate, formatDateTime, formatQuantity } from '../../utils/formatters';
import { Timestamp } from 'firebase/firestore';
import LabelDialog from '../../components/inventory/LabelDialog';

// Lazy-loaded zakładki
const BatchesTab = React.lazy(() => import('./ItemDetailsTabs/BatchesTab'));
const TransactionsTab = React.lazy(() => import('./ItemDetailsTabs/TransactionsTab'));
const ReservationsTab = React.lazy(() => import('./ItemDetailsTabs/ReservationsTab'));
const AwaitingTab = React.lazy(() => import('./ItemDetailsTabs/AwaitingTab'));

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
  const { t } = useTranslation();
  const [item, setItem] = useState(null);

  const [batches, setBatches] = useState([]);
  const [supplierPrices, setSupplierPrices] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Progressive loading states
  const [loadingStates, setLoadingStates] = useState({
    item: true,
    batches: true,
    suppliers: true,
    reservations: true,
    awaiting: true
  });
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

  
  // Dodajemy wykrywanie urządzeń mobilnych
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Helper function do aktualizacji stanów ładowania
  const updateLoadingState = (key, value) => {
    setLoadingStates(prev => ({ ...prev, [key]: value }));
  };



  useEffect(() => {
    const fetchItemData = async () => {
      try {
        setLoading(true);
        
        // 🚀 ROZWIĄZANIE 1: Równoległe wywołania podstawowych danych
        const [
          itemResult,
          batchesResult,
          warehousesResult
        ] = await Promise.allSettled([
          getInventoryItemById(id),
          getItemBatches(id),
          getAllWarehouses()
        ]);

        // Obsługa wyników z error handling
        const itemData = itemResult.status === 'fulfilled' ? itemResult.value : null;
        const batchesData = batchesResult.status === 'fulfilled' ? batchesResult.value : [];
        const warehousesData = warehousesResult.status === 'fulfilled' ? warehousesResult.value : [];

        if (!itemData) {
          throw new Error('Nie udało się pobrać danych pozycji magazynowej');
        }

        // 🚀 ROZWIĄZANIE 5: Progressive Loading - pokazuj dane jak się ładują
        setItem(itemData);
        updateLoadingState('item', false);
        
        // Pobierz informacje o powiązanym kartonie jeśli istnieje
        if (itemData.parentPackageItemId) {
          try {
            const parentPackageItem = await getInventoryItemById(itemData.parentPackageItemId);
            itemData.parentPackageItem = parentPackageItem;
            setItem({ ...itemData }); // Re-render z parent package
          } catch (error) {
            console.error(t('inventory.itemDetails.errorFetchingLinkedPackage'), error);
            itemData.parentPackageItem = null;
          }
        }
        
        // Przetwórz partie z nazwami magazynów
        const batchesWithWarehouseNames = batchesData.map(batch => {
          const warehouse = warehousesData.find(w => w.id === batch.warehouseId);
          return {
            ...batch,
            warehouseName: warehouse?.name || 'Magazyn podstawowy'
          };
        });
        setBatches(batchesWithWarehouseNames);
        updateLoadingState('batches', false);

        // 🚀 ROZWIĄZANIE 2: Optymalizacja pobierania dostawców - tylko potrzebni
        const supplierPricesPromise = getSupplierPrices(id).then(async (supplierPricesData) => {
        if (supplierPricesData && supplierPricesData.length > 0) {
            // Pobierz tylko potrzebnych dostawców (nie wszystkich)
            const supplierIds = [...new Set(supplierPricesData.map(p => p.supplierId))];
            const relevantSuppliers = await getSuppliersByIds(supplierIds);
            
          const pricesWithDetails = supplierPricesData.map(price => {
              const supplier = relevantSuppliers.find(s => s.id === price.supplierId);
            return {
              ...price,
              supplierName: supplier ? supplier.name : 'Nieznany dostawca'
            };
          });
          setSupplierPrices(pricesWithDetails);
        }
          updateLoadingState('suppliers', false);
        }).catch(error => {
          console.warn('Nie udało się pobrać cen dostawców:', error);
          updateLoadingState('suppliers', false);
        });

        // 🚀 ROZWIĄZANIE 3: Lazy loading dla zakładek - uruchom równolegle ale nie blokuj głównego UI
        const reservationsPromise = fetchReservations(itemData).then(() => {
          updateLoadingState('reservations', false);
        }).catch(error => {
          console.warn('Nie udało się pobrać rezerwacji:', error);
          updateLoadingState('reservations', false);
        });

        const awaitingPromise = fetchAwaitingOrders(id).then(() => {
          updateLoadingState('awaiting', false);
        }).catch(error => {
          console.warn('Nie udało się pobrać oczekujących zamówień:', error);
          updateLoadingState('awaiting', false);
        });

        // Poczekaj na wszystkie sekundarne operacje
        await Promise.allSettled([
          supplierPricesPromise,
          reservationsPromise,
          awaitingPromise
        ]);

      } catch (error) {
        showError(t('inventory.itemDetails.errorFetchingData') + ': ' + error.message);
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

  // Sprawdź, czy są partie z krótkim terminem ważności (12 miesięcy)
  const getExpiringBatches = () => {
    const today = new Date();
    const twelveMonthsFromNow = new Date();
    twelveMonthsFromNow.setMonth(today.getMonth() + 12);
    
    return batches.filter(batch => {
      if (batch.quantity <= 0) return false;
      
      const expiryDate = batch.expiryDate instanceof Timestamp 
        ? batch.expiryDate.toDate() 
        : new Date(batch.expiryDate);
      
      return expiryDate > today && expiryDate <= twelveMonthsFromNow;
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
      
      showSuccess(t('inventory.itemDetails.quantityRefreshed', { quantity: formatQuantity(newQuantity), unit: updatedItem.unit }));
    } catch (error) {
      console.error(t('inventory.itemDetails.errorRefreshingQuantity'), error);
      showError(t('inventory.itemDetails.errorRefreshingQuantityMessage') + ': ' + error.message);
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
      console.error(t('inventory.itemDetails.errorFetchingAwaitingOrders'), error);
      showError(t('inventory.itemDetails.errorFetchingAwaitingOrdersMessage') + ': ' + error.message);
    } finally {
      setAwaitingOrdersLoading(false);
    }
  };

  if (loading) {
    return <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>{t('common.loading')}</Container>;
  }

  if (!item) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Typography variant="h5">{t('inventory.itemDetails.itemNotFound')}</Typography>
        <Button 
          variant="contained" 
          component={Link} 
          to="/inventory"
          startIcon={<ArrowBackIcon />}
          sx={{ mt: 2 }}
        >
          {t('inventory.itemDetails.backToInventory')}
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
          {t('common.back')}
        </Button>
        <Typography variant="h5" fontWeight="bold" align={isMobile ? "center" : "left"}>
          {t('inventory.itemDetails.title')}
        </Typography>
        <Box sx={{ 
          display: 'flex', 
          flexDirection: isMobile ? 'column' : 'row', 
          gap: isMobile ? 1 : 0,
          width: isMobile ? '100%' : 'auto'
        }}>
          <Tooltip title={t('inventory.itemDetails.refreshQuantity')}>
            <Button 
              variant="outlined" 
              onClick={handleRefreshQuantity}
              startIcon={refreshingQuantity ? <CircularProgress size={20} /> : <CachedIcon />}
              sx={{ mr: isMobile ? 0 : 1, mb: isMobile ? 1 : 0, width: '100%' }}
              disabled={refreshingQuantity}
            >
              {t('inventory.itemDetails.refreshQuantityButton')}
            </Button>
          </Tooltip>
          <Button 
            variant="outlined" 
            component={Link} 
            to={`/inventory/${id}/edit`}
            startIcon={<EditIcon />}
            sx={{ mr: isMobile ? 0 : 1, mb: isMobile ? 1 : 0, width: '100%' }}
          >
            {t('common.edit')}
          </Button>
          <Button 
            variant="outlined" 
            component={Link} 
            to={`/inventory/${id}/batches`}
            startIcon={<ViewListIcon />}
            sx={{ mr: isMobile ? 0 : 1, mb: isMobile ? 1 : 0, width: '100%' }}
          >
            {t('inventory.itemDetails.manageBatches')}
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
            {t('inventory.itemDetails.printLabel')}
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
              label={item.category || t('inventory.itemDetails.noCategory')} 
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
                {t('inventory.itemDetails.stockLevel')}
              </Typography>
          </Box>

          <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center',
            minWidth: '150px'
          }}>
            <Typography variant="h6" fontWeight="bold">
              {item.location || t('inventory.itemDetails.notSpecified')}
              </Typography>
            <Typography variant="body2" color="text.secondary">
                {t('inventory.itemDetails.location')}
              </Typography>
          </Box>

          <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center',
            minWidth: '150px'
          }}>
            <Typography variant="h6" fontWeight="bold">
              {item.minStock || t('inventory.itemDetails.notSpecified')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('inventory.itemDetails.minQuantity')}
            </Typography>
          </Box>

          <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center',
            minWidth: '150px'
          }}>
            <Typography variant="h6" fontWeight="bold">
              {item.maxStock || t('inventory.itemDetails.notSpecified')}
              </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('inventory.itemDetails.maxQuantity')}
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
              {t('inventory.itemDetails.lastUpdate')}
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
            {t('inventory.itemDetails.receive')}
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
            {t('inventory.itemDetails.issue')}
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
              expiringBatches.length < 5 ? 'partie' : 'partii'} tego produktu z terminem ważności krótszym niż 12 miesięcy.
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
            <Tab label={t('inventory.itemDetails.tabs.detailedInfo')} id="item-tab-0" sx={{ fontWeight: 'medium', py: 2 }} />
            <Tab label={t('inventory.itemDetails.tabs.batchesAndExpiry')} id="item-tab-1" sx={{ fontWeight: 'medium', py: 2 }} />
            <Tab label={t('inventory.itemDetails.tabs.transactionHistory')} id="item-tab-2" sx={{ fontWeight: 'medium', py: 2 }} />
            <Tab label={t('inventory.itemDetails.tabs.reservations')} id="item-tab-3" sx={{ fontWeight: 'medium', py: 2 }} />
            <Tab label={t('inventory.itemDetails.tabs.awaiting')} id="item-tab-4" sx={{ fontWeight: 'medium', py: 2 }} icon={<ClockIcon fontSize="small" sx={{ mr: 1 }} />} iconPosition="start" />
          </Tabs>
        </Box>

        {/* Zawartość zakładki Szczegółowe informacje */}
        <TabPanel value={tabValue} index={0}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Paper elevation={1} sx={{ p: 2, mb: 3, borderRadius: 2 }}>
                <Typography variant="h6" gutterBottom sx={{ borderBottom: '1px solid', borderColor: theme => theme.palette.mode === 'dark' ? 'divider' : '#e0e0e0', pb: 1, fontWeight: 'bold' }}>
                  {t('inventory.itemDetails.warehouseParameters')}
                </Typography>
                <TableContainer>
                  <Table sx={{ '& td, & th': { borderBottom: '1px solid', borderColor: theme => theme.palette.mode === 'dark' ? 'divider' : '#f5f5f5', py: 1.5 } }}>
                    <TableBody>
                      <TableRow>
                        <TableCell component="th" sx={{ width: '40%', fontWeight: 'medium' }}>{t('inventory.itemDetails.casNumber')}</TableCell>
                        <TableCell>{item.casNumber || t('inventory.itemDetails.notSpecified')}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell component="th" sx={{ width: '40%', fontWeight: 'medium' }}>{t('inventory.itemDetails.barcode')}</TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
                          {item.barcode || t('inventory.itemDetails.notSpecified')}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell component="th" sx={{ width: '40%', fontWeight: 'medium' }}>{t('inventory.itemDetails.minimumStock')}</TableCell>
                        <TableCell>{item.minStock ? `${formatQuantity(item.minStock)} ${item.unit}` : t('inventory.itemDetails.notSpecified')}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell component="th" sx={{ fontWeight: 'medium' }}>{t('inventory.itemDetails.maximumStock')}</TableCell>
                        <TableCell>{item.maxStock ? `${formatQuantity(item.maxStock)} ${item.unit}` : t('inventory.itemDetails.notSpecified')}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell component="th" sx={{ fontWeight: 'medium' }}>{t('inventory.itemDetails.boxesPerPallet')}</TableCell>
                        <TableCell>{item.boxesPerPallet ? `${formatQuantity(item.boxesPerPallet)} ${t('common.pieces')}` : t('inventory.itemDetails.notSpecified')}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell component="th" sx={{ fontWeight: 'medium' }}>{t('inventory.itemDetails.itemsPerBox')}</TableCell>
                        <TableCell>{item.itemsPerBox ? `${formatQuantity(item.itemsPerBox)} ${item.unit}` : t('inventory.itemDetails.notSpecified')}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell component="th" sx={{ fontWeight: 'medium' }}>{t('inventory.itemDetails.weight')}</TableCell>
                        <TableCell>{item.weight ? `${formatQuantity(item.weight)} kg` : t('inventory.itemDetails.notSpecified')}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell component="th" sx={{ fontWeight: 'medium' }}>{t('inventory.itemDetails.linkedPackage')}</TableCell>
                        <TableCell>
                          {item.parentPackageItem ? (
                            <Typography 
                              component="span"
                              sx={{ 
                                color: 'primary.main',
                                cursor: 'pointer',
                                textDecoration: 'underline',
                                '&:hover': { textDecoration: 'none' }
                              }}
                              onClick={() => navigate(`/inventory/${item.parentPackageItem.id}`)}
                            >
                              {item.parentPackageItem.name}
                            </Typography>
                          ) : t('inventory.itemDetails.notSpecified')}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>

              {/* 🚀 ROZWIĄZANIE 5: Progressive Loading UI dla dostawców */}
              {loadingStates.suppliers ? (
                <Paper elevation={1} sx={{ p: 2, borderRadius: 2 }}>
                  <Typography variant="h6" gutterBottom sx={{ borderBottom: '1px solid', borderColor: theme => theme.palette.mode === 'dark' ? 'divider' : '#e0e0e0', pb: 1, fontWeight: 'bold' }}>
                    {t('inventory.itemDetails.suppliersAndPrices')}
                  </Typography>
                  <Skeleton variant="rectangular" height={150} />
                </Paper>
              ) : supplierPrices.length > 0 ? (
                <Paper elevation={1} sx={{ p: 2, borderRadius: 2 }}>
                  <Typography variant="h6" gutterBottom sx={{ borderBottom: '1px solid', borderColor: theme => theme.palette.mode === 'dark' ? 'divider' : '#e0e0e0', pb: 1, fontWeight: 'bold' }}>
                    {t('inventory.itemDetails.suppliersAndPrices')}
                  </Typography>
                  <TableContainer>
                    <Table size="small" sx={{ '& th': { fontWeight: 'bold', bgcolor: theme => theme.palette.mode === 'dark' ? 'background.default' : '#f8f9fa' } }}>
                      <TableHead>
                        <TableRow>
                          <TableCell>{t('inventory.itemDetails.supplier')}</TableCell>
                          <TableCell align="right">{t('inventory.itemDetails.price')}</TableCell>
                          <TableCell align="right">{t('inventory.itemDetails.minQuantityTable')}</TableCell>
                          <TableCell align="right">{t('inventory.itemDetails.deliveryTime')}</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {supplierPrices.map(price => (
                          <TableRow key={price.id} hover>
                            <TableCell sx={{ fontWeight: price.isDefault ? 'bold' : 'normal' }}>
                              {price.isDefault && <Chip size="small" label={t('inventory.itemDetails.default')} color="primary" variant="outlined" sx={{ mr: 1, height: 20 }} />}
                              {price.supplierName}
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'medium' }}>
                              {price.price} {price.currency || item.currency || 'EUR'}
                            </TableCell>
                            <TableCell align="right">{price.minQuantity || 1} {item.unit}</TableCell>
                            <TableCell align="right">{price.leadTime || 7} {t('common.days')}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>
              ) : null}
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Paper elevation={1} sx={{ p: 2, mb: 3, borderRadius: 2 }}>
                <Typography variant="h6" gutterBottom sx={{ borderBottom: '1px solid', borderColor: theme => theme.palette.mode === 'dark' ? 'divider' : '#e0e0e0', pb: 1, fontWeight: 'bold' }}>
                  {t('inventory.itemDetails.financialData')}
                </Typography>
                <TableContainer>
                  <Table sx={{ '& td, & th': { borderBottom: '1px solid', borderColor: theme => theme.palette.mode === 'dark' ? 'divider' : '#f5f5f5', py: 1.5 } }}>
                    <TableBody>
                      <TableRow>
                        <TableCell component="th" sx={{ width: '40%', fontWeight: 'medium' }}>{t('inventory.itemDetails.price')}</TableCell>
                        <TableCell>{item.price ? `${item.price} ${item.currency || 'EUR'}` : t('inventory.itemDetails.notSpecified')}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell component="th" sx={{ fontWeight: 'medium' }}>{t('inventory.itemDetails.minQuantityTable')}</TableCell>
                        <TableCell>{item.minQuantity || 1} {item.unit}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell component="th" sx={{ fontWeight: 'medium' }}>{t('inventory.itemDetails.deliveryTime')}</TableCell>
                        <TableCell>{item.leadTime || 7} {t('common.days')}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>

              <Paper elevation={1} sx={{ p: 2, mb: 3, borderRadius: 2 }}>
                <Typography variant="h6" gutterBottom sx={{ borderBottom: '1px solid', borderColor: theme => theme.palette.mode === 'dark' ? 'divider' : '#e0e0e0', pb: 1, fontWeight: 'bold' }}>
                  {t('inventory.itemDetails.descriptionAndAttachments')}
                </Typography>
                <Box sx={{ p: 2, bgcolor: theme => theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : '#fafafa', borderRadius: 1, minHeight: '200px' }}>
                  <Typography variant="body2">
                    {item.description || t('inventory.itemDetails.noDescription')}
                  </Typography>
                </Box>
              </Paper>
            </Grid>
          </Grid>
        </TabPanel>

        {/* Zawartość zakładki Partie */}
        <TabPanel value={tabValue} index={1}>
          <React.Suspense fallback={<Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>}>
            <BatchesTab t={t} batches={batches} itemUnit={item.unit} />
          </React.Suspense>
        </TabPanel>

        <TabPanel value={tabValue} index={2}>
          <React.Suspense fallback={<Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>}>
            <TransactionsTab 
              t={t}
              itemId={id}
              itemUnit={item.unit}
              batches={batches}
              formatDateTime={formatDateTime}
            />
          </React.Suspense>
        </TabPanel>

        <TabPanel value={tabValue} index={3}>
          <React.Suspense fallback={<Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>}>
            <ReservationsTab 
              t={t}
              updatingReservations={updatingReservations}
              reservationFilter={reservationFilter}
              handleFilterChange={handleFilterChange}
              handleSort={handleSort}
              filteredReservations={filteredReservations}
              itemUnit={item.unit}
              handleDeleteReservation={handleDeleteReservation}
              fetchReservations={fetchReservations}
              item={item}
              handleCleanupDeletedTaskReservations={handleCleanupDeletedTaskReservations}
            />
          </React.Suspense>
        </TabPanel>

        {/* Zawartość zakładki Oczekiwane */}
        <TabPanel value={tabValue} index={4}>
          <React.Suspense fallback={<Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}><CircularProgress /></Box>}>
            <AwaitingTab 
              t={t}
              awaitingOrders={awaitingOrders}
              awaitingOrdersLoading={awaitingOrdersLoading}
              fetchAwaitingOrders={fetchAwaitingOrders}
              itemId={id}
            />
          </React.Suspense>
        </TabPanel>
      </Paper>

      {/* Dialog do drukowania etykiet */}
      <LabelDialog
        open={labelDialogOpen}
        onClose={handleCloseLabelDialog}
        item={item}
      />
    </Container>
  );
};

export default ItemDetailsPage;