import React, { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Tabs,
  Tab,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  TextField,
  Grid,
  Paper,
  Autocomplete,
  Divider
} from '@mui/material';
import InventoryLabel from './InventoryLabel';
import { getAllCustomers } from '../../services/customerService';
import { updateInventoryItem } from '../../services/inventoryService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';

const LabelDialog = ({ open, onClose, item, batches = [] }) => {
  const [selectedTab, setSelectedTab] = useState(0);
  const [selectedBatch, setSelectedBatch] = useState(batches?.length > 0 ? batches[0] : null);
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [addressType, setAddressType] = useState('none'); // none, manual, customer
  const [manualAddress, setManualAddress] = useState({
    name: '',
    street: '',
    city: '',
    postalCode: '',
    country: 'Polska'
  });
  const [boxQuantity, setBoxQuantity] = useState(item?.itemsPerBox || '');
  const [isSaving, setIsSaving] = useState(false);
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const labelRef = useRef(null);
  
  useEffect(() => {
    if (open) {
      fetchCustomers();
      setBoxQuantity(item?.itemsPerBox || '');
    }
  }, [open, item]);

  const fetchCustomers = async () => {
    try {
      setLoadingCustomers(true);
      const customersData = await getAllCustomers();
      setCustomers(customersData);
    } catch (error) {
      console.error('Błąd podczas pobierania klientów:', error);
    } finally {
      setLoadingCustomers(false);
    }
  };
  
  const handleTabChange = (event, newValue) => {
    setSelectedTab(newValue);
  };
  
  const handleBatchChange = (event) => {
    const batchId = event.target.value;
    const batch = batchId ? batches?.find(b => b.id === batchId) || null : null;
    setSelectedBatch(batch);
  };
  
  const handleClose = () => {
    onClose();
  };

  const handleAddressTypeChange = (event) => {
    setAddressType(event.target.value);
    
    // Resetuj wybrany adres, jeśli wybrano "Brak adresu"
    if (event.target.value === 'none') {
      setSelectedCustomer(null);
      setManualAddress({
        name: '',
        street: '',
        city: '',
        postalCode: '',
        country: 'Polska'
      });
    }
  };

  const handleManualAddressChange = (e) => {
    const { name, value } = e.target;
    setManualAddress(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleCustomerChange = (event, newValue) => {
    setSelectedCustomer(newValue);
  };

  const handleBoxQuantityChange = (e) => {
    setBoxQuantity(e.target.value);
  };

  const handleSaveBoxQuantity = async () => {
    if (!item || !currentUser) return;
    
    try {
      setIsSaving(true);
      
      // Zapisz nową wartość itemsPerBox w pozycji magazynowej
      await updateInventoryItem(item.id, { itemsPerBox: boxQuantity }, currentUser.uid);
      
      showSuccess('Zaktualizowano ilość produktu w kartonie');
    } catch (error) {
      console.error('Błąd podczas zapisywania ilości w kartonie:', error);
      showError('Nie udało się zapisać ilości w kartonie');
    } finally {
      setIsSaving(false);
    }
  };

  // Formatowanie adresu do wyświetlenia
  const formatAddress = (address) => {
    if (!address) return '';
    const { name, street, postalCode, city, country } = address;
    return `${name ? name + '\n' : ''}${street}\n${postalCode} ${city}\n${country}`;
  };

  // Przygotowanie obiektu adresu do przekazania do etykiety
  const getAddressForLabel = () => {
    if (addressType === 'none') return null;
    
    if (addressType === 'manual') {
      return manualAddress ? formatAddress(manualAddress) : null;
    }
    
    if (addressType === 'customer' && selectedCustomer) {
      // Wybierz adres dostawy lub adres do faktury (jeśli adres dostawy nie istnieje)
      const customerAddress = {
        name: selectedCustomer.name,
        street: selectedCustomer.shippingAddress || selectedCustomer.billingAddress || '',
        city: '',
        postalCode: '',
        country: 'Polska'
      };
      
      return selectedCustomer.shippingAddress || selectedCustomer.billingAddress || null;
    }
    
    return null;
  };
  
  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          minHeight: '60vh',
          maxHeight: '90vh'
        }
      }}
    >
      <DialogTitle>
        Generuj etykietę: {item?.name || 'Produkt'}
      </DialogTitle>
      <DialogContent>
        <Tabs value={selectedTab} onChange={handleTabChange} sx={{ mb: 2 }}>
          <Tab label="Etykieta kartonu" />
          <Tab label="Etykieta partii" disabled={!batches || batches.length === 0} />
        </Tabs>
        
        {selectedTab === 0 && (
          <Box sx={{ mb: 3 }}>
            <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
              <Typography variant="subtitle1" gutterBottom>Ilość produktu w kartonie</Typography>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs>
                  <TextField
                    fullWidth
                    label="Ilość w kartonie"
                    type="number"
                    value={boxQuantity}
                    onChange={handleBoxQuantityChange}
                    InputProps={{ endAdornment: item?.unit || 'szt.' }}
                    helperText="Określ ilość produktu w jednym kartonie"
                  />
                </Grid>
                <Grid item>
                  <Button 
                    variant="contained" 
                    color="primary" 
                    onClick={handleSaveBoxQuantity}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Zapisywanie...' : 'Zapisz do pozycji'}
                  </Button>
                </Grid>
              </Grid>
            </Paper>
            
            {batches && batches.length > 0 && (
              <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
                <Typography variant="subtitle1" gutterBottom>Wybierz partię dla etykiety kartonu</Typography>
                <FormControl fullWidth>
                  <InputLabel>Wybierz partię</InputLabel>
                  <Select
                    value={selectedBatch?.id || ''}
                    onChange={handleBatchChange}
                    label="Wybierz partię"
                  >
                    <MenuItem value="">Brak partii</MenuItem>
                    {batches.map((batch) => (
                      <MenuItem key={batch.id} value={batch.id}>
                        Numer partii: {batch.batchNumber || batch.lotNumber || 'brak'} | Ilość: {batch.quantity} | 
                        {batch.expiryDate ? ` Termin ważności: ${new Date(batch.expiryDate).toLocaleDateString('pl-PL')}` : ' Brak terminu ważności'}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Paper>
            )}
          </Box>
        )}
        
        {selectedTab === 1 && batches && batches.length > 0 && (
          <Box sx={{ mb: 3 }}>
            <FormControl fullWidth>
              <InputLabel>Wybierz partię</InputLabel>
              <Select
                value={selectedBatch?.id || ''}
                onChange={handleBatchChange}
                label="Wybierz partię"
              >
                {batches.map((batch) => (
                  <MenuItem key={batch.id} value={batch.id}>
                    Numer partii: {batch.batchNumber || batch.lotNumber || 'brak'} | Ilość: {batch.quantity} | 
                    {batch.expiryDate ? ` Termin ważności: ${new Date(batch.expiryDate).toLocaleDateString('pl-PL')}` : ' Brak terminu ważności'}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        )}

        {/* Dodaj opcje adresu */}
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle1" gutterBottom>Adres na etykiecie</Typography>
          
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Rodzaj adresu</InputLabel>
            <Select
              value={addressType}
              onChange={handleAddressTypeChange}
              label="Rodzaj adresu"
            >
              <MenuItem value="none">Brak adresu</MenuItem>
              <MenuItem value="manual">Wprowadź ręcznie</MenuItem>
              <MenuItem value="customer">Wybierz z listy klientów</MenuItem>
            </Select>
          </FormControl>

          {addressType === 'manual' && (
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Nazwa odbiorcy"
                  name="name"
                  value={manualAddress.name}
                  onChange={handleManualAddressChange}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Ulica i numer"
                  name="street"
                  value={manualAddress.street}
                  onChange={handleManualAddressChange}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Kod pocztowy"
                  name="postalCode"
                  value={manualAddress.postalCode}
                  onChange={handleManualAddressChange}
                  placeholder="00-000"
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Miasto"
                  name="city"
                  value={manualAddress.city}
                  onChange={handleManualAddressChange}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Kraj"
                  name="country"
                  value={manualAddress.country}
                  onChange={handleManualAddressChange}
                />
              </Grid>
            </Grid>
          )}

          {addressType === 'customer' && (
            <Box>
              {loadingCustomers ? (
                <CircularProgress size={24} sx={{ my: 2 }} />
              ) : (
                <Autocomplete
                  options={customers}
                  getOptionLabel={(customer) => customer.name}
                  onChange={handleCustomerChange}
                  value={selectedCustomer}
                  renderInput={(params) => (
                    <TextField {...params} label="Wybierz klienta" fullWidth />
                  )}
                />
              )}
              
              {selectedCustomer && (
                <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>Adres dostawy:</Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                    {selectedCustomer.shippingAddress || 'Brak adresu dostawy'}
                  </Typography>
                  
                  <Divider sx={{ my: 2 }} />
                  
                  <Typography variant="subtitle2" gutterBottom>Adres do faktury:</Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                    {selectedCustomer.billingAddress || 'Brak adresu do faktury'}
                  </Typography>
                </Paper>
              )}
            </Box>
          )}
        </Paper>

        {/* Podgląd etykiety */}
        <Box sx={{ minHeight: '400px', border: '1px solid #e0e0e0', p: 1, borderRadius: 1, overflow: 'auto' }}>
          <InventoryLabel 
            ref={labelRef}
            item={item}
            batch={selectedBatch}
            address={getAddressForLabel()}
            boxQuantity={selectedTab === 0 ? boxQuantity : ''}
            labelType={selectedTab === 0 ? 'box' : 'batch'}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Zamknij</Button>
        <Button 
          onClick={() => {
            if (labelRef.current) {
              labelRef.current.handlePrint();
            }
          }}
          variant="contained" 
          color="primary"
          disabled={loading}
        >
          Drukuj etykietę
        </Button>
        <Button 
          onClick={() => {
            if (labelRef.current) {
              labelRef.current.handleSaveAsPNG();
            }
          }}
          variant="outlined" 
          color="primary"
          disabled={loading}
        >
          Zapisz jako obraz
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default LabelDialog; 