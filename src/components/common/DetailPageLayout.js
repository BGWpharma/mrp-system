import React from 'react';
import { Container, Box, CircularProgress, Alert, Button } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate } from 'react-router-dom';
import { loadingContainer } from '../../styles/muiCommonStyles';

const DetailPageLayout = ({
  loading,
  error,
  errorMessage,
  backTo,
  backLabel,
  maxWidth = 'lg',
  children
}) => {
  const navigate = useNavigate();

  if (loading) {
    return (
      <Container maxWidth={maxWidth} sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ ...loadingContainer, minHeight: '40vh' }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth={maxWidth} sx={{ mt: 4, mb: 4 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          {errorMessage || 'Nie znaleziono danych.'}
        </Alert>
        {backTo && (
          <Button
            variant="outlined"
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate(backTo)}
          >
            {backLabel || 'Powrót'}
          </Button>
        )}
      </Container>
    );
  }

  return (
    <Container maxWidth={maxWidth} sx={{ mt: 2, mb: 4 }}>
      {children}
    </Container>
  );
};

export default DetailPageLayout;
