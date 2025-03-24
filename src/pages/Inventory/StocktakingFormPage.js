import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Paper,
  Button,
  Grid,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
  Divider
} from '@mui/material';
import { ArrowBack as ArrowBackIcon, Save as SaveIcon } from '@mui/icons-material';
import { createStocktaking, getStocktakingById, updateStocktaking, getAllWarehouses } from '../../services/inventoryService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';

const StocktakingFormPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  
  const [stocktaking, setStocktaking] = useState({
    name: '',
    description: '',
    location: '',
    scheduledDate: new Date().toISOString().split('T')[0],
    notes: '',
    status: 'Otwarta'
  });
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [warehouses, setWarehouses] = useState([]);

  useEffect(() => {
    fetchWarehouses();
    
    if (id && id !== 'new') {
      fetchStocktaking();
    } else {
      setLoading(false);
    }
  }, [id]);

  const fetchWarehouses = async () => {
    try {
      const warehousesData = await getAllWarehouses();
      setWarehouses(warehousesData);
    } catch (error) {
      console.error('Błąd podczas pobierania magazynów:', error);
      showError('Nie udało się pobrać listy magazynów');
    }
  };

  const fetchStocktaking = async () => {
    try {
      setLoading(true);
      const stocktakingData = await getStocktakingById(id);
      
      // Sprawdź, czy można edytować inwentaryzację
      if (stocktakingData.status === 'Zakończona') {
        showError('Nie można edytować zakończonej inwentaryzacji');
        navigate('/inventory/stocktaking');
        return;
      }
      
      setStocktaking(stocktakingData);
    } catch (error) {
      console.error('Błąd podczas pobierania danych inwentaryzacji:', error);
      setError('Nie udało się pobrać danych inwentaryzacji');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setStocktaking(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Walidacja
    if (!stocktaking.name) {
      showError('Nazwa inwentaryzacji jest wymagana');
      return;
    }
    
    try {
      setSaving(true);
      
      if (id && id !== 'new') {
        // Aktualizacja istniejącej inwentaryzacji
        await updateStocktaking(id, stocktaking, currentUser.uid);
        showSuccess('Inwentaryzacja została zaktualizowana');
      } else {
        // Tworzenie nowej inwentaryzacji
        const newStocktaking = await createStocktaking(stocktaking, currentUser.uid);
        showSuccess('Inwentaryzacja została utworzona');
        navigate(`/inventory/stocktaking/${newStocktaking.id}`);
        return;
      }
      
      navigate('/inventory/stocktaking');
    } catch (error) {
      console.error('Błąd podczas zapisywania inwentaryzacji:', error);
      showError(`Błąd podczas zapisywania: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    navigate('/inventory/stocktaking');
  };

  if (loading) {
    return (
      <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
      <Paper elevation={3} sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={handleCancel}
            sx={{ mr: 2 }}
          >
            Powrót
          </Button>
          <Typography variant="h5" component="h1">
            {id && id !== 'new' ? 'Edytuj inwentaryzację' : 'Nowa inwentaryzacja'}
          </Typography>
        </Box>
        
        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
        
        <form onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                required
                label="Nazwa inwentaryzacji"
                name="name"
                value={stocktaking.name}
                onChange={handleChange}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel id="location-label">Lokalizacja</InputLabel>
                <Select
                  labelId="location-label"
                  name="location"
                  value={stocktaking.location || ''}
                  onChange={handleChange}
                  label="Lokalizacja"
                >
                  <MenuItem value="">
                    <em>Wszystkie lokalizacje</em>
                  </MenuItem>
                  {warehouses.map(warehouse => (
                    <MenuItem key={warehouse.id} value={warehouse.name}>
                      {warehouse.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Data planowana"
                name="scheduledDate"
                type="date"
                value={stocktaking.scheduledDate || new Date().toISOString().split('T')[0]}
                onChange={handleChange}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Opis"
                name="description"
                value={stocktaking.description || ''}
                onChange={handleChange}
                multiline
                rows={3}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Uwagi"
                name="notes"
                value={stocktaking.notes || ''}
                onChange={handleChange}
                multiline
                rows={2}
              />
            </Grid>
            
            {id && id !== 'new' && (
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel id="status-label">Status</InputLabel>
                  <Select
                    labelId="status-label"
                    name="status"
                    value={stocktaking.status}
                    onChange={handleChange}
                    label="Status"
                  >
                    <MenuItem value="Otwarta">Otwarta</MenuItem>
                    <MenuItem value="W trakcie">W trakcie</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            )}
          </Grid>
          
          <Divider sx={{ my: 3 }} />
          
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
            <Button
              variant="outlined"
              onClick={handleCancel}
              sx={{ mr: 2 }}
            >
              Anuluj
            </Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              startIcon={<SaveIcon />}
              disabled={saving}
            >
              {saving ? <CircularProgress size={24} /> : 'Zapisz'}
            </Button>
          </Box>
        </form>
      </Paper>
    </Container>
  );
};

export default StocktakingFormPage; 