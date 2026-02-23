import React from 'react';
import {
  Box,
  Typography,
  Switch,
  ToggleButton,
  ToggleButtonGroup
} from '@mui/material';

const InvoiceTypeToggle = React.memo(({ invoiceId, invoice, setInvoice, handleChange, t }) => {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <Typography variant="h4" component="h1">
        {invoiceId ? t('invoices.form.title.edit') : t('invoices.form.title.new')}
      </Typography>
      <ToggleButtonGroup
        value={invoice.isCorrectionInvoice ? 'correction' : (invoice.isProforma ? 'proforma' : 'faktura')}
        exclusive
        onChange={(event, newValue) => {
          if (newValue !== null) {
            const isProforma = newValue === 'proforma';
            const isCorrectionInvoice = newValue === 'correction';
            
            setInvoice(prev => ({
              ...prev,
              isProforma: isProforma,
              isCorrectionInvoice: isCorrectionInvoice,
              isRefInvoice: false,
              correctedInvoices: isCorrectionInvoice ? prev.correctedInvoices : [],
              correctionReason: isCorrectionInvoice ? prev.correctionReason : ''
            }));
          }
        }}
        aria-label="typ dokumentu"
        size="small"
        sx={{
          '& .MuiToggleButton-root': {
            px: 3,
            py: 1,
            fontWeight: 'bold',
            border: '2px solid',
            '&.Mui-selected': {
              backgroundColor: 'primary.main',
              color: 'primary.contrastText',
              '&:hover': {
                backgroundColor: 'primary.dark',
              }
            }
          }
        }}
      >
        <ToggleButton value="faktura" aria-label="faktura">
          📄 {t('invoices.form.toggleButtons.invoice')}
        </ToggleButton>
        <ToggleButton value="proforma" aria-label="proforma">
          📋 {t('invoices.form.toggleButtons.proforma')}
        </ToggleButton>
        <ToggleButton value="correction" aria-label="korekta" sx={{ 
          '&.Mui-selected': { 
            backgroundColor: 'error.main !important',
            '&:hover': { backgroundColor: 'error.dark !important' }
          }
        }}>
          📝 {t('invoices.form.toggleButtons.correction')}
        </ToggleButton>
      </ToggleButtonGroup>
      
      {!invoice.isProforma && !invoice.isCorrectionInvoice && (
        <Box 
          sx={{ 
            mt: 2, 
            p: 1.5, 
            border: '1px solid',
            borderColor: invoice.isRefInvoice ? 'rgba(156, 39, 176, 0.5)' : 'rgba(255, 255, 255, 0.12)',
            borderRadius: 1,
            backgroundColor: invoice.isRefInvoice ? 'rgba(156, 39, 176, 0.08)' : 'rgba(255, 255, 255, 0.02)',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            '&:hover': {
              borderColor: 'rgba(156, 39, 176, 0.4)',
              backgroundColor: 'rgba(255, 255, 255, 0.05)'
            }
          }}
          onClick={() => {
            handleChange({
              target: {
                name: 'isRefInvoice',
                type: 'checkbox',
                checked: !invoice.isRefInvoice
              }
            });
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box 
              sx={{ 
                fontSize: '1.2rem',
                display: 'flex',
                alignItems: 'center',
                opacity: 0.8
              }}
            >
              🔄
            </Box>
            <Box>
              <Typography 
                variant="body2" 
                fontWeight="500"
                sx={{ 
                  color: invoice.isRefInvoice ? 'secondary.light' : 'text.primary'
                }}
              >
                Refaktura (wybór z PO)
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                Faktura dla klienta bazująca na zamówieniu zakupowym
              </Typography>
            </Box>
          </Box>
          <Switch
            checked={invoice.isRefInvoice || false}
            onChange={(e) => {
              e.stopPropagation();
              handleChange({
                target: {
                  name: 'isRefInvoice',
                  type: 'checkbox',
                  checked: e.target.checked
                }
              });
            }}
            color="secondary"
            size="small"
            onClick={(e) => e.stopPropagation()}
          />
        </Box>
      )}
    </Box>
  );
});

InvoiceTypeToggle.displayName = 'InvoiceTypeToggle';

export default InvoiceTypeToggle;
