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
  CircularProgress
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
  Delete as DeleteIcon
} from '@mui/icons-material';
import { getInventoryItemById, getItemTransactions, getItemBatches, getSupplierPrices, deleteReservation, cleanupDeletedTaskReservations } from '../../services/inventoryService';
import { getAllSuppliers } from '../../services/supplierService';
import { useNotification } from '../../hooks/useNotification';
import { useAuth } from '../../hooks/useAuth';
import { formatDate } from '../../utils/formatters';
import { Timestamp } from 'firebase/firestore';
import LabelDialog from '../../components/inventory/LabelDialog';

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
  const [sortField, setSortField] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [updatingReservations, setUpdatingReservations] = useState(false);

  useEffect(() => {
    const fetchItemData = async () => {
      try {
        setLoading(true);
        const itemData = await getInventoryItemById(id);
        setItem(itemData);
        
        // Pobierz historię transakcji
        const transactionsData = await getItemTransactions(id);
        setTransactions(transactionsData);
        
        // Pobierz partie
        const batchesData = await getItemBatches(id);
        setBatches(batchesData);

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
      // Pobierz wszystkie transakcje dla danego przedmiotu
      const transactions = await getItemTransactions(itemData.id);
      
      // Filtruj tylko transakcje rezerwacji (typ 'booking')
      let bookingTransactions = transactions.filter(
        transaction => transaction.type === 'booking'
      );
      
      // Lista zadań do sprawdzenia
      const taskIds = bookingTransactions
        .filter(transaction => transaction.referenceId)
        .map(transaction => transaction.referenceId);
      
      // Sprawdź, czy rezerwacje mają powiązane partie w zadaniach produkcyjnych
      const { db } = await import('../../services/firebase/config');
      const { collection, query, where, getDocs } = await import('firebase/firestore');
      
      // Pobierz zadania produkcyjne związane z rezerwacjami
      const tasksRef = collection(db, 'productionTasks');
      const tasksQuery = query(tasksRef, where('__name__', 'in', taskIds.length > 0 ? taskIds : ['placeholder']));
      const tasksSnapshot = await getDocs(tasksQuery);
      
      // Mapa zadań produkcyjnych
      const tasksMap = {};
      tasksSnapshot.forEach(doc => {
        const taskData = doc.data();
        tasksMap[doc.id] = taskData;
      });
      
      // Uzupełnij informacje o rezerwacjach o dane z zadań produkcyjnych
      bookingTransactions = bookingTransactions.map(reservation => {
        const taskId = reservation.referenceId || reservation.taskId;
        const task = tasksMap[taskId];
        
        // Utwórz tablicę przypisanych partii
        let assignedBatches = [];
        
        // Jeśli zadanie istnieje i ma dane o przypisanych partiach
        if (task && task.materialBatches && task.materialBatches[itemData.id]) {
          // Pobierz wszystkie przypisane partie dla tego materiału
          assignedBatches = task.materialBatches[itemData.id] || [];
        }
        
        // Zachowaj istniejące wartości, jeśli task nie istnieje
        const existingTaskName = reservation.taskName;
        const existingTaskNumber = reservation.taskNumber || reservation.moNumber;
        const existingClientName = reservation.clientName;
        const existingClientId = reservation.clientId;
        
        return {
          ...reservation,
          // Dodaj dane zadania, preferując dane z zadania, ale zachowując istniejące wartości jako zapasowe
          taskName: task ? task.name : existingTaskName,
          taskNumber: task ? (task.number || task.moNumber) : existingTaskNumber,
          clientName: task ? task.clientName : existingClientName,
          clientId: task ? task.clientId : existingClientId,
          // Dodaj informacje o przypisanych partiach
          assignedBatches
        };
      });
      
      // Ustaw rezerwacje
      setReservations(bookingTransactions);
      
      // Zastosuj filtrowanie i sortowanie
      filterAndSortReservations(reservationFilter, sortField, sortOrder, bookingTransactions);
    } catch (error) {
      console.error('Błąd podczas pobierania rezerwacji:', error);
      showError('Nie udało się pobrać listy rezerwacji');
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
        valueA = new Date(a.createdAt?.seconds ? a.createdAt.toDate() : a.createdAt).getTime();
        valueB = new Date(b.createdAt?.seconds ? b.createdAt.toDate() : b.createdAt).getTime();
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

  // Funkcja do usuwania rezerwacji
  const handleDeleteReservation = async (reservationId) => {
    if (!window.confirm('Czy na pewno chcesz usunąć tę rezerwację? Ta operacja jest nieodwracalna.')) {
      return;
    }
    
    try {
      const { success, message } = await deleteReservation(reservationId, currentUser.uid);
      
      if (success) {
        showSuccess(message || 'Rezerwacja została usunięta');
        // Odśwież dane
        await fetchReservations(item);
      } else {
        showError(message || 'Nie udało się usunąć rezerwacji');
      }
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
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button 
          startIcon={<ArrowBackIcon />} 
          onClick={() => navigate('/inventory')}
          variant="outlined"
        >
          Powrót
        </Button>
        <Typography variant="h5" fontWeight="bold">
          Szczegóły pozycji magazynowej
        </Typography>
        <Box>
          <Button 
            variant="outlined" 
            component={Link} 
            to={`/inventory/${id}/edit`}
            startIcon={<EditIcon />}
            sx={{ mr: 1 }}
          >
            Edytuj
          </Button>
          <Button 
            variant="outlined" 
            component={Link} 
            to={`/inventory/${id}/batches`}
            startIcon={<ViewListIcon />}
            sx={{ mr: 1 }}
          >
            Zarządzaj partiami
          </Button>
          <Button 
            variant="outlined"
            onClick={handleOpenLabelDialog}
            startIcon={<QrCodeIcon />}
            sx={{ mr: 1 }}
          >
            Drukuj etykietę
          </Button>
          <Button 
            variant="contained" 
            color="primary"
            component={Link} 
            to={`/inventory/${id}/receive`}
            startIcon={<AddIcon />}
          >
            Przyjmij dostawę
          </Button>
        </Box>
      </Box>

      {/* Sekcja głównych informacji */}
      <Paper elevation={3} sx={{ mb: 3, overflow: 'hidden', borderRadius: 2 }}>
        <Box sx={{ p: 3, bgcolor: '#f8f9fa' }}>
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
            <Paper sx={{ p: 2, mb: 2, bgcolor: 'white', borderRadius: 1 }}>
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
          borderTop: '1px solid #e0e0e0',
          bgcolor: 'white'
        }}>
          <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center',
            minWidth: '150px'
          }}>
            <Typography variant="h6" fontWeight="bold" color="primary">
              {item.quantity}
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
          p: 2, 
          borderTop: '1px solid #e0e0e0',
          bgcolor: '#f8f9fa'
        }}>
          <Button 
            variant="contained" 
            color="success" 
            startIcon={<ReceiveIcon />}
            component={Link}
            to={`/inventory/${id}/receive`}
            sx={{ mr: 2, borderRadius: 4, px: 3 }}
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
            sx={{ borderRadius: 4, px: 3 }}
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
              Łącznie <strong>{expiredBatches.reduce((sum, batch) => sum + batch.quantity, 0)} {item?.unit}</strong>.
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
              Łącznie <strong>{expiringBatches.reduce((sum, batch) => sum + batch.quantity, 0)} {item?.unit}</strong>.
            </Typography>
          </Alert>
        </Paper>
      )}

      {/* Główne zakładki */}
      <Paper elevation={3} sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: '#f8f9fa' }}>
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
          </Tabs>
        </Box>

        {/* Zawartość zakładki Szczegółowe informacje */}
        <TabPanel value={tabValue} index={0}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Paper elevation={1} sx={{ p: 2, mb: 3, borderRadius: 2 }}>
                <Typography variant="h6" gutterBottom sx={{ borderBottom: '1px solid #e0e0e0', pb: 1, fontWeight: 'bold' }}>
                  Parametry magazynowe
                </Typography>
              <TableContainer>
                  <Table sx={{ '& td, & th': { borderBottom: '1px solid #f5f5f5', py: 1.5 } }}>
                  <TableBody>
                    <TableRow>
                        <TableCell component="th" sx={{ width: '40%', fontWeight: 'medium' }}>Minimalny stan</TableCell>
                      <TableCell>{item.minStock ? `${item.minStock} ${item.unit}` : 'Nie określono'}</TableCell>
                    </TableRow>
                    <TableRow>
                        <TableCell component="th" sx={{ fontWeight: 'medium' }}>Maksymalny stan</TableCell>
                      <TableCell>{item.maxStock ? `${item.maxStock} ${item.unit}` : 'Nie określono'}</TableCell>
                    </TableRow>
                    <TableRow>
                        <TableCell component="th" sx={{ fontWeight: 'medium' }}>Ilość kartonów na paletę</TableCell>
                      <TableCell>{item.boxesPerPallet ? `${item.boxesPerPallet} szt.` : 'Nie określono'}</TableCell>
                    </TableRow>
                    <TableRow>
                        <TableCell component="th" sx={{ fontWeight: 'medium' }}>Ilość produktu per karton</TableCell>
                      <TableCell>{item.itemsPerBox ? `${item.itemsPerBox} ${item.unit}` : 'Nie określono'}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
              </Paper>

              {supplierPrices.length > 0 && (
                <Paper elevation={1} sx={{ p: 2, borderRadius: 2 }}>
                  <Typography variant="h6" gutterBottom sx={{ borderBottom: '1px solid #e0e0e0', pb: 1, fontWeight: 'bold' }}>
                    Dostawcy i ceny
                  </Typography>
                  <TableContainer>
                    <Table size="small" sx={{ '& th': { fontWeight: 'bold', bgcolor: '#f8f9fa' } }}>
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
                              {price.price.toFixed(2)} {price.currency || item.currency || 'EUR'}
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
              <Paper elevation={1} sx={{ p: 2, borderRadius: 2 }}>
                <Typography variant="h6" gutterBottom sx={{ borderBottom: '1px solid #e0e0e0', pb: 1, fontWeight: 'bold' }}>
                  Notatki
                </Typography>
                <Box sx={{ p: 2, bgcolor: '#fafafa', borderRadius: 1, minHeight: '200px' }}>
                  <Typography variant="body1" style={{ whiteSpace: 'pre-line' }}>
                {item.notes || 'Brak notatek'}
              </Typography>
                </Box>
              </Paper>
            </Grid>
          </Grid>
        </TabPanel>

        {/* Zawartość zakładki Partie */}
        <TabPanel value={tabValue} index={1}>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
            Partie i daty ważności
          </Typography>
          
          {batches.length === 0 ? (
            <Paper elevation={1} sx={{ p: 3, borderRadius: 2, textAlign: 'center', bgcolor: '#f8f9fa' }}>
            <Typography variant="body1">Brak zarejestrowanych partii dla tego produktu.</Typography>
            </Paper>
          ) : (
            <TableContainer component={Paper} sx={{ mt: 2, borderRadius: 2, overflow: 'hidden', elevation: 1 }}>
              <Table sx={{ '& th': { fontWeight: 'bold', bgcolor: '#f8f9fa' } }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Numer partii</TableCell>
                    <TableCell>Data ważności</TableCell>
                    <TableCell>Ilość</TableCell>
                    <TableCell>Status</TableCell>
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
                            bgcolor: status === 'expired' ? 'rgba(255, 0, 0, 0.05)' : 
                                    status === 'expiring' ? 'rgba(255, 152, 0, 0.05)' : 
                                    'inherit'
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
          <Typography variant="h6" gutterBottom>Historia transakcji</Typography>
          
          {transactions.length === 0 ? (
            <Typography variant="body1" align="center">
              Brak historii transakcji dla tej pozycji
            </Typography>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Data</TableCell>
                    <TableCell>Typ</TableCell>
                    <TableCell>Ilość</TableCell>
                    <TableCell>Powód</TableCell>
                    <TableCell>Referencja</TableCell>
                    <TableCell>Notatki</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {transactions.map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell>{formatDate(transaction.transactionDate)}</TableCell>
                      <TableCell>
                        <Chip 
                          label={transaction.type === 'RECEIVE' ? 'Przyjęcie' : 'Wydanie'} 
                          color={transaction.type === 'RECEIVE' ? 'success' : 'warning'} 
                          size="small" 
                        />
                      </TableCell>
                      <TableCell>{transaction.quantity} {item.unit}</TableCell>
                      <TableCell>{transaction.reason || '—'}</TableCell>
                      <TableCell>{transaction.reference || '—'}</TableCell>
                      <TableCell>{transaction.notes || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </TabPanel>

        <TabPanel value={tabValue} index={3}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Rezerwacje produktu</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Button 
                startIcon={<RefreshIcon />} 
                onClick={() => fetchReservations(item)}
                variant="outlined"
                size="small"
                sx={{ mr: 2 }}
              >
                Odśwież
              </Button>
              <Button 
                startIcon={updatingReservations ? <CircularProgress size={20} /> : <DeleteIcon />} 
                onClick={handleCleanupDeletedTaskReservations}
                variant="outlined"
                color="error"
                size="small"
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
                  <MenuItem value="active">Aktywne</MenuItem>
                  <MenuItem value="fulfilled">Zrealizowane</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Box>
          
          {filteredReservations.length === 0 ? (
            <Alert severity="info">Brak rezerwacji dla tego produktu.</Alert>
          ) : (
            <TableContainer component={Paper} elevation={0} variant="outlined">
              <Table sx={{ '& thead th': { fontWeight: 'bold', bgcolor: '#f8f9fa' } }}>
                <TableHead>
                  <TableRow>
                    <TableCell 
                      onClick={() => handleSort('createdAt')}
                      sx={{ cursor: 'pointer' }}
                    >
                      Data rezerwacji {sortField === 'createdAt' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </TableCell>
                    <TableCell 
                      onClick={() => handleSort('quantity')}
                      sx={{ cursor: 'pointer' }}
                    >
                      Ilość {sortField === 'quantity' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </TableCell>
                    <TableCell 
                      onClick={() => handleSort('taskName')}
                      sx={{ cursor: 'pointer' }}
                    >
                      Zadanie produkcyjne {sortField === 'taskName' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </TableCell>
                    <TableCell 
                      onClick={() => handleSort('taskNumber')}
                      sx={{ cursor: 'pointer' }}
                    >
                      Nr MO {sortField === 'taskNumber' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </TableCell>
                    <TableCell 
                      onClick={() => handleSort('clientName')}
                      sx={{ cursor: 'pointer' }}
                    >
                      Klient {sortField === 'clientName' && (sortOrder === 'asc' ? '↑' : '↓')}
                    </TableCell>
                    <TableCell>Partia</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Akcje</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredReservations.map((reservation) => {
                    const createdDate = reservation.createdAt?.seconds ? 
                      reservation.createdAt.toDate() : 
                      new Date(reservation.createdAt);
                      
                    return (
                      <TableRow key={reservation.id} hover>
                        <TableCell>
                          {formatDate(createdDate)}
                        </TableCell>
                        <TableCell>
                          <Typography fontWeight="bold">
                            {reservation.quantity} {item.unit}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {reservation.taskName || '—'}
                        </TableCell>
                        <TableCell>
                          {reservation.taskNumber || '—'}
                        </TableCell>
                        <TableCell>
                          {reservation.clientName || '—'}
                        </TableCell>
                        <TableCell>
                          {reservation.assignedBatches && reservation.assignedBatches.length > 0 ? (
                            <div>
                              {reservation.assignedBatches.map((batch, index) => (
                                <Chip 
                                  key={index}
                                  label={`${batch.batchNumber || batch.batchId} (${batch.quantity} ${item.unit})`}
                                  size="small"
                                  sx={{ m: 0.2 }}
                                />
                              ))}
                            </div>
                          ) : (
                            reservation.batchNumber || reservation.batchId || '—'
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip 
                            label={reservation.fulfilled ? "Zrealizowana" : "Aktywna"} 
                            color={reservation.fulfilled ? "success" : "primary"} 
                            size="small" 
                          />
                        </TableCell>
                        <TableCell>
                          <IconButton 
                            size="small" 
                            color="error" 
                            onClick={() => handleDeleteReservation(reservation.id)}
                            aria-label="Usuń rezerwację"
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </TabPanel>
      </Paper>

      {/* Dialog etykiet */}
      <LabelDialog
        open={labelDialogOpen}
        onClose={handleCloseLabelDialog}
        item={item}
        batches={batches}
      />
    </Container>
  );
};

export default ItemDetailsPage;