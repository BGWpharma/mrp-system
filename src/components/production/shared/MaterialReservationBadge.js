/**
 * Komponent MaterialReservationBadge - wyświetla badge z statusem rezerwacji materiałów
 * Obsługuje kliknięcie do nawigacji do zakładki materiałów
 */

import React from 'react';
import { Chip, Tooltip } from '@mui/material';
import { Inventory2 as MaterialsIcon } from '@mui/icons-material';
import { useTranslation } from '../../../hooks/useTranslation';
import { 
  calculateMaterialReservationStatus, 
  getReservationStatusColors 
} from '../../../utils/productionUtils';

const MaterialReservationBadge = ({ 
  task, 
  onClick,
  clickable = false,
  size = 'small',
  showIcon = true
}) => {
  const { t } = useTranslation('taskDetails');
  
  if (!task) return null;
  
  const reservationStatus = calculateMaterialReservationStatus(task);
  const statusColors = getReservationStatusColors(reservationStatus.status);
  
  const handleClick = (e) => {
    if (clickable && onClick) {
      e.stopPropagation();
      onClick();
    }
  };
  
  const chipContent = (
    <Chip 
      icon={clickable && showIcon ? (
        <MaterialsIcon sx={{ fontSize: 16, color: `${statusColors.contrastText} !important` }} />
      ) : undefined}
      label={`${t('materialsLabel')}: ${reservationStatus.label}`} 
      size={size}
      clickable={clickable}
      onClick={handleClick}
      sx={{ 
        ml: 1,
        backgroundColor: statusColors.main,
        color: statusColors.contrastText,
        fontWeight: 500,
        cursor: clickable ? 'pointer' : 'default',
        transition: 'all 0.2s ease-in-out',
        '&:hover': clickable ? {
          opacity: 0.85,
          transform: 'scale(1.03)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
        } : {},
        '& .MuiChip-icon': {
          color: statusColors.contrastText
        }
      }} 
    />
  );

  if (clickable) {
    return (
      <Tooltip 
        title={t('materials.clickToNavigate')}
        arrow
      >
        {chipContent}
      </Tooltip>
    );
  }

  return chipContent;
};

export default MaterialReservationBadge;
