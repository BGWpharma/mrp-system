import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CardHeader,
  Button,
  TextField,
  MenuItem,
  CircularProgress,
  Alert,
  Divider,
  Paper,
  Chip,
  IconButton,
  Tooltip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TableSortLabel,
  Autocomplete
} from '@mui/material';
import {
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Assessment as AssessmentIcon,
  AccountBalance as AccountBalanceIcon,
  ShoppingCart as ShoppingCartIcon,
  LocalShipping as LocalShippingIcon,
  Receipt as ReceiptIcon,
  Factory as FactoryIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  OpenInNew as OpenInNewIcon,
  FilterList as FilterListIcon
} from '@mui/icons-material';

import {
  generateFinancialReport,
  exportReportToCSV,
  getReportStatistics,
  getFilterOptions
} from '../../services/financialReportService';
import { formatCurrency } from '../../utils/formatUtils';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';

const FinancialReportPage = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const { t } = useTranslation('financialReport');
  
  // Stan danych
  const [reportData, setReportData] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Filtry
  const [filters, setFilters] = useState({
    dateFrom: null,
    dateTo: null,
    supplierId: '',
    customerId: '',
    status: '',
    searchTerm: ''
  });
  
  // Opcje filtrów
  const [filterOptions, setFilterOptions] = useState({
    suppliers: [],
    customers: [],
    statuses: []
  });
  
  // Paginacja
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  
  // Sortowanie
  const [orderBy, setOrderBy] = useState('mo_number');
  const [order, setOrder] = useState('desc');
  
  // Załaduj opcje filtrów przy montowaniu
  useEffect(() => {
    loadFilterOptions();
  }, []);
  
  // Oblicz filteredData używając useMemo (bez race condition)
  const filteredData = useMemo(() => {
    if (reportData.length === 0) {
      return [];
    }
    
    if (!filters.searchTerm) {
      return reportData;
    }
    
    const searchLower = filters.searchTerm.toLowerCase();
    return reportData.filter(row => 
      (row.po_number || '').toLowerCase().includes(searchLower) ||
      (row.po_supplier || '').toLowerCase().includes(searchLower) ||
      (row.mo_number || '').toLowerCase().includes(searchLower) ||
      (row.mo_product || '').toLowerCase().includes(searchLower) ||
      (row.co_number || '').toLowerCase().includes(searchLower) ||
      (row.co_customer || '').toLowerCase().includes(searchLower) ||
      (row.invoice_number || '').toLowerCase().includes(searchLower) ||
      (row.material_name || '').toLowerCase().includes(searchLower)
    );
  }, [reportData, filters.searchTerm]);
  
  const loadFilterOptions = async () => {
    try {
      const options = await getFilterOptions();
      setFilterOptions(options);
    } catch (error) {
      console.error('Błąd podczas ładowania opcji filtrów:', error);
    }
  };
  
  const handleGenerateReport = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log('🔄 Generowanie raportu z filtrami:', filters);
      
      // Przygotuj filtry dla backendu (bez searchTerm - jest lokalny)
      const backendFilters = {
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        supplierId: filters.supplierId,
        customerId: filters.customerId,
        status: filters.status
      };
      
      const data = await generateFinancialReport(backendFilters);
      setReportData(data);
      
      // Oblicz statystyki
      const stats = getReportStatistics(data);
      setStatistics(stats);
      
      showSuccess(t('messages.reportGenerated', { count: data.length }));
    } catch (error) {
      console.error('Błąd podczas generowania raportu:', error);
      setError(t('messages.reportGenerationError') + ': ' + error.message);
      showError(t('messages.reportGenerationError'));
    } finally {
      setLoading(false);
    }
  };
  
  const handleExportCSV = () => {
    try {
      const csv = exportReportToCSV(filteredData);
      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      const timestamp = new Date().toISOString().split('T')[0];
      link.setAttribute('href', url);
      link.setAttribute('download', `raport_finansowy_${timestamp}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      showSuccess(t('messages.csvExported'));
    } catch (error) {
      console.error('Błąd podczas eksportu CSV:', error);
      showError(t('messages.csvExportError'));
    }
  };
  
  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };
  
  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };
  
  const handleRequestSort = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };
  
  const sortData = (data) => {
    return data.sort((a, b) => {
      const aValue = a[orderBy] || '';
      const bValue = b[orderBy] || '';
      
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return order === 'asc' ? aValue - bValue : bValue - aValue;
      }
      
      return order === 'asc' 
        ? String(aValue).localeCompare(String(bValue))
        : String(bValue).localeCompare(String(aValue));
    });
  };
  
  const paginatedData = sortData([...filteredData]).slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );
  
  const gradients = {
    primary: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    success: 'linear-gradient(135deg, #56ab2f 0%, #a8e063 100%)',
    error: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    warning: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    info: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'
  };

  const StatCard = ({ title, value, icon: Icon, color = 'primary', subtitle }) => (
    <Card sx={{ 
      height: '100%',
      background: gradients[color] || gradients.primary,
      color: 'white',
      transition: 'transform 0.2s, box-shadow 0.2s',
      '&:hover': {
        transform: 'translateY(-4px)',
        boxShadow: '0 12px 24px rgba(0,0,0,0.15)'
      }
    }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Icon sx={{ fontSize: 40, opacity: 0.9, mr: 2 }} />
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="body2" sx={{ opacity: 0.9, mb: 0.5 }}>
              {title}
            </Typography>
            <Typography variant="h3" component="div" sx={{ fontWeight: 'bold' }}>
              {value}
            </Typography>
            {subtitle && (
              <Typography variant="caption" sx={{ mt: 0.5, opacity: 0.8, display: 'block' }}>
                {subtitle}
              </Typography>
            )}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
  
  return (
    <Box>
      {/* Nagłówek */}
      <Paper 
        elevation={0}
        sx={{ 
          p: 3, 
          mb: 3,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          borderRadius: 2,
          boxShadow: '0 4px 12px rgba(102,126,234,0.3)'
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 'bold', mb: 1 }}>
              📊 {t('title')}
            </Typography>
            <Typography variant="body1" sx={{ opacity: 0.95 }}>
              {t('subtitle')}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={handleGenerateReport}
              disabled={loading}
              sx={{ 
                color: 'white',
                borderColor: 'white',
                '&:hover': {
                  borderColor: 'white',
                  backgroundColor: 'rgba(255,255,255,0.1)'
                }
              }}
            >
              {t('buttons.generateReport')}
            </Button>
            <Button
              variant="contained"
              startIcon={<DownloadIcon />}
              onClick={handleExportCSV}
              disabled={!filteredData.length || loading}
              sx={{ 
                backgroundColor: 'white',
                color: 'primary.main',
                fontWeight: 600,
                '&:hover': {
                  backgroundColor: 'rgba(255,255,255,0.9)'
                }
              }}
            >
              {t('buttons.exportCsv')}
            </Button>
          </Box>
        </Box>
      </Paper>
      
      {/* Filtry */}
      <Card sx={{ mb: 3, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
        <CardHeader 
          title={
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <FilterListIcon sx={{ mr: 1, color: 'primary.main' }} />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                {t('filters.title')}
              </Typography>
            </Box>
          }
          subheader={t('subtitle')}
        />
        <Divider />
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={3}>
              <TextField
                label={t('filters.dateFrom')}
                type="date"
                fullWidth
                value={filters.dateFrom || ''}
                onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                label={t('filters.dateTo')}
                type="date"
                fullWidth
                value={filters.dateTo || ''}
                onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <Autocomplete
                options={filterOptions.suppliers}
                getOptionLabel={(option) => option.name}
                value={filterOptions.suppliers.find(s => s.id === filters.supplierId) || null}
                onChange={(event, newValue) => {
                  setFilters({ ...filters, supplierId: newValue?.id || '' });
                }}
                renderInput={(params) => (
                  <TextField {...params} label={t('filters.supplier')} />
                )}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <Autocomplete
                options={filterOptions.customers}
                getOptionLabel={(option) => option.name}
                value={filterOptions.customers.find(c => c.id === filters.customerId) || null}
                onChange={(event, newValue) => {
                  setFilters({ ...filters, customerId: newValue?.id || '' });
                }}
                renderInput={(params) => (
                  <TextField {...params} label={t('filters.customer')} />
                )}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                select
                label={t('filters.moStatus')}
                fullWidth
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              >
                {filterOptions.statuses.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={9}>
              <TextField
                label={t('filters.searchLabel')}
                fullWidth
                value={filters.searchTerm}
                onChange={(e) => setFilters({ ...filters, searchTerm: e.target.value })}
                placeholder={t('filters.searchPlaceholder')}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>
      
      {/* Statystyki - USUNIĘTE na prośbę użytkownika */}
      {/* 
      {statistics && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} md={3}>
            <StatCard
              title={t('statistics.purchaseValue.title')}
              value={formatCurrency(statistics.totalPurchaseValue)}
              icon={ShoppingCartIcon}
              color="info"
              subtitle={t('statistics.purchaseValue.subtitle', { count: reportData.length })}
            />
          </Grid>
          <Grid item xs={12} md={3}>
            <StatCard
              title={t('statistics.productionCost.title')}
              value={formatCurrency(statistics.totalProductionCost)}
              icon={FactoryIcon}
              color="warning"
              subtitle={t('statistics.productionCost.subtitle', { count: statistics.uniqueOrders })}
            />
          </Grid>
          <Grid item xs={12} md={3}>
            <StatCard
              title={t('statistics.salesValue.title')}
              value={formatCurrency(statistics.totalSalesValue)}
              icon={LocalShippingIcon}
              color="success"
              subtitle={t('statistics.salesValue.subtitle', { count: statistics.completedOrders })}
            />
          </Grid>
          <Grid item xs={12} md={3}>
            <StatCard
              title={t('statistics.margin.title')}
              value={formatCurrency(statistics.totalMargin)}
              icon={statistics.totalMargin >= 0 ? TrendingUpIcon : TrendingDownIcon}
              color={statistics.totalMargin >= 0 ? 'success' : 'error'}
              subtitle={`${statistics.averageMarginPercentage.toFixed(1)}%`}
            />
          </Grid>
        </Grid>
      )}
      */}
      
      {/* Komunikaty */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      )}
      
      {/* Tabela z danymi */}
      {!loading && filteredData.length > 0 && (
        <Card>
          <CardHeader 
            title={t('table.title', { count: filteredData.length })}
            subheader={t('table.subtitle', { 
              from: page * rowsPerPage + 1, 
              to: Math.min((page + 1) * rowsPerPage, filteredData.length), 
              total: filteredData.length 
            })}
          />
          <Divider />
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>
                    <TableSortLabel
                      active={orderBy === 'po_number'}
                      direction={orderBy === 'po_number' ? order : 'asc'}
                      onClick={() => handleRequestSort('po_number')}
                    >
                      {t('table.headers.po')}
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>{t('table.headers.supplier')}</TableCell>
                  <TableCell>{t('table.headers.batch')}</TableCell>
                  <TableCell>{t('table.headers.material')}</TableCell>
                  <TableCell align="right">{t('table.headers.quantity')}</TableCell>
                  <TableCell align="right">
                    <TableSortLabel
                      active={orderBy === 'batch_final_unit_price'}
                      direction={orderBy === 'batch_final_unit_price' ? order : 'asc'}
                      onClick={() => handleRequestSort('batch_final_unit_price')}
                    >
                      {t('table.headers.batchPrice')}
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={orderBy === 'mo_number'}
                      direction={orderBy === 'mo_number' ? order : 'asc'}
                      onClick={() => handleRequestSort('mo_number')}
                    >
                      {t('table.headers.mo')}
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>{t('table.headers.product')}</TableCell>
                  <TableCell align="right">
                    <TableSortLabel
                      active={orderBy === 'mo_full_production_cost'}
                      direction={orderBy === 'mo_full_production_cost' ? order : 'asc'}
                      onClick={() => handleRequestSort('mo_full_production_cost')}
                    >
                      {t('table.headers.productionCost')}
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>{t('table.headers.co')}</TableCell>
                  <TableCell>{t('table.headers.customer')}</TableCell>
                  <TableCell align="right">
                    <TableSortLabel
                      active={orderBy === 'co_total_sale_value'}
                      direction={orderBy === 'co_total_sale_value' ? order : 'asc'}
                      onClick={() => handleRequestSort('co_total_sale_value')}
                    >
                      {t('table.headers.salesValue')}
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>{t('table.headers.invoice')}</TableCell>
                  <TableCell align="right">
                    <TableSortLabel
                      active={orderBy === 'margin'}
                      direction={orderBy === 'margin' ? order : 'asc'}
                      onClick={() => handleRequestSort('margin')}
                    >
                      {t('table.headers.margin')}
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>{t('table.headers.status')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedData.map((row, index) => (
                  <TableRow key={index} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                        {row.po_number || '-'}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        {row.po_date}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {row.po_supplier || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {row.batch_number || '-'}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        {row.batch_quantity > 0 ? `${row.batch_quantity} szt.` : ''}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {row.material_name || '-'}
                      </Typography>
                      {row.batch_source && (
                        <Chip 
                          label={row.batch_source === 'consumed' ? t('table.chips.consumed') : row.batch_source === 'reserved' ? t('table.chips.reserved') : row.batch_source}
                          size="small"
                          color={row.batch_source === 'consumed' ? 'success' : 'default'}
                          sx={{ mt: 0.5 }}
                        />
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {(row.material_used_quantity > 0 || row.material_used_quantity === 0) ? (
                        <>
                          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                            {typeof row.material_used_quantity === 'number' 
                              ? row.material_used_quantity.toFixed(2) 
                              : parseFloat(row.material_used_quantity || 0).toFixed(2)}
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            {row.material_unit || 'szt.'}
                          </Typography>
                          {row.material_value > 0 && (
                            <Typography variant="caption" display="block" color="info.main">
                              {formatCurrency(row.material_value)}
                            </Typography>
                          )}
                        </>
                      ) : '-'}
                    </TableCell>
                    <TableCell align="right">
                      {row.batch_final_unit_price > 0 ? (
                        <>
                          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                            {formatCurrency(row.batch_final_unit_price)}
                          </Typography>
                          {row.po_additional_costs_per_unit > 0 && (
                            <Tooltip title={t('table.tooltips.basePrice', { 
                              basePrice: formatCurrency(row.po_base_unit_price), 
                              additionalCost: formatCurrency(row.po_additional_costs_per_unit) 
                            })}>
                              <Typography variant="caption" color="info.main">
                                (+{formatCurrency(row.po_additional_costs_per_unit)})
                              </Typography>
                            </Tooltip>
                          )}
                        </>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box>
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              fontWeight: 'bold',
                              cursor: row.mo_id ? 'pointer' : 'default',
                              color: row.mo_id ? 'primary.main' : 'text.primary',
                              textDecoration: row.mo_id ? 'underline' : 'none',
                              '&:hover': row.mo_id ? {
                                color: 'primary.dark'
                              } : {}
                            }}
                            onClick={() => row.mo_id && navigate(`/production/tasks/${row.mo_id}`)}
                          >
                            {row.mo_number || '-'}
                          </Typography>
                          <Chip 
                            label={row.mo_status} 
                            size="small" 
                            color={
                              row.mo_status === t('statuses.completed') ? 'success' : 
                              row.mo_status === t('statuses.inProgress') ? 'warning' : 'default'
                            }
                            sx={{ mt: 0.5 }}
                          />
                        </Box>
                        {row.mo_id && (
                          <Tooltip title={t('table.tooltips.openMoDetails')}>
                            <IconButton 
                              size="small" 
                              color="primary"
                              onClick={() => navigate(`/production/tasks/${row.mo_id}`)}
                            >
                              <OpenInNewIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {row.mo_product || '-'}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        {row.mo_completed_quantity}/{row.mo_quantity}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                        {formatCurrency(row.mo_full_production_cost)}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        {t('table.labels.materials')}: {formatCurrency(row.mo_material_cost)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                        {row.co_number || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {row.co_customer || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'success.main' }}>
                        {formatCurrency(row.co_total_sale_value)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {row.invoice_number || '-'}
                      </Typography>
                      {row.invoice_payment_status && (
                        <Chip 
                          label={row.invoice_payment_status} 
                          size="small"
                          color={
                            row.invoice_payment_status === 'paid' || row.invoice_payment_status === t('statuses.paid') ? 'success' : 'warning'
                          }
                        />
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          fontWeight: 'bold',
                          color: row.margin >= 0 ? 'success.main' : 'error.main'
                        }}
                      >
                        {formatCurrency(row.margin)}
                      </Typography>
                      <Typography 
                        variant="caption" 
                        sx={{ 
                          color: row.margin_percentage >= 0 ? 'success.main' : 'error.main'
                        }}
                      >
                        {row.margin_percentage.toFixed(1)}%
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {row.is_complete_chain ? (
                        <Tooltip title={t('table.tooltips.completeChain')}>
                          <CheckCircleIcon color="success" fontSize="small" />
                        </Tooltip>
                      ) : (
                        <Tooltip title={t('table.tooltips.incompleteChain')}>
                          <WarningIcon color="warning" fontSize="small" />
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={filteredData.length}
            page={page}
            onPageChange={handleChangePage}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            rowsPerPageOptions={[10, 25, 50, 100]}
            labelRowsPerPage={t('table.labels.rowsPerPage')}
            labelDisplayedRows={({ from, to, count }) => t('table.labels.displayedRows', { from, to, count })}
          />
        </Card>
      )}
      
      {/* Brak danych */}
      {!loading && filteredData.length === 0 && reportData.length === 0 && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <AssessmentIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="textSecondary" gutterBottom>
            {t('empty.title')}
          </Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
            {t('empty.description')}
          </Typography>
          <Button variant="contained" onClick={handleGenerateReport} disabled={loading}>
            {t('empty.button')}
          </Button>
        </Paper>
      )}
      
      {!loading && filteredData.length === 0 && reportData.length > 0 && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="textSecondary">
            {t('noResults.title')}
          </Typography>
          <Typography variant="body2" color="textSecondary">
            {t('noResults.description')}
          </Typography>
        </Paper>
      )}
    </Box>
  );
};

export default FinancialReportPage;

