import React from 'react';
import { Container } from '@mui/material';
import { useLocation } from 'react-router-dom';
import ProductionTimeline from '../../components/production/ProductionTimeline';

const ProductionTimelinePage = () => {
  const location = useLocation();
  
  // ✅ OPTYMALIZACJE WYDAJNOŚCI - Sprawdź query parametry dla trybów wydajności
  const urlParams = new URLSearchParams(location.search);
  const readOnly = urlParams.get('readonly') === 'true';
  const performanceMode = urlParams.get('performance') === 'true';
  
  return (
    <Container maxWidth={false} sx={{ p: 0, height: '100vh' }}>
      <ProductionTimeline 
        readOnly={readOnly}
        performanceMode={performanceMode}
      />
    </Container>
  );
};

export default ProductionTimelinePage; 