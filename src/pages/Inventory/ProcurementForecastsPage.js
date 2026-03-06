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
  TableSortLabel,
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
  Stack,
  FormControl,
  InputLabel,
  Select,
  MenuItem
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
  Refresh as RefreshIcon,
  Assignment as MoIcon,
  FilterList as FilterListIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import {
  getAllProcurementForecasts,
  deleteProcurementForecast,
  archiveProcurementForecast,
  updateProcurementForecast,
  subscribeToProcurementForecasts
} from '../../services/purchaseOrders';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import { formatCurrency } from '../../utils/formatting';

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
  const [materialSortField, setMaterialSortField] = useState('balanceWithFutureDeliveries');
  const [materialSortDirection, setMaterialSortDirection] = useState('asc');
  const [materialCategoryFilter, setMaterialCategoryFilter] = useState('');
  const [expandedMaterialId, setExpandedMaterialId] = useState(null);

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

  const poStatusLabels = {
    draft: t('states.procurementForecasts.details.poStatusDraft', 'Szkic'),
    pending: t('states.procurementForecasts.details.poStatusPending', 'Oczekujące'),
    approved: t('states.procurementForecasts.details.poStatusApproved', 'Zatwierdzone'),
    ordered: t('states.procurementForecasts.details.poStatusOrdered', 'Zamówione'),
    partial: t('states.procurementForecasts.details.poStatusPartial', 'Częściowo przyjęte'),
    shipped: t('states.procurementForecasts.details.poStatusShipped', 'Wysłane'),
    delivered: t('states.procurementForecasts.details.poStatusDelivered', 'Dostarczone'),
    completed: t('states.procurementForecasts.details.poStatusCompleted', 'Zakończone'),
    cancelled: t('states.procurementForecasts.details.poStatusCancelled', 'Anulowane')
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
    return <Chip size="small" label={poStatusLabels[status] || status} color={statusColors[status] || 'default'} variant="outlined" />;
  };

  const handleMaterialSort = (field) => {
    if (field === materialSortField) {
      setMaterialSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setMaterialSortField(field);
      setMaterialSortDirection('asc');
    }
  };

  const getMaterialCategories = (forecast) => {
    const cats = new Set();
    (forecast.materials || []).forEach(m => { if (m.category) cats.add(m.category); });
    return Array.from(cats).sort();
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

    if (materialCategoryFilter) {
      materials = materials.filter(m => m.category === materialCategoryFilter);
    }

    if (showShortageOnly) {
      materials = materials.filter(m => m.balanceWithFutureDeliveries < 0);
    }

    materials.sort((a, b) => {
      let comparison = 0;
      switch (materialSortField) {
        case 'materialName':
          comparison = (a.materialName || '').localeCompare(b.materialName || '');
          break;
        case 'category':
          comparison = (a.category || '').localeCompare(b.category || '');
          break;
        case 'requiredQuantity':
          comparison = (a.requiredQuantity || 0) - (b.requiredQuantity || 0);
          break;
        case 'availableQuantity':
          comparison = (a.availableQuantity || 0) - (b.availableQuantity || 0);
          break;
        case 'balance':
          comparison = (a.balance || 0) - (b.balance || 0);
          break;
        case 'futureDeliveriesTotal':
          comparison = (a.futureDeliveriesTotal || 0) - (b.futureDeliveriesTotal || 0);
          break;
        case 'balanceWithFutureDeliveries':
        default:
          comparison = (a.balanceWithFutureDeliveries || 0) - (b.balanceWithFutureDeliveries || 0);
          break;
      }
      return materialSortDirection === 'asc' ? comparison : -comparison;
    });

    const sortableHeader = (field, label, align = 'left') => (
      <TableCell align={align} sx={{ fontWeight: 'bold', ...(field === 'materialName' ? { minWidth: 200 } : {}) }}>
        <TableSortLabel
          active={materialSortField === field}
          direction={materialSortField === field ? materialSortDirection : 'asc'}
          onClick={() => handleMaterialSort(field)}
        >
          {label}
        </TableSortLabel>
      </TableCell>
    );

    const categories = getMaterialCategories(forecast);

    return (
      <Box sx={{ mt: 2 }}>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
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
          {categories.length > 1 && (
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>{t('states.procurementForecasts.details.category')}</InputLabel>
              <Select
                value={materialCategoryFilter}
                onChange={(e) => setMaterialCategoryFilter(e.target.value)}
                label={t('states.procurementForecasts.details.category')}
              >
                <MenuItem value="">{t('states.procurementForecasts.filterAll')}</MenuItem>
                {categories.map(cat => (
                  <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
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

        {forecast.appliedFilter?.categoryFilter && (
          <Alert severity="info" icon={<FilterListIcon />} sx={{ mb: 2, py: 0 }}>
            <Typography variant="body2">
              {t('states.procurementForecasts.details.appliedFilter', 'Zastosowany filtr przy zapisie')}: <strong>{forecast.appliedFilter.categoryFilter}</strong>
            </Typography>
          </Alert>
        )}

        <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 500 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold', width: 40 }} />
                {sortableHeader('materialName', t('states.procurementForecasts.details.material'))}
                {sortableHeader('category', t('states.procurementForecasts.details.category'))}
                <TableCell align="center" sx={{ fontWeight: 'bold', width: 70 }}>
                  <Tooltip title={t('states.procurementForecasts.details.relatedMO', 'Powiązane MO')}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                      <MoIcon sx={{ fontSize: 16 }} /> MO
                    </Box>
                  </Tooltip>
                </TableCell>
                {sortableHeader('requiredQuantity', t('states.procurementForecasts.details.required'), 'right')}
                {sortableHeader('availableQuantity', t('states.procurementForecasts.details.available'), 'right')}
                {sortableHeader('balance', t('states.procurementForecasts.details.balance'), 'right')}
                {sortableHeader('futureDeliveriesTotal', t('states.procurementForecasts.details.futureDeliveries'), 'right')}
                {sortableHeader('balanceWithFutureDeliveries', t('states.procurementForecasts.details.balanceWithDeliveries'), 'center')}
                <TableCell sx={{ fontWeight: 'bold', minWidth: 140 }}>
                  {t('states.procurementForecasts.details.notes')}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {materials.map((material, index) => {
                const materialIdx = forecast.materials.findIndex(m => m.materialId === material.materialId);
                const isEditing = editingNotesId === `${forecast.id}-${materialIdx}`;
                const isMaterialExpanded = expandedMaterialId === `${forecast.id}-${material.materialId}`;
                const hasMO = material.relatedTasks?.length > 0 || material.relatedTaskIds?.length > 0;
                const hasPO = material.futureDeliveries?.length > 0;
                const hasExpandableContent = hasMO || hasPO;

                return (
                  <React.Fragment key={material.materialId}>
                    <TableRow
                      hover
                      sx={{
                        cursor: hasExpandableContent ? 'pointer' : 'default',
                        backgroundColor: material.balanceWithFutureDeliveries < 0
                          ? 'error.50'
                          : 'inherit',
                        '&:hover': {
                          backgroundColor: material.balanceWithFutureDeliveries < 0
                            ? 'error.100'
                            : undefined
                        },
                        '& > *': { borderBottom: isMaterialExpanded ? 'none' : undefined }
                      }}
                      onClick={() => hasExpandableContent && setExpandedMaterialId(isMaterialExpanded ? null : `${forecast.id}-${material.materialId}`)}
                    >
                      <TableCell sx={{ width: 40 }}>
                        {hasExpandableContent && (
                          <IconButton size="small">
                            {isMaterialExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                          </IconButton>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>
                          {material.materialName}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={material.category} variant="outlined" />
                      </TableCell>
                      <TableCell align="center">
                        {hasMO ? (
                          <Tooltip title={
                            (material.relatedTasks || []).map(t => t.number || t.name).filter(Boolean).join(', ') ||
                            `${material.relatedTaskIds?.length || 0} MO`
                          }>
                            <Chip
                              size="small"
                              icon={<MoIcon />}
                              label={material.relatedTasks?.length || material.relatedTaskIds?.length || 0}
                              color="primary"
                              variant="outlined"
                              sx={{ cursor: 'pointer' }}
                            />
                          </Tooltip>
                        ) : (
                          <Typography variant="body2" color="text.disabled">-</Typography>
                        )}
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
                        {hasPO ? (
                          <Chip
                            size="small"
                            icon={<ShippingIcon />}
                            label={`${material.futureDeliveriesTotal.toLocaleString('pl-PL', { maximumFractionDigits: 2 })} ${material.unit}`}
                            color="info"
                            variant="outlined"
                          />
                        ) : (
                          <Typography variant="body2" color="text.disabled">
                            {t('states.procurementForecasts.details.noDeliveries')}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="center">
                        {getBalanceChip(material.balanceWithFutureDeliveries)}
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
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
                    {hasExpandableContent && (
                      <TableRow>
                        <TableCell colSpan={10} sx={{ py: 0, px: 0, borderBottom: isMaterialExpanded ? undefined : 'none' }}>
                          <Collapse in={isMaterialExpanded} timeout="auto" unmountOnExit>
                            <Box sx={{ px: 3, py: 2, bgcolor: 'action.hover' }}>
                              <Stack direction="row" spacing={3} sx={{ flexWrap: 'wrap', gap: 2 }}>
                                {hasMO && (
                                  <Paper variant="outlined" sx={{ flex: 1, minWidth: 260, p: 1.5 }}>
                                    <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                      <MoIcon sx={{ fontSize: 16 }} />
                                      {t('states.procurementForecasts.details.relatedMO', 'Powiązane MO')} ({material.relatedTasks?.length || material.relatedTaskIds?.length || 0})
                                    </Typography>
                                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                      {(material.relatedTasks || []).map((task, i) => (
                                        <Chip
                                          key={task.id || i}
                                          size="small"
                                          icon={<MoIcon />}
                                          label={task.number || task.name || task.id?.slice(0, 8)}
                                          color="primary"
                                          variant="outlined"
                                          clickable
                                          onClick={(e) => { e.stopPropagation(); navigate(`/production/tasks/${task.id}`); }}
                                          {...(task.name ? { title: task.name } : {})}
                                        />
                                      ))}
                                      {(!material.relatedTasks || material.relatedTasks.length === 0) && material.relatedTaskIds?.map((taskId, idx) => (
                                        <Tooltip key={taskId} title={taskId}>
                                          <Chip
                                            size="small"
                                            icon={<MoIcon />}
                                            label={`MO #${idx + 1}`}
                                            variant="outlined"
                                            clickable
                                            onClick={(e) => { e.stopPropagation(); navigate(`/production/tasks/${taskId}`); }}
                                          />
                                        </Tooltip>
                                      ))}
                                    </Box>
                                  </Paper>
                                )}
                                {hasPO && (
                                  <Paper variant="outlined" sx={{ flex: 2, minWidth: 380, p: 0, overflow: 'hidden' }}>
                                    <Typography variant="subtitle2" sx={{ px: 1.5, pt: 1.5, pb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                      <ShippingIcon sx={{ fontSize: 16 }} />
                                      {t('states.procurementForecasts.details.futureDeliveries')} ({material.futureDeliveries.length})
                                    </Typography>
                                    <Table size="small">
                                      <TableHead>
                                        <TableRow>
                                          <TableCell sx={{ fontWeight: 'bold', py: 0.5, fontSize: '0.75rem' }}>{t('states.procurementForecasts.details.poNumber', 'Nr PO')}</TableCell>
                                          <TableCell sx={{ fontWeight: 'bold', py: 0.5, fontSize: '0.75rem' }}>{t('states.procurementForecasts.details.supplier', 'Dostawca')}</TableCell>
                                          <TableCell align="right" sx={{ fontWeight: 'bold', py: 0.5, fontSize: '0.75rem' }}>{t('states.procurementForecasts.details.poQuantity', 'Ilość')}</TableCell>
                                          <TableCell align="center" sx={{ fontWeight: 'bold', py: 0.5, fontSize: '0.75rem' }}>{t('states.procurementForecasts.details.poReceived', 'Przyjęto')}</TableCell>
                                          <TableCell sx={{ fontWeight: 'bold', py: 0.5, fontSize: '0.75rem' }}>{t('states.procurementForecasts.details.poDeliveryDate', 'Data dostawy')}</TableCell>
                                          <TableCell sx={{ fontWeight: 'bold', py: 0.5, fontSize: '0.75rem' }}>{t('states.procurementForecasts.details.poStatus', 'Status')}</TableCell>
                                        </TableRow>
                                      </TableHead>
                                      <TableBody>
                                        {material.futureDeliveries.map((d, i) => (
                                          <TableRow key={d.poId || i} hover>
                                            <TableCell sx={{ py: 0.5 }}>
                                              <Typography
                                                variant="body2"
                                                color="primary"
                                                sx={{ cursor: 'pointer', fontWeight: 500, '&:hover': { textDecoration: 'underline' } }}
                                                onClick={(e) => { e.stopPropagation(); navigate(`/purchase-orders/${d.poId}`); }}
                                              >
                                                {d.poNumber || '-'}
                                              </Typography>
                                            </TableCell>
                                            <TableCell sx={{ py: 0.5 }}>
                                              <Typography variant="body2" noWrap sx={{ maxWidth: 160 }}>{d.supplierName || '-'}</Typography>
                                            </TableCell>
                                            <TableCell align="right" sx={{ py: 0.5 }}>
                                              <Typography variant="body2" fontWeight={500}>{d.quantity?.toLocaleString('pl-PL', { maximumFractionDigits: 2 })} {material.unit}</Typography>
                                            </TableCell>
                                            <TableCell align="center" sx={{ py: 0.5 }}>
                                              {d.originalQuantity != null ? (
                                                <Chip
                                                  size="small"
                                                  variant="outlined"
                                                  color={
                                                    d.receivedQuantity >= d.originalQuantity ? 'success' :
                                                    d.receivedQuantity > 0 ? 'warning' : 'default'
                                                  }
                                                  label={`${(d.receivedQuantity || 0).toLocaleString('pl-PL', { maximumFractionDigits: 2 })} ${t('states.procurementForecasts.details.poReceivedOf', 'z')} ${d.originalQuantity.toLocaleString('pl-PL', { maximumFractionDigits: 2 })}`}
                                                />
                                              ) : (
                                                <Typography variant="body2" color="text.disabled">-</Typography>
                                              )}
                                            </TableCell>
                                            <TableCell sx={{ py: 0.5 }}>
                                              <Typography variant="body2">{formatDateDisplay(d.expectedDeliveryDate)}</Typography>
                                            </TableCell>
                                            <TableCell sx={{ py: 0.5 }}>
                                              {getPoStatusChip(d.status)}
                                            </TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </Paper>
                                )}
                              </Stack>
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    )}
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
                    <TableCell colSpan={9} sx={{ py: 0, px: 2 }}>
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
