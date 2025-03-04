import React from 'react';
import { useParams } from 'react-router-dom';
import { Container, Typography, Box } from '@mui/material';
import SupplierForm from '../components/purchaseOrders/SupplierForm';

const SupplierFormPage = () => {
  const { id } = useParams();
  const isEditMode = Boolean(id);

  return (
    <Container>
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          {isEditMode ? 'Edytuj Dostawcę' : 'Nowy Dostawca'}
        </Typography>
        <SupplierForm supplierId={id} />
      </Box>
    </Container>
  );
};

export default SupplierFormPage; 