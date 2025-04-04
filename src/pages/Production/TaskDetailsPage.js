import React, { useState, useEffect, useCallback } from 'react';
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
  ExpandMore as ExpandMoreIcon
} from '@mui/icons-material';
import { getTaskById, updateTaskStatus, deleteTask, updateActualMaterialUsage, confirmMaterialConsumption, addTaskProductToInventory, startProduction, stopProduction, getProductionHistory, reserveMaterialsForTask } from '../../services/productionService';
import { getItemBatches, bookInventoryForTask } from '../../services/inventoryService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { formatDate, formatCurrency, formatDateTime } from '../../utils/formatters';
import { PRODUCTION_TASK_STATUSES, TIME_INTERVALS } from '../../utils/constants';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { pl } from 'date-fns/locale';
import TaskDetails from '../../components/production/TaskDetails';

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

  const fetchTask = async () => {
    try {
      setLoading(true);
      const fetchedTask = await getTaskById(id);
      
      if (!fetchedTask) {
        showError('Zadanie produkcyjne nie istnieje');
        navigate('/production');
        return;
      }
      
      console.log('Pobrano zadanie produkcyjne:', fetchedTask);
      
      // Jeśli zadanie ma przypisane orderId, pobierz pełne dane zamówienia
      if (fetchedTask.orderId) {
        try {
          const { getOrderById } = await import('../../services/orderService');
          const orderData = await getOrderById(fetchedTask.orderId);
          
          if (orderData) {
            console.log('Pobrano dane zamówienia klienta:', orderData);
            
            // Dodaj dane klienta do zadania
            if (orderData.customer) {
              fetchedTask.customer = orderData.customer;
            }
            
            // Dodaj numer zamówienia do zadania
            if (orderData.number) {
              fetchedTask.orderNumber = orderData.number;
            }
            
            // Pobierz dane powiązanych zamówień zakupu
            if (orderData.linkedPurchaseOrders && orderData.linkedPurchaseOrders.length > 0) {
              console.log('Zamówienie ma powiązane PO:', orderData.linkedPurchaseOrders);
              
              // Przypisz powiązane PO do zadania
              fetchedTask.purchaseOrders = orderData.linkedPurchaseOrders.map(po => ({
                id: po.id,
                poNumber: po.number,
                supplier: po.supplier,
                status: po.status,
                totalValue: po.totalValue,
                totalGross: po.totalGross
              }));
            }
          }
        } catch (error) {
          console.error('Błąd podczas pobierania danych zamówienia:', error);
        }
      }
      
      setTask(fetchedTask);
      
      // Przygotuj materiały do wyświetlenia
      if (fetchedTask?.materials?.length > 0) {
        // Użyj wartości quantity z materiałów - to jest całkowite zapotrzebowanie
        const materialsList = fetchedTask.materials.map(material => ({
          ...material,
          // Nie tworzymy plannedQuantity, bo używamy bezpośrednio wartości quantity,
          // która reprezentuje całkowite zapotrzebowanie
        }));
        
        setMaterials(materialsList);
        
        // Inicjalizacja rzeczywistych ilości
        const quantities = {};
        materialsList.forEach(material => {
          const actualQuantity = fetchedTask.actualMaterialUsage && fetchedTask.actualMaterialUsage[material.id] !== undefined
            ? fetchedTask.actualMaterialUsage[material.id]
            : material.quantity; // Używamy bezpośrednio wartości quantity jako domyślnej
          
          quantities[material.id] = actualQuantity;
        });
        
        setMaterialQuantities(quantities);
      }
    } catch (error) {
      showError('Błąd podczas pobierania zadania: ' + error.message);
      console.error('Error fetching task:', error);
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

  const handleStatusChange = async (newStatus) => {
    try {
      if (newStatus === 'Zakończone' && !task.materialConsumptionConfirmed && task.materials && task.materials.length > 0) {
        setConsumptionDialogOpen(true);
        return;
      }

      setLoading(true);
      await updateTaskStatus(id, newStatus, currentUser.uid);
      
      setAlert({
        open: true,
        severity: 'success',
        message: `Status zmieniony na: ${newStatus}`
      });
      
      // Odśwież dane zadania
      const updatedTask = await getTaskById(id);
      setTask(updatedTask);
    } catch (error) {
      console.error('Błąd podczas zmiany statusu:', error);
      setAlert({
        open: true,
        severity: 'error',
        message: `Błąd podczas zmiany statusu: ${error.message}`
      });
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
    if (window.confirm('Czy na pewno chcesz usunąć to zadanie produkcyjne?')) {
      try {
        await deleteTask(id);
        showSuccess('Zadanie zostało usunięte');
        navigate('/production');
      } catch (error) {
        showError('Błąd podczas usuwania zadania: ' + error.message);
        console.error('Error deleting task:', error);
      }
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
              color="success" 
              startIcon={<CompleteIcon />}
              onClick={() => handleStatusChange('Zakończone')}
              sx={{ mr: 1 }}
            >
              Zakończ produkcję
            </Button>
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
        const unitPrice = task.costs && task.quantity ? 
          Number(task.costs.totalCost / task.quantity) : 0;
        
        // Generujemy LOT na podstawie numeru zadania produkcyjnego (MO)
        const lotNumber = task.moNumber ? `LOT-${task.moNumber}` : `LOT-PROD-${id.substring(0, 6)}`;
          
        navigate(`/inventory/${task.inventoryProductId}/receive?poNumber=PROD-${id.substring(0, 6)}&quantity=${task.quantity}&unitPrice=${unitPrice}&reason=production&lotNumber=${lotNumber}&source=production&sourceId=${id}`);
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
    try {
      setProductionError(null);
      
      if (!completedQuantity) {
        setProductionError('Podaj wyprodukowaną ilość');
        return;
      }

      const quantity = parseFloat(completedQuantity);
      
      if (isNaN(quantity) || quantity < 0) {
        setProductionError('Nieprawidłowa ilość');
        return;
      }
      
      if (!productionStartTime || !productionEndTime) {
        setProductionError('Podaj przedział czasowy produkcji');
        return;
      }
      
      if (productionEndTime < productionStartTime) {
        setProductionError('Czas zakończenia nie może być wcześniejszy niż czas rozpoczęcia');
        return;
      }
      
      // Oblicz czas trwania w minutach
      const durationMs = productionEndTime.getTime() - productionStartTime.getTime();
      const durationMinutes = Math.round(durationMs / (1000 * 60));
      
      if (durationMinutes <= 0) {
        setProductionError('Przedział czasowy musi być dłuższy niż 0 minut');
        return;
      }

      // Przekazujemy czas trwania w minutach oraz daty rozpoczęcia i zakończenia
      const result = await stopProduction(
        id, 
        quantity, 
        durationMinutes, 
        currentUser.uid, 
        {
          startTime: productionStartTime.toISOString(),
          endTime: productionEndTime.toISOString()
        }
      );
      
      setStopProductionDialogOpen(false);
      showSuccess(result.isCompleted ? 
        'Produkcja zakończona. Zadanie zostało ukończone.' : 
        'Sesja produkcyjna zapisana. Możesz kontynuować produkcję później.'
      );
      
      // Resetuj stan formularza
      setCompletedQuantity('');
      setProductionStartTime(new Date());
      setProductionEndTime(new Date());
      
      // Odśwież dane
      await fetchTask();
      // Po zaktualizowaniu zadania, odśwież także historię produkcji
      await fetchProductionHistory();
    } catch (error) {
      showError('Błąd podczas zatrzymywania produkcji: ' + error.message);
      console.error('Error stopping production:', error);
    }
  };

  // Nowa funkcja do obsługi pobrania partii dla materiałów
  const fetchBatchesForMaterials = async () => {
    if (!task || !task.materials || task.materials.length === 0) return;
    
    setMaterialBatchesLoading(true);
    const batchesData = {};
    const initialSelectedBatches = {};
    
    try {
      for (const material of task.materials) {
        const materialId = material.inventoryItemId || material.id;
        if (!materialId) continue;
        
        try {
          const batches = await getItemBatches(materialId);
          
          // Filtruj tylko partie z dostępną ilością
          const availableBatchesForMaterial = batches.filter(batch => batch.quantity > 0);
          
          // Sortuj według daty ważności (od najwcześniejszej)
          availableBatchesForMaterial.sort((a, b) => {
            if (!a.expiryDate && !b.expiryDate) return 0;
            if (!a.expiryDate) return 1;
            if (!b.expiryDate) return -1;
            return new Date(a.expiryDate) - new Date(b.expiryDate);
          });
          
          batchesData[materialId] = availableBatchesForMaterial;
          initialSelectedBatches[materialId] = [];
          
        } catch (error) {
          console.error(`Błąd podczas pobierania partii dla materiału ${material.name}:`, error);
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
      
      // Jeśli wybrano ręczny wybór partii
      if (reservationMethod === 'manual') {
        if (!validateManualBatchSelection()) {
          setReservingMaterials(false);
          return;
        }
        
        const errors = [];
        const reservedItems = [];
        const userId = currentUser?.uid || 'system';
        
        // Dla każdego materiału w zadaniu
        for (const material of task.materials) {
          const materialId = material.inventoryItemId || material.id;
          if (!materialId) continue;
          
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
        const result = await reserveMaterialsForTask(id, task.materials, reservationMethod);
        
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
      
      // Odśwież dane zadania
      const updatedTask = await getTaskById(id);
      setTask(updatedTask);
      
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
          
          const materialBatches = availableBatches[materialId] || [];
          const selectedMaterialBatches = selectedBatches[materialId] || [];
          const totalSelectedQuantity = selectedMaterialBatches.reduce((sum, batch) => sum + batch.quantity, 0);
          const isComplete = totalSelectedQuantity >= material.quantity;
          
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
                      label={`${totalSelectedQuantity} / ${material.quantity} ${material.unit}`}
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
                          <TableCell>Do rezerwacji</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {materialBatches.map((batch) => {
                          const selectedBatch = selectedMaterialBatches.find(b => b.batchId === batch.id);
                          const selectedQuantity = selectedBatch ? selectedBatch.quantity : 0;
                          
                          return (
                            <TableRow key={batch.id}>
                              <TableCell>
                                {batch.batchNumber || batch.lotNumber || 'Bez numeru'}
                              </TableCell>
                              <TableCell>
                                {batch.expiryDate ? formatDate(batch.expiryDate) : 'Brak'}
                              </TableCell>
                              <TableCell>{batch.quantity} {material.unit}</TableCell>
                              <TableCell>
                                <TextField
                                  type="number"
                                  value={selectedQuantity}
                                  onChange={(e) => {
                                    const value = parseFloat(e.target.value);
                                    const quantity = isNaN(value) ? 0 : Math.min(value, batch.quantity);
                                    handleBatchSelection(materialId, batch.id, quantity);
                                  }}
                                  inputProps={{ 
                                    min: 0, 
                                    max: batch.quantity,
                                    step: 'any'
                                  }}
                                  size="small"
                                  sx={{ width: '100px' }}
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
        <IconButton 
          color="primary"
          component={Link}
          to={`/production/tasks/${id}/edit`}
          sx={{ mr: 1 }}
        >
                <EditIcon />
              </IconButton>
              <IconButton color="error" onClick={() => setDeleteDialog(true)}>
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

            {/* Sekcja materiałów */}
            <Grid item xs={12}>
              <Paper sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6" component="h2">Materiały</Typography>
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
                
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                        <TableCell>Nazwa</TableCell>
                        <TableCell>Ilość</TableCell>
                        <TableCell>Jednostka</TableCell>
                        <TableCell>Rzeczywista ilość</TableCell>
                        <TableCell>Zarezerwowane partie (LOT)</TableCell>
                        <TableCell>Edytuj</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {materials.map((material) => {
                        // Sprawdź czy dla tego materiału są zarezerwowane partie
                        const materialId = material.inventoryItemId || material.id;
                        const reservedBatches = task.materialBatches && task.materialBatches[materialId];
                    
                    return (
                      <TableRow key={material.id}>
                        <TableCell>{material.name}</TableCell>
                            <TableCell>{material.quantity}</TableCell>
                            <TableCell>{material.unit}</TableCell>
                            <TableCell>{materialQuantities[material.id] || 0}</TableCell>
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
                                      sx={{ mr: 0.5, mb: 0.5 }}
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
                              <IconButton 
                                color="primary" 
                                onClick={() => {
                                  setEditMode(true);
                                  setMaterialQuantities(prev => ({
                                    ...prev,
                                    [material.id]: materialQuantities[material.id] || 0
                                  }));
                                }}
                              >
                                <EditIcon />
                              </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </TableContainer>
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
    </Container>
  );
};

export default TaskDetailsPage; 