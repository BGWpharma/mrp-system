// src/pages/Quality/NewTestPage.js
import React from 'react';
import { Container } from '@mui/material';
import TestForm from '../../components/quality/TestForm';

const NewTestPage = () => {
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <TestForm />
    </Container>
  );
};

export default NewTestPage;