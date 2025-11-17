/**
 * Komponent StatusChip - wyświetla chip z kolorem odpowiadającym statusowi zadania
 */

import React from 'react';
import { Chip } from '@mui/material';

const StatusChip = ({ status, getStatusColor }) => {
  if (!status) return null;
  
  return (
    <Chip 
      label={status} 
      size="small" 
      sx={{ 
        ml: 1,
        backgroundColor: getStatusColor ? getStatusColor(status) : '#999',
        color: 'white'
      }} 
    />
  );
};

export default StatusChip;

