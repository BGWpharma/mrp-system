import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Grid,
  Paper,
  CircularProgress,
  Divider,
  IconButton,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import { 
  Business as BusinessIcon,
  Add as AddIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { getCompanyInfo, saveCompanyInfo, DEFAULT_COMPANY } from '../../services/companyService';
import { useAuth } from '../../hooks/useAuth';

const CompanyInfoForm = forwardRef((props, ref) => {
  const [companyData, setCompanyData] = useState({ ...DEFAULT_COMPANY });
  const [loading, setLoading] = useState(true);
  
  const { currentUser } = useAuth();

  useImperativeHandle(ref, () => ({
    saveData: handleSubmit,
    isValid: () => {
      return companyData.name && companyData.address && companyData.city;
    },
    getData: () => companyData
  }));
  
  useEffect(() => {
    fetchCompanyData();
  }, []);
  
  const fetchCompanyData = async () => {
    setLoading(true);
    try {
      const data = await getCompanyInfo();
      
      // Migracja starych danych bankowych do nowego formatu
      if (data && (data.bankName || data.bankAccount) && !data.bankAccounts) {
        data.bankAccounts = [];
        if (data.bankName || data.bankAccount) {
          data.bankAccounts.push({
            id: Date.now().toString(),
            bankName: data.bankName || '',
            accountNumber: data.bankAccount || '',
            isDefault: true
          });
        }
        // Usuń stare pola
        delete data.bankName;
        delete data.bankAccount;
      }
      
      // Upewnij się, że bankAccounts istnieje
      if (!data.bankAccounts) {
        data.bankAccounts = [];
      }
      
      // Dodaj pole swift do istniejących rachunków jeśli go nie ma
      if (data.bankAccounts && Array.isArray(data.bankAccounts)) {
        data.bankAccounts = data.bankAccounts.map(account => {
          if (!account.hasOwnProperty('swift')) {
            return { ...account, swift: '' };
          }
          return account;
        });
      }
      
      setCompanyData(data);
    } catch (error) {
      console.error('Błąd podczas pobierania danych firmy:', error);
      // Błąd będzie obsłużony przez komponent nadrzędny
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

  const handleAddBankAccount = () => {
    setCompanyData(prev => ({
      ...prev,
      bankAccounts: [
        ...(prev.bankAccounts || []),
        {
          id: Date.now().toString(),
          bankName: '',
          accountNumber: '',
          swift: '',
          isDefault: prev.bankAccounts?.length === 0 // Pierwszy rachunek jest domyślny
        }
      ]
    }));
  };

  const handleRemoveBankAccount = (id) => {
    setCompanyData(prev => {
      const updatedAccounts = prev.bankAccounts?.filter(account => account.id !== id) || [];
      // Jeśli usuwamy domyślny rachunek i są inne, ustaw pierwszy jako domyślny
      if (updatedAccounts.length > 0 && !updatedAccounts.some(acc => acc.isDefault)) {
        updatedAccounts[0].isDefault = true;
      }
      return {
        ...prev,
        bankAccounts: updatedAccounts
      };
    });
  };

  const handleBankAccountChange = (id, field, value) => {
    setCompanyData(prev => ({
      ...prev,
      bankAccounts: prev.bankAccounts?.map(account => 
        account.id === id 
          ? { ...account, [field]: value }
          : account
      ) || []
    }));
  };

  const handleSetDefaultAccount = (id) => {
    setCompanyData(prev => ({
      ...prev,
      bankAccounts: prev.bankAccounts?.map(account => 
        account.id === id 
          ? { ...account, isDefault: true }
          : { ...account, isDefault: false }
      ) || []
    }));
  };
  
  const handleSubmit = async () => {
    try {
      await saveCompanyInfo(companyData, currentUser.uid);
      return { success: true };
    } catch (error) {
      console.error('Błąd podczas zapisywania danych firmy:', error);
      return { success: false, error: 'Nie udało się zapisać danych firmy. Spróbuj ponownie.' };
    }
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
        
        <div>
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
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="VAT-UE"
                name="vatEu"
                value={companyData.vatEu || ''}
                onChange={handleChange}
                placeholder="PL1234567890"
                helperText="Numer VAT-UE (dla transakcji wewnątrzwspólnotowych)"
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
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="subtitle1">
                  Rachunki bankowe
                </Typography>
                <Button
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={handleAddBankAccount}
                  size="small"
                >
                  Dodaj rachunek
                </Button>
              </Box>
            </Grid>
            
            {companyData.bankAccounts?.map((account, index) => (
              <Grid item xs={12} key={account.id}>
                <Card variant="outlined" sx={{ p: 2 }}>
                  <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} sm={4}>
                      <TextField
                        fullWidth
                        label="Nazwa banku"
                        value={account.bankName || ''}
                        onChange={(e) => handleBankAccountChange(account.id, 'bankName', e.target.value)}
                        size="small"
                      />
                    </Grid>
                    <Grid item xs={12} sm={3}>
                      <TextField
                        fullWidth
                        label="Numer konta"
                        value={account.accountNumber || ''}
                        onChange={(e) => handleBankAccountChange(account.id, 'accountNumber', e.target.value)}
                        size="small"
                      />
                    </Grid>
                    <Grid item xs={12} sm={2}>
                      <TextField
                        fullWidth
                        label="SWIFT"
                        value={account.swift || ''}
                        onChange={(e) => handleBankAccountChange(account.id, 'swift', e.target.value)}
                        size="small"
                        placeholder="ABCDPLPW"
                      />
                    </Grid>
                    <Grid item xs={12} sm={2}>
                      <FormControl fullWidth size="small">
                        <InputLabel>Status</InputLabel>
                        <Select
                          value={account.isDefault ? 'default' : 'regular'}
                          onChange={(e) => {
                            if (e.target.value === 'default') {
                              handleSetDefaultAccount(account.id);
                            }
                          }}
                          label="Status"
                        >
                          <MenuItem value="regular">Zwykły</MenuItem>
                          <MenuItem value="default">Domyślny</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={1}>
                      <IconButton
                        color="error"
                        onClick={() => handleRemoveBankAccount(account.id)}
                        disabled={companyData.bankAccounts?.length <= 1}
                        size="small"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Grid>
                  </Grid>
                </Card>
              </Grid>
            ))}
            
            {(!companyData.bankAccounts || companyData.bankAccounts.length === 0) && (
              <Grid item xs={12}>
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 2 }}>
                  Brak rachunków bankowych. Kliknij "Dodaj rachunek" aby dodać pierwszy rachunek.
                </Typography>
              </Grid>
            )}
            
          </Grid>
        </div>
      </Paper>
    </Box>
  );
});

export default CompanyInfoForm; 