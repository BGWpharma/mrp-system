import React, { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  LinearProgress,
  Collapse,
  IconButton,
  Tooltip
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import InventoryIcon from '@mui/icons-material/Inventory';
import { format, parseISO, isValid } from 'date-fns';
import { pl } from 'date-fns/locale';
import { useTranslation } from '../../../../hooks/useTranslation';

const formatCurrency = (value, currency = 'PLN', precision = 2) => {
  if (value == null) return '-';
  const symbols = { EUR: '€', USD: '$', PLN: 'zł', GBP: '£' };
  const num = Number(value);
  if (isNaN(num)) return '-';
  return `${num.toLocaleString('pl-PL', { minimumFractionDigits: precision, maximumFractionDigits: precision })} ${symbols[currency] || currency}`;
};

const safeFormatDate = (date) => {
  if (!date) return '-';
  try {
    let d;
    if (date instanceof Date) d = date;
    else if (typeof date === 'string') d = parseISO(date);
    else if (date?.toDate) d = date.toDate();
    else if (date?.seconds) d = new Date(date.seconds * 1000);
    else return '-';
    if (!isValid(d)) return '-';
    return format(d, 'dd MMM yyyy', { locale: pl });
  } catch {
    return '-';
  }
};

const ItemRow = ({ item, index, currency, poCurrency, batches, reinvoicedAmounts, t }) => {
  const [expanded, setExpanded] = useState(false);
  const qty = Number(item.quantity) || 0;
  const received = Number(item.received) || 0;
  const fullyReceived = qty > 0 && received >= qty;
  const partiallyReceived = received > 0 && received < qty;
  const fulfilledPct = qty > 0 ? Math.round((received / qty) * 100) : 0;

  const unitPrice = parseFloat(item.unitPrice) || 0;
  const discount = parseFloat(item.discount) || 0;
  const discountMultiplier = (100 - discount) / 100;
  const unitPriceAfterDiscount = unitPrice * discountMultiplier;

  const itemBatches = batches.filter(b =>
    (b.purchaseOrderDetails?.itemPoId === item.id) ||
    (b.sourceDetails?.itemPoId === item.id)
  );

  const rowBg = fullyReceived
    ? 'rgba(76, 175, 80, 0.08)'
    : partiallyReceived
      ? 'rgba(255, 152, 0, 0.08)'
      : 'inherit';

  const reinvoicedData = reinvoicedAmounts?.items?.[item.id];
  const reinvoicedAmount = reinvoicedData?.totalReinvoiced || 0;
  const itemValue = parseFloat(item.totalPrice) || 0;
  const isFullyReinvoiced = reinvoicedAmount > 0 && Math.abs(reinvoicedAmount - itemValue) < 0.01;

  return (
    <>
      <TableRow sx={{ bgcolor: rowBg, '&:hover': { bgcolor: 'action.hover' } }}>
        {/* Status icon */}
        <TableCell sx={{ py: 1, width: 30, pl: 1 }}>
          {fullyReceived ? (
            <CheckCircleIcon sx={{ fontSize: 18, color: 'success.main' }} />
          ) : partiallyReceived ? (
            <HourglassEmptyIcon sx={{ fontSize: 18, color: 'warning.main' }} />
          ) : (
            <RadioButtonUncheckedIcon sx={{ fontSize: 18, color: 'text.disabled' }} />
          )}
        </TableCell>

        {/* Nazwa produktu */}
        <TableCell sx={{ py: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {item.name || t('purchaseOrders.kanban.itemFallback', { index: index + 1 })}
            </Typography>
            {itemBatches.length > 0 && (
              <IconButton size="small" onClick={() => setExpanded(!expanded)} sx={{ ml: 0.5 }}>
                <ExpandMoreIcon sx={{ fontSize: 16, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              </IconButton>
            )}
          </Box>
        </TableCell>

        {/* Ilość */}
        <TableCell align="right" sx={{ py: 1 }}>
          {qty}
        </TableCell>

        {/* Jednostka */}
        <TableCell sx={{ py: 1 }}>
          {item.unit || 'szt'}
        </TableCell>

        {/* Cena jedn. */}
        <TableCell align="right" sx={{ py: 1 }}>
          {formatCurrency(unitPrice, currency, 6)}
        </TableCell>

        {/* Rabat */}
        <TableCell align="right" sx={{ py: 1 }}>
          {discount > 0 ? `${discount}%` : '-'}
        </TableCell>

        {/* Cena po rabacie */}
        <TableCell align="right" sx={{ py: 1 }}>
          <Box sx={{ color: discount > 0 ? 'success.main' : 'inherit', fontWeight: discount > 0 ? 600 : 400 }}>
            {formatCurrency(unitPriceAfterDiscount, currency, 6)}
          </Box>
        </TableCell>

        {/* Wartość netto */}
        <TableCell align="right" sx={{ py: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {formatCurrency(item.totalPrice, currency)}
          </Typography>
        </TableCell>

        {/* Kwota oryg. */}
        <TableCell align="right" sx={{ py: 1 }}>
          {item.currency && item.currency !== poCurrency && item.originalUnitPrice
            ? formatCurrency(item.originalUnitPrice * qty, item.currency)
            : item.currency === 'EUR' && poCurrency === 'EUR'
              ? formatCurrency(item.totalPrice, item.currency)
              : '-'}
        </TableCell>

        {/* Termin płatności */}
        <TableCell align="right" sx={{ py: 1 }}>
          {safeFormatDate(item.paymentDueDate)}
        </TableCell>

        {/* Plan. data dost. */}
        <TableCell align="right" sx={{ py: 1 }}>
          {safeFormatDate(item.plannedDeliveryDate)}
        </TableCell>

        {/* Rzecz. data dost. */}
        <TableCell align="right" sx={{ py: 1 }}>
          {safeFormatDate(item.actualDeliveryDate)}
        </TableCell>

        {/* Odebrano */}
        <TableCell align="right" sx={{ py: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: received > 0 ? 500 : 400 }}>
            {received > 0 ? `${received} (${fulfilledPct}%)` : '0'}
          </Typography>
        </TableCell>

        {/* Refakturowane */}
        <TableCell align="right" sx={{ py: 1 }}>
          {reinvoicedAmount > 0 ? (
            <Tooltip
              title={
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                    {t('purchaseOrders.kanban.items.reinvoicedToInvoices', { count: reinvoicedData.invoices?.length || 0 })}
                  </Typography>
                  {reinvoicedData.invoices?.map((inv, i) => (
                    <Typography key={i} variant="body2">
                      • {inv.invoiceNumber} → {inv.customerName || t('purchaseOrders.kanban.items.noClient')}: {formatCurrency(inv.itemValue, poCurrency)}
                    </Typography>
                  ))}
                </Box>
              }
            >
              <Typography
                sx={{
                  color: isFullyReinvoiced ? 'success.main' : 'error.main',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                {formatCurrency(reinvoicedAmount, poCurrency)}
              </Typography>
            </Tooltip>
          ) : (
            <Typography color="text.secondary">—</Typography>
          )}
        </TableCell>
      </TableRow>

      {/* Rozwinięte partie */}
      {itemBatches.length > 0 && (
        <TableRow>
          <TableCell colSpan={14} sx={{ py: 0, borderBottom: expanded ? undefined : 'none' }}>
            <Collapse in={expanded} timeout="auto" unmountOnExit>
              <Box sx={{ py: 1, pl: 5 }}>
                <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                  <InventoryIcon sx={{ fontSize: 14, mr: 0.5, verticalAlign: 'middle' }} />
                  {t('purchaseOrders.kanban.items.relatedBatches', { count: itemBatches.length })}
                </Typography>
                {itemBatches.map((batch, bIdx) => (
                  <Box key={batch.id || bIdx} sx={{ display: 'flex', gap: 2, mb: 0.5, alignItems: 'center' }}>
                    <Chip label={batch.batchNumber || batch.lotNumber || 'LOT?'} size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                    <Typography variant="caption">{batch.quantity} {item.unit || 'szt'}</Typography>
                    {batch.expiryDate && (
                      <Typography variant="caption" color="text.secondary">
                        {t('purchaseOrders.kanban.items.expiry')} {new Date(batch.expiryDate?.seconds ? batch.expiryDate.seconds * 1000 : batch.expiryDate).toLocaleDateString('pl')}
                      </Typography>
                    )}
                    {batch.warehouseName && (
                      <Chip label={batch.warehouseName} size="small" sx={{ fontSize: '0.65rem', height: 18 }} />
                    )}
                  </Box>
                ))}
              </Box>
            </Collapse>
          </TableCell>
        </TableRow>
      )}
    </>
  );
};

const POModalItemsTab = ({ purchaseOrder, relatedBatches, reinvoicedAmounts }) => {
  const { t } = useTranslation('purchaseOrders');
  const po = purchaseOrder;
  const items = useMemo(() => po?.items || [], [po?.items]);
  const additionalCosts = po?.additionalCostsItems || [];
  const currency = po?.currency || 'EUR';

  const totalProgress = useMemo(() => {
    const totalQty = items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
    const receivedQty = items.reduce((sum, i) => sum + (Number(i.received) || 0), 0);
    if (totalQty === 0) return 0;
    return Math.min(100, Math.round((receivedQty / totalQty) * 100));
  }, [items]);

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {t('purchaseOrders.kanban.items.title', { count: items.length })}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 200 }}>
          <Typography variant="caption" color="text.secondary">{t('purchaseOrders.kanban.items.receivedTotal')}</Typography>
          <LinearProgress
            variant="determinate"
            value={totalProgress}
            sx={{ flex: 1, height: 8, borderRadius: 4 }}
          />
          <Typography variant="caption" sx={{ fontWeight: 600 }}>{totalProgress}%</Typography>
        </Box>
      </Box>

      <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 1100 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: 30 }}></TableCell>
              <TableCell>{t('purchaseOrders.details.table.productName')}</TableCell>
              <TableCell align="right">{t('purchaseOrders.details.table.quantity')}</TableCell>
              <TableCell>{t('purchaseOrders.details.table.unit')}</TableCell>
              <TableCell align="right">{t('purchaseOrders.details.table.unitPrice')}</TableCell>
              <TableCell align="right">{t('purchaseOrders.details.table.discount')}</TableCell>
              <TableCell align="right">{t('purchaseOrders.details.table.unitPriceAfterDiscount')}</TableCell>
              <TableCell align="right">{t('purchaseOrders.details.table.netValue')}</TableCell>
              <TableCell align="right">{t('purchaseOrders.details.table.originalAmount')}</TableCell>
              <TableCell align="right">{t('purchaseOrders.kanban.items.paymentDueDate')}</TableCell>
              <TableCell align="right">{t('purchaseOrders.details.table.plannedDeliveryDate')}</TableCell>
              <TableCell align="right">{t('purchaseOrders.details.table.actualDeliveryDate')}</TableCell>
              <TableCell align="right">{t('purchaseOrders.details.table.received')}</TableCell>
              <TableCell align="right">{t('purchaseOrders.kanban.items.reinvoiced')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item, idx) => (
              <ItemRow
                key={item.id || idx}
                item={item}
                index={idx}
                currency={currency}
                poCurrency={currency}
                batches={relatedBatches || []}
                reinvoicedAmounts={reinvoicedAmounts}
                t={t}
              />
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={14} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">{t('purchaseOrders.kanban.items.noItems')}</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {additionalCosts.length > 0 && (
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
            {t('purchaseOrders.kanban.items.additionalCosts', { count: additionalCosts.length })}
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('purchaseOrders.kanban.items.name')}</TableCell>
                  <TableCell align="right">{t('purchaseOrders.kanban.items.value')}</TableCell>
                  <TableCell align="right">VAT</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {additionalCosts.map((cost, idx) => (
                  <TableRow key={cost.id || idx}>
                    <TableCell>{cost.name || cost.description || t('purchaseOrders.kanban.items.costFallback', { index: idx + 1 })}</TableCell>
                    <TableCell align="right">{formatCurrency(cost.value, currency)}</TableCell>
                    <TableCell align="right">{cost.vatRate ? `${cost.vatRate}%` : '0%'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}
    </Box>
  );
};

export default POModalItemsTab;
