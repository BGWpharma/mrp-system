// src/components/production/ProgressReportTab.js
// Wersja z wykresami liniowymi + selekcja zakresu dat (domyślnie rok)

import React, { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  LinearProgress,
  Chip,
  TableSortLabel,
  Grid,
  Card,
  CardContent,
  useTheme,
  ToggleButton,
  ToggleButtonGroup,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  ButtonGroup
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import plLocale from 'date-fns/locale/pl';
import { 
  format, 
  differenceInDays, 
  startOfYear, 
  endOfYear,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  subMonths,
  isWithinInterval
} from 'date-fns';
import {
  CheckCircle as CheckCircleIcon,
  Schedule as ScheduleIcon,
  Warning as WarningIcon,
  ShowChart as ShowChartIcon,
  TableChart as TableChartIcon,
  TrendingUp as TrendingUpIcon,
  CalendarToday as CalendarIcon,
  Timer as TimerIcon
} from '@mui/icons-material';
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Area,
  ComposedChart
} from 'recharts';

const ProgressReportTab = ({ tasks, loading, isMobile }) => {
  const theme = useTheme();
  const [sortConfig, setSortConfig] = useState({ 
    key: 'percentComplete', 
    direction: 'desc' 
  });
  const [viewMode, setViewMode] = useState('table'); // 'table', 'timeline', 'cumulative'
  const [selectedTask, setSelectedTask] = useState('all');
  
  // Domyślnie ustawione na bieżący rok
  const [dateRangeStart, setDateRangeStart] = useState(startOfYear(new Date()));
  const [dateRangeEnd, setDateRangeEnd] = useState(endOfYear(new Date()));

  // Filtrowanie zadań według zakresu dat
  const filteredTasksByDate = useMemo(() => {
    if (!tasks || tasks.length === 0) return [];
    
    return tasks.filter(task => {
      // Konwersja dat zadania
      let taskStartDate = null;
      let taskEndDate = null;
      
      if (task.scheduledDate) {
        if (task.scheduledDate.toDate) {
          taskStartDate = task.scheduledDate.toDate();
        } else if (typeof task.scheduledDate === 'string') {
          taskStartDate = new Date(task.scheduledDate);
        } else if (task.scheduledDate instanceof Date) {
          taskStartDate = task.scheduledDate;
        }
      }
      
      if (task.endDate) {
        if (task.endDate.toDate) {
          taskEndDate = task.endDate.toDate();
        } else if (typeof task.endDate === 'string') {
          taskEndDate = new Date(task.endDate);
        } else if (task.endDate instanceof Date) {
          taskEndDate = task.endDate;
        }
      }
      
      // Sprawdź czy zadanie mieści się w wybranym zakresie
      // Zadanie jest w zakresie jeśli:
      // 1. Rozpoczyna się w zakresie, LUB
      // 2. Kończy się w zakresie, LUB
      // 3. Trwa przez cały zakres (rozpoczyna przed i kończy po)
      
      if (!taskStartDate && !taskEndDate) return false;
      
      const rangeStart = dateRangeStart;
      const rangeEnd = dateRangeEnd;
      
      if (taskStartDate && taskEndDate) {
        // Zadanie ma obie daty
        return (
          isWithinInterval(taskStartDate, { start: rangeStart, end: rangeEnd }) ||
          isWithinInterval(taskEndDate, { start: rangeStart, end: rangeEnd }) ||
          (taskStartDate <= rangeStart && taskEndDate >= rangeEnd)
        );
      } else if (taskStartDate) {
        // Tylko data rozpoczęcia
        return isWithinInterval(taskStartDate, { start: rangeStart, end: rangeEnd });
      } else if (taskEndDate) {
        // Tylko data zakończenia
        return isWithinInterval(taskEndDate, { start: rangeStart, end: rangeEnd });
      }
      
      return false;
    });
  }, [tasks, dateRangeStart, dateRangeEnd]);

  // Przetwarzanie danych zadań z obliczeniem % wykonania i danych czasowych
  const processedTasks = useMemo(() => {
    if (filteredTasksByDate.length === 0) return [];
    
    const tasksWithProgress = filteredTasksByDate.map(task => {
      const plannedQty = parseFloat(task.quantity) || 0;
      const completedQty = parseFloat(task.totalCompletedQuantity) || 0;
      const percentComplete = plannedQty > 0 
        ? Math.min(100, (completedQty / plannedQty) * 100) 
        : 0;
      
      // Dane czasowe
      const timePerUnit = parseFloat(task.productionTimePerUnit) || 0;
      const plannedTotalTime = plannedQty * timePerUnit;
      const actualTotalTime = task.productionSessions?.reduce((sum, s) => sum + (parseFloat(s.timeSpent) || 0), 0) || 0;
      
      // Formatowanie dat
      let scheduledDate = null;
      if (task.scheduledDate) {
        if (task.scheduledDate.toDate) {
          scheduledDate = task.scheduledDate.toDate();
        } else if (typeof task.scheduledDate === 'string') {
          scheduledDate = new Date(task.scheduledDate);
        } else if (task.scheduledDate instanceof Date) {
          scheduledDate = task.scheduledDate;
        }
      }

      let endDate = null;
      if (task.endDate) {
        if (task.endDate.toDate) {
          endDate = task.endDate.toDate();
        } else if (typeof task.endDate === 'string') {
          endDate = new Date(task.endDate);
        } else if (task.endDate instanceof Date) {
          endDate = task.endDate;
        }
      }
      
      return {
        ...task,
        plannedQty,
        completedQty,
        percentComplete,
        timePerUnit,
        plannedTotalTime,
        actualTotalTime,
        scheduledDate,
        endDate,
        sessionCount: task.productionSessions?.length || 0
      };
    });

    // Sortowanie
    tasksWithProgress.sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];
      
      if (sortConfig.key === 'scheduledDate' || sortConfig.key === 'endDate') {
        aVal = aVal ? aVal.getTime() : 0;
        bVal = bVal ? bVal.getTime() : 0;
      }
      
      if (aVal < bVal) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (aVal > bVal) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });

    return tasksWithProgress;
  }, [filteredTasksByDate, sortConfig]);

  // Obliczanie statystyk (w tym czasowych)
  const statistics = useMemo(() => {
    if (processedTasks.length === 0) {
      return {
        totalTasks: 0,
        completedTasks: 0,
        inProgressTasks: 0,
        averageProgress: 0,
        expectedTimeForCompleted: 0,
        totalActualTime: 0,
        averageTimeEfficiency: 0
      };
    }

    const totalTasks = processedTasks.length;
    const completedTasks = processedTasks.filter(t => t.status === 'Zakończone').length;
    const inProgressTasks = processedTasks.filter(t => t.status === 'W trakcie').length;
    const totalProgress = processedTasks.reduce((sum, task) => sum + task.percentComplete, 0);
    const averageProgress = totalProgress / totalTasks;
    
    // Statystyki czasowe - POPRAWIONE
    // Liczymy oczekiwany czas dla WYPRODUKOWANEJ ilości, nie planowanej
    // expectedTimeForCompleted = ile czasu powinno zająć wyprodukowanie tego co już zrobiono
    const expectedTimeForCompleted = processedTasks.reduce((sum, t) => {
      // completedQty * timePerUnit = czas jaki powinno zająć wyprodukowanie wykonanej ilości
      return sum + (t.completedQty * t.timePerUnit);
    }, 0);
    const totalActualTime = processedTasks.reduce((sum, t) => sum + t.actualTotalTime, 0);
    
    // Efektywność: jeśli expectedTime > actualTime → >100% (szybciej niż plan)
    // jeśli expectedTime < actualTime → <100% (wolniej niż plan)
    const averageTimeEfficiency = totalActualTime > 0 ? (expectedTimeForCompleted / totalActualTime) * 100 : 0;

    return {
      totalTasks,
      completedTasks,
      inProgressTasks,
      averageProgress,
      expectedTimeForCompleted,
      totalActualTime,
      averageTimeEfficiency
    };
  }, [processedTasks]);

  // Dane dla wykresu timeline - postęp w czasie dla wszystkich zadań
  const timelineChartData = useMemo(() => {
    const dataByDate = {};
    
    processedTasks.forEach(task => {
      if (!task.scheduledDate || !task.endDate) return;
      
      const startDate = task.scheduledDate;
      const endDate = task.endDate;
      const daysDiff = differenceInDays(endDate, startDate);
      
      for (let i = 0; i <= daysDiff; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(currentDate.getDate() + i);
        const dateKey = format(currentDate, 'yyyy-MM-dd');
        
        if (!dataByDate[dateKey]) {
          dataByDate[dateKey] = {
            date: dateKey,
            plannedProgress: 0,
            actualProgress: 0,
            plannedQuantity: 0,
            actualQuantity: 0,
            taskCount: 0
          };
        }
        
        const plannedPercent = daysDiff > 0 ? (i / daysDiff) * 100 : 100;
        dataByDate[dateKey].plannedProgress += plannedPercent;
        dataByDate[dateKey].plannedQuantity += (task.plannedQty * plannedPercent / 100);
        dataByDate[dateKey].taskCount++;
      }
      
      if (task.productionSessions && task.productionSessions.length > 0) {
        let cumulativeQty = 0;
        
        task.productionSessions.forEach(session => {
          cumulativeQty += session.completedQuantity || 0;
          
          let sessionDate = null;
          if (session.endDate) {
            if (typeof session.endDate === 'string') {
              sessionDate = new Date(session.endDate);
            } else if (session.endDate.toDate) {
              sessionDate = session.endDate.toDate();
            } else if (session.endDate instanceof Date) {
              sessionDate = session.endDate;
            }
          }
          
          if (sessionDate) {
            const dateKey = format(sessionDate, 'yyyy-MM-dd');
            
            if (!dataByDate[dateKey]) {
              dataByDate[dateKey] = {
                date: dateKey,
                plannedProgress: 0,
                actualProgress: 0,
                plannedQuantity: 0,
                actualQuantity: 0,
                taskCount: 0
              };
            }
            
            const actualPercent = task.plannedQty > 0 ? (cumulativeQty / task.plannedQty) * 100 : 0;
            dataByDate[dateKey].actualProgress += actualPercent;
            dataByDate[dateKey].actualQuantity += cumulativeQty;
          }
        });
      }
    });
    
    const sortedData = Object.values(dataByDate)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .map(item => ({
        ...item,
        date: format(new Date(item.date), 'dd.MM'),
        plannedProgress: item.taskCount > 0 ? item.plannedProgress / item.taskCount : 0,
        actualProgress: item.taskCount > 0 ? item.actualProgress / item.taskCount : 0
      }));
    
    return sortedData;
  }, [processedTasks]);

  // Dane dla wykresu skumulowanego
  const cumulativeChartData = useMemo(() => {
    const dataByDate = {};
    
    processedTasks.forEach(task => {
      if (!task.scheduledDate || !task.endDate) return;
      
      const startDate = task.scheduledDate;
      const endDate = task.endDate;
      const daysDiff = differenceInDays(endDate, startDate);
      
      for (let i = 0; i <= daysDiff; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(currentDate.getDate() + i);
        const dateKey = format(currentDate, 'yyyy-MM-dd');
        
        if (!dataByDate[dateKey]) {
          dataByDate[dateKey] = {
            date: dateKey,
            plannedCumulative: 0,
            actualCumulative: 0
          };
        }
        
        const plannedForDay = daysDiff > 0 ? task.plannedQty / (daysDiff + 1) : task.plannedQty;
        dataByDate[dateKey].plannedCumulative += plannedForDay;
      }
      
      if (task.productionSessions && task.productionSessions.length > 0) {
        task.productionSessions.forEach(session => {
          let sessionDate = null;
          if (session.endDate) {
            if (typeof session.endDate === 'string') {
              sessionDate = new Date(session.endDate);
            } else if (session.endDate.toDate) {
              sessionDate = session.endDate.toDate();
            } else if (session.endDate instanceof Date) {
              sessionDate = session.endDate;
            }
          }
          
          if (sessionDate) {
            const dateKey = format(sessionDate, 'yyyy-MM-dd');
            
            if (!dataByDate[dateKey]) {
              dataByDate[dateKey] = {
                date: dateKey,
                plannedCumulative: 0,
                actualCumulative: 0
              };
            }
            
            dataByDate[dateKey].actualCumulative += session.completedQuantity || 0;
          }
        });
      }
    });
    
    const sortedData = Object.entries(dataByDate)
      .sort((a, b) => new Date(a[0]) - new Date(b[0]));
    
    let cumulativePlanned = 0;
    let cumulativeActual = 0;
    
    const result = sortedData.map(([dateKey, data]) => {
      cumulativePlanned += data.plannedCumulative;
      cumulativeActual += data.actualCumulative;
      
      return {
        date: format(new Date(dateKey), 'dd.MM'),
        'Planowana (skumulowana)': Math.round(cumulativePlanned),
        'Wyprodukowana (skumulowana)': Math.round(cumulativeActual)
      };
    });
    
    return result;
  }, [processedTasks]);

  // Dane dla wykresu pojedynczego zadania z analizą czasu
  const singleTaskChartData = useMemo(() => {
    if (selectedTask === 'all') return [];
    
    const task = processedTasks.find(t => t.id === selectedTask);
    if (!task || !task.scheduledDate || !task.endDate) return [];
    
    const dataPoints = {};
    const startDate = task.scheduledDate;
    const endDate = task.endDate;
    const daysDiff = differenceInDays(endDate, startDate);
    const timePerUnit = task.timePerUnit || 0;
    
    // 1. Generowanie planowanej linii bazowej dla %, ilości i CZASU
    for (let i = 0; i <= daysDiff; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.getDate() + i);
      const dateKey = format(currentDate, 'dd.MM');
      
      const plannedPercent = daysDiff > 0 ? (i / daysDiff) * 100 : 100;
      const plannedQty = (task.plannedQty * plannedPercent / 100);
      const plannedTime = plannedQty * timePerUnit; // Planowany czas skumulowany
      
      dataPoints[dateKey] = {
        date: dateKey,
        'Planowany %': parseFloat(plannedPercent.toFixed(1)),
        'Planowana ilość': parseFloat(plannedQty.toFixed(0)),
        'Planowany czas': parseFloat(plannedTime.toFixed(1)),
        'Rzeczywisty %': null,
        'Rzeczywista ilość': null,
        'Rzeczywisty czas': null
      };
    }
    
    // 2. Dodawanie rzeczywistych danych z sesji produkcyjnych
    if (task.productionSessions && task.productionSessions.length > 0) {
      let cumulativeQty = 0;
      let cumulativeTime = 0;
      
      // Sortuj sesje po dacie zakończenia
      const sortedSessions = [...task.productionSessions].sort((a, b) => {
        const dateA = a.endDate?.toDate ? a.endDate.toDate() : new Date(a.endDate);
        const dateB = b.endDate?.toDate ? b.endDate.toDate() : new Date(b.endDate);
        return dateA - dateB;
      });
      
      sortedSessions.forEach(session => {
        cumulativeQty += session.completedQuantity || 0;
        cumulativeTime += parseFloat(session.timeSpent) || 0;
        
        let sessionDate = null;
        if (session.endDate) {
          if (typeof session.endDate === 'string') {
            sessionDate = new Date(session.endDate);
          } else if (session.endDate.toDate) {
            sessionDate = session.endDate.toDate();
          } else if (session.endDate instanceof Date) {
            sessionDate = session.endDate;
          }
        }
        
        if (sessionDate) {
          const dateKey = format(sessionDate, 'dd.MM');
          const actualPercent = task.plannedQty > 0 ? (cumulativeQty / task.plannedQty) * 100 : 0;
          
          if (!dataPoints[dateKey]) {
            dataPoints[dateKey] = {
              date: dateKey,
              'Planowany %': null,
              'Planowana ilość': null,
              'Planowany czas': null,
              'Rzeczywisty %': null,
              'Rzeczywista ilość': null,
              'Rzeczywisty czas': null
            };
          }
          
          dataPoints[dateKey]['Rzeczywisty %'] = parseFloat(actualPercent.toFixed(1));
          dataPoints[dateKey]['Rzeczywista ilość'] = parseFloat(cumulativeQty.toFixed(0));
          dataPoints[dateKey]['Rzeczywisty czas'] = parseFloat(cumulativeTime.toFixed(1));
        }
      });
    }
    
    // 3. Sortowanie i konwersja do tablicy
    const sortedData = Object.values(dataPoints).sort((a, b) => {
      const dateA = new Date(`2024-${a.date.split('.').reverse().join('-')}`);
      const dateB = new Date(`2024-${b.date.split('.').reverse().join('-')}`);
      return dateA - dateB;
    });
    
    return sortedData;
  }, [processedTasks, selectedTask]);

  // Funkcje pomocnicze dla szybkiego wyboru zakresu dat
  const setQuickDateRange = (range) => {
    const now = new Date();
    switch (range) {
      case 'thisYear':
        setDateRangeStart(startOfYear(now));
        setDateRangeEnd(endOfYear(now));
        break;
      case 'lastYear':
        const lastYear = new Date(now.getFullYear() - 1, 0, 1);
        setDateRangeStart(startOfYear(lastYear));
        setDateRangeEnd(endOfYear(lastYear));
        break;
      case 'thisMonth':
        setDateRangeStart(startOfMonth(now));
        setDateRangeEnd(endOfMonth(now));
        break;
      case 'lastMonth':
        const lastMonth = subMonths(now, 1);
        setDateRangeStart(startOfMonth(lastMonth));
        setDateRangeEnd(endOfMonth(lastMonth));
        break;
      case 'thisQuarter':
        setDateRangeStart(startOfQuarter(now));
        setDateRangeEnd(endOfQuarter(now));
        break;
      default:
        break;
    }
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getProgressColor = (percent) => {
    if (percent >= 100) return 'success';
    if (percent >= 75) return 'primary';
    if (percent >= 50) return 'info';
    if (percent >= 25) return 'warning';
    return 'error';
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Zakończone':
        return 'success';
      case 'W trakcie':
        return 'primary';
      case 'Zaplanowane':
        return 'default';
      case 'Wstrzymane':
        return 'warning';
      default:
        return 'default';
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <Typography>Ładowanie danych...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Sekcja wyboru zakresu dat */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Box display="flex" alignItems="center" mb={2}>
          <CalendarIcon sx={{ mr: 1, color: 'primary.main' }} />
          <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
            Zakres dat
          </Typography>
        </Box>
        
        <Grid container spacing={2} alignItems="center">
          {/* Szybki wybór */}
          <Grid item xs={12} md={6}>
            <Typography variant="body2" color="textSecondary" sx={{ mb: 1 }}>
              Szybki wybór:
            </Typography>
            <ButtonGroup size="small" variant="outlined" sx={{ flexWrap: 'wrap' }}>
              <Button onClick={() => setQuickDateRange('thisYear')}>Bieżący rok</Button>
              <Button onClick={() => setQuickDateRange('lastYear')}>Poprzedni rok</Button>
              <Button onClick={() => setQuickDateRange('thisQuarter')}>Bieżący kwartał</Button>
              <Button onClick={() => setQuickDateRange('thisMonth')}>Bieżący miesiąc</Button>
              <Button onClick={() => setQuickDateRange('lastMonth')}>Poprzedni miesiąc</Button>
            </ButtonGroup>
          </Grid>
          
          {/* Ręczny wybór dat */}
          <Grid item xs={12} md={6}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={plLocale}>
              <Box display="flex" gap={2} flexWrap="wrap">
                <DatePicker
                  label="Data od"
                  value={dateRangeStart}
                  onChange={(newValue) => setDateRangeStart(newValue)}
                  slotProps={{ 
                    textField: { 
                      size: 'small',
                      sx: { minWidth: 150 }
                    } 
                  }}
                />
                <DatePicker
                  label="Data do"
                  value={dateRangeEnd}
                  onChange={(newValue) => setDateRangeEnd(newValue)}
                  slotProps={{ 
                    textField: { 
                      size: 'small',
                      sx: { minWidth: 150 }
                    } 
                  }}
                />
              </Box>
            </LocalizationProvider>
          </Grid>
        </Grid>
        
        {/* Info o wybranym zakresie */}
        <Box mt={2}>
          <Chip 
            icon={<CalendarIcon />}
            label={`Wybrany zakres: ${format(dateRangeStart, 'dd.MM.yyyy')} - ${format(dateRangeEnd, 'dd.MM.yyyy')}`}
            color="primary"
            variant="outlined"
          />
          <Chip 
            label={`Znaleziono zadań: ${processedTasks.length}`}
            color="success"
            variant="outlined"
            sx={{ ml: 1 }}
          />
        </Box>
      </Paper>

      {/* Karty ze statystykami */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="body2" color="textSecondary">
                    Wszystkie zadania
                  </Typography>
                  <Typography variant="h4">
                    {statistics.totalTasks}
                  </Typography>
                </Box>
                <ScheduleIcon color="primary" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="body2" color="textSecondary">
                    Zakończone
                  </Typography>
                  <Typography variant="h4" color="success.main">
                    {statistics.completedTasks}
                  </Typography>
                </Box>
                <CheckCircleIcon color="success" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="body2" color="textSecondary">
                    W trakcie
                  </Typography>
                  <Typography variant="h4" color="primary.main">
                    {statistics.inProgressTasks}
                  </Typography>
                </Box>
                <WarningIcon color="primary" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="body2" color="textSecondary">
                    Średni postęp
                  </Typography>
                  <Typography variant="h4">
                    {statistics.averageProgress.toFixed(1)}%
                  </Typography>
                </Box>
                <Box sx={{ width: 40, height: 40 }}>
                  <LinearProgress 
                    variant="determinate" 
                    value={statistics.averageProgress} 
                    sx={{ height: 8, borderRadius: 4 }}
                  />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Karta efektywności czasowej - pokazuj tylko gdy są dane rzeczywiste */}
      {statistics.totalActualTime > 0 && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6} md={4}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                  <Box>
                    <Typography variant="body2" color="textSecondary">
                      Efektywność czasowa
                    </Typography>
                    <Typography 
                      variant="h4" 
                      color={statistics.averageTimeEfficiency >= 100 ? "success.main" : "warning.main"}
                    >
                      {statistics.averageTimeEfficiency.toFixed(1)}%
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      Oczek: {(statistics.expectedTimeForCompleted / 60).toFixed(1)}h / Rzecz: {(statistics.totalActualTime / 60).toFixed(1)}h
                    </Typography>
                    <Typography variant="caption" display="block" color="textSecondary" sx={{ mt: 0.5 }}>
                      {statistics.averageTimeEfficiency >= 100 
                        ? '✓ Produkcja szybsza niż plan' 
                        : '⚠ Produkcja wolniejsza niż plan'}
                    </Typography>
                  </Box>
                  <TimerIcon color="primary" sx={{ fontSize: 40 }} />
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {processedTasks.length === 0 ? (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
          <Typography variant="h6" color="textSecondary">
            Brak zadań produkcyjnych w wybranym okresie
          </Typography>
        </Box>
      ) : (
        <>
          {/* Przełącznik widoku */}
          <Box sx={{ mb: 2, display: 'flex', justifyContent: 'center', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <ToggleButtonGroup
              value={viewMode}
              exclusive
              onChange={(e, newMode) => newMode && setViewMode(newMode)}
              aria-label="widok danych"
              size={isMobile ? "small" : "medium"}
            >
              <ToggleButton value="table" aria-label="tabela">
                <TableChartIcon sx={{ mr: 1 }} />
                Tabela
              </ToggleButton>
              <ToggleButton value="timeline" aria-label="wykres timeline">
                <ShowChartIcon sx={{ mr: 1 }} />
                Postęp w czasie
              </ToggleButton>
              <ToggleButton value="cumulative" aria-label="wykres skumulowany">
                <TrendingUpIcon sx={{ mr: 1 }} />
                Produkcja skumulowana
              </ToggleButton>
            </ToggleButtonGroup>

            {/* Selektor zadania dla widoku pojedynczego */}
            {(viewMode === 'timeline') && (
              <FormControl sx={{ minWidth: 300 }} size="small">
                <InputLabel>Wybierz zadanie (opcjonalnie)</InputLabel>
                <Select
                  value={selectedTask}
                  label="Wybierz zadanie (opcjonalnie)"
                  onChange={(e) => setSelectedTask(e.target.value)}
                >
                  <MenuItem value="all">Wszystkie zadania (agregat)</MenuItem>
                  {processedTasks.map(task => (
                    <MenuItem key={task.id} value={task.id}>
                      {task.moNumber} - {task.productName}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </Box>

          {/* Widok tabelaryczny */}
          {viewMode === 'table' && (
            <TableContainer component={Paper} sx={{ overflowX: 'auto' }}>
              <Table size={isMobile ? "small" : "medium"}>
                <TableHead>
                  <TableRow sx={{ backgroundColor: theme.palette.grey[100] }}>
                    <TableCell>
                      <TableSortLabel
                        active={sortConfig.key === 'moNumber'}
                        direction={sortConfig.direction}
                        onClick={() => handleSort('moNumber')}
                      >
                        Numer MO
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>
                      <TableSortLabel
                        active={sortConfig.key === 'productName'}
                        direction={sortConfig.direction}
                        onClick={() => handleSort('productName')}
                      >
                        Produkt
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="right">
                      <TableSortLabel
                        active={sortConfig.key === 'plannedQty'}
                        direction={sortConfig.direction}
                        onClick={() => handleSort('plannedQty')}
                      >
                        Planowana
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="right">
                      <TableSortLabel
                        active={sortConfig.key === 'completedQty'}
                        direction={sortConfig.direction}
                        onClick={() => handleSort('completedQty')}
                      >
                        Wyprodukowana
                      </TableSortLabel>
                    </TableCell>
                    <TableCell sx={{ minWidth: 200 }}>
                      <TableSortLabel
                        active={sortConfig.key === 'percentComplete'}
                        direction={sortConfig.direction}
                        onClick={() => handleSort('percentComplete')}
                      >
                        % Wykonania
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>
                      <TableSortLabel
                        active={sortConfig.key === 'status'}
                        direction={sortConfig.direction}
                        onClick={() => handleSort('status')}
                      >
                        Status
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>
                      <TableSortLabel
                        active={sortConfig.key === 'scheduledDate'}
                        direction={sortConfig.direction}
                        onClick={() => handleSort('scheduledDate')}
                      >
                        Data Plan. Rozp.
                      </TableSortLabel>
                    </TableCell>
                    <TableCell>
                      <TableSortLabel
                        active={sortConfig.key === 'endDate'}
                        direction={sortConfig.direction}
                        onClick={() => handleSort('endDate')}
                      >
                        Data Plan. Zak.
                      </TableSortLabel>
                    </TableCell>
                    <TableCell align="center">Sesje</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {processedTasks.map(task => (
                    <TableRow 
                      key={task.id} 
                      hover
                      sx={{ 
                        '&:hover': { 
                          backgroundColor: theme.palette.action.hover 
                        } 
                      }}
                    >
                      <TableCell sx={{ fontWeight: 'medium', fontFamily: 'monospace' }}>
                        {task.moNumber}
                      </TableCell>
                      <TableCell>{task.productName}</TableCell>
                      <TableCell align="right">
                        {task.plannedQty.toLocaleString('pl-PL')} {task.unit}
                      </TableCell>
                      <TableCell align="right">
                        {task.completedQty.toLocaleString('pl-PL')} {task.unit}
                      </TableCell>
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={1}>
                          <Box flexGrow={1}>
                            <LinearProgress 
                              variant="determinate" 
                              value={Math.min(100, task.percentComplete)} 
                              color={getProgressColor(task.percentComplete)}
                              sx={{ height: 8, borderRadius: 4 }}
                            />
                          </Box>
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              minWidth: 45, 
                              fontWeight: 'bold',
                              color: task.percentComplete >= 100 
                                ? theme.palette.success.main 
                                : theme.palette.text.primary
                            }}
                          >
                            {task.percentComplete.toFixed(1)}%
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={task.status} 
                          size="small" 
                          color={getStatusColor(task.status)}
                        />
                      </TableCell>
                      <TableCell>
                        {task.scheduledDate 
                          ? format(task.scheduledDate, 'dd.MM.yyyy HH:mm') 
                          : '-'}
                      </TableCell>
                      <TableCell>
                        {task.endDate 
                          ? format(task.endDate, 'dd.MM.yyyy HH:mm') 
                          : '-'}
                      </TableCell>
                      <TableCell align="center">
                        <Chip 
                          label={task.sessionCount} 
                          size="small" 
                          variant="outlined"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          {/* Widok wykresu timeline */}
          {viewMode === 'timeline' && (
            <Paper sx={{ p: 3 }}>
              <Box display="flex" alignItems="center" mb={3}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 40,
                    height: 40,
                    borderRadius: 1,
                    backgroundColor: `${theme.palette.primary.main}15`,
                    mr: 1.5
                  }}
                >
                  <ShowChartIcon sx={{ color: 'primary.main', fontSize: 24 }} />
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                  {selectedTask === 'all' 
                    ? 'Postęp produkcji w czasie - wszystkie zadania (średnia)'
                    : `Analiza postępu, ilości i czasu - ${processedTasks.find(t => t.id === selectedTask)?.moNumber || ''}`
                  }
                </Typography>
              </Box>

              {selectedTask === 'all' ? (
                <ResponsiveContainer width="100%" height={400}>
                  <ComposedChart data={timelineChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis 
                      label={{ value: '% Wykonania', angle: -90, position: 'insideLeft' }}
                      domain={[0, 100]}
                    />
                    <Tooltip 
                      formatter={(value) => `${parseFloat(value).toFixed(1)}%`}
                    />
                    <Legend />
                    <ReferenceLine y={100} stroke="red" strokeDasharray="3 3" label="Cel: 100%" />
                    <Line 
                      type="monotone" 
                      dataKey="plannedProgress" 
                      stroke={theme.palette.warning.main}
                      strokeWidth={2}
                      name="Planowany postęp"
                      dot={false}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="actualProgress" 
                      stroke={theme.palette.success.main}
                      strokeWidth={3}
                      name="Rzeczywisty postęp"
                      dot={{ r: 4 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height={450}>
                  <ComposedChart data={singleTaskChartData} margin={{ top: 20, right: 80, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    
                    {/* Oś Y 1: Procenty (lewa) */}
                    <YAxis 
                      yAxisId="left"
                      label={{ value: '% Wykonania', angle: -90, position: 'insideLeft' }}
                      domain={[0, 'dataMax + 10']}
                    />
                    
                    {/* Oś Y 2: Ilość (prawa) */}
                    <YAxis 
                      yAxisId="right"
                      orientation="right"
                      label={{ value: 'Ilość (szt.)', angle: 90, position: 'insideRight' }}
                    />
                    
                    {/* Oś Y 3: Czas (prawa, przesunięta) */}
                    <YAxis 
                      yAxisId="time"
                      orientation="right"
                      domain={[0, 'dataMax + 20']}
                      label={{ value: 'Czas (min)', angle: 90, position: 'outside', dx: 35 }}
                      axisLine={{ stroke: '#ff7300' }}
                      tickLine={{ stroke: '#ff7300' }}
                      tick={{ fill: '#ff7300' }}
                    />
                    
                    <Tooltip 
                      formatter={(value, name) => {
                        if (value === null) return ['-', name];
                        const unit = name.includes('%') ? '%' : name.includes('ilość') ? ' szt.' : ' min';
                        return [`${parseFloat(value).toFixed(1)}${unit}`, name];
                      }}
                    />
                    <Legend />
                    <ReferenceLine y={100} stroke="red" strokeDasharray="3 3" label="Cel: 100%" yAxisId="left" />
                    
                    {/* Linie dla osi % */}
                    <Line 
                      yAxisId="left"
                      type="monotone" 
                      dataKey="Planowany %" 
                      stroke={theme.palette.warning.main}
                      strokeWidth={2}
                      dot={false}
                      connectNulls
                    />
                    <Line 
                      yAxisId="left"
                      type="monotone" 
                      dataKey="Rzeczywisty %" 
                      stroke={theme.palette.success.main}
                      strokeWidth={3}
                      dot={{ r: 5 }}
                      connectNulls
                    />
                    
                    {/* Linie dla osi Ilość */}
                    <Line 
                      yAxisId="right"
                      type="monotone" 
                      dataKey="Planowana ilość" 
                      stroke={theme.palette.info.main}
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                      connectNulls
                    />
                    <Line 
                      yAxisId="right"
                      type="monotone" 
                      dataKey="Rzeczywista ilość" 
                      stroke={theme.palette.primary.main}
                      strokeWidth={2}
                      dot={{ r: 4 }}
                      connectNulls
                    />
                    
                    {/* NOWE LINIE: Linie dla osi Czas */}
                    <Line 
                      yAxisId="time"
                      type="monotone" 
                      dataKey="Planowany czas" 
                      stroke="#ff7300"
                      strokeWidth={2}
                      strokeDasharray="3 3"
                      dot={false}
                      connectNulls
                      name="Planowany czas"
                    />
                    <Line 
                      yAxisId="time"
                      type="monotone" 
                      dataKey="Rzeczywisty czas" 
                      stroke="#82ca9d"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                      name="Rzeczywisty czas"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </Paper>
          )}

          {/* Widok wykresu skumulowanego */}
          {viewMode === 'cumulative' && (
            <Paper sx={{ p: 3 }}>
              <Box display="flex" alignItems="center" mb={3}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 40,
                    height: 40,
                    borderRadius: 1,
                    backgroundColor: `${theme.palette.success.main}15`,
                    mr: 1.5
                  }}
                >
                  <TrendingUpIcon sx={{ color: 'success.main', fontSize: 24 }} />
                </Box>
                <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                  Skumulowana produkcja w czasie
                </Typography>
              </Box>

              <ResponsiveContainer width="100%" height={400}>
                <ComposedChart data={cumulativeChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis 
                    label={{ value: 'Ilość skumulowana', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip 
                    formatter={(value) => `${parseFloat(value).toLocaleString('pl-PL')} szt.`}
                  />
                  <Legend />
                  <Area 
                    type="monotone" 
                    dataKey="Planowana (skumulowana)" 
                    fill={theme.palette.warning.light}
                    stroke={theme.palette.warning.main}
                    fillOpacity={0.3}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="Wyprodukowana (skumulowana)" 
                    stroke={theme.palette.success.main}
                    strokeWidth={3}
                    dot={{ r: 4 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </Paper>
          )}
        </>
      )}
    </Box>
  );
};

export default ProgressReportTab;
