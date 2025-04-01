import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Grid,
  CircularProgress,
  InputAdornment
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { ArrowBack as ArrowBackIcon, Save as SaveIcon } from '@mui/icons-material';
import { getInventoryItemById, getItemBatches, updateBatch } from '../../services/inventoryService';
import { useNotification } from '../../hooks/useNotification';
import { useAuth } from '../../hooks/useAuth';

const BatchEditForm = () => {
  const { id, batchId } = useParams();
  const navigate = useNavigate();
  const { showSuccess, showError } = useNotification();
  const { currentUser } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [item, setItem] = useState(null);
  const [batchData, setBatchData] = useState({
    batchNumber: '',
    lotNumber: '',
    expiryDate: null,
    notes: '',
    unitPrice: '',
    quantity: ''
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Pobierz dane pozycji magazynowej
        const itemData = await getInventoryItemById(id);
        setItem(itemData);
        
        // Pobierz partie dla tej pozycji
        const batches = await getItemBatches(id);
        
        // Znajdź konkretną partię
        const batch = batches.find(b => b.id === batchId);
        
        if (!batch) {
          showError('Nie znaleziono partii o podanym ID');
          navigate(`/inventory/${id}/batches`);
          return;
        }
        
        // Ustaw dane partii w formularzu
        setBatchData({
          batchNumber: batch.batchNumber || '',
          lotNumber: batch.lotNumber || '',
          expiryDate: batch.expiryDate ? new Date(batch.expiryDate) : null,
          notes: batch.notes || '',
          unitPrice: batch.unitPrice || '',
          quantity: batch.quantity || 0
        });
      } catch (error) {
        showError('Błąd podczas pobierania danych: ' + error.message);
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [id, batchId, navigate, showError]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setBatchData(prev => ({ ...prev, [name]: value }));
  };

  const handleDateChange = (date) => {
    setBatchData(prev => ({ ...prev, expiryDate: date }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setSaving(true);
      
      // Walidacja
      if (batchData.unitPrice && isNaN(parseFloat(batchData.unitPrice))) {
        throw new Error('Cena jednostkowa musi być liczbą');
      }
      
      if (batchData.quantity && isNaN(parseFloat(batchData.quantity))) {
        throw new Error('Ilość musi być liczbą');
      }
      
      if (parseFloat(batchData.quantity) < 0) {
        throw new Error('Ilość nie może być ujemna');
      }
      
      // Przygotuj dane do aktualizacji
      const updateData = {
        batchNumber: batchData.batchNumber,
        lotNumber: batchData.lotNumber,
        expiryDate: batchData.expiryDate,
        notes: batchData.notes,
        unitPrice: batchData.unitPrice ? parseFloat(batchData.unitPrice) : 0,
        quantity: batchData.quantity ? parseFloat(batchData.quantity) : 0
      };
      
      // Aktualizuj partię
      await updateBatch(batchId, updateData, currentUser.uid);
      
      showSuccess('Partia została zaktualizowana');
      navigate(`/inventory/${id}/batches`);
    } catch (error) {
      showError('Błąd podczas aktualizacji partii: ' + error.message);
      console.error('Error updating batch:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button 
            startIcon={<ArrowBackIcon />} 
            onClick={() => navigate(`/inventory/${id}/batches`)}
          >
            Powrót
          </Button>
          <Typography variant="h5">
            Edycja partii: {item?.name}
          </Typography>
          <Button 
            variant="contained" 
            color="primary" 
            type="submit"
            startIcon={<SaveIcon />}
            disabled={saving}
          >
            {saving ? 'Zapisywanie...' : 'Zapisz zmiany'}
          </Button>
        </Box>

        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>Dane partii</Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Numer partii"
                name="batchNumber"
                value={batchData.batchNumber}
                onChange={handleChange}
                margin="normal"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Numer LOT"
                name="lotNumber"
                value={batchData.lotNumber}
                onChange={handleChange}
                margin="normal"
                disabled // Numer LOT nie powinien być edytowalny
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <DatePicker
                label="Data ważności"
                value={batchData.expiryDate}
                onChange={handleDateChange}
                slotProps={{
                  textField: {
                    fullWidth: true,
                    margin: 'normal'
                  }
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Cena jednostkowa (EUR)"
                name="unitPrice"
                type="number"
                value={batchData.unitPrice}
                onChange={handleChange}
                margin="normal"
                InputProps={{
                  startAdornment: <InputAdornment position="start">EUR</InputAdornment>,
                  inputProps: { min: 0, step: 0.01 }
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Ilość"
                name="quantity"
                type="number"
                value={batchData.quantity}
                onChange={handleChange}
                margin="normal"
                InputProps={{
                  endAdornment: <InputAdornment position="end">{item?.unit || 'szt.'}</InputAdornment>,
                  inputProps: { min: 0, step: 0.01 }
                }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Notatki"
                name="notes"
                value={batchData.notes}
                onChange={handleChange}
                margin="normal"
                multiline
                rows={4}
              />
            </Grid>
          </Grid>
        </Paper>
      </Box>
    </LocalizationProvider>
  );
};

export default BatchEditForm; 