// src/pages/Analytics/CashflowPage.js
import React from 'react';
import {
  Box,
  Typography,
  Paper,
  useTheme
} from '@mui/material';
import {
  AccountBalance as CashflowIcon
} from '@mui/icons-material';
import { useTranslation } from '../../hooks/useTranslation';
import CashflowTab from '../Sales/COReports/CashflowTab';

const CashflowPage = () => {
  const { t } = useTranslation('analytics');
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

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
            : 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
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
            <CashflowIcon sx={{ fontSize: 24, color: 'white' }} />
          </Box>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
              {t('analyticsDashboard.tiles.cashflow.title')}
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              {t('analyticsDashboard.tiles.cashflow.description')}
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* Zawartość - komponent Cashflow */}
      <CashflowTab />
    </Box>
  );
};

export default CashflowPage;
