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
import { getAllRecipes } from '../../../services/recipeService';
import { UNIT_OPTIONS } from '../../../config';
import { useAuth } from '../../../contexts/AuthContext';
import { useNotification } from '../../../hooks/useNotification';
import { useTranslation } from '../../../hooks/useTranslation';

const AddPriceListItemDialog = ({ open, onClose, priceListId, onItemAdded }) => {
  const [formData, setFormData] = useState({ ...DEFAULT_PRICE_LIST_ITEM, isRecipe: true });
  const [recipes, setRecipes] = useState([]);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetchingRecipes, setFetchingRecipes] = useState(false);
  
  const { currentUser } = useAuth();
  const { showNotification } = useNotification();
  const { t } = useTranslation();
  
  useEffect(() => {
    if (open) {
      fetchRecipes();
      resetForm();
    }
  }, [open]);
  

  
  const fetchRecipes = async () => {
    try {
      setFetchingRecipes(true);
      const data = await getAllRecipes();
      setRecipes(data);
    } catch (error) {
      console.error('Błąd podczas pobierania receptur:', error);
      showNotification(t('priceLists.dialogs.add.fetchRecipesError'), 'error');
    } finally {
      setFetchingRecipes(false);
    }
  };
  
  const resetForm = () => {
    setFormData({ ...DEFAULT_PRICE_LIST_ITEM, isRecipe: true });
    setSelectedRecipe(null);
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
  

  
  const handleRecipeChange = (_, recipe) => {
    setSelectedRecipe(recipe);
    if (recipe) {
      setFormData({
        ...formData,
        productId: recipe.id,
        productName: recipe.name,
        unit: recipe.yield?.unit || 'szt.',
        isRecipe: true
      });
    } else {
      setFormData({
        ...formData,
        productId: '',
        productName: '',
        unit: 'szt.',
        isRecipe: true
      });
    }
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.productId) {
      showNotification(t('priceLists.dialogs.add.selectRecipe'), 'error');
      return;
    }
    
    if (typeof formData.price !== 'number' || formData.price < 0) {
      showNotification(t('priceLists.dialogs.add.priceValidation'), 'error');
      return;
    }
    
    if (typeof formData.minQuantity !== 'number' || formData.minQuantity <= 0) {
      showNotification(t('priceLists.dialogs.add.minQuantityValidation'), 'error');
      return;
    }
    
    try {
      setLoading(true);
      const itemId = await addPriceListItem(priceListId, formData, currentUser.uid);
      showNotification(t('priceLists.dialogs.add.recipeAdded'), 'success');
      onItemAdded({ id: itemId, ...formData });
    } catch (error) {
      console.error('Błąd podczas dodawania elementu do listy cenowej:', error);
      showNotification(error.message || t('priceLists.dialogs.add.addError'), 'error');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{t('priceLists.dialogs.add.title')}</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Autocomplete
                options={recipes}
                getOptionLabel={(option) => option.name}
                value={selectedRecipe}
                onChange={handleRecipeChange}
                loading={fetchingRecipes}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={t('priceLists.dialogs.add.recipe')}
                    required
                    fullWidth
                  />
                )}
              />
            </Grid>
            
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label={t('priceLists.dialogs.add.price')}
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
                label={t('priceLists.dialogs.add.minQuantity')}
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
                label={t('priceLists.dialogs.add.unit')}
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
                label={t('priceLists.dialogs.add.notes')}
                name="notes"
                value={formData.notes || ''}
                onChange={handleInputChange}
                multiline
                rows={2}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} color="secondary">
            {t('priceLists.dialogs.add.cancel')}
          </Button>
          <Button 
            type="submit" 
            color="primary" 
            variant="contained"
            disabled={loading}
          >
            {t('priceLists.dialogs.add.add')}
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