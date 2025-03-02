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
  CircularProgress
} from '@mui/material';
import {
  CalendarMonth as CalendarIcon,
  ViewDay as DayIcon,
  ViewWeek as WeekIcon,
  ViewModule as MonthIcon,
  Add as AddIcon,
  BarChart as GanttIcon
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
      
      const fetchedTasks = await getTasksByDateRange(startDate, endDate);
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
      setView(newView);
    }
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
    return tasks.map(task => {
      // Konwersja Timestamp z Firestore na obiekt Date
      let startDate = task.scheduledDate;
      let endDate = task.endDate || task.scheduledDate;
      
      // Sprawdź, czy mamy do czynienia z obiektem Timestamp z Firestore
      if (startDate && typeof startDate.toDate === 'function') {
        startDate = startDate.toDate();
      }
      
      if (endDate && typeof endDate.toDate === 'function') {
        endDate = endDate.toDate();
      }
      
      // Jeśli endDate jest taki sam jak startDate lub nie jest ustawiony,
      // dodaj 1 godzinę do endDate, aby zadanie było widoczne na wykresie Gantta
      if (!endDate || (endDate && startDate && endDate.getTime() === startDate.getTime())) {
        endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
      }
      
      return {
        id: task.id,
        title: task.name,
        start: startDate,
        end: endDate,
        backgroundColor: getStatusColor(task.status),
        borderColor: getStatusColor(task.status),
        extendedProps: {
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
    // Zbieramy unikalne zadania
    return tasks.map(task => ({
      id: task.id,
      title: task.name // Używamy nazwy zadania jako tytułu zasobu
    }));
  };

  const renderEventContent = (eventInfo) => {
    const duration = eventInfo.event.end 
      ? Math.round((eventInfo.event.end - eventInfo.event.start) / (1000 * 60)) 
      : eventInfo.event.extendedProps.estimatedDuration || '';
    
    const durationText = duration ? `(${duration} min)` : '';
    
    return (
      <Tooltip title={
        <div>
          <Typography variant="subtitle2">{eventInfo.event.title}</Typography>
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

  return (
    <Paper sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center' }}>
          <CalendarIcon sx={{ mr: 1 }} />
          Kalendarz produkcji
        </Typography>
        
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <ToggleButtonGroup
            value={view}
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
            <ToggleButton value="resourceTimelineMonth" aria-label="gantt">
              <Tooltip title="Wykres Gantta">
                <GanttIcon />
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