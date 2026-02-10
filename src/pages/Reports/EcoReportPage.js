// src/pages/Reports/EcoReportPage.js
import React, { useState, useCallback } from 'react';
import {
  Container,
  Box,
  Typography,
  Paper,
  Grid,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
  AlertTitle,
  CircularProgress,
  Tabs,
  Tab,
  Chip,
  InputAdornment,
  Tooltip,
  Collapse,
  IconButton,
  Switch,
  FormControlLabel
} from '@mui/material';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { pl } from 'date-fns/locale';
import {
  EnergySavingsLeaf as EcoIcon,
  Download as DownloadIcon,
  Search as SearchIcon,
  CalendarMonth as CalendarIcon,
  LocalShipping as SupplierIcon,
  Science as RawMaterialIcon,
  Inventory as ProductIcon,
  Info as InfoIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  WarningAmber as WarningIcon,
  CheckCircle as CheckIcon
} from '@mui/icons-material';
import { useTranslation } from '../../hooks/useTranslation';
import { fetchEcoReportData, exportEcoReportToExcel } from '../../services/ecoReportService';

/**
 * Komponent panelu Tab
 */
const TabPanel = ({ children, value, index, ...other }) => (
  <div role="tabpanel" hidden={value !== index} {...other}>
    {value === index && <Box sx={{ pt: 2 }}>{children}</Box>}
  </div>
);

/**
 * Strona obrotówki EKO - Zestawienie obrotów produktów ekologicznych
 */
const EcoReportPage = () => {
  const { t } = useTranslation('ecoReport');

  // State
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    d.setDate(1);
    return d;
  });
  const [dateTo, setDateTo] = useState(() => {
    const d = new Date();
    d.setDate(0); // Ostatni dzień poprzedniego miesiąca
    return d;
  });
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [showInfo, setShowInfo] = useState(true);
  const [ecoMode, setEcoMode] = useState(false);

  /**
   * Generuj podgląd danych
   */
  const handleFetchData = useCallback(async () => {
    if (!dateFrom || !dateTo) {
      setError(t('errors.selectDates'));
      return;
    }
    if (dateFrom > dateTo) {
      setError(t('errors.invalidDateRange'));
      return;
    }

    setLoading(true);
    setError(null);
    setReportData(null);

    try {
      const data = await fetchEcoReportData({ dateFrom, dateTo, ecoMode });
      setReportData(data);
    } catch (err) {
      console.error('Błąd pobierania danych obrotówki EKO:', err);
      setError(t('errors.fetchFailed', { error: err.message }));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, ecoMode, t]);

  /**
   * Eksport do Excel
   */
  const handleExport = useCallback(async () => {
    setExporting(true);
    setError(null);

    try {
      let data = reportData;
      if (!data) {
        data = await fetchEcoReportData({ dateFrom, dateTo, ecoMode });
        setReportData(data);
      }
      const result = await exportEcoReportToExcel(data, { dateFrom, dateTo, ecoMode });
      console.log('Obrotówka EKO wyeksportowana:', result);
    } catch (err) {
      console.error('Błąd eksportu obrotówki EKO:', err);
      setError(t('errors.exportFailed', { error: err.message }));
    } finally {
      setExporting(false);
    }
  }, [reportData, dateFrom, dateTo, ecoMode, t]);

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      {/* Tytuł */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexDirection: { xs: 'column', md: 'row' } }}>
        <Typography variant="h5" sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', mb: { xs: 2, md: 0 } }}>
          <EcoIcon sx={{ mr: 1 }} color="success" />
          {t('title')}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexDirection: { xs: 'column', sm: 'row' } }}>
          <Button
            variant="contained"
            startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <SearchIcon />}
            onClick={handleFetchData}
            disabled={loading || exporting}
            color="primary"
          >
            {t('actions.preview')}
          </Button>
          <Tooltip title={t('actions.exportTooltip')}>
            <Button
              variant="contained"
              startIcon={exporting ? <CircularProgress size={20} color="inherit" /> : <DownloadIcon />}
              onClick={handleExport}
              disabled={loading || exporting}
              color="success"
            >
              {t('actions.exportExcel')}
            </Button>
          </Tooltip>
        </Box>
      </Box>

      {/* Info banner */}
      <Collapse in={showInfo}>
        <Alert 
          severity="info" 
          sx={{ mb: 3 }}
          action={
            <IconButton size="small" onClick={() => setShowInfo(false)}>
              <ExpandLessIcon />
            </IconButton>
          }
        >
          <AlertTitle>{t('info.title')}</AlertTitle>
          <Typography variant="body2">{t('info.description')}</Typography>
          <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Chip icon={<CheckIcon />} label={t('info.autoFields')} color="success" size="small" variant="outlined" />
            <Chip icon={<WarningIcon />} label={t('info.manualFields')} color="warning" size="small" variant="outlined" />
          </Box>
        </Alert>
      </Collapse>
      {!showInfo && (
        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
          <IconButton size="small" onClick={() => setShowInfo(true)} title={t('info.show')}>
            <InfoIcon color="info" />
          </IconButton>
        </Box>
      )}

      {/* Filtry dat */}
      <Paper sx={{ p: 3, mb: 3, borderRadius: 2, boxShadow: 3 }}>
        <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'bold' }}>
          {t('filters.title')}
        </Typography>
        <Grid container spacing={3} alignItems="center">
          <Grid item xs={12} md={5}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
              <DatePicker
                label={t('filters.dateFrom')}
                value={dateFrom}
                onChange={(newDate) => {
                  if (newDate && !isNaN(new Date(newDate).getTime())) {
                    setDateFrom(newDate);
                  }
                }}
                disabled={loading || exporting}
                format="dd.MM.yyyy"
                slotProps={{
                  textField: {
                    fullWidth: true,
                    variant: 'outlined',
                    InputProps: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <CalendarIcon color="primary" />
                        </InputAdornment>
                      ),
                    }
                  }
                }}
              />
            </LocalizationProvider>
          </Grid>
          <Grid item xs={12} md={5}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
              <DatePicker
                label={t('filters.dateTo')}
                value={dateTo}
                minDate={dateFrom}
                onChange={(newDate) => {
                  if (newDate && !isNaN(new Date(newDate).getTime())) {
                    setDateTo(newDate);
                  }
                }}
                disabled={loading || exporting}
                format="dd.MM.yyyy"
                slotProps={{
                  textField: {
                    fullWidth: true,
                    variant: 'outlined',
                    InputProps: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <CalendarIcon color="primary" />
                        </InputAdornment>
                      ),
                    }
                  }
                }}
              />
            </LocalizationProvider>
          </Grid>
          <Grid item xs={12} md={2}>
            <Button
              variant="contained"
              startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <SearchIcon />}
              onClick={handleFetchData}
              disabled={loading || exporting}
              color="primary"
              fullWidth
              sx={{ height: 56 }}
            >
              {t('actions.search')}
            </Button>
          </Grid>
        </Grid>

        {/* Przełącznik trybu EKO */}
        <Box sx={{ mt: 2, pt: 2, borderTop: 1, borderColor: 'divider', display: 'flex', alignItems: 'center', gap: 2 }}>
          <Tooltip title={t('filters.ecoModeTooltip')}>
            <FormControlLabel
              control={
                <Switch
                  checked={ecoMode}
                  onChange={(e) => {
                    setEcoMode(e.target.checked);
                    setReportData(null); // Reset danych przy zmianie trybu
                  }}
                  color="success"
                  disabled={loading || exporting}
                />
              }
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <EcoIcon color={ecoMode ? 'success' : 'disabled'} fontSize="small" />
                  <Typography variant="body2" fontWeight={ecoMode ? 'bold' : 'normal'}>
                    {t('filters.ecoMode')}
                  </Typography>
                </Box>
              }
            />
          </Tooltip>
          {ecoMode && (
            <Chip 
              icon={<EcoIcon />} 
              label={t('filters.ecoModeActive')} 
              color="success" 
              size="small" 
              variant="outlined" 
            />
          )}
        </Box>
      </Paper>

      {/* Error */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Loading */}
      {loading && (
        <Paper sx={{ p: 6, textAlign: 'center', mb: 3 }}>
          <CircularProgress size={48} color="success" />
          <Typography sx={{ mt: 2 }} color="text.secondary">
            {t('loading')}
          </Typography>
        </Paper>
      )}

      {/* Info o trybie EKO */}
      {reportData && !loading && reportData.ecoMode && (
        <Alert severity="success" sx={{ mb: 2 }} icon={<EcoIcon />}>
          {t('ecoModeInfo')}
        </Alert>
      )}

      {/* Statystyki */}
      {reportData && !loading && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={6} sm={4} md={2}>
            <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'success.50', borderLeft: 4, borderColor: 'success.main' }}>
              <Typography variant="h5" color="success.main" fontWeight="bold">
                {reportData.stats.suppliersCount}
              </Typography>
              <Typography variant="body2" color="text.secondary">{t('stats.suppliers')}</Typography>
            </Paper>
          </Grid>
          <Grid item xs={6} sm={4} md={2}>
            <Paper sx={{ p: 2, textAlign: 'center', borderLeft: 4, borderColor: 'primary.main' }}>
              <Typography variant="h5" color="primary.main" fontWeight="bold">
                {reportData.stats.rawMaterialsCount}
              </Typography>
              <Typography variant="body2" color="text.secondary">{t('stats.rawMaterials')}</Typography>
            </Paper>
          </Grid>
          <Grid item xs={6} sm={4} md={2}>
            <Paper sx={{ p: 2, textAlign: 'center', borderLeft: 4, borderColor: 'secondary.main' }}>
              <Typography variant="h5" color="secondary.main" fontWeight="bold">
                {reportData.stats.finishedProductsCount}
              </Typography>
              <Typography variant="body2" color="text.secondary">{t('stats.finishedProducts')}</Typography>
            </Paper>
          </Grid>
          <Grid item xs={6} sm={4} md={2}>
            <Paper sx={{ p: 2, textAlign: 'center', borderLeft: 4, borderColor: 'info.main' }}>
              <Typography variant="h5" color="info.main" fontWeight="bold">
                {reportData.stats.purchaseOrdersCount}
              </Typography>
              <Typography variant="body2" color="text.secondary">{t('stats.purchaseOrders')}</Typography>
            </Paper>
          </Grid>
          <Grid item xs={6} sm={4} md={2}>
            <Paper sx={{ p: 2, textAlign: 'center', borderLeft: 4, borderColor: 'warning.main' }}>
              <Typography variant="h5" color="warning.main" fontWeight="bold">
                {reportData.stats.productionTasksCount}
              </Typography>
              <Typography variant="body2" color="text.secondary">{t('stats.productionTasks')}</Typography>
            </Paper>
          </Grid>
          <Grid item xs={6} sm={4} md={2}>
            <Paper sx={{ p: 2, textAlign: 'center', borderLeft: 4, borderColor: 'error.main' }}>
              <Typography variant="h5" color="error.main" fontWeight="bold">
                {reportData.stats.transactionsCount}
              </Typography>
              <Typography variant="body2" color="text.secondary">{t('stats.transactions')}</Typography>
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* Tabele z danymi */}
      {reportData && !loading && (
        <Paper sx={{ borderRadius: 2, boxShadow: 3 }}>
          <Tabs 
            value={activeTab} 
            onChange={(e, v) => setActiveTab(v)}
            sx={{ borderBottom: 1, borderColor: 'divider', px: 2 }}
          >
            <Tab 
              icon={<SupplierIcon />} 
              iconPosition="start"
              label={`${t('tabs.suppliers')} (${reportData.suppliersData.length})`}
            />
            <Tab 
              icon={<RawMaterialIcon />} 
              iconPosition="start"
              label={`${t('tabs.rawMaterials')} (${reportData.rawMaterialsData.length})`}
            />
            <Tab 
              icon={<ProductIcon />} 
              iconPosition="start"
              label={`${t('tabs.finishedProducts')} (${reportData.finishedProductsData.length})`}
            />
          </Tabs>

          {/* Tab 1 - Dostawcy */}
          <TabPanel value={activeTab} index={0}>
            <TableContainer sx={{ maxHeight: 600 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 'bold', minWidth: 180 }}>{t('table.suppliers.name')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', minWidth: 220 }}>{t('table.suppliers.address')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', minWidth: 180 }}>{t('table.suppliers.productType')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', minWidth: 120 }} align="right">{t('table.suppliers.quantity')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', minWidth: 100 }}>{t('table.suppliers.unit')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', minWidth: 140, bgcolor: 'warning.50' }}>
                      <Tooltip title={t('table.suppliers.manualHint')}>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <WarningIcon fontSize="small" color="warning" sx={{ mr: 0.5 }} />
                          {t('table.suppliers.certAuthority')}
                        </Box>
                      </Tooltip>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 'bold', minWidth: 140, bgcolor: 'warning.50' }}>
                      <Tooltip title={t('table.suppliers.manualHint')}>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <WarningIcon fontSize="small" color="warning" sx={{ mr: 0.5 }} />
                          {t('table.suppliers.certNumber')}
                        </Box>
                      </Tooltip>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 'bold', minWidth: 180, bgcolor: 'warning.50' }}>
                      <Tooltip title={t('table.suppliers.manualHint')}>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <WarningIcon fontSize="small" color="warning" sx={{ mr: 0.5 }} />
                          {t('table.suppliers.certValidity')}
                        </Box>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {reportData.suppliersData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">{t('table.noData')}</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    reportData.suppliersData.map((row, idx) => (
                      <TableRow key={idx} hover>
                        <TableCell>{row.supplierName}</TableCell>
                        <TableCell>{row.address}</TableCell>
                        <TableCell>{row.productType}</TableCell>
                        <TableCell align="right">{row.quantity?.toFixed(3)}</TableCell>
                        <TableCell>{row.unit}</TableCell>
                        <TableCell sx={{ bgcolor: 'warning.50' }}>{row.certAuthority || '—'}</TableCell>
                        <TableCell sx={{ bgcolor: 'warning.50' }}>{row.certNumber || '—'}</TableCell>
                        <TableCell sx={{ bgcolor: 'warning.50' }}>
                          {row.certValidFrom && row.certValidTo ? `${row.certValidFrom} - ${row.certValidTo}` : '—'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </TabPanel>

          {/* Tab 2 - Surowce */}
          <TabPanel value={activeTab} index={1}>
            <TableContainer sx={{ maxHeight: 600 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 'bold', minWidth: 180 }}>{t('table.rawMaterials.name')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', minWidth: 80 }}>{t('table.rawMaterials.unit')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', minWidth: 120 }} align="right">{t('table.rawMaterials.openingStock')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', minWidth: 120 }} align="right">{t('table.rawMaterials.purchases')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', minWidth: 120 }} align="right">{t('table.rawMaterials.otherIncome')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', minWidth: 120 }} align="right">{t('table.rawMaterials.ownProduction')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', minWidth: 120 }} align="right">{t('table.rawMaterials.consumption')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', minWidth: 120 }} align="right">{t('table.rawMaterials.sales')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', minWidth: 140 }} align="right">{t('table.rawMaterials.otherExpenses')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', minWidth: 120 }} align="right">{t('table.rawMaterials.closingStock')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {reportData.rawMaterialsData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">{t('table.noData')}</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    reportData.rawMaterialsData.map((row, idx) => (
                      <TableRow key={idx} hover>
                        <TableCell>{row.name}</TableCell>
                        <TableCell>{row.unit}</TableCell>
                        <TableCell align="right">{row.openingStock.toFixed(3)}</TableCell>
                        <TableCell align="right">{row.purchases.toFixed(3)}</TableCell>
                        <TableCell align="right">{row.otherIncome.toFixed(3)}</TableCell>
                        <TableCell align="right">{row.ownProduction.toFixed(3)}</TableCell>
                        <TableCell align="right">{row.productionConsumption.toFixed(3)}</TableCell>
                        <TableCell align="right">{row.sales.toFixed(3)}</TableCell>
                        <TableCell align="right">{row.otherExpenses.toFixed(3)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>{row.closingStock.toFixed(3)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </TabPanel>

          {/* Tab 3 - Wyroby gotowe */}
          <TabPanel value={activeTab} index={2}>
            <TableContainer sx={{ maxHeight: 600 }}>
              <Table stickyHeader size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 'bold', minWidth: 180 }}>{t('table.finishedProducts.name')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', minWidth: 80 }}>{t('table.finishedProducts.unit')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', minWidth: 120 }} align="right">{t('table.finishedProducts.openingStock')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', minWidth: 120 }} align="right">{t('table.finishedProducts.purchases')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', minWidth: 120 }} align="right">{t('table.finishedProducts.otherIncome')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', minWidth: 120 }} align="right">{t('table.finishedProducts.ownProduction')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', minWidth: 120 }} align="right">{t('table.finishedProducts.sales')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', minWidth: 140 }} align="right">{t('table.finishedProducts.otherExpenses')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold', minWidth: 120 }} align="right">{t('table.finishedProducts.closingStock')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {reportData.finishedProductsData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                        <Typography color="text.secondary">{t('table.noData')}</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    reportData.finishedProductsData.map((row, idx) => (
                      <TableRow key={idx} hover>
                        <TableCell>{row.name}</TableCell>
                        <TableCell>{row.unit}</TableCell>
                        <TableCell align="right">{row.openingStock.toFixed(3)}</TableCell>
                        <TableCell align="right">{row.purchases.toFixed(3)}</TableCell>
                        <TableCell align="right">{row.otherIncome.toFixed(3)}</TableCell>
                        <TableCell align="right">{row.ownProduction.toFixed(3)}</TableCell>
                        <TableCell align="right">{row.sales.toFixed(3)}</TableCell>
                        <TableCell align="right">{row.otherExpenses.toFixed(3)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>{row.closingStock.toFixed(3)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </TabPanel>
        </Paper>
      )}

      {/* Brak danych - zachęta do wygenerowania */}
      {!reportData && !loading && !error && (
        <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 2 }}>
          <EcoIcon sx={{ fontSize: 64, color: 'success.light', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" gutterBottom>
            {t('empty.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('empty.description')}
          </Typography>
        </Paper>
      )}
    </Container>
  );
};

export default EcoReportPage;
