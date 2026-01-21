// src/components/production/ProductionTimeAnalysisTab.js
import React, { useState, useEffect, useMemo } from 'react';
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
  Divider,
  useTheme,
  useMediaQuery,
  Tabs,
  Tab
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from 'recharts';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import plLocale from 'date-fns/locale/pl';
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import {
  AccessTime as TimeIcon,
  Assignment as TaskIcon,
  TrendingUp as TrendIcon,
  Assessment as AnalysisIcon,
  Timeline as TimelineIcon,
  CalendarToday as WeeklyIcon,
  BarChart as BarChartIcon,
  PieChart as PieChartIcon
} from '@mui/icons-material';
import { useTranslation } from '../../hooks/useTranslation';
import { useNotification } from '../../hooks/useNotification';
import {
  getProductionHistoryByDateRange,
  analyzeProductionTime,
  getTasksForTimeAnalysis,
  enrichTasksWithProductWeights,
  formatMinutes
} from '../../services/productionTimeAnalysisService';
import { getRecipeById } from '../../services/recipeService';
import ProductionGapAnalysisTab from './ProductionGapAnalysisTab';
import WeeklyProductivityTab from './WeeklyProductivityTab';

const ProductionTimeAnalysisTab = ({ startDate, endDate, customers, isMobile }) => {
  const { t } = useTranslation('production');
  const { showError } = useNotification();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobileView = useMediaQuery(theme.breakpoints.down('sm'));

  const [selectedTab, setSelectedTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [timeAnalysisStartDate, setTimeAnalysisStartDate] = useState(startDate);
  const [timeAnalysisEndDate, setTimeAnalysisEndDate] = useState(endDate);
  const [productionHistory, setProductionHistory] = useState([]);
  const [timeAnalysis, setTimeAnalysis] = useState(null);
  const [tasksMap, setTasksMap] = useState({});
  const [recipesMap, setRecipesMap] = useState({});
  const [selectedTask, setSelectedTask] = useState('all');
  const [selectedCustomer, setSelectedCustomer] = useState('all');
  const [chartType, setChartType] = useState('daily');

  // Kolory dla wykresów
  const chartColors = [
    '#8884d8', '#82ca9d', '#ffc658', '#ff7300', 
    '#00ff00', '#0088fe', '#00c49f', '#ffbb28'
  ];

  // Funkcja do pobierania i analizy danych
  const fetchTimeAnalysisData = async () => {
    try {
      setLoading(true);
      console.log('[ANALIZA CZASU TAB] Pobieranie danych analizy czasu');

      // Pobierz historię produkcji
      const history = await getProductionHistoryByDateRange(
        timeAnalysisStartDate, 
        timeAnalysisEndDate
      );
      
      setProductionHistory(history);

      // Analizuj czas produkcji
      const analysis = analyzeProductionTime(history);
      setTimeAnalysis(analysis);

      // Pobierz zadania dla analizy
      const taskIds = Object.keys(analysis.sessionsByTask);
      let tasks = {};
      if (taskIds.length > 0) {
        tasks = await getTasksForTimeAnalysis(taskIds);
        
        // Wzbogać zadania o wagi produktów końcowych
        tasks = await enrichTasksWithProductWeights(tasks);
        
        setTasksMap(tasks);
        
        // Pobierz receptury dla zadań, które mają recipeId
        const recipeIds = [...new Set(Object.values(tasks)
          .map(task => task.recipeId)
          .filter(Boolean))];
        
        if (recipeIds.length > 0) {
          console.log('[ANALIZA CZASU TAB] Pobieranie receptur dla', recipeIds.length, 'zadań');
          const recipes = {};
          for (const recipeId of recipeIds) {
            try {
              const recipe = await getRecipeById(recipeId);
              if (recipe) {
                recipes[recipeId] = recipe;
              }
            } catch (err) {
              console.warn(`Nie udało się pobrać receptury ${recipeId}:`, err);
            }
          }
          setRecipesMap(recipes);
          console.log('[ANALIZA CZASU TAB] Pobrano', Object.keys(recipes).length, 'receptur');
        }
      } else {
        setTasksMap({});
        setRecipesMap({});
      }

      console.log('[ANALIZA CZASU TAB] Analiza zakończona', {
        sessionsCount: history.length,
        totalTime: analysis.totalTimeMinutes,
        tasksCount: taskIds.length
      });

    } catch (error) {
      console.error('Błąd podczas pobierania danych analizy czasu:', error);
      showError('Nie udało się pobrać danych analizy czasu: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Załaduj dane przy montowaniu komponentu i zmianie dat
  useEffect(() => {
    if (selectedTab === 0 || selectedTab === 1) { // Dla zakładki analizy czasu i tygodniówek
      fetchTimeAnalysisData();
    }
  }, [timeAnalysisStartDate, timeAnalysisEndDate, selectedTab]);

  // Przygotuj dane do wykresów
  const chartData = useMemo(() => {
    if (!timeAnalysis) return [];

    switch (chartType) {
      case 'daily':
        return Object.values(timeAnalysis.timeByDay)
          .map(day => ({
            period: format(parseISO(day.date), 'dd.MM'),
            time: day.totalTime,
            timeHours: Math.round((day.totalTime / 60) * 100) / 100,
            sessions: day.sessionsCount,
            quantity: day.totalQuantity
          }))
          .sort((a, b) => a.period.localeCompare(b.period));

      case 'weekly':
        return Object.values(timeAnalysis.timeByWeek)
          .map(week => ({
            period: week.week,
            time: week.totalTime,
            timeHours: Math.round((week.totalTime / 60) * 100) / 100,
            sessions: week.sessionsCount,
            quantity: week.totalQuantity
          }))
          .sort((a, b) => a.period.localeCompare(b.period));

      case 'monthly':
        return Object.values(timeAnalysis.timeByMonth)
          .map(month => ({
            period: format(new Date(month.month + '-01'), 'MM.yyyy'),
            time: month.totalTime,
            timeHours: Math.round((month.totalTime / 60) * 100) / 100,
            sessions: month.sessionsCount,
            quantity: month.totalQuantity
          }))
          .sort((a, b) => a.period.localeCompare(b.period));

      default:
        return [];
    }
  }, [timeAnalysis, chartType]);

  // Przygotuj dane dla wykresu kołowego zadań
  const tasksPieData = useMemo(() => {
    if (!timeAnalysis || !tasksMap) return [];

    return Object.values(timeAnalysis.sessionsByTask)
      .map((taskData, index) => {
        const task = tasksMap[taskData.taskId];
        const displayName = task?.moNumber ? 
          `${task.moNumber}` :
          `${task?.name || task?.productName || t('productionReport.timeAnalysis.noTaskSelected')}`;
        
        return {
          name: displayName,
          value: taskData.totalTime,
          valueHours: Math.round((taskData.totalTime / 60) * 100) / 100,
          sessions: taskData.sessionsCount,
          quantity: taskData.totalQuantity,
          color: chartColors[index % chartColors.length]
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 8); // Pokaż tylko top 8 zadań
  }, [timeAnalysis, tasksMap, t]);

  // Filtruj sesje według wybranego zadania i klienta
  const filteredSessions = useMemo(() => {
    let filtered = timeAnalysis?.sessions || [];
    
    // Filtruj według zadania
    if (selectedTask !== 'all') {
      filtered = filtered.filter(session => session.taskId === selectedTask);
    }
    
    // Filtruj według klienta
    if (selectedCustomer !== 'all') {
      filtered = filtered.filter(session => {
        const task = tasksMap[session.taskId];
        return task && (task.customerId === selectedCustomer || task.clientId === selectedCustomer);
      });
    }
    
    return filtered;
  }, [timeAnalysis, selectedTask, selectedCustomer, tasksMap]);

  // Przelicz statystyki na podstawie przefiltrowanych sesji
  const filteredAnalysis = useMemo(() => {
    if (!filteredSessions || filteredSessions.length === 0) {
      return {
        totalSessions: 0,
        totalTimeMinutes: 0,
        totalTimeHours: 0,
        totalQuantity: 0,
        averageTimePerSession: 0,
        averageTimePerUnit: 0
      };
    }

    const totalTimeMinutes = filteredSessions.reduce((sum, session) => sum + (session.timeSpent || 0), 0);
    const totalQuantity = filteredSessions.reduce((sum, session) => sum + (session.quantity || 0), 0);
    const totalSessions = filteredSessions.length;

    return {
      totalSessions,
      totalTimeMinutes,
      totalTimeHours: Math.round((totalTimeMinutes / 60) * 100) / 100,
      totalQuantity,
      averageTimePerSession: totalSessions > 0 ? Math.round((totalTimeMinutes / totalSessions) * 100) / 100 : 0,
      averageTimePerUnit: totalQuantity > 0 ? Math.round((totalTimeMinutes / totalQuantity) * 100) / 100 : 0
    };
  }, [filteredSessions]);

  // Handler dla zmiany zakładki
  const handleTabChange = (event, newValue) => {
    setSelectedTab(newValue);
  };

  if (loading && selectedTab === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ width: '100%' }}>
      {/* Nawigacja zakładek */}
      <Paper sx={{ mb: 2 }}>
        <Tabs 
          value={selectedTab} 
          onChange={handleTabChange}
          variant={isMobileView ? "scrollable" : "standard"}
          scrollButtons="auto"
          sx={{ borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab 
            icon={<TrendIcon />} 
            label={t('productionReport.tabs.timeAnalysis')} 
            iconPosition="start"
            sx={{ minHeight: 48 }}
          />
          <Tab 
            icon={<WeeklyIcon />} 
            label={t('productionReport.tabs.weeklyProductivity')} 
            iconPosition="start"
            sx={{ minHeight: 48 }}
          />
          <Tab 
            icon={<TimelineIcon />} 
            label={t('productionReport.tabs.gapAnalysis')} 
            iconPosition="start"
            sx={{ minHeight: 48 }}
          />
        </Tabs>
      </Paper>

      {/* Zawartość zakładek */}
      {selectedTab === 0 && (
        <TimeAnalysisContent 
          timeAnalysis={timeAnalysis}
          filteredAnalysis={filteredAnalysis}
          filteredSessions={filteredSessions}
          tasksMap={tasksMap}
          recipesMap={recipesMap}
          chartData={chartData}
          tasksPieData={tasksPieData}
          chartColors={chartColors}
          chartType={chartType}
          setChartType={setChartType}
          selectedTask={selectedTask}
          setSelectedTask={setSelectedTask}
          selectedCustomer={selectedCustomer}
          setSelectedCustomer={setSelectedCustomer}
          timeAnalysisStartDate={timeAnalysisStartDate}
          setTimeAnalysisStartDate={setTimeAnalysisStartDate}
          timeAnalysisEndDate={timeAnalysisEndDate}
          setTimeAnalysisEndDate={setTimeAnalysisEndDate}
          customers={customers}
          navigate={navigate}
          isMobileView={isMobileView}
          showError={showError}
          t={t}
        />
      )}

      {selectedTab === 1 && (
        <WeeklyProductivityTab
          timeAnalysis={timeAnalysis}
          tasksMap={tasksMap}
          isMobileView={isMobileView}
          startDate={timeAnalysisStartDate}
          endDate={timeAnalysisEndDate}
          onDateChange={(newStartDate, newEndDate) => {
            setTimeAnalysisStartDate(newStartDate);
            setTimeAnalysisEndDate(newEndDate);
          }}
        />
      )}

      {selectedTab === 2 && (
        <ProductionGapAnalysisTab
          startDate={startDate}
          endDate={endDate}
          isMobile={isMobile}
        />
      )}
    </Box>
  );
};

// Komponent zawartości analizy czasu (wydzielony dla przejrzystości)
const TimeAnalysisContent = ({
  timeAnalysis,
  filteredAnalysis,
  filteredSessions,
  tasksMap,
  recipesMap,
  chartData,
  tasksPieData,
  chartColors,
  chartType,
  setChartType,
  selectedTask,
  setSelectedTask,
  selectedCustomer,
  setSelectedCustomer,
  timeAnalysisStartDate,
  setTimeAnalysisStartDate,
  timeAnalysisEndDate,
  setTimeAnalysisEndDate,
  customers,
  navigate,
  isMobileView,
  showError,
  t
}) => {
  const theme = useTheme();
  
  if (!timeAnalysis || timeAnalysis.totalSessions === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <Alert severity="info">
          {t('productionReport.timeAnalysis.noDataForPeriod')}
        </Alert>
      </Paper>
    );
  }
  
  return (
    <Box sx={{ space: 2 }}>
      {/* Filtry */}
      <Paper 
        elevation={2}
        sx={{ 
          p: isMobileView ? 2 : 2.5, 
          mb: 2,
          background: `linear-gradient(135deg, ${theme.palette.primary.main}08 0%, ${theme.palette.secondary.main}08 100%)`,
          border: `1px solid ${theme.palette.divider}`
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Box 
            sx={{ 
              display: 'inline-flex',
              p: 1,
              borderRadius: 1,
              backgroundColor: `${theme.palette.primary.main}15`,
              mr: 1.5
            }}
          >
            <TimeIcon sx={{ color: 'primary.main', fontSize: 24 }} />
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
            {t('productionReport.timeAnalysis.dateRange')}
          </Typography>
        </Box>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6} md={2.4}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={plLocale}>
              <DatePicker
                label={t('reports.startDate')}
                value={timeAnalysisStartDate}
                onChange={(newDate) => setTimeAnalysisStartDate(newDate)}
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
                value={timeAnalysisEndDate}
                onChange={(newDate) => setTimeAnalysisEndDate(newDate)}
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
            <FormControl fullWidth size="small">
              <InputLabel>{t('productionReport.timeAnalysis.taskFilter')}</InputLabel>
              <Select
                value={selectedTask}
                onChange={(e) => setSelectedTask(e.target.value)}
                label={t('productionReport.timeAnalysis.taskFilter')}
              >
                <MenuItem value="all">
                  {t('productionReport.timeAnalysis.allTasks')}
                </MenuItem>
                {Object.entries(timeAnalysis.sessionsByTask).map(([taskId, taskData]) => {
                  const task = tasksMap[taskId];
                  const displayName = task?.moNumber ? 
                    `${task.moNumber} - ${task.name || task.productName || t('productionReport.timeAnalysis.noTaskSelected')}` :
                    `${task?.name || task?.productName || t('productionReport.timeAnalysis.noTaskSelected')}`;
                  
                  return (
                    <MenuItem key={taskId} value={taskId}>
                      {displayName}
                    </MenuItem>
                  );
                })}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <FormControl fullWidth size="small">
              <InputLabel>{t('productionReport.timeAnalysis.customerFilter')}</InputLabel>
              <Select
                value={selectedCustomer}
                onChange={(e) => setSelectedCustomer(e.target.value)}
                label={t('productionReport.timeAnalysis.customerFilter')}
              >
                <MenuItem value="all">
                  {t('productionReport.timeAnalysis.allCustomers')}
                </MenuItem>
                {customers && customers.map((customer) => (
                  <MenuItem key={customer.id} value={customer.id}>
                    {customer.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={2.4}>
            <FormControl fullWidth size="small">
              <InputLabel>{t('productionReport.timeAnalysis.chartType')}</InputLabel>
              <Select
                value={chartType}
                onChange={(e) => setChartType(e.target.value)}
                label={t('productionReport.timeAnalysis.chartType')}
              >
                <MenuItem value="daily">{t('productionReport.timeAnalysis.dailyChart')}</MenuItem>
                <MenuItem value="weekly">{t('productionReport.timeAnalysis.weeklyChart')}</MenuItem>
                <MenuItem value="monthly">{t('productionReport.timeAnalysis.monthlyChart')}</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {/* Podsumowanie */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {/* Łączny czas */}
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ 
            background: `linear-gradient(135deg, ${theme.palette.primary.main}15 0%, ${theme.palette.primary.main}05 100%)`,
            border: `1px solid ${theme.palette.primary.main}30`
          }}>
            <CardContent sx={{ textAlign: 'center', py: 2.5 }}>
              <Box sx={{ 
                display: 'inline-flex',
                p: 1.5,
                borderRadius: '50%',
                backgroundColor: `${theme.palette.primary.main}20`,
                mb: 1.5
              }}>
                <TimeIcon sx={{ fontSize: 32, color: 'primary.main' }} />
              </Box>
              <Typography variant="h3" color="primary" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                {formatMinutes(filteredAnalysis.totalTimeMinutes)}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                {t('productionReport.timeAnalysis.totalTime')}
              </Typography>
              {(selectedTask !== 'all' || selectedCustomer !== 'all') && (
                <Chip 
                  label={t('productionReport.timeAnalysis.withFilter')}
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{ mt: 1, fontSize: '0.7rem' }}
                />
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Liczba sesji */}
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ 
            background: `linear-gradient(135deg, ${theme.palette.secondary.main}15 0%, ${theme.palette.secondary.main}05 100%)`,
            border: `1px solid ${theme.palette.secondary.main}30`
          }}>
            <CardContent sx={{ textAlign: 'center', py: 2.5 }}>
              <Box sx={{ 
                display: 'inline-flex',
                p: 1.5,
                borderRadius: '50%',
                backgroundColor: `${theme.palette.secondary.main}20`,
                mb: 1.5
              }}>
                <TaskIcon sx={{ fontSize: 32, color: 'secondary.main' }} />
              </Box>
              <Typography variant="h3" color="secondary" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                {filteredAnalysis.totalSessions}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                {t('productionReport.timeAnalysis.totalSessions')}
              </Typography>
              {(selectedTask !== 'all' || selectedCustomer !== 'all') && (
                <Chip 
                  label={t('productionReport.timeAnalysis.withFilter')}
                  size="small"
                  color="secondary"
                  variant="outlined"
                  sx={{ mt: 1, fontSize: '0.7rem' }}
                />
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Wyprodukowana ilość */}
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ 
            background: `linear-gradient(135deg, ${theme.palette.success.main}15 0%, ${theme.palette.success.main}05 100%)`,
            border: `1px solid ${theme.palette.success.main}30`
          }}>
            <CardContent sx={{ textAlign: 'center', py: 2.5 }}>
              <Box sx={{ 
                display: 'inline-flex',
                p: 1.5,
                borderRadius: '50%',
                backgroundColor: `${theme.palette.success.main}20`,
                mb: 1.5
              }}>
                <AnalysisIcon sx={{ fontSize: 32, color: 'success.main' }} />
              </Box>
              <Typography variant="h3" color="success.main" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                {filteredAnalysis.totalQuantity.toLocaleString('pl-PL')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                {t('productionReport.timeAnalysis.totalProducedQuantity')}
              </Typography>
              {(selectedTask !== 'all' || selectedCustomer !== 'all') && (
                <Chip 
                  label={t('productionReport.timeAnalysis.withFilter')}
                  size="small"
                  color="success"
                  variant="outlined"
                  sx={{ mt: 1, fontSize: '0.7rem' }}
                />
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Średni czas na jednostkę */}
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ 
            background: `linear-gradient(135deg, ${theme.palette.warning.main}15 0%, ${theme.palette.warning.main}05 100%)`,
            border: `1px solid ${theme.palette.warning.main}30`
          }}>
            <CardContent sx={{ textAlign: 'center', py: 2.5 }}>
              <Box sx={{ 
                display: 'inline-flex',
                p: 1.5,
                borderRadius: '50%',
                backgroundColor: `${theme.palette.warning.main}20`,
                mb: 1.5
              }}>
                <TrendIcon sx={{ fontSize: 32, color: 'warning.main' }} />
              </Box>
              <Typography variant="h3" color="warning.main" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                {formatMinutes(filteredAnalysis.averageTimePerUnit)}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                {t('productionReport.timeAnalysis.timePerProducedQuantity')}
              </Typography>
              {(selectedTask !== 'all' || selectedCustomer !== 'all') && (
                <Chip 
                  label={t('productionReport.timeAnalysis.withFilter')}
                  size="small"
                  color="warning"
                  variant="outlined"
                  sx={{ mt: 1, fontSize: '0.7rem' }}
                />
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Wykresy */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {/* Wykres czasowy */}
        <Grid item xs={12} md={8}>
          <Paper 
            elevation={2}
            sx={{ 
              p: 3,
              background: `linear-gradient(to bottom, ${theme.palette.background.paper} 0%, ${theme.palette.background.default} 100%)`,
              border: `1px solid ${theme.palette.divider}`
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Box 
                sx={{ 
                  display: 'inline-flex',
                  p: 1,
                  borderRadius: 1,
                  backgroundColor: `${theme.palette.primary.main}15`,
                  mr: 1.5
                }}
              >
                <BarChartIcon sx={{ color: 'primary.main', fontSize: 24 }} />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                {t('productionReport.timeAnalysis.charts.timeDistribution')}
              </Typography>
            </Box>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis />
                <Tooltip 
                  formatter={(value, name) => {
                    if (name === 'timeHours') {
                      return [`${value} h`, t('productionReport.timeAnalysis.workTime')];
                    } else if (name === 'sessions') {
                      return [value, t('productionReport.timeAnalysis.sessions')];
                    }
                    return [value, name];
                  }}
                />
                <Legend />
                <Bar dataKey="timeHours" fill={chartColors[0]} name={t('productionReport.timeAnalysis.workTime')} />
                <Bar dataKey="sessions" fill={chartColors[1]} name={t('productionReport.timeAnalysis.sessions')} />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Wykres kołowy zadań */}
        <Grid item xs={12} md={4}>
          <Paper 
            elevation={2}
            sx={{ 
              p: 3,
              background: `linear-gradient(to bottom, ${theme.palette.background.paper} 0%, ${theme.palette.background.default} 100%)`,
              border: `1px solid ${theme.palette.divider}`
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Box 
                sx={{ 
                  display: 'inline-flex',
                  p: 1,
                  borderRadius: 1,
                  backgroundColor: `${theme.palette.secondary.main}15`,
                  mr: 1.5
                }}
              >
                <PieChartIcon sx={{ color: 'secondary.main', fontSize: 24 }} />
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                {t('productionReport.timeAnalysis.taskBreakdown')}
              </Typography>
            </Box>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={tasksPieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({value, valueHours}) => `${valueHours}h`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {tasksPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `${formatMinutes(value)}`} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>
      </Grid>

      {/* Tabela sesji */}
      <Paper 
        elevation={2}
        sx={{ 
          p: 3,
          background: `linear-gradient(to bottom, ${theme.palette.background.paper} 0%, ${theme.palette.background.default} 100%)`,
          border: `1px solid ${theme.palette.divider}`
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Box 
              sx={{ 
                display: 'inline-flex',
                p: 1,
                borderRadius: 1,
                backgroundColor: `${theme.palette.info.main}15`,
                mr: 1.5
              }}
            >
              <TaskIcon sx={{ color: 'info.main', fontSize: 24 }} />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
              {t('productionReport.timeAnalysis.sessionsList')}
            </Typography>
          </Box>
          {selectedTask !== 'all' && (
            <Chip 
              label={tasksMap[selectedTask]?.moNumber || tasksMap[selectedTask]?.name || selectedTask} 
              size="small"
              color="primary"
              variant="outlined"
              sx={{ fontWeight: 'bold' }}
            />
          )}
        </Box>
        
        <TableContainer>
          <Table size={isMobileView ? "small" : "medium"} stickyHeader>
            <TableHead>
              <TableRow sx={{ 
                backgroundColor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)',
                '& .MuiTableCell-root': {
                  fontWeight: 'bold',
                  borderBottom: `2px solid ${theme.palette.divider}`
                }
              }}>
                <TableCell>{t('productionReport.timeAnalysis.tableHeaders.date')}</TableCell>
                <TableCell>{t('productionReport.timeAnalysis.tableHeaders.task')}</TableCell>
                <TableCell>{t('productionReport.timeAnalysis.tableHeaders.startTime')}</TableCell>
                <TableCell>{t('productionReport.timeAnalysis.tableHeaders.endTime')}</TableCell>
                <TableCell>{t('productionReport.timeAnalysis.tableHeaders.timeSpent')}</TableCell>
                <TableCell align="right">{t('productionReport.timeAnalysis.tableHeaders.quantity')}</TableCell>
                <TableCell align="right">{t('productionReport.timeAnalysis.facilityCost')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredSessions.map((session, index) => (
                <TableRow key={session.id || index}>
                  <TableCell>
                    {format(session.startTime, 'dd.MM.yyyy')}
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const taskExists = tasksMap[session.taskId];
                      const isClickable = taskExists && tasksMap[session.taskId].moNumber;
                      
                      const handleTaskClick = () => {
                        if (isClickable) {
                          navigate(`/production/tasks/${session.taskId}`);
                        } else {
                          showError(t('productionReport.timeAnalysis.taskNotExistsError'));
                        }
                      };

                      return (
                        <Box
                          sx={{ 
                            cursor: isClickable ? 'pointer' : 'default',
                            '&:hover': isClickable ? {
                              '& .task-title': {
                                textDecoration: 'underline'
                              }
                            } : {}
                          }}
                          onClick={handleTaskClick}
                        >
                          <Typography 
                            variant="body2" 
                            fontWeight="bold"
                            className="task-title"
                            sx={{
                              color: isClickable ? 'primary.main' : 'text.disabled',
                              transition: 'all 0.2s ease'
                            }}
                          >
                            {tasksMap[session.taskId]?.moNumber || t('productionReport.timeAnalysis.noMo')}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {tasksMap[session.taskId]?.name || tasksMap[session.taskId]?.productName || t('productionReport.timeAnalysis.unknownTask')}
                          </Typography>
                          {!taskExists && (
                            <Typography variant="caption" color="error" sx={{ display: 'block', fontStyle: 'italic' }}>
                              {t('productionReport.timeAnalysis.taskDeletedLabel')}
                            </Typography>
                          )}
                        </Box>
                      );
                    })()}
                  </TableCell>
                  <TableCell>{session.formattedStartTime}</TableCell>
                  <TableCell>{session.formattedEndTime}</TableCell>
                  <TableCell>
                    <Chip 
                      label={session.timeSpentFormatted} 
                      size="small" 
                      color="primary" 
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell align="right">
                    {session.quantity} {tasksMap[session.taskId]?.unit || 'szt'}
                  </TableCell>
                  <TableCell align="right">
                    {(() => {
                      const task = tasksMap[session.taskId];
                      const quantity = parseFloat(session.quantity) || 0;
                      
                      // Pobierz koszt procesowy: najpierw z task, potem z receptury
                      let processingCostPerUnit = parseFloat(task?.processingCostPerUnit) || 0;
                      
                      // Jeśli task nie ma kosztu, sprawdź recepturę
                      if (processingCostPerUnit === 0 && task?.recipeId && recipesMap[task.recipeId]) {
                        processingCostPerUnit = parseFloat(recipesMap[task.recipeId]?.processingCostPerUnit) || 0;
                      }
                      
                      const facilityCost = processingCostPerUnit * quantity;
                      
                      return facilityCost > 0 
                        ? `${facilityCost.toFixed(2)} €` 
                        : '—';
                    })()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {filteredSessions.length === 0 && (
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <Typography color="text.secondary">
              {t('productionReport.timeAnalysis.noSessionsForCriteria')}
            </Typography>
          </Box>
        )}
      </Paper>
    </Box>
  );
};

export default ProductionTimeAnalysisTab;