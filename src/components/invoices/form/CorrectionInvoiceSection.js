import React from 'react';
import {
  Paper,
  Typography,
  Grid,
  TextField,
  Box,
  Chip
} from '@mui/material';

const CorrectionInvoiceSection = React.memo(({ invoice, setInvoice, handleChange, t }) => {
  if (!invoice.isCorrectionInvoice) {
    return null;
  }

  return (
    <Paper sx={{ p: 3, mb: 3, border: '2px solid', borderColor: 'error.main', backgroundColor: 'rgba(211, 47, 47, 0.04)' }}>
      <Typography variant="h6" gutterBottom sx={{ color: 'error.main', display: 'flex', alignItems: 'center', gap: 1 }}>
        📝 {t('invoices.form.toggleButtons.correction')}
      </Typography>
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <TextField
            fullWidth
            multiline
            rows={2}
            label={t('invoices.form.fields.correctionReason')}
            name="correctionReason"
            value={invoice.correctionReason || ''}
            onChange={handleChange}
            placeholder={t('invoices.form.adjustmentPlaceholder')}
            sx={{
              '& .MuiOutlinedInput-root': {
                '& fieldset': { borderColor: 'error.light' },
                '&:hover fieldset': { borderColor: 'error.main' },
                '&.Mui-focused fieldset': { borderColor: 'error.main' }
              }
            }}
          />
        </Grid>
        {invoice.correctedInvoices && invoice.correctedInvoices.length > 0 && (
          <Grid item xs={12}>
            <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
              {t('invoices.form.fields.correctedInvoices')}:
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {invoice.correctedInvoices.map((inv, index) => (
                <Chip 
                  key={inv.invoiceId || index}
                  label={inv.invoiceNumber}
                  size="small"
                  color="error"
                  variant="outlined"
                  onDelete={() => {
                    setInvoice(prev => ({
                      ...prev,
                      correctedInvoices: prev.correctedInvoices.filter(i => i.invoiceId !== inv.invoiceId)
                    }));
                  }}
                />
              ))}
            </Box>
          </Grid>
        )}
      </Grid>
    </Paper>
  );
});

CorrectionInvoiceSection.displayName = 'CorrectionInvoiceSection';

export default CorrectionInvoiceSection;
