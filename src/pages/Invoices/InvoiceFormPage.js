import React from 'react';
import { useParams } from 'react-router-dom';
import { Container, Typography, Box } from '@mui/material';
import InvoiceForm from '../../components/invoices/InvoiceForm';

const InvoiceFormPage = () => {
  const { invoiceId } = useParams();
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5">
          {invoiceId ? 'Edycja faktury' : 'Nowa faktura'}
        </Typography>
      </Box>
      <InvoiceForm invoiceId={invoiceId} />
    </Container>
  );
};

export default InvoiceFormPage; 