import React, { useState, useMemo } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  LinearProgress,
  Collapse,
  IconButton,
  Tooltip,
  useTheme
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { format, isPast, differenceInDays } from 'date-fns';
import { pl } from 'date-fns/locale';

const formatCurrency = (value, currency = 'PLN') => {
  if (value == null) return '-';
  const symbols = { EUR: '€', USD: '$', PLN: 'zł', GBP: '£' };
  const num = Number(value);
  if (isNaN(num)) return '-';
  return `${num.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${symbols[currency] || currency}`;
};

const safeDate = (d) => {
  if (!d) return null;
  if (typeof d.toDate === 'function') return d.toDate();
  if (d instanceof Date) return d;
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? null : parsed;
};

const POKanbanCard = React.memo(({ order, onClick, isDragOverlay = false }) => {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: order.id,
    disabled: isDragOverlay
  });

  const style = isDragOverlay ? {} : {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1
  };

  const receivingProgress = useMemo(() => {
    if (!order.items || order.items.length === 0) return 0;
    const totalQty = order.items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
    const receivedQty = order.items.reduce((sum, i) => sum + (Number(i.received) || 0), 0);
    if (totalQty === 0) return 0;
    return Math.min(100, Math.round((receivedQty / totalQty) * 100));
  }, [order.items]);

  const deliveryDate = safeDate(order.expectedDeliveryDate);
  const deliveryInfo = useMemo(() => {
    if (!deliveryDate) return null;
    const now = new Date();
    const daysLeft = differenceInDays(deliveryDate, now);
    if (isPast(deliveryDate) && order.status !== 'completed' && order.status !== 'delivered') {
      return { label: format(deliveryDate, 'dd MMM', { locale: pl }), color: 'error', tooltip: `Opóźnione o ${Math.abs(daysLeft)} dni` };
    }
    if (daysLeft <= 3 && daysLeft >= 0) {
      return { label: format(deliveryDate, 'dd MMM', { locale: pl }), color: 'warning', tooltip: `Za ${daysLeft} dni` };
    }
    return { label: format(deliveryDate, 'dd MMM', { locale: pl }), color: 'default', tooltip: format(deliveryDate, 'dd MMMM yyyy', { locale: pl }) };
  }, [deliveryDate, order.status]);

  const supplierName = order.supplier?.name || order.supplierName || '-';

  const handleExpandClick = (e) => {
    e.stopPropagation();
    setExpanded(prev => !prev);
  };

  const handleCardClick = (e) => {
    if (onClick) onClick(order);
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      sx={{
        flexShrink: 0,
        cursor: isDragOverlay ? 'grabbing' : 'pointer',
        '&:hover': isDragOverlay ? {} : {
          boxShadow: theme.shadows[4],
          transform: 'translateY(-1px)'
        },
        transition: 'box-shadow 0.2s, transform 0.15s',
        ...(isDragOverlay ? { boxShadow: theme.shadows[8], transform: 'rotate(2deg)' } : {})
      }}
      onClick={handleCardClick}
    >
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: '0.8rem' }}>
            {order.number || 'Brak numeru'}
          </Typography>
          <IconButton
            size="small"
            onClick={handleExpandClick}
            sx={{
              p: 0.25,
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s'
            }}
          >
            <ExpandMoreIcon fontSize="small" />
          </IconButton>
        </Box>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, lineHeight: 1.3 }}>
          {supplierName}
        </Typography>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
            {formatCurrency(order.totalValue || order.totalGross, order.currency)}
          </Typography>
          {deliveryInfo && (
            <Tooltip title={deliveryInfo.tooltip}>
              <Chip
                icon={<LocalShippingIcon sx={{ fontSize: '0.85rem !important' }} />}
                label={deliveryInfo.label}
                size="small"
                color={deliveryInfo.color}
                variant="outlined"
                sx={{ height: 22, '& .MuiChip-label': { px: 0.5, fontSize: '0.7rem' } }}
              />
            </Tooltip>
          )}
        </Box>

        {receivingProgress > 0 && (
          <Box sx={{ mt: 0.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                Przyjęto
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                {receivingProgress}%
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={receivingProgress}
              sx={{
                height: 4,
                borderRadius: 2,
                bgcolor: theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                '& .MuiLinearProgress-bar': {
                  bgcolor: receivingProgress === 100 ? 'success.main' : 'primary.main'
                }
              }}
            />
          </Box>
        )}

        <Collapse in={expanded} timeout="auto" unmountOnExit>
          <Box sx={{ mt: 1, borderTop: 1, borderColor: 'divider', pt: 1 }}>
            {order.items && order.items.length > 0 ? (
              order.items.map((item, idx) => {
                const received = Number(item.received) || 0;
                const qty = Number(item.quantity) || 0;
                const fullyReceived = qty > 0 && received >= qty;
                const partiallyReceived = received > 0 && received < qty;

                return (
                  <Box key={item.id || idx} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                    {fullyReceived ? (
                      <CheckCircleIcon sx={{ fontSize: 14, color: 'success.main' }} />
                    ) : partiallyReceived ? (
                      <HourglassEmptyIcon sx={{ fontSize: 14, color: 'warning.main' }} />
                    ) : (
                      <RadioButtonUncheckedIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
                    )}
                    <Typography variant="caption" sx={{ flex: 1, lineHeight: 1.2, fontSize: '0.7rem' }}>
                      {item.name || 'Pozycja'}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                      {received}/{qty} {item.unit || 'szt'}
                    </Typography>
                  </Box>
                );
              })
            ) : (
              <Typography variant="caption" color="text.secondary">
                Brak pozycji
              </Typography>
            )}
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
});

POKanbanCard.displayName = 'POKanbanCard';

export default POKanbanCard;
