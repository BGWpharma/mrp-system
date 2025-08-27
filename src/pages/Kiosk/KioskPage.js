// src/pages/Kiosk/KioskPage.js
import React, { useState, useEffect, useRef } from 'react';
import {
  Container,
  Typography,
  Box,
  Paper,
  CircularProgress,
  useTheme,
  useMediaQuery,
  Button,
  IconButton
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
  Factory as FactoryIcon,
  AccessTime as AccessTimeIcon
} from '@mui/icons-material';
import KioskTaskList from '../../components/kiosk/KioskTaskList';
import KioskTaskDetails from '../../components/kiosk/KioskTaskDetails';
import { baseColors, palettes } from '../../styles/colorConfig';
import { useTheme as useThemeContext } from '../../contexts/ThemeContext';
import { useTranslation } from '../../hooks/useTranslation';
import BackgroundEffects from '../../components/common/BackgroundEffects';

const KioskPage = () => {
  const { t } = useTranslation();
  const { mode } = useThemeContext();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const containerRef = useRef(null);

  // Funkcja obsługi kliknięcia zadania
  const handleTaskClick = (task) => {
    setSelectedTask(task);
    setShowDetails(true);
  };

  // Funkcja powrotu do listy
  const handleBackToList = () => {
    setShowDetails(false);
    setSelectedTask(null);
  };

  // Auto-refresh co 30 sekund
  useEffect(() => {
    const interval = setInterval(() => {
      setLastRefresh(new Date());
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  // Obsługa trybu pełnoekranowego
  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      if (containerRef.current?.requestFullscreen) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      }
    } else {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  // Nasłuchiwanie zmian trybu pełnoekranowego
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const colors = baseColors[mode];

    return (
    <>
      <BackgroundEffects />
      <Box
        ref={containerRef}
        sx={{
          height: isFullscreen ? '100vh' : 'auto',
          minHeight: '100vh',
          backgroundColor: 'transparent',
          p: isFullscreen ? 2 : { xs: 1, md: 2 },
          overflowY: isFullscreen ? 'auto' : 'visible',
          overflowX: 'hidden',
          position: 'relative'
        }}
      >
      <Container 
        maxWidth={false} 
        sx={{ 
          height: isFullscreen ? 'fit-content' : '100%',
          minHeight: isFullscreen ? '100%' : 'auto',
          maxWidth: isFullscreen ? '100%' : '1400px',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Nagłówek */}
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2, md: 3 },
            mb: 3,
            borderRadius: 4,
            background: mode === 'dark' 
              ? `linear-gradient(135deg, ${colors.paper} 0%, rgba(33, 150, 243, 0.05) 100%)`
              : `linear-gradient(135deg, ${colors.paper} 0%, rgba(33, 150, 243, 0.02) 100%)`,
            border: `1px solid ${mode === 'dark' ? 'rgba(33, 150, 243, 0.2)' : 'rgba(33, 150, 243, 0.1)'}`,
            boxShadow: `0 8px 32px rgba(33, 150, 243, 0.1)`,
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          {/* Decorative elements */}
          <Box
            sx={{
              position: 'absolute',
              top: -20,
              right: -20,
              width: 100,
              height: 100,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${palettes.primary.main}15 0%, transparent 70%)`,
              pointerEvents: 'none'
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              bottom: -30,
              left: -30,
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${palettes.secondary.main}10 0%, transparent 70%)`,
              pointerEvents: 'none'
            }}
          />
          
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 3,
            position: 'relative',
            zIndex: 1
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box
                sx={{
                  p: 2,
                  borderRadius: 3,
                  background: `linear-gradient(135deg, ${palettes.primary.main} 0%, ${palettes.primary.dark} 100%)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: `0 4px 16px ${palettes.primary.main}40`
                }}
              >
                <FactoryIcon sx={{ color: 'white', fontSize: isMobile ? 28 : 32 }} />
              </Box>
              
              <Box>
                <Typography 
                  variant={isMobile ? "h5" : "h4"} 
                  component="h1"
                  sx={{ 
                    fontWeight: 800,
                    background: `linear-gradient(135deg, ${colors.text.primary} 0%, ${palettes.primary.main} 100%)`,
                    backgroundClip: 'text',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    mb: 0.5,
                    fontSize: isMobile ? '1.75rem' : '2.25rem',
                    lineHeight: 1.2
                  }}
                >
                  Kiosk Produkcyjny
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AccessTimeIcon sx={{ 
                    color: colors.text.secondary, 
                    fontSize: 16 
                  }} />
                  <Typography 
                    variant="body2" 
                    sx={{ 
                      color: colors.text.secondary,
                      fontSize: '0.875rem',
                      fontWeight: 500
                    }}
                  >
                    Aktualizacja: {lastRefresh.toLocaleTimeString('pl-PL')}
                  </Typography>
                </Box>
              </Box>
            </Box>
            
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
              <Button
                variant="contained"
                size="medium"
                startIcon={<RefreshIcon />}
                onClick={() => setLastRefresh(new Date())}
                sx={{
                  background: `linear-gradient(135deg, ${palettes.primary.main} 0%, ${palettes.primary.dark} 100%)`,
                  borderRadius: 3,
                  fontWeight: 600,
                  px: 3,
                  py: 1,
                  boxShadow: `0 4px 12px ${palettes.primary.main}30`,
                  '&:hover': {
                    background: `linear-gradient(135deg, ${palettes.primary.dark} 0%, ${palettes.primary.main} 100%)`,
                    boxShadow: `0 6px 16px ${palettes.primary.main}40`,
                    transform: 'translateY(-1px)'
                  },
                  transition: 'all 0.2s ease-in-out'
                }}
              >
                Odśwież
              </Button>
              
              <IconButton
                onClick={toggleFullscreen}
                size="medium"
                sx={{
                  background: `linear-gradient(135deg, ${colors.paper} 0%, rgba(33, 150, 243, 0.05) 100%)`,
                  border: `2px solid ${palettes.primary.main}30`,
                  borderRadius: 3,
                  color: palettes.primary.main,
                  width: 48,
                  height: 48,
                  '&:hover': {
                    background: `linear-gradient(135deg, ${palettes.primary.main}10 0%, ${palettes.primary.main}05 100%)`,
                    borderColor: palettes.primary.main,
                    transform: 'translateY(-1px)',
                    boxShadow: `0 4px 12px ${palettes.primary.main}20`
                  },
                  transition: 'all 0.2s ease-in-out'
                }}
              >
                {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
              </IconButton>
            </Box>
          </Box>
        </Paper>

        {/* Lista zadań lub szczegóły zadania */}
        {showDetails ? (
          <KioskTaskDetails 
            taskId={selectedTask?.id} 
            onBack={handleBackToList} 
          />
        ) : (
          <KioskTaskList 
            refreshTrigger={lastRefresh}
            isFullscreen={isFullscreen}
            onTaskClick={handleTaskClick}
          />
        )}
      </Container>
    </Box>
    </>
  );
};

export default KioskPage;
