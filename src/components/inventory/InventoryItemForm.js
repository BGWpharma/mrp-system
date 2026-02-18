// src/components/inventory/InventoryItemForm.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText,
  Alert,
  Divider,
  Autocomplete,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Chip,
  FormControlLabel,
  Switch
} from '@mui/material';
import {
  Save as SaveIcon,
  Inventory as InventoryIcon,
  LocalShipping as ShippingIcon,
  WarehouseOutlined as WarehouseIcon,
  Category as CategoryIcon,
  QrCode as QrCodeIcon,
  People as PeopleIcon
} from '@mui/icons-material';
import { 
  createInventoryItem, 
  updateInventoryItem, 
  getInventoryItemById,
  getAllInventoryItems
} from '../../services/inventory';
import { getRecipesContainingIngredient } from '../../services/recipeService';
import { getAllCustomers } from '../../services/customerService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import SupplierPricesList from './SupplierPricesList';
import BackButton from '../common/BackButton';
import ROUTES from '../../constants/routes';

const InventoryItemForm = ({ itemId }) => {
  const [loading, setLoading] = useState(!!itemId);
  const [saving, setSaving] = useState(false);
  const [packageItems, setPackageItems] = useState([]);
  const [selectedPackageItem, setSelectedPackageItem] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [originalName, setOriginalName] = useState('');
  const [recipeUpdateDialog, setRecipeUpdateDialog] = useState({ open: false, count: 0 });
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const { t } = useTranslation('inventory');
  const navigate = useNavigate();
  
  const [itemData, setItemData] = useState({
    name: '',
    description: '',
    casNumber: '',
    category: '',
    unit: 'szt.',
    location: '',
    minStock: '',
    maxStock: '',
    minOrderQuantity: '',
    weight: '',
    supplierInfo: '',
    packingGroup: '',
    boxesPerPallet: '',
    itemsPerBox: '',
    currency: 'EUR',
    barcode: '',
    parentPackageItemId: '',
    customerIds: [],
    allCustomers: false
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Pobierz pozycje magazynowe kategorii "Opakowania zbiorcze" i klientów równolegle
        const [allItems, allCustomers] = await Promise.all([
          getAllInventoryItems(),
          getAllCustomers()
        ]);
        const packages = allItems.filter(item => item.category === 'Opakowania zbiorcze');
        setPackageItems(packages);
        setCustomers(allCustomers);

        if (itemId) {
          const item = await getInventoryItemById(itemId);
          // Usuwamy pola, które nie chcemy edytować bezpośrednio
          const { quantity, bookedQuantity, notes, ...restItem } = item;
          setItemData(restItem);
          setOriginalName(restItem.name || '');
          
          // Znajdź wybrany karton jeśli istnieje
          if (restItem.parentPackageItemId) {
            const selectedPackage = packages.find(pkg => pkg.id === restItem.parentPackageItemId);
            setSelectedPackageItem(selectedPackage || null);
          }
        }
      } catch (error) {
        showError('Błąd podczas pobierania danych: ' + error.message);
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [itemId, showError]);

  const performSave = async (skipRecipeUpdates = false) => {
    setSaving(true);
    try {
      const result = await updateInventoryItem(itemId, itemData, currentUser.uid, { skipRecipeUpdates });
      const message = result.updatedRecipesCount > 0
        ? t('inventory.itemForm.updateSuccessWithRecipes', { count: result.updatedRecipesCount })
        : t('inventory.itemForm.updateSuccess');
      showSuccess(message);
      navigate(`/inventory/${itemId}`);
    } catch (error) {
      showError('Błąd podczas zapisywania pozycji: ' + error.message);
      console.error('Error saving inventory item:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (itemId) {
      const nameChanged = (itemData.name || '').trim() !== (originalName || '').trim();
      if (nameChanged) {
        const recipes = await getRecipesContainingIngredient(itemId);
        if (recipes.length > 0) {
          setRecipeUpdateDialog({ open: true, count: recipes.length });
          return;
        }
      }
      performSave(false);
    } else {
      setSaving(true);
      try {
        const newItem = await createInventoryItem(itemData, currentUser.uid);
        showSuccess('Pozycja została utworzona');
        setTimeout(() => navigate('/inventory'), 100);
      } catch (error) {
        showError('Błąd podczas zapisywania pozycji: ' + error.message);
        console.error('Error saving inventory item:', error);
      } finally {
        setSaving(false);
      }
    }
  };

  const handleRecipeUpdateDialogConfirm = () => {
    setRecipeUpdateDialog(prev => ({ ...prev, open: false }));
    performSave(false);
  };

  const handleRecipeUpdateDialogDecline = () => {
    setRecipeUpdateDialog(prev => ({ ...prev, open: false }));
    performSave(true);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setItemData(prev => ({ ...prev, [name]: value }));
  };

  const handlePackageChange = (event, newValue) => {
    setSelectedPackageItem(newValue);
    setItemData(prev => ({ 
      ...prev, 
      parentPackageItemId: newValue ? newValue.id : '' 
    }));
  };

  if (loading) {
    return <div>{t('common:common.loading')}</div>;
  }

  return (
    <Box component="form" onSubmit={handleSubmit} noValidate>
      {/* Nagłówek z przyciskami */}
      <Paper 
        elevation={2} 
        sx={{ 
          p: 2, 
          mb: 3, 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          background: theme => theme.palette.mode === 'dark' 
            ? 'linear-gradient(to right, rgba(40,50,80,1), rgba(30,40,70,1))' 
            : 'linear-gradient(to right, #f5f7fa, #e4eaf0)'
        }}
      >
        <BackButton 
          to={itemId ? ROUTES.INVENTORY_ITEM(itemId) : ROUTES.INVENTORY}
          sx={{ 
            borderRadius: '8px', 
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}
        />
        <Typography variant="h5" sx={{ fontWeight: 'medium' }}>
          {itemId ? t('inventory.itemForm.editItem') : t('inventory.itemForm.addNewItem')}
        </Typography>
        <Button 
          type="submit"
          variant="contained"
          color="primary"
          disabled={saving}
          startIcon={<SaveIcon />}
          sx={{ 
            borderRadius: '8px', 
            boxShadow: '0 4px 6px rgba(0,0,0,0.15)',
            px: 3
          }}
        >
          {saving ? t('inventory.itemForm.saving') : t('inventory.itemForm.save')}
        </Button>
      </Paper>

      {!itemId && (
        <Alert severity="info" sx={{ mb: 3 }}>
          Ilość pozycji magazynowej będzie automatycznie obliczana na podstawie sumy ilości w partiach (LOT).
          Aby dodać partie, utwórz najpierw pozycję, a następnie dodaj partie poprzez przyjęcie towaru.
        </Alert>
      )}

      <Paper 
        elevation={3} 
        sx={{ 
          p: 0, 
          mb: 3, 
          borderRadius: '12px', 
          overflow: 'hidden',
          transition: 'all 0.3s ease'
        }}
      >
        <Box 
          sx={{ 
            p: 2, 
            display: 'flex', 
            alignItems: 'center', 
            gap: 1,
            borderBottom: '1px solid',
            borderColor: 'divider',
            bgcolor: theme => theme.palette.mode === 'dark' 
              ? 'rgba(25, 35, 55, 0.5)' 
              : 'rgba(245, 247, 250, 0.8)'
          }}
        >
          <InventoryIcon color="primary" />
          <Typography variant="h6" fontWeight="500">{t('inventory.itemForm.basicData')}</Typography>
        </Box>
        
        <Box sx={{ p: 3 }}>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <TextField
                required
                fullWidth
                label={t('inventory.itemForm.sku')}
                name="name"
                value={itemData.name}
                onChange={handleChange}
                sx={{ 
                  '& .MuiOutlinedInput-root': { 
                    borderRadius: '8px' 
                  } 
                }}
                InputProps={{
                  startAdornment: (
                    <Box sx={{ color: 'text.secondary', mr: 1, display: 'flex', alignItems: 'center' }}>
                      <InventoryIcon fontSize="small" />
                    </Box>
                  ),
                }}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}>
                <InputLabel>{t('inventory.itemForm.categoryLabel')}</InputLabel>
                <Select
                  name="category"
                  value={itemData.category || ''}
                  onChange={handleChange}
                  label={t('inventory.itemForm.category')}
                  startAdornment={<Box sx={{ color: 'text.secondary', mr: 1, display: 'flex', alignItems: 'center' }}><CategoryIcon fontSize="small" /></Box>}
                >
                  <MenuItem value="">{t('inventory.itemForm.noCategory')}</MenuItem>
                  <MenuItem value="Surowce">{t('inventory.itemForm.rawMaterials')}</MenuItem>
                  <MenuItem value="Opakowania zbiorcze">{t('inventory.itemForm.collectivePackaging')}</MenuItem>
                  <MenuItem value="Opakowania jednostkowe">{t('inventory.itemForm.individualPackaging')}</MenuItem>
                  <MenuItem value="Gotowe produkty">{t('inventory.itemForm.finishedProducts')}</MenuItem>
                  <MenuItem value="Inne">{t('inventory.itemForm.other')}</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                label={t('inventory.itemForm.description')}
                name="description"
                value={itemData.description || ''}
                onChange={handleChange}
                fullWidth
                multiline
                rows={2}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              />
            </Grid>

            <Grid item xs={12}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: itemData.allCustomers ? 0 : 1 }}>
                <PeopleIcon color="action" fontSize="small" />
                <FormControlLabel
                  control={
                    <Switch
                      checked={!!itemData.allCustomers}
                      onChange={(e) => {
                        setItemData(prev => ({
                          ...prev,
                          allCustomers: e.target.checked,
                          customerIds: e.target.checked ? [] : prev.customerIds
                        }));
                      }}
                      color="primary"
                    />
                  }
                  label={t('inventory.itemForm.allCustomers')}
                />
                {itemData.allCustomers && (
                  <Chip label={t('inventory.itemForm.availableForAllCustomers')} color="primary" size="small" variant="outlined" />
                )}
              </Box>
              {!itemData.allCustomers && (
                <Autocomplete
                  multiple
                  options={customers}
                  getOptionLabel={(option) => option.name || ''}
                  value={customers.filter(c => (itemData.customerIds || []).includes(c.id))}
                  onChange={(event, newValue) => {
                    setItemData(prev => ({
                      ...prev,
                      customerIds: newValue.map(c => c.id)
                    }));
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Przypisani klienci"
                      fullWidth
                      helperText="Wybierz konkretnych klientów powiązanych z tą pozycją magazynową"
                      sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                    />
                  )}
                  isOptionEqualToValue={(option, value) => option.id === value?.id}
                  noOptionsText="Brak klientów"
                  clearText="Wyczyść"
                  openText="Otwórz"
                  closeText={t('common:common.close')}
                />
              )}
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                label={t('inventory.itemForm.casNumber')}
                name="casNumber"
                value={itemData.casNumber || ''}
                onChange={handleChange}
                fullWidth
                helperText="Chemical Abstracts Service number (opcjonalny)"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                placeholder={t('inventory.itemForm.casPlaceholder')}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                label={t('inventory.itemForm.barcode')}
                name="barcode"
                value={itemData.barcode || ''}
                onChange={handleChange}
                fullWidth
                helperText="Kod kreskowy produktu (opcjonalny)"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                placeholder={t('inventory.itemForm.barcodePlaceholder')}
                InputProps={{
                  startAdornment: (
                    <Box sx={{ color: 'text.secondary', mr: 1, display: 'flex', alignItems: 'center' }}>
                      <QrCodeIcon fontSize="small" />
                    </Box>
                  ),
                }}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                required
                label={t('inventory.itemForm.unit')}
                name="unit"
                value={itemData.unit || 'szt.'}
                onChange={handleChange}
                select
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              >
                <MenuItem value="szt.">szt.</MenuItem>
                <MenuItem value="kg">kg</MenuItem>
                <MenuItem value="caps">caps</MenuItem>
              </TextField>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={t('inventory.itemForm.location')}
                name="location"
                value={itemData.location || ''}
                onChange={handleChange}
                helperText="Np. regał A, półka 2"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                InputProps={{
                  startAdornment: (
                    <Box sx={{ color: 'text.secondary', mr: 1, display: 'flex', alignItems: 'center' }}>
                      <WarehouseIcon fontSize="small" />
                    </Box>
                  ),
                }}
              />
            </Grid>
          </Grid>
        </Box>
      </Paper>

      <Paper 
        elevation={3} 
        sx={{ 
          p: 0, 
          mb: 3, 
          borderRadius: '12px', 
          overflow: 'hidden'
        }}
      >
        <Box 
          sx={{ 
            p: 2, 
            display: 'flex', 
            alignItems: 'center', 
            gap: 1,
            borderBottom: '1px solid',
            borderColor: 'divider',
            bgcolor: theme => theme.palette.mode === 'dark' 
              ? 'rgba(25, 35, 55, 0.5)' 
              : 'rgba(245, 247, 250, 0.8)'
          }}
        >
          <ShippingIcon color="primary" />
          <Typography variant="h6" fontWeight="500">{t('inventory.itemForm.warehouseParameters')}</Typography>
        </Box>
        
        <Box sx={{ p: 3 }}>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={t('inventory.itemForm.minStock')}
                name="minStock"
                type="number"
                value={itemData.minStock || ''}
                onChange={handleChange}
                inputProps={{ min: 0, step: 0.01 }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={t('inventory.itemForm.maxStock')}
                name="maxStock"
                type="number"
                value={itemData.maxStock || ''}
                onChange={handleChange}
                inputProps={{ min: 0, step: 0.01 }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={t('inventory.itemForm.minOrderQuantity')}
                name="minOrderQuantity"
                type="number"
                value={itemData.minOrderQuantity || ''}
                onChange={handleChange}
                inputProps={{ min: 0, step: 0.01 }}
                helperText="Minimalna ilość, jaką można zamówić od dostawcy"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={t('inventory.itemForm.boxesPerPallet')}
                name="boxesPerPallet"
                type="number"
                value={itemData.boxesPerPallet || ''}
                onChange={handleChange}
                inputProps={{ min: 0, step: 1 }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={t('inventory.itemForm.itemsPerBox')}
                name="itemsPerBox"
                type="number"
                value={itemData.itemsPerBox || ''}
                onChange={handleChange}
                inputProps={{ min: 0, step: 0.01 }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label={t('inventory.itemForm.weight')}
                name="weight"
                type="number"
                value={itemData.weight || ''}
                onChange={handleChange}
                inputProps={{ min: 0, step: 0.001 }}
                helperText="Waga jednostkowa produktu w kilogramach"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                InputProps={{
                  endAdornment: (
                    <Box sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
                      kg
                    </Box>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Autocomplete
                options={packageItems}
                getOptionLabel={(option) => `${option.name} (${option.quantity} ${option.unit})`}
                value={selectedPackageItem}
                onChange={handlePackageChange}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={t('inventory.itemForm.packageRelation')}
                    fullWidth
                    helperText="Wybierz pozycję magazynową kartonu, w którym pakowana jest ta pozycja"
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                  />
                )}
                isOptionEqualToValue={(option, value) => option.id === value?.id}
                noOptionsText="Brak dostępnych kartonów"
                clearText="Wyczyść"
                openText="Otwórz"
                closeText={t('common:common.close')}
              />
            </Grid>
          </Grid>
        </Box>
      </Paper>
      
      {/* Sekcja z cenami dostawców - wyświetlana tylko przy edycji istniejącej pozycji */}
      {itemId && (
        <Paper sx={{ p: 3, mt: 3 }}>
          <Divider sx={{ mb: 3 }} />
          <SupplierPricesList itemId={itemId} currency={itemData.currency || 'EUR'} />
        </Paper>
      )}

      <Dialog
        open={recipeUpdateDialog.open}
        onClose={handleRecipeUpdateDialogDecline}
        aria-labelledby="recipe-update-dialog-title"
        aria-describedby="recipe-update-dialog-description"
      >
        <DialogTitle id="recipe-update-dialog-title">
          {t('inventory.itemForm.recipeUpdateDialog.title')}
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="recipe-update-dialog-description">
            {t('inventory.itemForm.recipeUpdateDialog.message', { count: recipeUpdateDialog.count })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleRecipeUpdateDialogDecline} color="secondary">
            {t('inventory.itemForm.recipeUpdateDialog.decline')}
          </Button>
          <Button onClick={handleRecipeUpdateDialogConfirm} color="primary" variant="contained" autoFocus>
            {t('inventory.itemForm.recipeUpdateDialog.confirm')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default InventoryItemForm;