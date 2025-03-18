import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Container, Typography, Paper, Box, TextField, Button, Grid, Divider,
  List, ListItem, ListItemText, IconButton, Card, CardContent, CardHeader,
  Dialog, DialogTitle, DialogContent, DialogActions, FormControlLabel, Checkbox
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  LocationOn as LocationIcon
} from '@mui/icons-material';
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
    addresses: [],
    taxId: '',
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
    const fetchSupplier = async () => {
      try {
        if (supplierId) {
          const data = await getSupplierById(supplierId);
          // Zapewnienie zgodności z nowym modelem adresów
          setSupplierData({
            ...data,
            addresses: data.addresses || []
          });
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
  
  // Funkcje do zarządzania adresami
  const openAddressDialog = (index = -1) => {
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
      showError('Wypełnij wszystkie wymagane pola adresu');
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
    if (!window.confirm('Czy na pewno chcesz usunąć ten adres?')) {
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
            
            {/* Adresy */}
            <Grid item xs={12}>
              <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="h6">Adresy</Typography>
                <Button 
                  variant="contained" 
                  color="primary" 
                  startIcon={<AddIcon />}
                  onClick={() => openAddressDialog()}
                >
                  Dodaj adres
                </Button>
              </Box>
              
              {supplierData.addresses.length === 0 ? (
                <Typography variant="body2" color="textSecondary" sx={{ my: 2 }}>
                  Brak dodanych adresów. Kliknij "Dodaj adres", aby dodać pierwszy adres.
                </Typography>
              ) : (
                <Grid container spacing={2}>
                  {supplierData.addresses.map((address, index) => (
                    <Grid item xs={12} md={6} key={address.id}>
                      <Card variant="outlined">
                        <CardHeader 
                          title={address.name}
                          subheader={address.isMain ? 'Adres główny' : ''}
                          action={
                            <Box>
                              <IconButton onClick={() => openAddressDialog(index)} size="small">
                                <EditIcon fontSize="small" />
                              </IconButton>
                              <IconButton onClick={() => handleDeleteAddress(index)} size="small">
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Box>
                          }
                        />
                        <CardContent>
                          <Typography variant="body2">{address.street}</Typography>
                          <Typography variant="body2">{address.postalCode} {address.city}</Typography>
                          <Typography variant="body2">{address.country}</Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  ))}
                </Grid>
              )}
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
      
      {/* Dialog do dodawania/edycji adresu */}
      <Dialog 
        open={addressDialogOpen} 
        onClose={() => setAddressDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {editingAddressIndex >= 0 ? 'Edytuj adres' : 'Dodaj nowy adres'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                name="name"
                label="Nazwa adresu"
                value={addressFormData.name}
                onChange={handleAddressChange}
                fullWidth
                required
                placeholder="np. Siedziba główna, Magazyn, itp."
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                name="street"
                label="Ulica i numer"
                value={addressFormData.street}
                onChange={handleAddressChange}
                fullWidth
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                name="city"
                label="Miasto"
                value={addressFormData.city}
                onChange={handleAddressChange}
                fullWidth
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                name="postalCode"
                label="Kod pocztowy"
                value={addressFormData.postalCode}
                onChange={handleAddressChange}
                fullWidth
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                name="country"
                label="Kraj"
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
                label="Adres główny"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddressDialogOpen(false)}>Anuluj</Button>
          <Button 
            onClick={handleSaveAddress} 
            variant="contained" 
            color="primary"
          >
            Zapisz
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default SupplierForm; 