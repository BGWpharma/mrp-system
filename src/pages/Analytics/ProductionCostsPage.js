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
import { useNavigate } from 'react-router-dom';
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

const ProductionCostsPage = () => {
  const navigate = useNavigate();
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
        totalMaterialCost: 0,
        totalFullCost: 0,
        avgUnitCost: 0,
        totalQuantity: 0
      };
    }
    
    const totalMaterialCost = filteredTasks.reduce((sum, task) => sum + (task.totalMaterialCost || 0), 0);
    const totalFullCost = filteredTasks.reduce((sum, task) => sum + (task.totalFullProductionCost || 0), 0);
    const totalQuantity = filteredTasks.reduce((sum, task) => sum + (task.completedQuantity || 0), 0);
    
    return {
      totalTasks: filteredTasks.length,
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
      grouped[productName].totalQuantity += task.completedQuantity || 0;
      grouped[productName].totalMaterialCost += task.totalMaterialCost || 0;
      grouped[productName].totalFullCost += task.totalFullProductionCost || 0;
      grouped[productName].tasks.push(task);
    });
    
    return Object.values(grouped).sort((a, b) => b.totalFullCost - a.totalFullCost);
  }, [filteredTasks]);

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
          {/* Karty statystyk */}
          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6} md={3}>
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
            <Grid item xs={12} sm={6} md={3}>
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
            <Grid item xs={12} sm={6} md={3}>
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
            <Grid item xs={12} sm={6} md={3}>
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
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>{t('productionCostsReport.table.quantity')}</TableCell>
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
                                        navigate(`/recipes/${product.recipeId}`);
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
                                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>{t('productionCostsReport.table.quantity')}</TableCell>
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
                                                navigate(`/production/tasks/${task.id}`);
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
                                            {(task.completedQuantity || 0).toFixed(2)}
                                            {task.plannedQuantity && task.completedQuantity !== task.plannedQuantity && (
                                              <Typography variant="caption" color="text.secondary" display="block">
                                                / {task.plannedQuantity.toFixed(2)} {t('productionCostsReport.details.plan')}
                                              </Typography>
                                            )}
                                          </TableCell>
                                          <TableCell align="right">
                                            {task.totalProductionTimeHours || '-'}
                                          </TableCell>
                                          <TableCell align="right">
                                            {formatCurrency(task.totalMaterialCost || 0)}
                                          </TableCell>
                                          <TableCell align="right" sx={{ fontWeight: 'medium' }}>
                                            {formatCurrency(task.totalFullProductionCost || 0)}
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
                                                  navigate(`/production/tasks/${task.id}`);
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
