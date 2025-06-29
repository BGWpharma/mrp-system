import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Typography,
  Paper,
  Box,
  Tabs,
  Tab,
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Divider,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  ArrowBack as ArrowBackIcon,
  Email as EmailIcon,
  Phone as PhoneIcon,
  Receipt as ReceiptIcon,
  ShoppingCart as OrderIcon,
  Add as AddIcon
} from '@mui/icons-material';
import { getCustomerById } from '../../services/customerService';
import { getCustomerOrders } from '../../services/orderService';
import { useNotification } from '../../hooks/useNotification';
import { useAuth } from '../../hooks/useAuth';
import CustomerForm from './CustomerForm';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { getInvoicesByCustomerId } from '../../services/invoiceService';

// Funkcja formatująca datę
const formatDate = (dateValue) => {
  if (!dateValue) return '-';
  try {
    let date;
    if (typeof dateValue === 'object' && typeof dateValue.toDate === 'function') {
      date = dateValue.toDate(); // Firestore Timestamp
    } else if (typeof dateValue === 'string') {
      date = new Date(dateValue);
    } else if (dateValue instanceof Date) {
      date = dateValue;
    } else {
      return String(dateValue);
    }
    
    // Sprawdź czy data jest prawidłowa
    if (isNaN(date.getTime())) {
      console.warn('Nieprawidłowy format daty w CustomerDetail:', dateValue);
      return '-';
    }
    
    return format(date, 'dd.MM.yyyy', { locale: pl });
  } catch (error) {
    console.error('Błąd formatowania daty w CustomerDetail:', error, dateValue);
    return '-';
  }
};

// Funkcja formatująca kwotę
const formatCurrency = (amount, currency = 'EUR') => {
  return new Intl.NumberFormat('pl-PL', { 
    style: 'currency', 
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount || 0);
};

// Komponent CustomerDetail
const CustomerDetail = () => {
  const { customerId } = useParams();
  const navigate = useNavigate();
  const { showSuccess, showError } = useNotification();
  const { currentUser } = useAuth();
  
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tabValue, setTabValue] = useState(0);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [orders, setOrders] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  
  // Pobierz dane klienta
  useEffect(() => {
    const fetchCustomerData = async () => {
      try {
        setLoading(true);
        const customerData = await getCustomerById(customerId);
        setCustomer(customerData);
      } catch (error) {
        console.error('Błąd podczas pobierania danych klienta:', error);
        showError('Nie udało się pobrać danych klienta');
        navigate('/customers');
      } finally {
        setLoading(false);
      }
    };
    
    fetchCustomerData();
  }, [customerId, navigate, showError]);
  
  // Obsługa zmiany zakładki
  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
    
    // Pobierz dane zamówień lub faktur przy pierwszym przejściu do zakładki
    if (newValue === 1 && orders.length === 0) {
      fetchOrders();
    } else if (newValue === 2 && invoices.length === 0) {
      fetchInvoices();
    }
  };
  
  // Pobierz zamówienia klienta
  const fetchOrders = async () => {
    try {
      setOrdersLoading(true);
      // Pobierz rzeczywiste zamówienia klienta
      const customerOrders = await getCustomerOrders(customerId);
      setOrders(customerOrders);
      setOrdersLoading(false);
    } catch (error) {
      console.error('Błąd podczas pobierania zamówień:', error);
      showError('Nie udało się pobrać zamówień klienta');
      setOrdersLoading(false);
    }
  };
  
  // Pobierz faktury klienta
  const fetchInvoices = async () => {
    try {
      setInvoicesLoading(true);
      // Pobierz faktury klienta z nowego serwisu
      const customerInvoices = await getInvoicesByCustomerId(customerId);
      setInvoices(customerInvoices);
      setInvoicesLoading(false);
    } catch (error) {
      console.error('Błąd podczas pobierania faktur:', error);
      showError('Nie udało się pobrać faktur klienta');
      setInvoicesLoading(false);
    }
  };
  
  // Otwórz formularz edycji klienta
  const handleEditClick = () => {
    setEditDialogOpen(true);
  };
  
  // Obsługa sukcesu edycji klienta
  const handleEditSuccess = async () => {
    try {
      setLoading(true);
      setEditDialogOpen(false);
      const updatedCustomer = await getCustomerById(customerId);
      setCustomer(updatedCustomer);
      showSuccess('Dane klienta zostały zaktualizowane');
    } catch (error) {
      console.error('Błąd podczas odświeżania danych klienta:', error);
      showError('Nie udało się odświeżyć danych klienta');
    } finally {
      setLoading(false);
    }
  };
  
  // Przejdź do tworzenia nowego zamówienia dla klienta
  const handleCreateOrder = () => {
    navigate('/orders/new', { state: { customerId } });
  };
  
  // Przejdź do formularza tworzenia faktury dla wybranego klienta
  const handleCreateInvoice = () => {
    navigate(`/invoices/new?customerId=${customerId}`);
  };
  
  // Renderowanie statusu zamówienia
  const renderOrderStatus = (status) => {
    const statusConfig = {
      'draft': { color: '#757575', label: 'Szkic' },
      'pending': { color: '#ff9800', label: 'Oczekujące' },
      'in_progress': { color: '#2196f3', label: 'W realizacji' },
      'completed': { color: '#4caf50', label: 'Zrealizowane' },
      'cancelled': { color: '#f44336', label: 'Anulowane' }
    };
    
    const config = statusConfig[status] || { color: '#757575', label: status };
    
    return (
      <Chip 
        label={config.label} 
        size="small"
        sx={{
          backgroundColor: config.color,
          color: 'white'
        }}
      />
    );
  };
  
  // Renderowanie statusu faktury
  const renderPaymentStatus = (paymentStatus) => {
    const statusConfig = {
      'unpaid': { color: '#ff9800', label: 'Nieopłacona' },
      'partially_paid': { color: '#ff5722', label: 'Częściowo opłacona' },
      'paid': { color: '#4caf50', label: 'Opłacona' }
    };
    
    const status = paymentStatus || 'unpaid';
    const config = statusConfig[status] || { color: '#757575', label: status };
    
    return (
      <Chip 
        label={config.label} 
        size="small"
        sx={{
          backgroundColor: config.color,
          color: 'white'
        }}
      />
    );
  };
  
  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }
  
  if (!customer) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h5">Nie znaleziono klienta</Typography>
          <Button 
            variant="contained" 
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/customers')}
            sx={{ mt: 2 }}
          >
            Powrót do listy klientów
          </Button>
        </Paper>
      </Container>
    );
  }
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      {/* Nagłówek */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Button 
            variant="outlined" 
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate('/customers')}
            sx={{ mr: 2 }}
          >
            Powrót
          </Button>
          <Typography variant="h4" component="h1">
            {customer.name}
          </Typography>
        </Box>
        <Button
          variant="outlined"
          color="primary"
          startIcon={<EditIcon />}
          onClick={handleEditClick}
        >
          Edytuj
        </Button>
      </Box>
      
      {/* Dane klienta */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle1" gutterBottom>Informacje kontaktowe</Typography>
            <Box sx={{ ml: 2 }}>
              {customer.email && (
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <EmailIcon sx={{ mr: 1, color: 'text.secondary', fontSize: 20 }} />
                  <Typography variant="body1">
                    {customer.email}
                  </Typography>
                </Box>
              )}
              {customer.phone && (
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <PhoneIcon sx={{ mr: 1, color: 'text.secondary', fontSize: 20 }} />
                  <Typography variant="body1">
                    {customer.phone}
                  </Typography>
                </Box>
              )}
              {customer.vatEu && (
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <Typography variant="body2" sx={{ mr: 1, color: 'text.secondary' }}>
                    VAT-EU:
                  </Typography>
                  <Typography variant="body1">
                    {customer.vatEu}
                  </Typography>
                </Box>
              )}
            </Box>
          </Grid>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle1" gutterBottom>Adresy</Typography>
            <Box sx={{ ml: 2 }}>
              {customer.billingAddress && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    Adres do faktury:
                  </Typography>
                  <Typography variant="body1" sx={{ whiteSpace: 'pre-line' }}>
                    {customer.billingAddress}
                  </Typography>
                </Box>
              )}
              {customer.shippingAddress && (
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Adres do wysyłki:
                  </Typography>
                  <Typography variant="body1" sx={{ whiteSpace: 'pre-line' }}>
                    {customer.shippingAddress}
                  </Typography>
                </Box>
              )}
              {!customer.billingAddress && !customer.shippingAddress && customer.address && (
                <Box>
                  <Typography variant="body2" color="text.secondary">
                    Adres:
                  </Typography>
                  <Typography variant="body1" sx={{ whiteSpace: 'pre-line' }}>
                    {customer.address}
                  </Typography>
                </Box>
              )}
            </Box>
          </Grid>
          {customer.notes && (
            <Grid item xs={12}>
              <Divider sx={{ my: 1 }} />
              <Typography variant="subtitle1" gutterBottom>Notatki</Typography>
              <Typography variant="body1" sx={{ whiteSpace: 'pre-line', ml: 2 }}>
                {customer.notes}
              </Typography>
            </Grid>
          )}
        </Grid>
      </Paper>
      
      {/* Zakładki zamówień i faktur */}
      <Paper sx={{ mb: 3 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs 
            value={tabValue} 
            onChange={handleTabChange} 
            aria-label="customer tabs"
          >
            <Tab label="Szczegóły" />
            <Tab label="Zamówienia" />
            <Tab label="Faktury" />
          </Tabs>
        </Box>
        
        {/* Zawartość zakładki szczegółów */}
        <Box role="tabpanel" hidden={tabValue !== 0} sx={{ p: 3 }}>
          {tabValue === 0 && (
            <Box>
              <Typography variant="subtitle1" gutterBottom>Dane klienta</Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={4}>
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      Data utworzenia:
                    </Typography>
                    <Typography variant="body1">
                      {customer.createdAt ? formatDate(customer.createdAt) : '-'}
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                      Ostatnia aktualizacja:
                    </Typography>
                    <Typography variant="body1">
                      {customer.updatedAt ? formatDate(customer.updatedAt) : '-'}
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </Box>
          )}
        </Box>
        
        {/* Zawartość zakładki zamówień */}
        <Box role="tabpanel" hidden={tabValue !== 1} sx={{ p: 3 }}>
          {tabValue === 1 && (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="subtitle1">Zamówienia klienta</Typography>
                <Box>
                  <Button 
                    variant="outlined"
                    color="primary"
                    startIcon={<OrderIcon />}
                    onClick={() => navigate('/orders', { state: { customerId: customer.id, customerName: customer.name } })}
                    sx={{ mr: 1 }}
                  >
                    Wszystkie zamówienia
                  </Button>
                  <Button 
                    variant="contained" 
                    color="primary" 
                    startIcon={<AddIcon />}
                    onClick={handleCreateOrder}
                  >
                    Nowe zamówienie
                  </Button>
                </Box>
              </Box>
              
              {ordersLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                  <CircularProgress />
                </Box>
              ) : orders.length === 0 ? (
                <Typography variant="body1" sx={{ textAlign: 'center', py: 3 }}>
                  Brak zamówień dla tego klienta
                </Typography>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Nr zamówienia</TableCell>
                        <TableCell>Data</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell align="right">Wartość</TableCell>
                        <TableCell align="right">Akcje</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {orders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell>{order.orderNumber || `#${order.id.substring(0, 8).toUpperCase()}`}</TableCell>
                          <TableCell>{order.orderDate ? formatDate(order.orderDate) : '-'}</TableCell>
                          <TableCell>{renderOrderStatus(order.status)}</TableCell>
                          <TableCell align="right">{formatCurrency(order.totalValue || order.total, 'PLN')}</TableCell>
                          <TableCell align="right">
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => navigate(`/orders/${order.id}`)}
                            >
                              Szczegóły
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>
          )}
        </Box>
        
        {/* Zawartość zakładki faktur */}
        <Box role="tabpanel" hidden={tabValue !== 2} sx={{ p: 3 }}>
          {tabValue === 2 && (
            <Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="subtitle1">Faktury klienta</Typography>
                <Button 
                  variant="contained" 
                  color="primary" 
                  startIcon={<AddIcon />}
                  onClick={handleCreateInvoice}
                >
                  Nowa faktura
                </Button>
              </Box>
              
              {invoicesLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                  <CircularProgress />
                </Box>
              ) : invoices.length === 0 ? (
                <Typography variant="body1" sx={{ textAlign: 'center', py: 3 }}>
                  Brak faktur dla tego klienta
                </Typography>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Nr faktury</TableCell>
                        <TableCell>Data wystawienia</TableCell>
                        <TableCell>Termin płatności</TableCell>
                        <TableCell>Status płatności</TableCell>
                        <TableCell align="right">Kwota</TableCell>
                        <TableCell align="right">Akcje</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {invoices.map((invoice) => (
                        <TableRow key={invoice.id}>
                          <TableCell>{invoice.number}</TableCell>
                          <TableCell>{invoice.issueDate ? formatDate(invoice.issueDate) : '-'}</TableCell>
                          <TableCell>{invoice.dueDate ? formatDate(invoice.dueDate) : '-'}</TableCell>
                          <TableCell>{renderPaymentStatus(invoice.paymentStatus)}</TableCell>
                          <TableCell align="right">{formatCurrency(invoice.total, invoice.currency)}</TableCell>
                          <TableCell align="right">
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => navigate(`/invoices/${invoice.id}`)}
                            >
                              Szczegóły
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>
          )}
        </Box>
      </Paper>
      
      {/* Dialog edycji klienta */}
      <Dialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Edytuj dane klienta</DialogTitle>
        <DialogContent>
          <CustomerForm
            customer={customer}
            onSubmitSuccess={handleEditSuccess}
            onCancel={() => setEditDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </Container>
  );
};

export default CustomerDetail; 