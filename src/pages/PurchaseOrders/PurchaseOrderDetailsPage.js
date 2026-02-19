import React from 'react';
import { Container, Typography, Box } from '@mui/material';
import { useParams } from 'react-router-dom';
import PurchaseOrderDetails from '../../components/purchaseOrders/PurchaseOrderDetails';
import { useTranslation } from '../../hooks/useTranslation';

const PurchaseOrderDetailsPage = () => {
  const { id } = useParams();
  const { t } = useTranslation('purchaseOrders');
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5">
          {t('purchaseOrders.detailsTitle')}
        </Typography>
      </Box>
      <PurchaseOrderDetails orderId={id} />
    </Container>
  );
};

export default PurchaseOrderDetailsPage;
