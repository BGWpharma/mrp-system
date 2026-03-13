/**
 * Komponent zakładki "Dane podstawowe" w szczegółach zadania produkcyjnego
 * Redesign: hero header, karty KPI, progress bar, sekcja czasu i planowania
 */

import React, { memo, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Typography,
  Paper,
  Grid,
  Chip,
  Box,
  Tooltip,
  Avatar,
  LinearProgress,
  Divider,
  Collapse,
  IconButton,
  useMediaQuery,
  useTheme
} from '@mui/material';
import {
  Inventory as InventoryIcon,
  Category as ProductIcon,
  TrendingUp as ProgressIcon,
  Schedule as TimeIcon,
  MenuBook as RecipeIcon,
  Business as BusinessIcon,
  Euro as EuroIcon,
  BatchPrediction as BatchIcon,
  EventNote as DateIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Description as DescriptionIcon
} from '@mui/icons-material';

import { useTranslation } from '../../hooks/useTranslation';
import { formatDateTime } from '../../utils/formatting';
import { getWorkstationById } from '../../services/production/workstationService';
import { useNotification } from '../../hooks/useNotification';
import TaskDetails from './TaskDetails';
import TaskStatusChip from './shared/TaskStatusChip';
import MaterialReservationBadge from './shared/MaterialReservationBadge';

const getProgressColor = (percent) => {
  if (percent >= 80) return 'success';
  if (percent >= 40) return 'warning';
  return 'error';
};

const BasicDataTab = ({
  task,
  getStatusColor,
  getStatusActions,
  onTabChange,
  onStatusChange
}) => {
  const { t } = useTranslation('taskDetails');
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { showError } = useNotification();

  const [workstation, setWorkstation] = useState(null);
  const [expandedProductInfo, setExpandedProductInfo] = useState(true);
  const [expandedTimePlanning, setExpandedTimePlanning] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchWorkstation = async () => {
      if (task?.workstationId) {
        try {
          const data = await getWorkstationById(task.workstationId);
          if (!cancelled) setWorkstation(data);
        } catch (error) {
          if (!cancelled) {
            console.error('Błąd podczas pobierania stanowiska:', error);
            showError('Nie udało się pobrać informacji o stanowisku produkcyjnym');
          }
        }
      }
    };
    fetchWorkstation();
    return () => { cancelled = true; };
  }, [task?.workstationId, showError]);

  const handleNavigateToMaterials = () => {
    if (onTabChange) onTabChange(1);
  };

  const completedQty = task.totalCompletedQuantity || 0;
  const plannedQty = task.quantity || 1;
  const progressPercent = Math.min((completedQty / plannedQty) * 100, 100);
  const progressColor = getProgressColor(progressPercent);

  const hasRecipe = (task.recipe && task.recipe.recipeName) || (task.recipeId && task.recipeName);
  const hasProductBatchInfo = Boolean(task?.lotNumber || task?.expiryDate);
  const hasTimeData = Boolean(task?.scheduledDate || task?.estimatedDuration > 0 || task?.productionTimePerUnit > 0);

  const statusBorderColor = getStatusColor ? getStatusColor(task.status) : theme.palette.primary.main;

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

      {/* ============ HERO HEADER ============ */}
      <Grid item xs={12}>
        <Paper
          sx={{
            p: 3,
            borderLeft: `4px solid ${statusBorderColor}`,
            borderRadius: 2
          }}
        >
          {/* Row 1: Name + actions */}
          <Box sx={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            justifyContent: 'space-between',
            alignItems: isMobile ? 'flex-start' : 'center',
            mb: 1.5
          }}>
            <Typography
              variant="h5"
              component="h1"
              sx={{ fontWeight: 600, mb: isMobile ? 1 : 0 }}
            >
              {task.name}
            </Typography>
            <Box sx={{ width: isMobile ? '100%' : 'auto', flexShrink: 0 }}>
              {getStatusActions()}
            </Box>
          </Box>

          {/* Row 2: Chips */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
            <Chip
              label={task.moNumber || 'MO'}
              color="primary"
              size="small"
              sx={{ fontWeight: 600 }}
            />
            <TaskStatusChip
              task={task}
              getStatusColor={getStatusColor}
              onStatusChange={onStatusChange}
              editable={true}
            />
            <MaterialReservationBadge
              task={task}
              onClick={handleNavigateToMaterials}
              clickable={!!onTabChange}
            />
            {hasProductBatchInfo && task.lotNumber && (
              <Chip
                icon={<BatchIcon sx={{ fontSize: 16 }} />}
                label={`LOT: ${task.lotNumber}`}
                size="small"
                variant="outlined"
                color="info"
              />
            )}
          </Box>
        </Paper>
      </Grid>

      {/* ============ KPI CARDS ============ */}

      {/* Card 1: Product */}
      <Grid item xs={12} sm={6} md={4}>
        <Paper
          variant="outlined"
          sx={{
            p: 2,
            height: '100%',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 2,
            borderRadius: 2
          }}
        >
          <Avatar sx={{ bgcolor: 'primary.main', width: 44, height: 44 }}>
            <ProductIcon />
          </Avatar>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {t('kpi.productCard')}
            </Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.3 }} noWrap>
              {task.productName}
            </Typography>
            {hasRecipe && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                <Link
                  to={`/recipes/${task.recipe?.recipeId || task.recipeId}`}
                  style={{ color: 'inherit', textDecoration: 'none' }}
                >
                  {task.recipe?.recipeName || task.recipeName}
                  {task.recipeVersion && ` (v${task.recipeVersion})`}
                </Link>
              </Typography>
            )}
          </Box>
        </Paper>
      </Grid>

      {/* Card 2: Progress */}
      <Grid item xs={12} sm={6} md={4}>
        <Paper
          variant="outlined"
          sx={{
            p: 2,
            height: '100%',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 2,
            borderRadius: 2
          }}
        >
          <Avatar sx={{ bgcolor: `${progressColor}.main`, width: 44, height: 44 }}>
            <ProgressIcon />
          </Avatar>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {t('kpi.progressCard')}
            </Typography>

            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 0.25 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                {progressPercent.toFixed(1)}%
              </Typography>
              {task.originalQuantity && task.originalQuantity !== task.quantity ? (
                <Tooltip
                  title={
                    <Box>
                      <Typography variant="caption" sx={{ display: 'block' }}>
                        {t('kpi.planned')}: {task.originalQuantity} → {task.quantity} {task.unit}
                      </Typography>
                    </Box>
                  }
                  arrow
                >
                  <Typography variant="body2" color="text.secondary" sx={{ cursor: 'help' }}>
                    <span style={{ textDecoration: 'line-through', marginRight: 4 }}>{task.originalQuantity}</span>
                    {task.quantity} {task.unit}
                  </Typography>
                </Tooltip>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  {t('kpi.ofPlanned')} {task.quantity} {task.unit}
                </Typography>
              )}
            </Box>

            <LinearProgress
              variant="determinate"
              value={progressPercent}
              color={progressColor}
              sx={{
                height: 8,
                borderRadius: 4,
                mt: 1,
                bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'
              }}
            />

            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              {t('kpi.completed')}: {completedQty} / {task.quantity} {task.unit}
            </Typography>
          </Box>
        </Paper>
      </Grid>

      {/* Card 3: Time */}
      <Grid item xs={12} sm={12} md={4}>
        <Paper
          variant="outlined"
          sx={{
            p: 2,
            height: '100%',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 2,
            borderRadius: 2
          }}
        >
          <Avatar sx={{ bgcolor: 'info.main', width: 44, height: 44 }}>
            <TimeIcon />
          </Avatar>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {t('kpi.timeCard')}
            </Typography>
            {hasTimeData ? (
              <>
                {task.estimatedDuration > 0 && (
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                    {(task.estimatedDuration / 60).toFixed(1)} {t('productionTimeInfo.hours')} {t('kpi.totalTime')}
                  </Typography>
                )}
                {task.productionTimePerUnit > 0 && (
                  <Typography variant="body2" color="text.secondary">
                    {parseFloat(task.productionTimePerUnit).toFixed(2)} {t('productionTimeInfo.minutesPerUnit')} {t('kpi.timePerUnit')}
                  </Typography>
                )}
                {task.scheduledDate && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    {t('kpi.scheduledStart')}: {formatDateTime(task.scheduledDate)}
                  </Typography>
                )}
              </>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {t('kpi.noTimeData')}
              </Typography>
            )}
          </Box>
        </Paper>
      </Grid>

      {/* ============ PRODUCT INFO SECTION ============ */}
      <Grid item xs={12}>
        <Paper sx={{ p: 2.5, borderRadius: 2 }}>
          <Box sx={sectionHeaderSx} onClick={() => setExpandedProductInfo(!expandedProductInfo)}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <DescriptionIcon color="primary" fontSize="small" />
              <Typography variant="h6" sx={{ fontSize: '1.1rem' }}>
                {t('productInfo.title')}
              </Typography>
            </Box>
            <IconButton size="small">
              {expandedProductInfo ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Box>

          <Collapse in={expandedProductInfo}>
            <Grid container spacing={2} sx={{ mt: 0.5 }}>
              {/* Product name */}
              <Grid item xs={12} md={6}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {t('product')}
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 500, mt: 0.25 }}>
                  {task.productName}
                </Typography>
              </Grid>

              {/* Recipe */}
              {hasRecipe && (
                <Grid item xs={12} md={6}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {t('recipe')}
                  </Typography>
                  <Box sx={{ mt: 0.5 }}>
                    <Chip
                      icon={<RecipeIcon sx={{ fontSize: 16 }} />}
                      label={
                        <>
                          {task.recipe?.recipeName || task.recipeName}
                          {task.recipeVersion && ` (v${task.recipeVersion})`}
                        </>
                      }
                      component={Link}
                      to={`/recipes/${task.recipe?.recipeId || task.recipeId}`}
                      clickable
                      size="small"
                      variant="outlined"
                      color="primary"
                    />
                  </Box>
                </Grid>
              )}

              {/* Inventory item */}
              {task.inventoryProductId && (
                <Grid item xs={12} md={6}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {t('inventoryItem')}
                  </Typography>
                  <Box sx={{ mt: 0.5 }}>
                    <Chip
                      label={task.productName}
                      color="primary"
                      variant="outlined"
                      clickable
                      onClick={() => navigate(`/inventory/${task.inventoryProductId}`)}
                      icon={<InventoryIcon />}
                      size="small"
                    />
                  </Box>
                </Grid>
              )}

              {/* Quantity with change indicator */}
              <Grid item xs={12} md={6}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {t('quantity')}
                </Typography>
                {task.originalQuantity && task.originalQuantity !== task.quantity ? (
                  <Tooltip
                    title={
                      <Box>
                        <Typography variant="caption" sx={{ display: 'block' }}>
                          {t('kpi.planned')}: {task.originalQuantity} {task.unit}
                        </Typography>
                        <Typography variant="caption" sx={{ display: 'block' }}>
                          {t('quantity')}: {task.quantity} {task.unit}
                        </Typography>
                        <Typography
                          variant="caption"
                          sx={{
                            display: 'block',
                            color: (task.quantity - task.originalQuantity) >= 0 ? 'success.light' : 'error.light'
                          }}
                        >
                          {(task.quantity - task.originalQuantity) > 0 ? '+' : ''}
                          {(task.quantity - task.originalQuantity).toFixed(3)} {task.unit}
                        </Typography>
                      </Box>
                    }
                    arrow
                  >
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, cursor: 'help', mt: 0.25 }}>
                      <Typography variant="body1" sx={{ textDecoration: 'line-through', color: 'text.secondary', fontSize: '0.9em' }}>
                        {task.originalQuantity}
                      </Typography>
                      <Typography variant="body1" sx={{ fontWeight: 600 }}>
                        {task.quantity} {task.unit}
                      </Typography>
                    </Box>
                  </Tooltip>
                ) : (
                  <Typography variant="body1" sx={{ fontWeight: 500, mt: 0.25 }}>
                    {task.quantity} {task.unit}
                  </Typography>
                )}
              </Grid>

              {/* LOT & Expiry */}
              {hasProductBatchInfo && (
                <>
                  {task.lotNumber && (
                    <Grid item xs={12} sm={6} md={3}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {t('endProductBatch.lotNumber')}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                        <BatchIcon color="info" sx={{ fontSize: 18 }} />
                        <Typography variant="body1" sx={{ fontWeight: 500 }}>
                          {task.lotNumber}
                        </Typography>
                      </Box>
                    </Grid>
                  )}
                  {task.expiryDate && (
                    <Grid item xs={12} sm={6} md={3}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {t('endProductBatch.expiryDate')}
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                        <DateIcon color="warning" sx={{ fontSize: 18 }} />
                        <Typography variant="body1" sx={{ fontWeight: 500 }}>
                          {task.expiryDate instanceof Date
                            ? task.expiryDate.toLocaleDateString('pl-PL')
                            : typeof task.expiryDate === 'string'
                              ? new Date(task.expiryDate).toLocaleDateString('pl-PL')
                              : task.expiryDate && task.expiryDate.toDate
                                ? task.expiryDate.toDate().toLocaleDateString('pl-PL')
                                : t('productionTimeInfo.notSpecified')}
                        </Typography>
                      </Box>
                    </Grid>
                  )}
                </>
              )}

              {/* Description */}
              <Grid item xs={12}>
                <Divider sx={{ mb: 1.5 }} />
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {t('description')}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    mt: 0.5,
                    color: task.description ? 'text.primary' : 'text.secondary',
                    fontStyle: task.description ? 'normal' : 'italic'
                  }}
                >
                  {task.description || t('noDescription')}
                </Typography>
              </Grid>
            </Grid>
          </Collapse>
        </Paper>
      </Grid>

      {/* ============ TIME & PLANNING SECTION ============ */}
      {hasTimeData && (
        <Grid item xs={12}>
          <Paper sx={{ p: 2.5, borderRadius: 2 }}>
            <Box sx={sectionHeaderSx} onClick={() => setExpandedTimePlanning(!expandedTimePlanning)}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TimeIcon color="primary" fontSize="small" />
                <Typography variant="h6" sx={{ fontSize: '1.1rem' }}>
                  {t('timePlanning.title')}
                </Typography>
              </Box>
              <IconButton size="small">
                {expandedTimePlanning ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            </Box>

            <Collapse in={expandedTimePlanning}>
              <Grid container spacing={2} sx={{ mt: 0.5 }}>
                {/* Scheduled start */}
                {task.scheduledDate && (
                  <Grid item xs={12} sm={6} md={3}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <TimeIcon color="primary" sx={{ fontSize: 18 }} />
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {t('productionTimeInfo.scheduledStart')}
                      </Typography>
                    </Box>
                    <Typography variant="body1" sx={{ fontWeight: 500, pl: 3.5 }}>
                      {formatDateTime(task.scheduledDate)}
                    </Typography>
                  </Grid>
                )}

                {/* Planned end */}
                {task.endDate && (
                  <Grid item xs={12} sm={6} md={3}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <TimeIcon color="primary" sx={{ fontSize: 18 }} />
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {t('productionTimeInfo.plannedEnd')}
                      </Typography>
                    </Box>
                    <Typography variant="body1" sx={{ fontWeight: 500, pl: 3.5 }}>
                      {formatDateTime(task.endDate)}
                    </Typography>
                  </Grid>
                )}

                {/* Time per unit */}
                {task.productionTimePerUnit > 0 && (
                  <Grid item xs={12} sm={6} md={3}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <TimeIcon color="primary" sx={{ fontSize: 18 }} />
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {t('productionTimeInfo.timePerUnit')}
                      </Typography>
                    </Box>
                    <Typography variant="body1" sx={{ fontWeight: 500, pl: 3.5 }}>
                      {parseFloat(task.productionTimePerUnit).toFixed(2)} {t('productionTimeInfo.minutesPerUnit')}
                    </Typography>
                  </Grid>
                )}

                {/* Total planned time */}
                {task.estimatedDuration > 0 && (
                  <Grid item xs={12} sm={6} md={3}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <TimeIcon color="primary" sx={{ fontSize: 18 }} />
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {t('productionTimeInfo.totalPlannedTime')}
                      </Typography>
                    </Box>
                    <Typography variant="body1" sx={{ fontWeight: 500, pl: 3.5 }}>
                      {(task.estimatedDuration / 60).toFixed(2)} {t('productionTimeInfo.hours')}
                    </Typography>
                  </Grid>
                )}

                {/* Processing cost */}
                {task.processingCostPerUnit > 0 && (
                  <Grid item xs={12} sm={6} md={3}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <EuroIcon color="primary" sx={{ fontSize: 18 }} />
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {t('productionTimeInfo.processingCostPerUnit')}
                      </Typography>
                    </Box>
                    <Typography variant="body1" sx={{ fontWeight: 500, pl: 3.5 }}>
                      {parseFloat(task.processingCostPerUnit).toFixed(2)} EUR
                      {task.quantity && (
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                          ({t('productionTimeInfo.totalProcessingCost')}: {(parseFloat(task.processingCostPerUnit) * parseFloat(task.quantity)).toFixed(2)} EUR)
                        </Typography>
                      )}
                    </Typography>
                  </Grid>
                )}

                {/* Workstation */}
                {workstation && (
                  <Grid item xs={12} sm={6} md={3}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <BusinessIcon color="primary" sx={{ fontSize: 18 }} />
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {t('productionTimeInfo.workstation')}
                      </Typography>
                    </Box>
                    <Typography variant="body1" sx={{ fontWeight: 500, pl: 3.5 }}>
                      {workstation.name}
                      {workstation.location && (
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                          ({t('productionTimeInfo.location')}: {workstation.location})
                        </Typography>
                      )}
                    </Typography>
                  </Grid>
                )}
              </Grid>
            </Collapse>
          </Paper>
        </Grid>
      )}

      {/* ============ TASK DETAILS (remaining sections) ============ */}
      <Grid item xs={12}>
        <TaskDetails task={task} hideProductionTime />
      </Grid>
    </Grid>
  );
};

export default memo(BasicDataTab);
