import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Paper,
  Grid,
  TextField,
  CircularProgress
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Save as SaveIcon
} from '@mui/icons-material';
import { 
  createInvoice, 
  getInvoiceById, 
  updateInvoice, 
  createInvoiceFromOrder,
  DEFAULT_INVOICE,
  getInvoicesByOrderId,
  calculateTotalUnitCost,
  getInvoicedAmountsByOrderItems
} from '../../services/invoiceService';
import { getAllCustomers, getCustomerById } from '../../services/customerService';
import { getAllOrders } from '../../services/orderService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { formatDateForInput } from '../../utils/dateUtils';
import { preciseCompare } from '../../utils/mathUtils';
import { calculateInvoiceTotalInPLN } from '../../utils/nbpExchangeRates';
import { COMPANY_INFO } from '../../config';
import { getCompanyInfo } from '../../services/companyService';
import { useTranslation } from '../../hooks/useTranslation';
import { CustomerSelectionDialog, OrderItemsSelectionDialog } from './dialogs';
import {
  InvoiceTypeToggle,
  InvoiceBasicInfo,
  CustomerAndOrderSelector,
  InvoiceItemsList,
  InvoiceTotalsSection,
  CorrectionInvoiceSection
} from './form';
import { useInvoiceCalculations, useProformaAllocation, useOrderItemsSelection } from '../../hooks/invoices';

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
  const [refreshingCustomer, setRefreshingCustomer] = useState(false);
  
  // Stany dla faktury korygującej
  const [correctionDialogOpen, setCorrectionDialogOpen] = useState(false);
  const [correctionItems, setCorrectionItems] = useState([]);
  const [loadingCorrectionItems, setLoadingCorrectionItems] = useState(false);

  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  // Extracted hooks
  const {
    calculateTotalWithAdvancePayments,
    handleItemChange,
    handleAddItem,
    handleRemoveItem
  } = useInvoiceCalculations({ invoice, setInvoice, selectedOrder });

  const {
    relatedInvoices,
    loadingRelatedInvoices,
    availableProformaAmount,
    setAvailableProformaAmount,
    availableProformas,
    showAllProformas,
    setShowAllProformas,
    fetchRelatedInvoices,
    handleProformaAllocationChange,
    getTotalAllocatedAmount,
    getFilteredProformas
  } = useProformaAllocation({ invoiceId, invoice, setInvoice });

  const {
    orderItemsDialogOpen,
    setOrderItemsDialogOpen,
    availableOrderItems,
    handleOpenOrderItemsDialog,
    handleToggleOrderItem,
    handleSelectAllOrderItems,
    handleConfirmOrderItemsSelection
  } = useOrderItemsSelection({
    invoice,
    setInvoice,
    selectedOrderId,
    selectedOrder,
    invoiceId,
    showError,
    showSuccess,
    t
  });

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      fetchCustomers();
      
      try {
        const companyData = await getCompanyInfo();
        if (cancelled) return;
        setCompanyInfo(companyData);
      } catch (error) {
        if (cancelled) return;
        console.error('Błąd podczas pobierania danych firmy:', error);
      }
      
      if (cancelled) return;
      if (invoiceId) {
        await fetchInvoice(invoiceId);
      } 
      else if (customerId) {
        await handleCustomerSelect(customerId);
      }
      else if (location.state?.preselectedOrder && location.state?.isCorrectionInvoice) {
        await handleCorrectionInvoiceFromOrder(location.state.preselectedOrder);
      }
    };
    
    init();
    return () => { cancelled = true; };
  }, [invoiceId, customerId]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Efekt do pobierania zamówień po wyborze klienta (filtrowanie po stronie serwera)
  useEffect(() => {
    let cancelled = false;
    const fetchOrdersForCustomer = async () => {
      if (invoice.customer?.id) {
        setOrdersLoading(true);
        try {
          const fetchedOrders = await getAllOrders({ customerId: invoice.customer.id });
          if (cancelled) return;
          
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
          setOrders(ordersWithFormattedDates);
        } catch (error) {
          if (cancelled) return;
          console.error('Błąd podczas pobierania zamówień dla klienta:', error);
          setFilteredOrders([]);
        } finally {
          if (!cancelled) {
            setOrdersLoading(false);
          }
        }
      } else {
        setFilteredOrders([]);
      }
    };
    
    fetchOrdersForCustomer();
    return () => { cancelled = true; };
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
    let cancelled = false;
    if (selectedOrderId && selectedOrderType && !selectedOrder) {
      const isCustomerOrder = selectedOrderType === 'customer';
      const ordersList = isCustomerOrder ? orders : poSearchResults;
      const isLoading = isCustomerOrder ? ordersLoading : poSearchLoading;
      
      if (!isLoading && ordersList.length > 0) {
        if (!cancelled) {
          handleOrderSelect(selectedOrderId, selectedOrderType);
        }
      }
    }
    return () => { cancelled = true; };
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
    let cancelled = false;
    if (!invoice.isRefInvoice || poSearchTerm.length < 2) {
      if (poSearchTerm.length === 0) {
        setPoSearchResults([]);
      }
      return () => { cancelled = true; };
    }

    setPoSearchLoading(true);
    
    const timeoutId = setTimeout(async () => {
      try {
        const { searchPurchaseOrdersByNumber } = await import('../../services/purchaseOrderService');
        const results = await searchPurchaseOrdersByNumber(poSearchTerm);
        if (cancelled) return;
        setPoSearchResults(results);
      } catch (error) {
        if (cancelled) return;
        console.error('Błąd wyszukiwania PO:', error);
        setPoSearchResults([]);
      } finally {
        if (!cancelled) {
          setPoSearchLoading(false);
        }
      }
    }, 300);

    return () => {
      cancelled = true;
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
      showError(t('invoices.form.addAtLeastOneItem'));
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
          showError(t('invoices.form.proformaNotFound', { number: allocation.proformaNumber }));
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
      
      // Wylicz wszystkie kwoty w PLN dla walut obcych (zgodnie z Art. 31a - kurs z dnia poprzedzającego)
      if (invoiceToSubmit.currency && invoiceToSubmit.currency !== 'PLN') {
        try {
          const plnConversion = await calculateInvoiceTotalInPLN(
            invoiceToSubmit.total,
            invoiceToSubmit.currency,
            invoiceToSubmit.issueDate
          );
          
          const exchangeRate = plnConversion.exchangeRate;
          
          // Przelicz total
          invoiceToSubmit.totalInPLN = plnConversion.totalInPLN;
          invoiceToSubmit.exchangeRate = exchangeRate;
          invoiceToSubmit.exchangeRateDate = plnConversion.exchangeRateDate;
          invoiceToSubmit.exchangeRateSource = plnConversion.exchangeRateSource;
          
          // Przelicz pozycje faktury (items)
          if (invoiceToSubmit.items && invoiceToSubmit.items.length > 0) {
            invoiceToSubmit.itemsInPLN = invoiceToSubmit.items.map(item => {
              const unitPrice = parseFloat(item.price || item.unitPrice || 0);
              const quantity = parseFloat(item.quantity || 0);
              const totalPrice = parseFloat(item.totalPrice || (unitPrice * quantity) || 0);
              
              return {
                ...item,
                unitPricePLN: parseFloat((unitPrice * exchangeRate).toFixed(2)),
                totalPricePLN: parseFloat((totalPrice * exchangeRate).toFixed(2))
              };
            });
          }
          
          // Przelicz dodatkowe koszty (additionalCostsItems)
          if (invoiceToSubmit.additionalCostsItems && invoiceToSubmit.additionalCostsItems.length > 0) {
            invoiceToSubmit.additionalCostsItemsInPLN = invoiceToSubmit.additionalCostsItems.map(cost => {
              const value = parseFloat(cost.value || 0);
              
              return {
                ...cost,
                valuePLN: parseFloat((value * exchangeRate).toFixed(2))
              };
            });
          }
          
          // Przelicz zaliczki (settledAdvancePayments)
          if (invoiceToSubmit.settledAdvancePayments && invoiceToSubmit.settledAdvancePayments > 0) {
            invoiceToSubmit.settledAdvancePaymentsInPLN = parseFloat(
              (invoiceToSubmit.settledAdvancePayments * exchangeRate).toFixed(2)
            );
          }
          
          // Przelicz informacje o wysyłce jeśli istnieją
          if (invoiceToSubmit.shippingInfo && invoiceToSubmit.shippingInfo.cost) {
            invoiceToSubmit.shippingInfoInPLN = {
              ...invoiceToSubmit.shippingInfo,
              costPLN: parseFloat((invoiceToSubmit.shippingInfo.cost * exchangeRate).toFixed(2))
            };
          }
          
          console.log(`[Invoice] Przeliczono wszystkie kwoty z ${invoiceToSubmit.currency} na PLN (kurs: ${exchangeRate} z ${plnConversion.exchangeRateDate})`);
          console.log(`  - Total: ${invoiceToSubmit.total} → ${plnConversion.totalInPLN} PLN`);
          console.log(`  - Pozycji: ${invoiceToSubmit.items?.length || 0}`);
          console.log(`  - Kosztów dodatkowych: ${invoiceToSubmit.additionalCostsItems?.length || 0}`);
        } catch (error) {
          console.error('[Invoice] Błąd pobierania kursu NBP:', error);
          showError(`Nie udało się pobrać kursu wymiany z NBP: ${error.message}. Faktura zostanie zapisana bez przeliczenia na PLN.`);
          // Kontynuuj zapisywanie faktury nawet jeśli nie udało się pobrać kursu
        }
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
        navigate('/sales');
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
        <InvoiceTypeToggle
          invoiceId={invoiceId}
          invoice={invoice}
          setInvoice={setInvoice}
          handleChange={handleChange}
          t={t}
        />
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
            <InvoiceBasicInfo
              invoice={invoice}
              invoiceId={invoiceId}
              handleChange={handleChange}
              handleDateChange={handleDateChange}
              companyInfo={companyInfo}
              t={t}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <CustomerAndOrderSelector
              invoice={invoice}
              setInvoice={setInvoice}
              setCustomerDialogOpen={setCustomerDialogOpen}
              refreshingCustomer={refreshingCustomer}
              refreshCustomerData={refreshCustomerData}
              selectedOrderType={selectedOrderType}
              selectedOrderId={selectedOrderId}
              ordersLoading={ordersLoading}
              poSearchLoading={poSearchLoading}
              filteredOrders={filteredOrders}
              poSearchResults={poSearchResults}
              poSearchTerm={poSearchTerm}
              setPoSearchTerm={setPoSearchTerm}
              handleOrderSelect={handleOrderSelect}
              selectedOrder={selectedOrder}
              handleOpenOrderItemsDialog={handleOpenOrderItemsDialog}
              showSuccess={showSuccess}
              t={t}
            />
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <InvoiceItemsList
          invoice={invoice}
          selectedOrder={selectedOrder}
          selectedOrderType={selectedOrderType}
          handleOpenOrderItemsDialog={handleOpenOrderItemsDialog}
          handleAddItem={handleAddItem}
          handleItemChange={handleItemChange}
          handleRemoveItem={handleRemoveItem}
          t={t}
        />

        <InvoiceTotalsSection
          invoice={invoice}
          selectedOrder={selectedOrder}
          availableProformas={availableProformas}
          relatedInvoices={relatedInvoices}
          loadingRelatedInvoices={loadingRelatedInvoices}
          availableProformaAmount={availableProformaAmount}
          handleProformaAllocationChange={handleProformaAllocationChange}
          getTotalAllocatedAmount={getTotalAllocatedAmount}
          getFilteredProformas={getFilteredProformas}
          showAllProformas={showAllProformas}
          setShowAllProformas={setShowAllProformas}
          t={t}
        />
      </Paper>
      
      <CorrectionInvoiceSection
        invoice={invoice}
        setInvoice={setInvoice}
        handleChange={handleChange}
        t={t}
      />

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

      <CustomerSelectionDialog
        open={customerDialogOpen}
        onClose={() => setCustomerDialogOpen(false)}
        customers={customers}
        customersLoading={customersLoading}
        selectedCustomerId={selectedCustomerId}
        onSelectedCustomerChange={setSelectedCustomerId}
        onCustomerSelect={handleCustomerSelect}
        onNavigateToCustomers={() => navigate('/customers')}
        t={t}
      />

      <OrderItemsSelectionDialog
        open={orderItemsDialogOpen}
        onClose={() => setOrderItemsDialogOpen(false)}
        invoice={invoice}
        selectedOrder={selectedOrder}
        availableOrderItems={availableOrderItems}
        onSelectAllOrderItems={handleSelectAllOrderItems}
        onToggleOrderItem={handleToggleOrderItem}
        onConfirmSelection={handleConfirmOrderItemsSelection}
        t={t}
      />
    </Box>
  );
};

export default InvoiceForm; 