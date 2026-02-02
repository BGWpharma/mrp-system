// src/pages/Analytics/MixingAnalyticsPage.js
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
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
  CircularProgress,
  IconButton,
  Tooltip,
  Alert,
  Autocomplete,
  TextField,
  useTheme,
  alpha,
  ToggleButton,
  ToggleButtonGroup,
  Tabs,
  Tab
} from '@mui/material';
import {
  Blender as BlenderIcon,
  Refresh as RefreshIcon,
  Download as DownloadIcon,
  FilterList as FilterIcon,
  TableChart as TableIcon,
  BarChart as ChartIcon,
  Timeline as TimelineIcon,
  CalendarMonth as CalendarIcon
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { pl } from 'date-fns/locale';
import { 
  format, 
  subMonths, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isWeekend,
  getDay,
  startOfDay,
  endOfDay,
  differenceInBusinessDays,
  isSameDay
} from 'date-fns';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line
} from 'recharts';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { exportToCSV, formatDateForExport } from '../../utils/exportUtils';

const MixingAnalyticsPage = () => {
  const { currentUser } = useAuth();
  const { showSuccess, showError, showInfo } = useNotification();
  const { t, currentLanguage } = useTranslation('analytics');
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  // Stan
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [productionTasks, setProductionTasks] = useState([]);
  const [startDate, setStartDate] = useState(subMonths(new Date(), 1));
  const [endDate, setEndDate] = useState(new Date());
  const [selectedProduct, setSelectedProduct] = useState('');
  const [viewMode, setViewMode] = useState('table'); // 'table', 'daily', 'weekly', 'trend'
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    fetchMixingData();
  }, [startDate, endDate]);

  // Pobierz dane o mieszaniach z zadań produkcyjnych
  const fetchMixingData = async () => {
    try {
      setLoading(true);
      console.log('🔄 Pobieranie danych o mieszaniach...');

      const tasksRef = collection(db, 'productionTasks');
      
      // Konwertuj daty na Timestamp dla Firestore
      const startTimestamp = Timestamp.fromDate(startOfDay(startDate));
      const endTimestamp = Timestamp.fromDate(endOfDay(endDate));

      // Pobierz zadania z mixingPlanChecklist w wybranym okresie
      const q = query(
        tasksRef,
        where('scheduledDate', '>=', startTimestamp),
        where('scheduledDate', '<=', endTimestamp)
      );

      const snapshot = await getDocs(q);
      const tasks = [];

      snapshot.forEach(doc => {
        const data = doc.data();
        // Filtruj tylko zadania z mixingPlanChecklist
        if (data.mixingPlanChecklist && data.mixingPlanChecklist.length > 0) {
          tasks.push({
            id: doc.id,
            ...data
          });
        }
      });

      console.log(`✅ Pobrano ${tasks.length} zadań z planem mieszań`);
      setProductionTasks(tasks);
    } catch (error) {
      console.error('Błąd podczas pobierania danych mieszań:', error);
      showError(t('mixingAnalytics.errors.fetchData', 'Nie udało się pobrać danych'));
    } finally {
      setLoading(false);
    }
  };

  // Parsuj liczbę sztuk z details nagłówka mieszania
  const parsePiecesCount = (details) => {
    if (!details) return 0;
    const match = details.match(/Liczba sztuk:\s*([\d,\.]+)/);
    if (match) {
      return parseFloat(match[1].replace(',', '.')) || 0;
    }
    return 0;
  };

  // Przetwórz dane o mieszaniach
  const mixingData = useMemo(() => {
    const dataByProduct = {};
    const dataByDay = {};
    const dataByWeek = {};

    productionTasks.forEach(task => {
      const productName = task.recipeName || task.productName || 'Nieznany produkt';
      
      // Pobierz datę zadania
      let taskDate;
      if (task.scheduledDate) {
        taskDate = task.scheduledDate.toDate ? task.scheduledDate.toDate() : new Date(task.scheduledDate);
      } else if (task.createdAt) {
        taskDate = task.createdAt.toDate ? task.createdAt.toDate() : new Date(task.createdAt);
      } else {
        taskDate = new Date();
      }

      // Pomijaj weekendy (sobota=6, niedziela=0)
      const dayOfWeek = getDay(taskDate);
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        return; // Pomijamy weekendy
      }

      const dayKey = format(taskDate, 'yyyy-MM-dd');
      const weekKey = format(startOfWeek(taskDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');

      // Znajdź wszystkie nagłówki mieszań (type === 'header')
      const mixingHeaders = task.mixingPlanChecklist?.filter(item => item.type === 'header') || [];

      mixingHeaders.forEach(mixing => {
        const piecesCount = parsePiecesCount(mixing.details);

        // Agreguj per SKU/produkt
        if (!dataByProduct[productName]) {
          dataByProduct[productName] = {
            name: productName,
            totalMixings: 0,
            totalPieces: 0,
            mixingsByDay: {},
            piecesByDay: {},
            tasks: new Set()
          };
        }
        dataByProduct[productName].totalMixings++;
        dataByProduct[productName].totalPieces += piecesCount;
        dataByProduct[productName].tasks.add(task.id);

        // Agreguj per dzień dla produktu
        if (!dataByProduct[productName].mixingsByDay[dayKey]) {
          dataByProduct[productName].mixingsByDay[dayKey] = 0;
          dataByProduct[productName].piecesByDay[dayKey] = 0;
        }
        dataByProduct[productName].mixingsByDay[dayKey]++;
        dataByProduct[productName].piecesByDay[dayKey] += piecesCount;

        // Agreguj per dzień (wszystkie produkty)
        if (!dataByDay[dayKey]) {
          dataByDay[dayKey] = {
            date: dayKey,
            totalMixings: 0,
            totalPieces: 0,
            products: {}
          };
        }
        dataByDay[dayKey].totalMixings++;
        dataByDay[dayKey].totalPieces += piecesCount;
        if (!dataByDay[dayKey].products[productName]) {
          dataByDay[dayKey].products[productName] = { mixings: 0, pieces: 0 };
        }
        dataByDay[dayKey].products[productName].mixings++;
        dataByDay[dayKey].products[productName].pieces += piecesCount;

        // Agreguj per tydzień
        if (!dataByWeek[weekKey]) {
          dataByWeek[weekKey] = {
            week: weekKey,
            totalMixings: 0,
            totalPieces: 0,
            workDays: 0
          };
        }
        dataByWeek[weekKey].totalMixings++;
        dataByWeek[weekKey].totalPieces += piecesCount;
      });
    });

    // Konwertuj Set na liczbę zadań
    Object.values(dataByProduct).forEach(product => {
      product.tasksCount = product.tasks.size;
      delete product.tasks;
    });

    return {
      byProduct: Object.values(dataByProduct).sort((a, b) => b.totalPieces - a.totalPieces),
      byDay: Object.values(dataByDay).sort((a, b) => a.date.localeCompare(b.date)),
      byWeek: Object.values(dataByWeek).sort((a, b) => a.week.localeCompare(b.week))
    };
  }, [productionTasks]);

  // Oblicz liczbę dni roboczych w okresie
  const workDaysInPeriod = useMemo(() => {
    let count = 0;
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    days.forEach(day => {
      const dayOfWeek = getDay(day);
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        count++;
      }
    });
    return count;
  }, [startDate, endDate]);

  // Oblicz liczbę pełnych tygodni roboczych
  const workWeeksInPeriod = useMemo(() => {
    return workDaysInPeriod / 5;
  }, [workDaysInPeriod]);

  // Unikalne produkty do filtrowania
  const uniqueProducts = useMemo(() => {
    return mixingData.byProduct.map(p => p.name).sort();
  }, [mixingData]);

  // Filtrowane dane
  const filteredProductData = useMemo(() => {
    if (!selectedProduct) return mixingData.byProduct;
    return mixingData.byProduct.filter(p => p.name === selectedProduct);
  }, [mixingData.byProduct, selectedProduct]);

  // Statystyki ogólne
  const stats = useMemo(() => {
    const data = filteredProductData;
    const totalMixings = data.reduce((sum, p) => sum + p.totalMixings, 0);
    const totalPieces = data.reduce((sum, p) => sum + p.totalPieces, 0);
    
    return {
      totalMixings,
      totalPieces,
      avgPiecesPerMixing: totalMixings > 0 ? Math.round(totalPieces / totalMixings) : 0,
      avgPiecesPerDay: workDaysInPeriod > 0 ? Math.round(totalPieces / workDaysInPeriod) : 0,
      avgMixingsPerWeek: workWeeksInPeriod > 0 ? (totalMixings / workWeeksInPeriod).toFixed(1) : 0,
      productsCount: data.length
    };
  }, [filteredProductData, workDaysInPeriod, workWeeksInPeriod]);

  // Dane dla wykresu dziennego
  const dailyChartData = useMemo(() => {
    return mixingData.byDay.map(day => ({
      date: format(new Date(day.date), 'dd.MM'),
      fullDate: day.date,
      mixings: day.totalMixings,
      pieces: day.totalPieces
    }));
  }, [mixingData.byDay]);

  // Dane dla wykresu tygodniowego
  const weeklyChartData = useMemo(() => {
    return mixingData.byWeek.map(week => ({
      week: `Tydz. ${format(new Date(week.week), 'dd.MM')}`,
      fullWeek: week.week,
      mixings: week.totalMixings,
      pieces: week.totalPieces
    }));
  }, [mixingData.byWeek]);

  // Odśwież dane
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchMixingData();
    setRefreshing(false);
    showInfo(t('mixingAnalytics.dataRefreshed', 'Dane zostały odświeżone'));
  };

  // Eksport do CSV
  const handleExportCSV = useCallback(() => {
    if (!filteredProductData || filteredProductData.length === 0) {
      showError(t('mixingAnalytics.errors.noDataToExport', 'Brak danych do eksportu'));
      return;
    }

    try {
      const exportData = filteredProductData.map(product => ({
        sku: product.name,
        totalMixings: product.totalMixings,
        totalPieces: product.totalPieces,
        avgPiecesPerMixing: product.totalMixings > 0 
          ? Math.round(product.totalPieces / product.totalMixings) 
          : 0,
        mixingsPerWeek: workWeeksInPeriod > 0 
          ? (product.totalMixings / workWeeksInPeriod).toFixed(2) 
          : 0,
        piecesPerDay: workDaysInPeriod > 0 
          ? Math.round(product.totalPieces / workDaysInPeriod) 
          : 0,
        tasksCount: product.tasksCount
      }));

      const headers = [
        { label: 'SKU', key: 'sku' },
        { label: t('mixingAnalytics.table.totalMixings', 'Liczba mieszań'), key: 'totalMixings' },
        { label: t('mixingAnalytics.table.totalPieces', 'Liczba sztuk'), key: 'totalPieces' },
        { label: t('mixingAnalytics.table.avgPiecesPerMixing', 'Śr. sztuk/mieszanie'), key: 'avgPiecesPerMixing' },
        { label: t('mixingAnalytics.table.mixingsPerWeek', 'Mieszań/tydzień'), key: 'mixingsPerWeek' },
        { label: t('mixingAnalytics.table.piecesPerDay', 'Sztuk/dzień'), key: 'piecesPerDay' },
        { label: t('mixingAnalytics.table.tasksCount', 'Liczba zadań'), key: 'tasksCount' }
      ];

      const startDateStr = formatDateForExport(startDate, 'yyyyMMdd');
      const endDateStr = formatDateForExport(endDate, 'yyyyMMdd');
      const filename = `analiza_mieszan_${startDateStr}_${endDateStr}`;

      const success = exportToCSV(exportData, headers, filename);
      if (success) {
        showSuccess(t('mixingAnalytics.export.success', 'Wyeksportowano raport do pliku CSV'));
      }
    } catch (error) {
      console.error('Błąd podczas eksportu:', error);
      showError(t('mixingAnalytics.export.error', 'Nie udało się wyeksportować raportu'));
    }
  }, [filteredProductData, startDate, endDate, workDaysInPeriod, workWeeksInPeriod, showSuccess, showError, t]);

  const formatDateDisplay = (date) => {
    try {
      return format(date, 'dd.MM.yyyy', { locale: pl });
    } catch {
      return '-';
    }
  };

  // Render tabeli głównej
  const renderMainTable = () => (
    <TableContainer>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 'bold' }}>SKU</TableCell>
            <TableCell align="center" sx={{ fontWeight: 'bold' }}>
              {t('mixingAnalytics.table.totalMixings', 'Liczba mieszań')}
            </TableCell>
            <TableCell align="right" sx={{ fontWeight: 'bold' }}>
              {t('mixingAnalytics.table.totalPieces', 'Liczba sztuk')}
            </TableCell>
            <TableCell align="right" sx={{ fontWeight: 'bold' }}>
              {t('mixingAnalytics.table.avgPiecesPerMixing', 'Śr. sztuk/mieszanie')}
            </TableCell>
            <TableCell align="right" sx={{ fontWeight: 'bold' }}>
              {t('mixingAnalytics.table.mixingsPerWeek', 'Mieszań/tydzień')}
            </TableCell>
            <TableCell align="right" sx={{ fontWeight: 'bold' }}>
              {t('mixingAnalytics.table.piecesPerDay', 'Sztuk/dzień')}
            </TableCell>
            <TableCell align="center" sx={{ fontWeight: 'bold' }}>
              {t('mixingAnalytics.table.tasksCount', 'Zadań')}
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {filteredProductData.map((product, index) => (
            <TableRow key={index} hover>
              <TableCell sx={{ fontWeight: 'medium' }}>{product.name}</TableCell>
              <TableCell align="center">
                <Chip 
                  label={product.totalMixings} 
                  size="small" 
                  color="primary" 
                  variant="outlined" 
                />
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                {product.totalPieces.toLocaleString('pl-PL')}
              </TableCell>
              <TableCell align="right">
                {product.totalMixings > 0 
                  ? Math.round(product.totalPieces / product.totalMixings).toLocaleString('pl-PL')
                  : '-'}
              </TableCell>
              <TableCell align="right">
                {workWeeksInPeriod > 0 
                  ? (product.totalMixings / workWeeksInPeriod).toFixed(1)
                  : '-'}
              </TableCell>
              <TableCell align="right">
                {workDaysInPeriod > 0 
                  ? Math.round(product.totalPieces / workDaysInPeriod).toLocaleString('pl-PL')
                  : '-'}
              </TableCell>
              <TableCell align="center">
                <Chip 
                  label={product.tasksCount} 
                  size="small" 
                  color="secondary" 
                  variant="outlined" 
                />
              </TableCell>
            </TableRow>
          ))}
          {/* Wiersz podsumowania */}
          <TableRow sx={{ '& td': { fontWeight: 'bold', bgcolor: 'action.hover' } }}>
            <TableCell>{t('mixingAnalytics.table.total', 'SUMA')}</TableCell>
            <TableCell align="center">
              <Chip label={stats.totalMixings} size="small" color="primary" />
            </TableCell>
            <TableCell align="right">{stats.totalPieces.toLocaleString('pl-PL')}</TableCell>
            <TableCell align="right">{stats.avgPiecesPerMixing.toLocaleString('pl-PL')}</TableCell>
            <TableCell align="right">{stats.avgMixingsPerWeek}</TableCell>
            <TableCell align="right">{stats.avgPiecesPerDay.toLocaleString('pl-PL')}</TableCell>
            <TableCell align="center">-</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </TableContainer>
  );

  // Render wykresu dziennego
  const renderDailyChart = () => (
    <Box sx={{ width: '100%', height: 400 }}>
      <ResponsiveContainer>
        <BarChart data={dailyChartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis yAxisId="left" orientation="left" stroke={theme.palette.primary.main} />
          <YAxis yAxisId="right" orientation="right" stroke={theme.palette.secondary.main} />
          <RechartsTooltip 
            contentStyle={{ 
              backgroundColor: isDarkMode ? '#333' : '#fff',
              border: `1px solid ${isDarkMode ? '#555' : '#ccc'}`
            }}
          />
          <Legend />
          <Bar 
            yAxisId="left" 
            dataKey="mixings" 
            name={t('mixingAnalytics.chart.mixings', 'Liczba mieszań')} 
            fill={theme.palette.primary.main} 
          />
          <Bar 
            yAxisId="right" 
            dataKey="pieces" 
            name={t('mixingAnalytics.chart.pieces', 'Liczba sztuk')} 
            fill={theme.palette.secondary.main} 
          />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );

  // Render wykresu tygodniowego
  const renderWeeklyChart = () => (
    <Box sx={{ width: '100%', height: 400 }}>
      <ResponsiveContainer>
        <BarChart data={weeklyChartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="week" />
          <YAxis yAxisId="left" orientation="left" stroke={theme.palette.primary.main} />
          <YAxis yAxisId="right" orientation="right" stroke={theme.palette.secondary.main} />
          <RechartsTooltip 
            contentStyle={{ 
              backgroundColor: isDarkMode ? '#333' : '#fff',
              border: `1px solid ${isDarkMode ? '#555' : '#ccc'}`
            }}
          />
          <Legend />
          <Bar 
            yAxisId="left" 
            dataKey="mixings" 
            name={t('mixingAnalytics.chart.mixings', 'Liczba mieszań')} 
            fill={theme.palette.primary.main} 
          />
          <Bar 
            yAxisId="right" 
            dataKey="pieces" 
            name={t('mixingAnalytics.chart.pieces', 'Liczba sztuk')} 
            fill={theme.palette.secondary.main} 
          />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );

  // Render wykresu trendu
  const renderTrendChart = () => (
    <Box sx={{ width: '100%', height: 400 }}>
      <ResponsiveContainer>
        <LineChart data={dailyChartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis yAxisId="left" orientation="left" stroke={theme.palette.primary.main} />
          <YAxis yAxisId="right" orientation="right" stroke={theme.palette.secondary.main} />
          <RechartsTooltip 
            contentStyle={{ 
              backgroundColor: isDarkMode ? '#333' : '#fff',
              border: `1px solid ${isDarkMode ? '#555' : '#ccc'}`
            }}
          />
          <Legend />
          <Line 
            yAxisId="left"
            type="monotone" 
            dataKey="mixings" 
            name={t('mixingAnalytics.chart.mixings', 'Liczba mieszań')} 
            stroke={theme.palette.primary.main}
            strokeWidth={2}
            dot={{ r: 4 }}
          />
          <Line 
            yAxisId="right"
            type="monotone" 
            dataKey="pieces" 
            name={t('mixingAnalytics.chart.pieces', 'Liczba sztuk')} 
            stroke={theme.palette.secondary.main}
            strokeWidth={2}
            dot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', pb: 4 }}>
      {/* Nagłówek */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          mb: 3,
          background: isDarkMode
            ? 'linear-gradient(135deg, #1e293b 0%, #334155 100%)'
            : 'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)',
          color: 'white',
          borderRadius: 3
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 2,
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mr: 2
              }}
            >
              <BlenderIcon sx={{ fontSize: 24, color: 'white' }} />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
                {t('mixingAnalytics.title', 'Analiza Mieszań')}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                {t('mixingAnalytics.subtitle', 'Wydajność mieszalnika - produkcja per SKU')}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Tooltip title={t('mixingAnalytics.export.csvTooltip', 'Eksportuj do CSV')}>
              <IconButton 
                onClick={handleExportCSV} 
                sx={{ color: 'white' }}
                disabled={refreshing || filteredProductData.length === 0}
              >
                <DownloadIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title={t('mixingAnalytics.refresh', 'Odśwież dane')}>
              <IconButton 
                onClick={handleRefresh} 
                sx={{ color: 'white' }}
                disabled={refreshing}
              >
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </Paper>

      {/* Filtry */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <FilterIcon sx={{ mr: 1, color: 'primary.main' }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {t('mixingAnalytics.filters.title', 'Filtry')}
          </Typography>
        </Box>
        <Grid container spacing={3} alignItems="center">
          <Grid item xs={12} md={3}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
              <DatePicker
                label={t('mixingAnalytics.filters.startDate', 'Data początkowa')}
                value={startDate}
                onChange={setStartDate}
                slotProps={{ textField: { fullWidth: true } }}
              />
            </LocalizationProvider>
          </Grid>
          <Grid item xs={12} md={3}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
              <DatePicker
                label={t('mixingAnalytics.filters.endDate', 'Data końcowa')}
                value={endDate}
                onChange={setEndDate}
                slotProps={{ textField: { fullWidth: true } }}
              />
            </LocalizationProvider>
          </Grid>
          <Grid item xs={12} md={4}>
            <Autocomplete
              options={uniqueProducts}
              value={selectedProduct}
              onChange={(e, newValue) => setSelectedProduct(newValue || '')}
              renderInput={(params) => (
                <TextField 
                  {...params} 
                  label={t('mixingAnalytics.filters.product', 'SKU / Produkt')} 
                  fullWidth 
                />
              )}
              freeSolo
            />
          </Grid>
          <Grid item xs={12} md={2}>
            <Typography variant="body2" color="text.secondary">
              {t('mixingAnalytics.filters.workDays', 'Dni robocze')}: <strong>{workDaysInPeriod}</strong>
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('mixingAnalytics.filters.workWeeks', 'Tygodnie')}: <strong>{workWeeksInPeriod.toFixed(1)}</strong>
            </Typography>
          </Grid>
        </Grid>
      </Paper>

      {/* Alert informacyjny */}
      <Alert severity="info" sx={{ mb: 3 }}>
        <Typography variant="body2">
          <strong>ℹ️</strong> {t('mixingAnalytics.info', 'Raport pokazuje dane produkcji z mieszań (poniedziałek-piątek). Dane są agregowane na podstawie planu mieszań z zadań produkcyjnych.')}
        </Typography>
      </Alert>

      {/* Karty statystyk */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card sx={{ 
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white'
          }}>
            <CardContent>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                {t('mixingAnalytics.stats.totalMixings', 'Łączna liczba mieszań')}
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
                {stats.totalMixings}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card sx={{ 
            background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
            color: 'white'
          }}>
            <CardContent>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                {t('mixingAnalytics.stats.totalPieces', 'Łączna ilość sztuk')}
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
                {stats.totalPieces.toLocaleString('pl-PL')}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card sx={{ 
            background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            color: 'white'
          }}>
            <CardContent>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                {t('mixingAnalytics.stats.avgPiecesPerMixing', 'Śr. sztuk/mieszanie')}
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
                {stats.avgPiecesPerMixing.toLocaleString('pl-PL')}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card sx={{ 
            background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
            color: 'white'
          }}>
            <CardContent>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                {t('mixingAnalytics.stats.avgPiecesPerDay', 'Śr. sztuk/dzień')}
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
                {stats.avgPiecesPerDay.toLocaleString('pl-PL')}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card sx={{ 
            background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
            color: 'white'
          }}>
            <CardContent>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                {t('mixingAnalytics.stats.avgMixingsPerWeek', 'Śr. mieszań/tydzień')}
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
                {stats.avgMixingsPerWeek}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Główna zawartość z zakładkami */}
      <Paper sx={{ p: 3 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs 
            value={activeTab} 
            onChange={(e, newValue) => setActiveTab(newValue)}
            variant="scrollable"
            scrollButtons="auto"
          >
            <Tab 
              icon={<TableIcon />} 
              iconPosition="start" 
              label={t('mixingAnalytics.tabs.table', 'Tabela per SKU')} 
            />
            <Tab 
              icon={<ChartIcon />} 
              iconPosition="start" 
              label={t('mixingAnalytics.tabs.daily', 'Rozkład dzienny')} 
            />
            <Tab 
              icon={<CalendarIcon />} 
              iconPosition="start" 
              label={t('mixingAnalytics.tabs.weekly', 'Rozkład tygodniowy')} 
            />
            <Tab 
              icon={<TimelineIcon />} 
              iconPosition="start" 
              label={t('mixingAnalytics.tabs.trend', 'Trend')} 
            />
          </Tabs>
        </Box>

        {/* Nagłówek z okresem */}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('mixingAnalytics.period', 'Okres')}: {formatDateDisplay(startDate)} - {formatDateDisplay(endDate)}
          {selectedProduct && ` | SKU: ${selectedProduct}`}
        </Typography>

        {/* Zawartość zakładek */}
        {activeTab === 0 && (
          filteredProductData.length > 0 ? renderMainTable() : (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="h6" color="text.secondary">
                {t('mixingAnalytics.emptyState.title', 'Brak danych mieszań w wybranym okresie')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {t('mixingAnalytics.emptyState.description', 'Zmień zakres dat lub sprawdź czy zadania mają uzupełniony plan mieszań.')}
              </Typography>
            </Box>
          )
        )}

        {activeTab === 1 && (
          dailyChartData.length > 0 ? renderDailyChart() : (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography color="text.secondary">
                {t('mixingAnalytics.emptyState.noChartData', 'Brak danych do wyświetlenia wykresu')}
              </Typography>
            </Box>
          )
        )}

        {activeTab === 2 && (
          weeklyChartData.length > 0 ? renderWeeklyChart() : (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography color="text.secondary">
                {t('mixingAnalytics.emptyState.noChartData', 'Brak danych do wyświetlenia wykresu')}
              </Typography>
            </Box>
          )
        )}

        {activeTab === 3 && (
          dailyChartData.length > 0 ? renderTrendChart() : (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography color="text.secondary">
                {t('mixingAnalytics.emptyState.noChartData', 'Brak danych do wyświetlenia wykresu')}
              </Typography>
            </Box>
          )
        )}
      </Paper>
    </Box>
  );
};

export default MixingAnalyticsPage;
