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
  Timeline as TimelineIcon
} from '@mui/icons-material';
import { useTranslation } from '../../hooks/useTranslation';
import { useNotification } from '../../hooks/useNotification';
import {
  getProductionHistoryByDateRange,
  analyzeProductionTime,
  getTasksForTimeAnalysis,
  formatMinutes
} from '../../services/productionTimeAnalysisService';
import ProductionGapAnalysisTab from './ProductionGapAnalysisTab';

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
      if (taskIds.length > 0) {
        const tasks = await getTasksForTimeAnalysis(taskIds);
        setTasksMap(tasks);
      } else {
        setTasksMap({});
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
    if (selectedTab === 0) { // Tylko dla zakładki analizy czasu
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
            label="Analiza czasu" 
            iconPosition="start"
            sx={{ minHeight: 48 }}
          />
          <Tab 
            icon={<TimelineIcon />} 
            label="Analiza luk" 
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
      <Paper sx={{ p: isMobileView ? 1.5 : 3, mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          {t('productionReport.timeAnalysis.dateRange')}
        </Typography>
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
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <TimeIcon sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
              <Typography variant="h4" color="primary">
                {formatMinutes(filteredAnalysis.totalTimeMinutes)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('productionReport.timeAnalysis.totalTime')}
              </Typography>
              {(selectedTask !== 'all' || selectedCustomer !== 'all') && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  {t('productionReport.timeAnalysis.withFilter')}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <TaskIcon sx={{ fontSize: 40, color: 'secondary.main', mb: 1 }} />
              <Typography variant="h4" color="secondary">
                {filteredAnalysis.totalSessions}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('productionReport.timeAnalysis.totalSessions')}
              </Typography>
              {(selectedTask !== 'all' || selectedCustomer !== 'all') && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  {t('productionReport.timeAnalysis.withFilter')}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <AnalysisIcon sx={{ fontSize: 40, color: 'success.main', mb: 1 }} />
              <Typography variant="h4" color="success.main">
                {formatMinutes(filteredAnalysis.averageTimePerSession)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('productionReport.timeAnalysis.averageTimePerSession')}
              </Typography>
              {(selectedTask !== 'all' || selectedCustomer !== 'all') && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  {t('productionReport.timeAnalysis.withFilter')}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <TrendIcon sx={{ fontSize: 40, color: 'warning.main', mb: 1 }} />
              <Typography variant="h4" color="warning.main">
                {formatMinutes(filteredAnalysis.averageTimePerUnit)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('productionReport.timeAnalysis.averageTimePerUnit')}
              </Typography>
              {(selectedTask !== 'all' || selectedCustomer !== 'all') && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                  {t('productionReport.timeAnalysis.withFilter')}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Wykresy */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        {/* Wykres czasowy */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              {t('productionReport.timeAnalysis.charts.timeDistribution')}
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" />
                <YAxis />
                <Tooltip 
                  formatter={(value, name) => [
                    name === 'timeHours' ? `${value} h` : value,
                    name === 'timeHours' ? t('productionReport.timeAnalysis.charts.timeHours') : 
                    name === 'sessions' ? t('productionReport.timeAnalysis.charts.sessions') : t('productionReport.timeAnalysis.charts.quantity')
                  ]}
                />
                <Legend />
                <Bar dataKey="timeHours" fill={chartColors[0]} name={t('productionReport.timeAnalysis.charts.timeHours')} />
                <Bar dataKey="sessions" fill={chartColors[1]} name={t('productionReport.timeAnalysis.charts.sessions')} />
              </BarChart>
            </ResponsiveContainer>
          </Paper>
        </Grid>

        {/* Wykres kołowy zadań */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="h6" gutterBottom>
              {t('productionReport.timeAnalysis.taskBreakdown')}
            </Typography>
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
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          {t('productionReport.timeAnalysis.sessionsList')}
          {selectedTask !== 'all' && (
            <Chip 
              label={tasksMap[selectedTask]?.moNumber || tasksMap[selectedTask]?.name || selectedTask} 
              size="small" 
              sx={{ ml: 1 }} 
            />
          )}
        </Typography>
        
        <TableContainer>
          <Table size={isMobileView ? "small" : "medium"}>
            <TableHead>
              <TableRow>
                <TableCell>{t('productionReport.timeAnalysis.tableHeaders.date')}</TableCell>
                <TableCell>{t('productionReport.timeAnalysis.tableHeaders.task')}</TableCell>
                <TableCell>{t('productionReport.timeAnalysis.tableHeaders.startTime')}</TableCell>
                <TableCell>{t('productionReport.timeAnalysis.tableHeaders.endTime')}</TableCell>
                <TableCell>{t('productionReport.timeAnalysis.tableHeaders.timeSpent')}</TableCell>
                <TableCell align="right">{t('productionReport.timeAnalysis.tableHeaders.quantity')}</TableCell>
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