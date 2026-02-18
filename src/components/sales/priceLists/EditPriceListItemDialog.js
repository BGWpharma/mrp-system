import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions, 
  Button, 
  TextField, 
  Grid,
  MenuItem
} from '@mui/material';

import { updatePriceListItem } from '../../../services/priceListService';
import { UNIT_OPTIONS } from '../../../config';
import { useAuth } from '../../../contexts/AuthContext';
import { useNotification } from '../../../hooks/useNotification';
import { useTranslation } from '../../../hooks/useTranslation';

const EditPriceListItemDialog = ({ open, onClose, item, onItemUpdated }) => {
  const [formData, setFormData] = useState({
    productId: '',
    productName: '',
    price: 0,
    unit: 'szt.',
    minQuantity: 1,
    notes: ''
  });
  const [loading, setLoading] = useState(false);
  
  const { currentUser } = useAuth();
  const { showNotification } = useNotification();
  const { t } = useTranslation('priceLists');
  
  useEffect(() => {
    if (item && open) {
      setFormData({
        productId: item.productId,
        productName: item.productName,
        price: item.price,
        unit: item.unit || 'szt.',
        minQuantity: item.minQuantity || 1,
        notes: item.notes || '',
        priceListId: item.priceListId
      });
    }
  }, [item, open]);
  
  const handleInputChange = (e) => {
    const { name, value, type } = e.target;
    
    // Konwersja liczb
    if (type === 'number') {
      setFormData({
        ...formData,
        [name]: value === '' ? '' : Number(value)
      });
    } else {
      setFormData({
        ...formData,
        [name]: value
      });
    }
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (typeof formData.price !== 'number' || formData.price < 0) {
      showNotification(t('priceLists.dialogs.edit.priceValidation'), 'error');
      return;
    }
    
    if (typeof formData.minQuantity !== 'number' || formData.minQuantity <= 0) {
      showNotification(t('priceLists.dialogs.edit.minQuantityValidation'), 'error');
      return;
    }
    
    try {
      setLoading(true);
      await updatePriceListItem(item.id, formData, currentUser.uid);
      showNotification(t('priceLists.dialogs.edit.itemUpdated'), 'success');
      onItemUpdated({ id: item.id, ...formData });
    } catch (error) {
      console.error('Błąd podczas aktualizacji elementu listy cenowej:', error);
      showNotification(error.message || t('priceLists.dialogs.edit.updateError'), 'error');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{t('priceLists.dialogs.edit.title')}</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label={t('priceLists.dialogs.edit.product')}
                value={formData.productName}
                disabled
              />
            </Grid>
            
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label={t('priceLists.dialogs.edit.price')}
                name="price"
                type="number"
                value={formData.price}
                onChange={handleInputChange}
                required
                inputProps={{ 
                  min: 0, 
                  step: 'any'  // Zamiast 0.01, używamy 'any' aby umożliwić dowolną precyzję
                }}
              />
            </Grid>
            
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label={t('priceLists.dialogs.edit.minQuantity')}
                name="minQuantity"
                type="number"
                value={formData.minQuantity}
                onChange={handleInputChange}
                required
                inputProps={{ 
                  min: 1, 
                  step: 'any'
                }}
              />
            </Grid>
            
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label={t('priceLists.dialogs.edit.unit')}
                name="unit"
                select
                value={formData.unit}
                onChange={handleInputChange}
              >
                {UNIT_OPTIONS.map((option) => (
                  <MenuItem key={option} value={option}>
                    {option}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                label={t('priceLists.dialogs.edit.notes')}
                name="notes"
                value={formData.notes}
                onChange={handleInputChange}
                multiline
                rows={2}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} color="secondary">
            {t('priceLists.dialogs.edit.cancel')}
          </Button>
          <Button 
            type="submit" 
            color="primary" 
            variant="contained"
            disabled={loading}
          >
            {t('priceLists.dialogs.edit.save')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

EditPriceListItemDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  item: PropTypes.object,
  onItemUpdated: PropTypes.func.isRequired
};

export default EditPriceListItemDialog; 