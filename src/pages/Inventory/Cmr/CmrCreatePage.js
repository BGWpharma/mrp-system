import React from 'react';
import { Container, Typography, Box, Paper } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import { useNotification } from '../../../hooks/useNotification';
import CmrForm from './CmrForm';
import { createCmrDocument } from '../../../services/cmrService';

const CmrCreatePage = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();

  const handleSubmit = async (formData) => {
    try {
      await createCmrDocument(formData, currentUser.uid);
      showSuccess('Dokument CMR został utworzony pomyślnie');
      navigate('/inventory/cmr');
    } catch (error) {
      console.error('Błąd podczas tworzenia dokumentu CMR:', error);
      showError('Nie udało się utworzyć dokumentu CMR');
    }
  };

  const handleCancel = () => {
    navigate('/inventory/cmr');
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5">Nowy dokument CMR</Typography>
      </Box>
      <Paper sx={{ p: 3 }}>
        <CmrForm onSubmit={handleSubmit} onCancel={handleCancel} />
      </Paper>
    </Container>
  );
};

export default CmrCreatePage; 