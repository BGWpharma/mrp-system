import React from 'react';
import { useParams } from 'react-router-dom';
import { Container, Typography, Box } from '@mui/material';
import SupplierForm from '../components/purchaseOrders/SupplierForm';

const SupplierFormPage = ({ viewOnly = false }) => {
  const { id } = useParams();
  const isEditMode = Boolean(id) && !viewOnly;

  return (
    <Container>
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          {viewOnly ? 'Szczegóły Dostawcy' : (isEditMode ? 'Edytuj Dostawcę' : 'Nowy Dostawca')}
        </Typography>
        <SupplierForm supplierId={id} viewOnly={viewOnly} />
      </Box>
    </Container>
  );
};

export default SupplierFormPage; 