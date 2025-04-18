import React, { useState } from 'react';
import { Container, Box, Typography, Paper } from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import NewCmrForm from './NewCmrForm';
import { addCmr, updateCmr, getCmrById } from '../../../services/cmrService';
import { useEffect } from 'react';

/**
 * Strona formularza nowego CMR, opartego na oficjalnym dokumencie.
 */
const NewCmrPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [cmrData, setCmrData] = useState(null);
  const [loading, setLoading] = useState(!!id);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    // Jeśli mamy ID, to ładujemy dane dokumentu do edycji
    if (id) {
      const loadCmrData = async () => {
        try {
          const data = await getCmrById(id);
          if (data) {
            setCmrData(data);
          } else {
            setError('Nie znaleziono dokumentu CMR o podanym ID');
          }
        } catch (error) {
          console.error('Błąd podczas ładowania dokumentu CMR:', error);
          setError(`Błąd podczas ładowania dokumentu: ${error.message}`);
        } finally {
          setLoading(false);
        }
      };
      
      loadCmrData();
    }
  }, [id]);
  
  const handleSubmit = async (formData) => {
    try {
      if (id) {
        // Aktualizacja istniejącego dokumentu
        await updateCmr(id, formData);
      } else {
        // Tworzenie nowego dokumentu
        await addCmr(formData);
      }
      
      navigate('/inventory/cmr');
    } catch (error) {
      console.error('Błąd podczas zapisywania dokumentu CMR:', error);
      setError(`Błąd podczas zapisywania dokumentu: ${error.message}`);
    }
  };
  
  const handleCancel = () => {
    navigate('/inventory/cmr');
  };
  
  return (
    <Container maxWidth="xl">
      <Paper elevation={3} sx={{ p: 3, mt: 3 }}>
        <Box sx={{ mb: 4 }}>
          <Typography variant="h4" component="h1" gutterBottom>
            {id ? 'Edycja dokumentu CMR' : 'Nowy dokument CMR'}
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
            {id 
              ? 'Edytuj istniejący międzynarodowy list przewozowy CMR' 
              : 'Utwórz nowy międzynarodowy list przewozowy CMR na podstawie oficjalnego dokumentu'}
          </Typography>
        </Box>
        
        {loading ? (
          <Typography>Ładowanie danych...</Typography>
        ) : error ? (
          <Typography color="error">{error}</Typography>
        ) : (
          <NewCmrForm 
            initialData={cmrData} 
            onSubmit={handleSubmit} 
            onCancel={handleCancel} 
          />
        )}
      </Paper>
    </Container>
  );
};

export default NewCmrPage; 