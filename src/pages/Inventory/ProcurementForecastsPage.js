import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Chip,
  IconButton,
  TextField,
  InputAdornment,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
  Collapse,
  ToggleButton,
  ToggleButtonGroup,
  Divider,
  Stack
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Archive as ArchiveIcon,
  Unarchive as UnarchiveIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Search as SearchIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Info as InfoIcon,
  LocalShipping as ShippingIcon,
  Edit as EditIcon,
    Save as SaveIcon,
    Close as CloseIcon,
    Refresh as RefreshIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import {
  getAllProcurementForecasts,
  deleteProcurementForecast,
  archiveProcurementForecast,
  updateProcurementForecast,
  subscribeToProcurementForecasts
} from '../../services/procurementForecastService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import { formatCurrency } from '../../utils/formatUtils';

const ProcurementForecastsPage = ({ embedded = false }) => {
  const { t } = useTranslation('inventory');
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();

  const [forecasts, setForecasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [forecastToDelete, setForecastToDelete] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showShortageOnly, setShowShortageOnly] = useState(false);
  const [editingNotesId, setEditingNotesId] = useState(null);
  const [editNotesValue, setEditNotesValue] = useState('');

  const fetchForecasts = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getAllProcurementForecasts();
      setForecasts(data);
    } catch (error) {
      showError('Błąd podczas pobierania prognoz');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  // Real-time listener — automatycznie reaguje na zmiany z Cloud Function (PO trigger)
  useEffect(() => {
    const unsubscribe = subscribeToProcurementForecasts((data) => {
      setForecasts(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredForecasts = forecasts.filter(f => {
    if (statusFilter === 'active' && f.status !== 'active') return false;
    if (statusFilter === 'archived' && f.status !== 'archived') return false;
    return true;
  });

  const handleDelete = async () => {
    if (!forecastToDelete) return;
    try {
      await deleteProcurementForecast(forecastToDelete.id);
      showSuccess(t('states.procurementForecasts.deleteSuccess'));
      setDeleteDialogOpen(false);
      setForecastToDelete(null);
      if (expandedId === forecastToDelete.id) setExpandedId(null);
      fetchForecasts();
    } catch (error) {
      showError('Błąd podczas usuwania prognozy');
    }
  };

  const handleArchive = async (forecast) => {
    try {
      if (forecast.status === 'archived') {
        await updateProcurementForecast(forecast.id, { status: 'active' }, currentUser?.uid);
        showSuccess(t('states.procurementForecasts.unarchiveSuccess'));
      } else {
        await archiveProcurementForecast(forecast.id, currentUser?.uid);
        showSuccess(t('states.procurementForecasts.archiveSuccess'));
      }
      fetchForecasts();
    } catch (error) {
      showError('Błąd podczas zmiany statusu');
    }
  };

  const handleToggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
    setEditingNotesId(null);
  };

  const handleSaveNotes = async (forecastId, materialIndex, notes) => {
    try {
      const forecast = forecasts.find(f => f.id === forecastId);
      if (!forecast) return;

      const updatedMaterials = [...forecast.materials];
      updatedMaterials[materialIndex] = {
        ...updatedMaterials[materialIndex],
        notes
      };

      await updateProcurementForecast(forecastId, { materials: updatedMaterials }, currentUser?.uid);
      showSuccess(t('states.procurementForecasts.details.notesUpdated'));
      setEditingNotesId(null);
      fetchForecasts();
    } catch (error) {
      showError('Błąd podczas zapisywania notatek');
    }
  };

  const formatDateDisplay = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return format(date, 'dd.MM.yyyy', { locale: pl });
    } catch {
      return '-';
    }
  };

  const formatDateTimeDisplay = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return format(date, 'dd.MM.yyyy HH:mm', { locale: pl });
    } catch {
      return '-';
    }
  };

  const getBalanceColor = (balance) => {
    if (balance < 0) return 'error.main';
    if (balance === 0) return 'warning.main';
    return 'success.main';
  };

  const getBalanceChip = (balance) => {
    if (balance < 0) return <Chip size="small" color="error" icon={<WarningIcon />} label={balance.toFixed(2)} />;
    if (balance === 0) return <Chip size="small" color="warning" label="0" />;
    return <Chip size="small" color="success" icon={<CheckCircleIcon />} label={`+${balance.toFixed(2)}`} />;
  };

  const getStatusChip = (status) => {
    if (status === 'archived') {
      return <Chip size="small" label={t('states.procurementForecasts.archived')} color="default" />;
    }
    return <Chip size="small" label={t('states.procurementForecasts.active')} color="primary" />;
  };

  const getPoStatusChip = (status) => {
    const statusColors = {
      draft: 'default',
      pending: 'warning',
      approved: 'info',
      ordered: 'primary',
      partial: 'warning',
      shipped: 'info',
      delivered: 'success',
      completed: 'success',
      cancelled: 'error'
    };
    return <Chip size="small" label={status} color={statusColors[status] || 'default'} variant="outlined" />;
  };

  const renderMaterialsTable = (forecast) => {
    let materials = forecast.materials || [];

    if (searchTerm) {
      materials = materials.filter(m =>
        m.materialName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.supplierName?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (showShortageOnly) {
      materials = materials.filter(m => m.balanceWithFutureDeliveries < 0);
    }

    materials.sort((a, b) => a.balanceWithFutureDeliveries - b.balanceWithFutureDeliveries);

    return (
      <Box sx={{ mt: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
          <TextField
            size="small"
            placeholder={t('states.procurementForecasts.details.search')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              )
            }}
            sx={{ minWidth: 250 }}
          />
          <Button
            size="small"
            variant={showShortageOnly ? 'contained' : 'outlined'}
            color="error"
            startIcon={<WarningIcon />}
            onClick={() => setShowShortageOnly(!showShortageOnly)}
          >
            {showShortageOnly
              ? t('states.procurementForecasts.details.showAll')
              : t('states.procurementForecasts.details.showShortageOnly')}
          </Button>
          <Typography variant="body2" color="text.secondary">
            {materials.length} {t('states.procurementForecasts.materialsCount').toLowerCase()}
          </Typography>
        </Stack>

        <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 500 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', minWidth: 200 }}>
                  {t('states.procurementForecasts.details.material')}
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>
                  {t('states.procurementForecasts.details.category')}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                  {t('states.procurementForecasts.details.required')}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                  {t('states.procurementForecasts.details.available')}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                  {t('states.procurementForecasts.details.balance')}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                  {t('states.procurementForecasts.details.futureDeliveries')}
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold' }}>
                  {t('states.procurementForecasts.details.balanceWithDeliveries')}
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold', minWidth: 140 }}>
                  {t('states.procurementForecasts.details.notes')}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {materials.map((material, index) => {
                const materialIdx = forecast.materials.findIndex(m => m.materialId === material.materialId);
                const isEditing = editingNotesId === `${forecast.id}-${materialIdx}`;

                return (
                  <React.Fragment key={material.materialId}>
                    <TableRow
                      hover
                      sx={{
                        backgroundColor: material.balanceWithFutureDeliveries < 0
                          ? 'error.50'
                          : 'inherit',
                        '&:hover': {
                          backgroundColor: material.balanceWithFutureDeliveries < 0
                            ? 'error.100'
                            : undefined
                        }
                      }}
                    >
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>
                          {material.materialName}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={material.category} variant="outlined" />
                      </TableCell>
                      <TableCell align="right">
                        {material.requiredQuantity.toLocaleString('pl-PL', { maximumFractionDigits: 2 })} {material.unit}
                      </TableCell>
                      <TableCell align="right">
                        {material.availableQuantity.toLocaleString('pl-PL', { maximumFractionDigits: 2 })} {material.unit}
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                          color={getBalanceColor(material.balance)}
                          fontWeight={material.balance < 0 ? 600 : 400}
                        >
                          {material.balance.toLocaleString('pl-PL', { maximumFractionDigits: 2 })} {material.unit}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        {material.futureDeliveries && material.futureDeliveries.length > 0 ? (
                          <Tooltip
                            title={
                              <Box>
                                {material.futureDeliveries.map((d, i) => (
                                  <Box key={i} sx={{ mb: 0.5 }}>
                                    <Typography variant="caption" display="block">
                                      {d.poNumber} - {d.quantity} {material.unit}
                                    </Typography>
                                    <Typography variant="caption" color="grey.400">
                                      {d.supplierName} | {formatDateDisplay(d.expectedDeliveryDate)} | {d.status}
                                    </Typography>
                                  </Box>
                                ))}
                              </Box>
                            }
                            arrow
                          >
                            <Chip
                              size="small"
                              icon={<ShippingIcon />}
                              label={`${material.futureDeliveriesTotal.toLocaleString('pl-PL', { maximumFractionDigits: 2 })} ${material.unit}`}
                              color="info"
                              variant="outlined"
                            />
                          </Tooltip>
                        ) : (
                          <Typography variant="body2" color="text.disabled">
                            {t('states.procurementForecasts.details.noDeliveries')}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        {getBalanceChip(material.balanceWithFutureDeliveries)}
                      </TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <TextField
                              size="small"
                              value={editNotesValue}
                              onChange={(e) => setEditNotesValue(e.target.value)}
                              multiline
                              maxRows={3}
                              sx={{ minWidth: 120 }}
                            />
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={() => handleSaveNotes(forecast.id, materialIdx, editNotesValue)}
                            >
                              <SaveIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              onClick={() => setEditingNotesId(null)}
                            >
                              <CloseIcon fontSize="small" />
                            </IconButton>
                          </Box>
                        ) : (
                          <Box
                            sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
                            onClick={() => {
                              setEditingNotesId(`${forecast.id}-${materialIdx}`);
                              setEditNotesValue(material.notes || '');
                            }}
                          >
                            <Typography variant="body2" color={material.notes ? 'text.primary' : 'text.disabled'} noWrap sx={{ maxWidth: 120 }}>
                              {material.notes || t('states.procurementForecasts.details.editNotes')}
                            </Typography>
                            <EditIcon sx={{ fontSize: 14, ml: 0.5, color: 'text.disabled' }} />
                          </Box>
                        )}
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    );
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  const content = (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" component="h2" gutterBottom>
            {t('states.procurementForecasts.title')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t('states.procurementForecasts.description')}
          </Typography>
        </Box>
        <Tooltip title={t('states.procurementForecasts.refresh', 'Odśwież dane')}>
          <IconButton onClick={fetchForecasts} color="primary">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ mb: 2 }}>
        <ToggleButtonGroup
          value={statusFilter}
          exclusive
          onChange={(e, val) => val && setStatusFilter(val)}
          size="small"
        >
          <ToggleButton value="all">
            {t('states.procurementForecasts.filterAll')} ({forecasts.length})
          </ToggleButton>
          <ToggleButton value="active">
            {t('states.procurementForecasts.filterActive')} ({forecasts.filter(f => f.status === 'active').length})
          </ToggleButton>
          <ToggleButton value="archived">
            {t('states.procurementForecasts.filterArchived')} ({forecasts.filter(f => f.status === 'archived').length})
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {filteredForecasts.length === 0 ? (
        <Alert severity="info" icon={<InfoIcon />}>
          <Typography variant="body1">{t('states.procurementForecasts.noForecasts')}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {t('states.procurementForecasts.noForecastsHint')}
          </Typography>
        </Alert>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell width={40} />
                <TableCell sx={{ fontWeight: 'bold' }}>
                  {t('states.procurementForecasts.number')}
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>
                  {t('states.procurementForecasts.name')}
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>
                  {t('states.procurementForecasts.period')}
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold' }}>
                  {t('states.procurementForecasts.materialsCount')} / {t('states.procurementForecasts.shortageCount')}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                  {t('states.procurementForecasts.shortageValue')}
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>
                  {t('states.procurementForecasts.createdAt')}
                </TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>
                  {t('states.procurementForecasts.status')}
                </TableCell>
                <TableCell align="center" sx={{ fontWeight: 'bold' }}>
                  {t('states.procurementForecasts.actions')}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredForecasts.map((forecast) => (
                <React.Fragment key={forecast.id}>
                  <TableRow
                    hover
                    sx={{ cursor: 'pointer', '& > *': { borderBottom: expandedId === forecast.id ? 'none' : undefined } }}
                    onClick={() => handleToggleExpand(forecast.id)}
                  >
                    <TableCell>
                      <IconButton size="small">
                        {expandedId === forecast.id ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </IconButton>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={500}>
                        {forecast.number}
                      </Typography>
                    </TableCell>
                    <TableCell>{forecast.name}</TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {formatDateDisplay(forecast.forecastPeriod?.startDate)} - {formatDateDisplay(forecast.forecastPeriod?.endDate)}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                        <Typography variant="body2">{forecast.totalMaterials}</Typography>
                        <Typography variant="body2" color="text.disabled">/</Typography>
                        {forecast.materialsWithShortage > 0 ? (
                          <Chip
                            size="small"
                            color="error"
                            icon={<WarningIcon />}
                            label={forecast.materialsWithShortage}
                          />
                        ) : (
                          <Chip size="small" color="success" icon={<CheckCircleIcon />} label="0" />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      <Typography
                        variant="body2"
                        color={forecast.totalShortageValue > 0 ? 'error.main' : 'text.primary'}
                        fontWeight={forecast.totalShortageValue > 0 ? 600 : 400}
                      >
                        {formatCurrency(forecast.totalShortageValue)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {formatDateTimeDisplay(forecast.createdAt)}
                      </Typography>
                      {forecast.createdByName && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          {forecast.createdByName}
                        </Typography>
                      )}
                      {forecast.lastAutoUpdateReason && (
                        <Tooltip title={forecast.lastAutoUpdateReason}>
                          <Typography variant="caption" color="info.main" sx={{ fontSize: '0.65rem', cursor: 'help' }}>
                            {t('states.procurementForecasts.autoUpdated', 'Auto-aktualizacja')}: {formatDateTimeDisplay(forecast.updatedAt)}
                          </Typography>
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell>{getStatusChip(forecast.status)}</TableCell>
                    <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                      <Tooltip title={forecast.status === 'archived'
                        ? t('states.procurementForecasts.unarchive')
                        : t('states.procurementForecasts.archive')}
                      >
                        <IconButton
                          size="small"
                          onClick={() => handleArchive(forecast)}
                        >
                          {forecast.status === 'archived' ? <UnarchiveIcon /> : <ArchiveIcon />}
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t('states.procurementForecasts.delete')}>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => {
                            setForecastToDelete(forecast);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={8} sx={{ py: 0, px: 2 }}>
                      <Collapse in={expandedId === forecast.id} timeout="auto" unmountOnExit>
                        <Box sx={{ py: 2 }}>
                          <Divider sx={{ mb: 2 }} />
                          <Stack direction="row" spacing={4} sx={{ mb: 2 }}>
                            <Box>
                              <Typography variant="caption" color="text.secondary">
                                {t('states.procurementForecasts.details.forecastPeriod')}
                              </Typography>
                              <Typography variant="body2">
                                {formatDateDisplay(forecast.forecastPeriod?.startDate)} - {formatDateDisplay(forecast.forecastPeriod?.endDate)}
                              </Typography>
                            </Box>
                            <Box>
                              <Typography variant="caption" color="text.secondary">
                                {t('states.procurementForecasts.details.totalMaterials')}
                              </Typography>
                              <Typography variant="body2">{forecast.totalMaterials}</Typography>
                            </Box>
                            <Box>
                              <Typography variant="caption" color="text.secondary">
                                {t('states.procurementForecasts.details.materialsWithShortage')}
                              </Typography>
                              <Typography variant="body2" color="error.main" fontWeight={600}>
                                {forecast.materialsWithShortage}
                              </Typography>
                            </Box>
                            <Box>
                              <Typography variant="caption" color="text.secondary">
                                {t('states.procurementForecasts.details.totalShortageValue')}
                              </Typography>
                              <Typography variant="body2" color="error.main" fontWeight={600}>
                                {formatCurrency(forecast.totalShortageValue)}
                              </Typography>
                            </Box>
                          </Stack>
                          {forecast.notes && (
                            <Alert severity="info" sx={{ mb: 2 }}>
                              {forecast.notes}
                            </Alert>
                          )}
                          {renderMaterialsTable(forecast)}
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>{t('states.procurementForecasts.delete')}</DialogTitle>
        <DialogContent>
          <Typography>
            {t('states.procurementForecasts.confirmDelete')}
          </Typography>
          {forecastToDelete && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {forecastToDelete.number} - {forecastToDelete.name}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>
            Anuluj
          </Button>
          <Button onClick={handleDelete} color="error" variant="contained">
            {t('states.procurementForecasts.delete')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );

  if (embedded) {
    return <Box sx={{ mt: 1 }}>{content}</Box>;
  }

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      {content}
    </Container>
  );
};

export default ProcurementForecastsPage;
