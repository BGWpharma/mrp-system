/**
 * Komponent zakładki "Produkcja i Plan" w szczegółach zadania produkcyjnego
 * Redesign: karty KPI, zwijalna sekcja historii z ikoną/badge, spójny styl z BasicDataTab
 */

import React, { memo, useState, useMemo } from 'react';
import {
  Grid,
  Paper,
  Typography,
  Box,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  TableContainer,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TextField,
  IconButton,
  Tooltip,
  Card,
  CardContent,
  Avatar,
  LinearProgress,
  Collapse,
  useTheme,
  useMediaQuery
} from '@mui/material';
import EnhancedMixingPlan from './EnhancedMixingPlan';
import {
  Add as AddIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Info as InfoIcon,
  History as HistoryIcon,
  TrendingUp as ProgressIcon,
  Schedule as TimeIcon,
  PlaylistAddCheck as SessionsIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon
} from '@mui/icons-material';
import { formatDateTime } from '../../utils/formatting';
import { useTranslation } from '../../hooks/useTranslation';

const getProgressColor = (percent) => {
  if (percent >= 80) return 'success';
  if (percent >= 40) return 'warning';
  return 'error';
};

const formatMinutesToHM = (totalMinutes) => {
  if (!totalMinutes) return '0 min';
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  return `${h}h ${m}min`;
};

const ProductionPlanTab = ({
  task,
  setTask,
  productionHistory,
  enrichedProductionHistory,
  selectedMachineId,
  setSelectedMachineId,
  availableMachines,
  editingHistoryItem,
  editedHistoryItem,
  setEditedHistoryItem,
  warehouses,
  getUserName,
  onAddHistoryItem,
  onEditHistoryItem,
  onSaveHistoryItemEdit,
  onCancelHistoryItemEdit,
  onDeleteHistoryItem,
  toLocalDateTimeString,
  fromLocalDateTimeString,
  onChecklistItemUpdate,
  fetchAllTaskData,
  ingredientReservationLinks
}) => {
  const { t } = useTranslation('taskDetails');
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isVerySmall = useMediaQuery(theme.breakpoints.down('sm'));

  const [historyExpanded, setHistoryExpanded] = useState(true);

  const formatQuantityPrecision = (value, precision = 3) => {
    if (value === null || value === undefined || value === '') return '';
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    if (num % 1 === 0) return num.toString();
    return num.toFixed(precision).replace(/\.?0+$/, '');
  };

  const kpiData = useMemo(() => {
    const sessionCount = enrichedProductionHistory.length;
    const totalQty = enrichedProductionHistory.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);
    const totalTime = enrichedProductionHistory.reduce((sum, item) => sum + (item.timeSpent || 0), 0);
    const plannedQty = task.quantity || 1;
    const progressPercent = Math.min((totalQty / plannedQty) * 100, 100);
    const avgTime = sessionCount > 0 ? Math.round(totalTime / sessionCount) : 0;

    let lastSessionDate = null;
    if (sessionCount > 0) {
      const lastItem = enrichedProductionHistory[enrichedProductionHistory.length - 1];
      lastSessionDate = lastItem?.startTime;
    }

    return { sessionCount, totalQty, totalTime, plannedQty, progressPercent, avgTime, lastSessionDate };
  }, [enrichedProductionHistory, task.quantity]);

  const handleAddHistoryClick = () => {
    const newEditedHistoryItem = {
      quantity: '',
      startTime: new Date(),
      endTime: new Date(),
    };

    let expiryDate = null;
    if (task.expiryDate) {
      try {
        if (task.expiryDate instanceof Date) {
          expiryDate = task.expiryDate;
        } else if (task.expiryDate.toDate && typeof task.expiryDate.toDate === 'function') {
          expiryDate = task.expiryDate.toDate();
        } else if (task.expiryDate.seconds) {
          expiryDate = new Date(task.expiryDate.seconds * 1000);
        } else if (typeof task.expiryDate === 'string') {
          expiryDate = new Date(task.expiryDate);
        }
      } catch (error) {
        console.error('Błąd konwersji daty ważności:', error);
        expiryDate = new Date(new Date().setFullYear(new Date().getFullYear() + 1));
      }
    } else {
      expiryDate = new Date(new Date().setFullYear(new Date().getFullYear() + 1));
    }

    setEditedHistoryItem(newEditedHistoryItem);

    const historyInventoryData = {
      expiryDate: expiryDate,
      lotNumber: task.lotNumber || `SN/${task.moNumber || ''}`,
      finalQuantity: '',
      warehouseId: task.warehouseId || (warehouses.length > 0 ? warehouses[0].id : '')
    };

    onAddHistoryItem(newEditedHistoryItem, historyInventoryData);
  };

  const progressColor = getProgressColor(kpiData.progressPercent);

  const sectionHeaderSx = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'pointer',
    py: 0.5,
    px: 1,
    borderRadius: 1,
    bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
    '&:hover': {
      bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'
    }
  };

  return (
    <Grid container spacing={2.5}>

      {/* ============ KPI SUMMARY CARDS ============ */}

      {/* Card 1: Sessions */}
      <Grid item xs={12} sm={6} md={4}>
        <Paper
          variant="outlined"
          sx={{ p: 2, height: '100%', display: 'flex', alignItems: 'flex-start', gap: 2, borderRadius: 2 }}
        >
          <Avatar sx={{ bgcolor: 'primary.main', width: 44, height: 44 }}>
            <SessionsIcon />
          </Avatar>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {t('productionPlanKpi.sessions')}
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              {kpiData.sessionCount}
            </Typography>
            {kpiData.lastSessionDate ? (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                {t('productionPlanKpi.lastSession')}: {formatDateTime(kpiData.lastSessionDate)}
              </Typography>
            ) : (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                {t('productionPlanKpi.noSessions')}
              </Typography>
            )}
          </Box>
        </Paper>
      </Grid>

      {/* Card 2: Produced + progress */}
      <Grid item xs={12} sm={6} md={4}>
        <Paper
          variant="outlined"
          sx={{ p: 2, height: '100%', display: 'flex', alignItems: 'flex-start', gap: 2, borderRadius: 2 }}
        >
          <Avatar sx={{ bgcolor: `${progressColor}.main`, width: 44, height: 44 }}>
            <ProgressIcon />
          </Avatar>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {t('productionPlanKpi.totalProduced')}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 0.25 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                {kpiData.progressPercent.toFixed(1)}%
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {formatQuantityPrecision(kpiData.totalQty)} / {task.quantity} {task.unit}
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={kpiData.progressPercent}
              color={progressColor}
              sx={{
                height: 8,
                borderRadius: 4,
                mt: 1,
                bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'
              }}
            />
          </Box>
        </Paper>
      </Grid>

      {/* Card 3: Time */}
      <Grid item xs={12} sm={12} md={4}>
        <Paper
          variant="outlined"
          sx={{ p: 2, height: '100%', display: 'flex', alignItems: 'flex-start', gap: 2, borderRadius: 2 }}
        >
          <Avatar sx={{ bgcolor: 'info.main', width: 44, height: 44 }}>
            <TimeIcon />
          </Avatar>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {t('productionPlanKpi.totalTime')}
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              {formatMinutesToHM(kpiData.totalTime)}
            </Typography>
            {kpiData.sessionCount > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
                {t('productionPlanKpi.avgPerSession')}: {formatMinutesToHM(kpiData.avgTime)}
              </Typography>
            )}
          </Box>
        </Paper>
      </Grid>

      {/* ============ PRODUCTION HISTORY SECTION ============ */}
      <Grid item xs={12}>
        <Paper sx={{ p: isMobile ? 2 : 2.5, borderRadius: 2 }}>
          {/* Section header with icon, badge, collapse */}
          <Box
            sx={sectionHeaderSx}
            onClick={() => setHistoryExpanded(!historyExpanded)}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <HistoryIcon color="primary" fontSize="small" />
              <Typography variant="h6" sx={{ fontSize: '1.1rem' }}>
                {t('productionHistory.title')}
              </Typography>
              {productionHistory.length > 0 && (
                <Chip
                  label={productionHistory.length}
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{ height: 22, fontSize: '0.75rem' }}
                />
              )}
            </Box>
            <IconButton size="small">
              {historyExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>

          <Collapse in={historyExpanded}>
            {/* Controls: machine selector + add button */}
            <Box sx={{
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              justifyContent: 'space-between',
              alignItems: isMobile ? 'stretch' : 'center',
              mt: 2,
              mb: 2,
              gap: 2
            }}>
              <Box sx={{
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                alignItems: isMobile ? 'stretch' : 'center',
                gap: 2
              }}>
                <FormControl
                  size={isMobile ? "medium" : "small"}
                  fullWidth={isMobile}
                  sx={{ minWidth: isMobile ? '100%' : 200 }}
                >
                  <InputLabel>{t('productionHistory.machineSelector')}</InputLabel>
                  <Select
                    value={selectedMachineId}
                    label={t('productionHistory.machineSelector')}
                    onChange={(e) => setSelectedMachineId(e.target.value)}
                  >
                    <MenuItem value="">
                      <em>{t('productionHistory.noMachine')}</em>
                    </MenuItem>
                    {availableMachines.map((machine) => (
                      <MenuItem key={machine.id} value={machine.id}>
                        {machine.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                {selectedMachineId && !isVerySmall && (
                  <Chip
                    size="small"
                    label={`${availableMachines.find(m => m.id === selectedMachineId)?.name || ''}`}
                    color="info"
                    variant="outlined"
                  />
                )}
              </Box>

              <Button
                variant="contained"
                color="primary"
                startIcon={!isMobile && <AddIcon />}
                onClick={handleAddHistoryClick}
                size={isMobile ? "large" : "small"}
                fullWidth={isMobile}
                sx={{ minHeight: isMobile ? 48 : 'auto' }}
              >
                {t('productionHistory.addRecord')}
              </Button>
            </Box>

            {productionHistory.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {t('productionHistory.noHistory')}
              </Typography>
            ) : isMobile ? (
              /* Mobile view - Cards */
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {enrichedProductionHistory.map((item) => (
                  <Card key={item.id} variant="outlined">
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="subtitle2" color="primary">
                          {item.startTime ? formatDateTime(item.startTime) : '-'}
                        </Typography>
                        <Chip
                          size="small"
                          label={`${formatQuantityPrecision(item.quantity)} ${task.unit}`}
                          color="success"
                        />
                      </Box>

                      <Typography variant="body2" color="text.secondary">
                        {t('productionHistory.table.duration')}: {item.timeSpent ? `${item.timeSpent} min` : '-'}
                      </Typography>

                      <Typography variant="body2" color="text.secondary">
                        {t('productionHistory.table.operator')}: {getUserName(item.userId)}
                      </Typography>

                      {item.endTime && (
                        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                          {t('productionHistory.table.endTime')}: {formatDateTime(item.endTime)}
                        </Typography>
                      )}

                      {selectedMachineId && item.machineData && (
                        <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                          <Chip size="small" label={`OK: ${item.machineData.okProduced}`} color="success" variant="outlined" />
                          <Chip size="small" label={`NOK: ${item.machineData.nokProduced}`} color="error" variant="outlined" />
                          <Chip size="small" label={`\u03A3: ${item.machineData.totalProduced}`} color="primary" variant="outlined" />
                        </Box>
                      )}

                      <Box sx={{ mt: 2, display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                        <IconButton
                          color="primary"
                          onClick={() => onEditHistoryItem(item)}
                          size="large"
                          sx={{ minWidth: 48, minHeight: 48 }}
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          color="error"
                          onClick={() => onDeleteHistoryItem(item)}
                          size="large"
                          sx={{ minWidth: 48, minHeight: 48 }}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Box>
                    </CardContent>
                  </Card>
                ))}
              </Box>
            ) : (
              /* Desktop view - Table (without summary row) */
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('productionHistory.table.startTime')}</TableCell>
                      <TableCell>{t('productionHistory.table.endTime')}</TableCell>
                      <TableCell>{t('productionHistory.table.duration')}</TableCell>
                      <TableCell>{t('productionHistory.table.quantity')}</TableCell>
                      {selectedMachineId && (
                        <>
                          <TableCell>{t('productionHistory.table.machine')} OK</TableCell>
                          <TableCell>{t('productionHistory.table.machine')} NOK</TableCell>
                          <TableCell>{t('productionHistory.table.machine')} &Sigma;</TableCell>
                        </>
                      )}
                      <TableCell>{t('productionHistory.table.operator')}</TableCell>
                      <TableCell>{t('productionHistory.table.actions')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {enrichedProductionHistory.map((item) => (
                      <TableRow key={item.id}>
                        {editingHistoryItem === item.id ? (
                          <>
                            <TableCell>
                              <TextField
                                type="datetime-local"
                                value={editedHistoryItem.startTime instanceof Date ? toLocalDateTimeString(editedHistoryItem.startTime) : ''}
                                onChange={(e) => {
                                  const newDate = e.target.value ? fromLocalDateTimeString(e.target.value) : new Date();
                                  setEditedHistoryItem(prev => ({ ...prev, startTime: newDate }));
                                }}
                                InputLabelProps={{ shrink: true }}
                                fullWidth
                                required
                              />
                            </TableCell>
                            <TableCell>
                              <TextField
                                type="datetime-local"
                                value={editedHistoryItem.endTime instanceof Date ? toLocalDateTimeString(editedHistoryItem.endTime) : ''}
                                onChange={(e) => {
                                  const newDate = e.target.value ? fromLocalDateTimeString(e.target.value) : new Date();
                                  setEditedHistoryItem(prev => ({ ...prev, endTime: newDate }));
                                }}
                                InputLabelProps={{ shrink: true }}
                                fullWidth
                                required
                              />
                            </TableCell>
                            <TableCell>
                              {Math.round((editedHistoryItem.endTime.getTime() - editedHistoryItem.startTime.getTime()) / (1000 * 60))} min
                            </TableCell>
                            <TableCell>
                              <TextField
                                type="number"
                                value={editedHistoryItem.quantity}
                                onChange={(e) => setEditedHistoryItem(prev => ({
                                  ...prev,
                                  quantity: e.target.value === '' ? '' : parseFloat(e.target.value)
                                }))}
                                inputProps={{ min: 0, step: 'any' }}
                                size="small"
                                fullWidth
                              />
                            </TableCell>
                            {selectedMachineId && (
                              <>
                                <TableCell>-</TableCell>
                                <TableCell>-</TableCell>
                                <TableCell>-</TableCell>
                              </>
                            )}
                            <TableCell>{getUserName(item.userId)}</TableCell>
                            <TableCell>
                              <Box sx={{ display: 'flex' }}>
                                <IconButton
                                  color="primary"
                                  onClick={() => onSaveHistoryItemEdit(item.id)}
                                  title="Zapisz zmiany"
                                >
                                  <SaveIcon />
                                </IconButton>
                                <IconButton
                                  color="error"
                                  onClick={onCancelHistoryItemEdit}
                                  title="Anuluj edycję"
                                >
                                  <CancelIcon />
                                </IconButton>
                              </Box>
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell>{item.startTime ? formatDateTime(item.startTime) : '-'}</TableCell>
                            <TableCell>{item.endTime ? formatDateTime(item.endTime) : '-'}</TableCell>
                            <TableCell>{item.timeSpent ? `${item.timeSpent} min` : '-'}</TableCell>
                            <TableCell>{item.quantity} {task.unit}</TableCell>
                            {selectedMachineId && (
                              <>
                                <TableCell>
                                  {item.machineData ? (
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                      <Chip size="small" label={item.machineData.okProduced} color="success" variant="outlined" />
                                      {item.machineData.okProduced > 0 && (
                                        <Tooltip title={`${item.machineData.productionPeriods?.map(p => p.formattedPeriod).join(', ') || '-'}`}>
                                          <InfoIcon fontSize="small" color="info" sx={{ cursor: 'help' }} />
                                        </Tooltip>
                                      )}
                                    </Box>
                                  ) : '-'}
                                </TableCell>
                                <TableCell>
                                  {item.machineData ? (
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                      <Chip size="small" label={item.machineData.nokProduced} color="error" variant="outlined" />
                                      {item.machineData.nokProduced > 0 && (
                                        <Tooltip title={`${item.machineData.productionPeriods?.map(p => p.formattedPeriod).join(', ') || '-'}`}>
                                          <InfoIcon fontSize="small" color="warning" sx={{ cursor: 'help' }} />
                                        </Tooltip>
                                      )}
                                    </Box>
                                  ) : '-'}
                                </TableCell>
                                <TableCell>
                                  {item.machineData ? (
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                      <Chip size="small" label={item.machineData.totalProduced} color="primary" variant="outlined" />
                                      {item.machineData.totalProduced > 0 && (
                                        <Tooltip title={`${item.machineData.machineId} | ${item.machineData.productionPeriods?.map(p => `${p.formattedPeriod} (${p.production.okCount}/${p.production.nokCount})`).join(', ') || '-'}`}>
                                          <InfoIcon fontSize="small" color="info" sx={{ cursor: 'help' }} />
                                        </Tooltip>
                                      )}
                                    </Box>
                                  ) : '-'}
                                </TableCell>
                              </>
                            )}
                            <TableCell>{getUserName(item.userId)}</TableCell>
                            <TableCell>
                              <IconButton
                                color="primary"
                                onClick={() => onEditHistoryItem(item)}
                                title="Edytuj sesję produkcyjną"
                              >
                                <EditIcon />
                              </IconButton>
                              <IconButton
                                color="error"
                                onClick={() => onDeleteHistoryItem(item)}
                                title="Usuń sesję produkcyjną"
                              >
                                <DeleteIcon />
                              </IconButton>
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Collapse>
        </Paper>
      </Grid>

      {/* ============ MIXING PLAN SECTION ============ */}
      {task?.mixingPlanChecklist && task.mixingPlanChecklist.length > 0 && (
        <Grid item xs={12}>
          <EnhancedMixingPlan
            task={task}
            isMobile={isMobile}
            isVerySmall={isVerySmall}
            onChecklistItemUpdate={onChecklistItemUpdate}
            externalIngredientLinks={ingredientReservationLinks}
            onPlanUpdate={async () => {
              if (fetchAllTaskData) {
                await fetchAllTaskData();
              }
            }}
          />
        </Grid>
      )}
    </Grid>
  );
};

export default memo(ProductionPlanTab);
