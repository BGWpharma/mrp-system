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
  InputAdornment,
  FormControl,
  FormControlLabel,
  Checkbox,
  InputLabel,
  FormHelperText
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { ArrowBack as ArrowBackIcon, Save as SaveIcon } from '@mui/icons-material';
import { getInventoryItemById, getItemBatches, updateBatch, getInventoryBatch } from '../../services/inventoryService';
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
    noExpiryDate: false,
    notes: '',
    unitPrice: '',
    quantity: '',
    itemId: ''
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Określ ID partii - może być w parametrze batchId lub id (jeśli wchodzimy bezpośrednio ze ścieżki /inventory/batch/:batchId)
        const actualBatchId = batchId || id;
        
        if (!actualBatchId) {
          showError('Brak ID partii');
          navigate('/inventory');
          return;
        }
        
        // Jeśli mamy zarówno id produktu jak i batchId, używamy zwykłej ścieżki
        if (id && batchId) {
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
          
          // Sprawdź, czy partia ma datę ważności
          const hasExpiryDate = batch.expiryDate !== null && batch.expiryDate !== undefined;
          
          // Ustaw dane partii w formularzu
          setBatchData({
            batchNumber: batch.batchNumber || '',
            lotNumber: batch.lotNumber || '',
            expiryDate: hasExpiryDate ? (batch.expiryDate.toDate ? batch.expiryDate.toDate() : new Date(batch.expiryDate)) : null,
            noExpiryDate: !hasExpiryDate,
            notes: batch.notes || '',
            unitPrice: batch.unitPrice || '',
            quantity: batch.quantity || 0,
            itemId: batch.itemId || id
          });
        } else {
          // Jeśli mamy tylko ID partii (ze ścieżki /inventory/batch/:batchId)
          // Pobierz dane partii bezpośrednio
          const batch = await getInventoryBatch(actualBatchId);
          
          if (!batch) {
            showError('Nie znaleziono partii o podanym ID');
            navigate('/inventory');
            return;
          }
          
          // Sprawdź, czy partia ma datę ważności
          const hasExpiryDate = batch.expiryDate !== null && batch.expiryDate !== undefined;
          
          // Ustaw dane partii w formularzu
          setBatchData({
            batchNumber: batch.batchNumber || '',
            lotNumber: batch.lotNumber || '',
            expiryDate: hasExpiryDate ? (batch.expiryDate.toDate ? batch.expiryDate.toDate() : new Date(batch.expiryDate)) : null,
            noExpiryDate: !hasExpiryDate,
            notes: batch.notes || '',
            unitPrice: batch.unitPrice || '',
            quantity: batch.quantity || 0,
            itemId: batch.itemId
          });
          
          // Jeśli mamy itemId w partii, pobierz dane produktu
          if (batch.itemId) {
            const itemData = await getInventoryItemById(batch.itemId);
            setItem(itemData);
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
  }, [id, batchId, navigate, showError]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setBatchData(prev => ({ ...prev, [name]: value }));
  };

  const handleDateChange = (date) => {
    setBatchData(prev => ({ ...prev, expiryDate: date }));
  };

  const handleNoExpiryDateChange = (e) => {
    const { checked } = e.target;
    setBatchData(prev => ({ 
      ...prev, 
      noExpiryDate: checked,
      expiryDate: checked ? null : prev.expiryDate 
    }));
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
        expiryDate: batchData.noExpiryDate ? null : batchData.expiryDate,
        notes: batchData.notes,
        unitPrice: batchData.unitPrice ? parseFloat(batchData.unitPrice) : 0,
        quantity: batchData.quantity ? parseFloat(batchData.quantity) : 0
      };
      
      // Określ ID partii - może być w parametrze batchId lub id
      const actualBatchId = batchId || id;
      
      // Aktualizuj partię
      await updateBatch(actualBatchId, updateData, currentUser.uid);
      
      showSuccess('Partia została zaktualizowana');
      
      // Nawiguj z powrotem - albo do listy partii produktu, albo do inwentarza głównego
      if (id && batchId) {
        navigate(`/inventory/${id}/batches`);
      } else if (batchData.itemId) {
        navigate(`/inventory/${batchData.itemId}/batches`);
      } else {
        navigate('/inventory');
      }
    } catch (error) {
      showError('Błąd podczas aktualizacji partii: ' + error.message);
      console.error('Error updating batch:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    // Wróć do odpowiedniej strony w zależności od tego, z której ścieżki przyszliśmy
    if (id && batchId) {
      navigate(`/inventory/${id}/batches`);
    } else if (batchData.itemId) {
      // Przekieruj do listy partii produktu zamiast do edycji
      navigate(`/inventory/${batchData.itemId}/batches`);
    } else {
      navigate('/inventory');
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
            onClick={handleBack}
          >
            Powrót
          </Button>
          <Typography variant="h5">
            Edycja partii: {item?.name || 'Partia nr ' + (batchData.lotNumber || batchData.batchNumber)}
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
              <FormControl fullWidth margin="normal">
                <InputLabel shrink id="expiry-date-label">Data ważności</InputLabel>
                <Box sx={{ 
                  mt: 2,
                  display: 'flex', 
                  flexDirection: 'column'
                }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={batchData.noExpiryDate}
                        onChange={handleNoExpiryDateChange}
                        name="noExpiryDate"
                        color="primary"
                      />
                    }
                    label={
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          fontWeight: batchData.noExpiryDate ? 'bold' : 'normal',
                          color: batchData.noExpiryDate ? 'text.primary' : 'text.secondary'  
                        }}
                      >
                        Brak terminu ważności
                      </Typography>
                    }
                    sx={{ 
                      mb: 1, 
                      p: 1, 
                      border: batchData.noExpiryDate ? '1px solid rgba(0, 0, 0, 0.23)' : 'none',
                      borderRadius: 1,
                      bgcolor: batchData.noExpiryDate ? 'rgba(0, 0, 0, 0.04)' : 'transparent'
                    }}
                  />
                  {!batchData.noExpiryDate && (
                    <DatePicker
                      label="Wybierz datę"
                      value={batchData.expiryDate}
                      onChange={handleDateChange}
                      slotProps={{
                        textField: {
                          fullWidth: true,
                          margin: 'normal'
                        }
                      }}
                    />
                  )}
                </Box>
                {batchData.noExpiryDate && (
                  <FormHelperText>
                    Produkt nie będzie śledzony pod kątem terminu przydatności. 
                    Zalecane tylko dla przedmiotów bez określonego terminu ważności.
                  </FormHelperText>
                )}
              </FormControl>
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
                  inputProps: { min: 0, step: 0.0001 }
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
        
        {item && (
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>Informacje o produkcie</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Nazwa produktu"
                  value={item.name || ''}
                  margin="normal"
                  InputProps={{
                    readOnly: true,
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Kategoria"
                  value={item.category || ''}
                  margin="normal"
                  InputProps={{
                    readOnly: true,
                  }}
                />
              </Grid>
              {item.sku && (
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="SKU"
                    value={item.sku || ''}
                    margin="normal"
                    InputProps={{
                      readOnly: true,
                    }}
                  />
                </Grid>
              )}
            </Grid>
          </Paper>
        )}
      </Box>
    </LocalizationProvider>
  );
};

export default BatchEditForm; 