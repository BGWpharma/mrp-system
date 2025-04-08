import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  TextField,
  Grid,
  CircularProgress
} from '@mui/material';
import { 
  createCustomer, 
  updateCustomer, 
  DEFAULT_CUSTOMER 
} from '../../services/customerService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';

const CustomerForm = ({ customer, onSubmitSuccess, onCancel }) => {
  const [formData, setFormData] = useState({ ...DEFAULT_CUSTOMER });
  const [loading, setLoading] = useState(false);
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
      newErrors.name = 'Nazwa klienta jest wymagana';
    }
    
    if (formData.email && !/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Niepoprawny format adresu email';
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
        showSuccess('Klient został zaktualizowany');
      } else {
        // Dodawanie nowego klienta
        await createCustomer(formData, currentUser.uid);
        showSuccess('Klient został dodany');
      }
      
      if (onSubmitSuccess) {
        onSubmitSuccess();
      }
    } catch (error) {
      showError('Błąd podczas zapisywania klienta: ' + error.message);
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
            label="Nazwa klienta"
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
            label="Email"
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
            label="Telefon"
            value={formData.phone || ''}
            onChange={handleChange}
            fullWidth
          />
        </Grid>
        
        <Grid item xs={12} md={6}>
          <TextField
            name="vatEu"
            label="VAT-EU"
            value={formData.vatEu || ''}
            onChange={handleChange}
            fullWidth
          />
        </Grid>
        
        <Grid item xs={12} md={6}>
          <TextField
            name="orderAffix"
            label="Afiks zamówień klienta"
            value={formData.orderAffix || ''}
            onChange={handleChange}
            fullWidth
            helperText="Dodatkowy identyfikator do numerów zamówień, np. GW, BW"
          />
        </Grid>
        
        <Grid item xs={12} md={6}>
          <TextField
            name="supplierVatEu"
            label="VAT-EU dostawcy"
            value={formData.supplierVatEu || ''}
            onChange={handleChange}
            fullWidth
          />
        </Grid>
        
        <Grid item xs={12} md={6}>
          <TextField
            name="billingAddress"
            label="Adres do faktury"
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
            label="Adres do wysyłki"
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
            label="Notatki"
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
            Anuluj
          </Button>
          <Button 
            type="submit" 
            variant="contained" 
            color="primary"
            disabled={loading}
            startIcon={loading ? <CircularProgress size={20} /> : null}
          >
            {loading ? 'Zapisywanie...' : customer ? 'Aktualizuj' : 'Dodaj'}
          </Button>
        </Grid>
      </Grid>
    </Box>
  );
};

export default CustomerForm; 