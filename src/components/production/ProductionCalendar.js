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
          
          // Dodatkowe wymuszenie przerysowania
          if (calendarRef.current) {
            try {
              const calendarApi = calendarRef.current.getApi();
              calendarApi.updateSize();
              
              // Upewnij się, że kalendarz jest w odpowiednim widoku i z właściwym zakresem dat
              if (customDateRange) {
                calendarApi.setOption('visibleRange', {
                  start: startDate,
                  end: endDate
                });
              }
            } catch (error) {
              console.error("Błąd podczas aktualizacji kalendarza po pobraniu zadań:", error);
            }
          }
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
          endDate = startDate.toISOString();
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
      
      // Tworzenie unikalnego ID dla zadania, uwzględniając MO w ramach jednego CO
      const uniqueId = task.id;
      
      // Zwróć obiekt zdarzenia
      return {
        id: uniqueId,
        title: title,
        start: startDate,
        end: endDate,
        backgroundColor: color,
        borderColor: color,
        textColor: getContrastYIQ(color),
        extendedProps: {
          task: task,
          moNumber: task.moNumber, // Dodajemy numer MO do extendedProps
          orderId: task.orderId    // Dodajemy ID zamówienia do extendedProps
        },
        resourceId: resourceId,
        editable: canEditTask(task) && editable,
        groupId: task.orderId ? `order-${task.orderId}` : null // Dodanie groupId dla zadań z tego samego zamówienia
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

  // Kompletnie przepisana funkcja do zastosowania zakresu dat
  const applyCustomDateRange = () => {
    try {
      // Najpierw zamknij menu
      handleDateRangeMenuClose();
      
      // Pokazujemy loader
      setLoading(true);
      
      // Walidacja dat
      if (!startDate || !endDate) {
        showError('Wybierz prawidłowy zakres dat');
        setLoading(false);
        return;
      }
      
      if (startDate > endDate) {
        showError('Data początkowa nie może być późniejsza niż końcowa');
        setLoading(false);
        return;
      }
      
      // Ustawienie końca dnia dla daty końcowej, aby zawierała cały dzień
      const endDateWithTime = new Date(endDate.getTime());
      endDateWithTime.setHours(23, 59, 59, 999);
      
      // Aktualizuj stany dat dla kolejnych zapytań
      setEndDate(endDateWithTime);
      
      // Logging
      console.log("Zastosowanie zakresu dat:", format(startDate, 'dd.MM.yyyy'), "-", format(endDateWithTime, 'dd.MM.yyyy'));
      console.log("Daty ISO:", startDate.toISOString(), "-", endDateWithTime.toISOString());
      
      // Najprostsze rozwiązanie - całkowite zniszczenie i odbudowa komponentu
      // bez zależności od wszystkich opcji konfiguracyjnych
      if (calendarRef.current) {
        const calendarApi = calendarRef.current.getApi();
        
        // Aktualny stan
        console.log("Aktualna widoczność kalendarza przed resetem:", 
          calendarApi.view.activeStart, 
          calendarApi.view.activeEnd,
          "Typ widoku:", calendarApi.view.type
        );
        
        // Włącz flagę customDateRange
        setCustomDateRange(true);
        
        // Oblicz długość trwania w dniach (+1, aby uwzględnić dzień końcowy)
        const durationDays = Math.ceil((endDateWithTime - startDate) / (1000 * 60 * 60 * 24)) + 1;
        console.log("Długość trwania w dniach:", durationDays);
        
        // Wybór odpowiedniego widoku
        let targetView = 'resourceTimelineMonth';
        if (durationDays <= 1) {
          targetView = 'resourceTimelineDay';
        } else if (durationDays <= 7) {
          targetView = 'resourceTimelineWeek';
        }
        
        // KOMPLETNY RESET KALENDARZA - znacznie radykalniejsze podejście
        try {
          // 1. Usuń wszystkie wydarzenia
          calendarApi.removeAllEvents();
          
          // 2. Ustaw nowy widok i opcje
          setView(targetView);
          calendarApi.changeView(targetView);
          
          // 3. Ustaw domyślną durationę dla widoku (unikając konfliktu z slotDuration)
          if (targetView === 'resourceTimelineMonth') {
            calendarApi.setOption('duration', { days: durationDays });
          }
          
          // 4. KLUCZOWE: Ustaw dokładny zakres dat (visibleRange jest nadrzędny wobec duration)
          calendarApi.setOption('visibleRange', {
            start: startDate,
            end: endDateWithTime
          });
          
          // 5. Przejdź do daty początkowej
          calendarApi.gotoDate(startDate);
          
          // 6. Zaktualizuj widok
          calendarApi.updateSize();
          
          // 7. Pobierz dane dla dokładnego zakresu
          console.log("Pobieranie zadań dla wybranego zakresu:", startDate.toISOString(), "-", endDateWithTime.toISOString());
          fetchTasks({
            startStr: startDate.toISOString(),
            endStr: endDateWithTime.toISOString()
          });
          
          // Sprawdź końcowy stan po wszystkich zmianach
          setTimeout(() => {
            if (calendarRef.current) {
              const api = calendarRef.current.getApi();
              console.log("KOŃCOWY stan kalendarza:", 
                api.view.activeStart, 
                api.view.activeEnd,
                "Widok:", api.view.type
              );
            }
            
            // Wyłącz loader
            setLoading(false);
          }, 250);
        } catch (error) {
          console.error("Błąd podczas resetowania kalendarza:", error);
          setLoading(false);
        }
      } else {
        console.error("Brak referencji do kalendarza");
        setLoading(false);
      }
    } catch (error) {
      console.error('Błąd podczas stosowania niestandardowego zakresu dat:', error);
      showError('Wystąpił błąd podczas zmiany zakresu dat: ' + error.message);
      setLoading(false);
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
      const taskData = event.extendedProps.task;
    
      // Przygotowanie danych do aktualizacji
      const updateData = {
        endDate: event.end
      };
      
      // Jeśli rozciąganie od początku jest włączone i zmienił się początek wydarzenia
      if (eventResizableFromStart && info.startDelta && (info.startDelta.days !== 0 || info.startDelta.milliseconds !== 0)) {
        updateData.scheduledDate = event.start;
      }
      
      console.log(`Zmieniono rozmiar zadania: ${taskId}`, updateData);
      
      // Sprawdź czy zadanie jest częścią zamówienia i ma przypisany orderId
      const orderId = taskData.orderId;
      console.log(`Zadanie należy do zamówienia: ${orderId || 'brak'}`);
      
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
      // Pokazujemy loader
      setLoading(true);
      
      const calendarApi = calendarRef.current.getApi();
      
      // Wykonaj akcję nawigacji
      if (action === 'prev') {
        calendarApi.prev();
      } else if (action === 'next') {
        calendarApi.next();
      } else if (action === 'today') {
        calendarApi.today();
      }
      
      // Aktualizuj daty po nawigacji
      setTimeout(() => {
        const viewStart = calendarApi.view.activeStart;
        const viewEnd = calendarApi.view.activeEnd;
        
        // Aktualizuj stan dat
        setStartDate(viewStart);
        setEndDate(viewEnd);
        
        // Pobierz zadania dla nowego zakresu
        fetchTasks({
          startStr: viewStart.toISOString(),
          endStr: viewEnd.toISOString()
        });
        
        setLoading(false);
      }, 100);
    }
  };

  // Aktualizacja tytułu kalendarza na podstawie zakresu dat
  const getCalendarTitle = () => {
    if (calendarRef.current) {
      try {
        const calendarApi = calendarRef.current.getApi();
        
        // Dla widoku Gantt, jeśli mamy niestandardowy zakres dat,
        // zwróć formatowany zakres dat zamiast automatycznego tytułu
        if (view.includes('resourceTimeline') && customDateRange) {
          return `${format(startDate, 'd MMMM yyyy', { locale: pl })} – ${format(endDate, 'd MMMM yyyy', { locale: pl })}`;
        }
        
        return calendarApi.view.title;
      } catch (error) {
        console.error('Błąd podczas pobierania tytułu kalendarza:', error);
        return customDateRange 
          ? `${format(startDate, 'dd.MM.yyyy', { locale: pl })} - ${format(endDate, 'dd.MM.yyyy', { locale: pl })}`
          : '31 mar – 6 kwi 2025';
      }
    } else {
      return customDateRange 
        ? `${format(startDate, 'dd.MM.yyyy', { locale: pl })} - ${format(endDate, 'dd.MM.yyyy', { locale: pl })}`
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

  // Funkcja dostosowująca widok kalendarza do długiego zakresu dat
  const adjustViewForDateRange = (startDate, endDate) => {
    if (!calendarRef.current) return;
    
    try {
      const diffInDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
      let viewToUse = view;
      
      // Wybierz odpowiedni widok na podstawie różnicy w dniach
      if (diffInDays <= 1) {
        viewToUse = 'resourceTimelineDay';
      } else if (diffInDays <= 7) {
        viewToUse = 'resourceTimelineWeek';
      } else {
        viewToUse = 'resourceTimelineMonth'; // Używamy widoku miesięcznego nawet dla dłuższych okresów
      }
      
      // Jeśli widok się zmienił, zaktualizuj stan i widok kalendarza
      if (viewToUse !== view) {
        setGanttView(viewToUse);
        setView(viewToUse);
        
        setTimeout(() => {
          try {
            const calendarApi = calendarRef.current.getApi();
            calendarApi.changeView(viewToUse);
            
            // Ustaw dokładny zakres dat dla widoku - to jest kluczowe dla pokazania całego zakresu
            calendarApi.setOption('visibleRange', {
              start: startDate,
              end: endDate
            });
            
            // Dla widoków z dłuższymi zakresami, dostosuj szerokość slotu
            if (diffInDays > 31) {
              calendarApi.setOption('slotMinWidth', Math.max(40, Math.min(80, Math.floor(1200 / diffInDays))));
            }
            
            // Wymuś renderowanie kalendarza
            calendarApi.updateSize();
            calendarApi.render();
          } catch (error) {
            console.error('Błąd podczas zmiany widoku kalendarza:', error);
          }
        }, 0);
      } else {
        // Nawet jeśli widok się nie zmienił, upewnij się, że zakres dat jest poprawnie ustawiony
        setTimeout(() => {
          try {
            const calendarApi = calendarRef.current.getApi();
            calendarApi.setOption('visibleRange', {
              start: startDate,
              end: endDate
            });
            
            // Wymuś renderowanie kalendarza
            calendarApi.updateSize();
            calendarApi.render();
          } catch (error) {
            console.error('Błąd podczas ustawiania zakresu dat:', error);
          }
        }, 0);
      }
    } catch (error) {
      console.error('Błąd podczas dostosowywania widoku do zakresu dat:', error);
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

  // Dodajemy nową funkcję do bezpiecznego resetowania i ponownego inicjalizacji kalendarza
  const resetCalendar = () => {
    if (!calendarRef.current) return;
    
    try {
      const calendarApi = calendarRef.current.getApi();
      
      // Resetowanie i ponowne renderowanie
      calendarApi.removeAllEvents();
      calendarApi.destroy();
      
      // Wymuszenie restartu całego komponentu kalendarza
      setLoading(true);
      
      setTimeout(() => {
        try {
          // Re-inicjalizacja kalendarza
          calendarApi.render();
          calendarApi.changeView(view);
          calendarApi.gotoDate(startDate);
          
          // Odśwież dane
          fetchTasks({
            startStr: startDate.toISOString(),
            endStr: endDate.toISOString()
          });
        } catch (error) {
          console.error("Błąd podczas ponownej inicjalizacji kalendarza:", error);
        } finally {
          setLoading(false);
        }
      }, 300);
    } catch (error) {
      console.error("Błąd podczas resetowania kalendarza:", error);
      setLoading(false);
    }
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
            Wybierz zakres dat
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
            /* Dostosowania dla widoku z wieloma miesiącami */
            .fc-resource-timeline-divider {
              width: 3px !important;
            }
            
            .fc-col-header-cell {
              text-align: center;
            }
            
            .fc-timeline-slot-frame {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              min-height: 40px;
            }
            
            .fc-scrollgrid-section-header {
              z-index: 10;
            }
            
            .fc-timeline-slot-cushion {
              text-align: center;
              width: 100%;
            }
            
            /* Dodatkowe style dla nagłówków kolumn */
            .fc-timeline-slot.fc-day-sun .fc-timeline-slot-frame,
            .fc-timeline-slot.fc-day-sat .fc-timeline-slot-frame {
              background-color: rgba(0,0,0,0.03);
            }
            
            /* Oznaczenie pierwszego dnia miesiąca */
            .fc-timeline-slot.fc-day-1 .fc-timeline-slot-frame {
              border-left: 2px solid #2196f3;
              background-color: rgba(33, 150, 243, 0.05);
            }
            
            /* Zwiększenie kontrastu między komórkami */
            .fc-timeline-slot {
              border-right: 1px solid #ddd;
            }
            
            /* Poprawka dla nagłówków miesiąca */
            .fc-timeline-slot.fc-day-1 .fc-timeline-slot-cushion,
            .fc-timeline-slot:first-child .fc-timeline-slot-cushion {
              font-weight: bold;
              color: #2196f3;
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
          eventContent={renderEventContent}
          eventClick={handleEventClick}
          dateClick={null}
          selectable={false}
          datesSet={(dateInfo) => {
            console.log("datesSet wywołany:", dateInfo.start, dateInfo.end, "isCustomDateRange:", customDateRange);
            if (!customDateRange) {
              handleDatesSet(dateInfo);
            } else {
              console.log("Ignoruję automatyczną zmianę zakresu - używam customDateRange");
            }
          }}
          locale={plLocale}
          height="100%"
          allDaySlot={true}
          slotMinTime="00:00:00"
          slotMaxTime="23:59:59"
          slotDuration={view === 'resourceTimelineDay' ? { hours: 1 } : { days: 1 }}
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
          eventOverlap={true}
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
          slotEventOverlap={true}
          resourceAreaHeaderContent="Zadania produkcyjne"
          resourcesInitiallyExpanded={true}
          stickyHeaderDates={true}
          stickyResourceAreaHeaderContent={true}
          expandRows={true}
          visibleRange={customDateRange ? {
            start: startDate,
            end: endDate
          } : null}
          duration={customDateRange ? {
            days: Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1
          } : undefined}
          fixedWeekCount={false}
          navLinks={false}
          slotMinWidth={customDateRange && (endDate - startDate) / (1000 * 60 * 60 * 24) > 31 ? 40 : 60}
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
              
              // Dla widoku tygodniowego lub miesięcznego (dni)
              if (view === 'resourceTimelineWeek' || view === 'resourceTimelineMonth') {
                const day = date.getDate();
                const weekday = new Intl.DateTimeFormat('pl', { weekday: 'short' }).format(date);
                const month = new Intl.DateTimeFormat('pl', { month: 'short' }).format(date);
                
                // Dla pierwszego dnia miesiąca lub początku widoku, pokaż nazwę miesiąca
                if (day === 1 || (day <= 3 && args.isLabeled)) {
                  return (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <Typography variant="caption" sx={{ color: 'primary.main', fontWeight: 'bold' }}>
                        {month}
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{day}</Typography>
                      <Typography variant="caption" sx={{ textTransform: 'uppercase' }}>{weekday}</Typography>
                    </Box>
                  );
                }
                
                // Dla pozostałych dni
                return (
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{day}</Typography>
                    <Typography variant="caption" sx={{ textTransform: 'uppercase' }}>{weekday}</Typography>
                  </Box>
                );
              }
            }
            return null;
          }}
          dayCellDidMount={(arg) => {
            // Dodaj oznaczenie miesiąca dla pierwszego dnia miesiąca
            if (arg.date.getDate() === 1) {
              const cellEl = arg.el;
              cellEl.style.borderLeft = '2px solid #2196f3';
              cellEl.style.backgroundColor = 'rgba(33, 150, 243, 0.05)';
            }
          }}
          viewClassNames="custom-timeline-view"
          dayHeaders={true}
          datesAboveResources={true}
          firstDay={1}
          views={{
            timeGridDay: {
              dayHeaderFormat: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
            },
            timeGridWeek: {
              dayHeaderFormat: { weekday: 'short', day: 'numeric', month: 'numeric' }
            },
            dayGridMonth: {
              dayHeaderFormat: { weekday: 'short' }
            },
            resourceTimelineDay: {
              slotDuration: { hours: 1 },
              slotLabelFormat: [
                { hour: '2-digit', minute: '2-digit', hour12: false }
              ],
              visibleRange: customDateRange ? { start: startDate, end: endDate } : null
            },
            resourceTimelineWeek: {
              duration: { days: 7 },
              slotDuration: { days: 1 },
              slotLabelFormat: [
                { weekday: 'short', day: 'numeric', month: 'short' }
              ],
              visibleRange: customDateRange ? { start: startDate, end: endDate } : null
            },
            resourceTimelineMonth: {
              duration: customDateRange 
                ? { days: Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1 } 
                : { days: 30 },
              slotDuration: { days: 1 },
              slotLabelFormat: [
                { day: 'numeric', weekday: 'short' }
              ],
              visibleRange: customDateRange ? { start: startDate, end: endDate } : null
            }
          }}
          dayHeaderClassNames="custom-day-header"
        />
      </Box>
    </Paper>
  );
};

export default ProductionCalendar; 