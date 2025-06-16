import React from 'react';
import { Container, Typography, Box } from '@mui/material';
import InvoicesList from '../../components/invoices/InvoicesList';

const InvoicesListPage = () => {
  return (
    <Container maxWidth="xl" sx={{ mt: 2, mb: 2 }}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Faktury
        </Typography>
      </Box>
      <InvoicesList />
    </Container>
  );
};

export default InvoicesListPage; 