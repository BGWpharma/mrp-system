import React from 'react';
import { Box, CircularProgress, Typography, Alert } from '@mui/material';

/**
 * Komponent wyświetlający stan ładowania opcji formularzy
 * @param {boolean} loading - Czy opcje są ładowane
 * @param {string} error - Komunikat błędu (jeśli wystąpił)
 * @param {React.ReactNode} children - Zawartość do wyświetlenia po załadowaniu
 * @param {string} loadingText - Tekst wyświetlany podczas ładowania
 */
const FormOptionsLoader = ({ 
  loading, 
  error, 
  children, 
  loadingText = "Ładowanie opcji formularza..." 
}) => {
  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2 }}>
        <CircularProgress size={20} />
        <Typography variant="body2" color="text.secondary">
          {loadingText}
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="warning" sx={{ mb: 2 }}>
        Błąd podczas ładowania opcji: {error}. Używane są opcje domyślne.
      </Alert>
    );
  }

  return children;
};

export default FormOptionsLoader; 