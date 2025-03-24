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
  CircularProgress
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
  FileDownload as DownloadIcon
} from '@mui/icons-material';
import { getAllTasks } from '../../services/productionService';
import { getAllOrders } from '../../services/orderService';
import { getAllCustomers } from '../../services/customerService';

const ProductionReportPage = () => {
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

  const fetchData = async () => {
    try {
      setLoading(true);
      const [fetchedTasks, fetchedOrders, fetchedCustomers] = await Promise.all([
        getAllTasks(),
        getAllOrders(),
        getAllCustomers()
      ]);
      
      setTasks(fetchedTasks);
      setOrders(fetchedOrders);
      setCustomers(fetchedCustomers);
    } catch (error) {
      console.error('Błąd podczas pobierania danych:', error);
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
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h5" gutterBottom>
          Raporty Produkcyjne
        </Typography>
      </Box>

      {/* Filtry */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={3} alignItems="center">
          <Grid item xs={12} md={3}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={plLocale}>
              <DatePicker
                label="Data początkowa"
                value={startDate}
                onChange={(newDate) => setStartDate(newDate)}
                slotProps={{ textField: { fullWidth: true } }}
              />
            </LocalizationProvider>
          </Grid>
          <Grid item xs={12} md={3}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={plLocale}>
              <DatePicker
                label="Data końcowa"
                value={endDate}
                onChange={(newDate) => setEndDate(newDate)}
                slotProps={{ textField: { fullWidth: true } }}
              />
            </LocalizationProvider>
          </Grid>
          <Grid item xs={12} md={3}>
            <FormControl fullWidth>
              <InputLabel>Klient</InputLabel>
              <Select
                value={selectedCustomer}
                onChange={(e) => setSelectedCustomer(e.target.value)}
                label="Klient"
              >
                <MenuItem value="all">Wszyscy klienci</MenuItem>
                {customers.map(customer => (
                  <MenuItem key={customer.id} value={customer.id}>
                    {customer.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={3}>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button variant="outlined" onClick={handlePreviousMonth}>
                &lt; Poprzedni miesiąc
              </Button>
              <Button variant="outlined" onClick={handleNextMonth}>
                Następny miesiąc &gt;
              </Button>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* Podsumowanie */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Liczba zadań
              </Typography>
              <Typography variant="h4" color="primary">
                {filteredTasks.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Zadania zakończone
              </Typography>
              <Typography variant="h4" color="success.main">
                {filteredTasks.filter(task => task.status === 'Zakończone').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Zadania w trakcie
              </Typography>
              <Typography variant="h4" color="warning.main">
                {filteredTasks.filter(task => task.status === 'W trakcie').length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Całkowity czas pracy
              </Typography>
              <Typography variant="h4" color="info.main">
                {formatTime(timeStats.totalMinutes)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Wykresy */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Rozkład zadań według statusu
            </Typography>
            <Box sx={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusStats}
                    cx="50%"
                    cy="50%"
                    labelLine={true}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {statusStats.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={getStatusColor(entry.name)} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${value} zadań`, 'Liczba']} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </Box>
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" gutterBottom>
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
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="value" name="Liczba zadań" fill="#8884d8" />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Tabela szczegółowa */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Szczegółowa lista zadań
        </Typography>
        <Divider sx={{ mb: 2 }} />
        
        {filteredTasks.length === 0 ? (
          <Typography align="center" sx={{ py: 3 }}>
            Brak zadań produkcyjnych w wybranym okresie.
          </Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Nazwa zadania</TableCell>
                  <TableCell>Nr MO</TableCell>
                  <TableCell>Produkt</TableCell>
                  <TableCell>Klient</TableCell>
                  <TableCell>Zaplanowana data</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Czas pracy (min)</TableCell>
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
                          color: 'white'
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
    </Container>
  );
};

export default ProductionReportPage; 