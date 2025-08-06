import React from 'react';
import { CircularProgress, Box } from '@mui/material';
import LoadingScreen from './LoadingScreen';

const Loader = ({ 
  type = 'simple', // 'simple', 'advanced', 'inline'
  message = "Ładowanie...",
  size = 80,
  ...props 
}) => {
  // Użyj zaawansowanego LoadingScreen dla typu 'advanced'
  if (type === 'advanced') {
    return (
      <LoadingScreen 
        message={message}
        fullScreen={false}
        size={size}
        {...props}
      />
    );
  }

  // Dla typu 'inline' - bardzo kompaktowy
  if (type === 'inline') {
    return (
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        p: 1,
        minHeight: 'auto'
      }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  // Domyślny prosty loader
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', p: 4 }}>
      <CircularProgress />
    </Box>
  );
};

export default Loader; 