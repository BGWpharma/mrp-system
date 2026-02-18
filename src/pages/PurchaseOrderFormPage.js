import React from 'react';
import { Container, Typography, Box } from '@mui/material';
import { useParams } from 'react-router-dom';
import PurchaseOrderForm from '../components/purchaseOrders/PurchaseOrderForm';
import { useTranslation } from '../hooks/useTranslation';

const PurchaseOrderFormPage = () => {
  const { id } = useParams();
  const { t } = useTranslation('purchaseOrders');
  const isNew = id === 'new';
  
  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5">
          {isNew ? t('purchaseOrders.newOrder') : t('purchaseOrders.editOrder')}
        </Typography>
      </Box>
      <PurchaseOrderForm orderId={id} />
    </Container>
  );
};

export default PurchaseOrderFormPage; 