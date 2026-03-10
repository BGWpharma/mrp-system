import React, { useState, useEffect } from 'react';
import { Typography } from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import { useNotification } from '../../../hooks/useNotification';
import { logger } from '../../../utils/logger';
import FormPageLayout from '../../../components/common/FormPageLayout';
import CmrForm from './CmrForm';
import { getCmrDocumentById, updateCmrDocument } from '../../../services/logistics';

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
      logger.log('CmrEditPage - Aktualizacja dokumentu CMR z danymi:', formData);
      
      const dataToSave = {
        ...formData,
        specialAgreements: formData.specialAgreements || '',
        reservations: formData.reservations || '',
        notes: formData.notes || ''
      };
      
      logger.log('CmrEditPage - Wywołuję updateCmrDocument z danymi:', dataToSave);
      const result = await updateCmrDocument(id, dataToSave, currentUser.uid);
      logger.log('CmrEditPage - Wynik updateCmrDocument:', result);
      
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
  
  return (
    <FormPageLayout 
      title={
        <>
          Edycja dokumentu CMR
          {cmrData?.cmrNumber && (
            <Typography variant="subtitle1" color="text.secondary" component="span" sx={{ ml: 2 }}>
              {cmrData.cmrNumber}
            </Typography>
          )}
        </>
      }
      loading={loading}
    >
      <CmrForm 
        onSubmit={handleSubmit} 
        onCancel={handleCancel} 
        initialData={cmrData} 
        isEdit={true} 
      />
    </FormPageLayout>
  );
};

export default CmrEditPage;
