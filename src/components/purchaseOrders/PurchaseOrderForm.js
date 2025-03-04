import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Container, Typography, Paper, Box, TextField, Button, Grid, Autocomplete,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton,
  FormControl, InputLabel, Select, MenuItem, Divider
} from '@mui/material';
import { Delete as DeleteIcon, Add as AddIcon } from '@mui/icons-material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { pl } from 'date-fns/locale';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { 
  createPurchaseOrder, 
  getPurchaseOrderById, 
  updatePurchaseOrder,
  getAllSuppliers
} from '../../services/purchaseOrderService';
import { getAllInventoryItems } from '../../services/inventoryService';

const PurchaseOrderForm = ({ orderId }) => {
  const { poId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  
  // Używamy orderId z props, a jeśli nie istnieje, to poId z useParams()
  const currentOrderId = orderId || poId;
  
  const [loading, setLoading] = useState(!!currentOrderId && currentOrderId !== 'new');
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  
  const [poData, setPoData] = useState({
    supplier: null,
    items: [],
    totalValue: 0,
    currency: 'PLN',
    orderDate: new Date().toISOString().split('T')[0],
    expectedDeliveryDate: '',
    deliveryAddress: '',
    notes: '',
    attachments: []
  });
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Pobierz dostawców
        const suppliersData = await getAllSuppliers();
        setSuppliers(suppliersData);
        
        // Pobierz przedmioty magazynowe
        const itemsData = await getAllInventoryItems();
        setInventoryItems(itemsData);
        
        // Jeśli edytujemy istniejące zamówienie, pobierz jego dane
        if (currentOrderId && currentOrderId !== 'new') {
          const poDetails = await getPurchaseOrderById(currentOrderId);
          setPoData(poDetails);
        }
        
        setLoading(false);
      } catch (error) {
        console.error('Błąd podczas pobierania danych:', error);
        showError('Nie udało się pobrać danych');
        setLoading(false);
      }
    };
    
    fetchData();
  }, [currentOrderId]);
  
  // Aktualizacja całkowitej wartości zamówienia
  useEffect(() => {
    const total = poData.items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
    setPoData(prev => ({ ...prev, totalValue: total }));
  }, [poData.items]);
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setPoData(prev => ({ ...prev, [name]: value }));
  };
  
  const handleSupplierChange = (event, newValue) => {
    setPoData(prev => ({ ...prev, supplier: newValue }));
  };
  
  const handleDateChange = (name, date) => {
    setPoData(prev => ({ ...prev, [name]: date ? date.toISOString().split('T')[0] : '' }));
  };
  
  const handleAddItem = () => {
    setPoData(prev => ({
      ...prev,
      items: [...prev.items, {
        id: Date.now().toString(), // Tymczasowe ID
        inventoryItemId: '',
        name: '',
        quantity: 0,
        unit: '',
        unitPrice: 0,
        totalPrice: 0,
        expectedDeliveryDate: prev.expectedDeliveryDate
      }]
    }));
  };
  
  const handleRemoveItem = (index) => {
    const newItems = [...poData.items];
    newItems.splice(index, 1);
    setPoData(prev => ({ ...prev, items: newItems }));
  };
  
  const handleItemChange = (index, field, value) => {
    const newItems = [...poData.items];
    newItems[index][field] = value;
    
    // Jeśli zmieniono ilość lub cenę jednostkową, przelicz cenę całkowitą
    if (field === 'quantity' || field === 'unitPrice') {
      const quantity = field === 'quantity' ? parseFloat(value) || 0 : parseFloat(newItems[index].quantity) || 0;
      const unitPrice = field === 'unitPrice' ? parseFloat(value) || 0 : parseFloat(newItems[index].unitPrice) || 0;
      newItems[index].totalPrice = quantity * unitPrice;
    }
    
    setPoData(prev => ({ ...prev, items: newItems }));
  };
  
  const handleInventoryItemSelect = (index, item) => {
    if (!item) return;
    
    const newItems = [...poData.items];
    newItems[index] = {
      ...newItems[index],
      inventoryItemId: item.id,
      name: item.name,
      unit: item.unit || 'szt.',
      // Możemy również ustawić domyślną cenę, jeśli jest dostępna
      unitPrice: item.unitPrice || newItems[index].unitPrice
    };
    
    // Przelicz cenę całkowitą
    const quantity = parseFloat(newItems[index].quantity) || 0;
    const unitPrice = parseFloat(newItems[index].unitPrice) || 0;
    newItems[index].totalPrice = quantity * unitPrice;
    
    setPoData(prev => ({ ...prev, items: newItems }));
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Walidacja
    if (!poData.supplier) {
      showError('Wybierz dostawcę');
      return;
    }
    
    if (poData.items.length === 0) {
      showError('Dodaj co najmniej jeden przedmiot do zamówienia');
      return;
    }
    
    if (!poData.expectedDeliveryDate) {
      showError('Podaj oczekiwaną datę dostawy');
      return;
    }
    
    if (!poData.deliveryAddress) {
      showError('Podaj adres dostawy');
      return;
    }
    
    try {
      setSaving(true);
      
      // Przygotuj dane do zapisania
      const orderData = {
        ...poData,
        status: poData.status || 'draft',
        createdBy: currentUser.uid,
        updatedBy: currentUser.uid
      };
      
      let result;
      
      if (currentOrderId && currentOrderId !== 'new') {
        // Aktualizacja istniejącego zamówienia
        result = await updatePurchaseOrder(currentOrderId, orderData);
        showSuccess('Zamówienie zakupowe zostało zaktualizowane');
      } else {
        // Tworzenie nowego zamówienia
        result = await createPurchaseOrder(orderData);
        showSuccess('Zamówienie zakupowe zostało utworzone');
      }
      
      setSaving(false);
      navigate(`/purchase-orders/${result.id}`);
    } catch (error) {
      console.error('Błąd podczas zapisywania zamówienia:', error);
      showError('Nie udało się zapisać zamówienia');
      setSaving(false);
    }
  };
  
  if (loading) {
    return (
      <Container>
        <Typography variant="h6">Ładowanie danych zamówienia...</Typography>
      </Container>
    );
  }
  
  return (
    <Container>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5">
          {currentOrderId === 'new' ? 'Nowe Zamówienie Zakupu' : 'Edytuj Zamówienie Zakupu'}
        </Typography>
      </Box>
      
      <Paper sx={{ p: 3 }}>
        <form onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            {/* Dostawca */}
            <Grid item xs={12} md={6}>
              <Autocomplete
                options={suppliers}
                getOptionLabel={(option) => option.name}
                value={poData.supplier}
                onChange={handleSupplierChange}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Dostawca"
                    required
                    fullWidth
                  />
                )}
              />
            </Grid>
            
            {/* Waluta */}
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Waluta</InputLabel>
                <Select
                  name="currency"
                  value={poData.currency}
                  onChange={handleChange}
                  label="Waluta"
                >
                  <MenuItem value="PLN">PLN</MenuItem>
                  <MenuItem value="EUR">EUR</MenuItem>
                  <MenuItem value="USD">USD</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            {/* Data zamówienia */}
            <Grid item xs={12} md={6}>
              <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                <DatePicker
                  label="Data zamówienia"
                  value={poData.orderDate ? new Date(poData.orderDate) : null}
                  onChange={(date) => handleDateChange('orderDate', date)}
                  slotProps={{ textField: { fullWidth: true } }}
                />
              </LocalizationProvider>
            </Grid>
            
            {/* Planowana data dostawy */}
            <Grid item xs={12} md={6}>
              <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                <DatePicker
                  label="Planowana data dostawy"
                  value={poData.expectedDeliveryDate ? new Date(poData.expectedDeliveryDate) : null}
                  onChange={(date) => handleDateChange('expectedDeliveryDate', date)}
                  slotProps={{ textField: { fullWidth: true, required: true } }}
                />
              </LocalizationProvider>
            </Grid>
            
            {/* Adres dostawy */}
            <Grid item xs={12}>
              <TextField
                name="deliveryAddress"
                label="Adres dostawy"
                value={poData.deliveryAddress}
                onChange={handleChange}
                fullWidth
                multiline
                rows={2}
              />
            </Grid>
            
            {/* Uwagi */}
            <Grid item xs={12}>
              <TextField
                name="notes"
                label="Uwagi"
                value={poData.notes}
                onChange={handleChange}
                fullWidth
                multiline
                rows={3}
              />
            </Grid>
          </Grid>
          
          <Divider sx={{ my: 3 }} />
          
          {/* Pozycje zamówienia */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="h6">Pozycje zamówienia</Typography>
          </Box>
          
          <TableContainer component={Paper} variant="outlined" sx={{ mb: 3 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Produkt</TableCell>
                  <TableCell>Ilość</TableCell>
                  <TableCell>Jednostka</TableCell>
                  <TableCell>Cena jedn.</TableCell>
                  <TableCell>Wartość</TableCell>
                  <TableCell>Akcje</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {poData.items.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <Autocomplete
                        options={inventoryItems}
                        getOptionLabel={(option) => option.name}
                        value={inventoryItems.find(i => i.id === item.inventoryItemId) || null}
                        onChange={(event, newValue) => handleInventoryItemSelect(index, newValue)}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label="Produkt"
                            required
                            size="small"
                          />
                        )}
                        sx={{ width: 250 }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        type="number"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                        size="small"
                        inputProps={{ min: 0, step: 0.01 }}
                        sx={{ width: 100 }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        value={item.unit}
                        onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                        size="small"
                        sx={{ width: 80 }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        type="number"
                        value={item.unitPrice}
                        onChange={(e) => handleItemChange(index, 'unitPrice', e.target.value)}
                        size="small"
                        inputProps={{ min: 0, step: 0.01 }}
                        sx={{ width: 100 }}
                      />
                    </TableCell>
                    <TableCell>
                      {item.totalPrice?.toFixed(2)} {poData.currency}
                    </TableCell>
                    <TableCell>
                      <IconButton
                        color="error"
                        onClick={() => handleRemoveItem(index)}
                        size="small"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                
                {poData.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      Brak pozycji w zamówieniu
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          
          <Box sx={{ mb: 3 }}>
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={handleAddItem}
            >
              Dodaj pozycję
            </Button>
          </Box>
          
          <Divider sx={{ my: 3 }} />
          
          {/* Podsumowanie */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
            <Typography variant="h6">Wartość całkowita:</Typography>
            <Typography variant="h6">{poData.totalValue.toFixed(2)} {poData.currency}</Typography>
          </Box>
          
          {/* Przyciski */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <Button
              variant="outlined"
              onClick={() => navigate('/purchase-orders')}
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

export default PurchaseOrderForm; 