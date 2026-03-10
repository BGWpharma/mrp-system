import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../hooks/useAuth';
import { useNotification } from '../../../hooks/useNotification';
import { useTranslation } from '../../../hooks/useTranslation';
import { logger } from '../../../utils/logger';
import FormPageLayout from '../../../components/common/FormPageLayout';
import CmrForm from './CmrForm';
import { createCmrDocument } from '../../../services/logistics';

const CmrCreatePage = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const { t } = useTranslation('cmr');

  const handleSubmit = async (formData) => {
    try {
      logger.log('CmrCreatePage - Tworzenie dokumentu CMR z danymi:', formData);
      
      const dataToSave = {
        ...formData,
        specialAgreements: formData.specialAgreements || '',
        reservations: formData.reservations || '',
        notes: formData.notes || ''
      };
      
      logger.log('CmrCreatePage - Wywołuję createCmrDocument z danymi:', dataToSave);
      const result = await createCmrDocument(dataToSave, currentUser.uid);
      logger.log('CmrCreatePage - Wynik createCmrDocument:', result);
      
      showSuccess('Dokument CMR został utworzony pomyślnie');
      navigate(`/inventory/cmr/${result.id}`);
    } catch (error) {
      console.error('CmrCreatePage - Błąd podczas tworzenia dokumentu CMR:', error);
      showError('Nie udało się utworzyć dokumentu CMR: ' + error.message);
    }
  };

  const handleCancel = () => {
    navigate('/inventory/cmr');
  };

  return (
    <FormPageLayout title={t('cmr.buttons.createDocument')}>
      <CmrForm onSubmit={handleSubmit} onCancel={handleCancel} />
    </FormPageLayout>
  );
};

export default CmrCreatePage;
