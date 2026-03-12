import React from 'react';
import {
  Typography, Box, Chip, Button, IconButton, Divider, Tooltip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  List, ListItem, ListItemText, ListItemIcon, Collapse
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Label as LabelIcon,
  Inventory as InventoryIcon,
  Assignment as AssignmentIcon
} from '@mui/icons-material';
import { Link } from 'react-router-dom';
import { formatCurrency } from '../../../utils/formatting';
import { mb3 } from '../../../styles/muiCommonStyles';

const POItemsSection = ({
  purchaseOrder, expandedItems, reinvoicedAmounts,
  canReceiveItems, getBatchesByItemId, getReservationsByItemId,
  toggleItemExpansion, handleBatchClick, handleReceiveClick,
  isItemInUnloadingForms, getExpiryInfoFromUnloadingForms,
  warehouseNames, formatDate, t
}) => {
  return (
    <>
      <Typography variant="h6" gutterBottom>{t('purchaseOrders.details.orderElements')}</Typography>

      <TableContainer sx={mb3}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>{t('purchaseOrders.details.table.productName')}</TableCell>
              <TableCell align="right">{t('purchaseOrders.details.table.quantity')}</TableCell>
              <TableCell>{t('purchaseOrders.details.table.unit')}</TableCell>
              <TableCell align="right">{t('purchaseOrders.details.table.unitPrice')}</TableCell>
              <TableCell align="right">{t('purchaseOrders.details.table.discount')}</TableCell>
              <TableCell align="right">{t('purchaseOrders.details.table.unitPriceAfterDiscount')}</TableCell>
              <TableCell align="right">{t('purchaseOrders.details.table.netValue')}</TableCell>
              <TableCell align="right">{t('purchaseOrders.details.table.originalAmount')}</TableCell>
              <TableCell align="right">Termin płatności</TableCell>
              <TableCell align="right">{t('purchaseOrders.details.table.plannedDeliveryDate')}</TableCell>
              <TableCell align="right">{t('purchaseOrders.details.table.actualDeliveryDate')}</TableCell>
              <TableCell align="right">{t('purchaseOrders.details.table.received')}</TableCell>
              <TableCell align="right">Refakturowane</TableCell>
              <TableCell sx={{ '@media print': { display: 'none' } }}></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {purchaseOrder.items?.map((item, index) => {
              const received = parseFloat(item.received || 0);
              const quantity = parseFloat(item.quantity || 0);
              const fulfilledPercentage = quantity > 0 ? (received / quantity) * 100 : 0;
              const unitPrice = parseFloat(item.unitPrice) || 0;
              const discount = parseFloat(item.discount) || 0;
              const discountMultiplier = (100 - discount) / 100;
              const unitPriceAfterDiscount = unitPrice * discountMultiplier;

              let rowColor = 'inherit';
              if (fulfilledPercentage >= 100) rowColor = 'rgba(76, 175, 80, 0.1)';
              else if (fulfilledPercentage > 0) rowColor = 'rgba(255, 152, 0, 0.1)';

              return (
                <React.Fragment key={index}>
                  <TableRow sx={{ backgroundColor: rowColor }}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        {item.name}
                        {(getBatchesByItemId(item.id).length > 0 || getReservationsByItemId(item.id).length > 0) && (
                          <IconButton size="small" onClick={() => toggleItemExpansion(item.id)} sx={{ ml: 1 }}>
                            {expandedItems[item.id] ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                          </IconButton>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="right">{item.quantity}</TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell align="right">{formatCurrency(item.unitPrice, purchaseOrder.currency, 6)}</TableCell>
                    <TableCell align="right">{item.discount ? `${item.discount}%` : '-'}</TableCell>
                    <TableCell align="right">
                      <Box sx={{ color: discount > 0 ? 'success.main' : 'inherit', fontWeight: discount > 0 ? 'bold' : 'normal' }}>
                        {formatCurrency(unitPriceAfterDiscount, purchaseOrder.currency, 6)}
                        {discount > 0 && (
                          <Typography variant="caption" sx={{ display: 'block', color: 'success.main' }}>
                            (oszczędność: {formatCurrency(unitPrice - unitPriceAfterDiscount, purchaseOrder.currency, 6)})
                          </Typography>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="right">{formatCurrency(item.totalPrice, purchaseOrder.currency)}</TableCell>
                    <TableCell align="right">
                      {item.currency && item.currency !== purchaseOrder.currency && item.originalUnitPrice
                        ? formatCurrency(item.originalUnitPrice * item.quantity, item.currency)
                        : item.currency === 'EUR' && purchaseOrder.currency === 'EUR'
                          ? formatCurrency(item.totalPrice, item.currency)
                          : "-"}
                    </TableCell>
                    <TableCell align="right">{item.paymentDueDate ? formatDate(item.paymentDueDate) : '-'}</TableCell>
                    <TableCell align="right">{item.plannedDeliveryDate ? formatDate(item.plannedDeliveryDate) : '-'}</TableCell>
                    <TableCell align="right">{item.actualDeliveryDate ? formatDate(item.actualDeliveryDate) : '-'}</TableCell>
                    <TableCell align="right">
                      {received} {received > 0 && `(${fulfilledPercentage.toFixed(0)}%)`}
                    </TableCell>
                    <TableCell align="right">
                      <ReinvoicedCell item={item} reinvoicedAmounts={reinvoicedAmounts} purchaseOrder={purchaseOrder} />
                    </TableCell>
                    <TableCell align="right" sx={{ '@media print': { display: 'none' } }}>
                      <ReceiveButton
                        item={item} canReceiveItems={canReceiveItems} received={received} quantity={quantity}
                        isItemInUnloadingForms={isItemInUnloadingForms} getExpiryInfoFromUnloadingForms={getExpiryInfoFromUnloadingForms}
                        handleReceiveClick={handleReceiveClick} t={t}
                      />
                    </TableCell>
                  </TableRow>

                  {expandedItems[item.id] && (
                    <TableRow>
                      <TableCell colSpan={15} sx={{ py: 0, backgroundColor: 'rgba(0, 0, 0, 0.02)' }}>
                        <Collapse in={expandedItems[item.id]} timeout="auto" unmountOnExit>
                          <Box sx={{ m: 2 }}>
                            <BatchesList
                              item={item} batches={getBatchesByItemId(item.id)}
                              handleBatchClick={handleBatchClick} warehouseNames={warehouseNames} t={t}
                            />
                            <Divider sx={{ my: 2 }} />
                            <ReservationsList
                              item={item} reservations={getReservationsByItemId(item.id)}
                              purchaseOrder={purchaseOrder} t={t}
                            />
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
};

const ReinvoicedCell = ({ item, reinvoicedAmounts, purchaseOrder }) => {
  const reinvoicedData = reinvoicedAmounts.items[item.id];
  const reinvoicedAmount = reinvoicedData?.totalReinvoiced || 0;
  const itemValue = parseFloat(item.totalPrice) || 0;
  const isFullyReinvoiced = Math.abs(reinvoicedAmount - itemValue) < 0.01;
  const hasDiscrepancy = reinvoicedAmount > 0 && !isFullyReinvoiced;
  const discrepancyAmount = reinvoicedAmount - itemValue;

  if (reinvoicedAmount <= 0) return <Typography color="text.secondary">—</Typography>;

  return (
    <Tooltip title={
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
          Refakturowano do {reinvoicedData.invoices.length} {reinvoicedData.invoices.length === 1 ? 'faktury' : 'faktur'}:
        </Typography>
        {reinvoicedData.invoices.map((inv, i) => (
          <Typography key={i} variant="body2">
            • {inv.invoiceNumber} → {inv.customerName || 'Brak klienta'}: {formatCurrency(inv.itemValue, purchaseOrder.currency)}
          </Typography>
        ))}
        {hasDiscrepancy && (
          <Typography variant="body2" sx={{ mt: 0.5, color: 'error.light', fontWeight: 'bold' }}>
            Niezgodność: {discrepancyAmount > 0 ? '+' : ''}{formatCurrency(discrepancyAmount, purchaseOrder.currency)} ({discrepancyAmount > 0 ? 'nadwyżka' : 'niedobór'} vs wartość PO: {formatCurrency(itemValue, purchaseOrder.currency)})
          </Typography>
        )}
      </Box>
    }>
      <Typography sx={{
        color: isFullyReinvoiced ? 'success.main' : 'error.main',
        fontWeight: 'medium', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5
      }}>
        {isFullyReinvoiced ? '✅' : '❌'}
        {formatCurrency(reinvoicedAmount, purchaseOrder.currency)}
      </Typography>
    </Tooltip>
  );
};

const ReceiveButton = ({ item, canReceiveItems, received, quantity, isItemInUnloadingForms, getExpiryInfoFromUnloadingForms, handleReceiveClick, t }) => {
  if (!canReceiveItems || !item.inventoryItemId || received >= quantity) return null;

  const itemInUnloadingForm = isItemInUnloadingForms(item);
  const expiryInfo = getExpiryInfoFromUnloadingForms(item);

  let tooltipText = "";
  if (itemInUnloadingForm) {
    tooltipText = t('purchaseOrders.details.itemReportedInUnloading');
    const batchCount = expiryInfo.batches?.length || 0;
    const reportsCount = expiryInfo.reportsCount || 0;
    if (batchCount > 0) {
      if (reportsCount > 1) tooltipText += ` (${batchCount} partii z ${reportsCount} dostaw)`;
      else tooltipText += ` (${batchCount} ${batchCount === 1 ? 'partia' : batchCount < 5 ? 'partie' : 'partii'})`;
    }
    if (expiryInfo.noExpiryDate) tooltipText += ' • brak terminu ważności';
    else if (expiryInfo.expiryDate) {
      const expiryDateStr = expiryInfo.expiryDate instanceof Date
        ? expiryInfo.expiryDate.toLocaleDateString('pl-PL')
        : new Date(expiryInfo.expiryDate).toLocaleDateString('pl-PL');
      tooltipText += ` • data ważności: ${expiryDateStr}`;
    }
  } else {
    tooltipText = t('purchaseOrders.details.itemNotReportedInUnloading');
  }

  return (
    <Tooltip title={tooltipText}>
      <span>
        <Button size="small" variant="outlined"
          color={itemInUnloadingForm ? "primary" : "error"}
          startIcon={<InventoryIcon />}
          onClick={() => handleReceiveClick(item)}
          disabled={!itemInUnloadingForm}
        >
          {itemInUnloadingForm ? t('purchaseOrders.details.receive') : t('purchaseOrders.details.notInReport')}
        </Button>
      </span>
    </Tooltip>
  );
};

const BatchesList = ({ item, batches, handleBatchClick, warehouseNames, t }) => (
  <>
    <Typography variant="subtitle2" gutterBottom component="div">
      {t('purchaseOrders.details.batchesAssignedToItem')}
    </Typography>
    {batches.length > 0 ? (
      <List dense>
        {batches.map((batch) => (
          <ListItem key={batch.id} sx={{
            bgcolor: 'background.paper', mb: 0.5, borderRadius: 1,
            cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' }
          }}
            onClick={() => handleBatchClick(batch.id, batch.itemId || item.inventoryItemId)}
          >
            <ListItemIcon><LabelIcon color="info" /></ListItemIcon>
            <ListItemText
              primary={`LOT: ${batch.lotNumber || batch.batchNumber || "Brak numeru"}`}
              secondary={
                <React.Fragment>
                  <Typography component="span" variant="body2" color="text.primary">
                    {t('common.quantity')}: {batch.quantity} {item.unit}
                  </Typography>
                  {batch.receivedDate && (
                    <Typography component="span" variant="body2" display="block" color="text.secondary">
                      Przyjęto: {new Date(batch.receivedDate.seconds * 1000).toLocaleDateString('pl-PL')}
                    </Typography>
                  )}
                  {batch.warehouseId && (
                    <Typography component="span" variant="body2" display="block" color="text.secondary">
                      {t('purchaseOrders.details.batches.warehouse')}: {batch.warehouseName || warehouseNames[batch.warehouseId] || batch.warehouseId}
                    </Typography>
                  )}
                </React.Fragment>
              }
            />
            <Button size="small" variant="outlined" color="primary" sx={{ ml: 1 }}
              onClick={(e) => { e.stopPropagation(); handleBatchClick(batch.id, batch.itemId || item.inventoryItemId); }}
            >
              {t('purchaseOrders.details.table.details')}
            </Button>
          </ListItem>
        ))}
      </List>
    ) : (
      <Typography variant="body2" color="text.secondary">
        {t('purchaseOrders.details.batches.noBatchesAssigned')}
      </Typography>
    )}
  </>
);

const ReservationsList = ({ item, reservations, purchaseOrder, t }) => {
  const statusColors = { 'pending': 'warning', 'delivered': 'success', 'converted': 'info' };

  return (
    <>
      <Typography variant="subtitle2" gutterBottom component="div" sx={{ mt: 2 }}>
        Rezerwacje PO
        <Chip label={reservations.length} size="small" color="primary" sx={{ ml: 1 }} />
      </Typography>
      {reservations.length > 0 ? (
        <>
          <List dense>
            {reservations.map((reservation) => (
              <ListItem key={reservation.id} sx={{
                bgcolor: 'background.paper', mb: 0.5, borderRadius: 1,
                cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' },
                border: '1px solid', borderColor: 'divider'
              }}
                component={Link} to={`/production/tasks/${reservation.taskId}`}
              >
                <ListItemIcon><AssignmentIcon color="primary" /></ListItemIcon>
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" fontWeight="medium">{reservation.taskNumber}</Typography>
                      <Chip
                        label={reservation.status === 'pending' ? 'Oczekująca' : reservation.status === 'delivered' ? 'Dostarczona' : reservation.status === 'converted' ? 'Przekonwertowana' : reservation.status}
                        size="small" color={statusColors[reservation.status] || 'default'}
                      />
                    </Box>
                  }
                  secondary={
                    <React.Fragment>
                      <Typography component="span" variant="body2" color="text.primary" display="block">{reservation.taskName}</Typography>
                      <Typography component="span" variant="body2" color="text.secondary" display="block">
                        Zarezerwowano: {reservation.reservedQuantity} {item.unit}
                        {' • '}Cena: {formatCurrency(reservation.unitPrice, reservation.currency || purchaseOrder.currency)}
                        {' • '}Wartość: {formatCurrency(reservation.reservedQuantity * reservation.unitPrice, reservation.currency || purchaseOrder.currency)}
                      </Typography>
                      {reservation.reservedAt && (
                        <Typography component="span" variant="body2" display="block" color="text.secondary">
                          Data rezerwacji: {new Date(reservation.reservedAt).toLocaleDateString('pl-PL')}
                        </Typography>
                      )}
                      {reservation.deliveredQuantity > 0 && (
                        <Typography component="span" variant="body2" display="block" color="success.main">
                          Dostarczone: {reservation.deliveredQuantity} {item.unit}
                        </Typography>
                      )}
                    </React.Fragment>
                  }
                />
                <Button size="small" variant="outlined" color="primary" sx={{ ml: 1 }}
                  component={Link} to={`/production/tasks/${reservation.taskId}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  Zobacz MO
                </Button>
              </ListItem>
            ))}
          </List>
          {reservations.length > 1 && (() => {
            const totalQuantity = reservations.reduce((sum, r) => sum + (r.reservedQuantity || 0), 0);
            const totalValue = reservations.reduce((sum, r) => sum + ((r.reservedQuantity || 0) * (r.unitPrice || 0)), 0);
            const totalDelivered = reservations.reduce((sum, r) => sum + (r.deliveredQuantity || 0), 0);
            const currency = reservations[0]?.currency || purchaseOrder.currency;
            return (
              <Box sx={{ mt: 1, p: 1.5, bgcolor: 'primary.50', borderRadius: 1, border: '1px solid', borderColor: 'primary.200', backgroundColor: 'rgba(25, 118, 210, 0.08)' }}>
                <Typography variant="subtitle2" color="primary.main" gutterBottom>Suma rezerwacji ({reservations.length})</Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                  <Typography variant="body2" color="text.primary">Łączna ilość: <strong>{totalQuantity} {item.unit}</strong></Typography>
                  <Typography variant="body2" color="text.primary">Łączna wartość: <strong>{formatCurrency(totalValue, currency)}</strong></Typography>
                  {totalDelivered > 0 && (
                    <Typography variant="body2" color="success.main">Łącznie dostarczone: <strong>{totalDelivered} {item.unit}</strong></Typography>
                  )}
                </Box>
              </Box>
            );
          })()}
        </>
      ) : (
        <Typography variant="body2" color="text.secondary">Brak rezerwacji PO dla tej pozycji</Typography>
      )}
    </>
  );
};

export default POItemsSection;
