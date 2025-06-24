import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  FormControlLabel,
  Switch,
  Menu,
  MenuItem,
  Chip,
  IconButton,
  Tooltip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  TextField,
  CircularProgress,
  useMediaQuery,
  useTheme as useMuiTheme,
  Slider
} from '@mui/material';
import {
  CalendarMonth as CalendarIcon,
  Business as BusinessIcon,
  Work as WorkIcon,
  People as PeopleIcon,
  Settings as SettingsIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  FilterList as FilterListIcon,
  Refresh as RefreshIcon,
  CenterFocusStrong as ResetZoomIcon,
  Schedule as HourlyIcon,
  ViewDay as DailyIcon,
  ViewWeek as WeeklyIcon,
  DateRange as MonthlyIcon,
  Search as SearchIcon,
  Edit as EditIcon,
  Lock as LockIcon
} from '@mui/icons-material';
import Timeline, {
  DateHeader,
  SidebarHeader,
  TimelineHeaders,
  CustomHeader
} from 'react-calendar-timeline';
import { format, addDays, startOfDay, endOfDay } from 'date-fns';
import { pl } from 'date-fns/locale';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';

import { 
  getTasksByDateRange, 
  updateTask,
  getTasksByDateRangeOptimizedNew,
  getAllTasks
} from '../../services/productionService';
import { getAllWorkstations } from '../../services/workstationService';
import { getAllCustomers } from '../../services/customerService';
import { useNotification } from '../../hooks/useNotification';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../contexts/ThemeContext';
import TimelineExport from './TimelineExport';

// Import stylów dla react-calendar-timeline
import 'react-calendar-timeline/dist/style.css';

// Zoptymalizowany komponent Tooltip
const CustomTooltip = React.memo(({ task, position, visible, themeMode }) => {
  if (!visible || !task) return null;

  const getStatusText = (status) => {
    const statusMap = {
      'Zaplanowane': 'Zaplanowane',
      'W trakcie': 'W trakcie',
      'Zakończone': 'Zakończone',
      'Anulowane': 'Anulowane',
      'Wstrzymane': 'Wstrzymane'
    };
    return statusMap[status] || status;
  };

  const formatDate = (date) => {
    if (!date) return 'Nie ustawiono';
    const d = date instanceof Date ? date : 
             date.toDate ? date.toDate() : 
             new Date(date);
    return format(d, 'dd.MM.yyyy HH:mm', { locale: pl });
  };

  const getWorkstationName = () => {
    if (!task.workstationId) return 'Bez stanowiska';
    const workstation = task.workstation || (task.workstationName ? { name: task.workstationName } : null);
    return workstation?.name || 'Nieznane stanowisko';
  };

  const getCustomerName = () => {
    const customerId = task.customer?.id || task.customerId;
    if (!customerId) return 'Bez klienta';
    const customer = task.customer || (task.customerName ? { name: task.customerName } : null);
    return customer?.name || task.customerName || 'Nieznany klient';
  };

  const getDuration = () => {
    if (task.estimatedDuration) {
      const hours = Math.floor(task.estimatedDuration / 60);
      const minutes = task.estimatedDuration % 60;
      return hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`;
    }
    
    if (task.scheduledDate && task.endDate) {
      const start = task.scheduledDate instanceof Date ? task.scheduledDate : 
                   task.scheduledDate.toDate ? task.scheduledDate.toDate() : 
                   new Date(task.scheduledDate);
      const end = task.endDate instanceof Date ? task.endDate : 
                 task.endDate.toDate ? task.endDate.toDate() : 
                 new Date(task.endDate);
      const diffMs = end.getTime() - start.getTime();
      const diffMinutes = Math.round(diffMs / (1000 * 60));
      const hours = Math.floor(diffMinutes / 60);
      const minutes = diffMinutes % 60;
      return hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`;
    }
    
    return 'Nie określono';
  };

  const tooltipStyle = {
    position: 'fixed',
    left: position.x,
    top: position.y,
    backgroundColor: themeMode === 'dark' ? '#1e293b' : '#ffffff',
    color: themeMode === 'dark' ? '#ffffff' : 'rgba(0, 0, 0, 0.87)',
    border: themeMode === 'dark' ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
    borderRadius: '8px',
    padding: '12px',
    boxShadow: themeMode === 'dark' 
      ? '0px 8px 24px rgba(0, 0, 0, 0.4)' 
      : '0px 8px 24px rgba(0, 0, 0, 0.15)',
    fontSize: '0.875rem',
    lineHeight: '1.4',
    maxWidth: '320px',
    minWidth: '240px',
    zIndex: 10000,
    pointerEvents: 'none',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)'
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Zaplanowane':
        return '#3788d8';
      case 'W trakcie':
        return '#f39c12';
      case 'Zakończone':
        return '#2ecc71';
      case 'Anulowane':
        return '#e74c3c';
      case 'Wstrzymane':
        return '#757575';
      default:
        return '#95a5a6';
    }
  };

  const statusColor = getStatusColor(task.status);

  return (
    <div style={tooltipStyle}>
      {/* Nagłówek z nazwą zadania */}
      <div style={{ 
        fontWeight: 600, 
        fontSize: '0.95rem', 
        marginBottom: '8px',
        color: themeMode === 'dark' ? '#ffffff' : 'rgba(0, 0, 0, 0.9)'
      }}>
        {task.name || task.productName}
      </div>

      {/* Status */}
      <div style={{ marginBottom: '6px', display: 'flex', alignItems: 'center' }}>
        <span style={{ marginRight: '8px', color: themeMode === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)' }}>
          Status:
        </span>
        <span style={{ 
          color: statusColor, 
          fontWeight: 500,
          backgroundColor: `${statusColor}20`,
          padding: '2px 6px',
          borderRadius: '4px',
          fontSize: '0.8rem'
        }}>
          {getStatusText(task.status)}
        </span>
      </div>

      {/* Numer MO */}
      {task.moNumber && (
        <div style={{ marginBottom: '6px' }}>
          <span style={{ color: themeMode === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)' }}>
            MO: 
          </span>
          <span style={{ marginLeft: '8px', fontWeight: 500 }}>
            {task.moNumber}
          </span>
        </div>
      )}

      {/* Ilość */}
      <div style={{ marginBottom: '6px' }}>
        <span style={{ color: themeMode === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)' }}>
          Ilość: 
        </span>
        <span style={{ marginLeft: '8px', fontWeight: 500 }}>
          {task.quantity} {task.unit || 'szt.'}
        </span>
      </div>

      {/* Stanowisko */}
      <div style={{ marginBottom: '6px' }}>
        <span style={{ color: themeMode === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)' }}>
          Stanowisko: 
        </span>
        <span style={{ marginLeft: '8px', fontWeight: 500 }}>
          {getWorkstationName()}
        </span>
      </div>

      {/* Klient */}
      <div style={{ marginBottom: '6px' }}>
        <span style={{ color: themeMode === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)' }}>
          Klient: 
        </span>
        <span style={{ marginLeft: '8px', fontWeight: 500 }}>
          {getCustomerName()}
        </span>
      </div>

      {/* Czas trwania */}
      <div style={{ marginBottom: '8px' }}>
        <span style={{ color: themeMode === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)' }}>
          Czas trwania: 
        </span>
        <span style={{ marginLeft: '8px', fontWeight: 500 }}>
          {getDuration()}
        </span>
      </div>

      {/* Daty */}
      <div style={{ 
        fontSize: '0.8rem',
        borderTop: themeMode === 'dark' ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(0, 0, 0, 0.1)',
        paddingTop: '8px',
        color: themeMode === 'dark' ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.5)'
      }}>
        <div style={{ marginBottom: '4px' }}>
          <strong>Start:</strong> {formatDate(task.scheduledDate)}
        </div>
        <div>
          <strong>Koniec:</strong> {formatDate(task.endDate)}
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.visible === nextProps.visible &&
    prevProps.themeMode === nextProps.themeMode &&
    prevProps.position.x === nextProps.position.x &&
    prevProps.position.y === nextProps.position.y &&
    prevProps.task?.id === nextProps.task?.id
  );
});

// Zoptymalizowany główny komponent z debouncing
const ProductionTimeline = React.memo(() => {
  const [tasks, setTasks] = useState([]);
  const [workstations, setWorkstations] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState('workstation'); // 'workstation' lub 'order'
  const [useWorkstationColors, setUseWorkstationColors] = useState(false);
  const [snapToPrevious, setSnapToPrevious] = useState(false); // Nowy stan dla trybu dociągania
  const [selectedWorkstations, setSelectedWorkstations] = useState({});
  const [selectedCustomers, setSelectedCustomers] = useState({});
  
  // Stany dla timeline
  const [visibleTimeStart, setVisibleTimeStart] = useState(
    startOfDay(new Date()).getTime()
  );
  const [visibleTimeEnd, setVisibleTimeEnd] = useState(
    endOfDay(addDays(new Date(), 30)).getTime()
  );
  const [canvasTimeStart, setCanvasTimeStart] = useState(
    startOfDay(addDays(new Date(), -90)).getTime() // Rozszerzam zakres do 90 dni wstecz
  );
  const [canvasTimeEnd, setCanvasTimeEnd] = useState(
    endOfDay(addDays(new Date(), 365)).getTime() // Rozszerzam zakres do roku w przód
  );
  
  // Stany dla menu i dialogów
  const [filterMenuAnchor, setFilterMenuAnchor] = useState(null);
  const [settingsMenuAnchor, setSettingsMenuAnchor] = useState(null);
  const [editDialog, setEditDialog] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [editForm, setEditForm] = useState({
    start: null,
    end: null
  });
  
  // Stany dla zoom i skali
  const [zoomLevel, setZoomLevel] = useState(1);
  const [timeScale, setTimeScale] = useState('daily'); // 'hourly', 'daily', 'weekly', 'monthly'
  
  // Stany dla tooltip
  const [tooltipData, setTooltipData] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [tooltipVisible, setTooltipVisible] = useState(false);
  
  // Stan dla suwaka poziomego
  const [sliderValue, setSliderValue] = useState(0);
  
  // Stany dla zaawansowanego filtrowania
  const [advancedFilterDialog, setAdvancedFilterDialog] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState({
    productName: '',
    moNumber: '',
    orderNumber: ''
  });
  
  // Stan dla trybu edycji
  const [editMode, setEditMode] = useState(false);
  

  
  // Ref do funkcji updateScrollCanvas z Timeline
  const updateScrollCanvasRef = useRef(null);
  
  const { showError, showSuccess } = useNotification();
  const { currentUser } = useAuth();
  const { mode: themeMode } = useTheme(); // Motyw aplikacji
  const muiTheme = useMuiTheme();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('md'));

  // Pobranie danych
  useEffect(() => {
    fetchWorkstations();
    fetchCustomers();
    fetchTasks();
  }, []);

  const fetchWorkstations = async () => {
    try {
      const data = await getAllWorkstations();
      setWorkstations(data);
      
      const initialSelected = {};
      data.forEach(workstation => {
        initialSelected[workstation.id] = true;
      });
      initialSelected['no-workstation'] = true; // Domyślnie zaznacz grupę bez stanowiska
      setSelectedWorkstations(initialSelected);
    } catch (error) {
      console.error('Błąd podczas pobierania stanowisk:', error);
      showError('Błąd podczas pobierania stanowisk: ' + error.message);
    }
  };

  const fetchCustomers = async () => {
    try {
      const data = await getAllCustomers();
      setCustomers(data);
      
      const initialSelected = {};
      data.forEach(customer => {
        initialSelected[customer.id] = true;
      });
      initialSelected['no-customer'] = true;
      setSelectedCustomers(initialSelected);
    } catch (error) {
      console.error('Błąd podczas pobierania klientów:', error);
      showError('Błąd podczas pobierania klientów: ' + error.message);
    }
  };

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      const startDate = new Date(canvasTimeStart);
      const endDate = new Date(canvasTimeEnd);
      
      let data;
      try {
        // Spróbuj najpierw pobrać dane z nową funkcją
        data = await getTasksByDateRangeOptimizedNew(
          startDate.toISOString(),
          endDate.toISOString(),
          5000
        );
      } catch (error) {
        // Fallback - pobierz wszystkie zadania
        data = await getAllTasks();
        
        // Filtruj zadania według zakresu dat po stronie klienta
        data = data.filter(task => {
          const taskDate = task.scheduledDate;
          if (!taskDate) return true;
          
          const taskTime = taskDate instanceof Date ? taskDate.getTime() : 
                          taskDate.toDate ? taskDate.toDate().getTime() : 
                          new Date(taskDate).getTime();
          
          return taskTime >= canvasTimeStart && taskTime <= canvasTimeEnd;
        });
      }
      
      setTasks(data);
    } catch (error) {
      console.error('Błąd podczas pobierania zadań:', error);
      showError('Błąd podczas pobierania zadań: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [canvasTimeStart, canvasTimeEnd, showError]);

  // Funkcje pomocnicze dla kolorów
  const getStatusColor = (status) => {
    switch (status) {
      case 'Zaplanowane':
        return '#3788d8';
      case 'W trakcie':
        return '#f39c12';
      case 'Zakończone':
        return '#2ecc71';
      case 'Anulowane':
        return '#e74c3c';
      case 'Wstrzymane':
        return '#757575';
      default:
        return '#95a5a6';
    }
  };

  const getWorkstationColor = (workstationId) => {
    const workstation = workstations.find(w => w.id === workstationId);
    if (workstation && workstation.color) {
      return workstation.color;
    }
    
    const defaultColors = {
      'WCT00003': '#2196f3',
      'WCT00006': '#4caf50',
      'WCT00009': '#f50057',
      'WCT00012': '#ff9800',
      'WCT00015': '#9c27b0'
    };
    
    return defaultColors[workstationId] || '#7986cb';
  };

  const getItemColor = (task) => {
    if (useWorkstationColors && task.workstationId) {
      return getWorkstationColor(task.workstationId);
    }
    return getStatusColor(task.status);
  };

  // Przygotowanie grup dla timeline
  const groups = useMemo(() => {
    if (groupBy === 'workstation') {
      const filteredWorkstations = workstations
        .filter(workstation => selectedWorkstations[workstation.id]);
      
      const workstationGroups = filteredWorkstations.map(workstation => ({
        id: workstation.id,
        title: workstation.name,
        rightTitle: workstation.code || '',
        bgColor: useWorkstationColors ? (workstation.color || getWorkstationColor(workstation.id)) : '#f5f5f5'
      }));
      
      // Sprawdź czy są zadania bez stanowiska i dodaj grupę dla nich
      const hasTasksWithoutWorkstation = tasks.some(task => !task.workstationId);
      if (hasTasksWithoutWorkstation && selectedWorkstations['no-workstation']) {
        workstationGroups.push({
          id: 'no-workstation',
          title: 'Bez stanowiska',
          rightTitle: '',
          bgColor: '#f5f5f5'
        });
      }
      
      return workstationGroups;
    } else {
      // Grupowanie według zamówień
      const uniqueOrders = new Map();
      tasks.forEach(task => {
        if (task.orderId && !uniqueOrders.has(task.orderId)) {
          uniqueOrders.set(task.orderId, {
            id: task.orderId,
            title: task.orderNumber || task.orderId,
            rightTitle: task.customerName || '',
            bgColor: '#f5f5f5'
          });
        }
      });
      
      if (uniqueOrders.size === 0 || tasks.some(task => !task.orderId)) {
        uniqueOrders.set('no-order', {
          id: 'no-order',
          title: 'Bez zamówienia',
          rightTitle: '',
          bgColor: '#f5f5f5'
        });
      }
      
      return Array.from(uniqueOrders.values());
    }
  }, [workstations, selectedWorkstations, groupBy, tasks, useWorkstationColors, getWorkstationColor]);

  // Przygotowanie elementów dla timeline
  const items = useMemo(() => {
    // Filtruj według klientów
    const filteredByCustomers = tasks.filter(task => {
      const customerId = task.customer?.id || task.customerId;
      return customerId ? selectedCustomers[customerId] === true : selectedCustomers['no-customer'] === true;
    });
    
    // Filtruj według wybranego grupowania
    const filteredByGroup = filteredByCustomers.filter(task => {
      if (groupBy === 'workstation') {
        if (task.workstationId) {
          return selectedWorkstations[task.workstationId];
        } else {
          return selectedWorkstations['no-workstation'];
        }
      }
      return true;
    });

    // Filtruj według zaawansowanych filtrów
    const filteredByAdvanced = filteredByGroup.filter(task => {
      // Filtr według nazwy produktu
      if (advancedFilters.productName) {
        const productName = (task.productName || task.name || '').toLowerCase();
        if (!productName.includes(advancedFilters.productName.toLowerCase())) {
          return false;
        }
      }

      // Filtr według numeru MO
      if (advancedFilters.moNumber) {
        const moNumber = (task.moNumber || '').toLowerCase();
        if (!moNumber.includes(advancedFilters.moNumber.toLowerCase())) {
          return false;
        }
      }

      // Filtr według numeru zamówienia
      if (advancedFilters.orderNumber) {
        const orderNumber = (task.orderNumber || '').toLowerCase();
        if (!orderNumber.includes(advancedFilters.orderNumber.toLowerCase())) {
          return false;
        }
      }

             return true;
     });
     
          const finalItems = filteredByAdvanced.map(task => {
       // Obsługa Firestore Timestamp
       const convertToDate = (date) => {
         if (!date) return new Date();
         if (date instanceof Date) return date;
         if (date.toDate && typeof date.toDate === 'function') return date.toDate();
         return new Date(date);
       };
       
       // Funkcja zaokrąglająca do pełnych minut (ignoruje sekundy)
       const roundToMinute = (date) => {
         const rounded = new Date(date);
         rounded.setSeconds(0, 0); // Ustaw sekundy i milisekundy na 0
         return rounded;
       };
       
       const startTime = roundToMinute(convertToDate(task.scheduledDate));
       const endTime = task.endDate ? roundToMinute(convertToDate(task.endDate)) : 
         task.estimatedDuration ? new Date(startTime.getTime() + task.estimatedDuration * 60 * 1000) :
         new Date(startTime.getTime() + 8 * 60 * 60 * 1000); // Domyślnie 8 godzin

             let groupId;
       if (groupBy === 'workstation') {
         groupId = task.workstationId || 'no-workstation';
       } else {
         groupId = task.orderId || 'no-order';
       }

      return {
        id: task.id,
        group: groupId,
        title: task.name || `${task.productName} (${task.moNumber})`,
        start_time: startTime.getTime(),
        end_time: endTime.getTime(),
        canMove: editMode,
        canResize: editMode,
        canChangeGroup: false,
        // Dodatkowe dane
        task: task,
        backgroundColor: getItemColor(task)
      };
    });
    
    return finalItems;
  }, [tasks, selectedCustomers, selectedWorkstations, groupBy, useWorkstationColors, workstations, getItemColor, advancedFilters, editMode]);

  // Funkcja pomocnicza do zaokrąglania do pełnych minut
  const roundToMinute = useCallback((date) => {
    if (!date || isNaN(new Date(date).getTime())) {
      return new Date();
    }
    
    const rounded = new Date(date);
    rounded.setSeconds(0, 0);
    return rounded;
  }, []);

  // Funkcja do znajdowania poprzedzającego zadania na tym samym stanowisku
  const findPreviousTask = (movedTask, allTasks, targetGroup) => {
    const tasksInGroup = allTasks.filter(task => 
      getGroupByValue(task) === targetGroup && task.id !== movedTask.id
    );
    
    // Sortuj zadania według daty zakończenia, obsługując różne formaty dat
    const sortedTasks = tasksInGroup.sort((a, b) => {
      const getEndDate = (task) => {
        if (!task.endDate) return new Date(0); // Zadania bez endDate na końcu
        if (task.endDate instanceof Date) return task.endDate;
        if (task.endDate.toDate) return task.endDate.toDate();
        return new Date(task.endDate);
      };
      
      return getEndDate(a) - getEndDate(b);
    });
    
    // Znajdź ostatnie zadanie które kończy się przed nowym początkiem
    let previousTask = null;
    const movedStartDate = new Date(movedTask.startDate);
    
    for (const task of sortedTasks) {
      const taskEndDate = task.endDate ? 
        (task.endDate instanceof Date ? task.endDate :
         task.endDate.toDate ? task.endDate.toDate() :
         new Date(task.endDate)) : null;
      
      if (taskEndDate && taskEndDate <= movedStartDate) {
        previousTask = task;
      } else {
        break;
      }
    }
    
    return previousTask;
  };

  // Funkcja pomocnicza do pobierania ID grupy dla zadania
  const getGroupByValue = (task) => {
    if (groupBy === 'workstation') {
      return task.workstationId || 'no-workstation';
    } else {
      return task.orderId || 'no-order';
    }
  };

  // Funkcja do dociągania do poprzedzającego zadania
  const snapToTask = (movedTask, targetGroup, newStartTime, newEndTime) => {
    if (!snapToPrevious) return { newStartTime, newEndTime };

    const previousTask = findPreviousTask(
      { 
        ...movedTask, 
        startDate: newStartTime, 
        endDate: newEndTime 
      }, 
      tasks, 
      targetGroup
    );

    if (previousTask && previousTask.endDate) {
      const duration = newEndTime - newStartTime;
      
      // Bezpieczna konwersja daty zakończenia poprzedniego zadania
      let previousEndDate;
      if (previousTask.endDate instanceof Date) {
        previousEndDate = previousTask.endDate;
      } else if (previousTask.endDate.toDate && typeof previousTask.endDate.toDate === 'function') {
        previousEndDate = previousTask.endDate.toDate();
      } else {
        previousEndDate = new Date(previousTask.endDate);
      }
      
      // Sprawdź czy data jest poprawna
      if (isNaN(previousEndDate.getTime())) {
        return { newStartTime, newEndTime };
      }
      
      const snappedStartTime = roundToMinute(previousEndDate);
      const snappedEndTime = new Date(snappedStartTime.getTime() + duration);
      
      return { 
        newStartTime: snappedStartTime, 
        newEndTime: roundToMinute(snappedEndTime) 
      };
    }

    return { newStartTime, newEndTime };
  };

  // Obsługa zmian w timeline
  const handleItemMove = useCallback(async (itemId, dragTime, newGroupId) => {
    try {
      setIsDragging(false); // Resetuj stan po zakończeniu przeciągania
      
      const item = items.find(i => i.id === itemId);
      if (!item) return;

      let newStartTime = roundToMinute(new Date(dragTime));
      const duration = item.end_time - item.start_time;
      let newEndTime = roundToMinute(new Date(dragTime + duration));

      // Zastosuj logikę dociągania jeśli tryb jest włączony
      const task = item.task; // Obiekt zadania z pełnymi danymi
      const targetGroup = newGroupId || item.group;
      
      const snappedTimes = snapToTask(task, targetGroup, newStartTime, newEndTime);
      newStartTime = snappedTimes.newStartTime;
      newEndTime = snappedTimes.newEndTime;

      // Sprawdź czy daty są poprawne przed wysłaniem do bazy
      if (isNaN(newStartTime.getTime()) || isNaN(newEndTime.getTime())) {
        showError('Błąd podczas przetwarzania dat zadania');
        return;
      }

      const updateData = {
        scheduledDate: newStartTime,
        endDate: newEndTime,
        estimatedDuration: Math.round(duration / (1000 * 60))
      };

      await updateTask(itemId, updateData, currentUser.uid);
      
      if (snapToPrevious) {
        showSuccess('Zadanie zostało zaktualizowane i dociągnięte do poprzedniego');
      } else {
        showSuccess('Zadanie zostało zaktualizowane');
      }
      
      // Odśwież dane
      fetchTasks();
    } catch (error) {
      console.error('Błąd podczas aktualizacji zadania:', error);
      showError('Błąd podczas aktualizacji zadania: ' + error.message);
    }
  }, [items, roundToMinute, snapToTask, snapToPrevious, showError, showSuccess, fetchTasks, currentUser.uid]);

  const handleItemResize = async (itemId, time, edge) => {
    try {
      setIsDragging(false); // Resetuj stan po zakończeniu zmiany rozmiaru
      
      const item = items.find(i => i.id === itemId);
      if (!item) return;

      let newStartTime, newEndTime;

      if (edge === 'left') {
        newStartTime = roundToMinute(new Date(time));
        newEndTime = roundToMinute(new Date(item.end_time));
      } else {
        newStartTime = roundToMinute(new Date(item.start_time));
        newEndTime = roundToMinute(new Date(time));
      }

      const duration = Math.round((newEndTime - newStartTime) / (1000 * 60));

      const updateData = {
        scheduledDate: newStartTime,
        endDate: newEndTime,
        estimatedDuration: duration
      };

      await updateTask(itemId, updateData, currentUser.uid);
      showSuccess('Czas trwania zadania został zaktualizowany');
      
      // Odśwież dane
      fetchTasks();
    } catch (error) {
      console.error('Błąd podczas aktualizacji zadania:', error);
      showError('Błąd podczas aktualizacji zadania: ' + error.message);
    }
  };

  // Globalny listener dla ruchu myszy dla tooltip
  useEffect(() => {
    const handleGlobalMouseMove = (e) => {
      if (tooltipVisible) {
        setTooltipPosition({
          x: e.clientX + 10,
          y: e.clientY - 10
        });
      }
    };

    if (tooltipVisible) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      return () => document.removeEventListener('mousemove', handleGlobalMouseMove);
    }
  }, [tooltipVisible]);

  // Stan do śledzenia czy jest w trakcie przeciągania
  const [isDragging, setIsDragging] = useState(false);

  // Obsługa kliknięcia w element
  const handleItemSelect = (itemId) => {
    // Nie otwieraj dialogu jeśli jest w trakcie przeciągania lub tryb edycji jest wyłączony
    if (isDragging || !editMode) return;
    
    const item = items.find(i => i.id === itemId);
    if (item) {
      setSelectedItem(item);
      setEditForm({
        start: new Date(item.start_time),
        end: new Date(item.end_time)
      });
      setEditDialog(true);
    }
  };

  // Obsługa zapisywania zmian w dialogu
  const handleSaveEdit = async () => {
    if (!selectedItem || !editForm.start || !editForm.end) {
      showError('Wszystkie pola są wymagane');
      return;
    }

    try {
      const startTime = roundToMinute(editForm.start);
      const endTime = roundToMinute(editForm.end);
      const duration = Math.round((endTime - startTime) / (1000 * 60));

      const updateData = {
        scheduledDate: startTime,
        endDate: endTime,
        estimatedDuration: duration
      };

      await updateTask(selectedItem.id, updateData, currentUser.uid);
      showSuccess('Zadanie zostało zaktualizowane');
      
      setEditDialog(false);
      setSelectedItem(null);
      fetchTasks();
    } catch (error) {
      console.error('Błąd podczas zapisywania:', error);
      showError('Błąd podczas zapisywania: ' + error.message);
    }
  };

  // Obsługa menu filtrów
  const handleFilterMenuClick = (event) => {
    setFilterMenuAnchor(event.currentTarget);
  };

  const handleFilterMenuClose = () => {
    setFilterMenuAnchor(null);
  };

  // Obsługa zaawansowanych filtrów
  const handleAdvancedFilterOpen = () => {
    setAdvancedFilterDialog(true);
    setFilterMenuAnchor(null);
  };

  const handleAdvancedFilterClose = () => {
    setAdvancedFilterDialog(false);
  };

  const handleAdvancedFilterChange = (field, value) => {
    setAdvancedFilters(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleAdvancedFilterApply = () => {
    setAdvancedFilterDialog(false);
  };

  const handleAdvancedFilterReset = () => {
    setAdvancedFilters({
      productName: '',
      moNumber: '',
      orderNumber: ''
    });
  };

  // Obsługa trybu edycji
  const handleEditModeToggle = () => {
    setEditMode(prev => !prev);
  };

  // Obliczanie wartości dla suwaka poziomego
  const calculateSliderValue = useCallback(() => {
    const totalRange = canvasTimeEnd - canvasTimeStart;
    const currentPosition = visibleTimeStart - canvasTimeStart;
    return totalRange > 0 ? (currentPosition / totalRange) * 100 : 0;
  }, [canvasTimeStart, canvasTimeEnd, visibleTimeStart]);

  // Obsługa suwaka poziomego
  const handleSliderChange = useCallback((event, newValue) => {
    const totalRange = canvasTimeEnd - canvasTimeStart;
    const viewRange = visibleTimeEnd - visibleTimeStart;
    const newStart = canvasTimeStart + (totalRange * newValue / 100);
    const newEnd = Math.min(newStart + viewRange, canvasTimeEnd);
    
    setVisibleTimeStart(newStart);
    setVisibleTimeEnd(newEnd);
    setSliderValue(newValue);
    
    // Synchronizuj canvas
    if (updateScrollCanvasRef.current) {
      updateScrollCanvasRef.current(newStart, newEnd);
      
      setTimeout(() => {
        if (updateScrollCanvasRef.current) {
          updateScrollCanvasRef.current(newStart, newEnd);
        }
      }, 50);
    }
  }, [canvasTimeStart, canvasTimeEnd, visibleTimeEnd, visibleTimeStart]);

  // Obsługa zmiany widoku czasowego
  const handleTimeChange = (visibleTimeStart, visibleTimeEnd, updateScrollCanvas) => {
    // Zachowaj referencję do funkcji updateScrollCanvas
    updateScrollCanvasRef.current = updateScrollCanvas;
    
    // Wywołaj synchronizację tylko jeśli funkcja jest dostępna
    if (updateScrollCanvas && typeof updateScrollCanvas === 'function') {
      updateScrollCanvas(visibleTimeStart, visibleTimeEnd);
      
      // Dodatkowa synchronizacja dla scrollowania poziomego
      setTimeout(() => {
        updateScrollCanvas(visibleTimeStart, visibleTimeEnd);
      }, 10);
      
      setTimeout(() => {
        updateScrollCanvas(visibleTimeStart, visibleTimeEnd);
      }, 50);
    }
    
    setVisibleTimeStart(visibleTimeStart);
    setVisibleTimeEnd(visibleTimeEnd);
    
    // Aktualizuj suwak
    const newSliderValue = calculateSliderValue();
    setSliderValue(newSliderValue);
  };

  // Funkcje zoom
  const zoomIn = () => {
    const center = (visibleTimeStart + visibleTimeEnd) / 2;
    const range = (visibleTimeEnd - visibleTimeStart) / 2;
    const newRange = range * 0.4; // Zoom 2.5x (1/2.5 = 0.4)
    const newZoomLevel = Math.min(zoomLevel * 2.5, 25); // Maksymalny zoom 25x
    
    const newStart = center - newRange;
    const newEnd = center + newRange;
    
    setZoomLevel(newZoomLevel);
    setVisibleTimeStart(newStart);
    setVisibleTimeEnd(newEnd);
    
    // Synchronizuj canvas z dodatkowym wymuszeniem
    if (updateScrollCanvasRef.current) {
      // Pierwsze wywołanie natychmiast
      updateScrollCanvasRef.current(newStart, newEnd);
      
      // Drugie wywołanie z małym opóźnieniem dla pewności synchronizacji
      setTimeout(() => {
        if (updateScrollCanvasRef.current) {
          updateScrollCanvasRef.current(newStart, newEnd);
        }
      }, 50);
    }
  };

  const zoomOut = () => {
    const center = (visibleTimeStart + visibleTimeEnd) / 2;
    const range = (visibleTimeEnd - visibleTimeStart) / 2;
    const newRange = range * 2.5; // Zoom out 2.5x
    const newZoomLevel = Math.max(zoomLevel / 2.5, 0.04); // Minimalny zoom 0.04x
    
    // Nie pozwól na zoom out poza canvas
    const maxRange = (canvasTimeEnd - canvasTimeStart) / 2;
    const finalRange = Math.min(newRange, maxRange);
    
    const newStart = Math.max(center - finalRange, canvasTimeStart);
    const newEnd = Math.min(center + finalRange, canvasTimeEnd);
    
    setZoomLevel(newZoomLevel);
    setVisibleTimeStart(newStart);
    setVisibleTimeEnd(newEnd);
    
    // Synchronizuj canvas z dodatkowym wymuszeniem
    if (updateScrollCanvasRef.current) {
      // Pierwsze wywołanie natychmiast
      updateScrollCanvasRef.current(newStart, newEnd);
      
      // Drugie wywołanie z małym opóźnieniem dla pewności synchronizacji
      setTimeout(() => {
        if (updateScrollCanvasRef.current) {
          updateScrollCanvasRef.current(newStart, newEnd);
        }
      }, 50);
    }
  };

  // Reset zoom do domyślnego widoku
  const resetZoom = () => {
    const newStart = startOfDay(new Date()).getTime();
    const newEnd = endOfDay(addDays(new Date(), 30)).getTime();
    
    setZoomLevel(1);
    setVisibleTimeStart(newStart);
    setVisibleTimeEnd(newEnd);
    
    // Synchronizuj canvas z dodatkowym wymuszeniem
    if (updateScrollCanvasRef.current) {
      // Pierwsze wywołanie natychmiast
      updateScrollCanvasRef.current(newStart, newEnd);
      
      // Drugie wywołanie z małym opóźnieniem dla pewności synchronizacji
      setTimeout(() => {
        if (updateScrollCanvasRef.current) {
          updateScrollCanvasRef.current(newStart, newEnd);
        }
      }, 50);
    }
  };

  // Zoom do konkretnej skali czasowej
  const zoomToScale = (scale) => {
    const now = new Date();
    let start, end;
    
    switch (scale) {
      case 'hourly':
        start = startOfDay(now).getTime();
        end = endOfDay(addDays(now, 2)).getTime(); // 2 dni dla widoku godzinowego
        setZoomLevel(6.25); // 2.5^2
        break;
      case 'daily':
        start = startOfDay(now).getTime();
        end = endOfDay(addDays(now, 7)).getTime(); // 1 tydzień
        setZoomLevel(2.5); // 2.5^1
        break;
      case 'weekly':
        start = startOfDay(now).getTime();
        end = endOfDay(addDays(now, 30)).getTime(); // 1 miesiąc
        setZoomLevel(1); // Bazowy
        break;
      case 'monthly':
        start = startOfDay(now).getTime();
        end = endOfDay(addDays(now, 90)).getTime(); // 3 miesiące
        setZoomLevel(0.4); // 1/2.5
        break;
      default:
        return;
    }
    
    setTimeScale(scale);
    setVisibleTimeStart(start);
    setVisibleTimeEnd(end);
    
    // Synchronizuj canvas z dodatkowym wymuszeniem
    if (updateScrollCanvasRef.current) {
      // Pierwsze wywołanie natychmiast
      updateScrollCanvasRef.current(start, end);
      
      // Drugie wywołanie z małym opóźnieniem dla pewności synchronizacji
      setTimeout(() => {
        if (updateScrollCanvasRef.current) {
          updateScrollCanvasRef.current(start, end);
        }
      }, 50);
    }
  };

  // Zoom wheel handler
  const handleWheel = useCallback((event) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      
      const delta = event.deltaY > 0 ? -1 : 1;
      const center = (visibleTimeStart + visibleTimeEnd) / 2;
      const range = (visibleTimeEnd - visibleTimeStart) / 2;
      
      const zoomFactor = delta > 0 ? 0.4 : 2.5; // Zoom 2.5x in/out
      const newRange = range * zoomFactor;
      const newZoomLevel = delta > 0 ? 
        Math.min(zoomLevel * 2.5, 25) : 
        Math.max(zoomLevel / 2.5, 0.04);
      
      // Nie pozwól na zoom out poza canvas
      if (delta < 0) {
        const maxRange = (canvasTimeEnd - canvasTimeStart) / 2;
        if (newRange > maxRange) return;
      }
      
      const newStart = Math.max(center - newRange, canvasTimeStart);
      const newEnd = Math.min(center + newRange, canvasTimeEnd);
      
      setZoomLevel(newZoomLevel);
      setVisibleTimeStart(newStart);
      setVisibleTimeEnd(newEnd);
      
      // Synchronizuj canvas z dodatkowym wymuszeniem
      if (updateScrollCanvasRef.current) {
        // Pierwsze wywołanie natychmiast
        updateScrollCanvasRef.current(newStart, newEnd);
        
        // Drugie wywołanie z małym opóźnieniem dla pewności synchronizacji
        setTimeout(() => {
          if (updateScrollCanvasRef.current) {
            updateScrollCanvasRef.current(newStart, newEnd);
          }
        }, 50);
      }
    }
  }, [visibleTimeStart, visibleTimeEnd, canvasTimeStart, canvasTimeEnd, zoomLevel]);

  // Event listener dla scroll synchronizacji
  const handleScrollSync = useCallback(() => {
    if (updateScrollCanvasRef.current) {
      // Wymuś synchronizację podczas scrollowania poziomego
      requestAnimationFrame(() => {
        if (updateScrollCanvasRef.current) {
          updateScrollCanvasRef.current(visibleTimeStart, visibleTimeEnd);
        }
      });
    }
  }, [visibleTimeStart, visibleTimeEnd]);

  // Dodaj event listener dla wheel zoom i scroll sync
  useEffect(() => {
    const timelineElement = document.querySelector('.react-calendar-timeline');
    if (timelineElement) {
      timelineElement.addEventListener('wheel', handleWheel, { passive: false });
      
      // Różne selektory dla kontenerów scroll w react-calendar-timeline
      const scrollSelectors = [
        '.rct-scroll',
        '.rct-canvas',
        '.rct-horizontal-scroll',
        '.rct-timeline-container'
      ];
      
      const scrollContainers = [];
      
      scrollSelectors.forEach(selector => {
        const container = timelineElement.querySelector(selector);
        if (container) {
          container.addEventListener('scroll', handleScrollSync, { passive: true });
          scrollContainers.push(container);
        }
      });
      
      // Dodaj listener bezpośrednio na timeline element
      timelineElement.addEventListener('scroll', handleScrollSync, { passive: true });
      
      return () => {
        timelineElement.removeEventListener('wheel', handleWheel);
        timelineElement.removeEventListener('scroll', handleScrollSync);
        scrollContainers.forEach(container => {
          container.removeEventListener('scroll', handleScrollSync);
        });
      };
    }
  }, [handleWheel, handleScrollSync]);

  // Synchronizuj canvas gdy visible time się zmieni (backup dla przypadku gdy updateScrollCanvas nie było dostępne)
  useEffect(() => {
    if (updateScrollCanvasRef.current && typeof updateScrollCanvasRef.current === 'function') {
      // Wielokrotna synchronizacja dla pewności
      const timeouts = [
        setTimeout(() => updateScrollCanvasRef.current(visibleTimeStart, visibleTimeEnd), 10),
        setTimeout(() => updateScrollCanvasRef.current(visibleTimeStart, visibleTimeEnd), 50),
        setTimeout(() => updateScrollCanvasRef.current(visibleTimeStart, visibleTimeEnd), 100),
        setTimeout(() => updateScrollCanvasRef.current(visibleTimeStart, visibleTimeEnd), 200)
      ];
      
      return () => timeouts.forEach(clearTimeout);
    }
    
    // Aktualizuj wartość suwaka
    const newSliderValue = calculateSliderValue();
    setSliderValue(newSliderValue);
  }, [visibleTimeStart, visibleTimeEnd, calculateSliderValue]);

  // Dodatkowa synchronizacja z obserwatorami dla jeszcze lepszej stabilności
  useEffect(() => {
    const timelineElement = document.querySelector('.react-calendar-timeline');
    if (!timelineElement) return;

    // ResizeObserver dla wykrywania zmian rozmiaru
    const resizeObserver = new ResizeObserver(() => {
      if (updateScrollCanvasRef.current) {
        requestAnimationFrame(() => {
          updateScrollCanvasRef.current(visibleTimeStart, visibleTimeEnd);
        });
      }
    });

    // MutationObserver dla wykrywania zmian DOM
    const mutationObserver = new MutationObserver(() => {
      if (updateScrollCanvasRef.current) {
        requestAnimationFrame(() => {
          updateScrollCanvasRef.current(visibleTimeStart, visibleTimeEnd);
        });
      }
    });

    resizeObserver.observe(timelineElement);
    mutationObserver.observe(timelineElement, { 
      childList: true, 
      subtree: true, 
      attributes: true,
      attributeFilter: ['style', 'class']
    });

    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [visibleTimeStart, visibleTimeEnd]);



  return (
    <Box sx={{ position: 'relative' }}>
      <Paper 
        sx={{ p: 2, height: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column' }}
      >
      {/* Nagłówek */}
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        mb: 2,
        flexWrap: 'wrap'
      }}>
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center' }}>
          <CalendarIcon sx={{ mr: 1 }} />
          Timeline produkcji
        </Typography>
        
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <FormControlLabel
            control={
              <Switch
                checked={useWorkstationColors}
                onChange={(e) => setUseWorkstationColors(e.target.checked)}
                size="small"
              />
            }
            label="Kolory stanowisk"
          />
          
          {editMode && (
            <Tooltip title="Automatycznie dociąga przesuwane zadania do końca poprzedniego zadania na tym samym stanowisku" arrow>
              <FormControlLabel
                control={
                  <Switch
                    checked={snapToPrevious}
                    onChange={(e) => setSnapToPrevious(e.target.checked)}
                    size="small"
                    color="secondary"
                  />
                }
                label="Dociąganie"
              />
            </Tooltip>
          )}
          
          <Tooltip title="Włącz tryb edycji aby móc przesuwać i zmieniać rozmiar zadań. W trybie wyłączonym możesz bezpiecznie przewijać timeline." arrow>
            <Button
              variant={editMode ? "contained" : "outlined"}
              size="small"
              onClick={handleEditModeToggle}
              startIcon={editMode ? <EditIcon /> : <LockIcon />}
              color={editMode ? "primary" : "default"}
              sx={{ 
                minWidth: '120px',
                backgroundColor: editMode ? 'primary.main' : 'transparent',
                '&:hover': {
                  backgroundColor: editMode ? 'primary.dark' : 'rgba(0, 0, 0, 0.04)'
                }
              }}
            >
              {editMode ? 'Edycja ON' : 'Edycja OFF'}
            </Button>
          </Tooltip>
          
          <Button
            variant="outlined"
            size="small"
            onClick={() => setGroupBy(groupBy === 'workstation' ? 'order' : 'workstation')}
            startIcon={groupBy === 'workstation' ? <BusinessIcon /> : <WorkIcon />}
          >
            {groupBy === 'workstation' ? 'Stanowiska' : 'Zamówienia'}
          </Button>
          
          {/* Przyciski skali czasowej */}
          <Box sx={{ display: 'flex', gap: 0.5, border: '1px solid #ddd', borderRadius: 1 }}>
            <Tooltip title="Widok godzinowy (3 dni)">
              <IconButton 
                size="small" 
                onClick={() => zoomToScale('hourly')}
                color={timeScale === 'hourly' ? 'primary' : 'default'}
                sx={{ borderRadius: 0 }}
              >
                <HourlyIcon />
              </IconButton>
            </Tooltip>
            
            <Tooltip title="Widok dzienny (2 tygodnie)">
              <IconButton 
                size="small" 
                onClick={() => zoomToScale('daily')}
                color={timeScale === 'daily' ? 'primary' : 'default'}
                sx={{ borderRadius: 0 }}
              >
                <DailyIcon />
              </IconButton>
            </Tooltip>
            
            <Tooltip title="Widok tygodniowy (2 miesiące)">
              <IconButton 
                size="small" 
                onClick={() => zoomToScale('weekly')}
                color={timeScale === 'weekly' ? 'primary' : 'default'}
                sx={{ borderRadius: 0 }}
              >
                <WeeklyIcon />
              </IconButton>
            </Tooltip>
            
            <Tooltip title="Widok miesięczny (6 miesięcy)">
              <IconButton 
                size="small" 
                onClick={() => zoomToScale('monthly')}
                color={timeScale === 'monthly' ? 'primary' : 'default'}
                sx={{ borderRadius: 0 }}
              >
                <MonthlyIcon />
              </IconButton>
            </Tooltip>
          </Box>
          
          {/* Kontrolki zoom */}
          <Box sx={{ display: 'flex', gap: 0.5, border: '1px solid #ddd', borderRadius: 1 }}>
            <Tooltip title="Przybliż (Ctrl + scroll)">
              <IconButton size="small" onClick={zoomIn} sx={{ borderRadius: 0 }}>
                <ZoomInIcon />
              </IconButton>
            </Tooltip>
            
            <Tooltip title="Oddal">
              <IconButton size="small" onClick={zoomOut} sx={{ borderRadius: 0 }}>
                <ZoomOutIcon />
              </IconButton>
            </Tooltip>
            
            <Tooltip title="Reset zoom">
              <IconButton size="small" onClick={resetZoom} sx={{ borderRadius: 0 }}>
                <ResetZoomIcon />
              </IconButton>
            </Tooltip>
          </Box>
          
          <Button
            variant="outlined"
            size="small"
            onClick={handleFilterMenuClick}
            startIcon={<FilterListIcon />}
            color={(advancedFilters.productName || advancedFilters.moNumber || advancedFilters.orderNumber) ? 'primary' : 'inherit'}
          >
            Filtry {(advancedFilters.productName || advancedFilters.moNumber || advancedFilters.orderNumber) && '✓'}
          </Button>
          
          <TimelineExport 
            tasks={tasks}
            workstations={workstations}
            customers={customers}
            startDate={visibleTimeStart}
            endDate={visibleTimeEnd}
            groupBy={groupBy}
            filteredTasks={items.map(item => item.task)}
            showSuccess={showSuccess}
            showError={showError}
          />
          
          <IconButton size="small" onClick={fetchTasks}>
            <RefreshIcon />
          </IconButton>
          

        </Box>
      </Box>


      {/* Legenda */}
      <Box sx={{ 
        display: 'flex', 
        flexWrap: 'wrap', 
        gap: 1, 
        mb: 2,
        alignItems: 'center'
      }}>
        <Typography variant="caption" sx={{ mr: 1, fontWeight: 'medium' }}>
          Legenda:
        </Typography>
        
        {useWorkstationColors ? (
          workstations.map(workstation => (
            <Chip 
              key={workstation.id}
              size="small"
              label={workstation.name} 
              sx={{ 
                bgcolor: workstation.color || getWorkstationColor(workstation.id), 
                color: 'white',
                fontSize: '0.7rem'
              }} 
            />
          ))
        ) : (
          <>
            <Chip size="small" label="Zaplanowane" sx={{ bgcolor: '#3788d8', color: 'white', fontSize: '0.7rem' }} />
            <Chip size="small" label="W trakcie" sx={{ bgcolor: '#f39c12', color: 'white', fontSize: '0.7rem' }} />
            <Chip size="small" label="Zakończone" sx={{ bgcolor: '#2ecc71', color: 'white', fontSize: '0.7rem' }} />
            <Chip size="small" label="Anulowane" sx={{ bgcolor: '#e74c3c', color: 'white', fontSize: '0.7rem' }} />
            <Chip size="small" label="Wstrzymane" sx={{ bgcolor: '#757575', color: 'white', fontSize: '0.7rem' }} />
          </>
        )}
      </Box>

      {/* Instrukcje zoom */}
      <Box sx={{ 
        mb: 1, 
        p: 1, 
        bgcolor: '#f8f9fa', 
        borderRadius: 1, 
        fontSize: '0.75rem',
        color: '#666'
      }}>
        <Typography variant="caption">
          💡 <strong>Wskazówki:</strong> Użyj Ctrl + scroll aby zoomować myszką | Włącz "Edycja ON" aby móc przesuwać zadania{editMode ? ' | Przeciągnij zadania aby zmienić czas, zmień rozmiar przeciągając krawędzie | Włącz "Dociąganie" aby automatycznie ustawiać zadania po kolei' : ' | W trybie wyłączonym możesz bezpiecznie przewijać timeline bez przypadkowego przesuwania zadań'}
        </Typography>
      </Box>

      {/* Timeline */}
      <Box sx={{ flex: 1, overflow: 'hidden', position: 'relative' }}>

        {loading && (
          <Box sx={{ 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center',
            bgcolor: 'rgba(255,255,255,0.7)',
            zIndex: 10
          }}>
            <CircularProgress />
          </Box>
        )}
        
        <Timeline
          groups={groups}
          items={items}
          visibleTimeStart={visibleTimeStart}
          visibleTimeEnd={visibleTimeEnd}
          canvasTimeStart={canvasTimeStart}
          canvasTimeEnd={canvasTimeEnd}
          onTimeChange={handleTimeChange}
          onItemMove={handleItemMove}
          onItemResize={handleItemResize}
          onItemSelect={handleItemSelect}
          onItemDrag={({ itemId, time, edge }) => {
            setIsDragging(true);
          }}
          itemRenderer={({ item, itemContext, getItemProps }) => {
            return (
              <div 
                {...getItemProps()}
                                 onMouseEnter={(e) => {
                   if (item.task) {
                     setTooltipData(item.task);
                     setTooltipPosition({
                       x: e.clientX + 10,
                       y: e.clientY - 10
                     });
                     setTooltipVisible(true);
                   }
                 }}
                 onMouseLeave={() => {
                   setTooltipVisible(false);
                   setTooltipData(null);
                 }}
                                 style={{
                   ...getItemProps().style,
                   background: item.backgroundColor || '#1976d2',
                   color: '#fff',
                   border: '1px solid rgba(255, 255, 255, 0.3)',
                   borderRadius: '4px',
                   padding: '2px 6px',
                   fontSize: '12px',
                   overflow: 'hidden',
                   textOverflow: 'ellipsis',
                   whiteSpace: 'nowrap',
                   cursor: 'pointer',
                   boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                 }}
              >
                {itemContext.title}
              </div>
            );
          }}
          stackItems
          itemHeightRatio={0.75}
          lineHeight={60}
          sidebarWidth={isMobile ? 150 : 200}
          rightSidebarWidth={isMobile ? 0 : 100}
          dragSnap={15 * 60 * 1000} // 15 minut
          minimumWidthForItemContentVisibility={50}
          buffer={1}
          traditionalZoom={true}
        >
          <TimelineHeaders className="sticky">
            <SidebarHeader>
              {({ getRootProps }) => {
                return (
                  <div 
                    {...getRootProps()}
                    style={{
                      ...getRootProps().style,
                      background: themeMode === 'dark' 
                        ? 'linear-gradient(135deg, #1a237e 0%, #283593 50%, #3949ab 100%)'
                        : 'linear-gradient(135deg, #1976d2 0%, #1e88e5 50%, #42a5f5 100%)',
                      color: '#ffffff',
                      borderBottom: themeMode === 'dark' ? '2px solid #3949ab' : '2px solid #1976d2',
                      boxShadow: '0 2px 8px rgba(25, 118, 210, 0.2)'
                    }}
                  >
                    <Typography 
                      variant="subtitle2" 
                      sx={{ 
                        p: 1, 
                        fontWeight: 600,
                        textShadow: '1px 1px 2px rgba(0,0,0,0.3)'
                      }}
                    >
                      {groupBy === 'workstation' ? 'Stanowisko' : 'Zamówienie'}
                    </Typography>
                  </div>
                );
              }}
            </SidebarHeader>
            <DateHeader 
              unit="primaryHeader"
              style={{
                background: themeMode === 'dark' 
                  ? 'linear-gradient(135deg, #0d47a1 0%, #1565c0 50%, #1976d2 100%)'
                  : 'linear-gradient(135deg, #0d47a1 0%, #1565c0 50%, #1976d2 100%)',
                color: '#ffffff',
                borderBottom: themeMode === 'dark' ? '1px solid #1976d2' : '1px solid #0d47a1',
                fontWeight: 600
              }}
              intervalRenderer={({ getIntervalProps, intervalContext }) => {
                return (
                  <div 
                    {...getIntervalProps()}
                    style={{
                      ...getIntervalProps().style,
                      background: themeMode === 'dark' 
                        ? 'linear-gradient(135deg, #0d47a1 0%, #1565c0 50%, #1976d2 100%)'
                        : 'linear-gradient(135deg, #0d47a1 0%, #1565c0 50%, #1976d2 100%)',
                      color: '#ffffff',
                      borderRight: '1px solid rgba(255,255,255,0.2)',
                      fontWeight: 600,
                      textShadow: '1px 1px 2px rgba(0,0,0,0.3)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {intervalContext.intervalText}
                  </div>
                );
              }}
            />
            <DateHeader 
              style={{
                background: themeMode === 'dark' 
                  ? 'linear-gradient(135deg, #1565c0 0%, #1976d2 50%, #1e88e5 100%)'
                  : 'linear-gradient(135deg, #1565c0 0%, #1976d2 50%, #1e88e5 100%)',
                color: '#ffffff',
                borderBottom: themeMode === 'dark' ? '1px solid #1e88e5' : '1px solid #1565c0',
                fontWeight: 500
              }}
              intervalRenderer={({ getIntervalProps, intervalContext }) => {
                return (
                  <div 
                    {...getIntervalProps()}
                    style={{
                      ...getIntervalProps().style,
                      background: themeMode === 'dark' 
                        ? 'linear-gradient(135deg, #1565c0 0%, #1976d2 50%, #1e88e5 100%)'
                        : 'linear-gradient(135deg, #1565c0 0%, #1976d2 50%, #1e88e5 100%)',
                      color: '#ffffff',
                      borderRight: '1px solid rgba(255,255,255,0.2)',
                      fontWeight: 500,
                      textShadow: '1px 1px 2px rgba(0,0,0,0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {intervalContext.intervalText}
                  </div>
                );
              }}
            />
          </TimelineHeaders>
        </Timeline>
      </Box>

      {/* Suwak poziomy do przewijania timeline */}
      <Box sx={{ 
        mt: 1, 
        px: 2, 
        pb: 1,
        borderTop: '1px solid #e0e0e0'
      }}>
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 2 
        }}>
          <Typography variant="caption" sx={{ 
            minWidth: '120px',
            fontSize: '0.75rem',
            color: 'text.secondary'
          }}>
            Przewijanie poziome:
          </Typography>
          
          <Slider
            value={sliderValue}
            onChange={handleSliderChange}
            min={0}
            max={100}
            step={0.1}
            sx={{
              flex: 1,
              height: 4,
              '& .MuiSlider-thumb': {
                width: 16,
                height: 16,
                '&:hover, &.Mui-focusVisible': {
                  boxShadow: '0 3px 1px rgba(0,0,0,0.1), 0 4px 8px rgba(0,0,0,0.3)',
                },
                '&.Mui-active': {
                  boxShadow: '0 3px 1px rgba(0,0,0,0.1), 0 4px 8px rgba(0,0,0,0.3)',
                },
              },
              '& .MuiSlider-track': {
                height: 4,
                border: 'none',
              },
              '& .MuiSlider-rail': {
                height: 4,
                opacity: 0.3,
                backgroundColor: '#bfbfbf',
              },
            }}
          />
          
          <Typography variant="caption" sx={{ 
            minWidth: '40px',
            fontSize: '0.75rem',
            color: 'text.secondary',
            textAlign: 'right'
          }}>
            {Math.round(sliderValue)}%
          </Typography>
        </Box>
        
        {/* Dodatkowe informacje */}
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-between',
          mt: 0.5,
          fontSize: '0.7rem',
          color: 'text.disabled'
        }}>
          <span>
            {format(new Date(canvasTimeStart), 'dd.MM.yyyy', { locale: pl })}
          </span>
          <span>
            Widoczny zakres: {format(new Date(visibleTimeStart), 'dd.MM HH:mm', { locale: pl })} - {format(new Date(visibleTimeEnd), 'dd.MM HH:mm', { locale: pl })}
          </span>
          <span>
            {format(new Date(canvasTimeEnd), 'dd.MM.yyyy', { locale: pl })}
          </span>
        </Box>
      </Box>

      {/* Menu filtrów */}
      <Menu
        anchorEl={filterMenuAnchor}
        open={Boolean(filterMenuAnchor)}
        onClose={handleFilterMenuClose}
        PaperProps={{
          style: {
            maxHeight: 400,
            width: '300px',
          },
        }}
      >
        <Box sx={{ p: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 1 }}>
            Filtry
          </Typography>
          
          {/* Przycisk do zaawansowanych filtrów */}
          <Button
            fullWidth
            variant="outlined"
            startIcon={<SearchIcon />}
            onClick={handleAdvancedFilterOpen}
            sx={{ mb: 2 }}
          >
            Zaawansowane filtrowanie
          </Button>
          
          <Typography variant="body2" sx={{ mb: 1 }}>
            Stanowiska:
          </Typography>
          {workstations.map(workstation => (
            <Box key={workstation.id} sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
              <input
                type="checkbox"
                checked={selectedWorkstations[workstation.id] || false}
                onChange={() => {
                  setSelectedWorkstations(prev => ({
                    ...prev,
                    [workstation.id]: !prev[workstation.id]
                  }));
                }}
              />
              <Typography variant="body2" sx={{ ml: 1, fontSize: '0.85rem' }}>
                {workstation.name}
              </Typography>
            </Box>
          ))}
          
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
            <input
              type="checkbox"
              checked={selectedWorkstations['no-workstation'] || false}
              onChange={() => {
                setSelectedWorkstations(prev => ({
                  ...prev,
                  'no-workstation': !prev['no-workstation']
                }));
              }}
            />
            <Typography variant="body2" sx={{ ml: 1, fontSize: '0.85rem' }}>
              Bez stanowiska
            </Typography>
          </Box>
          
          <Typography variant="body2" sx={{ mb: 1, mt: 2 }}>
            Klienci:
          </Typography>
          {customers.map(customer => (
            <Box key={customer.id} sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
              <input
                type="checkbox"
                checked={selectedCustomers[customer.id] || false}
                onChange={() => {
                  setSelectedCustomers(prev => ({
                    ...prev,
                    [customer.id]: !prev[customer.id]
                  }));
                }}
              />
              <Typography variant="body2" sx={{ ml: 1, fontSize: '0.85rem' }}>
                {customer.name}
              </Typography>
            </Box>
          ))}
        </Box>
      </Menu>

      {/* Dialog edycji */}
      <Dialog
        open={editDialog}
        onClose={() => setEditDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Edytuj zadanie produkcyjne</DialogTitle>
        <DialogContent>
          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12}>
                <DateTimePicker
                  label="Data rozpoczęcia"
                  value={editForm.start}
                  onChange={(newValue) => setEditForm(prev => ({ ...prev, start: newValue }))}
                  slotProps={{
                    textField: {
                      fullWidth: true
                    }
                  }}
                />
              </Grid>
              <Grid item xs={12}>
                <DateTimePicker
                  label="Data zakończenia"
                  value={editForm.end}
                  onChange={(newValue) => setEditForm(prev => ({ ...prev, end: newValue }))}
                  slotProps={{
                    textField: {
                      fullWidth: true
                    }
                  }}
                />
              </Grid>
            </Grid>
          </LocalizationProvider>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialog(false)}>
            Anuluj
          </Button>
          <Button onClick={handleSaveEdit} variant="contained">
            Zapisz
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog zaawansowanych filtrów */}
      <Dialog
        open={advancedFilterDialog}
        onClose={handleAdvancedFilterClose}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Zaawansowane filtrowanie zadań</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Nazwa produktu"
                  placeholder="Wpisz nazwę produktu..."
                  value={advancedFilters.productName}
                  onChange={(e) => handleAdvancedFilterChange('productName', e.target.value)}
                  variant="outlined"
                  size="small"
                />
              </Grid>
              
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Numer MO"
                  placeholder="Wpisz numer zlecenia produkcyjnego..."
                  value={advancedFilters.moNumber}
                  onChange={(e) => handleAdvancedFilterChange('moNumber', e.target.value)}
                  variant="outlined"
                  size="small"
                />
              </Grid>
              
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Numer zamówienia"
                  placeholder="Wpisz numer zamówienia..."
                  value={advancedFilters.orderNumber}
                  onChange={(e) => handleAdvancedFilterChange('orderNumber', e.target.value)}
                  variant="outlined"
                  size="small"
                />
              </Grid>
            </Grid>
            
            {/* Podgląd aktywnych filtrów */}
            {(advancedFilters.productName || advancedFilters.moNumber || advancedFilters.orderNumber) && (
              <Box sx={{ mt: 2, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                  Aktywne filtry:
                </Typography>
                {advancedFilters.productName && (
                  <Chip 
                    label={`Produkt: ${advancedFilters.productName}`} 
                    size="small" 
                    sx={{ mr: 1, mb: 1 }} 
                  />
                )}
                {advancedFilters.moNumber && (
                  <Chip 
                    label={`MO: ${advancedFilters.moNumber}`} 
                    size="small" 
                    sx={{ mr: 1, mb: 1 }} 
                  />
                )}
                {advancedFilters.orderNumber && (
                  <Chip 
                    label={`Zamówienie: ${advancedFilters.orderNumber}`} 
                    size="small" 
                    sx={{ mr: 1, mb: 1 }} 
                  />
                )}
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleAdvancedFilterReset} color="warning">
            Wyczyść
          </Button>
          <Button onClick={handleAdvancedFilterClose}>
            Anuluj
          </Button>
          <Button onClick={handleAdvancedFilterApply} variant="contained">
            Zastosuj
          </Button>
        </DialogActions>
      </Dialog>

            </Paper>

      {/* Custom Tooltip */}
      <CustomTooltip 
        task={tooltipData}
        position={tooltipPosition}
        visible={tooltipVisible}
        themeMode={themeMode}
      />
    </Box>
  );
});

// Helper function dla debounce
function debounce(func, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

export default ProductionTimeline; 