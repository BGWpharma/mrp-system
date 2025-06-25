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
  MenuItem,
  ToggleButtonGroup,
  ToggleButton,
  FormHelperText
} from '@mui/material';

import { 
  addPriceListItem, 
  DEFAULT_PRICE_LIST_ITEM 
} from '../../../services/priceListService';
import * as inventoryService from '../../../services/inventoryService';
import { getAllRecipes } from '../../../services/recipeService';
import { UNIT_OPTIONS } from '../../../config';
import { useAuth } from '../../../contexts/AuthContext';
import { useNotification } from '../../../hooks/useNotification';

const AddPriceListItemDialog = ({ open, onClose, priceListId, onItemAdded }) => {
  const [formData, setFormData] = useState({ ...DEFAULT_PRICE_LIST_ITEM, isRecipe: true });
  const [products, setProducts] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fetchingProducts, setFetchingProducts] = useState(false);
  const [fetchingRecipes, setFetchingRecipes] = useState(false);
  const [itemType, setItemType] = useState('recipe'); // 'product' lub 'recipe'
  
  const { currentUser } = useAuth();
  const { showNotification } = useNotification();
  
  useEffect(() => {
    if (open) {
      fetchProducts();
      fetchRecipes();
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
  
  const fetchRecipes = async () => {
    try {
      setFetchingRecipes(true);
      const data = await getAllRecipes();
      setRecipes(data);
    } catch (error) {
      console.error('Błąd podczas pobierania receptur:', error);
      showNotification('Błąd podczas pobierania receptur', 'error');
    } finally {
      setFetchingRecipes(false);
    }
  };
  
  const resetForm = () => {
    setFormData({ ...DEFAULT_PRICE_LIST_ITEM, isRecipe: true });
    setSelectedProduct(null);
    setSelectedRecipe(null);
    setItemType('recipe');
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
  
  const handleItemTypeChange = (_, newType) => {
    if (newType !== null) {
      setItemType(newType);
      // Resetuj wybrane produkt/recepturę przy zmianie typu
      setSelectedProduct(null);
      setSelectedRecipe(null);
      setFormData({
        ...formData,
        productId: '',
        productName: '',
        unit: 'szt.',
        isRecipe: newType === 'recipe'
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
        unit: product.unit || 'szt.',
        isRecipe: false
      });
    } else {
      setFormData({
        ...formData,
        productId: '',
        productName: '',
        unit: 'szt.',
        isRecipe: false
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
      showNotification(itemType === 'product' ? 'Wybierz produkt' : 'Wybierz recepturę', 'error');
      return;
    }
    
    if (typeof formData.price !== 'number' || formData.price < 0) {
      showNotification('Cena musi być liczbą nieujemną', 'error');
      return;
    }
    
    try {
      setLoading(true);
      const itemId = await addPriceListItem(priceListId, formData, currentUser.uid);
      showNotification(
        itemType === 'product' 
          ? 'Produkt został dodany do listy cenowej' 
          : 'Receptura została dodana do listy cenowej', 
        'success'
      );
      onItemAdded({ id: itemId, ...formData });
    } catch (error) {
      console.error('Błąd podczas dodawania elementu do listy cenowej:', error);
      showNotification(error.message || 'Błąd podczas dodawania elementu do listy cenowej', 'error');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Dodaj do listy cenowej</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Box sx={{ mb: 2 }}>
                <ToggleButtonGroup
                  value={itemType}
                  exclusive
                  onChange={handleItemTypeChange}
                  color="primary"
                  fullWidth
                >
                  <ToggleButton value="product">
                    Produkt gotowy
                  </ToggleButton>
                  <ToggleButton value="recipe">
                    Receptura
                  </ToggleButton>
                </ToggleButtonGroup>
                <FormHelperText>
                  {itemType === 'product' 
                    ? 'Dodaj gotowy produkt z magazynu do listy cenowej'
                    : 'Dodaj recepturę (produkt do wytworzenia) do listy cenowej'}
                </FormHelperText>
              </Box>
            </Grid>
            
            <Grid item xs={12}>
              {itemType === 'product' ? (
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
              ) : (
                <Autocomplete
                  options={recipes}
                  getOptionLabel={(option) => option.name}
                  value={selectedRecipe}
                  onChange={handleRecipeChange}
                  loading={fetchingRecipes}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Receptura"
                      required
                      fullWidth
                    />
                  )}
                />
              )}
            </Grid>
            
            <Grid item xs={12} md={6}>
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
            
            <Grid item xs={12} md={6}>
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