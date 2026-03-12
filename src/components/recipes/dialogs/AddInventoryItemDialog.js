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
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Alert,
} from '@mui/material';
import {
  Inventory as InventoryIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { mt2, mb2 } from '../../../styles/muiCommonStyles';

const AddInventoryItemDialog = ({
  open,
  onClose,
  newInventoryItemData,
  onInventoryItemDataChange,
  onAdd,
  adding,
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
        <InventoryIcon color="primary" />
        <DialogTitle sx={{ p: 0 }}>{t('recipes.ingredients.newItemDialog.title')}</DialogTitle>
      </Box>
      
      <DialogContent sx={mt2}>
        <DialogContentText sx={mb2}>
          {t('recipes.ingredients.newItemDialog.description')}
        </DialogContentText>
        <Alert severity="info" sx={{ mb: 2 }}>
          <strong>{t('recipes.ingredients.newItemDialog.alertTitle')}</strong> {t('recipes.ingredients.newItemDialog.alertMessage')}
        </Alert>
        
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12}>
            <TextField
              fullWidth
              required
              label={t('recipes.ingredients.newItemDialog.nameSKU')}
              value={newInventoryItemData.name}
              onChange={(e) => onInventoryItemDataChange({ ...newInventoryItemData, name: e.target.value })}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              autoFocus
              placeholder={t('recipes.ingredients.newItemDialog.namePlaceholder')}
            />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <FormControl fullWidth required sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}>
              <InputLabel>{t('recipes.ingredients.newItemDialog.category')}</InputLabel>
              <Select
                value={newInventoryItemData.category}
                onChange={(e) => onInventoryItemDataChange({ ...newInventoryItemData, category: e.target.value })}
                label={t('recipes.ingredients.newItemDialog.category')}
              >
                <MenuItem value="Surowce">{t('recipes.ingredients.newItemDialog.categoryRawMaterials')}</MenuItem>
                <MenuItem value="Opakowania zbiorcze">{t('recipes.ingredients.newItemDialog.categoryCollectivePackaging')}</MenuItem>
                <MenuItem value="Opakowania jednostkowe">{t('recipes.ingredients.newItemDialog.categoryIndividualPackaging')}</MenuItem>
                <MenuItem value="Gotowe produkty">{t('recipes.ingredients.newItemDialog.categoryFinishedProducts')}</MenuItem>
                <MenuItem value="Inne">{t('recipes.ingredients.newItemDialog.categoryOther')}</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <FormControl fullWidth required sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}>
              <InputLabel>{t('recipes.ingredients.newItemDialog.unit')}</InputLabel>
              <Select
                value={newInventoryItemData.unit}
                onChange={(e) => onInventoryItemDataChange({ ...newInventoryItemData, unit: e.target.value })}
                label={t('recipes.ingredients.newItemDialog.unit')}
              >
                <MenuItem value="szt.">szt.</MenuItem>
                <MenuItem value="kg">kg</MenuItem>
                <MenuItem value="caps">caps</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12}>
            <TextField
              fullWidth
              label={t('recipes.ingredients.newItemDialog.description')}
              value={newInventoryItemData.description}
              onChange={(e) => onInventoryItemDataChange({ ...newInventoryItemData, description: e.target.value })}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              multiline
              rows={2}
              placeholder={t('recipes.ingredients.newItemDialog.descriptionPlaceholder')}
            />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label={t('recipes.ingredients.newItemDialog.casNumber')}
              value={newInventoryItemData.casNumber}
              onChange={(e) => onInventoryItemDataChange({ ...newInventoryItemData, casNumber: e.target.value })}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              placeholder={t('recipes.ingredients.newItemDialog.casPlaceholder')}
              helperText={t('recipes.ingredients.newItemDialog.casHelper')}
            />
          </Grid>
          
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label={t('recipes.ingredients.newItemDialog.barcode')}
              value={newInventoryItemData.barcode}
              onChange={(e) => onInventoryItemDataChange({ ...newInventoryItemData, barcode: e.target.value })}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              placeholder={t('recipes.ingredients.newItemDialog.barcodePlaceholder')}
            />
          </Grid>
          
          <Grid item xs={12}>
            <TextField
              fullWidth
              label={t('recipes.ingredients.newItemDialog.location')}
              value={newInventoryItemData.location}
              onChange={(e) => onInventoryItemDataChange({ ...newInventoryItemData, location: e.target.value })}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              placeholder={t('recipes.ingredients.newItemDialog.locationPlaceholder')}
              helperText={t('recipes.ingredients.newItemDialog.locationHelper')}
            />
          </Grid>
        </Grid>
      </DialogContent>
      
      <DialogActions sx={{
        p: 2,
        bgcolor: 'action.hover',
        borderTop: '1px solid',
        borderColor: 'divider'
      }}>
        <Button 
          onClick={onClose} 
          variant="outlined" 
          color="inherit"
          disabled={adding}
          sx={{ borderRadius: '8px' }}
        >
          {t('recipes.ingredients.newItemDialog.cancel')}
        </Button>
        <Button 
          onClick={onAdd} 
          variant="contained" 
          color="primary"
          disabled={adding || !newInventoryItemData.name.trim() || !newInventoryItemData.category || !newInventoryItemData.unit}
          startIcon={adding ? <CircularProgress size={20} /> : <AddIcon />}
          sx={{ 
            borderRadius: '8px', 
            boxShadow: '0 4px 6px rgba(0,0,0,0.15)',
            px: 3
          }}
        >
          {adding ? t('recipes.ingredients.newItemDialog.adding') : t('recipes.ingredients.newItemDialog.addButton')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddInventoryItemDialog;
