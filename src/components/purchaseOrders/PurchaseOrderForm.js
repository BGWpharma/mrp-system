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
  getAllSuppliers,
  PURCHASE_ORDER_STATUSES,
  translateStatus
} from '../../services/purchaseOrderService';
import { getAllInventoryItems, getAllWarehouses } from '../../services/inventoryService';
import { CURRENCY_OPTIONS } from '../../config';
import { formatCurrency } from '../../utils/formatUtils';
import { formatDateForInput } from '../../utils/dateUtils';

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
  const [warehouses, setWarehouses] = useState([]);
  
  const [poData, setPoData] = useState({
    supplier: null,
    items: [],
    totalValue: 0,
    totalGross: 0,
    currency: 'PLN',
    vatRate: 23, // Domyślna stawka VAT 23%
    targetWarehouseId: '', // Nowe pole dla magazynu docelowego
    orderDate: formatDateForInput(new Date()),
    expectedDeliveryDate: '',
    deliveryAddress: '',
    notes: '',
    status: PURCHASE_ORDER_STATUSES.DRAFT
  });
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        console.log("Pobieranie danych formularza PO, ID:", currentOrderId);
        
        // Pobierz dostawców
        const suppliersData = await getAllSuppliers();
        setSuppliers(suppliersData);
        
        // Pobierz przedmioty magazynowe
        const itemsData = await getAllInventoryItems();
        setInventoryItems(itemsData);
        
        // Pobierz magazyny
        const warehousesData = await getAllWarehouses();
        setWarehouses(warehousesData);
        
        // Jeśli edytujemy istniejące zamówienie, pobierz jego dane
        if (currentOrderId && currentOrderId !== 'new') {
          console.log("Pobieranie danych istniejącego zamówienia:", currentOrderId);
          const poDetails = await getPurchaseOrderById(currentOrderId);
          console.log("Pobrane dane zamówienia:", poDetails);
          
          // Użyj formatDateForInput do formatowania dat
          const formattedOrderDate = poDetails.orderDate ? formatDateForInput(poDetails.orderDate) : formatDateForInput(new Date());
          const formattedDeliveryDate = poDetails.expectedDeliveryDate ? formatDateForInput(poDetails.expectedDeliveryDate) : '';
          
          // Pobierz obiekty supplier z tablicy wszystkich dostawców
          let matchedSupplier = null;
          if (poDetails.supplier) {
            matchedSupplier = poDetails.supplier;
          } else if (poDetails.supplierId) {
            matchedSupplier = suppliersData.find(s => s.id === poDetails.supplierId);
          }
          
          console.log("Dopasowany dostawca:", matchedSupplier);
          
          setPoData({
            ...poDetails,
            supplier: matchedSupplier,
            orderDate: formattedOrderDate,
            expectedDeliveryDate: formattedDeliveryDate,
            vatRate: poDetails.vatRate || 23,
            targetWarehouseId: poDetails.targetWarehouseId || ''
          });
        }
        
        setLoading(false);
      } catch (error) {
        console.error('Błąd podczas pobierania danych:', error);
        showError('Nie udało się pobrać danych: ' + error.message);
        setLoading(false);
      }
    };
    
    fetchData();
  }, [currentOrderId, showError]);
  
  // Aktualizacja całkowitej wartości zamówienia (netto i brutto)
  useEffect(() => {
    const totalNet = poData.items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
    const vatRate = poData.vatRate / 100 || 0.23;
    const totalGross = totalNet * (1 + vatRate);
    
    setPoData(prev => ({ 
      ...prev, 
      totalValue: totalNet,
      totalGross: totalGross 
    }));
  }, [poData.items, poData.vatRate]);
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setPoData(prev => ({ ...prev, [name]: value }));
  };
  
  const handleDateChange = (name, date) => {
    console.log(`Zmiana daty ${name}:`, date);
    
    if (date) {
      try {
        // Upewnij się, że data jest poprawnym obiektem Date
        const validDate = date instanceof Date && !isNaN(date) ? date : new Date(date);
        console.log(`Poprawna data ${name}:`, validDate);
        
        // Użyj funkcji formatDateForInput aby poprawnie sformatować datę
        const formattedDate = formatDateForInput(validDate);
        console.log(`Sformatowana data ${name}:`, formattedDate);
        
        setPoData(prev => ({ ...prev, [name]: formattedDate }));
      } catch (error) {
        console.error(`Błąd podczas formatowania daty ${name}:`, error);
        // W przypadku błędu, ustaw pustą datę
        setPoData(prev => ({ ...prev, [name]: '' }));
      }
    } else {
      console.log(`Usunięcie daty ${name}`);
      setPoData(prev => ({ ...prev, [name]: '' }));
    }
  };
  
  const handleSupplierChange = (event, newValue) => {
    setPoData({ 
      ...poData, 
      supplier: newValue,
      // Jeśli dostawca ma adresy, ustaw domyślny adres dostawy na adres główny lub pierwszy z listy
      deliveryAddress: newValue && newValue.addresses && newValue.addresses.length > 0
        ? formatAddress(newValue.addresses.find(a => a.isMain) || newValue.addresses[0])
        : ''
    });
  };
  
  // Funkcja formatująca adres
  const formatAddress = (address) => {
    if (!address) return '';
    return `${address.name ? address.name + ', ' : ''}${address.street}, ${address.postalCode} ${address.city}, ${address.country}`;
  };
  
  const handleAddItem = () => {
    setPoData(prev => ({
      ...prev,
      items: [...prev.items, {
        id: `temp-${Date.now()}`,
        name: '',
        quantity: 1,
        unit: 'szt',
        unitPrice: 0,
        totalPrice: 0
      }]
    }));
  };
  
  const handleRemoveItem = (index) => {
    const updatedItems = [...poData.items];
    updatedItems.splice(index, 1);
    setPoData(prev => ({ ...prev, items: updatedItems }));
  };
  
  const handleItemChange = (index, field, value) => {
    const updatedItems = [...poData.items];
    updatedItems[index][field] = value;
    
    // Przelicz totalPrice jeśli zmieniono quantity lub unitPrice
    if (field === 'quantity' || field === 'unitPrice') {
      const quantity = field === 'quantity' ? value : updatedItems[index].quantity;
      const unitPrice = field === 'unitPrice' ? value : updatedItems[index].unitPrice;
      updatedItems[index].totalPrice = quantity * unitPrice;
    }
    
    setPoData(prev => ({ ...prev, items: updatedItems }));
  };
  
  const handleItemSelect = (index, selectedItem) => {
    if (!selectedItem) return;
    
    const updatedItems = [...poData.items];
    updatedItems[index] = {
      ...updatedItems[index],
      id: selectedItem.id,
      inventoryItemId: selectedItem.id,
      name: selectedItem.name,
      unit: selectedItem.unit || 'szt',
      // Zachowujemy istniejące wartości jeśli są, lub ustawiamy domyślne
      quantity: updatedItems[index].quantity || 1,
      unitPrice: updatedItems[index].unitPrice || 0,
      totalPrice: (updatedItems[index].quantity || 1) * (updatedItems[index].unitPrice || 0)
    };
    
    setPoData(prev => ({ ...prev, items: updatedItems }));
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!poData.supplier) {
      showError('Wybierz dostawcę');
      return;
    }
    
    if (!poData.targetWarehouseId) {
      showError('Wybierz magazyn docelowy');
      return;
    }
    
    if (poData.items.length === 0) {
      showError('Dodaj przynajmniej jeden przedmiot do zamówienia');
      return;
    }
    
    const invalidItem = poData.items.find(item => !item.name || !item.quantity || !item.unitPrice);
    if (invalidItem) {
      showError('Uzupełnij wszystkie dane dla każdego przedmiotu');
      return;
    }
    
    try {
      setSaving(true);
      console.log("Zapisywanie zamówienia, dane:", poData);
      
      // Dodajemy dane użytkownika
      const orderData = {
        ...poData,
        createdBy: currentUser?.uid || null,
        updatedBy: currentUser?.uid || null
      };
      
      let result;
      if (currentOrderId && currentOrderId !== 'new') {
        console.log("Aktualizacja istniejącego zamówienia:", currentOrderId);
        result = await updatePurchaseOrder(currentOrderId, orderData);
        showSuccess('Zamówienie komponentów zostało zaktualizowane');
      } else {
        console.log("Tworzenie nowego zamówienia");
        result = await createPurchaseOrder(orderData);
        showSuccess('Zamówienie komponentów zostało utworzone');
      }
      
      console.log("Wynik zapisu:", result);
      
      setSaving(false);
      navigate(`/purchase-orders/${result.id}`);
    } catch (error) {
      console.error('Błąd podczas zapisywania zamówienia:', error);
      showError('Nie udało się zapisać zamówienia: ' + error.message);
      setSaving(false);
    }
  };
  
  const handleCancel = () => {
    navigate('/purchase-orders');
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
          {currentOrderId === 'new' ? 'Utwórz Zamówienie Komponentów' : 'Edytuj Zamówienie Komponentów'}
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
            
            {/* Magazyn docelowy */}
            <Grid item xs={12} md={6}>
              <FormControl fullWidth required>
                <InputLabel>Magazyn docelowy</InputLabel>
                <Select
                  name="targetWarehouseId"
                  value={poData.targetWarehouseId}
                  onChange={handleChange}
                  label="Magazyn docelowy"
                >
                  <MenuItem value=""><em>Wybierz magazyn</em></MenuItem>
                  {warehouses.map((warehouse) => (
                    <MenuItem key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            {/* Waluta */}
            <Grid item xs={12} md={3}>
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
            
            {/* Stawka VAT */}
            <Grid item xs={12} md={3}>
              <FormControl fullWidth>
                <InputLabel>Stawka VAT</InputLabel>
                <Select
                  name="vatRate"
                  value={poData.vatRate}
                  onChange={handleChange}
                  label="Stawka VAT"
                >
                  <MenuItem value={0}>0%</MenuItem>
                  <MenuItem value={5}>5%</MenuItem>
                  <MenuItem value={8}>8%</MenuItem>
                  <MenuItem value={23}>23%</MenuItem>
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
            
            {/* Adres dostawcy */}
            <Grid item xs={12}>
              <TextField
                name="deliveryAddress"
                label="Adres dostawcy"
                value={poData.deliveryAddress}
                onChange={handleChange}
                fullWidth
                multiline
                rows={3}
                helperText={poData.supplier && poData.supplier.addresses && poData.supplier.addresses.length > 0 
                  ? 'Możesz wybrać z adresów dostawcy:' 
                  : 'Wprowadź adres dostawcy'
                }
              />
              
              {/* Lista adresów dostawcy */}
              {poData.supplier && poData.supplier.addresses && poData.supplier.addresses.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Wybierz adres dostawcy:
                  </Typography>
                  <Grid container spacing={1}>
                    {poData.supplier.addresses.map((address, idx) => (
                      <Grid item xs={12} sm={6} key={address.id || idx}>
                        <Button
                          variant="outlined"
                          size="small"
                          fullWidth
                          sx={{ justifyContent: 'flex-start', textAlign: 'left', py: 1 }}
                          onClick={() => setPoData({ ...poData, deliveryAddress: formatAddress(address) })}
                        >
                          <Box>
                            <Typography variant="body2" fontWeight="bold">
                              {address.name} {address.isMain && '(główny)'}
                            </Typography>
                            <Typography variant="body2">{formatAddress(address)}</Typography>
                          </Box>
                        </Button>
                      </Grid>
                    ))}
                  </Grid>
                </Box>
              )}
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
                        onChange={(event, newValue) => handleItemSelect(index, newValue)}
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
          
          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
            <Grid container spacing={2} justifyContent="flex-end">
              <Grid item xs={12} md={4}>
                <Typography variant="subtitle1" gutterBottom>
                  Wartość netto: <strong>{poData.totalValue.toFixed(2)} {poData.currency}</strong>
                </Typography>
                <Typography variant="subtitle1" gutterBottom>
                  Stawka VAT: <strong>{poData.vatRate}%</strong>
                </Typography>
                <Typography variant="h6" color="primary" gutterBottom>
                  Wartość brutto: <strong>{poData.totalGross.toFixed(2)} {poData.currency}</strong>
                </Typography>
              </Grid>
            </Grid>
          </Box>
          
          <Box sx={{ mb: 3 }}>
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={handleAddItem}
              sx={{ mt: 2 }}
            >
              Dodaj pozycję
            </Button>
          </Box>
          
          <Divider sx={{ my: 3 }} />
          
          {/* Przyciski */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <Button
              variant="outlined"
              onClick={handleCancel}
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