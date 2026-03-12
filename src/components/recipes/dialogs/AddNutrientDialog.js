import React from 'react';
import {
  Box,
  Button,
  TextField,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  FormHelperText,
} from '@mui/material';
import { Science as ScienceIcon } from '@mui/icons-material';
import { NUTRITIONAL_CATEGORIES } from '../../../utils/constants';
import { mt2, mb2 } from '../../../styles/muiCommonStyles';

const AddNutrientDialog = ({
  open,
  onClose,
  newNutrientData,
  onNutrientDataChange,
  onSave,
  t
}) => {
  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '12px',
          overflow: 'hidden'
        }
      }}
    >
      <Box sx={{ 
        p: 2, 
        display: 'flex', 
        alignItems: 'center', 
        gap: 1,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: 'action.hover'
      }}>
        <ScienceIcon color="primary" />
        <DialogTitle sx={{ p: 0 }}>{t('recipes.addNutrientDialog.title')}</DialogTitle>
      </Box>
      
      <DialogContent sx={mt2}>
        <DialogContentText sx={mb2}>
          {t('recipes.addNutrientDialog.description')}
        </DialogContentText>
        
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12} md={6}>
            <TextField
              label={t('recipes.addNutrientDialog.code')}
              value={newNutrientData.code}
              onChange={(e) => onNutrientDataChange(prev => ({ ...prev, code: e.target.value }))}
              fullWidth
              required
              error={!newNutrientData.code}
              helperText={!newNutrientData.code ? t('recipes.addNutrientDialog.codeRequired') : t('recipes.addNutrientDialog.codeHelper')}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              InputProps={{
                startAdornment: (
                  <Box sx={{ color: 'text.secondary', mr: 1, display: 'flex', alignItems: 'center' }}>
                    <ScienceIcon fontSize="small" />
                  </Box>
                )
              }}
            />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <TextField
              label={t('recipes.addNutrientDialog.unit')}
              value={newNutrientData.unit}
              onChange={(e) => onNutrientDataChange(prev => ({ ...prev, unit: e.target.value }))}
              fullWidth
              required
              error={!newNutrientData.unit}
              helperText={!newNutrientData.unit ? t('recipes.addNutrientDialog.unitRequired') : t('recipes.addNutrientDialog.unitHelper')}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Grid>
          
          <Grid item xs={12}>
            <TextField
              label={t('recipes.addNutrientDialog.name')}
              value={newNutrientData.name}
              onChange={(e) => onNutrientDataChange(prev => ({ ...prev, name: e.target.value }))}
              fullWidth
              required
              error={!newNutrientData.name}
              helperText={!newNutrientData.name ? t('recipes.addNutrientDialog.nameRequired') : t('recipes.addNutrientDialog.nameHelper')}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Grid>
          
          <Grid item xs={12}>
            <FormControl fullWidth required sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}>
              <InputLabel id="category-select-label">{t('recipes.addNutrientDialog.category')}</InputLabel>
              <Select
                labelId="category-select-label"
                value={newNutrientData.category}
                onChange={(e) => onNutrientDataChange(prev => ({ ...prev, category: e.target.value }))}
                label={t('recipes.addNutrientDialog.category')}
                error={!newNutrientData.category}
              >
                {Object.values(NUTRITIONAL_CATEGORIES).map((category) => (
                  <MenuItem key={category} value={category}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip 
                        size="small" 
                        label={category}
                        color={
                          category === 'Witaminy' ? 'success' :
                          category === 'Minerały' ? 'info' :
                          category === 'Makroelementy' ? 'primary' :
                          category === 'Energia' ? 'warning' :
                          category === 'Składniki aktywne' ? 'secondary' :
                          'default'
                        }
                      />
                    </Box>
                  </MenuItem>
                ))}
              </Select>
              <FormHelperText>
                {!newNutrientData.category ? t('recipes.addNutrientDialog.categoryRequired') : ''}
              </FormHelperText>
            </FormControl>
          </Grid>
        </Grid>
      </DialogContent>
      
      <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <Button 
          onClick={onClose}
          variant="outlined"
          sx={{ borderRadius: '8px' }}
        >
          {t('recipes.addNutrientDialog.cancel')}
        </Button>
        <Button 
          onClick={onSave} 
          variant="contained" 
          color="secondary"
          disabled={!newNutrientData.code || !newNutrientData.name || !newNutrientData.unit || !newNutrientData.category}
          startIcon={<ScienceIcon />}
          sx={{ 
            borderRadius: '8px', 
            boxShadow: '0 4px 6px rgba(0,0,0,0.15)',
            px: 3
          }}
        >
          {t('recipes.addNutrientDialog.addButton')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddNutrientDialog;
