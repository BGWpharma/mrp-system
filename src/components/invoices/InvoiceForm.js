import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Paper,
  Grid,
  TextField,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Autocomplete
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Save as SaveIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Person as PersonIcon
} from '@mui/icons-material';
import { 
  createInvoice, 
  getInvoiceById, 
  updateInvoice, 
  DEFAULT_INVOICE,
  calculateInvoiceTotal
} from '../../services/invoiceService';
import { getAllCustomers, getCustomerById } from '../../services/customerService';
import { getAllOrders } from '../../services/orderService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import plLocale from 'date-fns/locale/pl';
import { formatDateForInput } from '../../utils/dateUtils';
import { COMPANY_INFO } from '../../config';
import { getCompanyInfo } from '../../services/companyService';

const InvoiceForm = ({ invoiceId }) => {
  const [searchParams] = useSearchParams();
  const customerId = searchParams.get('customerId');
  const [invoice, setInvoice] = useState({ ...DEFAULT_INVOICE });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [customerDialogOpen, setCustomerDialogOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [redirectToList, setRedirectToList] = useState(false);
  const [companyInfo, setCompanyInfo] = useState(COMPANY_INFO);

  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const navigate = useNavigate();

  useEffect(() => {
    const init = async () => {
      // Pobierz dane klientów
      fetchCustomers();
      fetchOrders();
      
      // Pobierz dane firmy
      try {
        const companyData = await getCompanyInfo();
        setCompanyInfo(companyData);
      } catch (error) {
        console.error('Błąd podczas pobierania danych firmy:', error);
      }
      
      // Jeśli mamy ID faktury, pobierz jej dane
      if (invoiceId) {
        await fetchInvoice(invoiceId);
      } 
      // Jeśli mamy customerId w URL, wybierz tego klienta
      else if (customerId) {
        await handleCustomerSelect(customerId);
      }
    };
    
    init();
  }, [invoiceId, customerId]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Efekt do filtrowania zamówień po wyborze klienta
  useEffect(() => {
    if (invoice.customer?.id) {
      const filtered = orders.filter(order => order.customer.id === invoice.customer.id);
      setFilteredOrders(filtered);
    } else {
      setFilteredOrders([]);
    }
  }, [invoice.customer?.id, orders]);

  const fetchInvoice = async (id) => {
    setLoading(true);
    try {
      const fetchedInvoice = await getInvoiceById(id);
      setInvoice(fetchedInvoice);

      // Ustaw wartości wybrane w formularzach
      if (fetchedInvoice.customer?.id) {
        setSelectedCustomerId(fetchedInvoice.customer.id);
      }
      
      if (fetchedInvoice.orderId) {
        setSelectedOrderId(fetchedInvoice.orderId);
      }
    } catch (error) {
      showError('Błąd podczas pobierania danych faktury: ' + error.message);
      navigate('/invoices');
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    setCustomersLoading(true);
    try {
      const fetchedCustomers = await getAllCustomers();
      setCustomers(fetchedCustomers);
    } catch (error) {
      showError('Błąd podczas pobierania listy klientów: ' + error.message);
    } finally {
      setCustomersLoading(false);
    }
  };

  const fetchOrders = async () => {
    setOrdersLoading(true);
    try {
      const fetchedOrders = await getAllOrders();
      setOrders(fetchedOrders);
    } catch (error) {
      showError('Błąd podczas pobierania listy zamówień: ' + error.message);
    } finally {
      setOrdersLoading(false);
    }
  };

  const fetchCustomerOrders = (customerId) => {
    if (!customerId) return;
    
    // Filtrowanie zamówień dla wybranego klienta
    const customerOrders = orders.filter(order => order.customer?.id === customerId);
    setFilteredOrders(customerOrders);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setInvoice(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleDateChange = (name, value) => {
    setInvoice(prev => ({
      ...prev,
      [name]: value ? formatDateForInput(value) : null
    }));
  };

  const handleItemChange = (index, field, value) => {
    const updatedItems = [...invoice.items];
    
    // Upewnij się, że wartość VAT jest liczbą
    if (field === 'vat') {
      value = parseInt(value) || 0;
    }
    
    // Upewnij się, że quantity i price są liczbami
    if (field === 'quantity' || field === 'price') {
      value = parseFloat(value) || 0;
    }
    
    updatedItems[index] = {
      ...updatedItems[index],
      [field]: value
    };
    
    setInvoice(prev => ({
      ...prev,
      items: updatedItems,
      total: calculateInvoiceTotal(updatedItems)
    }));
  };

  const handleAddItem = () => {
    const newItem = {
      id: '',
      name: '',
      description: '',
      quantity: 1,
      unit: 'szt.',
      price: 0,
      vat: 23
    };
    
    setInvoice(prev => ({
      ...prev,
      items: [...prev.items, newItem]
    }));
  };

  const handleRemoveItem = (index) => {
    const updatedItems = [...invoice.items];
    updatedItems.splice(index, 1);
    
    setInvoice(prev => ({
      ...prev,
      items: updatedItems,
      total: calculateInvoiceTotal(updatedItems)
    }));
  };

  const handleCustomerSelect = (customerId) => {
    setSelectedCustomerId(null);
    setCustomerDialogOpen(false);
    
    if (!customerId) {
      setInvoice(prev => ({
        ...prev,
        customer: null,
        billingAddress: '',
        shippingAddress: ''
      }));
      return;
    }
    
    const selectedCustomer = customers.find(c => c.id === customerId);
    if (selectedCustomer) {
      setInvoice(prev => ({
        ...prev,
        customer: {
          id: selectedCustomer.id,
          name: selectedCustomer.name,
          email: selectedCustomer.email,
          phone: selectedCustomer.phone,
          address: selectedCustomer.address || '',
          vatEu: selectedCustomer.vatEu || '',
          billingAddress: selectedCustomer.billingAddress || selectedCustomer.address || '',
          shippingAddress: selectedCustomer.shippingAddress || selectedCustomer.address || ''
        },
        billingAddress: selectedCustomer.billingAddress || selectedCustomer.address || '',
        shippingAddress: selectedCustomer.shippingAddress || selectedCustomer.address || ''
      }));
      
      // Pobierz zamówienia klienta, jeśli klient jest wybrany
      fetchCustomerOrders(selectedCustomer.id);
    }
  };

  const handleOrderSelect = async (orderId) => {
    if (!orderId) {
      setSelectedOrderId('');
      return;
    }

    const selectedOrder = orders.find(order => order.id === orderId);
    if (!selectedOrder) return;

    // Zachowujemy bieżące dane faktury i aktualizujemy tylko pola związane z zamówieniem
    setInvoice(prev => {
      // Zachowujemy obecne pozycje, jeśli lista jest pusta w zamówieniu
      const updatedItems = selectedOrder.items && selectedOrder.items.length > 0 
        ? selectedOrder.items 
        : prev.items;
        
      return {
        ...prev,
        orderId: selectedOrder.id,
        orderNumber: selectedOrder.orderNumber,
        // Aktualizujemy pozycje tylko jeśli są dostępne w zamówieniu
        items: updatedItems,
        // Zachowujemy bieżącego klienta, jeśli już jest wybrany
        // W przeciwnym razie używamy klienta z zamówienia
        customer: prev.customer?.id ? prev.customer : selectedOrder.customer,
        // Podobnie dla adresów - zachowujemy istniejące adresy, jeśli są
        billingAddress: prev.billingAddress || selectedOrder.customer?.billingAddress || selectedOrder.customer?.address || '',
        shippingAddress: prev.shippingAddress || selectedOrder.shippingAddress || selectedOrder.customer?.shippingAddress || selectedOrder.customer?.address || '',
        // Aktualizujemy łączną kwotę na podstawie pozycji
        total: calculateInvoiceTotal(updatedItems)
      };
    });
    
    setSelectedOrderId(orderId);
    
    // Aktualizujemy ID klienta tylko jeśli nie był wcześniej wybrany
    if (!selectedCustomerId && selectedOrder.customer?.id) {
      setSelectedCustomerId(selectedOrder.customer.id);
    }
  };

  const validateForm = () => {
    // Sprawdź czy klient jest wybrany
    if (!invoice.customer?.id) {
      showError('Wybierz klienta dla faktury');
      return false;
    }
    
    // Sprawdź czy są pozycje faktury
    if (!invoice.items || invoice.items.length === 0) {
      showError('Dodaj przynajmniej jedną pozycję do faktury');
      return false;
    }
    
    // Sprawdź czy wszystkie pozycje mają uzupełnione dane
    const invalidItems = invoice.items.some(item => 
      !item.name || 
      isNaN(item.quantity) || 
      item.quantity <= 0 || 
      isNaN(item.price) || 
      item.price < 0
    );
    
    if (invalidItems) {
      showError('Uzupełnij prawidłowo wszystkie pozycje faktury');
      return false;
    }
    
    // Sprawdź daty
    if (!invoice.issueDate) {
      showError('Uzupełnij datę wystawienia faktury');
      return false;
    }
    
    if (!invoice.dueDate) {
      showError('Uzupełnij termin płatności');
      return false;
    }
    
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setSaving(true);
    
    try {
      // Przygotuj dane faktury
      const invoiceData = {
        ...invoice,
        // Ustaw dane sprzedawcy z pobranych danych
        seller: {
          name: companyInfo.name,
          address: companyInfo.address,
          city: companyInfo.city,
          nip: companyInfo.nip,
          regon: companyInfo.regon,
          email: companyInfo.email,
          phone: companyInfo.phone,
          bankName: companyInfo.bankName,
          bankAccount: companyInfo.bankAccount
        }
      };
      
      if (invoiceId) {
        // Aktualizacja istniejącej faktury
        await updateInvoice(invoiceId, invoiceData, currentUser.uid);
        showSuccess('Faktura została zaktualizowana');
      } else {
        // Tworzenie nowej faktury
        const newInvoiceId = await createInvoice(invoiceData, currentUser.uid);
        showSuccess('Faktura została utworzona');
        
        if (redirectToList) {
          navigate('/invoices');
        } else {
          navigate(`/invoices/${newInvoiceId}`);
        }
      }
    } catch (error) {
      console.error('Błąd podczas zapisywania faktury:', error);
      showError('Nie udało się zapisać faktury: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Button
          variant="outlined"
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/invoices')}
        >
          Powrót do listy faktur
        </Button>
        <Typography variant="h4" component="h1">
          {invoiceId ? 'Edycja faktury' : 'Nowa faktura'}
        </Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<SaveIcon />}
          onClick={handleSubmit}
          disabled={saving}
        >
          {saving ? 'Zapisywanie...' : 'Zapisz fakturę'}
        </Button>
      </Box>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Dane podstawowe
        </Typography>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Numer faktury"
                  name="number"
                  value={invoice.number}
                  onChange={handleChange}
                  disabled={invoiceId !== undefined}
                  helperText={invoiceId ? 'Numer faktury nie może być zmieniony' : 'Zostanie wygenerowany automatycznie jeśli pozostawisz to pole puste'}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={plLocale}>
                  <DatePicker
                    label="Data wystawienia"
                    value={invoice.issueDate ? new Date(invoice.issueDate) : null}
                    onChange={(date) => handleDateChange('issueDate', date)}
                    slotProps={{ textField: { fullWidth: true } }}
                  />
                </LocalizationProvider>
              </Grid>
              <Grid item xs={12} sm={6}>
                <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={plLocale}>
                  <DatePicker
                    label="Termin płatności"
                    value={invoice.dueDate ? new Date(invoice.dueDate) : null}
                    onChange={(date) => handleDateChange('dueDate', date)}
                    slotProps={{ textField: { fullWidth: true } }}
                  />
                </LocalizationProvider>
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Status faktury</InputLabel>
                  <Select
                    name="status"
                    value={invoice.status}
                    onChange={handleChange}
                    label="Status faktury"
                  >
                    <MenuItem value="draft">Szkic</MenuItem>
                    <MenuItem value="issued">Wystawiona</MenuItem>
                    <MenuItem value="sent">Wysłana</MenuItem>
                    <MenuItem value="paid">Opłacona</MenuItem>
                    <MenuItem value="overdue">Przeterminowana</MenuItem>
                    <MenuItem value="cancelled">Anulowana</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Metoda płatności</InputLabel>
                  <Select
                    name="paymentMethod"
                    value={invoice.paymentMethod}
                    onChange={handleChange}
                    label="Metoda płatności"
                  >
                    <MenuItem value="Przelew">Przelew</MenuItem>
                    <MenuItem value="Gotówka">Gotówka</MenuItem>
                    <MenuItem value="Karta">Karta płatnicza</MenuItem>
                    <MenuItem value="BLIK">BLIK</MenuItem>
                    <MenuItem value="Za pobraniem">Za pobraniem</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Waluta</InputLabel>
                  <Select
                    name="currency"
                    value={invoice.currency || 'EUR'}
                    onChange={handleChange}
                    label="Waluta"
                  >
                    <MenuItem value="EUR">EUR - Euro</MenuItem>
                    <MenuItem value="PLN">PLN - Polski złoty</MenuItem>
                    <MenuItem value="USD">USD - Dolar amerykański</MenuItem>
                    <MenuItem value="GBP">GBP - Funt brytyjski</MenuItem>
                    <MenuItem value="CHF">CHF - Frank szwajcarski</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </Grid>
          <Grid item xs={12} md={6}>
            <Card variant="outlined" sx={{ height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="subtitle1">
                    Klient
                  </Typography>
                  <Button
                    variant="outlined"
                    startIcon={<PersonIcon />}
                    onClick={() => setCustomerDialogOpen(true)}
                    size="small"
                  >
                    Wybierz klienta
                  </Button>
                </Box>
                
                {invoice.customer?.id ? (
                  <Box>
                    <Typography variant="body1" fontWeight="bold" gutterBottom>
                      {invoice.customer.name}
                    </Typography>
                    {invoice.customer?.email && (
                      <Typography variant="body2" gutterBottom>
                        Email: {invoice.customer.email}
                      </Typography>
                    )}
                    {invoice.customer?.phone && (
                      <Typography variant="body2" gutterBottom>
                        Telefon: {invoice.customer.phone}
                      </Typography>
                    )}
                    {invoice.customer?.vatEu && (
                      <Typography variant="body2" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                        VAT-EU: {invoice.customer.vatEu}
                      </Typography>
                    )}
                    {invoice.billingAddress && (
                      <Typography variant="body2" gutterBottom>
                        Adres do faktury: {invoice.billingAddress}
                      </Typography>
                    )}
                    {invoice.shippingAddress && (
                      <Typography variant="body2" gutterBottom>
                        Adres dostawy: {invoice.shippingAddress}
                      </Typography>
                    )}
                    
                    <Divider sx={{ my: 2 }} />
                    
                    <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                      <InputLabel>Powiązane zamówienie</InputLabel>
                      <Select
                        value={selectedOrderId}
                        onChange={(e) => handleOrderSelect(e.target.value)}
                        label="Powiązane zamówienie"
                        disabled={filteredOrders.length === 0 || ordersLoading}
                      >
                        <MenuItem value="">Brak powiązanego zamówienia</MenuItem>
                        {filteredOrders.map(order => (
                          <MenuItem key={order.id} value={order.id}>
                            {order.orderNumber || order.id} - {new Date(order.orderDate).toLocaleDateString()}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    
                    {selectedOrderId && (
                      <Typography variant="body2" color="primary">
                        Faktura powiązana z zamówieniem {invoice.orderNumber || selectedOrderId}
                      </Typography>
                    )}
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    Nie wybrano klienta. Kliknij przycisk powyżej, aby wybrać klienta dla tej faktury.
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            Pozycje faktury
          </Typography>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={handleAddItem}
          >
            Dodaj pozycję
          </Button>
        </Box>

        {invoice.items.map((item, index) => (
          <Card key={index} variant="outlined" sx={{ mb: 2, p: 2 }}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Nazwa towaru/usługi"
                  value={item.name}
                  onChange={(e) => handleItemChange(index, 'name', e.target.value)}
                  required
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Opis"
                  value={item.description || ''}
                  onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                />
              </Grid>
              <Grid item xs={6} sm={2}>
                <TextField
                  fullWidth
                  label="Ilość"
                  type="number"
                  value={item.quantity}
                  onChange={(e) => handleItemChange(index, 'quantity', parseFloat(e.target.value))}
                  required
                  inputProps={{ min: 0, step: 0.01 }}
                />
              </Grid>
              <Grid item xs={6} sm={2}>
                <TextField
                  fullWidth
                  label="Jednostka"
                  value={item.unit}
                  onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                  required
                />
              </Grid>
              <Grid item xs={6} sm={2}>
                <TextField
                  fullWidth
                  label="Cena netto"
                  type="number"
                  value={item.price}
                  onChange={(e) => handleItemChange(index, 'price', parseFloat(e.target.value))}
                  required
                  inputProps={{ min: 0, step: 0.01 }}
                />
              </Grid>
              <Grid item xs={6} sm={2}>
                <FormControl fullWidth>
                  <InputLabel>VAT %</InputLabel>
                  <Select
                    value={item.vat || 23}
                    onChange={(e) => handleItemChange(index, 'vat', parseInt(e.target.value))}
                    label="VAT %"
                  >
                    <MenuItem value={0}>0%</MenuItem>
                    <MenuItem value={5}>5%</MenuItem>
                    <MenuItem value={8}>8%</MenuItem>
                    <MenuItem value={23}>23%</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="body1" fontWeight="bold">
                  Wartość netto: {(item.quantity * item.price).toFixed(2)} {invoice.currency || 'zł'}
                </Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="body1" fontWeight="bold">
                  Wartość brutto: {(item.quantity * item.price * (1 + (item.vat || 23) / 100)).toFixed(2)} {invoice.currency || 'zł'}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <IconButton
                  color="error"
                  onClick={() => handleRemoveItem(index)}
                  disabled={invoice.items.length <= 1}
                  title="Usuń pozycję"
                >
                  <DeleteIcon />
                </IconButton>
              </Grid>
            </Grid>
          </Card>
        ))}

        <Divider sx={{ my: 3 }} />

        <Grid container spacing={2} justifyContent="flex-end">
          <Grid item xs={12} sm={6} md={4}>
            <Typography variant="body1" fontWeight="bold">
              Razem netto: {invoice.items.reduce((sum, item) => {
                const quantity = Number(item.quantity) || 0;
                const price = Number(item.price) || 0;
                return sum + (quantity * price);
              }, 0).toFixed(2)} {invoice.currency || 'zł'}
            </Typography>
            <Typography variant="body1" fontWeight="bold">
              Razem VAT: {invoice.items.reduce((sum, item) => {
                const quantity = Number(item.quantity) || 0;
                const price = Number(item.price) || 0;
                const vat = Number(item.vat) || 0;
                return sum + (quantity * price * (vat / 100));
              }, 0).toFixed(2)} {invoice.currency || 'zł'}
            </Typography>
            <Typography variant="h6" fontWeight="bold" color="primary">
              Razem brutto: {invoice.items.reduce((sum, item) => {
                const quantity = Number(item.quantity) || 0;
                const price = Number(item.price) || 0;
                const vat = Number(item.vat) || 0;
                return sum + (quantity * price * (1 + vat / 100));
              }, 0).toFixed(2)} {invoice.currency || 'zł'}
            </Typography>
          </Grid>
        </Grid>
      </Paper>
      
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Dodatkowe informacje
        </Typography>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <TextField
              fullWidth
              multiline
              rows={4}
              label="Uwagi"
              name="notes"
              value={invoice.notes || ''}
              onChange={handleChange}
            />
          </Grid>
        </Grid>
      </Paper>

      {/* Dialog wyboru klienta */}
      <Dialog open={customerDialogOpen} onClose={() => setCustomerDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Wybierz klienta</DialogTitle>
        <DialogContent>
          <Autocomplete
            options={customers}
            getOptionLabel={(option) => option.name}
            loading={customersLoading}
            value={customers.find(c => c.id === selectedCustomerId) || null}
            onChange={(e, newValue) => {
              if (newValue) {
                setSelectedCustomerId(newValue.id);
              } else {
                setSelectedCustomerId('');
              }
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Wyszukaj klienta"
                fullWidth
                margin="normal"
                variant="outlined"
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {customersLoading && <CircularProgress color="inherit" size={20} />}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
          />
          
          {!customersLoading && customers.length === 0 && (
            <Typography variant="body1" align="center" sx={{ mt: 2 }}>
              Brak klientów. Dodaj klientów w module zarządzania klientami.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCustomerDialogOpen(false)}>Anuluj</Button>
          <Button 
            variant="contained"
            onClick={() => navigate('/customers')}
          >
            Zarządzaj klientami
          </Button>
          <Button 
            variant="contained"
            color="primary"
            onClick={() => handleCustomerSelect(selectedCustomerId)}
            disabled={!selectedCustomerId}
          >
            Wybierz
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default InvoiceForm; 