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
  LocationOn as LocationIcon,
  ArrowBack as ArrowBackIcon
} from '@mui/icons-material';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { getSupplierById, createSupplier, updateSupplier } from '../../services/supplierService';

const SupplierForm = ({ viewOnly = false, supplierId }) => {
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
    if (viewOnly) return;
    const { name, value } = e.target;
    setSupplierData(prev => ({ ...prev, [name]: value }));
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
    if (viewOnly) return;
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
        {viewOnly && (
          <Button
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/suppliers')}
            sx={{ mb: 2 }}
          >
            Powrót do listy
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
                label="Nazwa dostawcy"
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
                label="Osoba kontaktowa"
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
                label="Email"
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
                label="Telefon"
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
                label="NIP"
                value={supplierData.taxId}
                onChange={handleChange}
                fullWidth
                disabled={viewOnly}
                InputProps={{
                  readOnly: viewOnly
                }}
              />
            </Grid>
            
            {/* VAT EU */}
            <Grid item xs={12} md={6}>
              <TextField
                name="vatEu"
                label="VAT EU"
                value={supplierData.vatEu || ''}
                onChange={handleChange}
                fullWidth
                disabled={viewOnly}
                InputProps={{
                  readOnly: viewOnly
                }}
              />
            </Grid>
            
            {/* Uwagi */}
            <Grid item xs={12}>
              <TextField
                name="notes"
                label="Uwagi"
                value={supplierData.notes || ''}
                onChange={handleChange}
                fullWidth
                multiline
                rows={4}
                disabled={viewOnly}
                InputProps={{
                  readOnly: viewOnly
                }}
              />
            </Grid>
            
            {/* Adresy */}
            <Grid item xs={12}>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h6">Adresy</Typography>
                {!viewOnly && (
                  <Button
                    startIcon={<AddIcon />}
                    onClick={() => openAddressDialog()}
                    variant="outlined"
                  >
                    Dodaj adres
                  </Button>
                )}
              </Box>
              
              {supplierData.addresses.length === 0 ? (
                <Typography variant="body2" color="textSecondary">
                  Brak adresów
                </Typography>
              ) : (
                <List>
                  {supplierData.addresses.map((address, index) => (
                    <Card key={address.id || index} sx={{ mb: 1 }}>
                      <CardContent>
                        <Box display="flex" justifyContent="space-between" alignItems="center">
                          <Box>
                            <Typography variant="h6">
                              {address.name} {address.isMain && " (główny)"}
                            </Typography>
                            <Typography variant="body1">
                              {address.street}, {address.postalCode} {address.city}
                            </Typography>
                            <Typography variant="body2" color="textSecondary">
                              {address.country}
                            </Typography>
                          </Box>
                          {!viewOnly && (
                            <Box>
                              <IconButton color="primary" onClick={() => openAddressDialog(index)}>
                                <EditIcon />
                              </IconButton>
                              <IconButton color="error" onClick={() => handleDeleteAddress(index)}>
                                <DeleteIcon />
                              </IconButton>
                            </Box>
                          )}
                        </Box>
                      </CardContent>
                    </Card>
                  ))}
                </List>
              )}
            </Grid>
            
            {/* Przyciski */}
            <Grid item xs={12}>
              <Divider sx={{ my: 2 }} />
              <Box display="flex" justifyContent="flex-end" gap={2}>
                <Button
                  variant="outlined"
                  onClick={() => navigate('/suppliers')}
                >
                  {viewOnly ? 'Powrót' : 'Anuluj'}
                </Button>
                
                {!viewOnly && (
                  <Button
                    type="submit"
                    variant="contained"
                    color="primary"
                    disabled={saving}
                  >
                    {supplierId ? 'Aktualizuj' : 'Zapisz'}
                  </Button>
                )}
              </Box>
            </Grid>
          </Grid>
        </form>
      </Paper>
      
      {/* Dialog dodawania/edycji adresu */}
      <Dialog open={addressDialogOpen} onClose={() => setAddressDialogOpen(false)}>
        <DialogTitle>
          {editingAddressIndex >= 0 ? 'Edytuj adres' : 'Dodaj nowy adres'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                name="name"
                label="Nazwa adresu (np. Siedziba, Magazyn)"
                value={addressFormData.name}
                onChange={handleAddressChange}
                fullWidth
                required
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
            <Grid item xs={12} md={7}>
              <TextField
                name="city"
                label="Miasto"
                value={addressFormData.city}
                onChange={handleAddressChange}
                fullWidth
                required
              />
            </Grid>
            <Grid item xs={12} md={5}>
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
                label="Główny adres"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddressDialogOpen(false)}>
            Anuluj
          </Button>
          <Button onClick={handleSaveAddress} color="primary">
            Zapisz
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default SupplierForm; 