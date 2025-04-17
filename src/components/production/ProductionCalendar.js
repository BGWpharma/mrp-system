import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  Button,
  Tooltip,
  CircularProgress,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Chip,
  FormControlLabel,
  Switch
} from '@mui/material';
import {
  CalendarMonth as CalendarIcon,
  ViewDay as DayIcon,
  ViewWeek as WeekIcon,
  ViewModule as MonthIcon,
  BarChart as GanttIcon,
  ArrowDropDown as ArrowDropDownIcon,
  FilterList as FilterListIcon,
  Business as BusinessIcon,
  Work as WorkIcon
} from '@mui/icons-material';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import timelinePlugin from '@fullcalendar/timeline';
import resourceTimelinePlugin from '@fullcalendar/resource-timeline';
import plLocale from '@fullcalendar/core/locales/pl';
import { getTasksByDateRange, updateTask } from '../../services/productionService';
import { getAllWorkstations } from '../../services/workstationService';
import { useNotification } from '../../hooks/useNotification';
import { formatDate } from '../../utils/formatters';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { addDays, addMonths, startOfMonth, endOfMonth } from 'date-fns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';

const ProductionCalendar = () => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('dayGridMonth');
  const [ganttView, setGanttView] = useState('resourceTimelineWeek');
  const [ganttMenuAnchor, setGanttMenuAnchor] = useState(null);
  const [editable, setEditable] = useState(true);
  const [workstations, setWorkstations] = useState([]);
  const [useWorkstationColors, setUseWorkstationColors] = useState(false);
  const [selectedWorkstations, setSelectedWorkstations] = useState({});
  const [customDateRange, setCustomDateRange] = useState(false);
  const [startDate, setStartDate] = useState(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState(endOfMonth(new Date()));
  const [dateRangeMenuAnchor, setDateRangeMenuAnchor] = useState(null);
  const [filterMenuAnchor, setFilterMenuAnchor] = useState(null);
  const [ganttDetail, setGanttDetail] = useState('day');
  const [detailMenuAnchor, setDetailMenuAnchor] = useState(null);
  const [ganttGroupBy, setGanttGroupBy] = useState('workstation');
  const calendarRef = useRef(null);
  const navigate = useNavigate();
  const { showError, showSuccess } = useNotification();
  const [eventResizableFromStart, setEventResizableFromStart] = useState(true);

  // Efekt do aktualizacji widoku kalendarza po zmianie stanu view
  useEffect(() => {
    if (calendarRef.current) {
      const calendarApi = calendarRef.current.getApi();
      calendarApi.changeView(view);
    }
  }, [view]);
  
  useEffect(() => {
    fetchWorkstations();
  }, []);
  
  const fetchWorkstations = async () => {
    try {
      const data = await getAllWorkstations();
      setWorkstations(data);
      
      const initialSelectedWorkstations = {};
      data.forEach(workstation => {
        initialSelectedWorkstations[workstation.id] = true;
      });
      setSelectedWorkstations(initialSelectedWorkstations);
    } catch (error) {
      console.error('Błąd podczas pobierania stanowisk:', error);
      showError('Błąd podczas pobierania stanowisk: ' + error.message);
    }
  };

  const fetchTasks = async (info) => {
    // Jeśli już trwa ładowanie, nie uruchamiaj kolejnego zapytania
    if (loading) return;
    
    try {
      setLoading(true);
      
      // Weryfikacja parametrów
      if (!info || (!info.startStr && !info.endStr && !customDateRange)) {
        console.error('Brakujące parametry w fetchTasks', info);
        return;
      }
      
      // Bezpieczne pobieranie zakresu dat
      let rangeStartDate, rangeEndDate;
      
      if (customDateRange) {
        rangeStartDate = startDate.toISOString();
        rangeEndDate = endDate.toISOString();
      } else if (info) {
        rangeStartDate = info.startStr;
        rangeEndDate = info.endStr;
      } else {
        // Awaryjnie użyj dzisiejszej daty i miesiąca do przodu
        const today = new Date();
        rangeStartDate = today.toISOString();
        rangeEndDate = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate()).toISOString();
      }
      
      console.log('Pobieranie zadań dla zakresu dat:', rangeStartDate, '-', rangeEndDate);
      
      // Dodajemy timeout, żeby React miał czas na aktualizację stanu
      setTimeout(async () => {
        try {
          const fetchedTasks = await getTasksByDateRange(rangeStartDate, rangeEndDate);
          console.log('Pobrano zadania:', fetchedTasks);
          setTasks(fetchedTasks);
        } catch (error) {
          showError('Błąd podczas pobierania zadań: ' + error.message);
          console.error('Error fetching tasks:', error);
        } finally {
          setLoading(false);
        }
      }, 100);
    } catch (error) {
      showError('Błąd podczas przygotowania zapytania o zadania: ' + error.message);
      console.error('Error in fetchTasks:', error);
      setLoading(false);
    }
  };

  const handleViewChange = (event, newView) => {
    if (newView !== null) {
      try {
        // Jeśli wybrano widok Gantta, użyj aktualnie wybranego widoku Gantta
        const viewToUse = newView === 'gantt' ? ganttView : newView;
        
        // Aktualizuj stan widoku
        setView(viewToUse);
        
        // Jeśli mamy referencję do kalendarza, zaktualizuj widok
        if (calendarRef.current) {
          const calendarApi = calendarRef.current.getApi();
          
          // Daj czas na aktualizację stanu
          setTimeout(() => {
            try {
              calendarApi.changeView(viewToUse);
            } catch (error) {
              console.error('Błąd podczas zmiany widoku:', error);
            }
          }, 0);
          
          // Jeśli mamy niestandardowy zakres dat, przejdź do daty początkowej
          if (customDateRange) {
            calendarApi.gotoDate(startDate);
            
            // Pobierz zadania dla ustawionego zakresu dat
            fetchTasks({
              startStr: startDate.toISOString(),
              endStr: endDate.toISOString()
            });
          }
        }
      } catch (error) {
        console.error('Błąd podczas zmiany widoku:', error);
        showError('Wystąpił błąd podczas zmiany widoku: ' + error.message);
      }
    }
  };

  // Obsługa zdarzenia FullCalendar datesSet - wywołuje się przy zmianie wyświetlanego zakresu dat
  const handleDatesSet = (dateInfo) => {
    // Jeśli nie mamy niestandardowego zakresu, po prostu pobierz zadania dla widocznego zakresu
    if (!customDateRange) {
      fetchTasks(dateInfo);
    }
    // Nie wykonuj żadnych innych operacji, które mogłyby zmieniać stan komponentu
    // i powodować zapętlenie renderowania
  };

  const handleGanttMenuClick = (event) => {
    setGanttMenuAnchor(event.currentTarget);
  };

  const handleGanttMenuClose = () => {
    setGanttMenuAnchor(null);
  };

  const handleGanttViewChange = (newGanttView) => {
    try {
      // Zamknij menu Gantta
      handleGanttMenuClose();
      
      // Aktualizuj stan widoku Gantta i ogólnego widoku
      setGanttView(newGanttView);
      setView(newGanttView);
      
      // Aktualizuj również poziom szczegółowości na podstawie wybranego widoku
      if (newGanttView === 'resourceTimelineDay') {
        setGanttDetail('hour');
      } else if (newGanttView === 'resourceTimelineWeek' || newGanttView === 'resourceTimelineMonth') {
        setGanttDetail('day');
      } else if (newGanttView === 'resourceTimelineYear') {
        setGanttDetail('week');
      }
      
      // Jeśli mamy referencję do kalendarza, zaktualizuj widok
      if (calendarRef.current) {
        const calendarApi = calendarRef.current.getApi();
        
        // Daj czas na aktualizację stanu
        setTimeout(() => {
          try {
            calendarApi.changeView(newGanttView);
          } catch (error) {
            console.error('Błąd podczas zmiany widoku Gantta:', error);
          }
        }, 0);
        
        // Jeśli mamy niestandardowy zakres dat, przejdź do daty początkowej
        if (customDateRange) {
          calendarApi.gotoDate(startDate);
          
          // Pobierz zadania dla ustawionego zakresu dat
          fetchTasks({
            startStr: startDate.toISOString(),
            endStr: endDate.toISOString()
          });
        }
      }
    } catch (error) {
      console.error('Błąd podczas zmiany widoku Gantta:', error);
      showError('Wystąpił błąd podczas zmiany widoku: ' + error.message);
    }
  };

  // Obsługa kliknięcia w zdarzenie
  const handleEventClick = (info) => {
    navigate(`/production/tasks/${info.event.id}`);
  };

  // Funkcja obsługująca kliknięcie w pusty obszar kalendarza - została wyłączona
  const handleDateClick = (info) => {
    // Funkcjonalność dodawania nowego zadania została wyłączona
    // navigate(`/production/new-task?date=${info.dateStr}`);
  };
  
  const handleFilterMenuClick = (event) => {
    setFilterMenuAnchor(event.currentTarget);
  };

  const handleFilterMenuClose = () => {
    setFilterMenuAnchor(null);
  };

  const handleWorkstationFilterChange = (workstationId) => {
    setSelectedWorkstations(prev => ({
      ...prev,
      [workstationId]: !prev[workstationId]
    }));
  };
  
  const handleSelectAllWorkstations = (select) => {
    const newSelectedWorkstations = {};
    workstations.forEach(workstation => {
      newSelectedWorkstations[workstation.id] = select;
    });
    setSelectedWorkstations(newSelectedWorkstations);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Zaplanowane':
        return '#3788d8'; // niebieski
      case 'W trakcie':
        return '#f39c12'; // pomarańczowy
      case 'Zakończone':
        return '#2ecc71'; // zielony
      case 'Anulowane':
        return '#e74c3c'; // czerwony
      default:
        return '#95a5a6'; // szary
    }
  };
  
  const getTaskColor = (task) => {
    // Sprawdź, czy używamy kolorów stanowisk
    if (useWorkstationColors) {
      // Jeśli zadanie ma przypisane stanowisko i stanowisko ma określony kolor
      if (task.workstationId && workstations.find(w => w.id === task.workstationId)?.color) {
        return workstations.find(w => w.id === task.workstationId)?.color;
      }
      // Jeśli zadanie nie ma przypisanego stanowiska lub stanowisko nie ma określonego koloru,
      // to i tak użyj koloru statusu, a nie domyślnego szarego
      return getStatusColor(task.status);
    }
    
    // Jeśli nie używamy kolorów stanowisk, użyj koloru statusu
    return getStatusColor(task.status);
  };

  const getCalendarEvents = () => {
    if (!tasks || tasks.length === 0) {
      return [];
    }
    
    return tasks.map(task => {
      // Sprawdź czy zadanie ma przypisane stanowisko
      const workstationId = task.workstationId;
      
      // Wyznacz kolor w zależności od statusu lub stanowiska
      const color = useWorkstationColors && workstationId
        ? getTaskColor(task)
        : getStatusColor(task.status);
      
      // Przygotuj szczegóły zadania
      const title = task.name || `${task.productName} (${task.moNumber})`;
      
      // Daty rozpoczęcia i zakończenia zadania
      let startDate = task.scheduledDate;
      let endDate = task.endDate || task.estimatedEndDate;
      
      // Konwersja dat do formatu ISO String (jeśli są to obiekty date)
      if (startDate && typeof startDate !== 'string') {
        if (startDate.toDate) {
          startDate = startDate.toDate().toISOString();
        } else if (startDate instanceof Date) {
          startDate = startDate.toISOString();
        }
      }
      
      if (endDate && typeof endDate !== 'string') {
        if (endDate.toDate) {
          endDate = endDate.toDate().toISOString();
        } else if (endDate instanceof Date) {
          endDate = endDate.toISOString();
        }
      }
      
      // Określ zasób, do którego przypisane jest zadanie, w zależności od trybu grupowania
      let resourceId;
      
      if (ganttGroupBy === 'workstation') {
        // Gdy grupujemy według stanowisk, przypisz do wybranego stanowiska
        resourceId = workstationId;
      } else if (ganttGroupBy === 'order') {
        // Gdy grupujemy według zamówień, przypisz do odpowiedniego zamówienia
        resourceId = task.orderId || 'no-order';
      }
      
      // Zwróć obiekt zdarzenia
      return {
        id: task.id,
        title: title,
        start: startDate,
        end: endDate,
        backgroundColor: color,
        borderColor: color,
        textColor: getContrastYIQ(color),
        extendedProps: {
          task: task
        },
        resourceId: resourceId,
        editable: canEditTask(task) && editable
      };
    }).filter(event => {
      // Filtruj zdarzenia, które nie mają resourceId, jeśli jesteśmy w widoku zasobów
      if (view.includes('resourceTimeline')) {
        return event.resourceId !== undefined;
      }
      return true;
    });
  };

  // Przygotowanie zasobów dla wykresu Gantta
  const getResources = () => {
    // Jeśli brak workstations lub tasks, zwróć pustą tablicę
    if (!workstations || workstations.length === 0) {
      return [];
    }
    
    // Jeśli grupujemy według stanowisk
    if (ganttGroupBy === 'workstation') {
      // Filtruj stanowiska według zaznaczonych w filtrze
      return workstations
        .filter(workstation => selectedWorkstations[workstation.id])
        .map(workstation => ({
          id: workstation.id,
          title: workstation.name,
          businessHours: workstation.businessHours || {
            daysOfWeek: [1, 2, 3, 4, 5], // Poniedziałek-piątek
            startTime: '08:00',
            endTime: '16:00'
          }
        }));
    } 
    // Jeśli grupujemy według zamówień
    else if (ganttGroupBy === 'order') {
      // Pobierz unikalne zamówienia z zadań
      const uniqueOrders = new Map();
      
      tasks.forEach(task => {
        // Sprawdź czy zadanie ma przypisany numer zamówienia
        if (task.orderId) {
          // Jeśli zamówienie nie było jeszcze dodane, dodaj je
          if (!uniqueOrders.has(task.orderId)) {
            uniqueOrders.set(task.orderId, {
              id: task.orderId,
              title: `Zamówienie ${task.orderNumber || task.orderId}`,
              // Możemy dodać więcej informacji o zamówieniu, jeśli są dostępne
              customerId: task.customerId,
              customerName: task.customerName
            });
          }
        }
      });
      
      // Jeśli nie ma zamówień lub wszystkie zadania są bez zamówień, 
      // dodaj kategorię "Bez zamówienia"
      if (uniqueOrders.size === 0 || tasks.some(task => !task.orderId)) {
        uniqueOrders.set('no-order', {
          id: 'no-order',
          title: 'Bez zamówienia'
        });
      }
      
      // Zwróć listę zamówień jako zasoby
      return Array.from(uniqueOrders.values());
    }
    
    // Domyślnie, jeśli wartość ganttGroupBy jest nieprawidłowa
    return [];
  };

  // Komponent renderujący zawartość zdarzenia w kalendarzu
  const renderEventContent = (eventInfo) => {
    const duration = eventInfo.event.end 
      ? Math.round((eventInfo.event.end - eventInfo.event.start) / (1000 * 60)) 
      : eventInfo.event.extendedProps.estimatedDuration || '';
    
    const durationText = duration ? `(${duration} min)` : '';
    
    const workstationId = eventInfo.event.extendedProps.workstationId;
    const workstationName = workstationId ? 
      workstations.find(w => w.id === workstationId)?.name || 'Nieznane stanowisko' : 
      'Brak przypisanego stanowiska';
    
    // Różny sposób wyświetlania dla widoku Gantta i zwykłego kalendarza
    if (view.startsWith('resourceTimeline')) {
      return (
        <Tooltip title={
          <div>
            <Typography variant="subtitle2">{eventInfo.event.title}</Typography>
            {eventInfo.event.extendedProps.moNumber && 
              <Typography variant="body2">Numer MO: {eventInfo.event.extendedProps.moNumber}</Typography>
            }
            <Typography variant="body2">Produkt: {eventInfo.event.extendedProps.productName}</Typography>
            <Typography variant="body2">Ilość: {eventInfo.event.extendedProps.quantity} {eventInfo.event.extendedProps.unit}</Typography>
            <Typography variant="body2">Status: {eventInfo.event.extendedProps.status}</Typography>
            <Typography variant="body2">Stanowisko: {workstationName}</Typography>
            {duration && <Typography variant="body2">Czas trwania: {duration} min</Typography>}
            <Typography variant="body2">
              Od: {new Date(eventInfo.event.start).toLocaleString()}
            </Typography>
            <Typography variant="body2">
              Do: {new Date(eventInfo.event.end).toLocaleString()}
            </Typography>
          </div>
        }>
          <Box sx={{ 
            overflow: 'hidden', 
            textOverflow: 'ellipsis', 
            width: '100%', 
            height: '100%', 
            display: 'flex',
            alignItems: 'center',
            pl: 1
          }}>
            <Typography variant="caption" noWrap>
              {eventInfo.event.extendedProps.moNumber} - {eventInfo.event.extendedProps.productName || eventInfo.event.title} {durationText}
            </Typography>
          </Box>
        </Tooltip>
      );
    }
    
    return (
      <Tooltip title={
        <div>
          <Typography variant="subtitle2">{eventInfo.event.title}</Typography>
          {eventInfo.event.extendedProps.moNumber && 
            <Typography variant="body2">Numer MO: {eventInfo.event.extendedProps.moNumber}</Typography>
          }
          <Typography variant="body2">Produkt: {eventInfo.event.extendedProps.productName}</Typography>
          <Typography variant="body2">Ilość: {eventInfo.event.extendedProps.quantity} {eventInfo.event.extendedProps.unit}</Typography>
          <Typography variant="body2">Status: {eventInfo.event.extendedProps.status}</Typography>
          <Typography variant="body2">Stanowisko: {workstationName}</Typography>
          {duration && <Typography variant="body2">Czas trwania: {duration} min</Typography>}
          <Typography variant="body2">
            Od: {new Date(eventInfo.event.start).toLocaleString()}
          </Typography>
          <Typography variant="body2">
            Do: {new Date(eventInfo.event.end).toLocaleString()}
          </Typography>
        </div>
      }>
        <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <Typography variant="caption" noWrap>{eventInfo.timeText}</Typography>
          <Typography variant="body2" noWrap>{eventInfo.event.title} {durationText}</Typography>
        </Box>
      </Tooltip>
    );
  };

  // Funkcja pomocnicza zwracająca etykietę dla aktualnego widoku Gantta
  const getGanttViewLabel = () => {
    switch (ganttView) {
      case 'resourceTimelineDay':
        return 'Dzień';
      case 'resourceTimelineWeek':
        return 'Tydzień';
      case 'resourceTimelineMonth':
        return 'Miesiąc';
      case 'resourceTimelineYear':
        return 'Rok';
      default:
        return 'Miesiąc';
    }
  };

  // Efekt inicjalizujący kalendarz przy pierwszym renderowaniu
  useEffect(() => {
    if (calendarRef.current) {
      const calendarApi = calendarRef.current.getApi();
      
      // Pobierz aktualny zakres dat widoczny w kalendarzu
      const currentView = calendarApi.view;
      const viewStart = currentView.activeStart;
      const viewEnd = currentView.activeEnd;
      
      console.log('Inicjalizacja kalendarza - zakres dat:', viewStart, viewEnd);
      
      // Sprawdź, czy to widok Gantta
      if (view.startsWith('resourceTimeline')) {
        // Ustaw odpowiedni widok Gantta w zależności od liczby dni
        const diffInDays = Math.ceil((viewEnd - viewStart) / (1000 * 60 * 60 * 24));
        
        let ganttViewToUse = 'resourceTimelineWeek';
        if (diffInDays <= 1) {
          ganttViewToUse = 'resourceTimelineDay';
        } else if (diffInDays <= 7) {
          ganttViewToUse = 'resourceTimelineWeek';
        } else if (diffInDays <= 31) {
          ganttViewToUse = 'resourceTimelineMonth';
        } else {
          ganttViewToUse = 'resourceTimelineYear';
        }
        
        // Zmień widok jeśli potrzeba
        if (ganttViewToUse !== view) {
          setGanttView(ganttViewToUse);
          setView(ganttViewToUse);
          calendarApi.changeView(ganttViewToUse);
        }
      }
      
      // Ręczne wywołanie pobrania zadań
      const fetchInitialTasks = async () => {
        try {
          setLoading(true);
          console.log('Pobieranie początkowych zadań...');
          const startStr = viewStart.toISOString();
          const endStr = viewEnd.toISOString();
          const fetchedTasks = await getTasksByDateRange(startStr, endStr);
          console.log('Pobrano początkowe zadania:', fetchedTasks);
          setTasks(fetchedTasks);
        } catch (error) {
          console.error('Błąd podczas pobierania początkowych zadań:', error);
          showError('Błąd podczas pobierania zadań: ' + error.message);
        } finally {
          setLoading(false);
        }
      };
      
      fetchInitialTasks();
    }
  }, []);
  
  const handleDateRangeMenuClick = (event) => {
    setDateRangeMenuAnchor(event.currentTarget);
  };

  const handleDateRangeMenuClose = () => {
    setDateRangeMenuAnchor(null);
  };

  const applyPredefinedRange = (range) => {
    let newStartDate, newEndDate;
    const today = new Date();
    
    switch(range) {
      case 'today':
        newStartDate = today;
        newEndDate = today;
        break;
      case 'thisWeek':
        newStartDate = new Date(today);
        newStartDate.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
        newEndDate = new Date(newStartDate);
        newEndDate.setDate(newStartDate.getDate() + 6);
        break;
      case 'thisMonth':
        newStartDate = startOfMonth(today);
        newEndDate = endOfMonth(today);
        break;
      case 'nextMonth':
        newStartDate = startOfMonth(addMonths(today, 1));
        newEndDate = endOfMonth(addMonths(today, 1));
        break;
      case 'next30Days':
        newStartDate = today;
        newEndDate = addDays(today, 30);
        break;
      case 'next90Days':
        newStartDate = today;
        newEndDate = addDays(today, 90);
        break;
      default:
        return;
    }
    
    try {
      // Najpierw zamknij menu
      handleDateRangeMenuClose();
      
      // Aktualizuj stany dat
      setStartDate(newStartDate);
      setEndDate(newEndDate);
      
      if (calendarRef.current) {
        const calendarApi = calendarRef.current.getApi();
        
        // Oblicz różnicę między datami w dniach
        const diffInDays = Math.ceil((newEndDate - newStartDate) / (1000 * 60 * 60 * 24));
        
        // Wybierz odpowiedni widok na podstawie różnicy w dniach
        let viewToUse = view;
        if (view.startsWith('resourceTimeline')) {
          if (diffInDays <= 1) {
            viewToUse = 'resourceTimelineDay';
          } else if (diffInDays <= 7) {
            viewToUse = 'resourceTimelineWeek';
          } else if (diffInDays <= 31) {
            viewToUse = 'resourceTimelineMonth';
          } else {
            viewToUse = 'resourceTimelineYear';
          }
          
          // Tylko jeśli widok się zmienił, aktualizuj stan
          if (viewToUse !== view) {
            setGanttView(viewToUse);
            setView(viewToUse);
            
            // Daj czas na zaktualizowanie stanu przed zmianą widoku
            setTimeout(() => {
              try {
                calendarApi.changeView(viewToUse);
              } catch (error) {
                console.error('Błąd podczas zmiany widoku kalendarza:', error);
              }
            }, 0);
          }
        }
        
        // Przejdź do daty początkowej
        calendarApi.gotoDate(newStartDate);
        
        // Pobierz zadania dla wybranego zakresu
        fetchTasks({
          startStr: newStartDate.toISOString(),
          endStr: newEndDate.toISOString()
        });
      }
      
      // Ustaw customDateRange jako ostatni krok
      setCustomDateRange(true);
    } catch (error) {
      console.error('Błąd podczas stosowania zakresu dat:', error);
      showError('Wystąpił błąd podczas zmiany zakresu dat: ' + error.message);
    }
  };

  const applyCustomDateRange = () => {
    try {
      // Najpierw zamknij menu
      handleDateRangeMenuClose();
      
      if (calendarRef.current) {
        const calendarApi = calendarRef.current.getApi();
        
        // Oblicz różnicę między datami w dniach
        const diffInDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
        
        // Wybierz odpowiedni widok na podstawie różnicy w dniach
        let viewToUse = view;
        if (view.startsWith('resourceTimeline')) {
          if (diffInDays <= 7) {
            viewToUse = 'resourceTimelineWeek';
          } else if (diffInDays <= 31) {
            viewToUse = 'resourceTimelineMonth';
          } else {
            viewToUse = 'resourceTimelineYear';
          }
          
          // Tylko jeśli widok się zmienił, aktualizuj stan
          if (viewToUse !== view) {
            setGanttView(viewToUse);
            setView(viewToUse);
            
            // Daj czas na zaktualizowanie stanu przed zmianą widoku
            setTimeout(() => {
              try {
                calendarApi.changeView(viewToUse);
              } catch (error) {
                console.error('Błąd podczas zmiany widoku kalendarza:', error);
              }
            }, 0);
          }
        }
        
        // Przejdź do daty początkowej
        calendarApi.gotoDate(startDate);
        
        // Pobierz zadania dla wybranego zakresu
        fetchTasks({
          startStr: startDate.toISOString(),
          endStr: endDate.toISOString()
        });
      }
      
      // Ustaw customDateRange jako ostatni krok
      setCustomDateRange(true);
    } catch (error) {
      console.error('Błąd podczas stosowania niestandardowego zakresu dat:', error);
      showError('Wystąpił błąd podczas zmiany zakresu dat: ' + error.message);
    }
  };

  // Obsługa przeciągnięcia wydarzenia (zmiana daty/czasu)
  const handleEventDrop = async (info) => {
    try {
      setLoading(true);
      const { event } = info;
      const taskId = event.id;
      
      // Przygotowanie danych do aktualizacji
      const updateData = {
        scheduledDate: event.start,
        endDate: event.end
      };
      
      console.log(`Zadanie przeciągnięte: ${taskId}`, updateData);
      
      // Aktualizacja zadania w bazie danych
      await updateTask(taskId, updateData, 'system');
      showSuccess('Zadanie zostało zaktualizowane pomyślnie');
      
      // Odświeżenie widoku
      fetchTasks({
        startStr: calendarRef.current.getApi().view.activeStart.toISOString(),
        endStr: calendarRef.current.getApi().view.activeEnd.toISOString()
      });
    } catch (error) {
      console.error('Błąd podczas aktualizacji zadania:', error);
      showError('Błąd podczas aktualizacji zadania: ' + error.message);
      info.revert(); // Cofnij zmianę wizualnie
    } finally {
      setLoading(false);
    }
  };
  
  // Obsługa przełącznika dla opcji zmiany rozmiaru od początku
  const handleResizableFromStartToggle = (event) => {
    setEventResizableFromStart(event.target.checked);
  };

  // Obsługa zmiany rozmiaru wydarzenia od początku (gdy eventResizableFromStart jest true)
  const handleEventResize = async (info) => {
    try {
      setLoading(true);
      const { event } = info;
      const taskId = event.id;
      
      // Przygotowanie danych do aktualizacji
      const updateData = {
        endDate: event.end
      };
      
      // Jeśli rozciąganie od początku jest włączone i zmienił się początek wydarzenia
      if (eventResizableFromStart && info.startDelta && (info.startDelta.days !== 0 || info.startDelta.milliseconds !== 0)) {
        updateData.scheduledDate = event.start;
      }
      
      console.log(`Zmieniono rozmiar zadania: ${taskId}`, updateData);
      
      // Aktualizacja zadania w bazie danych
      await updateTask(taskId, updateData, 'system');
      showSuccess('Czas trwania zadania został zaktualizowany pomyślnie');
      
      // Odświeżenie widoku
      fetchTasks({
        startStr: calendarRef.current.getApi().view.activeStart.toISOString(),
        endStr: calendarRef.current.getApi().view.activeEnd.toISOString()
      });
    } catch (error) {
      console.error('Błąd podczas aktualizacji czasu trwania zadania:', error);
      showError('Błąd podczas aktualizacji zadania: ' + error.message);
      info.revert(); // Cofnij zmianę wizualnie
    } finally {
      setLoading(false);
    }
  };

  // Funkcja pomocnicza określająca, czy zadanie może być edytowane
  const canEditTask = (task) => {
    // Sprawdź czy zadanie ma status, który pozwala na edycję
    // Na przykład, nie pozwalaj na edycję zakończonych lub anulowanych zadań
    return task.status !== 'Zakończone' && task.status !== 'Anulowane';
  };

  // Obsługa kliknięcia w przełącznik edycji
  const handleEditableToggle = (event) => {
    setEditable(event.target.checked);
  };

  // Funkcja do obsługi nawigacji kalendarza (prev, next, today buttons)
  const handleNavigation = (action) => {
    if (calendarRef.current) {
      const calendarApi = calendarRef.current.getApi();
      
      // Jeśli mamy niestandardowy zakres dat, wyłącz niestandardowy zakres
      // aby kalendarz funkcjonował normalnie
      if (customDateRange) {
        setCustomDateRange(false);
        
        // Przypisujemy nowe daty do startDate i endDate na podstawie aktualnego widoku
        const currentViewStart = calendarApi.view.currentStart;
        const currentViewEnd = calendarApi.view.currentEnd;
        setStartDate(currentViewStart);
        setEndDate(currentViewEnd);
      }
      
      // Wykonaj akcję nawigacji
      if (action === 'prev') {
        calendarApi.prev();
      } else if (action === 'next') {
        calendarApi.next();
      } else if (action === 'today') {
        calendarApi.today();
      }
    }
  };

  // Aktualizacja tytułu kalendarza na podstawie zakresu dat
  const getCalendarTitle = () => {
    if (calendarRef.current) {
      try {
        return calendarRef.current.getApi().view.title;
      } catch (error) {
        console.error('Błąd podczas pobierania tytułu kalendarza:', error);
        return customDateRange 
          ? `${format(startDate, 'dd.MM.yyyy')} - ${format(endDate, 'dd.MM.yyyy')}`
          : '31 mar – 6 kwi 2025';
      }
    } else {
      return customDateRange 
        ? `${format(startDate, 'dd.MM.yyyy')} - ${format(endDate, 'dd.MM.yyyy')}`
        : '31 mar – 6 kwi 2025';
    }
  };

  // Prostszy efekt do aktualizacji kalendarza po zmianie zakresu dat
  useEffect(() => {
    if (customDateRange && calendarRef.current) {
      try {
        // Pobierz zadania dla wybranego zakresu
        fetchTasks({
          startStr: startDate.toISOString(),
          endStr: endDate.toISOString()
        });
      } catch (error) {
        console.error('Błąd podczas aktualizacji kalendarza:', error);
        showError('Błąd podczas aktualizacji widoku kalendarza: ' + error.message);
      }
    }
  }, [customDateRange]);

  const handleDetailMenuClick = (event) => {
    setDetailMenuAnchor(event.currentTarget);
  };

  const handleDetailMenuClose = () => {
    setDetailMenuAnchor(null);
  };

  const handleGanttDetailChange = (detail) => {
    handleDetailMenuClose();
    setGanttDetail(detail);
    
    if (calendarRef.current) {
      try {
        const calendarApi = calendarRef.current.getApi();
        
        // Dostosuj widok Gantta do wybranej szczegółowości
        let viewToUse = ganttView;
        
        // Aktualizuj widok odpowiednio do wybranej szczegółowości
        if (detail === 'hour') {
          // Dla widoku godzinowego używamy widoku dnia z podziałem na godziny
          viewToUse = 'resourceTimelineDay';
        } else if (detail === 'day') {
          // Dla widoku dziennego używamy widoku tygodnia lub miesiąca,
          // w zależności od długości wybranego zakresu dat
          const diffInDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
          if (diffInDays <= 7) {
            viewToUse = 'resourceTimelineWeek';
          } else {
            viewToUse = 'resourceTimelineMonth';
          }
        } else if (detail === 'week') {
          // Dla widoku tygodniowego używamy widoku miesiąca lub roku
          viewToUse = 'resourceTimelineYear';
        }
        
        // Aktualizuj stany tylko jeśli widok się zmienił
        if (viewToUse !== view) {
          setGanttView(viewToUse);
          setView(viewToUse);
          
          // Daj czas na aktualizację stanu
          setTimeout(() => {
            try {
              calendarApi.changeView(viewToUse);
              
              // Pobierz zadania dla aktualnie widocznego zakresu
              fetchTasks({
                startStr: calendarApi.view.activeStart.toISOString(),
                endStr: calendarApi.view.activeEnd.toISOString()
              });
            } catch (error) {
              console.error('Błąd podczas zmiany szczegółowości widoku:', error);
              showError('Wystąpił błąd podczas zmiany widoku: ' + error.message);
            }
          }, 0);
        }
      } catch (error) {
        console.error('Błąd podczas zmiany szczegółowości widoku:', error);
        showError('Wystąpił błąd podczas zmiany widoku: ' + error.message);
      }
    }
  };

  // Funkcja do przełączania grupowania Gantta
  const handleGanttGroupByChange = () => {
    // Przełącz między 'workstation' a 'order'
    const newGroupBy = ganttGroupBy === 'workstation' ? 'order' : 'workstation';
    setGanttGroupBy(newGroupBy);
    
    // Odśwież widok kalendarza, jeśli jest to widok Gantta
    if (view.includes('resourceTimeline') && calendarRef.current) {
      // Daj czas na aktualizację stanu
      setTimeout(() => {
        try {
          const calendarApi = calendarRef.current.getApi();
          calendarApi.refetchResources();
        } catch (error) {
          console.error('Błąd podczas odświeżania zasobów:', error);
        }
      }, 0);
    }
  };

  // Funkcja do określania koloru stanowiska
  const getWorkstationColor = (workstationId) => {
    // Znajdź stanowisko o podanym ID
    const workstation = workstations.find(w => w.id === workstationId);
    
    // Jeśli znaleziono stanowisko i ma określony kolor, użyj go
    if (workstation && workstation.color) {
      return workstation.color;
    }
    
    // Domyślne kolory dla stanowisk, jeśli nie mają określonego koloru
    const defaultColors = {
      'WCT00003': '#2196f3', // Powder
      'WCT00006': '#4caf50', // Pills
      'WCT00009': '#f50057', // Contract Line
      'WCT00012': '#ff9800', // Filling
      'WCT00015': '#9c27b0'  // Packaging
    };
    
    // Jeśli istnieje domyślny kolor dla danego stanowiska, użyj go
    if (defaultColors[workstationId]) {
      return defaultColors[workstationId];
    }
    
    // Domyślny kolor, jeśli nie znaleziono żadnego dopasowania
    return '#7986cb';
  };
  
  // Funkcja do określania koloru tekstu na podstawie koloru tła
  const getContrastYIQ = (hexcolor) => {
    // Usuń # z początku kodu koloru, jeśli istnieje
    hexcolor = hexcolor.replace('#', '');
    
    // Konwertuj 3-cyfrowy kod koloru na 6-cyfrowy
    if (hexcolor.length === 3) {
      hexcolor = hexcolor[0] + hexcolor[0] + hexcolor[1] + hexcolor[1] + hexcolor[2] + hexcolor[2];
    }
    
    // Konwertuj kolor hex na RGB
    const r = parseInt(hexcolor.substr(0, 2), 16);
    const g = parseInt(hexcolor.substr(2, 2), 16);
    const b = parseInt(hexcolor.substr(4, 2), 16);
    
    // Oblicz jasność koloru używając YIQ
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    
    // Zwróć biały dla ciemnych kolorów, czarny dla jasnych
    return (yiq >= 128) ? '#000000' : '#ffffff';
  };

  return (
    <Paper sx={{ 
      p: 2, 
      height: 'calc(100vh - 80px)', 
      display: 'flex', 
      flexDirection: 'column', 
      maxWidth: '100%',
      overflow: 'hidden'
    }}>
      {/* Nagłówek kalendarza */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center' }}>
          <CalendarIcon sx={{ mr: 1 }} />
          Kalendarz produkcji
        </Typography>
      </Box>
      
      {/* Pasek narzędziowy - podzielony na logiczne sekcje */}
      <Box sx={{ 
        display: 'flex', 
        flexWrap: 'wrap', 
        gap: 1, 
        mb: 2, 
        pb: 2, 
        borderBottom: '1px solid #e0e0e0',
        justifyContent: 'space-between'
      }}>
        {/* Grupa 1: Nawigacja i zakres dat */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button 
            variant="outlined" 
            size="small" 
            onClick={() => handleNavigation('prev')}
            sx={{ minWidth: 50, height: 36 }}
          >
            &lt;
          </Button>
          <Button 
            variant="outlined" 
            size="small" 
            onClick={() => handleNavigation('next')}
            sx={{ minWidth: 50, height: 36 }}
          >
            &gt;
          </Button>
          <Button 
            variant="contained" 
            size="small" 
            onClick={() => handleNavigation('today')}
            sx={{ mx: 1, height: 36 }}
          >
            Dziś
          </Button>
          
          <Button
            variant="outlined"
            onClick={handleDateRangeMenuClick}
            sx={{ height: 36 }}
            startIcon={<CalendarIcon />}
            size="small"
          >
            {customDateRange 
              ? `${format(startDate, 'dd.MM.yyyy')} - ${format(endDate, 'dd.MM.yyyy')}`
              : 'Wybierz zakres dat'}
          </Button>
        </Box>

        {/* Grupa 2: Zmiana widoku */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" sx={{ mr: 1 }}>Widok:</Typography>
          <ToggleButtonGroup
            value={view.includes('resourceTimeline') ? 'gantt' : view}
            exclusive
            onChange={handleViewChange}
            aria-label="widok kalendarza"
            size="small"
          >
            <ToggleButton value="timeGridDay" aria-label="dzień">
              <Tooltip title="Dzień">
                <DayIcon />
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="timeGridWeek" aria-label="tydzień">
              <Tooltip title="Tydzień">
                <WeekIcon />
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="dayGridMonth" aria-label="miesiąc">
              <Tooltip title="Miesiąc">
                <MonthIcon />
              </Tooltip>
            </ToggleButton>
            <ToggleButton 
              value="gantt" 
              aria-label="gantt"
              onClick={handleGanttMenuClick}
            >
              <Tooltip title="Wykres Gantta">
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <GanttIcon />
                  <ArrowDropDownIcon fontSize="small" />
                </Box>
              </Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {/* Grupa 3: Filtry i opcje */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FormControlLabel
            control={
              <Switch
                checked={useWorkstationColors}
                onChange={(e) => setUseWorkstationColors(e.target.checked)}
                color="primary"
                size="small"
              />
            }
            label={<Typography variant="body2">Kolory stanowisk</Typography>}
          />
          
          {view.startsWith('resourceTimeline') && (
            <Button
              variant="outlined"
              onClick={handleDetailMenuClick}
              sx={{ height: 36 }}
              size="small"
            >
              Szczegółowość: {ganttDetail === 'hour' ? 'Godzina' : ganttDetail === 'day' ? 'Dzień' : 'Tydzień'}
            </Button>
          )}
        </Box>

        {/* Przycisk przełączający tryb widoku Gantt */}
        {view.includes('resourceTimeline') && (
          <Button
            variant="outlined"
            size="small"
            sx={{ ml: 1 }}
            onClick={handleGanttGroupByChange}
            startIcon={ganttGroupBy === 'workstation' ? <BusinessIcon /> : <WorkIcon />}
          >
            {ganttGroupBy === 'workstation' ? 'Stanowiska' : 'Zamówienia'}
          </Button>
        )}
      </Box>
      
      {/* Menu i dialogu pozostają bez zmian */}
      <Menu
        anchorEl={dateRangeMenuAnchor}
        open={Boolean(dateRangeMenuAnchor)}
        onClose={handleDateRangeMenuClose}
        PaperProps={{
          sx: { minWidth: '300px', p: 1 }
        }}
      >
        <Box sx={{ p: 1 }}>
          <Typography variant="subtitle2" gutterBottom>
            Szybki wybór zakresu
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
            <Chip 
              label="Dziś" 
              onClick={() => applyPredefinedRange('today')} 
              color="primary" 
              variant="outlined" 
              size="small" 
            />
            <Chip 
              label="Ten tydzień" 
              onClick={() => applyPredefinedRange('thisWeek')} 
              color="primary" 
              variant="outlined" 
              size="small" 
            />
            <Chip 
              label="Ten miesiąc" 
              onClick={() => applyPredefinedRange('thisMonth')} 
              color="primary" 
              variant="outlined" 
              size="small" 
            />
            <Chip 
              label="Następny miesiąc" 
              onClick={() => applyPredefinedRange('nextMonth')} 
              color="primary" 
              variant="outlined" 
              size="small" 
            />
            <Chip 
              label="Następne 30 dni" 
              onClick={() => applyPredefinedRange('next30Days')} 
              color="primary" 
              variant="outlined" 
              size="small" 
            />
            <Chip 
              label="Następne 90 dni" 
              onClick={() => applyPredefinedRange('next90Days')} 
              color="primary" 
              variant="outlined" 
              size="small" 
            />
          </Box>
          
          <Typography variant="subtitle2" gutterBottom>
            Niestandardowy zakres dat
          </Typography>
          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <DatePicker
                label="Data początkowa"
                value={startDate}
                onChange={(newValue) => setStartDate(newValue)}
                sx={{ mr: 1, flex: 1 }}
                format="dd.MM.yyyy"
              />
              <Typography sx={{ mx: 1 }}>-</Typography>
              <DatePicker
                label="Data końcowa"
                value={endDate}
                minDate={startDate}
                onChange={(newValue) => setEndDate(newValue)}
                sx={{ flex: 1 }}
                format="dd.MM.yyyy"
              />
            </Box>
          </LocalizationProvider>
          
          <Button 
            variant="contained" 
            fullWidth 
            onClick={applyCustomDateRange}
          >
            Zastosuj zakres
          </Button>
        </Box>
      </Menu>

      <Menu
        anchorEl={detailMenuAnchor}
        open={Boolean(detailMenuAnchor)}
        onClose={handleDetailMenuClose}
      >
        <MenuItem 
          onClick={() => handleGanttDetailChange('hour')}
          selected={ganttDetail === 'hour'}
        >
          Godzina
        </MenuItem>
        <MenuItem 
          onClick={() => handleGanttDetailChange('day')}
          selected={ganttDetail === 'day'}
        >
          Dzień
        </MenuItem>
        <MenuItem 
          onClick={() => handleGanttDetailChange('week')}
          selected={ganttDetail === 'week'}
        >
          Tydzień
        </MenuItem>
      </Menu>
      
      {/* Legenda statusów/stanowisk */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', mb: 2 }}>
        {useWorkstationColors && workstations.length > 0 ? (
          <>
            <Typography variant="body2" sx={{ mr: 1, fontWeight: 'bold' }}>
              Legenda stanowisk:
            </Typography>
            {workstations.map(workstation => (
              <Chip
                key={workstation.id}
                size="small"
                label={workstation.name}
                sx={{
                  backgroundColor: workstation.color || '#2196f3',
                  color: theme => theme.palette.getContrastText(workstation.color || '#2196f3'),
                  opacity: selectedWorkstations[workstation.id] ? 1 : 0.3
                }}
              />
            ))}
          </>
        ) : (
          <>
            <Typography variant="body2" sx={{ mr: 1, fontWeight: 'bold' }}>
              Legenda statusów:
            </Typography>
            <Chip size="small" label="Zaplanowane" sx={{ backgroundColor: '#3788d8', color: '#fff' }} />
            <Chip size="small" label="W trakcie" sx={{ backgroundColor: '#f39c12', color: '#fff' }} />
            <Chip size="small" label="Zakończone" sx={{ backgroundColor: '#2ecc71', color: '#fff' }} />
            <Chip size="small" label="Anulowane" sx={{ backgroundColor: '#e74c3c', color: '#fff' }} />
          </>
        )}
      </Box>
      
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, bgcolor: 'rgba(255,255,255,0.7)' }}>
          <CircularProgress />
        </Box>
      )}
      
      <Box sx={{ 
        flex: '1 1 auto', 
        position: 'relative', 
        minHeight: 0,
        width: '100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <Box sx={{ textAlign: 'center', mb: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
            {getCalendarTitle()}
          </Typography>
        </Box>
        <style>
          {`
            .fc-scrollgrid-section-header {
              background-color: inherit !important;
            }
            .fc-theme-standard th {
              background-color: inherit !important;
            }
            .fc .fc-view-harness {
              background-color: inherit !important;
              height: 100% !important;
            }
            .fc-view-harness-active {
              height: 100% !important;
            }
            .fc-scroller {
              overflow: auto !important;
            }
            .fc-resource-timeline-divider {
              width: 3px !important;
            }
            .fc-resource-timeline .fc-resource-group {
              font-weight: bold;
            }
            .fc-resource-area {
              width: 25% !important;
            }
            .fc-timeline-slot {
              min-width: 80px;
            }
            .fc-resource-timeline-divider tbody .fc-cell-shaded {
              background: #f5f5f5;
            }
            .fc-timeline-event {
              border-radius: 3px;
              padding: 2px 4px;
              font-size: 13px;
            }
            .fc-resource-timeline-header-cell {
              font-weight: bold;
            }
            .fc-daygrid-day-number {
              font-weight: bold;
            }
            .fc-col-header-cell {
              background-color: #f9f9f9 !important;
            }
            .fc-timeline-header .fc-cell-shaded {
              background: #f9f9f9;
            }
            .fc-timeline-lane-frame {
              border-bottom: 1px solid #ddd;
            }
            .fc-timeline-slot-label {
              text-transform: capitalize;
            }
            .fc-timeline-slot-label-frame {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
            }
            .fc-timeline-slot-label-cushion {
              font-weight: bold;
            }
            
            /* Style dla różnych poziomów szczegółowości */
            .fc-resourceTimelineDay-view .fc-timeline-slot-label-frame {
              padding: 2px 0;
            }
            
            .fc-resourceTimelineWeek-view .fc-timeline-slot-label-frame,
            .fc-resourceTimelineMonth-view .fc-timeline-slot-label-frame {
              display: flex;
              flex-direction: column;
              align-items: center;
              padding: 4px 0;
            }
            
            .fc-resourceTimelineYear-view .fc-timeline-slot-label-frame {
              padding: 4px 0;
            }
            
            /* Usunięcie duplikowanych nagłówków kolumn/sekcji */
            .fc-col-header, .fc-scrollgrid-section-header th[role="columnheader"] {
              display: none;
            }
            
            /* Wyjątek dla pierwszego nagłówka */
            .fc-col-header-cell:first-child, 
            .fc-scrollgrid-section-header th[role="columnheader"]:first-child {
              display: table-cell;
            }
            
            /* Zwiększenie szerokości dla kolumn dnia */
            .fc-resourceTimelineMonth-view .fc-timeline-slot {
              min-width: 60px !important;
            }
            
            /* Style dla widoku godzinowego */
            .fc-resourceTimelineDay-view .fc-timeline-slot {
              min-width: 80px !important;
            }

            .fc-resourceTimelineDay-view .fc-timeline-slot-label-cushion {
              font-size: 12px;
            }
            
            .fc-day-sat .fc-timeline-slot-label-frame, 
            .fc-day-sun .fc-timeline-slot-label-frame {
              background-color: #f5f5f5;
            }
            .fc-timeline-slot-frame {
              border-right: 1px solid #ddd;
            }
            .fc-day-today {
              background: rgba(33, 150, 243, 0.05) !important;
            }
            .fc-day-today .fc-daygrid-day-number {
              color: #2196f3;
              font-weight: bold;
            }
            .fc-timegrid-now-indicator-line {
              border-color: #f44336;
            }
            .fc-timegrid-now-indicator-arrow {
              border-color: #f44336;
              color: #f44336;
            }
            .fc-event {
              cursor: pointer;
            }
            .fc-event.task-completed {
              opacity: 0.7;
              cursor: default;
            }
            .fc-event-resizer {
              display: block;
              width: 8px;
              height: 8px;
            }
            .fc-event-resizer-start {
              left: -4px;
            }
            .fc-event-resizer-end {
              right: -4px;
            }
            .fc-timeline-event .fc-event-resizer {
              top: 0;
              bottom: 0;
              width: 8px;
              height: 100%;
            }
            .fc-timeline-event .fc-event-resizer-start {
              left: -4px;
              cursor: w-resize;
            }
            .fc-timeline-event .fc-event-resizer-end {
              right: -4px;
              cursor: e-resize;
            }
          `}
        </style>
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, timelinePlugin, resourceTimelinePlugin]}
          initialView={view}
          headerToolbar={false}
          events={getCalendarEvents()}
          resources={getResources()}
          resourceLabelText="Zadania"
          eventContent={renderEventContent}
          eventClick={handleEventClick}
          dateClick={null}
          selectable={false}
          datesSet={handleDatesSet}
          locale={plLocale}
          height="100%"
          allDaySlot={true}
          slotMinTime="00:00:00"
          slotMaxTime="23:59:59"
          slotDuration="01:00:00"
          businessHours={{
            daysOfWeek: [1, 2, 3, 4, 5],
            startTime: '08:00',
            endTime: '16:00',
          }}
          weekends={true}
          nowIndicator={true}
          schedulerLicenseKey="GPL-My-Project-Is-Open-Source"
          resourceAreaWidth={view.startsWith('resourceTimeline') ? '30%' : '20%'}
          editable={editable}
          eventDurationEditable={editable}
          eventStartEditable={editable}
          eventResourceEditable={false}
          eventResizableFromStart={eventResizableFromStart}
          droppable={editable}
          eventDrop={handleEventDrop}
          eventResize={handleEventResize}
          eventOverlap={false}
          snapDuration="00:15:00"
          slotLabelFormat={{
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          }}
          themeName="standard"
          eventBorderColor="transparent"
          eventTimeFormat={{
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          }}
          slotEventOverlap={false}
          resourceAreaHeaderContent="Zadania produkcyjne"
          resourcesInitiallyExpanded={true}
          stickyHeaderDates={true}
          stickyResourceAreaHeaderContent={true}
          expandRows={true}
          dayHeaderFormat={{
            weekday: 'short',
            day: 'numeric',
            month: 'numeric'
          }}
          titleFormat={{ 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          }}
          slotLabelContent={(args) => {
            if (view.startsWith('resourceTimeline')) {
              const date = args.date;
              
              // Dla widoku dziennego (godziny)
              if (view === 'resourceTimelineDay') {
                const hour = date.getHours();
                const minute = date.getMinutes();
                return (
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                      {`${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`}
                    </Typography>
                  </Box>
                );
              }
              
              // Dla widoku tygodniowego (dni)
              if (view === 'resourceTimelineWeek' || view === 'resourceTimelineMonth') {
                const weekday = new Intl.DateTimeFormat('pl', { weekday: 'short' }).format(date);
                const day = date.getDate();
                return (
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{day}</Typography>
                    <Typography variant="caption" sx={{ textTransform: 'uppercase' }}>{weekday}</Typography>
                  </Box>
                );
              }
              
              // Dla widoku rocznego (tygodnie/miesiące)
              if (view === 'resourceTimelineYear') {
                if (date.getDate() === 1 || args.isLabeled) {
                  const month = new Intl.DateTimeFormat('pl', { month: 'short' }).format(date);
                  return (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{month}</Typography>
                      <Typography variant="caption">{date.getDate()}</Typography>
                    </Box>
                  );
                }
                return null;
              }
            }
            return null;
          }}
          views={{
            timeGridDay: {
              dayHeaderFormat: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
            },
            timeGridWeek: {
              dayHeaderFormat: { weekday: 'short', day: 'numeric', month: 'numeric' }
            },
            dayGridMonth: {
              dayHeaderFormat: { weekday: 'short' },
              dayCellContent: (args) => {
                return (
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="body2">{args.date.getDate()}</Typography>
                  </Box>
                );
              }
            },
            resourceTimelineDay: {
              slotLabelFormat: [
                { hour: '2-digit', minute: '2-digit', hour12: false }
              ],
              slotMinWidth: 100,
              slotDuration: { hours: 1 },
              snapDuration: { minutes: 15 },
              headerToolbar: false // Wyłączenie domyślnego nagłówka
            },
            resourceTimelineWeek: {
              slotLabelFormat: [
                { weekday: 'short', day: 'numeric', month: 'short' }
              ],
              slotMinWidth: 100,
              slotDuration: { days: 1 },
              headerToolbar: false // Wyłączenie domyślnego nagłówka
            },
            resourceTimelineMonth: {
              slotLabelFormat: {
                weekday: 'short', 
                day: 'numeric'
              },
              duration: { months: 1 },
              slotMinWidth: 60,
              slotDuration: { days: 1 },
              headerToolbar: false // Wyłączenie domyślnego nagłówka
            },
            resourceTimelineYear: {
              slotLabelFormat: {
                month: 'short',
                day: 'numeric'
              },
              slotMinWidth: 40,
              slotDuration: { weeks: 1 },
              headerToolbar: false // Wyłączenie domyślnego nagłówka
            }
          }}
        />
      </Box>
    </Paper>
  );
};

export default ProductionCalendar; 