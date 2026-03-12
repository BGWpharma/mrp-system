import React from 'react';
import { Typography, Paper, Box, Grid, Divider } from '@mui/material';
import { formatCurrency } from '../../../utils/formatting';
import { mb2 } from '../../../styles/muiCommonStyles';

const POSummarySection = ({ purchaseOrder, calculateVATValues, t }) => {
  const vatValues = calculateVATValues(
    purchaseOrder.items,
    purchaseOrder.additionalCostsItems,
    purchaseOrder.globalDiscount
  );

  return (
    <Grid container spacing={2}>
      <Grid item xs={12} md={6}>
        {purchaseOrder.notes && (
          <>
            <Typography variant="subtitle1" gutterBottom>{t('purchaseOrders.details.table.notes')}:</Typography>
            <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.paper' }}>
              <Typography variant="body2">{purchaseOrder.notes}</Typography>
            </Paper>
          </>
        )}
      </Grid>
      <Grid item xs={12} md={6}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          {/* Wartość produktów */}
          <Paper elevation={0} sx={{ p: 2, mb: 2, bgcolor: 'background.default', width: '100%', borderRadius: 2 }}>
            <Typography variant="body1" gutterBottom sx={{ color: 'text.primary' }}>
              <strong>{t('purchaseOrders.details.summary.productsNetValue')}:</strong>{' '}
              {formatCurrency(purchaseOrder.items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0), purchaseOrder.currency)}
            </Typography>
            {purchaseOrder.items.length > 0 && (
              <>
                <Typography variant="subtitle2" sx={{ mt: 1.5, mb: 0.5, color: 'text.secondary' }}>
                  {t('purchaseOrders.details.summary.vatFromProducts')}:
                </Typography>
                <Box sx={{ pl: 2 }}>
                  {Array.from(new Set(purchaseOrder.items.map(item => item.vatRate))).sort((a, b) => a - b).map(vatRate => {
                    if (vatRate === undefined) return null;
                    const itemsWithSameVat = purchaseOrder.items.filter(item => item.vatRate === vatRate);
                    const sumNet = itemsWithSameVat.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0);
                    const vatValue = typeof vatRate === 'number' ? (sumNet * vatRate) / 100 : 0;
                    return (
                      <Typography key={vatRate} variant="body2" sx={{ mb: 0.5, color: 'text.secondary' }}>
                        Stawka {vatRate}%: <strong>{formatCurrency(vatValue, purchaseOrder.currency)}</strong>{' '}
                        <span style={{ fontSize: '0.85em' }}>(od {formatCurrency(sumNet, purchaseOrder.currency)})</span>
                      </Typography>
                    );
                  })}
                </Box>
              </>
            )}
          </Paper>

          {/* Dodatkowe koszty z VAT */}
          {purchaseOrder.additionalCostsItems?.length > 0 && (
            <Paper elevation={0} sx={{ p: 2, mb: 2, bgcolor: 'background.default', width: '100%', borderRadius: 2 }}>
              <Typography variant="subtitle1" gutterBottom sx={{ color: 'text.primary', mb: 1.5 }}>
                <strong>{t('purchaseOrders.details.additionalCostsDetails')}:</strong>
              </Typography>
              {purchaseOrder.additionalCostsItems.map((cost, index) => {
                const getAffectedItemsNames = () => {
                  if (!cost.affectedItems || cost.affectedItems.length === 0) return null;
                  const affectedItems = purchaseOrder.items.filter(item => cost.affectedItems.includes(item.id));
                  return affectedItems.length === 0 ? [] : affectedItems.map(item => item.name);
                };
                const affectedItemsNames = getAffectedItemsNames();
                const costValue = parseFloat(cost.value) || 0;
                const vatRate = typeof cost.vatRate === 'number' ? cost.vatRate : 0;
                const vatValue = (costValue * vatRate) / 100;

                return (
                  <Box key={index} sx={{
                    mb: 1.5,
                    pb: index < purchaseOrder.additionalCostsItems.length - 1 ? 1.5 : 0,
                    borderBottom: index < purchaseOrder.additionalCostsItems.length - 1 ? '1px solid' : 'none',
                    borderColor: 'divider'
                  }}>
                    <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary', mb: 0.5 }}>
                      {cost.description || `Dodatkowy koszt ${index + 1}`}: <strong>{formatCurrency(costValue, purchaseOrder.currency)}</strong>
                    </Typography>
                    {vatRate > 0 && (
                      <Typography variant="body2" sx={{ pl: 2, mb: 0.5, color: 'text.secondary' }}>
                        VAT {vatRate}%: <strong>{formatCurrency(vatValue, purchaseOrder.currency)}</strong>
                      </Typography>
                    )}
                    {affectedItemsNames === null ? (
                      <Typography variant="caption" sx={{ pl: 2, color: 'text.secondary', display: 'block', fontStyle: 'italic' }}>
                        Przypisane do wszystkich pozycji
                      </Typography>
                    ) : affectedItemsNames.length > 0 ? (
                      <Typography variant="caption" sx={{ pl: 2, color: 'primary.main', display: 'block', fontStyle: 'italic' }}>
                        Przypisane do: {affectedItemsNames.join(', ')}
                      </Typography>
                    ) : (
                      <Typography variant="caption" sx={{ pl: 2, color: 'warning.main', display: 'block', fontStyle: 'italic' }}>
                        ⚠️ Brak przypisanych pozycji (sprawdź konfigurację)
                      </Typography>
                    )}
                  </Box>
                );
              })}
            </Paper>
          )}

          {/* Podsumowanie końcowe */}
          <Divider sx={{ width: '100%', mb: 2 }} />
          <Box sx={{ width: '100%' }}>
            {parseFloat(purchaseOrder.globalDiscount || 0) > 0 && (
              <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1, textAlign: 'right' }}>
                {t('purchaseOrders.details.summary.beforeDiscount')}: <strong>{formatCurrency(vatValues.totalGrossBeforeDiscount, purchaseOrder.currency)}</strong>
              </Typography>
            )}
            <Typography variant="subtitle1" gutterBottom sx={{ textAlign: 'right' }}>
              <strong>{t('purchaseOrders.details.summary.netValue')}:</strong> {formatCurrency(vatValues.totalNet, purchaseOrder.currency)}
            </Typography>
            <Typography variant="subtitle1" gutterBottom sx={{ textAlign: 'right' }}>
              <strong>{t('purchaseOrders.details.summary.totalVAT')}:</strong> {formatCurrency(vatValues.totalVat, purchaseOrder.currency)}
            </Typography>
            {parseFloat(purchaseOrder.globalDiscount || 0) > 0 && (
              <Typography variant="body2" sx={{ color: 'success.main', mb: 1, textAlign: 'right' }}>
                {t('purchaseOrders.details.summary.globalDiscount')} ({purchaseOrder.globalDiscount}%): <strong>-{formatCurrency(vatValues.discountAmount, purchaseOrder.currency)}</strong>
              </Typography>
            )}
            <Divider sx={{ my: 1 }} />
            <Typography variant="h6" sx={{ mt: 1, textAlign: 'right', color: 'primary.main' }}>
              <strong>{t('purchaseOrders.details.summary.grossValue')}:</strong> {formatCurrency(vatValues.totalGross, purchaseOrder.currency)}
            </Typography>
          </Box>
        </Box>
      </Grid>
    </Grid>
  );
};

export default POSummarySection;
