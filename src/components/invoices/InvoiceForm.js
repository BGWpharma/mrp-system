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
  createInvoiceFromOrder,
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
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [purchaseOrdersLoading, setPurchaseOrdersLoading] = useState(false);
  const [selectedOrderType, setSelectedOrderType] = useState('customer');
  const [selectedOrder, setSelectedOrder] = useState(null);

  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const navigate = useNavigate();

  useEffect(() => {
    const init = async () => {
      // Pobierz dane klientów
      fetchCustomers();
      fetchOrders();
      fetchPurchaseOrders();
      
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
      // Upewnij się, że daty są poprawnie obsługiwane
      const ordersWithFormattedDates = fetchedOrders.map(order => {
        // Sprawdź czy data istnieje i jest w poprawnym formacie
        let formattedDate = null;
        if (order.orderDate) {
          try {
            formattedDate = new Date(order.orderDate);
            // Jeśli data jest nieprawidłowa (Invalid Date), ustawiam na null
            if (isNaN(formattedDate.getTime())) {
              formattedDate = null;
              console.warn(`Nieprawidłowa data w zamówieniu ${order.orderNumber || order.id}`);
            }
          } catch (e) {
            formattedDate = null;
            console.error(`Błąd parsowania daty dla zamówienia ${order.orderNumber || order.id}`, e);
          }
        }
        
        return {
          ...order,
          orderDate: formattedDate
        };
      });
      
      setOrders(ordersWithFormattedDates);
    } catch (error) {
      showError('Błąd podczas pobierania listy zamówień: ' + error.message);
    } finally {
      setOrdersLoading(false);
    }
  };

  const fetchPurchaseOrders = async () => {
    setPurchaseOrdersLoading(true);
    try {
      const { getAllPurchaseOrders } = await import('../../services/purchaseOrderService');
      const fetchedPurchaseOrders = await getAllPurchaseOrders();
      
      // Upewnij się, że dane PO są poprawnie przetworzone i zawierają wszystkie wartości
      const processedPurchaseOrders = fetchedPurchaseOrders.map(po => {
        let processedPO = { ...po };
        
        // Oblicz wartość produktów
        const productsValue = Array.isArray(po.items) 
          ? po.items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || (parseFloat(item.price) * parseFloat(item.quantity)) || 0), 0)
          : 0;
        
        // Oblicz wartość dodatkowych kosztów
        let additionalCostsValue = 0;
        if (po.additionalCostsItems && Array.isArray(po.additionalCostsItems)) {
          additionalCostsValue = po.additionalCostsItems.reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0);
        } else if (po.additionalCosts) {
          additionalCostsValue = parseFloat(po.additionalCosts) || 0;
        }
        
        // Oblicz VAT
        const vatRate = parseFloat(po.vatRate) || 23;
        const vatValue = (productsValue * vatRate) / 100;
        
        // Oblicz wartość całkowitą (brutto)
        const calculatedGrossValue = productsValue + vatValue + additionalCostsValue;
        const finalGrossValue = parseFloat(po.totalGross) || calculatedGrossValue;
        
        // Dodaj obliczone wartości do obiektu PO
        processedPO = {
          ...processedPO,
          calculatedProductsValue: productsValue,
          calculatedAdditionalCosts: additionalCostsValue,
          calculatedVatValue: vatValue,
          calculatedGrossValue: calculatedGrossValue,
          finalGrossValue: finalGrossValue
        };
        
        return processedPO;
      });
      
      setPurchaseOrders(processedPurchaseOrders);
    } catch (error) {
      showError('Błąd podczas pobierania listy zamówień zakupowych: ' + error.message);
      console.error('Error fetching purchase orders:', error);
    } finally {
      setPurchaseOrdersLoading(false);
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

  const handleOrderSelect = async (orderId, orderType = 'customer') => {
    if (!orderId) return;
    
    setSelectedOrderType(orderType);
    setSelectedOrderId(orderId);
    
    try {
      let selectedOrder;
      
      if (orderType === 'purchase') {
        const { getPurchaseOrderById } = await import('../../services/purchaseOrderService');
        selectedOrder = await getPurchaseOrderById(orderId);
        
        // Dokładnie przeglądamy dane PO
        console.log('Pełne dane zamówienia zakupowego (PO):', selectedOrder);
        
        // Obliczamy pełną wartość zamówienia zakupowego
        let totalValue = 0;
        let totalAdditionalCosts = 0;
        
        // Wartość produktów
        const productsValue = Array.isArray(selectedOrder.items) 
          ? selectedOrder.items.reduce((sum, item) => {
              const itemPrice = parseFloat(item.totalPrice || (item.price * item.quantity)) || 0;
              console.log(`Produkt PO: ${item.name}, cena: ${itemPrice}`);
              return sum + itemPrice;
            }, 0)
          : 0;
        
        // Obliczamy VAT
        const vatRate = parseFloat(selectedOrder.vatRate) || 23;
        const vatValue = (productsValue * vatRate) / 100;
        
        // Obliczamy dodatkowe koszty
        if (selectedOrder.additionalCostsItems && Array.isArray(selectedOrder.additionalCostsItems)) {
          totalAdditionalCosts = selectedOrder.additionalCostsItems.reduce((sum, cost) => {
            const costValue = parseFloat(cost.value) || 0;
            console.log(`Dodatkowy koszt PO: ${cost.name || 'Bez nazwy'}, wartość: ${costValue}`);
            return sum + costValue;
          }, 0);
        } else if (selectedOrder.additionalCosts) {
          totalAdditionalCosts = parseFloat(selectedOrder.additionalCosts) || 0;
          console.log(`Dodatkowe koszty PO (łącznie): ${totalAdditionalCosts}`);
        }
        
        // Wartość brutto: produkty + VAT + dodatkowe koszty
        const calculatedGrossValue = productsValue + vatValue + totalAdditionalCosts;
        
        // Używamy zapisanej wartości brutto lub obliczonej
        const finalGrossValue = parseFloat(selectedOrder.totalGross) || calculatedGrossValue;
        
        console.log('Wartości PO:', {
          productsValue,
          vatValue,
          totalAdditionalCosts,
          calculatedGrossValue,
          savedTotalGross: selectedOrder.totalGross,
          finalGrossValue
        });
        
        const invoiceData = {
          customer: {
            id: selectedOrder.supplier?.id || '',
            name: selectedOrder.supplier?.name || '',
            email: selectedOrder.supplier?.email || '',
            phone: selectedOrder.supplier?.phone || '',
            address: selectedOrder.supplier?.address || '',
            vatEu: selectedOrder.supplier?.vatEu || ''
          },
          items: selectedOrder.items || [],
          orderNumber: selectedOrder.number,
          billingAddress: selectedOrder.supplier?.address || '',
          shippingAddress: selectedOrder.deliveryAddress || '',
          total: finalGrossValue, // Używamy pełnej wartości brutto
          currency: selectedOrder.currency || 'EUR',
          vatRate: selectedOrder.vatRate || 23,
          additionalCosts: totalAdditionalCosts,
          additionalCostsItems: selectedOrder.additionalCostsItems || [],
          invoiceType: 'purchase',
          orderId: orderId
        };
        
        setInvoice(prev => ({
        ...prev,
          ...invoiceData
        }));
      } else {
        selectedOrder = orders.find(o => o.id === orderId);
        if (!selectedOrder) return;
        
        // Sprawdź wszystkie możliwe dane zamówienia, które powinny zostać uwzględnione
        console.log('Pełne dane zamówienia przed przetworzeniem:', selectedOrder);
        
        // Wartość produktów
        const itemsTotal = Array.isArray(selectedOrder.items) 
          ? selectedOrder.items.reduce((sum, item) => {
              const price = parseFloat(item.price) || 0;
              const quantity = parseInt(item.quantity) || 0;
              const itemTotal = price * quantity;
              console.log(`Produkt: ${item.name}, cena: ${price}, ilość: ${quantity}, suma: ${itemTotal}`);
              return sum + itemTotal;
            }, 0)
          : 0;
        
        // Koszt wysyłki
        const shippingCost = parseFloat(selectedOrder.shippingCost) || 0;
        console.log(`Koszt wysyłki: ${shippingCost}`);
        
        // Sprawdź czy zamówienie ma powiązane PO i czy mają one poprawne wartości
        let purchaseOrdersTotal = 0;
        const linkedPOs = selectedOrder.linkedPurchaseOrders || [];
        
        if (linkedPOs && Array.isArray(linkedPOs) && linkedPOs.length > 0) {
          // Pobierz pełne dane dla każdego powiązanego PO
          const enrichedLinkedPOs = [];
          
          for (const linkedPO of linkedPOs) {
            let poId = linkedPO.id;
            let fullPOData;
            
            // Znajdź pełne dane PO z wcześniej pobranych danych
            const matchingPO = purchaseOrders.find(po => po.id === poId || po.number === linkedPO.number);
            
            if (matchingPO) {
              fullPOData = matchingPO;
            } else {
              // Jeśli nie znaleziono w pamięci, pobierz z bazy
              try {
                const { getPurchaseOrderById } = await import('../../services/purchaseOrderService');
                fullPOData = await getPurchaseOrderById(poId);
                
                // Oblicz wartości jeśli nie są dostępne
                if (!fullPOData.calculatedGrossValue) {
                  // Obliczenia jak w fetchPurchaseOrders
                  const productsValue = Array.isArray(fullPOData.items) 
                    ? fullPOData.items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || (parseFloat(item.price) * parseFloat(item.quantity)) || 0), 0)
                    : 0;
                  
                  let additionalCostsValue = 0;
                  if (fullPOData.additionalCostsItems && Array.isArray(fullPOData.additionalCostsItems)) {
                    additionalCostsValue = fullPOData.additionalCostsItems.reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0);
                  } else if (fullPOData.additionalCosts) {
                    additionalCostsValue = parseFloat(fullPOData.additionalCosts) || 0;
                  }
                  
                  const vatRate = parseFloat(fullPOData.vatRate) || 23;
                  const vatValue = (productsValue * vatRate) / 100;
                  
                  const calculatedGrossValue = productsValue + vatValue + additionalCostsValue;
                  const finalGrossValue = parseFloat(fullPOData.totalGross) || calculatedGrossValue;
                  
                  fullPOData = {
                    ...fullPOData,
                    calculatedProductsValue: productsValue,
                    calculatedAdditionalCosts: additionalCostsValue,
                    calculatedVatValue: vatValue,
                    calculatedGrossValue: calculatedGrossValue,
                    finalGrossValue: finalGrossValue
                  };
                }
              } catch (error) {
                console.error(`Błąd podczas pobierania szczegółów PO ${poId}:`, error);
                fullPOData = linkedPO; // Użyj ograniczonych danych
              }
            }
            
            // Ustal wartość PO
            let poValue = 0;
            
            if (fullPOData.finalGrossValue !== undefined) {
              poValue = parseFloat(fullPOData.finalGrossValue);
            } else if (fullPOData.totalGross !== undefined) {
              poValue = parseFloat(fullPOData.totalGross) || 0;
            } else if (fullPOData.value !== undefined) {
              poValue = parseFloat(fullPOData.value) || 0;
            } else if (fullPOData.total !== undefined) {
              poValue = parseFloat(fullPOData.total) || 0;
            }
            
            // Dodaj dodatkowe koszty, jeśli nie zostały uwzględnione
            if (!fullPOData.finalGrossValue && !fullPOData.totalGross) {
              let additionalCostsValue = 0;
              if (fullPOData.additionalCostsItems && Array.isArray(fullPOData.additionalCostsItems)) {
                additionalCostsValue = fullPOData.additionalCostsItems.reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0);
              } else if (fullPOData.additionalCosts) {
                additionalCostsValue = parseFloat(fullPOData.additionalCosts) || 0;
              }
              
              poValue += additionalCostsValue;
            }
            
            console.log(`PO: ${fullPOData.number || fullPOData.id}, wartość: ${poValue}`);
            enrichedLinkedPOs.push({
              ...fullPOData,
              calculatedTotalValue: poValue
            });
            
            purchaseOrdersTotal += poValue;
          }
          
          // Zastąp ograniczone dane PO pełnymi danymi
          selectedOrder.linkedPurchaseOrders = enrichedLinkedPOs;
        }
        
        // Całkowita wartość zamówienia (produkty + wysyłka + PO)
        const orderTotal = itemsTotal + shippingCost + purchaseOrdersTotal;
        
        // Debugowanie wartości
        console.log('Obliczanie wartości CO:', {
          itemsTotal,
          shippingCost,
          purchaseOrdersTotal,
          orderTotal,
          savedTotal: selectedOrder.total
        });
        
        // Używamy zapisanej wartości zamówienia jeśli istnieje, w przeciwnym razie obliczonej
        const finalTotal = parseFloat(selectedOrder.total) || orderTotal;
        
        // Dodaj sprawdzenie na wypadek, gdyby wartość zamówienia była nadal niepoprawna
        if (isNaN(finalTotal) || finalTotal <= 0) {
          showError('Nie można ustalić poprawnej wartości zamówienia. Sprawdź wartości w zamówieniu.');
          console.error('Nieprawidłowa wartość zamówienia:', finalTotal);
        }
        
        setInvoice(prev => ({
          ...prev,
          customer: selectedOrder.customer,
          items: selectedOrder.items || [],
          orderNumber: selectedOrder.orderNumber,
          billingAddress: selectedOrder.customer?.billingAddress || selectedOrder.customer?.address || '',
          shippingAddress: selectedOrder.shippingAddress || selectedOrder.customer?.address || '',
          total: finalTotal,
          currency: selectedOrder.currency || 'EUR',
          orderId: orderId,
          shippingInfo: shippingCost > 0 ? {
            cost: shippingCost,
            method: selectedOrder.shippingMethod || 'Standard'
          } : null,
          linkedPurchaseOrders: selectedOrder.linkedPurchaseOrders || []
        }));
        
        if (selectedOrder.customer?.id) {
      setSelectedCustomerId(selectedOrder.customer.id);
        }
      }
      
      setSelectedOrder(selectedOrder);
    } catch (error) {
      showError('Błąd podczas wczytywania danych zamówienia: ' + error.message);
      console.error('Error loading order data:', error);
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
      let submittedInvoiceId;
      
      const invoiceToSubmit = { ...invoice };
      
      const isPurchaseInvoice = selectedOrderType === 'purchase' || 
                               (selectedOrder && selectedOrder.type === 'purchase');
      
      if (isPurchaseInvoice) {
        invoiceToSubmit.invoiceType = 'purchase';
      }
      
      if (invoiceId) {
        await updateInvoice(invoiceId, invoiceToSubmit, currentUser.uid);
        submittedInvoiceId = invoiceId;
        showSuccess('Faktura została zaktualizowana');
      } else {
        if (selectedOrderId) {
          submittedInvoiceId = await createInvoiceFromOrder(
            selectedOrderId, 
            invoiceToSubmit, 
            currentUser.uid
          );
          showSuccess('Faktura została utworzona na podstawie zamówienia');
        } else {
          submittedInvoiceId = await createInvoice(invoiceToSubmit, currentUser.uid);
          showSuccess('Nowa faktura została utworzona');
        }
      }
        
        if (redirectToList) {
        navigate('/invoices/list');
        } else {
        navigate(`/invoices/${submittedInvoiceId}`);
      }
    } catch (error) {
      showError('Błąd podczas zapisywania faktury: ' + error.message);
      console.error('Error saving invoice:', error);
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
    <Box component="form" onSubmit={handleSubmit} noValidate>
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
          type="submit"
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
                        onChange={(e) => handleOrderSelect(e.target.value, selectedOrderType)}
                        label="Powiązane zamówienie"
                        disabled={filteredOrders.length === 0 || ordersLoading}
                      >
                        <MenuItem value="">Brak powiązanego zamówienia</MenuItem>
                        {selectedOrderType === 'customer' ? (
                          filteredOrders.map(order => (
                          <MenuItem key={order.id} value={order.id}>
                              {order.orderNumber} - {order.customer?.name} 
                              {order.orderDate ? ` (${order.orderDate.toLocaleDateString()})` : ''}
                          </MenuItem>
                          ))
                        ) : (
                          purchaseOrders.map(po => (
                            <MenuItem key={po.id} value={po.id}>
                              {po.number} - {po.supplier?.name} ({po.status})
                            </MenuItem>
                          ))
                        )}
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

        {/* Wyświetl informacje o kosztach wysyłki, jeśli istnieją */}
        {invoice.shippingInfo && invoice.shippingInfo.cost > 0 && (
          <Card variant="outlined" sx={{ mb: 2, p: 2, bgcolor: 'info.lighter' }}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={6}>
                <Typography variant="body1" fontWeight="bold">
                  Koszt wysyłki ({invoice.shippingInfo.method})
                </Typography>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="body1">
                  Wartość netto: {parseFloat(invoice.shippingInfo.cost).toFixed(2)} {invoice.currency || 'zł'}
                </Typography>
              </Grid>
            </Grid>
          </Card>
        )}

        {/* Wyświetl informacje o powiązanych zamówieniach zakupowych */}
        {selectedOrder && selectedOrder.linkedPurchaseOrders && selectedOrder.linkedPurchaseOrders.length > 0 && (
          <>
            <Typography variant="subtitle1" sx={{ mt: 3, mb: 1 }}>
              Powiązane zamówienia zakupowe:
            </Typography>
            
            {selectedOrder.linkedPurchaseOrders.map((po, index) => {
              // Użyj obliczonej wartości całkowitej lub oblicz ją manualnie
              let poValue = 0;
              let productsValue = 0;
              let additionalCostsValue = 0;
              
              if (po.calculatedTotalValue !== undefined) {
                poValue = parseFloat(po.calculatedTotalValue);
              } else if (po.finalGrossValue !== undefined) {
                poValue = parseFloat(po.finalGrossValue);
              } else if (po.totalGross !== undefined) {
                poValue = parseFloat(po.totalGross) || 0;
              } else if (po.value !== undefined) {
                poValue = parseFloat(po.value) || 0;
              } else if (po.total !== undefined) {
                poValue = parseFloat(po.total) || 0;
              }
              
              // Oblicz wartość produktów
              if (po.calculatedProductsValue !== undefined) {
                productsValue = parseFloat(po.calculatedProductsValue);
              } else if (po.totalValue !== undefined) {
                productsValue = parseFloat(po.totalValue) || 0;
              } else if (po.netValue !== undefined) {
                productsValue = parseFloat(po.netValue) || 0;
              } else if (Array.isArray(po.items)) {
                productsValue = po.items.reduce((sum, item) => {
                  return sum + (parseFloat(item.totalPrice) || parseFloat(item.price) * parseFloat(item.quantity) || 0);
                }, 0);
              }
              
              // Oblicz dodatkowe koszty
              if (po.calculatedAdditionalCosts !== undefined) {
                additionalCostsValue = parseFloat(po.calculatedAdditionalCosts);
              } else if (po.additionalCostsItems && Array.isArray(po.additionalCostsItems)) {
                additionalCostsValue = po.additionalCostsItems.reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0);
              } else if (po.additionalCosts) {
                additionalCostsValue = parseFloat(po.additionalCosts) || 0;
              }
              
              // Jeśli wartość produktów + dodatkowe koszty > poValue, to używamy sumy
              if (productsValue + additionalCostsValue > poValue) {
                poValue = productsValue + additionalCostsValue;
              }
              
              // Pokazujemy dodatkowe koszty na karcie PO
              return (
                <Card key={`po-${index}`} variant="outlined" sx={{ mb: 2, p: 2, bgcolor: 'warning.lighter' }}>
                  <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} sm={6}>
                      <Typography variant="body1" fontWeight="bold">
                        Zamówienie zakupowe {po.number || po.id}
                      </Typography>
                      {po.supplier && (
                        <Typography variant="body2">
                          Dostawca: {po.supplier.name}
                        </Typography>
                      )}
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="body1">
                        Wartość produktów: {productsValue.toFixed(2)} {invoice.currency || 'EUR'}
                      </Typography>
                      {additionalCostsValue > 0 && (
                        <Typography variant="body1" color="primary">
                          Dodatkowe koszty: {additionalCostsValue.toFixed(2)} {invoice.currency || 'EUR'}
                        </Typography>
                      )}
                      <Typography variant="body1" fontWeight="bold">
                        Wartość całkowita: {poValue.toFixed(2)} {invoice.currency || 'EUR'}
                      </Typography>
                    </Grid>
                  </Grid>
                </Card>
              );
            })}
          </>
        )}

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
            
            {/* Wyświetl dodatkowe koszty, jeśli istnieją */}
            {invoice.shippingInfo && invoice.shippingInfo.cost > 0 && (
              <Typography variant="body1" fontWeight="bold">
                Koszt wysyłki: {parseFloat(invoice.shippingInfo.cost).toFixed(2)} {invoice.currency || 'zł'}
              </Typography>
            )}
            
            {/* Wyświetl sumę z powiązanych PO */}
            {selectedOrder && selectedOrder.linkedPurchaseOrders && selectedOrder.linkedPurchaseOrders.length > 0 && (
              <Typography variant="body1" fontWeight="bold">
                Wartość PO: {selectedOrder.linkedPurchaseOrders.reduce((sum, po) => sum + (parseFloat(po.totalGross || po.value) || 0), 0).toFixed(2)} {invoice.currency || 'zł'}
              </Typography>
            )}
            
            <Typography variant="h6" fontWeight="bold" color="primary">
              Razem brutto: {parseFloat(invoice.total).toFixed(2)} {invoice.currency || 'zł'}
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

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Wybierz źródło faktury
        </Typography>
        
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <FormControl fullWidth>
              <InputLabel>Typ zamówienia</InputLabel>
              <Select
                value={selectedOrderType}
                onChange={(e) => setSelectedOrderType(e.target.value)}
                label="Typ zamówienia"
              >
                <MenuItem value="customer">Zamówienie klienta</MenuItem>
                <MenuItem value="purchase">Zamówienie zakupowe (PO)</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} md={8}>
            <FormControl fullWidth>
              <InputLabel>Wybierz zamówienie</InputLabel>
              <Select
                value={selectedOrderId || ''}
                onChange={(e) => handleOrderSelect(e.target.value, selectedOrderType)}
                label="Wybierz zamówienie"
                disabled={!customers.length || (selectedOrderType === 'customer' ? ordersLoading : purchaseOrdersLoading)}
              >
                <MenuItem value="">-- Brak --</MenuItem>
                
                {selectedOrderType === 'customer' ? (
                  filteredOrders.map(order => (
                    <MenuItem key={order.id} value={order.id}>
                      {order.orderNumber} - {order.customer?.name} 
                      {order.orderDate ? ` (${order.orderDate.toLocaleDateString()})` : ''}
                    </MenuItem>
                  ))
                ) : (
                  purchaseOrders.map(po => (
                    <MenuItem key={po.id} value={po.id}>
                      {po.number} - {po.supplier?.name} ({po.status})
                    </MenuItem>
                  ))
                )}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

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