import React, { Suspense, lazy } from 'react';
import {
  Box, Typography, Button, FormControlLabel, Switch, IconButton,
  Drawer, Divider, Collapse, List, ListItemIcon, ListItemText, ListItemButton
} from '@mui/material';
import {
  Business as BusinessIcon,
  Work as WorkIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  CenterFocusStrong as ResetZoomIcon,
  Schedule as HourlyIcon,
  ViewDay as DailyIcon,
  ViewWeek as WeeklyIcon,
  DateRange as MonthlyIcon,
  Edit as EditIcon,
  Lock as LockIcon,
  Undo as UndoIcon,
  Close as CloseIcon,
  Tune as TuneIcon,
  Palette as PaletteIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  LocalShipping as LocalShippingIcon
} from '@mui/icons-material';
import {
  flexBetween, flexColumnGap1, flexWrap,
  typographyBold, p2, py1, mb1, mb2, mt1, my2
} from '../../../styles/muiCommonStyles';

const TimelineExport = lazy(() => import('../TimelineExport'));

const TimelineMobileDrawer = React.memo(({
  open, onClose, themeMode,
  useWorkstationColors, onWorkstationColorsChange,
  editMode, onEditModeToggle,
  snapToPrevious, onSnapChange,
  poDeliveryMode, onPODeliveryModeToggle,
  groupBy, onGroupByToggle,
  timeScale, onZoomToScale,
  onZoomIn, onZoomOut, onResetZoom,
  undoStack, onUndo,
  mobileControlsExpanded, onExpandToggle,
  tasks, workstations, customers, items,
  visibleTimeStart, visibleTimeEnd,
  showSuccess, showError, t
}) => (
  <Drawer
    anchor="right"
    open={open}
    onClose={onClose}
    PaperProps={{
      sx: {
        width: { xs: '85vw', sm: 320 },
        maxWidth: 360,
        bgcolor: themeMode === 'dark' ? '#1e293b' : '#f8fafc',
        borderLeft: themeMode === 'dark' ? '1px solid rgba(59, 130, 246, 0.2)' : '1px solid rgba(0,0,0,0.1)'
      }
    }}
  >
    <Box sx={p2}>
      <Box sx={{ ...flexBetween, ...mb2 }}>
        <Typography variant="h6" sx={typographyBold}>
          <TuneIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
          {t('production.timeline.controls') || 'Ustawienia'}
        </Typography>
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </Box>

      <Divider sx={mb2} />

      <List disablePadding>
        {/* Wyświetlanie */}
        <ListItemButton
          onClick={() => onExpandToggle('display')}
          sx={{ borderRadius: 1, mb: 0.5 }}
        >
          <ListItemIcon><PaletteIcon /></ListItemIcon>
          <ListItemText primary={t('production.timeline.display') || 'Wyświetlanie'} />
          {mobileControlsExpanded.display ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </ListItemButton>
        <Collapse in={mobileControlsExpanded.display}>
          <Box sx={{ pl: 2, pr: 1, ...py1 }}>
            <FormControlLabel
              control={<Switch checked={useWorkstationColors} onChange={(e) => onWorkstationColorsChange(e.target.checked)} size="small" />}
              label={t('production.timeline.workstationColors')}
            />
            {editMode && (
              <FormControlLabel
                control={<Switch checked={snapToPrevious} onChange={(e) => onSnapChange(e.target.checked)} size="small" color="secondary" />}
                label={t('production.timeline.snapToPrevious')}
              />
            )}
            <Box sx={mt1}>
              <Button fullWidth variant={poDeliveryMode ? "contained" : "outlined"} size="small"
                onClick={onPODeliveryModeToggle} startIcon={<LocalShippingIcon />}
                color={poDeliveryMode ? "warning" : "inherit"} sx={mb1}
              >
                {t('production.timeline.poDeliveryMode')}
              </Button>
              <Button fullWidth variant={editMode ? "contained" : "outlined"} size="small"
                onClick={onEditModeToggle} startIcon={editMode ? <EditIcon /> : <LockIcon />}
                color={editMode ? "primary" : "inherit"} sx={mb1}
              >
                {editMode ? t('production.timeline.editMode') + ' ON' : t('production.timeline.editMode') + ' OFF'}
              </Button>
              <Button fullWidth variant="outlined" size="small"
                onClick={onGroupByToggle} startIcon={groupBy === 'workstation' ? <BusinessIcon /> : <WorkIcon />}
              >
                {groupBy === 'workstation' ? t('production.timeline.groupByWorkstation') : t('production.timeline.groupByOrder')}
              </Button>
            </Box>
          </Box>
        </Collapse>

        {/* Skala czasowa */}
        <ListItemButton
          onClick={() => onExpandToggle('timeScale')}
          sx={{ borderRadius: 1, mb: 0.5 }}
        >
          <ListItemIcon><HourlyIcon /></ListItemIcon>
          <ListItemText primary={t('production.timeline.timeScale') || 'Skala czasowa'} />
          {mobileControlsExpanded.timeScale ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </ListItemButton>
        <Collapse in={mobileControlsExpanded.timeScale}>
          <Box sx={{ pl: 2, pr: 1, ...py1, ...flexWrap, gap: 1 }}>
            {['hourly', 'daily', 'weekly', 'monthly'].map(scale => {
              const icons = { hourly: <HourlyIcon />, daily: <DailyIcon />, weekly: <WeeklyIcon />, monthly: <MonthlyIcon /> };
              return (
                <Button key={scale} variant={timeScale === scale ? 'contained' : 'outlined'} size="small"
                  onClick={() => onZoomToScale(scale)} startIcon={icons[scale]}
                >
                  {t(`production.timeline.${scale}`)}
                </Button>
              );
            })}
          </Box>
        </Collapse>

        {/* Zoom */}
        <ListItemButton
          onClick={() => onExpandToggle('zoom')}
          sx={{ borderRadius: 1, mb: 0.5 }}
        >
          <ListItemIcon><ZoomInIcon /></ListItemIcon>
          <ListItemText primary={t('production.timeline.zoom.title') || 'Zoom'} />
          {mobileControlsExpanded.zoom ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        </ListItemButton>
        <Collapse in={mobileControlsExpanded.zoom}>
          <Box sx={{ pl: 2, pr: 1, ...py1, display: 'flex', gap: 1, justifyContent: 'center' }}>
            <IconButton onClick={onZoomIn} color="primary"><ZoomInIcon /></IconButton>
            <IconButton onClick={onZoomOut} color="primary"><ZoomOutIcon /></IconButton>
            <IconButton onClick={onResetZoom} color="secondary"><ResetZoomIcon /></IconButton>
            {undoStack.length > 0 && (
              <IconButton onClick={onUndo} color="warning"><UndoIcon /></IconButton>
            )}
          </Box>
        </Collapse>
      </List>

      <Divider sx={my2} />

      <Box sx={flexColumnGap1}>
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
      </Box>
    </Box>
  </Drawer>
));

export default TimelineMobileDrawer;
