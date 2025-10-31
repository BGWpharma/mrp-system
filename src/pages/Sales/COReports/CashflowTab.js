// src/pages/Sales/COReports/CashflowTab.js
import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Grid,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
  Divider
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Download as DownloadIcon,
  FilterList as FilterListIcon
} from '@mui/icons-material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { pl } from 'date-fns/locale';
import { subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { useAuth } from '../../../contexts/AuthContext';
import { useNotification } from '../../../hooks/useNotification';
import { useTranslation } from '../../../hooks/useTranslation';
import { getAllCustomers } from '../../../services/customerService';
import {
  generateCashflowReport,
  calculateCashflowStatistics,
  prepareCashflowChartData,
  exportCashflowToCSV
} from '../../../services/cashflowService';
import CashflowSummaryCards from '../../../components/sales/co-reports/CashflowSummaryCards';
import CashflowChart from '../../../components/sales/co-reports/CashflowChart';
import CashflowTable from '../../../components/sales/co-reports/CashflowTable';

/**
 * Główny komponent zakładki Cashflow w raporcie CO
 */
const CashflowTab = () => {
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const { t } = useTranslation('cashflow');

  // Stan danych
  const [loading, setLoading] = useState(false);
  const [cashflowData, setCashflowData] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [error, setError] = useState(null);

  // Filtry - domyślnie ostatnie 3 miesiące
  const [filters, setFilters] = useState({
    dateFrom: startOfMonth(subMonths(new Date(), 2)),
    dateTo: endOfMonth(new Date()),
    customerId: 'all',
    paymentStatus: 'all'
  });

  const [showFilters, setShowFilters] = useState(true);

  // Pobierz listę klientów przy montowaniu
  useEffect(() => {
    fetchCustomers();
  }, []);

  // Pobierz dane przy montowaniu i przy zmianie filtrów
  useEffect(() => {
    if (filters.dateFrom && filters.dateTo) {
      fetchCashflowData();
    }
  }, [filters]);

  const fetchCustomers = async () => {
    try {
      const customersData = await getAllCustomers();
      setCustomers(customersData);
    } catch (error) {
      console.error('Błąd podczas pobierania klientów:', error);
    }
  };

  const fetchCashflowData = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('🔄 Pobieranie danych cashflow z filtrami:', filters);

      // Generuj raport
      const data = await generateCashflowReport(filters);
      setCashflowData(data);

      // Oblicz statystyki
      const stats = calculateCashflowStatistics(data);
      setStatistics(stats);

      // Przygotuj dane dla wykresu
      const chart = prepareCashflowChartData(data);
      setChartData(chart);

      console.log('✅ Dane cashflow załadowane:', {
        orders: data.length,
        stats
      });
    } catch (error) {
      console.error('❌ Błąd podczas pobierania danych cashflow:', error);
      setError(error.message);
      showError(t('cashflow.notifications.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleResetFilters = () => {
    setFilters({
      dateFrom: startOfMonth(subMonths(new Date(), 2)),
      dateTo: endOfMonth(new Date()),
      customerId: 'all',
      paymentStatus: 'all'
    });
  };

  const handleRefresh = () => {
    fetchCashflowData();
  };

  const handleExport = () => {
    try {
      const filename = `cashflow_${filters.dateFrom?.toISOString().split('T')[0]}_${filters.dateTo?.toISOString().split('T')[0]}.csv`;
      exportCashflowToCSV(cashflowData, filename);
      showSuccess(t('cashflow.notifications.exportSuccess'));
    } catch (error) {
      console.error('Błąd podczas eksportowania:', error);
      showError(t('cashflow.notifications.exportError'));
    }
  };

  const paymentStatusOptions = [
    { value: 'all', label: t('cashflow.filters.allStatuses') },
    { value: 'paid', label: t('cashflow.status.paid') },
    { value: 'partially_paid', label: t('cashflow.status.partially_paid') },
    { value: 'pending', label: t('cashflow.status.pending') },
    { value: 'not_invoiced', label: t('cashflow.status.not_invoiced') }
  ];

  return (
    <Box>
      {/* Nagłówek z akcjami */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h5" gutterBottom>
            {t('cashflow.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('cashflow.subtitle')}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title={t('cashflow.filters.title')}>
            <IconButton
              onClick={() => setShowFilters(!showFilters)}
              color={showFilters ? 'primary' : 'default'}
            >
              <FilterListIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title={t('cashflow.refresh')}>
            <IconButton onClick={handleRefresh} disabled={loading}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleExport}
            disabled={loading || cashflowData.length === 0}
          >
            {t('cashflow.exportCSV')}
          </Button>
        </Box>
      </Box>

      {/* Filtry */}
      {showFilters && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            {t('cashflow.filters.title')}
          </Typography>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6} md={3}>
              <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                <DatePicker
                  label={t('cashflow.filters.dateFrom')}
                  value={filters.dateFrom}
                  onChange={(date) => handleFilterChange('dateFrom', date)}
                  renderInput={(params) => <TextField {...params} fullWidth size="small" />}
                  slotProps={{ textField: { fullWidth: true, size: 'small' } }}
                />
              </LocalizationProvider>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                <DatePicker
                  label={t('cashflow.filters.dateTo')}
                  value={filters.dateTo}
                  onChange={(date) => handleFilterChange('dateTo', date)}
                  renderInput={(params) => <TextField {...params} fullWidth size="small" />}
                  slotProps={{ textField: { fullWidth: true, size: 'small' } }}
                />
              </LocalizationProvider>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>{t('cashflow.filters.customer')}</InputLabel>
                <Select
                  value={filters.customerId}
                  label={t('cashflow.filters.customer')}
                  onChange={(e) => handleFilterChange('customerId', e.target.value)}
                >
                  <MenuItem value="all">{t('cashflow.filters.allCustomers')}</MenuItem>
                  {customers.map((customer) => (
                    <MenuItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <FormControl fullWidth size="small">
                <InputLabel>{t('cashflow.filters.paymentStatus')}</InputLabel>
                <Select
                  value={filters.paymentStatus}
                  label={t('cashflow.filters.paymentStatus')}
                  onChange={(e) => handleFilterChange('paymentStatus', e.target.value)}
                >
                  {paymentStatusOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={handleResetFilters} size="small">
              {t('cashflow.filters.reset')}
            </Button>
          </Box>
        </Paper>
      )}

      {/* Stan ładowania */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {/* Błąd */}
      {error && !loading && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {t('cashflow.error')}: {error}
        </Alert>
      )}

      {/* Dane */}
      {!loading && !error && cashflowData.length === 0 && (
        <Alert severity="info" sx={{ mb: 3 }}>
          {t('cashflow.noData')}
        </Alert>
      )}

      {!loading && !error && cashflowData.length > 0 && (
        <>
          {/* Karty podsumowujące */}
          <CashflowSummaryCards 
            statistics={statistics} 
            currency="EUR" 
          />

          <Divider sx={{ my: 3 }} />

          {/* Wykres */}
          <CashflowChart 
            chartData={chartData} 
            currency="EUR" 
          />

          <Divider sx={{ my: 3 }} />

          {/* Tabela */}
          <CashflowTable 
            data={cashflowData} 
            currency="EUR" 
          />
        </>
      )}
    </Box>
  );
};

export default CashflowTab;

