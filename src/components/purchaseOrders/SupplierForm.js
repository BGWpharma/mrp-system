import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Container, Typography, Paper, Box, TextField, Button, Grid, Divider
} from '@mui/material';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { getSupplierById, createSupplier, updateSupplier } from '../../services/purchaseOrderService';

const SupplierForm = () => {
  const { supplierId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  
  const [loading, setLoading] = useState(!!supplierId);
  const [saving, setSaving] = useState(false);
  
  const [supplierData, setSupplierData] = useState({
    name: '',
    contactPerson: '',
    email: '',
    phone: '',
    address: '',
    taxId: '',
    notes: ''
  });
  
  useEffect(() => {
    const fetchSupplier = async () => {
      try {
        if (supplierId) {
          const data = await getSupplierById(supplierId);
          setSupplierData(data);
        }
        setLoading(false);
      } catch (error) {
        console.error('Błąd podczas pobierania danych dostawcy:', error);
        showError('Nie udało się pobrać danych dostawcy');
        setLoading(false);
      }
    };
    
    fetchSupplier();
  }, [supplierId]);
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setSupplierData(prev => ({ ...prev, [name]: value }));
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setSaving(true);
      
      // Walidacja
      if (!supplierData.name) {
        showError('Nazwa dostawcy jest wymagana');
        setSaving(false);
        return;
      }
      
      let result;
      
      if (supplierId) {
        // Aktualizacja istniejącego dostawcy
        result = await updateSupplier(supplierId, supplierData, currentUser.uid);
        showSuccess('Dostawca został zaktualizowany');
      } else {
        // Utworzenie nowego dostawcy
        result = await createSupplier(supplierData, currentUser.uid);
        showSuccess('Dostawca został utworzony');
      }
      
      navigate('/suppliers');
    } catch (error) {
      console.error('Błąd podczas zapisywania dostawcy:', error);
      showError('Nie udało się zapisać dostawcy');
      setSaving(false);
    }
  };
  
  if (loading) {
    return (
      <Container>
        <Typography variant="h6">Ładowanie danych dostawcy...</Typography>
      </Container>
    );
  }
  
  return (
    <Container>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5">
          {supplierId ? 'Edytuj Dostawcę' : 'Nowy Dostawca'}
        </Typography>
      </Box>
      
      <Paper sx={{ p: 3 }}>
        <form onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            {/* Nazwa dostawcy */}
            <Grid item xs={12}>
              <TextField
                name="name"
                label="Nazwa dostawcy"
                value={supplierData.name}
                onChange={handleChange}
                fullWidth
                required
              />
            </Grid>
            
            {/* Osoba kontaktowa */}
            <Grid item xs={12} md={6}>
              <TextField
                name="contactPerson"
                label="Osoba kontaktowa"
                value={supplierData.contactPerson}
                onChange={handleChange}
                fullWidth
              />
            </Grid>
            
            {/* Email */}
            <Grid item xs={12} md={6}>
              <TextField
                name="email"
                label="Email"
                type="email"
                value={supplierData.email}
                onChange={handleChange}
                fullWidth
              />
            </Grid>
            
            {/* Telefon */}
            <Grid item xs={12} md={6}>
              <TextField
                name="phone"
                label="Telefon"
                value={supplierData.phone}
                onChange={handleChange}
                fullWidth
              />
            </Grid>
            
            {/* NIP */}
            <Grid item xs={12} md={6}>
              <TextField
                name="taxId"
                label="NIP"
                value={supplierData.taxId}
                onChange={handleChange}
                fullWidth
              />
            </Grid>
            
            {/* Adres */}
            <Grid item xs={12}>
              <TextField
                name="address"
                label="Adres"
                value={supplierData.address}
                onChange={handleChange}
                fullWidth
                multiline
                rows={3}
              />
            </Grid>
            
            {/* Uwagi */}
            <Grid item xs={12}>
              <TextField
                name="notes"
                label="Uwagi"
                value={supplierData.notes}
                onChange={handleChange}
                fullWidth
                multiline
                rows={3}
              />
            </Grid>
          </Grid>
          
          <Divider sx={{ my: 3 }} />
          
          {/* Przyciski */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <Button
              variant="outlined"
              onClick={() => navigate('/suppliers')}
              disabled={saving}
            >
              Anuluj
            </Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={saving}
            >
              {saving ? 'Zapisywanie...' : 'Zapisz'}
            </Button>
          </Box>
        </form>
      </Paper>
    </Container>
  );
};

export default SupplierForm; 