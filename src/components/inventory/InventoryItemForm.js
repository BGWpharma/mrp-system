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
  FormHelperText
} from '@mui/material';
import {
  Save as SaveIcon,
  ArrowBack as ArrowBackIcon
} from '@mui/icons-material';
import { 
  createInventoryItem, 
  updateInventoryItem, 
  getInventoryItemById
} from '../../services/inventoryService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';

const InventoryItemForm = ({ itemId }) => {
  const [loading, setLoading] = useState(!!itemId);
  const [saving, setSaving] = useState(false);
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const navigate = useNavigate();
  
  const [itemData, setItemData] = useState({
    name: '',
    description: '',
    category: '',
    quantity: 0,
    unit: 'szt.',
    location: '',
    minStock: '',
    maxStock: '',
    supplierInfo: '',
    notes: '',
    bookedQuantity: 0
  });

  useEffect(() => {
    if (itemId) {
      const fetchItem = async () => {
        try {
          const item = await getInventoryItemById(itemId);
          setItemData(item);
        } catch (error) {
          showError('Błąd podczas pobierania pozycji: ' + error.message);
          console.error('Error fetching inventory item:', error);
        } finally {
          setLoading(false);
        }
      };
      
      fetchItem();
    } else {
      setLoading(false);
    }
  }, [itemId, showError]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      if (itemId) {
        await updateInventoryItem(itemId, itemData, currentUser.uid);
        showSuccess('Pozycja została zaktualizowana');
      } else {
        await createInventoryItem(itemData, currentUser.uid);
        showSuccess('Pozycja została utworzona');
      }
      navigate('/inventory');
    } catch (error) {
      showError('Błąd podczas zapisywania pozycji: ' + error.message);
      console.error('Error saving inventory item:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setItemData(prev => ({ ...prev, [name]: value }));
  };

  if (loading) {
    return <div>Ładowanie...</div>;
  }

  return (
    <Box component="form" onSubmit={handleSubmit} noValidate>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button 
          startIcon={<ArrowBackIcon />} 
          onClick={() => navigate('/inventory')}
        >
          Powrót
        </Button>
        <Typography variant="h6">
          {itemId ? 'Edytuj pozycję magazynową' : 'Dodaj nową pozycję magazynową'}
        </Typography>
        <Button 
          type="submit"
          variant="contained" 
          color="primary"
          disabled={saving}
          startIcon={<SaveIcon />}
        >
          {saving ? 'Zapisywanie...' : 'Zapisz'}
        </Button>
      </Box>

      <Paper sx={{ p: 3 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} sm={6}>
            <TextField
              required
              fullWidth
              label="Nazwa"
              name="name"
              value={itemData.name}
              onChange={handleChange}
            />
          </Grid>
          
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Kategoria</InputLabel>
              <Select
                name="category"
                value={itemData.category || ''}
                onChange={handleChange}
                label="Kategoria"
              >
                <MenuItem value="">Brak kategorii</MenuItem>
                <MenuItem value="Surowce">Surowce</MenuItem>
                <MenuItem value="Półprodukty">Półprodukty</MenuItem>
                <MenuItem value="Opakowania">Opakowania</MenuItem>
                <MenuItem value="Gotowe produkty">Gotowe produkty</MenuItem>
                <MenuItem value="Inne">Inne</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12}>
            <TextField
              label="Opis"
              name="description"
              value={itemData.description || ''}
              onChange={handleChange}
              fullWidth
              multiline
              rows={2}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Ilość"
              name="quantity"
              type="number"
              value={itemData.quantity || ''}
              onChange={handleChange}
              inputProps={{ min: 0, step: 0.01 }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Ilość zarezerwowana"
              name="bookedQuantity"
              type="number"
              value={itemData.bookedQuantity || 0}
              InputProps={{
                readOnly: true,
              }}
              helperText="Ilość zarezerwowana na zadania produkcyjne"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Ilość dostępna"
              type="number"
              value={(itemData.quantity || 0) - (itemData.bookedQuantity || 0)}
              InputProps={{
                readOnly: true,
              }}
              helperText="Ilość całkowita minus zarezerwowana"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Jednostka"
              name="unit"
              value={itemData.unit || ''}
              onChange={handleChange}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Lokalizacja"
              name="location"
              value={itemData.location || ''}
              onChange={handleChange}
              helperText="Np. regał A, półka 2"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Minimalny stan"
              name="minStock"
              type="number"
              value={itemData.minStock || ''}
              onChange={handleChange}
              inputProps={{ min: 0, step: 0.01 }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Maksymalny stan"
              name="maxStock"
              type="number"
              value={itemData.maxStock || ''}
              onChange={handleChange}
              inputProps={{ min: 0, step: 0.01 }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Informacje o dostawcy"
              name="supplierInfo"
              value={itemData.supplierInfo || ''}
              onChange={handleChange}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Uwagi"
              name="notes"
              value={itemData.notes || ''}
              onChange={handleChange}
              multiline
              rows={3}
            />
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default InventoryItemForm;