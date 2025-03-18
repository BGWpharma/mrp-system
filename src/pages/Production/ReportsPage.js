import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Paper,
  Grid,
  Button,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  Chip,
  Divider,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import {
  PieChart as PieChartIcon,
  BarChart as BarChartIcon,
  Print as PrintIcon,
  Download as DownloadIcon,
  Assessment as AssessmentIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import {
  getProductionReports,
  generateProductionReport,
  getCompletedTasksStats
} from '../../services/productionService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { pl } from 'date-fns/locale';
import { format, subDays, parseISO, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';

// Symulacja komponentu wykresu, później można zastąpić prawdziwą biblioteką
const SimplePieChart = ({ data }) => {
  return (
    <Box sx={{ 
      height: '200px', 
      display: 'flex', 
      flexDirection: 'column', 
      justifyContent: 'center', 
      alignItems: 'center',
      border: '1px dashed #ccc',
      borderRadius: '4px'
    }}>
      <PieChartIcon sx={{ fontSize: '4rem', color: 'primary.main' }} />
      <Typography variant="body2" color="textSecondary">
        Wykres kołowy (podgląd)
      </Typography>
    </Box>
  );
};

// Symulacja komponentu wykresu słupkowego
const SimpleBarChart = ({ data }) => {
  return (
    <Box sx={{ 
      height: '200px', 
      display: 'flex', 
      flexDirection: 'column', 
      justifyContent: 'center', 
      alignItems: 'center',
      border: '1px dashed #ccc',
      borderRadius: '4px'
    }}>
      <BarChartIcon sx={{ fontSize: '4rem', color: 'secondary.main' }} />
      <Typography variant="body2" color="textSecondary">
        Wykres słupkowy (podgląd)
      </Typography>
    </Box>
  );
};

const ReportsPage = () => {
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  
  const [selectedTab, setSelectedTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [reportsData, setReportsData] = useState([]);
  const [statsData, setStatsData] = useState(null);
  
  const [startDate, setStartDate] = useState(subDays(new Date(), 30));
  const [endDate, setEndDate] = useState(new Date());
  const [reportPeriod, setReportPeriod] = useState('lastMonth');
  
  // Pobieranie danych
  useEffect(() => {
    fetchReportsData();
  }, [startDate, endDate]);
  
  const fetchReportsData = async () => {
    try {
      setLoading(true);
      
      // Pobierz dane raportów
      const reports = await getProductionReports(startDate, endDate);
      setReportsData(reports);
      
      // Pobierz statystyki
      const stats = await getCompletedTasksStats(startDate, endDate);
      setStatsData(stats);
      
      setLoading(false);
    } catch (error) {
      console.error('Błąd podczas pobierania danych raportów:', error);
      showError('Nie udało się pobrać danych raportów');
      setLoading(false);
    }
  };
  
  const handleTabChange = (event, newValue) => {
    setSelectedTab(newValue);
  };
  
  const handleGenerateReport = async (type) => {
    try {
      const reportUrl = await generateProductionReport(startDate, endDate, type);
      if (reportUrl) {
        window.open(reportUrl, '_blank');
        showSuccess('Raport został wygenerowany pomyślnie');
      }
    } catch (error) {
      console.error('Błąd podczas generowania raportu:', error);
      showError('Nie udało się wygenerować raportu');
    }
  };
  
  const handlePeriodChange = (e) => {
    const period = e.target.value;
    setReportPeriod(period);
    
    const today = new Date();
    let newStartDate = today;
    let newEndDate = today;
    
    switch (period) {
      case 'last7days':
        newStartDate = subDays(today, 7);
        break;
      case 'last30days':
        newStartDate = subDays(today, 30);
        break;
      case 'lastMonth':
        newStartDate = startOfMonth(subDays(today, 1));
        newEndDate = endOfMonth(subDays(today, 1));
        break;
      case 'thisMonth':
        newStartDate = startOfMonth(today);
        newEndDate = endOfMonth(today);
        break;
      case 'custom':
        // Pozostaw daty bez zmian
        return;
      default:
        newStartDate = subDays(today, 30);
    }
    
    setStartDate(newStartDate);
    setEndDate(newEndDate);
  };
  
  const formatDateDisplay = (date) => {
    return format(date, 'dd.MM.yyyy', { locale: pl });
  };
  
  // Komponent statystyk
  const StatisticsTab = () => {
    if (!statsData) return <Alert severity="info">Brak danych statystycznych do wyświetlenia</Alert>;
    
    return (
      <Box>
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography color="textSecondary" gutterBottom>
                  Ukończone zadania
                </Typography>
                <Typography variant="h3" component="div" color="primary.main">
                  {statsData.completedTasks || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography color="textSecondary" gutterBottom>
                  Wyprodukowane produkty
                </Typography>
                <Typography variant="h3" component="div" color="secondary.main">
                  {statsData.producedItems || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography color="textSecondary" gutterBottom>
                  Średni czas produkcji
                </Typography>
                <Typography variant="h3" component="div" color="success.main">
                  {statsData.avgProductionTime ? `${statsData.avgProductionTime}h` : 'N/A'}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Card sx={{ mt: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Produktywność według kategorii
                </Typography>
                <SimplePieChart data={statsData.productivityByCategory} />
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Card sx={{ mt: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Wynik dzienny
                </Typography>
                <SimpleBarChart data={statsData.dailyOutput} />
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>
    );
  };
  
  // Komponent z listą zadań ukończonych
  const CompletedTasksTab = () => {
    return (
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Zadanie</TableCell>
              <TableCell>Produkt</TableCell>
              <TableCell align="right">Ilość</TableCell>
              <TableCell>Data rozpoczęcia</TableCell>
              <TableCell>Data zakończenia</TableCell>
              <TableCell>Czas produkcji</TableCell>
              <TableCell>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {reportsData.filter(task => task.status === 'Zakończone').map((task) => (
              <TableRow key={task.id}>
                <TableCell>{task.name}</TableCell>
                <TableCell>{task.productName}</TableCell>
                <TableCell align="right">{task.quantity} {task.unit}</TableCell>
                <TableCell>{task.startDate ? formatDateDisplay(parseISO(task.startDate)) : '-'}</TableCell>
                <TableCell>{task.completionDate ? formatDateDisplay(parseISO(task.completionDate)) : '-'}</TableCell>
                <TableCell>
                  {task.productionTime ? `${task.productionTime}h` : '-'}
                </TableCell>
                <TableCell>
                  <Chip 
                    label={task.status} 
                    color="success" 
                    size="small" 
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  };
  
  // Komponent z zestawieniem zużytych materiałów
  const MaterialsUsageTab = () => {
    if (!statsData || !statsData.materialsUsage || statsData.materialsUsage.length === 0) {
      return <Alert severity="info">Brak danych o zużyciu materiałów</Alert>;
    }
    
    return (
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Materiał</TableCell>
              <TableCell>Kategoria</TableCell>
              <TableCell align="right">Zużyta ilość</TableCell>
              <TableCell align="right">Średnie zużycie dzienne</TableCell>
              <TableCell align="right">Koszt</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {statsData.materialsUsage.map((material) => (
              <TableRow key={material.id}>
                <TableCell>{material.name}</TableCell>
                <TableCell>{material.category}</TableCell>
                <TableCell align="right">{material.usedQuantity} {material.unit}</TableCell>
                <TableCell align="right">{material.avgDailyUsage} {material.unit}</TableCell>
                <TableCell align="right">{material.cost ? `${material.cost} zł` : 'N/A'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  };
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h5">
          Raporty produkcyjne
        </Typography>
        <Box>
          <Button 
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchReportsData}
            sx={{ mr: 1 }}
          >
            Odśwież
          </Button>
          <Button 
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={() => handleGenerateReport('summary')}
          >
            Eksportuj raport
          </Button>
        </Box>
      </Box>
      
      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={3} alignItems="center">
          <Grid item xs={12} md={4}>
            <FormControl fullWidth>
              <InputLabel>Okres raportu</InputLabel>
              <Select
                value={reportPeriod}
                onChange={handlePeriodChange}
                label="Okres raportu"
              >
                <MenuItem value="last7days">Ostatnie 7 dni</MenuItem>
                <MenuItem value="last30days">Ostatnie 30 dni</MenuItem>
                <MenuItem value="lastMonth">Poprzedni miesiąc</MenuItem>
                <MenuItem value="thisMonth">Bieżący miesiąc</MenuItem>
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
                  setReportPeriod('custom');
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
                  setReportPeriod('custom');
                }}
                sx={{ width: '100%' }}
              />
            </LocalizationProvider>
          </Grid>
        </Grid>
      </Paper>
      
      <Typography variant="subtitle1" gutterBottom>
        Dane za okres: {formatDateDisplay(startDate)} - {formatDateDisplay(endDate)}
      </Typography>
      
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <Tabs value={selectedTab} onChange={handleTabChange} aria-label="raporty produkcyjne">
              <Tab label="Statystyki" icon={<AssessmentIcon />} iconPosition="start" />
              <Tab label="Ukończone zadania" />
              <Tab label="Zużycie materiałów" />
            </Tabs>
          </Box>
          
          <Box sx={{ py: 3 }}>
            {selectedTab === 0 && <StatisticsTab />}
            {selectedTab === 1 && <CompletedTasksTab />}
            {selectedTab === 2 && <MaterialsUsageTab />}
          </Box>
        </>
      )}
    </Container>
  );
};

export default ReportsPage; 