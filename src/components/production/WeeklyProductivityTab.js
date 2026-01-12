// src/components/production/WeeklyProductivityTab.js
import React, { useState, useMemo } from 'react';
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
  Alert,
  Divider,
  IconButton,
  Collapse,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  useTheme,
  Stack,
  Tooltip,
  TableSortLabel,
  CircularProgress
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  TrendingFlat as TrendingFlatIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  CompareArrows as CompareIcon,
  Assessment as AssessmentIcon,
  EmojiEvents as TrophyIcon,
  Speed as SpeedIcon,
  AccessTime as TimeIcon,
  Inventory2 as QuantityIcon,
  AddCircleOutline as AddIcon,
  Download as DownloadIcon
} from '@mui/icons-material';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartTooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Area
} from 'recharts';
import { format, subWeeks, startOfYear, endOfYear } from 'date-fns';
import { pl as plLocale } from 'date-fns/locale';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import {
  prepareWeeklyData,
  analyzeWeeklyTrends,
  getDailyBreakdown,
  formatWeekString
} from '../../services/weeklyProductivityService';

// Komponent karty porównania tygodnia
const WeekComparisonCard = ({ week, label }) => {
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6" gutterBottom color="primary">
          {label}
        </Typography>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          {formatWeekString(week.week)}
        </Typography>
        <Divider sx={{ my: 1 }} />
        <Stack spacing={1}>
          <Box display="flex" justifyContent="space-between">
            <Typography variant="body2">Wydajność:</Typography>
            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
              {week.productivity} szt/h
            </Typography>
          </Box>
          <Box display="flex" justifyContent="space-between">
            <Typography variant="body2">Wyprodukowano:</Typography>
            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
              {week.totalQuantity.toLocaleString('pl-PL')} szt
            </Typography>
          </Box>
          <Box display="flex" justifyContent="space-between">
            <Typography variant="body2">Czas pracy:</Typography>
            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
              {week.totalTimeHours} h
            </Typography>
          </Box>
          <Box display="flex" justifyContent="space-between">
            <Typography variant="body2">Sesji:</Typography>
            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
              {week.sessionsCount}
            </Typography>
          </Box>
          <Box display="flex" justifyContent="space-between">
            <Typography variant="body2">Efektywność:</Typography>
            <Chip 
              label={`${week.efficiency}%`} 
              size="small"
              color={week.efficiency > 80 ? 'success' : week.efficiency > 60 ? 'warning' : 'default'}
            />
          </Box>
        </Stack>
        {week.breakdown && week.breakdown.length > 0 && (
          <>
            <Divider sx={{ my: 1 }} />
            <Typography variant="subtitle2" gutterBottom>
              Top 3 produkty:
            </Typography>
            {week.breakdown.slice(0, 3).map((item, index) => (
              <Box key={index} display="flex" justifyContent="space-between" sx={{ mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  {item.moNumber || item.taskName}
                </Typography>
                <Typography variant="caption">
                  {item.timePercentage}%
                </Typography>
              </Box>
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
};

// Panel szczegółów tygodnia (rozwijany panel)
const WeekDetailsPanel = ({ week }) => {
  const dailyBreakdown = useMemo(() => {
    return getDailyBreakdown(week.sessions, week.weekStart, week.weekEnd);
  }, [week]);

  return (
    <Box sx={{ py: 2, px: 1 }}>
      <Grid container spacing={2}>
        {/* Breakdown dzienny */}
        <Grid item xs={12} md={7}>
          <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>
            Rozkład dzienny
          </Typography>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dailyBreakdown}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="dayShort" />
              <YAxis />
              <RechartTooltip />
              <Legend />
              <Bar dataKey="productivity" fill="#8884d8" name="Wydajność (szt/h)" />
              <Bar dataKey="totalQuantity" fill="#82ca9d" name="Ilość" />
            </BarChart>
          </ResponsiveContainer>
          <TableContainer sx={{ mt: 1 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Dzień</TableCell>
                  <TableCell align="right">Czas (h)</TableCell>
                  <TableCell align="right">Ilość</TableCell>
                  <TableCell align="right">Wydajność</TableCell>
                  <TableCell align="right">Sesje</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {dailyBreakdown.map((day) => (
                  <TableRow key={day.date}>
                    <TableCell>{day.dayName}</TableCell>
                    <TableCell align="right">{day.totalTimeHours}h</TableCell>
                    <TableCell align="right">{day.totalQuantity}</TableCell>
                    <TableCell align="right">{day.productivity}</TableCell>
                    <TableCell align="right">{day.sessionsCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Grid>

        {/* Breakdown według produktów */}
        <Grid item xs={12} md={5}>
          <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>
            Breakdown według produktów
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Produkt</TableCell>
                  <TableCell align="right">Czas</TableCell>
                  <TableCell align="right">Ilość</TableCell>
                  <TableCell align="right">%</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {week.breakdown && week.breakdown.slice(0, 5).map((item, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                        {item.moNumber || item.taskName}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="caption">
                        {item.totalTimeHours}h
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="caption">
                        {item.totalQuantity}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Chip 
                        label={`${item.timePercentage}%`}
                        size="small"
                        color={index === 0 ? 'primary' : 'default'}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Grid>
      </Grid>
    </Box>
  );
};

const WeeklyProductivityTab = ({ timeAnalysis, tasksMap, isMobileView, startDate, endDate, onDateChange }) => {
  const theme = useTheme();
  const [expandedWeek, setExpandedWeek] = useState(null);
  const [comparisonMode, setComparisonMode] = useState(false);
  const [selectedWeek1, setSelectedWeek1] = useState(null);
  const [selectedWeek2, setSelectedWeek2] = useState(null);
  const [chartType, setChartType] = useState('productivity'); // productivity, quantity, time
  const [quickRange, setQuickRange] = useState('8weeks');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState('week');
  const [sortDirection, setSortDirection] = useState('desc');

  // Przygotuj dane tygodniowe
  const weeksData = useMemo(() => {
    return prepareWeeklyData(timeAnalysis, tasksMap);
  }, [timeAnalysis, tasksMap]);

  // Analiza trendów
  const trends = useMemo(() => {
    return analyzeWeeklyTrends(weeksData);
  }, [weeksData]);

  // Dane do wykresu trendu
  const trendChartData = useMemo(() => {
    return weeksData.map(week => ({
      week: formatWeekString(week.week),
      weekShort: week.week.split('-W')[1],
      productivity: week.productivity,
      quantity: week.totalQuantity,
      timeHours: week.totalTimeHours,
      sessions: week.sessionsCount
    }));
  }, [weeksData]);

  // Handler rozwijania szczegółów tygodnia
  const handleExpandWeek = (weekId) => {
    setExpandedWeek(expandedWeek === weekId ? null : weekId);
  };

  // Handler trybu porównania
  const handleComparisonToggle = () => {
    setComparisonMode(!comparisonMode);
    if (!comparisonMode && weeksData.length >= 2) {
      setSelectedWeek1(weeksData[weeksData.length - 1].week);
      setSelectedWeek2(weeksData[weeksData.length - 2].week);
    }
  };

  // Handler dodawania tygodnia do porównania z tabeli
  const handleAddToComparison = (weekId) => {
    if (!comparisonMode) {
      // Włącz tryb porównania
      setComparisonMode(true);
      setSelectedWeek1(weekId);
      // Ustaw drugi tydzień jako poprzedni (jeśli istnieje)
      const weekIndex = weeksData.findIndex(w => w.week === weekId);
      if (weekIndex > 0) {
        setSelectedWeek2(weeksData[weekIndex - 1].week);
      } else if (weeksData.length > 1) {
        setSelectedWeek2(weeksData[1].week);
      }
    } else {
      // Tryb porównania już aktywny
      if (!selectedWeek1) {
        setSelectedWeek1(weekId);
      } else if (!selectedWeek2 || selectedWeek1 === weekId) {
        setSelectedWeek2(weekId);
      } else {
        // Oba tygodnie już wybrane, przesuń
        setSelectedWeek1(selectedWeek2);
        setSelectedWeek2(weekId);
      }
    }
  };

  // Handler szybkich zakresów dat
  const handleQuickRange = async (range) => {
    setQuickRange(range);
    setIsRefreshing(true);
    
    const today = new Date();
    let newStartDate, newEndDate;
    
    switch (range) {
      case '4weeks':
        newStartDate = subWeeks(today, 4);
        newEndDate = today;
        break;
      case '8weeks':
        newStartDate = subWeeks(today, 8);
        newEndDate = today;
        break;
      case '12weeks':
        newStartDate = subWeeks(today, 12);
        newEndDate = today;
        break;
      case 'year':
        newStartDate = startOfYear(today);
        newEndDate = endOfYear(today);
        break;
      case 'custom':
        // Pozostaw obecne daty
        setIsRefreshing(false);
        return;
      default:
        newStartDate = subWeeks(today, 8);
        newEndDate = today;
    }
    
    await onDateChange(newStartDate, newEndDate);
    setIsRefreshing(false);
  };

  // Handler sortowania
  const handleSort = (field) => {
    const isAsc = sortBy === field && sortDirection === 'asc';
    setSortDirection(isAsc ? 'desc' : 'asc');
    setSortBy(field);
  };

  // Handler eksportu do CSV
  const handleExportCSV = () => {
    try {
      // Nagłówki CSV
      const headers = [
        'Tydzień',
        'Data Od',
        'Data Do',
        'Czas (h)',
        'Ilość',
        'Wydajność (szt/h)',
        'Trend (%)',
        'Efektywność (%)',
        'Sesje',
        'Top Produkt'
      ];

      // Dane
      const csvData = sortedWeeksData.map(week => [
        formatWeekString(week.week),
        format(week.weekStart, 'dd.MM.yyyy', { locale: plLocale }),
        format(week.weekEnd, 'dd.MM.yyyy', { locale: plLocale }),
        week.totalTimeHours,
        week.totalQuantity,
        week.productivity,
        week.productivityChange.toFixed(1),
        week.efficiency,
        week.sessionsCount,
        week.topProduct ? (week.topProduct.moNumber || week.topProduct.taskName) : '-'
      ]);

      // Połącz nagłówki z danymi
      const fullData = [headers, ...csvData];

      // Konwertuj do CSV string
      const csvContent = fullData.map(row => 
        row.map(field => {
          const stringField = String(field);
          if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
            return `"${stringField.replace(/"/g, '""')}"`;
          }
          return stringField;
        }).join(',')
      ).join('\n');

      // Dodaj BOM dla polskich znaków
      const BOM = '\uFEFF';
      const csvWithBOM = BOM + csvContent;

      // Pobierz plik
      const blob = new Blob([csvWithBOM], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `tygodniowki_${format(new Date(), 'yyyy-MM-dd')}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Błąd podczas eksportu CSV:', error);
    }
  };


  // Sortowane dane
  const sortedWeeksData = useMemo(() => {
    if (!weeksData || weeksData.length === 0) return [];
    
    return [...weeksData].sort((a, b) => {
      let aValue, bValue;
      
      switch (sortBy) {
        case 'week':
          aValue = a.week;
          bValue = b.week;
          break;
        case 'time':
          aValue = a.totalTimeHours;
          bValue = b.totalTimeHours;
          break;
        case 'quantity':
          aValue = a.totalQuantity;
          bValue = b.totalQuantity;
          break;
        case 'productivity':
          aValue = a.productivity;
          bValue = b.productivity;
          break;
        case 'trend':
          aValue = a.productivityChange;
          bValue = b.productivityChange;
          break;
        case 'efficiency':
          aValue = a.efficiency;
          bValue = b.efficiency;
          break;
        default:
          return 0;
      }
      
      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      } else {
        return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
      }
    });
  }, [weeksData, sortBy, sortDirection]);

  // Pobierz dane dla porównania
  const week1Data = useMemo(() => {
    return weeksData.find(w => w.week === selectedWeek1);
  }, [weeksData, selectedWeek1]);

  const week2Data = useMemo(() => {
    return weeksData.find(w => w.week === selectedWeek2);
  }, [weeksData, selectedWeek2]);

  // Ikona trendu
  const getTrendIcon = (trend) => {
    switch (trend) {
      case 'improving':
        return <TrendingUpIcon sx={{ color: 'success.main' }} />;
      case 'declining':
        return <TrendingDownIcon sx={{ color: 'error.main' }} />;
      default:
        return <TrendingFlatIcon sx={{ color: 'text.secondary' }} />;
    }
  };

  // Kolor trendu
  const getTrendColor = (change) => {
    if (change > 5) return 'success.main';
    if (change < -5) return 'error.main';
    return 'text.secondary';
  };

  if (!timeAnalysis || !weeksData || weeksData.length === 0) {
    return (
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Filtry
        </Typography>
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={12} sm={6} md={3}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={plLocale}>
              <DatePicker
                label="Data początkowa"
                value={startDate}
                onChange={(newDate) => onDateChange(newDate, endDate)}
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
                value={endDate}
                onChange={(newDate) => onDateChange(startDate, newDate)}
                slotProps={{ 
                  textField: { 
                    fullWidth: true,
                    size: "small"
                  } 
                }}
              />
            </LocalizationProvider>
          </Grid>
        </Grid>
        <Alert severity="info">
          Brak danych tygodniowych do wyświetlenia. Zmień zakres dat aby zobaczyć analizę tygodniową.
        </Alert>
      </Paper>
    );
  }

  return (
    <Box>

      {/* Podsumowanie ogólne */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <SpeedIcon sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
              <Typography variant="h4" color="primary">
                {trends.avgProductivity}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Średnia wydajność (szt/h)
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <TrophyIcon sx={{ fontSize: 40, color: 'success.main', mb: 1 }} />
              <Typography variant="h4" color="success.main">
                {trends.maxProductivity}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Najlepsza wydajność
              </Typography>
              {trends.bestWeek && (
                <Typography variant="caption" color="text.secondary">
                  {formatWeekString(trends.bestWeek.week)}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <AssessmentIcon sx={{ fontSize: 40, color: 'secondary.main', mb: 1 }} />
              <Typography variant="h4" color="secondary">
                {weeksData.length}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Analizowanych tygodni
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              {getTrendIcon(trends.trend)}
              <Typography variant="h6" sx={{ mt: 1 }}>
                {trends.trendDescription}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Ogólny trend
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filtry dat dla tygodniówek */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          Filtry
        </Typography>
        <Grid container spacing={2} alignItems="center">
          {/* Szybkie zakresy */}
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Zakres</InputLabel>
              <Select
                value={quickRange}
                label="Zakres"
                onChange={(e) => handleQuickRange(e.target.value)}
                disabled={isRefreshing}
              >
                <MenuItem value="4weeks">Ostatnie 4 tygodnie</MenuItem>
                <MenuItem value="8weeks">Ostatnie 8 tygodni</MenuItem>
                <MenuItem value="12weeks">Ostatnie 12 tygodni</MenuItem>
                <MenuItem value="year">Cały rok</MenuItem>
                <MenuItem value="custom">Niestandardowy</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          {/* Filtry dat - tylko gdy custom */}
          {quickRange === 'custom' && (
            <>
              <Grid item xs={12} sm={6} md={3}>
                <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={plLocale}>
                  <DatePicker
                    label="Data początkowa"
                    value={startDate}
                    onChange={(newDate) => onDateChange(newDate, endDate)}
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
                    value={endDate}
                    onChange={(newDate) => onDateChange(startDate, newDate)}
                    slotProps={{ 
                      textField: { 
                        fullWidth: true,
                        size: "small"
                      } 
                    }}
                  />
                </LocalizationProvider>
              </Grid>
            </>
          )}
          
          {/* Akcje */}
          <Grid item xs={12} sm={6} md={quickRange === 'custom' ? 3 : 9}>
            <Stack direction="row" spacing={1} justifyContent="flex-end" alignItems="center">
              {isRefreshing && <CircularProgress size={24} />}
              <Tooltip title="Eksportuj do CSV">
                <IconButton onClick={handleExportCSV} size="small" color="primary">
                  <DownloadIcon />
                </IconButton>
              </Tooltip>
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      {/* Przyciski akcji */}
      <Box sx={{ mb: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Button
          variant={comparisonMode ? "contained" : "outlined"}
          startIcon={<CompareIcon />}
          onClick={handleComparisonToggle}
          disabled={weeksData.length < 2}
        >
          Porównaj tygodnie
        </Button>
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Typ wykresu</InputLabel>
          <Select
            value={chartType}
            onChange={(e) => setChartType(e.target.value)}
            label="Typ wykresu"
          >
            <MenuItem value="productivity">Wydajność</MenuItem>
            <MenuItem value="quantity">Ilość</MenuItem>
            <MenuItem value="time">Czas pracy</MenuItem>
            <MenuItem value="all">Wszystkie</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Tryb porównania */}
      {comparisonMode && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="h6" gutterBottom>
            Porównanie dwóch tygodni
          </Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Tydzień 1</InputLabel>
                <Select
                  value={selectedWeek1 || ''}
                  onChange={(e) => setSelectedWeek1(e.target.value)}
                  label="Tydzień 1"
                >
                  {weeksData.map(week => (
                    <MenuItem key={week.week} value={week.week}>
                      {formatWeekString(week.week)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Tydzień 2</InputLabel>
                <Select
                  value={selectedWeek2 || ''}
                  onChange={(e) => setSelectedWeek2(e.target.value)}
                  label="Tydzień 2"
                >
                  {weeksData.map(week => (
                    <MenuItem key={week.week} value={week.week}>
                      {formatWeekString(week.week)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          {week1Data && week2Data && (
            <>
              {/* Wykres porównawczy */}
              <Box sx={{ mt: 2, mb: 2 }}>
                <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
                  Porównanie metryk
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={[
                      {
                        metric: 'Wydajność\n(szt/h)',
                        [formatWeekString(week1Data.week)]: week1Data.productivity,
                        [formatWeekString(week2Data.week)]: week2Data.productivity
                      },
                      {
                        metric: 'Ilość\n(szt)',
                        [formatWeekString(week1Data.week)]: week1Data.totalQuantity,
                        [formatWeekString(week2Data.week)]: week2Data.totalQuantity
                      },
                      {
                        metric: 'Czas pracy\n(h)',
                        [formatWeekString(week1Data.week)]: week1Data.totalTimeHours,
                        [formatWeekString(week2Data.week)]: week2Data.totalTimeHours
                      },
                      {
                        metric: 'Sesje',
                        [formatWeekString(week1Data.week)]: week1Data.sessionsCount,
                        [formatWeekString(week2Data.week)]: week2Data.sessionsCount
                      },
                      {
                        metric: 'Efektywność\n(%)',
                        [formatWeekString(week1Data.week)]: week1Data.efficiency,
                        [formatWeekString(week2Data.week)]: week2Data.efficiency
                      }
                    ]}
                    margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="metric" 
                      angle={0}
                      textAnchor="middle"
                      height={60}
                      style={{ fontSize: '0.75rem' }}
                    />
                    <YAxis />
                    <RechartTooltip />
                    <Legend wrapperStyle={{ paddingTop: '10px' }} />
                    <Bar 
                      dataKey={formatWeekString(week1Data.week)} 
                      fill={theme.palette.primary.main}
                      name={formatWeekString(week1Data.week)}
                    />
                    <Bar 
                      dataKey={formatWeekString(week2Data.week)} 
                      fill={theme.palette.secondary.main}
                      name={formatWeekString(week2Data.week)}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </Box>

              {/* Karty z różnicami procentowymi */}
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={12} sm={6} md={2.4}>
                  <Card variant="outlined">
                    <CardContent sx={{ textAlign: 'center', py: 2 }}>
                      <Typography variant="caption" color="text.secondary">
                        Różnica Wydajności
                      </Typography>
                      <Typography 
                        variant="h5" 
                        sx={{ 
                          color: week1Data.productivity > week2Data.productivity ? 'success.main' : 'error.main',
                          fontWeight: 'bold',
                          mt: 1
                        }}
                      >
                        {week2Data.productivity > 0 
                          ? `${((week1Data.productivity - week2Data.productivity) / week2Data.productivity * 100).toFixed(1)}%`
                          : 'N/A'}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={2.4}>
                  <Card variant="outlined">
                    <CardContent sx={{ textAlign: 'center', py: 2 }}>
                      <Typography variant="caption" color="text.secondary">
                        Różnica Ilości
                      </Typography>
                      <Typography 
                        variant="h5" 
                        sx={{ 
                          color: week1Data.totalQuantity > week2Data.totalQuantity ? 'success.main' : 'error.main',
                          fontWeight: 'bold',
                          mt: 1
                        }}
                      >
                        {week2Data.totalQuantity > 0 
                          ? `${((week1Data.totalQuantity - week2Data.totalQuantity) / week2Data.totalQuantity * 100).toFixed(1)}%`
                          : 'N/A'}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={2.4}>
                  <Card variant="outlined">
                    <CardContent sx={{ textAlign: 'center', py: 2 }}>
                      <Typography variant="caption" color="text.secondary">
                        Różnica Czasu
                      </Typography>
                      <Typography 
                        variant="h5" 
                        sx={{ 
                          color: week1Data.totalTimeHours > week2Data.totalTimeHours ? 'info.main' : 'text.secondary',
                          fontWeight: 'bold',
                          mt: 1
                        }}
                      >
                        {week2Data.totalTimeHours > 0 
                          ? `${((week1Data.totalTimeHours - week2Data.totalTimeHours) / week2Data.totalTimeHours * 100).toFixed(1)}%`
                          : 'N/A'}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={2.4}>
                  <Card variant="outlined">
                    <CardContent sx={{ textAlign: 'center', py: 2 }}>
                      <Typography variant="caption" color="text.secondary">
                        Różnica Sesji
                      </Typography>
                      <Typography 
                        variant="h5" 
                        sx={{ 
                          color: 'text.primary',
                          fontWeight: 'bold',
                          mt: 1
                        }}
                      >
                        {week1Data.sessionsCount - week2Data.sessionsCount > 0 ? '+' : ''}
                        {week1Data.sessionsCount - week2Data.sessionsCount}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={2.4}>
                  <Card variant="outlined">
                    <CardContent sx={{ textAlign: 'center', py: 2 }}>
                      <Typography variant="caption" color="text.secondary">
                        Różnica Efektywności
                      </Typography>
                      <Typography 
                        variant="h5" 
                        sx={{ 
                          color: week1Data.efficiency > week2Data.efficiency ? 'success.main' : 'error.main',
                          fontWeight: 'bold',
                          mt: 1
                        }}
                      >
                        {week1Data.efficiency - week2Data.efficiency > 0 ? '+' : ''}
                        {(week1Data.efficiency - week2Data.efficiency).toFixed(0)}pp
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>

              {/* Karty szczegółów tygodni */}
              <Grid container spacing={2} sx={{ mt: 2 }}>
                <Grid item xs={12} md={6}>
                  <WeekComparisonCard week={week1Data} label="Tydzień 1" />
                </Grid>
                <Grid item xs={12} md={6}>
                  <WeekComparisonCard week={week2Data} label="Tydzień 2" />
                </Grid>
              </Grid>
            </>
          )}
        </Paper>
      )}

      {/* Wykres trendu */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          Trend wydajności w czasie
        </Typography>
        <ResponsiveContainer width="100%" height={300}>
          {chartType === 'all' ? (
            <ComposedChart data={trendChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="weekShort" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <RechartTooltip />
              <Legend />
              <Area 
                yAxisId="left"
                type="monotone" 
                dataKey="productivity" 
                fill={theme.palette.primary.light}
                stroke={theme.palette.primary.main}
                name="Wydajność (szt/h)"
              />
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="quantity" 
                stroke={theme.palette.secondary.main}
                name="Ilość"
              />
              <Line 
                yAxisId="left"
                type="monotone" 
                dataKey="timeHours" 
                stroke={theme.palette.success.main}
                name="Czas (h)"
              />
            </ComposedChart>
          ) : (
            <LineChart data={trendChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="weekShort" />
              <YAxis />
              <RechartTooltip />
              <Legend />
              {chartType === 'productivity' && (
                <Line 
                  type="monotone" 
                  dataKey="productivity" 
                  stroke={theme.palette.primary.main}
                  strokeWidth={3}
                  name="Wydajność (szt/h)"
                  dot={{ r: 5 }}
                />
              )}
              {chartType === 'quantity' && (
                <Line 
                  type="monotone" 
                  dataKey="quantity" 
                  stroke={theme.palette.secondary.main}
                  strokeWidth={3}
                  name="Ilość"
                  dot={{ r: 5 }}
                />
              )}
              {chartType === 'time' && (
                <Line 
                  type="monotone" 
                  dataKey="timeHours" 
                  stroke={theme.palette.success.main}
                  strokeWidth={3}
                  name="Czas pracy (h)"
                  dot={{ r: 5 }}
                />
              )}
            </LineChart>
          )}
        </ResponsiveContainer>
      </Paper>

      {/* Tabela tygodni */}
      <Paper sx={{ p: 2 }}>
        <Typography variant="h6" gutterBottom>
          Szczegółowe zestawienie tygodniowe
        </Typography>
        <TableContainer sx={{ maxHeight: 600 }}>
          <Table size={isMobileView ? "small" : "medium"} stickyHeader>
             <TableHead>
               <TableRow>
                 <TableCell>
                   <TableSortLabel
                     active={sortBy === 'week'}
                     direction={sortBy === 'week' ? sortDirection : 'asc'}
                     onClick={() => handleSort('week')}
                   >
                     Tydzień
                   </TableSortLabel>
                 </TableCell>
                 <TableCell align="right">
                   <TableSortLabel
                     active={sortBy === 'time'}
                     direction={sortBy === 'time' ? sortDirection : 'asc'}
                     onClick={() => handleSort('time')}
                   >
                     Czas (h)
                   </TableSortLabel>
                 </TableCell>
                 <TableCell align="right">
                   <TableSortLabel
                     active={sortBy === 'quantity'}
                     direction={sortBy === 'quantity' ? sortDirection : 'asc'}
                     onClick={() => handleSort('quantity')}
                   >
                     Ilość
                   </TableSortLabel>
                 </TableCell>
                 <TableCell align="right">
                   <TableSortLabel
                     active={sortBy === 'productivity'}
                     direction={sortBy === 'productivity' ? sortDirection : 'asc'}
                     onClick={() => handleSort('productivity')}
                   >
                     Wydajność (szt/h)
                   </TableSortLabel>
                 </TableCell>
                 <TableCell align="center">
                   <TableSortLabel
                     active={sortBy === 'trend'}
                     direction={sortBy === 'trend' ? sortDirection : 'asc'}
                     onClick={() => handleSort('trend')}
                   >
                     Trend
                   </TableSortLabel>
                 </TableCell>
                 <TableCell align="center">
                   <TableSortLabel
                     active={sortBy === 'efficiency'}
                     direction={sortBy === 'efficiency' ? sortDirection : 'asc'}
                     onClick={() => handleSort('efficiency')}
                   >
                     Efekt.
                   </TableSortLabel>
                 </TableCell>
                 <TableCell>Top produkt</TableCell>
                 <TableCell align="center">Porównaj</TableCell>
                 <TableCell align="center">Szczegóły</TableCell>
               </TableRow>
             </TableHead>
            <TableBody>
              {sortedWeeksData.map((week, index) => (
                <React.Fragment key={week.week}>
                  <TableRow 
                    hover
                    sx={{ 
                      '& > *': { borderBottom: expandedWeek === week.week ? 0 : undefined },
                      backgroundColor: index === weeksData.length - 1 ? 'action.hover' : 'inherit'
                    }}
                  >
                    <TableCell>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                          {formatWeekString(week.week)}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {week.weekLabel}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      <Chip 
                        icon={<TimeIcon />}
                        label={week.totalTimeHours + 'h'}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Chip 
                        icon={<QuantityIcon />}
                        label={week.totalQuantity.toLocaleString('pl-PL')}
                        size="small"
                        color="secondary"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Typography 
                        variant="body1" 
                        sx={{ 
                          fontWeight: 'bold',
                          color: week.productivity === trends.maxProductivity ? 'success.main' : 'text.primary'
                        }}
                      >
                        {week.productivity}
                        {week.productivity === trends.maxProductivity && ' 🏆'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title={`Zmiana: ${week.productivityChange > 0 ? '+' : ''}${week.productivityChange.toFixed(1)}%`}>
                        <Chip
                          icon={getTrendIcon(week.trend)}
                          label={`${week.productivityChange > 0 ? '+' : ''}${week.productivityChange.toFixed(1)}%`}
                          size="small"
                          sx={{ 
                            backgroundColor: week.trend === 'improving' ? 'success.light' : 
                                           week.trend === 'declining' ? 'error.light' : 'grey.200',
                            color: week.trend === 'improving' ? 'success.dark' : 
                                   week.trend === 'declining' ? 'error.dark' : 'text.secondary'
                          }}
                        />
                      </Tooltip>
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title={`Wykorzystanie czasu: ${week.efficiency}%`}>
                        <Chip
                          label={`${week.efficiency}%`}
                          size="small"
                          color={week.efficiency > 80 ? 'success' : week.efficiency > 60 ? 'warning' : 'default'}
                        />
                      </Tooltip>
                    </TableCell>
                     <TableCell>
                       {week.topProduct ? (
                         <Box>
                           <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                             {week.topProduct.moNumber || week.topProduct.taskName}
                           </Typography>
                           <Typography variant="caption" color="text.secondary">
                             {week.topProduct.timePercentage}% czasu
                           </Typography>
                         </Box>
                       ) : (
                         <Typography variant="caption" color="text.secondary">—</Typography>
                       )}
                     </TableCell>
                     <TableCell align="center">
                       <Tooltip title={
                         comparisonMode && (selectedWeek1 === week.week || selectedWeek2 === week.week)
                           ? "W porównaniu"
                           : "Dodaj do porównania"
                       }>
                         <IconButton 
                           size="small"
                           onClick={() => handleAddToComparison(week.week)}
                           color={
                             comparisonMode && selectedWeek1 === week.week ? 'primary' :
                             comparisonMode && selectedWeek2 === week.week ? 'secondary' :
                             'default'
                           }
                           sx={{
                             backgroundColor: 
                               comparisonMode && selectedWeek1 === week.week ? 'primary.light' :
                               comparisonMode && selectedWeek2 === week.week ? 'secondary.light' :
                               'transparent'
                           }}
                         >
                           {comparisonMode && (selectedWeek1 === week.week || selectedWeek2 === week.week) ? (
                             <Chip 
                               label={selectedWeek1 === week.week ? '1' : '2'}
                               size="small"
                               color={selectedWeek1 === week.week ? 'primary' : 'secondary'}
                               sx={{ fontWeight: 'bold', fontSize: '0.75rem', height: 20, minWidth: 20 }}
                             />
                           ) : (
                             <AddIcon fontSize="small" />
                           )}
                         </IconButton>
                       </Tooltip>
                     </TableCell>
                     <TableCell align="center">
                       <IconButton 
                         size="small"
                         onClick={() => handleExpandWeek(week.week)}
                       >
                         {expandedWeek === week.week ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                       </IconButton>
                     </TableCell>
                   </TableRow>
                   <TableRow>
                     <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={9}>
                       <Collapse in={expandedWeek === week.week} timeout="auto" unmountOnExit>
                         <WeekDetailsPanel week={week} />
                       </Collapse>
                     </TableCell>
                   </TableRow>
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};

export default WeeklyProductivityTab;

