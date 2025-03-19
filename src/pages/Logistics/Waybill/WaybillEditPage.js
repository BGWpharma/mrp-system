import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Container, Typography, Box, Paper } from '@mui/material';
import WaybillForm from '../../../components/logistics/waybill/WaybillForm';
import { useNotification } from '../../../hooks/useNotification';

const WaybillEditPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showSuccess, showError } = useNotification();

  const handleSuccess = () => {
    showSuccess('List przewozowy został zaktualizowany');
    navigate(`/logistics/waybill/${id}`);
  };

  const handleError = (error) => {
    console.error('Błąd podczas aktualizacji listu przewozowego:', error);
    showError('Nie udało się zaktualizować listu przewozowego');
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom>
          Edycja listu przewozowego
        </Typography>
        <Box mt={3}>
          <WaybillForm 
            isEditMode={true} 
            waybillId={id}
            onSuccess={handleSuccess}
            onError={handleError}
          />
        </Box>
      </Paper>
    </Container>
  );
};

export default WaybillEditPage; 