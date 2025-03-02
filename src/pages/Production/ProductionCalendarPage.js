import React from 'react';
import { Container } from '@mui/material';
import ProductionCalendar from '../../components/production/ProductionCalendar';

const ProductionCalendarPage = () => {
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <ProductionCalendar />
    </Container>
  );
};

export default ProductionCalendarPage; 