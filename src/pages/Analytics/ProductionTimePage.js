// src/pages/Analytics/ProductionTimePage.js
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
  Schedule as ScheduleIcon
} from '@mui/icons-material';
import { startOfMonth, endOfMonth } from 'date-fns';
import { getAllCustomers } from '../../services/customerService';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import ProductionTimeAnalysisTab from '../../components/production/ProductionTimeAnalysisTab';

const ProductionTimePage = () => {
  const { t } = useTranslation('analytics');
  const { showError } = useNotification();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isDarkMode = theme.palette.mode === 'dark';
  
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState([]);
  const [startDate] = useState(startOfMonth(new Date()));
  const [endDate] = useState(endOfMonth(new Date()));

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const fetchedCustomers = await getAllCustomers();
      setCustomers(fetchedCustomers);
    } catch (error) {
      console.error('Błąd podczas pobierania danych:', error);
      showError(t('common.errors.fetchData'));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Container>
    );
  }

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
            : 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
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
            <ScheduleIcon sx={{ fontSize: 24, color: 'white' }} />
          </Box>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
              {t('analyticsDashboard.tiles.productionTime.title')}
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              {t('analyticsDashboard.tiles.productionTime.description')}
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* Zawartość - komponent analizy czasu produkcji */}
      <ProductionTimeAnalysisTab
        startDate={startDate}
        endDate={endDate}
        customers={customers}
        isMobile={isMobile}
      />
    </Box>
  );
};

export default ProductionTimePage;
