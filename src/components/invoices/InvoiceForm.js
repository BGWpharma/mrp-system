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
  Autocomplete,
  FormControlLabel,
  Checkbox,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Chip
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Save as SaveIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Person as PersonIcon,
  Refresh as RefreshIcon,
  Assignment as AssignmentIcon
} from '@mui/icons-material';
import { 
  createInvoice, 
  getInvoiceById, 
  updateInvoice, 
  createInvoiceFromOrder,
  DEFAULT_INVOICE,
  calculateInvoiceTotal,
  calculateInvoiceTotalGross,
  generateProformaNumber,
  getInvoicesByOrderId,
  getAvailableProformaAmount,
  getAvailableProformasForOrder,
  getAvailableProformasForOrderWithExclusion,
  updateMultipleProformasUsage,
  removeMultipleProformasUsage,
  syncProformaNumberInLinkedInvoices,
  calculateTotalUnitCost,
  getProformaAmountsByOrderItems,
  getInvoicedAmountsByOrderItems
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
import { useTranslation } from '../../hooks/useTranslation';

const InvoiceForm = ({ invoiceId }) => {
  const [searchParams] = useSearchParams();
  const customerId = searchParams.get('customerId');
  const [invoice, setInvoice] = useState({ 
    ...DEFAULT_INVOICE,
    settledAdvancePayments: 0,
    selectedProformaId: null,
    proformAllocation: []
  });
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
  const [relatedInvoices, setRelatedInvoices] = useState([]);
  const [loadingRelatedInvoices, setLoadingRelatedInvoices] = useState(false);
  const [availableProformaAmount, setAvailableProformaAmount] = useState(null);
  const [availableProformas, setAvailableProformas] = useState([]);
  const [refreshingCustomer, setRefreshingCustomer] = useState(false);
  // Stany dla dialogu wyboru pozycji z zamówienia
  const [orderItemsDialogOpen, setOrderItemsDialogOpen] = useState(false);
  const [availableOrderItems, setAvailableOrderItems] = useState([]);
  const [selectedOrderItems, setSelectedOrderItems] = useState([]);
  const [proformasByOrderItems, setProformasByOrderItems] = useState({}); // Informacje o proformach dla pozycji
  const [showAllProformas, setShowAllProformas] = useState(false);

  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const navigate = useNavigate();
  const { t } = useTranslation();

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

  // Efekt do ustawiania domyślnego rachunku bankowego gdy dane firmy są załadowane
  useEffect(() => {
    // Ustaw domyślny rachunek bankowy tylko dla nowych faktur (bez ID)
    if (!invoiceId && companyInfo?.bankAccounts && companyInfo.bankAccounts.length > 0 && !invoice.selectedBankAccount) {
      const defaultAccount = companyInfo.bankAccounts.find(account => account.isDefault);
      
      if (defaultAccount) {
        console.log('Ustawiam domyślny rachunek bankowy:', defaultAccount);
        setInvoice(prev => ({
          ...prev,
          selectedBankAccount: defaultAccount.id
        }));
      } else if (companyInfo.bankAccounts.length > 0) {
        // Jeśli nie ma rachunku oznaczonego jako domyślny, wybierz pierwszy
        console.log('Brak domyślnego rachunku - wybieranie pierwszego z listy:', companyInfo.bankAccounts[0]);
        setInvoice(prev => ({
          ...prev,
          selectedBankAccount: companyInfo.bankAccounts[0].id
        }));
      }
    }
  }, [companyInfo, invoiceId, invoice.selectedBankAccount]);

  // Efekt do sprawdzania czy wybrany rachunek bankowy nadal istnieje
  useEffect(() => {
    if (invoice.selectedBankAccount && companyInfo?.bankAccounts) {
      const accountExists = companyInfo.bankAccounts.some(account => account.id === invoice.selectedBankAccount);
      
      if (!accountExists) {
        console.warn(`Rachunek bankowy ${invoice.selectedBankAccount} nie istnieje w dostępnych rachunkach. Czyszczenie wartości.`);
        setInvoice(prev => ({
          ...prev,
          selectedBankAccount: ''
        }));
      }
    }
  }, [invoice.selectedBankAccount, companyInfo?.bankAccounts]);

  // Efekt do automatycznego ustawienia selectedOrder gdy dane są dostępne podczas edycji faktury
  useEffect(() => {
    if (selectedOrderId && selectedOrderType && !selectedOrder) {
      const isCustomerOrder = selectedOrderType === 'customer';
      const ordersList = isCustomerOrder ? orders : purchaseOrders;
      const isLoading = isCustomerOrder ? ordersLoading : purchaseOrdersLoading;
      
      // Sprawdź czy dane zamówień są już załadowane i lista nie jest pusta
      if (!isLoading && ordersList.length > 0) {
        handleOrderSelect(selectedOrderId, selectedOrderType);
      }
    }
  }, [selectedOrderId, selectedOrderType, orders, purchaseOrders, ordersLoading, purchaseOrdersLoading, selectedOrder]);

  const fetchInvoice = async (id) => {
    setLoading(true);
    try {
      const fetchedInvoice = await getInvoiceById(id);
      // Zapewnij że wszystkie nowe pola są zdefiniowane
      setInvoice({
        ...fetchedInvoice,
        proformAllocation: fetchedInvoice.proformAllocation || []
      });

      // Ustaw wartości wybrane w formularzach
      if (fetchedInvoice.customer?.id) {
        setSelectedCustomerId(fetchedInvoice.customer.id);
      }
      
      if (fetchedInvoice.orderId) {
        setSelectedOrderId(fetchedInvoice.orderId);
        setSelectedOrderType(fetchedInvoice.invoiceType === 'purchase' ? 'purchase' : 'customer');
        // Pobierz powiązane faktury dla tego zamówienia
        await fetchRelatedInvoices(fetchedInvoice.orderId);
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
            // Sprawdź czy data jest już obiektem Date
            if (order.orderDate instanceof Date) {
              formattedDate = order.orderDate;
            } else if (order.orderDate.toDate && typeof order.orderDate.toDate === 'function') {
              // Obsługa Firestore Timestamp
              formattedDate = order.orderDate.toDate();
            } else if (typeof order.orderDate === 'string' || typeof order.orderDate === 'number') {
              formattedDate = new Date(order.orderDate);
            }
            
            // Sprawdź czy wynikowa data jest prawidłowa
            if (!formattedDate || isNaN(formattedDate.getTime())) {
              formattedDate = null;
              // Loguj tylko raz dla każdego zamówienia i tylko w trybie deweloperskim
              if (process.env.NODE_ENV === 'development') {
                console.warn(`Nieprawidłowa data w zamówieniu ${order.orderNumber || order.id}`);
              }
            }
          } catch (e) {
            formattedDate = null;
            if (process.env.NODE_ENV === 'development') {
              console.error(`Błąd parsowania daty dla zamówienia ${order.orderNumber || order.id}`, e);
            }
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

  const fetchRelatedInvoices = async (orderId) => {
    if (!orderId) {
      setRelatedInvoices([]);
      setAvailableProformaAmount(null);
      setAvailableProformas([]);
      return;
    }
    
    setLoadingRelatedInvoices(true);
    try {
      const invoices = await getInvoicesByOrderId(orderId);
      // Filtruj tylko faktury inne niż obecna (jeśli edytujemy istniejącą)
      const filteredInvoices = invoices.filter(inv => inv.id !== invoiceId);
      setRelatedInvoices(filteredInvoices);
      
      // Pobierz wszystkie dostępne proformy z ich kwotami
      // Jeśli edytujemy istniejącą fakturę, uwzględnij to przy obliczaniu dostępnych kwot
      const proformasWithAmounts = await getAvailableProformasForOrderWithExclusion(orderId, invoiceId);
      // Filtruj proformy inne niż obecna faktura (jeśli edytujemy proformę)
      const filteredProformas = proformasWithAmounts.filter(proforma => proforma.id !== invoiceId);
      setAvailableProformas(filteredProformas);
      
      // Jeśli jest już wybrana proforma, zaktualizuj jej dostępną kwotę
      if (invoice.selectedProformaId) {
        const selectedProforma = filteredProformas.find(p => p.id === invoice.selectedProformaId);
        if (selectedProforma) {
          setAvailableProformaAmount(selectedProforma.amountInfo);
        } else {
          setAvailableProformaAmount(null);
        }
      } else {
        setAvailableProformaAmount(null);
      }
    } catch (error) {
      console.error('Błąd podczas pobierania powiązanych faktur:', error);
      setRelatedInvoices([]);
      setAvailableProformaAmount(null);
      setAvailableProformas([]);
    } finally {
      setLoadingRelatedInvoices(false);
    }
  };

  // Funkcja do obsługi zmiany alokacji proform
  const handleProformaAllocationChange = (proformaId, amount, proformaNumber) => {
    setInvoice(prev => {
      const newAllocation = [...(prev.proformAllocation || [])];
      const existingIndex = newAllocation.findIndex(a => a.proformaId === proformaId);
      
      if (amount > 0) {
        const allocation = {
          proformaId,
          amount,
          proformaNumber
        };
        
        if (existingIndex >= 0) {
          newAllocation[existingIndex] = allocation;
        } else {
          newAllocation.push(allocation);
        }
      } else {
        // Usuń alokację jeśli kwota jest 0
        if (existingIndex >= 0) {
          newAllocation.splice(existingIndex, 1);
        }
      }
      
      // Oblicz łączną kwotę zaliczek
      const totalAllocated = newAllocation.reduce((sum, a) => sum + a.amount, 0);
      
      return {
        ...prev,
        proformAllocation: newAllocation,
        settledAdvancePayments: totalAllocated
      };
    });
  };
  
  // Funkcja do obliczania łącznej kwoty alokacji
  const getTotalAllocatedAmount = () => {
    return (invoice.proformAllocation || []).reduce((sum, allocation) => sum + allocation.amount, 0);
  };

  // Funkcje do obsługi wyboru pozycji z zamówienia
  const handleOpenOrderItemsDialog = async (orderItems) => {
    // Pobierz informacje o istniejących proformach dla tego zamówienia
    let existingProformas = {};
    if (selectedOrderId && invoice.isProforma) {
      try {
        existingProformas = await getProformaAmountsByOrderItems(selectedOrderId);
        setProformasByOrderItems(existingProformas);
        console.log('Pobrano informacje o proformach:', existingProformas);
      } catch (error) {
        console.error('Błąd podczas pobierania informacji o proformach:', error);
      }
    }

    // Pobierz informacje o zafakturowanych ilościach dla tego zamówienia (dla zwykłych faktur)
    let invoicedAmounts = {};
    if (selectedOrderId && !invoice.isProforma) {
      try {
        // Pobierz wszystkie faktury dla tego zamówienia
        const relatedInvoices = await getInvoicesByOrderId(selectedOrderId);
        // Filtruj faktury inne niż obecna (jeśli edytujemy)
        const filteredInvoices = relatedInvoices.filter(inv => inv.id !== invoiceId);
        invoicedAmounts = await getInvoicedAmountsByOrderItems(selectedOrderId, filteredInvoices, selectedOrder);
        console.log('Pobrano informacje o zafakturowanych ilościach:', invoicedAmounts);
      } catch (error) {
        console.error('Błąd podczas pobierania informacji o zafakturowanych ilościach:', error);
      }
    }

    // Przygotuj pozycje z obliconymi cenami (jak w oryginalnej logice)
    const mappedItems = (orderItems || []).map((item, index) => {
      let finalPrice;
      
      // Dla faktur PROFORMA - używaj "ostatniego kosztu" jeśli dostępny
      if (invoice.isProforma && item.lastUsageInfo && item.lastUsageInfo.cost && parseFloat(item.lastUsageInfo.cost) > 0) {
        finalPrice = parseFloat(item.lastUsageInfo.cost);
      } else {
        // Dla zwykłych faktur - sprawdź czy produkt nie jest z listy cenowej lub ma cenę 0
        const shouldUseProductionCost = !item.fromPriceList || parseFloat(item.price || 0) === 0;
        
        // Użyj kosztu całkowitego (z udziałem w kosztach dodatkowych) jeśli warunki są spełnione
        if (shouldUseProductionCost && selectedOrder) {
          finalPrice = calculateTotalUnitCost(item, selectedOrder);
        } else {
          finalPrice = parseFloat(item.price || 0);
        }
      }

      // Sprawdź czy ta pozycja ma już wystawioną proformę (dla proform)
      const itemId = item.id;
      const hasProforma = existingProformas[itemId] && existingProformas[itemId].totalProforma > 0;
      const proformaInfo = existingProformas[itemId] || null;

      // Oblicz pozostałą ilość i wartość do zafakturowania (dla zwykłych faktur)
      let remainingQuantity = parseFloat(item.quantity || 0);
      let remainingValue = parseFloat(item.quantity || 0) * finalPrice;
      let invoicedInfo = null;
      
      if (!invoice.isProforma && invoicedAmounts[itemId]) {
        const invoicedData = invoicedAmounts[itemId];
        const totalInvoicedQuantity = invoicedData.invoices.reduce((sum, inv) => sum + inv.quantity, 0);
        const totalInvoicedValue = invoicedData.totalInvoiced;
        
        // Oblicz pozostałą ilość i wartość
        remainingQuantity = Math.max(0, parseFloat(item.quantity || 0) - totalInvoicedQuantity);
        remainingValue = Math.max(0, (parseFloat(item.quantity || 0) * finalPrice) - totalInvoicedValue);
        
        invoicedInfo = {
          totalInvoicedQuantity: totalInvoicedQuantity,
          totalInvoicedValue: totalInvoicedValue,
          invoices: invoicedData.invoices
        };
        
        console.log(`Pozycja ${item.name}: Zamówienie: ${item.quantity}, Zafakturowano: ${totalInvoicedQuantity}, Pozostało: ${remainingQuantity}`);
      }

      return {
        ...item,
        price: finalPrice,
        quantity: remainingQuantity, // Ustaw pozostałą ilość
        netValue: remainingValue, // Ustaw pozostałą wartość
        originalQuantity: parseFloat(item.quantity || 0), // Zachowaj oryginalną ilość z zamówienia
        originalValue: parseFloat(item.quantity || 0) * finalPrice, // Zachowaj oryginalną wartość
        selected: false, // Domyślnie nie zaznaczone
        hasProforma: hasProforma, // Czy ma już proformę (dla proform)
        proformaInfo: proformaInfo, // Informacje o istniejącej proformie (dla proform)
        invoicedInfo: invoicedInfo, // Informacje o zafakturowanych ilościach (dla zwykłych faktur)
        isFullyInvoiced: !invoice.isProforma && remainingQuantity <= 0 // Czy pozycja jest w pełni zafakturowana
      };
    });
    
    setAvailableOrderItems(mappedItems);
    setSelectedOrderItems([]);
    setOrderItemsDialogOpen(true);
  };

  const handleToggleOrderItem = (itemIndex) => {
    setAvailableOrderItems(prev => 
      prev.map((item, index) => 
        index === itemIndex ? { ...item, selected: !item.selected } : item
      )
    );
  };

  const handleSelectAllOrderItems = () => {
    const allSelected = availableOrderItems.every(item => item.selected);
    setAvailableOrderItems(prev => 
      prev.map(item => ({ ...item, selected: !allSelected }))
    );
  };

  const handleConfirmOrderItemsSelection = () => {
    const selectedItems = availableOrderItems.filter(item => item.selected);
    
    if (selectedItems.length === 0) {
      showError('Wybierz przynajmniej jedną pozycję do dodania');
      return;
    }
    
    // WALIDACJA: Sprawdź czy wybrane pozycje są w pełni zafakturowane
    if (!invoice.isProforma) {
      const fullyInvoicedItems = selectedItems.filter(item => item.isFullyInvoiced);
      
      if (fullyInvoicedItems.length > 0) {
        const itemNames = fullyInvoicedItems.map(item => item.name).join(', ');
        showError(
          `Nie można dodać pozycji: ${itemNames}. ` +
          `${fullyInvoicedItems.length === 1 ? 'Ta pozycja jest' : 'Te pozycje są'} już w pełni zafakturowane.`
        );
        return;
      }
    }
    
    // WALIDACJA: Sprawdź czy wybrane pozycje mają już wystawione proformy
    if (invoice.isProforma) {
      const itemsWithProforma = selectedItems.filter(item => item.hasProforma);
      
      if (itemsWithProforma.length > 0) {
        const itemNames = itemsWithProforma.map(item => item.name).join(', ');
        const proformaNumbers = itemsWithProforma
          .flatMap(item => item.proformaInfo?.proformas || [])
          .map(pf => pf.proformaNumber)
          .filter((value, index, self) => self.indexOf(value) === index) // unikalne numery
          .join(', ');
        
        showError(
          `Nie można dodać pozycji: ${itemNames}. ` +
          `${itemsWithProforma.length === 1 ? 'Ta pozycja ma' : 'Te pozycje mają'} już wystawioną proformę: ${proformaNumbers}.`
        );
        return;
      }
    }
    
    // Dodaj wybrane pozycje do faktury z pozostałymi ilościami
    const newItems = selectedItems.map(item => ({
      id: item.id || '',
      orderItemId: item.id, // Zachowaj referencję do pozycji w CO dla poprawnego śledzenia zafakturowanych kwot
      name: item.name,
      description: item.description || '',
      quantity: item.quantity, // To jest już pozostała ilość!
      unit: item.unit || 'szt.',
      price: item.price,
      netValue: item.netValue, // To jest już pozostała wartość!
      vat: item.vat || 0,
      cnCode: item.cnCode || ''
    }));
    
    setInvoice(prev => ({
      ...prev,
      items: [...prev.items, ...newItems]
    }));
    
    setOrderItemsDialogOpen(false);
    showSuccess(`Dodano ${selectedItems.length} pozycji z zamówienia`);
  };

  const handleChange = (e) => {
    const { name, value, checked, type } = e.target;
    
    if (name === 'settledAdvancePayments') {
      // Przy zmianie rozliczonych zaliczek aktualizuj tylko to pole (total jest obliczane gdzie indziej)
      setInvoice(prev => ({
        ...prev,
        [name]: parseFloat(value) || 0
      }));
    } else if (name === 'selectedProformaId') {
      // Obsługa zmiany wybranej proformy
      setInvoice(prev => ({
        ...prev,
        [name]: value,
        settledAdvancePayments: 0 // Resetuj zaliczki przy zmianie proformy
      }));
      
      // Zaktualizuj dostępną kwotę dla nowej proformy
      if (value) {
        const selectedProforma = availableProformas.find(p => p.id === value);
        if (selectedProforma) {
          setAvailableProformaAmount(selectedProforma.amountInfo);
        }
      } else {
        setAvailableProformaAmount(null);
      }
    } else if (type === 'checkbox') {
      // Obsługa checkboxów (np. isProforma)
      if (name === 'isProforma' && checked) {
        // Jeśli zaznaczamy proforma, resetuj zaliczki/przedpłaty
        setInvoice(prev => ({
          ...prev,
          [name]: checked,
          settledAdvancePayments: 0,
          selectedProformaId: null,
          proformAllocation: []
        }));
        setAvailableProformaAmount(null);
      } else {
        setInvoice(prev => ({
          ...prev,
          [name]: checked
        }));
      }
    } else {
      // Dla pozostałych pól, standardowa obsługa
      setInvoice(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleDateChange = (name, value) => {
    setInvoice(prev => ({
      ...prev,
      [name]: value ? formatDateForInput(value) : null
    }));
  };

  // Funkcja pomocnicza do obliczania całkowitej wartości faktury z zaliczkami
  const calculateTotalWithAdvancePayments = (items) => {
    // Oblicz wartość zamówienia na podstawie pozycji (BRUTTO z VAT)
    let totalValue = calculateInvoiceTotalGross(items);
    
    // Dodaj wartości zaliczek/przedpłat jeśli istnieją
    if (selectedOrder && selectedOrder.linkedPurchaseOrders && selectedOrder.linkedPurchaseOrders.length > 0) {
      const poTotalValue = selectedOrder.linkedPurchaseOrders.reduce((sum, po) => {
        return sum + (parseFloat(po.totalGross || po.value) || 0);
      }, 0);
      totalValue += poTotalValue;
    }
    
    return totalValue;
  };

  const handleItemChange = (index, field, value) => {
    const updatedItems = [...invoice.items];
    
    // Poprawione przetwarzanie wartości VAT - zachowanie wartości tekstowych
    if (field === 'vat') {
      // Jeśli wartość jest ciągiem znaków "ZW" lub "NP", zachowaj ją
      if (value === "ZW" || value === "NP") {
        // Nie konwertuj stringów "ZW" i "NP"
      } else {
        // Dla wartości liczbowych, konwertuj na liczbę (włącznie z 0)
        value = value === 0 || value === "0" ? 0 : (parseFloat(value) || 0);
      }
    }
    
    // Upewnij się, że quantity, price i netValue są liczbami
    if (field === 'quantity' || field === 'price' || field === 'netValue') {
      value = parseFloat(value) || 0;
    }
    
    const currentItem = updatedItems[index];
    updatedItems[index] = {
      ...currentItem,
      [field]: value
    };
    
    // Jeśli zmieniono wartość netto, oblicz cenę jednostkową
    if (field === 'netValue') {
      const quantity = updatedItems[index].quantity || 1;
      updatedItems[index].price = quantity > 0 ? value / quantity : 0;
    }
    // Jeśli zmieniono ilość lub cenę jednostkową, oblicz wartość netto
    else if (field === 'quantity' || field === 'price') {
      const quantity = field === 'quantity' ? value : (updatedItems[index].quantity || 0);
      const price = field === 'price' ? value : (updatedItems[index].price || 0);
      updatedItems[index].netValue = quantity * price;
    }
    
    setInvoice(prev => ({
      ...prev,
      items: updatedItems,
      total: calculateTotalWithAdvancePayments(updatedItems)
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
      netValue: 0,
      vat: 0,
      cnCode: ''
    };
    
    const updatedItems = [...invoice.items, newItem];
    
    setInvoice(prev => ({
      ...prev,
      items: updatedItems,
      total: calculateTotalWithAdvancePayments(updatedItems)
    }));
  };

  const handleRemoveItem = (index) => {
    const updatedItems = [...invoice.items];
    updatedItems.splice(index, 1);
    
    setInvoice(prev => ({
      ...prev,
      items: updatedItems,
      total: calculateTotalWithAdvancePayments(updatedItems)
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

  // Funkcja do odświeżania danych wybranego klienta
  const refreshCustomerData = async () => {
    if (!invoice.customer?.id) {
      showError('Nie wybrano klienta do odświeżenia');
      return;
    }

    setRefreshingCustomer(true);
    try {
      // Pobierz aktualne dane klienta z bazy danych
      const updatedCustomer = await getCustomerById(invoice.customer.id);
      
      // Zaktualizuj dane klienta w fakturze
      setInvoice(prev => ({
        ...prev,
        customer: {
          id: updatedCustomer.id,
          name: updatedCustomer.name,
          email: updatedCustomer.email,
          phone: updatedCustomer.phone,
          address: updatedCustomer.address || '',
          vatEu: updatedCustomer.vatEu || '',
          billingAddress: updatedCustomer.billingAddress || updatedCustomer.address || '',
          shippingAddress: updatedCustomer.shippingAddress || updatedCustomer.address || '',
          supplierVatEu: updatedCustomer.supplierVatEu || '',
          nip: updatedCustomer.nip || '',
          taxId: updatedCustomer.taxId || ''
        },
        billingAddress: updatedCustomer.billingAddress || updatedCustomer.address || '',
        shippingAddress: updatedCustomer.shippingAddress || updatedCustomer.address || ''
      }));

      // Odśwież również listę klientów aby mieć najnowsze dane
      await fetchCustomers();
      
      showSuccess('Dane klienta zostały odświeżone');
    } catch (error) {
      console.error('Błąd podczas odświeżania danych klienta:', error);
      showError('Nie udało się odświeżyć danych klienta: ' + error.message);
    } finally {
      setRefreshingCustomer(false);
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
        
        // Mapowanie pozycji z uwzględnieniem kosztów z produkcji i ostatniego kosztu dla PROFORMA (PO)
        const mappedPOItems = (selectedOrder.items || []).map(item => {
          let finalPrice;
          
          // Dla faktur PROFORMA - używaj "ostatniego kosztu" jeśli dostępny
          if (invoice.isProforma && item.lastUsageInfo && item.lastUsageInfo.cost && parseFloat(item.lastUsageInfo.cost) > 0) {
            finalPrice = parseFloat(item.lastUsageInfo.cost);
            console.log(`PROFORMA PO: Używam ostatniego kosztu ${finalPrice} dla ${item.name}`);
          } else {
            // Dla zwykłych faktur - sprawdź czy produkt nie jest z listy cenowej lub ma cenę 0
            const shouldUseProductionCost = !item.fromPriceList || parseFloat(item.price || 0) === 0;
            
            // Użyj kosztu całkowitego (z udziałem w kosztach dodatkowych) jeśli warunki są spełnione
            if (shouldUseProductionCost) {
              finalPrice = calculateTotalUnitCost(item, selectedOrder);
              console.log(`Faktura PO: Używam kosztu całk./szt. ${finalPrice.toFixed(2)}€ dla ${item.name}`);
            } else {
              finalPrice = parseFloat(item.price || 0);
            }
          }

          return {
            ...item,
            price: finalPrice,
            totalPrice: parseFloat(item.quantity || 0) * finalPrice
          };
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
          items: mappedPOItems,
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
        
        // Całkowita wartość zamówienia (produkty + wysyłka) - bez uwzględniania PO
        const orderTotal = itemsTotal + shippingCost;
        
        // Debugowanie wartości
        console.log('Obliczanie wartości CO:', {
          itemsTotal,
          shippingCost,
          orderTotal,
          savedTotal: selectedOrder.total
        });
        
        // Używamy zapisanej wartości zamówienia jeśli istnieje, w przeciwnym razie obliczonej
        const finalTotal = parseFloat(selectedOrder.total) || orderTotal;
        
        // Sprawdź czy wartość zamówienia jest poprawna - jeśli nie, wyświetl ostrzeżenie
        if (isNaN(finalTotal) || finalTotal <= 0) {
          console.warn('Zamówienie ma wartość 0 - pozycje mogą mieć nieokreślone ceny:', finalTotal);
        }
        
        setInvoice(prev => ({
          ...prev,
          // Zachowaj już wybranego klienta, nie nadpisuj go danymi z zamówienia
          customer: prev.customer?.id ? prev.customer : selectedOrder.customer,
          // NIE dodawaj automatycznie pozycji - użytkownik je wybierze
          orderNumber: selectedOrder.orderNumber,
          // Używaj adresów z już wybranego klienta jeśli istnieje, w przeciwnym razie z zamówienia
          billingAddress: prev.customer?.billingAddress || prev.customer?.address || selectedOrder.customer?.billingAddress || selectedOrder.customer?.address || '',
          shippingAddress: prev.customer?.shippingAddress || selectedOrder.shippingAddress || prev.customer?.address || selectedOrder.customer?.address || '',
          currency: selectedOrder.currency || 'EUR',
          orderId: orderId,
          shippingInfo: shippingCost > 0 ? {
            cost: shippingCost,
            method: selectedOrder.shippingMethod || 'Standard'
          } : null,
          linkedPurchaseOrders: selectedOrder.linkedPurchaseOrders || []
        }));
        
        // Ustaw selectedCustomerId tylko jeśli nie ma już wybranego klienta
        if (selectedOrder.customer?.id && !selectedCustomerId && !invoice.customer?.id) {
          setSelectedCustomerId(selectedOrder.customer.id);
        }
      }
      
      setSelectedOrder(selectedOrder);
      
      // Pobierz powiązane faktury dla tego zamówienia
      await fetchRelatedInvoices(orderId);
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
    
    // Sprawdź czy kwoty alokacji proform nie przekraczają dostępnych kwot
    if (!invoice.isProforma && (invoice.proformAllocation || []).length > 0) {
      for (const allocation of (invoice.proformAllocation || [])) {
        const proforma = availableProformas.find(p => p.id === allocation.proformaId);
        if (!proforma) {
          showError(`Nie znaleziono proformy ${allocation.proformaNumber}`);
          return false;
        }
        
        // Sprawdź czy proforma została wystarczająco opłacona
        if (!proforma.amountInfo.isReadyForSettlement) {
          const requiredAmount = proforma.amountInfo.requiredPaymentAmount || proforma.total;
          showError(`Proforma ${allocation.proformaNumber} nie została wystarczająco opłacona (wymagane: ${requiredAmount.toFixed(2)} ${proforma.currency || 'EUR'}) i nie może być użyta`);
          return false;
        }
        
        // Dodaj tolerancję dla różnic zaokrągleń (1 grosz = 0.01)
        const tolerance = 0.01;
        if (allocation.amount > (proforma.amountInfo.available + tolerance)) {
          showError(`Kwota do rozliczenia z proformy ${allocation.proformaNumber} (${allocation.amount.toFixed(2)}) przekracza dostępną kwotę (${proforma.amountInfo.available.toFixed(2)})`);
          return false;
        }
      }
    }
    
    // Compatibility: sprawdź stary system selectedProformaId
    else if (!invoice.isProforma && invoice.settledAdvancePayments > 0 && invoice.selectedProformaId) {
      if (availableProformaAmount && invoice.settledAdvancePayments > (availableProformaAmount.available + 0.01)) {
        const selectedProforma = availableProformas.find(p => p.id === invoice.selectedProformaId);
        const proformaNumber = selectedProforma?.number || 'nieznana';
        showError(`Kwota zaliczek (${invoice.settledAdvancePayments}) przekracza dostępną kwotę z proformy ${proformaNumber} (${availableProformaAmount.available.toFixed(2)})`);
        return false;
      }
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
      
      const invoiceToSubmit = { 
        ...invoice,
        // Upewnij się, że zaliczki/przedpłaty są przekazywane
        linkedPurchaseOrders: selectedOrder?.linkedPurchaseOrders || invoice.linkedPurchaseOrders || [],
        settledAdvancePayments: parseFloat(invoice.settledAdvancePayments || 0),
        // Użyj obliczonej wartości całkowitej z zaliczkami
        total: calculateTotalWithAdvancePayments(invoice.items)
      };
      
      const isPurchaseInvoice = selectedOrderType === 'purchase' || 
                             (selectedOrder && selectedOrder.type === 'purchase');
      
      if (isPurchaseInvoice) {
        invoiceToSubmit.invoiceType = 'purchase';
      }
      
      if (invoiceId) {
        await updateInvoice(invoiceId, invoiceToSubmit, currentUser.uid);
        submittedInvoiceId = invoiceId;
        
        // Sprawdź czy PDF został zaktualizowany
        if (['issued', 'paid', 'partially_paid', 'overdue'].includes(invoiceToSubmit.status)) {
          showSuccess('Faktura została zaktualizowana i PDF został wygenerowany');
        } else {
          showSuccess('Faktura została zaktualizowana');
        }
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

  // Aktualizuj wartość całkowitą przy zmianie selectedOrder
  useEffect(() => {
    if (selectedOrder) {
      setInvoice(prev => ({
        ...prev,
        total: calculateTotalWithAdvancePayments(prev.items)
      }));
    }
  }, [selectedOrder]);

  /**
   * Filtruje proformy aby pokazać tylko te, które zawierają pozycje z obecnej faktury
   * @param {Array} proformas - Lista wszystkich dostępnych proform
   * @param {Array} invoiceItems - Pozycje obecnej faktury
   * @returns {Array} Przefiltrowana lista proform
   */
  const getFilteredProformas = (proformas, invoiceItems) => {
    if (showAllProformas || !invoiceItems || invoiceItems.length === 0) {
      return proformas;
    }
    
    return proformas.filter(proforma => {
      // Sprawdź czy proforma ma jakiekolwiek pozycje
      if (!proforma.items || proforma.items.length === 0) {
        return false;
      }
      
      // Sprawdź czy którakolwiek pozycja proformy pasuje do pozycji faktury
      return proforma.items.some(proformaItem => {
        return invoiceItems.some(invoiceItem => {
          // Dopasuj po orderItemId jeśli dostępne
          if (proformaItem.orderItemId && invoiceItem.orderItemId) {
            return proformaItem.orderItemId === invoiceItem.orderItemId;
          }
          
          // Dopasuj po ID pozycji
          if (proformaItem.id && invoiceItem.id && proformaItem.id === invoiceItem.id) {
            return true;
          }
          
          // Dopasuj po nazwie produktu (fallback)
          if (proformaItem.name && invoiceItem.name) {
            return proformaItem.name.trim().toLowerCase() === invoiceItem.name.trim().toLowerCase();
          }
          
          return false;
        });
      });
    });
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
          {t('invoices.details.buttons.backToList')}
        </Button>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <Typography variant="h4" component="h1">
            {invoiceId ? t('invoices.form.title.edit') : t('invoices.form.title.new')}
          </Typography>
          <ToggleButtonGroup
            value={invoice.isProforma ? 'proforma' : 'faktura'}
            exclusive
            onChange={(event, newValue) => {
              if (newValue !== null) {
                const isProforma = newValue === 'proforma';
                handleChange({
                  target: {
                    name: 'isProforma',
                    type: 'checkbox',
                    checked: isProforma
                  }
                });
              }
            }}
            aria-label="typ dokumentu"
            size="small"
            sx={{
              '& .MuiToggleButton-root': {
                px: 3,
                py: 1,
                fontWeight: 'bold',
                border: '2px solid',
                '&.Mui-selected': {
                  backgroundColor: 'primary.main',
                  color: 'primary.contrastText',
                  '&:hover': {
                    backgroundColor: 'primary.dark',
                  }
                }
              }
            }}
          >
            <ToggleButton value="faktura" aria-label="faktura">
              📄 {t('invoices.form.toggleButtons.invoice')}
            </ToggleButton>
            <ToggleButton value="proforma" aria-label="proforma">
              📋 {t('invoices.form.toggleButtons.proforma')}
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
        <Button
          variant="contained"
          color="primary"
          startIcon={<SaveIcon />}
          type="submit"
          disabled={saving}
        >
          {saving ? (
            invoiceId && ['issued', 'sent', 'paid', 'partially_paid', 'overdue'].includes(invoice.status) 
              ? 'Zapisywanie i regenerowanie PDF...' 
              : 'Zapisywanie...'
          ) : t('invoices.form.buttons.save')}
        </Button>
      </Box>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          {t('invoices.form.fields.basicData')}
        </Typography>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label={t('invoices.form.fields.invoiceNumber')}
                  name="number"
                  value={invoice.number}
                  onChange={handleChange}
                  helperText={invoiceId ? 
                    (invoice.isProforma ? 
                      'UWAGA: Zmiana numeru proformy zostanie automatycznie zsynchronizowana w powiązanych fakturach' : 
                      'UWAGA: Zmiana numeru faktury może wpłynąć na spójność danych księgowych'
                    ) : 
                    'Zostanie wygenerowany automatycznie jeśli pozostawisz to pole puste'
                  }
                  color={invoiceId ? "warning" : "primary"}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={plLocale}>
                  <DatePicker
                    label={t('invoices.form.fields.issueDate')}
                    value={invoice.issueDate ? new Date(invoice.issueDate) : null}
                    onChange={(date) => handleDateChange('issueDate', date)}
                    slotProps={{ textField: { fullWidth: true } }}
                  />
                </LocalizationProvider>
              </Grid>
              <Grid item xs={12} sm={6}>
                <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={plLocale}>
                  <DatePicker
                    label={t('invoices.form.fields.dueDate')}
                    value={invoice.dueDate ? new Date(invoice.dueDate) : null}
                    onChange={(date) => handleDateChange('dueDate', date)}
                    slotProps={{ textField: { fullWidth: true } }}
                  />
                </LocalizationProvider>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label={t('invoices.form.fields.requiredAdvancePayment')}
                  name="requiredAdvancePaymentPercentage"
                  type="number"
                  value={invoice.requiredAdvancePaymentPercentage || ''}
                  onChange={handleChange}
                  inputProps={{ min: 0, max: 100, step: 0.1 }}
                  helperText={t('invoices.form.fields.requiredAdvancePaymentHelper')}
                  InputProps={{
                    endAdornment: <Typography variant="body2" sx={{ color: 'text.secondary' }}>%</Typography>
                  }}
                />
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>{t('invoices.form.fields.invoiceStatus')}</InputLabel>
                  <Select
                    name="status"
                    value={invoice.status}
                    onChange={handleChange}
                    label={t('invoices.form.fields.invoiceStatus')}
                  >
                    <MenuItem value="draft">{t('invoices.status.draft')}</MenuItem>
                    <MenuItem value="issued">{t('invoices.status.issued')}</MenuItem>

                    <MenuItem value="paid">{t('invoices.status.paid')}</MenuItem>
                    <MenuItem value="partially_paid">{t('invoices.status.partiallyPaid')}</MenuItem>
                    <MenuItem value="overdue">{t('invoices.status.overdue')}</MenuItem>
                    <MenuItem value="cancelled">{t('invoices.status.cancelled')}</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>{t('invoices.form.fields.paymentMethod')}</InputLabel>
                  <Select
                    name="paymentMethod"
                    value={invoice.paymentMethod}
                    onChange={handleChange}
                    label={t('invoices.form.fields.paymentMethod')}
                  >
                    <MenuItem value="Przelew">{t('invoices.form.paymentMethods.przelew')}</MenuItem>
                    <MenuItem value="Gotówka">{t('invoices.form.paymentMethods.gotowka')}</MenuItem>
                    <MenuItem value="Karta">{t('invoices.form.paymentMethods.karta')}</MenuItem>
                    <MenuItem value="BLIK">{t('invoices.form.paymentMethods.blik')}</MenuItem>
                    <MenuItem value="Za pobraniem">Za pobraniem</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>{t('invoices.form.fields.currency')}</InputLabel>
                  <Select
                    name="currency"
                    value={invoice.currency || 'EUR'}
                    onChange={handleChange}
                    label={t('invoices.form.fields.currency')}
                  >
                    <MenuItem value="EUR">{t('invoices.form.currencies.EUR')} - Euro</MenuItem>
                    <MenuItem value="PLN">{t('invoices.form.currencies.PLN')} - Polski złoty</MenuItem>
                    <MenuItem value="USD">{t('invoices.form.currencies.USD')} - Dolar amerykański</MenuItem>
                    <MenuItem value="GBP">{t('invoices.form.currencies.GBP')} - Funt brytyjski</MenuItem>
                    <MenuItem value="CHF">CHF - Frank szwajcarski</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>{t('invoices.form.fields.bankAccount')}</InputLabel>
                  <Select
                    name="selectedBankAccount"
                    value={
                      invoice.selectedBankAccount && 
                      companyInfo?.bankAccounts?.some(account => account.id === invoice.selectedBankAccount)
                        ? invoice.selectedBankAccount 
                        : ''
                    }
                    onChange={handleChange}
                    label={t('invoices.form.fields.bankAccount')}
                  >
                    <MenuItem value="">Brak rachunku</MenuItem>
                    {companyInfo?.bankAccounts?.map(account => (
                      <MenuItem key={account.id} value={account.id}>
                        {account.bankName} - {account.accountNumber}
                        {account.swift && ` (SWIFT: ${account.swift})`}
                        {account.isDefault && ' (domyślny)'}
                      </MenuItem>
                    ))}
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
                    {t('invoices.form.fields.client')}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      variant="outlined"
                      startIcon={<PersonIcon />}
                      onClick={() => setCustomerDialogOpen(true)}
                      size="small"
                    >
                      {t('invoices.form.buttons.selectClient')}
                    </Button>
                    {invoice.customer?.id && (
                      <Button
                        variant="outlined"
                        startIcon={refreshingCustomer ? <CircularProgress size={16} /> : <RefreshIcon />}
                        onClick={refreshCustomerData}
                        disabled={refreshingCustomer}
                        size="small"
                        color="secondary"
                        title="Odśwież dane klienta"
                      >
                        {refreshingCustomer ? 'Odświeżanie...' : t('invoices.form.buttons.refresh')}
                      </Button>
                    )}
                  </Box>
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
                    
                    <Autocomplete
                      fullWidth
                      size="small"
                      sx={{ mb: 2 }}
                      options={selectedOrderType === 'customer' ? filteredOrders : purchaseOrders}
                      getOptionLabel={(option) => {
                        if (selectedOrderType === 'customer') {
                          return `${option.orderNumber} - ${option.customer?.name}${option.orderDate ? ` (${option.orderDate.toLocaleDateString()})` : ''}`;
                        } else {
                          return `${option.number} - ${option.supplier?.name} (${option.status})`;
                        }
                      }}
                      value={selectedOrderType === 'customer' 
                        ? filteredOrders.find(order => order.id === selectedOrderId) || null
                        : purchaseOrders.find(po => po.id === selectedOrderId) || null
                      }
                      onChange={(event, newValue) => {
                        handleOrderSelect(newValue ? newValue.id : '', selectedOrderType);
                      }}
                      loading={ordersLoading || purchaseOrdersLoading}
                      disabled={
                        (selectedOrderType === 'customer' && filteredOrders.length === 0) || 
                        (selectedOrderType === 'purchase' && purchaseOrders.length === 0) ||
                        ordersLoading || purchaseOrdersLoading
                      }
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label={t('invoices.form.fields.relatedOrder')}
                          placeholder="Wyszukaj zamówienie..."
                          InputProps={{
                            ...params.InputProps,
                            endAdornment: (
                              <>
                                {ordersLoading || purchaseOrdersLoading ? <CircularProgress color="inherit" size={20} /> : null}
                                {params.InputProps.endAdornment}
                              </>
                            ),
                          }}
                        />
                      )}
                      noOptionsText="Brak zamówień do wyświetlenia"
                      clearText="Wyczyść"
                      closeText="Zamknij"
                      openText="Otwórz"
                    />
                    
                                          {selectedOrderId && (
                        <Typography variant="body2" color="primary">
                          {t('invoices.form.fields.relatedOrderInfo', { orderNumber: invoice.orderNumber || selectedOrderId })}
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
            {t('invoices.form.fields.invoiceItems')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {selectedOrder && selectedOrderType === 'customer' && selectedOrder.items && selectedOrder.items.length > 0 && (
              <Button
                variant="contained"
                color="primary"
                startIcon={<AssignmentIcon />}
                onClick={() => handleOpenOrderItemsDialog(selectedOrder.items)}
              >
                {t('invoices.form.buttons.selectFromOrder')}
              </Button>
            )}
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={handleAddItem}
            >
              {t('invoices.form.buttons.addItem')}
            </Button>
          </Box>
        </Box>

        {invoice.items.map((item, index) => (
          <Card key={index} variant="outlined" sx={{ mb: 2, p: 2 }}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label={t('invoices.form.fields.productName')}
                  value={item.name}
                  onChange={(e) => handleItemChange(index, 'name', e.target.value)}
                  required
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  fullWidth
                  label={t('invoices.form.fields.description')}
                  value={item.description || ''}
                  onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                />
              </Grid>
              <Grid item xs={12} sm={2}>
                <TextField
                  fullWidth
                  label={t('invoices.form.fields.cnCode')}
                  value={item.cnCode || ''}
                  onChange={(e) => handleItemChange(index, 'cnCode', e.target.value)}
                  placeholder={t('invoices.form.fields.cnCodePlaceholder')}
                  helperText={t('invoices.form.fields.classificationCode')}
                />
              </Grid>
              <Grid item xs={6} sm={2}>
                <TextField
                  fullWidth
                  label={t('invoices.form.fields.quantity')}
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
                  label={t('invoices.form.fields.unit')}
                  value={item.unit}
                  onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                  required
                />
              </Grid>
              <Grid item xs={6} sm={2}>
                <TextField
                  fullWidth
                  label={t('invoices.form.fields.netPrice')}
                  type="number"
                  value={item.price}
                  onChange={(e) => handleItemChange(index, 'price', parseFloat(e.target.value))}
                  required
                  inputProps={{ min: 0, step: 0.01 }}
                />
              </Grid>
              <Grid item xs={6} sm={2}>
                <FormControl fullWidth>
                  <InputLabel>{t('invoices.form.fields.vatPercent')}</InputLabel>
                  <Select
                    value={item.vat || (item.vat === 0 ? 0 : 0)}
                    onChange={(e) => handleItemChange(index, 'vat', e.target.value)}
                    label={t('invoices.form.fields.vatPercent')}
                  >
                    <MenuItem value={0}>0%</MenuItem>
                    <MenuItem value={5}>5%</MenuItem>
                    <MenuItem value={8}>8%</MenuItem>
                    <MenuItem value={23}>23%</MenuItem>
                    <MenuItem value="ZW">ZW</MenuItem>
                    <MenuItem value="NP">NP</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={6} sm={3}>
                <TextField
                  fullWidth
                  label={t('invoices.form.fields.netValue')}
                  type="number"
                  value={item.netValue || (item.quantity * item.price)}
                  onChange={(e) => handleItemChange(index, 'netValue', parseFloat(e.target.value))}
                  inputProps={{ min: 0, step: 0.01 }}
                  InputProps={{
                    endAdornment: invoice.currency || 'EUR'
                  }}
                />
              </Grid>
              <Grid item xs={6} sm={3}>
                <Typography variant="body1" fontWeight="bold">
                  {t('invoices.form.fields.grossValue')}: {((item.netValue || (item.quantity * item.price)) * (1 + (typeof item.vat === 'number' || item.vat === 0 ? item.vat : 0) / 100)).toFixed(2)} {invoice.currency || 'EUR'}
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
                  Wartość netto: {parseFloat(invoice.shippingInfo.cost).toFixed(2)} {invoice.currency || 'EUR'}
                </Typography>
              </Grid>
            </Grid>
          </Card>
        )}

        {/* Wyświetl informacje o powiązanych zamówieniach zakupowych */}
        {selectedOrder && selectedOrder.linkedPurchaseOrders && selectedOrder.linkedPurchaseOrders.length > 0 && (
          <>
            <Typography variant="subtitle1" sx={{ mt: 3, mb: 1 }}>
              Zaliczki/Przedpłaty:
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
                        Zaliczka/Przedpłata {po.number || po.id}
                      </Typography>
                      {po.supplier && (
                        <Typography variant="body2">
                          Dostawca: {po.supplier.name}
                        </Typography>
                      )}
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="body1">
                        Wartość netto: {productsValue.toFixed(2)} {invoice.currency || 'EUR'}
                      </Typography>
                      {additionalCostsValue > 0 && (
                        <Typography variant="body1" color="primary">
                          Dodatkowe opłaty: {additionalCostsValue.toFixed(2)} {invoice.currency || 'EUR'}
                        </Typography>
                      )}
                      <Typography variant="body1" fontWeight="bold">
                        Wartość zaliczki: {poValue.toFixed(2)} {invoice.currency || 'EUR'}
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
          <Grid item xs={12} sm={8} md={6}>
            <Typography variant="body1" fontWeight="bold">
              {t('invoices.form.fields.totals.netTotal')} {invoice.items.reduce((sum, item) => {
                const quantity = Number(item.quantity) || 0;
                const price = Number(item.price) || 0;
                return sum + (quantity * price);
              }, 0).toFixed(2)} {invoice.currency || 'EUR'}
            </Typography>
            <Typography variant="body1" fontWeight="bold">
              {t('invoices.form.fields.totals.vatTotal')} {invoice.items.reduce((sum, item) => {
                const quantity = Number(item.quantity) || 0;
                const price = Number(item.price) || 0;
                
                // Sprawdź czy stawka VAT to liczba czy string "ZW" lub "NP"
                let vatRate = 0;
                if (typeof item.vat === 'number') {
                  vatRate = item.vat;
                } else if (item.vat !== "ZW" && item.vat !== "NP") {
                  vatRate = parseFloat(item.vat) || 0;
                }
                // Dla "ZW" i "NP" vatRate pozostaje 0
                
                return sum + (quantity * price * (vatRate / 100));
              }, 0).toFixed(2)} {invoice.currency || 'EUR'}
            </Typography>
            
            {/* Dodanie pola dla rozliczonych zaliczek/przedpłat - ukryte dla proform */}
            {!invoice.isProforma && availableProformas.length > 0 && (
              <Box sx={{ mt: 2, mb: 2 }}>
                {/* Nagłówek z checkboxem */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle1">
                    {t('invoices.form.fields.proformaSettlement')}
                  </Typography>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={showAllProformas}
                        onChange={(e) => setShowAllProformas(e.target.checked)}
                        size="small"
                      />
                    }
                    label="Pokaż wszystkie proformy"
                  />
                </Box>
                
                {/* Informacja o filtrowaniu */}
                {!showAllProformas && invoice.items && invoice.items.length > 0 && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontStyle: 'italic' }}>
                    Wyświetlane są tylko proformy zawierające pozycje z tej faktury. 
                    Zaznacz checkbox powyżej, aby wyświetlić wszystkie dostępne proformy.
                  </Typography>
                )}
                
                {/* Przefiltrowana lista proform */}
                {(() => {
                  const filteredProformas = getFilteredProformas(availableProformas, invoice.items);
                  
                  // Pokaż komunikat jeśli brak pasujących proform
                  if (filteredProformas.length === 0 && !showAllProformas) {
                    return (
                      <Typography variant="body2" color="warning.main" sx={{ p: 2, bgcolor: 'warning.lighter', borderRadius: 1 }}>
                        Brak proform zawierających pozycje z tej faktury. 
                        Zaznacz "Pokaż wszystkie proformy" aby wyświetlić wszystkie dostępne proformy.
                      </Typography>
                    );
                  }
                  
                  return filteredProformas.map((proforma) => {
                    const allocation = (invoice.proformAllocation || []).find(a => a.proformaId === proforma.id);
                    const allocatedAmount = allocation ? allocation.amount : 0;
                    
                    return (
                      <Card key={proforma.id} variant="outlined" sx={{ mb: 2, p: 2 }}>
                        <Grid container spacing={2} alignItems="center">
                          <Grid item xs={12} md={5}>
                            <Typography variant="body1" fontWeight="bold">
                              📋 {t('invoices.form.toggleButtons.proforma')} {proforma.number}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              {t('invoices.form.fields.issueDate')}: {proforma.issueDate ? 
                                (proforma.issueDate.seconds ? 
                                  new Date(proforma.issueDate.seconds * 1000).toLocaleDateString() 
                                  : new Date(proforma.issueDate).toLocaleDateString()
                                ) : t('common.noDate')}
                            </Typography>
                            {/* Pokaż wspólne pozycje */}
                            {!showAllProformas && proforma.items && invoice.items && (
                              (() => {
                                // Znajdź wspólne pozycje
                                const commonItems = proforma.items.filter(pItem => 
                                  invoice.items.some(iItem => 
                                    (pItem.orderItemId && iItem.orderItemId && pItem.orderItemId === iItem.orderItemId) ||
                                    (pItem.id && iItem.id && pItem.id === iItem.id) ||
                                    (pItem.name && iItem.name && pItem.name.trim().toLowerCase() === iItem.name.trim().toLowerCase())
                                  )
                                );
                                
                                if (commonItems.length === 0) return null;
                                
                                // Pobierz nazwy produktów
                                const itemNames = commonItems.map(item => item.name).join(', ');
                                const isLongList = itemNames.length > 60;
                                
                                return (
                                  <Box sx={{ mt: 1, p: 1, bgcolor: 'primary.lighter', borderRadius: 1 }}>
                                    <Typography variant="caption" fontWeight="bold" color="primary.main" sx={{ display: 'block' }}>
                                      Wspólne pozycje ({commonItems.length}):
                                    </Typography>
                                    {isLongList ? (
                                      <Tooltip title={itemNames} arrow placement="top">
                                        <Typography variant="caption" color="primary.main" sx={{ display: 'block', cursor: 'help' }}>
                                          {itemNames.substring(0, 60)}... <strong>(najedź aby zobaczyć wszystkie)</strong>
                                        </Typography>
                                      </Tooltip>
                                    ) : (
                                      <Typography variant="caption" color="primary.main" sx={{ display: 'block' }}>
                                        {itemNames}
                                      </Typography>
                                    )}
                                  </Box>
                                );
                              })()
                            )}
                          </Grid>
                          
                          <Grid item xs={12} md={3}>
                            <Typography variant="body2">
                              <strong>{t('invoices.form.fields.available')}:</strong> {proforma.amountInfo.available.toFixed(2)} {proforma.currency || 'EUR'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {t('invoices.form.fields.from')} {proforma.amountInfo.total.toFixed(2)} {proforma.currency || 'EUR'} 
                              ({t('invoices.form.fields.used')}: {proforma.amountInfo.used.toFixed(2)})
                            </Typography>
                          </Grid>
                          
                          <Grid item xs={12} md={4}>
                            <TextField
                              fullWidth
                              size="small"
                              label={t('invoices.form.fields.amountToSettle')}
                              type="number"
                              value={allocatedAmount}
                              onChange={(e) => {
                                const amount = parseFloat(e.target.value) || 0;
                                handleProformaAllocationChange(proforma.id, amount, proforma.number);
                              }}
                              InputProps={{
                                endAdornment: <Typography variant="caption">{invoice.currency || 'EUR'}</Typography>,
                                inputProps: { 
                                  min: 0, 
                                  step: 0.01,
                                  max: proforma.amountInfo.available + 0.01
                                }
                              }}
                              error={allocatedAmount > (proforma.amountInfo.available + 0.01)}
                              helperText={
                                allocatedAmount > (proforma.amountInfo.available + 0.01)
                                  ? `${t('invoices.form.fields.exceedsAvailable')} (${proforma.amountInfo.available.toFixed(2)})`
                                  : null
                              }
                              disabled={proforma.amountInfo.available <= 0}
                            />
                          </Grid>
                        </Grid>
                        
                        {proforma.amountInfo.available <= 0 && (
                          <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>
                            ⚠️ {t('invoices.form.fields.proformaFullyUsed')}
                          </Typography>
                        )}
                      </Card>
                    );
                  });
                })()}
                
                {/* Podsumowanie rozliczenia */}
                {(invoice.proformAllocation || []).length > 0 && (
                  <Box sx={{ mt: 2, p: 2, bgcolor: 'success.light', borderRadius: 1 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      {t('invoices.form.fields.settlementSummary')}
                    </Typography>
                    {(invoice.proformAllocation || []).map((allocation) => (
                      <Typography key={allocation.proformaId} variant="body2">
                        • {t('invoices.form.toggleButtons.proforma')} {allocation.proformaNumber}: {allocation.amount.toFixed(2)} {invoice.currency || 'EUR'}
                      </Typography>
                    ))}
                    <Typography variant="body1" fontWeight="bold" sx={{ mt: 1 }}>
                      {t('invoices.form.fields.totalAdvanceAmount')} {getTotalAllocatedAmount().toFixed(2)} {invoice.currency || 'EUR'}
                    </Typography>
                  </Box>
                )}
              </Box>
            )}
            
            {/* Informacja gdy brak proform */}
            {!invoice.isProforma && availableProformas.length === 0 && relatedInvoices.length > 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', mt: 2 }}>
                Brak dostępnych proform dla tego zamówienia do rozliczenia zaliczek.
                <br />
                <Typography variant="caption" color="warning.main">
                  Uwaga: Tylko w pełni opłacone proformy mogą być użyte do rozliczenia.
                </Typography>
              </Typography>
            )}
            
            {/* Wyświetl dodatkowe koszty, jeśli istnieją */}
            {invoice.shippingInfo && invoice.shippingInfo.cost > 0 && (
              <Typography variant="body1" fontWeight="bold">
                Koszt wysyłki: {parseFloat(invoice.shippingInfo.cost).toFixed(2)} {invoice.currency || 'EUR'}
              </Typography>
            )}
            
            {/* Wyświetl sumę z powiązanych PO */}
            {selectedOrder && selectedOrder.linkedPurchaseOrders && selectedOrder.linkedPurchaseOrders.length > 0 && (
              <Typography variant="body1" fontWeight="bold">
                Wartość zaliczek/przedpłat: {selectedOrder.linkedPurchaseOrders.reduce((sum, po) => sum + (parseFloat(po.totalGross || po.value) || 0), 0).toFixed(2)} {invoice.currency || 'EUR'}
              </Typography>
            )}

            {/* Wyświetl kwotę proformy dla tego zamówienia */}
            {relatedInvoices.length > 0 && (
              <Box sx={{ mt: 2, mb: 2, p: 2, bgcolor: 'info.light', borderRadius: 1 }}>
                <Typography variant="subtitle2" gutterBottom>
                  {t('invoices.form.fields.relatedInvoices')}
                </Typography>
                {loadingRelatedInvoices ? (
                  <CircularProgress size={20} />
                ) : (
                  relatedInvoices.map((relInvoice) => (
                    <Box key={relInvoice.id} sx={{ mb: 1 }}>
                      <Typography variant="body2">
                        {relInvoice.isProforma ? '📋 Proforma' : '📄 Faktura'} {relInvoice.number}
                        {relInvoice.isProforma && (
                          <Typography component="span" sx={{ fontWeight: 'bold', color: 'warning.main', ml: 1 }}>
                            - Kwota: {parseFloat(relInvoice.total || 0).toFixed(2)} {relInvoice.currency || 'EUR'}
                            {availableProformaAmount && relInvoice.id === relatedInvoices.find(inv => inv.isProforma)?.id && (
                              <Typography component="span" sx={{ color: 'success.main', ml: 1 }}>
                                (Dostępne: {availableProformaAmount.available.toFixed(2)} {relInvoice.currency || 'EUR'})
                              </Typography>
                            )}
                          </Typography>
                        )}
                      </Typography>
                      {relInvoice.issueDate && (
                        <Typography variant="caption" color="text.secondary">
                          {t('invoices.form.fields.issueDate')}: {new Date(relInvoice.issueDate).toLocaleDateString()}
                        </Typography>
                      )}
                    </Box>
                  ))
                )}
              </Box>
            )}
            
            {/* Obliczenie wartości brutto bez przedpłat */}
            {(() => {
              const nettoValue = parseFloat(invoice.items.reduce((sum, item) => {
                const quantity = Number(item.quantity) || 0;
                const price = Number(item.price) || 0;
                return sum + (quantity * price);
              }, 0));
              
              const vatValue = parseFloat(invoice.items.reduce((sum, item) => {
                const quantity = Number(item.quantity) || 0;
                const price = Number(item.price) || 0;
                
                let vatRate = 0;
                if (typeof item.vat === 'number') {
                  vatRate = item.vat;
                } else if (item.vat !== "ZW" && item.vat !== "NP") {
                  vatRate = parseFloat(item.vat) || 0;
                }
                
                return sum + (quantity * price * (vatRate / 100));
              }, 0));
              
              const bruttoValue = nettoValue + vatValue;
              const totalAdvancePayments = invoice.isProforma ? 0 : getTotalAllocatedAmount();
              const finalAmount = bruttoValue - totalAdvancePayments;
              
              return (
                                  <>
                    <Typography variant="h6" fontWeight="bold" color="primary">
                      {t('invoices.form.fields.totals.grossTotal')} {bruttoValue.toFixed(2)} {invoice.currency || 'EUR'}
                    </Typography>
                    
                    {!invoice.isProforma && totalAdvancePayments > 0 && (
                      <>
                        <Typography variant="body1" color="warning.main" sx={{ mt: 1 }}>
                          Przedpłaty z proform: -{totalAdvancePayments.toFixed(2)} {invoice.currency || 'EUR'}
                        </Typography>
                        <Typography variant="h5" fontWeight="bold" color="success.main" sx={{ mt: 1 }}>
                          Do zapłaty: {finalAmount.toFixed(2)} {invoice.currency || 'EUR'}
                        </Typography>
                      </>
                    )}
                    
                    {!invoice.isProforma && totalAdvancePayments === 0 && (
                      <Typography variant="h6" fontWeight="bold" color="success.main" sx={{ mt: 1 }}>
                        Do zapłaty: {bruttoValue.toFixed(2)} {invoice.currency || 'EUR'}
                      </Typography>
                    )}
                  </>
              );
            })()}
          </Grid>
        </Grid>
      </Paper>
      
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          {t('invoices.form.fields.additionalInfo')}
        </Typography>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <TextField
              fullWidth
              multiline
              rows={4}
              label={t('invoices.form.fields.notes')}
              name="notes"
              value={invoice.notes || ''}
              onChange={handleChange}
            />
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          {t('invoices.form.fields.invoiceSource')}
        </Typography>
        
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <FormControl fullWidth>
              <InputLabel>{t('invoices.form.fields.orderType')}</InputLabel>
              <Select
                value={selectedOrderType}
                onChange={(e) => setSelectedOrderType(e.target.value)}
                label={t('invoices.form.fields.orderType')}
              >
                <MenuItem value="customer">{t('invoices.form.orderTypes.customer')}</MenuItem>
                <MenuItem value="purchase">Zamówienie zakupowe (PO)</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} md={8}>
            <FormControl fullWidth>
              <InputLabel>{t('invoices.form.buttons.selectOrder')}</InputLabel>
              <Select
                value={selectedOrderId || ''}
                onChange={(e) => handleOrderSelect(e.target.value, selectedOrderType)}
                label={t('invoices.form.buttons.selectOrder')}
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
        <DialogTitle>{t('invoices.form.buttons.selectClient')}</DialogTitle>
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
          <Button onClick={() => setCustomerDialogOpen(false)}>{t('invoices.form.buttons.cancel')}</Button>
          <Button 
            variant="contained"
            onClick={() => navigate('/customers')}
          >
            {t('invoices.form.buttons.manageClients')}
          </Button>
          <Button 
            variant="contained"
            color="primary"
            onClick={() => handleCustomerSelect(selectedCustomerId)}
            disabled={!selectedCustomerId}
          >
            {t('common.select')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog wyboru pozycji z zamówienia */}
      <Dialog
        open={orderItemsDialogOpen}
        onClose={() => setOrderItemsDialogOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">
              {t('invoices.form.buttons.selectFromOrder')} {selectedOrder?.orderNumber}
            </Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={handleSelectAllOrderItems}
            >
              {availableOrderItems.every(item => item.selected) ? t('invoices.form.buttons.deselectAll') : t('invoices.form.buttons.selectAll')}
            </Button>
          </Box>
        </DialogTitle>
        <DialogContent>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">{t('common.select')}</TableCell>
                  <TableCell>{t('common.name')}</TableCell>
                  <TableCell>{t('invoices.form.fields.description')}</TableCell>
                  <TableCell>{t('invoices.form.fields.cnCode')}</TableCell>
                  <TableCell align="right">{t('invoices.form.fields.quantity')}</TableCell>
                  <TableCell>{t('invoices.form.fields.unit')}</TableCell>
                  <TableCell align="right">{t('common.price')}</TableCell>
                  <TableCell align="right">{t('invoices.form.fields.netValue')}</TableCell>
                  {!invoice.isProforma && <TableCell align="right">Zafakturowano</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {availableOrderItems.map((item, index) => (
                  <TableRow 
                    key={index}
                    hover={!item.hasProforma && !item.isFullyInvoiced}
                    sx={{ 
                      '&:hover': { 
                        backgroundColor: (item.hasProforma || item.isFullyInvoiced) ? 'inherit' : 'action.hover' 
                      },
                      backgroundColor: item.selected ? 'action.selected' : 
                                      item.hasProforma ? 'error.light' :
                                      item.isFullyInvoiced ? 'grey.200' :
                                      'inherit',
                      opacity: item.isFullyInvoiced ? 0.6 : 1
                    }}
                  >
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={item.selected}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleToggleOrderItem(index);
                        }}
                        disabled={(invoice.isProforma && item.hasProforma) || item.isFullyInvoiced}
                      />
                    </TableCell>
                    <TableCell 
                      onClick={() => !(item.hasProforma || item.isFullyInvoiced) && handleToggleOrderItem(index)}
                      sx={{ cursor: (item.hasProforma || item.isFullyInvoiced) ? 'not-allowed' : 'pointer' }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {item.name}
                        {item.hasProforma && (
                          <Tooltip title={`Pozycja ma już wystawioną proformę: ${
                            item.proformaInfo.proformas.map(pf => pf.proformaNumber).join(', ')
                          }`}>
                            <Chip 
                              label="Ma proformę" 
                              color="error" 
                              size="small"
                              sx={{ fontSize: '0.7rem' }}
                            />
                          </Tooltip>
                        )}
                        {item.isFullyInvoiced && (
                          <Tooltip title={`Pozycja została w pełni zafakturowana (${
                            item.invoicedInfo?.invoices.map(inv => inv.invoiceNumber).join(', ')
                          })`}>
                            <Chip 
                              label="W pełni zafakturowane" 
                              color="default" 
                              size="small"
                              sx={{ fontSize: '0.7rem' }}
                            />
                          </Tooltip>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell 
                      onClick={() => !(item.hasProforma || item.isFullyInvoiced) && handleToggleOrderItem(index)}
                      sx={{ cursor: (item.hasProforma || item.isFullyInvoiced) ? 'not-allowed' : 'pointer' }}
                    >
                      {item.description || '-'}
                    </TableCell>
                    <TableCell 
                      onClick={() => !(item.hasProforma || item.isFullyInvoiced) && handleToggleOrderItem(index)}
                      sx={{ cursor: (item.hasProforma || item.isFullyInvoiced) ? 'not-allowed' : 'pointer' }}
                    >
                      {item.cnCode || '-'}
                    </TableCell>
                    <TableCell 
                      align="right"
                      onClick={() => !(item.hasProforma || item.isFullyInvoiced) && handleToggleOrderItem(index)}
                      sx={{ cursor: (item.hasProforma || item.isFullyInvoiced) ? 'not-allowed' : 'pointer' }}
                    >
                      {item.quantity}
                    </TableCell>
                    <TableCell 
                      onClick={() => !(item.hasProforma || item.isFullyInvoiced) && handleToggleOrderItem(index)}
                      sx={{ cursor: (item.hasProforma || item.isFullyInvoiced) ? 'not-allowed' : 'pointer' }}
                    >
                      {item.unit || 'szt.'}
                    </TableCell>
                    <TableCell 
                      align="right"
                      onClick={() => !(item.hasProforma || item.isFullyInvoiced) && handleToggleOrderItem(index)}
                      sx={{ cursor: (item.hasProforma || item.isFullyInvoiced) ? 'not-allowed' : 'pointer' }}
                    >
                      {item.price?.toFixed(4)} {invoice.currency || 'EUR'}
                    </TableCell>
                    <TableCell 
                      align="right"
                      onClick={() => !(item.hasProforma || item.isFullyInvoiced) && handleToggleOrderItem(index)}
                      sx={{ cursor: (item.hasProforma || item.isFullyInvoiced) ? 'not-allowed' : 'pointer' }}
                    >
                      {item.netValue?.toFixed(2)} {invoice.currency || 'EUR'}
                    </TableCell>
                    {!invoice.isProforma && (
                      <TableCell align="right">
                        {item.invoicedInfo ? (
                          <Tooltip
                            title={
                              <Box>
                                <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                                  Zamówienie: {item.originalQuantity} {item.unit || 'szt.'} = {item.originalValue?.toFixed(2)} {invoice.currency || 'EUR'}
                                </Typography>
                                <Typography variant="caption" sx={{ display: 'block' }}>
                                  Zafakturowano: {item.invoicedInfo.totalInvoicedQuantity} {item.unit || 'szt.'} = {item.invoicedInfo.totalInvoicedValue?.toFixed(2)} {invoice.currency || 'EUR'}
                                </Typography>
                                <Typography variant="caption" sx={{ display: 'block', mt: 1, fontWeight: 'bold' }}>
                                  Pozostało: {item.quantity} {item.unit || 'szt.'} = {item.netValue?.toFixed(2)} {invoice.currency || 'EUR'}
                                </Typography>
                                <Divider sx={{ my: 1, borderColor: 'white' }} />
                                {item.invoicedInfo.invoices.map((inv, idx) => (
                                  <Typography key={idx} variant="caption" sx={{ display: 'block' }}>
                                    • {inv.invoiceNumber}: {inv.quantity} {item.unit || 'szt.'} = {inv.itemValue?.toFixed(2)} {invoice.currency || 'EUR'}
                                  </Typography>
                                ))}
                              </Box>
                            }
                            arrow
                            placement="left"
                          >
                            <Box sx={{ cursor: 'help' }}>
                              <Typography variant="caption" sx={{ display: 'block', color: 'success.dark', fontWeight: 'bold' }}>
                                {item.invoicedInfo.totalInvoicedQuantity} {item.unit || 'szt.'}
                              </Typography>
                              <Typography variant="caption" sx={{ display: 'block', color: 'success.dark' }}>
                                {item.invoicedInfo.totalInvoicedValue?.toFixed(2)} {invoice.currency || 'EUR'}
                              </Typography>
                            </Box>
                          </Tooltip>
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            -
                          </Typography>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          
          {availableOrderItems.filter(item => item.selected).length > 0 && (
            <Box sx={{ mt: 2, p: 2, bgcolor: 'info.light', borderRadius: 1 }}>
              <Typography variant="subtitle2">
                Wybrane pozycje: {availableOrderItems.filter(item => item.selected).length}
              </Typography>
              <Typography variant="body2">
                Łączna wartość: {availableOrderItems
                  .filter(item => item.selected)
                  .reduce((sum, item) => sum + (item.netValue || 0), 0)
                  .toFixed(2)} {invoice.currency || 'EUR'}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOrderItemsDialogOpen(false)}>
            {t('invoices.form.buttons.cancel')}
          </Button>
          <Button 
            onClick={handleConfirmOrderItemsSelection}
            variant="contained"
            disabled={availableOrderItems.filter(item => item.selected).length === 0}
          >
            Dodaj wybrane pozycje ({availableOrderItems.filter(item => item.selected).length})
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default InvoiceForm; 