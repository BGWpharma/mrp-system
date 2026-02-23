// src/pages/Analytics/ProductionProgressPage.js
import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Paper,
  CircularProgress,
  useMediaQuery,
  useTheme
} from '@mui/material';
import {
  Speed as ProgressIcon
} from '@mui/icons-material';
import { getAllTasks } from '../../services/productionService';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import ProgressReportTab from '../../components/production/ProgressReportTab';

const ProductionProgressPage = () => {
  const { t } = useTranslation('analytics');
  const { showError } = useNotification();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isDarkMode = theme.palette.mode === 'dark';
  
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        setLoading(true);
        const fetchedTasks = await getAllTasks();
        if (cancelled) return;
        setTasks(fetchedTasks);
      } catch (error) {
        if (cancelled) return;
        console.error('Błąd podczas pobierania danych:', error);
        showError(t('common.errors.fetchData'));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, []);

  return (
    <Box sx={{ minHeight: '100vh', pb: 4 }}>
      {/* Nagłówek */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          mb: 3,
          background: isDarkMode
            ? 'linear-gradient(135deg, #1e293b 0%, #334155 100%)'
            : 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
          color: 'white',
          borderRadius: 3,
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <Box sx={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center' }}>
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: 2,
              backgroundColor: 'rgba(255, 255, 255, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mr: 2
            }}
          >
            <ProgressIcon sx={{ fontSize: 24, color: 'white' }} />
          </Box>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
              {t('analyticsDashboard.tiles.productionProgress.title')}
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              {t('analyticsDashboard.tiles.productionProgress.description')}
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* Zawartość - komponent postępu produkcji */}
      <ProgressReportTab
        tasks={tasks}
        loading={loading}
        isMobile={isMobile}
      />
    </Box>
  );
};

export default ProductionProgressPage;
