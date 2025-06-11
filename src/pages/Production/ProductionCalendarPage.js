import React from 'react';
import { Container, useMediaQuery, useTheme } from '@mui/material';
import ProductionCalendar from '../../components/production/ProductionCalendar';

const ProductionCalendarPage = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  return (
    <Container 
      maxWidth="xl" 
      sx={{ 
        mt: isMobile ? 2 : 4, 
        mb: isMobile ? 2 : 4,
        px: isMobile ? 1 : 2 
      }}
    >
      <ProductionCalendar />
    </Container>
  );
};

export default ProductionCalendarPage; 