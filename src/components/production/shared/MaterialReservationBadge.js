/**
 * Komponent MaterialReservationBadge - wyświetla badge z statusem rezerwacji materiałów
 */

import React from 'react';
import { Chip } from '@mui/material';
import { useTranslation } from '../../../hooks/useTranslation';
import { 
  calculateMaterialReservationStatus, 
  getReservationStatusColors 
} from '../../../utils/productionUtils';

const MaterialReservationBadge = ({ task }) => {
  const { t } = useTranslation('taskDetails');
  
  if (!task) return null;
  
  const reservationStatus = calculateMaterialReservationStatus(task);
  const statusColors = getReservationStatusColors(reservationStatus.status);
  
  return (
    <Chip 
      label={`${t('materialsLabel')}: ${reservationStatus.label}`} 
      size="small" 
      sx={{ 
        ml: 1,
        backgroundColor: statusColors.main,
        color: statusColors.contrastText
      }} 
    />
  );
};

export default MaterialReservationBadge;

