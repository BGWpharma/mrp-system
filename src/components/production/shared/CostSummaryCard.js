/**
 * Komponent CostSummaryCard - wyświetla podsumowanie kosztów zadania
 */

import React from 'react';
import { Paper, Typography, Grid, Box } from '@mui/material';
import { useTranslation } from '../../../hooks/useTranslation';

const CostSummaryCard = ({ costsSummary, task }) => {
  const { t } = useTranslation('taskDetails');
  
  if (!costsSummary) return null;
  
  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Typography variant="h6" gutterBottom>
        {t('costsSummary')}
      </Typography>
      
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Box>
            <Typography variant="body2" color="text.secondary">
              {t('totalMaterialCost')}:
            </Typography>
            <Typography variant="h6">
              {costsSummary.totalMaterialCost.toFixed(2)} €
            </Typography>
          </Box>
        </Grid>
        
        <Grid item xs={12} md={6}>
          <Box>
            <Typography variant="body2" color="text.secondary">
              {t('unitMaterialCost')}:
            </Typography>
            <Typography variant="h6">
              {costsSummary.unitMaterialCost.toFixed(4)} € / {task?.unit || 'kg'}
            </Typography>
          </Box>
        </Grid>
        
        <Grid item xs={12} md={6}>
          <Box>
            <Typography variant="body2" color="text.secondary">
              {t('totalFullProductionCost')}:
            </Typography>
            <Typography variant="h6">
              {costsSummary.totalFullProductionCost.toFixed(2)} €
            </Typography>
          </Box>
        </Grid>
        
        <Grid item xs={12} md={6}>
          <Box>
            <Typography variant="body2" color="text.secondary">
              {t('unitFullProductionCost')}:
            </Typography>
            <Typography variant="h6">
              {costsSummary.unitFullProductionCost.toFixed(4)} € / {task?.unit || 'kg'}
            </Typography>
          </Box>
        </Grid>
      </Grid>
    </Paper>
  );
};

export default CostSummaryCard;

