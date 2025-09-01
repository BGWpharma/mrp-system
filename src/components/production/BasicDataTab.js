/**
 * Komponent zakładki "Dane podstawowe" w szczegółach zadania produkcyjnego
 * Wydzielony z TaskDetailsPage.js w celu lepszej organizacji kodu
 */

import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Typography,
  Paper,
  Grid,
  Chip,
  Box,
  useMediaQuery,
  useTheme
} from '@mui/material';
import {
  Inventory as InventoryIcon
} from '@mui/icons-material';

import { useTranslation } from '../../hooks/useTranslation';
import { 
  calculateMaterialReservationStatus, 
  getReservationStatusColors 
} from '../../utils/productionUtils';
import TaskDetails from './TaskDetails';

const BasicDataTab = ({
  task,
  getStatusColor,
  getStatusActions
}) => {
  const { t } = useTranslation('taskDetails');
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  return (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <Paper sx={{ p: 3 }}>
          <Box sx={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            justifyContent: 'space-between',
            alignItems: isMobile ? 'flex-start' : 'center',
            mb: 2
          }}>
            <Typography variant="h5" component="h1" sx={{ mb: isMobile ? 2 : 0 }}>
              {task.name}
              <Chip label={task.moNumber || 'MO'} color="primary" size="small" sx={{ ml: 2 }} />
              <Chip 
                label={task.status} 
                size="small" 
                sx={{ 
                  ml: 1,
                  backgroundColor: getStatusColor(task.status),
                  color: 'white'
                }} 
              />
              {(() => {
                const reservationStatus = calculateMaterialReservationStatus(task);
                const statusColors = getReservationStatusColors(reservationStatus.status);
                
                return (
                  <Chip 
                    label={`${t('materialsLabel')}: ${reservationStatus.label}`} 
                    size="small" 
                    sx={{ 
                      ml: 1,
                      backgroundColor: statusColors.main,
                      color: statusColors.contrastText
                    }} 
                  />
                );
              })()}
            </Typography>
            <Box sx={{ width: isMobile ? '100%' : 'auto' }}>
              {getStatusActions()}
            </Box>
          </Box>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                {t('product')}:
              </Typography>
              <Typography variant="body1">{task.productName}</Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                {t('quantity')}:
              </Typography>
              <Typography variant="body1">{task.quantity} {task.unit}</Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                {t('produced')}:
              </Typography>
              <Typography variant="body1">
                {task.totalCompletedQuantity || 0} {task.unit}
                {task.totalCompletedQuantity > 0 && (
                  <Typography component="span" variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>
                    ({((task.totalCompletedQuantity / task.quantity) * 100).toFixed(1)}%)
                  </Typography>
                )}
              </Typography>
            </Grid>
            {task.inventoryProductId && (
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                  {t('inventoryItem')}:
                </Typography>
                <Box sx={{ mt: 1 }}>
                  <Chip 
                    label={task.productName}
                    color="primary"
                    variant="outlined"
                    clickable
                    onClick={() => navigate(`/inventory/${task.inventoryProductId}`)}
                    icon={<InventoryIcon />}
                    sx={{ 
                      cursor: 'pointer',
                      '&:hover': {
                        backgroundColor: 'primary.light',
                        color: 'white'
                      }
                    }}
                  />
                </Box>
              </Grid>
            )}
            {task.estimatedDuration > 0 && (
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                  {t('estimatedDuration')}:
                </Typography>
                <Typography variant="body1">
                  {(task.estimatedDuration / 60).toFixed(1)} {t('hours')}
                </Typography>
              </Grid>
            )}
            {(task.recipe && task.recipe.recipeName) || (task.recipeId && task.recipeName) ? (
              <Grid item xs={12} md={6}>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                  {t('recipe')}:
                </Typography>
                <Typography variant="body1">
                  <Link to={`/recipes/${task.recipe?.recipeId || task.recipeId}`}>
                    {task.recipe?.recipeName || task.recipeName}
                    {task.recipeVersion && (
                      <Typography component="span" variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>
                        ({t('version')} {task.recipeVersion})
                      </Typography>
                    )}
                  </Link>
                </Typography>
              </Grid>
            ) : null}
            <Grid item xs={12}>
              <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                {t('description')}:
              </Typography>
              <Typography variant="body1">
                {task.description || t('noDescription')}
              </Typography>
            </Grid>
          </Grid>
        </Paper>
      </Grid>
      <Grid item xs={12}>
        <TaskDetails task={task} />
      </Grid>
    </Grid>
  );
};

export default BasicDataTab;
