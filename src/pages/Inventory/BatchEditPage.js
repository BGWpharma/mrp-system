import React from 'react';
import { Container } from '@mui/material';
import BatchEditForm from '../../components/inventory/BatchEditForm';

const BatchEditPage = () => {
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <BatchEditForm />
    </Container>
  );
};

export default BatchEditPage; 