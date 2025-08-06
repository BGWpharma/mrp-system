import React from 'react';
import { useParams } from 'react-router-dom';
import { Container, Typography, Box } from '@mui/material';
import InvoiceForm from '../../components/invoices/InvoiceForm';
import { useTranslation } from '../../hooks/useTranslation';

const InvoiceFormPage = () => {
  const { invoiceId } = useParams();
  const { t } = useTranslation();
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5">
          {invoiceId ? t('invoices.form.title.edit') : t('invoices.form.title.new')}
        </Typography>
      </Box>
      <InvoiceForm invoiceId={invoiceId} />
    </Container>
  );
};

export default InvoiceFormPage; 