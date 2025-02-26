// src/pages/Inventory/InventoryPage.js
import React from 'react';
import { Container } from '@mui/material';
import InventoryList from '../../components/inventory/InventoryList';

const InventoryPage = () => {
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <InventoryList />
    </Container>
  );
};

export default InventoryPage;