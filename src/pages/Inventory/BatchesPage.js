import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link, useLocation, useSearchParams } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  Grid,
  Button,
  Box,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Alert,
  AlertTitle,
  TextField,
  InputAdornment,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
  CircularProgress,
  useMediaQuery,
  useTheme,
  FormControlLabel,
  Checkbox,
  TableSortLabel
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  Edit as EditIcon,
  SwapHoriz as SwapHorizIcon,
  QrCode as QrCodeIcon,
  Print as PrintIcon,
  Delete as DeleteIcon,
  FileUpload as FileUploadIcon,
  InsertDriveFile as InsertDriveFileIcon,
  Refresh as RefreshIcon,
  Archive as ArchiveIcon,
  Unarchive as UnarchiveIcon
} from '@mui/icons-material';
import { 
  getInventoryItemById, 
  getItemBatches, 
  getAllWarehouses, 
  transferBatch, 
  deleteBatch,
  uploadBatchCertificate,
  deleteBatchCertificate,
  getBatchReservations,
  debugReservationTransfer,
  debugMaterialBatches,
  debugDuplicateBatches,
  debugAndCleanDuplicateReservations
} from '../../services/inventory';
import { archiveBatch, unarchiveBatch } from '../../services/inventory/batchService';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import { formatDate, formatQuantity } from '../../utils/formatters';
import { Timestamp } from 'firebase/firestore';
import { useAuth } from '../../hooks/useAuth';
import { auth } from '../../services/firebase/config';
import { getTaskById } from '../../services/productionService';
import LabelDialog from '../../components/inventory/LabelDialog';
import BatchVisualization from '../../components/inventory/BatchVisualization';
import BatchDetailsDialog from '../../components/inventory/BatchDetailsDialog';

const BatchesPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showError, showSuccess } = useNotification();
  const { currentUser } = useAuth();
  const { t } = useTranslation('inventory');
  const [localUser, setLocalUser] = useState(null);
  const [item, setItem] = useState(null);
  const [batches, setBatches] = useState([]);
  const [filteredBatches, setFilteredBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [hideDepleted, setHideDepleted] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [orderBy, setOrderBy] = useState('batchNumber');
  const [order, setOrder] = useState('asc');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [warehouses, setWarehouses] = useState([]);
  const [targetWarehouseId, setTargetWarehouseId] = useState('');
  const [transferQuantity, setTransferQuantity] = useState('');
  const [transferErrors, setTransferErrors] = useState({});
  const [processingTransfer, setProcessingTransfer] = useState(false);
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  const [selectedBatchForLabel, setSelectedBatchForLabel] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedBatchForDelete, setSelectedBatchForDelete] = useState(null);
  const [processingDelete, setProcessingDelete] = useState(false);
  const [certificateDialogOpen, setCertificateDialogOpen] = useState(false);
  const [selectedBatchForCertificate, setSelectedBatchForCertificate] = useState(null);
  const [certificateFile, setCertificateFile] = useState(null);
  const [certificatePreviewUrl, setCertificatePreviewUrl] = useState(null);
  const [uploadingCertificate, setUploadingCertificate] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [selectedCertificateForPreview, setSelectedCertificateForPreview] = useState(null);
  const [batchReservations, setBatchReservations] = useState([]);
  const [loadingReservations, setLoadingReservations] = useState(false);
  const [selectedTransferSource, setSelectedTransferSource] = useState(''); // 'free' lub ID rezerwacji
  const [availableTransferQuantity, setAvailableTransferQuantity] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedBatchForDetails, setSelectedBatchForDetails] = useState(null);
  const [highlightedBatchId, setHighlightedBatchId] = useState(null);
  const fileInputRef = React.useRef(null);

  // Dodaję wykrywanie urządzeń mobilnych
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  useEffect(() => {
    // Aktualizuj lokalny stan użytkownika, gdy currentUser się zmieni
    if (currentUser) {
      setLocalUser(currentUser);
    } else if (auth.currentUser) {
      // Fallback jeśli currentUser z hooka jest niedostępny, ale auth.currentUser jest dostępny
      setLocalUser(auth.currentUser);
    }
  }, [currentUser]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        let itemData = null;
        let batchesData = [];
        
        // Próbuj pobrać informacje o produkcie
        itemData = await getInventoryItemById(id);
        setItem(itemData); // może być null, co jest teraz obsługiwane
        
        try {
          // Pobierz partie niezależnie od tego, czy udało się pobrać produkt
          batchesData = await getItemBatches(id);
        } catch (batchError) {
          console.error('Error fetching batches:', batchError);
          showError('Nie znaleziono partii: ' + batchError.message);
          setLoading(false);
          return;
        }
        
        // Jeśli nie ma partii, wyświetl informację
        if (batchesData.length === 0) {
          setBatches([]);
          setFilteredBatches([]);
          setLoading(false);
          return;
        }
        
        const warehousesData = await getAllWarehouses();
        setWarehouses(warehousesData);
        
        // Dodaj informacje o lokalizacji magazynu do każdej partii
        const enhancedBatches = batchesData.map(batch => {
          const warehouse = warehousesData.find(w => w.id === batch.warehouseId);
          return {
            ...batch,
            warehouseName: warehouse?.name || 'Magazyn podstawowy',
            warehouseAddress: warehouse?.address || '',
          };
        });
        
        setBatches(enhancedBatches);
        setFilteredBatches(enhancedBatches);
      } catch (error) {
        showError(t('inventory.batches.errorFetchingBatchData') + ': ' + error.message);
        console.error('Error fetching batch data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, showError]);

  // Funkcja odświeżania danych partii
  const handleRefreshData = async () => {
    try {
      setRefreshing(true);
      
      let itemData = null;
      let batchesData = [];
      
      // Pobierz informacje o produkcie
      try {
        itemData = await getInventoryItemById(id);
        setItem(itemData);
      } catch (itemError) {
        console.warn('Nie udało się pobrać danych produktu, ale można kontynuować:', itemError);
      }
      
      try {
        // Pobierz partie
        batchesData = await getItemBatches(id);
      } catch (batchError) {
        console.error('Error fetching batches:', batchError);
        showError('Nie znaleziono partii: ' + batchError.message);
        return;
      }
      
      if (batchesData.length === 0) {
        setBatches([]);
        setFilteredBatches([]);
        showSuccess('Dane zostały odświeżone. Brak partii dla tego produktu.');
        return;
      }
      
      const warehousesData = await getAllWarehouses();
      setWarehouses(warehousesData);
      
      // Dodaj informacje o lokalizacji magazynu do każdej partii
      const enhancedBatches = batchesData.map(batch => {
        const warehouse = warehousesData.find(w => w.id === batch.warehouseId);
        return {
          ...batch,
          warehouseName: warehouse?.name || 'Magazyn podstawowy',
          warehouseAddress: warehouse?.address || '',
        };
      });
      
      setBatches(enhancedBatches);
      setFilteredBatches(enhancedBatches);
      showSuccess(`Dane zostały odświeżone. Znaleziono ${enhancedBatches.length} partii.`);
    } catch (error) {
      showError('Błąd podczas odświeżania danych: ' + error.message);
      console.error('Error refreshing data:', error);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let filtered = batches;
    
    // Filtruj po wyszukiwanym terminie
    if (searchTerm.trim() !== '') {
      filtered = filtered.filter(batch => 
        (batch.batchNumber && batch.batchNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (batch.notes && batch.notes.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    
    // Ukryj wyczerpane partie jeśli opcja jest włączona
    if (hideDepleted) {
      filtered = filtered.filter(batch => batch.quantity > 0);
    }

    // Ukryj zarchiwizowane partie jeśli opcja jest wyłączona
    if (!showArchived) {
      filtered = filtered.filter(batch => !batch.archived);
    }
    
    setFilteredBatches(filtered);
  }, [searchTerm, batches, hideDepleted, showArchived]);

  // Dodaj funkcje debugowania do globalnego zakresu (TYLKO DLA TESTÓW)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.debugReservationTransfer = debugReservationTransfer;
      window.debugMaterialBatches = debugMaterialBatches;
      window.debugDuplicateBatches = debugDuplicateBatches;
      window.debugAndCleanDuplicateReservations = debugAndCleanDuplicateReservations;
      console.log('🔧 [DEBUG] Funkcje debugowania dostępne w konsoli:');
      console.log('  - window.debugReservationTransfer(batchId)');
      console.log('  - window.debugMaterialBatches(batchId)');
      console.log('  - window.debugDuplicateBatches(taskId)');
      console.log('  - window.debugAndCleanDuplicateReservations(batchId)');
    }
  }, []);

  // Automatyczne otwieranie dialogu szczegółów partii z URL
  useEffect(() => {
    const batchIdFromUrl = searchParams.get('batchId');
    
    if (batchIdFromUrl && batches.length > 0 && !detailsDialogOpen) {
      // Znajdź partię po ID
      const foundBatch = batches.find(b => b.id === batchIdFromUrl);
      
      if (foundBatch) {
        console.log('🔍 [BatchesPage] Znaleziono partię z URL:', foundBatch);
        
        // Otwórz dialog szczegółów
        handleOpenDetailsDialog(foundBatch);
        
        // Podświetl partię w tabeli
        setHighlightedBatchId(batchIdFromUrl);
        
        // Przewiń do strony z tą partią
        setTimeout(() => {
          const batchIndex = filteredBatches.findIndex(b => b.id === batchIdFromUrl);
          if (batchIndex !== -1) {
            const pageIndex = Math.floor(batchIndex / rowsPerPage);
            setPage(pageIndex);
          }
        }, 100);
        
        // Usuń parametr z URL (aby URL był czysty)
        searchParams.delete('batchId');
        setSearchParams(searchParams, { replace: true });
        
        // Usuń podświetlenie po 3 sekundach
        setTimeout(() => setHighlightedBatchId(null), 3000);
      } else {
        // Partia nie znaleziona - pokaż komunikat
        console.warn('⚠️ [BatchesPage] Nie znaleziono partii o ID:', batchIdFromUrl);
        showError('Nie znaleziono partii o podanym ID');
        searchParams.delete('batchId');
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [batches, searchParams, detailsDialogOpen, filteredBatches, rowsPerPage, setSearchParams, showError]);

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setPage(0);
  };

  const clearSearch = () => {
    setSearchTerm('');
  };

  // Funkcja do obsługi sortowania
  const handleRequestSort = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
    setPage(0); // Reset do pierwszej strony przy zmianie sortowania
  };

  // Funkcja do sortowania danych
  const getSortedBatches = (batches) => {
    const comparator = (a, b) => {
      let aValue, bValue;
      
      switch (orderBy) {
        case 'batchNumber':
          aValue = (a.batchNumber || a.lotNumber || '').toLowerCase();
          bValue = (b.batchNumber || b.lotNumber || '').toLowerCase();
          break;
          
        case 'expiryDate':
          // Obsługa brakujących dat lub dat domyślnych
          aValue = a.expiryDate 
            ? (a.expiryDate instanceof Timestamp ? a.expiryDate.toDate() : new Date(a.expiryDate))
            : new Date('9999-12-31'); // Partie bez daty na końcu
          bValue = b.expiryDate 
            ? (b.expiryDate instanceof Timestamp ? b.expiryDate.toDate() : new Date(b.expiryDate))
            : new Date('9999-12-31');
          
          // Sprawdź czy to domyślna data (rok 1970 lub wcześniejszy)
          if (aValue.getFullYear() <= 1970) aValue = new Date('9999-12-31');
          if (bValue.getFullYear() <= 1970) bValue = new Date('9999-12-31');
          break;
          
        case 'warehouse':
          aValue = (a.warehouseName || 'Magazyn podstawowy').toLowerCase();
          bValue = (b.warehouseName || 'Magazyn podstawowy').toLowerCase();
          break;
          
        case 'quantity':
          aValue = parseFloat(a.quantity) || 0;
          bValue = parseFloat(b.quantity) || 0;
          break;
          
        case 'unitPrice':
          aValue = parseFloat(a.unitPrice) || 0;
          bValue = parseFloat(b.unitPrice) || 0;
          break;
          
        case 'status':
          // Sortuj według statusu: Aktualna, Wygasa wkrótce, Przeterminowana, Wyczerpana
          const statusOrder = { 
            'Aktualna': 1, 
            'Wygasa wkrótce': 2, 
            'Przeterminowana': 3, 
            'Wyczerpana': 4,
            'current': 1,
            'expiringSoon': 2,
            'expired': 3,
            'depleted': 4
          };
          const statusA = getBatchStatus(a);
          const statusB = getBatchStatus(b);
          aValue = statusOrder[statusA.label] || 999;
          bValue = statusOrder[statusB.label] || 999;
          break;
          
        default:
          aValue = '';
          bValue = '';
      }
      
      if (aValue < bValue) {
        return order === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return order === 'asc' ? 1 : -1;
      }
      return 0;
    };
    
    return [...batches].sort(comparator);
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const getBatchStatus = (batch) => {
    if (batch.quantity <= 0) {
      return { label: t('inventory.batches.status.depleted'), color: 'default' };
    }

    // Jeśli brak daty ważności, nie może być przeterminowana
    if (!batch.expiryDate) {
      return { label: t('inventory.batches.status.current'), color: 'success' };
    }

    const today = new Date();
    const expiryDate = batch.expiryDate instanceof Timestamp 
      ? batch.expiryDate.toDate() 
      : new Date(batch.expiryDate);
    
    // Sprawdź czy to domyślna data (rok 1970 lub wcześniejszy)
    const isDefaultOrInvalidDate = expiryDate.getFullYear() <= 1970;
    
    // Jeśli to domyślna data, traktuj jak brak daty ważności
    if (isDefaultOrInvalidDate) {
      return { label: t('inventory.batches.status.current'), color: 'success' };
    }
    
    if (expiryDate < today) {
      return { label: t('inventory.batches.status.expired'), color: 'error' };
    }
    
    const twelveMonthsFromNow = new Date();
    twelveMonthsFromNow.setMonth(today.getMonth() + 12);
    
    if (expiryDate <= twelveMonthsFromNow) {
      return { label: t('inventory.batches.status.expiringSoon'), color: 'warning' };
    }
    
    return { label: t('inventory.batches.status.current'), color: 'success' };
  };

  const getExpiryWarning = () => {
    const expiredCount = filteredBatches.filter(batch => {
      if (batch.quantity <= 0) return false;
      if (!batch.expiryDate) return false; // Pomiń partie bez daty ważności
      
      const expiryDate = batch.expiryDate instanceof Timestamp 
        ? batch.expiryDate.toDate() 
        : new Date(batch.expiryDate);
      
      // Sprawdź czy to domyślna data (rok 1970 lub wcześniejszy)
      const isDefaultOrInvalidDate = expiryDate.getFullYear() <= 1970;
      if (isDefaultOrInvalidDate) return false; // Pomiń partie z domyślną datą
      
      return expiryDate < new Date();
    }).length;
    
    const expiringCount = filteredBatches.filter(batch => {
      if (batch.quantity <= 0) return false;
      if (!batch.expiryDate) return false; // Pomiń partie bez daty ważności
      
      const today = new Date();
      const twelveMonthsFromNow = new Date();
      twelveMonthsFromNow.setMonth(today.getMonth() + 12);
      
      const expiryDate = batch.expiryDate instanceof Timestamp 
        ? batch.expiryDate.toDate() 
        : new Date(batch.expiryDate);
      
      // Sprawdź czy to domyślna data (rok 1970 lub wcześniejszy)
      const isDefaultOrInvalidDate = expiryDate.getFullYear() <= 1970;
      if (isDefaultOrInvalidDate) return false; // Pomiń partie z domyślną datą
      
      return expiryDate >= today && expiryDate <= twelveMonthsFromNow;
    }).length;
    
    if (expiredCount > 0) {
      return (
        <Alert severity="error" sx={{ mb: 3 }}>
          <AlertTitle>Uwaga!</AlertTitle>
          Wykryto {expiredCount} {expiredCount === 1 ? 'przeterminowaną partię' : 
            expiredCount < 5 ? 'przeterminowane partie' : 'przeterminowanych partii'}
        </Alert>
      );
    } else if (expiringCount > 0) {
      return (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <AlertTitle>Uwaga!</AlertTitle>
          Wykryto {expiringCount} {expiringCount === 1 ? 'partię wygasającą' : 
            expiringCount < 5 ? 'partie wygasające' : 'partii wygasających'} w ciągu 12 miesięcy
        </Alert>
      );
    }
    
    return null;
  };

  const openTransferDialog = async (batch) => {
    console.log('Otwieranie dialogu dla partii:', batch);
    setSelectedBatch(batch);
    setTransferQuantity('');
    setTargetWarehouseId('');
    setTransferErrors({});
    setBatchReservations([]);
    setLoadingReservations(true);
    setSelectedTransferSource('');
    setAvailableTransferQuantity(0);
    setTransferDialogOpen(true);
    
    // Pobierz rezerwacje dla tej partii
    try {
      const reservations = await getBatchReservations(batch.id);
      
      // Wzbogać dane o szczegóły zadań produkcyjnych
      const enrichedReservations = await Promise.all(
        reservations.map(async (reservation) => {
          try {
            const taskId = reservation.taskId || reservation.referenceId;
            if (taskId) {
              const taskDetails = await getTaskById(taskId);
              return {
                ...reservation,
                taskDetails: taskDetails,
                moNumber: taskDetails?.moNumber || reservation.moNumber || 'Brak numeru MO'
              };
            }
            return {
              ...reservation,
              moNumber: reservation.moNumber || 'Brak numeru MO'
            };
          } catch (error) {
            console.warn('Nie można pobrać szczegółów zadania:', error);
            return {
              ...reservation,
              moNumber: reservation.moNumber || 'Brak numeru MO'
            };
          }
        })
      );
      
      setBatchReservations(enrichedReservations);
    } catch (error) {
      console.error('Błąd podczas pobierania rezerwacji partii:', error);
      showError('Nie można pobrać informacji o rezerwacjach partii');
    } finally {
      setLoadingReservations(false);
    }
  };

  const closeTransferDialog = () => {
    setTransferDialogOpen(false);
    setSelectedBatch(null);
    setBatchReservations([]);
    setLoadingReservations(false);
    setSelectedTransferSource('');
    setAvailableTransferQuantity(0);
    setTransferQuantity('');
  };

  const handleTransferSourceChange = (sourceId) => {
    setSelectedTransferSource(sourceId);
    setTransferQuantity('');
    
    if (sourceId === 'free') {
      // Część wolna
      const totalReserved = batchReservations.reduce((sum, res) => sum + (parseFloat(res.quantity) || 0), 0);
      const freeQuantity = Math.max(0, selectedBatch.quantity - totalReserved);
      setAvailableTransferQuantity(freeQuantity);
    } else if (sourceId) {
      // Konkretna rezerwacja
      const reservation = batchReservations.find(res => res.id === sourceId);
      if (reservation) {
        setAvailableTransferQuantity(parseFloat(reservation.quantity) || 0);
      }
    } else {
      setAvailableTransferQuantity(0);
    }
  };

  const validateTransferForm = () => {
    const errors = {};
    
    if (!targetWarehouseId) {
      errors.targetWarehouseId = t('inventory.batches.selectTargetWarehouse');
    }
    
    if (!selectedTransferSource) {
      errors.transferSource = t('inventory.batches.selectTransferSource');
    }
    
    // Pobierz sourceWarehouseId z partii - musi być zdefiniowany
    const sourceWarehouseId = selectedBatch.warehouseId;
    
    if (!sourceWarehouseId) {
      errors.general = t('inventory.batches.cannotDetermineSourceWarehouse');
    } else if (sourceWarehouseId === targetWarehouseId) {
      errors.targetWarehouseId = t('inventory.batches.targetWarehouseMustBeDifferent');
    }
    
    if (!transferQuantity) {
      errors.transferQuantity = t('inventory.batches.enterQuantityToTransfer');
    } else {
      const qty = parseFloat(transferQuantity);
      if (isNaN(qty)) {
        errors.transferQuantity = t('inventory.batches.enterValidNumericValue');
      } else if (qty <= 0) {
        errors.transferQuantity = t('inventory.batches.quantityMustBeGreaterThanZero');
      } else if (qty > availableTransferQuantity) {
        errors.transferQuantity = `Maksymalna dostępna ilość z wybranego źródła: ${availableTransferQuantity.toFixed(3)} ${item?.unit || 'szt.'}`;
      }
    }
    
    setTransferErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleTransferBatch = async () => {
    if (!validateTransferForm()) return;
    
    try {
      setProcessingTransfer(true);
      
      // Partie zawsze mają warehouseId w nowym modelu danych
      const sourceWarehouseId = selectedBatch.warehouseId;
      
      if (!sourceWarehouseId) {
        throw new Error(t('inventory.batches.cannotDetermineSourceWarehouseError'));
      }
      
      // Używamy wielu źródeł danych użytkownika aby zapewnić, że zawsze mamy dostęp do poprawnych danych
      const effectiveUser = localUser || currentUser || auth.currentUser;
      
      // Przygotuj informacje o źródle transferu
      let sourceInfo = '';
      if (selectedTransferSource === 'free') {
        sourceInfo = 'z części wolnej';
      } else {
        const sourceReservation = batchReservations.find(res => res.id === selectedTransferSource);
        if (sourceReservation) {
          sourceInfo = `z rezerwacji MO: ${sourceReservation.moNumber || 'N/A'}`;
        }
      }

      const userData = {
        userId: effectiveUser?.uid || 'unknown',
        userName: effectiveUser?.displayName || effectiveUser?.email || 'Nieznany użytkownik',
        notes: `Przeniesienie partii ${selectedBatch.batchNumber || selectedBatch.lotNumber || 'bez numeru'} (${transferQuantity} ${item?.unit || 'szt.'} ${sourceInfo})`,
        transferSource: selectedTransferSource,
        transferSourceType: selectedTransferSource === 'free' ? 'free' : 'reservation'
      };
      
      const transferResult = await transferBatch(
        selectedBatch.id,
        sourceWarehouseId,
        targetWarehouseId,
        transferQuantity,
        userData
      );
      
      // Pokaż sukces z dodatkową informacją o rezerwacjach jeśli dostępna
      let successMessage = t('inventory.batches.batchTransferredSuccessfully');
      if (selectedTransferSource && selectedTransferSource !== 'free') {
        successMessage += ' Rezerwacje zostały automatycznie zaktualizowane.';
      } else if (batchReservations.length > 0) {
        successMessage += ' Rezerwacje pozostają w partii źródłowej.';
      }
      
      showSuccess(successMessage);
      closeTransferDialog();
      
      const batchesData = await getItemBatches(id);
      // Dodaj informacje o lokalizacji magazynu do każdej partii
      const enhancedBatches = batchesData.map(batch => {
        const warehouse = warehouses.find(w => w.id === batch.warehouseId);
        return {
          ...batch,
          warehouseName: warehouse?.name || 'Magazyn podstawowy',
          warehouseAddress: warehouse?.address || '',
        };
      });
      
      setBatches(enhancedBatches);
      setFilteredBatches(enhancedBatches);
    } catch (error) {
      console.error('Error transferring batch:', error);
      showError(error.message);
    } finally {
      setProcessingTransfer(false);
    }
  };

  const handleOpenItemLabelDialog = () => {
    setSelectedBatchForLabel(null);
    setLabelDialogOpen(true);
  };

  const handleOpenBatchLabelDialog = (batch) => {
    setSelectedBatchForLabel(batch);
    setLabelDialogOpen(true);
  };

  const handleCloseLabelDialog = () => {
    setLabelDialogOpen(false);
    setTimeout(() => {
      setSelectedBatchForLabel(null);
    }, 300);
  };

  const openDeleteDialog = (batch) => {
    // Używamy wielu źródeł danych użytkownika aby zapewnić, że zawsze mamy dostęp do poprawnych danych
    const effectiveUser = localUser || currentUser || auth.currentUser;
    
    setSelectedBatchForDelete(batch);
    setDeleteDialogOpen(true);
  };

  const closeDeleteDialog = () => {
    setDeleteDialogOpen(false);
    setSelectedBatchForDelete(null);
  };

  const handleOpenDetailsDialog = (batch) => {
    setSelectedBatchForDetails(batch);
    setDetailsDialogOpen(true);
  };

  const handleCloseDetailsDialog = () => {
    setDetailsDialogOpen(false);
    setSelectedBatchForDetails(null);
  };
  
  // Funkcje do obsługi certyfikatów
  const openCertificateDialog = (batch) => {
    setSelectedBatchForCertificate(batch);
    setCertificateDialogOpen(true);
  };
  
  const closeCertificateDialog = () => {
    setCertificateDialogOpen(false);
    setSelectedBatchForCertificate(null);
    setCertificateFile(null);
    setCertificatePreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const openPreviewDialog = (batch) => {
    setSelectedCertificateForPreview(batch);
    setPreviewDialogOpen(true);
  };
  
  const closePreviewDialog = () => {
    setPreviewDialogOpen(false);
    setSelectedCertificateForPreview(null);
  };
  
  const handleCertificateFileChange = (event) => {
    if (event.target.files && event.target.files.length > 0) {
      const file = event.target.files[0];
      setCertificateFile(file);
      
      // Tworzenie URL dla podglądu
      if (file.type === 'application/pdf' || 
          file.type.startsWith('image/') || 
          file.type === 'application/msword' || 
          file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const previewUrl = URL.createObjectURL(file);
        setCertificatePreviewUrl(previewUrl);
      } else {
        setCertificatePreviewUrl(null);
      }
    }
  };
  
  const handleUploadCertificate = async () => {
    if (!certificateFile || !selectedBatchForCertificate) {
      showError(t('inventory.batches.selectCertificateFile'));
      return;
    }
    
    try {
      setUploadingCertificate(true);
      // Używamy wielu źródeł danych użytkownika
      const effectiveUser = localUser || currentUser || auth.currentUser;
      // Sprawdź czy user istnieje i pobierz uid lub użyj 'unknown'
      const userId = effectiveUser?.uid || 'unknown';
      await uploadBatchCertificate(certificateFile, selectedBatchForCertificate.id, userId);
      showSuccess(t('inventory.batches.certificateAddedSuccessfully'));
      
      // Odśwież dane partii
      const refreshedBatches = await getItemBatches(id);
      const warehousesData = await getAllWarehouses();
      
      // Dodaj informacje o magazynie
      const enhancedBatches = refreshedBatches.map(batch => {
        const warehouse = warehousesData.find(w => w.id === batch.warehouseId);
        return {
          ...batch,
          warehouseName: warehouse?.name || 'Magazyn podstawowy',
          warehouseAddress: warehouse?.address || '',
        };
      });
      
      setBatches(enhancedBatches);
      setFilteredBatches(enhancedBatches);
      
      closeCertificateDialog();
    } catch (error) {
      console.error(t('inventory.batches.errorUploadingCertificate'), error);
      showError(error.message || t('inventory.batches.errorUploadingCertificateMessage'));
    } finally {
      setUploadingCertificate(false);
    }
  };
  
  const handleDeleteCertificate = async (batch) => {
    if (!window.confirm(t('inventory.batches.confirmDeleteCertificate'))) {
      return;
    }
    
    try {
      setUploadingCertificate(true);
      // Używamy wielu źródeł danych użytkownika
      const effectiveUser = localUser || currentUser || auth.currentUser;
      // Sprawdź czy user istnieje i pobierz uid lub użyj 'unknown'
      const userId = effectiveUser?.uid || 'unknown';
      await deleteBatchCertificate(batch.id, userId);
      showSuccess(t('inventory.batches.certificateDeletedSuccessfully'));
      
      // Odśwież dane partii
      const refreshedBatches = await getItemBatches(id);
      const warehousesData = await getAllWarehouses();
      
      // Dodaj informacje o magazynie
      const enhancedBatches = refreshedBatches.map(batch => {
        const warehouse = warehousesData.find(w => w.id === batch.warehouseId);
        return {
          ...batch,
          warehouseName: warehouse?.name || 'Magazyn podstawowy',
          warehouseAddress: warehouse?.address || '',
        };
      });
      
      setBatches(enhancedBatches);
      setFilteredBatches(enhancedBatches);
    } catch (error) {
      console.error(t('inventory.batches.errorDeletingCertificate'), error);
      showError(error.message || t('inventory.batches.errorDeletingCertificateMessage'));
    } finally {
      setUploadingCertificate(false);
    }
  };

  const handleArchiveBatch = async (batch) => {
    try {
      if (batch.archived) {
        await unarchiveBatch(batch.id);
        showSuccess(t('common:common.unarchiveSuccess'));
      } else {
        await archiveBatch(batch.id);
        showSuccess(t('common:common.archiveSuccess'));
      }
      const batchesData = await getItemBatches(id);
      const enhancedBatches = batchesData.map(b => {
        const warehouse = warehouses.find(w => w.id === b.warehouseId);
        return {
          ...b,
          warehouseName: warehouse?.name || 'Magazyn podstawowy',
          warehouseAddress: warehouse?.address || '',
        };
      });
      setBatches(enhancedBatches);
    } catch (error) {
      showError(error.message);
    }
  };

  const handleDeleteBatch = async () => {
    if (!selectedBatchForDelete) return;
    
    try {
      setProcessingDelete(true);
      
      // Używamy wielu źródeł danych użytkownika aby zapewnić, że zawsze mamy dostęp do poprawnych danych
      const effectiveUser = localUser || currentUser || auth.currentUser;
      
      // Dodaję userName do wywołania funkcji deleteBatch
      const userData = {
        userId: effectiveUser?.uid || 'unknown',
        userName: effectiveUser?.displayName || effectiveUser?.email || 'Nieznany użytkownik'
      };
      
      const result = await deleteBatch(selectedBatchForDelete.id, userData);
      
      if (result.success) {
        showSuccess(result.message || t('inventory.batches.batchDeleted'));
        
        // Odśwież listę partii po usunięciu
        const batchesData = await getItemBatches(id);
        // Dodaj informacje o lokalizacji magazynu do każdej partii
        const enhancedBatches = batchesData.map(batch => {
          const warehouse = warehouses.find(w => w.id === batch.warehouseId);
          return {
            ...batch,
            warehouseName: warehouse?.name || 'Magazyn podstawowy',
            warehouseAddress: warehouse?.address || '',
          };
        });
        
        setBatches(enhancedBatches);
        setFilteredBatches(enhancedBatches);
      } else {
        showError(result.message || t('inventory.batches.cannotDeleteBatch'));
      }
      
      closeDeleteDialog();
    } catch (error) {
      console.error('Error deleting batch:', error);
      showError(error.message || t('inventory.batches.errorDeletingBatch'));
    } finally {
      setProcessingDelete(false);
    }
  };

  if (loading) {
    return <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>{t('common.loading')}</Container>;
  }

  if (!item && batches.length === 0) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Typography variant="h5">{t('inventory.batches.itemNotFoundNorBatches')}</Typography>
        <Button 
          variant="contained" 
          component={Link} 
          to="/inventory"
          startIcon={<ArrowBackIcon />}
          sx={{ mt: 2 }}
        >
          {t('inventory.batches.backToInventory')}
        </Button>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 2 : 0 }}>
        <Button 
          startIcon={<ArrowBackIcon />} 
          onClick={() => navigate(`/inventory/${id}`)}
          variant="outlined"
          sx={{ alignSelf: isMobile ? 'stretch' : 'flex-start' }}
        >
          {t('inventory.batches.backToDetails')}
        </Button>
        <Typography variant="h5" align={isMobile ? "center" : "left"}>
          {item ? t('inventory.batches.batchesForItem', { itemName: item.name }) : t('inventory.batches.batchesProductUnavailable')}
        </Typography>
        <Box sx={{ 
          display: 'flex', 
          flexDirection: isMobile ? 'column' : 'row', 
          gap: isMobile ? 1 : 0,
          width: isMobile ? '100%' : 'auto'
        }}>
          {item && (
            <Button 
              variant="outlined"
              color="secondary" 
              startIcon={<QrCodeIcon />}
              onClick={handleOpenItemLabelDialog}
              sx={{ 
                mr: isMobile ? 0 : 2, 
                mb: isMobile ? 1 : 0,
                width: '100%'
              }}
            >
              {t('inventory.batches.printLabel')}
            </Button>
          )}
          {item && (
            <Button 
              variant="contained" 
              color="primary" 
              component={Link}
              to={`/inventory/${id}/receive`}
              sx={{ width: isMobile ? '100%' : 'auto' }}
            >
              {t('inventory.batches.receiveNewBatch')}
            </Button>
          )}
        </Box>
      </Box>

      {getExpiryWarning()}

      <Paper sx={{ mb: 3, p: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6} md={4}>
            <TextField
              fullWidth
              variant="outlined"
              placeholder={t('inventory.batches.searchBatches')}
              value={searchTerm}
              onChange={handleSearchChange}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
                endAdornment: searchTerm && (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={clearSearch}>
                      <ClearIcon />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={8}>
            <Box sx={{ 
              display: 'flex', 
              alignItems: isMobile ? 'flex-start' : 'center',
              flexDirection: isMobile ? 'column' : 'row',
              gap: isMobile ? 1 : 2,
              justifyContent: 'space-between'
            }}>
              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center',
                flexDirection: isMobile ? 'column' : 'row',
                gap: isMobile ? 1 : 2,
                flexWrap: 'wrap'
              }}>
                {item ? (
                  <Typography variant="body2" sx={{ mr: isMobile ? 0 : 0 }}>
                    <strong>{t('inventory.batches.totalStock')}:</strong> {formatQuantity(item.quantity)} {item.unit}
                  </Typography>
                ) : (
                  <Typography variant="body2" sx={{ mr: isMobile ? 0 : 0 }}>
                    <strong>{t('inventory.batches.totalStock')}:</strong> {formatQuantity(batches.reduce((sum, batch) => sum + parseFloat(batch.quantity || 0), 0))} {batches[0]?.unit || t('common.pieces')}
                  </Typography>
                )}

                
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={hideDepleted}
                      onChange={(e) => {
                        setHideDepleted(e.target.checked);
                        setPage(0); // Reset do pierwszej strony przy zmianie filtra
                      }}
                      size="small"
                    />
                  }
                  label={
                    <Typography variant="body2">
                      {t('inventory.batches.hideDepleted')}
                    </Typography>
                  }
                />

                <FormControlLabel
                  control={
                    <Checkbox
                      checked={showArchived}
                      onChange={(e) => {
                        setShowArchived(e.target.checked);
                        setPage(0);
                      }}
                      size="small"
                    />
                  }
                  label={
                    <Typography variant="body2">
                      {t('common:common.showArchived')}
                    </Typography>
                  }
                />
              </Box>
              <Tooltip title={t('inventory.batches.refreshData')}>
                <IconButton 
                  size="small" 
                  onClick={handleRefreshData}
                  disabled={refreshing}
                  color="primary"
                >
                  {refreshing ? (
                    <CircularProgress size={20} />
                  ) : (
                    <RefreshIcon />
                  )}
                </IconButton>
              </Tooltip>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      <Paper>
        <TableContainer>
          <Table sx={{ 
            '& .MuiTableCell-root': { 
              verticalAlign: 'top',
              py: 1.5
            }
          }}>
            <TableHead>
              <TableRow>
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'batchNumber'}
                    direction={orderBy === 'batchNumber' ? order : 'asc'}
                    onClick={() => handleRequestSort('batchNumber')}
                  >
                    {t('inventory.batches.batchNumber')}
                  </TableSortLabel>
                </TableCell>
                
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'expiryDate'}
                    direction={orderBy === 'expiryDate' ? order : 'asc'}
                    onClick={() => handleRequestSort('expiryDate')}
                  >
                    {t('inventory.batches.expiryDate')}
                  </TableSortLabel>
                </TableCell>
                
                {!isMobile && (
                  <TableCell>
                    <TableSortLabel
                      active={orderBy === 'warehouse'}
                      direction={orderBy === 'warehouse' ? order : 'asc'}
                      onClick={() => handleRequestSort('warehouse')}
                    >
                      {t('inventory.batches.warehouse')}
                    </TableSortLabel>
                  </TableCell>
                )}
                
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'quantity'}
                    direction={orderBy === 'quantity' ? order : 'asc'}
                    onClick={() => handleRequestSort('quantity')}
                  >
                    {t('inventory.batches.currentQuantity')}
                  </TableSortLabel>
                </TableCell>
                
                {!isMobile && (
                  <TableCell>
                    <TableSortLabel
                      active={orderBy === 'unitPrice'}
                      direction={orderBy === 'unitPrice' ? order : 'asc'}
                      onClick={() => handleRequestSort('unitPrice')}
                    >
                      {t('inventory.batches.unitPrice')}
                    </TableSortLabel>
                  </TableCell>
                )}
                
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'status'}
                    direction={orderBy === 'status' ? order : 'asc'}
                    onClick={() => handleRequestSort('status')}
                  >
                    {t('common.status')}
                  </TableSortLabel>
                </TableCell>
                
                {!isMobile && <TableCell>{t('inventory.batches.origin')}</TableCell>}
                {!isMobile && <TableCell>{t('inventory.batches.certificate')}</TableCell>}
                {!isMobile && <TableCell>{t('common.notes')}</TableCell>}
                <TableCell>{t('common.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredBatches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isMobile ? 5 : 10} align="center">
                    {t('inventory.batches.noBatchesForProduct')}
                  </TableCell>
                </TableRow>
              ) : (
                getSortedBatches(filteredBatches)
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((batch) => {
                    const status = getBatchStatus(batch);
                    return (
                      <TableRow 
                        key={batch.id}
                        sx={{
                          opacity: batch.archived ? 0.5 : 1,
                          ...(highlightedBatchId === batch.id ? {
                            backgroundColor: theme => theme.palette.mode === 'dark' 
                              ? 'rgba(33, 150, 243, 0.3)' 
                              : 'rgba(33, 150, 243, 0.15)',
                            transition: 'background-color 0.5s ease',
                            '& td': {
                              fontWeight: 500
                            }
                          } : {})
                        }}
                      >
                        <TableCell>
                          {batch.batchNumber || batch.lotNumber || 'Brak numeru'}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            // Jeśli brak daty ważności
                            if (!batch.expiryDate) {
                              return '—';
                            }
                            
                            // Upewnij się, że batch.expiryDate to obiekt Date
                            let expiryDate;
                            try {
                              expiryDate = batch.expiryDate instanceof Timestamp 
                                ? batch.expiryDate.toDate() 
                                : (batch.expiryDate instanceof Date 
                                  ? batch.expiryDate 
                                  : new Date(batch.expiryDate));
                            } catch (e) {
                              console.error("Błąd konwersji daty:", e);
                              return '—';
                            }
                            
                            // Sprawdź czy to domyślna/nieprawidłowa data (rok 1970 lub wcześniejszy)
                            if (!expiryDate || expiryDate.getFullYear() <= 1970) {
                              return '—';
                            }
                            
                            // Użyj formatDate tylko dla prawidłowych dat
                            try {
                              return formatDate(expiryDate);
                            } catch (e) {
                              console.error("Błąd formatowania daty:", e);
                              return '—';
                            }
                          })()}
                        </TableCell>
                        {!isMobile && (
                          <TableCell>
                            {batch.warehouseName || 'Magazyn podstawowy'}
                          </TableCell>
                        )}
                        <TableCell>
                          {batch.quantity} {item?.unit || batch.unit || t('common.pieces')}
                        </TableCell>
                        {!isMobile && (
                          <TableCell>
                            {(() => {
                              // Jeśli nie ma ceny, wyświetl "-"
                              if (!batch.unitPrice) return '-';
                              
                              // Podstawowy format ceny
                              let priceDisplay = `${parseFloat(batch.unitPrice).toFixed(4)} EUR`;
                              
                              // Jeśli mamy informacje o cenie bazowej i dodatkowym koszcie
                              if (batch.baseUnitPrice !== undefined && batch.additionalCostPerUnit !== undefined) {
                                const basePrice = parseFloat(batch.baseUnitPrice).toFixed(4);
                                const additionalCost = parseFloat(batch.additionalCostPerUnit).toFixed(4);
                                
                                // Wyświetl rozszerzone informacje o cenie
                                return (
                                  <Tooltip title={t('inventory.batches.basePriceTooltip', { basePrice, additionalCost })}>
                                    <Box>
                                      <Typography variant="body2">{priceDisplay}</Typography>
                                      <Typography variant="caption" color="text.secondary">
                                        ({t('inventory.batches.basePriceSummary', { basePrice, additionalCost })})
                                      </Typography>
                                    </Box>
                                  </Tooltip>
                                );
                              }
                              
                              return priceDisplay;
                            })()}
                          </TableCell>
                        )}
                        <TableCell>
                          <Chip 
                            label={status.label} 
                            color={status.color} 
                            size="small"
                            icon={status.color === 'error' || status.color === 'warning' ? <WarningIcon /> : null}
                          />
                        </TableCell>
                        {!isMobile && (
                          <TableCell sx={{ maxWidth: 200 }}>
                            {(() => {
                              // Sprawdź czy partia ma powiązanie z zamówieniem zakupowym (PO)
                              if (batch.purchaseOrderDetails && batch.purchaseOrderDetails.id) {
                                const po = batch.purchaseOrderDetails;
                                return (
                                  <Tooltip
                                    title={
                                      <Box>
                                        <Typography variant="body2">
                                          <strong>PO:</strong> {po.number || '-'}
                                        </Typography>
                                        {po.supplier && (
                                          <Typography variant="body2">
                                            <strong>{t('inventory.batches.supplier')}:</strong> {po.supplier.name || '-'}
                                          </Typography>
                                        )}
                                        {po.orderDate && (
                                          <Typography variant="body2">
                                            <strong>{t('inventory.batches.orderDate')}:</strong> {
                                              typeof po.orderDate === 'string' 
                                                ? new Date(po.orderDate).toLocaleDateString('pl-PL') 
                                                : po.orderDate instanceof Date 
                                                  ? po.orderDate.toLocaleDateString('pl-PL')
                                                  : po.orderDate && po.orderDate.toDate
                                                    ? po.orderDate.toDate().toLocaleDateString('pl-PL')
                                                    : '-'
                                            }
                                          </Typography>
                                        )}
                                        <Typography variant="caption" sx={{ mt: 0.5, display: 'block', fontStyle: 'italic' }}>
                                          Kliknij numer PO aby przejść do zamówienia
                                        </Typography>
                                      </Box>
                                    }
                                    arrow
                                  >
                                    <Box>
                                      <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
                                        Z zamówienia zakupu
                                      </Typography>
                                      <Link 
                                        to={`/purchase-orders/${po.id}`}
                                        style={{ textDecoration: 'none' }}
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <Typography variant="body2" color="primary" sx={{ 
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap',
                                          cursor: 'pointer',
                                          '&:hover': {
                                            textDecoration: 'underline'
                                          }
                                        }}>
                                          PO: {po.number || '-'}
                                        </Typography>
                                      </Link>
                                      {po.supplier && (
                                        <Typography variant="caption" color="text.secondary" sx={{ 
                                          display: 'block',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap'
                                        }}>
                                          {po.supplier.name}
                                        </Typography>
                                      )}
                                    </Box>
                                  </Tooltip>
                                );
                              }
                              
                              // Stara metoda - sprawdź czy partia pochodzi z zamówienia zakupu (PO)
                              else if (batch.source === 'purchase' || (batch.sourceDetails && batch.sourceDetails.sourceType === 'purchase')) {
                                let poNumber = batch.orderNumber || (batch.sourceDetails && batch.sourceDetails.orderNumber);
                                let supplierName = batch.sourceDetails && batch.sourceDetails.supplierName;
                                let poId = batch.sourceDetails && batch.sourceDetails.orderId;
                                
                                return (
                                  <Tooltip 
                                    title={
                                      <Box>
                                        {poNumber && (
                                          <Typography variant="body2">
                                            <strong>PO:</strong> {poNumber}
                                          </Typography>
                                        )}
                                        {supplierName && (
                                          <Typography variant="body2">
                                            <strong>Dostawca:</strong> {supplierName}
                                          </Typography>
                                        )}
                                        {poId && (
                                          <Typography variant="caption" sx={{ mt: 0.5, display: 'block', fontStyle: 'italic' }}>
                                            Kliknij numer PO aby przejść do zamówienia
                                          </Typography>
                                        )}
                                      </Box>
                                    }
                                    arrow
                                  >
                                    <Box>
                                      <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
                                        Z zamówienia zakupu
                                      </Typography>
                                      {poNumber && poId ? (
                                        <Link 
                                          to={`/purchase-orders/${poId}`}
                                          style={{ textDecoration: 'none' }}
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <Typography variant="body2" color="primary" sx={{ 
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                            cursor: 'pointer',
                                            '&:hover': {
                                              textDecoration: 'underline'
                                            }
                                          }}>
                                            PO: {poNumber}
                                          </Typography>
                                        </Link>
                                      ) : poNumber ? (
                                        <Typography variant="body2" color="primary" sx={{ 
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap'
                                        }}>
                                          PO: {poNumber}
                                        </Typography>
                                      ) : null}
                                      {supplierName && (
                                        <Typography variant="caption" color="text.secondary" sx={{ 
                                          display: 'block',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                          whiteSpace: 'nowrap'
                                        }}>
                                          {supplierName}
                                        </Typography>
                                      )}
                                    </Box>
                                  </Tooltip>
                                );
                              }
                              
                              // Produkcja - wyświetlanie informacji o MO i CO
                              else if (batch.source === 'Produkcja' || batch.source === 'production') {
                                let info = [];
                                if (batch.moNumber) info.push(`MO: ${batch.moNumber}`);
                                if (batch.orderNumber) info.push(`CO: ${batch.orderNumber}`);
                                
                                return (
                                  <Box>
                                    <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>
                                      Z produkcji
                                    </Typography>
                                    {info.length > 0 && (
                                      <Typography variant="caption" color="text.secondary" sx={{ 
                                        display: 'block',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                      }}>
                                        {info.join(' / ')}
                                      </Typography>
                                    )}
                                  </Box>
                                );
                              } else if (batch.source) {
                                return (
                                  <Typography variant="body2">
                                    {batch.source}
                                  </Typography>
                                );
                              }
                              
                              return '—';
                            })()}
                          </TableCell>
                        )}
                        {!isMobile && (
                          <TableCell>
                            {(batch.certificateBase64 || batch.certificateFileName || batch.certificateDownloadURL) ? (
                              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                <Tooltip title={t('inventory.batches.certificatePreview', { fileName: batch.certificateFileName || t('inventory.batches.document') })}>
                                  <Box 
                                    sx={{ 
                                      display: 'flex', 
                                      alignItems: 'center',
                                      cursor: 'pointer',
                                      '&:hover': {
                                        textDecoration: 'underline',
                                        color: 'primary.main'
                                      }
                                    }}
                                    onClick={() => openPreviewDialog(batch)}
                                  >
                                    <InsertDriveFileIcon color="primary" fontSize="small" sx={{ mr: 1 }} />
                                    <Typography variant="body2" noWrap sx={{ maxWidth: 120 }}>
                                      {batch.certificateFileName || t('inventory.batches.document')}
                                    </Typography>
                                  </Box>
                                </Tooltip>
                                <Tooltip title={t('inventory.batches.deleteCertificate')}>
                                  <IconButton 
                                    size="small" 
                                    color="error"
                                    onClick={() => handleDeleteCertificate(batch)}
                                  >
                                    <DeleteIcon />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            ) : (
                              <Tooltip title={t('inventory.batches.addCertificate')}>
                                <IconButton 
                                  size="small" 
                                  color="primary"
                                  onClick={() => openCertificateDialog(batch)}
                                >
                                  <FileUploadIcon />
                                </IconButton>
                              </Tooltip>
                            )}
                          </TableCell>
                        )}
                        {!isMobile && (
                          <TableCell>
                            {batch.notes || '—'}
                          </TableCell>
                        )}
                        <TableCell>
                          <Box sx={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 0.5 : 1 }}>
                            <Tooltip title={t('inventory.batches.batchDetails')}>
                              <IconButton
                                size="small"
                                onClick={() => handleOpenDetailsDialog(batch)}
                                color="info"
                              >
                                <InfoIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>

                            <Tooltip title={t('inventory.batches.printBatchLabel')}>
                              <IconButton
                                size="small"
                                onClick={() => handleOpenBatchLabelDialog(batch)}
                              >
                                <QrCodeIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            
                            {warehouses.filter(wh => wh.id !== batch.warehouseId).length > 0 && (
                              <Tooltip title={t('inventory.batches.transferBatch')}>
                                <IconButton
                                  size="small"
                                  onClick={() => openTransferDialog(batch)}
                                  color="primary"
                                >
                                  <SwapHorizIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            
                            <Tooltip title={t('common.edit')}>
                              <IconButton
                                size="small"
                                component={Link}
                                to={`/inventory/batch/${batch.id}`}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            
                            <Tooltip title={batch.archived ? t('common:common.unarchive') : t('common:common.archive')}>
                              <IconButton
                                size="small"
                                onClick={() => handleArchiveBatch(batch)}
                                disabled={!batch.archived && (batch.quantity || 0) !== 0}
                              >
                                {batch.archived ? <UnarchiveIcon fontSize="small" /> : <ArchiveIcon fontSize="small" />}
                              </IconButton>
                            </Tooltip>

                            <Tooltip title={t('common.delete')}>
                              <IconButton
                                size="small"
                                onClick={() => openDeleteDialog(batch)}
                                color="error"
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={isMobile ? [5, 10] : [5, 10, 25, 50]}
          component="div"
          count={filteredBatches.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          labelRowsPerPage={isMobile ? t('common.rows') + ":" : t('common.rowsPerPage') + ":"}
          labelDisplayedRows={({ from, to, count }) => t('common.displayedRows', { from, to, count })}
          sx={isMobile ? {
            '.MuiTablePagination-selectLabel': { display: 'none' },
            '.MuiTablePagination-select': { marginRight: '8px' },
            '.MuiTablePagination-actions': { marginLeft: '8px' },
            '.MuiTablePagination-displayedRows': { fontSize: '0.8rem' }
          } : {}}
        />
      </Paper>

      <Dialog open={transferDialogOpen} onClose={closeTransferDialog} maxWidth="lg" fullWidth>
        <DialogTitle>
          {t('inventory.batches.transferBatchToWarehouse')}
        </DialogTitle>
        <DialogContent sx={{ px: 3, py: 2 }}>
          {selectedBatch && (
            <Box sx={{ pt: 1 }}>
              <Typography variant="subtitle1" gutterBottom>
                {t('inventory.batches.batchInfo')}:
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>{t('inventory.batches.batchNumber')}:</strong> {selectedBatch.batchNumber || selectedBatch.lotNumber || '-'}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>{t('inventory.batches.currentWarehouse')}:</strong> {selectedBatch.warehouseAddress || selectedBatch.warehouseName || t('inventory.batches.defaultWarehouse')}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>{t('inventory.batches.availableQuantity')}:</strong> {selectedBatch.quantity} {item?.unit || selectedBatch.unit || t('common.pieces')}
                {batchReservations.length > 0 && (
                  <Box component="span" sx={{ ml: 1, color: 'warning.main', fontSize: '0.9em' }}>
                    ({(() => {
                      const totalReserved = batchReservations.reduce((sum, res) => sum + (parseFloat(res.quantity) || 0), 0);
                      const availableForTransfer = selectedBatch.quantity - totalReserved;
                      return `dostępne do przeniesienia: ${availableForTransfer.toFixed(3)} ${item?.unit || 'szt.'}`;
                    })()})
                  </Box>
                )}
              </Typography>
              
              {/* Dodaj informacje o cenie jednostkowej z rozbiciem na bazową i dodatkowe koszty */}
              {selectedBatch.unitPrice > 0 && (
                <Typography variant="body2" gutterBottom>
                  <strong>{t('inventory.batches.unitPrice')}:</strong> {parseFloat(selectedBatch.unitPrice).toFixed(4)} EUR
                  {selectedBatch.baseUnitPrice !== undefined && selectedBatch.additionalCostPerUnit !== undefined && (
                    <Box component="span" sx={{ color: 'text.secondary', fontSize: '0.9em' }}>
                      {` (baza: ${parseFloat(selectedBatch.baseUnitPrice).toFixed(4)} EUR + dodatkowy koszt: ${parseFloat(selectedBatch.additionalCostPerUnit).toFixed(4)} EUR)`}
                    </Box>
                  )}
                </Typography>
              )}
              
              {/* Dodaj informacje o pochodzeniu partii, jeśli są dostępne */}
              {(selectedBatch.purchaseOrderDetails || selectedBatch.moNumber || selectedBatch.orderNumber || selectedBatch.source) && (
                <>
                  <Typography variant="subtitle2" sx={{ mt: 1 }}>
                    {t('inventory.batches.originInfo')}:
                  </Typography>
                  
                  {/* Szczegóły PO - najpierw sprawdź nowy format danych */}
                  {selectedBatch.purchaseOrderDetails && selectedBatch.purchaseOrderDetails.id && (
                    <Box sx={{ mt: 1, p: 1, bgcolor: 'background.paper', borderRadius: 1, border: 1, borderColor: 'divider' }}>
                      <Typography variant="body2" gutterBottom>
                        <strong>{t('inventory.batches.purchaseOrder')}:</strong> {selectedBatch.purchaseOrderDetails.number || '-'}
                      </Typography>
                      {selectedBatch.purchaseOrderDetails.supplier && (
                        <Typography variant="body2" gutterBottom>
                          <strong>{t('inventory.batches.supplier')}:</strong> {selectedBatch.purchaseOrderDetails.supplier.name || '-'}
                        </Typography>
                      )}
                      {selectedBatch.purchaseOrderDetails.orderDate && (
                        <Typography variant="body2" gutterBottom>
                          <strong>{t('inventory.batches.orderDate')}:</strong> {typeof selectedBatch.purchaseOrderDetails.orderDate === 'string' 
                            ? new Date(selectedBatch.purchaseOrderDetails.orderDate).toLocaleDateString('pl-PL') 
                            : selectedBatch.purchaseOrderDetails.orderDate instanceof Date 
                              ? selectedBatch.purchaseOrderDetails.orderDate.toLocaleDateString('pl-PL')
                              : selectedBatch.purchaseOrderDetails.orderDate && selectedBatch.purchaseOrderDetails.orderDate.toDate
                                ? selectedBatch.purchaseOrderDetails.orderDate.toDate().toLocaleDateString('pl-PL')
                                : '-'}
                        </Typography>
                      )}
                      {selectedBatch.purchaseOrderDetails.id && (
                        <Button 
                          size="small" 
                          variant="outlined" 
                          color="primary"
                          component={Link}
                          to={`/purchase-orders/${selectedBatch.purchaseOrderDetails.id}`}
                          sx={{ mt: 1 }}
                          onClick={closeTransferDialog}
                        >
                          Zobacz szczegóły PO
                        </Button>
                      )}
                    </Box>
                  )}
                  
                  {/* Sprawdź starszy format danych */}
                  {!selectedBatch.purchaseOrderDetails && selectedBatch.sourceDetails && selectedBatch.sourceDetails.sourceType === 'purchase' && (
                    <Box sx={{ mt: 1, p: 1, bgcolor: 'background.paper', borderRadius: 1, border: 1, borderColor: 'divider' }}>
                      <Typography variant="body2" gutterBottom>
                        <strong>Zamówienie zakupu:</strong> {selectedBatch.sourceDetails.orderNumber || '-'}
                      </Typography>
                      {selectedBatch.sourceDetails.supplierName && (
                        <Typography variant="body2" gutterBottom>
                          <strong>Dostawca:</strong> {selectedBatch.sourceDetails.supplierName || '-'}
                        </Typography>
                      )}
                      {selectedBatch.sourceDetails.orderId && (
                        <Button 
                          size="small" 
                          variant="outlined" 
                          color="primary"
                          component={Link}
                          to={`/purchase-orders/${selectedBatch.sourceDetails.orderId}`}
                          sx={{ mt: 1 }}
                          onClick={closeTransferDialog}
                        >
                          Zobacz szczegóły PO
                        </Button>
                      )}
                    </Box>
                  )}
                  
                  {/* Wyświetl informacje o pochodzeniu z produkcji tylko jeśli nie ma danych o PO */}
                  {!selectedBatch.purchaseOrderDetails && 
                  !(selectedBatch.sourceDetails && selectedBatch.sourceDetails.sourceType === 'purchase') && (
                    <>
                      {selectedBatch.source && (
                        <Typography variant="body2" gutterBottom>
                          <strong>{t('inventory.batches.source')}:</strong> {selectedBatch.source === 'production' ? t('inventory.batches.fromProduction') : selectedBatch.source}
                        </Typography>
                      )}
                      
                      {selectedBatch.moNumber && (
                        <Typography variant="body2" gutterBottom>
                          <strong>{t('inventory.batches.moNumber')}:</strong> {selectedBatch.moNumber}
                        </Typography>
                      )}
                      
                      {selectedBatch.orderNumber && (
                        <Typography variant="body2" gutterBottom>
                          <strong>{t('inventory.batches.coNumber')}:</strong> {selectedBatch.orderNumber}
                        </Typography>
                      )}
                    </>
                  )}
                </>
              )}
              
              {/* Wizualizacja partii z podziałem na rezerwacje i część wolną */}
              <Box sx={{ my: 3 }}>
                <BatchVisualization 
                  batch={selectedBatch}
                  reservations={batchReservations}
                  unit={item?.unit || selectedBatch.unit || 'szt.'}
                  height={100}
                  showLabels={true}
                  selectedSource={selectedTransferSource}
                  onSourceSelect={handleTransferSourceChange}
                />
              </Box>
              

              
              <Box sx={{ mt: 3, mb: 2 }}>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <FormControl fullWidth error={!!transferErrors.transferSource}>
                      <InputLabel>{t('inventory.batches.transferSource')}</InputLabel>
                      <Select
                        value={selectedTransferSource}
                        onChange={(e) => handleTransferSourceChange(e.target.value)}
                        label={t('inventory.batches.transferSource')}
                      >
                        {/* Opcja dla części wolnej */}
                        {(() => {
                          const totalReserved = batchReservations.reduce((sum, res) => sum + (parseFloat(res.quantity) || 0), 0);
                          const freeQuantity = Math.max(0, selectedBatch.quantity - totalReserved);
                          if (freeQuantity > 0) {
                            return (
                              <MenuItem value="free">
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <Box sx={{ width: 12, height: 12, backgroundColor: '#4caf50', borderRadius: 0.5 }} />
                                  <Typography>
                                    Część wolna ({freeQuantity.toFixed(3)} {item?.unit || 'szt.'})
                                  </Typography>
                                </Box>
                              </MenuItem>
                            );
                          }
                          return null;
                        })()}
                        
                        {/* Opcje dla rezerwacji MO */}
                        {batchReservations.map((reservation, index) => {
                          const moColors = [
                            '#ff9800', '#e91e63', '#9c27b0', '#3f51b5', '#2196f3', '#00bcd4',
                            '#009688', '#8bc34a', '#ffeb3b', '#ff5722', '#795548', '#607d8b'
                          ];
                          const color = moColors[index % moColors.length];
                          
                          return (
                            <MenuItem key={reservation.id} value={reservation.id}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Box sx={{ width: 12, height: 12, backgroundColor: color, borderRadius: 0.5 }} />
                                <Typography>
                                  {reservation.moNumber || `MO ${index + 1}`} ({parseFloat(reservation.quantity || 0).toFixed(3)} {item?.unit || 'szt.'})
                                </Typography>
                                {reservation.taskDetails?.customerName && (
                                  <Typography variant="caption" color="text.secondary">
                                    - {reservation.taskDetails.customerName}
                                  </Typography>
                                )}
                              </Box>
                            </MenuItem>
                          );
                        })}
                      </Select>
                      {transferErrors.transferSource && (
                        <FormHelperText>{transferErrors.transferSource}</FormHelperText>
                      )}
                    </FormControl>
                  </Grid>
                  <Grid item xs={12}>
                    <FormControl fullWidth error={!!transferErrors.targetWarehouseId}>
                      <InputLabel>{t('inventory.batches.targetWarehouse')}</InputLabel>
                      <Select
                        value={targetWarehouseId}
                        onChange={(e) => setTargetWarehouseId(e.target.value)}
                        label={t('inventory.batches.targetWarehouse')}
                      >
                        {warehouses
                          .filter(wh => wh.id !== selectedBatch.warehouseId)
                          .map(warehouse => (
                            <MenuItem key={warehouse.id} value={warehouse.id}>
                              {warehouse.name}
                            </MenuItem>
                          ))
                        }
                      </Select>
                      {transferErrors.targetWarehouseId && (
                        <FormHelperText>{transferErrors.targetWarehouseId}</FormHelperText>
                      )}
                    </FormControl>
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label={`Ilość do przeniesienia${selectedTransferSource ? ` (dostępne: ${availableTransferQuantity.toFixed(3)} ${item?.unit || 'szt.'})` : ''}`}
                      type="number"
                      value={transferQuantity}
                      onChange={(e) => {
                        const value = parseFloat(e.target.value);
                        // Walidacja bezpośrednio przy zmianie wartości
                        if (!isNaN(value)) {
                          // Ograniczamy wartość do przedziału (0, availableTransferQuantity]
                          const validatedValue = Math.min(Math.max(0, value), availableTransferQuantity);
                          setTransferQuantity(validatedValue.toString());
                        } else {
                          setTransferQuantity(e.target.value);
                        }
                      }}
                      inputProps={{ 
                        min: 0.00001, 
                        max: availableTransferQuantity, 
                        step: 'any' 
                      }}
                      error={!!transferErrors.transferQuantity}
                      helperText={transferErrors.transferQuantity || (selectedTransferSource ? `Maksymalna dostępna ilość: ${availableTransferQuantity.toFixed(3)} ${item?.unit || 'szt.'}` : 'Najpierw wybierz źródło transferu')}
                      disabled={!selectedTransferSource}
                    />
                  </Grid>
                </Grid>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeTransferDialog} disabled={processingTransfer}>
            {t('common.cancel')}
          </Button>
          <Button 
            variant="contained" 
            color="primary" 
            onClick={handleTransferBatch}
            disabled={processingTransfer}
          >
            {processingTransfer ? t('inventory.batches.processing') : t('inventory.batches.transferBatch')}
          </Button>
        </DialogActions>
      </Dialog>

      <LabelDialog
        open={labelDialogOpen}
        onClose={handleCloseLabelDialog}
        item={item}
        batches={selectedBatchForLabel ? [selectedBatchForLabel] : batches}
      />

      <Dialog
        open={deleteDialogOpen}
        onClose={closeDeleteDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {t('inventory.batches.confirmDeleteBatch')}
        </DialogTitle>
        <DialogContent>
          {selectedBatchForDelete && (
            <Box sx={{ pt: 1 }}>
              <Typography variant="body1" color="error" gutterBottom>
                {t('inventory.batches.deleteWarning')}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>{t('inventory.batches.batchNumber')}:</strong> {selectedBatchForDelete.batchNumber || selectedBatchForDelete.lotNumber || '-'}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>{t('inventory.batches.quantity')}:</strong> {selectedBatchForDelete.quantity} {item?.unit || t('common.pieces')}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>{t('inventory.batches.warehouse')}:</strong> {selectedBatchForDelete.warehouseAddress || selectedBatchForDelete.warehouseName || t('inventory.batches.defaultWarehouse')}
              </Typography>
              
              {/* Dodatkowe informacje jeśli partia pochodzi z PO */}
              {selectedBatchForDelete.purchaseOrderDetails && selectedBatchForDelete.purchaseOrderDetails.id && (
                <Box sx={{ mt: 2, p: 1, bgcolor: 'warning.light', color: 'warning.contrastText', borderRadius: 1, border: 1, borderColor: 'warning.main' }}>
                  <Typography variant="subtitle2" gutterBottom>
                    {t('inventory.batches.batchLinkedToPO')}:
                  </Typography>
                  <Typography variant="body2">
                    PO: {selectedBatchForDelete.purchaseOrderDetails.number || '-'}
                  </Typography>
                  {selectedBatchForDelete.purchaseOrderDetails.supplier && (
                    <Typography variant="body2">
                      {t('inventory.batches.supplier')}: {selectedBatchForDelete.purchaseOrderDetails.supplier.name || '-'}
                    </Typography>
                  )}
                  <Button 
                    size="small" 
                    variant="outlined" 
                    color="primary"
                    component={Link}
                    to={`/purchase-orders/${selectedBatchForDelete.purchaseOrderDetails.id}`}
                    sx={{ mt: 1 }}
                    onClick={closeDeleteDialog}
                  >
                    {t('inventory.batches.viewPoDetails')}
                  </Button>
                </Box>
              )}
              
              {/* Dodatkowe informacje dla starszego formatu danych */}
              {!selectedBatchForDelete.purchaseOrderDetails && selectedBatchForDelete.sourceDetails && 
                selectedBatchForDelete.sourceDetails.sourceType === 'purchase' && selectedBatchForDelete.sourceDetails.orderId && (
                <Box sx={{ mt: 2, p: 1, bgcolor: 'background.paper', borderRadius: 1, border: 1, borderColor: 'divider' }}>
                  <Typography variant="subtitle2" gutterBottom>
                    {t('inventory.batches.batchLinkedToPO')}:
                  </Typography>
                  <Typography variant="body2">
                    PO: {selectedBatchForDelete.sourceDetails.orderNumber || '-'}
                  </Typography>
                  {selectedBatchForDelete.sourceDetails.supplierName && (
                    <Typography variant="body2">
                      {t('inventory.batches.supplier')}: {selectedBatchForDelete.sourceDetails.supplierName || '-'}
                    </Typography>
                  )}
                  <Button 
                    size="small" 
                    variant="outlined" 
                    color="primary"
                    component={Link}
                    to={`/purchase-orders/${selectedBatchForDelete.sourceDetails.orderId}`}
                    sx={{ mt: 1 }}
                    onClick={closeDeleteDialog}
                  >
                    {t('inventory.batches.viewPoDetails')}
                  </Button>
                </Box>
              )}
              
              <Typography variant="body2" sx={{ mt: 2, fontWeight: 'medium' }}>
                {t('inventory.batches.deletionConsequences')}:
              </Typography>
              <ul>
                <li>
                  <Typography variant="body2">
                    {t('inventory.batches.decreaseTotalQuantity')}
                  </Typography>
                </li>
                <li>
                  <Typography variant="body2">
                    {t('inventory.batches.transactionHistoryKept')}
                  </Typography>
                </li>
                <li>
                  <Typography variant="body2">
                    {t('inventory.batches.lossOfLinksToOrders')}
                  </Typography>
                </li>
              </ul>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDeleteDialog} disabled={processingDelete}>
            {t('common.cancel')}
          </Button>
          <Button 
            variant="contained" 
            color="error" 
            onClick={handleDeleteBatch}
            disabled={processingDelete}
          >
            {processingDelete ? t('inventory.batches.deleting') : t('inventory.batches.deleteBatch')}
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog do zarządzania certyfikatem partii */}
      <Dialog open={certificateDialogOpen} onClose={closeCertificateDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {t('inventory.batches.addCertificateToBatch')}
        </DialogTitle>
        <DialogContent>
          {selectedBatchForCertificate && (
            <Box sx={{ pt: 1 }}>
              <Typography variant="subtitle1" gutterBottom>
                {t('inventory.batches.batchInfo')}:
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>{t('inventory.batches.batchNumber')}:</strong> {selectedBatchForCertificate.batchNumber || selectedBatchForCertificate.lotNumber || '-'}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>{t('inventory.batches.warehouse')}:</strong> {selectedBatchForCertificate.warehouseName || t('inventory.batches.defaultWarehouse')}
              </Typography>
              
              <Box sx={{ mt: 3 }}>
                <input
                  accept="application/pdf,image/*,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  style={{ display: 'none' }}
                  id="certificate-file-upload"
                  type="file"
                  onChange={handleCertificateFileChange}
                  ref={fileInputRef}
                />
                <label htmlFor="certificate-file-upload">
                  <Button
                    variant="outlined"
                    component="span"
                    startIcon={<FileUploadIcon />}
                    fullWidth
                    sx={{ mb: 2 }}
                  >
                    {t('inventory.batches.selectCertificateFile')}
                  </Button>
                </label>
                
                {certificateFile && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" gutterBottom>
                      {t('inventory.batches.selectedFile')}: {certificateFile.name}
                    </Typography>
                    
                    {certificatePreviewUrl && (
                      <Box sx={{ mt: 2, border: '1px solid #e0e0e0', borderRadius: 1, p: 2 }}>
                        <Typography variant="subtitle2" gutterBottom>
                          {t('inventory.batches.documentPreview')}:
                        </Typography>
                        
                        {certificateFile.type.startsWith('image/') ? (
                          <Box sx={{ mt: 1, textAlign: 'center' }}>
                            <img 
                              src={certificatePreviewUrl} 
                              alt={t('inventory.batches.certificatePreviewAlt')} 
                              style={{ maxWidth: '100%', maxHeight: '300px', objectFit: 'contain' }} 
                            />
                          </Box>
                        ) : certificateFile.type === 'application/pdf' ? (
                          <Box sx={{ mt: 1, textAlign: 'center', height: '300px' }}>
                            <iframe 
                              src={certificatePreviewUrl} 
                              title={t('inventory.batches.pdfPreview')} 
                              width="100%" 
                              height="100%" 
                              style={{ border: 'none' }}
                            />
                          </Box>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            {t('inventory.batches.previewNotAvailable')}
                          </Typography>
                        )}
                      </Box>
                    )}
                  </Box>
                )}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={closeCertificateDialog} 
            color="inherit"
            disabled={uploadingCertificate}
          >
            {t('common.cancel')}
          </Button>
          <Button 
            onClick={handleUploadCertificate} 
            color="primary" 
            variant="contained"
            disabled={!certificateFile || uploadingCertificate}
            startIcon={uploadingCertificate ? <CircularProgress size={20} /> : null}
          >
            {uploadingCertificate ? t('inventory.batches.uploading') : t('inventory.batches.uploadCertificate')}
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog podglądu certyfikatu */}
      <Dialog 
        open={previewDialogOpen} 
        onClose={closePreviewDialog} 
        maxWidth="md" 
        fullWidth
      >
        <DialogTitle>
          {t('inventory.batches.certificatePreviewTitle')}
        </DialogTitle>
        <DialogContent>
          {selectedCertificateForPreview && (
            <Box sx={{ pt: 1 }}>
              <Typography variant="subtitle1" gutterBottom>
                {t('inventory.batches.certificateInfo')}:
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>{t('inventory.batches.fileName')}:</strong> {selectedCertificateForPreview.certificateFileName || t('inventory.batches.document')}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>{t('inventory.batches.batchNumber')}:</strong> {selectedCertificateForPreview.batchNumber || selectedCertificateForPreview.lotNumber || "—"}
              </Typography>
              {selectedCertificateForPreview.certificateUploadedAt && (
                <Typography variant="body2" gutterBottom>
                  <strong>{t('inventory.batches.addedDate')}:</strong> {
                    selectedCertificateForPreview.certificateUploadedAt.toDate 
                      ? formatDate(selectedCertificateForPreview.certificateUploadedAt.toDate()) 
                      : formatDate(new Date(selectedCertificateForPreview.certificateUploadedAt))
                  }
                </Typography>
              )}
              
              <Box sx={{ mt: 3, p: 2, borderRadius: 1, minHeight: '300px' }}>
                {selectedCertificateForPreview.certificateBase64 ? (
                  selectedCertificateForPreview.certificateContentType && selectedCertificateForPreview.certificateContentType.startsWith('image/') ? (
                    // Podgląd obrazu
                    <Box sx={{ textAlign: 'center' }}>
                      <img 
                        src={selectedCertificateForPreview.certificateBase64} 
                        alt={t('inventory.batches.certificatePreviewAlt')} 
                        style={{ maxWidth: '100%', maxHeight: '500px', objectFit: 'contain' }} 
                      />
                    </Box>
                  ) : selectedCertificateForPreview.certificateContentType === 'application/pdf' ? (
                    // Podgląd PDF
                    <Box sx={{ height: '500px', border: '1px solid #e0e0e0' }}>
                      <iframe 
                        src={selectedCertificateForPreview.certificateBase64} 
                        title={t('inventory.batches.pdfPreview')} 
                        width="100%" 
                        height="100%" 
                        style={{ border: 'none' }}
                      />
                    </Box>
                  ) : (
                    // Inne typy plików - informacja o nieobsługiwanym formacie
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary" paragraph>
                        {t('inventory.batches.previewNotAvailableDocument')}
                      </Typography>
                      <a 
                        href={selectedCertificateForPreview.certificateBase64} 
                        download={selectedCertificateForPreview.certificateFileName}
                        style={{ textDecoration: 'none' }}
                      >
                        <Button
                          variant="contained"
                          color="primary"
                          startIcon={<InsertDriveFileIcon />}
                          sx={{ mt: 1 }}
                        >
                          {t('inventory.batches.downloadCertificate')}
                        </Button>
                      </a>
                    </Box>
                  )
                ) : selectedCertificateForPreview.certificateDownloadURL ? (
                  selectedCertificateForPreview.certificateContentType && selectedCertificateForPreview.certificateContentType.startsWith('image/') ? (
                    // Podgląd obrazu z URL
                    <Box sx={{ textAlign: 'center' }}>
                      <img 
                        src={selectedCertificateForPreview.certificateDownloadURL} 
                        alt={t('inventory.batches.certificatePreviewAlt')} 
                        style={{ maxWidth: '100%', maxHeight: '500px', objectFit: 'contain' }} 
                      />
                    </Box>
                  ) : selectedCertificateForPreview.certificateContentType === 'application/pdf' ? (
                    // Podgląd PDF z URL
                    <Box sx={{ height: '500px', border: '1px solid #e0e0e0' }}>
                      <iframe 
                        src={selectedCertificateForPreview.certificateDownloadURL} 
                        title={t('inventory.batches.pdfPreview')} 
                        width="100%" 
                        height="100%" 
                        style={{ border: 'none' }}
                      />
                    </Box>
                  ) : (
                    // Inne typy plików - przycisk do pobrania
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="body2" color="text.secondary" paragraph>
                        {t('inventory.batches.previewNotAvailableDocument')}
                      </Typography>
                      <a 
                        href={selectedCertificateForPreview.certificateDownloadURL} 
                        download={selectedCertificateForPreview.certificateFileName}
                        style={{ textDecoration: 'none' }}
                      >
                        <Button
                          variant="contained"
                          color="primary"
                          startIcon={<InsertDriveFileIcon />}
                          sx={{ mt: 1 }}
                        >
                          {t('inventory.batches.downloadCertificate')}
                        </Button>
                      </a>
                    </Box>
                  )
                ) : (
                  // Brak danych certyfikatu
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="body2" color="error">
                      {t('inventory.batches.cannotDisplayCertificate')}
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closePreviewDialog}>
            {t('common.close')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog szczegółów partii */}
      <BatchDetailsDialog
        open={detailsDialogOpen}
        onClose={handleCloseDetailsDialog}
        batch={selectedBatchForDetails}
      />
    </Container>
  );
};

export default BatchesPage; 