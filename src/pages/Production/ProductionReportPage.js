import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Paper,
  Grid,
  Card,
  CardContent,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Divider,
  CircularProgress,
  useMediaQuery,
  useTheme,
  IconButton,
  Tabs,
  Tab
} from '@mui/material';
import {
  PieChart,
  Pie,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Cell,
  ResponsiveContainer
} from 'recharts';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import plLocale from 'date-fns/locale/pl';
import { format, parseISO, isValid, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import {
  CalendarMonth as CalendarIcon,
  Article as ReportIcon,
  FormatListBulleted as ListIcon,
  Assessment as AssessmentIcon,
  FileDownload as DownloadIcon,
  NavigateBefore as PrevIcon,
  NavigateNext as NextIcon,
  ArrowDropDown as DropdownIcon,
  Inventory as InventoryIcon
} from '@mui/icons-material';
import { getAllTasks } from '../../services/productionService';
import { getAllOrders } from '../../services/orderService';
import { getAllCustomers } from '../../services/customerService';
import { getWorkstationById } from '../../services/workstationService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import { PRODUCTION_TASK_STATUSES } from '../../utils/constants';

const ProductionReportPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [startDate, setStartDate] = useState(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState(endOfMonth(new Date()));
  const [filteredTasks, setFilteredTasks] = useState([]);
  const [statusStats, setStatusStats] = useState([]);
  const [customerStats, setCustomerStats] = useState([]);
  const [timeStats, setTimeStats] = useState({ totalMinutes: 0, avgTaskTime: 0 });
  const [selectedCustomer, setSelectedCustomer] = useState('all');
  const [workstationNames, setWorkstationNames] = useState({});
  const [selectedTab, setSelectedTab] = useState(0);
  const { showError } = useNotification();
  
  // Dodajemy wykrywanie urządzeń mobilnych
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Kolory dla wykresów
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (tasks.length > 0 && orders.length > 0 && customers.length > 0) {
      filterAndProcessData();
    }
  }, [tasks, orders, customers, startDate, endDate, selectedCustomer]);

  useEffect(() => {
    const fetchWorkstationNames = async () => {
      const workstationData = {};
      
      for (const task of filteredTasks) {
        if (task.workstationId && !workstationData[task.workstationId]) {
          try {
            const workstation = await getWorkstationById(task.workstationId);
            workstationData[task.workstationId] = workstation.name;
          } catch (error) {
            console.error(`Błąd podczas pobierania stanowiska dla ID ${task.workstationId}:`, error);
            workstationData[task.workstationId] = "Nieznane stanowisko";
          }
        }
      }
      
      setWorkstationNames(workstationData);
    };
    
    if (filteredTasks.length > 0) {
      fetchWorkstationNames();
    }
  }, [filteredTasks]);

  const fetchData = async () => {
    try {
      setLoading(true);
      console.log('[RAPORT PRODUKCJI] Rozpoczynam pobieranie danych...');
      
      const [fetchedTasks, fetchedOrders, fetchedCustomers] = await Promise.all([
        getAllTasks(),
        getAllOrders(),
        getAllCustomers()
      ]);
      
      console.log(`[RAPORT PRODUKCJI] Pobrano ${fetchedTasks.length} zadań produkcyjnych`);
      
      // Sprawdź ile zadań ma dane konsumpcji
      const tasksWithConsumption = fetchedTasks.filter(task => 
        task.consumedMaterials && task.consumedMaterials.length > 0
      );
      
      console.log(`[RAPORT PRODUKCJI] Zadania z konsumpcją: ${tasksWithConsumption.length}/${fetchedTasks.length}`);
      
      if (tasksWithConsumption.length > 0) {
        console.log('[RAPORT PRODUKCJI] Przykładowe zadania z konsumpcją:');
        tasksWithConsumption.slice(0, 3).forEach((task, index) => {
          console.log(`  ${index + 1}. ${task.moNumber || task.name} - ${task.consumedMaterials.length} pozycji konsumpcji`);
        });
      } else {
        console.warn('[RAPORT PRODUKCJI] UWAGA: Żadne zadanie nie ma danych konsumpcji!');
      }
      
      setTasks(fetchedTasks);
      setOrders(fetchedOrders);
      setCustomers(fetchedCustomers);
    } catch (error) {
      console.error('Błąd podczas pobierania danych:', error);
      showError('Nie udało się pobrać danych raportów: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Funkcja do filtrowania i przetwarzania danych
  const filterAndProcessData = () => {
    // 1. Filtruj zadania według daty i klienta
    let filtered = tasks.filter(task => {
      // Przetwórz datę zadania
      let taskDate;
      if (typeof task.scheduledDate === 'string') {
        taskDate = new Date(task.scheduledDate);
      } else if (task.scheduledDate?.toDate) {
        taskDate = task.scheduledDate.toDate();
      } else if (task.scheduledDate instanceof Date) {
        taskDate = task.scheduledDate;
      } else {
        return false; // Brak daty, pomijamy
      }
      
      // Sprawdź czy data jest w zakresie
      if (taskDate < startDate || taskDate > endDate) {
        return false;
      }
      
      // Sprawdź filtry klienta
      if (selectedCustomer !== 'all') {
        // Znajdź zamówienie, do którego przypisane jest zadanie
        const relatedOrder = orders.find(order => 
          order.productionTasks?.some(prodTask => prodTask.id === task.id)
        );
        
        if (!relatedOrder || relatedOrder.customer?.id !== selectedCustomer) {
          return false;
        }
      }
      
      return true;
    });
    
    setFilteredTasks(filtered);
    
    // 2. Oblicz statystyki dla statusów
    const statusCounts = {};
    filtered.forEach(task => {
      const status = task.status || 'Nieznany';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });
    
    const statusData = Object.keys(statusCounts).map(status => ({
      name: status,
      value: statusCounts[status]
    }));
    
    setStatusStats(statusData);
    
    // 3. Oblicz statystyki dla klientów
    const customerTaskCounts = {};
    const customerTaskList = {};
    
    filtered.forEach(task => {
      // Znajdź zamówienie powiązane z zadaniem
      const relatedOrder = orders.find(order => 
        order.productionTasks?.some(prodTask => prodTask.id === task.id)
      );
      
      if (relatedOrder && relatedOrder.customer) {
        const customerId = relatedOrder.customer.id;
        const customerName = relatedOrder.customer.name || 'Nieznany klient';
        
        if (!customerTaskCounts[customerId]) {
          customerTaskCounts[customerId] = {
            name: customerName,
            value: 0,
            tasks: []
          };
        }
        
        customerTaskCounts[customerId].value++;
        customerTaskCounts[customerId].tasks.push(task);
        
        if (!customerTaskList[customerId]) {
          customerTaskList[customerId] = [];
        }
        customerTaskList[customerId].push(task);
      } else {
        // Zadania bez klienta
        if (!customerTaskCounts['unknown']) {
          customerTaskCounts['unknown'] = {
            name: 'Bez przypisanego klienta',
            value: 0,
            tasks: []
          };
        }
        
        customerTaskCounts['unknown'].value++;
        customerTaskCounts['unknown'].tasks.push(task);
      }
    });
    
    const customerData = Object.values(customerTaskCounts);
    setCustomerStats(customerData);
    
    // 4. Oblicz statystyki czasu pracy
    let totalMinutes = 0;
    let tasksWithTime = 0;
    
    filtered.forEach(task => {
      if (task.productionSessions && task.productionSessions.length > 0) {
        const taskTimeSpent = task.productionSessions.reduce((sum, session) => {
          return sum + (session.timeSpent || 0);
        }, 0);
        
        totalMinutes += taskTimeSpent;
        tasksWithTime++;
      }
    });
    
    setTimeStats({
      totalMinutes,
      avgTaskTime: tasksWithTime > 0 ? totalMinutes / tasksWithTime : 0
    });
  };

  const formatTime = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    
    if (hours > 0) {
      return `${hours} godz. ${mins} min.`;
    }
    return `${mins} min.`;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Zaplanowane': return '#1976d2'; // primary
      case 'W trakcie': return '#ff9800'; // warning
      case 'Zakończone': return '#2e7d32'; // success
      case 'Anulowane': return '#d32f2f'; // error
      case 'Wstrzymane': return '#757575'; // default
      case 'Potwierdzenie zużycia': return '#0288d1'; // info
      default: return '#757575'; // default
    }
  };
  
  const handlePreviousMonth = () => {
    setStartDate(startOfMonth(subMonths(startDate, 1)));
    setEndDate(endOfMonth(subMonths(endDate, 1)));
  };
  
  const handleNextMonth = () => {
    setStartDate(startOfMonth(addMonths(startDate, 1)));
    setEndDate(endOfMonth(addMonths(endDate, 1)));
  };
  
  const handleTabChange = (event, newValue) => {
    setSelectedTab(newValue);
  };
  
  const getTaskCustomerName = (task) => {
    const relatedOrder = orders.find(order => 
      order.productionTasks?.some(prodTask => prodTask.id === task.id)
    );
    
    if (relatedOrder && relatedOrder.customer) {
      return relatedOrder.customer.name || 'Nieznany klient';
    }
    
    return 'Bez przypisanego klienta';
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: isMobile ? 1 : 4, mb: 4, px: isMobile ? 0.5 : 3 }}>
      <Box sx={{ mb: isMobile ? 1 : 2, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Typography variant="h5" align="center" sx={{ fontSize: isMobile ? '1.15rem' : '1.5rem' }}>
          Raport MO
        </Typography>
      </Box>

      {/* Zakładki */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs 
          value={selectedTab} 
          onChange={handleTabChange} 
          aria-label="raport mo tabs"
          sx={{
            '& .MuiTab-root': {
              fontWeight: 'bold',
              py: 2
            },
            '& .Mui-selected': {
              color: 'primary.main',
              fontWeight: 'bold'
            },
            '& .MuiTabs-indicator': {
              height: 3,
              borderTopLeftRadius: 3,
              borderTopRightRadius: 3
            }
          }}
        >
          <Tab 
            label="Ogólny raport" 
            icon={<AssessmentIcon />} 
            iconPosition="start"
            sx={{ fontSize: '1rem' }}
          />
          <Tab 
            label="Konsumpcja MO"
            icon={<InventoryIcon />} 
            iconPosition="start"
            sx={{ fontSize: '1rem' }}
          />
        </Tabs>
      </Box>

      {/* Zawartość zakładek */}
      {selectedTab === 0 && (
        <React.Fragment>
          {/* Filtry */}
          <Paper sx={{ p: isMobile ? 1.5 : 3, mb: isMobile ? 1.5 : 3 }}>
            <Grid container spacing={isMobile ? 1 : 3} alignItems="center">
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="caption" sx={{ display: isMobile ? 'block' : 'none', mb: 0.5 }}>
                  Data początkowa
                </Typography>
                <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={plLocale}>
                  <DatePicker
                    label={isMobile ? "" : "Data początkowa"}
                    value={startDate}
                    onChange={(newDate) => setStartDate(newDate)}
                    slotProps={{ 
                      textField: { 
                        fullWidth: true,
                        size: "small",
                        placeholder: isMobile ? "Data początkowa" : "",
                        sx: {
                          '& .MuiInputLabel-root': {
                            display: isMobile ? 'none' : 'block'
                          }
                        }
                      } 
                    }}
                  />
                </LocalizationProvider>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="caption" sx={{ display: isMobile ? 'block' : 'none', mb: 0.5 }}>
                  Data końcowa
                </Typography>
                <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={plLocale}>
                  <DatePicker
                    label={isMobile ? "" : "Data końcowa"}
                    value={endDate}
                    onChange={(newDate) => setEndDate(newDate)}
                    slotProps={{ 
                      textField: { 
                        fullWidth: true,
                        size: "small",
                        placeholder: isMobile ? "Data końcowa" : "",
                        sx: {
                          '& .MuiInputLabel-root': {
                            display: isMobile ? 'none' : 'block'
                          }
                        }
                      } 
                    }}
                  />
                </LocalizationProvider>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="caption" sx={{ display: isMobile ? 'block' : 'none', mb: 0.5 }}>
                  Klient
                </Typography>
                <FormControl fullWidth size="small">
                  <InputLabel sx={{ display: isMobile ? 'none' : 'block' }}>{t('production.productionReport.customerFilter')}</InputLabel>
                  <Select
                    value={selectedCustomer}
                    onChange={(e) => setSelectedCustomer(e.target.value)}
                    label={isMobile ? "" : t('production.productionReport.customerFilter')}
                    displayEmpty={isMobile}
                    placeholder={isMobile ? t('production.productionReport.customerFilter') : ""}
                  >
                    <MenuItem value="all">{t('production.productionReport.allCustomers')}</MenuItem>
                    {customers.map(customer => (
                      <MenuItem key={customer.id} value={customer.id}>
                        {customer.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Box sx={{ 
                  display: 'flex', 
                  justifyContent: 'center', 
                  alignItems: 'center',
                  height: '100%',
                  gap: 1,
                  mt: isMobile ? 1 : 0
                }}>
                  <IconButton 
                    color="primary"
                    onClick={handlePreviousMonth}
                    size="small"
                    sx={{ 
                      border: '1px solid rgba(25, 118, 210, 0.5)', 
                      borderRadius: 1, 
                      width: 36, 
                      height: 36,
                      minWidth: 36, 
                      p: 0.5,
                      mx: 0.5
                    }}
                  >
                    <PrevIcon fontSize="small" />
                  </IconButton>
                  <IconButton 
                    color="primary"
                    onClick={handleNextMonth}
                    size="small"
                    sx={{ 
                      border: '1px solid rgba(25, 118, 210, 0.5)', 
                      borderRadius: 1, 
                      width: 36, 
                      height: 36,
                      minWidth: 36, 
                      p: 0.5,
                      mx: 0.5
                    }}
                  >
                    <NextIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Grid>
            </Grid>
          </Paper>

          {/* Podsumowanie */}
          <Grid container spacing={isMobile ? 1 : 3} sx={{ mb: isMobile ? 1.5 : 3 }}>
            <Grid item xs={6} sm={6} md={3}>
              <Card>
                <CardContent sx={{ p: isMobile ? 1 : 2, '&:last-child': { pb: isMobile ? 1 : 2 } }}>
                  <Typography variant="caption" sx={{ fontSize: isMobile ? '0.7rem' : '0.8rem' }}>
                    Liczba zadań
                  </Typography>
                  <Typography variant="h5" color="primary" sx={{ fontSize: isMobile ? '1.2rem' : '1.5rem', mt: 0.5 }}>
                    {filteredTasks.length}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} sm={6} md={3}>
              <Card>
                <CardContent sx={{ p: isMobile ? 1 : 2, '&:last-child': { pb: isMobile ? 1 : 2 } }}>
                  <Typography variant="caption" sx={{ fontSize: isMobile ? '0.7rem' : '0.8rem' }}>
                    Zadania zakończone
                  </Typography>
                  <Typography variant="h5" color="success.main" sx={{ fontSize: isMobile ? '1.2rem' : '1.5rem', mt: 0.5 }}>
                    {filteredTasks.filter(task => task.status === 'Zakończone').length}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} sm={6} md={3}>
              <Card>
                <CardContent sx={{ p: isMobile ? 1 : 2, '&:last-child': { pb: isMobile ? 1 : 2 } }}>
                  <Typography variant="caption" sx={{ fontSize: isMobile ? '0.7rem' : '0.8rem' }}>
                    Zadania w trakcie
                  </Typography>
                  <Typography variant="h5" color="warning.main" sx={{ fontSize: isMobile ? '1.2rem' : '1.5rem', mt: 0.5 }}>
                    {filteredTasks.filter(task => task.status === 'W trakcie').length}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={6} sm={6} md={3}>
              <Card>
                <CardContent sx={{ p: isMobile ? 1 : 2, '&:last-child': { pb: isMobile ? 1 : 2 } }}>
                  <Typography variant="caption" sx={{ fontSize: isMobile ? '0.7rem' : '0.8rem' }}>
                    Czas pracy
                  </Typography>
                  <Typography variant="h5" color="info.main" sx={{ fontSize: isMobile ? '1.2rem' : '1.5rem', mt: 0.5 }}>
                    {formatTime(timeStats.totalMinutes)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Wykresy - na urządzeniach mobilnych pokazujemy tylko wykres statusów */}
          <Grid container spacing={isMobile ? 1 : 3} sx={{ mb: isMobile ? 1.5 : 3 }}>
            <Grid item xs={12} md={6}>
              <Paper sx={{ p: isMobile ? 1 : 3, height: '100%' }}>
                <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mb: 1, fontSize: isMobile ? '0.8rem' : '1rem' }}>
                  Zadania według statusu
                </Typography>
                <Box sx={{ height: isMobile ? 200 : 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusStats}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={false}
                        outerRadius={isMobile ? 50 : 80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {statusStats.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={getStatusColor(entry.name)} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [`${value} zadań`, 'Liczba']} />
                      <Legend layout="horizontal" align="center" verticalAlign="bottom" wrapperStyle={{ fontSize: isMobile ? '0.7rem' : '0.8rem' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </Box>
              </Paper>
            </Grid>
            {!isMobile && (
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 3, height: '100%' }}>
                  <Typography variant="h6" gutterBottom align="center">
                    Zadania wg klienta
                  </Typography>
                  <Box sx={{ height: 300 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        width={500}
                        height={300}
                        data={customerStats}
                        margin={{
                          top: 5,
                          right: 30,
                          left: 20,
                          bottom: 5,
                        }}
                      >
                        <XAxis dataKey="name" textAnchor="middle" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="value" name="Liczba zadań" fill="#8884d8" />
                      </BarChart>
                    </ResponsiveContainer>
                  </Box>
                </Paper>
              </Grid>
            )}
          </Grid>

          {/* Tabela szczegółowa - na urządzeniach mobilnych pokazujemy prostszą wersję */}
          {isMobile ? (
            <Paper sx={{ p: 1.5 }}>
              <Typography variant="caption" sx={{ display: 'block', mb: 1, fontSize: '0.8rem' }}>
                {t('production.productionReport.tabs.taskList')}
              </Typography>
              <Divider sx={{ mb: 1.5 }} />
              
              {filteredTasks.length === 0 ? (
                <Typography align="center" sx={{ py: 2, fontSize: '0.8rem' }}>
                  Brak zadań w wybranym okresie
                </Typography>
              ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {filteredTasks.map((task) => (
                    <Card 
                      key={task.id} 
                      variant="outlined" 
                      sx={{ 
                        cursor: 'pointer',
                        '&:hover': { bgcolor: 'rgba(0, 0, 0, 0.03)' } 
                      }}
                      onClick={() => navigate(`/production/tasks/${task.id}`)}
                    >
                      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 'medium', fontSize: '0.8rem' }}>
                            {task.name}
                          </Typography>
                          <Chip 
                            label={task.status} 
                            sx={{ 
                              backgroundColor: getStatusColor(task.status),
                              color: 'white',
                              fontSize: '0.65rem',
                              height: '20px'
                            }}
                            size="small" 
                          />
                        </Box>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                          <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>
                            {task.productName}
                          </Typography>
                          <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>
                            {task.scheduledDate 
                              ? format(
                                  typeof task.scheduledDate === 'string'
                                    ? new Date(task.scheduledDate)
                                    : task.scheduledDate instanceof Date
                                      ? task.scheduledDate
                                      : task.scheduledDate.toDate(),
                                  'dd.MM.yyyy'
                                )
                              : '-'}
                          </Typography>
                        </Box>
                      </CardContent>
                    </Card>
                  ))}
                </Box>
              )}
            </Paper>
          ) : (
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                {t('production.productionReport.tabs.detailedTaskList')}
              </Typography>
              <Divider sx={{ mb: 2 }} />
              
              {filteredTasks.length === 0 ? (
                <Typography align="center" sx={{ py: 3 }}>
                  {t('production.productionReport.noTasksInPeriod')}
                </Typography>
              ) : (
                <TableContainer sx={{ overflowX: 'auto' }}>
                  <Table size="medium" sx={{ minWidth: 850 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>{t('production.productionReport.tableHeaders.taskName')}</TableCell>
                        <TableCell>{t('production.productionReport.tableHeaders.moNumber')}</TableCell>
                        <TableCell>{t('production.productionReport.tableHeaders.product')}</TableCell>
                        <TableCell>{t('production.productionReport.tableHeaders.client')}</TableCell>
                        <TableCell>{t('production.productionReport.tableHeaders.date')}</TableCell>
                        <TableCell>{t('production.productionReport.tableHeaders.status')}</TableCell>
                        <TableCell align="right">{t('production.productionReport.tableHeaders.workTime')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredTasks.map((task) => (
                        <TableRow 
                          key={task.id}
                          hover
                          onClick={() => navigate(`/production/tasks/${task.id}`)}
                          sx={{ cursor: 'pointer' }}
                        >
                          <TableCell>{task.name}</TableCell>
                          <TableCell>{task.moNumber}</TableCell>
                          <TableCell>{task.productName}</TableCell>
                          <TableCell>{getTaskCustomerName(task)}</TableCell>
                          <TableCell>
                            {task.scheduledDate 
                              ? format(
                                  typeof task.scheduledDate === 'string'
                                    ? new Date(task.scheduledDate)
                                    : task.scheduledDate instanceof Date
                                      ? task.scheduledDate
                                      : task.scheduledDate.toDate(),
                                  'dd.MM.yyyy'
                                )
                              : '-'}
                          </TableCell>
                          <TableCell>
                            <Chip 
                              label={task.status} 
                              sx={{ 
                                backgroundColor: getStatusColor(task.status),
                                color: 'white',
                                fontSize: '0.75rem'
                              }}
                              size="small" 
                            />
                          </TableCell>
                          <TableCell align="right">
                            {task.productionSessions 
                              ? task.productionSessions.reduce((sum, session) => sum + (session.timeSpent || 0), 0)
                              : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Paper>
          )}
        </React.Fragment>
      )}

      {/* Zakładka Konsumpcja MO */}
      {selectedTab === 1 && (
        <ConsumptionReportTab 
          tasks={filteredTasks}
          startDate={startDate}
          endDate={endDate}
          customers={customers}
          isMobile={isMobile}
        />
      )}
    </Container>
  );
};

// Komponent zakładki konsumpcji MO
const ConsumptionReportTab = ({ tasks, startDate, endDate, customers, isMobile }) => {
  const [consumptionData, setConsumptionData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filteredConsumption, setFilteredConsumption] = useState([]);
  const [consumptionStartDate, setConsumptionStartDate] = useState(startDate);
  const [consumptionEndDate, setConsumptionEndDate] = useState(endDate);
  const [selectedMaterial, setSelectedMaterial] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState('all');
  const [materialsList, setMaterialsList] = useState([]);
  const [ordersList, setOrdersList] = useState([]);

  // Funkcja do agregacji danych konsumpcji z zadań produkcyjnych
  const aggregateConsumptionData = (tasks) => {
    console.log(`[RAPORT KONSUMPCJI] Rozpoczynam agregację dla ${tasks.length} zadań`);
    console.log(`[RAPORT KONSUMPCJI] Zakres dat: ${format(consumptionStartDate, 'dd.MM.yyyy')} - ${format(consumptionEndDate, 'dd.MM.yyyy')}`);
    
    const aggregatedData = [];
    const materialSummary = {};
    let tasksWithConsumption = 0;
    let totalConsumptionItems = 0;
    let consumptionItemsInDateRange = 0;

    tasks.forEach((task, taskIndex) => {
      console.log(`[RAPORT KONSUMPCJI] Zadanie ${taskIndex + 1}/${tasks.length}: ${task.moNumber || task.name}`);
      console.log(`[RAPORT KONSUMPCJI] - ID: ${task.id}`);
      console.log(`[RAPORT KONSUMPCJI] - Konsumpcja: ${task.consumedMaterials ? task.consumedMaterials.length : 0} pozycji`);
      
      if (task.consumedMaterials && task.consumedMaterials.length > 0) {
        tasksWithConsumption++;
        console.log(`[RAPORT KONSUMPCJI] - Zadanie ma ${task.consumedMaterials.length} pozycji konsumpcji`);
        
        task.consumedMaterials.forEach((consumed, consumedIndex) => {
          totalConsumptionItems++;
          console.log(`[RAPORT KONSUMPCJI] -- Konsumpcja ${consumedIndex + 1}: materialId=${consumed.materialId}, quantity=${consumed.quantity}`);
          
          const materialId = consumed.materialId;
          
          // Znajdź materiał w liście materiałów zadania aby pobrać prawidłową nazwę
          const material = task.materials?.find(m => 
            (m.inventoryItemId || m.id) === materialId
          );
          
          const materialName = material?.name || consumed.materialName || 'Nieznany materiał';
          const materialUnit = material?.unit || consumed.unit || 'szt';
          const batchNumber = consumed.batchNumber || consumed.batchId || 'Brak numeru';
          const quantity = Number(consumed.quantity) || 0;
          const unitPrice = Number(consumed.unitPrice) || 0;
          const totalCost = quantity * unitPrice;
          
          // Ulepszone pobieranie daty konsumpcji z wieloma fallbackami
          let consumptionDate = null;
          if (consumed.timestamp) {
            if (consumed.timestamp.toDate) {
              // Firestore Timestamp
              consumptionDate = consumed.timestamp.toDate();
            } else if (consumed.timestamp instanceof Date) {
              consumptionDate = consumed.timestamp;
            } else if (typeof consumed.timestamp === 'string') {
              consumptionDate = new Date(consumed.timestamp);
            } else if (typeof consumed.timestamp === 'number') {
              consumptionDate = new Date(consumed.timestamp);
            }
          } else if (consumed.date) {
            // Fallback na pole date
            if (consumed.date.toDate) {
              consumptionDate = consumed.date.toDate();
            } else {
              consumptionDate = new Date(consumed.date);
            }
          } else if (task.updatedAt) {
            // Fallback na datę aktualizacji zadania
            if (task.updatedAt.toDate) {
              consumptionDate = task.updatedAt.toDate();
            } else {
              consumptionDate = new Date(task.updatedAt);
            }
          } else if (task.createdAt) {
            // Fallback na datę utworzenia zadania
            if (task.createdAt.toDate) {
              consumptionDate = task.createdAt.toDate();
            } else {
              consumptionDate = new Date(task.createdAt);
            }
          }
          
          console.log(`[RAPORT KONSUMPCJI] -- Data konsumpcji: ${consumptionDate ? format(consumptionDate, 'dd.MM.yyyy HH:mm') : 'BRAK'}`);
          
          // Sprawdź czy konsumpcja jest w wybranym zakresie dat
          let isInDateRange = false;
          let dateReason = '';
          
          if (consumptionDate) {
            isInDateRange = consumptionDate >= consumptionStartDate && 
                           consumptionDate <= consumptionEndDate;
            dateReason = isInDateRange ? 'w zakresie dat' : 'poza zakresem dat';
          } else {
            // Jeśli nie ma daty konsumpcji, użyj daty zadania lub załóż że jest aktualna
            isInDateRange = true; // Domyślnie uwzględnij jeśli nie ma daty
            dateReason = 'brak daty konsumpcji - uwzględniam';
          }
              
          console.log(`[RAPORT KONSUMPCJI] -- Status: ${dateReason} (${isInDateRange ? 'UWZGLĘDNIAM' : 'POMIJAM'})`);
          
          if (isInDateRange) {
            if (!consumptionDate) {
              console.log(`[RAPORT KONSUMPCJI] -- UWAGA: Brak daty konsumpcji, używam fallback`);
            }
            
            consumptionItemsInDateRange++;
            
            // Dodaj do szczegółowych danych
            aggregatedData.push({
              taskId: task.id,
              taskName: task.name,
              moNumber: task.moNumber,
              productName: task.productName,
              materialId,
              materialName,
              batchNumber,
              quantity,
              unit: materialUnit,
              unitPrice,
              totalCost,
              consumptionDate: consumptionDate || new Date(), // Użyj bieżącej daty jako fallback
              userName: consumed.userName || 'Nieznany użytkownik',
              includeInCosts: consumed.includeInCosts !== false
            });

            // Agreguj dla podsumowania materiałów
            if (!materialSummary[materialId]) {
              materialSummary[materialId] = {
                materialName,
                unit: materialUnit,
                totalQuantity: 0,
                totalCost: 0,
                batchCount: 0,
                taskCount: new Set(),
                avgUnitPrice: 0
              };
            }

            materialSummary[materialId].totalQuantity += quantity;
            materialSummary[materialId].totalCost += totalCost;
            materialSummary[materialId].batchCount += 1;
            materialSummary[materialId].taskCount.add(task.id);
          }
        });
      } else {
        console.log(`[RAPORT KONSUMPCJI] - Zadanie nie ma danych konsumpcji`);
      }
    });

    console.log(`[RAPORT KONSUMPCJI] PODSUMOWANIE:`);
    console.log(`[RAPORT KONSUMPCJI] - Zadania z konsumpcją: ${tasksWithConsumption}/${tasks.length}`);
    console.log(`[RAPORT KONSUMPCJI] - Całkowita konsumpcja: ${totalConsumptionItems} pozycji`);
    console.log(`[RAPORT KONSUMPCJI] - Konsumpcja w zakresie dat: ${consumptionItemsInDateRange} pozycji`);
    console.log(`[RAPORT KONSUMPCJI] - Materiały w podsumowaniu: ${Object.keys(materialSummary).length}`);
    console.log(`[RAPORT KONSUMPCJI] - Szczegółowe dane: ${aggregatedData.length} pozycji`);

    // Oblicz średnie ceny jednostkowe
    Object.values(materialSummary).forEach(material => {
      material.avgUnitPrice = material.totalQuantity > 0 
        ? material.totalCost / material.totalQuantity 
        : 0;
      material.taskCount = material.taskCount.size;
    });

    return {
      detailedData: aggregatedData,
      materialSummary: Object.values(materialSummary)
    };
  };

  // Pobierz unikalne materiały do filtrowania
  useEffect(() => {
    const materials = [];
    const materialSet = new Set();
    
    tasks.forEach(task => {
      if (task.consumedMaterials && task.consumedMaterials.length > 0) {
        task.consumedMaterials.forEach(consumed => {
          const materialId = consumed.materialId;
          
          // Znajdź materiał w liście materiałów zadania aby pobrać prawidłową nazwę
          const material = task.materials?.find(m => 
            (m.inventoryItemId || m.id) === materialId
          );
          
          const materialName = material?.name || consumed.materialName || 'Nieznany materiał';
          
          if (!materialSet.has(materialId)) {
            materialSet.add(materialId);
            materials.push({
              id: materialId,
              name: materialName
            });
          }
        });
      }
    });
    
    setMaterialsList(materials.sort((a, b) => a.name.localeCompare(b.name)));
  }, [tasks]);

  // Pobierz unikalne zamówienia (CO) do filtrowania
  useEffect(() => {
    const orders = [];
    const orderSet = new Set();
    
    tasks.forEach(task => {
      if (task.consumedMaterials && task.consumedMaterials.length > 0) {
        // Sprawdź czy zadanie ma powiązane zamówienie
        if (task.orderId && task.orderNumber) {
          const orderKey = `${task.orderId}_${task.orderNumber}`;
          
          if (!orderSet.has(orderKey)) {
            orderSet.add(orderKey);
            orders.push({
              id: task.orderId,
              number: task.orderNumber,
              customer: task.customer
            });
          }
        }
      }
    });
    
    setOrdersList(orders.sort((a, b) => a.number.localeCompare(b.number)));
  }, [tasks]);

  // Funkcja do debugowania struktury zadań
  const debugTasksStructure = (tasks) => {
    console.log('[DEBUG STRUKTURA] Analizuję strukturę zadań...');
    
    if (tasks.length === 0) {
      console.log('[DEBUG STRUKTURA] Brak zadań do analizy');
      return;
    }
    
    // Sprawdź pierwsze zadanie
    const firstTask = tasks[0];
    console.log('[DEBUG STRUKTURA] Przykładowa struktura zadania:');
    console.log('[DEBUG STRUKTURA] - Pola zadania:', Object.keys(firstTask));
    console.log('[DEBUG STRUKTURA] - Ma consumedMaterials:', !!firstTask.consumedMaterials);
    console.log('[DEBUG STRUKTURA] - Typ consumedMaterials:', typeof firstTask.consumedMaterials);
    console.log('[DEBUG STRUKTURA] - Długość consumedMaterials:', firstTask.consumedMaterials?.length || 0);
    
    if (firstTask.consumedMaterials && firstTask.consumedMaterials.length > 0) {
      const firstConsumption = firstTask.consumedMaterials[0];
      console.log('[DEBUG STRUKTURA] - Przykładowa konsumpcja:', firstConsumption);
      console.log('[DEBUG STRUKTURA] - Pola konsumpcji:', Object.keys(firstConsumption));
    }
    
    // Sprawdź ile zadań ma różne pola
    const stats = tasks.reduce((acc, task) => {
      acc.total++;
      if (task.consumedMaterials) acc.hasConsumedMaterials++;
      if (task.consumedMaterials?.length > 0) acc.hasNonEmptyConsumption++;
      if (task.materials) acc.hasMaterials++;
      if (task.moNumber) acc.hasMoNumber++;
      if (task.status) acc.hasStatus++;
      return acc;
    }, {
      total: 0,
      hasConsumedMaterials: 0,
      hasNonEmptyConsumption: 0,
      hasMaterials: 0,
      hasMoNumber: 0,
      hasStatus: 0
    });
    
    console.log('[DEBUG STRUKTURA] Statystyki zadań:', stats);
  };

  // Agreguj dane konsumpcji po zmianie filtrów
  useEffect(() => {
    setLoading(true);
    
    // DEBUG: Analizuj strukturę zadań
    debugTasksStructure(tasks);
    
    // Filtruj zadania po wybranym zamówieniu przed agregacją
    let filteredTasks = tasks;
    if (selectedOrder !== 'all') {
      filteredTasks = tasks.filter(task => task.orderId === selectedOrder);
    }
    
    console.log(`[RAPORT KONSUMPCJI] Przetwarzam ${filteredTasks.length} zadań po filtrach`);
    
    const { detailedData, materialSummary } = aggregateConsumptionData(filteredTasks);
    
    // Filtruj po wybranym materiale
    const filtered = selectedMaterial === 'all' 
      ? detailedData 
      : detailedData.filter(item => item.materialId === selectedMaterial);
    
    console.log(`[RAPORT KONSUMPCJI] Wyniki: ${materialSummary.length} materiałów, ${filtered.length} szczegółowych pozycji`);
    
    setConsumptionData(materialSummary);
    setFilteredConsumption(filtered);
    setLoading(false);
  }, [tasks, consumptionStartDate, consumptionEndDate, selectedMaterial, selectedOrder]);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2
    }).format(value);
  };

  const formatQuantity = (value, precision = 3) => {
    return Number(value).toFixed(precision);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Filtry dla konsumpcji */}
      <Paper sx={{ p: isMobile ? 1.5 : 3, mb: isMobile ? 1.5 : 3 }}>
        <Typography variant="h6" gutterBottom>
          Filtry konsumpcji materiałów
        </Typography>
        <Grid container spacing={isMobile ? 1 : 3} alignItems="center">
          <Grid item xs={12} sm={6} md={3}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={plLocale}>
              <DatePicker
                label="Data początkowa"
                value={consumptionStartDate}
                onChange={(newDate) => setConsumptionStartDate(newDate)}
                slotProps={{ 
                  textField: { 
                    fullWidth: true,
                    size: "small"
                  } 
                }}
              />
            </LocalizationProvider>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={plLocale}>
              <DatePicker
                label="Data końcowa"
                value={consumptionEndDate}
                onChange={(newDate) => setConsumptionEndDate(newDate)}
                slotProps={{ 
                  textField: { 
                    fullWidth: true,
                    size: "small"
                  } 
                }}
              />
            </LocalizationProvider>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Zamówienie (CO)</InputLabel>
              <Select
                value={selectedOrder}
                onChange={(e) => setSelectedOrder(e.target.value)}
                label="Zamówienie (CO)"
              >
                <MenuItem value="all">Wszystkie zamówienia</MenuItem>
                {ordersList.map(order => (
                  <MenuItem key={order.id} value={order.id}>
                    CO #{order.number}
                    {order.customer && ` - ${order.customer.name || order.customer}`}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Materiał</InputLabel>
              <Select
                value={selectedMaterial}
                onChange={(e) => setSelectedMaterial(e.target.value)}
                label="Materiał"
              >
                <MenuItem value="all">Wszystkie materiały</MenuItem>
                {materialsList.map(material => (
                  <MenuItem key={material.id} value={material.id}>
                    {material.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {/* Podsumowanie konsumpcji materiałów */}
      <Paper sx={{ p: isMobile ? 1.5 : 3, mb: isMobile ? 1.5 : 3 }}>
        <Typography variant="h6" gutterBottom>
          Podsumowanie konsumpcji materiałów
        </Typography>
        <Typography variant="body2" color="text.secondary" paragraph>
          Okres: {format(consumptionStartDate, 'dd.MM.yyyy')} - {format(consumptionEndDate, 'dd.MM.yyyy')}
        </Typography>
        
        {consumptionData.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              Brak podsumowania konsumpcji
            </Typography>
            <Typography color="text.secondary">
              Nie znaleziono żadnej konsumpcji materiałów w wybranym okresie i filtrach.
            </Typography>
          </Box>
        ) : (
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Materiał</TableCell>
                  <TableCell align="right">Łączna ilość</TableCell>
                  <TableCell>Jednostka</TableCell>
                  <TableCell align="right">Średnia cena jedn.</TableCell>
                  <TableCell align="right">Łączny koszt</TableCell>
                  <TableCell align="center">Liczba partii</TableCell>
                  <TableCell align="center">Liczba zadań</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {consumptionData.map((material, index) => (
                  <TableRow key={index} hover>
                    <TableCell sx={{ fontWeight: 'medium' }}>
                      {material.materialName}
                    </TableCell>
                    <TableCell align="right">
                      {formatQuantity(material.totalQuantity)}
                    </TableCell>
                    <TableCell>{material.unit}</TableCell>
                    <TableCell align="right">
                      {formatCurrency(material.avgUnitPrice)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                      {formatCurrency(material.totalCost)}
                    </TableCell>
                    <TableCell align="center">
                      <Chip 
                        label={material.batchCount} 
                        size="small" 
                        color="primary" 
                        variant="outlined" 
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Chip 
                        label={material.taskCount} 
                        size="small" 
                        color="secondary" 
                        variant="outlined" 
                      />
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow sx={{ '& td': { fontWeight: 'bold', bgcolor: 'rgba(0, 0, 0, 0.04)' } }}>
                  <TableCell>SUMA:</TableCell>
                  <TableCell align="right">-</TableCell>
                  <TableCell>-</TableCell>
                  <TableCell align="right">-</TableCell>
                  <TableCell align="right">
                    {formatCurrency(consumptionData.reduce((sum, material) => sum + material.totalCost, 0))}
                  </TableCell>
                  <TableCell align="center">
                    {consumptionData.reduce((sum, material) => sum + material.batchCount, 0)}
                  </TableCell>
                  <TableCell align="center">
                    {new Set(consumptionData.flatMap(material => material.taskCount)).size}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Szczegółowa lista konsumpcji */}
      <Paper sx={{ p: isMobile ? 1.5 : 3 }}>
        <Typography variant="h6" gutterBottom>
          Szczegółowa lista konsumpcji
        </Typography>
        
        {filteredConsumption.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              Brak danych konsumpcji materiałów
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              W wybranym okresie ({format(consumptionStartDate, 'dd.MM.yyyy')} - {format(consumptionEndDate, 'dd.MM.yyyy')}) nie znaleziono żadnych danych konsumpcji materiałów.
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Możliwe przyczyny:
            </Typography>
            <Box component="ul" sx={{ textAlign: 'left', display: 'inline-block', mt: 1 }}>
              <Typography component="li" variant="body2" color="text.secondary">
                Brak zadań produkcyjnych z zapisaną konsumpcją w tym okresie
              </Typography>
              <Typography component="li" variant="body2" color="text.secondary">
                Konsumpcja materiałów nie została jeszcze zarejestrowana
              </Typography>
              <Typography component="li" variant="body2" color="text.secondary">
                Sprawdź zakres dat lub filtry materiałów/zamówień
              </Typography>
            </Box>
          </Box>
        ) : (
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Data konsumpcji</TableCell>
                  <TableCell>Zadanie MO</TableCell>
                  <TableCell>Zamówienie (CO)</TableCell>
                  <TableCell>Produkt</TableCell>
                  <TableCell>Materiał</TableCell>
                  <TableCell>Partia</TableCell>
                  <TableCell align="right">Ilość</TableCell>
                  <TableCell>Jednostka</TableCell>
                  <TableCell align="right">Cena jedn.</TableCell>
                  <TableCell align="right">Koszt</TableCell>
                  <TableCell>Użytkownik</TableCell>
                  <TableCell align="center">Wliczaj w koszty</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredConsumption.map((consumption, index) => {
                  // Znajdź zadanie aby pobrać informacje o zamówieniu
                  const task = tasks.find(t => t.id === consumption.taskId);
                  const orderNumber = task?.orderNumber || '-';
                  const customerName = task?.customer?.name || task?.customer || '';
                  
                  return (
                    <TableRow key={index} hover>
                      <TableCell>
                        {consumption.consumptionDate 
                          ? format(consumption.consumptionDate, 'dd.MM.yyyy HH:mm')
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                            {consumption.taskName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            MO: {consumption.moNumber || '-'}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                            CO #{orderNumber}
                          </Typography>
                          {customerName && (
                            <Typography variant="caption" color="text.secondary">
                              {customerName}
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>{consumption.productName}</TableCell>
                      <TableCell sx={{ fontWeight: 'medium' }}>
                        {consumption.materialName}
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
                        {consumption.batchNumber}
                      </TableCell>
                      <TableCell align="right">
                        {formatQuantity(consumption.quantity)}
                      </TableCell>
                      <TableCell>{consumption.unit}</TableCell>
                      <TableCell align="right">
                        {formatCurrency(consumption.unitPrice)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                        {formatCurrency(consumption.totalCost)}
                      </TableCell>
                      <TableCell>{consumption.userName}</TableCell>
                      <TableCell align="center">
                        <Chip 
                          label={consumption.includeInCosts ? 'TAK' : 'NIE'}
                          size="small"
                          color={consumption.includeInCosts ? 'success' : 'default'}
                          variant={consumption.includeInCosts ? 'filled' : 'outlined'}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Box>
  );
};

export default ProductionReportPage; 