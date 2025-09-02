import React from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Backdrop,
  Paper,
  Fade
} from '@mui/material';
import { styled } from '@mui/material/styles';

const StyledBackdrop = styled(Backdrop)(({ theme }) => ({
  zIndex: theme.zIndex.modal + 1,
  backdropFilter: 'blur(8px)',
  background: 'rgba(0, 0, 0, 0.3)',
}));

const StyledPaper = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(4),
  borderRadius: theme.spacing(2),
  background: theme.palette.mode === 'dark' 
    ? 'rgba(30, 30, 30, 0.95)'
    : 'rgba(255, 255, 255, 0.95)',
  backdropFilter: 'blur(20px)',
  border: theme.palette.mode === 'dark'
    ? '1px solid rgba(255, 255, 255, 0.1)'
    : '1px solid rgba(0, 0, 0, 0.1)',
  boxShadow: theme.palette.mode === 'dark'
    ? '0 20px 60px rgba(0, 0, 0, 0.5)'
    : '0 20px 60px rgba(0, 0, 0, 0.2)',
  minWidth: 320,
  maxWidth: 480,
  textAlign: 'center',
}));

const StyledProgress = styled(CircularProgress)(({ theme }) => ({
  color: theme.palette.primary.main,
  marginBottom: theme.spacing(2),
  '& .MuiCircularProgress-circle': {
    strokeLinecap: 'round',
  },
}));

/**
 * Komponent wyświetlający overlay z informacją o zapisywaniu na środku ekranu
 * 
 * @param {boolean} open - Czy overlay jest widoczny
 * @param {string} message - Główny komunikat do wyświetlenia
 * @param {string} subtitle - Opcjonalny podtytuł
 * @param {number} progress - Opcjonalny progress (0-100) dla określonego progressu
 */
const SavingOverlay = ({ 
  open = false, 
  message = "Zapisuje...", 
  subtitle = "", 
  progress = null 
}) => {
  return (
    <StyledBackdrop open={open}>
      <Fade in={open} timeout={300}>
        <StyledPaper elevation={24}>
          <Box 
            display="flex" 
            flexDirection="column" 
            alignItems="center" 
            justifyContent="center"
          >
            {/* Spinner lub progress bar */}
            {progress !== null ? (
              <StyledProgress 
                variant="determinate" 
                value={progress} 
                size={60} 
                thickness={4}
              />
            ) : (
              <StyledProgress 
                variant="indeterminate" 
                size={60} 
                thickness={4}
              />
            )}
            
            {/* Główny komunikat */}
            <Typography 
              variant="h6" 
              component="div" 
              sx={{ 
                fontWeight: 600,
                mb: subtitle ? 1 : 0,
                color: 'text.primary'
              }}
            >
              {message}
            </Typography>
            
            {/* Opcjonalny podtytuł */}
            {subtitle && (
              <Typography 
                variant="body2" 
                color="text.secondary"
                sx={{ 
                  fontSize: '0.875rem',
                  lineHeight: 1.4
                }}
              >
                {subtitle}
              </Typography>
            )}
          </Box>
        </StyledPaper>
      </Fade>
    </StyledBackdrop>
  );
};

export default SavingOverlay;
