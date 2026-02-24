import React, { memo } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Alert,
  Button,
} from '@mui/material';
import { Save as SaveIcon } from '@mui/icons-material';
import { mt2, p2 } from '../../styles/muiCommonStyles';

const CostCard = ({ label, value, unit, changed, dbValue, color }) => (
  <Card variant="outlined" sx={{ height: '100%', borderColor: color ? `${color}.main` : 'divider' }}>
    <CardContent sx={{ pb: '12px !important' }}>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        {label}
      </Typography>
      <Typography variant="h6" sx={{ color: color ? `${color}.main` : 'inherit', fontWeight: 600 }}>
        {value}
        {unit && (
          <Typography component="span" variant="body2" sx={{ fontWeight: 400, opacity: 0.9 }}>
            {' '}/{unit}
          </Typography>
        )}
      </Typography>
      {changed && dbValue != null && (
        <Typography variant="caption" sx={{ color: 'warning.main', fontStyle: 'italic', display: 'block' }}>
          w bazie: {dbValue}
        </Typography>
      )}
    </CardContent>
  </Card>
);

const MaterialCostsSummary = memo(({
  costsSummary,
  task,
  t,
  updateMaterialCostsManually,
  hideTitle = false,
}) => {
  const {
    consumed: consumedCosts,
    reserved: reservedCosts,
    totalMaterialCost,
    unitMaterialCost,
    totalFullProductionCost,
    unitFullProductionCost,
    totalAdditionalCosts = 0
  } = costsSummary;
  
  const dbTotalMaterialCost = task.totalMaterialCost || 0;
  const dbUnitMaterialCost = task.unitMaterialCost || 0;
  const dbTotalFullProductionCost = task.totalFullProductionCost || 0;
  const dbUnitFullProductionCost = task.unitFullProductionCost || 0;
  
  const totalMaterialCostChanged = Math.abs(dbTotalMaterialCost - totalMaterialCost) > 0.01;
  const unitMaterialCostChanged = Math.abs(dbUnitMaterialCost - unitMaterialCost) > 0.0001;
  const totalFullProductionCostChanged = Math.abs(dbTotalFullProductionCost - totalFullProductionCost) > 0.01;
  const unitFullProductionCostChanged = Math.abs(dbUnitFullProductionCost - unitFullProductionCost) > 0.0001;
  
  const costChanged = totalMaterialCostChanged || unitMaterialCostChanged || 
                      totalFullProductionCostChanged || unitFullProductionCostChanged;

  return (
    <Box sx={{ ...(hideTitle ? {} : mt2), ...p2, bgcolor: 'transparent', borderRadius: 1 }}>
      {costChanged && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('materialsSummary.costChanged')}
        </Alert>
      )}
      {(consumedCosts.totalCost > 0 || reservedCosts.totalCost > 0 || totalAdditionalCosts > 0) && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {consumedCosts.totalCost > 0 && `${t('materialsSummary.consumed')}: ${consumedCosts.totalCost.toFixed(2)} €`}
          {consumedCosts.totalCost > 0 && reservedCosts.totalCost > 0 && ' | '}
          {reservedCosts.totalCost > 0 && `${t('materialsSummary.reserved')}: ${reservedCosts.totalCost.toFixed(2)} €`}
          {totalAdditionalCosts > 0 && (consumedCosts.totalCost > 0 || reservedCosts.totalCost > 0 ? ' | ' : '')}
          {totalAdditionalCosts > 0 && `${t('additionalCosts.title')}: ${totalAdditionalCosts.toFixed(2)} €`}
        </Typography>
      )}
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={4}>
          <CostCard
            label={t('materialsSummary.totalCost')}
            value={`${totalMaterialCost.toFixed(2)} €`}
            changed={totalMaterialCostChanged}
            dbValue={`${dbTotalMaterialCost.toFixed(2)} €`}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <CostCard
            label={t('materialsSummary.unitCost')}
            value={`~${unitMaterialCost.toFixed(4)} €`}
            unit={task.unit}
            changed={unitMaterialCostChanged}
            dbValue={`~${dbUnitMaterialCost.toFixed(4)} €/${task.unit}`}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <CostCard
            label={t('taskDetails:materialsSummary.totalFullProductionCost')}
            value={`${totalFullProductionCost.toFixed(2)} €`}
            color="primary"
            changed={totalFullProductionCostChanged}
            dbValue={`${dbTotalFullProductionCost.toFixed(2)} €`}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <CostCard
            label={t('taskDetails:materialsSummary.unitFullProductionCost')}
            value={`~${unitFullProductionCost.toFixed(4)} €`}
            unit={task.unit}
            color="primary"
            changed={unitFullProductionCostChanged}
            dbValue={`~${dbUnitFullProductionCost.toFixed(4)} €/${task.unit}`}
          />
        </Grid>
        {(task.factoryCostPerUnit !== undefined && task.factoryCostPerUnit > 0) && (
          <>
            <Grid item xs={12} sm={6} md={4}>
              <CostCard
                label={t('taskDetails:materialsSummary.factoryCostPerUnit', 'Koszt zakładu na jednostkę')}
                value={`~${task.factoryCostPerUnit.toFixed(4)} €`}
                unit={task.unit}
                color="secondary"
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <Card sx={{ height: '100%', bgcolor: 'success.main', color: 'success.contrastText' }}>
                <CardContent sx={{ pb: '12px !important' }}>
                  <Typography variant="body2" sx={{ opacity: 0.95 }} gutterBottom>
                    {t('taskDetails:materialsSummary.totalUnitCostWithFactory', 'Pełny koszt + zakład')}
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                    ~{(unitFullProductionCost + (task.factoryCostPerUnit || 0)).toFixed(4)} €/{task.unit}
                  </Typography>
                  <Typography variant="caption" sx={{ opacity: 0.85, display: 'block' }}>
                    {t('taskDetails:materialsSummary.totalLabel', 'Łącznie')}: {(totalFullProductionCost + (task.factoryCostTotal || 0)).toFixed(2)} €
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </>
        )}
      </Grid>
      {costChanged && (
        <Box sx={{ mt: 2 }}>
          <Button 
            variant="outlined" 
            color="primary" 
            startIcon={<SaveIcon />}
            onClick={updateMaterialCostsManually}
            size="small"
          >
            {t('materialsSummary.updateManually')}
          </Button>
        </Box>
      )}
    </Box>
  );
});

MaterialCostsSummary.displayName = 'MaterialCostsSummary';
export default MaterialCostsSummary;
