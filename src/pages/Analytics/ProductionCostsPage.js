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
  useTheme
} from '@mui/material';
import {
  MonetizationOn as CostsIcon,
  Refresh as RefreshIcon,
  Download as DownloadIcon,
  FilterList as FilterIcon,
  NavigateBefore as PrevIcon,
  NavigateNext as NextIcon
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
      showError('Nie udało się pobrać danych');
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
      showError('Nie udało się pobrać danych kosztów produkcji');
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
      const productName = task.productName || 'Nieznany produkt';
      
      if (!grouped[productName]) {
        grouped[productName] = {
          name: productName,
          totalTasks: 0,
          totalQuantity: 0,
          totalMaterialCost: 0,
          totalFullCost: 0
        };
      }
      
      grouped[productName].totalTasks++;
      grouped[productName].totalQuantity += task.completedQuantity || 0;
      grouped[productName].totalMaterialCost += task.totalMaterialCost || 0;
      grouped[productName].totalFullCost += task.totalFullProductionCost || 0;
    });
    
    return Object.values(grouped).sort((a, b) => b.totalFullCost - a.totalFullCost);
  }, [filteredTasks]);

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
          <Tooltip title="Odśwież dane">
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
          <Typography variant="h6" sx={{ fontWeight: 600 }}>Filtry raportu</Typography>
        </Box>
        <Grid container spacing={3} alignItems="center">
          <Grid item xs={12} md={3}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
              <DatePicker
                label="Data początkowa"
                value={startDate}
                onChange={setStartDate}
                slotProps={{ textField: { fullWidth: true } }}
              />
            </LocalizationProvider>
          </Grid>
          <Grid item xs={12} md={3}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
              <DatePicker
                label="Data końcowa"
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
                <TextField {...params} label="Produkt" fullWidth />
              )}
              freeSolo
            />
          </Grid>
          <Grid item xs={12} md={3}>
            <FormControl fullWidth>
              <InputLabel>Klient</InputLabel>
              <Select
                value={selectedCustomer}
                onChange={(e) => setSelectedCustomer(e.target.value)}
                label="Klient"
              >
                <MenuItem value="all">Wszyscy klienci</MenuItem>
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
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>Liczba zadań</Typography>
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
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>Koszt materiałów</Typography>
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
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>Pełny koszt produkcji</Typography>
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
                  <Typography variant="body2" sx={{ opacity: 0.9 }}>Śr. koszt/jedn.</Typography>
                  <Typography variant="h4" sx={{ fontWeight: 'bold' }}>{formatCurrency(stats.avgUnitCost)}</Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Tabela kosztów według produktu */}
          {costsByProduct.length > 0 ? (
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                Koszty według produktu
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Okres: {formatDateDisplay(startDate)} - {formatDateDisplay(endDate)}
              </Typography>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 'bold' }}>Produkt</TableCell>
                      <TableCell align="center" sx={{ fontWeight: 'bold' }}>Zadania</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>Ilość</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>Koszt materiałów</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>Pełny koszt</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>Śr. koszt/jedn.</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {costsByProduct.map((product, index) => (
                      <TableRow key={index} hover>
                        <TableCell sx={{ fontWeight: 'medium' }}>{product.name}</TableCell>
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
                    ))}
                    <TableRow sx={{ '& td': { fontWeight: 'bold', bgcolor: 'action.hover' } }}>
                      <TableCell>SUMA</TableCell>
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
                Brak danych kosztów produkcji w wybranym okresie
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Zmień zakres dat lub sprawdź czy zadania produkcyjne mają uzupełnione koszty.
              </Typography>
            </Paper>
          )}
        </>
      )}
    </Box>
  );
};

export default ProductionCostsPage;
