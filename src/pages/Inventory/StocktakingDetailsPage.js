import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Paper,
  Button,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Chip,
  IconButton,
  InputAdornment,
  Autocomplete,
  CircularProgress,
  Divider,
  Alert,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Checkbox,
  ListItemText
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Search as SearchIcon,
  ListAlt as ReportIcon,
  Done as DoneIcon,
  Close as CancelIcon,
  Save as SaveIcon,
  Inventory as InventoryIcon,
  Filter as FilterIcon,
  Warning as WarningIcon
} from '@mui/icons-material';
import {
  getStocktakingById,
  getStocktakingItems,
  addItemToStocktaking,
  updateStocktakingItem,
  deleteStocktakingItem,
  completeStocktaking,
  completeCorrectedStocktaking,
  getAllInventoryItems,
  getItemBatches,
  checkStocktakingReservationImpact,
  cancelThreatenedReservations,
  getInventoryCategories,
  getInventoryItemsByCategory
} from '../../services/inventory';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import { formatDate } from '../../utils/formatters';
import { getUsersDisplayNames } from '../../services/userService';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase/config';

const StocktakingDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const { t } = useTranslation();
  
  const [stocktaking, setStocktaking] = useState(null);
  const [items, setItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState(null);
  
  const [inventoryItems, setInventoryItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [countedQuantity, setCountedQuantity] = useState('');
  const [notes, setNotes] = useState('');
  
  // Dodane stany dla obsługi LOTów (tryb LOT zawsze włączony)
  const [isLotMode] = useState(true); // Tryb LOT zawsze włączony
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [loadingBatches, setLoadingBatches] = useState(false);
  
  // Stany dla kategorii
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [loadingCategories, setLoadingCategories] = useState(false);
  
  // Cache dla produktów według kategorii (optymalizacja)
  const [categoryCache, setCategoryCache] = useState({});
  
  const [addItemDialogOpen, setAddItemDialogOpen] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [confirmAdjustInventory, setConfirmAdjustInventory] = useState(true);
  const [reservationWarnings, setReservationWarnings] = useState([]);
  const [checkingReservations, setCheckingReservations] = useState(false);
  const [cancelReservations, setCancelReservations] = useState(true);
  const [cancellingReservations, setCancellingReservations] = useState(false);
  const [editItemId, setEditItemId] = useState(null);
  const [deleteItemId, setDeleteItemId] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
  // Dodaję stan do przechowywania nazw użytkowników
  const [userNames, setUserNames] = useState({});
  
  // Stan dla filtra pozycji wymagających uzupełnienia
  const [showOnlyIncomplete, setShowOnlyIncomplete] = useState(false);
  
  // Stany dla multi-select funkcjonalności
  const [selectedBatches, setSelectedBatches] = useState([]); // Koszyk wybranych partii
  const [currentStep, setCurrentStep] = useState('category'); // 'category', 'product', 'batches'
  
  useEffect(() => {
    fetchStocktakingData();
    fetchInventoryCategories();
  }, [id]);
  
  useEffect(() => {
    filterItems();
  }, [searchTerm, items, showOnlyIncomplete]);
  
  // Funkcja pobierająca dane użytkownika - zoptymalizowana wersja
  const fetchUserNames = async (userIds) => {
    if (!userIds || userIds.length === 0) return;
    
    // Usuń duplikaty
    const uniqueUserIds = [...new Set(userIds.filter(id => id))];
    
    if (uniqueUserIds.length === 0) return;
    
    try {
      const names = await getUsersDisplayNames(uniqueUserIds);
      setUserNames(names);
    } catch (error) {
      console.error("Błąd podczas pobierania danych użytkowników:", error);
    }
  };
  
  // Funkcja zwracająca nazwę użytkownika zamiast ID
  const getUserName = (userId) => {
    return userNames[userId] || userId || 'System';
  };
  
  const fetchStocktakingData = async () => {
    try {
      setLoading(true);
      const stocktakingData = await getStocktakingById(id);
      setStocktaking(stocktakingData);
      
      const items = await getStocktakingItems(id);
      setItems(items);
      setFilteredItems(items);
      
      // Pobierz nazwę użytkownika, który utworzył inwentaryzację
      if (stocktakingData && stocktakingData.createdBy) {
        fetchUserNames([stocktakingData.createdBy]);
      }
    } catch (error) {
      console.error('Błąd podczas pobierania danych inwentaryzacji:', error);
      setError('Nie udało się pobrać danych inwentaryzacji');
    } finally {
      setLoading(false);
    }
  };
  
  const fetchInventoryCategories = async () => {
    try {
      setLoadingCategories(true);
      const categoriesData = await getInventoryCategories();
      setCategories(categoriesData);
    } catch (error) {
      console.error('Błąd podczas pobierania kategorii:', error);
    } finally {
      setLoadingCategories(false);
    }
  };
  
  const fetchInventoryItems = async (categoryFilter = null) => {
    try {
      if (!categoryFilter) {
        // Jeśli nie wybrano kategorii, wyczyść listę produktów
        setInventoryItems([]);
        return;
      }

      // OPTYMALIZACJA: Sprawdź cache przed wykonaniem zapytania
      if (categoryCache[categoryFilter]) {
        console.log('🔍 StocktakingDetailsPage - używam cache dla kategorii:', categoryFilter);
        setInventoryItems(categoryCache[categoryFilter]);
        return;
      }

      console.log('🔍 StocktakingDetailsPage - pobieranie produktów dla kategorii:', categoryFilter);
      
      // OPTYMALIZACJA: Używamy nowej funkcji getInventoryItemsByCategory
      // która filtruje bezpośrednio w Firebase zamiast pobierać wszystkie produkty
      const inventoryItemsData = await getInventoryItemsByCategory(
        categoryFilter, // category - wymagane
        null, // warehouseId
        null, // page
        null, // pageSize
        null, // searchTerm
        'name', // sortField - sortowanie według nazwy
        'asc'  // sortOrder
      );
      
      // Nowa funkcja zwraca obiekt z właściwością 'items'
      const items = inventoryItemsData?.items || [];
      setInventoryItems(items);
      
      // OPTYMALIZACJA: Zapisz w cache dla przyszłego użycia
      setCategoryCache(prev => ({
        ...prev,
        [categoryFilter]: items
      }));
      
      console.log('🔍 StocktakingDetailsPage - pobrano', items.length, 'produktów dla kategorii:', categoryFilter, '(zapisano w cache)');
      
    } catch (error) {
      console.error('Błąd podczas pobierania produktów z magazynu:', error);
      setInventoryItems([]);
    }
  };
  
  // Nowa funkcja do pobierania partii dla wybranego produktu
  const fetchItemBatches = async (itemId) => {
    if (!itemId) {
      setBatches([]);
      setSelectedBatch(null);
      return;
    }
    
    try {
      setLoadingBatches(true);
      const batchesData = await getItemBatches(itemId);
      setBatches(batchesData);
      setLoadingBatches(false);
    } catch (error) {
      console.error('Błąd podczas pobierania partii:', error);
      setLoadingBatches(false);
    }
  };
  
  // Obsługa wyboru kategorii
  const handleCategorySelect = (category) => {
    setSelectedCategory(category);
    setSelectedItem(null);
    setSelectedBatch(null);
    setBatches([]);
    
    // Pobierz produkty z wybranej kategorii
    if (category) {
      fetchInventoryItems(category);
    } else {
      setInventoryItems([]);
    }
  };

  // Obsługa wyboru produktu (teraz wyzwala pobieranie partii)
  const handleItemSelect = (item) => {
    setSelectedItem(item);
    if (isLotMode && item) {
      fetchItemBatches(item.id);
    } else {
      setBatches([]);
      setSelectedBatch(null);
    }
  };
  
  const filterItems = () => {
    let filtered = items;
    
    // Filtruj według wyszukiwania
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(item => 
        (item.name && item.name.toLowerCase().includes(term)) ||
        (item.category && item.category.toLowerCase().includes(term)) ||
        // Dodaj wyszukiwanie po numerze LOT/partii
        (item.lotNumber && item.lotNumber.toLowerCase().includes(term)) ||
        (item.batchNumber && item.batchNumber.toLowerCase().includes(term))
      );
    }
    
    // Filtruj według pozycji wymagających uzupełnienia
    if (showOnlyIncomplete) {
      filtered = filtered.filter(item => 
        item.countedQuantity === null || item.countedQuantity === undefined
      );
    }
    
    setFilteredItems(filtered);
  };
  
  // Funkcje obsługi multi-select
  const handleBatchToggle = (batch) => {
    setSelectedBatches(prev => {
      const isSelected = prev.some(b => b.id === batch.id);
      if (isSelected) {
        return prev.filter(b => b.id !== batch.id);
      } else {
        return [...prev, {
          ...batch,
          itemId: selectedItem.id,
          itemName: selectedItem.name,
          itemCategory: selectedCategory,
          itemUnit: selectedItem.unit
        }];
      }
    });
  };

  const handleSelectAllBatches = (checked) => {
    if (checked) {
      // Filtruj tylko partie, które nie są już dodane do inwentaryzacji
      const existingBatchIds = items.map(item => item.batchId).filter(Boolean);
      const batchesToAdd = batches.filter(batch => 
        !selectedBatches.some(selected => selected.id === batch.id) &&
        !existingBatchIds.includes(batch.id) // Nie dodawaj już istniejących partii
      ).map(batch => ({
        ...batch,
        itemId: selectedItem.id,
        itemName: selectedItem.name,
        itemCategory: selectedCategory,
        itemUnit: selectedItem.unit
      }));
      setSelectedBatches(prev => [...prev, ...batchesToAdd]);
    } else {
      const batchIds = batches.map(b => b.id);
      setSelectedBatches(prev => prev.filter(selected => !batchIds.includes(selected.id)));
    }
  };

  const handleAddAnotherProduct = () => {
    setSelectedItem(null);
    setSelectedBatch(null);
    setBatches([]);
    setCurrentStep('product');
  };

  const resetDialog = () => {
    setSelectedCategory('');
    setSelectedItem(null);
    setSelectedBatch(null);
    setBatches([]);
    setInventoryItems([]);
    setSelectedBatches([]);
    setCurrentStep('category');
    setNotes('');
    setCategoryCache({});
  };
  
  const handleAddItem = async () => {
    // Walidacja multi-select
    if (selectedBatches.length === 0) {
      showError('Zaznacz przynajmniej jedną partię do dodania');
      return;
    }
    
    // Sprawdź czy któraś z wybranych partii już istnieje w inwentaryzacji
    const existingBatchIds = items.map(item => item.batchId).filter(Boolean);
    const duplicateBatches = selectedBatches.filter(batch => existingBatchIds.includes(batch.id));
    
    if (duplicateBatches.length > 0) {
      const duplicateNames = duplicateBatches.map(batch => 
        `${batch.itemName} (LOT: ${batch.lotNumber || batch.batchNumber || 'Brak numeru'})`
      ).join(', ');
      
      showError(`Następujące partie są już dodane do inwentaryzacji: ${duplicateNames}`);
      return;
    }
    
    try {
      // Dodaj wszystkie zaznaczone partie
      const promises = selectedBatches.map(batch => 
        addItemToStocktaking(id, {
          batchId: batch.id,
          countedQuantity: null, // Pozycja wymaga uzupełnienia - użytkownik poda ilość później
          notes
        }, currentUser.uid)
      );
      
      await Promise.all(promises);
      
      showSuccess(`Dodano ${selectedBatches.length} partii do inwentaryzacji. Uzupełnij ilości policzone w szczegółach.`);
      setAddItemDialogOpen(false);
      
      // Reset form
      resetDialog();
      
      // Refresh data
      fetchStocktakingData();
    } catch (error) {
      console.error('Błąd podczas dodawania partii:', error);
      showError(`Błąd podczas dodawania: ${error.message}`);
    }
  };
  
  const handleEditItem = async (itemId) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    
    setEditItemId(itemId);
    setCountedQuantity(item.countedQuantity !== null && item.countedQuantity !== undefined ? item.countedQuantity.toString() : '');
    setNotes(item.notes || '');
  };
  
  const handleSaveEdit = async () => {
    if (countedQuantity === '' || isNaN(countedQuantity) || Number(countedQuantity) < 0) {
      showError('Podaj prawidłową ilość policzoną');
      return;
    }
    
    try {
      await updateStocktakingItem(editItemId, {
        countedQuantity: Number(countedQuantity),
        notes
      }, currentUser.uid);
      
      showSuccess('Przedmiot został zaktualizowany');
      setEditItemId(null);
      setCountedQuantity('');
      setNotes('');
      
      // Refresh data
      fetchStocktakingData();
    } catch (error) {
      console.error('Błąd podczas aktualizacji przedmiotu:', error);
      showError(`Błąd podczas aktualizacji: ${error.message}`);
    }
  };
  
  const handleCancelEdit = () => {
    setEditItemId(null);
    setCountedQuantity('');
    setNotes('');
  };
  
  const handleDeleteItem = (itemId) => {
    setDeleteItemId(itemId);
    setDeleteDialogOpen(true);
  };
  
  const confirmDeleteItem = async () => {
    try {
      await deleteStocktakingItem(deleteItemId);
      showSuccess('Przedmiot został usunięty z inwentaryzacji');
      setDeleteDialogOpen(false);
      
      // Refresh data
      fetchStocktakingData();
    } catch (error) {
      console.error('Błąd podczas usuwania przedmiotu:', error);
      showError(`Błąd podczas usuwania: ${error.message}`);
    }
  };
  
  const handleCompleteStocktaking = async () => {
    // Sprawdź czy są pozycje bez uzupełnionej ilości
    const incompleteItems = items.filter(item => item.countedQuantity === null || item.countedQuantity === undefined);
    
    if (incompleteItems.length > 0) {
      const proceed = window.confirm(
        `Uwaga: ${incompleteItems.length} pozycji nie ma uzupełnionej ilości policzonej. Czy chcesz kontynuować?`
      );
      if (!proceed) return;
    }
    
    // Sprawdź wpływ korekt na rezerwacje przed otwarciem dialogu
    if (confirmAdjustInventory) {
      setCheckingReservations(true);
      try {
        const warnings = await checkStocktakingReservationImpact(items);
        setReservationWarnings(warnings);
      } catch (error) {
        console.error('Błąd podczas sprawdzania rezerwacji:', error);
        setReservationWarnings([]);
      } finally {
        setCheckingReservations(false);
      }
    }
    
    setConfirmDialogOpen(true);
  };
  
  // Funkcja do sprawdzania rezerwacji przy zmianie opcji dostosowywania stanów
  const handleAdjustInventoryChange = async (checked) => {
    setConfirmAdjustInventory(checked);
    
    // Sprawdź rezerwacje tylko jeśli włączono dostosowywanie stanów
    if (checked) {
      setCheckingReservations(true);
      try {
        const warnings = await checkStocktakingReservationImpact(items);
        setReservationWarnings(warnings);
      } catch (error) {
        console.error('Błąd podczas sprawdzania rezerwacji:', error);
        setReservationWarnings([]);
      } finally {
        setCheckingReservations(false);
      }
    } else {
      setReservationWarnings([]);
    }
  };

  const confirmComplete = async () => {
    try {
      // Anuluj rezerwacje jeśli zostało to wybrane
      if (cancelReservations && reservationWarnings.length > 0) {
        setCancellingReservations(true);
        try {
          const result = await cancelThreatenedReservations(reservationWarnings, currentUser.uid);
          if (result.success) {
            showSuccess(result.message);
          } else {
            showError(result.message);
          }
        } catch (error) {
          console.error('Błąd podczas anulowania rezerwacji:', error);
          showError(`Błąd podczas anulowania rezerwacji: ${error.message}`);
        } finally {
          setCancellingReservations(false);
        }
      }
      
      // Sprawdź czy to korekta czy normalne zakończenie
      if (stocktaking.status === 'W korekcie') {
        await completeCorrectedStocktaking(id, confirmAdjustInventory, currentUser.uid);
      } else {
        await completeStocktaking(id, confirmAdjustInventory, currentUser.uid);
      }
      
      const message = confirmAdjustInventory
        ? (stocktaking.status === 'W korekcie' 
           ? 'Korekta inwentaryzacji zakończona i stany magazynowe zaktualizowane'
           : 'Inwentaryzacja zakończona i stany magazynowe zaktualizowane')
        : (stocktaking.status === 'W korekcie'
           ? 'Korekta inwentaryzacji zakończona bez aktualizacji stanów magazynowych'
           : 'Inwentaryzacja zakończona bez aktualizacji stanów magazynowych');
      
      showSuccess(message);
      setConfirmDialogOpen(false);
      setReservationWarnings([]);
      setCancelReservations(true);
      
      // Refresh data
      fetchStocktakingData();
    } catch (error) {
      console.error('Błąd podczas kończenia inwentaryzacji:', error);
      showError(`Błąd podczas kończenia inwentaryzacji: ${error.message}`);
    }
  };
  
  const getDiscrepancyColor = (discrepancy) => {
    if (discrepancy === 0) return 'success';
    if (discrepancy > 0) return 'primary';
    return 'error';
  };
  
  const renderStatusChip = (status) => {
    let color = 'default';
    
    switch (status) {
      case 'Otwarta':
        color = 'primary';
        break;
      case 'W trakcie':
        color = 'warning';
        break;
      case 'Zakończona':
        color = 'success';
        break;
      case 'W korekcie':
        color = 'warning';
        break;
      default:
        color = 'default';
    }
    
    return <Chip label={status} color={color} size="small" />;
  };
  
  const isCompleted = stocktaking && stocktaking.status === 'Zakończona';
  const isInCorrection = stocktaking && stocktaking.status === 'W korekcie';
  
  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }
  
  if (error) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Alert severity="error">{error}</Alert>
        <Box sx={{ mt: 2 }}>
          <Button
            variant="outlined"
            startIcon={<ArrowBackIcon />}
            component={Link}
            to="/inventory/stocktaking"
          >
            Powrót do listy inwentaryzacji
          </Button>
        </Box>
      </Container>
    );
  }
  
  if (!stocktaking) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Alert severity="error">Nie znaleziono inwentaryzacji</Alert>
        <Box sx={{ mt: 2 }}>
          <Button
            variant="outlined"
            startIcon={<ArrowBackIcon />}
            component={Link}
            to="/inventory/stocktaking"
          >
            Powrót do listy inwentaryzacji
          </Button>
        </Box>
      </Container>
    );
  }
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Button
          variant="outlined"
          startIcon={<ArrowBackIcon />}
          component={Link}
          to="/inventory/stocktaking"
        >
          {t('stocktaking.back')}
        </Button>
        <Typography variant="h4" component="h1">
          {t('stocktaking.detailsTitle')}
        </Typography>
        <Box>
          {(!isCompleted || isInCorrection) && (
            <Button
              variant="contained"
              color={isInCorrection ? "warning" : "primary"}
              startIcon={<EditIcon />}
              component={Link}
              to={`/inventory/stocktaking/${id}/edit`}
              sx={{ mr: 1 }}
            >
              {isInCorrection ? 'Kontynuuj korekty' : t('stocktaking.edit')}
            </Button>
          )}
          <Button
            variant="contained"
            color="secondary"
            startIcon={<ReportIcon />}
            component={Link}
            to={`/inventory/stocktaking/${id}/report`}
          >
            {t('stocktaking.report')}
          </Button>
        </Box>
      </Box>
      
      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle1" gutterBottom>
              {t('stocktaking.basicInfo')}
            </Typography>
            <Box sx={{ mb: 2 }}>
              <Typography variant="body1">
                <strong>{t('stocktaking.name')}:</strong> {stocktaking.name}
              </Typography>
              <Typography variant="body1">
                <strong>{t('stocktaking.status')}:</strong> {renderStatusChip(stocktaking.status)}
              </Typography>
              <Typography variant="body1">
                <strong>{t('stocktaking.location')}:</strong> {stocktaking.location || t('stocktaking.allLocations')}
              </Typography>
              <Typography variant="body1">
                <strong>{t('stocktaking.scheduledDate')}:</strong> {stocktaking.scheduledDate ? formatDate(stocktaking.scheduledDate) : '-'}
              </Typography>
              {stocktaking.description && (
                <Typography variant="body1">
                  <strong>{t('stocktaking.description')}:</strong> {stocktaking.description}
                </Typography>
              )}
            </Box>
          </Grid>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle1" gutterBottom>
              {t('stocktaking.additionalInfo')}
            </Typography>
            <Box sx={{ mb: 2 }}>
              <Typography variant="body1">
                <strong>{t('stocktaking.createdAt')}:</strong> {stocktaking.createdAt ? formatDate(stocktaking.createdAt) : '-'}
              </Typography>
              <Typography variant="body1">
                <strong>{t('stocktaking.createdBy')}:</strong> {stocktaking.createdBy ? getUserName(stocktaking.createdBy) : '-'}
              </Typography>
              {stocktaking.completedAt && (
                <Typography variant="body1">
                  <strong>{t('stocktaking.completedAt')}:</strong> {formatDate(stocktaking.completedAt)}
                </Typography>
              )}
              {stocktaking.notes && (
                <Typography variant="body1">
                  <strong>{t('stocktaking.notes')}:</strong> {stocktaking.notes}
                </Typography>
              )}
            </Box>
          </Grid>
        </Grid>
      </Paper>
      
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">
          {t('stocktaking.products', { count: items.length })}
        </Typography>
        <Box>
          {(!isCompleted || isInCorrection) && (
            <Button
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              onClick={() => setAddItemDialogOpen(true)}
              sx={{ mr: 1 }}
            >
              {t('stocktaking.addProduct')}
            </Button>
          )}
          {items.length > 0 && (
            <Button
              variant={showOnlyIncomplete ? "contained" : "outlined"}
              color="warning"
              startIcon={<FilterIcon />}
              onClick={() => setShowOnlyIncomplete(!showOnlyIncomplete)}
              sx={{ mr: 1 }}
            >
              Pozycje do uzupełnienia
            </Button>
          )}
          {(!isCompleted || isInCorrection) && items.length > 0 && (
            <Button
              variant="contained"
              color="success"
              startIcon={<DoneIcon />}
              onClick={handleCompleteStocktaking}
            >
              {isInCorrection ? t('stocktaking.finishCorrections') : t('stocktaking.finishStocktaking')}
            </Button>
          )}
        </Box>
      </Box>
      
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              variant="outlined"
              placeholder={t('stocktaking.searchPlaceholderProducts')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
        </Grid>
      </Paper>
      
      {items.length === 0 ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          {t('stocktaking.noProductsMessage')} {!isCompleted && t('stocktaking.noProductsAddHint')}
        </Alert>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{t('stocktaking.tableHeaders.productName')}</TableCell>
                <TableCell>{t('stocktaking.tableHeaders.lotBatch')}</TableCell>
                <TableCell>{t('stocktaking.tableHeaders.category')}</TableCell>
                <TableCell align="right">{t('stocktaking.tableHeaders.systemQuantity')}</TableCell>
                <TableCell align="right">{t('stocktaking.tableHeaders.countedQuantity')}</TableCell>
                <TableCell align="right">{t('stocktaking.tableHeaders.difference')}</TableCell>
                <TableCell align="right">{t('stocktaking.tableHeaders.unitPrice')}</TableCell>
                <TableCell align="right">{t('stocktaking.tableHeaders.valueDifference')}</TableCell>
                <TableCell>{t('stocktaking.tableHeaders.notes')}</TableCell>
                {(!isCompleted || isInCorrection) && <TableCell align="center">{t('stocktaking.tableHeaders.actions')}</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredItems.map((item) => {
                const needsQuantity = item.countedQuantity === null || item.countedQuantity === undefined;
                
                return (
                  <TableRow 
                    key={item.id} 
                    hover
                    sx={{
                      // Wyróżnij pozycje wymagające uzupełnienia ilości
                      backgroundColor: needsQuantity 
                        ? (theme) => theme.palette.mode === 'dark' 
                          ? 'rgba(255, 193, 7, 0.15)' // Subtelny żółto-pomarańczowy dla ciemnego motywu
                          : 'rgba(255, 193, 7, 0.08)' // Bardzo jasny żółto-pomarańczowy dla jasnego motywu
                        : 'inherit',
                      '&:hover': {
                        backgroundColor: needsQuantity 
                          ? (theme) => theme.palette.mode === 'dark'
                            ? 'rgba(255, 193, 7, 0.25)' // Trochę więcej koloru przy hover w ciemnym motywie
                            : 'rgba(255, 193, 7, 0.15)' // Trochę więcej koloru przy hover w jasnym motywie
                          : 'action.hover'
                      }
                    }}
                  >
                  {editItemId === item.id ? (
                    <>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>
                        {item.lotNumber || item.batchNumber || 'N/D'}
                        {item.expiryDate && (
                          <Typography variant="caption" display="block" color="textSecondary">
                            Ważne do: {new Date(item.expiryDate.seconds * 1000).toLocaleDateString('pl-PL')}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{item.category}</TableCell>
                      <TableCell align="right">{item.systemQuantity} {item.unit}</TableCell>
                      <TableCell align="right">
                        <TextField
                          type="number"
                          size="small"
                          value={countedQuantity}
                          onChange={(e) => setCountedQuantity(e.target.value)}
                          inputProps={{ min: 0, step: 0.01 }}
                          sx={{ width: '100px' }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Chip 
                          label={`${Number(countedQuantity) - item.systemQuantity}`} 
                          color={Number(countedQuantity) - item.systemQuantity === 0 ? 'success' : Number(countedQuantity) - item.systemQuantity > 0 ? 'primary' : 'error'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="right">
                        {item.unitPrice ? `${item.unitPrice.toFixed(2)} EUR` : '-'}
                      </TableCell>
                      <TableCell align="right">
                        {item.unitPrice 
                          ? `${((Number(countedQuantity) - item.systemQuantity) * item.unitPrice).toFixed(2)} EUR` 
                          : '-'
                        }
                      </TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          fullWidth
                        />
                      </TableCell>
                      <TableCell align="center">
                        <IconButton color="primary" onClick={handleSaveEdit} size="small">
                          <SaveIcon />
                        </IconButton>
                        <IconButton color="secondary" onClick={handleCancelEdit} size="small">
                          <CancelIcon />
                        </IconButton>
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell>
                        {item.name}
                        {needsQuantity && (
                          <Chip 
                            label="Wymaga uzupełnienia ilości" 
                            color="warning" 
                            size="small" 
                            sx={{ ml: 1 }}
                          />
                        )}
                      </TableCell>
                      <TableCell>
                        {item.lotNumber || item.batchNumber || 'N/D'}
                        {item.expiryDate && (
                          <Typography variant="caption" display="block" color="textSecondary">
                            Ważne do: {new Date(item.expiryDate.seconds * 1000).toLocaleDateString('pl-PL')}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{item.category}</TableCell>
                      <TableCell align="right">{item.systemQuantity} {item.unit}</TableCell>
                      <TableCell align="right">
                        {needsQuantity ? (
                          <Chip label="Do uzupełnienia" color="warning" size="small" />
                        ) : (
                          `${item.countedQuantity} ${item.unit}`
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Chip 
                          label={item.discrepancy} 
                          color={getDiscrepancyColor(item.discrepancy)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="right">
                        {item.unitPrice ? `${item.unitPrice.toFixed(2)} EUR` : '-'}
                      </TableCell>
                      <TableCell align="right">
                        {item.differenceValue !== undefined 
                          ? `${item.differenceValue.toFixed(2)} EUR`
                          : item.unitPrice && item.discrepancy
                            ? `${(item.discrepancy * item.unitPrice).toFixed(2)} EUR`
                            : '-'
                        }
                      </TableCell>
                      <TableCell>{item.notes || '-'}</TableCell>
                      {(!isCompleted || isInCorrection) && (
                        <TableCell align="center">
                          <IconButton color="primary" onClick={() => handleEditItem(item.id)} size="small">
                            <EditIcon />
                          </IconButton>
                          {needsQuantity && (
                            <Tooltip title="Pozycja wymaga uzupełnienia ilości">
                              <IconButton color="warning" size="small">
                                <WarningIcon />
                              </IconButton>
                            </Tooltip>
                          )}
                          <IconButton color="error" onClick={() => handleDeleteItem(item.id)} size="small">
                            <DeleteIcon />
                          </IconButton>
                        </TableCell>
                      )}
                    </>
                  )}
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      
      {/* Dialog dodawania pozycji - wersja multi-select */}
      <Dialog open={addItemDialogOpen} onClose={() => setAddItemDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Dodaj pozycje do inwentaryzacji
          {selectedBatches.length > 0 && (
            <Chip 
              label={`Zaznaczono: ${selectedBatches.length}`} 
              color="primary" 
              size="small" 
              sx={{ ml: 2 }}
            />
          )}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            
            {/* Krok 1: Wybór kategorii */}
            <FormControl fullWidth margin="normal">
              <InputLabel id="category-select-label">Wybierz kategorię *</InputLabel>
              <Select
                labelId="category-select-label"
                value={selectedCategory}
                onChange={(e) => handleCategorySelect(e.target.value)}
                required
                label="Wybierz kategorię *"
              >
                <MenuItem value="">
                  <em>Wybierz kategorię</em>
                </MenuItem>
                {loadingCategories ? (
                  <MenuItem disabled>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 1 }}>
                      <CircularProgress size={20} sx={{ mr: 1 }} />
                      <Typography>Ładowanie kategorii...</Typography>
                    </Box>
                  </MenuItem>
                ) : (
                  categories.map((category) => (
                    <MenuItem key={category} value={category}>
                      {category}
                    </MenuItem>
                  ))
                )}
              </Select>
            </FormControl>
            
            {/* Krok 2: Wybór produktu */}
            <Autocomplete
              options={inventoryItems}
              getOptionLabel={(option) => option.name}
              value={selectedItem}
              onChange={(event, newValue) => handleItemSelect(newValue)}
              disabled={!selectedCategory}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={selectedCategory ? 'Wybierz produkt' : 'Najpierw wybierz kategorię'}
                  fullWidth
                  required
                  margin="normal"
                  disabled={!selectedCategory}
                />
              )}
            />
            
            {/* Krok 3: Multi-select partii */}
            {selectedItem && batches.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle1" gutterBottom>
                  Wybierz partie dla produktu: <strong>{selectedItem.name}</strong>
                </Typography>
                
                {/* Opcja zaznacz wszystkie */}
                <FormControlLabel
                  control={
                    <Checkbox
                      indeterminate={
                        selectedBatches.filter(b => b.itemId === selectedItem.id).length > 0 && 
                        selectedBatches.filter(b => b.itemId === selectedItem.id).length < batches.length
                      }
                      checked={
                        batches.length > 0 && 
                        selectedBatches.filter(b => b.itemId === selectedItem.id).length === batches.length
                      }
                      onChange={(e) => handleSelectAllBatches(e.target.checked)}
                    />
                  }
                  label="Zaznacz wszystkie partie tego produktu"
                  sx={{ mb: 1 }}
                />
                
                {/* Lista partii z checkboxami */}
                <Box sx={{ 
                  maxHeight: 300, 
                  overflow: 'auto', 
                  border: (theme) => `1px solid ${theme.palette.divider}`, 
                  borderRadius: 1, 
                  p: 1,
                  backgroundColor: (theme) => theme.palette.background.paper
                }}>
                  {batches.map((batch) => {
                    const isSelected = selectedBatches.some(b => b.id === batch.id);
                    const isAlreadyAdded = items.some(item => item.batchId === batch.id);
                    
                    return (
                      <Box key={batch.id} sx={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        p: 1, 
                        borderRadius: 1,
                        opacity: isAlreadyAdded ? 0.5 : 1,
                        '&:hover': { 
                          backgroundColor: !isAlreadyAdded ? (theme) => theme.palette.action.hover : 'transparent'
                        },
                        backgroundColor: isAlreadyAdded 
                          ? (theme) => theme.palette.grey[200]
                          : isSelected 
                            ? (theme) => theme.palette.mode === 'dark' 
                              ? theme.palette.primary.dark 
                              : theme.palette.primary.light
                            : 'transparent'
                      }}>
                        <Checkbox
                          checked={isSelected}
                          disabled={isAlreadyAdded}
                          onChange={() => !isAlreadyAdded && handleBatchToggle(batch)}
                        />
                        <Box sx={{ ml: 1, flex: 1 }}>
                          <Typography variant="body2">
                            <strong>LOT:</strong> {batch.lotNumber || batch.batchNumber || 'Brak numeru'}
                            {isAlreadyAdded && (
                              <Chip 
                                label="Już dodana" 
                                color="default" 
                                size="small" 
                                sx={{ ml: 1 }}
                              />
                            )}
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            Ilość: {batch.quantity} {selectedItem.unit}
                            {batch.expiryDate && ` | Ważne do: ${new Date(batch.expiryDate).toLocaleDateString('pl-PL')}`}
                            {batch.unitPrice > 0 && ` | Cena: ${batch.unitPrice.toFixed(2)} EUR`}
                          </Typography>
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
                
                {/* Przycisk dodania kolejnego produktu */}
                <Button
                  variant="outlined"
                  color="secondary"
                  onClick={handleAddAnotherProduct}
                  sx={{ mt: 2 }}
                >
                  Dodaj partie innego produktu
                </Button>
              </Box>
            )}
            
            {/* Koszyk wybranych pozycji */}
            {selectedBatches.length > 0 && (
              <Box sx={{ mt: 3 }}>
                <Typography variant="subtitle1" gutterBottom>
                  Wybrane pozycje do dodania ({selectedBatches.length}):
                </Typography>
                <Box sx={{ 
                  maxHeight: 200, 
                  overflow: 'auto', 
                  border: (theme) => `1px solid ${theme.palette.divider}`, 
                  borderRadius: 1, 
                  p: 1,
                  backgroundColor: (theme) => theme.palette.background.paper
                }}>
                  {selectedBatches.map((batch, index) => (
                    <Box key={batch.id} sx={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      p: 1,
                      borderRadius: 1,
                      '&:hover': { 
                        backgroundColor: (theme) => theme.palette.action.hover
                      }
                    }}>
                      <Typography variant="body2">
                        {batch.itemName} - LOT: {batch.lotNumber || batch.batchNumber || 'Brak numeru'}
                      </Typography>
                      <IconButton 
                        size="small" 
                        onClick={() => setSelectedBatches(prev => prev.filter(b => b.id !== batch.id))}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
            
            {/* Informacja */}
            <Alert severity="info" sx={{ mt: 2 }}>
              Wybrane pozycje zostaną dodane do inwentaryzacji. Ilości policzone będziesz mógł podać później w szczegółach.
            </Alert>
            
            {/* Pole notatek */}
            <TextField
              label="Notatki (będą dodane do wszystkich wybranych pozycji)"
              fullWidth
              multiline
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              margin="normal"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setAddItemDialogOpen(false);
            resetDialog();
          }}>
            Anuluj
          </Button>
          <Button 
            onClick={handleAddItem} 
            color="primary" 
            variant="contained"
            disabled={selectedBatches.length === 0}
          >
            Dodaj pozycje ({selectedBatches.length})
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog usuwania produktu */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Potwierdź usunięcie</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Czy na pewno chcesz usunąć ten produkt z inwentaryzacji? Ta operacja jest nieodwracalna.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Anuluj</Button>
          <Button onClick={confirmDeleteItem} color="error">Usuń</Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog zakończenia inwentaryzacji */}
      <Dialog 
        open={confirmDialogOpen} 
        onClose={() => setConfirmDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>{t('stocktaking.completeDialog.title')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('stocktaking.completeDialog.confirmQuestion')}
          </DialogContentText>
          
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              {t('stocktaking.completeDialog.adjustInventory')}?
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={confirmAdjustInventory}
                  onChange={(e) => handleAdjustInventoryChange(e.target.checked)}
                  color="primary"
                />
              }
              label={confirmAdjustInventory ? t('stocktaking.completeDialog.adjustInventoryHelp') : "Nie, tylko zakończ inwentaryzację"}
            />
          </Box>

          {/* Sprawdzanie rezerwacji - loading */}
          {checkingReservations && (
            <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={20} />
              <Typography variant="body2">
                {t('stocktaking.completeDialog.checkingReservations')}
              </Typography>
            </Box>
          )}

          {/* Ostrzeżenia o rezerwacjach */}
          {confirmAdjustInventory && reservationWarnings.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Alert severity="warning" sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                  {t('stocktaking.completeDialog.warningTitle')}
                </Typography>
                <Typography variant="body2">
                  {t('stocktaking.completeDialog.batchesWithShortages', { count: reservationWarnings.length })}
                </Typography>
              </Alert>

              <Box sx={{ maxHeight: 300, overflowY: 'auto' }}>
                {reservationWarnings.map((warning, index) => (
                  <Paper 
                    key={index} 
                    elevation={2}
                    sx={{ 
                      p: 2.5, 
                      mb: 1.5, 
                      bgcolor: (theme) => theme.palette.mode === 'dark' 
                        ? 'rgba(255, 193, 7, 0.08)' 
                        : 'rgba(255, 193, 7, 0.12)',
                      border: 1,
                      borderColor: 'warning.main',
                      borderRadius: 2
                    }}>
                    <Typography variant="subtitle2" sx={{ 
                      fontWeight: 'bold', 
                      color: (theme) => theme.palette.mode === 'dark' ? 'warning.light' : 'warning.dark',
                      mb: 1
                    }}>
                      {t('stocktaking.completeDialog.batchInfo', { itemName: warning.itemName, batchNumber: warning.batchNumber })}
                    </Typography>
                    <Typography variant="body2" sx={{ 
                      color: (theme) => theme.palette.mode === 'dark' ? 'text.secondary' : 'warning.dark',
                      mb: 1
                    }}>
                      {t('stocktaking.completeDialog.quantityChange', { 
                        currentQuantity: warning.currentQuantity, 
                        newQuantity: warning.newQuantity, 
                        unit: warning.unit,
                        totalReserved: warning.totalReserved,
                        shortage: warning.shortage
                      })}
                    </Typography>
                    
                    {warning.reservations.length > 0 && (
                      <Box sx={{ mt: 1 }}>
                        <Typography variant="caption" sx={{ 
                          fontWeight: 'bold', 
                          color: (theme) => theme.palette.mode === 'dark' ? 'warning.light' : 'warning.dark',
                          display: 'block',
                          mb: 0.5
                        }}>
                          {t('stocktaking.completeDialog.reservationsLabel')}
                        </Typography>
                        <Box sx={{ ml: 1, mt: 0.5 }}>
                          {warning.reservations.map((res, resIndex) => (
                            <Box key={resIndex} sx={{ 
                              display: 'flex', 
                              justifyContent: 'space-between', 
                              alignItems: 'center',
                              py: 0.5,
                              borderBottom: resIndex < warning.reservations.length - 1 ? 1 : 0,
                              borderColor: 'divider'
                            }}>
                              <Typography variant="body2" sx={{ 
                                fontWeight: 'medium',
                                color: (theme) => theme.palette.mode === 'dark' ? 'text.primary' : 'text.primary'
                              }}>
                                {res.displayName}
                              </Typography>
                              <Typography variant="body2" sx={{ 
                                fontWeight: 'bold', 
                                color: (theme) => theme.palette.mode === 'dark' ? 'error.light' : 'error.main'
                              }}>
                                {t('stocktaking.completeDialog.quantityLabel', { quantity: res.quantity, unit: warning.unit })}
                              </Typography>
                            </Box>
                          ))}
                        </Box>
                      </Box>
                    )}
                  </Paper>
                ))}
              </Box>

              <Alert severity="info" sx={{ mt: 1 }}>
                <Typography variant="body2">
                  {t('stocktaking.completeDialog.canCompleteWithWarning')}
                </Typography>
              </Alert>
            </Box>
          )}

          {/* Informacja o braku ostrzeżeń */}
          {confirmAdjustInventory && !checkingReservations && reservationWarnings.length === 0 && (
            <Alert severity="success" sx={{ mt: 2 }}>
              <Typography variant="body2">
                {t('stocktaking.completeDialog.noConflicts')}
              </Typography>
            </Alert>
          )}

          {/* Opcje anulowania rezerwacji */}
          {confirmAdjustInventory && reservationWarnings.length > 0 && (
            <Box sx={{ 
              mt: 2, 
              p: 2.5, 
              bgcolor: (theme) => theme.palette.mode === 'dark' 
                ? 'rgba(66, 165, 245, 0.08)' 
                : 'rgba(25, 118, 210, 0.04)', 
              borderRadius: 2,
              border: 1,
              borderColor: (theme) => theme.palette.mode === 'dark' 
                ? 'primary.dark' 
                : 'primary.light'
            }}>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                {t('stocktaking.completeDialog.optionsTitle')}
              </Typography>
              
              <FormControlLabel
                control={
                  <Switch
                    checked={cancelReservations}
                    onChange={(e) => setCancelReservations(e.target.checked)}
                    color="warning"
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                      {t('stocktaking.completeDialog.cancelThreatenedReservations')}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('stocktaking.completeDialog.cancelReservationsHelp')}
                    </Typography>
                  </Box>
                }
                sx={{ alignItems: 'flex-start', mb: 1 }}
              />

              {cancelReservations && (
                <Alert severity="info" sx={{ mt: 1 }}>
                  <Typography variant="body2">
                    {t('stocktaking.completeDialog.cancellingBatches', { count: reservationWarnings.length })}
                  </Typography>
                </Alert>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialogOpen(false)}>{t('stocktaking.completeDialog.buttonCancel')}</Button>
          
          {cancellingReservations ? (
            <Button disabled>
              <CircularProgress size={20} sx={{ mr: 1 }} />
              {t('stocktaking.completeDialog.cancellingReservations')}
            </Button>
          ) : (
            <Button 
              onClick={confirmComplete} 
              color={reservationWarnings.length > 0 ? "warning" : "primary"}
              variant={reservationWarnings.length > 0 ? "outlined" : "contained"}
            >
              {reservationWarnings.length > 0 
                ? (cancelReservations ? t('stocktaking.completeDialog.buttonCancelReservationsAndComplete') : t('stocktaking.completeDialog.buttonCompleteWithWarnings'))
                : t('stocktaking.completeDialog.buttonComplete')
              }
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default StocktakingDetailsPage; 