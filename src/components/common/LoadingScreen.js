// src/components/common/LoadingScreen.js
import React from 'react';
import { Box, Typography, Fade } from '@mui/material';
import { useTheme } from '../../contexts/ThemeContext';

const LoadingScreen = ({ 
  message = "Ładowanie...", 
  showMessage = true, 
  fullScreen = true,
  size = 120
}) => {
  const { mode } = useTheme();
  
  // Clean Design - spójne kolory tła
  const containerStyles = fullScreen ? {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: mode === 'dark' ? '#0f172a' : '#f8fafc',
    zIndex: 9999,
    gap: 3
  } : {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 4,
    gap: 3,
    minHeight: '200px'
  };

  return (
    <Fade in={true} timeout={300}>
      <Box sx={containerStyles}>
        {/* Animowane logo SVG */}
        <Box 
          sx={{ 
            width: size, 
            height: size,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            '& svg': {
              width: '100%',
              height: '100%',
              // Dodatkowa animacja pulsowania dla lepszego efektu
              animation: 'pulse 2s ease-in-out infinite',
            },
            '@keyframes pulse': {
              '0%': {
                transform: 'scale(1)',
                opacity: 0.9
              },
              '50%': {
                transform: 'scale(1.05)',
                opacity: 1
              },
              '100%': {
                transform: 'scale(1)',
                opacity: 0.9
              }
            }
          }}
        >
          {/* Wbudowane SVG logo z animacjami */}
          <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1100.49 1189.45">
            <style type="text/css">
              {`
                .st0{fill:#874CF6;}
                .st1{fill:#0A0028;}
                .st2{fill:#6C35EA;}
                .st3{fill:#FFFFFF;}
              `}
            </style>
            <g id="ARTWORK">
              <g>
                {/* Główny animowany kształt */}
                <path className="st0" d="M313.12,398.34c46.79,37.72,43.96,108.22,43.96,108.22c-2.32,34.93,34.75,65.69,68.83,56.6
                  c60.05-13.35,113.44,32.8,113.44,32.8c26.73,23.86,73.46,13.72,87.66-19.5c26.46-54.32,95.89-67.26,95.89-67.26
                  c34.57-5.75,55.4-47.17,40.59-78.11c-25.69-55.79-27.86-60.69,4.53-116.74l1.48-2.76c17.21-30.75-2.74-74.51-38.13-81.03
                  c-59.22-13.71-87.29-78.64-87.29-78.64c-13.36-32.39-58.32-43.48-85.2-22.16c-49.56,39.24-117.85,20.7-117.85,20.7
                  c-33.58-9.47-69.96,17.67-70.44,52.56c0.13,61.17-57.3,105.29-57.3,105.29C283.82,329.45,283.75,377.11,313.12,398.34z
                  M398.15,378.63c18.43-26.56-16.57-79-2.29-97.64c6.92-16.95,46.49-16.47,64.53-29.9c18.19-15,36.54-54.34,53.49-53.1
                  c17.93-5.02,41.96,26.26,63.61,31.82c22.77,4.9,65.36-5.32,74.87,8.71c15.01,10.6,5.68,48.82,14.78,69.56
                  c29.44,45.84,67.72,59.46,9.43,101.32c-44.63,38.05,0.93,113.64-87.86,88.17c-29.88-11.84-73.14,33.82-94.38,24.01
                  c-18.36-3.26-26.41-41.88-43.49-56.26C404.94,436.95,364.04,441.28,398.15,378.63z">
                  
                  {/* Animacja obracania dla głównego kształtu */}
                  <animateTransform 
                    attributeName="transform" 
                    type="rotate" 
                    values="0 540.78 362.12;360 540.78 362.12" 
                    dur="8s" 
                    repeatCount="indefinite"/>
                </path>
                
                {/* Animowana elipsa */}
                <ellipse transform="matrix(.9782 -0.2076 0.2076 0.9782 -63.3925 120.1503)" className="st0" cx="540.78" cy="362.12" rx="55.81" ry="55.81">
                  
                  {/* Animacja obracania dla elipsy */}
                  <animateTransform 
                    attributeName="transform" 
                    type="rotate" 
                    values="0 540.78 362.12;-360 540.78 362.12" 
                    dur="4s" 
                    repeatCount="indefinite"/>
                </ellipse>
              </g>
            </g>
          </svg>
        </Box>

        {/* Komunikat ładowania - Clean Design */}
        {showMessage && (
          <Typography 
            variant="body1" 
            sx={{ 
              color: mode === 'dark' ? '#94a3b8' : '#64748b',
              fontWeight: 400,
              textAlign: 'center',
              letterSpacing: '0.3px',
            }}
          >
            {message}
          </Typography>
        )}

      </Box>
    </Fade>
  );
};

export default LoadingScreen;