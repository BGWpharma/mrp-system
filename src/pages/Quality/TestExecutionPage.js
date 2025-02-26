// src/pages/Quality/TestExecutionPage.js
import React from 'react';
import { Container } from '@mui/material';
import { useParams } from 'react-router-dom';
import ResultsEntryForm from '../../components/quality/ResultsEntryForm';

const TestExecutionPage = () => {
  const { testId } = useParams();
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <ResultsEntryForm testId={testId} />
    </Container>
  );
};

export default TestExecutionPage;