import React from 'react';
import { Container, Typography, Box, Paper } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import { useNotification } from '../../../hooks/useNotification';
import { useTranslation } from '../../../hooks/useTranslation';
import CmrForm from './CmrForm';
import { createCmrDocument } from '../../../services/cmrService';

const CmrCreatePage = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const { t } = useTranslation('cmr');

  const handleSubmit = async (formData) => {
    try {
      console.log('CmrCreatePage - Tworzenie dokumentu CMR z danymi:', formData);
      
      // Upewnij się, że wszystkie pola są określone
      const dataToSave = {
        ...formData,
        specialAgreements: formData.specialAgreements || '',
        reservations: formData.reservations || '',
        notes: formData.notes || ''
      };
      
      console.log('CmrCreatePage - Wywołuję createCmrDocument z danymi:', dataToSave);
      const result = await createCmrDocument(dataToSave, currentUser.uid);
      console.log('CmrCreatePage - Wynik createCmrDocument:', result);
      
      showSuccess('Dokument CMR został utworzony pomyślnie');
      navigate('/inventory/cmr');
    } catch (error) {
      console.error('CmrCreatePage - Błąd podczas tworzenia dokumentu CMR:', error);
      showError('Nie udało się utworzyć dokumentu CMR: ' + error.message);
    }
  };

  const handleCancel = () => {
    navigate('/inventory/cmr');
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5">{t('cmr.buttons.createDocument')}</Typography>
      </Box>
      <Paper sx={{ p: 3 }}>
        <CmrForm onSubmit={handleSubmit} onCancel={handleCancel} />
      </Paper>
    </Container>
  );
};

export default CmrCreatePage; 