import React from 'react';
import { Container, Box } from '@mui/material';
import InvoiceDetails from '../../components/invoices/InvoiceDetails';

const InvoiceDetailsPage = () => {
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <InvoiceDetails />
    </Container>
  );
};

export default InvoiceDetailsPage; 