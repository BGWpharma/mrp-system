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
import { ArrowBack as ArrowBackIcon, Save as SaveIcon, Inventory as InventoryIcon, Checklist as ChecklistIcon } from '@mui/icons-material';
import { createStocktaking, getStocktakingById, updateStocktaking, getAllWarehouses } from '../../services/inventory';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import { useTheme } from '@mui/material/styles';
import { 
  getFormHeaderStyles, 
  getFormSectionStyles, 
  getFormContainerStyles, 
  getFormPaperStyles, 
  getFormButtonStyles,
  getFormActionsStyles 
} from '../../styles/formStyles';

const StocktakingFormPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const { t } = useTranslation('stocktaking');
  const theme = useTheme();
  const isEditMode = id && id !== 'new';
  
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
      <Container maxWidth="md" sx={getFormContainerStyles()}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={getFormContainerStyles()}>
      <Paper sx={getFormPaperStyles(theme)}>
        {/* Nagłówek formularza */}
        <Box sx={getFormHeaderStyles(theme, isEditMode)}>
          <Typography variant="h5" gutterBottom align="center" fontWeight="bold" sx={{
            fontSize: { xs: '1.25rem', sm: '1.5rem' },
            color: isEditMode ? 'warning.main' : 'primary.main',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1
          }}>
            <ChecklistIcon sx={{ fontSize: { xs: '1.5rem', sm: '2rem' } }} />
            {isEditMode ? t('stocktaking.editStocktaking') : t('stocktaking.newStocktaking')}
          </Typography>
          <Typography variant="body2" align="center" color="text.secondary" sx={{
            fontSize: { xs: '0.75rem', sm: '0.875rem' }
          }}>
            {isEditMode ? 'Edytuj dane inwentaryzacji' : 'Utwórz nową inwentaryzację magazynową'}
          </Typography>
        </Box>

        {/* Przycisk powrotu */}
        <Box sx={{ mb: 2 }}>
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={handleCancel}
            variant="outlined"
            sx={getFormButtonStyles('outlined')}
          >
            {t('stocktaking.back')}
          </Button>
        </Box>
        
        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
        
        <form onSubmit={handleSubmit}>
          {/* SEKCJA 1 - PODSTAWOWE INFORMACJE */}
          <Box sx={getFormSectionStyles(theme, 'primary')}>
            <Typography variant="subtitle2" sx={{ mb: 1, color: 'primary.main', fontWeight: 'bold' }}>
              Sekcja 1 {id && id !== 'new' ? 'z 2' : ''}
            </Typography>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main', display: 'flex', alignItems: 'center', gap: 1 }}>
              <InventoryIcon className="section-icon" />
              Podstawowe informacje
            </Typography>
            <Divider sx={{ mb: 3 }} />
            
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
            </Grid>
          </Box>
          
          {id && id !== 'new' && (
            <Box sx={getFormSectionStyles(theme, 'warning')}>
              <Typography variant="subtitle2" sx={{ mb: 1, color: 'warning.main', fontWeight: 'bold' }}>
                Sekcja 2 z 2
              </Typography>
              <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', color: 'warning.main', display: 'flex', alignItems: 'center', gap: 1 }}>
                <ChecklistIcon className="section-icon" />
                Status inwentaryzacji
              </Typography>
              <Divider sx={{ mb: 3 }} />
              
              <Grid container spacing={3}>
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
              </Grid>
            </Box>
          )}
          
          {/* PRZYCISKI AKCJI */}
          <Box sx={getFormActionsStyles()}>
            <Button
              variant="outlined"
              onClick={handleCancel}
              sx={getFormButtonStyles('outlined')}
              disabled={saving}
            >
              {t('stocktaking.cancel')}
            </Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              startIcon={<SaveIcon />}
              disabled={saving}
              sx={{
                ...getFormButtonStyles('contained'),
                flexGrow: 1
              }}
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