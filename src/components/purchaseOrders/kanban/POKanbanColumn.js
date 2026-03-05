import React from 'react';
import { Box, Paper, Typography, Badge, useTheme } from '@mui/material';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { translateStatus, KANBAN_COLUMN_COLORS } from '../../../services/purchaseOrders';
import { useTranslation } from '../../../hooks/useTranslation';
import POKanbanCard from './POKanbanCard';

const POKanbanColumn = React.memo(({ status, orders, onCardClick, isMobile }) => {
  const { t } = useTranslation('purchaseOrders');
  const theme = useTheme();
  const color = KANBAN_COLUMN_COLORS[status] || '#9E9E9E';

  const { setNodeRef, isOver } = useDroppable({
    id: `column-${status}`,
    data: { type: 'column', status }
  });

  const orderIds = orders.map(o => o.id);

  return (
    <Paper
      sx={{
        flex: isMobile ? 'none' : '1 1 0%',
        width: isMobile ? '100%' : 'auto',
        minWidth: isMobile ? '100%' : 180,
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 'calc(100vh - 300px)',
        borderTop: `3px solid ${color}`,
        bgcolor: isOver
          ? (theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)')
          : 'background.paper',
        transition: 'background-color 0.2s'
      }}
      elevation={isOver ? 3 : 1}
    >
      <Box sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 1.5,
        py: 1,
        borderBottom: 1,
        borderColor: 'divider'
      }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600, color }}>
          {translateStatus(status)}
        </Typography>
        <Badge
          badgeContent={orders.length}
          color="default"
          sx={{
            '& .MuiBadge-badge': {
              bgcolor: color,
              color: '#fff',
              fontSize: '0.7rem',
              minWidth: 20,
              height: 20
            }
          }}
        >
          <Box sx={{ width: 8 }} />
        </Badge>
      </Box>

      <SortableContext items={orderIds} strategy={verticalListSortingStrategy}>
        <Box
          ref={setNodeRef}
          sx={{
            p: 1,
            overflowY: 'auto',
            flexGrow: 1,
            minHeight: 100,
            display: 'flex',
            flexDirection: 'column',
            gap: 1
          }}
        >
          {orders.length === 0 ? (
            <Box sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 80,
              border: '2px dashed',
              borderColor: isOver ? color : 'divider',
              borderRadius: 1,
              opacity: 0.5
            }}>
              <Typography variant="caption" color="text.secondary">
                {isOver ? t('purchaseOrders.kanban.dropHere') : t('purchaseOrders.kanban.noOrders')}
              </Typography>
            </Box>
          ) : (
            orders.map(order => (
              <POKanbanCard
                key={order.id}
                order={order}
                onClick={() => onCardClick(order)}
              />
            ))
          )}
        </Box>
      </SortableContext>
    </Paper>
  );
});

POKanbanColumn.displayName = 'POKanbanColumn';

export default POKanbanColumn;
