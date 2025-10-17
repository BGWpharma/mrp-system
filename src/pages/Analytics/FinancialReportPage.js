import React, { useState, useEffect } from 'react';
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
  Warning as WarningIcon
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
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const { t } = useTranslation();
  
  // Stan danych
  const [reportData, setReportData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
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
  
  // Zastosuj filtry lokalne (searchTerm)
  useEffect(() => {
    applyLocalFilters();
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
      
      showSuccess(`Wygenerowano raport: ${data.length} rekordów`);
    } catch (error) {
      console.error('Błąd podczas generowania raportu:', error);
      setError('Nie udało się wygenerować raportu: ' + error.message);
      showError('Nie udało się wygenerować raportu');
    } finally {
      setLoading(false);
    }
  };
  
  const applyLocalFilters = () => {
    if (!filters.searchTerm) {
      setFilteredData(reportData);
      return;
    }
    
    const searchLower = filters.searchTerm.toLowerCase();
    const filtered = reportData.filter(row => 
      (row.po_number || '').toLowerCase().includes(searchLower) ||
      (row.po_supplier || '').toLowerCase().includes(searchLower) ||
      (row.mo_number || '').toLowerCase().includes(searchLower) ||
      (row.mo_product || '').toLowerCase().includes(searchLower) ||
      (row.co_number || '').toLowerCase().includes(searchLower) ||
      (row.co_customer || '').toLowerCase().includes(searchLower) ||
      (row.invoice_number || '').toLowerCase().includes(searchLower) ||
      (row.material_name || '').toLowerCase().includes(searchLower)
    );
    
    setFilteredData(filtered);
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
      
      showSuccess('Raport został wyeksportowany do CSV');
    } catch (error) {
      console.error('Błąd podczas eksportu CSV:', error);
      showError('Nie udało się wyeksportować raportu');
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
  
  const StatCard = ({ title, value, icon: Icon, color = 'primary', subtitle }) => (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Icon sx={{ fontSize: 40, color: `${color}.main`, mr: 2 }} />
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="h6" color="textSecondary" gutterBottom>
              {title}
            </Typography>
            <Typography variant="h4" component="div">
              {value}
            </Typography>
            {subtitle && (
              <Typography variant="body2" color="textSecondary" sx={{ mt: 0.5 }}>
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            📊 Raport Finansowy
          </Typography>
          <Typography variant="subtitle1" color="textSecondary">
            Analiza łańcucha: PO → Partia → MO → CO → Faktura
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleGenerateReport}
            disabled={loading}
          >
            Generuj Raport
          </Button>
          <Button
            variant="contained"
            startIcon={<DownloadIcon />}
            onClick={handleExportCSV}
            disabled={!filteredData.length || loading}
          >
            Eksport CSV
          </Button>
        </Box>
      </Box>
      
      {/* Filtry */}
      <Card sx={{ mb: 3 }}>
        <CardHeader title="Filtry" />
        <Divider />
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={3}>
              <TextField
                label="Data od"
                type="date"
                fullWidth
                value={filters.dateFrom || ''}
                onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                label="Data do"
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
                  <TextField {...params} label="Dostawca" />
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
                  <TextField {...params} label="Klient" />
                )}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                select
                label="Status MO"
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
                label="Wyszukaj (PO, MO, CO, Faktura, Materiał, Klient...)"
                fullWidth
                value={filters.searchTerm}
                onChange={(e) => setFilters({ ...filters, searchTerm: e.target.value })}
                placeholder="Wprowadź frazę do wyszukania..."
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>
      
      {/* Statystyki */}
      {statistics && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} md={3}>
            <StatCard
              title="Wartość Zakupów"
              value={formatCurrency(statistics.totalPurchaseValue)}
              icon={ShoppingCartIcon}
              color="info"
              subtitle={`Z ${reportData.length} partii`}
            />
          </Grid>
          <Grid item xs={12} md={3}>
            <StatCard
              title="Koszt Produkcji"
              value={formatCurrency(statistics.totalProductionCost)}
              icon={FactoryIcon}
              color="warning"
              subtitle={`${statistics.uniqueOrders} zleceń MO`}
            />
          </Grid>
          <Grid item xs={12} md={3}>
            <StatCard
              title="Wartość Sprzedaży"
              value={formatCurrency(statistics.totalSalesValue)}
              icon={LocalShippingIcon}
              color="success"
              subtitle={`${statistics.completedOrders} zrealizowanych`}
            />
          </Grid>
          <Grid item xs={12} md={3}>
            <StatCard
              title="Marża"
              value={formatCurrency(statistics.totalMargin)}
              icon={statistics.totalMargin >= 0 ? TrendingUpIcon : TrendingDownIcon}
              color={statistics.totalMargin >= 0 ? 'success' : 'error'}
              subtitle={`${statistics.averageMarginPercentage.toFixed(1)}%`}
            />
          </Grid>
        </Grid>
      )}
      
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
            title={`Wyniki: ${filteredData.length} rekordów`}
            subheader={`Wyświetlanie ${page * rowsPerPage + 1}-${Math.min((page + 1) * rowsPerPage, filteredData.length)} z ${filteredData.length}`}
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
                      PO
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>Dostawca</TableCell>
                  <TableCell>Partia</TableCell>
                  <TableCell>Materiał</TableCell>
                  <TableCell align="right">Ilość</TableCell>
                  <TableCell align="right">
                    <TableSortLabel
                      active={orderBy === 'batch_final_unit_price'}
                      direction={orderBy === 'batch_final_unit_price' ? order : 'asc'}
                      onClick={() => handleRequestSort('batch_final_unit_price')}
                    >
                      Cena Partii
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel
                      active={orderBy === 'mo_number'}
                      direction={orderBy === 'mo_number' ? order : 'asc'}
                      onClick={() => handleRequestSort('mo_number')}
                    >
                      MO
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>Produkt</TableCell>
                  <TableCell align="right">
                    <TableSortLabel
                      active={orderBy === 'mo_full_production_cost'}
                      direction={orderBy === 'mo_full_production_cost' ? order : 'asc'}
                      onClick={() => handleRequestSort('mo_full_production_cost')}
                    >
                      Koszt Prod.
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>CO</TableCell>
                  <TableCell>Klient</TableCell>
                  <TableCell align="right">
                    <TableSortLabel
                      active={orderBy === 'co_total_sale_value'}
                      direction={orderBy === 'co_total_sale_value' ? order : 'asc'}
                      onClick={() => handleRequestSort('co_total_sale_value')}
                    >
                      Wartość Sprz.
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>Faktura</TableCell>
                  <TableCell align="right">
                    <TableSortLabel
                      active={orderBy === 'margin'}
                      direction={orderBy === 'margin' ? order : 'asc'}
                      onClick={() => handleRequestSort('margin')}
                    >
                      Marża
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>Status</TableCell>
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
                          label={row.batch_source === 'consumed' ? 'Skonsumowano' : row.batch_source === 'reserved' ? 'Zarezerwowano' : row.batch_source}
                          size="small"
                          color={row.batch_source === 'consumed' ? 'success' : 'default'}
                          sx={{ mt: 0.5 }}
                        />
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {row.material_used_quantity > 0 ? (
                        <>
                          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                            {row.material_used_quantity.toFixed(2)}
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
                            <Tooltip title={`Baza: ${formatCurrency(row.po_base_unit_price)} + Dodatkowo: ${formatCurrency(row.po_additional_costs_per_unit)}`}>
                              <Typography variant="caption" color="info.main">
                                (+{formatCurrency(row.po_additional_costs_per_unit)})
                              </Typography>
                            </Tooltip>
                          )}
                        </>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                        {row.mo_number || '-'}
                      </Typography>
                      <Chip 
                        label={row.mo_status} 
                        size="small" 
                        color={
                          row.mo_status === 'Zakończone' ? 'success' : 
                          row.mo_status === 'W trakcie' ? 'warning' : 'default'
                        }
                      />
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
                        Mat: {formatCurrency(row.mo_material_cost)}
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
                            row.invoice_payment_status === 'paid' || row.invoice_payment_status === 'Opłacona' ? 'success' : 'warning'
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
                        <Tooltip title="Pełny łańcuch: PO → Partia → MO → CO → Faktura">
                          <CheckCircleIcon color="success" fontSize="small" />
                        </Tooltip>
                      ) : (
                        <Tooltip title="Niekompletny łańcuch danych">
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
            labelRowsPerPage="Wierszy na stronę:"
            labelDisplayedRows={({ from, to, count }) => `${from}-${to} z ${count}`}
          />
        </Card>
      )}
      
      {/* Brak danych */}
      {!loading && filteredData.length === 0 && reportData.length === 0 && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <AssessmentIcon sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="textSecondary" gutterBottom>
            Brak danych do wyświetlenia
          </Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
            Ustaw filtry i kliknij "Generuj Raport" aby zobaczyć dane
          </Typography>
          <Button variant="contained" onClick={handleGenerateReport} disabled={loading}>
            Generuj Raport
          </Button>
        </Paper>
      )}
      
      {!loading && filteredData.length === 0 && reportData.length > 0 && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="textSecondary">
            Brak wyników dla podanego wyszukiwania
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Spróbuj zmienić kryteria wyszukiwania
          </Typography>
        </Paper>
      )}
    </Box>
  );
};

export default FinancialReportPage;

