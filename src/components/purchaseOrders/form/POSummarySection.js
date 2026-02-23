import React, { memo } from 'react';
import {
  Grid,
  TextField,
  Typography,
  Box,
  Paper,
  Divider,
  alpha
} from '@mui/material';
import { formatNumberClean } from '../../../utils/formatters';
import { mb1, mb2 } from '../../../styles/muiCommonStyles';

const numberInputSx = {
  '& input[type=number]': { '-moz-appearance': 'textfield' },
  '& input[type=number]::-webkit-outer-spin-button': { '-webkit-appearance': 'none', margin: 0 },
  '& input[type=number]::-webkit-inner-spin-button': { '-webkit-appearance': 'none', margin: 0 },
};

const POSummarySection = memo(({ poData, handleChange, t }) => {
  return (
    <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
      <Grid container spacing={2} justifyContent="flex-end">
        <Grid item xs={12} md={5}>
          <Paper sx={{ 
            p: 3, 
            backgroundColor: (theme) => theme.palette.mode === 'dark' 
              ? alpha(theme.palette.background.paper, 0.9)
              : 'grey.50' 
          }}>
            <Typography variant="h6" gutterBottom sx={{ mb: 2, fontWeight: 'bold' }}>
              {t('purchaseOrders.form.summary.title', 'Podsumowanie kosztów')}
            </Typography>

            <Box sx={mb2}>
              <Typography variant="subtitle1" sx={{ fontWeight: 'medium', color: 'text.primary' }}>
                {t('purchaseOrders.form.summary.itemsValue')}: <strong>{formatNumberClean(poData.items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0))} {poData.currency}</strong>
              </Typography>

              {poData.items.length > 0 && (
                <Box sx={{ ml: 2, mt: 1 }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {t('purchaseOrders.form.summary.additionalCostsVat', 'VAT od produktów')}:
                  </Typography>
                  {Array.from(new Set(poData.items.map(item => item.vatRate))).sort((a, b) => a - b).map(vatRate => {
                    if (vatRate === undefined) return null;
                    const itemsWithSameVat = poData.items.filter(item => item.vatRate === vatRate);
                    const sumNet = itemsWithSameVat.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0);
                    const vatValue = typeof vatRate === 'number' ? (sumNet * vatRate) / 100 : 0;
                    return (
                      <Typography key={vatRate} variant="body2" sx={{ pl: 1, color: 'text.secondary' }}>
                        Stawka {vatRate}%: <strong>{formatNumberClean(vatValue)} {poData.currency}</strong> <span style={{ fontSize: '0.85em' }}>(od {formatNumberClean(sumNet)} {poData.currency})</span>
                      </Typography>
                    );
                  })}
                </Box>
              )}
            </Box>

            {poData.additionalCostsItems.length > 0 && (
              <Box sx={mb2}>
                <Typography variant="subtitle1" sx={{ fontWeight: 'medium', color: 'text.primary' }}>
                  {t('purchaseOrders.form.summary.additionalCostsNet')}: <strong>{formatNumberClean(poData.additionalCostsNetTotal || 0)} {poData.currency}</strong>
                </Typography>

                <Box sx={{ ml: 2, mt: 1 }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    {t('purchaseOrders.form.summary.additionalCostsVat')}: <strong>{formatNumberClean(poData.additionalCostsVatTotal || 0)} {poData.currency}</strong>
                  </Typography>
                  {Array.from(new Set(poData.additionalCostsItems.map(cost => cost.vatRate))).sort((a, b) => a - b).map(vatRate => {
                    if (vatRate === undefined) return null;
                    const costsWithSameVat = poData.additionalCostsItems.filter(cost => cost.vatRate === vatRate);
                    const sumNet = costsWithSameVat.reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0);
                    const vatValue = typeof vatRate === 'number' ? (sumNet * vatRate) / 100 : 0;
                    return (
                      <Typography key={vatRate} variant="body2" sx={{ pl: 1, color: 'text.secondary' }}>
                        Stawka {vatRate}%: <strong>{formatNumberClean(vatValue)} {poData.currency}</strong> <span style={{ fontSize: '0.85em' }}>(od {formatNumberClean(sumNet)} {poData.currency})</span>
                      </Typography>
                    );
                  })}
                </Box>

                {poData.additionalCostsItems.some(cost => cost.currency !== poData.currency) && (
                  <Box sx={{ 
                    mt: 1, p: 1, 
                    backgroundColor: (theme) => theme.palette.mode === 'dark' 
                      ? alpha(theme.palette.info.main, 0.15)
                      : 'info.light', 
                    borderRadius: 1 
                  }}>
                    <Typography variant="caption" sx={{ 
                      fontStyle: 'italic', 
                      color: (theme) => theme.palette.mode === 'dark' 
                        ? theme.palette.info.light 
                        : 'info.dark' 
                    }} className="exchange-rate-info">
                      {t('purchaseOrders.form.summary.exchangeRateInfo')}
                    </Typography>
                  </Box>
                )}
              </Box>
            )}

            <Divider sx={{ my: 2 }} />

            {parseFloat(poData.globalDiscount || 0) > 0 && (
              <Box sx={mb1}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {t('purchaseOrders.form.summary.beforeDiscount')}: <strong>{formatNumberClean(poData.totalGrossBeforeDiscount || 0)} {poData.currency}</strong>
                </Typography>
              </Box>
            )}

            <Box sx={mb1}>
              <Typography variant="subtitle1" sx={{ fontWeight: 'medium' }}>
                {t('purchaseOrders.form.summary.netValueTotal')}: <strong>{formatNumberClean(poData.totalValue || 0)} {poData.currency}</strong>
              </Typography>
            </Box>

            <Box sx={mb2}>
              <Typography variant="subtitle1" sx={{ fontWeight: 'medium' }}>
                {t('purchaseOrders.form.summary.vatTotal')}: <strong>{formatNumberClean(poData.totalVat || 0)} {poData.currency}</strong>
              </Typography>
            </Box>

            <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 'medium', minWidth: '150px' }}>
                {t('purchaseOrders.form.summary.globalDiscount')}:
              </Typography>
              <TextField
                type="number"
                size="small"
                value={poData.globalDiscount || 0}
                onChange={(e) => handleChange({ target: { name: 'globalDiscount', value: e.target.value } })}
                inputProps={{ min: 0, max: 100, step: 0.01, 'aria-label': 'Rabat globalny' }}
                sx={{ width: 120, ...numberInputSx }}
                InputProps={{
                  endAdornment: <Typography variant="body2" sx={{ color: 'text.secondary' }}>%</Typography>
                }}
              />
              {parseFloat(poData.globalDiscount || 0) > 0 && (
                <Typography variant="body2" sx={{ color: 'success.main', fontWeight: 'medium' }}>
                  {t('purchaseOrders.form.summary.savings')}: -{formatNumberClean(poData.discountAmount || 0)} {poData.currency}
                </Typography>
              )}
            </Box>

            <Box sx={{ 
              p: 2, 
              backgroundColor: (theme) => theme.palette.mode === 'dark' 
                ? alpha(theme.palette.primary.main, 0.2)
                : 'primary.light', 
              borderRadius: 1 
            }}>
              <Typography variant="h6" sx={{ 
                fontWeight: 'bold', 
                color: (theme) => theme.palette.mode === 'dark' 
                  ? theme.palette.primary.light 
                  : 'primary.dark' 
              }}>
                {t('purchaseOrders.form.summary.grossValue')}: <strong>{formatNumberClean(poData.totalGross || 0)} {poData.currency}</strong>
              </Typography>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
});

POSummarySection.displayName = 'POSummarySection';

export default POSummarySection;
