import React from 'react';
import { Container, Typography, Box } from '@mui/material';
import SuppliersList from '../components/purchaseOrders/SuppliersList';

const SuppliersPage = () => {
  return (
    <Container>
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Dostawcy
        </Typography>
        <SuppliersList />
      </Box>
    </Container>
  );
};

export default SuppliersPage; 