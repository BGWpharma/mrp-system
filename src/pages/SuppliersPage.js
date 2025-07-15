import React from 'react';
import { Container, Typography, Box } from '@mui/material';
import { useTranslation } from 'react-i18next';
import SuppliersList from '../components/purchaseOrders/SuppliersList';

const SuppliersPage = () => {
  const { t } = useTranslation();
  
  return (
    <Container>
      <Box sx={{ my: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          {t('suppliers.title')}
        </Typography>
        <SuppliersList />
      </Box>
    </Container>
  );
};

export default SuppliersPage; 