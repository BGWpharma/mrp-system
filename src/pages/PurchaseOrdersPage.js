import React from 'react';
import { Container, Typography, Box } from '@mui/material';
import PurchaseOrderList from '../components/purchaseOrders/PurchaseOrderList';

const PurchaseOrdersPage = () => {
  return (
    <Container>
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Zamówienia Zakupowe
        </Typography>
        <PurchaseOrderList />
      </Box>
    </Container>
  );
};

export default PurchaseOrdersPage; 