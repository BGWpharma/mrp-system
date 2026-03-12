import React, { useCallback } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Divider,
  Table,
  TableContainer,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  IconButton,
  CircularProgress,
  Button,
  Tooltip,
  Link
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Info as InfoIcon,
  Receipt as ReceiptIcon
} from '@mui/icons-material';
import { formatCurrency } from '../../../utils/formatting';
import { formatDate } from '../../../utils/dateUtils';
import { useTranslation } from '../../../hooks/useTranslation';
import { calculateItemTotalValue } from '../../../hooks/orders/useOrderData';
import { mb2 } from '../../../styles/muiCommonStyles';

const getProductionStatusColor = (status) => {
  switch (status) {
    case 'Nowe': return 'default';
    case 'Zaplanowane': return 'primary';
    case 'W trakcie': return 'secondary';
    case 'Wstrzymane': return 'warning';
    case 'Zakończone': return 'success';
    case 'Anulowane': return 'error';
    case 'Potwierdzenie zużycia': return 'info';
    default: return 'default';
  }
};

const OrderProductsTable = ({
  order,
  orderId,
  invoicedAmounts,
  proformaAmounts,
  getTaskCompletionDate,
  isRefreshingCmr,
  onRefreshShippedQuantities,
  onRefreshProductionCosts,
  setInvoicePopoverAnchor,
  setSelectedInvoiceData,
  calculateOrderTotalValue
}) => {
  const { t } = useTranslation('orders');
  const navigate = useNavigate();

  // --- getProductionStatus ---
  const getProductionStatus = useCallback((item, productionTasks) => {
    if (item.productionTaskId && item.productionStatus) {
      const statusColor = getProductionStatusColor(item.productionStatus);
      
      const handleClick = (e) => {
        e.preventDefault();
        navigate(`/production/tasks/${item.productionTaskId}`);
      };
      
      return (
        <Tooltip title={`Przejdź do zadania produkcyjnego ${item.productionTaskNumber || item.productionTaskId}`}>
          <Chip
            label={item.productionStatus}
            size="small"
            color={statusColor}
            clickable
            component="a"
            href={`/production/tasks/${item.productionTaskId}`}
            onClick={handleClick}
            sx={{ cursor: 'pointer', textDecoration: 'none' }}
          />
        </Tooltip>
      );
    }
    
    if (!productionTasks || !Array.isArray(productionTasks) || productionTasks.length === 0) {
      return (
        <Tooltip title="Kliknij, aby utworzyć zadanie produkcyjne">
          <Chip 
            label={t('orderDetails.productionStatus.noTasks')} 
            size="small" 
            color="default"
            clickable
            component={RouterLink}
            to="/production/create-from-order"
            state={{ orderId }}
            sx={{ cursor: 'pointer' }}
          />
        </Tooltip>
      );
    }

    const tasksForItem = productionTasks.filter(task => 
      task.productId === item.id || 
      task.productName?.toLowerCase() === item.name?.toLowerCase()
    );

    if (tasksForItem.length === 0) {
      return (
        <Tooltip title="Kliknij, aby utworzyć zadanie produkcyjne">
          <Chip 
            label={t('orderDetails.productionStatus.noTasks')} 
            size="small" 
            color="default"
            clickable
            component={RouterLink}
            to="/production/create-from-order"
            state={{ orderId }}
            sx={{ cursor: 'pointer' }}
          />
        </Tooltip>
      );
    }

    const allCompleted = tasksForItem.every(task => task.status === 'Zakończone');
    const allCancelled = tasksForItem.every(task => task.status === 'Anulowane');
    const anyInProgress = tasksForItem.some(task => task.status === 'W trakcie' || task.status === 'Wstrzymane');
    const anyPlanned = tasksForItem.some(task => task.status === 'Zaplanowane');

    if (tasksForItem.length === 1) {
      const task = tasksForItem[0];
      let statusColor = 'default';
      if (task.status === 'Zakończone') statusColor = 'success';
      else if (task.status === 'Anulowane') statusColor = 'error';
      else if (task.status === 'W trakcie' || task.status === 'Wstrzymane') statusColor = 'warning';
      else if (task.status === 'Zaplanowane') statusColor = 'primary';
      
      return (
        <Tooltip title={`Przejdź do zadania produkcyjnego ${task.moNumber || task.id}`}>
          <Chip
            label={task.status}
            size="small"
            color={statusColor}
            clickable
            component={RouterLink}
            to={`/production/tasks/${task.id}`}
            sx={{ cursor: 'pointer', textDecoration: 'none' }}
          />
        </Tooltip>
      );
    }

    if (allCompleted) return <Chip label={t('orderDetails.productionStatus.completed', { count: tasksForItem.length })} size="small" color="success" />;
    if (allCancelled) return <Chip label={t('orderDetails.productionStatus.cancelled', { count: tasksForItem.length })} size="small" color="error" />;
    if (anyInProgress) return <Chip label={t('orderDetails.productionStatus.inProgress', { count: tasksForItem.length })} size="small" color="warning" />;
    if (anyPlanned) return <Chip label={t('orderDetails.productionStatus.planned', { count: tasksForItem.length })} size="small" color="primary" />;
    return <Chip label={t('orderDetails.productionStatus.mixed', { count: tasksForItem.length })} size="small" color="default" />;
  }, [navigate, orderId, t]);

  // --- CSV Export ---
  const formatCSVValue = (value) => {
    if (value === null || value === undefined) return '""';
    const stringValue = String(value);
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r') || stringValue.includes(' ')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return `"${stringValue}"`;
  };

  const handleExportItemsToCSV = () => {
    try {
      if (!order || !order.items || order.items.length === 0) return;

      const csvHeaders = [
        'Lp.', 'Nazwa produktu', 'Ilość zamówiona', 'Jednostka', 'Ilość wysłana',
        'Cena jednostkowa', 'Wartość pozycji', 'Zafakturowana kwota', 'Zaliczka (proforma)',
        'ETM', 'Koszt produkcji', 'Zysk', 'Ostatni CMR', 'Status produkcji',
        'Lista cen', 'Numer zadania produkcyjnego'
      ];

      const csvData = order.items.map((item, index) => {
        const itemTotalValue = (parseFloat(item.quantity) || 0) * (parseFloat(item.price) || 0);
        const shippedQuantity = item.shippedQuantity || 0;
        const lastCmr = item.lastCmrNumber || (item.cmrHistory && item.cmrHistory.length > 0 ? 
          item.cmrHistory[item.cmrHistory.length - 1].cmrNumber : '-');
        
        const itemId = item.id || `${orderId}_item_${index}`;
        const invoicedData = invoicedAmounts[itemId];
        const invoicedAmount = invoicedData && invoicedData.totalInvoiced > 0 ? invoicedData.totalInvoiced : 0;
        const proformaData = proformaAmounts[itemId];
        const proformaAmount = proformaData && proformaData.totalProforma > 0 ? proformaData.totalProforma : 0;
        
        const completionInfo = getTaskCompletionDate(item);
        let etmDate = '-';
        if (completionInfo?.date) {
          try {
            let dateObj;
            if (completionInfo.date?.toDate && typeof completionInfo.date.toDate === 'function') dateObj = completionInfo.date.toDate();
            else if (typeof completionInfo.date === 'string') dateObj = new Date(completionInfo.date);
            else if (completionInfo.date instanceof Date) dateObj = completionInfo.date;
            if (dateObj && !isNaN(dateObj.getTime())) etmDate = formatDate(dateObj, false);
          } catch (error) {
            console.error('Błąd formatowania daty ETM w CSV:', error);
          }
        }
        
        const productionCost = parseFloat(item.productionCost) || 0;
        const profit = itemTotalValue - productionCost;
        
        return [
          formatCSVValue(index + 1), formatCSVValue(item.name || ''),
          formatCSVValue(`${item.quantity || 0}`), formatCSVValue(item.unit || ''),
          formatCSVValue(`${shippedQuantity}`),
          formatCSVValue(formatCurrency(item.price).replace(/\s/g, '')),
          formatCSVValue(formatCurrency(itemTotalValue).replace(/\s/g, '')),
          formatCSVValue(formatCurrency(invoicedAmount).replace(/\s/g, '')),
          formatCSVValue(formatCurrency(proformaAmount).replace(/\s/g, '')),
          formatCSVValue(etmDate),
          formatCSVValue(formatCurrency(productionCost).replace(/\s/g, '')),
          formatCSVValue(formatCurrency(profit).replace(/\s/g, '')),
          formatCSVValue(lastCmr),
          formatCSVValue(item.productionStatus || '-'),
          formatCSVValue(item.priceList || '-'),
          formatCSVValue(item.productionTaskNumber || '-')
        ];
      });

      const csvContent = [
        csvHeaders.map(h => formatCSVValue(h)).join(','),
        ...csvData.map(row => row.join(','))
      ].join('\n');

      const csvBlob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(csvBlob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `pozycje_zamowienia_${order.orderNumber || order.id}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Błąd podczas eksportu pozycji do CSV:', error);
    }
  };

  // --- Render ETM cell ---
  const renderETMCell = (item) => {
    const completionInfo = getTaskCompletionDate(item);
    
    if (!completionInfo) {
      return <Typography variant="body2" color="text.secondary">-</Typography>;
    }
    
    let formattedDate = '-';
    try {
      let dateObj;
      if (completionInfo.date?.toDate && typeof completionInfo.date.toDate === 'function') dateObj = completionInfo.date.toDate();
      else if (typeof completionInfo.date === 'string') dateObj = new Date(completionInfo.date);
      else if (completionInfo.date instanceof Date) dateObj = completionInfo.date;
      
      if (dateObj && !isNaN(dateObj.getTime())) {
        formattedDate = formatDate(dateObj, false);
      }
    } catch (error) {
      console.error('Błąd formatowania daty ETM:', error);
    }
    
    return (
      <Tooltip title={completionInfo.isActual ? 
        'Rzeczywista data zakończenia produkcji' : 
        'Planowana data zakończenia produkcji'}>
        <Typography 
          variant="body2" 
          sx={{ 
            fontWeight: completionInfo.isActual ? 'bold' : 'normal',
            color: completionInfo.isActual ? 'success.main' : 'text.primary'
          }}
        >
          {formattedDate}
        </Typography>
      </Tooltip>
    );
  };

  // --- Render invoiced amount cell ---
  const renderInvoicedCell = (item, index) => {
    const itemId = item.id || `${orderId}_item_${index}`;
    const invoicedData = invoicedAmounts[itemId];
    
    if (invoicedData && invoicedData.totalInvoiced > 0) {
      return (
        <Tooltip title={t('orderDetails.tooltips.clickToSeeInvoiceDetails', { count: invoicedData.invoices.length })}>
          <Typography 
            sx={{ 
              fontWeight: 'medium', color: 'success.main', cursor: 'pointer',
              '&:hover': { textDecoration: 'underline', color: 'success.dark' }
            }}
            onClick={(e) => {
              setInvoicePopoverAnchor(e.currentTarget);
              setSelectedInvoiceData({
                itemName: item.name,
                invoices: invoicedData.invoices,
                totalInvoiced: invoicedData.totalInvoiced
              });
            }}
          >
            {formatCurrency(invoicedData.totalInvoiced)}
          </Typography>
        </Tooltip>
      );
    }
    return <Typography variant="body2" color="text.secondary">0,00 €</Typography>;
  };

  // --- Render proforma amount cell ---
  const renderProformaCell = (item, index) => {
    const itemId = item.id || `${orderId}_item_${index}`;
    const proformaData = proformaAmounts[itemId];
    
    if (proformaData && proformaData.totalProforma > 0) {
      return (
        <Tooltip title={`Kliknij, aby zobaczyć szczegóły (${proformaData.proformas.length} ${proformaData.proformas.length === 1 ? 'proforma' : 'proform'})`}>
          <Typography 
            sx={{ 
              fontWeight: 'medium', color: 'info.main', cursor: 'pointer',
              '&:hover': { textDecoration: 'underline', color: 'info.dark' }
            }}
            onClick={(e) => {
              setInvoicePopoverAnchor(e.currentTarget);
              setSelectedInvoiceData({
                itemName: item.name,
                invoices: proformaData.proformas.map(p => ({
                  invoiceId: p.proformaId,
                  invoiceNumber: p.proformaNumber,
                  itemValue: p.itemValue,
                  quantity: p.quantity
                })),
                totalInvoiced: proformaData.totalProforma,
                isProforma: true
              });
            }}
          >
            {formatCurrency(proformaData.totalProforma)}
          </Typography>
        </Tooltip>
      );
    }
    return <Typography variant="body2" color="text.secondary">0,00 €</Typography>;
  };

  // --- Summary row helpers ---
  const renderSummaryInvoiced = () => {
    let totalInvoiced = 0;
    const invoicesMap = new Map();
    
    order.items?.forEach((item, index) => {
      const itemId = item.id || `${orderId}_item_${index}`;
      const invoicedData = invoicedAmounts[itemId];
      if (invoicedData && invoicedData.totalInvoiced > 0) {
        totalInvoiced += invoicedData.totalInvoiced;
        invoicedData.invoices.forEach(inv => {
          if (invoicesMap.has(inv.invoiceId)) {
            const existing = invoicesMap.get(inv.invoiceId);
            existing.itemValue += inv.itemValue;
            existing.quantity += inv.quantity;
          } else {
            invoicesMap.set(inv.invoiceId, { ...inv });
          }
        });
      }
    });
    
    const allInvoices = Array.from(invoicesMap.values());
    
    if (totalInvoiced > 0) {
      return (
        <Tooltip title={t('orderDetails.tooltips.clickToSeeAllInvoices')}>
          <Typography
            sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
            onClick={(e) => {
              setInvoicePopoverAnchor(e.currentTarget);
              setSelectedInvoiceData({
                itemName: t('orderDetails.invoicePopover.allOrderItems'),
                invoices: allInvoices,
                totalInvoiced
              });
            }}
          >
            {formatCurrency(totalInvoiced)}
          </Typography>
        </Tooltip>
      );
    }
    return formatCurrency(totalInvoiced);
  };

  const renderSummaryProforma = () => {
    let totalProforma = 0;
    const proformasMap = new Map();
    
    order.items?.forEach((item, index) => {
      const itemId = item.id || `${orderId}_item_${index}`;
      const proformaData = proformaAmounts[itemId];
      if (proformaData && proformaData.totalProforma > 0) {
        totalProforma += proformaData.totalProforma;
        proformaData.proformas.forEach(pf => {
          if (proformasMap.has(pf.proformaId)) {
            const existing = proformasMap.get(pf.proformaId);
            existing.itemValue += pf.itemValue;
            existing.quantity += pf.quantity;
          } else {
            proformasMap.set(pf.proformaId, { 
              invoiceId: pf.proformaId,
              invoiceNumber: pf.proformaNumber,
              itemValue: pf.itemValue,
              quantity: pf.quantity
            });
          }
        });
      }
    });
    
    const allProformas = Array.from(proformasMap.values());
    
    if (totalProforma > 0) {
      return (
        <Tooltip title="Kliknij, aby zobaczyć wszystkie proformy">
          <Typography
            sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
            onClick={(e) => {
              setInvoicePopoverAnchor(e.currentTarget);
              setSelectedInvoiceData({
                itemName: 'Wszystkie pozycje zamówienia',
                invoices: allProformas,
                totalInvoiced: totalProforma,
                isProforma: true
              });
            }}
          >
            {formatCurrency(totalProforma)}
          </Typography>
        </Tooltip>
      );
    }
    return formatCurrency(totalProforma);
  };

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">{t('orderDetails.sections.products')}</Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Tooltip title={t('orderDetails.tooltips.recalculateShippedQuantities')}>
            <Button
              variant="outlined"
              size="small"
              onClick={onRefreshShippedQuantities}
              disabled={isRefreshingCmr || !order || !order.id}
              startIcon={isRefreshingCmr ? <CircularProgress size={16} /> : <RefreshIcon />}
              color="primary"
            >
              {isRefreshingCmr ? t('orderDetails.actions.recalculating') : t('orderDetails.actions.recalculateShipped')}
            </Button>
          </Tooltip>
          <Button
            variant="outlined"
            size="small"
            onClick={handleExportItemsToCSV}
            disabled={!order || !order.items || order.items.length === 0}
          >
            Eksportuj do CSV
          </Button>
        </Box>
      </Box>
      <Divider sx={mb2} />
      <TableContainer sx={{ overflowX: 'auto' }}>
      <Table size="small" sx={{ '& .MuiTableCell-root': { px: 1, py: 0.75, fontSize: '0.8rem' } }}>
        <TableHead>
          <TableRow sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', '& .MuiTableCell-root': { fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap', lineHeight: 1.2 } }}>
            <TableCell sx={{ color: 'inherit' }}>{t('orderDetails.table.product')}</TableCell>
            <TableCell sx={{ color: 'inherit' }} align="right">
              <Tooltip title="Ilość może być automatycznie skorygowana na podstawie rzeczywistej produkcji">
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.25 }}>
                  {t('orderDetails.table.quantity')}
                  <InfoIcon sx={{ fontSize: '0.85rem', opacity: 0.7 }} />
                </Box>
              </Tooltip>
            </TableCell>
            <TableCell sx={{ color: 'inherit', minWidth: 120 }} align="right">{t('orderDetails.table.shipped')}</TableCell>
            <TableCell sx={{ color: 'inherit' }} align="right">{t('orderDetails.table.price')}</TableCell>
            <TableCell sx={{ color: 'inherit' }} align="right">{t('orderDetails.table.value')}</TableCell>
            <TableCell sx={{ color: 'inherit', whiteSpace: 'normal' }} align="right">
              <Box sx={{ lineHeight: 1.3 }}>
                <Box>FK</Box>
                <Box sx={{ opacity: 0.8, fontSize: '0.65rem' }}>/ Zaliczka</Box>
              </Box>
            </TableCell>
            <TableCell sx={{ color: 'inherit' }} align="center">ETM</TableCell>
            <TableCell sx={{ color: 'inherit', whiteSpace: 'normal' }} align="center">Status prod.</TableCell>
            <TableCell sx={{ color: 'inherit', whiteSpace: 'normal' }} align="right">
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                Koszt prod.
                <Tooltip title={t('orderDetails.actions.refreshProductionCosts')}>
                  <IconButton 
                    size="small" 
                    onClick={onRefreshProductionCosts}
                    sx={{ ml: 0.25, p: 0.25, color: 'inherit' }}
                  >
                    <RefreshIcon sx={{ fontSize: '0.9rem' }} />
                  </IconButton>
                </Tooltip>
              </Box>
            </TableCell>
            <TableCell sx={{ color: 'inherit' }} align="right">{t('orderDetails.table.profit')}</TableCell>
            <TableCell sx={{ color: 'inherit', whiteSpace: 'normal' }} align="right">Suma wart.</TableCell>
            <TableCell sx={{ color: 'inherit', whiteSpace: 'normal' }} align="right">Koszt /szt.</TableCell>
            <TableCell sx={{ color: 'inherit', whiteSpace: 'normal' }} align="right">Pełny /szt.</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {order.items && order.items.map((item, index) => (
            <TableRow key={index} sx={{ '&:nth-of-type(odd)': { bgcolor: 'action.hover' } }}>
              <TableCell sx={{ maxWidth: 180 }}>
                <Box>
                  <Typography variant="body2" sx={{ fontSize: '0.78rem', lineHeight: 1.3 }}>{item.name}</Typography>
                  {item.description && (
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25, fontSize: '0.65rem' }}>
                      {item.description}
                    </Typography>
                  )}
                </Box>
              </TableCell>
              <TableCell align="right">
                <Box>
                  {item.quantityUpdatedFromProduction && item.previousQuantity ? (
                    <Tooltip 
                      title={
                        <Box>
                          <Typography variant="caption" sx={{ display: 'block', fontWeight: 'bold', mb: 0.5 }}>
                            Autokorekta z produkcji
                          </Typography>
                          <Typography variant="caption" sx={{ display: 'block' }}>
                            Ilość oryginalna: {item.previousQuantity} {item.unit}
                          </Typography>
                          <Typography variant="caption" sx={{ display: 'block' }}>
                            Ilość aktualna: {item.quantity} {item.unit}
                          </Typography>
                          <Typography 
                            variant="caption" 
                            sx={{ 
                              display: 'block',
                              color: (item.quantity - item.previousQuantity) >= 0 ? 'success.light' : 'error.light'
                            }}
                          >
                            Zmiana: {(item.quantity - item.previousQuantity) > 0 ? '+' : ''}{(item.quantity - item.previousQuantity).toFixed(3)} {item.unit}
                          </Typography>
                          {item.quantityUpdatedAt && (
                            <Typography variant="caption" sx={{ display: 'block', mt: 0.5, opacity: 0.8 }}>
                              {formatDate(item.quantityUpdatedAt)}
                            </Typography>
                          )}
                          {item.quantityUpdateReason && (
                            <Typography variant="caption" sx={{ display: 'block', fontStyle: 'italic', mt: 0.5 }}>
                              Powód: {item.quantityUpdateReason}
                            </Typography>
                          )}
                        </Box>
                      }
                      arrow
                      placement="left"
                    >
                      <Box sx={{ cursor: 'help' }}>
                        <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                          {item.quantity} {item.unit}
                        </Typography>
                        <Typography variant="caption" sx={{ textDecoration: 'line-through', color: 'text.secondary', display: 'block', fontSize: '0.7rem' }}>
                          {item.previousQuantity} {item.unit}
                        </Typography>
                      </Box>
                    </Tooltip>
                  ) : (
                    <Typography variant="body2">{item.quantity} {item.unit}</Typography>
                  )}
                </Box>
              </TableCell>
              <TableCell align="right">
                {item.shippedQuantity ? (
                  <Box>
                    <Typography variant="body2" color="success.main" sx={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                      {item.shippedQuantity} {item.unit}
                    </Typography>
                    {item.cmrHistory && item.cmrHistory.length > 0 ? (
                      <Box sx={{ mt: 0.25 }}>
                        {item.cmrHistory.map((cmrEntry, cmrIndex) => (
                          <Typography 
                            key={cmrIndex} 
                            variant="caption" 
                            color="text.secondary"
                            sx={{ display: 'block', lineHeight: 1.1, fontSize: '0.55rem', whiteSpace: 'nowrap' }}
                          >
                            {cmrEntry.cmrNumber} ({cmrEntry.quantity})
                          </Typography>
                        ))}
                      </Box>
                    ) : item.lastCmrNumber ? (
                      <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.6rem' }}>
                        {item.lastCmrNumber}
                      </Typography>
                    ) : null}
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.78rem' }}>0 {item.unit}</Typography>
                )}
              </TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{formatCurrency(item.price)}</TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{formatCurrency(item.quantity * item.price)}</TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                <Box>
                  {renderInvoicedCell(item, index)}
                  {(() => {
                    const itemId = item.id || `${orderId}_item_${index}`;
                    const proformaData = proformaAmounts[itemId];
                    if (proformaData && proformaData.totalProforma > 0) {
                      return (
                        <Box sx={{ mt: 0.25, pt: 0.25, borderTop: '1px dashed', borderColor: 'divider' }}>
                          {renderProformaCell(item, index)}
                        </Box>
                      );
                    }
                    return null;
                  })()}
                </Box>
              </TableCell>
              <TableCell align="center">{renderETMCell(item)}</TableCell>
              <TableCell>{getProductionStatus(item, order.productionTasks)}</TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                {item.productionTaskId && item.productionCost !== undefined ? (
                  <Tooltip title={t('orderDetails.tooltips.productionTaskCost')}>
                    <Typography sx={{ fontSize: 'inherit' }}>{formatCurrency(item.productionCost)}</Typography>
                  </Tooltip>
                ) : (
                  <Typography color="text.secondary">-</Typography>
                )}
              </TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                {item.fromPriceList && parseFloat(item.price || 0) > 0 && item.productionCost !== undefined ? (
                  <Typography sx={{ 
                    fontWeight: 'medium', fontSize: 'inherit',
                    color: (item.quantity * item.price - item.productionCost) > 0 ? 'success.main' : 'error.main' 
                  }}>
                    {formatCurrency(item.quantity * item.price - item.productionCost)}
                  </Typography>
                ) : (
                  <Typography color="text.secondary">-</Typography>
                )}
              </TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{formatCurrency(calculateItemTotalValue(item))}</TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                {(() => {
                  const itemTotalValue = calculateItemTotalValue(item);
                  const allItemsValue = order.items?.reduce((sum, i) => sum + calculateItemTotalValue(i), 0) || 0;
                  const proportion = allItemsValue > 0 ? itemTotalValue / allItemsValue : 0;
                  
                  const additionalCosts = order.additionalCostsItems ? 
                    order.additionalCostsItems.filter(cost => parseFloat(cost.value) > 0)
                      .reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0) : 0;
                  const discounts = order.additionalCostsItems ? 
                    Math.abs(order.additionalCostsItems.filter(cost => parseFloat(cost.value) < 0)
                      .reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0)) : 0;
                  const additionalShare = proportion * (additionalCosts - discounts);
                  const totalWithAdditional = itemTotalValue + additionalShare;
                  const quantity = parseFloat(item.quantity) || 1;
                  
                  return formatCurrency(totalWithAdditional / quantity, 'EUR', 4, true);
                })()}
              </TableCell>
              <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                {(() => {
                  if (item.productionTaskId && item.fullProductionCost !== undefined) {
                    if (item.fullProductionUnitCost !== undefined && item.fullProductionUnitCost !== null) {
                      return (
                        <Tooltip title={item.fromPriceList 
                          ? t('orderDetails.tooltips.fullProductionCostPriceList')
                          : t('orderDetails.tooltips.fullProductionCostRegular')}>
                          <Typography sx={{ fontWeight: 'medium', color: 'primary.main', fontSize: 'inherit' }}>
                            {formatCurrency(item.fullProductionUnitCost)}
                          </Typography>
                        </Tooltip>
                      );
                    }
                    
                    const quantity = parseFloat(item.quantity) || 1;
                    const unitFullProductionCost = (item.fromPriceList && parseFloat(item.price || 0) > 0)
                      ? parseFloat(item.fullProductionCost) / quantity
                      : (parseFloat(item.fullProductionCost) / quantity) + (parseFloat(item.price) || 0);
                    
                    return (
                      <Tooltip title={`${item.fromPriceList 
                        ? t('orderDetails.tooltips.fullProductionCostPriceList')
                        : t('orderDetails.tooltips.fullProductionCostRegular')} - ${t('orderDetails.tooltips.calculatedRealTime')}`}>
                        <Typography sx={{ fontWeight: 'medium', color: 'warning.main', fontSize: 'inherit' }}>
                          {formatCurrency(unitFullProductionCost)}
                        </Typography>
                      </Tooltip>
                    );
                  }
                  return <Typography variant="body2" color="text.secondary">-</Typography>;
                })()}
              </TableCell>
            </TableRow>
          ))}

          {/* Summary row */}
          <TableRow sx={{ 
            bgcolor: 'action.hover', borderTop: '2px solid', borderColor: 'primary.main',
            '& .MuiTableCell-root': { fontWeight: 'bold', color: 'text.primary', whiteSpace: 'nowrap' }
          }}>
            <TableCell>PODSUMOWANIE:</TableCell>
            <TableCell align="right">{order.items?.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0) || 0}</TableCell>
            <TableCell align="right">{order.items?.reduce((sum, item) => sum + (parseFloat(item.shippedQuantity) || 0), 0) || 0}</TableCell>
            <TableCell align="right">-</TableCell>
            <TableCell align="right">{formatCurrency(order.items?.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.price) || 0), 0) || 0)}</TableCell>
            <TableCell align="right">
              <Box>
                {renderSummaryInvoiced()}
                {(() => {
                  let totalProforma = 0;
                  order.items?.forEach((item, index) => {
                    const itemId = item.id || `${orderId}_item_${index}`;
                    const proformaData = proformaAmounts[itemId];
                    if (proformaData && proformaData.totalProforma > 0) totalProforma += proformaData.totalProforma;
                  });
                  if (totalProforma > 0) {
                    return (
                      <Box sx={{ mt: 0.5, pt: 0.5, borderTop: '1px dashed', borderColor: 'divider' }}>
                        {renderSummaryProforma()}
                      </Box>
                    );
                  }
                  return null;
                })()}
              </Box>
            </TableCell>
            <TableCell align="center">-</TableCell>
            <TableCell align="right">-</TableCell>
            <TableCell align="right">
              {formatCurrency(order.items?.reduce((sum, item) => {
                return sum + (item.productionTaskId && item.productionCost !== undefined ? parseFloat(item.productionCost) || 0 : 0);
              }, 0) || 0)}
            </TableCell>
            <TableCell align="right">
              {(() => {
                const totalProfit = order.items?.reduce((sum, item) => {
                  if (item.fromPriceList && parseFloat(item.price || 0) > 0 && item.productionCost !== undefined) {
                    return sum + (item.quantity * item.price - item.productionCost);
                  }
                  return sum;
                }, 0) || 0;
                return (
                  <Typography sx={{ 
                    fontWeight: 'inherit',
                    color: totalProfit > 0 ? 'success.main' : totalProfit < 0 ? 'error.main' : 'inherit'
                  }}>
                    {formatCurrency(totalProfit)}
                  </Typography>
                );
              })()}
            </TableCell>
            <TableCell align="right">{formatCurrency(order.items?.reduce((sum, item) => sum + calculateItemTotalValue(item), 0) || 0)}</TableCell>
            <TableCell align="right">-</TableCell>
            <TableCell align="right">-</TableCell>
          </TableRow>
          
          {/* Global discount row */}
          {order.globalDiscount && parseFloat(order.globalDiscount) > 0 && (
            <TableRow>
              <TableCell colSpan={3} />
              <TableCell align="right" sx={{ fontWeight: 'bold', color: 'success.main' }}>
                Rabat globalny ({order.globalDiscount}%):
              </TableCell>
              <TableCell align="right" sx={{ color: 'success.main', fontWeight: 'bold' }}>
                -{formatCurrency((() => {
                  const subtotal = order.items?.reduce((sum, item) => sum + calculateItemTotalValue(item), 0) || 0;
                  return subtotal * (parseFloat(order.globalDiscount) / 100);
                })())}
              </TableCell>
              <TableCell colSpan={8} />
            </TableRow>
          )}
          
          {/* Total row */}
          <TableRow>
            <TableCell colSpan={3} />
            <TableCell align="right" sx={{ fontWeight: 'bold' }}>Razem:</TableCell>
            <TableCell align="right" sx={{ fontWeight: 'bold', fontSize: '1.2rem' }}>
              {formatCurrency(calculateOrderTotalValue())}
            </TableCell>
            <TableCell colSpan={8} />
          </TableRow>
        </TableBody>
      </Table>
      </TableContainer>
      
      {/* Create correction invoice button */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
        <Button
          variant="contained"
          color="error"
          startIcon={<ReceiptIcon />}
          component={RouterLink}
          to="/invoices/new"
          state={{ preselectedOrder: order, isCorrectionInvoice: true }}
        >
          Utwórz FK
        </Button>
      </Box>
    </Paper>
  );
};

export default React.memo(OrderProductsTable);
