import React, { useState } from 'react';
import { Container, Box, Typography, Paper } from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from '../../../hooks/useTranslation';
import NewCmrForm from './NewCmrForm';
import { addCmr, updateCmr, getCmrById } from '../../../services/cmrService';
import { useEffect } from 'react';

/**
 * Strona formularza nowego CMR, opartego na oficjalnym dokumencie.
 */
const NewCmrPage = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { t } = useTranslation('cmr');
  const [cmrData, setCmrData] = useState(null);
  const [loading, setLoading] = useState(!!id);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    let cancelled = false;
    if (id) {
      (async () => {
        try {
          const data = await getCmrById(id);
          if (cancelled) return;
          if (data) {
            setCmrData(data);
          } else {
            setError('Nie znaleziono dokumentu CMR o podanym ID');
          }
        } catch (error) {
          if (cancelled) return;
          console.error('Błąd podczas ładowania dokumentu CMR:', error);
          setError(`Błąd podczas ładowania dokumentu: ${error.message}`);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }
    return () => { cancelled = true; };
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
            {id ? t('cmr.buttons.editDocument') : t('cmr.buttons.createDocument')}
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
            {id 
              ? t('cmr.buttons.editDescription') 
              : t('cmr.buttons.createDescription')}
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