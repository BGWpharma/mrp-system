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
  Refresh as RefreshIcon,
  DateRange as DateRangeIcon,
  NavigateBefore as PrevIcon,
  NavigateNext as NextIcon
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
import { formatDateTime } from '../../utils/formatters';

// Symulacja komponentu wykresu, później można zastąpić prawdziwą biblioteką
const SimplePieChart = ({ data }) => {
  // Sprawdzamy, czy dane są obiektem i czy nie są puste
  const hasValidData = data && typeof data === 'object' && Object.keys(data).length > 0;
  
  if (!hasValidData) {
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
        <Typography variant="body2" color="textSecondary">
          Brak danych do wyświetlenia
        </Typography>
      </Box>
    );
  }
  
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
  // Sprawdzamy, czy dane są obiektem i czy nie są puste
  const hasValidData = data && typeof data === 'object' && Object.keys(data).length > 0;
  
  if (!hasValidData) {
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
        <Typography variant="body2" color="textSecondary">
          Brak danych do wyświetlenia
        </Typography>
      </Box>
    );
  }
  
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
      setReportsData(reports || []);
      
      // Pobierz statystyki
      const stats = await getCompletedTasksStats(startDate, endDate);
      
      // Upewniamy się, że obiekt statystyk ma prawidłową strukturę
      const defaultStats = {
        completedTasks: 0,
        producedItems: 0,
        avgProductionTime: 0,
        productivityByCategory: {},
        dailyOutput: {},
        materialsUsage: []
      };
      
      setStatsData(stats || defaultStats);
      
      setLoading(false);
    } catch (error) {
      console.error('Błąd podczas pobierania danych raportów:', error);
      showError('Nie udało się pobrać danych raportów');
      // W przypadku błędu inicjalizujemy dane domyślnymi wartościami
      setReportsData([]);
      setStatsData({
        completedTasks: 0,
        producedItems: 0,
        avgProductionTime: 0,
        productivityByCategory: {},
        dailyOutput: {},
        materialsUsage: []
      });
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
    
    // Dodatkowe sprawdzenie struktury danych
    const hasDataStructure = statsData && 
      typeof statsData.completedTasks !== 'undefined' && 
      typeof statsData.producedItems !== 'undefined';
    
    if (!hasDataStructure) {
      return <Alert severity="warning">Struktura danych statystycznych jest nieprawidłowa</Alert>;
    }
    
    return (
      <Box>
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <Card sx={{ 
              boxShadow: 3,
              transition: 'transform 0.3s, box-shadow 0.3s',
              '&:hover': {
                transform: 'translateY(-5px)',
                boxShadow: 6
              }
            }}>
              <CardContent sx={{ textAlign: 'center', py: 3 }}>
                <Typography color="primary" gutterBottom variant="subtitle1" fontWeight="bold">
                  Ukończone zadania
                </Typography>
                <Typography variant="h3" component="div" color="primary.main" fontWeight="bold">
                  {statsData.completedTasks || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <Card sx={{ 
              boxShadow: 3,
              transition: 'transform 0.3s, box-shadow 0.3s',
              '&:hover': {
                transform: 'translateY(-5px)',
                boxShadow: 6
              }
            }}>
              <CardContent sx={{ textAlign: 'center', py: 3 }}>
                <Typography color="secondary" gutterBottom variant="subtitle1" fontWeight="bold">
                  Wyprodukowane produkty
                </Typography>
                <Typography variant="h3" component="div" color="secondary.main" fontWeight="bold">
                  {statsData.producedItems || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <Card sx={{ 
              boxShadow: 3,
              transition: 'transform 0.3s, box-shadow 0.3s',
              '&:hover': {
                transform: 'translateY(-5px)',
                boxShadow: 6
              }
            }}>
              <CardContent sx={{ textAlign: 'center', py: 3 }}>
                <Typography color="success.dark" gutterBottom variant="subtitle1" fontWeight="bold">
                  Średni czas produkcji
                </Typography>
                <Typography variant="h3" component="div" color="success.main" fontWeight="bold">
                  {statsData.avgProductionTime ? `${statsData.avgProductionTime}h` : 'N/A'}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Card sx={{ 
              mt: 3, 
              boxShadow: 3,
              height: '100%'
            }}>
              <CardContent>
                <Typography variant="h6" gutterBottom color="primary.dark" fontWeight="medium">
                  Produktywność według kategorii
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <SimplePieChart data={statsData.productivityByCategory || {}} />
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Card sx={{ 
              mt: 3, 
              boxShadow: 3,
              height: '100%'
            }}>
              <CardContent>
                <Typography variant="h6" gutterBottom color="secondary.dark" fontWeight="medium">
                  Wynik dzienny
                </Typography>
                <Divider sx={{ mb: 2 }} />
                <SimpleBarChart data={statsData.dailyOutput || {}} />
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Box>
    );
  };
  
  // Komponent z listą zadań ukończonych
  const CompletedTasksTab = () => {
    const completedTasks = reportsData.filter(task => task && task.status === 'Zakończone');
    
    if (completedTasks.length === 0) {
      return <Alert severity="info">Brak ukończonych zadań w wybranym okresie</Alert>;
    }
    
    return (
      <TableContainer component={Paper} sx={{ boxShadow: 3 }}>
        <Table size="small">
          <TableHead sx={{ bgcolor: 'primary.main' }}>
            <TableRow>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Zadanie</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Produkt</TableCell>
              <TableCell align="right" sx={{ color: 'white', fontWeight: 'bold' }}>Ilość</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Data rozpoczęcia</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Data zakończenia</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Czas produkcji</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {completedTasks.map((task, index) => {
              // Bezpieczne konwersje dat
              let startDate = '-';
              let completionDate = '-';
              
              try {
                if (task.startDate) {
                  startDate = formatDateTime(new Date(task.startDate));
                }
                if (task.completionDate) {
                  completionDate = formatDateTime(new Date(task.completionDate));
                }
              } catch (error) {
                console.error('Błąd podczas formatowania dat:', error);
              }
              
              return (
                <TableRow 
                  key={task.id || `task-${index}`}
                  sx={{ 
                    '&:nth-of-type(odd)': { bgcolor: 'action.hover' },
                    '&:hover': { bgcolor: 'action.selected' }
                  }}
                >
                  <TableCell sx={{ fontWeight: 'medium' }}>{task.name || 'Brak nazwy'}</TableCell>
                  <TableCell>{task.productName || 'Brak produktu'}</TableCell>
                  <TableCell align="right">{task.quantity || 0} {task.unit || 'szt.'}</TableCell>
                  <TableCell>{startDate}</TableCell>
                  <TableCell>{completionDate}</TableCell>
                  <TableCell>
                    {task.productionTime ? `${task.productionTime}h` : '-'}
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={task.status || 'Nieznany'} 
                      color="success" 
                      size="small" 
                      sx={{ fontWeight: 'bold' }}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    );
  };
  
  // Komponent z zestawieniem zużytych materiałów
  const MaterialsUsageTab = () => {
    // Sprawdź czy statsData i materialsUsage istnieją
    if (!statsData || !Array.isArray(statsData.materialsUsage) || statsData.materialsUsage.length === 0) {
      return <Alert severity="info">Brak danych o zużyciu materiałów</Alert>;
    }
    
    return (
      <TableContainer component={Paper} sx={{ boxShadow: 3 }}>
        <Table size="small">
          <TableHead sx={{ bgcolor: 'secondary.main' }}>
            <TableRow>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Materiał</TableCell>
              <TableCell sx={{ color: 'white', fontWeight: 'bold' }}>Kategoria</TableCell>
              <TableCell align="right" sx={{ color: 'white', fontWeight: 'bold' }}>Zużyta ilość</TableCell>
              <TableCell align="right" sx={{ color: 'white', fontWeight: 'bold' }}>Średnie zużycie dzienne</TableCell>
              <TableCell align="right" sx={{ color: 'white', fontWeight: 'bold' }}>Koszt</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {statsData.materialsUsage.map((material, index) => (
              <TableRow 
                key={material.id || `material-${index}`}
                sx={{ 
                  '&:nth-of-type(odd)': { bgcolor: 'action.hover' },
                  '&:hover': { bgcolor: 'action.selected' }
                }}
              >
                <TableCell sx={{ fontWeight: 'medium' }}>{material.name || 'Nieznany'}</TableCell>
                <TableCell>{material.category || 'Inne'}</TableCell>
                <TableCell align="right">{material.usedQuantity || 0} {material.unit || 'szt.'}</TableCell>
                <TableCell align="right">{material.avgDailyUsage || 0} {material.unit || 'szt.'}</TableCell>
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
            variant="contained"
            color="primary"
            startIcon={<RefreshIcon />}
            onClick={fetchReportsData}
            sx={{ mr: 2 }}
            size="medium"
          >
            Odśwież
          </Button>
          <Button 
            variant="contained"
            color="secondary"
            startIcon={<DownloadIcon />}
            onClick={() => handleGenerateReport('summary')}
            size="medium"
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
          
          <Grid item xs={12} md={3}>
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
          
          <Grid item xs={12} md={3}>
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
          
          <Grid item xs={12} md={2} sx={{ display: 'flex', justifyContent: 'center' }}>
            <Box sx={{ display: 'flex', flexDirection: 'row' }}>
              <Button 
                variant="outlined" 
                onClick={() => {
                  const prevStart = new Date(startDate);
                  const prevEnd = new Date(endDate);
                  const diff = endDate - startDate;
                  prevStart.setTime(prevStart.getTime() - diff);
                  prevEnd.setTime(prevEnd.getTime() - diff);
                  setStartDate(prevStart);
                  setEndDate(prevEnd);
                  setReportPeriod('custom');
                }}
                sx={{ mr: 1, minWidth: 0, p: 1 }}
                size="small"
              >
                <PrevIcon fontSize="small" />
              </Button>
              <Button 
                variant="outlined" 
                onClick={() => {
                  const nextStart = new Date(startDate);
                  const nextEnd = new Date(endDate);
                  const diff = endDate - startDate;
                  nextStart.setTime(nextStart.getTime() + diff);
                  nextEnd.setTime(nextEnd.getTime() + diff);
                  setStartDate(nextStart);
                  setEndDate(nextEnd);
                  setReportPeriod('custom');
                }}
                sx={{ minWidth: 0, p: 1 }}
                size="small"
              >
                <NextIcon fontSize="small" />
              </Button>
            </Box>
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
          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
            <Tabs 
              value={selectedTab} 
              onChange={handleTabChange} 
              aria-label="raporty produkcyjne"
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
                label="Statystyki" 
                icon={<AssessmentIcon />} 
                iconPosition="start"
                sx={{ fontSize: '1rem' }}
              />
              <Tab 
                label="Ukończone zadania"
                sx={{ fontSize: '1rem' }}
              />
              <Tab 
                label="Zużycie materiałów"
                sx={{ fontSize: '1rem' }}
              />
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