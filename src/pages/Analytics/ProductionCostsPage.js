// src/pages/Analytics/ProductionCostsPage.js
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
  Collapse,
  alpha,
  Link
} from '@mui/material';
import {
  MonetizationOn as CostsIcon,
  Refresh as RefreshIcon,
  Download as DownloadIcon,
  FilterList as FilterIcon,
  NavigateBefore as PrevIcon,
  NavigateNext as NextIcon,
  KeyboardArrowDown as ExpandMoreIcon,
  KeyboardArrowUp as ExpandLessIcon,
  OpenInNew as OpenInNewIcon
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { pl } from 'date-fns/locale';
import { format, subYears } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import { getTasksWithCosts } from '../../services/productionService';
import { getAllCustomers } from '../../services/customerService';
import { formatCurrency } from '../../utils/formatUtils';
import { exportToCSV, formatDateForExport } from '../../utils/exportUtils';

const ProductionCostsPage = () => {
  const { currentUser } = useAuth();
  const { showSuccess, showError, showInfo } = useNotification();
  const { t, currentLanguage } = useTranslation('analytics');
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  // Stan
  const [loading, setLoading] = useState(true);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [productionTasks, setProductionTasks] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [startDate, setStartDate] = useState(subYears(new Date(), 1));
  const [endDate, setEndDate] = useState(new Date());
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('all');
  const [expandedRows, setExpandedRows] = useState({});

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (!loading) {
      fetchProductionTasks();
    }
  }, [startDate, endDate]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const [fetchedCustomers] = await Promise.all([
        getAllCustomers()
      ]);
      setCustomers(fetchedCustomers || []);
      await fetchProductionTasks();
    } catch (error) {
      console.error('Błąd podczas pobierania danych:', error);
      showError(t('productionCostsReport.errors.fetchData'));
    } finally {
      setLoading(false);
    }
  };

  const fetchProductionTasks = async () => {
    try {
      setTasksLoading(true);
      console.log('🔄 Pobieranie zadań produkcyjnych z kosztami...');
      
      const tasks = await getTasksWithCosts(startDate, endDate, 'all');
      console.log(`✅ Pobrano ${tasks.length} zadań z kosztami`);
      setProductionTasks(tasks);
    } catch (error) {
      console.error('Błąd podczas pobierania zadań:', error);
      showError(t('productionCostsReport.errors.fetchCosts'));
    } finally {
      setTasksLoading(false);
    }
  };

  // Oblicz unikalne produkty
  const uniqueProducts = useMemo(() => {
    const products = new Set();
    productionTasks.forEach(task => {
      if (task.productName) {
        products.add(task.productName);
      }
    });
    return Array.from(products).sort();
  }, [productionTasks]);

  // Filtrowanie danych
  const filteredTasks = useMemo(() => {
    let filtered = productionTasks;
    
    if (selectedProduct) {
      filtered = filtered.filter(task => task.productName === selectedProduct);
    }
    
    if (selectedCustomer !== 'all') {
      filtered = filtered.filter(task => task.customerId === selectedCustomer);
    }
    
    return filtered;
  }, [productionTasks, selectedProduct, selectedCustomer]);

  // Statystyki
  const stats = useMemo(() => {
    if (filteredTasks.length === 0) {
      return {
        totalTasks: 0,
        totalSessions: 0,
        totalMaterialCost: 0,
        totalFullCost: 0,
        avgUnitCost: 0,
        totalQuantity: 0
      };
    }
    
    // ZMIANA: Używamy kosztów i ilości Z OKRESU
    const totalMaterialCost = filteredTasks.reduce((sum, task) => 
      sum + (task.materialCostInPeriod || 0), 0);
    const totalFullCost = filteredTasks.reduce((sum, task) => 
      sum + (task.fullCostInPeriod || 0), 0);
    const totalQuantity = filteredTasks.reduce((sum, task) => 
      sum + (task.quantityInPeriod || 0), 0);
    const totalSessions = filteredTasks.reduce((sum, task) => 
      sum + (task.sessionsInPeriod || 0), 0);
    
    return {
      totalTasks: filteredTasks.length,
      totalSessions,
      totalMaterialCost,
      totalFullCost,
      avgUnitCost: totalQuantity > 0 ? totalFullCost / totalQuantity : 0,
      totalQuantity
    };
  }, [filteredTasks]);

  // Grupowanie według produktu
  const costsByProduct = useMemo(() => {
    const grouped = {};
    
    filteredTasks.forEach(task => {
      const productName = task.productName || t('productionCostsReport.unknownProduct');
      
      if (!grouped[productName]) {
        grouped[productName] = {
          name: productName,
          recipeId: task.recipeId || null,
          totalTasks: 0,
          totalSessions: 0,
          totalQuantity: 0,
          totalMaterialCost: 0,
          totalFullCost: 0,
          tasks: []
        };
      }
      
      // Jeśli wcześniej nie było recipeId, ale teraz jest - zaktualizuj
      if (!grouped[productName].recipeId && task.recipeId) {
        grouped[productName].recipeId = task.recipeId;
      }
      
      grouped[productName].totalTasks++;
      grouped[productName].totalSessions += task.sessionsInPeriod || 0;
      // ZMIANA: Używamy danych Z OKRESU
      grouped[productName].totalQuantity += task.quantityInPeriod || 0;
      grouped[productName].totalMaterialCost += task.materialCostInPeriod || 0;
      grouped[productName].totalFullCost += task.fullCostInPeriod || 0;
      grouped[productName].tasks.push(task);
    });
    
    return Object.values(grouped).sort((a, b) => b.totalFullCost - a.totalFullCost);
  }, [filteredTasks, t]);

  // Obsługa rozwijania/zwijania wierszy
  const handleToggleRow = (productName) => {
    setExpandedRows(prev => ({
      ...prev,
      [productName]: !prev[productName]
    }));
  };

  const formatDateDisplay = (date) => {
    try {
      return format(date, 'dd.MM.yyyy', { locale: pl });
    } catch {
      return '-';
    }
  };

  // Funkcja eksportu do CSV
  const handleExportCSV = useCallback(() => {
    if (!costsByProduct || costsByProduct.length === 0) {
      showError(t('productionCostsReport.errors.noDataToExport'));
      return;
    }

    try {
      // Przygotuj dane dla podsumowania według produktu
      const summaryData = costsByProduct.map(product => ({
        productName: product.name,
        totalTasks: product.totalTasks,
        totalSessions: product.totalSessions,
        totalQuantity: product.totalQuantity.toFixed(2),
        totalMaterialCost: product.totalMaterialCost.toFixed(2),
        totalFullCost: product.totalFullCost.toFixed(2),
        avgUnitCost: product.totalQuantity > 0 
          ? (product.totalFullCost / product.totalQuantity).toFixed(4)
          : '0.00'
      }));

      // Przygotuj szczegółowe dane dla wszystkich zadań
      const detailedData = [];
      costsByProduct.forEach(product => {
        product.tasks.forEach(task => {
          detailedData.push({
            productName: product.name,
            moNumber: task.moNumber || task.id.slice(0, 8),
            completionDate: task.completionDate ? formatDateForExport(task.completionDate) : '-',
            status: task.status || '-',
            sessionsInPeriod: task.sessionsInPeriod || 0,
            quantityInPeriod: (task.quantityInPeriod || 0).toFixed(2),
            totalQuantity: (task.totalCompletedQuantity || 0).toFixed(2),
            plannedQuantity: (task.plannedQuantity || 0).toFixed(2),
            productionTimeHours: task.totalProductionTimeInPeriodHours || '0',
            unitMaterialCost: (task.unitMaterialCost || 0).toFixed(4),
            unitFullCost: (task.unitFullCost || 0).toFixed(4),
            materialCostInPeriod: (task.materialCostInPeriod || 0).toFixed(2),
            fullCostInPeriod: (task.fullCostInPeriod || 0).toFixed(2),
            totalMaterialCost: (task.totalMaterialCost || 0).toFixed(2),
            totalFullCost: (task.totalFullProductionCost || 0).toFixed(2),
            hasSessionsOutsidePeriod: task.hasSessionsOutsidePeriod ? 'Tak' : 'Nie'
          });
        });
      });

      // Nagłówki dla podsumowania
      const summaryHeaders = [
        { label: t('productionCostsReport.table.product'), key: 'productName' },
        { label: t('productionCostsReport.table.tasks'), key: 'totalTasks' },
        { label: t('productionCostsReport.table.sessions'), key: 'totalSessions' },
        { label: t('productionCostsReport.table.quantityInPeriod'), key: 'totalQuantity' },
        { label: `${t('productionCostsReport.table.materialCost')} (EUR)`, key: 'totalMaterialCost' },
        { label: `${t('productionCostsReport.table.fullCost')} (EUR)`, key: 'totalFullCost' },
        { label: `${t('productionCostsReport.table.avgFullUnitCost')} (EUR)`, key: 'avgUnitCost' }
      ];

      // Nagłówki dla szczegółów
      const detailedHeaders = [
        { label: t('productionCostsReport.table.product'), key: 'productName' },
        { label: t('productionCostsReport.details.mo'), key: 'moNumber' },
        { label: t('productionCostsReport.details.completionDate'), key: 'completionDate' },
        { label: t('productionCostsReport.details.status'), key: 'status' },
        { label: t('productionCostsReport.table.sessions'), key: 'sessionsInPeriod' },
        { label: t('productionCostsReport.table.quantityInPeriod'), key: 'quantityInPeriod' },
        { label: t('productionCostsReport.details.totalQuantity'), key: 'totalQuantity' },
        { label: t('productionCostsReport.details.plan'), key: 'plannedQuantity' },
        { label: t('productionCostsReport.details.productionTime'), key: 'productionTimeHours' },
        { label: `${t('productionCostsReport.details.unitCost')} ${t('productionCostsReport.table.materialCost')} (EUR)`, key: 'unitMaterialCost' },
        { label: `${t('productionCostsReport.details.unitCost')} ${t('productionCostsReport.table.fullCost')} (EUR)`, key: 'unitFullCost' },
        { label: `${t('productionCostsReport.table.materialCost')} ${t('productionCostsReport.table.quantityInPeriod')} (EUR)`, key: 'materialCostInPeriod' },
        { label: `${t('productionCostsReport.table.fullCost')} ${t('productionCostsReport.table.quantityInPeriod')} (EUR)`, key: 'fullCostInPeriod' },
        { label: `${t('productionCostsReport.table.materialCost')} ${t('productionCostsReport.details.totalQuantity')} (EUR)`, key: 'totalMaterialCost' },
        { label: `${t('productionCostsReport.table.fullCost')} ${t('productionCostsReport.details.totalQuantity')} (EUR)`, key: 'totalFullCost' },
        { label: t('productionCostsReport.export.hasSessionsOutsidePeriod'), key: 'hasSessionsOutsidePeriod' }
      ];

      // Nazwa pliku z datami
      const startDateStr = formatDateForExport(startDate, 'yyyyMMdd');
      const endDateStr = formatDateForExport(endDate, 'yyyyMMdd');
      const filename = `raport_kosztow_produkcji_${startDateStr}_${endDateStr}`;

      // Eksportuj podsumowanie
      const summarySuccess = exportToCSV(summaryData, summaryHeaders, `${filename}_podsumowanie`);
      
      // Eksportuj szczegóły
      const detailsSuccess = exportToCSV(detailedData, detailedHeaders, `${filename}_szczegoly`);

      if (summarySuccess && detailsSuccess) {
        showSuccess(t('productionCostsReport.export.success'));
      } else {
        showError(t('productionCostsReport.export.error'));
      }
    } catch (error) {
      console.error('Błąd podczas eksportu CSV:', error);
      showError(t('productionCostsReport.export.error'));
    }
  }, [costsByProduct, startDate, endDate, showSuccess, showError, t]);

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
            : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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
              <CostsIcon sx={{ fontSize: 24, color: 'white' }} />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
                {t('analyticsDashboard.tiles.productionCosts.title')}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                {t('analyticsDashboard.tiles.productionCosts.description')}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Tooltip title={t('productionCostsReport.export.csvTooltip')}>
              <IconButton 
                onClick={handleExportCSV} 
                sx={{ color: 'white' }}
                disabled={tasksLoading || !costsByProduct || costsByProduct.length === 0}
              >
                <DownloadIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title={t('productionCostsReport.refreshData')}>
              <IconButton 
                onClick={fetchProductionTasks} 
                sx={{ color: 'white' }}
                disabled={tasksLoading}
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
          <Typography variant="h6" sx={{ fontWeight: 600 }}>{t('productionCostsReport.filters.title')}</Typography>
        </Box>
        <Grid container spacing={3} alignItems="center">
          <Grid item xs={12} md={3}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
              <DatePicker
                label={t('productionCostsReport.filters.startDate')}
                value={startDate}
                onChange={setStartDate}
                slotProps={{ textField: { fullWidth: true } }}
              />
            </LocalizationProvider>
          </Grid>
          <Grid item xs={12} md={3}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
              <DatePicker
                label={t('productionCostsReport.filters.endDate')}
                value={endDate}
                onChange={setEndDate}
                slotProps={{ textField: { fullWidth: true } }}
              />
            </LocalizationProvider>
          </Grid>
          <Grid item xs={12} md={3}>
            <Autocomplete
              options={uniqueProducts}
              value={selectedProduct}
              onChange={(e, newValue) => setSelectedProduct(newValue || '')}
              renderInput={(params) => (
                <TextField {...params} label={t('productionCostsReport.filters.product')} fullWidth />
              )}
              freeSolo
            />
          </Grid>
          <Grid item xs={12} md={3}>
            <FormControl fullWidth>
              <InputLabel>{t('productionCostsReport.filters.customer')}</InputLabel>
              <Select
                value={selectedCustomer}
                onChange={(e) => setSelectedCustomer(e.target.value)}
                label={t('productionCostsReport.filters.customer')}
              >
                <MenuItem value="all">{t('productionCostsReport.filters.allCustomers')}</MenuItem>
                {customers.map(customer => (
                  <MenuItem key={customer.id} value={customer.id}>
                    {customer.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {tasksLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {/* Alert informacyjny */}
          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="body2">
              <strong>ℹ️ Uwaga:</strong> Raport pokazuje tylko sesje produkcyjne z wybranego okresu. 
              Koszty są obliczane jako: <em>koszt jednostkowy zadania × ilość wyprodukowana w okresie</em>.
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
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>{t('productionCostsReport.stats.tasksCount')}</Typography>
                  <Typography variant="h4" sx={{ fontWeight: 'bold' }}>{stats.totalTasks}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={2.4}>
              <Card sx={{ 
                background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                color: 'white'
              }}>
                <CardContent>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>{t('productionCostsReport.stats.sessionsCount')}</Typography>
                  <Typography variant="h4" sx={{ fontWeight: 'bold' }}>{stats.totalSessions}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={2.4}>
              <Card sx={{ 
                background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
                color: 'white'
              }}>
                <CardContent>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>{t('productionCostsReport.stats.materialCost')}</Typography>
                  <Typography variant="h4" sx={{ fontWeight: 'bold' }}>{formatCurrency(stats.totalMaterialCost)}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={2.4}>
              <Card sx={{ 
                background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                color: 'white'
              }}>
                <CardContent>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>{t('productionCostsReport.stats.fullProductionCost')}</Typography>
                  <Typography variant="h4" sx={{ fontWeight: 'bold' }}>{formatCurrency(stats.totalFullCost)}</Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={2.4}>
              <Card sx={{ 
                background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
                color: 'white'
              }}>
                <CardContent>
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>{t('productionCostsReport.stats.avgFullUnitCost')}</Typography>
                  <Typography variant="h4" sx={{ fontWeight: 'bold' }}>{formatCurrency(stats.avgUnitCost)}</Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Tabela kosztów według produktu */}
          {costsByProduct.length > 0 ? (
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                {t('productionCostsReport.table.title')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {t('productionCostsReport.table.period')}: {formatDateDisplay(startDate)} - {formatDateDisplay(endDate)}
              </Typography>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 'bold', width: 50 }}></TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>{t('productionCostsReport.table.product')}</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 'bold' }}>{t('productionCostsReport.table.tasks')}</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 'bold' }}>{t('productionCostsReport.table.sessions')}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>{t('productionCostsReport.table.quantityInPeriod')}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>{t('productionCostsReport.table.materialCost')}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>{t('productionCostsReport.table.fullCost')}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>{t('productionCostsReport.table.avgFullUnitCost')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {costsByProduct.map((product, index) => {
                      const isExpanded = expandedRows[product.name] || false;
                      return (
                        <React.Fragment key={index}>
                          {/* Główny wiersz produktu */}
                          <TableRow 
                            hover 
                            sx={{ 
                              cursor: 'pointer',
                              '& > *': { borderBottom: isExpanded ? 'unset' : undefined }
                            }}
                            onClick={() => handleToggleRow(product.name)}
                          >
                            <TableCell>
                              <IconButton size="small">
                                {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                              </IconButton>
                            </TableCell>
                            <TableCell sx={{ fontWeight: 'medium' }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {product.name}
                                {product.recipeId && (
                                  <Tooltip title={t('productionCostsReport.details.openRecipe')}>
                                    <IconButton
                                      size="small"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        window.open(`/recipes/${product.recipeId}`, '_blank');
                                      }}
                                      sx={{ opacity: 0.6, '&:hover': { opacity: 1 } }}
                                    >
                                      <OpenInNewIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                )}
                              </Box>
                            </TableCell>
                            <TableCell align="center">
                              <Chip label={product.totalTasks} size="small" color="primary" />
                            </TableCell>
                            <TableCell align="center">
                              <Chip 
                                label={product.totalSessions} 
                                size="small" 
                                color="secondary" 
                                variant="outlined"
                              />
                            </TableCell>
                            <TableCell align="right">{product.totalQuantity.toFixed(2)}</TableCell>
                            <TableCell align="right">{formatCurrency(product.totalMaterialCost)}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                              {formatCurrency(product.totalFullCost)}
                            </TableCell>
                            <TableCell align="right">
                              {product.totalQuantity > 0 
                                ? formatCurrency(product.totalFullCost / product.totalQuantity)
                                : '-'}
                            </TableCell>
                          </TableRow>
                          
                          {/* Rozwinięty wiersz z detalami */}
                          <TableRow>
                            <TableCell 
                              style={{ paddingBottom: 0, paddingTop: 0 }} 
                              colSpan={7}
                            >
                              <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                                <Box sx={{ 
                                  margin: 2,
                                  p: 2,
                                  borderRadius: 2,
                                  bgcolor: isDarkMode 
                                    ? alpha(theme.palette.primary.main, 0.08) 
                                    : alpha(theme.palette.primary.main, 0.04),
                                  border: `1px solid ${isDarkMode 
                                    ? alpha(theme.palette.primary.main, 0.2) 
                                    : alpha(theme.palette.primary.main, 0.1)}`
                                }}>
                                  <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600, color: 'primary.main' }}>
                                    {t('productionCostsReport.details.productionTasksFor')}: {product.name}
                                  </Typography>
                                  <Table size="small">
                                    <TableHead>
                                      <TableRow>
                                        <TableCell sx={{ fontWeight: 'bold' }}>{t('productionCostsReport.details.mo')}</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>{t('productionCostsReport.details.completionDate')}</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>{t('productionCostsReport.details.status')}</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>{t('productionCostsReport.table.quantityInPeriod')}</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>{t('productionCostsReport.details.totalQuantity')}</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>{t('productionCostsReport.details.productionTime')}</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>{t('productionCostsReport.details.materialCostShort')}</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>{t('productionCostsReport.table.fullCost')}</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>{t('productionCostsReport.details.unitCost')}</TableCell>
                                        <TableCell align="center" sx={{ fontWeight: 'bold' }}>{t('productionCostsReport.details.actions')}</TableCell>
                                      </TableRow>
                                    </TableHead>
                                    <TableBody>
                                      {product.tasks.map((task) => (
                                        <TableRow key={task.id} hover>
                                          <TableCell>
                                            <Link
                                              component="button"
                                              variant="body2"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                window.open(`/production/tasks/${task.id}`, '_blank');
                                              }}
                                              sx={{ fontWeight: 'medium' }}
                                            >
                                              {task.moNumber || task.id.slice(0, 8)}
                                            </Link>
                                          </TableCell>
                                          <TableCell>
                                            {task.completionDate 
                                              ? formatDateDisplay(task.completionDate)
                                              : '-'}
                                          </TableCell>
                                          <TableCell>
                                            <Chip 
                                              label={task.status || t('productionCostsReport.details.noStatus')} 
                                              size="small" 
                                              color={
                                                task.status === 'Zakończone' ? 'success' :
                                                task.status === 'W trakcie' ? 'warning' :
                                                task.status === 'Potwierdzenie zużycia' ? 'info' :
                                                'default'
                                              }
                                              variant="outlined"
                                            />
                                          </TableCell>
                                          <TableCell align="right">
                                            <Box>
                                              <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                                                {(task.quantityInPeriod || 0).toFixed(2)}
                                              </Typography>
                                              {task.hasSessionsOutsidePeriod && (
                                                <Tooltip title={t('productionCostsReport.details.periodInfo')}>
                                                  <Typography variant="caption" color="text.secondary" sx={{ cursor: 'help' }}>
                                                    / {(task.totalCompletedQuantity || 0).toFixed(2)}
                                                  </Typography>
                                                </Tooltip>
                                              )}
                                            </Box>
                                          </TableCell>
                                          <TableCell align="right">
                                            {task.totalCompletedQuantity?.toFixed(2) || '-'}
                                            {task.plannedQuantity && task.totalCompletedQuantity !== task.plannedQuantity && (
                                              <Typography variant="caption" color="text.secondary" display="block">
                                                / {task.plannedQuantity.toFixed(2)} {t('productionCostsReport.details.plan')}
                                              </Typography>
                                            )}
                                          </TableCell>
                                          <TableCell align="right">
                                            {task.totalProductionTimeInPeriodHours || '-'}
                                          </TableCell>
                                          <TableCell align="right">
                                            {formatCurrency(task.materialCostInPeriod || 0)}
                                            {task.hasSessionsOutsidePeriod && (
                                              <Typography variant="caption" color="text.secondary" display="block">
                                                / {formatCurrency(task.totalMaterialCost || 0)}
                                              </Typography>
                                            )}
                                          </TableCell>
                                          <TableCell align="right" sx={{ fontWeight: 'medium' }}>
                                            {formatCurrency(task.fullCostInPeriod || 0)}
                                            {task.hasSessionsOutsidePeriod && (
                                              <Typography variant="caption" color="text.secondary" display="block">
                                                / {formatCurrency(task.totalFullProductionCost || 0)}
                                              </Typography>
                                            )}
                                          </TableCell>
                                          <TableCell align="right">
                                            {task.completedQuantity > 0 
                                              ? formatCurrency(task.unitFullCost || 0)
                                              : '-'}
                                          </TableCell>
                                          <TableCell align="center">
                                            <Tooltip title={t('productionCostsReport.details.openTask')}>
                                              <IconButton
                                                size="small"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  window.open(`/production/tasks/${task.id}`, '_blank');
                                                }}
                                              >
                                                <OpenInNewIcon fontSize="small" />
                                              </IconButton>
                                            </Tooltip>
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </Box>
                              </Collapse>
                            </TableCell>
                          </TableRow>
                        </React.Fragment>
                      );
                    })}
                    <TableRow sx={{ '& td': { fontWeight: 'bold', bgcolor: 'action.hover' } }}>
                      <TableCell></TableCell>
                      <TableCell>{t('productionCostsReport.table.sum')}</TableCell>
                      <TableCell align="center">
                        <Chip label={stats.totalTasks} size="small" color="secondary" />
                      </TableCell>
                      <TableCell align="center">
                        <Chip label={stats.totalSessions} size="small" color="secondary" variant="outlined" />
                      </TableCell>
                      <TableCell align="right">{stats.totalQuantity.toFixed(2)}</TableCell>
                      <TableCell align="right">{formatCurrency(stats.totalMaterialCost)}</TableCell>
                      <TableCell align="right">{formatCurrency(stats.totalFullCost)}</TableCell>
                      <TableCell align="right">{formatCurrency(stats.avgUnitCost)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          ) : (
            <Paper sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="h6" color="text.secondary">
                {t('productionCostsReport.emptyState.title')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {t('productionCostsReport.emptyState.description')}
              </Typography>
            </Paper>
          )}
        </>
      )}
    </Box>
  );
};

export default ProductionCostsPage;
