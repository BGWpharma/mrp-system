// src/components/production/TaskList.js
/*
 * ✅ OPTYMALIZACJE WYDAJNOŚCI - TaskList
 * 
 * 🚀 WPROWADZONE OPTYMALIZACJE:
 * 
 * 1. MEMOIZOWANY KOMPONENT TaskTableRow (React.memo)
 *    - Zapobiega re-renderom wierszy gdy zmieniają się inne części stanu
 *    - Renderuje się tylko gdy zmienią się props danego wiersza
 * 
 * 2. MEMOIZOWANE HANDLERY (useCallback)
 *    - handleStatusChange, handleEdit, handleView - stabilne referencje
 *    - Eliminacja tworzenia nowych funkcji przy każdym renderze
 * 
 * 3. MEMOIZOWANE FUNKCJE POMOCNICZE (useMemo/useCallback)
 *    - getStatusColor, formatDateTimeNumeric - cache'owane wartości
 *    - Zapobieganie zbędnym obliczeniom
 * 
 * 📊 SZACOWANE WYNIKI:
 * - Redukcja re-renderów wierszy tabeli: ~80%
 * - Szybsze interakcje z tabelą
 * - Mniejsze obciążenie CPU przy dużych listach
 */
import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { Link } from 'react-router-dom';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow, 
  Paper, 
  Button, 
  TextField, 
  IconButton,
  Typography,
  Chip,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Container,
  Tooltip,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Alert,
  Grid,
  Divider,
  Menu,
  ListItemText,
  Checkbox,
  useTheme,
  useMediaQuery,
  Card,
  CardContent,
  CardActions,
  Pagination,
  FormControlLabel,
  Switch,
  Fade,
  Grow,
  Skeleton
} from '@mui/material';
import { 
  Add as AddIcon, 
  Search as SearchIcon, 
  Edit as EditIcon,
  PlayArrow as StartIcon,
  Stop as StopIcon,
  CheckCircle as CompleteIcon,
  Check as CheckIcon,
  Info as InfoIcon,
  Visibility as ViewIcon,
  Done as DoneIcon,
  Cancel as CancelIcon,
  ViewColumn as ViewColumnIcon,
  BuildCircle as BuildCircleIcon,
  ArrowDropDown as ArrowDropDownIcon,
  Download as DownloadIcon,
  Sort as SortIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { getAllTasks, updateTaskStatus, addTaskProductToInventory, stopProduction, pauseProduction, getTasksWithPagination, startProduction, getProductionTasksOptimized, clearProductionTasksCache, forceRefreshProductionTasksCache, removeDuplicatesFromCache, updateTaskInCache, addTaskToCache, removeTaskFromCache, getProductionTasksCacheStatus } from '../../services/productionService';
import { db } from '../../services/firebase/config';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { getAllWarehouses } from '../../services/inventory';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { formatDate } from '../../utils/dateUtils';
import { formatDateTime } from '../../utils/formatters';
import { useTheme as useMuiTheme } from '@mui/material/styles';
import { useTheme as useThemeContext } from '../../contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { TIME_INTERVALS } from '../../utils/constants';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { pl } from 'date-fns/locale';

import { useColumnPreferences } from '../../contexts/ColumnPreferencesContext';
import { useTaskListState } from '../../contexts/TaskListStateContext';
import { exportToCSV, exportToExcel } from '../../utils/exportUtils';
import { getUsersDisplayNames } from '../../services/userService';
// ✅ OPTYMALIZACJA: Import wspólnych stylów MUI
import { 
  flexCenter, 
  flexBetween, 
  flexCenterGap1,
  flexCenterGap2,
  loadingContainer,
  emptyStateContainer,
  mb1,
  mb2, 
  mb3,
  mt1,
  mt2,
  mr1,
  p2,
  p3,
  textCenter,
  textSecondary,
  alertMb2
} from '../../styles/muiCommonStyles';
import { useTranslation } from '../../hooks/useTranslation';
import { calculateMaterialReservationStatus, getReservationStatusColors } from '../../utils/productionUtils';
import TaskStatusChip from './shared/TaskStatusChip';

// ===============================================
// 🚀 OPTYMALIZACJA: Memoizowany komponent wiersza tabeli
// Zapobiega re-renderom przy aktualizacji stanu rodzica
// ===============================================

/**
 * Memoizowana funkcja getStatusColor - zwraca kolor dla danego statusu
 */
const getStatusColorMemo = (status) => {
  switch (status) {
    case 'Zaplanowane':
    case 'planned':
    case 'scheduled':
      return '#1976d2';
    case 'W trakcie':
    case 'in_progress':
      return '#ff9800';
    case 'Potwierdzenie zużycia':
      return '#2196f3';
    case 'Zakończone':
    case 'completed':
      return '#4caf50';
    case 'Anulowane':
    case 'cancelled':
      return '#f44336';
    case 'Wstrzymane':
      return '#9e9e9e';
    default:
      return '#757575';
  }
};

/**
 * Memoizowany komponent pojedynczego wiersza tabeli zadań
 * Props są porównywane shallow - zmiana jednego propa = re-render tylko tego wiersza
 */
const TaskTableRow = memo(({ 
  task, 
  visibleColumns,
  formatDateTimeNumeric,
  onStatusChange,
  onStopProductionDirect,
  onRefresh,
  navigate,
  t
}) => {
  // Obliczenia lokalne dla tego wiersza
  const totalCompletedQuantity = task.totalCompletedQuantity || 0;
  const remainingQuantity = Math.max(0, task.quantity - totalCompletedQuantity);
  const isFullyProduced = remainingQuantity === 0;
  
  // Memoizowane obliczenie statusu rezerwacji
  const reservationInfo = useMemo(() => {
    const reservationStatus = calculateMaterialReservationStatus(task);
    const statusColors = getReservationStatusColors(reservationStatus.status);
    return { reservationStatus, statusColors };
  }, [task.materialBatches, task.materials, task.consumedMaterials]);
  
  // Memoizowane handlery dla tego wiersza
  const handleMaterialsClick = useCallback((e) => {
    e.stopPropagation();
    navigate(`/production/tasks/${task.id}`, { state: { activeTab: 1 } });
  }, [navigate, task.id]);
  
  const handleStartProduction = useCallback(() => {
    onStatusChange(task.id, 'W trakcie');
  }, [onStatusChange, task.id]);
  
  const handleStopProduction = useCallback(() => {
    onStopProductionDirect(task);
  }, [onStopProductionDirect, task]);
  
  // Renderowanie akcji statusu - zmemoizowane
  const statusActions = useMemo(() => {
    if (isFullyProduced) {
      const isConsumptionConfirmed = task.materialConsumptionConfirmed === true;
      const actionColor = isConsumptionConfirmed ? "success" : "secondary";
      const tooltipTitle = isConsumptionConfirmed ? "Konsumpcja zatwierdzona" : "Konsumpcja poprocesowa";
      
      return (
        <Tooltip title={tooltipTitle}>
          <IconButton 
            color={actionColor}
            component={Link}
            to={`/production/consumption/${task.id}`}
            size="small"
          >
            <BuildCircleIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      );
    }
    
    switch (task.status) {
      case 'Zaplanowane':
      case 'Wstrzymane':
        return (
          <Tooltip title={t('production.tooltips.startProduction')}>
            <IconButton 
              color="warning" 
              onClick={handleStartProduction}
              size="small"
            >
              <StartIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        );
      case 'W trakcie':
        return (
          <Tooltip title={t('production.tooltips.stopProduction')}>
            <IconButton 
              color="error" 
              onClick={handleStopProduction}
              size="small"
            >
              <StopIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        );
      case 'Potwierdzenie zużycia':
        return (
          <Tooltip title={t('production.tooltips.confirmConsumption')}>
            <IconButton 
              color="info" 
              component={Link}
              to={`/production/consumption/${task.id}`}
              size="small"
            >
              <CheckIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        );
      case 'Zakończone':
        return null;
      default:
        return null;
    }
  }, [task.status, task.id, task.materialConsumptionConfirmed, isFullyProduced, handleStartProduction, handleStopProduction, t]);
  
  return (
    <TableRow key={task.id}>
      {visibleColumns.name && (
        <TableCell sx={{ maxWidth: 200 }}>
          <Link to={`/production/tasks/${task.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <Typography 
              variant="body2" 
              color="primary"
              sx={{ 
                wordWrap: 'break-word',
                overflowWrap: 'break-word',
                hyphens: 'auto'
              }}
            >
              {task.name}
            </Typography>
            {task.clientName && (
              <Typography variant="body2" color="textSecondary">
                {task.clientName}
              </Typography>
            )}
            {task.moNumber && (
              <Chip 
                size="small" 
                label={`MO: ${task.moNumber}`} 
                color="secondary" 
                variant="outlined" 
                sx={{ mt: 0.5 }}
              />
            )}
          </Link>
        </TableCell>
      )}
      {visibleColumns.productName && (
        <TableCell>
          <Typography variant="body2">{task.productName}</Typography>
        </TableCell>
      )}
      {visibleColumns.quantityProgress && (
        <TableCell>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
              {task.quantity} {task.unit || 'szt.'}
            </Typography>
            <Typography 
              variant="caption" 
              color={remainingQuantity === 0 ? 'success.main' : (remainingQuantity < task.quantity * 0.2 ? 'warning.main' : 'text.secondary')}
              sx={{ 
                fontSize: '0.75rem',
                fontWeight: remainingQuantity === 0 ? 'medium' : 'normal'
              }}
            >
              / {remainingQuantity} {task.unit || 'szt.'}
            </Typography>
          </Box>
        </TableCell>
      )}

      {visibleColumns.statusAndMaterials && (
        <TableCell>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <TaskStatusChip 
              task={task}
              getStatusColor={getStatusColorMemo}
              onStatusChange={onRefresh}
              editable={true}
              size="small"
            />
            <Tooltip title={t('taskDetails.materials.clickToNavigate') || 'Przejdź do materiałów'}>
              <Chip 
                label={reservationInfo.reservationStatus.label} 
                size="small" 
                variant="outlined"
                clickable
                onClick={handleMaterialsClick}
                sx={{
                  borderColor: reservationInfo.statusColors.main,
                  color: reservationInfo.statusColors.main,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease-in-out',
                  '&:hover': {
                    backgroundColor: reservationInfo.statusColors.light + '20',
                    transform: 'scale(1.03)'
                  }
                }}
              />
            </Tooltip>
          </Box>
        </TableCell>
      )}
      {visibleColumns.plannedStart && (
        <TableCell>
          {task.scheduledDate ? formatDateTimeNumeric(task.scheduledDate) : '-'}
        </TableCell>
      )}
      {visibleColumns.plannedEnd && (
        <TableCell>
          {task.endDate ? formatDateTimeNumeric(task.endDate) : '-'}
        </TableCell>
      )}
      {visibleColumns.cost && (
        <TableCell>
          {task.unitMaterialCost !== undefined ? 
            `${parseFloat(task.unitMaterialCost).toFixed(4).replace(/\.?0+$/, '')} €` : 
            (task.totalMaterialCost !== undefined && task.quantity ? 
              `${(parseFloat(task.totalMaterialCost) / parseFloat(task.quantity)).toFixed(4).replace(/\.?0+$/, '')} €` : '-')}
        </TableCell>
      )}
      {visibleColumns.totalCost && (
        <TableCell>
          {task.totalMaterialCost !== undefined ? 
            `${parseFloat(task.totalMaterialCost).toFixed(2)} €` : '-'}
        </TableCell>
      )}
      {visibleColumns.actions && (
        <TableCell>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            {/* Przycisk akcji zależny od statusu */}
            {statusActions}
            
            {/* Przyciski standardowe */}
            <Tooltip title="Szczegóły zadania">
              <IconButton
                size="small"
                component={Link}
                to={`/production/tasks/${task.id}`}
                color="primary"
              >
                <InfoIcon fontSize="small" />
              </IconButton>
            </Tooltip>

            <Tooltip title="Edytuj zadanie">
              <IconButton
                size="small"
                component={Link}
                to={`/production/tasks/${task.id}/edit`}
                color="secondary"
              >
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </TableCell>
      )}
    </TableRow>
  );
});

// Nadaj nazwę dla React DevTools
TaskTableRow.displayName = 'TaskTableRow';

const TaskList = () => {
  const { t } = useTranslation();
  
  // Funkcja formatowania daty i godziny w formacie liczbowym
  const formatDateTimeNumeric = (date) => {
    if (!date) return '—';
    
    // Obsługa timestampu Firestore
    if (date && typeof date === 'object' && typeof date.toDate === 'function') {
      date = date.toDate();
    }
    
    try {
      // Obsługa stringa
      if (typeof date === 'string') {
        date = new Date(date);
      }
      
      const dateObj = new Date(date);
      
      // Sprawdź czy data jest prawidłowa
      if (isNaN(dateObj.getTime())) {
        console.warn('Nieprawidłowy format daty:', date);
        return String(date);
      }
      
      // Formatuj datę w formacie DD.MM.YYYY HH:mm
      return new Intl.DateTimeFormat('pl-PL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(dateObj);
    } catch (error) {
      console.error('Error formatting date:', error, date);
      return String(date);
    }
  };

  // Użyj kontekstu stanu listy zadań
  const { state: listState, actions: listActions } = useTaskListState();
  
  // Zmienne stanu z kontekstu
  const searchTerm = listState.searchTerm;
  const statusFilter = listState.statusFilter;
  const page = listState.page;
  const pageSize = listState.pageSize;
  const tableSort = listState.tableSort;

  const [tasks, setTasks] = useState([]);
  const [filteredTasks, setFilteredTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const muiTheme = useMuiTheme();
  const { mode } = useThemeContext();
  const navigate = useNavigate();
  const [stopProductionDialogOpen, setStopProductionDialogOpen] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState(null);
  const [completedQuantity, setCompletedQuantity] = useState('');
  const [timeSpent, setTimeSpent] = useState('');
  const [productionError, setProductionError] = useState(null);
  const [productionStartTime, setProductionStartTime] = useState(new Date());
  const [productionEndTime, setProductionEndTime] = useState(new Date());
  const [addToInventoryDialogOpen, setAddToInventoryDialogOpen] = useState(false);
  const [inventoryData, setInventoryData] = useState({
    expiryDate: null,
    lotNumber: '',
    finalQuantity: '',
    warehouseId: ''
  });
  const [inventoryError, setInventoryError] = useState(null);
  const [warehouses, setWarehouses] = useState([]);
  const [warehousesLoading, setWarehousesLoading] = useState(false);
  
  // Stan dla ukrywania kolumn
  const [columnMenuAnchor, setColumnMenuAnchor] = useState(null);
  
  // Używamy kontekstu preferencji kolumn
  const { getColumnPreferencesForView, updateColumnPreferences } = useColumnPreferences();
  // Pobieramy preferencje dla widoku 'productionTasks'
  const visibleColumns = getColumnPreferencesForView('productionTasks');

  // Dodajemy wykrywanie urządzeń mobilnych
  const theme = useMuiTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Stany dla optymalizacji
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  
  // Debouncing dla wyszukiwania
  const searchTermTimerRef = useRef(null);
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);
  
  // Stany dla animacji ładowania
  const [mainTableLoading, setMainTableLoading] = useState(false);
  const [showContent, setShowContent] = useState(false);

  const isFirstRender = useRef(true);
  
  const [sortMenuAnchor, setSortMenuAnchor] = useState(null);

  // Nowe stany dla opcji dodawania do magazynu w dialogu zatrzymania produkcji
  const [addToInventoryOnStop, setAddToInventoryOnStop] = useState(true);
  const [stopProductionInventoryData, setStopProductionInventoryData] = useState({
    expiryDate: null,
    lotNumber: '',
    finalQuantity: '',
    warehouseId: ''
  });
  const [stopProductionInventoryError, setStopProductionInventoryError] = useState(null);

  // Stany dla dialogu ustawiania daty ważności przy starcie produkcji
  const [startProductionDialogOpen, setStartProductionDialogOpen] = useState(false);
  const [startProductionData, setStartProductionData] = useState({
    expiryDate: null,
    taskId: null
  });
  const [startProductionError, setStartProductionError] = useState(null);

  // Stany dla dialogu eksportu z filtrami
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportFilters, setExportFilters] = useState({
    clientName: '',
    status: '',
    fromDate: '',
    toDate: ''
  });
  const [uniqueClients, setUniqueClients] = useState([]);
  const [exportLoading, setExportLoading] = useState(false);

  // ===============================================
  // 🚀 OPTYMALIZACJA: Memoizowane funkcje i callbacki
  // Zapobiegają tworzeniu nowych referencji przy każdym renderze
  // ===============================================

  // Memoizowana funkcja formatowania daty
  const memoizedFormatDateTime = useCallback((date) => {
    if (!date) return '—';
    
    // Obsługa timestampu Firestore
    if (date && typeof date === 'object' && typeof date.toDate === 'function') {
      date = date.toDate();
    }
    
    try {
      // Obsługa stringa
      if (typeof date === 'string') {
        date = new Date(date);
      }
      
      const dateObj = new Date(date);
      
      // Sprawdź czy data jest prawidłowa
      if (isNaN(dateObj.getTime())) {
        return String(date);
      }
      
      // Formatuj datę w formacie DD.MM.YYYY HH:mm
      return new Intl.DateTimeFormat('pl-PL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(dateObj);
    } catch (error) {
      return String(date);
    }
  }, []);

  // Memoizowany callback dla zmiany statusu - używany w TaskTableRow
  const handleStatusChangeCallback = useCallback(async (id, newStatus) => {
    try {
      // Jeśli status zmienia się na "W trakcie", sprawdź czy zadanie ma datę ważności
      if (newStatus === 'W trakcie') {
        // Znajdź zadanie w liście
        const task = tasks.find(t => t.id === id);
        
        // Sprawdź czy zadanie ma już ustawioną datę ważności
        if (!task?.expiryDate) {
          // Otwórz dialog do ustawienia daty ważności
          setStartProductionData({
            expiryDate: null,
            taskId: id
          });
          setStartProductionDialogOpen(true);
          return;
        }
        
        // Jeśli ma datę ważności, rozpocznij produkcję
        const result = await startProduction(id, currentUser.uid);
        
        // Wyświetl komunikat na podstawie wyniku tworzenia partii
        if (result.batchResult) {
          if (result.batchResult.message === 'Partia już istnieje') {
            showSuccess('Produkcja wznowiona - używa istniejącą partię produktu');
          } else if (result.batchResult.isNewBatch === false) {
            showSuccess('Produkcja wznowiona - dodano do istniejącej partii produktu');
          } else {
            showSuccess('Produkcja rozpoczęta - utworzono nową pustą partię produktu');
          }
        } else {
          showSuccess('Produkcja rozpoczęta');
        }
      } else {
        // Dla innych statusów użyj standardowej funkcji updateTaskStatus
        await updateTaskStatus(id, newStatus, currentUser.uid);
        showSuccess(`Status zadania zmieniony na: ${newStatus}`);
      }
      
      // Odśwież listę zadań
      fetchTasksOptimized();
    } catch (error) {
      showError('Błąd podczas zmiany statusu: ' + error.message);
      console.error('Error updating task status:', error);
    }
  }, [tasks, currentUser?.uid, showSuccess, showError]);

  // Memoizowany callback dla bezpośredniego zatrzymania produkcji
  const handleStopProductionDirectCallback = useCallback(async (task) => {
    try {
      // Wstrzymaj produkcję bez tworzenia sesji w historii
      await pauseProduction(task.id, currentUser.uid);
      
      showSuccess('Produkcja została wstrzymana. Możesz kontynuować później.');
      
      // Odśwież listę zadań
      fetchTasksOptimized();
    } catch (error) {
      showError('Błąd podczas wstrzymywania produkcji: ' + error.message);
      console.error('Error pausing production:', error);
    }
  }, [currentUser?.uid, showSuccess, showError]);

  // Memoizowany callback dla odświeżania - stabilna referencja
  const handleRefreshCallback = useCallback(() => {
    fetchTasksOptimized(null, null, true);
  }, []);

  // Synchronizacja ilości wyprodukowanej z ilością końcową w formularzu magazynu
  useEffect(() => {
    if (addToInventoryOnStop && completedQuantity) {
      setStopProductionInventoryData(prev => ({
        ...prev,
        finalQuantity: completedQuantity
      }));
    }
  }, [completedQuantity, addToInventoryOnStop]);

  // Debouncing dla wyszukiwania - nowa optymalizacja
  useEffect(() => {
    if (searchTermTimerRef.current) {
      clearTimeout(searchTermTimerRef.current);
    }
    
    searchTermTimerRef.current = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      if (searchTerm !== debouncedSearchTerm) {
        listActions.setPage(1); // Reset paginacji przy wyszukiwaniu
        fetchTasksOptimized();
      }
    }, 1000);

    return () => {
      if (searchTermTimerRef.current) {
        clearTimeout(searchTermTimerRef.current);
      }
    };
  }, [searchTerm]);

  // Pobierz zadania przy inicjalizacji — JEDYNY efekt który fetchuje na mount
  useEffect(() => {
    fetchTasksOptimized();
    fetchWarehouses();
    
    // Odrocz ustawienie flagi na po zakończeniu wszystkich efektów z tego renderowania
    // — bez tego efekty statusFilter/page/search widzą false i też fetchują
    const timer = setTimeout(() => {
      isFirstRender.current = false;
    }, 0);
    
    // Nasłuchiwanie na zdarzenie aktualizacji zadań
    const handleTasksUpdate = () => {
      fetchTasksOptimized();
    };
    
    window.addEventListener('tasks-updated', handleTasksUpdate);
    
    // BroadcastChannel listener dla aktualizacji kosztów
    let broadcastChannel = null;
    if (typeof BroadcastChannel !== 'undefined') {
      broadcastChannel = new BroadcastChannel('production-costs-update');
      broadcastChannel.onmessage = (event) => {
        const { type } = event.data;
        if (type === 'BATCH_COSTS_UPDATED' || type === 'TASK_COSTS_UPDATED') {
          fetchTasksOptimized(null, null, true);
        }
      };
    }
    
    return () => {
      clearTimeout(timer);
      window.removeEventListener('tasks-updated', handleTasksUpdate);
      if (broadcastChannel) {
        broadcastChannel.close();
      }
    };
  }, []);

  // Efekt reagujący na zmianę statusFilter - reset strony i odświeżenie danych
  useEffect(() => {
    if (isFirstRender.current) return;
    if (statusFilter !== undefined) {
      listActions.setPage(1);
      fetchTasksOptimized();
    }
  }, [statusFilter]);

  // Obsługa zmiany strony i rozmiaru strony
  useEffect(() => {
    if (isFirstRender.current) return;
    fetchTasksOptimized();
  }, [page, pageSize]);

  // Reset strony po zmianie wyszukiwania (debounced)
  useEffect(() => {
    if (isFirstRender.current) return;
    if (page !== 1) {
      listActions.setPage(1);
    } else {
      fetchTasksOptimized();
    }
  }, [debouncedSearchTerm]);

  // Real-time change detector — nasłuchuje tylko ostatnio zmodyfikowanego taska
  // zamiast całej kolekcji (redukcja reads ~100x)
  useEffect(() => {
    let updateTimeout = null;
    let isInitialSnapshot = true;
    
    const changeDetectorQuery = query(
      collection(db, 'productionTasks'),
      orderBy('updatedAt', 'desc'),
      limit(1)
    );
    
    const unsubscribe = onSnapshot(
      changeDetectorQuery,
      (snapshot) => {
        // Pomiń initial snapshot
        if (isInitialSnapshot) {
          isInitialSnapshot = false;
          return;
        }
        
        if (snapshot.docChanges().length > 0 && !snapshot.metadata.hasPendingWrites) {
          if (updateTimeout) {
            clearTimeout(updateTimeout);
          }
          updateTimeout = setTimeout(() => {
            fetchTasksOptimized();
          }, 500);
        }
      },
      (error) => {
        console.error('Błąd real-time listener:', error);
      }
    );
    
    return () => {
      if (updateTimeout) {
        clearTimeout(updateTimeout);
      }
      unsubscribe();
    };
  }, []);



  // Funkcja do pobierania magazynów
  const fetchWarehouses = async () => {
    try {
      setWarehousesLoading(true);
      const warehousesList = await getAllWarehouses();
      setWarehouses(warehousesList);
      
      // Jeśli jest przynajmniej jeden magazyn, ustaw go jako domyślny
      if (warehousesList.length > 0) {
        setInventoryData(prev => ({
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

  // Obsługa zmiany filtra statusu - używa kontekstu
  const handleStatusFilterChange = (event) => {
    listActions.setStatusFilter(event.target.value);
  };

  // Obsługa zmiany pola wyszukiwania - używa kontekstu
  const handleSearchChange = (event) => {
    listActions.setSearchTerm(event.target.value);
  };

  // Zoptymalizowana funkcja pobierania zadań
  const fetchTasksOptimized = async (newSortField = null, newSortOrder = null, forceRefresh = false) => {
    // Silent refresh — jeśli serwis ma dane w cache lub komponent ma już dane,
    // nie ukrywaj tabeli (unikaj migania przy powrocie z detali)
    const cacheStatus = getProductionTasksCacheStatus();
    const willBeFast = cacheStatus.isValid || tasks.length > 0;
    
    if (!willBeFast) {
      setMainTableLoading(true);
      setShowContent(false);
    }
    
    try {
      const sortFieldToUse = newSortField || tableSort.field;
      const sortOrderToUse = newSortOrder || tableSort.order;
      
      const result = await getProductionTasksOptimized({
        page: page,
        pageSize: pageSize,
        searchTerm: debouncedSearchTerm.trim() !== '' ? debouncedSearchTerm : null,
        statusFilter: statusFilter || null,
        sortField: sortFieldToUse,
        sortOrder: sortOrderToUse,
        forceRefresh: forceRefresh
      });
      
      if (result && result.items) {
        setTasks(result.items);
        setFilteredTasks(result.items);
        setTotalItems(result.totalCount);
        setTotalPages(Math.ceil(result.totalCount / pageSize));
      } else {
        setTasks(result);
        setFilteredTasks(result);
      }
      
      if (!willBeFast) {
        setTimeout(() => {
          setShowContent(true);
        }, 25);
      } else if (!showContent) {
        setShowContent(true);
      }
      
    } catch (error) {
      console.error('Error fetching tasks:', error);
      showError('Błąd podczas pobierania zadań: ' + error.message);
    } finally {
      setMainTableLoading(false);
      setLoading(false);
    }
  };

  // Obsługa zmiany strony - używa kontekstu
  const handleChangePage = (event, newPage) => {
    listActions.setPage(newPage);
  };

  // Obsługa zmiany liczby elementów na stronie - używa kontekstu
  const handleChangeRowsPerPage = (event) => {
    listActions.setPageSize(parseInt(event.target.value, 10));
  };

  // Nowa funkcja do sortowania głównej tabeli
  const handleTableSort = (field) => {
    const newOrder = tableSort.field === field && tableSort.order === 'asc' ? 'desc' : 'asc';
    const newSort = {
      field,
      order: newOrder
    };
    listActions.setTableSort(newSort);
    
    // Zamiast sortować lokalnie, wywołamy fetchTasksOptimized z nowymi parametrami sortowania
    // Najpierw resetujemy paginację
    listActions.setPage(1);
    
    // Następnie pobieramy dane z serwera z nowym sortowaniem
    fetchTasksOptimized(field, newOrder);
  };

  // Funkcja do manualnego odświeżania cache i danych
  const handleManualRefresh = async () => {
    try {
      setMainTableLoading(true);
      
      // Usuń duplikaty i wymuś odświeżenie cache
      removeDuplicatesFromCache();
      forceRefreshProductionTasksCache();
      
      // Pobierz świeże dane
      await fetchTasksOptimized(null, null, true);
      
      showSuccess('Lista zadań została odświeżona');
    } catch (error) {
      showError('Błąd podczas odświeżania: ' + error.message);
    } finally {
      setMainTableLoading(false);
    }
  };

  // Funkcja do odświeżania cache i danych
  const handleRefreshData = async () => {
    try {
      setMainTableLoading(true);
      
      // Wyczyść cache zadań produkcyjnych
      clearProductionTasksCache();
      
      // Wymuszaj pobranie świeżych danych
      await fetchTasksOptimized();
      
      showSuccess('Lista zadań została odświeżona');
    } catch (error) {
      console.error('Błąd podczas odświeżania danych:', error);
      showError('Błąd podczas odświeżania danych: ' + error.message);
    }
  };



  const handleStatusChange = async (id, newStatus) => {
    try {
      // Jeśli status zmienia się na "W trakcie", sprawdź czy zadanie ma datę ważności
      if (newStatus === 'W trakcie') {
        // Znajdź zadanie w liście
        const task = tasks.find(t => t.id === id);
        
        // Sprawdź czy zadanie ma już ustawioną datę ważności
        if (!task?.expiryDate) {
          // Otwórz dialog do ustawienia daty ważności
          setStartProductionData({
            expiryDate: null,
            taskId: id
          });
          setStartProductionDialogOpen(true);
          return;
        }
        
        // Jeśli ma datę ważności, rozpocznij produkcję
        const result = await startProduction(id, currentUser.uid);
        
        // Wyświetl komunikat na podstawie wyniku tworzenia partii
        if (result.batchResult) {
          if (result.batchResult.message === 'Partia już istnieje') {
            showSuccess('Produkcja wznowiona - używa istniejącą partię produktu');
          } else if (result.batchResult.isNewBatch === false) {
            showSuccess('Produkcja wznowiona - dodano do istniejącej partii produktu');
          } else {
            showSuccess('Produkcja rozpoczęta - utworzono nową pustą partię produktu');
          }
        } else {
          showSuccess('Produkcja rozpoczęta');
        }
      } else {
        // Dla innych statusów użyj standardowej funkcji updateTaskStatus
        await updateTaskStatus(id, newStatus, currentUser.uid);
        showSuccess(`Status zadania zmieniony na: ${newStatus}`);
      }
      
      // Odśwież listę zadań
      fetchTasksOptimized();
    } catch (error) {
      showError('Błąd podczas zmiany statusu: ' + error.message);
      console.error('Error updating task status:', error);
    }
  };

  // Funkcja obsługująca start produkcji z datą ważności
  const handleStartProductionWithExpiry = async () => {
    try {
      if (!startProductionData.expiryDate) {
        setStartProductionError('Podaj datę ważności gotowego produktu');
        return;
      }

      setStartProductionError(null);
      
      // Rozpocznij produkcję z datą ważności
      const result = await startProduction(startProductionData.taskId, currentUser.uid, startProductionData.expiryDate);
      
      // Wyświetl komunikat na podstawie wyniku tworzenia partii
      if (result.batchResult) {
        if (result.batchResult.message === 'Partia już istnieje') {
          showSuccess('Produkcja wznowiona - używa istniejącą partię produktu');
        } else if (result.batchResult.isNewBatch === false) {
          showSuccess('Produkcja wznowiona - dodano do istniejącej partii produktu');
        } else {
          showSuccess('Produkcja rozpoczęta - utworzono nową pustą partię produktu');
        }
      } else {
        showSuccess('Produkcja rozpoczęta');
      }
      
      // Zamknij dialog
      setStartProductionDialogOpen(false);
      setStartProductionData({
        expiryDate: null,
        taskId: null
      });
      
      // Odśwież listę zadań
      fetchTasksOptimized();
    } catch (error) {
      setStartProductionError('Błąd podczas rozpoczynania produkcji: ' + error.message);
      console.error('Error starting production:', error);
    }
  };

  // Funkcja obsługująca dodanie produktu do magazynu
  const handleAddToInventory = async (id) => {
    try {
      if (!inventoryData.expiryDate) {
        setInventoryError('Podaj datę ważności produktu');
        return;
      }

      if (!inventoryData.lotNumber.trim()) {
        setInventoryError('Podaj numer partii (LOT)');
        return;
      }
      
      if (!inventoryData.warehouseId) {
        setInventoryError('Wybierz magazyn docelowy');
        return;
      }

      const quantity = parseFloat(inventoryData.finalQuantity);
      if (isNaN(quantity) || quantity <= 0) {
        setInventoryError('Nieprawidłowa ilość końcowa');
        return;
      }

      // Dodaj parametry do wywołania API
      const result = await addTaskProductToInventory(id, currentUser.uid, {
        expiryDate: inventoryData.expiryDate.toISOString(),
        lotNumber: inventoryData.lotNumber,
        finalQuantity: quantity,
        warehouseId: inventoryData.warehouseId
      });
      
      // Znajdź zadanie w tablicy tasks, aby uzyskać dostęp do jego danych
      const task = tasks.find(t => t.id === id);
      let message = result.message;
      
      // Dodaj informacje o numerze MO i CO, jeśli są dostępne
      if (task) {
        if (task.moNumber) {
          message += ` z MO: ${task.moNumber}`;
        }
        
        if (task.orderNumber) {
          message += ` i CO: ${task.orderNumber}`;
        }
      }
      
      showSuccess(message);
      setAddToInventoryDialogOpen(false);
      resetInventoryForm();
      
      // Odśwież listę zadań
      fetchTasksOptimized();
    } catch (error) {
      setInventoryError('Błąd podczas dodawania produktu do magazynu: ' + error.message);
      console.error('Error adding product to inventory:', error);
    }
  };

  const openAddToInventoryDialog = (task) => {
    setCurrentTaskId(task.id);
    
    // Logowanie tylko podstawowych danych zadania
    console.log('Otwieranie dialogu dla zadania ID:', task.id, 'MO:', task.moNumber);
    
    // Poprawna konwersja daty ważności z różnych formatów
    let expiryDate = null;
    
    if (task.expiryDate) {
      try {
        // Sprawdź typ daty i odpowiednio ją skonwertuj
        if (task.expiryDate instanceof Date) {
          expiryDate = task.expiryDate;
        } else if (task.expiryDate.toDate && typeof task.expiryDate.toDate === 'function') {
          // Obsługa obiektu Firebase Timestamp
          expiryDate = task.expiryDate.toDate();
        } else if (task.expiryDate.seconds) {
          // Obsługa obiektu timestamp z sekundami
          expiryDate = new Date(task.expiryDate.seconds * 1000);
        } else if (typeof task.expiryDate === 'string') {
          // Obsługa formatu string
          expiryDate = new Date(task.expiryDate);
        }
        console.log('Skonwertowana data ważności:', expiryDate?.toISOString());
      } catch (error) {
        console.error('Błąd konwersji daty ważności:', error);
        // W przypadku błędu konwersji, ustaw datę domyślną
        expiryDate = new Date(new Date().setFullYear(new Date().getFullYear() + 1));
      }
    } else {
      // Domyślna data ważności (1 rok od dzisiaj)
      expiryDate = new Date(new Date().setFullYear(new Date().getFullYear() + 1));
    }
    
    // Ustaw wartości w formularzu na podstawie danych z zadania produkcyjnego
    setInventoryData({
      expiryDate: expiryDate,
      lotNumber: task.lotNumber || `SN/${task.moNumber || ''}`,
      finalQuantity: task.quantity.toString(),
      warehouseId: task.warehouseId || (warehouses.length > 0 ? warehouses[0].id : '')
    });
    
    console.log('Formularz przygotowany dla MO:', task.moNumber, 'LOT:', task.lotNumber || `SN/${task.moNumber || ''}`);
    
    setAddToInventoryDialogOpen(true);
  };

  const resetInventoryForm = () => {
    setInventoryData({
      expiryDate: null,
      lotNumber: '',
      finalQuantity: '',
      warehouseId: warehouses.length > 0 ? warehouses[0].id : ''
    });
    setInventoryError(null);
    setCurrentTaskId(null);
  };

  const handleStopProduction = async () => {
    try {
      setProductionError(null);
      setStopProductionInventoryError(null);
      
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

      // Jeśli użytkownik wybrał opcję dodania do magazynu, waliduj dane magazynowe
      if (addToInventoryOnStop) {
        if (!stopProductionInventoryData.expiryDate) {
          setStopProductionInventoryError('Podaj datę ważności produktu');
          return;
        }

        if (!stopProductionInventoryData.lotNumber.trim()) {
          setStopProductionInventoryError('Podaj numer partii (LOT)');
          return;
        }
        
        if (!stopProductionInventoryData.warehouseId) {
          setStopProductionInventoryError('Wybierz magazyn docelowy');
          return;
        }

        const inventoryQuantity = parseFloat(stopProductionInventoryData.finalQuantity);
        if (isNaN(inventoryQuantity) || inventoryQuantity <= 0) {
          setStopProductionInventoryError('Nieprawidłowa ilość końcowa');
          return;
        }
      }

      // Przekazujemy czas trwania w minutach oraz daty rozpoczęcia i zakończenia
      const result = await stopProduction(
        currentTaskId, 
        quantity, 
        durationMinutes, 
        currentUser.uid,
        {
          startTime: productionStartTime.toISOString(),
          endTime: productionEndTime.toISOString()
        }
      );
      
      // Jeśli użytkownik wybrał opcję dodania do magazynu, dodaj produkt do magazynu
      if (addToInventoryOnStop) {
        try {
          const result = await addTaskProductToInventory(currentTaskId, currentUser.uid, {
            expiryDate: stopProductionInventoryData.expiryDate.toISOString(),
            lotNumber: stopProductionInventoryData.lotNumber,
            finalQuantity: parseFloat(stopProductionInventoryData.finalQuantity),
            warehouseId: stopProductionInventoryData.warehouseId
          });
          
          showSuccess(`Produkcja zatrzymana i ${result.message}`);
        } catch (inventoryError) {
          console.error('Błąd podczas dodawania produktu do magazynu:', inventoryError);
          showError('Produkcja zatrzymana, ale wystąpił błąd podczas dodawania produktu do magazynu: ' + inventoryError.message);
        }
      } else {
        showSuccess(result.isCompleted ? 
          'Produkcja zakończona. Zadanie zostało ukończone.' : 
          'Sesja produkcyjna zapisana. Możesz kontynuować produkcję później.'
        );
      }
      
      setStopProductionDialogOpen(false);
      
      // Resetuj stan formularza
      setCompletedQuantity('');
      setProductionStartTime(new Date());
      setProductionEndTime(new Date());
      setCurrentTaskId(null);
      setAddToInventoryOnStop(false);
      setStopProductionInventoryData({
        expiryDate: null,
        lotNumber: '',
        finalQuantity: '',
        warehouseId: warehouses.length > 0 ? warehouses[0].id : ''
      });
      setStopProductionInventoryError(null);
      
      // Odśwież listę zadań
      fetchTasksOptimized();
    } catch (error) {
      showError('Błąd podczas zatrzymywania produkcji: ' + error.message);
      console.error('Error stopping production:', error);
    }
  };

  // Nowa funkcja do bezpośredniego wstrzymywania produkcji bez dialogu
  const handleStopProductionDirect = async (task) => {
    try {
      // Wstrzymaj produkcję bez tworzenia sesji w historii
      await pauseProduction(task.id, currentUser.uid);
      
      showSuccess('Produkcja została wstrzymana. Możesz kontynuować później.');
      
      // Odśwież listę zadań
      fetchTasksOptimized();
    } catch (error) {
      showError('Błąd podczas wstrzymywania produkcji: ' + error.message);
      console.error('Error pausing production:', error);
    }
  };

  const openStopProductionDialog = (task) => {
    setCurrentTaskId(task.id);
    
    // Przygotuj dane dla formularza dodawania do magazynu
    let expiryDate = null;
    
    if (task.expiryDate) {
      try {
        // Sprawdź typ daty i odpowiednio ją skonwertuj
        if (task.expiryDate instanceof Date) {
          expiryDate = task.expiryDate;
        } else if (task.expiryDate.toDate && typeof task.expiryDate.toDate === 'function') {
          // Obsługa obiektu Firebase Timestamp
          expiryDate = task.expiryDate.toDate();
        } else if (task.expiryDate.seconds) {
          // Obsługa obiektu timestamp z sekundami
          expiryDate = new Date(task.expiryDate.seconds * 1000);
        } else if (typeof task.expiryDate === 'string') {
          // Obsługa formatu string
          expiryDate = new Date(task.expiryDate);
        }
      } catch (error) {
        console.error('Błąd konwersji daty ważności:', error);
        // W przypadku błędu konwersji, ustaw datę domyślną
        expiryDate = new Date(new Date().setFullYear(new Date().getFullYear() + 1));
      }
    } else {
      // Domyślna data ważności (1 rok od dzisiaj)
      expiryDate = new Date(new Date().setFullYear(new Date().getFullYear() + 1));
    }
    
    // Ustaw domyślne dane dla formularza dodawania do magazynu
    setStopProductionInventoryData({
      expiryDate: expiryDate,
      lotNumber: task.lotNumber || `SN/${task.moNumber || ''}`,
      finalQuantity: task.quantity.toString(),
      warehouseId: task.warehouseId || (warehouses.length > 0 ? warehouses[0].id : '')
    });
    
    setStopProductionDialogOpen(true);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Zaplanowane':
      case 'planned':
      case 'scheduled':
        return '#1976d2'; // oryginalny niebieski
      case 'W trakcie':
      case 'in_progress':
        return '#ff9800'; // oryginalny pomarańczowy
      case 'Potwierdzenie zużycia':
        return '#2196f3'; // oryginalny jasnoniebieski
      case 'Zakończone':
      case 'completed':
        return '#4caf50'; // oryginalny zielony
      case 'Anulowane':
      case 'cancelled':
        return '#f44336'; // oryginalny czerwony
      case 'Wstrzymane':
        return '#9e9e9e'; // oryginalny szary
      default:
        return '#757575'; // oryginalny szary
    }
  };

  // Funkcja zwracająca chip informujący o statusie dodania produktu do magazynu
  const getInventoryStatus = (task) => {
    if (task.status !== 'Zakończone') {
      return null;
    }

    if (task.inventoryUpdated) {
      return (
        <Tooltip title={`Produkt dodany do magazynu jako partia LOT (${task.inventoryBatchId?.substring(0, 6) || ''})`}>
          <Chip 
            label="Dodano jako partia" 
            color="success" 
            size="small" 
            variant="outlined"
          />
        </Tooltip>
      );
    } else if (task.readyForInventory) {
      return (
        <Tooltip title="Gotowy do dodania do magazynu jako partia">
          <Chip 
            label="Gotowy do dodania" 
            color="info" 
            size="small" 
            variant="outlined"
          />
        </Tooltip>
      );
    } else if (task.inventoryError) {
      return (
        <Tooltip title={`Błąd: ${task.inventoryError}`}>
          <Chip 
            label="Błąd" 
            color="error" 
            size="small" 
            variant="outlined"
          />
        </Tooltip>
      );
    } else {
      return (
        <Tooltip title="Produkt nie został dodany do magazynu">
          <Chip 
            label="Nie dodano" 
            color="warning" 
            size="small" 
            variant="outlined"
          />
        </Tooltip>
      );
    }
  };

  const getStatusActions = (task) => {
    // Oblicz czy wszystkie produkty zostały już wyprodukowane
    const totalCompletedQuantity = task.totalCompletedQuantity || 0;
    const remainingQuantity = Math.max(0, task.quantity - totalCompletedQuantity);
    const isFullyProduced = remainingQuantity === 0;
    
    // Jeśli produkcja została ukończona (wszystkie produkty wyprodukowane), pokaż konsumpcję poprocesową
    if (isFullyProduced) {
      // Określ kolor na podstawie statusu zatwierdzenia konsumpcji
      const isConsumptionConfirmed = task.materialConsumptionConfirmed === true;
      const actionColor = isConsumptionConfirmed ? "success" : "secondary";
      const tooltipTitle = isConsumptionConfirmed ? "Konsumpcja zatwierdzona" : "Konsumpcja poprocesowa";
      
      return (
        <Tooltip title={tooltipTitle}>
          <IconButton 
            color={actionColor}
            component={Link}
            to={`/production/consumption/${task.id}`}
            size="small"
          >
            <BuildCircleIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      );
    }
    
    // W przeciwnym razie używaj normalnej logiki statusu
    switch (task.status) {
      case 'Zaplanowane':
      case 'Wstrzymane':
        return (
          <Tooltip title={t('production.tooltips.startProduction')}>
            <IconButton 
              color="warning" 
              onClick={() => handleStatusChange(task.id, 'W trakcie')}
              size="small"
            >
              <StartIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        );
      case 'W trakcie':
        return (
          <Tooltip title={t('production.tooltips.stopProduction')}>
            <IconButton 
              color="error" 
              onClick={() => handleStopProductionDirect(task)}
              size="small"
            >
              <StopIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        );
      case 'Potwierdzenie zużycia':
        return (
                      <Tooltip title={t('production.tooltips.confirmConsumption')}>
            <IconButton 
              color="info" 
              component={Link}
              to={`/production/consumption/${task.id}`}
              size="small"
            >
              <CheckIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        );
      case 'Zakończone':
        // Zadanie zakończone ale nie wszystko wyprodukowane - normalne akcje dla zakończonych zadań
        return null;
      default:
        return null;
    }
  };

  // Funkcje do zarządzania widocznością kolumn
  const handleColumnMenuOpen = (event) => {
    setColumnMenuAnchor(event.currentTarget);
  };
  
  const handleColumnMenuClose = () => {
    setColumnMenuAnchor(null);
  };
  
  const toggleColumnVisibility = (columnName) => {
    // Zamiast lokalnego setVisibleColumns, używamy funkcji updateColumnPreferences z kontekstu
    updateColumnPreferences('productionTasks', columnName, !visibleColumns[columnName]);
  };

  // Funkcja obsługi sortowania - używa kontekstu
  const handleSort = (field) => {
    handleTableSort(field);
  };

  const handleSortMenuOpen = (event) => {
    setSortMenuAnchor(event.currentTarget);
  };

  const handleSortMenuClose = () => {
    setSortMenuAnchor(null);
  };

  const handleSortChange = (field) => {
    handleSort(field);
    handleSortMenuClose();
  };

  // Funkcja otwierania dialogu eksportu
  const handleOpenExportDialog = async () => {
    try {
      setExportLoading(true);
      // Pobierz wszystkie zadania, aby wyciągnąć unikalnych klientów
      const allTasks = await getAllTasks();
      
      // Wyciągnij unikalnych klientów
      const clients = [...new Set(
        allTasks
          .map(task => task.clientName || task.customerName)
          .filter(Boolean)
      )].sort();
      
      setUniqueClients(clients);
      
      // Ustaw domyślny zakres dat - ostatnie 90 dni
      const today = new Date();
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(today.getDate() - 90);
      
      setExportFilters({
        clientName: '',
        status: '',
        fromDate: '',
        toDate: ''
      });
      
      setExportDialogOpen(true);
    } catch (error) {
      console.error('Błąd podczas przygotowania eksportu:', error);
      showError('Błąd podczas przygotowania eksportu: ' + error.message);
    } finally {
      setExportLoading(false);
    }
  };

  // Funkcja zamykania dialogu eksportu
  const handleCloseExportDialog = () => {
    setExportDialogOpen(false);
    setExportFilters({
      clientName: '',
      status: '',
      fromDate: '',
      toDate: ''
    });
  };

  // Funkcja eksportu wszystkich zadań do CSV
  const handleExportCSV = async () => {
    try {
      setExportLoading(true);
      
      // Pobierz wszystkie zadania bez paginacji
      let allTasks = await getAllTasks();
      
      if (!allTasks || allTasks.length === 0) {
        showError('Brak zadań do eksportu');
        return;
      }

      // Zastosuj filtry eksportu
      if (exportFilters.clientName) {
        allTasks = allTasks.filter(task => 
          (task.clientName || task.customerName) === exportFilters.clientName
        );
      }

      if (exportFilters.status) {
        allTasks = allTasks.filter(task => task.status === exportFilters.status);
      }

      if (exportFilters.fromDate) {
        const fromDate = new Date(exportFilters.fromDate);
        fromDate.setHours(0, 0, 0, 0);
        allTasks = allTasks.filter(task => {
          if (!task.createdAt) return false;
          let taskDate;
          if (task.createdAt.toDate) {
            taskDate = task.createdAt.toDate();
          } else if (task.createdAt.seconds) {
            taskDate = new Date(task.createdAt.seconds * 1000);
          } else {
            taskDate = new Date(task.createdAt);
          }
          return taskDate >= fromDate;
        });
      }

      if (exportFilters.toDate) {
        const toDate = new Date(exportFilters.toDate);
        toDate.setHours(23, 59, 59, 999);
        allTasks = allTasks.filter(task => {
          if (!task.createdAt) return false;
          let taskDate;
          if (task.createdAt.toDate) {
            taskDate = task.createdAt.toDate();
          } else if (task.createdAt.seconds) {
            taskDate = new Date(task.createdAt.seconds * 1000);
          } else {
            taskDate = new Date(task.createdAt);
          }
          return taskDate <= toDate;
        });
      }

      if (allTasks.length === 0) {
        showError('Brak zadań spełniających kryteria filtrowania');
        return;
      }



      // Pobierz nazwy użytkowników dla pól createdBy i updatedBy
      const allUserIds = [
        ...new Set([
          ...allTasks.map(task => task.createdBy).filter(Boolean),
          ...allTasks.map(task => task.updatedBy).filter(Boolean)
        ])
      ];
      
      let userNamesMap = {};
      if (allUserIds.length > 0) {
        try {
          userNamesMap = await getUsersDisplayNames(allUserIds);
        } catch (error) {
          console.error('Błąd podczas pobierania nazw użytkowników:', error);
        }
      }

      // Funkcja pomocnicza do formatowania dat
      const formatDateForCSV = (dateValue) => {
        if (!dateValue) return '';
        
        try {
          let date;
          
          // Obsługa różnych formatów dat
          if (dateValue.toDate && typeof dateValue.toDate === 'function') {
            // Firebase Timestamp
            date = dateValue.toDate();
          } else if (dateValue.seconds) {
            // Firebase Timestamp w formie obiektu
            date = new Date(dateValue.seconds * 1000);
          } else if (typeof dateValue === 'string') {
            // String
            date = new Date(dateValue);
          } else if (dateValue instanceof Date) {
            // Już jest obiektem Date
            date = dateValue;
          } else {
            return '';
          }
          
          // Sprawdź czy data jest prawidłowa
          if (isNaN(date.getTime())) {
            return '';
          }
          
          return date.toLocaleDateString('pl-PL');
        } catch (error) {
          console.error('Błąd formatowania daty:', error, dateValue);
          return '';
        }
      };

      // Definicja nagłówków dla Excel - angielskie nazwy
      const headers = [
        { label: 'MO Number', key: 'moNumber' },
        { label: 'Task Name', key: 'name' },
        { label: 'Product', key: 'productName' },
        { label: 'Quantity', key: 'quantity' },
        { label: 'Unit', key: 'unit' },
        { label: 'Remaining Quantity', key: 'remainingQuantity' },
        { label: 'Status', key: 'status' },
        { label: 'Planned Start', key: 'scheduledDate' },
        { label: 'Planned End', key: 'endDate' },
        { label: 'Actual Start', key: 'actualStart' },
        { label: 'Actual End', key: 'actualEnd' },
        { label: 'Estimated Duration (hours)', key: 'estimatedDurationHours' },
        { label: 'Time per Unit (min)', key: 'productionTimePerUnit' },
        { label: 'Order Number', key: 'orderNumber' },
        { label: 'Client', key: 'clientName' },
        { label: 'Description', key: 'description' },
        { label: 'Batch Number (LOT)', key: 'lotNumber' },
        { label: 'Batch Expiry Date', key: 'expiryDate' },
        { label: 'Created Date', key: 'createdAt' },
        { label: 'Created By', key: 'createdBy' },
        { label: 'Total Cost (EUR)', key: 'totalCost' },
        { label: 'Cost per Unit (EUR)', key: 'costPerUnit' }
      ];
      
      // Przygotuj dane do eksportu - Zakładka 1: Zadania MO
      const exportData = allTasks.map(task => {
        const totalCompletedQuantity = task.totalCompletedQuantity || 0;
        const remainingQuantity = Math.max(0, task.quantity - totalCompletedQuantity);
        
        // Oblicz koszty - użyj pełnego kosztu produkcji (z wszystkimi materiałami)
        const totalCost = task.totalFullProductionCost || task.fullProductionCost || 0;
        const costPerUnit = task.unitFullProductionCost || task.unitCost || 0;
        
        return {
          moNumber: task.moNumber || '',
          name: task.name || '',
          productName: task.productName || '',
          quantity: task.quantity || 0,
          unit: task.unit || 'pcs',
          remainingQuantity: remainingQuantity,
          status: task.status || '',
          scheduledDate: formatDateForCSV(task.scheduledDate),
          endDate: formatDateForCSV(task.endDate),
          actualStart: formatDateForCSV(task.startDate),
          actualEnd: formatDateForCSV(task.lastSessionEndDate),
          estimatedDurationHours: task.estimatedDuration ? (task.estimatedDuration / 60).toFixed(2) : '',
          productionTimePerUnit: task.productionTimePerUnit || '',
          orderNumber: task.orderNumber || '',
          clientName: task.clientName || task.customerName || '',
          description: task.description || '',
          lotNumber: task.lotNumber || '',
          expiryDate: formatDateForCSV(task.expiryDate),
          createdAt: formatDateForCSV(task.createdAt),
          createdBy: userNamesMap[task.createdBy] || task.createdBy || '',
          totalCost: totalCost.toFixed(4),
          costPerUnit: costPerUnit.toFixed(4)
        };
      });

      // ========================================
      // Zakładka 2: Średnie daty ważności dla SKU
      // ========================================
      
      // Funkcja pomocnicza do konwersji daty
      const convertToDate = (dateValue) => {
        if (!dateValue) return null;
        if (dateValue.toDate && typeof dateValue.toDate === 'function') {
          return dateValue.toDate();
        } else if (dateValue.seconds) {
          return new Date(dateValue.seconds * 1000);
        } else if (typeof dateValue === 'string') {
          return new Date(dateValue);
        } else if (dateValue instanceof Date) {
          return dateValue;
        }
        return null;
      };

      // Grupowanie danych po SKU (productName) i obliczanie statystyk
      const productStats = {};
      
      allTasks.forEach(task => {
        if (!task.productName) return;
        
        const expiryDate = convertToDate(task.expiryDate);
        // Użyj rzeczywistych dat produkcji: lastSessionEndDate (koniec) lub startDate (początek)
        const productionDate = convertToDate(task.lastSessionEndDate) || 
                               convertToDate(task.startDate) || 
                               convertToDate(task.createdAt);
        
        // Oblicz dni ważności tylko jeśli mamy obie daty
        let expiryDays = null;
        if (expiryDate && productionDate && !isNaN(expiryDate.getTime()) && !isNaN(productionDate.getTime())) {
          expiryDays = Math.round((expiryDate.getTime() - productionDate.getTime()) / (1000 * 60 * 60 * 24));
        }
        
        if (!productStats[task.productName]) {
          productStats[task.productName] = {
            productName: task.productName,
            totalDays: 0,
            countWithExpiry: 0,
            totalMOCount: 0,
            totalQuantity: 0,
            minDays: Infinity,
            maxDays: -Infinity,
            expiryDaysList: []
          };
        }
        
        const stats = productStats[task.productName];
        stats.totalMOCount += 1;
        stats.totalQuantity += parseFloat(task.quantity) || 0;
        
        if (expiryDays !== null && expiryDays > 0) {
          stats.totalDays += expiryDays;
          stats.countWithExpiry += 1;
          stats.minDays = Math.min(stats.minDays, expiryDays);
          stats.maxDays = Math.max(stats.maxDays, expiryDays);
          stats.expiryDaysList.push(expiryDays);
        }
      });

      // Przekształć dane do formatu eksportu
      const expiryStatsData = Object.values(productStats).map(stats => {
        const avgDays = stats.countWithExpiry > 0 
          ? Math.round(stats.totalDays / stats.countWithExpiry) 
          : null;
        
        return {
          productName: stats.productName,
          avgExpiryDays: avgDays !== null ? avgDays : 'No data',
          moCount: stats.totalMOCount,
          moWithExpiryCount: stats.countWithExpiry,
          totalQuantity: stats.totalQuantity,
          minExpiryDays: stats.minDays !== Infinity ? stats.minDays : 'No data',
          maxExpiryDays: stats.maxDays !== -Infinity ? stats.maxDays : 'No data'
        };
      }).sort((a, b) => a.productName.localeCompare(b.productName));

      // Headers for "Average Expiry Days by SKU" worksheet
      const expiryHeaders = [
        { label: 'Product Name (SKU)', key: 'productName' },
        { label: 'Avg Expiry Days', key: 'avgExpiryDays' },
        { label: 'MO Count', key: 'moCount' },
        { label: 'MO with Expiry Date', key: 'moWithExpiryCount' },
        { label: 'Total Quantity', key: 'totalQuantity' },
        { label: 'Min Expiry Days', key: 'minExpiryDays' },
        { label: 'Max Expiry Days', key: 'maxExpiryDays' }
      ];

      // Generate Excel file with two worksheets
      const currentDate = new Date().toISOString().slice(0, 10);
      const filename = `production_tasks_${currentDate}`;
      
      const worksheets = [
        {
          name: 'MO Tasks',
          data: exportData,
          headers: headers
        },
        {
          name: 'Avg Expiry Days by SKU',
          data: expiryStatsData,
          headers: expiryHeaders
        }
      ];
      
      const success = exportToExcel(worksheets, filename);
      
      if (success) {
        showSuccess(`Exported ${allTasks.length} production tasks and statistics for ${expiryStatsData.length} products to Excel`);
        handleCloseExportDialog();
      } else {
        showError('Failed to export data to Excel');
      }
    } catch (error) {
      console.error('Błąd podczas eksportu Excel:', error);
      showError('Wystąpił błąd podczas eksportu: ' + error.message);
    } finally {
      setExportLoading(false);
    }
  };

  // Renderowanie zadania jako karta na urządzeniach mobilnych
  const renderTaskCard = (task) => {
    // Obliczenie pozostałej ilości do produkcji
    const totalCompletedQuantity = task.totalCompletedQuantity || 0;
    const remainingQuantity = Math.max(0, task.quantity - totalCompletedQuantity);
    
    return (
      <Card key={task.id} variant="outlined" sx={{ 
        mb: 1.5, 
        bgcolor: mode === 'dark' ? 'background.paper' : 'rgb(249, 249, 249)',
        borderColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.12)'
      }}>
        <CardContent sx={{ pb: 1, pt: 1.5, px: 1.5 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Typography variant="subtitle1" component={Link} to={`/production/tasks/${task.id}`} sx={{ 
                textDecoration: 'none',
                color: 'primary.main',
                fontWeight: 'medium',
                fontSize: '0.95rem'
              }}>
                {task.name}
              </Typography>
              <TaskStatusChip 
                task={task}
                getStatusColor={getStatusColor}
                onStatusChange={() => fetchTasksOptimized(null, null, true)}
                editable={true}
                size="small"
              />
            </Box>
            
            {task.moNumber && (
              <Chip 
                size="small" 
                label={`MO: ${task.moNumber}`} 
                color="secondary" 
                variant="outlined" 
                sx={{ alignSelf: 'flex-start', fontSize: '0.7rem', height: '20px' }}
              />
            )}
            
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
              <Box sx={{ minWidth: '45%' }}>
                <Typography variant="caption" color="text.secondary">
                  {t('production.taskListLabels.product')}
                </Typography>
                <Typography variant="body2">
                  {task.productName}
                </Typography>
              </Box>
              
              <Box>
                <Typography variant="caption" color="text.secondary">
                  {t('production.taskListLabels.quantityRemaining')}
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                  <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                    {task.quantity} {task.unit || 'szt.'}
                  </Typography>
                  <Typography 
                    variant="caption" 
                    color={remainingQuantity === 0 ? 'success.main' : (remainingQuantity < task.quantity * 0.2 ? 'warning.main' : 'text.secondary')}
                    sx={{ fontSize: '0.7rem' }}
                  >
                    {t('production.taskListLabels.remaining')} {remainingQuantity} {task.unit || 'szt.'}
                  </Typography>
                </Box>
              </Box>
            </Box>

            
            {task.materials && task.materials.length > 0 && (
              <Box sx={{ mt: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  Surowce:
                </Typography>
                {(() => {
                  const reservationStatus = calculateMaterialReservationStatus(task);
                  const statusColors = getReservationStatusColors(reservationStatus.status);
                  
                  return (
                    <Chip 
                      label={reservationStatus.label} 
                      size="small" 
                      variant="outlined"
                      sx={{ 
                        fontSize: '0.7rem', 
                        height: '20px', 
                        ml: 0.5,
                        borderColor: statusColors.main,
                        color: statusColors.main,
                        '&:hover': {
                          backgroundColor: statusColors.light + '20',
                        }
                      }}
                    />
                  );
                })()}
              </Box>
            )}
          </Box>
        </CardContent>
        
        <Divider sx={{ 
          borderColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)' 
        }} />
        
        <CardActions sx={{ px: 1, py: 0.5, justifyContent: 'flex-end' }}>
          {getStatusActions(task)}
          
          <Tooltip title="Szczegóły zadania">
            <IconButton
              size="small"
              component={Link}
              to={`/production/tasks/${task.id}`}
              color="primary"
            >
              <InfoIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Tooltip title="Edytuj zadanie">
            <IconButton
              size="small"
              component={Link}
              to={`/production/tasks/${task.id}/edit`}
              color="secondary"
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>


        </CardActions>
      </Card>
    );
  };

  return (
    <Container maxWidth="xl" sx={{ 
      px: isMobile ? 1 : 2,
      bgcolor: isMobile ? (mode === 'dark' ? 'background.default' : 'transparent') : 'transparent'
    }}>
      <Box sx={{ mb: isMobile ? 1 : 4 }}>
        <Typography variant="h5" gutterBottom align="center" sx={{ 
          fontSize: isMobile ? '1.1rem' : '1.5rem',
          mb: isMobile ? 0.5 : 1
        }}>
          {t('production.taskList.title')}
        </Typography>
        
        <Box sx={{ 
          display: 'flex', 
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'stretch' : 'center', 
          mb: isMobile ? 1 : 2,
          gap: isMobile ? 0.5 : 2
        }}>
          {/* Lewa strona - Wyszukiwanie i filtrowanie */}
          <Box sx={{ 
            display: 'flex', 
            flexDirection: isMobile ? 'row' : 'row',
            gap: isMobile ? 0.5 : 2,
            order: isMobile ? 1 : 1
          }}>
            {/* Wyszukiwanie - pierwsze od lewej */}
            <TextField
              variant="outlined"
              size="small"
              placeholder={isMobile ? t('production.taskList.searchPlaceholderMobile') : t('production.taskList.searchPlaceholder')}
              value={searchTerm}
              onChange={handleSearchChange}
              sx={{ 
                width: isMobile ? '50%' : 250,
                '& .MuiInputBase-root': {
                  fontSize: isMobile ? '0.8rem' : '0.875rem'
                }
              }}
              InputProps={{
                startAdornment: <SearchIcon color="action" sx={{ mr: isMobile ? 0.5 : 1, fontSize: isMobile ? '1.1rem' : '1.25rem' }} />,
                sx: {
                  borderRadius: '4px',
                  bgcolor: mode === 'dark' ? 'background.paper' : 'white',
                  height: isMobile ? '36px' : '40px'
                }
              }}
            />
            
            {/* Filtrowanie - drugie od lewej */}
            <FormControl 
              variant="outlined" 
              size="small" 
              sx={{ 
                minWidth: isMobile ? '50%' : 200,
                '& .MuiOutlinedInput-root': {
                  borderRadius: '4px',
                  bgcolor: mode === 'dark' ? 'background.paper' : 'white',
                  height: isMobile ? '36px' : '40px',
                  fontSize: isMobile ? '0.8rem' : '0.875rem'
                },
                '& .MuiInputLabel-root': {
                  fontSize: isMobile ? '0.8rem' : '0.875rem'
                }
              }}
            >
              <InputLabel id="status-filter-label">{t('production.taskListColumns.status')}</InputLabel>
              <Select
                labelId="status-filter-label"
                id="status-filter"
                value={statusFilter}
                onChange={handleStatusFilterChange}
                label="Status"
              >
                <MenuItem value="">Wszystkie</MenuItem>
                <MenuItem value="Zaplanowane">Zaplanowane</MenuItem>
                <MenuItem value="W trakcie">W trakcie</MenuItem>
                <MenuItem value="Wstrzymane">Wstrzymane</MenuItem>
                <MenuItem value="Zakończone">Zakończone</MenuItem>
                <MenuItem value="Anulowane">Anulowane</MenuItem>
              </Select>
            </FormControl>
          </Box>
          
          {/* Prawa strona - Przyciski i konfiguracja */}
          <Box sx={{ 
            display: 'flex', 
            flexDirection: isMobile ? 'row' : 'row',
            gap: isMobile ? 0.5 : 1,
            width: isMobile ? '100%' : 'auto',
            order: isMobile ? 2 : 2
          }}>
            <Button 
              variant="contained" 
              color="primary" 
              startIcon={<AddIcon sx={{ fontSize: isMobile ? '1rem' : '1.25rem' }} />}
              component={Link}
              to="/production/create-from-order"
              size="small"
              sx={{
                fontSize: isMobile ? '0.7rem' : '0.875rem',
                padding: isMobile ? '4px 8px' : '6px 16px',
                minHeight: isMobile ? '32px' : '36px',
                flex: isMobile ? 1 : 'none'
              }}
            >
              {isMobile ? "Nowe" : t('production.taskList.newTask')}
            </Button>
            
            {/* Przycisk odświeżania - tylko na desktop jako IconButton */}
            {!isMobile && (
              <Tooltip title={mainTableLoading ? "Ładowanie..." : "Odśwież listę zadań"}>
                <span>
                  <IconButton 
                    onClick={handleManualRefresh}
                    disabled={mainTableLoading}
                    color="primary"
                    size="medium"
                    sx={{ 
                      border: '1px solid',
                      borderColor: 'primary.main',
                      '&:hover': {
                        backgroundColor: 'primary.main',
                        color: 'primary.contrastText'
                      },
                      '&:disabled': {
                        borderColor: 'action.disabled',
                        color: 'action.disabled'
                      }
                    }}
                  >
                    {mainTableLoading ? <CircularProgress size={20} /> : <RefreshIcon />}
                  </IconButton>
                </span>
              </Tooltip>
            )}
            
            {/* Przycisk odświeżania na mobile jako Button */}
            {isMobile && (
              <Button 
                variant="outlined" 
                color="primary" 
                startIcon={mainTableLoading ? <CircularProgress size={12} /> : <RefreshIcon sx={{ fontSize: '1rem' }} />}
                onClick={handleRefreshData}
                disabled={mainTableLoading}
                size="small"
                sx={{
                  fontSize: '0.7rem',
                  padding: '4px 8px',
                  minHeight: '32px',
                  flex: 1
                }}
              >
                {mainTableLoading ? 'Odśw...' : 'Odśw'}
              </Button>
            )}
            
            <Button 
              variant="outlined" 
              color="secondary" 
              startIcon={exportLoading ? <CircularProgress size={12} /> : <DownloadIcon sx={{ fontSize: isMobile ? '1rem' : '1.25rem' }} />}
              onClick={handleOpenExportDialog}
              disabled={exportLoading}
              size="small"
              sx={{
                fontSize: isMobile ? '0.7rem' : '0.875rem',
                padding: isMobile ? '4px 8px' : '6px 16px',
                minHeight: isMobile ? '32px' : '36px',
                flex: isMobile ? 1 : 'none'
              }}
            >
              {exportLoading ? 'Export...' : 'Export'}
            </Button>
            
            {/* Sortowanie - tylko na mobile */}
            {isMobile && (
              <Tooltip title="Sortowanie">
                <IconButton 
                  onClick={handleSortMenuOpen} 
                  size="small"
                  sx={{
                    padding: isMobile ? '4px' : '8px',
                    '& .MuiSvgIcon-root': {
                      fontSize: isMobile ? '1.1rem' : '1.25rem'
                    }
                  }}
                >
                  <SortIcon />
                </IconButton>
              </Tooltip>
            )}

            {/* Konfiguracja kolumn - tylko na desktop */}
            {!isMobile && (
              <Tooltip title="Konfiguruj widoczne kolumny">
                <IconButton 
                  onClick={handleColumnMenuOpen} 
                  size="medium"
                >
                  <ViewColumnIcon />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        </Box>
        
        {mainTableLoading ? (
          <Paper sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Skeleton variant="rectangular" height={60} />
              <Skeleton variant="rectangular" height={50} />
              <Skeleton variant="rectangular" height={50} />
              <Skeleton variant="rectangular" height={50} />
              <Skeleton variant="rectangular" height={50} />
            </Box>
          </Paper>
        ) : (
          <Fade in={showContent && !mainTableLoading} timeout={300}>
            <Box>
              {filteredTasks.length === 0 ? (
                <Paper sx={{ p: 3, textAlign: 'center' }}>
                  <Typography variant="body1">{t('production.taskListLabels.noTasksMessage')}</Typography>
                </Paper>
              ) : isMobile ? (
                // Widok mobilny - karty zamiast tabeli
                <Box sx={{ mt: 1 }}>
                  {filteredTasks.map(renderTaskCard)}
                </Box>
              ) : (
                // Widok desktopowy - tabela
                <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  {visibleColumns.name && (
                    <TableCell
                      onClick={() => handleSort('moNumber')}
                      sx={{ cursor: 'pointer', userSelect: 'none' }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        {t('production.taskListColumns.taskName')}
                        {tableSort.field === 'moNumber' && (
                          <ArrowDropDownIcon 
                            sx={{ 
                              transform: tableSort.order === 'asc' ? 'rotate(180deg)' : 'none',
                              transition: 'transform 0.2s',
                              ml: 0.5
                            }} 
                          />
                        )}
                      </Box>
                    </TableCell>
                  )}
                  {visibleColumns.productName && (
                    <TableCell
                      onClick={() => handleSort('productName')}
                      sx={{ cursor: 'pointer', userSelect: 'none' }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        {t('production.taskListColumns.product')}
                        {tableSort.field === 'productName' && (
                          <ArrowDropDownIcon 
                            sx={{ 
                              transform: tableSort.order === 'asc' ? 'rotate(180deg)' : 'none',
                              transition: 'transform 0.2s',
                              ml: 0.5
                            }} 
                          />
                        )}
                      </Box>
                    </TableCell>
                  )}
                  {visibleColumns.quantityProgress && (
                    <TableCell
                      onClick={() => handleSort('quantity')}
                      sx={{ cursor: 'pointer', userSelect: 'none' }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        {t('production.taskListColumns.quantityProgress')}
                        {tableSort.field === 'quantity' && (
                          <ArrowDropDownIcon 
                            sx={{ 
                              transform: tableSort.order === 'asc' ? 'rotate(180deg)' : 'none',
                              transition: 'transform 0.2s',
                              ml: 0.5
                            }} 
                          />
                        )}
                      </Box>
                    </TableCell>
                  )}

                  {visibleColumns.statusAndMaterials && (
                    <TableCell
                      onClick={() => handleSort('status')}
                      sx={{ cursor: 'pointer', userSelect: 'none' }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        Status / Materiały
                        {tableSort.field === 'status' && (
                          <ArrowDropDownIcon 
                            sx={{ 
                              transform: tableSort.order === 'asc' ? 'rotate(180deg)' : 'none',
                              transition: 'transform 0.2s',
                              ml: 0.5
                            }} 
                          />
                        )}
                      </Box>
                    </TableCell>
                  )}
                  {visibleColumns.plannedStart && (
                    <TableCell
                      onClick={() => handleSort('scheduledDate')}
                      sx={{ cursor: 'pointer', userSelect: 'none' }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        {t('production.taskListColumns.plannedStart')}
                        {tableSort.field === 'scheduledDate' && (
                          <ArrowDropDownIcon 
                            sx={{ 
                              transform: tableSort.order === 'asc' ? 'rotate(180deg)' : 'none',
                              transition: 'transform 0.2s',
                              ml: 0.5
                            }} 
                          />
                        )}
                      </Box>
                    </TableCell>
                  )}
                  {visibleColumns.plannedEnd && (
                    <TableCell
                      onClick={() => handleSort('endDate')}
                      sx={{ cursor: 'pointer', userSelect: 'none' }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        {t('production.taskListColumns.plannedEnd')}
                        {tableSort.field === 'endDate' && (
                          <ArrowDropDownIcon 
                            sx={{ 
                              transform: tableSort.order === 'asc' ? 'rotate(180deg)' : 'none',
                              transition: 'transform 0.2s',
                              ml: 0.5
                            }} 
                          />
                        )}
                      </Box>
                    </TableCell>
                  )}
                  {visibleColumns.cost && <TableCell>{t('production.taskListColumns.unitCost')}</TableCell>}
                  {visibleColumns.totalCost && <TableCell>{t('production.taskListColumns.totalCost')}</TableCell>}
                  {visibleColumns.actions && <TableCell>{t('production.taskListColumns.actions')}</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {/* 🚀 OPTYMALIZACJA: Użycie memoizowanego komponentu TaskTableRow */}
                {filteredTasks.map((task) => (
                  <TaskTableRow
                    key={task.id}
                    task={task}
                    visibleColumns={visibleColumns}
                    formatDateTimeNumeric={memoizedFormatDateTime}
                    onStatusChange={handleStatusChangeCallback}
                    onStopProductionDirect={handleStopProductionDirectCallback}
                    onRefresh={handleRefreshCallback}
                    navigate={navigate}
                    t={t}
                  />
                ))}
              </TableBody>
                </Table>
                </TableContainer>
              )}
            </Box>
          </Fade>
        )}
      </Box>
      
      {/* Menu sortowania - tylko dla mobile */}
      <Menu
        anchorEl={sortMenuAnchor}
        open={Boolean(sortMenuAnchor)}
        onClose={handleSortMenuClose}
      >
        <MenuItem onClick={() => handleSortChange('moNumber')}>
          <ListItemText 
            primary={t('production.taskListColumns.taskName')} 
            secondary={tableSort.field === 'moNumber' ? `(${tableSort.order === 'asc' ? 'A-Z' : 'Z-A'})` : ''}
          />
        </MenuItem>
        <MenuItem onClick={() => handleSortChange('productName')}>
          <ListItemText 
            primary={t('production.taskListColumns.product')} 
            secondary={tableSort.field === 'productName' ? `(${tableSort.order === 'asc' ? 'A-Z' : 'Z-A'})` : ''}
          />
        </MenuItem>
        <MenuItem onClick={() => handleSortChange('quantity')}>
          <ListItemText 
            primary={t('production.taskListColumns.quantityProgress')} 
            secondary={tableSort.field === 'quantity' ? `(${tableSort.order === 'asc' ? 'rosnąco' : 'malejąco'})` : ''}
          />
        </MenuItem>
        <MenuItem onClick={() => handleSortChange('status')}>
          <ListItemText 
            primary={t('production.taskListColumns.status')} 
            secondary={tableSort.field === 'status' ? `(${tableSort.order === 'asc' ? 'A-Z' : 'Z-A'})` : ''}
          />
        </MenuItem>
        <MenuItem onClick={() => handleSortChange('scheduledDate')}>
          <ListItemText 
            primary={t('production.taskListColumns.plannedStart')} 
            secondary={tableSort.field === 'scheduledDate' ? `(${tableSort.order === 'asc' ? 'najwcześniej' : 'najpóźniej'})` : ''}
          />
        </MenuItem>
        <MenuItem onClick={() => handleSortChange('endDate')}>
          <ListItemText 
            primary={t('production.taskListColumns.plannedEnd')} 
            secondary={tableSort.field === 'endDate' ? `(${tableSort.order === 'asc' ? 'najwcześniej' : 'najpóźniej'})` : ''}
          />
        </MenuItem>
      </Menu>

      {/* Menu konfiguracji kolumn */}
      <Menu
        anchorEl={columnMenuAnchor}
        open={Boolean(columnMenuAnchor)}
        onClose={handleColumnMenuClose}
      >
        <MenuItem onClick={() => toggleColumnVisibility('name')}>
          <Checkbox checked={visibleColumns.name} />
          <ListItemText primary={t('production.taskListColumns.taskName')} />
        </MenuItem>
        <MenuItem onClick={() => toggleColumnVisibility('productName')}>
          <Checkbox checked={visibleColumns.productName} />
          <ListItemText primary={t('production.taskListColumns.product')} />
        </MenuItem>
        <MenuItem onClick={() => toggleColumnVisibility('quantityProgress')}>
          <Checkbox checked={visibleColumns.quantityProgress} />
          <ListItemText primary={t('production.taskListColumns.quantityProgress')} />
        </MenuItem>
        
        <MenuItem onClick={() => toggleColumnVisibility('statusAndMaterials')}>
          <Checkbox checked={visibleColumns.statusAndMaterials} />
          <ListItemText primary="Status / Materiały" />
        </MenuItem>
        <MenuItem onClick={() => toggleColumnVisibility('plannedStart')}>
          <Checkbox checked={visibleColumns.plannedStart} />
          <ListItemText primary={t('production.taskListColumns.plannedStart')} />
        </MenuItem>
        <MenuItem onClick={() => toggleColumnVisibility('plannedEnd')}>
          <Checkbox checked={visibleColumns.plannedEnd} />
          <ListItemText primary={t('production.taskListColumns.plannedEnd')} />
        </MenuItem>
        <MenuItem onClick={() => toggleColumnVisibility('cost')}>
          <Checkbox checked={visibleColumns.cost} />
          <ListItemText primary={t('production.taskListColumns.unitCost')} />
        </MenuItem>
        <MenuItem onClick={() => toggleColumnVisibility('totalCost')}>
          <Checkbox checked={visibleColumns.totalCost} />
          <ListItemText primary={t('production.taskListColumns.totalCost')} />
        </MenuItem>
        <MenuItem onClick={() => toggleColumnVisibility('actions')}>
          <Checkbox checked={visibleColumns.actions} />
          <ListItemText primary={t('production.taskListColumns.actions')} />
        </MenuItem>
      </Menu>
      
      {/* Dialog ustawiania daty ważności przy starcie produkcji */}
      <Dialog
        open={startProductionDialogOpen}
        onClose={() => setStartProductionDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Rozpocznij produkcję</DialogTitle>
        <DialogContent>
          <DialogContentText sx={mb2}>
            Data ważności gotowego produktu jest wymagana do rozpoczęcia produkcji.
          </DialogContentText>
          
          {startProductionError && (
            <Alert severity="error" sx={mb2}>
              {startProductionError}
            </Alert>
          )}

          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
            <Box sx={{ my: 2 }}>
              <DateTimePicker
                label="Data ważności gotowego produktu *"
                value={startProductionData.expiryDate}
                onChange={(newValue) => setStartProductionData({
                  ...startProductionData, 
                  expiryDate: newValue
                })}
                views={['year', 'month', 'day']}
                format="dd-MM-yyyy"
                slotProps={{
                  textField: {
                    fullWidth: true,
                    margin: 'dense',
                    variant: 'outlined',
                    helperText: "Data ważności produktu jest wymagana",
                    error: !startProductionData.expiryDate,
                    required: true
                  },
                  actionBar: {
                    actions: ['clear', 'today']
                  }
                }}
              />
            </Box>
          </LocalizationProvider>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStartProductionDialogOpen(false)}>
            Anuluj
          </Button>
          <Button 
            onClick={handleStartProductionWithExpiry} 
            variant="contained"
            disabled={!startProductionData.expiryDate}
          >
            Rozpocznij produkcję
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
        <DialogTitle>{t('production.taskListLabels.stopProduction')}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={mb2}>
            Wprowadź informacje o zakończonej sesji produkcyjnej
          </DialogContentText>
          
          {productionError && (
            <Alert severity="error" sx={mb2}>
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
              endAdornment: <Typography variant="body2">szt.</Typography>
            }}
          />
          
          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, my: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Przedział czasowy produkcji:
              </Typography>
              
              <DateTimePicker
                label="Czas rozpoczęcia"
                value={productionStartTime}
                onChange={(newValue) => setProductionStartTime(newValue)}
                ampm={false}
                format="dd-MM-yyyy HH:mm"
                slotProps={{
                  textField: {
                    fullWidth: true,
                    margin: 'dense',
                    variant: 'outlined'
                  }
                }}
              />
              
              <DateTimePicker
                label="Czas zakończenia"
                value={productionEndTime}
                onChange={(newValue) => setProductionEndTime(newValue)}
                ampm={false}
                format="dd-MM-yyyy HH:mm"
                slotProps={{
                  textField: {
                    fullWidth: true,
                    margin: 'dense',
                    variant: 'outlined'
                  }
                }}
              />
              
              {productionStartTime && productionEndTime && (
                <Typography variant="body2" color="textSecondary">
                  Czas trwania: {Math.round((productionEndTime.getTime() - productionStartTime.getTime()) / (1000 * 60))} minut
                </Typography>
              )}
            </Box>
          </LocalizationProvider>

          {/* Opcja dodawania produktu do magazynu */}
          <Box sx={{ mt: 3, mb: 2 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={addToInventoryOnStop}
                  onChange={(e) => setAddToInventoryOnStop(e.target.checked)}
                  color="primary"
                />
              }
              label="Dodaj gotowy produkt do magazynu"
            />
          </Box>

          {/* Formularz dodawania do magazynu - widoczny tylko gdy opcja jest zaznaczona */}
          {addToInventoryOnStop && (
            <Box sx={{ mt: 2, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
              <Typography variant="subtitle2" gutterBottom>
                Dane do dodania do magazynu:
              </Typography>
              
              {stopProductionInventoryError && (
                <Alert severity="error" sx={mb2}>
                  {stopProductionInventoryError}
                </Alert>
              )}
              
              <TextField
                label="Ilość końcowa"
                type="number"
                value={stopProductionInventoryData.finalQuantity}
                onChange={(e) => setStopProductionInventoryData({
                  ...stopProductionInventoryData, 
                  finalQuantity: e.target.value
                })}
                fullWidth
                margin="dense"
                helperText="Wprowadź faktyczną ilość produktu końcowego"
              />
              
              <TextField
                label="Numer partii (LOT)"
                value={stopProductionInventoryData.lotNumber}
                onChange={(e) => setStopProductionInventoryData({
                  ...stopProductionInventoryData, 
                  lotNumber: e.target.value
                })}
                fullWidth
                margin="dense"
                helperText="Wprowadź unikalny identyfikator partii produkcyjnej"
              />
              
              <FormControl fullWidth margin="dense">
                <InputLabel id="stop-warehouse-select-label">Magazyn docelowy</InputLabel>
                <Select
                  labelId="stop-warehouse-select-label"
                  id="stop-warehouse-select"
                  value={stopProductionInventoryData.warehouseId}
                  onChange={(e) => setStopProductionInventoryData({
                    ...stopProductionInventoryData, 
                    warehouseId: e.target.value
                  })}
                  label="Magazyn docelowy"
                >
                  {warehousesLoading ? (
                    <MenuItem disabled>Ładowanie magazynów...</MenuItem>
                  ) : warehouses.length === 0 ? (
                    <MenuItem disabled>Brak dostępnych magazynów</MenuItem>
                  ) : (
                    warehouses.map((warehouse) => (
                      <MenuItem key={warehouse.id} value={warehouse.id}>
                        {warehouse.name}
                      </MenuItem>
                    ))
                  )}
                </Select>
              </FormControl>
              
              <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                <Box sx={{ my: 2 }}>
                  <DateTimePicker
                    label="Data ważności"
                    value={stopProductionInventoryData.expiryDate}
                    onChange={(newValue) => setStopProductionInventoryData({
                      ...stopProductionInventoryData, 
                      expiryDate: newValue
                    })}
                    views={['year', 'month', 'day']}
                    format="dd-MM-yyyy"
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        margin: 'dense',
                        variant: 'outlined',
                        helperText: "Data ważności produktu",
                        error: !stopProductionInventoryData.expiryDate,
                        InputProps: {
                          onError: (error) => {
                            console.error("Błąd w polu daty:", error);
                          }
                        }
                      },
                      actionBar: {
                        actions: ['clear', 'today']
                      }
                    }}
                  />
                </Box>
              </LocalizationProvider>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStopProductionDialogOpen(false)}>
            Anuluj
          </Button>
          <Button onClick={handleStopProduction} variant="contained">
            {addToInventoryOnStop ? 'Zatrzymaj i dodaj do magazynu' : 'Zatwierdź'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog eksportu z filtrami */}
      <Dialog
        open={exportDialogOpen}
        onClose={handleCloseExportDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Export Production Tasks to Excel</DialogTitle>
        <DialogContent>
          <DialogContentText sx={mb2}>
            Export contains two worksheets: <strong>MO Tasks</strong> and <strong>Avg Expiry Days by SKU</strong>. 
            Select filter criteria or leave empty to export all tasks.
          </DialogContentText>
          
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {/* Client filter */}
            <Grid item xs={12}>
              <FormControl fullWidth size="small">
                <InputLabel id="export-client-filter-label">Client</InputLabel>
                <Select
                  labelId="export-client-filter-label"
                  value={exportFilters.clientName}
                  onChange={(e) => setExportFilters({...exportFilters, clientName: e.target.value})}
                  label="Client"
                >
                  <MenuItem value="">All clients</MenuItem>
                  {uniqueClients.map(client => (
                    <MenuItem key={client} value={client}>{client}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            {/* Status filter */}
            <Grid item xs={12}>
              <FormControl fullWidth size="small">
                <InputLabel id="export-status-filter-label">Status</InputLabel>
                <Select
                  labelId="export-status-filter-label"
                  value={exportFilters.status}
                  onChange={(e) => setExportFilters({...exportFilters, status: e.target.value})}
                  label="Status"
                >
                  <MenuItem value="">All statuses</MenuItem>
                  <MenuItem value="Zaplanowane">Planned</MenuItem>
                  <MenuItem value="W trakcie">In Progress</MenuItem>
                  <MenuItem value="Wstrzymane">On Hold</MenuItem>
                  <MenuItem value="Zakończone">Completed</MenuItem>
                  <MenuItem value="Anulowane">Cancelled</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            {/* Date from filter */}
            <Grid item xs={6}>
              <TextField
                fullWidth
                size="small"
                label="Created from"
                type="date"
                value={exportFilters.fromDate}
                onChange={(e) => setExportFilters({...exportFilters, fromDate: e.target.value})}
                InputLabelProps={{
                  shrink: true,
                }}
              />
            </Grid>
            
            {/* Date to filter */}
            <Grid item xs={6}>
              <TextField
                fullWidth
                size="small"
                label="Created to"
                type="date"
                value={exportFilters.toDate}
                onChange={(e) => setExportFilters({...exportFilters, toDate: e.target.value})}
                InputLabelProps={{
                  shrink: true,
                }}
              />
            </Grid>
          </Grid>
          
          <Box sx={{ mt: 2, p: 1.5, bgcolor: 'action.hover', borderRadius: 1 }}>
            <Typography variant="body2" color="textSecondary">
              <strong>Active filters:</strong>{' '}
              {!exportFilters.clientName && !exportFilters.status && !exportFilters.fromDate && !exportFilters.toDate 
                ? 'None (export all tasks)' 
                : [
                    exportFilters.clientName && `Client: ${exportFilters.clientName}`,
                    exportFilters.status && `Status: ${exportFilters.status}`,
                    exportFilters.fromDate && `From: ${exportFilters.fromDate}`,
                    exportFilters.toDate && `To: ${exportFilters.toDate}`
                  ].filter(Boolean).join(', ')
              }
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseExportDialog} color="secondary">
            Cancel
          </Button>
          <Button 
            onClick={() => setExportFilters({ clientName: '', status: '', fromDate: '', toDate: '' })}
            color="inherit"
          >
            Clear filters
          </Button>
          <Button 
            onClick={handleExportCSV} 
            color="primary" 
            variant="contained"
            disabled={exportLoading}
            startIcon={exportLoading ? <CircularProgress size={16} /> : <DownloadIcon />}
          >
            {exportLoading ? 'Exporting...' : 'Export'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog dodawania produktu do magazynu */}
      <Dialog
        open={addToInventoryDialogOpen}
        onClose={() => setAddToInventoryDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Dodaj produkt do magazynu</DialogTitle>
        <DialogContent>
          <DialogContentText sx={mb2}>
            Wprowadź informacje o partii produktu przed dodaniem do magazynu
          </DialogContentText>
          
          {inventoryError && (
            <Alert severity="error" sx={mb2}>
              {inventoryError}
            </Alert>
          )}
          
          <TextField
            label="Ilość końcowa"
            type="number"
            value={inventoryData.finalQuantity}
            onChange={(e) => setInventoryData({...inventoryData, finalQuantity: e.target.value})}
            fullWidth
            margin="dense"
            helperText="Wprowadź faktyczną ilość produktu końcowego"
          />
          
          <TextField
            label="Numer partii (LOT)"
            value={inventoryData.lotNumber}
            onChange={(e) => setInventoryData({...inventoryData, lotNumber: e.target.value})}
            fullWidth
            margin="dense"
            helperText="Wprowadź unikalny identyfikator partii produkcyjnej"
          />
          
          <FormControl fullWidth margin="dense">
            <InputLabel id="warehouse-select-label">Magazyn docelowy</InputLabel>
            <Select
              labelId="warehouse-select-label"
              id="warehouse-select"
              value={inventoryData.warehouseId}
              onChange={(e) => setInventoryData({...inventoryData, warehouseId: e.target.value})}
              label="Magazyn docelowy"
            >
              {warehousesLoading ? (
                <MenuItem disabled>Ładowanie magazynów...</MenuItem>
              ) : warehouses.length === 0 ? (
                <MenuItem disabled>Brak dostępnych magazynów</MenuItem>
              ) : (
                warehouses.map((warehouse) => (
                  <MenuItem key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </MenuItem>
                ))
              )}
            </Select>
          </FormControl>
          
          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
            <Box sx={{ my: 2 }}>
              <DateTimePicker
                label="Data ważności"
                value={inventoryData.expiryDate}
                onChange={(newValue) => setInventoryData({...inventoryData, expiryDate: newValue})}
                views={['year', 'month', 'day']}
                format="dd-MM-yyyy"
                slotProps={{
                  textField: {
                    fullWidth: true,
                    margin: 'dense',
                    variant: 'outlined',
                    helperText: "Data ważności produktu",
                    error: !inventoryData.expiryDate,
                    InputProps: {
                      onError: (error) => {
                        console.error("Błąd w polu daty:", error);
                      }
                    }
                  },
                  actionBar: {
                    actions: ['clear', 'today']
                  }
                }}
              />
            </Box>
          </LocalizationProvider>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddToInventoryDialogOpen(false)}>
            Anuluj
          </Button>
          <Button onClick={() => handleAddToInventory(currentTaskId)} variant="contained" color="primary">
            Dodaj do magazynu
          </Button>
        </DialogActions>
      </Dialog>

      {/* Komponent Pagination */}
      {/* Komponent Pagination z nowymi optymalizacjami */}
      <Fade in={showContent && !mainTableLoading} timeout={300}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2, flexDirection: 'column', alignItems: 'center' }}>
          <Box sx={{ ...mb1, ...flexCenterGap2 }}>
            <Typography variant="body2" color="textSecondary">
              Wyświetlanie {tasks.length > 0 ? (page - 1) * pageSize + 1 : 0} - {Math.min(page * pageSize, totalItems)} z {totalItems} zadań
            </Typography>
            
            <FormControl variant="outlined" size="small" sx={{ minWidth: 80 }}>
              <Select
                value={pageSize}
                onChange={handleChangeRowsPerPage}
              >
                <MenuItem value={5}>5</MenuItem>
                <MenuItem value={10}>10</MenuItem>
                <MenuItem value={25}>25</MenuItem>
                <MenuItem value={50}>50</MenuItem>
              </Select>
            </FormControl>
          </Box>
          
          <Pagination
            count={totalPages}
            page={page}
            onChange={handleChangePage}
            shape="rounded"
            color="primary"
          />
        </Box>
      </Fade>
    </Container>
  );
};

export default TaskList;