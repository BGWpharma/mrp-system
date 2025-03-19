import React from 'react';
import { Container, Typography, Box } from '@mui/material';
import { useParams } from 'react-router-dom';
import PurchaseOrderForm from '../components/purchaseOrders/PurchaseOrderForm';

const PurchaseOrderFormPage = () => {
  const { id } = useParams();
  const isNew = id === 'new';
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5">
          {isNew ? 'Nowe Zamówienie Komponentów' : 'Edycja Zamówienia Komponentów'}
        </Typography>
      </Box>
      <PurchaseOrderForm />
    </Container>
  );
};

export default PurchaseOrderFormPage; 