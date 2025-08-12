import React, { useState, useEffect } from 'react';
import { 
  Typography, 
  Paper, 
  Box, 
  Container, 
  Grid, 
  CircularProgress, 
  FormControl, 
  InputLabel, 
  Select, 
  MenuItem, 
  Alert, 
  Link,
  Tabs,
  Tab,
  Button,
  IconButton,
  TextField,
  Slider,
  Divider,
  Card,
  CardContent,
  useTheme,
  useMediaQuery,
  Stack,
  Tooltip,
  ToggleButtonGroup,
  ToggleButton
} from '@mui/material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DateTimePicker } from '@mui/x-date-pickers';
import { pl } from 'date-fns/locale';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  Legend, 
  ResponsiveContainer,
  AreaChart,
  Area,
  ReferenceLine
} from 'recharts';
import { ref, onValue, get, query, orderByChild, limitToLast, startAt, endAt } from 'firebase/database';
import { rtdb } from '../../../services/firebase/config';
import { 
  AccessTime as AccessTimeIcon,
  Thermostat as ThermostatIcon,
  Opacity as OpacityIcon,
  Refresh as RefreshIcon,
  DataUsage as DataUsageIcon,
  DateRange as DateRangeIcon,
  ShowChart as ShowChartIcon,
  Timeline as TimelineIcon
} from '@mui/icons-material';
import { format, subHours, subDays, subWeeks, subMonths, isValid } from 'date-fns';
import { useTranslation } from '../../../hooks/useTranslation';

const HallDataConditionsPage = () => {
  const { t } = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [permissionError, setPermissionError] = useState(false);
  const [sensors, setSensors] = useState([]);
  const [selectedSensor, setSelectedSensor] = useState('');
  const [currentData, setCurrentData] = useState({
    temperature: 0,
    humidity: 0,
    timestamp: null
  });
  const [historyData, setHistoryData] = useState([]);
  
  // Nowe stany do obsługi przedziałów czasowych
  const [timeRange, setTimeRange] = useState('day');
  const [startDate, setStartDate] = useState(subDays(new Date(), 1));
  const [endDate, setEndDate] = useState(new Date());
  const [chartType, setChartType] = useState('area');
  const [isCustomRange, setIsCustomRange] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  // Wykres - oś Y - min/max temperatura
  const [tempMinMax, setTempMinMax] = useState({ min: 15, max: 30 });
  // Wykres - oś Y - min/max wilgotność
  const [humidityMinMax, setHumidityMinMax] = useState({ min: 20, max: 50 });

  // Predefiniowane zakresy czasu z tłumaczeniami
  const TIME_RANGES = [
    { label: t('environmentalConditions.timeRanges.lastHour'), value: 'hour', fn: () => subHours(new Date(), 1) },
    { label: t('environmentalConditions.timeRanges.last6Hours'), value: '6hours', fn: () => subHours(new Date(), 6) },
    { label: t('environmentalConditions.timeRanges.last12Hours'), value: '12hours', fn: () => subHours(new Date(), 12) },
    { label: t('environmentalConditions.timeRanges.today'), value: 'today', fn: () => new Date(new Date().setHours(0, 0, 0, 0)) },
    { label: t('environmentalConditions.timeRanges.lastDay'), value: 'day', fn: () => subDays(new Date(), 1) },
    { label: t('environmentalConditions.timeRanges.lastWeek'), value: 'week', fn: () => subWeeks(new Date(), 1) },
    { label: t('environmentalConditions.timeRanges.lastMonth'), value: 'month', fn: () => subMonths(new Date(), 1) },
    { label: t('environmentalConditions.timeRanges.custom'), value: 'custom', fn: () => null }
  ];

  // Pobieranie listy dostępnych czujników
  useEffect(() => {
    setLoading(true);
    const sensorsRef = ref(rtdb, 'sensors');
    
    onValue(sensorsRef, (snapshot) => {
      if (snapshot.exists()) {
        const sensorsData = snapshot.val();
        // Zmodyfikowana metoda konwersji danych z nowej struktury
        const sensorsList = Object.entries(sensorsData).map(([key, data]) => ({
          id: key,
          name: data.device_id || key // Używamy device_id jeśli dostępne, w przeciwnym razie key
        }));
        
        setSensors(sensorsList);
        
        // Wybierz pierwszy czujnik automatycznie jeśli nie wybrano żadnego
        if (sensorsList.length > 0 && !selectedSensor) {
          setSelectedSensor(sensorsList[0].id);
        }
      } else {
        // Brak danych czujników w bazie
        setSensors([]);
        setLoading(false);
      }
      setLoading(false);
    }, (error) => {
      console.error("Błąd podczas pobierania listy czujników:", error);
      if (error.message && error.message.includes('permission_denied')) {
        setPermissionError(true);
      }
      setError("Nie udało się pobrać listy czujników");
      setLoading(false);
    });
  }, [selectedSensor]);

  // Pobieranie aktualnych danych dla wybranego czujnika
  useEffect(() => {
    if (!selectedSensor) return;

    const sensorRef = ref(rtdb, `sensors/${selectedSensor}`);
    
    onValue(sensorRef, (snapshot) => {
      if (snapshot.exists()) {
        const sensorData = snapshot.val();
        
        // Pobierz ostatni odczyt - teraz dane są bezpośrednio w obiekcie
        const lastReading = {
          temperature: sensorData.temperature || 0,
          humidity: sensorData.humidity || 0,
          timestamp: sensorData.timestamp || new Date().toISOString()
        };
        
        setCurrentData(lastReading);
      } else {
        setCurrentData({
          temperature: 0,
          humidity: 0,
          timestamp: null
        });
      }
    }, (error) => {
      console.error("Błąd podczas pobierania aktualnych danych:", error);
      if (error.message && error.message.includes('permission_denied')) {
        setPermissionError(true);
      }
      setError("Nie udało się pobrać aktualnych danych");
    });
  }, [selectedSensor]);

  // Aktualizacja przedziału czasu na podstawie wybranego zakresu
  useEffect(() => {
    if (timeRange === 'custom') {
      setIsCustomRange(true);
      // Nie aktualizujemy dat przy przejściu na niestandardowy zakres
    } else {
      setIsCustomRange(false);
      const selectedRange = TIME_RANGES.find(range => range.value === timeRange);
      if (selectedRange) {
        setStartDate(selectedRange.fn());
        setEndDate(new Date());
      }
    }
  }, [timeRange]);

  // Pobieranie historycznych danych z określonego przedziału czasowego
  useEffect(() => {
    if (!selectedSensor || !isValid(startDate) || !isValid(endDate)) return;
    
    setLoading(true);
    
    // Konwersja dat do formatu ISO do porównania z bazą danych
    const startTimestamp = startDate.toISOString();
    const endTimestamp = endDate.toISOString();
    
    // Nowa struktura danych - historia znajduje się bezpośrednio w węźle "history"
    // z kluczami jako identyfikatory dokumentów i wartościami jako dane odczytów
    const historyRef = ref(rtdb, 'history/' + selectedSensor);
    
    // Pobieramy wszystkie dane i filtrujemy po stronie klienta
    get(historyRef)
      .then((snapshot) => {
        if (snapshot.exists()) {
          const historyData = [];
          snapshot.forEach((childSnapshot) => {
            const reading = childSnapshot.val();
            
            // Konwertuj timestamp do formatu daty
            try {
              const date = new Date(reading.timestamp);
              
              // Sprawdź czy data mieści się w wybranym zakresie
              if (isValid(date) && date >= startDate && date <= endDate) {
                // Sprawdź, czy mamy do czynienia z długim przedziałem czasu
                const isLongRange = (timeRange === 'week' || timeRange === 'month' || 
                  (timeRange === 'custom' && (endDate - startDate) > (24 * 60 * 60 * 1000)));
                
                historyData.push({
                  time: format(date, 'HH:mm'),
                  fullTime: format(date, 'dd.MM.yyyy HH:mm'),
                  // Dla długich przedziałów czasu dodajemy datę i godzinę
                  date: isLongRange ? format(date, 'dd.MM HH:mm') : format(date, 'dd.MM'),
                  timestamp: date,
                  temperature: reading.temperature || 0,
                  humidity: reading.humidity || 0
                });
              }
            } catch (err) {
              console.error("Problem z formatowaniem daty:", err);
            }
          });
          
          // Sortuj dane wg czasu
          historyData.sort((a, b) => a.timestamp - b.timestamp);
          
          // Ogranicz ilość danych do wyświetlenia dla wydajności, jeśli jest ich zbyt dużo
          // Zachowaj reprezentatywną próbkę danych dla dłuższych okresów
          let limitedData = historyData;
          
          // Dla dłuższych okresów stosujemy próbkowanie danych zamiast zwykłego obcięcia
          if (historyData.length > 500) {
            const sampleRate = Math.ceil(historyData.length / 500);
            limitedData = historyData.filter((_, index) => index % sampleRate === 0);
            
            // Zawsze dodajemy ostatni punkt danych dla zachowania ciągłości
            if (historyData.length > 0 && limitedData.length > 0 && 
                limitedData[limitedData.length - 1] !== historyData[historyData.length - 1]) {
              limitedData.push(historyData[historyData.length - 1]);
            }
          }
          
          // Ustaw minimalną i maksymalną wartość dla osi Y
          if (limitedData.length > 0) {
            // Temperatura
            const temperatures = limitedData.map(item => Number(item.temperature));
            const minTemp = Math.floor(Math.min(...temperatures) - 1);
            const maxTemp = Math.ceil(Math.max(...temperatures) + 1);
            setTempMinMax({ min: minTemp, max: maxTemp });
            
            // Wilgotność
            const humidities = limitedData.map(item => Number(item.humidity));
            const minHumidity = Math.floor(Math.min(...humidities) - 5);
            const maxHumidity = Math.ceil(Math.max(...humidities) + 5);
            setHumidityMinMax({ min: minHumidity, max: maxHumidity });
          }
          
          setHistoryData(limitedData);
        } else {
          setHistoryData([]);
        }
        setLoading(false);
      })
      .catch((error) => {
        console.error("Błąd podczas pobierania historii:", error);
        if (error.message && error.message.includes('permission_denied')) {
          setPermissionError(true);
        } else {
          setError("Nie udało się pobrać danych historycznych: " + error.message);
        }
        setLoading(false);
      });
  }, [selectedSensor, startDate, endDate, refreshTrigger, timeRange]);

  // Obsługa zmiany wybranego czujnika
  const handleSensorChange = (event) => {
    setSelectedSensor(event.target.value);
  };

  // Obsługa zmiany przedziału czasu
  const handleTimeRangeChange = (event) => {
    setTimeRange(event.target.value);
  };

  // Obsługa zmiany typu wykresu
  const handleChartTypeChange = (event, newValue) => {
    setChartType(newValue);
  };

  // Obsługa odświeżania danych
  const handleRefresh = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  // Formatowanie daty i czasu
  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return date.toLocaleString('pl-PL');
  };
  
  // Formatowanie etykiety dla tooltipa na wykresie
  const formatTooltipLabel = (value, name) => {
    if (name === 'temperature') {
      return [`${Number(value).toFixed(1)}°C`, t('environmentalConditions.temperature')];
    }
    if (name === 'humidity') {
      return [`${Number(value).toFixed(1)}%`, t('environmentalConditions.humidity')];
    }
    return [value, name];
  };
  
  // Konfiguracja osi X dla wykresu w zależności od przedziału czasu
  const getXAxisConfig = () => {
    // Jeśli mamy dane z wielu dni, używamy daty zamiast czasu
    if (timeRange === 'week' || timeRange === 'month' || 
        (timeRange === 'custom' && startDate && endDate && 
         (endDate - startDate) > (24 * 60 * 60 * 1000))) {
      
      // Dostosuj podział osi X w zależności od ilości danych
      const interval = Math.max(1, Math.ceil(historyData.length / (isMobile ? 4 : 8)));
      
      return { 
        dataKey: 'date', 
        interval: interval,
        // Zapewniamy, że pełna informacja o dacie i godzinie jest widoczna
        tickFormatter: (value) => value
      };
    }
    
    // W przeciwnym razie używamy czasu
    const interval = Math.max(1, Math.ceil(historyData.length / (isMobile ? 8 : 15)));
    return { 
      dataKey: 'time', 
      interval: interval,
      // Dodajemy więcej informacji dla tooltipa
      tickFormatter: (value) => value
    };
  };

  if (permissionError) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Typography variant="h4" gutterBottom>{t('environmentalConditions.title')}</Typography>
        <Paper elevation={3} sx={{ p: 3 }}>
          <Alert severity="error" sx={{ mb: 3 }}>
            <Typography variant="h6">{t('environmentalConditions.errors.permissionDenied')}</Typography>
            <Typography paragraph>
              {t('environmentalConditions.errors.permissionDeniedDescription')}
            </Typography>
            <Typography variant="body2" paragraph>
              {t('environmentalConditions.errors.troubleshooting')}
            </Typography>
            <ol>
              <li>{t('environmentalConditions.errors.loginToConsole')} <Link href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer">https://console.firebase.google.com/</Link></li>
              <li>{t('environmentalConditions.errors.selectProject')}</li>
              <li>{t('environmentalConditions.errors.goToRealtimeDb')}</li>
              <li>{t('environmentalConditions.errors.clickRulesTab')}</li>
              <li>{t('environmentalConditions.errors.changeRules')}</li>
            </ol>
            <Box sx={{ bgcolor: 'background.paper', p: 2, borderRadius: 1, mb: 2 }}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
{`{
  "rules": {
    ".read": true,
    ".write": false
  }
}`}
              </pre>
            </Box>
            <Typography variant="body2">
              {t('environmentalConditions.errors.productionWarning')}
            </Typography>
          </Alert>
        </Paper>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4 }}>
        <Typography variant="h4" gutterBottom>{t('environmentalConditions.title')}</Typography>
        <Paper elevation={3} sx={{ p: 3, textAlign: 'center' }}>
          <Typography color="error">{error}</Typography>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4 }}>
      <Typography variant="h4" gutterBottom sx={{ 
        fontWeight: 'bold', 
        color: theme.palette.primary.main,
        borderBottom: `2px solid ${theme.palette.primary.main}`,
        pb: 1,
        display: 'flex',
        alignItems: 'center'
      }}>
        <ThermostatIcon sx={{ mr: 1 }} /> {t('environmentalConditions.title')}
      </Typography>
      
      {sensors.length === 0 && !loading ? (
        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography paragraph>
            {t('environmentalConditions.errors.noSensorData')}
          </Typography>
          <ul>
            <li>{t('environmentalConditions.errors.checkRealtimeDb')}</li>
            <li>{t('environmentalConditions.errors.checkDataStructure')}</li>
            <li>{t('environmentalConditions.errors.checkHistoryStructure')}</li>
          </ul>
          <Typography variant="body2">
            {t('environmentalConditions.errors.exampleDataStructure')}
          </Typography>
          <Box sx={{ bgcolor: 'background.paper', p: 2, borderRadius: 1, my: 1, overflowX: 'auto' }}>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
{`{
  "sensors": {
    "Hala_produkcyjna_1": {
      "device_id": "Hala_produkcyjna_1",
      "humidity": 45.6,
      "temperature": 21.6,
      "timestamp": "2025-04-29T16:09:49"
    }
  },
  "history": {
    "Hala_produkcyjna_1": {
      "-OP0sEJN91iVTBUM7a": {
        "humidity": 45.6,
        "temperature": 21.6,
        "timestamp": "2025-04-29T16:09:49"
      },
      "-OP0sMReTWuTDk4vj-8x": {
        "humidity": 45.3,
        "temperature": 21.5,
        "timestamp": "2025-04-29T16:04:49"
      }
    }
  }
}`}
            </pre>
          </Box>
        </Alert>
      ) : null}
      
      {/* Panel kontrolny - nowy układ */}
      <Paper 
        elevation={2} 
        sx={{ 
          p: 2, 
          mb: 3, 
          bgcolor: theme.palette.mode === 'dark' ? 'rgba(30, 40, 60, 0.8)' : 'rgba(240, 245, 250, 0.8)',
          borderRadius: 2,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 2,
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        {/* Lewa strona - wybór czujnika */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 'medium', display: 'flex', alignItems: 'center' }}>
            <DataUsageIcon sx={{ mr: 0.5, fontSize: 20, color: 'primary.main' }} />
            {t('environmentalConditions.sensor')}:
          </Typography>
          
          {sensors.length > 0 && (
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <Select
                value={selectedSensor}
                onChange={handleSensorChange}
                displayEmpty
                sx={{ 
                  bgcolor: theme.palette.mode === 'dark' ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.9)',
                  '& .MuiSelect-select': { py: 1 },
                  borderRadius: '20px'
                }}
              >
                {sensors.map((sensor) => (
                  <MenuItem key={sensor.id} value={sensor.id}>
                    {sensor.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Box>
        
        {/* Środek - wybór zakresu czasu */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 'medium', display: 'flex', alignItems: 'center' }}>
            <AccessTimeIcon sx={{ mr: 0.5, fontSize: 20, color: 'primary.main' }} />
            {t('environmentalConditions.timeRange')}:
          </Typography>
          
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <Select
              value={timeRange}
              onChange={handleTimeRangeChange}
              displayEmpty
              sx={{ 
                bgcolor: theme.palette.mode === 'dark' ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.9)',
                '& .MuiSelect-select': { py: 1 },
                borderRadius: '20px'
              }}
            >
              {TIME_RANGES.map((range) => (
                <MenuItem key={range.value} value={range.value}>
                  {range.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
        
        {/* Prawa strona - typ wykresu i odświeżanie */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 'medium', display: 'flex', alignItems: 'center' }}>
            <ShowChartIcon sx={{ mr: 0.5, fontSize: 20, color: 'primary.main' }} />
            {t('environmentalConditions.view')}:
          </Typography>
          
          <ToggleButtonGroup
            value={chartType}
            exclusive
            onChange={handleChartTypeChange}
            size="small"
            sx={{ 
              bgcolor: theme.palette.mode === 'dark' ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.9)',
              borderRadius: '20px'
            }}
          >
            <ToggleButton value="line" aria-label={t('environmentalConditions.chartTypes.line')}>
              <TimelineIcon fontSize="small" />
              <Typography variant="caption" sx={{ ml: 0.5 }}>{t('environmentalConditions.chartTypes.line')}</Typography>
            </ToggleButton>
            <ToggleButton value="area" aria-label={t('environmentalConditions.chartTypes.area')}>
              <ShowChartIcon fontSize="small" />
              <Typography variant="caption" sx={{ ml: 0.5 }}>{t('environmentalConditions.chartTypes.area')}</Typography>
            </ToggleButton>
          </ToggleButtonGroup>
          
          <Tooltip title={t('environmentalConditions.refreshData')}>
            <IconButton 
              onClick={handleRefresh} 
              color="primary"
              size="small"
              sx={{ 
                bgcolor: theme.palette.mode === 'dark' ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.9)',
                '&:hover': { bgcolor: 'primary.main', color: 'white' },
                ml: 1
              }}
            >
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Paper>
      
      {/* Karty z danymi */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={6} lg={4}>
          <Card 
            elevation={3} 
            sx={{ 
              height: '100%',
              background: `linear-gradient(135deg, ${theme.palette.background.paper} 0%, ${theme.palette.background.default} 100%)`,
              border: `1px solid ${theme.palette.divider}`,
              position: 'relative',
              overflow: 'hidden',
              borderRadius: 2
            }}
          >
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ 
                display: 'flex', 
                alignItems: 'center',
                borderBottom: `1px solid ${theme.palette.divider}`,
                pb: 1
              }}>
                <ThermostatIcon sx={{ mr: 1, color: '#e91e63' }} /> 
                {t('environmentalConditions.temperature')}
              </Typography>
              
              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                  <CircularProgress />
                </Box>
              ) : (
                <Box sx={{ textAlign: 'center', position: 'relative', py: 4 }}>
                  <Typography variant="h2" sx={{ 
                    fontWeight: 'bold', 
                    color: '#e91e63',
                    textShadow: '0px 0px 5px rgba(233, 30, 99, 0.2)'
                  }}>
                    {currentData.temperature.toFixed(1)}°C
                  </Typography>
                  
                  {currentData.timestamp && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                      {t('environmentalConditions.lastReading')}: {formatDate(currentData.timestamp)}
                    </Typography>
                  )}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={6} lg={4}>
          <Card 
            elevation={3} 
            sx={{ 
              height: '100%',
              background: `linear-gradient(135deg, ${theme.palette.background.paper} 0%, ${theme.palette.background.default} 100%)`,
              border: `1px solid ${theme.palette.divider}`,
              position: 'relative',
              overflow: 'hidden',
              borderRadius: 2
            }}
          >
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ 
                display: 'flex', 
                alignItems: 'center',
                borderBottom: `1px solid ${theme.palette.divider}`,
                pb: 1
              }}>
                <OpacityIcon sx={{ mr: 1, color: '#2196f3' }} /> 
                {t('environmentalConditions.humidity')}
              </Typography>
              
              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                  <CircularProgress />
                </Box>
              ) : (
                <Box sx={{ textAlign: 'center', position: 'relative', py: 4 }}>
                  <Typography variant="h2" sx={{ 
                    fontWeight: 'bold', 
                    color: '#2196f3',
                    textShadow: '0px 0px 5px rgba(33, 150, 243, 0.2)'
                  }}>
                    {currentData.humidity.toFixed(1)}%
                  </Typography>
                  
                  {currentData.timestamp && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                      {t('environmentalConditions.lastReading')}: {formatDate(currentData.timestamp)}
                    </Typography>
                  )}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={12} lg={4}>
          <Card 
            elevation={3} 
            sx={{ 
              height: '100%',
              background: `linear-gradient(135deg, ${theme.palette.background.paper} 0%, ${theme.palette.background.default} 100%)`,
              border: `1px solid ${theme.palette.divider}`,
              position: 'relative',
              overflow: 'hidden',
              borderRadius: 2
            }}
          >
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ 
                display: 'flex', 
                alignItems: 'center',
                borderBottom: `1px solid ${theme.palette.divider}`,
                pb: 1
              }}>
                <DateRangeIcon sx={{ mr: 1 }} /> 
                {t('environmentalConditions.dataRange')}
              </Typography>
              
              <Box sx={{ mt: 2 }}>
                <LocalizationProvider dateAdapter={AdapterDateFns} locale={pl}>
                  <Stack spacing={3}>
                    <DateTimePicker
                      label={t('environmentalConditions.startDate')}
                      value={startDate}
                      onChange={(newValue) => setStartDate(newValue)}
                      disabled={!isCustomRange}
                      slotProps={{ textField: { size: 'small', fullWidth: true } }}
                    />
                    <DateTimePicker
                      label={t('environmentalConditions.endDate')}
                      value={endDate}
                      onChange={(newValue) => setEndDate(newValue)}
                      disabled={!isCustomRange}
                      slotProps={{ textField: { size: 'small', fullWidth: true } }}
                    />
                  </Stack>
                </LocalizationProvider>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      
      {/* Wykresy historyczne */}
      <Paper 
        elevation={3} 
        sx={{ 
          p: 3, 
          borderRadius: 2,
          background: theme.palette.mode === 'dark' 
            ? `linear-gradient(45deg, ${theme.palette.background.paper} 0%, rgba(30, 40, 60, 1) 100%)`
            : `linear-gradient(45deg, ${theme.palette.background.paper} 0%, ${theme.palette.background.default} 100%)`
        }}
      >
        <Typography variant="h5" gutterBottom sx={{ fontWeight: 'bold', mb: 3, display: 'flex', alignItems: 'center' }}>
          <ShowChartIcon sx={{ mr: 1 }} /> {t('environmentalConditions.chartHistory')}
        </Typography>
        
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px' }}>
            <CircularProgress />
          </Box>
        ) : historyData.length === 0 ? (
          <Box sx={{ 
            height: '200px', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            flexDirection: 'column', 
            bgcolor: 'rgba(0,0,0,0.03)', 
            borderRadius: 1 
          }}>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
              {t('environmentalConditions.noHistoricalData')}
            </Typography>
            {selectedSensor && (
              <Typography variant="body2" color="text.secondary">
                Sprawdź strukturę danych w Firebase: <code>history/{selectedSensor}</code>
              </Typography>
            )}
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Przykładowe klucze w historii: <code>-OP0sEJN91iVTBUM7a</code>
            </Typography>
          </Box>
        ) : (
          <>
            <Typography variant="h6" gutterBottom sx={{ 
              mt: 3, 
              display: 'flex', 
              alignItems: 'center',
              color: '#e91e63'
            }}>
              <ThermostatIcon sx={{ mr: 1 }} /> {t('environmentalConditions.temperature')}
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              {chartType === 'line' ? (
                <LineChart data={historyData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="colorTemperature" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#e91e63" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#e91e63" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis {...getXAxisConfig()} stroke="#888" />
                  <YAxis 
                    domain={[tempMinMax.min, tempMinMax.max]} 
                    label={{ value: '°C', angle: -90, position: 'insideLeft' }} 
                    stroke="#888"
                  />
                  <RechartsTooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(255, 255, 255, 0.8)', 
                      border: 'none',
                      borderRadius: '4px',
                      boxShadow: '0 0 10px rgba(0,0,0,0.1)'
                    }} 
                    formatter={(value) => [`${Number(value).toFixed(1)}°C`, 'Temperatura']}
                    labelFormatter={(label) => {
                      const item = historyData.find(item => item.time === label || item.date === label);
                      return item ? item.fullTime : label;
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="temperature" 
                    stroke="#e91e63" 
                    strokeWidth={2}
                    dot={{ r: 3, strokeWidth: 2 }}
                    activeDot={{ r: 6, strokeWidth: 2 }} 
                  />
                </LineChart>
              ) : (
                <AreaChart data={historyData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="colorTemperature" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#e91e63" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#e91e63" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis {...getXAxisConfig()} stroke="#888" />
                  <YAxis 
                    domain={[tempMinMax.min, tempMinMax.max]} 
                    label={{ value: '°C', angle: -90, position: 'insideLeft' }} 
                    stroke="#888"
                  />
                  <RechartsTooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(255, 255, 255, 0.8)', 
                      border: 'none',
                      borderRadius: '4px',
                      boxShadow: '0 0 10px rgba(0,0,0,0.1)'
                    }} 
                    formatter={(value) => [`${Number(value).toFixed(1)}°C`, 'Temperatura']}
                    labelFormatter={(label) => {
                      const item = historyData.find(item => item.time === label || item.date === label);
                      return item ? item.fullTime : label;
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="temperature" 
                    stroke="#e91e63" 
                    fillOpacity={1} 
                    fill="url(#colorTemperature)" 
                    strokeWidth={2}
                    activeDot={{ r: 6, strokeWidth: 2 }} 
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>

            <Typography variant="h6" gutterBottom sx={{ 
              mt: 4, 
              display: 'flex', 
              alignItems: 'center',
              color: '#2196f3'
            }}>
              <OpacityIcon sx={{ mr: 1 }} /> {t('environmentalConditions.humidity')}
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              {chartType === 'line' ? (
                <LineChart data={historyData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="colorHumidity" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2196f3" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#2196f3" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis {...getXAxisConfig()} stroke="#888" />
                  <YAxis 
                    domain={[humidityMinMax.min, humidityMinMax.max]} 
                    label={{ value: '%', angle: -90, position: 'insideLeft' }} 
                    stroke="#888"
                  />
                  <RechartsTooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(255, 255, 255, 0.8)', 
                      border: 'none',
                      borderRadius: '4px',
                      boxShadow: '0 0 10px rgba(0,0,0,0.1)'
                    }} 
                    formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Wilgotność']}
                    labelFormatter={(label) => {
                      const item = historyData.find(item => item.time === label || item.date === label);
                      return item ? item.fullTime : label;
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="humidity" 
                    stroke="#2196f3" 
                    strokeWidth={2}
                    dot={{ r: 3, strokeWidth: 2 }}
                    activeDot={{ r: 6, strokeWidth: 2 }} 
                  />
                </LineChart>
              ) : (
                <AreaChart data={historyData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="colorHumidity" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2196f3" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#2196f3" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis {...getXAxisConfig()} stroke="#888" />
                  <YAxis 
                    domain={[humidityMinMax.min, humidityMinMax.max]} 
                    label={{ value: '%', angle: -90, position: 'insideLeft' }} 
                    stroke="#888"
                  />
                  <RechartsTooltip 
                    contentStyle={{ 
                      backgroundColor: 'rgba(255, 255, 255, 0.8)', 
                      border: 'none',
                      borderRadius: '4px',
                      boxShadow: '0 0 10px rgba(0,0,0,0.1)'
                    }} 
                    formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Wilgotność']}
                    labelFormatter={(label) => {
                      const item = historyData.find(item => item.time === label || item.date === label);
                      return item ? item.fullTime : label;
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="humidity" 
                    stroke="#2196f3" 
                    fillOpacity={1} 
                    fill="url(#colorHumidity)" 
                    strokeWidth={2}
                    activeDot={{ r: 6, strokeWidth: 2 }} 
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </>
        )}
      </Paper>
    </Container>
  );
};

export default HallDataConditionsPage; 