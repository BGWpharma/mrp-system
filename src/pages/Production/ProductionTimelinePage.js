import React from 'react';
import { Container } from '@mui/material';
import ProductionTimeline from '../../components/production/ProductionTimeline';

const ProductionTimelinePage = () => {
  return (
    <Container maxWidth={false} sx={{ p: 0, height: '100vh' }}>
      <ProductionTimeline />
    </Container>
  );
};

export default ProductionTimelinePage; 