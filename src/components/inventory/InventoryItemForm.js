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
  getInventoryItemById,
  getAllWarehouses
} from '../../services/inventoryService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';

const InventoryItemForm = ({ itemId }) => {
  const [loading, setLoading] = useState(!!itemId);
  const [saving, setSaving] = useState(false);
  const [warehouses, setWarehouses] = useState([]);
  const [warehousesLoading, setWarehousesLoading] = useState(true);
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
    warehouseId: '',
    minStock: '',
    maxStock: '',
    supplierInfo: '',
    notes: '',
    bookedQuantity: 0
  });

  useEffect(() => {
    const fetchWarehouses = async () => {
      try {
        const warehouseList = await getAllWarehouses();
        setWarehouses(warehouseList);
        
        // Jeśli jest tylko jeden magazyn, ustaw go jako domyślny
        if (warehouseList.length === 1 && !itemId) {
          setItemData(prev => ({ ...prev, warehouseId: warehouseList[0].id }));
        }
      } catch (error) {
        showError('Błąd podczas pobierania magazynów: ' + error.message);
      } finally {
        setWarehousesLoading(false);
      }
    };
    
    fetchWarehouses();
  }, [showError, itemId]);

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
    
    // Walidacja
    if (!itemData.warehouseId) {
      showError('Należy wybrać magazyn');
      setSaving(false);
      return;
    }
    
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

  if (loading || warehousesLoading) {
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
            <FormControl fullWidth required>
              <InputLabel id="warehouse-label">Magazyn</InputLabel>
              <Select
                labelId="warehouse-label"
                name="warehouseId"
                value={itemData.warehouseId}
                onChange={handleChange}
                label="Magazyn"
              >
                <MenuItem value="">
                  <em>Wybierz magazyn</em>
                </MenuItem>
                {warehouses.map((warehouse) => (
                  <MenuItem key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </MenuItem>
                ))}
              </Select>
              {!itemData.warehouseId && (
                <FormHelperText error>Wybór magazynu jest wymagany</FormHelperText>
              )}
            </FormControl>
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