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
  Autocomplete,
  Box,
  MenuItem
} from '@mui/material';

import { 
  addPriceListItem, 
  DEFAULT_PRICE_LIST_ITEM 
} from '../../../services/priceListService';
import * as inventoryService from '../../../services/inventoryService';
import { UNIT_OPTIONS } from '../../../config';
import { useAuth } from '../../../contexts/AuthContext';
import { useNotification } from '../../../contexts/NotificationContext';

const AddPriceListItemDialog = ({ open, onClose, priceListId, onItemAdded }) => {
  const [formData, setFormData] = useState({ ...DEFAULT_PRICE_LIST_ITEM });
  const [products, setProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetchingProducts, setFetchingProducts] = useState(false);
  
  const { currentUser } = useAuth();
  const { showNotification } = useNotification();
  
  useEffect(() => {
    if (open) {
      fetchProducts();
      resetForm();
    }
  }, [open]);
  
  const fetchProducts = async () => {
    try {
      setFetchingProducts(true);
      const data = await inventoryService.getAllInventoryItems();
      setProducts(data);
    } catch (error) {
      console.error('Błąd podczas pobierania produktów:', error);
      showNotification('Błąd podczas pobierania produktów', 'error');
    } finally {
      setFetchingProducts(false);
    }
  };
  
  const resetForm = () => {
    setFormData({ ...DEFAULT_PRICE_LIST_ITEM });
    setSelectedProduct(null);
  };
  
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
  
  const handleProductChange = (_, product) => {
    setSelectedProduct(product);
    if (product) {
      setFormData({
        ...formData,
        productId: product.id,
        productName: product.name,
        unit: product.unit || 'szt.'
      });
    } else {
      setFormData({
        ...formData,
        productId: '',
        productName: '',
        unit: 'szt.'
      });
    }
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.productId) {
      showNotification('Wybierz produkt', 'error');
      return;
    }
    
    if (typeof formData.price !== 'number' || formData.price < 0) {
      showNotification('Cena musi być liczbą nieujemną', 'error');
      return;
    }
    
    if (typeof formData.minQuantity !== 'number' || formData.minQuantity < 1) {
      showNotification('Minimalna ilość musi być liczbą dodatnią', 'error');
      return;
    }
    
    try {
      setLoading(true);
      const itemId = await addPriceListItem(priceListId, formData, currentUser.uid);
      showNotification('Produkt został dodany do listy cenowej', 'success');
      onItemAdded({ id: itemId, ...formData });
    } catch (error) {
      console.error('Błąd podczas dodawania produktu do listy cenowej:', error);
      showNotification(error.message || 'Błąd podczas dodawania produktu do listy cenowej', 'error');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Dodaj produkt do listy cenowej</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Autocomplete
                options={products}
                getOptionLabel={(option) => option.name}
                value={selectedProduct}
                onChange={handleProductChange}
                loading={fetchingProducts}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Produkt"
                    required
                    fullWidth
                  />
                )}
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
                inputProps={{ min: 0, step: 0.01 }}
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
            
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label="Minimalna ilość"
                name="minQuantity"
                type="number"
                value={formData.minQuantity}
                onChange={handleInputChange}
                required
                inputProps={{ min: 1, step: 1 }}
              />
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
            Dodaj
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

AddPriceListItemDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  priceListId: PropTypes.string.isRequired,
  onItemAdded: PropTypes.func.isRequired
};

export default AddPriceListItemDialog; 