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
import { createInventoryItem, updateInventoryItem, getInventoryItemById } from '../../services/inventoryService';
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
    return <div>Ładowanie pozycji...</div>;
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
        <Typography variant="h5">
          {itemId ? 'Edycja pozycji magazynowej' : 'Nowa pozycja magazynowa'}
        </Typography>
        <Button 
          variant="contained" 
          color="primary" 
          type="submit"
          startIcon={<SaveIcon />}
          disabled={saving}
        >
          {saving ? 'Zapisywanie...' : 'Zapisz'}
        </Button>
      </Box>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} sm={6}>
            <TextField
              required
              label="Nazwa"
              name="name"
              value={itemData.name}
              onChange={handleChange}
              fullWidth
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
              helperText="Ilość dostępna do wykorzystania"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Jednostka</InputLabel>
              <Select
                name="unit"
                value={itemData.unit}
                onChange={handleChange}
                label="Jednostka"
              >
                <MenuItem value="szt.">szt.</MenuItem>
                <MenuItem value="g">g</MenuItem>
                <MenuItem value="kg">kg</MenuItem>
                <MenuItem value="ml">ml</MenuItem>
                <MenuItem value="l">l</MenuItem>
                <MenuItem value="opak.">opak.</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Lokalizacja w magazynie"
              name="location"
              value={itemData.location || ''}
              onChange={handleChange}
              fullWidth
              placeholder="np. Regał A, Półka 2"
            />
          </Grid>
          <Grid item xs={12} sm={3}>
            <TextField
              label="Minimalny stan"
              name="minStock"
              type="number"
              value={itemData.minStock || ''}
              onChange={handleChange}
              fullWidth
              inputProps={{ min: 0 }}
            />
          </Grid>
          <Grid item xs={12} sm={3}>
            <TextField
              label="Maksymalny stan"
              name="maxStock"
              type="number"
              value={itemData.maxStock || ''}
              onChange={handleChange}
              fullWidth
              inputProps={{ min: 0 }}
            />
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Informacje dodatkowe</Typography>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <TextField
              label="Informacje o dostawcy"
              name="supplierInfo"
              value={itemData.supplierInfo || ''}
              onChange={handleChange}
              fullWidth
              multiline
              rows={2}
              placeholder="Nazwa dostawcy, kontakt, warunki dostawy..."
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              label="Notatki"
              name="notes"
              value={itemData.notes || ''}
              onChange={handleChange}
              fullWidth
              multiline
              rows={3}
              placeholder="Dodatkowe uwagi, specjalne instrukcje przechowywania..."
            />
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
};

export default InventoryItemForm;