import React from 'react';
import { useParams } from 'react-router-dom';
import { Container, Typography, Box } from '@mui/material';
import PurchaseOrderForm from '../components/purchaseOrders/PurchaseOrderForm';

const PurchaseOrderFormPage = () => {
  const { id } = useParams();
  
  // Jeśli nie ma id, to znaczy, że tworzymy nowe zamówienie
  const isNew = !id;
  const orderId = isNew ? 'new' : id;

  return (
    <Container>
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          {isNew ? 'Nowe Zamówienie Zakupowe' : 'Edycja Zamówienia Zakupowego'}
        </Typography>
        <PurchaseOrderForm orderId={orderId} />
      </Box>
    </Container>
  );
};

export default PurchaseOrderFormPage; 