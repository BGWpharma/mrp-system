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
  ListItemText
} from '@mui/material';
import {
  CalendarMonth as CalendarIcon,
  ViewDay as DayIcon,
  ViewWeek as WeekIcon,
  ViewModule as MonthIcon,
  Add as AddIcon,
  BarChart as GanttIcon,
  ArrowDropDown as ArrowDropDownIcon
} from '@mui/icons-material';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import timelinePlugin from '@fullcalendar/timeline';
import resourceTimelinePlugin from '@fullcalendar/resource-timeline';
import plLocale from '@fullcalendar/core/locales/pl';
import { getTasksByDateRange } from '../../services/productionService';
import { useNotification } from '../../hooks/useNotification';
import { formatDate } from '../../utils/formatters';

const ProductionCalendar = () => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('dayGridMonth');
  const [ganttView, setGanttView] = useState('resourceTimelineMonth');
  const [ganttMenuAnchor, setGanttMenuAnchor] = useState(null);
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

  const fetchTasks = async (info) => {
    try {
      setLoading(true);
      const startDate = info.startStr;
      const endDate = info.endStr;
      
      console.log('Pobieranie zadań dla zakresu dat:', startDate, '-', endDate);
      const fetchedTasks = await getTasksByDateRange(startDate, endDate);
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

  const getCalendarEvents = () => {
    console.log('Generowanie wydarzeń kalendarza z zadań:', tasks);
    return tasks.map(task => {
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
      
      return {
        id: task.id,
        title: title,
        start: startDate,
        end: endDate,
        backgroundColor: getStatusColor(task.status),
        borderColor: getStatusColor(task.status),
        extendedProps: {
          moNumber: task.moNumber,
          productName: task.productName,
          quantity: task.quantity,
          unit: task.unit,
          status: task.status,
          estimatedDuration: task.estimatedDuration || '',
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
    
    // Dodajemy każde zadanie jako zasób
    tasks.forEach(task => {
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

  return (
    <Paper sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center' }}>
          <CalendarIcon sx={{ mr: 1 }} />
          Kalendarz produkcji
        </Typography>
        
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <ToggleButtonGroup
            value={view.startsWith('resourceTimeline') ? 'gantt' : view}
            exclusive
            onChange={handleViewChange}
            aria-label="widok kalendarza"
            size="small"
            sx={{ mr: 2 }}
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
          
          <Menu
            anchorEl={ganttMenuAnchor}
            open={Boolean(ganttMenuAnchor)}
            onClose={handleGanttMenuClose}
          >
            <MenuItem onClick={() => handleGanttViewChange('resourceTimelineDay')}>
              <ListItemIcon><DayIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Dzień</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => handleGanttViewChange('resourceTimelineWeek')}>
              <ListItemIcon><WeekIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Tydzień</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => handleGanttViewChange('resourceTimelineMonth')}>
              <ListItemIcon><MonthIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Miesiąc</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => handleGanttViewChange('resourceTimelineYear')}>
              <ListItemIcon><CalendarIcon fontSize="small" /></ListItemIcon>
              <ListItemText>Rok</ListItemText>
            </MenuItem>
          </Menu>
          
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
      
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
          <CircularProgress />
        </Box>
      )}
      
      <Box sx={{ height: 'calc(100vh - 250px)', position: 'relative' }}>
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
          datesSet={fetchTasks}
          locale={plLocale}
          height="100%"
          allDaySlot={true}
          slotMinTime="06:00:00"
          slotMaxTime="22:00:00"
          slotDuration="01:00:00"
          businessHours={{
            daysOfWeek: [1, 2, 3, 4, 5], // Poniedziałek - piątek
            startTime: '08:00',
            endTime: '16:00',
          }}
          weekends={true}
          nowIndicator={true}
          schedulerLicenseKey="GPL-My-Project-Is-Open-Source"
        />
      </Box>
    </Paper>
  );
};

export default ProductionCalendar; 