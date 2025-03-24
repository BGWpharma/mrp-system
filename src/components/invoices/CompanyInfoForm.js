import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Grid,
  Paper,
  CircularProgress,
  Divider,
  Snackbar,
  Alert
} from '@mui/material';
import { 
  Save as SaveIcon,
  Business as BusinessIcon
} from '@mui/icons-material';
import { getCompanyInfo, saveCompanyInfo, DEFAULT_COMPANY } from '../../services/companyService';
import { useAuth } from '../../hooks/useAuth';

const CompanyInfoForm = () => {
  const [companyData, setCompanyData] = useState({ ...DEFAULT_COMPANY });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);
  
  const { currentUser } = useAuth();
  
  useEffect(() => {
    fetchCompanyData();
  }, []);
  
  const fetchCompanyData = async () => {
    setLoading(true);
    try {
      const data = await getCompanyInfo();
      setCompanyData(data);
    } catch (error) {
      console.error('Błąd podczas pobierania danych firmy:', error);
      setError('Nie udało się pobrać danych firmy. Spróbuj odświeżyć stronę.');
    } finally {
      setLoading(false);
    }
  };
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setCompanyData(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    
    try {
      await saveCompanyInfo(companyData, currentUser.uid);
      setSuccess(true);
    } catch (error) {
      console.error('Błąd podczas zapisywania danych firmy:', error);
      setError('Nie udało się zapisać danych firmy. Spróbuj ponownie.');
    } finally {
      setSaving(false);
    }
  };
  
  const handleCloseAlert = () => {
    setSuccess(false);
    setError(null);
  };
  
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }
  
  return (
    <Box>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <BusinessIcon sx={{ mr: 2 }} />
          <Typography variant="h5">Dane firmy</Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Te dane będą widoczne na wszystkich fakturach i dokumentach sprzedaży.
        </Typography>
        
        <form onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Nazwa firmy"
                name="name"
                value={companyData.name || ''}
                onChange={handleChange}
                required
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="NIP"
                name="nip"
                value={companyData.nip || ''}
                onChange={handleChange}
                required
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="REGON"
                name="regon"
                value={companyData.regon || ''}
                onChange={handleChange}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="KRS"
                name="krs"
                value={companyData.krs || ''}
                onChange={handleChange}
              />
            </Grid>
            
            <Grid item xs={12}>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle1" gutterBottom>
                Adres
              </Typography>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Ulica i numer"
                name="address"
                value={companyData.address || ''}
                onChange={handleChange}
                required
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Kod pocztowy i miasto"
                name="city"
                value={companyData.city || ''}
                onChange={handleChange}
                required
              />
            </Grid>
            
            <Grid item xs={12}>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle1" gutterBottom>
                Dane kontaktowe
              </Typography>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Email"
                name="email"
                type="email"
                value={companyData.email || ''}
                onChange={handleChange}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Telefon"
                name="phone"
                value={companyData.phone || ''}
                onChange={handleChange}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Strona internetowa"
                name="website"
                value={companyData.website || ''}
                onChange={handleChange}
              />
            </Grid>
            
            <Grid item xs={12}>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle1" gutterBottom>
                Dane bankowe
              </Typography>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Nazwa banku"
                name="bankName"
                value={companyData.bankName || ''}
                onChange={handleChange}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Numer konta bankowego"
                name="bankAccount"
                value={companyData.bankAccount || ''}
                onChange={handleChange}
              />
            </Grid>
            
            <Grid item xs={12} sx={{ mt: 2 }}>
              <Button
                type="submit"
                variant="contained"
                color="primary"
                startIcon={<SaveIcon />}
                disabled={saving}
              >
                {saving ? 'Zapisywanie...' : 'Zapisz dane firmy'}
              </Button>
            </Grid>
          </Grid>
        </form>
      </Paper>
      
      <Snackbar open={success} autoHideDuration={6000} onClose={handleCloseAlert}>
        <Alert onClose={handleCloseAlert} severity="success" sx={{ width: '100%' }}>
          Dane firmy zostały pomyślnie zapisane!
        </Alert>
      </Snackbar>
      
      <Snackbar open={!!error} autoHideDuration={6000} onClose={handleCloseAlert}>
        <Alert onClose={handleCloseAlert} severity="error" sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default CompanyInfoForm; 