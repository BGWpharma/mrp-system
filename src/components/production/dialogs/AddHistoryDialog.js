/**
 * Dialog do dodawania wpisu historii produkcji
 * Wydzielony z TaskDetailsPage.js dla lepszej organizacji kodu
 */

import React, { useState, useCallback, useEffect, memo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Alert,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Typography,
  FormControlLabel,
  Switch,
  Divider,
  CircularProgress
} from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { pl } from 'date-fns/locale';

const AddHistoryDialog = memo(({
  open,
  onClose,
  onSubmit,
  task,
  warehouses = [],
  loading = false,
  t = (key) => key
}) => {
  // Stan formularza
  const [formData, setFormData] = useState({
    quantity: '',
    startTime: new Date(),
    endTime: new Date(),
    note: ''
  });
  
  // Stan dla opcji dodawania do magazynu
  const [addToInventory, setAddToInventory] = useState(true);
  const [inventoryData, setInventoryData] = useState({
    expiryDate: null,
    lotNumber: '',
    finalQuantity: '',
    warehouseId: ''
  });
  
  const [error, setError] = useState(null);
  const [inventoryError, setInventoryError] = useState(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open && task) {
      const now = new Date();
      setFormData({
        quantity: '',
        startTime: now,
        endTime: now,
        note: ''
      });
      
      // Ustaw domyślne dane magazynowe
      let expiryDate = null;
      if (task.expiryDate) {
        try {
          if (task.expiryDate.toDate) {
            expiryDate = task.expiryDate.toDate();
          } else if (task.expiryDate.seconds) {
            expiryDate = new Date(task.expiryDate.seconds * 1000);
          } else if (typeof task.expiryDate === 'string') {
            expiryDate = new Date(task.expiryDate);
          }
        } catch (e) {
          expiryDate = new Date(new Date().setFullYear(new Date().getFullYear() + 1));
        }
      } else {
        expiryDate = new Date(new Date().setFullYear(new Date().getFullYear() + 1));
      }
      
      setInventoryData({
        expiryDate,
        lotNumber: task.lotNumber || `SN/${task.moNumber || ''}`,
        finalQuantity: '',
        warehouseId: task.warehouseId || (warehouses.length > 0 ? warehouses[0].id : '')
      });
      
      setAddToInventory(true);
      setError(null);
      setInventoryError(null);
    }
  }, [open, task, warehouses]);

  // Synchronizacja ilości wyprodukowanej z ilością końcową
  useEffect(() => {
    if (addToInventory && formData.quantity) {
      setInventoryData(prev => ({
        ...prev,
        finalQuantity: formData.quantity
      }));
    }
  }, [formData.quantity, addToInventory]);

  const handleFormChange = useCallback((field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    setError(null);
  }, []);

  const handleInventoryChange = useCallback((field, value) => {
    setInventoryData(prev => ({
      ...prev,
      [field]: value
    }));
    setInventoryError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    // Walidacja podstawowa
    if (!formData.quantity || parseFloat(formData.quantity) <= 0) {
      setError('Podaj prawidłową wyprodukowaną ilość');
      return;
    }

    if (!formData.startTime || !formData.endTime) {
      setError('Podaj przedział czasowy produkcji');
      return;
    }

    if (formData.endTime < formData.startTime) {
      setError('Czas zakończenia nie może być wcześniejszy niż czas rozpoczęcia');
      return;
    }

    // Walidacja magazynu jeśli włączona
    if (addToInventory) {
      if (!inventoryData.expiryDate) {
        setInventoryError('Podaj datę ważności produktu');
        return;
      }
      if (!inventoryData.lotNumber?.trim()) {
        setInventoryError('Podaj numer partii (LOT)');
        return;
      }
      if (!inventoryData.warehouseId) {
        setInventoryError('Wybierz magazyn docelowy');
        return;
      }
      const inventoryQuantity = parseFloat(inventoryData.finalQuantity);
      if (isNaN(inventoryQuantity) || inventoryQuantity <= 0) {
        setInventoryError('Nieprawidłowa ilość końcowa');
        return;
      }
    }

    setError(null);
    setInventoryError(null);

    const result = await onSubmit({
      ...formData,
      quantity: parseFloat(formData.quantity),
      addToInventory,
      inventoryData: addToInventory ? inventoryData : null
    });

    if (result?.success) {
      onClose();
    } else if (result?.error) {
      setError(result.error.message || 'Wystąpił błąd');
    }
  }, [formData, addToInventory, inventoryData, onSubmit, onClose]);

  const handleClose = useCallback(() => {
    setError(null);
    setInventoryError(null);
    onClose();
  }, [onClose]);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>Dodaj wpis historii produkcji</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            {/* Ilość wyprodukowana */}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Wyprodukowana ilość"
                type="number"
                value={formData.quantity}
                onChange={(e) => handleFormChange('quantity', e.target.value)}
                InputProps={{
                  endAdornment: <Typography variant="body2" color="textSecondary">{task?.unit || 'szt.'}</Typography>
                }}
                inputProps={{ min: 0, step: 0.001 }}
                required
              />
            </Grid>

            {/* Czas rozpoczęcia */}
            <Grid item xs={12} sm={6}>
              <DateTimePicker
                label="Czas rozpoczęcia"
                value={formData.startTime}
                onChange={(value) => handleFormChange('startTime', value)}
                format="dd-MM-yyyy HH:mm"
                slotProps={{
                  textField: {
                    fullWidth: true,
                    required: true
                  }
                }}
              />
            </Grid>

            {/* Czas zakończenia */}
            <Grid item xs={12} sm={6}>
              <DateTimePicker
                label="Czas zakończenia"
                value={formData.endTime}
                onChange={(value) => handleFormChange('endTime', value)}
                format="dd-MM-yyyy HH:mm"
                slotProps={{
                  textField: {
                    fullWidth: true,
                    required: true
                  }
                }}
              />
            </Grid>

            {/* Notatka */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Notatka (opcjonalnie)"
                multiline
                rows={2}
                value={formData.note}
                onChange={(e) => handleFormChange('note', e.target.value)}
              />
            </Grid>
          </Grid>

          {/* Sekcja dodawania do magazynu */}
          <Box sx={{ mt: 3 }}>
            <Divider sx={{ mb: 2 }} />
            <FormControlLabel
              control={
                <Switch
                  checked={addToInventory}
                  onChange={(e) => setAddToInventory(e.target.checked)}
                />
              }
              label="Dodaj produkt do magazynu po zapisaniu"
            />

            {addToInventory && (
              <Box sx={{ mt: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
                {inventoryError && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    {inventoryError}
                  </Alert>
                )}

                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <DateTimePicker
                      label="Data ważności produktu *"
                      value={inventoryData.expiryDate}
                      onChange={(value) => handleInventoryChange('expiryDate', value)}
                      views={['year', 'month', 'day']}
                      format="dd-MM-yyyy"
                      slotProps={{
                        textField: {
                          fullWidth: true,
                          required: true,
                          error: !inventoryData.expiryDate && !!inventoryError
                        }
                      }}
                    />
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Numer partii (LOT) *"
                      value={inventoryData.lotNumber}
                      onChange={(e) => handleInventoryChange('lotNumber', e.target.value)}
                      required
                      error={!inventoryData.lotNumber?.trim() && !!inventoryError}
                    />
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Ilość końcowa *"
                      type="number"
                      value={inventoryData.finalQuantity}
                      onChange={(e) => handleInventoryChange('finalQuantity', e.target.value)}
                      InputProps={{
                        endAdornment: <Typography variant="body2" color="textSecondary">{task?.unit || 'szt.'}</Typography>
                      }}
                      inputProps={{ min: 0, step: 0.001 }}
                      required
                    />
                  </Grid>

                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth required error={!inventoryData.warehouseId && !!inventoryError}>
                      <InputLabel>Magazyn docelowy *</InputLabel>
                      <Select
                        value={inventoryData.warehouseId}
                        onChange={(e) => handleInventoryChange('warehouseId', e.target.value)}
                        label="Magazyn docelowy *"
                      >
                        {warehouses.map((warehouse) => (
                          <MenuItem key={warehouse.id} value={warehouse.id}>
                            {warehouse.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>
              </Box>
            )}
          </Box>
        </LocalizationProvider>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Anuluj
        </Button>
        <Button 
          onClick={handleSubmit} 
          variant="contained"
          disabled={loading}
          startIcon={loading ? <CircularProgress size={20} /> : null}
        >
          {loading ? 'Zapisywanie...' : 'Dodaj wpis'}
        </Button>
      </DialogActions>
    </Dialog>
  );
});

AddHistoryDialog.displayName = 'AddHistoryDialog';

export default AddHistoryDialog;

