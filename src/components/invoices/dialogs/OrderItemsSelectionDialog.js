import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox,
  Tooltip,
  Chip,
  Divider
} from '@mui/material';

const OrderItemsSelectionDialog = React.memo(({
  open,
  onClose,
  invoice,
  selectedOrder,
  availableOrderItems,
  onSelectAllOrderItems,
  onToggleOrderItem,
  onConfirmSelection,
  t
}) => {
  const selectedItems = availableOrderItems.filter(item => item.selected);
  const allSelected = availableOrderItems.every(item => item.selected);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" sx={{ color: invoice.isCorrectionInvoice ? 'error.main' : 'inherit' }}>
            {invoice.isCorrectionInvoice 
              ? `📝 Wybierz pozycje do korekty - ${selectedOrder?.orderNumber}`
              : `${t('invoices.form.buttons.selectFromOrder')} ${selectedOrder?.orderNumber}`
            }
          </Typography>
          <Button
            variant="outlined"
            size="small"
            color={invoice.isCorrectionInvoice ? 'error' : 'primary'}
            onClick={onSelectAllOrderItems}
          >
            {allSelected ? t('invoices.form.buttons.deselectAll') : t('invoices.form.buttons.selectAll')}
          </Button>
        </Box>
        {invoice.isCorrectionInvoice && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Wybierz pozycje do korekty. Korekta zostanie obliczona jako różnica między kosztem produkcji a zafakturowaną wartością.
          </Typography>
        )}
      </DialogTitle>
      <DialogContent>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">{t('common.select')}</TableCell>
                <TableCell>{t('common.name')}</TableCell>
                <TableCell>{t('invoices.form.fields.description')}</TableCell>
                <TableCell>{t('invoices.form.fields.cnCode')}</TableCell>
                <TableCell align="right">
                  {invoice.isCorrectionInvoice ? 'Zafakturowano' : t('invoices.form.fields.quantity')}
                </TableCell>
                <TableCell>{t('invoices.form.fields.unit')}</TableCell>
                <TableCell align="right">{t('common.price')}</TableCell>
                <TableCell align="right">
                  {invoice.isCorrectionInvoice ? 'Wart. zafakturowana' : t('invoices.form.fields.netValue')}
                </TableCell>
                {invoice.isCorrectionInvoice && <TableCell align="right" sx={{ color: 'success.main' }}>Production cost</TableCell>}
                {invoice.isCorrectionInvoice && <TableCell align="right" sx={{ color: 'error.main' }}>Correction</TableCell>}
                {!invoice.isProforma && !invoice.isCorrectionInvoice && <TableCell align="right">Zafakturowano</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {availableOrderItems.map((item, index) => {
                const isDisabledForCorrection = invoice.isCorrectionInvoice && !item.isAvailableForCorrection;
                const isDisabled = (invoice.isProforma && item.hasProforma) || 
                                  (!invoice.isCorrectionInvoice && item.isFullyInvoiced) ||
                                  isDisabledForCorrection;
                
                return (
                <TableRow 
                  key={index}
                  hover={!isDisabled}
                  sx={{ 
                    '&:hover': { 
                      backgroundColor: isDisabled ? 'inherit' : 'action.hover' 
                    },
                    backgroundColor: item.selected ? (invoice.isCorrectionInvoice ? 'rgba(211, 47, 47, 0.12)' : 'action.selected') : 
                                    item.hasProforma ? 'error.light' :
                                    item.isFullyInvoiced && !invoice.isCorrectionInvoice ? 'grey.200' :
                                    isDisabledForCorrection ? 'grey.200' :
                                    'inherit',
                    opacity: isDisabled ? 0.6 : 1
                  }}
                >
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={item.selected}
                      onChange={(e) => {
                        e.stopPropagation();
                        onToggleOrderItem(index);
                      }}
                      disabled={isDisabled}
                      color={invoice.isCorrectionInvoice ? 'error' : 'primary'}
                    />
                  </TableCell>
                  <TableCell 
                    onClick={() => !isDisabled && onToggleOrderItem(index)}
                    sx={{ cursor: isDisabled ? 'not-allowed' : 'pointer' }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {item.name}
                      {item.hasProforma && (
                        <Tooltip title={`Pozycja ma już wystawioną proformę: ${
                          item.proformaInfo.proformas.map(pf => pf.proformaNumber).join(', ')
                        }`}>
                          <Chip 
                            label="Ma proformę" 
                            color="error" 
                            size="small"
                            sx={{ fontSize: '0.7rem' }}
                          />
                        </Tooltip>
                      )}
                      {item.isFullyInvoiced && !invoice.isCorrectionInvoice && (
                        <Tooltip title={`Pozycja została w pełni zafakturowana (${
                          item.invoicedInfo?.invoices.map(inv => inv.invoiceNumber).join(', ')
                        })`}>
                          <Chip 
                            label="W pełni zafakturowane" 
                            color="default" 
                            size="small"
                            sx={{ fontSize: '0.7rem' }}
                          />
                        </Tooltip>
                      )}
                      {invoice.isCorrectionInvoice && item.isAvailableForCorrection && (
                        <Chip 
                          label="Available for correction" 
                          color="error" 
                          size="small"
                          variant="outlined"
                          sx={{ fontSize: '0.7rem' }}
                        />
                      )}
                      {isDisabledForCorrection && (
                        <Chip 
                          label="Nie zafakturowane" 
                          color="default" 
                          size="small"
                          sx={{ fontSize: '0.7rem' }}
                        />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell 
                    onClick={() => !isDisabled && onToggleOrderItem(index)}
                    sx={{ cursor: isDisabled ? 'not-allowed' : 'pointer' }}
                  >
                    {item.description || '-'}
                  </TableCell>
                  <TableCell 
                    onClick={() => !isDisabled && onToggleOrderItem(index)}
                    sx={{ cursor: isDisabled ? 'not-allowed' : 'pointer' }}
                  >
                    {item.cnCode || '-'}
                  </TableCell>
                  <TableCell 
                    align="right"
                    onClick={() => !isDisabled && onToggleOrderItem(index)}
                    sx={{ cursor: isDisabled ? 'not-allowed' : 'pointer' }}
                  >
                    {item.quantity}
                  </TableCell>
                  <TableCell 
                    onClick={() => !isDisabled && onToggleOrderItem(index)}
                    sx={{ cursor: isDisabled ? 'not-allowed' : 'pointer' }}
                  >
                    {item.unit || 'szt.'}
                  </TableCell>
                  <TableCell 
                    align="right"
                    onClick={() => !isDisabled && onToggleOrderItem(index)}
                    sx={{ cursor: isDisabled ? 'not-allowed' : 'pointer' }}
                  >
                    {item.price?.toFixed(4)} {invoice.currency || 'EUR'}
                  </TableCell>
                  <TableCell 
                    align="right"
                    onClick={() => !isDisabled && onToggleOrderItem(index)}
                    sx={{ cursor: isDisabled ? 'not-allowed' : 'pointer' }}
                  >
                    {item.netValue?.toFixed(4)} {invoice.currency || 'EUR'}
                  </TableCell>
                  
                  {invoice.isCorrectionInvoice && (
                    <TableCell align="right" sx={{ color: 'success.main' }}>
                      {item.originalValue?.toFixed(4)} {invoice.currency || 'EUR'}
                    </TableCell>
                  )}
                  
                  {invoice.isCorrectionInvoice && (
                    <TableCell align="right">
                      {item.invoicedInfo ? (() => {
                        const productionValue = item.originalQuantity * item.price;
                        const invoicedValue = item.invoicedInfo.totalInvoicedValue || 0;
                        const correctionValue = productionValue - invoicedValue;
                        const isPositive = correctionValue >= 0;
                        return (
                          <Tooltip
                            title={
                              <Box>
                                <Typography variant="caption" sx={{ display: 'block' }}>
                                  Koszt produkcji: {productionValue.toFixed(4)} {invoice.currency || 'EUR'}
                                </Typography>
                                <Typography variant="caption" sx={{ display: 'block' }}>
                                  Zafakturowano: {invoicedValue.toFixed(4)} {invoice.currency || 'EUR'}
                                </Typography>
                                <Divider sx={{ my: 0.5, borderColor: 'white' }} />
                                <Typography variant="caption" sx={{ display: 'block', fontWeight: 'bold' }}>
                                  Correction: {correctionValue >= 0 ? '+' : ''}{correctionValue.toFixed(4)} {invoice.currency || 'EUR'}
                                </Typography>
                              </Box>
                            }
                            arrow
                          >
                            <Typography 
                              variant="body2" 
                              sx={{ 
                                fontWeight: 'bold',
                                color: isPositive ? 'success.main' : 'error.main',
                                cursor: 'help'
                              }}
                            >
                              {isPositive ? '+' : ''}{correctionValue.toFixed(4)} {invoice.currency || 'EUR'}
                            </Typography>
                          </Tooltip>
                        );
                      })() : '-'}
                    </TableCell>
                  )}
                  
                  {!invoice.isProforma && !invoice.isCorrectionInvoice && (
                    <TableCell align="right">
                      {item.invoicedInfo ? (
                        <Tooltip
                          title={
                            <Box>
                              <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                                Zamówienie: {item.originalQuantity} {item.unit || 'szt.'} = {item.originalValue?.toFixed(4)} {invoice.currency || 'EUR'}
                              </Typography>
                              <Typography variant="caption" sx={{ display: 'block' }}>
                                Zafakturowano: {item.invoicedInfo.totalInvoicedQuantity} {item.unit || 'szt.'} = {item.invoicedInfo.totalInvoicedValue?.toFixed(4)} {invoice.currency || 'EUR'}
                              </Typography>
                              <Typography variant="caption" sx={{ display: 'block', mt: 1, fontWeight: 'bold' }}>
                                Pozostało: {item.quantity} {item.unit || 'szt.'} = {item.netValue?.toFixed(4)} {invoice.currency || 'EUR'}
                              </Typography>
                              <Divider sx={{ my: 1, borderColor: 'white' }} />
                              {item.invoicedInfo.invoices.map((inv, idx) => (
                                <Typography key={idx} variant="caption" sx={{ display: 'block' }}>
                                  • {inv.invoiceNumber}: {inv.quantity} {item.unit || 'szt.'} = {inv.itemValue?.toFixed(4)} {invoice.currency || 'EUR'}
                                </Typography>
                              ))}
                            </Box>
                          }
                          arrow
                          placement="left"
                        >
                          <Box sx={{ cursor: 'help' }}>
                            <Typography variant="caption" sx={{ display: 'block', color: 'success.dark', fontWeight: 'bold' }}>
                              {item.invoicedInfo.totalInvoicedQuantity} {item.unit || 'szt.'}
                            </Typography>
                            <Typography variant="caption" sx={{ display: 'block', color: 'success.dark' }}>
                              {item.invoicedInfo.totalInvoicedValue?.toFixed(4)} {invoice.currency || 'EUR'}
                            </Typography>
                          </Box>
                        </Tooltip>
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          -
                        </Typography>
                      )}
                    </TableCell>
                  )}
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        
        {selectedItems.length > 0 && (
          <Box sx={{ mt: 2, p: 2, bgcolor: invoice.isCorrectionInvoice ? 'rgba(211, 47, 47, 0.1)' : 'info.light', borderRadius: 1 }}>
            <Typography variant="subtitle2">
              Wybrane pozycje: {selectedItems.length}
            </Typography>
            {invoice.isCorrectionInvoice ? (
              <>
                <Typography variant="body2">
                  Zafakturowana wartość: {selectedItems
                    .reduce((sum, item) => sum + (item.invoicedInfo?.totalInvoicedValue || 0), 0)
                    .toFixed(4)} {invoice.currency || 'EUR'}
                </Typography>
                <Typography variant="body2">
                  Koszt produkcji: {selectedItems
                    .reduce((sum, item) => sum + ((item.originalQuantity || 0) * (item.price || 0)), 0)
                    .toFixed(4)} {invoice.currency || 'EUR'}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'error.main', mt: 1 }}>
                  Total correction: {(() => {
                    const total = selectedItems
                      .reduce((sum, item) => {
                        const productionValue = (item.originalQuantity || 0) * (item.price || 0);
                        const invoicedValue = item.invoicedInfo?.totalInvoicedValue || 0;
                        return sum + (productionValue - invoicedValue);
                      }, 0);
                    return `${total >= 0 ? '+' : ''}${total.toFixed(4)}`;
                  })()} {invoice.currency || 'EUR'}
                </Typography>
              </>
            ) : (
              <Typography variant="body2">
                Łączna wartość: {selectedItems
                  .reduce((sum, item) => sum + (item.netValue || 0), 0)
                  .toFixed(4)} {invoice.currency || 'EUR'}
              </Typography>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>
          {t('invoices.form.buttons.cancel')}
        </Button>
        <Button 
          onClick={onConfirmSelection}
          variant="contained"
          disabled={selectedItems.length === 0}
        >
          {t('invoices.form.addSelectedItems', { count: selectedItems.length })}
        </Button>
      </DialogActions>
    </Dialog>
  );
});

OrderItemsSelectionDialog.displayName = 'OrderItemsSelectionDialog';

export default OrderItemsSelectionDialog;
