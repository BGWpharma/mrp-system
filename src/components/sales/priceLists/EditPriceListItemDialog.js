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
      showNotification('Cena musi być liczbą nieujemną', 'error');
      return;
    }
    
    if (typeof formData.minQuantity !== 'number' || formData.minQuantity <= 0) {
      showNotification('Minimalna ilość musi być liczbą dodatnią', 'error');
      return;
    }
    
    try {
      setLoading(true);
      await updatePriceListItem(item.id, formData, currentUser.uid);
      showNotification('Element listy cenowej został zaktualizowany', 'success');
      onItemUpdated({ id: item.id, ...formData });
    } catch (error) {
      console.error('Błąd podczas aktualizacji elementu listy cenowej:', error);
      showNotification(error.message || 'Błąd podczas aktualizacji elementu listy cenowej', 'error');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Edytuj element listy cenowej</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Produkt"
                value={formData.productName}
                disabled
              />
            </Grid>
            
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="Cena"
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
                label="Minimalna ilość"
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
                label="Jednostka"
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
                label="Uwagi"
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
            Anuluj
          </Button>
          <Button 
            type="submit" 
            color="primary" 
            variant="contained"
            disabled={loading}
          >
            Zapisz zmiany
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