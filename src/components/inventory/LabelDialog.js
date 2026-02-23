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
import { updateInventoryItem } from '../../services/inventory';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';

// Funkcja do bezpiecznego formatowania daty
const formatDate = (dateValue) => {
  if (!dateValue) return '';
  
  try {
    // Obsługa różnych formatów daty
    let date;
    
    // Jeśli to obiekt Date
    if (dateValue instanceof Date) {
      date = dateValue;
    }
    // Jeśli to timestamp Firestore
    else if (dateValue.toDate && typeof dateValue.toDate === 'function') {
      date = dateValue.toDate();
    }
    // Jeśli to timestamp z sekundami
    else if (dateValue.seconds) {
      date = new Date(dateValue.seconds * 1000);
    }
    // Jeśli to string
    else if (typeof dateValue === 'string') {
      // Usuń ewentualne spacje
      const trimmedDate = dateValue.trim();
      
      // Sprawdź różne formaty daty
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmedDate)) {
        // Format MM/DD/YYYY lub M/D/YYYY
        const [month, day, year] = trimmedDate.split('/');
        date = new Date(year, month - 1, day);
      } else if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmedDate)) {
        // Format ISO YYYY-MM-DD
        date = new Date(trimmedDate);
      } else {
        // Standardowe parsowanie daty
        date = new Date(trimmedDate);
      }
      
      // Sprawdź czy data jest poprawna
      if (isNaN(date.getTime())) {
        console.error('Invalid date format:', dateValue);
        return 'No expiry date';
      }
    } else {
      return 'No expiry date';
    }
    
    // Formatuj datę do wyświetlenia w formacie DD/MM/YYYY (format brytyjski)
    return date.toLocaleDateString('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  } catch (error) {
    console.error('Error formatting date:', error, dateValue);
    return 'No expiry date';
  }
};

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
    country: 'Poland'
  });
  const [boxQuantity, setBoxQuantity] = useState(item?.itemsPerBox || '');
  const [isSaving, setIsSaving] = useState(false);
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const labelRef = useRef(null);
  
  useEffect(() => {
    let cancelled = false;

    if (open) {
      const loadCustomers = async () => {
        try {
          setLoadingCustomers(true);
          const customersData = await getAllCustomers();
          if (cancelled) return;
          setCustomers(customersData);
        } catch (error) {
          if (cancelled) return;
          console.error('Error fetching customers:', error);
        } finally {
          if (!cancelled) {
            setLoadingCustomers(false);
          }
        }
      };
      loadCustomers();
      setBoxQuantity(item?.itemsPerBox || '');
    }

    return () => { cancelled = true; };
  }, [open, item]);
  
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
    
    // Reset selected address if "No address" is selected
    if (event.target.value === 'none') {
      setSelectedCustomer(null);
      setManualAddress({
        name: '',
        street: '',
        city: '',
        postalCode: '',
        country: 'Poland'
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
      
      // Save new itemsPerBox value to inventory item
      await updateInventoryItem(item.id, { itemsPerBox: boxQuantity }, currentUser.uid);
      
      showSuccess('Box quantity updated successfully');
    } catch (error) {
      console.error('Error saving box quantity:', error);
      showError('Failed to save box quantity');
    } finally {
      setIsSaving(false);
    }
  };

  // Format address for display
  const formatAddress = (address) => {
    if (!address) return '';
    const { name, street, postalCode, city, country } = address;
    return `${name ? name + '\n' : ''}${street}\n${postalCode} ${city}\n${country}`;
  };

  // Prepare address object for label
  const getAddressForLabel = () => {
    if (addressType === 'none') return null;
    
    if (addressType === 'manual') {
      return manualAddress ? formatAddress(manualAddress) : null;
    }
    
    if (addressType === 'customer' && selectedCustomer) {
      // Choose shipping address or billing address (if shipping address doesn't exist)
      const customerAddress = {
        name: selectedCustomer.name,
        street: selectedCustomer.shippingAddress || selectedCustomer.billingAddress || '',
        city: '',
        postalCode: '',
        country: 'Poland'
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
        Generate Label: {item?.name || 'Product'}
      </DialogTitle>
      <DialogContent>
        <Tabs value={selectedTab} onChange={handleTabChange} sx={{ mb: 2 }}>
          <Tab label="Box Label" />
          <Tab label="Batch Label" disabled={!batches || batches.length === 0} />
        </Tabs>
        
        {selectedTab === 0 && (
          <Box sx={{ mb: 3 }}>
            <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
              <Typography variant="subtitle1" gutterBottom>Box Quantity</Typography>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs>
                  <TextField
                    fullWidth
                    label="Box Quantity"
                    type="number"
                    value={boxQuantity}
                    onChange={handleBoxQuantityChange}
                    InputProps={{ endAdornment: item?.unit || 'pcs' }}
                    helperText="Specify quantity of product in one box"
                  />
                </Grid>
                <Grid item>
                  <Button 
                    variant="contained" 
                    color="primary" 
                    onClick={handleSaveBoxQuantity}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving...' : 'Save to Item'}
                  </Button>
                </Grid>
              </Grid>
            </Paper>
            
            {batches && batches.length > 0 && (
              <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
                <Typography variant="subtitle1" gutterBottom>Select Batch for Box Label</Typography>
                <FormControl fullWidth>
                  <InputLabel>Select Batch</InputLabel>
                  <Select
                    value={selectedBatch?.id || ''}
                    onChange={handleBatchChange}
                    label="Select Batch"
                  >
                    <MenuItem value="">No batch</MenuItem>
                    {batches.map((batch) => (
                      <MenuItem key={batch.id} value={batch.id}>
                        Batch number: {batch.batchNumber || batch.lotNumber || 'none'} | Quantity: {batch.quantity} | 
                        Expiry date: {formatDate(batch.expiryDate)}
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
              <InputLabel>Select Batch</InputLabel>
              <Select
                value={selectedBatch?.id || ''}
                onChange={handleBatchChange}
                label="Select Batch"
              >
                {batches.map((batch) => (
                  <MenuItem key={batch.id} value={batch.id}>
                    Batch number: {batch.batchNumber || batch.lotNumber || 'none'} | Quantity: {batch.quantity} | 
                    Expiry date: {formatDate(batch.expiryDate)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        )}

        {/* Dodaj opcje adresu */}
        <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
          <Typography variant="subtitle1" gutterBottom>Address on Label</Typography>
          
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Address Type</InputLabel>
            <Select
              value={addressType}
              onChange={handleAddressTypeChange}
              label="Address Type"
            >
              <MenuItem value="none">No address</MenuItem>
              <MenuItem value="manual">Enter manually</MenuItem>
              <MenuItem value="customer">Select from customer list</MenuItem>
            </Select>
          </FormControl>

          {addressType === 'manual' && (
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Recipient Name"
                  name="name"
                  value={manualAddress.name}
                  onChange={handleManualAddressChange}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Street and Number"
                  name="street"
                  value={manualAddress.street}
                  onChange={handleManualAddressChange}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="Postal Code"
                  name="postalCode"
                  value={manualAddress.postalCode}
                  onChange={handleManualAddressChange}
                  placeholder="00-000"
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  fullWidth
                  label="City"
                  name="city"
                  value={manualAddress.city}
                  onChange={handleManualAddressChange}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Country"
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
                    <TextField {...params} label="Select Customer" fullWidth />
                  )}
                />
              )}
              
              {selectedCustomer && (
                <Paper variant="outlined" sx={{ p: 2, mt: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>Shipping Address:</Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                    {selectedCustomer.shippingAddress || 'No shipping address'}
                  </Typography>
                  
                  <Divider sx={{ my: 2 }} />
                  
                  <Typography variant="subtitle2" gutterBottom>Billing Address:</Typography>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                    {selectedCustomer.billingAddress || 'No billing address'}
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
        <Button onClick={handleClose}>Close</Button>
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
          Print Label
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
          Save as Image
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default LabelDialog; 