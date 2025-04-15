import React, { useState, useEffect } from 'react';
import { Container, Typography, Box, Paper, CircularProgress } from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import { useNotification } from '../../../hooks/useNotification';
import CmrForm from './CmrForm';
import { getCmrDocumentById, updateCmrDocument } from '../../../services/cmrService';

const CmrEditPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  
  const [loading, setLoading] = useState(true);
  const [cmrData, setCmrData] = useState(null);
  
  useEffect(() => {
    fetchCmrDocument();
  }, [id]);
  
  const fetchCmrDocument = async () => {
    try {
      setLoading(true);
      const data = await getCmrDocumentById(id);
      setCmrData(data);
    } catch (error) {
      console.error('Błąd podczas pobierania dokumentu CMR:', error);
      showError('Nie udało się pobrać dokumentu CMR');
      navigate('/inventory/cmr');
    } finally {
      setLoading(false);
    }
  };
  
  const handleSubmit = async (formData) => {
    try {
      console.log('CmrEditPage - Aktualizacja dokumentu CMR z danymi:', formData);
      
      // Upewnij się, że wszystkie pola są określone
      const dataToSave = {
        ...formData,
        specialAgreements: formData.specialAgreements || '',
        reservations: formData.reservations || '',
        notes: formData.notes || ''
      };
      
      console.log('CmrEditPage - Wywołuję updateCmrDocument z danymi:', dataToSave);
      const result = await updateCmrDocument(id, dataToSave, currentUser.uid);
      console.log('CmrEditPage - Wynik updateCmrDocument:', result);
      
      showSuccess('Dokument CMR został zaktualizowany pomyślnie');
      navigate(`/inventory/cmr/${id}`);
    } catch (error) {
      console.error('CmrEditPage - Błąd podczas aktualizacji dokumentu CMR:', error);
      showError('Nie udało się zaktualizować dokumentu CMR: ' + error.message);
    }
  };
  
  const handleCancel = () => {
    navigate(`/inventory/cmr/${id}`);
  };
  
  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5">Edycja dokumentu CMR</Typography>
        <Typography variant="subtitle1" color="text.secondary">
          {cmrData?.cmrNumber}
        </Typography>
      </Box>
      <Paper sx={{ p: 3 }}>
        <CmrForm 
          onSubmit={handleSubmit} 
          onCancel={handleCancel} 
          initialData={cmrData} 
          isEdit={true} 
        />
      </Paper>
    </Container>
  );
};

export default CmrEditPage; 