import React from 'react';
import { Container, Typography, Box } from '@mui/material';
import InvoicesList from '../../components/invoices/InvoicesList';

const InvoicesListPage = () => {
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Faktury
        </Typography>
      </Box>
      <InvoicesList />
    </Container>
  );
};

export default InvoicesListPage; 