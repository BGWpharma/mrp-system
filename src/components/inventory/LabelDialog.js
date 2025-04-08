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
  const labelRef = useRef(null);
  
  useEffect(() => {
    if (open) {
      fetchCustomers();
    }
  }, [open]);

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
    const batch = batches?.find(b => b.id === batchId) || null;
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
          <Tab label="Etykieta produktu" />
          <Tab label="Etykieta partii" disabled={!batches || batches.length === 0} />
        </Tabs>
        
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
                    Numer partii: {batch.batchNumber || 'brak'} | Ilość: {batch.quantity} | 
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
                  getOptionLabel={(option) => option.name}
                  value={selectedCustomer}
                  onChange={handleCustomerChange}
                  renderInput={(params) => <TextField {...params} label="Wybierz klienta" />}
                  fullWidth
                />
              )}

              {selectedCustomer && (
                <Paper variant="outlined" sx={{ mt: 2, p: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Adres dostawy:
                  </Typography>
                  <Typography variant="body1" sx={{ whiteSpace: 'pre-line', mb: 1 }}>
                    {selectedCustomer.shippingAddress || selectedCustomer.billingAddress || "Brak adresu"}
                  </Typography>
                  
                  {selectedCustomer.billingAddress && selectedCustomer.billingAddress !== selectedCustomer.shippingAddress && (
                    <>
                      <Divider sx={{ my: 1 }} />
                      <Typography variant="body2" color="text.secondary">
                        Adres do faktury:
                      </Typography>
                      <Typography variant="body1" sx={{ whiteSpace: 'pre-line' }}>
                        {selectedCustomer.billingAddress}
                      </Typography>
                    </>
                  )}
                </Paper>
              )}
            </Box>
          )}
        </Paper>
        
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px' }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {selectedTab === 0 && (
              <InventoryLabel 
                ref={labelRef}
                item={item} 
                onClose={handleClose}
                address={getAddressForLabel()}
              />
            )}
            
            {selectedTab === 1 && selectedBatch && (
              <InventoryLabel 
                ref={labelRef}
                item={item} 
                batch={selectedBatch}
                onClose={handleClose}
                address={getAddressForLabel()}
              />
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="primary">
          Zamknij
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default LabelDialog; 