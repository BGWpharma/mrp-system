import React from 'react';
import {
  Box,
  Typography,
  Button,
  Card,
  CardContent,
  Divider,
  Autocomplete,
  TextField,
  CircularProgress
} from '@mui/material';
import {
  Person as PersonIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { calculateInvoiceTotalGross } from '../../../services/invoiceService';
import { mb2, mt2 } from '../../../styles/muiCommonStyles';

const CustomerAndOrderSelector = React.memo(({
  invoice,
  setInvoice,
  setCustomerDialogOpen,
  refreshingCustomer,
  refreshCustomerData,
  selectedOrderType,
  selectedOrderId,
  ordersLoading,
  poSearchLoading,
  filteredOrders,
  poSearchResults,
  poSearchTerm,
  setPoSearchTerm,
  handleOrderSelect,
  selectedOrder,
  handleOpenOrderItemsDialog,
  showSuccess,
  t
}) => {
  return (
    <Card variant="outlined" sx={{ height: '100%' }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="subtitle1">
            {t('invoices.form.fields.client')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              startIcon={<PersonIcon />}
              onClick={() => setCustomerDialogOpen(true)}
              size="small"
            >
              {t('invoices.form.buttons.selectClient')}
            </Button>
            {invoice.customer?.id && (
              <Button
                variant="outlined"
                startIcon={refreshingCustomer ? <CircularProgress size={16} /> : <RefreshIcon />}
                onClick={refreshCustomerData}
                disabled={refreshingCustomer}
                size="small"
                color="secondary"
                title="Odśwież dane klienta"
              >
                {refreshingCustomer ? 'Odświeżanie...' : t('invoices.form.buttons.refresh')}
              </Button>
            )}
          </Box>
        </Box>
        
        {invoice.customer?.id ? (
          <Box>
            <Typography variant="body1" fontWeight="bold" gutterBottom>
              {typeof invoice.customer.name === 'string' ? invoice.customer.name : 'Brak nazwy'}
            </Typography>
            {invoice.customer?.email && typeof invoice.customer.email === 'string' && invoice.customer.email.trim() !== '' && (
              <Typography variant="body2" gutterBottom>
                Email: {invoice.customer.email}
              </Typography>
            )}
            {invoice.customer?.phone && typeof invoice.customer.phone === 'string' && invoice.customer.phone.trim() !== '' && (
              <Typography variant="body2" gutterBottom>
                Telefon: {invoice.customer.phone}
              </Typography>
            )}
            {invoice.customer?.vatEu && typeof invoice.customer.vatEu === 'string' && invoice.customer.vatEu.trim() !== '' && (
              <Typography variant="body2" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                VAT-EU: {invoice.customer.vatEu}
              </Typography>
            )}
            {invoice.billingAddress && typeof invoice.billingAddress === 'string' && invoice.billingAddress.trim() !== '' && (
              <Typography variant="body2" gutterBottom>
                Adres do faktury: {invoice.billingAddress}
              </Typography>
            )}
            {invoice.shippingAddress && typeof invoice.shippingAddress === 'string' && invoice.shippingAddress.trim() !== '' && (
              <Typography variant="body2" gutterBottom>
                Adres dostawy: {invoice.shippingAddress}
              </Typography>
            )}
            
            <Divider sx={{ my: 2 }} />
            
            <Autocomplete
              fullWidth
              size="small"
              sx={mb2}
              options={selectedOrderType === 'customer' ? filteredOrders : poSearchResults}
              getOptionLabel={(option) => {
                if (selectedOrderType === 'customer') {
                  return `${option.orderNumber} - ${option.customer?.name}${option.orderDate ? ` (${option.orderDate.toLocaleDateString()})` : ''}`;
                } else {
                  return `${option.number} - ${option.supplier?.name} (${option.status})`;
                }
              }}
              value={selectedOrderType === 'customer' 
                ? filteredOrders.find(order => order.id === selectedOrderId) || null
                : poSearchResults.find(po => po.id === selectedOrderId) || null
              }
              onChange={(event, newValue) => {
                handleOrderSelect(newValue ? newValue.id : '', selectedOrderType);
              }}
              onInputChange={(event, value, reason) => {
                if (selectedOrderType === 'purchase' && reason === 'input') {
                  setPoSearchTerm(value);
                }
              }}
              filterOptions={selectedOrderType === 'purchase' 
                ? (x) => x
                : undefined
              }
              loading={ordersLoading || poSearchLoading}
              disabled={selectedOrderType === 'customer' && filteredOrders.length === 0 && !ordersLoading}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={selectedOrderType === 'purchase' 
                    ? t('invoices.form.searchPurchaseOrderForReinvoice')
                    : t('invoices.form.fields.relatedOrder')
                  }
                  placeholder={selectedOrderType === 'purchase' 
                    ? "Wpisz numer PO (min. 2 znaki)..."
                    : t('invoices.form.searchOrder')
                  }
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {(ordersLoading || poSearchLoading) ? <CircularProgress color="inherit" size={20} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
              noOptionsText={
                selectedOrderType === 'purchase' 
                  ? (poSearchTerm.length < 2 ? "Wpisz min. 2 znaki numeru PO..." : "Brak wyników")
                  : "Brak zamówień do wyświetlenia"
              }
              clearText="Wyczyść"
              closeText={t('common:common.close')}
              openText="Otwórz"
            />
            
            {selectedOrderId && selectedOrderType === 'purchase' && selectedOrder && (
              <Card variant="outlined" sx={{ mt: 2, p: 2, bgcolor: 'rgba(156, 39, 176, 0.05)', borderColor: 'secondary.main' }}>
                <Typography variant="subtitle2" gutterBottom sx={{ color: 'secondary.main', fontWeight: 'bold' }}>
                  🔄 Wybrane PO dla refaktury: {selectedOrder.number}
                </Typography>
                <Divider sx={{ my: 1 }} />
                <Typography variant="body2" gutterBottom>
                  <strong>Dostawca:</strong> {selectedOrder.supplier?.name || 'N/A'}
                </Typography>
                <Typography variant="body2" gutterBottom>
                  <strong>Wartość:</strong> {selectedOrder.totalGross ? `${parseFloat(selectedOrder.totalGross).toFixed(2)} ${selectedOrder.currency || 'EUR'}` : 'N/A'}
                </Typography>
                <Typography variant="body2">
                  <strong>Status:</strong> {selectedOrder.status}
                </Typography>
                {selectedOrder.items && selectedOrder.items.length > 0 && (
                  <Button
                    variant="contained"
                    size="small"
                    color="secondary"
                    sx={mt2}
                    onClick={() => {
                      const poItems = selectedOrder.items.map(item => ({
                        name: item.name || '',
                        description: item.description || '',
                        cnCode: item.cnCode || '',
                        quantity: parseFloat(item.quantity || 0),
                        unit: item.unit || 'szt',
                        price: parseFloat(item.unitPrice || 0),
                        vat: parseFloat(item.vatRate ?? 23),
                        netValue: parseFloat(item.totalPrice || 0),
                        grossValue: parseFloat(item.totalPrice || 0) * (1 + parseFloat(item.vatRate ?? 23) / 100),
                        orderItemId: item.id || null
                      }));
                      
                      const mappedAdditionalCostsItems = [];
                      const additionalCosts = selectedOrder.additionalCostsItems || [];
                      
                      additionalCosts.forEach((cost, index) => {
                        const costValue = parseFloat(cost.value) || 0;
                        const vatRate = typeof cost.vatRate === 'number' ? cost.vatRate : 0;
                        
                        if (costValue > 0) {
                          mappedAdditionalCostsItems.push({
                            id: cost.id || `additional-cost-${index}`,
                            name: cost.description || `Dodatkowy koszt ${index + 1}`,
                            description: '',
                            quantity: 1,
                            unit: 'szt.',
                            price: costValue,
                            netValue: costValue,
                            totalPrice: costValue,
                            vat: vatRate,
                            cnCode: '',
                            isAdditionalCost: true,
                            originalCostId: cost.id
                          });
                        }
                      });
                      
                      const allInvoiceItems = [...poItems, ...mappedAdditionalCostsItems];
                      
                      const totalAdditionalCosts = additionalCosts.reduce(
                        (sum, cost) => sum + (parseFloat(cost.value) || 0), 
                        0
                      );
                      
                      setInvoice(prev => ({
                        ...prev,
                        items: allInvoiceItems,
                        additionalCostsItems: additionalCosts,
                        additionalCosts: totalAdditionalCosts,
                        total: calculateInvoiceTotalGross({ 
                          items: allInvoiceItems,
                          additionalCostsItems: additionalCosts
                        })
                      }));
                      
                      showSuccess(`Dodano ${poItems.length} pozycji${mappedAdditionalCostsItems.length > 0 ? ` i ${mappedAdditionalCostsItems.length} kosztów dodatkowych` : ''} z PO`);
                    }}
                  >
                    Załaduj wszystkie pozycje z PO
                  </Button>
                )}
              </Card>
            )}
            
            {selectedOrderId && selectedOrderType === 'customer' && (
                <Typography variant="body2" color="primary" sx={mt2}>
                  {t('invoices.form.fields.relatedOrderInfo', { orderNumber: invoice.orderNumber || selectedOrderId })}
                </Typography>
              )}
          </Box>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Nie wybrano klienta. Kliknij przycisk powyżej, aby wybrać klienta dla tej faktury.
          </Typography>
        )}
      </CardContent>
    </Card>
  );
});

CustomerAndOrderSelector.displayName = 'CustomerAndOrderSelector';

export default CustomerAndOrderSelector;
