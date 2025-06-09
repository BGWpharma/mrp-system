import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Typography,
  Paper,
  Grid,
  Chip,
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  CircularProgress,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  FormLabel,
  RadioGroup,
  Radio,
  Alert,
  Tooltip,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemButton,
  Card,
  CardContent,
  CardActions,
  Collapse,
  Tabs,
  Tab,
  Stack,
  Avatar,
  Container,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  AlertTitle,
  InputAdornment,
  useMediaQuery,
  useTheme,
  Switch
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Inventory as InventoryIcon,
  PlayArrow as PlayArrowIcon,
  Stop as StopIcon,
  Print as PrintIcon,
  Business as BusinessIcon,
  Schedule as ScheduleIcon,
  History as HistoryIcon,
  Add as AddIcon,
  ArrowBack as ArrowBackIcon,
  Settings as SettingsIcon,
  Check as CheckIcon,
  Inventory2 as PackagingIcon,
  BookmarkAdd as BookmarkAddIcon,
  ExpandMore as ExpandMoreIcon,
  Search as SearchIcon,
  Visibility as VisibilityIcon,
  Info as InfoIcon,
  Science as RawMaterialsIcon,
  BuildCircle as BuildCircleIcon,
  Assessment as AssessmentIcon,
  AttachFile as AttachFileIcon,
  CloudUpload as CloudUploadIcon,
  Description as DescriptionIcon,
  Image as ImageIcon,
  PictureAsPdf as PdfIcon,
  Download as DownloadIcon
} from '@mui/icons-material';
import { getTaskById, updateTaskStatus, deleteTask, updateActualMaterialUsage, confirmMaterialConsumption, addTaskProductToInventory, startProduction, stopProduction, getProductionHistory, reserveMaterialsForTask, generateMaterialsAndLotsReport, updateProductionSession, addProductionSession, deleteProductionSession } from '../../services/productionService';
import { getRecipeVersion } from '../../services/recipeService';
import { getItemBatches, bookInventoryForTask, cancelBooking, getBatchReservations, getAllInventoryItems, getInventoryItemById, getInventoryBatch } from '../../services/inventoryService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { formatDate, formatCurrency, formatDateTime } from '../../utils/formatters';
import { PRODUCTION_TASK_STATUSES, TIME_INTERVALS } from '../../utils/constants';
import { format, parseISO } from 'date-fns';
import TaskDetails from '../../components/production/TaskDetails';
import { db } from '../../services/firebase/config';
import { getDoc, doc, updateDoc, serverTimestamp, arrayUnion, collection, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../../services/firebase/config';
import { getUsersDisplayNames } from '../../services/userService';

const TaskDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showSuccess, showError, showInfo } = useNotification();
  const { currentUser } = useAuth();
  
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState({ open: false, severity: 'success', message: '' });
  const [consumptionDialogOpen, setConsumptionDialogOpen] = useState(false);
  const [confirmationDialogOpen, setConfirmationDialogOpen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [materials, setMaterials] = useState([]);
  const [batches, setBatches] = useState({});
  const [stopProductionDialogOpen, setStopProductionDialogOpen] = useState(false);
  const [productionData, setProductionData] = useState({
    completedQuantity: '',
    timeSpent: '',
    startTime: new Date(),
    endTime: new Date(),
    error: null
  });
  const [materialQuantities, setMaterialQuantities] = useState({});
  const [selectedBatches, setSelectedBatches] = useState({});
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [errors, setErrors] = useState({});
  const [reserveDialogOpen, setReserveDialogOpen] = useState(false);
  const [reservationMethod, setReservationMethod] = useState('automatic');
  const [manualBatchQuantities, setManualBatchQuantities] = useState({});
  const [reservationErrors, setReservationErrors] = useState({});
  const [packagingDialogOpen, setPackagingDialogOpen] = useState(false);
  const [packagingItems, setPackagingItems] = useState([]);
  const [loadingPackaging, setLoadingPackaging] = useState(false);
  const [selectedPackaging, setSelectedPackaging] = useState({});
  const [packagingQuantities, setPackagingQuantities] = useState({});
  const [searchPackaging, setSearchPackaging] = useState('');
  const [userNames, setUserNames] = useState({});
  const [productionHistory, setProductionHistory] = useState([]);
  const [editingHistoryItem, setEditingHistoryItem] = useState(null);
  const [editedHistoryItem, setEditedHistoryItem] = useState({
    quantity: 0,
    startTime: new Date(),
    endTime: new Date(),
  });
  const [addHistoryDialogOpen, setAddHistoryDialogOpen] = useState(false);
  const [reservingMaterials, setReservingMaterials] = useState(false);

  const [materialBatchesLoading, setMaterialBatchesLoading] = useState(false);
  const [manualBatchSelectionActive, setManualBatchSelectionActive] = useState(false);
  const [expandedMaterial, setExpandedMaterial] = useState(null);
  const [deleteHistoryItem, setDeleteHistoryItem] = useState(null);
  const [deleteHistoryDialogOpen, setDeleteHistoryDialogOpen] = useState(false);
  const [includeInCosts, setIncludeInCosts] = useState({});

  // Stan dla przechowywania oczekiwanych zamówień
  const [awaitingOrders, setAwaitingOrders] = useState({});
  const [awaitingOrdersLoading, setAwaitingOrdersLoading] = useState(false);
  
  // Stan edycji pozycji historii
  const [editedHistoryNote, setEditedHistoryNote] = useState('');
  const [editedHistoryQuantity, setEditedHistoryQuantity] = useState('');
  
  // Stan do zarządzania usuwaniem pozycji historii
  const [historyItemToDelete, setHistoryItemToDelete] = useState(null);
  
  // Stan komunikatu błędu
  const [errorMessage, setErrorMessage] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Dodaję brakującą zmienną stanu materialTab i materialAwaitingOrders
  const [materialTab, setMaterialTab] = useState(0);
  const [materialAwaitingOrders, setMaterialAwaitingOrders] = useState({});

  // Dodaję stan dla odpowiedzi formularzy produkcyjnych
  const [formResponses, setFormResponses] = useState({
    completedMO: [],
    productionControl: [],
    productionShift: []
  });
  const [loadingFormResponses, setLoadingFormResponses] = useState(false);
  const [formTab, setFormTab] = useState(0);

  // Nowe stany dla opcji dodawania do magazynu w dialogu historii produkcji
  const [addToInventoryOnHistory, setAddToInventoryOnHistory] = useState(true); // domyślnie włączone
  const [historyInventoryData, setHistoryInventoryData] = useState({
    expiryDate: null,
    lotNumber: '',
    finalQuantity: '',
    warehouseId: ''
  });
  const [historyInventoryError, setHistoryInventoryError] = useState(null);
  const [warehouses, setWarehouses] = useState([]);
  const [warehousesLoading, setWarehousesLoading] = useState(false);

  // Nowe stany dla funkcjonalności dodawania surowców
  const [rawMaterialsDialogOpen, setRawMaterialsDialogOpen] = useState(false);
  const [rawMaterialsItems, setRawMaterialsItems] = useState([]);
  const [loadingRawMaterials, setLoadingRawMaterials] = useState(false);
  const [searchRawMaterials, setSearchRawMaterials] = useState('');

  // Nowe stany dla funkcjonalności usuwania materiałów
  const [deleteMaterialDialogOpen, setDeleteMaterialDialogOpen] = useState(false);
  const [materialToDelete, setMaterialToDelete] = useState(null);

  // Nowe stany dla funkcjonalności konsumpcji materiałów
  const [consumeMaterialsDialogOpen, setConsumeMaterialsDialogOpen] = useState(false);
  const [consumedMaterials, setConsumedMaterials] = useState([]);
  const [selectedBatchesToConsume, setSelectedBatchesToConsume] = useState({});
  const [consumeQuantities, setConsumeQuantities] = useState({});
  const [consumeErrors, setConsumeErrors] = useState({});

  // Nowe stany dla korekty i usunięcia konsumpcji
  const [editConsumptionDialogOpen, setEditConsumptionDialogOpen] = useState(false);
  const [deleteConsumptionDialogOpen, setDeleteConsumptionDialogOpen] = useState(false);
  const [selectedConsumption, setSelectedConsumption] = useState(null);
  const [editedQuantity, setEditedQuantity] = useState(0);
  const [consumedBatchPrices, setConsumedBatchPrices] = useState({});
  const [consumedIncludeInCosts, setConsumedIncludeInCosts] = useState({});
  const [restoreReservation, setRestoreReservation] = useState(true); // Domyślnie włączone
  const [fixingRecipeData, setFixingRecipeData] = useState(false);
  
  // Stan dla załączników z powiązanych PO
  const [ingredientAttachments, setIngredientAttachments] = useState({});
  
  // Stan dla załączników badań klinicznych
  const [clinicalAttachments, setClinicalAttachments] = useState([]);
  const [uploadingClinical, setUploadingClinical] = useState(false);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Funkcja pomocnicza do formatowania wartości liczbowych z precyzją
  const formatQuantityPrecision = (value, precision = 3) => {
    if (typeof value !== 'number' || isNaN(value)) return 0;
    return Math.round(value * Math.pow(10, precision)) / Math.pow(10, precision);
  };

  // Stan dla głównej zakładki
  const [mainTab, setMainTab] = useState(0);

  // Funkcja do zmiany głównej zakładki
  const handleMainTabChange = (event, newValue) => {
    setMainTab(newValue);
  };

  // ✅ ETAP 2 OPTYMALIZACJI: Zastąpienie starych useEffect hooks jednym zoptymalizowanym
  useEffect(() => {
    fetchAllTaskData();
  }, [id, navigate, showError]);

  // Zachowujemy osobne useEffect dla magazynów (ładowane niezależnie)
  useEffect(() => {
    fetchWarehouses();
  }, []);

  // Zachowujemy useEffect dla synchronizacji formularza magazynu
  useEffect(() => {
    if (addToInventoryOnHistory && editedHistoryItem.quantity) {
      setHistoryInventoryData(prev => ({
        ...prev,
        finalQuantity: editedHistoryItem.quantity.toString()
      }));
    }
  }, [editedHistoryItem.quantity, addToInventoryOnHistory]);

  // USUNIĘTE STARE useEffect HOOKS - zastąpione przez fetchAllTaskData:
  // ❌ useEffect(() => { fetchProductionHistory(); }, [task?.id]);
  // ❌ useEffect(() => { if (task?.moNumber) fetchFormResponses(task.moNumber); }, [task?.moNumber]);
  // ❌ useEffect(() => { if (task?.id && task?.materials?.length > 0) fetchAwaitingOrdersForMaterials(); }, [task?.id, task?.materials?.length]);
  // ❌ useEffect(() => { if (task?.consumedMaterials && task.consumedMaterials.length > 0) fetchConsumedBatchPrices(); }, [task?.consumedMaterials]);

  // ✅ ZOPTYMALIZOWANA funkcja pobierania odpowiedzi formularzy (Promise.all)
  const fetchFormResponsesOptimized = async (moNumber) => {
    if (!moNumber) return { completedMO: [], productionControl: [], productionShift: [] };
    
    try {
      // Równoległe pobieranie wszystkich 3 typów formularzy
      const [completedMOSnapshot, controlSnapshot, shiftSnapshot] = await Promise.all([
        getDocs(query(
          collection(db, 'Forms/SkonczoneMO/Odpowiedzi'), 
          where('moNumber', '==', moNumber)
        )),
        getDocs(query(
          collection(db, 'Forms/KontrolaProdukcji/Odpowiedzi'), 
          where('manufacturingOrder', '==', moNumber)
        )),
        getDocs(query(
          collection(db, 'Forms/ZmianaProdukcji/Odpowiedzi'), 
          where('moNumber', '==', moNumber)
        ))
      ]);

      const completedMOData = completedMOSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date?.toDate(),
        formType: 'completedMO'
      }));

      const controlData = controlSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        fillDate: doc.data().fillDate?.toDate(),
        productionStartDate: doc.data().productionStartDate?.toDate(),
        productionEndDate: doc.data().productionEndDate?.toDate(),
        readingDate: doc.data().readingDate?.toDate(),
        formType: 'productionControl'
      }));

      const shiftData = shiftSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        fillDate: doc.data().fillDate?.toDate(),
        formType: 'productionShift'
      }));

      console.log(`✅ Optymalizacja Etap 2: Pobrano odpowiedzi formularzy w 3 równoległych zapytaniach zamiast 3 sekwencyjnych`);
      
      return {
        completedMO: completedMOData,
        productionControl: controlData,
        productionShift: shiftData
      };
    } catch (error) {
      console.error('Błąd podczas pobierania odpowiedzi formularzy:', error);
      throw error;
    }
  };

  // ✅ ETAP 2 OPTYMALIZACJI: Połączona funkcja ładowania wszystkich danych zadania
  const fetchAllTaskData = async () => {
    try {
      setLoading(true);
      
      // KROK 1: Pobierz podstawowe dane zadania (musi być pierwsze)
      const fetchedTask = await getTaskById(id);
      setTask(fetchedTask);
      
      // KROK 2: Przetwórz materiały z grupowym pobieraniem pozycji magazynowych (z Etapu 1)
      if (fetchedTask?.materials?.length > 0) {
        // ✅ OPTYMALIZACJA ETAP 1: Grupowe pobieranie pozycji magazynowych zamiast N+1 zapytań
        
        // Zbierz wszystkie ID pozycji magazynowych z materiałów
        const inventoryItemIds = fetchedTask.materials
          .map(material => material.inventoryItemId)
          .filter(Boolean); // Usuń undefined/null wartości
        
        let inventoryItemsMap = new Map();
        
        if (inventoryItemIds.length > 0) {
          // Firebase "in" operator obsługuje maksymalnie 10 elementów na zapytanie
          const batchSize = 10;
          
          for (let i = 0; i < inventoryItemIds.length; i += batchSize) {
            const batch = inventoryItemIds.slice(i, i + batchSize);
            
            try {
              // Grupowe pobieranie pozycji magazynowych dla batcha
              const itemsQuery = query(
                collection(db, 'inventory'),
                where('__name__', 'in', batch)
              );
              
              const itemsSnapshot = await getDocs(itemsQuery);
              
              // Dodaj pobrane pozycje do mapy
              itemsSnapshot.forEach(doc => {
                inventoryItemsMap.set(doc.id, {
                  id: doc.id,
                  ...doc.data()
                });
              });
            } catch (error) {
              console.error(`Błąd podczas grupowego pobierania pozycji magazynowych (batch ${i}-${i+batchSize}):`, error);
              // Kontynuuj z następnym batchem, nie przerywaj całego procesu
            }
          }
          
          console.log(`✅ Optymalizacja Etap 1: Pobrano ${inventoryItemsMap.size} pozycji magazynowych w ${Math.ceil(inventoryItemIds.length / batchSize)} zapytaniach zamiast ${inventoryItemIds.length} osobnych zapytań`);
        }
        
        // Przygotuj listę materiałów z aktualnymi cenami
        const materialsList = fetchedTask.materials.map(material => {
          let updatedMaterial = { ...material };
          
          // Jeśli materiał ma powiązanie z pozycją magazynową, użyj danych z mapy
          if (material.inventoryItemId && inventoryItemsMap.has(material.inventoryItemId)) {
            const inventoryItem = inventoryItemsMap.get(material.inventoryItemId);
            updatedMaterial.unitPrice = inventoryItem.unitPrice || inventoryItem.price || 0;
          }
          
          return {
            ...updatedMaterial,
            plannedQuantity: (updatedMaterial.quantity || 0) * (fetchedTask.quantity || 1)
          };
        });
        
        setMaterials(materialsList);
        
        // Inicjalizacja rzeczywistych ilości
        const quantities = {};
        materialsList.forEach(material => {
          // Pobierz actualQuantity z danych zadania lub użyj plannedQuantity jako wartości domyślnej
          const actualQuantity = fetchedTask.actualMaterialUsage && fetchedTask.actualMaterialUsage[material.id] !== undefined
            ? fetchedTask.actualMaterialUsage[material.id]
            : material.quantity;
          
          quantities[material.id] = actualQuantity;
        });
        
        setMaterialQuantities(quantities);
        
        // Inicjalizacja stanu includeInCosts - domyślnie wszystkie materiały są wliczane do kosztów
        const costsInclude = {};
        materialsList.forEach(material => {
          costsInclude[material.id] = fetchedTask.materialInCosts && fetchedTask.materialInCosts[material.id] !== undefined
            ? fetchedTask.materialInCosts[material.id]
            : true;
        });
        
        setIncludeInCosts(costsInclude);
      }
      
      // KROK 2.5: ✅ Wzbogać dane skonsumowanych materiałów o informacje z partii magazynowych
      if (fetchedTask?.consumedMaterials?.length > 0) {
        try {
          console.log('🔄 Wzbogacanie danych skonsumowanych materiałów...');
          const enrichedConsumedMaterials = await enrichConsumedMaterialsData(fetchedTask.consumedMaterials);
          fetchedTask.consumedMaterials = enrichedConsumedMaterials;
          setTask(prevTask => ({
            ...prevTask,
            consumedMaterials: enrichedConsumedMaterials
          }));
          console.log('✅ Dane skonsumowanych materiałów zostały wzbogacone');
        } catch (error) {
          console.warn('⚠️ Nie udało się wzbogacić danych skonsumowanych materiałów:', error);
        }
      }
      
      // KROK 3: ✅ OPTYMALIZACJA ETAP 2: Równoległe pobieranie wszystkich pozostałych danych
      const dataLoadingPromises = [];
      
      // Historia produkcji - jeśli zadanie ma ID
      if (fetchedTask?.id) {
        dataLoadingPromises.push(
          getProductionHistory(fetchedTask.id)
            .then(history => ({ type: 'productionHistory', data: history || [] }))
            .catch(error => {
              console.error('Błąd podczas pobierania historii produkcji:', error);
              return { type: 'productionHistory', data: [] };
            })
        );
      }
      
      // Dane wersji receptury - jeśli zadanie ma recipeId i recipeVersion
      if (fetchedTask?.recipeId && fetchedTask?.recipeVersion) {
        dataLoadingPromises.push(
          getRecipeVersion(fetchedTask.recipeId, fetchedTask.recipeVersion)
            .then(recipeVersion => ({ type: 'recipeVersion', data: recipeVersion }))
            .catch(error => {
              console.error('Błąd podczas pobierania wersji receptury:', error);
              return { type: 'recipeVersion', data: null };
            })
        );
      }
      
      // Dane użytkowników - jeśli zadanie ma historię statusów
      if (fetchedTask?.statusHistory?.length > 0) {
        const userIds = fetchedTask.statusHistory.map(change => change.changedBy).filter(id => id);
        const uniqueUserIds = [...new Set(userIds)];
        
        if (uniqueUserIds.length > 0) {
          dataLoadingPromises.push(
            getUsersDisplayNames(uniqueUserIds)
              .then(names => ({ type: 'userNames', data: names }))
              .catch(error => {
                console.error('Błąd podczas pobierania nazw użytkowników:', error);
                return { type: 'userNames', data: {} };
              })
          );
        }
      }
      
      // Wykonaj wszystkie zapytania równolegle
      if (dataLoadingPromises.length > 0) {
        const results = await Promise.all(dataLoadingPromises);
        
        console.log(`✅ Optymalizacja Etap 2: Pobrano ${results.length} typów danych równolegle zamiast sekwencyjnie`);
        
        // Przetwórz wyniki i ustaw stany
        results.forEach(result => {
          switch (result.type) {
            case 'productionHistory':
              setProductionHistory(result.data);
              break;
            case 'userNames':
              setUserNames(result.data);
              break;
            case 'recipeVersion':
              if (result.data && result.data.data) {
                // Dodaj dane wersji receptury do obiektu task
                setTask(prevTask => ({
                  ...prevTask,
                  recipe: result.data.data // result.data.data zawiera pełne dane receptury z tej wersji
                }));
              }
              break;
          }
        });
      }
      
      // Jeśli zadanie ma historię statusów, pobierz dane użytkowników
      if (fetchedTask.statusHistory && fetchedTask.statusHistory.length > 0) {
        const userIds = fetchedTask.statusHistory.map(change => change.changedBy).filter(id => id);
        const uniqueUserIds = [...new Set(userIds)];
        await fetchStatusHistory(uniqueUserIds);
      }
    } catch (error) {
      console.error('Błąd podczas pobierania zadania:', error);
      showError('Nie udało się pobrać danych zadania: ' + error.message);
      navigate('/production');
    } finally {
      setLoading(false);
    }
  };

  // Zachowujemy funkcje kompatybilności wstecznej (używane w innych miejscach kodu)
  const fetchTask = async () => {
    // Przekierowanie do nowej zoptymalizowanej funkcji
    await fetchAllTaskData();
  };
  
  const fetchProductionHistory = async () => {
    if (!task || !task.id) {
      return; // Zabezpieczenie przed błędami null/undefined
    }
    try {
      const history = await getProductionHistory(task.id);
      setProductionHistory(history || []);
    } catch (error) {
      console.error('Błąd podczas pobierania historii produkcji:', error);
      setProductionHistory([]);
    }
  };

  // Dodaję efekt pobierający odpowiedzi formularzy przy każdej zmianie numeru MO
  useEffect(() => {
    if (task?.moNumber) {
      fetchFormResponses(task.moNumber);
    }
  }, [task?.moNumber]);

  // Dodaję efekt pobierający oczekiwane zamówienia przy każdym załadowaniu zadania
  useEffect(() => {
    if (task?.id && task?.materials?.length > 0) {
      fetchAwaitingOrdersForMaterials();
    }
  }, [task?.id, task?.materials?.length]);

  // Dodaję efekt pobierający ceny skonsumowanych partii
  useEffect(() => {
    if (task?.consumedMaterials && task.consumedMaterials.length > 0) {
      fetchConsumedBatchPrices();
    }
  }, [task?.consumedMaterials]);

  // Dodaję efekt pobierający załączniki z PO dla składników
  useEffect(() => {
    if (task?.recipe?.ingredients && task?.consumedMaterials && materials.length > 0) {
      fetchIngredientAttachments();
    }
  }, [task?.recipe?.ingredients, task?.consumedMaterials, materials]);

  // Pobieranie załączników badań klinicznych
  useEffect(() => {
    if (task?.id) {
      fetchClinicalAttachments();
    }
  }, [task?.id]);

  // Funkcja do pobierania magazynów
  const fetchWarehouses = async () => {
    try {
      setWarehousesLoading(true);
      const { getAllWarehouses } = await import('../../services/inventoryService');
      const warehousesList = await getAllWarehouses();
      setWarehouses(warehousesList);
      
      // Jeśli jest przynajmniej jeden magazyn, ustaw go jako domyślny
      if (warehousesList.length > 0) {
        setHistoryInventoryData(prev => ({
          ...prev,
          warehouseId: warehousesList[0].id
        }));
      }
    } catch (error) {
      console.error('Błąd podczas pobierania magazynów:', error);
    } finally {
      setWarehousesLoading(false);
    }
  };

  // Pobieranie magazynów przy montowaniu komponentu
  useEffect(() => {
    fetchWarehouses();
  }, []);

  // Synchronizacja ilości wyprodukowanej z ilością końcową w formularzu magazynu dla dialogu historii
  useEffect(() => {
    if (addToInventoryOnHistory && editedHistoryItem.quantity) {
      setHistoryInventoryData(prev => ({
        ...prev,
        finalQuantity: editedHistoryItem.quantity.toString()
      }));
    }
  }, [editedHistoryItem.quantity, addToInventoryOnHistory]);

  const fetchStatusHistory = async (userIds) => {
    const names = await getUsersDisplayNames(userIds);
    setUserNames(names);
  };

  const handleStatusChange = async (newStatus) => {
    try {
      if (newStatus === 'Zakończone' && !task.materialConsumptionConfirmed && task.materials && task.materials.length > 0) {
        setConsumptionDialogOpen(true);
        return;
      }

      setLoading(true);
      await updateTaskStatus(id, newStatus, currentUser.uid);
      
      // Ponowne pobranie danych zadania
      const updatedTask = await getTaskById(id);
      setTask(updatedTask);
      
      // Aktualizacja danych użytkowników
      if (updatedTask.statusHistory && updatedTask.statusHistory.length > 0) {
        const userIds = updatedTask.statusHistory.map(change => change.changedBy).filter(id => id);
        const uniqueUserIds = [...new Set(userIds)];
        const missingUserIds = uniqueUserIds.filter(id => !userNames[id]);
        
        if (missingUserIds.length > 0) {
          const newNames = await getUsersDisplayNames(missingUserIds);
          setUserNames(prevNames => ({
            ...prevNames,
            ...newNames
          }));
        }
      }
      
      // Wyświetl powiadomienie
      showSuccess(`Status zadania zmieniony na: ${newStatus}`);
    } catch (error) {
      console.error('Błąd podczas zmiany statusu:', error);
      showError('Nie udało się zmienić statusu zadania: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Funkcje obsługujące zarządzanie materiałami
  const handleQuantityChange = (materialId, value) => {
    // Konwertuj wartość na liczbę tylko jeśli nie jest pusta
    const numValue = value === '' ? '' : parseFloat(value);
    
    // Zapisz wartość tylko jeśli jest pusta, lub jest poprawną liczbą
    if (value === '' || (!isNaN(numValue))) {
      setMaterialQuantities(prev => ({
        ...prev,
        [materialId]: numValue
      }));
      
      // Resetuj błędy
      if (errors[materialId]) {
        setErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[materialId];
          return newErrors;
        });
      }
    }
  };
  
  const validateQuantities = () => {
    const newErrors = {};
    let isValid = true;
    
    materials.forEach(material => {
      const quantity = materialQuantities[material.id];
      
      // Sprawdź czy quantity jest liczbą
      if (isNaN(quantity)) {
        newErrors[material.id] = 'Ilość musi być liczbą';
        isValid = false;
      }
      // Sprawdź czy quantity nie jest ujemne
      else if (quantity < 0) {
        newErrors[material.id] = 'Ilość nie może być ujemna';
        isValid = false;
      }
    });
    
    setErrors(newErrors);
    return isValid;
  };
  
  const handleSaveChanges = async () => {
    try {
      if (!validateQuantities()) {
        return;
      }
      
      const result = await updateActualMaterialUsage(id, materialQuantities);
      showSuccess(result.message || 'Zużycie materiałów zaktualizowane');
      
      // Jeśli zużycie było wcześniej potwierdzone, wyświetl dodatkowe powiadomienie
      if (result.message && result.message.includes('Poprzednie potwierdzenie zużycia zostało anulowane')) {
        setTimeout(() => {
          showInfo('Poprzednie potwierdzenie zużycia zostało anulowane z powodu zmiany ilości. Proszę ponownie potwierdzić zużycie materiałów.');
        }, 1000);
      }
      
      setEditMode(false);
      
      // Odśwież dane zadania
      const updatedTask = await getTaskById(id);
      setTask(updatedTask);

      // Zaktualizuj też lokalne zmienne
      if (updatedTask?.materials?.length > 0) {
        const materialsList = updatedTask.materials.map(material => ({
          ...material,
          plannedQuantity: (material.quantity || 0) * (updatedTask.quantity || 1)
        }));
        
        setMaterials(materialsList);
      }
    } catch (error) {
      console.error('Błąd podczas zapisywania zmian:', error);
      showError('Nie udało się zaktualizować zużycia materiałów: ' + error.message);
    }
  };
  
  const handleConfirmConsumption = async () => {
    try {
      setConfirmationDialogOpen(false);
      
      await confirmMaterialConsumption(id);
      showSuccess('Zużycie materiałów potwierdzone. Stany magazynowe zostały zaktualizowane.');
      
      // Odśwież dane zadania
      const updatedTask = await getTaskById(id);
      setTask(updatedTask);
      
      // Zamknij dialog konsumpcji po pomyślnym potwierdzeniu
      setConsumptionDialogOpen(false);
    } catch (error) {
      console.error('Błąd podczas potwierdzania zużycia:', error);
      showError('Nie udało się potwierdzić zużycia materiałów: ' + error.message);
    }
  };

  const handleDelete = async () => {
    try {
      setDeleteDialog(false);
      setLoading(true);
      await deleteTask(id);
      showSuccess('Zadanie zostało usunięte');
      navigate('/production');
    } catch (error) {
      showError('Błąd podczas usuwania zadania: ' + error.message);
      console.error('Error deleting task:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Zaplanowane':
        return 'primary';
      case 'W trakcie':
        return 'warning';
      case 'Zakończone':
        return 'success';
      case 'Anulowane':
        return 'error';
      default:
        return 'default';
    }
  };

  const getStatusActions = () => {
    // Przygotuj przyciski akcji w zależności od statusu zadania
    const actions = [];

    // Przycisk do wydruku szczegółów MO
    actions.push(
      <Button
        key="print-mo"
        variant="outlined"
        startIcon={<PrintIcon />}
        onClick={handlePrintMODetails}
        sx={{ mr: 1, mb: isMobile ? 1 : 0 }}
      >
        Drukuj MO
      </Button>
    );

    // Przycisk do wydruku raportu materiałów i LOT-ów
    actions.push(
      <Button
        key="print-materials"
        variant="outlined"
        startIcon={<PrintIcon />}
        onClick={handlePrintMaterialsAndLots}
        sx={{ mr: 1, mb: isMobile ? 1 : 0 }}
      >
        Raport materiałów
      </Button>
    );

    // ... pozostałe przyciski akcji ...

    // Zwróć kontener z przyciskami, zastosuj flexbox dla lepszego układu na mobilnych
    return (
      <Box sx={{ 
        display: 'flex', 
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'stretch' : 'center',
        gap: 1
      }}>
        {actions}
      </Box>
    );
  };

  // Funkcja otwierająca dialog przyjęcia do magazynu
  const handleReceiveClick = () => {
    setReceiveDialogOpen(true);
  };
  
  // Funkcja obsługująca dodanie produktu do magazynu
  const handleReceiveItem = async () => {
    try {
      setLoading(true);
      setReceiveDialogOpen(false);
      
      // Sprawdź czy zadanie ma pozycję magazynową, jeśli nie - spróbuj znaleźć przez recepturę
      let inventoryProductId = task.inventoryProductId;
      
      if (!inventoryProductId && task.recipeId) {
        try {
          console.log(`Sprawdzanie pozycji magazynowej dla receptury ${task.recipeId}`);
          const { getInventoryItemByRecipeId } = await import('../../services/inventoryService');
          const recipeInventoryItem = await getInventoryItemByRecipeId(task.recipeId);
          
          if (recipeInventoryItem) {
            inventoryProductId = recipeInventoryItem.id;
            console.log(`Znaleziono pozycję magazynową z receptury: ${recipeInventoryItem.name} (ID: ${inventoryProductId})`);
            
            // Zaktualizuj zadanie z pozycją magazynową z receptury
            const { updateTask } = await import('../../services/productionService');
            await updateTask(id, {
              inventoryProductId: inventoryProductId
            }, currentUser.uid);
            
            // Odśwież dane zadania z nową pozycją magazynową
            const updatedTask = await getTaskById(id);
            setTask(updatedTask);
          }
        } catch (error) {
          console.error('Błąd podczas pobierania pozycji magazynowej z receptury:', error);
        }
      }
      
      // Jeśli produkt jest powiązany z pozycją w magazynie, przenieś do formularza przyjęcia
      if (inventoryProductId) {
        // Przekieruj do strony przyjęcia towaru z parametrami
        const unitPrice = task.costs && task.quantity ? 
          Number(task.costs.totalCost / task.quantity) : 0;
        
        // Użyj LOT z zadania produkcyjnego, jeśli jest dostępny,
        // w przeciwnym przypadku wygeneruj na podstawie numeru MO
        const lotNumber = task.lotNumber || 
                         (task.moNumber ? `LOT-${task.moNumber}` : `LOT-PROD-${id.substring(0, 6)}`);
          
        // Przygotuj dodatkowe informacje o pochodzeniu produktu
        const sourceInfo = new URLSearchParams();
        sourceInfo.append('poNumber', `PROD-${id.substring(0, 6)}`);
        sourceInfo.append('quantity', task.quantity);
        sourceInfo.append('unitPrice', unitPrice);
        sourceInfo.append('reason', 'production');
        sourceInfo.append('lotNumber', lotNumber);
        sourceInfo.append('source', 'production');
        sourceInfo.append('sourceId', id);
        
        // Dodaj datę ważności, jeśli została zdefiniowana w zadaniu
        if (task.expiryDate) {
          // Konwertuj różne formaty daty do ISO string
          let expiryDateStr;
          if (task.expiryDate instanceof Date) {
            expiryDateStr = task.expiryDate.toISOString();
          } else if (task.expiryDate.toDate && typeof task.expiryDate.toDate === 'function') {
            // Firebase Timestamp
            expiryDateStr = task.expiryDate.toDate().toISOString();
          } else if (task.expiryDate.seconds) {
            // Timestamp z sekundami
            expiryDateStr = new Date(task.expiryDate.seconds * 1000).toISOString();
          } else if (typeof task.expiryDate === 'string') {
            // String z datą - upewnij się, że to poprawny format ISO
            try {
              expiryDateStr = new Date(task.expiryDate).toISOString();
            } catch (e) {
              console.error('Błąd podczas konwersji daty ważności:', e);
            }
          }
          
          if (expiryDateStr) {
            sourceInfo.append('expiryDate', expiryDateStr);
          }
        }
        
        // Dodaj informacje o MO i CO
        if (task.moNumber) {
          sourceInfo.append('moNumber', task.moNumber);
        }
        
        if (task.orderNumber) {
          sourceInfo.append('orderNumber', task.orderNumber);
        }
        
        if (task.orderId) {
          sourceInfo.append('orderId', task.orderId);
        }
        
        // Przygotuj opis dla partii
        let notes = `Partia z zadania produkcyjnego: ${task.name || ''}`;
        if (task.moNumber) {
          notes += ` (MO: ${task.moNumber})`;
        }
        if (task.orderNumber) {
          notes += ` (CO: ${task.orderNumber})`;
        }
        sourceInfo.append('notes', notes);
        
        console.log('Przekazuję parametry do formularza przyjęcia:', Object.fromEntries(sourceInfo));
        
        navigate(`/inventory/${inventoryProductId}/receive?${sourceInfo.toString()}`);
      } else {
        // Jeśli nie ma powiązanej pozycji magazynowej, użyj standardowej funkcji
        await addTaskProductToInventory(id, currentUser.uid);
        
        setAlert({
          open: true,
          severity: 'success',
          message: 'Produkt został pomyślnie dodany do magazynu jako partia'
        });
        
        // Odśwież dane zadania
        const updatedTask = await getTaskById(id);
        setTask(updatedTask);
      }
    } catch (error) {
      console.error('Błąd podczas dodawania produktu do magazynu:', error);
      setAlert({
        open: true,
        severity: 'error',
        message: `Błąd podczas dodawania produktu do magazynu: ${error.message}`
      });
    } finally {
      setLoading(false);
    }
  };

  // Funkcja obsługująca dodanie produktu do magazynu
  const handleAddToInventory = () => {
    handleReceiveClick();
  };

  const handleStartProduction = async () => {
    try {
      await startProduction(id, currentUser.uid);
      showSuccess('Produkcja rozpoczęta');
      const updatedTask = await getTaskById(id);
      setTask(updatedTask);
    } catch (error) {
      showError('Błąd podczas rozpoczynania produkcji: ' + error.message);
    }
  };

  const handleStopProduction = async () => {
    if (!productionData.completedQuantity) {
      showError('Podaj ilość wyprodukowaną');
      return;
    }
    
    const quantity = parseFloat(productionData.completedQuantity);
    
    if (isNaN(quantity) || quantity <= 0) {
      showError('Ilość wyprodukowana musi być liczbą większą od zera');
      return;
    }
    
    setLoading(true);
    
    try {
      const result = await stopProduction(
        id, 
        quantity, 
        productionData.timeSpent || 0,
        currentUser.uid,
        // Przekaż informacje o czasie
        {
          startTime: productionData.startTime.toISOString(),
          endTime: productionData.endTime.toISOString()
        }
      );
      
      setStopProductionDialogOpen(false);
      
      if (result.isCompleted) {
        showSuccess('Zadanie zostało zakończone');
        showInfo('Rezerwacje materiałów pozostają aktywne do momentu potwierdzenia zużycia materiałów. Przejdź do zakładki "Zużycie materiałów", aby je potwierdzić.');
      } else {
        showSuccess('Produkcja została wstrzymana');
      }
      
      fetchTask(); // Odśwież dane zadania
    } catch (error) {
      console.error('Error stopping production:', error);
      showError('Błąd podczas zatrzymywania produkcji: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Nowa funkcja do obsługi pobrania partii dla materiałów
  const fetchBatchesForMaterialsOptimized = async () => {
    try {
      setMaterialBatchesLoading(true);
      if (!task || !task.materials) return;
      
      const batchesData = {};
      const initialSelectedBatches = {};
      
      // KROK 1: Pobierz wszystkie magazyny na początku (już zoptymalizowane)
      const { getAllWarehouses } = await import('../../services/inventoryService');
      const allWarehouses = await getAllWarehouses();
      // Stwórz mapę magazynów dla szybkiego dostępu po ID
      const warehousesMap = {};
      allWarehouses.forEach(warehouse => {
        warehousesMap[warehouse.id] = warehouse.name;
      });
      
      // KROK 2: ✅ OPTYMALIZACJA - Grupowe pobieranie partii dla wszystkich materiałów
      const materialIds = task.materials
        .map(material => material.inventoryItemId || material.id)
        .filter(Boolean);
      
      if (materialIds.length === 0) {
        setBatches(batchesData);
        setSelectedBatches(initialSelectedBatches);
        return;
      }
      
      // Równoległe pobieranie partii dla wszystkich materiałów
      const materialBatchesPromises = materialIds.map(async (materialId) => {
        try {
          const batches = await getItemBatches(materialId);
          return { materialId, batches: batches || [] };
        } catch (error) {
          console.error(`Błąd podczas pobierania partii dla materiału ${materialId}:`, error);
          return { materialId, batches: [] };
        }
      });
      
      const materialBatchesResults = await Promise.all(materialBatchesPromises);
      
      // Stwórz mapę partii pogrupowanych według materiału
      const materialBatchesMap = {};
      const allBatchIds = [];
      
      materialBatchesResults.forEach(({ materialId, batches }) => {
        materialBatchesMap[materialId] = batches;
        // Zbierz wszystkie ID partii dla grupowego pobierania rezerwacji
        batches.forEach(batch => {
          if (batch.id && !allBatchIds.includes(batch.id)) {
            allBatchIds.push(batch.id);
          }
        });
      });
      
      console.log(`✅ Optymalizacja Etap 3: Pobrano partie dla ${materialIds.length} materiałów w ${materialIds.length} równoległych zapytaniach zamiast sekwencyjnych`);
      
      // KROK 3: ✅ OPTYMALIZACJA - Grupowe pobieranie rezerwacji dla wszystkich partii
      let allBatchReservationsMap = {};
      
      if (allBatchIds.length > 0) {
        // Równoległe pobieranie rezerwacji dla wszystkich partii
        const batchReservationsPromises = allBatchIds.map(async (batchId) => {
          try {
            const reservations = await getBatchReservations(batchId);
            return { batchId, reservations: reservations || [] };
          } catch (error) {
            console.error(`Błąd podczas pobierania rezerwacji dla partii ${batchId}:`, error);
            return { batchId, reservations: [] };
          }
        });
        
        const batchReservationsResults = await Promise.all(batchReservationsPromises);
        
        // Stwórz mapę rezerwacji
        batchReservationsResults.forEach(({ batchId, reservations }) => {
          allBatchReservationsMap[batchId] = reservations;
        });
        
        console.log(`✅ Optymalizacja Etap 3: Pobrano rezerwacje dla ${allBatchIds.length} partii w ${allBatchIds.length} równoległych zapytaniach zamiast sekwencyjnych`);
      }
      
      // KROK 4: Przetwórz dane i stwórz finalne struktury
      for (const material of task.materials) {
        const materialId = material.inventoryItemId || material.id;
        if (!materialId) continue;
        
        const batches = materialBatchesMap[materialId] || [];
        
        if (batches.length > 0) {
          // Dla każdej partii wzbogać o informacje o rezerwacjach i magazynie
          const batchesWithReservations = batches.map((batch) => {
            const reservations = allBatchReservationsMap[batch.id] || [];
            
            // Oblicz ilość zarezerwowaną przez inne zadania (z wyłączeniem bieżącego)
            const reservedByOthers = reservations.reduce((sum, reservation) => {
              if (reservation.taskId === id) return sum; // Pomiń rezerwacje bieżącego zadania
              return sum + (reservation.quantity || 0);
            }, 0);
            
            // Oblicz faktycznie dostępną ilość po uwzględnieniu rezerwacji
            const effectiveQuantity = Math.max(0, batch.quantity - reservedByOthers);
            
            // Przygotuj informacje o magazynie z prawidłową nazwą
            let warehouseInfo = {
              id: 'main',
              name: 'Magazyn główny'
            };
            
            if (batch.warehouseId) {
              // Pobierz nazwę magazynu z naszej mapy
              const warehouseName = warehousesMap[batch.warehouseId];
              warehouseInfo = {
                id: batch.warehouseId,
                name: warehouseName || `Magazyn ${batch.warehouseId.substring(0, 6)}`
              };
            }
            
            return {
              ...batch,
              reservedByOthers,
              effectiveQuantity,
              warehouseInfo
            };
          });
          
          batchesData[materialId] = batchesWithReservations;
          initialSelectedBatches[materialId] = [];
          
          // Sprawdź czy materiał ma już zarezerwowane partie w zadaniu
          const reservedBatches = task.materialBatches && task.materialBatches[materialId] 
            ? task.materialBatches[materialId] 
            : [];
          
          if (reservedBatches.length > 0) {
            // Dla każdej zarezerwowanej partii
            for (const reservedBatch of reservedBatches) {
              // Znajdź odpowiadającą partię w dostępnych partiach
              const matchingBatch = batchesWithReservations.find(b => b.id === reservedBatch.batchId);
              
              if (matchingBatch) {
                // Dodaj zarezerwowaną partię do wybranych partii
                initialSelectedBatches[materialId].push({
                  batchId: reservedBatch.batchId,
                  quantity: reservedBatch.quantity,
                  batchNumber: reservedBatch.batchNumber || matchingBatch.batchNumber || matchingBatch.lotNumber || 'Bez numeru'
                });
              }
            }
          }
        } else {
          batchesData[materialId] = [];
          initialSelectedBatches[materialId] = [];
        }
      }
      
      setBatches(batchesData);
      setSelectedBatches(initialSelectedBatches);
      
      // Podsumowanie optymalizacji
      const totalBatches = Object.values(batchesData).reduce((sum, batches) => sum + batches.length, 0);
      console.log(`✅ Optymalizacja Etap 3 zakończona pomyślnie:`);
      console.log(`- Materiały: ${materialIds.length}`);
      console.log(`- Partie: ${totalBatches}`);
      console.log(`- Zapytania przed: ${materialIds.length + totalBatches} (N+M)`);
      console.log(`- Zapytania po: ${2 + materialIds.length} (2 + N równoległych)`);
      console.log(`- Redukcja zapytań: ${Math.round((1 - (2 + materialIds.length) / (materialIds.length + totalBatches)) * 100)}%`);
      
    } catch (error) {
      console.error('Błąd podczas pobierania partii dla materiałów:', error);
      showError('Nie udało się pobrać informacji o partiach materiałów');
    } finally {
      setMaterialBatchesLoading(false);
    }
  };

  // Zachowujemy starą funkcję dla kompatybilności wstecznej
  const fetchBatchesForMaterials = async () => {
    // Przekierowanie do nowej zoptymalizowanej funkcji
    await fetchBatchesForMaterialsOptimized();
  };
  
  // Obsługa zmiany metody rezerwacji
  const handleReservationMethodChange = (e) => {
    const newMethod = e.target.value;
    setReservationMethod(newMethod);
    
    // Jeśli wybrano ręczną metodę, pobierz partie
    if (newMethod === 'manual') {
      if (Object.keys(batches).length === 0) {
        fetchBatchesForMaterials();
      }
      // Zawsze pobieraj oczekiwane zamówienia przy wyborze ręcznej metody
      fetchAwaitingOrdersForMaterials();
      setManualBatchSelectionActive(true);
    } else {
      setManualBatchSelectionActive(false);
    }
  };
  
  // Obsługa zmiany wybranej partii
  const handleBatchSelection = (materialId, batchId, quantity) => {
    setSelectedBatches(prev => {
      const materialBatches = [...(prev[materialId] || [])];
      const existingBatchIndex = materialBatches.findIndex(b => b.batchId === batchId);
      
      if (existingBatchIndex >= 0) {
        // Aktualizuj istniejącą partię
        if (quantity <= 0) {
          // Usuń partię, jeśli ilość jest 0 lub ujemna
          materialBatches.splice(existingBatchIndex, 1);
        } else {
          materialBatches[existingBatchIndex].quantity = quantity;
        }
      } else if (quantity > 0) {
        // Dodaj nową partię
        const batch = batches[materialId].find(b => b.id === batchId);
        if (batch) {
          materialBatches.push({
            batchId: batchId,
            quantity: quantity,
            batchNumber: batch.batchNumber || batch.lotNumber || 'Bez numeru'
          });
        }
      }
      
      return {
        ...prev,
        [materialId]: materialBatches
      };
    });
  };
  
  // Walidacja ręcznego wyboru partii
  const validateManualBatchSelection = () => {
    if (!task || !task.materials) return { valid: false, error: "Brak materiałów do walidacji" };
    
    for (const material of task.materials) {
      const materialId = material.inventoryItemId || material.id;
      if (!materialId) continue;
      
      // Użyj funkcji uwzględniającej konsumpcję
      const requiredQuantity = getRequiredQuantityForReservation(material, materialId);
      
      // Jeśli wymagana ilość jest 0 lub mniejsza, pomiń walidację dla tego materiału
      if (requiredQuantity <= 0) {
        continue;
      }
      
      const materialBatches = selectedBatches[materialId] || [];
      const totalSelectedQuantity = materialBatches.reduce((sum, batch) => sum + batch.quantity, 0);
      
      if (totalSelectedQuantity < requiredQuantity) {
        return { 
          valid: false, 
          error: `Niewystarczająca ilość partii wybrana dla materiału ${material.name}. Wybrano: ${totalSelectedQuantity}, wymagane: ${requiredQuantity}`
        };
      }
    }
    
    return { valid: true };
  };
  
  // Podobnie zmodyfikujemy funkcję validateManualBatchSelectionForMaterial
  const validateManualBatchSelectionForMaterial = (materialId) => {
    const materialBatches = selectedBatches[materialId] || [];
    const material = task.materials.find(m => (m.inventoryItemId || m.id) === materialId);
    
    if (!material) {
      return { valid: false, error: 'Nie znaleziono materiału' };
    }
    
    // Użyj funkcji uwzględniającej konsumpcję
    const requiredQuantity = getRequiredQuantityForReservation(material, materialId);
    
    // Jeśli wymagana ilość jest 0 lub mniejsza, uznaj walidację za poprawną
    if (requiredQuantity <= 0) {
      return { valid: true };
    }
    
    const totalSelectedQuantity = materialBatches.reduce((sum, batch) => sum + batch.quantity, 0);
    
    if (totalSelectedQuantity === 0) {
      return { valid: false, error: `Nie wybrano żadnych partii dla materiału ${material.name}` };
    }
    
    if (totalSelectedQuantity < requiredQuantity) {
      return {
        valid: false,
        error: `Wybrana ilość (${totalSelectedQuantity}) jest mniejsza niż wymagana (${requiredQuantity}) dla materiału ${material.name}` 
      };
    }
    
    return { valid: true };
  };

  // Funkcja pomocnicza do obliczania skonsumowanej ilości materiału
  const getConsumedQuantityForMaterial = (materialId) => {
    if (!task.consumedMaterials || task.consumedMaterials.length === 0) {
      return 0;
    }

    const total = task.consumedMaterials
      .filter(consumed => consumed.materialId === materialId)
      .reduce((total, consumed) => total + Number(consumed.quantity || 0), 0);
    
    // Formatowanie do 3 miejsc po przecinku, aby uniknąć błędów precyzji float
    return formatQuantityPrecision(total, 3);
  };

  // Funkcja pomocnicza do obliczania wymaganej ilości do rezerwacji (po uwzględnieniu konsumpcji)
  const getRequiredQuantityForReservation = (material, materialId) => {
    const baseQuantity = materialQuantities[materialId] !== undefined 
      ? materialQuantities[materialId] 
      : material.quantity;
    
    const consumedQuantity = getConsumedQuantityForMaterial(materialId);
    const remainingQuantity = Math.max(0, baseQuantity - consumedQuantity);

    return remainingQuantity;
  };

  // Zmodyfikowana funkcja do rezerwacji materiałów z obsługą ręcznego wyboru partii
  const handleReserveMaterials = async (singleMaterialId = null) => {
    try {
      setReservingMaterials(true);
      
      // Funkcja pomocnicza do anulowania istniejących rezerwacji dla materiału
      const cancelExistingReservations = async (materialId) => {
        if (task.materialBatches && task.materialBatches[materialId] && task.materialBatches[materialId].length > 0) {
          try {
            // Importuj funkcję do czyszczenia rezerwacji dla zadania
            const { cleanupTaskReservations } = await import('../../services/inventoryService');
            console.log(`Usuwanie istniejących rezerwacji dla materiału ${materialId} w zadaniu ${id}`);
            await cleanupTaskReservations(id, [materialId]);
          } catch (error) {
            console.error(`Błąd podczas anulowania istniejących rezerwacji dla ${materialId}:`, error);
            throw error;
          }
        }
      };
      
      // Dla ręcznej rezerwacji
      if (reservationMethod === 'manual') {
        // Walidacja tylko dla pojedynczego materiału lub dla wszystkich materiałów
        const validationResult = singleMaterialId 
          ? validateManualBatchSelectionForMaterial(singleMaterialId)
          : validateManualBatchSelection();
          
        if (!validationResult.valid) {
          showError(validationResult.error);
          return;
        }
      
        // Wybierz materiały do rezerwacji - jeden określony lub wszystkie
        const materialsToReserve = singleMaterialId
          ? task.materials.filter(m => (m.inventoryItemId || m.id) === singleMaterialId)
          : task.materials;
        
        // Dla każdego materiału
        for (const material of materialsToReserve) {
          const materialId = material.inventoryItemId || material.id;
          if (!materialId) continue;
          
          // Najpierw anuluj istniejące rezerwacje dla tego materiału
          await cancelExistingReservations(materialId);
          
          // Oblicz wymaganą ilość do rezerwacji uwzględniając skonsumowane materiały
          const requiredQuantity = getRequiredQuantityForReservation(material, materialId);
          
          // Jeśli pozostała ilość do rezerwacji jest równa 0 lub mniejsza, pomiń ten materiał
          if (requiredQuantity <= 0) {
            console.log(`Materiał ${material.name} został już w pełni skonsumowany, pomijam rezerwację`);
            continue;
          }
            
          // Pobierz wybrane partie
          const selectedMaterialBatches = selectedBatches[materialId] || [];
          
          // Dla każdej wybranej partii wykonaj rezerwację
          for (const batch of selectedMaterialBatches) {
            if (batch.quantity <= 0) continue;
            
            // Utwórz rezerwację dla konkretnej partii
            await bookInventoryForTask(
              materialId,
              batch.quantity,
              id, // ID zadania
              currentUser.uid,
              'manual', // Metoda ręczna
              batch.batchId // ID konkretnej partii
            );
          }
        }
        
        showSuccess(`Materiały zostały zarezerwowane dla zadania ${task.moNumber || task.id}`);
      }
      // Dla automatycznej rezerwacji
      else {
        const materialsToReserve = singleMaterialId
          ? task.materials.filter(m => (m.inventoryItemId || m.id) === singleMaterialId)
          : task.materials;
          
        // Dla każdego materiału
        for (const material of materialsToReserve) {
          const materialId = material.inventoryItemId || material.id;
          if (!materialId) continue;
          
          // Najpierw anuluj istniejące rezerwacje dla tego materiału
          await cancelExistingReservations(materialId);
              
          // Oblicz wymaganą ilość do rezerwacji uwzględniając skonsumowane materiały
          const requiredQuantity = getRequiredQuantityForReservation(material, materialId);
          
          // Jeśli pozostała ilość do rezerwacji jest równa 0 lub mniejsza, pomiń ten materiał
          if (requiredQuantity <= 0) {
            console.log(`Materiał ${material.name} został już w pełni skonsumowany, pomijam rezerwację`);
            continue;
          }
          
          // Utwórz rezerwację automatyczną
          await bookInventoryForTask(
            materialId,
            requiredQuantity,
            id, // ID zadania
            currentUser.uid,
            'fifo' // Metoda FIFO
          );
        }
        
        showSuccess(`Materiały zostały automatycznie zarezerwowane dla zadania ${task.moNumber || task.id}`);
      }
        
      // Zamknij dialog tylko jeśli rezerwujemy wszystkie materiały
      if (!singleMaterialId) {
        setReserveDialogOpen(false);
      }
      
      // Odśwież dane zadania
      console.log("Pobieranie zaktualizowanych danych zadania po rezerwacji");
      const updatedTask = await getTaskById(id);
      console.log("Zaktualizowane dane zadania:", updatedTask);
      setTask(updatedTask);
      
    } catch (error) {
      console.error('Błąd podczas rezerwacji materiałów:', error);
      showError('Nie udało się zarezerwować materiałów: ' + error.message);
    } finally {
      setReservingMaterials(false);
    }
  };
  
  // Renderowanie komponentu do ręcznego wyboru partii
  const renderManualBatchSelection = () => {
    if (materialBatchesLoading) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
          <CircularProgress />
        </Box>
      );
    }

    return (
      <Box sx={{ mt: 2 }}>
        <Typography variant="subtitle1" gutterBottom>
          Wybierz partie dla każdego materiału:
        </Typography>
        
        {task.materials.map((material) => {
          const materialId = material.inventoryItemId || material.id;
          if (!materialId) return null;
          
          // Oblicz wymaganą ilość do rezerwacji uwzględniając skonsumowane materiały
          const baseQuantity = materialQuantities[materialId] !== undefined 
            ? materialQuantities[materialId] 
            : material.quantity;
          const consumedQuantity = getConsumedQuantityForMaterial(materialId);
          const requiredQuantity = getRequiredQuantityForReservation(material, materialId);
          
          let materialBatches = batches[materialId] || [];
          const selectedMaterialBatches = selectedBatches[materialId] || [];
          const totalSelectedQuantity = selectedMaterialBatches.reduce((sum, batch) => sum + batch.quantity, 0);
          const isComplete = totalSelectedQuantity >= requiredQuantity;
          
          // Sprawdź, czy materiał jest już zarezerwowany
          const isAlreadyReserved = task.materialBatches && task.materialBatches[materialId] && task.materialBatches[materialId].length > 0;
          
          // Sortuj partie: najpierw zarezerwowane dla zadania, potem wg daty ważności
          materialBatches = [...materialBatches].sort((a, b) => {
            // Sprawdź, czy partie są zarezerwowane dla tego zadania
            const aIsReserved = task.materialBatches && 
                               task.materialBatches[materialId] && 
                               task.materialBatches[materialId].some(batch => batch.batchId === a.id);
            const bIsReserved = task.materialBatches && 
                               task.materialBatches[materialId] && 
                               task.materialBatches[materialId].some(batch => batch.batchId === b.id);
            
            // Jeśli obie partie są zarezerwowane lub obie nie są, sortuj według daty ważności
            if (aIsReserved === bIsReserved) {
              // Sortuj według daty ważności (najkrótszej najpierw)
              if (!a.expiryDate && !b.expiryDate) return 0;
              if (!a.expiryDate) return 1; // Partia bez daty ważności na końcu
              if (!b.expiryDate) return -1; // Partia bez daty ważności na końcu
              return new Date(a.expiryDate) - new Date(b.expiryDate);
            }
            
            // Partie zarezerwowane na początku
            return aIsReserved ? -1 : 1;
          });
          
          return (
            <Accordion 
              key={materialId}
              expanded={expandedMaterial === materialId}
              onChange={() => setExpandedMaterial(expandedMaterial === materialId ? null : materialId)}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                  <Box>
                  <Typography>{material.name}</Typography>
                    {consumedQuantity > 0 && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        Skonsumowano: {consumedQuantity.toFixed(3)} {material.unit} z {baseQuantity.toFixed(3)} {material.unit}
                      </Typography>
                    )}
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Chip
                      label={`${totalSelectedQuantity.toFixed(3)} / ${parseFloat(requiredQuantity).toFixed(3)} ${material.unit}`}
                      color={isComplete ? "success" : requiredQuantity > 0 ? "warning" : "default"}
                      size="small"
                      sx={{ mr: 1 }}
                    />
                    {requiredQuantity <= 0 && (
                      <Chip
                        label="W pełni skonsumowany"
                        color="success"
                        size="small"
                        sx={{ mr: 1 }}
                      />
                    )}
                    {isAlreadyReserved && (
                      <Chip
                        label="Zarezerwowany"
                        color="primary"
                        size="small"
                        sx={{ mr: 1 }}
                      />
                    )}
                  </Box>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                {materialBatches.length === 0 ? (
                  <Typography color="error">
                    Brak dostępnych partii dla tego materiału
                  </Typography>
                ) : (
                  <>
                    <Typography variant="subtitle2" gutterBottom>Partie magazynowe:</Typography>
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Nr partii</TableCell>
                            <TableCell>Magazyn</TableCell>
                            <TableCell>Data ważności</TableCell>
                            <TableCell>Dostępna ilość</TableCell>
                            <TableCell>Cena jedn.</TableCell>
                            <TableCell>Do rezerwacji</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {materialBatches.map((batch) => {
                            const selectedBatch = selectedMaterialBatches.find(b => b.batchId === batch.id);
                            const selectedQuantity = selectedBatch ? selectedBatch.quantity : 0;
                            // Sprawdź czy partia jest już zarezerwowana dla tego zadania
                            const isReservedForTask = task.materialBatches && 
                                                     task.materialBatches[materialId] && 
                                                     task.materialBatches[materialId].some(b => b.batchId === batch.id);
                            
                            // Wyświetl informacje o faktycznej dostępności
                            const effectiveQuantity = batch.effectiveQuantity || 0;
                            const reservedByOthers = batch.reservedByOthers || 0;
                            
                            return (
                              <TableRow key={batch.id}>
                                <TableCell>
                                  {batch.batchNumber || batch.lotNumber || 'Bez numeru'}
                                  {isReservedForTask && (
                                    <Chip 
                                      label="Zarezerwowana" 
                                      color="primary" 
                                      size="small" 
                                      sx={{ ml: 1 }} 
                                      variant="outlined" 
                                    />
                                  )}
                                </TableCell>
                                <TableCell>
                                  {batch.warehouseInfo ? batch.warehouseInfo.name : 'Magazyn główny'}
                                </TableCell>
                                <TableCell>
                                  {batch.expiryDate ? formatDate(batch.expiryDate) : 'Brak'}
                                </TableCell>
                                <TableCell>
                                  {parseFloat(batch.quantity).toFixed(3)} {material.unit}
                                  {reservedByOthers > 0 && (
                                    <Typography variant="caption" color="error" display="block">
                                      Zarezerwowane: {parseFloat(reservedByOthers).toFixed(3)} {material.unit}
                                    </Typography>
                                  )}
                                  <Typography variant="caption" color={effectiveQuantity > 0 ? "success" : "error"} display="block">
                                    Dostępne: {parseFloat(effectiveQuantity).toFixed(3)} {material.unit}
                                  </Typography>
                                </TableCell>
                                <TableCell>
                                  {batch.unitPrice ? `${parseFloat(batch.unitPrice).toFixed(4)} €` : '—'}
                                </TableCell>
                                <TableCell>
                                  <TextField
                                    type="number"
                                    value={selectedQuantity}
                                    onChange={(e) => {
                                      const value = parseFloat(e.target.value);
                                      const quantity = isNaN(value) ? 0 : Math.min(value, effectiveQuantity);
                                      handleBatchSelection(materialId, batch.id, quantity);
                                    }}
                                    inputProps={{ 
                                      min: 0, 
                                      max: effectiveQuantity, // Maksymalna wartość to efektywnie dostępna ilość
                                      step: 'any'
                                    }}
                                    size="small"
                                    sx={{ width: '100px' }}
                                    error={effectiveQuantity <= 0}
                                    helperText={effectiveQuantity <= 0 ? "Brak dostępnej ilości" : ""}
                                    disabled={effectiveQuantity <= 0}
                                  />
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </>
                )}
                
                {/* Sekcja z oczekiwanymi zamówieniami - wydzielona poza warunek sprawdzający partie */}
                <Box sx={{ mt: 3 }}>
                  <Typography variant="subtitle2" gutterBottom>Oczekiwane zamówienia:</Typography>
                  {awaitingOrdersLoading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                      <CircularProgress size={24} />
                    </Box>
                  ) : (
                    <>
                      {awaitingOrders[materialId] && awaitingOrders[materialId].length > 0 ? (
                        <TableContainer>
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell>Nr zamówienia</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell>Zamówione</TableCell>
                                <TableCell>Otrzymane</TableCell>
                                <TableCell>Cena jednostkowa</TableCell>
                                <TableCell>Data zamówienia</TableCell>
                                <TableCell>Oczekiwana dostawa</TableCell>
                                <TableCell>Tymczasowe ID</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {awaitingOrders[materialId].map(order => {
                                const statusText = (() => {
                                  switch(order.status) {
                                    case 'ordered': return 'Zamówione';
                                    case 'confirmed': return 'Potwierdzone';
                                    case 'partial': return 'Częściowo dostarczone';
                                    default: return order.status;
                                  }
                                })();
                                
                                const statusColor = (() => {
                                  switch(order.status) {
                                    case 'ordered': return 'primary';
                                    case 'confirmed': return 'success';
                                    case 'partial': return 'warning';
                                    default: return 'default';
                                  }
                                })();
                                
                                return (
                                  <TableRow key={order.id}>
                                    <TableCell>{order.poNumber}</TableCell>
                                    <TableCell>
                                      <Chip 
                                        label={statusText} 
                                        color={statusColor} 
                                        size="small" 
                                      />
                                    </TableCell>
                                    <TableCell align="right">
                                      {order.orderedQuantity} {order.unit}
                                    </TableCell>
                                    <TableCell align="right">
                                      {order.receivedQuantity} {order.unit}
                                    </TableCell>
                                    <TableCell align="right">
                                      {order.unitPrice && typeof order.unitPrice === 'number' ? `${order.unitPrice.toFixed(2)} EUR` : '-'}
                                    </TableCell>
                                    <TableCell>
                                      {order.orderDate ? new Date(order.orderDate).toLocaleDateString('pl-PL') : '-'}
                                    </TableCell>
                                    <TableCell>
                                      {order.expectedDeliveryDate ? new Date(order.expectedDeliveryDate).toLocaleDateString('pl-PL') : 'Nie określono'}
                                    </TableCell>
                                    <TableCell>
                                      {order.tempId || 'temp-' + order.id.substring(0, 8)}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      ) : (
                        <Typography variant="body2" color="textSecondary">
                          Brak oczekujących zamówień dla tego materiału
                        </Typography>
                      )}
                    </>
                  )}
                </Box>
                    
                <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
                  <Button 
                    variant="contained" 
                    color="primary"
                    size="small"
                    disabled={!isComplete || reservingMaterials || (isAlreadyReserved && reservationMethod !== 'manual')}
                    onClick={() => handleReserveMaterials(materialId)}
                  >
                    {isAlreadyReserved ? 'Zaktualizuj rezerwację' : 'Rezerwuj ten materiał'}
                  </Button>
                </Box>
              </AccordionDetails>
            </Accordion>
          );
        })}
      </Box>
    );
  };

  // Funkcja zwracająca nazwę użytkownika zamiast ID
  const getUserName = (userId) => {
    if (!userId) return 'System';
    
    // Jeśli mamy już nazwę użytkownika w stanie, użyj jej
    if (userNames[userId]) {
      return userNames[userId];
    }
    
    // Jeśli ID jest dłuższe niż 10 znaków, zwróć skróconą wersję
    if (userId.length > 10) {
      // Pobierz dane użytkownika asynchronicznie tylko raz
      if (!userNames[userId] && !userNames[`loading_${userId}`]) {
        // Oznacz jako ładujący, aby uniknąć wielokrotnych wywołań
        setUserNames(prev => ({
          ...prev,
          [`loading_${userId}`]: true
        }));
        
        getUsersDisplayNames([userId]).then(names => {
          if (names && names[userId]) {
            setUserNames(prev => {
              const newState = { ...prev };
              delete newState[`loading_${userId}`]; // Usuń flagę ładowania
              newState[userId] = names[userId];
              return newState;
            });
          }
        }).catch(error => {
          console.error('Błąd podczas pobierania nazwy użytkownika:', error);
          setUserNames(prev => {
            const newState = { ...prev };
            delete newState[`loading_${userId}`]; // Usuń flagę ładowania
            return newState;
          });
        });
      }
      
      // Tymczasowo zwróć skróconą wersję ID
      return `${userId.substring(0, 5)}...${userId.substring(userId.length - 4)}`;
    }
    
    return userId;
  };

  // Dodaj funkcję do generowania i pobierania raportu materiałów i LOT-ów
  const handlePrintMaterialsAndLots = async () => {
    if (!task) return;
    
    try {
      const report = await generateMaterialsAndLotsReport(id);
      
      // Formatowanie daty dla wydruku
      const formatDate = (dateString) => {
        if (!dateString) return 'Nie określono';
        const date = new Date(dateString);
        return date.toLocaleDateString('pl-PL', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });
      };
      
      // HTML do wydruku
      const printContents = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Rozpiska materiałów - MO ${task.moNumber}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 20px;
              line-height: 1.5;
            }
            h1, h2, h3 {
              margin-top: 20px;
              margin-bottom: 10px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 20px;
            }
            th, td {
              border: 1px solid #ddd;
              padding: 8px;
              text-align: left;
            }
            th {
              background-color: #f2f2f2;
            }
            .header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 20px;
            }
            .section {
              margin-bottom: 30px;
            }
            .footer {
              margin-top: 50px;
              text-align: center;
              font-size: 12px;
              color: #666;
            }
            @media print {
              button {
                display: none;
              }
            }
            .reserved {
              background-color: #e8f5e9;
            }
            .not-reserved {
              background-color: #ffebee;
            }
            .excluded {
              text-decoration: line-through;
              color: #888;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1>Rozpiska materiałów</h1>
              <h2>MO: ${task.moNumber}</h2>
            </div>
            <div>
              <p><strong>Data:</strong> ${new Date().toLocaleDateString('pl-PL')}</p>
              <p><strong>Status:</strong> ${task.status}</p>
            </div>
          </div>
          
          <div class="section">
            <h3>Szczegóły zadania</h3>
            <table>
              <tr><th>Produkt:</th><td>${task.productName}</td></tr>
              <tr><th>Ilość:</th><td>${task.quantity} ${task.unit}</td></tr>
              <tr><th>Data rozpoczęcia:</th><td>${formatDate(task.scheduledDate)}</td></tr>
              <tr><th>Planowane zakończenie:</th><td>${formatDate(task.endDate)}</td></tr>
            </table>
          </div>
          
          <div class="section">
            <h3>Lista materiałów</h3>
            <table>
              <thead>
                <tr>
                  <th>Nazwa materiału</th>
                  <th>Ilość potrzebna</th>
                  <th>Jednostka</th>
                  <th>Cena jedn.</th>
                  <th>Koszt</th>
                  <th>Stan</th>
                  <th>Wliczany do kosztów</th>
                </tr>
              </thead>
              <tbody>
                ${report.materials.map(material => {
                  const isReserved = material.batches && material.batches.length > 0;
                  const isIncludedInCosts = includeInCosts[material.id] !== undefined ? includeInCosts[material.id] : true;
                  const rowClass = isReserved ? 'reserved' : 'not-reserved';
                  const nameClass = !isIncludedInCosts ? 'excluded' : '';
                  
                  return `
                  <tr class="${rowClass}">
                    <td class="${nameClass}">${material.name}</td>
                    <td>${material.quantity}</td>
                    <td>${material.unit || 'szt.'}</td>
                    <td>${material.unitPrice ? `${material.unitPrice.toFixed(4)} €` : '—'}</td>
                    <td>${material.cost ? `${material.cost.toFixed(2)} €` : '—'}</td>
                    <td>${material.available ? 'Dostępny' : 'Brak'}</td>
                    <td>${isIncludedInCosts ? 'Tak' : 'Nie'}</td>
                  </tr>
                  `;
                }).join('')}
                
                <tr>
                  <th colspan="4" style="text-align: right">Całkowity koszt materiałów:</th>
                  <th>${report.totalMaterialCost ? `${report.totalMaterialCost.toFixed(2)} €` : '—'}</th>
                  <th colspan="2"></th>
                </tr>
                <tr>
                  <th colspan="4" style="text-align: right">Koszt materiałów na jednostkę:</th>
                  <th>${report.unitMaterialCost ? `~${report.unitMaterialCost.toFixed(4)} €/${task.unit}` : '—'}</th>
                  <th colspan="2"></th>
                </tr>
              </tbody>
            </table>
          </div>
          
          <div class="section">
            <h3>Zarezerwowane partie (LOT)</h3>
            ${Object.keys(report.batches || {}).length === 0 ? 
              `<p>Brak zarezerwowanych partii</p>` : 
              `<table>
                <thead>
                  <tr>
                    <th>Materiał</th>
                    <th>Partia (LOT)</th>
                    <th>Ilość</th>
                    <th>Cena jedn.</th>
                    <th>Koszt</th>
                    <th>Data ważności</th>
                  </tr>
                </thead>
                <tbody>
                  ${Object.entries(report.batches || {}).map(([materialId, batches]) => {
                    const material = report.materials.find(m => m.id === materialId || m.inventoryItemId === materialId);
                    
                    return batches.map(batch => {
                      const batchCost = (batch.quantity || 0) * (batch.unitPrice || 0);
                      return `
                        <tr>
                          <td>${material ? material.name : 'Nieznany materiał'}</td>
                          <td>${batch.batchNumber}</td>
                          <td>${batch.quantity} ${material ? material.unit : 'szt.'}</td>
                          <td>${batch.unitPrice ? batch.unitPrice.toFixed(4) + ' €' : '—'}</td>
                          <td>${batchCost ? batchCost.toFixed(2) + ' €' : '—'}</td>
                          <td>${formatDate(batch.expiryDate)}</td>
                        </tr>
                      `;
                    }).join('');
                  }).join('')}
                </tbody>
              </table>`
            }
          </div>
          
          <div class="footer">
            <p>Wygenerowano: ${new Date().toLocaleString('pl-PL')}</p>
            <p>System MRP</p>
          </div>
          
          <div style="text-align: center; margin-top: 20px;">
            <button onclick="window.print()" style="padding: 10px 20px; background-color: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px;">
              Drukuj raport
            </button>
          </div>
        </body>
        </html>
      `;
      
      // Otwórz nowe okno z zawartością do wydruku
      const printWindow = window.open('', '_blank');
      printWindow.document.open();
      printWindow.document.write(printContents);
      printWindow.document.close();
    } catch (error) {
      console.error('Błąd podczas generowania raportu materiałów:', error);
      showError('Wystąpił błąd podczas generowania raportu materiałów');
    }
  };

  // Funkcja do pobierania dostępnych opakowań
  const fetchAvailablePackaging = async () => {
    try {
      setLoadingPackaging(true);
      
      // Pobierz wszystkie pozycje magazynowe z odpowiednią strukturą danych zawierającą stany magazynowe
      const result = await getAllInventoryItems();
      
      // Upewniamy się, że mamy dostęp do właściwych danych
      const allItems = Array.isArray(result) ? result : result.items || [];
      
      // Filtrujemy tylko opakowania (zarówno zbiorcze jak i jednostkowe)
      const packagingItems = allItems.filter(item => 
        item.category === 'Opakowania zbiorcze' || 
        item.category === 'Opakowania jednostkowe' || 
        item.category === 'Opakowania'
      );
      
      console.log('Pobrane opakowania:', packagingItems);
      
      setPackagingItems(packagingItems.map(item => ({
        ...item,
        selected: false,
        quantity: 0,
        // Używamy aktualnej ilości dostępnej w magazynie, a nie pierwotnej wartości
        availableQuantity: item.currentQuantity || item.quantity || 0,
        unitPrice: item.unitPrice || item.price || 0
      })));
    } catch (error) {
      console.error('Błąd podczas pobierania opakowań:', error);
      showError('Nie udało się pobrać listy opakowań: ' + error.message);
    } finally {
      setLoadingPackaging(false);
    }
  };
  
  // Obsługa otwierania dialogu opakowań
  const handleOpenPackagingDialog = () => {
    fetchAvailablePackaging();
    setPackagingDialogOpen(true);
  };
  
  // Obsługa zmiany ilości wybranego opakowania
  const handlePackagingQuantityChange = (id, value) => {
    setPackagingItems(prev => prev.map(item => {
      if (item.id === id) {
        // Ograniczamy wartość do dostępnej ilości
        const parsedValue = parseFloat(value) || 0;
        const limitedValue = Math.min(parsedValue, item.availableQuantity);
        
        return { 
          ...item, 
          quantity: limitedValue, 
          selected: limitedValue > 0 
        };
      }
      return item;
    }));
  };
  
  // Obsługa wyboru/odznaczenia opakowania
  const handlePackagingSelection = (id, selected) => {
    setPackagingItems(prev => prev.map(item => 
      item.id === id ? { ...item, selected } : item
    ));
  };
  
  // Dodanie wybranych opakowań do materiałów zadania
  const handleAddPackagingToTask = async () => {
    try {
      setLoadingPackaging(true);
      
      // Filtrujemy wybrane opakowania
      const packagingToAdd = packagingItems.filter(item => item.selected && item.quantity > 0);
      
      if (packagingToAdd.length === 0) {
        showError('Nie wybrano żadnych opakowań do dodania');
        return;
      }
      
      // Pobierz aktualne zadanie
      const updatedTask = await getTaskById(id);
      const currentMaterials = updatedTask.materials || [];
      
      // Przygotuj nowe materiały do dodania
      const newMaterials = packagingToAdd.map(item => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        inventoryItemId: item.id,
        isPackaging: true,
        category: item.category || 'Opakowania zbiorcze', // Zachowaj oryginalną kategorię lub ustaw domyślną
        unitPrice: item.unitPrice || 0
      }));
      
      // Połącz istniejące materiały z nowymi opakowaniami
      const updatedMaterials = [...currentMaterials];
      
      // Sprawdź czy dane opakowanie już istnieje i aktualizuj ilość lub dodaj nowe
      newMaterials.forEach(newMaterial => {
        const existingIndex = updatedMaterials.findIndex(m => m.id === newMaterial.id);
        if (existingIndex >= 0) {
          // Aktualizuj istniejące opakowanie
          updatedMaterials[existingIndex].quantity = 
            (parseFloat(updatedMaterials[existingIndex].quantity) || 0) + 
            (parseFloat(newMaterial.quantity) || 0);
        } else {
          // Dodaj nowe opakowanie
          updatedMaterials.push(newMaterial);
        }
      });
      
      // Zaktualizuj zadanie w bazie danych
      await updateDoc(doc(db, 'productionTasks', id), {
        materials: updatedMaterials,
        updatedAt: serverTimestamp()
      });
      
      // Odśwież dane zadania
      fetchTask();
      
      showSuccess('Opakowania zostały dodane do zadania produkcyjnego');
      setPackagingDialogOpen(false);
    } catch (error) {
      console.error('Błąd podczas dodawania opakowań:', error);
      showError('Nie udało się dodać opakowań do zadania: ' + error.message);
    } finally {
      setLoadingPackaging(false);
    }
  };

  // Funkcja do pobierania dostępnych surowców
  const fetchAvailableRawMaterials = async () => {
    try {
      setLoadingRawMaterials(true);
      
      // Pobierz wszystkie pozycje magazynowe z odpowiednią strukturą danych zawierającą stany magazynowe
      const result = await getAllInventoryItems();
      
      // Upewniamy się, że mamy dostęp do właściwych danych
      const allItems = Array.isArray(result) ? result : result.items || [];
      
      // Filtrujemy tylko surowce
      const rawMaterialsItems = allItems.filter(item => 
        item.category === 'Surowce'
      );
      
      console.log('Pobrane surowce:', rawMaterialsItems);
      
      setRawMaterialsItems(rawMaterialsItems.map(item => ({
        ...item,
        selected: false,
        quantity: 0,
        // Używamy aktualnej ilości dostępnej w magazynie, a nie pierwotnej wartości
        availableQuantity: item.currentQuantity || item.quantity || 0,
        unitPrice: item.unitPrice || item.price || 0
      })));
    } catch (error) {
      console.error('Błąd podczas pobierania surowców:', error);
      showError('Nie udało się pobrać listy surowców: ' + error.message);
    } finally {
      setLoadingRawMaterials(false);
    }
  };
  
  // Obsługa otwierania dialogu surowców
  const handleOpenRawMaterialsDialog = () => {
    fetchAvailableRawMaterials();
    setRawMaterialsDialogOpen(true);
  };
  
  // Obsługa zmiany ilości wybranego surowca
  const handleRawMaterialsQuantityChange = (id, value) => {
    setRawMaterialsItems(prev => prev.map(item => {
      if (item.id === id) {
        // Ograniczamy wartość do dostępnej ilości
        const parsedValue = parseFloat(value) || 0;
        const limitedValue = Math.min(parsedValue, item.availableQuantity);
        
        return { 
          ...item, 
          quantity: limitedValue, 
          selected: limitedValue > 0 
        };
      }
      return item;
    }));
  };
  
  // Obsługa wyboru/odznaczenia surowca
  const handleRawMaterialsSelection = (id, selected) => {
    setRawMaterialsItems(prev => prev.map(item => 
      item.id === id ? { ...item, selected } : item
    ));
  };
  
  // Dodanie wybranych surowców do materiałów zadania
  const handleAddRawMaterialsToTask = async () => {
    try {
      setLoadingRawMaterials(true);
      
      // Filtrujemy wybrane surowce
      const rawMaterialsToAdd = rawMaterialsItems.filter(item => item.selected && item.quantity > 0);
      
      if (rawMaterialsToAdd.length === 0) {
        showError('Nie wybrano żadnych surowców do dodania');
        return;
      }
      
      // Pobierz aktualne zadanie
      const updatedTask = await getTaskById(id);
      const currentMaterials = updatedTask.materials || [];
      
      // Przygotuj nowe materiały do dodania
      const newMaterials = rawMaterialsToAdd.map(item => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        inventoryItemId: item.id,
        isRawMaterial: true,
        category: item.category || 'Surowce',
        unitPrice: item.unitPrice || 0
      }));
      
      // Połącz istniejące materiały z nowymi surowcami
      const updatedMaterials = [...currentMaterials];
      
      // Sprawdź czy dany surowiec już istnieje i aktualizuj ilość lub dodaj nowy
      newMaterials.forEach(newMaterial => {
        const existingIndex = updatedMaterials.findIndex(m => m.id === newMaterial.id);
        if (existingIndex >= 0) {
          // Aktualizuj istniejący surowiec
          updatedMaterials[existingIndex].quantity = 
            (parseFloat(updatedMaterials[existingIndex].quantity) || 0) + 
            (parseFloat(newMaterial.quantity) || 0);
        } else {
          // Dodaj nowy surowiec
          updatedMaterials.push(newMaterial);
        }
      });
      
      // Zaktualizuj zadanie w bazie danych
      await updateDoc(doc(db, 'productionTasks', id), {
        materials: updatedMaterials,
        updatedAt: serverTimestamp()
      });
      
      // Odśwież dane zadania
      fetchTask();
      
      showSuccess('Surowce zostały dodane do zadania produkcyjnego');
      setRawMaterialsDialogOpen(false);
    } catch (error) {
      console.error('Błąd podczas dodawania surowców:', error);
      showError('Nie udało się dodać surowców do zadania: ' + error.message);
    } finally {
      setLoadingRawMaterials(false);
    }
  };

  // Funkcja obsługująca rozpoczęcie edycji sesji produkcyjnej
  const handleEditHistoryItem = (item) => {
    setEditingHistoryItem(item.id);
    setEditedHistoryItem({
      quantity: item.quantity || 0,
      startTime: item.startTime ? new Date(item.startTime) : new Date(),
      endTime: item.endTime ? new Date(item.endTime) : new Date(),
    });
  };

  // Funkcja zapisująca zmiany w sesji produkcyjnej
  const handleSaveHistoryItemEdit = async (historyItemId) => {
    try {
      setLoading(true);
      
      if (!historyItemId) {
        showError('Nie można edytować sesji produkcyjnej: brak identyfikatora');
        return;
      }
      
      // Walidacja danych
      if (editedHistoryItem.endTime < editedHistoryItem.startTime) {
        showError('Czas zakończenia nie może być wcześniejszy niż czas rozpoczęcia');
        return;
      }
      
      if (isNaN(editedHistoryItem.quantity) || editedHistoryItem.quantity < 0) {
        showError('Nieprawidłowa ilość');
        return;
      }
      
      // Obliczenie nowego czasu trwania w minutach
      const durationMs = editedHistoryItem.endTime.getTime() - editedHistoryItem.startTime.getTime();
      const durationMinutes = Math.round(durationMs / (1000 * 60));
      
      if (durationMinutes <= 0) {
        showError('Przedział czasowy musi być dłuższy niż 0 minut');
        return;
      }
      
      // Przygotuj dane do aktualizacji
      const updateData = {
        quantity: parseFloat(editedHistoryItem.quantity),
        timeSpent: durationMinutes,
        startTime: editedHistoryItem.startTime.toISOString(),
        endTime: editedHistoryItem.endTime.toISOString()
      };
      
      // Wywołaj funkcję aktualizującą sesję produkcyjną
      await updateProductionSession(historyItemId, updateData, currentUser.uid);
      
      showSuccess('Sesja produkcyjna została zaktualizowana');
      
      // Odśwież dane historii produkcji i zadania
      await fetchProductionHistory();
      await fetchTask();
      
      // Zresetuj stan edycji
      setEditingHistoryItem(null);
    } catch (error) {
      console.error('Błąd podczas aktualizacji sesji produkcyjnej:', error);
      showError('Nie udało się zaktualizować sesji produkcyjnej: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Funkcja anulująca edycję
  const handleCancelHistoryItemEdit = () => {
    setEditingHistoryItem(null);
  };

  // Funkcja do ręcznego dodawania sesji produkcyjnej
  const handleAddHistoryItem = async () => {
    try {
      setLoading(true);
      setHistoryInventoryError(null);
      
      // Walidacja danych
      if (editedHistoryItem.endTime < editedHistoryItem.startTime) {
        showError('Czas zakończenia nie może być wcześniejszy niż czas rozpoczęcia');
        return;
      }
      
      if (isNaN(editedHistoryItem.quantity) || editedHistoryItem.quantity <= 0) {
        showError('Nieprawidłowa ilość');
        return;
      }
      
      // Obliczenie czasu trwania w minutach
      const durationMs = editedHistoryItem.endTime.getTime() - editedHistoryItem.startTime.getTime();
      const durationMinutes = Math.round(durationMs / (1000 * 60));
      
      if (durationMinutes <= 0) {
        showError('Przedział czasowy musi być dłuższy niż 0 minut');
        return;
      }

      // Jeśli użytkownik wybrał opcję dodania do magazynu, waliduj dane magazynowe
      if (addToInventoryOnHistory) {
        if (!historyInventoryData.expiryDate) {
          setHistoryInventoryError('Podaj datę ważności produktu');
          return;
        }

        if (!historyInventoryData.lotNumber.trim()) {
          setHistoryInventoryError('Podaj numer partii (LOT)');
          return;
        }
        
        if (!historyInventoryData.warehouseId) {
          setHistoryInventoryError('Wybierz magazyn docelowy');
          return;
        }

        const inventoryQuantity = parseFloat(historyInventoryData.finalQuantity);
        if (isNaN(inventoryQuantity) || inventoryQuantity <= 0) {
          setHistoryInventoryError('Nieprawidłowa ilość końcowa');
          return;
        }
      }
      
      // Przygotuj dane do zapisania nowej sesji
      const sessionData = {
        quantity: parseFloat(editedHistoryItem.quantity),
        timeSpent: durationMinutes,
        startTime: editedHistoryItem.startTime.toISOString(),
        endTime: editedHistoryItem.endTime.toISOString(),
        userId: currentUser.uid
      };
      
      // Wywołaj funkcję dodającą nową sesję produkcyjną
      await addProductionSession(task.id, sessionData);
      
      // Jeśli użytkownik wybrał opcję dodania do magazynu, dodaj produkt do magazynu
      if (addToInventoryOnHistory) {
        try {
          const result = await addTaskProductToInventory(task.id, currentUser.uid, {
            expiryDate: historyInventoryData.expiryDate.toISOString(),
            lotNumber: historyInventoryData.lotNumber,
            finalQuantity: parseFloat(historyInventoryData.finalQuantity),
            warehouseId: historyInventoryData.warehouseId
          });
          
          showSuccess(`Sesja produkcyjna została dodana i ${result.message}`);
        } catch (inventoryError) {
          console.error('Błąd podczas dodawania produktu do magazynu:', inventoryError);
          showError('Sesja produkcyjna została dodana, ale wystąpił błąd podczas dodawania produktu do magazynu: ' + inventoryError.message);
        }
      } else {
        showSuccess('Sesja produkcyjna została dodana');
      }
      
      // Odśwież dane historii produkcji i zadania
      await fetchProductionHistory();
      await fetchTask();
      
      // Zamknij dialog i resetuj formularz
      setAddHistoryDialogOpen(false);
      setAddToInventoryOnHistory(true); // domyślnie włączone dla następnego użycia
      setHistoryInventoryData({
        expiryDate: null,
        lotNumber: '',
        finalQuantity: '',
        warehouseId: warehouses.length > 0 ? warehouses[0].id : ''
      });
      setHistoryInventoryError(null);
    } catch (error) {
      console.error('Błąd podczas dodawania sesji produkcyjnej:', error);
      showError('Nie udało się dodać sesji produkcyjnej: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Funkcja do drukowania szczegółów MO
  const handlePrintMODetails = () => {
    // Funkcja pomocnicza do formatowania dat
    const formatDateForPrint = (dateValue) => {
      if (!dateValue) return 'Nie określono';
      
      try {
        // Spróbuj różne formaty konwersji daty
        let date;
        if (dateValue instanceof Date) {
          date = dateValue;
        } else if (dateValue.toDate && typeof dateValue.toDate === 'function') {
          // Timestamp z Firebase
          date = dateValue.toDate();
        } else if (dateValue.seconds) {
          // Obiekt timestamp z sekundami
          date = new Date(dateValue.seconds * 1000);
        } else {
          // String lub inny format
          date = new Date(dateValue);
        }
        
        // Sprawdź czy data jest prawidłowa
        if (isNaN(date.getTime())) {
          return 'Nie określono';
        }
        
        // Formatuj datę do czytelnego formatu
        return date.toLocaleDateString('pl-PL', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      } catch (error) {
        console.error('Błąd konwersji daty:', error);
        return 'Nie określono';
      }
    };
    
    // Przygotuj zawartość do wydruku
    let printContents = `
      <html>
      <head>
        <title>Szczegóły MO: ${task.moNumber || ''}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { text-align: center; margin-bottom: 20px; border-bottom: 1px solid #ccc; padding-bottom: 10px; }
          h1 { margin-bottom: 5px; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; width: 30%; }
          .section { margin-top: 20px; }
          .footer { text-align: center; margin-top: 50px; font-size: 0.8em; border-top: 1px solid #ccc; padding-top: 10px; }
          .highlighted { background-color: #f9f9f9; border-left: 4px solid #2196F3; padding-left: 10px; }
          @media print {
            body { -webkit-print-color-adjust: exact; color-adjust: exact; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Szczegóły zlecenia produkcyjnego</h1>
          <h2>MO: ${task.moNumber || 'Nie określono'}</h2>
        </div>
        
        <div class="section">
          <h3>Informacje podstawowe</h3>
          <table>
            <tr><th>Nazwa zadania:</th><td>${task.name || 'Nie określono'}</td></tr>
            <tr><th>Produkt:</th><td>${task.productName || 'Nie określono'}</td></tr>
            <tr><th>Ilość:</th><td>${task.quantity || '0'} ${task.unit || 'szt.'}</td></tr>
            <tr><th>Status:</th><td>${task.status || 'Nie określono'}</td></tr>
            <tr><th>Priorytet:</th><td>${task.priority || 'Normalny'}</td></tr>
            ${(task.recipeName || task.recipe?.recipeName) ? `<tr><th>Receptura:</th><td>${task.recipeName || task.recipe?.recipeName}${task.recipeVersion ? ` (wersja ${task.recipeVersion})` : ''}</td></tr>` : ''}
          </table>
        </div>

        <div class="section highlighted">
          <h3>Informacje o partii produktu</h3>
          <table>
            <tr><th>Numer LOT:</th><td>${task.lotNumber || 'Nie określono'}</td></tr>
            <tr><th>Data ważności:</th><td>${task.expiryDate ? formatDateForPrint(task.expiryDate).split(',')[0] : 'Nie określono'}</td></tr>
          </table>
        </div>

        <div class="section">
          <h3>Harmonogram</h3>
          <table>
            <tr><th>Planowany start:</th><td>${formatDateForPrint(task.scheduledDate)}</td></tr>
            <tr><th>Planowane zakończenie:</th><td>${formatDateForPrint(task.endDate)}</td></tr>
            <tr><th>Szacowany czas produkcji:</th><td>${task.estimatedDuration ? (task.estimatedDuration / 60).toFixed(2) + ' godz.' : 'Nie określono'}</td></tr>
            <tr><th>Czas na jednostkę:</th><td>${task.productionTimePerUnit ? parseFloat(task.productionTimePerUnit).toFixed(2) + ' min./szt.' : 'Nie określono'}</td></tr>
          </table>
        </div>

        <div class="section">
          <h3>Materiały</h3>
          <table>
            <thead>
              <tr>
                <th>Nazwa</th>
                <th>Ilość planowana</th>
                <th>Ilość rzeczywista</th>
                <th>Jednostka</th>
              </tr>
            </thead>
            <tbody>
              ${materials.map(material => `
                <tr>
                  <td>${material.name || 'Nie określono'}</td>
                  <td>${material.quantity || 0}</td>
                  <td>${materialQuantities[material.id] || 0}</td>
                  <td>${material.unit || 'szt.'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        ${task.notes ? `
        <div class="section">
          <h3>Notatki</h3>
          <p>${task.notes}</p>
        </div>
        ` : ''}

        <div class="footer">
          <p>Data wydruku: ${new Date().toLocaleDateString('pl-PL', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}</p>
          <p>System MRP</p>
        </div>
        
        <div style="text-align: center; margin-top: 20px;">
          <button onclick="window.print()" style="padding: 10px 20px; background-color: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px;">
            Drukuj dokument
          </button>
        </div>
      </body>
      </html>
    `;
    
    // Otwórz nowe okno z zawartością do wydruku zamiast modyfikowania bieżącego dokumentu
    const printWindow = window.open('', '_blank');
    printWindow.document.open();
    printWindow.document.write(printContents);
    printWindow.document.close();
  };

  // Funkcja do pobierania aktualnych cen partii i aktualizacji cen materiałów
  const updateMaterialPricesFromBatches = useCallback(async () => {
    if (!task || !task.materialBatches) return;
    
    try {
      // Tworzymy kopię materiałów, aby je zaktualizować
      const updatedMaterials = [...materials];
      let hasChanges = false;
      
      // Dla każdego materiału z przypisanymi partiami, obliczamy aktualną cenę
      for (const material of updatedMaterials) {
        const materialId = material.inventoryItemId || material.id;
        const reservedBatches = task.materialBatches && task.materialBatches[materialId];
        
        if (reservedBatches && reservedBatches.length > 0) {
          let totalCost = 0;
          let totalQuantity = 0;
          
          // Pobierz aktualne dane każdej partii i oblicz średnią ważoną cenę
          for (const batchReservation of reservedBatches) {
            try {
              const batchData = await getInventoryBatch(batchReservation.batchId);
              if (batchData) {
                const batchQuantity = parseFloat(batchReservation.quantity) || 0;
                const batchUnitPrice = parseFloat(batchData.unitPrice) || 0;
                
                totalCost += batchQuantity * batchUnitPrice;
                totalQuantity += batchQuantity;
                
                console.log(`Batch ${batchData.batchNumber}: quantity=${batchQuantity}, unitPrice=${batchUnitPrice}`);
              }
            } catch (error) {
              console.error(`Błąd podczas pobierania danych partii ${batchReservation.batchId}:`, error);
            }
          }
          
          // Oblicz średnią ważoną cenę jednostkową
          if (totalQuantity > 0) {
            const averagePrice = totalCost / totalQuantity;
            // Sprawdź czy cena się zmieniła przed aktualizacją
            if (Math.abs(material.unitPrice - averagePrice) > 0.001) {
            material.unitPrice = averagePrice;
              hasChanges = true;
            console.log(`Zaktualizowano cenę dla ${material.name}: ${averagePrice.toFixed(2)} €`);
            }
          }
        }
      }
      
      // Aktualizuj stan materiałów tylko jeśli wykryto zmiany
      if (hasChanges) {
      setMaterials(updatedMaterials);
        
        // Tylko logowanie - NIE zapisujemy automatycznie do bazy danych
        if (task && updatedMaterials.length > 0) {
          // Oblicz całkowity koszt materiałów (tylko z flagą "wliczaj")
          const totalMaterialCost = updatedMaterials.reduce((sum, material) => {
            // Sprawdź czy dla tego materiału są zarezerwowane partie
            const materialId = material.inventoryItemId || material.id;
            const reservedBatches = task.materialBatches && task.materialBatches[materialId];
            
            // Uwzględnij koszt tylko jeśli materiał ma zarezerwowane partie i jest wliczany do kosztów
            if (reservedBatches && reservedBatches.length > 0 && includeInCosts[material.id]) {
              const quantity = materialQuantities[material.id] || material.quantity || 0;
              const unitPrice = material.unitPrice || 0;
              return sum + (quantity * unitPrice);
            }
            return sum;
          }, 0);
          
          // Oblicz pełny koszt produkcji (wszystkie materiały niezależnie od flagi "wliczaj")
          const totalFullProductionCost = updatedMaterials.reduce((sum, material) => {
            // Sprawdź czy dla tego materiału są zarezerwowane partie
            const materialId = material.inventoryItemId || material.id;
            const reservedBatches = task.materialBatches && task.materialBatches[materialId];
            
            // Uwzględnij koszt wszystkich materiałów z zarezerwowanymi partiami
            if (reservedBatches && reservedBatches.length > 0) {
              const quantity = materialQuantities[material.id] || material.quantity || 0;
              const unitPrice = material.unitPrice || 0;
              return sum + (quantity * unitPrice);
            }
            return sum;
          }, 0);
          
          // Oblicz koszty na jednostkę
          const unitMaterialCost = task.quantity ? (totalMaterialCost / task.quantity) : 0;
          const unitFullProductionCost = task.quantity ? (totalFullProductionCost / task.quantity) : 0;
          
          console.log(`Zaktualizowano ceny materiałów - obliczony koszt: ${totalMaterialCost.toFixed(2)} € (${unitMaterialCost.toFixed(2)} €/${task.unit}) | Pełny koszt: ${totalFullProductionCost.toFixed(2)} € (${unitFullProductionCost.toFixed(2)} €/${task.unit}) - tylko aktualizacja interfejsu`);
          
          // USUNIĘTO: Automatyczne zapisywanie do bazy danych
          // Użytkownik może ręcznie zaktualizować koszty przyciskiem "Aktualizuj ręcznie"
        }
      }
    } catch (error) {
      console.error('Błąd podczas aktualizacji cen materiałów:', error);
    }
  }, [task, materials, materialQuantities, id, currentUser, showSuccess, showError, includeInCosts, consumedBatchPrices]);
  
  // Aktualizuj ceny materiałów przy każdym załadowaniu zadania lub zmianie zarezerwowanych partii
  useEffect(() => {
    if (task && task.materialBatches) {
      // Używamy referencji do funkcji z pamięcią podręczną useCallback
      let isMounted = true;
      const updatePrices = async () => {
        if (isMounted) {
          await updateMaterialPricesFromBatches();
        }
      };
      
      updatePrices();
      
      return () => {
        isMounted = false;
      };
    }
  }, [task?.id, task?.materialBatches ? Object.keys(task.materialBatches).length : 0, updateMaterialPricesFromBatches]); // Uproszczone zależności

  // Funkcja do aktualizacji związanych zamówień klientów po zmianie kosztów produkcji
  const updateRelatedCustomerOrders = async (taskData, totalMaterialCost, totalFullProductionCost, unitMaterialCost, unitFullProductionCost) => {
    try {
      if (!taskData || !taskData.id) return;
      
      console.log(`Szukam zamówień klientów powiązanych z zadaniem ${taskData.moNumber}...`);
      console.log('Dane zadania przekazane do aktualizacji:', { 
        id: taskData.id, 
        moNumber: taskData.moNumber,
        totalMaterialCost,
        totalFullProductionCost 
      });
      
      // Importuj funkcje do zarządzania zamówieniami
      const { getAllOrders, updateOrder } = await import('../../services/orderService');
      const { calculateFullProductionUnitCost, calculateProductionUnitCost } = await import('../../utils/costCalculator');
      
      // Pobierz wszystkie zamówienia
      const allOrders = await getAllOrders();
      
      // Znajdź zamówienia, które mają pozycje powiązane z tym zadaniem produkcyjnym
      const relatedOrders = allOrders.filter(order => 
        order.items && order.items.some(item => item.productionTaskId === taskData.id)
      );
      
      if (relatedOrders.length === 0) {
        console.log('Nie znaleziono zamówień powiązanych z tym zadaniem');
        return;
      }
      
      console.log(`Znaleziono ${relatedOrders.length} zamówień do zaktualizowania`);
      
      // Dla każdego powiązanego zamówienia, zaktualizuj koszty produkcji
      for (const order of relatedOrders) {
        let orderUpdated = false;
        const updatedItems = [...order.items];
        
        for (let i = 0; i < updatedItems.length; i++) {
          const item = updatedItems[i];
          
          if (item.productionTaskId === taskData.id) {
            // Oblicz pełny koszt produkcji na jednostkę z uwzględnieniem logiki listy cenowej
            const calculatedFullProductionUnitCost = calculateFullProductionUnitCost(item, totalFullProductionCost);
            const calculatedProductionUnitCost = calculateProductionUnitCost(item, totalMaterialCost);
            
            // Zaktualizuj koszty w pozycji
            updatedItems[i] = {
              ...item,
              productionCost: totalMaterialCost,
              fullProductionCost: totalFullProductionCost,
              productionUnitCost: calculatedProductionUnitCost,
              fullProductionUnitCost: calculatedFullProductionUnitCost
            };
            orderUpdated = true;
            
            console.log(`Zaktualizowano pozycję "${item.name}" w zamówieniu ${order.orderNumber}: koszt produkcji=${totalMaterialCost}€, pełny koszt=${totalFullProductionCost}€, pełny koszt/szt=${calculatedFullProductionUnitCost.toFixed(2)}€ (lista cenowa: ${item.fromPriceList ? 'tak' : 'nie'})`);
          }
        }
        
        if (orderUpdated) {
          // Zaktualizuj zamówienie w bazie danych - przekaż tylko niezbędne pola
          const updateData = {
            items: updatedItems,
            // Zachowaj podstawowe pola wymagane przez walidację
            orderNumber: order.orderNumber,
            orderDate: order.orderDate, // Wymagane przez walidację
            status: order.status,
            totalValue: order.totalValue,
            // Inne pola które są bezpieczne
            customer: order.customer,
            shippingCost: order.shippingCost,
            additionalCostsItems: order.additionalCostsItems,
            productionTasks: order.productionTasks,
            linkedPurchaseOrders: order.linkedPurchaseOrders
          };
          
          console.log(`Aktualizuję zamówienie ${order.orderNumber} z danymi:`, {
            ...updateData,
            orderDate: updateData.orderDate ? 'obecna' : 'brak',
            itemsCount: updateData.items ? updateData.items.length : 0
          });
          console.log(`UserID do aktualizacji: ${currentUser?.uid || 'brak'}`);
          await updateOrder(order.id, updateData, currentUser?.uid || 'system');
          
          console.log(`Zaktualizowano zamówienie ${order.orderNumber}`);
        }
      }
      
      showInfo(`Zaktualizowano koszty produkcji w ${relatedOrders.length} powiązanych zamówieniach`);
      
    } catch (error) {
      console.error('Błąd podczas aktualizacji powiązanych zamówień:', error);
      showError('Nie udało się zaktualizować powiązanych zamówień: ' + error.message);
    }
  };

  // Funkcja do ręcznej aktualizacji kosztów materiałów w bazie danych
  const updateMaterialCostsManually = async () => {
    if (!task || !materials.length) return;
    
    try {
      // Oblicz koszty używając nowych funkcji
      const consumedCosts = calculateConsumedMaterialsCost();
      const reservedCosts = calculateReservedMaterialsCost();
      
      // Całkowity koszt materiałów = skonsumowane + zarezerwowane (ale nieskonsumowane)
      const totalMaterialCost = consumedCosts.totalCost + reservedCosts.totalCost;
      
      // Oblicz pełny koszt produkcji (wszystkie materiały niezależnie od flagi "wliczaj")
      const totalFullProductionCost = materials.reduce((sum, material) => {
        const materialId = material.inventoryItemId || material.id;
        
        // Koszty skonsumowanych materiałów dla tego materiału
        const consumedForMaterial = consumedCosts.details[materialId];
        let materialCost = consumedForMaterial ? consumedForMaterial.totalCost : 0;
        
        // Dodaj koszt zarezerwowanych (ale nieskonsumowanych) materiałów
        const reservedBatches = task.materialBatches && task.materialBatches[materialId];
        if (reservedBatches && reservedBatches.length > 0) {
          const consumedQuantity = getConsumedQuantityForMaterial(materialId);
          const requiredQuantity = materialQuantities[material.id] || material.quantity || 0;
          const remainingQuantity = Math.max(0, requiredQuantity - consumedQuantity);
          
          if (remainingQuantity > 0) {
          const unitPrice = material.unitPrice || 0;
            materialCost += remainingQuantity * unitPrice;
        }
        }
        
        return sum + materialCost;
      }, 0);
      
      // Oblicz koszty na jednostkę
      const unitMaterialCost = task.quantity ? (totalMaterialCost / task.quantity) : 0;
      const unitFullProductionCost = task.quantity ? (totalFullProductionCost / task.quantity) : 0;
      
      // Sprawdź czy koszty się rzeczywiście zmieniły
      if (
        Math.abs((task.totalMaterialCost || 0) - totalMaterialCost) <= 0.01 &&
        Math.abs((task.unitMaterialCost || 0) - unitMaterialCost) <= 0.01 &&
        Math.abs((task.totalFullProductionCost || 0) - totalFullProductionCost) <= 0.01 &&
        Math.abs((task.unitFullProductionCost || 0) - unitFullProductionCost) <= 0.01
      ) {
        showInfo('Koszty materiałów nie zmieniły się znacząco, pomijam aktualizację w bazie danych');
        return;
      }
      
      // Wykonaj aktualizację w bazie danych
      const taskRef = doc(db, 'productionTasks', id);
      await updateDoc(taskRef, {
        totalMaterialCost,
        unitMaterialCost,
        totalFullProductionCost,
        unitFullProductionCost,
        costLastUpdatedAt: serverTimestamp(),
        costLastUpdatedBy: currentUser.uid,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid,
        // Dodaj wpis do historii kosztów
        costHistory: arrayUnion({
          timestamp: new Date().toISOString(),
          userId: currentUser.uid,
          userName: currentUser.displayName || currentUser.email || 'System',
          previousTotalCost: task.totalMaterialCost || 0,
          newTotalCost: totalMaterialCost,
          previousUnitCost: task.unitMaterialCost || 0,
          newUnitCost: unitMaterialCost,
          previousFullProductionCost: task.totalFullProductionCost || 0,
          newFullProductionCost: totalFullProductionCost,
          previousUnitFullProductionCost: task.unitFullProductionCost || 0,
          newUnitFullProductionCost: unitFullProductionCost,
          reason: 'Ręczna aktualizacja kosztów materiałów (uwzględnia skonsumowane materiały)'
        })
      });
      
      console.log(`Zaktualizowano koszty materiałów w zadaniu: ${totalMaterialCost.toFixed(2)} € (${unitMaterialCost.toFixed(2)} €/${task.unit}) | Pełny koszt: ${totalFullProductionCost.toFixed(2)} € (${unitFullProductionCost.toFixed(2)} €/${task.unit})`);
      console.log(`Podział kosztów - Skonsumowane: ${consumedCosts.totalCost.toFixed(2)} €, Zarezerwowane: ${reservedCosts.totalCost.toFixed(2)} €`);
      showSuccess('Koszty materiałów zostały zaktualizowane w bazie danych');
      
      // Aktualizuj związane zamówienia klientów
      await updateRelatedCustomerOrders(task, totalMaterialCost, totalFullProductionCost, unitMaterialCost, unitFullProductionCost);
      
      // Odśwież dane zadania, aby wyświetlić zaktualizowane koszty
      const updatedTask = await getTaskById(id);
      setTask(updatedTask);
    } catch (error) {
      console.error('Błąd podczas aktualizacji kosztów materiałów:', error);
      showError('Nie udało się zaktualizować kosztów materiałów: ' + error.message);
    }
  };

  // Funkcja do obliczania kosztów skonsumowanych materiałów
  const calculateConsumedMaterialsCost = () => {
    if (!task?.consumedMaterials || task.consumedMaterials.length === 0) {
      return { totalCost: 0, details: [] };
    }

    const consumedCostDetails = {};
    let totalConsumedCost = 0;

    // Grupuj skonsumowane materiały według materialId
    task.consumedMaterials.forEach((consumed, index) => {
      const materialId = consumed.materialId;
      const material = materials.find(m => (m.inventoryItemId || m.id) === materialId);
      
      if (!material) return;

      if (!consumedCostDetails[materialId]) {
        consumedCostDetails[materialId] = {
          material,
          totalQuantity: 0,
          totalCost: 0,
          batches: []
        };
      }

      // Pobierz cenę partii ze skonsumowanych danych lub z aktualnej ceny materiału
      const batchPrice = consumedBatchPrices[consumed.batchId] || material.unitPrice || 0;
      const quantity = Number(consumed.quantity) || 0;
      const cost = quantity * batchPrice;

      consumedCostDetails[materialId].totalQuantity += quantity;
      consumedCostDetails[materialId].totalCost += cost;
      consumedCostDetails[materialId].batches.push({
        batchId: consumed.batchId,
        quantity,
        unitPrice: batchPrice,
        cost
      });

      // Sprawdź czy ta konkretna konsumpcja ma być wliczona do kosztów
      const shouldIncludeInCosts = consumed.includeInCosts !== undefined 
        ? consumed.includeInCosts 
        : (includeInCosts[material.id] !== false); // fallback do ustawienia materiału

      if (shouldIncludeInCosts) {
        totalConsumedCost += cost;
      }
    });

    return { totalCost: totalConsumedCost, details: consumedCostDetails };
  };

  // Funkcja do obliczania kosztów zarezerwowanych (ale nieskonsumowanych) materiałów
  const calculateReservedMaterialsCost = () => {
    if (!materials || materials.length === 0) {
      return { totalCost: 0, details: [] };
    }

    let totalReservedCost = 0;

    materials.forEach(material => {
      const materialId = material.inventoryItemId || material.id;
      const reservedBatches = task.materialBatches && task.materialBatches[materialId];
      
      // Sprawdź czy materiał ma zarezerwowane partie
      if (reservedBatches && reservedBatches.length > 0) {
        // Oblicz ile zostało do skonsumowania
        const consumedQuantity = getConsumedQuantityForMaterial(materialId);
        const requiredQuantity = materialQuantities[material.id] || material.quantity || 0;
        const remainingQuantity = Math.max(0, requiredQuantity - consumedQuantity);
        
        // Jeśli zostało coś do skonsumowania i materiał jest wliczany do kosztów
        if (remainingQuantity > 0 && includeInCosts[material.id] !== false) {
        const unitPrice = material.unitPrice || 0;
          const cost = remainingQuantity * unitPrice;
          totalReservedCost += cost;
        }
      }
    });

    return { totalCost: totalReservedCost };
  };

  const renderMaterialCostsSummary = () => {
    // Oblicz koszty skonsumowanych materiałów
    const consumedCosts = calculateConsumedMaterialsCost();
    
    // Oblicz koszty zarezerwowanych (ale nieskonsumowanych) materiałów
    const reservedCosts = calculateReservedMaterialsCost();
    
    // Całkowity koszt materiałów = skonsumowane + zarezerwowane (ale nieskonsumowane)
    const totalMaterialCost = consumedCosts.totalCost + reservedCosts.totalCost;
    
    // Oblicz pełny koszt produkcji (wszystkie materiały niezależnie od flagi "wliczaj")
    const totalFullProductionCost = materials.reduce((sum, material) => {
      const materialId = material.inventoryItemId || material.id;
      
      // Koszty skonsumowanych materiałów dla tego materiału
      const consumedForMaterial = consumedCosts.details[materialId];
      let materialCost = consumedForMaterial ? consumedForMaterial.totalCost : 0;
      
      // Dodaj koszt zarezerwowanych (ale nieskonsumowanych) materiałów
      const reservedBatches = task.materialBatches && task.materialBatches[materialId];
      if (reservedBatches && reservedBatches.length > 0) {
        const consumedQuantity = getConsumedQuantityForMaterial(materialId);
        const requiredQuantity = materialQuantities[material.id] || material.quantity || 0;
        const remainingQuantity = Math.max(0, requiredQuantity - consumedQuantity);
        
        if (remainingQuantity > 0) {
        const unitPrice = material.unitPrice || 0;
          materialCost += remainingQuantity * unitPrice;
      }
      }
      
      return sum + materialCost;
    }, 0);
    
    // Oblicz koszty na jednostkę
    const unitMaterialCost = task.quantity ? (totalMaterialCost / task.quantity) : 0;
    const unitFullProductionCost = task.quantity ? (totalFullProductionCost / task.quantity) : 0;
    
    // Sprawdź czy koszty uległy zmianie
    const costChanged = 
      Math.abs((task.totalMaterialCost || 0) - totalMaterialCost) > 0.01 ||
      Math.abs((task.unitMaterialCost || 0) - unitMaterialCost) > 0.01 ||
      Math.abs((task.totalFullProductionCost || 0) - totalFullProductionCost) > 0.01 ||
      Math.abs((task.unitFullProductionCost || 0) - unitFullProductionCost) > 0.01;
    
    return (
      <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Typography variant="h6">Podsumowanie kosztów materiałów</Typography>
            {costChanged && (
              <Alert severity="info" sx={{ mt: 1 }}>
                Obliczone koszty różnią się od zapisanych w bazie danych. Użyj przycisku "Aktualizuj ręcznie" aby zapisać nowe koszty.
              </Alert>
            )}
            {consumedCosts.totalCost > 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Skonsumowane: {consumedCosts.totalCost.toFixed(2)} € | 
                Zarezerwowane: {reservedCosts.totalCost.toFixed(2)} €
              </Typography>
            )}
          </Grid>
          <Grid item xs={12} md={6} sx={{ textAlign: 'right' }}>
            <Typography variant="body1">
              <strong>Całkowity koszt materiałów:</strong> {totalMaterialCost.toFixed(2)} €
              {task.totalMaterialCost !== undefined && costChanged && (
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  (W bazie: {task.totalMaterialCost.toFixed(2)} €)
                </Typography>
              )}
            </Typography>
            <Typography variant="body1">
              <strong>Koszt materiałów na jednostkę:</strong> ~{unitMaterialCost.toFixed(4)} €/{task.unit}
              {task.unitMaterialCost !== undefined && costChanged && (
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  (W bazie: ~{task.unitMaterialCost.toFixed(4)} €/{task.unit})
                </Typography>
              )}
            </Typography>
            <Typography variant="body1" sx={{ mt: 1, color: 'primary.main' }}>
              <strong>Pełny koszt produkcji:</strong> {totalFullProductionCost.toFixed(2)} €
              {task.totalFullProductionCost !== undefined && costChanged && (
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  (W bazie: {task.totalFullProductionCost.toFixed(2)} €)
                </Typography>
              )}
            </Typography>
            <Typography variant="body1" sx={{ color: 'primary.main' }}>
              <strong>Pełny koszt na jednostkę:</strong> ~{unitFullProductionCost.toFixed(4)} €/{task.unit}
              {task.unitFullProductionCost !== undefined && costChanged && (
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  (W bazie: ~{task.unitFullProductionCost.toFixed(4)} €/{task.unit})
                </Typography>
              )}
            </Typography>
            {costChanged && (
              <Button 
                variant="outlined" 
                color="primary" 
                startIcon={<SaveIcon />}
                onClick={updateMaterialCostsManually}
                sx={{ mt: 1 }}
                size="small"
              >
                Aktualizuj ręcznie
              </Button>
            )}
          </Grid>
        </Grid>
      </Box>
    );
  };

  // Funkcja do usuwania wpisu historii produkcji
  const handleDeleteHistoryItem = (item) => {
    setDeleteHistoryItem(item);
    setDeleteHistoryDialogOpen(true);
  };
  
  // Funkcja do obsługi potwierdzenia usunięcia
  const handleConfirmDeleteHistoryItem = async () => {
    try {
      setLoading(true);
      
      if (!deleteHistoryItem || !deleteHistoryItem.id) {
        showError('Nie można usunąć sesji produkcyjnej: brak identyfikatora');
        return;
      }
      
      // Wywołaj funkcję usuwającą sesję produkcyjną
      await deleteProductionSession(deleteHistoryItem.id, currentUser.uid);
      
      showSuccess('Sesja produkcyjna została usunięta');
      
      // Odśwież dane historii produkcji i zadania
      await fetchProductionHistory();
      await fetchTask();
      
    } catch (error) {
      console.error('Błąd podczas usuwania sesji produkcyjnej:', error);
      showError('Nie udało się usunąć sesji produkcyjnej: ' + error.message);
    } finally {
      setLoading(false);
      setDeleteHistoryDialogOpen(false);
      setDeleteHistoryItem(null);
    }
  };

  // Funkcja do filtrowania opakowań na podstawie wyszukiwania
  const filteredPackagingItems = packagingItems.filter(item => 
    item.name.toLowerCase().includes(searchPackaging.toLowerCase())
  );

  // Funkcja obsługująca zmianę stanu checkboxa dla wliczania do kosztów
  const handleIncludeInCostsChange = async (materialId, checked) => {
    try {
      // Aktualizujemy stan lokalnie
      setIncludeInCosts(prev => ({
        ...prev,
        [materialId]: checked
      }));
      
      // Aktualizacja w bazie danych
      if (task?.id) {
        const taskRef = doc(db, 'productionTasks', task.id);
        await updateDoc(taskRef, {
          [`materialInCosts.${materialId}`]: checked
        });
        
        showSuccess('Zaktualizowano ustawienia kosztów');
      }
    } catch (error) {
      console.error('Błąd podczas aktualizacji ustawień kosztów:', error);
      showError('Nie udało się zaktualizować ustawień kosztów');
    }
  };

  // Nowa funkcja do pobierania oczekiwanych zamówień dla materiałów
  const fetchAwaitingOrdersForMaterials = async () => {
    try {
      if (!task || !task.materials) return;
      setAwaitingOrdersLoading(true);
      
      const ordersData = {};
      
      for (const material of task.materials) {
        const materialId = material.inventoryItemId || material.id;
        if (!materialId) continue;
        
        try {
          const { getAwaitingOrdersForInventoryItem } = await import('../../services/inventoryService');
          const materialOrders = await getAwaitingOrdersForInventoryItem(materialId);
          
          if (materialOrders.length > 0) {
            ordersData[materialId] = materialOrders;
          } else {
            ordersData[materialId] = [];
          }
        } catch (error) {
          console.error(`Błąd podczas pobierania oczekiwanych zamówień dla materiału ${materialId}:`, error);
          ordersData[materialId] = [];
        }
      }
      
      setAwaitingOrders(ordersData);
    } catch (error) {
      console.error('Błąd podczas pobierania oczekiwanych zamówień dla materiałów:', error);
      showError('Nie udało się pobrać informacji o oczekiwanych zamówieniach');
    } finally {
      setAwaitingOrdersLoading(false);
    }
  };

  // Funkcja pomocnicza do formatowania daty
  const formatDateToLocal = (dateString) => {
    if (!dateString) return 'Nie określono';
    const date = new Date(dateString);
    return date.toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  // Funkcja obsługująca zmianę zakładki materiałów
  const handleMaterialTabChange = (event, newValue) => {
    setMaterialTab(newValue);
  };

  // Funkcja do obsługi zmiany ilości partii
  const handleBatchQuantityChange = (materialId, batchId, value) => {
    const numValue = value === '' ? '' : Number(value);
    if (value === '' || (!isNaN(numValue) && numValue >= 0)) {
      setManualBatchQuantities(prev => ({
        ...prev,
        [materialId]: {
          ...(prev[materialId] || {}),
          [batchId]: numValue
        }
      }));
    }
  };

  // Funkcja do pobierania odpowiedzi formularzy powiązanych z zadaniem
  const fetchFormResponses = async (moNumber) => {
    if (!moNumber) return;
    
    setLoadingFormResponses(true);
    try {
      // Pobieranie odpowiedzi dla formularza "Skończone MO"
      const completedMOQuery = query(
        collection(db, 'Forms/SkonczoneMO/Odpowiedzi'), 
        where('moNumber', '==', moNumber)
      );
      const completedMOSnapshot = await getDocs(completedMOQuery);
      const completedMOData = completedMOSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date?.toDate(),
        formType: 'completedMO'
      }));

      // Pobieranie odpowiedzi dla formularza "Kontrola Produkcji"
      const controlQuery = query(
        collection(db, 'Forms/KontrolaProdukcji/Odpowiedzi'), 
        where('manufacturingOrder', '==', moNumber)
      );
      const controlSnapshot = await getDocs(controlQuery);
      const controlData = controlSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        fillDate: doc.data().fillDate?.toDate(),
        productionStartDate: doc.data().productionStartDate?.toDate(),
        productionEndDate: doc.data().productionEndDate?.toDate(),
        readingDate: doc.data().readingDate?.toDate(),
        formType: 'productionControl'
      }));

      // Pobieranie odpowiedzi dla formularza "Zmiana Produkcji"
      const shiftQuery = query(
        collection(db, 'Forms/ZmianaProdukcji/Odpowiedzi'), 
        where('moNumber', '==', moNumber)
      );
      const shiftSnapshot = await getDocs(shiftQuery);
      const shiftData = shiftSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        fillDate: doc.data().fillDate?.toDate(),
        formType: 'productionShift'
      }));

      setFormResponses({
        completedMO: completedMOData,
        productionControl: controlData,
        productionShift: shiftData
      });
    } catch (error) {
      console.error('Błąd podczas pobierania odpowiedzi formularzy:', error);
    } finally {
      setLoadingFormResponses(false);
    }
  };

  const formatDateTime = (date) => {
    if (!date) return 'Nie określono';
    return date.toLocaleString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Funkcja pomocnicza do formatowania daty/czasu dla pola datetime-local
  const toLocalDateTimeString = (date) => {
    if (!date || !(date instanceof Date)) return '';
    
    // Tworzymy nową datę z czasem lokalnym
    const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
    return localDate.toISOString().slice(0, 16);
  };

  // Funkcja pomocnicza do parsowania datetime-local z uwzględnieniem strefy czasowej
  const fromLocalDateTimeString = (dateTimeString) => {
    // Sprawdź czy wartość nie jest undefined lub null
    if (!dateTimeString) {
      return new Date();
    }
    
    // Obsługa formatu ISO z datetime-local (YYYY-MM-DDTHH:MM)
    if (dateTimeString.includes('T')) {
      return new Date(dateTimeString);
    }
    
    // Obsługa starszego formatu z kropkami i spacją (DD.MM.YYYY HH:MM)
    if (dateTimeString.includes(' ')) {
      const [datePart, timePart] = dateTimeString.split(' ');
      const [day, month, year] = datePart.split('.');
      const [hours, minutes] = timePart.split(':');
      
      return new Date(year, month - 1, day, hours, minutes);
    }
    
    // Fallback - spróbuj parsować jako standardową datę
    return new Date(dateTimeString);
  };

  // Funkcja do filtrowania surowców na podstawie wyszukiwania
  const filteredRawMaterialsItems = rawMaterialsItems.filter(item => 
    item.name.toLowerCase().includes(searchRawMaterials.toLowerCase())
  );

  // Funkcja do obsługi usuwania materiału
  const handleDeleteMaterial = (material) => {
    setMaterialToDelete(material);
    setDeleteMaterialDialogOpen(true);
  };

  // Funkcja do potwierdzenia usunięcia materiału
  const handleConfirmDeleteMaterial = async () => {
    try {
      setLoading(true);
      
      if (!materialToDelete) {
        showError('Nie wybrano materiału do usunięcia');
        return;
      }
      
      // Pobierz aktualne zadanie
      const updatedTask = await getTaskById(id);
      const currentMaterials = updatedTask.materials || [];
      
      // Usuń materiał z listy
      const updatedMaterials = currentMaterials.filter(m => m.id !== materialToDelete.id);
      
      // Zaktualizuj zadanie w bazie danych
      await updateDoc(doc(db, 'productionTasks', id), {
        materials: updatedMaterials,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid
      });
      
      // Odśwież dane zadania
      fetchTask();
      
      showSuccess(`Materiał "${materialToDelete.name}" został usunięty z zadania`);
      setDeleteMaterialDialogOpen(false);
      setMaterialToDelete(null);
    } catch (error) {
      console.error('Błąd podczas usuwania materiału:', error);
      showError('Nie udało się usunąć materiału: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Funkcje obsługi konsumpcji materiałów
  const handleOpenConsumeMaterialsDialog = () => {
    // Przygotuj listę zarezerwowanych materiałów
    const reservedMaterials = materials.filter(material => {
      const materialId = material.inventoryItemId || material.id;
      const reservedBatches = task.materialBatches && task.materialBatches[materialId];
      return reservedBatches && reservedBatches.length > 0;
    });

    setConsumedMaterials(reservedMaterials);
    
    // Inicjalizuj ilości konsumpcji dla każdego materiału i partii
    const initialQuantities = {};
    const initialSelections = {};
    
    reservedMaterials.forEach(material => {
      const materialId = material.inventoryItemId || material.id;
      const reservedBatches = task.materialBatches[materialId] || [];
      
      // Inicjalizuj wybory partii (domyślnie wszystkie odznaczone)
      initialSelections[materialId] = {};
      
      reservedBatches.forEach(batch => {
        const batchKey = `${materialId}_${batch.batchId}`;
        initialQuantities[batchKey] = ''; // Domyślnie puste pole
        initialSelections[materialId][batch.batchId] = false; // Domyślnie odznaczone
      });
    });
    
    setConsumeQuantities(initialQuantities);
    setSelectedBatchesToConsume(initialSelections);
    setConsumeErrors({});
    setConsumeMaterialsDialogOpen(true);
  };

  const handleConsumeQuantityChange = (materialId, batchId, value) => {
    const batchKey = `${materialId}_${batchId}`;
    const numericValue = parseFloat(value);
    
    setConsumeQuantities(prev => ({
      ...prev,
      [batchKey]: isNaN(numericValue) ? 0 : numericValue
    }));
    
    // Wyczyść błędy dla tej partii
    setConsumeErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[batchKey];
      return newErrors;
    });
  };

  const handleBatchToConsumeSelection = (materialId, batchId, selected) => {
    setSelectedBatchesToConsume(prev => ({
      ...prev,
      [materialId]: {
        ...prev[materialId],
        [batchId]: selected
      }
    }));
  };

  const validateConsumeQuantities = () => {
    const errors = {};
    let isValid = true;

    Object.entries(selectedBatchesToConsume).forEach(([materialId, batches]) => {
      Object.entries(batches).forEach(([batchId, isSelected]) => {
        if (isSelected) {
          const batchKey = `${materialId}_${batchId}`;
          const quantity = consumeQuantities[batchKey];
          
          if (quantity === '' || quantity === null || quantity === undefined) {
            errors[batchKey] = 'Podaj ilość do konsumpcji';
            isValid = false;
          } else {
            const numericQuantity = Number(quantity);
            
            if (isNaN(numericQuantity)) {
              errors[batchKey] = 'Wartość musi być liczbą';
              isValid = false;
            } else if (numericQuantity <= 0) {
              errors[batchKey] = 'Wartość musi być większa od zera';
              isValid = false;
            } else {
              // Sprawdź czy ilość nie przekracza zarezerwowanej ilości
              const reservedBatches = task.materialBatches[materialId] || [];
              const batch = reservedBatches.find(b => b.batchId === batchId);
              
              if (batch && numericQuantity > batch.quantity) {
                errors[batchKey] = `Nie można skonsumować więcej niż zarezerwowano (${batch.quantity})`;
                isValid = false;
              }
            }
          }
        }
      });
    });

    setConsumeErrors(errors);
    return isValid;
  };

  const handleConfirmConsumeMaterials = async () => {
    try {
      if (!validateConsumeQuantities()) {
        return;
      }

      setLoading(true);

      // Przygotuj dane do aktualizacji stanów magazynowych
      const consumptionData = {};
      
      Object.entries(selectedBatchesToConsume).forEach(([materialId, batches]) => {
        Object.entries(batches).forEach(([batchId, isSelected]) => {
          if (isSelected) {
            const batchKey = `${materialId}_${batchId}`;
            const quantity = consumeQuantities[batchKey] || 0;
            
            if (quantity > 0) {
              if (!consumptionData[materialId]) {
                consumptionData[materialId] = [];
              }
              
              consumptionData[materialId].push({
                batchId,
                quantity,
                timestamp: new Date().toISOString(),
                userId: currentUser.uid
              });
            }
          }
        });
      });

      // Zaktualizuj stany magazynowe - zmniejsz ilości w wybranych partiach
      const { updateBatch } = await import('../../services/inventoryService');
      
      for (const [materialId, batches] of Object.entries(consumptionData)) {
        for (const batchData of batches) {
          try {
            // Pobierz aktualne dane partii
            const { getInventoryBatch } = await import('../../services/inventoryService');
            const currentBatch = await getInventoryBatch(batchData.batchId);
            
            if (currentBatch) {
              // Upewnij się, że wartości są liczbami
              const currentQuantity = Number(currentBatch.quantity) || 0;
              const consumeQuantity = Number(batchData.quantity) || 0;
              const newQuantity = Math.max(0, currentQuantity - consumeQuantity);
              
              console.log('Konsumpcja materiału:', {
                currentQuantity,
                consumeQuantity,
                newQuantity,
                batchId: batchData.batchId
              });
              
              await updateBatch(batchData.batchId, {
                quantity: newQuantity
              }, currentUser.uid);
            }
          } catch (error) {
            console.error(`Błąd podczas aktualizacji partii ${batchData.batchId}:`, error);
            showError(`Nie udało się zaktualizować partii ${batchData.batchId}: ${error.message}`);
          }
        }
      }

      // Aktualizuj rezerwacje - zmniejsz ilość zarezerwowaną o ilość skonsumowaną
      try {
        const { updateReservation } = await import('../../services/inventoryService');
        
        // Pobierz aktualne rezerwacje dla tego zadania
        const transactionsRef = collection(db, 'inventoryTransactions');
        
        for (const [materialId, batches] of Object.entries(consumptionData)) {
          for (const batchData of batches) {
            // Znajdź rezerwację dla tego materiału, partii i zadania
            // Najpierw spróbuj z active/pending statusem
            let reservationQuery = query(
              transactionsRef,
              where('type', '==', 'booking'),
              where('referenceId', '==', id),
              where('itemId', '==', materialId),
              where('batchId', '==', batchData.batchId),
              where('status', 'in', ['active', 'pending'])
            );
            
            let reservationSnapshot = await getDocs(reservationQuery);
            
            // Jeśli nie znaleziono rezerwacji z statusem, spróbuj bez filtra statusu
            if (reservationSnapshot.empty) {
              reservationQuery = query(
                transactionsRef,
                where('type', '==', 'booking'),
                where('referenceId', '==', id),
                where('itemId', '==', materialId),
                where('batchId', '==', batchData.batchId)
              );
              
              reservationSnapshot = await getDocs(reservationQuery);
            }
            
            if (!reservationSnapshot.empty) {
              // Weź pierwszą rezerwację (powinna być tylko jedna)
              const reservationDoc = reservationSnapshot.docs[0];
              const reservation = reservationDoc.data();
              const currentReservedQuantity = Number(reservation.quantity) || 0;
              const consumeQuantity = Number(batchData.quantity) || 0;
              const newReservedQuantity = Math.max(0, currentReservedQuantity - consumeQuantity);
              
              console.log('Aktualizacja rezerwacji:', {
                reservationId: reservationDoc.id,
                materialId,
                batchId: batchData.batchId,
                currentReservedQuantity,
                consumeQuantity,
                newReservedQuantity
              });
              
              if (newReservedQuantity > 0) {
                // Aktualizuj rezerwację z nową ilością
                await updateReservation(
                  reservationDoc.id,
                  materialId,
                  newReservedQuantity,
                  batchData.batchId,
                  currentUser.uid
                );
              } else {
                // Jeśli ilość rezerwacji spadła do 0, usuń rezerwację
                const { deleteReservation } = await import('../../services/inventoryService');
                await deleteReservation(reservationDoc.id, currentUser.uid);
              }
            } else {
              console.log(`Nie znaleziono rezerwacji dla materiału ${materialId}, partii ${batchData.batchId}`);
            }
          }
        }
      } catch (error) {
        console.error('Błąd podczas aktualizacji rezerwacji:', error);
        showError('Nie udało się zaktualizować rezerwacji: ' + error.message);
      }

      // Zaktualizuj dane w task.materialBatches - zmniejsz ilości zarezerwowanych partii
      const updatedMaterialBatches = { ...task.materialBatches };
      
      for (const [materialId, batches] of Object.entries(consumptionData)) {
        if (updatedMaterialBatches[materialId]) {
          for (const batchData of batches) {
            const batchIndex = updatedMaterialBatches[materialId].findIndex(
              batch => batch.batchId === batchData.batchId
            );
            
            if (batchIndex >= 0) {
              const currentReservedQuantity = Number(updatedMaterialBatches[materialId][batchIndex].quantity) || 0;
              const consumeQuantity = Number(batchData.quantity) || 0;
              const newReservedQuantity = Math.max(0, currentReservedQuantity - consumeQuantity);
              
              if (newReservedQuantity > 0) {
                // Zaktualizuj ilość zarezerwowaną
                updatedMaterialBatches[materialId][batchIndex].quantity = newReservedQuantity;
              } else {
                // Usuń partię z listy zarezerwowanych jeśli ilość spadła do 0
                updatedMaterialBatches[materialId].splice(batchIndex, 1);
              }
            }
          }
          
          // Jeśli dla materiału nie zostały żadne zarezerwowane partie, usuń cały klucz
          if (updatedMaterialBatches[materialId].length === 0) {
            delete updatedMaterialBatches[materialId];
          }
        }
      }

      // Zaktualizuj zadanie - dodaj informacje o skonsumowanych materiałach i zaktualizuj rezerwacje
      const currentConsumedMaterials = task.consumedMaterials || [];
      const newConsumedMaterials = [
        ...currentConsumedMaterials,
        ...Object.entries(consumptionData).flatMap(([materialId, batches]) => 
          batches.map(batch => {
            // Znajdź materiał aby ustawić domyślne includeInCosts i pobrać cenę
            const material = materials.find(m => (m.inventoryItemId || m.id) === materialId);
            const defaultIncludeInCosts = material ? (includeInCosts[material.id] !== false) : true;
            
            // Znajdź numer partii z task.materialBatches
            let batchNumber = batch.batchId; // fallback to ID
            let unitPrice = 0; // Domyślna cena
            
            if (task.materialBatches && task.materialBatches[materialId]) {
              const batchInfo = task.materialBatches[materialId].find(b => b.batchId === batch.batchId);
              console.log('Szukanie numeru partii dla konsumpcji:', {
                materialId,
                batchId: batch.batchId,
                materialBatches: task.materialBatches[materialId],
                foundBatchInfo: batchInfo
              });
              if (batchInfo && batchInfo.batchNumber) {
                batchNumber = batchInfo.batchNumber;
                console.log(`Znaleziono numer partii: ${batch.batchId} -> ${batchNumber}`);
              } else {
                console.log(`Nie znaleziono numeru partii dla ${batch.batchId}, używam ID jako fallback`);
              }
              
              // Pobierz cenę jednostkową partii
              if (batchInfo && batchInfo.unitPrice) {
                unitPrice = batchInfo.unitPrice;
                console.log(`Znaleziono cenę partii: ${batch.batchId} -> ${unitPrice} €`);
              } else {
                console.log(`Nie znaleziono ceny partii ${batch.batchId}, używam ceny materiału`);
              }
            } else {
              console.log(`Brak zarezerwowanych partii dla materiału ${materialId}`);
            }
            
            // Jeśli nie znaleziono ceny w partii, użyj ceny materiału
            if (unitPrice === 0 && material && material.unitPrice) {
              unitPrice = material.unitPrice;
              console.log(`Używam ceny materiału: ${materialId} -> ${unitPrice} €`);
            }
            
            console.log('Zapisywanie konsumpcji z numerem partii i ceną:', {
              materialId,
              batchId: batch.batchId,
              finalBatchNumber: batchNumber,
              quantity: batch.quantity,
              unitPrice: unitPrice
            });
            
            return {
              materialId,
              batchId: batch.batchId,
              batchNumber: batchNumber, // Zapisz numer partii
              quantity: batch.quantity,
              unitPrice: unitPrice, // Zapisz cenę jednostkową
              timestamp: batch.timestamp,
              userId: batch.userId,
              userName: currentUser.displayName || currentUser.email,
              includeInCosts: defaultIncludeInCosts
            };
          })
        )
      ];

      await updateDoc(doc(db, 'productionTasks', id), {
        consumedMaterials: newConsumedMaterials,
        materialBatches: updatedMaterialBatches,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid
      });

      showSuccess('Materiały zostały skonsumowane i rezerwacje zostały zaktualizowane');
      setConsumeMaterialsDialogOpen(false);
      
      // Odśwież dane zadania
      fetchTask();
      
    } catch (error) {
      console.error('Błąd podczas konsumpcji materiałów:', error);
      showError('Nie udało się skonsumować materiałów: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Funkcje obsługi korekty konsumpcji
  const handleEditConsumption = (consumption) => {
    setSelectedConsumption(consumption);
    setEditedQuantity(consumption.quantity);
    setEditConsumptionDialogOpen(true);
  };

  const handleConfirmEditConsumption = async () => {
    try {
      setLoading(true);

      if (!selectedConsumption) {
        showError('Nie wybrano konsumpcji do edycji');
        return;
      }

      if (!editedQuantity || editedQuantity <= 0) {
        showError('Podaj prawidłową ilość');
        return;
      }

      // Oblicz różnicę w ilości
      const quantityDifference = editedQuantity - selectedConsumption.quantity;

      // Aktualizuj stan magazynowy
      const { updateBatch } = await import('../../services/inventoryService');
      const { getInventoryBatch } = await import('../../services/inventoryService');
      
      const currentBatch = await getInventoryBatch(selectedConsumption.batchId);
      if (currentBatch) {
        // Upewnij się, że wartości są liczbami
        const currentQuantity = Number(currentBatch.quantity) || 0;
        const editedQty = Number(editedQuantity) || 0;
        const selectedQty = Number(selectedConsumption.quantity) || 0;
        const quantityDiff = editedQty - selectedQty;
        
        // Jeśli zwiększamy ilość konsumpcji (quantityDiff > 0), zmniejszamy stan magazynowy
        // Jeśli zmniejszamy ilość konsumpcji (quantityDiff < 0), zwiększamy stan magazynowy
        const newQuantity = Math.max(0, currentQuantity - quantityDiff);
        
        console.log('Edycja konsumpcji:', {
          currentQuantity,
          editedQty,
          selectedQty,
          quantityDiff,
          newQuantity,
          batchId: selectedConsumption.batchId
        });
        
        await updateBatch(selectedConsumption.batchId, {
          quantity: newQuantity
        }, currentUser.uid);
      }

      // Aktualizuj rezerwacje - skoryguj ilość zarezerwowaną
      try {
        const { updateReservation } = await import('../../services/inventoryService');
        const transactionsRef = collection(db, 'inventoryTransactions');
        
        // Znajdź rezerwację dla tego materiału, partii i zadania
        let reservationQuery = query(
          transactionsRef,
          where('type', '==', 'booking'),
          where('referenceId', '==', id),
          where('itemId', '==', selectedConsumption.materialId),
          where('batchId', '==', selectedConsumption.batchId),
          where('status', 'in', ['active', 'pending'])
        );
        
        let reservationSnapshot = await getDocs(reservationQuery);
        
        // Jeśli nie znaleziono rezerwacji z statusem, spróbuj bez filtra statusu
        if (reservationSnapshot.empty) {
          reservationQuery = query(
            transactionsRef,
            where('type', '==', 'booking'),
            where('referenceId', '==', id),
            where('itemId', '==', selectedConsumption.materialId),
            where('batchId', '==', selectedConsumption.batchId)
          );
          
          reservationSnapshot = await getDocs(reservationQuery);
        }
        
        if (!reservationSnapshot.empty) {
          const reservationDoc = reservationSnapshot.docs[0];
          const reservation = reservationDoc.data();
          const currentReservedQuantity = Number(reservation.quantity) || 0;
          const quantityDiff = editedQuantity - selectedConsumption.quantity;
          
          // Skoryguj rezerwację: jeśli zwiększamy konsumpcję, zmniejszamy rezerwację
          const newReservedQuantity = Math.max(0, currentReservedQuantity - quantityDiff);
          
          console.log('Korekta rezerwacji przy edycji:', {
            reservationId: reservationDoc.id,
            materialId: selectedConsumption.materialId,
            batchId: selectedConsumption.batchId,
            currentReservedQuantity,
            quantityDiff,
            newReservedQuantity
          });
          
          if (newReservedQuantity > 0) {
            await updateReservation(
              reservationDoc.id,
              selectedConsumption.materialId,
              newReservedQuantity,
              selectedConsumption.batchId,
              currentUser.uid
            );
          } else {
            const { deleteReservation } = await import('../../services/inventoryService');
            await deleteReservation(reservationDoc.id, currentUser.uid);
          }
        }
        
        // Zaktualizuj task.materialBatches
        const updatedMaterialBatches = { ...task.materialBatches };
        const materialId = selectedConsumption.materialId;
        
        if (updatedMaterialBatches[materialId]) {
          const batchIndex = updatedMaterialBatches[materialId].findIndex(
            batch => batch.batchId === selectedConsumption.batchId
          );
          
          if (batchIndex >= 0) {
            const currentReservedQuantity = Number(updatedMaterialBatches[materialId][batchIndex].quantity) || 0;
            const quantityDiff = editedQuantity - selectedConsumption.quantity;
            const newReservedQuantity = Math.max(0, currentReservedQuantity - quantityDiff);
            
            if (newReservedQuantity > 0) {
              updatedMaterialBatches[materialId][batchIndex].quantity = newReservedQuantity;
            } else {
              updatedMaterialBatches[materialId].splice(batchIndex, 1);
            }
            
            // Jeśli dla materiału nie zostały żadne zarezerwowane partie
            if (updatedMaterialBatches[materialId].length === 0) {
              delete updatedMaterialBatches[materialId];
            }
            
            // Zaktualizuj task.materialBatches w bazie danych
            await updateDoc(doc(db, 'productionTasks', id), {
              materialBatches: updatedMaterialBatches,
              updatedAt: serverTimestamp()
            });
          }
        }
        
      } catch (error) {
        console.error('Błąd podczas aktualizacji rezerwacji przy edycji:', error);
        showError('Nie udało się zaktualizować rezerwacji: ' + error.message);
      }

      // Aktualizuj listę skonsumowanych materiałów w zadaniu
      const updatedConsumedMaterials = task.consumedMaterials.map((consumed, index) => {
        if (index === task.consumedMaterials.indexOf(selectedConsumption)) {
          return {
            ...consumed,
            quantity: editedQuantity,
            editedAt: new Date().toISOString(),
            editedBy: currentUser.uid,
            editedByName: currentUser.displayName || currentUser.email
          };
        }
        return consumed;
      });

      // Zaktualizuj zadanie w bazie danych
      await updateDoc(doc(db, 'productionTasks', id), {
        consumedMaterials: updatedConsumedMaterials,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid
      });

      // Odśwież dane zadania
      await fetchTask();

      showSuccess('Konsumpcja materiału została zaktualizowana wraz z rezerwacjami');
      setEditConsumptionDialogOpen(false);
      setSelectedConsumption(null);
      setEditedQuantity(0);

    } catch (error) {
      console.error('Błąd podczas edycji konsumpcji:', error);
      showError('Nie udało się zaktualizować konsumpcji: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Funkcje obsługi usunięcia konsumpcji
  const handleDeleteConsumption = (consumption) => {
    setSelectedConsumption(consumption);
    setDeleteConsumptionDialogOpen(true);
  };

  const handleConfirmDeleteConsumption = async () => {
    try {
      setLoading(true);

      if (!selectedConsumption) {
        showError('Nie wybrano konsumpcji do usunięcia');
        return;
      }

      // Przywróć stan magazynowy
      const { updateBatch } = await import('../../services/inventoryService');
      const { getInventoryBatch } = await import('../../services/inventoryService');
      
      const currentBatch = await getInventoryBatch(selectedConsumption.batchId);
      if (currentBatch) {
        // Upewnij się, że wartości są liczbami
        const currentQuantity = Number(currentBatch.quantity) || 0;
        const consumedQuantity = Number(selectedConsumption.quantity) || 0;
        const newQuantity = currentQuantity + consumedQuantity;
        
        console.log('Przywracanie ilości:', {
          currentQuantity,
          consumedQuantity,
          newQuantity,
          batchId: selectedConsumption.batchId
        });
        
        await updateBatch(selectedConsumption.batchId, {
          quantity: newQuantity
        }, currentUser.uid);
      }

      // Przywróć rezerwację tylko jeśli użytkownik tego chce
      if (restoreReservation) {
        try {
          const { updateReservation, bookInventoryForTask } = await import('../../services/inventoryService');
          const transactionsRef = collection(db, 'inventoryTransactions');
          
          // Znajdź rezerwację dla tego materiału, partii i zadania
          let reservationQuery = query(
            transactionsRef,
            where('type', '==', 'booking'),
            where('referenceId', '==', id),
            where('itemId', '==', selectedConsumption.materialId),
            where('batchId', '==', selectedConsumption.batchId),
            where('status', 'in', ['active', 'pending'])
          );
          
          let reservationSnapshot = await getDocs(reservationQuery);
          
          // Jeśli nie znaleziono rezerwacji z statusem, spróbuj bez filtra statusu
          if (reservationSnapshot.empty) {
            reservationQuery = query(
              transactionsRef,
              where('type', '==', 'booking'),
              where('referenceId', '==', id),
              where('itemId', '==', selectedConsumption.materialId),
              where('batchId', '==', selectedConsumption.batchId)
            );
            
            reservationSnapshot = await getDocs(reservationQuery);
          }
          
          if (!reservationSnapshot.empty) {
            // Jeśli rezerwacja istnieje, zwiększ jej ilość
            const reservationDoc = reservationSnapshot.docs[0];
            const reservation = reservationDoc.data();
            const currentReservedQuantity = Number(reservation.quantity) || 0;
            const consumedQuantity = Number(selectedConsumption.quantity) || 0;
            const newReservedQuantity = currentReservedQuantity + consumedQuantity;
            
            console.log('Przywracanie rezerwacji:', {
              reservationId: reservationDoc.id,
              materialId: selectedConsumption.materialId,
              batchId: selectedConsumption.batchId,
              currentReservedQuantity,
              consumedQuantity,
              newReservedQuantity
            });
            
            await updateReservation(
              reservationDoc.id,
              selectedConsumption.materialId,
              newReservedQuantity,
              selectedConsumption.batchId,
              currentUser.uid
            );
          } else {
            // Jeśli rezerwacja nie istnieje, utwórz nową
            console.log('Tworzenie nowej rezerwacji po usunięciu konsumpcji:', {
              materialId: selectedConsumption.materialId,
              batchId: selectedConsumption.batchId,
              quantity: selectedConsumption.quantity
            });
            
            await bookInventoryForTask(
              selectedConsumption.materialId,
              selectedConsumption.quantity,
              id,
              currentUser.uid,
              'manual',
              selectedConsumption.batchId
            );
          }
          
          // Zaktualizuj task.materialBatches - przywróć ilość zarezerwowaną
          const updatedMaterialBatches = { ...task.materialBatches };
          const materialId = selectedConsumption.materialId;
          
          if (!updatedMaterialBatches[materialId]) {
            updatedMaterialBatches[materialId] = [];
          }
          
          const batchIndex = updatedMaterialBatches[materialId].findIndex(
            batch => batch.batchId === selectedConsumption.batchId
          );
          
          if (batchIndex >= 0) {
            // Jeśli partia istnieje, zwiększ jej ilość
            const currentReservedQuantity = Number(updatedMaterialBatches[materialId][batchIndex].quantity) || 0;
            const consumedQuantity = Number(selectedConsumption.quantity) || 0;
            updatedMaterialBatches[materialId][batchIndex].quantity = currentReservedQuantity + consumedQuantity;
          } else {
            // Jeśli partia nie istnieje, dodaj ją
            const { getInventoryBatch } = await import('../../services/inventoryService');
            const batchInfo = await getInventoryBatch(selectedConsumption.batchId);
            
            updatedMaterialBatches[materialId].push({
              batchId: selectedConsumption.batchId,
              quantity: selectedConsumption.quantity,
              batchNumber: batchInfo?.lotNumber || batchInfo?.batchNumber || 'Bez numeru'
            });
          }
          
          // Zaktualizuj task.materialBatches w bazie danych
          await updateDoc(doc(db, 'productionTasks', id), {
            materialBatches: updatedMaterialBatches,
            updatedAt: serverTimestamp()
          });
          
        } catch (error) {
          console.error('Błąd podczas przywracania rezerwacji:', error);
          showError('Nie udało się przywrócić rezerwacji: ' + error.message);
        }
      }

      // Usuń konsumpcję z listy
      const updatedConsumedMaterials = task.consumedMaterials.filter((consumed, index) => 
        index !== task.consumedMaterials.indexOf(selectedConsumption)
      );

      // Zaktualizuj zadanie w bazie danych
      await updateDoc(doc(db, 'productionTasks', id), {
        consumedMaterials: updatedConsumedMaterials,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid
      });

      // Odśwież dane zadania
      await fetchTask();

      const successMessage = restoreReservation 
        ? 'Konsumpcja materiału została usunięta i rezerwacja przywrócona'
        : 'Konsumpcja materiału została usunięta';
      showSuccess(successMessage);
      setDeleteConsumptionDialogOpen(false);
      setSelectedConsumption(null);
      setRestoreReservation(true); // Reset do domyślnej wartości

    } catch (error) {
      console.error('Błąd podczas usuwania konsumpcji:', error);
      showError('Nie udało się usunąć konsumpcji: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Funkcja do pobierania cen skonsumowanych partii
  const fetchConsumedBatchPrices = async () => {
    if (!task?.consumedMaterials || task.consumedMaterials.length === 0) {
      return;
    }

    try {
      const { getInventoryBatch } = await import('../../services/inventoryService');
      const batchPrices = {};
      let needsTaskUpdate = false;
      const updatedConsumedMaterials = [...task.consumedMaterials];

      for (let i = 0; i < task.consumedMaterials.length; i++) {
        const consumed = task.consumedMaterials[i];
        try {
          const batch = await getInventoryBatch(consumed.batchId);
          if (batch) {
            if (batch.unitPrice) {
              batchPrices[consumed.batchId] = batch.unitPrice;
            }
            
            // Jeśli konsumpcja nie ma zapisanego numeru partii, zaktualizuj go
            if (!consumed.batchNumber && (batch.lotNumber || batch.batchNumber)) {
              const newBatchNumber = batch.lotNumber || batch.batchNumber;
              console.log(`Aktualizuję numer partii dla konsumpcji ${i}: ${consumed.batchId} -> ${newBatchNumber}`);
              updatedConsumedMaterials[i] = {
                ...consumed,
                batchNumber: newBatchNumber
              };
              needsTaskUpdate = true;
            } else if (consumed.batchNumber === consumed.batchId && (batch.lotNumber || batch.batchNumber)) {
              // Sprawdź czy zapisany batchNumber to w rzeczywistości ID - wtedy też zaktualizuj
              const newBatchNumber = batch.lotNumber || batch.batchNumber;
              if (newBatchNumber !== consumed.batchNumber) {
                console.log(`Naprawiam błędny numer partii (ID jako numer): ${consumed.batchNumber} -> ${newBatchNumber}`);
                updatedConsumedMaterials[i] = {
                  ...consumed,
                  batchNumber: newBatchNumber
                };
                needsTaskUpdate = true;
              }
            } else {
              console.log(`Konsumpcja ${i} ma już poprawny numer partii:`, {
                batchId: consumed.batchId,
                savedBatchNumber: consumed.batchNumber,
                batchFromDB: {
                  lotNumber: batch.lotNumber,
                  batchNumber: batch.batchNumber
                }
              });
            }
          }
        } catch (error) {
          console.error(`Błąd podczas pobierania danych partii ${consumed.batchId}:`, error);
        }
      }

      setConsumedBatchPrices(batchPrices);
      
      // Jeśli trzeba zaktualizować dane zadania z numerami partii
      if (needsTaskUpdate) {
        try {
          await updateDoc(doc(db, 'productionTasks', id), {
            consumedMaterials: updatedConsumedMaterials,
            updatedAt: serverTimestamp()
          });
          
          // Zaktualizuj lokalny stan
          setTask(prevTask => ({
            ...prevTask,
            consumedMaterials: updatedConsumedMaterials
          }));
          
          console.log('Zaktualizowano numery partii w danych zadania');
        } catch (error) {
          console.error('Błąd podczas aktualizacji numerów partii:', error);
        }
      }
    } catch (error) {
      console.error('Błąd podczas pobierania cen skonsumowanych partii:', error);
    }
  };

  // Funkcja do obsługi zmian checkboxów "wliczaj do kosztów" dla skonsumowanych materiałów
  const handleConsumedIncludeInCostsChange = async (consumptionIndex, checked) => {
    try {
      setConsumedIncludeInCosts(prev => ({
        ...prev,
        [consumptionIndex]: checked
      }));

      // Zaktualizuj dane w zadaniu - dodaj informacje o wliczaniu do kosztów dla każdej konsumpcji
      const updatedConsumedMaterials = [...task.consumedMaterials];
      updatedConsumedMaterials[consumptionIndex] = {
        ...updatedConsumedMaterials[consumptionIndex],
        includeInCosts: checked
      };

      await updateDoc(doc(db, 'productionTasks', id), {
        consumedMaterials: updatedConsumedMaterials,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid
      });

      // Odśwież dane zadania aby przeliczył koszty
      await fetchTask();

      showSuccess(`Zmieniono ustawienie wliczania do kosztów dla skonsumowanego materiału`);
    } catch (error) {
      console.error('Błąd podczas zmiany ustawienia wliczania do kosztów:', error);
      showError('Nie udało się zmienić ustawienia: ' + error.message);
    }
  };

  // Funkcja do wzbogacenia danych skonsumowanych materiałów o informacje z partii
  const enrichConsumedMaterialsData = async (consumedMaterials) => {
    if (!consumedMaterials || consumedMaterials.length === 0) {
      return consumedMaterials;
    }

    const enrichedMaterials = await Promise.all(
      consumedMaterials.map(async (consumed) => {
        let enrichedConsumed = { ...consumed };

        // Pobierz dane z partii magazynowej jeśli brakuje informacji
        if (consumed.batchId && (!consumed.expiryDate || !consumed.materialName || !consumed.unit)) {
          try {
            const { getInventoryBatch } = await import('../../services/inventoryService');
            const batchData = await getInventoryBatch(consumed.batchId);
            
            if (batchData) {
              // Dodaj datę ważności jeśli nie ma
              if (!enrichedConsumed.expiryDate && batchData.expiryDate) {
                enrichedConsumed.expiryDate = batchData.expiryDate;
              }

              // Dodaj numer partii jeśli nie ma
              if (!enrichedConsumed.batchNumber && (batchData.lotNumber || batchData.batchNumber)) {
                enrichedConsumed.batchNumber = batchData.lotNumber || batchData.batchNumber;
              }

              // Pobierz nazwę materiału i jednostkę z pozycji magazynowej
              if (batchData.inventoryItemId && (!enrichedConsumed.materialName || !enrichedConsumed.unit)) {
                try {
                  const { getInventoryItemById } = await import('../../services/inventoryService');
                  const inventoryItem = await getInventoryItemById(batchData.inventoryItemId);
                  
                  if (inventoryItem) {
                    if (!enrichedConsumed.materialName) {
                      enrichedConsumed.materialName = inventoryItem.name;
                    }
                    if (!enrichedConsumed.unit) {
                      enrichedConsumed.unit = inventoryItem.unit;
                    }
                  }
                } catch (error) {
                  console.warn(`Nie udało się pobrać danych pozycji magazynowej ${batchData.inventoryItemId}:`, error);
                }
              }
            }
          } catch (error) {
            console.warn(`Nie udało się pobrać danych partii ${consumed.batchId}:`, error);
          }
        }

        return enrichedConsumed;
      })
    );

    return enrichedMaterials;
  };

  // Funkcja do pobierania załączników z PO dla składników
  const fetchIngredientAttachments = async () => {
    if (!task?.recipe?.ingredients || task.recipe.ingredients.length === 0) {
      return;
    }

    if (!task?.consumedMaterials || task.consumedMaterials.length === 0) {
      return;
    }

    try {
      const attachments = {};
      
      // Dla każdego składnika sprawdź czy można znaleźć odpowiadający mu skonsumowany materiał
      for (const ingredient of task.recipe.ingredients) {
        const ingredientAttachments = [];
        
        // Znajdź skonsumowane materiały o tej samej nazwie co składnik
        const matchingConsumedMaterials = task.consumedMaterials.filter(consumed => {
          // Znajdź materiał w liście materiałów zadania
          const material = materials.find(m => (m.inventoryItemId || m.id) === consumed.materialId);
          const materialName = consumed.materialName || material?.name || '';
          
          // Sprawdź czy nazwa materiału pasuje do nazwy składnika (case-insensitive)
          return materialName.toLowerCase().includes(ingredient.name.toLowerCase()) ||
                 ingredient.name.toLowerCase().includes(materialName.toLowerCase());
        });
        
        // Dla każdego pasującego skonsumowanego materiału pobierz załączniki z PO
        for (const consumed of matchingConsumedMaterials) {
          if (consumed.batchId) {
            try {
              // Pobierz dane partii magazynowej
              const { getInventoryBatch } = await import('../../services/inventoryService');
              const batchData = await getInventoryBatch(consumed.batchId);
              
              if (batchData && batchData.purchaseOrderDetails && batchData.purchaseOrderDetails.id) {
                // Pobierz pełne dane zamówienia zakupu
                const { getPurchaseOrderById } = await import('../../services/purchaseOrderService');
                const poData = await getPurchaseOrderById(batchData.purchaseOrderDetails.id);
                
                if (poData && poData.attachments && poData.attachments.length > 0) {
                  // Dodaj załączniki z informacją o źródle
                  const poAttachments = poData.attachments.map(attachment => ({
                    ...attachment,
                    poNumber: poData.number,
                    poId: poData.id,
                    lotNumber: consumed.batchNumber || batchData.lotNumber || batchData.batchNumber
                  }));
                  
                  ingredientAttachments.push(...poAttachments);
                }
              }
            } catch (error) {
              console.warn(`Nie udało się pobrać załączników dla partii ${consumed.batchId}:`, error);
            }
          }
        }
        
        // Usuń duplikaty załączników (po nazwie pliku)
        const uniqueAttachments = ingredientAttachments.filter((attachment, index, self) => 
          index === self.findIndex(a => a.fileName === attachment.fileName)
        );
        
        if (uniqueAttachments.length > 0) {
          attachments[ingredient.name] = uniqueAttachments;
        }
      }
      
      setIngredientAttachments(attachments);
      console.log('Pobrano załączniki dla składników:', attachments);
    } catch (error) {
      console.warn('Błąd podczas pobierania załączników składników:', error);
    }
  };

  // Funkcja do pobierania załączników badań klinicznych
  const fetchClinicalAttachments = async () => {
    if (!task?.id) return;
    
    try {
      // Pobierz obecne załączniki z zadania
      const taskRef = doc(db, 'productionTasks', task.id);
      const taskDoc = await getDoc(taskRef);
      
      if (taskDoc.exists()) {
        const taskData = taskDoc.data();
        setClinicalAttachments(taskData.clinicalAttachments || []);
      }
    } catch (error) {
      console.warn('Błąd podczas pobierania załączników badań klinicznych:', error);
    }
  };

  // Funkcja do przesyłania pliku badań klinicznych
  const uploadClinicalFile = async (file) => {
    try {
      // Walidacja pliku
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        throw new Error('Plik jest za duży. Maksymalny rozmiar to 10MB.');
      }

      // Dozwolone typy plików
      const allowedTypes = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/gif',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain'
      ];
      
      if (!allowedTypes.includes(file.type)) {
        throw new Error('Nieobsługiwany typ pliku. Dozwolone: PDF, JPG, PNG, GIF, DOC, DOCX, TXT');
      }

      const timestamp = new Date().getTime();
      const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileName = `${timestamp}_${sanitizedFileName}`;
      const storagePath = `clinical-research-attachments/${task.id}/${fileName}`;

      const fileRef = ref(storage, storagePath);
      await uploadBytes(fileRef, file);
      const downloadURL = await getDownloadURL(fileRef);

      return {
        id: `${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
        fileName: file.name,
        storagePath,
        downloadURL,
        contentType: file.type,
        size: file.size,
        uploadedAt: new Date().toISOString(),
        uploadedBy: currentUser?.uid
      };
    } catch (error) {
      console.error('Błąd podczas przesyłania pliku:', error);
      throw error;
    }
  };

  // Funkcja do obsługi wyboru plików
  const handleClinicalFileSelect = async (files) => {
    if (!files || files.length === 0) return;

    setUploadingClinical(true);
    const newAttachments = [...clinicalAttachments];

    try {
      for (const file of files) {
        try {
          const uploadedFile = await uploadClinicalFile(file);
          newAttachments.push(uploadedFile);
          showSuccess(`Plik "${file.name}" został przesłany pomyślnie`);
        } catch (error) {
          showError(`Błąd podczas przesyłania pliku "${file.name}": ${error.message}`);
        }
      }

      // Zapisz załączniki w bazie danych
      const taskRef = doc(db, 'productionTasks', task.id);
      await updateDoc(taskRef, {
        clinicalAttachments: newAttachments,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid
      });

      setClinicalAttachments(newAttachments);
    } finally {
      setUploadingClinical(false);
    }
  };

  // Funkcja do usuwania pliku
  const handleDeleteClinicalFile = async (attachment) => {
    try {
      const fileRef = ref(storage, attachment.storagePath);
      await deleteObject(fileRef);

      const updatedAttachments = clinicalAttachments.filter(a => a.id !== attachment.id);
      
      // Zaktualizuj bazę danych
      const taskRef = doc(db, 'productionTasks', task.id);
      await updateDoc(taskRef, {
        clinicalAttachments: updatedAttachments,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid
      });

      setClinicalAttachments(updatedAttachments);
      showSuccess(`Plik "${attachment.fileName}" został usunięty`);
    } catch (error) {
      console.error('Błąd podczas usuwania pliku:', error);
      showError(`Błąd podczas usuwania pliku: ${error.message}`);
    }
  };

  // Funkcja do pobierania pliku
  const handleDownloadClinicalFile = (attachment) => {
    window.open(attachment.downloadURL, '_blank');
  };

  // Funkcja do uzyskania ikony pliku
  const getClinicalFileIcon = (contentType) => {
    if (contentType.startsWith('image/')) {
      return <ImageIcon sx={{ color: 'primary.main' }} />;
    } else if (contentType === 'application/pdf') {
      return <PdfIcon sx={{ color: 'error.main' }} />;
    } else {
      return <DescriptionIcon sx={{ color: 'action.active' }} />;
    }
  };

  // Funkcja do formatowania rozmiaru pliku
  const formatClinicalFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Funkcja naprawy danych receptury dla starych zadań
  const handleFixRecipeData = async () => {
    if (!task?.recipeId) {
      showError('Brak ID receptury w zadaniu');
      return;
    }

    try {
      setFixingRecipeData(true);
      
      // Pobierz pełne dane receptury
      let recipeData = null;
      
      if (task.recipeVersion) {
        // Jeśli mamy wersję, pobierz konkretną wersję receptury
        try {
          const recipeVersion = await getRecipeVersion(task.recipeId, task.recipeVersion);
          recipeData = recipeVersion.data;
          console.log(`Pobrano dane wersji ${task.recipeVersion} receptury ${task.recipeId}`);
        } catch (error) {
          console.warn(`Nie udało się pobrać wersji ${task.recipeVersion}, próbuję pobrać aktualną recepturę:`, error);
          // Jeśli nie udało się pobrać konkretnej wersji, pobierz aktualną recepturę
          const { getRecipeById } = await import('../../services/recipeService');
          recipeData = await getRecipeById(task.recipeId);
          console.log('Pobrano aktualną wersję receptury');
        }
      } else {
        // Jeśli nie ma wersji, pobierz aktualną recepturę
        const { getRecipeById } = await import('../../services/recipeService');
        recipeData = await getRecipeById(task.recipeId);
        console.log('Pobrano aktualną recepturę (brak wersji w zadaniu)');
      }

      if (!recipeData) {
        throw new Error('Nie udało się pobrać danych receptury');
      }

      // Zaktualizuj zadanie w bazie danych z pełnymi danymi receptury
      const taskRef = doc(db, 'productionTasks', id);
      await updateDoc(taskRef, {
        recipe: recipeData,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid
      });

      // Zaktualizuj lokalny stan
      setTask(prevTask => ({
        ...prevTask,
        recipe: recipeData
      }));

      showSuccess('Dane receptury zostały pomyślnie naprawione! Sekcje składników i mikroelementów będą teraz dostępne.');
      console.log('Naprawiono dane receptury dla zadania:', id);

    } catch (error) {
      console.error('Błąd podczas naprawy danych receptury:', error);
      showError('Nie udało się naprawić danych receptury: ' + error.message);
    } finally {
      setFixingRecipeData(false);
    }
  };

  // Inicjalizacja stanu checkboxów dla skonsumowanych materiałów
  useEffect(() => {
    if (task?.consumedMaterials && materials.length > 0) {
      const consumedSettings = {};
      let hasChanges = false;
      
      task.consumedMaterials.forEach((consumed, index) => {
        // Sprawdź czy konsumpcja ma już ustawienie includeInCosts
        if (consumed.includeInCosts !== undefined) {
          consumedSettings[index] = consumed.includeInCosts;
        } else {
          // Jeśli nie ma, ustaw na podstawie ustawienia materiału
          const material = materials.find(m => 
            (m.inventoryItemId || m.id) === consumed.materialId
          );
          if (material) {
            const materialId = material.inventoryItemId || material.id;
            // Użyj ustawienia z includeInCosts lub domyślnie true
            consumedSettings[index] = includeInCosts[materialId] !== false;
          } else {
            consumedSettings[index] = true; // domyślnie true
          }
        }
        
        // Sprawdź czy to ustawienie się zmieniło
        if (consumedIncludeInCosts[index] !== consumedSettings[index]) {
          hasChanges = true;
        }
      });
      
      // Aktualizuj stan tylko jeśli są zmiany
      if (hasChanges || Object.keys(consumedIncludeInCosts).length === 0) {
        setConsumedIncludeInCosts(consumedSettings);
      }
    }
  }, [task?.consumedMaterials?.length, materials.length, includeInCosts]); // Kontrolowane zależności

  // Renderuj stronę
    return (
      <Container maxWidth="xl">
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      ) : task ? (
        <>
          {/* Pasek nawigacyjny i przyciski akcji (Edytuj, Usuń) - pozostaje na górze */}
          <Box sx={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            justifyContent: 'space-between',
            alignItems: isMobile ? 'flex-start' : 'center',
            mb: 3
          }}>
            <Button
              component={Link}
              to="/production"
              startIcon={<ArrowBackIcon />}
              sx={{ mb: isMobile ? 2 : 0 }}
            >
              Powrót do listy zadań
            </Button>

            <Box sx={{
              display: 'flex',
              flexDirection: isMobile ? 'row' : 'row',
              gap: 1,
              justifyContent: isMobile ? 'flex-start' : 'flex-end',
              width: isMobile ? '100%' : 'auto',
              mb: isMobile ? 2 : 0
            }}>
              <IconButton
                color="primary"
                component={Link}
                to={`/production/tasks/${id}/edit?returnTo=details`}
                title="Edytuj zadanie"
                sx={{ mr: isMobile ? 1 : 1 }}
              >
                <EditIcon />
              </IconButton>
              <IconButton
                color="error"
                onClick={() => setDeleteDialog(true)}
                title="Usuń zadanie"
              >
                <DeleteIcon />
              </IconButton>
            </Box>
          </Box>

          {/* Główne zakładki */}
          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
            <Tabs value={mainTab} onChange={handleMainTabChange} aria-label="Główne zakładki szczegółów zadania" variant="scrollable" scrollButtons="auto">
              <Tab label="Dane podstawowe" />
              <Tab label="Materiały i Koszty" />
              <Tab label="Produkcja i Plan" />
              <Tab label="Formularze" />
              <Tab label="Historia zmian" />
              <Tab label="Raport gotowego produktu" icon={<AssessmentIcon />} iconPosition="start" />
            </Tabs>
          </Box>

          {/* Zawartość zakładek */}
          {mainTab === 0 && ( // Zakładka "Dane podstawowe"
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Paper sx={{ p: 3 }}>
                  <Box sx={{
                    display: 'flex',
                    flexDirection: isMobile ? 'column' : 'row',
                    justifyContent: 'space-between',
                    alignItems: isMobile ? 'flex-start' : 'center',
                    mb: 2
                  }}>
                    <Typography variant="h5" component="h1" sx={{ mb: isMobile ? 2 : 0 }}>
                      {task.name}
                      <Chip label={task.moNumber || 'MO'} color="primary" size="small" sx={{ ml: 2 }} />
                      <Chip label={task.status} color={getStatusColor(task.status)} size="small" sx={{ ml: 1 }} />
                      <Chip label={task.priority} color={task.priority === 'Wysoki' ? 'error' : task.priority === 'Normalny' ? 'primary' : 'default'} variant="outlined" size="small" sx={{ ml: 1 }} />
                    </Typography>
                    <Box sx={{ width: isMobile ? '100%' : 'auto' }}>
                      {getStatusActions()}
                    </Box>
                  </Box>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}><Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>Produkt:</Typography><Typography variant="body1">{task.productName}</Typography></Grid>
                    <Grid item xs={12} md={6}><Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>Ilość:</Typography><Typography variant="body1">{task.quantity} {task.unit}</Typography></Grid>
                    {task.estimatedDuration > 0 && (<Grid item xs={12} md={6}><Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>Szacowany czas produkcji:</Typography><Typography variant="body1">{(task.estimatedDuration / 60).toFixed(1)} godz.</Typography></Grid>)}
                    {(task.recipe && task.recipe.recipeName) || (task.recipeId && task.recipeName) ? (
                      <Grid item xs={12} md={6}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>Receptura:</Typography>
                        <Typography variant="body1">
                          <Link to={`/recipes/${task.recipe?.recipeId || task.recipeId}`}>
                            {task.recipe?.recipeName || task.recipeName}
                            {task.recipeVersion && (
                              <Typography component="span" variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>
                                (wersja {task.recipeVersion})
                              </Typography>
                            )}
                          </Link>
                        </Typography>
                      </Grid>
                    ) : null}
                    <Grid item xs={12}><Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>Opis:</Typography><Typography variant="body1">{task.description || 'Brak opisu'}</Typography></Grid>
                  </Grid>
                </Paper>
              </Grid>
              <Grid item xs={12}>
                <TaskDetails task={task} />
              </Grid>
            </Grid>
          )}

          {mainTab === 1 && ( // Zakładka "Materiały i Koszty"
            <Grid container spacing={3}>
              {/* Sekcja skonsumowanych materiałów */}
              {task.consumedMaterials && task.consumedMaterials.length > 0 && (
                <Grid item xs={12}>
                  <Paper sx={{ p: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="h6" component="h2">Skonsumowane materiały</Typography>
                      {(() => {
                        const totalCompletedQuantity = task.totalCompletedQuantity || 0;
                        const remainingQuantity = Math.max(0, task.quantity - totalCompletedQuantity);
                        const isFullyProduced = remainingQuantity === 0;
                        if (isFullyProduced) {
                          const isConsumptionConfirmed = task.materialConsumptionConfirmed === true;
                          const buttonColor = isConsumptionConfirmed ? "success" : "info";
                          const buttonText = isConsumptionConfirmed ? "Zatwierdzona konsumpcja" : "Zarządzaj zużyciem";
                          return (<Button variant="outlined" color={buttonColor} startIcon={<BuildCircleIcon />} component={Link} to={`/production/consumption/${task.id}`} size="small">{buttonText}</Button>);
                        } return null;
                      })()}
                    </Box>
                    <TableContainer>
                      <Table size="small">
                        <TableHead><TableRow><TableCell>Materiał</TableCell><TableCell>Partia (LOT)</TableCell><TableCell>Skonsumowana ilość</TableCell><TableCell>Cena jedn.</TableCell><TableCell>Wliczaj</TableCell><TableCell>Data konsumpcji</TableCell><TableCell>Użytkownik</TableCell><TableCell>Akcje</TableCell></TableRow></TableHead>
                        <TableBody>
                          {task.consumedMaterials.map((consumed, index) => {
                            const material = materials.find(m => (m.inventoryItemId || m.id) === consumed.materialId);
                            let batchNumber = consumed.batchNumber || consumed.batchId;
                            let batch = null;
                            if (!consumed.batchNumber && task.materialBatches && task.materialBatches[consumed.materialId]) {
                              batch = task.materialBatches[consumed.materialId].find(b => b.batchId === consumed.batchId);
                              if (batch && batch.batchNumber) { batchNumber = batch.batchNumber; }
                            }
                            const batchPrice = consumedBatchPrices[consumed.batchId] || (batch && batch.unitPrice) || 0;
                            const materialId = material?.inventoryItemId || material?.id;
                            return (
                              <TableRow key={index}>
                                <TableCell>{material ? material.name : 'Nieznany materiał'}</TableCell>
                                <TableCell><Chip size="small" label={`${batchNumber} (${consumed.quantity} ${material ? material.unit : ''})`} color="info" variant="outlined" sx={{ cursor: 'pointer' }} onClick={() => navigate(`/inventory/${materialId}/batches`)} /></TableCell>
                                <TableCell>{consumed.quantity} {material ? material.unit : ''}</TableCell>
                                <TableCell>{batchPrice > 0 ? `${Number(batchPrice).toFixed(4)} €` : '—'}</TableCell>
                                <TableCell><Checkbox checked={consumedIncludeInCosts[index] || false} onChange={(e) => handleConsumedIncludeInCostsChange(index, e.target.checked)} color="primary" /></TableCell>
                                <TableCell>{new Date(consumed.timestamp).toLocaleString('pl')}</TableCell>
                                <TableCell>{consumed.userName || 'Nieznany użytkownik'}</TableCell>
                                <TableCell><Box sx={{ display: 'flex', gap: 1 }}><IconButton size="small" color="primary" onClick={() => handleEditConsumption(consumed)} title="Edytuj konsumpcję"><EditIcon /></IconButton><IconButton size="small" color="error" onClick={() => handleDeleteConsumption(consumed)} title="Usuń konsumpcję"><DeleteIcon /></IconButton></Box></TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Paper>
                </Grid>
              )}
              {/* Sekcja materiałów */}
              <Grid item xs={12}>
                <Paper sx={{ p: 3 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6" component="h2">Materiały</Typography>
                    <Box>
                      <Button variant="outlined" color="primary" startIcon={<PackagingIcon />} onClick={handleOpenPackagingDialog} sx={{ mt: 2, mb: 2, mr: 2 }}>Dodaj opakowania</Button>
                      <Button variant="outlined" color="secondary" startIcon={<RawMaterialsIcon />} onClick={handleOpenRawMaterialsDialog} sx={{ mt: 2, mb: 2, mr: 2 }}>Dodaj surowce</Button>
                      <Button variant="outlined" color="primary" startIcon={<BookmarkAddIcon />} onClick={() => setReserveDialogOpen(true)} sx={{ mt: 2, mb: 2, mr: 2 }}>Rezerwuj surowce</Button>
                      <Button variant="outlined" color="warning" startIcon={<InventoryIcon />} onClick={handleOpenConsumeMaterialsDialog} sx={{ mt: 2, mb: 2 }} disabled={!materials.some(material => { const materialId = material.inventoryItemId || material.id; const reservedBatches = task.materialBatches && task.materialBatches[materialId]; return reservedBatches && reservedBatches.length > 0; })}>Konsumuj materiały</Button>
                    </Box>
                  </Box>
                  <TableContainer>
                    <Table>
                      <TableHead><TableRow><TableCell>Nazwa</TableCell><TableCell>Ilość</TableCell><TableCell>Jednostka</TableCell><TableCell>Rzeczywista ilość</TableCell><TableCell>Ilość skonsumowana</TableCell><TableCell>Cena jedn.</TableCell><TableCell>Koszt</TableCell><TableCell>Zarezerwowane partie (LOT)</TableCell><TableCell>Wliczaj</TableCell><TableCell>Akcje</TableCell></TableRow></TableHead>
                      <TableBody>
                        {materials.map((material) => {
                          const materialId = material.inventoryItemId || material.id;
                          const reservedBatches = task.materialBatches && task.materialBatches[materialId];
                          const quantity = materialQuantities[material.id] || material.quantity || 0;
                          const unitPrice = material.unitPrice || 0;
                          const cost = quantity * unitPrice;
                          return (
                            <TableRow key={material.id}>
                              <TableCell>{material.name}</TableCell><TableCell>{material.quantity}</TableCell><TableCell>{material.unit}</TableCell>
                              <TableCell>{editMode ? (<TextField type="number" value={materialQuantities[material.id] || 0} onChange={(e) => handleQuantityChange(material.id, e.target.value)} error={Boolean(errors[material.id])} helperText={errors[material.id]} inputProps={{ min: 0, step: 'any' }} size="small" sx={{ width: '100px' }} />) : (materialQuantities[material.id] || 0)}</TableCell>
                              <TableCell>{(() => { const consumedQuantity = getConsumedQuantityForMaterial(materialId); return consumedQuantity > 0 ? `${consumedQuantity} ${material.unit}` : '—'; })()}</TableCell>
                              <TableCell>{reservedBatches && reservedBatches.length > 0 ? (unitPrice.toFixed(4) + ' €') : ('—')}</TableCell>
                              <TableCell>{reservedBatches && reservedBatches.length > 0 ? (cost.toFixed(2) + ' €') : ('—')}</TableCell>
                              <TableCell>{reservedBatches && reservedBatches.length > 0 ? (<Box>{reservedBatches.map((batch, index) => (<Chip key={index} size="small" label={`${batch.batchNumber} (${batch.quantity} ${material.unit})`} color="info" variant="outlined" sx={{ mr: 0.5, mb: 0.5, cursor: 'pointer' }} onClick={() => navigate(`/inventory/${materialId}/batches`)} />))}</Box>) : (<Typography variant="body2" color="text.secondary">Brak zarezerwowanych partii</Typography>)}</TableCell>
                              <TableCell><Checkbox checked={includeInCosts[material.id] || false} onChange={(e) => handleIncludeInCostsChange(material.id, e.target.checked)} color="primary" /></TableCell>
                              <TableCell>{editMode ? (<Box sx={{ display: 'flex' }}><IconButton color="primary" onClick={handleSaveChanges} title="Zapisz zmiany"><SaveIcon /></IconButton><IconButton color="error" onClick={() => setEditMode(false)} title="Anuluj edycję"><CancelIcon /></IconButton></Box>) : (<Box sx={{ display: 'flex' }}><IconButton color="primary" onClick={() => { setEditMode(true); setMaterialQuantities(prev => ({ ...prev, [material.id]: materialQuantities[material.id] || 0 })); }} title="Edytuj ilość"><EditIcon /></IconButton><IconButton color="error" onClick={() => handleDeleteMaterial(material)} title="Usuń materiał"><DeleteIcon /></IconButton></Box>)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  {renderMaterialCostsSummary()}
                </Paper>
              </Grid>
            </Grid>
          )}

          {mainTab === 2 && ( // Zakładka "Produkcja i Plan"
            <Grid container spacing={3}>
              {/* Sekcja historii produkcji */}
              <Grid item xs={12}>
                <Paper sx={{ p: 3 }}>
                  <Typography variant="h6" component="h2" gutterBottom>Historia produkcji</Typography>
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                    <Button variant="contained" color="primary" startIcon={<AddIcon />} onClick={() => { setEditedHistoryItem({ quantity: '', startTime: new Date(), endTime: new Date(), }); let expiryDate = null; if (task.expiryDate) { try { if (task.expiryDate instanceof Date) { expiryDate = task.expiryDate; } else if (task.expiryDate.toDate && typeof task.expiryDate.toDate === 'function') { expiryDate = task.expiryDate.toDate(); } else if (task.expiryDate.seconds) { expiryDate = new Date(task.expiryDate.seconds * 1000); } else if (typeof task.expiryDate === 'string') { expiryDate = new Date(task.expiryDate); } } catch (error) { console.error('Błąd konwersji daty ważności:', error); expiryDate = new Date(new Date().setFullYear(new Date().getFullYear() + 1)); } } else { expiryDate = new Date(new Date().setFullYear(new Date().getFullYear() + 1)); } setHistoryInventoryData({ expiryDate: expiryDate, lotNumber: task.lotNumber || `LOT-${task.moNumber || ''}`, finalQuantity: '', warehouseId: task.warehouseId || (warehouses.length > 0 ? warehouses[0].id : '') }); setAddHistoryDialogOpen(true); }} size="small">Dodaj wpis</Button>
                  </Box>
                  {productionHistory.length === 0 ? (<Typography variant="body2" color="text.secondary">Brak historii produkcji dla tego zadania</Typography>) : (
                    <TableContainer>
                      <Table><TableHead><TableRow><TableCell>Data rozpoczęcia</TableCell><TableCell>Data zakończenia</TableCell><TableCell>Czas trwania</TableCell><TableCell>Wyprodukowana ilość</TableCell><TableCell>Operator</TableCell><TableCell>Akcje</TableCell></TableRow></TableHead>
                        <TableBody>
                          {productionHistory.map((item) => (
                            <TableRow key={item.id}>
                              {editingHistoryItem === item.id ? (
                                <><TableCell><TextField type="datetime-local" value={editedHistoryItem.startTime instanceof Date ? toLocalDateTimeString(editedHistoryItem.startTime) : ''} onChange={(e) => { const newDate = e.target.value ? fromLocalDateTimeString(e.target.value) : new Date(); setEditedHistoryItem(prev => ({ ...prev, startTime: newDate })); }} InputLabelProps={{ shrink: true }} fullWidth required /></TableCell><TableCell><TextField type="datetime-local" value={editedHistoryItem.endTime instanceof Date ? toLocalDateTimeString(editedHistoryItem.endTime) : ''} onChange={(e) => { const newDate = e.target.value ? fromLocalDateTimeString(e.target.value) : new Date(); setEditedHistoryItem(prev => ({ ...prev, endTime: newDate })); }} InputLabelProps={{ shrink: true }} fullWidth required /></TableCell><TableCell>{Math.round((editedHistoryItem.endTime.getTime() - editedHistoryItem.startTime.getTime()) / (1000 * 60))} min</TableCell><TableCell><TextField type="number" value={editedHistoryItem.quantity} onChange={(e) => setEditedHistoryItem(prev => ({ ...prev, quantity: e.target.value === '' ? '' : parseFloat(e.target.value) }))} inputProps={{ min: 0, step: 'any' }} size="small" fullWidth /></TableCell><TableCell>{getUserName(item.userId)}</TableCell><TableCell><Box sx={{ display: 'flex' }}><IconButton color="primary" onClick={() => handleSaveHistoryItemEdit(item.id)} title="Zapisz zmiany"><SaveIcon /></IconButton><IconButton color="error" onClick={handleCancelHistoryItemEdit} title="Anuluj edycję"><CancelIcon /></IconButton></Box></TableCell></>
                              ) : (
                                <><TableCell>{item.startTime ? formatDateTime(item.startTime) : '-'}</TableCell><TableCell>{item.endTime ? formatDateTime(item.endTime) : '-'}</TableCell><TableCell>{item.timeSpent ? `${item.timeSpent} min` : '-'}</TableCell><TableCell>{item.quantity} {task.unit}</TableCell><TableCell>{getUserName(item.userId)}</TableCell><TableCell><IconButton color="primary" onClick={() => handleEditHistoryItem(item)} title="Edytuj sesję produkcyjną"><EditIcon /></IconButton><IconButton color="error" onClick={() => handleDeleteHistoryItem(item)} title="Usuń sesję produkcyjną"><DeleteIcon /></IconButton></TableCell></>
                              )}
                            </TableRow>
                          ))}
                          <TableRow sx={{ '& td': { fontWeight: 'bold', bgcolor: 'rgba(0, 0, 0, 0.04)' } }}><TableCell colSpan={2} align="right">Suma:</TableCell><TableCell>{productionHistory.reduce((sum, item) => sum + (item.timeSpent || 0), 0)} min</TableCell><TableCell>{formatQuantityPrecision(productionHistory.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0), 3)} {task.unit}</TableCell><TableCell colSpan={2}></TableCell></TableRow>
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Paper>
              </Grid>
              {/* Sekcja planu mieszań (checklista) */}
              {task?.mixingPlanChecklist && task.mixingPlanChecklist.length > 0 && (
                <Grid item xs={12}>
                  <Paper sx={{ p: 2, mb: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}><Typography variant="h6">Plan mieszań</Typography></Box>
                    <TableContainer>
                      <Table size="small"><TableHead><TableRow><TableCell width="25%">Mieszanie</TableCell><TableCell width="35%">Składniki</TableCell><TableCell width="40%" align="center">Status</TableCell></TableRow></TableHead>
                        <TableBody>
                          {task.mixingPlanChecklist.filter(item => item.type === 'header').map(headerItem => {
                            const ingredients = task.mixingPlanChecklist.filter(item => item.parentId === headerItem.id && item.type === 'ingredient');
                            const checkItems = task.mixingPlanChecklist.filter(item => item.parentId === headerItem.id && item.type === 'check');
                            return (
                              <TableRow key={headerItem.id} sx={{ '& td': { borderBottom: '1px solid rgba(224, 224, 224, 1)', verticalAlign: 'top', pt: 2, pb: 2 } }}>
                                <TableCell><Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>{headerItem.text}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{headerItem.details}</Typography></TableCell>
                                <TableCell><Table size="small" sx={{ '& td': { border: 'none', pt: 0.5, pb: 0.5 } }}><TableBody>{ingredients.map((ingredient) => (<TableRow key={ingredient.id}><TableCell sx={{ pl: 0 }}><Typography variant="body2">{ingredient.text}</Typography><Typography variant="caption" color="text.secondary">{ingredient.details}</Typography></TableCell></TableRow>))}</TableBody></Table></TableCell>
                                <TableCell align="center"><Grid container spacing={1} alignItems="center">{checkItems.map((item) => (<Grid item xs={12} key={item.id} sx={{ borderBottom: '1px solid rgba(224, 224, 224, 0.3)', pb: 1 }}><Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><FormControlLabel control={<Checkbox checked={item.completed || false} onChange={async (e) => { try { const taskRef = doc(db, 'productionTasks', task.id); const updatedChecklist = task.mixingPlanChecklist.map(checkItem => { if (checkItem.id === item.id) { return { ...checkItem, completed: e.target.checked, completedAt: e.target.checked ? new Date().toISOString() : null, completedBy: e.target.checked ? currentUser.uid : null }; } return checkItem; }); await updateDoc(taskRef, { mixingPlanChecklist: updatedChecklist, updatedAt: serverTimestamp(), updatedBy: currentUser.uid }); setTask(prevTask => ({ ...prevTask, mixingPlanChecklist: updatedChecklist })); showSuccess('Zaktualizowano stan zadania'); } catch (error) { console.error('Błąd podczas aktualizacji stanu checklisty:', error); showError('Nie udało się zaktualizować stanu zadania'); } }} />} label={item.text} sx={{ width: '100%' }} />{item.completed && (<Chip size="small" label={item.completedAt ? new Date(item.completedAt).toLocaleDateString('pl-PL') : '-'} color="success" variant="outlined" sx={{ ml: 1 }} />)}</Box></Grid>))}</Grid></TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  </Paper>
                </Grid>
              )}
            </Grid>
          )}

          {mainTab === 3 && ( // Zakładka "Formularze"
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Paper sx={{ p: 3 }}>
                  <Typography variant="h6" component="h2" gutterBottom>Formularze produkcyjne</Typography>
                  {loadingFormResponses ? (<Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress /></Box>) : (
                    <Box sx={{ width: '100%' }}>
                      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
                        <Tabs value={formTab || 0} onChange={(e, newValue) => setFormTab(newValue)} aria-label="Zakładki formularzy">
                          <Tab label={`Raporty zakończonych MO (${formResponses.completedMO.length})`} />
                          <Tab label={`Raporty kontroli produkcji (${formResponses.productionControl.length})`} />
                          <Tab label={`Raporty zmian produkcyjnych (${formResponses.productionShift.length})`} />
                        </Tabs>
                      </Box>
                      {formTab === 0 && (<>{formResponses.completedMO.length === 0 ? (<Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>Brak raportów zakończonych MO dla tego zadania.</Typography>) : (<TableContainer><Table size="small"><TableHead><TableRow><TableCell>Data</TableCell><TableCell>Godzina</TableCell><TableCell>Email</TableCell><TableCell>Numer MO</TableCell><TableCell>Ilość produktu</TableCell><TableCell>Straty opakowania</TableCell><TableCell>Straty wieczka</TableCell><TableCell>Straty surowca</TableCell><TableCell>Raport mieszań</TableCell><TableCell>Akcje</TableCell></TableRow></TableHead><TableBody>{formResponses.completedMO.map((form) => (<TableRow key={form.id}><TableCell>{form.date ? format(new Date(form.date), 'dd.MM.yyyy') : '-'}</TableCell><TableCell>{form.time || (form.date ? format(new Date(form.date), 'HH:mm') : '-')}</TableCell><TableCell>{form.email || '-'}</TableCell><TableCell>{form.moNumber || '-'}</TableCell><TableCell>{form.productQuantity || '-'}</TableCell><TableCell>{form.packagingLoss || '-'}</TableCell><TableCell>{form.bulkLoss || '-'}</TableCell><TableCell>{form.rawMaterialLoss || '-'}</TableCell><TableCell>{form.mixingPlanReportUrl ? (<IconButton size="small" color="primary" component="a" href={form.mixingPlanReportUrl} target="_blank" title="Otwórz raport"><VisibilityIcon fontSize="small" /></IconButton>) : '-'}</TableCell><TableCell><IconButton size="small" color="primary" component={Link} to={`/production/forms/completed-mo?edit=true`} onClick={() => sessionStorage.setItem('editFormData', JSON.stringify(form))} title="Edytuj raport"><EditIcon fontSize="small" /></IconButton></TableCell></TableRow>))}</TableBody></Table></TableContainer>)}</>)}
                      {formTab === 1 && (<>{formResponses.productionControl.length === 0 ? (<Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>Brak raportów kontroli produkcji dla tego zadania.</Typography>) : (<TableContainer><Table size="small"><TableHead><TableRow><TableCell>Data wypełnienia</TableCell><TableCell>Email</TableCell><TableCell>Imię i nazwisko</TableCell><TableCell>Stanowisko</TableCell><TableCell>Produkt</TableCell><TableCell>Nr LOT</TableCell><TableCell>Data produkcji</TableCell><TableCell>Godzina rozpoczęcia</TableCell><TableCell>Data zakończenia</TableCell><TableCell>Godzina zakończenia</TableCell><TableCell>Data ważności</TableCell><TableCell>Ilość</TableCell><TableCell>Numer zmiany</TableCell><TableCell>Temperatura</TableCell><TableCell>Wilgotność</TableCell><TableCell>Stan surowca</TableCell><TableCell>Stan opakowania</TableCell><TableCell>Zamknięcie opakowania</TableCell><TableCell>Ilość opakowań</TableCell><TableCell>Zamówienie klienta</TableCell><TableCell>Skany dokumentów</TableCell><TableCell>Zdjęcie produktu 1</TableCell><TableCell>Zdjęcie produktu 2</TableCell><TableCell>Zdjęcie produktu 3</TableCell><TableCell>Akcje</TableCell></TableRow></TableHead><TableBody>{formResponses.productionControl.map((form) => (<TableRow key={form.id}><TableCell>{form.fillDate ? format(new Date(form.fillDate), 'dd.MM.yyyy HH:mm') : '-'}</TableCell><TableCell>{form.email || '-'}</TableCell><TableCell>{form.name || '-'}</TableCell><TableCell>{form.position || '-'}</TableCell><TableCell>{form.productName || '-'}</TableCell><TableCell>{form.lotNumber || '-'}</TableCell><TableCell>{form.productionStartDate ? format(new Date(form.productionStartDate), 'dd.MM.yyyy') : '-'}</TableCell><TableCell>{form.productionStartTime || '-'}</TableCell><TableCell>{form.productionEndDate ? format(new Date(form.productionEndDate), 'dd.MM.yyyy') : '-'}</TableCell><TableCell>{form.productionEndTime || '-'}</TableCell><TableCell>{form.expiryDate || '-'}</TableCell><TableCell>{form.quantity || '-'}</TableCell><TableCell>{Array.isArray(form.shiftNumber) ? form.shiftNumber.join(', ') : form.shiftNumber || '-'}</TableCell><TableCell>{form.temperature || '-'}</TableCell><TableCell>{form.humidity || '-'}</TableCell><TableCell>{form.rawMaterialPurity || '-'}</TableCell><TableCell>{form.packagingPurity || '-'}</TableCell><TableCell>{form.packagingClosure || '-'}</TableCell><TableCell>{form.packagingQuantity || '-'}</TableCell><TableCell>{form.customerOrder || '-'}</TableCell><TableCell>{form.documentScanUrl ? (<IconButton size="small" color="primary" component="a" href={form.documentScanUrl} target="_blank" title="Otwórz skan dokumentu"><VisibilityIcon fontSize="small" /></IconButton>) : '-'}</TableCell><TableCell>{form.productPhoto1Url ? (<IconButton size="small" color="primary" component="a" href={form.productPhoto1Url} target="_blank" title="Otwórz zdjęcie produktu 1"><VisibilityIcon fontSize="small" /></IconButton>) : '-'}</TableCell><TableCell>{form.productPhoto2Url ? (<IconButton size="small" color="primary" component="a" href={form.productPhoto2Url} target="_blank" title="Otwórz zdjęcie produktu 2"><VisibilityIcon fontSize="small" /></IconButton>) : '-'}</TableCell><TableCell>{form.productPhoto3Url ? (<IconButton size="small" color="primary" component="a" href={form.productPhoto3Url} target="_blank" title="Otwórz zdjęcie produktu 3"><VisibilityIcon fontSize="small" /></IconButton>) : '-'}</TableCell><TableCell><IconButton size="small" color="primary" component={Link} to={`/production/forms/production-control?edit=true`} onClick={() => sessionStorage.setItem('editFormData', JSON.stringify(form))} title="Edytuj raport"><EditIcon fontSize="small" /></IconButton></TableCell></TableRow>))}</TableBody></Table></TableContainer>)}</>)}
                      {formTab === 2 && (<>{formResponses.productionShift.length === 0 ? (<Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>Brak raportów zmian produkcyjnych dla tego zadania.</Typography>) : (<TableContainer><Table size="small"><TableHead><TableRow><TableCell>Data wypełnienia</TableCell><TableCell>Email</TableCell><TableCell>Osoba odpowiedzialna</TableCell><TableCell>Typ zmiany</TableCell><TableCell>Ilość produkcji</TableCell><TableCell>Pracownicy</TableCell><TableCell>Nadruk 1</TableCell><TableCell>Ilość nadruku 1</TableCell><TableCell>Straty nadruku 1</TableCell><TableCell>Nadruk 2</TableCell><TableCell>Ilość nadruku 2</TableCell><TableCell>Straty nadruku 2</TableCell><TableCell>Nadruk 3</TableCell><TableCell>Ilość nadruku 3</TableCell><TableCell>Straty nadruku 3</TableCell><TableCell>Problemy maszyn</TableCell><TableCell>Inne aktywności</TableCell><TableCell>Akcje</TableCell></TableRow></TableHead><TableBody>{formResponses.productionShift.map((form) => (<TableRow key={form.id}><TableCell>{form.fillDate ? format(new Date(form.fillDate), 'dd.MM.yyyy') : '-'}</TableCell><TableCell>{form.email || '-'}</TableCell><TableCell>{form.responsiblePerson || '-'}</TableCell><TableCell>{form.shiftType || '-'}</TableCell><TableCell>{form.productionQuantity || '-'}</TableCell><TableCell>{form.shiftWorkers && form.shiftWorkers.length > 0 ? form.shiftWorkers.join(', ') : '-'}</TableCell><TableCell>{form.firstProduct !== 'BRAK' ? form.firstProduct : '-'}</TableCell><TableCell>{form.firstProductQuantity || '-'}</TableCell><TableCell>{form.firstProductLoss || '-'}</TableCell><TableCell>{form.secondProduct !== 'BRAK' ? form.secondProduct : '-'}</TableCell><TableCell>{form.secondProductQuantity || '-'}</TableCell><TableCell>{form.secondProductLoss || '-'}</TableCell><TableCell>{form.thirdProduct !== 'BRAK' ? form.thirdProduct : '-'}</TableCell><TableCell>{form.thirdProductQuantity || '-'}</TableCell><TableCell>{form.thirdProductLoss || '-'}</TableCell><TableCell>{form.machineIssues || '-'}</TableCell><TableCell>{form.otherActivities || '-'}</TableCell><TableCell><IconButton size="small" color="primary" component={Link} to={`/production/forms/production-shift?edit=true`} onClick={() => sessionStorage.setItem('editFormData', JSON.stringify(form))} title="Edytuj raport"><EditIcon fontSize="small" /></IconButton></TableCell></TableRow>))}</TableBody></Table></TableContainer>)}</>)}
                    </Box>
                  )}
                </Paper>
              </Grid>
            </Grid>
          )}

          {mainTab === 4 && ( // Zakładka "Historia zmian"
             <Grid container spacing={3}>
                {task.statusHistory && task.statusHistory.length > 0 && (
                  <Grid item xs={12}>
                    <Paper sx={{p:3}}> {/* Dodano Paper dla spójności */}
                      <Accordion defaultExpanded>
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography variant="h6" component="h2">Historia zmian statusu ({task.statusHistory.length})</Typography></AccordionSummary>
                        <AccordionDetails>
                          <TableContainer><Table size="small"><TableHead><TableRow><TableCell>Data i godzina</TableCell><TableCell>Poprzedni status</TableCell><TableCell>Nowy status</TableCell><TableCell>Kto zmienił</TableCell></TableRow></TableHead><TableBody>{[...task.statusHistory].reverse().map((change, index) => (<TableRow key={index}><TableCell>{change.changedAt ? new Date(change.changedAt).toLocaleString('pl') : 'Brak daty'}</TableCell><TableCell>{change.oldStatus}</TableCell><TableCell>{change.newStatus}</TableCell><TableCell>{getUserName(change.changedBy)}</TableCell></TableRow>))}</TableBody></Table></TableContainer>
                        </AccordionDetails>
                      </Accordion>
                    </Paper>
                  </Grid>
                )}
                {/* Tutaj można dodać inne sekcje administracyjne jeśli będą potrzebne */}
             </Grid>
          )}

          {mainTab === 5 && ( // Zakładka "Raport gotowego produktu"
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Paper sx={{ p: 3 }}>
                  <Typography variant="h6" component="h2" gutterBottom>
                    Raport gotowego produktu
                  </Typography>
                  
                  {/* Product identification */}
                  <Paper sx={{ p: 3, mb: 3, backgroundColor: '#f8f9fa' }} elevation={1}>
                    <Typography variant="h6" gutterBottom sx={{ color: 'primary.main', fontWeight: 'bold' }}>
                      1. Product identification
                    </Typography>
                    
                    <Grid container spacing={3}>
                      <Grid item xs={12} md={6}>
                        <TextField
                          fullWidth
                          label="SKU"
                          value={task?.recipeName || task?.productName || ''}
                          variant="outlined"
                          InputProps={{
                            readOnly: true,
                          }}
                          helperText="Nazwa receptury"
                        />
                      </Grid>
                      
                      <Grid item xs={12} md={6}>
                        <TextField
                          fullWidth
                          label="Description"
                          value={task?.recipe?.description || task?.description || ''}
                          variant="outlined"
                          multiline
                          maxRows={3}
                          InputProps={{
                            readOnly: true,
                          }}
                          helperText="Opis receptury"
                        />
                      </Grid>
                      
                      <Grid item xs={12} md={6}>
                        <TextField
                          fullWidth
                          label="Version"
                          value={task?.recipeVersion || '1'}
                          variant="outlined"
                          InputProps={{
                            readOnly: true,
                          }}
                          helperText="Wersja receptury"
                        />
                      </Grid>
                      
                      <Grid item xs={12} md={6}>
                        <TextField
                          fullWidth
                          label="Report creation date"
                          value={new Date().toLocaleDateString('pl-PL', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                          variant="outlined"
                          InputProps={{
                            readOnly: true,
                          }}
                          helperText="Data utworzenia raportu"
                        />
                      </Grid>
                      
                      <Grid item xs={12} md={6}>
                        <TextField
                          fullWidth
                          label="User"
                          value={currentUser?.displayName || currentUser?.email || 'Nieznany użytkownik'}
                          variant="outlined"
                          InputProps={{
                            readOnly: true,
                          }}
                          helperText="Nazwa użytkownika"
                        />
                      </Grid>
                    </Grid>
                  </Paper>
                  
                  {/* TDS Specification */}
                  <Paper sx={{ p: 3, mb: 3, backgroundColor: '#f8f9fa' }} elevation={1}>
                    <Typography variant="h6" gutterBottom sx={{ color: 'primary.main', fontWeight: 'bold' }}>
                      2. TDS Specification
                    </Typography>
                    
                    <Grid container spacing={3}>
                      {/* Microelements + Nutrition data */}
                      <Grid item xs={12}>
                        <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
                          Mikroelementy + Dane żywieniowe:
                        </Typography>
                        
                        {task?.recipe?.micronutrients && task.recipe.micronutrients.length > 0 ? (
                          <TableContainer component={Paper} sx={{ mt: 2 }}>
                            <Table size="small">
                              <TableHead>
                                <TableRow sx={{ backgroundColor: '#e3f2fd' }}>
                                  <TableCell sx={{ fontWeight: 'bold' }}>Kod</TableCell>
                                  <TableCell sx={{ fontWeight: 'bold' }}>Nazwa</TableCell>
                                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>Ilość</TableCell>
                                  <TableCell sx={{ fontWeight: 'bold' }}>Jednostka</TableCell>
                                  <TableCell sx={{ fontWeight: 'bold' }}>Kategoria</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {task.recipe.micronutrients.map((micronutrient, index) => (
                                  <TableRow key={index}>
                                    <TableCell sx={{ 
                                      fontWeight: 'bold', 
                                      color: micronutrient.category === 'Witaminy' ? 'success.main' : 
                                             micronutrient.category === 'Minerały' ? 'info.main' :
                                             micronutrient.category === 'Makroelementy' ? 'primary.main' :
                                             micronutrient.category === 'Energia' ? 'warning.main' :
                                             'text.primary'
                                    }}>
                                      {micronutrient.code}
                                    </TableCell>
                                    <TableCell>{micronutrient.name}</TableCell>
                                    <TableCell align="right">{micronutrient.quantity}</TableCell>
                                    <TableCell>{micronutrient.unit}</TableCell>
                                    <TableCell>
                                      <Chip 
                                        size="small" 
                                        color={
                                          micronutrient.category === 'Witaminy' ? 'success' :
                                          micronutrient.category === 'Minerały' ? 'info' :
                                          micronutrient.category === 'Makroelementy' ? 'primary' :
                                          micronutrient.category === 'Energia' ? 'warning' :
                                          'default'
                                        } 
                                        label={micronutrient.category} 
                                        sx={{ borderRadius: '16px' }}
                                      />
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableContainer>
                        ) : (
                          <Paper sx={{ p: 2, backgroundColor: '#fff3e0', border: '1px dashed #ffb74d' }}>
                            <Typography variant="body2" color="text.secondary" align="center">
                              Brak danych o mikroelementach w recepturze
                            </Typography>
                          </Paper>
                        )}
                      </Grid>
                      
                      {/* Date and Expiration Date */}
                      <Grid item xs={12} md={6}>
                        <TextField
                          fullWidth
                          label="Date"
                          value={task?.recipe?.updatedAt 
                            ? (task.recipe.updatedAt && typeof task.recipe.updatedAt === 'object' && typeof task.recipe.updatedAt.toDate === 'function'
                              ? task.recipe.updatedAt.toDate().toLocaleDateString('pl-PL', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric'
                                })
                              : new Date(task.recipe.updatedAt).toLocaleDateString('pl-PL', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric'
                                }))
                            : 'Brak danych'}
                          variant="outlined"
                          InputProps={{
                            readOnly: true,
                          }}
                          helperText="Ostatnia data aktualizacji receptury"
                        />
                      </Grid>
                      
                      <Grid item xs={12} md={6}>
                        <TextField
                          fullWidth
                          label="Expiration date"
                          value={task?.expiryDate 
                            ? (task.expiryDate instanceof Date 
                              ? task.expiryDate.toLocaleDateString('pl-PL', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric'
                                })
                              : typeof task.expiryDate === 'string'
                                ? new Date(task.expiryDate).toLocaleDateString('pl-PL', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric'
                                  })
                                : task.expiryDate && task.expiryDate.toDate
                                  ? task.expiryDate.toDate().toLocaleDateString('pl-PL', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      year: 'numeric'
                                    })
                                  : 'Nie określono')
                            : 'Nie określono'}
                          variant="outlined"
                          InputProps={{
                            readOnly: true,
                          }}
                          helperText="Data ważności gotowego produktu"
                        />
                      </Grid>
                    </Grid>
                  </Paper>
                  
                  {/* Active Ingredients */}
                  <Paper sx={{ p: 3, mb: 3, backgroundColor: '#f8f9fa' }} elevation={1}>
                    <Typography variant="h6" gutterBottom sx={{ color: 'primary.main', fontWeight: 'bold' }}>
                      3. Active Ingredients
                    </Typography>
                    
                    <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold', mt: 2 }}>
                      3.1 List of materials
                    </Typography>
                    
                    <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', color: 'text.secondary' }}>
                      Ingredients:
                    </Typography>
                    
                    {task?.recipe?.ingredients && task.recipe.ingredients.length > 0 ? (
                      <TableContainer component={Paper} sx={{ mt: 2 }}>
                        <Table size="small">
                          <TableHead>
                            <TableRow sx={{ backgroundColor: '#e8f5e8' }}>
                              <TableCell sx={{ fontWeight: 'bold' }}>Nazwa składnika</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 'bold' }}>Ilość</TableCell>
                              <TableCell sx={{ fontWeight: 'bold' }}>Jednostka</TableCell>
                              <TableCell sx={{ fontWeight: 'bold' }}>Numer CAS</TableCell>
                              <TableCell sx={{ fontWeight: 'bold' }}>Uwagi</TableCell>
                              <TableCell sx={{ fontWeight: 'bold' }}>Załączniki z PO</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {task.recipe.ingredients.map((ingredient, index) => (
                              <TableRow key={index} sx={{ '&:nth-of-type(even)': { backgroundColor: '#f9f9f9' } }}>
                                <TableCell sx={{ fontWeight: 'medium' }}>
                                  {ingredient.name}
                                </TableCell>
                                <TableCell align="right" sx={{ fontWeight: 'medium' }}>
                                  {ingredient.quantity}
                                </TableCell>
                                <TableCell>
                                  {ingredient.unit}
                                </TableCell>
                                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
                                  {ingredient.casNumber || '-'}
                                </TableCell>
                                <TableCell sx={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {ingredient.notes || '-'}
                                </TableCell>
                                <TableCell sx={{ minWidth: '200px' }}>
                                  {ingredientAttachments[ingredient.name] && ingredientAttachments[ingredient.name].length > 0 ? (
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                      {ingredientAttachments[ingredient.name].map((attachment, attachIndex) => (
                                        <Box key={attachIndex} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                          <Button
                                            size="small"
                                            variant="outlined"
                                            startIcon={<AttachFileIcon />}
                                            onClick={() => window.open(attachment.downloadURL || attachment.fileUrl, '_blank')}
                                            sx={{ 
                                              textTransform: 'none',
                                              fontSize: '0.75rem',
                                              minWidth: 'auto',
                                              flex: 1,
                                              justifyContent: 'flex-start'
                                            }}
                                          >
                                            {attachment.fileName}
                                          </Button>
                                          <Chip 
                                            size="small" 
                                            label={`PO: ${attachment.poNumber}`}
                                            variant="outlined"
                                            color="info"
                                            sx={{ fontSize: '0.65rem' }}
                                          />
                                        </Box>
                                      ))}
                                    </Box>
                                  ) : (
                                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                      Brak załączników
                                    </Typography>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        
                        {/* Podsumowanie składników */}
                        <Box sx={{ p: 2, backgroundColor: '#f0f8f0', borderTop: '1px solid #e0e0e0' }}>
                          <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                            Łączna liczba składników: {task.recipe.ingredients.length}
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            Składniki na {task.recipe.yield?.quantity || 1} {task.recipe.yield?.unit || 'szt.'} produktu
                          </Typography>
                        </Box>
                      </TableContainer>
                    ) : (
                      <Paper sx={{ p: 2, backgroundColor: '#fff3e0', border: '1px dashed #ffb74d' }}>
                        <Typography variant="body2" color="text.secondary" align="center">
                          Brak składników w recepturze
                        </Typography>
                      </Paper>
                    )}
                    
                    {/* Daty ważności skonsumowanych materiałów */}
                  </Paper>
                  
                  {/* 3.2 Expiration date of materials */}
                  {task?.consumedMaterials && task.consumedMaterials.length > 0 && (
                    <Paper sx={{ p: 3, mb: 3, backgroundColor: '#f8f9fa' }} elevation={1}>
                      <Typography variant="h6" gutterBottom sx={{ color: 'primary.main', fontWeight: 'bold' }}>
                        3.2 Expiration date of materials
                      </Typography>
                        
                        <TableContainer component={Paper} sx={{ mt: 2 }}>
                          <Table size="small">
                            <TableHead>
                              <TableRow sx={{ backgroundColor: '#fff3e0' }}>
                                <TableCell sx={{ fontWeight: 'bold' }}>Nazwa materiału</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>Partia</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 'bold' }}>Ilość</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>Jednostka</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>Data ważności</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {task.consumedMaterials.map((consumed, index) => {
                                // Znajdź materiał w liście materiałów zadania aby pobrać nazwę i jednostkę
                                const material = materials.find(m => (m.inventoryItemId || m.id) === consumed.materialId);
                                
                                // Pobierz nazwę materiału
                                const materialName = consumed.materialName || material?.name || 'Nieznany materiał';
                                
                                // Pobierz jednostkę materiału
                                const materialUnit = consumed.unit || material?.unit || '-';
                                
                                // Pobierz numer partii
                                let batchNumber = consumed.batchNumber || consumed.lotNumber || '-';
                                
                                // Jeśli nie ma numeru partii w konsumpcji, spróbuj znaleźć w task.materialBatches
                                if (batchNumber === '-' && task.materialBatches && task.materialBatches[consumed.materialId]) {
                                  const batch = task.materialBatches[consumed.materialId].find(b => b.batchId === consumed.batchId);
                                  if (batch && batch.batchNumber) {
                                    batchNumber = batch.batchNumber;
                                  }
                                }
                                
                                // Pobierz datę ważności - najpierw z konsumpcji, potem spróbuj z partii
                                let expiryDate = consumed.expiryDate;
                                let formattedExpiryDate = 'Nie określono';
                                
                                if (expiryDate) {
                                  const expiry = expiryDate instanceof Date 
                                    ? expiryDate 
                                    : expiryDate.toDate 
                                      ? expiryDate.toDate() 
                                      : new Date(expiryDate);
                                  
                                  formattedExpiryDate = expiry.toLocaleDateString('pl-PL', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric'
                                  });
                                }
                                
                                return (
                                  <TableRow key={index} sx={{ '&:nth-of-type(even)': { backgroundColor: '#fafafa' } }}>
                                    <TableCell sx={{ fontWeight: 'medium' }}>
                                      {materialName}
                                    </TableCell>
                                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
                                      {batchNumber}
                                    </TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 'medium' }}>
                                      {consumed.quantity || consumed.consumedQuantity || '-'}
                                    </TableCell>
                                    <TableCell>
                                      {materialUnit}
                                    </TableCell>
                                    <TableCell sx={{ fontWeight: 'medium' }}>
                                      {formattedExpiryDate}
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                          
                          {/* Podsumowanie dat ważności */}
                          <Box sx={{ p: 2, backgroundColor: '#f5f5f5', borderTop: '1px solid #e0e0e0' }}>
                            <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                              Podsumowanie: {task.consumedMaterials.length} skonsumowanych materiałów
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                              • Z datą ważności: {task.consumedMaterials.filter(m => m.expiryDate).length}<br/>
                              • Użyte partie: {[...new Set(task.consumedMaterials.map(m => m.batchNumber || m.lotNumber || m.batchId).filter(Boolean))].length}
                            </Typography>
                          </Box>
                        </TableContainer>
                    </Paper>
                  )}

                  {/* 3.3 Clinical and bibliographic research */}
                  <Paper sx={{ p: 3, mb: 3, backgroundColor: '#f8f9fa' }} elevation={1}>
                    <Typography variant="h6" gutterBottom sx={{ color: 'primary.main', fontWeight: 'bold' }}>
                      3.3 Clinical and bibliographic research
                    </Typography>
                    
                    {/* Sekcja przesyłania plików */}
                    <Box sx={{ mb: 3, p: 2, backgroundColor: '#e3f2fd', borderRadius: 1, border: '1px dashed #2196f3' }}>
                      <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
                        <CloudUploadIcon sx={{ mr: 1 }} />
                        Dodaj dokumenty badań klinicznych i bibliograficznych
                      </Typography>
                      
                      <input
                        accept=".pdf,.jpg,.jpeg,.png,.gif,.doc,.docx,.txt"
                        style={{ display: 'none' }}
                        id="clinical-file-upload"
                        multiple
                        type="file"
                        onChange={(e) => handleClinicalFileSelect(Array.from(e.target.files))}
                        disabled={uploadingClinical}
                      />
                      <label htmlFor="clinical-file-upload">
                        <Button
                          variant="contained"
                          component="span"
                          startIcon={uploadingClinical ? <CircularProgress size={20} color="inherit" /> : <CloudUploadIcon />}
                          disabled={uploadingClinical}
                          sx={{ mt: 1 }}
                        >
                          {uploadingClinical ? 'Przesyłanie...' : 'Wybierz pliki'}
                        </Button>
                      </label>
                      
                      <Typography variant="caption" display="block" sx={{ mt: 1, color: 'text.secondary' }}>
                        Dozwolone formaty: PDF, JPG, PNG, GIF, DOC, DOCX, TXT (max 10MB na plik)
                      </Typography>
                    </Box>

                    {/* Lista załączników */}
                    {clinicalAttachments.length > 0 ? (
                      <Box>
                        <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', fontWeight: 'bold' }}>
                          <AttachFileIcon sx={{ mr: 1 }} />
                          Załączone dokumenty ({clinicalAttachments.length})
                        </Typography>
                        
                        <TableContainer component={Paper} sx={{ mt: 2 }}>
                          <Table size="small">
                            <TableHead>
                              <TableRow sx={{ backgroundColor: '#fff3e0' }}>
                                <TableCell sx={{ fontWeight: 'bold', width: 60 }}>Typ</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>Nazwa pliku</TableCell>
                                <TableCell sx={{ fontWeight: 'bold', width: 100 }}>Rozmiar</TableCell>
                                <TableCell sx={{ fontWeight: 'bold', width: 120 }}>Data dodania</TableCell>
                                <TableCell sx={{ fontWeight: 'bold', width: 120 }} align="center">Akcje</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {clinicalAttachments.map((attachment, index) => (
                                <TableRow key={attachment.id} sx={{ '&:nth-of-type(even)': { backgroundColor: '#fafafa' } }}>
                                  <TableCell>
                                    {getClinicalFileIcon(attachment.contentType)}
                                  </TableCell>
                                  <TableCell sx={{ fontWeight: 'medium' }}>
                                    {attachment.fileName}
                                  </TableCell>
                                  <TableCell sx={{ fontSize: '0.875rem' }}>
                                    {formatClinicalFileSize(attachment.size)}
                                  </TableCell>
                                  <TableCell sx={{ fontSize: '0.875rem' }}>
                                    {new Date(attachment.uploadedAt).toLocaleDateString('pl-PL', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      year: 'numeric'
                                    })}
                                  </TableCell>
                                  <TableCell align="center">
                                    <Tooltip title="Pobierz">
                                      <IconButton
                                        size="small"
                                        onClick={() => handleDownloadClinicalFile(attachment)}
                                        sx={{ mr: 0.5 }}
                                      >
                                        <DownloadIcon fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Usuń">
                                      <IconButton
                                        size="small"
                                        onClick={() => handleDeleteClinicalFile(attachment)}
                                        color="error"
                                      >
                                        <DeleteIcon fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                          
                          {/* Podsumowanie załączników */}
                          <Box sx={{ p: 2, backgroundColor: '#f0f8f0', borderTop: '1px solid #e0e0e0' }}>
                            <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                              Łączna liczba dokumentów: {clinicalAttachments.length}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                              Łączny rozmiar: {formatClinicalFileSize(clinicalAttachments.reduce((sum, attachment) => sum + attachment.size, 0))}
                            </Typography>
                          </Box>
                        </TableContainer>
                      </Box>
                    ) : (
                      <Paper sx={{ p: 2, backgroundColor: '#fff3e0', border: '1px dashed #ffb74d' }}>
                        <Typography variant="body2" color="text.secondary" align="center">
                          Brak załączonych dokumentów badań klinicznych
                        </Typography>
                      </Paper>
                    )}
                  </Paper>
                  
                  {/* Diagnoza problemu dla starych zadań bez pełnych danych receptury */}
                  {task && task.recipeId && !task.recipe?.ingredients && (
                    <Paper sx={{ p: 3, mb: 3, backgroundColor: '#fff3e0', border: '2px solid #ff9800' }} elevation={2}>
                      <Typography variant="h6" gutterBottom sx={{ color: 'warning.main', fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
                        ⚠️ Wykryto problem z danymi receptury
                      </Typography>
                      
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        To zadanie zostało utworzone przed wprowadzeniem systemu automatycznego pobierania pełnych danych receptury. 
                        Brak jest składników, mikroelementów i innych szczegółowych danych receptury.
                      </Typography>
                      
                      <Typography variant="body2" sx={{ mb: 2 }}>
                        <strong>Wykryte informacje o recepturze:</strong><br/>
                        • ID Receptury: {task.recipeId}<br/>
                        • Nazwa Receptury: {task.recipeName || 'Nie określono'}<br/>
                        • Wersja Receptury: {task.recipeVersion || 'Nie określono'}
                      </Typography>
                      
                      <Button 
                        variant="contained" 
                        color="warning"
                        onClick={handleFixRecipeData}
                        disabled={fixingRecipeData}
                        startIcon={fixingRecipeData ? <CircularProgress size={20} color="inherit" /> : null}
                        sx={{ mt: 1 }}
                      >
                        {fixingRecipeData ? 'Naprawiam dane...' : 'Napraw dane receptury'}
                      </Button>
                      
                      <Typography variant="caption" display="block" sx={{ mt: 1, color: 'text.secondary' }}>
                        Ta operacja pobierze i doda brakujące dane receptury do zadania produkcyjnego.
                      </Typography>
                    </Paper>
                  )}
                  
                  {/* Tutaj będzie przygotowany nowy raport w etapach */}
                  <Box sx={{ p: 4, textAlign: 'center' }}>
                    <Typography variant="body1" color="text.secondary">
                      Pozostałe sekcje raportu zostaną przygotowane w kolejnych etapach
                    </Typography>
                  </Box>
                </Paper>
              </Grid>
            </Grid>
          )}

          {/* Wszystkie dialogi pozostają bez zmian na końcu komponentu */}
          {/* Dialog potwierdzenia */}
          <Dialog
            open={deleteHistoryDialogOpen}
            onClose={() => setDeleteHistoryDialogOpen(false)}
          >
            <DialogTitle>Potwierdź usunięcie</DialogTitle>
            <DialogContent>
              <DialogContentText>
                Czy na pewno chcesz usunąć wybrany wpis z historii produkcji? Ta operacja jest nieodwracalna.
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDeleteHistoryDialogOpen(false)}>
                Anuluj
              </Button>
              <Button 
                onClick={handleConfirmDeleteHistoryItem} 
                variant="contained" 
                color="error"
                disabled={loading}
              >
                {loading ? <CircularProgress size={24} /> : 'Usuń wpis'}
              </Button>
            </DialogActions>
          </Dialog>
          {/* Dialog usuwania zadania */}
          <Dialog
            open={deleteDialog}
            onClose={() => setDeleteDialog(false)}
          >
            <DialogTitle>Potwierdź usunięcie</DialogTitle>
            <DialogContent>
              <DialogContentText>
                Czy na pewno chcesz usunąć to zadanie produkcyjne (MO: {task?.moNumber})? Ta operacja jest nieodwracalna.
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDeleteDialog(false)}>
                Anuluj
              </Button>
              <Button 
                onClick={handleDelete} 
                variant="contained" 
                color="error"
              >
                Usuń zadanie
              </Button>
            </DialogActions>
          </Dialog>
          
          {/* Dialog wyboru opakowań */}
          <Dialog
            open={packagingDialogOpen}
            onClose={() => setPackagingDialogOpen(false)}
            maxWidth="md"
            fullWidth
          >
            <DialogTitle>Dodaj opakowania do zadania</DialogTitle>
            <DialogContent>
              <DialogContentText sx={{ mb: 2 }}>
                Wybierz opakowania, które chcesz dodać do zadania produkcyjnego.
              </DialogContentText>
              
              {/* Pasek wyszukiwania opakowań */}
              <TextField
                fullWidth
                margin="normal"
                label="Wyszukaj opakowanie"
                variant="outlined"
                value={searchPackaging}
                onChange={(e) => setSearchPackaging(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
                sx={{ mb: 2 }}
              />
              
              {loadingPackaging ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                  <CircularProgress />
                </Box>
              ) : (
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell padding="checkbox">Wybierz</TableCell>
                        <TableCell>Nazwa</TableCell>
                        <TableCell>Kategoria</TableCell>
                        <TableCell>Dostępna ilość</TableCell>
                        <TableCell>Ilość do dodania</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredPackagingItems.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} align="center">
                            {packagingItems.length === 0 
                              ? "Brak dostępnych opakowań"
                              : "Brak wyników dla podanego wyszukiwania"}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredPackagingItems.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell padding="checkbox">
                              <Checkbox
                                checked={item.selected}
                                onChange={(e) => handlePackagingSelection(item.id, e.target.checked)}
                              />
                            </TableCell>
                            <TableCell>{item.name}</TableCell>
                            <TableCell>{item.category}</TableCell>
                            <TableCell>{item.availableQuantity} {item.unit}</TableCell>
                            <TableCell>
                              <TextField
                                type="number"
                                value={item.quantity || ''}
                                onChange={(e) => handlePackagingQuantityChange(item.id, e.target.value)}
                                disabled={!item.selected}
                                inputProps={{ min: 0, max: item.availableQuantity, step: 'any' }}
                                size="small"
                                sx={{ width: '100px' }}
                              />
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setPackagingDialogOpen(false)}>
                Anuluj
              </Button>
              <Button 
                onClick={handleAddPackagingToTask} 
                variant="contained" 
                color="primary"
                disabled={loadingPackaging || packagingItems.filter(item => item.selected && item.quantity > 0).length === 0}
              >
                {loadingPackaging ? <CircularProgress size={24} /> : 'Dodaj wybrane opakowania'}
              </Button>
            </DialogActions>
          </Dialog>
          
          {/* Dialog rezerwacji surowców */}
          <Dialog
            open={reserveDialogOpen}
            onClose={() => setReserveDialogOpen(false)}
            maxWidth="lg"
            fullWidth
          >
            <DialogTitle>Rezerwacja surowców</DialogTitle>
            <DialogContent>
              <DialogContentText sx={{ mb: 2 }}>
                Wybierz partie materiałów, które chcesz zarezerwować dla tego zadania produkcyjnego.
              </DialogContentText>
              
              <FormControl component="fieldset" sx={{ mb: 2 }}>
                <FormLabel component="legend">Metoda rezerwacji</FormLabel>
                <RadioGroup 
                  row 
                  value={reservationMethod} 
                  onChange={handleReservationMethodChange}
                >
                  <FormControlLabel 
                    value="automatic" 
                    control={<Radio />} 
                    label="Automatyczna (FIFO)" 
                  />
                  <FormControlLabel 
                    value="manual" 
                    control={<Radio />} 
                    label="Ręczna (wybór partii)" 
                  />
                </RadioGroup>
              </FormControl>
              
              {reservationMethod === 'manual' && renderManualBatchSelection()}
              
              {reservationMethod === 'automatic' && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  System automatycznie zarezerwuje najstarsze dostępne partie materiałów (FIFO).
                </Alert>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setReserveDialogOpen(false)}>
                Anuluj
              </Button>
              <Button 
                onClick={handleReserveMaterials} 
                variant="contained" 
                color="primary"
                disabled={reservingMaterials}
              >
                {reservingMaterials ? <CircularProgress size={24} /> : 'Rezerwuj materiały'}
              </Button>
            </DialogActions>
          </Dialog>
          
          {/* Dialog dodawania wpisu historii produkcji */}
          <Dialog
            open={addHistoryDialogOpen}
            onClose={() => setAddHistoryDialogOpen(false)}
            maxWidth="md"
            fullWidth
          >
            <DialogTitle>Dodaj wpis historii produkcji</DialogTitle>
            <DialogContent>
              <DialogContentText sx={{ mb: 2 }}>
                Wprowadź dane nowej sesji produkcyjnej.
              </DialogContentText>
              
              {historyInventoryError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {historyInventoryError}
                </Alert>
              )}
              
              <Grid container spacing={2} sx={{ mt: 1 }}>
                <Grid item xs={12}>
                  <TextField
                    label="Wyprodukowana ilość"
                    type="number"
                    value={editedHistoryItem.quantity}
                    onChange={(e) => setEditedHistoryItem(prev => ({ 
                      ...prev, 
                      quantity: e.target.value === '' ? '' : parseFloat(e.target.value) 
                    }))}
                    inputProps={{ min: 0, step: 'any' }}
                    fullWidth
                    required
                    InputProps={{
                      endAdornment: <Typography variant="body2">{task?.unit || 'szt.'}</Typography>
                    }}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Data i czas rozpoczęcia"
                    type="datetime-local"
                    value={editedHistoryItem.startTime instanceof Date 
                      ? toLocalDateTimeString(editedHistoryItem.startTime) 
                      : ''}
                    onChange={(e) => {
                      const newDate = e.target.value ? fromLocalDateTimeString(e.target.value) : new Date();
                      setEditedHistoryItem(prev => ({ 
                        ...prev, 
                        startTime: newDate
                      }));
                    }}
                    InputLabelProps={{ shrink: true }}
                    fullWidth
                    required
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Data i czas zakończenia"
                    type="datetime-local"
                    value={editedHistoryItem.endTime instanceof Date 
                      ? toLocalDateTimeString(editedHistoryItem.endTime) 
                      : ''}
                    onChange={(e) => {
                      const newDate = e.target.value ? fromLocalDateTimeString(e.target.value) : new Date();
                      setEditedHistoryItem(prev => ({ 
                        ...prev, 
                        endTime: newDate
                      }));
                    }}
                    InputLabelProps={{ shrink: true }}
                    fullWidth
                    required
                  />
                </Grid>
                
                {/* Sekcja dodawania do magazynu */}
                <Grid item xs={12}>
                  <Divider sx={{ my: 2 }} />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={addToInventoryOnHistory}
                        onChange={(e) => setAddToInventoryOnHistory(e.target.checked)}
                        color="primary"
                      />
                    }
                    label="Dodaj produkt do magazynu po zakończeniu sesji"
                  />
                </Grid>
                
                {addToInventoryOnHistory && (
                  <>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        label="Data ważności"
                        type="date"
                        value={historyInventoryData.expiryDate ? 
                          historyInventoryData.expiryDate.toISOString().split('T')[0] : ''}
                        onChange={(e) => {
                          const date = e.target.value ? new Date(e.target.value) : null;
                          setHistoryInventoryData(prev => ({ ...prev, expiryDate: date }));
                        }}
                        InputLabelProps={{ shrink: true }}
                        fullWidth
                        required
                      />
                    </Grid>
                    
                    <Grid item xs={12} sm={6}>
                      <TextField
                        label="Numer partii (LOT)"
                        value={historyInventoryData.lotNumber}
                        onChange={(e) => setHistoryInventoryData(prev => ({ 
                          ...prev, 
                          lotNumber: e.target.value 
                        }))}
                        fullWidth
                        required
                      />
                    </Grid>
                    
                    <Grid item xs={12} sm={6}>
                      <TextField
                        label="Ilość końcowa"
                        type="number"
                        value={historyInventoryData.finalQuantity}
                        onChange={(e) => setHistoryInventoryData(prev => ({ 
                          ...prev, 
                          finalQuantity: e.target.value 
                        }))}
                        inputProps={{ min: 0, step: 'any' }}
                        fullWidth
                        required
                        InputProps={{
                          endAdornment: <Typography variant="body2">{task?.unit || 'szt.'}</Typography>
                        }}
                      />
                    </Grid>
                    
                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth required>
                        <InputLabel>Magazyn docelowy</InputLabel>
                        <Select
                          value={historyInventoryData.warehouseId}
                          onChange={(e) => setHistoryInventoryData(prev => ({ 
                            ...prev, 
                            warehouseId: e.target.value 
                          }))}
                          label="Magazyn docelowy"
                          disabled={warehousesLoading}
                        >
                          {warehouses.map(warehouse => (
                            <MenuItem key={warehouse.id} value={warehouse.id}>
                              {warehouse.name}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                  </>
                )}
              </Grid>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setAddHistoryDialogOpen(false)}>
                Anuluj
              </Button>
              <Button 
                onClick={handleAddHistoryItem} 
                variant="contained" 
                color="primary"
                disabled={loading}
              >
                {loading ? <CircularProgress size={24} /> : (addToInventoryOnHistory ? 'Dodaj sesję i do magazynu' : 'Dodaj sesję')}
              </Button>
            </DialogActions>
          </Dialog>
          
          {/* Dialog wyboru surowców */}
          <Dialog
            open={rawMaterialsDialogOpen}
            onClose={() => setRawMaterialsDialogOpen(false)}
            maxWidth="md"
            fullWidth
          >
            <DialogTitle>Dodaj surowce do zadania</DialogTitle>
            <DialogContent>
              <DialogContentText sx={{ mb: 2 }}>
                Wybierz surowce, które chcesz dodać do zadania produkcyjnego.
              </DialogContentText>
              
              {/* Pasek wyszukiwania surowców */}
              <TextField
                fullWidth
                margin="normal"
                label="Wyszukaj surowiec"
                variant="outlined"
                value={searchRawMaterials}
                onChange={(e) => setSearchRawMaterials(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
                sx={{ mb: 2 }}
              />
              
              {loadingRawMaterials ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                  <CircularProgress />
                </Box>
              ) : (
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell padding="checkbox">Wybierz</TableCell>
                        <TableCell>Nazwa</TableCell>
                        <TableCell>Kategoria</TableCell>
                        <TableCell>Dostępna ilość</TableCell>
                        <TableCell>Ilość do dodania</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredRawMaterialsItems.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} align="center">
                            {rawMaterialsItems.length === 0 
                              ? "Brak dostępnych surowców"
                              : "Brak wyników dla podanego wyszukiwania"}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredRawMaterialsItems.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell padding="checkbox">
                              <Checkbox
                                checked={item.selected}
                                onChange={(e) => handleRawMaterialsSelection(item.id, e.target.checked)}
                              />
                            </TableCell>
                            <TableCell>{item.name}</TableCell>
                            <TableCell>{item.category}</TableCell>
                            <TableCell>{item.availableQuantity} {item.unit}</TableCell>
                            <TableCell>
                              <TextField
                                type="number"
                                value={item.quantity || ''}
                                onChange={(e) => handleRawMaterialsQuantityChange(item.id, e.target.value)}
                                disabled={!item.selected}
                                inputProps={{ min: 0, max: item.availableQuantity, step: 'any' }}
                                size="small"
                                sx={{ width: '100px' }}
                              />
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setRawMaterialsDialogOpen(false)}>
                Anuluj
              </Button>
              <Button 
                onClick={handleAddRawMaterialsToTask} 
                variant="contained" 
                color="secondary"
                disabled={loadingRawMaterials || rawMaterialsItems.filter(item => item.selected && item.quantity > 0).length === 0}
              >
                {loadingRawMaterials ? <CircularProgress size={24} /> : 'Dodaj wybrane surowce'}
              </Button>
            </DialogActions>
          </Dialog>

          {/* Dialog usuwania materiału */}
          <Dialog
            open={deleteMaterialDialogOpen}
            onClose={() => setDeleteMaterialDialogOpen(false)}
          >
            <DialogTitle>Potwierdź usunięcie materiału</DialogTitle>
            <DialogContent>
              <DialogContentText>
                Czy na pewno chcesz usunąć materiał "{materialToDelete?.name}" z zadania produkcyjnego? Ta operacja jest nieodwracalna.
              </DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDeleteMaterialDialogOpen(false)}>
                Anuluj
              </Button>
              <Button 
                onClick={handleConfirmDeleteMaterial} 
                variant="contained" 
                color="error"
                disabled={loading}
              >
                {loading ? <CircularProgress size={24} /> : 'Usuń materiał'}
              </Button>
            </DialogActions>
          </Dialog>

          {/* Dialog konsumpcji materiałów */}
          <Dialog
            open={consumeMaterialsDialogOpen}
            onClose={() => setConsumeMaterialsDialogOpen(false)}
            maxWidth="lg"
            fullWidth
          >
            <DialogTitle>Konsumuj materiały</DialogTitle>
            <DialogContent>
              <DialogContentText sx={{ mb: 2 }}>
                Wybierz partie materiałów i ilości, które chcesz skonsumować. Konsumpcja zmniejszy dostępną ilość w magazynie.
              </DialogContentText>
              
              {consumedMaterials.length === 0 ? (
                <Alert severity="info">
                  Brak zarezerwowanych materiałów do konsumpcji.
                </Alert>
              ) : (
                consumedMaterials.map((material) => {
                  const materialId = material.inventoryItemId || material.id;
                  const reservedBatches = task.materialBatches[materialId] || [];
                  
                  return (
                    <Box key={materialId} sx={{ mb: 3 }}>
                      <Typography variant="h6" gutterBottom>
                        {material.name} ({material.unit})
                      </Typography>
                      
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell padding="checkbox">Konsumuj</TableCell>
                              <TableCell>Numer partii</TableCell>
                              <TableCell>Zarezerwowana ilość</TableCell>
                              <TableCell>Ilość do konsumpcji</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {reservedBatches.map((batch) => {
                              const batchKey = `${materialId}_${batch.batchId}`;
                              const isSelected = selectedBatchesToConsume[materialId]?.[batch.batchId] || false;
                              
                              return (
                                <TableRow key={batch.batchId}>
                                  <TableCell padding="checkbox">
                                    <Checkbox
                                      checked={isSelected}
                                      onChange={(e) => handleBatchToConsumeSelection(materialId, batch.batchId, e.target.checked)}
                                    />
                                  </TableCell>
                                  <TableCell>{batch.batchNumber}</TableCell>
                                  <TableCell>{batch.quantity} {material.unit}</TableCell>
                                  <TableCell>
                                    <TextField
                                      type="number"
                                      value={consumeQuantities[batchKey] || 0}
                                      onChange={(e) => handleConsumeQuantityChange(materialId, batch.batchId, e.target.value)}
                                      disabled={!isSelected}
                                      error={Boolean(consumeErrors[batchKey])}
                                      helperText={consumeErrors[batchKey]}
                                      inputProps={{ min: 0, max: batch.quantity, step: 'any' }}
                                      size="small"
                                      sx={{ width: '120px' }}
                                      InputProps={{
                                        endAdornment: <Typography variant="caption">{material.unit}</Typography>
                                      }}
                                    />
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Box>
                  );
                })
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setConsumeMaterialsDialogOpen(false)}>
                Anuluj
              </Button>
              <Button 
                onClick={handleConfirmConsumeMaterials} 
                variant="contained" 
                color="warning"
                disabled={loading || consumedMaterials.length === 0}
              >
                {loading ? <CircularProgress size={24} /> : 'Konsumuj materiały'}
              </Button>
            </DialogActions>
          </Dialog>

          {/* Dialog rezerwacji surowców */}
          <Dialog
            open={reserveDialogOpen}
            onClose={() => setReserveDialogOpen(false)}
            maxWidth="lg"
            fullWidth
          >
            <DialogTitle>Rezerwacja surowców</DialogTitle>
            <DialogContent>
              <DialogContentText sx={{ mb: 2 }}>
                Wybierz partie materiałów, które chcesz zarezerwować dla tego zadania produkcyjnego.
              </DialogContentText>
              
              <FormControl component="fieldset" sx={{ mb: 2 }}>
                <FormLabel component="legend">Metoda rezerwacji</FormLabel>
                <RadioGroup 
                  row 
                  value={reservationMethod} 
                  onChange={handleReservationMethodChange}
                >
                  <FormControlLabel 
                    value="automatic" 
                    control={<Radio />} 
                    label="Automatyczna (FIFO)" 
                  />
                  <FormControlLabel 
                    value="manual" 
                    control={<Radio />} 
                    label="Ręczna (wybór partii)" 
                  />
                </RadioGroup>
              </FormControl>
              
              {reservationMethod === 'manual' && renderManualBatchSelection()}
              
              {reservationMethod === 'automatic' && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  System automatycznie zarezerwuje najstarsze dostępne partie materiałów (FIFO).
                </Alert>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setReserveDialogOpen(false)}>
                Anuluj
              </Button>
              <Button 
                onClick={handleReserveMaterials} 
                variant="contained" 
                color="primary"
                disabled={reservingMaterials}
              >
                {reservingMaterials ? <CircularProgress size={24} /> : 'Rezerwuj materiały'}
              </Button>
            </DialogActions>
          </Dialog>

          {/* Dialog korekty konsumpcji */}
          <Dialog
            open={editConsumptionDialogOpen}
            onClose={() => setEditConsumptionDialogOpen(false)}
            maxWidth="md"
            fullWidth
          >
            <DialogTitle>Edytuj konsumpcję</DialogTitle>
            <DialogContent>
              <DialogContentText>
                Wprowadź nową ilość konsumpcji dla wybranej partii:
              </DialogContentText>
              <TextField
                label="Nowa ilość"
                type="number"
                value={editedQuantity}
                onChange={(e) => setEditedQuantity(e.target.value)}
                fullWidth
                InputProps={{
                  endAdornment: <Typography variant="body2">{task?.unit || 'szt.'}</Typography>
                }}
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setEditConsumptionDialogOpen(false)}>
                Anuluj
              </Button>
              <Button 
                onClick={handleConfirmEditConsumption} 
                variant="contained" 
                color="primary"
                disabled={loading}
              >
                {loading ? <CircularProgress size={24} /> : 'Zapisz zmiany'}
              </Button>
            </DialogActions>
          </Dialog>

          {/* Dialog usuwania konsumpcji */}
          <Dialog
            open={deleteConsumptionDialogOpen}
            onClose={() => setDeleteConsumptionDialogOpen(false)}
            maxWidth="md"
            fullWidth
          >
            <DialogTitle>Potwierdź usunięcie konsumpcji</DialogTitle>
            <DialogContent>
              <DialogContentText>
                Czy na pewno chcesz usunąć wybraną konsumpcję? Ta operacja jest nieodwracalna.
              </DialogContentText>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={restoreReservation}
                    onChange={(e) => setRestoreReservation(e.target.checked)}
                    color="primary"
                  />
                }
                label="Przywróć rezerwację materiału po usunięciu konsumpcji"
                sx={{ mt: 2, display: 'block' }}
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDeleteConsumptionDialogOpen(false)}>
                Anuluj
              </Button>
              <Button 
                onClick={handleConfirmDeleteConsumption} 
                variant="contained" 
                color="error"
                disabled={loading}
              >
                {loading ? <CircularProgress size={24} /> : 'Usuń konsumpcję'}
              </Button>
            </DialogActions>
          </Dialog>
        </>
      ) : (
        <Typography variant="body1" color="textSecondary">
          Nie udało się załadować danych zadania. Spróbuj ponownie.
        </Typography>
      )}
    </Container>
  );
};

export default TaskDetailsPage; 