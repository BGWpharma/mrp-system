import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Typography, Box, Paper } from '@mui/material';
import WaybillForm from '../../../components/logistics/waybill/WaybillForm';
import { useNotification } from '../../../hooks/useNotification';

const WaybillCreatePage = () => {
  const navigate = useNavigate();
  const { showSuccess, showError } = useNotification();

  const handleSuccess = (id) => {
    showSuccess('List przewozowy został utworzony');
    navigate(`/logistics/waybill/${id}`);
  };

  const handleError = (error) => {
    console.error('Błąd podczas tworzenia listu przewozowego:', error);
    showError('Nie udało się utworzyć listu przewozowego');
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom>
          Nowy list przewozowy
        </Typography>
        <Box mt={3}>
          <WaybillForm 
            isEditMode={false}
            onSuccess={handleSuccess}
            onError={handleError}
          />
        </Box>
      </Paper>
    </Container>
  );
};

export default WaybillCreatePage; 