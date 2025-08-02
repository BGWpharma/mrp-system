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
import { createStocktaking, getStocktakingById, updateStocktaking, getAllWarehouses } from '../../services/inventory';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';

const StocktakingFormPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const { t } = useTranslation();
  
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
      showError(t('stocktaking.warehousesLoadError'));
    }
  };

  const fetchStocktaking = async () => {
    try {
      setLoading(true);
      const stocktakingData = await getStocktakingById(id);
      
      // Sprawdź, czy można edytować inwentaryzację
      if (stocktakingData.status === 'Zakończona') {
        showError(t('stocktaking.cannotEditCompleted'));
        navigate('/inventory/stocktaking');
        return;
      }
      
      setStocktaking(stocktakingData);
    } catch (error) {
      console.error('Błąd podczas pobierania danych inwentaryzacji:', error);
      setError(t('stocktaking.loadError'));
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
      showError(t('stocktaking.nameRequired'));
      return;
    }
    
    try {
      setSaving(true);
      
      if (id && id !== 'new') {
        // Aktualizacja istniejącej inwentaryzacji
        await updateStocktaking(id, stocktaking, currentUser.uid);
        showSuccess(t('stocktaking.updateSuccess'));
      } else {
        // Tworzenie nowej inwentaryzacji
        const newStocktaking = await createStocktaking(stocktaking, currentUser.uid);
        showSuccess(t('stocktaking.createSuccess'));
        navigate(`/inventory/stocktaking/${newStocktaking.id}`);
        return;
      }
      
      navigate('/inventory/stocktaking');
    } catch (error) {
      console.error('Błąd podczas zapisywania inwentaryzacji:', error);
      showError(t('stocktaking.saveError', { message: error.message }));
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
            {t('stocktaking.back')}
          </Button>
          <Typography variant="h5" component="h1">
            {id && id !== 'new' ? t('stocktaking.editStocktaking') : t('stocktaking.newStocktaking')}
          </Typography>
        </Box>
        
        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
        
        <form onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                required
                label={t('stocktaking.name')}
                name="name"
                value={stocktaking.name}
                onChange={handleChange}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel id="location-label">{t('stocktaking.location')}</InputLabel>
                <Select
                  labelId="location-label"
                  name="location"
                  value={stocktaking.location || ''}
                  onChange={handleChange}
                  label={t('stocktaking.location')}
                >
                  <MenuItem value="">
                    <em>{t('stocktaking.allLocations')}</em>
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
                label={t('stocktaking.scheduledDate')}
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
                label={t('stocktaking.description')}
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
                label={t('stocktaking.notes')}
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
                  <InputLabel id="status-label">{t('stocktaking.status')}</InputLabel>
                  <Select
                    labelId="status-label"
                    name="status"
                    value={stocktaking.status}
                    onChange={handleChange}
                    label={t('stocktaking.status')}
                  >
                                         <MenuItem value="Otwarta">{t('stocktaking.statusValues.otwarta')}</MenuItem>
                     <MenuItem value="W trakcie">{t('stocktaking.statusValues.wtrakcie')}</MenuItem>
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
              {t('stocktaking.cancel')}
            </Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              startIcon={<SaveIcon />}
              disabled={saving}
            >
              {saving ? <CircularProgress size={24} /> : t('stocktaking.save')}
            </Button>
          </Box>
        </form>
      </Paper>
    </Container>
  );
};

export default StocktakingFormPage; 