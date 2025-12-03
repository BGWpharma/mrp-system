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
  Tooltip,
  useMediaQuery,
  useTheme
} from '@mui/material';
import {
  Inventory as InventoryIcon
} from '@mui/icons-material';

import { useTranslation } from '../../hooks/useTranslation';
import TaskDetails from './TaskDetails';
import TaskStatusChip from './shared/TaskStatusChip';
import MaterialReservationBadge from './shared/MaterialReservationBadge';

const BasicDataTab = ({
  task,
  getStatusColor,
  getStatusActions,
  onTabChange,
  onStatusChange
}) => {
  const { t } = useTranslation('taskDetails');
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Handler nawigacji do zakładki materiałów (index 1)
  const handleNavigateToMaterials = () => {
    if (onTabChange) {
      onTabChange(1);
    }
  };

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
              
              {/* Chip statusu z dialogiem zmiany */}
              <TaskStatusChip 
                task={task}
                getStatusColor={getStatusColor}
                onStatusChange={onStatusChange}
                editable={true}
              />
              
              {/* Badge rezerwacji z nawigacją do zakładki materiałów */}
              <MaterialReservationBadge 
                task={task}
                onClick={handleNavigateToMaterials}
                clickable={!!onTabChange}
              />
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
              {task.originalQuantity && task.originalQuantity !== task.quantity ? (
                <Tooltip
                  title={
                    <Box>
                      <Typography variant="caption" sx={{ display: 'block', fontWeight: 'bold', mb: 0.5 }}>
                        Zmiana ilości
                      </Typography>
                      <Typography variant="caption" sx={{ display: 'block' }}>
                        Ilość oryginalna: {task.originalQuantity} {task.unit}
                      </Typography>
                      <Typography variant="caption" sx={{ display: 'block' }}>
                        Ilość aktualna: {task.quantity} {task.unit}
                      </Typography>
                      <Typography 
                        variant="caption" 
                        sx={{ 
                          display: 'block',
                          color: (task.quantity - task.originalQuantity) >= 0 ? 'success.light' : 'error.light'
                        }}
                      >
                        Zmiana: {(task.quantity - task.originalQuantity) > 0 ? '+' : ''}
                        {(task.quantity - task.originalQuantity).toFixed(3)} {task.unit}
                      </Typography>
                    </Box>
                  }
                  arrow
                  placement="right"
                >
                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, cursor: 'help' }}>
                    <Typography 
                      variant="body1" 
                      sx={{ 
                        textDecoration: 'line-through', 
                        color: 'text.secondary',
                        fontSize: '0.9em'
                      }}
                    >
                      {task.originalQuantity}
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                      {task.quantity} {task.unit}
                    </Typography>
                    
                  </Box>
                </Tooltip>
              ) : (
                <Typography variant="body1">{task.quantity} {task.unit}</Typography>
              )}
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
