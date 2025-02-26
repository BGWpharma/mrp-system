// src/pages/Production/ProductionPage.js
import React from 'react';
import { Container } from '@mui/material';
import TaskList from '../../components/production/TaskList';

const ProductionPage = () => {
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <TaskList />
    </Container>
  );
};

export default ProductionPage;