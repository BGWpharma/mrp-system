import React, { useState, useMemo, useCallback } from 'react';
import {
  Box,
  CircularProgress,
  Typography,
  Alert,
  IconButton,
  Tooltip,
  useMediaQuery,
  useTheme,
  FormControl,
  Select,
  MenuItem,
  TextField,
  Chip,
  Popover,
  FormControlLabel,
  Checkbox,
  Button
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import FilterListIcon from '@mui/icons-material/FilterList';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import { KANBAN_COLUMN_ORDER, KANBAN_COLUMN_COLORS, translateStatus } from '../../../services/purchaseOrders';
import { useTranslation } from '../../../hooks/useTranslation';
import { usePOKanbanData } from './hooks/usePOKanbanData';
import { usePODragAndDrop } from './hooks/usePODragAndDrop';
import POKanbanColumn from './POKanbanColumn';
import POKanbanCard from './POKanbanCard';
import PODetailsModal from './PODetailsModal';

const toInputDate = (d) => {
  if (!d) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const VISIBLE_COLUMNS_KEY = 'po-kanban-visible-columns';

const POKanbanBoard = ({ initialOpenPOId = null }) => {
  const { t } = useTranslation('purchaseOrders');
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const {
    groupedOrders, loading, error, refresh, updateOrderLocally,
    totalCount, filteredCount,
    dateFrom, dateTo, setDateFrom, setDateTo
  } = usePOKanbanData();

  const { activeOrder, handleDragStart, handleDragEnd, handleDragCancel } = usePODragAndDrop({
    groupedOrders,
    updateOrderLocally,
    refresh
  });

  const [selectedOrderId, setSelectedOrderId] = useState(initialOpenPOId);
  const [columnMenuAnchor, setColumnMenuAnchor] = useState(null);

  const [visibleColumns, setVisibleColumns] = useState(() => {
    try {
      const saved = localStorage.getItem(VISIBLE_COLUMNS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const valid = KANBAN_COLUMN_ORDER.filter(col => parsed.includes(col));
        return valid.length > 0 ? valid : [...KANBAN_COLUMN_ORDER];
      }
    } catch { /* ignore */ }
    return [...KANBAN_COLUMN_ORDER];
  });

  const [mobileColumn, setMobileColumn] = useState(() =>
    visibleColumns[0] || KANBAN_COLUMN_ORDER[0]
  );

  const toggleColumnVisibility = useCallback((status) => {
    setVisibleColumns(prev => {
      const next = prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status].sort(
            (a, b) => KANBAN_COLUMN_ORDER.indexOf(a) - KANBAN_COLUMN_ORDER.indexOf(b)
          );
      if (next.length === 0) return prev;
      localStorage.setItem(VISIBLE_COLUMNS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const showAllColumns = useCallback(() => {
    const all = [...KANBAN_COLUMN_ORDER];
    setVisibleColumns(all);
    localStorage.setItem(VISIBLE_COLUMNS_KEY, JSON.stringify(all));
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleCardClick = (order) => {
    setSelectedOrderId(order.id);
  };

  const handleModalClose = () => {
    setSelectedOrderId(null);
  };

  const handleModalSave = () => {
    refresh();
  };

  const columnsToRender = isMobile ? [mobileColumn] : visibleColumns;

  const columnCounts = useMemo(() => {
    const counts = {};
    for (const status of KANBAN_COLUMN_ORDER) {
      counts[status] = (groupedOrders[status] || []).length;
    }
    return counts;
  }, [groupedOrders]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
        <CircularProgress />
        <Typography sx={{ ml: 2 }} color="text.secondary">
          {t('purchaseOrders.kanban.loading', 'Ładowanie tablicy...')}
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {t('purchaseOrders.kanban.error', 'Błąd podczas ładowania')}:{' '}{error}
      </Alert>
    );
  }

  return (
    <Box>
      {/* Toolbar z filtrami dat i odśwież */}
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1.5, flexWrap: 'wrap' }}>
        <FilterListIcon sx={{ fontSize: 20, color: 'text.secondary' }} />
        <TextField
          type="date"
          size="small"
          label={t('purchaseOrders.kanban.dateFrom')}
          value={toInputDate(dateFrom)}
          onChange={(e) => setDateFrom(e.target.value ? new Date(e.target.value) : null)}
          InputLabelProps={{ shrink: true }}
          sx={{ width: 160 }}
        />
        <TextField
          type="date"
          size="small"
          label={t('purchaseOrders.kanban.dateTo')}
          value={toInputDate(dateTo)}
          onChange={(e) => setDateTo(e.target.value ? new Date(e.target.value + 'T23:59:59') : null)}
          InputLabelProps={{ shrink: true }}
          sx={{ width: 160 }}
        />
        <Chip
          label={t('purchaseOrders.kanban.ordersCount', { filtered: filteredCount, total: totalCount })}
          size="small"
          variant="outlined"
          sx={{ fontSize: '0.75rem' }}
        />

        {isMobile && (
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <Select
              value={mobileColumn}
              onChange={(e) => setMobileColumn(e.target.value)}
            >
              {visibleColumns.map(status => (
                <MenuItem key={status} value={status}>
                  {translateStatus(status)} ({columnCounts[status] || 0})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        <Tooltip title={t('purchaseOrders.kanban.visibleColumns', 'Widoczne kolumny')}>
          <IconButton onClick={(e) => setColumnMenuAnchor(e.currentTarget)} size="small" sx={{ position: 'relative' }}>
            <ViewColumnIcon />
            {visibleColumns.length < KANBAN_COLUMN_ORDER.length && (
              <Box sx={{
                position: 'absolute', top: 2, right: 2,
                width: 8, height: 8, borderRadius: '50%',
                bgcolor: 'primary.main'
              }} />
            )}
          </IconButton>
        </Tooltip>
        <Popover
          open={Boolean(columnMenuAnchor)}
          anchorEl={columnMenuAnchor}
          onClose={() => setColumnMenuAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        >
          <Box sx={{ p: 2, minWidth: 220 }}>
            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 600 }}>
              {t('purchaseOrders.kanban.visibleColumns', 'Widoczne kolumny')}
            </Typography>
            {KANBAN_COLUMN_ORDER.map(status => (
              <FormControlLabel
                key={status}
                control={
                  <Checkbox
                    checked={visibleColumns.includes(status)}
                    onChange={() => toggleColumnVisibility(status)}
                    size="small"
                    disabled={visibleColumns.length === 1 && visibleColumns.includes(status)}
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{
                      width: 12, height: 12, borderRadius: '50%',
                      bgcolor: KANBAN_COLUMN_COLORS[status] || '#9E9E9E'
                    }} />
                    <Typography variant="body2">
                      {translateStatus(status)} ({columnCounts[status] || 0})
                    </Typography>
                  </Box>
                }
                sx={{ display: 'flex', width: '100%', m: 0 }}
              />
            ))}
            {visibleColumns.length < KANBAN_COLUMN_ORDER.length && (
              <Button
                size="small"
                onClick={showAllColumns}
                sx={{ mt: 1 }}
                fullWidth
              >
                {t('purchaseOrders.kanban.showAll', 'Pokaż wszystkie')}
              </Button>
            )}
          </Box>
        </Popover>

        <Tooltip title={t('purchaseOrders.kanban.refresh', 'Odśwież')}>
          <IconButton onClick={refresh} size="small">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </Box>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        modifiers={[restrictToWindowEdges]}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <Box sx={{
          display: 'flex',
          gap: 1,
          pb: 2,
          minHeight: 'calc(100vh - 280px)',
          alignItems: 'stretch',
          width: '100%'
        }}>
          {columnsToRender.map(status => (
            <POKanbanColumn
              key={status}
              status={status}
              orders={groupedOrders[status] || []}
              onCardClick={handleCardClick}
              isMobile={isMobile}
            />
          ))}
        </Box>

        <DragOverlay>
          {activeOrder ? (
            <POKanbanCard order={activeOrder} isDragOverlay />
          ) : null}
        </DragOverlay>
      </DndContext>

      {selectedOrderId && (
        <PODetailsModal
          open={!!selectedOrderId}
          orderId={selectedOrderId}
          onClose={handleModalClose}
          onSave={handleModalSave}
        />
      )}
    </Box>
  );
};

export default POKanbanBoard;
