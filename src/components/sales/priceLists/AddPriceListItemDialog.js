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
  ToggleButton
} from '@mui/material';

import { 
  addPriceListItem, 
  DEFAULT_PRICE_LIST_ITEM 
} from '../../../services/priceListService';
import { getAllRecipes } from '../../../services/recipeService';
import { getInventoryItemsByCategory } from '../../../services/inventory';
import { UNIT_OPTIONS } from '../../../config';
import { useAuth } from '../../../contexts/AuthContext';
import { useNotification } from '../../../hooks/useNotification';
import { useTranslation } from '../../../hooks/useTranslation';

const AddPriceListItemDialog = ({ open, onClose, priceListId, onItemAdded }) => {
  const [formData, setFormData] = useState({ ...DEFAULT_PRICE_LIST_ITEM, isRecipe: true });
  const [recipes, setRecipes] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [selectedInventoryItem, setSelectedInventoryItem] = useState(null);
  const [itemType, setItemType] = useState('recipe'); // 'recipe' lub 'service'
  const [loading, setLoading] = useState(false);
  const [fetchingData, setFetchingData] = useState(false);
  
  const { currentUser } = useAuth();
  const { showNotification } = useNotification();
  const { t } = useTranslation('priceLists');
  
  useEffect(() => {
    if (open) {
      fetchData();
      resetForm();
    }
  }, [open]);
  

  
  const fetchData = async () => {
    try {
      setFetchingData(true);
      const [recipesData, servicesData] = await Promise.all([
        getAllRecipes(),
        getInventoryItemsByCategory('Inne') // Pobierz tylko usługi z kategorii "Inne"
      ]);
      
      setRecipes(recipesData);
      // servicesData może być obiektem z polem items lub bezpośrednio tablicą
      const itemsArray = servicesData?.items || servicesData || [];
      setInventoryItems(itemsArray);
    } catch (error) {
      console.error('Błąd podczas pobierania danych:', error);
      showNotification(t('priceLists.dialogs.add.fetchRecipesError') || 'Błąd podczas pobierania danych', 'error');
    } finally {
      setFetchingData(false);
    }
  };
  
  const resetForm = () => {
    setFormData({ ...DEFAULT_PRICE_LIST_ITEM, isRecipe: true });
    setSelectedRecipe(null);
    setSelectedInventoryItem(null);
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
      // Resetuj wybrane pozycje
      setSelectedRecipe(null);
      setSelectedInventoryItem(null);
      // Resetuj formData
      setFormData({
        ...DEFAULT_PRICE_LIST_ITEM,
        isRecipe: newType === 'recipe',
        itemType: newType
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
        isRecipe: true,
        itemType: 'recipe'
      });
    } else {
      setFormData({
        ...formData,
        productId: '',
        productName: '',
        unit: 'szt.',
        isRecipe: true,
        itemType: 'recipe'
      });
    }
  };
  
  const handleInventoryItemChange = (_, item) => {
    setSelectedInventoryItem(item);
    if (item) {
      setFormData({
        ...formData,
        productId: item.id,
        productName: item.name,
        unit: item.unit || 'szt.',
        isRecipe: false,
        itemType: 'service'
      });
    } else {
      setFormData({
        ...formData,
        productId: '',
        productName: '',
        unit: 'szt.',
        isRecipe: false,
        itemType: 'service'
      });
    }
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.productId) {
      const errorMsg = itemType === 'recipe' 
        ? t('priceLists.dialogs.add.selectRecipe') || 'Wybierz recepturę'
        : 'Wybierz pozycję z magazynu';
      showNotification(errorMsg, 'error');
      return;
    }
    
    if (typeof formData.price !== 'number' || formData.price < 0) {
      showNotification(t('priceLists.dialogs.add.priceValidation') || 'Wprowadź poprawną cenę', 'error');
      return;
    }
    
    if (typeof formData.minQuantity !== 'number' || formData.minQuantity <= 0) {
      showNotification(t('priceLists.dialogs.add.minQuantityValidation') || 'Wprowadź poprawną minimalną ilość', 'error');
      return;
    }
    
    try {
      setLoading(true);
      const itemId = await addPriceListItem(priceListId, formData, currentUser.uid);
      const successMsg = itemType === 'recipe'
        ? t('priceLists.dialogs.add.recipeAdded') || 'Receptura dodana do listy cenowej'
        : 'Pozycja dodana do listy cenowej';
      showNotification(successMsg, 'success');
      onItemAdded({ id: itemId, ...formData });
      onClose();
      resetForm();
    } catch (error) {
      console.error('Błąd podczas dodawania elementu do listy cenowej:', error);
      showNotification(error.message || t('priceLists.dialogs.add.addError') || 'Błąd podczas dodawania', 'error');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{t('priceLists.dialogs.add.title') || 'Dodaj pozycję do listy cenowej'}</DialogTitle>
      <form onSubmit={handleSubmit}>
        <DialogContent>
          <Grid container spacing={3}>
            {/* Wybór typu pozycji */}
            <Grid item xs={12}>
              <Box sx={{ mb: 2 }}>
                <ToggleButtonGroup
                  value={itemType}
                  exclusive
                  onChange={handleItemTypeChange}
                  aria-label="typ pozycji"
                  fullWidth
                >
                  <ToggleButton value="recipe" aria-label="receptura">
                    Receptura
                  </ToggleButton>
                  <ToggleButton value="service" aria-label="usługa">
                    Usługa
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>
            </Grid>
            
            {/* Autocomplete dla receptur */}
            {itemType === 'recipe' && (
              <Grid item xs={12}>
                <Autocomplete
                  options={recipes}
                  getOptionLabel={(option) => option.name}
                  value={selectedRecipe}
                  onChange={handleRecipeChange}
                  loading={fetchingData}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={t('priceLists.dialogs.add.recipe') || 'Receptura'}
                      required
                      fullWidth
                    />
                  )}
                />
              </Grid>
            )}
            
            {/* Autocomplete dla usług */}
            {itemType === 'service' && (
              <Grid item xs={12}>
                <Autocomplete
                  options={inventoryItems}
                  getOptionLabel={(option) => option.name}
                  value={selectedInventoryItem}
                  onChange={handleInventoryItemChange}
                  loading={fetchingData}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Usługa"
                      required
                      fullWidth
                      helperText="Wybierz usługę z kategorii 'Inne'"
                    />
                  )}
                />
              </Grid>
            )}
            
            
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label={t('priceLists.dialogs.add.price') || 'Cena'}
                name="price"
                type="number"
                value={formData.price}
                onChange={handleInputChange}
                required
                inputProps={{ 
                  min: 0, 
                  step: 'any'
                }}
              />
            </Grid>
            
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                label={t('priceLists.dialogs.add.minQuantity') || 'Minimalna ilość'}
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
                label={t('priceLists.dialogs.add.unit') || 'Jednostka'}
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
                label={t('priceLists.dialogs.add.notes') || 'Notatki'}
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
            {t('priceLists.dialogs.add.cancel') || 'Anuluj'}
          </Button>
          <Button 
            type="submit" 
            color="primary" 
            variant="contained"
            disabled={loading || fetchingData}
          >
            {loading ? 'Dodawanie...' : t('priceLists.dialogs.add.add') || 'Dodaj'}
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