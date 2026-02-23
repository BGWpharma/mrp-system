import React from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  Grid
} from '@mui/material';
import {
  Add as AddIcon,
  Assignment as AssignmentIcon
} from '@mui/icons-material';
import InvoiceItemRow from './InvoiceItemRow';

const InvoiceItemsList = React.memo(({
  invoice,
  selectedOrder,
  selectedOrderType,
  handleOpenOrderItemsDialog,
  handleAddItem,
  handleItemChange,
  handleRemoveItem,
  t
}) => {
  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">
          {t('invoices.form.fields.invoiceItems')}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {selectedOrder && selectedOrderType === 'customer' && selectedOrder.items && selectedOrder.items.length > 0 && (
            <Button
              variant="contained"
              color="primary"
              startIcon={<AssignmentIcon />}
              onClick={() => handleOpenOrderItemsDialog(selectedOrder.items)}
            >
              {t('invoices.form.buttons.selectFromOrder')}
            </Button>
          )}
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={handleAddItem}
          >
            {t('invoices.form.buttons.addItem')}
          </Button>
        </Box>
      </Box>

      {invoice.items.map((item, index) => (
        <InvoiceItemRow
          key={index}
          item={item}
          index={index}
          currency={invoice.currency}
          handleItemChange={handleItemChange}
          handleRemoveItem={handleRemoveItem}
          disableRemove={invoice.items.length <= 1}
          t={t}
        />
      ))}

      {invoice.shippingInfo && invoice.shippingInfo.cost > 0 && (
        <Card variant="outlined" sx={{ mb: 2, p: 2, bgcolor: 'info.lighter' }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={6}>
              <Typography variant="body1" fontWeight="bold">
                Koszt wysyłki ({invoice.shippingInfo.method})
              </Typography>
            </Grid>
            <Grid item xs={6} sm={3}>
              <Typography variant="body1">
                Wartość netto: {parseFloat(invoice.shippingInfo.cost).toFixed(2)} {invoice.currency || 'EUR'}
              </Typography>
            </Grid>
          </Grid>
        </Card>
      )}

      {selectedOrder && selectedOrder.linkedPurchaseOrders && selectedOrder.linkedPurchaseOrders.length > 0 && (
        <>
          <Typography variant="subtitle1" sx={{ mt: 3, mb: 1 }}>
            Zaliczki/Przedpłaty:
          </Typography>
          
          {selectedOrder.linkedPurchaseOrders.map((po, index) => {
            let poValue = 0;
            let productsValue = 0;
            let additionalCostsValue = 0;
            
            if (po.calculatedTotalValue !== undefined) {
              poValue = parseFloat(po.calculatedTotalValue);
            } else if (po.finalGrossValue !== undefined) {
              poValue = parseFloat(po.finalGrossValue);
            } else if (po.totalGross !== undefined) {
              poValue = parseFloat(po.totalGross) || 0;
            } else if (po.value !== undefined) {
              poValue = parseFloat(po.value) || 0;
            } else if (po.total !== undefined) {
              poValue = parseFloat(po.total) || 0;
            }
            
            if (po.calculatedProductsValue !== undefined) {
              productsValue = parseFloat(po.calculatedProductsValue);
            } else if (po.totalValue !== undefined) {
              productsValue = parseFloat(po.totalValue) || 0;
            } else if (po.netValue !== undefined) {
              productsValue = parseFloat(po.netValue) || 0;
            } else if (Array.isArray(po.items)) {
              productsValue = po.items.reduce((sum, item) => {
                return sum + (parseFloat(item.totalPrice) || parseFloat(item.price) * parseFloat(item.quantity) || 0);
              }, 0);
            }
            
            if (po.calculatedAdditionalCosts !== undefined) {
              additionalCostsValue = parseFloat(po.calculatedAdditionalCosts);
            } else if (po.additionalCostsItems && Array.isArray(po.additionalCostsItems)) {
              additionalCostsValue = po.additionalCostsItems.reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0);
            } else if (po.additionalCosts) {
              additionalCostsValue = parseFloat(po.additionalCosts) || 0;
            }
            
            if (productsValue + additionalCostsValue > poValue) {
              poValue = productsValue + additionalCostsValue;
            }
            
            return (
              <Card key={`po-${index}`} variant="outlined" sx={{ mb: 2, p: 2, bgcolor: 'warning.lighter' }}>
                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body1" fontWeight="bold">
                      Zaliczka/Przedpłata {po.number || po.id}
                    </Typography>
                    {po.supplier && (
                      <Typography variant="body2">
                        Dostawca: {po.supplier.name}
                      </Typography>
                    )}
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body1">
                      Wartość netto: {productsValue.toFixed(2)} {invoice.currency || 'EUR'}
                    </Typography>
                    {additionalCostsValue > 0 && (
                      <Typography variant="body1" color="primary">
                        Dodatkowe opłaty: {additionalCostsValue.toFixed(2)} {invoice.currency || 'EUR'}
                      </Typography>
                    )}
                    <Typography variant="body1" fontWeight="bold">
                      Wartość zaliczki: {poValue.toFixed(2)} {invoice.currency || 'EUR'}
                    </Typography>
                  </Grid>
                </Grid>
              </Card>
            );
          })}
        </>
      )}
    </>
  );
});

InvoiceItemsList.displayName = 'InvoiceItemsList';

export default InvoiceItemsList;
