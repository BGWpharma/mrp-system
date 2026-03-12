import React, { lazy, Suspense } from 'react';
import { Link, Link as RouterLink } from 'react-router-dom';
import {
  Typography, Paper, Button, Box, Chip, Grid, Divider,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  CircularProgress, IconButton, List, ListItem, ListItemText, Tooltip,
  Menu, MenuItem, ButtonGroup, LinearProgress
} from '@mui/material';
import {
  Edit as EditIcon, Delete as DeleteIcon, Download as DownloadIcon,
  Description as DescriptionIcon, Inventory as InventoryIcon,
  ArrowBack as ArrowBackIcon, Person as PersonIcon,
  LocationOn as LocationOnIcon, Email as EmailIcon,
  Phone as PhoneIcon, MoreVert as MoreVertIcon,
  Refresh as RefreshIcon, Label as LabelIcon,
  AttachFile as AttachFileIcon, Image as ImageIcon,
  PictureAsPdf as PdfIcon, Assignment as AssignmentIcon,
  LocalShipping as LocalShippingIcon, ArrowDropDown as ArrowDropDownIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import {
  PURCHASE_ORDER_STATUSES, PURCHASE_ORDER_PAYMENT_STATUSES,
  translateStatus, translatePaymentStatus, getNextPaymentDueDate
} from '../../services/purchaseOrders';
import { formatCurrency } from '../../utils/formatting';
import CoAMigrationDialog from './CoAMigrationDialog';
import StatusChip from '../common/StatusChip';
import StatusStepper from '../common/StatusStepper';
import DetailPageLayout from '../common/DetailPageLayout';
import { flexBetween, mr1, mb1, mb2, mb3 } from '../../styles/muiCommonStyles';

import { usePOData } from '../../hooks/purchaseOrders/usePOData';
import { usePOStatus } from '../../hooks/purchaseOrders/usePOStatus';
import { usePOReceiving } from '../../hooks/purchaseOrders/usePOReceiving';
import { usePOInvoices } from '../../hooks/purchaseOrders/usePOInvoices';

import POItemsSection from './sections/POItemsSection';
import POSummarySection from './sections/POSummarySection';

const DeleteOrderDialog = lazy(() => import('./dialogs/DeleteOrderDialog'));
const StatusChangeDialog = lazy(() => import('./dialogs/StatusChangeDialog'));
const PaymentStatusDialog = lazy(() => import('./dialogs/PaymentStatusDialog'));
const ReceiveItemDialog = lazy(() => import('./dialogs/ReceiveItemDialog'));
const SupplierPricesDialog = lazy(() => import('./dialogs/SupplierPricesDialog'));
const InvoiceLinksDialog = lazy(() => import('./dialogs/InvoiceLinksDialog'));
const ShortExpiryDialog = lazy(() => import('./dialogs/ShortExpiryDialog'));

const DialogFallback = () => null;

const PurchaseOrderDetails = ({ orderId }) => {
  const d = usePOData(orderId);
  const status = usePOStatus({
    orderId, purchaseOrder: d.purchaseOrder, setPurchaseOrder: d.setPurchaseOrder,
    currentUser: d.currentUser, showSuccess: d.showSuccess, showError: d.showError, t: d.t
  });
  const receiving = usePOReceiving({
    orderId, purchaseOrder: d.purchaseOrder,
    isItemInUnloadingForms: d.isItemInUnloadingForms,
    getExpiryInfoFromUnloadingForms: d.getExpiryInfoFromUnloadingForms,
    getItemMatchingDiagnostics: d.getItemMatchingDiagnostics,
    navigate: d.navigate, showError: d.showError, t: d.t
  });
  const invoices = usePOInvoices({
    orderId, purchaseOrder: d.purchaseOrder, setPurchaseOrder: d.setPurchaseOrder,
    showSuccess: d.showSuccess, showError: d.showError
  });

  const { purchaseOrder, t } = d;

  const handleDeleteConfirm = async () => {
    try {
      const { deletePurchaseOrder } = await import('../../services/purchaseOrders');
      await deletePurchaseOrder(orderId);
      d.showSuccess('Zamówienie zostało usunięte');
      d.navigate('/purchase-orders');
    } catch (error) {
      d.showError('Błąd podczas usuwania zamówienia: ' + error.message);
    }
    status.setDeleteDialogOpen(false);
  };

  const getPaymentStatusChip = (paymentStatus) => {
    const s = paymentStatus || PURCHASE_ORDER_PAYMENT_STATUSES.UNPAID;
    let label = translatePaymentStatus(s);
    let color = '#f44336';
    if (s === PURCHASE_ORDER_PAYMENT_STATUSES.TO_BE_PAID && purchaseOrder?.items) {
      const paymentDates = getNextPaymentDueDate(purchaseOrder.items);
      if (paymentDates.length > 0) label = paymentDates.map(date => format(new Date(date), 'dd.MM.yyyy')).join(', ');
    }
    switch (s) {
      case PURCHASE_ORDER_PAYMENT_STATUSES.PAID: color = '#4caf50'; break;
      case PURCHASE_ORDER_PAYMENT_STATUSES.PARTIALLY_PAID: color = '#2196f3'; break;
      case PURCHASE_ORDER_PAYMENT_STATUSES.TO_BE_PAID: color = '#ff9800'; break;
      default: color = '#f44336'; break;
    }
    return <Chip label={label} size="small" onClick={status.handlePaymentStatusClick} sx={{ backgroundColor: color, color: 'white' }} />;
  };

  if (d.loading || !purchaseOrder) {
    return (
      <DetailPageLayout loading={d.loading} error={!purchaseOrder && !d.loading}
        errorMessage={t('purchaseOrders.orderNotFound')} backTo="/purchase-orders"
        backLabel={t('purchaseOrders.backToList', 'Powrót do listy')} maxWidth="lg" />
    );
  }

  return (
    <DetailPageLayout loading={false} error={false} maxWidth="lg">
      {/* Header */}
      <Box sx={{ mb: 4, ...flexBetween }}>
        <Button component={Link} to="/purchase-orders" startIcon={<ArrowBackIcon />} variant="outlined">
          {t('purchaseOrders.backToList')}
        </Button>
        <Typography variant="h4" component="h1">
          {t('purchaseOrders.details.orderTitle', { number: purchaseOrder.number })}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ButtonGroup variant="outlined">
            <Button onClick={() => d.handlePdfDownload(false)} startIcon={<DownloadIcon />} size="medium">
              {t('purchaseOrders.downloadPdf')}
            </Button>
            <Button onClick={d.handlePdfMenuOpen}
              sx={{ minWidth: '32px', px: 1, borderLeft: '1px solid rgba(25, 118, 210, 0.5) !important' }} size="medium">
              <ArrowDropDownIcon />
            </Button>
          </ButtonGroup>
          <Menu anchorEl={d.pdfMenuAnchorEl} open={d.pdfMenuOpen} onClose={d.handlePdfMenuClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            transformOrigin={{ vertical: 'top', horizontal: 'left' }}>
            <MenuItem onClick={() => d.handlePdfDownload(false)}><PdfIcon sx={mr1} />PDF standardowy (z cenami)</MenuItem>
            <MenuItem onClick={() => d.handlePdfDownload(true)}><PdfIcon sx={mr1} />PDF bez cen i kosztów</MenuItem>
          </Menu>
          <Button component={Link} to={`/purchase-orders/${orderId}/edit`} variant="contained" startIcon={<EditIcon />} size="medium">
            {t('purchaseOrders.editOrder')}
          </Button>
          <IconButton color="primary" onClick={d.handleMenuOpen}><MoreVertIcon /></IconButton>
          <Menu anchorEl={d.menuAnchorRef} open={d.menuOpen} onClose={d.handleMenuClose}
            PaperProps={{ elevation: 1, sx: { overflow: 'visible', filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.32))', mt: 1.5,
              '&:before': { content: '""', display: 'block', position: 'absolute', top: 0, right: 14, width: 10, height: 10, bgcolor: 'background.paper', transform: 'translateY(-50%) rotate(45deg)', zIndex: 0 }
            }}}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}>
            {d.hasDynamicFields && <MenuItem onClick={d.handleUpdateBatchPricesFromMenu}><RefreshIcon sx={mr1} />Aktualizuj ceny partii</MenuItem>}
            {purchaseOrder?.items?.length > 0 && <MenuItem onClick={d.handleUpdateBasePrices}><RefreshIcon sx={mr1} />Aktualizuj ceny bazowe</MenuItem>}
            {purchaseOrder?.items?.length > 0 && purchaseOrder?.supplier?.id && (
              <MenuItem onClick={d.handleUpdateSupplierPrices}><RefreshIcon sx={mr1} />Aktualizuj ceny dostawcy</MenuItem>
            )}
            <MenuItem onClick={() => { status.handleDeleteClick(); d.handleMenuClose(); }} sx={{ color: 'error.main' }}>
              <DeleteIcon sx={mr1} />{t('purchaseOrders.details.deleteOrder')}
            </MenuItem>
          </Menu>
        </Box>
      </Box>

      <Box sx={{ mb: 3 }}>
        {/* Order Info */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Box sx={mb2}>
                <Typography variant="h5" component="h1">
                  {t('purchaseOrders.details.orderNumber', { number: purchaseOrder.number })}
                  <Tooltip title="Kliknij, aby zmienić status" arrow>
                    <Box component="span" sx={{ ml: 2, cursor: 'pointer' }} onClick={status.handleStatusClick}>
                      <StatusChip status={translateStatus(purchaseOrder.status)} />
                    </Box>
                  </Tooltip>
                  <Box component="span" sx={{ ml: 1 }}>{getPaymentStatusChip(purchaseOrder.paymentStatus)}</Box>
                </Typography>
              </Box>
              <Box sx={{ mt: 2 }}>
                <StatusStepper
                  steps={['Projekt', 'Zamówione', 'Potwierdzone', 'Wysłane', 'Częściowo dostarczone', 'Dostarczone', 'Zakończone']}
                  currentStatus={translateStatus(purchaseOrder.status)}
                  cancelledStatus="Anulowane" isCancelled={purchaseOrder.status === 'cancelled'}
                />
              </Box>
              {purchaseOrder.totalPaidFromInvoices != null && purchaseOrder.totalGross > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                    <Typography variant="body2" color="text.secondary">Wpłacono z faktur:</Typography>
                    <Typography variant="body2" fontWeight="medium">
                      {parseFloat(purchaseOrder.totalPaidFromInvoices).toFixed(2)} / {parseFloat(purchaseOrder.totalGross).toFixed(2)} {purchaseOrder.currency || 'EUR'}
                      {' '}({Math.min(100, Math.round((purchaseOrder.totalPaidFromInvoices / purchaseOrder.totalGross) * 100))}%)
                    </Typography>
                  </Box>
                  <LinearProgress variant="determinate"
                    value={Math.min(100, (purchaseOrder.totalPaidFromInvoices / purchaseOrder.totalGross) * 100)}
                    sx={{ height: 6, borderRadius: 3, backgroundColor: 'grey.200',
                      '& .MuiLinearProgress-bar': { borderRadius: 3,
                        backgroundColor: purchaseOrder.totalPaidFromInvoices >= purchaseOrder.totalGross - 0.01 ? 'success.main'
                          : purchaseOrder.totalPaidFromInvoices > 0.01 ? 'info.main' : 'grey.400'
                      }
                    }}
                  />
                </Box>
              )}
              <Typography variant="body1" gutterBottom><strong>{t('purchaseOrders.details.orderDate')}:</strong> {d.formatDate(purchaseOrder.orderDate)}</Typography>
              <Typography variant="body1" gutterBottom><strong>{t('purchaseOrders.details.expectedDeliveryDate')}:</strong> {d.formatDate(purchaseOrder.expectedDeliveryDate)}</Typography>
              {purchaseOrder.incoterms && <Typography variant="body1" gutterBottom><strong>{t('purchaseOrders.details.incoterms')}:</strong> {purchaseOrder.incoterms}</Typography>}
              {purchaseOrder.status === PURCHASE_ORDER_STATUSES.DELIVERED && (
                <Typography variant="body1" gutterBottom><strong>{t('purchaseOrders.details.deliveryDate')}:</strong> {d.formatDate(purchaseOrder.deliveredAt)}</Typography>
              )}
              {purchaseOrder.invoiceLink && (!purchaseOrder.invoiceLinks || purchaseOrder.invoiceLinks.length === 0) && (
                <Typography variant="body1" gutterBottom>
                  <strong>{t('purchaseOrders.details.invoice')}:</strong>{' '}
                  <a href={purchaseOrder.invoiceLink} target="_blank" rel="noopener noreferrer">{t('purchaseOrders.details.viewInvoice')}</a>
                </Typography>
              )}
              {purchaseOrder.invoiceLinks?.length > 0 && (
                <>
                  <Typography variant="body1" gutterBottom><strong>{t('purchaseOrders.details.invoices')}:</strong></Typography>
                  <Box component="ul" sx={{ pl: 4, mt: 0 }}>
                    {purchaseOrder.invoiceLinks.map((inv, idx) => (
                      <Typography component="li" variant="body2" gutterBottom key={inv.id || idx}>
                        <a href={inv.url} target="_blank" rel="noopener noreferrer">{inv.description || `Faktura ${idx + 1}`}</a>
                      </Typography>
                    ))}
                  </Box>
                </>
              )}
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>{t('purchaseOrders.details.supplier')}</Typography>
              {purchaseOrder.supplier ? (
                <>
                  <Typography variant="body1" gutterBottom><strong>{purchaseOrder.supplier.name}</strong></Typography>
                  <Typography variant="body2" gutterBottom>
                    {purchaseOrder.supplier.contactPerson && (
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}><PersonIcon sx={{ mr: 1, fontSize: 16 }} />{purchaseOrder.supplier.contactPerson}</Box>
                    )}
                    {d.getSupplierMainAddress(purchaseOrder.supplier) && (
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 1 }}><LocationOnIcon sx={{ mr: 1, fontSize: 16, mt: 0.5 }} /><span>{d.formatAddress(d.getSupplierMainAddress(purchaseOrder.supplier))}</span></Box>
                    )}
                    {purchaseOrder.supplier.email && (
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}><EmailIcon sx={{ mr: 1, fontSize: 16 }} /><a href={`mailto:${purchaseOrder.supplier.email}`}>{purchaseOrder.supplier.email}</a></Box>
                    )}
                    {purchaseOrder.supplier.phone && (
                      <Box sx={{ display: 'flex', alignItems: 'center' }}><PhoneIcon sx={{ mr: 1, fontSize: 16 }} /><a href={`tel:${purchaseOrder.supplier.phone}`}>{purchaseOrder.supplier.phone}</a></Box>
                    )}
                  </Typography>
                </>
              ) : <Typography variant="body2">{t('purchaseOrders.details.noSupplierData')}</Typography>}
            </Grid>
          </Grid>
        </Paper>

        {/* Status History */}
        {purchaseOrder.statusHistory?.length > 0 && (
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>{t('purchaseOrders.details.statusHistory')}</Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('purchaseOrders.details.table.dateTime')}</TableCell>
                  <TableCell>{t('purchaseOrders.details.table.previousStatus')}</TableCell>
                  <TableCell>{t('purchaseOrders.details.table.newStatus')}</TableCell>
                  <TableCell>{t('purchaseOrders.details.table.changedBy')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {[...purchaseOrder.statusHistory].reverse().map((change, index) => (
                  <TableRow key={index}>
                    <TableCell>{change.changedAt ? new Date(change.changedAt).toLocaleString('pl') : 'Brak daty'}</TableCell>
                    <TableCell>{translateStatus(change.oldStatus)}</TableCell>
                    <TableCell>{translateStatus(change.newStatus)}</TableCell>
                    <TableCell>{d.getUserName(change.changedBy)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        )}

        {/* Items + Summary */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <POItemsSection
            purchaseOrder={purchaseOrder} expandedItems={d.expandedItems} reinvoicedAmounts={d.reinvoicedAmounts}
            canReceiveItems={d.canReceiveItems} getBatchesByItemId={d.getBatchesByItemId}
            getReservationsByItemId={d.getReservationsByItemId} toggleItemExpansion={d.toggleItemExpansion}
            handleBatchClick={d.handleBatchClick} handleReceiveClick={receiving.handleReceiveClick}
            isItemInUnloadingForms={d.isItemInUnloadingForms} getExpiryInfoFromUnloadingForms={d.getExpiryInfoFromUnloadingForms}
            warehouseNames={d.warehouseNames} formatDate={d.formatDate} t={t}
          />
          <POSummarySection purchaseOrder={purchaseOrder} calculateVATValues={d.calculateVATValues} t={t} />
        </Paper>
      </Box>

      {/* Related Batches */}
      {d.relatedBatches.length > 0 && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>{t('purchaseOrders.details.batches.allRelatedBatches')}</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('purchaseOrders.details.batches.lotNumber')}</TableCell>
                  <TableCell>{t('purchaseOrders.details.batches.product')}</TableCell>
                  <TableCell align="right">{t('purchaseOrders.details.table.quantity')}</TableCell>
                  <TableCell>{t('purchaseOrders.details.table.warehouse')}</TableCell>
                  <TableCell>{t('purchaseOrders.details.batches.receivedDate')}</TableCell>
                  <TableCell>{t('purchaseOrders.details.batches.value')}</TableCell>
                  <TableCell>{t('purchaseOrders.details.table.actions')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {d.relatedBatches.map((batch) => (
                  <TableRow key={batch.id} hover sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}>
                    <TableCell sx={{ fontWeight: 'medium' }}>{batch.lotNumber || batch.batchNumber || t('purchaseOrders.details.batches.noLotNumber')}</TableCell>
                    <TableCell>{batch.itemName || t('purchaseOrders.details.batches.unknownProduct')}</TableCell>
                    <TableCell align="right">{batch.quantity || 0} {batch.unit || 'szt.'}</TableCell>
                    <TableCell>{batch.warehouseName || batch.warehouseId || t('purchaseOrders.details.batches.mainWarehouse')}</TableCell>
                    <TableCell>
                      {batch.receivedDate
                        ? (typeof batch.receivedDate === 'object' && batch.receivedDate.seconds
                          ? new Date(batch.receivedDate.seconds * 1000).toLocaleDateString('pl-PL')
                          : new Date(batch.receivedDate).toLocaleDateString('pl-PL'))
                        : t('purchaseOrders.details.batches.unknownDate')}
                    </TableCell>
                    <TableCell>{formatCurrency(batch.unitPrice * batch.quantity, purchaseOrder.currency)}</TableCell>
                    <TableCell>
                      <Button size="small" variant="outlined" onClick={() => d.handleBatchClick(batch.id, batch.itemId)}>
                        {t('purchaseOrders.details.table.details')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Ref Invoices */}
      {d.relatedRefInvoices.length > 0 && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Refaktury / Zaliczki <Chip label={d.relatedRefInvoices.length} size="small" color="secondary" sx={{ ml: 1 }} />
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={mb2}>Faktury wystawione na podstawie tego zamówienia zakupowego</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Numer faktury</TableCell>
                  <TableCell>Data wystawienia</TableCell>
                  <TableCell>Termin płatności</TableCell>
                  <TableCell align="right">Kwota</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>{t('common:common.paymentStatus')}</TableCell>
                  <TableCell align="center">Akcje</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {d.relatedRefInvoices.map((invoice) => {
                  const getPaymentStatus = (inv) => {
                    if (inv.status === 'cancelled') return { label: 'Anulowana', color: 'default' };
                    if (inv.paymentStatus === 'paid') return { label: 'Opłacona', color: 'success' };
                    if (inv.paymentStatus === 'partially_paid') return { label: 'Częściowo opłacona', color: 'warning' };
                    const dueDate = inv.dueDate ? new Date(inv.dueDate) : null;
                    if (dueDate && dueDate < new Date() && inv.paymentStatus !== 'paid') return { label: 'Przeterminowana', color: 'error' };
                    return { label: 'Nieopłacona', color: 'warning' };
                  };
                  const ps = getPaymentStatus(invoice);
                  return (
                    <TableRow key={invoice.id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight="medium">{invoice.number}</Typography>
                        {invoice.isProforma && <Chip label="Proforma" size="small" color="info" sx={{ ml: 1 }} />}
                      </TableCell>
                      <TableCell>{invoice.issueDate ? format(new Date(invoice.issueDate), 'dd.MM.yyyy', { locale: pl }) : '-'}</TableCell>
                      <TableCell>{invoice.dueDate ? format(new Date(invoice.dueDate), 'dd.MM.yyyy', { locale: pl }) : '-'}</TableCell>
                      <TableCell align="right"><Typography variant="body2" fontWeight="medium">{formatCurrency(invoice.total || 0, invoice.currency || 'EUR')}</Typography></TableCell>
                      <TableCell>
                        <Chip label={invoice.status === 'draft' ? 'Szkic' : invoice.status === 'issued' ? 'Wystawiona' : invoice.status === 'cancelled' ? 'Anulowana' : invoice.status}
                          size="small" color={invoice.status === 'draft' ? 'default' : invoice.status === 'issued' ? 'primary' : invoice.status === 'cancelled' ? 'error' : 'default'} />
                      </TableCell>
                      <TableCell><Chip label={ps.label} size="small" color={ps.color} /></TableCell>
                      <TableCell align="center">
                        <Button size="small" variant="outlined" component={RouterLink} to={`/invoices/${invoice.id}`}>Szczegóły</Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
            <Typography variant="subtitle2" gutterBottom>Podsumowanie refaktur:</Typography>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2">Łączna wartość refaktur:</Typography>
              <Typography variant="h6" color="primary.main">
                {formatCurrency(d.relatedRefInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0), purchaseOrder.currency || 'EUR')}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
              <Typography variant="body2">Refaktury opłacone:</Typography>
              <Typography variant="body2" color="success.main" fontWeight="medium">
                {d.relatedRefInvoices.filter(inv => inv.paymentStatus === 'paid').length} / {d.relatedRefInvoices.length}
              </Typography>
            </Box>
          </Box>
        </Paper>
      )}

      {/* PO Reservations Summary */}
      {Object.values(d.poReservationsByItem).flat().length > 0 && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Rezerwacje z tego zamówienia <Chip label={Object.values(d.poReservationsByItem).flat().length} size="small" color="primary" sx={{ ml: 1 }} />
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Nr MO</TableCell><TableCell>Nazwa zadania</TableCell><TableCell>Materiał</TableCell>
                  <TableCell align="right">Ilość</TableCell><TableCell align="right">Wartość</TableCell>
                  <TableCell>Status</TableCell><TableCell>Data rezerwacji</TableCell><TableCell></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {Object.values(d.poReservationsByItem).flat().map((res) => (
                  <TableRow key={res.id} hover sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                    onClick={() => d.navigate(`/production/tasks/${res.taskId}`)}>
                    <TableCell sx={{ fontWeight: 'medium' }}>{res.taskNumber}</TableCell>
                    <TableCell>{res.taskName}</TableCell>
                    <TableCell>{res.materialName}</TableCell>
                    <TableCell align="right">{res.reservedQuantity} {res.unit}</TableCell>
                    <TableCell align="right">{formatCurrency(res.reservedQuantity * res.unitPrice, res.currency || purchaseOrder.currency)}</TableCell>
                    <TableCell>
                      <Chip label={res.status === 'pending' ? 'Oczekująca' : res.status === 'delivered' ? 'Dostarczona' : res.status === 'converted' ? 'Przekonwertowana' : res.status}
                        size="small" color={res.status === 'pending' ? 'warning' : res.status === 'delivered' ? 'success' : 'info'} />
                    </TableCell>
                    <TableCell>{res.reservedAt ? new Date(res.reservedAt).toLocaleDateString('pl-PL') : '-'}</TableCell>
                    <TableCell>
                      <Button size="small" variant="outlined" onClick={(e) => { e.stopPropagation(); d.navigate(`/production/tasks/${res.taskId}`); }}>Szczegóły</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Additional Costs */}
      <Paper sx={{ mb: 3, p: 3, borderRadius: 2 }}>
        <Typography variant="h6" gutterBottom>{t('purchaseOrders.additionalCosts')}</Typography>
        {purchaseOrder.additionalCostsItems?.length > 0 ? (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Opis</TableCell><TableCell align="right">Kwota</TableCell>
                <TableCell align="right">Stawka VAT</TableCell><TableCell align="right">VAT</TableCell>
                <TableCell align="right">Razem brutto</TableCell><TableCell align="right">Refakturowane</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {purchaseOrder.additionalCostsItems.map((cost, index) => {
                const costId = cost.id || `additional-cost-${index}`;
                const costValue = parseFloat(cost.value) || 0;
                const vatRate = typeof cost.vatRate === 'number' ? cost.vatRate : 0;
                const vatValue = (costValue * vatRate) / 100;
                const grossValue = costValue + vatValue;
                const reinvoicedData = d.reinvoicedAmounts.additionalCosts[costId];
                const reinvoicedAmount = reinvoicedData?.totalReinvoiced || 0;
                const isFullyReinvoiced = Math.abs(reinvoicedAmount - costValue) < 0.01;
                const hasDiscrepancy = reinvoicedAmount > 0 && !isFullyReinvoiced;
                const discrepancyAmount = reinvoicedAmount - costValue;
                return (
                  <TableRow key={cost.id || index}>
                    <TableCell>{cost.description || `Dodatkowy koszt ${index + 1}`}</TableCell>
                    <TableCell align="right">{formatCurrency(costValue, purchaseOrder.currency)}</TableCell>
                    <TableCell align="right">{vatRate > 0 ? `${vatRate}%` : ''}</TableCell>
                    <TableCell align="right">{formatCurrency(vatValue, purchaseOrder.currency)}</TableCell>
                    <TableCell align="right">{formatCurrency(grossValue, purchaseOrder.currency)}</TableCell>
                    <TableCell align="right">
                      {reinvoicedAmount > 0 ? (
                        <Tooltip title={
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                              Refakturowano do {reinvoicedData.invoices.length} {reinvoicedData.invoices.length === 1 ? 'faktury' : 'faktur'}:
                            </Typography>
                            {reinvoicedData.invoices.map((inv, i) => (
                              <Typography key={i} variant="body2">• {inv.invoiceNumber} → {inv.customerName || 'Brak klienta'}: {formatCurrency(inv.itemValue, purchaseOrder.currency)}</Typography>
                            ))}
                            {hasDiscrepancy && (
                              <Typography variant="body2" sx={{ mt: 0.5, color: 'error.light', fontWeight: 'bold' }}>
                                Niezgodność: {discrepancyAmount > 0 ? '+' : ''}{formatCurrency(discrepancyAmount, purchaseOrder.currency)} ({discrepancyAmount > 0 ? 'nadwyżka' : 'niedobór'} vs wartość PO: {formatCurrency(costValue, purchaseOrder.currency)})
                              </Typography>
                            )}
                          </Box>
                        }>
                          <Typography sx={{ color: isFullyReinvoiced ? 'success.main' : 'error.main', fontWeight: 'medium', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                            {isFullyReinvoiced ? '✅' : '❌'}{formatCurrency(reinvoicedAmount, purchaseOrder.currency)}
                          </Typography>
                        </Tooltip>
                      ) : <Typography color="text.secondary">—</Typography>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : <Typography variant="body2">Brak dodatkowych kosztów</Typography>}
      </Paper>

      {/* Attachments */}
      <AttachmentsSection purchaseOrder={purchaseOrder} d={d} t={t} />

      {/* Unloading Reports */}
      <UnloadingReportsSection purchaseOrder={purchaseOrder} d={d} t={t} />

      {/* Lazy Dialogs */}
      <Suspense fallback={<DialogFallback />}>
        {status.deleteDialogOpen && (
          <DeleteOrderDialog open={status.deleteDialogOpen} onClose={() => status.setDeleteDialogOpen(false)}
            onConfirm={handleDeleteConfirm} purchaseOrder={purchaseOrder} orderId={orderId} />
        )}
      </Suspense>
      <Suspense fallback={<DialogFallback />}>
        {status.statusDialogOpen && (
          <StatusChangeDialog open={status.statusDialogOpen} onClose={() => status.setStatusDialogOpen(false)}
            newStatus={status.newStatus} onStatusChange={status.setNewStatus} onSave={status.handleStatusUpdate} />
        )}
      </Suspense>
      <Suspense fallback={<DialogFallback />}>
        {status.paymentStatusDialogOpen && (
          <PaymentStatusDialog open={status.paymentStatusDialogOpen} onClose={() => status.setPaymentStatusDialogOpen(false)}
            purchaseOrder={purchaseOrder} newPaymentStatus={status.newPaymentStatus}
            onPaymentStatusChange={status.setNewPaymentStatus} onSave={status.handlePaymentStatusUpdate}
            onRecalculate={status.handleRecalculateFromInvoices} recalculating={status.recalculating} t={t} />
        )}
      </Suspense>
      <Suspense fallback={<DialogFallback />}>
        {receiving.receiveDialogOpen && (
          <ReceiveItemDialog open={receiving.receiveDialogOpen} onClose={() => receiving.setReceiveDialogOpen(false)}
            itemToReceive={receiving.itemToReceive} onConfirm={receiving.handleReceiveItem} />
        )}
      </Suspense>
      <Suspense fallback={<DialogFallback />}>
        {status.supplierPricesDialogOpen && (
          <SupplierPricesDialog open={status.supplierPricesDialogOpen}
            onClose={status.handleSupplierPricesCancel} onConfirm={status.handleSupplierPricesConfirm} />
        )}
      </Suspense>
      <Suspense fallback={<DialogFallback />}>
        {invoices.invoiceLinkDialogOpen && (
          <InvoiceLinksDialog open={invoices.invoiceLinkDialogOpen} onClose={() => invoices.setInvoiceLinkDialogOpen(false)}
            tempInvoiceLinks={invoices.tempInvoiceLinks} setTempInvoiceLinks={invoices.setTempInvoiceLinks}
            invoiceLink={invoices.invoiceLink} setInvoiceLink={invoices.setInvoiceLink}
            onSave={invoices.handleInvoiceLinkSave} t={t} />
        )}
      </Suspense>
      <Suspense fallback={<DialogFallback />}>
        {status.shortExpiryConfirmDialogOpen && (
          <ShortExpiryDialog open={status.shortExpiryConfirmDialogOpen}
            onClose={status.handleShortExpiryCancel} shortExpiryItems={status.shortExpiryItems}
            purchaseOrder={purchaseOrder} onConfirm={status.handleShortExpiryConfirm} />
        )}
      </Suspense>

      <CoAMigrationDialog open={d.coaMigrationDialogOpen} onClose={d.handleCoAMigrationClose}
        purchaseOrder={purchaseOrder} relatedBatches={d.relatedBatches} onMigrationComplete={d.handleCoAMigrationComplete} />
    </DetailPageLayout>
  );
};

// --- Inline sub-components for large sections ---

const AttachmentsSection = ({ purchaseOrder, d, t }) => {
  const getFileIcon = (contentType) => {
    if (contentType.startsWith('image/')) return <ImageIcon sx={{ color: 'primary.main' }} />;
    if (contentType === 'application/pdf') return <PdfIcon sx={{ color: 'error.main' }} />;
    return <DescriptionIcon sx={{ color: 'action.active' }} />;
  };
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024; const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  const renderList = (attachments, emptyMsg) => attachments?.length > 0 ? (
    <List sx={{ py: 0 }}>
      {attachments.map((att) => (
        <ListItem key={att.id} button onClick={() => window.open(att.downloadURL, '_blank')}
          sx={{ border: (theme) => `1px solid ${theme.palette.divider}`, borderRadius: 1, mb: 1, backgroundColor: 'background.paper', cursor: 'pointer', '&:hover': { bgcolor: 'action.hover', borderColor: 'primary.main' } }}>
          <Box sx={{ mr: 1.5 }}>{getFileIcon(att.contentType)}</Box>
          <ListItemText
            primary={<Typography variant="body2" fontWeight="medium">{att.fileName}</Typography>}
            secondary={
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mt: 0.5 }}>
                <Typography variant="caption" color="text.secondary">{formatFileSize(att.size)}</Typography>
                <Typography variant="caption" color="text.secondary">{new Date(att.uploadedAt).toLocaleDateString('pl-PL')}</Typography>
                <Typography variant="caption" color="primary.main" sx={{ fontStyle: 'italic' }}>{t('purchaseOrders.details.clickToOpen')}</Typography>
              </Box>
            }
          />
          <Box><DownloadIcon fontSize="small" sx={{ color: 'primary.main' }} /></Box>
        </ListItem>
      ))}
    </List>
  ) : <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', ml: 2 }}>{emptyMsg}</Typography>;

  const hasCoA = purchaseOrder.coaAttachments?.length > 0;
  const hasInvoices = purchaseOrder.invoiceAttachments?.length > 0;
  const hasGeneral = purchaseOrder.generalAttachments?.length > 0;
  const hasOld = purchaseOrder.attachments?.length > 0;

  return (
    <Paper sx={{ mb: 3, p: 3, borderRadius: 2 }}>
      <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
        <AttachFileIcon sx={mr1} />{t('purchaseOrders.details.attachments')}
      </Typography>
      {(hasCoA || hasInvoices || hasGeneral) ? (
        <Box>
          <Box sx={mb3}>
            <Typography variant="subtitle1" gutterBottom sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <AssignmentIcon sx={{ mr: 1, color: 'success.main' }} />
                {t('purchaseOrders.details.coaAttachments.title')}
                {hasCoA && <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>({purchaseOrder.coaAttachments.length})</Typography>}
              </Box>
              {hasCoA && d.relatedBatches.length > 0 && (
                <Button size="small" variant="outlined" startIcon={<LabelIcon />} onClick={d.handleCoAMigration} sx={{ ml: 'auto' }}>
                  {t('purchaseOrders.details.coaMigration.migrateToBatch')}
                </Button>
              )}
            </Typography>
            {renderList(purchaseOrder.coaAttachments, t('purchaseOrders.details.coaAttachments.noAttachments'))}
          </Box>
          <Box sx={mb3}>
            <Typography variant="subtitle1" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
              <LocalShippingIcon sx={{ mr: 1, color: 'warning.main' }} />
              {t('purchaseOrders.details.invoiceAttachments.title')}
              {hasInvoices && <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>({purchaseOrder.invoiceAttachments.length})</Typography>}
            </Typography>
            {renderList(purchaseOrder.invoiceAttachments, t('purchaseOrders.details.invoiceAttachments.noAttachments'))}
          </Box>
          <Box sx={mb1}>
            <Typography variant="subtitle1" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
              <AttachFileIcon sx={{ mr: 1, color: 'info.main' }} />
              {t('purchaseOrders.details.generalAttachments.title')}
              {hasGeneral && <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>({purchaseOrder.generalAttachments.length})</Typography>}
            </Typography>
            {renderList(purchaseOrder.generalAttachments, t('purchaseOrders.details.generalAttachments.noAttachments'))}
          </Box>
        </Box>
      ) : hasOld ? (
        <Box>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {t('purchaseOrders.details.attachedFiles', { count: purchaseOrder.attachments.length })}
          </Typography>
          {renderList(purchaseOrder.attachments, t('purchaseOrders.details.noAttachments'))}
        </Box>
      ) : <Typography variant="body2" color="text.secondary">{t('purchaseOrders.details.noAttachmentsForOrder')}</Typography>}
    </Paper>
  );
};

const UnloadingReportsSection = ({ purchaseOrder, d, t }) => (
  <Paper sx={{ mb: 3, p: 2, borderRadius: 2 }}>
    <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
      <LocalShippingIcon sx={mr1} />{t('purchaseOrders.details.unloadingReports')}
      {d.unloadingFormResponsesLoading && <CircularProgress size={20} sx={{ ml: 2 }} />}
    </Typography>
    {d.unloadingFormResponses.length > 0 ? (
      <Box>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {t('purchaseOrders.details.foundUnloadingReports', { count: d.unloadingFormResponses.length, number: purchaseOrder.number })}
        </Typography>
        {d.unloadingFormResponses.map((report, index) => (
          <Paper key={report.id} variant="outlined" sx={{
            mb: 1.5, p: 1.5,
            border: (theme) => `1px solid ${theme.palette.divider}`,
            borderLeft: (theme) => `3px solid ${theme.palette.primary.main}`,
            backgroundColor: (theme) => theme.palette.mode === 'dark' ? theme.palette.grey[900] : theme.palette.grey[50]
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
              <AssignmentIcon sx={{ mr: 1, color: 'primary.main', fontSize: '1.2rem' }} />
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                {t('purchaseOrders.details.unloadingReport', { number: index + 1 })}
              </Typography>
              <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Chip label={report.fillDate ? d.safeFormatDate(report.fillDate, 'dd.MM HH:mm') : t('purchaseOrders.details.noDate')}
                  size="small" color="primary" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                <IconButton size="small" color="primary" onClick={() => d.handleEditUnloadingReport(report)}
                  title={t('purchaseOrders.details.editUnloadingReport')} sx={{ p: 0.5 }}>
                  <EditIcon fontSize="small" />
                </IconButton>
              </Box>
            </Box>
            <Grid container spacing={1}>
              {[
                ['employeeEmail', report.email], ['employee', report.employeeName], ['position', report.position],
                [null, report.fillTime, 'Godzina wypełnienia'],
                [null, report.unloadingDate ? d.safeFormatDate(report.unloadingDate, 'dd.MM.yyyy') : null, 'Data rozładunku'],
                [null, report.unloadingTime, 'Godzina rozładunku'],
                [null, report.carrierName, 'Przewoźnik'], [null, report.vehicleRegistration, 'Nr rejestracyjny'],
                [null, report.vehicleTechnicalCondition, 'Stan techniczny'], [null, report.transportHygiene, 'Higiena transportu'],
                [null, report.supplierName, 'Dostawca'], [null, report.invoiceNumber, 'Numer faktury'],
                [null, report.palletQuantity, 'Ilość palet'], [null, report.cartonsTubsQuantity, 'Kartonów/tub'],
                [null, report.weight, 'Waga'], [null, report.visualInspectionResult, 'Ocena wizualna'],
                [null, report.ecoCertificateNumber, 'Nr certyfikatu eko']
              ].map(([tKey, value, label], i) => (
                <Grid item xs={6} sm={4} md={2} key={i}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                    {tKey ? t(`purchaseOrders.details.${tKey}`) : label}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
                    {value || (tKey ? t('purchaseOrders.details.notProvided') : 'Nie podano')}
                  </Typography>
                </Grid>
              ))}
              {report.selectedItems?.length > 0 && (
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', fontWeight: 600 }}>Pozycje dostarczone</Typography>
                  <Box sx={{ mt: 0.5 }}>
                    {report.selectedItems.map((item, itemIndex) => {
                      const hasBatches = item.batches?.length > 0;
                      return (
                        <Box key={itemIndex} sx={{ p: 0.75, mb: 0.5, backgroundColor: (theme) => theme.palette.background.paper, borderRadius: 0.5, border: (theme) => `1px solid ${theme.palette.divider}` }}>
                          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem', mb: hasBatches ? 0.5 : 0 }}>
                            {item.productName || 'Nieznany produkt'}
                          </Typography>
                          {hasBatches ? (
                            <Box sx={{ pl: 1 }}>
                              {item.batches.map((batch, batchIndex) => (
                                <Box key={batch.id || batchIndex} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.25, borderBottom: batchIndex < item.batches.length - 1 ? '1px dashed' : 'none', borderColor: 'divider' }}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    {batch.batchNumber && <Chip label={`LOT: ${batch.batchNumber}`} size="small" color="info" variant="outlined" sx={{ fontSize: '0.65rem', height: 18 }} />}
                                  </Box>
                                  <Box sx={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Typography variant="body2" color="primary" sx={{ fontSize: '0.75rem', fontWeight: 500 }}>{batch.unloadedQuantity || 'Nie podano'} {item.unit || ''}</Typography>
                                    {batch.noExpiryDate
                                      ? <Chip label={t('common:common.noExpiryDate')} size="small" color="default" sx={{ fontSize: '0.6rem', height: 16 }} />
                                      : batch.expiryDate && <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>{d.safeFormatDate(batch.expiryDate, 'dd.MM.yyyy')}</Typography>}
                                  </Box>
                                </Box>
                              ))}
                            </Box>
                          ) : (
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Box />
                              <Box sx={{ textAlign: 'right' }}>
                                <Typography variant="body2" color="primary" sx={{ fontSize: '0.8rem' }}>{item.unloadedQuantity || 'Nie podano'} {item.unit || ''}</Typography>
                                {item.noExpiryDate
                                  ? <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>{t('common:common.noExpiryDate')}</Typography>
                                  : item.expiryDate && <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>{d.safeFormatDate(item.expiryDate, 'dd.MM.yyyy')}</Typography>}
                              </Box>
                            </Box>
                          )}
                        </Box>
                      );
                    })}
                  </Box>
                </Grid>
              )}
              {(report.notes || report.goodsNotes) && (
                <Grid item xs={12}>
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    {report.notes && (
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', fontWeight: 600 }}>Uwagi rozładunku</Typography>
                        <Typography variant="body2" sx={{ fontStyle: 'italic', p: 0.5, backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)', borderRadius: 0.5, mt: 0.25, fontSize: '0.8rem' }}>
                          {report.notes}
                        </Typography>
                      </Box>
                    )}
                    {report.goodsNotes && (
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', fontWeight: 600 }}>Uwagi towaru</Typography>
                        <Typography variant="body2" sx={{ fontStyle: 'italic', p: 0.5, backgroundColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)', borderRadius: 0.5, mt: 0.25, fontSize: '0.8rem' }}>
                          {report.goodsNotes}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </Grid>
              )}
              {report.documentsUrl && (
                <Grid item xs={12}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', fontWeight: 600 }}>Załącznik</Typography>
                  <Box sx={{ mt: 0.5 }}>
                    <Button size="small" variant="outlined" href={report.documentsUrl} target="_blank" rel="noopener noreferrer"
                      startIcon={<AttachFileIcon />} sx={{ fontSize: '0.75rem', py: 0.25 }}>
                      {report.documentsName || 'Pobierz załącznik'}
                    </Button>
                  </Box>
                </Grid>
              )}
            </Grid>
          </Paper>
        ))}
      </Box>
    ) : (
      <Typography variant="body2" color="text.secondary">
        {d.unloadingFormResponsesLoading
          ? t('purchaseOrders.details.searchingUnloadingReports')
          : t('purchaseOrders.details.noUnloadingReports', { number: purchaseOrder?.number || t('purchaseOrders.details.unknown') })}
      </Typography>
    )}
  </Paper>
);

export default PurchaseOrderDetails;
