import React from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Tooltip,
  Grid,
  FormHelperText,
} from '@mui/material';
import {
  Calculate as CalculateIcon,
  Build as BuildIcon,
  ProductionQuantityLimits as ProductIcon,
  AccessTime as AccessTimeIcon,
  SwapHoriz as SwapIcon,
  Science as ScienceIcon,
} from '@mui/icons-material';

const RecipeBasicDataSection = React.forwardRef(({
  recipeData,
  customers,
  workstations,
  costUnitDisplay,
  timeUnitDisplay,
  handleChange,
  handleCostInputChange,
  handleTimeInputChange,
  getCostDisplayValue,
  getTimeDisplayValue,
  canConvertUnit,
  toggleCostUnit,
  toggleTimeUnit,
  formatDisplayValue,
  t
}, ref) => {
  return (
    <Paper 
      ref={ref}
      elevation={3} 
      sx={{ 
        p: 0, 
        mb: 3, 
        borderRadius: '12px', 
        overflow: 'hidden', 
        transition: 'all 0.3s ease'
      }}
    >
      <Box 
        sx={{ 
          p: 2, 
          display: 'flex', 
          alignItems: 'center', 
          gap: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'action.hover'
        }}
      >
        <ProductIcon color="primary" />
        <Typography variant="h6" fontWeight="500">{t('recipes.basicData')}</Typography>
      </Box>
      
      <Box sx={{ p: 3 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              required
              name="name"
              label={t('recipes.recipeSKU')}
              value={recipeData.name}
              onChange={handleChange}
              error={!recipeData.name}
              helperText={!recipeData.name ? t('recipes.messages.skuRequired') : ''}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              InputProps={{
                startAdornment: (
                  <Box sx={{ color: 'text.secondary', mr: 1, display: 'flex', alignItems: 'center' }}>
                    <ProductIcon fontSize="small" />
                  </Box>
                ),
              }}
            />
          </Grid>
          
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}>
              <InputLabel id="customer-select-label">{t('recipes.customer')}</InputLabel>
              <Select
                labelId="customer-select-label"
                name="customerId"
                value={recipeData.customerId}
                onChange={handleChange}
                label={t('recipes.customer')}
                displayEmpty
              >
                <MenuItem value="">
                  <em>{t('recipes.noCustomer')}</em>
                </MenuItem>
                {customers.map((customer) => (
                  <MenuItem key={customer.id} value={customer.id}>
                    {customer.name}
                  </MenuItem>
                ))}
              </Select>
              <FormHelperText>{t('recipes.customerHelpText')}</FormHelperText>
            </FormControl>
          </Grid>
          
          <Grid item xs={12}>
            <TextField
              label={t('recipes.description')}
              name="description"
              value={recipeData.description || ''}
              onChange={handleChange}
              fullWidth
              multiline
              rows={2}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Grid>
          
          <Grid item xs={12} sm={6} md={4}>
            <TextField
              label={t('recipes.processingCost', { unit: costUnitDisplay || t('common.pieces') })}
              name="processingCostPerUnit"
              type="number"
              InputProps={{ 
                inputProps: { min: 0, step: 0.01 },
                startAdornment: (
                  <Box sx={{ color: 'text.secondary', mr: 1, display: 'flex', alignItems: 'center' }}>
                    <CalculateIcon fontSize="small" />
                  </Box>
                ),
                endAdornment: canConvertUnit('szt.') && (
                  <Tooltip title={t('recipes.ingredients.switchUnit')}>
                    <IconButton 
                      size="small" 
                      color="primary" 
                      onClick={toggleCostUnit}
                      sx={{ ml: 1 }}
                    >
                      <SwapIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )
              }}
              value={getCostDisplayValue()}
              onChange={handleCostInputChange}
              fullWidth
              helperText={costUnitDisplay 
                ? `Koszt w oryginalnej jednostce: ${formatDisplayValue(recipeData.processingCostPerUnit || 0)} EUR/szt.` 
                : "Koszt procesowy lub robocizny na jedną sztukę produktu"}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={4}>
            <TextField
              label={t('recipes.productionTime', { unit: timeUnitDisplay || t('common.pieces') })}
              name="productionTimePerUnit"
              type="number"
              InputProps={{ 
                inputProps: { min: 0, step: 0.01 },
                startAdornment: (
                  <Box sx={{ color: 'text.secondary', mr: 1, display: 'flex', alignItems: 'center' }}>
                    <AccessTimeIcon fontSize="small" />
                  </Box>
                ),
                endAdornment: canConvertUnit('szt.') && (
                  <Tooltip title={t('recipes.ingredients.toggleMeasurementUnit')}>
                    <IconButton 
                      size="small" 
                      color="primary" 
                      onClick={toggleTimeUnit}
                      sx={{ ml: 1 }}
                    >
                      <SwapIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )
              }}
              value={getTimeDisplayValue()}
              onChange={handleTimeInputChange}
              fullWidth
              helperText={timeUnitDisplay 
                ? `Czas w oryginalnej jednostce: ${formatDisplayValue(recipeData.productionTimePerUnit || 0)} min/szt.` 
                : "Czas potrzebny na wyprodukowanie jednej sztuki produktu"}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Grid>
          
          <Grid item xs={12} md={4}>
            <FormControl fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}>
              <InputLabel>Status</InputLabel>
              <Select
                name="status"
                value={recipeData.status || 'Robocza'}
                onChange={handleChange}
                label="Status"
                startAdornment={<Box sx={{ color: 'text.secondary', mr: 1, display: 'flex', alignItems: 'center' }}></Box>}
              >
                <MenuItem value="Robocza">Robocza</MenuItem>
                <MenuItem value="W przeglądzie">W przeglądzie</MenuItem>
                <MenuItem value="Zatwierdzona">Zatwierdzona</MenuItem>
                <MenuItem value="Wycofana">Wycofana</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}>
              <InputLabel>{t('recipes.defaultWorkstation')}</InputLabel>
              <Select
                name="defaultWorkstationId"
                value={recipeData.defaultWorkstationId || ''}
                onChange={handleChange}
                label={t('recipes.defaultWorkstation')}
                startAdornment={<Box sx={{ color: 'text.secondary', mr: 1, display: 'flex', alignItems: 'center' }}><BuildIcon fontSize="small" /></Box>}
              >
                <MenuItem value="">
                  <em>{t('recipes.none')}</em>
                </MenuItem>
                {workstations.map((workstation) => (
                  <MenuItem key={workstation.id} value={workstation.id}>
                    {workstation.name}
                  </MenuItem>
                ))}
              </Select>
              <FormHelperText>{t('recipes.workstationHelpText')}</FormHelperText>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} sm={6}>
            <TextField
              name="density"
              label={t('recipes.density')}
              value={recipeData.density}
              onChange={handleChange}
              fullWidth
              type="number"
              inputProps={{
                step: "0.01",
                min: "0"
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              helperText={t('recipes.densityHelpText')}
              InputProps={{
                startAdornment: (
                  <Box sx={{ color: 'text.secondary', mr: 1, display: 'flex', alignItems: 'center' }}>
                    <ScienceIcon fontSize="small" />
                  </Box>
                ),
              }}
            />
          </Grid>
          
          <input type="hidden" name="yield.quantity" value="1" />
          <input type="hidden" name="yield.unit" value="szt." />
        </Grid>
      </Box>
    </Paper>
  );
});

RecipeBasicDataSection.displayName = 'RecipeBasicDataSection';

export default RecipeBasicDataSection;
