import React, { Suspense, lazy } from 'react';
import {
  Box, FormControlLabel, Switch, Button, IconButton, Tooltip
} from '@mui/material';
import {
  Business as BusinessIcon,
  Work as WorkIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  FilterList as FilterListIcon,
  Refresh as RefreshIcon,
  CenterFocusStrong as ResetZoomIcon,
  Schedule as HourlyIcon,
  ViewDay as DailyIcon,
  ViewWeek as WeeklyIcon,
  DateRange as MonthlyIcon,
  Edit as EditIcon,
  Lock as LockIcon,
  Undo as UndoIcon,
  LocalShipping as LocalShippingIcon
} from '@mui/icons-material';
import { flexCenterGap1 } from '../../../styles/muiCommonStyles';

const TimelineExport = lazy(() => import('../TimelineExport'));

const TOOLTIP_PROPS = { arrow: true, disableInteractive: true, enterDelay: 500, leaveDelay: 200 };

const TimelineToolbar = React.memo(({
  useWorkstationColors, onWorkstationColorsChange,
  editMode, onEditModeToggle,
  snapToPrevious, onSnapChange,
  poDeliveryMode, onPODeliveryModeToggle,
  groupBy, onGroupByToggle,
  timeScale, onZoomToScale,
  onZoomIn, onZoomOut, onResetZoom,
  undoStack, onUndo,
  advancedFilters, onFilterMenuClick,
  tasks, workstations, customers, items,
  visibleTimeStart, visibleTimeEnd,
  showSuccess, showError,
  onRefresh, t
}) => {
  const hasActiveFilters = !!(
    advancedFilters.productName || advancedFilters.moNumber ||
    advancedFilters.orderNumber || advancedFilters.poNumber
  );

  return (
    <Box sx={flexCenterGap1}>
      <FormControlLabel
        className="timeline-switch"
        control={
          <Switch
            checked={useWorkstationColors}
            onChange={(e) => onWorkstationColorsChange(e.target.checked)}
            size="small"
          />
        }
        label={t('production.timeline.workstationColors')}
      />

      {editMode && (
        <Tooltip title={t('production.timeline.snapToPreviousTooltip')} {...TOOLTIP_PROPS}>
          <FormControlLabel
            className="timeline-switch"
            control={
              <Switch
                checked={snapToPrevious}
                onChange={(e) => onSnapChange(e.target.checked)}
                size="small"
                color="secondary"
              />
            }
            label={t('production.timeline.snapToPrevious')}
            title=""
          />
        </Tooltip>
      )}

      <Tooltip
        title={poDeliveryMode ? t('production.timeline.poDeliveryClickHint') : t('production.timeline.poDeliveryMode')}
        {...TOOLTIP_PROPS}
      >
        <Button
          className={`timeline-action-button ${poDeliveryMode ? 'active' : ''}`}
          variant={poDeliveryMode ? "contained" : "outlined"}
          size="small"
          onClick={onPODeliveryModeToggle}
          startIcon={<LocalShippingIcon />}
          color={poDeliveryMode ? "warning" : "inherit"}
          title=""
        >
          {t('production.timeline.poDeliveryMode')}
        </Button>
      </Tooltip>

      <Tooltip title={t('production.timeline.editModeTooltip')} {...TOOLTIP_PROPS}>
        <Button
          className={`timeline-action-button ${editMode ? 'active' : ''}`}
          variant={editMode ? "contained" : "outlined"}
          size="small"
          onClick={onEditModeToggle}
          startIcon={editMode ? <EditIcon /> : <LockIcon />}
          color={editMode ? "primary" : "default"}
          title=""
        >
          {editMode ? t('production.timeline.editMode') + ' ON' : t('production.timeline.editMode') + ' OFF'}
        </Button>
      </Tooltip>

      <Button
        className="timeline-action-button"
        variant="outlined"
        size="small"
        onClick={onGroupByToggle}
        startIcon={groupBy === 'workstation' ? <BusinessIcon /> : <WorkIcon />}
      >
        {groupBy === 'workstation' ? t('production.timeline.groupByWorkstation') : t('production.timeline.groupByOrder')}
      </Button>

      <Box className="timeline-button-group">
        {['hourly', 'daily', 'weekly', 'monthly'].map(scale => {
          const icons = { hourly: <HourlyIcon />, daily: <DailyIcon />, weekly: <WeeklyIcon />, monthly: <MonthlyIcon /> };
          const labels = { hourly: ' (3 dni)', daily: ' (2 tygodnie)', weekly: ' (2 miesiące)', monthly: ' (6 miesięcy)' };
          return (
            <Tooltip key={scale} title={t(`production.timeline.${scale}`) + labels[scale]} {...TOOLTIP_PROPS}>
              <IconButton
                className={`timeline-icon-button ${timeScale === scale ? 'active' : ''}`}
                size="small"
                onClick={() => onZoomToScale(scale)}
                title=""
              >
                {icons[scale]}
              </IconButton>
            </Tooltip>
          );
        })}
      </Box>

      <Box className="timeline-button-group">
        <Tooltip title={t('production.timeline.zoom.in') + ' (Ctrl + scroll)'} {...TOOLTIP_PROPS}>
          <IconButton className="timeline-icon-button" size="small" onClick={onZoomIn} title="">{<ZoomInIcon />}</IconButton>
        </Tooltip>
        <Tooltip title={t('production.timeline.zoom.out')} {...TOOLTIP_PROPS}>
          <IconButton className="timeline-icon-button" size="small" onClick={onZoomOut} title="">{<ZoomOutIcon />}</IconButton>
        </Tooltip>
        <Tooltip title={t('production.timeline.zoom.reset')} {...TOOLTIP_PROPS}>
          <IconButton className="timeline-icon-button" size="small" onClick={onResetZoom} title="">{<ResetZoomIcon />}</IconButton>
        </Tooltip>
      </Box>

      <Tooltip title={`Cofnij ostatnią akcję (Ctrl+Z) - ${undoStack.length} dostępnych`} {...TOOLTIP_PROPS}>
        <span>
          <IconButton
            className="timeline-undo-button"
            size="small"
            onClick={onUndo}
            disabled={undoStack.length === 0}
            title=""
          >
            <UndoIcon />
          </IconButton>
        </span>
      </Tooltip>

      <Button
        className={`timeline-filter-button ${hasActiveFilters ? 'active' : ''}`}
        variant="outlined"
        size="small"
        onClick={onFilterMenuClick}
        startIcon={<FilterListIcon />}
        color={hasActiveFilters ? 'primary' : 'inherit'}
      >
        {t('production.timeline.filters')} {hasActiveFilters && '✓'}
      </Button>

      <Suspense fallback={null}>
        <TimelineExport
          tasks={tasks}
          workstations={workstations}
          customers={customers}
          startDate={visibleTimeStart}
          endDate={visibleTimeEnd}
          groupBy={groupBy}
          filteredTasks={items.map(item => item.task)}
          showSuccess={showSuccess}
          showError={showError}
        />
      </Suspense>

      <IconButton className="timeline-refresh-button" size="small" onClick={onRefresh}>
        <RefreshIcon />
      </IconButton>
    </Box>
  );
});

export default TimelineToolbar;
