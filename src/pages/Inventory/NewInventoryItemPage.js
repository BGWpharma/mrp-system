import React from 'react';
import { Container } from '@mui/material';
import InventoryItemForm from '../../components/inventory/InventoryItemForm';

const NewInventoryItemPage = () => {
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <InventoryItemForm />
    </Container>
  );
};

export default NewInventoryItemPage; 