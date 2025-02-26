// src/pages/Quality/QualityPage.js
import React from 'react';
import { Container } from '@mui/material';
import TestsList from '../../components/quality/TestsList';

const QualityPage = () => {
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <TestsList />
    </Container>
  );
};

export default QualityPage;