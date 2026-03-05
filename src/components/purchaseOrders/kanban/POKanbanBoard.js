import React, { useState, useMemo } from 'react';
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
  Chip
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import FilterListIcon from '@mui/icons-material/FilterList';
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
import { KANBAN_COLUMN_ORDER, translateStatus } from '../../../services/purchaseOrders';
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
  const [mobileColumn, setMobileColumn] = useState(KANBAN_COLUMN_ORDER[0]);

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

  const columnsToRender = isMobile ? [mobileColumn] : KANBAN_COLUMN_ORDER;

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
          label="Od"
          value={toInputDate(dateFrom)}
          onChange={(e) => setDateFrom(e.target.value ? new Date(e.target.value) : null)}
          InputLabelProps={{ shrink: true }}
          sx={{ width: 160 }}
        />
        <TextField
          type="date"
          size="small"
          label="Do"
          value={toInputDate(dateTo)}
          onChange={(e) => setDateTo(e.target.value ? new Date(e.target.value + 'T23:59:59') : null)}
          InputLabelProps={{ shrink: true }}
          sx={{ width: 160 }}
        />
        <Chip
          label={`${filteredCount} / ${totalCount} zamówień`}
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
              {KANBAN_COLUMN_ORDER.map(status => (
                <MenuItem key={status} value={status}>
                  {translateStatus(status)} ({columnCounts[status] || 0})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

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
