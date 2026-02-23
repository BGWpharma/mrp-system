import React, { useState, useEffect, useRef } from 'react';
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
import { useTranslation } from '../../../hooks/useTranslation';

const HallDataMachinesPage = () => {
  const { t } = useTranslation('machines');
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
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
  
  // OPTYMALIZACJA: Ref do debounce timera i flagi widoczności
  const debounceTimerRef = useRef(null);
  const isPageVisibleRef = useRef(true);
  const lastDataHashRef = useRef(null);
  
  // OPTYMALIZACJA: Page Visibility API - zatrzymaj aktualizacje gdy strona ukryta
  useEffect(() => {
    const handleVisibilityChange = () => {
      isPageVisibleRef.current = !document.hidden;
      console.log(`[HallData Machines] Widoczność strony: ${isPageVisibleRef.current ? 'widoczna' : 'ukryta'}`);
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);
  
  // Pobieranie danych z podsumowań maszyn
  useEffect(() => {
    setLoading(true);
    setError(null);
    setPermissionError(false);
    
    // Referencja do węzła weight_summaries w realtime database
    const summariesRef = ref(rtdb, 'weight_summaries');
    
    // OPTYMALIZACJA: Debounce time (3 sekundy)
    const DEBOUNCE_TIME = 3000;
    
    const unsubscribe = onValue(summariesRef, (snapshot) => {
      // OPTYMALIZACJA: Nie aktualizuj gdy strona jest ukryta
      if (!isPageVisibleRef.current) {
        console.log('[HallData Machines] Strona ukryta - pomijam aktualizację');
        return;
      }
      
      if (snapshot.exists()) {
        const data = snapshot.val();
        
        // OPTYMALIZACJA: Sprawdź czy dane się zmieniły (prosty hash)
        const dataHash = JSON.stringify(Object.keys(data).sort());
        if (lastDataHashRef.current === dataHash) {
          console.log('[HallData Machines] Dane bez zmian - pomijam aktualizację');
          return;
        }
        
        // OPTYMALIZACJA: Debouncing - opóźnij aktualizację
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }
        
        debounceTimerRef.current = setTimeout(() => {
          const summariesArray = [];
          
          // Przetworzenie danych do formatu tablicy
          Object.keys(data).forEach(machineId => {
            const machineData = data[machineId];
            summariesArray.push({
              id: machineId,
              ...machineData
            });
          });
          
          lastDataHashRef.current = dataHash;
          setMachineSummaries(summariesArray);
          setFilteredSummaries(summariesArray);
          
          // Jeśli nie wybrano wcześniej maszyny, wybierz pierwszą dostępną
          if (summariesArray.length > 0 && !selectedMachine) {
            setSelectedMachine(summariesArray[0].id);
          }
          
          setLoading(false);
          console.log(`[HallData Machines] Zaktualizowano ${summariesArray.length} maszyn`);
        }, DEBOUNCE_TIME);
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
    
    return () => {
      unsubscribe();
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [rtdb]);
  
  // Pobieranie historii dla wybranej maszyny
  useEffect(() => {
    if (!selectedMachine) return;
    
    let cancelled = false;
    setLoading(true);
    
    (async () => {
      try {
        const historyRef = ref(rtdb, `weight_summaries_history/${selectedMachine}`);
        const historySnapshot = await get(historyRef);
        if (cancelled) return;
        
        if (historySnapshot.exists()) {
          const historyData = historySnapshot.val();
          const historyArray = [];
          
          Object.keys(historyData).forEach(key => {
            historyArray.push({
              id: key,
              ...historyData[key]
            });
          });
          
          if (isFilteringByDate && selectedDate) {
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
        if (cancelled) return;
        console.error("Błąd podczas pobierania historii:", error);
        setLoading(false);
        setError(t('machines.errors.loadingError'));
      }
    })();
    
    return () => { cancelled = true; };
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
  
  // Formatowanie daty - ZACHOWANIE ORYGINALNEGO FORMATU
  const formatDate = (dateString) => {
    if (!dateString) return t('machines.formats.noData');
    try {
      return format(new Date(dateString), 'dd.MM.yyyy HH:mm:ss', { locale: pl });
    } catch (error) {
      return t('machines.formats.invalidDate');
    }
  };
  
  // Formatowanie samej daty bez czasu - ZACHOWANIE ORYGINALNEGO FORMATU
  const formatDateOnly = (date) => {
    if (!date || !isValid(date)) return t('machines.formats.noData');
    try {
      return format(date, 'dd.MM.yyyy', { locale: pl });
    } catch (error) {
      return t('machines.formats.invalidDate');
    }
  };
  
  // Formatowanie czasu trwania (w minutach)
  const formatDuration = (minutes) => {
    if (!minutes && minutes !== 0) return t('machines.formats.noData');
    
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    
    if (hours > 0) {
      return `${hours}${t('machines.formats.hours')} ${mins}${t('machines.formats.minutes')}`;
    } else {
      return `${mins}${t('machines.formats.minutes')}`;
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
          label={t('machines.status.ok')} 
          color="success" 
          size="small" 
          variant="outlined"
        />;
      case 'error':
        return <Chip 
          icon={<ErrorIcon />} 
          label={t('machines.status.errors')} 
          color="error" 
          size="small" 
          variant="outlined"
        />;
      default:
        return <Chip 
          icon={<InfoIcon />} 
          label={t('machines.status.noData')} 
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
        <Alert severity="info">{t('machines.selectMachine')}</Alert>
      );
    }
    
    const machine = machineSummaries.find(m => m.id === selectedMachine);
    
    if (!machine) {
      return (
        <Alert severity="warning">{t('machines.machineNotFound')}</Alert>
      );
    }
    
    return (
      <Box sx={{ mb: 4 }}>
        <Card elevation={3} sx={{ mb: 4, borderRadius: 2 }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h5" component="div" sx={{ display: 'flex', alignItems: 'center' }}>
                <FactoryIcon sx={{ mr: 1 }} />
                {machine.machine_id || t('machines.unidentifiedMachine')}
              </Typography>
              {renderStatusChip(getMachineStatus(machine.errors_count))}
            </Box>
            
            <Divider sx={{ my: 2 }} />
            
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6} md={3}>
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="subtitle2" color="text.secondary">{t('machines.fields.duration')}</Typography>
                  <Typography variant="h6">{formatDuration(machine.duration_minutes)}</Typography>
                </Box>
              </Grid>
              
              <Grid item xs={12} sm={6} md={3}>
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="subtitle2" color="text.secondary">{t('machines.fields.totalReadings')}</Typography>
                  <Typography variant="h6">{machine.total_readings || 0}</Typography>
                </Box>
              </Grid>
              
              <Grid item xs={12} sm={6} md={3}>
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="subtitle2" color="text.secondary">{t('machines.fields.nonEmptyReadings')}</Typography>
                  <Typography variant="h6">{machine.non_empty_readings || 0}</Typography>
                </Box>
              </Grid>
              
              <Grid item xs={12} sm={6} md={3}>
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="subtitle2" color="text.secondary">{t('machines.fields.uniqueProducts')}</Typography>
                  <Typography variant="h6">{machine.unique_products_count || 0}</Typography>
                </Box>
              </Grid>
            </Grid>
            
            <Divider sx={{ my: 2 }} />
            
            <Grid container spacing={3}>
              <Grid item xs={12} sm={6}>
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="subtitle2" color="text.secondary">{t('machines.fields.startTime')}</Typography>
                  <Typography variant="body1">{formatDate(machine.start_time)}</Typography>
                </Box>
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="subtitle2" color="text.secondary">{t('machines.fields.endTime')}</Typography>
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
                {t('machines.weightStats.title')}
              </Typography>
              
              <Grid container spacing={3}>
                <Grid item xs={6} sm={4} md={2}>
                  <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle2" color="text.secondary">{t('machines.weightStats.averageWeight')}</Typography>
                    <Typography variant="h6">{machine.weight_stats.avg_weight ? machine.weight_stats.avg_weight.toFixed(2) : 'N/A'} {t('machines.formats.grams')}</Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={6} sm={4} md={2}>
                  <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle2" color="text.secondary">{t('machines.weightStats.minWeight')}</Typography>
                    <Typography variant="h6">{machine.weight_stats.min_weight || 'N/A'} {t('machines.formats.grams')}</Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={6} sm={4} md={2}>
                  <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle2" color="text.secondary">{t('machines.weightStats.maxWeight')}</Typography>
                    <Typography variant="h6">{machine.weight_stats.max_weight || 'N/A'} {t('machines.formats.grams')}</Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={6} sm={4} md={2}>
                  <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle2" color="text.secondary">{t('machines.weightStats.median')}</Typography>
                    <Typography variant="h6">{machine.weight_stats.median_weight || 'N/A'} {t('machines.formats.grams')}</Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={6} sm={4} md={2}>
                  <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle2" color="text.secondary">{t('machines.weightStats.stdDev')}</Typography>
                    <Typography variant="h6">{machine.weight_stats.std_dev ? machine.weight_stats.std_dev.toFixed(2) : 'N/A'}</Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={6} sm={4} md={2}>
                  <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle2" color="text.secondary">{t('machines.weightStats.count')}</Typography>
                    <Typography variant="h6">{machine.weight_stats.count || 0}</Typography>
                  </Box>
                </Grid>
              </Grid>
              
              <Divider sx={{ my: 2 }} />
              
              <Typography variant="subtitle1" sx={{ mb: 2 }}>
                {t('machines.weightStats.rawReadings')}
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle2" color="text.secondary">{t('machines.weightStats.okReadings')}</Typography>
                    <Typography variant="h6">{machine.weight_stats.ok_count || 0} {t('machines.weightStats.readings')}</Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle2" color="text.secondary">{t('machines.weightStats.nokReadings')}</Typography>
                    <Typography variant="h6">{machine.weight_stats.nok_count || 0} {t('machines.weightStats.readings')}</Typography>
                  </Box>
                </Grid>
              </Grid>
              
              {/* Dodana sekcja informacji o produkcie */}
              <Divider sx={{ my: 2 }} />
              
              <Typography variant="subtitle1" sx={{ mb: 2 }}>
                {t('machines.weightStats.productInfo')}
              </Typography>
              <Grid container spacing={3}>
                <Grid item xs={6} sm={4} md={2}>
                  <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle2" color="text.secondary">{t('machines.weightStats.averageWeight')}</Typography>
                    <Typography variant="h6">{machine.weight_stats.final_avg_weight ? machine.weight_stats.final_avg_weight.toFixed(2) : 'N/A'} {t('machines.formats.grams')}</Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={6} sm={4} md={2}>
                  <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle2" color="text.secondary">{t('machines.weightStats.minWeight')}</Typography>
                    <Typography variant="h6">{machine.weight_stats.final_min_weight || 'N/A'} {t('machines.formats.grams')}</Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={6} sm={4} md={2}>
                  <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle2" color="text.secondary">{t('machines.weightStats.maxWeight')}</Typography>
                    <Typography variant="h6">{machine.weight_stats.final_max_weight || 'N/A'} {t('machines.formats.grams')}</Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={6} sm={4} md={2}>
                  <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle2" color="text.secondary">{t('machines.weightStats.median')}</Typography>
                    <Typography variant="h6">{machine.weight_stats.final_median_weight || 'N/A'} {t('machines.formats.grams')}</Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={6} sm={4} md={2}>
                  <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle2" color="text.secondary">{t('machines.weightStats.stdDev')}</Typography>
                    <Typography variant="h6">{machine.weight_stats.final_std_dev ? machine.weight_stats.final_std_dev.toFixed(2) : 'N/A'}</Typography>
                  </Box>
                </Grid>
              </Grid>
              
              <Grid container spacing={2} sx={{ mt: 1 }}>
                <Grid item xs={12} sm={6}>
                  <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle2" color="text.secondary">{t('machines.weightStats.okReadings')}</Typography>
                    <Typography variant="h6">{machine.weight_stats.final_ok_count || 0} {t('machines.weightStats.products')}</Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="subtitle2" color="text.secondary">{t('machines.weightStats.nokReadings')}</Typography>
                    <Typography variant="h6">{machine.weight_stats.final_nok_count || 0} {t('machines.weightStats.products')}</Typography>
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
        <Alert severity="info">{t('machines.selectMachine')}</Alert>
      );
    }
    
    const history = machineHistories[selectedMachine] || [];
    
    return (
      <Box>
        {/* Panel filtrowania */}
        <Card elevation={2} sx={{ mb: 3, borderRadius: 2, p: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography variant="subtitle1" sx={{ display: 'flex', alignItems: 'center', mb: { xs: 2, md: 0 } }}>
              <FilterAltIcon sx={{ mr: 1 }} /> {t('machines.history.filterByDate')}
            </Typography>
            
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                <DatePicker
                  label={t('machines.history.selectDate')}
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
                {t('machines.history.filter')}
              </Button>
              
              <Button 
                variant="outlined" 
                color="secondary" 
                onClick={handleResetDateFilter}
                disabled={!isFilteringByDate}
                size="small"
              >
                {t('machines.history.reset')}
              </Button>
            </Box>
          </Box>
          
          {isFilteringByDate && (
            <Box sx={{ mt: 2 }}>
              <Chip 
                label={`${t('machines.history.date')}: ${formatDateOnly(selectedDate)}`}
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
            <Table stickyHeader aria-label={t('machines.history.tableLabel')}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('machines.fields.time')}</TableCell>
                  <TableCell>{t('machines.fields.duration')}</TableCell>
                  <TableCell>{t('machines.fields.readings')}</TableCell>
                  <TableCell>{t('machines.fields.averageWeight')}</TableCell>
                  <TableCell>{t('machines.fields.okNokProducts')}</TableCell>
                  <TableCell>{t('machines.fields.status')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {history.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>{formatDate(record.end_time || record.generated_at)}</TableCell>
                    <TableCell>{formatDuration(record.duration_minutes)}</TableCell>
                    <TableCell>{record.total_readings || 0}</TableCell>
                    <TableCell>
                      {record.weight_stats?.final_avg_weight 
                        ? `${record.weight_stats.final_avg_weight.toFixed(2)} ${t('machines.formats.grams')}` 
                        : record.weight_stats?.avg_weight 
                          ? `${record.weight_stats.avg_weight.toFixed(2)} ${t('machines.formats.grams')}`
                          : 'N/A'}
                    </TableCell>
                    <TableCell>
                      {record.weight_stats?.final_ok_count !== undefined && record.weight_stats?.final_nok_count !== undefined
                        ? `${record.weight_stats.final_ok_count || 0} / ${record.weight_stats.final_nok_count || 0}`
                        : `${record.weight_stats?.ok_count || 0} / ${record.weight_stats?.nok_count || 0}`}
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
              ? t('machines.history.noDataForDate', { date: formatDateOnly(selectedDate) })
              : t('machines.history.noData')}
          </Alert>
        )}
      </Box>
    );
  };
  
  // Renderowanie listy maszyn
  const renderMachineList = () => {
    if (machineSummaries.length === 0) {
      return (
        <Alert severity="info">{t('machines.noAvailableMachines')}</Alert>
      );
    }
    
    return (
      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 1 }}>{t('machines.availableMachines')}</Typography>
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
                      {machine.machine_id || t('machines.unidentifiedMachine')}
                    </Typography>
                    {renderStatusChip(getMachineStatus(machine.errors_count))}
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {t('machines.lastMeasurement')}: {formatDate(machine.end_time)}
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
          {t('machines.permissions.denied')}
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
          <PrecisionManufacturingIcon sx={{ mr: 1 }} /> {t('machines.title')}
        </Typography>
        <Tooltip title={t('machines.refreshData')}>
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
          <Tab label={t('machines.tabs.details')} icon={<InfoIcon />} />
          <Tab label={t('machines.tabs.history')} icon={<ScheduleIcon />} />
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