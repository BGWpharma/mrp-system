import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  CircularProgress,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  TextField,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Alert,
  Stack,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tabs,
  Tab,
  RadioGroup,
  Radio,
  FormControlLabel,
  FormLabel,
  Checkbox,
  ListItem,
  List,
  ListItemText,
  ListItemSecondaryAction,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip
} from '@mui/material';
import {
  Edit as EditIcon,
  ArrowBack as ArrowBackIcon,
  PlayArrow as StartIcon,
  Stop as StopIcon,
  CheckCircle as CompleteIcon,
  Delete as DeleteIcon,
  Settings as SettingsIcon,
  Save as SaveIcon,
  Check as CheckIcon,
  Cancel as CancelIcon,
  Inventory as InventoryIcon,
  Warning as WarningIcon,
  Receipt as ReceiptIcon,
  Add as AddIcon,
  SaveAlt as SaveAltIcon,
  Info as InfoIcon,
  BookmarkAdd as BookmarkAddIcon,
  ExpandMore as ExpandMoreIcon,
  Print as PrintIcon,
  Inventory2 as PackagingIcon
} from '@mui/icons-material';
import { getTaskById, updateTaskStatus, deleteTask, updateActualMaterialUsage, confirmMaterialConsumption, addTaskProductToInventory, startProduction, stopProduction, getProductionHistory, reserveMaterialsForTask, generateMaterialsAndLotsReport, updateProductionSession, updateTaskCosts } from '../../services/productionService';
import { getItemBatches, bookInventoryForTask, cancelBooking, getBatchReservations, getAllInventoryItems, getInventoryItemById, getInventoryBatch } from '../../services/inventoryService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { formatDate, formatCurrency, formatDateTime } from '../../utils/formatters';
import { PRODUCTION_TASK_STATUSES, TIME_INTERVALS } from '../../utils/constants';
import { format, parseISO } from 'date-fns';
import TaskDetails from '../../components/production/TaskDetails';
import { db } from '../../services/firebase/config';
import { getDoc, doc, updateDoc, serverTimestamp, addDoc, onSnapshot, Timestamp, arrayUnion } from 'firebase/firestore';
import { getUsersDisplayNames } from '../../services/userService';

const TaskDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError, showInfo } = useNotification();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState({ open: false, severity: 'success', message: '' });
  
  // Stan dla dialogu konsumpcji materiałów
  const [consumptionDialogOpen, setConsumptionDialogOpen] = useState(false);
  const [confirmationDialogOpen, setConfirmationDialogOpen] = useState(false);
  const [materials, setMaterials] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [materialQuantities, setMaterialQuantities] = useState({});
  const [errors, setErrors] = useState({});

  const [stopProductionDialogOpen, setStopProductionDialogOpen] = useState(false);
  const [completedQuantity, setCompletedQuantity] = useState('');
  const [timeSpent, setTimeSpent] = useState('');
  const [productionHistory, setProductionHistory] = useState([]);
  const [productionError, setProductionError] = useState(null);
  const [editingHistoryItem, setEditingHistoryItem] = useState(null);
  const [editedHistoryItem, setEditedHistoryItem] = useState({
    quantity: 0,
    startTime: new Date(),
    endTime: new Date()
  });

  const [deleteDialog, setDeleteDialog] = useState(false);
  const [quantity, setQuantity] = useState(0);
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);

  const [productionStartTime, setProductionStartTime] = useState(new Date());
  const [productionEndTime, setProductionEndTime] = useState(new Date());

  // Stany dla rezerwacji surowców
  const [reserveDialogOpen, setReserveDialogOpen] = useState(false);
  const [reservationMethod, setReservationMethod] = useState('fifo');
  const [reservingMaterials, setReservingMaterials] = useState(false);
  
  // Nowe stany dla ręcznego wyboru partii
  const [availableBatches, setAvailableBatches] = useState({});
  const [selectedBatches, setSelectedBatches] = useState({});
  const [materialBatchesLoading, setMaterialBatchesLoading] = useState(false);
  const [manualBatchSelectionActive, setManualBatchSelectionActive] = useState(false);
  const [expandedMaterial, setExpandedMaterial] = useState(null);

  const [userNames, setUserNames] = useState({});

  // Stany związane z kosztami MO
  const [totalMaterialCost, setTotalMaterialCost] = useState(0);
  const [unitMaterialCost, setUnitMaterialCost] = useState(0);
  
  // Referencja do poprzedniego stanu materialBatches
  const previousMaterialBatchesRef = useRef('');

  // Nowy stan dla dodawania opakowań
  const [packagingDialogOpen, setPackagingDialogOpen] = useState(false);
  const [availablePackaging, setAvailablePackaging] = useState([]);
  const [selectedPackaging, setSelectedPackaging] = useState([]);
  const [loadingPackaging, setLoadingPackaging] = useState(false);

  const fetchTask = async () => {
    try {
      setLoading(true);
      
      const fetchedTask = await getTaskById(id);
      setTask(fetchedTask);
      
      // Inicjalizacja kosztów zadania, jeśli są dostępne
      if (fetchedTask.totalMaterialCost !== undefined) {
        setTotalMaterialCost(fetchedTask.totalMaterialCost);
        console.log("Ustawiono całkowity koszt materiałów z zadania:", fetchedTask.totalMaterialCost);
      } else if (fetchedTask.materialCost !== undefined) {
        // Dla wstecznej kompatybilności
        setTotalMaterialCost(fetchedTask.materialCost);
        console.log("Ustawiono całkowity koszt materiałów z pola materialCost:", fetchedTask.materialCost);
      }
      
      if (fetchedTask.unitMaterialCost !== undefined) {
        setUnitMaterialCost(fetchedTask.unitMaterialCost);
        console.log("Ustawiono jednostkowy koszt materiałów z zadania:", fetchedTask.unitMaterialCost);
      }
      
      // Inicjalizacja materiałów, jeśli zadanie ma materiały
      if (fetchedTask?.materials?.length > 0) {
        console.log("Materiały z zadania:", fetchedTask.materials.map(m => ({ 
          name: m.name, 
          unitPrice: m.unitPrice, 
          quantity: m.quantity 
        })));
        
        // Dla każdego materiału pobierz aktualne informacje o cenie
        const materialPromises = fetchedTask.materials.map(async (material) => {
          let updatedMaterial = { ...material };
          
          // Jeśli materiał ma powiązanie z elementem magazynowym, pobierz jego aktualną cenę
          if (material.inventoryItemId) {
            try {
              const inventoryItem = await getInventoryItemById(material.inventoryItemId);
              if (inventoryItem) {
                const inventoryPrice = inventoryItem.unitPrice || inventoryItem.price || 0;
                
                // Zachowaj wyższą cenę - z zadania lub z magazynu
                const existingPrice = material.unitPrice || 0;
                
                if (existingPrice > inventoryPrice && existingPrice > 0.1) {
                  console.log(`Zachowuję wyższą cenę materiału "${material.name}": ${existingPrice} (z zadania) vs ${inventoryPrice} (z magazynu)`);
                  updatedMaterial.unitPrice = existingPrice;
                } else {
                  updatedMaterial.unitPrice = inventoryPrice;
                }
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
  
  useEffect(() => {
    fetchTask();
  }, [id, navigate, showError]);

  useEffect(() => {
    fetchProductionHistory();
  }, [task?.id]);

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
            startIcon={<StartIcon />}
            onClick={() => handleStatusChange('W trakcie')}
          >
            Rozpocznij produkcję
          </Button>
        );
      case 'W trakcie':
        return (
          <>
            <Button 
              variant="contained" 
              color="error" 
              startIcon={<StopIcon />}
              onClick={() => setStopProductionDialogOpen(true)}
            >
              Zatrzymaj produkcję
            </Button>
          </>
        );
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
        const unitPrice = 0; // Usunięto odwołanie do task.itemPrice
        
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
    if (!completedQuantity) {
      showError('Podaj ilość wyprodukowaną');
      return;
    }
    
    const quantity = parseFloat(completedQuantity);
    
    if (isNaN(quantity) || quantity <= 0) {
      showError('Ilość wyprodukowana musi być liczbą większą od zera');
      return;
    }
    
    setLoading(true);
    
    try {
      const result = await stopProduction(
        id, 
        quantity, 
        timeSpent || 0,
        currentUser.uid,
        // Przekaż informacje o czasie
        {
          startTime: productionStartTime.toISOString(),
          endTime: productionEndTime.toISOString()
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
      
      setAvailableBatches(batchesData);
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
    if (newMethod === 'manual' && Object.keys(availableBatches).length === 0) {
      fetchBatchesForMaterials();
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
        const batch = availableBatches[materialId].find(b => b.id === batchId);
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
  
  // Funkcja do sprawdzania, czy wszystkie materiały mają wystarczającą ilość zarezerwowanych partii
  const validateManualBatchSelection = () => {
    if (!task || !task.materials) return false;
    
    for (const material of task.materials) {
      const materialId = material.inventoryItemId || material.id;
      if (!materialId) continue;
      
      const materialBatches = selectedBatches[materialId] || [];
      const totalSelectedQuantity = materialBatches.reduce((sum, batch) => sum + batch.quantity, 0);
      
      if (totalSelectedQuantity < material.quantity) {
        showError(`Niewystarczająca ilość partii wybrana dla materiału ${material.name}. Wybrano: ${totalSelectedQuantity}, wymagane: ${material.quantity}`);
        return false;
      }
    }
    
    return true;
  };
  
  // Zmodyfikowana funkcja do rezerwacji materiałów z obsługą ręcznego wyboru partii
  const handleReserveMaterials = async () => {
    try {
      setReservingMaterials(true);
      
      if (!task || !task.materials || task.materials.length === 0) {
        showError('Zadanie nie ma przypisanych materiałów do rezerwacji');
        setReservingMaterials(false);
        setReserveDialogOpen(false);
        return;
      }
      
      console.log("Rozpoczynam proces rezerwacji materiałów dla zadania:", id);
      console.log("Metoda rezerwacji:", reservationMethod);
      console.log("Task data:", task);
      
      // Sprawdź, czy istnieją nowe materiały, które nie są jeszcze zarezerwowane
      const existingReservedMaterials = new Set();
      
      // Zbierz ID wszystkich już zarezerwowanych materiałów
      if (task.materialBatches) {
        Object.keys(task.materialBatches).forEach(materialId => {
          existingReservedMaterials.add(materialId);
        });
      }
      
      // Sprawdź, czy są nowe materiały do zarezerwowania
      const newMaterialsToReserve = task.materials.filter(material => {
        const materialId = material.inventoryItemId || material.id;
        return materialId && !existingReservedMaterials.has(materialId);
      });
      
      // Jeśli zadanie ma już zarezerwowane materiały i nie ma nowych materiałów do zarezerwowania
      if (task.materialsReserved && task.materialBatches && newMaterialsToReserve.length === 0) {
        console.log("Materiały są już zarezerwowane dla tego zadania. Pomijam ponowną rezerwację.");
        showInfo("Materiały są już zarezerwowane dla tego zadania.");
        setReservingMaterials(false);
        setReserveDialogOpen(false);
        return;
      }
      
      // Jeśli są już zarezerwowane materiały, ale są też nowe do zarezerwowania
      if (task.materialsReserved && task.materialBatches && newMaterialsToReserve.length > 0) {
        console.log(`Wykryto ${newMaterialsToReserve.length} nowe materiały do zarezerwowania.`);
        showInfo(`Rezerwuję ${newMaterialsToReserve.length} nowe materiały dodane do zadania.`);
      }
      
      // Jeśli wybrano ręczny wybór partii
      if (reservationMethod === 'manual') {
        if (!validateManualBatchSelection()) {
          setReservingMaterials(false);
          return;
        }
        
        const errors = [];
        const reservedItems = [];
        const userId = currentUser?.uid || 'system';
        
        try {
          // Teraz rezerwuj partie tylko dla nowych materiałów lub wszystkich jeśli nie było wcześniejszej rezerwacji
          for (const material of task.materials) {
            const materialId = material.inventoryItemId || material.id;
            if (!materialId) continue;
            
            // Pomijamy materiały, które są już zarezerwowane (chyba że nie ma nowych materiałów)
            if (existingReservedMaterials.has(materialId) && newMaterialsToReserve.length > 0) {
              console.log(`Materiał ${material.name} jest już zarezerwowany, pomijam.`);
              continue;
            }
            
            const materialBatches = selectedBatches[materialId] || [];
            
            try {
              // Rezerwuj materiał
              for (const batchSelection of materialBatches) {
                try {
                  await bookInventoryForTask(
                    materialId,
                    batchSelection.quantity,
                    id,
                    userId,
                    'manual',
                    batchSelection.batchId  // Przekazujemy ID konkretnej partii
                  );
                } catch (error) {
                  console.error(`Błąd podczas rezerwacji partii ${batchSelection.batchNumber} materiału ${material.name}:`, error);
                  errors.push(`Nie można zarezerwować partii ${batchSelection.batchNumber} materiału ${material.name}: ${error.message}`);
                }
              }
              
              reservedItems.push({
                itemId: materialId,
                name: material.name,
                quantity: material.quantity,
                unit: material.unit
              });
            } catch (error) {
              console.error(`Błąd podczas rezerwacji materiału ${material.name}:`, error);
              errors.push(`Nie można zarezerwować materiału ${material.name}: ${error.message}`);
            }
          }
        } catch (error) {
          console.error('Błąd podczas przetwarzania rezerwacji ręcznych:', error);
          showError('Wystąpił błąd podczas przetwarzania rezerwacji: ' + error.message);
          setReservingMaterials(false);
          return;
        }
        
        // Zwróć informację o wyniku operacji
        if (errors.length === 0) {
          showSuccess(`Zarezerwowano wszystkie ${reservedItems.length} materiały dla zadania`);
        } else {
          // Jeśli mamy częściowy sukces (część materiałów zarezerwowana, część nie)
          if (reservedItems.length > 0) {
            showInfo(`Zarezerwowano częściowo: ${reservedItems.length} z ${task.materials.length} materiałów`);
          }
          
          if (errors.length > 0) {
            showError(`Błędy: ${errors.join(', ')}`);
          }
        }
      } else {
        // Standardowa rezerwacja automatyczna (FIFO lub według daty ważności)
        console.log("Wykonuję automatyczną rezerwację materiałów metodą:", reservationMethod);
        const userId = currentUser?.uid || 'system';
        const result = await reserveMaterialsForTask(id, userId, reservationMethod);
        console.log("Wynik automatycznej rezerwacji materiałów:", result);
        
        if (result.success) {
          showSuccess(result.message);
        } else {
          // Jeśli mamy częściowy sukces (część materiałów zarezerwowana, część nie)
          if (result.reservedItems && result.reservedItems.length > 0) {
            showInfo(`Zarezerwowano częściowo: ${result.reservedItems.length} z ${task.materials.length} materiałów`);
          }
          
          if (result.errors && result.errors.length > 0) {
            showError(`Błędy: ${result.errors.join(', ')}`);
          }
        }
      }
      
      // Aktualizuj stan rezerwacji materiałów w zadaniu
      console.log("Aktualizacja statusu zadania - materiały zarezerwowane");
      const taskRef = doc(db, 'productionTasks', id);
      await updateDoc(taskRef, {
        materialsReserved: true,
        reservationComplete: true,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser?.uid || 'system'
      });
      
      // Odśwież dane zadania
      console.log("Pobieranie zaktualizowanych danych zadania po rezerwacji");
      const updatedTask = await getTaskById(id);
      console.log("Zaktualizowane dane zadania:", updatedTask);
      setTask(updatedTask);
      
      // Oblicz koszty materiałów po zaktualizowaniu zadania
      await updateMaterialPricesFromBatches();
      
      setReserveDialogOpen(false);
    } catch (error) {
      console.error('Błąd podczas rezerwacji materiałów:', error);
      showError('Nie udało się zarezerwować materiałów: ' + error.message);
    } finally {
      setReservingMaterials(false);
    }
  };
  
  // Renderowanie komponentu do ręcznego wyboru partii
  const renderManualBatchSelection = () => {
    if (!task || !task.materials || task.materials.length === 0) {
      return <Typography>Brak materiałów do zarezerwowania</Typography>;
    }
    
    if (materialBatchesLoading) {
    return (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
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
          
          let materialBatches = availableBatches[materialId] || [];
          const selectedMaterialBatches = selectedBatches[materialId] || [];
          const totalSelectedQuantity = selectedMaterialBatches.reduce((sum, batch) => sum + batch.quantity, 0);
          const isComplete = totalSelectedQuantity >= material.quantity;
          
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
                  <Box>
                    <Chip
                      label={`${totalSelectedQuantity.toFixed(3)} / ${parseFloat(material.quantity).toFixed(3)} ${material.unit}`}
                      color={isComplete ? "success" : "warning"}
                      size="small"
                      sx={{ mr: 1 }}
                    />
                  </Box>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                {materialBatches.length === 0 ? (
                  <Typography color="error">
                    Brak dostępnych partii dla tego materiału
                  </Typography>
                ) : (
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
                )}
              </AccordionDetails>
            </Accordion>
          );
        })}
      </Box>
    );
  };

  // Funkcja zwracająca nazwę użytkownika zamiast ID
  const getUserName = (userId) => {
    return userNames[userId] || userId || 'System';
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
                </tr>
              </thead>
              <tbody>
                ${report.materials.map(material => {
                  const materialId = material.inventoryItemId || material.id;
                  const reservedBatches = task.materialBatches && task.materialBatches[materialId];
                  const hasReservedBatches = reservedBatches && reservedBatches.length > 0;
                  
                  // Oblicz koszt materiału
                  const quantity = material.quantity || 0;
                  const unitPrice = material.unitPrice || 0;
                  const cost = quantity * unitPrice;
                  
                  return `
                    <tr class="${hasReservedBatches ? 'reserved' : 'not-reserved'}">
                      <td>${material.name}</td>
                      <td>${material.quantity}</td>
                      <td>${material.unit}</td>
                      <td>${hasReservedBatches ? unitPrice.toFixed(2) + ' €' : '—'}</td>
                      <td>${hasReservedBatches ? cost.toFixed(2) + ' €' : '—'}</td>
                      <td>${hasReservedBatches ? 'Zarezerwowano' : 'Nie zarezerwowano'}</td>
                    </tr>
                  `;
                }).join('')}
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
          
          <div class="section">
            <h3>Podsumowanie kosztów</h3>
            <table>
              <tr>
                <th>Całkowity koszt materiałów:</th>
                <td>
                  ${report.materials.reduce((sum, material) => {
                    const materialId = material.inventoryItemId || material.id;
                    const reservedBatches = task.materialBatches && task.materialBatches[materialId];
                    
                    // Uwzględnij koszt tylko jeśli materiał ma zarezerwowane partie
                    if (reservedBatches && reservedBatches.length > 0) {
                      const quantity = material.quantity || 0;
                      const unitPrice = material.unitPrice || 0;
                      return sum + (quantity * unitPrice);
                    }
                    return sum;
                  }, 0).toFixed(2)} €
                </td>
              </tr>
              <tr>
                <th>Koszt materiałów na jednostkę produktu:</th>
                <td>
                  ${task.quantity ? 
                    (report.materials.reduce((sum, material) => {
                      const materialId = material.inventoryItemId || material.id;
                      const reservedBatches = task.materialBatches && task.materialBatches[materialId];
                      
                      // Uwzględnij koszt tylko jeśli materiał ma zarezerwowane partie
                      if (reservedBatches && reservedBatches.length > 0) {
                        const quantity = material.quantity || 0;
                        const unitPrice = material.unitPrice || 0;
                        return sum + (quantity * unitPrice);
                      }
                      return sum;
                    }, 0) / task.quantity).toFixed(2) 
                    : '0.00'} €/${task.unit}
                </td>
              </tr>
            </table>
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
      const allItems = await getAllInventoryItems();
      // Filtrujemy tylko opakowania
      const packagingItems = allItems.filter(item => item.category === 'Opakowania');
      
      setAvailablePackaging(packagingItems.map(item => ({
        ...item,
        selected: false,
        quantity: 0,
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
    setAvailablePackaging(prev => prev.map(item => 
      item.id === id ? { ...item, quantity: parseFloat(value) || 0, selected: parseFloat(value) > 0 } : item
    ));
  };
  
  // Obsługa wyboru/odznaczenia opakowania
  const handlePackagingSelection = (id, selected) => {
    setAvailablePackaging(prev => prev.map(item => 
      item.id === id ? { ...item, selected } : item
    ));
  };
  
  // Dodanie wybranych opakowań do materiałów zadania
  const handleAddPackagingToTask = async () => {
    try {
      setLoadingPackaging(true);
      
      // Filtrujemy wybrane opakowania
      const packagingToAdd = availablePackaging.filter(item => item.selected && item.quantity > 0);
      
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
        category: 'Opakowania',
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
            <tr><th>Szacowany czas produkcji:</th><td>${task.estimatedDuration ? task.estimatedDuration.toFixed(1) + ' godz.' : 'Nie określono'}</td></tr>
            <tr><th>Czas na jednostkę:</th><td>${task.productionTimePerUnit ? task.productionTimePerUnit + ' min./szt.' : 'Nie określono'}</td></tr>
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

  // Funkcja do aktualizacji cen materiałów na podstawie zarezerwowanych partii
  const updateMaterialPricesFromBatches = useCallback(async () => {
    try {
      if (!task || !task.id || !task.materialBatches) {
        console.warn("Brak zadania, identyfikatora zadania lub partii materiałów");
        return;
      }
      
      // Sprawdź, czy dokument zadania istnieje
      const taskDocRef = doc(db, 'productionTasks', task.id);
      const taskSnapshot = await getDoc(taskDocRef);
      
      if (!taskSnapshot.exists()) {
        console.warn(`Dokument zadania o ID ${task.id} nie istnieje`);
        return;
      }
      
      let newMaterials = [...(task.materials || [])];
      let totalMaterialCost = 0;
      let materialPricesChanged = false;
      
      // Przetwarzanie wszystkich partii materiałów z zadania
      for (const materialId in task.materialBatches) {
        const batches = task.materialBatches[materialId] || [];
        
        for (const batch of batches) {
          const materialIndex = newMaterials.findIndex(m => 
            (m.inventoryItemId === materialId) || (m.id === materialId)
          );
          
          if (materialIndex !== -1) {
            // Pobierz aktualne dane partii
            try {
              const batchData = await getInventoryBatch(batch.batchId);
              if (batchData) {
                console.log(`Dane partii ${batch.batchId} (${batchData.batchNumber || 'bez numeru'}):`, 
                  { unitPrice: batchData.unitPrice, baseUnitPrice: batchData.baseUnitPrice, additionalCostPerUnit: batchData.additionalCostPerUnit });
                
                const batchQuantity = parseFloat(batch.quantity) || 0;
                
                // Upewnij się, że używamy pełnej ceny (z dodatkowymi kosztami) a nie tylko ceny bazowej
                let batchUnitPrice = parseFloat(batchData.unitPrice) || 0;
                
                // Zabezpieczenie przed stratą danych - jeśli cena z partii jest podejrzanie niska,
                // a materiał ma już wyższą cenę, zachowaj wyższą cenę
                const existingUnitPrice = newMaterials[materialIndex].unitPrice || 0;
                if (batchUnitPrice < 0.1 && existingUnitPrice > batchUnitPrice) {
                  console.warn(`Wykryto podejrzanie niską cenę partii (${batchUnitPrice}). Zachowuję istniejącą cenę (${existingUnitPrice}).`);
                  batchUnitPrice = existingUnitPrice;
                }
                
                // Sprawdź czy cena zawiera dodatkowe koszty
                if (batchData.baseUnitPrice !== undefined && batchData.additionalCostPerUnit !== undefined) {
                  const basePrice = parseFloat(batchData.baseUnitPrice) || 0;
                  const additionalCost = parseFloat(batchData.additionalCostPerUnit) || 0;
                  
                  // Upewnij się, że unitPrice faktycznie zawiera dodatkowe koszty
                  const expectedPrice = basePrice + additionalCost;
                  if (Math.abs(batchUnitPrice - expectedPrice) > 0.01) {
                    console.warn(`Cena jednostkowa (${batchUnitPrice}) nie zgadza się z sumą ceny bazowej i dodatkowych kosztów (${expectedPrice}). Używam prawidłowej wartości.`);
                    batchUnitPrice = expectedPrice;
                  }
                }
                
                const oldUnitPrice = newMaterials[materialIndex].unitPrice || 0;
                
                // Log porównawczy cen
                console.log(`Materiał ${newMaterials[materialIndex].name}: cena obecna=${oldUnitPrice}, nowa cena=${batchUnitPrice}`);
                
                if (oldUnitPrice !== batchUnitPrice) {
                  newMaterials[materialIndex].unitPrice = batchUnitPrice;
                  materialPricesChanged = true;
                }
                
                totalMaterialCost += (batchUnitPrice * batchQuantity);
              }
            } catch (error) {
              console.error(`Błąd podczas pobierania danych partii ${batch.batchId}:`, error);
            }
          }
        }
      }
      
      // Aktualizuj tylko jeśli ceny materiałów się zmieniły
      if (materialPricesChanged) {
        const currentTotalMaterialCost = task.totalMaterialCost || 0;
        const currentUnitMaterialCost = task.unitMaterialCost || 0;
        
        const newUnitMaterialCost = task.quantity > 0 ? totalMaterialCost / task.quantity : 0;
        
        // Aktualizuj tylko jeśli wartości kosztów się zmieniły
        if (currentTotalMaterialCost !== totalMaterialCost || currentUnitMaterialCost !== newUnitMaterialCost) {
          // Przygotuj obiekt historii kosztów
          const costHistoryItem = {
            timestamp: new Date().toISOString(), // Używamy ISO string zamiast serverTimestamp()
            userId: currentUser.uid,
            userName: currentUser.displayName || 'Użytkownik',
            previousTotalCost: currentTotalMaterialCost,
            newTotalCost: totalMaterialCost,
            previousUnitCost: currentUnitMaterialCost,
            newUnitCost: newUnitMaterialCost,
            reason: 'Aktualizacja cen materiałów'
          };
          
          // Pobierz istniejącą historię kosztów lub utwórz pustą tablicę
          const costHistory = task.costHistory || [];
          costHistory.push(costHistoryItem);
          
          // Przygotuj dane do aktualizacji
          const updateData = {
            materials: newMaterials,
            totalMaterialCost: totalMaterialCost,
            unitMaterialCost: newUnitMaterialCost,
            costLastUpdatedAt: serverTimestamp(),
            costLastUpdatedBy: currentUser.uid,
            costHistory: costHistory,
            updatedAt: serverTimestamp(),
            updatedBy: currentUser.uid
          };
          
          // Zaktualizuj dokument w bazie danych
          await updateDoc(taskDocRef, updateData);
          
          // Aktualizuj również stan lokalny
          setTotalMaterialCost(totalMaterialCost);
          setUnitMaterialCost(newUnitMaterialCost);
          setMaterials(newMaterials);
          
          console.log("Zaktualizowano koszty materiałów dla zadania", task.id);
          console.log("Nowy koszt całkowity:", totalMaterialCost);
          console.log("Nowy koszt jednostkowy:", newUnitMaterialCost);
        }
      }
    } catch (error) {
      console.error("Błąd podczas aktualizacji cen materiałów:", error);
      showError("Wystąpił błąd podczas aktualizacji kosztów materiałów: " + error.message);
    }
  }, [task, currentUser, showError]);
  
  // Aktualizuj ceny materiałów tylko przy zmianie materialBatches
  useEffect(() => {
    if (task && task.materialBatches && !loading) {
      // Używamy referencji z komponentu, nie tworzymy nowej wewnątrz efektu
      const materialBatchesStr = JSON.stringify(task.materialBatches);
      
      if (previousMaterialBatchesRef.current !== materialBatchesStr) {
        updateMaterialPricesFromBatches();
        previousMaterialBatchesRef.current = materialBatchesStr;
      }
    }
  }, [task?.materialBatches, updateMaterialPricesFromBatches, task, loading]);

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
          <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <Typography variant="h6">Podsumowanie kosztów materiałów</Typography>
              </Grid>
              <Grid item xs={12} md={6} sx={{ textAlign: 'right' }}>
                <Typography variant="body1">
                  <strong>Całkowity koszt materiałów:</strong>{' '}
                  <Box component="span" sx={{ 
                    fontWeight: 'bold', 
                    color: 'primary.main',
                    fontSize: '1.1rem'
                  }}>
                    {totalMaterialCost.toFixed(2)} €
                  </Box>
                </Typography>
                <Typography variant="body1" sx={{ mt: 1 }}>
                  <strong>Koszt materiałów na jednostkę:</strong>{' '}
                  <Box component="span" sx={{ 
                    fontWeight: 'bold', 
                    color: 'primary.main',
                    fontSize: '1.1rem'
                  }}>
                    {unitMaterialCost.toFixed(2)} €/{task.unit}
                  </Box>
                </Typography>
              </Grid>
            </Grid>
                  </Box>
        </Paper>
            </Grid>
            
            {/* Sekcja historii produkcji */}
            <Grid item xs={12}>
              <Paper sx={{ p: 3 }}>
                <Typography variant="h6" component="h2" gutterBottom>
                  Historia produkcji
                </Typography>
                
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
          
            {/* Pozostałe sekcje... */}
          </Grid>
            </>
      )}

      {/* Dialogi (potwierdzenie, produkcja, itp.) */}
      {/* ... */}

      {/* Dialog rezerwacji materiałów */}
      <Dialog
        open={reserveDialogOpen}
        onClose={() => setReserveDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Rezerwacja surowców</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Wybierz metodę rezerwacji surowców dla tego zadania produkcyjnego.
          </DialogContentText>
          
          <FormControl component="fieldset" sx={{ mb: 2, mt: 2 }}>
            <FormLabel component="legend">Metoda rezerwacji składników</FormLabel>
            <RadioGroup
              row
              name="reservationMethod"
              value={reservationMethod}
              onChange={handleReservationMethodChange}
            >
              <FormControlLabel 
                value="fifo" 
                control={<Radio />} 
                label="FIFO (First In, First Out)" 
              />
              <FormControlLabel 
                value="expiry" 
                control={<Radio />} 
                label="Według daty ważności (najkrótszej)" 
              />
              <FormControlLabel 
                value="manual" 
                control={<Radio />} 
                label="Ręczny wybór partii" 
              />
            </RadioGroup>
          </FormControl>
          
          {reservationMethod === 'manual' && renderManualBatchSelection()}
          
          {reservationMethod !== 'manual' && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
              Rezerwacja blokuje materiały w magazynie na potrzeby tego zadania produkcyjnego, 
              zapewniając ich dostępność w momencie rozpoczęcia produkcji.
                </Typography>
              )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReserveDialogOpen(false)}>
            Anuluj
          </Button>
          <Button 
            onClick={handleReserveMaterials} 
            variant="contained"
            disabled={reservingMaterials}
          >
            {reservingMaterials ? <CircularProgress size={24} /> : 'Rezerwuj materiały'}
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
            Czy na pewno chcesz usunąć to zadanie produkcyjne? Ta operacja jest nieodwracalna.
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

      {/* Dialog dodawania opakowań */}
      <Dialog
        open={packagingDialogOpen}
        onClose={() => setPackagingDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Dodaj opakowania do zadania produkcyjnego</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Wybierz opakowania, które chcesz dodać do tego zadania produkcyjnego (np. palety, folia, kartony).
          </DialogContentText>
          
          {loadingPackaging ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
              <CircularProgress />
            </Box>
          ) : (
            <TableContainer component={Paper} sx={{ mt: 2 }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">Wybierz</TableCell>
                    <TableCell>Nazwa</TableCell>
                    <TableCell>Dostępna ilość</TableCell>
                    <TableCell>Jednostka</TableCell>
                    <TableCell>Cena jedn.</TableCell>
                    <TableCell>Ilość do dodania</TableCell>
                    <TableCell>Koszt</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {availablePackaging.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center">
                        Brak dostępnych opakowań
                      </TableCell>
                    </TableRow>
                  ) : (
                    availablePackaging.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={item.selected}
                            onChange={(e) => handlePackagingSelection(item.id, e.target.checked)}
                          />
                        </TableCell>
                        <TableCell>{item.name}</TableCell>
                        <TableCell>{item.currentQuantity || 0}</TableCell>
                        <TableCell>{item.unit}</TableCell>
                        <TableCell>{item.unitPrice ? item.unitPrice.toFixed(2) : '0.00'} €</TableCell>
                        <TableCell>
                          <TextField
                            type="number"
                            value={item.quantity}
                            onChange={(e) => handlePackagingQuantityChange(item.id, e.target.value)}
                            disabled={!item.selected}
                            inputProps={{ min: 0, step: 'any' }}
                            size="small"
                            sx={{ width: '100px' }}
                          />
                        </TableCell>
                        <TableCell>{(item.quantity * (item.unitPrice || 0)).toFixed(2)} €</TableCell>
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
            disabled={loadingPackaging || availablePackaging.filter(item => item.selected && item.quantity > 0).length === 0}
          >
            {loadingPackaging ? <CircularProgress size={24} /> : 'Dodaj opakowania'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog zatrzymania produkcji */}
      <Dialog
        open={stopProductionDialogOpen}
        onClose={() => setStopProductionDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Zatrzymaj produkcję</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Wprowadź informacje o zakończonej sesji produkcyjnej
          </DialogContentText>
          
          {productionError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {productionError}
            </Alert>
          )}

          <TextField
            label="Wyprodukowana ilość"
            type="number"
            value={completedQuantity}
            onChange={(e) => setCompletedQuantity(e.target.value)}
            fullWidth
            margin="dense"
            InputProps={{
              endAdornment: <Typography variant="body2">{task?.unit || 'szt.'}</Typography>
            }}
          />
          
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, my: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Przedział czasowy produkcji:
            </Typography>
            
            <TextField
              label="Czas rozpoczęcia"
              type="datetime-local"
              value={productionStartTime instanceof Date 
                ? productionStartTime.toISOString().slice(0, 16) 
                : ''}
              onChange={(e) => {
                const newDate = e.target.value ? new Date(e.target.value) : new Date();
                setProductionStartTime(newDate);
              }}
              fullWidth
              margin="dense"
              variant="outlined"
              InputLabelProps={{
                shrink: true,
              }}
            />
            
            <TextField
              label="Czas zakończenia"
              type="datetime-local"
              value={productionEndTime instanceof Date 
                ? productionEndTime.toISOString().slice(0, 16) 
                : ''}
              onChange={(e) => {
                const newDate = e.target.value ? new Date(e.target.value) : new Date();
                setProductionEndTime(newDate);
              }}
              fullWidth
              margin="dense"
              variant="outlined"
              InputLabelProps={{
                shrink: true,
              }}
            />
            
            {productionStartTime && productionEndTime && (
              <Typography variant="body2" color="textSecondary">
                Czas trwania: {Math.round((productionEndTime.getTime() - productionStartTime.getTime()) / (1000 * 60))} minut
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStopProductionDialogOpen(false)}>
            Anuluj
          </Button>
          <Button onClick={handleStopProduction} variant="contained">
            Zatwierdź
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default TaskDetailsPage; 