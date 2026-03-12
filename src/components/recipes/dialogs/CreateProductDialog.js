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
} from '@mui/material';
import {
  ProductionQuantityLimits as ProductIcon,
} from '@mui/icons-material';
import { mt2, mb2 } from '../../../styles/muiCommonStyles';

const CreateProductDialog = ({
  open,
  onClose,
  productData,
  onProductDataChange,
  onCreate,
  creating,
  warehouses,
  t
}) => {
  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="md"
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
        <DialogTitle sx={{ p: 0 }}>{t('recipes.createProductDialog.title')}</DialogTitle>
      </Box>
      
      <DialogContent sx={mt2}>
        <DialogContentText sx={mb2}>
          {t('recipes.createProductDialog.description')}
        </DialogContentText>
        
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12} md={6}>
            <TextField
              name="name"
              label={t('recipes.createProductDialog.productSKU')}
              value={productData.name}
              onChange={onProductDataChange}
              fullWidth
              required
              error={!productData.name}
              helperText={!productData.name ? t('recipes.createProductDialog.skuRequired') : ''}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              InputProps={{
                startAdornment: (
                  <Box sx={{ color: 'text.secondary', mr: 1, display: 'flex', alignItems: 'center' }}>
                    <ProductIcon fontSize="small" />
                  </Box>
                )
              }}
            />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <FormControl fullWidth required sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}>
              <InputLabel id="warehouse-select-label">{t('recipes.createProductDialog.location')}</InputLabel>
              <Select
                labelId="warehouse-select-label"
                id="warehouse-select"
                name="warehouseId"
                value={productData.warehouseId}
                onChange={onProductDataChange}
                label={t('recipes.createProductDialog.location')}
                error={!productData.warehouseId}
                startAdornment={<Box sx={{ color: 'text.secondary', mr: 1, display: 'flex', alignItems: 'center' }}></Box>}
              >
                {warehouses.map((warehouse) => (
                  <MenuItem key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12}>
            <TextField
              name="description"
              label={t('recipes.createProductDialog.productDescription')}
              value={productData.description}
              onChange={onProductDataChange}
              fullWidth
              multiline
              rows={2}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <TextField
              name="category"
              label={t('recipes.createProductDialog.category')}
              value={productData.category}
              onChange={onProductDataChange}
              fullWidth
              InputProps={{
                readOnly: true,
                startAdornment: (
                  <Box sx={{ color: 'text.secondary', mr: 1, display: 'flex', alignItems: 'center' }}></Box>
                )
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <FormControl fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}>
              <InputLabel id="unit-select-label">{t('recipes.createProductDialog.unit')}</InputLabel>
              <Select
                labelId="unit-select-label"
                id="unit-select"
                name="unit"
                value={productData.unit}
                onChange={onProductDataChange}
                label={t('recipes.createProductDialog.unit')}
                startAdornment={<Box sx={{ color: 'text.secondary', mr: 1, display: 'flex', alignItems: 'center' }}></Box>}
              >
                <MenuItem value="szt.">szt.</MenuItem>
                <MenuItem value="kg">kg</MenuItem>
                <MenuItem value="caps">caps</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <TextField
              name="quantity"
              label={t('recipes.createProductDialog.initialQuantity')}
              type="number"
              value={productData.quantity}
              onChange={onProductDataChange}
              fullWidth
              inputProps={{ min: 0, step: 0.01 }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Grid>
          
          <Grid item xs={12} md={4}>
            <TextField
              name="minStockLevel"
              label={t('recipes.createProductDialog.minLevel')}
              type="number"
              value={productData.minStockLevel}
              onChange={onProductDataChange}
              fullWidth
              inputProps={{ min: 0, step: 0.01 }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Grid>
          
          <Grid item xs={12} md={4}>
            <TextField
              name="maxStockLevel"
              label={t('recipes.createProductDialog.optimalLevel')}
              type="number"
              value={productData.maxStockLevel}
              onChange={onProductDataChange}
              fullWidth
              inputProps={{ min: 0, step: 0.01 }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <Button 
          onClick={onClose}
          variant="outlined"
          sx={{ borderRadius: '8px' }}
        >
          {t('recipes.createProductDialog.cancel')}
        </Button>
        <Button 
          onClick={onCreate} 
          variant="contained" 
          color="primary"
          disabled={creating || !productData.name || !productData.warehouseId}
          startIcon={creating ? <CircularProgress size={20} /> : <ProductIcon />}
          sx={{ 
            borderRadius: '8px', 
            boxShadow: '0 4px 6px rgba(0,0,0,0.15)',
            px: 3
          }}
        >
          {creating ? t('recipes.createProductDialog.saving') : t('recipes.createProductDialog.addToInventory')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CreateProductDialog;
