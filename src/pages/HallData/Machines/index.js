import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Card, 
  CardContent, 
  Grid, 
  Typography, 
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Tab,
  Chip,
  useTheme,
  useMediaQuery,
  Divider,
  Alert,
  IconButton,
  Menu,
  MenuItem,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  Stack
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { pl } from 'date-fns/locale';
import { format, parseISO, isValid, startOfDay, endOfDay, isSameDay } from 'date-fns';
import {
  MoreVert as MoreVertIcon,
  Refresh as RefreshIcon,
  Factory as FactoryIcon,
  Speed as SpeedIcon,
  Bolt as BoltIcon,
  Schedule as ScheduleIcon,
  CheckCircleOutline as CheckCircleOutlineIcon,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  PrecisionManufacturing as PrecisionManufacturingIcon,
  FilterAlt as FilterAltIcon,
  CalendarMonth as CalendarMonthIcon,
  Today as TodayIcon,
  Search as SearchIcon
} from '@mui/icons-material';
import { 
  ref, 
  onValue, 
  get, 
  query, 
  orderByChild, 
  limitToLast, 
  getDatabase 
} from 'firebase/database';
import { getFirestore } from 'firebase/firestore';
import { useAuth } from '../../../contexts/AuthContext';

const HallDataMachinesPage = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { currentUser } = useAuth();
  const rtdb = getDatabase();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [permissionError, setPermissionError] = useState(false);
  const [machineSummaries, setMachineSummaries] = useState([]);
  const [filteredSummaries, setFilteredSummaries] = useState([]);
  const [machineHistories, setMachineHistories] = useState({});
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isFilteringByDate, setIsFilteringByDate] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  
  // Pobieranie danych z podsumowań maszyn
  useEffect(() => {
    setLoading(true);
    setError(null);
    setPermissionError(false);
    
    // Referencja do węzła weight_summaries w realtime database
    const summariesRef = ref(rtdb, 'weight_summaries');
    
    const unsubscribe = onValue(summariesRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const summariesArray = [];
        
        // Przetworzenie danych do formatu tablicy
        Object.keys(data).forEach(machineId => {
          const machineData = data[machineId];
          summariesArray.push({
            id: machineId,
            ...machineData
          });
        });
        
        setMachineSummaries(summariesArray);
        setFilteredSummaries(summariesArray);
        
        // Jeśli nie wybrano wcześniej maszyny, wybierz pierwszą dostępną
        if (summariesArray.length > 0 && !selectedMachine) {
          setSelectedMachine(summariesArray[0].id);
        }
        
        setLoading(false);
      } else {
        setMachineSummaries([]);
        setFilteredSummaries([]);
        setLoading(false);
      }
    }, (error) => {
      console.error("Błąd podczas pobierania danych:", error);
      setLoading(false);
      if (error.message && error.message.includes('permission_denied')) {
        setPermissionError(true);
      } else {
        setError("Nie udało się pobrać danych z bazy");
      }
    });
    
    return () => unsubscribe();
  }, [rtdb]);
  
  // Pobieranie historii dla wybranej maszyny
  useEffect(() => {
    if (!selectedMachine) return;
    
    setLoading(true);
    
    const fetchAndProcessHistory = async () => {
      try {
        // Pobierz dane z historii maszyny
        const historyRef = ref(rtdb, `weight_summaries_history/${selectedMachine}`);
        const historySnapshot = await get(historyRef);
        
        if (historySnapshot.exists()) {
          const historyData = historySnapshot.val();
          const historyArray = [];
          
          // Konwersja obiektu historii do tablicy
          Object.keys(historyData).forEach(key => {
            historyArray.push({
              id: key,
              ...historyData[key]
            });
          });
          
          // Przetwarzanie w zależności od filtrowania
          if (isFilteringByDate && selectedDate) {
            // Filtruj według wybranej daty
            const filteredArray = historyArray.filter(record => {
              const recordDate = record.end_time || record.generated_at || '';
              if (!recordDate) return false;
              
              try {
                return isSameDay(new Date(recordDate), selectedDate);
              } catch (error) {
                console.error("Błąd podczas porównywania dat:", error);
                return false;
              }
            });
            
            // Sortowanie historii według timestamp (od najnowszych)
            filteredArray.sort((a, b) => {
              const dateA = a.end_time || a.generated_at || '';
              const dateB = b.end_time || b.generated_at || '';
              return new Date(dateB) - new Date(dateA);
            });
            
            setMachineHistories(prev => ({
              ...prev,
              [selectedMachine]: filteredArray
            }));
          } else {
            // Pokazuj wszystkie dane historyczne
            // Sortowanie historii według timestamp (od najnowszych)
            historyArray.sort((a, b) => {
              const dateA = a.end_time || a.generated_at || '';
              const dateB = b.end_time || b.generated_at || '';
              return new Date(dateB) - new Date(dateA);
            });
            
            setMachineHistories(prev => ({
              ...prev,
              [selectedMachine]: historyArray
            }));
          }
          
          setLoading(false);
        } else {
          setMachineHistories(prev => ({
            ...prev,
            [selectedMachine]: []
          }));
          setLoading(false);
        }
      } catch (error) {
        console.error("Błąd podczas pobierania historii:", error);
        setLoading(false);
        setError("Wystąpił błąd podczas pobierania danych historycznych");
      }
    };
    
    fetchAndProcessHistory();
  }, [selectedMachine, rtdb, isFilteringByDate, selectedDate]);
  
  // Obsługa zmiany filtrowania według daty
  const handleDateFilterChange = (newDate) => {
    if (isValid(newDate)) {
      setSelectedDate(newDate);
      setIsFilteringByDate(true);
      setDatePickerOpen(false);
      
      // Po zmianie daty, musimy ponownie przefiltrować dane historyczne
      if (selectedMachine) {
        // Filtrowanie zostanie obsłużone w useEffect
      }
    }
  };
  
  // Resetowanie filtrowania
  const handleResetDateFilter = () => {
    setIsFilteringByDate(false);
    setSelectedDate(new Date());
  };
  
  // Obsługa zmiany zakładki
  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };
  
  // Obsługa wyboru maszyny
  const handleMachineSelect = (machineId) => {
    setSelectedMachine(machineId);
  };
  
  // Formatowanie daty
  const formatDate = (dateString) => {
    if (!dateString) return 'Brak danych';
    try {
      return format(new Date(dateString), 'dd.MM.yyyy HH:mm:ss', { locale: pl });
    } catch (error) {
      return 'Nieprawidłowa data';
    }
  };
  
  // Formatowanie samej daty bez czasu
  const formatDateOnly = (date) => {
    if (!date || !isValid(date)) return 'Brak danych';
    try {
      return format(date, 'dd.MM.yyyy', { locale: pl });
    } catch (error) {
      return 'Nieprawidłowa data';
    }
  };
  
  // Formatowanie czasu trwania (w minutach)
  const formatDuration = (minutes) => {
    if (!minutes && minutes !== 0) return 'Brak danych';
    
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    
    if (hours > 0) {
      return `${hours}h ${mins}min`;
    } else {
      return `${mins}min`;
    }
  };
  
  // Zwracanie statusu na podstawie ilości błędów
  const getMachineStatus = (errorsCount) => {
    if (errorsCount === undefined || errorsCount === null) return 'unknown';
    if (errorsCount === 0) return 'ok';
    return 'error';
  };
  
  // Renderowanie statusu jako chip
  const renderStatusChip = (status) => {
    switch (status) {
      case 'ok':
        return <Chip 
          icon={<CheckCircleOutlineIcon />} 
          label="OK" 
          color="success" 
          size="small" 
          variant="outlined"
        />;
      case 'error':
        return <Chip 
          icon={<ErrorIcon />} 
          label="Błędy" 
          color="error" 
          size="small" 
          variant="outlined"
        />;
      default:
        return <Chip 
          icon={<InfoIcon />} 
          label="Brak danych" 
          color="default" 
          size="small" 
          variant="outlined"
        />;
    }
  };
  
  // Renderowanie głównego widoku aktywnej maszyny
  const renderMachineDetail = () => {
    if (!selectedMachine) {
      return (
        <Alert severity="info">Wybierz maszynę, aby zobaczyć szczegóły</Alert>
      );
    }
    
    const machine = machineSummaries.find(m => m.id === selectedMachine);
    
    if (!machine) {
      return (
        <Alert severity="warning">Nie znaleziono danych dla wybranej maszyny</Alert>
      );
    }
    
    return (
      <Box sx={{ mb: 4 }}>
        <Card elevation={3} sx={{ mb: 4, borderRadius: 2 }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h5" component="div" sx={{ display: 'flex', alignItems: 'center' }}>
                <FactoryIcon sx={{ mr: 1 }} />
                {machine.machine_id || 'Niezidentyfikowana maszyna'}
              </Typography>
              {renderStatusChip(getMachineStatus(machine.errors_count))}
            </Box>
            
            <Divider sx={{ my: 2 }} />
            
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6} md={3}>
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="subtitle2" color="text.secondary">Czas trwania</Typography>
                  <Typography variant="h6">{formatDuration(machine.duration_minutes)}</Typography>
                </Box>
              </Grid>
              
              <Grid item xs={12} sm={6} md={3}>
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="subtitle2" color="text.secondary">Całkowita ilość odczytów</Typography>
                  <Typography variant="h6">{machine.total_readings || 0}</Typography>
                </Box>
              </Grid>
              
              <Grid item xs={12} sm={6} md={3}>
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="subtitle2" color="text.secondary">Niepuste odczyty</Typography>
                  <Typography variant="h6">{machine.non_empty_readings || 0}</Typography>
                </Box>
              </Grid>
              
              <Grid item xs={12} sm={6} md={3}>
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="subtitle2" color="text.secondary">Unikalne produkty</Typography>
                  <Typography variant="h6">{machine.unique_products_count || 0}</Typography>
                </Box>
              </Grid>
            </Grid>
            
            <Divider sx={{ my: 2 }} />
            
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6}>
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="subtitle2" color="text.secondary">Czas rozpoczęcia</Typography>
                  <Typography variant="body1">{formatDate(machine.start_time)}</Typography>
                </Box>
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="subtitle2" color="text.secondary">Czas zakończenia</Typography>
                  <Typography variant="body1">{formatDate(machine.end_time)}</Typography>
                </Box>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
        
        {machine.weight_stats && (
          <Card elevation={3} sx={{ mb: 4, borderRadius: 2 }}>
            <CardContent>
              <Typography variant="h6" component="div" sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
                <SpeedIcon sx={{ mr: 1 }} />
                Statystyki wagi
              </Typography>
              
              <Grid container spacing={3}>
                <Grid item xs={6} sm={4} md={2}>
                  <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle2" color="text.secondary">Średnia waga</Typography>
                    <Typography variant="h6">{machine.weight_stats.avg_weight ? machine.weight_stats.avg_weight.toFixed(2) : 'N/A'} g</Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={6} sm={4} md={2}>
                  <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle2" color="text.secondary">Min. waga</Typography>
                    <Typography variant="h6">{machine.weight_stats.min_weight || 'N/A'} g</Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={6} sm={4} md={2}>
                  <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle2" color="text.secondary">Max. waga</Typography>
                    <Typography variant="h6">{machine.weight_stats.max_weight || 'N/A'} g</Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={6} sm={4} md={2}>
                  <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle2" color="text.secondary">Mediana</Typography>
                    <Typography variant="h6">{machine.weight_stats.median_weight || 'N/A'} g</Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={6} sm={4} md={2}>
                  <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle2" color="text.secondary">Odchylenie std.</Typography>
                    <Typography variant="h6">{machine.weight_stats.std_dev ? machine.weight_stats.std_dev.toFixed(2) : 'N/A'}</Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={6} sm={4} md={2}>
                  <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle2" color="text.secondary">Ilość</Typography>
                    <Typography variant="h6">{machine.weight_stats.count || 0}</Typography>
                  </Box>
                </Grid>
              </Grid>
              
              <Divider sx={{ my: 2 }} />
              
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle2" color="text.secondary">OK</Typography>
                    <Typography variant="h6">{machine.weight_stats.ok_count || 0} odczytów</Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle2" color="text.secondary">NOK</Typography>
                    <Typography variant="h6">{machine.weight_stats.nok_count || 0} odczytów</Typography>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        )}
      </Box>
    );
  };
  
  // Renderowanie historii maszyny
  const renderMachineHistory = () => {
    if (!selectedMachine) {
      return (
        <Alert severity="info">Wybierz maszynę, aby zobaczyć historię</Alert>
      );
    }
    
    const history = machineHistories[selectedMachine] || [];
    
    return (
      <Box>
        {/* Panel filtrowania */}
        <Card elevation={2} sx={{ mb: 3, borderRadius: 2, p: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="subtitle1" sx={{ display: 'flex', alignItems: 'center', mb: { xs: 2, md: 0 } }}>
              <FilterAltIcon sx={{ mr: 1 }} /> Filtry
            </Typography>
            
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                <DatePicker
                  label="Wybierz datę"
                  value={selectedDate}
                  onChange={handleDateFilterChange}
                  format="dd.MM.yyyy"
                  open={datePickerOpen}
                  onClose={() => setDatePickerOpen(false)}
                  slotProps={{ 
                    textField: {
                      size: "small",
                      fullWidth: true,
                      InputProps: {
                        endAdornment: (
                          <IconButton size="small" onClick={() => setDatePickerOpen(true)}>
                            <CalendarMonthIcon />
                          </IconButton>
                        ),
                      }
                    }
                  }}
                />
              </LocalizationProvider>
              
              <Button 
                variant="contained" 
                color="primary" 
                onClick={() => setIsFilteringByDate(true)}
                disabled={isFilteringByDate}
                startIcon={<SearchIcon />}
                size="small"
              >
                Filtruj
              </Button>
              
              <Button 
                variant="outlined" 
                color="secondary" 
                onClick={handleResetDateFilter}
                disabled={!isFilteringByDate}
                size="small"
              >
                Resetuj
              </Button>
            </Box>
          </Box>
          
          {isFilteringByDate && (
            <Box sx={{ mt: 2 }}>
              <Chip 
                label={`Data: ${formatDateOnly(selectedDate)}`}
                onDelete={handleResetDateFilter}
                color="primary"
                variant="outlined"
                icon={<TodayIcon />}
              />
            </Box>
          )}
        </Card>
        
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px' }}>
            <CircularProgress />
          </Box>
        ) : history.length > 0 ? (
          <TableContainer component={Paper} sx={{ mb: 4, maxHeight: 440, borderRadius: 2 }}>
            <Table stickyHeader aria-label="tabela historii">
              <TableHead>
                <TableRow>
                  <TableCell>Czas</TableCell>
                  <TableCell>Czas trwania</TableCell>
                  <TableCell>Odczyty</TableCell>
                  <TableCell>Średnia waga</TableCell>
                  <TableCell>OK/NOK</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {history.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>{formatDate(record.end_time || record.generated_at)}</TableCell>
                    <TableCell>{formatDuration(record.duration_minutes)}</TableCell>
                    <TableCell>{record.total_readings || 0}</TableCell>
                    <TableCell>
                      {record.weight_stats?.avg_weight 
                        ? `${record.weight_stats.avg_weight.toFixed(2)} g` 
                        : 'N/A'}
                    </TableCell>
                    <TableCell>
                      {`${record.weight_stats?.ok_count || 0} / ${record.weight_stats?.nok_count || 0}`}
                    </TableCell>
                    <TableCell>
                      {renderStatusChip(getMachineStatus(record.errors_count))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Alert severity="info">
            {isFilteringByDate
              ? `Brak danych historycznych dla ${formatDateOnly(selectedDate)}`
              : 'Brak danych historycznych dla tej maszyny'}
          </Alert>
        )}
      </Box>
    );
  };
  
  // Renderowanie listy maszyn
  const renderMachineList = () => {
    if (machineSummaries.length === 0) {
      return (
        <Alert severity="info">Brak dostępnych maszyn</Alert>
      );
    }
    
    return (
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>Dostępne maszyny</Typography>
        <Grid container spacing={2}>
          {machineSummaries.map(machine => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={machine.id}>
              <Card 
                sx={{ 
                  cursor: 'pointer',
                  borderRadius: 2,
                  border: selectedMachine === machine.id 
                    ? `2px solid ${theme.palette.primary.main}` 
                    : '1px solid transparent',
                  transition: 'all 0.2s ease-in-out',
                  '&:hover': {
                    boxShadow: theme.shadows[5],
                    transform: 'translateY(-4px)'
                  }
                }}
                onClick={() => handleMachineSelect(machine.id)}
                elevation={selectedMachine === machine.id ? 6 : 2}
              >
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                    <Typography variant="subtitle1" component="div">
                      {machine.machine_id || 'Niezidentyfikowana maszyna'}
                    </Typography>
                    {renderStatusChip(getMachineStatus(machine.errors_count))}
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    Ostatni pomiar: {formatDate(machine.end_time)}
                  </Typography>
                  <Box sx={{ mt: 1 }}>
                    <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center' }}>
                      <ScheduleIcon fontSize="small" sx={{ mr: 0.5 }} />
                      {formatDuration(machine.duration_minutes)}
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Box>
    );
  };
  
  if (permissionError) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          Brak uprawnień do odczytu danych z bazy. Skontaktuj się z administratorem systemu.
        </Alert>
      </Box>
    );
  }
  
  if (loading && machineSummaries.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px' }}>
        <CircularProgress />
      </Box>
    );
  }
  
  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">
          {error}
        </Alert>
      </Box>
    );
  }
  
  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" component="h1" sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
          <PrecisionManufacturingIcon sx={{ mr: 1 }} /> Maszyny - monitoring
        </Typography>
        <Tooltip title="Odśwież dane">
          <IconButton 
            onClick={() => window.location.reload()}
            color="primary"
          >
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>
      
      {renderMachineList()}
      
      <Box sx={{ mb: 3 }}>
        <Tabs 
          value={activeTab} 
          onChange={handleTabChange}
          indicatorColor="primary"
          textColor="primary"
          variant="fullWidth"
          sx={{ 
            mb: 2,
            borderBottom: `1px solid ${theme.palette.divider}`,
          }}
        >
          <Tab label="Szczegóły" icon={<InfoIcon />} />
          <Tab label="Historia" icon={<ScheduleIcon />} />
        </Tabs>
        
        <Box role="tabpanel" hidden={activeTab !== 0}>
          {activeTab === 0 && renderMachineDetail()}
        </Box>
        
        <Box role="tabpanel" hidden={activeTab !== 1}>
          {activeTab === 1 && renderMachineHistory()}
        </Box>
      </Box>
    </Box>
  );
};

export default HallDataMachinesPage; 