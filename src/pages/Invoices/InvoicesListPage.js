import React from 'react';
import { Container, Typography, Box } from '@mui/material';
import InvoicesList from '../../components/invoices/InvoicesList';
import { useTranslation } from '../../hooks/useTranslation';

const InvoicesListPage = () => {
  const { t } = useTranslation();
  
  return (
    <Container maxWidth="xl" sx={{ mt: 2, mb: 2 }}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          {t('invoices.title')}
        </Typography>
      </Box>
      <InvoicesList />
    </Container>
  );
};

export default InvoicesListPage; 