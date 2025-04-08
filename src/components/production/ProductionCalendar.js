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
  Add as AddIcon,
  BarChart as GanttIcon,
  ArrowDropDown as ArrowDropDownIcon,
  FilterList as FilterListIcon
} from '@mui/icons-material';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import timelinePlugin from '@fullcalendar/timeline';
import resourceTimelinePlugin from '@fullcalendar/resource-timeline';
import plLocale from '@fullcalendar/core/locales/pl';
import { getTasksByDateRange } from '../../services/productionService';
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
  const [workstations, setWorkstations] = useState([]);
  const [useWorkstationColors, setUseWorkstationColors] = useState(false);
  const [selectedWorkstations, setSelectedWorkstations] = useState({});
  const [customDateRange, setCustomDateRange] = useState(false);
  const [startDate, setStartDate] = useState(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState(endOfMonth(new Date()));
  const [dateRangeMenuAnchor, setDateRangeMenuAnchor] = useState(null);
  const [filterMenuAnchor, setFilterMenuAnchor] = useState(null);
  const calendarRef = useRef(null);
  const navigate = useNavigate();
  const { showError } = useNotification();

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
    try {
      setLoading(true);
      const rangeStartDate = customDateRange ? startDate.toISOString() : info.startStr;
      const rangeEndDate = customDateRange ? endDate.toISOString() : info.endStr;
      
      console.log('Pobieranie zadań dla zakresu dat:', rangeStartDate, '-', rangeEndDate);
      const fetchedTasks = await getTasksByDateRange(rangeStartDate, rangeEndDate);
      console.log('Pobrano zadania:', fetchedTasks);
      setTasks(fetchedTasks);
    } catch (error) {
      showError('Błąd podczas pobierania zadań: ' + error.message);
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewChange = (event, newView) => {
    if (newView !== null) {
      // Jeśli wybrano widok Gantta, użyj aktualnie wybranego widoku Gantta
      if (newView === 'gantt') {
        setView(ganttView);
      } else {
        setView(newView);
      }
    }
  };

  const handleGanttMenuClick = (event) => {
    setGanttMenuAnchor(event.currentTarget);
  };

  const handleGanttMenuClose = () => {
    setGanttMenuAnchor(null);
  };

  const handleGanttViewChange = (newGanttView) => {
    setGanttView(newGanttView);
    setView(newGanttView);
    handleGanttMenuClose();
  };

  const handleEventClick = (info) => {
    navigate(`/production/tasks/${info.event.id}`);
  };

  const handleDateClick = (info) => {
    // Można dodać funkcjonalność tworzenia nowego zadania na kliknięty dzień
    navigate(`/production/new-task?date=${info.dateStr}`);
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
    if (useWorkstationColors && task.workstationId && workstations.find(w => w.id === task.workstationId)?.color) {
      return workstations.find(w => w.id === task.workstationId)?.color;
    }
    
    return getStatusColor(task.status);
  };

  const getCalendarEvents = () => {
    console.log('Generowanie wydarzeń kalendarza z zadań:', tasks);
    
    const filteredTasks = tasks.filter(task => {
      if (!task.workstationId) return true;
      return selectedWorkstations[task.workstationId];
    });
    
    return filteredTasks.map(task => {
      // Konwersja Timestamp z Firestore na obiekt Date
      let startDate = task.scheduledDate;
      let endDate = task.endDate || task.scheduledDate;
      
      console.log('Zadanie przed konwersją dat:', task.id, task.name, 'startDate:', startDate, 'endDate:', endDate);
      
      // Sprawdź, czy mamy do czynienia z obiektem Timestamp z Firestore
      if (startDate && typeof startDate.toDate === 'function') {
        startDate = startDate.toDate();
      } else if (typeof startDate === 'string') {
        startDate = new Date(startDate);
      } else if (!startDate) {
        console.warn('Zadanie bez daty rozpoczęcia:', task);
        // Ustawiamy domyślną datę na dziś, aby zadanie było widoczne
        startDate = new Date();
      }
      
      if (endDate && typeof endDate.toDate === 'function') {
        endDate = endDate.toDate();
      } else if (typeof endDate === 'string') {
        endDate = new Date(endDate);
      } else if (!endDate) {
        // Jeśli endDate nie jest ustawiony, użyj startDate
        endDate = new Date(startDate);
      }
      
      // Jeśli endDate jest taki sam jak startDate lub nie jest ustawiony,
      // dodaj 1 godzinę do endDate, aby zadanie było widoczne na wykresie Gantta
      if (!endDate || (endDate && startDate && endDate.getTime() === startDate.getTime())) {
        endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
      }
      
      console.log('Zadanie po konwersji dat:', task.id, task.name, 'startDate:', startDate, 'endDate:', endDate);
      
      // Używamy numeru MO jako tytułu wydarzenia, jeśli jest dostępny
      const title = task.moNumber ? `${task.moNumber} - ${task.productName || ''}` : task.name;
      
      const taskColor = getTaskColor(task);
      
      return {
        id: task.id,
        title: title,
        start: startDate,
        end: endDate,
        backgroundColor: taskColor,
        borderColor: taskColor,
        extendedProps: {
          moNumber: task.moNumber,
          productName: task.productName,
          quantity: task.quantity,
          unit: task.unit,
          status: task.status,
          estimatedDuration: task.estimatedDuration || '',
          workstationId: task.workstationId,
          resourceId: task.id // Używamy ID zadania jako resourceId dla wykresu Gantta
        },
        resourceId: task.id // Dla widoku resourceTimeline - używamy ID zadania
      };
    });
  };

  // Przygotowanie zasobów dla wykresu Gantta
  const getResources = () => {
    // Zbieramy unikalne zadania z użyciem mapy zamiast tablicy, aby uniknąć duplikatów
    const uniqueResources = new Map();
    
    const filteredTasks = tasks.filter(task => {
      if (!task.workstationId) return true;
      return selectedWorkstations[task.workstationId];
    });
    
    // Dodajemy każde zadanie jako zasób
    filteredTasks.forEach(task => {
      if (!uniqueResources.has(task.id)) {
        uniqueResources.set(task.id, {
          id: task.id,
          title: task.moNumber ? `${task.moNumber} - ${task.productName || ''}` : task.name
        });
      }
    });
    
    // Konwertujemy mapę z powrotem na tablicę
    const resources = Array.from(uniqueResources.values());
    
    console.log('Zasoby dla wykresu Gantta:', resources);
    return resources;
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
    
    setStartDate(newStartDate);
    setEndDate(newEndDate);
    setCustomDateRange(true);
    
    if (calendarRef.current) {
      const calendarApi = calendarRef.current.getApi();
      calendarApi.gotoDate(newStartDate);
      
      fetchTasks({
        startStr: newStartDate.toISOString(),
        endStr: newEndDate.toISOString()
      });
    }
    
    handleDateRangeMenuClose();
  };

  const applyCustomDateRange = () => {
    if (calendarRef.current) {
      const calendarApi = calendarRef.current.getApi();
      calendarApi.gotoDate(startDate);
      
      if (view.startsWith('resourceTimeline')) {
        fetchTasks({
          startStr: startDate.toISOString(),
          endStr: endDate.toISOString()
        });
      } else {
        calendarApi.gotoDate(startDate);
      }
    }
    
    setCustomDateRange(true);
    
    handleDateRangeMenuClose();
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center' }}>
          <CalendarIcon sx={{ mr: 1 }} />
          Kalendarz produkcji
        </Typography>
        
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
          <Button
            variant="outlined"
            onClick={handleDateRangeMenuClick}
            sx={{ mr: 1 }}
            startIcon={<CalendarIcon />}
            size="small"
          >
            {customDateRange 
              ? `${format(startDate, 'dd.MM.yyyy')} - ${format(endDate, 'dd.MM.yyyy')}`
              : 'Wybierz zakres dat'}
          </Button>
          
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

          <FormControlLabel
            control={
              <Switch
                checked={useWorkstationColors}
                onChange={(e) => setUseWorkstationColors(e.target.checked)}
                color="primary"
              />
            }
            label="Kolory stanowisk"
            sx={{ mr: 1 }}
          />
          
          <Button
            variant="outlined"
            startIcon={<FilterListIcon />}
            onClick={handleFilterMenuClick}
            sx={{ mr: 1 }}
          >
            Filtruj
          </Button>
          
          <ToggleButtonGroup
            value={view.startsWith('resourceTimeline') ? 'gantt' : view}
            exclusive
            onChange={handleViewChange}
            aria-label="widok kalendarza"
            size="small"
            sx={{ mr: 1 }}
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
          
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => navigate('/production/new-task')}
          >
            Nowe zadanie
          </Button>
        </Box>
      </Box>
      
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
          {useWorkstationColors && workstations.length > 0 ? (
            <>
              <Typography variant="body2" sx={{ mr: 1 }}>
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
              <Typography variant="body2" sx={{ mr: 1 }}>
                Legenda statusów:
              </Typography>
              <Chip size="small" label="Zaplanowane" sx={{ backgroundColor: '#3788d8', color: '#fff' }} />
              <Chip size="small" label="W trakcie" sx={{ backgroundColor: '#f39c12', color: '#fff' }} />
              <Chip size="small" label="Zakończone" sx={{ backgroundColor: '#2ecc71', color: '#fff' }} />
              <Chip size="small" label="Anulowane" sx={{ backgroundColor: '#e74c3c', color: '#fff' }} />
            </>
          )}
        </Box>
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
        overflow: 'hidden'
      }}>
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
          `}
        </style>
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, timelinePlugin, resourceTimelinePlugin]}
          initialView={view}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: ''
          }}
          events={getCalendarEvents()}
          resources={getResources()}
          resourceLabelText="Zadania"
          eventContent={renderEventContent}
          eventClick={handleEventClick}
          dateClick={handleDateClick}
          datesSet={customDateRange ? null : fetchTasks}
          locale={plLocale}
          height="100%"
          allDaySlot={true}
          slotMinTime="06:00:00"
          slotMaxTime="22:00:00"
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
                { month: 'long', day: 'numeric' },
                { hour: '2-digit', minute: '2-digit', hour12: false }
              ],
              slotMinWidth: 100
            },
            resourceTimelineWeek: {
              slotLabelFormat: [
                { weekday: 'short', day: 'numeric' },
                { hour: '2-digit', minute: '2-digit', hour12: false }
              ],
              slotMinWidth: 100
            },
            resourceTimelineMonth: {
              slotLabelFormat: [
                { day: 'numeric' },
                { weekday: 'short' }
              ],
              slotMinWidth: 60
            }
          }}
        />
      </Box>
    </Paper>
  );
};

export default ProductionCalendar; 