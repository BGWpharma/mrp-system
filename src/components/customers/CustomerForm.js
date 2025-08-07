import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  TextField,
  Grid,
  CircularProgress,
  InputAdornment,
  IconButton
} from '@mui/material';
import { 
  Search as SearchIcon
} from '@mui/icons-material';
import { 
  createCustomer, 
  updateCustomer, 
  DEFAULT_CUSTOMER 
} from '../../services/customerService';
import { validateNipFormat, getBasicCompanyDataByNip } from '../../services/nipValidationService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';

const CustomerForm = ({ customer, onSubmitSuccess, onCancel }) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({ ...DEFAULT_CUSTOMER });
  const [loading, setLoading] = useState(false);
  const [verifyingNip, setVerifyingNip] = useState(false);
  const [errors, setErrors] = useState({});

  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();

  useEffect(() => {
    if (customer) {
      setFormData(customer);
    }
  }, [customer]);

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.name || formData.name.trim() === '') {
      newErrors.name = t('customers.form.nameRequired');
    }
    
    if (formData.email && !/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = t('customers.form.emailInvalid');
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Wyczyść błąd dla tego pola
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  // Funkcja weryfikująca NIP i uzupełniająca dane
  const verifyNip = async () => {
    try {
      if (!formData.vatEu) {
        showError(t('customers.notifications.nipVerifyError'));
        return;
      }
      
      // Usuń prefiks "PL" jeśli istnieje, do weryfikacji potrzebujemy tylko numeru
      const nip = formData.vatEu.replace(/^PL/i, '');
      
      if (!validateNipFormat(nip)) {
        showError(t('customers.notifications.nipFormatError'));
        return;
      }
      
      setVerifyingNip(true);
      
      const companyData = await getBasicCompanyDataByNip(nip);
      
      if (!companyData) {
        showError(t('customers.notifications.nipNotFound'));
        setVerifyingNip(false);
        return;
      }
      
      // Aktualizuj dane klienta na podstawie wyników z API
      let updatedData = { ...formData };
      
      // Jeśli nazwa jest pusta, uzupełnij ją danymi z API
      if (!formData.name.trim()) {
        updatedData.name = companyData.name;
      }
      
      // Jeśli adres do faktury jest pusty, uzupełnij go danymi z API
      if (!formData.billingAddress.trim() && companyData.workingAddress) {
        updatedData.billingAddress = companyData.workingAddress;
      }
      
      setFormData(updatedData);
      showSuccess(t('customers.notifications.nipVerifySuccess'));
      
    } catch (error) {
      console.error('Błąd podczas weryfikacji NIP:', error);
      showError(t('customers.notifications.nipVerifyNetworkError', { message: error.message }));
    } finally {
      setVerifyingNip(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setLoading(true);
    
    try {
      if (customer) {
        // Aktualizacja istniejącego klienta
        await updateCustomer(customer.id, formData, currentUser.uid);
        showSuccess(t('customers.notifications.customerUpdated'));
      } else {
        // Dodawanie nowego klienta
        await createCustomer(formData, currentUser.uid);
        showSuccess(t('customers.notifications.customerAdded'));
      }
      
      if (onSubmitSuccess) {
        onSubmitSuccess();
      }
    } catch (error) {
      showError(t('customers.notifications.saveError', { message: error.message }));
      console.error('Error saving customer:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <TextField
            name="name"
            label={t('customers.form.customerName')}
            value={formData.name || ''}
            onChange={handleChange}
            fullWidth
            required
            error={!!errors.name}
            helperText={errors.name}
          />
        </Grid>
        
        <Grid item xs={12} md={6}>
          <TextField
            name="email"
            label={t('customers.form.email')}
            type="email"
            value={formData.email || ''}
            onChange={handleChange}
            fullWidth
            error={!!errors.email}
            helperText={errors.email}
          />
        </Grid>
        
        <Grid item xs={12} md={6}>
          <TextField
            name="phone"
            label={t('customers.form.phone')}
            value={formData.phone || ''}
            onChange={handleChange}
            fullWidth
          />
        </Grid>
        
        <Grid item xs={12} md={6}>
          <TextField
            name="vatEu"
            label={t('customers.form.vatEu')}
            value={formData.vatEu || ''}
            onChange={handleChange}
            fullWidth
            disabled={verifyingNip}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    edge="end"
                    onClick={verifyNip}
                    disabled={verifyingNip || !formData.vatEu}
                    title={t('customers.form.verifyNip')}
                  >
                    {verifyingNip ? <CircularProgress size={24} /> : <SearchIcon />}
                  </IconButton>
                </InputAdornment>
              )
            }}
            helperText={t('customers.form.vatEuHelp')}
          />
        </Grid>
        
        <Grid item xs={12} md={6}>
          <TextField
            name="orderAffix"
            label={t('customers.form.orderAffix')}
            value={formData.orderAffix || ''}
            onChange={handleChange}
            fullWidth
            helperText={t('customers.form.orderAffixHelp')}
          />
        </Grid>
        
        <Grid item xs={12} md={6}>
          <TextField
            name="supplierVatEu"
            label={t('customers.form.supplierVatEu')}
            value={formData.supplierVatEu || ''}
            onChange={handleChange}
            fullWidth
          />
        </Grid>
        
        <Grid item xs={12} md={6}>
          <TextField
            name="billingAddress"
            label={t('customers.form.billingAddress')}
            value={formData.billingAddress || ''}
            onChange={handleChange}
            fullWidth
            multiline
            rows={3}
          />
        </Grid>
        
        <Grid item xs={12} md={6}>
          <TextField
            name="shippingAddress"
            label={t('customers.form.shippingAddress')}
            value={formData.shippingAddress || ''}
            onChange={handleChange}
            fullWidth
            multiline
            rows={3}
          />
        </Grid>
        
        <Grid item xs={12}>
          <TextField
            name="notes"
            label={t('customers.form.notes')}
            value={formData.notes || ''}
            onChange={handleChange}
            fullWidth
            multiline
            rows={3}
          />
        </Grid>
        
        <Grid item xs={12} sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mt: 2 }}>
          <Button 
            variant="outlined" 
            onClick={onCancel}
            disabled={loading}
          >
            {t('customers.form.cancel')}
          </Button>
          <Button 
            type="submit" 
            variant="contained" 
            color="primary"
            disabled={loading}
            startIcon={loading ? <CircularProgress size={20} /> : null}
          >
            {loading ? t('customers.form.saving') : customer ? t('customers.form.update') : t('customers.form.add')}
          </Button>
        </Grid>
      </Grid>
    </Box>
  );
};

export default CustomerForm; 