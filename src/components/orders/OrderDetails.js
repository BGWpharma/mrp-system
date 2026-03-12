import React, { useCallback } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Paper,
  Typography,
  Grid,
  Divider,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  IconButton,
  CircularProgress,
  Link,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tooltip,
  Alert,
  AlertTitle,
  Popover,
  List,
  ListItemText,
  ListItemButton
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Edit as EditIcon,
  Email as EmailIcon,
  LocalShipping as LocalShippingIcon,
  Schedule as ScheduleIcon,
  EventNote as EventNoteIcon,
  Person as PersonIcon,
  LocationOn as LocationOnIcon,
  Phone as PhoneIcon,
  Refresh as RefreshIcon,
  OpenInNew as OpenInNewIcon
} from '@mui/icons-material';
import { ORDER_STATUSES } from '../../services/orders';
import { formatCurrency } from '../../utils/formatting';
import { formatTimestamp } from '../../utils/dateUtils';
import { 
  mb1,
  mb2,
  mr1,
  mr2
} from '../../styles/muiCommonStyles';
import DetailPageLayout from '../common/DetailPageLayout';

import { useOrderData } from '../../hooks/orders/useOrderData';
import { useOrderDocuments } from '../../hooks/orders/useOrderDocuments';
import { useOrderNumberEdit } from '../../hooks/orders/useOrderNumberEdit';
import { useOrderStatus } from '../../hooks/orders/useOrderStatus';
import OrderProductsTable from './sections/OrderProductsTable';
import OrderDocumentsSection from './sections/OrderDocumentsSection';

const OrderDetails = () => {
  const {
    order, setOrder, loading,
    orderId, navigate, location, currentUser,
    userNames,
    isRefreshingCmr,
    invoicedAmounts, proformaAmounts, availableProformaAmounts,
    refreshOrderData,
    refreshProductionCosts,
    handleBackClick,
    handleEditClick,
    handleSendEmail,
    handleRefreshShippedQuantities,
    getStatusChipColor,
    getProductionStatusColor,
    getUserName,
    getTaskCompletionDate,
    calculateOrderTotalValue,
    t
  } = useOrderData();

  const {
    invoices,
    loadingInvoices,
    cmrDocuments, setCmrDocuments,
    loadingCmrDocuments, setLoadingCmrDocuments,
    invoicePopoverAnchor, setInvoicePopoverAnchor,
    selectedInvoiceData, setSelectedInvoiceData,
    loadCmrDocuments,
    fetchInvoices,
    fetchCmrDocuments,
    handleMigrateInvoices,
    calculateInvoicedAmount,
    calculateProformaTotal,
    calculateTotalPaid
  } = useOrderDocuments({ orderId, order });

  const {
    isEditingOrderNumber,
    newOrderNumber,
    orderNumberError,
    isUpdatingOrderNumber,
    updateOrderNumberDialogOpen,
    setUpdateOrderNumberDialogOpen,
    handleEditOrderNumberClick,
    handleCancelEditOrderNumber,
    handleOrderNumberChange,
    handleConfirmOrderNumberChange,
    handleUpdateOrderNumber
  } = useOrderNumberEdit({ order, orderId, currentUser, refreshOrderData, setOrder });

  const {
    statusDialogOpen,
    setStatusDialogOpen,
    newStatus,
    setNewStatus,
    handleStatusClick,
    handleStatusUpdate
  } = useOrderStatus({ order, currentUser, refreshOrderData });

  // Bridge: handleRefreshShippedQuantities needs document hook setters
  const onRefreshShippedQuantities = useCallback(() => {
    handleRefreshShippedQuantities({ setCmrDocuments, setLoadingCmrDocuments, loadCmrDocuments });
  }, [handleRefreshShippedQuantities, setCmrDocuments, setLoadingCmrDocuments, loadCmrDocuments]);

  // --- Status history ---
  const renderStatusHistory = () => {
    if (!order?.statusHistory || order.statusHistory.length === 0) return null;
    
    return (
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
          <ScheduleIcon sx={mr1} />
          {t('orderDetails.sections.statusHistory')}
        </Typography>
        <Divider sx={mb2} />
        
        <Table size="small" sx={{ '& .MuiTableCell-root': { py: 1.5 } }}>
          <TableHead>
            <TableRow sx={{ backgroundColor: 'action.hover' }}>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('orderDetails.statusHistory.dateTime')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('orderDetails.statusHistory.previousStatus')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('orderDetails.statusHistory.newStatus')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('orderDetails.statusHistory.whoChanged')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {[...order.statusHistory].reverse().map((change, index) => (
              <TableRow key={index} sx={{ '&:hover': { backgroundColor: 'action.hover' } }}>
                <TableCell sx={{ fontSize: '0.875rem' }}>
                  {change.changedAt ? new Date(change.changedAt).toLocaleString('pl') : t('orderDetails.statusHistory.noDate')}
                </TableCell>
                <TableCell>
                  <Chip label={change.oldStatus} size="small" variant="outlined" color={getStatusChipColor(change.oldStatus)} />
                </TableCell>
                <TableCell>
                  <Chip label={change.newStatus} size="small" color={getStatusChipColor(change.newStatus)} />
                </TableCell>
                <TableCell sx={{ fontSize: '0.875rem' }}>{getUserName(change.changedBy)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    );
  };

  // --- Early returns ---
  if (location.pathname.includes('/purchase-orders/')) return null;

  if (!order && !loading) {
    return (
      <DetailPageLayout
        loading={false}
        error={true}
        errorMessage={t('orderDetails.notifications.orderNotFound')}
        backTo="/orders"
        backLabel={t('orderDetails.actions.back')}
        maxWidth="lg"
      />
    );
  }

  if (!order) {
    return <DetailPageLayout loading={true} error={false} maxWidth="lg" />;
  }

  return (
    <DetailPageLayout
      loading={loading}
      error={!order && !loading}
      errorMessage={t('orderDetails.notifications.orderNotFound')}
      backTo="/orders"
      backLabel={t('orderDetails.actions.back')}
      maxWidth="lg"
    >
      <Box sx={{ pb: 4 }}>
        {/* Header */}
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button startIcon={<ArrowBackIcon />} onClick={handleBackClick}>
            {t('orderDetails.actions.back')}
          </Button>
          <Typography variant="h5">
            {isEditingOrderNumber ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TextField
                  size="small"
                  value={newOrderNumber}
                  onChange={handleOrderNumberChange}
                  error={!!orderNumberError}
                  helperText={orderNumberError}
                  placeholder="CO00090"
                  autoFocus
                  sx={{ minWidth: 200 }}
                />
                <Button size="small" variant="contained" onClick={handleConfirmOrderNumberChange} disabled={!!orderNumberError || !newOrderNumber}>
                  Zapisz
                </Button>
                <Button size="small" variant="outlined" onClick={handleCancelEditOrderNumber}>
                  Anuluj
                </Button>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <span>{t('orderDetails.orderNumber')} {order.orderNumber || order.id.substring(0, 8).toUpperCase()}</span>
                <Tooltip title="Zmień numer CO">
                  <IconButton size="small" onClick={handleEditOrderNumberClick} sx={{ ml: 1 }}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            )}
          </Typography>
          <Box>
            <Button startIcon={<EditIcon />} variant="outlined" onClick={handleEditClick}>
              {t('orderDetails.actions.edit')}
            </Button>
          </Box>
        </Box>

        {/* CMR discrepancy alert */}
        {order.items && (() => {
          const itemsWithDiscrepancies = order.items.filter(item => {
            if (!item.cmrHistory || item.cmrHistory.length === 0) return false;
            const cmrTotal = item.cmrHistory.reduce((sum, entry) => sum + (parseFloat(entry.quantity) || 0), 0);
            return Math.abs(cmrTotal - (item.shippedQuantity || 0)) > 0.01;
          });
          
          if (itemsWithDiscrepancies.length === 0) return null;
          
          return (
            <Alert 
              severity="warning" 
              sx={mb2}
              action={
                <Button 
                  color="inherit" size="small" 
                  onClick={onRefreshShippedQuantities}
                  disabled={isRefreshingCmr}
                  startIcon={isRefreshingCmr ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
                >
                  {isRefreshingCmr ? 'Odświeżam...' : 'Napraw teraz'}
                </Button>
              }
            >
              <AlertTitle>⚠️ Wykryto rozbieżności w ilościach wysłanych</AlertTitle>
              Znaleziono {itemsWithDiscrepancies.length} pozycję/pozycji z niezgodnymi ilościami między historią CMR a wysłaną ilością. 
              Kliknij "Napraw teraz", aby przeliczyć ilości na podstawie wszystkich dokumentów CMR.
            </Alert>
          );
        })()}

        {/* Status + customer info + financials */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={mr2}>{t('orderDetails.sections.status')}:</Typography>
                <Tooltip title={t('orderDetails.tooltips.clickToChangeStatus')}>
                  <Chip 
                    label={order.status} 
                    color={getStatusChipColor(order.status)}
                    size="medium"
                    clickable
                    onClick={handleStatusClick}
                    sx={{ cursor: 'pointer' }}
                  />
                </Tooltip>
              </Box>
              <Typography variant="body1" sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <EventNoteIcon sx={mr1} fontSize="small" />
                {t('orderDetails.orderDate')}: {formatTimestamp(order.orderDate, true)}
              </Typography>
              {order.expectedDeliveryDate && (
                <Typography variant="body1" sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <ScheduleIcon sx={mr1} fontSize="small" />
                  {t('orderDetails.expectedDelivery')}: {formatTimestamp(order.expectedDeliveryDate, true)}
                </Typography>
              )}
              {order.deliveryDate && (
                <Typography variant="body1" sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <LocalShippingIcon sx={mr1} fontSize="small" />
                  {t('orderDetails.completed')}: {formatTimestamp(order.deliveryDate, true)}
                </Typography>
              )}
              
              <Divider sx={{ my: 2 }} />
              
              <Box sx={{ mt: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                  <Typography variant="subtitle1" sx={{ display: 'flex', alignItems: 'center', fontWeight: 'bold' }}>
                    <PersonIcon sx={mr1} fontSize="small" />
                    {t('orderDetails.sections.customerData')}
                  </Typography>
                  <Tooltip title="Wyślij email do klienta">
                    <IconButton size="small" color="primary" onClick={handleSendEmail} disabled={!order.customer?.email}>
                      <EmailIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
                <Typography variant="subtitle2" color="primary.main" sx={{ mb: 1, fontWeight: 'bold' }}>
                  {order.customer?.name || t('orderDetails.customerInfo.noCustomerName')}
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <EmailIcon sx={{ mr: 1, color: 'text.secondary' }} fontSize="small" />
                    <Typography variant="body2">{order.customer?.email || '-'}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <PhoneIcon sx={{ mr: 1, color: 'text.secondary' }} fontSize="small" />
                    <Typography variant="body2">{order.customer?.phone || '-'}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'start' }}>
                    <LocationOnIcon sx={{ mr: 1, color: 'text.secondary' }} fontSize="small" />
                    <Typography variant="body2">{order.customer?.shippingAddress || '-'}</Typography>
                  </Box>
                </Box>
              </Box>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                {/* Order value */}
                <Box sx={{ p: 2, backgroundColor: 'primary.main', borderRadius: 2, mb: 2, boxShadow: 2 }}>
                  <Typography variant="subtitle1" sx={{ color: 'primary.contrastText', opacity: 0.9 }}>
                    {t('orderDetails.totalValue')}
                  </Typography>
                  <Typography variant="h3" sx={{ color: 'primary.contrastText', fontWeight: 'bold', mt: 0.5 }}>
                    {formatCurrency(calculateOrderTotalValue())}
                  </Typography>
                </Box>

                {/* Financial cards */}
                <Grid container spacing={1.5}>
                  <Grid item xs={12}>
                    <Paper elevation={3} sx={{ p: 2, backgroundColor: 'success.main', borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
                      <Box sx={{ position: 'relative', zIndex: 1 }}>
                        <Typography variant="subtitle2" sx={{ color: 'success.contrastText', opacity: 0.9, fontWeight: 500 }}>
                          💰 Opłacone
                        </Typography>
                        <Typography variant="h5" sx={{ color: 'success.contrastText', fontWeight: 'bold', my: 0.5 }}>
                          {formatCurrency(calculateTotalPaid())}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'success.contrastText', opacity: 0.85 }}>
                          {(() => {
                            const invoicedAmount = calculateInvoicedAmount();
                            const totalPaid = calculateTotalPaid();
                            const percentage = invoicedAmount > 0 ? ((totalPaid / invoicedAmount) * 100).toFixed(1) : 0;
                            const remaining = invoicedAmount - totalPaid;
                            return `${percentage}% • Do zapłaty: ${formatCurrency(remaining)}`;
                          })()}
                        </Typography>
                      </Box>
                    </Paper>
                  </Grid>

                  <Grid item xs={6}>
                    <Paper elevation={2} sx={{ p: 1.5, backgroundColor: 'background.paper', borderRadius: 2, borderLeft: 4, borderColor: 'success.light', height: '100%' }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>📄 FK</Typography>
                      <Typography variant="h6" color="success.main" sx={{ fontWeight: 'bold', my: 0.5 }}>
                        {formatCurrency(calculateInvoicedAmount())}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {(() => {
                          const totalValue = calculateOrderTotalValue();
                          const invoicedAmount = calculateInvoicedAmount();
                          return totalValue > 0 ? `${((invoicedAmount / totalValue) * 100).toFixed(1)}%` : '0%';
                        })()}
                      </Typography>
                    </Paper>
                  </Grid>

                  <Grid item xs={6}>
                    <Paper elevation={2} sx={{ p: 1.5, backgroundColor: 'background.paper', borderRadius: 2, borderLeft: 4, borderColor: 'info.main', height: '100%' }}>
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>💳 Zaliczki</Typography>
                      <Typography variant="h6" color="info.main" sx={{ fontWeight: 'bold', my: 0.5 }}>
                        {formatCurrency(calculateProformaTotal())}
                      </Typography>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">
                          {(() => {
                            const totalValue = calculateOrderTotalValue();
                            const proformaTotal = calculateProformaTotal();
                            return totalValue > 0 ? `${((proformaTotal / totalValue) * 100).toFixed(1)}%` : '0%';
                          })()}
                        </Typography>
                        {Object.values(availableProformaAmounts).reduce((sum, val) => sum + val, 0) > 0 && (
                          <Tooltip title="Kwota z proform dostępna do rozliczenia na fakturze końcowej">
                            <Chip 
                              size="small" 
                              label={`Dostępne: ${formatCurrency(Object.values(availableProformaAmounts).reduce((sum, val) => sum + val, 0))}`}
                              color="success"
                              variant="outlined"
                              sx={{ fontSize: '0.65rem', height: 20 }}
                            />
                          </Tooltip>
                        )}
                      </Box>
                    </Paper>
                  </Grid>
                </Grid>

                <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end' }}>
                  <Tooltip title={t('orderDetails.refreshOrder')}>
                    <IconButton size="small" color="primary" onClick={refreshOrderData}>
                      <RefreshIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
            </Grid>
          </Grid>
        </Paper>

        {/* Status history */}
        {renderStatusHistory()}

        {/* Products table */}
        <OrderProductsTable
          order={order}
          orderId={orderId}
          invoicedAmounts={invoicedAmounts}
          proformaAmounts={proformaAmounts}
          getTaskCompletionDate={getTaskCompletionDate}
          isRefreshingCmr={isRefreshingCmr}
          onRefreshShippedQuantities={onRefreshShippedQuantities}
          onRefreshProductionCosts={refreshProductionCosts}
          setInvoicePopoverAnchor={setInvoicePopoverAnchor}
          setSelectedInvoiceData={setSelectedInvoiceData}
          calculateOrderTotalValue={calculateOrderTotalValue}
        />

        {/* Notes */}
        {order.notes && (
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" sx={mb2}>{t('orderDetails.sections.comments')}</Typography>
            <Divider sx={mb2} />
            <Typography variant="body1">{order.notes}</Typography>
          </Paper>
        )}

        {/* Production tasks */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">{t('orderDetails.sections.productionTasks')}</Typography>
            <IconButton color="primary" onClick={refreshProductionCosts} title={t('orderDetails.tooltips.refreshProductionTasks')}>
              <RefreshIcon />
            </IconButton>
          </Box>
          <Divider sx={mb2} />
          
          {!order.productionTasks || order.productionTasks.length === 0 ? (
            <Typography variant="body1" color="text.secondary">
              {t('orderDetails.productionTasksTable.noTasks')}
            </Typography>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>{t('orderDetails.productionTasksTable.moNumber')}</TableCell>
                  <TableCell>{t('orderDetails.productionTasksTable.taskName')}</TableCell>
                  <TableCell>{t('orderDetails.productionTasksTable.product')}</TableCell>
                  <TableCell>{t('orderDetails.productionTasksTable.quantity')}</TableCell>
                  <TableCell>{t('orderDetails.productionTasksTable.status')}</TableCell>
                  <TableCell>{t('orderDetails.productionTasksTable.batchNumber')}</TableCell>
                  <TableCell align="right">{t('orderDetails.productionTasksTable.actions')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {order.productionTasks.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell>
                      <Link
                        component={RouterLink}
                        to={`/production/tasks/${task.id}`}
                        sx={{ textDecoration: 'none', fontWeight: 'medium', '&:hover': { textDecoration: 'underline' } }}
                      >
                        {task.moNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{task.name}</TableCell>
                    <TableCell>{task.productName}</TableCell>
                    <TableCell>{task.quantity} {task.unit}</TableCell>
                    <TableCell>
                      <Chip label={task.status} color={getProductionStatusColor(task.status)} size="small" />
                    </TableCell>
                    <TableCell>
                      {task.lotNumber ? (
                        <Tooltip title={t('orderDetails.productionTasksTable.batchNumberTooltip')}>
                          <Chip label={task.lotNumber} color="success" size="small" variant="outlined" />
                        </Tooltip>
                      ) : task.status === 'Zakończone' ? (
                        <Chip label={t('orderDetails.productionTasksTable.noLotNumber')} color="warning" size="small" variant="outlined" />
                      ) : null}
                    </TableCell>
                    <TableCell align="right">
                      <Button size="small" component={RouterLink} to={`/production/tasks/${task.id}`} variant="outlined">
                        {t('orderDetails.productionTasksTable.details')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Paper>

        {/* Documents (invoices + CMR) */}
        <OrderDocumentsSection
          order={order}
          orderId={orderId}
          invoices={invoices}
          loadingInvoices={loadingInvoices}
          cmrDocuments={cmrDocuments}
          loadingCmrDocuments={loadingCmrDocuments}
          availableProformaAmounts={availableProformaAmounts}
          onFetchInvoices={fetchInvoices}
          onFetchCmrDocuments={fetchCmrDocuments}
          onMigrateInvoices={handleMigrateInvoices}
        />

        {/* Order number change dialog */}
        <Dialog
          open={updateOrderNumberDialogOpen}
          onClose={() => !isUpdatingOrderNumber && setUpdateOrderNumberDialogOpen(false)}
        >
          <DialogTitle>⚠️ Potwierdź zmianę numeru CO</DialogTitle>
          <DialogContent>
            <DialogContentText>
              <strong>Zmiana numeru zamówienia z:</strong>
              <br />
              <Chip label={order?.orderNumber} color="error" sx={{ my: 1 }} />
              <br />
              <strong>na:</strong>
              <br />
              <Chip label={newOrderNumber} color="success" sx={{ my: 1 }} />
              <br /><br />
              Ta operacja zaktualizuje numer CO we wszystkich powiązanych dokumentach:
              <ul>
                <li>Fakturach</li>
                <li>Zadaniach produkcyjnych (MO)</li>
                <li>Dokumentach CMR</li>
                <li>Partiach magazynowych</li>
              </ul>
              <Alert severity="warning" sx={{ mt: 2 }}>
                Ta operacja jest nieodwracalna. Upewnij się, że nowy numer jest poprawny.
              </Alert>
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setUpdateOrderNumberDialogOpen(false)} disabled={isUpdatingOrderNumber}>
              Anuluj
            </Button>
            <Button onClick={handleUpdateOrderNumber} variant="contained" color="primary" disabled={isUpdatingOrderNumber}>
              {isUpdatingOrderNumber ? (
                <>
                  <CircularProgress size={20} sx={mr1} />
                  Aktualizuję...
                </>
              ) : (
                'Potwierdź zmianę'
              )}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Invoice popover */}
        <Popover
          open={Boolean(invoicePopoverAnchor)}
          anchorEl={invoicePopoverAnchor}
          onClose={() => {
            setInvoicePopoverAnchor(null);
            setSelectedInvoiceData(null);
          }}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
          transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        >
          {selectedInvoiceData && (
            <Box sx={{ p: 2, minWidth: 300 }}>
              <Typography variant="h6" sx={mb1}>
                {t('orderDetails.invoicePopover.title', { itemName: selectedInvoiceData.itemName })}
              </Typography>
              <Divider sx={mb1} />
              <Typography variant="body2" color="text.secondary" sx={mb2}>
                {t('orderDetails.invoicePopover.totalInvoiced')} {formatCurrency(selectedInvoiceData.totalInvoiced)}
              </Typography>
              <List dense>
                {selectedInvoiceData.invoices.map((invoice, idx) => (
                  <ListItemButton
                    key={idx}
                    onClick={() => {
                      window.open(`/invoices/${invoice.invoiceId}`, '_blank');
                      setInvoicePopoverAnchor(null);
                      setSelectedInvoiceData(null);
                    }}
                    sx={{ borderRadius: 1, mb: 0.5, '&:hover': { bgcolor: 'action.hover' } }}
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Typography variant="body2" fontWeight="medium">{invoice.invoiceNumber}</Typography>
                            <OpenInNewIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                          </Box>
                          <Typography variant="body2" color="success.main" fontWeight="medium">
                            {formatCurrency(invoice.itemValue)}
                          </Typography>
                        </Box>
                      }
                      secondary={
                        <Typography variant="caption" color="text.secondary">
                          {t('orderDetails.invoicePopover.quantity')} {invoice.quantity}
                        </Typography>
                      }
                    />
                  </ListItemButton>
                ))}
              </List>
              <Divider sx={{ mt: 1, mb: 1 }} />
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center' }}>
                {t('orderDetails.invoicePopover.clickToNavigate')}
              </Typography>
            </Box>
          )}
        </Popover>

        {/* Status change dialog */}
        <Dialog open={statusDialogOpen} onClose={() => setStatusDialogOpen(false)}>
          <DialogTitle>{t('orderDetails.dialogs.statusChange.title')}</DialogTitle>
          <DialogContent>
            <DialogContentText sx={mb2}>
              {t('orderDetails.dialogs.statusChange.selectStatus')}
              <br />
              {t('orderDetails.dialogs.statusChange.orderNumber')} {order?.orderNumber || order?.id?.substring(0, 8).toUpperCase()}
            </DialogContentText>
            <FormControl fullWidth>
              <InputLabel id="new-status-label">{t('orderDetails.dialogs.statusChange.status')}</InputLabel>
              <Select
                labelId="new-status-label"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                label={t('orderDetails.dialogs.statusChange.status')}
              >
                {ORDER_STATUSES.map((status) => (
                  <MenuItem key={status.value} value={status.value}>{status.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setStatusDialogOpen(false)}>{t('orderDetails.dialogs.statusChange.cancel')}</Button>
            <Button color="primary" onClick={handleStatusUpdate}>{t('orderDetails.dialogs.statusChange.update')}</Button>
          </DialogActions>
        </Dialog>

      </Box>
    </DetailPageLayout>
  );
};

export default OrderDetails;
