import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
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
import { preciseCompare } from '../../utils/mathUtils';
import { COMPANY_INFO } from '../../config';
import { getCompanyInfo } from '../../services/companyService';
import { useTranslation } from '../../hooks/useTranslation';
// ✅ OPTYMALIZACJA: Import wspólnych stylów MUI
import { 
  flexCenter, 
  flexBetween,
  loadingContainer,
  mb1,
  mb2,
  mb3,
  mt1,
  mt2,
  mr1,
  p2
} from '../../styles/muiCommonStyles';

const InvoiceForm = ({ invoiceId }) => {
  const [searchParams] = useSearchParams();
  const customerId = searchParams.get('customerId');
  const [invoice, setInvoice] = useState({ 
    ...DEFAULT_INVOICE,
    settledAdvancePayments: 0,
    selectedProformaId: null,
    proformAllocation: [],
    isRefInvoice: false
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
  // Stany dla wyszukiwania PO (on-demand z debounce)
  const [poSearchTerm, setPoSearchTerm] = useState('');
  const [poSearchResults, setPoSearchResults] = useState([]);
  const [poSearchLoading, setPoSearchLoading] = useState(false);
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
  
  // Stany dla faktury korygującej
  const [correctionDialogOpen, setCorrectionDialogOpen] = useState(false);
  const [correctionItems, setCorrectionItems] = useState([]); // Pozycje do korekty z informacjami o zafakturowanych ilościach
  const [loadingCorrectionItems, setLoadingCorrectionItems] = useState(false);

  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  useEffect(() => {
    const init = async () => {
      // Pobierz dane klientów
      fetchCustomers();
      // Nie pobieraj zamówień CO ani PO - będą pobierane on demand:
      // - CO: po wyborze klienta (filtrowanie po stronie serwera)
      // - PO: po włączeniu opcji "Refaktura"
      
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
      // Jeśli przekierowano z zamówienia z preselectedOrder (np. dla faktury korygującej)
      else if (location.state?.preselectedOrder && location.state?.isCorrectionInvoice) {
        await handleCorrectionInvoiceFromOrder(location.state.preselectedOrder);
      }
    };
    
    init();
  }, [invoiceId, customerId]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Efekt do pobierania zamówień po wyborze klienta (filtrowanie po stronie serwera)
  useEffect(() => {
    const fetchOrdersForCustomer = async () => {
      if (invoice.customer?.id) {
        setOrdersLoading(true);
        try {
          // Pobierz zamówienia tylko dla wybranego klienta (filtrowanie po stronie serwera)
          const fetchedOrders = await getAllOrders({ customerId: invoice.customer.id });
          
          // Formatowanie dat
          const ordersWithFormattedDates = fetchedOrders.map(order => {
            let formattedDate = null;
            if (order.orderDate) {
              try {
                if (order.orderDate instanceof Date) {
                  formattedDate = order.orderDate;
                } else if (order.orderDate.toDate && typeof order.orderDate.toDate === 'function') {
                  formattedDate = order.orderDate.toDate();
                } else if (typeof order.orderDate === 'string' || typeof order.orderDate === 'number') {
                  formattedDate = new Date(order.orderDate);
                }
                if (formattedDate && isNaN(formattedDate.getTime())) {
                  formattedDate = null;
                }
              } catch (e) {
                console.warn('Problem z parsowaniem daty zamówienia:', e);
              }
            }
            return { ...order, orderDate: formattedDate };
          });
          
          setFilteredOrders(ordersWithFormattedDates);
          setOrders(ordersWithFormattedDates); // Zachowaj też w orders dla kompatybilności
        } catch (error) {
          console.error('Błąd podczas pobierania zamówień dla klienta:', error);
          setFilteredOrders([]);
        } finally {
          setOrdersLoading(false);
        }
      } else {
        setFilteredOrders([]);
      }
    };
    
    fetchOrdersForCustomer();
  }, [invoice.customer?.id]);

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
  // NIE resetuj automatycznie - tylko loguj ostrzeżenie dla debugowania
  useEffect(() => {
    if (invoice.selectedBankAccount && companyInfo?.bankAccounts && companyInfo.bankAccounts.length > 0) {
      const accountExists = companyInfo.bankAccounts.some(account => account.id === invoice.selectedBankAccount);
      
      if (!accountExists) {
        console.warn(`Rachunek bankowy ${invoice.selectedBankAccount} nie istnieje w dostępnych rachunkach. Dostępne rachunki:`, 
          companyInfo.bankAccounts.map(a => ({ id: a.id, name: a.bankName }))
        );
        // NIE resetujemy automatycznie - użytkownik może wybrać inny bank ręcznie
        // lub bank może być zapisany poprawnie ale jeszcze nie załadowany
      }
    }
  }, [invoice.selectedBankAccount, companyInfo?.bankAccounts]);

  // Efekt do automatycznego ustawienia selectedOrder gdy dane są dostępne podczas edycji faktury
  useEffect(() => {
    if (selectedOrderId && selectedOrderType && !selectedOrder) {
      const isCustomerOrder = selectedOrderType === 'customer';
      const ordersList = isCustomerOrder ? orders : poSearchResults;
      const isLoading = isCustomerOrder ? ordersLoading : poSearchLoading;
      
      // Sprawdź czy dane zamówień są już załadowane i lista nie jest pusta
      if (!isLoading && ordersList.length > 0) {
        handleOrderSelect(selectedOrderId, selectedOrderType);
      }
    }
  }, [selectedOrderId, selectedOrderType, orders, poSearchResults, ordersLoading, poSearchLoading, selectedOrder]);

  // Efekt do automatycznego przełączenia na PO gdy zaznaczono refakturę
  useEffect(() => {
    if (invoice.isRefInvoice && selectedOrderType !== 'purchase') {
      setSelectedOrderType('purchase');
      // Wyczyść wybrane zamówienie klienta jeśli było
      setSelectedOrderId('');
      setSelectedOrder(null);
    } else if (!invoice.isRefInvoice && !invoice.isProforma && selectedOrderType === 'purchase' && !invoice.invoiceType) {
      // Przywróć na customer tylko jeśli to nie jest edycja faktury zakupowej
      setSelectedOrderType('customer');
      // Wyczyść wybrane PO jeśli było
      setSelectedOrderId('');
      setSelectedOrder(null);
    }
  }, [invoice.isRefInvoice]); // eslint-disable-line react-hooks/exhaustive-deps

  // Efekt do wyszukiwania PO z debounce (wyszukiwanie po stronie serwera)
  useEffect(() => {
    // Wyszukuj tylko gdy włączona refaktura i wpisano min 2 znaki
    if (!invoice.isRefInvoice || poSearchTerm.length < 2) {
      if (poSearchTerm.length === 0) {
        setPoSearchResults([]);
      }
      return;
    }

    setPoSearchLoading(true);
    
    // Debounce - czekaj 300ms po ostatnim naciśnięciu klawisza
    const timeoutId = setTimeout(async () => {
      try {
        const { searchPurchaseOrdersByNumber } = await import('../../services/purchaseOrderService');
        const results = await searchPurchaseOrdersByNumber(poSearchTerm);
        setPoSearchResults(results);
      } catch (error) {
        console.error('Błąd wyszukiwania PO:', error);
        setPoSearchResults([]);
      } finally {
        setPoSearchLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timeoutId);
      setPoSearchLoading(false);
    };
  }, [poSearchTerm, invoice.isRefInvoice]);

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

  const fetchRelatedInvoices = useCallback(async (orderId) => {
    if (!orderId) {
      setRelatedInvoices([]);
      setAvailableProformaAmount(null);
      setAvailableProformas([]);
      return;
    }
    
    console.log(`[fetchRelatedInvoices] Rozpoczynam pobieranie dla zamówienia: ${orderId}, faktura: ${invoiceId || 'nowa'}`);
    setLoadingRelatedInvoices(true);
    try {
      const invoices = await getInvoicesByOrderId(orderId);
      // Filtruj tylko faktury inne niż obecna (jeśli edytujemy istniejącą)
      const filteredInvoices = invoices.filter(inv => inv.id !== invoiceId);
      setRelatedInvoices(filteredInvoices);
      console.log(`[fetchRelatedInvoices] ✅ Załadowano ${filteredInvoices.length} powiązanych faktur`);
      
      // Pobierz wszystkie dostępne proformy z ich kwotami
      // Jeśli edytujemy istniejącą fakturę, uwzględnij to przy obliczaniu dostępnych kwot
      console.log(`[fetchRelatedInvoices] Pobieranie dostępnych proform...`);
      const proformasWithAmounts = await getAvailableProformasForOrderWithExclusion(orderId, invoiceId);
      // Filtruj proformy inne niż obecna faktura (jeśli edytujemy proformę)
      const filteredProformas = proformasWithAmounts.filter(proforma => proforma.id !== invoiceId);
      setAvailableProformas(filteredProformas);
      console.log(`[fetchRelatedInvoices] ✅ Załadowano ${filteredProformas.length} dostępnych proform`);
      
      // Aktualizacja availableProformaAmount dla starego systemu kompatybilności
      setInvoice(prev => {
        if (prev.selectedProformaId) {
          const selectedProforma = filteredProformas.find(p => p.id === prev.selectedProformaId);
          if (selectedProforma) {
            setAvailableProformaAmount(selectedProforma.amountInfo);
          } else {
            setAvailableProformaAmount(null);
          }
        } else {
          setAvailableProformaAmount(null);
        }
        return prev; // Zwróć poprzedni stan bez zmian
      });
    } catch (error) {
      console.error('[fetchRelatedInvoices] ❌ Błąd podczas pobierania powiązanych faktur:', error);
      setRelatedInvoices([]);
      setAvailableProformaAmount(null);
      setAvailableProformas([]);
    } finally {
      setLoadingRelatedInvoices(false);
    }
  }, [invoiceId]); // Tylko invoiceId w dependencies

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

    // Pobierz informacje o zafakturowanych ilościach dla tego zamówienia (dla zwykłych faktur i faktur korygujących)
    let invoicedAmounts = {};
    if (selectedOrderId && !invoice.isProforma) {
      try {
        // Pobierz wszystkie faktury dla tego zamówienia
        const relatedInvoices = await getInvoicesByOrderId(selectedOrderId);
        // Filtruj faktury inne niż obecna (jeśli edytujemy) - dla korekty nie filtrujemy bo chcemy widzieć wszystkie zafakturowane
        const filteredInvoices = invoice.isCorrectionInvoice 
          ? relatedInvoices.filter(inv => !inv.isCorrectionInvoice) // Dla korekty - wszystkie faktury oprócz innych korekt
          : relatedInvoices.filter(inv => inv.id !== invoiceId);
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
      let totalInvoicedQuantity = 0;
      let totalInvoicedValue = 0;
      
      if (!invoice.isProforma && invoicedAmounts[itemId]) {
        const invoicedData = invoicedAmounts[itemId];
        totalInvoicedQuantity = invoicedData.invoices.reduce((sum, inv) => sum + inv.quantity, 0);
        totalInvoicedValue = invoicedData.totalInvoiced;
        
        // Dla faktury korygującej - pokazuj zafakturowane ilości, nie pozostałe
        if (invoice.isCorrectionInvoice) {
          // Dla korekty: ilość = to co zostało zafakturowane (bo to korygujemy)
          remainingQuantity = totalInvoicedQuantity;
          remainingValue = totalInvoicedValue;
        } else {
          // Dla zwykłej faktury: ilość = to co pozostało do zafakturowania
          remainingQuantity = Math.max(0, parseFloat(item.quantity || 0) - totalInvoicedQuantity);
          remainingValue = Math.max(0, (parseFloat(item.quantity || 0) * finalPrice) - totalInvoicedValue);
        }
        
        invoicedInfo = {
          totalInvoicedQuantity: totalInvoicedQuantity,
          totalInvoicedValue: totalInvoicedValue,
          invoices: invoicedData.invoices
        };
        
        console.log(`Pozycja ${item.name}: Zamówienie: ${item.quantity}, Zafakturowano: ${totalInvoicedQuantity}, ${invoice.isCorrectionInvoice ? 'Do korekty' : 'Pozostało'}: ${remainingQuantity}`);
      }

      // Dla faktury korygującej - pozycja jest "dostępna" jeśli coś zostało zafakturowane
      const isAvailableForCorrection = invoice.isCorrectionInvoice && totalInvoicedQuantity > 0;
      
      return {
        ...item,
        price: finalPrice,
        quantity: remainingQuantity, // Dla korekty: zafakturowana ilość, dla zwykłej: pozostała ilość
        netValue: remainingValue, // Dla korekty: zafakturowana wartość, dla zwykłej: pozostała wartość
        originalQuantity: parseFloat(item.quantity || 0), // Zachowaj oryginalną ilość z zamówienia
        originalValue: parseFloat(item.quantity || 0) * finalPrice, // Zachowaj oryginalną wartość
        selected: false, // Domyślnie nie zaznaczone
        hasProforma: hasProforma, // Czy ma już proformę (dla proform)
        proformaInfo: proformaInfo, // Informacje o istniejącej proformie (dla proform)
        invoicedInfo: invoicedInfo, // Informacje o zafakturowanych ilościach (dla zwykłych faktur)
        isFullyInvoiced: !invoice.isProforma && !invoice.isCorrectionInvoice && remainingQuantity <= 0, // Dla zwykłych faktur
        isAvailableForCorrection: isAvailableForCorrection, // Dla faktur korygujących - czy coś zafakturowano
        // Dla korekty: pole do wpisania nowej ilości (domyślnie = zafakturowana)
        correctionNewQuantity: invoice.isCorrectionInvoice ? totalInvoicedQuantity : null,
        correctionNewValue: invoice.isCorrectionInvoice ? totalInvoicedValue : null
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
    
    // WALIDACJA: Sprawdź czy wybrane pozycje są w pełni zafakturowane (NIE dla faktur korygujących!)
    if (!invoice.isProforma && !invoice.isCorrectionInvoice) {
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
    
    // WALIDACJA dla faktury korygującej: Sprawdź czy wybrane pozycje mają coś do skorygowania
    if (invoice.isCorrectionInvoice) {
      const itemsWithoutInvoice = selectedItems.filter(item => !item.isAvailableForCorrection);
      
      if (itemsWithoutInvoice.length > 0) {
        const itemNames = itemsWithoutInvoice.map(item => item.name).join(', ');
        showError(
          `Nie można skorygować pozycji: ${itemNames}. ` +
          `${itemsWithoutInvoice.length === 1 ? 'Ta pozycja nie została' : 'Te pozycje nie zostały'} jeszcze zafakturowane.`
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
    
    // Dla faktury korygującej - zbierz informacje o korygowanych fakturach
    let correctedInvoicesFromItems = [];
    if (invoice.isCorrectionInvoice) {
      const invoicesMap = new Map();
      selectedItems.forEach(item => {
        if (item.invoicedInfo?.invoices) {
          item.invoicedInfo.invoices.forEach(inv => {
            if (!invoicesMap.has(inv.invoiceId)) {
              invoicesMap.set(inv.invoiceId, {
                invoiceId: inv.invoiceId,
                invoiceNumber: inv.invoiceNumber
              });
            }
          });
        }
      });
      correctedInvoicesFromItems = Array.from(invoicesMap.values());
    }
    
    // Dodaj wybrane pozycje do faktury
    const newItems = selectedItems.map(item => {
      // Dla faktury korygującej - oblicz różnicę między nową a zafakturowaną wartością
      if (invoice.isCorrectionInvoice) {
        const invoicedQuantity = item.invoicedInfo?.totalInvoicedQuantity || 0;
        const invoicedValue = item.invoicedInfo?.totalInvoicedValue || 0;
        // Nowa ilość/wartość to ta z kosztu produkcji (już obliczona jako finalPrice * originalQuantity)
        const productionValue = item.originalQuantity * item.price;
        
        // Korekta = nowa wartość (koszt produkcji) - zafakturowana wartość
        const correctionValue = productionValue - invoicedValue;
        
        // Oblicz cenę jednostkową korekty tak, aby ilość × cena = wartość korekty
        // (zachowujemy ilość z CO, a cena = korekta / ilość)
        const correctionUnitPrice = item.originalQuantity > 0 
          ? correctionValue / item.originalQuantity 
          : correctionValue;
        
        return {
          id: item.id || '',
          orderItemId: item.id,
          name: item.name,
          description: `Correction (${correctionValue >= 0 ? '+' : ''}${correctionValue.toFixed(2)} ${invoice.currency || 'EUR'})`,
          quantity: item.originalQuantity, // Ilość z pozycji CO (zamówienia klienta)
          unit: item.unit || 'szt.',
          price: parseFloat(correctionUnitPrice.toFixed(4)), // Cena jednostkowa korekty (wartość korekty / ilość)
          netValue: parseFloat(correctionValue.toFixed(2)), // Wartość korekty (różnica między kosztem produkcji a zafakturowaną wartością)
          vat: item.vat || 0,
          cnCode: item.cnCode || '',
          // Dodatkowe dane dla korekty
          originalInvoicedQuantity: invoicedQuantity,
          originalInvoicedValue: invoicedValue,
          productionQuantity: item.originalQuantity,
          productionValue: productionValue,
          productionUnitPrice: item.price, // Oryginalny koszt produkcji jednostkowy
          sourceInvoices: item.invoicedInfo?.invoices || []
        };
      }
      
      // Dla zwykłych faktur - standardowe mapowanie
      return {
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
      };
    });
    
    setInvoice(prev => ({
      ...prev,
      items: [...prev.items, ...newItems],
      // Dla faktury korygującej - zapisz powiązane faktury
      ...(invoice.isCorrectionInvoice && {
        correctedInvoices: [
          ...(prev.correctedInvoices || []),
          ...correctedInvoicesFromItems.filter(
            newInv => !prev.correctedInvoices?.some(existing => existing.invoiceId === newInv.invoiceId)
          )
        ]
      })
    }));
    
    setOrderItemsDialogOpen(false);
    showSuccess(`Dodano ${selectedItems.length} pozycji ${invoice.isCorrectionInvoice ? 'do korekty' : 'z zamówienia'}`);
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
      // Zamówienia dla klienta są pobierane automatycznie przez useEffect
      // który reaguje na zmianę invoice.customer?.id
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

  // Funkcja do automatycznego utworzenia faktury korygującej z przekierowania z CO
  const handleCorrectionInvoiceFromOrder = async (preselectedOrder) => {
    try {
      setLoading(true);
      console.log('[handleCorrectionInvoiceFromOrder] Tworzenie FK dla zamówienia:', preselectedOrder.id);
      
      // Ustaw typ faktury na korektę
      setInvoice(prev => ({
        ...prev,
        isCorrectionInvoice: true,
        isProforma: false,
        isRefInvoice: false
      }));
      
      // Ustaw zamówienie bezpośrednio (mamy już dane z przekierowania)
      setSelectedOrderId(preselectedOrder.id);
      setSelectedOrderType('customer');
      setSelectedOrder(preselectedOrder);
      setFilteredOrders([preselectedOrder]); // Ustaw to zamówienie jako dostępne
      setOrders([preselectedOrder]);
      
      // Pobierz dane klienta
      if (preselectedOrder.customer?.id) {
        const customer = await getCustomerById(preselectedOrder.customer.id);
        if (customer) {
          setInvoice(prev => ({
            ...prev,
            isCorrectionInvoice: true,
            customer: {
              id: customer.id,
              name: customer.name || customer.companyName || '',
              companyName: customer.companyName || '',
              email: customer.email || '',
              phone: customer.phone || '',
              taxId: customer.taxId || '',
              address: customer.address || ''
            },
            orderId: preselectedOrder.id,
            orderNumber: preselectedOrder.orderNumber || preselectedOrder.number,
            currency: preselectedOrder.currency || 'EUR'
          }));
        }
      }
      
      // Pobierz informacje o zafakturowanych ilościach dla wszystkich pozycji
      const invoicedAmounts = await getInvoicedAmountsByOrderItems(preselectedOrder.id);
      
      // Przygotuj pozycje do korekty - wszystkie pozycje z zamówienia
      const itemsWithInvoicedInfo = (preselectedOrder.items || []).map((item, index) => {
        const itemId = item.id || `${preselectedOrder.id}_item_${index}`;
        const invoicedInfo = invoicedAmounts[itemId] || { totalInvoiced: 0, invoices: [] };
        
        // Oblicz koszt produkcji (cenę jednostkową)
        const productionUnitCost = calculateTotalUnitCost(item, preselectedOrder);
        
        // Oblicz łączną zafakturowaną ilość z wszystkich faktur
        const totalInvoicedQuantity = invoicedInfo.invoices?.reduce((sum, inv) => sum + (inv.quantity || 0), 0) || 0;
        
        return {
          ...item,
          id: itemId,
          originalQuantity: item.quantity,
          price: productionUnitCost, // Cena = koszt produkcji
          invoicedInfo: {
            totalInvoicedQuantity: totalInvoicedQuantity,
            totalInvoicedValue: invoicedInfo.totalInvoiced || 0,
            invoices: invoicedInfo.invoices || []
          },
          // Zaznacz jako wybraną
          selected: true
        };
      });
      
      // Przetwórz pozycje na pozycje faktury korygującej
      const correctionInvoiceItems = itemsWithInvoicedInfo.map(item => {
        const invoicedValue = item.invoicedInfo?.totalInvoicedValue || 0;
        const productionValue = item.originalQuantity * item.price;
        const correctionValue = productionValue - invoicedValue;
        
        // Oblicz cenę jednostkową korekty
        const correctionUnitPrice = item.originalQuantity > 0 
          ? correctionValue / item.originalQuantity 
          : correctionValue;
        
        return {
          id: item.id || '',
          orderItemId: item.id,
          name: item.name,
          description: `Correction (${correctionValue >= 0 ? '+' : ''}${correctionValue.toFixed(2)} ${preselectedOrder.currency || 'EUR'})`,
          quantity: item.originalQuantity,
          unit: item.unit || 'szt.',
          price: parseFloat(correctionUnitPrice.toFixed(4)),
          netValue: parseFloat(correctionValue.toFixed(2)),
          vat: item.vat || 0,
          cnCode: item.cnCode || '',
          originalQuantity: item.originalQuantity,
          invoicedInfo: item.invoicedInfo,
          productionCost: item.productionCost
        };
      });
      
      // Zbierz informacje o korygowanych fakturach
      const correctedInvoicesSet = new Map();
      itemsWithInvoicedInfo.forEach(item => {
        if (item.invoicedInfo?.invoices) {
          item.invoicedInfo.invoices.forEach(inv => {
            if (!correctedInvoicesSet.has(inv.invoiceId)) {
              correctedInvoicesSet.set(inv.invoiceId, {
                invoiceId: inv.invoiceId,
                invoiceNumber: inv.invoiceNumber
              });
            }
          });
        }
      });
      
      // Ustaw pozycje faktury korygującej
      setInvoice(prev => ({
        ...prev,
        isCorrectionInvoice: true,
        items: correctionInvoiceItems,
        correctedInvoices: Array.from(correctedInvoicesSet.values()),
        correctionReason: ''
      }));
      
      // Pobierz powiązane faktury
      await fetchRelatedInvoices(preselectedOrder.id);
      
      showSuccess(t('invoices.form.notifications.correctionItemsLoaded') || 'Załadowano pozycje do korekty');
    } catch (error) {
      console.error('[handleCorrectionInvoiceFromOrder] Błąd:', error);
      showError('Nie udało się utworzyć faktury korygującej: ' + error.message);
    } finally {
      setLoading(false);
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
              const itemPrice = parseFloat(item.totalPrice || (item.unitPrice * item.quantity)) || 0;
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
        
        // Mapowanie pozycji z PO - używaj bezpośrednio unitPrice z PO
        const mappedPOItems = (selectedOrder.items || []).map(item => {
          // Dla PO używamy bezpośrednio unitPrice lub obliczamy z totalPrice
          const finalPrice = parseFloat(item.unitPrice || 0) || 
                           (parseFloat(item.totalPrice || 0) / parseFloat(item.quantity || 1));
          
          console.log(`Faktura PO: ${item.name}, unitPrice: ${item.unitPrice}, finalPrice: ${finalPrice.toFixed(2)}€`);

          return {
            ...item,
            price: finalPrice,
            totalPrice: parseFloat(item.quantity || 0) * finalPrice
          };
        });

        // Mapowanie dodatkowych kosztów z PO jako pozycje faktury
        const mappedAdditionalCostsItems = [];
        if (selectedOrder.additionalCostsItems && Array.isArray(selectedOrder.additionalCostsItems)) {
          selectedOrder.additionalCostsItems.forEach((cost, index) => {
            const costValue = parseFloat(cost.value) || 0;
            const vatRate = typeof cost.vatRate === 'number' ? cost.vatRate : 0;
            
            if (costValue > 0) {
              mappedAdditionalCostsItems.push({
                id: cost.id || `additional-cost-${index}`,
                name: cost.description || `Dodatkowy koszt ${index + 1}`,
                description: '', // Opis pozostaje pusty dla dodatkowych kosztów
                quantity: 1,
                unit: 'szt.',
                price: costValue,
                netValue: costValue,
                totalPrice: costValue,
                vat: vatRate,
                cnCode: '',
                isAdditionalCost: true, // Flaga identyfikująca dodatkowe koszty
                originalCostId: cost.id
              });
              console.log(`Dodatkowy koszt jako pozycja faktury: ${cost.description || `Koszt ${index + 1}`}, wartość: ${costValue}, VAT: ${vatRate}%`);
            }
          });
        } else if (selectedOrder.additionalCosts && parseFloat(selectedOrder.additionalCosts) > 0) {
          // Dla wstecznej kompatybilności - stary format
          const costValue = parseFloat(selectedOrder.additionalCosts) || 0;
          mappedAdditionalCostsItems.push({
            id: 'additional-cost-legacy',
            name: 'Dodatkowe koszty',
            description: '', // Opis pozostaje pusty dla dodatkowych kosztów
            quantity: 1,
            unit: 'szt.',
            price: costValue,
            netValue: costValue,
            totalPrice: costValue,
            vat: 0,
            cnCode: '',
            isAdditionalCost: true
          });
        }

        // Połącz pozycje produktów z pozycjami dodatkowych kosztów
        const allInvoiceItems = [...mappedPOItems, ...mappedAdditionalCostsItems];

        const invoiceData = {
          // Dla refaktur nie nadpisuj customer - pozostaw wybranego klienta
          // Dla zwykłych faktur zakupowych użyj dostawcy jako "customer"
          ...(invoice.isRefInvoice ? {} : {
            customer: {
              id: selectedOrder.supplier?.id || '',
              name: selectedOrder.supplier?.name || '',
              email: selectedOrder.supplier?.email || '',
              phone: selectedOrder.supplier?.phone || '',
              address: selectedOrder.supplier?.address || '',
              vatEu: selectedOrder.supplier?.vatEu || ''
            },
            billingAddress: selectedOrder.supplier?.address || '',
            shippingAddress: selectedOrder.deliveryAddress || ''
          }),
          items: allInvoiceItems, // Używamy wszystkich pozycji: produkty + dodatkowe koszty
          orderNumber: selectedOrder.number,
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
    // Sprawdź czy klient jest wybrany (wymagane dla wszystkich faktur)
    if (!invoice.customer?.id) {
      showError('Wybierz klienta dla faktury');
      return false;
    }
    
    // Dla refaktur sprawdź czy wybrano PO
    if (invoice.isRefInvoice && !selectedOrderId) {
      showError('Wybierz zamówienie zakupowe (PO) dla refaktury');
      return false;
    }
    
    // Sprawdź czy są pozycje faktury
    if (!invoice.items || invoice.items.length === 0) {
      showError('Dodaj przynajmniej jedną pozycję do faktury');
      return false;
    }
    
    // Sprawdź czy wszystkie pozycje mają uzupełnione dane
    // Dla faktury korygującej dozwolone są ujemne ceny i ilości (korekta w dół)
    const invalidItems = invoice.items.some(item => {
      if (!item.name) return true;
      if (isNaN(item.quantity)) return true;
      if (isNaN(item.price)) return true;
      
      // Dla faktury korygującej - dozwolone ujemne wartości
      if (invoice.isCorrectionInvoice) {
        // Ilość musi być > 0 (ilość z CO)
        if (item.quantity <= 0) return true;
        // Cena może być ujemna (korekta w dół) lub dodatnia (korekta w górę)
        return false;
      }
      
      // Dla zwykłych faktur - standardowa walidacja
      if (item.quantity <= 0) return true;
      if (item.price < 0) return true;
      
      return false;
    });
    
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
        
        // POPRAWKA: Użyj preciseCompare zamiast dodawania tolerancji do limitu
        // Tolerancja dla różnic zaokrągleń (1 grosz = 0.01)
        const tolerance = 0.01;
        const exceedsLimit = preciseCompare(allocation.amount, proforma.amountInfo.available, tolerance) > 0;
        if (exceedsLimit) {
          showError(`Kwota do rozliczenia z proformy ${allocation.proformaNumber} (${allocation.amount.toFixed(2)}) przekracza dostępną kwotę (${proforma.amountInfo.available.toFixed(2)})`);
          return false;
        }
      }
    }
    
    // Compatibility: sprawdź stary system selectedProformaId
    else if (!invoice.isProforma && invoice.settledAdvancePayments > 0 && invoice.selectedProformaId) {
      if (availableProformaAmount) {
        const tolerance = 0.01;
        const exceedsLimit = preciseCompare(invoice.settledAdvancePayments, availableProformaAmount.available, tolerance) > 0;
        if (exceedsLimit) {
          const selectedProforma = availableProformas.find(p => p.id === invoice.selectedProformaId);
          const proformaNumber = selectedProforma?.number || 'nieznana';
          showError(`Kwota zaliczek (${invoice.settledAdvancePayments}) przekracza dostępną kwotę z proformy ${proformaNumber} (${availableProformaAmount.available.toFixed(2)})`);
          return false;
        }
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
            value={invoice.isCorrectionInvoice ? 'correction' : (invoice.isProforma ? 'proforma' : 'faktura')}
            exclusive
            onChange={(event, newValue) => {
              if (newValue !== null) {
                const isProforma = newValue === 'proforma';
                const isCorrectionInvoice = newValue === 'correction';
                
                // Reset innych flag przy zmianie typu
                setInvoice(prev => ({
                  ...prev,
                  isProforma: isProforma,
                  isCorrectionInvoice: isCorrectionInvoice,
                  // Wyczyść dane refaktury i korekty przy zmianie typu
                  isRefInvoice: false,
                  correctedInvoices: isCorrectionInvoice ? prev.correctedInvoices : [],
                  correctionReason: isCorrectionInvoice ? prev.correctionReason : ''
                }));
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
            <ToggleButton value="correction" aria-label="korekta" sx={{ 
              '&.Mui-selected': { 
                backgroundColor: 'error.main !important',
                '&:hover': { backgroundColor: 'error.dark !important' }
              }
            }}>
              📝 {t('invoices.form.toggleButtons.correction')}
            </ToggleButton>
          </ToggleButtonGroup>
          
          {/* Opcja refaktury dostępna tylko dla zwykłych faktur (nie proforma, nie korekta) */}
          {!invoice.isProforma && !invoice.isCorrectionInvoice && (
            <Box 
              sx={{ 
                mt: 2, 
                p: 1.5, 
                border: '1px solid',
                borderColor: invoice.isRefInvoice ? 'rgba(156, 39, 176, 0.5)' : 'rgba(255, 255, 255, 0.12)',
                borderRadius: 1,
                backgroundColor: invoice.isRefInvoice ? 'rgba(156, 39, 176, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                '&:hover': {
                  borderColor: 'rgba(156, 39, 176, 0.4)',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)'
                }
              }}
              onClick={() => {
                handleChange({
                  target: {
                    name: 'isRefInvoice',
                    type: 'checkbox',
                    checked: !invoice.isRefInvoice
                  }
                });
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box 
                  sx={{ 
                    fontSize: '1.2rem',
                    display: 'flex',
                    alignItems: 'center',
                    opacity: 0.8
                  }}
                >
                  🔄
                </Box>
                <Box>
                  <Typography 
                    variant="body2" 
                    fontWeight="500"
                    sx={{ 
                      color: invoice.isRefInvoice ? 'secondary.light' : 'text.primary'
                    }}
                  >
                    Refaktura (wybór z PO)
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
                    Faktura dla klienta bazująca na zamówieniu zakupowym
                  </Typography>
                </Box>
              </Box>
              <Switch
                checked={invoice.isRefInvoice || false}
                onChange={(e) => {
                  e.stopPropagation();
                  handleChange({
                    target: {
                      name: 'isRefInvoice',
                      type: 'checkbox',
                      checked: e.target.checked
                    }
                  });
                }}
                color="secondary"
                size="small"
                onClick={(e) => e.stopPropagation()}
              />
            </Box>
          )}
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
                    value={invoice.selectedBankAccount || ''}
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
                      {typeof invoice.customer.name === 'string' ? invoice.customer.name : 'Brak nazwy'}
                    </Typography>
                    {invoice.customer?.email && typeof invoice.customer.email === 'string' && invoice.customer.email.trim() !== '' && (
                      <Typography variant="body2" gutterBottom>
                        Email: {invoice.customer.email}
                      </Typography>
                    )}
                    {invoice.customer?.phone && typeof invoice.customer.phone === 'string' && invoice.customer.phone.trim() !== '' && (
                      <Typography variant="body2" gutterBottom>
                        Telefon: {invoice.customer.phone}
                      </Typography>
                    )}
                    {invoice.customer?.vatEu && typeof invoice.customer.vatEu === 'string' && invoice.customer.vatEu.trim() !== '' && (
                      <Typography variant="body2" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                        VAT-EU: {invoice.customer.vatEu}
                      </Typography>
                    )}
                    {invoice.billingAddress && typeof invoice.billingAddress === 'string' && invoice.billingAddress.trim() !== '' && (
                      <Typography variant="body2" gutterBottom>
                        Adres do faktury: {invoice.billingAddress}
                      </Typography>
                    )}
                    {invoice.shippingAddress && typeof invoice.shippingAddress === 'string' && invoice.shippingAddress.trim() !== '' && (
                      <Typography variant="body2" gutterBottom>
                        Adres dostawy: {invoice.shippingAddress}
                      </Typography>
                    )}
                    
                    <Divider sx={{ my: 2 }} />
                    
                    <Autocomplete
                      fullWidth
                      size="small"
                      sx={mb2}
                      options={selectedOrderType === 'customer' ? filteredOrders : poSearchResults}
                      getOptionLabel={(option) => {
                        if (selectedOrderType === 'customer') {
                          return `${option.orderNumber} - ${option.customer?.name}${option.orderDate ? ` (${option.orderDate.toLocaleDateString()})` : ''}`;
                        } else {
                          return `${option.number} - ${option.supplier?.name} (${option.status})`;
                        }
                      }}
                      value={selectedOrderType === 'customer' 
                        ? filteredOrders.find(order => order.id === selectedOrderId) || null
                        : poSearchResults.find(po => po.id === selectedOrderId) || null
                      }
                      onChange={(event, newValue) => {
                        handleOrderSelect(newValue ? newValue.id : '', selectedOrderType);
                      }}
                      onInputChange={(event, value, reason) => {
                        // Dla PO - aktualizuj wyszukiwanie po stronie serwera
                        if (selectedOrderType === 'purchase' && reason === 'input') {
                          setPoSearchTerm(value);
                        }
                      }}
                      filterOptions={selectedOrderType === 'purchase' 
                        ? (x) => x  // Dla PO - wyłącz lokalne filtrowanie (filtrujemy po stronie serwera)
                        : undefined  // Dla CO - standardowe filtrowanie
                      }
                      loading={ordersLoading || poSearchLoading}
                      disabled={selectedOrderType === 'customer' && filteredOrders.length === 0 && !ordersLoading}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label={selectedOrderType === 'purchase' 
                            ? '🔄 Wyszukaj Zamówienie Zakupowe (PO) dla refaktury'
                            : t('invoices.form.fields.relatedOrder')
                          }
                          placeholder={selectedOrderType === 'purchase' 
                            ? "Wpisz numer PO (min. 2 znaki)..."
                            : "Wyszukaj zamówienie..."
                          }
                          InputProps={{
                            ...params.InputProps,
                            endAdornment: (
                              <>
                                {(ordersLoading || poSearchLoading) ? <CircularProgress color="inherit" size={20} /> : null}
                                {params.InputProps.endAdornment}
                              </>
                            ),
                          }}
                        />
                      )}
                      noOptionsText={
                        selectedOrderType === 'purchase' 
                          ? (poSearchTerm.length < 2 ? "Wpisz min. 2 znaki numeru PO..." : "Brak wyników")
                          : "Brak zamówień do wyświetlenia"
                      }
                      clearText="Wyczyść"
                      closeText="Zamknij"
                      openText="Otwórz"
                    />
                    
                    {selectedOrderId && selectedOrderType === 'purchase' && selectedOrder && (
                      <Card variant="outlined" sx={{ mt: 2, p: 2, bgcolor: 'rgba(156, 39, 176, 0.05)', borderColor: 'secondary.main' }}>
                        <Typography variant="subtitle2" gutterBottom sx={{ color: 'secondary.main', fontWeight: 'bold' }}>
                          🔄 Wybrane PO dla refaktury: {selectedOrder.number}
                        </Typography>
                        <Divider sx={{ my: 1 }} />
                        <Typography variant="body2" gutterBottom>
                          <strong>Dostawca:</strong> {selectedOrder.supplier?.name || 'N/A'}
                        </Typography>
                        <Typography variant="body2" gutterBottom>
                          <strong>Wartość:</strong> {selectedOrder.totalGross ? `${parseFloat(selectedOrder.totalGross).toFixed(2)} ${selectedOrder.currency || 'EUR'}` : 'N/A'}
                        </Typography>
                        <Typography variant="body2">
                          <strong>Status:</strong> {selectedOrder.status}
                        </Typography>
                        {selectedOrder.items && selectedOrder.items.length > 0 && (
                          <Button
                            variant="contained"
                            size="small"
                            color="secondary"
                            sx={mt2}
                            onClick={() => {
                              // Automatycznie dodaj wszystkie pozycje z PO
                              const poItems = selectedOrder.items.map(item => ({
                                name: item.name || '',
                                description: item.description || '',
                                cnCode: item.cnCode || '',
                                quantity: parseFloat(item.quantity || 0),
                                unit: item.unit || 'szt',
                                price: parseFloat(item.unitPrice || 0),
                                vat: parseFloat(item.vatRate ?? 23),
                                netValue: parseFloat(item.totalPrice || 0),
                                grossValue: parseFloat(item.totalPrice || 0) * (1 + parseFloat(item.vatRate ?? 23) / 100),
                                orderItemId: item.id || null
                              }));
                              
                              // Mapowanie dodatkowych kosztów z PO jako pozycje faktury (tak samo jak w handleOrderSelect)
                              const mappedAdditionalCostsItems = [];
                              const additionalCosts = selectedOrder.additionalCostsItems || [];
                              
                              additionalCosts.forEach((cost, index) => {
                                const costValue = parseFloat(cost.value) || 0;
                                const vatRate = typeof cost.vatRate === 'number' ? cost.vatRate : 0;
                                
                                if (costValue > 0) {
                                  mappedAdditionalCostsItems.push({
                                    id: cost.id || `additional-cost-${index}`,
                                    name: cost.description || `Dodatkowy koszt ${index + 1}`,
                                    description: '',
                                    quantity: 1,
                                    unit: 'szt.',
                                    price: costValue,
                                    netValue: costValue,
                                    totalPrice: costValue,
                                    vat: vatRate,
                                    cnCode: '',
                                    isAdditionalCost: true,
                                    originalCostId: cost.id
                                  });
                                }
                              });
                              
                              // Połącz pozycje produktów z pozycjami dodatkowych kosztów
                              const allInvoiceItems = [...poItems, ...mappedAdditionalCostsItems];
                              
                              const totalAdditionalCosts = additionalCosts.reduce(
                                (sum, cost) => sum + (parseFloat(cost.value) || 0), 
                                0
                              );
                              
                              setInvoice(prev => ({
                                ...prev,
                                items: allInvoiceItems, // Wszystkie pozycje: produkty + dodatkowe koszty
                                additionalCostsItems: additionalCosts,
                                additionalCosts: totalAdditionalCosts,
                                total: calculateInvoiceTotalGross({ 
                                  items: allInvoiceItems,
                                  additionalCostsItems: additionalCosts
                                })
                              }));
                              
                              showSuccess(`Dodano ${poItems.length} pozycji${mappedAdditionalCostsItems.length > 0 ? ` i ${mappedAdditionalCostsItems.length} kosztów dodatkowych` : ''} z PO`);
                            }}
                          >
                            Załaduj wszystkie pozycje z PO
                          </Button>
                        )}
                      </Card>
                    )}
                    
                    {selectedOrderId && selectedOrderType === 'customer' && (
                        <Typography variant="body2" color="primary" sx={mt2}>
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
                  {t('invoices.form.fields.grossValue')}: {((item.netValue || (item.quantity * item.price)) * (1 + (typeof item.vat === 'number' || item.vat === 0 ? item.vat : 0) / 100)).toFixed(4)} {invoice.currency || 'EUR'}
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
                // Użyj netValue jeśli jest ustawione (ważne dla faktury korygującej), w przeciwnym razie oblicz
                const netValue = Number(item.netValue) || (Number(item.quantity) || 0) * (Number(item.price) || 0);
                // Zaokrąglij do 4 miejsc (jak w PDF)
                const roundedNetValue = Math.round(netValue * 10000) / 10000;
                return sum + roundedNetValue;
              }, 0).toFixed(2)} {invoice.currency || 'EUR'}
            </Typography>
            <Typography variant="body1" fontWeight="bold">
              {t('invoices.form.fields.totals.vatTotal')} {invoice.items.reduce((sum, item) => {
                // Użyj netValue jeśli jest ustawione (ważne dla faktury korygującej), w przeciwnym razie oblicz
                const netValue = Number(item.netValue) || (Number(item.quantity) || 0) * (Number(item.price) || 0);
                const roundedNetValue = Math.round(netValue * 10000) / 10000;
                
                // Sprawdź czy stawka VAT to liczba czy string "ZW" lub "NP"
                let vatRate = 0;
                if (typeof item.vat === 'number') {
                  vatRate = item.vat;
                } else if (item.vat !== "ZW" && item.vat !== "NP") {
                  vatRate = parseFloat(item.vat) || 0;
                }
                
                // Oblicz VAT z zaokrąglonej wartości netto i zaokrąglij wynik do 4 miejsc
                const vatValue = roundedNetValue * (vatRate / 100);
                const roundedVatValue = Math.round(vatValue * 10000) / 10000;
                
                return sum + roundedVatValue;
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
                                  max: proforma.amountInfo.available
                                }
                              }}
                              error={(() => {
                                // POPRAWKA: Użyj preciseCompare dla walidacji w czasie rzeczywistym
                                const tolerance = 0.01;
                                return preciseCompare(allocatedAmount, proforma.amountInfo.available, tolerance) > 0;
                              })()}
                              helperText={(() => {
                                const tolerance = 0.01;
                                const exceedsLimit = preciseCompare(allocatedAmount, proforma.amountInfo.available, tolerance) > 0;
                                if (exceedsLimit) {
                                  return `${t('invoices.form.fields.exceedsAvailable')} (${proforma.amountInfo.available.toFixed(2)})`;
                                }
                                return `${t('invoices.form.fields.available')}: ${proforma.amountInfo.available.toFixed(2)}`;
                              })()}
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
                    <Box key={relInvoice.id} sx={mb1}>
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
              // Oblicz sumę netto (zaokrąglone składniki)
              const totalNetto = invoice.items.reduce((sum, item) => {
                const netValue = Number(item.netValue) || (Number(item.quantity) || 0) * (Number(item.price) || 0);
                const roundedNetValue = Math.round(netValue * 10000) / 10000;
                return sum + roundedNetValue;
              }, 0);

              // Oblicz sumę VAT (zaokrąglone składniki)
              const totalVat = invoice.items.reduce((sum, item) => {
                const netValue = Number(item.netValue) || (Number(item.quantity) || 0) * (Number(item.price) || 0);
                const roundedNetValue = Math.round(netValue * 10000) / 10000;
                
                let vatRate = 0;
                if (typeof item.vat === 'number') {
                  vatRate = item.vat;
                } else if (item.vat !== "ZW" && item.vat !== "NP") {
                  vatRate = parseFloat(item.vat) || 0;
                }
                
                const vatValue = roundedNetValue * (vatRate / 100);
                const roundedVatValue = Math.round(vatValue * 10000) / 10000;
                return sum + roundedVatValue;
              }, 0);
              
              const bruttoValue = totalNetto + totalVat;
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
      
      {/* Sekcja dla faktury korygującej */}
      {invoice.isCorrectionInvoice && (
        <Paper sx={{ p: 3, mb: 3, border: '2px solid', borderColor: 'error.main', backgroundColor: 'rgba(211, 47, 47, 0.04)' }}>
          <Typography variant="h6" gutterBottom sx={{ color: 'error.main', display: 'flex', alignItems: 'center', gap: 1 }}>
            📝 {t('invoices.form.toggleButtons.correction')}
          </Typography>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={2}
                label={t('invoices.form.fields.correctionReason')}
                name="correctionReason"
                value={invoice.correctionReason || ''}
                onChange={handleChange}
                placeholder="Np. Wyrównanie kosztów z rzeczywistym kosztem produkcji"
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': { borderColor: 'error.light' },
                    '&:hover fieldset': { borderColor: 'error.main' },
                    '&.Mui-focused fieldset': { borderColor: 'error.main' }
                  }
                }}
              />
            </Grid>
            {invoice.correctedInvoices && invoice.correctedInvoices.length > 0 && (
              <Grid item xs={12}>
                <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
                  {t('invoices.form.fields.correctedInvoices')}:
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {invoice.correctedInvoices.map((inv, index) => (
                    <Chip 
                      key={inv.invoiceId || index}
                      label={inv.invoiceNumber}
                      size="small"
                      color="error"
                      variant="outlined"
                      onDelete={() => {
                        setInvoice(prev => ({
                          ...prev,
                          correctedInvoices: prev.correctedInvoices.filter(i => i.invoiceId !== inv.invoiceId)
                        }));
                      }}
                    />
                  ))}
                </Box>
              </Grid>
            )}
          </Grid>
        </Paper>
      )}

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
            <Typography variant="body1" align="center" sx={mt2}>
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
            <Typography variant="h6" sx={{ color: invoice.isCorrectionInvoice ? 'error.main' : 'inherit' }}>
              {invoice.isCorrectionInvoice 
                ? `📝 Wybierz pozycje do korekty - ${selectedOrder?.orderNumber}`
                : `${t('invoices.form.buttons.selectFromOrder')} ${selectedOrder?.orderNumber}`
              }
            </Typography>
            <Button
              variant="outlined"
              size="small"
              color={invoice.isCorrectionInvoice ? 'error' : 'primary'}
              onClick={handleSelectAllOrderItems}
            >
              {availableOrderItems.every(item => item.selected) ? t('invoices.form.buttons.deselectAll') : t('invoices.form.buttons.selectAll')}
            </Button>
          </Box>
          {invoice.isCorrectionInvoice && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Wybierz pozycje do korekty. Korekta zostanie obliczona jako różnica między kosztem produkcji a zafakturowaną wartością.
            </Typography>
          )}
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
                  <TableCell align="right">
                    {invoice.isCorrectionInvoice ? 'Zafakturowano' : t('invoices.form.fields.quantity')}
                  </TableCell>
                  <TableCell>{t('invoices.form.fields.unit')}</TableCell>
                  <TableCell align="right">{t('common.price')}</TableCell>
                  <TableCell align="right">
                    {invoice.isCorrectionInvoice ? 'Wart. zafakturowana' : t('invoices.form.fields.netValue')}
                  </TableCell>
                  {invoice.isCorrectionInvoice && <TableCell align="right" sx={{ color: 'success.main' }}>Production cost</TableCell>}
                  {invoice.isCorrectionInvoice && <TableCell align="right" sx={{ color: 'error.main' }}>Correction</TableCell>}
                  {!invoice.isProforma && !invoice.isCorrectionInvoice && <TableCell align="right">Zafakturowano</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {availableOrderItems.map((item, index) => {
                  // Dla faktury korygującej - pozycja jest dostępna jeśli została zafakturowana
                  const isDisabledForCorrection = invoice.isCorrectionInvoice && !item.isAvailableForCorrection;
                  const isDisabled = (invoice.isProforma && item.hasProforma) || 
                                    (!invoice.isCorrectionInvoice && item.isFullyInvoiced) ||
                                    isDisabledForCorrection;
                  
                  return (
                  <TableRow 
                    key={index}
                    hover={!isDisabled}
                    sx={{ 
                      '&:hover': { 
                        backgroundColor: isDisabled ? 'inherit' : 'action.hover' 
                      },
                      backgroundColor: item.selected ? (invoice.isCorrectionInvoice ? 'rgba(211, 47, 47, 0.12)' : 'action.selected') : 
                                      item.hasProforma ? 'error.light' :
                                      item.isFullyInvoiced && !invoice.isCorrectionInvoice ? 'grey.200' :
                                      isDisabledForCorrection ? 'grey.200' :
                                      'inherit',
                      opacity: isDisabled ? 0.6 : 1
                    }}
                  >
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={item.selected}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleToggleOrderItem(index);
                        }}
                        disabled={isDisabled}
                        color={invoice.isCorrectionInvoice ? 'error' : 'primary'}
                      />
                    </TableCell>
                    <TableCell 
                      onClick={() => !isDisabled && handleToggleOrderItem(index)}
                      sx={{ cursor: isDisabled ? 'not-allowed' : 'pointer' }}
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
                        {item.isFullyInvoiced && !invoice.isCorrectionInvoice && (
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
                        {invoice.isCorrectionInvoice && item.isAvailableForCorrection && (
                          <Chip 
                            label="Available for correction" 
                            color="error" 
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: '0.7rem' }}
                          />
                        )}
                        {isDisabledForCorrection && (
                          <Chip 
                            label="Nie zafakturowane" 
                            color="default" 
                            size="small"
                            sx={{ fontSize: '0.7rem' }}
                          />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell 
                      onClick={() => !isDisabled && handleToggleOrderItem(index)}
                      sx={{ cursor: isDisabled ? 'not-allowed' : 'pointer' }}
                    >
                      {item.description || '-'}
                    </TableCell>
                    <TableCell 
                      onClick={() => !isDisabled && handleToggleOrderItem(index)}
                      sx={{ cursor: isDisabled ? 'not-allowed' : 'pointer' }}
                    >
                      {item.cnCode || '-'}
                    </TableCell>
                    <TableCell 
                      align="right"
                      onClick={() => !isDisabled && handleToggleOrderItem(index)}
                      sx={{ cursor: isDisabled ? 'not-allowed' : 'pointer' }}
                    >
                      {item.quantity}
                    </TableCell>
                    <TableCell 
                      onClick={() => !isDisabled && handleToggleOrderItem(index)}
                      sx={{ cursor: isDisabled ? 'not-allowed' : 'pointer' }}
                    >
                      {item.unit || 'szt.'}
                    </TableCell>
                    <TableCell 
                      align="right"
                      onClick={() => !isDisabled && handleToggleOrderItem(index)}
                      sx={{ cursor: isDisabled ? 'not-allowed' : 'pointer' }}
                    >
                      {item.price?.toFixed(4)} {invoice.currency || 'EUR'}
                    </TableCell>
                    <TableCell 
                      align="right"
                      onClick={() => !isDisabled && handleToggleOrderItem(index)}
                      sx={{ cursor: isDisabled ? 'not-allowed' : 'pointer' }}
                    >
                      {item.netValue?.toFixed(4)} {invoice.currency || 'EUR'}
                    </TableCell>
                    
                    {/* Kolumna Koszt produkcji - tylko dla korekty */}
                    {invoice.isCorrectionInvoice && (
                      <TableCell align="right" sx={{ color: 'success.main' }}>
                        {item.originalValue?.toFixed(4)} {invoice.currency || 'EUR'}
                      </TableCell>
                    )}
                    
                    {/* Kolumna Korekta - tylko dla korekty */}
                    {invoice.isCorrectionInvoice && (
                      <TableCell align="right">
                        {item.invoicedInfo ? (() => {
                          const productionValue = item.originalQuantity * item.price;
                          const invoicedValue = item.invoicedInfo.totalInvoicedValue || 0;
                          const correctionValue = productionValue - invoicedValue;
                          const isPositive = correctionValue >= 0;
                          return (
                            <Tooltip
                              title={
                                <Box>
                                  <Typography variant="caption" sx={{ display: 'block' }}>
                                    Koszt produkcji: {productionValue.toFixed(4)} {invoice.currency || 'EUR'}
                                  </Typography>
                                  <Typography variant="caption" sx={{ display: 'block' }}>
                                    Zafakturowano: {invoicedValue.toFixed(4)} {invoice.currency || 'EUR'}
                                  </Typography>
                                  <Divider sx={{ my: 0.5, borderColor: 'white' }} />
                                  <Typography variant="caption" sx={{ display: 'block', fontWeight: 'bold' }}>
                                    Correction: {correctionValue >= 0 ? '+' : ''}{correctionValue.toFixed(4)} {invoice.currency || 'EUR'}
                                  </Typography>
                                </Box>
                              }
                              arrow
                            >
                              <Typography 
                                variant="body2" 
                                sx={{ 
                                  fontWeight: 'bold',
                                  color: isPositive ? 'success.main' : 'error.main',
                                  cursor: 'help'
                                }}
                              >
                                {isPositive ? '+' : ''}{correctionValue.toFixed(4)} {invoice.currency || 'EUR'}
                              </Typography>
                            </Tooltip>
                          );
                        })() : '-'}
                      </TableCell>
                    )}
                    
                    {/* Kolumna Zafakturowano - dla zwykłych faktur (nie korekty) */}
                    {!invoice.isProforma && !invoice.isCorrectionInvoice && (
                      <TableCell align="right">
                        {item.invoicedInfo ? (
                          <Tooltip
                            title={
                              <Box>
                                <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                                  Zamówienie: {item.originalQuantity} {item.unit || 'szt.'} = {item.originalValue?.toFixed(4)} {invoice.currency || 'EUR'}
                                </Typography>
                                <Typography variant="caption" sx={{ display: 'block' }}>
                                  Zafakturowano: {item.invoicedInfo.totalInvoicedQuantity} {item.unit || 'szt.'} = {item.invoicedInfo.totalInvoicedValue?.toFixed(4)} {invoice.currency || 'EUR'}
                                </Typography>
                                <Typography variant="caption" sx={{ display: 'block', mt: 1, fontWeight: 'bold' }}>
                                  Pozostało: {item.quantity} {item.unit || 'szt.'} = {item.netValue?.toFixed(4)} {invoice.currency || 'EUR'}
                                </Typography>
                                <Divider sx={{ my: 1, borderColor: 'white' }} />
                                {item.invoicedInfo.invoices.map((inv, idx) => (
                                  <Typography key={idx} variant="caption" sx={{ display: 'block' }}>
                                    • {inv.invoiceNumber}: {inv.quantity} {item.unit || 'szt.'} = {inv.itemValue?.toFixed(4)} {invoice.currency || 'EUR'}
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
                                {item.invoicedInfo.totalInvoicedValue?.toFixed(4)} {invoice.currency || 'EUR'}
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
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          
          {availableOrderItems.filter(item => item.selected).length > 0 && (
            <Box sx={{ mt: 2, p: 2, bgcolor: invoice.isCorrectionInvoice ? 'rgba(211, 47, 47, 0.1)' : 'info.light', borderRadius: 1 }}>
              <Typography variant="subtitle2">
                Wybrane pozycje: {availableOrderItems.filter(item => item.selected).length}
              </Typography>
              {invoice.isCorrectionInvoice ? (
                <>
                  <Typography variant="body2">
                    Zafakturowana wartość: {availableOrderItems
                      .filter(item => item.selected)
                      .reduce((sum, item) => sum + (item.invoicedInfo?.totalInvoicedValue || 0), 0)
                      .toFixed(4)} {invoice.currency || 'EUR'}
                  </Typography>
                  <Typography variant="body2">
                    Koszt produkcji: {availableOrderItems
                      .filter(item => item.selected)
                      .reduce((sum, item) => sum + ((item.originalQuantity || 0) * (item.price || 0)), 0)
                      .toFixed(4)} {invoice.currency || 'EUR'}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'error.main', mt: 1 }}>
                    Total correction: {(() => {
                      const total = availableOrderItems
                        .filter(item => item.selected)
                        .reduce((sum, item) => {
                          const productionValue = (item.originalQuantity || 0) * (item.price || 0);
                          const invoicedValue = item.invoicedInfo?.totalInvoicedValue || 0;
                          return sum + (productionValue - invoicedValue);
                        }, 0);
                      return `${total >= 0 ? '+' : ''}${total.toFixed(4)}`;
                    })()} {invoice.currency || 'EUR'}
                  </Typography>
                </>
              ) : (
                <Typography variant="body2">
                  Łączna wartość: {availableOrderItems
                    .filter(item => item.selected)
                    .reduce((sum, item) => sum + (item.netValue || 0), 0)
                    .toFixed(4)} {invoice.currency || 'EUR'}
                </Typography>
              )}
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