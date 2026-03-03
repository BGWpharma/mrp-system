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
  TableSortLabel,
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
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelCheckIcon
} from '@mui/icons-material';
import {
  getStocktakingById,
  getStocktakingItems,
  addItemToStocktaking,
  updateStocktakingItem,
  deleteStocktakingItem,
  completeStocktaking,
  completeCorrectedStocktaking,
  acceptStocktakingItem,
  unacceptStocktakingItem,
  getAllInventoryItems,
  getItemBatches,
  checkStocktakingReservationImpact,
  cancelThreatenedReservations,
  saveCancelledReservationsToStocktaking,
  getInventoryCategories,
  getInventoryItemsByCategory,
  updateStocktakingAttachments
} from '../../services/inventory';
import StocktakingAttachments from '../../components/stocktaking/StocktakingAttachments';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import { usePermissions } from '../../hooks/usePermissions';
import { formatDate } from '../../utils/formatting';
import { getUsersDisplayNames } from '../../services/userService';
import { useUserNames } from '../../hooks/useUserNames';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase/config';

const StocktakingDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const { t } = useTranslation('stocktaking');
  const { canCompleteStocktaking, loading: permissionsLoading } = usePermissions();
  
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
  
  // Stany dla dialogu pojedynczej akceptacji z rezerwacjami
  const [singleItemReservationDialog, setSingleItemReservationDialog] = useState({
    open: false,
    itemId: null,
    warnings: [],
    cancelReservations: true
  });
  
  // Hook do zarządzania nazwami użytkowników
  const { userNames, getUserName, fetchUserNames } = useUserNames();
  
  // Stan dla filtra pozycji wymagających uzupełnienia
  const [showOnlyIncomplete, setShowOnlyIncomplete] = useState(false);
  
  // Stan dla filtra statusu akceptacji
  const [showAcceptedItems, setShowAcceptedItems] = useState('all'); // 'all', 'accepted', 'pending'
  
  // Stany dla sortowania tabeli
  const [orderBy, setOrderBy] = useState('name');
  const [order, setOrder] = useState('asc');
  
  // Stany dla multi-select funkcjonalności
  const [selectedBatches, setSelectedBatches] = useState([]); // Koszyk wybranych partii
  const [currentStep, setCurrentStep] = useState('category'); // 'category', 'product', 'batches'
  
  useEffect(() => {
    let cancelled = false;
    fetchStocktakingData();
    (async () => {
      try {
        setLoadingCategories(true);
        const categoriesData = await getInventoryCategories();
        if (cancelled) return;
        setCategories(categoriesData);
      } catch (error) {
        if (cancelled) return;
        console.error('Błąd podczas pobierania kategorii:', error);
      } finally {
        if (!cancelled) setLoadingCategories(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);
  
  useEffect(() => {
    filterItems();
  }, [searchTerm, items, showOnlyIncomplete, showAcceptedItems, orderBy, order]);
  
  
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
    
    // Filtruj według statusu akceptacji
    if (showAcceptedItems === 'accepted') {
      filtered = filtered.filter(item => item.accepted);
    } else if (showAcceptedItems === 'pending') {
      filtered = filtered.filter(item => !item.accepted);
    }
    
    // Sortuj wyniki
    filtered = sortItems(filtered);
    
    setFilteredItems(filtered);
  };
  
  // Funkcja sortowania
  const sortItems = (itemsToSort) => {
    return [...itemsToSort].sort((a, b) => {
      let aValue, bValue;
      
      switch (orderBy) {
        case 'name':
          aValue = (a.name || '').toLowerCase();
          bValue = (b.name || '').toLowerCase();
          break;
        case 'lotNumber':
          aValue = (a.lotNumber || a.batchNumber || '').toLowerCase();
          bValue = (b.lotNumber || b.batchNumber || '').toLowerCase();
          break;
        case 'category':
          aValue = (a.category || '').toLowerCase();
          bValue = (b.category || '').toLowerCase();
          break;
        case 'systemQuantity':
          aValue = parseFloat(a.systemQuantity) || 0;
          bValue = parseFloat(b.systemQuantity) || 0;
          break;
        case 'countedQuantity':
          aValue = a.countedQuantity !== null && a.countedQuantity !== undefined ? parseFloat(a.countedQuantity) : -Infinity;
          bValue = b.countedQuantity !== null && b.countedQuantity !== undefined ? parseFloat(b.countedQuantity) : -Infinity;
          break;
        case 'discrepancy':
          aValue = parseFloat(a.discrepancy) || 0;
          bValue = parseFloat(b.discrepancy) || 0;
          break;
        case 'unitPrice':
          aValue = parseFloat(a.unitPrice) || 0;
          bValue = parseFloat(b.unitPrice) || 0;
          break;
        case 'valueDifference':
          const aDisc = parseFloat(a.discrepancy) || 0;
          const aPrice = parseFloat(a.unitPrice) || 0;
          aValue = aDisc * aPrice;
          const bDisc = parseFloat(b.discrepancy) || 0;
          const bPrice = parseFloat(b.unitPrice) || 0;
          bValue = bDisc * bPrice;
          break;
        case 'accepted':
          aValue = a.accepted ? 1 : 0;
          bValue = b.accepted ? 1 : 0;
          break;
        default:
          aValue = (a.name || '').toLowerCase();
          bValue = (b.name || '').toLowerCase();
      }
      
      if (typeof aValue === 'string') {
        const comparison = aValue.localeCompare(bValue, 'pl');
        return order === 'asc' ? comparison : -comparison;
      }
      
      if (order === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });
  };
  
  // Funkcja obsługi zmiany sortowania
  const handleRequestSort = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
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
      
      // Aktualizuj lokalny stan zamiast pobierać wszystko od nowa (zachowuje scroll)
      const newCountedQuantity = Number(countedQuantity);
      setItems(prevItems => prevItems.map(item => {
        if (item.id === editItemId) {
          const discrepancy = newCountedQuantity - (item.systemQuantity || 0);
          return {
            ...item,
            countedQuantity: newCountedQuantity,
            discrepancy,
            notes
          };
        }
        return item;
      }));
      
      setEditItemId(null);
      setCountedQuantity('');
      setNotes('');
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
      
      // Aktualizuj lokalny stan zamiast pobierać wszystko od nowa (zachowuje scroll)
      setItems(prevItems => prevItems.filter(item => item.id !== deleteItemId));
      setDeleteItemId(null);
    } catch (error) {
      console.error('Błąd podczas usuwania przedmiotu:', error);
      showError(`Błąd podczas usuwania: ${error.message}`);
    }
  };
  
  const handleAcceptItem = async (itemId) => {
    try {
      const result = await acceptStocktakingItem(itemId, true, currentUser.uid);
      showSuccess(result.message);
      
      // Aktualizuj lokalny stan zamiast pobierać wszystko od nowa (zachowuje scroll)
      setItems(prevItems => prevItems.map(item => 
        item.id === itemId 
          ? { ...item, accepted: true, status: 'Zaakceptowana', adjustmentApplied: true }
          : item
      ));
    } catch (error) {
      console.error('Błąd podczas akceptowania pozycji:', error);
      
      // Jeśli to błąd rezerwacji, pokaż dialog z opcją anulowania rezerwacji
      if (error.message && error.message.includes('OSTRZEŻENIE REZERWACJI')) {
        // 🔍 Znajdź pozycję w items, aby pobrać batchId (KRYTYCZNE!)
        const item = items.find(i => i.id === itemId);
        
        if (!item) {
          showError('Nie można znaleźć pozycji w inwentaryzacji');
          return;
        }
        
        // Parsuj komunikat błędu aby wyodrębnić strukturowane dane
        const warning = parseReservationWarningFromError(error.message);
        
        if (warning && item.batchId) {
          // ✅ DODAJ batchId z pozycji (to tego brakowało!)
          warning.batchId = item.batchId;
          warning.itemName = item.name; // Dodaj też nazwę dla pewności
          
          console.log('🔧 Dodano batchId do ostrzeżenia:', {
            batchId: warning.batchId,
            batchNumber: warning.batchNumber,
            itemName: warning.itemName
          });
          
          // Pokaż dialog z ostrzeżeniem
          setSingleItemReservationDialog({
            open: true,
            itemId: itemId,
            warnings: [warning],
            cancelReservations: true
          });
        } else if (!item.batchId) {
          showError('Ta pozycja nie ma przypisanej partii. Problem z rezerwacjami dotyczy tylko partii.');
        } else {
          // Fallback - pokaż surowy komunikat
          showError(error.message);
        }
      } else {
        showError(`Błąd: ${error.message}`);
      }
    }
  };
  
  // Funkcja do parsowania ostrzeżenia z komunikatu błędu
  const parseReservationWarningFromError = (errorMessage) => {
    try {
      const lines = errorMessage.split('\n');
      const warning = {};
      
      // Wyodrębnij dane z komunikatu
      lines.forEach(line => {
        if (line.includes('📦 Partia:')) {
          warning.batchNumber = line.split(':')[1].trim();
        } else if (line.includes('📊 Obecna ilość:')) {
          const parts = line.split(':')[1].trim().split(' ');
          warning.currentQuantity = parseFloat(parts[0]);
          warning.unit = parts[1];
        } else if (line.includes('📉 Po korekcie:')) {
          const parts = line.split(':')[1].trim().split(' ');
          warning.newQuantity = parseFloat(parts[0]);
        } else if (line.includes('🔒 Zarezerwowane:')) {
          const parts = line.split(':')[1].trim().split(' ');
          warning.totalReserved = parseFloat(parts[0]);
        } else if (line.includes('❌ Niedobór:')) {
          const parts = line.split(':')[1].trim().split(' ');
          warning.shortage = parseFloat(parts[0]);
        }
      });
      
      // Wyodrębnij rezerwacje
      warning.reservations = [];
      let inReservationSection = false;
      lines.forEach(line => {
        if (line.includes('Zarezerwowane dla zadań:')) {
          inReservationSection = true;
        } else if (inReservationSection && line.trim().startsWith('•')) {
          const resLine = line.replace('•', '').trim();
          const match = resLine.match(/(.+?)\s+-\s+(.+?)\s+(.+?)(\s+\((.+)\))?$/);
          if (match) {
            warning.reservations.push({
              displayName: match[1],
              quantity: parseFloat(match[2]),
              clientName: match[5] || 'N/A'
            });
          }
        } else if (inReservationSection && line.includes('🔧')) {
          inReservationSection = false;
        }
      });
      
      return warning.batchNumber ? warning : null;
    } catch (error) {
      console.error('Błąd parsowania ostrzeżenia:', error);
      return null;
    }
  };
  
  // Funkcja do akceptacji pozycji z anulowaniem rezerwacji
  const handleConfirmAcceptWithReservations = async () => {
    try {
      const { itemId, warnings, cancelReservations: shouldCancelReservations } = singleItemReservationDialog;
      
      // Jeśli użytkownik chce anulować rezerwacje
      if (shouldCancelReservations && warnings.length > 0) {
        setCancellingReservations(true);
        try {
          // Anuluj rezerwacje dla tej partii
          const result = await cancelThreatenedReservations(warnings, currentUser.uid);
          if (result.success) {
            showSuccess(`Anulowano ${result.cancelledCount} rezerwacji`);
            
            // Zapisz informacje o anulowanych rezerwacjach do inwentaryzacji (dla raportu)
            await saveCancelledReservationsToStocktaking(id, result, currentUser.uid);
          }
        } catch (error) {
          console.error('Błąd podczas anulowania rezerwacji:', error);
          showError(`Błąd podczas anulowania rezerwacji: ${error.message}`);
        } finally {
          setCancellingReservations(false);
        }
      }
      
      // Teraz spróbuj ponownie zaakceptować pozycję (rezerwacje już anulowane)
      try {
        const result = await acceptStocktakingItem(itemId, true, currentUser.uid);
        showSuccess(result.message);
        
        // Zamknij dialog
        setSingleItemReservationDialog({
          open: false,
          itemId: null,
          warnings: [],
          cancelReservations: true
        });
        
        // Aktualizuj lokalny stan zamiast pobierać wszystko od nowa (zachowuje scroll)
        setItems(prevItems => prevItems.map(item => 
          item.id === itemId 
            ? { ...item, accepted: true, status: 'Zaakceptowana', adjustmentApplied: true }
            : item
        ));
      } catch (error) {
        console.error('Błąd podczas akceptowania pozycji po anulowaniu rezerwacji:', error);
        showError(`Błąd: ${error.message}`);
      }
    } catch (error) {
      console.error('Błąd podczas potwierdzania akceptacji:', error);
      showError(`Błąd: ${error.message}`);
    }
  };

  const handleUnacceptItem = async (itemId) => {
    try {
      const result = await unacceptStocktakingItem(itemId, true, currentUser.uid);
      showSuccess(result.message);
      
      // Aktualizuj lokalny stan zamiast pobierać wszystko od nowa (zachowuje scroll)
      setItems(prevItems => prevItems.map(item => 
        item.id === itemId 
          ? { ...item, accepted: false, status: 'Dodano', adjustmentApplied: false }
          : item
      ));
    } catch (error) {
      console.error('Błąd podczas cofania akceptacji:', error);
      showError(`Błąd: ${error.message}`);
    }
  };

  const handleCompleteStocktaking = async () => {
    // Sprawdź uprawnienia użytkownika
    if (!canCompleteStocktaking) {
      showError('Nie masz uprawnień do kończenia inwentaryzacji. Skontaktuj się z administratorem.');
      return;
    }
    
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
            
            // Zapisz informacje o anulowanych rezerwacjach do inwentaryzacji (dla raportu)
            await saveCancelledReservationsToStocktaking(id, result, currentUser.uid);
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

  // Obsługa załączników
  const handleAttachmentsChange = async (newAttachments) => {
    try {
      await updateStocktakingAttachments(id, newAttachments, currentUser.uid);
      setStocktaking(prev => ({ ...prev, attachments: newAttachments }));
      showSuccess(t('stocktaking.attachments.descriptionSaved'));
    } catch (error) {
      console.error('Błąd podczas aktualizacji załączników:', error);
      showError(`Błąd aktualizacji załączników: ${error.message}`);
    }
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

      {/* Sekcja załączników */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <StocktakingAttachments
          stocktakingId={id}
          attachments={stocktaking.attachments || []}
          onAttachmentsChange={handleAttachmentsChange}
          disabled={isCompleted && !isInCorrection}
          viewOnly={isCompleted && !isInCorrection}
        />
      </Paper>
      
      <Box sx={{ mb: 2 }}>
        <Typography variant="h5">
          {t('stocktaking.products', { count: items.length })}
        </Typography>
      </Box>
      
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={4}>
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
          <Grid item xs={12} md={8}>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
              {(!isCompleted || isInCorrection) && (
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<AddIcon />}
                  onClick={() => setAddItemDialogOpen(true)}
                >
                  {t('stocktaking.addProduct')}
                </Button>
              )}
              {items.length > 0 && (
                <>
                  <Button
                    variant={showOnlyIncomplete ? "contained" : "outlined"}
                    color="warning"
                    startIcon={<FilterIcon />}
                    onClick={() => setShowOnlyIncomplete(!showOnlyIncomplete)}
                  >
                    {t('stocktaking.toComplete')}
                  </Button>
                  <FormControl size="small" sx={{ minWidth: 200 }}>
                    <InputLabel>Status akceptacji</InputLabel>
                    <Select
                      value={showAcceptedItems}
                      onChange={(e) => setShowAcceptedItems(e.target.value)}
                      label="Status akceptacji"
                    >
                      <MenuItem value="all">Wszystkie</MenuItem>
                      <MenuItem value="pending">Oczekujące</MenuItem>
                      <MenuItem value="accepted">Zaakceptowane</MenuItem>
                    </Select>
                  </FormControl>
                </>
              )}
              {(!isCompleted || isInCorrection) && items.length > 0 && (
                <Tooltip 
                  title={!canCompleteStocktaking ? 'Nie masz uprawnień do kończenia inwentaryzacji' : ''}
                  arrow
                >
                  <span>
                    <Button
                      variant="contained"
                      color="success"
                      startIcon={<DoneIcon />}
                      onClick={handleCompleteStocktaking}
                      disabled={!canCompleteStocktaking || permissionsLoading}
                    >
                      {isInCorrection ? t('stocktaking.finishCorrections') : t('stocktaking.finishStocktaking')}
                    </Button>
                  </span>
                </Tooltip>
              )}
            </Box>
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
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'name'}
                    direction={orderBy === 'name' ? order : 'asc'}
                    onClick={() => handleRequestSort('name')}
                  >
                    {t('stocktaking.tableHeaders.productName')}
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'lotNumber'}
                    direction={orderBy === 'lotNumber' ? order : 'asc'}
                    onClick={() => handleRequestSort('lotNumber')}
                  >
                    {t('stocktaking.tableHeaders.lotBatch')}
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'category'}
                    direction={orderBy === 'category' ? order : 'asc'}
                    onClick={() => handleRequestSort('category')}
                  >
                    {t('stocktaking.tableHeaders.category')}
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={orderBy === 'systemQuantity'}
                    direction={orderBy === 'systemQuantity' ? order : 'asc'}
                    onClick={() => handleRequestSort('systemQuantity')}
                  >
                    {t('stocktaking.tableHeaders.systemQuantity')}
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={orderBy === 'countedQuantity'}
                    direction={orderBy === 'countedQuantity' ? order : 'asc'}
                    onClick={() => handleRequestSort('countedQuantity')}
                  >
                    {t('stocktaking.tableHeaders.countedQuantity')}
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={orderBy === 'discrepancy'}
                    direction={orderBy === 'discrepancy' ? order : 'asc'}
                    onClick={() => handleRequestSort('discrepancy')}
                  >
                    {t('stocktaking.tableHeaders.difference')}
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={orderBy === 'unitPrice'}
                    direction={orderBy === 'unitPrice' ? order : 'asc'}
                    onClick={() => handleRequestSort('unitPrice')}
                  >
                    {t('stocktaking.tableHeaders.unitPrice')}
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={orderBy === 'valueDifference'}
                    direction={orderBy === 'valueDifference' ? order : 'asc'}
                    onClick={() => handleRequestSort('valueDifference')}
                  >
                    {t('stocktaking.tableHeaders.valueDifference')}
                  </TableSortLabel>
                </TableCell>
                <TableCell>{t('stocktaking.tableHeaders.notes')}</TableCell>
                <TableCell align="center">
                  <TableSortLabel
                    active={orderBy === 'accepted'}
                    direction={orderBy === 'accepted' ? order : 'asc'}
                    onClick={() => handleRequestSort('accepted')}
                  >
                    Status
                  </TableSortLabel>
                </TableCell>
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
                            Ważne do: {formatDate(item.expiryDate)}
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
                        {item.accepted ? (
                          <Chip 
                            icon={<CheckCircleIcon />}
                            label="Zaakceptowana" 
                            color="success" 
                            size="small" 
                          />
                        ) : (
                          <Chip 
                            label="Oczekuje" 
                            color="default" 
                            size="small" 
                          />
                        )}
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
                            label={t('stocktaking.requiresQuantityCompletion')} 
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
                            Ważne do: {formatDate(item.expiryDate)}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{item.category}</TableCell>
                      <TableCell align="right">{item.systemQuantity} {item.unit}</TableCell>
                      <TableCell align="right">
                        {needsQuantity ? (
                          <Chip label={t('stocktaking.toComplete')} color="warning" size="small" />
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
                      <TableCell align="center">
                        {item.accepted ? (
                          <Chip 
                            icon={<CheckCircleIcon />}
                            label="Zaakceptowana" 
                            color="success" 
                            size="small" 
                          />
                        ) : (
                          <Chip 
                            label="Oczekuje" 
                            color="default" 
                            size="small" 
                          />
                        )}
                      </TableCell>
                      {(!isCompleted || isInCorrection) && (
                        <TableCell align="center">
                          {!item.accepted ? (
                            <Tooltip title="Zaakceptuj pozycję">
                              <span>
                                <IconButton
                                  size="small"
                                  color="success"
                                  onClick={() => handleAcceptItem(item.id)}
                                  disabled={needsQuantity}
                                >
                                  <CheckCircleIcon />
                                </IconButton>
                              </span>
                            </Tooltip>
                          ) : (
                            <Tooltip title={t('stocktaking.undoAcceptance')}>
                              <IconButton
                                size="small"
                                color="warning"
                                onClick={() => handleUnacceptItem(item.id)}
                              >
                                <CancelCheckIcon />
                              </IconButton>
                            </Tooltip>
                          )}
                          <IconButton color="primary" onClick={() => handleEditItem(item.id)} size="small">
                            <EditIcon />
                          </IconButton>
                          {needsQuantity && (
                            <Tooltip title={t('stocktaking.itemRequiresQuantity')}>
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
              <InputLabel id="category-select-label">{t('stocktaking.selectCategory')}</InputLabel>
              <Select
                labelId="category-select-label"
                value={selectedCategory}
                onChange={(e) => handleCategorySelect(e.target.value)}
                required
                label={t('stocktaking.selectCategory')}
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
                                label={t('stocktaking.alreadyAdded')} 
                                color="default" 
                                size="small" 
                                sx={{ ml: 1 }}
                              />
                            )}
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            Ilość: {batch.quantity} {selectedItem.unit}
                            {batch.expiryDate && ` | Ważne do: ${formatDate(batch.expiryDate)}`}
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
              label={t('stocktaking.notesForAllSelectedItems')}
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
      
      {/* Dialog ostrzeżenia o rezerwacjach dla pojedynczej pozycji */}
      <Dialog 
        open={singleItemReservationDialog.open} 
        onClose={() => setSingleItemReservationDialog({ open: false, itemId: null, warnings: [], cancelReservations: true })}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <WarningIcon color="warning" />
            <Typography variant="h6">
              Ostrzeżenie - Konflikt z rezerwacjami
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Nie można zaakceptować tej pozycji ze względu na istniejące rezerwacje. Po korekcie ilość będzie niewystarczająca dla zarezerwowanych zadań.
          </DialogContentText>

          {/* Ostrzeżenia o rezerwacjach */}
          {singleItemReservationDialog.warnings.length > 0 && (
            <Box>
              <Alert severity="warning" sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                  Wykryto konflikt z rezerwacjami
                </Typography>
                <Typography variant="body2">
                  Po akceptacji tej pozycji, ilość będzie niewystarczająca dla istniejących rezerwacji.
                </Typography>
              </Alert>

              <Box sx={{ maxHeight: 300, overflowY: 'auto' }}>
                {singleItemReservationDialog.warnings.map((warning, index) => (
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
                      Partia: {warning.batchNumber}
                    </Typography>
                    <Typography variant="body2" sx={{ 
                      color: (theme) => theme.palette.mode === 'dark' ? 'text.secondary' : 'warning.dark',
                      mb: 1
                    }}>
                      Obecna ilość: <strong>{warning.currentQuantity} {warning.unit}</strong> → 
                      Po korekcie: <strong>{warning.newQuantity} {warning.unit}</strong>
                      <br />
                      Zarezerwowane: <strong>{warning.totalReserved} {warning.unit}</strong> → 
                      Niedobór: <strong style={{ color: 'red' }}>{warning.shortage} {warning.unit}</strong>
                    </Typography>
                    
                    {warning.reservations && warning.reservations.length > 0 && (
                      <Box sx={{ mt: 1 }}>
                        <Typography variant="caption" sx={{ 
                          fontWeight: 'bold', 
                          color: (theme) => theme.palette.mode === 'dark' ? 'warning.light' : 'warning.dark',
                          display: 'block',
                          mb: 0.5
                        }}>
                          Zarezerwowane dla zadań:
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
                                {res.displayName} {res.clientName !== 'N/A' && `(${res.clientName})`}
                              </Typography>
                              <Typography variant="body2" sx={{ 
                                fontWeight: 'bold', 
                                color: (theme) => theme.palette.mode === 'dark' ? 'error.light' : 'error.main'
                              }}>
                                {res.quantity} {warning.unit}
                              </Typography>
                            </Box>
                          ))}
                        </Box>
                      </Box>
                    )}
                  </Paper>
                ))}
              </Box>

              {/* Opcje anulowania rezerwacji */}
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
                  Co możesz zrobić?
                </Typography>
                
                <FormControlLabel
                  control={
                    <Switch
                      checked={singleItemReservationDialog.cancelReservations}
                      onChange={(e) => setSingleItemReservationDialog(prev => ({
                        ...prev,
                        cancelReservations: e.target.checked
                      }))}
                      color="warning"
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                        Anuluj rezerwacje dla tej partii
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Rezerwacje zostaną usunięte, a następnie pozycja zostanie zaakceptowana
                      </Typography>
                    </Box>
                  }
                  sx={{ alignItems: 'flex-start', mb: 1 }}
                />

                {singleItemReservationDialog.cancelReservations && (
                  <Alert severity="info" sx={{ mt: 1 }}>
                    <Typography variant="body2">
                      Zostaną anulowane wszystkie rezerwacje dla partii <strong>{singleItemReservationDialog.warnings[0]?.batchNumber}</strong>
                    </Typography>
                  </Alert>
                )}
              </Box>

              <Alert severity="info" sx={{ mt: 2 }}>
                <Typography variant="body2">
                  <strong>Alternatywnie:</strong> Możesz anulować tę operację i:
                </Typography>
                <Typography variant="body2" component="ul" sx={{ mt: 1, mb: 0 }}>
                  <li>Skorygować ilość policzoną w inwentaryzacji</li>
                  <li>Cofnąć/zmniejszyć rezerwacje w zadaniach produkcyjnych</li>
                  <li>Użyć "Zakończ inwentaryzację" do anulowania wszystkich zagrożonych rezerwacji naraz</li>
                </Typography>
              </Alert>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSingleItemReservationDialog({ open: false, itemId: null, warnings: [], cancelReservations: true })}>
            Anuluj
          </Button>
          
          {cancellingReservations ? (
            <Button disabled>
              <CircularProgress size={20} sx={{ mr: 1 }} />
              Anulowanie rezerwacji...
            </Button>
          ) : (
            <Button 
              onClick={handleConfirmAcceptWithReservations} 
              color="warning"
              variant="contained"
            >
              {singleItemReservationDialog.cancelReservations 
                ? 'Anuluj rezerwacje i zaakceptuj'
                : 'Zaakceptuj mimo ostrzeżeń'
              }
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default StocktakingDetailsPage; 