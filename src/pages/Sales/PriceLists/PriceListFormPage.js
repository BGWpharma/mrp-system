import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Container, 
  Typography, 
  Paper, 
  Box, 
  TextField, 
  Button, 
  Grid, 
  FormControlLabel, 
  Switch,
  Divider,
  MenuItem,
  Autocomplete
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import pl from 'date-fns/locale/pl';

import { 
  getPriceListById, 
  createPriceList, 
  updatePriceList, 
  DEFAULT_PRICE_LIST 
} from '../../../services/priceListService';
import { getAllCustomers } from '../../../services/customerService';
import { CURRENCY_OPTIONS } from '../../../config';
import { useAuth } from '../../../contexts/AuthContext';
import { useNotification } from '../../../hooks/useNotification';
import { useTranslation } from '../../../hooks/useTranslation';
import Loader from '../../../components/common/Loader';
import GoBackButton from '../../../components/common/GoBackButton';
import PriceListItemsTable from '../../../components/sales/priceLists/PriceListItemsTable';

const PriceListFormPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditMode = Boolean(id);
  
  const [formData, setFormData] = useState({ ...DEFAULT_PRICE_LIST });
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEditMode);
  
  const { currentUser } = useAuth();
  const { showNotification } = useNotification();
  const { t } = useTranslation();
  
  useEffect(() => {
    async function loadData() {
      try {
        // Najpierw załaduj klientów
        const customersData = await getAllCustomers();
        setCustomers(customersData);
        
        // Następnie, jeśli jesteśmy w trybie edycji, pobierz listę cenową
        if (isEditMode) {
          setInitialLoading(true);
          const priceList = await getPriceListById(id);
          
          // Konwertuj daty z Timestamp na Date
          const formattedPriceList = {
            ...priceList,
            validFrom: priceList.validFrom ? priceList.validFrom.toDate() : null,
            validTo: priceList.validTo ? priceList.validTo.toDate() : null
          };
          
          setFormData(formattedPriceList);
          
          // Znajdź wybranego klienta z już załadowanej listy klientów
          if (priceList.customerId) {
            const customer = customersData.find(c => c.id === priceList.customerId);
            setSelectedCustomer(customer || null);
          }
        }
      } catch (error) {
        console.error('Błąd podczas ładowania danych:', error);
        showNotification(t('priceLists.messages.errors.loadDataFailed'), 'error');
        if (isEditMode) {
          navigate('/sales/price-lists');
        }
      } finally {
        setInitialLoading(false);
      }
    }
    
    loadData();
  }, [id, isEditMode, navigate, showNotification]);
  
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };
  
  const handleCustomerChange = (_, customer) => {
    setSelectedCustomer(customer);
    setFormData(prev => ({
      ...prev,
      customerId: customer?.id || '',
      customerName: customer?.name || ''
    }));
  };
  
  const handleDateChange = (name, date) => {
    setFormData(prev => ({
      ...prev,
      [name]: date
    }));
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.customerId) {
      showNotification(t('priceLists.form.selectCustomer'), 'error');
      return;
    }
    
    try {
      setLoading(true);
      
      if (isEditMode) {
        await updatePriceList(id, formData, currentUser.uid);
        showNotification(t('priceLists.messages.success.updated'), 'success');
      } else {
        const newId = await createPriceList(formData, currentUser.uid);
        showNotification(t('priceLists.messages.success.created'), 'success');
        navigate(`/sales/price-lists/${newId}`);
        return; // Zapobiegamy przejściu do strony listy cenowych
      }
      
      navigate('/sales/price-lists');
    } catch (error) {
      console.error('Błąd podczas zapisywania listy cenowej:', error);
      showNotification(error.message || t('priceLists.messages.errors.saveFailed'), 'error');
    } finally {
      setLoading(false);
    }
  };
  
  if (initialLoading) {
    return <Loader />;
  }
  
  return (
    <Container maxWidth="lg">
      <Box sx={{ mt: 3, mb: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <GoBackButton />
          <Typography variant="h4" component="h1">
            {isEditMode ? t('priceLists.form.editTitle') : t('priceLists.form.newTitle')}
          </Typography>
        </Box>
        
        <Paper elevation={3} sx={{ p: 3 }}>
          <form onSubmit={handleSubmit}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label={t('priceLists.form.name')}
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                />
              </Grid>
              
              <Grid item xs={12} md={6}>
                <Autocomplete
                  options={customers}
                  getOptionLabel={(option) => option.name}
                  value={selectedCustomer}
                  onChange={handleCustomerChange}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={t('priceLists.form.customer')}
                      required
                    />
                  )}
                />
              </Grid>
              
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label={t('priceLists.form.currency')}
                  name="currency"
                  select
                  value={formData.currency}
                  onChange={handleInputChange}
                >
                  {CURRENCY_OPTIONS.map((option) => (
                    <MenuItem key={option} value={option}>
                      {option}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              
              <Grid item xs={12} md={6}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={formData.isActive}
                      onChange={handleInputChange}
                      name="isActive"
                      color="primary"
                    />
                  }
                  label={t('priceLists.form.active')}
                />
              </Grid>
              
              <Grid item xs={12} md={6}>
                <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                  <DatePicker
                    label={t('priceLists.form.validFrom')}
                    value={formData.validFrom}
                    onChange={(date) => handleDateChange('validFrom', date)}
                    renderInput={(params) => <TextField {...params} fullWidth />}
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        variant: 'outlined'
                      }
                    }}
                  />
                </LocalizationProvider>
              </Grid>
              
              <Grid item xs={12} md={6}>
                <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                  <DatePicker
                    label={t('priceLists.form.validTo')}
                    value={formData.validTo}
                    onChange={(date) => handleDateChange('validTo', date)}
                    renderInput={(params) => <TextField {...params} fullWidth />}
                    slotProps={{
                      textField: {
                        fullWidth: true,
                        variant: 'outlined'
                      }
                    }}
                  />
                </LocalizationProvider>
              </Grid>
              
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label={t('priceLists.form.description')}
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  multiline
                  rows={4}
                />
              </Grid>
              
              <Grid item xs={12}>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                  <Button
                    variant="outlined"
                    color="secondary"
                    onClick={() => navigate('/sales/price-lists')}
                    sx={{ mr: 2 }}
                  >
                    {t('priceLists.form.cancel')}
                  </Button>
                  <Button
                    type="submit"
                    variant="contained"
                    color="primary"
                    disabled={loading}
                  >
                    {isEditMode ? t('priceLists.form.saveChanges') : t('priceLists.form.create')}
                  </Button>
                </Box>
              </Grid>
            </Grid>
          </form>
        </Paper>
        
        {isEditMode && (
          <Box sx={{ mt: 4 }}>
            <Typography variant="h5" gutterBottom>
              {t('priceLists.details.items')}
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <PriceListItemsTable priceListId={id} />
          </Box>
        )}
      </Box>
    </Container>
  );
};

export default PriceListFormPage; 