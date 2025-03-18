import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Paper,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
  Chip,
  Divider
} from '@mui/material';
import {
  DateRange as DateRangeIcon,
  Refresh as RefreshIcon,
  ShoppingCart as OrderIcon,
  Print as PrintIcon,
  Download as DownloadIcon
} from '@mui/icons-material';
import { 
  getForecastData, 
  getAllPlannedTasks,
  generateMaterialsReport 
} from '../../services/productionService';
import { getAllInventoryItems } from '../../services/inventoryService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { pl } from 'date-fns/locale';
import { format, addDays, parseISO } from 'date-fns';

const ForecastPage = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  
  const [loading, setLoading] = useState(true);
  const [forecastData, setForecastData] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(addDays(new Date(), 30));
  const [timeRange, setTimeRange] = useState('30days');
  
  // Pobieranie danych
  useEffect(() => {
    fetchData();
  }, []);
  
  // Aktualizacja prognoz przy zmianie dat
  useEffect(() => {
    if (tasks.length > 0 && inventoryItems.length > 0) {
      calculateForecast();
    }
  }, [startDate, endDate, tasks, inventoryItems]);
  
  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Pobierz zaplanowane zadania produkcyjne
      const tasksData = await getAllPlannedTasks();
      setTasks(tasksData);
      
      // Pobierz wszystkie przedmioty magazynowe
      const items = await getAllInventoryItems();
      setInventoryItems(items);
      
      // Oblicz prognozę zapotrzebowania
      await calculateForecast();
      
      setLoading(false);
    } catch (error) {
      console.error('Błąd podczas pobierania danych:', error);
      showError('Nie udało się pobrać danych prognozy');
      setLoading(false);
    }
  };
  
  const calculateForecast = async () => {
    try {
      // Filtruj zadania na podstawie zakresu dat
      const filteredTasks = tasks.filter(task => {
        const taskDate = task.scheduledDate ? parseISO(task.scheduledDate) : null;
        if (!taskDate) return false;
        return taskDate >= startDate && taskDate <= endDate;
      });
      
      if (filteredTasks.length === 0) {
        setForecastData([]);
        return;
      }
      
      // Pobierz dane prognozy z serwisu (lub przelicz lokalnie, jeśli to prostsze)
      const forecast = await getForecastData(startDate, endDate, filteredTasks, inventoryItems);
      setForecastData(forecast);
    } catch (error) {
      console.error('Błąd podczas obliczania prognozy:', error);
      showError('Nie udało się obliczyć prognozy zapotrzebowania');
    }
  };
  
  const handleRefresh = () => {
    fetchData();
  };
  
  const handleGenerateReport = async () => {
    try {
      const reportUrl = await generateMaterialsReport(forecastData, startDate, endDate);
      if (reportUrl) {
        window.open(reportUrl, '_blank');
        showSuccess('Raport został wygenerowany pomyślnie');
      }
    } catch (error) {
      console.error('Błąd podczas generowania raportu:', error);
      showError('Nie udało się wygenerować raportu');
    }
  };
  
  const handleTimeRangeChange = (e) => {
    const range = e.target.value;
    setTimeRange(range);
    
    const today = new Date();
    let newEndDate;
    
    switch (range) {
      case '7days':
        newEndDate = addDays(today, 7);
        break;
      case '14days':
        newEndDate = addDays(today, 14);
        break;
      case '30days':
        newEndDate = addDays(today, 30);
        break;
      case '60days':
        newEndDate = addDays(today, 60);
        break;
      case '90days':
        newEndDate = addDays(today, 90);
        break;
      case 'custom':
        // Pozostaw daty bez zmian
        return;
      default:
        newEndDate = addDays(today, 30);
    }
    
    setStartDate(today);
    setEndDate(newEndDate);
  };
  
  const formatDateDisplay = (date) => {
    return format(date, 'dd.MM.yyyy', { locale: pl });
  };
  
  // Renderowanie statusu dostępności materiału
  const renderAvailabilityStatus = (item) => {
    const availableQuantity = item.availableQuantity || 0;
    const requiredQuantity = item.requiredQuantity || 0;
    const difference = availableQuantity - requiredQuantity;
    
    if (difference >= 0) {
      return (
        <Chip 
          label="Wystarczająca ilość" 
          color="success" 
          size="small" 
        />
      );
    } else if (difference > -requiredQuantity * 0.2) {
      return (
        <Chip 
          label="Prawie wystarczająca" 
          color="warning" 
          size="small" 
        />
      );
    } else {
      return (
        <Chip 
          label="Niewystarczająca ilość" 
          color="error" 
          size="small" 
        />
      );
    }
  };
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h5">
          Prognoza zapotrzebowania materiałów
        </Typography>
        <Box>
          <Button 
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleRefresh}
            sx={{ mr: 1 }}
          >
            Odśwież
          </Button>
          <Button 
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleGenerateReport}
          >
            Generuj raport
          </Button>
        </Box>
      </Box>
      
      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={3} alignItems="center">
          <Grid item xs={12} md={4}>
            <FormControl fullWidth>
              <InputLabel>Zakres czasowy</InputLabel>
              <Select
                value={timeRange}
                onChange={handleTimeRangeChange}
                label="Zakres czasowy"
              >
                <MenuItem value="7days">7 dni</MenuItem>
                <MenuItem value="14days">14 dni</MenuItem>
                <MenuItem value="30days">30 dni</MenuItem>
                <MenuItem value="60days">60 dni</MenuItem>
                <MenuItem value="90days">90 dni</MenuItem>
                <MenuItem value="custom">Niestandardowy</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
              <DatePicker
                label="Data początkowa"
                value={startDate}
                onChange={(newDate) => {
                  setStartDate(newDate);
                  setTimeRange('custom');
                }}
                sx={{ width: '100%' }}
              />
            </LocalizationProvider>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
              <DatePicker
                label="Data końcowa"
                value={endDate}
                onChange={(newDate) => {
                  setEndDate(newDate);
                  setTimeRange('custom');
                }}
                sx={{ width: '100%' }}
              />
            </LocalizationProvider>
          </Grid>
        </Grid>
      </Paper>
      
      <Typography variant="subtitle1" gutterBottom>
        Prognoza na okres: {formatDateDisplay(startDate)} - {formatDateDisplay(endDate)}
      </Typography>
      
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      ) : forecastData.length === 0 ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          Brak danych do wyświetlenia w wybranym okresie. Wybierz inny zakres dat lub upewnij się, że istnieją zaplanowane zadania produkcyjne.
        </Alert>
      ) : (
        <Paper sx={{ mt: 2 }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Materiał</TableCell>
                  <TableCell>Kategoria</TableCell>
                  <TableCell align="right">Dostępna ilość</TableCell>
                  <TableCell align="right">Potrzebna ilość</TableCell>
                  <TableCell align="right">Bilans</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Akcje</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {forecastData.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.category}</TableCell>
                    <TableCell align="right">{item.availableQuantity} {item.unit}</TableCell>
                    <TableCell align="right">{item.requiredQuantity} {item.unit}</TableCell>
                    <TableCell align="right">
                      <Typography
                        color={(item.availableQuantity - item.requiredQuantity) >= 0 ? 'success.main' : 'error.main'}
                      >
                        {(item.availableQuantity - item.requiredQuantity).toFixed(2)} {item.unit}
                      </Typography>
                    </TableCell>
                    <TableCell>{renderAvailabilityStatus(item)}</TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<OrderIcon />}
                        onClick={() => navigate('/purchase-orders/new')}
                      >
                        Zamów
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
      
      {forecastData.length > 0 && (
        <>
          <Divider sx={{ my: 4 }} />
          
          <Typography variant="h6" gutterBottom>
            Zadania produkcyjne w wybranym okresie
          </Typography>
          
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Zadanie</TableCell>
                  <TableCell>Produkt</TableCell>
                  <TableCell align="right">Ilość</TableCell>
                  <TableCell>Data rozpoczęcia</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tasks
                  .filter(task => {
                    const taskDate = task.scheduledDate ? parseISO(task.scheduledDate) : null;
                    if (!taskDate) return false;
                    return taskDate >= startDate && taskDate <= endDate;
                  })
                  .map((task) => (
                    <TableRow key={task.id}>
                      <TableCell>{task.name}</TableCell>
                      <TableCell>{task.productName}</TableCell>
                      <TableCell align="right">{task.quantity} {task.unit}</TableCell>
                      <TableCell>{task.scheduledDate ? formatDateDisplay(parseISO(task.scheduledDate)) : '-'}</TableCell>
                      <TableCell>
                        <Chip 
                          label={task.status} 
                          color={task.status === 'Zaplanowane' ? 'primary' : 'default'} 
                          size="small" 
                        />
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Container>
  );
};

export default ForecastPage; 