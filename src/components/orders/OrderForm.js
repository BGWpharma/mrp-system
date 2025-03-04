import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Divider,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  FormHelperText,
  CircularProgress,
  Tooltip,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  Autocomplete
} from '@mui/material';
import {
  Save as SaveIcon,
  ArrowBack as ArrowBackIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  AttachMoney as AttachMoneyIcon,
  LocalShipping as LocalShippingIcon,
  EventNote as EventNoteIcon,
  Calculate as CalculateIcon
} from '@mui/icons-material';
import { 
  createOrder, 
  updateOrder, 
  getOrderById, 
  ORDER_STATUSES, 
  PAYMENT_METHODS,
  DEFAULT_ORDER 
} from '../../services/orderService';
import { getAllInventoryItems, getIngredientPrices } from '../../services/inventoryService';
import { getAllCustomers } from '../../services/customerService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { formatCurrency } from '../../utils/formatUtils';
import { createCustomer } from '../../services/customerService';

const OrderForm = ({ orderId }) => {
  const [loading, setLoading] = useState(!!orderId);
  const [saving, setSaving] = useState(false);
  const [orderData, setOrderData] = useState({...DEFAULT_ORDER});
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [validationErrors, setValidationErrors] = useState({});
  const [isCustomerDialogOpen, setIsCustomerDialogOpen] = useState(false);

  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const navigate = useNavigate();

  // Dodajemy stan dla kalkulacji kosztów
  const [costCalculation, setCostCalculation] = useState(null);
  const [calculatingCosts, setCalculatingCosts] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Pobierz dane zamówienia jeśli edytujemy istniejące
        if (orderId) {
          const fetchedOrder = await getOrderById(orderId);
          
          // Konwersja Firestore Timestamp na Date dla pól daty
          const orderDate = fetchedOrder.orderDate?.toDate ? fetchedOrder.orderDate.toDate() : new Date(fetchedOrder.orderDate);
          const expectedDeliveryDate = fetchedOrder.expectedDeliveryDate?.toDate ? 
            fetchedOrder.expectedDeliveryDate.toDate() : 
            fetchedOrder.expectedDeliveryDate ? new Date(fetchedOrder.expectedDeliveryDate) : null;
          const deliveryDate = fetchedOrder.deliveryDate?.toDate ? 
            fetchedOrder.deliveryDate.toDate() : 
            fetchedOrder.deliveryDate ? new Date(fetchedOrder.deliveryDate) : null;
            
          // Upewnij się, że zawsze mamy co najmniej jeden produkt w zamówieniu
          if (!fetchedOrder.items || fetchedOrder.items.length === 0) {
            fetchedOrder.items = [{ ...DEFAULT_ORDER.items[0] }];
          }
          
          setOrderData({
            ...fetchedOrder,
            orderDate: orderDate.toISOString().split('T')[0], // Format YYYY-MM-DD
            expectedDeliveryDate: expectedDeliveryDate ? expectedDeliveryDate.toISOString().split('T')[0] : '',
            deliveryDate: deliveryDate ? deliveryDate.toISOString().split('T')[0] : ''
          });
        }
        
        // Pobierz listę klientów
        const fetchedCustomers = await getAllCustomers();
        setCustomers(fetchedCustomers);
        
        // Pobierz listę produktów z inwentarza
        const fetchedProducts = await getAllInventoryItems();
        setProducts(fetchedProducts);
        
      } catch (error) {
        showError('Błąd podczas ładowania danych: ' + error.message);
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [orderId, showError]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      showError('Formularz zawiera błędy. Sprawdź wprowadzone dane.');
      return;
    }
    
    setSaving(true);
    
    try {
      if (orderId) {
        await updateOrder(orderId, orderData, currentUser.uid);
        showSuccess('Zamówienie zostało zaktualizowane');
      } else {
        await createOrder(orderData, currentUser.uid);
        showSuccess('Zamówienie zostało utworzone');
      }
      navigate('/orders');
    } catch (error) {
      showError('Błąd podczas zapisywania zamówienia: ' + error.message);
      console.error('Error saving order:', error);
    } finally {
      setSaving(false);
    }
  };

  const validateForm = () => {
    const errors = {};
    
    // Walidacja danych klienta
    if (!orderData.customer.name) {
      errors.customerName = 'Nazwa klienta jest wymagana';
    }
    
    // Walidacja produktów
    orderData.items.forEach((item, index) => {
      if (!item.name) {
        errors[`item_${index}_name`] = 'Nazwa produktu jest wymagana';
      }
      
      if (!item.quantity || item.quantity <= 0) {
        errors[`item_${index}_quantity`] = 'Ilość musi być większa od 0';
      }
      
      if (item.price < 0) {
        errors[`item_${index}_price`] = 'Cena nie może być ujemna';
      }
    });
    
    // Walidacja daty zamówienia
    if (!orderData.orderDate) {
      errors.orderDate = 'Data zamówienia jest wymagana';
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setOrderData(prev => ({ ...prev, [name]: value }));
    
    // Wyczyść błąd walidacji dla tego pola
    if (validationErrors[name]) {
      const updatedErrors = { ...validationErrors };
      delete updatedErrors[name];
      setValidationErrors(updatedErrors);
    }
  };

  const handleCustomerChange = (e, selectedCustomer) => {
    if (selectedCustomer) {
      setOrderData(prev => ({
        ...prev,
        customer: {
          id: selectedCustomer.id,
          name: selectedCustomer.name,
          email: selectedCustomer.email || '',
          phone: selectedCustomer.phone || '',
          address: selectedCustomer.address || ''
        }
      }));
      
      // Wyczyść błąd walidacji
      if (validationErrors.customerName) {
        const updatedErrors = { ...validationErrors };
        delete updatedErrors.customerName;
        setValidationErrors(updatedErrors);
      }
    } else {
      // Jeśli użytkownik wyczyścił pole, ustaw puste dane klienta
      setOrderData(prev => ({
        ...prev,
        customer: { ...DEFAULT_ORDER.customer }
      }));
    }
  };

  const handleCustomerDetailChange = (e) => {
    const { name, value } = e.target;
    setOrderData(prev => ({
      ...prev,
      customer: {
        ...prev.customer,
        [name.replace('customer_', '')]: value
      }
    }));
  };

  const handleAddCustomer = () => {
    // Inicjalizacja pustych danych nowego klienta
    setOrderData(prev => ({
      ...prev,
      customer: { ...DEFAULT_ORDER.customer }
    }));
    setIsCustomerDialogOpen(true);
  };

  const handleCloseCustomerDialog = () => {
    setIsCustomerDialogOpen(false);
  };

  const handleSaveNewCustomer = async () => {
    try {
      // Walidacja danych klienta
      const customerData = orderData.customer;
      
      if (!customerData.name || customerData.name.trim() === '') {
        showError('Nazwa klienta jest wymagana');
        return;
      }
      
      setSaving(true);
      
      // Zapisz klienta w bazie danych
      const newCustomerId = await createCustomer(customerData, currentUser.uid);
      
      // Dodaj nowego klienta do listy klientów
      const newCustomer = {
        id: newCustomerId,
        ...customerData
      };
      
      setCustomers(prev => [...prev, newCustomer]);
      
      // Ustaw tego klienta jako wybranego
      setOrderData(prev => ({
        ...prev,
        customer: newCustomer
      }));
      
      showSuccess('Klient został dodany');
      setIsCustomerDialogOpen(false);
    } catch (error) {
      showError('Błąd podczas dodawania klienta: ' + error.message);
      console.error('Error adding customer:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleItemChange = (index, field, value) => {
    const updatedItems = [...orderData.items];
    updatedItems[index] = {
      ...updatedItems[index],
      [field]: value
    };
    
    setOrderData(prev => ({
      ...prev,
      items: updatedItems
    }));
    
    // Wyczyść błąd walidacji
    if (validationErrors[`item_${index}_${field}`]) {
      const updatedErrors = { ...validationErrors };
      delete updatedErrors[`item_${index}_${field}`];
      setValidationErrors(updatedErrors);
    }
  };

  const handleProductSelect = (index, selectedProduct) => {
    if (selectedProduct) {
      const updatedItems = [...orderData.items];
      updatedItems[index] = {
        ...updatedItems[index],
        id: selectedProduct.id,
        name: selectedProduct.name,
        price: selectedProduct.price || 0,
        unit: selectedProduct.unit || 'szt.'
      };
      
      setOrderData(prev => ({
        ...prev,
        items: updatedItems
      }));
      
      // Wyczyść błędy walidacji dla tego produktu
      const updatedErrors = { ...validationErrors };
      delete updatedErrors[`item_${index}_name`];
      delete updatedErrors[`item_${index}_price`];
      setValidationErrors(updatedErrors);
    }
  };

  const addItem = () => {
    setOrderData(prev => ({
      ...prev,
      items: [...prev.items, { ...DEFAULT_ORDER.items[0] }]
    }));
  };

  const removeItem = (index) => {
    const updatedItems = [...orderData.items];
    updatedItems.splice(index, 1);
    
    // Zawsze musi być przynajmniej jeden produkt
    if (updatedItems.length === 0) {
      updatedItems.push({ ...DEFAULT_ORDER.items[0] });
    }
    
    setOrderData(prev => ({
      ...prev,
      items: updatedItems
    }));
    
    // Usuń błędy walidacji dla usuniętego produktu
    const updatedErrors = { ...validationErrors };
    delete updatedErrors[`item_${index}_name`];
    delete updatedErrors[`item_${index}_quantity`];
    delete updatedErrors[`item_${index}_price`];
    setValidationErrors(updatedErrors);
  };

  const calculateSubtotal = () => {
    return orderData.items.reduce((sum, item) => {
      const quantity = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.price) || 0;
      return sum + (quantity * price);
    }, 0);
  };

  const calculateTotal = () => {
    const subtotal = calculateSubtotal();
    const shippingCost = parseFloat(orderData.shippingCost) || 0;
    return subtotal + shippingCost;
  };

  // Funkcja do kalkulacji kosztów zamówienia
  const handleCalculateCosts = async () => {
    try {
      setCalculatingCosts(true);
      
      // Sprawdź, czy zamówienie ma produkty
      if (!orderData.items || orderData.items.length === 0) {
        showError('Zamówienie musi zawierać produkty, aby obliczyć koszty');
        setCalculatingCosts(false);
        return;
      }
      
      // Pobierz ID produktów
      const productIds = orderData.items.map(item => item.id).filter(Boolean);
      
      if (productIds.length === 0) {
        showError('Brak prawidłowych identyfikatorów produktów');
        setCalculatingCosts(false);
        return;
      }
      
      // Pobierz ceny produktów
      const pricesMap = await getIngredientPrices(productIds);
      
      // Oblicz koszty
      let totalCost = 0;
      let totalRevenue = 0;
      
      const itemsWithCosts = orderData.items.map(item => {
        const productPrice = pricesMap[item.id] || 0;
        const itemCost = productPrice * item.quantity;
        const itemRevenue = item.price * item.quantity;
        
        totalCost += itemCost;
        totalRevenue += itemRevenue;
        
        return {
          ...item,
          cost: itemCost,
          revenue: itemRevenue,
          profit: itemRevenue - itemCost,
          margin: itemCost > 0 ? ((itemRevenue - itemCost) / itemRevenue * 100) : 0
        };
      });
      
      setCostCalculation({
        items: itemsWithCosts,
        totalCost: totalCost,
        totalRevenue: totalRevenue,
        totalProfit: totalRevenue - totalCost,
        profitMargin: totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue * 100) : 0
      });
      
    } catch (error) {
      console.error('Błąd podczas kalkulacji kosztów:', error);
      showError('Nie udało się obliczyć kosztów: ' + error.message);
    } finally {
      setCalculatingCosts(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <>
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button 
            startIcon={<ArrowBackIcon />} 
            onClick={() => navigate('/orders')}
          >
            Powrót
          </Button>
          <Typography variant="h5">
            {orderId ? 'Edytuj zamówienie' : 'Nowe zamówienie'}
          </Typography>
          <Button 
            type="submit" 
            variant="contained" 
            color="primary"
            disabled={saving}
            startIcon={<SaveIcon />}
          >
            {saving ? 'Zapisywanie...' : 'Zapisz'}
          </Button>
        </Box>

        {orderData.orderNumber && (
          <Box sx={{ mb: 3, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
            <Typography variant="subtitle1" color="primary" fontWeight="bold">
              Numer zamówienia klienta: {orderData.orderNumber}
            </Typography>
          </Box>
        )}
        
        <Paper sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Dane podstawowe</Typography>
            <FormControl sx={{ minWidth: 200 }}>
              <InputLabel>Status zamówienia</InputLabel>
              <Select
                name="status"
                value={orderData.status}
                onChange={handleChange}
                label="Status zamówienia"
              >
                {ORDER_STATUSES.map(status => (
                  <MenuItem key={status.value} value={status.value}>
                    {status.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          
          <Divider sx={{ mb: 2 }} />
          
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                <FormControl fullWidth error={!!validationErrors.customerName}>
                  <Autocomplete
                    options={customers}
                    getOptionLabel={(customer) => customer.name || ''}
                    onChange={handleCustomerChange}
                    value={customers.find(c => c.id === orderData.customer.id) || null}
                    renderInput={(params) => (
                      <TextField 
                        {...params} 
                        label="Klient" 
                        required
                        error={!!validationErrors.customerName}
                        helperText={validationErrors.customerName}
                      />
                    )}
                  />
                </FormControl>
                <Tooltip title="Dodaj nowego klienta">
                  <IconButton 
                    color="primary" 
                    onClick={handleAddCustomer}
                    sx={{ ml: 1, mt: 1 }}
                  >
                    <AddIcon />
                  </IconButton>
                </Tooltip>
              </Box>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                type="date"
                label="Data zamówienia"
                name="orderDate"
                value={orderData.orderDate || ''}
                onChange={handleChange}
                fullWidth
                required
                InputLabelProps={{ shrink: true }}
                error={!!validationErrors.orderDate}
                helperText={validationErrors.orderDate}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                name="customer_email"
                label="Email klienta"
                value={orderData.customer.email || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                name="customer_phone"
                label="Telefon klienta"
                value={orderData.customer.phone || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                name="customer_address"
                label="Adres klienta"
                value={orderData.customer.address || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
                multiline
                rows={2}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                type="date"
                label="Oczekiwana data dostawy"
                name="expectedDeliveryDate"
                value={orderData.expectedDeliveryDate || ''}
                onChange={handleChange}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          </Grid>
        </Paper>

        {/* Produkty */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Produkty</Typography>
            <Button 
              variant="outlined" 
              startIcon={<AddIcon />} 
              onClick={addItem}
            >
              Dodaj produkt
            </Button>
          </Box>
          
          <Divider sx={{ mb: 2 }} />
          
          <Table>
            <TableHead>
              <TableRow>
                <TableCell width="40%">Produkt</TableCell>
                <TableCell width="15%">Ilość</TableCell>
                <TableCell width="15%">Jednostka</TableCell>
                <TableCell width="15%">Cena</TableCell>
                <TableCell width="15%">Wartość</TableCell>
                <TableCell width="10%"></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {orderData.items.map((item, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <Autocomplete
                      options={products}
                      getOptionLabel={(product) => product.name || ''}
                      onChange={(e, value) => handleProductSelect(index, value)}
                      value={products.find(p => p.id === item.id) || null}
                      renderInput={(params) => (
                        <TextField 
                          {...params} 
                          label="Produkt" 
                          required
                          error={!!validationErrors[`item_${index}_name`]}
                          helperText={validationErrors[`item_${index}_name`]}
                          fullWidth
                        />
                      )}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      type="number"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                      inputProps={{ min: 1 }}
                      fullWidth
                      error={!!validationErrors[`item_${index}_quantity`]}
                      helperText={validationErrors[`item_${index}_quantity`]}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      value={item.unit}
                      onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                      fullWidth
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      type="number"
                      value={item.price}
                      onChange={(e) => handleItemChange(index, 'price', e.target.value)}
                      InputProps={{
                        startAdornment: <InputAdornment position="start">PLN</InputAdornment>,
                      }}
                      inputProps={{ min: 0, step: 0.01 }}
                      fullWidth
                      error={!!validationErrors[`item_${index}_price`]}
                      helperText={validationErrors[`item_${index}_price`]}
                    />
                  </TableCell>
                  <TableCell>
                    {formatCurrency(item.quantity * item.price)}
                  </TableCell>
                  <TableCell>
                    <IconButton 
                      color="error" 
                      onClick={() => removeItem(index)}
                      disabled={orderData.items.length === 1}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
              Suma: {formatCurrency(calculateSubtotal())}
            </Typography>
          </Box>
        </Paper>

        {/* Płatność i dostawa */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Płatność i dostawa</Typography>
          <Divider sx={{ mb: 2 }} />
          
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Metoda płatności</InputLabel>
                <Select
                  name="paymentMethod"
                  value={orderData.paymentMethod || 'Przelew'}
                  onChange={handleChange}
                  label="Metoda płatności"
                >
                  {PAYMENT_METHODS.map(method => (
                    <MenuItem key={method.value} value={method.value}>
                      {method.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Status płatności</InputLabel>
                <Select
                  name="paymentStatus"
                  value={orderData.paymentStatus || 'Nieopłacone'}
                  onChange={handleChange}
                  label="Status płatności"
                >
                  <MenuItem value="Nieopłacone">Nieopłacone</MenuItem>
                  <MenuItem value="Opłacone częściowo">Opłacone częściowo</MenuItem>
                  <MenuItem value="Opłacone">Opłacone</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                name="shippingMethod"
                label="Metoda dostawy"
                value={orderData.shippingMethod || ''}
                onChange={handleChange}
                fullWidth
                placeholder="np. Kurier, Odbiór osobisty"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                name="shippingCost"
                label="Koszt dostawy"
                type="number"
                value={orderData.shippingCost || 0}
                onChange={handleChange}
                fullWidth
                InputProps={{
                  startAdornment: <InputAdornment position="start">PLN</InputAdornment>,
                }}
                inputProps={{ min: 0, step: 0.01 }}
              />
            </Grid>
          </Grid>
          
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3, alignItems: 'center' }}>
            <Typography variant="subtitle1" sx={{ mr: 2 }}>
              Koszt dostawy: {formatCurrency(parseFloat(orderData.shippingCost) || 0)}
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
              Razem: {formatCurrency(calculateTotal())}
            </Typography>
          </Box>
        </Paper>

        {/* Uwagi */}
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Uwagi</Typography>
          <TextField
            name="notes"
            value={orderData.notes || ''}
            onChange={handleChange}
            fullWidth
            multiline
            rows={4}
            placeholder="Dodatkowe informacje, uwagi..."
          />
        </Paper>

        {/* Sekcja kalkulacji kosztów */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Kalkulacja kosztów i rentowności</Typography>
            <Button
              variant="outlined"
              startIcon={<CalculateIcon />}
              onClick={handleCalculateCosts}
              disabled={calculatingCosts || orderData.items.length === 0}
            >
              {calculatingCosts ? 'Obliczanie...' : 'Oblicz rentowność'}
            </Button>
          </Box>
          
          {costCalculation && (
            <Box>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <Typography variant="subtitle2">Całkowity koszt:</Typography>
                  <Typography variant="body1">{costCalculation.totalCost.toFixed(2)} zł</Typography>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Typography variant="subtitle2">Całkowity przychód:</Typography>
                  <Typography variant="body1">{costCalculation.totalRevenue.toFixed(2)} zł</Typography>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Typography variant="subtitle2">Zysk:</Typography>
                  <Typography variant="body1" fontWeight="bold" color={costCalculation.totalProfit >= 0 ? "success.main" : "error.main"}>
                    {costCalculation.totalProfit.toFixed(2)} zł
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Typography variant="subtitle2">Marża zysku:</Typography>
                  <Typography variant="body1" fontWeight="bold" color={costCalculation.profitMargin >= 0 ? "success.main" : "error.main"}>
                    {costCalculation.profitMargin.toFixed(2)}%
                  </Typography>
                </Grid>
              </Grid>
              
              <Divider sx={{ my: 2 }} />
              
              <Typography variant="subtitle1" gutterBottom>Szczegóły produktów:</Typography>
              
              <Grid container spacing={2} sx={{ mt: 1 }}>
                <Grid item xs={12}>
                  <Box sx={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(224, 224, 224, 1)' }}>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Produkt</th>
                          <th style={{ padding: '8px', textAlign: 'right' }}>Ilość</th>
                          <th style={{ padding: '8px', textAlign: 'right' }}>Koszt jedn.</th>
                          <th style={{ padding: '8px', textAlign: 'right' }}>Cena jedn.</th>
                          <th style={{ padding: '8px', textAlign: 'right' }}>Koszt całk.</th>
                          <th style={{ padding: '8px', textAlign: 'right' }}>Przychód</th>
                          <th style={{ padding: '8px', textAlign: 'right' }}>Zysk</th>
                          <th style={{ padding: '8px', textAlign: 'right' }}>Marża</th>
                        </tr>
                      </thead>
                      <tbody>
                        {costCalculation.items.map((item, index) => {
                          const product = products.find(p => p.id === item.id) || {};
                          const unitCost = item.quantity > 0 ? (item.cost / item.quantity) : 0;
                          
                          return (
                            <tr key={index} style={{ borderBottom: '1px solid rgba(224, 224, 224, 0.5)' }}>
                              <td style={{ padding: '8px' }}>{product.name || item.name}</td>
                              <td style={{ padding: '8px', textAlign: 'right' }}>{item.quantity} {item.unit}</td>
                              <td style={{ padding: '8px', textAlign: 'right' }}>{unitCost.toFixed(2)} zł</td>
                              <td style={{ padding: '8px', textAlign: 'right' }}>{item.price.toFixed(2)} zł</td>
                              <td style={{ padding: '8px', textAlign: 'right' }}>{item.cost.toFixed(2)} zł</td>
                              <td style={{ padding: '8px', textAlign: 'right' }}>{item.revenue.toFixed(2)} zł</td>
                              <td style={{ padding: '8px', textAlign: 'right', color: item.profit >= 0 ? 'green' : 'red' }}>
                                {item.profit.toFixed(2)} zł
                              </td>
                              <td style={{ padding: '8px', textAlign: 'right', color: item.margin >= 0 ? 'green' : 'red' }}>
                                {item.margin.toFixed(2)}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </Box>
                </Grid>
              </Grid>
            </Box>
          )}
          
          {!costCalculation && (
            <Typography variant="body2" color="text.secondary">
              Kliknij "Oblicz rentowność", aby zobaczyć kalkulację kosztów i zysków dla tego zamówienia.
              Upewnij się, że zamówienie zawiera produkty z cenami.
            </Typography>
          )}
        </Paper>
      </Box>
      
      {/* Dialog dodawania nowego klienta */}
      <Dialog open={isCustomerDialogOpen} onClose={handleCloseCustomerDialog}>
        <DialogTitle>Dodaj nowego klienta</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Wprowadź dane nowego klienta. Klient zostanie dodany do bazy danych.
          </DialogContentText>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                name="customer_name"
                label="Nazwa klienta"
                value={orderData.customer.name || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
                required
                autoFocus
                margin="dense"
                error={!orderData.customer.name}
                helperText={!orderData.customer.name ? 'Nazwa klienta jest wymagana' : ''}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                name="customer_email"
                label="Email"
                value={orderData.customer.email || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
                margin="dense"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                name="customer_phone"
                label="Telefon"
                value={orderData.customer.phone || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
                margin="dense"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                name="customer_address"
                label="Adres"
                value={orderData.customer.address || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
                multiline
                rows={2}
                margin="dense"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseCustomerDialog}>Anuluj</Button>
          <Button 
            onClick={handleSaveNewCustomer} 
            variant="contained"
            disabled={!orderData.customer.name || saving}
          >
            {saving ? 'Zapisywanie...' : 'Zapisz'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default OrderForm; 