// src/components/production/ProductionGapAnalysisTab.js
import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  AlertTitle,
  Divider,
  TextField,
  Button,
  FormControlLabel,
  Switch,
  useTheme,
  useMediaQuery,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Tooltip
} from '@mui/material';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import {
  ExpandMore as ExpandMoreIcon,
  Schedule as ScheduleIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  Assessment as AssessmentIcon,
  Timeline as TimelineIcon,
  TrendingUp as TrendingUpIcon
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import plLocale from 'date-fns/locale/pl';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../hooks/useTranslation';
import { useNotification } from '../../hooks/useNotification';
import { analyzeProductionGaps, formatMinutes } from '../../services/productionTimeAnalysisService';

const ProductionGapAnalysisTab = ({ startDate, endDate, isMobile }) => {
  const { t } = useTranslation('production');
  const { showError } = useNotification();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobileView = useMediaQuery(theme.breakpoints.down('sm'));

  const [loading, setLoading] = useState(false);
  const [gapAnalysisStartDate, setGapAnalysisStartDate] = useState(startDate);
  const [gapAnalysisEndDate, setGapAnalysisEndDate] = useState(endDate);
  const [workStartHour, setWorkStartHour] = useState(6);
  const [workEndHour, setWorkEndHour] = useState(22);
  const [includeWeekends, setIncludeWeekends] = useState(false);
  const [minGapMinutes, setMinGapMinutes] = useState(30);
  const [gapAnalysis, setGapAnalysis] = useState(null);
  const [selectedDayExpanded, setSelectedDayExpanded] = useState('');

  // Kolory dla wykresów
  const chartColors = {
    production: '#4caf50',
    gap: '#f44336',
    work: '#2196f3'
  };

  // Funkcja do przeprowadzenia analizy luk
  const performGapAnalysis = async () => {
    try {
      setLoading(true);
      console.log('[ANALIZA LUK TAB] Rozpoczęcie analizy luk');

      const options = {
        workStartHour,
        workEndHour,
        includeWeekends,
        minGapMinutes
      };

      const analysis = await analyzeProductionGaps(
        gapAnalysisStartDate,
        gapAnalysisEndDate,
        options
      );

      setGapAnalysis(analysis);

      console.log('[ANALIZA LUK TAB] Analiza zakończona', {
        gapsCount: analysis.gaps.length,
        totalGapMinutes: analysis.summary.totalGapMinutes,
        coverage: analysis.summary.overallCoverage
      });

    } catch (error) {
      console.error('Błąd podczas analizy luk w produkcji:', error);
      showError('Nie udało się przeprowadzić analizy luk: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Przygotuj dane do wykresu dziennego
  const prepareDailyChartData = () => {
    if (!gapAnalysis?.dailyAnalysis) return [];

    return Object.values(gapAnalysis.dailyAnalysis).map(day => ({
      date: format(new Date(day.date), 'dd.MM'),
      formattedDate: day.formattedDate,
      dayOfWeek: day.dayOfWeek,
      productionMinutes: day.productionMinutes,
      productionHours: Math.round((day.productionMinutes / 60) * 100) / 100,
      gapMinutes: day.gapMinutes,
      gapHours: Math.round((day.gapMinutes / 60) * 100) / 100,
      workMinutes: day.totalWorkMinutes,
      workHours: Math.round((day.totalWorkMinutes / 60) * 100) / 100,
      coverage: day.coverage
    }));
  };

  // Przygotuj dane do wykresu typów luk
  const prepareGapTypesData = () => {
    if (!gapAnalysis?.gaps) return [];

    const gapTypes = {};
    gapAnalysis.gaps.forEach(gap => {
      if (!gapTypes[gap.type]) {
        gapTypes[gap.type] = {
          type: gap.type,
          count: 0,
          totalMinutes: 0
        };
      }
      gapTypes[gap.type].count++;
      gapTypes[gap.type].totalMinutes += gap.gapMinutes;
    });

    return Object.values(gapTypes).map(type => ({
      name: t(`productionReport.timeAnalysis.gapAnalysis.gaps.types.${type.type}`),
      count: type.count,
      minutes: type.totalMinutes,
      hours: Math.round((type.totalMinutes / 60) * 100) / 100
    }));
  };

  // Funkcja do obsługi kliknięcia na zadanie
  const handleTaskClick = (taskId) => {
    if (taskId && gapAnalysis?.tasksMap?.[taskId]) {
      navigate(`/production/tasks/${taskId}`);
    }
  };

  // Funkcja do renderowania informacji o zadaniu
  const renderTaskInfo = (session, label = '') => {
    if (!session?.task) return null;
    
    const task = session.task;
    const isClickable = task.moNumber || task.name;
    
    return (
      <Box sx={{ mt: 1 }}>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Box
          sx={{
            cursor: isClickable ? 'pointer' : 'default',
            p: 0.5,
            borderRadius: 1,
            border: '1px solid',
            borderColor: 'divider',
            backgroundColor: isClickable ? 'action.hover' : 'transparent',
            transition: 'all 0.2s ease',
            '&:hover': isClickable ? {
              backgroundColor: 'primary.light',
              borderColor: 'primary.main',
              transform: 'scale(1.02)'
            } : {}
          }}
          onClick={() => isClickable && handleTaskClick(session.taskId)}
        >
          <Typography 
            variant="body2" 
            fontWeight="bold"
            sx={{
              color: isClickable ? 'primary.main' : 'text.disabled',
              fontSize: '0.75rem'
            }}
          >
            {task.moNumber || task.name || 'Brak MO'}
          </Typography>
          {task.productName && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {task.productName}
            </Typography>
          )}
          {session.quantity && (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Ilość: {session.quantity} {task.unit || 'szt'}
            </Typography>
          )}
        </Box>
      </Box>
    );
  };

  // Funkcja do pobierania ikony zalecenia
  const getRecommendationIcon = (severity) => {
    switch (severity) {
      case 'high':
        return <ErrorIcon color="error" />;
      case 'medium':
        return <WarningIcon color="warning" />;
      case 'low':
        return <InfoIcon color="info" />;
      default:
        return <InfoIcon />;
    }
  };

  const chartData = prepareDailyChartData();
  const gapTypesData = prepareGapTypesData();

  // Przygotuj dane do timeline
  const prepareTimelineData = () => {
    if (!gapAnalysis?.dailyAnalysis) return [];

    return Object.values(gapAnalysis.dailyAnalysis)
      .map(day => {
        return {
          date: day.date,
          formattedDate: day.formattedDate,
          dayOfWeek: day.dayOfWeek,
          workStart: day.workStartTime,
          workEnd: day.workEndTime,
          sessions: day.sessionDetails || [],
          gaps: day.gaps || [],
          workMinutes: day.totalWorkMinutes,
          productionMinutes: day.productionMinutes,
          gapMinutes: day.gapMinutes,
          coverage: day.coverage
        };
      })
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  };

  const timelineData = prepareTimelineData();

  // Komponent Timeline
  const ProductionTimeline = ({ data, workStartHour, workEndHour, isMobileView }) => {
    if (!data || data.length === 0) return null;

    const timelineHeight = isMobileView ? 25 : 32; // jeszcze bardziej zmniejszona wysokość
    const timelineWidth = 800; // szerokość timeline
    const hourWidth = timelineWidth / (workEndHour - workStartHour);

         const getPositionAndWidth = (startHour, endHour, addMargin = true) => {
       const start = Math.max(startHour - workStartHour, 0);
       const end = Math.min(endHour - workStartHour, workEndHour - workStartHour);
       const marginPercent = addMargin ? 0.1 : 0; // Małe marginesy dla lepszej separacji
       const baseWidth = ((end - start) / (workEndHour - workStartHour)) * 100;
       return {
         left: (start / (workEndHour - workStartHour)) * 100 + marginPercent,
         width: Math.max(baseWidth - (marginPercent * 2), 1) // Minimum 1% szerokości
       };
     };

         const formatTime = (date) => {
       return date.toLocaleTimeString('pl-PL', { 
         hour: '2-digit', 
         minute: '2-digit',
         hour12: false 
       });
     };

     // Funkcja do pobierania koloru dla sesji (różne kolory dla nakładających się)
     const getSessionColor = (sessions, currentIndex) => {
       const colors = ['#4caf50', '#2e7d32', '#66bb6a', '#388e3c', '#1b5e20'];
       const currentSession = sessions[currentIndex];
       const currentStart = new Date(currentSession.startTime);
       const currentEnd = new Date(currentSession.endTime);
       
       // Sprawdź ile sesji nakłada się przed tą sesją
       let overlappingCount = 0;
       for (let i = 0; i < currentIndex; i++) {
         const otherSession = sessions[i];
         const otherStart = new Date(otherSession.startTime);
         const otherEnd = new Date(otherSession.endTime);
         
         // Sprawdź czy sesje się nakładają
         if (currentStart < otherEnd && currentEnd > otherStart) {
           overlappingCount++;
         }
       }
       
       return colors[overlappingCount % colors.length];
     };

    return (
      <Box sx={{ mb: 1.5 }}>
        <Typography variant={isMobileView ? "body2" : "subtitle1"} gutterBottom sx={{ mb: 0.5, fontWeight: 'bold' }}>
          {t('productionReport.timeAnalysis.gapAnalysis.timeline.title')}
        </Typography>
        
        {/* Legenda */}
        <Box sx={{ display: 'flex', gap: isMobileView ? 1.5 : 2, mb: 1, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.2 }}>
            <Box sx={{ width: isMobileView ? 8 : 10, height: isMobileView ? 8 : 10, backgroundColor: 'rgba(76, 175, 80, 0.3)', border: '1px solid #4caf50' }} />
            <Typography variant="caption" sx={{ fontSize: isMobileView ? '0.6rem' : '0.65rem' }}>{t('productionReport.timeAnalysis.gapAnalysis.timeline.legend.workTime')}</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.2 }}>
            <Box sx={{ width: isMobileView ? 8 : 10, height: isMobileView ? 8 : 10, backgroundColor: '#4caf50' }} />
            <Typography variant="caption" sx={{ fontSize: isMobileView ? '0.6rem' : '0.65rem' }}>{t('productionReport.timeAnalysis.gapAnalysis.timeline.legend.production')}</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.2 }}>
            <Box sx={{ width: isMobileView ? 8 : 10, height: isMobileView ? 8 : 10, backgroundColor: '#f44336' }} />
            <Typography variant="caption" sx={{ fontSize: isMobileView ? '0.6rem' : '0.65rem' }}>{t('productionReport.timeAnalysis.gapAnalysis.timeline.legend.gaps')}</Typography>
          </Box>
        </Box>

        {/* Skala godzinowa */}
        <Box sx={{ mb: 0.3, position: 'relative', height: isMobileView ? 8 : 12 }}>
          {Array.from({ length: workEndHour - workStartHour + 1 }, (_, i) => workStartHour + i)
            .filter((_, index) => isMobileView ? index % 3 === 0 : index % 2 === 0) // Mniej godzin
            .map(hour => (
            <Box
              key={hour}
              sx={{
                position: 'absolute',
                left: `${(hour - workStartHour) / (workEndHour - workStartHour) * 100}%`,
                transform: 'translateX(-50%)',
                fontSize: isMobileView ? '0.55rem' : '0.6rem',
                color: 'text.secondary'
              }}
            >
              {hour}:00
            </Box>
          ))}
        </Box>

        {/* Timeline dla każdego dnia */}
        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}>
          {(isMobileView ? data.slice(0, 5) : data).map((day, dayIndex) => (
            <Box
              key={day.date}
              sx={{
                borderBottom: dayIndex < data.length - 1 ? '1px solid' : 'none',
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'stretch',
                minHeight: timelineHeight
              }}
            >
              {/* Etykieta dnia */}
              <Box
                sx={{
                  width: isMobileView ? 70 : 90,
                  p: isMobileView ? 0.2 : 0.5,
                  backgroundColor: 'grey.50',
                  borderRight: '1px solid',
                  borderColor: 'divider',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center'
                }}
              >
                <Typography variant="caption" fontWeight="bold" sx={{ fontSize: isMobileView ? '0.6rem' : '0.7rem', lineHeight: 1.1 }}>
                  {isMobileView ? day.formattedDate.substring(0, 5) : day.formattedDate.substring(0, 8)}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: isMobileView ? '0.55rem' : '0.65rem', lineHeight: 1 }}>
                  {isMobileView ? day.dayOfWeek.substring(0, 2) : day.dayOfWeek.substring(0, 3)}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: isMobileView ? '0.55rem' : '0.65rem', lineHeight: 1 }}>
                  {day.coverage}%
                </Typography>
              </Box>

              {/* Timeline wizualny */}
              <Box
                sx={{
                  flex: 1,
                  position: 'relative',
                  backgroundColor: 'grey.100',
                  minHeight: timelineHeight
                }}
              >
                {/* Tło czasu pracy */}
                <Box
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    backgroundColor: 'rgba(76, 175, 80, 0.08)',
                    border: '1px solid rgba(76, 175, 80, 0.2)',
                    borderRadius: 0.3
                  }}
                />

                {/* Wyświetl luki */}
                {day.gaps.map((gap, gapIndex) => {
                  const gapStart = new Date(gap.startTime);
                  const gapEnd = new Date(gap.endTime);
                  const startHour = gapStart.getHours() + gapStart.getMinutes() / 60;
                  const endHour = gapEnd.getHours() + gapEnd.getMinutes() / 60;
                  const { left, width } = getPositionAndWidth(startHour, endHour);

                  return (
                    <Tooltip
                      key={gapIndex}
                      title={
                        <Box>
                          <Typography variant="body2" fontWeight="bold">
                            {t(`productionReport.timeAnalysis.gapAnalysis.gaps.types.${gap.type}`)}
                          </Typography>
                          <Typography variant="caption">
                            {formatTime(gapStart)} - {formatTime(gapEnd)}
                          </Typography>
                          <Typography variant="caption" sx={{ display: 'block' }}>
                            {t('productionReport.timeAnalysis.gapAnalysis.timeline.duration')}: {formatMinutes(gap.gapMinutes)}
                          </Typography>
                          {gap.beforeSession?.task && (
                            <Typography variant="caption" sx={{ display: 'block' }}>
                              Przed: {gap.beforeSession.task.moNumber || gap.beforeSession.task.name}
                            </Typography>
                          )}
                          {gap.afterSession?.task && (
                            <Typography variant="caption" sx={{ display: 'block' }}>
                              Po: {gap.afterSession.task.moNumber || gap.afterSession.task.name}
                            </Typography>
                          )}
                        </Box>
                      }
                    >
                                             <Box
                         sx={{
                           position: 'absolute',
                           top: '25%',
                           left: `${left}%`,
                           width: `${width}%`,
                           height: '50%',
                           backgroundColor: gap.type === 'full_day' ? '#ffeb3b' : '#f44336',
                           cursor: 'pointer',
                           opacity: 0.85,
                           '&:hover': {
                             opacity: 1,
                             transform: 'scale(1.05)',
                             zIndex: 45,
                             boxShadow: gap.type === 'full_day' ? '0 4px 12px rgba(255, 235, 59, 0.6)' : '0 4px 12px rgba(244, 67, 54, 0.6)',
                             outline: '2px solid #fff'
                           },
                           transition: 'all 0.2s ease',
                           border: '1px solid rgba(0,0,0,0.5)',
                           borderRadius: 0.3,
                           zIndex: 8,
                           boxShadow: gap.type === 'full_day' ? '0 2px 6px rgba(255, 235, 59, 0.4)' : '0 2px 6px rgba(244, 67, 54, 0.4)'
                         }}
                        onClick={() => {
                          if (gap.beforeSession?.taskId) {
                            handleTaskClick(gap.beforeSession.taskId);
                          } else if (gap.afterSession?.taskId) {
                            handleTaskClick(gap.afterSession.taskId);
                          } else if (gap.nextSession?.taskId) {
                            handleTaskClick(gap.nextSession.taskId);
                          } else if (gap.previousSession?.taskId) {
                            handleTaskClick(gap.previousSession.taskId);
                          }
                        }}
                      />
                    </Tooltip>
                  );
                })}

                {/* Wyświetl sesje produkcyjne */}
                                 {day.sessions.map((session, sessionIndex) => {
                   const sessionStart = new Date(session.startTime);
                   const sessionEnd = new Date(session.endTime);
                   const startHour = sessionStart.getHours() + sessionStart.getMinutes() / 60;
                   const endHour = sessionEnd.getHours() + sessionEnd.getMinutes() / 60;
                   const { left, width } = getPositionAndWidth(startHour, endHour);

                   const task = gapAnalysis?.tasksMap?.[session.taskId];
                   const sessionColor = getSessionColor(day.sessions, sessionIndex);

                  return (
                    <Tooltip
                      key={sessionIndex}
                      title={
                        <Box>
                          <Typography variant="body2" fontWeight="bold">
                            {task?.moNumber || task?.name || 'Sesja produkcyjna'}
                          </Typography>
                          {task?.productName && (
                            <Typography variant="caption" sx={{ display: 'block' }}>
                              {t('productionReport.timeAnalysis.gapAnalysis.timeline.product')}: {task.productName}
                            </Typography>
                          )}
                          <Typography variant="caption" sx={{ display: 'block' }}>
                            {formatTime(sessionStart)} - {formatTime(sessionEnd)}
                          </Typography>
                          <Typography variant="caption" sx={{ display: 'block' }}>
                            {t('productionReport.timeAnalysis.gapAnalysis.timeline.duration')}: {formatMinutes(session.timeSpent || 0)}
                          </Typography>
                          <Typography variant="caption" sx={{ display: 'block' }}>
                            {t('productionReport.timeAnalysis.gapAnalysis.timeline.quantity')}: {session.quantity} {task?.unit || 'szt'}
                          </Typography>
                        </Box>
                      }
                    >
                       <Box
                         sx={{
                           position: 'absolute',
                           top: '15%',
                           left: `${left}%`,
                           width: `${width}%`,
                           height: '70%',
                           backgroundColor: sessionColor,
                           cursor: 'pointer',
                           opacity: 0.95,
                           '&:hover': {
                             opacity: 1,
                             transform: 'scale(1.05)',
                             zIndex: 50,
                             boxShadow: `0 4px 12px ${sessionColor}60`,
                             outline: '2px solid #fff'
                           },
                           transition: 'all 0.2s ease',
                           border: `1px solid ${sessionColor}`,
                           borderRadius: 0.3,
                           zIndex: 10 + sessionIndex, // Wyższy z-index dla późniejszych sesji
                           boxShadow: `0 2px 6px ${sessionColor}40`,
                           minHeight: '2px' // Minimalna wysokość dla bardzo małych sesji
                         }}
                        onClick={() => handleTaskClick(session.taskId)}
                      >
                        {/* Wyświetl etykietę MO jeśli jest miejsce */}
                        {width > (isMobileView ? 3 : 5) && (
                          <Typography
                            variant="caption"
                            sx={{
                              position: 'absolute',
                              top: '50%',
                              left: '50%',
                              transform: 'translate(-50%, -50%)',
                              color: 'white',
                              fontWeight: 'bold',
                              fontSize: isMobileView ? '0.5rem' : '0.6rem',
                              textAlign: 'center',
                              overflow: 'hidden',
                              whiteSpace: 'nowrap',
                              textOverflow: 'ellipsis',
                              width: '90%',
                              textShadow: '1px 1px 2px rgba(0,0,0,0.8)' // Lepszy kontrast
                            }}
                          >
                            {task?.moNumber || 'MO'}
                          </Typography>
                        )}
                      </Box>
                    </Tooltip>
                  );
                })}
              </Box>
            </Box>
          ))}
        </Box>

        {/* Informacja o ograniczeniu na mobile */}
        {isMobileView && data.length > 5 && (
          <Box sx={{ textAlign: 'center', py: 0.5, backgroundColor: 'info.light', borderRadius: 0.5, mt: 0.5 }}>
            <Typography variant="caption" color="info.dark" sx={{ fontSize: '0.6rem' }}>
              📱 {data.length > 5 ? `Pokazano 5/${data.length} dni` : ''}
            </Typography>
          </Box>
        )}

        {data.every(day => day.gaps.length === 0) && (
          <Box sx={{ textAlign: 'center', py: 0.8, backgroundColor: 'success.light', borderRadius: 0.5, mt: 0.5 }}>
            <Typography variant={isMobileView ? "caption" : "body2"} color="success.dark" sx={{ fontSize: isMobileView ? '0.7rem' : undefined }}>
              ✅ {t('productionReport.timeAnalysis.gapAnalysis.timeline.noGapsInPeriod')}
            </Typography>
          </Box>
        )}
      </Box>
    );
  };

  return (
    <Box sx={{ spacing: 2 }}>
      {/* Panel konfiguracji analizy */}
      <Paper sx={{ p: isMobileView ? 1.5 : 3, mb: 2 }}>
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AssessmentIcon />
          {t('productionReport.timeAnalysis.gapAnalysis.title')}
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {t('productionReport.timeAnalysis.gapAnalysis.description')}
        </Typography>

        <Grid container spacing={2} alignItems="center" sx={{ mt: 1 }}>
          {/* Zakres dat */}
          <Grid item xs={12} sm={6} md={2.4}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={plLocale}>
              <DatePicker
                label={t('reports.startDate')}
                value={gapAnalysisStartDate}
                onChange={(newDate) => setGapAnalysisStartDate(newDate)}
                slotProps={{ 
                  textField: { 
                    fullWidth: true,
                    size: "small"
                  } 
                }}
              />
            </LocalizationProvider>
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={plLocale}>
              <DatePicker
                label={t('reports.endDate')}
                value={gapAnalysisEndDate}
                onChange={(newDate) => setGapAnalysisEndDate(newDate)}
                slotProps={{ 
                  textField: { 
                    fullWidth: true,
                    size: "small"
                  } 
                }}
              />
            </LocalizationProvider>
          </Grid>

          {/* Godziny pracy */}
          <Grid item xs={12} sm={6} md={1.2}>
            <TextField
              label={t('productionReport.timeAnalysis.gapAnalysis.from')}
              type="number"
              value={workStartHour}
              onChange={(e) => setWorkStartHour(parseInt(e.target.value))}
              inputProps={{ min: 0, max: 23 }}
              size="small"
              fullWidth
            />
          </Grid>
          <Grid item xs={12} sm={6} md={1.2}>
            <TextField
              label={t('productionReport.timeAnalysis.gapAnalysis.to')}
              type="number"
              value={workEndHour}
              onChange={(e) => setWorkEndHour(parseInt(e.target.value))}
              inputProps={{ min: 0, max: 23 }}
              size="small"
              fullWidth
            />
          </Grid>

          {/* Minimalna luka */}
          <Grid item xs={12} sm={6} md={1.5}>
            <TextField
              label={t('productionReport.timeAnalysis.gapAnalysis.minGapMinutes')}
              type="number"
              value={minGapMinutes}
              onChange={(e) => setMinGapMinutes(parseInt(e.target.value))}
              inputProps={{ min: 1 }}
              size="small"
              fullWidth
            />
          </Grid>

          {/* Weekendy */}
          <Grid item xs={12} sm={6} md={1.5}>
            <FormControlLabel
              control={
                <Switch
                  checked={includeWeekends}
                  onChange={(e) => setIncludeWeekends(e.target.checked)}
                />
              }
              label={t('productionReport.timeAnalysis.gapAnalysis.includeWeekends')}
              sx={{ minHeight: '40px' }}
            />
          </Grid>

          {/* Przycisk analizy */}
          <Grid item xs={12} sm={6} md={1.2}>
            <Button
              variant="contained"
              onClick={performGapAnalysis}
              disabled={loading}
              startIcon={loading ? <CircularProgress size={20} /> : <TimelineIcon />}
              fullWidth
              size="small"
            >
              {t('productionReport.timeAnalysis.gapAnalysis.analyze')}
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Wyniki analizy */}
      {loading && (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <CircularProgress />
          <Typography variant="h6" sx={{ mt: 2 }}>
            {t('productionReport.timeAnalysis.gapAnalysis.analysisInProgress')}
          </Typography>
        </Paper>
      )}

      {!loading && gapAnalysis && (
        <>
          {/* Podsumowanie */}
          <Paper sx={{ p: isMobileView ? 1.5 : 3, mb: 2 }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TrendingUpIcon />
              {t('productionReport.timeAnalysis.gapAnalysis.summary.title')}
            </Typography>

            <Grid container spacing={2}>
              <Grid item xs={12} md={4}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography color="text.secondary" gutterBottom>
                      {t('productionReport.timeAnalysis.gapAnalysis.summary.period')}
                    </Typography>
                    <Typography variant="h6">
                      {gapAnalysis.period.startDate} - {gapAnalysis.period.endDate}
                    </Typography>
                    <Typography variant="body2">
                      {gapAnalysis.period.totalDays} dni roboczych
                    </Typography>
                    {gapAnalysis.period.limitedToToday && (
                      <Typography variant="caption" color="info.main" sx={{ display: 'block', mt: 0.5 }}>
                        ⚠️ {t('productionReport.timeAnalysis.gapAnalysis.limitedToToday', { originalEndDate: gapAnalysis.period.originalEndDate })}
                      </Typography>
                    )}
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={4}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography color="text.secondary" gutterBottom>
                      {t('productionReport.timeAnalysis.gapAnalysis.summary.coverage')}
                    </Typography>
                    <Typography variant="h4" color={gapAnalysis.summary.overallCoverage > 70 ? 'success.main' : gapAnalysis.summary.overallCoverage > 40 ? 'warning.main' : 'error.main'}>
                      {gapAnalysis.summary.overallCoverage}%
                    </Typography>
                    <Typography variant="body2">
                      pokrycie czasu pracy
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={4}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography color="text.secondary" gutterBottom>
                      {t('productionReport.timeAnalysis.gapAnalysis.summary.gapsFound')}
                    </Typography>
                    <Typography variant="h4" color={gapAnalysis.summary.gapsCount > 0 ? 'warning.main' : 'success.main'}>
                      {gapAnalysis.summary.gapsCount}
                    </Typography>
                    <Typography variant="body2">
                      luk w produkcji
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={3}>
                <Card variant="outlined" sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography color="text.secondary" gutterBottom>
                      {t('productionReport.timeAnalysis.gapAnalysis.summary.totalWorkTime')}
                    </Typography>
                    <Typography variant="h6">
                      {gapAnalysis.summary.totalWorkHours}h
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      ({gapAnalysis.summary.totalWorkMinutes} min)
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={3}>
                <Card variant="outlined" sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography color="text.secondary" gutterBottom>
                      {t('productionReport.timeAnalysis.gapAnalysis.summary.totalProductionTime')}
                    </Typography>
                    <Typography variant="h6" color="success.main">
                      {gapAnalysis.summary.totalProductionHours}h
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      ({gapAnalysis.summary.totalProductionMinutes} min)
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={3}>
                <Card variant="outlined" sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography color="text.secondary" gutterBottom>
                      {t('productionReport.timeAnalysis.gapAnalysis.summary.totalGapTime')}
                    </Typography>
                    <Typography variant="h6" color="error.main">
                      {gapAnalysis.summary.totalGapHours}h
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      ({gapAnalysis.summary.totalGapMinutes} min)
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12} md={3}>
                <Card variant="outlined" sx={{ height: '100%' }}>
                  <CardContent>
                    <Typography color="text.secondary" gutterBottom>
                      Dni z problemami
                    </Typography>
                    <Typography variant="h6" color="warning.main">
                      {gapAnalysis.summary.daysWithGaps}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      dni z lukami
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Paper>

          {/* Timeline produkcji i luk */}
          <Paper sx={{ p: isMobileView ? 1.5 : 3, mb: 2 }}>
            <ProductionTimeline 
              data={timelineData} 
              workStartHour={workStartHour} 
              workEndHour={workEndHour}
              isMobileView={isMobileView}
            />
          </Paper>

          {/* Wykres dzienny */}
          {chartData.length > 0 && (
            <Paper sx={{ p: isMobileView ? 1.5 : 3, mb: 2 }}>
              <Typography variant="h6" gutterBottom>
                {t('productionReport.timeAnalysis.gapAnalysis.dailyAnalysis.title')}
              </Typography>
              <Box sx={{ width: '100%', height: 400 }}>
                <ResponsiveContainer>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis />
                    <ChartTooltip 
                      formatter={(value, name) => [
                        `${Math.round(value * 100) / 100}h`,
                        name === 'productionHours' ? 'Produkcja' : 
                        name === 'gapHours' ? 'Luki' : 'Czas pracy'
                      ]}
                      labelFormatter={(label) => {
                        const dayData = chartData.find(d => d.date === label);
                        return dayData ? `${dayData.formattedDate} (${dayData.dayOfWeek})` : label;
                      }}
                    />
                    <Legend />
                    <Bar 
                      dataKey="workHours" 
                      fill={chartColors.work} 
                      name="Czas pracy"
                      opacity={0.3}
                    />
                    <Bar 
                      dataKey="productionHours" 
                      fill={chartColors.production} 
                      name="Produkcja"
                    />
                    <Bar 
                      dataKey="gapHours" 
                      fill={chartColors.gap} 
                      name="Luki"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </Paper>
          )}

          {/* Typy luk */}
          {gapTypesData.length > 0 && (
            <Paper sx={{ p: isMobileView ? 1.5 : 3, mb: 2 }}>
              <Typography variant="h6" gutterBottom>
                Rodzaje wykrytych luk
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={gapTypesData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, hours }) => `${name}: ${hours}h`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="hours"
                      >
                        {gapTypesData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={['#ff6b6b', '#4ecdc4', '#45b7d1', '#f7dc6f'][index % 4]} />
                        ))}
                      </Pie>
                      <ChartTooltip formatter={(value) => [`${value}h`, 'Czas luk']} />
                    </PieChart>
                  </ResponsiveContainer>
                </Grid>
                <Grid item xs={12} md={6}>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Typ luki</TableCell>
                          <TableCell align="right">Liczba</TableCell>
                          <TableCell align="right">Czas</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {gapTypesData.map((type, index) => (
                          <TableRow key={type.name}>
                            <TableCell>{type.name}</TableCell>
                            <TableCell align="right">{type.count}</TableCell>
                            <TableCell align="right">
                              <Chip
                                label={`${type.hours}h`}
                                size="small"
                                sx={{ 
                                  backgroundColor: ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f7dc6f'][index % 4],
                                  color: 'white'
                                }}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Grid>
              </Grid>
            </Paper>
          )}

          {/* Lista luk */}
          {gapAnalysis.gaps.length > 0 && (
            <Paper sx={{ p: isMobileView ? 1.5 : 3, mb: 2 }}>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <WarningIcon />
                {t('productionReport.timeAnalysis.gapAnalysis.gaps.title')}
              </Typography>

              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('productionReport.timeAnalysis.gapAnalysis.gaps.type')}</TableCell>
                      <TableCell>{t('productionReport.timeAnalysis.gapAnalysis.gaps.date')}</TableCell>
                      <TableCell>{t('productionReport.timeAnalysis.gapAnalysis.gaps.time')}</TableCell>
                      <TableCell>{t('productionReport.timeAnalysis.gapAnalysis.gaps.duration')}</TableCell>
                      <TableCell>{t('productionReport.timeAnalysis.gapAnalysis.gaps.relatedTasks')}</TableCell>
                      <TableCell>{t('productionReport.timeAnalysis.gapAnalysis.gaps.description')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {gapAnalysis.gaps.slice(0, 20).map((gap, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          <Chip
                            label={t(`productionReport.timeAnalysis.gapAnalysis.gaps.types.${gap.type}`)}
                            size="small"
                            color={gap.type === 'full_day' ? 'error' : 'warning'}
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {gap.formattedDate}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {gap.dayOfWeek}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {gap.formattedStartTime} - {gap.formattedEndTime}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={formatMinutes(gap.gapMinutes)}
                            size="small"
                            color={gap.gapMinutes > 120 ? 'error' : gap.gapMinutes > 60 ? 'warning' : 'default'}
                          />
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                            {gap.beforeSession && renderTaskInfo(gap.beforeSession, 'Przed:')}
                            {gap.afterSession && renderTaskInfo(gap.afterSession, 'Po:')}
                            {gap.nextSession && renderTaskInfo(gap.nextSession, 'Następna sesja:')}
                            {gap.previousSession && renderTaskInfo(gap.previousSession, 'Poprzednia sesja:')}
                            {gap.type === 'full_day' && (
                              <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                                Brak sesji produkcyjnych w tym dniu
                              </Typography>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {gap.description}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              {gapAnalysis.gaps.length > 20 && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  Pokazano 20 z {gapAnalysis.gaps.length} luk. Największe luki zostały wyświetlone na górze.
                </Alert>
              )}
            </Paper>
          )}

          {/* Zalecenia */}
          {gapAnalysis.recommendations && gapAnalysis.recommendations.length > 0 && (
            <Paper sx={{ p: isMobileView ? 1.5 : 3, mb: 2 }}>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CheckCircleIcon />
                {t('productionReport.timeAnalysis.gapAnalysis.recommendations.title')}
              </Typography>

              {gapAnalysis.recommendations.map((recommendation, index) => (
                <Accordion key={index}>
                  <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      {getRecommendationIcon(recommendation.severity)}
                      <Box>
                        <Typography variant="subtitle1">
                          {recommendation.title}
                        </Typography>
                        <Chip
                          label={t(`productionReport.timeAnalysis.gapAnalysis.recommendations.severity.${recommendation.severity}`)}
                          size="small"
                          color={recommendation.severity === 'high' ? 'error' : recommendation.severity === 'medium' ? 'warning' : 'info'}
                          variant="outlined"
                        />
                      </Box>
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Typography variant="body2" paragraph>
                      {recommendation.description}
                    </Typography>
                    {recommendation.suggestions && (
                      <List dense>
                        {recommendation.suggestions.map((suggestion, suggestionIndex) => (
                          <ListItem key={suggestionIndex}>
                            <ListItemText
                              primary={suggestion}
                              primaryTypographyProps={{ variant: 'body2' }}
                            />
                          </ListItem>
                        ))}
                      </List>
                    )}
                  </AccordionDetails>
                </Accordion>
              ))}
            </Paper>
          )}

          {/* Brak luk */}
          {gapAnalysis.gaps.length === 0 && (
            <Paper sx={{ p: 3, textAlign: 'center' }}>
              <CheckCircleIcon sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
              <Typography variant="h6" color="success.main" gutterBottom>
                {t('productionReport.timeAnalysis.gapAnalysis.noGapsFound')}
              </Typography>
              <Typography color="text.secondary">
                Produkcja w wybranym okresie nie wykazuje znaczących luk w czasie.
              </Typography>
            </Paper>
          )}
        </>
      )}

      {!loading && !gapAnalysis && (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <ScheduleIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            Kliknij "Analizuj" aby rozpocząć sprawdzanie luk w produkcji
          </Typography>
          <Typography color="text.secondary">
            Analiza sprawdzi ciągłość czasu produkcji w zadanym okresie względem godzin pracy zakładu.
          </Typography>
        </Paper>
      )}
    </Box>
  );
};

export default ProductionGapAnalysisTab;
