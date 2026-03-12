import React from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  FormHelperText,
} from '@mui/material';
import {
  ProductionQuantityLimits as ProductIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { mt2, mb2, mr1 } from '../../../styles/muiCommonStyles';

const AddToPriceListDialog = ({
  open,
  onClose,
  recipeData,
  priceLists,
  loadingPriceLists,
  priceListData,
  onPriceListDataChange,
  onAddToPriceList,
  onSkip,
  addingToPriceList,
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
        <ProductIcon color="primary" />
        <DialogTitle sx={{ p: 0 }}>{t('recipes.priceListDialog.title')}</DialogTitle>
      </Box>
      
      <DialogContent sx={mt2}>
        <DialogContentText sx={mb2}>
          {t('recipes.priceListDialog.description', { name: recipeData.name })}
        </DialogContentText>
        
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12}>
            <FormControl 
              fullWidth 
              required 
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              disabled={loadingPriceLists}
            >
              <InputLabel id="price-list-select-label">{t('recipes.priceListDialog.priceList')}</InputLabel>
              <Select
                labelId="price-list-select-label"
                value={priceListData.priceListId}
                onChange={(e) => onPriceListDataChange('priceListId', e.target.value)}
                label={t('recipes.priceListDialog.priceList')}
                error={!priceListData.priceListId}
              >
                {loadingPriceLists ? (
                  <MenuItem disabled>
                    <CircularProgress size={20} sx={mr1} />
                    {t('recipes.priceListDialog.loadingPriceLists')}
                  </MenuItem>
                ) : priceLists.length > 0 ? (
                  priceLists.map((priceList) => (
                    <MenuItem key={priceList.id} value={priceList.id}>
                      <Box>
                        <Typography variant="body2" fontWeight="medium">
                          {priceList.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {priceList.customerName || t('recipes.priceListDialog.unknownCustomer')}
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))
                ) : (
                  <MenuItem disabled>
                    {t('recipes.priceListDialog.noPriceLists')}
                  </MenuItem>
                )}
              </Select>
              <FormHelperText>
                {!priceListData.priceListId ? t('recipes.priceListDialog.selectPriceList') : ''}
              </FormHelperText>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <TextField
              label={t('recipes.priceListDialog.unitPrice')}
              type="number"
              value={priceListData.price}
              onChange={(e) => onPriceListDataChange('price', parseFloat(e.target.value) || 0)}
              fullWidth
              required
              error={!priceListData.price || priceListData.price < 0}
              helperText={
                !priceListData.price || priceListData.price < 0 
                  ? t('recipes.priceListDialog.enterValidPrice') 
                  : t('recipes.priceListDialog.perUnit', { unit: recipeData.yield?.unit || 'szt.' })
              }
              inputProps={{ min: 0, step: 0.01 }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              InputProps={{
                startAdornment: (
                  <Box sx={{ color: 'text.secondary', mr: 1, display: 'flex', alignItems: 'center' }}>
                    €
                  </Box>
                )
              }}
            />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <TextField
              label={t('recipes.priceListDialog.unit')}
              value={recipeData.yield?.unit || 'szt.'}
              fullWidth
              disabled
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              helperText={t('recipes.priceListDialog.unitFromRecipe')}
            />
          </Grid>
          
          <Grid item xs={12}>
            <TextField
              label={t('recipes.priceListDialog.notes')}
              value={priceListData.notes}
              onChange={(e) => onPriceListDataChange('notes', e.target.value)}
              fullWidth
              multiline
              rows={2}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              helperText={t('recipes.priceListDialog.notesHelper')}
            />
          </Grid>
        </Grid>
      </DialogContent>
      
      <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <Button 
          onClick={onSkip}
          variant="outlined"
          sx={{ borderRadius: '8px' }}
        >
          {t('recipes.priceListDialog.skip')}
        </Button>
        <Button 
          onClick={onAddToPriceList} 
          variant="contained" 
          color="primary"
          disabled={addingToPriceList || !priceListData.priceListId || !priceListData.price || priceListData.price < 0}
          startIcon={addingToPriceList ? <CircularProgress size={20} /> : <AddIcon />}
          sx={{ 
            borderRadius: '8px', 
            boxShadow: '0 4px 6px rgba(0,0,0,0.15)',
            px: 3
          }}
        >
          {addingToPriceList ? t('recipes.priceListDialog.adding') : t('recipes.priceListDialog.addButton')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddToPriceListDialog;
