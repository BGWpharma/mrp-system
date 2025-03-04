import React from 'react';
import { useParams } from 'react-router-dom';
import { Container, Typography, Box } from '@mui/material';
import PurchaseOrderDetails from '../components/purchaseOrders/PurchaseOrderDetails';

const PurchaseOrderDetailsPage = () => {
  const { id } = useParams();

  return (
    <Container>
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Szczegóły Zamówienia Zakupowego
        </Typography>
        <PurchaseOrderDetails orderId={id} />
      </Box>
    </Container>
  );
};

export default PurchaseOrderDetailsPage; 