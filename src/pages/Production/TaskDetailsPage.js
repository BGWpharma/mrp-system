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
  InputAdornment
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
  Search as SearchIcon
} from '@mui/icons-material';
import { getTaskById, updateTaskStatus, deleteTask, updateActualMaterialUsage, confirmMaterialConsumption, addTaskProductToInventory, startProduction, stopProduction, getProductionHistory, reserveMaterialsForTask, generateMaterialsAndLotsReport, updateProductionSession, addProductionSession, deleteProductionSession } from '../../services/productionService';
import { getItemBatches, bookInventoryForTask, cancelBooking, getBatchReservations, getAllInventoryItems, getInventoryItemById, getInventoryBatch } from '../../services/inventoryService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { formatDate, formatCurrency, formatDateTime } from '../../utils/formatters';
import { PRODUCTION_TASK_STATUSES, TIME_INTERVALS } from '../../utils/constants';
import { format, parseISO } from 'date-fns';
import TaskDetails from '../../components/production/TaskDetails';
import { db } from '../../services/firebase/config';
import { getDoc, doc, updateDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
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

  const fetchTask = async () => {
    try {
      setLoading(true);
      
      const fetchedTask = await getTaskById(id);
      setTask(fetchedTask);
      
      // Inicjalizacja materiałów, jeśli zadanie ma materiały
      if (fetchedTask?.materials?.length > 0) {
        // Dla każdego materiału pobierz aktualne informacje o cenie
        const materialPromises = fetchedTask.materials.map(async (material) => {
          let updatedMaterial = { ...material };
          
          // Jeśli materiał ma powiązanie z elementem magazynowym, pobierz jego aktualną cenę
          if (material.inventoryItemId) {
            try {
              const inventoryItem = await getInventoryItemById(material.inventoryItemId);
              if (inventoryItem) {
                updatedMaterial.unitPrice = inventoryItem.unitPrice || inventoryItem.price || 0;
              }
            } catch (error) {
              console.error(`Błąd podczas pobierania ceny dla materiału ${material.name}:`, error);
            }
          }
          
          return {
            ...updatedMaterial,
            plannedQuantity: (updatedMaterial.quantity || 0) * (fetchedTask.quantity || 1)
          };
        });
        
        // Poczekaj na rozwiązanie wszystkich promisów
        const materialsList = await Promise.all(materialPromises);
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
  
  // Funkcja do pobierania historii produkcji
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
  
  // Pobieranie danych zadania przy montowaniu komponentu
  useEffect(() => {
    fetchTask();
  }, [id, navigate, showError]);

  useEffect(() => {
    fetchProductionHistory();
  }, [task?.id]);

  // Dodaję efekt pobierający oczekiwane zamówienia przy każdym załadowaniu zadania
  useEffect(() => {
    if (task?.id && task?.materials?.length > 0) {
      fetchAwaitingOrdersForMaterials();
    }
  }, [task?.id, task?.materials?.length]);

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
    if (!task) return null;
    
    switch (task.status) {
      case 'Zaplanowane':
        return (
          <Button 
            variant="contained" 
            color="warning" 
            startIcon={<PlayArrowIcon />}
            onClick={() => handleStatusChange('W trakcie')}
          >
            Rozpocznij produkcję
          </Button>
        );
      case 'W trakcie':
        return null; // Usunięty przycisk "Zatrzymaj produkcję"
      default:
        return null;
    }
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
      
      // Jeśli produkt jest powiązany z pozycją w magazynie, przenieś do formularza przyjęcia
      if (task.inventoryProductId) {
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
        
        navigate(`/inventory/${task.inventoryProductId}/receive?${sourceInfo.toString()}`);
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
  const fetchBatchesForMaterials = async () => {
    try {
      setMaterialBatchesLoading(true);
      if (!task || !task.materials) return;
      
      const batchesData = {};
      const initialSelectedBatches = {};
      
      for (const material of task.materials) {
        const materialId = material.inventoryItemId || material.id;
        if (!materialId) continue;
        
        // Pobierz partie dla materiału
        const batches = await getItemBatches(materialId);
        
        if (batches && batches.length > 0) {
          // Dla każdej partii pobierz informacje o rezerwacjach
          const batchesWithReservations = await Promise.all(
            batches.map(async (batch) => {
              const reservations = await getBatchReservations(batch.id);
              
              // Oblicz ilość zarezerwowaną przez inne zadania (z wyłączeniem bieżącego)
              const reservedByOthers = reservations.reduce((sum, reservation) => {
                if (reservation.taskId === id) return sum; // Pomiń rezerwacje bieżącego zadania
                return sum + (reservation.quantity || 0);
              }, 0);
              
              // Oblicz faktycznie dostępną ilość po uwzględnieniu rezerwacji
              const effectiveQuantity = Math.max(0, batch.quantity - reservedByOthers);
              
              return {
                ...batch,
                reservedByOthers,
                effectiveQuantity
              };
            })
          );
          
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
    } catch (error) {
      console.error('Błąd podczas pobierania partii dla materiałów:', error);
      showError('Nie udało się pobrać informacji o partiach materiałów');
    } finally {
      setMaterialBatchesLoading(false);
    }
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
      
      // Użyj rzeczywistej ilości z materialQuantities jeśli jest dostępna
      const requiredQuantity = materialQuantities[materialId] !== undefined 
        ? materialQuantities[materialId] 
        : material.quantity;
      
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
    if (!task || !task.materials) return { valid: false, error: "Brak materiałów do walidacji" };
    
    const material = task.materials.find(m => (m.inventoryItemId || m.id) === materialId);
    if (!material) return { valid: false, error: "Nie znaleziono materiału" };
    
    // Użyj rzeczywistej ilości z materialQuantities jeśli jest dostępna
    const requiredQuantity = materialQuantities[materialId] !== undefined 
      ? materialQuantities[materialId] 
      : material.quantity;
    
    const materialBatches = selectedBatches[materialId] || [];
    const totalSelectedQuantity = materialBatches.reduce((sum, batch) => sum + batch.quantity, 0);
    
    if (totalSelectedQuantity < requiredQuantity) {
      return {
        valid: false,
        error: `Niewystarczająca ilość partii wybrana dla materiału ${material.name}. Wybrano: ${totalSelectedQuantity}, wymagane: ${requiredQuantity}`
      };
    }
    
    return { valid: true };
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
          
          // Użyj rzeczywistej ilości z materialQuantities jeśli jest dostępna
          const requiredQuantity = materialQuantities[materialId] !== undefined 
            ? materialQuantities[materialId] 
            : material.quantity;
            
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
              
          // Użyj rzeczywistej ilości z materialQuantities jeśli jest dostępna
          const requiredQuantity = materialQuantities[materialId] !== undefined 
            ? materialQuantities[materialId] 
            : material.quantity;
          
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
          
          // Użyj rzeczywistej ilości z materialQuantities jeśli jest dostępna
          // W przeciwnym razie użyj oryginalnej ilości z material.quantity
          const requiredQuantity = materialQuantities[materialId] !== undefined 
            ? materialQuantities[materialId] 
            : material.quantity;
          
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
                  <Typography>{material.name}</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Chip
                      label={`${totalSelectedQuantity.toFixed(3)} / ${parseFloat(requiredQuantity).toFixed(3)} ${material.unit}`}
                      color={isComplete ? "success" : "warning"}
                      size="small"
                      sx={{ mr: 1 }}
                    />
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
                                  {batch.unitPrice ? `${parseFloat(batch.unitPrice).toFixed(2)} €` : '—'}
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
      // Pobierz dane użytkownika asynchronicznie
      getUsersDisplayNames([userId]).then(names => {
        if (names && names[userId]) {
          setUserNames(prev => ({
            ...prev,
            [userId]: names[userId]
          }));
        }
      });
      
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
                    <td>${material.unitPrice ? `${material.unitPrice.toFixed(2)} €` : '—'}</td>
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
                  <th>${report.unitMaterialCost ? `${report.unitMaterialCost.toFixed(2)} €/${task.unit}` : '—'}</th>
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
                          <td>${batch.unitPrice ? batch.unitPrice.toFixed(2) + ' €' : '—'}</td>
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
      
      showSuccess('Sesja produkcyjna została dodana');
      
      // Odśwież dane historii produkcji i zadania
      await fetchProductionHistory();
      await fetchTask();
      
      // Zamknij dialog
      setAddHistoryDialogOpen(false);
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
            <tr><th>Szacowany czas produkcji:</th><td>${task.estimatedDuration ? task.estimatedDuration.toFixed(2) + ' godz.' : 'Nie określono'}</td></tr>
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
        
        // Wywołujemy aktualizację kosztów w bazie, ale dopiero po ukończeniu aktualizacji interfejsu
        if (task && updatedMaterials.length > 0) {
          // Oblicz całkowity koszt materiałów
          const totalMaterialCost = updatedMaterials.reduce((sum, material) => {
            // Sprawdź czy dla tego materiału są zarezerwowane partie
            const materialId = material.inventoryItemId || material.id;
            const reservedBatches = task.materialBatches && task.materialBatches[materialId];
            
            // Uwzględnij koszt tylko jeśli materiał ma zarezerwowane partie
            if (reservedBatches && reservedBatches.length > 0) {
              const quantity = materialQuantities[material.id] || material.quantity || 0;
              const unitPrice = material.unitPrice || 0;
              return sum + (quantity * unitPrice);
            }
            return sum;
          }, 0);
          
          // Oblicz koszt materiałów na jednostkę
          const unitMaterialCost = task.quantity ? (totalMaterialCost / task.quantity) : 0;
          
          // Sprawdź czy koszty się rzeczywiście zmieniły
          if (
            Math.abs((task.totalMaterialCost || 0) - totalMaterialCost) > 0.01 ||
            Math.abs((task.unitMaterialCost || 0) - unitMaterialCost) > 0.01
          ) {
            try {
              // Wykonaj aktualizację w bazie danych
              const taskRef = doc(db, 'productionTasks', id);
              await updateDoc(taskRef, {
                totalMaterialCost,
                unitMaterialCost,
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
                  reason: 'Automatyczna aktualizacja kosztów materiałów na podstawie cen partii'
                })
              });
              
              console.log(`Zaktualizowano koszty materiałów w zadaniu: ${totalMaterialCost.toFixed(2)} € (${unitMaterialCost.toFixed(2)} €/${task.unit})`);
              showSuccess('Koszty materiałów zostały automatycznie zaktualizowane');
              
              // Odśwież dane zadania, aby wyświetlić zaktualizowane koszty
              const updatedTask = await getTaskById(id);
              setTask(updatedTask);
            } catch (error) {
              console.error('Błąd podczas aktualizacji kosztów materiałów:', error);
              showError('Nie udało się zaktualizować kosztów materiałów: ' + error.message);
            }
          }
        }
      }
    } catch (error) {
      console.error('Błąd podczas aktualizacji cen materiałów:', error);
    }
  }, [task, materials, materialQuantities, id, currentUser, showSuccess, showError]);
  
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
  }, [task?.id, updateMaterialPricesFromBatches, task?.materialBatches ? JSON.stringify(Object.keys(task.materialBatches)) : '']);

  // Funkcja do ręcznej aktualizacji kosztów materiałów w bazie danych
  const updateMaterialCostsManually = useCallback(async () => {
    if (!task || !materials.length) return;
    
    try {
      // Oblicz całkowity koszt materiałów
      const totalMaterialCost = materials.reduce((sum, material) => {
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
      
      // Oblicz koszt materiałów na jednostkę
      const unitMaterialCost = task.quantity ? (totalMaterialCost / task.quantity) : 0;
      
      // Sprawdź czy koszty się rzeczywiście zmieniły
      if (
        Math.abs((task.totalMaterialCost || 0) - totalMaterialCost) <= 0.01 &&
        Math.abs((task.unitMaterialCost || 0) - unitMaterialCost) <= 0.01
      ) {
        showInfo('Koszty materiałów nie zmieniły się znacząco, pomijam aktualizację w bazie danych');
        return;
      }
      
      // Wykonaj aktualizację w bazie danych
      const taskRef = doc(db, 'productionTasks', id);
      await updateDoc(taskRef, {
        totalMaterialCost,
        unitMaterialCost,
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
          reason: 'Ręczna aktualizacja kosztów materiałów'
        })
      });
      
      console.log(`Zaktualizowano koszty materiałów w zadaniu: ${totalMaterialCost.toFixed(2)} € (${unitMaterialCost.toFixed(2)} €/${task.unit})`);
      showSuccess('Koszty materiałów zostały zaktualizowane w bazie danych');
      
      // Odśwież dane zadania, aby wyświetlić zaktualizowane koszty
      const updatedTask = await getTaskById(id);
      setTask(updatedTask);
    } catch (error) {
      console.error('Błąd podczas aktualizacji kosztów materiałów:', error);
      showError('Nie udało się zaktualizować kosztów materiałów: ' + error.message);
    }
  }, [id, task, materials, materialQuantities, currentUser, showSuccess, showError, showInfo, includeInCosts]);

  // Dodaj przycisk do ręcznej aktualizacji kosztów w podsumowaniu kosztów materiałów
  const renderMaterialCostsSummary = () => {
    // Oblicz całkowity koszt materiałów
    const totalMaterialCost = materials.reduce((sum, material) => {
      // Sprawdź czy dla tego materiału są zarezerwowane partie
      const materialId = material.inventoryItemId || material.id;
      const reservedBatches = task.materialBatches && task.materialBatches[materialId];
      
      // Uwzględnij koszt tylko jeśli materiał ma zarezerwowane partie i jest włączony do kosztów
      if (reservedBatches && reservedBatches.length > 0 && includeInCosts[material.id]) {
        const quantity = materialQuantities[material.id] || material.quantity || 0;
        const unitPrice = material.unitPrice || 0;
        return sum + (quantity * unitPrice);
      }
      return sum;
    }, 0);
    
    // Oblicz koszt materiałów na jednostkę
    const unitMaterialCost = task.quantity ? (totalMaterialCost / task.quantity) : 0;
    
    // Sprawdź czy koszty uległy zmianie
    const costChanged = 
      Math.abs((task.totalMaterialCost || 0) - totalMaterialCost) > 0.01 ||
      Math.abs((task.unitMaterialCost || 0) - unitMaterialCost) > 0.01;
    
    return (
      <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Typography variant="h6">Podsumowanie kosztów materiałów</Typography>
            {costChanged && (
              <Alert severity="info" sx={{ mt: 1 }}>
                Koszty materiałów są aktualizowane automatycznie. Możesz również zaktualizować je ręcznie.
              </Alert>
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
              <strong>Koszt materiałów na jednostkę:</strong> {unitMaterialCost} €/{task.unit}
              {task.unitMaterialCost !== undefined && costChanged && (
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  (W bazie: {task.unitMaterialCost} €/{task.unit})
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

  // Renderuj stronę
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      {loading ? (
        <CircularProgress />
      ) : (
        <>
          <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button 
              startIcon={<ArrowBackIcon />}
              onClick={() => navigate('/production')}
          variant="outlined" 
        >
              Powrót do listy
        </Button>
            <Box>
          <Button
            variant="outlined"
                color="primary"
                startIcon={<PrintIcon />}
                onClick={handlePrintMaterialsAndLots}
            sx={{ mr: 1 }}
          >
                Drukuj rozpiskę materiałów
          </Button>
          <Button
            variant="outlined"
                color="secondary"
                startIcon={<PrintIcon />}
                onClick={handlePrintMODetails}
            sx={{ mr: 1 }}
          >
                Drukuj szczegóły MO
          </Button>
              <IconButton 
                color="primary"
                component={Link}
                to={`/production/tasks/${id}/edit`}
                sx={{ mr: 1 }}
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
      
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Paper sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h5" component="h1">
              {task.name}
                <Chip
                      label={task.moNumber || 'MO'}
                      color="primary"
                      size="small"
                      sx={{ ml: 2 }}
                    />
              <Chip
                label={task.status}
                color={getStatusColor(task.status)}
                      size="small"
                      sx={{ ml: 1 }}
                    />
                    <Chip 
                      label={task.priority}
                      color={task.priority === 'Wysoki' ? 'error' : task.priority === 'Normalny' ? 'primary' : 'default'}
                      variant="outlined"
                      size="small"
                      sx={{ ml: 1 }}
                    />
            </Typography>
                  <Box>
                    {getStatusActions()}
                  </Box>
            </Box>

                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>Produkt:</Typography>
                    <Typography variant="body1">{task.productName}</Typography>
          </Grid>
                  <Grid item xs={12} md={6}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>Ilość:</Typography>
                    <Typography variant="body1">{task.quantity} {task.unit}</Typography>
        </Grid>
        
                  {task.estimatedDuration > 0 && (
                    <Grid item xs={12} md={6}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>Szacowany czas produkcji:</Typography>
                      <Typography variant="body1">{task.estimatedDuration.toFixed(1)} godz.</Typography>
                    </Grid>
                  )}

                  {task.recipe && task.recipe.recipeName && (
                    <Grid item xs={12} md={6}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>Receptura:</Typography>
                      <Typography variant="body1">
                        <Link to={`/recipes/${task.recipe.recipeId}`}>{task.recipe.recipeName}</Link>
              </Typography>
                    </Grid>
            )}

                  <Grid item xs={12}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>Opis:</Typography>
                    <Typography variant="body1">{task.description || 'Brak opisu'}</Typography>
          </Grid>
                </Grid>
      </Paper>
        </Grid>
        
            {/* Dodanie komponentu do wyświetlania powiązanych zamówień */}
            <TaskDetails task={task} />

            {/* Sekcja historii zmian statusu */}
            {task.statusHistory && task.statusHistory.length > 0 && (
              <Grid item xs={12}>
                <Paper sx={{ p: 3 }}>
                  <Typography variant="h6" component="h2" gutterBottom>
                    Historia zmian statusu
        </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                          <TableCell>Data i godzina</TableCell>
                          <TableCell>Poprzedni status</TableCell>
                          <TableCell>Nowy status</TableCell>
                          <TableCell>Kto zmienił</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                        {[...task.statusHistory].reverse().map((change, index) => (
                          <TableRow key={index}>
                            <TableCell>
                              {change.changedAt ? new Date(change.changedAt).toLocaleString('pl') : 'Brak daty'}
                            </TableCell>
                            <TableCell>{change.oldStatus}</TableCell>
                            <TableCell>{change.newStatus}</TableCell>
                            <TableCell>{getUserName(change.changedBy)}</TableCell>
                  </TableRow>
                ))}
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
                    <Button
                      variant="outlined"
                      color="primary"
                      startIcon={<PackagingIcon />}
                      onClick={handleOpenPackagingDialog}
                      sx={{ mt: 2, mb: 2, mr: 2 }}
                    >
                      Dodaj opakowania
                    </Button>
                    <Button
                      variant="outlined"
                      color="primary"
                      startIcon={<BookmarkAddIcon />}
                      onClick={() => setReserveDialogOpen(true)}
                      sx={{ mt: 2, mb: 2 }}
                    >
                      Rezerwuj surowce
                    </Button>
                  </Box>
                </Box>
                
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                        <TableCell>Nazwa</TableCell>
                        <TableCell>Ilość</TableCell>
                        <TableCell>Jednostka</TableCell>
                        <TableCell>Rzeczywista ilość</TableCell>
                        <TableCell>Cena jedn.</TableCell>
                        <TableCell>Koszt</TableCell>
                        <TableCell>Zarezerwowane partie (LOT)</TableCell>
                        <TableCell>Wliczaj</TableCell>
                        <TableCell>Akcje</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {materials.map((material) => {
                        // Sprawdź czy dla tego materiału są zarezerwowane partie
                        const materialId = material.inventoryItemId || material.id;
                        const reservedBatches = task.materialBatches && task.materialBatches[materialId];
                        
                        // Oblicz koszt materiału
                        const quantity = materialQuantities[material.id] || material.quantity || 0;
                        const unitPrice = material.unitPrice || 0;
                        const cost = quantity * unitPrice;
                    
                    return (
                      <TableRow key={material.id}>
                        <TableCell>{material.name}</TableCell>
                        <TableCell>{material.quantity}</TableCell>
                        <TableCell>{material.unit}</TableCell>
                        <TableCell>
                              {editMode ? (
                                <TextField
                                  type="number"
                                  value={materialQuantities[material.id] || 0}
                                  onChange={(e) => handleQuantityChange(material.id, e.target.value)}
                                  error={Boolean(errors[material.id])}
                                  helperText={errors[material.id]}
                                  inputProps={{ min: 0, step: 'any' }}
                                  size="small"
                                  sx={{ width: '100px' }}
                                />
                              ) : (
                                materialQuantities[material.id] || 0
                              )}
                            </TableCell>
                            <TableCell>
                              {reservedBatches && reservedBatches.length > 0 ? (
                                unitPrice.toFixed(2) + ' €'
                              ) : (
                                '—'
                              )}
                            </TableCell>
                            <TableCell>
                              {reservedBatches && reservedBatches.length > 0 ? (
                                cost.toFixed(2) + ' €'
                              ) : (
                                '—'
                              )}
                            </TableCell>
                            <TableCell>
                              {reservedBatches && reservedBatches.length > 0 ? (
                                <Box>
                                  {reservedBatches.map((batch, index) => (
                                    <Chip
                                      key={index}
                              size="small"
                                      label={`${batch.batchNumber} (${batch.quantity} ${material.unit})`}
                                      color="info"
                                      variant="outlined"
                                      sx={{ mr: 0.5, mb: 0.5, cursor: 'pointer' }}
                                      onClick={() => navigate(`/inventory/${materialId}/batches`)}
                                    />
                                  ))}
                                </Box>
                              ) : (
                                <Typography variant="body2" color="text.secondary">
                                  Brak zarezerwowanych partii
                                </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Checkbox
                            checked={includeInCosts[material.id] || false}
                            onChange={(e) => handleIncludeInCostsChange(material.id, e.target.checked)}
                            color="primary"
                          />
                        </TableCell>
                            <TableCell>
                              {editMode ? (
                                <Box sx={{ display: 'flex' }}>
                                  <IconButton 
                                    color="primary" 
                                    onClick={handleSaveChanges}
                                    title="Zapisz zmiany"
                                  >
                                    <SaveIcon />
                                  </IconButton>
                                  <IconButton 
                                    color="error" 
                                    onClick={() => setEditMode(false)}
                                    title="Anuluj edycję"
                                  >
                                    <CancelIcon />
                                  </IconButton>
                                </Box>
                              ) : (
                                <IconButton 
                                  color="primary" 
                                  onClick={() => {
                                    setEditMode(true);
                                    setMaterialQuantities(prev => ({
                                      ...prev,
                                      [material.id]: materialQuantities[material.id] || 0
                                    }));
                                  }}
                                  title="Edytuj ilość"
                                >
                                  <EditIcon />
                                </IconButton>
                              )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </TableContainer>
          
          {/* Podsumowanie kosztów materiałów */}
          {renderMaterialCostsSummary()}
        </Paper>
            </Grid>
            
            {/* Sekcja historii produkcji */}
            <Grid item xs={12}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" component="h2" gutterBottom>
                  Historia produkcji
                </Typography>
                
                {/* Przycisk do dodawania ręcznego wpisu historii produkcji */}
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={<AddIcon />}
                    onClick={() => {
                      setEditedHistoryItem({
                        quantity: '',
                        startTime: new Date(),
                        endTime: new Date(),
                      });
                      setAddHistoryDialogOpen(true);
                    }}
                    size="small"
                  >
                    Dodaj wpis
                  </Button>
                </Box>
                
                {productionHistory.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Brak historii produkcji dla tego zadania
                  </Typography>
                ) : (
                  <TableContainer>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>Data rozpoczęcia</TableCell>
                          <TableCell>Data zakończenia</TableCell>
                          <TableCell>Czas trwania</TableCell>
                          <TableCell>Wyprodukowana ilość</TableCell>
                          <TableCell>Operator</TableCell>
                          <TableCell>Akcje</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {productionHistory.map((item) => (
                          <TableRow key={item.id}>
                            {editingHistoryItem === item.id ? (
                              // Widok edycji
                              <>
                                <TableCell>
                                  <TextField
                                    type="datetime-local"
                                    value={editedHistoryItem.startTime instanceof Date 
                                      ? editedHistoryItem.startTime.toISOString().slice(0, 16) 
                                      : ''}
                                    onChange={(e) => {
                                      const newDate = e.target.value ? new Date(e.target.value) : new Date();
                                      setEditedHistoryItem(prev => ({ 
                                        ...prev, 
                                        startTime: newDate
                                      }));
                                    }}
                                    size="small"
                                    fullWidth
                                  />
                                </TableCell>
                                <TableCell>
                                  <TextField
                                    type="datetime-local"
                                    value={editedHistoryItem.endTime instanceof Date 
                                      ? editedHistoryItem.endTime.toISOString().slice(0, 16) 
                                      : ''}
                                    onChange={(e) => {
                                      const newDate = e.target.value ? new Date(e.target.value) : new Date();
                                      setEditedHistoryItem(prev => ({ 
                                        ...prev, 
                                        endTime: newDate
                                      }));
                                    }}
                                    size="small"
                                    fullWidth
                                  />
                                </TableCell>
                                <TableCell>
                                  {Math.round(
                                    (editedHistoryItem.endTime.getTime() - editedHistoryItem.startTime.getTime()) / (1000 * 60)
                                  )} min
                                </TableCell>
                                <TableCell>
                                  <TextField
                                    type="number"
                                    value={editedHistoryItem.quantity}
                                    onChange={(e) => setEditedHistoryItem(prev => ({ 
                                      ...prev, 
                                      quantity: e.target.value === '' ? '' : parseFloat(e.target.value) 
                                    }))}
                                    inputProps={{ min: 0, step: 'any' }}
                                    size="small"
                                    fullWidth
                                  />
                                </TableCell>
                                <TableCell>
                                  {getUserName(item.userId)}
                                </TableCell>
                                <TableCell>
                                  <Box sx={{ display: 'flex' }}>
                                    <IconButton 
                                      color="primary" 
                                      onClick={() => handleSaveHistoryItemEdit(item.id)}
                                      title="Zapisz zmiany"
                                    >
                                      <SaveIcon />
                                    </IconButton>
                                    <IconButton 
                                      color="error" 
                                      onClick={handleCancelHistoryItemEdit}
                                      title="Anuluj edycję"
                                    >
                                      <CancelIcon />
                                    </IconButton>
                                  </Box>
                                </TableCell>
                              </>
                            ) : (
                              // Widok standardowy
                              <>
                                <TableCell>{item.startTime ? formatDateTime(item.startTime) : '-'}</TableCell>
                                <TableCell>{item.endTime ? formatDateTime(item.endTime) : '-'}</TableCell>
                                <TableCell>{item.timeSpent ? `${item.timeSpent} min` : '-'}</TableCell>
                                <TableCell>{item.quantity} {task.unit}</TableCell>
                                <TableCell>{getUserName(item.userId)}</TableCell>
                                <TableCell>
                                  <IconButton 
                                    color="primary" 
                                    onClick={() => handleEditHistoryItem(item)}
                                    title="Edytuj sesję produkcyjną"
                                  >
                                    <EditIcon />
                                  </IconButton>
                                  <IconButton 
                                    color="error" 
                                    onClick={() => handleDeleteHistoryItem(item)}
                                    title="Usuń sesję produkcyjną"
                                  >
                                    <DeleteIcon />
                                  </IconButton>
                                </TableCell>
                              </>
                            )}
                          </TableRow>
                        ))}
                        
                        {/* Wiersz podsumowania */}
                        <TableRow sx={{ '& td': { fontWeight: 'bold', bgcolor: 'rgba(0, 0, 0, 0.04)' } }}>
                          <TableCell colSpan={2} align="right">Suma:</TableCell>
                          <TableCell>
                            {productionHistory.reduce((sum, item) => sum + (item.timeSpent || 0), 0)} min
                          </TableCell>
                          <TableCell>
                            {productionHistory.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0)} {task.unit}
                          </TableCell>
                          <TableCell colSpan={2}></TableCell>
                        </TableRow>
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
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6">
                      Plan mieszań
                </Typography>
                  </Box>
                  
                  {/* Tabela mieszań */}
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell width="25%">Mieszanie</TableCell>
                          <TableCell width="35%">Składniki</TableCell>
                          <TableCell width="40%" align="center">Status</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {/* Grupujemy elementy checklisty według mieszań */}
                        {task.mixingPlanChecklist
                          .filter(item => item.type === 'header')
                          .map(headerItem => {
                            // Pobierz wszystkie elementy składników dla danego mieszania
                            const ingredients = task.mixingPlanChecklist
                              .filter(item => item.parentId === headerItem.id && item.type === 'ingredient');
                            
                            // Pobierz checkboxy kontrolne dla danego mieszania
                            const checkItems = task.mixingPlanChecklist
                              .filter(item => item.parentId === headerItem.id && item.type === 'check');
                            
                            return (
                              <TableRow key={headerItem.id} sx={{ 
                                '& td': { 
                                  borderBottom: '1px solid rgba(224, 224, 224, 1)',
                                  verticalAlign: 'top',
                                  pt: 2, pb: 2
                                }
                              }}>
                                {/* Informacje o mieszaniu */}
                                <TableCell>
                                  <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                                    {headerItem.text}
                                  </Typography>
                                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                    {headerItem.details}
                                  </Typography>
                                </TableCell>
                                
                                {/* Lista składników */}
                                <TableCell>
                                  <Table size="small" sx={{ 
                                    '& td': { 
                                      border: 'none',
                                      pt: 0.5,
                                      pb: 0.5 
                                    } 
                                  }}>
                                    <TableBody>
                                      {ingredients.map((ingredient) => (
                                        <TableRow key={ingredient.id}>
                                          <TableCell sx={{ pl: 0 }}>
                                            <Typography variant="body2">
                                              {ingredient.text}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                              {ingredient.details}
                                            </Typography>
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </TableCell>
                                
                                {/* Checkboxy statusu mieszania */}
                                <TableCell align="center">
                                  <Grid container spacing={1} alignItems="center">
                                    {checkItems.map((item) => (
                                      <Grid item xs={12} key={item.id} sx={{ borderBottom: '1px solid rgba(224, 224, 224, 0.3)', pb: 1 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                          <FormControlLabel
                                            control={
                                              <Checkbox
                                                checked={item.completed || false}
                                                onChange={async (e) => {
                                                  try {
                                                    // Pobierz referencję do dokumentu zadania
                                                    const taskRef = doc(db, 'productionTasks', task.id);
                                                    
                                                    // Zaktualizuj stan checkboxa w bazie danych
                                                    const updatedChecklist = task.mixingPlanChecklist.map(checkItem => {
                                                      if (checkItem.id === item.id) {
                                                        return {
                                                          ...checkItem,
                                                          completed: e.target.checked,
                                                          completedAt: e.target.checked ? new Date().toISOString() : null,
                                                          completedBy: e.target.checked ? currentUser.uid : null
                                                        };
                                                      }
                                                      return checkItem;
                                                    });
                                                    
                                                    // Zapisz zaktualizowaną checklistę
                                                    await updateDoc(taskRef, {
                                                      mixingPlanChecklist: updatedChecklist,
                                                      updatedAt: serverTimestamp(),
                                                      updatedBy: currentUser.uid
                                                    });
                                                    
                                                    // Zaktualizuj stan lokalny
                                                    setTask(prevTask => ({
                                                      ...prevTask,
                                                      mixingPlanChecklist: updatedChecklist
                                                    }));
                                                    
                                                    showSuccess('Zaktualizowano stan zadania');
                                                  } catch (error) {
                                                    console.error('Błąd podczas aktualizacji stanu checklisty:', error);
                                                    showError('Nie udało się zaktualizować stanu zadania');
                                                  }
                                                }}
                                              />
                                            }
                                            label={item.text}
                                            sx={{ width: '100%' }}
                                          />
                                          {item.completed && (
                                            <Chip 
                                              size="small" 
                                              label={item.completedAt ? new Date(item.completedAt).toLocaleDateString('pl-PL') : '-'} 
                                              color="success" 
                                              variant="outlined"
                                              sx={{ ml: 1 }}
                                            />
                                          )}
                                        </Box>
                                      </Grid>
                                    ))}
                                  </Grid>
                                </TableCell>
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
        </>
      )}
      
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
            onClick={() => handleReserveMaterials()} 
            variant="contained" 
            color="primary"
            disabled={loading || reservingMaterials || (reservationMethod === 'manual' && !validateManualBatchSelection().valid)}
          >
            {reservingMaterials ? <CircularProgress size={24} /> : 'Rezerwuj materiały'}
          </Button>
        </DialogActions>
      </Dialog>
      
    </Container>
  );
};

export default TaskDetailsPage; 