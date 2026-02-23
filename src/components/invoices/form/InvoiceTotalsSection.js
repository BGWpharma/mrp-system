import React from 'react';
import {
  Box,
  Typography,
  Grid,
  Divider,
  CircularProgress
} from '@mui/material';
import { mb1 } from '../../../styles/muiCommonStyles';
import ProformaSettlementSection from './ProformaSettlementSection';

const InvoiceTotalsSection = React.memo(({
  invoice,
  selectedOrder,
  availableProformas,
  relatedInvoices,
  loadingRelatedInvoices,
  availableProformaAmount,
  handleProformaAllocationChange,
  getTotalAllocatedAmount,
  getFilteredProformas,
  showAllProformas,
  setShowAllProformas,
  t
}) => {
  const totalNetto = invoice.items.reduce((sum, item) => {
    const netValue = Number(item.netValue) || (Number(item.quantity) || 0) * (Number(item.price) || 0);
    const roundedNetValue = Math.round(netValue * 10000) / 10000;
    return sum + roundedNetValue;
  }, 0);

  const totalVat = invoice.items.reduce((sum, item) => {
    const netValue = Number(item.netValue) || (Number(item.quantity) || 0) * (Number(item.price) || 0);
    const roundedNetValue = Math.round(netValue * 10000) / 10000;
    
    let vatRate = 0;
    if (typeof item.vat === 'number') {
      vatRate = item.vat;
    } else if (item.vat !== "ZW" && item.vat !== "NP") {
      vatRate = parseFloat(item.vat) || 0;
    }
    
    const vatValue = roundedNetValue * (vatRate / 100);
    const roundedVatValue = Math.round(vatValue * 10000) / 10000;
    return sum + roundedVatValue;
  }, 0);

  const bruttoValue = totalNetto + totalVat;
  const totalAdvancePayments = invoice.isProforma ? 0 : getTotalAllocatedAmount();
  const finalAmount = bruttoValue - totalAdvancePayments;

  return (
    <>
      <Divider sx={{ my: 3 }} />

      <Grid container spacing={2} justifyContent="flex-end">
        <Grid item xs={12} sm={8} md={6}>
          <Typography variant="body1" fontWeight="bold">
            {t('invoices.form.fields.totals.netTotal')} {totalNetto.toFixed(2)} {invoice.currency || 'EUR'}
          </Typography>
          <Typography variant="body1" fontWeight="bold">
            {t('invoices.form.fields.totals.vatTotal')} {totalVat.toFixed(2)} {invoice.currency || 'EUR'}
          </Typography>
          
          <ProformaSettlementSection
            invoice={invoice}
            availableProformas={availableProformas}
            handleProformaAllocationChange={handleProformaAllocationChange}
            showAllProformas={showAllProformas}
            setShowAllProformas={setShowAllProformas}
            getFilteredProformas={getFilteredProformas}
            t={t}
          />
          
          {!invoice.isProforma && availableProformas.length === 0 && relatedInvoices.length > 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', mt: 2 }}>
              Brak dostępnych proform dla tego zamówienia do rozliczenia zaliczek.
              <br />
              <Typography variant="caption" color="warning.main">
                Uwaga: Tylko w pełni opłacone proformy mogą być użyte do rozliczenia.
              </Typography>
            </Typography>
          )}
          
          {invoice.shippingInfo && invoice.shippingInfo.cost > 0 && (
            <Typography variant="body1" fontWeight="bold">
              Koszt wysyłki: {parseFloat(invoice.shippingInfo.cost).toFixed(2)} {invoice.currency || 'EUR'}
            </Typography>
          )}
          
          {selectedOrder && selectedOrder.linkedPurchaseOrders && selectedOrder.linkedPurchaseOrders.length > 0 && (
            <Typography variant="body1" fontWeight="bold">
              Wartość zaliczek/przedpłat: {selectedOrder.linkedPurchaseOrders.reduce((sum, po) => sum + (parseFloat(po.totalGross || po.value) || 0), 0).toFixed(2)} {invoice.currency || 'EUR'}
            </Typography>
          )}

          {relatedInvoices.length > 0 && (
            <Box sx={{ mt: 2, mb: 2, p: 2, bgcolor: 'info.light', borderRadius: 1 }}>
              <Typography variant="subtitle2" gutterBottom>
                {t('invoices.form.fields.relatedInvoices')}
              </Typography>
              {loadingRelatedInvoices ? (
                <CircularProgress size={20} />
              ) : (
                relatedInvoices.map((relInvoice) => (
                  <Box key={relInvoice.id} sx={mb1}>
                    <Typography variant="body2">
                      {relInvoice.isProforma ? '📋 Proforma' : '📄 Faktura'} {relInvoice.number}
                      {relInvoice.isProforma && (
                        <Typography component="span" sx={{ fontWeight: 'bold', color: 'warning.main', ml: 1 }}>
                          - Kwota: {parseFloat(relInvoice.total || 0).toFixed(2)} {relInvoice.currency || 'EUR'}
                          {availableProformaAmount && relInvoice.id === relatedInvoices.find(inv => inv.isProforma)?.id && (
                            <Typography component="span" sx={{ color: 'success.main', ml: 1 }}>
                              (Dostępne: {availableProformaAmount.available.toFixed(2)} {relInvoice.currency || 'EUR'})
                            </Typography>
                          )}
                        </Typography>
                      )}
                    </Typography>
                    {relInvoice.issueDate && (
                      <Typography variant="caption" color="text.secondary">
                        {t('invoices.form.fields.issueDate')}: {new Date(relInvoice.issueDate).toLocaleDateString()}
                      </Typography>
                    )}
                  </Box>
                ))
              )}
            </Box>
          )}
          
          <Typography variant="h6" fontWeight="bold" color="primary">
            {t('invoices.form.fields.totals.grossTotal')} {bruttoValue.toFixed(2)} {invoice.currency || 'EUR'}
          </Typography>
          
          {!invoice.isProforma && totalAdvancePayments > 0 && (
            <>
              <Typography variant="body1" color="warning.main" sx={{ mt: 1 }}>
                Przedpłaty z proform: -{totalAdvancePayments.toFixed(2)} {invoice.currency || 'EUR'}
              </Typography>
              <Typography variant="h5" fontWeight="bold" color="success.main" sx={{ mt: 1 }}>
                Do zapłaty: {finalAmount.toFixed(2)} {invoice.currency || 'EUR'}
              </Typography>
            </>
          )}
          
          {!invoice.isProforma && totalAdvancePayments === 0 && (
            <Typography variant="h6" fontWeight="bold" color="success.main" sx={{ mt: 1 }}>
              Do zapłaty: {bruttoValue.toFixed(2)} {invoice.currency || 'EUR'}
            </Typography>
          )}
        </Grid>
      </Grid>
    </>
  );
});

InvoiceTotalsSection.displayName = 'InvoiceTotalsSection';

export default InvoiceTotalsSection;
