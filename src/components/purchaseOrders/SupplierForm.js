import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Container, Typography, Paper, Box, TextField, Button, Grid, Divider,
  List, ListItem, ListItemText, IconButton, Card, CardContent, CardHeader,
  Dialog, DialogTitle, DialogContent, DialogActions, FormControlLabel, Checkbox,
  InputAdornment, CircularProgress
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  LocationOn as LocationIcon,
  ArrowBack as ArrowBackIcon,
  Search as SearchIcon
} from '@mui/icons-material';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import { getSupplierById, createSupplier, updateSupplier } from '../../services/supplierService';
import { validateNipFormat, getBasicCompanyDataByNip } from '../../services/nipValidationService';
import SupplierProductCatalog from './SupplierProductCatalog';

const SupplierForm = ({ viewOnly = false, supplierId }) => {
  const { t } = useTranslation('suppliers');
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  
  const [loading, setLoading] = useState(!!supplierId);
  const [saving, setSaving] = useState(false);
  const [verifyingNip, setVerifyingNip] = useState(false);
  
  const [supplierData, setSupplierData] = useState({
    name: '',
    contactPerson: '',
    email: '',
    phone: '',
    addresses: [],
    taxId: '',
    vatEu: '',
    notes: ''
  });
  
  // Stan dla zarządzania adresami
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [editingAddressIndex, setEditingAddressIndex] = useState(-1);
  const [addressFormData, setAddressFormData] = useState({
    id: '',
    name: '',
    street: '',
    city: '',
    postalCode: '',
    country: 'Polska',
    isMain: false
  });
  
  useEffect(() => {
    let cancelled = false;
    const fetchSupplier = async () => {
      try {
        if (supplierId) {
          const data = await getSupplierById(supplierId);
          if (cancelled) return;
          setSupplierData({
            ...data,
            addresses: data.addresses || []
          });
        }
        if (!cancelled) {
          setLoading(false);
        }
      } catch (error) {
        if (cancelled) return;
        console.error('Błąd podczas pobierania danych dostawcy:', error);
        showError(t('suppliers.notifications.dataLoadFailed'));
        setLoading(false);
      }
    };
    
    fetchSupplier();
    return () => { cancelled = true; };
  }, [supplierId]);
  
  const handleChange = (e) => {
    if (viewOnly) return;
    const { name, value } = e.target;
    setSupplierData(prev => ({ ...prev, [name]: value }));
  };
  
  // Funkcja weryfikująca NIP i uzupełniająca dane
  const verifyNip = async () => {
    try {
      if (!supplierData.taxId) {
        showError(t('suppliers.form.validation.enterNipToVerify'));
        return;
      }
      
      if (!validateNipFormat(supplierData.taxId)) {
        showError(t('suppliers.form.validation.invalidNipFormat'));
        return;
      }
      
      setVerifyingNip(true);
      
      const companyData = await getBasicCompanyDataByNip(supplierData.taxId);
      
      if (!companyData) {
        showError(t('suppliers.form.validation.nipNotFound'));
        setVerifyingNip(false);
        return;
      }
      
      // Aktualizuj dane dostawcy na podstawie wyników z API
      let updatedSupplierData = { ...supplierData };
      
      // Jeśli nazwa jest pusta, uzupełnij ją danymi z API
      if (!supplierData.name.trim()) {
        updatedSupplierData.name = companyData.name;
      }
      
      // Jeśli nie ma adresu głównego, dodaj adres z danych z API
      let hasMainAddress = supplierData.addresses.some(addr => addr.isMain);
      
      if (!hasMainAddress && companyData.workingAddress) {
        // Przygotuj adres z danych API
        const addressParts = companyData.workingAddress.split(', ');
        const streetPart = addressParts[0] || '';
        const cityPart = addressParts[1] || '';
        
        const postalCodeMatch = cityPart.match(/(\d{2}-\d{3})\s+(.+)/);
        const postalCode = postalCodeMatch ? postalCodeMatch[1] : '';
        const city = postalCodeMatch ? postalCodeMatch[2] : cityPart;
        
        const newAddress = {
          id: `api_${Date.now()}`,
          name: t('suppliers.form.addresses.mainAddress'),
          street: streetPart,
          city: city,
          postalCode: postalCode,
          country: 'Polska',
          isMain: true
        };
        
        updatedSupplierData.addresses = [...updatedSupplierData.addresses, newAddress];
      }
      
      setSupplierData(updatedSupplierData);
      showSuccess(t('suppliers.notifications.nipVerified'));
      
    } catch (error) {
      console.error('Błąd podczas weryfikacji NIP:', error);
      showError(t('suppliers.form.validation.nipVerificationError') + ': ' + error.message);
    } finally {
      setVerifyingNip(false);
    }
  };
  
  // Funkcje do zarządzania adresami
  const openAddressDialog = (index = -1) => {
    if (viewOnly) return;
    if (index >= 0) {
      // Edycja istniejącego adresu
      setEditingAddressIndex(index);
      setAddressFormData({...supplierData.addresses[index]});
    } else {
      // Dodawanie nowego adresu
      setEditingAddressIndex(-1);
      setAddressFormData({
        id: `temp_${Date.now()}`,
        name: '',
        street: '',
        city: '',
        postalCode: '',
        country: 'Polska',
        isMain: supplierData.addresses.length === 0 // Pierwszy adres jest domyślnie główny
      });
    }
    setAddressDialogOpen(true);
  };
  
  const handleAddressChange = (e) => {
    const { name, value, checked } = e.target;
    setAddressFormData(prev => ({
      ...prev,
      [name]: name === 'isMain' ? checked : value
    }));
  };
  
  const handleSaveAddress = () => {
    // Walidacja danych adresu
    if (!addressFormData.name || !addressFormData.street || !addressFormData.city || !addressFormData.postalCode) {
      showError(t('suppliers.form.validation.fillAllAddressFields'));
      return;
    }
    
    let updatedAddresses = [...supplierData.addresses];
    
    if (addressFormData.isMain) {
      // Jeśli nowy adres jest główny, usuń flagę isMain z innych adresów
      updatedAddresses = updatedAddresses.map(addr => ({
        ...addr,
        isMain: false
      }));
    }
    
    if (editingAddressIndex >= 0) {
      // Aktualizacja istniejącego adresu
      updatedAddresses[editingAddressIndex] = addressFormData;
    } else {
      // Dodanie nowego adresu
      updatedAddresses.push(addressFormData);
    }
    
    // Jeśli nie ma głównego adresu, ustaw pierwszy jako główny
    if (!updatedAddresses.some(addr => addr.isMain) && updatedAddresses.length > 0) {
      updatedAddresses[0].isMain = true;
    }
    
    setSupplierData(prev => ({
      ...prev,
      addresses: updatedAddresses
    }));
    
    setAddressDialogOpen(false);
  };
  
  const handleDeleteAddress = (index) => {
    if (viewOnly) return;
    if (!window.confirm(t('suppliers.form.addresses.confirmDelete'))) {
      return;
    }
    
    const updatedAddresses = [...supplierData.addresses];
    const deletedAddress = updatedAddresses[index];
    updatedAddresses.splice(index, 1);
    
    // Jeśli usunięto główny adres, a lista nie jest pusta, ustaw pierwszy jako główny
    if (deletedAddress.isMain && updatedAddresses.length > 0) {
      updatedAddresses[0].isMain = true;
    }
    
    setSupplierData(prev => ({
      ...prev,
      addresses: updatedAddresses
    }));
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setSaving(true);
      
      // Walidacja
      if (!supplierData.name) {
        showError(t('suppliers.form.validation.nameRequired'));
        setSaving(false);
        return;
      }
      
      let result;
      
      if (supplierId) {
        // Aktualizacja istniejącego dostawcy
        result = await updateSupplier(supplierId, supplierData, currentUser.uid);
        showSuccess(t('suppliers.notifications.updated'));
      } else {
        // Utworzenie nowego dostawcy
        result = await createSupplier(supplierData, currentUser.uid);
        showSuccess(t('suppliers.notifications.created'));
      }
      
      navigate('/suppliers');
    } catch (error) {
      console.error('Błąd podczas zapisywania dostawcy:', error);
      showError(t('suppliers.notifications.saveFailed'));
      setSaving(false);
    }
  };
  
  if (loading) {
    return (
      <Container>
        <Typography variant="h6">{t('suppliers.form.loadingData')}</Typography>
      </Container>
    );
  }
  
  return (
    <Container>
      <Box sx={{ mb: 3 }}>
        {viewOnly && (
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/suppliers')}
            sx={{ mb: 2 }}
                      >
              {t('suppliers.actions.back')}
          </Button>
        )}
      </Box>
      
      <Paper sx={{ p: 3 }}>
        <form onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            {/* Nazwa dostawcy */}
            <Grid item xs={12}>
              <TextField
                name="name"
                                  label={t('suppliers.form.name')}
                value={supplierData.name}
                onChange={handleChange}
                fullWidth
                required
                disabled={viewOnly}
                InputProps={{
                  readOnly: viewOnly
                }}
              />
            </Grid>
            
            {/* Osoba kontaktowa */}
            <Grid item xs={12} md={6}>
              <TextField
                name="contactPerson"
                                  label={t('suppliers.form.contactPerson')}
                value={supplierData.contactPerson}
                onChange={handleChange}
                fullWidth
                disabled={viewOnly}
                InputProps={{
                  readOnly: viewOnly
                }}
              />
            </Grid>
            
            {/* Email */}
            <Grid item xs={12} md={6}>
              <TextField
                name="email"
                                  label={t('suppliers.form.email')}
                type="email"
                value={supplierData.email}
                onChange={handleChange}
                fullWidth
                disabled={viewOnly}
                InputProps={{
                  readOnly: viewOnly
                }}
              />
            </Grid>
            
            {/* Telefon */}
            <Grid item xs={12} md={6}>
              <TextField
                name="phone"
                                  label={t('suppliers.form.phone')}
                value={supplierData.phone}
                onChange={handleChange}
                fullWidth
                disabled={viewOnly}
                InputProps={{
                  readOnly: viewOnly
                }}
              />
            </Grid>
            
            {/* NIP */}
            <Grid item xs={12} md={6}>
              <TextField
                name="taxId"
                                  label={t('suppliers.form.taxId')}
                value={supplierData.taxId}
                onChange={handleChange}
                fullWidth
                disabled={viewOnly || verifyingNip}
                InputProps={{
                  readOnly: viewOnly,
                  endAdornment: !viewOnly && (
                    <InputAdornment position="end">
                      <IconButton
                        edge="end"
                        onClick={verifyNip}
                        disabled={verifyingNip || !supplierData.taxId}
                                                  title={t('suppliers.form.verifyNip')}
                      >
                        {verifyingNip ? <CircularProgress size={24} /> : <SearchIcon />}
                      </IconButton>
                    </InputAdornment>
                  )
                }}
                                  helperText={t('suppliers.form.nipFormat')}
              />
            </Grid>
            
            {/* VAT-EU */}
            <Grid item xs={12} md={6}>
              <TextField
                name="vatEu"
                                  label={t('suppliers.form.vatEu')}
                value={supplierData.vatEu}
                onChange={handleChange}
                fullWidth
                disabled={viewOnly}
                InputProps={{
                  readOnly: viewOnly
                }}
              />
            </Grid>
            
            {/* Notatki */}
            <Grid item xs={12}>
              <TextField
                name="notes"
                                  label={t('suppliers.form.notes')}
                value={supplierData.notes}
                onChange={handleChange}
                fullWidth
                multiline
                rows={3}
                disabled={viewOnly}
                InputProps={{
                  readOnly: viewOnly
                }}
              />
            </Grid>
            
            {/* Adresy */}
            <Grid item xs={12}>
              <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Typography variant="h6">{t('suppliers.form.addresses.title')}</Typography>
                {!viewOnly && (
                  <Button
                    startIcon={<AddIcon />}
                    onClick={() => openAddressDialog()}
                    disabled={saving}
                  >
                                          {t('suppliers.form.addresses.addAddress')}
                  </Button>
                )}
              </Box>
              
              {supplierData.addresses.length > 0 ? (
                <List>
                  {supplierData.addresses.map((address, index) => (
                    <Card key={address.id || index} sx={{ mb: 2 }}>
                      <CardHeader
                                                  title={address.name + (address.isMain ? ' (' + t('suppliers.form.addresses.mainAddress') + ')' : '')}
                        action={
                          !viewOnly && (
                            <Box>
                              <IconButton onClick={() => openAddressDialog(index)}>
                                <EditIcon />
                              </IconButton>
                              <IconButton onClick={() => handleDeleteAddress(index)}>
                                <DeleteIcon />
                              </IconButton>
                            </Box>
                          )
                        }
                      />
                      <CardContent>
                        <Typography component="div">
                          <LocationIcon sx={{ fontSize: 'small', verticalAlign: 'middle', mr: 1 }} />
                          {address.street}, {address.postalCode} {address.city}, {address.country}
                        </Typography>
                      </CardContent>
                    </Card>
                  ))}
                </List>
              ) : (
                                  <Typography variant="body2" color="textSecondary">{t('suppliers.form.addresses.noAddresses')}</Typography>
              )}
            </Grid>
            
            {/* Przyciski formularza */}
            {!viewOnly && (
              <Grid item xs={12} sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
                                  <Button
                    type="button"
                    onClick={() => navigate('/suppliers')}
                    sx={{ mr: 2 }}
                    disabled={saving}
                  >
                    {t('suppliers.actions.cancel')}
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  disabled={saving}
                  startIcon={saving && <CircularProgress size={24} color="inherit" />}
                >
                                      {saving ? t('suppliers.actions.saving') : t('suppliers.actions.save')}
                </Button>
              </Grid>
            )}
          </Grid>
        </form>
      </Paper>

      {/* Katalog produktów dostawcy - widoczny tylko w trybie podglądu */}
      {viewOnly && supplierId && (
        <SupplierProductCatalog supplierId={supplierId} />
      )}
      
      {/* Dialog dodawania/edycji adresu */}
      <Dialog open={addressDialogOpen} onClose={() => setAddressDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
                      {editingAddressIndex >= 0 ? t('suppliers.form.addresses.editAddress') : t('suppliers.form.addresses.addNewAddress')}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                name="name"
                                  label={t('suppliers.form.addresses.name')}
                value={addressFormData.name}
                onChange={handleAddressChange}
                fullWidth
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                name="street"
                                  label={t('suppliers.form.addresses.street')}
                value={addressFormData.street}
                onChange={handleAddressChange}
                fullWidth
                required
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                name="postalCode"
                                  label={t('suppliers.form.addresses.postalCode')}
                value={addressFormData.postalCode}
                onChange={handleAddressChange}
                fullWidth
                required
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                name="city"
                                  label={t('suppliers.form.addresses.city')}
                value={addressFormData.city}
                onChange={handleAddressChange}
                fullWidth
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                name="country"
                                  label={t('suppliers.form.addresses.country')}
                value={addressFormData.country}
                onChange={handleAddressChange}
                fullWidth
                required
              />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Checkbox
                    name="isMain"
                    checked={addressFormData.isMain}
                    onChange={handleAddressChange}
                  />
                }
                                  label={t('suppliers.form.addresses.isMain')}
              />
            </Grid>
          </Grid>
        </DialogContent>
                  <DialogActions>
            <Button onClick={() => setAddressDialogOpen(false)}>
              {t('suppliers.actions.cancel')}
            </Button>
            <Button onClick={handleSaveAddress} variant="contained" color="primary">
              {t('suppliers.actions.save')}
            </Button>
          </DialogActions>
      </Dialog>
    </Container>
  );
};

export default SupplierForm; 