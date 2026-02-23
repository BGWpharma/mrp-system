import React from 'react';
import {
  Box,
  Typography,
  FormControlLabel,
  Checkbox,
  Card,
  Grid,
  TextField,
  Tooltip
} from '@mui/material';
import { preciseCompare } from '../../../utils/mathUtils';

const ProformaSettlementSection = React.memo(({
  invoice,
  availableProformas,
  handleProformaAllocationChange,
  showAllProformas,
  setShowAllProformas,
  getFilteredProformas,
  t
}) => {
  if (invoice.isProforma || availableProformas.length === 0) {
    return null;
  }

  return (
    <Box sx={{ mt: 2, mb: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle1">
          {t('invoices.form.fields.proformaSettlement')}
        </Typography>
        <FormControlLabel
          control={
            <Checkbox
              checked={showAllProformas}
              onChange={(e) => setShowAllProformas(e.target.checked)}
              size="small"
            />
          }
          label="Pokaż wszystkie proformy"
        />
      </Box>
      
      {!showAllProformas && invoice.items && invoice.items.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontStyle: 'italic' }}>
          Wyświetlane są tylko proformy zawierające pozycje z tej faktury. 
          Zaznacz checkbox powyżej, aby wyświetlić wszystkie dostępne proformy.
        </Typography>
      )}
      
      {(() => {
        const filteredProformas = getFilteredProformas(availableProformas, invoice.items);
        
        if (filteredProformas.length === 0 && !showAllProformas) {
          return (
            <Typography variant="body2" color="warning.main" sx={{ p: 2, bgcolor: 'warning.lighter', borderRadius: 1 }}>
              Brak proform zawierających pozycje z tej faktury. 
              Zaznacz "Pokaż wszystkie proformy" aby wyświetlić wszystkie dostępne proformy.
            </Typography>
          );
        }
        
        return filteredProformas.map((proforma) => {
          const allocation = (invoice.proformAllocation || []).find(a => a.proformaId === proforma.id);
          const allocatedAmount = allocation ? allocation.amount : 0;
          
          return (
            <Card key={proforma.id} variant="outlined" sx={{ mb: 2, p: 2 }}>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} md={5}>
                  <Typography variant="body1" fontWeight="bold">
                    📋 {t('invoices.form.toggleButtons.proforma')} {proforma.number}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {t('invoices.form.fields.issueDate')}: {proforma.issueDate ? 
                      (proforma.issueDate.seconds ? 
                        new Date(proforma.issueDate.seconds * 1000).toLocaleDateString() 
                        : new Date(proforma.issueDate).toLocaleDateString()
                      ) : t('common.noDate')}
                  </Typography>
                  {!showAllProformas && proforma.items && invoice.items && (
                    (() => {
                      const commonItems = proforma.items.filter(pItem => 
                        invoice.items.some(iItem => 
                          (pItem.orderItemId && iItem.orderItemId && pItem.orderItemId === iItem.orderItemId) ||
                          (pItem.id && iItem.id && pItem.id === iItem.id) ||
                          (pItem.name && iItem.name && pItem.name.trim().toLowerCase() === iItem.name.trim().toLowerCase())
                        )
                      );
                      
                      if (commonItems.length === 0) return null;
                      
                      const itemNames = commonItems.map(item => item.name).join(', ');
                      const isLongList = itemNames.length > 60;
                      
                      return (
                        <Box sx={{ mt: 1, p: 1, bgcolor: 'primary.lighter', borderRadius: 1 }}>
                          <Typography variant="caption" fontWeight="bold" color="primary.main" sx={{ display: 'block' }}>
                            Wspólne pozycje ({commonItems.length}):
                          </Typography>
                          {isLongList ? (
                            <Tooltip title={itemNames} arrow placement="top">
                              <Typography variant="caption" color="primary.main" sx={{ display: 'block', cursor: 'help' }}>
                                {itemNames.substring(0, 60)}... <strong>(najedź aby zobaczyć wszystkie)</strong>
                              </Typography>
                            </Tooltip>
                          ) : (
                            <Typography variant="caption" color="primary.main" sx={{ display: 'block' }}>
                              {itemNames}
                            </Typography>
                          )}
                        </Box>
                      );
                    })()
                  )}
                </Grid>
                
                <Grid item xs={12} md={3}>
                  <Typography variant="body2">
                    <strong>{t('invoices.form.fields.available')}:</strong> {proforma.amountInfo.available.toFixed(2)} {proforma.currency || 'EUR'}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t('invoices.form.fields.from')} {proforma.amountInfo.total.toFixed(2)} {proforma.currency || 'EUR'} 
                    ({t('invoices.form.fields.used')}: {proforma.amountInfo.used.toFixed(2)})
                  </Typography>
                </Grid>
                
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    size="small"
                    label={t('invoices.form.fields.amountToSettle')}
                    type="number"
                    value={allocatedAmount}
                    onChange={(e) => {
                      const amount = parseFloat(e.target.value) || 0;
                      handleProformaAllocationChange(proforma.id, amount, proforma.number);
                    }}
                    InputProps={{
                      endAdornment: <Typography variant="caption">{invoice.currency || 'EUR'}</Typography>,
                      inputProps: { 
                        min: 0, 
                        step: 0.01,
                        max: proforma.amountInfo.available
                      }
                    }}
                    error={(() => {
                      const tolerance = 0.01;
                      return preciseCompare(allocatedAmount, proforma.amountInfo.available, tolerance) > 0;
                    })()}
                    helperText={(() => {
                      const tolerance = 0.01;
                      const exceedsLimit = preciseCompare(allocatedAmount, proforma.amountInfo.available, tolerance) > 0;
                      if (exceedsLimit) {
                        return `${t('invoices.form.fields.exceedsAvailable')} (${proforma.amountInfo.available.toFixed(2)})`;
                      }
                      return `${t('invoices.form.fields.available')}: ${proforma.amountInfo.available.toFixed(2)}`;
                    })()}
                    disabled={proforma.amountInfo.available <= 0}
                  />
                </Grid>
              </Grid>
              
              {proforma.amountInfo.available <= 0 && (
                <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>
                  ⚠️ {t('invoices.form.fields.proformaFullyUsed')}
                </Typography>
              )}
            </Card>
          );
        });
      })()}
      
      {(invoice.proformAllocation || []).length > 0 && (
        <Box sx={{ mt: 2, p: 2, bgcolor: 'success.light', borderRadius: 1 }}>
          <Typography variant="subtitle2" gutterBottom>
            {t('invoices.form.fields.settlementSummary')}
          </Typography>
          {(invoice.proformAllocation || []).map((allocation) => (
            <Typography key={allocation.proformaId} variant="body2">
              • {t('invoices.form.toggleButtons.proforma')} {allocation.proformaNumber}: {allocation.amount.toFixed(2)} {invoice.currency || 'EUR'}
            </Typography>
          ))}
          <Typography variant="body1" fontWeight="bold" sx={{ mt: 1 }}>
            {t('invoices.form.fields.totalAdvanceAmount')} {(invoice.proformAllocation || []).reduce((sum, a) => sum + a.amount, 0).toFixed(2)} {invoice.currency || 'EUR'}
          </Typography>
        </Box>
      )}
    </Box>
  );
});

ProformaSettlementSection.displayName = 'ProformaSettlementSection';

export default ProformaSettlementSection;
