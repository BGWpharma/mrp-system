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
  FullscreenExit as FullscreenExitIcon
} from '@mui/icons-material';
import KioskTaskList from '../../components/kiosk/KioskTaskList';
import KioskTaskDetails from '../../components/kiosk/KioskTaskDetails';
import { baseColors, palettes } from '../../styles/colorConfig';
import { useTheme as useThemeContext } from '../../contexts/ThemeContext';
import { useTranslation } from '../../hooks/useTranslation';

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
    <Box 
      ref={containerRef}
      sx={{
        minHeight: '100vh',
        backgroundColor: colors.background,
        p: isFullscreen ? 2 : { xs: 1, md: 2 }
      }}
    >
      <Container 
        maxWidth={false} 
        sx={{ 
          height: '100%',
          maxWidth: isFullscreen ? '100%' : '1400px'
        }}
      >
        {/* Nagłówek */}
        <Paper 
          elevation={2}
          sx={{
            p: { xs: 2, md: 3 },
            mb: 2,
            background: `linear-gradient(135deg, ${palettes.primary.main}20, ${palettes.primary.dark}10)`,
            borderLeft: `4px solid ${palettes.primary.main}`,
            position: 'relative'
          }}
        >
          <Box sx={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 2
          }}>
            <Box>
              <Typography 
                variant={isMobile ? "h5" : "h4"} 
                component="h1"
                sx={{ 
                  fontWeight: 600,
                  color: palettes.primary.dark,
                  mb: 0.5
                }}
              >
                🏭 Kiosk Produkcyjny
              </Typography>
              <Typography 
                variant="body2" 
                sx={{ 
                  color: colors.text.secondary,
                  fontSize: '0.875rem'
                }}
              >
                Lista zadań produkcyjnych • Ostatnia aktualizacja: {lastRefresh.toLocaleTimeString('pl-PL')}
              </Typography>
            </Box>
            
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<RefreshIcon />}
                onClick={() => setLastRefresh(new Date())}
                sx={{
                  borderColor: palettes.primary.main,
                  color: palettes.primary.main,
                  '&:hover': {
                    borderColor: palettes.primary.dark,
                    backgroundColor: `${palettes.primary.main}10`
                  }
                }}
              >
                Odśwież
              </Button>
              
              <IconButton
                onClick={toggleFullscreen}
                size="small"
                sx={{
                  color: palettes.primary.main,
                  '&:hover': {
                    backgroundColor: `${palettes.primary.main}10`
                  }
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
  );
};

export default KioskPage;
