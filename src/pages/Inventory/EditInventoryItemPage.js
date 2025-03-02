import React from 'react';
import { Container } from '@mui/material';
import { useParams } from 'react-router-dom';
import InventoryItemForm from '../../components/inventory/InventoryItemForm';

const EditInventoryItemPage = () => {
  const { id } = useParams();
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <InventoryItemForm itemId={id} />
    </Container>
  );
};

export default EditInventoryItemPage; 