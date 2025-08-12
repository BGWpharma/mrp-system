import React from 'react';
import { Container, Typography, Box } from '@mui/material';
import PurchaseOrderList from '../components/purchaseOrders/PurchaseOrderList';
import { PurchaseOrderListStateProvider } from '../contexts/PurchaseOrderListStateContext';
import { useTranslation } from '../hooks/useTranslation';

const PurchaseOrdersPage = () => {
  const { t } = useTranslation();
  
  return (
    <PurchaseOrderListStateProvider>
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h5">
            {t('purchaseOrders.title')}
          </Typography>
        </Box>
        <PurchaseOrderList />
      </Container>
    </PurchaseOrderListStateProvider>
  );
};

export default PurchaseOrdersPage; 