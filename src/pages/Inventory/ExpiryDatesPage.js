import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  Box,
  Button,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Alert,
  AlertTitle,
  TextField,
  InputAdornment,
  IconButton,
  CircularProgress
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import { getExpiringBatches, getExpiredBatches } from '../../services/inventory';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import { useDebounce } from '../../hooks/useDebounce';
import { Timestamp } from 'firebase/firestore';
import BatchDetailsDialog from '../../components/inventory/BatchDetailsDialog';

// TabPanel component
function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`expiry-tabpanel-${index}`}
      aria-labelledby={`expiry-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

const ExpiryDatesPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showError } = useNotification();
  const [expiringBatches, setExpiringBatches] = useState([]);
  const [expiredBatches, setExpiredBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tabValue, setTabValue] = useState(0);
  const [daysThreshold, setDaysThreshold] = useState(365);
  const [searchTerm, setSearchTerm] = useState('');
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);

  // Użyj debounce dla daysThreshold, aby uniknąć częstych wywołań API
  const debouncedDaysThreshold = useDebounce(
    typeof daysThreshold === 'number' && daysThreshold > 0 ? daysThreshold : 365, 
    800
  );

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Pobierz partie z krótkim terminem ważności
        const expiringData = await getExpiringBatches(debouncedDaysThreshold);
        setExpiringBatches(expiringData);
        
        // Pobierz przeterminowane partie
        const expiredData = await getExpiredBatches();
        setExpiredBatches(expiredData);
      } catch (error) {
        showError(t('expiryDates.errors.fetchData', { message: error.message }));
        console.error('Error fetching expiry data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedDaysThreshold]);

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const handleDaysThresholdChange = (e) => {
    const value = e.target.value;
    
    if (value === '') {
      setDaysThreshold('');
      return;
    }
    
    const numValue = parseInt(value);
    if (!isNaN(numValue) && numValue > 0) {
      setDaysThreshold(numValue);
    }
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const clearSearch = () => {
    setSearchTerm('');
  };

  const handleOpenDetailsDialog = (batch) => {
    setSelectedBatch(batch);
    setDetailsDialogOpen(true);
  };

  const handleCloseDetailsDialog = () => {
    setDetailsDialogOpen(false);
    setSelectedBatch(null);
  };

  // Filtrowanie partii według wyszukiwanego terminu
  const filterBatches = (batches) => {
    if (!searchTerm) return batches;
    
    const term = searchTerm.toLowerCase();
    return batches.filter(batch => 
      batch.itemName.toLowerCase().includes(term) || 
      (batch.batchNumber && batch.batchNumber.toLowerCase().includes(term)) ||
      (batch.notes && batch.notes.toLowerCase().includes(term)) ||
      (batch.warehouseName && batch.warehouseName.toLowerCase().includes(term)) ||
      (batch.supplierName && batch.supplierName.toLowerCase().includes(term))
    );
  };

  const filteredExpiringBatches = filterBatches(expiringBatches);
  const filteredExpiredBatches = filterBatches(expiredBatches);

  // Oblicz liczbę dni do wygaśnięcia
  const calculateDaysToExpiry = (expiryDate) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const expiry = new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);
    
    const diffTime = expiry - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
  };

  // Nowa funkcja do określania statusu z 4 poziomami kolorów
  const getExpiryStatusInfo = (daysToExpiry) => {
    if (daysToExpiry < 0) {
      return {
        label: t('expiryDates.status.expired'),
        color: 'error',
        bgColor: 'rgba(211, 47, 47, 0.15)',
        chipColor: 'error'
      };
    } else if (daysToExpiry < 7) {
      return {
        label: t('expiryDates.status.critical'),
        color: 'error',
        bgColor: 'rgba(211, 47, 47, 0.12)',
        chipColor: 'error'
      };
    } else if (daysToExpiry <= 7) {
      return {
        label: t('expiryDates.status.urgent'),
        color: 'warning',
        bgColor: 'rgba(237, 108, 2, 0.15)',
        chipColor: 'warning'
      };
    } else if (daysToExpiry <= 30) {
      return {
        label: t('expiryDates.status.warning'),
        color: 'warning',
        bgColor: 'rgba(255, 193, 7, 0.15)',
        chipColor: 'warning'
      };
    } else if (daysToExpiry > 365) {
      return {
        label: t('expiryDates.status.safe'),
        color: 'success',
        bgColor: 'rgba(46, 125, 50, 0.08)',
        chipColor: 'success'
      };
    } else {
      return {
        label: t('expiryDates.status.monitor'),
        color: 'info',
        bgColor: 'transparent',
        chipColor: 'info'
      };
    }
  };

  // Funkcja renderowania statusu
  const renderExpiryStatus = (batch) => {
    if (!batch.expiryDate) {
      return <Chip label={t('expiryDates.status.noDate')} color="default" size="small" />;
    }
    
    const expiryDate = batch.expiryDate instanceof Timestamp 
      ? batch.expiryDate.toDate() 
      : new Date(batch.expiryDate);
    
    const isDefaultOrInvalidDate = expiryDate.getFullYear() <= 1970;
    
    if (isDefaultOrInvalidDate) {
      return <Chip label={t('expiryDates.status.noDate')} color="default" size="small" />;
    }
    
    const daysToExpiry = calculateDaysToExpiry(expiryDate);
    const statusInfo = getExpiryStatusInfo(daysToExpiry);
    
    return (
      <Chip 
        label={statusInfo.label} 
        color={statusInfo.chipColor} 
        size="small"
        sx={{ fontWeight: 'bold' }}
      />
    );
  };

  // Renderowanie wiersza z kolorowym tłem
  const renderBatchRow = (batch) => {
    if (!batch.expiryDate) {
      return null;
    }
    
    const expiryDate = batch.expiryDate instanceof Timestamp 
      ? batch.expiryDate.toDate() 
      : new Date(batch.expiryDate);
    
    const daysToExpiry = calculateDaysToExpiry(expiryDate);
    const statusInfo = getExpiryStatusInfo(daysToExpiry);
    
    return (
      <TableRow 
        key={batch.id}
        sx={{
          backgroundColor: statusInfo.bgColor,
          '&:hover': {
            backgroundColor: theme => 
              theme.palette.mode === 'dark' 
                ? 'rgba(255, 255, 255, 0.08)' 
                : 'rgba(0, 0, 0, 0.04)'
          }
        }}
      >
        <TableCell>
          <strong>{batch.batchNumber || t('expiryDates.table.noData')}</strong>
        </TableCell>
        <TableCell>
          <Link 
            to={`/inventory/${batch.itemId}`} 
            style={{ 
              textDecoration: 'none',
              fontWeight: 500,
              color: 'inherit'
            }}
          >
            {batch.itemName}
          </Link>
        </TableCell>
        <TableCell>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography variant="body2">
              {batch.quantity} {batch.unit || t('expiryDates.table.unit')}
            </Typography>
          </Box>
        </TableCell>
        <TableCell>
          {expiryDate.toLocaleDateString('pl-PL')}
        </TableCell>
        <TableCell>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography 
              variant="body2" 
              sx={{ 
                fontWeight: 'bold',
                color: daysToExpiry < 0 ? 'error.main' : 
                       daysToExpiry < 7 ? 'error.main' : 
                       daysToExpiry <= 365 ? 'warning.main' : 'inherit'
              }}
            >
              {daysToExpiry < 0 
                ? t('expiryDates.table.daysAgo', { days: Math.abs(daysToExpiry) })
                : t('expiryDates.table.days', { days: daysToExpiry })
              }
            </Typography>
          </Box>
        </TableCell>
        <TableCell>
          {batch.warehouseName || '-'}
        </TableCell>
        <TableCell>
          {batch.supplierName || '-'}
        </TableCell>
        <TableCell>
          {renderExpiryStatus(batch)}
        </TableCell>
        <TableCell>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button 
              variant="outlined" 
              size="small"
              startIcon={<InfoIcon />}
              onClick={() => handleOpenDetailsDialog(batch)}
            >
              Szczegóły
            </Button>
            <Button 
              variant="outlined" 
              size="small" 
              component={Link}
              to={`/inventory/${batch.itemId}/batches`}
            >
              {t('expiryDates.table.actions.manage')}
            </Button>
          </Box>
        </TableCell>
      </TableRow>
    );
  };

  if (loading) {
    return (
      <Container maxWidth="xl" sx={{ mt: 4, mb: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button 
          startIcon={<ArrowBackIcon />} 
          onClick={() => navigate('/inventory')}
        >
          {t('expiryDates.backToInventory')}
        </Button>
        <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
          {t('expiryDates.pageTitle')}
        </Typography>
        <Box />
      </Box>

      {/* Legenda kolorów */}
      <Paper sx={{ mb: 3, p: 2, backgroundColor: 'background.default' }}>
        <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', mb: 1 }}>
          {t('expiryDates.legend.title')}
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <Chip label={t('expiryDates.legend.expired')} color="error" size="small" />
          <Chip label={t('expiryDates.legend.urgent')} color="warning" size="small" sx={{ bgcolor: '#ed6c02' }} />
          <Chip label={t('expiryDates.legend.warning')} color="warning" size="small" />
          <Chip label={t('expiryDates.legend.safe')} color="success" size="small" />
        </Box>
      </Paper>

      {expiredBatches.length > 0 && (
        <Alert severity="error" sx={{ mb: 3 }} icon={<ErrorIcon />}>
          <AlertTitle><strong>{t('expiryDates.expiredProducts.alertTitle')}</strong></AlertTitle>
          {t('expiryDates.expiredProducts.alertMessage', { count: expiredBatches.length })}
        </Alert>
      )}

      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <TextField
            label={t('expiryDates.thresholdSettings.label')}
            type="number"
            value={daysThreshold}
            onChange={handleDaysThresholdChange}
            sx={{ width: 150, mr: 2 }}
            InputProps={{
              inputProps: { min: 1 }
            }}
          />
          <Typography variant="body2" color="text.secondary">
            {t('expiryDates.thresholdSettings.description', { days: daysThreshold || '...' })}
          </Typography>
        </Box>
        
        <TextField
          label={t('expiryDates.search.label')}
          placeholder={t('expiryDates.search.placeholder')}
          value={searchTerm}
          onChange={handleSearchChange}
          sx={{ width: 400 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
            endAdornment: searchTerm && (
              <InputAdornment position="end">
                <IconButton onClick={clearSearch} edge="end" title={t('expiryDates.search.clear')}>
                  <ClearIcon />
                </IconButton>
              </InputAdornment>
            )
          }}
        />
      </Box>

      <Paper sx={{ mb: 3 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={handleTabChange} aria-label="expiry tabs">
            <Tab 
              label={
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <WarningIcon sx={{ mr: 1, color: 'warning.main' }} />
                  <span>{t('expiryDates.tabs.expiring', { count: filteredExpiringBatches.length })}</span>
                </Box>
              } 
              id="expiry-tab-0" 
            />
            <Tab 
              label={
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <ErrorIcon sx={{ mr: 1, color: 'error.main' }} />
                  <span>{t('expiryDates.tabs.expired', { count: filteredExpiredBatches.length })}</span>
                </Box>
              } 
              id="expiry-tab-1" 
            />
          </Tabs>
        </Box>

        <TabPanel value={tabValue} index={0}>
          {filteredExpiringBatches.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="h6" color="text.secondary">
                {searchTerm 
                  ? t('expiryDates.noResults.expiring.withSearch')
                  : t('expiryDates.noResults.expiring.withoutSearch')
                }
              </Typography>
            </Box>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: 'action.hover' }}>
                    <TableCell sx={{ fontWeight: 'bold' }}>{t('expiryDates.table.headers.batchNumber')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>{t('expiryDates.table.headers.product')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>{t('expiryDates.table.headers.quantity')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>{t('expiryDates.table.headers.expiryDate')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>{t('expiryDates.table.headers.daysToExpiry')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>{t('expiryDates.table.headers.location')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>{t('expiryDates.table.headers.supplier')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>{t('expiryDates.table.headers.status')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>{t('expiryDates.table.headers.actions')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredExpiringBatches.map(batch => renderBatchRow(batch))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          {filteredExpiredBatches.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="h6" color="text.secondary">
                {searchTerm 
                  ? t('expiryDates.noResults.expired.withSearch')
                  : t('expiryDates.noResults.expired.withoutSearch')
                }
              </Typography>
            </Box>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ backgroundColor: 'action.hover' }}>
                    <TableCell sx={{ fontWeight: 'bold' }}>{t('expiryDates.table.headers.batchNumber')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>{t('expiryDates.table.headers.product')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>{t('expiryDates.table.headers.quantity')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>{t('expiryDates.table.headers.expiryDate')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>{t('expiryDates.table.headers.daysExpired')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>{t('expiryDates.table.headers.location')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>{t('expiryDates.table.headers.supplier')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>{t('expiryDates.table.headers.status')}</TableCell>
                    <TableCell sx={{ fontWeight: 'bold' }}>{t('expiryDates.table.headers.actions')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredExpiredBatches.map(batch => renderBatchRow(batch))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </TabPanel>
      </Paper>

      {/* Dialog szczegółów partii */}
      <BatchDetailsDialog
        open={detailsDialogOpen}
        onClose={handleCloseDetailsDialog}
        batch={selectedBatch}
      />
    </Container>
  );
};

export default ExpiryDatesPage;
