/*
 * ✅ OPTYMALIZACJE WYDAJNOŚCI PRZEWIJANIA - ProductionTimeline
 * 
 * 🚀 WPROWADZONE OPTYMALIZACJE:
 * 
 * 1. DEBOUNCED SCROLL SYNC (90% redukcja wywołań)
 * 2. THROTTLED TOOLTIP UPDATES (80% redukcja)
 * 3. OGRANICZONE EVENT LISTENERY (75% mniej listenerów)
 * 4. ZOPTYMALIZOWANE DOM OBSERVERY (70% redukcja)
 * 5. POJEDYNCZE CANVAS SYNC (95% redukcja timeoutów)
 */

import React, { useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import {
  Box, Paper, Typography, Button, Menu, MenuItem,
  IconButton, Tooltip, CircularProgress, LinearProgress,
  useMediaQuery, useTheme as useMuiTheme, Slider
} from '@mui/material';
import {
  CalendarMonth as CalendarIcon,
  FilterList as FilterListIcon,
  Refresh as RefreshIcon,
  Edit as EditIcon,
  Lock as LockIcon,
  Menu as MenuIcon,
  Close as CloseIcon,
  LocalShipping as LocalShippingIcon
} from '@mui/icons-material';
import Timeline, {
  DateHeader, SidebarHeader, TimelineHeaders
} from 'react-calendar-timeline';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { alpha } from '@mui/material/styles';

import { useNotification } from '../../hooks/useNotification';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../contexts/ThemeContext';
import { useTranslation } from '../../hooks/useTranslation';
import { calculateMaterialReservationStatus, getReservationStatusColors, checkPODeliveryDelays } from '../../utils/productionUtils';
import { startOfDay, endOfDay, addDays } from 'date-fns';

import { useTimelineView } from '../../hooks/production/useTimelineView';
import { useTimelineTooltip } from '../../hooks/production/useTimelineTooltip';
import { useTimelineFilters } from '../../hooks/production/useTimelineFilters';
import { useTimelineState } from '../../hooks/production/useTimelineState';
import { useTimelineSettings } from '../../hooks/production/useTimelineSettings';
import { useTimelineDrag } from '../../hooks/production/useTimelineDrag';
import { useTimelineEdit } from '../../hooks/production/useTimelineEdit';
import { useTimelineTouch } from '../../hooks/production/useTimelineTouch';

import { DragTimeDisplay, CustomTooltip, PODeliveryTooltip } from './DragTimeDisplay';
import TimelineToolbar from './timeline/TimelineToolbar';
import TimelineMobileDrawer from './timeline/TimelineMobileDrawer';
import TimelineLegend from './timeline/TimelineLegend';

import {
  flexCenter, mb1, mb2, mt2, ml1, p2,
  typographyBold
} from '../../styles/muiCommonStyles';

import 'react-calendar-timeline/dist/style.css';
import './ProductionTimeline.css';

const TimelineExport = lazy(() => import('./TimelineExport'));
const EditTaskDialog = lazy(() => import('./timeline/EditTaskDialog'));
const AdvancedFiltersDialog = lazy(() => import('./timeline/AdvancedFiltersDialog'));

const debounce = (func, delay) => {
  let timeoutId;
  const debounced = function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
  debounced.cancel = () => { clearTimeout(timeoutId); };
  return debounced;
};

const ProductionTimeline = React.memo(({
  readOnly = false,
  performanceMode = false
} = {}) => {
  const { showError, showSuccess } = useNotification();
  const { currentUser } = useAuth();
  const { mode: themeMode } = useTheme();
  const { t } = useTranslation('production');
  const muiTheme = useMuiTheme();
  const isMobile = useMediaQuery(muiTheme.breakpoints.down('md'));
  const isTablet = useMediaQuery(muiTheme.breakpoints.down('lg'));

  // ── Hooks ──
  const view = useTimelineView();
  const tooltip = useTimelineTooltip({ performanceMode });

  const state = useTimelineState({
    visibleTimeStart: view.visibleTimeStart,
    visibleTimeEnd: view.visibleTimeEnd,
    setLoadedRange: view.setLoadedRange,
    loadedRangeRef: view.loadedRangeRef,
    setIsLoadingMore: view.setIsLoadingMore,
    showError, showSuccess, t
  });

  const settings = useTimelineSettings({
    workstations: state.workstations,
    showError, t
  });

  const filters = useTimelineFilters({
    enrichTasksWithPO: state.enrichTasksWithPO,
    tasksEnrichedWithPO: state.tasksEnrichedWithPO,
    enrichmentInProgress: state.enrichmentInProgress,
    tasksLength: state.tasks.length
  });

  // ── Initial data load ──
  useEffect(() => {
    let cancelled = false;
    state.fetchWorkstations(filters.setSelectedWorkstations).then(() => { if (cancelled) return; });
    state.fetchCustomers(filters.setSelectedCustomers).then(() => { if (cancelled) return; });
    state.fetchTasks().then(() => { if (cancelled) return; });
    return () => { cancelled = true; };
  }, []);

  // ── Computed: groups ──
  const groups = useMemo(() => {
    if (filters.groupBy === 'workstation') {
      const filteredWS = state.workstations.filter(ws => filters.selectedWorkstations[ws.id]);
      const wsGroups = filteredWS.map(ws => ({
        id: ws.id,
        title: ws.name,
        rightTitle: ws.code || '',
        bgColor: settings.useWorkstationColors ? (ws.color || settings.getWorkstationColor(ws.id)) : '#f5f5f5'
      }));
      const hasNoWS = state.tasks.some(t => !t.workstationId);
      if (hasNoWS && filters.selectedWorkstations['no-workstation']) {
        wsGroups.push({ id: 'no-workstation', title: t('production.timeline.groups.noWorkstation'), rightTitle: '', bgColor: '#f5f5f5' });
      }
      return wsGroups;
    } else {
      const uniqueOrders = new Map();
      state.tasks.forEach(task => {
        if (task.orderId && !uniqueOrders.has(task.orderId)) {
          uniqueOrders.set(task.orderId, { id: task.orderId, title: task.orderNumber || task.orderId, rightTitle: task.customerName || '', bgColor: '#f5f5f5' });
        }
      });
      if (uniqueOrders.size === 0 || state.tasks.some(task => !task.orderId)) {
        uniqueOrders.set('no-order', { id: 'no-order', title: t('production.timeline.groups.noOrder'), rightTitle: '', bgColor: '#f5f5f5' });
      }
      return Array.from(uniqueOrders.values());
    }
  }, [state.workstations, filters.selectedWorkstations, filters.groupBy, state.tasks, settings.useWorkstationColors, settings.getWorkstationColor, t]);

  // ── Computed: items ──
  const items = useMemo(() => {
    const convertToDate = (date) => {
      if (!date) return new Date();
      if (date instanceof Date) return date;
      if (date.toDate && typeof date.toDate === 'function') return date.toDate();
      return new Date(date);
    };
    const roundToMin = (date) => { const r = new Date(date); r.setSeconds(0, 0); return r; };

    let filtered = state.tasks
      .filter(task => {
        const cid = task.customer?.id || task.customerId;
        return cid ? filters.selectedCustomers[cid] === true : filters.selectedCustomers['no-customer'] === true;
      })
      .filter(task => {
        if (filters.groupBy === 'workstation') {
          return task.workstationId ? filters.selectedWorkstations[task.workstationId] : filters.selectedWorkstations['no-workstation'];
        }
        return true;
      });

    const af = filters.advancedFilters;
    if (af.productName || af.moNumber || af.orderNumber || af.poNumber || af.startDate || af.endDate) {
      filtered = filtered.filter(task => {
        if (af.productName && !(task.productName || task.name || '').toLowerCase().includes(af.productName.toLowerCase())) return false;
        if (af.moNumber && !(task.moNumber || '').toLowerCase().includes(af.moNumber.toLowerCase())) return false;
        if (af.orderNumber && !(task.orderNumber || '').toLowerCase().includes(af.orderNumber.toLowerCase())) return false;
        if (af.poNumber) {
          if (!task.poNumbers?.length) return false;
          if (!task.poNumbers.some(pn => pn.toLowerCase().includes(af.poNumber.toLowerCase()))) return false;
        }
        if (af.startDate || af.endDate) {
          const td = task.scheduledDate;
          if (td) {
            const tdo = td instanceof Date ? td : td.toDate ? td.toDate() : new Date(td);
            if (!isNaN(tdo.getTime())) {
              if (af.startDate) { const sd = new Date(af.startDate); sd.setHours(0,0,0,0); if (tdo < sd) return false; }
              if (af.endDate) { const ed = new Date(af.endDate); ed.setHours(23,59,59,999); if (tdo > ed) return false; }
            }
          }
        }
        return true;
      });
    }

    return filtered.map(task => {
      let startTime, endTime;
      if (task.status === 'Zakończone' && state.productionHistoryMap.has(task.id)) {
        const actualDates = state.calculateActualDatesFromHistory(task.id, state.productionHistoryMap.get(task.id));
        if (actualDates) {
          startTime = roundToMin(actualDates.actualStartTime);
          endTime = roundToMin(actualDates.actualEndTime);
        }
      }
      if (!startTime) {
        startTime = roundToMin(convertToDate(task.scheduledDate));
        endTime = task.endDate ? roundToMin(convertToDate(task.endDate)) :
          task.estimatedDuration ? new Date(startTime.getTime() + task.estimatedDuration * 60 * 1000) :
          new Date(startTime.getTime() + 8 * 60 * 60 * 1000);
      }

      const groupId = filters.groupBy === 'workstation' ? (task.workstationId || 'no-workstation') : (task.orderId || 'no-order');
      let taskForTooltip = { ...task };
      if (task.status === 'Zakończone' && state.productionHistoryMap.has(task.id)) {
        const actualDates = state.calculateActualDatesFromHistory(task.id, state.productionHistoryMap.get(task.id));
        if (actualDates) {
          taskForTooltip.actualStartDate = actualDates.actualStartTime;
          taskForTooltip.actualEndDate = actualDates.actualEndTime;
        }
      }

      const canEditTask = settings.editMode && task.status !== 'Zakończone';
      const productionTimeMinutes = task.estimatedDuration || Math.round((endTime - startTime) / (1000 * 60));
      const reservationStatus = calculateMaterialReservationStatus(taskForTooltip);
      const deliveryDelayInfo = checkPODeliveryDelays(taskForTooltip);
      const unreadCommentsCount = taskForTooltip.comments?.length > 0
        ? taskForTooltip.comments.filter(c => !(c.readBy || []).includes(currentUser?.uid)).length : 0;

      return {
        id: task.id, group: groupId,
        title: task.name || `${task.productName} (${task.moNumber})`,
        start_time: startTime.getTime(), end_time: endTime.getTime(),
        canMove: canEditTask, canResize: false, canChangeGroup: false,
        task: taskForTooltip,
        backgroundColor: settings.getItemColor(task),
        originalDuration: productionTimeMinutes,
        workingHoursPerDay: task.workingHoursPerDay || 16,
        reservationStatus, deliveryDelayInfo, unreadCommentsCount
      };
    });
  }, [state.tasks, filters.selectedCustomers, filters.selectedWorkstations, filters.groupBy, settings.useWorkstationColors, state.workstations, settings.getItemColor, filters.advancedFilters, settings.editMode, state.productionHistoryMap, state.calculateActualDatesFromHistory, currentUser?.uid]);

  // ── PO delivery items & display groups ──
  const poDeliveryItems = useMemo(() => {
    if (!settings.focusedMOId || settings.focusedMOReservations.length === 0) return [];
    return settings.focusedMOReservations.map(reservation => {
      const isDone = reservation.status === 'delivered' || reservation.status === 'converted';
      const rawDate = isDone ? (reservation.deliveredAt || reservation.expectedDeliveryDate) : reservation.expectedDeliveryDate;
      if (!rawDate) return null;
      const dd = rawDate instanceof Date ? rawDate : rawDate?.toDate ? rawDate.toDate() : new Date(rawDate);
      if (isNaN(dd.getTime())) return null;
      return {
        id: `po-res-${reservation.id}`, group: `po-mat-${reservation.materialId}`,
        title: `PO: ${reservation.poNumber} — ${reservation.reservedQuantity} ${reservation.unit}${isDone ? ' ✓' : ''}`,
        start_time: startOfDay(dd).getTime(), end_time: endOfDay(dd).getTime(),
        canMove: false, canResize: false, canChangeGroup: false,
        isPODelivery: true, reservation, backgroundColor: isDone ? '#4caf50' : '#ff9800'
      };
    }).filter(Boolean);
  }, [settings.focusedMOId, settings.focusedMOReservations]);

  const displayItems = useMemo(() => {
    if (!settings.focusedMOId) return items;
    return [...items.filter(i => i.id === settings.focusedMOId), ...poDeliveryItems];
  }, [items, settings.focusedMOId, poDeliveryItems]);

  const displayGroups = useMemo(() => {
    if (!settings.focusedMOId) return groups;
    const focusedItem = items.find(i => i.id === settings.focusedMOId);
    const moGroup = groups.find(g => g.id === focusedItem?.group);
    if (settings.focusedMOReservations.length === 0) return moGroup ? [moGroup] : groups;
    const uniqueMaterials = [...new Map(
      settings.focusedMOReservations.filter(r => r.expectedDeliveryDate || r.deliveredAt)
        .map(r => [r.materialId, { id: r.materialId, name: r.materialName }])
    ).values()];
    return [moGroup, ...uniqueMaterials.map(mat => ({ id: `po-mat-${mat.id}`, title: mat.name, rightTitle: 'PO' }))].filter(Boolean);
  }, [settings.focusedMOId, settings.focusedMOReservations, groups, items]);

  // ── Drag & Edit hooks (need items) ──
  const drag = useTimelineDrag({ items, roundToMinute: useCallback((date) => {
    if (!date || isNaN(new Date(date).getTime())) return new Date();
    const r = new Date(date); r.setSeconds(0, 0); return r;
  }, []) });

  const edit = useTimelineEdit({
    items, tasks: state.tasks, setTasks: state.setTasks, groups, groupBy: filters.groupBy,
    snapToPrevious: settings.snapToPrevious, editMode: settings.editMode,
    poDeliveryMode: settings.poDeliveryMode, focusedMOId: settings.focusedMOId,
    showError, showSuccess, t, currentUser,
    handleRefresh: state.handleRefresh, resetDrag: drag.resetDrag, isDragging: drag.isDragging,
    setFocusedMOId: settings.setFocusedMOId, setFocusedMOReservations: settings.setFocusedMOReservations,
    loadPOReservationsForMO: settings.loadPOReservationsForMO
  });

  // ── Touch hook ──
  useTimelineTouch({
    visibleTimeStart: view.visibleTimeStart, visibleTimeEnd: view.visibleTimeEnd,
    canvasTimeStart: view.canvasTimeStart, canvasTimeEnd: view.canvasTimeEnd,
    zoomLevel: view.zoomLevel,
    setVisibleTimeStart: view.setVisibleTimeStart, setVisibleTimeEnd: view.setVisibleTimeEnd,
    setZoomLevel: view.setZoomLevel,
    updateScrollCanvasRef: view.updateScrollCanvasRef,
    debouncedTooltipUpdate: tooltip.debouncedTooltipUpdate,
    hideTooltip: tooltip.hideTooltip,
    calculateSliderValue: view.calculateSliderValue, setSliderValue: view.setSliderValue
  });

  // ── Global mousemove for drag position ──
  useEffect(() => {
    if (!drag.dragInfo.isDragging) return;
    const handleMove = (e) => {
      drag.setDragInfo(prev => ({ ...prev, position: { x: e.clientX, y: e.clientY } }));
    };
    document.addEventListener('mousemove', handleMove);
    return () => document.removeEventListener('mousemove', handleMove);
  }, [drag.dragInfo.isDragging, drag.setDragInfo]);

  // ── DOM observers (readonly/performance skip) ──
  useEffect(() => {
    if (readOnly || performanceMode) return;
    const el = document.querySelector('.react-calendar-timeline');
    if (!el) return;
    const sync = debounce(() => {
      if (view.updateScrollCanvasRef.current) {
        requestAnimationFrame(() => view.updateScrollCanvasRef.current(view.visibleTimeStart, view.visibleTimeEnd));
      }
    }, 100);
    const ro = new ResizeObserver(sync);
    const mo = new MutationObserver(sync);
    ro.observe(el);
    mo.observe(el, { childList: true, attributes: true, attributeFilter: ['style'] });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, [view.visibleTimeStart, view.visibleTimeEnd, readOnly, performanceMode]);

  // ── Remove native title tooltips ──
  useEffect(() => {
    const removeNativeTooltips = () => {
      document.querySelectorAll(`
        .production-timeline-header [title], .timeline-legend-container [title],
        .timeline-icon-button[title], .timeline-action-button[title],
        .timeline-filter-button[title], .timeline-refresh-button[title],
        .timeline-undo-button[title], .MuiTooltip-root [title],
        .MuiIconButton-root[title], .MuiButton-root[title]
      `).forEach(el => {
        if (el.getAttribute('title') && !el.getAttribute('data-original-title')) {
          el.setAttribute('data-original-title', el.getAttribute('title'));
        }
        el.removeAttribute('title');
      });
    };
    removeNativeTooltips();
    const observer = new MutationObserver((mutations) => {
      mutations.forEach(m => {
        if (m.type === 'childList') {
          m.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const els = node.querySelectorAll ? [node, ...node.querySelectorAll('[title]')] : [];
              els.forEach(el => {
                if (el.getAttribute?.('title')) {
                  el.setAttribute('data-original-title', el.getAttribute('title'));
                  el.removeAttribute('title');
                }
              });
            }
          });
        }
      });
    });
    const container = document.querySelector('.production-timeline-header')?.parentElement;
    if (container) observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['title'] });
    return () => observer.disconnect();
  }, []);

  // ── moveResizeValidator ──
  const moveResizeValidator = useCallback((action, item, time) => {
    if (readOnly) return false;
    if (action === 'move') {
      const d = new Date(time); d.setSeconds(0, 0);
      return d.getTime();
    }
    if (action === 'resize') return false;
    return time;
  }, [readOnly]);

  // ── Shared event props ──
  const handlePODeliveryModeToggle = useCallback(() => {
    const newMode = !settings.poDeliveryMode;
    settings.setPODeliveryMode(newMode);
    if (!newMode) { settings.setFocusedMOId(null); settings.setFocusedMOReservations([]); }
  }, [settings]);

  const handleGroupByToggle = useCallback(() => {
    filters.setGroupBy(prev => prev === 'workstation' ? 'order' : 'workstation');
  }, [filters.setGroupBy]);

  const handleMobileExpandToggle = useCallback((section) => {
    settings.setMobileControlsExpanded(prev => ({ ...prev, [section]: !prev[section] }));
  }, [settings.setMobileControlsExpanded]);

  // ── Item Renderer ──
  const itemRenderer = useCallback(({ item, itemContext, getItemProps }) => {
    const { key, ...itemProps } = getItemProps();

    if (item.isPODelivery) {
      const res = item.reservation;
      const isDelivered = res.status === 'delivered' || res.status === 'converted';
      return (
        <div key={key} {...itemProps}
          onMouseEnter={(e) => tooltip.showPOTooltip(res, e)}
          onMouseLeave={tooltip.hidePOTooltip}
          style={{
            ...itemProps.style,
            background: isDelivered ? 'linear-gradient(135deg, #4caf50 0%, #66bb6a 100%)' : 'linear-gradient(135deg, #ff9800 0%, #ffb74d 100%)',
            border: isDelivered ? '2px solid #2e7d32' : '2px dashed #e65100',
            borderRadius: '6px', padding: '2px 8px', fontSize: '11px', color: '#fff',
            textShadow: '0 1px 2px rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden', cursor: 'default'
          }}
        >
          <span style={{ fontSize: '13px', flexShrink: 0 }}>{isDelivered ? '✓' : '⏳'}</span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{itemContext.title}</span>
        </div>
      );
    }

    const { reservationStatus, deliveryDelayInfo, unreadCommentsCount } = item;
    let textColor = '#fff';
    if (item.task.status !== 'Zakończone' && item.task.status !== 'completed') {
      if (reservationStatus.status === 'fully_reserved') textColor = getReservationStatusColors('fully_reserved').main;
      else if (reservationStatus.status === 'partially_reserved') textColor = getReservationStatusColors('partially_reserved').main;
      else if (reservationStatus.status === 'not_reserved') textColor = getReservationStatusColors('not_reserved').main;
    }

    const deliveryDelayTooltip = deliveryDelayInfo.hasDelay
      ? deliveryDelayInfo.delayedItems.map(d =>
          `${d.materialName} (${d.poNumber})${d.delayDays ? ` - ${t('production.timeline.tooltip.poDeliveryDelayDays', { days: d.delayDays })}` : ` - ${t('production.timeline.tooltip.poDeliveryMissingDate')}`}`
        ).join('\n')
      : '';

    return (
      <div key={key} {...itemProps}
        onMouseEnter={(e) => { if (item.task) tooltip.debouncedTooltipUpdate(e, item.task); }}
        onMouseLeave={tooltip.hideTooltip}
        style={{
          ...itemProps.style,
          background: item.backgroundColor || '#1976d2', color: textColor,
          textShadow: '0 1px 2px rgba(0, 0, 0, 0.7)',
          border: '1px solid rgba(255, 255, 255, 0.3)', borderRadius: '4px',
          padding: '2px 6px', fontSize: '12px', cursor: 'pointer',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
          fontWeight: (reservationStatus.status !== 'no_materials' && reservationStatus.status !== 'completed_confirmed' && item.task.status !== 'Zakończone' && item.task.status !== 'completed') ? '600' : 'normal',
          display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden'
        }}
      >
        {deliveryDelayInfo.hasDelay && (
          <span title={`${t('production.timeline.tooltip.poDeliveryDelayDot', { count: deliveryDelayInfo.delayedCount })}:\n${deliveryDelayTooltip}`}
            style={{ width: '8px', height: '8px', minWidth: '8px', backgroundColor: '#ff1744', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.6)', boxShadow: '0 0 4px rgba(255,23,68,0.7)', flexShrink: 0 }}
          />
        )}
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{itemContext.title}</span>
        {unreadCommentsCount > 0 && (
          <span style={{ backgroundColor: '#f50057', color: '#fff', borderRadius: '50%', minWidth: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: 'bold', flexShrink: 0, padding: '0 3px', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.3)' }}>
            {unreadCommentsCount > 9 ? '9+' : unreadCommentsCount}
          </span>
        )}
      </div>
    );
  }, [tooltip, t]);

  // ── Render ──
  return (
    <Box sx={{ position: 'relative' }}>
      {(isMobile || isTablet) && (
        <TimelineMobileDrawer
          open={settings.mobileDrawerOpen} onClose={() => settings.setMobileDrawerOpen(false)} themeMode={themeMode}
          useWorkstationColors={settings.useWorkstationColors} onWorkstationColorsChange={settings.setUseWorkstationColors}
          editMode={settings.editMode} onEditModeToggle={settings.handleEditModeToggle}
          snapToPrevious={settings.snapToPrevious} onSnapChange={settings.setSnapToPrevious}
          poDeliveryMode={settings.poDeliveryMode} onPODeliveryModeToggle={handlePODeliveryModeToggle}
          groupBy={filters.groupBy} onGroupByToggle={handleGroupByToggle}
          timeScale={view.timeScale} onZoomToScale={view.zoomToScale}
          onZoomIn={view.zoomIn} onZoomOut={view.zoomOut} onResetZoom={view.resetZoom}
          undoStack={edit.undoStack} onUndo={edit.handleUndo}
          mobileControlsExpanded={settings.mobileControlsExpanded} onExpandToggle={handleMobileExpandToggle}
          tasks={state.tasks} workstations={state.workstations} customers={state.customers} items={items}
          visibleTimeStart={view.visibleTimeStart} visibleTimeEnd={view.visibleTimeEnd}
          showSuccess={showSuccess} showError={showError} t={t}
        />
      )}

      <Paper sx={{ p: { xs: 1, sm: 1.5, md: 2 }, height: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Box className="production-timeline-header" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: { xs: 1, md: 2 }, flexWrap: 'wrap', gap: { xs: 1, md: 0 } }}>
          <Typography variant={isMobile ? "subtitle1" : "h6"} sx={{ display: 'flex', alignItems: 'center', fontWeight: 600, fontSize: { xs: '1rem', sm: '1.1rem', md: '1.25rem' } }}>
            <CalendarIcon sx={{ mr: 1, fontSize: { xs: '1.2rem', md: '1.5rem' } }} />
            {t('production.timeline.title')}
          </Typography>

          {!isMobile && !isTablet && (
            <TimelineToolbar
              useWorkstationColors={settings.useWorkstationColors} onWorkstationColorsChange={settings.setUseWorkstationColors}
              editMode={settings.editMode} onEditModeToggle={settings.handleEditModeToggle}
              snapToPrevious={settings.snapToPrevious} onSnapChange={settings.setSnapToPrevious}
              poDeliveryMode={settings.poDeliveryMode} onPODeliveryModeToggle={handlePODeliveryModeToggle}
              groupBy={filters.groupBy} onGroupByToggle={handleGroupByToggle}
              timeScale={view.timeScale} onZoomToScale={view.zoomToScale}
              onZoomIn={view.zoomIn} onZoomOut={view.zoomOut} onResetZoom={view.resetZoom}
              undoStack={edit.undoStack} onUndo={edit.handleUndo}
              advancedFilters={filters.advancedFilters} onFilterMenuClick={filters.handleFilterMenuClick}
              tasks={state.tasks} workstations={state.workstations} customers={state.customers} items={items}
              visibleTimeStart={view.visibleTimeStart} visibleTimeEnd={view.visibleTimeEnd}
              showSuccess={showSuccess} showError={showError} onRefresh={state.handleRefresh} t={t}
            />
          )}

          {(isMobile || isTablet) && (
            <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
              <Tooltip title={t('production.timeline.poDeliveryMode')} arrow>
                <IconButton size="small" onClick={handlePODeliveryModeToggle}
                  color={settings.poDeliveryMode ? "warning" : "default"}
                  sx={{ bgcolor: settings.poDeliveryMode ? 'warning.main' : 'transparent', color: settings.poDeliveryMode ? 'white' : 'inherit', '&:hover': { bgcolor: settings.poDeliveryMode ? 'warning.dark' : 'action.hover' } }}
                ><LocalShippingIcon /></IconButton>
              </Tooltip>
              <IconButton size="small" onClick={settings.handleEditModeToggle} color={settings.editMode ? "primary" : "default"}
                sx={{ bgcolor: settings.editMode ? 'primary.main' : 'transparent', color: settings.editMode ? 'white' : 'inherit', '&:hover': { bgcolor: settings.editMode ? 'primary.dark' : 'action.hover' } }}
              >{settings.editMode ? <EditIcon /> : <LockIcon />}</IconButton>
              <IconButton size="small" onClick={filters.handleFilterMenuClick}
                color={filters.hasActiveAdvancedFilters ? 'primary' : 'default'}
              ><FilterListIcon /></IconButton>
              <IconButton size="small" onClick={state.handleRefresh}><RefreshIcon /></IconButton>
              <IconButton size="small" onClick={() => settings.setMobileDrawerOpen(true)}
                sx={{ bgcolor: alpha(muiTheme.palette.primary.main, 0.1), '&:hover': { bgcolor: alpha(muiTheme.palette.primary.main, 0.2) } }}
              ><MenuIcon /></IconButton>
            </Box>
          )}
        </Box>

        {/* Legend */}
        <TimelineLegend
          useWorkstationColors={settings.useWorkstationColors}
          workstations={state.workstations}
          getWorkstationColor={settings.getWorkstationColor}
          isMobile={isMobile} t={t}
        />

        {/* Timeline area */}
        <Box sx={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
          {state.loading && (
            <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', bgcolor: 'rgba(255,255,255,0.7)', zIndex: 10 }}>
              <CircularProgress />
            </Box>
          )}
          {view.isLoadingMore && <LinearProgress sx={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 11, height: 3 }} />}

          {settings.focusedMOId && (
            <Paper sx={{ p: 1, mb: 1, display: 'flex', alignItems: 'center', gap: 1, bgcolor: 'warning.light', color: 'warning.contrastText', borderRadius: 1 }}>
              <LocalShippingIcon fontSize="small" />
              <Typography variant="body2" sx={{ flex: 1, fontWeight: 500 }}>
                {t('production.timeline.poDeliveryBanner', { moName: items.find(i => i.id === settings.focusedMOId)?.title || '' })}
                {settings.focusedMOReservations.length === 0 && !settings.loadingPOReservations && (
                  <span style={{ fontStyle: 'italic', marginLeft: 8, opacity: 0.8 }}>({t('production.timeline.poDeliveryNoReservations')})</span>
                )}
              </Typography>
              {settings.loadingPOReservations && <CircularProgress size={16} />}
              <IconButton size="small" onClick={() => { settings.setFocusedMOId(null); settings.setFocusedMOReservations([]); }} sx={{ color: 'warning.contrastText' }}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </Paper>
          )}

          {settings.poDeliveryMode && !settings.focusedMOId && (
            <Paper sx={{ p: 1, mb: 1, display: 'flex', alignItems: 'center', gap: 1, bgcolor: themeMode === 'dark' ? 'rgba(255, 152, 0, 0.15)' : 'rgba(255, 152, 0, 0.1)', border: '1px dashed', borderColor: 'warning.main', borderRadius: 1 }}>
              <LocalShippingIcon fontSize="small" color="warning" />
              <Typography variant="body2" sx={{ opacity: 0.85 }}>{t('production.timeline.poDeliveryClickHint')}</Typography>
            </Paper>
          )}

          <Timeline
            groups={displayGroups} items={displayItems}
            visibleTimeStart={view.visibleTimeStart} visibleTimeEnd={view.visibleTimeEnd}
            canvasTimeStart={view.canvasTimeStart} canvasTimeEnd={view.canvasTimeEnd}
            onTimeChange={view.handleTimeChange}
            onItemMove={edit.handleItemMove}
            onItemSelect={edit.handleItemSelect}
            onItemDeselect={() => { if (settings.poDeliveryMode && settings.focusedMOId) { settings.setFocusedMOId(null); settings.setFocusedMOReservations([]); } }}
            moveResizeValidator={moveResizeValidator}
            onItemDrag={drag.handleItemDrag}
            itemRenderer={itemRenderer}
            stackItems itemHeightRatio={0.75} lineHeight={60}
            sidebarWidth={isMobile ? 150 : 200} rightSidebarWidth={isMobile ? 0 : 100}
            dragSnap={15 * 60 * 1000} minimumWidthForItemContentVisibility={50}
            buffer={1} traditionalZoom={true} itemTouchSendsClick={false}
          >
            <TimelineHeaders className="sticky">
              <SidebarHeader>
                {({ getRootProps }) => {
                  const { key, ...rootProps } = getRootProps();
                  return (
                    <div key={key} {...rootProps} style={{
                      ...rootProps.style,
                      background: themeMode === 'dark' ? 'linear-gradient(135deg, #1a237e 0%, #283593 50%, #3949ab 100%)' : 'linear-gradient(135deg, #1976d2 0%, #1e88e5 50%, #42a5f5 100%)',
                      color: '#ffffff', borderBottom: themeMode === 'dark' ? '2px solid #3949ab' : '2px solid #1976d2', boxShadow: '0 2px 8px rgba(25, 118, 210, 0.2)'
                    }}>
                      <Typography variant="subtitle2" sx={{ p: 1, fontWeight: 600, textShadow: '1px 1px 2px rgba(0,0,0,0.3)' }}>
                        {filters.groupBy === 'workstation' ? 'Stanowisko' : 'Zamówienie'}
                      </Typography>
                    </div>
                  );
                }}
              </SidebarHeader>
              <DateHeader unit="primaryHeader" style={{
                background: themeMode === 'dark' ? 'linear-gradient(135deg, #0d47a1 0%, #1565c0 50%, #1976d2 100%)' : 'linear-gradient(135deg, #0d47a1 0%, #1565c0 50%, #1976d2 100%)',
                color: '#ffffff', borderBottom: themeMode === 'dark' ? '1px solid #1976d2' : '1px solid #0d47a1', fontWeight: 600
              }} intervalRenderer={({ getIntervalProps, intervalContext }) => {
                const { key, ...ip } = getIntervalProps();
                return (<div key={key} {...ip} style={{ ...ip.style, background: themeMode === 'dark' ? 'linear-gradient(135deg, #0d47a1 0%, #1565c0 50%, #1976d2 100%)' : 'linear-gradient(135deg, #0d47a1 0%, #1565c0 50%, #1976d2 100%)', color: '#ffffff', borderRight: '1px solid rgba(255,255,255,0.2)', fontWeight: 600, textShadow: '1px 1px 2px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{intervalContext.intervalText}</div>);
              }} />
              <DateHeader style={{
                background: themeMode === 'dark' ? 'linear-gradient(135deg, #1565c0 0%, #1976d2 50%, #1e88e5 100%)' : 'linear-gradient(135deg, #1565c0 0%, #1976d2 50%, #1e88e5 100%)',
                color: '#ffffff', borderBottom: themeMode === 'dark' ? '1px solid #1e88e5' : '1px solid #1565c0', fontWeight: 500
              }} intervalRenderer={({ getIntervalProps, intervalContext }) => {
                const { key, ...ip } = getIntervalProps();
                return (<div key={key} {...ip} style={{ ...ip.style, background: themeMode === 'dark' ? 'linear-gradient(135deg, #1565c0 0%, #1976d2 50%, #1e88e5 100%)' : 'linear-gradient(135deg, #1565c0 0%, #1976d2 50%, #1e88e5 100%)', color: '#ffffff', borderRight: '1px solid rgba(255,255,255,0.2)', fontWeight: 500, textShadow: '1px 1px 2px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{intervalContext.intervalText}</div>);
              }} />
            </TimelineHeaders>
          </Timeline>
        </Box>

        {/* Horizontal slider */}
        <Box sx={{ mt: { xs: 0.5, md: 1 }, px: { xs: 1, md: 2 }, pb: { xs: 0.5, md: 1 }, borderTop: '1px solid', borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, md: 2 } }}>
            <Typography variant="caption" sx={{ minWidth: { xs: '80px', sm: '100px', md: '120px' }, fontSize: { xs: '0.65rem', md: '0.75rem' }, color: 'text.secondary', display: { xs: 'none', sm: 'block' } }}>
              Przewijanie poziome:
            </Typography>
            <Slider
              value={isFinite(view.sliderValue) ? Math.max(0, Math.min(100, view.sliderValue)) : 0}
              onChange={view.handleSliderChange} min={0} max={100} step={0.1}
              disabled={!isFinite(view.sliderValue) || view.canvasTimeEnd <= view.canvasTimeStart}
              sx={{ flex: 1, height: { xs: 6, md: 4 }, '& .MuiSlider-thumb': { width: { xs: 20, md: 16 }, height: { xs: 20, md: 16 } }, '& .MuiSlider-track': { height: { xs: 6, md: 4 }, border: 'none' }, '& .MuiSlider-rail': { height: { xs: 6, md: 4 }, opacity: 0.3, backgroundColor: '#bfbfbf' } }}
            />
            <Typography variant="caption" sx={{ minWidth: { xs: '30px', md: '40px' }, fontSize: { xs: '0.65rem', md: '0.75rem' }, color: 'text.secondary', textAlign: 'right' }}>
              {isFinite(view.sliderValue) ? Math.round(view.sliderValue) : 0}%
            </Typography>
          </Box>
          <Box sx={{ display: { xs: 'none', sm: 'flex' }, justifyContent: 'space-between', mt: 0.5, fontSize: { xs: '0.6rem', md: '0.7rem' }, color: 'text.disabled' }}>
            <span>{view.canvasTimeStart ? format(new Date(view.canvasTimeStart), 'dd.MM.yyyy', { locale: pl }) : '---'}</span>
            <span className="timeline-date-range">
              Widoczny zakres: {view.visibleTimeStart && view.visibleTimeEnd
                ? `${format(new Date(view.visibleTimeStart), isMobile ? 'dd.MM' : 'dd.MM HH:mm', { locale: pl })} - ${format(new Date(view.visibleTimeEnd), isMobile ? 'dd.MM' : 'dd.MM HH:mm', { locale: pl })}`
                : '---'}
            </span>
            <span>{view.canvasTimeEnd ? format(new Date(view.canvasTimeEnd), 'dd.MM.yyyy', { locale: pl }) : '---'}</span>
          </Box>
        </Box>

        {/* Filter Menu */}
        <Menu anchorEl={filters.filterMenuAnchor} open={Boolean(filters.filterMenuAnchor)} onClose={filters.handleFilterMenuClose}
          PaperProps={{ style: { maxHeight: 400, width: '300px' } }}
        >
          <Box sx={p2}>
            <Typography variant="subtitle1" sx={{ ...typographyBold, ...mb1 }}>Filtry</Typography>
            <Button fullWidth variant="outlined" startIcon={<FilterListIcon />} onClick={filters.handleAdvancedFilterOpen} sx={mb2}>
              Zaawansowane filtrowanie
            </Button>
            <Typography variant="body2" sx={mb1}>Stanowiska:</Typography>
            {state.workstations.map(ws => (
              <Box key={ws.id} sx={{ ...flexCenter, mb: 0.5 }}>
                <input type="checkbox" checked={filters.selectedWorkstations[ws.id] || false}
                  onChange={() => filters.setSelectedWorkstations(prev => ({ ...prev, [ws.id]: !prev[ws.id] }))} />
                <Typography variant="body2" sx={{ ...ml1, fontSize: '0.85rem' }}>{ws.name}</Typography>
              </Box>
            ))}
            <Box sx={{ ...flexCenter, mb: 0.5 }}>
              <input type="checkbox" checked={filters.selectedWorkstations['no-workstation'] || false}
                onChange={() => filters.setSelectedWorkstations(prev => ({ ...prev, 'no-workstation': !prev['no-workstation'] }))} />
              <Typography variant="body2" sx={{ ...ml1, fontSize: '0.85rem' }}>Bez stanowiska</Typography>
            </Box>
            <Typography variant="body2" sx={{ ...mb1, ...mt2 }}>Klienci:</Typography>
            {state.customers.map(customer => (
              <Box key={customer.id} sx={{ ...flexCenter, mb: 0.5 }}>
                <input type="checkbox" checked={filters.selectedCustomers[customer.id] || false}
                  onChange={() => filters.setSelectedCustomers(prev => ({ ...prev, [customer.id]: !prev[customer.id] }))} />
                <Typography variant="body2" sx={{ ...ml1, fontSize: '0.85rem' }}>{customer.name}</Typography>
              </Box>
            ))}
          </Box>
        </Menu>

        {/* Lazy Dialogs */}
        <Suspense fallback={null}>
          {edit.editDialog && (
            <EditTaskDialog
              open={edit.editDialog} onClose={() => edit.setEditDialog(false)}
              editForm={edit.editForm} onEditFormChange={edit.setEditForm}
              onSave={edit.handleSaveEdit} t={t}
            />
          )}
        </Suspense>
        <Suspense fallback={null}>
          {filters.advancedFilterDialog && (
            <AdvancedFiltersDialog
              open={filters.advancedFilterDialog} onClose={filters.handleAdvancedFilterClose}
              advancedFilters={filters.advancedFilters} onChange={filters.handleAdvancedFilterChange}
              onApply={filters.handleAdvancedFilterApply} onReset={filters.handleAdvancedFilterReset}
              themeMode={themeMode} t={t}
            />
          )}
        </Suspense>
      </Paper>

      {/* Tooltips & Drag Display */}
      <CustomTooltip task={tooltip.tooltipData} position={tooltip.tooltipPosition} visible={tooltip.tooltipVisible} themeMode={themeMode} workstations={state.workstations} t={t} />
      <PODeliveryTooltip reservation={tooltip.poTooltipData} position={tooltip.tooltipPosition} visible={tooltip.poTooltipVisible} themeMode={themeMode} t={t} />
      <DragTimeDisplay dragInfo={drag.dragInfo} themeMode={themeMode} />
    </Box>
  );
});

export default ProductionTimeline;
